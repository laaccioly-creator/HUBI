-- Migration idempotente para unificar a arquitetura multi-marketplace (Mercado Livre + Shopee)
-- Regras: Arquitetura Relacional Pura (zero colunas JSONB), mantendo isolamento por loja_id e RLS existente.

-- 1. marketplace_contas: suporte a plataforma='shopee', seller_id, refresh_token_expires_at e credenciais opcionais por loja
ALTER TABLE public.marketplace_contas
  ADD COLUMN IF NOT EXISTS plataforma VARCHAR(30) NOT NULL DEFAULT 'mercadolivre',
  ADD COLUMN IF NOT EXISTS seller_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shopee_partner_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS shopee_partner_key TEXT;

UPDATE public.marketplace_contas
SET
  plataforma = COALESCE(NULLIF(provedor, ''), 'mercadolivre'),
  seller_id = COALESCE(seller_id, ml_user_id::TEXT)
WHERE plataforma IS DISTINCT FROM COALESCE(NULLIF(provedor, ''), 'mercadolivre')
   OR seller_id IS NULL;

ALTER TABLE public.marketplace_contas
  DROP CONSTRAINT IF EXISTS chk_marketplace_contas_provedor;
ALTER TABLE public.marketplace_contas
  ADD CONSTRAINT chk_marketplace_contas_provedor CHECK (provedor IN ('mercadolivre', 'shopee'));

ALTER TABLE public.marketplace_contas
  DROP CONSTRAINT IF EXISTS chk_marketplace_contas_plataforma;
ALTER TABLE public.marketplace_contas
  ADD CONSTRAINT chk_marketplace_contas_plataforma CHECK (plataforma IN ('mercadolivre', 'shopee'));

ALTER TABLE public.marketplace_contas
  DROP CONSTRAINT IF EXISTS uq_marketplace_contas_ml_user;
DROP INDEX IF EXISTS public.uq_marketplace_contas_ml_user;
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_contas_provedor_user
  ON public.marketplace_contas (provedor, ml_user_id);

-- 2. marketplace_anuncios: diferenciar anúncios por plataforma ('mercadolivre' | 'shopee')
ALTER TABLE public.marketplace_anuncios
  ADD COLUMN IF NOT EXISTS plataforma VARCHAR(30) NOT NULL DEFAULT 'mercadolivre';

ALTER TABLE public.marketplace_anuncios
  DROP CONSTRAINT IF EXISTS chk_marketplace_anuncios_plataforma;
ALTER TABLE public.marketplace_anuncios
  ADD CONSTRAINT chk_marketplace_anuncios_plataforma CHECK (plataforma IN ('mercadolivre', 'shopee'));

ALTER TABLE public.marketplace_anuncios
  DROP CONSTRAINT IF EXISTS chk_marketplace_anuncios_listing_type;
ALTER TABLE public.marketplace_anuncios
  ADD CONSTRAINT chk_marketplace_anuncios_listing_type CHECK (
    ml_listing_type_id IN ('gold_pro', 'gold_special', 'free', 'shopee_padrao')
  );

DROP INDEX IF EXISTS public.uq_marketplace_anuncios_item_var;
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_anuncios_plat_item_var
  ON public.marketplace_anuncios (loja_id, plataforma, ml_item_id, COALESCE(ml_variation_id, 0::bigint));

CREATE INDEX IF NOT EXISTS idx_marketplace_anuncios_loja_plataforma
  ON public.marketplace_anuncios (loja_id, plataforma);

CREATE INDEX IF NOT EXISTS idx_marketplace_anuncios_loja_plat_item
  ON public.marketplace_anuncios (loja_id, plataforma, ml_item_id);

-- 3. marketplace_lotes_publicacao: histórico relacional em massa também para Shopee
ALTER TABLE public.marketplace_lotes_publicacao
  ADD COLUMN IF NOT EXISTS plataforma VARCHAR(30) NOT NULL DEFAULT 'mercadolivre';

ALTER TABLE public.marketplace_lotes_publicacao
  DROP CONSTRAINT IF EXISTS chk_marketplace_lotes_plataforma;
ALTER TABLE public.marketplace_lotes_publicacao
  ADD CONSTRAINT chk_marketplace_lotes_plataforma CHECK (plataforma IN ('mercadolivre', 'shopee'));

ALTER TABLE public.marketplace_lotes_publicacao
  DROP CONSTRAINT IF EXISTS marketplace_lotes_publicacao_tipo_exposicao_check;
ALTER TABLE public.marketplace_lotes_publicacao
  ADD CONSTRAINT marketplace_lotes_publicacao_tipo_exposicao_check CHECK (
    tipo_exposicao IN ('gold_special', 'gold_pro', 'shopee_padrao')
  );

CREATE INDEX IF NOT EXISTS idx_marketplace_lotes_loja_plataforma
  ON public.marketplace_lotes_publicacao (loja_id, plataforma, iniciado_em DESC);

-- 4. marketplace_pedidos_webhook: auditoria/idempotência por plataforma
ALTER TABLE public.marketplace_pedidos_webhook
  ADD COLUMN IF NOT EXISTS plataforma VARCHAR(30) NOT NULL DEFAULT 'mercadolivre';

