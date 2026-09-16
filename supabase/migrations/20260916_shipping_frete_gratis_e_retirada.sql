-- ============================================================================
-- MIGRAÇÃO: Suporte Relacional a Retirar na Loja e Frete Grátis com Subsídio
-- DIRETRIZ: 100% Relacional tipado nativo, zero JSONB/metadados
-- ============================================================================

-- 1. Adicionar colunas relacionais tipadas nativas em lojas
ALTER TABLE public.lojas 
    ADD COLUMN IF NOT EXISTS retirada_loja_ativa BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS frete_gratis_ativo BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS frete_gratis_valor_minimo NUMERIC(10,2) NOT NULL DEFAULT 0.00;

-- 2. Adicionar colunas relacionais tipadas nativas em loja_shipping_configs
ALTER TABLE public.loja_shipping_configs 
    ADD COLUMN IF NOT EXISTS retirada_loja_ativa BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS retirada_balcao_ativa BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS frete_gratis_ativo BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS frete_gratis_valor_minimo NUMERIC(10,2) NOT NULL DEFAULT 0.00;

-- 3. Sincronizar retirada_loja_ativa a partir de configurações pré-existentes
UPDATE public.lojas 
SET retirada_loja_ativa = COALESCE(
    (configuracoes_extras->'entrega_retirada'->>'trabalho_com_retirada')::boolean,
    false
)
WHERE retirada_loja_ativa IS NULL;

UPDATE public.loja_shipping_configs 
SET 
    retirada_loja_ativa = COALESCE(retirada_balcao_ativa, permite_retirada_loja, false),
    retirada_balcao_ativa = COALESCE(retirada_balcao_ativa, permite_retirada_loja, false)
WHERE retirada_loja_ativa IS NULL;

-- 4. Comentários para documentação relacional do esquema
COMMENT ON COLUMN public.lojas.retirada_loja_ativa IS 'Indica se a opção Retirar na Loja está habilitada para o catálogo e PDV';
COMMENT ON COLUMN public.lojas.frete_gratis_ativo IS 'Indica se a loja oferece política de frete grátis por valor mínimo';
COMMENT ON COLUMN public.lojas.frete_gratis_valor_minimo IS 'Valor mínimo de subtotal dos produtos no carrinho para concessão de frete grátis com subsídio';

COMMENT ON COLUMN public.loja_shipping_configs.retirada_loja_ativa IS 'Indica se a opção Retirar na Loja está habilitada para o catálogo e PDV';
COMMENT ON COLUMN public.loja_shipping_configs.frete_gratis_ativo IS 'Indica se a loja oferece política de frete grátis por valor mínimo';
COMMENT ON COLUMN public.loja_shipping_configs.frete_gratis_valor_minimo IS 'Valor mínimo de subtotal dos produtos no carrinho para concessão de frete grátis com subsídio';
