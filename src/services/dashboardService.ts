import { supabase } from '../lib/supabase';
import { LojaMetas, MetricasCockpit } from '../types';
import { obterDataOperacao } from '../utils/dataOperacao';
import {
  formatarDataLocal,
  obterDataLocalYYYYMMDD,
  obterInicioDiaISO,
  obterFimDiaISO,
  obterOffsetISOLocal
} from '../utils/dateTime';
import { obterDataRecebimentoPedidoDate, pedidoFoiPagoRealmente } from '../utils/regimeCaixa';

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

export interface DesdobramentoLojaItem {
  lojaId: string;
  lojaNome: string;
  metricas: MetricasCockpit;
  metasProporcionais: LojaMetas;
}

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
 * Metas padrão adotadas para lojas novas ou sem metas configuradas (todos os valores zerados)
 */
export const METAS_PADRAO_LOJA: Omit<LojaMetas, 'id' | 'loja_id'> = {
  meta_faturamento: 0.0,
  meta_pedidos: 0,
  meta_lucro_liquido: 0.0,
  meta_ticket_medio: 0.0,
  meta_despesas_maximas: 0.0,
  meta_inadimplencia_maxima: 0.0,
  meta_giro_estoque: 0.0,
  meta_saude_estoque_max_ruptura: 0.0
};

