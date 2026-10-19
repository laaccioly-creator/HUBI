-- =============================================================================
-- Migration: Sincronização Automática Periódica de Rastreios (Melhor Envio / Correios)
-- Data: 19/10/2026
-- Objetivo: Garantir atualização de status para 'entregue' em segundo plano
-- =============================================================================

-- 1. Garantir que a tabela historico_pedidos e pedidos possuam índices de alta performance
CREATE INDEX IF NOT EXISTS idx_pedidos_loja_status ON public.pedidos(loja_id, status);
CREATE INDEX IF NOT EXISTS idx_pedido_entregas_status_envio ON public.pedido_entregas(status_envio);
CREATE INDEX IF NOT EXISTS idx_pedido_entregas_codigo_rastreio ON public.pedido_entregas(codigo_rastreio);

-- 2. Função RPC segura para buscar pedidos com entrega pendente para rotinas periódicas
CREATE OR REPLACE FUNCTION public.obter_pedidos_pendentes_rastreio(p_loja_id UUID)
RETURNS TABLE (
  pedido_id UUID,
  loja_id UUID,
  codigo_rastreio VARCHAR,
  melhor_envio_order_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Blindagem multi-tenant: valida se o usuário autenticado pertence à loja
  IF NOT public.usuario_pertence_loja(p_loja_id) THEN
    RAISE EXCEPTION 'Acesso negado para a loja especificada.';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS pedido_id,
    p.loja_id,
    pe.codigo_rastreio::VARCHAR,
    p.metadados->>'melhor_envio_order_id' AS melhor_envio_order_id
  FROM public.pedidos p
  LEFT JOIN public.pedido_entregas pe ON pe.pedido_id = p.id
  WHERE p.loja_id = p_loja_id
    AND p.status = 'enviado'
  LIMIT 50;
END;
$$;

-- Permissões RPC
GRANT EXECUTE ON FUNCTION public.obter_pedidos_pendentes_rastreio(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obter_pedidos_pendentes_rastreio(UUID) TO service_role;

-- 3. Documentação de configuração do agendamento pg_cron (caso pg_cron esteja habilitado no projeto Supabase)
-- SELECT cron.schedule(
--   'sincronizar-rastreios-hubi',
--   '*/30 * * * *', -- a cada 30 minutos
--   $$
--   SELECT
--     net.http_post(
--       url := current_setting('app.settings.supabase_url', true) || '/functions/v1/melhor-envio-despacho',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
--       ),
--       body := jsonb_build_object('acao', 'sincronizar_rastreios_pendentes')
--     );
--   $$
-- );
