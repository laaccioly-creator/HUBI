-- ==============================================================================
-- MIGRAÇÃO DEFINITIVA: ELIMINAÇÃO DE METADADOS & ARQUITETURA RELACIONAL NORMALIZADA
-- Sistema HUBI - ERP / PDV
-- ==============================================================================

-- 1. ADICIONAR COLUNAS NATIVAS NA TABELA 'pedidos'
ALTER TABLE public.pedidos 
  ADD COLUMN IF NOT EXISTS data_vencimento_fiado DATE,
  ADD COLUMN IF NOT EXISTS desconto_percentual NUMERIC(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS forma_entrega_id UUID REFERENCES public.formas_entrega(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS atualizado_por UUID REFERENCES public.usuarios_loja(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_nome_avulso VARCHAR(150),
  ADD COLUMN IF NOT EXISTS cliente_telefone_avulso VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cliente_documento_avulso VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cliente_email_avulso VARCHAR(100);

-- Índices de Alta Performance
CREATE INDEX IF NOT EXISTS idx_pedidos_vencimento_fiado ON public.pedidos(data_vencimento_fiado) WHERE data_vencimento_fiado IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pedidos_forma_entrega ON public.pedidos(forma_entrega_id) WHERE forma_entrega_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pedidos_atualizado_por ON public.pedidos(atualizado_por) WHERE atualizado_por IS NOT NULL;

-- 2. CRIAR TABELA DE AUDITORIA E HISTÓRICO DE PEDIDOS
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

-- Índices da Tabela de Histórico
CREATE INDEX IF NOT EXISTS idx_historico_pedidos_pedido ON public.historico_pedidos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_historico_pedidos_loja ON public.historico_pedidos(loja_id);
CREATE INDEX IF NOT EXISTS idx_historico_pedidos_criado_em ON public.historico_pedidos(criado_em DESC);

-- Habilitar RLS na tabela historico_pedidos
ALTER TABLE public.historico_pedidos ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso (Compatível com cliente anônimo da aplicação)
DROP POLICY IF EXISTS "historico_pedidos_loja_all" ON public.historico_pedidos;
DROP POLICY IF EXISTS "historico_pedidos_all" ON public.historico_pedidos;
CREATE POLICY "historico_pedidos_all" ON public.historico_pedidos 
FOR ALL USING (true) WITH CHECK (true);

-- 3. BACKFILL AUTOMÁTICO DE DADOS DOS METADADOS EXISTENTES PARA AS COLUNAS NATIVAS
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
  END
WHERE metadados IS NOT NULL AND metadados <> '{}'::jsonb;

-- 4. BACKFILL DO HISTÓRICO DE STATUS (DE METADADOS PARA historico_pedidos)
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

-- 5. BACKFILL DO HISTÓRICO DE EDIÇÕES (DE METADADOS PARA historico_pedidos)
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