function formatarYmdUTC(d: Date): string {
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

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
  const hojeYmd = obterDataLocalYYYYMMDD(agora);
  const [anoHoje, mesHoje, diaHoje] = hojeYmd.split('-').map(Number);

  if (tipoPeriodo === 'personalizado') {
    const ymdInicio = dataInicioCustom || `${anoHoje}-${String(mesHoje).padStart(2, '0')}-01`;
    const ymdFim = dataFimCustom || hojeYmd;
    const dataInicioIso = obterInicioDiaISO(ymdInicio);
    const dataFimIso = obterFimDiaISO(ymdFim);
    const inicio = new Date(dataInicioIso);
    const fim = new Date(dataFimIso);

    const diffMs = Math.max(0, fim.getTime() - inicio.getTime());
    const dias = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

    return {
      dataInicio: inicio,
      dataFim: fim,
      dataInicioIso,
      dataFimIso,
      label: 'Personalizado',
      diasIntervalo: dias
    };
  }

  if (tipoPeriodo === 'hoje') {
    const ref = new Date(Date.UTC(anoHoje, mesHoje - 1, diaHoje + periodoOffset, 12, 0, 0));
    const ymd = formatarYmdUTC(ref);
    const dataInicioIso = obterInicioDiaISO(ymd);
    const dataFimIso = obterFimDiaISO(ymd);
    const label = periodoOffset === 0 ? 'Hoje' : periodoOffset === -1 ? 'Ontem' : formatarDataLocal(ymd);
    return {
      dataInicio: new Date(dataInicioIso),
      dataFim: new Date(dataFimIso),
      dataInicioIso,
      dataFimIso,
      label,
      diasIntervalo: 1
    };
  }

  if (tipoPeriodo === 'ontem') {
    const ref = new Date(Date.UTC(anoHoje, mesHoje - 1, diaHoje - 1 + periodoOffset, 12, 0, 0));
    const ymd = formatarYmdUTC(ref);
    const dataInicioIso = obterInicioDiaISO(ymd);
    const dataFimIso = obterFimDiaISO(ymd);
    return {
      dataInicio: new Date(dataInicioIso),
      dataFim: new Date(dataFimIso),
      dataInicioIso,
      dataFimIso,
      label: 'Ontem',
      diasIntervalo: 1
    };
  }

  if (tipoPeriodo === 'esta_semana' || tipoPeriodo === 'semana_passada') {
    const baseOffset = tipoPeriodo === 'semana_passada' ? -7 : 0;
    const ref = new Date(Date.UTC(anoHoje, mesHoje - 1, diaHoje + baseOffset + (periodoOffset * 7), 12, 0, 0));

    const dayOfWeek = ref.getUTCDay();
    const diffToMonday = (dayOfWeek + 6) % 7;

    const refIni = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() - diffToMonday, 12, 0, 0));
    const refFim = new Date(Date.UTC(refIni.getUTCFullYear(), refIni.getUTCMonth(), refIni.getUTCDate() + 6, 12, 0, 0));
    const dataInicioIso = obterInicioDiaISO(formatarYmdUTC(refIni));
    const dataFimIso = obterFimDiaISO(formatarYmdUTC(refFim));
    const label = tipoPeriodo === 'semana_passada' ? 'Semana Passada' : 'Esta Semana';
    return {
      dataInicio: new Date(dataInicioIso),
      dataFim: new Date(dataFimIso),
      dataInicioIso,
      dataFimIso,
      label,
      diasIntervalo: 7
    };
  }

  if (tipoPeriodo === 'este_mes' || tipoPeriodo === 'mes_passado') {
    const baseOffset = tipoPeriodo === 'mes_passado' ? -1 : 0;
    const ref = new Date(Date.UTC(anoHoje, mesHoje - 1 + baseOffset + periodoOffset, 1, 12, 0, 0));
    const ano = ref.getUTCFullYear();
    const mes = ref.getUTCMonth();
    const dias = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    const ymdInicio = `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
    const ymdFim = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dias).padStart(2, '0')}`;
    const dataInicioIso = obterInicioDiaISO(ymdInicio);
    const dataFimIso = obterFimDiaISO(ymdFim);
    const label = `${MESES_COMPLETOS[mes]} de ${ano}`;
    return {
      dataInicio: new Date(dataInicioIso),
      dataFim: new Date(dataFimIso),
      dataInicioIso,
      dataFimIso,
      label,
      diasIntervalo: dias
    };
  }

  if (tipoPeriodo === 'este_ano' || tipoPeriodo === 'ano_passado') {
    const baseOffset = tipoPeriodo === 'ano_passado' ? -1 : 0;
    const ano = anoHoje + baseOffset + periodoOffset;
    const dataInicioIso = obterInicioDiaISO(`${ano}-01-01`);
    const dataFimIso = obterFimDiaISO(`${ano}-12-31`);
    const label = tipoPeriodo === 'ano_passado' && periodoOffset === 0
      ? `Ano Passado (${ano})`
      : `Ano ${ano}`;
    return {
      dataInicio: new Date(dataInicioIso),
      dataFim: new Date(dataFimIso),
      dataInicioIso,
      dataFimIso,
      label,
      diasIntervalo: 365
    };
  }

  // Fallback padrão: este mês
  const diasPadrao = new Date(Date.UTC(anoHoje, mesHoje, 0)).getUTCDate();
  const padraoInicioIso = obterInicioDiaISO(`${anoHoje}-${String(mesHoje).padStart(2, '0')}-01`);
  const padraoFimIso = obterFimDiaISO(`${anoHoje}-${String(mesHoje).padStart(2, '0')}-${String(diasPadrao).padStart(2, '0')}`);
  return {
    dataInicio: new Date(padraoInicioIso),
    dataFim: new Date(padraoFimIso),
    dataInicioIso: padraoInicioIso,
    dataFimIso: padraoFimIso,
    label: 'Este mês',
    diasIntervalo: diasPadrao
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
    meta_faturamento: Math.round(Number(metasMensais.meta_faturamento || 0) * fator * 100) / 100,
    meta_pedidos: Math.max(0, Math.round(Number(metasMensais.meta_pedidos || 0) * fator)),
    meta_lucro_liquido: Math.round(Number(metasMensais.meta_lucro_liquido || 0) * fator * 100) / 100,
    meta_ticket_medio: Number(metasMensais.meta_ticket_medio || 0),
    meta_despesas_maximas: Math.round(Number(metasMensais.meta_despesas_maximas ?? metasMensais.meta_despesas ?? METAS_PADRAO_LOJA.meta_despesas_maximas ?? 0) * fator * 100) / 100,
    meta_inadimplencia_maxima: Number(metasMensais.meta_inadimplencia_maxima || 0),
    meta_giro_estoque: Number(metasMensais.meta_giro_estoque || 0),
    meta_saude_estoque_max_ruptura: Number(
      metasMensais.meta_saude_estoque_max_ruptura !== undefined && metasMensais.meta_saude_estoque_max_ruptura !== null
        ? metasMensais.meta_saude_estoque_max_ruptura
        : (metasMensais.meta_giro_estoque ?? 0)
    )
  };
}

