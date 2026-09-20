-- ==============================================================================
-- MIGRATION: 20260919_tipos_operacao_e_despacho.sql
-- Ampliação dos tipos de operação de entrega e suporte a dados de despacho (PIN, App, Correios)
-- ==============================================================================

-- 1. Ampliar a constraint de tipos de formas de entrega
ALTER TABLE public.formas_entrega 
  DROP CONSTRAINT IF EXISTS formas_entrega_tipo_check;

ALTER TABLE public.formas_entrega 
  ADD CONSTRAINT formas_entrega_tipo_check 
  CHECK (tipo::text = ANY (ARRAY[
    'retirada', 
    'taxa_fixa', 
    'bairro', 
    'distancia_km', 
    'proprio', 
    'transportadora', 
    'manual',
    'frota_propria',
    'motoboy',
    'app_entrega',
    'correios'
  ]));

-- 2. Adicionar colunas relacionais na tabela pedidos
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS pin_entrega VARCHAR(20),
  ADD COLUMN IF NOT EXISTS nome_app VARCHAR(50),
  ADD COLUMN IF NOT EXISTS nome_transportadora VARCHAR(100),
  ADD COLUMN IF NOT EXISTS servico_correios VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tipo_operacao VARCHAR(30);

-- 3. Adicionar colunas relacionais na tabela pedido_entregas
ALTER TABLE public.pedido_entregas
  ADD COLUMN IF NOT EXISTS nome_app VARCHAR(50),
  ADD COLUMN IF NOT EXISTS nome_transportadora VARCHAR(100),
  ADD COLUMN IF NOT EXISTS servico_correios VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tipo_operacao VARCHAR(30),
  ADD COLUMN IF NOT EXISTS contato_entregador VARCHAR(50);

-- 4. Índices para consulta rápida
CREATE INDEX IF NOT EXISTS idx_pedidos_pin_entrega 
  ON public.pedidos(pin_entrega) 
  WHERE pin_entrega IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pedido_entregas_pin_entrega 
  ON public.pedido_entregas(pin_entrega) 
  WHERE pin_entrega IS NOT NULL;

-- 5. Adicionar colunas relacionais requer_link_rastreio e requer_pin na tabela formas_entrega
ALTER TABLE public.formas_entrega 
  ADD COLUMN IF NOT EXISTS requer_link_rastreio BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requer_pin BOOLEAN DEFAULT FALSE;

-- 6. Ampliar a constraint de status na tabela pedidos
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
      'envio_pendente',
      'aguardando_envio',
      'saiu_para_entrega',
      'enviado',
      'pronto_para_retirar',
      'concluido',
      'vencido',
      'cancelado'
    )
  );

