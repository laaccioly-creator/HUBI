import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  X,
  Check
} from 'lucide-react';
import { useRegisterOverlay } from '../hooks/useRegisterOverlay';
import { useTheme } from '../contexts/ThemeContext';

export type TipoFeedback = 'sucesso' | 'aviso' | 'erro' | 'info';

export interface ModalAlertaFeedbackProps {
  aberto: boolean;
  onClose: () => void;
  tipo?: TipoFeedback;
  variante?: 'padrao' | 'saida_sem_salvar';
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
  variante = 'padrao',
  titulo,
  mensagem,
  detalhes,
  textoBotaoConfirmar = 'Entendido',
  onConfirmar,
  mostrarBotaoCancelar = false,
  textoBotaoCancelar = 'Cancelar',
  onCancelar
}) => {
  const { isDark } = useTheme();
  const handleCancelar = () => {
    if (onCancelar) {
      onCancelar();
    } else {
      onClose();
    }
  };

  useRegisterOverlay(aberto, handleCancelar, 'modal-alerta-feedback');

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
          corBotao: variante === 'saida_sem_salvar'
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/25'
            : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/25',
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
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200 select-none">
      <div
        className={`w-full max-w-md border ${estilo.corBorda} rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200 relative ${
          isDark ? 'bg-slate-900 shadow-black/60 text-white' : 'bg-white shadow-slate-300/60 text-slate-900 border-slate-200'
        }`}
      >
        {/* Botão de Fechar Superior */}
        <button
          type="button"
          onClick={handleCancelar}
          className={`absolute top-4 right-4 p-1.5 rounded-xl transition cursor-pointer ${
            isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
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
          <h3 className={`text-lg font-black tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {titulo || estilo.tituloPadrao}
          </h3>
          <p className={`text-sm leading-relaxed font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {mensagem}
          </p>
          {detalhes && (
            <p className={`text-xs p-2.5 rounded-xl border mt-2 font-mono ${
              isDark ? 'text-slate-400 bg-slate-950/60 border-slate-800/80' : 'text-slate-600 bg-slate-50 border-slate-200'
            }`}>
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
              className={`flex-1 py-3 px-4 rounded-2xl font-bold text-xs border transition cursor-pointer active:scale-95 ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
              }`}
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
