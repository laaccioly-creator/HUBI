-- ==============================================================================
-- SISTEMA HUBI - MIGRAÇÃO: ADICIONAR PRAZO EM DIAS NA FORMA DE PAGAMENTO FIADO
-- ==============================================================================

-- Adiciona a coluna prazo_dias para armazenar o prazo em dias para pagamento do fiado
ALTER TABLE public.formas_pagamento 
ADD COLUMN IF NOT EXISTS prazo_dias INTEGER DEFAULT 30;

-- Atualiza formas de pagamento do tipo 'fiado' que não tenham prazo definido para o padrão de 30 dias
UPDATE public.formas_pagamento 
SET prazo_dias = 30 
WHERE tipo = 'fiado' AND (prazo_dias IS NULL OR prazo_dias <= 0);

COMMENT ON COLUMN public.formas_pagamento.prazo_dias IS 'Prazo em dias para efetuar o pagamento de vendas a prazo / fiado';