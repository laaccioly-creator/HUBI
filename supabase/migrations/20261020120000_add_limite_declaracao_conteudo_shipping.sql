-- Migration: Adicionar limite de declaração de conteúdo em loja_shipping_configs
-- Versão: 20261020120000

ALTER TABLE public.loja_shipping_configs
  ADD COLUMN IF NOT EXISTS limite_declaracao_conteudo NUMERIC(10,2) NOT NULL DEFAULT 1000.00;

COMMENT ON COLUMN public.loja_shipping_configs.limite_declaracao_conteudo IS
  'Valor máximo de produtos (R$) permitido para envio com Declaração de Conteúdo (sem NF-e) nas transportadoras integradas';
