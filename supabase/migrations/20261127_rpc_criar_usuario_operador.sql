-- ==============================================================================
-- Migration: 20261127_rpc_criar_usuario_operador.sql
-- Objetivo: Criar a RPC segura public.criar_usuario_operador(...) para criação/edição
-- de colaboradores em public.usuarios_loja sem jamais violar a FK
-- usuarios_loja_usuario_auth_id_fkey com UUIDs inexistentes em auth.users.
-- ==============================================================================

-- 1. Garantir que usuarios_loja.usuario_auth_id aceite NULL (ex.: prestadores sem login Auth)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuarios_loja'
      AND column_name = 'usuario_auth_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.usuarios_loja ALTER COLUMN usuario_auth_id DROP NOT NULL;
  END IF;
END $$;

-- 2. Criar/atualizar RPC public.criar_usuario_operador com validação de permissão e FK segura
CREATE OR REPLACE FUNCTION public.criar_usuario_operador(
  p_loja_id UUID,
  p_nome_completo TEXT,
  p_email TEXT DEFAULT NULL,
  p_whatsapp_atendimento TEXT DEFAULT NULL,
  p_senha_hash TEXT DEFAULT NULL,
  p_perfil TEXT DEFAULT 'vendedor',
  p_usuario_auth_id UUID DEFAULT NULL,
  p_pode_trocar_loja BOOLEAN DEFAULT FALSE,
  p_pode_uso_celular_pessoal BOOLEAN DEFAULT TRUE,
  p_pode_ver_transacoes_outros BOOLEAN DEFAULT FALSE,
  p_pode_dar_desconto BOOLEAN DEFAULT FALSE,
  p_pode_cadastrar_alterar_produtos BOOLEAN DEFAULT FALSE,
  p_pode_gerenciar_estoque BOOLEAN DEFAULT FALSE,
  p_pode_ativar_fiado BOOLEAN DEFAULT FALSE,
  p_pode_abrir_fechar_caixa BOOLEAN DEFAULT FALSE,
  p_pode_ver_preco_custo BOOLEAN DEFAULT FALSE,
  p_pode_exportar_relatorios BOOLEAN DEFAULT FALSE,
  p_pode_editar_vendas_passadas BOOLEAN DEFAULT FALSE,
  p_presta_servicos BOOLEAN DEFAULT FALSE,
  p_especialidade_cargo TEXT DEFAULT NULL,
  p_tela_inicial TEXT DEFAULT 'pos',
  p_ativo BOOLEAN DEFAULT TRUE,
  p_id UUID DEFAULT NULL
)
RETURNS public.usuarios_loja
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id_valido UUID := NULL;
  v_email_limpo TEXT := NULLIF(LOWER(TRIM(COALESCE(p_email, ''))), '');
  v_nome_limpo TEXT := TRIM(COALESCE(p_nome_completo, ''));
  v_perfil_limpo TEXT := COALESCE(NULLIF(TRIM(p_perfil), ''), 'vendedor');
  v_eh_owner BOOLEAN := (v_perfil_limpo = 'owner');
  v_eh_admin BOOLEAN := (v_perfil_limpo IN ('owner', 'admin'));
  v_resultado public.usuarios_loja;
