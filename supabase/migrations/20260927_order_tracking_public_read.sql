-- =========================================================================
-- MIGRATION: POLÍTICAS DE RLS PARA ACESSO PÚBLICO A RASTREIO E RECIBOS
-- Garante leitura anônima de pedidos, histórico e entregas nas rotas
-- /order-tracking/:id e /recibo-publico/:id
-- =========================================================================

-- 1. Habilitar RLS em pedidos caso não esteja e garantir política de leitura para anon
DO $$
BEGIN
  -- Política para SELECT de pedidos anônimo/autenticado
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'pedidos' AND policyname = 'pedidos_public_tracking_select_policy'
  ) THEN
    CREATE POLICY pedidos_public_tracking_select_policy
      ON public.pedidos
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  -- Política para itens_pedido
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'itens_pedido') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'itens_pedido' AND policyname = 'itens_pedido_public_select_policy'
    ) THEN
      CREATE POLICY itens_pedido_public_select_policy
        ON public.itens_pedido
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;
  END IF;

  -- Política para historico_pedidos
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'historico_pedidos') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'historico_pedidos' AND policyname = 'historico_pedidos_public_select_policy'
    ) THEN
      CREATE POLICY historico_pedidos_public_select_policy
        ON public.historico_pedidos
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;
  END IF;

  -- Política para pedido_entregas
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pedido_entregas') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'pedido_entregas' AND policyname = 'pedido_entregas_public_select_policy'
    ) THEN
      CREATE POLICY pedido_entregas_public_select_policy
        ON public.pedido_entregas
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;
  END IF;
END $$;
