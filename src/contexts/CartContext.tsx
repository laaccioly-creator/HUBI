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
  taxaEntrega: number;
  subtotal: number;
  total: number;
  totalItens: number;
  adicionarItem: (produto: Produto, variacao?: VariacaoProduto | null, quantidade?: number, observacoes?: string) => void;
  removerItem: (cartId: string) => void;
  atualizarQuantidade: (cartId: string, quantidade: number) => void;
  setClienteSelecionado: (cliente: Cliente | null) => void;
  setTabelaPrecoGlobal: (tabela: TabelaPreco) => void;
  setDesconto: (valor: number) => void;
  setTaxaEntrega: (valor: number) => void;
  limparCarrinho: () => void;
}

const CartContext = createContext<CartContextType>({} as CartContextType);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loja } = useAuth();
  const [itens, setItens] = useState<CartItem[]>([]);
  const [clienteSelecionado, setClienteSelecionadoState] = useState<Cliente | null>(null);
  const [tabelaPrecoGlobal, setTabelaPrecoGlobalState] = useState<TabelaPreco>('varejo');
  const [desconto, setDesconto] = useState<number>(0);
  const [taxaEntrega, setTaxaEntrega] = useState<number>(0);

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
    audioService.playBeep();
    const cartId = variacao ? `${produto.id}-${variacao.id}` : `${produto.id}`;

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

  const limparCarrinho = () => {
    setItens([]);
    setClienteSelecionadoState(null);
    setDesconto(0);
    setTaxaEntrega(0);
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
        taxaEntrega,
        subtotal,
        total,
        totalItens,
        adicionarItem,
        removerItem,
        atualizarQuantidade,
        setClienteSelecionado,
        setTabelaPrecoGlobal,
        setDesconto,
        setTaxaEntrega,
        limparCarrinho
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);

