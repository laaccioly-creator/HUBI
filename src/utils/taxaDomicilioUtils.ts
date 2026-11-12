import { Loja, Produto, Pedido } from '../types';
import { ItemAgendamentoInfo } from '../types/agendamento';

export interface ItemCarrinhoOuPedido {
  produto?: Produto | null;
  quantidade?: number;
  subtotal?: number;
  preco_venda_unitario?: number;
  preco_unitario?: number;
  agendamento?: ItemAgendamentoInfo | null;
}

export interface TaxaEfetivaServico {
  taxaEfetiva: number;
  abaterTaxaEfetiva: boolean;
  origem: 'especifico' | 'gratis' | 'padrao_loja';
}

export interface ResultadoTaxaVisita {
  temServicoExterno: boolean;
  temProdutoFisico: boolean;
  ehPedidoMisto: boolean;
  totalServicos: number;
  totalProdutos: number;
  subtotalServicos: number;
  subtotalProdutos: number;
  taxaVisitaOriginal: number;
  taxaVisitaCobrada: number;
  taxaVisitaIsenta: boolean;
  podeAbater: boolean;
  temServicoPrincipalFechado: boolean;
  enderecoVisita: string | null;
}

/**
 * 1. Resolução da Taxa Efetiva de cada Serviço Externo:
 * - Se taxa_deslocamento_domicilio !== null: usa o valor configurado no serviço.
 * - Senão: herda o valor padrão configurado na loja (loja.taxa_padrao_domicilio).
 * - Se abater_taxa_domicilio_ao_fechar !== null: usa a regra do serviço.
 * - Senão: herda a regra da loja (loja.abater_taxa_domicilio_ao_fechar).
 */
export const resolverTaxaEfetivaServico = (
  servico?: Produto | null,
  loja?: Loja | null
): TaxaEfetivaServico => {
  if (!servico) {
    return {
      taxaEfetiva: Number(loja?.taxa_padrao_domicilio || 0),
      abaterTaxaEfetiva: Boolean(loja?.abater_taxa_domicilio_ao_fechar),
      origem: 'padrao_loja'
    };
  }

  const taxaCustomizada = servico.taxa_deslocamento_domicilio;
  const abaterCustomizado = servico.abater_taxa_domicilio_ao_fechar;

  let taxaEfetiva: number;
  let origem: 'especifico' | 'gratis' | 'padrao_loja';

  if (taxaCustomizada !== null && taxaCustomizada !== undefined) {
    taxaEfetiva = Number(taxaCustomizada);
    origem = taxaEfetiva === 0 ? 'gratis' : 'especifico';
  } else {
    taxaEfetiva = Number(loja?.taxa_padrao_domicilio || 0);
    origem = 'padrao_loja';
  }

  const abaterTaxaEfetiva = (abaterCustomizado !== null && abaterCustomizado !== undefined)
    ? Boolean(abaterCustomizado)
    : Boolean(loja?.abater_taxa_domicilio_ao_fechar);

  return {
    taxaEfetiva: Math.max(0, taxaEfetiva),
    abaterTaxaEfetiva,
    origem
  };
};

/**
 * 2, 3 e 4. Cálculo unificado da Taxa de Atendimento a Domicílio para o Carrinho / Pedido:
 * - Cobrança única por visita: Math.max(...) entre todas as taxas efetivas.
 * - Abatimento ao fechar: se podeAbater for true e houver serviço principal fechado
 *   ou se abaterVisitaManual for acionado pelo operador, zera a taxa e marca taxaVisitaIsenta = true.
 * - Pedidos mistos: quando há produtos físicos + serviço externo, os produtos são levados junto.
 */
export const calcularTaxaVisitaPedido = (
  itens: ItemCarrinhoOuPedido[],
  loja?: Loja | null,
  abaterVisitaManual?: boolean
): ResultadoTaxaVisita => {
  let temProdutoFisico = false;
  let totalServicos = 0;
  let totalProdutos = 0;
  let subtotalServicos = 0;
  let subtotalProdutos = 0;
  let enderecoVisita: string | null = null;

  const taxasServicosExternos: number[] = [];
  let podeAbater = false;
  let qtdServicosExternos = 0;
  let temServicoExecutadoPago = false;

  for (const item of itens) {
    const prod = item.produto;
    const ehServico = prod?.tipo_item === 'servico';
    const qtd = Number(item.quantidade || 1);
    const precoUnitario = Number(item.preco_venda_unitario ?? item.preco_unitario ?? prod?.preco_venda_varejo ?? 0);
    const sub = typeof item.subtotal === 'number' ? item.subtotal : (precoUnitario * qtd);

    if (ehServico) {
      totalServicos += qtd;
      subtotalServicos += sub;

      const modalidadeLocal = item.agendamento?.modalidade_local || prod?.local_prestacao_servico;
      const ehExterno = modalidadeLocal === 'externo' || (modalidadeLocal === 'ambos' && item.agendamento?.modalidade_local === 'externo');

      if (ehExterno) {
        qtdServicosExternos += 1;
        const res = resolverTaxaEfetivaServico(prod, loja);
        taxasServicosExternos.push(res.taxaEfetiva);
        if (res.abaterTaxaEfetiva) {
          podeAbater = true;
        }

        if (!enderecoVisita && item.agendamento?.endereco_prestacao_snapshot) {
          enderecoVisita = item.agendamento.endereco_prestacao_snapshot;
        }

        // Se o serviço tiver valor monetário relevante (não é mero orçamento a zero), é um serviço principal de execução
        if (sub > 0) {
          temServicoExecutadoPago = true;
        }
      }
    } else {
      temProdutoFisico = true;
      totalProdutos += qtd;
      subtotalProdutos += sub;
    }
  }

  const temServicoExterno = qtdServicosExternos > 0;
  const ehPedidoMisto = temServicoExterno && temProdutoFisico;

  if (!temServicoExterno) {
    return {
      temServicoExterno: false,
      temProdutoFisico,
      ehPedidoMisto: false,
      totalServicos,
      totalProdutos,
      subtotalServicos,
      subtotalProdutos,
      taxaVisitaOriginal: 0,
      taxaVisitaCobrada: 0,
      taxaVisitaIsenta: false,
      podeAbater: false,
      temServicoPrincipalFechado: false,
      enderecoVisita: null
    };
  }

  // Regra de Cobrança Única por Visita (maior valor entre as taxas individuais)
  const taxaVisitaOriginal = taxasServicosExternos.length > 0
    ? Math.max(...taxasServicosExternos)
    : Number(loja?.taxa_padrao_domicilio || 0);

  // Regra de Abatimento ao Fechar:
  // Se podeAbater for true E (houver serviço principal pago ou se o operador marcou o abatimento manualmente)
  const temServicoPrincipalFechado = temServicoExecutadoPago || (abaterVisitaManual === true);
  const deveAbater = podeAbater && (abaterVisitaManual === true || (abaterVisitaManual !== false && temServicoExecutadoPago));

  const taxaVisitaIsenta = deveAbater;
  const taxaVisitaCobrada = taxaVisitaIsenta ? 0 : taxaVisitaOriginal;

  return {
    temServicoExterno: true,
    temProdutoFisico,
    ehPedidoMisto,
    totalServicos,
    totalProdutos,
    subtotalServicos,
    subtotalProdutos,
    taxaVisitaOriginal,
    taxaVisitaCobrada,
    taxaVisitaIsenta,
    podeAbater,
    temServicoPrincipalFechado,
    enderecoVisita
  };
};