/**
 * Consulta as metas cadastradas da loja ou retorna valores zerados se inexistente
 */
export async function obterMetasLoja(lojaId: string): Promise<LojaMetas> {
  const chaveStorage = `hubi_loja_metas_${lojaId}`;
  let metasCacheLocal: LojaMetas | null = null;
  try {
    const salvo = localStorage.getItem(chaveStorage);
    if (salvo) metasCacheLocal = JSON.parse(salvo);
  } catch {}

  try {
    const { data, error } = await supabase
      .from('loja_metas')
      .select('*')
      .eq('loja_id', lojaId)
      .maybeSingle();

    if (error) {
      console.warn('[dashboardService] Falha ao consultar loja_metas, adotando padrões/cache:', error.message);
      if (metasCacheLocal) return metasCacheLocal;
      return {
        id: `default-${lojaId}`,
        loja_id: lojaId,
        ...METAS_PADRAO_LOJA
      };
    }

    if (data) {
      const rupturaCarregada = Number(
        data.meta_saude_estoque_max_ruptura !== undefined && data.meta_saude_estoque_max_ruptura !== null
          ? data.meta_saude_estoque_max_ruptura
          : (data.meta_giro_estoque !== undefined && data.meta_giro_estoque !== null ? data.meta_giro_estoque : (metasCacheLocal?.meta_saude_estoque_max_ruptura ?? METAS_PADRAO_LOJA.meta_saude_estoque_max_ruptura ?? 0))
      );

      const despesasCarregada = Number(
        data.meta_despesas_maximas !== undefined && data.meta_despesas_maximas !== null
          ? data.meta_despesas_maximas
          : (data.meta_despesas !== undefined && data.meta_despesas !== null ? data.meta_despesas : (metasCacheLocal?.meta_despesas_maximas ?? METAS_PADRAO_LOJA.meta_despesas_maximas ?? 0))
      );

      const resultado: LojaMetas = {
        id: data.id,
        loja_id: data.loja_id,
        meta_faturamento: Number(data.meta_faturamento ?? METAS_PADRAO_LOJA.meta_faturamento),
        meta_pedidos: Number(data.meta_pedidos ?? METAS_PADRAO_LOJA.meta_pedidos),
        meta_lucro_liquido: Number(data.meta_lucro_liquido ?? METAS_PADRAO_LOJA.meta_lucro_liquido),
        meta_ticket_medio: Number(data.meta_ticket_medio ?? METAS_PADRAO_LOJA.meta_ticket_medio),
        meta_despesas_maximas: despesasCarregada,
        meta_inadimplencia_maxima: Number(data.meta_inadimplencia_maxima ?? METAS_PADRAO_LOJA.meta_inadimplencia_maxima),
        meta_giro_estoque: Number(data.meta_giro_estoque ?? METAS_PADRAO_LOJA.meta_giro_estoque),
        meta_saude_estoque_max_ruptura: rupturaCarregada,
        criado_em: data.criado_em,
        atualizado_em: data.atualizado_em
      };

      try {
        localStorage.setItem(chaveStorage, JSON.stringify(resultado));
      } catch {}

      return resultado;
    }
  } catch (err) {
    console.warn('[dashboardService] Exceção ao buscar metas da loja:', err);
  }

  if (metasCacheLocal) return metasCacheLocal;

  return {
    id: `default-${lojaId}`,
    loja_id: lojaId,
    ...METAS_PADRAO_LOJA
  };
}

/**
 * Consulta e agrega metas de todas as lojas do conglomerado
 */
