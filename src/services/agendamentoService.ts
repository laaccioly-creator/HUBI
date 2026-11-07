// =============================================================================
// SERVIÇO: agendamentoService.ts
// Motor Central de Agendamento de Serviços Omnichannel do HUBI
// =============================================================================

import { supabase } from '../lib/supabase';
import type {
  AgendamentoServico,
  ProfissionalHorario,
  ServicoProfissional,
  SlotHorarioDisponivel,
  HorarioOcupado,
  StatusAgendamento,
  DiaSemana,
  ModalidadeLocalPrestacao
} from '../types/agendamento';
import type { UsuarioLoja, Loja, Produto } from '../types';

/**
 * Converte string 'HH:MM' ou 'HH:MM:SS' para minutos a partir da meia-noite
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const partes = timeStr.split(':');
  const h = parseInt(partes[0] || '0', 10);
  const m = parseInt(partes[1] || '0', 10);
  return h * 60 + m;
}

/**
 * Converte minutos a partir da meia-noite para formato 'HH:MM'
 */
export function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hStr = h < 10 ? `0${h}` : `${h}`;
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${hStr}:${mStr}`;
}

/**
 * Formata data 'YYYY-MM-DD' para 'DD/MM/YYYY'
 */
export function formatarDataPtBr(dataStr: string): string {
  if (!dataStr) return '';
  const partes = dataStr.split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return dataStr;
}

export const agendamentoService = {
  /**
   * 1. Lista os colaboradores habilitados para prestar um serviço específico.
   * Se não houver vínculos cadastrados em servico_profissionais, faz fallback para
   * todos os colaboradores da loja com presta_servicos = true.
   */
  async listarProfissionaisHabilitadosPorServico(
    lojaId: string,
    produtoId: string
  ): Promise<UsuarioLoja[]> {
    // 1. Busca vínculos ativos específicos
    const { data: vinculos, error: vinculosErr } = await supabase
      .from('servico_profissionais')
      .select('usuario_id, usuarios_loja(*)')
      .eq('loja_id', lojaId)
      .eq('produto_id', produtoId)
      .eq('ativo', true);

    if (!vinculosErr && vinculos && vinculos.length > 0) {
      const usuarios = vinculos
        .map((v: any) => v.usuarios_loja)
        .filter((u: any) => u && u.ativo !== false) as UsuarioLoja[];

      if (usuarios.length > 0) {
        return usuarios;
      }
    }

    // 2. Fallback: Todos os colaboradores da loja que prestam serviços
    const { data: todosPrestadores, error: prestadoresErr } = await supabase
      .from('usuarios_loja')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('ativo', true)
      .eq('presta_servicos', true)
      .order('nome_completo', { ascending: true });

    if (prestadoresErr) {
      console.error('Erro ao listar prestadores de serviços fallback:', prestadoresErr);
      return [];
    }

    return (todosPrestadores as UsuarioLoja[]) || [];
  },

  /**
   * 2. Sincroniza os profissionais habilitados para determinado serviço
   */
  async salvarProfissionaisDoServico(
    lojaId: string,
    produtoId: string,
    usuariosIds: string[]
  ): Promise<void> {
    // Carregar vínculos existentes
    const { data: existentes, error: buscaErr } = await supabase
      .from('servico_profissionais')
      .select('id, usuario_id, ativo')
      .eq('loja_id', lojaId)
      .eq('produto_id', produtoId);

    if (buscaErr) {
      throw buscaErr;
    }

    const mapaExistentes = new Map<string, { id: string; ativo: boolean }>();
    (existentes || []).forEach((item) => {
      mapaExistentes.set(item.usuario_id, { id: item.id, ativo: item.ativo });
    });

    // 1. Ativar ou Inserir selecionados
    for (const usuarioId of usuariosIds) {
      if (mapaExistentes.has(usuarioId)) {
        const item = mapaExistentes.get(usuarioId)!;
        if (!item.ativo) {
          await supabase
            .from('servico_profissionais')
            .update({ ativo: true })
            .eq('id', item.id)
            .eq('loja_id', lojaId);
        }
      } else {
        await supabase
          .from('servico_profissionais')
          .insert([{
            loja_id: lojaId,
            produto_id: produtoId,
            usuario_id: usuarioId,
            ativo: true
          }]);
      }
    }

    // 2. Desativar os que não estão mais no array
    const setNovos = new Set(usuariosIds);
    for (const [usuarioId, item] of mapaExistentes.entries()) {
      if (!setNovos.has(usuarioId) && item.ativo) {
        await supabase
          .from('servico_profissionais')
          .update({ ativo: false })
          .eq('id', item.id)
          .eq('loja_id', lojaId);
      }
    }
  },

  /**
   * 3.1. Obtém o expediente semanal do profissional (7 dias, Dom=0 a Sáb=6).
   * Se não houver registro no banco, inicializa com expediente padrão:
   * Seg-Sex 08:00 às 18:00 (intervalo 12:00-13:00) e Sáb/Dom inativos.
   */
  async obterExpedienteProfissional(
    lojaId: string,
    usuarioId: string
  ): Promise<ProfissionalHorario[]> {
    const { data, error } = await supabase
      .from('profissional_horarios')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('usuario_id', usuarioId)
      .order('dia_semana', { ascending: true });

    if (error) {
      console.error('Erro ao obter expediente do profissional:', error);
      throw error;
    }

    const mapaDias = new Map<number, ProfissionalHorario>();
    (data || []).forEach((h) => {
      mapaDias.set(h.dia_semana, h as ProfissionalHorario);
    });

    const resultado: ProfissionalHorario[] = [];

    for (let d = 0; d <= 6; d++) {
      if (mapaDias.has(d)) {
        resultado.push(mapaDias.get(d)!);
      } else {
        // Padrão defensivo se ainda não configurado
        const ehDiaUtil = d >= 1 && d <= 5;
        resultado.push({
          id: `temp_${d}`,
          loja_id: lojaId,
          usuario_id: usuarioId,
          dia_semana: d as DiaSemana,
          ativo: ehDiaUtil,
          hora_inicio: '08:00',
          hora_fim: '18:00',
          tem_intervalo: ehDiaUtil,
          intervalo_inicio: '12:00',
          intervalo_fim: '13:00'
        });
      }
    }

    return resultado;
  },

  /**
   * 3.2. Salva o expediente semanal completo do colaborador
   */
  async salvarExpedienteProfissional(
    lojaId: string,
    usuarioId: string,
    horariosSemana: Partial<ProfissionalHorario>[]
  ): Promise<void> {
    for (const h of horariosSemana) {
      const diaSemana = Number(h.dia_semana) as DiaSemana;
      const payload = {
        loja_id: lojaId,
        usuario_id: usuarioId,
        dia_semana: diaSemana,
        ativo: Boolean(h.ativo),
        hora_inicio: h.hora_inicio || '08:00',
        hora_fim: h.hora_fim || '18:00',
        tem_intervalo: Boolean(h.tem_intervalo),
        intervalo_inicio: h.tem_intervalo ? (h.intervalo_inicio || '12:00') : null,
        intervalo_fim: h.tem_intervalo ? (h.intervalo_fim || '13:00') : null,
        atualizado_em: new Date().toISOString()
      };

      const { error } = await supabase
        .from('profissional_horarios')
        .upsert(payload, {
          onConflict: 'loja_id,usuario_id,dia_semana'
        });

      if (error) {
        throw error;
      }
    }
  },

  /**
   * 4. Motor de cálculo de slots de agendamento disponíveis.
   * Evita sobreposições de horários, respeita intervalo e oculta horários passados se a data for hoje.
   */
  async calcularSlotsDisponiveis(
    lojaId: string,
    produtoId: string,
    profissionalId: string,
    dataStr: string, // 'YYYY-MM-DD'
    duracaoMinutos: number,
    ignorarAgendamentoId?: string
  ): Promise<SlotHorarioDisponivel[]> {
    if (!lojaId || !profissionalId || !dataStr) {
      return [];
    }

    // Calcular dia da semana (0 = Domingo a 6 = Sábado)
    const [ano, mes, dia] = dataStr.split('-').map(Number);
    const dataRef = new Date(ano, mes - 1, dia);
    const diaSemana = dataRef.getDay() as DiaSemana;

    // 1. Obter expediente do colaborador para este dia
    const { data: expediente, error: expErr } = await supabase
      .from('profissional_horarios')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('usuario_id', profissionalId)
      .eq('dia_semana', diaSemana)
      .eq('ativo', true)
      .maybeSingle();

    if (expErr || !expediente) {
      return []; // Profissional não atende neste dia
    }

    // 2. Chamar RPC para obter agendamentos existentes na data (sem vazar PII)
    const { data: ocupadosData, error: rpcErr } = await supabase.rpc(
      'obter_horarios_ocupados_profissional',
      {
        p_loja_id: lojaId,
        p_profissional_id: profissionalId,
        p_data: dataStr
      }
    );

    if (rpcErr) {
      console.error('Erro na RPC obter_horarios_ocupados_profissional:', rpcErr);
      throw rpcErr;
    }

    const ocupados: HorarioOcupado[] = (ocupadosData as HorarioOcupado[]) || [];

    // 3. Montar faixas de bloqueio em minutos
    const faixasBloqueadas: Array<{ inicio: number; fim: number; motivo: string }> = [];

    // Intervalo de almoço/descanso
    if (expediente.tem_intervalo && expediente.intervalo_inicio && expediente.intervalo_fim) {
      faixasBloqueadas.push({
        inicio: timeStringToMinutes(expediente.intervalo_inicio),
        fim: timeStringToMinutes(expediente.intervalo_fim),
        motivo: 'Intervalo de descanso'
      });
    }

    // Agendamentos ocupados do dia
    ocupados.forEach((item) => {
      faixasBloqueadas.push({
        inicio: timeStringToMinutes(item.hora_inicio),
        fim: timeStringToMinutes(item.hora_fim),
        motivo: 'Horário já reservado'
      });
    });

    const inicioExpediente = timeStringToMinutes(expediente.hora_inicio);
    const fimExpediente = timeStringToMinutes(expediente.hora_fim);
    const duracaoEfetiva = Math.max(duracaoMinutos || 30, 10);

    // Passo de incremento de grade (ex: a cada 30 min ou pela duração do serviço se menor)
    const passoIncremento = Math.min(duracaoEfetiva, 30);

    // Verificação de horários passados caso a data seja hoje
    const agora = new Date();
    const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    const ehHoje = dataStr === hojeStr;
    const minutosAtuais = agora.getHours() * 60 + agora.getMinutes();

    const slots: SlotHorarioDisponivel[] = [];

    for (let slotInicio = inicioExpediente; slotInicio + duracaoEfetiva <= fimExpediente; slotInicio += passoIncremento) {
      const slotFim = slotInicio + duracaoEfetiva;
      const horaInicioStr = minutesToTimeString(slotInicio);
      const horaFimStr = minutesToTimeString(slotFim);

      // Checar se já passou do horário atual no dia de hoje (com margem de 10 min)
      if (ehHoje && slotInicio <= minutosAtuais + 10) {
        slots.push({
          hora_inicio: horaInicioStr,
          hora_fim: horaFimStr,
          disponivel: false,
          motivo_indisponibilidade: 'Horário indisponível (já decorrido)'
        });
        continue;
      }

      // Checar sobreposição com intervalos ou outros agendamentos
      const conflito = faixasBloqueadas.find((bloqueio) => {
        return slotInicio < bloqueio.fim && slotFim > bloqueio.inicio;
      });

      if (conflito) {
        slots.push({
          hora_inicio: horaInicioStr,
          hora_fim: horaFimStr,
          disponivel: false,
          motivo_indisponibilidade: conflito.motivo
        });
      } else {
        slots.push({
          hora_inicio: horaInicioStr,
          hora_fim: horaFimStr,
          disponivel: true
        });
      }
    }

    return slots;
  },

  /**
   * 5. Criação de um novo agendamento no banco
   */
  async criarAgendamento(params: {
    lojaId: string;
    produtoId: string;
    profissionalId: string;
    clienteNome: string;
    clienteWhatsapp: string;
    dataAgendamento: string; // 'YYYY-MM-DD'
    horaInicio: string; // 'HH:MM'
    horaFim: string; // 'HH:MM'
    modalidadeLocal?: ModalidadeLocalPrestacao;
    clienteId?: string | null;
    pedidoId?: string | null;
    itemPedidoId?: string | null;
    clienteEnderecoId?: string | null;
    enderecoPrestacaoSnapshot?: string | null;
    observacoes?: string | null;
    criadoPorUsuarioId?: string | null;
  }): Promise<AgendamentoServico> {
    const dataHoraInicio = new Date(`${params.dataAgendamento}T${params.horaInicio}:00`).toISOString();
    const dataHoraFim = new Date(`${params.dataAgendamento}T${params.horaFim}:00`).toISOString();

    const payload = {
      loja_id: params.lojaId,
      produto_id: params.produtoId,
      profissional_id: params.profissionalId,
      cliente_nome: params.clienteNome.trim(),
      cliente_whatsapp: params.clienteWhatsapp.trim(),
      data_agendamento: params.dataAgendamento,
      hora_inicio: params.horaInicio,
      hora_fim: params.horaFim,
      data_hora_inicio: dataHoraInicio,
      data_hora_fim: dataHoraFim,
      modalidade_local: params.modalidadeLocal || 'loja',
      cliente_id: params.clienteId || null,
      pedido_id: params.pedidoId || null,
      item_pedido_id: params.itemPedidoId || null,
      cliente_endereco_id: params.clienteEnderecoId || null,
      endereco_prestacao_snapshot: params.enderecoPrestacaoSnapshot || null,
      status_agendamento: 'agendado' as StatusAgendamento,
      observacoes: params.observacoes || null,
      criado_por_usuario_id: params.criadoPorUsuarioId || null
    };

    const { data, error } = await supabase
      .from('agendamentos_servicos')
      .insert([payload])
      .select('*, produto:produtos(nome, fotos_urls), profissional:usuarios_loja(nome_completo, especialidade_cargo)')
      .single();

    if (error) {
      console.error('Erro ao criar agendamento:', error);
      throw error;
    }

    return data as AgendamentoServico;
  },

  /**
   * 6. Listagem de agendamentos da loja com filtros
   */
  async listarAgendamentosLoja(params: {
    lojaId: string;
    dataInicio?: string;
    dataFim?: string;
    profissionalId?: string;
    status?: StatusAgendamento;
    limite?: number;
  }): Promise<AgendamentoServico[]> {
    let query = supabase
      .from('agendamentos_servicos')
      .select('*, produto:produtos(nome, fotos_urls), profissional:usuarios_loja(nome_completo, especialidade_cargo)')
      .eq('loja_id', params.lojaId)
      .order('data_agendamento', { ascending: true })
      .order('hora_inicio', { ascending: true });

    if (params.dataInicio) {
      query = query.gte('data_agendamento', params.dataInicio);
    }
    if (params.dataFim) {
      query = query.lte('data_agendamento', params.dataFim);
    }
    if (params.profissionalId) {
      query = query.eq('profissional_id', params.profissionalId);
    }
    if (params.status) {
      query = query.eq('status_agendamento', params.status);
    }
    if (params.limite) {
      query = query.limit(params.limite);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Erro ao listar agendamentos da loja:', error);
      throw error;
    }

    return (data as AgendamentoServico[]) || [];
  },

  /**
   * 7. Altera o status operacional de um agendamento
   */
  async alterarStatusAgendamento(
    lojaId: string,
    agendamentoId: string,
    novoStatus: StatusAgendamento,
    motivo?: string
  ): Promise<void> {
    const updates: Record<string, any> = {
      status_agendamento: novoStatus,
      atualizado_em: new Date().toISOString()
    };

    if (novoStatus === 'confirmado') {
      updates.confirmado_pelo_cliente_em = new Date().toISOString();
    } else if (novoStatus === 'cancelado') {
      updates.cancelado_em = new Date().toISOString();
      updates.motivo_cancelamento = motivo || 'Cancelado pelo operador no painel';
    }

    const { error } = await supabase
      .from('agendamentos_servicos')
      .update(updates)
      .eq('id', agendamentoId)
      .eq('loja_id', lojaId);

    if (error) {
      throw error;
    }
  },

  /**
   * 8. Remarcação de agendamento pela retaguarda da loja
   */
  async remarcarAgendamento(
    lojaId: string,
    agendamentoId: string,
    novaData: string,
    novaHoraInicio: string,
    novoProfissionalId?: string,
    motivo?: string
  ): Promise<void> {
    // 1. Obter agendamento atual
    const { data: atual, error: buscaErr } = await supabase
      .from('agendamentos_servicos')
      .select('*, produto:produtos(duracao_estimada_minutos)')
      .eq('id', agendamentoId)
      .eq('loja_id', lojaId)
      .single();

    if (buscaErr || !atual) {
      throw new Error('Agendamento não encontrado para remarcação.');
    }

    const duracao = atual.produto?.duracao_estimada_minutos || 30;
    const inicioMin = timeStringToMinutes(novaHoraInicio);
    const fimMin = inicioMin + duracao;
    const novaHoraFim = minutesToTimeString(fimMin);

    const novaDataHoraInicio = new Date(`${novaData}T${novaHoraInicio}:00`).toISOString();
    const novaDataHoraFim = new Date(`${novaData}T${novaHoraFim}:00`).toISOString();
    const profissionalEfetivo = novoProfissionalId || atual.profissional_id;

    const { error } = await supabase
      .from('agendamentos_servicos')
      .update({
        data_hora_anterior: atual.data_hora_inicio,
        data_agendamento: novaData,
        hora_inicio: novaHoraInicio,
        hora_fim: novaHoraFim,
        data_hora_inicio: novaDataHoraInicio,
        data_hora_fim: novaDataHoraFim,
        profissional_id: profissionalEfetivo,
        qtd_remarcacoes: (atual.qtd_remarcacoes || 0) + 1,
        remarcado_em: new Date().toISOString(),
        status_agendamento: 'agendado',
        confirmado_pelo_cliente_em: null,
        lembrete_enviado: false,
        lembrete_enviado_em: null,
        observacoes: motivo
          ? `${atual.observacoes || ''}\n[Remarcado pelo painel]: ${motivo}`.trim()
          : atual.observacoes,
        atualizado_em: new Date().toISOString()
      })
      .eq('id', agendamentoId)
      .eq('loja_id', lojaId);

    if (error) {
      throw error;
    }
  },

  /**
   * 9. Gera mensagem estruturada em pt-BR para envio no WhatsApp com link público do cliente
   */
  gerarMensagemWhatsappAgendamento(
    agendamento: AgendamentoServico,
    loja: Loja,
    tipo: 'confirmacao_criacao' | 'lembrete'
  ): string {
    const nomeLoja = loja.nome_fantasia || 'Nossa Loja';
    const dataFormatada = formatarDataPtBr(agendamento.data_agendamento);
    const nomeServico = (agendamento as any).produto?.nome || 'Serviço Agendado';
    const nomeProfissional = (agendamento as any).profissional?.nome_completo || 'Profissional Designado';
    const linkPublico = `${window.location.origin}/confirmar-agendamento/${agendamento.token_confirmacao}`;
    const localTexto = agendamento.modalidade_local === 'externo'
      ? (agendamento.endereco_prestacao_snapshot ? `No seu endereço: ${agendamento.endereco_prestacao_snapshot}` : 'No seu endereço')
      : `Na nossa loja: ${loja.endereco_logradouro || ''} ${loja.endereco_numero || ''}`.trim();

    if (tipo === 'confirmacao_criacao') {
      return `✨ *Agendamento Confirmado - ${nomeLoja}*

Olá, *${agendamento.cliente_nome}*! Seu horário foi reservado com sucesso:

📅 *Data:* ${dataFormatada}
⏰ *Horário:* ${agendamento.hora_inicio} às ${agendamento.hora_fim}
✂️ *Serviço:* ${nomeServico}
👤 *Profissional:* ${nomeProfissional}
📍 *Local:* ${localTexto}

📲 *Gerencie seu agendamento (Confirmar / Remarcar / Cancelar):*
${linkPublico}

Agradecemos a sua preferência! Caso precise de qualquer ajuste, estamos à disposição.`.trim();
    }

    return `⏰ *Lembrete de Agendamento - ${nomeLoja}*

Olá, *${agendamento.cliente_nome}*! Lembrando que você tem um atendimento agendado para amanhã:

📅 *Data:* ${dataFormatada}
⏰ *Horário:* ${agendamento.hora_inicio} às ${agendamento.hora_fim}
✂️ *Serviço:* ${nomeServico}
👤 *Profissional:* ${nomeProfissional}
📍 *Local:* ${localTexto}

Por favor, confirme ou remarque seu atendimento pelo link abaixo:
${linkPublico}

Esperamos por você!`.trim();
  }
};
