-- Migração da FASE 3: Flag de Controle Idempotente de Baixa de Estoque e Tabela de Movimentações de Estoque

-- 1. Adiciona a flag booleana de controle de baixa idempotente de estoque na tabela pedidos
ALTER TABLE public.pedidos 
ADD COLUMN IF NOT EXISTS estoque_baixado BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.pedidos.estoque_baixado IS 'Indica se os itens deste pedido já tiveram saída física realizada no estoque';

-- Índice para consultas rápidas de pedidos com estoque pendente de sincronização
CREATE INDEX IF NOT EXISTS idx_pedidos_estoque_baixado ON public.pedidos(estoque_baixado);

-- 2. Tabela de Auditoria e Log Analítico de Movimentações de Estoque
CREATE TABLE IF NOT EXISTS public.movimentacoes_estoque (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    variacao_id UUID REFERENCES public.variacoes_produto(id) ON DELETE SET NULL,
    pedido_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL,
    usuario_id UUID REFERENCES public.usuarios_loja(id) ON DELETE SET NULL,
    tipo_movimentacao VARCHAR(50) NOT NULL, -- 'saida_venda', 'entrada_estorno_cancelamento', 'entrada_compra', 'baixa_perda', 'ajuste_inventario'
    quantidade NUMERIC(12, 3) NOT NULL,
    saldo_anterior NUMERIC(12, 3),
    saldo_posterior NUMERIC(12, 3),
    motivo TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_movimentacoes_estoque_loja ON public.movimentacoes_estoque(loja_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_estoque_produto ON public.movimentacoes_estoque(produto_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_estoque_pedido ON public.movimentacoes_estoque(pedido_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_estoque_criado_em ON public.movimentacoes_estoque(criado_em DESC);

-- Habilitar RLS e criar políticas de isolamento multi-tenant
ALTER TABLE public.movimentacoes_estoque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movimentacoes_estoque_loja_all" ON public.movimentacoes_estoque;
CREATE POLICY "movimentacoes_estoque_loja_all" ON public.movimentacoes_estoque 
FOR ALL USING (
    public.usuario_pertence_loja(loja_id)
) WITH CHECK (
    public.usuario_pertence_loja(loja_id)
);

COMMENT ON TABLE public.movimentacoes_estoque IS 'Registro e auditoria de movimentações físicas de estoque dos produtos e variações';
