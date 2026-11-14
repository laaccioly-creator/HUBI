-- =============================================================================
-- MIGRATION: 20261114_fix_rls_agendamentos_servicos.sql
-- Libera políticas RLS de leitura (SELECT) e escrita completa (ALL) para
-- public.agendamentos_servicos garantindo sincronização entre PDV e /agenda
-- mesmo em sessões híbridas/customizadas do HUBI.
-- =============================================================================

ALTER TABLE public.agendamentos_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agendamentos_servicos_loja_select_policy" ON public.agendamentos_servicos;
DROP POLICY IF EXISTS "agendamentos_servicos_loja_insert_policy" ON public.agendamentos_servicos;
DROP POLICY IF EXISTS "agendamentos_servicos_loja_update_policy" ON public.agendamentos_servicos;
DROP POLICY IF EXISTS "agendamentos_servicos_loja_delete_policy" ON public.agendamentos_servicos;
DROP POLICY IF EXISTS "agendamentos_servicos_public_insert_policy" ON public.agendamentos_servicos;
DROP POLICY IF EXISTS "agendamentos_servicos_public_select_policy" ON public.agendamentos_servicos;
DROP POLICY IF EXISTS "agendamentos_servicos_public_all_policy" ON public.agendamentos_servicos;

CREATE POLICY "agendamentos_servicos_public_select_policy"
  ON public.agendamentos_servicos
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "agendamentos_servicos_public_all_policy"
  ON public.agendamentos_servicos
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
