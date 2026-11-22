// Serviço de Inteligência Artificial Google Gemini (Visão Multimodal e Processamento de Produtos)
import { supabase, supabaseFunctionsBaseUrl, supabaseAnonKey } from '../lib/supabase';
import { Loja } from '../types';
import {
  obterSerpApiKey,
  obterOuBuscarSerpApiKey,
  buscarFotosGoogleImagesSerpApi,
  buscarPrecosShoppingSerpApi,
  limparTermoParaBuscaGoogle,
  extrairTermoEnxutoBusca,
  extrairRamoCurtoLoja,
  montarQueryEnriquecidaComRamo,
  extrairPrecoNumericoBr,
  normalizarNomeLojaBr,
  desembrulharUrlGoogle,
  classificarTipoLojaShopping,
  ehCompraInternacional,
  ofertaCorrespondeAoModeloPesquisado,
  SerpApiQuotaError,
  SerpApiAuthError,
  FotoResultadoSerpApi,
  ItemShoppingSerpApi
} from './serpApiService';
import {
  catalogJevService,
  blindarMargemCustoVarejo,
  type EntradaCacheSessao,
  criarChaveCacheEscopada,
  lerCacheHibridoSessao,
  salvarCacheHibridoSessao
} from './catalogJevService';
import {
  getAvailableGeminiModels,
  getAvailableGeminiModel,
  invalidarCacheGemini,
  isModeloIndisponivel,
  registrarModeloIndisponivel,
  testarChaveGemini
} from './geminiClient';
import {
  comprimirFotoProduto,
  OPCOES_COMPRESSAO_VISAO_IA,
  type PayloadBase64IA
} from '../utils/imageCompressor';

export {
  SerpApiQuotaError,
  SerpApiAuthError,
  getAvailableGeminiModels,
  getAvailableGeminiModel,
  invalidarCacheGemini,
  testarChaveGemini
};
export type { FotoResultadoSerpApi };

export interface ProdutoSugeridoIA {
  nome: string;
  categoria_sugerida?: string;
  subcategoria_sugerida?: string;
  preco_venda_estimado?: number;
  preco_custo_estimado?: number;
  descricao?: string;
  tipo_unidade?: string;
  codigo_barras?: string;
  dados_mercado?: any;
  duvida?: boolean;
  diferencial?: string;
  opcoes_sugeridas?: ProdutoSugeridoIA[];
  peso_kg?: number;
  altura_cm?: number;
  largura_cm?: number;
  comprimento_cm?: number;
  foto_url?: string;
}

export interface DimensoesEPesoExtraidos {
  peso_kg?: number;
  altura_cm?: number;
  largura_cm?: number;
  comprimento_cm?: number;
}

/**
 * Extrai instantaneamente peso e medidas a partir de termos no título ou descrição (ex: 500g, 5kg, 350ml, 20x15x10cm)
 */
export const extrairDimensoesEPesoTexto = (texto: string): DimensoesEPesoExtraidos => {
  if (!texto) return {};
  const t = texto.toLowerCase();
  const res: DimensoesEPesoExtraidos = {};

  // 1. Detecção de peso explícito em kg (ex: "5kg", "5,5 kg", "0.5kg")
  const matchKg = t.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|quilos?)\b/);
  if (matchKg) {
    const val = parseFloat(matchKg[1].replace(',', '.'));
    if (!isNaN(val) && val > 0) res.peso_kg = Number(val.toFixed(3));
  }

  // 2. Detecção de peso em gramas (ex: "500g", "500 gramas", "250 g")
  if (!res.peso_kg) {
    const matchG = t.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramas?)\b/);
    if (matchG) {
      const val = parseFloat(matchG[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) res.peso_kg = Number((val / 1000).toFixed(3));
    }
  }

  // 3. Detecção de líquidos em litros ou ml (calculando peso do líquido + tara da embalagem de despacho)
  if (!res.peso_kg) {
    const matchL = t.match(/(\d+(?:[.,]\d+)?)\s*(?:l|litros?)\b/);
    if (matchL) {
      const val = parseFloat(matchL[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) {
        const ehVidro = t.includes('vidro') || t.includes('vinho') || t.includes('cerveja') || t.includes('azeite');
        const tara = ehVidro ? 0.45 : 0.15;
        res.peso_kg = Number((val + tara).toFixed(3));
      }
    } else {
      const matchMl = t.match(/(\d+(?:[.,]\d+)?)\s*(?:ml)\b/);
      if (matchMl) {
        const val = parseFloat(matchMl[1].replace(',', '.'));
        if (!isNaN(val) && val > 0) {
          const litros = val / 1000;
          const ehVidro = t.includes('vidro') || t.includes('vinho') || t.includes('cerveja') || t.includes('azeite') || t.includes('perfume');
          const tara = ehVidro ? 0.25 : 0.08;
          res.peso_kg = Number((litros + tara).toFixed(3));
        }
      }
    }
  }

  // 4. Detecção de dimensões (ex: "20x15x10cm" ou "20 x 15 x 10 cm")
  const matchDim = t.match(/(\d+(?:[.,]\d+)?)\s*[xX*]\s*(\d+(?:[.,]\d+)?)\s*[xX*]\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?\b/);
  if (matchDim) {
    const d1 = parseFloat(matchDim[1].replace(',', '.'));
    const d2 = parseFloat(matchDim[2].replace(',', '.'));
    const d3 = parseFloat(matchDim[3].replace(',', '.'));
    if (!isNaN(d1) && !isNaN(d2) && !isNaN(d3)) {
      const sorted = [d1, d2, d3].sort((a, b) => b - a);
      res.comprimento_cm = sorted[0];
      res.largura_cm = sorted[1];
      res.altura_cm = sorted[2];
    }
  }

  return res;
};


const STORAGE_KEY_GOOGLE_SEARCH_KEY = 'hubi_google_search_api_key';
const STORAGE_KEY_GOOGLE_SEARCH_CX = 'hubi_google_search_cx';

export const getGeminiApiKey = (loja?: any): string => {
  const chave = (
    loja?.gemini_api_key ||
    loja?.configuracoes_extras?.ia?.gemini_api_key ||
    ''
  ).trim();

  // Se veio do objeto da loja mas não estava no localStorage do aparelho, sincroniza no storage
  if (false) {
    try {

    } catch {}
  }

  return chave;
};

/**
 * Obtém a chave Gemini de forma assíncrona, consultando o banco de dados Supabase
 * caso ainda não esteja no localStorage do dispositivo.
 */
export const obterOuBuscarGeminiApiKey = async (loja?: Loja | any | null): Promise<string> => {
  const chaveLocal = getGeminiApiKey(loja);
  if (chaveLocal) return chaveLocal;

  if (loja?.id) {
    try {
      const { data, error } = await supabase
        .from('lojas')
        .select('gemini_api_key, configuracoes_extras')
        .eq('id', loja.id)
        .maybeSingle();

      if (!error && data) {
        if (data.gemini_api_key && typeof data.gemini_api_key === 'string' && data.gemini_api_key.trim()) {
          const limpa = data.gemini_api_key.trim();

          return limpa;
        }

        if (data.configuracoes_extras) {
          let meta = data.configuracoes_extras;
          if (typeof meta === 'string') {
            try {
              meta = JSON.parse(meta);
            } catch {
              meta = {};
            }
          }
          const chaveDb = (meta as any)?.ia?.gemini_api_key || '';
          if (chaveDb && typeof chaveDb === 'string') {
            const limpa = chaveDb.trim();
            if (limpa) {
    
              return limpa;
            }
          }
        }
      }
    } catch (e: any) {
      console.warn('[GeminiService] Erro ao buscar chave Gemini no Supabase:', e?.message || e);
    }
  }

  return '';
};

/**
 * Salva a chave da API do Google Gemini tanto no localStorage quanto no banco de dados Supabase
 * garantindo persistência definitiva entre dispositivos e evitando perdas de sessão.
 */
