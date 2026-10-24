import { supabase } from '../lib/supabase';
import { CadernetaLancamento, Cliente } from '../types';
import { SyncService, isUuidValido } from './syncService';

export interface ResumoCadernetaCliente {
  cliente: Cliente;
  limiteTotal: number;
  saldoDevedor: number;
  limiteDisponivel: number;
  diaVencimento: number;
  proximoVencimento: string; // ISO date 'YYYY-MM-DD'
  estaVencido: boolean;
}

export class CadernetaService {
  /**
   * Calcula a data do próximo vencimento para um cliente baseado no dia fixo acordado
   */
  public static calcularProximoVencimento(diaVencimento: number, dataBase: Date = new Date()): string {
    const ano = dataBase.getFullYear();
    const mes = dataBase.getMonth(); // 0 a 11
    const hojeDia = dataBase.getDate();

    // Determina se o vencimento deste mês já passou
    let anoAlvo = ano;
    let mesAlvo = mes;

    if (hojeDia > diaVencimento) {
      // Vencimento será no próximo mês
      mesAlvo += 1;
      if (mesAlvo > 11) {
        mesAlvo = 0;
        anoAlvo += 1;
      }
    }

    // Ajusta para o último dia do mês caso o mês alvo tenha menos dias (ex: dia 31 em fevereiro/abril)
    const ultimoDiaDoMes = new Date(anoAlvo, mesAlvo + 1, 0).getDate();
    const diaReal = Math.min(diaVencimento, ultimoDiaDoMes);

    const dataFinal = new Date(anoAlvo, mesAlvo, diaReal);
    return dataFinal.toISOString().split('T')[0];
  }

  /**
   * Retorna o ciclo de referência atual no formato YYYY-MM
   */
  public static obterCicloReferenciaAtual(dataBase: Date = new Date()): string {
    const ano = dataBase.getFullYear();
    const mes = String(dataBase.getMonth() + 1).padStart(2, '0');
    return `${ano}-${mes}`;
  }

  /**
   * Obtém o resumo financeiro da Caderneta para um cliente, reconciliando com pedidos em aberto se necessário
   */
  public static async obterResumoCliente(lojaId: string, clienteId: string): Promise<ResumoCadernetaCliente | null> {
    try {
      const [cliRes, extratoLista] = await Promise.all([
        supabase
          .from('clientes')
          .select('*')
          .eq('loja_id', lojaId)
          .eq('id', clienteId)
          .single(),
        this.listarExtratoCliente(lojaId, clienteId)
      ]);

      const cliente = cliRes.data;
      if (cliRes.error || !cliente) return null;

      let saldoDevedor = Number(cliente.saldo_devedor_caderneta || 0);
      if (extratoLista.length > 0) {
        const saldoCalculado = Number(extratoLista[0].saldo_posterior ?? saldoDevedor);
        if (Math.abs(saldoCalculado - saldoDevedor) > 0.01) {
          saldoDevedor = Math.max(0, saldoCalculado);
          await supabase
            .from('clientes')
            .update({ saldo_devedor_caderneta: saldoDevedor })
            .eq('loja_id', lojaId)
            .eq('id', clienteId);
        }
      }

      const limiteTotal = Number(cliente.limite_caderneta || 0);
      const limiteDisponivel = Math.max(0, limiteTotal - saldoDevedor);
      const diaVencimento = Number(cliente.dia_vencimento_caderneta || 10);
      const proximoVencimento = this.calcularProximoVencimento(diaVencimento);

      const hojeYmd = new Date().toISOString().split('T')[0];
      const estaVencido = saldoDevedor > 0 && hojeYmd > proximoVencimento;

      return {
        cliente: { ...cliente, saldo_devedor_caderneta: saldoDevedor },
        limiteTotal,
        saldoDevedor,
        limiteDisponivel,
        diaVencimento,
        proximoVencimento,
        estaVencido
      };
    } catch (err) {
      console.error('[CadernetaService] Erro ao obter resumo do cliente:', err);
      return null;
    }
  }

