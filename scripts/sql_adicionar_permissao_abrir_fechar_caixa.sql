-- ==============================================================================
-- MIGRAÇÃO: ADICIONAR PERMISSÃO DE ABERTURA E FECHAMENTO DE CAIXA
-- HUBI SISTEMA - 2026
-- ==============================================================================

-- 1. Adiciona a coluna se ainda não existir
ALTER TABLE public.usuarios_loja 
ADD COLUMN IF NOT EXISTS pode_abrir_fechar_caixa BOOLEAN DEFAULT FALSE;

-- 2. Concede automaticamente a permissão para owners e administradores existentes
UPDATE public.usuarios_loja 
SET pode_abrir_fechar_caixa = TRUE 
WHERE perfil IN ('owner', 'admin');

-- 3. Documentação da coluna
COMMENT ON COLUMN public.usuarios_loja.pode_abrir_fechar_caixa IS 'Permissão explícita para abertura e fechamento de caixa e acesso ao módulo financeiro';
