import { supabase } from '../lib/supabase';
import { Loja } from '../types';
import { validarGtinGs1 } from '../utils/gdmMercadoLivreMapper';

export const STORAGE_KEY_SERPAPI_KEY = 'hubi_serper_api_key';

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

const normalizarSemAcentos = (texto: string): string =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Extrai o rótulo curto do ramo de atividade da loja (ex: "Sex Shop / Produtos Eróticos" -> "Sex Shop").
 */
export const extrairRamoCurtoLoja = (ramoAtividade?: string): string => {
  const raw = String(ramoAtividade || '').trim();
  if (!raw) return '';
  const primeiro = raw.split('/')[0].trim();
  if (!primeiro) return '';

  const norm = normalizarSemAcentos(primeiro);
  if (
    norm === 'varejo comercial geral' ||
    norm === 'geral' ||
    norm === 'varejo geral' ||
    norm === 'outros'
  ) {
    return '';
  }

  const mapaIds: Record<string, string> = {
    sexshop: 'Sex Shop',
    motepecas: 'Motopeças',
    petshop: 'Pet Shop',
    construcao: 'Material de Construção',
  };

  return mapaIds[norm] || primeiro;
};

/**
 * Identifica se o nicho da loja ou contexto do produto exige SafeSearch desativado (`safe: "off"`).
 */
export const ehRamoAtividadeAdulto = (ramoAtividade?: string, contextoExtra?: string): boolean => {
  const combinado = normalizarSemAcentos(`${ramoAtividade || ''} ${contextoExtra || ''}`);
  if (!combinado) return false;
  return /\b(sex\s*shop|sexshop|erotic[oa]s?|intim[oa]s?|adult[oa]s?|sensua(?:l|is)|bem[\s-]*estar\s+intimo|vibrador(?:es)?|dildo|masturbador|plug\s+anal)\b/i.test(
    combinado
  );
};

/**
 * Higieniza o termo do produto (removendo códigos internos e dimensões entre parênteses)
 * e concatena o ramo de atividade curto da loja quando ainda não estiver presente.
 */
export const montarQueryEnriquecidaComRamo = (termo: string, ramoAtividade?: string): string => {
  const termoLimpo = limparTermoParaBuscaGoogle(termo) || String(termo || '').trim();
  if (!termoLimpo) return '';

  const ramoCurto = extrairRamoCurtoLoja(ramoAtividade);
  if (!ramoCurto) return termoLimpo;

  const termoNorm = normalizarSemAcentos(termoLimpo);
  const ramoNorm = normalizarSemAcentos(ramoCurto);
  if (termoNorm.includes(ramoNorm)) {
    return termoLimpo;
  }

  return `${termoLimpo} ${ramoCurto}`.trim();
};

/**
 * Sanitiza o termo de busca para o Google Imagens:
 * - Remove códigos internos ou numerações de início (ex: "005V - ", "7633 - ")
 * - Remove medidas e dimensões entre parênteses/colchetes (ex: "(15×3cm)", "(15x3cm)", "(200ml)")
 * - Remove variações e tamanhos com hífen (ex: " - Tamanho G", " - Tam P", " - G")
 * - Remove hifens isolados (para o Google não interpretar como operador de exclusão NOT)
 */