  /**
   * Calcula o mapa de saldos reais da caderneta para todos os clientes da loja a partir dos pedidos e lançamentos
   */
  public static async calcularSaldosReaisCadernetaPorLoja(lojaId: string): Promise<Record<string, number>> {
    const mapaSaldos: Record<string, number> = {};
    try {
      const [pedsRes, lancsRes, transRes] = await Promise.all([
        supabase
          .from('pedidos')
          .select(`
            id,
            cliente_id,
            valor_total,
            valor_pago,
            saldo_devedor,
            eh_venda_caderneta,
            forma_pagamento_catalogo,
            status,
            pagamentos:pagamentos_pedido(
              valor,
              eh_pagamento_caderneta,
              forma_pagamento:formas_pagamento(nome, tipo)
            )
          `)
          .eq('loja_id', lojaId)
          .neq('status', 'cancelado'),
        supabase
          .from('caderneta_lancamentos')
          .select('cliente_id, pedido_id, tipo_lancamento, valor')
          .eq('loja_id', lojaId),
        supabase
          .from('transacoes_financeiras')
          .select('descricao, valor, categoria')
          .eq('loja_id', lojaId)
          .eq('categoria', 'Recebimento de Caderneta')
      ]);

      const peds = pedsRes.data || [];
      const lancs = lancsRes.data || [];
      const pedidosJaNoLedger = new Set<string>();

      for (const l of lancs) {
        if (!l.cliente_id) continue;
        if (l.pedido_id) pedidosJaNoLedger.add(l.pedido_id);
        const val = Number(l.valor || 0);
        if (l.tipo_lancamento === 'compra') {
          mapaSaldos[l.cliente_id] = Number(((mapaSaldos[l.cliente_id] || 0) + val).toFixed(2));
        } else if (l.tipo_lancamento === 'pagamento' || l.tipo_lancamento === 'estorno') {
          mapaSaldos[l.cliente_id] = Number(Math.max(0, (mapaSaldos[l.cliente_id] || 0) - val).toFixed(2));
        } else if (l.tipo_lancamento === 'ajuste') {
          mapaSaldos[l.cliente_id] = Number(((mapaSaldos[l.cliente_id] || 0) + val).toFixed(2));
        }
      }

      for (const p of peds as any[]) {
        if (!p.cliente_id || pedidosJaNoLedger.has(p.id)) continue;
        const pags = p.pagamentos || [];
        const pagsCaderneta = pags.filter((pag: any) =>
          pag.eh_pagamento_caderneta ||
          pag.forma_pagamento?.tipo === 'caderneta' ||
          pag.forma_pagamento?.nome?.toLowerCase().includes('caderneta')
        );
        const ehCad = Boolean(p.eh_venda_caderneta) || p.forma_pagamento_catalogo === 'caderneta' || pagsCaderneta.length > 0;
        if (!ehCad) continue;

        const valorCad = pagsCaderneta.length > 0
          ? pagsCaderneta.reduce((acc: number, pg: any) => acc + Number(pg.valor || 0), 0)
          : Number(p.valor_total || 0);

        if (valorCad > 0) {
          mapaSaldos[p.cliente_id] = Number(((mapaSaldos[p.cliente_id] || 0) + valorCad).toFixed(2));
        }
      }

      // Garantir que nenhum saldo fique negativo
      Object.keys(mapaSaldos).forEach((cid) => {
        mapaSaldos[cid] = Number(Math.max(0, mapaSaldos[cid]).toFixed(2));
      });
      void transRes;
    } catch (err) {
      console.warn('[CadernetaService] Aviso ao calcular saldos reais da caderneta:', err);
    }
    return mapaSaldos;
  }

