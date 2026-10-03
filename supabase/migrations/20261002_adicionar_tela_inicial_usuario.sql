-- Migration: 20261002_adicionar_tela_inicial_usuario.sql
-- Adiciona a coluna tela_inicial na tabela usuarios_loja para governança de tela inicial por colaborador

ALTER TABLE public.usuarios_loja
ADD COLUMN IF NOT EXISTS tela_inicial VARCHAR(50) DEFAULT 'dashboard';

-- Atualiza registros existentes sem tela_inicial definida:
-- Gestores recebem 'dashboard', vendedores e comuns recebem 'pos'
UPDATE public.usuarios_loja
SET tela_inicial = CASE
    WHEN perfil IN ('owner', 'admin', 'gerente') THEN 'dashboard'
    ELSE 'pos'
END
WHERE tela_inicial IS NULL;
