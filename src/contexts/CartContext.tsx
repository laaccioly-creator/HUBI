import React, { createContext, useContext, useState, useMemo } from 'react';
import { Produto, VariacaoProduto, Cliente, TabelaPreco, PedidoEntrega } from '../types';
import { audioService } from '../services/audioService';
import { useAuth } from './AuthContext';
import {
  obterRegrasPrecificacao,
  avaliarNivelCarrinho,
  calcularPrecoUnitarioPorTabela,
  ResultadoAvaliacaoCarrinho
} from '../services/pricingEngine';
import { ShippingOrchestrator } from '../services/shippingOrchestrator';
import { DadosEnderecoCliente } from '../components/ModalEnderecoClienteCatalogo';

import { supabase } from '../lib/supabase';
import { podeEditarItensPedido, podeEditarDescontoPedido } from '../utils/statusPedidoUtils';

export interface CartItem {
  id: string;
  produto: Produto;
  variacao?: VariacaoProduto | null;
  quantidade: number;
  tabelaPrecoUtilizada: TabelaPreco;
  precoUnitario: number;
  subtotal: number;
  observacoes?: string;
}

interface CartContextType {
  itens: CartItem[];
  clienteSelecionado: Cliente | null;
  tabelaPrecoGlobal: TabelaPreco;
  tabelaPrecoCalculada: TabelaPreco;
  avaliacaoCarrinho: ResultadoAvaliacaoCarrinho;
  desconto: number;
  descontoPercentual: number;
  tipoDesconto: 'valor' | 'percentual';
  taxaEntrega: number;
  pedidoEntrega: PedidoEntrega | null;
  enderecoEntrega: string | null;
  dadosEndereco: DadosEnderecoCliente | null;
  subtotal: number;
  total: number;
  totalItens: number;
  pedidoEmEdicao: any | null;
  temAlteracoesPedido: boolean;
  resetarSnapshotPedido: () => void;
  adicionarItem: (produto: Produto, variacao?: VariacaoProduto | null, quantidade?: number, observacoes?: string) => void;
  removerItem: (cartId: string) => void;
  atualizarQuantidade: (cartId: string, quantidade: number) => void;
  setClienteSelecionado: (cliente: Cliente | null) => void;
  setTabelaPrecoGlobal: (tabela: TabelaPreco) => void;
  setDescontoValor: (valor: number) => void;
  setDescontoPercentual: (percentual: number) => void;
  setTipoDesconto: (tipo: 'valor' | 'percentual') => void;
  setDesconto: (valor: number) => void;
  setTaxaEntrega: (valor: number) => void;
  setPedidoEntrega: (entrega: PedidoEntrega | null) => void;
  setEnderecoEntrega: (endereco: string | null) => void;
  setDadosEndereco: (dados: DadosEnderecoCliente | null) => void;
  limparCarrinho: () => void;
  freteGratisAtivo: boolean;
  freteGratisValorMinimo: number;
  retiradaLojaAtiva: boolean;
  setConfigFrete: (config: { frete_gratis_ativo?: boolean; frete_gratis_valor_minimo?: number; retirada_loja_ativa?: boolean }) => void;
  carregarPedidoParaEdicao: (pedido: any) => Promise<void>;
  cancelarEdicaoPedido: () => void;
  atualizarStatusPedidoEmEdicao: (novoStatus: string) => void;
}

