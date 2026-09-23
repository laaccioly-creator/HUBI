// Serviço de Inteligência Artificial Google Gemini (Visão Multimodal e Processamento de Produtos)
import { supabase } from '../lib/supabase';
import { Loja } from '../types';
import {
  obterSerpApiKey,
  obterOuBuscarSerpApiKey,
  buscarFotosGoogleImagesSerpApi,
  SerpApiQuotaError,
  SerpApiAuthError,
  FotoResultadoSerpApi
} from './serpApiService';

export { SerpApiQuotaError, SerpApiAuthError };
export type { FotoResultadoSerpApi };

export interface ProdutoSugeridoIA {
  nome: string;
  categoria_sugerida?: string;
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

const STORAGE_KEY_GEMINI_KEY = 'hubi_gemini_api_key';
const STORAGE_KEY_GOOGLE_SEARCH_KEY = 'hubi_google_search_api_key';
const STORAGE_KEY_GOOGLE_SEARCH_CX = 'hubi_google_search_cx';

export const getGeminiApiKey = (loja?: any): string => {
  const chave = (
    loja?.configuracoes_extras?.ia?.gemini_api_key ||
    import.meta.env.VITE_GEMINI_API_KEY ||
    localStorage.getItem(STORAGE_KEY_GEMINI_KEY) ||
    ''
  ).trim();

  // Se veio do objeto da loja mas não estava no localStorage do aparelho, sincroniza no storage
  if (chave && !localStorage.getItem(STORAGE_KEY_GEMINI_KEY)) {
    try {
      localStorage.setItem(STORAGE_KEY_GEMINI_KEY, chave);
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
        .select('configuracoes_extras')
        .eq('id', loja.id)
        .maybeSingle();

      if (!error && data?.configuracoes_extras) {
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
            localStorage.setItem(STORAGE_KEY_GEMINI_KEY, limpa);
            return limpa;
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

  // 1. Grava no localStorage para acesso síncrono imediato no dispositivo
  if (limpa) {
    localStorage.setItem(STORAGE_KEY_GEMINI_KEY, limpa);
  } else {
    localStorage.removeItem(STORAGE_KEY_GEMINI_KEY);
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
    construcao: 'Material de Construção / Tintas / Elétrica',
    artesanato: 'Artesanato / Decoração / Variedades',
    geral: 'Varejo Comercial Geral'
  };

  if (!segmentoId) return '';
  return mapaNomes[segmentoId] || segmentoId;
};

/**
 * Comprime a imagem para 640px JPEG antes de enviar para a API Gemini (payload ultraleve < 40KB)
 */
export const comprimirImagemParaIA = async (base64OrUrl: string): Promise<{ base64: string; mimeType: string }> => {
  return new Promise(async (resolve) => {
    let target = base64OrUrl;

    if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('blob:')) {
      try {
        const response = await fetch(target);
        const blob = await response.blob();
        target = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onloadend = () => res(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        console.warn('Erro ao converter URL para base64:', err);
      }
    }

    if (!target.startsWith('data:image')) {
      const clean = target.includes(',') ? target.split(',')[1] : target;
      resolve({ base64: clean, mimeType: 'image/jpeg' });
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const maxDim = 640;
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

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        const raw = target.includes(',') ? target.split(',')[1] : target;
        resolve({ base64: raw, mimeType: 'image/jpeg' });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const cleanBase64 = compressedDataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

      resolve({
        base64: cleanBase64,
        mimeType: 'image/jpeg'
      });
    };
    img.onerror = () => {
      const raw = target.includes(',') ? target.split(',')[1] : target;
      resolve({
        base64: raw,
        mimeType: 'image/jpeg'
      });
    };
    img.src = target;
  });
};

let modelosGeminiValidosCache: string[] | null = null;

export const obterModelosValidosGemini = async (apiKey: string): Promise<string[]> => {
  if (modelosGeminiValidosCache && modelosGeminiValidosCache.length > 0) {
    return modelosGeminiValidosCache;
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      const models = data?.models || [];
      const lista = models
        .filter((m: any) => {
          const nome = (m.name || '').replace('models/', '').toLowerCase();
          const suportaGenerate = Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent');
          if (!suportaGenerate) return false;

          // Excluir modelos puramente de áudio, geração de imagens, embeddings e modelos depreciados com 404
          if (
            nome.includes('tts') ||
            nome.includes('image') ||
            nome.includes('embedding') ||
            nome.includes('aqa') ||
            nome.includes('bison') ||
            nome.includes('live') ||
            nome.includes('realtime') ||
            nome.startsWith('gemini-2.5-') || // Depreciado pelo Google para novas chaves
            nome.includes('omni')
          ) {
            return false;
          }
          return true;
        })
        .map((m: any) => m.name.replace('models/', ''));

      if (lista.length > 0) {
        lista.sort((a: string, b: string) => {
          const getScore = (name: string) => {
            if (name === 'gemini-2.0-flash') return 100;
            if (name === 'gemini-1.5-flash') return 95;
            if (name === 'gemini-3.6-flash') return 90;
            if (name === 'gemini-3.5-flash') return 85;
            if (name === 'gemini-3.5-flash-lite') return 80;
            if (name === 'gemini-2.0-flash-lite') return 75;
            if (name === 'gemini-1.5-flash-8b') return 70;
            if (name.includes('2.0-flash')) return 65;
            if (name.includes('1.5-flash')) return 60;
            if (name === 'gemini-1.5-pro') return 50;
            return 10;
          };
          return getScore(b) - getScore(a);
        });

        // Selecionar os top 4 modelos mais estáveis para evitar sobrecarga de requisições
        const topModelos = lista.slice(0, 4);
        modelosGeminiValidosCache = topModelos;
        return topModelos;
      }
    }
  } catch (e) {
    console.warn('Erro ao consultar lista de modelos do Gemini, usando lista padrão:', e);
  }

  const listaPadrao = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-2.0-flash-lite-preview-02-05',
    'gemini-1.5-flash-8b'
  ];
  return listaPadrao;
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

export const executarRequisicaoGemini = async (apiKey: string, requestBody: any): Promise<any> => {
  const modelos = await obterModelosValidosGemini(apiKey);
  let primeiroErro: string | null = null;
  let contador429 = 0;

  const payloadCompleto = {
    ...requestBody,
    safetySettings: requestBody.safetySettings || SAFETY_SETTINGS_VAREJO
  };

  for (const modelo of modelos) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      // Timeout ampliado para 15 segundos para dar tempo suficiente ao processamento da IA
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadCompleto),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        return await response.json();
      } else {
        const errJson = await response.json().catch(() => ({}));
        const msg = errJson?.error?.message || response.statusText;
        if (!primeiroErro) primeiroErro = msg;

        if (response.status === 429) {
          contador429++;
          if (contador429 >= 2) {
            console.warn('[Gemini] Limite de taxa (429) atingido na chave. Interrompendo cascata de tentativas.');
            throw new Error('A cota de requisições da sua chave do Google Gemini atingiu o limite temporário. Por favor, aguarde cerca de 30 segundos antes de tentar novamente.');
          }
        }

        console.warn(`Tentativa com modelo ${modelo} retornou erro (${response.status}):`, msg);
      }
    } catch (e: any) {
      if (!primeiroErro) primeiroErro = e?.message || String(e);
      if (e?.name === 'AbortError') {
        console.warn(`Tempo limite excedido (15s) ao consultar modelo ${modelo}.`);
      } else if (e?.message?.includes('cota') || e?.message?.includes('limite temporário')) {
        throw e;
      } else {
        console.warn(`Exceção ao chamar modelo ${modelo}:`, e);
      }
    }
  }

  throw new Error(primeiroErro || 'Não foi possível conectar com os modelos Gemini disponíveis.');
};

