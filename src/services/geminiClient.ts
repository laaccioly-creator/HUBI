/**
 * Cliente Centralizador e Descoberta Dinâmica de Modelos Google Gemini
 * Suporte a cache em memória, ordenação inteligente por versão e família Flash,
 * e auto-recuperação (Self-Healing) com invalidação de cache em caso de 404.
 */

// Cache em memória do modelo principal ativo por chave de API
const cacheModeloAtivo = new Map<string, string>();
// Cache em memória de todos os modelos compatíveis ordenados por chave de API
const cacheModelosValidos = new Map<string, string[]>();

// Fallback de contingência caso a rede do cliente oscile ou a listagem falhe temporariamente
export const MODELOS_FALLBACK_CONTINGENCIA = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b'];

/**
 * Invalida o cache em memória para forçar uma nova descoberta dinâmica.
 * Acionado quando a Google API retorna 404 (modelo descontinuado/Self-Healing).
 */
export const invalidarCacheGemini = (apiKey?: string): void => {
  if (apiKey) {
    const key = apiKey.trim();
    cacheModeloAtivo.delete(key);
    cacheModelosValidos.delete(key);
  } else {
    cacheModeloAtivo.clear();
    cacheModelosValidos.clear();
  }
};

/**
 * Extrai o peso/score de um modelo Gemini para ordenação:
 * Prioriza a família Flash e os modelos estáveis (gemini-1.5-flash e gemini-2.0-flash).
 */
export const calcularScoreModelo = (nome: string): number => {
  const limpo = nome.toLowerCase().replace('models/', '');
  let score = 0;

  // Prioridade absoluta para a família flash
  if (limpo.includes('flash')) {
    score += 1000;
  }
  // Modelos estáveis e consolidados para visão e varejo recebem bônus prioritário
  if (limpo === 'gemini-1.5-flash' || limpo === 'gemini-2.0-flash') {
    score += 500;
  }
  if (limpo === 'gemini-1.5-flash-8b') {
    score += 400;
  }
  // Penaliza modelos pesados (pro), que costumam ter latência maior para varejo/chat
  if (limpo.includes('pro')) {
    score -= 200;
  }

  // Extrai versão numérica (ex: 2.0, 1.5)
  const versaoMatch = limpo.match(/(\d+(?:\.\d+)?)/);
  if (versaoMatch) {
    const versao = parseFloat(versaoMatch[1]);
    if (versao <= 2.5) {
      score += versao * 100;
    }
  }

  // Prioriza lite para respostas ágeis se empatado em versão
  if (limpo.includes('lite')) {
    score += 10;
  }

  return score;
};

/**
 * Consulta a Google Generative Language API e retorna a lista de modelos disponíveis
 * compatíveis com "generateContent", ordenados do mais recente/recomendado para o mais antigo.
 */
export const getAvailableGeminiModels = async (
  apiKey: string,
  forcarAtualizacao = false
): Promise<string[]> => {
  const chaveLimpa = (apiKey || '').trim();
  if (!chaveLimpa) {
    return MODELOS_FALLBACK_CONTINGENCIA;
  }

  if (!forcarAtualizacao) {
    const emCache = cacheModelosValidos.get(chaveLimpa);
    if (emCache && emCache.length > 0) {
      return emCache;
    }
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${chaveLimpa}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const models: any[] = data?.models || [];

      // Filtra modelos suportados para generateContent
      const candidatos = models
        .filter((m: any) => {
          const nome = (m.name || '').replace('models/', '').toLowerCase();
          const suportaGenerate =
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes('generateContent');

          if (!suportaGenerate) return false;

          // Ignora modelos especializados não-conversacionais (TTS, embedding, etc.)
          if (
            nome.includes('embedding') ||
            nome.includes('aqa') ||
            nome.includes('bison') ||
            nome.includes('tts') ||
            nome.includes('image') ||
            nome.includes('live') ||
            nome.includes('realtime') ||
            nome.includes('customtools') ||
            nome.includes('computer-use') ||
            nome.includes('deep-research') ||
            nome.includes('antigravity') ||
            nome.includes('lyria')
          ) {
            return false;
          }

          return true;
        })
        .map((m: any) => (m.name || '').replace('models/', ''));

      if (candidatos.length > 0) {
        // Ordena por score decrescente (mais recente e família flash primeiro)
        candidatos.sort((a, b) => calcularScoreModelo(b) - calcularScoreModelo(a));

        cacheModelosValidos.set(chaveLimpa, candidatos);
        cacheModeloAtivo.set(chaveLimpa, candidatos[0]);
        return candidatos;
      }
    }
  } catch (err) {
    console.warn('[GeminiClient] Falha ao consultar modelos na Google API:', err);
  }

  // Fallback caso a API falhe temporariamente
  return MODELOS_FALLBACK_CONTINGENCIA;
};

/**
 * Retorna dinamicamente o modelo mais recente e otimizado da família Flash.
 * Mantém cache em memória e auto-recupera caso necessário.
 */
export const getAvailableGeminiModel = async (
  apiKey: string,
  forcarAtualizacao = false
): Promise<string> => {
  const chaveLimpa = (apiKey || '').trim();
  if (!chaveLimpa) {
    return MODELOS_FALLBACK_CONTINGENCIA[0];
  }

  if (!forcarAtualizacao) {
    const cached = cacheModeloAtivo.get(chaveLimpa);
    if (cached) return cached;
  }

  const modelos = await getAvailableGeminiModels(chaveLimpa, forcarAtualizacao);
  const modeloPrincipal = modelos[0] || MODELOS_FALLBACK_CONTINGENCIA[0];
  cacheModeloAtivo.set(chaveLimpa, modeloPrincipal);
  return modeloPrincipal;
};

/**
 * Testa a validade da chave de API do Gemini através da rota de listagem de modelos.
 * Sem custo de tokens, instantânea e dinâmica.
 */
export const testarChaveGemini = async (
  apiKey: string
): Promise<{ sucesso: boolean; mensagem: string; modelo?: string }> => {
  const chaveLimpa = (apiKey || '').trim();
  if (!chaveLimpa) {
    return { sucesso: false, mensagem: 'Por favor, insira uma API Key válida do Google Gemini.' };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${chaveLimpa}`;
    const resposta = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (resposta.ok) {
      const modelos = await getAvailableGeminiModels(chaveLimpa, true);
      const modeloEscolhido = modelos[0] || MODELOS_FALLBACK_CONTINGENCIA[0];

      return {
        sucesso: true,
        mensagem: `Chave validada com sucesso! Modelo ativo identificado: ${modeloEscolhido}`,
        modelo: modeloEscolhido
      };
    }

    if (resposta.status === 400 || resposta.status === 403) {
      return {
        sucesso: false,
        mensagem: 'Chave de API inválida ou sem permissão. Verifique sua chave no Google AI Studio.'
      };
    }

    if (resposta.status === 429) {
      return {
        sucesso: false,
        mensagem: 'Cota de requisições excedida na API do Gemini. Tente novamente em instantes.'
      };
    }

    return {
      sucesso: false,
      mensagem: `Falha na verificação da chave (Status HTTP ${resposta.status}).`
    };
  } catch (error: any) {
    return {
      sucesso: false,
      mensagem: 'Não foi possível conectar aos servidores do Google Gemini. Verifique sua conexão.'
    };
  }
};
