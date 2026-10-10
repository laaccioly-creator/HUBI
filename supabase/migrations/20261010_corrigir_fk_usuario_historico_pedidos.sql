-- Migration: 20261010_corrigir_fk_usuario_historico_pedidos.sql
-- Objetivo: Corrigir violação de foreign key historico_pedidos_usuario_id_fkey nas triggers de criação e transição de status de pedidos.
-- Problema corrigido: auth.uid() retorna o ID de auth.users, enquanto historico_pedidos.usuario_id referencia public.usuarios_loja(id).
-- Solução: Resolver o id correto de public.usuarios_loja ou deixar NULL se não encontrado, com proteção defensiva para nunca bloquear transações de venda.

-- 1. Atualizar função de auditoria na criação de pedidos
CREATE OR REPLACE FUNCTION public.fn_auditar_criacao_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_descricao TEXT;
  v_usuario_id UUID := NULL;
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

  -- Resolução segura e blindada do usuario_id para respeitar public.usuarios_loja(id)
  IF NEW.atualizado_por IS NOT NULL THEN
    SELECT id INTO v_usuario_id 
    FROM public.usuarios_loja 
    WHERE id = NEW.atualizado_por AND loja_id = NEW.loja_id 
    LIMIT 1;
  END IF;

  IF v_usuario_id IS NULL AND NEW.vendedor_id IS NOT NULL THEN
    SELECT id INTO v_usuario_id 
    FROM public.usuarios_loja 
    WHERE id = NEW.vendedor_id AND loja_id = NEW.loja_id 
    LIMIT 1;
  END IF;

  IF v_usuario_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT id INTO v_usuario_id 
    FROM public.usuarios_loja 
    WHERE usuario_auth_id = auth.uid() AND loja_id = NEW.loja_id 
    LIMIT 1;
  END IF;

  -- Inserção defensiva não-bloqueante
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fn_auditar_criacao_pedido] Falha não-bloqueante ao registrar histórico do pedido %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 2. Atualizar função de auditoria na transição de status de pedidos
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
  v_usuario_id UUID := NULL;
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

    -- Resolução segura e blindada do usuario_id para respeitar public.usuarios_loja(id)
    IF NEW.atualizado_por IS NOT NULL THEN
      SELECT id INTO v_usuario_id 
      FROM public.usuarios_loja 
      WHERE id = NEW.atualizado_por AND loja_id = NEW.loja_id 
      LIMIT 1;
    END IF;

    IF v_usuario_id IS NULL AND NEW.vendedor_id IS NOT NULL THEN
      SELECT id INTO v_usuario_id 
      FROM public.usuarios_loja 
      WHERE id = NEW.vendedor_id AND loja_id = NEW.loja_id 
      LIMIT 1;
    END IF;

    IF v_usuario_id IS NULL AND auth.uid() IS NOT NULL THEN
      SELECT id INTO v_usuario_id 
      FROM public.usuarios_loja 
      WHERE usuario_auth_id = auth.uid() AND loja_id = NEW.loja_id 
      LIMIT 1;
    END IF;

    -- Inserção defensiva não-bloqueante na tabela historico_pedidos
    BEGIN
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
        jsonb_build_object('descricao', v_descricao, 'motivo', NEW.motivo_cancelamento),
        COALESCE(NEW.atualizado_em, v_agora)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[fn_auditar_transicao_status_pedidos] Falha não-bloqueante ao registrar histórico do pedido %: %', NEW.id, SQLERRM;
    END;

  END IF;

  RETURN NEW;
END;
$$;
