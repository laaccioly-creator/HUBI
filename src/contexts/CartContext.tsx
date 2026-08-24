import React, { createContext, useContext, useState, useMemo } from 'react';
import { Produto, VariacaoProduto, Cliente, TabelaPreco } from '../types';
import { audioService } from '../services/audioService';
import { useAuth } from './AuthContext';
import {
  obterRegrasPrecificacao,
  avaliarNivelCarrinho,
  calcularPrecoUnitarioPorTabela,
  ResultadoAvaliacaoCarrinho
} from '../services/pricingEngine';

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
  subtotal: number;
  total: number;
  totalItens: number;
  pedidoEmEdicao: any | null;
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
  limparCarrinho: () => void;
  carregarPedidoParaEdicao: (pedido: any) => void;
  cancelarEdicaoPedido: () => void;
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
  const [pedidoEmEdicao, setPedidoEmEdicao] = useState<any | null>(null);

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
    const controlaEstoque = loja?.configuracoes_extras?.controlar_estoque !== false && loja?.configuracoes_extras?.geral?.controlar_estoque !== false;
    const estoqueDisponivel = variacao
      ? Number(variacao.quantidade_estoque ?? 0)
      : Number(produto.quantidade_estoque ?? 0);

    const cartId = variacao ? `${produto.id}-${variacao.id}` : `${produto.id}`;
    const itemExistente = itens.find(i => i.id === cartId);
    const qtdTotalDesejada = (itemExistente ? itemExistente.quantidade : 0) + quantidade;

    if (controlaEstoque && qtdTotalDesejada > estoqueDisponivel) {
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
    setItens(prev => prev.filter(i => i.id !== cartId));
  };

  const atualizarQuantidade = (cartId: string, quantidade: number) => {
    if (quantidade <= 0) {
      removerItem(cartId);
      return;
    }

    const controlaEstoque = loja?.configuracoes_extras?.controlar_estoque !== false && loja?.configuracoes_extras?.geral?.controlar_estoque !== false;
    const itemAlvo = itens.find(i => i.id === cartId);
    if (itemAlvo && controlaEstoque) {
      const estoqueDisponivel = itemAlvo.variacao
        ? Number(itemAlvo.variacao.quantidade_estoque ?? 0)
        : Number(itemAlvo.produto.quantidade_estoque ?? 0);
      if (quantidade > estoqueDisponivel) {
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
    const val = Math.max(0, valor);
    setDescontoState(val);
    if (subtotal > 0) {
      setDescontoPercentualState(Number(((val / subtotal) * 100).toFixed(2)));
    } else {
      setDescontoPercentualState(0);
    }
  };

  const setDescontoPercentual = (percentual: number) => {
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

  const limparCarrinho = () => {
    setItens([]);
    setClienteSelecionadoState(null);
    setDescontoState(0);
    setDescontoPercentualState(0);
    setTipoDesconto('valor');
    setTaxaEntrega(0);
    setPedidoEmEdicao(null);
  };

  const carregarPedidoParaEdicao = (pedido: any) => {
    if (!pedido) return;
    setPedidoEmEdicao(pedido);
    setClienteSelecionadoState(pedido.cliente || null);
    setTabelaPrecoGlobalState(pedido.tabela_preco_aplicada || 'varejo');
    
    const descVal = Number(pedido.valor_desconto) || 0;
    const descPerc = Number(pedido.desconto_percentual) || (Number(pedido.subtotal) > 0 ? (descVal / Number(pedido.subtotal)) * 100 : 0);
    
    setDescontoState(descVal);
    setDescontoPercentualState(Number(descPerc.toFixed(2)));
    setTaxaEntrega(Number(pedido.valor_frete) || 0);

    const cartItens: CartItem[] = (pedido.itens || []).map((item: any) => ({
      id: item.variacao_id ? `${item.produto_id}-${item.variacao_id}` : `${item.produto_id}`,
      produto: {
        id: item.produto_id,
        nome: item.nome_produto,
        preco_venda_varejo: item.preco_venda_unitario,
        preco_custo: item.preco_custo_unitario
      } as any,
      variacao: item.variacao_id ? ({
        id: item.variacao_id,
        produto_id: item.produto_id,
        valor_variacao_1: item.rotulo_variacao || '',
        preco_venda_varejo: item.preco_venda_unitario,
        preco_custo: item.preco_custo_unitario
      } as any) : null,
      quantidade: Number(item.quantidade) || 1,
      tabelaPrecoUtilizada: item.tabela_preco_utilizada || pedido.tabela_preco_aplicada || 'varejo',
      precoUnitario: Number(item.preco_venda_unitario) || 0,
      subtotal: Number(item.subtotal) || (Number(item.preco_venda_unitario) * Number(item.quantidade)),
      observacoes: item.observacoes || undefined
    }));

    setItens(cartItens);
  };

  const cancelarEdicaoPedido = () => {
    limparCarrinho();
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
        subtotal,
        total,
        totalItens,
        pedidoEmEdicao,
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
        limparCarrinho,
        carregarPedidoParaEdicao,
        cancelarEdicaoPedido
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);

