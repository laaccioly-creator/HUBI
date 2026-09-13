// Serviço de Inteligência Artificial Google Gemini (Visão Multimodal e Processamento de Produtos)

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
}

const STORAGE_KEY_GEMINI_KEY = 'hubi_gemini_api_key';
const STORAGE_KEY_GOOGLE_SEARCH_KEY = 'hubi_google_search_api_key';
const STORAGE_KEY_GOOGLE_SEARCH_CX = 'hubi_google_search_cx';

export const getGeminiApiKey = (loja?: any): string => {
  return (
    loja?.configuracoes_extras?.ia?.gemini_api_key ||
    import.meta.env.VITE_GEMINI_API_KEY ||
    localStorage.getItem(STORAGE_KEY_GEMINI_KEY) ||
    ''
  );
};

export const setGeminiApiKey = (key: string) => {
  if (key.trim()) {
    localStorage.setItem(STORAGE_KEY_GEMINI_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_GEMINI_KEY);
  }
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
        .filter((m: any) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent') &&
          !m.name.includes('embedding') &&
          !m.name.includes('aqa') &&
          !m.name.includes('bison')
        )
        .map((m: any) => m.name.replace('models/', ''));

      if (lista.length > 0) {
        lista.sort((a: string, b: string) => {
          const aP = a.includes('flash') ? 10 : a.includes('pro') ? 5 : 1;
          const bP = b.includes('flash') ? 10 : b.includes('pro') ? 5 : 1;
          return bP - aP;
        });
        modelosGeminiValidosCache = lista;
        return lista;
      }
    }
  } catch (e) {
    console.warn('Erro ao consultar lista de modelos do Gemini, usando lista padrão:', e);
  }

  return [
    'gemini-flash-latest',
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-flash-002',
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro'
  ];
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

  const payloadCompleto = {
    ...requestBody,
    safetySettings: requestBody.safetySettings || SAFETY_SETTINGS_VAREJO
  };

  for (const modelo of modelos) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

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
        console.warn(`Tentativa com modelo ${modelo} retornou erro:`, msg);
      }
    } catch (e: any) {
      if (!primeiroErro) primeiroErro = e?.message || String(e);
      console.warn(`Exceção ao chamar modelo ${modelo}:`, e);
    }
  }

  throw new Error(primeiroErro || 'Não foi possível conectar com os modelos Gemini disponíveis.');
};

/**
 * Analisa a foto do produto usando a API Multimodal do Google Gemini (idêntico e equiparado ao Desktop)
 */
