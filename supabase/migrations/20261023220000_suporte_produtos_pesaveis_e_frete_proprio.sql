-- Migration: Suporte a Produtos Pesáveis/Fracionados, Precisão Decimal e Configuração de Frete Próprio
-- Data: 2026-10-23
-- Diretrizes: anti-jsonb-linter, supabase-rls-guard, pii-leak-detector

-- 1. COLUNAS PARA VENDA FRACIONADA / PESÁVEL NA TABELA PRODUTOS
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS unidade_medida VARCHAR(10) NOT NULL DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS permite_fracionado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS venda_por_peso BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS codigo_balanca INTEGER NULL;

-- Atualizar registros existentes priorizando tipo_unidade fracionado quando unidade_medida estiver no default 'UN'
UPDATE public.produtos
SET
  unidade_medida = CASE
    WHEN LOWER(TRIM(COALESCE(tipo_unidade, ''))) IN ('kg', 'g', 'l', 'ml', 'm', 'cm') THEN UPPER(TRIM(tipo_unidade))
    ELSE UPPER(COALESCE(NULLIF(TRIM(unidade_medida), ''), NULLIF(TRIM(tipo_unidade), ''), 'UN'))
  END,
  permite_fracionado = CASE 
    WHEN LOWER(TRIM(COALESCE(tipo_unidade, ''))) IN ('kg', 'g', 'l', 'ml', 'm', 'cm')
      OR LOWER(TRIM(COALESCE(unidade_medida, ''))) IN ('kg', 'g', 'l', 'ml', 'm', 'cm') THEN TRUE 
    ELSE permite_fracionado 
  END,
  venda_por_peso = CASE 
    WHEN LOWER(TRIM(COALESCE(tipo_unidade, ''))) IN ('kg', 'g')
      OR LOWER(TRIM(COALESCE(unidade_medida, ''))) IN ('kg', 'g') THEN TRUE 
    ELSE venda_por_peso 
  END;

-- 2. GARANTIR PRECISÃO DE 3 CASAS DECIMAIS (NUMERIC(12,3)) EM QUANTIDADES E ESTOQUES

-- A) Alteração segura de variacoes_produto (desabilitando / removendo temporariamente o trigger dependente)
DO $$
DECLARE
  v_tg_name TEXT;
  v_tg_func TEXT;
  v_tg_timing TEXT;
  v_tg_events TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'variacoes_produto' AND column_name = 'quantidade_estoque'
  ) THEN
    -- Identificar se o trigger trg_sincronizar_estoque_pai está presente na tabela variacoes_produto
    IF EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'variacoes_produto' AND t.tgname = 'trg_sincronizar_estoque_pai'
    ) THEN
      DROP TRIGGER IF EXISTS trg_sincronizar_estoque_pai ON public.variacoes_produto;
    END IF;

    -- Alterar tipo da coluna com precisão de 3 casas decimais
    ALTER TABLE public.variacoes_produto
      ALTER COLUMN quantidade_estoque TYPE NUMERIC(12,3) USING ROUND(quantidade_estoque::numeric, 3);

    -- Recriar o trigger se a função correspondente existir no banco
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'sincronizar_estoque_pai'
    ) THEN
      CREATE TRIGGER trg_sincronizar_estoque_pai
      AFTER INSERT OR UPDATE OF quantidade_estoque OR DELETE ON public.variacoes_produto
      FOR EACH ROW EXECUTE FUNCTION public.sincronizar_estoque_pai();
    ELSIF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_sincronizar_estoque_pai'
    ) THEN
      CREATE TRIGGER trg_sincronizar_estoque_pai
      AFTER INSERT OR UPDATE OF quantidade_estoque OR DELETE ON public.variacoes_produto
      FOR EACH ROW EXECUTE FUNCTION public.fn_sincronizar_estoque_pai();
    END IF;
  END IF;
END $$;

-- B) Alteração na tabela produtos
ALTER TABLE public.produtos
  ALTER COLUMN quantidade_estoque TYPE NUMERIC(12,3) USING ROUND(quantidade_estoque::numeric, 3);

-- C) Alteração e novos campos na tabela itens_pedido
ALTER TABLE public.itens_pedido
  ALTER COLUMN quantidade TYPE NUMERIC(12,3) USING ROUND(quantidade::numeric, 3),
  ADD COLUMN IF NOT EXISTS unidade_medida VARCHAR(10) NOT NULL DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS peso_solicitado_kg NUMERIC(12,3) NULL,
  ADD COLUMN IF NOT EXISTS peso_real_kg NUMERIC(12,3) NULL;

-- 3. EXPANSÃO DE CONFIGURAÇÕES DE FRETE PRÓPRIO DA LOJA
ALTER TABLE public.loja_shipping_configs
  ADD COLUMN IF NOT EXISTS frete_proprio_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS frete_proprio_nome VARCHAR(100) NOT NULL DEFAULT 'Entrega Própria da Loja',
  ADD COLUMN IF NOT EXISTS frete_proprio_tipo_cobranca VARCHAR(20) NOT NULL DEFAULT 'fixo',
  ADD COLUMN IF NOT EXISTS frete_proprio_valor_padrao NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS frete_proprio_prazo_estimado VARCHAR(80) NOT NULL DEFAULT 'Entrega hoje (30 a 60 min)';

-- 4. SANITIZAÇÃO DE REGISTROS LEGADOS DE FRETE PRÓPRIO ("Frete Italia") EM FORMAS_ENTREGA
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'formas_entrega'
  ) THEN
    UPDATE public.formas_entrega fe
    SET
      nome = COALESCE(NULLIF(TRIM(cfg.frete_proprio_nome), ''), 'Entrega Própria da Loja'),
      valor_taxa = COALESCE(cfg.frete_proprio_valor_padrao, fe.valor_taxa, 0),
      atualizado_em = NOW()
    FROM public.loja_shipping_configs cfg
    WHERE fe.loja_id = cfg.loja_id
      AND (fe.nome ILIKE '%Frete Italia%' OR fe.tipo IN ('frota_propria', 'proprio'));

    ALTER TABLE public.formas_entrega ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Garantir RLS ativo em todas as tabelas afetadas
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loja_shipping_configs ENABLE ROW LEVEL SECURITY;
