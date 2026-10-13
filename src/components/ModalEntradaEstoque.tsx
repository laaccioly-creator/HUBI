import React, { useState, useEffect } from 'react';
import {
  X,
  PackagePlus,
  ArrowDownLeft,
  ArrowUpRight,
  Sliders,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Layers,
  Search,
  ChevronRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Produto } from '../types';

interface ModalEntradaEstoqueProps {
  isOpen: boolean;
  onClose: () => void;
  produto: Produto | null;
  produtos?: Produto[];
  onEstoqueAtualizado: () => void | Promise<void>;
}

type TipoMovimento = 'entrada_compra' | 'ajuste_inventario' | 'baixa_perda';

interface LinhaVariacaoEstoque {
  id: string;
  nome: string;
  sku?: string | null;
  estoqueAtual: number;
  quantidade: string;
  precoCusto: string;
}

export const ModalEntradaEstoque: React.FC<ModalEntradaEstoqueProps> = ({
  isOpen,
  onClose,
  produto,
  produtos = [],
  onEstoqueAtualizado
}) => {
  const { loja } = useAuth();
  const [produtoAtual, setProdutoAtual] = useState<Produto | null>(produto);
  const [buscaProduto, setBuscaProduto] = useState<string>('');
  const [tipoMovimento, setTipoMovimento] = useState<TipoMovimento>('entrada_compra');
  
  // Para produto com variações
  const [linhasVariacoes, setLinhasVariacoes] = useState<LinhaVariacaoEstoque[]>([]);

  // Para produto simples sem variação
  const [quantidadeSimples, setQuantidadeSimples] = useState<string>('10');
  const [custoSimples, setCustoSimples] = useState<string>('0.00');

  const [lancarDespesaFinanceira, setLancarDespesaFinanceira] = useState<boolean>(true);
  const [observacao, setObservacao] = useState<string>('');
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  useEffect(() => {
    setProdutoAtual(produto);
    setBuscaProduto('');
  }, [produto, isOpen]);

  const temVariacoes = Boolean(produtoAtual?.tem_variacoes && Array.isArray(produtoAtual?.variacoes) && produtoAtual.variacoes.length > 0);

  useEffect(() => {
    if (produtoAtual && isOpen) {
      if (temVariacoes && produtoAtual.variacoes && produtoAtual.variacoes.length > 0) {
        const linhasIniciais: LinhaVariacaoEstoque[] = produtoAtual.variacoes.map(v => ({
          id: v.id,
          nome: [v.valor_variacao_1, v.valor_variacao_2].filter(Boolean).join(' - ') || 'Variação',
          sku: v.sku,
          estoqueAtual: Number(v.quantidade_estoque || 0),
          quantidade: '',
          precoCusto: v.preco_custo ? Number(v.preco_custo).toFixed(2) : (produtoAtual.preco_custo ? Number(produtoAtual.preco_custo).toFixed(2) : '0.00')
        }));
        setLinhasVariacoes(linhasIniciais);
      } else {
        setQuantidadeSimples('10');
        setCustoSimples(produtoAtual.preco_custo ? Number(produtoAtual.preco_custo).toFixed(2) : '0.00');
      }
      setObservacao('');
      setErroMsg(null);
    }
  }, [produtoAtual, isOpen, temVariacoes]);

  if (!isOpen) return null;

  const produtosFiltrados = produtos.filter(p => {
    if (!buscaProduto.trim()) return true;
    const termo = buscaProduto.toLowerCase();
    return (
      p.nome.toLowerCase().includes(termo) ||
      (p.codigo_interno && p.codigo_interno.toLowerCase().includes(termo)) ||
      (p.codigo_barras && p.codigo_barras.includes(termo))
    );
  });

  const handleAtualizarQtdVariacao = (id: string, valor: string) => {
    setLinhasVariacoes(prev =>
      prev.map(l => (l.id === id ? { ...l, quantidade: valor } : l))
    );
  };

  const handleAtualizarCustoVariacao = (id: string, valor: string) => {
    setLinhasVariacoes(prev =>
      prev.map(l => (l.id === id ? { ...l, precoCusto: valor } : l))
    );
  };

  const calcularNovoEstoqueLinha = (estoqueAtual: number, qtdStr: string): number => {
    const qtdNum = Number(qtdStr) || 0;
    if (tipoMovimento === 'entrada_compra') {
      return estoqueAtual + qtdNum;
    }
    if (tipoMovimento === 'baixa_perda') {
      return Math.max(0, estoqueAtual - qtdNum);
    }
    if (tipoMovimento === 'ajuste_inventario') {
      return qtdStr === '' ? estoqueAtual : Math.max(0, qtdNum);
    }
    return estoqueAtual;
  };

  // Cálculos consolidados para produtos com variações
  const totalQtdMovimentada = temVariacoes
    ? linhasVariacoes.reduce((acc, l) => acc + (Number(l.quantidade) || 0), 0)
    : Number(quantidadeSimples) || 0;

  const totalEstoqueAtual = produtoAtual
    ? (temVariacoes
      ? linhasVariacoes.reduce((acc, l) => acc + l.estoqueAtual, 0)
      : Number(produtoAtual.quantidade_estoque || 0))
    : 0;

  const totalNovoEstoque = produtoAtual
    ? (temVariacoes
      ? linhasVariacoes.reduce((acc, l) => acc + calcularNovoEstoqueLinha(l.estoqueAtual, l.quantidade), 0)
      : calcularNovoEstoqueLinha(totalEstoqueAtual, quantidadeSimples))
    : 0;

  const valorTotalCompra = temVariacoes
    ? linhasVariacoes.reduce((acc, l) => {
        const qtd = Number(l.quantidade) || 0;
        const custo = Number(l.precoCusto) || 0;
        return acc + (qtd * custo);
      }, 0)
    : (Number(quantidadeSimples) || 0) * (Number(custoSimples) || 0);

  const handleConfirmarMovimentacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || !produtoAtual?.id) return;

    if (totalQtdMovimentada <= 0 && tipoMovimento !== 'ajuste_inventario') {
      setErroMsg('Por favor, informe ao menos uma quantidade a movimentar maior que zero.');
      return;
    }

    try {
      setSalvando(true);
      setErroMsg(null);

      if (temVariacoes && produtoAtual.variacoes && produtoAtual.variacoes.length > 0) {
        // 1. Atualizar cada variação que teve alteração
        const promises = linhasVariacoes.map(async (linha) => {
          const qtdNum = Number(linha.quantidade) || 0;
          if (qtdNum === 0 && tipoMovimento !== 'ajuste_inventario') return;
          if (linha.quantidade === '' && tipoMovimento === 'ajuste_inventario') return;

          const novoEst = calcularNovoEstoqueLinha(linha.estoqueAtual, linha.quantidade);
          const payloadVar: any = {
            quantidade_estoque: novoEst
          };

          const custoNum = Number(linha.precoCusto) || 0;
          if (tipoMovimento === 'entrada_compra' && custoNum > 0) {
            payloadVar.preco_custo = custoNum;
          }

          const { error: errV } = await supabase
            .from('variacoes_produto')
            .update(payloadVar)
            .eq('id', linha.id);

          if (errV) throw errV;
        });

        await Promise.all(promises);

        // 2. Atualizar soma de estoque consolidada no produto pai
        const { error: errPai } = await supabase
          .from('produtos')
          .update({
            quantidade_estoque: totalNovoEstoque,
            atualizado_em: new Date().toISOString()
          })
          .eq('id', produtoAtual.id);

        if (errPai) throw errPai;

      } else {
        // Produto simples sem variações
        const novoEstoqueSimples = calcularNovoEstoqueLinha(
          Number(produtoAtual.quantidade_estoque || 0),
          quantidadeSimples
        );

        const payloadUpdate: Partial<Produto> = {
          quantidade_estoque: novoEstoqueSimples,
          atualizado_em: new Date().toISOString()
        };

        const custoNum = Number(custoSimples) || 0;
        if (tipoMovimento === 'entrada_compra' && custoNum > 0) {
          payloadUpdate.preco_custo = custoNum;
        }

        const { error: erroProd } = await supabase
          .from('produtos')
          .update(payloadUpdate)
          .eq('id', produtoAtual.id);

        if (erroProd) throw erroProd;
      }

      // 3. Registrar saída no financeiro se for compra e checkbox estiver ativo
      if (tipoMovimento === 'entrada_compra' && lancarDespesaFinanceira && valorTotalCompra > 0) {
        try {
          const descricaoMov = `Compra de Estoque: ${totalQtdMovimentada}x ${produtoAtual.nome}`;
          await supabase.from('transacoes_financeiras').insert([
            {
              loja_id: loja.id,
              tipo: 'SAIDA',
              categoria: 'Compra de Mercadorias (Estoque)',
              descricao: `${descricaoMov} - ${observacao || 'Entrada manual'}`,
              valor: valorTotalCompra,
              data_vencimento: new Date().toISOString().split('T')[0],
              data_pagamento: new Date().toISOString(),
              status: 'pago'
            }
          ]);
        } catch (finErr) {
          console.warn('Aviso ao registrar despesa no financeiro:', finErr);
        }
      }

      await onEstoqueAtualizado();
      onClose();
    } catch (err: any) {
      console.error('Erro ao atualizar estoque:', err);
      setErroMsg(err.message || 'Erro ao registrar movimentação de estoque.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
      <div className={`bg-slate-100 dark:bg-[#08131A] border-2 border-slate-300 dark:border-slate-400 rounded-2xl w-full ${temVariacoes ? 'max-w-2xl' : 'max-w-lg'} p-6 space-y-5 shadow-2xl my-8 animate-in zoom-in-95 duration-150 text-black dark:text-white`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-300 dark:border-slate-700 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center shadow-xs">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-black dark:text-white">Entrada / Ajuste de Estoque</h3>
              <p className="text-xs text-black dark:text-slate-300 font-medium truncate max-w-md">
                {produtoAtual ? produtoAtual.nome : 'Selecione o produto para movimentar'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {erroMsg && (
          <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border-2 border-rose-300 dark:border-rose-500/30 rounded-xl flex items-center gap-2 text-xs font-semibold text-rose-800 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
            <span>{erroMsg}</span>
          </div>
        )}

        {/* Caso nenhum produto esteja selecionado: SELETOR DE PRODUTO */}
        {!produtoAtual ? (
          <div className="space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={buscaProduto}
                onChange={(e) => setBuscaProduto(e.target.value)}
                placeholder="Pesquisar produto por nome ou código..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-black dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-500"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {produtosFiltrados.length === 0 ? (
                <div className="p-8 text-center text-slate-500 font-medium text-xs">
                  Nenhum produto encontrado com esse termo.
                </div>
              ) : (
                produtosFiltrados.map((p) => {
                  const estQtd = Number(p.quantidade_estoque || 0);
                  return (
                    <div
                      key={p.id}
                      onClick={() => setProdutoAtual(p)}
                      className="p-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-[#000000] hover:bg-slate-50 dark:hover:bg-slate-900 transition cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-xs text-black dark:text-white block truncate">
                          {p.nome}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                          {p.codigo_interno && <span>Cód: {p.codigo_interno}</span>}
                          {p.categoria?.nome && <span>• {p.categoria.nome}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold px-2 py-1 rounded-xl bg-white dark:bg-[#000000] text-black dark:text-white border-2 border-slate-300 dark:border-slate-700">
                          {estQtd} un
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Barra do Produto Ativo com botão de Trocar se múltiplos produtos estiverem disponíveis */}
            {produtos.length > 0 && !produto && (
              <div className="p-2.5 bg-white dark:bg-[#000000] rounded-xl border-2 border-slate-300 dark:border-slate-700 flex items-center justify-between text-xs">
                <span className="text-black dark:text-slate-300 font-semibold truncate">
                  Produto selecionado: <strong className="text-black dark:text-white">{produtoAtual.nome}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setProdutoAtual(null)}
                  className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Trocar produto
                </button>
              </div>
            )}

            {/* Tipo de Movimento */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTipoMovimento('entrada_compra')}
                className={`p-2.5 rounded-xl border-2 text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
                  tipoMovimento === 'entrada_compra'
                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                    : 'bg-white hover:bg-slate-50 border-slate-300 text-black dark:bg-[#000000] dark:border-slate-700 dark:text-white dark:hover:bg-slate-900'
                }`}
              >
                <ArrowDownLeft className={`w-4 h-4 ${tipoMovimento === 'entrada_compra' ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
                <span>+ Compra</span>
              </button>

              <button
                type="button"
                onClick={() => setTipoMovimento('baixa_perda')}
                className={`p-2.5 rounded-xl border-2 text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
                  tipoMovimento === 'baixa_perda'
                    ? 'bg-rose-600 border-rose-500 text-white shadow-md'
                    : 'bg-white hover:bg-slate-50 border-slate-300 text-black dark:bg-[#000000] dark:border-slate-700 dark:text-white dark:hover:bg-slate-900'
                }`}
              >
                <ArrowUpRight className={`w-4 h-4 ${tipoMovimento === 'baixa_perda' ? 'text-white' : 'text-rose-600 dark:text-rose-400'}`} />
                <span>- Baixa / Avaria</span>
              </button>

              <button
                type="button"
                onClick={() => setTipoMovimento('ajuste_inventario')}
                className={`p-2.5 rounded-xl border-2 text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
                  tipoMovimento === 'ajuste_inventario'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                    : 'bg-white hover:bg-slate-50 border-slate-300 text-black dark:bg-[#000000] dark:border-slate-700 dark:text-white dark:hover:bg-slate-900'
                }`}
              >
                <Sliders className={`w-4 h-4 ${tipoMovimento === 'ajuste_inventario' ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`} />
                <span>Balanço Real</span>
              </button>
            </div>

            {/* Formulário */}
            <form onSubmit={handleConfirmarMovimentacao} className="space-y-4">
              {temVariacoes ? (
                /* TABELA DE GRADE / TODAS AS VARIAÇÕES DE UMA SÓ VEZ */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-black dark:text-white flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      Variações do Produto ({linhasVariacoes.length})
                    </span>
                    <span className="text-[11px] text-black dark:text-slate-300 font-medium">
                      Informe as quantidades para cada variação:
                    </span>
                  </div>

                  <div className="border-2 border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-[#000000] shadow-xs">
                    <div className="overflow-x-auto max-h-72">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-white dark:bg-[#000000] text-black dark:text-white border-b-2 border-slate-300 dark:border-slate-700 sticky top-0 z-10 text-[11px] uppercase tracking-wider font-extrabold">
                          <tr>
                            <th className="p-3">Variação</th>
                            <th className="p-3 text-center">Estoque Atual</th>
                            <th className="p-3 text-center">
                              {tipoMovimento === 'entrada_compra'
                                ? 'Qtd. Adicionar'
                                : tipoMovimento === 'baixa_perda'
                                ? 'Qtd. Remover'
                                : 'Qtd. Contada'}
                            </th>
                            {tipoMovimento === 'entrada_compra' && (
                              <th className="p-3 text-center">Custo Unitário (R$)</th>
                            )}
                            <th className="p-3 text-center font-black text-emerald-700 dark:text-emerald-400">Novo Estoque</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#000000]">
                          {linhasVariacoes.map((linha) => {
                            const novoEstoque = calcularNovoEstoqueLinha(linha.estoqueAtual, linha.quantidade);
                            return (
                              <tr key={linha.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/60 transition">
                                <td className="p-3">
                                  <span className="font-bold text-black dark:text-white block">{linha.nome}</span>
                                  {linha.sku && <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono">SKU: {linha.sku}</span>}
                                </td>

                                <td className="p-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-lg font-mono font-bold text-xs ${
                                    linha.estoqueAtual <= 0
                                      ? 'bg-rose-50 text-rose-800 border-2 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/50'
                                      : 'bg-white text-black border-2 border-slate-300 dark:bg-[#000000] dark:text-white dark:border-slate-700'
                                  }`}>
                                    {linha.estoqueAtual}
                                  </span>
                                </td>

                                <td className="p-3 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={linha.quantidade}
                                    onChange={(e) => handleAtualizarQtdVariacao(linha.id, e.target.value)}
                                    className="w-20 bg-white dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 focus:border-emerald-600 dark:focus:border-emerald-500 rounded-xl px-2.5 py-1.5 text-center text-xs font-bold text-black dark:text-white focus:outline-none shadow-xs"
                                  />
                                </td>

                                {tipoMovimento === 'entrada_compra' && (
                                  <td className="p-3 text-center">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={linha.precoCusto}
                                      onChange={(e) => handleAtualizarCustoVariacao(linha.id, e.target.value)}
                                      className="w-24 bg-white dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 focus:border-emerald-600 dark:focus:border-emerald-500 rounded-xl px-2.5 py-1.5 text-center text-xs font-bold text-black dark:text-white focus:outline-none shadow-xs"
                                    />
                                  </td>
                                )}

                                <td className="p-3 text-center">
                                  <span className={`px-2.5 py-1 rounded-xl font-mono font-black text-xs ${
                                    novoEstoque > linha.estoqueAtual
                                      ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40'
                                      : novoEstoque < linha.estoqueAtual
                                      ? 'bg-rose-50 text-rose-800 border-2 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40'
                                      : 'bg-white text-black border-2 border-slate-300 dark:bg-[#000000] dark:text-white dark:border-slate-700'
                                  }`}>
                                    {novoEstoque}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Resumo da Grade */}
                    <div className="p-3 bg-white dark:bg-[#000000] border-t-2 border-slate-300 dark:border-slate-700 flex items-center justify-between text-xs">
                      <span className="text-black dark:text-slate-300 font-bold">
                        Total em Grade: <strong className="text-black dark:text-white">{totalEstoqueAtual} un</strong>
                      </span>
                      <span className="text-black dark:text-slate-300 font-bold">
                        Novo Total Consolidado:{' '}
                        <strong className="text-emerald-700 dark:text-emerald-400 text-sm font-black">{totalNovoEstoque} un</strong>
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* PRODUTO SIMPLES SEM VARIAÇÃO */
                <div className="space-y-4">
                  <div className="bg-white dark:bg-[#000000] p-4 rounded-xl border-2 border-slate-300 dark:border-slate-700 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[11px] text-black dark:text-slate-300 block font-bold">Estoque Atual em Loja:</span>
                      <span className="text-xl font-black text-black dark:text-white">
                        {totalEstoqueAtual} {produtoAtual.tipo_unidade || 'un'}
                      </span>
                    </div>
                    <div className="text-right space-y-0.5">
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block font-bold">Novo Estoque Previsto:</span>
                      <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                        {totalNovoEstoque} {produtoAtual.tipo_unidade || 'un'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-black dark:text-white">
                        {tipoMovimento === 'entrada_compra'
                          ? 'Quantidade a Adicionar:'
                          : tipoMovimento === 'baixa_perda'
                          ? 'Quantidade a Remover:'
                          : 'Quantidade Contada na Loja:'}
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={quantidadeSimples}
                        onChange={(e) => setQuantidadeSimples(e.target.value)}
                        className="w-full bg-white dark:bg-[#000000] border-2 border-emerald-500 rounded-xl px-3.5 py-2.5 text-base font-black text-emerald-700 dark:text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-xs"
                      />
                    </div>

                    {tipoMovimento === 'entrada_compra' && (
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-black dark:text-white">Custo Unitário da Compra (R$):</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={custoSimples}
                          onChange={(e) => setCustoSimples(e.target.value)}
                          className="w-full bg-white dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-black dark:text-white focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-500 shadow-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Lançamento financeiro de compra */}
              {tipoMovimento === 'entrada_compra' && valorTotalCompra > 0 && (
                <label className="flex items-start gap-2.5 p-3 bg-white dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition">
                  <input
                    type="checkbox"
                    checked={lancarDespesaFinanceira}
                    onChange={(e) => setLancarDespesaFinanceira(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-0 mt-0.5 cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-black dark:text-white block">
                      Registrar Saída no Caixa / Financeiro (R$ {valorTotalCompra.toFixed(2)})
                    </span>
                    <span className="text-[11px] text-black dark:text-slate-300 font-medium block">
                      Lança automaticamente a despesa de compra de mercadoria nas finanças da loja.
                    </span>
                  </div>
                </label>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-black dark:text-white">Observações da Movimentação (Opcional):</label>
                <input
                  type="text"
                  placeholder="Ex: Nota Fiscal 1452, Compra Fornecedor Silva, Devolução..."
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="w-full bg-white dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold text-black dark:text-white focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-500 placeholder-slate-400 shadow-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-[#000000] dark:hover:bg-slate-900 text-black dark:text-white text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer text-xs disabled:opacity-50 border border-emerald-500"
                >
                  {salvando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Gravando Estoque...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirmar Estoque</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
