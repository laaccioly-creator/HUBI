import { supabase } from '../lib/supabase';
import {
  SessaoCaixa,
  MovimentacaoCaixa,
  TipoMovimentacaoCaixa,
  MetodoPagamentoCaixa,
  ResumoSessaoCaixa,
  DeclaradoPorMetodo,
  Pedido
} from '../types';
import { obterDataOperacao, obterDataOperacaoISO, formatarDataLocalYMD } from '../utils/dataOperacao';

export const caixaService = {
  /**
   * Obtém o identificador do terminal físico/navegador ativo
   */
  obterTerminalId(): string {
    const salvo = localStorage.getItem('hubi_terminal_id');
    if (salvo && salvo.trim()) return salvo.trim();
    const padrao = 'PDV-01';
    localStorage.setItem('hubi_terminal_id', padrao);
    return padrao;
  },

  /**
   * Define o identificador do terminal para este dispositivo
   */
  definirTerminalId(terminalId: string): void {
    if (!terminalId || !terminalId.trim()) return;
    localStorage.setItem('hubi_terminal_id', terminalId.trim().toUpperCase());
  },

  /**
   * Mapeia qualquer forma de pagamento textual do sistema para o enum MetodoPagamentoCaixa
   */
  mapearMetodoPagamento(forma?: string | null): MetodoPagamentoCaixa {
    if (!forma) return 'OUTROS';
    const norm = forma.toLowerCase().trim();

    if (norm.includes('dinheiro') || norm === 'cash') return 'DINHEIRO';
    if (norm.includes('pix')) return 'PIX';
    if (norm.includes('crédito') || norm.includes('credito') || norm.includes('credit')) return 'CARTAO_CREDITO';
    if (norm.includes('débito') || norm.includes('debito') || norm.includes('debit')) return 'CARTAO_DEBITO';
    return 'OUTROS';
  },

  /**
   * Consulta a sessão ativa (ABERTO) para o terminal e loja
   */
  async obterSessaoAtiva(lojaId: string, terminalId?: string): Promise<SessaoCaixa | null> {
    if (!lojaId) return null;
    const term = terminalId || this.obterTerminalId();

    try {
      const { data, error } = await supabase
        .from('sessoes_caixa')
        .select(`
          *,
          aberto_por:usuarios_loja!sessoes_caixa_aberto_por_usuario_id_fkey(*),
          fechado_por:usuarios_loja!sessoes_caixa_fechado_por_usuario_id_fkey(*)
        `)
        .eq('loja_id', lojaId)
        .eq('terminal_id', term)
        .eq('status', 'ABERTO')
        .order('aberto_em', { ascending: false })
        .limit(1);

      if (error) {
        // Fallback sem junção explícita de foreign key caso o cache de relacionamentos do PostgREST ainda esteja indexando
        const { data: fallbackData } = await supabase
          .from('sessoes_caixa')
          .select('*')
          .eq('loja_id', lojaId)
          .eq('terminal_id', term)
          .eq('status', 'ABERTO')
          .order('aberto_em', { ascending: false })
          .limit(1);

        return fallbackData && fallbackData.length > 0 ? (fallbackData[0] as SessaoCaixa) : null;
      }

      return data && data.length > 0 ? (data[0] as SessaoCaixa) : null;
    } catch (err) {
      console.error('Erro ao consultar sessão ativa de caixa:', err);
      return null;
    }
  },

  /**
   * Localiza qualquer sessão de caixa aberta na loja (para atribuir vendas do catálogo online / Mercado Pago)
   */
  async obterQualquerSessaoAtiva(lojaId: string): Promise<SessaoCaixa | null> {
    if (!lojaId) return null;
    try {
      const { data, error } = await supabase
        .from('sessoes_caixa')
        .select(`
          *,
          aberto_por:usuarios_loja!sessoes_caixa_aberto_por_usuario_id_fkey(*),
          fechado_por:usuarios_loja!sessoes_caixa_fechado_por_usuario_id_fkey(*)
        `)
        .eq('loja_id', lojaId)
        .eq('status', 'ABERTO')
        .order('aberto_em', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        return data[0] as SessaoCaixa;
      }

      // Fallback simples
      const { data: fallback } = await supabase
        .from('sessoes_caixa')
        .select('*')
        .eq('loja_id', lojaId)
        .eq('status', 'ABERTO')
        .order('aberto_em', { ascending: false })
        .limit(1);

      return fallback && fallback.length > 0 ? (fallback[0] as SessaoCaixa) : null;
    } catch (err) {
      console.error('Erro ao consultar qualquer sessão ativa da loja:', err);
      return null;
    }
  },

  /**
   * Bloqueio de Concorrência e Abertura formal de Sessão de Caixa
   */
  async abrirSessao(
    lojaId: string,
    usuarioId: string,
    fundoInicial: number,
    terminalId?: string
  ): Promise<SessaoCaixa> {
    const term = terminalId || this.obterTerminalId();

    // 1. Bloqueio de Concorrência: verifica se já existe sessão aberta no terminal
    const sessaoExistente = await this.obterSessaoAtiva(lojaId, term);
    if (sessaoExistente) {
      const abertoEmStr = new Date(sessaoExistente.aberto_em).toLocaleString('pt-BR');
      throw new Error(
        `Bloqueio de Concorrência: O terminal "${term}" já possui uma sessão aberta iniciada em ${abertoEmStr}. É obrigatório realizar o fechamento formal antes de abrir uma nova sessão.`
      );
    }

    const valorFundo = Math.max(0, Number(fundoInicial) || 0);

    const payload = {
      loja_id: lojaId,
      terminal_id: term,
      aberto_por_usuario_id: usuarioId,
      aberto_em: obterDataOperacaoISO(),
      fundo_inicial: valorFundo,
      status: 'ABERTO',
      saldo_esperado_dinheiro: valorFundo,
      total_entradas_sistema: 0,
      total_saidas_sistema: 0
    };

    const { data, error } = await supabase
      .from('sessoes_caixa')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      if (error.message?.includes('sessoes_caixa') || error.message?.includes('schema cache')) {
        throw new Error(
          'A tabela "sessoes_caixa" ainda não foi criada no banco de dados Supabase. Execute o script "scripts/sql_criar_modulo_sessoes_caixa.sql" no SQL Editor do Supabase para ativar o controle de caixa.'
        );
      }
      throw error;
    }
    return data as SessaoCaixa;
  },

  /**
   * Registra uma movimentação avulsa durante o turno (Suprimento, Sangria, Despesa)
   */
  async registrarMovimentacao(params: {
    lojaId: string;
    sessaoId: string;
    tipo: TipoMovimentacaoCaixa;
    metodoPagamento: MetodoPagamentoCaixa;
    valor: number;
    descricao: string;
    usuarioId: string;
    pedidoId?: string | null;
    criadoEm?: string;
  }): Promise<MovimentacaoCaixa> {
    const { lojaId, sessaoId, tipo, metodoPagamento, valor, descricao, usuarioId, pedidoId, criadoEm } = params;

    const valNum = Number(valor);
    if (isNaN(valNum) || valNum <= 0) {
      throw new Error('O valor da movimentação deve ser maior que zero.');
    }

    if (['SUPRIMENTO', 'SANGRIA', 'DESPESA'].includes(tipo) && (!descricao || !descricao.trim())) {
      throw new Error(`A justificativa/descrição é obrigatória para lançamentos de ${tipo.toLowerCase()}.`);
    }

    const payload = {
      loja_id: lojaId,
      sessao_caixa_id: sessaoId,
      pedido_id: pedidoId || null,
      tipo,
      metodo_pagamento: metodoPagamento,
      valor: valNum,
      descricao: descricao.trim(),
      criado_por_usuario_id: usuarioId,
      criado_em: criadoEm || obterDataOperacaoISO()
    };

    const { data, error } = await supabase
      .from('movimentacoes_caixa')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      if (error.message?.includes('movimentacoes_caixa') || error.message?.includes('schema cache')) {
        throw new Error(
          'A tabela "movimentacoes_caixa" ainda não foi criada no banco de dados Supabase. Execute o script "scripts/sql_criar_modulo_sessoes_caixa.sql" no SQL Editor do Supabase.'
        );
      }
      throw error;
    }
    return data as MovimentacaoCaixa;
  },

  /**
   * Registra automaticamente a entrada de uma venda finalizada no PDV ou Recebimento
   * Divide pagamentos múltiplos (ex: split Dinheiro + Pix) criando uma linha para cada modalidade
   */
  async registrarVendaPedido(params: {
    lojaId: string;
    pedido: Pedido;
    pagamentos?: Array<{ forma_nome?: string; forma_tipo?: string; valor: number }>;
    usuarioId?: string;
    terminalId?: string;
  }): Promise<MovimentacaoCaixa[]> {
    const { lojaId, pedido, pagamentos, usuarioId, terminalId } = params;

    // Localiza a sessão aberta (pelo terminal específico ou qualquer sessão ativa da loja)
    let sessaoAtiva: SessaoCaixa | null = null;
    if (terminalId) {
      sessaoAtiva = await this.obterSessaoAtiva(lojaId, terminalId);
    }
    if (!sessaoAtiva) {
      sessaoAtiva = await this.obterQualquerSessaoAtiva(lojaId);
    }

    if (!sessaoAtiva) {
      // Se não houver sessão de caixa aberta, não gera movimentações automáticas de gaveta
      return [];
    }

    // 1. Evitar duplicação: verifica se já existem movimentações registradas para este pedido nesta sessão
    if (pedido.id) {
      const { data: movsExistentes } = await supabase
        .from('movimentacoes_caixa')
        .select('id')
        .eq('sessao_caixa_id', sessaoAtiva.id)
        .eq('pedido_id', pedido.id);

      if (movsExistentes && movsExistentes.length > 0) {
        return [];
      }
    }

    const usuarioEfetivoId = usuarioId || sessaoAtiva.aberto_por_usuario_id || '00000000-0000-0000-0000-000000000000';
    const numPedidoStr = pedido.numero_pedido ? `#${pedido.numero_pedido}` : pedido.id.slice(0, 8);
    const dataCriacaoIso = pedido.data_venda || pedido.criado_em || undefined;
    const descOrigem = pedido.origem === 'catalogo_online' ? 'Catálogo' : 'Venda';
    const movsCriadas: MovimentacaoCaixa[] = [];

    // Se temos pagamentos divididos especificados
    if (pagamentos && pagamentos.length > 0) {
      for (const pag of pagamentos) {
        const val = Number(pag.valor);
        if (val <= 0) continue;
        const metodo = this.mapearMetodoPagamento(pag.forma_nome || pag.forma_tipo);
        const mov = await this.registrarMovimentacao({
          lojaId,
          sessaoId: sessaoAtiva.id,
          tipo: 'VENDA',
          metodoPagamento: metodo,
          valor: val,
          descricao: `${descOrigem} ${numPedidoStr} (${pag.forma_nome || metodo})`,
          usuarioId: usuarioEfetivoId,
          pedidoId: pedido.id,
          criadoEm: dataCriacaoIso
        });
        movsCriadas.push(mov);
      }
    } else {
      // Pagamento único usando o valor total pago do pedido
      const valTotal = Number(pedido.valor_pago || pedido.valor_total || 0);
      if (valTotal > 0) {
        const metodo = this.mapearMetodoPagamento((pedido as any).forma_pagamento_padrao || (pedido as any).forma_pagamento || (pedido.origem === 'catalogo_online' ? 'CARTAO_CREDITO' : 'DINHEIRO'));
        const mov = await this.registrarMovimentacao({
          lojaId,
          sessaoId: sessaoAtiva.id,
          tipo: 'VENDA',
          metodoPagamento: metodo,
          valor: valTotal,
          descricao: `${descOrigem} ${numPedidoStr}`,
          usuarioId: usuarioEfetivoId,
          pedidoId: pedido.id,
          criadoEm: dataCriacaoIso
        });
        movsCriadas.push(mov);
      }
    }

    return movsCriadas;
  },

  /**
   * Consolida o resumo analítico e em tempo real da sessão (sem filtros por data-calendário)
   */
  async obterResumoSessao(sessaoId: string): Promise<ResumoSessaoCaixa> {
    // 1. Busca os dados da sessão
    const { data: sessaoData, error: errSessao } = await supabase
      .from('sessoes_caixa')
      .select('*')
      .eq('id', sessaoId)
      .single();

    if (errSessao || !sessaoData) {
      throw new Error(`Sessão de caixa com ID ${sessaoId} não encontrada.`);
    }

    const sessao = sessaoData as SessaoCaixa;

    // 2. Busca TODAS as movimentações vinculadas estritamente a esta sessão
    const { data: movsData, error: errMovs } = await supabase
      .from('movimentacoes_caixa')
      .select('*')
      .eq('sessao_caixa_id', sessaoId)
      .order('criado_em', { ascending: true });

    if (errMovs) throw errMovs;
    let movimentacoes = (movsData || []) as MovimentacaoCaixa[];

    // 2.1 Sincronização automática: verificar se há vendas pagas (ex: Catálogo Online / Mercado Pago)
    // ocorridas durante o período desta sessão que ainda não possuem movimentação registrada no caixa
    try {
      const tsAbertura = new Date(sessao.aberto_em).getTime();
      const tsFechamento = sessao.fechado_em ? new Date(sessao.fechado_em).getTime() : Infinity;

      const { data: pedsLoja } = await supabase
        .from('pedidos')
        .select('*, pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*))')
        .eq('loja_id', sessao.loja_id)
        .eq('status_pagamento', 'pago');

      if (pedsLoja && pedsLoja.length > 0) {
        const pedidosComMov = new Set(
          movimentacoes.filter(m => m.pedido_id).map(m => m.pedido_id!.toLowerCase())
        );

        const pedsPendentes = pedsLoja.filter(p => {
          if (!p.id || pedidosComMov.has(p.id.toLowerCase())) return false;
          const dataIso = p.data_venda || p.criado_em;
          if (!dataIso) return false;
          const tsP = new Date(dataIso).getTime();
          // Permite pedidos ocorridos desde a abertura da sessão (com tolerância de 5 minutos antes para checkout iniciado antes da abertura formal)
          return tsP >= (tsAbertura - 5 * 60 * 1000) && tsP <= tsFechamento;
        });

        for (const p of pedsPendentes) {
          const usuarioId = sessao.aberto_por_usuario_id;
          const dataCriacaoIso = p.data_venda || p.criado_em || obterDataOperacaoISO();
          const numPedidoStr = p.numero_pedido ? `#${p.numero_pedido}` : p.id.slice(0, 6);
          const descOrigem = p.origem === 'catalogo_online' ? 'Catálogo' : 'Venda';

          if (p.pagamentos && p.pagamentos.length > 0) {
            for (const pag of p.pagamentos) {
              const val = Number(pag.valor || 0);
              if (val <= 0) continue;
              const metodo = this.mapearMetodoPagamento(pag.forma_pagamento?.tipo || pag.forma_pagamento?.nome);
              const descFp = pag.forma_pagamento?.nome || metodo;

              const novaMov = await this.registrarMovimentacao({
                lojaId: sessao.loja_id,
                sessaoId: sessao.id,
                tipo: 'VENDA',
                metodoPagamento: metodo,
                valor: val,
                descricao: `${descOrigem} ${numPedidoStr} (${descFp})`,
                usuarioId: usuarioId || '00000000-0000-0000-0000-000000000000',
                pedidoId: p.id,
                criadoEm: dataCriacaoIso
              });
              movimentacoes.push(novaMov);
            }
          } else {
            const valTotal = Number(p.valor_pago || p.valor_total || 0);
            if (valTotal > 0) {
              const metodo = p.origem === 'catalogo_online' ? 'CARTAO_CREDITO' : 'DINHEIRO';
              const novaMov = await this.registrarMovimentacao({
                lojaId: sessao.loja_id,
                sessaoId: sessao.id,
                tipo: 'VENDA',
                metodoPagamento: metodo,
                valor: valTotal,
                descricao: `${descOrigem} ${numPedidoStr} (Online)`,
                usuarioId: usuarioId || '00000000-0000-0000-0000-000000000000',
                pedidoId: p.id,
                criadoEm: dataCriacaoIso
              });
              movimentacoes.push(novaMov);
            }
          }
          pedidosComMov.add(p.id.toLowerCase());
        }
      }
    } catch (errSync) {
      console.warn('Aviso ao sincronizar vendas online na sessão de caixa:', errSync);
    }

    let totalVendasDinheiro = 0;
    let totalVendasPix = 0;
    let totalVendasCredito = 0;
    let totalVendasDebito = 0;
    let totalVendasOutros = 0;
    let qtdVendasDinheiro = 0;
    let qtdVendasPix = 0;
    let qtdVendasCredito = 0;
    let qtdVendasDebito = 0;
    let qtdVendasOutros = 0;
    let totalSuprimentos = 0;
    let totalSangrias = 0;
    let totalDespesas = 0;

    for (const m of movimentacoes) {
      const v = Number(m.valor || 0);
      if (m.tipo === 'VENDA') {
        switch (m.metodo_pagamento) {
          case 'DINHEIRO':
            totalVendasDinheiro += v;
            qtdVendasDinheiro += 1;
            break;
          case 'PIX':
            totalVendasPix += v;
            qtdVendasPix += 1;
            break;
          case 'CARTAO_CREDITO':
            totalVendasCredito += v;
            qtdVendasCredito += 1;
            break;
          case 'CARTAO_DEBITO':
            totalVendasDebito += v;
            qtdVendasDebito += 1;
            break;
          default:
            totalVendasOutros += v;
            qtdVendasOutros += 1;
            break;
        }
      } else if (m.tipo === 'SUPRIMENTO') {
        totalSuprimentos += v;
      } else if (m.tipo === 'SANGRIA') {
        totalSangrias += v;
      } else if (m.tipo === 'DESPESA') {
        totalDespesas += v;
      }
    }

    const fundoInicial = Number(sessao.fundo_inicial || 0);
    const totalVendasGeral =
      totalVendasDinheiro + totalVendasPix + totalVendasCredito + totalVendasDebito + totalVendasOutros;

    // Fórmula canônica: Fundo Inicial + Entradas Dinheiro (Vendas) + Suprimentos - Sangrias - Despesas
    const saldoEsperadoDinheiro =
      fundoInicial + totalVendasDinheiro + totalSuprimentos - totalSangrias - totalDespesas;

    // Cálculo de Duração
    const dataAbertura = new Date(sessao.aberto_em).getTime();
    const dataFim = sessao.fechado_em ? new Date(sessao.fechado_em).getTime() : Date.now();
    const diffMs = Math.max(0, dataFim - dataAbertura);
    const duracaoHoras = diffMs / (1000 * 60 * 60);

    const horasInt = Math.floor(duracaoHoras);
    const minsInt = Math.floor((duracaoHoras - horasInt) * 60);
    const duracaoFormatada = `${horasInt}h ${minsInt.toString().padStart(2, '0')}min`;
    const duracaoTexto = duracaoFormatada;

    // Alerta de turno aberto há mais de 24 horas ininterruptas
    const abertoHaMaisDe24h = sessao.status === 'ABERTO' && duracaoHoras >= 24;

    sessao.movimentacoes = movimentacoes.map(m => ({
      ...m,
      usuario: m.criado_por || m.usuario
    }));
    sessao.usuario_abertura = sessao.aberto_por || sessao.usuario_abertura;
    sessao.usuario_fechamento = sessao.fechado_por || sessao.usuario_fechamento;
    sessao.fundo_troco_inicial = fundoInicial;
    sessao.faturamento_total = totalVendasGeral;
    sessao.saldo_dinheiro_calculado = saldoEsperadoDinheiro;
    sessao.saldo_dinheiro_declarado = sessao.saldo_declarado_dinheiro;
    sessao.total_vendas_dinheiro = totalVendasDinheiro;
    sessao.total_vendas_pix = totalVendasPix;
    sessao.total_vendas_debito = totalVendasDebito;
    sessao.total_vendas_credito = totalVendasCredito;
    sessao.total_vendas_outros = totalVendasOutros;
    sessao.total_suprimentos = totalSuprimentos;
    sessao.total_sangrias = totalSangrias;
    sessao.total_despesas = totalDespesas;

    return {
      sessao,
      fundoInicial,
      totalVendasDinheiro,
      totalVendasPix,
      totalVendasCredito,
      totalVendasDebito,
      totalVendasOutros,
      totalVendasGeral,
      faturamentoTotalVendas: totalVendasGeral,
      totalSuprimentos,
      totalSangrias,
      totalDespesas,
      saldoEsperadoDinheiro,
      duracaoHoras,
      duracaoFormatada,
      duracaoTexto,
      abertoHaMaisDe24h,
      contagemMovimentacoes: movimentacoes.length,
      totaisPorMetodo: {
        dinheiro: totalVendasDinheiro,
        pix: totalVendasPix,
        cartao_credito: totalVendasCredito,
        cartao_debito: totalVendasDebito,
        outros: totalVendasOutros
      },
      qtdVendasPorMetodo: {
        dinheiro: qtdVendasDinheiro,
        pix: qtdVendasPix,
        cartao_credito: qtdVendasCredito,
        cartao_debito: qtdVendasDebito,
        outros: qtdVendasOutros
      }
    };
  },

  /**
   * Realiza o Fechamento Formal com Conferência Cega e Apuração de Sobra/Falta
   */
  async fecharSessao(params: {
    sessaoId: string;
    usuarioId: string;
    contagemDeclarada: DeclaradoPorMetodo;
    observacoes?: string;
  }): Promise<{ sessao: SessaoCaixa; resumo: ResumoSessaoCaixa; statusDiferenca: 'sobra' | 'falta' | 'exato' }> {
    const { sessaoId, usuarioId, contagemDeclarada, observacoes } = params;

    // 1. Apura o resumo teórico da sessão
    const resumo = await this.obterResumoSessao(sessaoId);
    if (resumo.sessao.status === 'FECHADO') {
      throw new Error('Esta sessão de caixa já se encontra formalmente fechada.');
    }

    const valorDeclaradoDinheiro = Number(contagemDeclarada.dinheiro || 0);
    const diferencaDinheiro = Number((valorDeclaradoDinheiro - resumo.saldoEsperadoDinheiro).toFixed(2));

    let statusDiferenca: 'sobra' | 'falta' | 'exato' = 'exato';
    if (diferencaDinheiro > 0.009) {
      statusDiferenca = 'sobra';
    } else if (diferencaDinheiro < -0.009) {
      statusDiferenca = 'falta';
    }

    const totalEntradas = resumo.totalVendasGeral + resumo.totalSuprimentos;
    const totalSaidas = resumo.totalSangrias + resumo.totalDespesas;

    const dataAbertura = new Date(resumo.sessao.aberto_em);
    let dataFechamento = obterDataOperacao();

    // Se o fechamento resultar em horário menor ou igual à abertura (ex: horário simulado estático),
    // ajusta para pelo menos 1 minuto após a abertura
    if (dataFechamento.getTime() <= dataAbertura.getTime()) {
      dataFechamento = new Date(dataAbertura.getTime() + 60 * 1000);
    }

    const payload = {
      fechado_por_usuario_id: usuarioId,
      fechado_em: dataFechamento.toISOString(),
      status: 'FECHADO',
      total_entradas_sistema: totalEntradas,
      total_saidas_sistema: totalSaidas,
      saldo_esperado_dinheiro: resumo.saldoEsperadoDinheiro,
      saldo_declarado_dinheiro: valorDeclaradoDinheiro,
      diferenca_dinheiro: diferencaDinheiro,
      declarado_por_metodo: contagemDeclarada,
      observacoes_fechamento: observacoes?.trim() || null
    };

    const { data, error } = await supabase
      .from('sessoes_caixa')
      .update(payload)
      .eq('id', sessaoId)
      .select('*')
      .single();

    if (error) throw error;

    const sessaoAtualizada: SessaoCaixa = {
      ...(data as SessaoCaixa),
      saldo_declarado_dinheiro: data.saldo_declarado_dinheiro != null ? Number(data.saldo_declarado_dinheiro) : valorDeclaradoDinheiro,
      saldo_dinheiro_declarado: data.saldo_declarado_dinheiro != null ? Number(data.saldo_declarado_dinheiro) : valorDeclaradoDinheiro
    };

    return {
      sessao: sessaoAtualizada,
      resumo,
      statusDiferenca
    };
  },

  /**
   * Lista o histórico de sessões com filtros de auditoria (drill-down e pesquisa)
   */
  async listarHistoricoSessoes(
    lojaId: string,
    filtros?: {
      dataInicio?: string;
      dataFim?: string;
      usuarioId?: string;
      statusDiferenca?: 'todos' | 'com_diferenca' | 'exato';
      terminalId?: string;
      limite?: number;
    }
  ): Promise<SessaoCaixa[]> {
    if (!lojaId) return [];

    try {
      let query = supabase
        .from('sessoes_caixa')
        .select(`
          *,
          aberto_por:usuarios_loja!sessoes_caixa_aberto_por_usuario_id_fkey(*),
          fechado_por:usuarios_loja!sessoes_caixa_fechado_por_usuario_id_fkey(*)
        `)
        .eq('loja_id', lojaId)
        .order('aberto_em', { ascending: false });

      if (filtros?.terminalId && filtros.terminalId !== 'todos') {
        query = query.eq('terminal_id', filtros.terminalId);
      }

      if (filtros?.usuarioId && filtros.usuarioId !== 'todos') {
        query = query.or(`aberto_por_usuario_id.eq.${filtros.usuarioId},fechado_por_usuario_id.eq.${filtros.usuarioId}`);
      }

      if (filtros?.dataInicio) {
        const dInicio = new Date(`${filtros.dataInicio}T00:00:00`);
        const isoInicio = !isNaN(dInicio.getTime()) ? dInicio.toISOString() : `${filtros.dataInicio}T00:00:00`;
        query = query.gte('aberto_em', isoInicio);
      }

      if (filtros?.dataFim) {
        const dFim = new Date(`${filtros.dataFim}T23:59:59.999`);
        const isoFim = !isNaN(dFim.getTime()) ? dFim.toISOString() : `${filtros.dataFim}T23:59:59.999Z`;
        query = query.lte('aberto_em', isoFim);
      }

      if (filtros?.limite) {
        query = query.limit(filtros.limite);
      } else {
        query = query.limit(50);
      }

      const { data, error } = await query;
      let rawList = (data || []) as SessaoCaixa[];
      if (error) {
        // Fallback simplificado se as chaves estrangeiras forem nomeadas diferentemente
        const fallback = await supabase
          .from('sessoes_caixa')
          .select('*')
          .eq('loja_id', lojaId)
          .order('aberto_em', { ascending: false })
          .limit(50);
        rawList = (fallback.data || []) as SessaoCaixa[];
      }

      // Buscar movimentações de todas as sessões retornadas para garantir dados analíticos detalhados
      const idsSessoes = rawList.map(s => s.id).filter(Boolean);
      const mapMovs: Record<string, MovimentacaoCaixa[]> = {};
      if (idsSessoes.length > 0) {
        try {
          const { data: movsData } = await supabase
            .from('movimentacoes_caixa')
            .select('*')
            .in('sessao_caixa_id', idsSessoes);
          if (movsData) {
            movsData.forEach((m: any) => {
              if (!mapMovs[m.sessao_caixa_id]) mapMovs[m.sessao_caixa_id] = [];
              mapMovs[m.sessao_caixa_id].push(m);
            });
          }
        } catch (e) {
          console.warn('Aviso ao carregar movimentações do histórico:', e);
        }
      }

      let lista = rawList.map(s => {
        const movs = mapMovs[s.id] || (s as any).movimentacoes || [];
        let vDinheiro = 0;
        let vPix = 0;
        let vDebito = 0;
        let vCredito = 0;
        let vOutros = 0;
        let suprimentos = 0;
        let sangrias = 0;
        let despesas = 0;

        movs.forEach((m: any) => {
          const val = Number(m.valor || 0);
          if (m.tipo === 'VENDA') {
            switch (m.metodo_pagamento) {
              case 'DINHEIRO': vDinheiro += val; break;
              case 'PIX': vPix += val; break;
              case 'CARTAO_DEBITO': vDebito += val; break;
              case 'CARTAO_CREDITO': vCredito += val; break;
              default: vOutros += val; break;
            }
          } else if (m.tipo === 'SUPRIMENTO') {
            suprimentos += val;
          } else if (m.tipo === 'SANGRIA') {
            sangrias += val;
          } else if (m.tipo === 'DESPESA') {
            despesas += val;
          }
        });

        const fundoInicial = Number(s.fundo_inicial || 0);
        const faturamento = Number(s.total_entradas_sistema || (vDinheiro + vPix + vDebito + vCredito + vOutros) || 0);

        // Saldo esperado em dinheiro na gaveta: Fundo Inicial + Vendas em Dinheiro + Suprimentos - Sangrias - Despesas
        const saldoCalculadoGaveta = fundoInicial + vDinheiro + suprimentos - sangrias - despesas;
        const saldoDinheiroEsperado = s.status === 'ABERTO'
          ? saldoCalculadoGaveta
          : (s.saldo_esperado_dinheiro != null && Number(s.saldo_esperado_dinheiro) !== fundoInicial
              ? Number(s.saldo_esperado_dinheiro)
              : saldoCalculadoGaveta);

        return {
          ...s,
          usuario_abertura: s.aberto_por || (s as any).usuario_abertura,
          usuario_fechamento: s.fechado_por || (s as any).usuario_fechamento,
          fundo_troco_inicial: fundoInicial,
          faturamento_total: faturamento,
          saldo_dinheiro_calculado: saldoDinheiroEsperado,
          saldo_dinheiro_declarado: s.saldo_declarado_dinheiro != null ? Number(s.saldo_declarado_dinheiro) : null,
          total_vendas_dinheiro: vDinheiro,
          total_vendas_pix: vPix,
          total_vendas_debito: vDebito,
          total_vendas_credito: vCredito,
          total_vendas_outros: vOutros,
          total_suprimentos: suprimentos,
          total_sangrias: sangrias,
          total_despesas: despesas,
          movimentacoes: movs
        };
      });

      if (filtros?.statusDiferenca === 'com_diferenca') {
        lista = lista.filter(s => s.diferenca_dinheiro != null && Math.abs(Number(s.diferenca_dinheiro)) >= 0.01);
      } else if (filtros?.statusDiferenca === 'exato') {
        lista = lista.filter(s => s.diferenca_dinheiro != null && Math.abs(Number(s.diferenca_dinheiro)) < 0.01);
      }

      return lista;
    } catch (err) {
      console.error('Erro ao listar histórico de sessões:', err);
      return [];
    }
  },

  /**
   * Drill-down: Obtém detalhes completos e todas as movimentações de uma sessão passada
   */
  async obterDetalhesSessao(sessaoId: string): Promise<{ sessao: SessaoCaixa; resumo: ResumoSessaoCaixa }> {
    const resumo = await this.obterResumoSessao(sessaoId);
    return { sessao: resumo.sessao, resumo };
  },

  /**
   * Formata texto em formato de comprovante térmico para compartilhamento WhatsApp e cópia
   */
  gerarTextoComprovanteFechamento(resumo: ResumoSessaoCaixa, nomeLoja?: string): string {
    const { sessao } = resumo;
    const abertoEm = new Date(sessao.aberto_em).toLocaleString('pt-BR');
    const fechadoEm = sessao.fechado_em ? new Date(sessao.fechado_em).toLocaleString('pt-BR') : 'Em Aberto';
    const dif = Number(sessao.diferenca_dinheiro || 0);

    let statusDifText = '✅ *CAIXA CONCILIADO COM EXATIDÃO (R$ 0,00)*';
    if (dif > 0.009) {
      statusDifText = `🔵 *SOBRA DE CAIXA: +R$ ${dif.toFixed(2)}*`;
    } else if (dif < -0.009) {
      statusDifText = `⚠️ *FALTA DE CAIXA: -R$ ${Math.abs(dif).toFixed(2)}*`;
    }

    const fmt = (v: number) => `R$ ${Number(v || 0).toFixed(2).padStart(8, ' ')}`;

    return [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🏢 *${(nomeLoja || 'HUBI GESTÃO & PDV').toUpperCase()}*`,
      `📑 *COMPROVANTE DE FECHAMENTO DE CAIXA*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🖥️ *Terminal:* ${sessao.terminal_id} | *Status:* ${(sessao.status || 'FECHADO').toUpperCase()}`,
      `🔑 *Sessão ID:* #${sessao.id.slice(0, 8)}`,
      `👤 *Operador:* ${sessao.fechado_por?.nome_completo || sessao.aberto_por?.nome_completo || 'Operador PDV'}`,
      `⏰ *Abertura:* ${abertoEm}`,
      `🏁 *Fechamento:* ${fechadoEm}`,
      `⏳ *Duração do Turno:* ${resumo.duracaoTexto || resumo.duracaoFormatada}`,
      `────────────────────────────────────`,
      `💵 *1. BALANÇO DA GAVETA (DINHEIRO):*`,
      `   (+) Fundo de Troco Inicial:   ${fmt(resumo.fundoInicial)}`,
      `   (+) Vendas em Dinheiro:       ${fmt(resumo.totalVendasDinheiro)}`,
      `   (+) Suprimentos (Aportes):    ${fmt(resumo.totalSuprimentos)}`,
      `   (-) Sangrias (Retiradas):     ${fmt(resumo.totalSangrias)}`,
      `   (-) Despesas Pagas Gaveta:    ${fmt(resumo.totalDespesas)}`,
      `   ─────────────────────────────────`,
      `   (=) Saldo Teórico Esperado:   ${fmt(resumo.saldoEsperadoDinheiro)}`,
      `   (=) Valor Físico Declarado:   ${fmt(Number(sessao.saldo_declarado_dinheiro || 0))}`,
      `   ─────────────────────────────────`,
      `   ${statusDifText}`,
      `────────────────────────────────────`,
      `💳 *2. VENDAS POR MEIO DE PAGAMENTO:*`,
      `   • Dinheiro (${resumo.qtdVendasPorMetodo?.dinheiro ?? 0}x):          ${fmt(resumo.totalVendasDinheiro)}`,
      `   • Pix (${resumo.qtdVendasPorMetodo?.pix ?? 0}x):               ${fmt(resumo.totalVendasPix)}`,
      `   • Cartão Crédito (${resumo.qtdVendasPorMetodo?.cartao_credito ?? 0}x):     ${fmt(resumo.totalVendasCredito)}`,
      `   • Cartão Débito (${resumo.qtdVendasPorMetodo?.cartao_debito ?? 0}x):      ${fmt(resumo.totalVendasDebito)}`,
      resumo.totalVendasOutros > 0 ? `   • Outros Meios:               ${fmt(resumo.totalVendasOutros)}` : '',
      `   ─────────────────────────────────`,
      `💰 *FATURAMENTO BRUTO TOTAL:*    ${fmt(resumo.faturamentoTotalVendas ?? resumo.totalVendasGeral)}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      sessao.observacoes_fechamento ? `📝 *Obs:* ${sessao.observacoes_fechamento}\n────────────────────────────────────` : '',
      `📅 *Emitido em:* ${new Date().toLocaleString('pt-BR')}`,
      `HUBI • Sistema de Gestão & PDV`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    ].filter(Boolean).join('\n');
  }
};
