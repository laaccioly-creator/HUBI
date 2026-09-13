import { supabase } from '../lib/supabase';
import { Loja } from '../types';

export const STORAGE_KEY_SERPAPI_KEY = 'hubi_serpapi_key';

export interface FotoResultadoSerpApi {
  urlOriginal: string;
  urlThumbnail: string;
  titulo: string;
  fonte: string;
  posicao?: number;
  largura?: number;
  altura?: number;
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
 * Utilitários de log com badge colorido no console DevTools para fácil depuração
 */
const logSerp = (titulo: string, ...detalhes: any[]) => {
  console.log(
    `%c[HUBI SERPAPI]%c ${titulo}`,
    'background: #0284c7; color: #ffffff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
    'color: #0284c7; font-weight: bold;',
    ...detalhes
  );
};

const logSerpSucesso = (titulo: string, ...detalhes: any[]) => {
  console.log(
    `%c[HUBI SERPAPI ✅]%c ${titulo}`,
    'background: #16a34a; color: #ffffff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
    'color: #16a34a; font-weight: bold;',
    ...detalhes
  );
};

const logSerpAviso = (titulo: string, ...detalhes: any[]) => {
  console.warn(
    `%c[HUBI SERPAPI ⚠️]%c ${titulo}`,
    'background: #ea580c; color: #ffffff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
    'color: #ea580c; font-weight: bold;',
    ...detalhes
  );
};

const logSerpErro = (titulo: string, ...detalhes: any[]) => {
  console.error(
    `%c[HUBI SERPAPI ❌]%c ${titulo}`,
    'background: #dc2626; color: #ffffff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
    'color: #dc2626; font-weight: bold;',
    ...detalhes
  );
};

/**
 * Formata os itens brutos retornados pela SerpApi em FotoResultadoSerpApi
 * Prioriza imagens em alta resolução e filtra miniaturas excessivamente pequenas
 */
export const formatarResultadosSerpApi = (
  imagesResults: any[],
  queryTratada: string,
  num: number = 20
): FotoResultadoSerpApi[] => {
  const fotosFormatadas: FotoResultadoSerpApi[] = [];
  const urlsVistas = new Set<string>();

  for (let idx = 0; idx < imagesResults.length; idx++) {
    const item = imagesResults[idx];
    if (!item) continue;

    // Em SerpApi Google Images, original é o link direto do arquivo em alta resolução.
    // Nunca usar item.link porque é a URL da página web HTML.
    const originalUrl =
      item.original ||
      item.original_image?.link ||
      item.thumbnail ||
      '';

    const thumbnailUrl =
      item.thumbnail ||
      item.original ||
      '';

    if (!originalUrl || !originalUrl.startsWith('http')) continue;
    if (urlsVistas.has(originalUrl)) continue;

    const largura = typeof item.original_width === 'number' ? item.original_width : undefined;
    const altura = typeof item.original_height === 'number' ? item.original_height : undefined;

    // Se tiver dimensões conhecidas, ignora imagens minúsculas (< 250px) para evitar fotos borradas ou ícones
    if (largura && largura < 250 && altura && altura < 250) {
      continue;
    }

    urlsVistas.add(originalUrl);

    fotosFormatadas.push({
      urlOriginal: originalUrl,
      urlThumbnail: thumbnailUrl,
      titulo: item.title || queryTratada,
      fonte: item.source || item.domain || 'Google Imagens',
      posicao: item.position || idx + 1,
      largura,
      altura
    });

    if (fotosFormatadas.length >= num) break;
  }

  return fotosFormatadas;
};

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
 * Obtém a chave da SerpApi de forma assíncrona, consultando o banco de dados Supabase
 * caso não esteja no localStorage (essencial para dispositivos móveis ou novos navegadores)
 */
export const obterOuBuscarSerpApiKey = async (loja?: Loja | null): Promise<string> => {
  const chaveSincrona = obterSerpApiKey(loja);
  if (chaveSincrona) return chaveSincrona;

  if (loja?.id) {
    try {
      logSerp('Chave não encontrada localmente. Consultando Supabase para a loja:', loja.id);
      const { data, error } = await supabase
        .from('lojas')
        .select('serpapi_key, configuracoes_extras')
        .eq('id', loja.id)
        .maybeSingle();

      if (!error && data) {
        const chaveDb =
          data.serpapi_key ||
          (data.configuracoes_extras as any)?.ia?.serpapi_key ||
          '';

        if (chaveDb && typeof chaveDb === 'string') {
          const limpa = chaveDb.trim();
          if (limpa) {
            localStorage.setItem(STORAGE_KEY_SERPAPI_KEY, limpa);
            logSerpSucesso('Chave SerpApi obtida do Supabase e sincronizada no dispositivo móvel!');
            return limpa;
          }
        }
      }
    } catch (e: any) {
      logSerpAviso('Erro ao buscar chave SerpApi do Supabase:', e.message);
    }
  }

  return '';
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
  logSerp('Salvando chave SerpApi...', { 
    lojaId, 
    chaveMascarada: chaveLimpa ? `${chaveLimpa.slice(0, 4)}...${chaveLimpa.slice(-4)}` : '(vazia)' 
  });

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
      logSerpErro('Erro ao persistir chave SerpApi no Supabase:', error);
      throw new Error(`Não foi possível salvar a chave no banco: ${error.message}`);
    }
    logSerpSucesso('Chave SerpApi persistida no Supabase com sucesso.');
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
  const chaveMascarada = chaveLimpa.length > 8
    ? `${chaveLimpa.slice(0, 4)}...${chaveLimpa.slice(-4)}`
    : '***';

