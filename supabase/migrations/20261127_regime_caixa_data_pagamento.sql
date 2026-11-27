-- ==============================================================================
-- Migration: 20261127_regime_caixa_data_pagamento.sql
-- Objetivo: Migrar apuração financeira, vendas, caixa, estatísticas e cockpit
-- para Regime de Caixa Real baseado em public.pedidos.data_pagamento
-- ==============================================================================

-- 1. Coluna relacional tipada (TIMESTAMPTZ) em public.pedidos + índice composto
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS data_pagamento TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.pedidos.data_pagamento IS 'Data e hora efetiva do recebimento/quitação do pedido (Regime de Caixa Real).';

CREATE INDEX IF NOT EXISTS idx_pedidos_loja_data_pagamento
  ON public.pedidos(loja_id, data_pagamento);

-- 2. Backfill histórico seguro (sem perda de dados)
-- 2.1 Garantir que pagamentos_pedido reais (não a prazo) sem data_pagamento recebam COALESCE(criado_em, NOW())
UPDATE public.pagamentos_pedido
SET data_pagamento = COALESCE(criado_em, NOW())
WHERE data_pagamento IS NULL
  AND COALESCE(eh_pagamento_fiado, FALSE) = FALSE
  AND COALESCE(eh_pagamento_caderneta, FALSE) = FALSE;

-- 2.2 Preencher pedidos.data_pagamento para pedidos já pagos usando o maior pagamentos_pedido.data_pagamento
UPDATE public.pedidos p
SET data_pagamento = COALESCE(
  (
    SELECT MAX(pp.data_pagamento)
    FROM public.pagamentos_pedido pp
    WHERE pp.pedido_id = p.id
      AND pp.data_pagamento IS NOT NULL
      AND COALESCE(pp.eh_pagamento_fiado, FALSE) = FALSE
      AND COALESCE(pp.eh_pagamento_caderneta, FALSE) = FALSE
  ),
  p.atualizado_em,
  p.data_venda,
  p.criado_em
)
WHERE p.status_pagamento = 'pago'
  AND p.data_pagamento IS NULL;

-- 2.3 Garantir limpeza de data_pagamento em pedidos não pagos / aguardando / cancelados
UPDATE public.pedidos
SET data_pagamento = NULL
WHERE status_pagamento IN ('aguardando_pagamento', 'aguardando_pesagem', 'cancelado')
  AND data_pagamento IS NOT NULL;

-- 3. Triggers automáticos de sincronização
-- 3.1 Trigger BEFORE INSERT OR UPDATE OF status_pagamento em public.pedidos
CREATE OR REPLACE FUNCTION public.fn_sincronizar_data_pagamento_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status_pagamento = 'pago' THEN
    IF TG_OP = 'INSERT' OR OLD.status_pagamento IS DISTINCT FROM 'pago' OR NEW.data_pagamento IS NULL THEN
      NEW.data_pagamento := COALESCE(NEW.data_pagamento, NOW());
    END IF;
  ELSIF NEW.status_pagamento IN ('aguardando_pagamento', 'aguardando_pesagem', 'cancelado') THEN
    NEW.data_pagamento := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_data_pagamento_pedido ON public.pedidos;
CREATE TRIGGER trg_sincronizar_data_pagamento_pedido
  BEFORE INSERT OR UPDATE OF status_pagamento ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sincronizar_data_pagamento_pedido();

-- 3.2 Trigger BEFORE INSERT em public.pagamentos_pedido para preencher data_pagamento nulo em pagamentos reais
CREATE OR REPLACE FUNCTION public.fn_preencher_data_pagamento_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_pag_pedido TEXT;
BEGIN
  IF COALESCE(NEW.eh_pagamento_fiado, FALSE) = FALSE
     AND COALESCE(NEW.eh_pagamento_caderneta, FALSE) = FALSE
     AND NEW.data_pagamento IS NULL THEN
    SELECT status_pagamento
      INTO v_status_pag_pedido
      FROM public.pedidos
     WHERE id = NEW.pedido_id;

    IF v_status_pag_pedido IS NULL
       OR v_status_pag_pedido NOT IN ('aguardando_pagamento', 'aguardando_pesagem') THEN
      NEW.data_pagamento := NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preencher_data_pagamento_pagamentos_pedido ON public.pagamentos_pedido;
CREATE TRIGGER trg_preencher_data_pagamento_pagamentos_pedido
  BEFORE INSERT ON public.pagamentos_pedido
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_preencher_data_pagamento_item();

-- 3.3 Trigger AFTER INSERT em public.pagamentos_pedido para sincronizar maior data_pagamento no pedido pago
CREATE OR REPLACE FUNCTION public.fn_sincronizar_pedido_apos_pagamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data_pag TIMESTAMPTZ;
BEGIN
  IF COALESCE(NEW.eh_pagamento_fiado, FALSE) = FALSE
     AND COALESCE(NEW.eh_pagamento_caderneta, FALSE) = FALSE THEN
    v_data_pag := COALESCE(NEW.data_pagamento, NOW());

    UPDATE public.pedidos
       SET data_pagamento = GREATEST(COALESCE(data_pagamento, v_data_pag), v_data_pag)
     WHERE id = NEW.pedido_id
       AND loja_id = NEW.loja_id
       AND status_pagamento = 'pago';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_pedido_apos_pagamento ON public.pagamentos_pedido;
