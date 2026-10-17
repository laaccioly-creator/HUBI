import React, { useState } from 'react';
import { Sparkles, Clock, AlertTriangle, ArrowRight, Loader2, X, ShieldCheck } from 'lucide-react';
import { useAssinaturaStatus } from '../../hooks/useAssinaturaStatus';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

export const BannerAssinaturaTop: React.FC = () => {
  const { isDark } = useTheme();
  const { loja } = useAuth();
  const {
    deveExibirBanner,
    tipoBanner,
    diasRestantesTrial,
    diasRestantesAnuidade,
    iniciarCheckoutAssinatura,
    carregandoCheckout,
    erroCheckout
  } = useAssinaturaStatus();

  const [dispensado, setDispensado] = useState<boolean>(false);

  // Não renderiza se não houver alerta ou se o usuário dispensou temporariamente (apenas se faltarem > 2 dias)
  if (!deveExibirBanner) return null;
  const podeDispensar = (tipoBanner === 'trial' && diasRestantesTrial > 2) || (tipoBanner === 'renovacao' && diasRestantesAnuidade > 3);
  if (dispensado && podeDispensar) return null;

  const handleCheckout = () => {
    iniciarCheckoutAssinatura();
  };

  if (tipoBanner === 'trial') {
    return (
      <div className="relative z-40 bg-[#7F1D1D] border-b border-red-800 text-white px-3 py-2 text-xs shadow-md transition-all">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <div className="p-1 rounded-full bg-white/15 shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
            </div>
            <div className="leading-tight text-white">
              <span className="font-extrabold tracking-wide">Período de Degustação Gratuito:</span>{' '}
              <span>
                Restam <strong className="underline underline-offset-2 font-black text-white">{diasRestantesTrial} {diasRestantesTrial === 1 ? 'dia' : 'dias'}</strong> na loja{' '}
                <strong className="font-extrabold text-white">{loja?.nome_fantasia}</strong>. Garanta o plano anual por apenas{' '}
                <strong className="font-black text-white underline decoration-white/60">R$ 49,90/mês</strong>.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {erroCheckout && (
              <span className="text-[11px] text-white font-semibold bg-black/40 border border-white/20 px-2 py-0.5 rounded">
                {erroCheckout}
              </span>
            )}

            <button
              type="button"
              onClick={handleCheckout}
              disabled={carregandoCheckout}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-[#7F1D1D] font-extrabold hover:bg-red-50 active:scale-95 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {carregandoCheckout ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-[#7F1D1D]" />
                  <span>Gerando Checkout...</span>
                </>
              ) : (
                <>
                  <span>Assinar Agora</span>
                  <ArrowRight className="w-3 h-3" />
                </>
              )}
            </button>

            {podeDispensar && (
              <button
                type="button"
                onClick={() => setDispensado(true)}
                title="Fechar aviso temporariamente"
                className="p-1 rounded-md hover:bg-white/20 text-white/90 hover:text-white transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (tipoBanner === 'renovacao') {
    return (
      <div className="relative z-40 bg-[#7F1D1D] border-b border-red-800 text-white px-3 py-2 text-xs shadow-md transition-all">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <div className="p-1 rounded-full bg-white/15 shrink-0">
              <Clock className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="leading-tight text-white">
              <span className="font-extrabold tracking-wide">Aviso de Renovação:</span>{' '}
              <span>
                A anuidade de <strong className="font-extrabold text-white">{loja?.nome_fantasia}</strong> vence em{' '}
                <strong className="underline underline-offset-2 font-black text-white">{diasRestantesAnuidade} {diasRestantesAnuidade === 1 ? 'dia' : 'dias'}</strong>.
                Renove agora por +1 ano e mantenha a operação sem risco de pausa.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {erroCheckout && (
              <span className="text-[11px] text-white font-semibold bg-black/40 border border-white/20 px-2 py-0.5 rounded">
                {erroCheckout}
              </span>
            )}

            <button
              type="button"
              onClick={handleCheckout}
              disabled={carregandoCheckout}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-[#7F1D1D] font-extrabold hover:bg-red-50 active:scale-95 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {carregandoCheckout ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-[#7F1D1D]" />
                  <span>Gerando Checkout...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-[#7F1D1D]" />
                  <span>Renovar por 1 Ano</span>
                </>
              )}
            </button>

            {podeDispensar && (
              <button
                type="button"
                onClick={() => setDispensado(true)}
                title="Fechar aviso temporariamente"
                className="p-1 rounded-md hover:bg-white/20 text-white/90 hover:text-white transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};
