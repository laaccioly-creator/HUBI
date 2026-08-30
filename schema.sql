-- ==============================================================================
-- SISTEMA HUBI - SCHEMA COMPLETO SUPABASE / POSTGRESQL (pt-BR)
-- Versão: 1.0 (Com suporte a Multi-tenant, RLS, Realtime, Triggers e Multi-Preços)
-- ==============================================================================

-- 1. EXTENSÕES NECESSÁRIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. CRIAÇÃO DAS TABELAS
-- ==============================================================================

-- Tabela: lojas (Multi-tenant & Configurações da Loja)
CREATE TABLE IF NOT EXISTS public.lojas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_fantasia VARCHAR(150) NOT NULL,
    razao_social VARCHAR(200),
    tipo_documento VARCHAR(4) CHECK (tipo_documento IN ('CPF', 'CNPJ')),
    numero_documento VARCHAR(20),
    telefone VARCHAR(20),
    whatsapp VARCHAR(20) NOT NULL,
    email VARCHAR(150) NOT NULL,
    instagram VARCHAR(100),
    endereco_logradouro VARCHAR(200),
    endereco_numero VARCHAR(30),
    endereco_complemento VARCHAR(100),
    endereco_bairro VARCHAR(100),
    endereco_cidade VARCHAR(100),
    endereco_estado VARCHAR(2),
    endereco_cep VARCHAR(10),
    sobre_loja TEXT,
    url_logo TEXT,
    url_banner TEXT,
    cor_primaria VARCHAR(10) DEFAULT '#10B981',
    moeda VARCHAR(5) DEFAULT 'BRL',
    slug_catalogo VARCHAR(80) UNIQUE NOT NULL,
    aceita_pedidos_online BOOLEAN DEFAULT TRUE,
    resumo_whatsapp BOOLEAN DEFAULT TRUE,
    instrucoes_pos_pedido TEXT,
    valor_minimo_pedido NUMERIC(12,2) DEFAULT 0.00,
    tipo_plano VARCHAR(20) DEFAULT 'GROW',
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: usuarios_loja (Usuários, Vendedores e Permissões RBAC)
CREATE TABLE IF NOT EXISTS public.usuarios_loja (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    usuario_auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    nome_completo VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    whatsapp_atendimento VARCHAR(20),
    perfil VARCHAR(20) NOT NULL DEFAULT 'vendedor' CHECK (perfil IN ('admin', 'gerente', 'vendedor')),
    pode_ver_preco_custo BOOLEAN DEFAULT FALSE,
    pode_exportar_relatorios BOOLEAN DEFAULT FALSE,
    pode_editar_vendas_passadas BOOLEAN DEFAULT FALSE,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: categorias (Categorias de Produtos)
CREATE TABLE IF NOT EXISTS public.categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    icone VARCHAR(50),
    ordem_exibicao INTEGER DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: fornecedores (Gestão de Fornecedores)
CREATE TABLE IF NOT EXISTS public.fornecedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    nome VARCHAR(150) NOT NULL,
    pessoa_contato VARCHAR(100),
    telefone VARCHAR(20),
    whatsapp VARCHAR(20),
    email VARCHAR(150),
    numero_documento VARCHAR(20),
    observacoes TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: produtos (Produtos Principais com Múltiplas Tabelas de Preço)
CREATE TABLE IF NOT EXISTS public.produtos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
    fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL,
    nome VARCHAR(200) NOT NULL,
    codigo_interno VARCHAR(50),
    codigo_barras VARCHAR(50),
    descricao TEXT,
    fotos_urls JSONB DEFAULT '[]'::jsonb,
    tipo_unidade VARCHAR(10) DEFAULT 'un',
    preco_custo NUMERIC(12,2) DEFAULT 0.00,
    preco_venda_varejo NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    preco_venda_atacado NUMERIC(12,2),
    qtd_minima_atacado NUMERIC(12,3) DEFAULT 6,
    preco_venda_autoatacado NUMERIC(12,2),
    qtd_minima_autoatacado NUMERIC(12,3) DEFAULT 24,
    preco_promocional NUMERIC(12,2),
    promocao_ativa BOOLEAN DEFAULT FALSE,
    quantidade_estoque NUMERIC(12,3) DEFAULT 0,
    estoque_minimo_alerta NUMERIC(12,3) DEFAULT 0,
    tem_variacoes BOOLEAN DEFAULT FALSE,
    rotulo_variacao_1 VARCHAR(50),
    rotulo_variacao_2 VARCHAR(50),
    eh_combo BOOLEAN DEFAULT FALSE,
    data_validade DATE,
    exibir_catalogo BOOLEAN DEFAULT TRUE,
    destaque BOOLEAN DEFAULT FALSE,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: variacoes_produto (Grade de até 2 Variações por Produto com Preços)
CREATE TABLE IF NOT EXISTS public.variacoes_produto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    valor_variacao_1 VARCHAR(80) NOT NULL,
    valor_variacao_2 VARCHAR(80),
    sku VARCHAR(50),
    codigo_barras VARCHAR(50),
    preco_custo NUMERIC(12,2),
    preco_venda_varejo NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    preco_venda_atacado NUMERIC(12,2),
    preco_venda_autoatacado NUMERIC(12,2),
    preco_promocional NUMERIC(12,2),
    quantidade_estoque NUMERIC(12,3) DEFAULT 0,
    estoque_minimo_alerta NUMERIC(12,3) DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: itens_combo (Composição de Kits/Combos com baixa nos filhos)
CREATE TABLE IF NOT EXISTS public.itens_combo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    produto_combo_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    produto_filho_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    variacao_filho_id UUID REFERENCES public.variacoes_produto(id) ON DELETE SET NULL,
    quantidade NUMERIC(12,3) NOT NULL DEFAULT 1,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: clientes (Clientes, Perfil de Preço & Controle de Fiado)
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    nome VARCHAR(150) NOT NULL,
    telefone VARCHAR(20),
    whatsapp VARCHAR(20),
    email VARCHAR(150),
    numero_documento VARCHAR(20),
    tabela_preco_padrao VARCHAR(20) DEFAULT 'varejo',
    endereco_principal TEXT,
    endereco_secundario TEXT,
    saldo_devedor_fiado NUMERIC(12,2) DEFAULT 0.00,
    limite_credito NUMERIC(12,2) DEFAULT 0.00,
    permite_fiado BOOLEAN DEFAULT TRUE,
    data_aniversario DATE,
    observacoes TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: formas_pagamento (Formas de Pagamento & Taxas de Maquininha)
CREATE TABLE IF NOT EXISTS public.formas_pagamento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'fiado', 'outro')),
    taxa_percentual NUMERIC(5,2) DEFAULT 0.00,
    taxa_fixa NUMERIC(12,2) DEFAULT 0.00,
    maximo_parcelas INTEGER DEFAULT 1,
    ativo BOOLEAN DEFAULT TRUE,
    exibir_catalogo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: formas_entrega (Opções de Frete e Retirada)