export async function obterMetasConsolidadasConglomerado(lojasIds: string[]): Promise<LojaMetas> {
  if (!lojasIds || lojasIds.length === 0) {
    return {
      id: 'consolidado-todas',
      loja_id: 'todas',
      ...METAS_PADRAO_LOJA
    };
  }

  const metasPorLoja = await Promise.all(lojasIds.map(id => obterMetasLoja(id)));

  const somaFaturamento = metasPorLoja.reduce((acc, m) => acc + Number(m.meta_faturamento || 0), 0);
  const somaPedidos = metasPorLoja.reduce((acc, m) => acc + Number(m.meta_pedidos || 0), 0);
  const somaLucro = metasPorLoja.reduce((acc, m) => acc + Number(m.meta_lucro_liquido || 0), 0);
  const somaDespesas = metasPorLoja.reduce((acc, m) => acc + Number(m.meta_despesas_maximas || 0), 0);
  const somaRupturas = metasPorLoja.reduce(
    (acc, m) => acc + Number(m.meta_saude_estoque_max_ruptura !== undefined && m.meta_saude_estoque_max_ruptura !== null ? m.meta_saude_estoque_max_ruptura : (m.meta_giro_estoque ?? 0)),
    0
  );
  const ticketMedioPonderado = somaPedidos > 0 ? Math.round((somaFaturamento / somaPedidos) * 100) / 100 : Number(METAS_PADRAO_LOJA.meta_ticket_medio);
  const mediaInadimplencia = metasPorLoja.length > 0
    ? metasPorLoja.reduce((acc, m) => acc + Number(m.meta_inadimplencia_maxima || 0), 0) / metasPorLoja.length
    : Number(METAS_PADRAO_LOJA.meta_inadimplencia_maxima);
  const mediaGiro = metasPorLoja.length > 0
    ? metasPorLoja.reduce((acc, m) => acc + Number(m.meta_giro_estoque || 0), 0) / metasPorLoja.length
    : Number(METAS_PADRAO_LOJA.meta_giro_estoque);

  return {
    id: 'consolidado-todas',
    loja_id: 'todas',
    meta_faturamento: somaFaturamento,
    meta_pedidos: somaPedidos,
    meta_lucro_liquido: somaLucro,
    meta_ticket_medio: ticketMedioPonderado,
    meta_despesas_maximas: somaDespesas,
    meta_inadimplencia_maxima: Math.round(mediaInadimplencia * 100) / 100,
    meta_giro_estoque: Math.round(mediaGiro * 100) / 100,
    meta_saude_estoque_max_ruptura: somaRupturas
  };
}

/**
 * Salva ou atualiza as metas da loja via upsert na tabela loja_metas ou RPC segura
 */