  /**
   * Registra uma compra na Caderneta de Mercadinho (Chamado no fechamento do PDV / Catálogo)
   */
  public static async registrarCompraCaderneta(params: {
    lojaId: string;
    clienteId: string;
    pedidoId: string;
    pagamentoPedidoId?: string;
    valor: number;
    usuarioId?: string;
    numeroPedido: number;
  }): Promise<{ sucesso: boolean; mensagem?: string; lancamento?: CadernetaLancamento }> {
    const { lojaId, clienteId, pedidoId, pagamentoPedidoId, valor, usuarioId, numeroPedido } = params;

    try {
      // 1. Obter cliente com saldo atualizado
      const { data: cliente, error: cliErr } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', lojaId)
        .eq('id', clienteId)
        .single();

      if (cliErr || !cliente) {
        return { sucesso: false, mensagem: 'Cliente não encontrado para registro na caderneta.' };
      }

      const saldoAnterior = Number(cliente.saldo_devedor_caderneta || 0);
      const saldoPosterior = Number((saldoAnterior + valor).toFixed(2));

      const cicloRef = this.obterCicloReferenciaAtual();
      const diaVencimento = Number(cliente.dia_vencimento_caderneta || 10);
      const dataVencimentoCiclo = this.calcularProximoVencimento(diaVencimento);

      // 2. Atualizar saldo devedor do cliente IMEDIATAMENTE (garante consistência mesmo se o ledger sofrer restrição RLS)
      await supabase
        .from('clientes')
        .update({
          saldo_devedor_caderneta: saldoPosterior,
          permite_caderneta: true
        })
        .eq('loja_id', lojaId)
        .eq('id', clienteId);

      // 3. Marcar pedido como venda de caderneta
      await supabase
        .from('pedidos')
        .update({
          eh_venda_caderneta: true,
          ciclo_referencia_caderneta: cicloRef
        })
        .eq('loja_id', lojaId)
        .eq('id', pedidoId);

      // 4. Validar usuario_id na tabela usuarios_loja para evitar violação de FK
      let usuarioIdValido: string | null = null;
      if (usuarioId && isUuidValido(usuarioId)) {
        const { data: op } = await supabase
          .from('usuarios_loja')
          .select('id')
          .eq('id', usuarioId)
          .maybeSingle();
        if (op?.id) usuarioIdValido = op.id;
      }

      // 5. Inserir no ledger da caderneta
      const payloadLancamento = {
        loja_id: lojaId,
        cliente_id: clienteId,
        pedido_id: pedidoId,
        pagamento_pedido_id: (pagamentoPedidoId && isUuidValido(pagamentoPedidoId)) ? pagamentoPedidoId : null,
        usuario_id: usuarioIdValido,
        tipo_lancamento: 'compra',
        valor,
        saldo_anterior: saldoAnterior,
        saldo_posterior: saldoPosterior,
        ciclo_referencia: cicloRef,
        data_vencimento_ciclo: dataVencimentoCiclo,
        descricao: `Compra Caderneta - Pedido #${numeroPedido}`
      };

      const { data: lancamento, error: lancErr } = await supabase
        .from('caderneta_lancamentos')
        .insert(payloadLancamento)
        .select()
        .single();

      if (lancErr) {
        console.warn('[CadernetaService] Aviso ao gravar em caderneta_lancamentos (saldo já atualizado):', lancErr);
      }

      return { sucesso: true, lancamento: lancamento as CadernetaLancamento | undefined };
    } catch (err: any) {
      console.error('[CadernetaService] Exceção ao registrar compra:', err);
      return { sucesso: false, mensagem: 'Erro inesperado ao registrar compra na caderneta.' };
    }
  }

