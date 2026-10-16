-- ==============================================================================
-- MIGRATION: 20261016170000_conglomerado_multilojas_e_assinaturas_mp.sql
-- Arquitetura de Conglomerado (organizacoes), Ciclo de Assinatura por Loja e MP
-- ==============================================================================

-- 1. TABELA public.organizacoes (Camada de Conglomerado / Holding do Proprietário)
CREATE TABLE IF NOT EXISTS public.organizacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(150) NOT NULL,
    dono_usuario_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    email_principal VARCHAR(150) NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizacoes_dono_usuario_id
    ON public.organizacoes(dono_usuario_id);

-- Trigger de timestamp para organizacoes
CREATE OR REPLACE FUNCTION public.fn_atualizar_timestamp_modificacao()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organizacoes_updated_at ON public.organizacoes;
CREATE TRIGGER trg_organizacoes_updated_at
    BEFORE UPDATE ON public.organizacoes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_atualizar_timestamp_modificacao();

-- 2. NOVAS COLUNAS NA TABELA public.lojas (Vínculo ao Conglomerado + Ciclo de Vida Individual)
ALTER TABLE public.lojas
    ADD COLUMN IF NOT EXISTS organizacao_id UUID NULL REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS status_assinatura VARCHAR(20) NOT NULL DEFAULT 'trial'
        CONSTRAINT chk_lojas_status_assinatura CHECK (status_assinatura IN ('trial', 'ativo', 'atrasado', 'bloqueado')),
    ADD COLUMN IF NOT EXISTS trial_fim_em TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    ADD COLUMN IF NOT EXISTS assinatura_fim_em TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS mp_preference_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_lojas_organizacao_id ON public.lojas(organizacao_id);
CREATE INDEX IF NOT EXISTS idx_lojas_status_assinatura ON public.lojas(status_assinatura);

-- 3. MIGRAÇÃO RETROCOMPATÍVEL (AGRUPAMENTO AUTOMÁTICO DE LOJAS EXISTENTES EM ORGANIZAÇÕES)
-- Agrupa lojas existentes pelo usuario_auth_id do proprietário (ou email da loja),
-- criando uma Organização padrão para cada proprietário e atribuindo 7 dias de trial
-- para evitar qualquer bloqueio acidental pós-migração.
DO $$
DECLARE
    r_loja RECORD;
    v_owner_auth_id UUID;
    v_email_chave TEXT;
    v_org_id UUID;
BEGIN
    FOR r_loja IN
        SELECT l.id, l.nome_fantasia, LOWER(TRIM(l.email)) AS email_limpo
        FROM public.lojas l
        WHERE l.organizacao_id IS NULL
        ORDER BY l.criado_em ASC
    LOOP
        -- Localiza o usuario_auth_id do owner/admin da loja, se houver
        SELECT ul.usuario_auth_id
        INTO v_owner_auth_id
        FROM public.usuarios_loja ul
        WHERE ul.loja_id = r_loja.id
          AND ul.usuario_auth_id IS NOT NULL
        ORDER BY CASE WHEN ul.perfil = 'owner' THEN 0 WHEN ul.perfil = 'admin' THEN 1 ELSE 2 END,
                 ul.criado_em ASC
        LIMIT 1;

        v_email_chave := COALESCE(r_loja.email_limpo, 'sem-email-' || r_loja.id::text);
        v_org_id := NULL;

        -- Verifica se já criamos uma organização para o mesmo dono_usuario_id ou email_principal
        IF v_owner_auth_id IS NOT NULL THEN
            SELECT o.id INTO v_org_id
            FROM public.organizacoes o
            WHERE o.dono_usuario_id = v_owner_auth_id
            LIMIT 1;
        END IF;

        IF v_org_id IS NULL THEN
            SELECT o.id INTO v_org_id
            FROM public.organizacoes o
            WHERE LOWER(TRIM(o.email_principal)) = v_email_chave
            LIMIT 1;
        END IF;

        -- Se ainda não existir organização para este proprietário, cria uma nova
        IF v_org_id IS NULL THEN
            INSERT INTO public.organizacoes (nome, dono_usuario_id, email_principal)
            VALUES (
                'Grupo ' || COALESCE(r_loja.nome_fantasia, 'HUBI'),
                v_owner_auth_id,
                v_email_chave
            )
            RETURNING id INTO v_org_id;
        END IF;

        -- Vincula a loja à organização e garante janela segura de 7 dias se ainda sem assinatura
        UPDATE public.lojas
        SET
            organizacao_id = v_org_id,
            status_assinatura = COALESCE(status_assinatura, 'trial'),
            trial_fim_em = CASE
                WHEN trial_fim_em IS NULL OR trial_fim_em < NOW() THEN NOW() + INTERVAL '7 days'
                ELSE trial_fim_em
            END
        WHERE id = r_loja.id;
    END LOOP;
