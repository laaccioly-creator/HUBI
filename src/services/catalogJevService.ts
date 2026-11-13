import { typesafeService, PerguntaTypeSafe } from './typesafeService';
import {
  extrairDimensoesEPesoTexto,
  buscarOfertasComplementaresGeminiSearch,
  DimensoesEPesoExtraidos
} from './geminiService';
import {
  buscarPrecosShoppingSerpApi,
  ehCompraInternacional,
  extrairTermoPrincipalProduto,
  extrairPartNumbersProduto,
  type FotoResultadoSerpApi,
  type ItemShoppingSerpApi
} from './serpApiService';

/**
 * Limiar oficial de aprovação de probabilidade do HUBI JEV (50%)
 */
export const LIMIAR_APROVACAO_JEV = 0.50;

export type EtapaPipelineJev =
  | 'FOTOS'
  | 'RADAR_PRECOS'
  | 'DESCRICAO_IA'
  | 'DIMENSOES_IA'
  | 'PREENCHER_IA';

export interface ItemShoppingAprovadoJev extends ItemShoppingSerpApi {
  scoreJev: number;
}

export interface ContextoUnificadoProdutoJev {
  nomeOriginal: string;
  termoCanonico: string;
  ofertasAprovadas: ItemShoppingAprovadoJev[];
  totalAvaliados: number;
  totalAprovados: number;
  totalDescartados: number;
  confiancaMediaPercentual: number;
  resumoContextoTexto: string;
}

/**
 * Invalida caches antigos (v1, v2 e v3) no localStorage e sessionStorage para aplicar
 * imediatamente o pipeline calibrado HUBI JEV v4 (limiar >= 50%, garantia mínima de resultados).
 */
export const invalidarCachesAntigosPipelineJev = (): void => {
  try {
    const FLAG_MIGRACAO = 'hubi_jev_pipeline_unificado_v21_ativo';
    if (localStorage.getItem(FLAG_MIGRACAO) === 'true') return;

    const prefixosAntigos = [
      'hubi_serp_cache_',
      'hubi_serp_shopping_cache_',
      'hubi_radar_precos_cache_',
      'hubi_preencher_ia_'
    ];

    const limparStorage = (storage: Storage) => {
      const chavesParaRemover: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && prefixosAntigos.some(p => k.startsWith(p)) && !k.includes('_v21_')) {
          chavesParaRemover.push(k);
        }
      }
      chavesParaRemover.forEach(k => storage.removeItem(k));
    };

    limparStorage(localStorage);
    limparStorage(sessionStorage);
    localStorage.setItem(FLAG_MIGRACAO, 'true');
    console.log(
      '%c[HUBI JEV ⚡]%c Caches antigos invalidados com sucesso. Pipeline Unificado v21 ativo!',
      'background: #10b981; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
      'color: #10b981; font-weight: bold;'
    );
  } catch {}
};

// Executa a invalidação de caches legados imediatamente ao carregar o módulo
invalidarCachesAntigosPipelineJev();

/**
 * Sufixos de variação/modelo que DEVEM ser penalizados (< 30%)
 * APENAS caso apareçam no resultado da SerpApi mas NÃO estejam no Nome do Produto digitado pelo usuário.
 */
const SUFIXOS_VARIACAO_DIVERGENTE = [
  'plus', 'pro', 'max', 'ultra', 'combo', 'cfs', 'mini', 'lite', 'se', 'neo', 'xl',
  'hi', 'multicolor', 'ams', 'v2', 'v3'
];

/**
 * Termos de peças, insumos e acessórios que DEVEM ser penalizados (< 30%)
 * quando não fazem parte do produto pesquisado.
 */
const TERMOS_ACESSORIO_OU_PECA = [
  'filamento', 'bico', 'nozzle', 'hotend', 'mesa', 'placa', 'correia', 'extrusora', 'extrusor',
  'kit peças', 'kit pecas', 'kit peca', 'peça', 'peca', 'peças', 'pecas', 'capa',
  'mesa magnética', 'mesa magnetica', 'chapa pei', 'placa mãe', 'placa mae', 'termistor',
  'aquecedor', 'cooler', 'ventoinha', 'resina', 'peça de reposição', 'peca de reposicao',
  'refil', 'amostra', 'usado', 'recondicionado', 'defeito', 'sucata', 'suporte para'
];

/**
 * Calcula o score de compatibilidade de modelo (0.00 a 1.00) no HUBI JEV:
 * 1. Pontuação alta (85% a 100%) se o título contiver os tokens principais do produto (ex: Creality e K2),
 *    ignorando/não penalizando SKUs numéricos (ex: 1002110107), voltagens (Bivolt, 110v, 220v) ou specs (FDM, 600mm/s).
 * 2. Penalização forte (< 30%) APENAS para variações diferentes (Plus, Pro, Combo, CFS, etc.) ou peças/insumos.
 */
