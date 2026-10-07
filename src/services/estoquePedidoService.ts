import { supabase } from '../lib/supabase';
import { ItemPedido, Pedido } from '../types';

/**
 * Status operacionais e concluídos que demandam consumo/baixa de estoque físico
 */
export const STATUS_QUE_BAIXAM_ESTOQUE = [
  'confirmado',
  'em_separacao',
  'em_expedicao',
  'aguardando_envio',
  'enviado',
  'pronto_para_retirar',
  'entregue',
  'concluido'
];

export interface ProcessamentoEstoqueResultado {
  estoqueBaixado: boolean;
  movimentou: boolean;
  mensagem?: string;
}

/**
 * Serviço responsável pela gestão estritamente idempotente de estoque de pedidos.
 * Garante que:
 * 1. A baixa de estoque ocorra apenas 1 vez por pedido (flag `estoque_baixado`).
 * 2. O estorno ocorra apenas se o estoque tiver sido previamente baixado.
 * 3. Movimentações analíticas fiquem registradas em `movimentacoes_estoque`.
 */
export class EstoquePedidoService {
  /**
   * Executa a baixa idempotente de estoque para um pedido.
   * Só efetua a saída se `pedido.estoque_baixado !== true`.
   */
  static async baixarEstoquePedido(params: {
    pedidoId: string;
    lojaId: string;
    usuarioId?: string | null;
    itens?: ItemPedido[];
  }): Promise<ProcessamentoEstoqueResultado> {
    const { pedidoId, lojaId, usuarioId } = params;

    // 1. Consultar estado atômico mais recente do pedido no banco de dados
    const { data: pedidoDb, error: errPed } = await supabase
      .from('pedidos')
      .select('id, loja_id, estoque_baixado, status')
      .eq('id', pedidoId)
      .eq('loja_id', lojaId)
      .single();

    if (errPed || !pedidoDb) {
      console.warn('[EstoquePedidoService] Pedido não encontrado para baixa de estoque:', errPed);
      return { estoqueBaixado: false, movimentou: false, mensagem: 'Pedido não encontrado' };
    }

    // Se já foi baixado, operação é idempotente (ignora sem erro)
    if (pedidoDb.estoque_baixado === true) {
      return { estoqueBaixado: true, movimentou: false, mensagem: 'Estoque já baixado anteriormente' };
    }

    // 2. Carregar itens do pedido caso não fornecidos
    let itensParaBaixar = params.itens;
    if (!itensParaBaixar || itensParaBaixar.length === 0) {
      const { data: itensDb } = await supabase
        .from('itens_pedido')
        .select('*')
        .eq('pedido_id', pedidoId)
        .eq('loja_id', lojaId);

      itensParaBaixar = (itensDb || []) as ItemPedido[];
    }

    if (!itensParaBaixar || itensParaBaixar.length === 0) {
      // Sem itens, apenas marca como baixado para evitar retrabalho
      await supabase
        .from('pedidos')
        .update({ estoque_baixado: true, atualizado_em: new Date().toISOString() })
        .eq('id', pedidoId);
      return { estoqueBaixado: true, movimentou: false, mensagem: 'Pedido sem itens para baixar' };
    }

    // 3. Processar decremento de estoque para cada item
    const dataIso = new Date().toISOString();
    const logsMovimentacao: any[] = [];

    for (const item of itensParaBaixar) {
      const qtdVenda = Number(item.quantidade) || 0;
      if (qtdVenda <= 0 || !item.produto_id) continue;

      try {
        if (item.variacao_id) {
          // Variação de produto
          const { data: varDb } = await supabase
            .from('variacoes_produto')
            .select('id, produto_id, quantidade_estoque')
            .eq('id', item.variacao_id)
            .single();

          if (varDb) {
            const saldoAnteriorVar = Number(varDb.quantidade_estoque || 0);
            const saldoPosteriorVar = saldoAnteriorVar - qtdVenda;

            await supabase
              .from('variacoes_produto')
              .update({ quantidade_estoque: saldoPosteriorVar })
              .eq('id', item.variacao_id);

            // Recalcular saldo total do produto pai somando todas as variações
            const { data: todasVars } = await supabase
              .from('variacoes_produto')
              .select('quantidade_estoque')
              .eq('produto_id', item.produto_id);

            const saldoConsolidadoPai = (todasVars || []).reduce(
              (acc, v) => acc + Number(v.quantidade_estoque || 0),
              0
            );

            await supabase
              .from('produtos')
              .update({
                quantidade_estoque: saldoConsolidadoPai,
                atualizado_em: dataIso
              })
              .eq('id', item.produto_id);

            logsMovimentacao.push({
              loja_id: lojaId,
              produto_id: item.produto_id,
              variacao_id: item.variacao_id,
              pedido_id: pedidoId,
              usuario_id: usuarioId || null,
              tipo_movimentacao: 'saida_venda',
              quantidade: qtdVenda,
              saldo_anterior: saldoAnteriorVar,
              saldo_posterior: saldoPosteriorVar,
              motivo: `Saída por venda - Pedido`,
              criado_em: dataIso
            });
          }
        } else {
          // Produto simples sem variação
          const { data: prodDb } = await supabase
            .from('produtos')
            .select('id, quantidade_estoque')
            .eq('id', item.produto_id)
            .single();

          if (prodDb) {
            const saldoAnterior = Number(prodDb.quantidade_estoque || 0);
            const saldoPosterior = saldoAnterior - qtdVenda;

            await supabase
              .from('produtos')
              .update({
                quantidade_estoque: saldoPosterior,
                atualizado_em: dataIso
              })
              .eq('id', item.produto_id);

            logsMovimentacao.push({
              loja_id: lojaId,
              produto_id: item.produto_id,
              variacao_id: null,
              pedido_id: pedidoId,
              usuario_id: usuarioId || null,
              tipo_movimentacao: 'saida_venda',
              quantidade: qtdVenda,
              saldo_anterior: saldoAnterior,
              saldo_posterior: saldoPosterior,
              motivo: `Saída por venda - Pedido`,
              criado_em: dataIso
            });
          }
        }
      } catch (errItem) {
        console.warn(`[EstoquePedidoService] Erro ao abater estoque do produto ${item.produto_id}:`, errItem);
      }
    }

    // 4. Inserir logs na tabela movimentacoes_estoque (com tratamento seguro se tabela não existir)
    if (logsMovimentacao.length > 0) {
      try {
        await supabase.from('movimentacoes_estoque').insert(logsMovimentacao);
      } catch (errLog) {
        console.warn('[EstoquePedidoService] Aviso ao registrar movimentacoes_estoque:', errLog);
      }
    }

    // 5. Marcar estoque_baixado = true no pedido
    await supabase
      .from('pedidos')
      .update({
        estoque_baixado: true,
        atualizado_em: dataIso
      })
      .eq('id', pedidoId);

    return { estoqueBaixado: true, movimentou: true, mensagem: 'Baixa de estoque realizada com sucesso' };
  }

