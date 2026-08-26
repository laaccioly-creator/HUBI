// Serviço de Inteligência Artificial Google Gemini (Visão Multimodal e Processamento de Produtos)

export interface ProdutoSugeridoIA {
  nome: string;
  categoria_sugerida?: string;
  preco_venda_estimado?: number;
  preco_custo_estimado?: number;
  descricao?: string;
  tipo_unidade?: string;
  codigo_barras?: string;
}

const STORAGE_KEY_GEMINI_KEY = 'hubi_gemini_api_key';

export const getGeminiApiKey = (): string => {
  return (
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
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-flash-002',
    'gemini-2.0-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro',
    'gemini-pro'
  ];
};

export const executarRequisicaoGemini = async (apiKey: string, requestBody: any): Promise<any> => {
  const modelos = await obterModelosValidosGemini(apiKey);
  let primeiroErro: string | null = null;

  for (const modelo of modelos) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
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
  imageBase64OrUrl: string
): Promise<ProdutoSugeridoIA> => {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não configurada. Configure sua chave Gemini nas configurações.');
  }

  try {
    const { base64: cleanBase64, mimeType: detectedMime } = await comprimirImagemParaIA(imageBase64OrUrl);

    const promptInstrucao = `
Você é um especialista em catálogo de produtos e inteligência de mercado de varejo e e-commerce no Brasil.
Analise detalhadamente a foto do produto enviada. Identifique a marca, modelo, tipo de produto, volume/peso e suas características principais.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown de código e sem texto adicional) com a seguinte estrutura:
{
  "nome": "Nome comercial preciso, atraente, completo e oficial do produto em português (ex: Refrigerante Coca-Cola Lata 350ml, Sabonete Líquido Dove Nutrição Profunda 250ml, Mini Vibrador Bullet com Capa de Silicone Texturizada Estimuladora, etc.)",
  "categoria_sugerida": "Nome da categoria mais adequada no varejo (ex: Bebidas, Alimentos, Vestuário, Eletrônicos, Cosméticos, Saúde e Beleza, Bem-Estar / Sensual, Limpeza, Pet Shop, etc.)",
  "preco_venda_estimado": 0.00,
  "preco_custo_estimado": 0.00,
  "descricao": "Descrição comercial rica, persuasiva e completa para catálogo online e WhatsApp destacando os benefícios reais, materiais/especificações, modo de uso ou diferenciais do item de forma envolvente e profissional.",
  "tipo_unidade": "un",
  "codigo_barras": "Código de barras numérico se visível na foto ou embalagem, senão vazio"
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

        return {
          nome: parsed.nome || 'Produto Identificado',
          categoria_sugerida: parsed.categoria_sugerida || 'Geral',
          preco_venda_estimado: Number(parsed.preco_venda_estimado) || 0,
          preco_custo_estimado: Number(parsed.preco_custo_estimado) || 0,
          descricao: parsed.descricao || '',
          tipo_unidade: parsed.tipo_unidade || 'un',
          codigo_barras: parsed.codigo_barras || ''
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
  valor: string
): Promise<ProdutoSugeridoIA> => {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não configurada. Configure a chave no sistema.');
  }

  const promptInstrucao = tipo === 'barcode' ? `
Você é um especialista em catálogo de produtos, banco de dados EAN/GS1 e precificação no Brasil.
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
 */
export const gerarDescricaoExclusivaIA = async (
  nomeProduto: string,
  categoria?: string,
  descricaoAtual?: string
): Promise<string> => {
  const apiKey = getGeminiApiKey();

  if (apiKey && nomeProduto.trim()) {
    try {
      const prompt = `
Você é um copywriter de elite especializado em e-commerce, catálogo online e varejo no Brasil.
Escreva uma descrição completa, envolvente, rica e exclusiva para o produto "${nomeProduto}"${categoria ? ` (Categoria: ${categoria})` : ''}.
${descricaoAtual ? `Informações ou rascunho fornecido pelo lojista: "${descricaoAtual}"` : ''}

Diretrizes obrigatórias:
1. NÃO faça apenas um resumo genérico. Produza um texto detalhado, persuasivo e rico em benefícios reais e diferenciais.
2. Destaque modo de uso, textura/sensação/formato/tamanho (quando aplicável) e a experiência de compra do cliente.
3. Não use chavões repetitivos ou frases prontas padronizadas como "excelente qualidade e melhor custo-benefício".
4. Retorne APENAS o texto da descrição gerada de alta conversão, sem aspas e sem títulos adicionais.
`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 700 }
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
