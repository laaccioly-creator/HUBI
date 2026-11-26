import { supabase } from '../lib/supabase';

export const PREFIXO_STORAGE_PROJETO =
  'https://eylpiwynsbnmcacmwiqg.supabase.co/storage/v1/object/public/';

/**
 * Verifica se a URL já pertence ao bucket público do Supabase Storage deste projeto.
 */
export function ehUrlStorageProjeto(url: string): boolean {
  const limpa = String(url || '').trim();
  return Boolean(limpa) && limpa.startsWith(PREFIXO_STORAGE_PROJETO);
}

/**
 * Indica se a URL é externa (http/https) e ainda precisa ser espelhada para o Storage próprio.
 */
export function ehUrlExternaParaEspelhar(url: string): boolean {
  const limpa = String(url || '').trim();
  if (!limpa) return false;
  if (!/^https?:\/\//i.test(limpa)) return false;
  return !ehUrlStorageProjeto(limpa);
}

/**
 * Espelha uma URL externa no bucket público `produtos` do Supabase Storage via Edge Function.
 * Em caso de indisponibilidade ou erro de CDN externa, preserva e retorna a URL original sem bloquear o fluxo.
 */
export async function espelharImagemParaStorage(
  url: string,
  lojaId: string,
  produtoId?: string
): Promise<string> {
  const urlLimpa = String(url || '').trim();
  if (!urlLimpa || !lojaId) return urlLimpa;

  // Não duplica URLs já hospedadas no projeto nem interfere com Data URLs / blob URLs
  if (!ehUrlExternaParaEspelhar(urlLimpa)) {
    return urlLimpa;
  }

  try {
    const { data, error } = await supabase.functions.invoke('espelhar-imagem-storage', {
      body: {
        url: urlLimpa,
        loja_id: lojaId,
        ...(produtoId ? { produto_id: produtoId } : {}),
      },
    });

    if (error) {
      console.warn('[imagemStorageService] Aviso ao invocar espelhar-imagem-storage; mantendo URL original.');
      return urlLimpa;
    }

    if (
      data?.sucesso === true &&
      typeof data.url_publica === 'string' &&
      ehUrlStorageProjeto(data.url_publica)
    ) {
      return data.url_publica;
    }

    return urlLimpa;
  } catch {
    console.warn('[imagemStorageService] Falha silenciosa ao espelhar imagem externa; mantendo URL original.');
    return urlLimpa;
  }
}

/**
 * Espelha todas as URLs externas de um produto em lote preservando a ordem e evitando uploads duplicados.
 */
export async function espelharListaImagensProduto(
  urls: string[],
  lojaId: string,
  produtoId?: string
): Promise<string[]> {
  if (!Array.isArray(urls) || urls.length === 0 || !lojaId) {
    return Array.isArray(urls) ? urls : [];
  }

  // Deduplica URLs externas idênticas dentro da mesma chamada para evitar uploads repetidos
  const promessasPorUrl = new Map<string, Promise<string>>();

  const obterPromessa = (urlOriginal: string): Promise<string> => {
    const limpa = String(urlOriginal || '').trim();
    if (!ehUrlExternaParaEspelhar(limpa)) {
      return Promise.resolve(limpa);
    }

    const existente = promessasPorUrl.get(limpa);
    if (existente) return existente;

    const novaPromessa = espelharImagemParaStorage(limpa, lojaId, produtoId);
    promessasPorUrl.set(limpa, novaPromessa);
    return novaPromessa;
  };

  const resolvidas = await Promise.all(urls.map((u) => obterPromessa(u)));
  return resolvidas.filter((u) => Boolean(u && u.trim()));
}
