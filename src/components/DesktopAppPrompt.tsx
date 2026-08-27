import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Download,
  ExternalLink,
  X,
  Sparkles,
  Maximize2
} from 'lucide-react';

export const DesktopAppPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState<boolean>(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [jaInstalado, setJaInstalado] = useState<boolean>(false);

  useEffect(() => {
    // Verificar se é Desktop
    const isDesktop =
      typeof window !== 'undefined' &&
      window.innerWidth >= 768 &&
      !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (!isDesktop) {
      setShowPrompt(false);
      return;
    }

    // Verificar se a janela atual já está no modo standalone do aplicativo
    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true;
      setIsStandalone(standalone);
    };

    checkStandalone();

    // Verificar se o app já foi instalado no dispositivo
    const checkInstalado = async () => {
      if ('getInstalledRelatedApps' in navigator) {
        try {
          const apps = await (navigator as any).getInstalledRelatedApps();
          if (apps && apps.length > 0) {
            setJaInstalado(true);
          }
        } catch (e) {
          // Ignore
        }
      }
      const marcadoComoInstalado = localStorage.getItem('hubi_desktop_app_installed');
      if (marcadoComoInstalado === 'true') {
        setJaInstalado(true);
      }
    };

    checkInstalado();

    // Capturar evento de instalação nativa do Google Chrome / Edge
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      (window as any).__hubiDeferredPrompt = e;
    };

    const handleAppInstalled = () => {
      setJaInstalado(true);
      localStorage.setItem('hubi_desktop_app_installed', 'true');
      setShowPrompt(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleAcaoApp = async () => {
    const prompt = deferredPrompt || (window as any).__hubiDeferredPrompt;

    if (prompt) {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        localStorage.setItem('hubi_desktop_app_installed', 'true');
        setJaInstalado(true);
        setShowPrompt(false);
        setDeferredPrompt(null);
        (window as any).__hubiDeferredPrompt = null;
      }
    } else if (jaInstalado) {
      // Se já está instalado e o usuário está no navegador, abrir/mudar para a visão dedicada
      if (!document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {}
      }
      window.open(window.location.href, '_blank');
    } else {
      // Caso sem prompt nativo disponível no momento, alternar para tela cheia dedicada
      if (!document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {}
      }
    }
  };

  // Se já está dentro da janela do aplicativo instalado, não precisa exibir banner
  if (isStandalone || !showPrompt) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 border-b border-emerald-500/40 px-4 py-2 flex items-center justify-between text-xs text-slate-200 z-30 shadow-md select-none">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          <Monitor className="w-4 h-4" />
        </div>
        <div>
          <span className="font-bold text-white">
            {jaInstalado ? 'HUBI App instalado no Desktop: ' : 'Instalar HUBI no Desktop: '}
          </span>
          <span className="text-slate-300">
            {jaInstalado
              ? 'Você está no navegador. Mude para a janela do aplicativo para ocultar as abas e barras.'
              : 'Adicione o ícone na sua Área de Trabalho e use em janela dedicada sem abas.'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleAcaoApp}
          className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95"
        >
          {jaInstalado ? <ExternalLink className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
          <span>{jaInstalado ? 'Mudar para o App' : 'Instalar no Desktop'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowPrompt(false)}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Fechar aviso"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const DesktopInstallButton: React.FC = () => {
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [jaInstalado, setJaInstalado] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true;
      setIsStandalone(standalone);

      const marcadoInstalado = localStorage.getItem('hubi_desktop_app_installed') === 'true';
      if (marcadoInstalado) setJaInstalado(true);
    }
  }, []);

  const handleClique = async () => {
    const prompt = (window as any).__hubiDeferredPrompt;
    if (prompt) {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        localStorage.setItem('hubi_desktop_app_installed', 'true');
        setJaInstalado(true);
      }
    } else if (jaInstalado) {
      if (!document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {}
      }
      window.open(window.location.href, '_blank');
    } else {
      if (!document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {}
      }
    }
  };

  // Se já estiver rodando dentro do App Desktop instalado, não precisa exibir botão
  if (isStandalone) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleClique}
      className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition shadow-sm cursor-pointer active:scale-95"
      title={jaInstalado ? 'Mudar para o aplicativo dedicado' : 'Instalar o HUBI no Desktop'}
    >
      {jaInstalado ? <ExternalLink className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
      <span>{jaInstalado ? 'Mudar para o App' : 'Instalar App'}</span>
    </button>
  );
};
