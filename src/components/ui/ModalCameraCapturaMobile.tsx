import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Flashlight,
  FlashlightOff,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  X
} from 'lucide-react';
import {
  comprimirFotoProduto,
  comprimirFrameVideo,
  type CompressResult
} from '../../utils/imageCompressor';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';

export interface ModalCameraCapturaMobileProps {
  isOpen: boolean;
  onClose: () => void;
  onCapturar: (resultado: CompressResult) => void | Promise<void>;
  titulo?: string;
  subtitulo?: string;
  overlayId?: string;
  maxDimension?: number;
  quality?: number;
}

type MediaTrackCapabilitiesComFlash = MediaTrackCapabilities & {
  torch?: boolean;
};

type MediaTrackConstraintSetComFlash = MediaTrackConstraintSet & {
  torch?: boolean;
};

export const ModalCameraCapturaMobile: React.FC<ModalCameraCapturaMobileProps> = ({
  isOpen,
  onClose,
  onCapturar,
  titulo = 'Fotografar Produto',
  subtitulo = 'Enquadre o produto na guia',
  overlayId = 'modal-camera-captura-mobile',
  maxDimension = 1024,
  quality = 0.78
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galeriaInputRef = useRef<HTMLInputElement | null>(null);
  const fallbackDisparadoRef = useRef<boolean>(false);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [carregando, setCarregando] = useState<boolean>(false);
  const [capturando, setCapturando] = useState<boolean>(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [suportaFlash, setSuportaFlash] = useState<boolean>(false);
  const [flashLigado, setFlashLigado] = useState<boolean>(false);

  const pararStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignora falha ao encerrar track já finalizada
        }
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        // Ignora erro se o elemento já estiver pausado
      }
      videoRef.current.srcObject = null;
    }

    setFlashLigado(false);
    setSuportaFlash(false);
  }, []);

  const handleFechar = useCallback(() => {
    pararStream();
    onClose();
  }, [pararStream, onClose]);

  useRegisterOverlay(isOpen, handleFechar, overlayId, 'modal');

  useEffect(() => {
    if (!isOpen) {
      pararStream();
      setErroCamera(null);
      setCarregando(false);
      setCapturando(false);
      fallbackDisparadoRef.current = false;
      return;
    }

    let cancelado = false;

    const acionarFallbackGaleria = (mensagem: string) => {
      if (cancelado) return;
      setErroCamera(mensagem);
      setCarregando(false);
      if (!fallbackDisparadoRef.current) {
        fallbackDisparadoRef.current = true;
        setTimeout(() => {
          if (!cancelado) {
            galeriaInputRef.current?.click();
          }
        }, 120);
      }
    };

    const iniciarCamera = async () => {
      setCarregando(true);
      setErroCamera(null);
      pararStream();

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        acionarFallbackGaleria(
          'Câmera ao vivo indisponível neste dispositivo. Selecione uma foto da galeria.'
        );
        return;
      }

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        if (cancelado) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = mediaStream;

        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
          try {
            const caps = videoTrack.getCapabilities() as MediaTrackCapabilitiesComFlash;
            setSuportaFlash(Boolean(caps.torch));
          } catch {
            setSuportaFlash(false);
          }
        } else {
          setSuportaFlash(false);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
        }
      } catch {
        acionarFallbackGaleria(
          'Não foi possível acessar a câmera diretamente. Selecione uma foto da galeria.'
        );
      } finally {
        if (!cancelado) {
          setCarregando(false);
        }
      }
    };

    void iniciarCamera();

    return () => {
      cancelado = true;
      pararStream();
    };
  }, [isOpen, facingMode, pararStream]);

  const alternarCamera = () => {
    if (carregando || capturando) return;
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const alternarFlash = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !suportaFlash) return;

    try {
      const novoEstado = !flashLigado;
      const constraint: MediaTrackConstraintSetComFlash = { torch: novoEstado };
      await track.applyConstraints({
        advanced: [constraint]
      });
      setFlashLigado(novoEstado);
    } catch {
      setSuportaFlash(false);
    }
  };

  const handleDisparar = async () => {
    const video = videoRef.current;
    if (!video || carregando || capturando) return;

    try {
      setCapturando(true);
      const resultado = await comprimirFrameVideo(video, {
        maxDimension,
        quality,
        mimeType: 'image/jpeg'
      });

      pararStream();
      const promessa = onCapturar(resultado);
      onClose();
      if (promessa && typeof (promessa as Promise<void>).then === 'function') {
        await promessa;
      }
    } catch (err) {
      const mensagem =
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível capturar a foto. Tente novamente.';
      setErroCamera(mensagem);
    } finally {
      setCapturando(false);
    }
  };

  const handleArquivoGaleria = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;

    try {
      setCapturando(true);
      const resultado = await comprimirFotoProduto(arquivo, {
        maxDimension,
        quality,
        mimeType: 'image/jpeg'
      });

      pararStream();
      const promessa = onCapturar(resultado);
      onClose();
      if (promessa && typeof (promessa as Promise<void>).then === 'function') {
        await promessa;
      }
    } catch (err) {
      const mensagem =
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível processar a imagem selecionada.';
      setErroCamera(mensagem);
    } finally {
      setCapturando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] bg-slate-950 flex flex-col justify-between p-4 text-white select-none"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      {/* Input oculto de fallback/galeria sem atributo capture para evitar encerramento do processo no Android */}
      <input
        ref={galeriaInputRef}
        type="file"
        accept="image/*"
        onChange={handleArquivoGaleria}
        className="hidden"
      />

      {/* Cabeçalho */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={handleFechar}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer shrink-0"
            aria-label="Fechar câmera"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h3 className="font-extrabold text-sm text-white leading-tight truncate">{titulo}</h3>
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider truncate">
              {subtitulo}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {suportaFlash && !erroCamera && (
            <button
              type="button"
              onClick={alternarFlash}
              className={`p-2.5 rounded-xl border transition cursor-pointer ${
                flashLigado
                  ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                  : 'bg-slate-900 border-slate-800 text-slate-200 hover:text-white'
              }`}
              title="Alternar lanterna"
              aria-label="Alternar lanterna"
            >
              {flashLigado ? <Flashlight className="w-5 h-5" /> : <FlashlightOff className="w-5 h-5" />}
            </button>
          )}

          {!erroCamera && (
            <button
              type="button"
              onClick={alternarCamera}
              disabled={carregando || capturando}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 hover:text-white transition cursor-pointer disabled:opacity-50"
              title="Alternar câmera"
              aria-label="Alternar câmera"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Visor de Vídeo / Fallback */}
      <div className="relative flex-1 my-3 bg-black rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-2xl">
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className={`w-full h-full object-cover ${erroCamera ? 'hidden' : 'block'}`}
        />

        {!erroCamera && !carregando && (
          <div className="absolute inset-6 sm:inset-10 border-2 border-dashed border-emerald-500/50 rounded-2xl pointer-events-none flex items-center justify-center">
            <span className="text-[11px] font-bold text-emerald-300 bg-slate-950/70 px-3 py-1 rounded-full uppercase tracking-wider backdrop-blur-sm">
              Posicione o produto aqui
            </span>
          </div>
        )}

        {(carregando || capturando) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-white gap-3 z-20">
            <Loader2 className="w-9 h-9 animate-spin text-emerald-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
              {capturando ? 'Otimizando foto...' : 'Iniciando câmera...'}
            </span>
          </div>
        )}

        {erroCamera && !capturando && (
          <div className="p-6 max-w-sm text-center space-y-4 z-10">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400">
              <ImageIcon className="w-7 h-7" />
            </div>
            <p className="text-sm font-semibold text-slate-200 leading-relaxed">{erroCamera}</p>
            <button
              type="button"
              onClick={() => galeriaInputRef.current?.click()}
              className="w-full h-12 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition cursor-pointer"
            >
              <ImageIcon className="w-5 h-5" />
              <span>Escolher da Galeria</span>
            </button>
          </div>
        )}
      </div>

      {/* Barra Inferior Ergonômica */}
      <div className="flex items-center justify-between gap-3 pt-1 pb-2 z-10">
        <button
          type="button"
          onClick={() => galeriaInputRef.current?.click()}
          disabled={capturando}
          className="h-12 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-50 min-w-[104px]"
        >
          <ImageIcon className="w-4 h-4 text-emerald-400" />
          <span>Galeria</span>
        </button>

        <button
          type="button"
          onClick={handleDisparar}
          disabled={carregando || capturando || Boolean(erroCamera)}
          aria-label="Tirar foto"
          className="w-20 h-20 rounded-full border-4 border-emerald-400/70 bg-emerald-500/20 flex items-center justify-center shadow-xl shadow-emerald-500/20 active:scale-95 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <span className="w-14 h-14 rounded-full bg-[#10B981] hover:bg-emerald-400 flex items-center justify-center shadow-inner transition">
            <Camera className="w-7 h-7 text-slate-950" />
          </span>
        </button>

        <button
          type="button"
          onClick={handleFechar}
          className="h-12 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs sm:text-sm flex items-center justify-center transition cursor-pointer active:scale-95 min-w-[104px]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
};
