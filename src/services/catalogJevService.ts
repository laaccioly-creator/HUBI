import { typesafeService, PerguntaTypeSafe } from './typesafeService';
import { extrairDimensoesEPesoTexto, DimensoesEPesoExtraidos } from './geminiService';

/**
 * Interface simples para categorias da loja
 */
export interface CategoriaResumida {
  id: string;
  nome: string;
}

/**
 * Gera candidatos heurísticos locais a partir de um termo de produto
 */
function gerarCandidatosTermoBusca(termo: string): {
  opcao_limpa: string;
  opcao_concisa: string;
  opcao_essencial: string;
  opcao_original: string;
} {
  const original = (termo || '').trim();

  // 1. Limpeza ampla de ruídos comuns de ERP e catálogo
  const limpa = original
    // Remove códigos SKU/Ref/Lote no início ou no fim (ex: "Ref 402", "Cód: 129", "#9021")
    .replace(/\b(?:ref\.?|c[oó]d\.?|sku|lote|tam\.?|tamanho)\s*[:#-]?\s*[\w\d]+/gi, '')
    // Remove tamanhos isolados (P, M, G, GG, XG, 38, 40, etc.)
    .replace(/\s*[-/]\s*(?:p|m|g|gg|xg|xgg|\d{2})\b/gi, '')
    // Remove parênteses com conteúdo de embalagem/lote (ex: "(cx c/ 12)", "(fardo)")
    .replace(/\([^)]*(?:cx|fardo|lote|emb|unid)[^)]*\)/gi, '')
    // Remove hífens e barras duplicadas
    .replace(/[-/]{2,}/g, ' ')
    // Remove pontuação solta
    .replace(/\s+[-–—/]\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. Extrai termo conciso (primeiras 3 a 5 palavras relevantes)
  const stopwords = new Set(['com', 'de', 'do', 'da', 'dos', 'das', 'para', 'em', 'um', 'uma', 'e', 'o', 'a', 'os', 'as', 'ref', 'cod']);
  const palavras = limpa.split(' ').filter(p => !stopwords.has(p.toLowerCase()));
  const concisa = palavras.slice(0, 4).join(' ');

  // 3. Extrai apenas tipo + marca se houver mais de 2 palavras
  const essencial = palavras.slice(0, 2).join(' ');

  return {
    opcao_limpa: limpa || original,
    opcao_concisa: concisa || limpa || original,
    opcao_essencial: essencial || limpa || original,
    opcao_original: original
  };
}

export const catalogJevService = {
  /**
   * Extrai o termo canônico de busca para imagens do Google Images via Jev (System One).
   * Orçamento estrito de 1.000ms com degradação graciosa para heurística local.
   */
  async extrairTermoCanonicoBusca(termo: string): Promise<string> {
    if (!termo || !termo.trim()) return '';

    const candidatos = gerarCandidatosTermoBusca(termo);

    // Se o termo original for curto (<= 3 palavras) e limpo, não precisa gastar tokens nem latência
    const palavrasOriginais = candidatos.opcao_original.split(' ').filter(Boolean);
    const temRuidoEvidente = /\b(ref|sku|lote|tam|tamanho|cx|fardo|c[oó]d)\b/i.test(termo);

    if (palavrasOriginais.length <= 3 && !temRuidoEvidente) {
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
          'Selecione a opção que melhor representa o termo comercial canônico, limpo e direto para encontrar a foto oficial e nítida deste produto no Google Imagens, sem códigos internos de estoque (SKU/Ref) e sem palavras desnecessárias.',
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
        1000 // Orçamento estrito de 1.000ms
      );

      const resposta = resultado.answers.melhor_termo;
      if (resposta?.type === 'choice' && resposta.choice && criteria[resposta.choice]) {
        console.log(
          `%c[HUBI JEV ⚡]%c Termo canônico selecionado: "${criteria[resposta.choice]}" (confiança: ${(resposta.confidence * 100).toFixed(0)}%)`,
          'background: #10b981; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
          'color: #10b981; font-weight: bold;'
        );
        return criteria[resposta.choice];
      }
    } catch (err) {
      console.warn('[catalogJevService] Fallback gracioso para heurística local no termo de busca:', (err as Error).message);
    }

    // Fallback gracioso imediato
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

    // Limita a até 20 categorias para respeitar o limite de critérios do Jev
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
        800 // Orçamento estrito de 800ms
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
        800
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
        800
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
  }
};
