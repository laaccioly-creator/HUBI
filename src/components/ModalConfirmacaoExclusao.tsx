import React from 'react';
import { Trash2, X, Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useRegisterOverlay } from '../hooks/useRegisterOverlay';

export interface ModalConfirmacaoExclusaoProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmar: () => void | Promise<void>;
  titulo?: string;
  mensagem: string;
  itemNome?: string;
  descricao?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  carregando?: boolean;
}

export const ModalConfirmacaoExclusao: React.FC<ModalConfirmacaoExclusaoProps> = ({
  isOpen,
  onClose,
  onConfirmar,
  titulo = 'Confirmar Exclusão',
  mensagem,
  itemNome,
  descricao,
  textoConfirmar = 'Sim, Excluir',
  textoCancelar = 'Cancelar',
  carregando = false
}) => {
  const { isDark } = useTheme();
  useRegisterOverlay(isOpen, () => { if (!carregando) onClose(); }, 'modal-confirmacao-exclusao', 'modal');

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      onClick={() => {
        if (!carregando) onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl dark:bg-[#000000] dark:border-[#1E293B] p-6 space-y-4 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/40 shrink-0">
              <Trash2 className="w-6 h-6 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {titulo}
              </h3>
              {itemNome && (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-0.5 truncate max-w-[240px]">
                  {itemNome}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={carregando}
            onClick={onClose}
            className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer disabled:opacity-50 ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-slate-900 dark:text-slate-300 leading-relaxed">
            {mensagem}
          </p>
          {descricao && (
            <p className="text-xs text-slate-700 dark:text-slate-400 leading-relaxed">
              {descricao}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-[#1E293B]">
          <button
            type="button"
            disabled={carregando}
            onClick={onClose}
            className={`hubi-btn-neutral rounded-xl px-4 py-2 text-xs transition cursor-pointer disabled:opacity-50 ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold'
                : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-semibold'
            }`}
          >
            {textoCancelar}
          </button>
          <button
            type="button"
            disabled={carregando}
            onClick={async () => {
              await onConfirmar();
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl px-4 py-2 text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {carregando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Excluindo...</span>
              </>
            ) : (
              <span>{textoConfirmar}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
