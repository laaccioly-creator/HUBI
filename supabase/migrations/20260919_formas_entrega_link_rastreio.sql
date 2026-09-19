-- ==============================================================================
-- MIGRATION: 20260919_formas_entrega_link_rastreio.sql
-- Adiciona suporte relacional para link de rastreio de corrida por app (Uber/99)
-- ==============================================================================

ALTER TABLE public.formas_entrega 
  ADD COLUMN IF NOT EXISTS requer_link_rastreio BOOLEAN DEFAULT FALSE;
