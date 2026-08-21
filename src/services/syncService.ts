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

export const isUuidValido = (val?: string | null): boolean => {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
};

export class SyncService {
  private static sincronizando = false;

  static isUuidValido(val?: string | null): boolean {
    return isUuidValido(val);
  }

  /**
   * Garante que um ID de forma de pagamento seja um UUID real existente no banco
   */
  static async resolverFormaPagamentoId(lojaId: string, formaPagamentoId?: string, tipo?: string): Promise<string> {
    if (isUuidValido(formaPagamentoId)) {
      const { data } = await supabase
        .from('formas_pagamento')
        .select('id')
        .eq('id', formaPagamentoId)
        .limit(1);

      if (data && data.length > 0) return data[0].id;
    }

    // Busca uma existente para a loja por tipo
    const query = supabase.from('formas_pagamento').select('id').eq('loja_id', lojaId);
    if (tipo) query.eq('tipo', tipo);
    const { data: existentes } = await query.limit(1);

    if (existentes && existentes.length > 0) {
      return existentes[0].id;
    }

    // Cria nova forma de pagamento para obter UUID real
    const { data: criada, error } = await supabase
      .from('formas_pagamento')
      .insert([{
        loja_id: lojaId,
        nome: tipo === 'pix' ? 'Pix' : tipo === 'cartao_credito' ? 'Cartão de Crédito' : tipo === 'cartao_debito' ? 'Cartão de Débito' : tipo === 'fiado' ? 'Fiado / A Prazo' : 'Dinheiro',
        tipo: tipo || 'dinheiro',
        ativo: true,
        taxa_percentual: 0,
        taxa_fixa: 0,
        maximo_parcelas: 1
      }])
      .select('id')
      .single();

    if (criada && criada.id) return criada.id;
    if (error) console.error('Erro ao resolver forma de pagamento:', error);
    throw new Error('Não foi possível resolver uma forma de pagamento válida no banco de dados.');
  }

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
      let formasPagamento = (resFps.data as FormaPagamento[]) || [];

      // Se a loja não possuir formas de pagamento cadastradas, cria as padrões imediatamente
      if (formasPagamento.length === 0) {
        const defaults = [
          { loja_id: lojaId, nome: 'Dinheiro', tipo: 'dinheiro' as const, taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
          { loja_id: lojaId, nome: 'Pix', tipo: 'pix' as const, taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
          { loja_id: lojaId, nome: 'Cartão de Débito', tipo: 'cartao_debito' as const, taxa_percentual: 1.5, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
          { loja_id: lojaId, nome: 'Cartão de Crédito', tipo: 'cartao_credito' as const, taxa_percentual: 3.2, taxa_fixa: 0, maximo_parcelas: 12, ativo: true, exibir_catalogo: true },
          { loja_id: lojaId, nome: 'Fiado / A Prazo', tipo: 'fiado' as const, taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: false }
        ];

        try {
          const { data: criadas } = await supabase
            .from('formas_pagamento')
            .insert(defaults)
            .select();

          if (criadas && criadas.length > 0) {
            formasPagamento = criadas as FormaPagamento[];
          }
        } catch (e) {
          console.warn('Erro ao inserir formas padrões no Supabase:', e);
        }
      }

      // Salvar no IndexedDB
      if (produtos.length > 0) await salvarProdutosOffline(produtos);
      if (clientes.length > 0) await salvarClientesOffline(clientes);
      if (formasPagamento.length > 0) await salvarFormasPagamentoOffline(formasPagamento);

      return { produtos, clientes, formasPagamento };
    } catch (err) {
      console.warn('Erro ao sincronizar do Supabase, carregando cache local:', err);
      const [produtos, clientes, fpsLocais] = await Promise.all([
        carregarProdutosOffline(),
        carregarClientesOffline(),
        carregarFormasPagamentoOffline()
      ]);

      return { produtos, clientes, formasPagamento: fpsLocais || [] };
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
          // Resolver vendedor_id válido (deve ser UUID existente em usuarios_loja ou null)
          let vendedorIdSanitizado: string | null = isUuidValido(venda.vendedor_id) ? venda.vendedor_id : null;
          if (vendedorIdSanitizado) {
            const { data: usuarioExiste } = await supabase
              .from('usuarios_loja')
              .select('id')
              .eq('id', vendedorIdSanitizado)
              .limit(1);

            if (!usuarioExiste || usuarioExiste.length === 0) {
              vendedorIdSanitizado = null;
            }
          }

          // Resolver cliente_id
          const clienteIdSanitizado = isUuidValido(venda.cliente_id) ? venda.cliente_id : null;

          // 1. Inserir Pedido no Supabase
          const { data: pedidoCriado, error: erroPedido } = await supabase
            .from('pedidos')
            .insert([{
              loja_id: venda.loja_id,
              vendedor_id: vendedorIdSanitizado,
              cliente_id: clienteIdSanitizado,
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
            variacao_id: isUuidValido(item.variacao_id) ? item.variacao_id : null,
            pedido_id: pedidoCriado.id
          }));

          const { error: erroItens } = await supabase.from('itens_pedido').insert(itensFormatados);
          if (erroItens) throw erroItens;

          // 3. Resolver forma de pagamento real UUID
          const fpIdReal = await this.resolverFormaPagamentoId(
            venda.loja_id,
            venda.pagamento.forma_pagamento_id,
            venda.pagamento.eh_pagamento_fiado ? 'fiado' : undefined
          );

          const { error: erroPagamento } = await supabase.from('pagamentos_pedido').insert([{
            ...venda.pagamento,
            forma_pagamento_id: fpIdReal,
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
