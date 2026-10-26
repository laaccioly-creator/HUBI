-- Migration: Correção de Herança e Persistência de Unidades em Itens de Pedido
-- Data: 2026-10-26
-- Governança: anti-jsonb-linter, supabase-rls-guard, pii-leak-detector

-- 1. ADICIONAR COLUNA TIPO_UNIDADE NA TABELA ITENS_PEDIDO (SE NÃO EXISTIR)
ALTER TABLE public.itens_pedido
  ADD COLUMN IF NOT EXISTS tipo_unidade VARCHAR(10) NULL;

COMMENT ON COLUMN public.itens_pedido.tipo_unidade IS 
  'Tipo de unidade do produto (ex: kg, un, l, m), herdado do cadastro mestre para conferência e pesagem.';

-- 2. RETROALIMENTAR ITENS DE PEDIDO EXISTENTES COM BASE NO CADASTRO DO PRODUTO
UPDATE public.itens_pedido ip
SET
  tipo_unidade = LOWER(TRIM(COALESCE(p.tipo_unidade, p.unidade_medida, 'un'))),
  unidade_medida = CASE
    WHEN LOWER(TRIM(COALESCE(p.tipo_unidade, p.unidade_medida, ''))) IN ('kg', 'g') THEN 'KG'
    ELSE COALESCE(NULLIF(UPPER(TRIM(p.unidade_medida)), ''), 'UN')
  END,
  quantidade_solicitada = COALESCE(ip.quantidade_solicitada, ip.quantidade)
FROM public.produtos p
WHERE ip.produto_id = p.id
  AND (
    ip.tipo_unidade IS NULL
    OR (LOWER(TRIM(COALESCE(p.tipo_unidade, p.unidade_medida, ''))) = 'kg' AND LOWER(TRIM(ip.unidade_medida)) != 'kg')
  );
