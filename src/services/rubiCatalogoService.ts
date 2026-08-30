import { getGeminiApiKey, executarRequisicaoGemini } from './geminiService';
import { Loja, Produto, Categoria, FormaEntrega, RegrasPrecificacaoLoja } from '../types';

export interface ContextoLojaCatalogo {
  loja: Loja;
  categorias: Categoria[];
  produtos: Produto[];
  formasEntrega: FormaEntrega[];
  regrasAtivas: RegrasPrecificacaoLoja;
}

export const normalizarTexto = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

/**
 * Motor da Rubi IA treinado especificamente para suporte e atendimento a clientes no Catálogo Online.
 */
export const responderPerguntaClienteCatalogo = async (
  pergunta: string,
  contexto: ContextoLojaCatalogo
): Promise<string> => {
  const { loja, categorias, produtos, formasEntrega, regrasAtivas } = contexto;
  const pNorm = normalizarTexto(pergunta);
  const nomeLoja = loja.nome_fantasia || 'nossa loja';

  // 1. DÚVIDAS SOBRE ATACADO / DISTRIBUIDOR / DESCONTOS POR QUANTIDADE OU VALOR
  const termosAtacado = ['atacado', 'autoatacado', 'distribuidor', 'desconto', 'comprar no atacado', 'minimo atacado', 'tabela atacado', 'preco atacado', 'quantidade minima', 'valor minimo'];
  if (termosAtacado.some(t => pNorm.includes(t))) {
    const isAtacadoAtivo = Boolean(regrasAtivas.descontoAtacado > 0 || regrasAtivas.valorMinimoAtacado > 0 || regrasAtivas.qtdTotalMinimaAtacado > 0);
    const isAutoAtivo = Boolean(regrasAtivas.descontoAutoatacado > 0 || regrasAtivas.valorMinimoAutoatacado > 0 || regrasAtivas.qtdTotalMinimaAutoatacado > 0);

    if (!isAtacadoAtivo && !isAutoAtivo) {
      return `Aqui na **${nomeLoja}**, nossos preços já são os melhores e praticamos valor único para todos os clientes! Se precisar de uma negociação especial para grandes lotes, você pode falar diretamente conosco no WhatsApp da loja: **${loja.whatsapp || loja.telefone || 'no menu do catálogo'}**. 😊`;
    }

    let resposta = `🛍️ **Como funciona o Atacado na ${nomeLoja}:**\n\n`;

    if (isAtacadoAtivo) {
      const tipo = loja.tipo_minimo_padrao_atacado || 'valor';
      const desc = regrasAtivas.descontoAtacado;
      if (tipo === 'quantidade') {
        resposta += `• **Preço de Atacado:** Comprando a partir de **${regrasAtivas.qtdTotalMinimaAtacado} ${regrasAtivas.qtdTotalMinimaAtacado === 1 ? 'peça' : 'peças'}** no carrinho, você ganha automaticamente o preço de atacado (cerca de **${desc}% de desconto** nos produtos elegíveis).\n`;
      } else {
        resposta += `• **Preço de Atacado:** Atingindo **R$ ${regrasAtivas.valorMinimoAtacado.toFixed(2)}** no total do carrinho, os preços de atacado são aplicados automaticamente!\n`;
      }
    }

    if (isAutoAtivo) {
      const tipo = loja.tipo_minimo_padrao_autoatacado || 'valor';
      const desc = regrasAtivas.descontoAutoatacado;
      if (tipo === 'quantidade') {
        resposta += `• **Preço Distribuidor (Autoatacado):** Para revendedores e compras a partir de **${regrasAtivas.qtdTotalMinimaAutoatacado} peças**, o desconto é ainda maior (cerca de **${desc}% de desconto**).\n`;
      } else {
        resposta += `• **Preço Distribuidor (Autoatacado):** Atingindo **R$ ${regrasAtivas.valorMinimoAutoatacado.toFixed(2)}** no carrinho, você desbloqueia a tabela especial de Distribuidor!\n`;
      }
    }

    resposta += `\n💡 *Dica:* Conforme você vai adicionando itens ao carrinho, a barra de progresso no topo mostra exatamente quanto falta para desbloquear o próximo nível de desconto!`;
    return resposta;
  }

  // 2. DÚVIDAS SOBRE FORMAS DE PAGAMENTO
  const termosPagamento = ['pagamento', 'pagar', 'pix', 'cartao', 'credito', 'debito', 'dinheiro', 'parcelar', 'parcelamento', 'mercado pago'];
  if (termosPagamento.some(t => pNorm.includes(t))) {
    const mpAtivo = Boolean(loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.ativo);
    let formas = [];
    if (mpAtivo) formas.push('**Pix Automático (Mercado Pago)** com QR Code e confirmação imediata');
    formas.push('**Cartão de Crédito e Débito**');
    formas.push('**Dinheiro / Pagamento na Entrega ou Retirada**');
    formas.push('**Pix Manual (Chave da loja)**');

    return `💳 **Formas de Pagamento Aceitas na ${nomeLoja}:**\n\n${formas.map(f => `• ${f}`).join('\n')}\n\nVocê pode escolher sua forma favorita no momento de fechar o pedido no carrinho!`;
  }

  // 3. DÚVIDAS SOBRE ENTREGA, FRETE E RETIRADA
  const termosEntrega = ['entrega', 'frete', 'entregar', 'taxa de entrega', 'retirada', 'retirar', 'buscar', 'onde fica', 'endereco da loja'];
  if (termosEntrega.some(t => pNorm.includes(t))) {
    let formasTexto = '';
    if (formasEntrega && formasEntrega.length > 0) {
      formasTexto = formasEntrega.map(fe => `• **${fe.nome}**: R$ ${Number(fe.valor_taxa).toFixed(2)}${fe.tempo_estimado ? ` (${fe.tempo_estimado})` : ''}`).join('\n');
    } else {
      formasTexto = '• **Entrega Padrão ou Retirada no Balcão**';
    }

    let endTexto = '';
    if (loja.endereco_logradouro) {
      endTexto = `\n📍 **Endereço da Loja:** ${loja.endereco_logradouro}, ${loja.endereco_numero || 'S/N'}${loja.endereco_bairro ? ` - ${loja.endereco_bairro}` : ''}${loja.endereco_cidade ? `, ${loja.endereco_cidade}` : ''}`;
    }

    return `🚚 **Opções de Entrega e Retirada:**\n\n${formasTexto}${endTexto}\n\nNo carrinho, basta clicar em **Endereço** para informar onde quer receber ou marcar retirada!`;
  }

  // 4. DÚVIDAS SOBRE CUPOM DE DESCONTO
  const termosCupom = ['cupom', 'codigo de desconto', 'desconto promocional', 'cupom de desconto'];
  if (termosCupom.some(t => pNorm.includes(t))) {
    return `🎟️ **Como usar Cupom de Desconto:**\n\n1. Adicione os itens desejados ao carrinho;\n2. Abra o carrinho e role até o campo **"Possui cupom de desconto?"**;\n3. Digite o código do cupom e toque em **"Aplicar"**;\n4. O valor do desconto ou frete grátis será deduzido instantaneamente do seu pedido!`;
  }

  // 5. DÚVIDAS SOBRE CADASTRO / JÁ TENHO CADASTRO / CONTATO E ENDEREÇO
  const termosCadastro = ['cadastro', 'ja tenho cadastro', 'como me cadastrar', 'como cadastrar', 'alterar endereco', 'mudar telefone'];
  if (termosCadastro.some(t => pNorm.includes(t))) {
    return `👤 **Identificação no Carrinho:**\n\n• Se você já é cliente da **${nomeLoja}**, basta clicar no botão **"Já tenho cadastro"** no carrinho, digitar seu nome e escolher seu cadastro na lista.\n• Seus dados de **Contato** e **Endereço** serão preenchidos automaticamente!\n• Você também pode clicar diretamente nos botões **"Contato"** ou **"Endereço"** para cadastrar ou atualizar seus dados a qualquer momento antes de enviar o pedido.`;
  }

  // 6. DÚVIDAS SOBRE PRODUTOS E CATEGORIAS
  const termosProdutos = ['produto', 'produtos', 'categoria', 'categorias', 'o que voces vendem', 'catalogo', 'itens'];
  if (termosProdutos.some(t => pNorm.includes(t))) {
    const catsNome = categorias.slice(0, 8).map(c => `• ${c.nome}`).join('\n');
    return `📦 **Catálogo da ${nomeLoja}:**\n\nTemos **${produtos.length} produtos** disponíveis!\n\n**Principais Categorias:**\n${catsNome || '• Veja os produtos navegando no catálogo'}\n\nVocê pode usar a barra de busca no topo para pesquisar qualquer item por nome ou filtrar pelas categorias!`;
  }

  // 7. SE HOUVER CHAVE DO GEMINI, USAR IA GENERATIVA PERSONALIZADA
  const apiKey = getGeminiApiKey();
  if (apiKey) {
    try {
      const prompt = `
Você é a **Rubi**, a assistente virtual e vendedora oficial da loja **${nomeLoja}** no catálogo online.
Seu objetivo é orientar o cliente que está navegando no catálogo, tirando dúvidas sobre produtos, preços de atacado, formas de pagamento, opções de frete/retirada, identificação no carrinho e fechamento de pedidos.

DADOS DA LOJA:
- Nome da Loja: ${nomeLoja}
- WhatsApp / Contato: ${loja.whatsapp || loja.telefone || 'Disponível no cabeçalho'}
- Endereço: ${loja.endereco_logradouro || 'Atendimento local'}, ${loja.endereco_cidade || ''}
- Total de Produtos no catálogo: ${produtos.length}
- Regras de Atacado: ${regrasAtivas.descontoAtacado > 0 ? `Atacado a partir de ${regrasAtivas.qtdTotalMinimaAtacado} peças ou R$ ${regrasAtivas.valorMinimoAtacado}` : 'Sob consulta'}
- Regras de Distribuidor (Autoatacado): ${regrasAtivas.descontoAutoatacado > 0 ? `A partir de ${regrasAtivas.qtdTotalMinimaAutoatacado} peças ou R$ ${regrasAtivas.valorMinimoAutoatacado}` : 'Sob consulta'}

INSTRUÇÕES:
1. Responda em português brasileiro com simpatia, educação, brevidade e clareza.
2. Foque em ajudar o cliente a escolher produtos e fechar o pedido no carrinho.
3. Se perguntarem sobre dados de cadastro, explique que no carrinho há os botões "Já tenho cadastro", "Contato" e "Endereço".
4. Use emojis amigáveis e formatação markdown limpa.

PERGUNTA DO CLIENTE:
"${pergunta}"
`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 600 }
      };

      const resData = await executarRequisicaoGemini(apiKey, requestBody);
      const respostaIA = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (respostaIA && respostaIA.trim()) {
        return respostaIA.trim();
      }
    } catch (e) {
      console.warn('Erro ao consultar Gemini para Rubi no Catálogo:', e);
    }
  }

  // 8. FALLBACK GERAL AMIGÁVEL
  return `Olá! Sou a **Rubi**, assistente virtual da **${nomeLoja}**! ✨\n\nPosso te ajudar com:\n• **Preços de Atacado**: Como comprar com descontos progressivos por quantidade ou valor.\n• **Formas de Pagamento**: Pix dinâmico, cartões e pagamento na entrega.\n• **Entrega & Retirada**: Prazos, taxas e endereço da loja.\n• **Finalização do Pedido**: Como aplicar cupons e usar o botão "Já tenho cadastro".\n\nComo posso te ajudar com as suas compras hoje?`;
};
