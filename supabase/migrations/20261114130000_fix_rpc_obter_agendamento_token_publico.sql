-- =============================================================================
-- MIGRATION: 20261114130000_fix_rpc_obter_agendamento_token_publico.sql
-- Corrige erro HTTP 400 na RPC pública obter_agendamento_por_token_publico
-- removendo referência inexistente a usuarios_loja.nome, utilizando apenas
-- colunas reais do schema e retornando os campos completos da página pública.
-- Garante também permissões de execução para as RPCs públicas de agendamento.
-- =============================================================================

DROP FUNCTION IF EXISTS public.obter_agendamento_por_token_publico(UUID);
DROP FUNCTION IF EXISTS public.obter_agendamento_por_token_publico(TEXT);

CREATE OR REPLACE FUNCTION public.obter_agendamento_por_token_publico(p_token TEXT)
RETURNS TABLE (
  id UUID,
  loja_id UUID,
  loja_nome VARCHAR,
  loja_whatsapp VARCHAR,
  loja_slug VARCHAR,
  loja_logo TEXT,
  cor_primaria VARCHAR,
  endereco_completo TEXT,
  pedido_id UUID,
  produto_id UUID,
  produto_nome VARCHAR,
  servico_nome VARCHAR,
  duracao_minutos INTEGER,
  duracao_estimada_minutos INTEGER,
  preco_venda_varejo NUMERIC,
  profissional_id UUID,
  profissional_nome VARCHAR,
  especialidade_cargo VARCHAR,
  cliente_id UUID,
  cliente_nome VARCHAR,
  cliente_whatsapp VARCHAR,
  data_agendamento DATE,
  hora_inicio TIME,
  hora_fim TIME,
  data_hora_inicio TIMESTAMPTZ,
  data_hora_fim TIMESTAMPTZ,
  modalidade_local VARCHAR,
  endereco_prestacao_snapshot TEXT,
  status_agendamento VARCHAR,
  token_confirmacao UUID,
  lembrete_enviado BOOLEAN,
  confirmado_pelo_cliente_em TIMESTAMPTZ,
  cancelado_em TIMESTAMPTZ,
  motivo_cancelamento TEXT,
  qtd_remarcacoes INTEGER,
  limite_remarcacoes_cliente INTEGER,
  antecedencia_minima_remarcacao_horas INTEGER,
  data_hora_anterior TIMESTAMPTZ,
  remarcado_em TIMESTAMPTZ,
  observacoes TEXT,
  criado_em TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token_uuid UUID;
BEGIN
  IF p_token IS NULL OR TRIM(p_token) = '' THEN
    RETURN;
  END IF;

  BEGIN
    v_token_uuid := TRIM(p_token)::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN;
  END;

  RETURN QUERY
  SELECT
    a.id,
    a.loja_id,
    l.nome_fantasia::VARCHAR AS loja_nome,
    l.whatsapp::VARCHAR AS loja_whatsapp,
    l.slug_catalogo::VARCHAR AS loja_slug,
    l.url_logo::TEXT AS loja_logo,
    l.cor_primaria::VARCHAR AS cor_primaria,
    NULLIF(
      CONCAT_WS(
        ', ',
        NULLIF(TRIM(l.endereco_logradouro), ''),
        NULLIF(TRIM(l.endereco_numero), ''),
        NULLIF(TRIM(l.endereco_bairro), ''),
        NULLIF(TRIM(l.endereco_cidade), ''),
        NULLIF(TRIM(l.endereco_estado), '')
      ),
      ''
    )::TEXT AS endereco_completo,
    a.pedido_id,
    a.produto_id,
    COALESCE(p.nome, 'Serviço Agendado')::VARCHAR AS produto_nome,
    COALESCE(p.nome, 'Serviço Agendado')::VARCHAR AS servico_nome,
    COALESCE(sp.duracao_customizada_minutos, p.duracao_estimada_minutos, 30)::INTEGER AS duracao_minutos,
    COALESCE(sp.duracao_customizada_minutos, p.duracao_estimada_minutos, 30)::INTEGER AS duracao_estimada_minutos,
    COALESCE(p.preco_venda_varejo, 0)::NUMERIC AS preco_venda_varejo,
    a.profissional_id,
    COALESCE(NULLIF(TRIM(u.nome_completo), ''), 'Profissional')::VARCHAR AS profissional_nome,
    u.especialidade_cargo::VARCHAR,
    a.cliente_id,
    a.cliente_nome,
    a.cliente_whatsapp,
    a.data_agendamento,
    a.hora_inicio,
    a.hora_fim,
    a.data_hora_inicio,
    a.data_hora_fim,
    a.modalidade_local::VARCHAR,
    a.endereco_prestacao_snapshot,
    a.status_agendamento::VARCHAR,
    a.token_confirmacao,
    a.lembrete_enviado,
    a.confirmado_pelo_cliente_em,
    a.cancelado_em,
    a.motivo_cancelamento,
    a.qtd_remarcacoes,
    l.limite_remarcacoes_cliente,
    l.antecedencia_minima_remarcacao_horas,
    a.data_hora_anterior,
    a.remarcado_em,
    a.observacoes,
    a.criado_em
  FROM public.agendamentos_servicos a
  JOIN public.lojas l ON l.id = a.loja_id
  LEFT JOIN public.produtos p ON p.id = a.produto_id
  LEFT JOIN public.usuarios_loja u ON u.id = a.profissional_id
  LEFT JOIN public.servico_profissionais sp
    ON sp.loja_id = a.loja_id
   AND sp.produto_id = a.produto_id
   AND sp.usuario_id = a.profissional_id
   AND sp.ativo = TRUE
  WHERE a.token_confirmacao = v_token_uuid
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.obter_agendamento_por_token_publico(TEXT) IS
  'Carrega os detalhes completos do agendamento para a página pública do cliente via token opaco sem expor colunas inexistentes.';

GRANT EXECUTE ON FUNCTION public.obter_agendamento_por_token_publico(TEXT) TO PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.processar_acao_cliente_agendamento(UUID, VARCHAR, DATE, TIME, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obter_horarios_ocupados_profissional(UUID, UUID, DATE) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
