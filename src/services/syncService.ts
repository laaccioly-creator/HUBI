// Serviço de Sincronização em Background (Supabase <-> IndexedDB)

import { supabase } from '../lib/supabase';
import { Produto, Cliente, FormaPagamento } from '../types';
import {
  salvarProdutosOffline,
  carregarProdutosOffline,
  salvarClientesOffline,
  carregarClientesOffline,
  salvarFormasPagamentoOffline,
  carregarFormasPagamentoOffline,
  adicionarVendaFilaOffline,
  obterVendasFilaOffline,
  removerVendaFilaOffline,
  contarVendasFilaOffline,
  VendaOfflineFila
} from './offlineDb';

export class SyncService {
  private static sincronizando = false;

  /**
   * Baixa catálogo completo do Supabase e salva no IndexedDB local
   */
  static async baixarDadosParaOffline(lojaId: string): Promise<{
    produtos: Produto[];
    clientes: Cliente[];
    formasPagamento: FormaPagamento[];
  }> {
    try {
      const [resProds, resClis, resFps] = await Promise.all([
        supabase
          .from('produtos')
          .select('*, variacoes:variacoes_produto(*)')
          .eq('loja_id', lojaId)
          .eq('ativo', true)
          .order('nome'),
        supabase
          .from('clientes')
          .select('*')
          .eq('loja_id', lojaId)
          .order('nome'),
        supabase
          .from('formas_pagamento')
          .select('*')
          .eq('loja_id', lojaId)
          .eq('ativo', true)
      ]);

      const produtos = (resProds.data as unknown as Produto[]) || [];
      const clientes = (resClis.data as Cliente[]) || [];
      const formasPagamento = (resFps.data as FormaPagamento[]) || [];

      // Salvar no IndexedDB
      if (produtos.length > 0) await salvarProdutosOffline(produtos);
      if (clientes.length > 0) await salvarClientesOffline(clientes);
      if (formasPagamento.length > 0) await salvarFormasPagamentoOffline(formasPagamento);

      return { produtos, clientes, formasPagamento };
    } catch (err) {
      console.warn('Erro ao sincronizar do Supabase, carregando cache local:', err);
      const [produtos, clientes, formasPagamento] = await Promise.all([
        carregarProdutosOffline(),
        carregarClientesOffline(),
        carregarFormasPagamentoOffline()
      ]);
      return { produtos, clientes, formasPagamento };
    }
  }

  /**
   * Registra uma venda offline na fila do IndexedDB
   */
  static async registrarVendaOffline(venda: VendaOfflineFila): Promise<void> {
    await adicionarVendaFilaOffline(venda);
  }

  /**
   * Processa a fila de vendas offline e envia para o Supabase
   */
  static async sincronizarFilaComNuvem(lojaId: string): Promise<{
    sucessoCount: number;
    erroCount: number;
    pendentesRestantes: number;
  }> {
    if (this.sincronizando) {
      const pendentes = await contarVendasFilaOffline();
      return { sucessoCount: 0, erroCount: 0, pendentesRestantes: pendentes };
    }

    if (!navigator.onLine) {
      const pendentes = await contarVendasFilaOffline();
      return { sucessoCount: 0, erroCount: 0, pendentesRestantes: pendentes };
    }

    this.sincronizando = true;
    let sucessoCount = 0;
    let erroCount = 0;

    try {
      const fila = await obterVendasFilaOffline();
      const filaDaLoja = fila.filter(v => v.loja_id === lojaId);

      for (const venda of filaDaLoja) {
        try {
          // 1. Inserir Pedido no Supabase
          const { data: pedidoCriado, error: erroPedido } = await supabase
            .from('pedidos')
            .insert([{
              loja_id: venda.loja_id,
              vendedor_id: venda.vendedor_id,
              cliente_id: venda.cliente_id,
              origem: venda.origem,
              tabela_preco_aplicada: venda.tabela_preco_aplicada,
              status: venda.status,
              subtotal: venda.subtotal,
              valor_desconto: venda.valor_desconto,
              valor_frete: venda.valor_frete,
              valor_total: venda.valor_total,
              valor_pago: venda.valor_pago,
              saldo_devedor: venda.saldo_devedor,
              fiado_quitado: venda.fiado_quitado,
              data_venda: venda.data_venda
            }])
            .select()
            .single();

          if (erroPedido || !pedidoCriado) throw erroPedido;

          // 2. Inserir Itens do Pedido
          const itensFormatados = venda.itens.map(item => ({
            ...item,
            pedido_id: pedidoCriado.id
          }));

          const { error: erroItens } = await supabase.from('itens_pedido').insert(itensFormatados);
          if (erroItens) throw erroItens;

          // 3. Inserir Pagamento
          const { error: erroPagamento } = await supabase.from('pagamentos_pedido').insert([{
            ...venda.pagamento,
            pedido_id: pedidoCriado.id
          }]);
          if (erroPagamento) throw erroPagamento;

          // 4. Remover da fila local com sucesso
          await removerVendaFilaOffline(venda.id_local);
          sucessoCount++;
        } catch (vendaErr: any) {
          console.error(`Erro ao sincronizar venda offline ${venda.id_local}:`, vendaErr);
          erroCount++;
        }
      }
    } finally {
      this.sincronizando = false;
    }

    const pendentesRestantes = await contarVendasFilaOffline();
    return { sucessoCount, erroCount, pendentesRestantes };
  }

  /**
   * Retorna a quantidade de vendas pendentes de sincronização
   */
  static async obterQuantidadePendentes(): Promise<number> {
    return await contarVendasFilaOffline();
  }
}
