import type { Cliente, ItemPedido, Loja, Pedido } from '../types';
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
  clientes?: Cliente | null;
}

export interface DadosReciboPedidoResolvido {
  isSomenteProduto: boolean;
  isSomenteServico: boolean;
  isPedidoHibrido: boolean;
  isAtendimentoDomicilio: boolean;
  levarProdutoNoAtendimento: boolean;
  rotuloLocalCabecalho: 'LOCAL DO SERVIÇO' | 'FORMA DE ENTREGA';
  badgeLocalValor: string;
  rotuloEndereco: 'Local da Prestação' | 'Endereço de Entrega' | 'Local de Retirada';
  enderecoFormatado: string;
  entregaProdutosDescricao: string | null;
  entregaProdutosEndereco: string | null;
  rotuloSubtotal: 'Subtotal dos Serviços' | 'Subtotal dos Produtos';
  subtotalItens: number;
  subtotalProdutos: number;
  subtotalServicos: number;
  taxaVisitaDomicilio: number;
  valorFreteProdutos: number;
  rotuloTaxaAdicional: string | null;
  subtituloRecibo:
    | 'Comprovante de atendimento e serviço'
    | 'Comprovante de pedido e entrega'
    | 'Comprovante de pedido e atendimento';
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

export const formatarEnderecoCliente = (cliente?: Cliente | null): string | null => {
  if (!cliente) return null;
  const logradouro = cliente.endereco_logradouro?.trim() || cliente.rua?.trim() || cliente.endereco?.trim();
  const numero = cliente.endereco_numero?.trim() || cliente.numero?.trim();
  const complemento = cliente.endereco_complemento?.trim() || cliente.complemento?.trim();
  const bairro = cliente.endereco_bairro?.trim() || cliente.bairro?.trim();
  const cidade = cliente.endereco_cidade?.trim() || cliente.cidade?.trim();
  const uf = cliente.endereco_estado?.trim() || cliente.estado?.trim();
  const cep = cliente.endereco_cep?.trim() || cliente.cep?.trim();

  if (logradouro) {
    const linhaPrincipal = `${logradouro}${numero ? `, ${numero}` : ''}`;
    const compFmt = complemento ? ` - ${complemento}` : '';
    const bairroFmt = bairro ? `, ${bairro}` : '';
    const cidadeUf = cidade && uf ? `, ${cidade}/${uf}` : cidade ? `, ${cidade}` : '';
    const cepFmt = cep ? ` - CEP: ${cep}` : '';
    return `${linhaPrincipal}${compFmt}${bairroFmt}${cidadeUf}${cepFmt}`;
  }

  if (cliente.endereco_principal?.trim()) {
    return cliente.endereco_principal.trim();
  }

  return null;
};

const isSnapshotGenerico = (texto?: string | null): boolean => {
  const norm = normalizarTextoEndereco(texto);
  return !norm || norm === 'enderecodocliente' || norm === 'noenderecodocliente';
};

/**
 * Resolve de forma centralizada e estritamente tipada os rótulos, locais, endereços
 * e taxas de visita de um recibo no HUBI (Modal, PDF, Térmica, A4 e Recibo Público).
 */
export const resolverDadosReciboPedido = (
  pedido: PedidoReciboInput,
  itens?: ItemPedidoReciboInput[] | null,
  loja?: Loja | null,
  agendamento?: AgendamentoReciboInput | AgendamentoReciboInput[] | null,
  clienteExtra?: Cliente | null
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

  const temServico =
    listaItens.length > 0
      ? listaItens.some(isItemServico)
      : listaAgendamentos.length > 0;
  const temProduto =
    listaItens.length > 0
      ? listaItens.some((it) => !isItemServico(it))
      : false;

  const isSomenteServico = temServico && !temProduto;
  const isPedidoHibrido = temServico && temProduto;
  const isSomenteProduto = !temServico;
  const levarProdutoNoAtendimento = Boolean(pedido.levar_produto_no_atendimento);

  const calcSubItem = (item: ItemPedidoReciboInput): number => {
    const qtd = Number(item.quantidade ?? 1);
    const unitario = Number(item.preco_venda_unitario ?? item.preco_unitario ?? 0);
    return typeof item.subtotal === 'number' ? Number(item.subtotal) : unitario * qtd;
  };

  const subtotalProdutosRaw = listaItens
    .filter((it) => !isItemServico(it))
    .reduce((acc, it) => acc + calcSubItem(it), 0);
  const subtotalServicosRaw = listaItens
    .filter((it) => isItemServico(it))
    .reduce((acc, it) => acc + calcSubItem(it), 0);

  const subtotalProdutos = Number(subtotalProdutosRaw.toFixed(2));
  const subtotalServicos = Number(subtotalServicosRaw.toFixed(2));
  const subtotalCalculadoItens = subtotalProdutosRaw + subtotalServicosRaw;

  const subtotalItens =
    subtotalCalculadoItens > 0
      ? Number(subtotalCalculadoItens.toFixed(2))
      : Number((pedido.subtotal ?? 0).toFixed(2));

  const freteInformado = Number(pedido.valor_frete || 0);
  const taxaDomicilioColuna = Number(pedido.valor_taxa_domicilio || 0);
  const diferencaTotal = Math.max(
    0,
    Number(pedido.valor_total || 0) + Number(pedido.valor_desconto || 0) - subtotalItens
  );

  const taxaVisitaDomicilio =
    taxaDomicilioColuna > 0
      ? Number(taxaDomicilioColuna.toFixed(2))
      : isSomenteServico
      ? freteInformado > 0
        ? Number(freteInformado.toFixed(2))
        : diferencaTotal > 0.009
        ? Number(diferencaTotal.toFixed(2))
        : 0
      : 0;

  const valorFreteProdutos = isSomenteServico ? 0 : Number(freteInformado.toFixed(2));

  const rawPe = pedido.pedido_entrega ?? pedido.pedido_entregas;
  const pe: PedidoEntrega | null = Array.isArray(rawPe) ? rawPe[0] ?? null : rawPe ?? null;

  const enderecoLoja = formatarEnderecoLoja(loja);
  const enderecoPe = formatarEnderecoPedidoEntrega(pe);
  const enderecoPedidoDireto = !isSnapshotGenerico(pedido.endereco_entrega)
    ? pedido.endereco_entrega?.trim() || null
    : null;
  const enderecoCadastroCliente = formatarEnderecoCliente(
    clienteExtra || pedido.cliente || pedido.clientes || null
  );
  const enderecoDestinoCandidato = enderecoPe || enderecoPedidoDireto || enderecoCadastroCliente;

  const temDestinoDiferenteDaLoja = Boolean(
    (enderecoPe || enderecoPedidoDireto) &&
      normalizarTextoEndereco(enderecoPe || enderecoPedidoDireto) !== normalizarTextoEndereco(enderecoLoja)
  );

  const temAgendamentoExterno = listaAgendamentos.some((ag) => ag.modalidade_local === 'externo');

  const isAtendimentoDomicilio =
    temAgendamentoExterno ||
    taxaVisitaDomicilio > 0 ||
    (!isPedidoHibrido && temDestinoDiferenteDaLoja);

  const snapshotBruto =
    listaAgendamentos.find(
      (ag) =>
        ag.modalidade_local === 'externo' &&
        ag.endereco_prestacao_snapshot?.trim() &&
        !isSnapshotGenerico(ag.endereco_prestacao_snapshot)
    )?.endereco_prestacao_snapshot?.trim() ||
    listaAgendamentos.find(
      (ag) =>
        ag.endereco_prestacao_snapshot?.trim() &&
        !isSnapshotGenerico(ag.endereco_prestacao_snapshot)
    )?.endereco_prestacao_snapshot?.trim() ||
    null;

  if (isPedidoHibrido) {
    const enderecoServico = isAtendimentoDomicilio
      ? snapshotBruto || enderecoPe || enderecoPedidoDireto || enderecoCadastroCliente || 'A confirmar com o cliente'
      : enderecoLoja;

    const envioProdutosSeparado =
      !levarProdutoNoAtendimento &&
      (pe?.tipo_atendimento === 'entrega' || valorFreteProdutos > 0 || temDestinoDiferenteDaLoja);

    const entregaProdutosDescricao = levarProdutoNoAtendimento
      ? 'Levar junto no atendimento técnico'
      : envioProdutosSeparado
      ? pe?.transportadora_nome || pedido.nome_transportadora || 'Entrega / Frete'
      : 'Retirada na Loja';

    const entregaProdutosEndereco =
      envioProdutosSeparado &&
      enderecoDestinoCandidato &&
      normalizarTextoEndereco(enderecoDestinoCandidato) !== normalizarTextoEndereco(enderecoServico)
        ? enderecoDestinoCandidato
        : !levarProdutoNoAtendimento && !envioProdutosSeparado
        ? enderecoLoja
        : null;

    return {
      isSomenteProduto: false,
      isSomenteServico: false,
      isPedidoHibrido: true,
      isAtendimentoDomicilio,
      levarProdutoNoAtendimento,
      rotuloLocalCabecalho: 'LOCAL DO SERVIÇO',
      badgeLocalValor: isAtendimentoDomicilio ? 'EM DOMICÍLIO' : 'NA LOJA',
      rotuloEndereco: 'Local da Prestação',
      enderecoFormatado: enderecoServico,
      entregaProdutosDescricao,
      entregaProdutosEndereco,
      rotuloSubtotal: 'Subtotal dos Produtos',
      subtotalItens,
      subtotalProdutos,
      subtotalServicos,
      taxaVisitaDomicilio,
      valorFreteProdutos,
      rotuloTaxaAdicional: taxaVisitaDomicilio > 0 ? 'Taxa de Visita (Domicílio)' : null,
      subtituloRecibo: 'Comprovante de pedido e atendimento'
    };
  }

  if (isSomenteServico) {
    const enderecoFormatado = isAtendimentoDomicilio
      ? snapshotBruto || enderecoPe || enderecoPedidoDireto || enderecoCadastroCliente || 'A confirmar com o cliente'
      : enderecoLoja;

    return {
      isSomenteProduto: false,
      isSomenteServico: true,
      isPedidoHibrido: false,
      isAtendimentoDomicilio,
      levarProdutoNoAtendimento: false,
      rotuloLocalCabecalho: 'LOCAL DO SERVIÇO',
      badgeLocalValor: isAtendimentoDomicilio ? 'EM DOMICÍLIO' : 'NA LOJA',
      rotuloEndereco: 'Local da Prestação',
      enderecoFormatado,
      entregaProdutosDescricao: null,
      entregaProdutosEndereco: null,
      rotuloSubtotal: 'Subtotal dos Serviços',
      subtotalItens,
      subtotalProdutos: 0,
      subtotalServicos: subtotalServicos > 0 ? subtotalServicos : subtotalItens,
      taxaVisitaDomicilio,
      valorFreteProdutos: 0,
      rotuloTaxaAdicional: taxaVisitaDomicilio > 0 ? 'Taxa de Visita (Domicílio)' : null,
      subtituloRecibo: 'Comprovante de atendimento e serviço'
    };
  }

  return {
    isSomenteProduto,
    isSomenteServico: false,
    isPedidoHibrido: false,
    isAtendimentoDomicilio,
    levarProdutoNoAtendimento: false,
    rotuloLocalCabecalho: 'FORMA DE ENTREGA',
    badgeLocalValor: isAtendimentoDomicilio ? 'ENTREGA' : 'RETIRADA NA LOJA',
    rotuloEndereco: isAtendimentoDomicilio ? 'Endereço de Entrega' : 'Local de Retirada',
    enderecoFormatado: isAtendimentoDomicilio
      ? enderecoDestinoCandidato || 'Endereço a ser confirmado com o cliente'
      : enderecoLoja,
    entregaProdutosDescricao: null,
    entregaProdutosEndereco: null,
    rotuloSubtotal: 'Subtotal dos Produtos',
    subtotalItens,
    subtotalProdutos: subtotalProdutos > 0 ? subtotalProdutos : subtotalItens,
    subtotalServicos: 0,
    taxaVisitaDomicilio: 0,
    valorFreteProdutos,
    rotuloTaxaAdicional: valorFreteProdutos > 0 ? 'Frete / Entrega' : null,
    subtituloRecibo: 'Comprovante de pedido e entrega'
  };
};