  /**
   * Registra um pagamento/abatimento parcial ou total na Caderneta
   */
  public static async registrarPagamentoCaderneta(params: {
    lojaId: string;
    clienteId: string;
    valorPago: number;
    formaPagamentoId: string;
    formaTipo?: string;
    usuarioId?: string;
    observacoes?: string;
  }): Promise<{ sucesso: boolean; mensagem?: string; saldoRestante?: number }> {
    const { lojaId, clienteId, valorPago, formaPagamentoId, formaTipo, usuarioId, observacoes } = params;

    if (valorPago <= 0) {
      return { sucesso: false, mensagem: 'O valor do pagamento deve ser maior que zero.' };
    }

    try {
      const resumoAtual = await this.obterResumoCliente(lojaId, clienteId);
      const cliente = resumoAtual?.cliente;

      if (!cliente) {
        return { sucesso: false, mensagem: 'Cliente não encontrado.' };
      }

      const saldoAnterior = Number(resumoAtual?.saldoDevedor || cliente.saldo_devedor_caderneta || 0);
      if (saldoAnterior <= 0) {
        return { sucesso: false, mensagem: 'O cliente não possui débitos pendentes na caderneta.' };
      }

      const valorEfetivo = Math.min(valorPago, saldoAnterior);
      const saldoPosterior = Number(Math.max(0, saldoAnterior - valorEfetivo).toFixed(2));

      const cicloRef = this.obterCicloReferenciaAtual();
      const diaVencimento = Number(cliente.dia_vencimento_caderneta || 10);
      const dataVencimentoCiclo = this.calcularProximoVencimento(diaVencimento);

      // Resolver UUID real da forma de pagamento
      let fpUuid: string | null = null;
      try {
        const resolvido = await SyncService.resolverFormaPagamentoId(lojaId, formaPagamentoId, formaTipo || formaPagamentoId);
        if (isUuidValido(resolvido)) fpUuid = resolvido;
      } catch {
        if (isUuidValido(formaPagamentoId)) fpUuid = formaPagamentoId;
      }

      let usuarioIdValido: string | null = null;
      if (usuarioId && isUuidValido(usuarioId)) {
        const { data: op } = await supabase
          .from('usuarios_loja')
          .select('id')
          .eq('id', usuarioId)
          .maybeSingle();
        if (op?.id) usuarioIdValido = op.id;
      }

      // 1. Atualizar saldo do cliente imediatamente
      await supabase
        .from('clientes')
        .update({ saldo_devedor_caderneta: saldoPosterior })
        .eq('loja_id', lojaId)
        .eq('id', clienteId);

      // 2. Registrar no ledger
      const { error: lancErr } = await supabase
        .from('caderneta_lancamentos')
        .insert({
          loja_id: lojaId,
          cliente_id: clienteId,
          forma_pagamento_id: fpUuid,
          usuario_id: usuarioIdValido,
          tipo_lancamento: 'pagamento',
          valor: valorEfetivo,
          saldo_anterior: saldoAnterior,
          saldo_posterior: saldoPosterior,
          ciclo_referencia: cicloRef,
          data_vencimento_ciclo: dataVencimentoCiclo,
          descricao: `Abatimento Caderneta - ${valorEfetivo >= saldoAnterior ? 'Quitação Total' : 'Pagamento Parcial'}`,
          observacoes: observacoes || null
        });

      if (lancErr) {
        console.warn('[CadernetaService] Aviso ao gravar lançamento de pagamento:', lancErr);
      }

      // 3. Se quitou tudo, marcar pedidos da caderneta como fiado_quitado = true e saldo_devedor = 0
      if (saldoPosterior <= 0.01) {
        await supabase
          .from('pedidos')
          .update({
            fiado_quitado: true,
            saldo_devedor: 0,
            status_pagamento: 'pago'
          })
          .eq('loja_id', lojaId)
          .eq('cliente_id', clienteId)
          .eq('eh_venda_caderneta', true);
      }

      // 4. Registrar transação financeira de entrada
      await supabase
        .from('transacoes_financeiras')
        .insert({
          loja_id: lojaId,
          tipo: 'ENTRADA',
          categoria: 'Recebimento de Caderneta',
          descricao: `Recebimento Caderneta - Cliente ${cliente.nome}`,
          valor: valorEfetivo,
          data_vencimento: new Date().toISOString().split('T')[0],
          data_pagamento: new Date().toISOString(),
          status: 'pago'
        });

      return { sucesso: true, saldoRestante: saldoPosterior };
    } catch (err: any) {
      console.error('[CadernetaService] Exceção ao registrar pagamento:', err);
      return { sucesso: false, mensagem: 'Erro inesperado ao registrar pagamento na caderneta.' };
    }
  }