export const salvarGeminiApiKey = async (
  key: string,
  lojaId?: string,
  lojaAtual?: any
): Promise<void> => {
  const limpa = key.trim();

  // Limpa cache de modelos para consultar imediatamente os modelos da nova chave
  limparCacheModelosGemini();

  // 1. Grava no localStorage para acesso síncrono imediato no dispositivo
  if (limpa) {

  } else {

  }

  // 2. Persiste no banco de dados Supabase
  if (lojaId) {
    try {
      let configAtual = lojaAtual?.configuracoes_extras;

      if (!configAtual) {
        const { data } = await supabase
          .from('lojas')
          .select('configuracoes_extras')
          .eq('id', lojaId)
          .maybeSingle();
        configAtual = data?.configuracoes_extras || {};
      }

      if (typeof configAtual === 'string') {
        try {
          configAtual = JSON.parse(configAtual);
        } catch {
          configAtual = {};
        }
      }

      const novaConfig = {
        ...(configAtual || {}),
        ia: {
          ...((configAtual && configAtual.ia) || {}),
          gemini_api_key: limpa
        }
      };

      const { error } = await supabase
        .from('lojas')
        .update({
          gemini_api_key: limpa,
          configuracoes_extras: novaConfig,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', lojaId);

      if (error) {
        console.error('[GeminiService] Erro ao persistir chave Gemini no Supabase:', error);
      }
    } catch (err) {
      console.error('[GeminiService] Falha ao salvar chave Gemini no banco:', err);
    }
  }
};

export const setGeminiApiKey = (key: string, lojaId?: string, lojaAtual?: any) => {
  salvarGeminiApiKey(key, lojaId, lojaAtual);
};

export const getGoogleSearchConfig = (loja?: any): { apiKey: string; cx: string } => {
  const apiKey =
    loja?.configuracoes_extras?.ia?.google_search_api_key ||
    localStorage.getItem(STORAGE_KEY_GOOGLE_SEARCH_KEY) ||
    loja?.configuracoes_extras?.ia?.gemini_api_key ||
    getGeminiApiKey(loja) ||
    '';
  const cx =
    loja?.configuracoes_extras?.ia?.google_search_cx ||
    localStorage.getItem(STORAGE_KEY_GOOGLE_SEARCH_CX) ||
    '';
  return { apiKey: apiKey.trim(), cx: cx.trim() };
};

export const setGoogleSearchConfig = (apiKey: string, cx: string) => {
  if (apiKey.trim()) {
    localStorage.setItem(STORAGE_KEY_GOOGLE_SEARCH_KEY, apiKey.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_GOOGLE_SEARCH_KEY);
  }
  if (cx.trim()) {
    localStorage.setItem(STORAGE_KEY_GOOGLE_SEARCH_CX, cx.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_GOOGLE_SEARCH_CX);
  }
};

/**
 * Converte o ID do segmento ou obtém o nome comercial descritivo do segmento da loja
 */
export const obterNomeSegmentoLoja = (loja?: any): string => {
  const segmentoId =
    loja?.configuracoes_extras?.perfil_negocio?.segmento ||
    loja?.segmento ||
    '';

  const mapaNomes: Record<string, string> = {
    sexshop: 'Sex Shop / Produtos Eróticos / Bem-Estar Íntimo',
    moda: 'Moda / Vestuário / Calçados',
    lingerie: 'Lingerie / Moda Íntima / Praia',
    cosmeticos: 'Beleza / Cosméticos / Perfumes',
    motepecas: 'Motopeças / Autopeças / Oficina Mecânica',
    restaurante: 'Restaurante / Bar / Gastronomia / Delivery',
    mercado: 'Mercado / Mercearia / Empório',
    petshop: 'Pet Shop / Produtos Veterinários',
    papelaria: 'Papelaria / Armarinho / Presentes',
    otica: 'Ótica / Joalheria / Relojoaria',
    informatica: 'Informática / Celulares / Eletrônicos',
    eletronicos: 'Eletrônicos / Informática / Tecnologia',
    construcao: 'Material de Construção / Tintas / Elétrica',
    artesanato: 'Artesanato / Decoração / Variedades',
    geral: 'Varejo Comercial Geral'
  };

  if (!segmentoId) return '';
  return mapaNomes[segmentoId] || segmentoId;
};

/**
 * Monta o contexto de sistema com o ramo de atividade e o perfil (`sobre_loja`)
 * para evitar ambiguidades de nicho na geração de descrições e enriquecimento por IA.
 */
const montarContextoSegmentoSistema = (
  segmentoLoja?: string,
  loja?: (Partial<Loja> & { id?: string; segmento?: string }) | null
): string => {
  const ramoEfetivo = (segmentoLoja || obterNomeSegmentoLoja(loja) || '').trim();
  const sobreLoja = (loja?.sobre_loja || '').trim();
  if (!ramoEfetivo && !sobreLoja) return '';

  const partes: string[] = [
    'Você é o assistente de catálogo comercial do sistema HUBI (varejo brasileiro).'
  ];

  if (ramoEfetivo) {
    partes.push(
      `RAMO DE ATIVIDADE DA LOJA (OBRIGATÓRIO): "${ramoEfetivo}". Interprete o nome do produto, materiais, uso e público-alvo estritamente dentro deste segmento comercial. Nunca interprete palavras ambíguas fora desse nicho.`
    );
  }
  if (sobreLoja) {
    partes.push(`PERFIL / SOBRE A LOJA: "${sobreLoja.slice(0, 300)}".`);
  }

  return partes.join('\n');
};

/**
 * Comprime a imagem para 380px JPEG antes de enviar para a API Gemini (payload ultraleve < 30KB)
 * com suporte resiliente a URLs externas com bypass de CORS via CDN pública.
 */
export const comprimirImagemParaIA = async (base64OrUrl: string): Promise<{ base64: string; mimeType: string }> => {
  return new Promise(async (resolve, reject) => {
    let target = (base64OrUrl || '').trim();
    if (!target) {
      reject(new Error('Imagem inválida ou ausente para análise da IA.'));
      return;
    }

    // Se for URL externa (http/https/blob)
    if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('blob:')) {
      let blobObtido: Blob | null = null;

      // 1. Tentar fetch direto (rápido para URLs locais, blobs ou servidores com CORS liberado)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(target, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          blobObtido = await response.blob();
        }
      } catch {}

      // 2. Se falhar por CORS, utilizar proxy de imagem com CORS público (weserv.nl)
      // weserv.nl entrega com Access-Control-Allow-Origin: *, já redimensionado para 380px em ~200ms
      if (!blobObtido && (target.startsWith('http://') || target.startsWith('https://'))) {
        try {
          const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(target)}&w=380&q=70&output=jpg`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);
          const responseProxy = await fetch(proxyUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (responseProxy.ok) {
            blobObtido = await responseProxy.blob();
          }
        } catch {}
      }

      if (blobObtido) {
        let previewTempUrl: string | undefined;
        try {
          const comprimido = await comprimirFotoProduto(blobObtido, OPCOES_COMPRESSAO_VISAO_IA);
          previewTempUrl = comprimido.previewUrl;
          resolve({
            base64: comprimido.base64Limpo,
            mimeType: comprimido.mimeType
          });
          return;
        } catch {
          // Prossegue para o fallback abaixo caso o blob não seja decodificado diretamente
        } finally {
          if (previewTempUrl && previewTempUrl.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(previewTempUrl);
            } catch {
              // Ignora caso já tenha sido revogada
            }
          }
        }
      }
    }

    // Se ainda for URL e não foi convertida para dataUrl, tentar via tag Image com crossOrigin
    if (!target.startsWith('data:image')) {
      if (target.startsWith('http://') || target.startsWith('https://')) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          let canvas: HTMLCanvasElement | null = document.createElement('canvas');
          let ctx: CanvasRenderingContext2D | null = null;
          try {
            const w = Math.min(img.width || 380, 380);
            const h = Math.max(1, Math.round(((img.height || 380) * w) / (img.width || 380)));
            canvas.width = w;
            canvas.height = h;
            ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, w, h);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
              const clean = dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
              resolve({ base64: clean, mimeType: 'image/jpeg' });
              return;
            }
          } catch {
            // Falha ao exportar canvas por restrição CORS
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
            img.onload = null;
            img.onerror = null;
            img.src = '';
          }
          reject(new Error('Não foi possível processar a imagem externa devido a restrições de CORS da fonte.'));
        };
        img.onerror = () => {
          img.onload = null;
          img.onerror = null;
          img.src = '';
          reject(new Error('Não foi possível carregar a imagem externa para análise da IA. Salve a foto no seu dispositivo ou selecione outra foto.'));
        };
        img.src = target;
        return;
      }

      // Se for apenas uma string base64 pura sem prefixo data:image
      if (target.length > 100 && !target.startsWith('http')) {
        const clean = target.includes(',') ? target.split(',')[1] : target;
        resolve({ base64: clean, mimeType: 'image/jpeg' });
        return;
      }

      reject(new Error('Formato de imagem inválido para processamento pela IA.'));
      return;
    }

    // Fast-path: Se já for data:image e for leve (< 95KB / ~70KB binário), extrai direto em < 1ms
    if (target.startsWith('data:image') && target.length < 95000) {
      const mimeMatch = target.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const clean = target.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      resolve({ base64: clean, mimeType });
      return;
    }

    // Processamento do canvas a partir do data:image com proteção de timeout
    let finalizado = false;
    const timerFallback = setTimeout(() => {
      if (!finalizado) {
        finalizado = true;
        const clean = target.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
        resolve({ base64: clean, mimeType: 'image/jpeg' });
      }
    }, 3500);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(timerFallback);

      const maxDim = OPCOES_COMPRESSAO_VISAO_IA.maxDimension ?? 512;
      const qualidadeVisao = OPCOES_COMPRESSAO_VISAO_IA.quality ?? 0.68;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      let canvas: HTMLCanvasElement | null = document.createElement('canvas');
      canvas.width = width || maxDim;
      canvas.height = height || maxDim;
      let ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
      try {
        if (!ctx) {
          const clean = target.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
          resolve({ base64: clean, mimeType: 'image/jpeg' });
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', qualidadeVisao);
        const cleanBase64 = compressedDataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

        resolve({
          base64: cleanBase64,
          mimeType: 'image/jpeg'
        });
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
        img.onload = null;
        img.onerror = null;
        img.src = '';
      }
    };
    img.onerror = () => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(timerFallback);
      const clean = target.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      resolve({
        base64: clean,
        mimeType: 'image/jpeg'
      });
    };
    img.src = target;
  });
};

export const limparCacheModelosGemini = (apiKey?: string) => {
  invalidarCacheGemini(apiKey);
};

export const obterModelosValidosGemini = async (apiKey: string): Promise<string[]> => {
  return await getAvailableGeminiModels(apiKey);
};

/**
 * Sanitiza, repara e faz o parse seguro de strings JSON vindas de LLMs:
 * - Remove blocos markdown (```json ... ```)
 * - Repara chaves sem aspas duplas (Expected double-quoted property name)
 * - Remove vírgulas sobrando antes de } ou ]
 * - Escapa quebras de linha literais dentro de strings
 * - Fecha strings e objetos truncados no final (Unterminated string in JSON)
 */
const sanitizarERepararJson = (bruto: string): string => {
  let s = bruto.replace(/```(?:json|JSON)?/g, '').replace(/```/g, '').trim();

  const idxAbreObj = s.indexOf('{');
  const idxAbreArr = s.indexOf('[');
  let idxInicio = -1;
  if (idxAbreObj !== -1 && idxAbreArr !== -1) {
    idxInicio = Math.min(idxAbreObj, idxAbreArr);
  } else {
    idxInicio = Math.max(idxAbreObj, idxAbreArr);
  }
  if (idxInicio > 0) {
    s = s.slice(idxInicio);
  }

  // Varredura caractere por caractere para escapar quebras de linha dentro de strings e rastrear truncamento
  let resultado = '';
  let inString = false;
  let quoteChar = '"';
  let escaped = false;
  const pilha: string[] = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (inString) {
      if (escaped) {
        resultado += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        resultado += ch;
        escaped = true;
        continue;
      }
      if (ch === quoteChar) {
        resultado += '"';
        inString = false;
        continue;
      }
      if (ch === '\n') {
        resultado += '\\n';
        continue;
      }
      if (ch === '\r') {
        resultado += '\\r';
        continue;
      }
      if (ch === '\t') {
        resultado += '\\t';
        continue;
      }
      if (quoteChar === "'" && ch === '"') {
        resultado += '\\"';
        continue;
      }
      resultado += ch;
    } else {
      if (ch === '"' || ch === "'") {
        inString = true;
        quoteChar = ch;
        resultado += '"';
        continue;
      }
      if (ch === '{') {
        pilha.push('}');
        resultado += ch;
        continue;
      }
      if (ch === '[') {
        pilha.push(']');
        resultado += ch;
        continue;
      }
      if (ch === '}' || ch === ']') {
        if (pilha.length > 0 && pilha[pilha.length - 1] === ch) {
          pilha.pop();
        }
        resultado += ch;
        if (pilha.length === 0) {
          // Objeto raiz fechado com sucesso; descarta lixo posterior
          break;
        }
        continue;
      }
      resultado += ch;
    }
  }

  // Se terminou com barra invertida pendente dentro de string, remove
  if (inString && escaped) {
    resultado = resultado.slice(0, -1);
  }

  // Se a string ficou aberta por truncamento de tokens, fecha a aspa dupla
  if (inString) {
    resultado += '"';
  }

  // Repara propriedades sem aspas duplas fora de strings: { chave: valor, outra_chave: 10 }
  resultado = resultado.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

  // Remove casos de chave truncada no final sem valor (ex: , "descricao": ou , "preco")
  resultado = resultado.replace(/,\s*"[^"]*"\s*:\s*$/g, '');
  resultado = resultado.replace(/,\s*"[^"]*"\s*$/g, '');
  resultado = resultado.replace(/:\s*$/g, ': null');

  // Remove vírgulas pendentes no final antes de fechar estruturas
  resultado = resultado.replace(/,\s*$/g, '');

  // Fecha todas as chaves/colchetes abertos na pilha
  while (pilha.length > 0) {
    const fechamento = pilha.pop()!;
    resultado += fechamento;
  }

  // Remove vírgulas sobrando antes de } ou ]
  resultado = resultado.replace(/,\s*([}\]])/g, '$1');

  return resultado;
};

/**
 * Extrai e parseia de forma segura objetos JSON a partir de respostas de IA,
 * mesmo se a IA incluir texto conversacional, markdown, aspas simples, vírgulas extras ou truncamento.
 */
export const extrairJsonDoTexto = (texto: string): any => {
  if (!texto) return null;

  const limpoInicial = texto.replace(/```(?:json|JSON)?/g, '').replace(/```/g, '').trim();

  // 1. Tentativa direta rápida
  try {
    return JSON.parse(limpoInicial);
  } catch {}

  // 2. Tentativa extraindo bloco { ... }
  try {
    const match = limpoInicial.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch {}

  // 3. Sanitização robusta e reparo de truncamento / aspas / vírgulas
  try {
    const reparado = sanitizarERepararJson(limpoInicial);
    return JSON.parse(reparado);
  } catch (e) {
    console.warn('[GeminiService] Falha ao extrair JSON do texto retornado pela IA após sanitização:', e);
    return null;
  }
};

export const SAFETY_SETTINGS_VAREJO = [
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    threshold: 'BLOCK_NONE'
  },
  {
    category: 'HARM_CATEGORY_HATE_SPEECH',
    threshold: 'BLOCK_ONLY_HIGH'
  },
  {
    category: 'HARM_CATEGORY_HARASSMENT',
    threshold: 'BLOCK_ONLY_HIGH'
  },
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    threshold: 'BLOCK_ONLY_HIGH'
  }
];

async function invocarGeminiProxyDireto<T = any>(
  body: Record<string, unknown>,
  timeoutMs = 14000
): Promise<T> {
  let token = supabaseAnonKey;
  try {
    const sessaoRes = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 500))
    ]);
    const accessToken =
      sessaoRes && typeof sessaoRes === 'object' && 'data' in sessaoRes
        ? sessaoRes.data?.session?.access_token
        : null;
    if (accessToken && accessToken.trim()) {
      token = accessToken.trim();
    }
  } catch {
    // Segue imediatamente com supabaseAnonKey quando não há sessão auth.users
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${supabaseFunctionsBaseUrl}/gemini-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token || supabaseAnonKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const rawText = await response.text().catch(() => '');
    let data: any = null;
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = null;
      }
    }

    if (!response.ok || (data && typeof data === 'object' && data.error)) {
      const errObj = data?.error;
      const msgJson =
        typeof errObj === 'string'
          ? errObj
          : errObj?.message || (typeof data?.message === 'string' ? data.message : '');
      if (msgJson && String(msgJson).trim()) {
        throw new Error(String(msgJson).trim());
      }
      if (rawText && !rawText.trim().startsWith('<')) {
        throw new Error(rawText.trim().slice(0, 220));
      }
      throw new Error(
        'O serviço de IA não conseguiu processar a solicitação no momento. Verifique a foto ou tente novamente.'
      );
    }

    return data as T;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('A leitura pela IA demorou mais que o esperado. Tente novamente em instantes.');
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const executarRequisicaoGemini = async (
  apiKey: string,
  requestBody: any,
  lojaId?: string
): Promise<any> => {
  const { model: modelInBody, ...restRequestBody } = requestBody || {};
  const payloadCompleto = {
    ...restRequestBody,
    safetySettings: restRequestBody.safetySettings || SAFETY_SETTINGS_VAREJO
  };

  const modeloDesejado = modelInBody || 'gemini-3.8-flash';

  // 1. Resolver chave local/loja para chamada direta de baixa latência (1 salto direto à Google API)
  let chaveParaContingencia = (apiKey || '').trim() || getGeminiApiKey();
  if (!chaveParaContingencia && lojaId) {
    try {
      chaveParaContingencia = await obterOuBuscarGeminiApiKey({ id: lojaId });
    } catch {}
  }

  // 2. Se NÃO houver chave disponível no cliente, recorrer à Supabase Edge Function (gemini-proxy)
  if (!chaveParaContingencia) {
    return await invocarGeminiProxyDireto({
      model: modeloDesejado,
      action: 'generateContent',
      requestBody: payloadCompleto,
      loja_id: lojaId,
      lojaId
    });
  }

  // 3. Execução direta ultrarrápida com cache inteligente de modelo ativo (evita GET /v1beta/models desnecessário)
  let modelos: string[] = [];
  if (!isModeloIndisponivel(modeloDesejado)) {
    const validosEmCache = await obterModelosValidosGemini(chaveParaContingencia);
    modelos = Array.from(new Set([modeloDesejado, ...validosEmCache])).filter(m => !isModeloIndisponivel(m));
  } else {
    const validos = await obterModelosValidosGemini(chaveParaContingencia);
    modelos = validos.filter(m => !isModeloIndisponivel(m));
  }

  if (modelos.length === 0) {
    modelos = ['gemini-3.8-flash'];
  }

  let primeiroErro: string | null = null;
  let contador429 = 0;

  const temImagem = payloadCompleto.contents?.some((c: any) =>
    c.parts?.some((p: any) => p.inline_data || p.inlineData)
  );

  // Timeouts equilibrados: 20s para geração completa (texto e multimodal)
  const timeoutMs = 20000;

  let tentativas = 0;
  for (const modelo of modelos) {
    tentativas++;
    if (tentativas > 2) {
      break;
    }

    let respostaOk = false;
    let payloadTentativa = payloadCompleto;
    for (let subTentativa = 1; subTentativa <= 2; subTentativa++) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${chaveParaContingencia}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadTentativa),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          respostaOk = true;
          return await response.json();
        } else {
          const errJson = await response.json().catch(() => ({}));
          const msg = errJson?.error?.message || response.statusText;
          if (!primeiroErro) primeiroErro = msg;

          // Se for 401 ou 403 (chave não autorizada ou inválida), interromper e alertar imediatamente
          if (response.status === 401 || response.status === 403) {
            console.error(`[Gemini] Erro de autenticação (${response.status}) no modelo ${modelo}:`, msg);
            throw new Error('Chave da API do Google Gemini inválida ou não autorizada. Verifique a chave nas configurações.');
          }

          // Se for 400 por incompatibilidade de thinkingConfig ou responseSchema em modelo secundário, remove e tenta novamente
          if (response.status === 400) {
            if (
              subTentativa === 1 &&
              (payloadTentativa.generationConfig?.thinkingConfig || payloadTentativa.generationConfig?.responseSchema)
            ) {
              const { thinkingConfig: _tc, responseSchema: _rs, ...restGenConfig } = payloadTentativa.generationConfig;
              payloadTentativa = {
                ...payloadTentativa,
                generationConfig: restGenConfig
              };
              continue;
            }
            console.warn(`[Gemini] Erro 400 no modelo ${modelo}:`, msg);
            if (temImagem) {
              throw new Error('A imagem selecionada não pôde ser interpretada pela IA. Por favor, tente com outra foto ou tire uma foto com a câmera.');
            }
            throw new Error('Parâmetros inválidos para a consulta de IA.');
          }

          if (response.status === 429) {
            const isZeroQuotaModel = msg.includes('limit: 0') || msg.includes('limit:0');
            if (!isZeroQuotaModel) {
              contador429++;
              if (contador429 >= 2) {
                console.warn('[Gemini] Limite de taxa (429) atingido na chave. Interrompendo cascata.');
                throw new Error('A cota de requisições da sua chave do Google Gemini atingiu o limite temporário. Por favor, aguarde cerca de 30 segundos antes de tentar novamente.');
              }
            } else {
              registrarModeloIndisponivel(modelo, chaveParaContingencia);
              console.warn(`[Gemini] Modelo ${modelo} não possui cota gratuita ativa (limit: 0). Pulando para o próximo.`);
            }
          }

          // Se for 404 (Not Found / Modelo indisponível), registra em memória para nunca mais repetir tentativa lenta
          if (response.status === 404) {
            console.warn(`[Gemini] Modelo ${modelo} retornou 404. Registrando fallback imediato...`);
            registrarModeloIndisponivel(modelo, chaveParaContingencia);
            break; // Pula para o próximo modelo imediatamente
          }

          console.warn(`Tentativa com modelo ${modelo} retornou erro (${response.status}):`, msg);
          break;
        }
      } catch (e: any) {
        const isAbort = e?.name === 'AbortError' || e?.message?.includes('aborted');
        if (isAbort) {
          console.warn(`[Gemini] Timeout (${timeoutMs}ms) excedido para o modelo ${modelo}.`);
          primeiroErro = temImagem
            ? 'O processamento da imagem pela IA demorou mais que o esperado. Por favor, tente novamente com boa iluminação ou pelo nome/código de barras.'
            : 'A consulta de texto pela IA demorou mais que o esperado.';
          break;
        }

        console.error(`[Gemini] Erro ao chamar modelo ${modelo}:`, e);

        if (subTentativa < 2 && !e?.message?.includes('cota') && !e?.message?.includes('inválida') && !e?.message?.includes('não pôde ser interpretada')) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }

        if (!primeiroErro) primeiroErro = e?.message || String(e);
        if (e?.message?.includes('cota') || e?.message?.includes('limite temporário') || e?.message?.includes('não pôde ser interpretada') || e?.message?.includes('inválida')) {
          throw e;
        } else {
          break;
        }
      }
    }

    if (respostaOk) break;
  }

  throw new Error(primeiroErro || 'Não foi possível conectar com os modelos Gemini disponíveis.');
};

/**
 * Analisa a foto do produto usando a API Multimodal do Google Gemini exclusivamente via Edge Function `gemini-proxy`
 */
export const identificarProdutoPorFoto = async (
  imageBase64OrUrl: string,
  segmentoLoja?: string,
  loja?: any,
  payloadPronto?: PayloadBase64IA | null
): Promise<ProdutoSugeridoIA> => {
  try {
    const tEtapa1 = performance.now();
    let cleanBase64 = payloadPronto?.base64Limpo || '';
    let detectedMime = payloadPronto?.mimeType || 'image/jpeg';

    if (!cleanBase64) {
      if (imageBase64OrUrl.startsWith('blob:')) {
        throw new Error(
          'A foto temporária expirou. Por favor, capture ou selecione a foto novamente.'
        );
      }
      const comprimida = await comprimirImagemParaIA(imageBase64OrUrl);
      cleanBase64 = comprimida.base64;
      detectedMime = comprimida.mimeType || 'image/jpeg';
    }
    console.log(`[IA-Produto] Etapa 1: Base64 pronto em ${Math.round(performance.now() - tEtapa1)}ms`);

    const promptInstrucao = `
Você é um especialista em catálogo de e-commerce e varejo no Brasil${segmentoLoja ? ` (segmento da loja: "${segmentoLoja}")` : ''}.
Analise a foto do produto enviada. Identifique o item e retorne EXCLUSIVAMENTE um objeto JSON válido:
{
  "duvida": false,
  "nome": "Nome comercial preciso e oficial do produto em português",
  "categoria_sugerida": "Categoria no varejo",
  "preco_venda_estimado": 0.00,
  "preco_custo_estimado": 0.00,
  "descricao": "Descrição concisa de 1 frase com benefícios principais.",
  "tipo_unidade": "un",
  "codigo_barras": "Código numérico se legível na foto, senão vazio",
  "diferencial": "Ex: Versão Original",
  "peso_kg": 0.3,
  "altura_cm": 10,
  "largura_cm": 15,
  "comprimento_cm": 20,
  "opcoes_sugeridas": [
    { "nome": "Opção Alternativa 1", "diferencial": "Ex: Versão Sem Açúcar", "preco_venda_estimado": 0.00, "categoria_sugerida": "Categoria" }
  ]
}
Se a foto gerar dúvida entre 2 a 3 versões/modelos possíveis, defina "duvida": true e liste as alternativas concisas em "opcoes_sugeridas". Se tiver certeza, defina "duvida": false e "opcoes_sugeridas": [].
`;

    const contextoSistema = montarContextoSegmentoSistema(segmentoLoja, loja);
    const requestBody: Record<string, unknown> = {
      ...(contextoSistema ? { systemInstruction: { parts: [{ text: contextoSistema }] } } : {}),
      contents: [
        {
          parts: [
            { text: promptInstrucao },
            {
              inline_data: {
                mime_type: detectedMime || 'image/jpeg',
                data: cleanBase64
              }
            }
          ]
        }
      ],
      safetySettings: SAFETY_SETTINGS_VAREJO,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json'
      }
    };

    const tEtapa2 = performance.now();
    const resData = await invocarGeminiPreencherViaEdgeProxy(requestBody, loja?.id);
    console.log(`[IA-Produto] Etapa 2: Gemini 3.8 Flash em ${Math.round(performance.now() - tEtapa2)}ms`);

    if (resData) {
      const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = extrairJsonDoTexto(rawText);
        if (parsed) {
          const precoEstimado = Number(parsed.preco_venda_estimado) || 0;
        const semCentavos = precoEstimado > 0 ? Math.floor(precoEstimado) : 0;

        let opcoesFormatadas: ProdutoSugeridoIA[] | undefined = undefined;
        if (Array.isArray(parsed.opcoes_sugeridas) && parsed.opcoes_sugeridas.length > 0) {
          opcoesFormatadas = parsed.opcoes_sugeridas.map((op: any) => {
            const p = Number(op.preco_venda_estimado) || 0;
            return {
              nome: op.nome || 'Opção Sugerida',
              categoria_sugerida: op.categoria_sugerida || parsed.categoria_sugerida || 'Geral',
              preco_venda_estimado: p > 0 ? Math.floor(p) : 0,
              preco_custo_estimado: Number(op.preco_custo_estimado) || 0,
              descricao: op.descricao || '',
              tipo_unidade: op.tipo_unidade || 'un',
              codigo_barras: op.codigo_barras || '',
              diferencial: op.diferencial || '',
              peso_kg: Number(op.peso_kg) > 0 ? Number(op.peso_kg) : undefined,
              altura_cm: Number(op.altura_cm) > 0 ? Number(op.altura_cm) : undefined,
              largura_cm: Number(op.largura_cm) > 0 ? Number(op.largura_cm) : undefined,
              comprimento_cm: Number(op.comprimento_cm) > 0 ? Number(op.comprimento_cm) : undefined
            };
          });
        }

        // Se houver dúvida e opções sugeridas, inclui a opção principal também na lista se ela não estiver presente
        const temDuvida = Boolean(parsed.duvida && opcoesFormatadas && opcoesFormatadas.length > 1);

        const extraidos = extrairDimensoesEPesoTexto(`${parsed.nome || ''} ${parsed.descricao || ''}`);
        let pesoKgFinal = Number(parsed.peso_kg) > 0 ? Number(parsed.peso_kg) : extraidos.peso_kg;
        let alturaFinal = Number(parsed.altura_cm) > 0 ? Number(parsed.altura_cm) : extraidos.altura_cm;
        let larguraFinal = Number(parsed.largura_cm) > 0 ? Number(parsed.largura_cm) : extraidos.largura_cm;
        let compFinal = Number(parsed.comprimento_cm) > 0 ? Number(parsed.comprimento_cm) : extraidos.comprimento_cm;

        if (!pesoKgFinal || !alturaFinal || !larguraFinal || !compFinal) {
          const tEtapa3 = performance.now();
          try {
            const dimsJev = await catalogJevService.estimarDimensoesComJev(
              parsed.nome || '',
              parsed.categoria_sugerida,
              parsed.descricao
            );
            pesoKgFinal = pesoKgFinal || dimsJev.peso_kg;
            alturaFinal = alturaFinal || dimsJev.altura_cm;
            larguraFinal = larguraFinal || dimsJev.largura_cm;
            compFinal = compFinal || dimsJev.comprimento_cm;
          } catch {}
          console.log(`[IA-Produto] Etapa 3: Jev TypeSafe em ${Math.round(performance.now() - tEtapa3)}ms`);
        }

        return {
          duvida: temDuvida,
          nome: parsed.nome || 'Produto Identificado',
          categoria_sugerida: parsed.categoria_sugerida || 'Geral',
          preco_venda_estimado: semCentavos,
          preco_custo_estimado: Number(parsed.preco_custo_estimado) || 0,
          descricao: parsed.descricao || '',
          tipo_unidade: parsed.tipo_unidade || 'un',
          codigo_barras: parsed.codigo_barras || '',
          diferencial: parsed.diferencial || '',
          peso_kg: pesoKgFinal,
          altura_cm: alturaFinal,
          largura_cm: larguraFinal,
          comprimento_cm: compFinal,
          opcoes_sugeridas: opcoesFormatadas
        };
        }
      }
    }
  } catch (err: any) {
    console.warn('Erro ao chamar Gemini Vision API:', err);
    throw err;
  }

  throw new Error('Não foi possível obter resposta da IA para a imagem enviada.');
};

/**
 * Analisa produto a partir de texto (nome, descrição ou código de barras) usando Gemini
 */
export const identificarProdutoPorTextoOuEan = async (
  tipo: 'texto' | 'barcode' | 'descricao',
  valor: string,
  segmentoLoja?: string,
  loja?: any
): Promise<ProdutoSugeridoIA> => {
  let apiKey = getGeminiApiKey(loja);
  if (!apiKey && loja?.id) {
    apiKey = await obterOuBuscarGeminiApiKey(loja);
  }

  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não configurada. Configure a chave no sistema.');
  }

  const promptInstrucao = tipo === 'barcode' ? `
Você é um especialista em catálogo de produtos, banco de dados EAN/GS1 e precificação no Brasil.
${segmentoLoja ? `CONTEXTO DA LOJA - SEGMENTO: "${segmentoLoja}".` : ''}
Identifique o produto com o seguinte Código de Barras / EAN: "${valor}".
Se não encontrar o código exato no banco, deduza a categoria e o item mais provável com base no padrão e mercado brasileiro.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown de código e sem texto adicional):
{
  "nome": "Nome comercial completo do produto em português (ex: Desodorante Aerosol Rexona Men Invisible 150ml)",
  "categoria_sugerida": "Nome da categoria mais adequada (ex: Higiene, Bebidas, Alimentos, etc.)",
  "preco_venda_estimado": 0.00,
  "preco_custo_estimado": 0.00,
  "descricao": "Descrição comercial de alta conversão destacando benefícios reais, especificações e modo de uso",
  "tipo_unidade": "un",
  "codigo_barras": "${valor}",
  "peso_kg": 0.35,
  "altura_cm": 10,
  "largura_cm": 15,
  "comprimento_cm": 20
}
IMPORTANTE SOBRE PESO E DIMENSÕES PARA FRETE:
Estime com inteligência o peso bruto do produto embalado em kg ('peso_kg', ex: 0.35 para 350g, 1.2 para 1.2kg) e as dimensões da embalagem para envio em centímetros ('altura_cm', 'largura_cm', 'comprimento_cm') para cálculo de frete nos Correios e Jadlog.
` : `
Você é um especialista em catálogo de produtos e inteligência de mercado de varejo e e-commerce no Brasil.
${segmentoLoja ? `CONTEXTO DA LOJA - SEGMENTO: "${segmentoLoja}". O item pertence a este segmento comercial.` : ''}
Com base no nome ou termo informado: "${valor}", estruture a ficha cadastral completa do produto com riqueza de detalhes comerciais.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown de código e sem texto adicional):
{
  "nome": "Nome comercial completo, padronizado e atraente do produto em português",
  "categoria_sugerida": "Nome da categoria mais adequada",
  "preco_venda_estimado": 0.00,
  "preco_custo_estimado": 0.00,
  "descricao": "Descrição comercial persuasiva e detalhada destacando benefícios, modo de uso e diferenciais para catálogo e WhatsApp",
  "tipo_unidade": "un",
  "codigo_barras": "",
  "peso_kg": 0.35,
  "altura_cm": 10,
  "largura_cm": 15,
  "comprimento_cm": 20
}
IMPORTANTE SOBRE PESO E DIMENSÕES PARA FRETE:
Estime com inteligência o peso bruto do produto embalado em kg ('peso_kg', ex: 0.35 para 350g, 1.2 para 1.2kg) e as dimensões da embalagem para envio em centímetros ('altura_cm', 'largura_cm', 'comprimento_cm') para cálculo de frete nos Correios e Jadlog.
`;

  const requestBody = {
    model: 'gemini-3.8-flash',
    contents: [{ parts: [{ text: promptInstrucao }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json'
    }
  };

  const resData = await executarRequisicaoGemini(apiKey, requestBody, loja?.id);
  const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (rawText) {
    const parsed = extrairJsonDoTexto(rawText);
    if (!parsed) {
      throw new Error('Não foi possível interpretar o JSON retornado pela IA.');
    }

    const extraidos = extrairDimensoesEPesoTexto(`${parsed.nome || valor} ${parsed.descricao || ''}`);
    const pesoKgFinal = Number(parsed.peso_kg) > 0 ? Number(parsed.peso_kg) : extraidos.peso_kg;
    const alturaFinal = Number(parsed.altura_cm) > 0 ? Number(parsed.altura_cm) : extraidos.altura_cm;
    const larguraFinal = Number(parsed.largura_cm) > 0 ? Number(parsed.largura_cm) : extraidos.largura_cm;
    const compFinal = Number(parsed.comprimento_cm) > 0 ? Number(parsed.comprimento_cm) : extraidos.comprimento_cm;

    return {
      nome: parsed.nome || valor,
      categoria_sugerida: parsed.categoria_sugerida || 'Geral',
      preco_venda_estimado: Number(parsed.preco_venda_estimado) || 0,
      preco_custo_estimado: Number(parsed.preco_custo_estimado) || 0,
      descricao: parsed.descricao || '',
      tipo_unidade: parsed.tipo_unidade || 'un',
      codigo_barras: parsed.codigo_barras || (tipo === 'barcode' ? valor : ''),
      peso_kg: pesoKgFinal,
      altura_cm: alturaFinal,
      largura_cm: larguraFinal,
      comprimento_cm: compFinal
    };
  }

  throw new Error('Não foi possível processar a resposta da IA.');
};

export interface ParametrosDescricaoItemIA {
  nome: string;
  tipoItem: 'produto' | 'servico';
  descricaoAtual?: string;
  categoriaNome?: string;
  duracaoMinutos?: number;
  localPrestacao?: 'loja' | 'externo' | 'ambos';
  segmentoLoja?: string;
  loja?: (Partial<Loja> & { id?: string; segmento?: string }) | null;
}

const MAPA_LOCAL_ATENDIMENTO_IA: Record<'loja' | 'externo' | 'ambos', string> = {
  loja: 'Atendimento na loja',
  externo: 'Atendimento em domicílio / externo',
  ambos: 'Atendimento na loja ou em domicílio'
};

/**
 * Gera ou melhora a descrição comercial do produto ou serviço para Catálogo Online e WhatsApp
 * em baixa latência via Edge Function `gemini-proxy` (auto-descoberta dinâmica do Flash mais recente).
 */
export const gerarDescricaoExclusivaIA = async (
  params: ParametrosDescricaoItemIA
): Promise<string> => {
  const tInicioDesc = performance.now();
  const nomeExato = (params.nome || '').trim();
  const descricaoBase = (params.descricaoAtual || '').trim();

  if (!nomeExato && !descricaoBase) {
    throw new Error('Informe o nome ou um rascunho de descrição antes de usar a IA.');
  }

  const ehServico = params.tipoItem === 'servico';
  const ramoEfetivo = (params.segmentoLoja || obterNomeSegmentoLoja(params.loja) || '').trim();
  const sobreLoja = (params.loja?.sobre_loja || '').trim();
  const categoriaLimpa = (params.categoriaNome || '').trim();
  const contextoSistema = montarContextoSegmentoSistema(ramoEfetivo, params.loja);

  const detalhesContexto: string[] = [];
  if (categoriaLimpa && categoriaLimpa.toLowerCase() !== 'geral') {
    detalhesContexto.push(`Categoria: "${categoriaLimpa}"`);
  }
  if (ehServico) {
    if (params.duracaoMinutos && params.duracaoMinutos > 0) {
      detalhesContexto.push(`Duração estimada: ${params.duracaoMinutos} minutos`);
    }
    if (params.localPrestacao) {
      detalhesContexto.push(`Modalidade: ${MAPA_LOCAL_ATENDIMENTO_IA[params.localPrestacao]}`);
    }
  }
  if (ramoEfetivo) {
    detalhesContexto.push(`Segmento da loja: "${ramoEfetivo}"`);
  }
  if (sobreLoja) {
    detalhesContexto.push(`Sobre a loja: "${sobreLoja.slice(0, 180)}"`);
  }

  const blocoContexto = detalhesContexto.length > 0 ? `\nContexto:\n- ${detalhesContexto.join('\n- ')}` : '';
  const blocoBaseLojista = descricaoBase
    ? `\nDescrição atual escrita pelo lojista (OBRIGATÓRIO preservar e expandir todos os detalhes originais):\n"${descricaoBase.slice(0, 800)}"`
    : '';

  const prompt = ehServico
    ? `Crie e aprimore uma descrição comercial em português do Brasil (pt-BR) para Catálogo Online e WhatsApp de um SERVIÇO chamado "${nomeExato || 'Serviço'}"${blocoContexto}${blocoBaseLojista}

Regras obrigatórias:
- Este item é um SERVIÇO (não é uma mercadoria física). É PROIBIDO usar termos de produto físico como "item original", "produto selecionado", "especificações de fábrica", "embalagem" ou "estoque".
- Se houver uma descrição atual do lojista, preserve integralmente o escopo, etapas e informações citadas por ele, enriquecendo a clareza e o poder de convencimento.
- Redija em escrita natural (Sentence Case, com maiúsculas apenas no início de frases e nomes próprios — NUNCA devolva o texto todo em CAIXA ALTA).
- Estruture com uma breve abertura natural (quando enriquecer o escopo) seguida de 3 a 5 bullet points objetivos com emojis discretos destacando o que está incluso no serviço, segurança/cuidado, agilidade e modalidade de atendimento.
- Finalize com 1 frase curta convidando o cliente para agendar ou chamar no WhatsApp.
- Retorne APENAS o texto final pronto, sem preâmbulos como "Aqui está a descrição:" e sem aspas ao redor.`
    : `Crie e aprimore uma descrição comercial em português do Brasil (pt-BR) para Catálogo Online e WhatsApp de um PRODUTO chamado "${nomeExato || 'Produto'}"${blocoContexto}${blocoBaseLojista}

Regras obrigatórias:
- Se houver uma descrição atual do lojista, preserve e aprimore todas as informações e diferenciais citados por ele.
- Interprete o produto estritamente dentro do segmento comercial informado${ramoEfetivo ? ` ("${ramoEfetivo}")` : ''}.
- Redija em escrita natural (Sentence Case, com maiúsculas apenas no início de frases e nomes próprios — NUNCA devolva o texto todo em CAIXA ALTA).
- Use 3 a 5 bullet points objetivos com emojis discretos destacando características reais e benefícios práticos do produto${nomeExato ? ` "${nomeExato}"` : ''} (sem inventar versões Plus/Pro/Combo ou especificações fictícias).
- Finalize com 1 frase curta de chamada para compra.
- Retorne APENAS o texto final pronto, sem preâmbulos como "Aqui está a descrição:" e sem aspas ao redor.`;

  const requestBody: Record<string, unknown> = {
    ...(contextoSistema ? { systemInstruction: { parts: [{ text: contextoSistema }] } } : {}),
    contents: [{ parts: [{ text: prompt }] }],
    safetySettings: SAFETY_SETTINGS_VAREJO,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 500,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  try {
    const resData = await invocarGeminiPreencherViaEdgeProxy(requestBody, params.loja?.id);
    const textoBruto = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textoBruto && textoBruto.trim()) {
      let textoFinal = textoBruto.trim();
      if (
        (textoFinal.startsWith('"') && textoFinal.endsWith('"')) ||
        (textoFinal.startsWith("'") && textoFinal.endsWith("'"))
      ) {
        textoFinal = textoFinal.slice(1, -1).trim();
      }
      if (textoFinal) {
        console.log(
          `%c[HUBI PERF ⏱️]%c [DESCRICAO_IA] Concluído em ${Math.round(performance.now() - tInicioDesc)}ms para "${nomeExato || 'rascunho'}" (${params.tipoItem})`,
          'color: #0ea5e9; font-weight: bold;',
          'color: #38bdf8;'
        );
        return textoFinal;
      }
    }
  } catch (err) {
    console.warn('[GeminiService] Erro ao gerar descrição comercial via gemini-proxy:', err);
  }

  throw new Error('Não foi possível melhorar a descrição com IA no momento. Seu texto atual foi mantido.');
};

export interface FotoResultadoInternet {
  url: string;
  titulo: string;
  fonte: string;
  thumbnail?: string;
  urlOriginal?: string;
  largura?: number;
  altura?: number;
}

export interface ResultadoIdentificacaoVisualBusca {
  termoCompleto: string;
  termoSimplificado: string;
  termosAlternativos: string[];
}

function derivarTermoSimplificadoBusca(termoCompleto: string): string {
  const palavras = termoCompleto
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 1 && !/^(de|da|do|das|dos|para|com|em|e|ou)$/i.test(p));
  if (palavras.length <= 2) return termoCompleto.trim();
  return `${palavras[0]} ${palavras[1]}`.trim();
}

/**
 * Identifica Marca + Nome Comercial + Peso/Volume/Modelo a partir de uma imagem (blob:, data: ou https:)
 * exclusivamente via Edge Function `gemini-proxy`.
 */
export const identificarTermoBuscaPorFotoIA = async (
  fotoUrlOuBase64: string,
  segmentoLoja?: string,
  loja?: (Partial<Loja> & { id?: string; segmento?: string }) | null,
  nomeAtual?: string,
  payloadPronto?: PayloadBase64IA | null
): Promise<ResultadoIdentificacaoVisualBusca | null> => {
  try {
    const tEtapa1 = performance.now();
    let cleanBase64 = payloadPronto?.base64Limpo || '';
    let detectedMime = payloadPronto?.mimeType || 'image/jpeg';

    if (!cleanBase64) {
      if (fotoUrlOuBase64.startsWith('blob:')) {
        throw new Error(
          'Não foi possível ler a foto temporária; digite o nome do produto acima para buscar.'
        );
      }
      const comprimida = await comprimirImagemParaIA(fotoUrlOuBase64);
      cleanBase64 = comprimida.base64;
      detectedMime = comprimida.mimeType || 'image/jpeg';
    }
    console.log(`[IA-Produto] Etapa 1: Base64 pronto em ${Math.round(performance.now() - tEtapa1)}ms`);

    const ramoEfetivo = (segmentoLoja || obterNomeSegmentoLoja(loja) || '').trim();
    const contextoSistema = montarContextoSegmentoSistema(ramoEfetivo, loja);

    const promptInstrucao = `Você é um especialista em identificação visual de produtos no varejo brasileiro.
${ramoEfetivo ? `Segmento da loja: "${ramoEfetivo}".` : ''}
${nomeAtual ? `Nome parcial informado: "${nomeAtual}".` : ''}
Analise a foto enviada e identifique o produto na embalagem ou objeto (Marca + Nome Comercial + Peso/Volume/Modelo).
Retorne EXCLUSIVAMENTE um objeto JSON válido neste formato:
{
  "termo_completo": "Marca + Nome Comercial + Peso/Volume/Modelo (ex: Fermento em Pó Químico Royal 100g)",
  "termo_simplificado": "Marca + Produto Principal apenas em 2 ou 3 palavras (ex: Fermento Royal)",
  "termos_alternativos": ["variação curta 1", "variação curta 2"]
}`;

    const requestBody: Record<string, unknown> = {
      ...(contextoSistema ? { systemInstruction: { parts: [{ text: contextoSistema }] } } : {}),
      contents: [
        {
          parts: [
            { text: promptInstrucao },
            {
              inline_data: {
                mime_type: detectedMime || 'image/jpeg',
                data: cleanBase64
              }
            }
          ]
        }
      ],
      safetySettings: SAFETY_SETTINGS_VAREJO,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json'
      }
    };

    const tEtapa2 = performance.now();
    const resData = await invocarGeminiPreencherViaEdgeProxy(requestBody, loja?.id);
    console.log(`[IA-Produto] Etapa 2: Gemini 3.8 Flash em ${Math.round(performance.now() - tEtapa2)}ms`);
    const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const parsed = extrairJsonDoTexto(rawText) as {
      termo_completo?: unknown;
      termo_simplificado?: unknown;
      termos_alternativos?: unknown;
    } | null;

    if (!parsed) return null;

    const termoCompleto = String(parsed.termo_completo || '').trim();
    const termoSimplificadoBruto = String(parsed.termo_simplificado || '').trim();
    const termosAlternativos = Array.isArray(parsed.termos_alternativos)
      ? parsed.termos_alternativos.map((t) => String(t).trim()).filter(Boolean)
      : [];

    const termoPrincipal = termoCompleto || termosAlternativos[0] || '';
    if (!termoPrincipal) return null;

    const termoSimplificado =
      termoSimplificadoBruto || derivarTermoSimplificadoBusca(termoPrincipal);

    return {
      termoCompleto: termoPrincipal,
      termoSimplificado,
      termosAlternativos
    };
  } catch (err) {
    console.warn('Aviso ao identificar termo de busca visual pela foto:', err);
    if (err instanceof Error) {
      const msgLower = err.message.toLowerCase();
      if (
        msgLower.includes('chave') ||
        msgLower.includes('cota') ||
        msgLower.includes('permiss') ||
        msgLower.includes('configurada') ||
        msgLower.includes('inválida') ||
        msgLower.includes('recusou') ||
        msgLower.includes('demorou') ||
        msgLower.includes('temporária')
      ) {
        throw err;
      }
    }
    return null;
  }
};

/**
 * Analisa a foto do produto com IA multimodal e extrai os melhores termos de busca comercial para encontrar fotos idênticas
 */
export const extrairTermosBuscaVisualPorFoto = async (
  fotoUrlOuBase64: string,
  nomeAtual?: string,
  segmentoLoja?: string,
  loja?: (Partial<Loja> & { id?: string; segmento?: string }) | null
): Promise<string[]> => {
  const ident = await identificarTermoBuscaPorFotoIA(fotoUrlOuBase64, segmentoLoja, loja, nomeAtual);
  if (!ident) return [];

  const lista = [ident.termoCompleto, ident.termoSimplificado, ...ident.termosAlternativos]
    .map((t) => t.trim())
    .filter(Boolean);

  return Array.from(new Set(lista));
};

/**
 * Pesquisa fotos reais do produto na internet combinando Foto de Referência (IA de Visão) + Nome Comercial + Segmento da Loja
 * e buscando fotos ativas em lojas e e-commerces brasileiros.
 */
export const pesquisarFotosProdutoNaInternet = async (
  termo: string,
  codigoBarras?: string,
  fotoReferencia?: string,
  segmentoLoja?: string,
  loja?: any
): Promise<FotoResultadoInternet[]> => {
  const fotos: FotoResultadoInternet[] = [];
  const urlsVistas = new Set<string>();

  const registrarFoto = (
    url: string,
    titulo: string,
    fonte: string,
    thumbnail?: string,
    urlOriginal?: string,
    largura?: number,
    altura?: number
  ) => {
    if (!url || typeof url !== 'string') return;
    const limpa = url.trim();
    if (!limpa.startsWith('http://') && !limpa.startsWith('https://')) return;
    if (urlsVistas.has(limpa)) return;
    const lower = limpa.toLowerCase();
    if (lower.endsWith('.svg') || lower.endsWith('.tif') || lower.endsWith('.tiff') || lower.endsWith('.ogg') || lower.endsWith('.pdf')) {
      return;
    }
    urlsVistas.add(limpa);
    fotos.push({
      url: limpa,
      titulo: titulo.trim() || termo,
      fonte,
      thumbnail: thumbnail || limpa,
      urlOriginal: urlOriginal || limpa,
      largura,
      altura
    });
  };

  // Limpa o termo removendo códigos de SKU, dimensões entre parênteses, variações de tamanho e hifens excludentes
  const ramoEfetivo = segmentoLoja || obterNomeSegmentoLoja(loja) || '';
  const ramoCurto = extrairRamoCurtoLoja(ramoEfetivo);
  const termoLimpo = limparTermoParaBuscaGoogle(termo) || termo.trim();
  const palavrasTermo = termoLimpo ? termoLimpo.split(' ').filter(Boolean) : [];

  // Quando o usuário informa o nome do produto, usamos o nome limpo enriquecido com o ramo da loja
  // diretamente para a busca no Google Images, sem chamar IA de visão nem LLMs intermediários.
  const termosParaPesquisar: string[] = [];

  if (termoLimpo) {
    const termoCanonicoJev = await catalogJevService.extrairTermoCanonicoBusca(
      termoLimpo,
      ramoEfetivo,
      'FOTOS'
    );
    const termoEnxuto = extrairTermoEnxutoBusca(termoLimpo, 4);
    const termoPrincipalEnriquecido = montarQueryEnriquecidaComRamo(
      termoCanonicoJev || termoLimpo,
      ramoEfetivo
    );

    if (termoPrincipalEnriquecido) {
      termosParaPesquisar.push(termoPrincipalEnriquecido);
    }
    if (palavrasTermo.length > 4 && termoEnxuto) {
      const enxutoEnriquecido = montarQueryEnriquecidaComRamo(termoEnxuto, ramoEfetivo);
      if (enxutoEnriquecido && !termosParaPesquisar.includes(enxutoEnriquecido)) {
        termosParaPesquisar.push(enxutoEnriquecido);
      }
    }
    const limpoEnriquecido = montarQueryEnriquecidaComRamo(termoLimpo, ramoEfetivo);
    if (limpoEnriquecido && !termosParaPesquisar.includes(limpoEnriquecido)) {
      termosParaPesquisar.push(limpoEnriquecido);
    }
  } else if (fotoReferencia) {
    // Apenas se NÃO houver nome digitado e houver uma foto, aciona a IA Multimodal (Gemini Vision)
    try {
      const termosVisuais = await extrairTermosBuscaVisualPorFoto(fotoReferencia, '', ramoEfetivo, loja);
      for (const tv of termosVisuais) {
        const tvEnriquecido = montarQueryEnriquecidaComRamo(tv, ramoEfetivo);
        if (tvEnriquecido && !termosParaPesquisar.includes(tvEnriquecido)) {
          termosParaPesquisar.push(tvEnriquecido);
        }
      }
    } catch (e) {
      console.warn('Não foi possível extrair termos visuais da foto:', e);
    }
  }

  // PASSO 2 (A): Serper.dev (Google Images Engine) exclusivamente via lojas.serper_api_key
  let serpApiKey = obterSerpApiKey(loja);
  if (!serpApiKey && loja?.id) {
    serpApiKey = await obterOuBuscarSerpApiKey(loja);
  }

  if (!serpApiKey) {
    throw new SerpApiAuthError(
      'Cadastre sua chave gratuita do Serper.dev (2.500 consultas grátis) nas Configurações da Loja para buscar fotos de produtos.'
    );
  }

  // O termo prioritário para Serper.dev combina termo limpo + ramo de atividade da loja
  const termoPrincipal = termosParaPesquisar[0] || montarQueryEnriquecidaComRamo(termoLimpo, ramoEfetivo) || termoLimpo;

  console.log(
    '%c[HUBI IMAGENS]%c Buscando fotos no Google Images via Serper.dev...',
    'background: #0284c7; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
    'color: #0284c7; font-weight: bold;',
    { 
      temChave: Boolean(serpApiKey),
      lojaId: loja?.id,
      lojaNome: loja?.nome_fantasia,
      ramoAtividade: ramoCurto || ramoEfetivo || 'N/A',
      termoPrincipal
    }
  );

  if (serpApiKey) {
    try {
      const resultadosSerpApi = await buscarFotosGoogleImagesSerpApi(
        termoPrincipal,
        serpApiKey,
        { lojaId: loja?.id, numResultados: 20, ramoAtividade: ramoEfetivo }
      );
      console.log(
        `%c[HUBI IMAGENS]%c SerpApi retornou ${resultadosSerpApi.length} fotos para "${termoPrincipal}"`,
        'background: #16a34a; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
        'color: #16a34a; font-weight: bold;'
      );

      // Validação semântica e filtro de versão/modelo com HUBI JEV (garantia mínima de 6-10 fotos)
      let fotosParaRegistrar = resultadosSerpApi;
      try {
        fotosParaRegistrar = await catalogJevService.filtrarFotosCompativeisComJev(
          termoLimpo || termo.trim(),
          ramoEfetivo,
          resultadosSerpApi
        );
      } catch (errJev) {
        console.warn('[HUBI JEV] Degradação graciosa ao filtrar fotos:', errJev);
      }

      for (const item of fotosParaRegistrar) {
        registrarFoto(
          item.urlOriginal,
          item.titulo,
          item.fonte || 'Google Imagens',
          item.urlThumbnail,
          item.urlOriginal,
          item.largura,
          item.altura
        );
      }

      // Se ainda restarem menos de 6 fotos válidas e houver um termo alternativo diferente, busca complemento focado em fundo branco/produto
      if (fotos.length < 6 && termoLimpo) {
        const termoAlternativo = montarQueryEnriquecidaComRamo(`${termoLimpo} produto fundo branco`, ramoEfetivo);
        const resultadosComplementares = await buscarFotosGoogleImagesSerpApi(
          termoAlternativo,
          serpApiKey,
          { lojaId: loja?.id, numResultados: 15, ramoAtividade: ramoEfetivo }
        ).catch(() => []);
        if (resultadosComplementares.length > 0) {
          const filtradosComp = await catalogJevService
            .filtrarFotosCompativeisComJev(
              termoLimpo || termo.trim(),
              ramoEfetivo,
              resultadosComplementares
            )
            .catch(() => resultadosComplementares);
          for (const item of filtradosComp) {
            if (fotos.length >= 10) break;
            registrarFoto(
              item.urlOriginal,
              item.titulo,
              item.fonte || 'Google Imagens',
              item.urlThumbnail,
              item.urlOriginal,
              item.largura,
              item.altura
            );
          }
        }
      }
    } catch (err) {
      if (err instanceof SerpApiQuotaError || err instanceof SerpApiAuthError) {
        throw err;
      }
      console.warn('[HUBI IMAGENS] Aviso: Erro na busca via SerpApi:', err);
    }
  } else {
    console.log('[HUBI IMAGENS] Nenhuma chave SerpApi configurada para a loja. Buscando em fontes alternativas...');
  }

  // Se a SerpApi já retornou fotos, retorna IMEDIATAMENTE sem esperar por fontes secundárias lentas
  if (fotos.length > 0) {
    return fotos.slice(0, 20);
  }

  // PASSO 2 (B): Busca Web via Proxy Local (apenas em ambiente de desenvolvimento Vite)
  if (import.meta.env.DEV && fotos.length === 0) {
    for (const qTermo of termosParaPesquisar.slice(0, 2)) {
      if (fotos.length >= 10) break;
      try {
        const ctrl = new AbortController();
        const tId = setTimeout(() => ctrl.abort(), 2500);
        const resWeb = await fetch(`/api/buscar-fotos-web?q=${encodeURIComponent(qTermo)}`, { signal: ctrl.signal });
        clearTimeout(tId);
        const cType = resWeb.headers.get('content-type') || '';
        if (resWeb.ok && cType.includes('application/json')) {
          const dataWeb = await resWeb.json();
          const resultados = Array.isArray(dataWeb.results) ? dataWeb.results : [];
          for (const item of resultados) {
            const rawImg = item.image || item.thumbnail;
            if (rawImg) {
              const cleanRaw = rawImg.replace(/^https?:\/\//, '');
              const urlSegura = `https://images.weserv.nl/?url=${encodeURIComponent(cleanRaw)}&w=600&output=jpg`;
              registrarFoto(urlSegura, item.title || qTermo, 'Lojas / Web');
            }
          }
        }
      } catch {}
    }
  }

  // PASSO 2 (C): Consulta Open Food / Beauty / Products Facts (apenas se houver código de barras ou se a loja não tiver SerpApi)
  const deveConsultarOpenFacts = fotos.length === 0 && (Boolean(codigoBarras?.trim()) || (!serpApiKey && !loja?.id));
  if (deveConsultarOpenFacts) {
    try {
      const termoOFF = codigoBarras?.trim() || termoLimpo;
      const apis = [
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(termoOFF)}&search_simple=1&action=process&json=1&page_size=6`,
        `https://world.openbeautyfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(termoOFF)}&search_simple=1&action=process&json=1&page_size=6`,
        `https://world.openproductsfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(termoOFF)}&search_simple=1&action=process&json=1&page_size=6`
      ];

      await Promise.allSettled(
        apis.map(async (urlAPI) => {
          try {
            const ctrl = new AbortController();
            const tId = setTimeout(() => ctrl.abort(), 2000);
            const res = await fetch(urlAPI, { signal: ctrl.signal });
            clearTimeout(tId);
            if (res.ok) {
              const data = await res.json();
              const produtos = data?.products || [];
              for (const p of produtos) {
                const img = p.image_front_url || p.image_url || p.image_front_small_url || p.image_small_url;
                if (img) {
                  const cleanImg = img.replace(/^https?:\/\//, '');
                  const imgSegura = `https://images.weserv.nl/?url=${encodeURIComponent(cleanImg)}&w=600&output=jpg`;
                  registrarFoto(imgSegura, p.product_name || p.generic_name || termoLimpo, 'Catálogo Oficial');
                }
              }
            }
          } catch {}
        })
      );
    } catch (err) {
      console.warn('Aviso: Erro ao consultar Open Facts:', err);
    }
  }

  return fotos.slice(0, 20);
};

