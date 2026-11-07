-- =============================================================================
-- MIGRATION: 20261107_modulo_agendamento_servicos.sql
-- Módulo de Agendamento de Serviços Omnichannel do HUBI (Etapa 1 - Fundação de Dados)
-- Diretrizes: 100% Relacional, RLS Blindado, Multi-Tenant, Zero-JSONB e pt-BR
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Evolução da Tabela public.produtos
-- -----------------------------------------------------------------------------
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS requer_agendamento BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS duracao_estimada_minutos INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS local_prestacao_servico VARCHAR(20) NOT NULL DEFAULT 'loja';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_produtos_local_prestacao_servico'
  ) THEN
    ALTER TABLE public.produtos
      ADD CONSTRAINT chk_produtos_local_prestacao_servico
      CHECK (local_prestacao_servico IN ('loja', 'externo', 'ambos'));
  END IF;
END $$;

COMMENT ON COLUMN public.produtos.requer_agendamento IS 'Indica se o item exige reserva prévia de data/hora na agenda';
COMMENT ON COLUMN public.produtos.duracao_estimada_minutos IS 'Duração padrão estimada do serviço em minutos para montagem da grade de horários';
COMMENT ON COLUMN public.produtos.local_prestacao_servico IS 'Onde o serviço pode ser executado: loja, externo (domicílio/empresa) ou ambos';

CREATE INDEX IF NOT EXISTS idx_produtos_requer_agendamento
  ON public.produtos(loja_id, requer_agendamento)
  WHERE requer_agendamento = TRUE;

-- -----------------------------------------------------------------------------
-- 2. Evolução da Tabela public.usuarios_loja
-- -----------------------------------------------------------------------------
ALTER TABLE public.usuarios_loja
  ADD COLUMN IF NOT EXISTS presta_servicos BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS especialidade_cargo VARCHAR(100) NULL;

COMMENT ON COLUMN public.usuarios_loja.presta_servicos IS 'Indica se o colaborador atua como profissional/prestador na agenda de serviços';
COMMENT ON COLUMN public.usuarios_loja.especialidade_cargo IS 'Título profissional ou especialidade visível ao cliente (ex: Barbeiro Master, Manicure, Mecânico)';

CREATE INDEX IF NOT EXISTS idx_usuarios_loja_presta_servicos
  ON public.usuarios_loja(loja_id, presta_servicos)
  WHERE presta_servicos = TRUE;

-- -----------------------------------------------------------------------------
-- 3. Evolução da Tabela public.lojas (Parâmetros de Agenda e Gatilhos WhatsApp)
-- -----------------------------------------------------------------------------
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS wpp_auto_agendamento_criado BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS wpp_auto_lembrete_agendamento BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS antecedencia_lembrete_horas INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS limite_remarcacoes_cliente INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS antecedencia_minima_remarcacao_horas INTEGER NOT NULL DEFAULT 2;

COMMENT ON COLUMN public.lojas.wpp_auto_agendamento_criado IS 'Disparo automático de WhatsApp com comprovante e link de gestão ao criar agendamento';
COMMENT ON COLUMN public.lojas.wpp_auto_lembrete_agendamento IS 'Disparo automático de WhatsApp de lembrete com antecedência configurada';
COMMENT ON COLUMN public.lojas.antecedencia_lembrete_horas IS 'Quantas horas antes do horário o lembrete de agendamento deve ser disparado';
COMMENT ON COLUMN public.lojas.limite_remarcacoes_cliente IS 'Limite máximo de remarcações permitidas diretamente pelo cliente via link público';
COMMENT ON COLUMN public.lojas.antecedencia_minima_remarcacao_horas IS 'Antecedência mínima em horas exigida para o cliente poder remarcar seu agendamento';

-- -----------------------------------------------------------------------------
-- 4. Nova Tabela public.servico_profissionais (Vínculo Serviço <-> Funcionário)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.servico_profissionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios_loja(id) ON DELETE CASCADE,
  duracao_customizada_minutos INTEGER NULL,
  comissao_percentual NUMERIC(5,2) NULL DEFAULT 0.00,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_servico_profissionais UNIQUE (loja_id, produto_id, usuario_id)
);

