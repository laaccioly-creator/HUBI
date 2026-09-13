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
 * sem truncamento e com apresentação comercial completa.
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
Você é um copywriter sênior de elite especializado em e-commerce, catálogo online e varejo de alto padrão no Brasil.
Escreva uma descrição comercial COMPLETA, envolvente, rica e altamente persuasiva para o seguinte produto:

PRODUTO: "${nomeProduto}"
${categoria ? `CATEGORIA: "${categoria}"` : ''}
${descricaoAtual ? `RASCUNHO / DADOS INICIAIS FORNECIDOS PELO LOJISTA: "${descricaoAtual}"` : ''}

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
 * Pesquisa fotos de alta qualidade do mesmo produto na internet (Open Food Facts + Wikimedia Commons + Gemini)
 * retornando de 6 a 8 imagens para escolha do usuário.
 */
export const pesquisarFotosProdutoNaInternet = async (
  termo: string,
  codigoBarras?: string
): Promise<FotoResultadoInternet[]> => {
  const fotos: FotoResultadoInternet[] = [];
  const urlsVistas = new Set<string>();

  const registrarFoto = (url: string, titulo: string, fonte: string) => {
    if (!url || typeof url !== 'string') return;
    const limpa = url.trim();
    if (!limpa.startsWith('http://') && !limpa.startsWith('https://')) return;
    if (urlsVistas.has(limpa)) return;
    // Ignora arquivos que não sejam imagens padrão de produto
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

  const termoLimpo = termo.trim();

  // 1. Consulta Open Food Facts (perfeito para alimentos, bebidas, cosméticos e itens de varejo)
  try {
    const termoOFF = codigoBarras?.trim() || termoLimpo;
    const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(termoOFF)}&search_simple=1&action=process&json=1&page_size=8`;
    const controllerOFF = new AbortController();
    const timeoutOFF = setTimeout(() => controllerOFF.abort(), 4500);

    const resOFF = await fetch(offUrl, { signal: controllerOFF.signal });
    clearTimeout(timeoutOFF);

    if (resOFF.ok) {
      const dataOFF = await resOFF.json();
      const produtos = dataOFF?.products || [];
      for (const p of produtos) {
        const img = p.image_front_url || p.image_url || p.image_front_small_url || p.image_small_url;
        if (img) {
          registrarFoto(img, p.product_name || p.generic_name || termoLimpo, 'Open Food Facts');
        }
      }
    }
  } catch (err) {
    console.warn('Aviso: Erro ao consultar Open Food Facts:', err);
  }

  // 2. Consulta Wikimedia Commons (fotos públicas de marcas, produtos e artigos globais em alta resolução)
  try {
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(termoLimpo)}&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=800&format=json&origin=*`;
    const controllerWiki = new AbortController();
    const timeoutWiki = setTimeout(() => controllerWiki.abort(), 4500);

    const resWiki = await fetch(wikiUrl, { signal: controllerWiki.signal });
    clearTimeout(timeoutWiki);

    if (resWiki.ok) {
      const dataWiki = await resWiki.json();
      const paginas = Object.values(dataWiki?.query?.pages || {});
      for (const p of paginas as any[]) {
        const info = p.imageinfo?.[0];
        const img = info?.thumburl || info?.url;
        if (img) {
          const tit = (p.title || '').replace(/^File:/i, '').replace(/\.[^/.]+$/, '');
          registrarFoto(img, tit, 'Wikimedia');
        }
      }
    }
  } catch (err) {
    console.warn('Aviso: Erro ao consultar Wikimedia Commons:', err);
  }

  // 3. Consulta Inteligente com Google Gemini (para encontrar fotos adicionais de e-commerce e catálogo)
  const apiKey = getGeminiApiKey();
  if (apiKey && fotos.length < 8) {
    try {
      const promptBuscaFotos = `
Você é um especialista em catálogo de produtos e bancos de imagens na internet.
Encontre ou sugira URLs públicas reais e ativas de fotos em boa qualidade do produto: "${termoLimpo}".
Retorne EXCLUSIVAMENTE um objeto JSON no formato:
{
  "fotos": [
    { "url": "https://...", "titulo": "Nome descritivo da imagem" }
  ]
}
Apenas URLs válidas no formato JPG, PNG ou WEBP.
`;
      const requestBody = {
        contents: [{ parts: [{ text: promptBuscaFotos }] }],
        generationConfig: { temperature: 0.2, response_mime_type: 'application/json' }
      };

      const resData = await executarRequisicaoGemini(apiKey, requestBody);
      const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const jsonLimpo = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonLimpo);
        if (Array.isArray(parsed.fotos)) {
          for (const f of parsed.fotos) {
            if (f.url) registrarFoto(f.url, f.titulo || termoLimpo, 'Web / E-commerce');
          }
        }
      }
    } catch (err) {
      console.warn('Aviso: Consulta de fotos via Gemini:', err);
    }
  }

  // Retorna entre 6 a 8 fotos prioritárias
  return fotos.slice(0, 8);
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
}): Promise<ProdutoSugeridoIA> => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não configurada. Configure sua chave Gemini nas configurações.');
  }

  const promptAtualizacao = `
Você é um especialista em catálogo de produtos, copywriting comercial e precificação de varejo no Brasil.
O lojista possui um produto já cadastrado e solicitou a ATUALIZAÇÃO E ENRIQUECIMENTO INTELIGENTE deste item.

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