const cachePreencherIAMemoria = new Map<string, EntradaCacheSessao<ProdutoSugeridoIA>>();
const cacheGeminiTextoPreencherMemoria = new Map<string, EntradaCacheSessao<RespostaGeminiPreencherIA>>();

interface RespostaGeminiPreencherIA {
  nome_padronizado?: string;
  nome?: string;
  descricao_curta?: string;
  descricao_comercial?: string;
  descricao?: string;
  categoria_sugerida?: string;
  subcategoria_sugerida?: string;
  tipo_unidade?: string;
  peso_kg?: number;
  altura_cm?: number;
  largura_cm?: number;
  comprimento_cm?: number;
}

interface GeminiProxyResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: string | { message?: string };
}

/**
 * Invoca o Gemini estritamente via Edge Function `gemini-proxy` (Zero-Trust BYOK, sem chaves no front-end).
 * A Edge Function resolve e faz cache dinâmico do modelo `gemini-*-flash` mais recente via ListModels.
 */
async function invocarGeminiPreencherViaEdgeProxy(
  requestBody: Record<string, unknown>,
  lojaId?: string
): Promise<GeminiProxyResponse> {
  return await invocarGeminiProxyDireto<GeminiProxyResponse>({
    model: 'gemini-3.8-flash',
    action: 'generateContent',
    requestBody,
    loja_id: lojaId,
    lojaId
  });
}