const CartContext = createContext<CartContextType>({} as CartContextType);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loja } = useAuth();
  const [itens, setItens] = useState<CartItem[]>([]);
  const [clienteSelecionado, setClienteSelecionadoState] = useState<Cliente | null>(null);
  const [tabelaPrecoGlobal, setTabelaPrecoGlobalState] = useState<TabelaPreco>('varejo');
  const [desconto, setDescontoState] = useState<number>(0);
  const [descontoPercentual, setDescontoPercentualState] = useState<number>(0);
  const [tipoDesconto, setTipoDesconto] = useState<'valor' | 'percentual'>('valor');
  const [taxaEntrega, setTaxaEntrega] = useState<number>(0);
  const [pedidoEntrega, setPedidoEntrega] = useState<PedidoEntrega | null>(null);
  const [enderecoEntrega, setEnderecoEntrega] = useState<string | null>(null);
  const [dadosEndereco, setDadosEndereco] = useState<DadosEnderecoCliente | null>(null);
  const [pedidoEmEdicao, setPedidoEmEdicao] = useState<any | null>(null);

  const [configFreteState, setConfigFreteState] = useState<{
    frete_gratis_ativo: boolean;
    frete_gratis_valor_minimo: number;
    retirada_loja_ativa: boolean;
  }>({
    frete_gratis_ativo: Boolean(loja?.frete_gratis_ativo),
    frete_gratis_valor_minimo: Number(loja?.frete_gratis_valor_minimo || 0),
    retirada_loja_ativa: Boolean(loja?.retirada_loja_ativa)
  });

  const setConfigFrete = (config: { frete_gratis_ativo?: boolean; frete_gratis_valor_minimo?: number; retirada_loja_ativa?: boolean }) => {
    setConfigFreteState(prev => ({
      frete_gratis_ativo: config.frete_gratis_ativo !== undefined ? Boolean(config.frete_gratis_ativo) : prev.frete_gratis_ativo,
      frete_gratis_valor_minimo: config.frete_gratis_valor_minimo !== undefined ? Number(config.frete_gratis_valor_minimo) : prev.frete_gratis_valor_minimo,
      retirada_loja_ativa: config.retirada_loja_ativa !== undefined ? Boolean(config.retirada_loja_ativa) : prev.retirada_loja_ativa
    }));
  };

  const regrasAtivas = useMemo(() => obterRegrasPrecificacao(loja), [loja]);

  // Avaliação Dinâmica do Carrinho com pricingEngine
  const avaliacaoCarrinho = useMemo(() => {
    const itensSimples = itens.map(i => ({
      id: i.id,
      produto: i.produto,
      variacao: i.variacao,
      quantidade: i.quantidade
    }));
    return avaliarNivelCarrinho(itensSimples, regrasAtivas);
  }, [itens, regrasAtivas]);

  // Tabela efetiva a aplicar: se tabelaPrecoGlobal for manual (diferente de varejo), respeita; senão usa a calculada dinamicamente
  const tabelaPrecoCalculada = useMemo(() => {
    if (tabelaPrecoGlobal === 'autoatacado' || tabelaPrecoGlobal === 'atacado' || tabelaPrecoGlobal === 'promocional') {
      return tabelaPrecoGlobal;
    }
    return avaliacaoCarrinho.tabelaAtiva;
  }, [tabelaPrecoGlobal, avaliacaoCarrinho.tabelaAtiva]);

  const calcularPrecoItemContext = (
    produto: Produto,
    variacao: VariacaoProduto | null | undefined,
    tabelaAlvo: TabelaPreco
  ): number => {
    const fallbackDesc = tabelaAlvo === 'autoatacado' ? regrasAtivas.descontoAutoatacado : tabelaAlvo === 'atacado' ? regrasAtivas.descontoAtacado : 0;
    return calcularPrecoUnitarioPorTabela(produto, variacao, tabelaAlvo, fallbackDesc);
  };

  const setClienteSelecionado = (cliente: Cliente | null) => {
    setClienteSelecionadoState(cliente);
    if (cliente?.tabela_preco_padrao) {
      setTabelaPrecoGlobal(cliente.tabela_preco_padrao);
    }
    if (cliente) {
      const endObj: DadosEnderecoCliente = {
        cep: cliente.endereco_cep || cliente.cep || '',
        rua: cliente.endereco_logradouro || cliente.rua || cliente.endereco || '',
        numero: cliente.endereco_numero || cliente.numero || '',
        complemento: cliente.endereco_complemento || cliente.complemento || '',
        bairro: cliente.endereco_bairro || cliente.bairro || '',
        cidade: cliente.endereco_cidade || cliente.cidade || '',
        estado: cliente.endereco_estado || cliente.estado || ''
      };
      if (endObj.rua || endObj.cep || endObj.cidade) {
        setDadosEndereco(endObj);
        const partes = [
          endObj.rua,
          endObj.numero ? `nº ${endObj.numero}` : '',
          endObj.complemento ? `(${endObj.complemento})` : '',
          endObj.bairro ? `- ${endObj.bairro}` : '',
          endObj.cidade,
          endObj.estado ? `/${endObj.estado}` : '',
          endObj.cep ? `• CEP: ${endObj.cep}` : ''
        ].filter(Boolean);
        if (partes.length > 0) {
          setEnderecoEntrega(partes.join(' '));
        }
      }
    }
  };

  const setTabelaPrecoGlobal = (tabela: TabelaPreco) => {
    setTabelaPrecoGlobalState(tabela);
  };

  const adicionarItem = (
    produto: Produto,
    variacao?: VariacaoProduto | null,
    quantidade: number = 1,
    observacoes?: string
  ) => {
    if (pedidoEmEdicao && !podeEditarItensPedido(pedidoEmEdicao.status)) {
      alert(`⚠️ Pedidos com status "${pedidoEmEdicao.status}" não permitem adicionar itens. Apenas pedidos em aberto (pendente) permitem alteração de itens.`);
      return;
    }

    const isServico = produto.tipo_item === 'servico';
    const controlaEstoque = !isServico && loja?.configuracoes_extras?.controlar_estoque !== false && loja?.configuracoes_extras?.geral?.controlar_estoque !== false;
    const permiteNegativo = Boolean(
      (variacao as any)?.permite_estoque_negativo ||
      produto.permite_estoque_negativo ||
      loja?.configuracoes_extras?.geral?.permitir_venda_estoque_negativo ||
      loja?.configuracoes_extras?.permitir_venda_estoque_negativo
    );
    const estoqueDisponivel = variacao
      ? Number(variacao.quantidade_estoque ?? 0)
      : Number(produto.quantidade_estoque ?? 0);

    const cartId = variacao ? `${produto.id}-${variacao.id}` : `${produto.id}`;
    const itemExistente = itens.find(i => i.id === cartId);
    const qtdTotalDesejada = (itemExistente ? itemExistente.quantidade : 0) + quantidade;

    if (controlaEstoque && !permiteNegativo && qtdTotalDesejada > estoqueDisponivel) {
      alert(`⚠️ Estoque insuficiente para "${produto.nome}${variacao ? ` - ${variacao.valor_variacao_1}` : ''}".\nEstoque disponível: ${estoqueDisponivel} un.`);
      return;
    }

    audioService.playBeep();

    setItens(prev => {
      const index = prev.findIndex(i => i.id === cartId);
      if (index >= 0) {
        const novaQtd = prev[index].quantidade + quantidade;
        const preco = calcularPrecoItemContext(produto, variacao, tabelaPrecoCalculada);
        const atualizados = [...prev];
        atualizados[index] = {
          ...atualizados[index],
          quantidade: novaQtd,
          precoUnitario: preco,
          tabelaPrecoUtilizada: tabelaPrecoCalculada,
          subtotal: preco * novaQtd,
          observacoes: observacoes !== undefined ? observacoes : atualizados[index].observacoes
        };
        return atualizados;
      } else {
        const preco = calcularPrecoItemContext(produto, variacao, tabelaPrecoCalculada);
        return [
          ...prev,
          {
            id: cartId,
            produto,
            variacao,
            quantidade,
            precoUnitario: preco,
            tabelaPrecoUtilizada: tabelaPrecoCalculada,
            subtotal: preco * quantidade,
            observacoes
          }
        ];
      }
    });
  };

  const removerItem = (cartId: string) => {
    if (pedidoEmEdicao && !podeEditarItensPedido(pedidoEmEdicao.status)) {
      alert(`⚠️ Pedidos com status "${pedidoEmEdicao.status}" não permitem remover itens. Apenas pedidos em aberto (pendente) permitem alteração de itens.`);
      return;
    }
    setItens(prev => prev.filter(i => i.id !== cartId));
  };

  const atualizarQuantidade = (cartId: string, quantidade: number) => {
    if (pedidoEmEdicao && !podeEditarItensPedido(pedidoEmEdicao.status)) {
      alert(`⚠️ Pedidos com status "${pedidoEmEdicao.status}" não permitem alterar quantidades de itens.`);
      return;
    }

    if (quantidade <= 0) {
      removerItem(cartId);
      return;
    }

    const itemAlvo = itens.find(i => i.id === cartId);
    const isServico = itemAlvo?.produto?.tipo_item === 'servico';
    const controlaEstoque = !isServico && loja?.configuracoes_extras?.controlar_estoque !== false && loja?.configuracoes_extras?.geral?.controlar_estoque !== false;
    if (itemAlvo && controlaEstoque) {
      const permiteNegativo = Boolean(
        (itemAlvo.variacao as any)?.permite_estoque_negativo ||
        itemAlvo.produto.permite_estoque_negativo ||
        loja?.configuracoes_extras?.geral?.permitir_venda_estoque_negativo ||
        loja?.configuracoes_extras?.permitir_venda_estoque_negativo
      );
      const estoqueDisponivel = itemAlvo.variacao
        ? Number(itemAlvo.variacao.quantidade_estoque ?? 0)
        : Number(itemAlvo.produto.quantidade_estoque ?? 0);
      if (!permiteNegativo && quantidade > estoqueDisponivel) {
        alert(`⚠️ Quantidade solicitada (${quantidade} un) excede o estoque disponível (${estoqueDisponivel} un) de "${itemAlvo.produto.nome}".`);
        return;
      }
    }

    setItens(prev =>
      prev.map(item => {
        if (item.id === cartId) {
          const preco = calcularPrecoItemContext(item.produto, item.variacao, tabelaPrecoCalculada);
          return {
            ...item,
            quantidade,
            precoUnitario: preco,
            tabelaPrecoUtilizada: tabelaPrecoCalculada,
            subtotal: preco * quantidade
          };
        }
        return item;
      })
    );
  };

  // Recalcula subtotais de acordo com a tabela calculada em tempo real
  const itensComPrecoDinamico = useMemo(() => {
    return itens.map(item => {
      const preco = calcularPrecoItemContext(item.produto, item.variacao, tabelaPrecoCalculada);
      return {
        ...item,
        precoUnitario: preco,
        tabelaPrecoUtilizada: tabelaPrecoCalculada,
        subtotal: preco * item.quantidade
      };
    });
  }, [itens, tabelaPrecoCalculada, regrasAtivas]);

  const subtotal = useMemo(() => {
    return itensComPrecoDinamico.reduce((acc, item) => acc + item.subtotal, 0);
  }, [itensComPrecoDinamico]);

  const setDescontoValor = (valor: number) => {
    if (pedidoEmEdicao && !podeEditarDescontoPedido(pedidoEmEdicao.status)) {
      alert(`⚠️ Pedidos com status "${pedidoEmEdicao.status}" não permitem alteração de desconto.`);
      return;
    }
    const val = Math.max(0, valor);
    setDescontoState(val);
    if (subtotal > 0) {
      setDescontoPercentualState(Number(((val / subtotal) * 100).toFixed(2)));
    } else {
      setDescontoPercentualState(0);
    }
  };

  const setDescontoPercentual = (percentual: number) => {
    if (pedidoEmEdicao && !podeEditarDescontoPedido(pedidoEmEdicao.status)) {
      alert(`⚠️ Pedidos com status "${pedidoEmEdicao.status}" não permitem alteração de desconto.`);
      return;
    }
    const perc = Math.max(0, Math.min(100, percentual));
    setDescontoPercentualState(perc);
    if (subtotal > 0) {
      setDescontoState(Number(((perc / 100) * subtotal).toFixed(2)));
    } else {
      setDescontoState(0);
    }
  };

  const setDesconto = (valor: number) => {
    setDescontoValor(valor);
  };

  const [snapshotPedidoOriginal, setSnapshotPedidoOriginal] = useState<string | null>(null);

  const gerarSnapshotPedido = (
    itensAtuais: CartItem[],
    cli: Cliente | null,
    desc: number,
    tipoDesc: 'valor' | 'percentual',
    taxa: number,
    status?: string,
    entrega?: PedidoEntrega | null
  ) => {
    return JSON.stringify({
      itens: itensAtuais
        .map(i => ({
          id: i.id,
          produto_id: i.produto.id,
          variacao_id: i.variacao?.id || null,
          quantidade: i.quantidade,
          precoUnitario: Number(i.precoUnitario.toFixed(2)),
          observacoes: i.observacoes || ''
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      clienteId: cli?.id || null,
      desconto: Number(desc.toFixed(2)),
      tipoDesconto: tipoDesc,
      taxaEntrega: Number(taxa.toFixed(2)),
      status: status || 'pendente',
      entregaTransp: entrega?.transportadora_nome || null,
      entregaTipo: entrega?.tipo_atendimento || null,
      entregaServico: entrega?.servico_codigo || null,
      entregaValor: Number(entrega?.valor_frete || 0)
    });
  };

  const temAlteracoesPedido = useMemo(() => {
    if (!pedidoEmEdicao) return false;
    if (!snapshotPedidoOriginal) return false;
    const snapshotAtual = gerarSnapshotPedido(
      itens,
      clienteSelecionado,
      desconto,
      tipoDesconto,
      taxaEntrega,
      pedidoEmEdicao.status,
      pedidoEntrega
    );
    return snapshotAtual !== snapshotPedidoOriginal;
  }, [pedidoEmEdicao, snapshotPedidoOriginal, itens, clienteSelecionado, desconto, tipoDesconto, taxaEntrega, pedidoEntrega]);

  const resetarSnapshotPedido = () => {
    setSnapshotPedidoOriginal(null);
  };

  const limparCarrinho = () => {
    setItens([]);
    setClienteSelecionadoState(null);
    setEnderecoEntrega(null);
    setDadosEndereco(null);
    setDescontoState(0);
    setDescontoPercentualState(0);
    setTipoDesconto('valor');
    setTaxaEntrega(0);
    setPedidoEntrega(null);
    setPedidoEmEdicao(null);
    setSnapshotPedidoOriginal(null);
  };

  const carregarPedidoParaEdicao = async (pedido: any) => {
    if (!pedido) return;
    setPedidoEmEdicao(pedido);
    setClienteSelecionadoState(pedido.cliente || null);
    if (pedido.cliente) {
      const cli = pedido.cliente;
      const endObj: DadosEnderecoCliente = {
        cep: cli.endereco_cep || cli.cep || '',
        rua: cli.endereco_logradouro || cli.rua || cli.endereco || '',
        numero: cli.endereco_numero || cli.numero || '',
        complemento: cli.endereco_complemento || cli.complemento || '',
        bairro: cli.endereco_bairro || cli.bairro || '',
        cidade: cli.endereco_cidade || cli.cidade || '',
        estado: cli.endereco_estado || cli.estado || ''
      };
      setDadosEndereco(endObj);
    }
    if (pedido.endereco_entrega) {
      setEnderecoEntrega(pedido.endereco_entrega);
    }
    setTabelaPrecoGlobalState(pedido.tabela_preco_aplicada || 'varejo');
    
    const descVal = Number(pedido.valor_desconto) || 0;
    const descPercCalculado = Number(pedido.subtotal) > 0 ? (descVal / Number(pedido.subtotal)) * 100 : 0;
    
    // Suporte prioritário à coluna nativa desconto_percentual com fallback para metadados ou tag em observações
    const percNativo = (pedido.desconto_percentual !== undefined && pedido.desconto_percentual !== null && Number(pedido.desconto_percentual) > 0)
      ? Number(pedido.desconto_percentual)
      : null;
    const percMeta = (pedido.metadados && typeof pedido.metadados === 'object' && pedido.metadados.desconto_percentual)
      ? Number(pedido.metadados.desconto_percentual)
      : null;
    const matchPerc = typeof pedido.observacoes === 'string' ? pedido.observacoes.match(/\[DESCONTO_PERC:([0-9.]+)\]/) : null;
    const ehPercentual = pedido.tipo_desconto === 'percentual' ||
      percNativo !== null ||
      percMeta !== null ||
      Boolean(matchPerc);

    let tipoDescFinal: 'valor' | 'percentual' = 'valor';
    if (ehPercentual) {
      tipoDescFinal = 'percentual';
      const percFinal = percNativo !== null ? percNativo : (percMeta !== null ? percMeta : (matchPerc ? parseFloat(matchPerc[1]) : descPercCalculado));
      setTipoDesconto('percentual');
      setDescontoPercentualState(Number(percFinal.toFixed(2)));
      setDescontoState(descVal);
    } else {
      tipoDescFinal = 'valor';
      setTipoDesconto('valor');
      setDescontoState(descVal);
      setDescontoPercentualState(Number(descPercCalculado.toFixed(2)));
    }

    let taxaFinal = Number(pedido.valor_frete) || 0;
    const rawPe = (pedido as any).pedido_entrega;
    const peFromPedido = Array.isArray(rawPe) ? rawPe[0] : rawPe;
    let entregaFinal: PedidoEntrega | null = null;

    try {
      const entregaDb = await ShippingOrchestrator.buscarPedidoEntrega(pedido.id);
      entregaFinal = entregaDb || peFromPedido || null;
    } catch {
      entregaFinal = peFromPedido || null;
    }

    if (entregaFinal) {
      setPedidoEntrega(entregaFinal);
      taxaFinal = Number(entregaFinal.valor_frete) || taxaFinal;
    } else if (taxaFinal > 0 || pedido.endereco_entrega || (pedido.metadados && pedido.metadados.transportadora_nome)) {
      // Fallback retrocompatível caso a tabela relacional não possua o registro ainda
      const fallbackEntrega: PedidoEntrega = {
        pedido_id: pedido.id,
        tipo_atendimento: (pedido.metadados?.tipo_atendimento || (taxaFinal > 0 ? 'entrega' : 'retirada')) as any,
        transportadora_nome: pedido.metadados?.transportadora_nome || (taxaFinal > 0 ? 'Entrega Padrão' : 'Retirada na Loja'),
        provedor: pedido.metadados?.provedor_frete || (taxaFinal > 0 ? 'melhor_envio' : 'retirada_loja') as any,
        servico_codigo: pedido.metadados?.servico_frete_codigo || null,
        valor_frete: taxaFinal,
        status_envio: 'pendente'
      };
      setPedidoEntrega(fallbackEntrega);
      entregaFinal = fallbackEntrega;
    } else {
      setPedidoEntrega(null);
    }
    setTaxaEntrega(taxaFinal);

    // Buscar estoque real dos produtos e variações no Supabase
    const produtoIds = Array.from(new Set((pedido.itens || []).map((it: any) => it.produto_id).filter(Boolean)));
    const produtosDbMap: Record<string, any> = {};

    if (produtoIds.length > 0) {
      try {
        const { data: prodsDb, error: erroProds } = await supabase
          .from('produtos')
          .select('*, variacoes:variacoes_produto(*)')
          .in('id', produtoIds);

        if (!erroProds && prodsDb) {
          prodsDb.forEach((p: any) => {
            produtosDbMap[p.id] = p;
          });
        }
      } catch (err) {
        console.warn('Erro ao carregar dados de estoque para edição do pedido:', err);
      }
    }

    const cartItens: CartItem[] = (pedido.itens || []).map((item: any) => {
      const prodDb = produtosDbMap[item.produto_id];
      const varDb = item.variacao_id && prodDb?.variacoes
        ? prodDb.variacoes.find((v: any) => v.id === item.variacao_id)
        : null;

      const prodCompleto = prodDb ? {
        ...prodDb,
        nome: item.nome_produto || prodDb.nome,
        preco_venda_varejo: Number(item.preco_venda_unitario) || prodDb.preco_venda_varejo,
        preco_custo: Number(item.preco_custo_unitario) || prodDb.preco_custo,
        quantidade_estoque: Number(prodDb.quantidade_estoque ?? 0)
      } : ({
        id: item.produto_id,
        nome: item.nome_produto,
        preco_venda_varejo: item.preco_venda_unitario,
        preco_custo: item.preco_custo_unitario,
        quantidade_estoque: 9999
      } as any);

      const varCompleta = item.variacao_id ? (varDb ? {
        ...varDb,
        valor_variacao_1: item.rotulo_variacao || varDb.valor_variacao_1,
        preco_venda_varejo: Number(item.preco_venda_unitario) || varDb.preco_venda_varejo,
        preco_custo: Number(item.preco_custo_unitario) || varDb.preco_custo,
        quantidade_estoque: Number(varDb.quantidade_estoque ?? 0)
      } : ({
        id: item.variacao_id,
        produto_id: item.produto_id,
        valor_variacao_1: item.rotulo_variacao || '',
        preco_venda_varejo: item.preco_venda_unitario,
        preco_custo: item.preco_custo_unitario,
        quantidade_estoque: 9999
      } as any)) : null;

      return {
        id: item.variacao_id ? `${item.produto_id}-${item.variacao_id}` : `${item.produto_id}`,
        produto: prodCompleto,
        variacao: varCompleta,
        quantidade: Number(item.quantidade) || 1,
        tabelaPrecoUtilizada: item.tabela_preco_utilizada || pedido.tabela_preco_aplicada || 'varejo',
        precoUnitario: Number(item.preco_venda_unitario) || 0,
        subtotal: Number(item.subtotal) || (Number(item.preco_venda_unitario) * Number(item.quantidade)),
        observacoes: item.observacoes || undefined
      };
    });

    setItens(cartItens);

    // Registra o snapshot do pedido carregado
    const snapshot = gerarSnapshotPedido(
      cartItens,
      pedido.cliente || null,
      descVal,
      tipoDescFinal,
      taxaFinal,
      pedido.status || 'pendente',
      entregaFinal
    );
    setSnapshotPedidoOriginal(snapshot);
  };

  const cancelarEdicaoPedido = () => {
    limparCarrinho();
  };

  const atualizarStatusPedidoEmEdicao = (novoStatus: string) => {
    setPedidoEmEdicao((prev: any) => (prev ? { ...prev, status: novoStatus } : null));
  };

  const total = useMemo(() => {
    return Math.max(0, subtotal - desconto + taxaEntrega);
  }, [subtotal, desconto, taxaEntrega]);

  const totalItens = useMemo(() => {
    return itensComPrecoDinamico.reduce((acc, item) => acc + item.quantidade, 0);
  }, [itensComPrecoDinamico]);

  return (
    <CartContext.Provider
      value={{
        itens: itensComPrecoDinamico,
        clienteSelecionado,
        tabelaPrecoGlobal,
        tabelaPrecoCalculada,
        avaliacaoCarrinho,
        desconto,
        descontoPercentual,
        tipoDesconto,
        taxaEntrega,
        pedidoEntrega,
        enderecoEntrega,
        dadosEndereco,
        subtotal,
        total,
        totalItens,
        pedidoEmEdicao,
        temAlteracoesPedido,
        resetarSnapshotPedido,
        adicionarItem,
        removerItem,
        atualizarQuantidade,
        setClienteSelecionado,
        setTabelaPrecoGlobal,
        setDescontoValor,
        setDescontoPercentual,
        setTipoDesconto,
        setDesconto,
        setTaxaEntrega,
        setPedidoEntrega,
        setEnderecoEntrega,
        setDadosEndereco,
        limparCarrinho,
        freteGratisAtivo: configFreteState.frete_gratis_ativo,
        freteGratisValorMinimo: configFreteState.frete_gratis_valor_minimo,
        retiradaLojaAtiva: configFreteState.retirada_loja_ativa,
        setConfigFrete,
        carregarPedidoParaEdicao,
        cancelarEdicaoPedido,
        atualizarStatusPedidoEmEdicao
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);

