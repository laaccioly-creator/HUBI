-- ==============================================================================
-- MIGRATION: Módulo de Frete, Retirada e Endereços de Entrega (HUBI)
-- DIRETRIZ ARQUITETURAL: 100% Relacional, sem colunas genéricas JSON/JSONB/metadata
-- ==============================================================================

-- 1. TABELA: loja_shipping_configs
-- Configurações logísticas da loja, credenciais das transportadoras e endereço de origem
CREATE TABLE IF NOT EXISTS public.loja_shipping_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    
    -- Endereço de Origem (usado tanto para base de cotação quanto para ponto de retirada)
    origem_cep VARCHAR(9) NOT NULL,
    origem_logradouro VARCHAR(255) NOT NULL,
    origem_numero VARCHAR(30) NOT NULL,
    origem_complemento VARCHAR(100),
    origem_bairro VARCHAR(100) NOT NULL,
    origem_cidade VARCHAR(100) NOT NULL,
    origem_uf VARCHAR(2) NOT NULL,
    origem_latitude NUMERIC(10, 8),
    origem_longitude NUMERIC(11, 8),

    -- Bloco Uber Direct
    uber_customer_id TEXT,
    uber_client_id TEXT,
    uber_client_secret TEXT,
    uber_sandbox_mode BOOLEAN NOT NULL DEFAULT true,
    uber_ativo BOOLEAN NOT NULL DEFAULT false,

    -- Bloco Melhor Envio
    melhor_envio_token TEXT,
    melhor_envio_sandbox_mode BOOLEAN NOT NULL DEFAULT true,
    melhor_envio_ativo BOOLEAN NOT NULL DEFAULT false,

    -- Retirada na Loja
    permite_retirada_loja BOOLEAN NOT NULL DEFAULT true,

    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_loja_shipping_configs_loja UNIQUE (loja_id)
);

CREATE INDEX IF NOT EXISTS idx_loja_shipping_configs_loja_id 
    ON public.loja_shipping_configs(loja_id);

-- 2. TABELA: cliente_enderecos
-- Cadastro relacional de múltiplos endereços vinculados ao cliente
CREATE TABLE IF NOT EXISTS public.cliente_enderecos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    identificador VARCHAR(50), -- Ex: 'Casa', 'Trabalho', 'Galpão'
    cep VARCHAR(9) NOT NULL,
    logradouro VARCHAR(255) NOT NULL,
    numero VARCHAR(20) NOT NULL,
    complemento VARCHAR(100),
    bairro VARCHAR(100) NOT NULL,
    cidade VARCHAR(100) NOT NULL,
    uf VARCHAR(2) NOT NULL,
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    is_principal BOOLEAN NOT NULL DEFAULT false,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cliente_enderecos_cliente_id 
    ON public.cliente_enderecos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_enderecos_cep 
    ON public.cliente_enderecos(cep);

-- 3. TABELA: pedido_entregas
-- Isolamento relacional da logística do pedido com snapshot imutável do destino
CREATE TABLE IF NOT EXISTS public.pedido_entregas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    tipo_atendimento VARCHAR(20) NOT NULL CHECK (tipo_atendimento IN ('retirada', 'entrega')),
    cliente_endereco_id UUID REFERENCES public.cliente_enderecos(id) ON DELETE SET NULL,

    -- Snapshot relacional do destino no momento da venda (preenchido apenas se entrega)
    destino_cep VARCHAR(9),
    destino_logradouro VARCHAR(255),
    destino_numero VARCHAR(20),
    destino_complemento VARCHAR(100),
    destino_bairro VARCHAR(100),
    destino_cidade VARCHAR(100),
    destino_uf VARCHAR(2),
    destino_latitude NUMERIC(10, 8),
    destino_longitude NUMERIC(11, 8),

    -- Dados logísticos e financeiros da entrega
    provedor VARCHAR(30) CHECK (provedor IN ('uber', 'melhor_envio', 'retirada_loja')),
    transportadora_nome VARCHAR(100),
    servico_codigo VARCHAR(100),
    valor_frete NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    prazo_estimado_texto VARCHAR(100),
    codigo_rastreio VARCHAR(100),
    status_envio VARCHAR(50) NOT NULL DEFAULT 'pendente',

    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_pedido_entregas_pedido UNIQUE (pedido_id)
);

CREATE INDEX IF NOT EXISTS idx_pedido_entregas_pedido_id 
    ON public.pedido_entregas(pedido_id);

-- 4. ATUALIZAÇÃO DA TABELA pedidos
-- Assegura as colunas numéricas explícitas de fechamento financeiro
ALTER TABLE public.pedidos 
    ADD COLUMN IF NOT EXISTS subtotal_produtos NUMERIC(10, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS valor_desconto NUMERIC(10, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS valor_frete NUMERIC(10, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10, 2) DEFAULT 0.00;

-- Sincroniza subtotal_produtos a partir de subtotal nos pedidos existentes
UPDATE public.pedidos 
SET subtotal_produtos = subtotal 
WHERE (subtotal_produtos IS NULL OR subtotal_produtos = 0) AND subtotal > 0;

-- 5. FUNÇÃO E TRIGGERS DE ATUALIZAÇÃO AUTOMÁTICA DE TIMESTAMP
CREATE OR REPLACE FUNCTION public.fn_atualizar_timestamp_modificacao()
RETURNS TRIGGER AS 
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
 LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_loja_shipping_configs_updated_at ON public.loja_shipping_configs;
CREATE TRIGGER trg_loja_shipping_configs_updated_at
    BEFORE UPDATE ON public.loja_shipping_configs
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp_modificacao();

DROP TRIGGER IF EXISTS trg_cliente_enderecos_updated_at ON public.cliente_enderecos;
CREATE TRIGGER trg_cliente_enderecos_updated_at
    BEFORE UPDATE ON public.cliente_enderecos
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp_modificacao();

DROP TRIGGER IF EXISTS trg_pedido_entregas_updated_at ON public.pedido_entregas;
CREATE TRIGGER trg_pedido_entregas_updated_at
    BEFORE UPDATE ON public.pedido_entregas
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp_modificacao();

-- 6. HABILITAR RLS (ROW LEVEL SECURITY) E POLÍTICAS DE ACESSO
ALTER TABLE public.loja_shipping_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_enderecos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_entregas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir acesso completo a loja_shipping_configs" ON public.loja_shipping_configs;
CREATE POLICY "Permitir acesso completo a loja_shipping_configs" 
ON public.loja_shipping_configs FOR ALL 
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso completo a cliente_enderecos" ON public.cliente_enderecos;
CREATE POLICY "Permitir acesso completo a cliente_enderecos" 
ON public.cliente_enderecos FOR ALL 
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso completo a pedido_entregas" ON public.pedido_entregas;
CREATE POLICY "Permitir acesso completo a pedido_entregas" 
ON public.pedido_entregas FOR ALL 
USING (true) WITH CHECK (true);
