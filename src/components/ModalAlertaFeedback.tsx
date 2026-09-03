import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  X,
  Check
} from 'lucide-react';

export type TipoFeedback = 'sucesso' | 'aviso' | 'erro' | 'info';

export interface ModalAlertaFeedbackProps {
  aberto: boolean;
  onClose: () => void;
  tipo?: TipoFeedback;
  titulo?: string;
  mensagem: string;
  detalhes?: string;
  textoBotaoConfirmar?: string;
  onConfirmar?: () => void;
  mostrarBotaoCancelar?: boolean;
  textoBotaoCancelar?: string;
  onCancelar?: () => void;
}

export const ModalAlertaFeedback: React.FC<ModalAlertaFeedbackProps> = ({
  aberto,
  onClose,
  tipo = 'sucesso',
  titulo,
  mensagem,
  detalhes,
  textoBotaoConfirmar = 'Entendido',
  onConfirmar,
  mostrarBotaoCancelar = false,
  textoBotaoCancelar = 'Cancelar',
  onCancelar
}) => {
  if (!aberto) return null;

  const getEstilosTipo = () => {
    switch (tipo) {
      case 'sucesso':
        return {
          icone: CheckCircle2,
          corIcone: 'text-emerald-400',
          bgIcone: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
          corBorda: 'border-emerald-500/30',
          corBotao: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/25',
          tituloPadrao: 'Sucesso!'
        };
      case 'aviso':
        return {
          icone: AlertTriangle,
          corIcone: 'text-amber-400',
          bgIcone: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
          corBorda: 'border-amber-500/30',
          corBotao: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/25',
          tituloPadrao: 'Atenção'
        };
      case 'erro':
        return {
          icone: XCircle,
          corIcone: 'text-rose-400',
          bgIcone: 'bg-rose-500/20 border-rose-500/30 text-rose-400',
          corBorda: 'border-rose-500/30',
          corBotao: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/25',
          tituloPadrao: 'Erro'
        };
      case 'info':
      default:
        return {
          icone: Info,
          corIcone: 'text-sky-400',
          bgIcone: 'bg-sky-500/20 border-sky-500/30 text-sky-400',
          corBorda: 'border-sky-500/30',
          corBotao: 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-500/25',
          tituloPadrao: 'Informação'
        };
    }
  };

  const estilo = getEstilosTipo();
  const Icone = estilo.icone;

  const handleConfirmar = () => {
    if (onConfirmar) {
      onConfirmar();
    } else {
      onClose();
    }
  };

  const handleCancelar = () => {
    if (onCancelar) {
      onCancelar();
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200 select-none">
      <div
        className={`w-full max-w-md bg-slate-900 border ${estilo.corBorda} rounded-3xl p-6 shadow-2xl shadow-black/60 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200 relative`}
      >
        {/* Botão de Fechar Superior */}
        <button
          type="button"
          onClick={handleCancelar}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Ícone com Halo Suave */}
        <div className="relative pt-1">
          <div
            className={`w-16 h-16 rounded-3xl border ${estilo.bgIcone} flex items-center justify-center shadow-lg transition-transform`}
          >
            <Icone className="w-9 h-9" />
          </div>
        </div>

        {/* Textos */}
        <div className="space-y-1.5 px-2">
          <h3 className="text-lg font-black text-slate-100 tracking-tight">
            {titulo || estilo.tituloPadrao}
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed font-medium">
            {mensagem}
          </p>
          {detalhes && (
            <p className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 mt-2 font-mono">
              {detalhes}
            </p>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-3 w-full pt-3">
          {mostrarBotaoCancelar && (
            <button
              type="button"
              onClick={handleCancelar}
              className="flex-1 py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs border border-slate-700 transition cursor-pointer active:scale-95"
            >
              {textoBotaoCancelar}
            </button>
          )}

          <button
            type="button"
            onClick={handleConfirmar}
            className={`flex-1 py-3 px-4 rounded-2xl font-black text-xs shadow-lg flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 ${estilo.corBotao}`}
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{textoBotaoConfirmar}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
