-- ==============================================================================
-- Migração: Centralização Definitiva da Chave Google Gemini na Tabela public.lojas
-- Data: 2026-10-25
-- Governança: Modelagem Relacional Pura (Sem dependência de JSONB para credenciais)
-- ==============================================================================

-- 1. Garante a coluna relacional gemini_api_key em public.lojas
ALTER TABLE public.lojas 
ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;

COMMENT ON COLUMN public.lojas.gemini_api_key IS 'Chave de API oficial do Google Gemini (BYOK) - Ponto único de configuração para Vendedora IA, Rubi, Catálogo e PDV';

-- 2. Backfill idempotente: migra chaves salvas anteriormente em configuracoes_extras->'ia'->>'gemini_api_key'
UPDATE public.lojas
SET gemini_api_key = TRIM(configuracoes_extras->'ia'->>'gemini_api_key')
WHERE (gemini_api_key IS NULL OR TRIM(gemini_api_key) = '')
  AND configuracoes_extras IS NOT NULL
  AND configuracoes_extras->'ia'->>'gemini_api_key' IS NOT NULL
  AND TRIM(configuracoes_extras->'ia'->>'gemini_api_key') != '';
