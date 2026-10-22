-- ==============================================================================
-- Migration: Módulo "Caderneta de Mercadinho" (Coexistência com Fiado Tradicional)
-- Data: 2026-10-22
-- Governança: Modelagem Relacional Pura (Anti-JSONB) & RLS Multi-Tenant Estrito
-- ==============================================================================

-- 1. EXTENSÃO DA TABELA public.lojas (Configurações Globais da Caderneta)
ALTER TABLE public.lojas
    ADD COLUMN IF NOT EXISTS caderneta_ativa BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS dia_vencimento_padrao_caderneta SMALLINT NOT NULL DEFAULT 10;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_lojas_dia_vencimento_padrao_caderneta'
    ) THEN
        ALTER TABLE public.lojas 
        ADD CONSTRAINT chk_lojas_dia_vencimento_padrao_caderneta 
        CHECK (dia_vencimento_padrao_caderneta BETWEEN 1 AND 31);
    END IF;
END $$;

COMMENT ON COLUMN public.lojas.caderneta_ativa IS 'Feature toggle global para habilitar a modalidade Caderneta de Mercadinho';
COMMENT ON COLUMN public.lojas.dia_vencimento_padrao_caderneta IS 'Dia fixo padrão do mês sugerido para acerto de contas na caderneta';

-- 2. EXTENSÃO DA TABELA public.clientes (Habilitação, Limite e Saldo da Caderneta)
ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS permite_caderneta BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS limite_caderneta NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS saldo_devedor_caderneta NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS dia_vencimento_caderneta SMALLINT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_clientes_dia_vencimento_caderneta'
    ) THEN
        ALTER TABLE public.clientes 
        ADD CONSTRAINT chk_clientes_dia_vencimento_caderneta 
        CHECK (dia_vencimento_caderneta IS NULL OR (dia_vencimento_caderneta BETWEEN 1 AND 31));
    END IF;
END $$;

COMMENT ON COLUMN public.clientes.permite_caderneta IS 'Define se o cliente está autorizado a comprar na modalidade Caderneta de Mercadinho';
COMMENT ON COLUMN public.clientes.limite_caderneta IS 'Limite máximo de crédito concedido para compras na caderneta';
COMMENT ON COLUMN public.clientes.saldo_devedor_caderneta IS 'Saldo devedor acumulado em aberto na modalidade caderneta';
COMMENT ON COLUMN public.clientes.dia_vencimento_caderneta IS 'Dia fixo mensal acordado com o cliente para acerto de contas da caderneta';

-- 3. EXTENSÃO DA TABELA public.pedidos E public.pagamentos_pedido
ALTER TABLE public.pedidos
    ADD COLUMN IF NOT EXISTS eh_venda_caderneta BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ciclo_referencia_caderneta VARCHAR(7) NULL;

COMMENT ON COLUMN public.pedidos.eh_venda_caderneta IS 'Indica se a venda foi lançada na Caderneta de Mercadinho';
COMMENT ON COLUMN public.pedidos.ciclo_referencia_caderneta IS 'Ciclo de competência mensal da caderneta (ex: 2026-10)';

ALTER TABLE public.pagamentos_pedido
    ADD COLUMN IF NOT EXISTS eh_pagamento_caderneta BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.pagamentos_pedido.eh_pagamento_caderneta IS 'Indica se a linha de pagamento corresponde a débito na Caderneta';

-- 4. CRIAÇÃO DA TABELA DE LEDGER: public.caderneta_lancamentos
CREATE TABLE IF NOT EXISTS public.caderneta_lancamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    pedido_id UUID NULL REFERENCES public.pedidos(id) ON DELETE SET NULL,
    pagamento_pedido_id UUID NULL REFERENCES public.pagamentos_pedido(id) ON DELETE SET NULL,
    forma_pagamento_id UUID NULL REFERENCES public.formas_pagamento(id) ON DELETE SET NULL,
    usuario_id UUID NULL REFERENCES public.usuarios_loja(id) ON DELETE SET NULL,
    tipo_lancamento VARCHAR(20) NOT NULL CHECK (tipo_lancamento IN ('compra', 'pagamento', 'estorno', 'ajuste')),
    valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
    saldo_anterior NUMERIC(12,2) NOT NULL,
    saldo_posterior NUMERIC(12,2) NOT NULL,
    ciclo_referencia VARCHAR(7) NOT NULL,
    data_vencimento_ciclo DATE NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    observacoes TEXT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices estratégicos para performance e isolamento multitenant
CREATE INDEX IF NOT EXISTS idx_caderneta_lancamentos_loja_cliente 
    ON public.caderneta_lancamentos(loja_id, cliente_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_caderneta_lancamentos_pedido 
    ON public.caderneta_lancamentos(pedido_id);

CREATE INDEX IF NOT EXISTS idx_caderneta_lancamentos_ciclo 
    ON public.caderneta_lancamentos(loja_id, ciclo_referencia);

-- 5. BLINDAGEM RLS (ROW LEVEL SECURITY)
ALTER TABLE public.caderneta_lancamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caderneta_lancamentos_loja_policy" ON public.caderneta_lancamentos;

CREATE POLICY "caderneta_lancamentos_loja_policy"
    ON public.caderneta_lancamentos
    FOR ALL
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

-- Política permissiva de leitura para clientes autenticados no catálogo (acesso exclusivo ao seu próprio extrato)
DROP POLICY IF EXISTS "caderneta_lancamentos_cliente_read_policy" ON public.caderneta_lancamentos;

CREATE POLICY "caderneta_lancamentos_cliente_read_policy"
    ON public.caderneta_lancamentos
    FOR SELECT
    USING (
        cliente_id IN (
            SELECT id FROM public.clientes WHERE auth_uid = auth.uid()
        )
    );
