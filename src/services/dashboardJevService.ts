import { supabase } from '../lib/supabase';
import { typesafeService } from './typesafeService';
import {
  dashboardService,
  TipoPeriodoDashboard,
  METAS_PADRAO_LOJA
} from './dashboardService';
import { MetricasCockpit, LojaMetas, Produto } from '../types';
import { obterDataOperacao } from '../utils/dataOperacao';

// ============================================================================
// TIPAGEM ESTRUTURADA (TYPE-SAFE SCHEMAS) DO COCKPIT EXECUTIVO COM JEV
// ============================================================================

export interface VendaSumarizada {
  id: string;
  numero_pedido: number;
  data: string;
  valor: number;
  canal: string;
  formaPagamento: string;
  status: string;
  clienteNome?: string;
}

export interface DecomposicaoFaturamento {
  vendasSumarizadas: VendaSumarizada[];
  porCanal: Record<string, { total: number; quantidade: number; percentual: number }>;
  porFormaPagamento: Record<string, { total: number; quantidade: number; percentual: number }>;
  totalFaturamento: number;
}

export interface FaixaHorariaItem {
  qtd: number;
  total: number;
  ticketMedio: number;
  label: string;
}

export interface DecomposicaoVolumePedidos {
  totalPedidos: number;
  concluidos: number;
  pendentes: number;
  cancelados: number;
  taxaConclusao: number;
  faixaPico: string;
  porFaixaHoraria: {
    madrugada: FaixaHorariaItem;
    manha: FaixaHorariaItem;
    tarde: FaixaHorariaItem;
    noite: FaixaHorariaItem;
  };
}

export interface DecomposicaoLucroLiquido {
  faturamentoBruto: number;
  cmv: number;
  taxasGateways: number;
  custosOperacionais: number;
  lucroLiquidoReal: number;
  margemLiquidaPercentual: number;
  percentualCmv: number;
  percentualTaxas: number;
  percentualDespesas: number;
}

export interface FaixaTicketDispersao {
  faixa: string;
  quantidade: number;
  percentual: number;
}

export interface DecomposicaoTicketMedio {
  ticketMedio: number;
  menorVenda: number;
  maiorVenda: number;
  quantidadeItensTotal: number;
  mediaItensPorPedido: number;
  dispersaoCompras: FaixaTicketDispersao[];
}

export interface ItemInadimplente {
  pedidoId: string;
  numeroPedido: number;
  clienteNome: string;
  clienteContatoSeguro: string;
  clienteTelefoneBruto?: string;
  valorDevido: number;
  diasAtraso: number;
  dataVencimento: string;
}

export interface DecomposicaoInadimplencia {
  totalInadimplente: number;
  totalReceber: number;
  taxaInadimplencia: number;
  itensAtrasados: ItemInadimplente[];
}

export interface ProdutoEstoqueRisco {
  id: string;
  nome: string;
  codigoInterno?: string | null;
  codigoBarras?: string | null;
  estoqueAtual: number;
  estoqueMinimo: number;
  status: 'zerado' | 'critico';
  classeAbc?: 'A' | 'B' | 'C';
  receitaAcumulada?: number;
  precoCusto?: number;
  precoVenda?: number;
  fotoUrl?: string | null;
}

export interface CurvaAbcDistribuicao {
  classeA: { qtdProdutos: number; receitaTotal: number; percentualReceita: number };
  classeB: { qtdProdutos: number; receitaTotal: number; percentualReceita: number };
  classeC: { qtdProdutos: number; receitaTotal: number; percentualReceita: number };
}

export interface DecomposicaoSaudeEstoque {
  fase: 'fase1' | 'fase2';
  subtituloTag: 'Base: Estoque Mínimo Geral' | 'Base: Curva ABC Automática';
  indiceRuptura: number; // 0% a 100% de ruptura (verde em 0%)
  totalItensMonitorados: number;
  totalItensEmRisco: number;
  produtosEmRisco: ProdutoEstoqueRisco[];
  curvaAbc?: CurvaAbcDistribuicao;
  diasHistoricoVendas: number;
}

export interface ParecerJevExecutivo {
  statusGeral: 'excelente' | 'estavel' | 'atencao' | 'critico';
  diagnosticoRapido: string;
  prioridadeImediata: string;
  alertaCritico: boolean;
  confianca: number;
  geradoPorJev: boolean;
}

export interface PayloadDashboardExecutivo {
  lojaId: string;
  periodo: TipoPeriodoDashboard;
  intervalo: {
    inicioIso: string;
    fimIso: string;
    label: string;
    dias: number;
  };
  metricas: MetricasCockpit;
  metasProporcionais: LojaMetas;
  decomposicoes: {
    faturamento: DecomposicaoFaturamento;
    pedidos: DecomposicaoVolumePedidos;
    lucro: DecomposicaoLucroLiquido;
    ticket: DecomposicaoTicketMedio;
    inadimplencia: DecomposicaoInadimplencia;
    saudeEstoque: DecomposicaoSaudeEstoque;
  };
  parecerJev: ParecerJevExecutivo;
  timestamp: number;
}

export interface ParametrosConsultaDashboard {
  lojaId: string;
  tipoPeriodo: TipoPeriodoDashboard;
  periodoOffset?: number;
  dataInicioCustom?: string;
  dataFimCustom?: string;
  forcarAtualizacao?: boolean;
  onBackgroundUpdate?: (novoPayload: PayloadDashboardExecutivo) => void;
}

// ============================================================================
// CACHE EM MEMÓRIA & STORAGE (STALE-WHILE-REVALIDATE - 0 MS)
// ============================================================================

