import { supabase } from '../lib/supabase';
import { CadernetaLancamento, Cliente } from '../types';

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
   * Obtém o resumo financeiro da Caderneta para um cliente
   */
  public static async obterResumoCliente(lojaId: string, clienteId: string): Promise<ResumoCadernetaCliente | null> {
    try {
      const { data: cliente, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', lojaId)
        .eq('id', clienteId)
        .single();

      if (error || !cliente) return null;

      const limiteTotal = Number(cliente.limite_caderneta || 0);
      const saldoDevedor = Number(cliente.saldo_devedor_caderneta || 0);
      const limiteDisponivel = Math.max(0, limiteTotal - saldoDevedor);
      const diaVencimento = Number(cliente.dia_vencimento_caderneta || 10);
      const proximoVencimento = this.calcularProximoVencimento(diaVencimento);

      const hojeYmd = new Date().toISOString().split('T')[0];
      const estaVencido = saldoDevedor > 0 && hojeYmd > proximoVencimento;

      return {
        cliente,
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
   * Registra uma compra na Caderneta de Mercadinho (Chamado no fechamento do PDV)
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

      if (!cliente.permite_caderneta) {
        return { sucesso: false, mensagem: 'Cliente não está habilitado para compras na caderneta.' };
      }

      const saldoAnterior = Number(cliente.saldo_devedor_caderneta || 0);
      const limiteTotal = Number(cliente.limite_caderneta || 0);
      const saldoPosterior = Number((saldoAnterior + valor).toFixed(2));

      if (saldoPosterior > limiteTotal) {
        return {
          sucesso: false,
          mensagem: `Limite da caderneta excedido. Disponível: R$ ${(limiteTotal - saldoAnterior).toFixed(2)}, Tentativa: R$ ${valor.toFixed(2)}.`
        };
      }

      const cicloRef = this.obterCicloReferenciaAtual();
      const diaVencimento = Number(cliente.dia_vencimento_caderneta || 10);
      const dataVencimentoCiclo = this.calcularProximoVencimento(diaVencimento);

      // 2. Inserir no ledger da caderneta
      const { data: lancamento, error: lancErr } = await supabase
        .from('caderneta_lancamentos')
        .insert({
          loja_id: lojaId,
          cliente_id: clienteId,
          pedido_id: pedidoId,
          pagamento_pedido_id: pagamentoPedidoId || null,
          usuario_id: usuarioId || null,
          tipo_lancamento: 'compra',
          valor,
          saldo_anterior: saldoAnterior,
          saldo_posterior: saldoPosterior,
          ciclo_referencia: cicloRef,
          data_vencimento_ciclo: dataVencimentoCiclo,
          descricao: `Compra Caderneta - Pedido #${numeroPedido}`
        })
        .select()
        .single();

      if (lancErr) {
        console.error('[CadernetaService] Erro ao gravar lançamento na caderneta:', lancErr);
        return { sucesso: false, mensagem: 'Falha ao registrar débito na caderneta.' };
      }

      // 3. Atualizar saldo devedor do cliente
      await supabase
        .from('clientes')
        .update({ saldo_devedor_caderneta: saldoPosterior })
        .eq('loja_id', lojaId)
        .eq('id', clienteId);

      // 4. Marcar pedido como venda de caderneta
      await supabase
        .from('pedidos')
        .update({
          eh_venda_caderneta: true,
          ciclo_referencia_caderneta: cicloRef
        })
        .eq('loja_id', lojaId)
        .eq('id', pedidoId);

      return { sucesso: true, lancamento };
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
    usuarioId?: string;
    observacoes?: string;
  }): Promise<{ sucesso: boolean; mensagem?: string; saldoRestante?: number }> {
    const { lojaId, clienteId, valorPago, formaPagamentoId, usuarioId, observacoes } = params;

    if (valorPago <= 0) {
      return { sucesso: false, mensagem: 'O valor do pagamento deve ser maior que zero.' };
    }

    try {
      const { data: cliente, error: cliErr } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', lojaId)
        .eq('id', clienteId)
        .single();

      if (cliErr || !cliente) {
        return { sucesso: false, mensagem: 'Cliente não encontrado.' };
      }

      const saldoAnterior = Number(cliente.saldo_devedor_caderneta || 0);
      if (saldoAnterior <= 0) {
        return { sucesso: false, mensagem: 'O cliente não possui débitos pendentes na caderneta.' };
      }

      const valorEfetivo = Math.min(valorPago, saldoAnterior);
      const saldoPosterior = Number(Math.max(0, saldoAnterior - valorEfetivo).toFixed(2));

      const cicloRef = this.obterCicloReferenciaAtual();
      const diaVencimento = Number(cliente.dia_vencimento_caderneta || 10);
      const dataVencimentoCiclo = this.calcularProximoVencimento(diaVencimento);

      // Registrar no ledger
      const { error: lancErr } = await supabase
        .from('caderneta_lancamentos')
        .insert({
          loja_id: lojaId,
          cliente_id: clienteId,
          forma_pagamento_id: formaPagamentoId,
          usuario_id: usuarioId || null,
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
        console.error('[CadernetaService] Erro ao gravar lançamento de pagamento:', lancErr);
        return { sucesso: false, mensagem: 'Falha ao registrar quitação no extrato da caderneta.' };
      }

      // Atualizar saldo do cliente
      await supabase
        .from('clientes')
        .update({ saldo_devedor_caderneta: saldoPosterior })
        .eq('loja_id', lojaId)
        .eq('id', clienteId);

      // Registrar transação financeira de entrada
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
   * Consulta o extrato analítico da caderneta para um cliente
   */
  public static async listarExtratoCliente(lojaId: string, clienteId: string): Promise<CadernetaLancamento[]> {
    try {
      const { data, error } = await supabase
        .from('caderneta_lancamentos')
        .select(`
          *,
          forma_pagamento:formas_pagamento(id, nome, tipo),
          pedido:pedidos(id, numero_pedido, valor_total, criado_em)
        `)
        .eq('loja_id', lojaId)
        .eq('cliente_id', clienteId)
        .order('criado_em', { ascending: false });

      if (error) {
        console.error('[CadernetaService] Erro ao listar extrato:', error);
        return [];
      }

      return data as CadernetaLancamento[];
    } catch (err) {
      console.error('[CadernetaService] Exceção ao listar extrato:', err);
      return [];
    }
  }
}
