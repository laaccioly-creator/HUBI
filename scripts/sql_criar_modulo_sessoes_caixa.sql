-- ==============================================================================
-- MIGRAÇÃO: MÓDULO DE CONTROLE DE CAIXA (SESSÕES TRANSACIONAIS)
-- HUBI SISTEMA - 2026
-- ==============================================================================

-- 1. Tabela de Sessões de Caixa (sessoes_caixa)
CREATE TABLE IF NOT EXISTS public.sessoes_caixa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    terminal_id VARCHAR(50) NOT NULL DEFAULT 'PDV-01',
    aberto_por_usuario_id UUID NOT NULL REFERENCES public.usuarios_loja(id) ON DELETE RESTRICT,
    fechado_por_usuario_id UUID REFERENCES public.usuarios_loja(id) ON DELETE RESTRICT,
    aberto_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fechado_em TIMESTAMPTZ,
    fundo_inicial NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'FECHADO')),
    total_entradas_sistema NUMERIC(12,2) DEFAULT 0.00,
    total_saidas_sistema NUMERIC(12,2) DEFAULT 0.00,
    saldo_esperado_dinheiro NUMERIC(12,2) DEFAULT 0.00,
    saldo_declarado_dinheiro NUMERIC(12,2),
    diferenca_dinheiro NUMERIC(12,2),
    declarado_por_metodo JSONB DEFAULT '{}'::jsonb,
    observacoes_fechamento TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Movimentações da Sessão (movimentacoes_caixa)
CREATE TABLE IF NOT EXISTS public.movimentacoes_caixa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    sessao_caixa_id UUID NOT NULL REFERENCES public.sessoes_caixa(id) ON DELETE RESTRICT,
    pedido_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('VENDA', 'SUPRIMENTO', 'SANGRIA', 'DESPESA')),
    metodo_pagamento VARCHAR(30) NOT NULL CHECK (metodo_pagamento IN ('DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'OUTROS')),
    valor NUMERIC(12,2) NOT NULL,
    descricao TEXT,
    criado_por_usuario_id UUID NOT NULL REFERENCES public.usuarios_loja(id) ON DELETE RESTRICT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Índices de Alta Performance
CREATE INDEX IF NOT EXISTS idx_sessoes_loja_status ON public.sessoes_caixa(loja_id, status);
CREATE INDEX IF NOT EXISTS idx_sessoes_terminal_status ON public.sessoes_caixa(loja_id, terminal_id, status);
CREATE INDEX IF NOT EXISTS idx_sessoes_aberto_em ON public.sessoes_caixa(aberto_em DESC);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_sessao ON public.movimentacoes_caixa(sessao_caixa_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_pedido ON public.movimentacoes_caixa(pedido_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_tipo ON public.movimentacoes_caixa(tipo);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_metodo ON public.movimentacoes_caixa(metodo_pagamento);

-- 4. Habilitar RLS (Row Level Security)
ALTER TABLE public.sessoes_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_caixa ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de Acesso Permissivas para a Loja Autenticada
DROP POLICY IF EXISTS "Permitir acesso completo a sessoes_caixa" ON public.sessoes_caixa;
CREATE POLICY "Permitir acesso completo a sessoes_caixa" 
ON public.sessoes_caixa FOR ALL 
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso completo a movimentacoes_caixa" ON public.movimentacoes_caixa;
CREATE POLICY "Permitir acesso completo a movimentacoes_caixa" 
ON public.movimentacoes_caixa FOR ALL 
USING (true) WITH CHECK (true);

-- 6. Comentários Documentais
COMMENT ON TABLE public.sessoes_caixa IS 'Sessões transacionais de caixa contínuas (abertura e fechamento cego) independentes de calendário';
COMMENT ON TABLE public.movimentacoes_caixa IS 'Movimentações analíticas da sessão (vendas automáticas, suprimentos, sangrias e despesas)';