interface CacheEntry {
  payload: PayloadDashboardExecutivo;
  expiraEm: number;
}

const memoryCache = new Map<string, CacheEntry>();
const TTL_CACHE_MS = 60 * 1000; // 60 segundos de frescor absoluto

function gerarChaveCache(params: ParametrosConsultaDashboard): string {
  const offset = params.periodoOffset || 0;
  const custom = `${params.dataInicioCustom || ''}_${params.dataFimCustom || ''}`;
  return `hubi_cockpit_${params.lojaId}_${params.tipoPeriodo}_${offset}_${custom}`;
}

function recuperarCache(chave: string): PayloadDashboardExecutivo | null {
  // 1. Memória RAM (instantâneo 0 ms)
  const entry = memoryCache.get(chave);
  if (entry) {
    return entry.payload;
  }

  // 2. sessionStorage (sobrevive a trocas de aba e rotas)
  try {
    const raw = sessionStorage.getItem(chave);
    if (raw) {
      const parsed: CacheEntry = JSON.parse(raw);
      if (parsed && parsed.payload) {
        memoryCache.set(chave, parsed);
        return parsed.payload;
      }
    }
  } catch (err) {
    // sessionStorage falha silenciosa se privado ou bloqueado
  }

  return null;
}

function salvarCache(chave: string, payload: PayloadDashboardExecutivo) {
  const entry: CacheEntry = {
    payload,
    expiraEm: Date.now() + TTL_CACHE_MS
  };
  memoryCache.set(chave, entry);

  try {
    sessionStorage.setItem(chave, JSON.stringify(entry));
  } catch (err) {
    // Se o storage estiver cheio, limpa chaves antigas de cockpit
    try {
      Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith('hubi_cockpit_') && k !== chave) {
          sessionStorage.removeItem(k);
        }
      });
      sessionStorage.setItem(chave, JSON.stringify(entry));
    } catch {
      // Ignora erro de cota
    }
  }
}

// Sanitização PII de telefone para conformidade LGPD
function mascararTelefone(telefone?: string | null): string {
  if (!telefone) return 'Não informado';
  const limpo = telefone.replace(/\D/g, '');
  if (limpo.length >= 10) {
    const ddd = limpo.slice(0, 2);
    const final = limpo.slice(-4);
    return `(${ddd}) 9****-${final}`;
  }
  return 'Telefone cadastrado';
}

// ============================================================================
// SERVIÇO PRINCIPAL: JEV COCKPIT SERVICE
// ============================================================================

