-- =============================================================================
-- MIGRATION: Hierarquia de Categorias e Subcategorias (Multi-Tenant)
-- =============================================================================

-- 1. Auto-relacionamento na tabela categorias (categoria principal -> subcategorias)
ALTER TABLE public.categorias
ADD COLUMN IF NOT EXISTS categoria_pai_id UUID NULL
REFERENCES public.categorias(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_categorias_categoria_pai_id
ON public.categorias(categoria_pai_id);

-- 2. Vínculo de subcategoria na tabela produtos
ALTER TABLE public.produtos
ADD COLUMN IF NOT EXISTS subcategoria_id UUID NULL
REFERENCES public.categorias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_subcategoria_id
ON public.produtos(subcategoria_id);

-- 3. Notificar PostgREST para recarregar o schema cache imediatamente
NOTIFY pgrst, 'reload schema';
