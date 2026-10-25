-- ==============================================================================
-- MIGRATION: 20261025_carteira_whatsapp_e_motor_hibrido.sql
-- Módulo: Carteira Pré-Paga (Wallet) e Motor Híbrido de Notificações WhatsApp
-- Governança: supabase-rls-guard, anti-jsonb-linter, pii-leak-detector
-- ==============================================================================

-- 1.1. Alterações na Tabela public.lojas
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS whatsapp_auto_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_saldo NUMERIC(12,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS whatsapp_bonus_expira_em TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  ADD COLUMN IF NOT EXISTS whatsapp_alerta_saldo_baixo NUMERIC(10,2) NOT NULL DEFAULT 5.00;

COMMENT ON COLUMN public.lojas.whatsapp_auto_ativo IS 'Habilita ou desabilita o envio automático de notificações via WhatsApp Cloud API';
COMMENT ON COLUMN public.lojas.whatsapp_saldo IS 'Saldo financeiro pré-pago da carteira de WhatsApp da loja (inicia com R$ 2,00 de bônus de degustação)';
COMMENT ON COLUMN public.lojas.whatsapp_bonus_expira_em IS 'Validade do bônus inicial restrita aos 7 primeiros dias de trial da loja';
COMMENT ON COLUMN public.lojas.whatsapp_alerta_saldo_baixo IS 'Limite financeiro para disparo de alerta visual de saldo acabando';

-- 1.2. Alterações na Tabela Singleton public.configuracoes_plataforma
ALTER TABLE public.configuracoes_plataforma
  ADD COLUMN IF NOT EXISTS custo_disparo_whatsapp NUMERIC(10,2) NOT NULL DEFAULT 0.15 CHECK (custo_disparo_whatsapp >= 0),
  ADD COLUMN IF NOT EXISTS valor_minimo_recarga_whatsapp NUMERIC(10,2) NOT NULL DEFAULT 10.00 CHECK (valor_minimo_recarga_whatsapp > 0),
  ADD COLUMN IF NOT EXISTS credito_bonus_trial_whatsapp NUMERIC(10,2) NOT NULL DEFAULT 2.00 CHECK (credito_bonus_trial_whatsapp >= 0);

COMMENT ON COLUMN public.configuracoes_plataforma.custo_disparo_whatsapp IS 'Tarifa cobrada da carteira do lojista por disparo de template ativo fora da janela de 24h';
COMMENT ON COLUMN public.configuracoes_plataforma.valor_minimo_recarga_whatsapp IS 'Valor mínimo permitido para depósito/recarga da carteira via Pix';
COMMENT ON COLUMN public.configuracoes_plataforma.credito_bonus_trial_whatsapp IS 'Valor de cortesia concedido na criação da loja para degustação de disparos WhatsApp';

-- 1.3. Nova Tabela public.loja_whatsapp_transacoes (Ledger Auditável da Carteira)
CREATE TABLE IF NOT EXISTS public.loja_whatsapp_transacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  usuario_id UUID NULL REFERENCES public.usuarios_loja(id) ON DELETE SET NULL,
  pedido_id UUID NULL REFERENCES public.pedidos(id) ON DELETE SET NULL,
  cliente_id UUID NULL REFERENCES public.clientes(id) ON DELETE SET NULL,
  tipo VARCHAR(25) NOT NULL CHECK (tipo IN ('bonus_inicial', 'recarga_pix', 'consumo_disparo', 'expiracao_bonus', 'estorno')),
  evento_gatilho VARCHAR(40) NULL,
  valor NUMERIC(12,2) NOT NULL,
  saldo_anterior NUMERIC(12,2) NOT NULL,
  saldo_posterior NUMERIC(12,2) NOT NULL,
  mp_payment_id TEXT UNIQUE NULL,
  status_pagamento VARCHAR(25) NOT NULL DEFAULT 'concluido' CHECK (status_pagamento IN ('pendente', 'concluido', 'cancelado')),
  descricao TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loja_whatsapp_transacoes_loja_criado
  ON public.loja_whatsapp_transacoes(loja_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_loja_whatsapp_transacoes_mp_payment
  ON public.loja_whatsapp_transacoes(mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;

COMMENT ON TABLE public.loja_whatsapp_transacoes IS 'Ledger relacional auditável de créditos e consumo de disparos automáticos de WhatsApp por loja';

-- Blindagem RLS Obrigatória (supabase-rls-guard)
ALTER TABLE public.loja_whatsapp_transacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loja_whatsapp_transacoes_select_policy" ON public.loja_whatsapp_transacoes;
DROP POLICY IF EXISTS "loja_whatsapp_transacoes_insert_policy" ON public.loja_whatsapp_transacoes;
DROP POLICY IF EXISTS "loja_whatsapp_transacoes_update_policy" ON public.loja_whatsapp_transacoes;
DROP POLICY IF EXISTS "loja_whatsapp_transacoes_delete_policy" ON public.loja_whatsapp_transacoes;

CREATE POLICY "loja_whatsapp_transacoes_select_policy"
  ON public.loja_whatsapp_transacoes
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

CREATE POLICY "loja_whatsapp_transacoes_insert_policy"
  ON public.loja_whatsapp_transacoes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

CREATE POLICY "loja_whatsapp_transacoes_update_policy"
  ON public.loja_whatsapp_transacoes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
  WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

CREATE POLICY "loja_whatsapp_transacoes_delete_policy"
  ON public.loja_whatsapp_transacoes
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

GRANT ALL ON TABLE public.loja_whatsapp_transacoes TO authenticated, service_role;

-- 1.4. Controle de Janela Receptiva de 24h na Tabela public.clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS whatsapp_ultima_interacao_cliente_em TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_loja_whatsapp_interacao
  ON public.clientes(loja_id, whatsapp_ultima_interacao_cliente_em);

COMMENT ON COLUMN public.clientes.whatsapp_ultima_interacao_cliente_em IS 'Timestamp da última mensagem de entrada (Inbound) enviada pelo cliente ao WhatsApp da loja (janela gratuita de 24h da Meta)';

-- 1.5. RPC Transacional Atômica para Expiração de Bônus e Débito de Disparo
CREATE OR REPLACE FUNCTION public.debitar_saldo_whatsapp_atomico(
  p_loja_id UUID,
  p_valor_tarifa NUMERIC,
  p_evento_gatilho VARCHAR,
  p_descricao TEXT,
  p_pedido_id UUID DEFAULT NULL,
  p_cliente_id UUID DEFAULT NULL,
  p_usuario_id UUID DEFAULT NULL
)
RETURNS TABLE (
  sucesso BOOLEAN,
  motivo VARCHAR,
  saldo_anterior NUMERIC,
  saldo_posterior NUMERIC,
  transacao_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_atual NUMERIC(12,2);
  v_bonus_expira_em TIMESTAMPTZ;
  v_auto_ativo BOOLEAN;
  v_possui_recarga BOOLEAN;
  v_novo_saldo NUMERIC(12,2);
  v_transacao_id UUID;
BEGIN
  -- Trava pessimista na linha da loja para evitar concorrência (race conditions)
  SELECT
    COALESCE(l.whatsapp_saldo, 0.00),
    l.whatsapp_bonus_expira_em,
    COALESCE(l.whatsapp_auto_ativo, FALSE)
  INTO v_saldo_atual, v_bonus_expira_em, v_auto_ativo
  FROM public.lojas l
  WHERE l.id = p_loja_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'loja_nao_encontrada'::VARCHAR, 0.00::NUMERIC, 0.00::NUMERIC, NULL::UUID;
    RETURN;
  END IF;

  -- 1. Verificar se o bônus de 7 dias expirou sem nenhuma recarga paga concluída
  SELECT EXISTS (
    SELECT 1
    FROM public.loja_whatsapp_transacoes t
    WHERE t.loja_id = p_loja_id
      AND t.tipo = 'recarga_pix'
      AND t.status_pagamento = 'concluido'
  ) INTO v_possui_recarga;

  IF NOT v_possui_recarga
     AND v_bonus_expira_em IS NOT NULL
     AND NOW() > v_bonus_expira_em
     AND v_saldo_atual > 0 THEN
    INSERT INTO public.loja_whatsapp_transacoes (
      loja_id,
      tipo,
      evento_gatilho,
      valor,
      saldo_anterior,
      saldo_posterior,
      status_pagamento,
      descricao
    ) VALUES (
      p_loja_id,
      'expiracao_bonus',
      'expiracao_trial_7d',
      -v_saldo_atual,
      v_saldo_atual,
      0.00,
      'concluido',
      'Expiração automática do crédito bônus de degustação (7 dias)'
    );

    UPDATE public.lojas
    SET whatsapp_saldo = 0.00
    WHERE id = p_loja_id;

    v_saldo_atual := 0.00;
  END IF;

  -- 2. Validar automação ativa e saldo disponível
  IF NOT v_auto_ativo THEN
    RETURN QUERY SELECT FALSE, 'automacao_desativada'::VARCHAR, v_saldo_atual, v_saldo_atual, NULL::UUID;
    RETURN;
  END IF;

  IF v_saldo_atual < p_valor_tarifa THEN
    RETURN QUERY SELECT FALSE, 'saldo_insuficiente'::VARCHAR, v_saldo_atual, v_saldo_atual, NULL::UUID;
    RETURN;
  END IF;

  v_novo_saldo := ROUND(v_saldo_atual - p_valor_tarifa, 2);

  UPDATE public.lojas
  SET whatsapp_saldo = v_novo_saldo
  WHERE id = p_loja_id;

  INSERT INTO public.loja_whatsapp_transacoes (
    loja_id,
    usuario_id,
    pedido_id,
    cliente_id,
    tipo,
    evento_gatilho,
    valor,
    saldo_anterior,
    saldo_posterior,
    status_pagamento,
    descricao
  ) VALUES (
    p_loja_id,
    p_usuario_id,
    p_pedido_id,
    p_cliente_id,
    'consumo_disparo',
    p_evento_gatilho,
    -ROUND(p_valor_tarifa, 2),
    v_saldo_atual,
    v_novo_saldo,
    'concluido',
    COALESCE(p_descricao, 'Disparo automático de WhatsApp')
  )
  RETURNING id INTO v_transacao_id;

  RETURN QUERY SELECT TRUE, 'ok'::VARCHAR, v_saldo_atual, v_novo_saldo, v_transacao_id;
END;
$$;

-- 1.6. RPC Transacional Atômica para Confirmação de Recarga via Pix Mercado Pago (Idempotente)
CREATE OR REPLACE FUNCTION public.creditar_recarga_whatsapp_atomico(
  p_loja_id UUID,
  p_valor_recarga NUMERIC,
  p_mp_payment_id TEXT,
  p_transacao_id UUID DEFAULT NULL
)
RETURNS TABLE (
  sucesso BOOLEAN,
  ja_processado BOOLEAN,
  saldo_anterior NUMERIC,
  saldo_posterior NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_atual NUMERIC(12,2);
  v_novo_saldo NUMERIC(12,2);
  v_existente_status VARCHAR;
BEGIN
  -- 1. Verificar idempotência por mp_payment_id já concluído
  IF p_mp_payment_id IS NOT NULL THEN
    SELECT status_pagamento INTO v_existente_status
    FROM public.loja_whatsapp_transacoes
    WHERE mp_payment_id = p_mp_payment_id
      AND status_pagamento = 'concluido'
    LIMIT 1;

    IF FOUND THEN
      SELECT COALESCE(whatsapp_saldo, 0.00) INTO v_saldo_atual
      FROM public.lojas
      WHERE id = p_loja_id;
      RETURN QUERY SELECT TRUE, TRUE, v_saldo_atual, v_saldo_atual;
      RETURN;
    END IF;
  END IF;

  -- 2. Trava pessimista na loja
  SELECT COALESCE(whatsapp_saldo, 0.00)
  INTO v_saldo_atual
  FROM public.lojas
  WHERE id = p_loja_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, FALSE, 0.00::NUMERIC, 0.00::NUMERIC;
    RETURN;
  END IF;

  v_novo_saldo := ROUND(v_saldo_atual + ROUND(p_valor_recarga, 2), 2);

  -- 3. Soma saldo e ativa envio automático
  UPDATE public.lojas
  SET
    whatsapp_saldo = v_novo_saldo,
    whatsapp_auto_ativo = TRUE
  WHERE id = p_loja_id;

  -- 4. Atualiza registro pendente ou insere novo registro concluído
  IF p_transacao_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.loja_whatsapp_transacoes WHERE id = p_transacao_id AND loja_id = p_loja_id
  ) THEN
    UPDATE public.loja_whatsapp_transacoes
    SET
      valor = ROUND(p_valor_recarga, 2),
      saldo_anterior = v_saldo_atual,
      saldo_posterior = v_novo_saldo,
      mp_payment_id = COALESCE(p_mp_payment_id, mp_payment_id),
      status_pagamento = 'concluido',
      descricao = 'Recarga de Créditos WhatsApp via Pix (Aprovada)'
    WHERE id = p_transacao_id;
  ELSE
    INSERT INTO public.loja_whatsapp_transacoes (
      loja_id,
      tipo,
      evento_gatilho,
      valor,
      saldo_anterior,
      saldo_posterior,
      mp_payment_id,
      status_pagamento,
      descricao
    ) VALUES (
      p_loja_id,
      'recarga_pix',
      'recarga_carteira_pix',
      ROUND(p_valor_recarga, 2),
      v_saldo_atual,
      v_novo_saldo,
      p_mp_payment_id,
      'concluido',
      'Recarga de Créditos WhatsApp via Pix (Aprovada)'
    );
  END IF;

  RETURN QUERY SELECT TRUE, FALSE, v_saldo_atual, v_novo_saldo;
END;
$$;
