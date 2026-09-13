-- Script para adicionar a coluna tipo_item na tabela produtos
-- Suporta distincao entre 'produto' e 'servico' (HUBI Gestao)

ALTER TABLE public.produtos 
ADD COLUMN IF NOT EXISTS tipo_item VARCHAR(20) DEFAULT 'produto';

-- Adicionar constraint de validacao caso ainda nao exista
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'produtos_tipo_item_check'
    ) THEN
        ALTER TABLE public.produtos 
        ADD CONSTRAINT produtos_tipo_item_check 
        CHECK (tipo_item IN ('produto', 'servico'));
    END IF;
END $$;

-- Atualizar registros legados nulos para 'produto'
UPDATE public.produtos 
SET tipo_item = 'produto' 
WHERE tipo_item IS NULL;

-- Notificar o PostgREST para recarregar o schema cache imediatamente
NOTIFY pgrst, 'reload schema';
