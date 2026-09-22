-- Migration: Adiciona coluna link_etiqueta na tabela pedido_entregas
ALTER TABLE public.pedido_entregas ADD COLUMN IF NOT EXISTS link_etiqueta TEXT;
