-- Migração: Adicionar coluna cupom_id na tabela pedidos
-- Data: 2026-10-18

ALTER TABLE public.pedidos 
ADD COLUMN IF NOT EXISTS cupom_id UUID REFERENCES public.cupons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_cupom_id ON public.pedidos(cupom_id);

COMMENT ON COLUMN public.pedidos.cupom_id IS 'ID do cupom de desconto aplicado na venda/pedido';
