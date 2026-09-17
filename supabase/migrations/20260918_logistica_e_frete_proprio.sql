-- ==============================================================================
-- MIGRATION: 20260918_logistica_e_frete_proprio.sql
-- ARQUITETURA HUBI v1.1.0: 100% Relacional, sem colunas genéricas JSON/JSONB/metadata
-- ==============================================================================

-- 1. EXTENSÃO DO ENUM/CHECK DE STATUS NA TABELA pedidos
-- Adiciona o status canônico 'aguardando_envio' para desacoplamento financeiro x logístico
ALTER TABLE public.pedidos 
  DROP CONSTRAINT IF EXISTS pedidos_status_check;

ALTER TABLE public.pedidos 
  ADD CONSTRAINT pedidos_status_check CHECK (
    status IN (
      'pendente',
      'confirmado',
      'em_separacao',
      'em_producao',
      'em_expedicao',
      'aguardando_envio',
      'saiu_para_entrega',
      'pronto_para_retirar',
      'concluido',
      'vencido',
      'cancelado'
    )
  );

-- 2. TABELA CANÔNICA DE LOGÍSTICA: pedido_entregas
-- A. Atualização da constraint de provedores para incluir 'frete_proprio'
ALTER TABLE public.pedido_entregas
  DROP CONSTRAINT IF EXISTS pedido_entregas_provedor_check;

ALTER TABLE public.pedido_entregas
  ADD CONSTRAINT pedido_entregas_provedor_check CHECK (
    provedor IN ('uber', 'melhor_envio', 'retirada_loja', 'frete_proprio')
  );

-- B. Adição canônica das propriedades de despacho, rastreio e operador
-- Integridade referencial apontando para usuarios_loja(id)
ALTER TABLE public.pedido_entregas
  ADD COLUMN IF NOT EXISTS link_rastreio TEXT,
  ADD COLUMN IF NOT EXISTS pin_entrega VARCHAR(20),
  ADD COLUMN IF NOT EXISTS entregador_nome VARCHAR(255),
  ADD COLUMN IF NOT EXISTS despachado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS despachado_por UUID REFERENCES public.usuarios_loja(id) ON DELETE SET NULL;

-- Índices otimizados para busca e auditoria logística
CREATE INDEX IF NOT EXISTS idx_pedido_entregas_despachado_em 
  ON public.pedido_entregas(despachado_em);
CREATE INDEX IF NOT EXISTS idx_pedido_entregas_despachado_por 
  ON public.pedido_entregas(despachado_por);
CREATE INDEX IF NOT EXISTS idx_pedido_entregas_provedor_status 
  ON public.pedido_entregas(provedor, status_envio);

-- 3. SNAPSHOT DERIVADO EM pedidos (Para Performance de Leitura na Listagem)
-- Colunas auxiliares desnormalizadas que evitam joins custosos na visualização de pedidos
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS codigo_rastreio VARCHAR(100),
  ADD COLUMN IF NOT EXISTS link_rastreio TEXT,
  ADD COLUMN IF NOT EXISTS entregador_nome VARCHAR(255),
  ADD COLUMN IF NOT EXISTS despachado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS despachado_por UUID REFERENCES public.usuarios_loja(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_status_loja 
  ON public.pedidos(loja_id, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_codigo_rastreio 
  ON public.pedidos(codigo_rastreio) 
  WHERE codigo_rastreio IS NOT NULL;

-- 4. UNIFICAÇÃO DE CONFIGURAÇÕES DE FRETE: loja_shipping_configs (Tabela 10)
-- Adiciona os parâmetros de Frete Próprio diretamente na tabela existente
ALTER TABLE public.loja_shipping_configs
  ADD COLUMN IF NOT EXISTS frete_proprio_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS frete_proprio_tipo_cobranca VARCHAR(20) NOT NULL DEFAULT 'fixo',
  ADD COLUMN IF NOT EXISTS frete_proprio_valor_padrao NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

-- Constraint para o modo de cobrança do frete próprio
ALTER TABLE public.loja_shipping_configs
  DROP CONSTRAINT IF EXISTS loja_shipping_configs_frete_proprio_tipo_check;

ALTER TABLE public.loja_shipping_configs
  ADD CONSTRAINT loja_shipping_configs_frete_proprio_tipo_check CHECK (
    frete_proprio_tipo_cobranca IN ('fixo', 'manual', 'gratis')
  );

-- Comentários de documentação nas colunas
COMMENT ON COLUMN public.pedido_entregas.link_rastreio IS 'URL direta de rastreamento do despacho logístico';
COMMENT ON COLUMN public.pedido_entregas.pin_entrega IS 'PIN de confirmação de entrega em mãos (Uber Direct)';
COMMENT ON COLUMN public.pedido_entregas.entregador_nome IS 'Nome do entregador/motoboy responsável quando provedor = frete_proprio';
COMMENT ON COLUMN public.pedido_entregas.despachado_em IS 'Data e hora em que a encomenda saiu para entrega ou foi coletada';
COMMENT ON COLUMN public.pedido_entregas.despachado_por IS 'Operador da loja (usuarios_loja) que realizou o despacho';
COMMENT ON COLUMN public.loja_shipping_configs.frete_proprio_ativo IS 'Habilita opção de Frete Próprio no checkout do PDV e Catálogo';
COMMENT ON COLUMN public.loja_shipping_configs.frete_proprio_tipo_cobranca IS 'Modo de precificação: fixo, manual ou gratis';
COMMENT ON COLUMN public.loja_shipping_configs.frete_proprio_valor_padrao IS 'Valor padrão em reais do frete próprio';
