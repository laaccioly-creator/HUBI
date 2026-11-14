-- ============================================================================
-- Migration: Correção da Regra de Antecedência e Fuso Horário (-03:00) na RPC
--            public.processar_acao_cliente_agendamento
-- Data: 2026-11-14
-- Escopo: Peixinho 01/02
-- ============================================================================

CREATE OR REPLACE FUNCTION public.processar_acao_cliente_agendamento(
  p_token UUID,
  p_acao VARCHAR,
  p_nova_data DATE DEFAULT NULL,
  p_nova_hora_inicio TIME DEFAULT NULL,
  p_novo_profissional_id UUID DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_agendamento RECORD;
  v_loja RECORD;
  v_duracao_minutos INTEGER;
  v_nova_hora_fim TIME;
  v_nova_data_hora_inicio TIMESTAMPTZ;
  v_nova_data_hora_fim TIMESTAMPTZ;
  v_novo_profissional_id UUID;
  v_grade_horario RECORD;
  v_tem_conflito BOOLEAN := FALSE;
  v_antecedencia_horas INTEGER := 2;
BEGIN
  -- 1. Localização e bloqueio do agendamento para operação atômica
  SELECT *
  INTO v_agendamento
  FROM public.agendamentos_servicos
  WHERE token_confirmacao = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'NAO_ENCONTRADO',
      'mensagem', 'Agendamento não encontrado com o token fornecido.'
    );
  END IF;

  -- 2. Carregar parâmetros de agendamento da loja
  SELECT *
  INTO v_loja
  FROM public.lojas
  WHERE id = v_agendamento.loja_id;

  v_antecedencia_horas := COALESCE(v_loja.antecedencia_minima_remarcacao_horas, 2);

  -- 3. Verificar status do agendamento
  IF v_agendamento.status_agendamento IN ('cancelado', 'nao_compareceu') THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'STATUS_INVALIDO',
      'mensagem', 'Este agendamento já se encontra cancelado ou marcado como não comparecido.'
    );
  END IF;

  IF v_agendamento.status_agendamento IN ('concluido', 'em_atendimento') THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'STATUS_INVALIDO',
      'mensagem', 'Este agendamento já foi concluído ou está em atendimento e não pode sofrer alterações.'
    );
  END IF;

  -- 4. AÇÃO: CONFIRMAR
  IF LOWER(p_acao) = 'confirmar' THEN
    IF v_agendamento.status_agendamento = 'confirmado' THEN
      RETURN jsonb_build_object(
        'sucesso', true,
        'mensagem', 'O agendamento já se encontra confirmado.',
        'status', 'confirmado'
      );
    END IF;

    UPDATE public.agendamentos_servicos
    SET
      status_agendamento = 'confirmado',
      confirmado_pelo_cliente_em = NOW(),
      atualizado_em = NOW()
    WHERE id = v_agendamento.id;

    -- Auditoria defensiva em historico_pedidos se vinculado a um pedido
    IF v_agendamento.pedido_id IS NOT NULL THEN
      BEGIN
        INSERT INTO public.historico_pedidos (
          loja_id,
          pedido_id,
          usuario_id,
          tipo_evento,
          status_anterior,
          status_novo,
          descricao,
          criado_em
        ) VALUES (
          v_agendamento.loja_id,
          v_agendamento.pedido_id,
          NULL,
          'atualizacao',
          v_agendamento.status_agendamento,
          'confirmado',
          'Agendamento confirmado diretamente pelo cliente via link público.',
          NOW()
        );
      EXCEPTION WHEN OTHERS THEN
        NULL; -- Não interromper a confirmação por falha secundária de log
      END;
    END IF;

    RETURN jsonb_build_object(
      'sucesso', true,
      'mensagem', 'Agendamento confirmado com sucesso!',
      'status', 'confirmado'
    );

  -- 5. AÇÃO: CANCELAR
  ELSIF LOWER(p_acao) = 'cancelar' THEN
    UPDATE public.agendamentos_servicos
    SET
      status_agendamento = 'cancelado',
      cancelado_em = NOW(),
      motivo_cancelamento = COALESCE(p_motivo, 'Cancelado pelo cliente via página pública de agendamento'),
      atualizado_em = NOW()
    WHERE id = v_agendamento.id;

    -- Auditoria defensiva em historico_pedidos se vinculado a um pedido
    IF v_agendamento.pedido_id IS NOT NULL THEN
      BEGIN
        INSERT INTO public.historico_pedidos (
          loja_id,
          pedido_id,
          usuario_id,
          tipo_evento,
          status_anterior,
          status_novo,
          descricao,
          motivo,
          criado_em
        ) VALUES (
          v_agendamento.loja_id,
          v_agendamento.pedido_id,
          NULL,
          'atualizacao',
          v_agendamento.status_agendamento,
          'cancelado',
          'Agendamento cancelado pelo cliente via página pública.',
          p_motivo,
          NOW()
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    RETURN jsonb_build_object(
      'sucesso', true,
      'mensagem', 'Agendamento cancelado com sucesso.',
      'status', 'cancelado'
    );

  -- 6. AÇÃO: REMARCAR
  ELSIF LOWER(p_acao) = 'remarcar' THEN
    -- Validação de parâmetros obrigatórios
    IF p_nova_data IS NULL OR p_nova_hora_inicio IS NULL THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'PARAMETROS_INVALIDOS',
        'mensagem', 'Por favor, informe a nova data e o horário desejado para a remarcação.'
      );
    END IF;

    -- Validação do limite de remarcações pelo cliente
    IF v_agendamento.qtd_remarcacoes >= COALESCE(v_loja.limite_remarcacoes_cliente, 2) THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'LIMITE_REMARCACOES_ATINGIDO',
        'mensagem', format('Você atingiu o limite de %s remarcação(ões) permitida(s) para este agendamento. Por favor, entre em contato diretamente com a loja.', COALESCE(v_loja.limite_remarcacoes_cliente, 2))
      );
    END IF;

    -- Determinar profissional (mantém o atual se não informado)
    v_novo_profissional_id := COALESCE(p_novo_profissional_id, v_agendamento.profissional_id);

    -- Duração estimada do serviço para este profissional
    SELECT COALESCE(sp.duracao_customizada_minutos, p.duracao_estimada_minutos, 30)
    INTO v_duracao_minutos
    FROM public.produtos p
    LEFT JOIN public.servico_profissionais sp
      ON sp.loja_id = v_agendamento.loja_id
     AND sp.produto_id = p.id
     AND sp.usuario_id = v_novo_profissional_id
     AND sp.ativo = TRUE
    WHERE p.id = v_agendamento.produto_id;

    IF v_duracao_minutos IS NULL THEN
      v_duracao_minutos := 30;
    END IF;

    -- Montagem dos timestamps no fuso horário brasileiro (-03:00 / America/Sao_Paulo)
    v_nova_hora_fim := p_nova_hora_inicio + (v_duracao_minutos || ' minutes')::INTERVAL;
    v_nova_data_hora_inicio := (p_nova_data::TEXT || ' ' || p_nova_hora_inicio::TEXT || '-03:00')::TIMESTAMPTZ;
    v_nova_data_hora_fim := v_nova_data_hora_inicio + (v_duracao_minutos || ' minutes')::INTERVAL;

    -- Não permitir remarcar para o passado
    IF v_nova_data_hora_inicio <= NOW() THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'DATA_PASSADA',
        'mensagem', 'A nova data e horário devem ser no futuro.'
      );
    END IF;

    -- Validar antecedência mínima contra o NOVO horário escolhido em relação a NOW()
    IF v_nova_data_hora_inicio < (NOW() + (COALESCE(v_antecedencia_horas, 0) || ' hours')::INTERVAL) THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'ANTECEDENCIA_INSUFICIENTE',
        'mensagem', format(
          'O novo horário escolhido deve ter no mínimo %s hora(s) de antecedência em relação ao horário atual.',
          COALESCE(v_antecedencia_horas, 0)
        )
      );
    END IF;

    -- Validar expediente de trabalho do profissional no dia da semana
    SELECT *
    INTO v_grade_horario
    FROM public.profissional_horarios
    WHERE loja_id = v_agendamento.loja_id
      AND usuario_id = v_novo_profissional_id
      AND dia_semana = EXTRACT(DOW FROM p_nova_data)::SMALLINT
      AND ativo = TRUE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'PROFISSIONAL_SEM_EXPEDIENTE',
        'mensagem', 'O profissional não atende no dia da semana selecionado.'
      );
    END IF;

    -- Verificar limites de expediente
    IF p_nova_hora_inicio < v_grade_horario.hora_inicio OR v_nova_hora_fim > v_grade_horario.hora_fim THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'FORA_DO_EXPEDIENTE',
        'mensagem', format('O horário selecionado está fora do expediente de atendimento (%s às %s).', to_char(v_grade_horario.hora_inicio, 'HH24:MI'), to_char(v_grade_horario.hora_fim, 'HH24:MI'))
      );
    END IF;

    -- Verificar intervalo de almoço/descanso
    IF v_grade_horario.tem_intervalo
       AND v_grade_horario.intervalo_inicio IS NOT NULL
       AND v_grade_horario.intervalo_fim IS NOT NULL THEN
      IF (p_nova_hora_inicio < v_grade_horario.intervalo_fim AND v_nova_hora_fim > v_grade_horario.intervalo_inicio) THEN
        RETURN jsonb_build_object(
          'sucesso', false,
          'codigo', 'HORARIO_EM_INTERVALO',
          'mensagem', format('O horário solicitado coincide com o intervalo de descanso do profissional (%s às %s).', to_char(v_grade_horario.intervalo_inicio, 'HH24:MI'), to_char(v_grade_horario.intervalo_fim, 'HH24:MI'))
        );
      END IF;
    END IF;

    -- Verificar conflitos com outros agendamentos do profissional
    SELECT EXISTS (
      SELECT 1 FROM public.agendamentos_servicos
      WHERE loja_id = v_agendamento.loja_id
        AND profissional_id = v_novo_profissional_id
        AND data_agendamento = p_nova_data
        AND id <> v_agendamento.id
        AND status_agendamento NOT IN ('cancelado', 'nao_compareceu')
        AND (hora_inicio < v_nova_hora_fim AND hora_fim > p_nova_hora_inicio)
    ) INTO v_tem_conflito;

    IF v_tem_conflito THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'CONFLITO_HORARIO',
        'mensagem', 'O horário selecionado não está mais disponível para este profissional. Por favor, selecione outro horário.'
      );
    END IF;

    -- Atualizar agendamento atomicamente mantendo fuso horário -03:00
    UPDATE public.agendamentos_servicos
    SET
      data_hora_anterior = v_agendamento.data_hora_inicio,
      data_agendamento = p_nova_data,
      hora_inicio = p_nova_hora_inicio,
      hora_fim = v_nova_hora_fim,
      data_hora_inicio = v_nova_data_hora_inicio,
      data_hora_fim = v_nova_data_hora_fim,
      profissional_id = v_novo_profissional_id,
      qtd_remarcacoes = v_agendamento.qtd_remarcacoes + 1,
      remarcado_em = NOW(),
      status_agendamento = 'agendado',
      confirmado_pelo_cliente_em = NULL,
      lembrete_enviado = FALSE,
      lembrete_enviado_em = NULL,
      observacoes = CASE
        WHEN p_motivo IS NOT NULL AND TRIM(p_motivo) <> ''
        THEN COALESCE(v_agendamento.observacoes || E'\n', '') || '[Remarcação ' || (v_agendamento.qtd_remarcacoes + 1) || ']: ' || p_motivo
        ELSE v_agendamento.observacoes
      END,
      atualizado_em = NOW()
    WHERE id = v_agendamento.id;

    -- Auditoria defensiva em historico_pedidos se vinculado a um pedido
    IF v_agendamento.pedido_id IS NOT NULL THEN
      BEGIN
        INSERT INTO public.historico_pedidos (
          loja_id,
          pedido_id,
          usuario_id,
          tipo_evento,
          status_anterior,
          status_novo,
          descricao,
          motivo,
          criado_em
        ) VALUES (
          v_agendamento.loja_id,
          v_agendamento.pedido_id,
          NULL,
          'atualizacao',
          v_agendamento.status_agendamento,
          'agendado',
          format('Agendamento remarcado pelo cliente para %s às %s.', to_char(p_nova_data, 'DD/MM/YYYY'), to_char(p_nova_hora_inicio, 'HH24:MI')),
          p_motivo,
          NOW()
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    RETURN jsonb_build_object(
      'sucesso', true,
      'mensagem', 'Agendamento remarcado com sucesso!',
      'status', 'agendado',
      'nova_data', p_nova_data,
      'nova_hora_inicio', to_char(p_nova_hora_inicio, 'HH24:MI'),
      'nova_hora_fim', to_char(v_nova_hora_fim, 'HH24:MI'),
      'qtd_remarcacoes', v_agendamento.qtd_remarcacoes + 1
    );

  ELSE
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'ACAO_INVALIDA',
      'mensagem', format('Ação desconhecida: %s. Utilize "confirmar", "cancelar" ou "remarcar".', p_acao)
    );
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.processar_acao_cliente_agendamento(UUID, VARCHAR, DATE, TIME, UUID, TEXT)
  TO PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
