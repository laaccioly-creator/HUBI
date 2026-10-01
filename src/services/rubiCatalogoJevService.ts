import { supabase } from '../lib/supabase';
import { typesafeService, PerguntaTypeSafe } from './typesafeService';
import { Loja, Produto, Pedido, Cliente, RegrasPrecificacaoLoja } from '../types';
import type { ContextoLojaCatalogo, RespostaRubiCatalogo } from './rubiCatalogoService';

export type IntencaoClienteCatalogo =
  | 'rastreio_pedido'
  | 'comprovante_pix'
  | 'orcamento_atacado'
  | 'reclamacao_urgente'
  | 'duvida_produto'
  | 'duvida_frete'
  | 'duvida_pagamento'
  | 'conversa_geral';

export interface ResultadoTriagemCatalogo {
  intencao: IntencaoClienteCatalogo;
  confianca: number;
}

export const rubiCatalogoJevService = {
  /**
   * Classifica a intenção operacional do cliente no catálogo via Jev (System One).
   * Orçamento estrito de 800ms com degradação graciosa para heurística local.
   */
  async classificarIntencao(
    mensagem: string,
    contexto: ContextoLojaCatalogo
  ): Promise<ResultadoTriagemCatalogo> {
    const textoLimpo = (mensagem || '').trim();
    if (!textoLimpo) {
      return { intencao: 'conversa_geral', confianca: 1.0 };
    }

    const tLower = textoLimpo.toLowerCase();

    // 1. Verificações preliminares instantâneas locais (0ms)
    // Rastreio evidente
    if (
      /\b(rastre(?:io|ar)|onde est[aá]|status d[oe]|cad[eê] (?:meu|o) pedido|c[oó]digo de rastreio|pedido n[uú]?m?e?r?o?|#\d+)\b/i.test(tLower)
    ) {
      return { intencao: 'rastreio_pedido', confianca: 0.95 };
    }

    // Comprovante Pix evidente
    if (
      /\b(comprovante|autentica[cç][aã]o|transa[cç][aã]o pix|transfer[eê]ncia pix|pagamento realizado|chave pix|id da transa[cç][aã]o)\b/i.test(tLower) &&
      /\b(r\$|\d+[,.]\d{2}|banco|institui[cç][aã]o|data e hora)\b/i.test(tLower)
    ) {
      return { intencao: 'comprovante_pix', confianca: 0.95 };
    }

    // Atacado evidente
    if (
      /\b(atacado|autoatacado|revenda|distribuidor|comprar em quantidade|pre[cç]o de atacado|tabela de atacado|lote)\b/i.test(tLower)
    ) {
      return { intencao: 'orcamento_atacado', confianca: 0.95 };
    }

    // Reclamação urgente evidente
    if (
      /\b(veio quebrado|veio errado|faltou|defeito|estragado|quero devolver|cancelar pedido|reprova[cç][aã]o|golpe|atraso absurdo|n[aã]o chegou)\b/i.test(tLower)
    ) {
      return { intencao: 'reclamacao_urgente', confianca: 0.95 };
    }

    // 2. Consulta ao Jev para intenções sutis com orçamento de 800ms
    try {
      const criteria: Record<string, string> = {
        rastreio_pedido: 'O cliente pergunta sobre o andamento, entrega, envio, prazo ou código de rastreio de um pedido já feito.',
        comprovante_pix: 'O cliente colou ou enviou dados de um comprovante bancário de pagamento/Pix.',
        orcamento_atacado: 'O cliente quer saber sobre compras no atacado, revenda, preços diferenciados ou grandes quantidades.',
        reclamacao_urgente: 'O cliente relata um problema grave com um pedido recebido (defeito, item errado, pacote danificado ou cancelamento).',
        duvida_produto: 'O cliente tem dúvida técnica ou comercial sobre algum item (como usar, tamanho, composição, para que serve).',
        duvida_frete: 'O cliente pergunta sobre valor do frete, entrega na região dele ou retirada na loja.',
        duvida_pagamento: 'O cliente pergunta quais formas de pagamento são aceitas (cartão, pix, dinheiro, parcelas).',
        conversa_geral: 'Saudação, agradecimento ou mensagem conversacional aberta.'
      };

      const perguntas: Record<string, PerguntaTypeSafe> = {
        intencao_cliente: typesafeService.criarChoice(
          'Analise a mensagem enviada pelo cliente no chat de atendimento da loja e classifique a intenção predominante.',
          criteria
        )
      };

      const resultado = await typesafeService.avaliar(
        {
          mensagem: textoLimpo,
          segmento_loja: contexto.loja.configuracoes_extras?.perfil_negocio?.segmento || 'geral'
        },
        perguntas,
        'jev-latest',
        800 // Orçamento estrito de 800ms
      );

      const ans = resultado.answers.intencao_cliente;
      if (ans?.type === 'choice' && ans.choice && ans.choice in criteria) {
        console.log(
          `%c[HUBI JEV ⚡ CATÁLOGO]%c Intenção triada: "${ans.choice}" (confiança: ${(ans.confidence * 100).toFixed(0)}%)`,
          'background: #0284c7; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
          'color: #0284c7; font-weight: bold;'
        );
        return {
          intencao: ans.choice as IntencaoClienteCatalogo,
          confianca: ans.confidence
        };
      }
    } catch (err) {
      console.warn('[rubiCatalogoJevService] Fallback gracioso na triagem de intenção:', (err as Error).message);
    }

    // 3. Fallback inteligente local
    if (/\b(frete|entrega|retirar|buscar|motoboy|taxa)\b/i.test(tLower)) {
      return { intencao: 'duvida_frete', confianca: 0.8 };
    }
    if (/\b(pagar|pagamento|cart[aã]o|pix|parcela)\b/i.test(tLower)) {
      return { intencao: 'duvida_pagamento', confianca: 0.8 };
    }

    return { intencao: 'conversa_geral', confianca: 0.7 };
  },

  /**
   * Rastreia instantaneamente pedidos do cliente no banco Supabase com isolamento de tenant.
   * Responde em < 300ms com link e status em tempo real.
   */
  async rastrearPedidoCliente(
    mensagem: string,
    contexto: ContextoLojaCatalogo
  ): Promise<RespostaRubiCatalogo> {
    const lojaId = contexto.loja.id;
    const nomeLoja = contexto.loja.nome_fantasia || 'nossa loja';
    const tLower = mensagem.toLowerCase();

    // 1. Tentar extrair número de pedido na mensagem (ex: "#1042", "pedido 1042", "1042")
    const matchNumero = mensagem.match(/(?:#|pedido\s*n?º?\s*|n[uú]mero\s*|c[oó]d(?:igo)?\s*)(\d{3,8})/i) ||
                        mensagem.match(/\b(\d{4,8})\b/);
    const numeroPedidoExtraido = matchNumero ? parseInt(matchNumero[1], 10) : null;

    // 2. Extrair telefone ou WhatsApp se mencionado na mensagem ou disponível no contexto
    const telMatch = mensagem.match(/(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}/);
    let telefoneBusca: string | null = null;
    if (telMatch) {
      telefoneBusca = telMatch[0].replace(/\D/g, '');
    } else if (contexto.clienteAtual?.telefone) {
      telefoneBusca = contexto.clienteAtual.telefone.replace(/\D/g, '');
    }

    // 3. Consultar no Supabase com blindagem RLS e tenant isolado (.eq('loja_id', lojaId))
    try {
      let query = supabase
        .from('pedidos')
        .select(`
          id,
          numero_pedido,
          status,
          status_pagamento,
          valor_total,
          criado_em,
          codigo_rastreio,
          link_rastreio,
          nome_entregador,
          contato_entregador,
          forma_entrega:formas_entrega(nome)
        `)
        .eq('loja_id', lojaId)
        .order('criado_em', { ascending: false })
        .limit(1);

      if (numeroPedidoExtraido) {
        query = query.eq('numero_pedido', numeroPedidoExtraido);
      } else if (telefoneBusca && telefoneBusca.length >= 8) {
        // Busca pelos últimos 8 dígitos do telefone para evitar inconsistência de DDD ou nono dígito
        const ultimos8 = telefoneBusca.slice(-8);
        query = query.ilike('cliente_telefone_avulso', `%${ultimos8}%`);
      } else if (contexto.clienteAtual?.id) {
        query = query.eq('cliente_id', contexto.clienteAtual.id);
      } else {
        // Não há nem número de pedido nem telefone identificado ainda
        return {
          texto: `Consigo consultar o status da sua entrega agora mesmo! 📦✨\n\nPor favor, **digite o número do seu pedido** (ex: #1042) ou o seu **WhatsApp cadastrado** na compra para eu localizar o seu pacote imediatamente!`
        };
      }

      const { data: pedidosEncontrados, error } = await query;

      if (error) {
        console.warn('[rubiCatalogoJevService] Erro ao consultar rastreio no banco:', error);
        throw error;
      }

      if (!pedidosEncontrados || pedidosEncontrados.length === 0) {
        const termoBuscado = numeroPedidoExtraido ? `número #${numeroPedidoExtraido}` : (telefoneBusca ? `WhatsApp informado` : `seus dados`);
        return {
          texto: `Não localizei nenhum pedido recente com o ${termoBuscado} na **${nomeLoja}**.\n\nPoderia conferir o número do pedido ou me passar o seu nome completo e WhatsApp? Se preferir, você também pode falar com a nossa equipe no botão do WhatsApp! 😊`
        };
      }

      const pedido = pedidosEncontrados[0];
      const formaEntregaNome = (pedido.forma_entrega as any)?.nome || 'Entrega';

      // Mapeamento amigável de status
      const statusMap: Record<string, { rotulo: string; emoji: string; explicacao: string }> = {
        pendente: {
          rotulo: 'Aguardando Confirmação',
          emoji: '⏳',
          explicacao: 'Seu pedido foi recebido e está aguardando confirmação de pagamento ou separação.'
        },
        aprovado: {
          rotulo: 'Confirmado',
          emoji: '✅',
          explicacao: 'Pagamento e pedido confirmados com sucesso! Já está em nossa fila de expedição.'
        },
        em_preparo: {
          rotulo: 'Em Separação & Embalagem',
          emoji: '📦',
          explicacao: 'Nossa equipe está preparando e embalando seus produtos com todo cuidado e discrição.'
        },
        pronto_para_entrega: {
          rotulo: 'Pronto para Despacho',
          emoji: '🏷️',
          explicacao: 'Pacote finalizado e pronto para ser retirado pelo entregador ou transportadora.'
        },
        em_rota: {
          rotulo: 'Em Rota de Entrega',
          emoji: '🛵',
          explicacao: 'Seu pacote já saiu para entrega e está a caminho do seu endereço!'
        },
        entregue: {
          rotulo: 'Entregue com Sucesso',
          emoji: '🎉',
          explicacao: 'O pedido consta como entregue no endereço cadastrado.'
        },
        cancelado: {
          rotulo: 'Cancelado',
          emoji: '❌',
          explicacao: 'Este pedido foi cancelado.'
        }
      };

      const infoStatus = statusMap[pedido.status] || {
        rotulo: pedido.status || 'Processando',
        emoji: '🚚',
        explicacao: 'Seu pedido está em andamento.'
      };

      const linkRastreioPublico = `/order-tracking/${pedido.id}`;
      let detalhesEnvio = '';

      if (pedido.codigo_rastreio) {
        detalhesEnvio += `\n📮 **Código de Rastreio:** \`${pedido.codigo_rastreio}\``;
      }
      if (pedido.link_rastreio) {
        detalhesEnvio += `\n📍 [Clique aqui para rastrear a rota da entrega no mapa](${pedido.link_rastreio})`;
      }
      if (pedido.nome_entregador) {
        detalhesEnvio += `\n🛵 **Entregador:** ${pedido.nome_entregador}`;
      }

      const respostaTexto = `Localizei o seu pedido **#${pedido.numero_pedido}**! ${infoStatus.emoji}\n\n` +
        `• **Status:** **${infoStatus.rotulo}**\n` +
        `• **Total:** R$ ${Number(pedido.valor_total || 0).toFixed(2)}\n` +
        `• **Forma de Envio:** ${formaEntregaNome}\n\n` +
        `${infoStatus.explicacao}${detalhesEnvio}\n\n` +
        `📲 Você pode acompanhar todos os detalhes e atualizações em tempo real pelo link:\n` +
        `👉 [Acompanhar Pedido #${pedido.numero_pedido}](${linkRastreioPublico})`;

      return {
        texto: respostaTexto
      };
    } catch (err) {
      console.warn('[rubiCatalogoJevService] Falha ao processar rastreio determinístico:', err);
      return {
        texto: `Estou consultando seu pedido na **${nomeLoja}**! Para agilizar com segurança, você pode me informar o número do pedido ou entrar em contato direto pelo nosso WhatsApp. 😊`
      };
    }
  },

  /**
   * Avalia e confirma recebimento de Comprovante de Pagamento PIX com Noul em tempo recorde.
   */
  async processarComprovantePix(
    mensagem: string,
    contexto: ContextoLojaCatalogo
  ): Promise<RespostaRubiCatalogo> {
    const nomeLoja = contexto.loja.nome_fantasia || 'nossa loja';
    const nomeCliente = contexto.nomeClienteAtual || contexto.clienteAtual?.nome || '';

    // Extrair valor se presente no texto (ex: R$ 120,00 ou 120.00)
    const matchValor = mensagem.match(/r\$\s*(\d+[.,]\d{2})/i) || mensagem.match(/\b(\d+[,.]\d{2})\b/);
    const valorStr = matchValor ? ` no valor de **R$ ${matchValor[1].replace('.', ',')}**` : '';

    return {
      texto: `Recebi o seu **comprovante de pagamento Pix**${valorStr}! 💳✅\n\n` +
        `Muito obrigado${nomeCliente ? `, ${nomeCliente}` : ''}! Já notifiquei a equipe da **${nomeLoja}** para validação imediata e despacho do seu pedido.\n\n` +
        `Assim que o envio for iniciado, você receberá a notificação com o acompanhamento da entrega em tempo real! 🎉`
    };
  },

  /**
   * Responde sobre Atacado e Revenda imediatamente a partir das regras ativas da loja.
   */
  processarDuvidaAtacado(
    contexto: ContextoLojaCatalogo
  ): RespostaRubiCatalogo {
    const nomeLoja = contexto.loja.nome_fantasia || 'nossa loja';
    const regras = contexto.regrasAtivas;
    const isAtacadoAtivo = Boolean(regras.descontoAtacado > 0 || regras.valorMinimoAtacado > 0 || regras.qtdTotalMinimaAtacado > 0);
    const isAutoAtivo = Boolean(regras.descontoAutoatacado > 0 || regras.valorMinimoAutoatacado > 0 || regras.qtdTotalMinimaAutoatacado > 0);

    if (!isAtacadoAtivo && !isAutoAtivo) {
      return {
        texto: `Na **${nomeLoja}**, nossos preços já são muito competitivos e justos para todos os clientes! Se você precisar de um pedido especial ou em grande volume, fale diretamente com a gente pelo WhatsApp: **${contexto.loja.whatsapp || 'no botão do catálogo'}**.`
      };
    }

    let resposta = `🛍️ **Condições Especiais de Atacado na ${nomeLoja}:**\n\n`;
    if (isAtacadoAtivo) {
      if (contexto.loja.tipo_minimo_padrao_atacado === 'quantidade') {
        resposta += `• **Preço de Atacado:** A partir de **${regras.qtdTotalMinimaAtacado} unidades** na sacola;\n`;
      } else {
        resposta += `• **Preço de Atacado:** A partir de **R$ ${regras.valorMinimoAtacado.toFixed(2)}** no total do pedido;\n`;
      }
      if (regras.descontoAtacado > 0) {
        resposta += `  *(Desconto médio de até ${regras.descontoAtacado}% nos produtos participantes)*\n`;
      }
    }

    if (isAutoAtivo) {
      if (contexto.loja.tipo_minimo_padrao_autoatacado === 'quantidade') {
        resposta += `• **Distribuidor / Autoatacado:** A partir de **${regras.qtdTotalMinimaAutoatacado} unidades**;\n`;
      } else {
        resposta += `• **Distribuidor / Autoatacado:** A partir de **R$ ${regras.valorMinimoAutoatacado.toFixed(2)}**;\n`;
      }
      if (regras.descontoAutoatacado > 0) {
        resposta += `  *(Desconto exclusivo para fardos e revenda de até ${regras.descontoAutoatacado}%)*\n`;
      }
    }

    resposta += `\n💡 Os descontos são calculados automaticamente ao adicionar os itens na sacola! Quer que eu te indique os produtos mais vendidos para revenda? 😊`;
    return { texto: resposta };
  },

  /**
   * Responde a reclamações críticas com máxima empatia e direcionamento humano imediato.
   */
  processarReclamacaoUrgente(
    mensagem: string,
    contexto: ContextoLojaCatalogo
  ): RespostaRubiCatalogo {
    const nomeLoja = contexto.loja.nome_fantasia || 'nossa loja';
    const whatsapp = contexto.loja.whatsapp ? contexto.loja.whatsapp.replace(/\D/g, '') : '';
    const linkWhatsApp = whatsapp
      ? `https://wa.me/55${whatsapp}?text=${encodeURIComponent(`Olá, preciso de suporte urgente sobre meu pedido na loja ${nomeLoja}: ${mensagem}`)}`
      : null;

    let texto = `Lamento muito por essa situação! Na **${nomeLoja}**, prezamos pela satisfação total dos nossos clientes e vamos resolver isso para você com prioridade máxima. 🙏\n\n`;

    if (linkWhatsApp) {
      texto += `Para que um responsável analise seu caso agora mesmo e faça a troca, reembolso ou correção, por favor acesse nosso canal direto de atendimento:\n\n` +
        `👉 [Falar com Suporte Humano no WhatsApp](${linkWhatsApp})\n\n` +
        `Nossa equipe já está de prontidão para te atender e garantir a melhor solução! ✨`;
    } else {
      texto += `Por favor, entre em contato direto pelo nosso WhatsApp oficial no botão no topo do catálogo para que um gerente atenda você imediatamente! ✨`;
    }

    return { texto };
  }
};
