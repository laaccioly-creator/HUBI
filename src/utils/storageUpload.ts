import { supabase } from '../lib/supabase';
import {
  comprimirFotoProduto,
  type CompressOptions,
  type CompressResult
} from './imageCompressor';

function ehCompressResult(valor: File | Blob | CompressResult): valor is CompressResult {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    'blob' in valor &&
    'dataUrl' in valor
  );
}

function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Falha ao converter imagem comprimida para Data URL.'));
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler imagem comprimida.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Comprime (quando File) e envia a imagem para o Supabase Storage (bucket 'produtos' ou fallback 'fotos'),
 * retornando URL pública ou Data URL comprimido em caso de indisponibilidade de bucket.
 */
export async function uploadImagemComprimidaStorage(
  lojaId: string,
  pasta: string,
  origem: File | Blob | CompressResult,
  opcoes?: CompressOptions
): Promise<string> {
  let blobFinal: Blob;
  let dataUrlFallback = '';
  let previewParaRevogar: string | null = null;

  try {
    if (ehCompressResult(origem)) {
      blobFinal = origem.blob;
      dataUrlFallback = origem.dataUrl;
    } else if (origem instanceof File) {
      const comprimido = await comprimirFotoProduto(origem, opcoes);
      blobFinal = comprimido.blob;
      dataUrlFallback = comprimido.dataUrl;
      previewParaRevogar = comprimido.previewUrl;
    } else {
      blobFinal = origem;
      dataUrlFallback = await blobParaDataUrl(origem);
    }

    const sufixo = Math.random().toString(36).slice(2, 7);
    const pastaLimpa = pasta.replace(/^\/+|\/+$/g, '') || 'imagens';
    const fileName = `${pastaLimpa}/${lojaId}_${Date.now()}_${sufixo}.jpg`;

    for (const bucket of ['produtos', 'fotos']) {
      const uploadRes = await supabase.storage.from(bucket).upload(fileName, blobFinal, {
        upsert: true,
        contentType: 'image/jpeg'
      });

      if (!uploadRes.error) {
        const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(fileName);
        if (publicData?.publicUrl) {
          return publicData.publicUrl;
        }
      }
    }

    return dataUrlFallback;
  } finally {
    if (previewParaRevogar) {
      try {
        URL.revokeObjectURL(previewParaRevogar);
      } catch {
        // ignora falha ao revogar objectURL
      }
    }
  }
}