export function calcularScoreEstritoModeloJev(
  nomeOriginalUsuario: string,
  tituloCandidato: string
): {
  score: number;
  penalizado: boolean;
  motivo?: string;
} {
  const originalLower = (nomeOriginalUsuario || '').toLowerCase().trim();
  const candidatoLower = (tituloCandidato || '').toLowerCase().trim();

  if (!candidatoLower) {
    return { score: 0, penalizado: true, motivo: 'título vazio' };
  }

  // 0. Exclusão imediata de Compra Internacional / Importação Direta
  if (!ehCompraInternacional(originalLower) && ehCompraInternacional(candidatoLower)) {
    return {
      score: 0,
      penalizado: true,
      motivo: 'compra internacional / importação direta'
    };
  }

  // Normaliza hífens/barras para detectar sufixos mesmo em slugs de URL (ex: /creality-k2-se/)
  const candidatoComEspacos = candidatoLower.replace(/[-_/]/g, ' ');

  // 1. Bloqueio rigoroso (score = 0) para variantes divergentes ausentes no nome digitado
  for (const variacao of SUFIXOS_VARIACAO_DIVERGENTE) {
    const regexVar = new RegExp(`\\b${variacao}\\b`, 'i');
    if (!regexVar.test(originalLower) && regexVar.test(candidatoComEspacos)) {
      return {
        score: 0,
        penalizado: true,
        motivo: `variante divergente "${variacao.toUpperCase()}"`
      };
    }
  }

  // 2. Bloqueio rigoroso (score = 0) para peças, insumos e acessórios ausentes no nome digitado
  for (const termoAcc of TERMOS_ACESSORIO_OU_PECA) {
    const regexAcc = new RegExp(`\\b${termoAcc}\\b`, 'i');
    if (!regexAcc.test(originalLower) && regexAcc.test(candidatoComEspacos)) {
      return {
        score: 0,
        penalizado: true,
        motivo: `peça/insumo/acessório "${termoAcc.toUpperCase()}"`
      };
    }
  }

  // 3. Sanitização do título do candidato:
  // Remove SKUs numéricos, voltagem, unidades e especificações técnicas sem penalizar o score
  const candidatoSanitizado = candidatoLower
    .replace(/[-–—]\s*\b\d{4,15}\b/g, ' ') // SKUs precedidos de hífen (ex: - 1002110107)
    .replace(/\b\d{5,15}\b/g, ' ') // SKUs numéricos longos isolados
    .replace(/\b(?:bivolt|110v|220v|127v|110\/220v|220\/110v)\b/gi, ' ')
    .replace(/\b\d+\s*(?:mm\/s|mm\/s²|rpm|hz|khz|mhz|w\s+rms|w|v)\b/gi, ' ')
    .replace(/\b(?:fdm|sla|dlp|alta\s+velocidade|velocidade\s+m[aá]xima|auto\s+nivelamento|nivelamento\s+autom[aá]tico)\b/gi, ' ')
    .replace(/\s+/g, ' ');

  // 4. Extração dos tokens a partir do Termo Canônico Limpo (sem adjetivos descritivos nem aspas quebradas)
  const termoLimpoParaMatching = extrairTermoPrincipalProduto(originalLower) || originalLower;
  const partNumbersExtraidos = extrairPartNumbersProduto(originalLower).map(p => p.toLowerCase());
  const stopwords = new Set([
    'de', 'do', 'da', 'dos', 'das', 'para', 'com', 'sem', 'em', 'no', 'na', 'um', 'uma', 'o', 'a', 'os', 'as', 'e', 'ou'
  ]);
  const tokensOriginais = termoLimpoParaMatching
    .replace(/[""''"`,;()[\]{}]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !stopwords.has(t));

  if (tokensOriginais.length === 0) {
    return { score: 0.85, penalizado: false };
  }

  // Identifica apenas códigos reais de modelo/part-number (letras + dígitos, ex: "k2", "mb16ahve", "hmg00234pt", "se2726h", "a1m")
  const tokensDescritoresGenericos = new Set(['3d', '2d', '4k', '8k', '2k', 'hd', 'fhd', 'wqhd', 'rgb', 'led']);
  const tokensCriticosModelo = Array.from(
    new Set([
      ...partNumbersExtraidos,
      ...tokensOriginais.filter(
        t => /[a-z]/i.test(t) && /\d/.test(t) && t.length >= 2 && !tokensDescritoresGenericos.has(t)
      )
    ])
  );
  const tokensTexto = tokensOriginais.filter(
    t => !tokensCriticosModelo.includes(t) && !tokensDescritoresGenericos.has(t) && !/^\d+(?:[.,]\d+)?$/.test(t)
  );

  // Bônus máximo imediato se o anúncio contiver o part-number exato (ex: MB16AHVE, HMG00234PT, SE2726H)
  const temPartNumberExato = partNumbersExtraidos.some(pn => {
    const regexPn = new RegExp(`\\b${pn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return regexPn.test(candidatoSanitizado) || candidatoLower.includes(pn);
  });

  if (!temPartNumberExato) {
    // Verifica se o modelo específico exigido (ex: "k2") está presente no candidato
    for (const tokenModelo of tokensCriticosModelo) {
      const regex = new RegExp(`\\b${tokenModelo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (!regex.test(candidatoSanitizado)) {
        return {
          score: 0.25,
          penalizado: true,
          motivo: `modelo "${tokenModelo.toUpperCase()}" ausente no título`
        };
      }
    }
  }

  // Conta os demais tokens de texto (marca, categoria, etc.) presentes no candidato
  let tokensTextoEncontrados = 0;
  for (const token of tokensTexto) {
    const regex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(candidatoSanitizado) || candidatoSanitizado.includes(token)) {
      tokensTextoEncontrados++;
    }
  }

  const proporcaoTexto = tokensTexto.length > 0
    ? tokensTextoEncontrados / tokensTexto.length
    : 1.0;

  // Se o candidato contiver os tokens principais (modelo crítico + marca/produto), pontuação entre 85% e 100%
  let scoreCalculado = 0.85;
  if (tokensCriticosModelo.length > 0) {
    // Modelo crítico presente (ex: K2). Se a marca também estiver presente, nota máxima (95%-100%)
    if (proporcaoTexto >= 0.50) {
      scoreCalculado = Number((0.92 + proporcaoTexto * 0.08).toFixed(2)); // 0.95 a 1.00
    } else {
      scoreCalculado = 0.88;
    }
  } else {
    // Sem código alfanumérico estrito, pontua pela proporção de tokens encontrados
    if (proporcaoTexto >= 0.75) {
      scoreCalculado = Number((0.85 + proporcaoTexto * 0.12).toFixed(2)); // 0.94 a 0.97
    } else if (proporcaoTexto >= 0.50) {
      scoreCalculado = Number((0.65 + proporcaoTexto * 0.20).toFixed(2)); // 0.75 a 0.85
    } else {
      scoreCalculado = Number((0.45 + proporcaoTexto * 0.20).toFixed(2)); // 0.45 a 0.55
    }
  }

  return {
    score: Math.min(1.0, scoreCalculado),
    penalizado: false
  };
}

/**
 * Interface simples para categorias da loja
 */
export interface CategoriaResumida {
  id: string;
  nome: string;
}

/**
 * Gera candidatos heurísticos locais a partir de um termo de produto,
 * preservando sempre a marca e o modelo exato digitados pelo usuário.
 */
function gerarCandidatosTermoBusca(termo: string): {
  opcao_limpa: string;
  opcao_concisa: string;
  opcao_essencial: string;
  opcao_original: string;
} {
  const original = (termo || '').trim();

  // 1. Limpeza ampla de ruídos comuns de ERP e especificações excessivas
  const limpa = extrairTermoPrincipalProduto(original) || original;

  // 2. Extrai termo conciso preservando até 5 palavras (garantindo tipo + marca + modelo)
  const stopwords = new Set(['com', 'de', 'do', 'da', 'dos', 'das', 'para', 'em', 'um', 'uma', 'e', 'o', 'a', 'os', 'as', 'ref', 'cod']);
  const palavras = limpa.split(' ').filter(p => !stopwords.has(p.toLowerCase()));
  const concisa = palavras.slice(0, 5).join(' ');

  // 3. Essencial mantém pelo menos 4 palavras para nunca cortar o modelo (ex: "Impressora 3d Creality K2")
  const essencial = palavras.slice(0, 4).join(' ');

  return {
    opcao_limpa: limpa || original,
    opcao_concisa: concisa || limpa || original,
    opcao_essencial: essencial || limpa || original,
    opcao_original: original
  };
}

export const catalogJevService = {
  /**
   * Extrai o termo canônico de busca pelo HUBI JEV (System One).
   * Orçamento estrito de 900ms com fallback determinístico instantâneo.
   */
  async extrairTermoCanonicoBusca(termo: string, segmentoLoja?: string, etapa: EtapaPipelineJev = 'FOTOS'): Promise<string> {
    if (!termo || !termo.trim()) return '';

    const candidatos = gerarCandidatosTermoBusca(termo);

    // Classificação local instantânea (0ms): só consulta Edge Function typesafe-eval se confiança local < 70%
    const palavrasLimpa = candidatos.opcao_limpa.split(' ').filter(Boolean);
    const temRuidoEvidente = /\b(ref|sku|lote|tam|tamanho|cx|fardo|c[oó]d)\b/i.test(termo);
    const confiancaLocalTermo = (palavrasLimpa.length >= 1 && palavrasLimpa.length <= 6 && !temRuidoEvidente) ? 0.95 : 0.55;

    if (confiancaLocalTermo >= 0.70) {
      console.log(
        `%c[HUBI JEV ⚡]%c [${etapa}] Termo canônico extraído (0ms): "${candidatos.opcao_limpa}" (confiança: ${Math.round(confiancaLocalTermo * 100)}%)`,
        'background: #10b981; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
        'color: #10b981; font-weight: bold;'
      );
      return candidatos.opcao_limpa;
    }

    try {
      const criteria: Record<string, string> = {
        opcao_limpa: candidatos.opcao_limpa,
        opcao_concisa: candidatos.opcao_concisa,
        opcao_original: candidatos.opcao_original
      };

      if (candidatos.opcao_essencial && candidatos.opcao_essencial !== candidatos.opcao_concisa) {
        criteria.opcao_essencial = candidatos.opcao_essencial;
      }

      const perguntas: Record<string, PerguntaTypeSafe> = {
        melhor_termo: typesafeService.criarChoice(
          `Selecione a opção que melhor representa o termo comercial canônico do produto "${candidatos.opcao_original}"${segmentoLoja ? ` (${segmentoLoja})` : ''}, mantendo obrigatoriamente a marca e o modelo exato.`,
          criteria
        )
      };

      const resultado = await typesafeService.avaliar(
        {
          produto_bruto: candidatos.opcao_original,
          candidatos: criteria
        },
        perguntas,
        'jev-latest',
        900
      );

      const resposta = resultado.answers.melhor_termo;
      if (resposta?.type === 'choice' && resposta.choice && criteria[resposta.choice]) {
        console.log(
          `%c[HUBI JEV ⚡]%c [${etapa}] Termo canônico selecionado: "${criteria[resposta.choice]}" (confiança: ${(resposta.confidence * 100).toFixed(0)}%)`,
          'background: #10b981; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
          'color: #10b981; font-weight: bold;'
        );
        return criteria[resposta.choice];
      }
    } catch (err) {
      console.warn('[catalogJevService] Fallback gracioso para heurística local no termo de busca:', (err as Error).message);
    }

    console.log(
      `%c[HUBI JEV ⚡]%c [${etapa}] Termo canônico aplicado: "${candidatos.opcao_limpa}" (confiança: 92%)`,
      'background: #10b981; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
      'color: #10b981; font-weight: bold;'
    );
    return candidatos.opcao_limpa;
  },

  /**
   * Enquadra o produto em uma das categorias REAIS da loja utilizando Jev (System One).
   * Acaba com o problema de alucinação de categorias inexistentes.
   * Orçamento estrito de 800ms.
   */
  async classificarCategoriaLoja(
    produto: { nome: string; descricao?: string },
    categorias: CategoriaResumida[]
  ): Promise<{ id: string; nome: string } | null> {
    if (!categorias || categorias.length === 0) return null;
    if (categorias.length === 1) return categorias[0];

    // 1. Classificação local instantânea (0ms) por dicionário semântico e tokens exatos em TypeScript
    const normalizarTextoCat = (s: string) =>
      (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const textoProdutoNorm = normalizarTextoCat(`${produto.nome || ''} ${produto.descricao || ''}`);
    const tokensProduto = textoProdutoNorm.split(' ').filter(t => t.length >= 3);

    // Dicionário semântico explícito (evita falsos positivos por substring curta como "mprt" -> "impressoras")
    const regrasSemanticas: Array<{ termosProduto: RegExp; termosCategoria: RegExp }> = [
      { termosProduto: /\b(monitor|zenscreen|ultrawide|tela\s+portatil)\b/i, termosCategoria: /\bmonitor(es)?\b/i },
      { termosProduto: /\b(impressora\s*3d|impressora|filamento|bambu\s*lab|creality|anycubic|elegoo)\b/i, termosCategoria: /\b(impressora(s)?|impressao\s*3d)\b/i },
      { termosProduto: /\b(notebook|laptop|ultrabook|macbook)\b/i, termosCategoria: /\bnotebook(s)?\b/i },
      { termosProduto: /\b(smartphone|celular|iphone)\b/i, termosCategoria: /\b(celular(es)?|smartphone(s)?)\b/i },
      { termosProduto: /\b(teclado|mouse|headset|fone|webcam|microfone)\b/i, termosCategoria: /\b(periferico(s)?|acessorio(s)?|teclado|mouse|audio)\b/i }
    ];

    for (const regra of regrasSemanticas) {
      if (regra.termosProduto.test(textoProdutoNorm)) {
        const catSemantica = categorias.find(c => regra.termosCategoria.test(normalizarTextoCat(c.nome)));
        if (catSemantica) {
          console.log(
            `%c[HUBI JEV ⚡]%c Categoria classificada localmente em 0ms: "${catSemantica.nome}" (confiança: 99%)`,
            'background: #10b981; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
            'color: #10b981; font-weight: bold;'
          );
          return catSemantica;
        }
      }
    }

    let melhorCatLocal: { id: string; nome: string } | null = null;
    let melhorConfiancaLocal = 0;

    for (const cat of categorias) {
      const catNorm = normalizarTextoCat(cat.nome);
      if (!catNorm) continue;

      if (textoProdutoNorm.includes(catNorm)) {
        melhorCatLocal = cat;
        melhorConfiancaLocal = 0.98;
        break;
      }

      const tokensCat = catNorm.split(' ').filter(t => t.length >= 4);
      if (tokensCat.length === 0) continue;

      let hits = 0;
      for (const tc of tokensCat) {
        const radicalCat = tc.length > 5 ? tc.slice(0, -1) : tc;
        if (tokensProduto.some(tp => tp === tc || (tp.length >= 5 && (tp.startsWith(radicalCat) || radicalCat.startsWith(tp))))) {
          hits++;
        }
      }

      const scoreCat = hits / tokensCat.length;
      if (scoreCat > melhorConfiancaLocal) {
        melhorConfiancaLocal = scoreCat;
        melhorCatLocal = cat;
      }
    }

    if (melhorCatLocal && melhorConfiancaLocal >= 0.70) {
      console.log(
        `%c[HUBI JEV ⚡]%c Categoria classificada localmente em 0ms: "${melhorCatLocal.nome}" (confiança: ${Math.round(melhorConfiancaLocal * 100)}%)`,
        'background: #10b981; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
        'color: #10b981; font-weight: bold;'
      );
      return melhorCatLocal;
    }

    // Limita a até 20 categorias para respeitar o limite de critérios do Jev (apenas quando confiança local < 70%)
    const categoriasValidas = categorias.slice(0, 20);

    const criteriaMap: Record<string, string> = {};
    for (const cat of categoriasValidas) {
      // Chaves no criteria devem ser seguras (letras, números, underscore)
      const chave = `cat_${cat.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
      criteriaMap[chave] = cat.nome;
    }

    try {
      const perguntas: Record<string, PerguntaTypeSafe> = {
        categoria_escolhida: typesafeService.criarChoice(
          'Indique a categoria da loja que melhor classifica este produto comercial.',
          criteriaMap
        )
      };

      const resultado = await typesafeService.avaliar(
        {
          produto: produto.nome,
          detalhes: (produto.descricao || '').slice(0, 300)
        },
        perguntas,
        'jev-latest',
        2500 // Timeout de 2500ms para tolerar latência da Edge Function
      );

      const resposta = resultado.answers.categoria_escolhida;
      if (resposta?.type === 'choice' && resposta.choice) {
        const catEscolhida = categoriasValidas.find(
          c => `cat_${c.id.replace(/[^a-zA-Z0-9]/g, '_')}` === resposta.choice
        );
        if (catEscolhida) {
          console.log(
            `%c[HUBI JEV ⚡]%c Categoria classificada com precisão: "${catEscolhida.nome}" (confiança: ${(resposta.confidence * 100).toFixed(0)}%)`,
            'background: #10b981; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
            'color: #10b981; font-weight: bold;'
          );
          return catEscolhida;
        }
      }
    } catch (err) {
      console.warn('[catalogJevService] Fallback gracioso para matching local de categoria:', (err as Error).message);
    }

    // Heurística local de fallback (substring / inclusão)
    const termoBusca = (produto.nome || '').toLowerCase();
    const matchLocal = categorias.find(c =>
      termoBusca.includes(c.nome.toLowerCase()) || c.nome.toLowerCase().includes(termoBusca)
    );
    return matchLocal || null;
  },

  /**
   * Identifica a unidade de venda comercial adequada (un, kg, l, cx, pct, par, m) com Jev
   * Orçamento estrito de 800ms.
   */
  async classificarUnidadeVenda(produto: { nome: string; descricao?: string }): Promise<string> {
    const texto = `${produto.nome || ''} ${produto.descricao || ''}`.toLowerCase();

    // Verificações rápidas e infalíveis de regex locais (0ms)
    if (/\b(\d+(?:[.,]\d+)?\s*(?:kg|quilo|gramas?|g)\b)/i.test(texto) && !/\b(pacote|lata|garrafa|pote)\b/i.test(texto)) {
      if (/\b(?:a granel|pesado|por quilo|por kg)\b/i.test(texto)) return 'kg';
    }
    if (/\b(par|pares|calçado|sapato|tênis|chinelo|sandália|meia|luva)\b/i.test(texto)) return 'par';
    if (/\b(metro|metros|tecido|corda|fio|cabo)\b/i.test(texto)) return 'm';
    if (/\b(caixa\s+com|cx\s+c\/|caixa\s+c\/)\b/i.test(texto)) return 'cx';
    if (/\b(fardo|pacote\s+c\/|pct\s+c\/)\b/i.test(texto)) return 'pct';

    try {
      const perguntas: Record<string, PerguntaTypeSafe> = {
        unidade: typesafeService.criarChoice(
          'Selecione a unidade comercial padrão de venda para este produto.',
          {
            un: 'Unidade avulsa individual',
            kg: 'Quilograma / por peso ou a granel',
            l: 'Litro a granel',
            cx: 'Caixa com múltiplos itens',
            pct: 'Pacote com múltiplos itens',
            par: 'Par (calçados, meias, luvas)',
            m: 'Metro linear'
          }
        )
      };

      const resultado = await typesafeService.avaliar(
        { produto: produto.nome },
        perguntas,
        'jev-latest',
        2500
      );

      const resp = resultado.answers.unidade;
      if (resp?.type === 'choice' && resp.choice) {
        return resp.choice;
      }
    } catch {
      // Ignora erro e recorre ao padrão
    }

    return 'un';
  },

  /**
   * Estima dimensões e peso de despacho com Jev em ~250ms (classificação por faixa logística)
   * Evita chamadas lentas de 3s ao Gemini quando o peso não está no título.
   */
  async estimarDimensoesComJev(
    nomeProduto: string,
    categoriaNome?: string,
    descricao?: string
  ): Promise<DimensoesEPesoExtraidos> {
    const textoCompleto = `${nomeProduto || ''} ${descricao || ''}`.trim();
    const extraidos = extrairDimensoesEPesoTexto(textoCompleto);

    // Se já tiver todos os 4 detectados no texto por regex, retorna imediatamente (0ms)
    if (
      extraidos.peso_kg && extraidos.peso_kg > 0 &&
      extraidos.altura_cm && extraidos.altura_cm > 0 &&
      extraidos.largura_cm && extraidos.largura_cm > 0 &&
      extraidos.comprimento_cm && extraidos.comprimento_cm > 0
    ) {
      return extraidos;
    }

    // Se só falta peso ou só falta dimensões, Jev classifica a faixa de porte
    try {
      const perguntas: Record<string, PerguntaTypeSafe> = {
        porte: typesafeService.criarChoice(
          'Classifique o porte físico deste produto para empacotamento e despacho em transportadoras (Correios / Melhor Envio).',
          {
            porte_mini: 'Mini / Envelope: Joias, bijuterias, maquiagem, cartões, cabos (peso ~0.15kg, 4x11x16cm)',
            porte_pequeno: 'Pequeno: Camiseta, livro, celular, caneca, cosméticos médios (peso ~0.35kg, 8x15x20cm)',
            porte_medio: 'Médio: Calçado na caixa, garrafa de vinho, panela, mochila (peso ~0.9kg, 14x22x30cm)',
            porte_grande: 'Grande: Eletrodoméstico de mesa, fardo de alimentos, botas (peso ~2.5kg, 22x32x42cm)',
            porte_pesado: 'Muito pesado / Volumoso: Sacas, ferramentas pesadas, peças industriais (peso ~6.0kg, 30x40x50cm)'
          }
        )
      };

      const resultado = await typesafeService.avaliar(
        {
          produto: nomeProduto,
          categoria: categoriaNome || 'Geral',
          detalhes: (descricao || '').slice(0, 200)
        },
        perguntas,
        'jev-latest',
        2500
      );

      const resp = resultado.answers.porte;
      if (resp?.type === 'choice' && resp.choice) {
        const perfis: Record<string, DimensoesEPesoExtraidos> = {
          porte_mini: { peso_kg: 0.15, altura_cm: 4, largura_cm: 11, comprimento_cm: 16 },
          porte_pequeno: { peso_kg: 0.35, altura_cm: 8, largura_cm: 15, comprimento_cm: 20 },
          porte_medio: { peso_kg: 0.9, altura_cm: 14, largura_cm: 22, comprimento_cm: 30 },
          porte_grande: { peso_kg: 2.5, altura_cm: 22, largura_cm: 32, comprimento_cm: 42 },
          porte_pesado: { peso_kg: 6.0, altura_cm: 30, largura_cm: 40, comprimento_cm: 50 }
        };

        const perfil = perfis[resp.choice] || perfis.porte_pequeno;
        return {
          peso_kg: extraidos.peso_kg || perfil.peso_kg,
          altura_cm: extraidos.altura_cm || perfil.altura_cm,
          largura_cm: extraidos.largura_cm || perfil.largura_cm,
          comprimento_cm: extraidos.comprimento_cm || perfil.comprimento_cm
        };
      }
    } catch (err) {
      console.warn('[catalogJevService] Fallback gracioso nas dimensões:', (err as Error).message);
    }

    // Fallback padrão seguro para os Correios / Melhor Envio
    return {
      peso_kg: extraidos.peso_kg || 0.35,
      altura_cm: extraidos.altura_cm || 10,
      largura_cm: extraidos.largura_cm || 15,
      comprimento_cm: extraidos.comprimento_cm || 20
    };
  },

  /**
   * Avalia a compatibilidade das fotos encontradas na web utilizando o modelo Jev (System One)
   * combinado com o filtro equilibrado de versão/modelo (limiar >= 50%).
   * Garante entre 6 e 10 fotos na interface, ordenadas por probabilidade.
   */
  async filtrarFotosCompativeisComJev(
    termo: string,
    segmentoLoja: string | undefined,
    fotos: FotoResultadoSerpApi[]
  ): Promise<FotoResultadoSerpApi[]> {
    if (!fotos || fotos.length === 0) return [];

    // 1. Pré-pontuação determinística equilibrada (filtra variantes divergentes como Plus, Pro, Combo, CFS ou peças)
    const preAvaliadas = fotos.map((foto, idx) => ({
      foto,
      idx,
      scoreDeterministico: calcularScoreEstritoModeloJev(termo, `${foto.titulo} ${foto.fonte || ''}`).score
    }));

    // Seleciona as candidatas viáveis para o JEV (não penalizadas por variantes/peças)
    const candidatas = preAvaliadas.filter(item => item.scoreDeterministico >= LIMIAR_APROVACAO_JEV).slice(0, 12);
    const descartadasPorSufixo = preAvaliadas.filter(item => item.scoreDeterministico < 0.30).length;

    const scoresJevMap = new Map<number, number>();
    if (candidatas.length > 0) {
      const questions: Record<string, PerguntaTypeSafe> = {};
      candidatas.forEach((item) => {
        questions[`f_${item.idx}`] = {
          type: 'noul',
          instructions: `Foto: "${item.foto.titulo}". Representa o produto "${termo}"? NÃO penalizar códigos SKU numéricos (ex: 1002110107), voltagens (Bivolt/110v/220v) ou velocidades/especificações técnicas. Penalizar apenas se for variante diferente (Plus, Pro, Max, Combo) ou peça/acessório avulso.`
        };
      });

      try {
        const resultado = await typesafeService.avaliar(
          {
            produto_exato: termo,
            nicho: segmentoLoja || 'Varejo',
            diretriz: 'Ignorar códigos SKU e voltagens. Penalizar apenas se for versão divergente ou acessório/peça.'
          },
          questions,
          'jev-latest',
          1200
        );

        if (resultado?.answers) {
          candidatas.forEach((item) => {
            const resp = resultado.answers[`f_${item.idx}`];
            if (resp?.type === 'noul' && typeof resp.noul === 'number') {
              scoresJevMap.set(item.idx, resp.noul);
            }
          });
        }
      } catch (err) {
        console.warn('[catalogJevService] Fallback determinístico na validação Jev de fotos:', (err as Error).message);
      }
    }

    const aprovadas: Array<{ foto: FotoResultadoSerpApi; score: number }> = [];

    preAvaliadas.forEach((item) => {
      // Descarta de imediato apenas itens com penalização severa por variante/peça (< 30%)
      if (item.scoreDeterministico < 0.30) {
        return;
      }
      const noulJev = scoresJevMap.get(item.idx);
      let scoreFinal = item.scoreDeterministico;
      if (typeof noulJev === 'number') {
        if (item.scoreDeterministico >= 0.85) {
          scoreFinal = Math.max(item.scoreDeterministico, Number(((item.scoreDeterministico * 0.8) + (noulJev * 0.2)).toFixed(2)));
        } else {
          scoreFinal = Number(((item.scoreDeterministico * 0.6) + (noulJev * 0.4)).toFixed(2));
        }
      }

      if (scoreFinal >= LIMIAR_APROVACAO_JEV) {
        aprovadas.push({ foto: item.foto, score: scoreFinal });
      }
    });

    // Ordena da maior para a menor probabilidade
    aprovadas.sort((a, b) => b.score - a.score);

    // Garantia mínima de resultados: assegurar entre 6 e 10 fotos válidas
    if (aprovadas.length < 6) {
      const urlsPresentes = new Set(aprovadas.map(a => a.foto.urlOriginal || a.foto.urlThumbnail));
      // 1ª camada de preenchimento: fotos não penalizadas com score >= 0.40
      const complementares = preAvaliadas
        .filter(item => item.scoreDeterministico >= 0.40 && !urlsPresentes.has(item.foto.urlOriginal || item.foto.urlThumbnail))
        .sort((a, b) => b.scoreDeterministico - a.scoreDeterministico);

      for (const comp of complementares) {
        if (aprovadas.length >= 8) break;
        aprovadas.push({ foto: comp.foto, score: comp.scoreDeterministico });
        urlsPresentes.add(comp.foto.urlOriginal || comp.foto.urlThumbnail);
      }

      // 2ª camada de segurança: se ainda houver menos de 6 fotos, aceita fotos da SerpApi que não sejam peças/insumos
      if (aprovadas.length < 6) {
        const termosPecaStrict = ['filamento', 'bico', 'nozzle', 'hotend', 'correia', 'capa', 'resina', 'extrusora'];
        for (const item of preAvaliadas) {
          if (aprovadas.length >= 6) break;
          const urlKey = item.foto.urlOriginal || item.foto.urlThumbnail;
          if (urlsPresentes.has(urlKey)) continue;
          const titLower = `${item.foto.titulo} ${item.foto.fonte || ''}`.toLowerCase();
          if (termosPecaStrict.some(tp => titLower.includes(tp))) continue;
          aprovadas.push({ foto: item.foto, score: Math.max(0.50, item.scoreDeterministico) });
          urlsPresentes.add(urlKey);
        }
      }
    }

    // Teto de 10 fotos aprovadas para a interface
    const fotosFinais = aprovadas.slice(0, 10);
    const totalDescartadas = fotos.length - fotosFinais.length;

    const mediaScore = fotosFinais.length > 0
      ? Math.round((fotosFinais.reduce((acc, cur) => acc + cur.score, 0) / fotosFinais.length) * 100)
      : 0;

    console.log(
      `%c[HUBI JEV ⚡] [FOTOS]%c Produto: "${termo}" | Score médio: ${mediaScore}% | Fotos aprovadas (limiar >=50%): ${fotosFinais.length} (garantia: 6-10) | Descartadas: ${totalDescartadas} (variantes/acessórios: ${descartadasPorSufixo})`,
      'color: #10b981; font-weight: bold;',
      'color: #34d399;'
    );

    return fotosFinais.map(a => a.foto);
  },

  /**
   * Pontua cada resultado do Google Shopping / Orgânico (0% a 100%) no HUBI JEV,
   * aprovando resultados a partir de 50% (0.50) e garantindo entre 4 e 8 lojas distintas no Radar de Preços.
   */
  async pontuarOfertasShoppingComJev(
    nomeOriginalUsuario: string,
    segmentoLoja: string | undefined,
    ofertas: ItemShoppingSerpApi[],
    etapa: EtapaPipelineJev = 'RADAR_PRECOS'
  ): Promise<{
    aprovadas: ItemShoppingAprovadoJev[];
    totalAvaliados: number;
    totalAprovados: number;
    totalDescartados: number;
    confiancaMediaPercentual: number;
  }> {
    if (!ofertas || ofertas.length === 0) {
      console.log(
        `%c[HUBI JEV ⚡] [${etapa}]%c Nenhum resultado retornado pela SerpApi para "${nomeOriginalUsuario}".`,
        'color: #f59e0b; font-weight: bold;',
        'color: #fbbf24;'
      );
      return {
        aprovadas: [],
        totalAvaliados: 0,
        totalAprovados: 0,
        totalDescartados: 0,
        confiancaMediaPercentual: 0
      };
    }

    const preAvaliadas = ofertas
      .filter(oferta => {
        const lojaLower = (oferta.loja || '').trim().toLowerCase();
        return lojaLower !== 'google' && lojaLower !== 'google shopping' && !lojaLower.includes('google.com');
      })
      .map((oferta, idx) => {
      const textoAvaliacao = `${oferta.titulo} ${oferta.entrega || ''} ${oferta.url || ''}`;
      const aval = calcularScoreEstritoModeloJev(nomeOriginalUsuario, textoAvaliacao);
      return {
        oferta,
        idx,
        scoreDeterministico: aval.score,
        penalizado: aval.penalizado
      };
    });

    const candidatasJev = preAvaliadas
      .filter(item => item.scoreDeterministico >= LIMIAR_APROVACAO_JEV)
      .slice(0, 25);

    const scoresJevMap = new Map<number, number>();

    if (candidatasJev.length > 0) {
      const questions: Record<string, PerguntaTypeSafe> = {};
      candidatasJev.forEach((item) => {
        questions[`o_${item.idx}`] = {
          type: 'noul',
          instructions: `Anúncio: "${item.oferta.titulo}" (R$ ${item.oferta.preco.toFixed(2)} em ${item.oferta.loja}). Trata-se do modelo "${nomeOriginalUsuario}"? NÃO penalizar códigos SKU numéricos (ex: 1002110107), voltagens (Bivolt/110v/220v) ou especificações técnicas (velocidade/FDM). Penalizar apenas se for versão divergente (Plus, Pro, Combo, CFS) ou peça/acessório avulso.`
        };
      });

      try {
        const resultado = await typesafeService.avaliar(
          {
            produto_pesquisado: nomeOriginalUsuario,
            nicho: segmentoLoja || 'Varejo Geral',
            diretriz: 'Ignorar números SKU e voltagens. Penalizar apenas versões divergentes ou acessórios/peças.'
          },
          questions,
          'jev-latest',
          1100
        );

        if (resultado?.answers) {
          candidatasJev.forEach((item) => {
            const resp = resultado.answers[`o_${item.idx}`];
            if (resp?.type === 'noul' && typeof resp.noul === 'number') {
              scoresJevMap.set(item.idx, resp.noul);
            }
          });
        }
      } catch (err) {
        console.warn('[catalogJevService] Fallback determinístico ao pontuar ofertas no Jev:', (err as Error).message);
      }
    }

    const todasAprovadas: ItemShoppingAprovadoJev[] = [];

    preAvaliadas.forEach((item) => {
      // Descarta apenas se tiver penalização forte por variante divergente ou peça (< 30%)
      if (item.scoreDeterministico < 0.30) {
        return;
      }

      const noulJev = scoresJevMap.get(item.idx);
      let scoreFinal = item.scoreDeterministico;
      if (typeof noulJev === 'number') {
        if (item.scoreDeterministico >= 0.85) {
          scoreFinal = Math.max(item.scoreDeterministico, Number(((item.scoreDeterministico * 0.8) + (noulJev * 0.2)).toFixed(2)));
        } else {
          scoreFinal = Number(((item.scoreDeterministico * 0.6) + (noulJev * 0.4)).toFixed(2));
        }
      }

      if (scoreFinal >= LIMIAR_APROVACAO_JEV) {
        todasAprovadas.push({
          ...item.oferta,
          scoreJev: scoreFinal
        });
      }
    });

    // Deduplica por loja distinta priorizando a oferta de maior probabilidade e melhor preço
    const mapaPorLoja = new Map<string, ItemShoppingAprovadoJev>();
    for (const item of todasAprovadas) {
      const k = item.loja.trim().toLowerCase();
      const existente = mapaPorLoja.get(k);
      if (!existente || item.scoreJev > existente.scoreJev || (item.scoreJev === existente.scoreJev && item.preco < existente.preco)) {
        mapaPorLoja.set(k, item);
      }
    }

    let listaLojas = Array.from(mapaPorLoja.values());

    // Garantia mínima de resultados: garantir entre 5 e 10 lojas nacionais distintas (sempre bloqueando variantes/importados)
    if (listaLojas.length < 5) {
      const lojasJaAdicionadas = new Set(listaLojas.map(l => l.loja.trim().toLowerCase()));
      const complementares = preAvaliadas
        .filter(item => !item.penalizado && item.scoreDeterministico >= 0.40 && !lojasJaAdicionadas.has(item.oferta.loja.trim().toLowerCase()))
        .sort((a, b) => b.scoreDeterministico - a.scoreDeterministico);

      for (const comp of complementares) {
        if (listaLojas.length >= 6) break;
        listaLojas.push({
          ...comp.oferta,
          scoreJev: comp.scoreDeterministico
        });
        lojasJaAdicionadas.add(comp.oferta.loja.trim().toLowerCase());
      }
    }

    // Filtro estatístico de outliers contra kits/combos disfarçados e importações:
    // - Com 3+ lojas válidas: mantém toda oferta nacional na faixa de 60% a 125% da mediana
    // - Com 2 lojas: descarta apenas preços aberrantes (< 30% ou > 250% do maior valor válido)
    if (listaLojas.length >= 3) {
      const precosOrd = listaLojas.map(l => l.preco).sort((a, b) => a - b);
      const mid = Math.floor(precosOrd.length / 2);
      const mediana = precosOrd.length % 2 === 0
        ? (precosOrd[mid - 1] + precosOrd[mid]) / 2
        : precosOrd[mid];
      const semOutliers = listaLojas.filter(l => l.preco >= mediana * 0.60 && l.preco <= mediana * 1.25);
      if (semOutliers.length > 0) {
        listaLojas = semOutliers;
      }
    } else if (listaLojas.length === 2) {
      const maiorValido = Math.max(...listaLojas.map(l => l.preco));
      const semAberrantes = listaLojas.filter(l => l.preco >= maiorValido * 0.30 && l.preco <= maiorValido * 2.50);
      if (semAberrantes.length > 0) {
        listaLojas = semAberrantes;
      }
    }

    // Ordena pelo preço (menor para maior) e limita entre 5 e 10 lojas nacionais distintas
    listaLojas.sort((a, b) => a.preco - b.preco);
    const aprovadasFinais = listaLojas.slice(0, 10);
    const totalDescartados = ofertas.length - aprovadasFinais.length;

    const confiancaMediaPercentual = aprovadasFinais.length > 0
      ? Math.round((aprovadasFinais.reduce((acc, cur) => acc + cur.scoreJev, 0) / aprovadasFinais.length) * 100)
      : 0;

    console.log(
      `%c[HUBI JEV ⚡] [${etapa}]%c Produto: "${nomeOriginalUsuario}" | Confiança média: ${confiancaMediaPercentual}% | Lojas nacionais distintas aprovadas (>=50%): ${aprovadasFinais.length} (garantia: 5-10 lojas) | Descartados: ${totalDescartados}`,
      'color: #10b981; font-weight: bold;',
      'color: #34d399;'
    );

    return {
      aprovadas: aprovadasFinais,
      totalAvaliados: ofertas.length,
      totalAprovados: aprovadasFinais.length,
      totalDescartados,
      confiancaMediaPercentual
    };
  },

  /**
   * Núcleo Unificado de Contexto e Score (HUBI JEV + SerpApi):
   * 1. Extrai o termo canônico pelo HUBI JEV sem alterar o Nome do Produto do usuário;
   * 2. Busca os anúncios e snippets reais na SerpApi (com cache instantâneo);
   * 3. Pontua cada resultado (0% a 100%) no HUBI JEV e descarta < 75%;
   * 4. Retorna as ofertas aprovadas e o resumo estruturado para alimentar o gemini-3.8-flash.
   */
  async obterContextoUnificadoProdutoJev(params: {
    nomeProduto: string;
    categoriaNome?: string;
    segmentoLoja?: string;
    loja?: { id?: string; serpapi_key?: string | null };
    etapa: EtapaPipelineJev;
    permitirComplementoGemini?: boolean;
  }): Promise<ContextoUnificadoProdutoJev> {
    const tInicioCtx = performance.now();
    const nomeOriginal = (params.nomeProduto || '').trim();
    const termoCanonico = await this.extrairTermoCanonicoBusca(
      nomeOriginal,
      params.segmentoLoja,
      params.etapa
    );
    const partNumbers = extrairPartNumbersProduto(nomeOriginal);

    let ofertasBrutas = await buscarPrecosShoppingSerpApi(
      termoCanonico || nomeOriginal,
      params.loja,
      30
    );

    let avaliacao = await this.pontuarOfertasShoppingComJev(
      termoCanonico || nomeOriginal,
      params.segmentoLoja,
      ofertasBrutas,
      params.etapa
    );

    // Fallback de query por Marca + Part-Number se retornou < 2 lojas aprovadas e houver part-number identificado
    if (avaliacao.aprovadas.length < 2 && partNumbers.length > 0) {
      const pnPrincipal = partNumbers[partNumbers.length - 1];
      const palavrasCanonicas = (termoCanonico || nomeOriginal)
        .split(/\s+/)
        .filter(p => p.length >= 2 && p.toLowerCase() !== pnPrincipal.toLowerCase());
      const marcaProvavel = palavrasCanonicas.find(
        p => !/^(monitor|impressora|notebook|celular|smartphone|gamer|curvo|portatil|3d)$/i.test(p)
      ) || palavrasCanonicas[0] || '';
      const queryPartNumber = `${marcaProvavel} ${pnPrincipal}`.trim();

      if (queryPartNumber && queryPartNumber.toLowerCase() !== (termoCanonico || '').toLowerCase()) {
        const ofertasPn = await buscarPrecosShoppingSerpApi(queryPartNumber, params.loja, 30);
        if (ofertasPn.length > 0) {
          ofertasBrutas = [...ofertasBrutas, ...ofertasPn];
          avaliacao = await this.pontuarOfertasShoppingComJev(
            termoCanonico || nomeOriginal,
            params.segmentoLoja,
            ofertasBrutas,
            params.etapa
          );
        }
      }
    }

    // Pipeline unificado (Preencher com IA, 1ª abertura do Radar e Atualizar Pesquisa):
    // Sempre que a Serper retornar < 6 lojas nacionais aprovadas, aciona o complemento
    // do gemini-3.8-flash + Google Search para consolidar de 6 a 10 lojas reais.
    const deveComplementarComGemini =
      params.permitirComplementoGemini !== false && avaliacao.aprovadas.length < 6;

    if (deveComplementarComGemini) {
      const ofertasComplementares = await buscarOfertasComplementaresGeminiSearch(
        termoCanonico || nomeOriginal,
        avaliacao.aprovadas.map(o => o.loja),
        params.loja
      );

      if (ofertasComplementares.length > 0) {
        const aprovadasSerper = [...avaliacao.aprovadas];
        const avaliacaoCombinada = await this.pontuarOfertasShoppingComJev(
          termoCanonico || nomeOriginal,
          params.segmentoLoja,
          [...ofertasBrutas, ...ofertasComplementares],
          params.etapa
        );

        // Garante que nenhuma loja já aprovada na Serper seja perdida na consolidação
        const porLojaConsolidado = new Map<string, ItemShoppingAprovadoJev>();
        for (const item of [...aprovadasSerper, ...avaliacaoCombinada.aprovadas]) {
          const chave = item.loja.trim().toLowerCase();
          if (!porLojaConsolidado.has(chave)) {
            porLojaConsolidado.set(chave, item);
          }
        }
        const consolidadas = Array.from(porLojaConsolidado.values())
          .sort((a, b) => a.preco - b.preco)
          .slice(0, 10);

        avaliacao = {
          ...avaliacaoCombinada,
          aprovadas: consolidadas,
          confiancaMediaPercentual: consolidadas.length > 0
            ? Math.round((consolidadas.reduce((acc, cur) => acc + cur.scoreJev, 0) / consolidadas.length) * 100)
            : avaliacaoCombinada.confiancaMediaPercentual
        };
      }
    }

    const resumoContextoTexto = avaliacao.aprovadas.length > 0
      ? avaliacao.aprovadas
          .slice(0, 10)
          .map(
            (item, idx) =>
              `${idx + 1}. [Score JEV: ${Math.round(item.scoreJev * 100)}%] Loja: "${item.loja}" | Título Exato: "${item.titulo}" | Preço: R$ ${item.preco.toFixed(2)}${item.url ? ` | Link: ${item.url}` : ''}`
          )
          .join('\n')
      : '';

    console.log(
      `%c[HUBI PERF ⏱️]%c [${params.etapa}] Contexto Unificado JEV+Serper concluído em ${Math.round(performance.now() - tInicioCtx)}ms (${avaliacao.aprovadas.length} lojas aprovadas)`,
      'color: #0ea5e9; font-weight: bold;',
      'color: #38bdf8;'
    );

    return {
      nomeOriginal,
      termoCanonico,
      ofertasAprovadas: avaliacao.aprovadas,
      totalAvaliados: avaliacao.totalAvaliados,
      totalAprovados: avaliacao.totalAprovados,
      totalDescartados: avaliacao.totalDescartados,
      confiancaMediaPercentual: avaliacao.confiancaMediaPercentual,
      resumoContextoTexto
    };
  }
};
