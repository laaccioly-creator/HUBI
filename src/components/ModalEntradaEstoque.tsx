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
  Truck
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Produto } from '../types';

interface ModalEntradaEstoqueProps {
  isOpen: boolean;
  onClose: () => void;
  produto: Produto | null;
  onEstoqueAtualizado: () => void;
}

type TipoMovimento = 'entrada_compra' | 'ajuste_inventario' | 'baixa_perda';

export const ModalEntradaEstoque: React.FC<ModalEntradaEstoqueProps> = ({
  isOpen,
  onClose,
  produto,
  onEstoqueAtualizado
}) => {
  const { loja } = useAuth();
  const [tipoMovimento, setTipoMovimento] = useState<TipoMovimento>('entrada_compra');
  const [variacaoSelecionadaId, setVariacaoSelecionadaId] = useState<string>('');
  const [quantidade, setQuantidade] = useState<string>('10');
  const [novoPrecoCusto, setNovoPrecoCusto] = useState<string>('');
  const [novoPrecoVenda, setNovoPrecoVenda] = useState<string>('');
  const [lancarDespesaFinanceira, setLancarDespesaFinanceira] = useState<boolean>(true);
  const [observacao, setObservacao] = useState<string>('');

  const [salvando, setSalvando] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  const temVariacoes = Boolean(produto?.tem_variacoes && Array.isArray(produto?.variacoes) && produto.variacoes.length > 0);
  const variacaoAtual = temVariacoes ? produto?.variacoes?.find(v => v.id === variacaoSelecionadaId) || produto?.variacoes?.[0] : null;

  useEffect(() => {
    if (produto) {
      if (temVariacoes && produto.variacoes && produto.variacoes.length > 0) {
        setVariacaoSelecionadaId(produto.variacoes[0].id);
        setNovoPrecoCusto(produto.variacoes[0].preco_custo ? String(produto.variacoes[0].preco_custo) : (produto.preco_custo ? String(produto.preco_custo) : '0.00'));
        setNovoPrecoVenda(produto.variacoes[0].preco_venda_varejo ? String(produto.variacoes[0].preco_venda_varejo) : (produto.preco_venda_varejo ? String(produto.preco_venda_varejo) : ''));
      } else {
        setVariacaoSelecionadaId('');
        setNovoPrecoCusto(produto.preco_custo ? String(produto.preco_custo) : '0.00');
        setNovoPrecoVenda(produto.preco_venda_varejo ? String(produto.preco_venda_varejo) : '');
      }
      setQuantidade('10');
      setObservacao('');
      setErroMsg(null);
    }
  }, [produto, isOpen]);

  // Atualiza preços ao trocar de variação
  const handleSelecionarVariacao = (varId: string) => {
    setVariacaoSelecionadaId(varId);
    const v = produto?.variacoes?.find(item => item.id === varId);
    if (v) {
      setNovoPrecoCusto(v.preco_custo ? String(v.preco_custo) : (produto?.preco_custo ? String(produto.preco_custo) : '0.00'));
      setNovoPrecoVenda(v.preco_venda_varejo ? String(v.preco_venda_varejo) : (produto?.preco_venda_varejo ? String(produto.preco_venda_varejo) : ''));
    }
  };

  if (!isOpen || !produto) return null;

  const estoqueAtual = temVariacoes && variacaoAtual
    ? Number(variacaoAtual.quantidade_estoque || 0)
    : Number(produto.quantidade_estoque || 0);

  const qtdInformada = Number(quantidade) || 0;

  // Cálculo do novo estoque estimado
  let novoEstoqueCalculado = estoqueAtual;
  if (tipoMovimento === 'entrada_compra') {
    novoEstoqueCalculado = estoqueAtual + qtdInformada;
  } else if (tipoMovimento === 'baixa_perda') {
    novoEstoqueCalculado = Math.max(0, estoqueAtual - qtdInformada);
  } else if (tipoMovimento === 'ajuste_inventario') {
    novoEstoqueCalculado = Math.max(0, qtdInformada);
  }

  const custoUnit = Number(novoPrecoCusto) || 0;
  const valorTotalCompra = qtdInformada * custoUnit;

  const handleConfirmarMovimentacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || !produto.id) return;

    if (qtdInformada <= 0 && tipoMovimento !== 'ajuste_inventario') {
      setErroMsg('Por favor, informe uma quantidade maior que zero.');
      return;
    }

    try {
      setSalvando(true);
      setErroMsg(null);

      if (temVariacoes && variacaoAtual) {
        // 1. Atualizar estoque da variação específica
        const payloadVar: any = {
          quantidade_estoque: novoEstoqueCalculado
        };
        if (tipoMovimento === 'entrada_compra' && custoUnit > 0) {
          payloadVar.preco_custo = custoUnit;
        }
        if (novoPrecoVenda && Number(novoPrecoVenda) > 0) {
          payloadVar.preco_venda_varejo = Number(novoPrecoVenda);
        }

        const { error: erroVar } = await supabase
          .from('variacoes_produto')
          .update(payloadVar)
          .eq('id', variacaoAtual.id);

        if (erroVar) throw erroVar;

        // 2. Recalcular a soma total de estoque no produto pai
        const outrasVariacoesSoma = (produto.variacoes || [])
          .filter(v => v.id !== variacaoAtual.id)
          .reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0);
        const novoTotalPai = outrasVariacoesSoma + novoEstoqueCalculado;

        await supabase
          .from('produtos')
          .update({ quantidade_estoque: novoTotalPai })
          .eq('id', produto.id);

      } else {
        // 1. Atualizar produto simples sem variação
        const payloadUpdate: Partial<Produto> = {
          quantidade_estoque: novoEstoqueCalculado
        };

        if (tipoMovimento === 'entrada_compra' && custoUnit > 0) {
          payloadUpdate.preco_custo = custoUnit;
        }
        if (novoPrecoVenda && Number(novoPrecoVenda) > 0) {
          payloadUpdate.preco_venda_varejo = Number(novoPrecoVenda);
        }

        const { error: erroProd } = await supabase
          .from('produtos')
          .update(payloadUpdate)
          .eq('id', produto.id);

        if (erroProd) throw erroProd;
      }

      // 3. Se for entrada por compra e o lojista marcou para lançar a despesa no financeiro
      if (tipoMovimento === 'entrada_compra' && lancarDespesaFinanceira && valorTotalCompra > 0) {
        try {
          const descricaoMov = temVariacoes && variacaoAtual
            ? `Compra de Estoque: ${qtdInformada}x ${produto.nome} (${variacaoAtual.valor_variacao_1})`
            : `Compra de Estoque: ${qtdInformada}x ${produto.nome}`;

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
      setErroMsg(err.message || 'Erro ao registrar movimentação de estoque.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 font-bold flex items-center justify-center">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">Entrada / Ajuste de Estoque</h3>
              <p className="text-xs text-slate-400 truncate max-w-xs">{produto.nome}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {erroMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-xs text-rose-300">
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
            <span>- Baixa/Avaria</span>
          </button>
        </div>

        {/* Formulário de Quantidade e Custos */}
        <form onSubmit={handleConfirmarMovimentacao} className="space-y-4">
          {/* Seletor de Variação se o produto possuir grade */}
          {temVariacoes && produto.variacoes && produto.variacoes.length > 0 && (
            <div className="space-y-1.5 p-3 bg-slate-950/70 rounded-2xl border border-slate-800">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Selecione a Opção / Variação:</span>
                <span className="text-[10px] text-slate-500 font-normal">Controle individual por grade</span>
              </label>
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {produto.variacoes.map((v) => {
                  const isSel = (variacaoAtual?.id === v.id);
                  const estVar = Number(v.quantidade_estoque || 0);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleSelecionarVariacao(v.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border ${
                        isSel
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <span>{v.valor_variacao_1} {v.valor_variacao_2 ? `- ${v.valor_variacao_2}` : ''}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                        estVar <= 0 ? 'bg-rose-950 text-rose-300 border border-rose-800/60' : 'bg-slate-950 text-slate-300'
                      }`}>
                        {estVar} un
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] text-slate-400 block">
                {temVariacoes && variacaoAtual ? `Estoque Atual (${variacaoAtual.valor_variacao_1}):` : 'Estoque Atual em Loja:'}
              </span>
              <span className="text-xl font-black text-slate-200">{estoqueAtual} {produto.tipo_unidade || 'un'}</span>
            </div>
            <div className="text-right space-y-0.5">
              <span className="text-[11px] text-emerald-400 block font-semibold">Novo Estoque Previsto:</span>
              <span className="text-2xl font-black text-emerald-400">{novoEstoqueCalculado} {produto.tipo_unidade || 'un'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-200">
                {tipoMovimento === 'ajuste_inventario' ? 'Quantidade Contada na Loja:' : 'Quantidade a Adicionar / Remover:'}
              </label>
              <input
                type="number"
                required
                min="0"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="w-full bg-slate-800 border border-emerald-500/50 rounded-xl px-3.5 py-2.5 text-base font-bold text-emerald-400 focus:outline-none"
              />
            </div>

            {tipoMovimento === 'entrada_compra' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Custo Unitário da Compra (R$):</label>
                <input
                  type="number"
                  step="0.01"
                  value={novoPrecoCusto}
                  onChange={(e) => setNovoPrecoCusto(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Lançamento financeiro opcional */}
          {tipoMovimento === 'entrada_compra' && valorTotalCompra > 0 && (
            <label className="flex items-start gap-2.5 p-3 bg-slate-950/60 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition">
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
              className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
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