CREATE TRIGGER trg_sincronizar_pedido_apos_pagamento
  AFTER INSERT ON public.pagamentos_pedido
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sincronizar_pedido_apos_pagamento();

-- 4. Atualizar RPC public.obter_metricas_cockpit para Regime de Caixa Real
CREATE OR REPLACE FUNCTION public.obter_metricas_cockpit(
    p_loja_id UUID,
    p_data_inicio TIMESTAMPTZ,
    p_data_fim TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resultado JSONB;
    v_faturamento NUMERIC(12,2) := 0;
    v_pedidos INTEGER := 0;
    v_ticket NUMERIC(10,2) := 0;
    v_cmv NUMERIC(12,2) := 0;
    v_despesas NUMERIC(12,2) := 0;
    v_lucro NUMERIC(12,2) := 0;
    v_fiado_vencido NUMERIC(12,2) := 0;
    v_fiado_total NUMERIC(12,2) := 0;
    v_inadimplencia NUMERIC(5,2) := 0;
    v_venda_saidas NUMERIC(12,2) := 0;
    v_estoque_atual NUMERIC(12,2) := 0;
    v_giro NUMERIC(5,2) := 0;
BEGIN
    -- Validação de isolamento multitenant
    IF NOT public.usuario_pertence_loja(p_loja_id) THEN
        RAISE EXCEPTION 'Acesso negado aos dados desta loja';
    END IF;

    -- 1. Faturamento e Volume de Pedidos (Regime de Caixa Real: apenas status_pagamento = 'pago' pela data_pagamento)
    SELECT
        COALESCE(SUM(COALESCE(valor_pago, valor_total, 0)), 0),
        COUNT(id)
    INTO v_faturamento, v_pedidos
    FROM public.pedidos
    WHERE loja_id = p_loja_id
      AND status NOT IN ('cancelado')
      AND status_pagamento = 'pago'
      AND COALESCE(data_pagamento, data_venda, criado_em) BETWEEN p_data_inicio AND p_data_fim;

    -- 2. Ticket Médio
    IF v_pedidos > 0 THEN
        v_ticket := ROUND(v_faturamento / v_pedidos, 2);
    END IF;

    -- 3. CMV e Lucro Líquido Real (mesmo recorte de caixa realizado)
    SELECT COALESCE(SUM(ip.quantidade * COALESCE(ip.preco_custo_unitario, p.preco_custo, 0)), 0)
    INTO v_cmv
    FROM public.itens_pedido ip
    JOIN public.produtos p ON p.id = ip.produto_id
    JOIN public.pedidos ped ON ped.id = ip.pedido_id
    WHERE ped.loja_id = p_loja_id
      AND ped.status NOT IN ('cancelado')
      AND ped.status_pagamento = 'pago'
      AND COALESCE(ped.data_pagamento, ped.data_venda, ped.criado_em) BETWEEN p_data_inicio AND p_data_fim;

    SELECT COALESCE(SUM(valor), 0)
    INTO v_despesas
    FROM public.transacoes_financeiras
    WHERE loja_id = p_loja_id
      AND (tipo = 'SAIDA' OR tipo ILIKE 'despesa%')
      AND status = 'pago'
      AND COALESCE(data_pagamento, criado_em) BETWEEN p_data_inicio AND p_data_fim;

    v_lucro := v_faturamento - v_cmv - v_despesas;

    -- 4. Inadimplência de Fiado (> 30 dias de atraso sobre total a receber de fiado)
    SELECT
        COALESCE(SUM(CASE WHEN data_vencimento_fiado < (p_data_fim::date - 30) THEN saldo_devedor ELSE 0 END), 0),
        COALESCE(SUM(saldo_devedor), 0)
    INTO v_fiado_vencido, v_fiado_total
    FROM public.pedidos
    WHERE loja_id = p_loja_id
      AND status NOT IN ('cancelado')
      AND saldo_devedor > 0
      AND status_pagamento != 'pago';

    IF v_fiado_total > 0 THEN
        v_inadimplencia := ROUND((v_fiado_vencido / v_fiado_total) * 100, 2);
    ELSE
        v_inadimplencia := 0;
    END IF;

    -- 5. Giro de Estoque (Saídas de Venda vs Valor Total em Estoque)
    v_venda_saidas := v_faturamento;
    SELECT COALESCE(SUM(estoque_atual * preco_venda), 0)
    INTO v_estoque_atual
    FROM public.produtos
    WHERE loja_id = p_loja_id AND ativo = true;

    IF v_estoque_atual > 0 THEN
        v_giro := ROUND((v_venda_saidas / v_estoque_atual) * 100, 2);
    ELSE
        v_giro := 0;
    END IF;

    -- Compilação do resultado
    v_resultado := jsonb_build_object(
        'faturamento', v_faturamento,
        'pedidos', v_pedidos,
        'ticket_medio', v_ticket,
        'cmv', v_cmv,
        'despesas', v_despesas,
        'lucro_liquido', v_lucro,
        'inadimplencia', v_inadimplencia,
        'giro_estoque', v_giro
    );

    RETURN v_resultado;
END;
$$;

-- 5. Recarregar schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
