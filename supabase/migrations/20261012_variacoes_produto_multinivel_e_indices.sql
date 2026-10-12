-- ==============================================================================
-- MIGRATION: 20261012_variacoes_produto_multinivel_e_indices.sql
-- Adiciona suporte a variações multinível relacionais (sem JSONB), índices de alta performance
-- e padronização da coluna tipada de unidade de medida em produtos
-- ==============================================================================

-- 1. Coluna tipada de unidade de medida relacional na tabela produtos
ALTER TABLE public.produtos
    ADD COLUMN IF NOT EXISTS unidade_medida VARCHAR(20) DEFAULT 'un';

COMMENT ON COLUMN public.produtos.unidade_medida IS 'Sigla oficial da unidade de medida do produto (UN, KG, G, L, ML, CX, PC, PAR, M, CM, FD, KIT, DZ)';

-- 2. Garantir coluna combinacao_nome na tabela variacoes_produto (ex: "Branca / P", "Azul / G")
ALTER TABLE public.variacoes_produto
    ADD COLUMN IF NOT EXISTS combinacao_nome VARCHAR(160);

COMMENT ON COLUMN public.variacoes_produto.combinacao_nome IS 'Nome descritivo consolidado da combinação de variações (ex: "Preto / M", "Morango / 500g")';

-- 3. Índices de alta performance para busca e integridade referencial rápida
CREATE INDEX IF NOT EXISTS idx_variacoes_produto_produto_id ON public.variacoes_produto(produto_id);
CREATE INDEX IF NOT EXISTS idx_variacoes_produto_loja_id ON public.variacoes_produto(loja_id);
CREATE INDEX IF NOT EXISTS idx_produtos_unidade_medida ON public.produtos(unidade_medida);

-- 4. Governança RLS estrita multi-tenant no Supabase para variacoes_produto
ALTER TABLE public.variacoes_produto ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'variacoes_produto' AND policyname = 'variacoes_produto_loja_isolamento_select'
    ) THEN
        CREATE POLICY variacoes_produto_loja_isolamento_select ON public.variacoes_produto
            FOR SELECT
            USING (public.usuario_pertence_loja(loja_id));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'variacoes_produto' AND policyname = 'variacoes_produto_loja_isolamento_insert'
    ) THEN
        CREATE POLICY variacoes_produto_loja_isolamento_insert ON public.variacoes_produto
            FOR INSERT
            WITH CHECK (public.usuario_pertence_loja(loja_id));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'variacoes_produto' AND policyname = 'variacoes_produto_loja_isolamento_update'
    ) THEN
        CREATE POLICY variacoes_produto_loja_isolamento_update ON public.variacoes_produto
            FOR UPDATE
            USING (public.usuario_pertence_loja(loja_id))
            WITH CHECK (public.usuario_pertence_loja(loja_id));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'variacoes_produto' AND policyname = 'variacoes_produto_loja_isolamento_delete'
    ) THEN
        CREATE POLICY variacoes_produto_loja_isolamento_delete ON public.variacoes_produto
            FOR DELETE
            USING (public.usuario_pertence_loja(loja_id));
    END IF;
END $$;
