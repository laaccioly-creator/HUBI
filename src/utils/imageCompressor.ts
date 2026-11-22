/**
 * Utilitário de compressão de imagens de alta eficiência no cliente (Client-side Image Compressor)
 * Especializado para ambientes móveis (Android WebView / PWA) para prevenir estouros de memória RAM (OOM).
 *
 * Prioriza createImageBitmap com resize nativo em C++/GPU antes da pintura no <canvas>,
 * com fallback seguro via ObjectURL + HTMLImageElement e liberação determinística em bloco finally.
 */

export interface CompressOptions {
  maxDimension?: number; // Padrão: 1024 (equilíbrio ideal entre leitura ótica Gemini IA e baixo pico de RAM)
  quality?: number;      // Padrão: 0.78 (JPEG nítido e leve para upload/IA)
  mimeType?: string;     // Padrão: 'image/jpeg'
}

export interface CompressResult {
  blob: Blob;
  base64Limpo: string;
  mimeType: string;
  previewUrl: string;
  dataUrl: string;
}

const MAX_DIMENSION_PADRAO = 1024;
const QUALITY_PADRAO = 0.78;
const MIME_TYPE_PADRAO = 'image/jpeg';

function calcularDimensoesProporcionais(
  origWidth: number,
  origHeight: number,
  maxDimension: number
): { width: number; height: number } {
  let width = origWidth > 0 ? origWidth : maxDimension;
  let height = origHeight > 0 ? origHeight : maxDimension;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.max(1, Math.round((height * maxDimension) / width));
      width = maxDimension;
    } else {
      width = Math.max(1, Math.round((width * maxDimension) / height));
      height = maxDimension;
    }
  }

  return { width, height };
}

function base64ParaBlob(base64Limpo: string, mimeType: string): Blob {
  const byteString = atob(base64Limpo);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }
  return new Blob([arrayBuffer], { type: mimeType });
}

async function gerarResultadoDeCanvas(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<CompressResult> {
  const dataUrl = canvas.toDataURL(mimeType, quality);
  const base64Limpo = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

  const blobGerado = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), mimeType, quality);
  });

  const blob = blobGerado ?? base64ParaBlob(base64Limpo, mimeType);
  const previewUrl = URL.createObjectURL(blob);

  return {
    blob,
    base64Limpo,
    mimeType,
    previewUrl,
    dataUrl
  };
}

async function desenharEComprimirFonte(
  fonte: CanvasImageSource,
  origWidth: number,
  origHeight: number,
  options?: CompressOptions
): Promise<CompressResult> {
  const maxDimension = options?.maxDimension ?? MAX_DIMENSION_PADRAO;
  const quality = options?.quality ?? QUALITY_PADRAO;
  const mimeType = options?.mimeType ?? MIME_TYPE_PADRAO;

  const { width, height } = calcularDimensoesProporcionais(origWidth, origHeight, maxDimension);

  let canvas: HTMLCanvasElement | null = document.createElement('canvas');
  let ctx: CanvasRenderingContext2D | null = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: false
  });

  try {
    if (!ctx) {
      throw new Error('Não foi possível inicializar o processador gráfico do dispositivo.');
    }

    canvas.width = width;
    canvas.height = height;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';

    if (mimeType === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(fonte, 0, 0, width, height);

    return await gerarResultadoDeCanvas(canvas, mimeType, quality);
  } finally {
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas = null;
    }
    ctx = null;
  }
}

function carregarImagemViaObjectUrl(
  arquivo: Blob,
  onObjectUrlCreated: (url: string) => void
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    let urlLocal: string | null = null;
    try {
      urlLocal = URL.createObjectURL(arquivo);
      onObjectUrlCreated(urlLocal);
    } catch {
      reject(new Error('Não foi possível ler o arquivo de imagem selecionado. Tente novamente.'));
      return;
    }

    const img = new Image();
    img.decoding = 'async';

    img.onload = () => {
      if (urlLocal) {
        URL.revokeObjectURL(urlLocal);
        urlLocal = null;
      }
      resolve(img);
    };

    img.onerror = () => {
      if (urlLocal) {
        URL.revokeObjectURL(urlLocal);
        urlLocal = null;
      }
      img.onload = null;
      img.onerror = null;
      img.src = '';
      reject(new Error('Falha ao decodificar a imagem. Verifique o arquivo e tente novamente.'));
    };

    img.src = urlLocal;
  });
}

/**
 * Comprime e redimensiona fotos capturadas ou selecionadas da galeria.
 * Evita decodificação full-resolution na heap JS usando createImageBitmap com downsampling nativo.
 */
export async function comprimirFotoProduto(
  arquivo: File | Blob,
  options?: CompressOptions
): Promise<CompressResult> {
  if (!arquivo || !(arquivo instanceof Blob)) {
    throw new Error('Arquivo de imagem inválido ou não fornecido.');
  }

  if (arquivo.type && !arquivo.type.startsWith('image/')) {
    throw new Error('O arquivo selecionado não é uma imagem válida. Formatos aceitos: JPG, PNG, WebP.');
  }

  const maxDimension = options?.maxDimension ?? MAX_DIMENSION_PADRAO;

  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;
  let img: HTMLImageElement | null = null;

  try {
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(arquivo, {
          resizeWidth: maxDimension,
          resizeQuality: 'medium'
        });
      } catch {
        bitmap = null;
      }
    }

    if (bitmap) {
      return await desenharEComprimirFonte(bitmap, bitmap.width, bitmap.height, options);
    }

    img = await carregarImagemViaObjectUrl(arquivo, (url) => {
      objectUrl = url;
    });

    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;
    return await desenharEComprimirFonte(img, origW, origH, options);
  } finally {
    if (bitmap) {
      try {
        bitmap.close();
      } catch {
        // Ignora erro caso o bitmap já tenha sido fechado
      }
      bitmap = null;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    if (img) {
      img.onload = null;
      img.onerror = null;
      img.src = '';
      img = null;
    }
  }
}

/**
 * Captura e comprime um frame diretamente de um elemento <video> ativo sem reter buffers intermediários.
 */
export async function comprimirFrameVideo(
  video: HTMLVideoElement,
  options?: CompressOptions
): Promise<CompressResult> {
  if (!video || video.readyState < 2) {
    throw new Error('A câmera ainda está sendo inicializada. Aguarde um instante e tente novamente.');
  }

  const maxDimension = options?.maxDimension ?? MAX_DIMENSION_PADRAO;
  const origW = video.videoWidth || maxDimension;
  const origH = video.videoHeight || maxDimension;

  return desenharEComprimirFonte(video, origW, origH, options);
}