CREATE TABLE IF NOT EXISTS public.formas_entrega (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('retirada', 'taxa_fixa', 'bairro', 'distancia_km')),
    valor_taxa NUMERIC(12,2) DEFAULT 0.00,
    valor_por_km NUMERIC(12,2) DEFAULT 0.00,
    tempo_estimado VARCHAR(50),
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: pedidos (Vendas do PDV e Pedidos do Catálogo)
CREATE TABLE IF NOT EXISTS public.pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    numero_pedido BIGSERIAL,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
    vendedor_id UUID REFERENCES public.usuarios_loja(id) ON DELETE SET NULL,
    origem VARCHAR(20) NOT NULL DEFAULT 'pdv_mobile' CHECK (origem IN ('pdv_mobile', 'pdv_desktop', 'catalogo_online')),
    tabela_preco_aplicada VARCHAR(20) DEFAULT 'varejo',
    status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'em_producao', 'em_expedicao', 'entregue', 'concluido', 'cancelado')),
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    valor_desconto NUMERIC(12,2) DEFAULT 0.00,
    valor_frete NUMERIC(12,2) DEFAULT 0.00,
    valor_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    valor_pago NUMERIC(12,2) DEFAULT 0.00,
    saldo_devedor NUMERIC(12,2) DEFAULT 0.00,
    fiado_quitado BOOLEAN DEFAULT FALSE,
    endereco_entrega TEXT,
    observacoes TEXT,
    data_venda TIMESTAMPTZ DEFAULT NOW(),
    data_entrega_agendada TIMESTAMPTZ,
    motivo_cancelamento TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: itens_pedido (Itens de Cada Venda com Snapshot de Custo e Preço)
