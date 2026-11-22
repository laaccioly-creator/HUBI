import { supabase, supabaseFunctionsBaseUrl, supabaseAnonKey } from '../lib/supabase';

export type TipoPerguntaTypeSafe = 'choice' | 'score' | 'noul';

export interface PerguntaTypeSafe {
  type: TipoPerguntaTypeSafe;
  instructions: string | Record<string, unknown> | Array<unknown>;
  criteria?: Record<string, unknown> | Array<unknown>;
}

export interface RespostaChoice {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface RespostaScore {
  type: 'score';
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
}

export interface RespostaNoul {
  type: 'noul';
  noul: number;
}

export type RespostaPergunta = RespostaChoice | RespostaScore | RespostaNoul;

export interface ResultadoTypeSafe<T extends Record<string, PerguntaTypeSafe> = Record<string, PerguntaTypeSafe>> {
  sucesso: boolean;
  model: string;
  answers: {
    [K in keyof T]: RespostaPergunta;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export const typesafeService = {
  /**
   * Avalia um estado e conjunto de perguntas utilizando o modelo Jev da TypeSafe via Supabase Edge Function.
   * Suporta orçamento de latência estrito (timeoutMs) com fallback rápido.
   */
  async avaliar<T extends Record<string, PerguntaTypeSafe>>(
    estado: string | Record<string, unknown> | Array<unknown>,
    perguntas: T,
    modelo: string = 'jev-latest',
    timeoutMs: number = 5000
  ): Promise<ResultadoTypeSafe<T>> {
    const efetivoTimeoutMs = Math.min(Math.max(timeoutMs || 5000, 500), 5000);
    let token = supabaseAnonKey;

    try {
      const sessaoRes = await Promise.race([
        supabase.auth.getSession(),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 300))
      ]);
      const accessToken =
        sessaoRes && typeof sessaoRes === 'object' && 'data' in sessaoRes
          ? sessaoRes.data?.session?.access_token
          : null;
      if (accessToken && accessToken.trim()) {
        token = accessToken.trim();
      }
    } catch {
      // Operador sem sessão auth.users segue imediatamente com supabaseAnonKey
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), efetivoTimeoutMs);

    try {
      const response = await fetch(`${supabaseFunctionsBaseUrl}/typesafe-eval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token || supabaseAnonKey}`
        },
        body: JSON.stringify({
          state: estado,
          questions: perguntas,
          model: modelo
        }),
        signal: controller.signal
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || data?.erro) {
        throw new Error(
          (typeof data?.erro === 'string' && data.erro.trim()) ||
            `Falha ao comunicar com a Edge Function typesafe-eval (HTTP ${response.status}).`
        );
      }

      return data as ResultadoTypeSafe<T>;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Tempo limite ao consultar Jev (${efetivoTimeoutMs}ms).`);
      }
      const mensagem = err instanceof Error ? err.message : 'Erro inesperado ao consultar Jev.';
      throw new Error(mensagem);
    } finally {
      window.clearTimeout(timeoutId);
    }
  },

  /**
   * Helper para montar uma pergunta do tipo Choice
   */
  criarChoice(
    instrucoes: string | Record<string, unknown>,
    criterios: Record<string, string | null>
  ): PerguntaTypeSafe {
    return {
      type: 'choice',
      instructions: instrucoes,
      criteria: criterios,
    };
  },

  /**
   * Helper para montar uma pergunta do tipo Noul (sim/não probabilístico)
   */
  criarNoul(
    instrucoes: string | Record<string, unknown>,
    criterios?: { true?: string; false?: string }
  ): PerguntaTypeSafe {
    return {
      type: 'noul',
      instructions: instrucoes,
      criteria: criterios,
    };
  },

  /**
   * Helper para montar uma pergunta do tipo Score (gradação de níveis)
   */
  criarScore(
    instrucoes: string | Record<string, unknown>,
    niveis: string[]
  ): PerguntaTypeSafe {
    return {
      type: 'score',
      instructions: instrucoes,
      criteria: niveis,
    };
  },
};
