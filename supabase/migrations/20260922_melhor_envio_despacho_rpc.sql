-- ==============================================================================
-- MIGRATION: Despacho e Geração de Etiquetas Melhor Envio via Backend / RPC
-- Executa chamadas à API do Melhor Envio via backend sem restrição de CORS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.despachar_melhor_envio_rpc(
    p_loja_id UUID,
    p_pedido_id UUID,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '60s'
AS $$
DECLARE
    v_token TEXT;
    v_sandbox BOOLEAN;
    v_base_url TEXT;
    v_response extensions.http_response;
    v_cart_json JSONB;
    v_order_id TEXT;
    v_checkout_res extensions.http_response;
    v_tracking TEXT;
    v_url_etiqueta TEXT;
    v_url_rastreio TEXT;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    PERFORM set_config('http.timeout_msec', '30000', true);

    -- Recupera credenciais da loja
    SELECT melhor_envio_token, COALESCE(melhor_envio_sandbox_mode, false)
    INTO v_token, v_sandbox
    FROM public.loja_shipping_configs
    WHERE loja_id = p_loja_id;

    IF v_token IS NULL OR trim(v_token) = '' THEN
        RETURN jsonb_build_object(
            'sucesso', false,
            'erro', 'Token do Melhor Envio não configurado para esta loja.'
        );
    END IF;

    v_token := trim(v_token);

    IF v_sandbox THEN
        v_base_url := 'https://sandbox.melhorenvio.com.br';
    ELSE
        v_base_url := 'https://melhorenvio.com.br';
    END IF;

    -- 1. Inserção no Carrinho (POST /api/v2/me/cart)
    SELECT * INTO v_response FROM extensions.http((
        'POST',
        v_base_url || '/api/v2/me/cart',
        ARRAY[
            extensions.http_header('Accept', 'application/json'),
            extensions.http_header('Content-Type', 'application/json'),
            extensions.http_header('Authorization', 'Bearer ' || v_token),
            extensions.http_header('User-Agent', 'HUBI Sistema (suporte@hubi.app)')
        ],
        'application/json',
        p_payload::TEXT
    )::extensions.http_request);

    IF v_response.status < 200 OR v_response.status >= 300 THEN
        RETURN jsonb_build_object(
            'sucesso', false,
            'status', v_response.status,
            'erro', 'Erro ao adicionar envio ao carrinho do Melhor Envio: ' || COALESCE(v_response.content, '')
        );
    END IF;

    BEGIN
        v_cart_json := v_response.content::JSONB;
        v_order_id := v_cart_json->>'id';
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'sucesso', false,
            'erro', 'Resposta inválida do Melhor Envio ao criar ordem no carrinho.'
        );
    END;

    IF v_order_id IS NULL OR trim(v_order_id) = '' THEN
        RETURN jsonb_build_object(
            'sucesso', false,
            'erro', 'Melhor Envio não retornou o ID da ordem criada.'
        );
    END IF;

    -- 2. Checkout / Compra da Etiqueta (POST /api/v2/me/shipment/checkout)
    SELECT * INTO v_checkout_res FROM extensions.http((
        'POST',
        v_base_url || '/api/v2/me/shipment/checkout',
        ARRAY[
            extensions.http_header('Accept', 'application/json'),
            extensions.http_header('Content-Type', 'application/json'),
            extensions.http_header('Authorization', 'Bearer ' || v_token),
            extensions.http_header('User-Agent', 'HUBI Sistema (suporte@hubi.app)')
        ],
        'application/json',
        jsonb_build_object('orders', jsonb_build_array(v_order_id))::TEXT
    )::extensions.http_request);

    -- 3. Geração da Etiqueta (POST /api/v2/me/shipment/generate)
    PERFORM extensions.http((
        'POST',
        v_base_url || '/api/v2/me/shipment/generate',
        ARRAY[
            extensions.http_header('Accept', 'application/json'),
            extensions.http_header('Content-Type', 'application/json'),
            extensions.http_header('Authorization', 'Bearer ' || v_token),
            extensions.http_header('User-Agent', 'HUBI Sistema (suporte@hubi.app)')
        ],
        'application/json',
        jsonb_build_object('orders', jsonb_build_array(v_order_id))::TEXT
    )::extensions.http_request);

    v_tracking := COALESCE(v_cart_json->>'tracking', v_cart_json->>'protocol', v_order_id);
    v_url_rastreio := 'https://melhorrastreio.com.br/rastreio/' || v_tracking;
    v_url_etiqueta := v_base_url || '/painel/envios';

    -- 4. Atualiza tabelas caso pedido_id seja fornecido
    IF p_pedido_id IS NOT NULL THEN
        UPDATE public.pedido_entregas
        SET codigo_rastreio = v_tracking,
            link_rastreio = v_url_rastreio,
            link_etiqueta = v_url_etiqueta,
            status_envio = 'despachado',
            despachado_em = v_now,
            atualizado_em = v_now
        WHERE pedido_id = p_pedido_id;

        UPDATE public.pedidos
        SET status = CASE WHEN status = 'concluido' THEN 'concluido' WHEN status = 'cancelado' THEN 'cancelado' ELSE 'enviado' END,
            codigo_rastreio = v_tracking,
            link_rastreio = v_url_rastreio,
            despachado_em = v_now,
            atualizado_em = v_now
        WHERE id = p_pedido_id;
    END IF;

    RETURN jsonb_build_object(
        'sucesso', true,
        'ordem_id', v_order_id,
        'codigo_rastreio', v_tracking,
        'link_rastreio', v_url_rastreio,
        'link_etiqueta', v_url_etiqueta
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'sucesso', false,
        'erro', 'Exceção ao despachar no Melhor Envio: ' || SQLERRM
    );
END;
$$;

-- Permissões de execução
GRANT EXECUTE ON FUNCTION public.despachar_melhor_envio_rpc(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.despachar_melhor_envio_rpc(UUID, UUID, JSONB) TO service_role;
