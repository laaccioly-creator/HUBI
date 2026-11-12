import { supabase } from '../lib/supabase';
import { Loja } from '../types';
import { configuracoesPlataformaService } from './configuracoesPlataformaService';

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
  constructor(message = 'Limite de cota de pesquisas gratuitas do Serper.dev atingido.') {
    super(message);
    this.name = 'SerpApiQuotaError';
  }
}

export class SerpApiAuthError extends Error {
  constructor(message = 'Chave do Serper.dev inválida ou expirada.') {
    super(message);
    this.name = 'SerpApiAuthError';
  }
}

/**
 * Utilitários de log com badge colorido no console DevTools para fácil depuração
 */
const logSerp = (titulo: string, ...detalhes: any[]) => {
  console.log(
    `%c[HUBI SERPER]%c ${titulo}`,
    'background: #0284c7; color: #ffffff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
    'color: #0284c7; font-weight: bold;',
    ...detalhes
  );
};

const logSerpSucesso = (titulo: string, ...detalhes: any[]) => {
  console.log(
    `%c[HUBI SERPER ✅]%c ${titulo}`,
    'background: #16a34a; color: #ffffff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
    'color: #16a34a; font-weight: bold;',
    ...detalhes
  );
};

const logSerpAviso = (titulo: string, ...detalhes: any[]) => {
  console.warn(
    `%c[HUBI SERPER ⚠️]%c ${titulo}`,
    'background: #ea580c; color: #ffffff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
    'color: #ea580c; font-weight: bold;',
    ...detalhes
  );
};

const logSerpErro = (titulo: string, ...detalhes: any[]) => {
  console.error(
    `%c[HUBI SERPER ❌]%c ${titulo}`,
    'background: #dc2626; color: #ffffff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
    'color: #dc2626; font-weight: bold;',
    ...detalhes
  );
};

/**
 * Sanitiza o termo de busca para o Google Imagens:
 * - Remove códigos internos ou numerações de início (ex: "7633 - ")
 * - Remove variações e tamanhos com hífen (ex: " - Tamanho G", " - Tam P", " - G")
 * - Remove hifens isolados (para o Google não interpretar como operador de exclusão NOT)
 */
