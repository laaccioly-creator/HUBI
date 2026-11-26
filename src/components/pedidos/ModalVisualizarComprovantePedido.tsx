import React, { useEffect, useState } from 'react';
import { X, Receipt, ZoomIn, ZoomOut, ExternalLink, FileText, Clock, User } from 'lucide-react';
import { Pedido } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { formatarMoeda } from '../../utils/formatters';

interface ModalVisualizarComprovantePedidoProps {
  isOpen: boolean;
  pedido: Pedido | null;
  onClose: () => void;
}

export const ModalVisualizarComprovantePedido: React.FC<ModalVisualizarComprovantePedidoProps> = ({
  isOpen,
  pedido,
  onClose
}) => {
  const { isDark } = useTheme();
  const [zoomAmpliado, setZoomAmpliado] = useState<boolean>(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

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
    setZoomAmpliado(false);
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
            className={`p-2 rounded-xl border transition cursor-pointer shrink-0 ${
              isDark
                ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo */}
        <div
          className={`flex-1 overflow-auto p-4 sm:p-5 flex items-center justify-center ${
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
            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
              <div
                className={`w-full max-h-[70vh] rounded-2xl border flex items-center justify-center overflow-auto p-2 ${
                  isDark
                    ? 'border-slate-800 bg-black/50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <img
                  src={url}
                  alt={`Comprovante Pix Pedido ${numeroPedidoFmt}`}
                  onClick={() => setZoomAmpliado((prev) => !prev)}
                  className={
                    zoomAmpliado
                      ? 'w-full max-w-none scale-150 origin-top cursor-zoom-out transition-transform duration-150'
                      : 'object-contain max-h-[70vh] mx-auto cursor-zoom-in transition-transform duration-150'
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div
          className={`flex items-center justify-between gap-2 px-5 py-3.5 border-t ${
            isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-200 bg-white'
          } rounded-b-3xl`}
        >
          <div className="flex items-center gap-2">
            {!ehPdf && (
              <button
                type="button"
                onClick={() => setZoomAmpliado((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  isDark
                    ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900'
                }`}
              >
                {zoomAmpliado ? (
                  <>
                    <ZoomOut className="w-3.5 h-3.5" />
                    <span>Ajustar</span>
                  </>
                ) : (
                  <>
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>Ampliar</span>
                  </>
                )}
              </button>
            )}

            {/^https?:\/\//i.test(url) && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                  isDark
                    ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900'
                }`}
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
