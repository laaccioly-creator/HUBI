-- ==============================================================================
-- MIGRATION: 20261021_ajustar_loja_metas_defaults_zero.sql
-- Módulo Cockpit Executivo: Zeramento de Padrões das Metas e Novas Colunas
-- ==============================================================================

-- 1. Assegurar colunas com DEFAULT 0 na tabela public.loja_metas
DO $$
BEGIN
    -- meta_despesas_maximas
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'loja_metas' 
          AND column_name = 'meta_despesas_maximas'
    ) THEN
        ALTER TABLE public.loja_metas ADD COLUMN meta_despesas_maximas NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
    ELSE
        ALTER TABLE public.loja_metas ALTER COLUMN meta_despesas_maximas SET DEFAULT 0.00;
    END IF;

    -- meta_saude_estoque_max_ruptura
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'loja_metas' 
          AND column_name = 'meta_saude_estoque_max_ruptura'
    ) THEN
        ALTER TABLE public.loja_metas ADD COLUMN meta_saude_estoque_max_ruptura NUMERIC(8, 2) NOT NULL DEFAULT 0.00;
    ELSE
        ALTER TABLE public.loja_metas ALTER COLUMN meta_saude_estoque_max_ruptura SET DEFAULT 0.00;
    END IF;
END $$;

-- 2. Alterar os DEFAULTS das colunas legadas para 0.00 (sem metas fictícias hardcoded)
ALTER TABLE public.loja_metas ALTER COLUMN meta_faturamento SET DEFAULT 0.00;
ALTER TABLE public.loja_metas ALTER COLUMN meta_pedidos SET DEFAULT 0;
ALTER TABLE public.loja_metas ALTER COLUMN meta_lucro_liquido SET DEFAULT 0.00;
ALTER TABLE public.loja_metas ALTER COLUMN meta_ticket_medio SET DEFAULT 0.00;
ALTER TABLE public.loja_metas ALTER COLUMN meta_inadimplencia_maxima SET DEFAULT 0.00;
ALTER TABLE public.loja_metas ALTER COLUMN meta_giro_estoque SET DEFAULT 0.00;

-- 3. Ativação e Reafirmação Estrita de Row Level Security (RLS)
ALTER TABLE public.loja_metas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loja_metas_select_policy" ON public.loja_metas;
CREATE POLICY "loja_metas_select_policy"
    ON public.loja_metas
    FOR SELECT
    USING (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "loja_metas_insert_policy" ON public.loja_metas;
CREATE POLICY "loja_metas_insert_policy"
    ON public.loja_metas
    FOR INSERT
    WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "loja_metas_update_policy" ON public.loja_metas;
CREATE POLICY "loja_metas_update_policy"
    ON public.loja_metas
    FOR UPDATE
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "loja_metas_delete_policy" ON public.loja_metas;
CREATE POLICY "loja_metas_delete_policy"
    ON public.loja_metas
    FOR DELETE
    USING (public.usuario_pertence_loja(loja_id));
