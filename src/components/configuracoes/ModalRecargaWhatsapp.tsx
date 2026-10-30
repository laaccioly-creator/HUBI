import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
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
import { useTheme } from '../../contexts/ThemeContext';
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
  const { isDark } = useTheme();
  const [valorSelecionado, setValorSelecionado] = useState<number>(30);
  const [valorPersonalizado, setValorPersonalizado] = useState<string>('');
  const [modoPersonalizado, setModoPersonalizado] = useState<boolean>(false);
  const [iniciandoCheckout, setIniciandoCheckout] = useState<boolean>(false);
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

  const aoConcluirRecargaRef = useRef(aoConcluirRecarga);
  useEffect(() => {
    aoConcluirRecargaRef.current = aoConcluirRecarga;
  }, [aoConcluirRecarga]);

  // Escuta via Supabase Realtime a confirmação da recarga na tabela loja_whatsapp_transacoes e lojas
  useEffect(() => {
    if (!aberto || !dadosPix?.transacaoId || pagamentoConfirmado) return;

    const sufixoUnico = Math.random().toString(36).substring(2, 9);
    const nomeCanal = `recarga_wpp_${dadosPix.transacaoId}_${sufixoUnico}`;
    let canal: ReturnType<typeof supabase.channel> | null = null;

    try {
      canal = supabase
        .channel(nomeCanal)
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
              aoConcluirRecargaRef.current?.(novoSaldo);
            }
          }
        )
        .subscribe();
    } catch {
      // Ignora erro caso o canal já esteja ativo
    }

    return () => {
      if (canal) {
        supabase.removeChannel(canal).catch(() => {});
      }
    };
  }, [aberto, dadosPix?.transacaoId, dadosPix?.valor, pagamentoConfirmado, loja.whatsapp_saldo]);

  if (!aberto) return null;

  const valorEfetivo = modoPersonalizado
    ? Number(valorPersonalizado.replace(',', '.')) || 0
    : valorSelecionado;

  const disparosEstimados =
    custoDisparo > 0 ? Math.floor(valorEfetivo / custoDisparo) : 0;

  const handleRecarregarMercadoPago = async () => {
    setErro(null);
    if (!Number.isFinite(valorEfetivo) || valorEfetivo < valorMinimoRecarga) {
      setErro(
        `O valor mínimo para recarga é de ${formatCurrency(valorMinimoRecarga)}.`
      );
      return;
    }

    setIniciandoCheckout(true);
    try {
      const res = await whatsappWalletService.criarRecargaMercadoPago(
        loja,
        valorEfetivo,
        usuarioId
      );

      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        throw new Error('Link de checkout do Mercado Pago não retornado.');
      }
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : 'Não foi possível iniciar o checkout do Mercado Pago. Tente novamente.'
      );
      setIniciandoCheckout(false);
    }
  };

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
      <div
        className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
          isDark
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Cabeçalho */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isDark
              ? 'bg-slate-950/60 border-slate-800'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
              <Wallet size={18} />
            </div>
            <div>
              <h3 className={`text-sm font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Adicionar Créditos WhatsApp
              </h3>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Checkout Pro • Pix, Cartão ou Boleto • Sem mensalidade fixa
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark
                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-5 space-y-4">
          {pagamentoConfirmado ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-500 flex items-center justify-center mx-auto">
                <CheckCircle2 size={34} />
              </div>
              <div className="space-y-1">
                <h4 className={`text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Recarga Confirmada com Sucesso!
                </h4>
                <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  O valor de{' '}
                  <strong className="text-emerald-500 font-bold">
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
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
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
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold shadow-md shadow-emerald-500/10'
                            : isDark
                            ? 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-base font-black text-emerald-600 dark:text-emerald-400">
                          R$ {opcao}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
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
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline underline-offset-4"
                >
                  {modoPersonalizado
                    ? 'Usar valores rápidos sugeridos'
                    : `Digitar outro valor (mínimo ${formatCurrency(valorMinimoRecarga)})`}
                </button>

                {modoPersonalizado && (
                  <div className="mt-2.5">
                    <label className={`block text-[11px] font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      Valor personalizado (R$)
                    </label>
                    <input
                      type="number"
                      min={valorMinimoRecarga}
                      step="1"
                      placeholder={`Ex: ${valorMinimoRecarga.toFixed(2)}`}
                      value={valorPersonalizado}
                      onChange={(e) => setValorPersonalizado(e.target.value)}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-bold focus:outline-none focus:border-emerald-500 ${
                        isDark
                          ? 'bg-slate-950 border-slate-700 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                )}
              </div>

              {/* Resumo de conversão */}
              <div
                className={`rounded-xl border p-3.5 flex items-center justify-between ${
                  isDark
                    ? 'bg-slate-950/80 border-slate-800'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles size={16} className="text-emerald-500 shrink-0" />
                  <div>
                    <div className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      Estimativa de Disparos Ativos
                    </div>
                    <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Tarifa por notificação fora da janela:{' '}
                      <strong className={isDark ? 'text-slate-200' : 'text-slate-700'}>
                        {formatCurrency(custoDisparo)}
                      </strong>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                    ~{disparosEstimados} envios
                  </span>
                </div>
              </div>

              {erro && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500 font-medium">
                  {erro}
                </div>
              )}

              <button
                type="button"
                onClick={handleRecarregarMercadoPago}
                disabled={iniciandoCheckout || valorEfetivo < valorMinimoRecarga}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950/20 active:scale-[0.99]"
              >
                {iniciandoCheckout ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Iniciando Mercado Pago...
                  </>
                ) : (
                  <>
                    <CreditCard size={16} />
                    Recarregar {formatCurrency(valorEfetivo)} via Mercado Pago
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
                  <div className={`w-44 h-44 rounded-2xl border flex flex-col items-center justify-center p-4 text-center gap-2 ${
                    isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <QrCode size={48} className="text-emerald-500" />
                    <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Utilize o código Pix Copia e Cola abaixo no aplicativo do seu banco
                    </span>
                  </div>
                )}
              </div>

              {/* Pix Copia e Cola */}
              <div>
                <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  Código Pix Copia e Cola
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={dadosPix.qrCode}
                    className={`flex-1 px-3 py-2 rounded-xl border text-[11px] font-mono truncate ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-slate-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
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
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500">
                  {erro}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDadosPix(null)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                    isDark
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
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