export const identificarProdutoPorFoto = async (
  imageBase64OrUrl: string,
  segmentoLoja?: string
): Promise<ProdutoSugeridoIA> => {
  const apiKey = getGeminiApiKey();

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
  "opcoes_sugeridas": [
    {
      "nome": "Nome comercial da opção alternativa 1",
      "categoria_sugerida": "Categoria",
      "preco_venda_estimado": 0.00,
      "preco_custo_estimado": 0.00,
      "descricao": "Descrição comercial rica da opção 1",
      "tipo_unidade": "un",
      "codigo_barras": "",
      "diferencial": "Ex: Versão Zero Açúcar"
    }
  ]
}
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
              diferencial: op.diferencial || ''
            };
          });
        }

        // Se houver dúvida e opções sugeridas, inclui a opção principal também na lista se ela não estiver presente
        const temDuvida = Boolean(parsed.duvida && opcoesFormatadas && opcoesFormatadas.length > 1);

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
  segmentoLoja?: string
): Promise<ProdutoSugeridoIA> => {
  const apiKey = getGeminiApiKey();

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
  "codigo_barras": "${valor}"
}
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
  "codigo_barras": ""
}
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
    return {
      nome: parsed.nome || valor,
      categoria_sugerida: parsed.categoria_sugerida || 'Geral',
      preco_venda_estimado: Number(parsed.preco_venda_estimado) || 0,
      preco_custo_estimado: Number(parsed.preco_custo_estimado) || 0,
      descricao: parsed.descricao || '',
      tipo_unidade: parsed.tipo_unidade || 'un',
      codigo_barras: parsed.codigo_barras || (tipo === 'barcode' ? valor : '')
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
  segmentoLoja?: string
): Promise<string> => {
  const apiKey = getGeminiApiKey();

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

  const registrarFoto = (url: string, titulo: string, fonte: string) => {
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
      fonte
    });
  };

  // Limpa o termo removendo códigos internos e prefixos de SKU (ex: "7633 - VIBRADOR SOPHIE" vira "VIBRADOR SOPHIE")
  const termoLimpo = termo
    .replace(/^[\d\w#.-]+\s*-\s*/, '')
    .replace(/^[0-9]+\s+/, '')
    .trim() || termo.trim();

  // Lista de termos a serem pesquisados no e-commerce
  const termosParaPesquisar: string[] = [];

  // PASSO 1: IA Multimodal de Visão (Gemini Flash) - Extrai termos comerciais visuais precisos
  if (fotoReferencia) {
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

  // Se a loja tiver segmento configurado e o termo for curto, adiciona busca contextualizada com o segmento
  if (segmentoLoja && termoLimpo) {
    const segmentoCurto = segmentoLoja.split('/')[0].trim();
    const termoComSegmento = `${termoLimpo} ${segmentoCurto}`;
    if (!termosParaPesquisar.includes(termoComSegmento)) {
      termosParaPesquisar.push(termoComSegmento);
    }
  }

  // PASSO 2 (A): Google Custom Search JSON API (searchType=image)
  const googleConfig = getGoogleSearchConfig(loja);
  if (googleConfig.cx) {
    const searchApiKey = googleConfig.apiKey || getGeminiApiKey(loja);
    if (searchApiKey) {
      for (const qTermo of termosParaPesquisar.slice(0, 2)) {
        if (fotos.length >= 16) break;
        try {
          const googleUrl = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${encodeURIComponent(googleConfig.cx)}&searchType=image&q=${encodeURIComponent(qTermo)}&num=10&gl=br&hl=pt-BR&safe=off`;
          const ctrl = new AbortController();
          const tId = setTimeout(() => ctrl.abort(), 6500);
          const gRes = await fetch(googleUrl, { signal: ctrl.signal });
          clearTimeout(tId);
          if (gRes.ok) {
            const gData = await gRes.json();
            const items = Array.isArray(gData.items) ? gData.items : [];
            for (const item of items) {
              if (fotos.length >= 20) break;
              const imgUrl = item.link;
              if (imgUrl) {
                const cleanRaw = imgUrl.replace(/^https?:\/\//, '');
                const urlSegura = `https://images.weserv.nl/?url=${encodeURIComponent(cleanRaw)}&w=600&output=jpg`;
                registrarFoto(urlSegura, item.title || qTermo, 'Google Imagens');
              }
            }
          }
        } catch (err) {
          console.warn('Aviso: Erro na busca via Google Custom Search API:', err);
        }
      }
    }
  }

  // PASSO 2 (B): Busca Web / E-commerce via Middleware Local (/api/buscar-fotos-web)
  if (fotos.length < 15) {
    for (const qTermo of termosParaPesquisar.slice(0, 3)) {
      if (fotos.length >= 20) break;
      try {
        const resWeb = await fetch(`/api/buscar-fotos-web?q=${encodeURIComponent(qTermo)}`);
        const cType = resWeb.headers.get('content-type') || '';
        // Só tenta ler JSON se não for o fallback HTML do SPA em produção estática
        if (resWeb.ok && cType.includes('application/json')) {
          const dataWeb = await resWeb.json();
          const resultados = Array.isArray(dataWeb.results) ? dataWeb.results : [];
          for (const item of resultados) {
            if (fotos.length >= 20) break;
            const rawImg = item.image || item.thumbnail;
            if (rawImg) {
              // Passa pelo proxy de imagem weserv para garantir CORS, bypass de hotlink e alta performance
              const cleanRaw = rawImg.replace(/^https?:\/\//, '');
              const urlSegura = `https://images.weserv.nl/?url=${encodeURIComponent(cleanRaw)}&w=600&output=jpg`;
              registrarFoto(urlSegura, item.title || qTermo, 'Lojas / Web');
            }
          }
        }
      } catch (err) {
        console.warn('Aviso: Erro ao consultar /api/buscar-fotos-web:', err);
      }
    }
  }

  // PASSO 2 (C): Consulta Open Food Facts, Open Beauty Facts e Open Products Facts
  if (fotos.length < 12) {
    try {
      const termoOFF = codigoBarras?.trim() || termoLimpo;
      const apis = [
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(termoOFF)}&search_simple=1&action=process&json=1&page_size=6`,
        `https://world.openbeautyfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(termoOFF)}&search_simple=1&action=process&json=1&page_size=6`,
        `https://world.openproductsfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(termoOFF)}&search_simple=1&action=process&json=1&page_size=6`
      ];

      for (const urlAPI of apis) {
        try {
          const ctrl = new AbortController();
          const tId = setTimeout(() => ctrl.abort(), 3500);
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
      }
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
}): Promise<ProdutoSugeridoIA> => {
  const apiKey = getGeminiApiKey();
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
  "codigo_barras": "${dados.codigoBarras || ''}"
}
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

  return {
    nome: parsed.nome || dados.nome,
    categoria_sugerida: parsed.categoria_sugerida || dados.categoriaNome || 'Geral',
    preco_venda_estimado: precoSemCentavos,
    preco_custo_estimado: Number(parsed.preco_custo_estimado) || 0,
    descricao: parsed.descricao || dados.descricao || '',
    tipo_unidade: parsed.tipo_unidade || 'un',
    codigo_barras: parsed.codigo_barras || dados.codigoBarras || ''
  };
};
