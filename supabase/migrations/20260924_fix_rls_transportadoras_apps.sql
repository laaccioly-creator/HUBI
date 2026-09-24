-- ==============================================================================
-- MIGRATION: 20260924_fix_rls_transportadoras_apps.sql
-- Correção de políticas RLS e permissões para transportadoras e apps_entrega
-- Padronizado com o modelo de categorias, fornecedores, formas_pagamento e loja_shipping_configs
-- ==============================================================================

-- 1. Remoção de políticas restritivas anteriores
DROP POLICY IF EXISTS "transportadoras_select_policy" ON public.transportadoras;
DROP POLICY IF EXISTS "transportadoras_insert_policy" ON public.transportadoras;
DROP POLICY IF EXISTS "transportadoras_update_policy" ON public.transportadoras;
DROP POLICY IF EXISTS "transportadoras_delete_policy" ON public.transportadoras;
DROP POLICY IF EXISTS "transportadoras_all_policy" ON public.transportadoras;

DROP POLICY IF EXISTS "apps_entrega_select_policy" ON public.apps_entrega;
DROP POLICY IF EXISTS "apps_entrega_insert_policy" ON public.apps_entrega;
DROP POLICY IF EXISTS "apps_entrega_update_policy" ON public.apps_entrega;
DROP POLICY IF EXISTS "apps_entrega_delete_policy" ON public.apps_entrega;
DROP POLICY IF EXISTS "apps_entrega_all_policy" ON public.apps_entrega;

-- 2. Garantir RLS ativo
ALTER TABLE public.transportadoras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apps_entrega ENABLE ROW LEVEL SECURITY;

-- 3. Criar políticas de acesso compatíveis com o padrão do workspace
CREATE POLICY "transportadoras_all_policy" ON public.transportadoras
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "apps_entrega_all_policy" ON public.apps_entrega
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4. Garantir Grants completos para as roles do Supabase
GRANT ALL ON TABLE public.transportadoras TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.apps_entrega TO authenticated, anon, service_role;
