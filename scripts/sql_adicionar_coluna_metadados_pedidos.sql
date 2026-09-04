-- ==============================================================================
-- MIGRAÇÃO: ADICIONAR COLUNA METADADOS NA TABELA PEDIDOS
-- HUBI SISTEMA - 2026
-- ==============================================================================

-- 1. Adiciona a coluna metadados (JSONB) com valor padrão vazio se não existir
ALTER TABLE public.pedidos 
ADD COLUMN IF NOT EXISTS metadados JSONB DEFAULT '{}'::jsonb;

-- 2. Cria um índice GIN para buscas rápidas em metadados (opcional, recomendado para JSONB)
CREATE INDEX IF NOT EXISTS idx_pedidos_metadados ON public.pedidos USING gin (metadados);

-- 3. Comentário informativo na coluna
COMMENT ON COLUMN public.pedidos.metadados IS 'Metadados técnicos internos em JSONB (ex: histórico de status, desconto percentual, previsão de troco/pagamento). Mantém a coluna observacoes limpa.';
