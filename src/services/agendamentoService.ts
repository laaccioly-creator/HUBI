// =============================================================================
// SERVIÇO: agendamentoService.ts
// Motor Central de Agendamento de Serviços Omnichannel do HUBI
// =============================================================================

import { supabase } from '../lib/supabase';
import { whatsappWalletService } from './whatsappWalletService';
import { logger } from './loggerService';
import type {
  AgendamentoServico,
  ProfissionalHorario,
  ServicoProfissional,
  SlotHorarioDisponivel,
  HorarioOcupado,
  StatusAgendamento,
  DiaSemana,
  ModalidadeLocalPrestacao,
  AgendamentoPublicoDetalhes,
  ParametrosProcessarAcaoAgendamento,
  ResultadoAcaoAgendamento,
  ItemAgendamentoInfo
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
   * 1.1. Lista os IDs dos colaboradores explicitamente vinculados a um serviço
   */
  async listarIdsProfissionaisDoServico(
    lojaId: string,
    produtoId: string
  ): Promise<string[]> {
    if (!lojaId || !produtoId) return [];

    const { data, error } = await supabase
      .from('servico_profissionais')
      .select('usuario_id')
      .eq('loja_id', lojaId)
      .eq('produto_id', produtoId)
      .eq('ativo', true);

    if (error) {
      logger.error('agendamentoService', 'listarIdsProfissionaisDoServico', error, {
        loja_id: lojaId
      });
      throw new Error(`Não foi possível carregar os profissionais habilitados do serviço: ${error.message}`);
    }

    return Array.from(
      new Set(
        (data || [])
          .map((item: { usuario_id: string }) => item.usuario_id)
          .filter((uid): uid is string => typeof uid === 'string' && uid.trim().length > 0)
      )
    );
  },

  /**
   * 2. Sincroniza os profissionais habilitados para determinado serviço
   */
  async salvarProfissionaisDoServico(
    lojaId: string,
    produtoId: string,
    usuariosIds: string[]
  ): Promise<void> {
    if (!lojaId || !produtoId) {
      throw new Error('Identificação da loja ou do serviço ausente para vincular profissionais.');
    }

    const idsUnicos = Array.from(
      new Set(usuariosIds.filter((uid): uid is string => typeof uid === 'string' && uid.trim().length > 0))
    );

    // 1. Remover vínculos anteriores deste serviço nesta loja
    const { error: deleteErr } = await supabase
      .from('servico_profissionais')
      .delete()
      .eq('loja_id', lojaId)
      .eq('produto_id', produtoId);

    if (deleteErr) {
      logger.error('agendamentoService', 'salvarProfissionaisDoServico:delete', deleteErr, {
        loja_id: lojaId
      });
      throw new Error(`Não foi possível limpar os vínculos anteriores dos profissionais: ${deleteErr.message}`);
    }

    // 2. Inserir todos os profissionais selecionados em lote
    if (idsUnicos.length > 0) {
      const registros = idsUnicos.map((usuarioId) => ({
        loja_id: lojaId,
        produto_id: produtoId,
        usuario_id: usuarioId,
        ativo: true
      }));

      const { error: insertErr } = await supabase
        .from('servico_profissionais')
        .insert(registros);

      if (insertErr) {
        logger.error('agendamentoService', 'salvarProfissionaisDoServico:insert', insertErr, {
          loja_id: lojaId
        });
        throw new Error(`Não foi possível salvar os profissionais habilitados para o serviço: ${insertErr.message}`);
      }
    }
  },

  /**
   * 2.1 Conta quantos serviços ativos estão vinculados a cada colaborador da loja
   */
  async contarServicosPorProfissional(lojaId: string): Promise<Record<string, number>> {
    if (!lojaId) return {};
    const { data, error } = await supabase
      .from('servico_profissionais')
      .select('usuario_id, produto_id')
      .eq('loja_id', lojaId)
      .eq('ativo', true);

    if (error || !data) return {};

    const mapaPorUsuario = new Map<string, Set<string>>();
    data.forEach((row: { usuario_id: string; produto_id: string }) => {
      if (!row.usuario_id || !row.produto_id) return;
      const setAtual = mapaPorUsuario.get(row.usuario_id) || new Set<string>();
      setAtual.add(row.produto_id);
      mapaPorUsuario.set(row.usuario_id, setAtual);
    });

    const resultado: Record<string, number> = {};
    mapaPorUsuario.forEach((setProd, userId) => {
      resultado[userId] = setProd.size;
    });
    return resultado;
  },

  /**
   * 2.2 Lista todos os serviços ativos da loja e os IDs já vinculados ao profissional
   */
  async listarServicosComVinculoProfissional(
    lojaId: string,
    usuarioId: string
  ): Promise<{
    servicos: Array<{
      id: string;
      nome: string;
      preco_venda_varejo: number;
      duracao_estimada_minutos: number;
      categoria_nome: string;
    }>;
    vinculadosIds: string[];
  }> {
    const [produtosRes, categoriasRes, vinculosRes] = await Promise.all([
      supabase
        .from('produtos')
        .select('id, nome, preco_venda_varejo, duracao_estimada_minutos, categoria_id')
        .eq('loja_id', lojaId)
        .eq('tipo_item', 'servico')
        .eq('ativo', true)
        .order('nome', { ascending: true }),
      supabase
        .from('categorias')
        .select('id, nome, categoria_pai_id')
        .eq('loja_id', lojaId),
      supabase
        .from('servico_profissionais')
        .select('produto_id')
        .eq('loja_id', lojaId)
        .eq('usuario_id', usuarioId)
        .eq('ativo', true)
    ]);

    if (produtosRes.error) {
      throw produtosRes.error;
    }

    const catMap = new Map<string, { id: string; nome: string; categoria_pai_id?: string | null }>();
    (categoriasRes.data || []).forEach((c: { id: string; nome: string; categoria_pai_id?: string | null }) => {
      catMap.set(c.id, c);
    });

    const resolverNomeCategoria = (catId?: string | null): string => {
      if (!catId) return 'Sem categoria';
      const cat = catMap.get(catId);
      if (!cat) return 'Sem categoria';
      if (cat.categoria_pai_id) {
        const pai = catMap.get(cat.categoria_pai_id);
        if (pai) return `${pai.nome} › ${cat.nome}`;
      }
      return cat.nome;
    };

    const servicos = (produtosRes.data || []).map((p: {
      id: string;
      nome: string;
      preco_venda_varejo?: number | null;
      duracao_estimada_minutos?: number | null;
      categoria_id?: string | null;
    }) => ({
      id: p.id,
      nome: p.nome,
      preco_venda_varejo: Number(p.preco_venda_varejo || 0),
      duracao_estimada_minutos: Number(p.duracao_estimada_minutos || 30),
      categoria_nome: resolverNomeCategoria(p.categoria_id)
    }));

    const vinculadosIds = Array.from(
      new Set((vinculosRes.data || []).map((v: { produto_id: string }) => v.produto_id).filter(Boolean))
    );

    return { servicos, vinculadosIds };
  },

  /**
   * 2.3 Salva em lote apenas os serviços alterados para o profissional
   */
  async salvarServicosDoProfissional(
    lojaId: string,
    usuarioId: string,
    alteracoes: Array<{ produtoId: string; habilitar: boolean }>
  ): Promise<void> {
    if (alteracoes.length === 0) return;

    const produtoIds = alteracoes.map((a) => a.produtoId);
    const { data: existentes, error: buscaErr } = await supabase
      .from('servico_profissionais')
      .select('id, produto_id, ativo')
      .eq('loja_id', lojaId)
      .eq('usuario_id', usuarioId)
      .in('produto_id', produtoIds);

    if (buscaErr) {
      throw buscaErr;
    }

    const mapaExistentes = new Map<string, { id: string; ativo: boolean }>();
    (existentes || []).forEach((row: { id: string; produto_id: string; ativo: boolean }) => {
      mapaExistentes.set(row.produto_id, { id: row.id, ativo: row.ativo });
    });

    const paraInserir: Array<{
      loja_id: string;
      produto_id: string;
      usuario_id: string;
      ativo: boolean;
    }> = [];

    for (const alt of alteracoes) {
      const existente = mapaExistentes.get(alt.produtoId);
      if (existente) {
        if (existente.ativo !== alt.habilitar) {
          const { error: updErr } = await supabase
            .from('servico_profissionais')
            .update({ ativo: alt.habilitar })
            .eq('id', existente.id)
            .eq('loja_id', lojaId);
          if (updErr) throw updErr;
        }
      } else if (alt.habilitar) {
        paraInserir.push({
          loja_id: lojaId,
          produto_id: alt.produtoId,
          usuario_id: usuarioId,
          ativo: true
        });
      }
    }

    if (paraInserir.length > 0) {
      const { error: insErr } = await supabase
        .from('servico_profissionais')
        .insert(paraInserir);
      if (insErr) throw insErr;
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
      .select('id, loja_id, usuario_id, dia_semana, hora_inicio, hora_fim, tem_intervalo, intervalo_inicio, intervalo_fim, ativo')
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

    // 1. Extrair dia da semana com fuso horário seguro pt-BR (forçando meio-dia local)
    const [ano, mes, dia] = dataStr.split('-').map(Number);
    const dataLocal = new Date(ano, mes - 1, dia, 12, 0, 0);
    const diaSemana = dataLocal.getDay() as DiaSemana;

    // 2. Consulta de horários configurados do profissional
    const { data: horarios, error: expErr } = await supabase
      .from('profissional_horarios')
      .select('dia_semana, hora_inicio, hora_fim, tem_intervalo, intervalo_inicio, intervalo_fim, ativo')
      .eq('loja_id', lojaId)
      .eq('usuario_id', profissionalId)
      .eq('ativo', true);

    if (expErr) {
      console.error('Erro ao consultar expediente do profissional:', expErr);
      return [];
    }

    const expediente = (horarios || []).find((h) => Number(h.dia_semana) === Number(diaSemana));

    if (!expediente || !expediente.hora_inicio || !expediente.hora_fim) {
      return []; // Profissional não atende neste dia
    }

    // 3. Obter agendamentos existentes na data para evitar conflitos
    let ocupados: HorarioOcupado[] = [];
    try {
      const { data: ocupadosData, error: rpcErr } = await supabase.rpc(
        'obter_horarios_ocupados_profissional',
        {
          p_loja_id: lojaId,
          p_profissional_id: profissionalId,
          p_data: dataStr
        }
      );

      if (!rpcErr && ocupadosData) {
        ocupados = ocupadosData as HorarioOcupado[];
      } else {
        // Fallback defensivo com consulta direta
        const { data: directData } = await supabase
          .from('agendamentos_servicos')
          .select('hora_inicio, hora_fim, status, id')
          .eq('loja_id', lojaId)
          .eq('profissional_id', profissionalId)
          .eq('data_agendamento', dataStr)
          .in('status', ['agendado', 'confirmado', 'em_atendimento']);

        if (directData) {
          ocupados = directData
            .filter((item) => !ignorarAgendamentoId || item.id !== ignorarAgendamentoId)
            .map((item) => ({
              hora_inicio: item.hora_inicio,
              hora_fim: item.hora_fim,
              status: item.status
            }));
        }
      }
    } catch (err) {
      console.warn('Aviso: consulta de agendamentos ocupados em fallback:', err);
    }

    const faixasBloqueadas = ocupados.map((item) => ({
      inicio: timeStringToMinutes(item.hora_inicio),
      fim: timeStringToMinutes(item.hora_fim),
      motivo: 'Horário já reservado'
    }));

    // 4. Dividir expediente em períodos úteis de trabalho (respeitando intervalo de almoço)
    const inicioExpediente = timeStringToMinutes(expediente.hora_inicio);
    const fimExpediente = timeStringToMinutes(expediente.hora_fim);
    const duracaoEfetiva = Math.max(duracaoMinutos || 30, 10);

    const periodosDeTrabalho: Array<{ inicio: number; fim: number }> = [];

    if (expediente.tem_intervalo && expediente.intervalo_inicio && expediente.intervalo_fim) {
      const inicioIntervalo = timeStringToMinutes(expediente.intervalo_inicio);
      const fimIntervalo = timeStringToMinutes(expediente.intervalo_fim);

      if (inicioIntervalo > inicioExpediente) {
        periodosDeTrabalho.push({ inicio: inicioExpediente, fim: inicioIntervalo });
      }
      if (fimExpediente > fimIntervalo) {
        periodosDeTrabalho.push({ inicio: fimIntervalo, fim: fimExpediente });
      }
    } else {
      periodosDeTrabalho.push({ inicio: inicioExpediente, fim: fimExpediente });
    }

    // 5. Verificação de horários passados caso a data seja hoje
    const agora = new Date();
    const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    const ehHoje = dataStr === hojeStr;
    const minutosAtuais = agora.getHours() * 60 + agora.getMinutes();

    const slots: SlotHorarioDisponivel[] = [];

    for (const periodo of periodosDeTrabalho) {
      for (let slotInicio = periodo.inicio; slotInicio + duracaoEfetiva <= periodo.fim; slotInicio += duracaoEfetiva) {
        const slotFim = slotInicio + duracaoEfetiva;
        const horaInicioStr = minutesToTimeString(slotInicio);
        const horaFimStr = minutesToTimeString(slotFim);

        // Se a data selecionada for hoje, descarta horários já decorridos
        if (ehHoje && slotInicio <= minutosAtuais) {
          continue;
        }

        // Checar sobreposição com agendamentos ocupados existentes
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
    }

    return slots;
  },

  /**
   * Hidrata produto e profissional em memória de forma resiliente caso o join PostgREST falhe
   */
  async hidratarAgendamentosEmMemoria(
    agendamentos: Array<Record<string, unknown>>,
    lojaId: string
  ): Promise<AgendamentoServico[]> {
    if (!agendamentos || agendamentos.length === 0) return [];

    const produtoIds = [...new Set(agendamentos.map(a => String(a.produto_id || '')).filter(Boolean))];
    const profissionalIds = [...new Set(agendamentos.map(a => String(a.profissional_id || '')).filter(Boolean))];

    let prodsList: Produto[] = [];
    let profsList: UsuarioLoja[] = [];

    try {
      const [prodsRes, profsRes] = await Promise.all([
        produtoIds.length > 0
          ? supabase
              .from('produtos')
              .select('id, nome, preco_venda_varejo, fotos_urls')
              .eq('loja_id', lojaId)
              .in('id', produtoIds)
          : Promise.resolve({ data: [], error: null }),
        profissionalIds.length > 0
          ? supabase
              .from('usuarios_loja')
              .select('id, nome_completo, especialidade_cargo, whatsapp_atendimento')
              .eq('loja_id', lojaId)
              .in('id', profissionalIds)
          : Promise.resolve({ data: [], error: null })
      ]);

      if (prodsRes.error) {
        console.warn('[agendamentoService] Aviso ao hidratar produtos dos agendamentos:', prodsRes.error.message);
      } else if (Array.isArray(prodsRes.data)) {
        prodsList = prodsRes.data as Produto[];
      }

      if (profsRes.error) {
        console.warn('[agendamentoService] Aviso ao hidratar profissionais dos agendamentos:', profsRes.error.message);
      } else if (Array.isArray(profsRes.data)) {
        profsList = profsRes.data as UsuarioLoja[];
      }
    } catch (err) {
      console.warn('[agendamentoService] Falha secundária ao hidratar serviço/profissional em memória:', err);
    }

    const prodMap = new Map(prodsList.map(p => [p.id, p]));
    const profMap = new Map(profsList.map(p => [p.id, p]));

    return agendamentos.map(a => ({
      ...(a as unknown as AgendamentoServico),
      produto: (a.produto as Produto) || prodMap.get(String(a.produto_id)) || undefined,
      profissional: (a.profissional as UsuarioLoja) || profMap.get(String(a.profissional_id)) || undefined
    }));
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

    // Tenta inserção com join de relações
    try {
      const { data, error } = await supabase
        .from('agendamentos_servicos')
        .insert([payload])
        .select(`
          id,
          loja_id,
          pedido_id,
          item_pedido_id,
          produto_id,
          profissional_id,
          cliente_id,
          cliente_nome,
          cliente_whatsapp,
          data_agendamento,
          hora_inicio,
          hora_fim,
          data_hora_inicio,
          data_hora_fim,
          modalidade_local,
          cliente_endereco_id,
          endereco_prestacao_snapshot,
          status_agendamento,
          token_confirmacao,
          lembrete_enviado,
          lembrete_enviado_em,
          confirmado_pelo_cliente_em,
          cancelado_em,
          motivo_cancelamento,
          qtd_remarcacoes,
          data_hora_anterior,
          remarcado_em,
          observacoes,
          criado_por_usuario_id,
          criado_em,
          atualizado_em,
          produto:produtos(id, nome, preco_venda_varejo, fotos_urls),
          profissional:usuarios_loja!agendamentos_servicos_profissional_id_fkey(id, nome_completo, especialidade_cargo, whatsapp_atendimento)
        `)
        .single();

      if (!error && data) {
        return data as unknown as AgendamentoServico;
      }
    } catch {
      // Prossegue para inserção limpa com hidratação defensiva
    }

    const { data: rawData, error: insertError } = await supabase
      .from('agendamentos_servicos')
      .insert([payload])
      .select('*')
      .single();

    if (insertError) {
      console.error('Erro ao criar agendamento:', insertError);
      throw insertError;
    }

    const hidratados = await this.hidratarAgendamentosEmMemoria([rawData as Record<string, unknown>], params.lojaId);
    return hidratados[0] || (rawData as unknown as AgendamentoServico);
  },

  /**
   * 5.1 Sincroniza os agendamentos vinculados aos itens de um pedido salvo/finalizado no PDV
   */
  async sincronizarAgendamentosPedidoPdv(params: {
    lojaId: string;
    pedidoId: string;
    clienteId?: string | null;
    clienteNome?: string | null;
    clienteWhatsapp?: string | null;
    criadoPorUsuarioId?: string | null;
    itens: Array<{
      itemPedidoId?: string | null;
      produtoId: string;
      agendamento?: ItemAgendamentoInfo | null;
    }>;
  }): Promise<{ inseridos: number; erroMensagem?: string }> {
    const itensAgendados = params.itens.filter(
      (it): it is { itemPedidoId?: string | null; produtoId: string; agendamento: ItemAgendamentoInfo } =>
        Boolean(it.agendamento && it.agendamento.profissional_id && it.agendamento.data_agendamento)
    );

    if (itensAgendados.length === 0) {
      return { inseridos: 0 };
    }

    const normalizarHoraComSegundos = (hora: string): string => {
      const limpa = (hora || '00:00').trim();
      if (/^\d{2}:\d{2}:\d{2}$/.test(limpa)) return limpa;
      if (/^\d{2}:\d{2}$/.test(limpa)) return `${limpa}:00`;
      return `${limpa.slice(0, 5).padEnd(5, '0')}:00`;
    };

    const obterOffsetLocal = (): string => {
      const offsetMin = -new Date().getTimezoneOffset();
      const sinal = offsetMin >= 0 ? '+' : '-';
      const abs = Math.abs(offsetMin);
      const hh = String(Math.floor(abs / 60)).padStart(2, '0');
      const mm = String(abs % 60).padStart(2, '0');
      return `${sinal}${hh}:${mm}`;
    };

    const offsetLocal = obterOffsetLocal();
    const nomeCliente = (params.clienteNome || '').trim() || 'Cliente Balcão';
    const whatsappCliente = (params.clienteWhatsapp || '').trim();

    const payloads = itensAgendados.map((it) => {
      const ag = it.agendamento;
      const horaInicio = normalizarHoraComSegundos(ag.hora_inicio);
      const horaFim = normalizarHoraComSegundos(ag.hora_fim);
      return {
        loja_id: params.lojaId,
        pedido_id: params.pedidoId,
        item_pedido_id: it.itemPedidoId || null,
        produto_id: it.produtoId,
        profissional_id: ag.profissional_id,
        cliente_id: ag.cliente_id || params.clienteId || null,
        cliente_nome: nomeCliente,
        cliente_whatsapp: whatsappCliente,
        data_agendamento: ag.data_agendamento,
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        data_hora_inicio: `${ag.data_agendamento}T${horaInicio}${offsetLocal}`,
        data_hora_fim: `${ag.data_agendamento}T${horaFim}${offsetLocal}`,
        modalidade_local: ag.modalidade_local || 'loja',
        cliente_endereco_id: ag.cliente_endereco_id || null,
        endereco_prestacao_snapshot: ag.endereco_prestacao_snapshot || null,
        status_agendamento: 'confirmado' as StatusAgendamento,
        observacoes: ag.observacoes || null,
        criado_por_usuario_id: params.criadoPorUsuarioId || null
      };
    });

    try {
      // Remove vínculos anteriores do mesmo pedido (caso seja edição/reabertura de pedido pendente)
      const { error: deleteError } = await supabase
        .from('agendamentos_servicos')
        .delete()
        .eq('loja_id', params.lojaId)
        .eq('pedido_id', params.pedidoId);

      if (deleteError) {
        logger.error('AgendamentoService', 'limpar_agendamentos_pdv', deleteError, {
          loja_id: params.lojaId
        });
      }

      const { error } = await supabase
        .from('agendamentos_servicos')
        .insert(payloads);

      if (error) {
        const detalheBanco = [error.message, error.details, error.hint].filter(Boolean).join(' — ');
        console.error('[AgendamentoService] Erro ao inserir em agendamentos_servicos:', error);
        logger.error('AgendamentoService', 'sincronizar_agendamentos_pdv', error, {
          loja_id: params.lojaId
        });
        return {
          inseridos: 0,
          erroMensagem: `O pedido foi salvo, mas houve falha ao gravar o agendamento na Agenda: ${detalheBanco}`
        };
      }

      return { inseridos: payloads.length };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido ao gravar agendamento.';
      console.error('[AgendamentoService] Exceção ao sincronizar agendamentos_servicos:', err);
      logger.error('AgendamentoService', 'sincronizar_agendamentos_pdv_excecao', err, {
        loja_id: params.lojaId
      });
      return {
        inseridos: 0,
        erroMensagem: `O pedido foi salvo, mas houve falha ao gravar o agendamento na Agenda: ${msg}`
      };
    }
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
    if (!params.lojaId) return [];

    let query = supabase
      .from('agendamentos_servicos')
      .select('*')
      .eq('loja_id', params.lojaId);

    if (params.dataInicio && params.dataFim && params.dataInicio === params.dataFim) {
      query = query.eq('data_agendamento', params.dataInicio);
    } else {
      if (params.dataInicio) query = query.gte('data_agendamento', params.dataInicio);
      if (params.dataFim) query = query.lte('data_agendamento', params.dataFim);
    }

    if (params.profissionalId) query = query.eq('profissional_id', params.profissionalId);
    if (params.status) query = query.eq('status_agendamento', params.status);
    if (params.limite) query = query.limit(params.limite);

    const { data: rawData, error: rawError } = await query
      .order('data_agendamento', { ascending: true })
      .order('hora_inicio', { ascending: true });

    if (rawError) {
      const detalhe = [rawError.message, rawError.details, rawError.hint].filter(Boolean).join(' — ');
      console.error('[AgendamentoService] Erro ao consultar agendamentos_servicos:', rawError);
      throw new Error(`Falha ao consultar agendamentos no banco: ${detalhe}`);
    }

    if (!rawData || rawData.length === 0) {
      return [];
    }

    const hidratados = await this.hidratarAgendamentosEmMemoria(
      rawData as Array<Record<string, unknown>>,
      params.lojaId
    );
    return await this.anexarPedidosHibridosEmAgendamentos(hidratados, params.lojaId);
  },

  async anexarPedidosHibridosEmAgendamentos(
    lista: AgendamentoServico[],
    lojaId: string
  ): Promise<AgendamentoServico[]> {
    const pedidoIds = Array.from(
      new Set(lista.map((ag) => ag.pedido_id).filter((id): id is string => Boolean(id)))
    );
    if (pedidoIds.length === 0) return lista;

    try {
      const { data: pedidosData } = await supabase
        .from('pedidos')
        .select('id, numero_pedido, levar_produto_no_atendimento')
        .eq('loja_id', lojaId)
        .in('id', pedidoIds);

      const pedidosMap = new Map<
        string,
        { id: string; numero_pedido: number; levar_produto_no_atendimento?: boolean }
      >();
      (pedidosData || []).forEach((p) => {
        pedidosMap.set(p.id, {
          id: p.id,
          numero_pedido: Number(p.numero_pedido || 0),
          levar_produto_no_atendimento: Boolean(p.levar_produto_no_atendimento)
        });
      });

      const pedidoIdsComMaterial = Array.from(pedidosMap.values())
        .filter((p) => p.levar_produto_no_atendimento)
        .map((p) => p.id);

      const itensPorPedido = new Map<
        string,
        Array<{ nome_produto: string; rotulo_variacao?: string | null; quantidade: number }>
      >();

      if (pedidoIdsComMaterial.length > 0) {
        const { data: itensData } = await supabase
          .from('itens_pedido')
          .select('pedido_id, nome_produto, rotulo_variacao, quantidade, tipo_item')
          .eq('loja_id', lojaId)
          .in('pedido_id', pedidoIdsComMaterial)
          .eq('tipo_item', 'produto');

        (itensData || []).forEach((it) => {
          const arr = itensPorPedido.get(it.pedido_id) || [];
          arr.push({
            nome_produto: it.nome_produto || 'Produto',
            rotulo_variacao: it.rotulo_variacao || null,
            quantidade: Number(it.quantidade || 1)
          });
          itensPorPedido.set(it.pedido_id, arr);
        });
      }

      return lista.map((ag) => {
        if (!ag.pedido_id) return ag;
        const ped = pedidosMap.get(ag.pedido_id) || null;
        const itensFisicos = itensPorPedido.get(ag.pedido_id) || [];
        return {
          ...ag,
          pedido: ped,
          itens_fisicos_levar: itensFisicos
        };
      });
    } catch {
      return lista;
    }
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
  },

  /**
   * 10. Carrega detalhes do agendamento para a página pública do cliente via token opaco
   */
  async obterAgendamentoPorTokenPublico(token: string): Promise<AgendamentoPublicoDetalhes | null> {
    if (!token) return null;
    const { data, error } = await supabase.rpc('obter_agendamento_por_token_publico', {
      p_token: token
    });

    if (error) {
      console.warn('Erro ao obter agendamento por token público:', error);
      return null;
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return null;
    }

    return (Array.isArray(data) ? data[0] : data) as AgendamentoPublicoDetalhes;
  },

  /**
   * 11. Processa ação pública do cliente (confirmar presença, solicitar cancelamento ou remarcar)
   */
  async processarAcaoCliente(params: ParametrosProcessarAcaoAgendamento): Promise<ResultadoAcaoAgendamento> {
    const { data, error } = await supabase.rpc('processar_acao_cliente_agendamento', {
      p_token: params.p_token,
      p_acao: params.p_acao,
      p_nova_data: params.p_nova_data || null,
      p_nova_hora_inicio: params.p_nova_hora_inicio || null,
      p_novo_profissional_id: params.p_novo_profissional_id || null,
      p_motivo: params.p_motivo || null
    });

    if (error) {
      throw error;
    }

    return data as ResultadoAcaoAgendamento;
  },

  /**
   * 12. Obtém a lista de agendamentos pendentes de envio de lembrete dentro da janela configurada da loja
   */
  async obterLembretesPendentesLoja(lojaId: string): Promise<AgendamentoServico[]> {
    if (!lojaId) return [];

    let horasAntecedencia = 24;
    try {
      const { data: loja } = await supabase
        .from('lojas')
        .select('antecedencia_lembrete_horas')
        .eq('id', lojaId)
        .maybeSingle();

      if (loja?.antecedencia_lembrete_horas) {
        horasAntecedencia = loja.antecedencia_lembrete_horas;
      }
    } catch {
      horasAntecedencia = 24;
    }

    const agora = new Date();
    const limiteHoras = new Date(agora.getTime() + horasAntecedencia * 60 * 60 * 1000);

    const aplicarFiltros = (query: any) => {
      return query
        .eq('loja_id', lojaId)
        .in('status_agendamento', ['agendado', 'confirmado'])
        .eq('lembrete_enviado', false)
        .gte('data_hora_inicio', agora.toISOString())
        .lte('data_hora_inicio', limiteHoras.toISOString())
        .order('data_hora_inicio', { ascending: true });
    };

    // 1. Tenta consulta nomeada com foreign key explícita
    try {
      const { data, error } = await aplicarFiltros(
        supabase
          .from('agendamentos_servicos')
          .select(`
            *,
            produto:produtos(id, nome, preco_venda_varejo),
            profissional:usuarios_loja!agendamentos_servicos_profissional_id_fkey(id, nome_completo, especialidade_cargo, whatsapp_atendimento)
          `)
      );

      if (!error && Array.isArray(data)) {
        return data as unknown as AgendamentoServico[];
      }
    } catch {
      // Falha no join explícito por nome de constraint, tenta fallback
    }

    // 2. Tenta com foreign key direta de coluna (!profissional_id)
    try {
      const { data, error } = await aplicarFiltros(
        supabase
          .from('agendamentos_servicos')
          .select(`
            *,
            produto:produtos(id, nome, preco_venda_varejo),
            profissional:usuarios_loja!profissional_id(id, nome_completo, especialidade_cargo, whatsapp_atendimento)
          `)
      );

      if (!error && Array.isArray(data)) {
        return data as unknown as AgendamentoServico[];
      }
    } catch {
      // Prossegue para fallback resiliente em memória
    }

    // 3. Fallback limpo sem join + hidratação em memória garantida
    try {
      const { data: rawData, error: rawError } = await aplicarFiltros(
        supabase
          .from('agendamentos_servicos')
          .select('*')
      );

      if (rawError || !rawData || rawData.length === 0) {
        return [];
      }

      return await this.hidratarAgendamentosEmMemoria(rawData as Array<Record<string, unknown>>, lojaId);
    } catch {
      return [];
    }
  },

  /**
   * 13. Marca manualmente um lembrete como enviado
   */
  async marcarLembreteComoEnviado(lojaId: string, agendamentoId: string): Promise<void> {
    const { error } = await supabase
      .from('agendamentos_servicos')
      .update({
        lembrete_enviado: true,
        lembrete_enviado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
      })
      .eq('id', agendamentoId)
      .eq('loja_id', lojaId);

    if (error) throw error;
  },

  /**
   * 14. Processa em lote ou sob demanda a régua de lembretes via WhatsApp
   */
  async processarLembretesPendentesLoja(lojaId: string): Promise<{
    totalEncontrados: number;
    totalDisparados: number;
    itensManuais: Array<{ agendamento: AgendamentoServico; manualUrl: string }>;
    erros: string[];
  }> {
    if (!lojaId) {
      return { totalEncontrados: 0, totalDisparados: 0, itensManuais: [], erros: ['Loja não informada'] };
    }

    // 1. Carrega dados completos da loja
    const { data: loja, error: erroLoja } = await supabase
      .from('lojas')
      .select('*')
      .eq('id', lojaId)
      .single();

    if (erroLoja || !loja) {
      return { totalEncontrados: 0, totalDisparados: 0, itensManuais: [], erros: ['Loja não encontrada'] };
    }

    // 2. Busca os agendamentos pendentes
    const pendentes = await this.obterLembretesPendentesLoja(lojaId);
    if (pendentes.length === 0) {
      return { totalEncontrados: 0, totalDisparados: 0, itensManuais: [], erros: [] };
    }

    let totalDisparados = 0;
    const itensManuais: Array<{ agendamento: AgendamentoServico; manualUrl: string }> = [];
    const erros: string[] = [];

    for (const ag of pendentes) {
      try {
        const mensagem = this.gerarMensagemWhatsappAgendamento(ag, loja, 'lembrete');
        const res = await whatsappWalletService.dispararNotificacaoHibrida({
          lojaId,
          loja,
          telefoneDestino: ag.cliente_whatsapp,
          mensagem,
          eventoGatilho: 'lembrete_agendamento',
          pedidoId: ag.pedido_id,
          clienteId: ag.cliente_id
        });

        if (res.modoEnvio === 'auto_janela_24h' || res.modoEnvio === 'auto_tarifado') {
          await this.marcarLembreteComoEnviado(lojaId, ag.id);
          totalDisparados++;
        } else {
          // Fallback manual link
          itensManuais.push({
            agendamento: ag,
            manualUrl: res.manualUrl || whatsappWalletService.construirLinkManualWhatsApp(ag.cliente_whatsapp, mensagem)
          });
        }
      } catch (err: any) {
        console.error(`Erro ao disparar lembrete para agendamento ${ag.id}:`, err);
        erros.push(`Falha no agendamento ${ag.id}: ${err.message || err}`);
      }
    }

    return {
      totalEncontrados: pendentes.length,
      totalDisparados,
      itensManuais,
      erros
    };
  }
};
