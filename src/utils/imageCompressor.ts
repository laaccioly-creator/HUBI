/**
 * Utilitário de compressão de imagens de alta resolução no cliente (Client-side Image Compressor)
 * Especializado para ambientes móveis (PWA Mobile) para prevenir estouros de memória RAM (Out-of-Memory / OOM).
 *
 * Utiliza URL.createObjectURL para carregar a imagem de forma assíncrona sem instanciar strings
 * pesadas em Base64 na memória antes do redimensionamento pelo Canvas.
 */

export interface CompressOptions {
  maxDimension?: number; // Padrão: 1024 (ideal para visão computacional/OCR sem estourar RAM)
  quality?: number;      // Padrão: 0.75
  mimeType?: string;     // Padrão: 'image/jpeg'
}

export interface CompressResult {
  file: Blob;
  base64: string;
}

/**
 * Comprime e redimensiona fotos capturadas pela câmera ou selecionadas da galeria.
 * Reduz arquivos pesados de câmeras móveis (12MP-48MP / 8MB-25MB) para ~150KB-250KB em resolução máxima de 1024px.
 */
export async function comprimirFotoProduto(
  file: File | Blob,
  options?: CompressOptions
): Promise<CompressResult> {
  return new Promise((resolve, reject) => {
    if (!file || !(file instanceof Blob)) {
      reject(new Error('Arquivo de imagem inválido ou não fornecido.'));
      return;
    }

    if (file.type && !file.type.startsWith('image/')) {
      reject(new Error('O arquivo selecionado não é uma imagem válida. Formatos aceitos: JPG, PNG, WebP.'));
      return;
    }

    const maxDimension = options?.maxDimension ?? 1024;
    const quality = options?.quality ?? 0.75;
    const mimeType = options?.mimeType ?? 'image/jpeg';

    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch (err) {
      reject(new Error('Não foi possível ler o arquivo da câmera. Tente novamente.'));
      return;
    }

    const img = new Image();
    img.decoding = 'async';

    img.onload = () => {
      // Revogar o Object URL imediatamente no onload para liberar o ponteiro de memória do navegador
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }

      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width <= 0 || height <= 0) {
          width = maxDimension;
          height = maxDimension;
        }

        // Escalar proporcionalmente o aspect ratio mantendo o maior lado em no máximo maxDimension (1024px)
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        let canvas: HTMLCanvasElement | null = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        let ctx: CanvasRenderingContext2D | null = canvas.getContext('2d', {
          alpha: false,
          willReadFrequently: false
        });

        if (!ctx) {
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
          canvas = null;
          reject(new Error('Não foi possível inicializar o processador gráfico do dispositivo.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';

        // Fundo branco caso haja transparência convertida para JPEG
        if (mimeType === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL(mimeType, quality);

        canvas.toBlob(
          (blob) => {
            // Limpeza explícita do contexto gráfico e canvas para descarte imediato pelo garbage collector
            if (ctx) {
              ctx.clearRect(0, 0, width, height);
            }
            if (canvas) {
              canvas.width = 0;
              canvas.height = 0;
            }
            canvas = null;
            ctx = null;
            img.src = '';

            if (blob) {
              resolve({ file: blob, base64 });
            } else {
              // Fallback defensivo caso canvas.toBlob falhe em WebViews antigas
              try {
                const parts = base64.split(',');
                const byteString = atob(parts[1] || parts[0]);
                const arrayBuffer = new ArrayBuffer(byteString.length);
                const uint8Array = new Uint8Array(arrayBuffer);
                for (let i = 0; i < byteString.length; i++) {
                  uint8Array[i] = byteString.charCodeAt(i);
                }
                const fallbackBlob = new Blob([arrayBuffer], { type: mimeType });
                resolve({ file: fallbackBlob, base64 });
              } catch (conversionErr) {
                reject(new Error('Erro ao gerar arquivo comprimido da foto.'));
              }
            }
          },
          mimeType,
          quality
        );
      } catch (procErr: any) {
        reject(new Error(procErr?.message || 'Falha ao processar e comprimir imagem.'));
      }
    };

    img.onerror = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      img.src = '';
      reject(new Error('Falha ao carregar a imagem capturada. Verifique as permissões da câmera e tente novamente.'));
    };

    img.src = objectUrl;
  });
}