END $$;

-- 4. TRIGGER AUTOMÁTICA PARA NOVAS LOJAS (GARANTE ORGANIZAÇÃO E TRIAL DE 7 DIAS INDIVIDUAL)
CREATE OR REPLACE FUNCTION public.fn_antes_inserir_loja_conglomerado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Garante status_assinatura e trial_fim_em individuais para a nova unidade
    IF NEW.status_assinatura IS NULL THEN
        NEW.status_assinatura := 'trial';
    END IF;

    IF NEW.trial_fim_em IS NULL THEN
        NEW.trial_fim_em := NOW() + INTERVAL '7 days';
    END IF;

    -- Se organizacao_id não foi enviado explicitamente, tenta localizar a organização do usuário autenticado ou cria uma
    IF NEW.organizacao_id IS NULL THEN
        IF auth.uid() IS NOT NULL THEN
            SELECT id INTO v_org_id
            FROM public.organizacoes
            WHERE dono_usuario_id = auth.uid()
            ORDER BY criado_em ASC
            LIMIT 1;
        END IF;

        IF v_org_id IS NULL AND NEW.email IS NOT NULL THEN
            SELECT id INTO v_org_id
            FROM public.organizacoes
            WHERE LOWER(TRIM(email_principal)) = LOWER(TRIM(NEW.email))
            ORDER BY criado_em ASC
            LIMIT 1;
        END IF;

        IF v_org_id IS NULL THEN
            INSERT INTO public.organizacoes (nome, dono_usuario_id, email_principal)
            VALUES (
                'Grupo ' || COALESCE(NEW.nome_fantasia, 'HUBI'),
                auth.uid(),
                LOWER(TRIM(NEW.email))
            )
            RETURNING id INTO v_org_id;
        END IF;

        NEW.organizacao_id := v_org_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lojas_antes_inserir_conglomerado ON public.lojas;
CREATE TRIGGER trg_lojas_antes_inserir_conglomerado
    BEFORE INSERT ON public.lojas
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_antes_inserir_loja_conglomerado();

-- 5. FUNÇÃO DE SEGURANÇA RLS PARA ORGANIZAÇÃO
CREATE OR REPLACE FUNCTION public.usuario_pertence_organizacao(p_organizacao_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR p_organizacao_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.organizacoes o
        WHERE o.id = p_organizacao_id
          AND o.dono_usuario_id = auth.uid()
    ) OR EXISTS (
        SELECT 1
        FROM public.lojas l
        JOIN public.usuarios_loja ul ON ul.loja_id = l.id
        WHERE l.organizacao_id = p_organizacao_id
          AND ul.usuario_auth_id = auth.uid()
          AND ul.ativo = TRUE
    );
END;
$$;

-- RLS DA TABELA public.organizacoes
ALTER TABLE public.organizacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizacoes_select_policy" ON public.organizacoes;
CREATE POLICY "organizacoes_select_policy"
    ON public.organizacoes
    FOR SELECT
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_organizacao(id));

DROP POLICY IF EXISTS "organizacoes_insert_policy" ON public.organizacoes;
CREATE POLICY "organizacoes_insert_policy"
    ON public.organizacoes
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL AND (dono_usuario_id IS NULL OR dono_usuario_id = auth.uid()));

DROP POLICY IF EXISTS "organizacoes_update_policy" ON public.organizacoes;
CREATE POLICY "organizacoes_update_policy"
    ON public.organizacoes
    FOR UPDATE
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_organizacao(id))
    WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_organizacao(id));

DROP POLICY IF EXISTS "organizacoes_delete_policy" ON public.organizacoes;
CREATE POLICY "organizacoes_delete_policy"
    ON public.organizacoes
    FOR DELETE
    USING (auth.uid() IS NOT NULL AND dono_usuario_id = auth.uid());