ALTER TABLE public.marketplace_pedidos_webhook
  DROP CONSTRAINT IF EXISTS chk_marketplace_webhook_plataforma;
ALTER TABLE public.marketplace_pedidos_webhook
  ADD CONSTRAINT chk_marketplace_webhook_plataforma CHECK (plataforma IN ('mercadolivre', 'shopee'));

-- 5. pedidos: suporte a origem='shopee' e chave tipada idempotente shopee_order_sn
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS shopee_order_sn VARCHAR(80);

ALTER TABLE public.pedidos
  DROP CONSTRAINT IF EXISTS pedidos_origem_check;
ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_origem_check CHECK (
    origem IN ('pdv_mobile', 'pdv_desktop', 'catalogo_online', 'mercadolivre', 'shopee')
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_loja_shopee_order_sn
  ON public.pedidos (loja_id, shopee_order_sn)
  WHERE shopee_order_sn IS NOT NULL;

-- 6. RPC Atômica para importação de pedidos da Shopee + baixa de estoque com idempotência por order_sn
CREATE OR REPLACE FUNCTION public.processar_pedido_shopee_atomico(
    p_loja_id uuid,
    p_shopee_order_sn character varying,
    p_cliente_nome character varying,
    p_subtotal numeric,
    p_valor_frete numeric,
    p_valor_total numeric,
    p_produto_id uuid,
    p_variacao_id uuid,
    p_quantidade integer,
    p_preco_unitario numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_pedido_existente_id UUID;
    v_novo_pedido_id UUID;
    v_numero_pedido INTEGER;
    v_nome_prod VARCHAR;
    v_rotulo_var VARCHAR;
BEGIN
    -- 1. Trava de Idempotência: se o shopee_order_sn já foi importado nesta loja, retorna o ID existente
    SELECT id INTO v_pedido_existente_id
    FROM public.pedidos
    WHERE loja_id = p_loja_id AND shopee_order_sn = p_shopee_order_sn
    FOR UPDATE;

    IF v_pedido_existente_id IS NOT NULL THEN
        RETURN v_pedido_existente_id;
    END IF;

    -- 2. Próximo número sequencial do pedido na loja
    SELECT COALESCE(MAX(numero_pedido), 0) + 1 INTO v_numero_pedido
    FROM public.pedidos
    WHERE loja_id = p_loja_id;

    -- 3. Insere pedido em public.pedidos com origem = 'shopee'
    INSERT INTO public.pedidos (
        loja_id,
        numero_pedido,
        origem,
        tabela_preco_aplicada,
        status,
        status_pagamento,
        estoque_baixado,
        subtotal,
        valor_desconto,
        valor_frete,
        valor_total,
        valor_pago,
        saldo_devedor,
        fiado_quitado,
        cliente_nome_avulso,
        observacoes,
        data_venda,
        shopee_order_sn
    ) VALUES (
        p_loja_id,
        v_numero_pedido,
        'shopee',
        'varejo',
        'aguardando_envio',
        'pago',
        TRUE,
        p_subtotal,
        0,
        p_valor_frete,
        p_valor_total,
        p_valor_total,
        0,
        TRUE,
        p_cliente_nome,
        'Pedido importado automaticamente via Shopee (#' || p_shopee_order_sn || ')',
        NOW(),
        p_shopee_order_sn
    )
    RETURNING id INTO v_novo_pedido_id;

    -- 4. Busca nome do produto/variação e grava item em public.itens_pedido
    SELECT nome INTO v_nome_prod FROM public.produtos WHERE id = p_produto_id;
    IF p_variacao_id IS NOT NULL THEN
        SELECT combinacao_nome INTO v_rotulo_var FROM public.variacoes_produto WHERE id = p_variacao_id;
    END IF;

    INSERT INTO public.itens_pedido (
        loja_id,
        pedido_id,
        produto_id,
        variacao_id,
        nome_produto,
        rotulo_variacao,
        quantidade,
        preco_venda_unitario,
        subtotal
    ) VALUES (
        p_loja_id,
        v_novo_pedido_id,
        p_produto_id,
        p_variacao_id,
        COALESCE(v_nome_prod, 'Produto Shopee'),
        v_rotulo_var,
        p_quantidade,
        p_preco_unitario,
        ROUND(p_quantidade * p_preco_unitario, 2)
    );

    -- 5. Abate imediatamente o saldo físico local
    IF p_variacao_id IS NOT NULL THEN
        UPDATE public.variacoes_produto
        SET quantidade_estoque = GREATEST(0, COALESCE(quantidade_estoque, 0) - p_quantidade)
        WHERE id = p_variacao_id AND loja_id = p_loja_id;
    END IF;

    UPDATE public.produtos
    SET quantidade_estoque = GREATEST(0, COALESCE(quantidade_estoque, 0) - p_quantidade)
    WHERE id = p_produto_id AND loja_id = p_loja_id;

    RETURN v_novo_pedido_id;
END;
$function$;