export const dashboardJevService = {
  /**
   * Limpa o cache do dashboard (chamado após novas vendas, entradas de estoque ou pagamentos)
   */
  invalidarCache(lojaId?: string) {
    if (lojaId) {
      Array.from(memoryCache.keys()).forEach(k => {
        if (k.includes(lojaId)) memoryCache.delete(k);
      });
      try {
        Object.keys(sessionStorage).forEach(k => {
          if (k.includes(lojaId)) sessionStorage.removeItem(k);
        });
      } catch {}
    } else {
      memoryCache.clear();
      try {
        Object.keys(sessionStorage).forEach(k => {
          if (k.startsWith('hubi_cockpit_')) sessionStorage.removeItem(k);
        });
      } catch {}
    }
  },

  /**
   * Ponto de entrada Stale-While-Revalidate (SWR):
   * Retorna instantaneamente os dados em cache (0 ms) se disponíveis,
   * e revalida em background sem travar a navegação do usuário.
   */
  async obterDashboardExecutivo(params: ParametrosConsultaDashboard): Promise<{
    payload: PayloadDashboardExecutivo;
    isStale: boolean;
  }> {
    const chave = gerarChaveCache(params);
    const cacheExistente = recuperarCache(chave);
    const memoriaEntry = memoryCache.get(chave);
    const estaFresco = memoriaEntry ? memoriaEntry.expiraEm > Date.now() : false;

    // Se temos cache e não foi forçada atualização:
    if (cacheExistente && !params.forcarAtualizacao) {
      // Se ainda estiver no período de frescor absoluto (menos de 60s), retorna direto
      if (estaFresco) {
        return { payload: cacheExistente, isStale: false };
      }

      // Se estiver stale, revalida em background assincronamente e retorna o cache já
      this.executarRevalidacaoBackground(params, chave);
      return { payload: cacheExistente, isStale: true };
    }

    // Se não há cache, faz o cálculo síncrono completo
    const payloadNovo = await this.computarPayloadCompleto(params);
    salvarCache(chave, payloadNovo);
    return { payload: payloadNovo, isStale: false };
  },

  /**
   * Executa a revalidação em background sem bloquear o retorno imediato
   */
  async executarRevalidacaoBackground(params: ParametrosConsultaDashboard, chave: string) {
    try {
      const novoPayload = await this.computarPayloadCompleto(params);
      salvarCache(chave, novoPayload);
      if (params.onBackgroundUpdate) {
        params.onBackgroundUpdate(novoPayload);
      }
    } catch (err) {
      console.warn('[dashboardJevService] Falha na revalidação background:', err);
    }
  },

  /**
   * Varredura analítica única e consolidada no PostgreSQL com agregação tipada
   */
  async computarPayloadCompleto(params: ParametrosConsultaDashboard): Promise<PayloadDashboardExecutivo> {
    const { lojaId, tipoPeriodo, periodoOffset = 0, dataInicioCustom, dataFimCustom } = params;

    // 1. Resolução do intervalo de datas
    const intervalo = dashboardService.resolverIntervaloPeriodo(
      tipoPeriodo,
      periodoOffset,
      dataInicioCustom,
      dataFimCustom
    );

    const dInicio = intervalo.dataInicio;
    const dFim = intervalo.dataFim;

    // 2. Busca paralela das 4 fontes de dados isoladas por tenant (loja_id)
    const [metasLoja, pedidosRes, transacoesRes, produtosRes, historicoPrimeiraVendaRes] = await Promise.all([
      dashboardService.obterMetasLoja(lojaId),

      // Pedidos com relacionamentos analíticos
      supabase
        .from('pedidos')
        .select(`
          id,
          numero_pedido,
          valor_total,
          valor_pago,
          saldo_devedor,
          status,
          status_pagamento,
          data_venda,
          criado_em,
          origem,
          data_vencimento_fiado,
          cliente:clientes(id, nome_completo, whatsapp, telefone),
          itens:itens_pedido(id, produto_id, nome_produto, quantidade, preco_unitario, preco_custo_unitario, subtotal),
          pagamentos:pagamentos_pedido(id, valor, valor_taxa, forma_tipo, forma_nome, data_pagamento, eh_pagamento_fiado)
        `)
        .eq('loja_id', lojaId),

      // Transações financeiras (despesas do período)
      supabase
        .from('transacoes_financeiras')
        .select('id, valor, data_pagamento, criado_em, tipo, status')
        .eq('loja_id', lojaId)
        .eq('status', 'pago'),

      // Produtos ativos do catálogo
      supabase
        .from('produtos')
        .select(`
          id,
          nome,
          codigo_interno,
          codigo_barras,
          quantidade_estoque,
          estoque_minimo_alerta,
          preco_custo,
          preco_venda_varejo,
          fotos_urls,
          ativo
        `)
        .eq('loja_id', lojaId)
        .eq('ativo', true),

      // Detecção de maturidade da loja (data da primeira venda histórica)
      supabase
        .from('pedidos')
        .select('criado_em, data_venda')
        .eq('loja_id', lojaId)
        .neq('status', 'cancelado')
        .order('criado_em', { ascending: true })
        .limit(1)
        .maybeSingle()
    ]);

    const metasProporcionais = dashboardService.calcularMetasProporcionais(metasLoja, intervalo.diasIntervalo);

    const todosPedidos = (pedidosRes.data || []) as any[];
    const todasTransacoes = (transacoesRes.data || []) as any[];
    const todosProdutos = (produtosRes.data || []) as Produto[];

    // ------------------------------------------------------------------------
    // A. FILTRAGEM DE PEDIDOS DO PERÍODO
    // ------------------------------------------------------------------------
    const pedidosDoPeriodo = todosPedidos.filter(p => {
      let dataRef: Date;
      const pag = p.pagamentos && p.pagamentos.length > 0 ? p.pagamentos[0] : null;
      if (pag && pag.eh_pagamento_fiado && pag.data_pagamento) {
        dataRef = new Date(pag.data_pagamento);
      } else if (p.data_venda) {
        dataRef = new Date(p.data_venda);
      } else if (pag && pag.data_pagamento) {
        dataRef = new Date(pag.data_pagamento);
      } else {
        dataRef = new Date(p.criado_em || '');
      }

      return dataRef >= dInicio && dataRef <= dFim;
    });

    // Pedidos faturados (pagos ou parcialmente pagos, não cancelados)
    const pedidosFaturados = pedidosDoPeriodo.filter(p => {
      if (p.status === 'cancelado') return false;
      const stPag = p.status_pagamento || (Number(p.saldo_devedor) <= 0 && Number(p.valor_pago) > 0 ? 'pago' : Number(p.valor_pago) > 0 ? 'parcialmente_pago' : 'aguardando_pagamento');
      return stPag === 'pago' || stPag === 'parcialmente_pago';
    });

    // ------------------------------------------------------------------------
    // B. MÉTRICA 1: FATURAMENTO BRUTO & DECOMPOSIÇÃO
    // ------------------------------------------------------------------------
    let faturamentoBruto = 0;
    const vendasSumarizadas: VendaSumarizada[] = [];
    const porCanal: Record<string, { total: number; quantidade: number; percentual: number }> = {};
    const porFormaPagamento: Record<string, { total: number; quantidade: number; percentual: number }> = {};
    let taxasGateways = 0;

    pedidosFaturados.forEach(p => {
      const valorPedido = Number(p.valor_pago || p.valor_total || 0);
      faturamentoBruto += valorPedido;

      // Canal (origem)
      const canalRaw = (p.origem || 'pdv').toLowerCase();
      const canalFormatado = canalRaw === 'catalogo' ? 'Catálogo Online' : canalRaw === 'whatsapp' ? 'WhatsApp' : canalRaw === 'pdv' ? 'PDV Balcão' : 'Outro';
      if (!porCanal[canalFormatado]) {
        porCanal[canalFormatado] = { total: 0, quantidade: 0, percentual: 0 };
      }
      porCanal[canalFormatado].total += valorPedido;
      porCanal[canalFormatado].quantidade += 1;

      // Formas de Pagamento & Taxas
      let formaPrincipal = 'Não identificada';
      if (p.pagamentos && p.pagamentos.length > 0) {
        p.pagamentos.forEach((pg: any) => {
          const valorPg = Number(pg.valor || 0);
          const taxaPg = Number(pg.valor_taxa || 0);
          taxasGateways += taxaPg;

          const nomePg = (pg.forma_nome || pg.forma_tipo || 'Outro').trim();
          if (!porFormaPagamento[nomePg]) {
            porFormaPagamento[nomePg] = { total: 0, quantidade: 0, percentual: 0 };
          }
          porFormaPagamento[nomePg].total += valorPg;
          porFormaPagamento[nomePg].quantidade += 1;
        });
        formaPrincipal = p.pagamentos.length === 1 ? (p.pagamentos[0].forma_nome || p.pagamentos[0].forma_tipo || 'Outro') : `${p.pagamentos.length} formas`;
      } else {
        const nomePg = 'Dinheiro';
        if (!porFormaPagamento[nomePg]) {
          porFormaPagamento[nomePg] = { total: 0, quantidade: 0, percentual: 0 };
        }
        porFormaPagamento[nomePg].total += valorPedido;
        porFormaPagamento[nomePg].quantidade += 1;
        formaPrincipal = 'Dinheiro';
      }

      // Adiciona na lista resumida
      vendasSumarizadas.push({
        id: p.id,
        numero_pedido: p.numero_pedido || 0,
        data: p.data_venda || p.criado_em,
        valor: valorPedido,
        canal: canalFormatado,
        formaPagamento: formaPrincipal,
        status: p.status || 'concluido',
        clienteNome: p.cliente?.nome_completo || 'Cliente Avulso'
      });
    });

    // Calcula percentuais de canal e pagamento
    if (faturamentoBruto > 0) {
      Object.keys(porCanal).forEach(k => {
        porCanal[k].percentual = Math.round((porCanal[k].total / faturamentoBruto) * 1000) / 10;
      });
      Object.keys(porFormaPagamento).forEach(k => {
        porFormaPagamento[k].percentual = Math.round((porFormaPagamento[k].total / faturamentoBruto) * 1000) / 10;
      });
    }

    // ------------------------------------------------------------------------
    // C. MÉTRICA 2: VOLUME DE PEDIDOS & DECOMPOSIÇÃO
    // ------------------------------------------------------------------------
    const totalPedidosPeriodo = pedidosDoPeriodo.length;
    let pedidosConcluidos = 0;
    let pedidosPendentes = 0;
    let pedidosCancelados = 0;

    const faixaMadrugada: FaixaHorariaItem = { qtd: 0, total: 0, ticketMedio: 0, label: 'Madrugada (00h-06h)' };
    const faixaManha: FaixaHorariaItem = { qtd: 0, total: 0, ticketMedio: 0, label: 'Manhã (06h-12h)' };
    const faixaTarde: FaixaHorariaItem = { qtd: 0, total: 0, ticketMedio: 0, label: 'Tarde (12h-18h)' };
    const faixaNoite: FaixaHorariaItem = { qtd: 0, total: 0, ticketMedio: 0, label: 'Noite (18h-24h)' };

    pedidosDoPeriodo.forEach(p => {
      const st = String(p.status || '').toLowerCase();
      if (st === 'cancelado') {
        pedidosCancelados++;
      } else if (st === 'pendente' || st === 'aguardando_aprovacao') {
        pedidosPendentes++;
      } else {
        pedidosConcluidos++;
      }

      // Faixa horária de compras faturadas
      const d = new Date(p.data_venda || p.criado_em);
      const hora = d.getHours();
      const val = Number(p.valor_pago || p.valor_total || 0);

      if (hora >= 0 && hora < 6) {
        faixaMadrugada.qtd++;
        faixaMadrugada.total += val;
      } else if (hora >= 6 && hora < 12) {
        faixaManha.qtd++;
        faixaManha.total += val;
      } else if (hora >= 12 && hora < 18) {
        faixaTarde.qtd++;
        faixaTarde.total += val;
      } else {
        faixaNoite.qtd++;
        faixaNoite.total += val;
      }
    });

    [faixaMadrugada, faixaManha, faixaTarde, faixaNoite].forEach(f => {
      f.ticketMedio = f.qtd > 0 ? Math.round((f.total / f.qtd) * 100) / 100 : 0;
    });

    // Identifica faixa de pico
    const faixas = [
      { nome: 'Madrugada', qtd: faixaMadrugada.qtd },
      { nome: 'Manhã', qtd: faixaManha.qtd },
      { nome: 'Tarde', qtd: faixaTarde.qtd },
      { nome: 'Noite', qtd: faixaNoite.qtd }
    ];
    faixas.sort((a, b) => b.qtd - a.qtd);
    const faixaPico = faixas[0]?.qtd > 0 ? faixas[0].nome : 'Uniforme';

    const taxaConclusao = totalPedidosPeriodo > 0
      ? Math.round((pedidosConcluidos / totalPedidosPeriodo) * 1000) / 10
      : 100;

    // ------------------------------------------------------------------------
    // D. MÉTRICA 3: LUCRO LÍQUIDO REAL (MINI DRE) & DECOMPOSIÇÃO
    // ------------------------------------------------------------------------
    let cmvTotal = 0;
    pedidosFaturados.forEach(p => {
      (p.itens || []).forEach((it: any) => {
        const custoUnit = Number(it.preco_custo_unitario || 0);
        const qtd = Number(it.quantidade || 1);
        cmvTotal += custoUnit * qtd;
      });
    });

    // Despesas operacionais do período
    let custosOperacionais = 0;
    todasTransacoes.forEach(t => {
      const tipo = String(t.tipo || '').toUpperCase();
      if (tipo === 'SAIDA' || tipo.startsWith('DESPESA')) {
        const dt = new Date(t.data_pagamento || t.criado_em);
        if (dt >= dInicio && dt <= dFim) {
          custosOperacionais += Number(t.valor || 0);
        }
      }
    });

    const lucroLiquidoReal = Math.round((faturamentoBruto - cmvTotal - taxasGateways - custosOperacionais) * 100) / 100;
    const margemLiquidaPercentual = faturamentoBruto > 0
      ? Math.round((lucroLiquidoReal / faturamentoBruto) * 1000) / 10
      : 0;

    // ------------------------------------------------------------------------
    // E. MÉTRICA 4: TICKET MÉDIO & DISPERSÃO
    // ------------------------------------------------------------------------
    const qtdPedidosValidos = pedidosFaturados.length;
    const ticketMedio = qtdPedidosValidos > 0 ? Math.round((faturamentoBruto / qtdPedidosValidos) * 100) / 100 : 0;

    let menorVenda = qtdPedidosValidos > 0 ? Number.MAX_VALUE : 0;
    let maiorVenda = 0;
    let quantidadeItensTotal = 0;

    const dispersaoContadores = {
      ate50: 0,
      de50a100: 0,
      de100a250: 0,
      acima250: 0
    };

    pedidosFaturados.forEach(p => {
      const val = Number(p.valor_pago || p.valor_total || 0);
      if (val < menorVenda) menorVenda = val;
      if (val > maiorVenda) maiorVenda = val;

      if (val <= 50) dispersaoContadores.ate50++;
      else if (val <= 100) dispersaoContadores.de50a100++;
      else if (val <= 250) dispersaoContadores.de100a250++;
      else dispersaoContadores.acima250++;

      (p.itens || []).forEach((it: any) => {
        quantidadeItensTotal += Number(it.quantidade || 1);
      });
    });

    if (menorVenda === Number.MAX_VALUE) menorVenda = 0;

    const mediaItensPorPedido = qtdPedidosValidos > 0
      ? Math.round((quantidadeItensTotal / qtdPedidosValidos) * 10) / 10
      : 0;

    const dispersaoCompras: FaixaTicketDispersao[] = [
      {
        faixa: 'Até R$ 50',
        quantidade: dispersaoContadores.ate50,
        percentual: qtdPedidosValidos > 0 ? Math.round((dispersaoContadores.ate50 / qtdPedidosValidos) * 100) : 0
      },
      {
        faixa: 'R$ 50 a R$ 100',
        quantidade: dispersaoContadores.de50a100,
        percentual: qtdPedidosValidos > 0 ? Math.round((dispersaoContadores.de50a100 / qtdPedidosValidos) * 100) : 0
      },
      {
        faixa: 'R$ 100 a R$ 250',
        quantidade: dispersaoContadores.de100a250,
        percentual: qtdPedidosValidos > 0 ? Math.round((dispersaoContadores.de100a250 / qtdPedidosValidos) * 100) : 0
      },
      {
        faixa: 'Acima de R$ 250',
        quantidade: dispersaoContadores.acima250,
        percentual: qtdPedidosValidos > 0 ? Math.round((dispersaoContadores.acima250 / qtdPedidosValidos) * 100) : 0
      }
    ];

    // ------------------------------------------------------------------------
    // F. MÉTRICA 5: INADIMPLÊNCIA FIADO & TÍTULOS EM ATRASO
    // ------------------------------------------------------------------------
    let totalDevedorGeral = 0;
    let totalInadimplente = 0;
    const itensAtrasados: ItemInadimplente[] = [];
    const agoraRef = obterDataOperacao();

    todosPedidos.forEach(p => {
      const saldo = Number(p.saldo_devedor || 0);
      if (p.status !== 'cancelado' && saldo > 0) {
        totalDevedorGeral += saldo;

        // Verifica atraso
        let dataVenc = p.data_vencimento_fiado ? new Date(p.data_vencimento_fiado) : null;
        if (!dataVenc) {
          // Se não tem vencimento explícito, assume 30 dias após a venda
          const dtVenda = new Date(p.data_venda || p.criado_em);
          dataVenc = new Date(dtVenda.getTime() + (30 * 24 * 60 * 60 * 1000));
        }

        if (dataVenc < agoraRef) {
          totalInadimplente += saldo;
          const diffDias = Math.max(1, Math.round((agoraRef.getTime() - dataVenc.getTime()) / (1000 * 60 * 60 * 24)));
          const telBruto = p.cliente?.whatsapp || p.cliente?.telefone || null;

          itensAtrasados.push({
            pedidoId: p.id,
            numeroPedido: p.numero_pedido || 0,
            clienteNome: p.cliente?.nome_completo || 'Cliente Fiado',
            clienteContatoSeguro: mascararTelefone(telBruto),
            clienteTelefoneBruto: telBruto || undefined,
            valorDevido: saldo,
            diasAtraso: diffDias,
            dataVencimento: dataVenc.toISOString()
          });
        }
      }
    });

    itensAtrasados.sort((a, b) => b.diasAtraso - a.diasAtraso);

    const taxaInadimplencia = totalDevedorGeral > 0
      ? Math.round((totalInadimplente / totalDevedorGeral) * 10000) / 100
      : 0;

    // ------------------------------------------------------------------------
    // G. MÉTRICA 6: SAÚDE DO ESTOQUE (MUDANÇA HÍBRIDA FASE 1 vs FASE 2)
    // ------------------------------------------------------------------------
    // Avaliação de maturidade da loja:
    // Primeira venda há >= 30 dias E total de pedidos históricos >= 15
    let diasHistorico = 0;
    if (historicoPrimeiraVendaRes?.data) {
      const dtPrimeira = new Date(historicoPrimeiraVendaRes.data.criado_em || historicoPrimeiraVendaRes.data.data_venda);
      diasHistorico = Math.max(0, Math.round((agoraRef.getTime() - dtPrimeira.getTime()) / (1000 * 60 * 60 * 24)));
    }

    const ehFase2Maturidade = diasHistorico >= 30 && todosPedidos.length >= 15;

    // Mapeamento de receitas por produto para a Curva ABC
    const receitaPorProduto = new Map<string, number>();
    todosPedidos.forEach(p => {
      if (p.status !== 'cancelado') {
        (p.itens || []).forEach((it: any) => {
          if (it.produto_id) {
            const sub = Number(it.subtotal || (Number(it.preco_unitario || 0) * Number(it.quantidade || 1)));
            receitaPorProduto.set(it.produto_id, (receitaPorProduto.get(it.produto_id) || 0) + sub);
          }
        });
      }
    });

    // Ordenação do catálogo por faturamento acumulado
    const produtosOrdenados = [...todosProdutos].sort((a, b) => {
      const recA = receitaPorProduto.get(a.id) || 0;
      const recB = receitaPorProduto.get(b.id) || 0;
      return recB - recA;
    });

    const receitaTotalCatalogo = Array.from(receitaPorProduto.values()).reduce((acc, v) => acc + v, 0);

    // Classificação ABC dos produtos
    let receitaAcumulada = 0;
    const classeAProdutos: Produto[] = [];
    const classeBProdutos: Produto[] = [];
    const classeCProdutos: Produto[] = [];

    let receitaClasseA = 0;
    let receitaClasseB = 0;
    let receitaClasseC = 0;

    produtosOrdenados.forEach(prod => {
      const rec = receitaPorProduto.get(prod.id) || 0;
      receitaAcumulada += rec;
      const pctAcumulado = receitaTotalCatalogo > 0 ? (receitaAcumulada / receitaTotalCatalogo) * 100 : 0;

      if (pctAcumulado <= 80 || (classeAProdutos.length === 0 && rec > 0)) {
        classeAProdutos.push(prod);
        receitaClasseA += rec;
      } else if (pctAcumulado <= 95) {
        classeBProdutos.push(prod);
        receitaClasseB += rec;
      } else {
        classeCProdutos.push(prod);
        receitaClasseC += rec;
      }
    });

    const curvaAbc: CurvaAbcDistribuicao = {
      classeA: {
        qtdProdutos: classeAProdutos.length,
        receitaTotal: Math.round(receitaClasseA * 100) / 100,
        percentualReceita: receitaTotalCatalogo > 0 ? Math.round((receitaClasseA / receitaTotalCatalogo) * 100) : 80
      },
      classeB: {
        qtdProdutos: classeBProdutos.length,
        receitaTotal: Math.round(receitaClasseB * 100) / 100,
        percentualReceita: receitaTotalCatalogo > 0 ? Math.round((receitaClasseB / receitaTotalCatalogo) * 100) : 15
      },
      classeC: {
        qtdProdutos: classeCProdutos.length,
        receitaTotal: Math.round(receitaClasseC * 100) / 100,
        percentualReceita: receitaTotalCatalogo > 0 ? Math.round((receitaClasseC / receitaTotalCatalogo) * 100) : 5
      }
    };

    let indiceRuptura = 0;
    let totalMonitorados = 0;
    let produtosEmRisco: ProdutoEstoqueRisco[] = [];
    let subtituloTag: 'Base: Estoque Mínimo Geral' | 'Base: Curva ABC Automática';

    if (ehFase2Maturidade && classeAProdutos.length > 0) {
      // Fase 2: Monitora exclusivamente a Classe A
      subtituloTag = 'Base: Curva ABC Automática';
      totalMonitorados = classeAProdutos.length;

      classeAProdutos.forEach(p => {
        const estoque = Number(p.quantidade_estoque || 0);
        const minimo = Number(p.estoque_minimo_alerta || 0);
        if (estoque <= 0 || estoque <= minimo) {
          produtosEmRisco.push({
            id: p.id,
            nome: p.nome,
            codigoInterno: p.codigo_interno,
            codigoBarras: p.codigo_barras,
            estoqueAtual: estoque,
            estoqueMinimo: minimo,
            status: estoque <= 0 ? 'zerado' : 'critico',
            classeAbc: 'A',
            receitaAcumulada: receitaPorProduto.get(p.id) || 0,
            precoCusto: p.preco_custo,
            precoVenda: p.preco_venda_varejo,
            fotoUrl: p.fotos_urls && p.fotos_urls.length > 0 ? p.fotos_urls[0] : null
          });
        }
      });

      indiceRuptura = totalMonitorados > 0
        ? Math.round((produtosEmRisco.length / totalMonitorados) * 1000) / 10
        : 0;
    } else {
      // Fase 1: Cold Start / Implantação - Ruptura geral do estoque
      subtituloTag = 'Base: Estoque Mínimo Geral';
      totalMonitorados = todosProdutos.length;

      todosProdutos.forEach(p => {
        const estoque = Number(p.quantidade_estoque || 0);
        const minimo = Number(p.estoque_minimo_alerta || 0);
        if (estoque <= 0 || (minimo > 0 && estoque <= minimo)) {
          produtosEmRisco.push({
            id: p.id,
            nome: p.nome,
            codigoInterno: p.codigo_interno,
            codigoBarras: p.codigo_barras,
            estoqueAtual: estoque,
            estoqueMinimo: minimo,
            status: estoque <= 0 ? 'zerado' : 'critico',
            classeAbc: classeAProdutos.some(ca => ca.id === p.id) ? 'A' : classeBProdutos.some(cb => cb.id === p.id) ? 'B' : 'C',
            receitaAcumulada: receitaPorProduto.get(p.id) || 0,
            precoCusto: p.preco_custo,
            precoVenda: p.preco_venda_varejo,
            fotoUrl: p.fotos_urls && p.fotos_urls.length > 0 ? p.fotos_urls[0] : null
          });
        }
      });

      indiceRuptura = totalMonitorados > 0
        ? Math.round((produtosEmRisco.length / totalMonitorados) * 1000) / 10
        : 0;
    }

    // Ordena produtos em risco: zerados primeiro, depois menor estoque
    produtosEmRisco.sort((a, b) => {
      if (a.status === 'zerado' && b.status !== 'zerado') return -1;
      if (b.status === 'zerado' && a.status !== 'zerado') return 1;
      return a.estoqueAtual - b.estoqueAtual;
    });

    // ------------------------------------------------------------------------
    // H. SÍNTESE DO JEV SYSTEM 1 (AVALIAÇÃO INTELIGENTE RÁPIDA)
    // ------------------------------------------------------------------------
    const estadoJevParaAvaliar = {
      faturamento: faturamentoBruto,
      meta_faturamento: metasProporcionais.meta_faturamento,
      pedidos: qtdPedidosValidos,
      lucro_liquido: lucroLiquidoReal,
      margem_liquida_pct: margemLiquidaPercentual,
      inadimplencia_pct: taxaInadimplencia,
      saude_estoque_fase: ehFase2Maturidade ? 'fase2_curva_abc' : 'fase1_estoque_minimo',
      itens_estoque_risco: produtosEmRisco.length,
      indice_ruptura_pct: indiceRuptura
    };

    const parecerJev = await this.avaliarCockpitComJev(estadoJevParaAvaliar);

    // ------------------------------------------------------------------------
    // I. MONTAGEM FINAL DO PAYLOAD UNIFICADO & TIPADO
    // ------------------------------------------------------------------------
    const metricas: MetricasCockpit = {
      faturamento: Math.round(faturamentoBruto * 100) / 100,
      pedidos: qtdPedidosValidos,
      ticket_medio: ticketMedio,
      lucro_liquido: lucroLiquidoReal,
      inadimplencia: taxaInadimplencia,
      giro_estoque: indiceRuptura, // Mantido para compatibilidade
      saude_estoque: indiceRuptura,
      saude_estoque_fase: ehFase2Maturidade ? 'fase2' : 'fase1',
      saude_estoque_itens_risco: produtosEmRisco.length,
      saude_estoque_itens_total: totalMonitorados,
      saude_estoque_tag: subtituloTag,
      cmv: Math.round(cmvTotal * 100) / 100,
      despesas: Math.round(custosOperacionais * 100) / 100,
      taxas_gateways: Math.round(taxasGateways * 100) / 100
    };

    return {
      lojaId,
      periodo: tipoPeriodo,
      intervalo: {
        inicioIso: intervalo.dataInicioIso,
        fimIso: intervalo.dataFimIso,
        label: intervalo.label,
        dias: intervalo.diasIntervalo
      },
      metricas,
      metasProporcionais,
      decomposicoes: {
        faturamento: {
          vendasSumarizadas: vendasSumarizadas.slice(0, 50), // 50 mais recentes para performance
          porCanal,
          porFormaPagamento,
          totalFaturamento: Math.round(faturamentoBruto * 100) / 100
        },
        pedidos: {
          totalPedidos: totalPedidosPeriodo,
          concluidos: pedidosConcluidos,
          pendentes: pedidosPendentes,
          cancelados: pedidosCancelados,
          taxaConclusao,
          faixaPico,
          porFaixaHoraria: {
            madrugada: faixaMadrugada,
            manha: faixaManha,
            tarde: faixaTarde,
            noite: faixaNoite
          }
        },
        lucro: {
          faturamentoBruto: Math.round(faturamentoBruto * 100) / 100,
          cmv: Math.round(cmvTotal * 100) / 100,
          taxasGateways: Math.round(taxasGateways * 100) / 100,
          custosOperacionais: Math.round(custosOperacionais * 100) / 100,
          lucroLiquidoReal,
          margemLiquidaPercentual,
          percentualCmv: faturamentoBruto > 0 ? Math.round((cmvTotal / faturamentoBruto) * 1000) / 10 : 0,
          percentualTaxas: faturamentoBruto > 0 ? Math.round((taxasGateways / faturamentoBruto) * 1000) / 10 : 0,
          percentualDespesas: faturamentoBruto > 0 ? Math.round((custosOperacionais / faturamentoBruto) * 1000) / 10 : 0
        },
        ticket: {
          ticketMedio,
          menorVenda: Math.round(menorVenda * 100) / 100,
          maiorVenda: Math.round(maiorVenda * 100) / 100,
          quantidadeItensTotal,
          mediaItensPorPedido,
          dispersaoCompras
        },
        inadimplencia: {
          totalInadimplente: Math.round(totalInadimplente * 100) / 100,
          totalReceber: Math.round(totalDevedorGeral * 100) / 100,
          taxaInadimplencia,
          itensAtrasados: itensAtrasados.slice(0, 30)
        },
        saudeEstoque: {
          fase: ehFase2Maturidade ? 'fase2' : 'fase1',
          subtituloTag,
          indiceRuptura,
          totalItensMonitorados: totalMonitorados,
          totalItensEmRisco: produtosEmRisco.length,
          produtosEmRisco: produtosEmRisco.slice(0, 50),
          curvaAbc,
          diasHistoricoVendas: diasHistorico
        }
      },
      parecerJev,
      timestamp: Date.now()
    };
  },

  /**
   * Avaliação executiva rápida via Jev (TypeSafe System 1)
   * com orçamento estrito de latência (1200ms) e fallback determinístico
   */
  async avaliarCockpitComJev(estado: Record<string, unknown>): Promise<ParecerJevExecutivo> {
    const faturamento = Number(estado.faturamento || 0);
    const metaFat = Number(estado.meta_faturamento || 1);
    const lucro = Number(estado.lucro_liquido || 0);
    const inadimplencia = Number(estado.inadimplencia_pct || 0);
    const itensRisco = Number(estado.itens_estoque_risco || 0);
    const indiceRuptura = Number(estado.indice_ruptura_pct || 0);

    // Heurística local de fallback imediato (0 ms)
    const obterFallback = (): ParecerJevExecutivo => {
      let status: 'excelente' | 'estavel' | 'atencao' | 'critico' = 'estavel';
      let diag = 'Operação equilibrada com fluxo comercial dentro da normalidade.';
      let prioridade = 'Manter ritmo de vendas e acompanhar reposição de itens de alto giro.';
      let alerta = false;

      if (lucro < 0 || inadimplencia > 15 || indiceRuptura > 25) {
        status = 'critico';
        alerta = true;
        if (lucro < 0) {
          diag = 'Atenção imediata: margem líquida negativa no período analisado.';
          prioridade = 'Rever custos de compra (CMV) e frear despesas operacionais não essenciais.';
        } else if (indiceRuptura > 25) {
          diag = 'Alerta de desabastecimento: volume crítico de itens em risco de ruptura.';
          prioridade = 'Emitir pedidos urgentes aos fornecedores para os produtos de maior saída.';
        } else {
          diag = 'Alerta de crédito: índice de inadimplência fiado acima do teto de segurança.';
          prioridade = 'Suspender novas vendas a prazo para clientes com títulos em atraso.';
        }
      } else if (faturamento >= metaFat && lucro > 0) {
        status = 'excelente';
        diag = 'Excelente desempenho operacional: meta de receita atingida com margem saudável.';
        prioridade = 'Potencializar canais online e fidelizar clientes da base.';
      } else if (itensRisco > 0 || inadimplencia > 5) {
        status = 'atencao';
        diag = 'Atenção preventiva a itens com estoque baixo e contas a receber.';
        prioridade = 'Realizar reposição preventiva de estoque e régua de cobrança suave.';
      }

      return {
        statusGeral: status,
        diagnosticoRapido: diag,
        prioridadeImediata: prioridade,
        alertaCritico: alerta,
        confianca: 0.95,
        geradoPorJev: false
      };
    };

    try {
      const perguntas = {
        status_geral: typesafeService.criarChoice(
          'Classifique a saúde executiva da loja com base nos indicadores consolidados:',
          {
            excelente: 'Faturamento acima da meta, lucro positivo e estoque protegido.',
            estavel: 'Operação padrão, indicadores em linha com o esperado do varejo.',
            atencao: 'Algum indicador em alerta (inadimplência leve, estoque baixo ou margem apertada).',
            critico: 'Prejuízo operacional, desabastecimento expressivo ou inadimplência muito alta.'
          }
        ),
        prioridade_operacional: typesafeService.criarChoice(
          'Qual a prioridade executiva mais urgente para o gestor neste momento?',
          {
            repor_estoque_a: 'Repor urgentemente itens da Curva A ou estoque zerado.',
            cobrar_inadimplentes: 'Recuperar valores fiados em atraso.',
            reduzir_despesas: 'Reduzir custos e despesas para recompor o lucro líquido.',
            alavancar_ticket: 'Treinar equipe para vendas casadas e aumento de ticket médio.',
            manter_ritmo: 'Operação ótima, manter rotina e ritmo comercial.'
          }
        ),
        alerta_critico_urgente: typesafeService.criarNoul(
          'Existe risco grave que demanda ação corretiva imediata hoje?',
          {
            true: 'Sim, situação urgente requer atuação da gerência.',
            false: 'Não, indicadores dentro da tolerância normal.'
          }
        )
      };

      const res = await typesafeService.avaliar(estado, perguntas, 'jev-latest', 1200);

      const respStatus = res.answers.status_geral;
      const respPrio = res.answers.prioridade_operacional;
      const respAlerta = res.answers.alerta_critico_urgente;

      const fallback = obterFallback();

      const statusGeral = respStatus?.type === 'choice'
        ? (respStatus.choice as any)
        : fallback.statusGeral;

      const prioridadeMap: Record<string, string> = {
        repor_estoque_a: 'Repor urgentemente produtos Classe A em risco de desabastecimento.',
        cobrar_inadimplentes: 'Acionar régua de cobrança para títulos fiados em atraso.',
        reduzir_despesas: 'Revisar despesas operacionais e custos com taxas de pagamento.',
        alavancar_ticket: 'Estimular combos e vendas adicionais para elevar o ticket médio.',
        manter_ritmo: 'Manter rotina operacional e foco na excelência do atendimento.'
      };

      const prioridadeTexto = respPrio?.type === 'choice' && prioridadeMap[respPrio.choice]
        ? prioridadeMap[respPrio.choice]
        : fallback.prioridadeImediata;

      const alertaCritico = respAlerta?.type === 'noul'
        ? respAlerta.noul > 0.6
        : fallback.alertaCritico;

      return {
        statusGeral,
        diagnosticoRapido: fallback.diagnosticoRapido,
        prioridadeImediata: prioridadeTexto,
        alertaCritico,
        confianca: respStatus?.type === 'choice' ? respStatus.confidence : 0.9,
        geradoPorJev: true
      };
    } catch {
      return obterFallback();
    }
  }
};
