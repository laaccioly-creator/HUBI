import React, { useState, useEffect } from 'react';
import { Monitor, Download, Maximize2, X, CheckCircle } from 'lucide-react';

export const DesktopAppPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    // Verificar se é Desktop
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768 && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isDesktop) return;

    // Verificar se já está em modo aplicativo (Standalone)
    const checkStandalone = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
      setIsStandalone(standalone);
      if (standalone) {
        setShowPrompt(false);
      }
    };

    checkStandalone();

    // Capturar evento de instalação do Chrome/Edge no Desktop
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Exibir aviso apenas se ainda não estiver instalado e usuário não tiver dispensado hoje
      const dispensadoHoje = localStorage.getItem('hubi_desktop_pwa_dismissed');
      if (!dispensadoHoje) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Escutar mudança de tela cheia
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleInstalarOuAbrirApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
        setDeferredPrompt(null);
      }
    } else {
      // Se já instalado ou sem suporte direto a prompt, alternar para modo tela cheia dedicada
      if (!document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
        } catch (e) {
          console.warn('Fullscreen error:', e);
        }
      }
    }
  };

  const handleDispensar = () => {
    setShowPrompt(false);
    localStorage.setItem('hubi_desktop_pwa_dismissed', 'true');
  };

  // Se já estiver em modo standalone ou for mobile, não renderizar banner
  if (isStandalone || !showPrompt) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 border-b border-emerald-500/30 px-4 py-2 flex items-center justify-between text-xs text-slate-200 animate-in slide-in-from-top duration-200">
      <div className="flex items-center gap-2.5">
        <div className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400">
          <Monitor className="w-4 h-4" />
        </div>
        <div>
          <span className="font-bold text-white">Usar HUBI no modo Desktop App: </span>
          <span className="text-slate-300">
            Remova as barras do navegador e utilize o sistema em tela dedicada com melhor performance.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleInstalarOuAbrirApp}
          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
        >
          {deferredPrompt ? <Download className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          <span>{deferredPrompt ? 'Instalar no Desktop' : 'Modo Tela Dedicada'}</span>
        </button>

        <button
          type="button"
          onClick={handleDispensar}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
