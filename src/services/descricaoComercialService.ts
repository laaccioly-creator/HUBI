import { supabase } from '../lib/supabase';
import { Loja } from '../types';
import {
  calcularScoreEstritoModeloJev,
  criarChaveCacheEscopada,
  type EntradaCacheSessao,
  lerCacheHibridoSessao,
  salvarCacheHibridoSessao,
} from './catalogJevService';
import { buscarEspecificacoesProdutoSerper } from './serpApiService';

export type CanalDescricaoComercial = 'cadastro' | 'mercado_livre' | 'shopee';

export interface AtributoTecnicoDescricao {
  nome: string;
  valor: string;
}

export interface ParametrosDescricaoComercialProfissional {
  nome: string;
  marca?: string | null;
  modelo?: string | null;
  categoriaNome?: string | null;
  descricaoAtual?: string | null;
  codigoBarras?: string | null;
  atributosTecnicos?: AtributoTecnicoDescricao[];
  pesoKg?: number | null;
  alturaCm?: number | null;
  larguraCm?: number | null;
  comprimentoCm?: number | null;
  segmentoLoja?: string | null;
  loja?: (Partial<Loja> & { id?: string; serper_api_key?: string | null; segmento?: string | null; sobre_loja?: string | null }) | null;
  canal?: CanalDescricaoComercial;
  forcarRegeneracao?: boolean;
}

const TAMANHO_MINIMO_DESCRICAO_EXISTENTE = 350;
const TAMANHO_ALVO_MIN = 900;
const TAMANHO_ALVO_MAX = 2200;
const TIMEOUT_GEMINI_DESCRICAO_MS = 18000;

const FRASES_GENERICAS_PROIBIDAS: RegExp[] = [
  /equipamento\/produto selecionado/i,
  /produto selecionado com alto padr[aã]o de qualidade/i,
  /alto padr[aã]o de qualidade,\s*desempenho confi[aá]vel/i,
  /qualidade garantida para o seu dia a dia/i,
  /solu[cç][aã]o completa e versátil para diversas necessidades/i,
  /ideal para quem busca praticidade,\s*efici[eê]ncia e durabilidade/i,
];

const cacheDescricaoProfissionalMemoria = new Map<string, EntradaCacheSessao<string>>();

/**
 * Sanitiza uma descrição comercial para texto puro (`plain_text`) compatível com
 * Mercado Livre e Shopee, removendo HTML, marcações Markdown e excesso de quebras.
 */
export function sanitizarDescricaoPlainText(texto: string): string {
  if (!texto || !texto.trim()) return '';

  let limpo = texto
    .replace(/\r\n/g, '\n')
    // Remove blocos markdown de código mantendo o conteúdo
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    // Remove tags HTML caso algum retorno inclua
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    // Remove negrito/itálico/títulos markdown
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();

  if (
    (limpo.startsWith('"') && limpo.endsWith('"')) ||
    (limpo.startsWith("'") && limpo.endsWith("'"))
  ) {
    limpo = limpo.slice(1, -1).trim();
  }

  // Padroniza marcadores de lista e cabeçalhos oficiais
  limpo = limpo
    .replace(/^[ \t]*[\*]\s+/gm, '• ')
    .replace(/^[ \t]*principais diferenciais\s*:?\s*$/gim, 'PRINCIPAIS DIFERENCIAIS:')
    .replace(/^[ \t]*especifica[cç][oõ]es t[eé]cnicas\s*:?\s*$/gim, 'ESPECIFICAÇÕES TÉCNICAS:')
    .replace(/^[ \t]*conte[uú]do da embalagem\s*:?\s*$/gim, 'CONTEÚDO DA EMBALAGEM:')
    .replace(/^[ \t]*garantia e envio\s*:?\s*$/gim, 'GARANTIA E ENVIO:')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return limpo;
}

