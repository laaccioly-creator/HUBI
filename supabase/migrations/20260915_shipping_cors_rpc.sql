-- ==============================================================================
-- MIGRATION: Funções RPC no Supabase para Cotação de Frete (Sem Bloqueio de CORS)
-- Executa as chamadas HTTP diretamente no servidor PostgreSQL através de extensions.http
-- ==============================================================================

-- 1. COTAÇÃO MELHOR ENVIO VIA SUPABASE RPC
CREATE OR REPLACE FUNCTION public.cotar_frete_melhor_envio_rpc(
    p_loja_id UUID,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '30s'
AS $$
DECLARE
    v_token TEXT;
    v_sandbox BOOLEAN;
    v_url TEXT;
    v_response extensions.http_response;
    v_json JSONB;
BEGIN
    PERFORM set_config('http.timeout_msec', '20000', true);

    -- Recupera credenciais diretamente da configuração da loja
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
        v_url := 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate';
    ELSE
        v_url := 'https://melhorenvio.com.br/api/v2/me/shipment/calculate';
    END IF;

    SELECT * INTO v_response FROM extensions.http((
        'POST',
        v_url,
        ARRAY[
            extensions.http_header('Accept', 'application/json'),
            extensions.http_header('Content-Type', 'application/json'),
            extensions.http_header('Authorization', 'Bearer ' || v_token),
            extensions.http_header('User-Agent', 'HUBI Sistema (suporte@hubi.app)')
        ],
        'application/json',
        p_payload::TEXT
    )::extensions.http_request);

    -- Fallback inteligente se der 401 (token emitido para sandbox testado em produção ou vice-versa)
    IF v_response.status = 401 THEN
        IF v_sandbox THEN
            v_url := 'https://melhorenvio.com.br/api/v2/me/shipment/calculate';
        ELSE
            v_url := 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate';
        END IF;

        SELECT * INTO v_response FROM extensions.http((
            'POST',
            v_url,
            ARRAY[
                extensions.http_header('Accept', 'application/json'),
                extensions.http_header('Content-Type', 'application/json'),
                extensions.http_header('Authorization', 'Bearer ' || v_token),
                extensions.http_header('User-Agent', 'HUBI Sistema (suporte@hubi.app)')
            ],
            'application/json',
            p_payload::TEXT
        )::extensions.http_request);
    END IF;

    BEGIN
        v_json := v_response.content::JSONB;
        RETURN jsonb_build_object(
            'sucesso', (v_response.status >= 200 AND v_response.status < 300),
            'status', v_response.status,
            'dados', v_json
        );
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'sucesso', false,
            'status', v_response.status,
            'erro', 'Resposta não JSON: ' || COALESCE(v_response.content, '')
        );
    END;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'sucesso', false,
        'erro', 'Erro ao executar cotação no Melhor Envio: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cotar_frete_melhor_envio_rpc(UUID, JSONB) TO anon, authenticated, service_role;


-- 2. COTAÇÃO UBER DIRECT VIA SUPABASE RPC
CREATE OR REPLACE FUNCTION public.cotar_frete_uber_rpc(
    p_loja_id UUID,
    p_pickup_address TEXT,
    p_dropoff_address TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '30s'
AS $$
DECLARE
    v_client_id TEXT;
    v_client_secret TEXT;
    v_customer_id TEXT;
    v_sandbox BOOLEAN;
    v_token_url TEXT := 'https://login.uber.com/oauth/v2/token';
    v_quote_url TEXT;
    v_token_res extensions.http_response;
    v_quote_res extensions.http_response;
    v_token_json JSONB;
    v_quote_json JSONB;
    v_access_token TEXT;
    v_body TEXT;
    v_quote_payload JSONB;
BEGIN
    PERFORM set_config('http.timeout_msec', '20000', true);

    SELECT uber_client_id, uber_client_secret, uber_customer_id, COALESCE(uber_sandbox_mode, false)
    INTO v_client_id, v_client_secret, v_customer_id, v_sandbox
    FROM public.loja_shipping_configs
    WHERE loja_id = p_loja_id;

    IF v_client_id IS NULL OR v_client_secret IS NULL OR v_customer_id IS NULL THEN
        RETURN jsonb_build_object(
            'sucesso', false,
            'erro', 'Credenciais Uber Direct não configuradas na loja.'
        );
    END IF;

    -- Obter Token OAuth2
    v_body := 'client_id=' || trim(v_client_id) ||
              '&client_secret=' || trim(v_client_secret) ||
              '&grant_type=client_credentials&scope=eats.deliveries';

    SELECT * INTO v_token_res FROM extensions.http((
        'POST',
        v_token_url,
        ARRAY[
            extensions.http_header('Content-Type', 'application/x-www-form-urlencoded')
        ],
        'application/x-www-form-urlencoded',
        v_body
    )::extensions.http_request);

    IF v_token_res.status != 200 THEN
        RETURN jsonb_build_object(
            'sucesso', false,
            'status', v_token_res.status,
            'erro', 'Falha na autenticação OAuth2 com a Uber: ' || COALESCE(v_token_res.content, '')
        );
    END IF;

    v_token_json := v_token_res.content::JSONB;
    v_access_token := v_token_json->>'access_token';

    IF v_access_token IS NULL THEN
        RETURN jsonb_build_object(
            'sucesso', false,
            'erro', 'Token de acesso não retornado pela Uber.'
        );
    END IF;

    -- Obter Cotação
    IF v_sandbox THEN
        v_quote_url := 'https://sandbox-api.uber.com/v1/customers/' || trim(v_customer_id) || '/delivery_quotes';
    ELSE
        v_quote_url := 'https://api.uber.com/v1/customers/' || trim(v_customer_id) || '/delivery_quotes';
    END IF;

    v_quote_payload := jsonb_build_object(
        'pickup_address', p_pickup_address,
        'dropoff_address', p_dropoff_address
    );

    SELECT * INTO v_quote_res FROM extensions.http((
        'POST',
        v_quote_url,
        ARRAY[
            extensions.http_header('Accept', 'application/json'),
            extensions.http_header('Content-Type', 'application/json'),
            extensions.http_header('Authorization', 'Bearer ' || v_access_token)
        ],
        'application/json',
        v_quote_payload::TEXT
    )::extensions.http_request);

    BEGIN
        v_quote_json := v_quote_res.content::JSONB;
        RETURN jsonb_build_object(
            'sucesso', (v_quote_res.status >= 200 AND v_quote_res.status < 300),
            'status', v_quote_res.status,
            'dados', v_quote_json
        );
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'sucesso', false,
            'status', v_quote_res.status,
            'erro', 'Resposta da Uber não pôde ser convertida em JSON: ' || COALESCE(v_quote_res.content, '')
        );
    END;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'sucesso', false,
        'erro', 'Erro ao executar cotação na Uber Direct: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cotar_frete_uber_rpc(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