CREATE TABLE IF NOT EXISTS public.itens_pedido (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    variacao_id UUID REFERENCES public.variacoes_produto(id) ON DELETE SET NULL,
    tabela_preco_utilizada VARCHAR(20) DEFAULT 'varejo',
    nome_produto VARCHAR(200) NOT NULL,
    rotulo_variacao VARCHAR(150),
    preco_custo_unitario NUMERIC(12,2) DEFAULT 0.00,
    preco_venda_unitario NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    quantidade NUMERIC(12,3) NOT NULL DEFAULT 1,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    observacoes VARCHAR(255),
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: pagamentos_pedido (Multi-pagamentos e Quitações Parciais)
CREATE TABLE IF NOT EXISTS public.pagamentos_pedido (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    forma_pagamento_id UUID NOT NULL REFERENCES public.formas_pagamento(id) ON DELETE RESTRICT,
    valor NUMERIC(12,2) NOT NULL,
    parcelas INTEGER DEFAULT 1,
    valor_taxa NUMERIC(12,2) DEFAULT 0.00,
    valor_liquido NUMERIC(12,2) NOT NULL,
    data_pagamento TIMESTAMPTZ DEFAULT NOW(),
    eh_pagamento_fiado BOOLEAN DEFAULT FALSE,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: transacoes_financeiras (Fluxo de Caixa, Despesas Fixas & Recorrências)
CREATE TABLE IF NOT EXISTS public.transacoes_financeiras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
    categoria VARCHAR(50) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    valor NUMERIC(12,2) NOT NULL,
    data_vencimento DATE NOT NULL,
    data_pagamento TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
    eh_recorrente BOOLEAN DEFAULT FALSE,
    frequencia_recorrencia VARCHAR(20) CHECK (frequencia_recorrencia IN ('semanal', 'mensal', 'trimestral', 'anual')),
    dia_vencimento_recorrencia INTEGER,
    pedido_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL,
    fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: caixas (Abertura, Fechamento e Conferência de Caixa)
CREATE TABLE IF NOT EXISTS public.caixas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES public.usuarios_loja(id) ON DELETE RESTRICT,
    data_abertura TIMESTAMPTZ DEFAULT NOW(),
    data_fechamento TIMESTAMPTZ,
    saldo_inicial NUMERIC(12,2) DEFAULT 0.00,
    saldo_final_declarado NUMERIC(12,2),
    saldo_final_calculado NUMERIC(12,2),
    diferenca_quebra NUMERIC(12,2),
    status VARCHAR(10) NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'FECHADO')),
    observacoes TEXT
);

