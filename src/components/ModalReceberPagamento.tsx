import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CreditCard,
  Banknote,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Printer,
  Plus,
  Trash2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Pedido, FormaPagamento, StatusPagamento, TipoPagamento } from '../types';
import { PrintService } from '../services/printService';
import { SyncService } from '../services/syncService';
import { audioService } from '../services/audioService';
import { caixaService } from '../services/caixaService';
import { obterDataOperacaoISO } from '../utils/dataOperacao';

interface ModalReceberPagamentoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  onPagamentoConcluido: (pedidoAtualizado?: Pedido) => void;
  concluirAoQuitar?: boolean;
}

export interface LinhaPagamentoRecebimento {
  id: string;
  forma_pagamento_id: string;
  forma_tipo: TipoPagamento;
  forma_nome: string;
  valor: number;
  valor_entregue?: number | null;
  parcelas?: number;
}

export const ModalReceberPagamento: React.FC<ModalReceberPagamentoProps> = ({
  isOpen,
  onClose,
  pedido,
  onPagamentoConcluido,
  concluirAoQuitar = false
}) => {
  const { loja, usuario } = useAuth();
  const permissions = usePermissions();

  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [linhasPagamento, setLinhasPagamento] = useState<LinhaPagamentoRecebimento[]>([]);
  const [concluirAoQuitarCheck, setConcluirAoQuitarCheck] = useState<boolean>(concluirAoQuitar);
  const [processando, setProcessando] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [sucessoModal, setSucessoModal] = useState<boolean>(false);
  const [pedidoAtualizado, setPedidoAtualizado] = useState<Pedido | null>(null);
  const inputPrimeiroValorRef = useRef<HTMLInputElement>(null);

  const FORMAS_PADRAO: FormaPagamento[] = [
    { id: `fp_dinheiro_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Dinheiro', tipo: 'dinheiro', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_pix_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Pix (Imediato)', tipo: 'pix', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_debito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Débito', tipo: 'cartao_debito', taxa_percentual: 1.5, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_credito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Crédito', tipo: 'cartao_credito', taxa_percentual: 3.2, taxa_fixa: 0, maximo_parcelas: 12, ativo: true, exibir_catalogo: true }
  ];

  // Carregar formas de pagamento cadastradas da loja (excluindo Fiado)
  useEffect(() => {
    if (!loja?.id || !isOpen) return;
    const buscarFormas = async () => {
      try {
        const { data, error } = await supabase
          .from('formas_pagamento')
          .select('*')
          .eq('loja_id', loja.id)
          .eq('ativo', true)
          .order('nome');

        let lista = FORMAS_PADRAO;
        if (!error && data && data.length > 0) {
          lista = data;
        }
        lista = lista.filter(f => f.tipo !== 'fiado');
        setFormasPagamento(lista);
      } catch (err) {
        console.warn('Fallback formas de pagamento:', err);
        setFormasPagamento(FORMAS_PADRAO);
      }
    };

    buscarFormas();
  }, [loja?.id, isOpen]);

  // Inicializar linhas de pagamento quando o modal abrir para um pedido
  useEffect(() => {
    if (pedido && isOpen) {
      setConcluirAoQuitarCheck(concluirAoQuitar);
      const valorTot = Number(pedido.valor_total || 0);
      const valorJaPago = Number(pedido.valor_pago || 0);
      const saldoRestante = Math.max(0, Number(pedido.saldo_devedor ?? (valorTot - valorJaPago)));
      const valorSugerido = saldoRestante > 0 ? saldoRestante : (valorTot > 0 ? valorTot : 0);

      const fpsDisponiveis = (formasPagamento && formasPagamento.length > 0 ? formasPagamento : FORMAS_PADRAO).filter(f => f.tipo !== 'fiado');
      const fpInicial = fpsDisponiveis.find(f => f.tipo === 'dinheiro') || fpsDisponiveis[0];

      setLinhasPagamento([
        {
          id: `linha_${Date.now()}`,
          forma_pagamento_id: fpInicial.id,
          forma_tipo: fpInicial.tipo,
          forma_nome: fpInicial.nome,
          valor: Number(valorSugerido.toFixed(2)),
          valor_entregue: null,
          parcelas: 1
        }
      ]);

      setErroMsg(null);
      setSucessoModal(false);
      setPedidoAtualizado(null);

      const timer = setTimeout(() => {
        if (inputPrimeiroValorRef.current) {
          inputPrimeiroValorRef.current.focus();
          inputPrimeiroValorRef.current.select();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [pedido, isOpen, formasPagamento]);

  if (!isOpen || !pedido) return null;

  const valorTotal = Number(pedido.valor_total || 0);
  const valorJaPago = Number(pedido.valor_pago || 0);
  const saldoDevedorAtual = Math.max(0, valorTotal - valorJaPago);

  const totalLinhasPagamento = Number(
    linhasPagamento.reduce((acc, l) => acc + (Number(l.valor) || 0), 0).toFixed(2)
  );
  const diferencaPagamento = Number((saldoDevedorAtual - totalLinhasPagamento).toFixed(2));

  const formasDisponiveis = (formasPagamento && formasPagamento.length > 0 ? formasPagamento : FORMAS_PADRAO).filter(f => f.tipo !== 'fiado');

  const handleAlterarFormaLinha = (linhaId: string, fp: FormaPagamento) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      return {
        ...l,
        forma_pagamento_id: fp.id,
        forma_tipo: fp.tipo,
        forma_nome: fp.nome,
        parcelas: fp.tipo === 'cartao_credito' ? (l.parcelas || 1) : 1
      };
    }));
  };

  const handleAlterarValorLinha = (linhaId: string, valor: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      return { ...l, valor: Math.max(0, valor) };
    }));
  };

  const handleAlterarEntregueLinha = (linhaId: string, valorEntregue: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      return { ...l, valor_entregue: valorEntregue };
    }));
  };

  const handleAlterarParcelasLinha = (linhaId: string, parcelas: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      return { ...l, parcelas: Math.max(1, parcelas) };
    }));
  };

  const handleAdicionarLinhaPagamento = () => {
    const restante = Math.max(0, diferencaPagamento);
    const fpPadrao = formasDisponiveis.find(f => !linhasPagamento.some(l => l.forma_tipo === f.tipo)) || formasDisponiveis[0];

    setLinhasPagamento(prev => [
      ...prev,
      {
        id: `linha_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        forma_pagamento_id: fpPadrao.id,
        forma_tipo: fpPadrao.tipo,
        forma_nome: fpPadrao.nome,
        valor: restante,
        valor_entregue: null,
        parcelas: 1
      }
    ]);
  };

  const handleRemoverLinhaPagamento = (linhaId: string) => {
    if (linhasPagamento.length <= 1) return;
    setLinhasPagamento(prev => prev.filter(l => l.id !== linhaId));
  };

  const handleConfirmarRecebimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || !pedido.id) return;

    if (totalLinhasPagamento <= 0) {
      setErroMsg('Informe um valor a receber maior que zero.');
      return;
    }

    if (totalLinhasPagamento > saldoDevedorAtual + 0.01) {
      setErroMsg(`O total informado (R$ ${totalLinhasPagamento.toFixed(2)}) ultrapassa o saldo devedor (R$ ${saldoDevedorAtual.toFixed(2)}). Ajuste os valores.`);
      return;
    }

    try {
      setProcessando(true);
      setErroMsg(null);

      const dataIso = obterDataOperacaoISO();
      const novoValorPago = Number((valorJaPago + totalLinhasPagamento).toFixed(2));
      const novoSaldoDevedor = Number(Math.max(0, valorTotal - novoValorPago).toFixed(2));
      const quitado = novoSaldoDevedor <= 0.009;
      const novoStatusPagamento: StatusPagamento = quitado
        ? 'pago'
        : novoValorPago > 0
        ? 'parcialmente_pago'
        : 'aguardando_pagamento';

      // 1. Inserir pagamentos em pagamentos_pedido para cada linha com valor > 0
      const linhasAtivas = linhasPagamento.filter(l => Number(l.valor) > 0);

      // Se este for o primeiro pagamento financeiro e o valor já pago era 0, remove registros provisórios não efetivados
      if (pedido.pagamentos && pedido.pagamentos.length > 0 && valorJaPago === 0) {
        await supabase.from('pagamentos_pedido').delete().eq('pedido_id', pedido.id);
      }

      for (const linha of linhasAtivas) {
        const fpIdReal = await SyncService.resolverFormaPagamentoId(
          loja.id,
          linha.forma_pagamento_id,
          linha.forma_tipo
        );
        const fpObj = formasDisponiveis.find(f => f.id === linha.forma_pagamento_id || f.tipo === linha.forma_tipo);
        const taxaPerc = Number(fpObj?.taxa_percentual || 0);
        const taxaValor = Number(((linha.valor * taxaPerc) / 100).toFixed(2));
        const valorLiquido = Number((linha.valor - taxaValor).toFixed(2));

        const { error: erroPag } = await supabase.from('pagamentos_pedido').insert([
          {
            loja_id: loja.id,
            pedido_id: pedido.id,
            forma_pagamento_id: fpIdReal,
            valor: linha.valor,
            parcelas: linha.parcelas || 1,
            valor_taxa: taxaValor,
            valor_liquido: valorLiquido,
            data_pagamento: dataIso,
            eh_pagamento_fiado: false
          }
        ]);

        if (erroPag) throw erroPag;
      }

      // 2. Atualizar status e valores do pedido
      const payloadUpdate: any = {
        status_pagamento: novoStatusPagamento,
        valor_pago: novoValorPago,
        saldo_devedor: novoSaldoDevedor,
        fiado_quitado: quitado,
        atualizado_em: dataIso
      };

      if (quitado) {
        if (concluirAoQuitarCheck) {
          payloadUpdate.status = 'concluido';
        } else if (pedido.status === 'pendente') {
          payloadUpdate.status = 'confirmado';
        }
      }

      const { data: pedUpd, error: erroUpd } = await supabase
        .from('pedidos')
        .update(payloadUpdate)
        .eq('id', pedido.id)
        .select(`
          *,
          cliente:clientes(*),
          vendedor:usuarios_loja!pedidos_vendedor_id_fkey(*),
          itens:itens_pedido(*),
          pagamentos:pagamentos_pedido(*)
        `)
        .single();

      if (erroUpd) throw erroUpd;

      // 3. Atualizar saldo devedor do cliente e devolver limite de crédito
      if (pedido.cliente_id && totalLinhasPagamento > 0) {
        try {
          const { data: cliData } = await supabase
            .from('clientes')
            .select('saldo_devedor_fiado, limite_credito')
            .eq('id', pedido.cliente_id)
            .single();

          if (cliData) {
            const debitoCli = Number(cliData.saldo_devedor_fiado || 0);
            const novoDebitoCli = Math.max(0, debitoCli - totalLinhasPagamento);
            const novoLimite = Number(cliData.limite_credito || 0) + totalLinhasPagamento;
            await supabase
              .from('clientes')
              .update({
                saldo_devedor_fiado: novoDebitoCli,
                limite_credito: novoLimite
              })
              .eq('id', pedido.cliente_id);
          }
        } catch (cliErr) {
          console.warn('Aviso ao abater fiado do cliente e devolver limite:', cliErr);
        }
      }

      // 4. Registrar na sessão de caixa ativa se houver
      if (loja?.id && linhasAtivas.length > 0) {
        try {
          await caixaService.registrarVendaPedido({
            lojaId: loja.id,
            pedido: pedUpd || pedido,
            pagamentos: linhasAtivas.map(l => ({
              forma_nome: l.forma_nome,
              forma_tipo: l.forma_tipo,
              valor: l.valor
            })),
            usuarioId: usuario?.id || ''
          });
        } catch (errCaixa) {
          console.warn('Aviso ao registrar recebimento no caixa:', errCaixa);
        }
      }

      audioService.playNewOrderSound();
      const objAtualizado = (pedUpd as unknown as Pedido) || { ...pedido, ...payloadUpdate };
      setPedidoAtualizado(objAtualizado);
      setSucessoModal(true);
      onPagamentoConcluido(objAtualizado);
    } catch (err: any) {
      console.error('Erro ao receber pagamento:', err);
      setErroMsg(err.message || 'Erro ao registrar pagamento. Tente novamente.');
    } finally {
      setProcessando(false);
    }
  };

  const handleImprimirComprovante = () => {
    if (pedidoAtualizado || pedido) {
      PrintService.printReceipt(pedidoAtualizado || pedido, loja, '80mm');
    }
  };

  const handleFecharTudo = () => {
    setSucessoModal(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 my-6 text-slate-100 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 font-bold flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <span>Pagamento e Fechamento</span>
                <span className="text-xs text-slate-400 font-normal">
                  #{pedido.origem === 'catalogo_online' ? `c-${pedido.numero_pedido}` : pedido.numero_pedido}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Cliente: <span className="text-slate-200 font-semibold">{pedido.cliente?.nome || 'Cliente Balcão'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={handleFecharTudo}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
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

        {sucessoModal ? (
          /* TELA DE SUCESSO DO RECEBIMENTO */
          <div className="py-6 text-center space-y-4 animate-in fade-in">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40 shadow-lg shadow-emerald-500/15">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-black text-slate-100">Pagamento Recebido com Sucesso!</h4>
              <p className="text-xs text-slate-400">
                O valor de <span className="text-emerald-400 font-bold">R$ {totalLinhasPagamento.toFixed(2)}</span> foi registrado no pedido.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs space-y-1.5 text-left max-w-sm mx-auto">
              <div className="flex justify-between text-slate-400">
                <span>Total do Pedido:</span>
                <span className="font-semibold text-slate-200">R$ {valorTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-400">
                <span>Total Pago até agora:</span>
                <span className="font-bold">R$ {(valorJaPago + totalLinhasPagamento).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800">
                <span>Saldo Devedor Restante:</span>
                <span className={`font-bold ${Math.max(0, valorTotal - (valorJaPago + totalLinhasPagamento)) <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  R$ {Math.max(0, valorTotal - (valorJaPago + totalLinhasPagamento)).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleImprimirComprovante}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-white text-slate-950 text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Recibo</span>
              </button>
              <button
                type="button"
                onClick={handleFecharTudo}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition cursor-pointer shadow-lg shadow-emerald-500/25"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          /* FORMULÁRIO DE RECEBIMENTO (MÚLTIPLAS FORMAS DE PAGAMENTO IDÊNTICO AO CHECKOUT DO CARRINHO) */
          <form onSubmit={handleConfirmarRecebimento} className="space-y-4">
            {/* Cards de Resumo dos Valores */}
            <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">Total Pedido</span>
                <span className="text-xs font-black text-slate-200">R$ {valorTotal.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-500/80 font-semibold block">Já Pago</span>
                <span className="text-xs font-black text-emerald-400">R$ {valorJaPago.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] text-amber-500/80 font-semibold block">Saldo Pendente</span>
                <span className="text-xs font-black text-amber-400">R$ {saldoDevedorAtual.toFixed(2)}</span>
              </div>
            </div>

            {/* Linhas de Pagamento */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">
                  Meios de Pagamento ({linhasPagamento.length}):
                </span>
                <span className="text-[11px] text-slate-400">
                  Permite dividir o saldo em vários meios
                </span>
              </div>

              {linhasPagamento.map((linha, idx) => {
                const formaSelecionada = formasDisponiveis.find(f => f.id === linha.forma_pagamento_id || f.tipo === linha.forma_tipo);
                const maxParcelas = formaSelecionada?.maximo_parcelas || 12;

                return (
                  <div key={linha.id} className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-[10px]">
                          {idx + 1}
                        </span>
                        Pagamento #{idx + 1}
                      </span>
                      {linhasPagamento.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoverLinhaPagamento(linha.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                          title="Remover este meio"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Seleção da Forma de Pagamento */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {formasDisponiveis.map((fp) => {
                        const estaSelecionado = linha.forma_pagamento_id === fp.id || (!linha.forma_pagamento_id && linha.forma_tipo === fp.tipo);
                        return (
                          <button
                            key={fp.id}
                            type="button"
                            onClick={() => handleAlterarFormaLinha(linha.id, fp)}
                            className={`p-2 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 ${
                              estaSelecionado
                                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40 shadow-sm'
                                : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
                            }`}
                          >
                            {fp.tipo === 'dinheiro' && <Banknote className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                            {fp.tipo === 'pix' && <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                            {fp.tipo === 'cartao_debito' && <CreditCard className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                            {fp.tipo === 'cartao_credito' && <CreditCard className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                            {fp.tipo !== 'dinheiro' && fp.tipo !== 'pix' && fp.tipo !== 'cartao_debito' && fp.tipo !== 'cartao_credito' && (
                              <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            )}
                            <span className="truncate">{fp.nome}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Valor deste pagamento */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                      <span className="text-xs text-slate-300 font-bold">Valor a pagar:</span>
                      <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/30">
                        <span className="text-xs text-emerald-400 font-black">R$</span>
                        <input
                          ref={idx === 0 ? inputPrimeiroValorRef : undefined}
                          type="number"
                          step="0.01"
                          min="0"
                          autoFocus={idx === 0}
                          onFocus={(e) => e.target.select()}
                          value={linha.valor > 0 ? linha.valor : ''}
                          onChange={(e) => handleAlterarValorLinha(linha.id, parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
                          className="w-28 bg-transparent text-right text-sm font-black text-white focus:outline-none placeholder:text-slate-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>

                    {/* Dinheiro: Troco */}
                    {linha.forma_tipo === 'dinheiro' && (
                      <div className="space-y-1.5 pt-1.5 border-t border-slate-800/60 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-300 font-medium">Valor Entregue pelo Cliente:</span>
                          <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/30">
                            <span className="text-xs text-emerald-400 font-bold">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              onFocus={(e) => e.target.select()}
                              value={linha.valor_entregue != null && linha.valor_entregue > 0 ? linha.valor_entregue : ''}
                              onChange={(e) => handleAlterarEntregueLinha(linha.id, parseFloat(e.target.value) || 0)}
                              style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
                              className="w-28 bg-transparent text-right text-xs font-bold text-white focus:outline-none placeholder:text-slate-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        </div>
                        {linha.valor_entregue != null && linha.valor_entregue > linha.valor && (
                          <div className="flex justify-between font-bold text-amber-400">
                            <span>Troco a devolver:</span>
                            <span>R$ {(linha.valor_entregue - linha.valor).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Cartão de Crédito: Parcelas */}
                    {linha.forma_tipo === 'cartao_credito' && (
                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800/60 text-xs">
                        <span className="text-slate-400">Número de Parcelas:</span>
                        <select
                          value={linha.parcelas || 1}
                          onChange={(e) => handleAlterarParcelasLinha(linha.id, parseInt(e.target.value) || 1)}
                          className="bg-slate-900 border border-slate-700 rounded-xl px-2 py-1 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none cursor-pointer"
                        >
                          {Array.from({ length: Math.min(12, maxParcelas) }, (_, i) => i + 1).map(num => (
                            <option key={num} value={num}>
                              {num}x {linha.valor > 0 ? `de R$ ${(linha.valor / num).toFixed(2)}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Botão para adicionar outro pagamento */}
              <button
                type="button"
                onClick={handleAdicionarLinhaPagamento}
                className="w-full py-2.5 rounded-2xl bg-slate-800/70 hover:bg-slate-800 text-emerald-400 font-bold text-xs border border-dashed border-emerald-500/40 hover:border-emerald-500 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Outro Meio de Pagamento</span>
              </button>
            </div>

            {/* Resumo de Conferência dos Valores */}
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Saldo Pendente a Quitar:</span>
                <span className="font-bold text-white">R$ {saldoDevedorAtual.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total dos Meios Informados:</span>
                <span className="font-bold text-white">R$ {totalLinhasPagamento.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold pt-1.5 border-t border-slate-800/80">
                {Math.abs(diferencaPagamento) < 0.01 ? (
                  <>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Total Conferido (100%)
                    </span>
                    <span className="text-emerald-400">R$ 0,00</span>
                  </>
                ) : diferencaPagamento > 0 ? (
                  <>
                    <span className="text-amber-400">Restante a Definir:</span>
                    <span className="text-amber-400">R$ {diferencaPagamento.toFixed(2)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-rose-400">Excedente Ultrapassado:</span>
                    <span className="text-rose-400">R$ {Math.abs(diferencaPagamento).toFixed(2)}</span>
                  </>
                )}
              </div>
            </div>

            {/* Toggle / Checkbox Concluir ao Quitar */}
            <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-200 block">
                  Concluir Automaticamente ao Quitar
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Altera o status do pedido para "Concluído" se o saldo for 100% quitado
                </span>
              </div>
              <input
                type="checkbox"
                checked={concluirAoQuitarCheck}
                onChange={(e) => setConcluirAoQuitarCheck(e.target.checked)}
                className="w-5 h-5 rounded-lg text-emerald-500 bg-slate-900 border-slate-700 focus:ring-emerald-500 focus:ring-offset-slate-900 cursor-pointer accent-emerald-500"
              />
            </div>

            {/* Botões de Ação */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleFecharTudo}
                className="flex-1 py-3 rounded-2xl border border-slate-700 bg-transparent hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={processando || totalLinhasPagamento <= 0 || Math.abs(diferencaPagamento) > 0.01}
                className="flex-[2] py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                {processando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Registrando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar Pagamento e Concluir</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