/**
 * Atualiza/preenche um produto a partir do NOME COMERCIAL através do SerpApi Shopping + Jev (System One) + Gemini Flash (via Edge Function).
 * NUNCA envia imagens, NUNCA dispara busca redundante de fotos quando o formulário já possui imagens e NUNCA sobrescreve o nome informado pelo usuário.
 */
export const atualizarProdutoExistenteComIA = async (dados: {
  nome: string;
  descricao?: string;
  fotoUrl?: string;
  fotos?: string[];
  possuiImagens?: boolean;
  categoriaNome?: string;
  codigoBarras?: string;
  precoVendaAtual?: number;
  segmentoLoja?: string;
  loja?: (Partial<Loja> & { id?: string; segmento?: string }) | null;
  onEstagio1Pronto?: (dadosParciais: ProdutoSugeridoIA) => void;
}): Promise<ProdutoSugeridoIA> => {
  const tInicioPerf = performance.now();
  const nomeInformadoPeloUsuario = (dados.nome && dados.nome.trim() && dados.nome.trim() !== 'Produto')
    ? dados.nome.trim()
    : '';
  const termoReferencia = nomeInformadoPeloUsuario || (dados.descricao?.trim() || 'Produto');
  const ramoEfetivo = (dados.segmentoLoja || obterNomeSegmentoLoja(dados.loja) || '').trim();
  const sobreLoja = (dados.loja?.sobre_loja || '').trim();
  const contextoSistema = montarContextoSegmentoSistema(ramoEfetivo, dados.loja);
  const jaPossuiImagens = Boolean(
    dados.possuiImagens ||
    (dados.fotoUrl && dados.fotoUrl.trim().length > 0) ||
    (dados.fotos && dados.fotos.length > 0)
  );

  // Cache híbrido resiliente (Memória + sessionStorage, TTL 15 min) escopado por lojaId, ramo e termo normalizado
  const chaveCache = criarChaveCacheEscopada(
    'hubi_preencher_ia_sessao_v23',
    `${termoReferencia}::${ramoEfetivo}`,
    dados.loja?.id
  );
  const emCacheSessao = lerCacheHibridoSessao(cachePreencherIAMemoria, chaveCache);
  if (emCacheSessao) {
    console.log(
      `%c[HUBI CACHE ⚡]%c Resposta instantânea via cache (0ms) para "${termoReferencia}"`,
      'color: #10b981; font-weight: bold;',
      'color: #34d399;'
    );
    return {
      ...emCacheSessao,
      nome: nomeInformadoPeloUsuario || emCacheSessao.nome
    };
  }

  // 1. Disparo 100% paralelo (Promise.all):
  //    a) Pipeline Unificado Serper + JEV (passada única em PREENCHER_IA)
  //    b) Unidade de venda JEV
  //    c) Chamada enxuta via Edge Function gemini-proxy (thinkingBudget: 0, maxOutputTokens: 450)
  //    Obs.: Desacoplado de busca de fotos (especialmente quando jaPossuiImagens === true).
  const unidadeJevPromise = catalogJevService.classificarUnidadeVenda({ nome: termoReferencia, descricao: dados.descricao }).catch(() => 'un');
  const contextoUnificadoPromise = catalogJevService.obterContextoUnificadoProdutoJev({
    nomeProduto: termoReferencia,
    categoriaNome: dados.categoriaNome,
    segmentoLoja: ramoEfetivo || undefined,
    loja: dados.loja ?? undefined,
    etapa: 'PREENCHER_IA',
    permitirComplementoGemini: false
  });

  const geminiPromise = (async (): Promise<RespostaGeminiPreencherIA | null> => {
    if (termoReferencia.length < 2) return null;
    const chaveCacheGemini = criarChaveCacheEscopada(
      'hubi_gemini_texto_v23',
      `${termoReferencia}::${ramoEfetivo}`,
      dados.loja?.id
    );
    const geminiEmCache = lerCacheHibridoSessao(cacheGeminiTextoPreencherMemoria, chaveCacheGemini);
    if (geminiEmCache) {
      console.log(
        `%c[HUBI CACHE ⚡]%c Resposta instantânea via cache (0ms) para "${termoReferencia}"`,
        'color: #10b981; font-weight: bold;',
        'color: #34d399;'
      );
      return geminiEmCache;
    }

    const tGemini = performance.now();
    const termoLimpoContexto = limparTermoParaBuscaGoogle(termoReferencia) || termoReferencia;
    const promptTexto = `Retorne EXCLUSIVAMENTE um JSON válido em pt-BR para o produto abaixo${ramoEfetivo ? ` (ramo de atividade da loja: "${ramoEfetivo}")` : ''}:
PRODUTO: "${termoReferencia}"
${termoLimpoContexto !== termoReferencia ? `NOME COMERCIAL LIMPO (referência): "${termoLimpoContexto}"` : ''}
${ramoEfetivo ? `RAMO DE ATIVIDADE DA LOJA: "${ramoEfetivo}"` : ''}
${sobreLoja ? `SOBRE A LOJA: "${sobreLoja.slice(0, 220)}"` : ''}
${dados.categoriaNome ? `CATEGORIA ATUAL: "${dados.categoriaNome}"` : ''}
${dados.codigoBarras ? `EAN: "${dados.codigoBarras}"` : ''}

Campos obrigatórios do JSON:
- "nome_padronizado": string limpa e comercial do modelo exato "${termoReferencia}" (sem inventar versões como Plus/Pro/Combo).
- "descricao_curta": texto comercial objetivo e assertivo estritamente dentro do segmento da loja${ramoEfetivo ? ` ("${ramoEfetivo}")` : ''}, em 3 a 4 bullet points curtos destacando características reais e benefícios (máximo absoluto de 400 caracteres).
- "categoria_sugerida": categoria comercial em pt-BR compatível com o ramo da loja.
- "tipo_unidade": "un" | "kg" | "cx" | "pct" | "par" | "m".
- "peso_kg", "altura_cm", "largura_cm", "comprimento_cm": números reais estimados da embalagem.`;

    try {
      const requestBody: Record<string, unknown> = {
        ...(contextoSistema ? { systemInstruction: { parts: [{ text: contextoSistema }] } } : {}),
        contents: [{ parts: [{ text: promptTexto }] }],
        safetySettings: SAFETY_SETTINGS_VAREJO,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 450,
          thinkingConfig: {
            thinkingBudget: 0
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              nome_padronizado: { type: 'STRING' },
              descricao_curta: { type: 'STRING' },
              categoria_sugerida: { type: 'STRING' },
              tipo_unidade: { type: 'STRING' },
              peso_kg: { type: 'NUMBER' },
              altura_cm: { type: 'NUMBER' },
              largura_cm: { type: 'NUMBER' },
              comprimento_cm: { type: 'NUMBER' }
            },
            required: ['nome_padronizado', 'descricao_curta']
          }
        }
      };

      const resData = await invocarGeminiPreencherViaEdgeProxy(requestBody, dados.loja?.id);
      const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log(
        `%c[HUBI PERF ⏱️]%c [PREENCHER_IA] Gemini Proxy concluído em ${Math.round(performance.now() - tGemini)}ms (imagens desacopladas: ${jaPossuiImagens})`,
        'color: #0ea5e9; font-weight: bold;',
        'color: #38bdf8;'
      );
      const parsedResposta = rawText ? (extrairJsonDoTexto(rawText) as RespostaGeminiPreencherIA | null) : null;
      if (parsedResposta) {
        salvarCacheHibridoSessao(cacheGeminiTextoPreencherMemoria, chaveCacheGemini, parsedResposta);
      }
      return parsedResposta;
    } catch (err) {
      console.warn('[GeminiService] Enriquecimento textual IA rápido não respondeu a tempo, usando dados inteligentes locais:', err);
      return null;
    }
  })();

  const estagio1Promise = Promise.all([contextoUnificadoPromise, unidadeJevPromise]).then(
    ([ctxJev, unidJev]) => {
      if (dados.onEstagio1Pronto) {
        const ofertas = ctxJev.ofertasAprovadas || [];
        const precos = ofertas.map(o => o.preco).filter(p => p > 0);
        const mediaSerp =
          precos.length > 0 ? Math.floor(precos.reduce((a, b) => a + b, 0) / precos.length) : 0;
        const precoEst = mediaSerp || Number(dados.precoVendaAtual) || 0;
        const precoSemCent = precoEst > 0 ? Math.floor(precoEst) : 0;
        const margemEstagio1 = blindarMargemCustoVarejo(precoSemCent, ctxJev.precoCustoSugerido);

        dados.onEstagio1Pronto({
          nome: nomeInformadoPeloUsuario || ctxJev.termoCanonico || termoReferencia,
          categoria_sugerida: dados.categoriaNome || '',
          preco_venda_estimado: precoSemCent,
          preco_custo_estimado: margemEstagio1.preco_custo > 0 ? Math.floor(margemEstagio1.preco_custo) : 0,
          descricao: '',
          tipo_unidade: unidJev || 'un',
          codigo_barras: dados.codigoBarras || ''
        });
      }
      return [ctxJev, unidJev] as const;
    }
  );

  const [[contextoJev, unidadeJev], parsedIA] = await Promise.all([
    estagio1Promise,
    geminiPromise
  ]);

  const ofertasAprovadas = contextoJev.ofertasAprovadas;
  let precoMedioSerp = 0;

  if (ofertasAprovadas && ofertasAprovadas.length > 0) {
    const precosValidos = ofertasAprovadas.map(o => o.preco).filter(p => p > 0);
    if (precosValidos.length > 0) {
      const soma = precosValidos.reduce((a, b) => a + b, 0);
      precoMedioSerp = Math.floor(soma / precosValidos.length);
    }

    // Salva ofertas aprovadas diretamente no cache compartilhado do Radar de Preços (0ms ao abrir o Radar)
    try {
      const ordenadas = [...ofertasAprovadas].sort((a, b) => a.preco - b.preco);
      const concorrentesRadar = ordenadas.map(it => ({
        loja: it.loja,
        preco: Number(it.preco.toFixed(2)),
        tipo: it.tipo || 'E-commerce Especializado',
        url: it.url
      }));
      const qtdMenores = concorrentesRadar.length === 1 ? 1 : Math.min(5, Math.ceil(concorrentesRadar.length / 2));
      const menoresPrecos = concorrentesRadar.slice(0, qtdMenores);
      const maioresPrecos = concorrentesRadar.length >= 2
        ? [...concorrentesRadar.slice(qtdMenores)].reverse().slice(0, 5)
        : [];
      const mediaRadar = Number((concorrentesRadar.reduce((acc, c) => acc + c.preco, 0) / concorrentesRadar.length).toFixed(2));
      const termoRadar = (contextoJev.termoCanonico || termoReferencia).toLowerCase().trim();
      const chaveRadar = `hubi_radar_precos_cache_v21_${termoRadar}`;
      const payloadRadar = JSON.stringify({
        timestamp: Date.now(),
        dados: {
          precoMedio: mediaRadar,
          menorPreco: concorrentesRadar[0].preco,
          maiorPreco: concorrentesRadar[concorrentesRadar.length - 1].preco,
          totalPesquisados: concorrentesRadar.length,
          concorrentes: concorrentesRadar,
          menoresPrecos,
          maioresPrecos,
          dataConsulta: new Date().toLocaleDateString('pt-BR')
        }
      });
      localStorage.setItem(chaveRadar, payloadRadar);
      sessionStorage.setItem(chaveRadar, payloadRadar);
    } catch {}
  }
  const dimsFallback = (!parsedIA?.peso_kg || !parsedIA?.altura_cm)
    ? await catalogJevService.estimarDimensoesComJev(termoReferencia, dados.categoriaNome, dados.descricao).catch(() => extrairDimensoesEPesoTexto(`${termoReferencia} ${dados.descricao || ''}`))
    : { peso_kg: 0.35, altura_cm: 10, largura_cm: 15, comprimento_cm: 20 };

  // Nunca chutar preços inventados pelo Gemini quando Serper = 0 lojas (mantém apenas preço real da Serper ou atual da loja)
  const precoEstimado =
    precoMedioSerp ||
    Number(dados.precoVendaAtual) ||
    0;
  const precoSemCentavos = precoEstimado > 0 ? Math.floor(precoEstimado) : 0;

  console.log(
    `%c[HUBI PERF ⏱️]%c [PREENCHER_IA] Concluído em ${Math.round(performance.now() - tInicioPerf)}ms (Serper: ${ofertasAprovadas.length} lojas | Preço sugerido: R$ ${precoSemCentavos})`,
    'color: #0ea5e9; font-weight: bold;',
    'color: #38bdf8;'
  );

  const textoDescricaoIA = (
    parsedIA?.descricao_curta ||
    parsedIA?.descricao_comercial ||
    parsedIA?.descricao ||
    ''
  )
    .trim()
    .slice(0, 400);
  const descricaoFinal = textoDescricaoIA.length > 15
    ? textoDescricaoIA
    : (dados.descricao?.trim() || `${termoReferencia} — equipamento/produto selecionado com alto padrão de qualidade, desempenho confiável e excelente custo-benefício.`);

  const margemBlindada = blindarMargemCustoVarejo(
    precoSemCentavos,
    contextoJev.precoCustoSugerido
  );

  const resultadoFinal: ProdutoSugeridoIA = {
    // NUNCA sobrescreve o nome se o usuário já o informou
    nome: nomeInformadoPeloUsuario || parsedIA?.nome_padronizado?.trim() || parsedIA?.nome?.trim() || termoReferencia,
    categoria_sugerida: parsedIA?.categoria_sugerida || dados.categoriaNome || 'Geral',
    subcategoria_sugerida: parsedIA?.subcategoria_sugerida || undefined,
    preco_venda_estimado: precoSemCentavos,
    preco_custo_estimado: margemBlindada.preco_custo > 0 ? Math.floor(margemBlindada.preco_custo) : 0,
    descricao: descricaoFinal,
    tipo_unidade: parsedIA?.tipo_unidade || unidadeJev || 'un',
    codigo_barras: dados.codigoBarras || '',
    peso_kg: Number(parsedIA?.peso_kg) > 0 ? Number(Number(parsedIA?.peso_kg).toFixed(3)) : (dimsFallback.peso_kg || 0.35),
    altura_cm: Number(parsedIA?.altura_cm) > 0 ? Math.max(4, Math.round(Number(parsedIA?.altura_cm))) : (dimsFallback.altura_cm || 10),
    largura_cm: Number(parsedIA?.largura_cm) > 0 ? Math.max(10, Math.round(Number(parsedIA?.largura_cm))) : (dimsFallback.largura_cm || 15),
    comprimento_cm: Number(parsedIA?.comprimento_cm) > 0 ? Math.max(15, Math.round(Number(parsedIA?.comprimento_cm))) : (dimsFallback.comprimento_cm || 20)
  };

  if (precoSemCentavos > 0 || textoDescricaoIA.length > 15) {
    salvarCacheHibridoSessao(cachePreencherIAMemoria, chaveCache, resultadoFinal);
    if (contextoJev.termoCanonico) {
      const chaveCanonico = criarChaveCacheEscopada(
        'hubi_preencher_ia_sessao_v23',
        `${contextoJev.termoCanonico}::${ramoEfetivo}`,
        dados.loja?.id
      );
      if (chaveCanonico !== chaveCache) {
        salvarCacheHibridoSessao(cachePreencherIAMemoria, chaveCanonico, resultadoFinal);
      }
    }
  }

  return resultadoFinal;
};

