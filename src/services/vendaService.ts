import { supabase } from '../lib/supabase';
import { SyncService } from './syncService';
import { ShippingOrchestrator } from './shippingOrchestrator';
import { caixaService } from './caixaService';
import { Cliente, Pedido, StatusPedido, StatusPagamento, FormaPagamento } from '../types';
import { PedidoEntrega } from '../types/shipping';

export interface ItemVendaInput {
  produto: {
    id: string;
    nome: string;
    preco_custo?: number | null;
  };
  variacao?: {
    id: string;
    valor_variacao_1: string;
    valor_variacao_2?: string | null;
    preco_custo?: number | null;
  } | null;
  tabelaPrecoUtilizada: string;
  precoUnitario: number;
  quantidade: number;
  subtotal: number;
  observacoes?: string | null;
}

export interface LinhaPagamentoInput {
  id: string;
  forma_pagamento_id: string;
  forma_tipo: any;
  forma_nome: string;
  valor: number;
  valor_entregue?: number | null;
  parcelas?: number;
}

export interface GravarVendaParams {
  lojaId: string;
  usuarioId?: string | null;
  usuario?: any;
  clienteSelecionado?: Cliente | null;
  pedidoEmEdicao?: Pedido | null;
  pedidoEntrega?: PedidoEntrega | null;
  itens: ItemVendaInput[];
  linhasPagamento: LinhaPagamentoInput[];
  formasPagamentoDisponiveis?: FormaPagamento[];
  taxaEntrega: number;
  subtotal: number;
  desconto: number;
  descontoPercentual: number;
  tipoDesconto: 'valor' | 'percentual';
  total: number;
  observacoes?: string | null;
  tabelaPrecoCalculada: string;
  dataIso: string;
}

