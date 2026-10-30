-- Migration: 20261030_configuracoes_plataforma_serpapi_key.sql
-- Adiciona a coluna serpapi_key na tabela singleton public.configuracoes_plataforma
-- Governança: supabase-rls-guard, anti-jsonb-linter

ALTER TABLE public.configuracoes_plataforma
  ADD COLUMN IF NOT EXISTS serpapi_key TEXT;

COMMENT ON COLUMN public.configuracoes_plataforma.serpapi_key IS 'Chave SerpApi global da plataforma HUBI utilizada como fallback automático de fotos';