  /**
   * Executa o estorno idempotente de estoque quando um pedido é cancelado.
   * Só efetua a devolução se `pedido.estoque_baixado === true`.
   */
  static async estornarEstoquePedido(params: {
    pedidoId: string;
    lojaId: string;
    usuarioId?: string | null;
    itens?: ItemPedido[];
  }): Promise<ProcessamentoEstoqueResultado> {
    const { pedidoId, lojaId, usuarioId } = params;

    // 1. Consultar estado no banco de dados
    const { data: pedidoDb, error: errPed } = await supabase
      .from('pedidos')
      .select('id, loja_id, estoque_baixado, status')
      .eq('id', pedidoId)
      .eq('loja_id', lojaId)
      .single();

    if (errPed || !pedidoDb) {
      console.warn('[EstoquePedidoService] Pedido não encontrado para estorno:', errPed);
      return { estoqueBaixado: false, movimentou: false, mensagem: 'Pedido não encontrado' };
    }

    // Se NÃO teve estoque baixado, nada a estornar (idempotente)
    if (pedidoDb.estoque_baixado !== true) {
      return { estoqueBaixado: false, movimentou: false, mensagem: 'Pedido não possuía baixa de estoque a estornar' };
    }

    // 2. Carregar itens do pedido
    let itensParaEstornar = params.itens;
    if (!itensParaEstornar || itensParaEstornar.length === 0) {
      const { data: itensDb } = await supabase
        .from('itens_pedido')
        .select('*')
        .eq('pedido_id', pedidoId)
        .eq('loja_id', lojaId);

      itensParaEstornar = (itensDb || []) as ItemPedido[];
    }

    const dataIso = new Date().toISOString();
    const logsMovimentacao: any[] = [];

    // 3. Devolver quantidades aos produtos e variações
    for (const item of (itensParaEstornar || [])) {
      const qtdEstorno = Number(item.quantidade) || 0;
      if (qtdEstorno <= 0 || !item.produto_id) continue;

      try {
        if (item.variacao_id) {
          const { data: varDb } = await supabase
            .from('variacoes_produto')
            .select('id, produto_id, quantidade_estoque')
            .eq('id', item.variacao_id)
            .single();

          if (varDb) {
            const saldoAnteriorVar = Number(varDb.quantidade_estoque || 0);
            const saldoPosteriorVar = saldoAnteriorVar + qtdEstorno;

            await supabase
              .from('variacoes_produto')
              .update({ quantidade_estoque: saldoPosteriorVar })
              .eq('id', item.variacao_id);

            // Recalcular saldo total do produto pai
            const { data: todasVars } = await supabase
              .from('variacoes_produto')
              .select('quantidade_estoque')
              .eq('produto_id', item.produto_id);

            const saldoConsolidadoPai = (todasVars || []).reduce(
              (acc, v) => acc + Number(v.quantidade_estoque || 0),
              0
            );

            await supabase
              .from('produtos')
              .update({
                quantidade_estoque: saldoConsolidadoPai,
                atualizado_em: dataIso
              })
              .eq('id', item.produto_id);

            logsMovimentacao.push({
              loja_id: lojaId,
              produto_id: item.produto_id,
              variacao_id: item.variacao_id,
              pedido_id: pedidoId,
              usuario_id: usuarioId || null,
              tipo_movimentacao: 'entrada_estorno_cancelamento',
              quantidade: qtdEstorno,
              saldo_anterior: saldoAnteriorVar,
              saldo_posterior: saldoPosteriorVar,
              motivo: `Estorno por cancelamento do pedido`,
              criado_em: dataIso
            });
          }
        } else {
          // Produto simples
          const { data: prodDb } = await supabase
            .from('produtos')
            .select('id, quantidade_estoque')
            .eq('id', item.produto_id)
            .single();

          if (prodDb) {
            const saldoAnterior = Number(prodDb.quantidade_estoque || 0);
            const saldoPosterior = saldoAnterior + qtdEstorno;

            await supabase
              .from('produtos')
              .update({
                quantidade_estoque: saldoPosterior,
                atualizado_em: dataIso
              })
              .eq('id', item.produto_id);

            logsMovimentacao.push({
              loja_id: lojaId,
              produto_id: item.produto_id,
              variacao_id: null,
              pedido_id: pedidoId,
              usuario_id: usuarioId || null,
              tipo_movimentacao: 'entrada_estorno_cancelamento',
              quantidade: qtdEstorno,
              saldo_anterior: saldoAnterior,
              saldo_posterior: saldoPosterior,
              motivo: `Estorno por cancelamento do pedido`,
              criado_em: dataIso
            });
          }
        }
      } catch (errItem) {
        console.warn(`[EstoquePedidoService] Erro ao estornar produto ${item.produto_id}:`, errItem);
      }
    }

    // 4. Inserir logs analíticos
    if (logsMovimentacao.length > 0) {
      try {
        await supabase.from('movimentacoes_estoque').insert(logsMovimentacao);
      } catch (errLog) {
        console.warn('[EstoquePedidoService] Aviso ao registrar movimentacoes_estoque no estorno:', errLog);
      }
    }

    // 5. Marcar estoque_baixado = false no pedido
    await supabase
      .from('pedidos')
      .update({
        estoque_baixado: false,
        atualizado_em: dataIso
      })
      .eq('id', pedidoId);

    return { estoqueBaixado: false, movimentou: true, mensagem: 'Estorno de estoque realizado com sucesso' };
  }
}
