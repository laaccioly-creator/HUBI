import React, { createContext, useContext, useState, useMemo } from 'react';
import { Produto, VariacaoProduto, Cliente, TabelaPreco } from '../types';
import { audioService } from '../services/audioService';

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
  const [itens, setItens] = useState<CartItem[]>([]);
  const [clienteSelecionado, setClienteSelecionadoState] = useState<Cliente | null>(null);
  const [tabelaPrecoGlobal, setTabelaPrecoGlobalState] = useState<TabelaPreco>('varejo');
  const [desconto, setDesconto] = useState<number>(0);
  const [taxaEntrega, setTaxaEntrega] = useState<number>(0);

  const calcularPrecoUnitario = (
    produto: Produto,
    variacao: VariacaoProduto | null | undefined,
    qtd: number,
    tabelaForcada?: TabelaPreco
  ): { preco: number; tabela: TabelaPreco } => {
    const tabelaAtiva = tabelaForcada || tabelaPrecoGlobal;

    if (tabelaAtiva === 'autoatacado') {
      const precoAuto = (variacao ? variacao.preco_venda_autoatacado : produto.preco_venda_autoatacado) || 
                        (variacao ? variacao.preco_venda_atacado : produto.preco_venda_atacado) || 
                        (variacao ? variacao.preco_venda_varejo : produto.preco_venda_varejo);
      return { preco: Number(precoAuto), tabela: 'autoatacado' };
    }

    if (tabelaAtiva === 'atacado') {
      const precoAtac = (variacao ? variacao.preco_venda_atacado : produto.preco_venda_atacado) || 
                        (variacao ? variacao.preco_venda_varejo : produto.preco_venda_varejo);
      return { preco: Number(precoAtac), tabela: 'atacado' };
    }

    const precoAuto = variacao ? variacao.preco_venda_autoatacado : produto.preco_venda_autoatacado;
    const qtdMinAuto = Number(produto.qtd_minima_autoatacado) || 24;
    if (precoAuto && qtd >= qtdMinAuto) {
      return { preco: Number(precoAuto), tabela: 'autoatacado' };
    }

    const precoAtac = variacao ? variacao.preco_venda_atacado : produto.preco_venda_atacado;
    const qtdMinAtac = Number(produto.qtd_minima_atacado) || 6;
    if (precoAtac && qtd >= qtdMinAtac) {
      return { preco: Number(precoAtac), tabela: 'atacado' };
    }

    const promoAtiva = produto.promocao_ativa;
    const precoPromo = variacao ? variacao.preco_promocional : produto.preco_promocional;
    if (promoAtiva && precoPromo && Number(precoPromo) > 0) {
      return { preco: Number(precoPromo), tabela: 'promocional' };
    }

    const precoVarejo = variacao ? variacao.preco_venda_varejo : produto.preco_venda_varejo;
    return { preco: Number(precoVarejo), tabela: 'varejo' };
  };

  const setClienteSelecionado = (cliente: Cliente | null) => {
    setClienteSelecionadoState(cliente);
    if (cliente?.tabela_preco_padrao) {
      setTabelaPrecoGlobal(cliente.tabela_preco_padrao);
    }
  };

  const setTabelaPrecoGlobal = (tabela: TabelaPreco) => {
    setTabelaPrecoGlobalState(tabela);
    setItens(prev =>
      prev.map(item => {
        const { preco, tabela: tabUtilizada } = calcularPrecoUnitario(item.produto, item.variacao, item.quantidade, tabela);
        return {
          ...item,
          tabelaPrecoUtilizada: tabUtilizada,
          precoUnitario: preco,
          subtotal: preco * item.quantidade
        };
      })
    );
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
        const { preco, tabela } = calcularPrecoUnitario(produto, variacao, novaQtd);
        const atualizados = [...prev];
        atualizados[index] = {
          ...atualizados[index],
          quantidade: novaQtd,
          precoUnitario: preco,
          tabelaPrecoUtilizada: tabela,
          subtotal: preco * novaQtd,
          observacoes: observacoes !== undefined ? observacoes : atualizados[index].observacoes
        };
        return atualizados;
      } else {
        const { preco, tabela } = calcularPrecoUnitario(produto, variacao, quantidade);
        return [
          ...prev,
          {
            id: cartId,
            produto,
            variacao,
            quantidade,
            precoUnitario: preco,
            tabelaPrecoUtilizada: tabela,
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
          const { preco, tabela } = calcularPrecoUnitario(item.produto, item.variacao, quantidade);
          return {
            ...item,
            quantidade,
            precoUnitario: preco,
            tabelaPrecoUtilizada: tabela,
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

  const subtotal = useMemo(() => {
    return itens.reduce((acc, item) => acc + item.subtotal, 0);
  }, [itens]);

  const total = useMemo(() => {
    return Math.max(0, subtotal - desconto + taxaEntrega);
  }, [subtotal, desconto, taxaEntrega]);

  const totalItens = useMemo(() => {
    return itens.reduce((acc, item) => acc + item.quantidade, 0);
  }, [itens]);

  return (
    <CartContext.Provider
      value={{
        itens,
        clienteSelecionado,
        tabelaPrecoGlobal,
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