export async function salvarMetasLoja(
  lojaId: string,
  metas: Partial<LojaMetas>,
  usuarioId?: string
): Promise<LojaMetas> {
  const rupturaValor = Number(
    metas.meta_saude_estoque_max_ruptura !== undefined && metas.meta_saude_estoque_max_ruptura !== null
      ? metas.meta_saude_estoque_max_ruptura
      : (metas.meta_giro_estoque ?? METAS_PADRAO_LOJA.meta_saude_estoque_max_ruptura ?? 0)
  );

  const despesasValor = Number(
    metas.meta_despesas_maximas !== undefined && metas.meta_despesas_maximas !== null
      ? metas.meta_despesas_maximas
      : (metas.meta_despesas ?? METAS_PADRAO_LOJA.meta_despesas_maximas ?? 0.0)
  );

  const numFaturamento = Number(metas.meta_faturamento ?? METAS_PADRAO_LOJA.meta_faturamento);
  const numPedidos = Math.max(0, Math.round(Number(metas.meta_pedidos ?? METAS_PADRAO_LOJA.meta_pedidos)));
  const numLucro = Number(metas.meta_lucro_liquido ?? METAS_PADRAO_LOJA.meta_lucro_liquido);
  const numTicket = Number(metas.meta_ticket_medio ?? METAS_PADRAO_LOJA.meta_ticket_medio);
  const numInadimplencia = Number(metas.meta_inadimplencia_maxima ?? METAS_PADRAO_LOJA.meta_inadimplencia_maxima);

  const operadorId = usuarioId || (typeof localStorage !== 'undefined' ? localStorage.getItem('hubi_active_usuario_id') : null) || null;

  // 1. Reconciliação prévia da sessão ativa do Supabase Auth para blindagem de RLS
  try {
    const { data: sessaoData } = await supabase.auth.getSession();
    if (sessaoData?.session?.user) {
      await supabase.rpc('sincronizar_meu_usuario_auth');
    }
  } catch {}

  // 2. Estratégia Principal: Executar via RPC segura SECURITY DEFINER com suporte a auth.uid() e operador local
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('salvar_loja_metas_seguro', {
      p_loja_id: lojaId,
      p_meta_faturamento: numFaturamento,
      p_meta_pedidos: numPedidos,
      p_meta_lucro_liquido: numLucro,
      p_meta_ticket_medio: numTicket,
      p_meta_despesas_maximas: despesasValor,
      p_meta_inadimplencia_maxima: numInadimplencia,
      p_meta_giro_estoque: rupturaValor,
      p_meta_saude_estoque_max_ruptura: rupturaValor,
      p_usuario_id: operadorId
    });

    if (!rpcError && rpcData) {
      const resultado: LojaMetas = {
        id: rpcData.id,
        loja_id: rpcData.loja_id,
        meta_faturamento: Number(rpcData.meta_faturamento ?? numFaturamento),
        meta_pedidos: Number(rpcData.meta_pedidos ?? numPedidos),
        meta_lucro_liquido: Number(rpcData.meta_lucro_liquido ?? numLucro),
        meta_ticket_medio: Number(rpcData.meta_ticket_medio ?? numTicket),
        meta_despesas_maximas: Number(rpcData.meta_despesas_maximas ?? despesasValor),
        meta_inadimplencia_maxima: Number(rpcData.meta_inadimplencia_maxima ?? numInadimplencia),
        meta_giro_estoque: Number(rpcData.meta_giro_estoque ?? rupturaValor),
        meta_saude_estoque_max_ruptura: Number(rpcData.meta_saude_estoque_max_ruptura ?? rupturaValor),
        criado_em: rpcData.criado_em,
        atualizado_em: rpcData.atualizado_em
      };

      try {
        localStorage.setItem(`hubi_loja_metas_${lojaId}`, JSON.stringify(resultado));
      } catch {}

      return resultado;
    }

    if (rpcError) {
      console.warn('[dashboardService] RPC salvar_loja_metas_seguro indisponível ou recusada, usando fallback direto:', rpcError.message);
    }
  } catch (rpcErr) {
    console.warn('[dashboardService] Exceção na RPC salvar_loja_metas_seguro, usando fallback direto:', rpcErr);
  }

  // 3. Estratégia Fallback: Upsert direto via Supabase Client com cláusula multitenant explícita
  const payload: any = {
    loja_id: lojaId,
    meta_faturamento: numFaturamento,
    meta_pedidos: numPedidos,
    meta_lucro_liquido: numLucro,
    meta_ticket_medio: numTicket,
    meta_despesas_maximas: despesasValor,
    meta_inadimplencia_maxima: numInadimplencia,
    meta_giro_estoque: rupturaValor,
    meta_saude_estoque_max_ruptura: rupturaValor,
    atualizado_em: new Date().toISOString()
  };

  let { data, error } = await supabase
    .from('loja_metas')
    .upsert(payload, { onConflict: 'loja_id' })
    .select()
    .single();

  // Fallback gracioso se as colunas novas ainda não existirem no cache do PostgREST
  if (error && error.message) {
    let retryNeeded = false;
    if (error.message.includes('meta_despesas_maximas')) {
      delete payload.meta_despesas_maximas;
      retryNeeded = true;
    }
    if (error.message.includes('meta_saude_estoque_max_ruptura')) {
      delete payload.meta_saude_estoque_max_ruptura;
      retryNeeded = true;
    }
    if (retryNeeded) {
      const retry = await supabase
        .from('loja_metas')
        .upsert(payload, { onConflict: 'loja_id' })
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }
  }

  if (error) {
    console.error('[dashboardService] Erro ao salvar metas da loja:', error);
    throw new Error('Não foi possível salvar as metas da loja. Por favor, verifique se possui perfil de administrador ou tente novamente.');
  }

  const resultado: LojaMetas = {
    id: data.id,
    loja_id: data.loja_id,
    meta_faturamento: Number(data.meta_faturamento),
    meta_pedidos: Number(data.meta_pedidos),
    meta_lucro_liquido: Number(data.meta_lucro_liquido),
    meta_ticket_medio: Number(data.meta_ticket_medio),
    meta_despesas_maximas: Number(data.meta_despesas_maximas ?? despesasValor),
    meta_inadimplencia_maxima: Number(data.meta_inadimplencia_maxima),
    meta_giro_estoque: Number(data.meta_giro_estoque),
    meta_saude_estoque_max_ruptura: Number(data.meta_saude_estoque_max_ruptura ?? data.meta_giro_estoque ?? rupturaValor),
    criado_em: data.criado_em,
    atualizado_em: data.atualizado_em
  };

  try {
    localStorage.setItem(`hubi_loja_metas_${lojaId}`, JSON.stringify(resultado));
  } catch {}

  return resultado;
}

