-- Migration: 20261117_rls_configuracoes_plataforma_leitura_authenticated.sql
-- Garante leitura autenticada dos parâmetros globais da plataforma (incluindo lojas bloqueadas/expiradas)
-- e restaura a restrição estrita de escrita exclusivamente para o Super Admin (5585997374372@hubi.app).
-- Governança: supabase-rls-guard, anti-jsonb-linter, pii-leak-detector

-- 1. Garante que o registro singleton id=1 exista
INSERT INTO public.configuracoes_plataforma (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 2. Garante o e-mail oficial do Super Admin mestre
UPDATE public.configuracoes_plataforma
SET email_super_admin = '5585997374372@hubi.app'
WHERE id = 1
  AND (email_super_admin IS DISTINCT FROM '5585997374372@hubi.app');

-- 3. Garante que RLS esteja habilitada na tabela global
ALTER TABLE public.configuracoes_plataforma ENABLE ROW LEVEL SECURITY;

-- 4. Remove políticas anteriores (incluindo políticas permissivas legadas)
DROP POLICY IF EXISTS "leitura_config_plataforma" ON public.configuracoes_plataforma;
DROP POLICY IF EXISTS "escrita_config_plataforma" ON public.configuracoes_plataforma;
DROP POLICY IF EXISTS "leitura_autenticada_config_plataforma" ON public.configuracoes_plataforma;
DROP POLICY IF EXISTS "escrita_restrita_super_admin" ON public.configuracoes_plataforma;
DROP POLICY IF EXISTS "insercao_restrita_super_admin_config_plataforma" ON public.configuracoes_plataforma;
DROP POLICY IF EXISTS "atualizacao_restrita_super_admin_config_plataforma" ON public.configuracoes_plataforma;
DROP POLICY IF EXISTS "exclusao_restrita_super_admin_config_plataforma" ON public.configuracoes_plataforma;

-- 5. Política de leitura: qualquer usuário autenticado (mesmo com loja expirada ou bloqueada) pode ler
CREATE POLICY "leitura_autenticada_config_plataforma"
ON public.configuracoes_plataforma
FOR SELECT
TO authenticated
USING (true);

-- 6. Políticas de escrita: estritamente restritas ao Super Admin (5585997374372@hubi.app)
CREATE POLICY "insercao_restrita_super_admin_config_plataforma"
ON public.configuracoes_plataforma
FOR INSERT
TO authenticated
WITH CHECK (public.eh_super_admin_plataforma());

CREATE POLICY "atualizacao_restrita_super_admin_config_plataforma"
ON public.configuracoes_plataforma
FOR UPDATE
TO authenticated
USING (public.eh_super_admin_plataforma())
WITH CHECK (public.eh_super_admin_plataforma());

CREATE POLICY "exclusao_restrita_super_admin_config_plataforma"
ON public.configuracoes_plataforma
FOR DELETE
TO authenticated
USING (public.eh_super_admin_plataforma());
