-- Migration: 20261009_corrigir_trigger_e_adicionar_motivo_historico.sql
-- Objetivo: Adicionar coluna 'motivo' na tabela 'historico_pedidos' e 'cotacao_id' em 'pedido_entregas',
-- corrigindo a trigger nativa para gravar tanto em 'motivo' quanto em 'detalhes'.

-- 1. Adicionar colunas faltantes nas tabelas relacionais
ALTER TABLE public.historico_pedidos ADD COLUMN IF NOT EXISTS motivo TEXT;
ALTER TABLE public.pedido_entregas ADD COLUMN IF NOT EXISTS cotacao_id TEXT;

-- 2. Atualizar a trigger de auditoria de pedidos para suportar motivo e detalhes sem falhas de coluna
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
      v_descricao := 'Pedido cancelado' || 
        CASE 
          WHEN NEW.motivo_cancelamento IS NOT NULL AND TRIM(NEW.motivo_cancelamento) <> '' 
          THEN '. Motivo: ' || TRIM(NEW.motivo_cancelamento)
          ELSE ''
        END;
    ELSIF NEW.status = 'concluido' THEN
      v_tipo_evento := 'concluido';
      v_descricao := 'Pedido concluído com sucesso';
    ELSIF NEW.status IN ('enviado', 'saiu_para_entrega') THEN
      v_tipo_evento := 'despachado';
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
      v_tipo_evento := 'entregue';
      v_descricao := 'Pedido entregue com sucesso ao destinatário';
    ELSIF NEW.status = 'pronto_para_retirar' THEN
      v_tipo_evento := 'status_alterado';
      v_descricao := 'Pedido pronto para retirada no balcão da loja';
    ELSIF NEW.status = 'aguardando_envio' THEN
      v_tipo_evento := 'status_alterado';
      v_descricao := 'Pedido aguardando envio/coleta';
    ELSIF NEW.status = 'em_separacao' THEN
      v_tipo_evento := 'status_alterado';
      v_descricao := 'Pedido em processo de separação de itens';
    ELSIF NEW.status = 'confirmado' THEN
      v_tipo_evento := 'status_alterado';
      v_descricao := 'Pedido confirmado';
    ELSE
      v_tipo_evento := 'status_alterado';
      v_descricao := 'Status alterado de ' || v_rotulo_ant || ' para ' || v_rotulo_novo;
    END IF;

    -- Resolução segura do usuário responsável
    v_usuario_id := COALESCE(NEW.atualizado_por, auth.uid(), NEW.vendedor_id);

    -- Inserção na tabela historico_pedidos (com detalhes e motivo)
    INSERT INTO public.historico_pedidos (
      loja_id,
      pedido_id,
      usuario_id,
      tipo_evento,
      status_anterior,
      status_novo,
      descricao,
      motivo,
      detalhes,
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
      v_descricao,
      COALESCE(NEW.atualizado_em, v_agora)
    );

  END IF;

  RETURN NEW;
END;
$$;