-- 6. TABELA RELACIONAL public.hubi_assinaturas_pagamentos (HISTÓRICO DE ANUIDADES POR LOJA)
CREATE TABLE IF NOT EXISTS public.hubi_assinaturas_pagamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    organizacao_id UUID NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
    mp_preference_id TEXT NOT NULL,
    mp_payment_id TEXT NULL,
    mp_collection_id TEXT NULL,
    status_pagamento VARCHAR(30) NOT NULL DEFAULT 'pendente'
        CONSTRAINT chk_hubi_assinaturas_status CHECK (
            status_pagamento IN ('pendente', 'approved', 'in_process', 'rejected', 'cancelled', 'refunded')
        ),
    meio_pagamento VARCHAR(50) NULL,          -- ex: 'pix', 'credit_card', 'debit_card'
    bandeira_metodo VARCHAR(50) NULL,         -- ex: 'visa', 'master', 'pix'
    valor_total NUMERIC(10, 2) NOT NULL DEFAULT 598.80,
    valor_mensal_referencia NUMERIC(10, 2) NOT NULL DEFAULT 49.90,
    parcelas INTEGER NOT NULL DEFAULT 1 CHECK (parcelas >= 1 AND parcelas <= 12),
    ciclo_meses INTEGER NOT NULL DEFAULT 12,
    periodo_inicio_em TIMESTAMPTZ NULL,
    periodo_fim_em TIMESTAMPTZ NULL,
    link_checkout TEXT NULL,
    aprovado_em TIMESTAMPTZ NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_hubi_assinaturas_mp_payment_id UNIQUE (mp_payment_id)
);

CREATE INDEX IF NOT EXISTS idx_hubi_assinaturas_loja_id
    ON public.hubi_assinaturas_pagamentos(loja_id);
CREATE INDEX IF NOT EXISTS idx_hubi_assinaturas_organizacao_id
    ON public.hubi_assinaturas_pagamentos(organizacao_id);
CREATE INDEX IF NOT EXISTS idx_hubi_assinaturas_mp_preference_id
    ON public.hubi_assinaturas_pagamentos(mp_preference_id);
CREATE INDEX IF NOT EXISTS idx_hubi_assinaturas_mp_payment_id
    ON public.hubi_assinaturas_pagamentos(mp_payment_id);

DROP TRIGGER IF EXISTS trg_hubi_assinaturas_pagamentos_updated_at ON public.hubi_assinaturas_pagamentos;
CREATE TRIGGER trg_hubi_assinaturas_pagamentos_updated_at
    BEFORE UPDATE ON public.hubi_assinaturas_pagamentos
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_atualizar_timestamp_modificacao();

-- 7. BLINDAGEM RLS MULTI-TENANT EM public.hubi_assinaturas_pagamentos (SUPABASE-RLS-GUARD)
ALTER TABLE public.hubi_assinaturas_pagamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hubi_assinaturas_pagamentos_select_policy" ON public.hubi_assinaturas_pagamentos;
CREATE POLICY "hubi_assinaturas_pagamentos_select_policy"
    ON public.hubi_assinaturas_pagamentos
    FOR SELECT
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "hubi_assinaturas_pagamentos_insert_policy" ON public.hubi_assinaturas_pagamentos;
CREATE POLICY "hubi_assinaturas_pagamentos_insert_policy"
    ON public.hubi_assinaturas_pagamentos
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "hubi_assinaturas_pagamentos_update_policy" ON public.hubi_assinaturas_pagamentos;
CREATE POLICY "hubi_assinaturas_pagamentos_update_policy"
    ON public.hubi_assinaturas_pagamentos
    FOR UPDATE
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
    WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "hubi_assinaturas_pagamentos_delete_policy" ON public.hubi_assinaturas_pagamentos;
CREATE POLICY "hubi_assinaturas_pagamentos_delete_policy"
    ON public.hubi_assinaturas_pagamentos
    FOR DELETE
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

-- 8. PUBLICAÇÃO SUPABASE REALTIME PARA DESBLOQUEIO INSTANTÂNEO DE UNIDADES
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'lojas'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.lojas;
    END IF;
END $$;