COMMENT ON TABLE public.servico_profissionais IS 'Associação explícita de colaboradores habilitados a executar determinado serviço da loja';
COMMENT ON COLUMN public.servico_profissionais.duracao_customizada_minutos IS 'Sobrescreve a duração padrão do produto para este profissional específico, se preenchido';
COMMENT ON COLUMN public.servico_profissionais.comissao_percentual IS 'Percentual de comissão padrão do colaborador na execução deste serviço';

CREATE INDEX IF NOT EXISTS idx_servico_profissionais_loja ON public.servico_profissionais(loja_id);
CREATE INDEX IF NOT EXISTS idx_servico_profissionais_produto ON public.servico_profissionais(produto_id);
CREATE INDEX IF NOT EXISTS idx_servico_profissionais_usuario ON public.servico_profissionais(usuario_id);
CREATE INDEX IF NOT EXISTS idx_servico_profissionais_ativo ON public.servico_profissionais(loja_id, produto_id, ativo) WHERE ativo = TRUE;

-- -----------------------------------------------------------------------------
-- 5. Nova Tabela public.profissional_horarios (Grade de Expediente por Dia da Semana)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profissional_horarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios_loja(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  hora_inicio TIME NOT NULL DEFAULT '08:00',
  hora_fim TIME NOT NULL DEFAULT '18:00',
  tem_intervalo BOOLEAN NOT NULL DEFAULT TRUE,
  intervalo_inicio TIME NULL DEFAULT '12:00',
  intervalo_fim TIME NULL DEFAULT '13:00',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_profissional_horarios UNIQUE (loja_id, usuario_id, dia_semana)
);

COMMENT ON TABLE public.profissional_horarios IS 'Configuração de dias e faixas de expediente de trabalho de cada prestador de serviços';
COMMENT ON COLUMN public.profissional_horarios.dia_semana IS 'Dia da semana ISO/PostgreSQL: 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado';

CREATE INDEX IF NOT EXISTS idx_profissional_horarios_busca
  ON public.profissional_horarios(loja_id, usuario_id, dia_semana, ativo);