/**
 * 5. Extração robusta dos metadados e informações de atendimento a domicílio
 * de um Pedido já gravado no Supabase para exibição em Telas e Recibos.
 */
export const extrairInfoVisitaPedido = (
  pedido: Pedido,
  loja?: Loja | null
): ResultadoTaxaVisita => {
  const metadados: Record<string, any> = typeof pedido.metadados === 'object' && pedido.metadados !== null
    ? pedido.metadados
    : typeof pedido.metadados === 'string'
    ? (() => {
        try {
          return JSON.parse(pedido.metadados);
        } catch {
          return {};
        }
      })()
    : {};

  const itens = pedido.itens || pedido.itens_pedido || [];
  const temMetadadoVisita = Boolean(
    metadados.servico_a_domicilio ||
    metadados.taxa_visita_cobrada !== undefined ||
    metadados.taxa_visita_isenta !== undefined
  );

  // Se o pedido tiver os metadados específicos gravados no fechamento:
  if (temMetadadoVisita) {
    let subtotalServicos = 0;
    let subtotalProdutos = 0;
    let totalServicos = 0;
    let totalProdutos = 0;

    for (const it of itens) {
      const ehServico = it.produto?.tipo_item === 'servico';
      const qtd = Number(it.quantidade || 1);
      const preco = Number(it.preco_venda_unitario ?? it.preco_unitario ?? 0);
      const sub = Number(it.subtotal ?? (preco * qtd));
      if (ehServico) {
        subtotalServicos += sub;
        totalServicos += qtd;
      } else {
        subtotalProdutos += sub;
        totalProdutos += qtd;
      }
    }

    const taxaVisitaCobrada = Number(metadados.taxa_visita_cobrada ?? pedido.valor_frete ?? 0);
    const taxaVisitaIsenta = Boolean(metadados.taxa_visita_isenta);
    const taxaVisitaOriginal = Number(metadados.taxa_visita_original ?? taxaVisitaCobrada);
    const enderecoVisita = metadados.endereco_prestacao_snapshot || pedido.endereco_entrega || null;

    return {
      temServicoExterno: true,
      temProdutoFisico: totalProdutos > 0,
      ehPedidoMisto: totalProdutos > 0 && totalServicos > 0,
      totalServicos,
      totalProdutos,
      subtotalServicos,
      subtotalProdutos,
      taxaVisitaOriginal,
      taxaVisitaCobrada,
      taxaVisitaIsenta,
      podeAbater: Boolean(metadados.pode_abater_visita ?? taxaVisitaIsenta),
      temServicoPrincipalFechado: Boolean(metadados.abater_visita_aprovada ?? taxaVisitaIsenta),
      enderecoVisita
    };
  }

  // Fallback: calcular dinamicamente a partir dos itens e agendamentos vinculados ao pedido
  const itensAdaptados: ItemCarrinhoOuPedido[] = itens.map(it => {
    const agCorrespondente = (pedido.agendamentos || []).find(ag => ag.produto_id === it.produto_id || (it as any).item_pedido_id === ag.id);
    return {
      produto: it.produto,
      quantidade: it.quantidade,
      subtotal: it.subtotal,
      preco_venda_unitario: it.preco_venda_unitario,
      preco_unitario: it.preco_unitario,
      agendamento: agCorrespondente ? {
        modalidade_local: agCorrespondente.modalidade_local,
        endereco_prestacao_snapshot: agCorrespondente.endereco_prestacao_snapshot,
        profissional_id: agCorrespondente.profissional_id || '',
        profissional_nome: agCorrespondente.profissional?.nome_completo || '',
        data_agendamento: agCorrespondente.data_agendamento,
        hora_inicio: agCorrespondente.hora_inicio,
        hora_fim: agCorrespondente.hora_fim
      } : null
    };
  });

  return calcularTaxaVisitaPedido(itensAdaptados, loja);
};