BEGIN
  IF p_loja_id IS NULL OR v_nome_limpo = '' THEN
    RAISE EXCEPTION 'Informe a loja e o nome completo do colaborador.';
  END IF;

  IF NOT public.eh_gerente_ou_admin(p_loja_id) THEN
    RAISE EXCEPTION 'Permissão insuficiente para gerenciar colaboradores desta loja.';
  END IF;

  -- Valida se o UUID informado existe realmente em auth.users; nunca força FK inválida
  IF p_usuario_auth_id IS NOT NULL THEN
    SELECT id INTO v_auth_id_valido
      FROM auth.users
     WHERE id = p_usuario_auth_id
     LIMIT 1;
  END IF;

  -- Se ainda nulo e houver e-mail, tenta vincular a conta Auth existente pelo e-mail
  IF v_auth_id_valido IS NULL AND v_email_limpo IS NOT NULL THEN
    SELECT id INTO v_auth_id_valido
      FROM auth.users
     WHERE LOWER(email) = v_email_limpo
     LIMIT 1;
  END IF;

  IF p_id IS NULL THEN
    IF v_email_limpo IS NOT NULL AND EXISTS (
      SELECT 1
        FROM public.usuarios_loja
       WHERE loja_id = p_loja_id
         AND LOWER(email) = v_email_limpo
    ) THEN
      RAISE EXCEPTION 'Já existe um colaborador cadastrado com este e-mail ou celular nesta loja.';
    END IF;

    INSERT INTO public.usuarios_loja (
      loja_id,
      nome_completo,
      email,
      whatsapp_atendimento,
      senha_hash,
      perfil,
      usuario_auth_id,
      pode_trocar_loja,
      pode_uso_celular_pessoal,
      pode_ver_transacoes_outros,
      pode_dar_desconto,
      pode_cadastrar_alterar_produtos,
      pode_gerenciar_estoque,
      pode_ativar_fiado,
      pode_abrir_fechar_caixa,
      pode_ver_preco_custo,
      pode_exportar_relatorios,
      pode_editar_vendas_passadas,
      presta_servicos,
      especialidade_cargo,
      tela_inicial,
      ativo
    )
    VALUES (
      p_loja_id,
      v_nome_limpo,
      v_email_limpo,
      NULLIF(TRIM(COALESCE(p_whatsapp_atendimento, '')), ''),
      NULLIF(TRIM(COALESCE(p_senha_hash, '')), ''),
      v_perfil_limpo,
      v_auth_id_valido,
      CASE WHEN v_eh_owner THEN TRUE WHEN v_eh_admin THEN COALESCE(p_pode_trocar_loja, FALSE) ELSE FALSE END,
      CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_uso_celular_pessoal, TRUE) END,
      CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_ver_transacoes_outros, FALSE) END,
      CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_dar_desconto, FALSE) END,
      CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_cadastrar_alterar_produtos, FALSE) END,
      CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_gerenciar_estoque, FALSE) END,
      CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_ativar_fiado, FALSE) END,
      CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_abrir_fechar_caixa, FALSE) END,
      CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_ver_preco_custo, FALSE) END,
      CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_exportar_relatorios, FALSE) END,
      CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_editar_vendas_passadas, FALSE) END,
      COALESCE(p_presta_servicos, FALSE),
      NULLIF(TRIM(COALESCE(p_especialidade_cargo, '')), ''),
      COALESCE(NULLIF(TRIM(p_tela_inicial), ''), CASE WHEN v_eh_admin OR v_perfil_limpo = 'gerente' THEN 'dashboard' ELSE 'pos' END),
      CASE WHEN v_eh_owner THEN TRUE ELSE COALESCE(p_ativo, TRUE) END
    )
    RETURNING * INTO v_resultado;
  ELSE
    UPDATE public.usuarios_loja
       SET nome_completo = v_nome_limpo,
           email = v_email_limpo,
           whatsapp_atendimento = NULLIF(TRIM(COALESCE(p_whatsapp_atendimento, '')), ''),
           senha_hash = COALESCE(NULLIF(TRIM(COALESCE(p_senha_hash, '')), ''), senha_hash),
           perfil = v_perfil_limpo,
           usuario_auth_id = COALESCE(v_auth_id_valido, usuario_auth_id),
           pode_trocar_loja = CASE WHEN v_eh_owner THEN TRUE WHEN v_eh_admin THEN COALESCE(p_pode_trocar_loja, FALSE) ELSE FALSE END,
           pode_uso_celular_pessoal = CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_uso_celular_pessoal, TRUE) END,
           pode_ver_transacoes_outros = CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_ver_transacoes_outros, FALSE) END,
           pode_dar_desconto = CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_dar_desconto, FALSE) END,
           pode_cadastrar_alterar_produtos = CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_cadastrar_alterar_produtos, FALSE) END,
           pode_gerenciar_estoque = CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_gerenciar_estoque, FALSE) END,
           pode_ativar_fiado = CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_ativar_fiado, FALSE) END,
           pode_abrir_fechar_caixa = CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_abrir_fechar_caixa, FALSE) END,
           pode_ver_preco_custo = CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_ver_preco_custo, FALSE) END,
           pode_exportar_relatorios = CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_exportar_relatorios, FALSE) END,
           pode_editar_vendas_passadas = CASE WHEN v_eh_admin THEN TRUE ELSE COALESCE(p_pode_editar_vendas_passadas, FALSE) END,
           presta_servicos = COALESCE(p_presta_servicos, FALSE),
           especialidade_cargo = NULLIF(TRIM(COALESCE(p_especialidade_cargo, '')), ''),
           tela_inicial = COALESCE(NULLIF(TRIM(p_tela_inicial), ''), tela_inicial),
           ativo = CASE WHEN v_eh_owner THEN TRUE ELSE COALESCE(p_ativo, TRUE) END
     WHERE id = p_id
       AND loja_id = p_loja_id
    RETURNING * INTO v_resultado;
  END IF;

  RETURN v_resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_usuario_operador(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID,
  BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN,
  BOOLEAN, TEXT, TEXT, BOOLEAN, UUID
) TO authenticated, service_role;