/**
 * Analisa a foto do produto usando a API Multimodal do Google Gemini (idêntico e equiparado ao Desktop)
 */
export const identificarProdutoPorFoto = async (
  imageBase64OrUrl: string,
  segmentoLoja?: string,
  loja?: any
): Promise<ProdutoSugeridoIA> => {
  const apiKey = getGeminiApiKey(loja);

  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não configurada. Configure sua chave Gemini nas configurações.');
  }

  try {
    const { base64: cleanBase64, mimeType: detectedMime } = await comprimirImagemParaIA(imageBase64OrUrl);

    const promptInstrucao = `
Você é um especialista em catálogo de produtos e inteligência de mercado de varejo e e-commerce no Brasil (abrangendo todas as categorias comerciais legais de lojas, como alimentos, bebidas, moda, beleza, ferramentas, petshop, bem-estar e produtos de saúde/sex shop). Todos os itens analisados são produtos de varejo comercial.
${segmentoLoja ? `CONTEXTO CRÍTICO - SEGMENTO DE ATUAÇÃO DA LOJA: "${segmentoLoja}". O item analisado pertence a este segmento comercial específico. Utilize terminologias, categorias e referências deste nicho de mercado.` : ''}
Analise detalhadamente a foto do produto enviada. Identifique a marca, modelo, tipo de produto, volume/peso e suas características principais.

IMPORTANTE SOBRE DÚVIDA OU MÚLTIPLAS POSSIBILIDADES:
- Se a foto for perfeitamente nítida e você tiver certeza absoluta de qual é o produto único, defina "duvida": false.
- Se você tiver QUALQUER DÚVIDA sobre qual é exatamente o produto (exemplo: a foto pode ser a versão Original ou Zero Açúcar, ou múltiplos sabores/aromas possíveis como Morango vs Frutas Vermelhas, ou tamanhos/modelos muito similares da mesma marca, ou foto em ângulo que não mostra o rótulo frontal completo), você DEVE definir "duvida": true e listar no array "opcoes_sugeridas" de 2 a 4 opções de produtos prováveis que o usuário poderia estar querendo cadastrar, preenchendo o "diferencial" explicativo para cada um (ex: "Versão Tradicional 350ml", "Versão Sem Açúcar / Zero 350ml", etc.).

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown de código e sem texto adicional) com a seguinte estrutura:
{
  "duvida": false,
  "nome": "Nome comercial preciso, atraente, completo e oficial do produto em português",
  "categoria_sugerida": "Nome da categoria mais adequada no varejo",
  "preco_venda_estimado": 0.00,
  "preco_custo_estimado": 0.00,
  "descricao": "Descrição comercial rica, persuasiva e completa para catálogo online e WhatsApp destacando os benefícios reais, materiais/especificações e diferenciais.",
  "tipo_unidade": "un",
  "codigo_barras": "Código de barras numérico se visível na foto ou embalagem, senão vazio",
  "diferencial": "Breve resumo do diferencial (ex: Versão Tradicional)",
  "peso_kg": 0.35,
  "altura_cm": 10,
  "largura_cm": 15,
  "comprimento_cm": 20,
  "opcoes_sugeridas": [
    {
      "nome": "Nome comercial da opção alternativa 1",
      "categoria_sugerida": "Categoria",
      "preco_venda_estimado": 0.00,
      "preco_custo_estimado": 0.00,
      "descricao": "Descrição comercial rica da opção 1",
      "tipo_unidade": "un",
      "codigo_barras": "",
      "diferencial": "Ex: Versão Zero Açúcar",
      "peso_kg": 0.35,
      "altura_cm": 10,
      "largura_cm": 15,
      "comprimento_cm": 20
    }
  ]
}
IMPORTANTE SOBRE PESO E DIMENSÕES PARA FRETE:
Estime com inteligência o peso bruto do produto embalado em kg ('peso_kg', ex: 0.35 para 350g, 1.200 para 1.2kg) e as dimensões mínimas da embalagem de envio em centímetros ('altura_cm', 'largura_cm', 'comprimento_cm') considerando o tipo, material e volume do produto para cálculo de frete nos Correios e Jadlog.
`;

    const requestBody: any = {
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
      generationConfig: {
        temperature: 0.2,
        response_mime_type: 'application/json'
      }
    };

    const resData = await executarRequisicaoGemini(apiKey, requestBody);

    if (resData) {
      const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const jsonLimpo = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonLimpo);

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
        const pesoKgFinal = Number(parsed.peso_kg) > 0 ? Number(parsed.peso_kg) : extraidos.peso_kg;
        const alturaFinal = Number(parsed.altura_cm) > 0 ? Number(parsed.altura_cm) : extraidos.altura_cm;
        const larguraFinal = Number(parsed.largura_cm) > 0 ? Number(parsed.largura_cm) : extraidos.largura_cm;
        const compFinal = Number(parsed.comprimento_cm) > 0 ? Number(parsed.comprimento_cm) : extraidos.comprimento_cm;

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
  tipo: 'texto' | 'barcode',
  valor: string,
  segmentoLoja?: string,
  loja?: any
): Promise<ProdutoSugeridoIA> => {
  const apiKey = getGeminiApiKey(loja);

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
    contents: [{ parts: [{ text: promptInstrucao }] }],
    generationConfig: { temperature: 0.2, response_mime_type: 'application/json' }
  };

  const resData = await executarRequisicaoGemini(apiKey, requestBody);
  const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (rawText) {
    const jsonLimpo = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonLimpo);

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

