-- ==============================================================================
-- MIGRATION: 20260923_produtos_dimensoes_frete.sql
-- Adiciona suporte a dimensões e peso por produto para cotação assertiva no Melhor Envio
-- e embalagem padrão da loja como fallback de segurança
-- ==============================================================================

-- 1. Dimensões e peso no catálogo de produtos
ALTER TABLE public.produtos 
    ADD COLUMN IF NOT EXISTS peso_kg NUMERIC(8, 3),
    ADD COLUMN IF NOT EXISTS altura_cm NUMERIC(8, 2),
    ADD COLUMN IF NOT EXISTS largura_cm NUMERIC(8, 2),
    ADD COLUMN IF NOT EXISTS comprimento_cm NUMERIC(8, 2);

-- 2. Embalagem padrão de envio na configuração logística da loja
ALTER TABLE public.loja_shipping_configs 
    ADD COLUMN IF NOT EXISTS embalagem_padrao_peso_kg NUMERIC(8, 3) DEFAULT 0.5,
    ADD COLUMN IF NOT EXISTS embalagem_padrao_altura_cm NUMERIC(8, 2) DEFAULT 10,
    ADD COLUMN IF NOT EXISTS embalagem_padrao_largura_cm NUMERIC(8, 2) DEFAULT 15,
    ADD COLUMN IF NOT EXISTS embalagem_padrao_comprimento_cm NUMERIC(8, 2) DEFAULT 20;

COMMENT ON COLUMN public.produtos.peso_kg IS 'Peso do produto embalado em quilogramas (kg) para cálculo de frete';
COMMENT ON COLUMN public.produtos.altura_cm IS 'Altura da embalagem do produto em centímetros (cm)';
COMMENT ON COLUMN public.produtos.largura_cm IS 'Largura da embalagem do produto em centímetros (cm)';
COMMENT ON COLUMN public.produtos.comprimento_cm IS 'Comprimento da embalagem do produto em centímetros (cm)';
