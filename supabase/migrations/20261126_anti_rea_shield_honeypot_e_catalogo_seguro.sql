-- =============================================================================
-- MIGRATION: 20261126_anti_rea_shield_honeypot_e_catalogo_seguro.sql
-- Onda 2 (Anti-REA-Shield Camadas 03 e 05):
--   1. Schema privado security_audit + blacklist com TTL (anti-CGNAT)
--   2. Armadilhas RLS VOLATILE SECURITY DEFINER sem curto-circuito + linhas dummy
--   3. 4 iscas alinhadas ao client-decoys.ts (3 tabelas + 1 RPC chamariz)
--   4. RPC rpc_listar_catalogo_protegido com projeção estrita de colunas públicas
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SEÇÃO 1: SCHEMA security_audit E BLACKLIST COM TTL (PROTEÇÃO CONTRA CGNAT)
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS security_audit;

CREATE TABLE IF NOT EXISTS security_audit.blacklisted_actors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NULL,
  usuario_id uuid NULL,
  ip_address varchar(120) NOT NULL DEFAULT 'unknown',
  user_agent text NOT NULL DEFAULT 'unknown',
  tabela_isca varchar(120) NOT NULL,
  modo_operacao varchar(30) NOT NULL DEFAULT 'simulation',
  bloqueio_ativo boolean NOT NULL DEFAULT false,
  expira_em timestamptz NOT NULL DEFAULT (now() + interval '60 minutes'),
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE security_audit.blacklisted_actors
  ADD COLUMN IF NOT EXISTS expira_em timestamptz NOT NULL DEFAULT (now() + interval '60 minutes');

CREATE INDEX IF NOT EXISTS idx_blacklisted_actors_ativos
  ON security_audit.blacklisted_actors (bloqueio_ativo, expira_em);

ALTER TABLE security_audit.blacklisted_actors ENABLE ROW LEVEL SECURITY;

