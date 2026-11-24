-- ==============================================================================
-- Migration: 20261124_recuperacao_senha_whatsapp.sql
-- Descrição:
--   1. Cria tabela relacional public.recuperacao_senha_tokens (sem JSONB) com RLS restrito.
--   2. Garante criptografia bcrypt em public.usuarios_loja.senha_hash (migração + trigger).
--   3. Cria RPC SECURITY DEFINER public.validar_senha_colaborador(VARCHAR, TEXT).
--   4. Cria RPC restrita a service_role public.atualizar_senha_hash_colaborador(VARCHAR, TEXT).
-- ==============================================================================

-- 1. Extensão pgcrypto para hash bcrypt (crypt / gen_salt)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Tabela relacional para tokens temporários de recuperação de senha via WhatsApp
CREATE TABLE IF NOT EXISTS public.recuperacao_senha_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone_normalizado VARCHAR(20) NOT NULL,
  codigo_hash TEXT NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  expira_em TIMESTAMPTZ NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.recuperacao_senha_tokens IS 'Tokens temporários de 6 dígitos (hash SHA-256) para redefinição de senha via WhatsApp';
COMMENT ON COLUMN public.recuperacao_senha_tokens.telefone_normalizado IS 'Telefone no padrão canônico 55 + DDD + número';
COMMENT ON COLUMN public.recuperacao_senha_tokens.codigo_hash IS 'Hash SHA-256 hexadecimal do código numérico de 6 dígitos';

CREATE INDEX IF NOT EXISTS idx_recuperacao_senha_tokens_tel_ativo
  ON public.recuperacao_senha_tokens (telefone_normalizado, criado_em DESC)
  WHERE usado = FALSE;

-- 3. Blindagem RLS: bloqueio completo para anon e authenticated (acesso exclusivo via service_role)
ALTER TABLE public.recuperacao_senha_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.recuperacao_senha_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.recuperacao_senha_tokens TO service_role;

DROP POLICY IF EXISTS "recuperacao_senha_tokens_bloquear_select" ON public.recuperacao_senha_tokens;
CREATE POLICY "recuperacao_senha_tokens_bloquear_select"
  ON public.recuperacao_senha_tokens
  FOR SELECT
  TO anon, authenticated
  USING (FALSE);

DROP POLICY IF EXISTS "recuperacao_senha_tokens_bloquear_insert" ON public.recuperacao_senha_tokens;
CREATE POLICY "recuperacao_senha_tokens_bloquear_insert"
  ON public.recuperacao_senha_tokens
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "recuperacao_senha_tokens_bloquear_update" ON public.recuperacao_senha_tokens;
CREATE POLICY "recuperacao_senha_tokens_bloquear_update"
  ON public.recuperacao_senha_tokens
  FOR UPDATE
  TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "recuperacao_senha_tokens_bloquear_delete" ON public.recuperacao_senha_tokens;
CREATE POLICY "recuperacao_senha_tokens_bloquear_delete"
  ON public.recuperacao_senha_tokens
  FOR DELETE
  TO anon, authenticated
  USING (FALSE);

-- 4. Saneamento e proteção bcrypt para usuarios_loja.senha_hash
UPDATE public.usuarios_loja
   SET senha_hash = extensions.crypt(senha_hash, extensions.gen_salt('bf'))
 WHERE senha_hash IS NOT NULL
   AND trim(senha_hash) <> ''
   AND senha_hash !~ '^\$2[aby]\$';