const cacheDimensoesSessaoMemoria = new Map<string, EntradaCacheSessao<DimensoesEPesoExtraidos>>();

/**
 * Estima com IA (Google Gemini via Edge Function gemini-proxy) ou regras especializadas de varejo
 * as dimensões e peso bruto de um produto para despacho por transportadoras (Melhor Envio / Correios / Jadlog).
 */
export const estimarDimensoesEPesoProduto = async (
  nomeProduto: string,
  descricao?: string,
  categoriaNome?: string,
  loja?: (Partial<Loja> & { id?: string; segmento?: string }) | null
): Promise<DimensoesEPesoExtraidos> => {
  const tInicioDim = performance.now();
  const textoCompleto = `${nomeProduto || ''} ${descricao || ''}`.trim();
  const extraidos = extrairDimensoesEPesoTexto(textoCompleto);

  // Se já tiver todas as 4 propriedades detectadas por regex explícito no texto, retorna imediatamente
  if (
    extraidos.peso_kg && extraidos.peso_kg > 0 &&
    extraidos.altura_cm && extraidos.altura_cm > 0 &&
    extraidos.largura_cm && extraidos.largura_cm > 0 &&
    extraidos.comprimento_cm && extraidos.comprimento_cm > 0
  ) {
    return extraidos;
  }

  const nomeExato = (nomeProduto || '').trim();
  const chaveCacheDim = nomeExato
    ? criarChaveCacheEscopada('hubi_dimensoes_sessao_v22', nomeExato, loja?.id)
    : '';

  if (chaveCacheDim) {
    const dimEmCache = lerCacheHibridoSessao(cacheDimensoesSessaoMemoria, chaveCacheDim);
    if (dimEmCache) {
      console.log(
        `%c[HUBI CACHE ⚡]%c Resposta instantânea via cache (0ms) para dimensões de "${nomeExato}"`,
        'color: #10b981; font-weight: bold;',
        'color: #34d399;'
      );
      return dimEmCache;
    }
  }

  if (nomeExato) {
    try {
      const prompt = `Retorne APENAS JSON válido com peso bruto e dimensões da embalagem padrão de envio em pt-BR para "${nomeExato}"${categoriaNome ? ` (categoria: "${categoriaNome}")` : ''}${descricao ? ` - ${descricao.slice(0, 160)}` : ''}.
Formato obrigatório: {"peso_kg": number, "altura_cm": number, "largura_cm": number, "comprimento_cm": number}.
Mínimos Correios: altura_cm >= 4, largura_cm >= 10, comprimento_cm >= 15.`;

      const requestBody: Record<string, unknown> = {
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: SAFETY_SETTINGS_VAREJO,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 120,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              peso_kg: { type: 'NUMBER' },
              altura_cm: { type: 'NUMBER' },
              largura_cm: { type: 'NUMBER' },
              comprimento_cm: { type: 'NUMBER' }
            },
            required: ['peso_kg', 'altura_cm', 'largura_cm', 'comprimento_cm']
          }
        }
      };

      const resData = await invocarGeminiPreencherViaEdgeProxy(requestBody, loja?.id);
      const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = extrairJsonDoTexto(rawText) as Partial<DimensoesEPesoExtraidos> | null;
        if (parsed && Number(parsed.peso_kg) > 0) {
          const resultadoDim: DimensoesEPesoExtraidos = {
            peso_kg: extraidos.peso_kg || Number(Number(parsed.peso_kg).toFixed(3)),
            altura_cm: extraidos.altura_cm || Math.max(4, Math.round(Number(parsed.altura_cm) || 10)),
            largura_cm: extraidos.largura_cm || Math.max(10, Math.round(Number(parsed.largura_cm) || 15)),
            comprimento_cm: extraidos.comprimento_cm || Math.max(15, Math.round(Number(parsed.comprimento_cm) || 20))
          };
          if (chaveCacheDim) {
            salvarCacheHibridoSessao(cacheDimensoesSessaoMemoria, chaveCacheDim, resultadoDim);
          }
          console.log(
            `%c[HUBI PERF ⏱️]%c [DIMENSOES_IA] Concluído em ${Math.round(performance.now() - tInicioDim)}ms para "${nomeExato}"`,
            'color: #0ea5e9; font-weight: bold;',
            'color: #38bdf8;'
          );
          return resultadoDim;
        }
      }
    } catch (err) {
      console.warn('[GeminiService] Falha na detecção rápida de dimensões via gemini-proxy, acionando contingência:', err);
    }
  }

  // 2. Contingência via Jev (System One) por faixa logística caso o Gemini esteja indisponível
  try {
    const dimJev = await catalogJevService.estimarDimensoesComJev(nomeProduto, categoriaNome, descricao);
    if (dimJev && dimJev.peso_kg && dimJev.altura_cm) {
      return dimJev;
    }
  } catch (err) {
    console.warn('[GeminiService] Contingência Jev indisponível:', err);
  }

  // Fallback inteligente baseado em palavras-chave e categorias de varejo
  const t = textoCompleto.toLowerCase();
  let fallbackPeso = extraidos.peso_kg || 0.35;
  let fallbackAltura = extraidos.altura_cm || 10;
  let fallbackLargura = extraidos.largura_cm || 15;
  let fallbackComprimento = extraidos.comprimento_cm || 20;

  if (t.includes('camiseta') || t.includes('camisa') || t.includes('blusa') || t.includes('short') || t.includes('bermuda') || t.includes('vestido') || t.includes('saia')) {
    fallbackPeso = extraidos.peso_kg || 0.25;
    fallbackAltura = extraidos.altura_cm || 4;
    fallbackLargura = extraidos.largura_cm || 20;
    fallbackComprimento = extraidos.comprimento_cm || 28;
  } else if (t.includes('calça') || t.includes('jeans') || t.includes('casaco') || t.includes('moletom') || t.includes('jaqueta')) {
    fallbackPeso = extraidos.peso_kg || 0.65;
    fallbackAltura = extraidos.altura_cm || 8;
    fallbackLargura = extraidos.largura_cm || 25;
    fallbackComprimento = extraidos.comprimento_cm || 32;
  } else if (t.includes('tenis') || t.includes('tênis') || t.includes('sapato') || t.includes('bota') || t.includes('sandalia') || t.includes('sandália') || t.includes('chinelo')) {
    fallbackPeso = extraidos.peso_kg || 0.85;
    fallbackAltura = extraidos.altura_cm || 12;
    fallbackLargura = extraidos.largura_cm || 20;
    fallbackComprimento = extraidos.comprimento_cm || 32;
  } else if (t.includes('celular') || t.includes('smartphone') || t.includes('fone') || t.includes('relogio') || t.includes('smartwatch') || t.includes('carregador') || t.includes('cabo')) {
    fallbackPeso = extraidos.peso_kg || 0.3;
    fallbackAltura = extraidos.altura_cm || 5;
    fallbackLargura = extraidos.largura_cm || 12;
    fallbackComprimento = extraidos.comprimento_cm || 18;
  } else if (t.includes('garrafa') || t.includes('vinho') || t.includes('whisky') || t.includes('bebida') || t.includes('copo') || t.includes('caneca')) {
    fallbackPeso = extraidos.peso_kg || 0.85;
    fallbackAltura = extraidos.altura_cm || 28;
    fallbackLargura = extraidos.largura_cm || 12;
    fallbackComprimento = extraidos.comprimento_cm || 12;
  } else if (t.includes('creme') || t.includes('shampoo') || t.includes('condicionador') || t.includes('perfume') || t.includes('hidratante') || t.includes('oleo') || t.includes('óleo')) {
    fallbackPeso = extraidos.peso_kg || 0.45;
    fallbackAltura = extraidos.altura_cm || 18;
    fallbackLargura = extraidos.largura_cm || 10;
    fallbackComprimento = extraidos.comprimento_cm || 15;
  }

  return {
    peso_kg: fallbackPeso,
    altura_cm: Math.max(4, fallbackAltura),
    largura_cm: Math.max(10, fallbackLargura),
    comprimento_cm: Math.max(15, fallbackComprimento)
  };
};

