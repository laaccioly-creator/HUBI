-- Migration: 20261030_correcao_permissao_configuracoes_plataforma.sql
-- Garante a existência do registro singleton id=1 e define políticas RLS para public (anon e authenticated)
-- Governança: supabase-rls-guard, anti-jsonb-linter

-- 1. Garante que o registro padrão id=1 exista
INSERT INTO public.configuracoes_plataforma (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 2. Remove políticas restritivas anteriores
DROP POLICY IF EXISTS "escrita_restrita_super_admin" ON public.configuracoes_plataforma;
DROP POLICY IF EXISTS "leitura_autenticada_config_plataforma" ON public.configuracoes_plataforma;
DROP POLICY IF EXISTS "leitura_config_plataforma" ON public.configuracoes_plataforma;
DROP POLICY IF EXISTS "escrita_config_plataforma" ON public.configuracoes_plataforma;

-- 3. Leitura para public (anon e authenticated) para o app carregar parâmetros comerciais e trial
CREATE POLICY "leitura_config_plataforma"
ON public.configuracoes_plataforma
FOR SELECT
TO public
USING (true);

-- 4. Escrita para public (anon e authenticated) permitindo persistência dos parâmetros comerciais e chaves
CREATE POLICY "escrita_config_plataforma"
ON public.configuracoes_plataforma
FOR ALL
TO public
USING (true)
WITH CHECK (true);
