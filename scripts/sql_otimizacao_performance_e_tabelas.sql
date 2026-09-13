-- ==============================================================================
-- SISTEMA HUBI - SCRIPT CONSOLIDADO DE PERFORMANCE E ELIMINAÇÃO DE METADADOS
-- Data: 2026
-- 
-- Este script executa de forma 100% segura e idempotente (IF NOT EXISTS):
-- 1. Criação das tabelas relacionais oficiais para eliminar dados soltos em JSON
-- 2. Adição de colunas nativas tipadas na tabela 'pedidos'
-- 3. Criação de índices de alta performance (Chaves Estrangeiras e Filtros Compostos)
-- 4. Políticas de Row Level Security (RLS)
-- 5. Backfill automático de dados existentes em 'metadados' para as novas estruturas
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- PARTE 1: CRIAÇÃO DAS TABELAS RELACIONAIS OFICIAIS
-- ==============================================================================

-- 1.1 Tabela de Cupons de Desconto da Loja
CREATE TABLE IF NOT EXISTS public.cupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    codigo VARCHAR(50) NOT NULL,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('desconto_fixo', 'desconto_percentual', 'frete_gratis')),
    valor NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    valor_minimo_carrinho NUMERIC(12,2) DEFAULT 0.00,
    tem_valor_minimo BOOLEAN DEFAULT FALSE,
    ativo BOOLEAN DEFAULT TRUE,
    usos_count INTEGER DEFAULT 0,
    limite_usos INTEGER,
    data_inicio TIMESTAMPTZ,
    data_fim TIMESTAMPTZ,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT cupons_loja_codigo_unique UNIQUE (loja_id, codigo)
);

-- 1.2 Tabela de Unidades de Medida do ERP
CREATE TABLE IF NOT EXISTS public.unidades_medida (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    sigla VARCHAR(10) NOT NULL,
    nome VARCHAR(50) NOT NULL,
    permite_fracionado BOOLEAN DEFAULT FALSE,
    padrao BOOLEAN DEFAULT FALSE,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unidades_medida_loja_sigla_unique UNIQUE (loja_id, sigla)
);

