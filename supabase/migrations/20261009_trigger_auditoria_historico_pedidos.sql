-- Migration: 20261009_trigger_auditoria_historico_pedidos.sql
-- Objetivo: Garantir auditoria completa e ininterrupta de ciclo de vida em historico_pedidos via trigger nativa PostgreSQL

-- 1. Função de mapeamento de rótulos amigáveis de status em pt-BR
CREATE OR REPLACE FUNCTION public.rotulo_status_pedido(p_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'pendente' THEN 'Pendente'
    WHEN 'confirmado' THEN 'Confirmado'
    WHEN 'em_separacao' THEN 'Em separação'
    WHEN 'em_producao' THEN 'Em produção'
    WHEN 'em_expedicao' THEN 'Em expedição'
    WHEN 'aguardando_envio' THEN 'Aguardando envio'
    WHEN 'pronto_para_retirar' THEN 'Pronto para retirar'
    WHEN 'enviado' THEN 'Enviado'
    WHEN 'saiu_para_entrega' THEN 'Saiu para entrega'
    WHEN 'entregue' THEN 'Entregue'
    WHEN 'concluido' THEN 'Concluído'
    WHEN 'cancelado' THEN 'Cancelado'
    ELSE COALESCE(INITCAP(REPLACE(p_status, '_', ' ')), 'Desconhecido')
  END;
$$;

-- 2. Função da Trigger de Auditoria para Transição de Status em Pedidos
CREATE OR REPLACE FUNCTION public.fn_auditar_transicao_status_pedidos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rotulo_ant TEXT;
  v_rotulo_novo TEXT;
  v_tipo_evento TEXT;
  v_descricao TEXT;
  v_usuario_id UUID;
  v_agora TIMESTAMPTZ := NOW();
BEGIN
  -- Apenas executa se o status realmente foi alterado
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    
    -- Idempotência defensiva: Se um evento para o mesmo status_novo já foi registrado nos últimos 3 segundos, não duplicar
    IF EXISTS (
      SELECT 1 FROM public.historico_pedidos
      WHERE pedido_id = NEW.id
        AND status_novo = NEW.status
        AND criado_em >= (v_agora - INTERVAL '3 seconds')
    ) THEN
      RETURN NEW;
    END IF;

    v_rotulo_ant := public.rotulo_status_pedido(OLD.status);
    v_rotulo_novo := public.rotulo_status_pedido(NEW.status);

    -- Determina o tipo_evento
    IF NEW.status = 'cancelado' THEN
      v_tipo_evento := 'cancelado';
    ELSIF NEW.status = 'concluido' THEN
      v_tipo_evento := 'concluido';
    ELSIF NEW.status IN ('enviado', 'saiu_para_entrega') THEN
      v_tipo_evento := 'despachado';
    ELSE
      v_tipo_evento := 'status_alterado';
    END IF;

    -- Constrói a descrição em pt-BR baseada na transição
    IF NEW.status = 'cancelado' THEN
      v_descricao := 'Pedido cancelado' || 
        CASE 
          WHEN NEW.motivo_cancelamento IS NOT NULL AND TRIM(NEW.motivo_cancelamento) <> '' 
          THEN '. Motivo: ' || TRIM(NEW.motivo_cancelamento)
          ELSE ''
        END;
    ELSIF NEW.status = 'concluido' THEN
      v_descricao := 'Pedido concluído com sucesso';
    ELSIF NEW.status = 'enviado' THEN
      v_descricao := 'Pedido despachado para envio' ||
        CASE
          WHEN NEW.nome_transportadora IS NOT NULL AND TRIM(NEW.nome_transportadora) <> ''
          THEN ' via ' || TRIM(NEW.nome_transportadora)
          WHEN NEW.nome_app IS NOT NULL AND TRIM(NEW.nome_app) <> ''
          THEN ' via ' || TRIM(NEW.nome_app)
          WHEN NEW.servico_correios IS NOT NULL AND TRIM(NEW.servico_correios) <> ''
          THEN ' via Correios (' || TRIM(NEW.servico_correios) || ')'
          ELSE ''
        END;
    ELSIF NEW.status = 'entregue' THEN
      v_descricao := 'Pedido entregue com sucesso ao destinatário';
    ELSIF NEW.status = 'pronto_para_retirar' THEN
      v_descricao := 'Pedido pronto para retirada no balcão da loja';
    ELSIF NEW.status = 'aguardando_envio' THEN
      v_descricao := 'Pedido aguardando envio/coleta';
    ELSIF NEW.status = 'em_separacao' THEN
      v_descricao := 'Pedido em processo de separação de itens';
    ELSIF NEW.status = 'confirmado' THEN
      v_descricao := 'Pedido confirmado';
    ELSE
      v_descricao := 'Status alterado de ' || v_rotulo_ant || ' para ' || v_rotulo_novo;
    END IF;

    -- Resolução segura do usuário responsável
    v_usuario_id := COALESCE(NEW.atualizado_por, auth.uid(), NEW.vendedor_id);

    -- Inserção na tabela historico_pedidos
    INSERT INTO public.historico_pedidos (
      loja_id,
      pedido_id,
      usuario_id,
      tipo_evento,
      status_anterior,
      status_novo,
      descricao,
      motivo,
      criado_em
    ) VALUES (
      NEW.loja_id,
      NEW.id,
      v_usuario_id,
      v_tipo_evento,
      OLD.status,
      NEW.status,
      v_descricao,
      NEW.motivo_cancelamento,
      COALESCE(NEW.atualizado_em, v_agora)
    );

  END IF;

  RETURN NEW;
END;
$$;

-- 3. Função da Trigger de Auditoria para Criação de Pedidos (INSERT)
CREATE OR REPLACE FUNCTION public.fn_auditar_criacao_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_descricao TEXT;
  v_usuario_id UUID;
  v_agora TIMESTAMPTZ := NOW();
BEGIN
  -- Idempotência: não duplicar se já houver registro de criacao
  IF EXISTS (
    SELECT 1 FROM public.historico_pedidos
    WHERE pedido_id = NEW.id
      AND tipo_evento = 'criacao'
  ) THEN
    RETURN NEW;
  END IF;

  v_descricao := CASE
    WHEN NEW.origem = 'catalogo_online' THEN 'Pedido criado pelo cliente via Catálogo Online'
    WHEN NEW.origem = 'pdv_mobile' THEN 'Pedido criado no PDV Mobile'
    WHEN NEW.origem = 'pdv_desktop' THEN 'Pedido criado no PDV Desktop'
    ELSE 'Pedido criado no sistema'
  END;

  v_usuario_id := COALESCE(NEW.atualizado_por, auth.uid(), NEW.vendedor_id);

  INSERT INTO public.historico_pedidos (
    loja_id,
    pedido_id,
    usuario_id,
    tipo_evento,
    status_anterior,
    status_novo,
    descricao,
    criado_em
  ) VALUES (
    NEW.loja_id,
    NEW.id,
    v_usuario_id,
    'criacao',
    NULL,
    COALESCE(NEW.status, 'pendente'),
    v_descricao,
    COALESCE(NEW.criado_em, v_agora)
  );

  RETURN NEW;
END;
$$;

-- 4. Criação dos Gatilhos (Triggers) em public.pedidos
DROP TRIGGER IF EXISTS trg_pedidos_auditoria_status ON public.pedidos;
CREATE TRIGGER trg_pedidos_auditoria_status
  AFTER UPDATE ON public.pedidos
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.fn_auditar_transicao_status_pedidos();

DROP TRIGGER IF EXISTS trg_pedidos_auditoria_criacao ON public.pedidos;
CREATE TRIGGER trg_pedidos_auditoria_criacao
  AFTER INSERT ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auditar_criacao_pedido();

-- 5. Garantia de RLS em historico_pedidos para os usuários da loja
ALTER TABLE public.historico_pedidos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'historico_pedidos' 
      AND policyname = 'historico_pedidos_loja_insert_policy'
  ) THEN
    CREATE POLICY historico_pedidos_loja_insert_policy ON public.historico_pedidos
      FOR INSERT
      TO authenticated
      WITH CHECK (public.usuario_pertence_loja(loja_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'historico_pedidos' 
      AND policyname = 'historico_pedidos_loja_select_policy'
  ) THEN
    CREATE POLICY historico_pedidos_loja_select_policy ON public.historico_pedidos
      FOR SELECT
      TO authenticated
      USING (public.usuario_pertence_loja(loja_id));
  END IF;
END $$;
