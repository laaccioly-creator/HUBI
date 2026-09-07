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
      aberto_em: new Date().toISOString(),
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
  }): Promise<MovimentacaoCaixa> {
    const { lojaId, sessaoId, tipo, metodoPagamento, valor, descricao, usuarioId, pedidoId } = params;

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
      criado_em: new Date().toISOString()
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
    usuarioId: string;
    terminalId?: string;
  }): Promise<MovimentacaoCaixa[]> {
    const { lojaId, pedido, pagamentos, usuarioId, terminalId } = params;

    // Localiza a sessão aberta para este terminal
    const sessaoAtiva = await this.obterSessaoAtiva(lojaId, terminalId);
    if (!sessaoAtiva) {
      // Se não houver sessão de caixa aberta, não gera movimentações automáticas de gaveta
      return [];
    }

    const numPedidoStr = pedido.numero_pedido ? `#${pedido.numero_pedido}` : pedido.id.slice(0, 8);
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
          descricao: `Venda ${numPedidoStr} (${pag.forma_nome || metodo})`,
          usuarioId,
          pedidoId: pedido.id
        });
        movsCriadas.push(mov);
      }
    } else {
      // Pagamento único usando o valor total pago do pedido
      const valTotal = Number(pedido.valor_pago || pedido.valor_total || 0);
      if (valTotal > 0) {
        const metodo = this.mapearMetodoPagamento((pedido as any).forma_pagamento_padrao || (pedido as any).forma_pagamento);
        const mov = await this.registrarMovimentacao({
          lojaId,
          sessaoId: sessaoAtiva.id,
          tipo: 'VENDA',
          metodoPagamento: metodo,
          valor: valTotal,
          descricao: `Venda ${numPedidoStr}`,
          usuarioId,
          pedidoId: pedido.id
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
    const movimentacoes = (movsData || []) as MovimentacaoCaixa[];

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

    const payload = {
      fechado_por_usuario_id: usuarioId,
      fechado_em: new Date().toISOString(),
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

    return {
      sessao: data as SessaoCaixa,
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
        query = query.gte('aberto_em', `${filtros.dataInicio}T00:00:00`);
      }

      if (filtros?.dataFim) {
        query = query.lte('aberto_em', `${filtros.dataFim}T23:59:59.999Z`);
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

      let lista = rawList.map(s => ({
        ...s,
        usuario_abertura: s.aberto_por || (s as any).usuario_abertura,
        usuario_fechamento: s.fechado_por || (s as any).usuario_fechamento,
        fundo_troco_inicial: Number(s.fundo_inicial || 0),
        faturamento_total: Number(s.total_entradas_sistema || 0),
        saldo_dinheiro_calculado: Number(s.saldo_esperado_dinheiro || 0),
        saldo_dinheiro_declarado: s.saldo_declarado_dinheiro != null ? Number(s.saldo_declarado_dinheiro) : null
      }));

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
   * Formata texto em formato de comprovante térmico para impressão e compartilhamento WhatsApp
   */
  gerarTextoComprovanteFechamento(resumo: ResumoSessaoCaixa, nomeLoja?: string): string {
    const { sessao } = resumo;
    const abertoEm = new Date(sessao.aberto_em).toLocaleString('pt-BR');
    const fechadoEm = sessao.fechado_em ? new Date(sessao.fechado_em).toLocaleString('pt-BR') : 'Em Aberto';
    const dif = Number(sessao.diferenca_dinheiro || 0);

    let statusDifText = 'CAIXA EXATO (R$ 0,00)';
    if (dif > 0.009) {
      statusDifText = `SOBRA DE CAIXA: +R$ ${dif.toFixed(2)}`;
    } else if (dif < -0.009) {
      statusDifText = `FALTA DE CAIXA: -R$ ${Math.abs(dif).toFixed(2)}`;
    }

    const fmt = (v: number) => `R$ ${v.toFixed(2).padStart(10, ' ')}`;

    return [
      `================================================`,
      `          ${(nomeLoja || 'HUBI GESTÃO').toUpperCase()}          `,
      `     RELATÓRIO DE FECHAMENTO DE CAIXA           `,
      `================================================`,
      `Terminal: ${sessao.terminal_id} | Status: ${sessao.status}`,
      `Sessão ID: ${sessao.id.slice(0, 8)}`,
      `Abertura: ${abertoEm}`,
      `Fechamento: ${fechadoEm}`,
      `Duração do Turno: ${resumo.duracaoFormatada}`,
      `------------------------------------------------`,
      `1. BALANÇO DA GAVETA (DINHEIRO FÍSICO):`,
      `   (+) Fundo de Troco Inicial:   ${fmt(resumo.fundoInicial)}`,
      `   (+) Vendas em Dinheiro:       ${fmt(resumo.totalVendasDinheiro)}`,
      `   (+) Suprimentos (Troco):      ${fmt(resumo.totalSuprimentos)}`,
      `   (-) Sangrias (Retiradas):     ${fmt(resumo.totalSangrias)}`,
      `   (-) Despesas Pagas Gaveta:    ${fmt(resumo.totalDespesas)}`,
      `   ---------------------------------------------`,
      `   (=) SALDO TEÓRICO ESPERADO:   ${fmt(resumo.saldoEsperadoDinheiro)}`,
      `   (=) VALOR FÍSICO DECLARADO:   ${fmt(Number(sessao.saldo_declarado_dinheiro || 0))}`,
      `   ---------------------------------------------`,
      `   RESULTADO DA CONCILIAÇÃO: ${statusDifText}`,
      `------------------------------------------------`,
      `2. ENTRADAS POR OUTROS MEIOS (NÃO-GAVETA):`,
      `   • Pix / Transferência:        ${fmt(resumo.totalVendasPix)}`,
      `   • Cartão de Crédito:          ${fmt(resumo.totalVendasCredito)}`,
      `   • Cartão de Débito:           ${fmt(resumo.totalVendasDebito)}`,
      `   • Outros Meios:               ${fmt(resumo.totalVendasOutros)}`,
      `   ---------------------------------------------`,
      `   FATURAMENTO BRUTO TOTAL:      ${fmt(resumo.totalVendasGeral)}`,
      `================================================`,
      sessao.observacoes_fechamento ? `Obs: ${sessao.observacoes_fechamento}\n` : '',
      `Impresso em: ${new Date().toLocaleString('pt-BR')}`,
      `Operador: ${sessao.fechado_por?.nome_completo || sessao.aberto_por?.nome_completo || 'Operador PDV'}`,
      `================================================`
    ].filter(Boolean).join('\n');
  }
};