export class VendaService {
  /**
   * Grava diretamente no Supabase a venda completa respeitando integridade referencial:
   * 1. public.pedidos (sem numero_pedido manual, acionando a sequence nativa do banco)
   * 2. public.itens_pedido
   * 3. public.pagamentos_pedido
   * 4. public.pedido_entregas
   */
  public static async gravarVendaSupabase(params: GravarVendaParams): Promise<Pedido> {
    const {
      lojaId,
      usuarioId,
      usuario,
      clienteSelecionado,
      pedidoEmEdicao,
      pedidoEntrega,
      itens,
      linhasPagamento,
      formasPagamentoDisponiveis = [],
      taxaEntrega,
      subtotal,
      desconto,
      descontoPercentual,
      tipoDesconto,
      total,
      observacoes,
      tabelaPrecoCalculada,
      dataIso
    } = params;

    if (!lojaId) {
      throw new Error('Estabelecimento não informado para a gravação da venda.');
    }
    if (!itens || itens.length === 0) {
      throw new Error('O carrinho não possui itens para fechamento de venda.');
    }

    // Sanitização de UUIDs e referências relacionais
    const vendedorIdSanitizado = usuarioId && SyncService.isUuidValido(usuarioId) ? usuarioId : null;
    const clienteIdSanitizado = clienteSelecionado?.id && SyncService.isUuidValido(clienteSelecionado.id)
      ? clienteSelecionado.id
      : null;

    const formaEntregaIdSanitizada = pedidoEntrega?.forma_entrega_id && SyncService.isUuidValido(pedidoEntrega.forma_entrega_id)
      ? pedidoEntrega.forma_entrega_id
      : null;

    // Cálculo dos totais de fiado e status de pagamento
    const linhasAtivas = linhasPagamento.filter(l => Number(l.valor) > 0);
    const valorFiadoTotal = linhasAtivas
      .filter(l => l.forma_tipo === 'fiado')
      .reduce((sum, l) => sum + Number(l.valor), 0);

    const valorPago = Number((total - valorFiadoTotal).toFixed(2));
    const saldoDevedor = Number(valorFiadoTotal.toFixed(2));
    const fiadoQuitado = valorFiadoTotal <= 0;
    const statusPagamento: StatusPagamento = valorFiadoTotal === 0
      ? 'pago'
      : (valorPago > 0 ? 'parcialmente_pago' : 'aguardando_pagamento');

    const ehEntrega = pedidoEntrega?.tipo_atendimento === 'entrega' || taxaEntrega > 0;
    let statusFinal: StatusPedido = 'concluido';
    if (pedidoEmEdicao?.status && pedidoEmEdicao.status !== 'pendente') {
      statusFinal = pedidoEmEdicao.status;
    } else {
      statusFinal = ehEntrega ? 'aguardando_envio' : 'concluido';
    }

    // Endereço de destino
    const enderecoEntregaFinal = (() => {
      if (pedidoEntrega?.tipo_atendimento === 'retirada') return null;
      if (pedidoEntrega?.destino_logradouro) {
        const comp = pedidoEntrega.destino_complemento ? ` - ${pedidoEntrega.destino_complemento}` : '';
        const cep = pedidoEntrega.destino_cep ? ` (CEP: ${pedidoEntrega.destino_cep})` : '';
        return `${pedidoEntrega.destino_logradouro}, ${pedidoEntrega.destino_numero || 'S/N'}${comp}, ${pedidoEntrega.destino_bairro}, ${pedidoEntrega.destino_cidade}-${pedidoEntrega.destino_uf}${cep}`;
      }
      if (taxaEntrega > 0 && clienteSelecionado?.endereco_principal) {
        return clienteSelecionado.endereco_principal;
      }
      return null;
    })();

    // Metadados sanitizados
    const metaExistente = (pedidoEmEdicao?.metadados && typeof pedidoEmEdicao.metadados === 'object')
      ? { ...pedidoEmEdicao.metadados }
      : {};

    if (tipoDesconto === 'percentual' && descontoPercentual > 0) {
      metaExistente.desconto_percentual = descontoPercentual;
    } else {
      delete metaExistente.desconto_percentual;
    }
    delete metaExistente.pagamento_previsto;

    metaExistente.transportadora_nome = pedidoEntrega?.transportadora_nome || null;
    metaExistente.provedor_frete = pedidoEntrega?.provedor || null;
    metaExistente.servico_frete_codigo = pedidoEntrega?.servico_codigo || null;
    metaExistente.tipo_atendimento = pedidoEntrega?.tipo_atendimento || (taxaEntrega > 0 ? 'entrega' : 'retirada');

    // Montagem do Payload para public.pedidos SEM passar numero_pedido no insert
    const dadosBasePedido: any = {
      loja_id: lojaId,
      vendedor_id: vendedorIdSanitizado,
      cliente_id: clienteIdSanitizado,
      origem: pedidoEmEdicao?.origem || 'pdv_desktop',
      tabela_preco_aplicada: tabelaPrecoCalculada,
      status: statusFinal,
      status_pagamento: statusPagamento,
      subtotal,
      subtotal_produtos: subtotal,
      desconto_percentual: tipoDesconto === 'percentual' ? descontoPercentual : 0,
      valor_desconto: desconto,
      forma_entrega_id: formaEntregaIdSanitizada,
      codigo_rastreio: pedidoEntrega?.codigo_rastreio || null,
      link_rastreio: pedidoEntrega?.link_rastreio || null,
      entregador_nome: pedidoEntrega?.entregador_nome || null,
      pin_entrega: pedidoEntrega?.pin_entrega || null,
      nome_app: pedidoEntrega?.nome_app || null,
      servico_correios: pedidoEntrega?.servico_correios || null,
      nome_transportadora: pedidoEntrega?.nome_transportadora || pedidoEntrega?.transportadora_nome || null,
      tipo_operacao: pedidoEntrega?.tipo_operacao || null,
      valor_frete: taxaEntrega,
      endereco_entrega: enderecoEntregaFinal,
      valor_total: total,
      valor_pago: valorPago,
      saldo_devedor: saldoDevedor,
      fiado_quitado: fiadoQuitado,
      observacoes: observacoes || null,
      metadados: metaExistente,
      data_venda: pedidoEmEdicao?.data_venda || dataIso
    };

    let pedidoGravado: any;

    if (pedidoEmEdicao?.id) {
      if (pedidoEmEdicao.status === 'cancelado') {
        throw new Error('Pedidos cancelados são estritamente somente leitura e não podem ser editados.');
      }

      // Verificação de segurança no banco de dados para evitar condições de corrida
      const { data: checkPed } = await supabase
        .from('pedidos')
        .select('status')
        .eq('id', pedidoEmEdicao.id)
        .maybeSingle();

      if (checkPed?.status === 'cancelado') {
        throw new Error('Este pedido foi cancelado e não permite modificações.');
      }

      // Edição: Atualiza registro existente
      const { data: pedAtualizado, error: erroUpd } = await supabase
        .from('pedidos')
        .update({
          ...dadosBasePedido,
          atualizado_em: dataIso
        })
        .eq('id', pedidoEmEdicao.id)
        .select()
        .single();

      if (erroUpd || !pedAtualizado) {
        console.error('[VendaService] Erro ao atualizar pedido:', erroUpd);
        throw new Error(erroUpd?.message || 'Falha ao atualizar registro de venda no banco de dados.');
      }
      pedidoGravado = pedAtualizado;

      // Limpa itens antigos para reinserção consistente
      await supabase.from('itens_pedido').delete().eq('pedido_id', pedidoEmEdicao.id);
    } else {
      // Novo pedido: INSERE SEM passar numero_pedido para usar a sequence nativa
      const { data: novoPed, error: erroPedido } = await supabase
        .from('pedidos')
        .insert([dadosBasePedido])
        .select()
        .single();

      if (erroPedido || !novoPed) {
        console.error('[VendaService] Erro ao inserir novo pedido no Supabase:', erroPedido);
        throw new Error(erroPedido?.message || 'Falha ao gravar pedido no banco de dados.');
      }
      pedidoGravado = novoPed;
    }

    const pedidoId = pedidoGravado.id;

    // 2. Gravar itens na tabela public.itens_pedido
    const itensFormatados = itens.map(item => ({
      loja_id: lojaId,
      pedido_id: pedidoId,
      produto_id: item.produto.id,
      variacao_id: item.variacao && SyncService.isUuidValido(item.variacao.id) ? item.variacao.id : null,
      tabela_preco_utilizada: item.tabelaPrecoUtilizada,
      nome_produto: item.produto.nome,
      rotulo_variacao: item.variacao
        ? `${item.variacao.valor_variacao_1} ${item.variacao.valor_variacao_2 || ''}`.trim()
        : null,
      preco_custo_unitario: item.variacao?.preco_custo || item.produto.preco_custo || 0,
      preco_venda_unitario: item.precoUnitario,
      quantidade: item.quantidade,
      subtotal: item.subtotal,
      observacoes: item.observacoes || null
    }));

    const { error: erroItens } = await supabase.from('itens_pedido').insert(itensFormatados);
    if (erroItens) {
      console.error('[VendaService] Erro ao inserir itens_pedido:', erroItens);
      throw new Error(`Falha ao registrar itens do pedido: ${erroItens.message}`);
    }

    // 3. Gravar pagamentos na tabela public.pagamentos_pedido
    await supabase.from('pagamentos_pedido').delete().eq('pedido_id', pedidoId);
    try {
      await supabase.from('pedidos_pagamentos_previstos').delete().eq('pedido_id', pedidoId);
    } catch {}

    const pagamentosFormatados = await Promise.all(linhasAtivas.map(async (l) => {
      const fpIdReal = await SyncService.resolverFormaPagamentoId(lojaId, l.forma_pagamento_id, l.forma_tipo);
      const fpRef = formasPagamentoDisponiveis.find(f => f.id === l.forma_pagamento_id || f.tipo === l.forma_tipo);
      const taxaValor = (Number(l.valor) * Number(fpRef?.taxa_percentual || 0)) / 100;
      const valorLiquido = Number(l.valor) - taxaValor;

      return {
        loja_id: lojaId,
        pedido_id: pedidoId,
        forma_pagamento_id: fpIdReal,
        valor: Number(l.valor),
        parcelas: l.parcelas || 1,
        valor_taxa: taxaValor,
        valor_liquido: valorLiquido,
        data_pagamento: dataIso,
        eh_pagamento_fiado: l.forma_tipo === 'fiado'
      };
    }));

    if (pagamentosFormatados.length > 0) {
      const { error: erroPagamentos } = await supabase.from('pagamentos_pedido').insert(pagamentosFormatados);
      if (erroPagamentos) {
        console.error('[VendaService] Erro ao inserir pagamentos_pedido:', erroPagamentos);
        throw new Error(`Falha ao registrar pagamentos do pedido: ${erroPagamentos.message}`);
      }
    }

    // 4. Gravar registro logístico em public.pedido_entregas
    let entregaGravada: PedidoEntrega | null = null;
    try {
      const entregaPayload: any = pedidoEntrega ? {
        ...pedidoEntrega,
        forma_entrega_id: formaEntregaIdSanitizada,
        pedido_id: pedidoId,
        valor_frete: taxaEntrega,
        contato_entregador: pedidoEntrega.contato_entregador?.trim() || null,
        entregador_nome: pedidoEntrega.entregador_nome?.trim() || null,
        codigo_rastreio: pedidoEntrega.codigo_rastreio?.trim() || null,
        link_rastreio: pedidoEntrega.link_rastreio?.trim() || null,
        pin_entrega: pedidoEntrega.pin_entrega?.trim() || null,
        nome_app: pedidoEntrega.nome_app?.trim() || null,
        servico_correios: pedidoEntrega.servico_correios?.trim() || null,
        nome_transportadora: (pedidoEntrega.nome_transportadora || pedidoEntrega.transportadora_nome)?.trim() || null,
        tipo_operacao: pedidoEntrega.tipo_operacao || null
      } : {
        pedido_id: pedidoId,
        tipo_atendimento: (taxaEntrega > 0 ? 'entrega' : 'retirada') as any,
        valor_frete: taxaEntrega,
        forma_entrega_id: formaEntregaIdSanitizada,
        provedor: (taxaEntrega > 0 ? 'uber' : 'retirada_loja') as any,
        transportadora_nome: taxaEntrega > 0 ? 'Entrega Padrão' : 'Retirada na Loja',
        status_envio: 'pendente'
      };
      entregaGravada = await ShippingOrchestrator.salvarPedidoEntrega(pedidoId, entregaPayload);
    } catch (eEntrega) {
      console.warn('[VendaService] Aviso não-bloqueante ao registrar pedido_entregas:', eEntrega);
    }

    // 5. Atualização de saldo devedor e limite de crédito se compra no Fiado
    if (clienteSelecionado) {
      const valorFiadoAnterior = pedidoEmEdicao
        ? (pedidoEmEdicao.pagamentos || [])
            .filter((p: any) => (p.eh_pagamento_fiado || p.forma_pagamento?.tipo === 'fiado') && !p.fiado_quitado)
            .reduce((sum: number, p: any) => sum + Number(p.valor || 0), 0)
        : 0;

      const diferencaFiado = valorFiadoTotal - valorFiadoAnterior;
      if (diferencaFiado !== 0) {
        try {
          const { data: cliDb } = await supabase
            .from('clientes')
            .select('saldo_devedor_fiado, limite_credito')
            .eq('id', clienteSelecionado.id)
            .single();

          const saldoAtual = Number(cliDb?.saldo_devedor_fiado || clienteSelecionado.saldo_devedor_fiado || 0);
          const limiteAtual = Number(cliDb?.limite_credito || clienteSelecionado.limite_credito || 0);

          await supabase.from('clientes').update({
            limite_credito: Math.max(0, limiteAtual - diferencaFiado),
            saldo_devedor_fiado: Math.max(0, saldoAtual + diferencaFiado)
          }).eq('id', clienteSelecionado.id);
        } catch (errCli) {
          console.warn('[VendaService] Aviso ao atualizar saldo devedor do cliente:', errCli);
        }
      }
    }

    // 6. Registro na sessão de caixa ativa se houver pagamentos em dinheiro/pix/cartão
    const pagamentosCaixa = linhasAtivas.filter(l => l.forma_tipo !== 'fiado' && Number(l.valor) > 0);
    if (pagamentosCaixa.length > 0) {
      try {
        await caixaService.registrarVendaPedido({
          lojaId,
          pedido: pedidoGravado,
          pagamentos: pagamentosCaixa.map(l => ({
            forma_nome: l.forma_nome,
            forma_tipo: l.forma_tipo,
            valor: Number(l.valor)
          })),
          usuarioId: usuarioId || ''
        });
      } catch (errCaixa) {
        console.warn('[VendaService] Aviso ao registrar movimentação na sessão de caixa:', errCaixa);
      }
    }

    // 7. Auditoria no historico_pedidos
    try {
      await supabase.from('historico_pedidos').insert({
        loja_id: lojaId,
        pedido_id: pedidoId,
        usuario_id: usuarioId || null,
        tipo_evento: pedidoEmEdicao ? 'edicao_pdv' : 'criacao',
        status_anterior: pedidoEmEdicao?.status || null,
        status_novo: statusFinal,
        descricao: pedidoEmEdicao
          ? (valorFiadoTotal > 0 ? 'Venda com parcela Fiado concluída no PDV' : 'Conclusão de pagamento no PDV')
          : (valorFiadoTotal > 0 ? 'Venda realizada no PDV com parcela a prazo (Fiado)' : 'Venda finalizada no PDV')
      });
    } catch (errAudit) {
      console.warn('[VendaService] Falha não-bloqueante ao registrar historico_pedidos:', errAudit);
    }

    const pedidoCompleto: Pedido = {
      ...pedidoGravado,
      cliente: clienteSelecionado,
      vendedor: usuario,
      itens: itensFormatados as any,
      pagamentos: pagamentosFormatados as any,
      pedido_entrega: entregaGravada || (pedidoEntrega ? {
        ...pedidoEntrega,
        pedido_id: pedidoId,
        valor_frete: taxaEntrega
      } as any : null)
    };

    return pedidoCompleto;
  }
}
