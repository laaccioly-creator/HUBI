import { supabase } from '../lib/supabase';
import { Loja } from '../types';

export const STORAGE_KEY_SERPAPI_KEY = 'hubi_serpapi_key';

export interface FotoResultadoSerpApi {
  urlOriginal: string;
  urlThumbnail: string;
  titulo: string;
  fonte: string;
  posicao?: number;
}

export class SerpApiQuotaError extends Error {
  constructor(message = 'Limite de cota da SerpApi atingido (250 buscas mensais).') {
    super(message);
    this.name = 'SerpApiQuotaError';
  }
}

export class SerpApiAuthError extends Error {
  constructor(message = 'Chave de API SerpApi inválida ou não autorizada.') {
    super(message);
    this.name = 'SerpApiAuthError';
  }
}

/**
 * Obtém a chave da SerpApi configurada na loja ou no armazenamento local
 */
export const obterSerpApiKey = (loja?: Loja | null): string => {
  const chaveLoja =
    loja?.serpapi_key ||
    loja?.configuracoes_extras?.ia?.serpapi_key ||
    localStorage.getItem(STORAGE_KEY_SERPAPI_KEY) ||
    '';
  return chaveLoja.trim();
};

/**
 * Salva a chave SerpApi na tabela `lojas` e no armazenamento local
 */
export const salvarSerpApiKey = async (
  chave: string,
  lojaId?: string,
  lojaAtual?: Loja | null
): Promise<void> => {
  const chaveLimpa = chave.trim();

  // 1. Salvar no localStorage para acesso síncrono rápido
  if (chaveLimpa) {
    localStorage.setItem(STORAGE_KEY_SERPAPI_KEY, chaveLimpa);
  } else {
    localStorage.removeItem(STORAGE_KEY_SERPAPI_KEY);
  }

  // 2. Persistir no Supabase com isolamento multi-tenant
  if (lojaId) {
    const extrasAtual = (lojaAtual?.configuracoes_extras || {}) as any;
    const novosExtras = {
      ...extrasAtual,
      ia: {
        ...(extrasAtual.ia || {}),
        serpapi_key: chaveLimpa || undefined
      }
    };

    const { error } = await supabase
      .from('lojas')
      .update({
        serpapi_key: chaveLimpa || null,
        configuracoes_extras: novosExtras
      })
      .eq('id', lojaId);

    if (error) {
      console.error('Erro ao persistir chave SerpApi no Supabase:', error);
      throw new Error(`Não foi possível salvar a chave no banco: ${error.message}`);
    }
  }
};

/**
 * Testa a conexão com a SerpApi utilizando a chave fornecida
 */