-- Nega acesso direto às tabelas do schema de auditoria
REVOKE ALL ON SCHEMA security_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA security_audit FROM PUBLIC, anon, authenticated;

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
    NULLIF(TRIM(v_headers->>'cf-connecting-ip'), ''),
    NULLIF(TRIM(split_part(COALESCE(v_headers->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown'
  );

  RETURN EXISTS (
    SELECT 1
    FROM security_audit.blacklisted_actors b
    WHERE b.bloqueio_ativo = true
      AND (b.expira_em IS NULL OR b.expira_em > now())
      AND (
        (v_uid IS NOT NULL AND b.usuario_id = v_uid)
        OR (v_ip <> 'unknown' AND b.ip_address = v_ip)
      )
  );
END;
$$;

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
  v_expira_em timestamptz;
BEGIN
  v_uid := auth.uid();
  v_headers := COALESCE(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  v_ip := COALESCE(
    NULLIF(TRIM(v_headers->>'cf-connecting-ip'), ''),
    NULLIF(TRIM(split_part(COALESCE(v_headers->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown'
  );
  v_ua := LEFT(COALESCE(NULLIF(TRIM(v_headers->>'user-agent'), ''), 'unknown'), 500);

  -- TTL de 60 minutos para IPs anônimos (evita dano colateral em CGNAT 4G/5G)
  v_expira_em := CASE
    WHEN v_uid IS NULL THEN now() + interval '60 minutes'
    ELSE now() + interval '24 hours'
  END;

  INSERT INTO security_audit.blacklisted_actors (
    usuario_id,
    ip_address,
    user_agent,
    tabela_isca,
    modo_operacao,
    bloqueio_ativo,
    expira_em
  )
  VALUES (
    v_uid,
    v_ip,
    v_ua,
    p_tabela,
    CASE WHEN p_bloquear_imediatamente THEN 'production' ELSE 'simulation' END,
    p_bloquear_imediatamente,
    v_expira_em
  );

  -- Retorna sempre FALSE para devolver [] (HTTP 200) sem revelar a armadilha
  RETURN false;
END;
$$;

-- Permissões mínimas para que o avaliador RLS e funções SECURITY DEFINER operem para anon/authenticated
GRANT USAGE ON SCHEMA security_audit TO anon, authenticated;
GRANT EXECUTE ON FUNCTION security_audit.armadilha_leitura_honeypot(varchar, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION security_audit.ator_esta_bloqueado() TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- SEÇÃO 2: AS 4 ISCAS ALINHADAS AO client-decoys.ts
-- -----------------------------------------------------------------------------

-- Isca 1: public.system_master_config
CREATE TABLE IF NOT EXISTS public.system_master_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL,
  chave_config varchar(120) NOT NULL,
  valor_criptografado text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.system_master_config (id, loja_id, chave_config, valor_criptografado)
VALUES (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000000',
  'master_encryption_salt_v1',
  'decoy_0x9f4a_invalid_cipher_block'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_master_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.system_master_config TO anon, authenticated;

DROP POLICY IF EXISTS "honeypot_trap_system_master_config" ON public.system_master_config;
CREATE POLICY "honeypot_trap_system_master_config"
ON public.system_master_config
FOR ALL
USING (security_audit.armadilha_leitura_honeypot('system_master_config', false))
WITH CHECK (security_audit.armadilha_leitura_honeypot('system_master_config', false));

-- Isca 2: public.api_keys_vault
CREATE TABLE IF NOT EXISTS public.api_keys_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL,
  provedor varchar(80) NOT NULL,
  secret_token_hash text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.api_keys_vault (id, loja_id, provedor, secret_token_hash)
VALUES (
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000000',
  'stripe_live_vault_decoy',
  'decoy_sha256_00000000000000000000000000000000'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.api_keys_vault ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.api_keys_vault TO anon, authenticated;

DROP POLICY IF EXISTS "honeypot_trap_api_keys_vault" ON public.api_keys_vault;
CREATE POLICY "honeypot_trap_api_keys_vault"
ON public.api_keys_vault
FOR ALL
USING (security_audit.armadilha_leitura_honeypot('api_keys_vault', false))
WITH CHECK (security_audit.armadilha_leitura_honeypot('api_keys_vault', false));

-- Isca 3: public.tenant_admin_bypass
CREATE TABLE IF NOT EXISTS public.tenant_admin_bypass (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL,
  token_emergencia_hash text NOT NULL,
  escopo varchar(80) NOT NULL DEFAULT 'readonly_decoy',
  criado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tenant_admin_bypass (id, loja_id, token_emergencia_hash, escopo)
VALUES (
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000000',
  'decoy_bypass_token_9c3e1a7f',
  'root_simulation_decoy'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.tenant_admin_bypass ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.tenant_admin_bypass TO anon, authenticated;

DROP POLICY IF EXISTS "honeypot_trap_tenant_admin_bypass" ON public.tenant_admin_bypass;
CREATE POLICY "honeypot_trap_tenant_admin_bypass"
ON public.tenant_admin_bypass
FOR ALL
USING (security_audit.armadilha_leitura_honeypot('tenant_admin_bypass', false))
WITH CHECK (security_audit.armadilha_leitura_honeypot('tenant_admin_bypass', false));

-- Isca 4: public.rpc_export_full_database_dump()
CREATE OR REPLACE FUNCTION public.rpc_export_full_database_dump()
RETURNS TABLE (
  registro_id uuid,
  status text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = security_audit, public
AS $$
BEGIN
  PERFORM security_audit.armadilha_leitura_honeypot('rpc_export_full_database_dump', false);
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_export_full_database_dump() TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- SEÇÃO 3: RPC PROTEGIDA DO CATÁLOGO PÚBLICO (SEM SELECT * / SEM PREÇO DE CUSTO)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_listar_catalogo_protegido(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.rpc_listar_catalogo_protegido(
  p_loja_id uuid,
  p_limite integer DEFAULT 60,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  loja_id uuid,
  categoria_id uuid,
  subcategoria_id uuid,
  nome text,
  codigo_interno text,
  codigo_barras text,
  descricao text,
  fotos_urls jsonb,
  tipo_unidade text,
  unidade_medida text,
  permite_fracionado boolean,
  venda_por_peso boolean,
  preco_venda_varejo numeric,
  preco_venda_atacado numeric,
  qtd_minima_atacado numeric,
  preco_venda_autoatacado numeric,
  qtd_minima_autoatacado numeric,
  preco_promocional numeric,
  promocao_ativa boolean,
  quantidade_estoque numeric,
  tem_variacoes boolean,
  rotulo_variacao_1 text,
  rotulo_variacao_2 text,
  eh_combo boolean,
  destaque boolean,
  tipo_item text,
  requer_agendamento boolean,
  duracao_estimada_minutos integer,
  local_prestacao_servico text,
  taxa_deslocamento_domicilio numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, security_audit
AS $$
DECLARE
  v_limite_seguro integer;
BEGIN
  IF p_loja_id IS NULL THEN
    RAISE EXCEPTION 'Identificador da loja é obrigatório.';
  END IF;

  IF security_audit.ator_esta_bloqueado() THEN
    RETURN;
  END IF;

  -- Valida que a loja existe e aceita catálogo/pedidos online
  IF NOT EXISTS (
    SELECT 1
    FROM public.lojas l
    WHERE l.id = p_loja_id
      AND COALESCE(l.aceita_pedidos_online, true) = true
  ) THEN
    RETURN;
  END IF;

  v_limite_seguro := LEAST(GREATEST(COALESCE(p_limite, 60), 1), 120);

  RETURN QUERY
  SELECT
    p.id,
    p.loja_id,
    p.categoria_id,
    p.subcategoria_id,
    p.nome::text,
    p.codigo_interno::text,
    p.codigo_barras::text,
    p.descricao::text,
    COALESCE(p.fotos_urls, '[]'::jsonb),
    p.tipo_unidade::text,
    p.unidade_medida::text,
    COALESCE(p.permite_fracionado, false),
    COALESCE(p.venda_por_peso, false),
    p.preco_venda_varejo,
    p.preco_venda_atacado,
    p.qtd_minima_atacado,
    p.preco_venda_autoatacado,
    p.qtd_minima_autoatacado,
    p.preco_promocional,
    COALESCE(p.promocao_ativa, false),
    p.quantidade_estoque,
    COALESCE(p.tem_variacoes, false),
    p.rotulo_variacao_1::text,
    p.rotulo_variacao_2::text,
    COALESCE(p.eh_combo, false),
    COALESCE(p.destaque, false),
    COALESCE(p.tipo_item, 'produto')::text,
    COALESCE(p.requer_agendamento, false),
    COALESCE(p.duracao_estimada_minutos, 30),
    COALESCE(p.local_prestacao_servico, 'loja')::text,
    p.taxa_deslocamento_domicilio
  FROM public.produtos p
  WHERE p.loja_id = p_loja_id
    AND p.ativo = true
    AND p.exibir_catalogo = true
  ORDER BY COALESCE(p.destaque, false) DESC, p.nome ASC
  LIMIT v_limite_seguro
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_listar_catalogo_protegido(uuid, integer, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
