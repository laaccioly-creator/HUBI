-- Migration: 20261112_atualizacao_super_admin_hubi.sql
-- Atualização do e-mail do super admin mestre global da plataforma HUBI
-- Governança: supabase-rls-guard, anti-jsonb-linter, pii-leak-detector

-- 1. Atualizar o e-mail do super admin na tabela singleton de parâmetros globais
UPDATE public.configuracoes_plataforma
SET email_super_admin = '5585997374372@hubi.app'
WHERE id = 1;

-- 2. Atualizar o valor DEFAULT da coluna para o novo e-mail mestre
ALTER TABLE public.configuracoes_plataforma
ALTER COLUMN email_super_admin SET DEFAULT '5585997374372@hubi.app';

-- 3. Atualizar a função RPC de verificação do super admin da plataforma
CREATE OR REPLACE FUNCTION public.eh_super_admin_plataforma()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_email_admin VARCHAR;
    v_user_email VARCHAR;
BEGIN
    SELECT email_super_admin INTO v_email_admin
    FROM public.configuracoes_plataforma
    WHERE id = 1;

    IF v_email_admin IS NULL THEN
        v_email_admin := '5585997374372@hubi.app';
    END IF;

    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = auth.uid();

    IF v_user_email IS NOT NULL AND LOWER(v_user_email) = LOWER(v_email_admin) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;
