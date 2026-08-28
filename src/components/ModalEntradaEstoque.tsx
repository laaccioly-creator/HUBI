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
  DollarSign,
  Truck,
  Layers
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Produto, VariacaoProduto } from '../types';

interface ModalEntradaEstoqueProps {
  isOpen: boolean;
  onClose: () => void;
  produto: Produto | null;
  onEstoqueAtualizado: () => void;
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
  onEstoqueAtualizado
}) => {
  const { loja } = useAuth();
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

  const temVariacoes = Boolean(produto?.tem_variacoes && Array.isArray(produto?.variacoes) && produto.variacoes.length > 0);

  useEffect(() => {
    if (produto && isOpen) {
      if (temVariacoes && produto.variacoes && produto.variacoes.length > 0) {
        const linhasIniciais: LinhaVariacaoEstoque[] = produto.variacoes.map(v => ({
          id: v.id,
          nome: [v.valor_variacao_1, v.valor_variacao_2].filter(Boolean).join(' - ') || 'Variação',
          sku: v.sku,
          estoqueAtual: Number(v.quantidade_estoque || 0),
          quantidade: '',
          precoCusto: v.preco_custo ? Number(v.preco_custo).toFixed(2) : (produto.preco_custo ? Number(produto.preco_custo).toFixed(2) : '0.00')
        }));
        setLinhasVariacoes(linhasIniciais);
      } else {
        setQuantidadeSimples('10');
        setCustoSimples(produto.preco_custo ? Number(produto.preco_custo).toFixed(2) : '0.00');
      }
      setObservacao('');
      setErroMsg(null);
    }
  }, [produto, isOpen, temVariacoes]);

  if (!isOpen || !produto) return null;

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

  const totalEstoqueAtual = temVariacoes
    ? linhasVariacoes.reduce((acc, l) => acc + l.estoqueAtual, 0)
    : Number(produto.quantidade_estoque || 0);

  const totalNovoEstoque = temVariacoes
    ? linhasVariacoes.reduce((acc, l) => acc + calcularNovoEstoqueLinha(l.estoqueAtual, l.quantidade), 0)
    : calcularNovoEstoqueLinha(totalEstoqueAtual, quantidadeSimples);

  const valorTotalCompra = temVariacoes
    ? linhasVariacoes.reduce((acc, l) => {
        const qtd = Number(l.quantidade) || 0;
        const custo = Number(l.precoCusto) || 0;
        return acc + (qtd * custo);
      }, 0)
    : (Number(quantidadeSimples) || 0) * (Number(custoSimples) || 0);

  const handleConfirmarMovimentacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || !produto.id) return;

    if (totalQtdMovimentada <= 0 && tipoMovimento !== 'ajuste_inventario') {
      setErroMsg('Por favor, informe ao menos uma quantidade a movimentar maior que zero.');
      return;
    }

    try {
      setSalvando(true);
      setErroMsg(null);

      if (temVariacoes && produto.variacoes && produto.variacoes.length > 0) {
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
          .eq('id', produto.id);

        if (errPai) throw errPai;

      } else {
        // Produto simples sem variações
        const novoEstoqueSimples = calcularNovoEstoqueLinha(
          Number(produto.quantidade_estoque || 0),
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
          .eq('id', produto.id);

        if (erroProd) throw erroProd;
      }

      // 3. Registrar saída no financeiro se for compra e checkbox estiver ativo
      if (tipoMovimento === 'entrada_compra' && lancarDespesaFinanceira && valorTotalCompra > 0) {
        try {
          const descricaoMov = `Compra de Estoque: ${totalQtdMovimentada}x ${produto.nome}`;
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

      onEstoqueAtualizado();
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
      <div className={`bg-slate-900 border border-slate-800 rounded-3xl w-full ${temVariacoes ? 'max-w-2xl' : 'max-w-lg'} p-6 space-y-5 shadow-2xl my-8 animate-in zoom-in-95 duration-150`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 font-bold flex items-center justify-center">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">Entrada / Ajuste de Estoque</h3>
              <p className="text-xs text-slate-400 truncate max-w-md">{produto.nome}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {erroMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{erroMsg}</span>
          </div>
        )}

        {/* Tipo de Movimento */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setTipoMovimento('entrada_compra')}
            className={`p-2.5 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
              tipoMovimento === 'entrada_compra'
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/15'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
            <span>+ Compra</span>
          </button>

          <button
            type="button"
            onClick={() => setTipoMovimento('baixa_perda')}
            className={`p-2.5 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
              tipoMovimento === 'baixa_perda'
                ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-md shadow-rose-500/15'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <ArrowUpRight className="w-4 h-4 text-rose-400" />
            <span>- Baixa / Avaria</span>
          </button>

          <button
            type="button"
            onClick={() => setTipoMovimento('ajuste_inventario')}
            className={`p-2.5 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
              tipoMovimento === 'ajuste_inventario'
                ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-md shadow-indigo-500/15'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>Balanço Real</span>
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleConfirmarMovimentacao} className="space-y-4">
          {temVariacoes ? (
            /* TABELA DE GRADE / TODAS AS VARIAÇÕES DE UMA SÓ VEZ */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  Variações do Produto ({linhasVariacoes.length})
                </span>
                <span className="text-[11px] text-slate-400">
                  Informe as quantidades para cada variação:
                </span>
              </div>

              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/80 shadow-inner">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 sticky top-0 z-10 text-[11px] uppercase tracking-wider font-semibold">
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
                        <th className="p-3 text-center font-bold text-emerald-400">Novo Estoque</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {linhasVariacoes.map((linha) => {
                        const novoEstoque = calcularNovoEstoqueLinha(linha.estoqueAtual, linha.quantidade);
                        return (
                          <tr key={linha.id} className="hover:bg-slate-800/30 transition">
                            <td className="p-3">
                              <span className="font-bold text-slate-100 block">{linha.nome}</span>
                              {linha.sku && <span className="text-[10px] text-slate-500 font-mono">SKU: {linha.sku}</span>}
                            </td>

                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-lg font-mono font-bold text-xs ${
                                linha.estoqueAtual <= 0
                                  ? 'bg-rose-950/60 text-rose-300 border border-rose-800/50'
                                  : 'bg-slate-900 text-slate-300 border border-slate-800'
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
                                className="w-20 bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-2.5 py-1.5 text-center text-xs font-bold text-slate-100 focus:outline-none"
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
                                  className="w-24 bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-2.5 py-1.5 text-center text-xs font-bold text-slate-100 focus:outline-none"
                                />
                              </td>
                            )}

                            <td className="p-3 text-center">
                              <span className={`px-2.5 py-1 rounded-xl font-mono font-black text-xs ${
                                novoEstoque > linha.estoqueAtual
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : novoEstoque < linha.estoqueAtual
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : 'bg-slate-900 text-slate-400'
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
                <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    Total em Grade: <strong className="text-slate-200">{totalEstoqueAtual} un</strong>
                  </span>
                  <span className="text-slate-300">
                    Novo Total Consolidado:{' '}
                    <strong className="text-emerald-400 text-sm font-black">{totalNovoEstoque} un</strong>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* PRODUTO SIMPLES SEM VARIAÇÃO */
            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[11px] text-slate-400 block">Estoque Atual em Loja:</span>
                  <span className="text-xl font-black text-slate-200">
                    {totalEstoqueAtual} {produto.tipo_unidade || 'un'}
                  </span>
                </div>
                <div className="text-right space-y-0.5">
                  <span className="text-[11px] text-emerald-400 block font-semibold">Novo Estoque Previsto:</span>
                  <span className="text-2xl font-black text-emerald-400">
                    {totalNovoEstoque} {produto.tipo_unidade || 'un'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-200">
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
                    className="w-full bg-slate-800 border border-emerald-500/50 rounded-xl px-3.5 py-2.5 text-base font-bold text-emerald-400 focus:outline-none"
                  />
                </div>

                {tipoMovimento === 'entrada_compra' && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Custo Unitário da Compra (R$):</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={custoSimples}
                      onChange={(e) => setCustoSimples(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Lançamento financeiro de compra */}
          {tipoMovimento === 'entrada_compra' && valorTotalCompra > 0 && (
            <label className="flex items-start gap-2.5 p-3 bg-slate-950/60 border border-slate-800 rounded-2xl cursor-pointer hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={lancarDespesaFinanceira}
                onChange={(e) => setLancarDespesaFinanceira(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 focus:ring-0 mt-0.5"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-200 block">
                  Registrar Saída no Caixa / Financeiro (R$ {valorTotalCompra.toFixed(2)})
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Lança automaticamente a despesa de compra de mercadoria nas finanças da loja.
                </span>
              </div>
            </label>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">Observações da Movimentação (Opcional):</label>
            <input
              type="text"
              placeholder="Ex: Nota Fiscal 1452, Compra Fornecedor Silva, Devolução..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
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
      </div>
    </div>
  );
};
