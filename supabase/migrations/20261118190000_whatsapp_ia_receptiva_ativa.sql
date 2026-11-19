-- Migration: 20261118190000_whatsapp_ia_receptiva_ativa.sql
-- Adiciona flag de atendimento receptivo com Rubi IA na conexão própria Meta Cloud API da loja
-- e índice parcial para roteamento multi-filial por meta_phone_number_id.

ALTER TABLE public.lojas
ADD COLUMN IF NOT EXISTS whatsapp_ia_receptiva_ativa BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.lojas.whatsapp_ia_receptiva_ativa IS
  'Ativa ou desativa o atendimento receptivo automático com Rubi IA no número Meta Cloud API configurado para a loja';

CREATE INDEX IF NOT EXISTS idx_lojas_meta_phone_receptiva
  ON public.lojas (meta_phone_number_id, whatsapp_ia_receptiva_ativa)
  WHERE meta_phone_number_id IS NOT NULL;
