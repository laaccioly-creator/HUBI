-- ==============================================================================
-- MIGRATION: 20261120_loja_onboarding_setup.sql
-- Questionário de Implantação Inicial e Diagnóstico Operacional por Loja
-- Modelagem relacional pura + RLS multi-tenant (SUPABASE-RLS-GUARD)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.loja_onboarding_setup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL UNIQUE REFERENCES public.lojas(id) ON DELETE CASCADE,
  questionario_respondido BOOLEAN NOT NULL DEFAULT FALSE,
  respondido_em TIMESTAMPTZ NULL,
  interesse_catalogo_online BOOLEAN NOT NULL DEFAULT TRUE,
  interesse_gateway_pagamento BOOLEAN NOT NULL DEFAULT FALSE,
  interesse_melhor_envio BOOLEAN NOT NULL DEFAULT FALSE,
  interesse_uber_direct BOOLEAN NOT NULL DEFAULT FALSE,
  interesse_apps_corrida BOOLEAN NOT NULL DEFAULT FALSE,
  interesse_transportadoras_manuais BOOLEAN NOT NULL DEFAULT FALSE,
  interesse_ia_gemini BOOLEAN NOT NULL DEFAULT TRUE,
  interesse_busca_fotos_serper BOOLEAN NOT NULL DEFAULT TRUE,
  interesse_whatsapp_auto BOOLEAN NOT NULL DEFAULT FALSE,
  interesse_mercado_livre BOOLEAN NOT NULL DEFAULT FALSE,
  interesse_agendamento_servicos BOOLEAN NOT NULL DEFAULT FALSE,
  interesse_venda_por_peso BOOLEAN NOT NULL DEFAULT FALSE,
  interesse_caderneta_fiado BOOLEAN NOT NULL DEFAULT FALSE,
  unidades_conferidas BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loja_onboarding_setup_loja_id
  ON public.loja_onboarding_setup(loja_id);

-- Trigger de atualização automática da coluna atualizado_em
CREATE OR REPLACE FUNCTION public.fn_atualizar_timestamp_loja_onboarding_setup()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atualizar_loja_onboarding_setup_timestamp ON public.loja_onboarding_setup;
CREATE TRIGGER trg_atualizar_loja_onboarding_setup_timestamp
  BEFORE UPDATE ON public.loja_onboarding_setup
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_atualizar_timestamp_loja_onboarding_setup();

-- Privilégios para role autenticada
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.loja_onboarding_setup TO authenticated;

-- Blindagem RLS multi-tenant obrigatória
ALTER TABLE public.loja_onboarding_setup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loja_onboarding_setup_select_policy" ON public.loja_onboarding_setup;
CREATE POLICY "loja_onboarding_setup_select_policy"
  ON public.loja_onboarding_setup
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "loja_onboarding_setup_insert_policy" ON public.loja_onboarding_setup;
CREATE POLICY "loja_onboarding_setup_insert_policy"
  ON public.loja_onboarding_setup
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "loja_onboarding_setup_update_policy" ON public.loja_onboarding_setup;
CREATE POLICY "loja_onboarding_setup_update_policy"
  ON public.loja_onboarding_setup
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
  WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "loja_onboarding_setup_delete_policy" ON public.loja_onboarding_setup;
CREATE POLICY "loja_onboarding_setup_delete_policy"
  ON public.loja_onboarding_setup
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));
