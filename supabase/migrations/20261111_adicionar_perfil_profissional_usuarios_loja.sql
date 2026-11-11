-- ==============================================================================
-- SISTEMA HUBI - SUPORTE AO PERFIL 'profissional' EM usuarios_loja
-- Permite o cadastro e persistência de colaboradores com perfil profissional
-- mantendo compatibilidade com 'owner', 'admin', 'gerente', 'vendedor' e 'comum'
-- ==============================================================================

ALTER TABLE public.usuarios_loja 
DROP CONSTRAINT IF EXISTS usuarios_loja_perfil_check;

ALTER TABLE public.usuarios_loja 
ADD CONSTRAINT usuarios_loja_perfil_check 
CHECK (perfil IN ('admin', 'gerente', 'vendedor', 'profissional', 'owner', 'comum'));