export const limparTermoParaBuscaGoogle = (termo: string): string => {
  if (!termo) return '';
  return termo
    .replace(/^[\d\w#.-]+\s*-\s*/, '')
    .replace(/^[0-9]+\s+/, '')
    .replace(/\s*[-–—(]\s*tamanho\s+[a-z0-9]+\s*\)?/gi, '')
    .replace(/\s*[-–—(]\s*tam\s+[a-z0-9]+\s*\)?/gi, '')
    .replace(/\s*[-–—(]\s*(p|m|g|gg|xg|xgg)\b\s*\)?/gi, '')
    .replace(/\s*[-–—(]\s*(grande|pequeno|medio|médio)\b\s*\)?/gi, '')
    .replace(/\s*[-–—]\s*/g, ' ')
    .replace(/[/\\|_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Extrai uma query enxuta (3 a 5 palavras principais) a partir do nome ou descrição.
 * Elimina stop words e termos secundários para acelerar o scraping e indexação do Google Imagens.
 */
export const extrairTermoEnxutoBusca = (termo: string, maxPalavras = 4): string => {
  const limpo = limparTermoParaBuscaGoogle(termo);
  if (!limpo) return '';

  const palavras = limpo.split(/\s+/).filter(Boolean);
  if (palavras.length <= maxPalavras) return limpo;

  const stopWords = new Set([
    'de', 'do', 'da', 'dos', 'das', 'para', 'com', 'sem', 'em', 'no', 'na', 'nos', 'nas',
    'por', 'pelo', 'pela', 'um', 'uma', 'uns', 'umas', 'o', 'a', 'os', 'as', 'e', 'ou'
  ]);

  const filtradas: string[] = [];
  for (const p of palavras) {
    if (!stopWords.has(p.toLowerCase())) {
      filtradas.push(p);
      if (filtradas.length >= maxPalavras) break;
    }
  }

  return (filtradas.length > 0 ? filtradas : palavras.slice(0, maxPalavras)).join(' ');
};

/**
 * Extrai o termo principal limpo do produto para o Radar de Preços (SerpApi Shopping / Search),
 * removendo adjetivos promocionais ou especificações técnicas excessivas (ex: "Alta Velocidade 600mm/s",
 * "Envio Imediato", "Nota Fiscal", "Bivolt") que restringem a quantidade de lojas retornadas.
 */
export const extrairTermoPrincipalProduto = (termo: string): string => {
  const base = limparTermoParaBuscaGoogle(termo);
  if (!base) return '';

  const semRuido = base
    .replace(/\b(?:alta\s+velocidade|velocidade\s+m[aá]xima|envio\s+imediato|pronta\s+entrega|com\s+nota\s+fiscal|nota\s+fiscal|nf-?e?|garantia\s+oficial|100%\s+original|original\s+lacrad[oa]|lacrad[oa]|promo[cç][aã]o|oferta|super\s+r[aá]pid[oa]|bivolt|110v\s*\/?\s*220v|220v\s*\/?\s*110v)\b/gi, ' ')
    .replace(/\b\d+\s*(?:mm\/s|mm\/s²|rpm|hz|khz|mhz|w\s+rms)\b/gi, ' ')
    .replace(/\b\d{2,4}\s*[xX×]\s*\d{2,4}(?:\s*[xX×]\s*\d{2,4})?\s*(?:mm|cm)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const palavras = (semRuido || base).split(/\s+/).filter(Boolean);
  if (palavras.length <= 6) {
    return palavras.join(' ');
  }
  return palavras.slice(0, 6).join(' ');
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
  const fotosReserva: FotoResultadoSerpApi[] = [];
  const urlsVistas = new Set<string>();

  for (let idx = 0; idx < imagesResults.length; idx++) {
    const item = imagesResults[idx];
    if (!item) continue;

    // Em Serper/SerpApi Google Images, recupera a URL direta da imagem em alta resolução
    const originalUrl =
      item.url ||
      item.imageUrl ||
      item.urlOriginal ||
      item.original ||
      item.original_image?.link ||
      item.thumbnail ||
      '';

    const thumbnailUrl =
      item.urlThumbnail ||
      item.thumbnailUrl ||
      item.thumbnail ||
      item.url ||
      item.imageUrl ||
      item.original ||
      '';

    if (!originalUrl || !originalUrl.startsWith('http')) continue;
    if (urlsVistas.has(originalUrl)) continue;

    const largura = typeof item.largura === 'number'
      ? item.largura
      : typeof item.width === 'number'
      ? item.width
      : typeof item.imageWidth === 'number'
      ? item.imageWidth
      : typeof item.original_width === 'number'
      ? item.original_width
      : undefined;

    const altura = typeof item.altura === 'number'
      ? item.altura
      : typeof item.height === 'number'
      ? item.height
      : typeof item.imageHeight === 'number'
      ? item.imageHeight
      : typeof item.original_height === 'number'
      ? item.original_height
      : undefined;

    const fonteLower = (item.source || item.domain || '').toLowerCase();
    const linkLower = (item.link || item.original || '').toLowerCase();
    const tituloLower = (item.title || '').toLowerCase();

    if (tituloLower.includes('meme') || tituloLower.includes('viral') || tituloLower.includes('animal mais feio')) {
      continue;
    }

    const fotoObj: FotoResultadoSerpApi = {
      urlOriginal: originalUrl,
      urlThumbnail: thumbnailUrl,
      titulo: item.titulo || item.title || queryTratada,
      fonte: item.fonte || item.source || item.domain || 'Google Imagens',
      posicao: item.posicao || item.position || idx + 1,
      largura,
      altura
    };

    const ehResolucaoBaixa = Boolean(largura && largura < 200 && altura && altura < 200);
    const fontesNaoComerciais = ['tiktok', 'giphy', 'tenor', 'shutterstock', 'istockphoto'];
    const ehFonteReserva = fontesNaoComerciais.some(f => fonteLower.includes(f) || linkLower.includes(f));

    urlsVistas.add(originalUrl);

    if (ehResolucaoBaixa || ehFonteReserva) {
      fotosReserva.push(fotoObj);
    } else {
      fotosFormatadas.push(fotoObj);
    }

    if (fotosFormatadas.length >= num) break;
  }

  // Garante no mínimo 8 fotos disponíveis quando houver reservas válidas
  if (fotosFormatadas.length < 8 && fotosReserva.length > 0) {
    for (const res of fotosReserva) {
      if (fotosFormatadas.length >= num) break;
      fotosFormatadas.push(res);
    }
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

  // 1. Prioridade: Parâmetros Globais da Plataforma HUBI (Super Admin)
  try {
    const params = await configuracoesPlataformaService.obterParametros();
    if (params?.serpapi_key && params.serpapi_key.trim()) {
      const limpa = params.serpapi_key.trim();
      localStorage.setItem(STORAGE_KEY_SERPAPI_KEY, limpa);
      logSerpSucesso('Chave SerpApi obtida dos Parâmetros Globais HUBI e sincronizada localmente!');
      return limpa;
    }
  } catch (errPlat: any) {
    logSerpAviso('Aviso ao consultar serpapi_key em configuracoes_plataforma:', errPlat?.message);
  }

  // 2. Fallback Transitório: Consultar Supabase na tabela lojas
  if (loja?.id) {
    try {
      logSerp('Chave global não encontrada. Consultando Supabase lojas como fallback:', loja.id);
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
            logSerpSucesso('Chave SerpApi obtida do Supabase lojas (fallback)!');
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
  lojaAtual?: Loja | null,
  apenasLocalStorage = false
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

  if (apenasLocalStorage) return;

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
  // MÉTODO 1: Supabase Edge Function (Serper.dev) - Padrão Canônico
  // -------------------------------------------------------------------------
  try {
    logSerp('📡 [Método 1/4] Supabase Edge Function Serper.dev (buscar-fotos-serpapi)...');
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('buscar-fotos-serpapi', {
      body: { q: 'teste', api_key: chaveLimpa, num: 1 }
    });

    if (!edgeError && edgeData && (Array.isArray(edgeData.results) || Array.isArray(edgeData.images))) {
      logSerpSucesso('Conexão testada com sucesso via Edge Function Serper.dev!', edgeData);
      return {
        sucesso: true,
        mensagem: 'Conexão estabelecida com sucesso com o Serper.dev!',
        plano: 'Plano Gratuito (2.500 buscas)',
        buscasRestantes: 2500
      };
    }
    if (edgeError) {
      let msg = 'Chave do Serper.dev inválida ou expirada.';
      try {
        const body = await (edgeError as any)?.context?.json?.();
        if (body?.error) msg = body.error;
      } catch {}
      const status = (edgeError as any)?.context?.status;
      if (status === 401 || status === 403 || msg.toLowerCase().includes('chave') || msg.toLowerCase().includes('invalid')) {
        return { sucesso: false, mensagem: msg };
      }
    }
  } catch (e: any) {
    logSerpAviso('Exceção ao testar Edge Function Serper.dev:', e.message);
  }

  // -------------------------------------------------------------------------
  // MÉTODO 2: Supabase RPC (PostgreSQL extensions.http) - Fallback Legado
  // -------------------------------------------------------------------------
  try {
    logSerp('📡 [Método 2/4] Supabase RPC legado (testar_conexao_serpapi_rpc)...');
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

// Cache em Memória e sessionStorage para respostas instantâneas (0ms) e economia de cota
const cacheSerpMemoria = new Map<string, { timestamp: number; fotos: FotoResultadoSerpApi[] }>();

export const obterCacheSerp = (termo: string): FotoResultadoSerpApi[] | null => {
  const chave = `hubi_serp_cache_v15_${termo.toLowerCase().trim()}`;
  const emMemoria = cacheSerpMemoria.get(chave);
  if (emMemoria && Date.now() - emMemoria.timestamp < 1000 * 60 * 60 * 6) {
    return emMemoria.fotos;
  }
  try {
    const salvo = sessionStorage.getItem(chave);
    if (salvo) {
      const item = JSON.parse(salvo);
      if (Date.now() - item.timestamp < 1000 * 60 * 60 * 6) {
        cacheSerpMemoria.set(chave, item);
        return item.fotos;
      }
    }
  } catch {}
  return null;
};

export const salvarCacheSerp = (termo: string, fotos: FotoResultadoSerpApi[]) => {
  if (!fotos || fotos.length === 0) return;
  const chave = `hubi_serp_cache_v15_${termo.toLowerCase().trim()}`;
  const item = { timestamp: Date.now(), fotos };
  cacheSerpMemoria.set(chave, item);
  try {
    sessionStorage.setItem(chave, JSON.stringify(item));
  } catch {}
};

/**
 * Simplifica títulos longos de opções de IA em termos concisos (3-4 palavras)
 * para busca instantânea de miniaturas no Google Imagens (< 500ms)
 */
export const simplificarTermoParaMiniatura = (termo: string): string => {
  const limpo = limparTermoParaBuscaGoogle(termo);
  if (!limpo) return '';
  const stopwords = new Set(['com', 'de', 'do', 'da', 'dos', 'das', 'para', 'em', 'um', 'uma', 'e', 'o', 'a', 'os', 'as', 'tipo', 'versao', 'versão']);
  const palavras = limpo.split(' ').filter(p => !stopwords.has(p.toLowerCase()));
  return palavras.slice(0, 4).join(' ');
};

/**
 * Busca rápida de uma única miniatura leve para exibição nas opções do Modal de Dúvida da IA
 */
export const buscarMiniaturaProduto = async (
  termo: string,
  loja?: any,
  timeoutMs: number = 30000
): Promise<string | null> => {
  if (!termo || !termo.trim()) return null;

  const queryFinal = limparTermoParaBuscaGoogle(termo);
  if (!queryFinal) return null;

  // 1. Tenta obter do cache instantâneo (0ms)
  const emCache = obterCacheSerp(queryFinal);
  if (emCache && emCache.length > 0) {
    return emCache[0].urlThumbnail || null;
  }

  // 2. Chave SerpApi
  let serpApiKey = obterSerpApiKey(loja);
  if (!serpApiKey && loja?.id) {
    try {
      serpApiKey = await obterOuBuscarSerpApiKey(loja);
    } catch {}
  }

  if (serpApiKey || loja?.id) {
    try {
      const buscaPromise = buscarFotosGoogleImagesSerpApi(queryFinal, serpApiKey, {
        lojaId: loja?.id,
        numResultados: 2
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout miniatura')), timeoutMs)
      );

      const fotos = await Promise.race([buscaPromise, timeoutPromise]);
      if (fotos && fotos.length > 0) {
        // Retorna estritamente a miniatura comprimida do Google CDN (15-20KB), nunca imagem original pesada
        return fotos[0].urlThumbnail || null;
      }
    } catch {
      // Timeout gracioso para não travar o modal
    }
  }

  return null;
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

  const queryFinal = limparTermoParaBuscaGoogle(termo);
  const num = Math.min(opcoes?.numResultados || 20, 20);

  // 1. Verificação instantânea no Cache Local (Memória + sessionStorage)
  const fotosEmCache = obterCacheSerp(queryFinal);
  if (fotosEmCache && fotosEmCache.length > 0) {
    logSerpSucesso(`⚡ [CACHE INSTANTÂNEO] Recuperadas ${fotosEmCache.length} fotos em 0ms para "${queryFinal}"`);
    return fotosEmCache;
  }

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

  if (!queryFinal) {
    logSerpAviso('Termo de busca vazio após sanitização.');
    return [];
  }

  const params = new URLSearchParams({
    engine: 'google_images',
    q: queryFinal,
    hl: 'pt',
    gl: 'br',
    api_key: chaveLimpa,
    num: String(num)
  });

  // =========================================================================
  // MÉTODO 1: Proxy local de desenvolvimento (/api/buscar-fotos-serpapi)
  // Utilizado apenas em ambiente DEV quando a chave local está presente
  // =========================================================================
  if (import.meta.env.DEV && chaveLimpa) {
    try {
      logSerp('📡 [Método 1/2] Proxy local de desenvolvimento (/api/buscar-fotos-serpapi)...');
      const urlLocal = `/api/buscar-fotos-serpapi?${params.toString()}`;
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 30000);
      const response = await fetch(urlLocal, { signal: ctrl.signal });
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const rawJson = await response.json();
        logSerp('📥 Resposta do proxy local:', rawJson);

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
          if (!lojaId) throw new SerpApiAuthError();
          logSerpAviso('Proxy local sem chave válida, recorrendo ao Supabase...');
        } else if (response.ok && (Array.isArray(rawJson.images_results) || Array.isArray(rawJson.results))) {
          const itens = rawJson.images_results || rawJson.results;
          const fotos = formatarResultadosSerpApi(itens, queryFinal, num);
          if (fotos.length > 0) {
            logSerpSucesso(`Encontradas ${fotos.length} fotos via proxy local!`, fotos);
            salvarCacheSerp(queryFinal, fotos);
            return fotos;
          }
        }
      }
    } catch (e: any) {
      if (e instanceof SerpApiQuotaError || e instanceof SerpApiAuthError) {
        throw e;
      }
      logSerpAviso('Proxy local indisponível, recorrendo aos canais Supabase:', e.message);
    }
  }

  // =========================================================================
  // MÉTODO 2: Conexão Concorrente Segura (Supabase RPC + Supabase Edge Function)
  // Ambas são disparadas simultaneamente; a primeira a entregar fotos válidas vence.
  // Garante velocidade máxima (~5s a 7s em buscas inéditas, ~800ms em cache)
  // Timeout unificado de 14s (tempo seguro para qualquer raspagem de novos termos)
  // =========================================================================
  try {
    logSerp('📡 [Canais de Alta Performance] Disparando Supabase RPC e Edge Function em paralelo...');

    // Canal A: Supabase RPC (PostgreSQL direto com extensions.http)
    const promessaRpc = (async (): Promise<FotoResultadoSerpApi[]> => {
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('buscar_fotos_serpapi_rpc', {
          p_termo: queryFinal,
          p_loja_id: lojaId || null,
          p_api_key: chaveLimpa || null,
          p_num: num
        });

        if (!rpcError && rpcData) {
          if (rpcData.error_type === 'quota' || rpcData.status === 429) {
            throw new SerpApiQuotaError(rpcData.mensagem);
          }
          if (rpcData.error_type === 'auth' || rpcData.status === 401 || rpcData.status === 403) {
            logSerpAviso('RPC legado SerpApi retornou não autorizado (chave pode ser do Serper.dev):', rpcData.mensagem);
            return [];
          }
          if (rpcData.sucesso && Array.isArray(rpcData.results) && rpcData.results.length > 0) {
            return formatarResultadosSerpApi(rpcData.results, queryFinal, num);
          }
        }
      } catch (err: any) {
        if (err instanceof SerpApiQuotaError) throw err;
      }
      return [];
    })();

    // Canal B: Supabase Edge Function (buscar-fotos-serpapi no Deno Runtime / Serper.dev)
    const promessaEdge = (async (): Promise<FotoResultadoSerpApi[]> => {
      try {
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('buscar-fotos-serpapi', {
          body: {
            q: queryFinal,
            serpApiKey: chaveLimpa || undefined,
            api_key: chaveLimpa || undefined,
            loja_id: lojaId || undefined,
            num
          }
        });

        if (edgeError) {
          let errorMsg = 'Chave do Serper.dev inválida ou expirada.';
          let isAuth = false;
          let isQuota = false;
          try {
            if ((edgeError as any)?.context?.json) {
              const bodyJson = await (edgeError as any).context.json();
              if (bodyJson?.error) errorMsg = bodyJson.error;
              if (bodyJson?.error_type === 'auth') isAuth = true;
              if (bodyJson?.error_type === 'quota') isQuota = true;
            }
          } catch {
            // contexto já consumido
          }

          const status = (edgeError as any)?.context?.status;
          if (status === 401 || status === 403 || isAuth || errorMsg.toLowerCase().includes('chave')) {
            throw new SerpApiAuthError(errorMsg);
          }
          if (status === 429 || isQuota || errorMsg.toLowerCase().includes('cota') || errorMsg.toLowerCase().includes('quota')) {
            throw new SerpApiQuotaError(errorMsg);
          }
        }

        if (edgeData) {
          if (edgeData.error_type === 'quota' || edgeData.status === 429) {
            throw new SerpApiQuotaError(edgeData.error || 'Limite de cota de pesquisas gratuitas do Serper.dev atingido.');
          }
          if (edgeData.error_type === 'auth' || edgeData.status === 401 || edgeData.status === 403) {
            throw new SerpApiAuthError(edgeData.error || 'Chave do Serper.dev inválida ou expirada.');
          }
          const listaResultados = edgeData.results || edgeData.images || [];
          if (Array.isArray(listaResultados) && listaResultados.length > 0) {
            return formatarResultadosSerpApi(listaResultados, queryFinal, num);
          }
        }
      } catch (e: any) {
        if (e instanceof SerpApiQuotaError || e instanceof SerpApiAuthError) throw e;
      }
      return [];
    })();

    // Resolver com a primeira fonte que devolver fotos > 0
    const corridaResultados = new Promise<FotoResultadoSerpApi[]>((resolve, reject) => {
      let pendentes = 2;
      let erroFinal: any = null;

      const verificarResultado = (fotos: FotoResultadoSerpApi[]) => {
        if (fotos && fotos.length > 0) {
          resolve(fotos);
        } else {
          pendentes--;
          if (pendentes <= 0) {
            if (erroFinal) reject(erroFinal);
            else resolve([]);
          }
        }
      };

      promessaRpc.then(verificarResultado).catch((err) => {
        if (err instanceof SerpApiQuotaError || err instanceof SerpApiAuthError) erroFinal = err;
        pendentes--;
        if (pendentes <= 0) {
          if (erroFinal) reject(erroFinal);
          else resolve([]);
        }
      });

      promessaEdge.then(verificarResultado).catch((err) => {
        if (err instanceof SerpApiQuotaError || err instanceof SerpApiAuthError) erroFinal = err;
        pendentes--;
        if (pendentes <= 0) {
          if (erroFinal) reject(erroFinal);
          else resolve([]);
        }
      });
    });

    const timeoutGlobal = new Promise<FotoResultadoSerpApi[]>((_, reject) =>
      setTimeout(() => reject(new Error('Tempo limite de busca na web esgotado (30s)')), 30000)
    );

    const fotos = await Promise.race([corridaResultados, timeoutGlobal]);
    if (fotos && fotos.length > 0) {
      logSerpSucesso(`⚡ Encontradas ${fotos.length} fotos via canal de alta performance!`, fotos);
      salvarCacheSerp(queryFinal, fotos);
      return fotos;
    }

    // Fallback Automático: Se o termo completo não encontrou fotos e era extenso (> 4 palavras), tenta termo enxuto
    const termoEnxuto = extrairTermoEnxutoBusca(queryFinal, 4);
    if (termoEnxuto && termoEnxuto.toLowerCase() !== queryFinal.toLowerCase()) {
      logSerpAviso(`[FALLBACK AUTOMÁTICO] Query longa "${queryFinal}" sem fotos. Buscando termo enxuto: "${termoEnxuto}"...`);
      const fotosEnxutas = await buscarFotosGoogleImagesSerpApi(termoEnxuto, apiKey, opcoes);
      if (fotosEnxutas && fotosEnxutas.length > 0) {
        salvarCacheSerp(queryFinal, fotosEnxutas);
        return fotosEnxutas;
      }
    }
  } catch (err: any) {
    if (err instanceof SerpApiQuotaError || err instanceof SerpApiAuthError) {
      throw err;
    }
    if (err?.message?.includes('Tempo limite')) {
      logSerpErro('Timeout de 30s atingido na busca SerpApi:', err.message);
      throw err;
    }
    logSerpAviso('Busca concorrente Supabase finalizada sem resultados:', err.message);
  }

  logSerpErro('Nenhum método conseguiu localizar fotos para o termo.');
  return [];
};

export interface ItemShoppingSerpApi {
  titulo: string;
  loja: string;
  preco: number;
  precoTexto: string;
  url: string;
  tipo: string;
  entrega?: string;
}

const cacheShoppingSerpMemoria = new Map<string, { timestamp: number; itens: ItemShoppingSerpApi[] }>();

export const obterCacheShoppingSerp = (termo: string): ItemShoppingSerpApi[] | null => {
  const chave = `hubi_serp_shopping_cache_v15_${termo.toLowerCase().trim()}`;
  const TTL_MS = 1000 * 60 * 60 * 6; // 6 horas
  const emMemoria = cacheShoppingSerpMemoria.get(chave);
  if (emMemoria && Date.now() - emMemoria.timestamp < TTL_MS) {
    return emMemoria.itens;
  }
  try {
    const salvo = localStorage.getItem(chave) || sessionStorage.getItem(chave);
    if (salvo) {
      const item = JSON.parse(salvo);
      if (Date.now() - item.timestamp < TTL_MS && Array.isArray(item.itens) && item.itens.length > 0) {
        cacheShoppingSerpMemoria.set(chave, item);
        return item.itens;
      }
    }
  } catch {}
  return null;
};

export const salvarCacheShoppingSerp = (termo: string, itens: ItemShoppingSerpApi[]) => {
  if (!itens || itens.length === 0) return;
  const chave = `hubi_serp_shopping_cache_v15_${termo.toLowerCase().trim()}`;
  const item = { timestamp: Date.now(), itens };
  cacheShoppingSerpMemoria.set(chave, item);
  const serializado = JSON.stringify(item);
  try {
    localStorage.setItem(chave, serializado);
  } catch {}
  try {
    sessionStorage.setItem(chave, serializado);
  } catch {}
};

/**
 * Converte strings monetárias brasileiras ("R$ 3.499,90", "R$ 45,00") ou números para float
 */
export const extrairPrecoNumericoBr = (valor: any, exigirSimboloRs = false): number => {
  if (typeof valor === 'number' && !Number.isNaN(valor) && valor > 0) {
    return valor;
  }
  if (!valor) return 0;
  const str = String(valor).trim();

  // Varre todas as ocorrências com R$ ignorando parcelas (ex: "12x R$ 350", "parcelas de R$ 299")
  const regexRsGlobal = /(?<!\d+\s*x\s*(?:de\s*)?)R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{2,}(?:,\d{2})?)/gi;
  const regexIgnorarPrefixo = /(?:\d+\s*x\s*(?:de\s*)?|parcelas?\s*(?:de\s*)?|juros\s*(?:de\s*)?|frete\s*(?:de|acima\s+de)?\s*|cupom\s*(?:de)?\s*|desconto\s*(?:de)?\s*)$/i;
  const valoresValidos: number[] = [];

  for (const match of str.matchAll(regexRsGlobal)) {
    const idx = match.index ?? 0;
    const prefixo = str.slice(Math.max(0, idx - 28), idx);
    if (regexIgnorarPrefixo.test(prefixo)) {
      continue;
    }

    let numStr = match[1];
    if (numStr.includes(',')) {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(numStr)) {
      numStr = numStr.replace(/\./g, '');
    }
    const parsed = parseFloat(numStr);
    if (!Number.isNaN(parsed) && parsed > 0) {
      valoresValidos.push(parsed);
    }
  }

  if (valoresValidos.length > 0) {
    return Math.max(...valoresValidos);
  }

  // Fallback numérico curto (ex: campo priceRange/price já isolado sem "R$")
  if (!exigirSimboloRs && str.length <= 28) {
    const matchGenerico = str.match(/^\s*(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:[.,]\d{1,2})?)\s*$/);
    if (matchGenerico?.[1]) {
      let numStr = matchGenerico[1];
      if (numStr.includes(',')) {
        numStr = numStr.replace(/\./g, '').replace(',', '.');
      } else if (/^\d{1,3}(\.\d{3})+$/.test(numStr)) {
        numStr = numStr.replace(/\./g, '');
      }
      const parsed = parseFloat(numStr);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return 0;
};

export const normalizarNomeLojaBr = (fonteBruta: string, urlBruta?: string): string => {
  const f = (fonteBruta || '').trim();
  let hostLimpo = '';

  if (urlBruta) {
    try {
      hostLimpo = new URL(urlBruta).hostname
        .toLowerCase()
        .replace(/^www\./, '')
        .replace(/^lista\./, '')
        .replace(/^produto\./, '')
        .replace(/^loja\./, '')
        .replace(/^m\./, '');
    } catch {}
  }

  // Compara apenas hostname (nunca o slug/caminho da URL, para não colapsar lojas diferentes) e fonteBruta
  const alvo = `${hostLimpo} ${f.toLowerCase()}`.trim();

  if (alvo.includes('mercadolivre') || alvo.includes('mercado livre')) return 'Mercado Livre';
  if (alvo.includes('amazon.com')) return 'Amazon Brasil';
  if (alvo.includes('kabum')) return 'KaBuM!';
  if (alvo.includes('magazineluiza') || alvo.includes('magalu')) return 'Magazine Luiza';
  if (alvo.includes('shopee')) return 'Shopee';
  if (alvo.includes('casasbahia') || alvo.includes('casas bahia')) return 'Casas Bahia';
  if (alvo.includes('americanas')) return 'Americanas';
  if (alvo.includes('pichau')) return 'Pichau';
  if (alvo.includes('terabyteshop') || alvo.includes('terabyte')) return 'TerabyteShop';
  if (alvo.includes('aliexpress')) return 'AliExpress';
  if (alvo.includes('fastshop') || alvo.includes('fast shop')) return 'Fast Shop';
  if (alvo.includes('carrefour')) return 'Carrefour';
  if (alvo.includes('extra.com.br')) return 'Extra';
  if (alvo.includes('pontofrio') || alvo.includes('ponto.com.br')) return 'Ponto';
  if (alvo.includes('crealitybrasil') || alvo.includes('creality.com') || f.toLowerCase().includes('creality')) return 'Creality Brasil';
  if (alvo.includes('slim3d') || alvo.includes('slim 3d')) return 'Slim 3D';
  if (alvo.includes('melhorfilamento') || alvo.includes('melhor filamento')) return 'Melhor Filamento';
  if (alvo.includes('3dlab') || alvo.includes('3d lab')) return '3D Lab';
  if (alvo.includes('3dprime') || alvo.includes('3d prime')) return '3D Prime';
  if (alvo.includes('gtmax3d')) return 'GTMax3D';
  if (alvo.includes('stlflix') || alvo.includes('3dfila')) return '3DFila';
  if (alvo.includes('kalunga')) return 'Kalunga';
  if (alvo.includes('leroymerlin') || alvo.includes('leroy merlin')) return 'Leroy Merlin';
  if (alvo.includes('madeiramadeira')) return 'MadeiraMadeira';
  if (alvo.includes('netshoes')) return 'Netshoes';
  if (alvo.includes('centauro')) return 'Centauro';
  if (alvo.includes('drogaraia') || alvo.includes('droga raia')) return 'Droga Raia';
  if (alvo.includes('pague menos') || alvo.includes('paguemenos')) return 'Pague Menos';
  if (alvo.includes('beleza na web') || alvo.includes('belezanaweb')) return 'Beleza na Web';
  if (alvo.includes('epoca cosmeticos') || alvo.includes('epocacosmeticos')) return 'Época Cosméticos';

  if (hostLimpo) {
    const semTld = hostLimpo.replace(/\.(com\.br|com|net\.br|net|org\.br|org|loja|shop|store)$/i, '');
    const nomeFormatado = semTld
      .split(/[.-]+/)
      .filter(Boolean)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
    if (nomeFormatado.length >= 2) {
      return nomeFormatado;
    }
  }

  if (f && !f.includes('http') && !f.includes('/')) {
    return f;
  }

  return f || 'Varejo Online';
};

export const classificarTipoLojaShopping = (nomeLoja: string): string => {
  const lower = (nomeLoja || '').toLowerCase();
  if (
    lower.includes('mercado livre') ||
    lower.includes('mercadolivre') ||
    lower.includes('amazon') ||
    lower.includes('shopee') ||
    lower.includes('magalu') ||
    lower.includes('magazine luiza') ||
    lower.includes('aliexpress') ||
    lower.includes('americanas') ||
    lower.includes('casas bahia') ||
    lower.includes('carrefour')
  ) {
    return 'Marketplace';
  }
  if (lower.includes('oficial') || lower.includes('store') || lower.includes('brasil')) {
    return 'Loja Oficial';
  }
  return 'E-commerce Especializado';
};

/**
 * Detecta se o anúncio/resultado se refere a compra internacional ou importação direta
 * (onde o preço exibido costuma excluir Imposto de Importação + ICMS / Remessa Conforme).
 */
export const ehCompraInternacional = (texto: string): boolean => {
  const lower = (texto || '').toLowerCase();
  if (!lower) return false;
  const termosImportacao = [
    'compra internacional',
    'envio internacional',
    'frete internacional',
    'envio de eua',
    'envio dos eua',
    'envio da china',
    'enviado do exterior',
    'remessa conforme',
    'imposto de importação',
    'imposto de importacao',
    'importação direta',
    'importacao direta',
    'internacional'
  ];
  return termosImportacao.some(t => lower.includes(t));
};

/**
 * Verifica se o título (ou URL) de uma oferta corresponde à versão exata pesquisada pelo usuário,
 * descartando versões divergentes (ex: Plus, Pro, Combo, SE, Max, Mini) quando o usuário não as pediu,
 * bem como compras internacionais e acessórios/peças de reposição.
 */
export const ofertaCorrespondeAoModeloPesquisado = (
  termoPesquisado: string,
  tituloOferta: string,
  textoExtra?: string
): boolean => {
  const qLower = (termoPesquisado || '').toLowerCase();
  const combinado = `${tituloOferta || ''} ${textoExtra || ''}`.toLowerCase().trim();
  if (!combinado) return true;

  // 0. Descarta imediatamente compras internacionais / importação direta (a menos que o usuário tenha digitado explicitamente)
  if (!ehCompraInternacional(qLower) && ehCompraInternacional(combinado)) {
    return false;
  }

  // 1. Filtra modificadores de versão/modelo que mudam completamente a faixa de preço (título e slug de URL)
  const modificadoresVersao = ['plus', 'pro', 'max', 'ultra', 'combo', 'cfs', 'mini', 'lite', 'se', 'neo', 'xl'];
  const combinadoNormalizadoSlug = combinado.replace(/[-_/]/g, ' ');
  for (const mod of modificadoresVersao) {
    const regexMod = new RegExp(`\\b${mod}\\b`, 'i');
    if (!regexMod.test(qLower) && regexMod.test(combinadoNormalizadoSlug)) {
      return false;
    }
  }

  // 2. Filtra acessórios avulsos, insumos e peças de reposição quando não fazem parte da busca
  const termosAcessorios = [
    'filamento', 'bico', 'nozzle', 'hotend', 'mesa', 'placa', 'correia', 'extrusora', 'extrusor',
    'kit peças', 'kit pecas', 'kit peca', 'peça', 'peca', 'peças', 'pecas', 'capa',
    'mesa magnetica', 'mesa magnética', 'chapa pei', 'placa mae', 'placa mãe', 'termistor',
    'aquecedor', 'cooler', 'ventoinha', 'resina', 'peca de reposicao', 'peça de reposição',
    'refil', 'amostra', 'usado', 'recondicionado', 'defeito', 'sucata', 'suporte para'
  ];
  for (const acc of termosAcessorios) {
    if (!qLower.includes(acc) && combinadoNormalizadoSlug.includes(acc)) {
      return false;
    }
  }

  return true;
};

const formatarItensShoppingBrutos = (rawItems: any[], queryPadrao: string): ItemShoppingSerpApi[] => {
  if (!Array.isArray(rawItems)) return [];
  const resultados: ItemShoppingSerpApi[] = [];

  for (const item of rawItems) {
    const titulo = String(item.title || item.titulo || queryPadrao).trim();
    const url = String(item.link || item.product_link || item.url || '').trim();
    if (!ehCompraInternacional(queryPadrao) && ehCompraInternacional(String(item.snippet || ''))) {
      continue;
    }
    const textoExtra = `${item.delivery || ''} ${url}`;
    if (!ofertaCorrespondeAoModeloPesquisado(queryPadrao, titulo, textoExtra)) {
      continue;
    }

    const richExtensions = Array.isArray(item.richSnippet?.top?.extensions)
      ? item.richSnippet.top.extensions.join(' ')
      : '';
    const richPrice =
      item.richSnippet?.top?.detectedExtensions?.price ||
      item.richSnippet?.bottom?.detectedExtensions?.price ||
      '';

    const precoNum =
      extrairPrecoNumericoBr(item.extracted_price) ||
      extrairPrecoNumericoBr(item.price) ||
      extrairPrecoNumericoBr(item.priceRange, true) ||
      extrairPrecoNumericoBr(richPrice) ||
      extrairPrecoNumericoBr(item.attributes?.Preço || item.attributes?.Preco || item.attributes?.Price) ||
      extrairPrecoNumericoBr(richExtensions, true) ||
      extrairPrecoNumericoBr(item.snippet, true) ||
      extrairPrecoNumericoBr(item.title, true);

    if (precoNum <= 0) continue;

    // Ignorar links de vídeos/fóruns/redes sociais que não são lojas
    if (/\b(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|reddit\.com|pinterest\.com|wikipedia\.org)\b/i.test(url)) {
      continue;
    }

    const fonteBruta = String(
      item.source ||
      item.merchant ||
      item.seller ||
      item.store ||
      ''
    ).trim();

    const loja = normalizarNomeLojaBr(fonteBruta, url);

    resultados.push({
      titulo,
      loja,
      preco: precoNum,
      precoTexto: String(item.price || `R$ ${precoNum.toFixed(2)}`),
      url,
      tipo: classificarTipoLojaShopping(loja),
      entrega: item.delivery ? String(item.delivery) : undefined
    });
  }

  // Piso mínimo absoluto: descarta valores falsos (< R$ 15,00) quando há ofertas > R$ 100,00 para o mesmo produto
  const temOfertaAcima100 = resultados.some(r => r.preco > 100);
  const resultadosValidos = temOfertaAcima100
    ? resultados.filter(r => r.preco >= 15)
    : resultados;

  // Priorizar lojas distintas na ordenação (1ª oferta competitiva de cada loja distinta primeiro, depois demais)
  const porLoja = new Map<string, ItemShoppingSerpApi[]>();
  for (const r of resultadosValidos) {
    const k = r.loja.toLowerCase().trim();
    const lista = porLoja.get(k) || [];
    lista.push(r);
    porLoja.set(k, lista);
  }

  const primeirasDeCadaLoja: ItemShoppingSerpApi[] = [];
  const extras: ItemShoppingSerpApi[] = [];
  for (const [, lista] of porLoja.entries()) {
    lista.sort((a, b) => a.preco - b.preco);
    primeirasDeCadaLoja.push(lista[0]);
    if (lista.length > 1) {
      extras.push(...lista.slice(1));
    }
  }

  return [...primeirasDeCadaLoja, ...extras];
};

/**
 * Busca rápida (<1s) de preços reais de mercado via SerpApi / Serper.dev (engine: 'google_shopping' + 'google' em paralelo)
 * com cache instantâneo em memória e localStorage idêntico ao de imagens.
 */
export const buscarPrecosShoppingSerpApi = async (
  termo: string,
  loja?: any,
  numResultados = 30
): Promise<ItemShoppingSerpApi[]> => {
  const tInicioSerper = performance.now();
  const queryFinal = extrairTermoPrincipalProduto(termo) || limparTermoParaBuscaGoogle(termo) || (termo || '').trim();
  if (!queryFinal) return [];

  // 1. Verificação instantânea no Cache Local (Memória + localStorage) em 0ms
  const emCache = obterCacheShoppingSerp(queryFinal);
  if (emCache && emCache.length > 0) {
    logSerpSucesso(`⚡ [CACHE INSTANTÂNEO] Recuperadas ${emCache.length} ofertas em 0ms para "${queryFinal}"`);
    return emCache;
  }

  let chaveLimpa = obterSerpApiKey(loja);
  if (!chaveLimpa && loja?.id) {
    try {
      chaveLimpa = await obterOuBuscarSerpApiKey(loja);
    } catch {}
  }

  const lojaId = loja?.id;
  const num = Math.min(Math.max(numResultados, 20), 30);

  const sanitizarQuerySerperSimples = (texto: string): string =>
    (texto || '')
      .replace(/["'`:;\-+=$!?()[\]{}\\/|@#%^&*~<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const querySimples = sanitizarQuerySerperSimples(queryFinal);

  const promessasParalelas: Promise<ItemShoppingSerpApi[]>[] = [];

  const executarSerperPost = async (endpoint: 'shopping' | 'search', payload: Record<string, any>): Promise<ItemShoppingSerpApi[]> => {
    const ctrl = new AbortController();
    const tId = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(`https://google.serper.dev/${endpoint}`, {
        method: 'POST',
        headers: {
          'X-API-KEY': chaveLimpa!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...payload,
          q: sanitizarQuerySerperSimples(String(payload.q || querySimples))
        }),
        signal: ctrl.signal
      });
      clearTimeout(tId);
      if (res.ok) {
        const data = await res.json();
        const brutos = [
          ...(data.shopping || []),
          ...(data.shopping_results || []),
          ...(data.organic || [])
        ];
        return formatarItensShoppingBrutos(brutos, queryFinal);
      } else {
        const errBody = await res.text().catch(() => '');
        logSerpErro(`Erro HTTP ${res.status} no Serper /${endpoint}:`, errBody);
      }
    } catch {
      clearTimeout(tId);
    }
    return [];
  };

  // Canal 1 e 2: Chamadas simultâneas ao Serper.dev (/shopping + /search orgânico comercial)
  if (chaveLimpa) {
    promessasParalelas.push(
      executarSerperPost('shopping', { q: querySimples, gl: 'br', hl: 'pt-br' }),
      executarSerperPost('search', { q: `${querySimples} comprar preco`, gl: 'br', hl: 'pt-br', num: 20 })
    );
  }

  // Canal 3: Proxy local em DEV (/api/buscar-fotos-serpapi)
  if (import.meta.env.DEV && chaveLimpa) {
    promessasParalelas.push(
      (async () => {
        const ctrl = new AbortController();
        const tId = setTimeout(() => ctrl.abort(), 4000);
        try {
          const params = new URLSearchParams({
            engine: 'google_shopping',
            q: queryFinal,
            hl: 'pt',
            gl: 'br',
            api_key: chaveLimpa,
            num: String(num)
          });
          const res = await fetch(`/api/buscar-fotos-serpapi?${params.toString()}`, { signal: ctrl.signal });
          clearTimeout(tId);
          if (res.ok) {
            const data = await res.json();
            return formatarItensShoppingBrutos(data.shopping || data.shopping_results || data.results || [], queryFinal);
          }
        } catch {
          clearTimeout(tId);
        }
        return [];
      })()
    );
  }

  // Canal 4: Supabase Edge Function (buscar-fotos-serpapi) caso não haja chave no cliente
  if (!chaveLimpa && lojaId) {
    promessasParalelas.push(
      (async () => {
        try {
          const { data: edgeData, error } = await supabase.functions.invoke('buscar-fotos-serpapi', {
            body: {
              q: queryFinal,
              engine: 'google_shopping',
              loja_id: lojaId,
              num
            }
          });
          if (!error && edgeData) {
            const brutos = edgeData.shopping || edgeData.shopping_results || edgeData.results || [];
            return formatarItensShoppingBrutos(brutos, queryFinal);
          }
        } catch {}
        return [];
      })(),
      (async () => {
        try {
          const { data: edgeData, error } = await supabase.functions.invoke('buscar-fotos-serpapi', {
            body: {
              q: `${querySimples} comprar preco`,
              engine: 'google',
              loja_id: lojaId,
              num: 20
            }
          });
          if (!error && edgeData) {
            const brutos = [...(edgeData.shopping || []), ...(edgeData.organic || []), ...(edgeData.results || [])];
            return formatarItensShoppingBrutos(brutos, queryFinal);
          }
        } catch {}
        return [];
      })()
    );
  }

  if (promessasParalelas.length === 0) return [];

  try {
    const resultadosIniciais = await Promise.all(promessasParalelas);
    const todosItens: ItemShoppingSerpApi[] = [];

    for (const lista of resultadosIniciais) {
      if (Array.isArray(lista) && lista.length > 0) {
        todosItens.push(...lista);
      }
    }

    const lojasDistintasIniciais = new Set(todosItens.map(it => it.loja.toLowerCase().trim()));

    // Segunda busca orgânica complementar caso a soma das duas primeiras ainda tenha menos de 6 lojas únicas
    if (lojasDistintasIniciais.size < 6) {
      const queryComplementar = `${querySimples} loja`;
      let extras: ItemShoppingSerpApi[] = [];
      if (chaveLimpa) {
        extras = await executarSerperPost('search', { q: queryComplementar, gl: 'br', hl: 'pt-br', num: 20 });
      } else if (lojaId) {
        try {
          const { data: edgeData, error } = await supabase.functions.invoke('buscar-fotos-serpapi', {
            body: {
              q: queryComplementar,
              engine: 'google',
              loja_id: lojaId,
              num: 20
            }
          });
          if (!error && edgeData) {
            const brutos = [...(edgeData.shopping || []), ...(edgeData.organic || []), ...(edgeData.results || [])];
            extras = formatarItensShoppingBrutos(brutos, queryFinal);
          }
        } catch {}
      }
      if (extras.length > 0) {
        todosItens.push(...extras);
      }
    }

    if (todosItens.length > 0) {
      // Piso mínimo absoluto global: descarta qualquer valor irrisório (< R$ 15,00) quando existem ofertas acima de R$ 100,00
      const temOfertaAcima100Global = todosItens.some(it => it.preco > 100);
      const itensFiltradosPiso = temOfertaAcima100Global
        ? todosItens.filter(it => it.preco >= 15)
        : todosItens;

      // Deduplica por loja + preço/url, priorizando manter 1 oferta competitiva por loja distinta primeiro
      const porLoja = new Map<string, ItemShoppingSerpApi[]>();
      for (const item of itensFiltradosPiso) {
        const chaveLoja = item.loja.toLowerCase().trim();
        const lista = porLoja.get(chaveLoja) || [];
        if (!lista.some(x => Math.abs(x.preco - item.preco) < 0.05 || (x.url && item.url && x.url === item.url))) {
          lista.push(item);
          porLoja.set(chaveLoja, lista);
        }
      }

      const distintasPrimeiro: ItemShoppingSerpApi[] = [];
      const adicionais: ItemShoppingSerpApi[] = [];
      for (const [, lista] of porLoja.entries()) {
        lista.sort((a, b) => a.preco - b.preco);
        distintasPrimeiro.push(lista[0]);
        if (lista.length > 1) {
          adicionais.push(...lista.slice(1));
        }
      }

      const ofertasFinais = [...distintasPrimeiro, ...adicionais].slice(0, 30);
      logSerpSucesso(`⚡ Encontradas ${ofertasFinais.length} ofertas (${distintasPrimeiro.length} lojas distintas) para "${queryFinal}"`);
      console.log(`%c[HUBI PERF ⏱️]%c [SERPER] Busca paralela concluída em ${Math.round(performance.now() - tInicioSerper)}ms`, 'color: #0ea5e9; font-weight: bold;', 'color: #38bdf8;');
      salvarCacheShoppingSerp(queryFinal, ofertasFinais);
      return ofertasFinais;
    }
  } catch (err) {
    logSerpAviso('Aviso ao buscar preços no Google Shopping:', err);
  }

  return [];
};
