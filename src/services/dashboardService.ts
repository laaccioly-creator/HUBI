import { supabase } from '../lib/supabase';
import { LojaMetas, MetricasCockpit } from '../types';
import { obterDataOperacao } from '../utils/dataOperacao';

export type TipoPeriodoDashboard =
  | 'hoje'
  | 'ontem'
  | 'esta_semana'
  | 'semana_passada'
  | 'este_mes'
  | 'mes_passado'
  | 'este_ano'
  | 'ano_passado'
  | 'personalizado';

export type PeriodoDashboard = TipoPeriodoDashboard | 'semana' | 'mes' | 'ano';

export const PERIODOS_DASHBOARD_OPCOES: { id: TipoPeriodoDashboard; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: 'esta_semana', label: 'Esta semana' },
  { id: 'semana_passada', label: 'Semana passada' },
  { id: 'este_mes', label: 'Este mês' },
  { id: 'mes_passado', label: 'Mês passado' },
  { id: 'este_ano', label: 'Este ano' },
  { id: 'ano_passado', label: 'Ano passado' },
  { id: 'personalizado', label: 'Personalizado' }
];

const MESES_COMPLETOS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * Metas de mercado padrão adotadas para lojas novas ou sem metas personalizadas
 */
export const METAS_PADRAO_LOJA: Omit<LojaMetas, 'id' | 'loja_id'> = {
  meta_faturamento: 50000.0,
  meta_pedidos: 300,
  meta_lucro_liquido: 15000.0,
  meta_ticket_medio: 166.0,
  meta_inadimplencia_maxima: 5.0,
  meta_giro_estoque: 25.0
};

/**
 * Resolve o intervalo exato com base na data operacional (suportando data simulada/retroativa)
 */
export function resolverIntervaloPeriodo(
  tipoPeriodo: TipoPeriodoDashboard,
  periodoOffset: number = 0,
  dataInicioCustom?: string,
  dataFimCustom?: string
): {
  dataInicio: Date;
  dataFim: Date;
  dataInicioIso: string;
  dataFimIso: string;
  label: string;
  diasIntervalo: number;
} {
  const agora = obterDataOperacao();

  if (tipoPeriodo === 'personalizado') {
    const inicio = dataInicioCustom
      ? new Date(`${dataInicioCustom}T00:00:00`)
      : new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);
    const fim = dataFimCustom
      ? new Date(`${dataFimCustom}T23:59:59.999`)
      : new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999);

    const diffMs = Math.max(0, fim.getTime() - inicio.getTime());
    const dias = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

    return {
      dataInicio: inicio,
      dataFim: fim,
      dataInicioIso: inicio.toISOString(),
      dataFimIso: fim.toISOString(),
      label: 'Personalizado',
      diasIntervalo: dias
    };
  }

  if (tipoPeriodo === 'hoje') {
    const ref = new Date(agora);
    ref.setDate(ref.getDate() + periodoOffset);
    const inicio = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
    const fim = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
    const label = periodoOffset === 0 ? 'Hoje' : periodoOffset === -1 ? 'Ontem' : ref.toLocaleDateString('pt-BR');
    return {
      dataInicio: inicio,
      dataFim: fim,
      dataInicioIso: inicio.toISOString(),
      dataFimIso: fim.toISOString(),
      label,
      diasIntervalo: 1
    };
  }

  if (tipoPeriodo === 'ontem') {
    const ref = new Date(agora);
    ref.setDate(ref.getDate() - 1 + periodoOffset);
    const inicio = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
    const fim = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
    return {
      dataInicio: inicio,
      dataFim: fim,
      dataInicioIso: inicio.toISOString(),
      dataFimIso: fim.toISOString(),
      label: 'Ontem',
      diasIntervalo: 1
    };
  }

  if (tipoPeriodo === 'esta_semana' || tipoPeriodo === 'semana_passada') {
    const ref = new Date(agora);
    const baseOffset = tipoPeriodo === 'semana_passada' ? -7 : 0;
    ref.setDate(ref.getDate() + baseOffset + (periodoOffset * 7));

    const dayOfWeek = ref.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;

    const inicio = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - diffToMonday, 0, 0, 0, 0);
    const fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6, 23, 59, 59, 999);
    const label = tipoPeriodo === 'semana_passada' ? 'Semana Passada' : 'Esta Semana';
    return {
      dataInicio: inicio,
      dataFim: fim,
      dataInicioIso: inicio.toISOString(),
      dataFimIso: fim.toISOString(),
      label,
      diasIntervalo: 7
    };
  }

  if (tipoPeriodo === 'este_mes' || tipoPeriodo === 'mes_passado') {
    const ref = new Date(agora);
    const baseOffset = tipoPeriodo === 'mes_passado' ? -1 : 0;
    ref.setMonth(ref.getMonth() + baseOffset + periodoOffset);

    const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
    const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
    const label = `${MESES_COMPLETOS[ref.getMonth()]} de ${ref.getFullYear()}`;
    const dias = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
    return {
      dataInicio: inicio,
      dataFim: fim,
      dataInicioIso: inicio.toISOString(),
      dataFimIso: fim.toISOString(),
      label,
      diasIntervalo: dias
    };
  }

  if (tipoPeriodo === 'este_ano' || tipoPeriodo === 'ano_passado') {
    const ref = new Date(agora);
    const baseOffset = tipoPeriodo === 'ano_passado' ? -1 : 0;
    ref.setFullYear(ref.getFullYear() + baseOffset + periodoOffset);

    const inicio = new Date(ref.getFullYear(), 0, 1, 0, 0, 0, 0);
    const fim = new Date(ref.getFullYear(), 11, 31, 23, 59, 59, 999);
    const label = tipoPeriodo === 'ano_passado' && periodoOffset === 0
      ? `Ano Passado (${ref.getFullYear()})`
      : `Ano ${ref.getFullYear()}`;
    return {
      dataInicio: inicio,
      dataFim: fim,
      dataInicioIso: inicio.toISOString(),
      dataFimIso: fim.toISOString(),
      label,
      diasIntervalo: 365
    };
  }

  // Fallback padrão: este mês
  const padraoInicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);
  const padraoFim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);
  const dias = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  return {
    dataInicio: padraoInicio,
    dataFim: padraoFim,
    dataInicioIso: padraoInicio.toISOString(),
    dataFimIso: padraoFim.toISOString(),
    label: 'Este mês',
    diasIntervalo: dias
  };
}

