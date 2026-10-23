import React from 'react';
import {
  Lock,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Building2,
  LogOut,
  CreditCard,
  QrCode,
  ShieldCheck,
  X
} from 'lucide-react';
import { useAssinaturaStatus } from '../../hooks/useAssinaturaStatus';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

interface TelaBloqueioAssinaturaProps {
  aberturaManual?: boolean;
  onCloseManual?: () => void;
}

export const TelaBloqueioAssinatura: React.FC<TelaBloqueioAssinaturaProps> = ({
  aberturaManual = false,
  onCloseManual
}) => {
  const { isDark } = useTheme();
  const { loja, lojasDisponiveis, selecionarLoja, desconectarPdv } = useAuth();
  const { estaBloqueada, iniciarCheckoutAssinatura, carregandoCheckout, erroCheckout } = useAssinaturaStatus();

  if (!estaBloqueada && !aberturaManual) return null;

  // Lojas alternativas do conglomerado que não estão bloqueadas
  const outrasLojasAtivas = lojasDisponiveis.filter(
    (l) => l.id !== loja?.id && l.status_assinatura !== 'bloqueado'
  );

  const handleDesbloquear = () => {
    iniciarCheckoutAssinatura();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md overflow-y-auto animate-in fade-in duration-300">
      <div
        className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden my-auto relative ${
          isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* BOTÃO FECHAR SE ABERTO MANUALMENTE */}
        {aberturaManual && onCloseManual && (
          <button
            type="button"
            onClick={onCloseManual}
            className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* CABEÇALHO DO BLOQUEIO OU ASSINATURA */}
        <div className={`p-6 sm:p-8 text-white text-center relative ${
          aberturaManual
            ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700'
            : 'bg-gradient-to-r from-rose-600 via-amber-600 to-emerald-600'
        }`}>
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-3 shadow-lg border border-white/30">
            {aberturaManual ? <Sparkles className="w-8 h-8 text-white" /> : <Lock className="w-8 h-8 text-white" />}
          </div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-black/30 backdrop-blur-xs mb-2">
            {aberturaManual ? 'Oferta Especial' : 'Período Expirado'}
          </span>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
            {aberturaManual ? 'Garanta sua Assinatura HUBI Pro' : 'Assinatura da Loja Pausada'}
          </h2>
          <p className="text-white/90 text-sm mt-1 max-w-md mx-auto">
            {aberturaManual ? (
              <>Tenha acesso ilimitado para a unidade <strong>{loja?.nome_fantasia}</strong> por apenas R$ 49,90/mês.</>
            ) : (
              <>O período de operação da unidade <strong>{loja?.nome_fantasia}</strong> terminou. Ative o plano anual para desbloquear o PDV e os relatórios imediatamente.</>
            )}
          </p>
        </div>

        {/* CORPO PRINCIPAL COM PLANO COMERCIAL */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* CARD DO PLANO ANUAL */}
          <div
            className={`p-5 rounded-2xl border relative overflow-hidden ${
              isDark ? 'bg-slate-800/60 border-emerald-500/30' : 'bg-emerald-50/50 border-emerald-500/40'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500 text-slate-950 uppercase tracking-wider">
                    Plano Anual HUBI
                  </span>
                  <span className="text-xs text-emerald-500 font-semibold flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Acesso Ilimitado
                  </span>
                </div>
                <h3 className="text-xl font-black mt-2">
                  R$ 49,90 <span className="text-xs font-normal text-slate-400">/mês</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Faturado anualmente em R$ 598,80 (em até 12x no cartão ou Pix).
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <CreditCard className="w-4 h-4 text-emerald-500" />
                  <span>Até 12x</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <QrCode className="w-4 h-4 text-emerald-500" />
                  <span>Pix Imediato</span>
                </div>
              </div>
            </div>

            {/* BENEFÍCIOS INCLUSOS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-700/40 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Frente de Caixa (PDV) de alta velocidade</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Catálogo Online integrado ao WhatsApp</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Controle de Fiado com Limite de Crédito</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Grade de Variações em 2 Eixos e Estoque</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Cockpit Executivo & Assistente Rubi IA</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Desbloqueio em tempo real via Realtime</span>
              </div>
            </div>
          </div>

          {/* MENSAGEM DE ERRO SE OCORRER NO CHECKOUT */}
          {erroCheckout && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-medium">
              {erroCheckout}
            </div>
          )}

          {/* BOTÃO PRIMÁRIO DE DESBLOQUEIO VIA MERCADO PAGO */}
          <button
            type="button"
            onClick={handleDesbloquear}
            disabled={carregandoCheckout}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black text-sm shadow-xl shadow-emerald-500/20 active:scale-[0.99] transition disabled:opacity-50 cursor-pointer"
          >
            {carregandoCheckout ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Conectando ao Checkout Mercado Pago...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5" />
                <span>Desbloquear Agora via Mercado Pago (12x R$ 49,90)</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* ISOLAMENTO MULTI-LOJAS: ALTERNÂNCIA PARA OUTRAS UNIDADES ATIVAS DO CONGLOMERADO */}
          {outrasLojasAtivas.length > 0 && (
            <div className="pt-4 border-t border-slate-700/40">
              <span className="text-xs font-semibold text-slate-400 block mb-2">
                Suas outras unidades continuam ativas. Deseja alternar a operação?
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {outrasLojasAtivas.map((outra) => (
                  <button
                    key={outra.id}
                    type="button"
                    onClick={() => selecionarLoja(outra.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium transition cursor-pointer text-left ${
                      isDark
                        ? 'bg-slate-800/80 border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800'
                        : 'bg-slate-50 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="truncate">{outra.nome_fantasia}</span>
                    </div>
                    <span className="text-[10px] text-emerald-500 font-bold shrink-0 ml-1">
                      Operar &rarr;
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* BOTÃO DE SAÍDA / TROCA DE CONTA */}
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={desconectarPdv}
              className="flex items-center gap-2 text-xs text-slate-400 hover:text-rose-400 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair da conta ou trocar de operador</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