/**
 * Gera uma descrição aprimorada, rica, qualitativa, detalhada e exclusiva para o produto
 * sem truncamento e com apresentação comercial completa.
 */
export const gerarDescricaoExclusivaIA = async (
  nomeProduto: string,
  categoria?: string,
  descricaoAtual?: string,
  segmentoLoja?: string,
  loja?: any
): Promise<string> => {
  const apiKey = getGeminiApiKey(loja);

  if (apiKey && nomeProduto.trim()) {
    try {
      const prompt = `
Você é um copywriter sênior de elite especializado em e-commerce, catálogo online e varejo de alto padrão no Brasil${segmentoLoja ? ` no segmento de "${segmentoLoja}"` : ''}.
Escreva uma descrição comercial COMPLETA, envolvente, rica e altamente persuasiva para o seguinte produto:

PRODUTO: "${nomeProduto}"
${categoria ? `CATEGORIA: "${categoria}"` : ''}
${descricaoAtual ? `RASCUNHO / DADOS INICIAIS FORNECIDOS PELO LOJISTA: "${descricaoAtual}"` : ''}
${segmentoLoja ? `SEGMENTO DE MERCADO: "${segmentoLoja}"` : ''}

DIRETRIZES OBRIGATÓRIAS DE REDAÇÃO:
1. NÃO RESUMA! NUNCA faça um texto curto ou telegráfico. NUNCA deixe frases cortadas ou pela metade. Complete todas as frases e ideias perfeitamente.
2. Crie uma apresentação comercial apaixonante, que valorize o produto, destacando a experiência de uso, qualidade de construção e os benefícios práticos.
3. Estruture a descrição de forma visualmente agradável e clara para leitura no celular e WhatsApp, incluindo:
   • Um parágrafo inicial envolvente e marcante apresentando o produto.
   • Principais Benefícios e Diferenciais (em tópicos com bullets claros).
   • Características, especificações ou modo de uso recomendados.
4. Evite clichês vazios; use argumentos reais de valorização que incentivem a decisão imediata de compra.
5. Retorne APENAS o texto completo da descrição comercial em português, sem aspas e sem tags markdown estranhas.
`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.65, maxOutputTokens: 2500 }
      };

      const resData = await executarRequisicaoGemini(apiKey, requestBody);
      const texto = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (texto && texto.trim()) {
        return texto.trim();
      }
    } catch (err) {
      console.warn('Erro ao gerar descrição exclusiva com Gemini:', err);
    }
  }

  return `${nomeProduto}. Desenvolvido para entregar máxima qualidade, conforto e praticidade no seu dia a dia. Composição de alto padrão, acabamento refinado e excelente durabilidade. Produto original e garantido.`;
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

