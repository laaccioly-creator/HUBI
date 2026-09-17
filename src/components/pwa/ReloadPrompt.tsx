import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export const ReloadPrompt: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // SW registrado com sucesso
    },
    onRegisterError(error) {
      console.warn('Erro no registro do PWA Service Worker:', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-[calc(100%-2rem)] sm:w-auto bg-slate-900 border border-emerald-500/40 shadow-2xl rounded-2xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl flex-shrink-0">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ animationDuration: '3s' }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">Nova versão disponível!</p>
        <p className="text-xs text-slate-400">Clique para carregar as melhorias recentes.</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => updateServiceWorker(true)}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-medium text-xs rounded-lg transition shadow-md shadow-emerald-900/30"
        >
          Atualizar
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          title="Dispensar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default ReloadPrompt;
