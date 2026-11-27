-- ==============================================================================
-- MIGRATION: 20261127_onboarding_ia_metas_whatsapp.sql
-- Evolução do Questionário de Implantação Inicial e Checklist de Primeiros Passos:
-- 1. Identidade/Nicho para calibração das IAs (perfil_ia_conferido)
-- 2. Conferência das Metas do Cockpit Executivo F1 (metas_conferidas)
-- 3. Separação do Robô Receptivo WhatsApp IA (interesse_whatsapp_ia_receptiva)
-- Modelagem relacional pura (sem colunas JSONB) + backfill histórico seguro
-- ==============================================================================

ALTER TABLE public.loja_onboarding_setup
  ADD COLUMN IF NOT EXISTS interesse_whatsapp_ia_receptiva BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS metas_conferidas BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS perfil_ia_conferido BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.loja_onboarding_setup.interesse_whatsapp_ia_receptiva IS
  'Indica interesse ou ativação do Robô Atendente / Vendedora IA receptiva no WhatsApp (Meta Cloud API com número exclusivo).';

COMMENT ON COLUMN public.loja_onboarding_setup.metas_conferidas IS
  'Indica que as metas da loja (Cockpit Executivo F1) foram conferidas ou configuradas durante a implantação.';

COMMENT ON COLUMN public.loja_onboarding_setup.perfil_ia_conferido IS
  'Indica que o Segmento de Atuação e a Especialidade/Foco Principal da loja foram confirmados para calibrar as IAs.';

-- Backfill seguro para lojas que já possuem o Robô WhatsApp IA ativo
UPDATE public.loja_onboarding_setup los
SET interesse_whatsapp_ia_receptiva = TRUE
FROM public.lojas l
WHERE los.loja_id = l.id
  AND los.interesse_whatsapp_ia_receptiva = FALSE
  AND (
    COALESCE(l.whatsapp_ia_receptiva_ativa, FALSE) = TRUE
    OR (
      COALESCE(l.ia_whatsapp_ativa, FALSE) = TRUE
      AND NULLIF(TRIM(COALESCE(l.meta_phone_number_id, '')), '') IS NOT NULL
    )
  );

-- Backfill seguro para lojas que já configuraram metas em public.loja_metas
UPDATE public.loja_onboarding_setup los
SET metas_conferidas = TRUE
FROM public.loja_metas lm
WHERE los.loja_id = lm.loja_id
  AND los.metas_conferidas = FALSE
  AND COALESCE(lm.meta_faturamento, 0) > 0;

-- Backfill seguro para lojas que já definiram Segmento ou Especialidade para IA
UPDATE public.loja_onboarding_setup los
SET perfil_ia_conferido = TRUE
FROM public.lojas l
WHERE los.loja_id = l.id
  AND los.perfil_ia_conferido = FALSE
  AND (
    (
      NULLIF(TRIM(COALESCE(l.configuracoes_extras->'perfil_negocio'->>'segmento', '')), '') IS NOT NULL
      AND LOWER(TRIM(l.configuracoes_extras->'perfil_negocio'->>'segmento')) <> 'geral'
    )
    OR NULLIF(TRIM(COALESCE(l.configuracoes_extras->'perfil_negocio'->>'descricao_especialidade', '')), '') IS NOT NULL
  );

NOTIFY pgrst, 'reload schema';
