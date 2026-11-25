-- =============================================================================
-- Migration: Histórico e Relatórios Relacionais de Publicações em Massa (ML)
-- Governança: Arquitetura Relacional Pura (Anti-JSONB) + RLS Multi-Tenant
-- =============================================================================

-- Tabela 1: Cabeçalho de cada execução em massa
CREATE TABLE IF NOT EXISTS public.marketplace_lotes_publicacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  conta_id UUID NULL REFERENCES public.marketplace_contas(id) ON DELETE SET NULL,
  usuario_id UUID NULL REFERENCES public.usuarios_loja(id) ON DELETE SET NULL,
  provedor VARCHAR(30) NOT NULL DEFAULT 'mercadolivre',
  escopo_tipo VARCHAR(30) NOT NULL CHECK (escopo_tipo IN ('todos', 'categoria')),
  escopo_descricao VARCHAR(200) NOT NULL,
  categoria_filtro_id UUID NULL REFERENCES public.categorias(id) ON DELETE SET NULL,
  subcategoria_filtro_id UUID NULL REFERENCES public.categorias(id) ON DELETE SET NULL,
  tipo_exposicao VARCHAR(30) NOT NULL CHECK (tipo_exposicao IN ('gold_special', 'gold_pro')),
  margem_sobrepreco_percentual NUMERIC(10,2) NOT NULL DEFAULT 0,
  custo_fixo NUMERIC(10,2) NOT NULL DEFAULT 0,
  status_lote VARCHAR(30) NOT NULL DEFAULT 'em_andamento' CHECK (status_lote IN ('em_andamento', 'concluido', 'cancelado')),
  total_itens INTEGER NOT NULL DEFAULT 0,
  total_processados INTEGER NOT NULL DEFAULT 0,
  total_sucesso INTEGER NOT NULL DEFAULT 0,
  total_falha INTEGER NOT NULL DEFAULT 0,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluido_em TIMESTAMPTZ NULL
);

-- Tabela 2: Detalhamento linha a linha de cada produto processado no lote
CREATE TABLE IF NOT EXISTS public.marketplace_lotes_publicacao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id UUID NOT NULL REFERENCES public.marketplace_lotes_publicacao(id) ON DELETE CASCADE,
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  variacao_id UUID NULL REFERENCES public.variacoes_produto(id) ON DELETE SET NULL,
  nome_produto_snapshot VARCHAR(255) NOT NULL,
  sku_snapshot VARCHAR(100) NULL,
  status_item VARCHAR(20) NOT NULL CHECK (status_item IN ('sucesso', 'falha')),
  ml_item_id VARCHAR(50) NULL,
  ml_category_id VARCHAR(50) NULL,
  permalink TEXT NULL,
  preco_calculado NUMERIC(12,2) NULL,
  gtin_utilizado VARCHAR(20) NULL,
  gtin_origem VARCHAR(30) NULL CHECK (gtin_origem IS NULL OR gtin_origem IN ('cadastro', 'ia_gs1', 'isento')),
  motivo_erro TEXT NULL,
  processado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de consulta rápida por loja/data e por lote/status
CREATE INDEX IF NOT EXISTS idx_ml_lotes_loja_data
  ON public.marketplace_lotes_publicacao (loja_id, iniciado_em DESC);

CREATE INDEX IF NOT EXISTS idx_ml_lotes_itens_lote_status
  ON public.marketplace_lotes_publicacao_itens (lote_id, status_item);

-- Privilégios para role autenticada
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketplace_lotes_publicacao TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketplace_lotes_publicacao_itens TO authenticated;

-- Blindagem RLS multi-tenant: public.marketplace_lotes_publicacao
ALTER TABLE public.marketplace_lotes_publicacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ml_lotes_publicacao_select_policy" ON public.marketplace_lotes_publicacao;
CREATE POLICY "ml_lotes_publicacao_select_policy"
  ON public.marketplace_lotes_publicacao
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "ml_lotes_publicacao_insert_policy" ON public.marketplace_lotes_publicacao;
CREATE POLICY "ml_lotes_publicacao_insert_policy"
  ON public.marketplace_lotes_publicacao
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "ml_lotes_publicacao_update_policy" ON public.marketplace_lotes_publicacao;
CREATE POLICY "ml_lotes_publicacao_update_policy"
  ON public.marketplace_lotes_publicacao
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
  WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "ml_lotes_publicacao_delete_policy" ON public.marketplace_lotes_publicacao;
CREATE POLICY "ml_lotes_publicacao_delete_policy"
  ON public.marketplace_lotes_publicacao
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

-- Blindagem RLS multi-tenant: public.marketplace_lotes_publicacao_itens
ALTER TABLE public.marketplace_lotes_publicacao_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ml_lotes_publicacao_itens_select_policy" ON public.marketplace_lotes_publicacao_itens;
CREATE POLICY "ml_lotes_publicacao_itens_select_policy"
  ON public.marketplace_lotes_publicacao_itens
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "ml_lotes_publicacao_itens_insert_policy" ON public.marketplace_lotes_publicacao_itens;
CREATE POLICY "ml_lotes_publicacao_itens_insert_policy"
  ON public.marketplace_lotes_publicacao_itens
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "ml_lotes_publicacao_itens_update_policy" ON public.marketplace_lotes_publicacao_itens;
CREATE POLICY "ml_lotes_publicacao_itens_update_policy"
  ON public.marketplace_lotes_publicacao_itens
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
  WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "ml_lotes_publicacao_itens_delete_policy" ON public.marketplace_lotes_publicacao_itens;
CREATE POLICY "ml_lotes_publicacao_itens_delete_policy"
  ON public.marketplace_lotes_publicacao_itens
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));
