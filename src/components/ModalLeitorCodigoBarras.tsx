import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, RefreshCw, AlertCircle, Zap, Check } from 'lucide-react';
import { audioService } from '../services/audioService';

interface ModalLeitorCodigoBarrasProps {
  isOpen: boolean;
  onClose: () => void;
  onBarcodeDetected: (barcode: string) => void;
}

export const ModalLeitorCodigoBarras: React.FC<ModalLeitorCodigoBarrasProps> = ({
  isOpen,
  onClose,
  onBarcodeDetected
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [codigoManual, setCodigoManual] = useState<string>('');
  const [iniciando, setIniciando] = useState<boolean>(true);
  const [lidoSucesso, setLidoSucesso] = useState<string | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) {
      encerrarCamera();
      return;
    }

    iniciarCamera();

    return () => {
      encerrarCamera();
    };
  }, [isOpen]);

  const encerrarCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setLidoSucesso(null);
  };

  const iniciarCamera = async () => {
    try {
      setIniciando(true);
      setErroCamera(null);

      // Inicializa BarcodeDetector se disponível
      if ('BarcodeDetector' in window) {
        try {
          detectorRef.current = new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'itf']
          });
        } catch (e) {
          detectorRef.current = null;
        }
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
        iniciarDeteccao();
      }
    } catch (err: any) {
      console.warn('Erro ao acessar câmera para código de barras:', err);
      setErroCamera(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Permissão de acesso à câmera negada. Habilite nas configurações do seu navegador.'
          : 'Não foi possível acessar a câmera do dispositivo.'
      );
    } finally {
      setIniciando(false);
    }
  };

  const iniciarDeteccao = () => {
    const video = videoRef.current;
    if (!video) return;

    const scanFrame = async () => {
      if (!video || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      if (detectorRef.current) {
        try {
          const barcodes = await detectorRef.current.detect(video);
          if (barcodes && barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            if (rawValue && rawValue.trim()) {
              processarCodigoLido(rawValue.trim());
              return;
            }
          }
        } catch (e) {
          // Frame detect error ignora e segue
        }
      }

      animFrameRef.current = requestAnimationFrame(scanFrame);
    };

    animFrameRef.current = requestAnimationFrame(scanFrame);
  };

  const processarCodigoLido = (codigo: string) => {
    audioService.playBeep();
    setLidoSucesso(codigo);
    setTimeout(() => {
      onBarcodeDetected(codigo);
      onClose();
    }, 400);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigoManual.trim()) return;
    processarCodigoLido(codigoManual.trim());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl space-y-4">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">Leitor de Código de Barras</h3>
              <span className="text-[11px] text-slate-400">Aponte a câmera para o código do produto</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport da Câmera */}
        <div className="px-4">
          <div className="relative aspect-video sm:aspect-square w-full bg-black rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
            {iniciando && (
              <div className="flex flex-col items-center gap-2 text-slate-400 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                <span>Iniciando câmera...</span>
              </div>
            )}

            {erroCamera && !iniciando && (
              <div className="p-4 text-center space-y-2 max-w-xs">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-xs text-slate-300 font-medium">{erroCamera}</p>
                <button
                  type="button"
                  onClick={iniciarCamera}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-emerald-400 font-bold rounded-xl transition cursor-pointer"
                >
                  Tentar Novamente
                </button>
              </div>
            )}

            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover ${iniciando || erroCamera ? 'hidden' : 'block'}`}
            />

            {/* Mira de Escaneamento */}
            {!iniciando && !erroCamera && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                <div className="w-3/4 h-1/2 border-2 border-emerald-400/70 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                  <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-rose-500/80 animate-pulse" />
                </div>
              </div>
            )}

            {lidoSucesso && (
              <div className="absolute inset-0 bg-emerald-950/80 flex flex-col items-center justify-center gap-2 animate-in zoom-in-95">
                <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg">
                  <Check className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-white tracking-wider">Código Lido!</span>
                <span className="text-xs text-emerald-300 font-mono bg-slate-900 px-3 py-1 rounded-full border border-emerald-500/30">
                  {lidoSucesso}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Input Manual de Fallback */}
        <div className="p-4 pt-0">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="Ou digite o código de barras..."
              value={codigoManual}
              onChange={(e) => setCodigoManual(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
            <button
              type="submit"
              disabled={!codigoManual.trim()}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer"
            >
              Inserir
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