/**
 * Calcula o intervalo em formato ISO para o período especificado (compatibilidade legada)
 */
export function calcularIntervaloPeriodo(periodo: PeriodoDashboard): {
  dataInicio: string;
  dataFim: string;
} {
  const chave = (periodo === 'semana' ? 'esta_semana' : periodo === 'mes' ? 'este_mes' : periodo === 'ano' ? 'este_ano' : periodo) as TipoPeriodoDashboard;
  const { dataInicioIso, dataFimIso } = resolverIntervaloPeriodo(chave, 0);
  return {
    dataInicio: dataInicioIso,
    dataFim: dataFimIso
  };
}

/**
 * Converte as metas mensais proporcionalmente para o período selecionado ou quantidade de dias
 */
export function calcularMetasProporcionais(
  metasMensais: LojaMetas,
  periodoOuDias: PeriodoDashboard | number
): LojaMetas {
  const agora = obterDataOperacao();
  const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();

  let fator: number;
  if (typeof periodoOuDias === 'number') {
    fator = Math.max(1, periodoOuDias) / diasNoMes;
  } else {
    switch (periodoOuDias) {
      case 'hoje':
      case 'ontem':
        fator = 1 / diasNoMes;
        break;
      case 'esta_semana':
      case 'semana_passada':
      case 'semana':
        fator = 7 / diasNoMes;
        break;
      case 'este_mes':
      case 'mes_passado':
      case 'mes':
        fator = 1.0;
        break;
      case 'este_ano':
      case 'ano_passado':
      case 'ano':
        fator = 12.0;
        break;
      default:
        fator = 1.0;
        break;
    }
  }

  return {
    ...metasMensais,
    meta_faturamento: Math.round(Number(metasMensais.meta_faturamento) * fator * 100) / 100,
    meta_pedidos: Math.max(1, Math.round(Number(metasMensais.meta_pedidos) * fator)),
    meta_lucro_liquido: Math.round(Number(metasMensais.meta_lucro_liquido) * fator * 100) / 100,
    meta_ticket_medio: Number(metasMensais.meta_ticket_medio),
    meta_inadimplencia_maxima: Number(metasMensais.meta_inadimplencia_maxima),
    meta_giro_estoque: Number(metasMensais.meta_giro_estoque)
  };
}

/**
 * Consulta as metas cadastradas da loja ou retorna valores padrão se inexistente
 */
export async function obterMetasLoja(lojaId: string): Promise<LojaMetas> {
  try {
    const { data, error } = await supabase
      .from('loja_metas')
      .select('*')
      .eq('loja_id', lojaId)
      .maybeSingle();

    if (error) {
      console.warn('[dashboardService] Falha ao consultar loja_metas, adotando padrões:', error.message);
      return {
        id: `default-${lojaId}`,
        loja_id: lojaId,
        ...METAS_PADRAO_LOJA
      };
    }

    if (data) {
      return {
        id: data.id,
        loja_id: data.loja_id,
        meta_faturamento: Number(data.meta_faturamento ?? METAS_PADRAO_LOJA.meta_faturamento),
        meta_pedidos: Number(data.meta_pedidos ?? METAS_PADRAO_LOJA.meta_pedidos),
        meta_lucro_liquido: Number(data.meta_lucro_liquido ?? METAS_PADRAO_LOJA.meta_lucro_liquido),
        meta_ticket_medio: Number(data.meta_ticket_medio ?? METAS_PADRAO_LOJA.meta_ticket_medio),
        meta_inadimplencia_maxima: Number(data.meta_inadimplencia_maxima ?? METAS_PADRAO_LOJA.meta_inadimplencia_maxima),
        meta_giro_estoque: Number(data.meta_giro_estoque ?? METAS_PADRAO_LOJA.meta_giro_estoque),
        criado_em: data.criado_em,
        atualizado_em: data.atualizado_em
      };
    }
  } catch (err) {
    console.warn('[dashboardService] Exceção ao buscar metas da loja:', err);
  }

  return {
    id: `default-${lojaId}`,
    loja_id: lojaId,
    ...METAS_PADRAO_LOJA
  };
}

