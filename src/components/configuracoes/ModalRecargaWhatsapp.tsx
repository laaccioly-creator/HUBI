import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Loja } from '../../types';
import {
  RespostaRecargaPixWhatsapp,
  whatsappWalletService,
} from '../../services/whatsappWalletService';
import { formatarMoeda as formatCurrency } from '../../utils/formatters';

interface ModalRecargaWhatsappProps {
  aberto: boolean;
  aoFechar: () => void;
  loja: Loja;
  usuarioId?: string | null;
  custoDisparo?: number;
  valorMinimoRecarga?: number;
  aoConcluirRecarga?: (novoSaldo: number) => void;
}

const OPCOES_RAPIDAS = [15, 30, 50];

export const ModalRecargaWhatsapp: React.FC<ModalRecargaWhatsappProps> = ({
  aberto,
  aoFechar,
  loja,
  usuarioId,
  custoDisparo = 0.15,
  valorMinimoRecarga = 10.0,
  aoConcluirRecarga,
}) => {
  const [valorSelecionado, setValorSelecionado] = useState<number>(30);
  const [valorPersonalizado, setValorPersonalizado] = useState<string>('');
  const [modoPersonalizado, setModoPersonalizado] = useState<boolean>(false);
  const [gerandoPix, setGerandoPix] = useState<boolean>(false);
  const [verificandoPagamento, setVerificandoPagamento] = useState<boolean>(false);
  const [dadosPix, setDadosPix] = useState<RespostaRecargaPixWhatsapp | null>(null);
  const [copiado, setCopiado] = useState<boolean>(false);
  const [pagamentoConfirmado, setPagamentoConfirmado] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) {
      setDadosPix(null);
      setPagamentoConfirmado(false);
      setErro(null);
      setCopiado(false);
    }
  }, [aberto]);

  // Escuta via Supabase Realtime a confirmação da recarga na tabela loja_whatsapp_transacoes e lojas
  useEffect(() => {
    if (!aberto || !dadosPix?.transacaoId || pagamentoConfirmado) return;

    const canal = supabase
      .channel(`recarga_wpp_${dadosPix.transacaoId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'loja_whatsapp_transacoes',
          filter: `id=eq.${dadosPix.transacaoId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const novoRegistro = payload.new as {
            status_pagamento?: string;
            saldo_posterior?: number;
          };
          if (novoRegistro.status_pagamento === 'concluido') {
            setPagamentoConfirmado(true);
            const novoSaldo = Number(
              novoRegistro.saldo_posterior ??
                Number(loja.whatsapp_saldo ?? 0) + dadosPix.valor
            );
            aoConcluirRecarga?.(novoSaldo);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [aberto, dadosPix, pagamentoConfirmado, loja.whatsapp_saldo, aoConcluirRecarga]);

  if (!aberto) return null;

  const valorEfetivo = modoPersonalizado
    ? Number(valorPersonalizado.replace(',', '.')) || 0
    : valorSelecionado;

  const disparosEstimados =
    custoDisparo > 0 ? Math.floor(valorEfetivo / custoDisparo) : 0;

  const handleGerarPix = async () => {
    setErro(null);
    if (!Number.isFinite(valorEfetivo) || valorEfetivo < valorMinimoRecarga) {
      setErro(
        `O valor mínimo para recarga via Pix é de ${formatCurrency(valorMinimoRecarga)}.`
      );
      return;
    }

    setGerandoPix(true);
    try {
      const resposta = await whatsappWalletService.criarRecargaPix(
        loja,
        valorEfetivo,
        usuarioId
      );
      setDadosPix(resposta);
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : 'Não foi possível gerar o QR Code Pix. Tente novamente.'
      );
    } finally {
      setGerandoPix(false);
    }
  };

  const handleCopiarPix = async () => {
    if (!dadosPix?.qrCode) return;
    try {
      await navigator.clipboard.writeText(dadosPix.qrCode);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      // Ignora erro de clipboard
    }
  };

  const handleVerificarPagamento = async () => {
    if (!dadosPix) return;
    setVerificandoPagamento(true);
    setErro(null);
    try {
      // Verifica se o webhook já atualizou a transação no banco
      const { data: tx } = await supabase
        .from('loja_whatsapp_transacoes')
        .select('status_pagamento, saldo_posterior')
        .eq('id', dadosPix.transacaoId)
        .eq('loja_id', loja.id)
        .maybeSingle();

      if (tx?.status_pagamento === 'concluido') {
        setPagamentoConfirmado(true);
        aoConcluirRecarga?.(Number(tx.saldo_posterior ?? 0));
        return;
      }

      // Em homologação/contingência ou confirmação direta, executa a RPC atômica idempotente
      const confirmacao = await whatsappWalletService.confirmarRecargaPixAtomica(
        loja.id,
        dadosPix.transacaoId,
        dadosPix.valor,
        dadosPix.mpPaymentId
      );

      if (confirmacao.sucesso) {
        setPagamentoConfirmado(true);
        aoConcluirRecarga?.(confirmacao.saldoPosterior);
      }
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : 'Pagamento ainda pendente de compensação pelo banco.'
      );
    } finally {
      setVerificandoPagamento(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-100">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Wallet size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Adicionar Créditos WhatsApp
              </h3>
              <p className="text-[11px] text-slate-400">
                Liberação imediata via Pix • Sem mensalidade fixa
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-5 space-y-4">
          {pagamentoConfirmado ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 size={34} />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-black text-white">
                  Recarga Confirmada com Sucesso!
                </h4>
                <p className="text-xs text-slate-300">
                  O valor de{' '}
                  <strong className="text-emerald-400">
                    {formatCurrency(dadosPix?.valor || valorEfetivo)}
                  </strong>{' '}
                  foi creditado na carteira da loja e os envios automáticos já estão ativos.
                </p>
              </div>
              <button
                type="button"
                onClick={aoFechar}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider transition-all"
              >
                Concluir e Voltar
              </button>
            </div>
          ) : !dadosPix ? (
            <>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Escolha o valor da recarga
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {OPCOES_RAPIDAS.map((opcao) => {
                    const ativo = !modoPersonalizado && valorSelecionado === opcao;
                    const qtdDisparos =
                      custoDisparo > 0 ? Math.floor(opcao / custoDisparo) : 0;
                    return (
                      <button
                        key={opcao}
                        type="button"
                        onClick={() => {
                          setModoPersonalizado(false);
                          setValorSelecionado(opcao);
                          setErro(null);
                        }}
                        className={`p-3 rounded-xl border text-center transition-all ${
                          ativo
                            ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-lg shadow-emerald-950/30'
                            : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-base font-black text-emerald-400">
                          R$ {opcao}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          ~{qtdDisparos} envios
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Valor personalizado */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setModoPersonalizado((prev) => !prev)}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-4"
                >
                  {modoPersonalizado
                    ? 'Usar valores rápidos sugeridos'
                    : `Digitar outro valor (mínimo ${formatCurrency(valorMinimoRecarga)})`}
                </button>

                {modoPersonalizado && (
                  <div className="mt-2.5">
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Valor personalizado (R$)
                    </label>
                    <input
                      type="number"
                      min={valorMinimoRecarga}
                      step="1"
                      placeholder={`Ex: ${valorMinimoRecarga.toFixed(2)}`}
                      value={valorPersonalizado}
                      onChange={(e) => setValorPersonalizado(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>

              {/* Resumo de conversão */}
              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Sparkles size={16} className="text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-200">
                      Estimativa de Disparos Ativos
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Tarifa por notificação fora da janela de 24h:{' '}
                      <strong className="text-slate-200">
                        {formatCurrency(custoDisparo)}
                      </strong>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-emerald-400">
                    ~{disparosEstimados} envios
                  </span>
                </div>
              </div>

              {erro && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 font-medium">
                  {erro}
                </div>
              )}

              <button
                type="button"
                onClick={handleGerarPix}
                disabled={gerandoPix || valorEfetivo < valorMinimoRecarga}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950/50"
              >
                {gerandoPix ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Gerando QR Code Pix...
                  </>
                ) : (
                  <>
                    <QrCode size={16} />
                    Gerar Pix de {formatCurrency(valorEfetivo)}
                  </>
                )}
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold">
                  <ShieldCheck size={13} />
                  Aguardando pagamento via Pix ({formatCurrency(dadosPix.valor)})
                </span>
                <p className="text-xs text-slate-400">
                  Escaneie o QR Code ou copie o código Pix abaixo. O saldo será liberado automaticamente.
                </p>
              </div>

              {/* QR Code visual */}
              <div className="flex justify-center">
                {dadosPix.qrCodeBase64 ? (
                  <div className="p-3 bg-white rounded-2xl shadow-inner">
                    <img
                      src={`data:image/png;base64,${dadosPix.qrCodeBase64}`}
                      alt="QR Code Pix Recarga WhatsApp"
                      className="w-44 h-44 object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-44 h-44 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center p-4 text-center gap-2">
                    <QrCode size={48} className="text-emerald-400" />
                    <span className="text-[11px] text-slate-400">
                      Utilize o código Pix Copia e Cola abaixo no aplicativo do seu banco
                    </span>
                  </div>
                )}
              </div>

              {/* Pix Copia e Cola */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Código Pix Copia e Cola
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={dadosPix.qrCode}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono truncate"
                  />
                  <button
                    type="button"
                    onClick={handleCopiarPix}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors"
                  >
                    {copiado ? <Check size={14} /> : <Copy size={14} />}
                    {copiado ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>

              {erro && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                  {erro}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDadosPix(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
                >
                  Alterar Valor
                </button>
                <button
                  type="button"
                  onClick={handleVerificarPagamento}
                  disabled={verificandoPagamento}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors"
                >
                  {verificandoPagamento ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Já Paguei / Confirmar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
