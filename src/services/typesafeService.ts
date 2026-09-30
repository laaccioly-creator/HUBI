import { supabase } from '../lib/supabase';

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
    timeoutMs: number = 2000
  ): Promise<ResultadoTypeSafe<T>> {
    try {
      const requisicaoPromise = supabase.functions.invoke('typesafe-eval', {
        body: {
          state: estado,
          questions: perguntas,
          model: modelo,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout de latência ao consultar Jev (${timeoutMs}ms)`)), timeoutMs)
      );

      const { data, error } = await Promise.race([requisicaoPromise, timeoutPromise]);

      if (error) {
        throw new Error(error.message || 'Falha ao comunicar com a Edge Function typesafe-eval.');
      }

      if (data?.erro) {
        throw new Error(data.erro);
      }

      return data as ResultadoTypeSafe<T>;
    } catch (err: unknown) {
      const mensagem = err instanceof Error ? err.message : 'Erro inesperado ao consultar Jev.';
      throw new Error(mensagem);
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