/**
 * Fallback resiliente direto no Supabase Client caso a RPC esteja indisponível ou com divergência de schema
 */
async function obterMetricasCockpitFallback(
  lojaId: string,
  inicioIso: string,
  fimIso: string
): Promise<MetricasCockpit> {
  const dInicio = new Date(inicioIso);
  const dFim = new Date(fimIso);

  // 1. Busca pedidos da loja com itens e pagamentos (Regime de Caixa Real)
  const { data: pedidosData, error: pedidosErr } = await supabase
    .from('pedidos')
    .select(`
      id,
      valor_total,
      valor_pago,
      saldo_devedor,
      status,
      status_pagamento,
      eh_venda_caderneta,
      data_venda,
      data_pagamento,
      criado_em,
      itens:itens_pedido(quantidade, preco_custo_unitario),
      pagamentos:pagamentos_pedido(valor, valor_taxa, data_pagamento, eh_pagamento_fiado, eh_pagamento_caderneta)
    `)
    .eq('loja_id', lojaId)
    .neq('status', 'cancelado');

  if (pedidosErr) {
    console.error('[dashboardService] Erro no fallback de pedidos:', pedidosErr.message);
  }

  const pedidos = (pedidosData || []) as any[];

  // Filtra pedidos efetivamente recebidos (status_pagamento = 'pago') pela data do pagamento
  const pedidosFiltrados = pedidos.filter(p => {
    if (!pedidoFoiPagoRealmente(p)) return false;

    const dataReferencia = obterDataRecebimentoPedidoDate(p);
    if (Number.isNaN(dataReferencia.getTime())) return false;

    return dataReferencia >= dInicio && dataReferencia <= dFim;
  });

  const faturamento = pedidosFiltrados.reduce((acc, p) => {
    return acc + Number(p.valor_pago || p.valor_total || 0);
  }, 0);

  const qtdPedidos = pedidosFiltrados.length;
  const ticketMedio = qtdPedidos > 0 ? Math.round((faturamento / qtdPedidos) * 100) / 100 : 0;

  const cmv = pedidosFiltrados.reduce((acc, p) => {
    const custoP = (p.itens || []).reduce((cAcc: number, it: any) => {
      return cAcc + (Number(it.preco_custo_unitario || 0) * Number(it.quantidade || 1));
    }, 0);
    return acc + custoP;
  }, 0);

  // 2. Busca despesas em transações financeiras
  let despesas = 0;
  try {
    const { data: transacoes } = await supabase
      .from('transacoes_financeiras')
      .select('valor, data_pagamento, data_vencimento, criado_em, tipo, status')
      .eq('loja_id', lojaId)
      .eq('status', 'pago');

    if (transacoes) {
      despesas = transacoes
        .filter(t => {
          const tipo = String(t.tipo || '').toUpperCase();
          if (tipo !== 'SAIDA' && !tipo.startsWith('DESPESA')) return false;
          const raw = t.data_pagamento || t.data_vencimento || t.criado_em;
          if (!raw) return false;
          const trimmed = String(raw).trim();
          const dt = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
            ? new Date(`${trimmed}T12:00:00${obterOffsetISOLocal(trimmed)}`)
            : new Date(trimmed);
          if (Number.isNaN(dt.getTime())) return false;
          return dt >= dInicio && dt <= dFim;
        })
        .reduce((acc, t) => acc + Number(t.valor || 0), 0);
    }
  } catch (err) {
    console.warn('[dashboardService] Falha ao consultar despesas para fallback:', err);
  }

  const lucroLiquido = Math.round((faturamento - cmv - despesas) * 100) / 100;

  // 3. Inadimplência Fiado
  let inadimplencia = 0;
  try {
    const { data: fiados } = await supabase
      .from('pedidos')
      .select('saldo_devedor, data_vencimento_fiado')
      .eq('loja_id', lojaId)
      .neq('status', 'cancelado')
      .gt('saldo_devedor', 0);

    if (fiados && fiados.length > 0) {
      const limiteVencimento = new Date(dFim.getTime() - (30 * 24 * 60 * 60 * 1000));
      let totalVencido = 0;
      let totalDevedor = 0;

      fiados.forEach(f => {
        const saldo = Number(f.saldo_devedor || 0);
        totalDevedor += saldo;
        if (f.data_vencimento_fiado && new Date(f.data_vencimento_fiado) < limiteVencimento) {
          totalVencido += saldo;
        }
      });

      if (totalDevedor > 0) {
        inadimplencia = Math.round((totalVencido / totalDevedor) * 10000) / 100;
      }
    }
  } catch (err) {
    console.warn('[dashboardService] Falha ao consultar fiados para fallback:', err);
  }

  // 4. Giro de Estoque & Saúde do Estoque (Exclusivo para produtos físicos)
  let giroEstoque = 0;
  let itensEmRisco = 0;
  let totalProdutosFisicos = 0;
  try {
    const { data: produtos } = await supabase
      .from('produtos')
      .select('quantidade_estoque, estoque_atual, estoque_minimo_alerta, preco_venda, preco_venda_varejo, tipo_item')
      .eq('loja_id', lojaId)
      .neq('tipo_item', 'servico')
      .eq('ativo', true);

    if (produtos && produtos.length > 0) {
      totalProdutosFisicos = produtos.length;
      const valorTotalEstoque = produtos.reduce((acc, pr) => {
        const est = Number(pr.quantidade_estoque ?? pr.estoque_atual ?? 0);
        const preco = Number(pr.preco_venda_varejo ?? pr.preco_venda ?? 0);
        return acc + (est * preco);
      }, 0);

      produtos.forEach(pr => {
        const est = Number(pr.quantidade_estoque ?? pr.estoque_atual ?? 0);
        const min = Number(pr.estoque_minimo_alerta || 0);
        if (est <= 0 || (min > 0 && est <= min)) {
          itensEmRisco++;
        }
      });

      if (valorTotalEstoque > 0) {
        giroEstoque = Math.round((faturamento / valorTotalEstoque) * 10000) / 100;
      }
    }
  } catch (err) {
    console.warn('[dashboardService] Falha ao consultar estoque para fallback:', err);
  }

  const indiceRuptura = totalProdutosFisicos > 0
    ? Math.round((itensEmRisco / totalProdutosFisicos) * 1000) / 10
    : 0;

  return {
    faturamento: Math.round(faturamento * 100) / 100,
    pedidos: qtdPedidos,
    ticket_medio: ticketMedio,
    cmv: Math.round(cmv * 100) / 100,
    despesas: Math.round(despesas * 100) / 100,
    lucro_liquido: lucroLiquido,
    inadimplencia,
    giro_estoque: giroEstoque,
    saude_estoque: indiceRuptura,
    saude_estoque_itens_risco: itensEmRisco,
    saude_estoque_itens_total: totalProdutosFisicos,
    saude_estoque_tag: 'Base: Estoque Mínimo Geral'
  };
}

