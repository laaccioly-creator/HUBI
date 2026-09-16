-- ============================================================================
-- MIGRAÇÃO: Suporte Relacional a Retirada no Balcão e Frete Grátis com Subsídio
-- ============================================================================

-- 1. Adicionar colunas relacionais tipadas nativas em loja_shipping_configs
ALTER TABLE public.loja_shipping_configs 
    ADD COLUMN IF NOT EXISTS retirada_balcao_ativa BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS frete_gratis_ativo BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS frete_gratis_valor_minimo NUMERIC(10,2) NOT NULL DEFAULT 0.00;

-- 2. Sincronizar retirada_balcao_ativa com permite_retirada_loja para registros pré-existentes
UPDATE public.loja_shipping_configs 
SET retirada_balcao_ativa = permite_retirada_loja 
WHERE retirada_balcao_ativa IS NULL;

-- 3. Comentários para documentação relacional do esquema
COMMENT ON COLUMN public.loja_shipping_configs.retirada_balcao_ativa IS 'Indica se a opção Retirar na Loja está habilitada para o catálogo e PDV';
COMMENT ON COLUMN public.loja_shipping_configs.frete_gratis_ativo IS 'Indica se a loja oferece política de frete grátis por valor mínimo';
COMMENT ON COLUMN public.loja_shipping_configs.frete_gratis_valor_minimo IS 'Valor mínimo de subtotal dos produtos no carrinho para concessão de frete grátis com subsídio';
