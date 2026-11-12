-- =============================================================================
-- MIGRATION: 20261111210000_adicionar_taxa_domicilio_loja_e_servicos.sql
-- Taxa de Atendimento a Domicílio / Visita Técnica (Nível 1 - Padrão da Loja)
-- =============================================================================

ALTER TABLE public.lojas 
ADD COLUMN IF NOT EXISTS taxa_padrao_domicilio NUMERIC(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS abater_taxa_domicilio_ao_fechar BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.produtos 
ADD COLUMN IF NOT EXISTS taxa_deslocamento_domicilio NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS abater_taxa_domicilio_ao_fechar BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.lojas.taxa_padrao_domicilio IS 'Taxa padrão de visita técnica / deslocamento para atendimento a domicílio';
COMMENT ON COLUMN public.lojas.abater_taxa_domicilio_ao_fechar IS 'Se verdadeiro, abate/isenta a taxa de visita quando o serviço principal é aprovado/fechado';
COMMENT ON COLUMN public.produtos.taxa_deslocamento_domicilio IS 'Exceção de taxa de deslocamento para o serviço (NULL herda da loja)';
COMMENT ON COLUMN public.produtos.abater_taxa_domicilio_ao_fechar IS 'Exceção de abatimento de taxa para o serviço (NULL herda da loja)';
