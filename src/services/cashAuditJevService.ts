import { typesafeService } from './typesafeService';

export interface ParametrosAuditoriaCaixa {
  diferencaDinheiro: number;
  totalEntradas: number;
  observacaoFechamento?: string | null;
  usuarioNome?: string;
}

export interface AuditoriaCaixaJev {
  requerAuditoria: boolean;
  nivel: 'conciliado' | 'atencao' | 'critico';
  score: 0 | 1 | 2;
  parecer: string;
  badgeCor: 'emerald' | 'amber' | 'rose';
  avaliadoPorJev: boolean;
}

export const cashAuditJevService = {
  /**
   * Avalia a consistência do fechamento de caixa, quebras e sobras
   * utilizando o Jev (TypeSafe) para triagem preditiva de auditoria.
   */
  async auditarFechamento(params: ParametrosAuditoriaCaixa): Promise<AuditoriaCaixaJev> {
    const { diferencaDinheiro, totalEntradas, observacaoFechamento, usuarioNome } = params;
    const diferencaAbs = Math.abs(Number(diferencaDinheiro || 0));

    // Se o caixa bateu com exatidão (diferença zero ou centavos irrelevantes < R$ 0.50)
    if (diferencaAbs < 0.5) {
      return {
        requerAuditoria: false,
        nivel: 'conciliado',
        score: 0,
        parecer: 'Caixa conciliado com exatidão matemática. Sem necessidade de auditoria.',
        badgeCor: 'emerald',
        avaliadoPorJev: false,
      };
    }

    const obsTexto = (observacaoFechamento || '').trim();

    try {
      const estadoJev = {
        operador_nome: usuarioNome || 'Operador',
        diferenca_em_reais: diferencaDinheiro,
        diferenca_absoluta: diferencaAbs,
        total_movimentado_sessao: totalEntradas,
        percentual_discrepancia: totalEntradas > 0 ? ((diferencaAbs / totalEntradas) * 100).toFixed(2) : '100',
        justificativa_operador: obsTexto || '(Nenhuma justificativa informada pelo operador)',
      };

      const perguntas = {
        plausibilidade_justificativa: typesafeService.criarScore(
          'Avalie a plausibilidade da justificativa apresentada pelo operador frente ao valor da diferença de caixa apurada.',
          [
            'Grau 0 (Plausível): Justificativa fundamentada, clara ou divergência mínima de centavos aceitável.',
            'Grau 1 (Atenção): Justificativa genérica (ex: "erro de troco", "não bateu") ou divergência moderada.',
            'Grau 2 (Crítico): Discrepância elevada sem justificativa válida, suspeita ou inconsistência grave.',
          ]
        ),
        necessita_auditoria_imediata: typesafeService.criarNoul(
          'Esta divergência de caixa requer intervenção ou conferência urgente da gerência/auditoria?',
          {
            true: 'Requer auditoria mandatória da gerência.',
            false: 'Dentro da tolerância operacional normal do varejo.',
          }
        ),
      };

      const resJev = await typesafeService.avaliar(estadoJev, perguntas, 'jev-latest', 1500);

      const respScore = resJev.answers.plausibilidade_justificativa;
      const respNoul = resJev.answers.necessita_auditoria_imediata;

      let scoreFinal: 0 | 1 | 2 = 1;
      if (respScore && respScore.type === 'score') {
        scoreFinal = Math.min(2, Math.max(0, respScore.score)) as 0 | 1 | 2;
      } else {
        scoreFinal = diferencaAbs > 30 ? 2 : 1;
      }

      const requerAuditoriaFinal =
        respNoul && respNoul.type === 'noul'
          ? respNoul.noul >= 0.5
          : scoreFinal === 2 || diferencaAbs > 20;

      return this.montarResultado(scoreFinal, requerAuditoriaFinal, diferencaDinheiro, obsTexto, true);
    } catch {
      // Fallback determinístico local
      const score = diferencaAbs > 30 ? 2 : diferencaAbs > 5 ? 1 : 0;
      return this.montarResultado(score, score === 2, diferencaDinheiro, obsTexto, false);
    }
  },

  montarResultado(
    score: 0 | 1 | 2,
    requerAuditoria: boolean,
    diferenca: number,
    justificativa: string,
    avaliadoPorJev: boolean
  ): AuditoriaCaixaJev {
    const tipoDif = diferenca > 0 ? 'sobra' : 'falta';
    const valorFmt = `R$ ${Math.abs(diferenca).toFixed(2)}`;

    if (score === 2 || requerAuditoria) {
      return {
        requerAuditoria: true,
        nivel: 'critico',
        score: 2,
        parecer: `Alerta de Auditoria: ${tipoDif.toUpperCase()} de ${valorFmt}. Justificativa requer conferência das sangrias e comprovantes.`,
        badgeCor: 'rose',
        avaliadoPorJev,
      };
    }

    if (score === 1) {
      return {
        requerAuditoria: false,
        nivel: 'atencao',
        score: 1,
        parecer: `Atenção: ${tipoDif} de ${valorFmt}. Divergência pontual tolerável com monitoramento.`,
        badgeCor: 'amber',
        avaliadoPorJev,
      };
    }

    return {
      requerAuditoria: false,
      nivel: 'conciliado',
      score: 0,
      parecer: `Justificativa plausível registrada para a ${tipoDif} de ${valorFmt}.`,
      badgeCor: 'emerald',
      avaliadoPorJev,
    };
  },
};
