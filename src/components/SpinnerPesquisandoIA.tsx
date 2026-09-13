import React from 'react';
import { Sparkles } from 'lucide-react';

interface SpinnerPesquisandoIAProps {
  texto?: string;
  subtexto?: string;
  fullScreen?: boolean;
}

export const SpinnerPesquisandoIA: React.FC<SpinnerPesquisandoIAProps> = ({
  texto = 'Pesquisando',
  subtexto,
  fullScreen = false
}) => {
  const content = (
    <div className="flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-200">
      <div className="relative w-32 h-32 flex items-center justify-center">
        {/* Anel giratório externo */}
        <div className="absolute inset-0 rounded-full border-4 border-teal-500/20 border-t-teal-400 border-r-indigo-500 animate-spin" />
        
        {/* Anel intermediário com pontilhado girando no sentido oposto */}
        <div
          className="absolute inset-2 rounded-full border-2 border-dashed border-teal-300/40 animate-spin"
          style={{ animationDirection: 'reverse', animationDuration: '7s' }}
        />

        {/* Pulso de onda tipo radar de fundo */}
        <div className="absolute inset-3 rounded-full bg-teal-400/10 animate-ping opacity-30 pointer-events-none" />

        {/* Círculo central destacado com o nome 'Pesquisando' dentro */}
        <div className="relative z-10 w-22 h-22 rounded-full bg-slate-900/95 text-white flex flex-col items-center justify-center shadow-2xl border-2 border-teal-400/50 p-2">
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse mb-1" />
          <span className="text-[11px] font-black tracking-wider text-teal-300 uppercase leading-tight text-center drop-shadow-sm">
            {texto}
          </span>
        </div>
      </div>

      {subtexto && (
        <p className="mt-3.5 text-xs font-semibold text-slate-300 max-w-xs animate-pulse leading-relaxed bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-700/60 shadow-md">
          {subtexto}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
        <div className="bg-slate-900/90 border border-slate-700/80 rounded-3xl p-4 shadow-2xl">
          {content}
        </div>
      </div>
    );
  }

  return content;
};