-- ==============================================================================
-- 3. FUNÇÕES AUXILIARES DE SEGURANÇA (SECURITY DEFINER)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.usuario_pertence_loja(p_loja_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.usuarios_loja
        WHERE usuario_auth_id = auth.uid()
          AND loja_id = p_loja_id
          AND ativo = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.eh_gerente_ou_admin(p_loja_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.usuarios_loja
        WHERE usuario_auth_id = auth.uid()
          AND loja_id = p_loja_id
          AND perfil IN ('admin', 'gerente')
          AND ativo = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.eh_admin_loja(p_loja_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.usuarios_loja
        WHERE usuario_auth_id = auth.uid()
          AND loja_id = p_loja_id
          AND perfil = 'admin'
          AND ativo = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 4. TRIGGERS E AUTOMAÇÕES
-- ==============================================================================

-- A) Baixa e Reajuste Automático de Estoque
CREATE OR REPLACE FUNCTION public.fn_atualizar_estoque_pedido()
RETURNS TRIGGER AS $$
BEGIN
    -- Se o item possui variação
    IF NEW.variacao_id IS NOT NULL THEN
        UPDATE public.variacoes_produto
        SET quantidade_estoque = quantidade_estoque - NEW.quantidade
        WHERE id = NEW.variacao_id;
    ELSE
        -- Produto simples sem variação
        UPDATE public.produtos
        SET quantidade_estoque = quantidade_estoque - NEW.quantidade
        WHERE id = NEW.produto_id;
    END IF;

    -- Se o produto é um Combo/Kit, decrementa os itens filhos
    IF EXISTS (SELECT 1 FROM public.produtos WHERE id = NEW.produto_id AND eh_combo = TRUE) THEN
        UPDATE public.produtos p
        SET quantidade_estoque = p.quantidade_estoque - (ic.quantidade * NEW.quantidade)
        FROM public.itens_combo ic
        WHERE ic.produto_combo_id = NEW.produto_id
          AND ic.produto_filho_id = p.id
          AND ic.variacao_filho_id IS NULL;

        UPDATE public.variacoes_produto vp
        SET quantidade_estoque = vp.quantidade_estoque - (ic.quantidade * NEW.quantidade)
        FROM public.itens_combo ic
        WHERE ic.produto_combo_id = NEW.produto_id
          AND ic.variacao_filho_id = vp.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_atualizar_estoque_ao_inserir_item ON public.itens_pedido;
CREATE TRIGGER trg_atualizar_estoque_ao_inserir_item
AFTER INSERT ON public.itens_pedido
FOR EACH ROW
EXECUTE FUNCTION public.fn_atualizar_estoque_pedido();

-- B) Atualização de Saldo Devedor do Cliente (Fiado)
CREATE OR REPLACE FUNCTION public.fn_atualizar_saldo_fiado_cliente()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.cliente_id IS NOT NULL AND NEW.saldo_devedor > 0 THEN
        UPDATE public.clientes
        SET saldo_devedor_fiado = saldo_devedor_fiado + (NEW.saldo_devedor - COALESCE(OLD.saldo_devedor, 0))
        WHERE id = NEW.cliente_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_atualizar_saldo_fiado ON public.pedidos;
CREATE TRIGGER trg_atualizar_saldo_fiado
AFTER INSERT OR UPDATE OF saldo_devedor ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.fn_atualizar_saldo_fiado_cliente();

-- C) Geração Automática de Lançamento Financeiro por Pagamento
CREATE OR REPLACE FUNCTION public.fn_gerar_financeiro_pagamento()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.transacoes_financeiras (
        loja_id,
        tipo,
        categoria,
        descricao,
        valor,
        data_vencimento,
        data_pagamento,
        status,
        pedido_id
    ) VALUES (
        NEW.loja_id,
        'ENTRADA',
        'Venda',
        'Recebimento Pedido #' || NEW.pedido_id,
        NEW.valor_liquido,
        CURRENT_DATE,
        NEW.data_pagamento,
        'pago',
        NEW.pedido_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gerar_financeiro_pagamento ON public.pagamentos_pedido;
CREATE TRIGGER trg_gerar_financeiro_pagamento
AFTER INSERT ON public.pagamentos_pedido
FOR EACH ROW
EXECUTE FUNCTION public.fn_gerar_financeiro_pagamento();

-- ==============================================================================
-- 5. ÍNDICES DE ALTA PERFORMANCE (B-TREE)
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_produtos_loja_ativo ON public.produtos(loja_id, ativo);
CREATE INDEX IF NOT EXISTS idx_produtos_codigo_barras ON public.produtos(loja_id, codigo_barras);
CREATE INDEX IF NOT EXISTS idx_variacoes_produto_produto_id ON public.variacoes_produto(produto_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_loja_status ON public.pedidos(loja_id, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_loja_data ON public.pedidos(loja_id, data_venda);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id ON public.pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido_id ON public.itens_pedido(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pedido_pedido_id ON public.pagamentos_pedido(pedido_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_loja_data ON public.transacoes_financeiras(loja_id, data_vencimento);
CREATE INDEX IF NOT EXISTS idx_transacoes_loja_status ON public.transacoes_financeiras(loja_id, status);
CREATE INDEX IF NOT EXISTS idx_clientes_loja_nome ON public.clientes(loja_id, nome);
CREATE INDEX IF NOT EXISTS idx_caixas_loja_status ON public.caixas(loja_id, status);

-- ==============================================================================
-- 6. ATIVAÇÃO DE ROW LEVEL SECURITY (RLS) & POLÍTICAS
-- ==============================================================================

ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_loja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variacoes_produto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_combo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formas_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formas_entrega ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacoes_financeiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura Pública para Catálogo Online
CREATE POLICY "catalogo_lojas_publico" ON public.lojas FOR SELECT USING (true);
CREATE POLICY "catalogo_produtos_publico" ON public.produtos FOR SELECT USING (exibir_catalogo = TRUE AND ativo = TRUE);
CREATE POLICY "catalogo_variacoes_publico" ON public.variacoes_produto FOR SELECT USING (ativo = TRUE);
CREATE POLICY "catalogo_categorias_publico" ON public.categorias FOR SELECT USING (ativo = TRUE);
CREATE POLICY "catalogo_formas_entrega_publico" ON public.formas_entrega FOR SELECT USING (ativo = TRUE);
CREATE POLICY "catalogo_formas_pagamento_publico" ON public.formas_pagamento FOR SELECT USING (exibir_catalogo = TRUE AND ativo = TRUE);
CREATE POLICY "catalogo_criar_pedidos_publico" ON public.pedidos FOR INSERT WITH CHECK (origem = 'catalogo_online' AND status = 'pendente');
CREATE POLICY "catalogo_criar_itens_publico" ON public.itens_pedido FOR INSERT WITH CHECK (true);
CREATE POLICY "catalogo_clientes_publico" ON public.clientes FOR SELECT USING (true);

-- Políticas Multi-Tenant para Usuários da Loja
CREATE POLICY "lojas_usuario_select" ON public.lojas FOR ALL USING (usuario_pertence_loja(id));
CREATE POLICY "usuarios_loja_all" ON public.usuarios_loja FOR ALL USING (usuario_pertence_loja(loja_id));
CREATE POLICY "categorias_loja_all" ON public.categorias FOR ALL USING (usuario_pertence_loja(loja_id));
CREATE POLICY "fornecedores_loja_all" ON public.fornecedores FOR ALL USING (usuario_pertence_loja(loja_id));
CREATE POLICY "produtos_loja_all" ON public.produtos FOR ALL USING (usuario_pertence_loja(loja_id));
CREATE POLICY "variacoes_loja_all" ON public.variacoes_produto FOR ALL USING (usuario_pertence_loja(loja_id));
CREATE POLICY "itens_combo_loja_all" ON public.itens_combo FOR ALL USING (usuario_pertence_loja(loja_id));
CREATE POLICY "clientes_loja_all" ON public.clientes FOR ALL USING (usuario_pertence_loja(loja_id));
CREATE POLICY "formas_pagamento_loja_all" ON public.formas_pagamento FOR ALL USING (usuario_pertence_loja(loja_id));
CREATE POLICY "formas_entrega_loja_all" ON public.formas_entrega FOR ALL USING (usuario_pertence_loja(loja_id));
CREATE POLICY "pedidos_loja_all" ON public.pedidos FOR ALL USING (usuario_pertence_loja(loja_id));
CREATE POLICY "itens_pedido_loja_all" ON public.itens_pedido FOR ALL USING (usuario_pertence_loja(loja_id));
CREATE POLICY "pagamentos_pedido_loja_all" ON public.pagamentos_pedido FOR ALL USING (usuario_pertence_loja(loja_id));
CREATE POLICY "transacoes_loja_all" ON public.transacoes_financeiras FOR ALL USING (usuario_pertence_loja(loja_id));
CREATE POLICY "caixas_loja_all" ON public.caixas FOR ALL USING (usuario_pertence_loja(loja_id));

-- ==============================================================================
-- 7. HABILITAÇÃO DO SUPABASE REALTIME
-- ==============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.itens_pedido;
ALTER PUBLICATION supabase_realtime ADD TABLE public.produtos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.variacoes_produto;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transacoes_financeiras;
ALTER PUBLICATION supabase_realtime ADD TABLE public.caixas;

-- 8. OTIMIZAÇÃO DE ESTATÍSTICAS
ANALYZE;
