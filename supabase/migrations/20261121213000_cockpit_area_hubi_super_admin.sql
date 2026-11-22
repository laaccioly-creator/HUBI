-- ==============================================================================
-- MIGRATION: 20261121213000_cockpit_area_hubi_super_admin.sql
-- Módulo: Cockpit Executivo Área HUBI & Gestão Comercial de Leads/Assinantes
-- Governança: supabase-rls-guard, anti-jsonb-linter, pii-leak-detector
-- ==============================================================================

-- 1. COLUNAS RELACIONAIS DE METAS EXECUTIVAS EM public.configuracoes_plataforma
ALTER TABLE public.configuracoes_plataforma
    ADD COLUMN IF NOT EXISTS meta_hubi_faturamento NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS meta_hubi_vendas INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS meta_hubi_conversao_percentual NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS meta_hubi_max_nao_renovados INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS meta_hubi_lojas_ativas INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS meta_hubi_receita_whatsapp NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

-- 2. COLUNA RELACIONAL PARA NOTAS COMERCIAIS DE PAGAMENTO MANUAL
ALTER TABLE public.hubi_assinaturas_pagamentos
    ADD COLUMN IF NOT EXISTS observacoes_admin TEXT NULL;

-- 3. RPC CROSS-TENANT DO COCKPIT EXECUTIVO ÁREA HUBI (EXCLUSIVA SUPER ADMIN)
CREATE OR REPLACE FUNCTION public.obter_dados_cockpit_area_hubi(
    p_data_inicio TIMESTAMPTZ DEFAULT NULL,
    p_data_fim TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_agora TIMESTAMPTZ := NOW();
    v_inicio TIMESTAMPTZ := COALESCE(p_data_inicio, date_trunc('month', v_agora));
    v_fim TIMESTAMPTZ := COALESCE(p_data_fim, v_agora);
    v_faturamento_assinaturas NUMERIC(12, 2) := 0.00;
    v_receita_whatsapp NUMERIC(12, 2) := 0.00;
    v_volume_assinaturas INTEGER := 0;
    v_cadastros_periodo INTEGER := 0;
    v_assinantes_periodo INTEGER := 0;
    v_taxa_conversao NUMERIC(6, 2) := 0.00;
    v_nao_renovados_expirados INTEGER := 0;
    v_lojas_ativas_pagantes INTEGER := 0;
    v_metas JSONB;
    v_lojas JSONB;
BEGIN
    IF NOT public.eh_super_admin_plataforma() THEN
        RAISE EXCEPTION 'Acesso negado: exclusivo para o Super Admin da plataforma.';
    END IF;

    -- Metas globais HUBI (singleton id = 1)
    SELECT jsonb_build_object(
        'meta_hubi_faturamento', COALESCE(cp.meta_hubi_faturamento, 0.00),
        'meta_hubi_vendas', COALESCE(cp.meta_hubi_vendas, 0),
        'meta_hubi_conversao_percentual', COALESCE(cp.meta_hubi_conversao_percentual, 0.00),
        'meta_hubi_max_nao_renovados', COALESCE(cp.meta_hubi_max_nao_renovados, 0),
        'meta_hubi_lojas_ativas', COALESCE(cp.meta_hubi_lojas_ativas, 0),
        'meta_hubi_receita_whatsapp', COALESCE(cp.meta_hubi_receita_whatsapp, 0.00)
    )
    INTO v_metas
    FROM public.configuracoes_plataforma cp
    WHERE cp.id = 1;

    IF v_metas IS NULL THEN
        v_metas := jsonb_build_object(
            'meta_hubi_faturamento', 0.00,
            'meta_hubi_vendas', 0,
            'meta_hubi_conversao_percentual', 0.00,
            'meta_hubi_max_nao_renovados', 0,
            'meta_hubi_lojas_ativas', 0,
            'meta_hubi_receita_whatsapp', 0.00
        );
    END IF;

    -- Assinaturas aprovadas (Mercado Pago + Ativações Manuais) no período
    SELECT
        COALESCE(SUM(hap.valor_total), 0.00),
        COUNT(*)::INTEGER
    INTO v_faturamento_assinaturas, v_volume_assinaturas
    FROM public.hubi_assinaturas_pagamentos hap
    WHERE hap.status_pagamento = 'approved'
      AND COALESCE(hap.aprovado_em, hap.criado_em) >= v_inicio
      AND COALESCE(hap.aprovado_em, hap.criado_em) <= v_fim;

    -- Recargas Pix aprovadas na Carteira WhatsApp no período
    SELECT
        COALESCE(SUM(lwt.valor), 0.00)
    INTO v_receita_whatsapp
    FROM public.loja_whatsapp_transacoes lwt
    WHERE lwt.tipo = 'recarga_pix'
      AND lwt.status_pagamento = 'concluido'
      AND lwt.criado_em >= v_inicio
      AND lwt.criado_em <= v_fim;

    -- Cadastros de lojas no período e conversão Trial -> Assinante
    SELECT
        COUNT(*)::INTEGER,
        COUNT(*) FILTER (
            WHERE l.status_assinatura = 'ativo'
               OR EXISTS (
                   SELECT 1
                   FROM public.hubi_assinaturas_pagamentos hap
                   WHERE hap.loja_id = l.id
                     AND hap.status_pagamento = 'approved'
               )
        )::INTEGER
    INTO v_cadastros_periodo, v_assinantes_periodo
    FROM public.lojas l
    WHERE l.criado_em >= v_inicio
      AND l.criado_em <= v_fim;

    IF v_cadastros_periodo > 0 THEN
        v_taxa_conversao := ROUND((v_assinantes_periodo::NUMERIC / v_cadastros_periodo::NUMERIC) * 100.0, 2);
    END IF;

    -- Carteira segmentada de lojas + histórico de pagamentos por loja
    WITH lojas_classificadas AS (
        SELECT
            l.id,
            l.organizacao_id,
            l.nome_fantasia,
            l.razao_social,
            l.tipo_documento,
            l.numero_documento,
            l.whatsapp,
            l.email,
            l.endereco_cep,
            l.endereco_logradouro,
            l.endereco_numero,
            l.endereco_complemento,
            l.endereco_bairro,
            l.endereco_cidade,
            l.endereco_estado,
            l.status_assinatura,
            l.trial_fim_em,
            l.assinatura_fim_em,
            l.criado_em,
            COALESCE(pg.qtd_aprovados, 0) AS total_pagamentos_aprovados,
            COALESCE(pg.total_pago, 0.00) AS total_investido,
            COALESCE(pg.lista_pagamentos, '[]'::JSONB) AS pagamentos,
            (COALESCE(pg.qtd_aprovados, 0) > 0) AS ja_assinou,
            CASE
                WHEN l.status_assinatura = 'ativo'
                     AND (l.assinatura_fim_em IS NULL OR l.assinatura_fim_em >= v_agora)
                    THEN 'assinante_ativo'
                WHEN COALESCE(pg.qtd_aprovados, 0) > 0
                     OR l.status_assinatura = 'atrasado'
                     OR l.assinatura_fim_em IS NOT NULL
                    THEN 'churn_nao_renovado'
                WHEN l.status_assinatura = 'trial'
                     AND (l.trial_fim_em IS NULL OR l.trial_fim_em >= v_agora)
                    THEN 'trial_ativo'
                ELSE 'trial_vencido'
            END AS estagio_comercial
        FROM public.lojas l
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) FILTER (WHERE hap.status_pagamento = 'approved')::INTEGER AS qtd_aprovados,
                COALESCE(SUM(hap.valor_total) FILTER (WHERE hap.status_pagamento = 'approved'), 0.00) AS total_pago,
                COALESCE(
                    jsonb_agg(
                        jsonb_build_object(
                            'id', hap.id,
                            'status_pagamento', hap.status_pagamento,
                            'meio_pagamento', hap.meio_pagamento,
                            'bandeira_metodo', hap.bandeira_metodo,
                            'valor_total', hap.valor_total,
                            'ciclo_meses', hap.ciclo_meses,
                            'periodo_inicio_em', hap.periodo_inicio_em,
                            'periodo_fim_em', hap.periodo_fim_em,
                            'aprovado_em', hap.aprovado_em,
                            'criado_em', hap.criado_em,
                            'observacoes_admin', hap.observacoes_admin
                        )
                        ORDER BY COALESCE(hap.aprovado_em, hap.criado_em) DESC
                    ),
                    '[]'::JSONB
                ) AS lista_pagamentos
            FROM public.hubi_assinaturas_pagamentos hap
            WHERE hap.loja_id = l.id
        ) pg ON TRUE
    ),
    lojas_enriquecidas AS (
        SELECT
            lc.*,
            CASE
                WHEN lc.estagio_comercial = 'trial_ativo' THEN
                    GREATEST(0, CEIL(EXTRACT(EPOCH FROM (COALESCE(lc.trial_fim_em, v_agora) - v_agora)) / 86400.0))::INTEGER
                WHEN lc.estagio_comercial = 'trial_vencido' THEN
                    GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (v_agora - COALESCE(lc.trial_fim_em, lc.criado_em, v_agora))) / 86400.0))::INTEGER
                WHEN lc.estagio_comercial = 'churn_nao_renovado' THEN
                    GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (v_agora - COALESCE(lc.assinatura_fim_em, lc.trial_fim_em, lc.criado_em, v_agora))) / 86400.0))::INTEGER
                WHEN lc.estagio_comercial = 'assinante_ativo' THEN
                    CASE
                        WHEN lc.assinatura_fim_em IS NULL THEN 365
                        ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (lc.assinatura_fim_em - v_agora)) / 86400.0))::INTEGER
                    END
                ELSE 0
            END AS dias_referencia
        FROM lojas_classificadas lc
    )
    SELECT
        COUNT(*) FILTER (WHERE le.estagio_comercial IN ('trial_vencido', 'churn_nao_renovado'))::INTEGER,
        COUNT(*) FILTER (WHERE le.estagio_comercial = 'assinante_ativo')::INTEGER,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', le.id,
                    'organizacao_id', le.organizacao_id,
                    'nome_fantasia', le.nome_fantasia,
                    'razao_social', le.razao_social,
                    'tipo_documento', le.tipo_documento,
                    'numero_documento', le.numero_documento,
                    'whatsapp', le.whatsapp,
                    'email', le.email,
                    'endereco_cep', le.endereco_cep,
                    'endereco_logradouro', le.endereco_logradouro,
                    'endereco_numero', le.endereco_numero,
                    'endereco_complemento', le.endereco_complemento,
                    'endereco_bairro', le.endereco_bairro,
                    'endereco_cidade', le.endereco_cidade,
                    'endereco_estado', le.endereco_estado,
                    'status_assinatura', le.status_assinatura,
                    'trial_fim_em', le.trial_fim_em,
                    'assinatura_fim_em', le.assinatura_fim_em,
                    'criado_em', le.criado_em,
                    'ja_assinou', le.ja_assinou,
                    'total_pagamentos_aprovados', le.total_pagamentos_aprovados,
                    'total_investido', le.total_investido,
                    'estagio_comercial', le.estagio_comercial,
                    'dias_referencia', le.dias_referencia,
                    'pagamentos', le.pagamentos
                )
                ORDER BY
                    CASE le.estagio_comercial
                        WHEN 'trial_ativo' THEN 1
                        WHEN 'trial_vencido' THEN 2
                        WHEN 'churn_nao_renovado' THEN 3
                        WHEN 'assinante_ativo' THEN 4
                        ELSE 5
                    END,
                    le.criado_em DESC
            ),
            '[]'::JSONB
        )
    INTO v_nao_renovados_expirados, v_lojas_ativas_pagantes, v_lojas
    FROM lojas_enriquecidas le;

    RETURN jsonb_build_object(
        'metas', v_metas,
        'metricas', jsonb_build_object(
            'faturamento_bruto_hubi', ROUND(v_faturamento_assinaturas + v_receita_whatsapp, 2),
            'faturamento_assinaturas', v_faturamento_assinaturas,
            'receita_whatsapp', v_receita_whatsapp,
            'volume_assinaturas', v_volume_assinaturas,
            'cadastros_periodo', v_cadastros_periodo,
            'assinantes_do_periodo', v_assinantes_periodo,
            'taxa_conversao_percentual', v_taxa_conversao,
            'nao_renovados_e_expirados', v_nao_renovados_expirados,
            'lojas_ativas_pagantes', v_lojas_ativas_pagantes
        ),
        'lojas', v_lojas
    );
