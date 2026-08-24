import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  Banknote,
  Zap,
  FileText,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Printer,
  Share2,
  User,
  Calculator
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Pedido, FormaPagamento, StatusPagamento } from '../types';
import { PrintService } from '../services/printService';
import { SyncService } from '../services/syncService';
import { audioService } from '../services/audioService';

interface ModalReceberPagamentoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  onPagamentoConcluido: () => void;
}

export const ModalReceberPagamento: React.FC<ModalReceberPagamentoProps> = ({
  isOpen,
  onClose,
  pedido,
  onPagamentoConcluido
}) => {
  const { loja, usuario } = useAuth();
  const permissions = usePermissions();

  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [formaEscolhida, setFormaEscolhida] = useState<FormaPagamento | null>(null);
  const [valorReceber, setValorReceber] = useState<string>('');
  const [valorEntregueDinheiro, setValorEntregueDinheiro] = useState<string>('');
  const [parcelasCartao, setParcelasCartao] = useState<number>(1);
  const [processando, setProcessando] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [sucessoModal, setSucessoModal] = useState<boolean>(false);
  const [pedidoAtualizado, setPedidoAtualizado] = useState<Pedido | null>(null);

  const FORMAS_PADRAO: FormaPagamento[] = [
    { id: `fp_dinheiro_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Dinheiro', tipo: 'dinheiro', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_pix_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Pix (Imediato)', tipo: 'pix', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_debito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Débito', tipo: 'cartao_debito', taxa_percentual: 1.5, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_credito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Crédito', tipo: 'cartao_credito', taxa_percentual: 3.2, taxa_fixa: 0, maximo_parcelas: 12, ativo: true, exibir_catalogo: true },
    { id: `fp_fiado_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Fiado / A Prazo', tipo: 'fiado', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: false }
  ];

  // Carregar formas de pagamento cadastradas
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

        if (!error && data && data.length > 0) {
          setFormasPagamento(data);
          setFormaEscolhida(data[0]);
        } else {
          setFormasPagamento(FORMAS_PADRAO);
          setFormaEscolhida(FORMAS_PADRAO[0]);
        }
      } catch (err) {
        console.warn('Fallback formas de pagamento:', err);
        setFormasPagamento(FORMAS_PADRAO);
        setFormaEscolhida(FORMAS_PADRAO[0]);
      }
    };

    buscarFormas();
  }, [loja?.id, isOpen]);

  // Inicializar valores com base no saldo devedor do pedido
  useEffect(() => {
    if (pedido && isOpen) {
      const valorTotal = Number(pedido.valor_total || 0);
      const valorJaPago = Number(pedido.valor_pago || 0);
      const saldoRestante = Number(pedido.saldo_devedor ?? (valorTotal - valorJaPago));
      const valorSugerido = saldoRestante > 0 ? saldoRestante : (valorTotal > 0 ? valorTotal : 0);

      setValorReceber(valorSugerido.toFixed(2));
      setValorEntregueDinheiro('');
      setParcelasCartao(1);
      setErroMsg(null);
      setSucessoModal(false);
      setPedidoAtualizado(null);
    }
  }, [pedido, isOpen]);

  if (!isOpen || !pedido) return null;

  const valorTotal = Number(pedido.valor_total || 0);
  const valorJaPago = Number(pedido.valor_pago || 0);
  const saldoDevedorAtual = Math.max(0, valorTotal - valorJaPago);
  const valorInformado = parseFloat(valorReceber.replace(',', '.')) || 0;
  const valorEntregueNum = parseFloat(valorEntregueDinheiro.replace(',', '.')) || 0;
  const trocoCalculado = Math.max(0, valorEntregueNum - valorInformado);

  const handleConfirmarRecebimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || !pedido.id) return;

    if (valorInformado <= 0) {
      setErroMsg('Informe um valor válido a receber maior que zero.');
      return;
    }

    const fpFinal = formaEscolhida || formasPagamento[0] || FORMAS_PADRAO[0];
    const ehFiado = fpFinal.tipo === 'fiado';

    try {
      setProcessando(true);
      setErroMsg(null);

      const taxaValor = (valorInformado * Number(fpFinal.taxa_percentual || 0)) / 100;
      const valorLiquido = valorInformado - taxaValor;
      const dataIso = new Date().toISOString();

      // Resolver ID real da forma de pagamento
      const fpIdReal = await SyncService.resolverFormaPagamentoId(
        loja.id,
        fpFinal.id,
        fpFinal.tipo
      );

      // Calcular novos valores consolidados do pedido
      const novoValorPago = valorJaPago + (ehFiado ? 0 : valorInformado);
      const novoSaldoDevedor = Math.max(0, valorTotal - novoValorPago);
      const quitado = novoSaldoDevedor <= 0;
      const novoStatusPagamento: StatusPagamento = quitado
        ? 'pago'
        : novoValorPago > 0
        ? 'parcialmente_pago'
        : 'aguardando_pagamento';

      // 1. Inserir pagamento em pagamentos_pedido se houver valor financeiro
      if (!ehFiado && valorInformado > 0) {
        const { error: erroPag } = await supabase.from('pagamentos_pedido').insert([
          {
            loja_id: loja.id,
            pedido_id: pedido.id,
            forma_pagamento_id: fpIdReal,
            valor: valorInformado,
            parcelas: parcelasCartao,
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
        valor_pago: novoValorPago,
        saldo_devedor: novoSaldoDevedor,
        status_pagamento: novoStatusPagamento,
        fiado_quitado: quitado,
        atualizado_em: dataIso
      };

      const { data: pedUpd, error: erroUpd } = await supabase
        .from('pedidos')
        .update(payloadUpdate)
        .eq('id', pedido.id)
        .select(`
          *,
          cliente:clientes(*),
          vendedor:usuarios_loja(*),
          itens:itens_pedido(*),
          pagamentos:pagamentos_pedido(*)
        `)
        .single();

      if (erroUpd) throw erroUpd;

      // 3. Atualizar saldo devedor do cliente se for fiado/abatimento
      if (pedido.cliente_id) {
        try {
          const { data: cliData } = await supabase
            .from('clientes')
            .select('saldo_devedor_fiado')
            .eq('id', pedido.cliente_id)
            .single();

          if (cliData) {
            const debitoCli = Number(cliData.saldo_devedor_fiado || 0);
            const novoDebitoCli = Math.max(0, debitoCli - valorInformado);
            await supabase
              .from('clientes')
              .update({ saldo_devedor_fiado: novoDebitoCli })
              .eq('id', pedido.cliente_id);
          }
        } catch (cliErr) {
          console.warn('Aviso ao abater fiado do cliente:', cliErr);
        }
      }

      audioService.playNewOrderSound();
      setPedidoAtualizado((pedUpd as unknown as Pedido) || { ...pedido, ...payloadUpdate });
      setSucessoModal(true);
      onPagamentoConcluido();
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
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-150 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 font-bold flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">
                Receber Pagamento #{pedido.origem === 'catalogo_online' ? `c-${pedido.numero_pedido}` : pedido.numero_pedido}
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
                O valor de <span className="text-emerald-400 font-bold">R$ {valorInformado.toFixed(2)}</span> foi registrado no pedido.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs space-y-1.5 text-left max-w-sm mx-auto">
              <div className="flex justify-between text-slate-400">
                <span>Total do Pedido:</span>
                <span className="font-semibold text-slate-200">R$ {valorTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-400">
                <span>Total Pago até agora:</span>
                <span className="font-bold">R$ {(valorJaPago + valorInformado).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800">
                <span>Saldo Devedor Restante:</span>
                <span className={`font-bold ${Math.max(0, valorTotal - (valorJaPago + valorInformado)) <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  R$ {Math.max(0, valorTotal - (valorJaPago + valorInformado)).toFixed(2)}
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

            {/* Seleção do Meio de Pagamento */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">Forma de Pagamento:</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {formasPagamento
                  .filter(fp => permissions.podeAtivarFiado || fp.tipo !== 'fiado')
                  .map((fp) => {
                    const estaSel = formaEscolhida?.id === fp.id || (!formaEscolhida && fp.tipo === 'dinheiro');
                    return (
                      <button
                        key={fp.id}
                        type="button"
                        onClick={() => setFormaEscolhida(fp)}
                        className={`p-2.5 rounded-2xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95 ${
                          estaSel
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-2 ring-emerald-500/30 shadow-md'
                            : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {fp.tipo === 'dinheiro' && <Banknote className="w-4 h-4 text-emerald-400" />}
                        {fp.tipo === 'pix' && <Zap className="w-4 h-4 text-cyan-400" />}
                        {fp.tipo === 'cartao_debito' && <CreditCard className="w-4 h-4 text-blue-400" />}
                        {fp.tipo === 'cartao_credito' && <CreditCard className="w-4 h-4 text-purple-400" />}
                        {fp.tipo === 'fiado' && <FileText className="w-4 h-4 text-amber-400" />}
                        {fp.tipo !== 'dinheiro' && fp.tipo !== 'pix' && fp.tipo !== 'cartao_debito' && fp.tipo !== 'cartao_credito' && fp.tipo !== 'fiado' && (
                          <CreditCard className="w-4 h-4 text-slate-400" />
                        )}
                        <span className="truncate max-w-full text-[11px]">{fp.nome}</span>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Valor a Receber */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Valor a Receber Agora (R$):</span>
                {saldoDevedorAtual > 0 && (
                  <button
                    type="button"
                    onClick={() => setValorReceber(saldoDevedorAtual.toFixed(2))}
                    className="text-[10px] text-emerald-400 hover:underline font-semibold cursor-pointer"
                  >
                    Quitar Saldo Total (R$ {saldoDevedorAtual.toFixed(2)})
                  </button>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">R$</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  max={valorTotal}
                  value={valorReceber}
                  onChange={(e) => setValorReceber(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-emerald-500/50 rounded-2xl text-lg font-black text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            {/* Dinheiro: Cálculo de Troco */}
            {formaEscolhida?.tipo === 'dinheiro' && (
              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400 font-medium">Valor Entregue pelo Cliente:</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={valorEntregueDinheiro}
                    onChange={(e) => setValorEntregueDinheiro(e.target.value)}
                    className="w-28 bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1 text-right text-xs font-bold text-slate-100 focus:outline-none"
                  />
                </div>
                {valorEntregueNum > 0 && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-xs">
                    <span className="text-slate-400 font-medium">Troco a Devolver:</span>
                    <span className={`font-black text-sm ${trocoCalculado > 0 ? 'text-amber-400 font-mono' : 'text-slate-500'}`}>
                      R$ {trocoCalculado.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Cartão de Crédito: Parcelas */}
            {formaEscolhida?.tipo === 'cartao_credito' && (
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Número de Parcelas:</span>
                <select
                  value={parcelasCartao}
                  onChange={(e) => setParcelasCartao(Number(e.target.value))}
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl px-3 py-1.5 focus:outline-none"
                >
                  {Array.from({ length: formaEscolhida.maximo_parcelas || 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}x de R$ {(valorInformado / n).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleFecharTudo}
                className="flex-1 py-3 rounded-2xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={processando || valorInformado <= 0}
                className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                {processando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Registrando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar Recebimento</span>
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
