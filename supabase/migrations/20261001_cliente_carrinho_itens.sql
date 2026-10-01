-- =========================================================================
-- MIGRATION: PERSISTÊNCIA RELACIONAL DO CARRINHO NO SUPABASE (HUBI)
-- Data: 2026-10-01
-- Governança: Modelagem Relacional Pura (Anti-JSONB) & RLS Multitenant
-- =========================================================================

-- 1. Criação da Tabela cliente_carrinho_itens
CREATE TABLE IF NOT EXISTS public.cliente_carrinho_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  variacao_id UUID NULL,
  quantidade NUMERIC(12,3) NOT NULL DEFAULT 1,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. FK Condicional para variacoes_produto se a tabela existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'variacoes_produto') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_name = 'cliente_carrinho_itens' AND constraint_name = 'fk_cliente_carrinho_variacao'
    ) THEN
      ALTER TABLE public.cliente_carrinho_itens
        ADD CONSTRAINT fk_cliente_carrinho_variacao
        FOREIGN KEY (variacao_id) REFERENCES public.variacoes_produto(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 3. Índice Único Composto (cliente_id, produto_id, COALESCE(variacao_id))
-- Garante atomicidade: um único registro por variação/produto por cliente
CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_carrinho_item 
  ON public.cliente_carrinho_itens (
    cliente_id, 
    produto_id, 
    (COALESCE(variacao_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

-- 4. Índices para performance de consulta por loja e cliente
CREATE INDEX IF NOT EXISTS idx_cliente_carrinho_loja_cliente 
  ON public.cliente_carrinho_itens (loja_id, cliente_id);

CREATE INDEX IF NOT EXISTS idx_cliente_carrinho_produto 
  ON public.cliente_carrinho_itens (produto_id);

-- 5. Habilitação de Row Level Security (RLS)
ALTER TABLE public.cliente_carrinho_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente_carrinho_itens_operadores_policy" ON public.cliente_carrinho_itens;
CREATE POLICY "cliente_carrinho_itens_operadores_policy"
  ON public.cliente_carrinho_itens
  FOR ALL
  TO authenticated, anon
  USING (loja_id IS NOT NULL)
  WITH CHECK (loja_id IS NOT NULL);
