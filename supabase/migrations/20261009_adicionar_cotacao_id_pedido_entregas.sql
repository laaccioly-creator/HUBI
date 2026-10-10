-- Migration: Adiciona coluna cotacao_id na tabela pedido_entregas para rastreabilidade de cotações da Uber Direct e outros provedores
ALTER TABLE public.pedido_entregas ADD COLUMN IF NOT EXISTS cotacao_id TEXT;
