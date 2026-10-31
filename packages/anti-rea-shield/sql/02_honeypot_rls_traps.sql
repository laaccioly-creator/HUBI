-- ============================================================================
-- 02_honeypot_rls_traps.sql
-- Cria o schema privado security_audit, a tabela de atores bloqueados e as
-- Tabelas Canário (Honeypots) com armadilha em SELECT via RLS VOLATILE
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS security_audit;

-- Revoga acesso público ao schema de auditoria
REVOKE ALL ON SCHEMA security_audit FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS security_audit.blacklisted_actors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NULL,
  usuario_id uuid NULL,
  ip_address varchar(120) NOT NULL DEFAULT 'unknown',
  user_agent text NOT NULL DEFAULT 'unknown',
  tabela_isca varchar(120) NOT NULL,
  modo_operacao varchar(30) NOT NULL DEFAULT 'simulation',
  bloqueio_ativo boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Função que verifica se o ator atual está bloqueado em modo de produção
CREATE OR REPLACE FUNCTION security_audit.ator_esta_bloqueado()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = security_audit, public
AS $$
DECLARE
  v_uid uuid;
  v_headers jsonb;
  v_ip text;
BEGIN
  v_uid := auth.uid();
  v_headers := COALESCE(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  v_ip := COALESCE(
    v_headers->>'cf-connecting-ip',
    split_part(v_headers->>'x-forwarded-for', ',', 1),
    'unknown'
  );

  RETURN EXISTS (
    SELECT 1
    FROM security_audit.blacklisted_actors b
    WHERE b.bloqueio_ativo = true
      AND (
        (v_uid IS NOT NULL AND b.usuario_id = v_uid)
        OR (v_ip <> 'unknown' AND b.ip_address = v_ip)
      )
  );
END;
$$;

-- Função Armadilha executada pelo avaliador RLS durante qualquer SELECT nas tabelas isca
CREATE OR REPLACE FUNCTION security_audit.armadilha_leitura_honeypot(
  p_tabela varchar,
  p_bloquear_imediatamente boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = security_audit, public
AS $$
DECLARE
  v_uid uuid;
  v_headers jsonb;
  v_ip text;
  v_ua text;
BEGIN
  v_uid := auth.uid();
  v_headers := COALESCE(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  v_ip := COALESCE(
    v_headers->>'cf-connecting-ip',
    split_part(v_headers->>'x-forwarded-for', ',', 1),
    'unknown'
  );
  v_ua := LEFT(COALESCE(v_headers->>'user-agent', 'unknown'), 500);

  INSERT INTO security_audit.blacklisted_actors (
    usuario_id,
    ip_address,
    user_agent,
    tabela_isca,
    modo_operacao,
    bloqueio_ativo
  )
  VALUES (
    v_uid,
    v_ip,
    v_ua,
    p_tabela,
    CASE WHEN p_bloquear_imediatamente THEN 'production' ELSE 'simulation' END,
    p_bloquear_imediatamente
  );

  -- Retorna sempre FALSE para que o atacante receba apenas [] (200 OK vazio) sem suspeitar
  RETURN false;
END;
$$;

-- ============================================================================
-- TABELAS ISCA (CANARY TABLES) COM RLS E ISOLAMENTO MULTI-TENANT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_master_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL,
  chave_config varchar(120) NOT NULL,
  valor_criptografado text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_master_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "honeypot_trap_system_master_config" ON public.system_master_config;
CREATE POLICY "honeypot_trap_system_master_config"
ON public.system_master_config
FOR ALL
USING (
  public.usuario_pertence_loja(loja_id)
  AND security_audit.armadilha_leitura_honeypot('system_master_config', false)
)
WITH CHECK (
  public.usuario_pertence_loja(loja_id)
  AND security_audit.armadilha_leitura_honeypot('system_master_config', false)
);

CREATE TABLE IF NOT EXISTS public.api_keys_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL,
  provedor varchar(80) NOT NULL,
  secret_token_hash text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_keys_vault ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "honeypot_trap_api_keys_vault" ON public.api_keys_vault;
CREATE POLICY "honeypot_trap_api_keys_vault"
ON public.api_keys_vault
FOR ALL
USING (
  public.usuario_pertence_loja(loja_id)
  AND security_audit.armadilha_leitura_honeypot('api_keys_vault', false)
)
WITH CHECK (
  public.usuario_pertence_loja(loja_id)
  AND security_audit.armadilha_leitura_honeypot('api_keys_vault', false)
);
