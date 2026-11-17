-- Migration: 20261117170000_configuracoes_plataforma_mercado_pago.sql
-- Adiciona credenciais exclusivas do Mercado Pago recebedor da plataforma HUBI (assinaturas e recargas WhatsApp)
-- na tabela singleton public.configuracoes_plataforma.
-- Governança: supabase-rls-guard, anti-jsonb-linter, pii-leak-detector

-- 1. Adiciona colunas relacionais do Mercado Pago da Plataforma
ALTER TABLE public.configuracoes_plataforma
  ADD COLUMN IF NOT EXISTS mp_ambiente VARCHAR(20) NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS mp_public_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS mp_access_token TEXT NULL,
  ADD COLUMN IF NOT EXISTS mp_webhook_secret TEXT NULL;

-- 2. Garante constraint de valores válidos para mp_ambiente de forma idempotente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_configuracoes_plataforma_mp_ambiente'
      AND conrelid = 'public.configuracoes_plataforma'::regclass
  ) THEN
    ALTER TABLE public.configuracoes_plataforma
      ADD CONSTRAINT chk_configuracoes_plataforma_mp_ambiente
      CHECK (mp_ambiente IN ('sandbox', 'producao'));
  END IF;
END $$;

-- 3. Comentários documentais
COMMENT ON COLUMN public.configuracoes_plataforma.mp_ambiente IS 'Ambiente ativo do Mercado Pago da plataforma HUBI (sandbox ou producao).';
COMMENT ON COLUMN public.configuracoes_plataforma.mp_public_key IS 'Public Key do Mercado Pago recebedor da plataforma HUBI.';
COMMENT ON COLUMN public.configuracoes_plataforma.mp_access_token IS 'Access Token privado do Mercado Pago recebedor da plataforma (leitura restrita a backend/Super Admin).';
COMMENT ON COLUMN public.configuracoes_plataforma.mp_webhook_secret IS 'Assinatura secreta opcional de webhook do Mercado Pago da plataforma.';

-- 4. Confirma RLS habilitada na tabela singleton
ALTER TABLE public.configuracoes_plataforma ENABLE ROW LEVEL SECURITY;
