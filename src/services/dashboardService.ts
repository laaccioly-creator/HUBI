import { supabase } from '../lib/supabase';
import { LojaMetas, MetricasCockpit } from '../types';
import { obterDataOperacao } from '../utils/dataOperacao';

export type PeriodoDashboard = 'hoje' | 'semana' | 'mes' | 'ano';

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
 * Calcula o intervalo em formato ISO para o período especificado
 */
export function calcularIntervaloPeriodo(periodo: PeriodoDashboard): {
  dataInicio: string;
  dataFim: string;
} {
  const agora = obterDataOperacao();
  const ano = agora.getFullYear();
  const mes = agora.getMonth();
  const dia = agora.getDate();

  let inicio: Date;
  let fim: Date;

  switch (periodo) {
    case 'hoje':
      inicio = new Date(ano, mes, dia, 0, 0, 0, 0);
      fim = new Date(ano, mes, dia, 23, 59, 59, 999);
      break;
    case 'semana':
      // Início dos últimos 7 dias até o final do dia de hoje
      inicio = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
      inicio.setHours(0, 0, 0, 0);
      fim = new Date(ano, mes, dia, 23, 59, 59, 999);
      break;
    case 'mes':
      // Primeiro até o último dia do mês corrente
      inicio = new Date(ano, mes, 1, 0, 0, 0, 0);
      fim = new Date(ano, mes + 1, 0, 23, 59, 59, 999);
      break;
    case 'ano':
      // Primeiro até o último dia do ano corrente
      inicio = new Date(ano, 0, 1, 0, 0, 0, 0);
      fim = new Date(ano, 11, 31, 23, 59, 59, 999);
      break;
  }

  return {
    dataInicio: inicio.toISOString(),
    dataFim: fim.toISOString()
  };
}

/**
 * Converte as metas mensais proporcionalmente para o período selecionado
 */
export function calcularMetasProporcionais(metasMensais: LojaMetas, periodo: PeriodoDashboard): LojaMetas {
  const agora = obterDataOperacao();
  const ano = agora.getFullYear();
  const mes = agora.getMonth();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  let fator: number;
  switch (periodo) {
    case 'hoje':
      fator = 1 / diasNoMes;
      break;
    case 'semana':
      fator = 7 / diasNoMes;
      break;
    case 'mes':
      fator = 1.0;
      break;
    case 'ano':
      fator = 12.0;
      break;
  }

  return {
    ...metasMensais,
    meta_faturamento: Math.round(Number(metasMensais.meta_faturamento) * fator * 100) / 100,
    meta_pedidos: Math.max(1, Math.round(Number(metasMensais.meta_pedidos) * fator)),
    meta_lucro_liquido: Math.round(Number(metasMensais.meta_lucro_liquido) * fator * 100) / 100,
    // Ticket Médio não sofre divisão temporal (representa o tíquete médio esperado por venda)
    meta_ticket_medio: Number(metasMensais.meta_ticket_medio),
    // Taxas percentuais mantêm o teto de tolerância base
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
 * e retorna juntamente com as metas proporcionais calculadas
 */
export async function obterMetricasCockpit(
  lojaId: string,
  periodo: PeriodoDashboard
): Promise<{ metricas: MetricasCockpit; metasProporcionais: LojaMetas }> {
  const { dataInicio, dataFim } = calcularIntervaloPeriodo(periodo);

  // 1. Busca as metas da loja e converte para o período selecionado
  const metasMensais = await obterMetasLoja(lojaId);
  const metasProporcionais = calcularMetasProporcionais(metasMensais, periodo);

  // 2. Invoca a RPC atômica consolidada no PostgreSQL
  const { data, error } = await supabase.rpc('obter_metricas_cockpit', {
    p_loja_id: lojaId,
    p_data_inicio: dataInicio,
    p_data_fim: dataFim
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
  calcularIntervaloPeriodo,
  calcularMetasProporcionais,
  obterMetasLoja,
  salvarMetasLoja,
  obterMetricasCockpit
};
