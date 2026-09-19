-- ==============================================================================
-- MIGRATION: 20260919_ajuste_formas_entrega_relacional.sql
-- Adequação relacional da tabela formas_entrega e suporte a frete manual
-- ==============================================================================

-- 1. AJUSTE DE CONSTRAINTS E NOVAS COLUNAS EM formas_entrega
ALTER TABLE public.formas_entrega 
  DROP CONSTRAINT IF EXISTS formas_entrega_tipo_check;

ALTER TABLE public.formas_entrega 
  ADD CONSTRAINT formas_entrega_tipo_check 
  CHECK (tipo::text = ANY (ARRAY['retirada', 'taxa_fixa', 'bairro', 'distancia_km', 'proprio', 'transportadora', 'manual']));

ALTER TABLE public.formas_entrega 
  ADD COLUMN IF NOT EXISTS requer_codigo_rastreio BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requer_entregador BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS padrao BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT NOW();

-- 2. GARANTIR CHAVES ESTRANGEIRAS EM pedidos E pedido_entregas
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS forma_entrega_id UUID REFERENCES public.formas_entrega(id) ON DELETE SET NULL;

ALTER TABLE public.pedido_entregas
  ADD COLUMN IF NOT EXISTS forma_entrega_id UUID REFERENCES public.formas_entrega(id) ON DELETE SET NULL;

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_pedidos_forma_entrega_id 
  ON public.pedidos(forma_entrega_id) 
  WHERE forma_entrega_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pedido_entregas_forma_entrega_id 
  ON public.pedido_entregas(forma_entrega_id) 
  WHERE forma_entrega_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_formas_entrega_loja_ativo 
  ON public.formas_entrega(loja_id, ativo);

-- 3. SEGURANÇA E ISOLAMENTO MULTITENANT (RLS)
ALTER TABLE public.formas_entrega ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso seguro multitenant em formas_entrega" ON public.formas_entrega;
CREATE POLICY "Acesso seguro multitenant em formas_entrega"
  ON public.formas_entrega
  FOR ALL
  USING (loja_id IN (SELECT id FROM public.lojas WHERE public.usuario_pertence_loja(id)))
  WITH CHECK (loja_id IN (SELECT id FROM public.lojas WHERE public.usuario_pertence_loja(id)));

-- 4. SEED IDEMPOTENTE DAS OPÇÕES PADRÃO PARA LOJAS EXISTENTES
DO $$
DECLARE
  r_loja RECORD;
BEGIN
  FOR r_loja IN SELECT id FROM public.lojas LOOP
    -- Retirada na Loja
    IF NOT EXISTS (
      SELECT 1 FROM public.formas_entrega 
      WHERE loja_id = r_loja.id AND tipo = 'retirada'
    ) THEN
      INSERT INTO public.formas_entrega (loja_id, nome, tipo, valor_taxa, requer_codigo_rastreio, requer_entregador, ativo, padrao)
      VALUES (r_loja.id, 'Retirada na Loja', 'retirada', 0.00, FALSE, FALSE, TRUE, TRUE);
    END IF;

    -- Motoboy / Frota Própria
    IF NOT EXISTS (
      SELECT 1 FROM public.formas_entrega 
      WHERE loja_id = r_loja.id AND (tipo = 'proprio' OR nome ILIKE '%motoboy%')
    ) THEN
      INSERT INTO public.formas_entrega (loja_id, nome, tipo, valor_taxa, requer_codigo_rastreio, requer_entregador, ativo, padrao)
      VALUES (r_loja.id, 'Motoboy / Frota Própria', 'proprio', 0.00, FALSE, TRUE, TRUE, TRUE);
    END IF;

    -- Uber / 99 Manual
    IF NOT EXISTS (
      SELECT 1 FROM public.formas_entrega 
      WHERE loja_id = r_loja.id AND nome ILIKE '%uber%99%'
    ) THEN
      INSERT INTO public.formas_entrega (loja_id, nome, tipo, valor_taxa, requer_codigo_rastreio, requer_entregador, ativo, padrao)
      VALUES (r_loja.id, 'Uber / 99 Manual', 'proprio', 0.00, FALSE, FALSE, TRUE, FALSE);
    END IF;

    -- Correios / Transportadora
    IF NOT EXISTS (
      SELECT 1 FROM public.formas_entrega 
      WHERE loja_id = r_loja.id AND (tipo = 'transportadora' OR nome ILIKE '%correios%')
    ) THEN
      INSERT INTO public.formas_entrega (loja_id, nome, tipo, valor_taxa, requer_codigo_rastreio, requer_entregador, ativo, padrao)
      VALUES (r_loja.id, 'Correios / Transportadora', 'transportadora', 0.00, TRUE, FALSE, TRUE, FALSE);
    END IF;
  END LOOP;
END $$;