END;
$$;

-- 4. RPC DE EDIÇÃO CADASTRAL E DE VIGÊNCIA PELO SUPER ADMIN
CREATE OR REPLACE FUNCTION public.admin_atualizar_dados_loja(
    p_loja_id UUID,
    p_nome_fantasia TEXT,
    p_razao_social TEXT DEFAULT NULL,
    p_tipo_documento VARCHAR DEFAULT NULL,
    p_numero_documento TEXT DEFAULT NULL,
    p_whatsapp TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_endereco_cep TEXT DEFAULT NULL,
    p_endereco_logradouro TEXT DEFAULT NULL,
    p_endereco_numero TEXT DEFAULT NULL,
    p_endereco_complemento TEXT DEFAULT NULL,
    p_endereco_bairro TEXT DEFAULT NULL,
    p_endereco_cidade TEXT DEFAULT NULL,
    p_endereco_estado TEXT DEFAULT NULL,
    p_status_assinatura VARCHAR DEFAULT 'trial',
    p_trial_fim_em TIMESTAMPTZ DEFAULT NULL,
    p_assinatura_fim_em TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_tipo_doc VARCHAR(10);
    v_status VARCHAR(20);
BEGIN
    IF NOT public.eh_super_admin_plataforma() THEN
        RAISE EXCEPTION 'Acesso negado: exclusivo para o Super Admin da plataforma.';
    END IF;

    IF p_loja_id IS NULL THEN
        RAISE EXCEPTION 'Loja não informada.';
    END IF;

    IF NULLIF(TRIM(p_nome_fantasia), '') IS NULL THEN
        RAISE EXCEPTION 'O Nome Fantasia da loja é obrigatório.';
    END IF;

    v_tipo_doc := UPPER(NULLIF(TRIM(p_tipo_documento), ''));
    IF v_tipo_doc IS NOT NULL AND v_tipo_doc NOT IN ('CPF', 'CNPJ') THEN
        v_tipo_doc := CASE
            WHEN LENGTH(REGEXP_REPLACE(COALESCE(p_numero_documento, ''), '\D', '', 'g')) > 11 THEN 'CNPJ'
            ELSE 'CPF'
        END;
    END IF;

    v_status := LOWER(COALESCE(NULLIF(TRIM(p_status_assinatura), ''), 'trial'));
    IF v_status NOT IN ('trial', 'ativo', 'atrasado', 'bloqueado') THEN
        RAISE EXCEPTION 'Status de assinatura inválido.';
    END IF;

    UPDATE public.lojas
    SET
        nome_fantasia = TRIM(p_nome_fantasia),
        razao_social = NULLIF(TRIM(p_razao_social), ''),
        tipo_documento = v_tipo_doc,
        numero_documento = NULLIF(TRIM(p_numero_documento), ''),
        whatsapp = COALESCE(NULLIF(TRIM(p_whatsapp), ''), whatsapp),
        email = COALESCE(NULLIF(TRIM(p_email), ''), email),
        endereco_cep = NULLIF(TRIM(p_endereco_cep), ''),
        endereco_logradouro = NULLIF(TRIM(p_endereco_logradouro), ''),
        endereco_numero = NULLIF(TRIM(p_endereco_numero), ''),
        endereco_complemento = NULLIF(TRIM(p_endereco_complemento), ''),
        endereco_bairro = NULLIF(TRIM(p_endereco_bairro), ''),
        endereco_cidade = NULLIF(TRIM(p_endereco_cidade), ''),
        endereco_estado = UPPER(NULLIF(TRIM(p_endereco_estado), '')),
        status_assinatura = v_status,
        trial_fim_em = COALESCE(p_trial_fim_em, trial_fim_em),
        assinatura_fim_em = p_assinatura_fim_em,
        atualizado_em = NOW()
    WHERE id = p_loja_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Loja não encontrada para atualização.';
    END IF;

    RETURN jsonb_build_object(
        'sucesso', true,
        'loja_id', p_loja_id
    );
END;
$$;

-- 5. RPC ATÔMICA DE ATIVAÇÃO / RENOVAÇÃO MANUAL DE ASSINATURA (CONTABILIZA NO FATURAMENTO)
CREATE OR REPLACE FUNCTION public.ativar_assinatura_loja_manual(
    p_loja_id UUID,
    p_ciclo_tipo VARCHAR DEFAULT 'mensal',
    p_dias_vigencia INTEGER DEFAULT 30,
    p_ciclo_meses INTEGER DEFAULT 1,
    p_meio_pagamento VARCHAR DEFAULT 'Dinheiro (Espécie)',
    p_valor_total NUMERIC DEFAULT 0.00,
    p_observacoes_admin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_loja RECORD;
    v_org_id UUID;
    v_inicio TIMESTAMPTZ;
    v_fim TIMESTAMPTZ;
    v_dias INTEGER := GREATEST(1, COALESCE(p_dias_vigencia, 30));
    v_ciclo_meses INTEGER := GREATEST(1, COALESCE(p_ciclo_meses, 1));
    v_valor_total NUMERIC(10, 2) := ROUND(GREATEST(0.00, COALESCE(p_valor_total, 0.00)), 2);
    v_valor_mensal NUMERIC(10, 2);
    v_pagamento_id UUID;
    v_meio_limpo VARCHAR(50);
    v_obs_final TEXT;
BEGIN
    IF NOT public.eh_super_admin_plataforma() THEN
        RAISE EXCEPTION 'Acesso negado: exclusivo para o Super Admin da plataforma.';
    END IF;

    IF p_loja_id IS NULL THEN
        RAISE EXCEPTION 'Loja não informada.';
    END IF;

    SELECT id, organizacao_id, nome_fantasia, email, status_assinatura, assinatura_fim_em
    INTO v_loja
    FROM public.lojas
    WHERE id = p_loja_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Loja não localizada no sistema.';
    END IF;

    v_org_id := v_loja.organizacao_id;
    IF v_org_id IS NULL THEN
        INSERT INTO public.organizacoes (nome, email_principal)
        VALUES (COALESCE(NULLIF(TRIM(v_loja.nome_fantasia), ''), 'Organização HUBI'), v_loja.email)
        RETURNING id INTO v_org_id;

        UPDATE public.lojas
        SET organizacao_id = v_org_id
        WHERE id = p_loja_id;
    END IF;

    IF v_loja.status_assinatura = 'ativo'
       AND v_loja.assinatura_fim_em IS NOT NULL
       AND v_loja.assinatura_fim_em > NOW() THEN
        v_inicio := v_loja.assinatura_fim_em;
    ELSE
        v_inicio := NOW();
    END IF;

    v_fim := v_inicio + make_interval(days => v_dias);
    v_valor_mensal := ROUND(v_valor_total / v_ciclo_meses::NUMERIC, 2);
    v_meio_limpo := LEFT(COALESCE(NULLIF(TRIM(p_meio_pagamento), ''), 'Dinheiro (Espécie)'), 50);

    v_obs_final := NULLIF(TRIM(p_observacoes_admin), '');
    IF v_obs_final IS NULL THEN
        v_obs_final := 'Ativação manual (' || COALESCE(NULLIF(TRIM(p_ciclo_tipo), ''), 'personalizado') || ' - ' || v_dias || ' dias)';
    END IF;

    INSERT INTO public.hubi_assinaturas_pagamentos (
        loja_id,
        organizacao_id,
        mp_preference_id,
        mp_payment_id,
        status_pagamento,
        meio_pagamento,
        bandeira_metodo,
        valor_total,
        valor_mensal_referencia,
        parcelas,
        ciclo_meses,
        periodo_inicio_em,
        periodo_fim_em,
        aprovado_em,
        observacoes_admin
    )
    VALUES (
        p_loja_id,
        v_org_id,
        'MANUAL-' || gen_random_uuid()::TEXT,
        'MANUAL-PAY-' || gen_random_uuid()::TEXT,
        'approved',
        v_meio_limpo,
        'manual',
        v_valor_total,
        v_valor_mensal,
        1,
        v_ciclo_meses,
        v_inicio,
        v_fim,
        NOW(),
        v_obs_final
    )
    RETURNING id INTO v_pagamento_id;

    UPDATE public.lojas
    SET
        status_assinatura = 'ativo',
        assinatura_fim_em = v_fim,
        atualizado_em = NOW()
    WHERE id = p_loja_id;

    RETURN jsonb_build_object(
        'sucesso', true,
        'pagamento_id', v_pagamento_id,
        'loja_id', p_loja_id,
        'periodo_inicio_em', v_inicio,
        'periodo_fim_em', v_fim,
        'valor_total', v_valor_total
    );
END;
$$;

-- 6. CONCESSÃO DE EXECUÇÃO EXCLUSIVA PARA USUÁRIOS AUTENTICADOS (BLOQUEADA POR eh_super_admin_plataforma())
REVOKE ALL ON FUNCTION public.obter_dados_cockpit_area_hubi(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obter_dados_cockpit_area_hubi(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_atualizar_dados_loja(
    UUID, TEXT, TEXT, VARCHAR, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, VARCHAR, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_atualizar_dados_loja(
    UUID, TEXT, TEXT, VARCHAR, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, VARCHAR, TIMESTAMPTZ, TIMESTAMPTZ
) TO authenticated;

REVOKE ALL ON FUNCTION public.ativar_assinatura_loja_manual(
    UUID, VARCHAR, INTEGER, INTEGER, VARCHAR, NUMERIC, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ativar_assinatura_loja_manual(
    UUID, VARCHAR, INTEGER, INTEGER, VARCHAR, NUMERIC, TEXT
) TO authenticated;
