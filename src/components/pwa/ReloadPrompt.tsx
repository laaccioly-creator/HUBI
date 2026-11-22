import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

const TIMEOUT_FALLBACK_RELOAD_MS = 1500;

export const ReloadPrompt: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered() {
      // SW registrado com sucesso
    },
    onRegisterError(error) {
      console.warn('Erro no registro do PWA Service Worker:', error);
    },
  });

  const [atualizando, setAtualizando] = useState<boolean>(false);
  const recarregandoRef = useRef<boolean>(false);
  const timerFallbackRef = useRef<number | null>(null);
  const timerHrefFallbackRef = useRef<number | null>(null);
  const controllerChangeHandlerRef = useRef<(() => void) | null>(null);

  const limparTimersEListeners = useCallback(() => {
    if (timerFallbackRef.current !== null) {
      window.clearTimeout(timerFallbackRef.current);
      timerFallbackRef.current = null;
    }
    if (timerHrefFallbackRef.current !== null) {
      window.clearTimeout(timerHrefFallbackRef.current);
      timerHrefFallbackRef.current = null;
    }
    if (
      controllerChangeHandlerRef.current &&
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator
    ) {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        controllerChangeHandlerRef.current
      );
      controllerChangeHandlerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      limparTimersEListeners();
    };
  }, [limparTimersEListeners]);

  const executarReloadSeguro = useCallback(async () => {
    if (recarregandoRef.current) return;
    recarregandoRef.current = true;

    limparTimersEListeners();

    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const chaves = await window.caches.keys();
        await Promise.all(chaves.map((chave) => window.caches.delete(chave)));
      } catch {
        // Ignora falha ao limpar caches em WebViews restritas
      }
    }

    if (typeof window !== 'undefined') {
      try {
        window.location.reload();
        // Fallback caso o WebView mobile ignore window.location.reload() silenciosamente
        timerHrefFallbackRef.current = window.setTimeout(() => {
          window.location.href = window.location.href;
        }, 400);
      } catch {
        window.location.href = window.location.href;
      }
    }
  }, [limparTimersEListeners]);

  const handleAtualizarVersao = useCallback(() => {
    if (atualizando || recarregandoRef.current) return;

    setAtualizando(true);

    // Timer determinístico de segurança caso controllerchange atrase ou seja bloqueado pelo WebView
    timerFallbackRef.current = window.setTimeout(() => {
      void executarReloadSeguro();
    }, TIMEOUT_FALLBACK_RELOAD_MS);

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker) {
      const aoAssumirControle = () => {
        void executarReloadSeguro();
      };
      controllerChangeHandlerRef.current = aoAssumirControle;
      navigator.serviceWorker.addEventListener('controllerchange', aoAssumirControle, {
        once: true,
      });
    }

    try {
      void Promise.resolve(updateServiceWorker(true)).catch(() => {
        void executarReloadSeguro();
      });
    } catch {
      void executarReloadSeguro();
    }
  }, [atualizando, executarReloadSeguro, updateServiceWorker]);

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-[calc(100%-2rem)] sm:w-auto bg-slate-900 border border-emerald-500/40 shadow-2xl rounded-2xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl flex-shrink-0">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ animationDuration: '3s' }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">Nova versão disponível!</p>
        <p className="text-xs text-slate-400">
          {atualizando
            ? 'Aplicando atualização e recarregando...'
            : 'Clique para carregar as melhorias recentes.'}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={handleAtualizarVersao}
          disabled={atualizando}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-medium text-xs rounded-lg transition shadow-md shadow-emerald-900/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-70 disabled:cursor-wait whitespace-nowrap"
        >
          {atualizando && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          <span>{atualizando ? 'Atualizando...' : 'Atualizar'}</span>
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          disabled={atualizando}
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="Dispensar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default ReloadPrompt;
