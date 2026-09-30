import { typesafeService, RespostaChoice } from './typesafeService';
import { Loja, UsuarioLoja } from '../types';
import {
  DadosLojaRubi,
  encontrarTutorialMaisRelevante,
  responderDuvidaSuporteIA,
  processarPerguntaRubiIA,
  primeiroNomeUsuario,
} from './tutoriaisHubiService';
import { caixaService } from './caixaService';

// Orçamento rígido de latência conforme refinamento de engenharia: 800ms
const RUBI_JEV_TIMEOUT_MS = 800;

export interface RespostaRoteadorRubi {
  texto: string;
  origem: 'jev_instantaneo' | 'tutorial_local' | 'gemini_generativo' | 'fallback_local';
  categoriaDetectada?: string;
  confianca?: number;
  tempoMs?: number;
}

export const rubiRouterService = {
  /**
   * Processa a pergunta do usuário através do pipeline híbrido com Jev (System One).
   * Orçamento de 800ms com fallback não-bloqueante para heurística local.
   */
  async processarPergunta(
    pergunta: string,
    usuario?: UsuarioLoja | null,
    loja?: Loja | null,
    dadosLoja?: DadosLojaRubi
  ): Promise<string> {
    const inicio = Date.now();
    const textoLimpo = (pergunta || '').trim();

    if (!textoLimpo) {
      return 'Olá! Como posso ajudar você e sua loja hoje?';
    }

    // 1. Tenta classificação semântica com Jev (System One) dentro do budget de 800ms
    try {
      const perguntasJev = {
        intencao: typesafeService.criarChoice(
          'Classifique estritamente a intenção desta mensagem de um operador ou lojista no sistema HUBI:',
          {
            CONSULTA_CAIXA: 'Saldo de caixa atual, abertura, fechamento, quebra, sangria, suprimento ou valores em dinheiro do turno',
            GIRO_ESTOQUE: 'Estoque baixo, produtos em falta, itens acabando, reposição ou produtos com estoque zerado',
            VENDAS_PERIODO: 'Faturamento de hoje, total vendido, volume de pedidos, ticket médio ou métricas de vendas',
            CREDITO_FIADO: 'Total em fiado a receber, limite de crédito de clientes, devedores ou cobrança de crediário',
            TUTORIAL_SISTEMA: 'Dúvidas de como fazer, passo a passo, tutoriais de uso, onde clicar, como cadastrar produto, imprimir ou vender',
            CONVERSA_GERAL: 'Saudações, conversas abertas, sugestões de marketing, conselhos estratégicos ou assuntos gerais'
          }
        ),
      };

      const resultado = await typesafeService.avaliar(
        textoLimpo,
        perguntasJev,
        'jev-latest',
        RUBI_JEV_TIMEOUT_MS
      );

      const intencaoChoice = resultado.answers.intencao as RespostaChoice;
      const categoria = intencaoChoice.choice;
      const confianca = intencaoChoice.confidence ?? 0;
      const probabilidade = intencaoChoice.probabilities?.[categoria] ?? confianca;

      // Se a confiança/probabilidade for suficiente (>= 0.70), despacha a rota determinística correspondente
      if (probabilidade >= 0.70 || confianca >= 0.70) {
        // ROTA A: Vendas & Faturamento
        if (categoria === 'VENDAS_PERIODO' && dadosLoja) {
          const {
            faturamento,
            totalPedidos,
            faturamentoHoje,
            totalPedidosHoje,
            faturamentoMes,
            totalPedidosMes,
            dataReferenciaFormatada
          } = dadosLoja;

          const fatHoje = faturamentoHoje !== undefined ? faturamentoHoje : faturamento;
          const qtdHoje = totalPedidosHoje !== undefined ? totalPedidosHoje : totalPedidos;
          const ticketMedioHoje = qtdHoje > 0 ? fatHoje / qtdHoje : 0;
          const dataLabel = dataReferenciaFormatada ? ` (${dataReferenciaFormatada})` : ' (Hoje)';

          let corpoVendas = '';
          if (qtdHoje > 0) {
            corpoVendas = `• **Faturamento:** R$ ${fatHoje.toFixed(2)}\n• **Vendas Concluídas:** ${qtdHoje} pedido(s)\n• **Ticket Médio:** R$ ${ticketMedioHoje.toFixed(2)}`;
          } else {
            corpoVendas = `• **Vendas Concluídas:** Nenhuma venda registrada até o momento nesta data (R$ 0,00).`;
          }

          if (faturamentoMes !== undefined && faturamentoMes > 0 && (qtdHoje === 0 || faturamentoMes !== fatHoje)) {
            corpoVendas += `\n• **Acumulado do Mês:** R$ ${faturamentoMes.toFixed(2)} (${totalPedidosMes || 0} vendas)`;
          }

          return `📊 **Resumo de Vendas${dataLabel}:**\n\n${corpoVendas}\n\n✨ *Dados apurados em tempo real no seu HUBI.*`;
        }

        // ROTA B: Estoque & Reposição
        if (categoria === 'GIRO_ESTOQUE' && dadosLoja) {
          const { produtosAlerta, produtosTotal } = dadosLoja;
          if (produtosAlerta && produtosAlerta.length > 0) {
            const getEstoque = (p: any) => {
              if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
                return p.variacoes.reduce((acc: number, v: any) => acc + Number(v.quantidade_estoque || 0), 0);
              }
              return Number(p.quantidade_estoque || 0);
            };
            const listaAlerta = produtosAlerta
              .slice(0, 5)
              .map(p => `• **${p.nome}**: restam ${getEstoque(p)} un`)
              .join('\n');

            return `⚠️ **Atenção ao Estoque:**\n\nVocê possui **${produtosAlerta.length} produto(s)** com estoque no limite ou abaixo do mínimo:\n\n${listaAlerta}\n\nRecomendo repor esses itens com seus fornecedores para não perder vendas!`;
          } else {
            return `✅ **Estoque Regularizado!**\n\nTodos os seus ${produtosTotal || 0} produtos cadastrados estão com quantidades acima do nível mínimo de alerta.`;
          }
        }

        // ROTA C: Fiado & Crediário
        if (categoria === 'CREDITO_FIADO' && dadosLoja) {
          return `💰 **Controle de Fiado:**\n\nAtualmente há um total de **R$ ${dadosLoja.totalFiado.toFixed(2)}** em haver com clientes.\n\nVocê pode ir na aba **Clientes** para consultar os nomes e enviar lembretes amigáveis de pagamento direto pelo WhatsApp em 1 clique!`;
        }

        // ROTA D: Consulta de Caixa
        if (categoria === 'CONSULTA_CAIXA' && loja?.id) {
          try {
            const sessaoAtiva = await caixaService.obterSessaoAtiva(loja.id, undefined, usuario?.id);
            if (sessaoAtiva) {
              const fundo = Number(sessaoAtiva.fundo_inicial || 0);
              const saldoEsperado = Number(sessaoAtiva.saldo_esperado_dinheiro || 0);
              const entradas = Number(sessaoAtiva.total_entradas_sistema || 0);
              const saidas = Number(sessaoAtiva.total_saidas_sistema || 0);

              return `💵 **Status da Sessão de Caixa Atual:**\n\n• **Terminal:** ${sessaoAtiva.terminal_id || 'PDV-01'}\n• **Status:** Aberto\n• **Fundo Inicial:** R$ ${fundo.toFixed(2)}\n• **Saldo Atual em Dinheiro:** R$ ${saldoEsperado.toFixed(2)}\n• **Entradas:** R$ ${entradas.toFixed(2)} | **Saídas:** R$ ${saidas.toFixed(2)}\n\nPara fechamento ou conferência detalhada, acesse o menu **Caixa** no PDV.`;
            } else {
              return `ℹ️ **Caixa do Turno Fechado:**\n\nNão há nenhuma sessão de caixa aberta neste terminal para o seu operador no momento.\n\nPara iniciar as vendas do dia e registrar entradas em dinheiro, acesse o **PDV** e realize a **Abertura de Caixa**.`;
            }
          } catch {
            // Em caso de falha na consulta de caixa, segue para o suporte normal
          }
        }

        // ROTA E: Tutoriais e Passo a Passo do Sistema
        if (categoria === 'TUTORIAL_SISTEMA') {
          const tutorial = encontrarTutorialMaisRelevante(textoLimpo);
          if (tutorial) {
            const nomeUsuario = primeiroNomeUsuario(usuario?.nome_completo);
            return `Olá, **${nomeUsuario}**! 😊\n\nAqui está o passo a passo sobre **${tutorial.titulo}** no HUBI:\n\n${tutorial.conteudo}\n\n**Passo a passo prático:**\n${tutorial.passos.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\nSe precisar de mais detalhes ou tiver outra dúvida, conte comigo! 👍`;
          }
        }

        // ROTA F: Conversa Aberta ou Dúvida que exige síntese
        if (categoria === 'CONVERSA_GERAL') {
          return await responderDuvidaSuporteIA(textoLimpo, usuario, loja);
        }
      }
    } catch (_err) {
      // Degradação graciosa (Latency budget atingido ou erro de conexão no Jev)
      // O pipeline não trava e cai suavemente no fallback local
    }

    // 2. FALLBACK DEFENSIVO LOCAL (Heurística e Tutoriais clássicos do HUBI)
    return await processarPerguntaRubiIA(textoLimpo, usuario, loja, dadosLoja);
  },
};
