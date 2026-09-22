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
  Trash2,
  Save,
  FileText
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Pedido, FormaPagamento, StatusPagamento, TipoPagamento } from '../types';
import { PrintService } from '../services/printService';
import { SyncService } from '../services/syncService';
import { audioService } from '../services/audioService';
import { caixaService } from '../services/caixaService';
import { obterDataOperacaoISO } from '../utils/dataOperacao';

export interface LinhaPagamentoRecebimento {
  id: string;
  forma_pagamento_id: string;
  forma_tipo: TipoPagamento;
  forma_nome: string;
  valor: number;
  valor_entregue?: number | null;
  parcelas?: number;
}

export interface ModalPagamentoFechamentoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  onPagamentoConcluido: (pedidoAtualizado?: Pedido) => void;
  concluirAoQuitar?: boolean;
  onSalvar?: (linhas: LinhaPagamentoRecebimento[]) => Promise<void>;
}

export const ModalPagamentoFechamento: React.FC<ModalPagamentoFechamentoProps> = ({
  isOpen,
  onClose,
  pedido,
  onPagamentoConcluido,
  concluirAoQuitar = false,
  onSalvar
}) => {
  const { loja, usuario } = useAuth();

  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [linhasPagamento, setLinhasPagamento] = useState<LinhaPagamentoRecebimento[]>([]);
  const [concluirAoQuitarCheck, setConcluirAoQuitarCheck] = useState<boolean>(concluirAoQuitar);
  const [processando, setProcessando] = useState<boolean>(false);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [sucessoModal, setSucessoModal] = useState<boolean>(false);
  const [pedidoAtualizado, setPedidoAtualizado] = useState<Pedido | null>(null);
  const inputPrimeiroValorRef = useRef<HTMLInputElement>(null);

  const FORMAS_PADRAO: FormaPagamento[] = [
    { id: `fp_dinheiro_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Dinheiro', tipo: 'dinheiro', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_pix_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'PIX', tipo: 'pix', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_credito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Crédito', tipo: 'cartao_credito', taxa_percentual: 3.2, taxa_fixa: 0, maximo_parcelas: 12, ativo: true, exibir_catalogo: true },
    { id: `fp_debito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Débito', tipo: 'cartao_debito', taxa_percentual: 1.5, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_fiado_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Fiado', tipo: 'fiado', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: false }
  ];

  // Carregar formas de pagamento cadastradas da loja
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
          // Assegura que Fiado esteja na lista se a loja permitir
          if (!lista.some(f => f.tipo === 'fiado')) {
            const fiadoPadrao = FORMAS_PADRAO.find(f => f.tipo === 'fiado');
            if (fiadoPadrao) lista = [...lista, fiadoPadrao];
          }
        }
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

      const fpsDisponiveis = formasPagamento && formasPagamento.length > 0 ? formasPagamento : FORMAS_PADRAO;
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
  }, [pedido?.id, isOpen, concluirAoQuitar]);

  if (!isOpen || !pedido) return null;

  const valorTotal = Number(pedido.valor_total || 0);
  const valorJaPago = Number(pedido.valor_pago || 0);
  const saldoDevedorAtual = Math.max(0, Number(pedido.saldo_devedor ?? (valorTotal - valorJaPago)));

  const totalLinhasPagamento = linhasPagamento.reduce((acc, l) => acc + (Number(l.valor) || 0), 0);
  const diferencaPagamento = Number((saldoDevedorAtual - totalLinhasPagamento).toFixed(2));

  const formasDisponiveis = formasPagamento.length > 0 ? formasPagamento : FORMAS_PADRAO;

  const handleAdicionarLinha = () => {
    const valorRestanteSugerido = diferencaPagamento > 0 ? diferencaPagamento : 0;
    const fpPadrao = formasDisponiveis.find(f => f.tipo === 'pix') || formasDisponiveis[0];

    const novaLinha: LinhaPagamentoRecebimento = {
      id: `linha_${Date.now()}_${Math.random()}`,
      forma_pagamento_id: fpPadrao.id,
      forma_tipo: fpPadrao.tipo,
      forma_nome: fpPadrao.nome,
      valor: Number(valorRestanteSugerido.toFixed(2)),
      valor_entregue: null,
      parcelas: 1
    };

    setLinhasPagamento(prev => [...prev, novaLinha]);
  };

  const handleRemoverLinha = (idLinha: string) => {
    if (linhasPagamento.length <= 1) return;
    setLinhasPagamento(prev => prev.filter(l => l.id !== idLinha));
  };

  const handleAlterarFormaLinha = (idLinha: string, novaForma: FormaPagamento) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id === idLinha) {
        return {
          ...l,
          forma_pagamento_id: novaForma.id,
          forma_tipo: novaForma.tipo,
          forma_nome: novaForma.nome,
          valor_entregue: novaForma.tipo === 'dinheiro' ? l.valor_entregue : null,
          parcelas: novaForma.tipo === 'cartao_credito' ? (l.parcelas || 1) : 1
        };
      }
      return l;
    }));
  };

  const handleAlterarValorLinha = (idLinha: string, novoValor: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id === idLinha) {
        return { ...l, valor: Math.max(0, novoValor) };
      }
      return l;
    }));
  };

  const handleAlterarEntregueLinha = (idLinha: string, novoEntregue: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id === idLinha) {
        return { ...l, valor_entregue: Math.max(0, novoEntregue) };
      }
      return l;
    }));
  };

  const handleAlterarParcelasLinha = (idLinha: string, parcelas: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id === idLinha) {
        return { ...l, parcelas: Math.max(1, parcelas) };
      }
      return l;
    }));
  };

  const handleSalvarPrevisto = async () => {
    if (!pedido || !loja?.id) return;
    const linhasValidas = linhasPagamento.filter(l => Number(l.valor) > 0);
    if (linhasValidas.length === 0) {
      setErroMsg('Informe ao menos uma forma de pagamento com valor maior que zero.');
      return;
    }

    setSalvando(true);
    setErroMsg(null);
    try {
      if (onSalvar) {
        await onSalvar(linhasValidas);
      } else {
        const dataIso = obterDataOperacaoISO();
        await supabase.from('pagamentos_pedido').delete().eq('pedido_id', pedido.id);
        try {
          await supabase.from('pedidos_pagamentos_previstos').delete().eq('pedido_id', pedido.id);
        } catch {}

        const pagamentosParaDb = await Promise.all(linhasValidas.map(async (l) => {
          const fpRealId = await SyncService.resolverFormaPagamentoId(loja.id, l.forma_pagamento_id, l.forma_tipo);
          return {
            loja_id: loja.id,
            pedido_id: pedido.id,
            forma_pagamento_id: fpRealId,
            valor: Number(l.valor),
            parcelas: l.parcelas || 1,
            valor_taxa: 0,
            valor_liquido: Number(l.valor),
            data_pagamento: dataIso,
            eh_pagamento_fiado: l.forma_tipo === 'fiado'
          };
        }));

        const { error: errPag } = await supabase.from('pagamentos_pedido').insert(pagamentosParaDb);
        if (errPag) throw errPag;

        audioService.playBeep();
        onPagamentoConcluido(pedido);
        onClose();
      }
    } catch (err: any) {
      console.error('Erro ao salvar formas de pagamento do pedido:', err);
      setErroMsg(err.message || 'Erro ao salvar formas de pagamento.');
    } finally {
      setSalvando(false);
    }
  };

  const handleConfirmarRecebimento = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);

    const linhasAtivas = linhasPagamento.filter(l => Number(l.valor) > 0);
    if (linhasAtivas.length === 0) {
      setErroMsg('Informe ao menos uma forma de pagamento com valor maior que zero.');
      return;
    }

    if (Math.abs(diferencaPagamento) > 0.01) {
      setErroMsg(`O total das formas de pagamento deve equivaler exatamente ao saldo devedor de R$ ${saldoDevedorAtual.toFixed(2)}.`);
      return;
    }

    setProcessando(true);

    try {
      const dataIso = obterDataOperacaoISO();
      const novoValorPago = Number((valorJaPago + totalLinhasPagamento).toFixed(2));
      const novoSaldoDevedor = Math.max(0, Number((valorTotal - novoValorPago).toFixed(2)));
      const quitado = novoSaldoDevedor <= 0;

      const novoStatusPagamento: StatusPagamento = quitado ? 'pago' : 'parcialmente_pago';

      // 1. Gravar cada pagamento na tabela pagamentos_pedido
      for (const linha of linhasAtivas) {
        const fpRealId = await SyncService.resolverFormaPagamentoId(loja?.id || '', linha.forma_pagamento_id, linha.forma_tipo);
        const fpRef = formasDisponiveis.find(f => f.id === linha.forma_pagamento_id || f.tipo === linha.forma_tipo);
        const taxaPerc = Number(fpRef?.taxa_percentual || 0);
        const taxaValor = Number(((linha.valor * taxaPerc) / 100).toFixed(2));
        const valorLiquido = Number((linha.valor - taxaValor).toFixed(2));

        const { error: erroPag } = await supabase.from('pagamentos_pedido').insert([
          {
            loja_id: loja?.id,
            pedido_id: pedido.id,
            forma_pagamento_id: fpRealId,
            valor: linha.valor,
            parcelas: linha.parcelas || 1,
            valor_taxa: taxaValor,
            valor_liquido: valorLiquido,
            data_pagamento: dataIso,
            eh_pagamento_fiado: linha.forma_tipo === 'fiado'
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
        const isStatusLogistico = ['aguardando_envio', 'em_expedicao', 'enviado'].includes(pedido.status);
        if (!isStatusLogistico) {
          if (concluirAoQuitarCheck) {
            payloadUpdate.status = 'concluido';
          } else if (pedido.status === 'pendente') {
            payloadUpdate.status = 'confirmado';
          }
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

      // 3. Atualizar saldo devedor do cliente se necessário
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

      // 4. Registrar na sessão de caixa ativa para formas não-fiado
      const pagamentosCaixa = linhasAtivas.filter(l => l.forma_tipo !== 'fiado' && Number(l.valor) > 0);
      if (loja?.id && pagamentosCaixa.length > 0) {
        try {
          await caixaService.registrarVendaPedido({
            lojaId: loja.id,
            pedido: pedUpd || pedido,
            pagamentos: pagamentosCaixa.map(l => ({
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
                <span>Pagamento & Fechamento</span>
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
          /* FORMULÁRIO DE RECEBIMENTO */
          <form onSubmit={handleConfirmarRecebimento} className="space-y-4">
            {/* Card de Destaque do Valor Total / Saldo Pendente */}
            <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 text-center space-y-0.5">
              <span className="text-xs text-slate-400 block font-medium">
                {valorJaPago > 0 ? 'Saldo Restante a Quitar' : 'Valor Total da Venda'}
              </span>
              <span className="text-3xl font-black text-emerald-400">
                R$ {saldoDevedorAtual.toFixed(2)}
              </span>
              {valorJaPago > 0 && (
                <div className="flex justify-center items-center gap-3 text-[11px] text-slate-400 pt-0.5">
                  <span>Total: R$ {valorTotal.toFixed(2)}</span>
                  <span>•</span>
                  <span className="text-emerald-400">Já Pago: R$ {valorJaPago.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Linhas de Pagamento */}
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Formas de Pagamento ({linhasPagamento.length})
                </span>
                <button
                  type="button"
                  onClick={handleAdicionarLinha}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Forma</span>
                </button>
              </div>

              {linhasPagamento.map((linha, idx) => (
                <div
                  key={linha.id}
                  className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                    <span>Pagamento #{idx + 1}</span>
                    {linhasPagamento.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoverLinha(linha.id)}
                        className="text-rose-400 hover:text-rose-300 p-1 rounded-lg hover:bg-rose-500/10 transition cursor-pointer"
                        title="Remover linha"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Seleção da Forma de Pagamento (Nomes completos sem corte) */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
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
                          {fp.tipo === 'fiado' && <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                          {fp.tipo !== 'dinheiro' && fp.tipo !== 'pix' && fp.tipo !== 'cartao_debito' && fp.tipo !== 'cartao_credito' && fp.tipo !== 'fiado' && (
                            <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                          <span className="whitespace-nowrap">{fp.nome}</span>
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

                  {/* Cartão de Crédito: Parcelamento */}
                  {linha.forma_tipo === 'cartao_credito' && (
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
                      <span className="text-slate-300 font-medium">Parcelamento:</span>
                      <select
                        value={linha.parcelas || 1}
                        onChange={(e) => handleAlterarParcelasLinha(linha.id, parseInt(e.target.value, 10))}
                        className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(p => (
                          <option key={p} value={p}>
                            {p}x de R$ {(linha.valor / p).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Fiado: Informação de limite de crédito do cliente */}
                  {linha.forma_tipo === 'fiado' && (
                    <div className="pt-1.5 border-t border-slate-800/60 text-[11px] text-amber-300 flex justify-between">
                      <span>Limite Disponível do Cliente:</span>
                      <span className="font-bold">
                        R$ {Number(pedido.cliente?.limite_credito || 0).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Resumo e Balanço de Pagamento */}
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Total Informado nas Formas:</span>
                <span className="font-bold text-slate-200">R$ {totalLinhasPagamento.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold">
                {Math.abs(diferencaPagamento) <= 0.01 ? (
                  <>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Total Balanceado
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

            {/* Botões de Rodapé: [ Cancelar ], [ Salvar ] e [ Confirmar Pagamento ] */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleFecharTudo}
                className="py-3 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={salvando || processando || totalLinhasPagamento <= 0}
                onClick={handleSalvarPrevisto}
                className="flex-1 py-3 px-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-emerald-400 font-bold text-xs border border-emerald-500/40 shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                {salvando ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                ) : (
                  <Save className="w-4 h-4 text-emerald-400" />
                )}
                <span>Salvar</span>
              </button>

              <button
                type="submit"
                disabled={processando || salvando || totalLinhasPagamento <= 0 || Math.abs(diferencaPagamento) > 0.01}
                className="flex-[2] py-3 px-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer active:scale-98"
              >
                {processando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="truncate">Confirmar Pagamento</span>
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
