-- ==============================================================================
-- MIGRATION: 20261017140000_integracao_nativa_mercado_livre.sql
-- Integração Nativa Mercado Livre: Contas OAuth, Anúncios Vinculados e Webhooks
-- Governança: supabase-rls-guard | anti-jsonb-linter | pii-leak-detector
-- ==============================================================================

-- 1. EXTENSÃO DO DOMÍNIO DE ORIGEM E COLUNAS DE EXPEDIÇÃO EM public.pedidos
-- Remove constraint CHECK antiga se existir e adiciona com 'mercadolivre'
DO $$
BEGIN
    ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_origem_check;
    ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_origem_check 
        CHECK (origem::text = ANY (ARRAY['pdv_mobile'::text, 'pdv_desktop'::text, 'catalogo_online'::text, 'mercadolivre'::text]));
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

ALTER TABLE public.pedidos
    ADD COLUMN IF NOT EXISTS ml_order_id BIGINT NULL,
    ADD COLUMN IF NOT EXISTS ml_pack_id BIGINT NULL,
    ADD COLUMN IF NOT EXISTS ml_shipment_id BIGINT NULL,
    ADD COLUMN IF NOT EXISTS ml_logistic_type VARCHAR(40) NULL,
    ADD COLUMN IF NOT EXISTS ml_etiqueta_impressa BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ml_etiqueta_impressa_em TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_loja_ml_order_id
    ON public.pedidos(loja_id, ml_order_id)
    WHERE ml_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_ml_shipment_id
    ON public.pedidos(loja_id, ml_shipment_id)
    WHERE ml_shipment_id IS NOT NULL;

