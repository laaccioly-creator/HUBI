import { supabase } from '../lib/supabase';
import { typesafeService } from './typesafeService';
import { Cliente } from '../types';

export type NivelRiscoCredito = 'baixo' | 'moderado' | 'alto';

export interface AvaliacaoRiscoCredito {
  score: 0 | 1 | 2; // 0 = Baixo Risco, 1 = Risco Moderado, 2 = Alto Risco
  nivel: NivelRiscoCredito;
  titulo: string;
  recomendacao: string;
  badgeCor: 'emerald' | 'amber' | 'rose';
  percentualComprometimento: number;
  totalFiadosQuitados: number;
  totalFiadosVencidos: number;
  maiorAtrasoDias: number;
  sugerirAprovacao: boolean;
  avaliadoPorJev: boolean;
}

export interface ParametrosAvaliacaoRisco {
  cliente: Cliente;
  lojaId: string;
  valorVendaAtual: number;
}

/**
 * Cache em memória para evitar chamadas redundantes durante digitação
 * Chave: `${clienteId}_${valorVendaAtualArredondado}`
 */
const cacheRiscoCredito = new Map<string, AvaliacaoRiscoCredito>();

export const creditRiskJevService = {
  /**
   * Avalia preditivamente o risco de crédito na concessão de venda fiado
   * utilizando o Jev (TypeSafe) com fallback determinístico local resiliente.
   */
  async avaliarRiscoFiado(params: ParametrosAvaliacaoRisco): Promise<AvaliacaoRiscoCredito> {
    const { cliente, lojaId, valorVendaAtual } = params;
    if (!cliente || !cliente.id || !lojaId) {
      return this.gerarFallbackPadrao(cliente, valorVendaAtual);
    }

    const valorArredondado = Math.round(Number(valorVendaAtual || 0) * 10) / 10;
    const chaveCache = `${cliente.id}_${valorArredondado}`;

    if (cacheRiscoCredito.has(chaveCache)) {
      return cacheRiscoCredito.get(chaveCache)!;
    }

    try {
      // 1. Coleta do histórico comportamental do cliente no Supabase
      const { data: pedidosCliente } = await supabase
        .from('pedidos')
        .select(`
          id,
          valor_total,
          valor_pago,
          saldo_devedor,
          fiado_quitado,
          data_venda,
          data_vencimento_fiado,
          criado_em,
          pagamentos:pagamentos_pedido(
            eh_pagamento_fiado,
            data_pagamento,
            forma_pagamento:formas_pagamento(tipo)
          )
        `)
        .eq('loja_id', lojaId)
        .eq('cliente_id', cliente.id)
        .neq('status', 'cancelado')
        .order('criado_em', { ascending: false })
        .limit(30);

      let totalFiadosQuitados = 0;
      let totalFiadosVencidos = 0;
      let maiorAtrasoDias = 0;
      let saldoTotalDevedor = 0;
      const agora = new Date();

      if (pedidosCliente && pedidosCliente.length > 0) {
        pedidosCliente.forEach((p: any) => {
          const saldo = Number(p.saldo_devedor ?? (Number(p.valor_total || 0) - Number(p.valor_pago || 0)));
          const temFiado = (p.pagamentos || []).some(
            (pag: any) => pag.eh_pagamento_fiado || pag.forma_pagamento?.tipo === 'fiado'
          );

          if (temFiado || p.fiado_quitado !== null) {
            if (p.fiado_quitado === true || saldo <= 0) {
              totalFiadosQuitados += 1;
            } else {
              saldoTotalDevedor += saldo;
              if (p.data_vencimento_fiado) {
                const venc = new Date(p.data_vencimento_fiado);
                if (venc < agora) {
                  totalFiadosVencidos += 1;
                  const diffDias = Math.floor((agora.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));
                  if (diffDias > maiorAtrasoDias) {
                    maiorAtrasoDias = diffDias;
                  }
                }
              }
            }
          }
        });
      }

      const limiteTotal = Number(cliente.limite_credito || 0);
      const novoSaldoEstimado = saldoTotalDevedor + valorVendaAtual;
      const percentualComprometimento = limiteTotal > 0 ? (novoSaldoEstimado / limiteTotal) * 100 : 100;

      // 2. Monta o estado objetivo para julgamento probabilístico do Jev
      const estadoJev = {
        cliente_nome: cliente.nome,
        limite_credito_cadastrado: limiteTotal,
        saldo_devedor_atual: saldoTotalDevedor,
        valor_nova_venda_pretendida: valorVendaAtual,
        novo_saldo_se_aprovado: novoSaldoEstimado,
        percentual_limite_comprometido: Math.round(percentualComprometimento),
        historico_fiados_quitados: totalFiadosQuitados,
        pedidos_atualmente_vencidos: totalFiadosVencidos,
        maior_atraso_historico_dias: maiorAtrasoDias,
        bloqueio_manual_cliente: !cliente.permite_fiado,
      };

      // 3. Consulta ao modelo Jev com orçamento de latência estrito (1500ms)
      const perguntas = {
        risco_credito: typesafeService.criarScore(
          'Avalie o nível de risco de crédito para esta nova concessão de venda fiado com base no comportamento e limite do cliente.',
          [
            'Baixo Risco: Cliente com bom histórico, quitações anteriores, sem parcelas vencidas e limite confortável.',
            'Risco Moderado: Limite comprometido próximo ao teto (>80%) ou histórico com atrasos leves esporádicos.',
            'Alto Risco: Limite excedido, parcelas vencidas há dias ou inadimplência recorrente.',
          ]
        ),
        sugestao_aprovacao: typesafeService.criarNoul(
          'Recomenda a aprovação da venda fiado para este cliente nesta condição?',
          {
            true: 'Recomenda aprovar a venda fiado com segurança.',
            false: 'Recomenda restrição, solicitação de entrada ou recusa da venda a prazo.',
          }
        ),
      };

      const resultadoJev = await typesafeService.avaliar(estadoJev, perguntas, 'jev-latest', 1500);

      const respScore = resultadoJev.answers.risco_credito;
      const respNoul = resultadoJev.answers.sugestao_aprovacao;

      let scoreFinal: 0 | 1 | 2 = 0;
      if (respScore && respScore.type === 'score') {
        scoreFinal = Math.min(2, Math.max(0, respScore.score)) as 0 | 1 | 2;
      } else {
        // Fallback determinístico caso o Jev não devolva score
        scoreFinal = this.calcularScoreDeterministo(totalFiadosVencidos, percentualComprometimento, maiorAtrasoDias);
      }

      const sugerirAprovacaoFinal =
        respNoul && respNoul.type === 'noul'
          ? respNoul.noul >= 0.5
          : scoreFinal !== 2 && percentualComprometimento <= 100;

      const avaliacao = this.construirResultado(
        scoreFinal,
        sugerirAprovacaoFinal,
        percentualComprometimento,
        totalFiadosQuitados,
        totalFiadosVencidos,
        maiorAtrasoDias,
        true
      );

      cacheRiscoCredito.set(chaveCache, avaliacao);
      return avaliacao;
    } catch (err) {
      console.warn('Jev Offline/Timeout no Score de Fiado. Utilizando fallback analítico local:', err);
      const fallback = this.gerarFallbackPadrao(cliente, valorVendaAtual);
      cacheRiscoCredito.set(chaveCache, fallback);
      return fallback;
    }
  },

  calcularScoreDeterministo(vencidos: number, comprometimento: number, diasAtraso: number): 0 | 1 | 2 {
    if (vencidos > 0 || diasAtraso > 15 || comprometimento > 105) {
      return 2; // Alto Risco
    }
    if (comprometimento > 80 || diasAtraso > 0 || vencidos > 0) {
      return 1; // Risco Moderado
    }
    return 0; // Baixo Risco
  },

  gerarFallbackPadrao(cliente: Cliente, valorVendaAtual: number): AvaliacaoRiscoCredito {
    const limite = Number(cliente?.limite_credito || 0);
    const perc = limite > 0 ? (valorVendaAtual / limite) * 100 : 100;
    const score = perc > 100 ? 2 : perc > 80 ? 1 : 0;

    return this.construirResultado(
      score,
      score !== 2,
      perc,
      0,
      0,
      0,
      false
    );
  },

  construirResultado(
    score: 0 | 1 | 2,
    sugerirAprovacao: boolean,
    percentualComprometimento: number,
    quitados: number,
    vencidos: number,
    maiorAtraso: number,
    avaliadoPorJev: boolean
  ): AvaliacaoRiscoCredito {
    if (score === 2) {
      return {
        score: 2,
        nivel: 'alto',
        titulo: 'Alto Risco de Inadimplência',
        recomendacao:
          vencidos > 0
            ? `Cliente possui ${vencidos} fiado(s) vencido(s). Recomendada quitação antes de novo crédito.`
            : percentualComprometimento > 100
            ? `Venda excede o limite disponível (${Math.round(percentualComprometimento)}% comprometido).`
            : 'Histórico aponta risco elevado. Solicite autorização da gerência.',
        badgeCor: 'rose',
        percentualComprometimento,
        totalFiadosQuitados: quitados,
        totalFiadosVencidos: vencidos,
        maiorAtrasoDias: maiorAtraso,
        sugerirAprovacao: false,
        avaliadoPorJev,
      };
    }

    if (score === 1) {
      return {
        score: 1,
        nivel: 'moderado',
        titulo: 'Risco Moderado • Atenção ao Prazo',
        recomendacao:
          percentualComprometimento > 80
            ? `Limite ficará quase esgotado (${Math.round(percentualComprometimento)}%). Combine prazo curto de quitação.`
            : 'Histórico regular. Concessão recomendada com alinhamento de data de acerto.',
        badgeCor: 'amber',
        percentualComprometimento,
        totalFiadosQuitados: quitados,
        totalFiadosVencidos: vencidos,
        maiorAtrasoDias: maiorAtraso,
        sugerirAprovacao: true,
        avaliadoPorJev,
      };
    }

    return {
      score: 0,
      nivel: 'baixo',
      titulo: 'Crédito Saudável • Confiável',
      recomendacao:
        quitados > 0
          ? `Excelente histórico (${quitados} compras quitadas pontualmente). Venda recomendada.`
          : 'Cliente com limite disponível e sem restrições pendentes.',
      badgeCor: 'emerald',
      percentualComprometimento,
      totalFiadosQuitados: quitados,
      totalFiadosVencidos: vencidos,
      maiorAtrasoDias: maiorAtraso,
      sugerirAprovacao: true,
      avaliadoPorJev,
    };
  },
};