-- Trigger de updated_at para profissional_horarios
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'fn_atualizar_timestamp_modificacao'
  ) THEN
    DROP TRIGGER IF EXISTS trg_profissional_horarios_updated_at ON public.profissional_horarios;
    CREATE TRIGGER trg_profissional_horarios_updated_at
      BEFORE UPDATE ON public.profissional_horarios
      FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp_modificacao();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 6. Nova Tabela public.agendamentos_servicos (Agenda Operacional)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agendamentos_servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  pedido_id UUID NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  item_pedido_id UUID NULL REFERENCES public.itens_pedido(id) ON DELETE SET NULL,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  profissional_id UUID NOT NULL REFERENCES public.usuarios_loja(id) ON DELETE RESTRICT,
  cliente_id UUID NULL REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome VARCHAR(150) NOT NULL,
  cliente_whatsapp VARCHAR(25) NOT NULL,
  data_agendamento DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  data_hora_inicio TIMESTAMPTZ NOT NULL,
  data_hora_fim TIMESTAMPTZ NOT NULL,
  modalidade_local VARCHAR(20) NOT NULL DEFAULT 'loja' CHECK (modalidade_local IN ('loja', 'externo')),
  cliente_endereco_id UUID NULL REFERENCES public.cliente_enderecos(id) ON DELETE SET NULL,
  endereco_prestacao_snapshot TEXT NULL,
  status_agendamento VARCHAR(30) NOT NULL DEFAULT 'agendado' CHECK (status_agendamento IN ('agendado', 'confirmado', 'em_atendimento', 'concluido', 'cancelado', 'nao_compareceu')),
  token_confirmacao UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  lembrete_enviado BOOLEAN NOT NULL DEFAULT FALSE,
  lembrete_enviado_em TIMESTAMPTZ NULL,
  confirmado_pelo_cliente_em TIMESTAMPTZ NULL,
  cancelado_em TIMESTAMPTZ NULL,
  motivo_cancelamento TEXT NULL,
  qtd_remarcacoes INTEGER NOT NULL DEFAULT 0,
  data_hora_anterior TIMESTAMPTZ NULL,
  remarcado_em TIMESTAMPTZ NULL,
  observacoes TEXT NULL,
  criado_por_usuario_id UUID NULL REFERENCES public.usuarios_loja(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.agendamentos_servicos IS 'Registro operacional de reservas e atendimentos de serviços agendados no PDV ou Catálogo';
COMMENT ON COLUMN public.agendamentos_servicos.token_confirmacao IS 'Identificador UUID opaco e único para link público de confirmação, cancelamento e remarcação';
COMMENT ON COLUMN public.agendamentos_servicos.endereco_prestacao_snapshot IS 'Snapshot imutável do endereço completo quando a prestação for em modalidade externa';

-- Índices de Alta Performance para Agenda Operacional
CREATE INDEX IF NOT EXISTS idx_agendamentos_busca_operacional
  ON public.agendamentos_servicos(loja_id, profissional_id, data_agendamento, status_agendamento);

CREATE INDEX IF NOT EXISTS idx_agendamentos_token_confirmacao
  ON public.agendamentos_servicos(token_confirmacao);

CREATE INDEX IF NOT EXISTS idx_agendamentos_pedido
  ON public.agendamentos_servicos(pedido_id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente
  ON public.agendamentos_servicos(cliente_id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_data_hora_inicio
  ON public.agendamentos_servicos(loja_id, data_hora_inicio);

CREATE INDEX IF NOT EXISTS idx_agendamentos_lembrete_pendente
  ON public.agendamentos_servicos(status_agendamento, lembrete_enviado, data_hora_inicio)
  WHERE lembrete_enviado = FALSE AND status_agendamento IN ('agendado', 'confirmado');

-- Trigger de updated_at para agendamentos_servicos
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'fn_atualizar_timestamp_modificacao'
  ) THEN
    DROP TRIGGER IF EXISTS trg_agendamentos_servicos_updated_at ON public.agendamentos_servicos;
    CREATE TRIGGER trg_agendamentos_servicos_updated_at
      BEFORE UPDATE ON public.agendamentos_servicos
      FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp_modificacao();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 7. Políticas de Segurança RLS (Row Level Security)
-- -----------------------------------------------------------------------------

-- 7.1. public.servico_profissionais
ALTER TABLE public.servico_profissionais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "servico_profissionais_loja_select_policy" ON public.servico_profissionais;
CREATE POLICY "servico_profissionais_loja_select_policy" ON public.servico_profissionais
  FOR SELECT
  USING (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "servico_profissionais_loja_insert_policy" ON public.servico_profissionais;
CREATE POLICY "servico_profissionais_loja_insert_policy" ON public.servico_profissionais
  FOR INSERT
  WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "servico_profissionais_loja_update_policy" ON public.servico_profissionais;
CREATE POLICY "servico_profissionais_loja_update_policy" ON public.servico_profissionais
  FOR UPDATE
  USING (public.usuario_pertence_loja(loja_id))
  WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "servico_profissionais_loja_delete_policy" ON public.servico_profissionais;
CREATE POLICY "servico_profissionais_loja_delete_policy" ON public.servico_profissionais
  FOR DELETE
  USING (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "servico_profissionais_public_select_policy" ON public.servico_profissionais;
CREATE POLICY "servico_profissionais_public_select_policy" ON public.servico_profissionais
  FOR SELECT
  TO anon, authenticated
  USING (ativo = TRUE);

-- 7.2. public.profissional_horarios
ALTER TABLE public.profissional_horarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profissional_horarios_loja_select_policy" ON public.profissional_horarios;
CREATE POLICY "profissional_horarios_loja_select_policy" ON public.profissional_horarios
  FOR SELECT
  USING (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "profissional_horarios_loja_insert_policy" ON public.profissional_horarios;
CREATE POLICY "profissional_horarios_loja_insert_policy" ON public.profissional_horarios
  FOR INSERT
  WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "profissional_horarios_loja_update_policy" ON public.profissional_horarios;
CREATE POLICY "profissional_horarios_loja_update_policy" ON public.profissional_horarios
  FOR UPDATE
  USING (public.usuario_pertence_loja(loja_id))
  WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "profissional_horarios_loja_delete_policy" ON public.profissional_horarios;
CREATE POLICY "profissional_horarios_loja_delete_policy" ON public.profissional_horarios
  FOR DELETE
  USING (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "profissional_horarios_public_select_policy" ON public.profissional_horarios;
CREATE POLICY "profissional_horarios_public_select_policy" ON public.profissional_horarios
  FOR SELECT
  TO anon, authenticated
  USING (ativo = TRUE);

-- 7.3. public.agendamentos_servicos
ALTER TABLE public.agendamentos_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agendamentos_servicos_loja_select_policy" ON public.agendamentos_servicos;
CREATE POLICY "agendamentos_servicos_loja_select_policy" ON public.agendamentos_servicos
  FOR SELECT
  USING (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "agendamentos_servicos_loja_insert_policy" ON public.agendamentos_servicos;
CREATE POLICY "agendamentos_servicos_loja_insert_policy" ON public.agendamentos_servicos
  FOR INSERT
  WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "agendamentos_servicos_loja_update_policy" ON public.agendamentos_servicos;
CREATE POLICY "agendamentos_servicos_loja_update_policy" ON public.agendamentos_servicos
  FOR UPDATE
  USING (public.usuario_pertence_loja(loja_id))
  WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "agendamentos_servicos_loja_delete_policy" ON public.agendamentos_servicos;
CREATE POLICY "agendamentos_servicos_loja_delete_policy" ON public.agendamentos_servicos
  FOR DELETE
  USING (public.usuario_pertence_loja(loja_id));

-- Inserção pública permitida para clientes criando pedido/agendamento no Catálogo Online
DROP POLICY IF EXISTS "agendamentos_servicos_public_insert_policy" ON public.agendamentos_servicos;
CREATE POLICY "agendamentos_servicos_public_insert_policy" ON public.agendamentos_servicos
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 8. Funções RPC Security Definer (Blindagem PII e Operação Omnichannel)
-- -----------------------------------------------------------------------------

-- 8.1. Obter horários ocupados do profissional em uma data específica
-- (Retorna estritamente as faixas de tempo, sem vazar nomes ou dados de outros clientes)
CREATE OR REPLACE FUNCTION public.obter_horarios_ocupados_profissional(
  p_loja_id UUID,
  p_profissional_id UUID,
  p_data DATE
)
RETURNS TABLE (
  hora_inicio TIME,
  hora_fim TIME
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.hora_inicio,
    a.hora_fim
  FROM public.agendamentos_servicos a
  WHERE a.loja_id = p_loja_id
    AND a.profissional_id = p_profissional_id
    AND a.data_agendamento = p_data
    AND a.status_agendamento NOT IN ('cancelado', 'nao_compareceu')
  ORDER BY a.hora_inicio ASC;
END;
$$;

COMMENT ON FUNCTION public.obter_horarios_ocupados_profissional IS 'Consulta horários bloqueados de um profissional em uma data sem vazar PII para catálogo público';

REVOKE ALL ON FUNCTION public.obter_horarios_ocupados_profissional(UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obter_horarios_ocupados_profissional(UUID, UUID, DATE) TO anon, authenticated, service_role;

-- 8.2. Obter detalhes do agendamento por Token Público
CREATE OR REPLACE FUNCTION public.obter_agendamento_por_token_publico(p_token UUID)
RETURNS TABLE (
  id UUID,
  loja_id UUID,
  loja_nome VARCHAR,
  loja_whatsapp VARCHAR,
  loja_slug VARCHAR,
  pedido_id UUID,
  produto_id UUID,
  produto_nome VARCHAR,
  duracao_minutos INTEGER,
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
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.loja_id,
    l.nome_fantasia::VARCHAR AS loja_nome,
    l.whatsapp::VARCHAR AS loja_whatsapp,
    l.slug_catalogo::VARCHAR AS loja_slug,
    a.pedido_id,
    a.produto_id,
    p.nome::VARCHAR AS produto_nome,
    COALESCE(sp.duracao_customizada_minutos, p.duracao_estimada_minutos, 30)::INTEGER AS duracao_minutos,
    p.preco_venda_varejo::NUMERIC,
    a.profissional_id,
    COALESCE(u.nome_completo, u.nome, 'Profissional')::VARCHAR AS profissional_nome,
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
  JOIN public.produtos p ON p.id = a.produto_id
  JOIN public.usuarios_loja u ON u.id = a.profissional_id
  LEFT JOIN public.servico_profissionais sp 
    ON sp.loja_id = a.loja_id 
   AND sp.produto_id = a.produto_id 
   AND sp.usuario_id = a.profissional_id
  WHERE a.token_confirmacao = p_token
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.obter_agendamento_por_token_publico IS 'Carrega os detalhes completos do agendamento para a página pública do cliente via UUID v4 opaco';

REVOKE ALL ON FUNCTION public.obter_agendamento_por_token_publico(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obter_agendamento_por_token_publico(UUID) TO anon, authenticated, service_role;

-- 8.3. Processar Ação do Cliente (Confirmar, Cancelar ou Remarcar)
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
AS $$
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
  v_intervalo_antecedencia INTERVAL;
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

  -- 3. Verificar status do agendamento
  IF v_agendamento.status_agendamento IN ('cancelado', 'nao_compareceu') THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'STATUS_INVALIDO',
      'mensagem', 'Este agendamento já se encontra cancelado ou marcado como não comparecido.'
    );
  END IF;

  IF v_agendamento.status_agendamento = 'concluido' THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'STATUS_INVALIDO',
      'mensagem', 'Este agendamento já foi concluído e não pode sofrer alterações.'
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

    -- Validação de antecedência mínima de remarcação
    v_intervalo_antecedencia := (COALESCE(v_loja.antecedencia_minima_remarcacao_horas, 2) || ' hours')::INTERVAL;
    IF NOW() + v_intervalo_antecedencia > v_agendamento.data_hora_inicio THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'ANTECEDENCIA_INSUFICIENTE',
        'mensagem', format('A remarcação deve ser feita com no mínimo %s hora(s) de antecedência do horário agendado.', COALESCE(v_loja.antecedencia_minima_remarcacao_horas, 2))
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

    -- Montagem dos timestamps
    v_nova_hora_fim := p_nova_hora_inicio + (v_duracao_minutos || ' minutes')::INTERVAL;
    v_nova_data_hora_inicio := (p_nova_data + p_nova_hora_inicio)::TIMESTAMPTZ;
    v_nova_data_hora_fim := v_nova_data_hora_inicio + (v_duracao_minutos || ' minutes')::INTERVAL;

    -- Não permitir agendar no passado
    IF v_nova_data_hora_inicio <= NOW() THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'codigo', 'DATA_PASSADA',
        'mensagem', 'A nova data e horário devem ser no futuro.'
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

    -- Atualizar agendamento atomicamente
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
$$;

COMMENT ON FUNCTION public.processar_acao_cliente_agendamento IS 'Processa atomicamente confirmação, cancelamento ou remarcação pública pelo cliente com blindagem de regras comerciais';

REVOKE ALL ON FUNCTION public.processar_acao_cliente_agendamento(UUID, VARCHAR, DATE, TIME, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.processar_acao_cliente_agendamento(UUID, VARCHAR, DATE, TIME, UUID, TEXT) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. Notificar PostgREST para Recarregar Schema Cache Imediatamente
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