export const limparTermoParaBuscaGoogle = (termo: string): string => {
  if (!termo) return '';
  return termo
    .replace(
      /^(?:(?:c[oó]d(?:igo)?|sku|ref)\.?\s*[:#-]?\s*[A-Za-z0-9#._-]+\s*[-–—:]?\s*|[\[\(][A-Za-z0-9#._-]+[\]\)]\s*[-–—:]\s*|(?=[A-Za-z0-9#._-]*\d)[A-Za-z0-9#._-]+\s*[-–—:]\s*|[A-Za-z0-9#._-]+\s+[-–—]\s+)/i,
      ''
    )
    .replace(/^[0-9]+\s+/, '')
    .replace(
      /\s*[\(\[]\s*\d+(?:[.,]\d+)?(?:\s*[xX×*]\s*\d+(?:[.,]\d+)?)*\s*(?:cm|mm|m|ml|l|g|kg|pol|oz|un)?\s*[\)\]]/gi,
      ''
    )
    .replace(
      /\b\d+(?:[.,]\d+)?\s*[xX×]\s*\d+(?:[.,]\d+)?(?:\s*[xX×]\s*\d+(?:[.,]\d+)?)?\s*(?:cm|mm|m|pol)\b/gi,
      ''
    )
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
/**
 * Extrai códigos alfanuméricos de modelo / part-number (ex: MB16AHVE, HMG00234PT, SE2726H, A1M, K2),
 * ignorando unidades técnicas (144Hz, 1ms, 500mm, 15.6, 3D, 4K).
 */
export const extrairPartNumbersProduto = (termo: string): string[] => {
  if (!termo) return [];
  const limpo = termo
    .replace(/[""''"`,;()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = limpo.split(/\s+/).filter(Boolean);
  const regexUnidadeOuGenerico = /^(?:\d+(?:[.,]\d+)?(?:hz|khz|mhz|ms|mm|cm|m|kg|g|gb|tb|mb|w|v|rpm|fps|mah|pol)?|3d|2d|4k|8k|2k|fhd|wqhd|uhd|qhd|hdr10?|usb\d*|hdmi\d*|type-?c|110v|220v|127v)$/i;

  const partNumbers: string[] = [];
  for (const tok of tokens) {
    const semTraco = tok.replace(/^[-–—]+|[-–—]+$/g, '');
    if (!semTraco || semTraco.length < 2) continue;
    if (regexUnidadeOuGenerico.test(semTraco)) continue;
    // Exige mistura de letras e dígitos (ex: MB16AHVE, HMG00234PT, SE2726H, K2, A1M, PF002-M-BRA)
    if (/[a-z]/i.test(semTraco) && /\d/.test(semTraco)) {
      partNumbers.push(semTraco);
    }
  }
  return Array.from(new Set(partNumbers));
};

export const extrairTermoPrincipalProduto = (termo: string): string => {
  const base = limparTermoParaBuscaGoogle(termo)
    .replace(/[""''"`,;()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return '';

  const partNumbers = extrairPartNumbersProduto(termo);

  const semRuido = base
    .replace(/\b(?:full\s*hd|fhd|wqhd|qhd|uhd|hdr\d*|ips|va|tn|oled|amoled|hdmi|usb|type\s*c|displayport|filtro\s+blue\s+light|blue\s+light|anti\s*reflexo|antireflexo|adaptive\s+sync|freesync|g\s*sync|mprt|conforto\s+visual|auto\s+nivelamento|silencios[oa]|velocidade\s+de\s+at[eé]|alta\s+velocidade|velocidade\s+m[aá]xima|envio\s+imediato|pronta\s+entrega|com\s+nota\s+fiscal|nota\s+fiscal|nf-?e?|garantia\s+oficial|100%\s+original|original\s+lacrad[oa]|lacrad[oa]|promo[cç][aã]o|oferta|super\s+r[aá]pid[oa]|bivolt|110v\s*\/?\s*220v|220v\s*\/?\s*110v|ultrawide|widescreen|gamer|curvo|port[aá]til)\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:mm\/s|mm\/s²|rpm|hz|khz|mhz|ms|w\s*rms|pol|polegadas)\b/gi, ' ')
    .replace(/\b\d{1,2}(?:[.,]\d{1,2})\b/g, ' ') // polegadas como 15.6 ou 23.8
    .replace(/\b\d{2,4}\s*[xX×]\s*\d{2,4}(?:\s*[xX×]\s*\d{2,4})?\s*(?:mm|cm)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const palavrasBase = (semRuido || base).split(/\s+/).filter(Boolean);
  const nucleo = palavrasBase.slice(0, 5);

  // Garante que o part-number principal (ex: MB16AHVE, HMG00234PT, SE2726H) nunca seja cortado
  if (partNumbers.length > 0) {
    const pnPrincipal = partNumbers[partNumbers.length - 1];
    const jaTemPn = nucleo.some(p => p.toLowerCase() === pnPrincipal.toLowerCase());
    if (!jaTemPn) {
      nucleo.push(pnPrincipal);
    }
  }

  return nucleo.join(' ').trim();
};

/**
 * Extrai uma query curta de modelo contendo apenas Categoria/Tipo + Marca + Código do Modelo
 * (ex: "Monitor Dell C2423H" ou "Monitor Aoc 22b3hmf") para busca dupla no Serper.
 */
export const extrairQueryCurtaModelo = (termo: string): string => {
  const principal = extrairTermoPrincipalProduto(termo);
  if (!principal) return '';

  const partNumbers = extrairPartNumbersProduto(termo);
  const pnPrincipal = partNumbers.length > 0 ? partNumbers[partNumbers.length - 1] : '';

  const stopwords = new Set([
    'de', 'do', 'da', 'dos', 'das', 'para', 'com', 'sem', 'em', 'no', 'na',
    'um', 'uma', 'o', 'a', 'os', 'as', 'e', 'ou', 'preto', 'branco', 'prata', 'cinza'
  ]);

  const tokensSemPn = principal
    .split(/\s+/)
    .filter(
      (tok) =>
        tok.length >= 2 &&
        !stopwords.has(tok.toLowerCase()) &&
        (!pnPrincipal || tok.toLowerCase() !== pnPrincipal.toLowerCase())
    );

  const prefixo = tokensSemPn.slice(0, 2);
  if (pnPrincipal) {
    return [...prefixo, pnPrincipal].join(' ').trim();
  }
  return tokensSemPn.slice(0, 3).join(' ').trim();
};

/**
 * Formata os itens brutos retornados pela SerpApi em FotoResultadoSerpApi.
 * Filtra PDFs/Scribd/logos genéricas, prioriza imagens de produto em boa resolução e evita duplicatas.
 */
export const formatarResultadosSerpApi = (
  imagesResults: any[],
  queryTratada: string,
  num: number = 20
): FotoResultadoSerpApi[] => {
  const fotosPrioritarias: FotoResultadoSerpApi[] = [];
  const fotosSecundarias: FotoResultadoSerpApi[] = [];
  const fotosReserva: FotoResultadoSerpApi[] = [];
  const urlsVistas = new Set<string>();

  const dominiosBloqueados = [
    'scribd.com',
    'slideshare.net',
    'issuu.com',
    'calameo.com',
    'academia.edu',
    'researchgate.net',
    'docplayer',
    'dreamstime.com',
    'depositphotos.com',
    '123rf.com',
    'alamy.com',
    'shutterstock.com',
    'istockphoto.com'
  ];

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

    const fonteLower = (item.fonte || item.source || item.domain || '').toLowerCase();
    const linkLower = `${originalUrl} ${item.link || ''} ${item.original || ''}`.toLowerCase();
    const tituloLower = (item.titulo || item.title || '').toLowerCase();

    if (
      tituloLower.includes('meme') ||
      tituloLower.includes('viral') ||
      tituloLower.includes('animal mais feio') ||
      dominiosBloqueados.some(d => linkLower.includes(d) || fonteLower.includes(d)) ||
      linkLower.includes('.pdf') ||
      linkLower.includes('.svg') ||
      linkLower.includes('favicon') ||
      linkLower.includes('placeholder') ||
      linkLower.includes('watermark') ||
      /[/._-](logo|icon|brand)[/._-]/i.test(linkLower) ||
      tituloLower.startsWith('logo ')
    ) {
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
    const fontesNaoComerciais = ['tiktok', 'giphy', 'tenor'];
    const ehFonteReserva = fontesNaoComerciais.some(f => fonteLower.includes(f) || linkLower.includes(f));

    urlsVistas.add(originalUrl);

    if (ehResolucaoBaixa || ehFonteReserva) {
      fotosReserva.push(fotoObj);
    } else {
      const proporcaoProduto =
        largura && altura
          ? Math.max(largura / Math.max(altura, 1), altura / Math.max(largura, 1))
          : 1;
      const boaResolucao = Boolean(largura && altura && largura >= 400 && altura >= 400 && proporcaoProduto <= 2.2);
      if (boaResolucao) {
        fotosPrioritarias.push(fotoObj);
      } else {
        fotosSecundarias.push(fotoObj);
      }
    }
  }

  const fotosFormatadas = [...fotosPrioritarias, ...fotosSecundarias].slice(0, num);

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
 * Obtém a chave do Serper.dev configurada exclusivamente na loja (lojas.serper_api_key)
 */
export const obterSerpApiKey = (loja?: Loja | null): string => {
  return (loja?.serper_api_key || '').trim();
};

/**
 * Obtém a chave do Serper.dev de forma assíncrona consultando exclusivamente
 * a coluna `serper_api_key` da tabela `lojas` para a loja informada.
 */
export const obterOuBuscarSerpApiKey = async (loja?: Loja | null): Promise<string> => {
  const chaveSincrona = obterSerpApiKey(loja);
  if (chaveSincrona) return chaveSincrona;

  if (loja?.id) {
    try {
      logSerp('Consultando lojas.serper_api_key no Supabase:', loja.id);
      const { data, error } = await supabase
        .from('lojas')
        .select('serper_api_key')
        .eq('id', loja.id)
        .maybeSingle();

      if (!error && data?.serper_api_key && typeof data.serper_api_key === 'string') {
        const limpa = data.serper_api_key.trim();
        if (limpa) {
          logSerpSucesso('Chave Serper.dev obtida de lojas.serper_api_key!');
          return limpa;
        }
      }
    } catch (e: any) {
      logSerpAviso('Erro ao buscar lojas.serper_api_key no Supabase:', e.message);
    }
  }

  return '';
};

/**
 * Salva a chave do Serper.dev exclusivamente na coluna `lojas.serper_api_key` da loja.
 */
export const salvarSerpApiKey = async (
  chave: string,
  lojaId?: string,
  lojaAtual?: Loja | null,
  apenasLocalStorage = false
): Promise<void> => {
  const chaveLimpa = chave.trim();
  logSerp('Salvando chave Serper.dev em lojas.serper_api_key...', {
    lojaId,
    chaveMascarada: chaveLimpa ? `${chaveLimpa.slice(0, 4)}...${chaveLimpa.slice(-4)}` : '(vazia)'
  });

  // Limpa qualquer resquício legado no armazenamento local
  try {
    localStorage.removeItem('hubi_serpapi_key');
    localStorage.removeItem(STORAGE_KEY_SERPAPI_KEY);
  } catch {}

  if (apenasLocalStorage) return;

  // Persistir no Supabase com isolamento multi-tenant exclusivamente em lojas.serper_api_key
  if (lojaId) {
    const extrasAtual = (lojaAtual?.configuracoes_extras || {}) as any;
    const iaAtual = { ...(extrasAtual.ia || {}) };
    delete iaAtual.serpapi_key;
    const novosExtras = {
      ...extrasAtual,
      ia: {
        ...iaAtual,
        serper_api_key: chaveLimpa || undefined
      }
    };

    const { error } = await supabase
      .from('lojas')
      .update({
        serper_api_key: chaveLimpa || null,
        configuracoes_extras: novosExtras
      })
      .eq('id', lojaId);

    if (error) {
      logSerpErro('Erro ao persistir chave Serper.dev em lojas.serper_api_key:', error);
      throw new Error(`Não foi possível salvar a chave no banco: ${error.message}`);
    }
    logSerpSucesso('Chave Serper.dev persistida em lojas.serper_api_key com sucesso.');
  }
};

/**
 * Testa a conexão com o Serper.dev utilizando a chave fornecida
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

  logSerp('🔑 Iniciando teste de conexão com o Serper.dev...', { chave: chaveMascarada });

  if (!chaveLimpa) {
    logSerpErro('Chave de API não informada para o teste.');
    return { sucesso: false, mensagem: 'Informe a sua chave API do Serper.dev para testar.' };
  }

  // MÉTODO 1: Supabase Edge Function (Serper.dev)
  try {
    logSerp('📡 [Método 1/2] Supabase Edge Function Serper.dev (buscar-fotos-serpapi)...');
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

  // MÉTODO 2: Chamada direta ao endpoint oficial do Serper.dev
  try {
    logSerp('📡 [Método 2/2] Validando chave diretamente na API do Serper.dev...');
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'X-API-KEY': chaveLimpa,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: 'teste', gl: 'br', hl: 'pt-br', num: 1 }),
      signal: ctrl.signal
    });
    clearTimeout(timeoutId);

    if (res.status === 401 || res.status === 403) {
      return {
        sucesso: false,
        mensagem: 'Chave do Serper.dev inválida. Verifique o código copiado em https://serper.dev/api-key.'
      };
    }
    if (res.status === 429) {
      return {
        sucesso: false,
        mensagem: 'Limite de cota gratuita do Serper.dev atingido.'
      };
    }
    if (res.ok) {
      return {
        sucesso: true,
        mensagem: 'Conexão estabelecida com sucesso com o Serper.dev!',
        plano: 'Plano Gratuito (2.500 buscas)',
        buscasRestantes: 2500
      };
    }
  } catch (e: any) {
    logSerpAviso('Validação direta ao Serper.dev falhou:', e.message);
  }

  return {
    sucesso: false,
    mensagem: 'Não foi possível validar a chave do Serper.dev. Confira se a chave foi copiada corretamente em https://serper.dev/api-key.'
  };
};

// Cache em Memória e sessionStorage para respostas instantâneas (0ms) e economia de cota
const cacheSerpMemoria = new Map<string, { timestamp: number; fotos: FotoResultadoSerpApi[] }>();

export const obterCacheSerp = (termo: string): FotoResultadoSerpApi[] | null => {
  const chave = `hubi_serp_cache_v21_${termo.toLowerCase().trim()}`;
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
  const chave = `hubi_serp_cache_v21_${termo.toLowerCase().trim()}`;
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

  const ramoLoja = String(
    loja?.configuracoes_extras?.perfil_negocio?.segmento || loja?.segmento || ''
  ).trim();
  const queryFinal = montarQueryEnriquecidaComRamo(termo, ramoLoja);
  if (!queryFinal) return null;

  const safeOff = ehRamoAtividadeAdulto(ramoLoja, queryFinal);
  const chaveCache = safeOff ? `${queryFinal}|safe_off` : queryFinal;

  // 1. Tenta obter do cache instantâneo (0ms)
  const emCache = obterCacheSerp(chaveCache);
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
      const buscaPromise = buscarFotosGoogleImagesSerpApi(termo, serpApiKey, {
        lojaId: loja?.id,
        numResultados: 2,
        ramoAtividade: ramoLoja || undefined
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
    ramoAtividade?: string;
  }
): Promise<FotoResultadoSerpApi[]> => {
  let chaveLimpa = (apiKey || '').trim();
  const lojaId = opcoes?.lojaId;
  const ramoAtividade = opcoes?.ramoAtividade;

  // Se não foi passada diretamente, consulta exclusivamente lojas.serper_api_key
  if (!chaveLimpa && lojaId) {
    chaveLimpa = await obterOuBuscarSerpApiKey({ id: lojaId } as Loja);
  }

  const chaveMascarada = chaveLimpa.length > 8
    ? `${chaveLimpa.slice(0, 4)}...${chaveLimpa.slice(-4)}`
    : chaveLimpa ? '***' : '(ausente)';

  const queryFinal = montarQueryEnriquecidaComRamo(termo, ramoAtividade);
  const ramoCurto = extrairRamoCurtoLoja(ramoAtividade);
  const safeOff = ehRamoAtividadeAdulto(ramoAtividade, queryFinal);
  const chaveCache = safeOff ? `${queryFinal}|safe_off` : queryFinal;
  const num = Math.min(opcoes?.numResultados || 20, 20);

  if (!chaveLimpa) {
    logSerpErro('Chave do Serper.dev não configurada para esta loja (lojas.serper_api_key).');
    throw new SerpApiAuthError(
      'Chave do Serper.dev não configurada. Cadastre sua chave gratuita (2.500 consultas grátis) nas Configurações da Loja.'
    );
  }

  // 1. Verificação instantânea no Cache Local (Memória + sessionStorage)
  const fotosEmCache = obterCacheSerp(chaveCache);
  if (fotosEmCache && fotosEmCache.length > 0) {
    logSerpSucesso(`⚡ [CACHE INSTANTÂNEO] Recuperadas ${fotosEmCache.length} fotos em 0ms para "${queryFinal}"`);
    return fotosEmCache;
  }

  logSerp(`🔍 Iniciando busca de fotos Google Images no Serper.dev...`, {
    termoOriginal: termo,
    termoPesquisa: queryFinal,
    ramoAtividade: ramoCurto || 'N/A',
    safeSearch: safeOff ? 'off' : 'default',
    chave: chaveMascarada,
    lojaId: lojaId || 'N/A',
    quantidadeDesejada: num
  });

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
  if (ramoCurto) {
    params.set('ramo_atividade', ramoCurto);
  }
  if (safeOff) {
    params.set('safe', 'off');
  }

  // =========================================================================
  // MÉTODO 1: Proxy local de desenvolvimento (/api/buscar-fotos-serpapi)
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
          throw new SerpApiAuthError(rawJson.error || 'Chave do Serper.dev inválida ou expirada.');
        } else if (response.ok && (Array.isArray(rawJson.images_results) || Array.isArray(rawJson.results))) {
          const itens = rawJson.images_results || rawJson.results;
          const fotos = formatarResultadosSerpApi(itens, queryFinal, num);
          if (fotos.length > 0) {
            logSerpSucesso(`Encontradas ${fotos.length} fotos via proxy local!`, fotos);
            salvarCacheSerp(chaveCache, fotos);
            return fotos;
          }
        }
      }
    } catch (e: any) {
      if (e instanceof SerpApiQuotaError || e instanceof SerpApiAuthError) {
        throw e;
      }
      logSerpAviso('Proxy local indisponível, recorrendo à Edge Function Supabase:', e.message);
    }
  }

  // =========================================================================
  // MÉTODO 2: Supabase Edge Function (buscar-fotos-serpapi no Deno Runtime / Serper.dev)
  // =========================================================================
  try {
    logSerp('📡 [Serper.dev] Consultando Edge Function buscar-fotos-serpapi...');

    const promessaEdge = (async (): Promise<FotoResultadoSerpApi[]> => {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('buscar-fotos-serpapi', {
        body: {
          q: queryFinal,
          ramo_atividade: ramoCurto || undefined,
          safe: safeOff ? 'off' : undefined,
          serpApiKey: chaveLimpa,
          api_key: chaveLimpa,
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
      return [];
    })();

    const timeoutGlobal = new Promise<FotoResultadoSerpApi[]>((_, reject) =>
      setTimeout(() => reject(new Error('Tempo limite de busca na web esgotado (30s)')), 30000)
    );

    const fotos = await Promise.race([promessaEdge, timeoutGlobal]);
    if (fotos && fotos.length > 0) {
      logSerpSucesso(`⚡ Encontradas ${fotos.length} fotos via Serper.dev!`, fotos);
      salvarCacheSerp(chaveCache, fotos);
      return fotos;
    }

    // Fallback Automático: Se o termo completo não encontrou fotos e era extenso (> 4 palavras), tenta termo enxuto com ramo
    const termoBaseLimpo = limparTermoParaBuscaGoogle(termo);
    const termoEnxuto = extrairTermoEnxutoBusca(termoBaseLimpo, 4);
    const queryEnxutaComRamo = montarQueryEnriquecidaComRamo(termoEnxuto, ramoAtividade);
    if (queryEnxutaComRamo && queryEnxutaComRamo.toLowerCase() !== queryFinal.toLowerCase()) {
      logSerpAviso(`[FALLBACK AUTOMÁTICO] Query longa "${queryFinal}" sem fotos. Buscando termo enxuto: "${queryEnxutaComRamo}"...`);
      const fotosEnxutas = await buscarFotosGoogleImagesSerpApi(termoEnxuto, chaveLimpa, opcoes);
      if (fotosEnxutas && fotosEnxutas.length > 0) {
        salvarCacheSerp(chaveCache, fotosEnxutas);
        return fotosEnxutas;
      }
    }
  } catch (err: any) {
    if (err instanceof SerpApiQuotaError || err instanceof SerpApiAuthError) {
      throw err;
    }
    if (err?.message?.includes('Tempo limite')) {
      logSerpErro('Timeout de 30s atingido na busca Serper.dev:', err.message);
      throw err;
    }
    logSerpAviso('Busca Serper.dev finalizada sem resultados:', err.message);
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
  const chave = `hubi_serp_shopping_cache_v21_${termo.toLowerCase().trim()}`;
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
  const chave = `hubi_serp_shopping_cache_v21_${termo.toLowerCase().trim()}`;
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

export const desembrulharUrlGoogle = (urlBruta: string): string => {
  const raw = (urlBruta || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (host === 'google.com' || host.endsWith('.google.com') || host === 'google.com.br' || host.endsWith('.google.com.br')) {
      const destino =
        parsed.searchParams.get('url') ||
        parsed.searchParams.get('q') ||
        parsed.searchParams.get('adurl') ||
        parsed.searchParams.get('u') ||
        '';
      if (destino && /^https?:\/\//i.test(destino)) {
        const hostDestino = new URL(destino).hostname.toLowerCase();
        if (!hostDestino.includes('google.com')) {
          return destino;
        }
      }
      return '';
    }
    return raw;
  } catch {
    return raw;
  }
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
    const urlOriginal = String(item.link || item.product_link || item.url || '').trim();
    const url = desembrulharUrlGoogle(urlOriginal);
    // Se a URL era redirecionamento do Google sem destino real de varejista, descarta o item
    if (urlOriginal && !url) {
      continue;
    }
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
    const lojaLower = loja.toLowerCase().trim();
    if (!lojaLower || lojaLower === 'google' || lojaLower === 'google shopping' || lojaLower.includes('google.com')) {
      continue;
    }

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

  if (!chaveLimpa) {
    throw new SerpApiAuthError(
      'Chave do Serper.dev não configurada para esta loja. Cadastre sua chave gratuita (2.500 consultas grátis em https://serper.dev/api-key) nas Configurações da Loja para usar o Radar de Preços.'
    );
  }

  const lojaId = loja?.id;
  const num = Math.min(Math.max(numResultados, 20), 30);

  const sanitizarQuerySerperSimples = (texto: string): string =>
    (texto || '')
      .replace(/["'`:;\-+=$!?()[\]{}\\/|@#%^&*~<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const querySimples = sanitizarQuerySerperSimples(queryFinal);
  const queryCurtaModelo = extrairQueryCurtaModelo(termo);
  const queryCurtaSimples = sanitizarQuerySerperSimples(queryCurtaModelo);
  const usarQueryCurtaParalela =
    Boolean(queryCurtaSimples) &&
    queryCurtaSimples.toLowerCase() !== querySimples.toLowerCase();

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
  // com busca dupla paralela (termo canônico + query curta de modelo)
  if (chaveLimpa) {
    promessasParalelas.push(
      executarSerperPost('shopping', { q: querySimples, gl: 'br', hl: 'pt-br' }),
      executarSerperPost('search', { q: `${querySimples} comprar preco`, gl: 'br', hl: 'pt-br', num: 20 })
    );
    if (usarQueryCurtaParalela) {
      promessasParalelas.push(
        executarSerperPost('shopping', { q: queryCurtaSimples, gl: 'br', hl: 'pt-br' }),
        executarSerperPost('search', { q: `${queryCurtaSimples} comprar preco`, gl: 'br', hl: 'pt-br', num: 20 })
      );
    }
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
    if (usarQueryCurtaParalela) {
      promessasParalelas.push(
        (async () => {
          try {
            const { data: edgeData, error } = await supabase.functions.invoke('buscar-fotos-serpapi', {
              body: {
                q: queryCurtaSimples,
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
        })()
      );
    }
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
    if (usarQueryCurtaParalela) {
      promessasParalelas.push(
        (async () => {
          try {
            const { data: edgeData, error } = await supabase.functions.invoke('buscar-fotos-serpapi', {
              body: {
                q: queryCurtaSimples,
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
        })()
      );
    }
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

      // Deduplica por domínio/loja mantendo o menor preço válido por loja de forma determinística
      const extrairChaveDominioOuLoja = (item: ItemShoppingSerpApi): string => {
        if (item.url) {
          try {
            const host = new URL(item.url).hostname.replace(/^www\./i, '').toLowerCase();
            if (host && !host.includes('google.')) {
              return host;
            }
          } catch {}
        }
        return item.loja.toLowerCase().trim();
      };

      const porDominioOuLoja = new Map<string, ItemShoppingSerpApi>();
      for (const item of itensFiltradosPiso) {
        if (typeof item.preco !== 'number' || !Number.isFinite(item.preco) || item.preco <= 0) {
          continue;
        }
        const chave = extrairChaveDominioOuLoja(item);
        const existente = porDominioOuLoja.get(chave);
        if (
          !existente ||
          item.preco < existente.preco ||
          (item.preco === existente.preco && item.titulo.localeCompare(existente.titulo) < 0)
        ) {
          porDominioOuLoja.set(chave, item);
        }
      }

      const distintasDeterministicas = Array.from(porDominioOuLoja.values()).sort(
        (a, b) => a.preco - b.preco || a.loja.localeCompare(b.loja)
      );

      const ofertasFinais = distintasDeterministicas.slice(0, 30);
      logSerpSucesso(`⚡ Encontradas ${ofertasFinais.length} ofertas (${distintasDeterministicas.length} lojas/domínios distintos) para "${queryFinal}"`);
      console.log(`%c[HUBI PERF ⏱️]%c [SERPER] Busca paralela concluída em ${Math.round(performance.now() - tInicioSerper)}ms`, 'color: #0ea5e9; font-weight: bold;', 'color: #38bdf8;');
      salvarCacheShoppingSerp(queryFinal, ofertasFinais);
      return ofertasFinais;
    }
  } catch (err) {
    logSerpAviso('Aviso ao buscar preços no Google Shopping:', err);
  }

  return [];
};

export interface CandidatoEanSerper {
  ean: string;
  titulo: string;
  snippet: string;
  fonte: string;
  url: string;
  ocorrencias: number;
  mencionaTermoEan: boolean;
}

const cacheCandidatosEanMemoria = new Map<
  string,
  { expiraEm: number; dados: CandidatoEanSerper[] }
>();

/**
 * Busca candidatos de código de barras (EAN/GTIN) na pesquisa orgânica do Serper.dev
 * filtrando imediatamente pelo dígito verificador GS1 Módulo 10.
 */
export const buscarCandidatosEanSerper = async (
  termo: string,
  loja?: Loja | { id?: string; serper_api_key?: string | null } | null
): Promise<CandidatoEanSerper[]> => {
  const termoLimpo = (termo || '').trim();
  if (termoLimpo.length < 3) return [];

  const queryPrincipal =
    extrairTermoPrincipalProduto(termoLimpo) ||
    limparTermoParaBuscaGoogle(termoLimpo) ||
    termoLimpo;
  if (!queryPrincipal) return [];

  const chaveCache = `${loja?.id || 'global'}::${normalizarSemAcentos(queryPrincipal)}`;
  const emCache = cacheCandidatosEanMemoria.get(chaveCache);
  if (emCache && Date.now() < emCache.expiraEm) {
    return emCache.dados;
  }

  let chaveApi = obterSerpApiKey(loja as Loja);
  if (!chaveApi && loja?.id) {
    try {
      chaveApi = await obterOuBuscarSerpApiKey(loja as Loja);
    } catch {
      chaveApi = '';
    }
  }

  if (!chaveApi) {
    return [];
  }

  const extrairDominioUrl = (urlStr: string, fallbackFonte: string): string => {
    if (urlStr) {
      try {
        return new URL(urlStr).hostname.replace(/^www\./i, '').toLowerCase();
      } catch {
        // Fallback para fonte textual
      }
    }
    return fallbackFonte || 'Pesquisa Web';
  };

  const consultarSerperEan = async (
    queryStr: string
  ): Promise<
    Array<{ titulo: string; snippet: string; url: string; fonte: string }>
  > => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 4500);
    try {
      const resp = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': chaveApi,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: queryStr,
          gl: 'br',
          hl: 'pt-br',
          num: 10,
        }),
        signal: ctrl.signal,
      });

      if (!resp.ok) return [];
      const data = await resp.json().catch(() => null);
      if (!data || typeof data !== 'object') return [];

      const entradas: Array<{
        titulo: string;
        snippet: string;
        url: string;
        fonte: string;
      }> = [];

      if (data.knowledgeGraph && typeof data.knowledgeGraph === 'object') {
        const kg = data.knowledgeGraph as Record<string, unknown>;
        const attrs =
          kg.attributes && typeof kg.attributes === 'object'
            ? Object.entries(kg.attributes as Record<string, unknown>)
                .map(([k, v]) => `${k}: ${String(v ?? '')}`)
                .join(' | ')
            : '';
        entradas.push({
          titulo: String(kg.title || queryPrincipal),
          snippet: `${String(kg.description || '')} ${attrs}`.trim(),
          url: String(kg.website || ''),
          fonte: 'Google Knowledge Graph',
        });
      }

      if (data.answerBox && typeof data.answerBox === 'object') {
        const ab = data.answerBox as Record<string, unknown>;
        entradas.push({
          titulo: String(ab.title || queryPrincipal),
          snippet: `${String(ab.answer || '')} ${String(ab.snippet || '')}`.trim(),
          url: String(ab.link || ''),
          fonte: extrairDominioUrl(String(ab.link || ''), 'Google Answer Box'),
        });
      }

      const organic = Array.isArray(data.organic) ? data.organic : [];
      for (const item of organic) {
        if (!item || typeof item !== 'object') continue;
        const link = String((item as Record<string, unknown>).link || '');
        const fonteRaw = String(
          (item as Record<string, unknown>).source ||
            (item as Record<string, unknown>).displayLink ||
            ''
        );
        entradas.push({
          titulo: String((item as Record<string, unknown>).title || ''),
          snippet: String((item as Record<string, unknown>).snippet || ''),
          url: link,
          fonte: extrairDominioUrl(link, fonteRaw),
        });
      }

      return entradas;
    } catch {
      return [];
    } finally {
      window.clearTimeout(timer);
    }
  };

  const mapearCandidatos = (
    entradas: Array<{ titulo: string; snippet: string; url: string; fonte: string }>
  ): CandidatoEanSerper[] => {
    const mapa = new Map<string, CandidatoEanSerper>();

    for (const entrada of entradas) {
      const textoCompleto = `${entrada.titulo} ${entrada.snippet} ${entrada.url}`;
      const matches = textoCompleto.match(/\b(\d{8}|\d{12}|\d{13}|\d{14})\b/g);
      if (!matches) continue;

      const mencionaTermoEan = /(ean|gtin|c[oó]digo\s+de\s+barras|barcode|upc)/i.test(
        `${entrada.titulo} ${entrada.snippet}`
      );
      const unicosNaEntrada = new Set(matches.filter((m) => validarGtinGs1(m)));

      for (const ean of unicosNaEntrada) {
        const existente = mapa.get(ean);
        if (existente) {
          existente.ocorrencias += 1;
          existente.mencionaTermoEan = existente.mencionaTermoEan || mencionaTermoEan;
          if (!existente.snippet && entrada.snippet) {
            existente.snippet = entrada.snippet;
          }
        } else {
          mapa.set(ean, {
            ean,
            titulo: entrada.titulo,
            snippet: entrada.snippet,
            fonte: entrada.fonte,
            url: entrada.url,
            ocorrencias: 1,
            mencionaTermoEan,
          });
        }
      }
    }

    return Array.from(mapa.values())
      .sort((a, b) => {
        if (a.mencionaTermoEan !== b.mencionaTermoEan) {
          return a.mencionaTermoEan ? -1 : 1;
        }
        return b.ocorrencias - a.ocorrencias;
      })
      .slice(0, 5);
  };

  const queryLimpa = queryPrincipal.replace(/["'`:;+=!?()[\]{}\\/|@#%^&*~<>]/g, ' ').replace(/\s+/g, ' ').trim();
  const entradas1 = await consultarSerperEan(`${queryLimpa} EAN GTIN codigo de barras`);
  let candidatos = mapearCandidatos(entradas1);

  if (candidatos.length === 0) {
    const partNumbers = extrairPartNumbersProduto(termoLimpo);
    if (partNumbers.length > 0) {
      const pn = partNumbers[partNumbers.length - 1];
      const baseCurta = queryLimpa.split(/\s+/).slice(0, 3).join(' ');
      const entradas2 = await consultarSerperEan(`${baseCurta} ${pn} EAN`);
      candidatos = mapearCandidatos([...entradas1, ...entradas2]);
    }
  }

  cacheCandidatosEanMemoria.set(chaveCache, {
    expiraEm: Date.now() + 15 * 60 * 1000,
    dados: candidatos,
  });

  return candidatos;
};