  /**
   * Consulta o extrato analítico da caderneta para um cliente, reconciliando compras da tabela pedidos
   */
  public static async listarExtratoCliente(lojaId: string, clienteId: string): Promise<CadernetaLancamento[]> {
    try {
      const [lancsRes, pedsRes] = await Promise.all([
        supabase
          .from('caderneta_lancamentos')
          .select(`
            *,
            forma_pagamento:formas_pagamento(id, nome, tipo),
            pedido:pedidos(id, numero_pedido, valor_total, criado_em, data_venda, itens:itens_pedido(*))
          `)
          .eq('loja_id', lojaId)
          .eq('cliente_id', clienteId)
          .order('criado_em', { ascending: false }),
        supabase
          .from('pedidos')
          .select(`
            id,
            loja_id,
            cliente_id,
            numero_pedido,
            valor_total,
            criado_em,
            data_venda,
            eh_venda_caderneta,
            forma_pagamento_catalogo,
            ciclo_referencia_caderneta,
            status,
            itens:itens_pedido(*),
            pagamentos:pagamentos_pedido(
              id,
              valor,
              eh_pagamento_caderneta,
              forma_pagamento:formas_pagamento(id, nome, tipo)
            )
          `)
          .eq('loja_id', lojaId)
          .eq('cliente_id', clienteId)
          .neq('status', 'cancelado')
          .order('criado_em', { ascending: false })
      ]);

      const lancamentosExistentes: CadernetaLancamento[] = (lancsRes.data as CadernetaLancamento[]) || [];
      const pedidosCliente = (pedsRes.data as any[]) || [];

      const pedidosIdsNoLedger = new Set<string>(
        lancamentosExistentes.map(l => l.pedido_id).filter((id): id is string => Boolean(id))
      );

      const lancamentosSinteticos: CadernetaLancamento[] = [];
      for (const ped of pedidosCliente) {
        if (pedidosIdsNoLedger.has(ped.id)) continue;

        const pags = ped.pagamentos || [];
        const pagsCad = pags.filter((pg: any) =>
          pg.eh_pagamento_caderneta ||
          pg.forma_pagamento?.tipo === 'caderneta' ||
          pg.forma_pagamento?.nome?.toLowerCase().includes('caderneta')
        );

        const ehPedidoCaderneta =
          Boolean(ped.eh_venda_caderneta) ||
          ped.forma_pagamento_catalogo === 'caderneta' ||
          pagsCad.length > 0;

        if (!ehPedidoCaderneta) continue;

        const valorCompra = pagsCad.length > 0
          ? pagsCad.reduce((acc: number, pg: any) => acc + Number(pg.valor || 0), 0)
          : Number(ped.valor_total || 0);

        if (valorCompra <= 0) continue;

        const dataRef = ped.criado_em || ped.data_venda || new Date().toISOString();
        const cicloRef = ped.ciclo_referencia_caderneta || this.obterCicloReferenciaAtual(new Date(dataRef));

        lancamentosSinteticos.push({
          id: `ped_cad_${ped.id}`,
          loja_id: lojaId,
          cliente_id: clienteId,
          pedido_id: ped.id,
          pagamento_pedido_id: pagsCad[0]?.id || null,
          forma_pagamento_id: pagsCad[0]?.forma_pagamento?.id || null,
          usuario_id: null,
          tipo_lancamento: 'compra',
          valor: valorCompra,
          saldo_anterior: 0,
          saldo_posterior: valorCompra,
          ciclo_referencia: cicloRef,
          data_vencimento_ciclo: this.calcularProximoVencimento(10, new Date(dataRef)),
          descricao: `Compra Caderneta - Pedido #${ped.numero_pedido}`,
          observacoes: null,
          criado_em: dataRef,
          pedido: {
            id: ped.id,
            numero_pedido: ped.numero_pedido,
            valor_total: ped.valor_total,
            criado_em: dataRef,
            itens: ped.itens || []
          } as any
        });
      }

      // Enriquecer lançamentos existentes com os itens do pedido caso não tenham vindo no join
      const mapaPedidosPorId = new Map<string, any>();
      pedidosCliente.forEach(p => mapaPedidosPorId.set(p.id, p));

      const todosCombinados = [...lancamentosExistentes, ...lancamentosSinteticos].map(l => {
        if (l.pedido_id && mapaPedidosPorId.has(l.pedido_id)) {
          const pedCompleto = mapaPedidosPorId.get(l.pedido_id);
          return {
            ...l,
            pedido: {
              ...(l.pedido || {}),
              id: pedCompleto.id,
              numero_pedido: pedCompleto.numero_pedido,
              valor_total: pedCompleto.valor_total,
              criado_em: pedCompleto.criado_em || pedCompleto.data_venda,
              itens: pedCompleto.itens || (l.pedido as any)?.itens || []
            }
          };
        }
        return l;
      });

      // Ordenar cronologicamente (do mais antigo para o mais recente) para recalcular saldo_anterior e saldo_posterior consistentes
      const ordenadosAsc = [...todosCombinados].sort(
        (a, b) => new Date(a.criado_em || 0).getTime() - new Date(b.criado_em || 0).getTime()
      );

      let saldoAcumulado = 0;
      const recalculadosAsc = ordenadosAsc.map(item => {
        const saldoAnt = saldoAcumulado;
        const val = Number(item.valor || 0);
        if (item.tipo_lancamento === 'compra') {
          saldoAcumulado = Number((saldoAnt + val).toFixed(2));
        } else if (item.tipo_lancamento === 'pagamento' || item.tipo_lancamento === 'estorno') {
          saldoAcumulado = Number(Math.max(0, saldoAnt - val).toFixed(2));
        } else {
          saldoAcumulado = Number((saldoAnt + val).toFixed(2));
        }
        return {
          ...item,
          saldo_anterior: saldoAnt,
          saldo_posterior: saldoAcumulado
        };
      });

      // Persistir em background os lançamentos sintéticos caso a tabela permita
      if (lancamentosSinteticos.length > 0) {
        (async () => {
          for (const sint of recalculadosAsc.filter(x => String(x.id).startsWith('ped_cad_'))) {
            try {
              await supabase.from('caderneta_lancamentos').insert({
                loja_id: sint.loja_id,
                cliente_id: sint.cliente_id,
                pedido_id: sint.pedido_id,
                pagamento_pedido_id: sint.pagamento_pedido_id,
                tipo_lancamento: sint.tipo_lancamento,
                valor: sint.valor,
                saldo_anterior: sint.saldo_anterior,
                saldo_posterior: sint.saldo_posterior,
                ciclo_referencia: sint.ciclo_referencia,
                data_vencimento_ciclo: sint.data_vencimento_ciclo,
                descricao: sint.descricao,
                criado_em: sint.criado_em
              });
            } catch {}
          }
        })();
      }

      return recalculadosAsc.reverse() as CadernetaLancamento[];
    } catch (err) {
      console.error('[CadernetaService] Exceção ao listar extrato:', err);
      return [];
    }
  }
  /**
   * Aplica ajuste de pesagem na separação do pedido de catálogo online.
   * Debita a diferença se o peso real for maior ou credita se for menor.
   */
  public static async ajustarPesagemSeparacao(params: {
    lojaId: string;
    clienteId: string;
    pedidoId: string;
    numeroPedido?: number;
    nomeProduto: string;
    pesoOriginalKg: number;
    pesoRealKg: number;
    diferencaValor: number; // Positivo = cliente deve pagar mais; Negativo = lojista estorna
    usuarioId?: string;
  }): Promise<{ sucesso: boolean; mensagem?: string; saldoNovo?: number }> {
    const { lojaId, clienteId, pedidoId, numeroPedido, nomeProduto, pesoOriginalKg, pesoRealKg, diferencaValor, usuarioId } = params;
    if (Math.abs(diferencaValor) < 0.01) {
      return { sucesso: true, mensagem: 'Sem diferença de valor na pesagem.' };
    }
    try {
      const { data: cliente, error: cliErr } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', lojaId)
        .eq('id', clienteId)
        .single();

      if (cliErr || !cliente) {
        return { sucesso: false, mensagem: 'Cliente não encontrado para ajuste de caderneta.' };
      }

      const saldoAnterior = Number(cliente.saldo_devedor_caderneta || 0);
      const saldoPosterior = Number((saldoAnterior + diferencaValor).toFixed(2));
      const cicloRef = this.obterCicloReferenciaAtual();
      const diaVencimento = Number(cliente.dia_vencimento_caderneta || 10);
      const dataVencimentoCiclo = this.calcularProximoVencimento(diaVencimento);

      const descricaoAjuste = diferencaValor > 0
        ? `Ajuste de Balança (+${(pesoRealKg - pesoOriginalKg).toFixed(3)}kg) - ${nomeProduto} (Pedido #${numeroPedido || ''})`
        : `Ajuste de Balança (${(pesoRealKg - pesoOriginalKg).toFixed(3)}kg) - ${nomeProduto} (Pedido #${numeroPedido || ''})`;

      const { error: lancErr } = await supabase
        .from('caderneta_lancamentos')
        .insert({
          loja_id: lojaId,
          cliente_id: clienteId,
          pedido_id: pedidoId,
          usuario_id: usuarioId || null,
          tipo_lancamento: diferencaValor > 0 ? 'ajuste_debito' : 'ajuste_credito',
          valor: Math.abs(diferencaValor),
          saldo_anterior: saldoAnterior,
          saldo_posterior: Math.max(0, saldoPosterior),
          ciclo_referencia: cicloRef,
          data_vencimento_ciclo: dataVencimentoCiclo,
          descricao: descricaoAjuste,
          observacoes: `Peso solicitado: ${pesoOriginalKg.toFixed(3)}kg | Peso aferido na balança: ${pesoRealKg.toFixed(3)}kg`
        });

      if (lancErr) {
        console.error('[CadernetaService] Erro ao gravar lançamento de ajuste de pesagem:', lancErr);
        return { sucesso: false, mensagem: 'Falha ao registrar ajuste na caderneta.' };
      }

      await supabase
        .from('clientes')
        .update({
          saldo_devedor_caderneta: Math.max(0, saldoPosterior),
          total_compras_caderneta: diferencaValor > 0 ? Number(((cliente.total_compras_caderneta || 0) + diferencaValor).toFixed(2)) : cliente.total_compras_caderneta
        })
        .eq('loja_id', lojaId)
        .eq('id', clienteId);

      return { sucesso: true, saldoNovo: Math.max(0, saldoPosterior) };
    } catch (e: any) {
      return { sucesso: false, mensagem: e?.message || 'Erro inesperado ao ajustar caderneta.' };
    }
  }

}