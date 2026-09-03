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
    configuracoes_extras JSONB DEFAULT '{}'::jsonb,
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
    status VARCHAR(50) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'em_separacao', 'em_producao', 'em_expedicao', 'saiu_para_entrega', 'pronto_para_retirar', 'entregue', 'concluido', 'cancelado')),
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
CREATE POLICY "catalogo_clientes_insert" ON public.clientes FOR INSERT WITH CHECK (true);
CREATE POLICY "catalogo_clientes_update" ON public.clientes FOR UPDATE USING (true) WITH CHECK (true);

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

-- 8. FUNÇÃO SEGURA PARA SALVAR CLIENTES PELO CATÁLOGO ONLINE
CREATE OR REPLACE FUNCTION public.salvar_cliente_catalogo(
    p_loja_id UUID,
    p_nome TEXT,
    p_telefone TEXT,
    p_email TEXT DEFAULT NULL,
    p_cpf_cnpj TEXT DEFAULT NULL,
    p_aniversario DATE DEFAULT NULL,
    p_endereco TEXT DEFAULT NULL,
    p_cliente_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cliente_id UUID;
    v_cliente JSONB;
BEGIN
    IF p_cliente_id IS NOT NULL THEN
        UPDATE public.clientes
        SET
            nome = TRIM(p_nome),
            telefone = TRIM(p_telefone),
            whatsapp = TRIM(p_telefone),
            email = NULLIF(TRIM(p_email), ''),
            numero_documento = NULLIF(TRIM(p_cpf_cnpj), ''),
            data_aniversario = p_aniversario,
            endereco_principal = NULLIF(TRIM(p_endereco), '')
        WHERE id = p_cliente_id AND loja_id = p_loja_id
        RETURNING id INTO v_cliente_id;
    END IF;

    IF v_cliente_id IS NULL THEN
        INSERT INTO public.clientes (
            loja_id,
            nome,
            telefone,
            whatsapp,
            email,
            numero_documento,
            data_aniversario,
            endereco_principal,
            tabela_preco_padrao
        )
        VALUES (
            p_loja_id,
            TRIM(p_nome),
            TRIM(p_telefone),
            TRIM(p_telefone),
            NULLIF(TRIM(p_email), ''),
            NULLIF(TRIM(p_cpf_cnpj), ''),
            p_aniversario,
            NULLIF(TRIM(p_endereco), ''),
            'varejo'
        )
        RETURNING id INTO v_cliente_id;
    END IF;

    SELECT to_jsonb(c) INTO v_cliente FROM public.clientes c WHERE c.id = v_cliente_id;

    RETURN jsonb_build_object('sucesso', true, 'cliente_id', v_cliente_id, 'cliente', v_cliente);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_cliente_catalogo TO anon, authenticated, service_role;

-- 9. OTIMIZAÇÃO DE ESTATÍSTICAS
ANALYZE;

-- ==============================================================================
-- 9. INTEGRAÇÃO MERCADO PAGO VIA SUPABASE RPC (SERVER-SIDE / SEM CORS)
-- Permite gerar Pix e Links de Pagamento direto pelo servidor Supabase,
-- contornando bloqueios de CORS do navegador em clientes do catálogo online.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Função: Criar Pix Dinâmico no Mercado Pago
CREATE OR REPLACE FUNCTION public.criar_pix_mercado_pago(
    p_loja_id UUID,
    p_valor NUMERIC,
    p_descricao TEXT,
    p_pedido_numero BIGINT,
    p_email_cliente TEXT DEFAULT 'cliente@hubi.app',
    p_nome_cliente TEXT DEFAULT 'Cliente'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_access_token TEXT;
    v_loja_nome TEXT;
    v_response extensions.http_response;
    v_payload JSONB;
    v_body JSONB;
    v_headers extensions.http_header[];
BEGIN
    SELECT 
        nome_fantasia,
        configuracoes_extras->'pagamentos_digitais'->'mercado_pago'->>'access_token'
    INTO v_loja_nome, v_access_token
    FROM public.lojas
    WHERE id = p_loja_id;

    IF v_access_token IS NULL OR trim(v_access_token) = '' THEN
        RETURN jsonb_build_object(
            'sucesso', false,
            'mensagem', 'Access Token do Mercado Pago não configurado na loja.'
        );
    END IF;

    v_payload := jsonb_build_object(
        'transaction_amount', ROUND(p_valor, 2),
        'description', COALESCE(p_descricao, 'Pedido #' || p_pedido_numero || ' - ' || v_loja_nome),
        'payment_method_id', 'pix',
        'payer', jsonb_build_object(
            'email', COALESCE(NULLIF(trim(p_email_cliente), ''), 'cliente@hubi.app'),
            'first_name', COALESCE(NULLIF(trim(p_nome_cliente), ''), 'Cliente')
        ),
        'external_reference', 'PEDIDO_' || p_pedido_numero
    );

    v_headers := ARRAY[
        extensions.http_header('Authorization', 'Bearer ' || trim(v_access_token)),
        extensions.http_header('Content-Type', 'application/json'),
        extensions.http_header('X-Idempotency-Key', 'hubi_' || p_loja_id || '_' || p_pedido_numero || '_' || EXTRACT(EPOCH FROM clock_timestamp())::BIGINT)
    ];

    SELECT * INTO v_response FROM extensions.http((
        'POST',
        'https://api.mercadopago.com/v1/payments',
        v_headers,
        'application/json',
        v_payload::TEXT
    )::extensions.http_request);

    v_body := v_response.content::JSONB;

    IF v_response.status IN (200, 201) AND (v_body->>'id') IS NOT NULL THEN
        RETURN jsonb_build_object(
            'sucesso', true,
            'transacaoId', v_body->>'id',
            'qrCode', v_body->'point_of_interaction'->'transaction_data'->>'qr_code',
            'qrCodeBase64', v_body->'point_of_interaction'->'transaction_data'->>'qr_code_base64',
            'ticketUrl', v_body->'point_of_interaction'->'transaction_data'->>'ticket_url',
            'valorTotal', p_valor,
            'expiraEm', v_body->>'date_of_expiration',
            'mensagem', 'QR Code Pix gerado com sucesso!'
        );
    ELSE
        RETURN jsonb_build_object(
            'sucesso', false,
            'mensagem', COALESCE(v_body->>'message', 'Falha no Mercado Pago (HTTP ' || v_response.status || ')')
        );
    END IF;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'sucesso', false,
        'mensagem', 'Erro no servidor: ' || SQLERRM
    );
END;
$$;

-- Função: Criar Link / Preference de Pagamento no Mercado Pago
CREATE OR REPLACE FUNCTION public.criar_link_mercado_pago(
    p_loja_id UUID,
    p_itens JSONB,
    p_pedido_numero BIGINT,
    p_cliente_email TEXT DEFAULT 'cliente@hubi.app',
    p_back_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_access_token TEXT;
    v_ambiente TEXT;
    v_response extensions.http_response;
    v_payload JSONB;
    v_body JSONB;
    v_headers extensions.http_header[];
BEGIN
    SELECT 
        configuracoes_extras->'pagamentos_digitais'->'mercado_pago'->>'access_token',
        COALESCE(configuracoes_extras->'pagamentos_digitais'->'mercado_pago'->>'ambiente', 'sandbox')
    INTO v_access_token, v_ambiente
    FROM public.lojas
    WHERE id = p_loja_id;

    IF v_access_token IS NULL OR trim(v_access_token) = '' THEN
        RETURN jsonb_build_object(
            'sucesso', false,
            'mensagem', 'Access Token do Mercado Pago não configurado.'
        );
    END IF;

    v_payload := jsonb_build_object(
        'items', p_itens,
        'external_reference', 'PEDIDO_' || p_pedido_numero
    );

    IF p_back_url IS NOT NULL AND trim(p_back_url) != '' THEN
        v_payload := v_payload || jsonb_build_object(
            'back_urls', jsonb_build_object(
                'success', p_back_url || '?status=aprovado&pedido=' || p_pedido_numero,
                'failure', p_back_url || '?status=falha&pedido=' || p_pedido_numero,
                'pending', p_back_url || '?status=pendente&pedido=' || p_pedido_numero
            ),
            'auto_return', 'approved'
        );
    END IF;

    v_headers := ARRAY[
        extensions.http_header('Authorization', 'Bearer ' || trim(v_access_token)),
        extensions.http_header('Content-Type', 'application/json')
    ];

    SELECT * INTO v_response FROM extensions.http((
        'POST',
        'https://api.mercadopago.com/checkout/preferences',
        v_headers,
        'application/json',
        v_payload::TEXT
    )::extensions.http_request);

    v_body := v_response.content::JSONB;

    IF v_response.status IN (200, 201) AND (v_body->>'init_point') IS NOT NULL THEN
        RETURN jsonb_build_object(
            'sucesso', true,
            'preferenceId', v_body->>'id',
            'linkPagamento', v_body->>'init_point',
            'mensagem', 'Link de pagamento gerado com sucesso!'
        );
    ELSE
        RETURN jsonb_build_object(
            'sucesso', false,
            'mensagem', COALESCE(v_body->>'message', 'Falha ao criar link de pagamento no Mercado Pago.')
        );
    END IF;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'sucesso', false,
        'mensagem', 'Erro no servidor: ' || SQLERRM
    );
END;
$$;

-- Permissões de Execução Públicas
GRANT EXECUTE ON FUNCTION public.criar_pix_mercado_pago TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_link_mercado_pago TO anon, authenticated, service_role;

-- Adiciona coluna status_pagamento se não existir
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS status_pagamento VARCHAR(30) DEFAULT 'aguardando_pagamento';

-- ==============================================================================
-- 10. FUNÇÃO SEGURA: CONFIRMAR PAGAMENTO MERCADO PAGO (CHECKOUT & PIX)
-- ==============================================================================
-- Remove versões anteriores com assinaturas diferentes para evitar ambiguidade (Erro 42725)
DROP FUNCTION IF EXISTS public.confirmar_pagamento_mercado_pago(UUID, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.confirmar_pagamento_mercado_pago(UUID, BIGINT, TEXT, TEXT, TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.confirmar_pagamento_mercado_pago(
    p_loja_id UUID,
    p_pedido_numero BIGINT,
    p_payment_id TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'approved',
    p_payment_type TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT NULL,
    p_parcelas INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_access_token TEXT;
    v_pedido RECORD;
    v_forma_pagamento_id UUID;
    v_status_mp TEXT := NULL;
    v_valor_recebido NUMERIC := NULL;
    v_payment_type TEXT := p_payment_type;
    v_payment_method TEXT := p_payment_method;
    v_parcelas INTEGER := COALESCE(p_parcelas, 1);
    v_tipo_db VARCHAR(30) := 'cartao_credito';
    v_nome_padrao VARCHAR(100) := 'Cartão de Crédito (Mercado Pago)';
    v_response extensions.http_response;
    v_headers extensions.http_header[];
    v_body JSONB;
BEGIN
    -- 1. Localizar o pedido da loja
    SELECT * INTO v_pedido
    FROM public.pedidos
    WHERE loja_id = p_loja_id AND numero_pedido = p_pedido_numero;

    IF v_pedido.id IS NULL THEN
        RETURN jsonb_build_object(
            'sucesso', false,
            'mensagem', 'Pedido #' || p_pedido_numero || ' não encontrado nesta loja.'
        );
    END IF;

    -- 2. Buscar access_token do Mercado Pago da loja
    SELECT configuracoes_extras->'pagamentos_digitais'->'mercado_pago'->>'access_token'
    INTO v_access_token
    FROM public.lojas
    WHERE id = p_loja_id;

    -- 3. Se temos p_payment_id e access_token, consulta status real e detalhes do meio de pagamento na API do Mercado Pago
    IF p_payment_id IS NOT NULL AND trim(p_payment_id) != '' AND v_access_token IS NOT NULL AND trim(v_access_token) != '' THEN
        BEGIN
            v_headers := ARRAY[
                extensions.http_header('Authorization', 'Bearer ' || trim(v_access_token)),
                extensions.http_header('Content-Type', 'application/json')
            ];

            SELECT * INTO v_response FROM extensions.http((
                'GET',
                'https://api.mercadopago.com/v1/payments/' || trim(p_payment_id),
                v_headers,
                'application/json',
                NULL
            )::extensions.http_request);

            IF v_response.status = 200 THEN
                v_body := v_response.content::JSONB;
                v_status_mp := v_body->>'status';
                IF (v_body->>'transaction_amount') IS NOT NULL THEN
                    v_valor_recebido := (v_body->>'transaction_amount')::NUMERIC;
                END IF;
                IF (v_body->>'payment_type_id') IS NOT NULL AND trim(v_body->>'payment_type_id') != '' THEN
                    v_payment_type := v_body->>'payment_type_id';
                END IF;
                IF (v_body->>'payment_method_id') IS NOT NULL AND trim(v_body->>'payment_method_id') != '' THEN
                    v_payment_method := v_body->>'payment_method_id';
                END IF;
                IF (v_body->>'installments') IS NOT NULL THEN
                    v_parcelas := (v_body->>'installments')::INTEGER;
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Caso ocorra falha ou timeout na extensão http, mantém nulo para usar p_status
            v_status_mp := NULL;
        END;
    END IF;

    -- Fallback se verificação via HTTP falhou ou não foi enviada
    IF v_status_mp IS NULL THEN
        IF p_status IN ('approved', 'aprovado') THEN
            v_status_mp := 'approved';
        END IF;
    END IF;

    -- Se não estiver aprovado, retorna status atual sem alterar o pedido
    IF v_status_mp IS NULL OR v_status_mp != 'approved' THEN
        RETURN jsonb_build_object(
            'sucesso', false,
            'status_mp', COALESCE(v_status_mp, 'pendente'),
            'mensagem', 'Pagamento ainda não foi aprovado pelo Mercado Pago (Status: ' || COALESCE(v_status_mp, 'pendente') || ').'
        );
    END IF;

    -- 4. Definir valor recebido
    IF v_valor_recebido IS NULL OR v_valor_recebido <= 0 THEN
        v_valor_recebido := v_pedido.valor_total;
    END IF;

    -- 5. Classificar o meio de pagamento real retornado pelo Mercado Pago
    IF lower(COALESCE(v_payment_type, '')) IN ('credit_card', 'cartao_credito') THEN
        v_tipo_db := 'cartao_credito';
        IF v_payment_method IS NOT NULL AND trim(v_payment_method) != '' THEN
            v_nome_padrao := 'Cartão de Crédito ' || upper(trim(v_payment_method)) || ' (Mercado Pago)';
        ELSE
            v_nome_padrao := 'Cartão de Crédito (Mercado Pago)';
        END IF;
    ELSIF lower(COALESCE(v_payment_type, '')) IN ('debit_card', 'cartao_debito') THEN
        v_tipo_db := 'cartao_debito';
        IF v_payment_method IS NOT NULL AND trim(v_payment_method) != '' THEN
            v_nome_padrao := 'Cartão de Débito ' || upper(trim(v_payment_method)) || ' (Mercado Pago)';
        ELSE
            v_nome_padrao := 'Cartão de Débito (Mercado Pago)';
        END IF;
    ELSIF lower(COALESCE(v_payment_type, '')) IN ('bank_transfer', 'pix') OR lower(COALESCE(v_payment_method, '')) = 'pix' THEN
        v_tipo_db := 'pix';
        v_nome_padrao := 'Pix (Mercado Pago)';
    ELSIF lower(COALESCE(v_payment_type, '')) IN ('ticket', 'boleto') THEN
        v_tipo_db := 'outro';
        v_nome_padrao := 'Boleto (Mercado Pago)';
    ELSE
        v_tipo_db := 'cartao_credito';
        v_nome_padrao := 'Cartão de Crédito (Mercado Pago)';
    END IF;

    -- 6. Localizar ou criar forma de pagamento correspondente ao tipo real
    SELECT id INTO v_forma_pagamento_id 
    FROM public.formas_pagamento 
    WHERE loja_id = p_loja_id 
      AND ativo = TRUE 
      AND tipo = v_tipo_db
    ORDER BY 
      CASE 
        WHEN lower(nome) = lower(v_nome_padrao) THEN 1
        WHEN lower(nome) LIKE '%mercado pago%' THEN 2
        ELSE 3
      END
    LIMIT 1;

    IF v_forma_pagamento_id IS NULL THEN
        INSERT INTO public.formas_pagamento (loja_id, nome, tipo, taxa_percentual, ativo, exibir_catalogo)
        VALUES (p_loja_id, v_nome_padrao, v_tipo_db, 0.99, TRUE, TRUE)
        RETURNING id INTO v_forma_pagamento_id;
    END IF;

    -- 7. Substituir pagamentos pendentes/incorretos e registrar o pagamento definitivo
    DELETE FROM public.pagamentos_pedido WHERE pedido_id = v_pedido.id;

    INSERT INTO public.pagamentos_pedido (
        loja_id,
        pedido_id,
        forma_pagamento_id,
        valor,
        parcelas,
        valor_taxa,
        valor_liquido,
        data_pagamento,
        eh_pagamento_fiado
    ) VALUES (
        p_loja_id,
        v_pedido.id,
        v_forma_pagamento_id,
        v_valor_recebido,
        COALESCE(v_parcelas, 1),
        0.00,
        v_valor_recebido,
        NOW(),
        FALSE
    );

    -- 8. Atualizar status e valores do pedido (saldo_devedor = 0 para pedido pago)
    UPDATE public.pedidos
    SET 
        status_pagamento = 'pago',
        status = CASE WHEN status = 'pendente' THEN 'confirmado' ELSE status END,
        valor_pago = v_valor_recebido,
        saldo_devedor = 0,
        atualizado_em = NOW()
    WHERE id = v_pedido.id;

    RETURN jsonb_build_object(
        'sucesso', true,
        'pedido_id', v_pedido.id,
        'pedido_numero', p_pedido_numero,
        'status_pagamento', 'pago',
        'valor_pago', v_valor_recebido,
        'mensagem', 'Pagamento aprovado e registrado com sucesso!'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'sucesso', false,
        'mensagem', 'Erro ao confirmar pagamento: ' || SQLERRM
    );
END;
$$;

-- Permissão de Execução Pública
GRANT EXECUTE ON FUNCTION public.confirmar_pagamento_mercado_pago(UUID, BIGINT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO anon, authenticated, service_role;

