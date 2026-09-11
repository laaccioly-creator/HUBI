-- ==============================================================================
-- MIGRAÇÃO: Permitir o status 'vencido' na tabela pedidos
-- ==============================================================================

-- 1. Remover a restrição check antiga da tabela pedidos
ALTER TABLE public.pedidos 
  DROP CONSTRAINT IF EXISTS pedidos_status_check;

-- 2. Garantir tamanho VARCHAR(50) para a coluna status
ALTER TABLE public.pedidos 
  ALTER COLUMN status TYPE VARCHAR(50);

-- 3. Recriar a restrição com todos os status válidos incluindo 'vencido'
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
    'vencido',
    'cancelado'
  ));