export const testarConexaoSerpApi = async (
  apiKey: string
): Promise<{
  sucesso: boolean;
  mensagem: string;
  plano?: string;
  buscasRestantes?: number;
}> => {
  const chaveLimpa = apiKey.trim();
  if (!chaveLimpa) {
    return { sucesso: false, mensagem: 'Informe uma chave de API para testar.' };
  }

  try {
    // Tenta primeiro consultar a rota de conta da SerpApi via middleware local ou edge function
    const accountUrl = `/api/buscar-fotos-serpapi?action=account&api_key=${encodeURIComponent(chaveLimpa)}`;
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 8000);

    let res: Response;
    try {
      res = await fetch(accountUrl, { signal: ctrl.signal });
    } catch {
      // Se falhar a rota local (ex: produção estática), tenta busca direta de teste de imagem
      const directUrl = `https://serpapi.com/account.json?api_key=${encodeURIComponent(chaveLimpa)}`;
      res = await fetch(directUrl, { signal: ctrl.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 401 || res.status === 403 || data.error?.toLowerCase?.().includes('invalid api key')) {
      return {
        sucesso: false,
        mensagem: 'Chave de API inválida. Verifique o código copiado do painel da SerpApi.'
      };
    }

    if (res.status === 429 || data.error?.toLowerCase?.().includes('searches limit')) {
      return {
        sucesso: false,
        mensagem: 'Limite mensal da cota gratuita atingido na SerpApi.'
      };
    }

    if (res.ok) {
      const plano = data.plan_name || 'Plano Gratuito (Free)';
      const restantes = typeof data.total_searches_left === 'number' ? data.total_searches_left : undefined;
      return {
        sucesso: true,
        mensagem: 'Conexão estabelecida com sucesso com a SerpApi!',
        plano,
        buscasRestantes: restantes
      };
    }

    return {
      sucesso: true,
      mensagem: 'Chave autenticada com sucesso!'
    };
  } catch (err: any) {
    console.warn('Aviso no teste de conexão SerpApi:', err);
    return {
      sucesso: false,
      mensagem: err.message || 'Erro ao conectar com os servidores da SerpApi.'
    };
  }
};

/**
 * Executa a busca de fotos no Google Images via SerpApi
 */
export const buscarFotosGoogleImagesSerpApi = async (
  termo: string,
  apiKey: string,
  opcoes?: {
    lojaId?: string;
    numResultados?: number;
  }
): Promise<FotoResultadoSerpApi[]> => {
  const chaveLimpa = apiKey.trim();
  if (!chaveLimpa) {
    throw new SerpApiAuthError('Chave SerpApi não configurada.');
  }

  const queryTratada = termo
    .replace(/^[\d\w#.-]+\s*-\s*/, '')
    .replace(/^[0-9]+\s+/, '')
    .trim();

  if (!queryTratada) {
    return [];
  }

  // Termo auxiliar para garantir fotos com qualidade de catálogo
  const queryFinal = `${queryTratada} produto`;
  const num = opcoes?.numResultados || 20;

  // 1. Tentar via Supabase Edge Function se configurada
  try {
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('buscar-fotos-serpapi', {
      body: {
        q: queryFinal,
        api_key: chaveLimpa,
        loja_id: opcoes?.lojaId,
        num
      }
    });

    if (!edgeError && edgeData && Array.isArray(edgeData.results) && edgeData.results.length > 0) {
      return edgeData.results;
    }

    if (edgeData?.error_type === 'quota') {
      throw new SerpApiQuotaError(edgeData.error);
    }
    if (edgeData?.error_type === 'auth') {
      throw new SerpApiAuthError(edgeData.error);
    }
  } catch (e: any) {
    if (e instanceof SerpApiQuotaError || e instanceof SerpApiAuthError) {
      throw e;
    }
    // Se a Edge Function não estiver implantada ou falhar na rede, prosseguir para o middleware/fallback
  }

  // 2. Roteamento via middleware local / proxy (Vite Dev Server ou Backend)
  const params = new URLSearchParams({
    engine: 'google_images',
    q: queryFinal,
    hl: 'pt',
    gl: 'br',
    api_key: chaveLimpa
  });

  const urlLocal = `/api/buscar-fotos-serpapi?${params.toString()}`;
  let response: Response;

  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 12000);
    response = await fetch(urlLocal, { signal: ctrl.signal });
    clearTimeout(timeoutId);
  } catch {
    // 3. Fallback Direto à API da SerpApi
    const urlDireta = `https://serpapi.com/search.json?${params.toString()}`;
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 12000);
    response = await fetch(urlDireta, { signal: ctrl.signal });
    clearTimeout(timeoutId);
  }

  const rawJson = await response.json().catch(() => ({}));

  // Tratamento de cota esgotada (429 ou campo de erro)
  if (
    response.status === 429 ||
    rawJson.error?.toLowerCase?.().includes('searches limit') ||
    rawJson.error?.toLowerCase?.().includes('run out of searches') ||
    rawJson.error?.toLowerCase?.().includes('quota')
  ) {
    throw new SerpApiQuotaError();
  }

  // Tratamento de autenticação / chave inválida (401 / 403)
  if (
    response.status === 401 ||
    response.status === 403 ||
    rawJson.error?.toLowerCase?.().includes('invalid api key') ||
    rawJson.error?.toLowerCase?.().includes('unauthorized')
  ) {
    throw new SerpApiAuthError();
  }

  if (!response.ok) {
    throw new Error(rawJson.error || `Erro na busca SerpApi (Código HTTP ${response.status})`);
  }

  const imagesResults = Array.isArray(rawJson.images_results)
    ? rawJson.images_results
    : Array.isArray(rawJson.results)
    ? rawJson.results
    : [];

  const fotosFormatadas: FotoResultadoSerpApi[] = [];
  const urlsVistas = new Set<string>();

  for (let idx = 0; idx < imagesResults.length; idx++) {
    const item = imagesResults[idx];
    if (!item) continue;

    const originalUrl =
      item.original ||
      item.original_image?.link ||
      item.link ||
      item.thumbnail ||
      '';

    const thumbnailUrl =
      item.thumbnail ||
      item.original ||
      item.link ||
      '';

    if (!originalUrl || !originalUrl.startsWith('http')) continue;
    if (urlsVistas.has(originalUrl)) continue;

    urlsVistas.add(originalUrl);

    fotosFormatadas.push({
      urlOriginal: originalUrl,
      urlThumbnail: thumbnailUrl,
      titulo: item.title || queryTratada,
      fonte: item.source || item.domain || 'Google Imagens',
      posicao: item.position || idx + 1
    });

    if (fotosFormatadas.length >= num) break;
  }

  return fotosFormatadas;
};