/**
 * Consulta consolidada das 6 métricas do Cockpit Executivo via RPC ou Fallback
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
  try {
    const { data, error } = await supabase.rpc('obter_metricas_cockpit', {
      p_loja_id: lojaId,
      p_data_inicio: inicioIso,
      p_data_fim: fimIso
    });

    if (!error && data && (data.pedidos > 0 || data.faturamento > 0 || data.despesas > 0)) {
      const metricas: MetricasCockpit = {
        faturamento: Number(data.faturamento || 0),
        pedidos: Number(data.pedidos || 0),
        ticket_medio: Number(data.ticket_medio || 0),
        cmv: Number(data.cmv || 0),
        despesas: Number(data.despesas || 0),
        lucro_liquido: Number(data.lucro_liquido || 0),
        inadimplencia: Number(data.inadimplencia || 0),
        giro_estoque: Number(data.giro_estoque || 0)
      };

      return {
        metricas,
        metasProporcionais
      };
    }

    if (error) {
      console.warn('[dashboardService] RPC obter_metricas_cockpit indisponível, usando fallback direto:', error.message);
    }
  } catch (rpcErr) {
    console.warn('[dashboardService] Exceção na RPC, usando fallback direto:', rpcErr);
  }

  // 3. Fallback inteligente e resiliente: processa diretamente via Supabase Client
  const metricasFallback = await obterMetricasCockpitFallback(lojaId, inicioIso, fimIso);

  return {
    metricas: metricasFallback,
    metasProporcionais
  };
}

/**
 * Consulta e decompõe indicadores e metas para uma lista de lojas (Visão Multilojas)
 * Utiliza Promise.allSettled e isolamento com try/catch por filial para evitar que falhas individuais travem a visualização
 */
