import React from 'react';
import { X, Sparkles, CheckCircle2, FileText } from 'lucide-react';
import type { UsuarioLoja } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';

export interface ModalMiniCurriculoProfissionalProps {
  isOpen: boolean;
  onClose: () => void;
  profissional: UsuarioLoja | null;
  onSelecionar?: (prof: UsuarioLoja) => void;
  textoBotaoAcao?: string;
}

export const ModalMiniCurriculoProfissional: React.FC<ModalMiniCurriculoProfissionalProps> = ({
  isOpen,
  onClose,
  profissional,
  onSelecionar,
  textoBotaoAcao = 'Selecionar este profissional'
}) => {
  const { isDark } = useTheme();
  useRegisterOverlay(isOpen, onClose, 'modal-mini-curriculo-profissional');

  if (!isOpen || !profissional) return null;

  const iniciais = (profissional.nome_completo || 'PR')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[80] animate-in fade-in"
    >
      <div
        className={`w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] ${
          isDark ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div
          className={`px-5 py-4 border-b flex items-center justify-between ${
            isDark ? 'border-slate-800 bg-[#0B1120]' : 'border-slate-100 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-500" />
            <h3 className="font-black text-sm">Perfil do Profissional</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-xl transition cursor-pointer ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-black hover:bg-slate-200'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="flex items-center gap-4">
            <div
              className={`w-20 h-20 rounded-2xl overflow-hidden shrink-0 border flex items-center justify-center font-black text-xl ${
                isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-700'
              }`}
            >
              {profissional.url_foto ? (
                <img
                  src={profissional.url_foto}
                  alt={profissional.nome_completo}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{iniciais}</span>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <h4 className="font-black text-base leading-tight">{profissional.nome_completo}</h4>
              {profissional.especialidade_cargo && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>{profissional.especialidade_cargo}</span>
                </span>
              )}
            </div>
          </div>

          <div
            className={`p-4 rounded-2xl border text-sm leading-relaxed whitespace-pre-line ${
              isDark
                ? 'bg-slate-900/70 border-slate-800 text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            {profissional.mini_curriculo?.trim() || 'Profissional qualificado para este atendimento.'}
          </div>
        </div>

        <div
          className={`px-5 py-4 border-t flex items-center justify-end gap-2.5 ${
            isDark ? 'border-slate-800 bg-[#0B1120]' : 'border-slate-100 bg-slate-50'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-black border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white dark:border-slate-700 transition cursor-pointer"
          >
            Fechar
          </button>

          {onSelecionar && (
            <button
              type="button"
              onClick={() => {
                onSelecionar(profissional);
                onClose();
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-black bg-emerald-300 hover:bg-emerald-400 text-black border border-emerald-400 transition cursor-pointer inline-flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{textoBotaoAcao}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
