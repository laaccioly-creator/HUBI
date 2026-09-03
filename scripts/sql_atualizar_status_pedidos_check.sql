-- ==============================================================================
-- MIGRAÇÃO: Atualizar Restrição de Status dos Pedidos (pedidos_status_check)
-- ==============================================================================
-- Motivo: Permitir os status 'em_separacao', 'saiu_para_entrega' e 'pronto_para_retirar'
--         além de aumentar a largura da coluna para evitar problemas de truncamento.
-- ==============================================================================

-- 1. Remover a restrição check antiga da tabela pedidos
ALTER TABLE public.pedidos 
  DROP CONSTRAINT IF EXISTS pedidos_status_check;

-- 2. Garantir tamanho VARCHAR(50) para a coluna status
ALTER TABLE public.pedidos 
  ALTER COLUMN status TYPE VARCHAR(50);

-- 3. Recriar a restrição com todos os status válidos suportados pelo sistema
ALTER TABLE public.pedidos 
  ADD CONSTRAINT pedidos_status_check 
  CHECK (status IN (
    'pendente',
    'confirmado',
    'em_separacao',
    'em_producao',
    'em_expedicao',
    'saiu_para_entrega',
    'pronto_para_retirar',
    'entregue',
    'concluido',
    'cancelado'
  ));

-- 4. Verificação simples
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'pedidos' AND column_name = 'status';
