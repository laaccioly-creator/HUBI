-- Migration: 20261026_configuracoes_plataforma_meta_api.sql
-- Adiciona credenciais centralizadas da Meta Cloud API na tabela singleton configuracoes_plataforma
-- Governança: supabase-rls-guard, anti-jsonb-linter

ALTER TABLE public.configuracoes_plataforma
  ADD COLUMN IF NOT EXISTS meta_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_waba_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_access_token TEXT,
  ADD COLUMN IF NOT EXISTS meta_verify_token TEXT DEFAULT 'hubi_whatsapp_webhook_token';

COMMENT ON COLUMN public.configuracoes_plataforma.meta_phone_number_id IS 'ID do número de telefone corporativo na Meta Cloud API';
COMMENT ON COLUMN public.configuracoes_plataforma.meta_waba_id IS 'WhatsApp Business Account ID (WABA) global da plataforma HUBI';
COMMENT ON COLUMN public.configuracoes_plataforma.meta_access_token IS 'Token permanente de usuário do sistema da Meta Cloud API';
COMMENT ON COLUMN public.configuracoes_plataforma.meta_verify_token IS 'Token de validação de Webhooks da Meta Cloud API';
