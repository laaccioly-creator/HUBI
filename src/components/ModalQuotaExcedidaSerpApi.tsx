import React from 'react';
import { AlertTriangle, ExternalLink, Check, X } from 'lucide-react';

interface ModalQuotaExcedidaSerpApiProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ModalQuotaExcedidaSerpApi: React.FC<ModalQuotaExcedidaSerpApiProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100">
        
        {/* CABEÇALHO */}
        <div className="p-5 border-b border-slate-800 flex items-start justify-between gap-3 bg-amber-500/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-100">
                Limite mensal de 250 buscas atingido!
              </h3>
              <p className="text-[11px] text-amber-400/90 font-medium mt-0.5">
                Cota gratuita mensal da SerpApi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CORPO */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            A sua cota de <strong>250 pesquisas gratuitas</strong> deste mês na SerpApi foi atingida.
          </p>
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-400 leading-relaxed space-y-2">
            <p>
              ✨ Suas <strong>250 buscas gratuitas serão renovadas automaticamente</strong> no início do próximo mês.
            </p>
            <p>
              Caso precise de buscas adicionais com urgência ainda este mês, você pode assinar um plano diretamente no painel da SerpApi ou subir fotos manualmente do seu aparelho pela Galeria ou Câmera.
            </p>
          </div>
        </div>

        {/* BOTÕES */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-2.5">
          <a
            href="https://serpapi.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
          >
            <span>Acessar Painel SerpApi</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Entendi</span>
          </button>
        </div>

      </div>
    </div>
  );
};
