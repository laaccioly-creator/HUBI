-- =============================================================================
-- Migration: Suporte a Pedidos Híbridos (Produto Físico + Serviço)
-- Separa taxa de visita a domicílio (valor_taxa_domicilio) do frete (valor_frete)
-- e registra se o técnico levará os produtos físicos no atendimento.
-- =============================================================================

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS valor_taxa_domicilio NUMERIC(10,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS levar_produto_no_atendimento BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