/**
 * Analisa a foto do produto com IA multimodal e extrai os melhores termos de busca comercial para encontrar fotos idênticas
 */
export const extrairTermosBuscaVisualPorFoto = async (
  fotoUrlOuBase64: string,
  nomeAtual?: string,
  segmentoLoja?: string
): Promise<string[]> => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return [];

  try {
    const { base64: cleanBase64, mimeType: detectedMime } = await comprimirImagemParaIA(fotoUrlOuBase64);
    const promptInstrucao = `
Você é um especialista em busca reversa de imagens e catálogo de produtos no varejo brasileiro (abrangendo todas as categorias comerciais de lojas, como cosméticos, moda, beleza, ferramentas, autopeças, alimentos e sex shop). Todos os itens analisados são produtos comerciais legais.
${segmentoLoja ? `SEGMENTO DE ATUAÇÃO DA LOJA: "${segmentoLoja}". O item analisado pertence especificamente a este segmento comercial.` : ''}
Analise detalhadamente a foto deste produto enviada${nomeAtual ? ` (nome informado: "${nomeAtual}")` : ''}.
Identifique as características visuais mais marcantes (ex: formato exato, cor, modelo, design específico, marca provável).
Retorne EXCLUSIVAMENTE um array JSON de strings com 2 a 4 termos de busca precisos e específicos para o Google Imagens e e-commerces no Brasil localizarem o MESMO PRODUTO IDÊNTICO${segmentoLoja ? ` no segmento de "${segmentoLoja}"` : ''}.
Exemplo para um vibrador em formato de rosa: ["Vibrador Sophie Formato de Rosa", "Vibrador rosa sophie", "Vibrador formato rosa estimulador"]
Retorne apenas o JSON no formato: ["termo 1", "termo 2", "termo 3"]
`;

    const requestBody = {
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
      generationConfig: { temperature: 0.2, response_mime_type: 'application/json' }
    };

    const resData = await executarRequisicaoGemini(apiKey, requestBody);
    const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (rawText) {
      const jsonLimpo = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonLimpo);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((t: any) => String(t).trim()).filter(Boolean);
      }
    }
  } catch (err) {
    console.warn('Aviso ao analisar foto para busca visual:', err);
  }

  return [];
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

  // Limpa o termo removendo códigos internos e prefixos de SKU (ex: "7633 - VIBRADOR SOPHIE" vira "VIBRADOR SOPHIE")
  const termoLimpo = termo
    .replace(/^[\d\w#.-]+\s*-\s*/, '')
    .replace(/^[0-9]+\s+/, '')
    .trim() || termo.trim();

  // Lista de termos a serem pesquisados no e-commerce
  const termosParaPesquisar: string[] = [];

  // PASSO 1: IA Multimodal de Visão (Gemini Flash)
  // Só executa se NÃO houver nome de texto (apenas foto enviada) para não adicionar 5s desnecessários de latência
  if (!termoLimpo && fotoReferencia) {
    try {
      const termosVisuais = await extrairTermosBuscaVisualPorFoto(fotoReferencia, termoLimpo, segmentoLoja);
      for (const tv of termosVisuais) {
        if (tv && !termosParaPesquisar.includes(tv)) {
          termosParaPesquisar.push(tv);
        }
      }
    } catch (e) {
      console.warn('Não foi possível extrair termos visuais da foto:', e);
    }
  }

  if (termoLimpo && !termosParaPesquisar.includes(termoLimpo)) {
    termosParaPesquisar.push(termoLimpo);
  }

  // Se a loja tiver segmento configurado e o termo for muito curto (<= 2 palavras), adiciona busca contextualizada
  if (segmentoLoja && termoLimpo && termoLimpo.split(' ').length <= 2) {
    const segmentoCurto = segmentoLoja.split('/')[0].trim();
    const termoComSegmento = `${termoLimpo} ${segmentoCurto}`;
    if (!termosParaPesquisar.includes(termoComSegmento)) {
      termosParaPesquisar.push(termoComSegmento);
    }
  }

  // PASSO 2 (A): SerpApi (Google Images Engine) no modelo BYOK
  let serpApiKey = obterSerpApiKey(loja);
  if (!serpApiKey && loja?.id) {
    serpApiKey = await obterOuBuscarSerpApiKey(loja);
  }

  // O termo prioritário para SerpApi é o nome do produto / busca digitada
  const termoPrincipal = termoLimpo || termosParaPesquisar[0];

  console.log(
    '%c[HUBI IMAGENS]%c Buscando fotos no Google Images...',
    'background: #0284c7; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
    'color: #0284c7; font-weight: bold;',
    { 
      temChave: Boolean(serpApiKey),
      lojaId: loja?.id,
      lojaNome: loja?.nome_fantasia,
      termoPrincipal
    }
  );

  // Se temos a chave OU temos o lojaId (pois a RPC do Supabase lê direto de public.lojas pelo loja_id)
  if (serpApiKey || loja?.id) {
    try {
      const resultadosSerpApi = await buscarFotosGoogleImagesSerpApi(
        termoPrincipal,
        serpApiKey,
        { lojaId: loja?.id, numResultados: 20 }
      );
      console.log(
        `%c[HUBI IMAGENS]%c SerpApi retornou ${resultadosSerpApi.length} fotos para "${termoPrincipal}"`,
        'background: #16a34a; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
        'color: #16a34a; font-weight: bold;'
      );
      for (const item of resultadosSerpApi) {
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

  // PASSO 2 (C): Consulta Open Food / Beauty / Products Facts (em paralelo ultrarrápido com timeout de 2s)
  if (fotos.length === 0 && (codigoBarras?.trim() || termoLimpo)) {
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

/**
 * Atualiza um produto existente utilizando os dados e fotos atuais através da IA Gemini
 */
export const atualizarProdutoExistenteComIA = async (dados: {
  nome: string;
  descricao?: string;
  fotoUrl?: string;
  categoriaNome?: string;
  codigoBarras?: string;
  precoVendaAtual?: number;
  segmentoLoja?: string;
  loja?: any;
}): Promise<ProdutoSugeridoIA> => {
  const apiKey = getGeminiApiKey(dados.loja);
  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não configurada. Configure sua chave Gemini nas configurações.');
  }

  const promptAtualizacao = `
Você é um especialista em catálogo de produtos, copywriting comercial e precificação de varejo no Brasil${dados.segmentoLoja ? ` no segmento de "${dados.segmentoLoja}"` : ''}.
O lojista possui um produto já cadastrado e solicitou a ATUALIZAÇÃO E ENRIQUECIMENTO INTELIGENTE deste item.
${dados.segmentoLoja ? `SEGMENTO DA LOJA: "${dados.segmentoLoja}". O item é deste segmento comercial.` : ''}

DADOS ATUAIS DO PRODUTO:
- Nome Atual: "${dados.nome}"
${dados.categoriaNome ? `- Categoria Atual: "${dados.categoriaNome}"` : ''}
${dados.descricao ? `- Descrição Atual: "${dados.descricao}"` : ''}
${dados.codigoBarras ? `- Código de Barras / EAN: "${dados.codigoBarras}"` : ''}
${dados.precoVendaAtual ? `- Preço de Venda Atual: R$ ${dados.precoVendaAtual}` : ''}

SUA TAREFA:
1. Padronize e melhore o Nome Comercial do produto (deixando-o preciso, profissional e atraente).
2. Indique a Categoria comercial mais adequada no varejo.
3. Elabore uma Descrição Comercial rica, completa, persuasiva e sem truncamento (com benefícios, especificações e modo de uso).
4. Estime o preço de venda de mercado praticado no Brasil e concorrentes.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown):
{
  "nome": "Nome comercial melhorado e completo",
  "categoria_sugerida": "Nome da categoria mais adequada",
  "preco_venda_estimado": 0.00,
  "preco_custo_estimado": 0.00,
  "descricao": "Descrição comercial completa, estruturada e detalhada",
  "tipo_unidade": "un",
  "codigo_barras": "${dados.codigoBarras || ''}",
  "peso_kg": 0.35,
  "altura_cm": 10,
  "largura_cm": 15,
  "comprimento_cm": 20
}
IMPORTANTE SOBRE PESO E DIMENSÕES PARA FRETE:
Estime com inteligência o peso bruto do produto embalado em kg ('peso_kg', ex: 0.35 para 350g, 1.2 para 1.2kg) e as dimensões da embalagem para envio em centímetros ('altura_cm', 'largura_cm', 'comprimento_cm') para cálculo de frete nos Correios e Jadlog.
`;

  let requestBody: any;

  if (dados.fotoUrl) {
    try {
      const { base64: cleanBase64, mimeType: detectedMime } = await comprimirImagemParaIA(dados.fotoUrl);
      requestBody = {
        contents: [
          {
            parts: [
              { text: promptAtualizacao },
              {
                inline_data: {
                  mime_type: detectedMime || 'image/jpeg',
                  data: cleanBase64
                }
              }
            ]
          }
        ],
        generationConfig: { temperature: 0.3, response_mime_type: 'application/json' }
      };
    } catch {
      requestBody = {
        contents: [{ parts: [{ text: promptAtualizacao }] }],
        generationConfig: { temperature: 0.3, response_mime_type: 'application/json' }
      };
    }
  } else {
    requestBody = {
      contents: [{ parts: [{ text: promptAtualizacao }] }],
      generationConfig: { temperature: 0.3, response_mime_type: 'application/json' }
    };
  }

  const resData = await executarRequisicaoGemini(apiKey, requestBody);
  const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Não foi possível obter resposta da IA para atualizar o produto.');

  const jsonLimpo = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(jsonLimpo);

  // Preço sugerido sempre sem os centavos (ex: Math.floor)
  const precoEstimado = Number(parsed.preco_venda_estimado) || 0;
  const precoSemCentavos = precoEstimado > 0 ? Math.floor(precoEstimado) : 0;

  const extraidos = extrairDimensoesEPesoTexto(`${parsed.nome || dados.nome} ${parsed.descricao || dados.descricao || ''}`);
  const pesoKgFinal = Number(parsed.peso_kg) > 0 ? Number(parsed.peso_kg) : extraidos.peso_kg;
  const alturaFinal = Number(parsed.altura_cm) > 0 ? Number(parsed.altura_cm) : extraidos.altura_cm;
  const larguraFinal = Number(parsed.largura_cm) > 0 ? Number(parsed.largura_cm) : extraidos.largura_cm;
  const compFinal = Number(parsed.comprimento_cm) > 0 ? Number(parsed.comprimento_cm) : extraidos.comprimento_cm;

  return {
    nome: parsed.nome || dados.nome,
    categoria_sugerida: parsed.categoria_sugerida || dados.categoriaNome || 'Geral',
    preco_venda_estimado: precoSemCentavos,
    preco_custo_estimado: Number(parsed.preco_custo_estimado) || 0,
    descricao: parsed.descricao || dados.descricao || '',
    tipo_unidade: parsed.tipo_unidade || 'un',
    codigo_barras: parsed.codigo_barras || dados.codigoBarras || '',
    peso_kg: pesoKgFinal,
    altura_cm: alturaFinal,
    largura_cm: larguraFinal,
    comprimento_cm: compFinal
  };
};

/**
 * Estima com IA (Google Gemini) ou regras especializadas de varejo as dimensões e peso bruto de um produto
 * para despacho por transportadoras (Melhor Envio / Correios / Jadlog).
 */
export const estimarDimensoesEPesoProduto = async (
  nomeProduto: string,
  descricao?: string,
  categoriaNome?: string,
  loja?: any
): Promise<DimensoesEPesoExtraidos> => {
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

  // Tentar estimativa profunda com Google Gemini
  let chave = getGeminiApiKey(loja);
  if (!chave && loja?.id) {
    try {
      chave = await obterOuBuscarGeminiApiKey(loja);
    } catch {}
  }

  if (chave && nomeProduto.trim()) {
    try {
      const prompt = `
Você é um especialista em logística de e-commerce e despacho de encomendas no Brasil (Correios e Jadlog).
Estime com inteligência o peso bruto com embalagem ('peso_kg') e as dimensões mínimas para embalagem de envio ('altura_cm', 'largura_cm', 'comprimento_cm') para o seguinte produto:

Produto: "${nomeProduto}"
${categoriaNome ? `Categoria: "${categoriaNome}"` : ''}
${descricao ? `Descrição: "${descricao.slice(0, 300)}"` : ''}

REGRAS OBRIGATÓRIAS:
- 'peso_kg': Peso total bruto da mercadoria com a caixa/pacote em kg (ex: 0.35 para 350g, 1.2 para 1.2kg).
- 'altura_cm', 'largura_cm', 'comprimento_cm': Dimensões da embalagem para envio. Mínimos aceitos nos Correios/Jadlog: altura >= 4cm, largura >= 10cm, comprimento >= 15cm.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem texto extra, sem bloco markdown):
{
  "peso_kg": 0.35,
  "altura_cm": 10,
  "largura_cm": 15,
  "comprimento_cm": 20
}
`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          response_mime_type: 'application/json'
        }
      };

      const resData = await executarRequisicaoGemini(chave, requestBody);
      const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const jsonLimpo = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonLimpo);

        return {
          peso_kg: extraidos.peso_kg || (Number(parsed.peso_kg) > 0 ? Number(Number(parsed.peso_kg).toFixed(3)) : 0.35),
          altura_cm: extraidos.altura_cm || Math.max(4, Math.round(Number(parsed.altura_cm) || 10)),
          largura_cm: extraidos.largura_cm || Math.max(10, Math.round(Number(parsed.largura_cm) || 15)),
          comprimento_cm: extraidos.comprimento_cm || Math.max(15, Math.round(Number(parsed.comprimento_cm) || 20))
        };
      }
    } catch (err) {
      console.warn('[GeminiService] Falha na estimativa de medidas com IA, aplicando fallback heurístico:', err);
    }
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