  logSerp('🔑 Iniciando teste de conexão com a SerpApi...', { chave: chaveMascarada });

  if (!chaveLimpa) {
    logSerpErro('Chave de API não informada para o teste.');
    return { sucesso: false, mensagem: 'Informe uma chave de API para testar.' };
  }

  // -------------------------------------------------------------------------
  // MÉTODO 1: Supabase RPC (PostgreSQL extensions.http) - Mais Confiável (Sem CORS)
  // -------------------------------------------------------------------------
  try {
    logSerp('📡 [Método 1/4] Supabase RPC (testar_conexao_serpapi_rpc)...');
    const { data: rpcData, error: rpcError } = await supabase.rpc('testar_conexao_serpapi_rpc', {
      p_api_key: chaveLimpa
    });

    if (!rpcError && rpcData) {
      logSerp('📥 Resposta bruta do Supabase RPC:', rpcData);
      if (rpcData.sucesso) {
        logSerpSucesso('Conexão estabelecida com sucesso via Supabase RPC!', {
          plano: rpcData.plano,
          buscasRestantes: rpcData.buscasRestantes,
          buscasMes: rpcData.buscasMes
        });
        return {
          sucesso: true,
          mensagem: rpcData.mensagem || 'Conexão estabelecida com sucesso com a SerpApi!',
          plano: rpcData.plano || 'Plano Gratuito (Free)',
          buscasRestantes: typeof rpcData.buscasRestantes === 'number' ? rpcData.buscasRestantes : undefined
        };
      } else {
        logSerpErro('Supabase RPC validou com erro:', rpcData.mensagem);
        return {
          sucesso: false,
          mensagem: rpcData.mensagem || 'Chave de API inválida.'
        };
      }
    }

    if (rpcError) {
      logSerpAviso('Função RPC ainda não existe no banco ou retornou erro:', rpcError.message);
    }
  } catch (err: any) {
    logSerpAviso('Exceção ao chamar Supabase RPC:', err.message);
  }

  // -------------------------------------------------------------------------
  // MÉTODO 2: Supabase Edge Function (se implantada)
  // -------------------------------------------------------------------------
  try {
    logSerp('📡 [Método 2/4] Tentando Supabase Edge Function (buscar-fotos-serpapi)...');
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('buscar-fotos-serpapi', {
      body: { action: 'account', api_key: chaveLimpa }
    });

    if (!edgeError && edgeData && edgeData.account) {
      logSerpSucesso('Conexão testada com sucesso via Edge Function!', edgeData);
      return {
        sucesso: true,
        mensagem: 'Conexão estabelecida com sucesso com a SerpApi!',
        plano: edgeData.account?.plan_name || 'Plano Gratuito (Free)',
        buscasRestantes: edgeData.account?.total_searches_left
      };
    }
    if (edgeError) {
      logSerpAviso('Edge Function não disponível:', edgeError.message);
    }
  } catch (e: any) {
    logSerpAviso('Exceção ao invocar Edge Function:', e.message);
  }

