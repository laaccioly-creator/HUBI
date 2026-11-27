import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Receipt,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  FileText,
  Clock,
  User
} from 'lucide-react';
import { Pedido } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { formatarMoeda } from '../../utils/formatters';

interface ModalVisualizarComprovantePedidoProps {
  isOpen: boolean;
  pedido: Pedido | null;
  onClose: () => void;
}

const ZOOM_MIN = 100;
const ZOOM_MAX = 300;
const ZOOM_STEP_BTN = 25;

export const ModalVisualizarComprovantePedido: React.FC<ModalVisualizarComprovantePedidoProps> = ({
  isOpen,
  pedido,
  onClose
}) => {
  const { isDark } = useTheme();
  const [zoomPercent, setZoomPercent] = useState<number>(ZOOM_MIN);
  const [baseDims, setBaseDims] = useState<{ width: number; height: number } | null>(null);
  const [arrastando, setArrastando] = useState<boolean>(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  useRegisterOverlay(
    isOpen && Boolean(pedido),
    onClose,
    'modal-visualizar-comprovante-pedido',
    'modal'
  );

  const url = (pedido?.comprovante_pagamento_url || '').trim();
  const ehPdf = Boolean(
    url &&
      (url.toLowerCase().includes('.pdf') ||
        url.toLowerCase().startsWith('data:application/pdf'))
  );

  useEffect(() => {
    setZoomPercent(ZOOM_MIN);
    setBaseDims(null);
    setArrastando(false);
    dragStartRef.current = null;
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
      containerRef.current.scrollTop = 0;
    }
  }, [pedido?.id, isOpen]);

  useEffect(() => {
    if (!isOpen || !ehPdf || !url.startsWith('data:application/pdf')) {
      setPdfBlobUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    try {
      const [, base64] = url.split(',');
      const binario = atob(base64 || '');
      const bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i += 1) {
        bytes[i] = binario.charCodeAt(i);
      }
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      setPdfBlobUrl(objectUrl);
    } catch {
      setPdfBlobUrl(url);
    }

    return () => {
      if (objectUrl && objectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [isOpen, ehPdf, url]);

  if (!isOpen || !pedido || !url) return null;

  const nomeCliente =
    pedido.cliente?.nome || pedido.cliente_nome_avulso || 'Cliente Avulso';
  const numeroPedidoFmt =
    pedido.origem === 'catalogo_online'
      ? `#c-${pedido.numero_pedido}`
      : `#${pedido.numero_pedido}`;
  const dataEnvioFmt = pedido.comprovante_enviado_em
    ? new Date(pedido.comprovante_enviado_em).toLocaleString('pt-BR')
    : null;
  const pdfSrc = pdfBlobUrl || url;

  const capturarBaseDims = () => {
    if (!imgRef.current || zoomPercent !== ZOOM_MIN) return;
    const rect = imgRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setBaseDims({ width: rect.width, height: rect.height });
    }
  };

  const aplicarZoom = (novoZoom: number) => {
    const limitado = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, novoZoom));
    if (limitado > ZOOM_MIN && !baseDims && imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setBaseDims({ width: rect.width, height: rect.height });
      }
    }
    setZoomPercent(limitado);
    if (limitado === ZOOM_MIN && containerRef.current) {
      containerRef.current.scrollLeft = 0;
      containerRef.current.scrollTop = 0;
    }
  };

  const handleResetarZoom = () => {
    setZoomPercent(ZOOM_MIN);
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
      containerRef.current.scrollTop = 0;
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomPercent <= ZOOM_MIN || !containerRef.current) return;
    e.preventDefault();
    setArrastando(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!arrastando || !dragStartRef.current || !containerRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    containerRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
    containerRef.current.scrollTop = dragStartRef.current.scrollTop - dy;
  };

  const encerrarArraste = () => {
    if (arrastando) {
      setArrastando(false);
    }
    dragStartRef.current = null;
  };

  const btnNeutroCls = isDark
    ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900 font-semibold';

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-3xl rounded-3xl shadow-2xl border flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150 ${
          isDark
            ? 'bg-[#08131A] border-slate-700 text-slate-100'
            : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        {/* Cabeçalho */}
        <div
          className={`flex items-start justify-between gap-3 px-5 py-4 border-b ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                isDark
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {ehPdf ? <FileText className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-sm sm:text-base">
                  Comprovante Pix • Pedido {numeroPedidoFmt}
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold font-mono ${
                    isDark
                      ? 'bg-slate-900 border border-slate-700 text-emerald-400'
                      : 'bg-slate-100 border border-slate-300 text-slate-900'
                  }`}
                >
                  {formatarMoeda(Number(pedido.valor_total || 0))}
                </span>
              </div>

              <div
                className={`flex items-center gap-3 flex-wrap text-xs ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                <span className="inline-flex items-center gap-1 font-semibold">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span>{nomeCliente}</span>
                </span>
                {dataEnvioFmt && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>Enviado em {dataEnvioFmt}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar visualização de comprovante"
            className={`p-2 rounded-xl border transition cursor-pointer shrink-0 ${btnNeutroCls}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo */}
        <div
          className={`flex-1 overflow-hidden p-4 sm:p-5 flex items-center justify-center ${
            isDark ? 'bg-slate-950/70' : 'bg-slate-50'
          }`}
        >
          {ehPdf ? (
            <iframe
              src={pdfSrc}
              title={`Comprovante Pix Pedido ${numeroPedidoFmt}`}
              className={`w-full h-[70vh] rounded-2xl border ${
                isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'
              }`}
            />
          ) : (
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={encerrarArraste}
              onMouseLeave={encerrarArraste}
              className={`w-full max-h-[70vh] min-h-[260px] rounded-2xl border overflow-auto p-2 flex ${
                zoomPercent > ZOOM_MIN
                  ? 'items-start justify-start'
                  : 'items-center justify-center'
              } ${
                zoomPercent > ZOOM_MIN
                  ? arrastando
                    ? 'cursor-grabbing'
                    : 'cursor-grab'
                  : 'cursor-default'
              } ${
                isDark
                  ? 'border-slate-800 bg-black/50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <img
                ref={imgRef}
                src={url}
                alt={`Comprovante Pix Pedido ${numeroPedidoFmt}`}
                draggable={false}
                onLoad={capturarBaseDims}
                style={
                  zoomPercent > ZOOM_MIN
                    ? baseDims
                      ? {
                          width: `${Math.round((baseDims.width * zoomPercent) / 100)}px`,
                          height: `${Math.round((baseDims.height * zoomPercent) / 100)}px`,
                          maxWidth: 'none',
                          maxHeight: 'none'
                        }
                      : {
                          width: `${zoomPercent}%`,
                          height: 'auto',
                          maxWidth: 'none',
                          maxHeight: 'none'
                        }
                    : undefined
                }
                className={
                  zoomPercent > ZOOM_MIN
                    ? 'shrink-0 select-none'
                    : 'object-contain max-h-[70vh] max-w-full mx-auto select-none'
                }
              />
            </div>
          )}
        </div>

        {/* Rodapé com controles progressivos de zoom */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t ${
            isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-200 bg-white'
          } rounded-b-3xl`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {!ehPdf && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={zoomPercent <= ZOOM_MIN}
                  onClick={() => aplicarZoom(zoomPercent - ZOOM_STEP_BTN)}
                  title="Diminuir zoom (-25%)"
                  aria-label="Diminuir zoom"
                  className={`inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl text-xs border transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${btnNeutroCls}`}
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                  <span>-</span>
                </button>

                <input
                  type="range"
                  min={ZOOM_MIN}
                  max={ZOOM_MAX}
                  step={10}
                  value={zoomPercent}
                  onChange={(e) => aplicarZoom(Number(e.target.value))}
                  aria-label="Zoom do comprovante"
                  className="w-24 sm:w-32 accent-emerald-500 cursor-pointer"
                />

                <button
                  type="button"
                  disabled={zoomPercent >= ZOOM_MAX}
                  onClick={() => aplicarZoom(zoomPercent + ZOOM_STEP_BTN)}
                  title="Aumentar zoom (+25%)"
                  aria-label="Aumentar zoom"
                  className={`inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl text-xs border transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${btnNeutroCls}`}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>+</span>
                </button>

                <span
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold border min-w-[54px] text-center ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-emerald-400'
                      : 'bg-slate-100 border-slate-300 text-slate-900'
                  }`}
                >
                  {zoomPercent}%
                </span>

                <button
                  type="button"
                  disabled={zoomPercent === ZOOM_MIN}
                  onClick={handleResetarZoom}
                  title="Resetar zoom para 100%"
                  className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs border transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${btnNeutroCls}`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Resetar (100%)</span>
                </button>
              </div>
            )}

            {/^https?:\/\//i.test(url) && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs border transition ${btnNeutroCls}`}
              >
                <span>Abrir original</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`px-5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900'
            }`}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
