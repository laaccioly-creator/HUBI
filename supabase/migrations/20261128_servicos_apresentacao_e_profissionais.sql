-- ==============================================================================
-- Migration: 20261128_servicos_apresentacao_e_profissionais.sql
-- Objetivo:
--   1. Foto, mini currículo e flag de aprovação em public.usuarios_loja
--   2. Descrição e foto de capa em public.categorias
--   3. Página de Apresentação opcional em public.lojas (modo_exibicao_catalogo + lp_*)
--   4. Garantia idempotente de RLS multi-tenant e leitura pública controlada
-- ==============================================================================

-- 1. Colunas em public.usuarios_loja
ALTER TABLE public.usuarios_loja
  ADD COLUMN IF NOT EXISTS url_foto TEXT NULL,
  ADD COLUMN IF NOT EXISTS mini_curriculo TEXT NULL,
  ADD COLUMN IF NOT EXISTS curriculo_aprovado BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.usuarios_loja.url_foto IS 'URL da foto de perfil/avatar do colaborador ou profissional';
COMMENT ON COLUMN public.usuarios_loja.mini_curriculo IS 'Apresentação profissional/biografia comercial exibida nos agendamentos e página pública';
COMMENT ON COLUMN public.usuarios_loja.curriculo_aprovado IS 'Flag de validação pelo gestor/admin antes da exibição pública do mini currículo';

-- 2. Colunas em public.categorias
ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS descricao TEXT NULL,
  ADD COLUMN IF NOT EXISTS imagem_url TEXT NULL;

COMMENT ON COLUMN public.categorias.descricao IS 'Descrição curta da categoria/especialidade para apresentação no catálogo';
COMMENT ON COLUMN public.categorias.imagem_url IS 'URL da foto de capa da categoria/especialidade';

-- 3. Colunas em public.lojas
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS modo_exibicao_catalogo VARCHAR(20) NOT NULL DEFAULT 'vitrine',
  ADD COLUMN IF NOT EXISTS lp_titulo_hero VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS lp_subtitulo_hero TEXT NULL,
  ADD COLUMN IF NOT EXISTS lp_sobre_titulo VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS lp_sobre_texto TEXT NULL,
  ADD COLUMN IF NOT EXISTS lp_galeria_urls JSONB NULL,
  ADD COLUMN IF NOT EXISTS lp_mostrar_equipe BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_lojas_modo_exibicao_catalogo'
      AND conrelid = 'public.lojas'::regclass
  ) THEN
    ALTER TABLE public.lojas
      ADD CONSTRAINT chk_lojas_modo_exibicao_catalogo
      CHECK (modo_exibicao_catalogo IN ('vitrine', 'apresentacao'));
  END IF;
END $$;

COMMENT ON COLUMN public.lojas.modo_exibicao_catalogo IS 'Modo inicial do catálogo público: vitrine (padrão) ou apresentacao (página institucional + vitrine)';
COMMENT ON COLUMN public.lojas.lp_galeria_urls IS 'Lista de URLs de fotos reais de trabalhos/espaço da loja para a página de apresentação';

-- 4. Garantia idempotente de RLS para leitura pública no Catálogo Online e mutação restrita à loja
ALTER TABLE public.usuarios_loja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Leitura pública para Catálogo Online (anon e authenticated)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'usuarios_loja' AND policyname = 'usuarios_loja_public_select_policy'
  ) THEN
    CREATE POLICY usuarios_loja_public_select_policy
      ON public.usuarios_loja
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categorias' AND policyname = 'categorias_public_select_policy'
  ) THEN
    CREATE POLICY categorias_public_select_policy
      ON public.categorias
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lojas' AND policyname = 'lojas_public_select_policy'
  ) THEN
    CREATE POLICY lojas_public_select_policy
      ON public.lojas
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  -- Mutação restrita por tenant em usuarios_loja
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'usuarios_loja' AND policyname = 'usuarios_loja_insert_tenant_policy'
  ) THEN
    CREATE POLICY usuarios_loja_insert_tenant_policy
      ON public.usuarios_loja
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'usuarios_loja' AND policyname = 'usuarios_loja_update_tenant_policy'
  ) THEN
    CREATE POLICY usuarios_loja_update_tenant_policy
      ON public.usuarios_loja
      FOR UPDATE
      TO authenticated
      USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
      WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'usuarios_loja' AND policyname = 'usuarios_loja_delete_tenant_policy'
  ) THEN
    CREATE POLICY usuarios_loja_delete_tenant_policy
      ON public.usuarios_loja
      FOR DELETE
      TO authenticated
      USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));
  END IF;

  -- Mutação restrita por tenant em categorias
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categorias' AND policyname = 'categorias_insert_tenant_policy'
  ) THEN
    CREATE POLICY categorias_insert_tenant_policy
      ON public.categorias
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categorias' AND policyname = 'categorias_update_tenant_policy'
  ) THEN
    CREATE POLICY categorias_update_tenant_policy
      ON public.categorias
      FOR UPDATE
      TO authenticated
      USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
      WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categorias' AND policyname = 'categorias_delete_tenant_policy'
  ) THEN
    CREATE POLICY categorias_delete_tenant_policy
      ON public.categorias
      FOR DELETE
      TO authenticated
      USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));
  END IF;

  -- Mutação restrita por tenant em lojas
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lojas' AND policyname = 'lojas_update_tenant_policy'
  ) THEN
    CREATE POLICY lojas_update_tenant_policy
      ON public.lojas
      FOR UPDATE
      TO authenticated
      USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(id))
      WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(id));
  END IF;
END $$;