/**
 * Avalia se a descrição atual precisa ser regenerada com IA:
 * menor que 350 caracteres ou contendo chavões genéricos sem ficha técnica real.
 */
export function descricaoEhGenericaOuCurta(descricao?: string | null): boolean {
  const limpa = sanitizarDescricaoPlainText(descricao || '');
  if (!limpa || limpa.length < TAMANHO_MINIMO_DESCRICAO_EXISTENTE) {
    return true;
  }

  const contemFraseGenerica = FRASES_GENERICAS_PROIBIDAS.some((regex) => regex.test(limpa));
  if (contemFraseGenerica) {
    return true;
  }

  return false;
}

function extrairTextoRespostaGeminiProxy(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const candidatos = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
  if (!Array.isArray(candidatos) || candidatos.length === 0) return '';
  const parts = candidatos[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .join('')
    .trim();
}

function ajustarLimiteMaximoPlainText(texto: string, limiteMax = TAMANHO_ALVO_MAX): string {
  if (texto.length <= limiteMax) return texto;

  const blocoGarantia = [
    'GARANTIA E ENVIO:',
    '• Produto novo, original e com nota fiscal.',
    '• Envio rápido e seguro com embalagem reforçada.',
    '• Suporte pós-venda dedicado para tirar qualquer dúvida.',
  ].join('\n');

  const idxGarantia = texto.search(/\n\nGARANTIA E ENVIO:/i);
  const rodape = idxGarantia >= 0 ? texto.slice(idxGarantia).trim() : blocoGarantia;
  const corpo = idxGarantia >= 0 ? texto.slice(0, idxGarantia).trim() : texto;

  const espacoCorpo = limiteMax - rodape.length - 2;
  if (espacoCorpo <= 400) {
    const corte = texto.slice(0, limiteMax);
    const ultimaQuebra = corte.lastIndexOf('\n');
    return (ultimaQuebra > 600 ? corte.slice(0, ultimaQuebra) : corte).trim();
  }

  let corpoCortado = corpo.slice(0, espacoCorpo);
  const ultimaQuebra = corpoCortado.lastIndexOf('\n');
  if (ultimaQuebra > Math.floor(espacoCorpo * 0.7)) {
    corpoCortado = corpoCortado.slice(0, ultimaQuebra);
  }
  return `${corpoCortado.trim()}\n\n${rodape}`.trim();
}

async function invocarGeminiDescricao(
  prompt: string,
  lojaId?: string,
  systemText?: string
): Promise<string> {
  const requestBody: Record<string, unknown> = {
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 1600,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const requisicao = supabase.functions.invoke('gemini-proxy', {
    body: {
      model: 'gemini-3.8-flash',
      action: 'generateContent',
      ...(lojaId ? { loja_id: lojaId } : {}),
      requestBody,
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Tempo limite excedido ao gerar descrição via IA.')), TIMEOUT_GEMINI_DESCRICAO_MS)
  );

  const { data, error } = await Promise.race([requisicao, timeoutPromise]);
  if (error) {
    throw new Error(error.message || 'Falha ao consultar serviço de IA.');
  }

  return sanitizarDescricaoPlainText(extrairTextoRespostaGeminiProxy(data));
}

function montarListaAtributosParaPrompt(params: ParametrosDescricaoComercialProfissional): string[] {
  const linhas: string[] = [];
  const marcaLimpa = (params.marca || '').trim();
  const modeloLimpo = (params.modelo || '').trim();

  if (marcaLimpa && !/^gen[eé]rico$/i.test(marcaLimpa)) {
    linhas.push(`- Marca: ${marcaLimpa}`);
  }
  if (modeloLimpo && !/^padr[aã]o$/i.test(modeloLimpo)) {
    linhas.push(`- Modelo: ${modeloLimpo}`);
  }
  if (params.codigoBarras && params.codigoBarras.trim()) {
    linhas.push(`- Código EAN/GTIN: ${params.codigoBarras.trim()}`);
  }

  if (Array.isArray(params.atributosTecnicos)) {
    for (const attr of params.atributosTecnicos) {
      const nomeAttr = (attr.nome || '').trim();
      const valorAttr = (attr.valor || '').trim();
      if (!nomeAttr || !valorAttr) continue;
      if (/^(marca|brand|modelo|model|gtin|ean|condi[cç][aã]o|item_condition)$/i.test(nomeAttr)) {
        continue;
      }
      linhas.push(`- ${nomeAttr}: ${valorAttr}`);
    }
  }

  const dims: string[] = [];
  if (params.alturaCm && params.alturaCm > 0) dims.push(`${params.alturaCm} cm (A)`);
  if (params.larguraCm && params.larguraCm > 0) dims.push(`${params.larguraCm} cm (L)`);
  if (params.comprimentoCm && params.comprimentoCm > 0) dims.push(`${params.comprimentoCm} cm (C)`);
  if (dims.length > 0) {
    linhas.push(`- Dimensões aproximadas da embalagem: ${dims.join(' x ')}`);
  }
  if (params.pesoKg && params.pesoKg > 0) {
    linhas.push(`- Peso aproximado: ${params.pesoKg} kg`);
  }

  return linhas.slice(0, 14);
}

/**
 * Gerador unificado de descrição comercial profissional (`plain_text` escaneável entre 900 e 2.200 caracteres)
 * para Cadastro do Rubi, Mercado Livre e Shopee, combinando ficha interna + pesquisa web (Serper + JEV) + Gemini.
 */
export async function gerarDescricaoComercialProfissional(
  params: ParametrosDescricaoComercialProfissional
): Promise<string> {
  const nomeLimpo = (params.nome || '').trim();
  if (!nomeLimpo) {
    throw new Error('Informe o nome do produto para gerar a descrição comercial profissional.');
  }

  const marcaLimpa = (params.marca || '').trim();
  const modeloLimpo = (params.modelo || '').trim();
  const canal = params.canal || 'cadastro';
  const segmentoLojaObj = (
    params.loja as
      | { configuracoes_extras?: { perfil_negocio?: { segmento?: string } }; segmento?: string | null }
      | null
      | undefined
  );
  const segmento = (
    params.segmentoLoja ||
    segmentoLojaObj?.configuracoes_extras?.perfil_negocio?.segmento ||
    segmentoLojaObj?.segmento ||
    ''
  ).trim();

  const chaveCache = criarChaveCacheEscopada(
    'hubi_descricao_profissional_v1',
    `${nomeLimpo}::${marcaLimpa}::${modeloLimpo}::${canal}`,
    params.loja?.id
  );

  if (!params.forcarRegeneracao) {
    const emCache = lerCacheHibridoSessao(cacheDescricaoProfissionalMemoria, chaveCache);
    if (emCache && !descricaoEhGenericaOuCurta(emCache)) {
      return emCache;
    }
  }

  // Pesquisa especificações reais na web via Serper.dev + filtro JEV para evitar alucinações de outros modelos
  const termoBusca = [nomeLimpo, marcaLimpa, modeloLimpo]
    .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx)
    .join(' ')
    .trim();

  let snippetsValidados: string[] = [];
  try {
    const resultadosWeb = await buscarEspecificacoesProdutoSerper(termoBusca, params.loja);
    const filtrados = resultadosWeb
      .map((item) => {
        const avaliacao = calcularScoreEstritoModeloJev(nomeLimpo, `${item.titulo} ${item.snippet}`);
        return { item, score: avaliacao.penalizado ? 0 : avaliacao.score };
      })
      .filter((entry) => entry.score >= 30 || entry.item.fonte === 'Google Knowledge Graph')
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    snippetsValidados = filtrados.map(
      ({ item }) => `[${item.fonte}] ${item.titulo}: ${item.snippet}`.slice(0, 320)
    );
  } catch {
    snippetsValidados = [];
  }

  const atributosEstruturados = montarListaAtributosParaPrompt(params);
  const descricaoAtualLimpa = sanitizarDescricaoPlainText(params.descricaoAtual || '').slice(0, 900);

  const contextoSistema = segmento
    ? `Você é um redator especialista em e-commerce brasileiro (Mercado Livre e Shopee) atuando para uma loja do segmento "${segmento}".`
    : 'Você é um redator especialista em e-commerce brasileiro (Mercado Livre e Shopee) focado em descrições técnicas de alta conversão.';

  const blocoContexto = [
    `PRODUTO: "${nomeLimpo}"`,
    marcaLimpa ? `MARCA INFORMADA: "${marcaLimpa}"` : '',
    modeloLimpo ? `MODELO INFORMADO: "${modeloLimpo}"` : '',
    params.categoriaNome ? `CATEGORIA: "${params.categoriaNome}"` : '',
    segmento ? `SEGMENTO DA LOJA: "${segmento}"` : '',
    atributosEstruturados.length > 0
      ? `DADOS TÉCNICOS CONFIRMADOS NO SISTEMA:\n${atributosEstruturados.join('\n')}`
      : '',
    snippetsValidados.length > 0
      ? `ESPECIFICAÇÕES COLETADAS NA WEB (use apenas fatos compatíveis com o modelo exato "${nomeLimpo}"):\n${snippetsValidados.join('\n')}`
      : '',
    descricaoAtualLimpa && !FRASES_GENERICAS_PROIBIDAS.some((r) => r.test(descricaoAtualLimpa))
      ? `INFORMAÇÕES EXISTENTES NO CADASTRO DO LOJISTA (preserve fatos válidos):\n"${descricaoAtualLimpa}"`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const instrucoesLayout = `Gere uma descrição comercial profissional em TEXTO PURO (plain_text) em português do Brasil (pt-BR), entre ${TAMANHO_ALVO_MIN} e ${TAMANHO_ALVO_MAX} caracteres (alvo ideal: 1.250 a 1.850 caracteres), seguindo EXATAMENTE esta estrutura e títulos de seção:

[TÍTULO DE IMPACTO DO PRODUTO + PRINCIPAL BENEFÍCIO em letra maiúscula]

[Parágrafo introdutório claro e objetivo com 3 a 4 linhas explicando para quem o produto é ideal e qual problema ele resolve no dia a dia.]

PRINCIPAIS DIFERENCIAIS:
• [Benefício técnico 1 explicado na prática com 1 a 2 frases]
• [Benefício técnico 2 explicado na prática com 1 a 2 frases]
• [Benefício técnico 3 explicado na prática com 1 a 2 frases]
• [Benefício técnico 4 explicado na prática com 1 a 2 frases]

ESPECIFICAÇÕES TÉCNICAS:
- Marca: ${marcaLimpa || '[Marca real identificada ou Informe conforme fabricante]'}
- Modelo: ${modeloLimpo || '[Modelo exato do produto]'}
- [Especificação real 1 confirmada nas fontes/atributos]
- [Especificação real 2 confirmada nas fontes/atributos]
- [Especificação real 3 confirmada nas fontes/atributos]
- [Outras especificações técnicas reais confirmadas, como voltagem, resolução, material, conexões ou dimensões]

CONTEÚDO DA EMBALAGEM:
• 01 ${nomeLimpo}
• [Acessórios originais confirmados, ou omita itens não confirmados mantendo precisão]

GARANTIA E ENVIO:
• Produto novo, original e com nota fiscal.
• Envio rápido e seguro com embalagem reforçada.
• Suporte pós-venda dedicado para tirar qualquer dúvida.

REGRAS ESTRITAS (NÃO VIOLE):
1. Retorne SOMENTE texto puro (plain_text). PROIBIDO usar tags HTML (<p>, <br>, <b>), PROIBIDO usar Markdown (**, ##, __, crases) e PROIBIDO colocar links, telefones, WhatsApp ou endereços.
2. PROIBIDO usar frases genéricas vazias como "equipamento/produto selecionado com alto padrão de qualidade, desempenho confiável e excelente custo-benefício" ou chavões sem substância.
3. NÃO invente especificações numéricas falsas (voltagem, watts, polegadas, mAh) se não estiverem confirmadas no nome do produto, nos dados do sistema ou nos trechos web acima. Se alguma especificação secundária não estiver confirmada, foque em atributos verificáveis da categoria/modelo sem mentir números.
4. Garanta que o resultado final tenha no mínimo ${TAMANHO_ALVO_MIN} caracteres e no máximo ${TAMANHO_ALVO_MAX} caracteres.
5. Não escreva preâmbulos ("Aqui está a descrição:") nem explicações fora do texto da descrição.`;

  let textoGerado = await invocarGeminiDescricao(
    `${blocoContexto}\n\n${instrucoesLayout}`,
    params.loja?.id,
    contextoSistema
  );

  if (!textoGerado) {
    throw new Error('Não foi possível gerar a descrição comercial com IA no momento.');
  }

  // Se veio abaixo de 850 caracteres, solicita uma segunda passagem de expansão mantendo o layout plain_text
  if (textoGerado.length < 850) {
    try {
      const promptExpansao = `Expanda e enriqueça a descrição abaixo para que ela fique entre 1.150 e 1.850 caracteres em TEXTO PURO (plain_text), mantendo EXATAMENTE as mesmas seções (título de impacto, parágrafo introdutório, PRINCIPAIS DIFERENCIAIS:, ESPECIFICAÇÕES TÉCNICAS:, CONTEÚDO DA EMBALAGEM: e GARANTIA E ENVIO:), sem HTML, sem Markdown (** ou ##), sem links e sem inventar dados técnicos falsos:\n\n${blocoContexto}\n\nRASCUNHO ATUAL (${textoGerado.length} caracteres):\n${textoGerado}`;
      const textoExpandido = await invocarGeminiDescricao(
        promptExpansao,
        params.loja?.id,
        contextoSistema
      );
      if (textoExpandido.length > textoGerado.length) {
        textoGerado = textoExpandido;
      }
    } catch {
      // Mantém a versão obtida na primeira chamada
    }
  }

  textoGerado = ajustarLimiteMaximoPlainText(textoGerado, TAMANHO_ALVO_MAX);

  if (!descricaoEhGenericaOuCurta(textoGerado)) {
    salvarCacheHibridoSessao(cacheDescricaoProfissionalMemoria, chaveCache, textoGerado);
  }

  return textoGerado;
}

/**
 * Verifica se a descrição existente atende ao padrão profissional (>= 350 chars e não genérica).
 * Caso negativo, gera e retorna a descrição profissional unificada pronta para Mercado Livre / Shopee.
 */
export async function garantirDescricaoProfissionalMarketplace(
  params: ParametrosDescricaoComercialProfissional
): Promise<{ descricao: string; foiEnriquecida: boolean }> {
  const atualSanitizada = sanitizarDescricaoPlainText(params.descricaoAtual || '');

  if (!params.forcarRegeneracao && !descricaoEhGenericaOuCurta(atualSanitizada)) {
    return {
      descricao: atualSanitizada,
      foiEnriquecida: false,
    };
  }

  try {
    const gerada = await gerarDescricaoComercialProfissional(params);
    if (gerada && gerada.trim().length >= 350) {
      return {
        descricao: gerada,
        foiEnriquecida: true,
      };
    }
  } catch (err) {
    console.warn(
      '[descricaoComercialService] Aviso ao enriquecer descrição para marketplace:',
      err instanceof Error ? err.message : err
    );
  }

  return {
    descricao: atualSanitizada,
    foiEnriquecida: false,
  };
}