/**
 * Salva ou atualiza as metas da loja via upsert na tabela loja_metas
 */
export async function salvarMetasLoja(
  lojaId: string,
  metas: Partial<LojaMetas>
): Promise<LojaMetas> {
  const payload = {
    loja_id: lojaId,
    meta_faturamento: Number(metas.meta_faturamento ?? METAS_PADRAO_LOJA.meta_faturamento),
    meta_pedidos: Number(metas.meta_pedidos ?? METAS_PADRAO_LOJA.meta_pedidos),
    meta_lucro_liquido: Number(metas.meta_lucro_liquido ?? METAS_PADRAO_LOJA.meta_lucro_liquido),
    meta_ticket_medio: Number(metas.meta_ticket_medio ?? METAS_PADRAO_LOJA.meta_ticket_medio),
    meta_inadimplencia_maxima: Number(metas.meta_inadimplencia_maxima ?? METAS_PADRAO_LOJA.meta_inadimplencia_maxima),
    meta_giro_estoque: Number(metas.meta_giro_estoque ?? METAS_PADRAO_LOJA.meta_giro_estoque),
    atualizado_em: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('loja_metas')
    .upsert(payload, { onConflict: 'loja_id' })
    .select()
    .single();

  if (error) {
    console.error('[dashboardService] Erro ao salvar metas da loja:', error);
    throw new Error('Não foi possível salvar as metas da loja. Tente novamente.');
  }

  return {
    id: data.id,
    loja_id: data.loja_id,
    meta_faturamento: Number(data.meta_faturamento),
    meta_pedidos: Number(data.meta_pedidos),
    meta_lucro_liquido: Number(data.meta_lucro_liquido),
    meta_ticket_medio: Number(data.meta_ticket_medio),
    meta_inadimplencia_maxima: Number(data.meta_inadimplencia_maxima),
    meta_giro_estoque: Number(data.meta_giro_estoque),
    criado_em: data.criado_em,
    atualizado_em: data.atualizado_em
  };
}

/**
 * Consulta consolidada das 6 métricas do Cockpit Executivo via RPC no Supabase
 * Aceita dataInicio e dataFim em formato ISO diretamente ou nome do período
 */
export async function obterMetricasCockpit(
  lojaId: string,
  paramInicio: string | PeriodoDashboard,
  paramFim?: string,
  diasIntervalo?: number
): Promise<{ metricas: MetricasCockpit; metasProporcionais: LojaMetas }> {
  let inicioIso: string;
  let fimIso: string;
  let diasCalculo = diasIntervalo || 30;

  if (paramFim) {
    inicioIso = paramInicio as string;
    fimIso = paramFim;
  } else {
    const res = calcularIntervaloPeriodo(paramInicio as PeriodoDashboard);
    inicioIso = res.dataInicio;
    fimIso = res.dataFim;
  }

  // 1. Busca as metas da loja e converte para o intervalo
  const metasMensais = await obterMetasLoja(lojaId);
  const metasProporcionais = calcularMetasProporcionais(metasMensais, diasCalculo);

  // 2. Invoca a RPC atômica consolidada no PostgreSQL
  const { data, error } = await supabase.rpc('obter_metricas_cockpit', {
    p_loja_id: lojaId,
    p_data_inicio: inicioIso,
    p_data_fim: fimIso
  });

  if (error) {
    console.error('[dashboardService] Erro ao invocar RPC obter_metricas_cockpit:', error.message);
    return {
      metricas: {
        faturamento: 0,
        pedidos: 0,
        ticket_medio: 0,
        cmv: 0,
        despesas: 0,
        lucro_liquido: 0,
        inadimplencia: 0,
        giro_estoque: 0
      },
      metasProporcionais
    };
  }

  const res = (data || {}) as Record<string, any>;
  const metricas: MetricasCockpit = {
    faturamento: Number(res.faturamento || 0),
    pedidos: Number(res.pedidos || 0),
    ticket_medio: Number(res.ticket_medio || 0),
    cmv: Number(res.cmv || 0),
    despesas: Number(res.despesas || 0),
    lucro_liquido: Number(res.lucro_liquido || 0),
    inadimplencia: Number(res.inadimplencia || 0),
    giro_estoque: Number(res.giro_estoque || 0)
  };

  return {
    metricas,
    metasProporcionais
  };
}

export const dashboardService = {
  METAS_PADRAO_LOJA,
  PERIODOS_DASHBOARD_OPCOES,
  resolverIntervaloPeriodo,
  calcularIntervaloPeriodo,
  calcularMetasProporcionais,
  obterMetasLoja,
  salvarMetasLoja,
  obterMetricasCockpit
};