CREATE OR REPLACE FUNCTION public.fn_garantir_bcrypt_senha_hash_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.senha_hash IS NOT NULL
     AND trim(NEW.senha_hash) <> ''
     AND NEW.senha_hash !~ '^\$2[aby]\$' THEN
    NEW.senha_hash := extensions.crypt(NEW.senha_hash, extensions.gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_loja_bcrypt_senha_hash ON public.usuarios_loja;
CREATE TRIGGER trg_usuarios_loja_bcrypt_senha_hash
  BEFORE INSERT OR UPDATE OF senha_hash ON public.usuarios_loja
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_garantir_bcrypt_senha_hash_usuario();

-- 5. RPC SECURITY DEFINER para validação segura de senha de colaboradores sem expor senha_hash ao cliente
CREATE OR REPLACE FUNCTION public.validar_senha_colaborador(
  p_telefone VARCHAR,
  p_senha TEXT
)
RETURNS TABLE (
  valido BOOLEAN,
  usuario_id UUID,
  loja_id UUID,
  ativo BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_input TEXT;
  v_tel_norm TEXT;
  v_tel_sem_ddi TEXT;
  v_email_canonico TEXT;
  v_email_interno_1 TEXT;
  v_email_interno_2 TEXT;
  v_rec RECORD;
  v_match BOOLEAN;
BEGIN
  IF p_telefone IS NULL OR trim(p_telefone) = '' OR p_senha IS NULL OR trim(p_senha) = '' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::BOOLEAN;
    RETURN;
  END IF;

  v_input := lower(trim(p_telefone));

  IF position('@' IN v_input) > 0 THEN
    IF v_input LIKE '%@hubi.app' OR v_input LIKE '%@hubi.internal' THEN
      v_tel_norm := public.normalizar_telefone_com_ddi(split_part(v_input, '@', 1));
    ELSE
      v_tel_norm := NULL;
      v_email_canonico := v_input;
    END IF;
  ELSE
    v_tel_norm := public.normalizar_telefone_com_ddi(v_input);
  END IF;

  IF v_tel_norm IS NOT NULL AND v_tel_norm <> '' THEN
    v_tel_sem_ddi := CASE
      WHEN v_tel_norm LIKE '55%' AND length(v_tel_norm) >= 12 THEN substr(v_tel_norm, 3)
      ELSE v_tel_norm
    END;
    v_email_canonico := v_tel_norm || '@hubi.app';
    v_email_interno_1 := v_tel_sem_ddi || '@hubi.internal';
    v_email_interno_2 := v_tel_norm || '@hubi.internal';
  END IF;

  FOR v_rec IN
    SELECT
      u.id,
      u.loja_id,
      COALESCE(u.ativo, TRUE) AS usuario_ativo,
      u.senha_hash
    FROM public.usuarios_loja u
    WHERE u.senha_hash IS NOT NULL
      AND trim(u.senha_hash) <> ''
      AND (
        (v_email_canonico IS NOT NULL AND lower(trim(u.email)) = v_email_canonico)
        OR (v_email_interno_1 IS NOT NULL AND lower(trim(u.email)) = v_email_interno_1)
        OR (v_email_interno_2 IS NOT NULL AND lower(trim(u.email)) = v_email_interno_2)
        OR (
          v_tel_norm IS NOT NULL
          AND v_tel_norm <> ''
          AND public.normalizar_telefone_com_ddi(u.whatsapp_atendimento) = v_tel_norm
        )
      )
    ORDER BY COALESCE(u.ativo, TRUE) DESC, u.criado_em ASC
  LOOP
    v_match := FALSE;
    BEGIN
      IF v_rec.senha_hash ~ '^\$2[aby]\$' THEN
        v_match := (extensions.crypt(p_senha, v_rec.senha_hash) = v_rec.senha_hash);
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_match := FALSE;
    END;

    IF v_match THEN
      RETURN QUERY SELECT TRUE, v_rec.id, v_rec.loja_id, v_rec.usuario_ativo;
      RETURN;
    END IF;
  END LOOP;

  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::BOOLEAN;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_senha_colaborador(VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_senha_colaborador(VARCHAR, TEXT) TO anon, authenticated, service_role;

-- 6. RPC restrita a service_role para atualizar senha_hash com bcrypt após validação do token de recuperação
CREATE OR REPLACE FUNCTION public.atualizar_senha_hash_colaborador(
  p_telefone VARCHAR,
  p_nova_senha TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tel_norm TEXT;
  v_tel_sem_ddi TEXT;
  v_email_canonico TEXT;
  v_email_interno_1 TEXT;
  v_email_interno_2 TEXT;
  v_atualizados INTEGER := 0;
BEGIN
  IF p_telefone IS NULL OR trim(p_telefone) = '' OR p_nova_senha IS NULL OR length(trim(p_nova_senha)) < 6 THEN
    RETURN 0;
  END IF;

  v_tel_norm := public.normalizar_telefone_com_ddi(p_telefone);
  IF v_tel_norm IS NULL OR length(v_tel_norm) < 12 THEN
    RETURN 0;
  END IF;

  v_tel_sem_ddi := CASE
    WHEN v_tel_norm LIKE '55%' AND length(v_tel_norm) >= 12 THEN substr(v_tel_norm, 3)
    ELSE v_tel_norm
  END;
  v_email_canonico := v_tel_norm || '@hubi.app';
  v_email_interno_1 := v_tel_sem_ddi || '@hubi.internal';
  v_email_interno_2 := v_tel_norm || '@hubi.internal';

  UPDATE public.usuarios_loja u
     SET senha_hash = extensions.crypt(p_nova_senha, extensions.gen_salt('bf'))
   WHERE COALESCE(u.ativo, TRUE) = TRUE
     AND (
       lower(trim(u.email)) IN (v_email_canonico, v_email_interno_1, v_email_interno_2)
       OR public.normalizar_telefone_com_ddi(u.whatsapp_atendimento) = v_tel_norm
     );

  GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  RETURN v_atualizados;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_senha_hash_colaborador(VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_senha_hash_colaborador(VARCHAR, TEXT) TO service_role;
