import type { ItemPedido, Loja, Pedido } from '../types';
import type { AgendamentoServico } from '../types/agendamento';
import type { PedidoEntrega } from '../types/shipping';

export interface ItemPedidoReciboInput extends Partial<ItemPedido> {
  tipo_item?: string | null;
  item_pedido_id?: string | null;
}

export type AgendamentoReciboInput = Partial<
  Pick<
    AgendamentoServico,
    'id' | 'produto_id' | 'item_pedido_id' | 'modalidade_local' | 'endereco_prestacao_snapshot'
  >
>;

export interface PedidoReciboInput
  extends Omit<Pedido, 'itens' | 'itens_pedido' | 'pedido_entrega' | 'pedido_entregas'> {
  pedido_entrega?: PedidoEntrega | PedidoEntrega[] | null;
  pedido_entregas?: PedidoEntrega | PedidoEntrega[] | null;
  itens?: ItemPedidoReciboInput[];
  itens_pedido?: ItemPedidoReciboInput[];
}

export interface DadosReciboPedidoResolvido {
  isSomenteServico: boolean;
  isAtendimentoDomicilio: boolean;
  rotuloLocalCabecalho: 'LOCAL DO SERVIÇO' | 'FORMA DE ENTREGA';
  badgeLocalValor: string;
  rotuloEndereco: 'Local da Prestação' | 'Endereço de Entrega' | 'Local de Retirada';
  enderecoFormatado: string;
  rotuloSubtotal: 'Subtotal dos Serviços' | 'Subtotal dos Produtos';
  subtotalItens: number;
  taxaVisitaDomicilio: number;
  rotuloTaxaAdicional: string | null;
  subtituloRecibo: 'Comprovante de atendimento e serviço' | 'Comprovante de pedido e entrega';
}

const formatarEnderecoLoja = (loja?: Loja | null): string => {
  if (!loja) return 'Balcão da Loja Física';
  const partes = [
    loja.endereco_logradouro,
    loja.endereco_numero,
    loja.endereco_complemento,
    loja.endereco_bairro,
    loja.endereco_cidade && loja.endereco_estado
      ? `${loja.endereco_cidade}/${loja.endereco_estado}`
      : loja.endereco_cidade || loja.endereco_estado,
    loja.endereco_cep ? `CEP ${loja.endereco_cep}` : null
  ].filter((p): p is string => Boolean(p && p.trim()));

  return partes.length > 0 ? partes.join(', ') : 'Balcão da Loja Física';
};

const formatarEnderecoPedidoEntrega = (pe?: PedidoEntrega | null): string | null => {
  if (!pe?.destino_logradouro?.trim()) return null;
  const linhaPrincipal = `${pe.destino_logradouro.trim()}, ${pe.destino_numero?.trim() || 'S/N'}`;
  const complemento = pe.destino_complemento?.trim() ? ` - ${pe.destino_complemento.trim()}` : '';
  const bairro = pe.destino_bairro?.trim() ? `, ${pe.destino_bairro.trim()}` : '';
  const cidadeUf =
    pe.destino_cidade?.trim() && pe.destino_uf?.trim()
      ? `, ${pe.destino_cidade.trim()}/${pe.destino_uf.trim()}`
      : pe.destino_cidade?.trim()
      ? `, ${pe.destino_cidade.trim()}`
      : '';
  const cep = pe.destino_cep?.trim() ? ` (CEP: ${pe.destino_cep.trim()})` : '';
  return `${linhaPrincipal}${complemento}${bairro}${cidadeUf}${cep}`;
};

