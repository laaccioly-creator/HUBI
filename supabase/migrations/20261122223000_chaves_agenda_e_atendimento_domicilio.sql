-- =============================================================================
-- MIGRATION: 20261122223000_chaves_agenda_e_atendimento_domicilio.sql
-- Chaves progressivas para Agenda / Atendimento Agendado e Atendimento a Domicílio
-- =============================================================================

ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS trabalha_com_agenda BOOLEAN DEFAULT false;

ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS atendimento_domicilio_ativo BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.lojas.trabalha_com_agenda IS 'Ativa o módulo de Agenda / Atendimento Agendado para a loja';
COMMENT ON COLUMN public.lojas.atendimento_domicilio_ativo IS 'Ativa atendimento a domicílio / visita técnica e exibição da taxa padrão de visita';

-- Backfill seguro: marcar trabalha_com_agenda = true apenas onde há serviços cadastrados ou taxa_padrao_domicilio > 0
UPDATE public.lojas l
SET trabalha_com_agenda = true
WHERE COALESCE(l.trabalha_com_agenda, false) = false
  AND (
    COALESCE(l.taxa_padrao_domicilio, 0) > 0
    OR EXISTS (
      SELECT 1
      FROM public.produtos p
      WHERE p.loja_id = l.id
        AND (p.tipo_item = 'servico' OR p.requer_agendamento = true)
    )
  );

-- Backfill seguro: marcar atendimento_domicilio_ativo = true apenas onde taxa_padrao_domicilio > 0
UPDATE public.lojas
SET atendimento_domicilio_ativo = true
WHERE COALESCE(atendimento_domicilio_ativo, false) = false
  AND COALESCE(taxa_padrao_domicilio, 0) > 0;
