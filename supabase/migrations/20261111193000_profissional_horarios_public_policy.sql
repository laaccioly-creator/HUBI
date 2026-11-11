-- =============================================================================
-- MIGRATION: 20261111193000_profissional_horarios_public_policy.sql
-- Garante acesso de leitura pública/anônima aos expedientes ativos de profissionais
-- para cálculo de disponibilidade e agendamento pelo Catálogo Online
-- =============================================================================

DROP POLICY IF EXISTS "profissional_horarios_public_select_policy" ON public.profissional_horarios;
DROP POLICY IF EXISTS profissional_horarios_public_select_policy ON public.profissional_horarios;

CREATE POLICY profissional_horarios_public_select_policy 
ON public.profissional_horarios 
FOR SELECT 
TO anon, authenticated 
USING (ativo = true);