export async function obterDesdobramentoLojas(
  lojas: { id: string; nome_fantasia?: string }[],
  paramInicio: string | PeriodoDashboard,
  paramFim?: string,
  diasIntervalo?: number
): Promise<DesdobramentoLojaItem[]> {
  if (!lojas || lojas.length === 0) return [];

  const resultadosSettled = await Promise.allSettled(
    lojas.map(async (l) => {
      try {
        const res = await obterMetricasCockpit(l.id, paramInicio, paramFim, diasIntervalo);
        return {
          lojaId: l.id,
          lojaNome: l.nome_fantasia || 'Loja',
          metricas: res.metricas,
          metasProporcionais: res.metasProporcionais
        } as DesdobramentoLojaItem;
      } catch (lojaErr) {
        console.warn(`[dashboardService] Falha ao obter métricas da loja ${l.id}:`, lojaErr);
        const metasPadrao = await obterMetasLoja(l.id).catch(() => ({
          id: 'padrao',
          loja_id: l.id,
          ...METAS_PADRAO_LOJA
        }));
        return {
          lojaId: l.id,
          lojaNome: l.nome_fantasia || 'Loja',
          metricas: {
            faturamento: 0,
            pedidos: 0,
            ticket_medio: 0,
            cmv: 0,
            despesas: 0,
            lucro_liquido: 0,
            inadimplencia: 0,
            giro_estoque: 0,
            saude_estoque: 0
          },
          metasProporcionais: metasPadrao
        } as DesdobramentoLojaItem;
      }
    })
  );

  return resultadosSettled
    .filter((r): r is PromiseFulfilledResult<DesdobramentoLojaItem> => r.status === 'fulfilled' && !!r.value)
    .map(r => r.value);
}

export const dashboardService = {
  METAS_PADRAO_LOJA,
  PERIODOS_DASHBOARD_OPCOES,
  resolverIntervaloPeriodo,
  calcularIntervaloPeriodo,
  calcularMetasProporcionais,
  obterMetasLoja,
  obterMetasConsolidadasConglomerado,
  salvarMetasLoja,
  obterMetricasCockpit,
  obterDesdobramentoLojas
};
