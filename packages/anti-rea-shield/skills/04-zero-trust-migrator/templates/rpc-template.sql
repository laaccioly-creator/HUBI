-- ============================================================================
-- TEMPLATE ZERO-TRUST RPC (PL/pgSQL SECURITY DEFINER + MULTI-TENANT RLS GUARD)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_exemplo_operacao_segura(
  p_loja_id uuid,
  p_valor_bruto numeric(12,2),
  p_desconto numeric(12,2)
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_valor_liquido numeric(12,2);
BEGIN
  -- 1. Validação de autenticação
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Operação não autorizada: sessão ausente.';
  END IF;

  -- 2. Verificação de isolamento Multi-Tenant (Regra Obrigatória HUBI)
  IF NOT public.usuario_pertence_loja(p_loja_id) THEN
    RAISE EXCEPTION 'Acesso negado: operador não pertence a esta unidade.';
  END IF;

  -- 3. Verificação na Blacklist do Honeypot (se o schema security_audit estiver ativo)
  IF EXISTS (
    SELECT 1
    FROM information_schema.routines
    WHERE routine_schema = 'security_audit'
      AND routine_name = 'ator_esta_bloqueado'
  ) THEN
    IF security_audit.ator_esta_bloqueado() THEN
      RAISE EXCEPTION 'Sessão bloqueada por violação de segurança.';
    END IF;
  END IF;

  -- 4. Regra de negócio executada 100% no servidor
  IF p_desconto < 0 OR p_desconto > p_valor_bruto THEN
    RAISE EXCEPTION 'Desconto inválido para a operação.';
  END IF;

  v_valor_liquido := ROUND(p_valor_bruto - p_desconto, 2);

  RETURN jsonb_build_object(
    'sucesso', true,
    'loja_id', p_loja_id,
    'valor_liquido', v_valor_liquido,
    'processado_em', now()
  );
END;
$$;
