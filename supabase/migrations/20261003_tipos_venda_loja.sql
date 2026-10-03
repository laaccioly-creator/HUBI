-- ============================================================================
-- MIGRAÇÃO: Suporte a "Tipos de Venda" (Varejo, Atacado, Distribuidor) na Loja
-- ============================================================================

-- 1. Adicionar coluna tipos_venda JSONB na tabela lojas
ALTER TABLE public.lojas 
ADD COLUMN IF NOT EXISTS tipos_venda JSONB DEFAULT '{"varejo": true, "atacado": true, "distribuidor": true}'::jsonb;

-- 2. Atualizar registros existentes onde tipos_venda for nulo
UPDATE public.lojas
SET tipos_venda = COALESCE(
  configuracoes_extras->'tipos_venda_ativos',
  '{"varejo": true, "atacado": true, "distribuidor": true}'::jsonb
)
WHERE tipos_venda IS NULL;

-- 3. Sincronizar configuracoes_extras existente caso contenha o campo
UPDATE public.lojas
SET configuracoes_extras = jsonb_set(
  COALESCE(configuracoes_extras, '{}'::jsonb),
  '{tipos_venda_ativos}',
  COALESCE(tipos_venda, '{"varejo": true, "atacado": true, "distribuidor": true}'::jsonb)
)
WHERE configuracoes_extras IS NOT NULL
  AND (configuracoes_extras->'tipos_venda_ativos') IS NULL;

-- 4. Suporte caso a tabela configuracoes_loja exista em algum ambiente
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'configuracoes_loja') THEN
    ALTER TABLE public.configuracoes_loja 
    ADD COLUMN IF NOT EXISTS tipos_venda JSONB DEFAULT '{"varejo": true, "atacado": true, "distribuidor": true}'::jsonb;
  END IF;
END $$;

-- 5. Comentário descritivo na coluna
COMMENT ON COLUMN public.lojas.tipos_venda IS 'Modalidades comerciais ativas na loja (varejo, atacado, distribuidor) para consumo no PDV e Catálogo';
