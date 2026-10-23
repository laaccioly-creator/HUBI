import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Clock, ArrowRight, Loader2, X, ShieldCheck, GripVertical } from 'lucide-react';
import { useAssinaturaStatus } from '../../hooks/useAssinaturaStatus';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

export const BannerAssinaturaTop: React.FC = () => {
  const { isDark } = useTheme();
  const { loja } = useAuth();
  const {
    deveExibirBanner,
    tipoBanner,
    diasRestantesTrial,
    diasRestantesAnuidade,
    valorMensalReferencia,
    iniciarCheckoutAssinatura,
    carregandoCheckout,
    erroCheckout
  } = useAssinaturaStatus();

  const valorFormatado = (valorMensalReferencia || 49.90).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const [dispensado, setDispensado] = useState<boolean>(false);

  // Posição arrastável do widget de trial (Drag and Drop)
  const [posicao, setPosicao] = useState<{ x: number; y: number } | null>(() => {
    try {
      const salvo = localStorage.getItem('hubi_trial_widget_pos');
      if (salvo) return JSON.parse(salvo);
    } catch {}
    return null;
  });

  const arrastandoRef = useRef<boolean>(false);
  const posInicialMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const posInicialBtnRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const houveArrastoRef = useRef<boolean>(false);

  // Inicializa posição padrão no topo à direita se não houver no localStorage
  useEffect(() => {
    if (!posicao && typeof window !== 'undefined') {
      const padraoX = Math.max(10, window.innerWidth - 300);
      const padraoY = 68;
      setPosicao({ x: padraoX, y: padraoY });
    }
  }, [posicao]);

  // Recalibra ao redimensionar tela
  useEffect(() => {
    const handleResize = () => {
      setPosicao((prev) => {
        if (!prev) return prev;
        const maxW = Math.max(10, window.innerWidth - 290);
        const maxH = Math.max(10, window.innerHeight - 80);
        return {
          x: Math.min(prev.x, maxW),
          y: Math.min(prev.y, maxH),
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const iniciarArrasto = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const el = e.currentTarget.closest('[data-drag-container="true"]') as HTMLElement || e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();

    arrastandoRef.current = true;
    houveArrastoRef.current = false;
    posInicialMouseRef.current = { x: clientX, y: clientY };
    posInicialBtnRef.current = { x: rect.left, y: rect.top };

    const emMovimento = (moveEvent: MouseEvent | TouchEvent) => {
      if (!arrastandoRef.current) return;
      const curX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const curY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const deltaX = curX - posInicialMouseRef.current.x;
      const deltaY = curY - posInicialMouseRef.current.y;

      if (Math.hypot(deltaX, deltaY) > 6) houveArrastoRef.current = true;

      const novoX = Math.max(10, Math.min(window.innerWidth - 290, posInicialBtnRef.current.x + deltaX));
      const novoY = Math.max(10, Math.min(window.innerHeight - 80, posInicialBtnRef.current.y + deltaY));

      setPosicao({ x: novoX, y: novoY });
    };

    const finalizarArrasto = () => {
      arrastandoRef.current = false;
      window.removeEventListener('mousemove', emMovimento);
      window.removeEventListener('mouseup', finalizarArrasto);
      window.removeEventListener('touchmove', emMovimento);
      window.removeEventListener('touchend', finalizarArrasto);
      setPosicao((pos) => {
        if (pos) localStorage.setItem('hubi_trial_widget_pos', JSON.stringify(pos));
        return pos;
      });
    };

    window.addEventListener('mousemove', emMovimento);
    window.addEventListener('mouseup', finalizarArrasto);
    window.addEventListener('touchmove', emMovimento, { passive: true });
    window.addEventListener('touchend', finalizarArrasto);
  };

  // Não renderiza se não houver alerta ou se o usuário dispensou temporariamente (apenas se faltarem > 2 dias)
  if (!deveExibirBanner) return null;
  const podeDispensar = (tipoBanner === 'trial' && diasRestantesTrial > 2) || (tipoBanner === 'renovacao' && diasRestantesAnuidade > 3);
  if (dispensado && podeDispensar) return null;

  const handleCheckout = () => {
    if (!houveArrastoRef.current) {
      iniciarCheckoutAssinatura();
    }
  };

  if (tipoBanner === 'trial') {
    return (
      <div
        data-drag-container="true"
        style={{
          position: 'fixed',
          left: posicao ? `${posicao.x}px` : 'auto',
          top: posicao ? `${posicao.y}px` : '68px',
          right: posicao ? 'auto' : '16px',
        }}
        className="z-40 select-none touch-none animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 rounded-2xl p-2.5 shadow-xl shadow-black/50 text-slate-100 flex items-center gap-2.5 max-w-[280px] sm:max-w-[300px]">
          {/* Alça de Arraste */}
          <button
            type="button"
            onMouseDown={iniciarArrasto}
            onTouchStart={iniciarArrasto}
            className="text-slate-400 hover:text-emerald-400 cursor-grab active:cursor-grabbing p-1 -ml-1 rounded transition shrink-0"
            title="Arraste para reposicionar na tela"
          >
            <GripVertical className="w-4 h-4" />
          </button>

          {/* Conteúdo Informativo */}
          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center gap-1.5 leading-none">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-pulse" />
              <span className="text-xs font-black text-white truncate">
                Restam {diasRestantesTrial} {diasRestantesTrial === 1 ? 'dia gratuito' : 'dias gratuitos'}
              </span>
            </div>
            <p className="text-[10px] text-slate-300 font-medium truncate mt-0.5">
              Garanta seu plano por apenas {valorFormatado}/mês
            </p>
            {erroCheckout && (
              <p className="text-[9px] text-red-400 font-bold truncate mt-0.5">
                {erroCheckout}
              </p>
            )}
          </div>

          {/* Botão de Ação Compacto */}
          <button
            type="button"
            onClick={handleCheckout}
            disabled={carregandoCheckout}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-[11px] flex items-center gap-1 shadow-sm transition disabled:opacity-50 cursor-pointer shrink-0"
          >
            {carregandoCheckout ? (
              <Loader2 className="w-3 h-3 animate-spin text-white" />
            ) : (
              <>
                <span>Assinar</span>
                <ArrowRight className="w-3 h-3 text-white" />
              </>
            )}
          </button>

          {/* Botão Dispensar (se faltarem > 2 dias) */}
          {podeDispensar && (
            <button
              type="button"
              onClick={() => setDispensado(true)}
              title="Dispensar aviso"
              className="p-1 -mr-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (tipoBanner === 'renovacao') {
    return (
      <div className="relative z-40 bg-[#7F1D1D] border-b border-red-800 text-white px-3 py-2 text-xs shadow-md transition-all">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <div className="p-1 rounded-full bg-white/15 shrink-0">
              <Clock className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="leading-tight text-white">
              <span className="font-extrabold tracking-wide">Aviso de Renovação:</span>{' '}
              <span>
                A anuidade de <strong className="font-extrabold text-white">{loja?.nome_fantasia}</strong> vence em{' '}
                <strong className="underline underline-offset-2 font-black text-white">{diasRestantesAnuidade} {diasRestantesAnuidade === 1 ? 'dia' : 'dias'}</strong>.
                Renove agora por +1 ano e mantenha a operação sem risco de pausa.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {erroCheckout && (
              <span className="text-[11px] text-white font-semibold bg-black/40 border border-white/20 px-2 py-0.5 rounded">
                {erroCheckout}
              </span>
            )}

            <button
              type="button"
              onClick={handleCheckout}
              disabled={carregandoCheckout}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-[#7F1D1D] font-extrabold hover:bg-red-50 active:scale-95 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {carregandoCheckout ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-[#7F1D1D]" />
                  <span>Gerando Checkout...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-[#7F1D1D]" />
                  <span>Renovar por 1 Ano</span>
                </>
              )}
            </button>

            {podeDispensar && (
              <button
                type="button"
                onClick={() => setDispensado(true)}
                title="Fechar aviso temporariamente"
                className="p-1 rounded-md hover:bg-white/20 text-white/90 hover:text-white transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};
