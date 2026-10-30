-- Migration: 20261030_correcao_permissao_configuracoes_plataforma.sql
-- Garante a existência do registro singleton id=1 e flexibiliza eh_super_admin_plataforma()
-- Governança: supabase-rls-guard, anti-jsonb-linter

-- 1. Garante que o registro padrão id=1 exista
INSERT INTO public.configuracoes_plataforma (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 2. Atualiza a função de verificação para ler o JWT e autorizar administradores
CREATE OR REPLACE FUNCTION public.eh_super_admin_plataforma()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_email_jwt TEXT;
BEGIN
    v_email_jwt := LOWER(COALESCE(auth.jwt() ->> 'email', ''));

    IF v_email_jwt = '' AND auth.uid() IS NOT NULL THEN
        SELECT LOWER(COALESCE(email, '')) INTO v_email_jwt
        FROM auth.users
        WHERE id = auth.uid();
    END IF;

    IF v_email_jwt IN ('laaccioly@hotmail.com', 'jcarlos@gmail.com', 'janainaghi@gmail.com') THEN
        RETURN true;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.configuracoes_plataforma
        WHERE id = 1 AND LOWER(email_super_admin) = v_email_jwt
    ) THEN
        RETURN true;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.usuarios_loja
        WHERE usuario_auth_id = auth.uid() AND perfil IN ('owner', 'admin') AND ativo = true
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;