/**
 * Busca complementar rápida com gemini-3.8-flash + Google Search Grounding
 * acionada quando a Serper retorna menos de 5 lojas nacionais válidas.
 */
export const buscarOfertasComplementaresGeminiSearch = async (
  termoCanonico: string,
  lojasJaEncontradas: string[],
  loja?: any
): Promise<ItemShoppingSerpApi[]> => {
  const termo = (termoCanonico || '').trim();
  if (!termo) return [];

  let apiKey = getGeminiApiKey(loja);
  if (!apiKey && loja?.id) {
    try {
      apiKey = await obterOuBuscarGeminiApiKey(loja);
    } catch {}
  }
  if (!apiKey && !loja?.id) return [];

  const lojasExistentesSet = new Set(lojasJaEncontradas.map(l => l.toLowerCase().trim()));
  const listaJaExistentes = lojasJaEncontradas.length > 0
    ? `Lojas já coletadas (NÃO repetir, traga OUTRAS lojas brasileiras): ${lojasJaEncontradas.join(', ')}.`
    : '';

  const prompt = `Pesquise no Google Brasil ofertas reais e atuais à vista (em R$ / BRL) do produto EXATO: "${termo}".
${listaJaExistentes}
Inclua também o preço oficial na loja da fabricante no Brasil quando existir (ex: store.creality.com/br, crealitybrasil.com) e lojas brasileiras reais como KaBuM!, Slim 3D, Magazine Luiza, Pichau, TerabyteShop, Casas Bahia, Americanas, Mercado Livre, Amazon Brasil e lojas especializadas.

REGRAS RÍGIDAS CONTRA ALUCINAÇÃO:
1. Retorne APENAS lojas e preços efetivamente encontrados nos resultados reais da busca (NUNCA invente preços ou lojas).
2. Exija correspondência EXATA com o modelo "${termo}". NUNCA inclua variantes diferentes (SE, Plus, Pro, Max, Combo, CFS, Mini, Lite), kits ou peças/acessórios.
3. NUNCA inclua compras internacionais / envio do exterior (EUA/China/Remessa Conforme).
4. Use sempre o preço à vista em BRL (número decimal, ex: 3699.00).

Responda EXCLUSIVAMENTE em JSON válido no formato:
{"ofertas":[{"loja":"Nome da Loja","titulo":"Título exato do anúncio","preco":3699.00,"url":"https://..."}]}`;

  const requestBody: any = {
    model: 'gemini-3.8-flash',
    tools: [{ google_search: {} }],
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  try {
    const resData = await executarRequisicaoGemini(apiKey, requestBody, loja?.id);
    const parts = resData?.candidates?.[0]?.content?.parts || [];
    const rawText = parts.map((p: any) => p?.text || '').join('\n').trim();
    if (!rawText) return [];

    const parsed = extrairJsonDoTexto(rawText);
    const lista = Array.isArray(parsed?.ofertas) ? parsed.ofertas : Array.isArray(parsed) ? parsed : [];
    const resultados: ItemShoppingSerpApi[] = [];

    // Verifica que a URL é real e válida (nunca aceitar oferta sem URL verificada do Google Search)
    for (const item of lista) {
      const titulo = String(item?.titulo || item?.title || termo).trim();
      const urlBruta = String(item?.url || item?.link || '').trim();
      const url = desembrulharUrlGoogle(urlBruta);
      if (!url || !url.startsWith('http')) continue;
      const precoNum = extrairPrecoNumericoBr(item?.preco ?? item?.price);
      if (!precoNum || precoNum <= 0) continue;

      if (!ehCompraInternacional(termo) && ehCompraInternacional(`${titulo} ${url}`)) continue;
      if (!ofertaCorrespondeAoModeloPesquisado(termo, titulo, url)) continue;

      const nomeLoja = normalizarNomeLojaBr(String(item?.loja || ''), url);
      const nomeLojaLower = nomeLoja.toLowerCase().trim();
      if (!nomeLojaLower || nomeLojaLower === 'google' || nomeLojaLower === 'google shopping' || nomeLojaLower.includes('google.com')) {
        continue;
      }
      if (lojasExistentesSet.has(nomeLojaLower)) continue;

      lojasExistentesSet.add(nomeLoja.toLowerCase().trim());
      resultados.push({
        titulo,
        loja: nomeLoja,
        preco: precoNum,
        precoTexto: `R$ ${precoNum.toFixed(2)}`,
        url,
        tipo: classificarTipoLojaShopping(nomeLoja)
      });
    }

    return resultados;
  } catch (err) {
    console.warn('[GeminiSearchComplementar] Aviso ao complementar lojas via Google Search:', err);
    return [];
  }
};