const normalizarTextoEndereco = (texto?: string | null): string =>
  (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

/**
 * Resolve de forma centralizada e estritamente tipada os rótulos, locais, endereços
 * e taxas de visita de um recibo no HUBI (Modal, PDF, Térmica, A4 e Recibo Público).
 */
export const resolverDadosReciboPedido = (
  pedido: PedidoReciboInput,
  itens?: ItemPedidoReciboInput[] | null,
  loja?: Loja | null,
  agendamento?: AgendamentoReciboInput | AgendamentoReciboInput[] | null
): DadosReciboPedidoResolvido => {
  const listaItens: ItemPedidoReciboInput[] =
    itens && itens.length > 0
      ? itens
      : pedido.itens || pedido.itens_pedido || [];

  const listaAgendamentos: AgendamentoReciboInput[] = Array.isArray(agendamento)
    ? agendamento
    : agendamento
    ? [agendamento]
    : pedido.agendamentos || [];

  const isItemServico = (item: ItemPedidoReciboInput): boolean => {
    if (item.tipo_item === 'servico' || item.produto?.tipo_item === 'servico') {
      return true;
    }
    return listaAgendamentos.some(
      (ag) =>
        (Boolean(ag.item_pedido_id) && ag.item_pedido_id === item.id) ||
        (Boolean(ag.produto_id) && ag.produto_id === item.produto_id)
    );
  };

  const isSomenteServico =
    listaItens.length > 0
      ? listaItens.every(isItemServico)
      : listaAgendamentos.length > 0;

  const subtotalCalculadoItens = listaItens.reduce((acc, item) => {
    const qtd = Number(item.quantidade ?? 1);
    const unitario = Number(item.preco_venda_unitario ?? item.preco_unitario ?? 0);
    const sub = typeof item.subtotal === 'number' ? Number(item.subtotal) : unitario * qtd;
    return acc + sub;
  }, 0);

  const subtotalItens =
    subtotalCalculadoItens > 0
      ? Number(subtotalCalculadoItens.toFixed(2))
      : Number((pedido.subtotal ?? 0).toFixed(2));

  const freteInformado = Number(pedido.valor_frete || 0);
  const diferencaTotal = Math.max(
    0,
    Number(pedido.valor_total || 0) + Number(pedido.valor_desconto || 0) - subtotalItens
  );
  const taxaVisitaDomicilio =
    freteInformado > 0
      ? Number(freteInformado.toFixed(2))
      : diferencaTotal > 0.009
      ? Number(diferencaTotal.toFixed(2))
      : 0;

  const rawPe = pedido.pedido_entrega ?? pedido.pedido_entregas;
  const pe: PedidoEntrega | null = Array.isArray(rawPe) ? rawPe[0] ?? null : rawPe ?? null;

  const enderecoLoja = formatarEnderecoLoja(loja);
  const enderecoPe = formatarEnderecoPedidoEntrega(pe);
  const enderecoPedidoDireto = pedido.endereco_entrega?.trim() || null;
  const enderecoDestinoCandidato = enderecoPe || enderecoPedidoDireto;

  const temDestinoDiferenteDaLoja = Boolean(
    enderecoDestinoCandidato &&
      normalizarTextoEndereco(enderecoDestinoCandidato) !== normalizarTextoEndereco(enderecoLoja)
  );

  const temAgendamentoExterno = listaAgendamentos.some((ag) => ag.modalidade_local === 'externo');

  const isAtendimentoDomicilio =
    temAgendamentoExterno || temDestinoDiferenteDaLoja || taxaVisitaDomicilio > 0;

  if (isSomenteServico) {
    const snapshotAgendamento =
      listaAgendamentos.find(
        (ag) => ag.modalidade_local === 'externo' && ag.endereco_prestacao_snapshot?.trim()
      )?.endereco_prestacao_snapshot?.trim() ||
      listaAgendamentos.find((ag) => ag.endereco_prestacao_snapshot?.trim())
        ?.endereco_prestacao_snapshot?.trim() ||
      null;

    const enderecoFormatado = isAtendimentoDomicilio
      ? snapshotAgendamento || enderecoPe || enderecoPedidoDireto || 'Endereço do cliente'
      : enderecoLoja;

    return {
      isSomenteServico: true,
      isAtendimentoDomicilio,
      rotuloLocalCabecalho: 'LOCAL DO SERVIÇO',
      badgeLocalValor: isAtendimentoDomicilio ? 'EM DOMICÍLIO' : 'NA LOJA',
      rotuloEndereco: 'Local da Prestação',
      enderecoFormatado,
      rotuloSubtotal: 'Subtotal dos Serviços',
      subtotalItens,
      taxaVisitaDomicilio,
      rotuloTaxaAdicional: taxaVisitaDomicilio > 0 ? 'Taxa de Visita (Domicílio)' : null,
      subtituloRecibo: 'Comprovante de atendimento e serviço'
    };
  }

  return {
    isSomenteServico: false,
    isAtendimentoDomicilio,
    rotuloLocalCabecalho: 'FORMA DE ENTREGA',
    badgeLocalValor: isAtendimentoDomicilio ? 'ENTREGA' : 'RETIRADA NA LOJA',
    rotuloEndereco: isAtendimentoDomicilio ? 'Endereço de Entrega' : 'Local de Retirada',
    enderecoFormatado: isAtendimentoDomicilio
      ? enderecoDestinoCandidato || 'Endereço a ser confirmado com o cliente'
      : enderecoLoja,
    rotuloSubtotal: 'Subtotal dos Produtos',
    subtotalItens,
    taxaVisitaDomicilio,
    rotuloTaxaAdicional: taxaVisitaDomicilio > 0 ? 'Frete / Entrega' : null,
    subtituloRecibo: 'Comprovante de pedido e entrega'
  };
};
