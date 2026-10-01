import { typesafeService } from './typesafeService';

export type TipoRestricaoPedido =
  | 'alergia_saude'
  | 'horario_entrega'
  | 'fragil_manuseio'
  | 'urgente'
  | 'instrucao_especial';

export interface RestricaoOperacionalPedido {
  temRestricao: boolean;
  tipo: TipoRestricaoPedido;
  rotulo: string;
  cor: 'rose' | 'amber' | 'sky';
  detalhe: string;
  avaliadoPorJev: boolean;
}

const cacheRestricoes = new Map<string, RestricaoOperacionalPedido | null>();

export const orderGuardJevService = {
  /**
   * Avalia as observações do pedido com Jev (TypeSafe) para detectar
   * restrições operacionais críticas (alergias, prazos de entrega, fragilidade).
   */
  async analisarObservacao(observacao: string | null | undefined): Promise<RestricaoOperacionalPedido | null> {
    if (!observacao || observacao.trim().length < 3) {
      return null;
    }

    const textoLimpo = observacao.trim();
    if (cacheRestricoes.has(textoLimpo)) {
      return cacheRestricoes.get(textoLimpo)!;
    }

    // Heurística rápida local pré-Jev para triagem imediata
    const pLower = textoLimpo.toLowerCase();
    const matchAlergia = /\b(alergia|al[eé]rgic[oa]|sem gl[uú]ten|sem lactose|vegano|diab[eé]tic[oa])\b/i.test(pLower);
    const matchHorario = /\b(entregar at[eé]|hor[aá]rio|at[eé] [0-2]?\d[:h]\d{0,2}|urgente|r[aá]pido|prazo)\b/i.test(pLower);
    const matchFragil = /\b(fr[aá]gil|vidro|cuidado|quebr[aá]vel|delicado|n[aã]o amassar)\b/i.test(pLower);

    try {
      const estadoJev = {
        observacao_pedido: textoLimpo,
      };

      const perguntas = {
        possui_restricao: typesafeService.criarNoul(
          'Esta observação contém alguma restrição operacional crítica para preparação, saúde ou entrega do pedido?',
          {
            true: 'Contém restrição operacional crítica que a equipe não pode ignorar.',
            false: 'Observação comum, elogio ou sem impacto operacional crítico.',
          }
        ),
        tipo_restricao: typesafeService.criarChoice(
          'Qual a categoria principal desta restrição operacional?',
          {
            alergia_saude: 'Restrição alimentar, alergia, saúde ou ingrediente proibido.',
            horario_entrega: 'Prazo estrito de entrega, urgência ou horário fixo.',
            fragil_manuseio: 'Item frágil, cuidado de transporte, não virar ou quebra.',
            instrucao_especial: 'Instrução específica de entrega, interfone ou entrega em mãos.',
            nenhuma: 'Sem restrição crítica relevante.',
          }
        ),
      };

      const resJev = await typesafeService.avaliar(estadoJev, perguntas, 'jev-latest', 1200);

      const respNoul = resJev.answers.possui_restricao;
      const respChoice = resJev.answers.tipo_restricao;

      const temRestricaoJev = respNoul && respNoul.type === 'noul' ? respNoul.noul >= 0.6 : false;
      const categoriaJev = (respChoice && respChoice.type === 'choice' ? respChoice.choice : 'nenhuma') as
        | TipoRestricaoPedido
        | 'nenhuma';

      if (!temRestricaoJev && categoriaJev === 'nenhuma' && !matchAlergia && !matchHorario && !matchFragil) {
        cacheRestricoes.set(textoLimpo, null);
        return null;
      }

      const tipoFinal: TipoRestricaoPedido =
        categoriaJev !== 'nenhuma'
          ? (categoriaJev as TipoRestricaoPedido)
          : matchAlergia
          ? 'alergia_saude'
          : matchHorario
          ? 'horario_entrega'
          : matchFragil
          ? 'fragil_manuseio'
          : 'instrucao_especial';

      const resultado = this.montarRestricao(tipoFinal, textoLimpo, true);
      cacheRestricoes.set(textoLimpo, resultado);
      return resultado;
    } catch (err) {
      // Fallback local determinístico por palavras-chave
      if (matchAlergia) {
        const res = this.montarRestricao('alergia_saude', textoLimpo, false);
        cacheRestricoes.set(textoLimpo, res);
        return res;
      }
      if (matchHorario) {
        const res = this.montarRestricao('horario_entrega', textoLimpo, false);
        cacheRestricoes.set(textoLimpo, res);
        return res;
      }
      if (matchFragil) {
        const res = this.montarRestricao('fragil_manuseio', textoLimpo, false);
        cacheRestricoes.set(textoLimpo, res);
        return res;
      }

      cacheRestricoes.set(textoLimpo, null);
      return null;
    }
  },

  montarRestricao(tipo: TipoRestricaoPedido, texto: string, avaliadoPorJev: boolean): RestricaoOperacionalPedido {
    switch (tipo) {
      case 'alergia_saude':
        return {
          temRestricao: true,
          tipo: 'alergia_saude',
          rotulo: 'Alergia / Restrição Alimentar',
          cor: 'rose',
          detalhe: texto,
          avaliadoPorJev,
        };
      case 'horario_entrega':
        return {
          temRestricao: true,
          tipo: 'horario_entrega',
          rotulo: 'Horário Estrito de Entrega',
          cor: 'amber',
          detalhe: texto,
          avaliadoPorJev,
        };
      case 'fragil_manuseio':
        return {
          temRestricao: true,
          tipo: 'fragil_manuseio',
          rotulo: 'Item Frágil • Cuidado no Transporte',
          cor: 'amber',
          detalhe: texto,
          avaliadoPorJev,
        };
      case 'instrucao_especial':
      default:
        return {
          temRestricao: true,
          tipo: 'instrucao_especial',
          rotulo: 'Atenção às Observações',
          cor: 'sky',
          detalhe: texto,
          avaliadoPorJev,
        };
    }
  },
};
