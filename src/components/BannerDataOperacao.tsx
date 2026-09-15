import React from 'react';
import { Calendar, RotateCcw, Edit3, AlertTriangle } from 'lucide-react';
import { useDataOperacao } from '../contexts/DataOperacaoContext';

export const BannerDataOperacao: React.FC = () => {
  const {
    ehOwner,
    modoSimulacaoAtivo,
    dataOperacaoFormatada,
    abrirModal,
    restaurarParaHoje
  } = useDataOperacao();

  // Exclusivo para Owner e apenas quando o modo de data simulada estiver ligado
  if (!ehOwner || !modoSimulacaoAtivo) return null;

  return (
    <div className="w-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-slate-950 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-md z-40 shrink-0 border-b border-amber-600/50">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-7 h-7 rounded-xl bg-slate-950/15 flex items-center justify-center shrink-0">
          <Calendar className="w-4 h-4 text-slate-950" />
        </span>
        <div className="flex items-center gap-2 flex-wrap text-xs sm:text-sm font-black">
          <span className="bg-slate-950 text-amber-400 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider">
            Modo Retroativo Ativo
          </span>
          <span className="truncate">
            Operando em: <span className="underline decoration-slate-950/40 decoration-2">{dataOperacaoFormatada}</span>
          </span>
          <span className="text-[11px] font-semibold text-slate-900/80 hidden md:inline">
            (Todas as vendas, caixas e pagamentos serão gravados nesta data)
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto shrink-0">
        <button
          type="button"
          onClick={abrirModal}
          className="px-3 py-1 rounded-xl bg-slate-950 hover:bg-slate-900 text-amber-300 hover:text-amber-200 text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>Trocar Dia</span>
        </button>

        <button
          type="button"
          onClick={restaurarParaHoje}
          className="px-3 py-1 rounded-xl bg-slate-950/20 hover:bg-slate-950/30 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer"
          title="Restaurar para a data oficial do Supabase em tempo real"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Voltar para Hoje</span>
        </button>
      </div>
    </div>
  );
};
