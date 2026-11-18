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
          corIcone: 'text-emerald-600 dark:text-emerald-400',
          bgIcone: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
          corBotao: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/25',
          tituloPadrao: 'Sucesso!'
        };
      case 'aviso':
        return {
          icone: AlertTriangle,
          corIcone: 'text-amber-600 dark:text-amber-400',
          bgIcone: 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400',
          corBotao: variante === 'saida_sem_salvar'
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/25'
            : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/25',
          tituloPadrao: 'Atenção'
        };
      case 'erro':
        return {
          icone: XCircle,
          corIcone: 'text-rose-600 dark:text-rose-400',
          bgIcone: 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400',
          corBotao: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/25',
          tituloPadrao: 'Erro'
        };
      case 'info':
      default:
        return {
          icone: Info,
          corIcone: 'text-sky-600 dark:text-sky-400',
          bgIcone: 'bg-sky-500/15 border-sky-500/40 text-sky-600 dark:text-sky-400',
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
        className={`w-full max-w-md bg-white dark:bg-black border-2 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200 relative ${
          isDark ? 'shadow-black/80' : 'shadow-slate-400/40'
        }`}
      >
        {/* Botão de Fechar Superior */}
        <button
          type="button"
          onClick={handleCancelar}
          aria-label="Fechar"
          className="absolute top-4 right-4 p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          title="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Ícone com Halo Suave */}
        <div className="relative pt-1">
          <div
            className={`w-16 h-16 rounded-3xl border-2 ${estilo.bgIcone} flex items-center justify-center shadow-lg transition-transform`}
          >
            <Icone className="w-9 h-9" />
          </div>
        </div>

        {/* Textos */}
        <div className="space-y-2 px-1 w-full">
          <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
            {titulo || estilo.tituloPadrao}
          </h3>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-relaxed">
            {mensagem}
          </p>
          {detalhes && (
            <div className="text-[11px] p-3 rounded-xl border font-mono text-left break-words bg-slate-100 border-slate-300 text-slate-600 dark:bg-zinc-950 dark:border-slate-800 dark:text-slate-400 mt-2 space-y-1">
              <span className="block font-sans text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Detalhe técnico:
              </span>
              <p className="leading-relaxed select-text">{detalhes}</p>
            </div>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-3 w-full pt-2">
          {mostrarBotaoCancelar && (
            <button
              type="button"
              onClick={handleCancelar}
              className="flex-1 py-3 px-4 rounded-2xl font-bold text-sm border-2 transition cursor-pointer active:scale-95 bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 dark:bg-zinc-900 dark:hover:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
            >
              {textoBotaoCancelar}
            </button>
          )}

          <button
            type="button"
            onClick={handleConfirmar}
            className={`flex-1 py-3 px-4 rounded-2xl font-black text-sm shadow-lg flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 ${estilo.corBotao}`}
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{textoBotaoConfirmar}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
