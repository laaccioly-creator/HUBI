-- =========================================================================
-- MIGRATION: POLÍTICAS DE RLS PARA RECIBO PÚBLICO E DADOS FINANCEIROS BÁSICOS
-- Permite leitura anônima dos dados necessários para emissão e conferência
-- do comprovante/recibo público (/recibo-publico/:id)
-- =========================================================================

DO $$
BEGIN
  -- 1. pagamentos_pedido: leitura pública dos comprovantes de pagamento do pedido
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pagamentos_pedido') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'pagamentos_pedido' AND policyname = 'pagamentos_pedido_public_select_policy'
    ) THEN
      CREATE POLICY pagamentos_pedido_public_select_policy
        ON public.pagamentos_pedido
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;
  END IF;

  -- 2. formas_pagamento: leitura pública dos métodos de pagamento para discriminação no recibo
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'formas_pagamento') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'formas_pagamento' AND policyname = 'formas_pagamento_public_select_policy'
    ) THEN
      CREATE POLICY formas_pagamento_public_select_policy
        ON public.formas_pagamento
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;
  END IF;

  -- 3. clientes: leitura pública dos dados de identificação básica vinculados ao pedido
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clientes') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'clientes' AND policyname = 'clientes_public_select_policy'
    ) THEN
      CREATE POLICY clientes_public_select_policy
        ON public.clientes
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;
  END IF;

  -- 4. usuarios_loja: leitura pública do nome do atendente/vendedor no recibo
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'usuarios_loja') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'usuarios_loja' AND policyname = 'usuarios_loja_public_select_policy'
    ) THEN
      CREATE POLICY usuarios_loja_public_select_policy
        ON public.usuarios_loja
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;
  END IF;

  -- 5. lojas: leitura pública dos dados do estabelecimento comercial
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'lojas') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'lojas' AND policyname = 'lojas_public_select_policy'
    ) THEN
      CREATE POLICY lojas_public_select_policy
        ON public.lojas
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;
  END IF;
END $$;
