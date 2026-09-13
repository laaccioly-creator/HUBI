-- Script para garantir colunas de forma de pagamento na tabela pedidos
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS forma_pagamento_catalogo VARCHAR(50);
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(50);
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS troco_para NUMERIC(12,2);

-- Notificar PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
