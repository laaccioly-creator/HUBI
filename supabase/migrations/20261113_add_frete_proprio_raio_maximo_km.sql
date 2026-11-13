-- Adiciona coluna frete_proprio_raio_maximo_km na tabela public.loja_shipping_configs de forma idempotente
ALTER TABLE public.loja_shipping_configs
ADD COLUMN IF NOT EXISTS frete_proprio_raio_maximo_km NUMERIC(10,2) NULL;

-- Recarrega o schema cache do PostgREST para reconhecer a nova coluna imediatamente
NOTIFY pgrst, 'reload schema';
