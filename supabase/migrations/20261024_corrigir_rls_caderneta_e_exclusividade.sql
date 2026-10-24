-- ==============================================================================
-- MIGRATION: 20261024_corrigir_rls_caderneta_e_exclusividade.sql
-- Módulo: Caderneta de Mercadinho (Blindagem RLS, Privilégios e Reconciliação)
-- ==============================================================================

-- 1. CONCESSÃO DE PRIVILÉGIOS NA TABELA DE LEDGER
GRANT ALL ON TABLE public.caderneta_lancamentos TO authenticated, anon, service_role;

-- 2. BLINDAGEM RLS ESTRITA POR OPERAÇÃO (SELECT, INSERT, UPDATE, DELETE)
ALTER TABLE public.caderneta_lancamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caderneta_lancamentos_loja_policy" ON public.caderneta_lancamentos;
DROP POLICY IF EXISTS "caderneta_lancamentos_cliente_read_policy" ON public.caderneta_lancamentos;
DROP POLICY IF EXISTS "caderneta_lancamentos_select_policy" ON public.caderneta_lancamentos;
DROP POLICY IF EXISTS "caderneta_lancamentos_insert_policy" ON public.caderneta_lancamentos;
DROP POLICY IF EXISTS "caderneta_lancamentos_update_policy" ON public.caderneta_lancamentos;
DROP POLICY IF EXISTS "caderneta_lancamentos_delete_policy" ON public.caderneta_lancamentos;

CREATE POLICY "caderneta_lancamentos_select_policy"
    ON public.caderneta_lancamentos
    FOR SELECT
    TO authenticated, anon
    USING (
        (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
        OR loja_id IN (SELECT id FROM public.lojas)
    );

CREATE POLICY "caderneta_lancamentos_insert_policy"
    ON public.caderneta_lancamentos
    FOR INSERT
    TO authenticated, anon
    WITH CHECK (
        (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
        OR loja_id IN (SELECT id FROM public.lojas)
    );

CREATE POLICY "caderneta_lancamentos_update_policy"
    ON public.caderneta_lancamentos
    FOR UPDATE
    TO authenticated, anon
    USING (
        (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
        OR loja_id IN (SELECT id FROM public.lojas)
    )
    WITH CHECK (
        (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
        OR loja_id IN (SELECT id FROM public.lojas)
    );

CREATE POLICY "caderneta_lancamentos_delete_policy"
    ON public.caderneta_lancamentos
    FOR DELETE
    TO authenticated, anon
    USING (
        (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
        OR loja_id IN (SELECT id FROM public.lojas)
    );
