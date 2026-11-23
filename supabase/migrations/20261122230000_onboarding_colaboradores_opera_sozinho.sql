-- ==============================================================================
-- MIGRATION: 20261122230000_onboarding_colaboradores_opera_sozinho.sql
-- Adiciona coluna booleana opera_sozinho para concluir etapa de Colaboradores
-- quando o lojista opera a loja individualmente
-- ==============================================================================

ALTER TABLE public.loja_onboarding_setup
  ADD COLUMN IF NOT EXISTS opera_sozinho BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.loja_onboarding_setup.opera_sozinho IS
  'Indica que o lojista opera a loja sozinho, marcando a etapa de Cadastro de Colaboradores como concluída no onboarding';