  // -------------------------------------------------------------------------
  // MÉTODO 3: Proxy local de desenvolvimento (/api/buscar-fotos-serpapi)
  // -------------------------------------------------------------------------
  try {
    logSerp('📡 [Método 3/4] Tentando proxy local de desenvolvimento (/api/buscar-fotos-serpapi)...');
    const accountUrl = `/api/buscar-fotos-serpapi?action=account&api_key=${encodeURIComponent(chaveLimpa)}`;
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(accountUrl, { signal: ctrl.signal });
    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      logSerp('📥 Resposta do proxy local:', data);

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
        logSerpSucesso('Conexão testada com sucesso via proxy local!', data);
        return {
          sucesso: true,
          mensagem: 'Conexão estabelecida com sucesso com a SerpApi!',
          plano: data.plan_name || 'Plano Gratuito (Free)',
          buscasRestantes: typeof data.total_searches_left === 'number' ? data.total_searches_left : undefined
        };
      }
    } else {
      logSerpAviso('Proxy local retornou HTML (fallback SPA estático). Ignorando...');
    }
  } catch (e: any) {
    logSerpAviso('Proxy local indisponível:', e.message);
  }

  // -------------------------------------------------------------------------
  // MÉTODO 4: Chamada direta ao endpoint da SerpApi (sujeita a CORS no browser)
  // -------------------------------------------------------------------------
  try {
    logSerp('📡 [Método 4/4] Tentando chamada direta à SerpApi (account.json)...');
    const directUrl = `https://serpapi.com/account.json?api_key=${encodeURIComponent(chaveLimpa)}`;
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(directUrl, { signal: ctrl.signal });
    clearTimeout(timeoutId);

    const data = await res.json();
    if (res.status === 401 || res.status === 403) {
      return { sucesso: false, mensagem: 'Chave de API inválida na SerpApi.' };
    }
    if (res.ok) {
      logSerpSucesso('Conexão testada com sucesso via direct fetch!', data);
      return {
        sucesso: true,
        mensagem: 'Conexão estabelecida com sucesso com a SerpApi!',
        plano: data.plan_name || 'Plano Gratuito (Free)',
        buscasRestantes: typeof data.total_searches_left === 'number' ? data.total_searches_left : undefined
      };
    }
  } catch (e: any) {
    logSerpAviso('Chamada direta falhou (CORS esperado no browser):', e.message);
  }

  logSerpErro('Nenhum método conseguiu validar a chave SerpApi com sucesso.');
  return {
    sucesso: false,
    mensagem: 'Não foi possível validar a chave. Por favor, execute o SQL das funções RPC no Supabase para habilitar a conexão direta do servidor.'
  };
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
  let chaveLimpa = (apiKey || '').trim();
  const lojaId = opcoes?.lojaId;

  // Se não tem chave no argumento, tenta pegar do localStorage
  if (!chaveLimpa) {
    chaveLimpa = (localStorage.getItem(STORAGE_KEY_SERPAPI_KEY) || '').trim();
  }

  const chaveMascarada = chaveLimpa.length > 8
    ? `${chaveLimpa.slice(0, 4)}...${chaveLimpa.slice(-4)}`
    : chaveLimpa ? '***' : '(busca via lojaId no banco)';

  const queryTratada = termo
    .replace(/^[\d\w#.-]+\s*-\s*/, '')
    .replace(/^[0-9]+\s+/, '')
    .trim();

  const queryFinal = `${queryTratada} produto`;
  const num = opcoes?.numResultados || 20;

  logSerp(`🔍 Iniciando busca de fotos Google Images na SerpApi...`, {
    termoOriginal: termo,
    termoPesquisa: queryFinal,
    chave: chaveMascarada,
    lojaId: lojaId || 'N/A',
    quantidadeDesejada: num
  });

  if (!chaveLimpa && !lojaId) {
    logSerpErro('Chave SerpApi não configurada e Loja ID não fornecido.');
    throw new SerpApiAuthError('Chave SerpApi não configurada.');
  }

  if (!queryTratada) {
    logSerpAviso('Termo de busca vazio após sanitização.');
    return [];
  }

  // =========================================================================
  // MÉTODO 1: Supabase RPC (PostgreSQL extensions.http) - 100% robusto sem CORS
  // =========================================================================
  try {
    logSerp('📡 [Método 1/4] Supabase RPC (buscar_fotos_serpapi_rpc)...');
    let rpcResponse = await supabase.rpc('buscar_fotos_serpapi_rpc', {
      p_termo: queryFinal,
      p_loja_id: lojaId || null,
      p_api_key: chaveLimpa || null,
      p_num: num
    });

    // Se a primeira chamada falhar por timeout de conexão inicial (quando a SerpApi está raspando o termo pela 1ª vez),
    // aguarda 2s e faz uma retentativa automática (pois a SerpApi já concluiu o scrape no servidor e retorna em 0.2s)
    if (rpcResponse.error && (
      rpcResponse.error.code === '57014' ||
      rpcResponse.error.message?.toLowerCase().includes('timeout') ||
      rpcResponse.error.message?.toLowerCase().includes('canceling')
    )) {
      logSerpAviso('Timeout na primeira raspagem da SerpApi. Retentando automaticamente em 2s com cache quente...');
      await new Promise(res => setTimeout(res, 2000));
      rpcResponse = await supabase.rpc('buscar_fotos_serpapi_rpc', {
        p_termo: queryFinal,
        p_loja_id: lojaId || null,
        p_api_key: chaveLimpa || null,
        p_num: num
      });
    }

    const { data: rpcData, error: rpcError } = rpcResponse;

    if (!rpcError && rpcData) {
      logSerp('📥 Resposta bruta do Supabase RPC:', rpcData);

      if (rpcData.error_type === 'quota' || rpcData.status === 429) {
        logSerpErro('Cota mensal de 250 buscas da SerpApi atingida!');
        throw new SerpApiQuotaError(rpcData.mensagem);
      }
      if (rpcData.error_type === 'auth' || rpcData.status === 401 || rpcData.status === 403) {
        logSerpErro('Chave SerpApi inválida ou sem permissão:', rpcData.mensagem);
        throw new SerpApiAuthError(rpcData.mensagem);
      }

      if (rpcData.sucesso && Array.isArray(rpcData.results)) {
        if (rpcData.results.length > 0) {
          const fotos = formatarResultadosSerpApi(rpcData.results, queryTratada, num);
          logSerpSucesso(`Encontradas ${fotos.length} fotos via Supabase RPC!`, fotos);
          return fotos;
        } else {
          logSerpAviso(`Busca concluída na SerpApi, mas nenhum resultado encontrado para "${queryFinal}".`);
          return [];
        }
      }
    }

    if (rpcError) {
      logSerpAviso('Função RPC não disponível ou retornou erro no Supabase:', rpcError.message);
    }
  } catch (err: any) {
    if (err instanceof SerpApiQuotaError || err instanceof SerpApiAuthError) {
      throw err;
    }
    logSerpAviso('Exceção ao executar busca via Supabase RPC:', err.message);
  }

  // =========================================================================
  // MÉTODO 2: Supabase Edge Function (se implantada)
  // =========================================================================
  try {
    logSerp('📡 [Método 2/4] Supabase Edge Function (buscar-fotos-serpapi)...');
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('buscar-fotos-serpapi', {
      body: {
        q: queryFinal,
        api_key: chaveLimpa,
        loja_id: opcoes?.lojaId,
        num
      }
    });

    if (!edgeError && edgeData) {
      if (edgeData.error_type === 'quota') {
        logSerpErro('Cota mensal da SerpApi excedida (via Edge Function).');
        throw new SerpApiQuotaError(edgeData.error);
      }
      if (edgeData.error_type === 'auth') {
        logSerpErro('Chave inválida na SerpApi (via Edge Function).');
        throw new SerpApiAuthError(edgeData.error);
      }
      if (Array.isArray(edgeData.results) && edgeData.results.length > 0) {
        logSerpSucesso(`Encontradas ${edgeData.results.length} fotos via Edge Function!`, edgeData.results);
        return edgeData.results;
      }
    }
    if (edgeError) {
      logSerpAviso('Edge Function indisponível:', edgeError.message);
    }
  } catch (e: any) {
    if (e instanceof SerpApiQuotaError || e instanceof SerpApiAuthError) {
      throw e;
    }
    logSerpAviso('Exceção na Edge Function:', e.message);
  }

  const params = new URLSearchParams({
    engine: 'google_images',
    q: queryFinal,
    hl: 'pt',
    gl: 'br',
    api_key: chaveLimpa
  });

  // =========================================================================
  // MÉTODO 3: Proxy local de desenvolvimento (/api/buscar-fotos-serpapi)
  // Apenas no ambiente de desenvolvimento local Vite
  // =========================================================================
  if (import.meta.env.DEV) {

    try {
      logSerp('📡 [Método 3/4] Proxy local de desenvolvimento (/api/buscar-fotos-serpapi)...');
      const urlLocal = `/api/buscar-fotos-serpapi?${params.toString()}`;
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 3000);
      const response = await fetch(urlLocal, { signal: ctrl.signal });
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const rawJson = await response.json();
        logSerp('📥 Resposta bruta do proxy local:', rawJson);

        if (
          response.status === 429 ||
          rawJson.error?.toLowerCase?.().includes('searches limit') ||
          rawJson.error?.toLowerCase?.().includes('run out of searches') ||
          rawJson.error?.toLowerCase?.().includes('quota')
        ) {
          logSerpErro('Cota mensal da SerpApi atingida.');
          throw new SerpApiQuotaError();
        }

        if (
          response.status === 401 ||
          response.status === 403 ||
          rawJson.error?.toLowerCase?.().includes('invalid api key') ||
          rawJson.error?.toLowerCase?.().includes('unauthorized')
        ) {
          logSerpErro('Chave SerpApi inválida no proxy local.');
          throw new SerpApiAuthError();
        }

        if (response.ok && (Array.isArray(rawJson.images_results) || Array.isArray(rawJson.results))) {
          const itens = rawJson.images_results || rawJson.results;
          const fotos = formatarResultadosSerpApi(itens, queryTratada, num);
          logSerpSucesso(`Encontradas ${fotos.length} fotos via proxy local!`, fotos);
          return fotos;
        }
      }
    } catch (e: any) {
      if (e instanceof SerpApiQuotaError || e instanceof SerpApiAuthError) {
        throw e;
      }
      logSerpAviso('Proxy local indisponível:', e.message);
    }
  }

  // =========================================================================
  // MÉTODO 4: Chamada direta à SerpApi (fallback)
  // =========================================================================
  try {
    logSerp('📡 [Método 4/4] Chamada direta à SerpApi (search.json)...');
    const urlDireta = `https://serpapi.com/search.json?${params.toString()}`;
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 10000);
    const response = await fetch(urlDireta, { signal: ctrl.signal });
    clearTimeout(timeoutId);

    const rawJson = await response.json();
    logSerp('📥 Resposta da SerpApi direta:', rawJson);

    if (
      response.status === 429 ||
      rawJson.error?.toLowerCase?.().includes('searches limit') ||
      rawJson.error?.toLowerCase?.().includes('run out of searches') ||
      rawJson.error?.toLowerCase?.().includes('quota')
    ) {
      throw new SerpApiQuotaError();
    }

    if (
      response.status === 401 ||
      response.status === 403 ||
      rawJson.error?.toLowerCase?.().includes('invalid api key') ||
      rawJson.error?.toLowerCase?.().includes('unauthorized')
    ) {
      throw new SerpApiAuthError();
    }

    if (response.ok && Array.isArray(rawJson.images_results)) {
      const fotos = formatarResultadosSerpApi(rawJson.images_results, queryTratada, num);
      logSerpSucesso(`Encontradas ${fotos.length} fotos via chamada direta!`, fotos);
      return fotos;
    }
  } catch (e: any) {
    if (e instanceof SerpApiQuotaError || e instanceof SerpApiAuthError) {
      throw e;
    }
    logSerpAviso('Chamada direta bloqueada (CORS no navegador):', e.message);
  }

  logSerpErro('Nenhum método conseguiu conectar com a SerpApi. Execute o SQL no Supabase para habilitar a busca via RPC do banco de dados.');
  return [];
};