-- 1.3 Tabela de Movimentações de Saldo / Crédito de Clientes
CREATE TABLE IF NOT EXISTS public.movimentacoes_saldo_cliente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL, -- 'credito', 'debito', 'ajuste', 'recarga'
    valor NUMERIC(12,2) NOT NULL,
    saldo_anterior NUMERIC(12,2) DEFAULT 0.00,
    saldo_posterior NUMERIC(12,2) DEFAULT 0.00,
    descricao TEXT,
    usuario_id UUID REFERENCES public.usuarios_loja(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 1.4 Tabela de Auditoria e Histórico de Pedidos (Substitui metadados.historico_status e historico_edicoes)
CREATE TABLE IF NOT EXISTS public.historico_pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES public.usuarios_loja(id) ON DELETE SET NULL,
    tipo_evento VARCHAR(50) NOT NULL, -- 'status_alterado', 'pedido_editado', 'criacao', 'pagamento_recebido', 'cancelado'
    status_anterior VARCHAR(50),
    status_novo VARCHAR(50),
    descricao TEXT,
    detalhes JSONB DEFAULT '{}'::jsonb,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 1.5 Tabela de Pagamentos Previstos (Substitui metadados.pagamentos_previstos em pedidos pendentes)
CREATE TABLE IF NOT EXISTS public.pedidos_pagamentos_previstos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    forma_pagamento_id UUID REFERENCES public.formas_pagamento(id) ON DELETE SET NULL,
    forma_tipo VARCHAR(30) NOT NULL,
    forma_nome VARCHAR(100) NOT NULL,
    valor NUMERIC(12,2) NOT NULL,
    valor_entregue NUMERIC(12,2),
    parcelas INTEGER DEFAULT 1,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- PARTE 2: ADIÇÃO DE COLUNAS NATIVAS EM 'pedidos'
-- ==============================================================================

ALTER TABLE public.pedidos 
  ADD COLUMN IF NOT EXISTS data_vencimento_fiado DATE,
  ADD COLUMN IF NOT EXISTS desconto_percentual NUMERIC(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS forma_entrega_id UUID REFERENCES public.formas_entrega(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS atualizado_por UUID REFERENCES public.usuarios_loja(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_nome_avulso VARCHAR(150),
  ADD COLUMN IF NOT EXISTS cliente_telefone_avulso VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cliente_documento_avulso VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cliente_email_avulso VARCHAR(100),
  ADD COLUMN IF NOT EXISTS troco_para NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cupom_id UUID REFERENCES public.cupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cupom_codigo VARCHAR(50),
  ADD COLUMN IF NOT EXISTS valor_desconto_cupom NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS forma_pagamento_catalogo VARCHAR(50),
  ADD COLUMN IF NOT EXISTS status_pagamento VARCHAR(30) DEFAULT 'aguardando_pagamento';

-- ==============================================================================
-- PARTE 3: ÍNDICES DE ALTA PERFORMANCE (B-TREE)
-- ==============================================================================

-- A) Índices em Chaves Estrangeiras (Evitam Full Table Scan em JOINs e locks em updates)
CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor ON public.pedidos(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_forma_entrega ON public.pedidos(forma_entrega_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_atualizado_por ON public.pedidos(atualizado_por);
CREATE INDEX IF NOT EXISTS idx_pedidos_cupom_id ON public.pedidos(cupom_id);

CREATE INDEX IF NOT EXISTS idx_itens_pedido_produto ON public.itens_pedido(produto_id);
CREATE INDEX IF NOT EXISTS idx_itens_pedido_loja ON public.itens_pedido(loja_id);

CREATE INDEX IF NOT EXISTS idx_pagamentos_forma ON public.pagamentos_pedido(forma_pagamento_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pedido_loja ON public.pagamentos_pedido(loja_id);

CREATE INDEX IF NOT EXISTS idx_transacoes_pedido ON public.transacoes_financeiras(pedido_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_fornecedor ON public.transacoes_financeiras(fornecedor_id);

CREATE INDEX IF NOT EXISTS idx_movimentacoes_loja ON public.movimentacoes_caixa(loja_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_criado_por ON public.movimentacoes_caixa(criado_por_usuario_id);

CREATE INDEX IF NOT EXISTS idx_sessoes_aberto_por ON public.sessoes_caixa(aberto_por_usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_fechado_por ON public.sessoes_caixa(fechado_por_usuario_id);

CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON public.produtos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_produtos_fornecedor ON public.produtos(fornecedor_id);

CREATE INDEX IF NOT EXISTS idx_itens_combo_pai ON public.itens_combo(produto_combo_id);
CREATE INDEX IF NOT EXISTS idx_itens_combo_filho ON public.itens_combo(produto_filho_id);

-- B) Índices para as Novas Tabelas Relacionais
CREATE INDEX IF NOT EXISTS idx_cupons_loja ON public.cupons(loja_id, ativo);
CREATE INDEX IF NOT EXISTS idx_unidades_loja ON public.unidades_medida(loja_id);
CREATE INDEX IF NOT EXISTS idx_mov_saldo_cliente ON public.movimentacoes_saldo_cliente(cliente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_mov_saldo_loja ON public.movimentacoes_saldo_cliente(loja_id);
CREATE INDEX IF NOT EXISTS idx_historico_pedidos_pedido ON public.historico_pedidos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_historico_pedidos_loja ON public.historico_pedidos(loja_id);
CREATE INDEX IF NOT EXISTS idx_historico_pedidos_criado_em ON public.historico_pedidos(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pagamentos_previstos_pedido ON public.pedidos_pagamentos_previstos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_previstos_loja ON public.pedidos_pagamentos_previstos(loja_id);

-- C) Índices Compostos de Consulta e Ordenação Crítica
CREATE INDEX IF NOT EXISTS idx_pedidos_loja_criado_em ON public.pedidos(loja_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_loja_vendedor_criado ON public.pedidos(loja_id, vendedor_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_loja_status_criado ON public.pedidos(loja_id, status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_loja_status_pagamento ON public.pedidos(loja_id, status_pagamento);
CREATE INDEX IF NOT EXISTS idx_pedidos_vencimento_fiado ON public.pedidos(loja_id, data_vencimento_fiado) WHERE data_vencimento_fiado IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pagamentos_pedido_fiado ON public.pagamentos_pedido(pedido_id, eh_pagamento_fiado);

CREATE INDEX IF NOT EXISTS idx_clientes_loja_whatsapp ON public.clientes(loja_id, whatsapp);
CREATE INDEX IF NOT EXISTS idx_clientes_loja_telefone ON public.clientes(loja_id, telefone);
CREATE INDEX IF NOT EXISTS idx_clientes_loja_doc ON public.clientes(loja_id, numero_documento);

CREATE INDEX IF NOT EXISTS idx_produtos_loja_ativo_nome ON public.produtos(loja_id, ativo, nome);
CREATE INDEX IF NOT EXISTS idx_produtos_loja_cod_interno ON public.produtos(loja_id, codigo_interno);

CREATE INDEX IF NOT EXISTS idx_sessoes_loja_usuario_status ON public.sessoes_caixa(loja_id, aberto_por_usuario_id, status);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_loja_criado ON public.movimentacoes_caixa(loja_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_transacoes_loja_pagamento ON public.transacoes_financeiras(loja_id, data_pagamento DESC);

-- ==============================================================================
-- PARTE 4: POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- ==============================================================================

ALTER TABLE public.cupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades_medida ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_saldo_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_pagamentos_previstos ENABLE ROW LEVEL SECURITY;

-- Políticas de Cupons (Público no Catálogo Online para validação, e gestão pela loja)
DROP POLICY IF EXISTS "cupons_catalogo_publico" ON public.cupons;
CREATE POLICY "cupons_catalogo_publico" ON public.cupons FOR SELECT USING (ativo = true);

DROP POLICY IF EXISTS "cupons_loja_all" ON public.cupons;
CREATE POLICY "cupons_loja_all" ON public.cupons FOR ALL USING (true) WITH CHECK (true);

-- Políticas de Unidades de Medida
DROP POLICY IF EXISTS "unidades_medida_all" ON public.unidades_medida;
CREATE POLICY "unidades_medida_all" ON public.unidades_medida FOR ALL USING (true) WITH CHECK (true);

-- Políticas de Movimentações de Saldo
DROP POLICY IF EXISTS "movimentacoes_saldo_cliente_all" ON public.movimentacoes_saldo_cliente;
CREATE POLICY "movimentacoes_saldo_cliente_all" ON public.movimentacoes_saldo_cliente FOR ALL USING (true) WITH CHECK (true);

-- Políticas de Histórico de Pedidos
DROP POLICY IF EXISTS "historico_pedidos_all" ON public.historico_pedidos;
CREATE POLICY "historico_pedidos_all" ON public.historico_pedidos FOR ALL USING (true) WITH CHECK (true);

-- Políticas de Pagamentos Previstos
DROP POLICY IF EXISTS "pedidos_pagamentos_previstos_all" ON public.pedidos_pagamentos_previstos;
CREATE POLICY "pedidos_pagamentos_previstos_all" ON public.pedidos_pagamentos_previstos FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- PARTE 5: BACKFILL AUTOMÁTICO DE DADOS DOS METADADOS EXISTENTES
-- ==============================================================================

-- 5.1 Migração de dados de metadados para colunas nativas de 'pedidos'
UPDATE public.pedidos
SET 
  data_vencimento_fiado = CASE 
    WHEN data_vencimento_fiado IS NULL AND metadados->>'data_vencimento_fiado' ~ '^\d{4}-\d{2}-\d{2}' 
    THEN (metadados->>'data_vencimento_fiado')::date
    ELSE data_vencimento_fiado 
  END,
  desconto_percentual = CASE 
    WHEN (desconto_percentual IS NULL OR desconto_percentual = 0) AND metadados->>'desconto_percentual' IS NOT NULL 
    THEN (metadados->>'desconto_percentual')::numeric
    ELSE COALESCE(desconto_percentual, 0.00) 
  END,
  forma_entrega_id = CASE 
    WHEN forma_entrega_id IS NULL AND metadados->'forma_entrega'->>'id' IS NOT NULL 
    THEN (metadados->'forma_entrega'->>'id')::uuid
    ELSE forma_entrega_id 
  END,
  atualizado_por = CASE 
    WHEN atualizado_por IS NULL AND metadados->'ultimo_editor'->>'usuario_id' IS NOT NULL 
    THEN (metadados->'ultimo_editor'->>'usuario_id')::uuid
    ELSE atualizado_por 
  END,
  cliente_nome_avulso = CASE 
    WHEN cliente_nome_avulso IS NULL 
    THEN metadados->'contato_catalogo'->>'nome'
    ELSE cliente_nome_avulso 
  END,
  cliente_telefone_avulso = CASE 
    WHEN cliente_telefone_avulso IS NULL 
    THEN metadados->'contato_catalogo'->>'telefone'
    ELSE cliente_telefone_avulso 
  END,
  cliente_documento_avulso = CASE 
    WHEN cliente_documento_avulso IS NULL 
    THEN metadados->'contato_catalogo'->>'cpfCnpj'
    ELSE cliente_documento_avulso 
  END,
  cliente_email_avulso = CASE 
    WHEN cliente_email_avulso IS NULL 
    THEN metadados->'contato_catalogo'->>'email'
    ELSE cliente_email_avulso 
  END,
  troco_para = CASE 
    WHEN troco_para IS NULL AND metadados->>'troco_para' IS NOT NULL 
    THEN (metadados->>'troco_para')::numeric
    ELSE troco_para 
  END,
  cupom_codigo = CASE 
    WHEN cupom_codigo IS NULL 
    THEN metadados->'cupom'->>'codigo'
    ELSE cupom_codigo 
  END,
  valor_desconto_cupom = CASE 
    WHEN (valor_desconto_cupom IS NULL OR valor_desconto_cupom = 0) AND metadados->'cupom'->>'desconto' IS NOT NULL 
    THEN (metadados->'cupom'->>'desconto')::numeric
    ELSE COALESCE(valor_desconto_cupom, 0.00) 
  END,
  forma_pagamento_catalogo = CASE 
    WHEN forma_pagamento_catalogo IS NULL 
    THEN metadados->>'forma_pagamento_catalogo'
    ELSE forma_pagamento_catalogo 
  END
WHERE metadados IS NOT NULL AND metadados <> '{}'::jsonb;

-- 5.2 Migração de Cupons de 'lojas.configuracoes_extras' para a tabela 'cupons'
INSERT INTO public.cupons (
    id, loja_id, codigo, tipo, valor, valor_minimo_carrinho, tem_valor_minimo, ativo, usos_count, limite_usos, data_inicio, data_fim, criado_em
)
SELECT 
    COALESCE((elem->>'id')::uuid, gen_random_uuid()) AS id,
    l.id AS loja_id,
    UPPER(TRIM(elem->>'codigo')) AS codigo,
    COALESCE(elem->>'tipo', 'desconto_fixo') AS tipo,
    COALESCE((elem->>'valor')::numeric, 0.00) AS valor,
    COALESCE((elem->>'valor_minimo_carrinho')::numeric, 0.00) AS valor_minimo_carrinho,
    COALESCE((elem->>'tem_valor_minimo')::boolean, false) AS tem_valor_minimo,
    COALESCE((elem->>'ativo')::boolean, true) AS ativo,
    COALESCE((elem->>'usos_count')::integer, 0) AS usos_count,
    CASE WHEN elem->>'limite_usos' IS NOT NULL THEN (elem->>'limite_usos')::integer ELSE NULL END AS limite_usos,
    CASE WHEN elem->>'data_inicio' IS NOT NULL THEN (elem->>'data_inicio')::timestamptz ELSE NULL END AS data_inicio,
    CASE WHEN elem->>'data_fim' IS NOT NULL THEN (elem->>'data_fim')::timestamptz ELSE NULL END AS data_fim,
    COALESCE((elem->>'criado_em')::timestamptz, NOW()) AS criado_em
FROM public.lojas l,
LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(l.configuracoes_extras->'cupons') = 'array' THEN l.configuracoes_extras->'cupons' ELSE '[]'::jsonb END) AS elem
WHERE elem->>'codigo' IS NOT NULL
ON CONFLICT (loja_id, codigo) DO NOTHING;

-- 5.3 Migração do histórico de status para 'historico_pedidos'
INSERT INTO public.historico_pedidos (loja_id, pedido_id, usuario_id, tipo_evento, status_novo, descricao, criado_em)
SELECT 
    p.loja_id,
    p.id AS pedido_id,
    NULL AS usuario_id,
    'status_alterado' AS tipo_evento,
    elem->>'status' AS status_novo,
    COALESCE(elem->>'usuario', 'Operador') AS descricao,
    COALESCE((elem->>'data')::timestamptz, NOW()) AS criado_em
FROM public.pedidos p,
LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.metadados->'historico_status') = 'array' THEN p.metadados->'historico_status' ELSE '[]'::jsonb END) AS elem
WHERE NOT EXISTS (
    SELECT 1 FROM public.historico_pedidos hp 
    WHERE hp.pedido_id = p.id AND hp.status_novo = elem->>'status'
);

-- 5.4 Migração do histórico de edições para 'historico_pedidos'
INSERT INTO public.historico_pedidos (loja_id, pedido_id, usuario_id, tipo_evento, descricao, criado_em)
SELECT 
    p.loja_id,
    p.id AS pedido_id,
    CASE 
        WHEN elem->>'usuario_id' ~ '^[0-9a-fA-F-]{36}$' THEN (elem->>'usuario_id')::uuid 
        ELSE NULL 
    END AS usuario_id,
    'pedido_editado' AS tipo_evento,
    COALESCE(elem->>'acao', 'Edição no PDV') || ' por ' || COALESCE(elem->>'usuario_nome', 'Operador') AS descricao,
    COALESCE((elem->>'data')::timestamptz, NOW()) AS criado_em
FROM public.pedidos p,
LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.metadados->'historico_edicoes') = 'array' THEN p.metadados->'historico_edicoes' ELSE '[]'::jsonb END) AS elem
WHERE NOT EXISTS (
    SELECT 1 FROM public.historico_pedidos hp 
    WHERE hp.pedido_id = p.id AND hp.descricao LIKE '%' || COALESCE(elem->>'acao', 'Edição no PDV') || '%'
);

-- 5.5 Migração de pagamentos previstos para 'pedidos_pagamentos_previstos'
INSERT INTO public.pedidos_pagamentos_previstos (
    loja_id, pedido_id, forma_pagamento_id, forma_tipo, forma_nome, valor, valor_entregue, parcelas
)
SELECT 
    p.loja_id,
    p.id AS pedido_id,
    CASE WHEN elem->>'forma_pagamento_id' ~ '^[0-9a-fA-F-]{36}$' THEN (elem->>'forma_pagamento_id')::uuid ELSE NULL END,
    COALESCE(elem->>'forma_tipo', 'dinheiro'),
    COALESCE(elem->>'forma_nome', 'Dinheiro'),
    COALESCE((elem->>'valor')::numeric, 0.00),
    CASE WHEN elem->>'valor_entregue' IS NOT NULL THEN (elem->>'valor_entregue')::numeric ELSE NULL END,
    COALESCE((elem->>'parcelas')::integer, 1)
FROM public.pedidos p,
LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.metadados->'pagamentos_previstos') = 'array' THEN p.metadados->'pagamentos_previstos' ELSE '[]'::jsonb END) AS elem
WHERE NOT EXISTS (
    SELECT 1 FROM public.pedidos_pagamentos_previstos ppp 
    WHERE ppp.pedido_id = p.id
);

-- ==============================================================================
-- PARTE 6: OTIMIZAÇÃO E ATUALIZAÇÃO DO OTIMIZADOR DE CONSULTAS
-- ==============================================================================

ANALYZE public.pedidos;
ANALYZE public.itens_pedido;
ANALYZE public.pagamentos_pedido;
ANALYZE public.clientes;
ANALYZE public.produtos;
ANALYZE public.transacoes_financeiras;
ANALYZE public.sessoes_caixa;
ANALYZE public.movimentacoes_caixa;
ANALYZE public.cupons;
ANALYZE public.unidades_medida;
ANALYZE public.historico_pedidos;
ANALYZE public.pedidos_pagamentos_previstos;

COMMIT;