-- 2. TABELA: public.marketplace_contas
-- Armazena o vínculo OAuth 2.0 da loja com o Mercado Livre (1 conta ML por loja)
CREATE TABLE IF NOT EXISTS public.marketplace_contas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    provedor VARCHAR(30) NOT NULL DEFAULT 'mercadolivre'
        CONSTRAINT chk_marketplace_contas_provedor CHECK (provedor IN ('mercadolivre')),
    ml_user_id BIGINT NOT NULL,
    ml_nickname VARCHAR(120) NOT NULL,
    ml_site_id VARCHAR(10) NOT NULL DEFAULT 'MLB',
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expira_em TIMESTAMPTZ NOT NULL,
    escopos VARCHAR(255) NULL,
    status_conexao VARCHAR(25) NOT NULL DEFAULT 'conectado'
        CONSTRAINT chk_marketplace_contas_status CHECK (status_conexao IN ('conectado', 'expirado', 'erro_autenticacao', 'desconectado')),
    sincronizar_estoque_automatico BOOLEAN NOT NULL DEFAULT TRUE,
    importar_pedidos_automatico BOOLEAN NOT NULL DEFAULT TRUE,
    taxa_comissao_padrao_percentual NUMERIC(5,2) NOT NULL DEFAULT 16.00,
    taxa_fixa_padrao NUMERIC(10,2) NOT NULL DEFAULT 6.00,
    ultima_sincronizacao_em TIMESTAMPTZ NULL,
    ultimo_erro_mensagem VARCHAR(500) NULL,
    conectado_por_usuario_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_marketplace_contas_loja_provedor UNIQUE (loja_id, provedor),
    CONSTRAINT uq_marketplace_contas_ml_user UNIQUE (ml_user_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_contas_loja_id
    ON public.marketplace_contas(loja_id);

DROP TRIGGER IF EXISTS trg_marketplace_contas_updated_at ON public.marketplace_contas;
CREATE TRIGGER trg_marketplace_contas_updated_at
    BEFORE UPDATE ON public.marketplace_contas
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_atualizar_timestamp_modificacao();

-- 3. TABELA: public.marketplace_anuncios
-- Relaciona produtos/variações locais do HUBI aos itens/variações do Mercado Livre (MLB...)
CREATE TABLE IF NOT EXISTS public.marketplace_anuncios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    conta_id UUID NOT NULL REFERENCES public.marketplace_contas(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    variacao_id UUID NULL REFERENCES public.variacoes_produto(id) ON DELETE CASCADE,
    ml_item_id VARCHAR(30) NOT NULL, -- Ex: MLB384920192
    ml_variation_id BIGINT NULL,     -- Preenchido quando o anúncio possui grade no ML
    ml_category_id VARCHAR(30) NULL, -- Ex: MLB1430
    ml_listing_type_id VARCHAR(30) NOT NULL DEFAULT 'gold_special'
        CONSTRAINT chk_marketplace_anuncios_listing_type CHECK (ml_listing_type_id IN ('gold_pro', 'gold_special', 'free')),
    titulo_anuncio VARCHAR(60) NOT NULL,
    preco_anuncio NUMERIC(12,2) NOT NULL CHECK (preco_anuncio >= 0),
    margem_sobrepreco_percentual NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    estoque_ultimo_enviado INTEGER NOT NULL DEFAULT 0,
    status_anuncio VARCHAR(20) NOT NULL DEFAULT 'active'
        CONSTRAINT chk_marketplace_anuncios_status CHECK (status_anuncio IN ('active', 'paused', 'closed', 'under_review', 'erro_sincronia')),
    permalink VARCHAR(500) NULL,
    sincronizacao_ativa BOOLEAN NOT NULL DEFAULT TRUE,
    ultima_sincronizacao_estoque_em TIMESTAMPTZ NULL,
    ultimo_erro_sincronizacao VARCHAR(500) NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice único funcional para evitar duplicidade de anúncio e variação por loja
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_anuncios_item_var
    ON public.marketplace_anuncios(loja_id, ml_item_id, (COALESCE(ml_variation_id, 0)));

CREATE INDEX IF NOT EXISTS idx_marketplace_anuncios_loja_produto
    ON public.marketplace_anuncios(loja_id, produto_id, variacao_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_anuncios_ml_item
    ON public.marketplace_anuncios(ml_item_id, ml_variation_id);

DROP TRIGGER IF EXISTS trg_marketplace_anuncios_updated_at ON public.marketplace_anuncios;
CREATE TRIGGER trg_marketplace_anuncios_updated_at
    BEFORE UPDATE ON public.marketplace_anuncios
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_atualizar_timestamp_modificacao();

-- 4. TABELA: public.marketplace_pedidos_webhook
-- Log idempotente e estruturado de eventos recebidos do Mercado Livre (sem JSONB)
CREATE TABLE IF NOT EXISTS public.marketplace_pedidos_webhook (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    conta_id UUID NOT NULL REFERENCES public.marketplace_contas(id) ON DELETE CASCADE,
    ml_notification_id VARCHAR(80) NOT NULL,
    topico VARCHAR(40) NOT NULL
        CONSTRAINT chk_marketplace_webhook_topico CHECK (topico IN ('orders_v2', 'shipments', 'items')),
    recurso_uri VARCHAR(255) NOT NULL, -- Ex: /orders/2000004928192
    ml_resource_id BIGINT NOT NULL,    -- Ex: 2000004928192
    ml_user_id BIGINT NOT NULL,
    status_processamento VARCHAR(25) NOT NULL DEFAULT 'pendente'
        CONSTRAINT chk_marketplace_webhook_status CHECK (status_processamento IN ('pendente', 'processando', 'processado', 'ignorado', 'erro')),
    pedido_interno_id UUID NULL REFERENCES public.pedidos(id) ON DELETE SET NULL,
    tentativas INTEGER NOT NULL DEFAULT 1,
    mensagem_resultado VARCHAR(500) NULL,
    enviado_pelo_ml_em TIMESTAMPTZ NULL,
    processado_em TIMESTAMPTZ NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_marketplace_webhook_idempotencia UNIQUE (loja_id, topico, ml_resource_id, ml_notification_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_webhook_loja_status
    ON public.marketplace_pedidos_webhook(loja_id, status_processamento, criado_em DESC);

-- ==============================================================================
-- 5. BLINDAGEM RLS MULTI-TENANT (supabase-rls-guard)
-- ==============================================================================

ALTER TABLE public.marketplace_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_anuncios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_pedidos_webhook ENABLE ROW LEVEL SECURITY;

-- Políticas para public.marketplace_contas
DROP POLICY IF EXISTS "marketplace_contas_select_loja" ON public.marketplace_contas;
CREATE POLICY "marketplace_contas_select_loja" ON public.marketplace_contas
    FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "marketplace_contas_insert_loja" ON public.marketplace_contas;
CREATE POLICY "marketplace_contas_insert_loja" ON public.marketplace_contas
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "marketplace_contas_update_loja" ON public.marketplace_contas;
CREATE POLICY "marketplace_contas_update_loja" ON public.marketplace_contas
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
    WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "marketplace_contas_delete_loja" ON public.marketplace_contas;
CREATE POLICY "marketplace_contas_delete_loja" ON public.marketplace_contas
    FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

-- Políticas para public.marketplace_anuncios
DROP POLICY IF EXISTS "marketplace_anuncios_select_loja" ON public.marketplace_anuncios;
CREATE POLICY "marketplace_anuncios_select_loja" ON public.marketplace_anuncios
    FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "marketplace_anuncios_insert_loja" ON public.marketplace_anuncios;
CREATE POLICY "marketplace_anuncios_insert_loja" ON public.marketplace_anuncios
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "marketplace_anuncios_update_loja" ON public.marketplace_anuncios;
CREATE POLICY "marketplace_anuncios_update_loja" ON public.marketplace_anuncios
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
    WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "marketplace_anuncios_delete_loja" ON public.marketplace_anuncios;
CREATE POLICY "marketplace_anuncios_delete_loja" ON public.marketplace_anuncios
    FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

-- Políticas para public.marketplace_pedidos_webhook
DROP POLICY IF EXISTS "marketplace_webhook_select_loja" ON public.marketplace_pedidos_webhook;
CREATE POLICY "marketplace_webhook_select_loja" ON public.marketplace_pedidos_webhook
    FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "marketplace_webhook_insert_loja" ON public.marketplace_pedidos_webhook;
CREATE POLICY "marketplace_webhook_insert_loja" ON public.marketplace_pedidos_webhook
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "marketplace_webhook_update_loja" ON public.marketplace_pedidos_webhook;
CREATE POLICY "marketplace_webhook_update_loja" ON public.marketplace_pedidos_webhook
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
    WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "marketplace_webhook_delete_loja" ON public.marketplace_pedidos_webhook;
CREATE POLICY "marketplace_webhook_delete_loja" ON public.marketplace_pedidos_webhook
    FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

-- ==============================================================================
-- 6. PROTEÇÃO DE SEGREDOS (pii-leak-detector)
-- Revoga leitura direta das colunas access_token e refresh_token pelo role authenticated e anon
-- ==============================================================================
REVOKE SELECT (access_token, refresh_token) ON public.marketplace_contas FROM authenticated, anon;

-- ==============================================================================
-- 7. RPC ATÔMICA PARA PROCESSAMENTO DE PEDIDO MERCADO LIVRE E BAIXA DE ESTOQUE
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.processar_pedido_mercado_livre_atomico(
    p_loja_id UUID,
    p_ml_order_id BIGINT,
    p_ml_pack_id BIGINT,
    p_ml_shipment_id BIGINT,
    p_ml_logistic_type VARCHAR(40),
    p_cliente_nome VARCHAR(150),
    p_subtotal NUMERIC(12,2),
    p_valor_frete NUMERIC(12,2),
    p_valor_total NUMERIC(12,2),
    p_produto_id UUID,
    p_variacao_id UUID,
    p_quantidade INTEGER,
    p_preco_unitario NUMERIC(12,2)
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pedido_existente_id UUID;
    v_novo_pedido_id UUID;
    v_numero_pedido INTEGER;
BEGIN
    -- 1. Trava de Idempotência: se o ml_order_id já foi importado nesta loja, retorna o ID existente
    SELECT id INTO v_pedido_existente_id
    FROM public.pedidos
    WHERE loja_id = p_loja_id AND ml_order_id = p_ml_order_id
    FOR UPDATE;

    IF v_pedido_existente_id IS NOT NULL THEN
        RETURN v_pedido_existente_id;
    END IF;

    -- 2. Calcula próximo número sequencial do pedido na loja
    SELECT COALESCE(MAX(numero_pedido), 0) + 1 INTO v_numero_pedido
    FROM public.pedidos
    WHERE loja_id = p_loja_id;

    -- 3. Insere o cabeçalho em public.pedidos com origem 'mercadolivre'
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
        ml_order_id,
        ml_pack_id,
        ml_shipment_id,
        ml_logistic_type
    ) VALUES (
        p_loja_id,
        v_numero_pedido,
        'mercadolivre',
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
        'Pedido importado automaticamente via Mercado Livre (#' || p_ml_order_id::TEXT || ')',
        NOW(),
        p_ml_order_id,
        p_ml_pack_id,
        p_ml_shipment_id,
        p_ml_logistic_type
    )
    RETURNING id INTO v_novo_pedido_id;

    -- 4. Busca nome do produto e rótulo da variação para preencher colunas NOT NULL de itens_pedido
    DECLARE
        v_nome_prod VARCHAR;
        v_rotulo_var VARCHAR;
    BEGIN
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
            COALESCE(v_nome_prod, 'Produto Mercado Livre'),
            v_rotulo_var,
            p_quantidade,
            p_preco_unitario,
            ROUND(p_quantidade * p_preco_unitario, 2)
        );
    END;

    -- 5. Abate imediatamente o saldo físico local (com ROW LOCK FOR UPDATE)
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
$$;
