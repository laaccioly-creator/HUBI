-- ==============================================================================
-- MIGRATION: 20261022_corrigir_rls_loja_metas_e_endereco_filial.sql
-- Módulo: Gestão de Metas da Loja (RLS & Permissões) & Endereço Completo de Filiais
-- ==============================================================================

-- 1. GARANTIR COLUNAS RELACIONAIS DE ENDEREÇO EM public.lojas
ALTER TABLE public.lojas
    ADD COLUMN IF NOT EXISTS endereco_cep VARCHAR(10) NULL,
    ADD COLUMN IF NOT EXISTS endereco_logradouro VARCHAR(200) NULL,
    ADD COLUMN IF NOT EXISTS endereco_numero VARCHAR(30) NULL,
    ADD COLUMN IF NOT EXISTS endereco_complemento VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS endereco_bairro VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS endereco_cidade VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS endereco_estado VARCHAR(2) NULL;

-- Índices úteis para filtragem por localização
CREATE INDEX IF NOT EXISTS idx_lojas_endereco_cidade_uf
    ON public.lojas(endereco_cidade, endereco_estado);

-- 2. EVOLUÇÃO DA FUNÇÃO DE SEGURANÇA MULTI-TENANT: public.usuario_pertence_loja
-- Valida se o usuário autenticado (auth.uid()) possui vínculo direto na loja OU
-- se é o proprietário / administrador da holding/organização do conglomerado da loja.
CREATE OR REPLACE FUNCTION public.usuario_pertence_loja(p_loja_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Se não houver usuário autenticado ou a loja for nula, recusa de imediato
    IF auth.uid() IS NULL OR p_loja_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 1. Vínculo direto em public.usuarios_loja (colaboradores e operadores cadastrados)
    IF EXISTS (
        SELECT 1
        FROM public.usuarios_loja
        WHERE usuario_auth_id = auth.uid()
          AND loja_id = p_loja_id
          AND ativo = TRUE
    ) THEN
        RETURN TRUE;
    END IF;

    -- 2. Vínculo como dono/proprietário da organização que possui esta filial
    IF EXISTS (
        SELECT 1
        FROM public.lojas l
        JOIN public.organizacoes o ON o.id = l.organizacao_id
        WHERE l.id = p_loja_id
          AND o.dono_usuario_id = auth.uid()
    ) THEN
        RETURN TRUE;
    END IF;

    -- 3. Vínculo como operador admin/owner de qualquer loja do mesmo conglomerado da filial alvo
    IF EXISTS (
        SELECT 1
        FROM public.lojas l_alvo
        JOIN public.lojas l_grupo ON l_grupo.organizacao_id = l_alvo.organizacao_id
        JOIN public.usuarios_loja ul ON ul.loja_id = l_grupo.id
        WHERE l_alvo.id = p_loja_id
          AND l_alvo.organizacao_id IS NOT NULL
          AND ul.usuario_auth_id = auth.uid()
          AND ul.perfil IN ('owner', 'admin')
          AND ul.ativo = TRUE
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

-- Permissões de execução para a função de segurança
GRANT EXECUTE ON FUNCTION public.usuario_pertence_loja(UUID) TO authenticated, service_role, anon;

-- 3. GARANTIR TABELA public.loja_metas, COLUNAS E DEFAULTS ZERADOS
CREATE TABLE IF NOT EXISTS public.loja_metas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    meta_faturamento NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    meta_pedidos INTEGER NOT NULL DEFAULT 0,
    meta_lucro_liquido NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    meta_ticket_medio NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    meta_despesas_maximas NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    meta_inadimplencia_maxima NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    meta_giro_estoque NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    meta_saude_estoque_max_ruptura NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_loja_metas_loja_id UNIQUE (loja_id)
);

-- Assegurar colunas recentes caso a tabela tenha sido criada em versão legada
ALTER TABLE public.loja_metas
    ADD COLUMN IF NOT EXISTS meta_despesas_maximas NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS meta_saude_estoque_max_ruptura NUMERIC(8, 2) NOT NULL DEFAULT 0.00;

-- 4. CONCESSÃO EXPLÍCITA DE PRIVILÉGIOS (ELIMINA ERRO 401 NO POSTGREST)
GRANT ALL ON TABLE public.loja_metas TO authenticated;
GRANT ALL ON TABLE public.loja_metas TO service_role;
GRANT SELECT ON TABLE public.loja_metas TO anon;

-- 5. BLINDAGEM RLS MULTI-TENANT EM public.loja_metas (SUPABASE-RLS-GUARD)
ALTER TABLE public.loja_metas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loja_metas_select_policy" ON public.loja_metas;
DROP POLICY IF EXISTS "loja_metas_insert_policy" ON public.loja_metas;
DROP POLICY IF EXISTS "loja_metas_update_policy" ON public.loja_metas;
DROP POLICY IF EXISTS "loja_metas_delete_policy" ON public.loja_metas;
DROP POLICY IF EXISTS "loja_metas_all_policy" ON public.loja_metas;

CREATE POLICY "loja_metas_select_policy"
    ON public.loja_metas
    FOR SELECT
    TO authenticated
    USING (public.usuario_pertence_loja(loja_id));

CREATE POLICY "loja_metas_insert_policy"
    ON public.loja_metas
    FOR INSERT
    TO authenticated
    WITH CHECK (public.usuario_pertence_loja(loja_id));

CREATE POLICY "loja_metas_update_policy"
    ON public.loja_metas
    FOR UPDATE
    TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

CREATE POLICY "loja_metas_delete_policy"
    ON public.loja_metas
    FOR DELETE
    TO authenticated
    USING (public.usuario_pertence_loja(loja_id));

-- 6. RPC TRANSACIONAL SEGURA PARA SALVAMENTO DE METAS: public.salvar_loja_metas_seguro
-- Permite persistência atômica e resiliente via RPC, garantindo isolamento multitenant.
CREATE OR REPLACE FUNCTION public.salvar_loja_metas_seguro(
    p_loja_id UUID,
    p_meta_faturamento NUMERIC DEFAULT 0.00,
    p_meta_pedidos INTEGER DEFAULT 0,
    p_meta_lucro_liquido NUMERIC DEFAULT 0.00,
    p_meta_ticket_medio NUMERIC DEFAULT 0.00,
    p_meta_despesas_maximas NUMERIC DEFAULT 0.00,
    p_meta_inadimplencia_maxima NUMERIC DEFAULT 0.00,
    p_meta_giro_estoque NUMERIC DEFAULT 0.00,
    p_meta_saude_estoque_max_ruptura NUMERIC DEFAULT 0.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_registro RECORD;
BEGIN
    -- Verificação estrita de tenant
    IF NOT public.usuario_pertence_loja(p_loja_id) THEN
        RAISE EXCEPTION 'Acesso negado: o usuário não pertence a esta unidade.';
    END IF;

    -- Upsert atômico
    INSERT INTO public.loja_metas (
        loja_id,
        meta_faturamento,
        meta_pedidos,
        meta_lucro_liquido,
        meta_ticket_medio,
        meta_despesas_maximas,
        meta_inadimplencia_maxima,
        meta_giro_estoque,
        meta_saude_estoque_max_ruptura,
        atualizado_em
    ) VALUES (
        p_loja_id,
        COALESCE(p_meta_faturamento, 0.00),
        COALESCE(p_meta_pedidos, 0),
        COALESCE(p_meta_lucro_liquido, 0.00),
        COALESCE(p_meta_ticket_medio, 0.00),
        COALESCE(p_meta_despesas_maximas, 0.00),
        COALESCE(p_meta_inadimplencia_maxima, 0.00),
        COALESCE(p_meta_giro_estoque, 0.00),
        COALESCE(p_meta_saude_estoque_max_ruptura, 0.00),
        NOW()
    )
    ON CONFLICT (loja_id) DO UPDATE SET
        meta_faturamento = EXCLUDED.meta_faturamento,
        meta_pedidos = EXCLUDED.meta_pedidos,
        meta_lucro_liquido = EXCLUDED.meta_lucro_liquido,
        meta_ticket_medio = EXCLUDED.meta_ticket_medio,
        meta_despesas_maximas = EXCLUDED.meta_despesas_maximas,
        meta_inadimplencia_maxima = EXCLUDED.meta_inadimplencia_maxima,
        meta_giro_estoque = EXCLUDED.meta_giro_estoque,
        meta_saude_estoque_max_ruptura = EXCLUDED.meta_saude_estoque_max_ruptura,
        atualizado_em = NOW()
    RETURNING * INTO v_registro;

    RETURN to_jsonb(v_registro);
END;
$$;

-- Permissão de execução da RPC para usuários autenticados e service_role
GRANT EXECUTE ON FUNCTION public.salvar_loja_metas_seguro(
    UUID, NUMERIC, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC
) TO authenticated, service_role;
