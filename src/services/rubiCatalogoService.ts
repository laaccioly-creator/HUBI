import { getGeminiApiKey, executarRequisicaoGemini } from './geminiService';
import { Loja, Produto, Categoria, FormaEntrega, RegrasPrecificacaoLoja, Cliente } from '../types';

export interface ContextoLojaCatalogo {
  loja: Loja;
  categorias: Categoria[];
  produtos: Produto[];
  formasEntrega: FormaEntrega[];
  regrasAtivas: RegrasPrecificacaoLoja;
  clienteAtual?: Cliente | null;
  nomeClienteAtual?: string;
  ultimoProdutoSugerido?: Produto | null;
}

export interface RespostaRubiCatalogo {
  texto: string;
  produtosSugeridos?: Produto[];
  comandoSacola?: {
    produto: Produto;
    quantidade: number;
    variacaoId?: string;
  };
  dadosCadastroDetectados?: {
    nome?: string;
    telefone?: string;
    endereco?: string;
  };
}

export const normalizarTexto = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

/**
 * Mapeamento de Personas e Diretrizes por Segmento de Negócio
 */
export const PERSONAS_SEGMENTO: Record<string, { papel: string; diretriz: string; saudacaoExemplo: string }> = {
  restaurante: {
    papel: 'Maître & Consultora Gastronômica',
    diretriz: 'Atue como uma maître e atendente de alta gastronomia e delivery. Apresente os pratos destacando o sabor, os ingredientes frescos, harmonizações, porções e acompanhamentos. Sempre pergunte se o cliente deseja uma bebida ou sobremesa para acompanhar.',
    saudacaoExemplo: 'Olá! Sou a Rubi, sua maître virtual! O que gostaria de saborear hoje? Temos opções deliciosas, porções e bebidas especiais!'
  },
  motepecas: {
    papel: 'Consultor Técnico Especialista em Peças',
    diretriz: 'Atue como um especialista técnico em peças automotivas e de motos. Fale com precisão sobre compatibilidade por modelo e ano de veículo, durabilidade, marcas confiáveis e manutenção preventiva. Use tom seguro e prestativo.',
    saudacaoExemplo: 'E aí, tudo bem? Sou a Rubi, especialista em peças de motos e veículos. Qual o modelo e ano do seu veículo para eu te indicar a peça ideal?'
  },
  moda: {
    papel: 'Consultora de Estilo & Personal Stylist',
    diretriz: 'Atue como uma consultora de moda e estilo acolhedora e antenada. Sugira combinações de looks, ocasiões de uso (festa, trabalho, casual), tecidos, caimento e valorize o bom gosto do cliente. Se houver tamanhos ou cores, pergunte a preferência.',
    saudacaoExemplo: 'Olá, que alegria ter você aqui! Sou a Rubi, sua consultora de moda e estilo. Procurando um look para o dia a dia ou para uma ocasião especial?'
  },
  lingerie: {
    papel: 'Consultora Especialista em Lingerie & Moda Íntima',
    diretriz: 'Atue com delicadeza, sofisticação, extremo cuidado e acolhimento. Destaque conforto, qualidade dos tecidos (renda, microfibra, algodão), caimento perfeito e ocasiões especiais. Mantenha um tom gentil, empático e discreto.',
    saudacaoExemplo: 'Olá! Sou a Rubi. Estou aqui para te ajudar a escolher as peças mais confortáveis e elegantes, com todo cuidado e discrição.'
  },
  sexshop: {
    papel: 'Consultora Especialista em Produtos Eróticos & Bem-Estar Íntimo',
    diretriz: 'Atue com naturalidade, sofisticação, respeito, mente aberta e absoluta discrição como uma consultora especialista em produtos eróticos, sexualidade saudável e bem-estar íntimo. Aborde dúvidas sem tabus nem preconceitos, com linguagem acolhedora, respeitosa e técnica quando apropriado (explicando tipos de estimulação, materiais como silicone medicinal/cirúrgico, modos de vibração, lubrificantes à base d\'água ou térmicos, cosméticos eróticos, higienização de itens e garantia total de embalagem discreta). Mantenha total discrição, empatia e ausência de julgamentos.',
    saudacaoExemplo: 'Olá! Sou a Rubi, sua consultora de bem-estar íntimo e produtos eróticos. Estou aqui para tirar dúvidas com total discrição e te ajudar a encontrar as melhores experiências e sensações. O que você gostaria de explorar hoje?'
  },
  cosmeticos: {
    papel: 'Especialista em Beleza, Skincare & Cuidados',
    diretriz: 'Atue como uma especialista em cosméticos, maquiagem e cuidados pessoais. Pergunte sobre tipos de pele, cabelo e rotinas de cuidados. Destaque benefícios de hidratação, fixação e fragrâncias.',
    saudacaoExemplo: 'Olá! Sou a Rubi, sua consultora de beleza. Me conta: qual cuidado para sua pele, cabelo ou maquiagem você procura hoje?'
  },
  mercado: {
    papel: 'Atendente Prático de Compras & Despensa',
    diretriz: 'Atue com agilidade, presteza e foco em economia. Ajude a encontrar produtos da cesta básica, bebidas, produtos de limpeza e itens para a despensa, ressaltando ofertas e compras práticas.',
    saudacaoExemplo: 'Olá! Sou a Rubi, pronta para te ajudar a montar seu carrinho com os melhores produtos e ofertas da nossa loja!'
  },
  petshop: {
    papel: 'Consultora Apaixonada por Pets',
    diretriz: 'Atue com carinho genuíno por animais. Pergunte o porte, idade e raça do pet (cão, gato, etc.) para sugerir a melhor ração, petisco, brinquedo ou acessório com muito afeto.',
    saudacaoExemplo: 'Olá! Sou a Rubi, apaixonada por pets! Seu melhor amigo é um cãozinho, gato ou outro pet? Me conta o que ele está precisando!'
  },
  eletronicos: {
    papel: 'Consultora Especialista em Tecnologia',
    diretriz: 'Atue com foco técnico, compatibilidade e inovação. Destaque potência, conectividade, cabos corretos, garantia e performance dos aparelhos e acessórios.',
    saudacaoExemplo: 'Fala aí! Sou a Rubi, especialista em eletrônicos. Qual aparelho ou acessório você precisa? Garanto compatibilidade e alta performance!'
  },
  farmacia: {
    papel: 'Consultora de Saúde & Bem-Estar',
    diretriz: 'Atue com responsabilidade, foco em nutrição, suplementos, vitaminas e cuidados preventivos de saúde. Mantenha tom calmo, empático e acolhedor.',
    saudacaoExemplo: 'Olá! Sou a Rubi, sua parceira de saúde e bem-estar. Posso te indicar as melhores opções em suplementos, vitaminas e cuidados diários!'
  },
  construcao: {
    papel: 'Consultor Prático de Reformas & Obras',
    diretriz: 'Atue com objetividade e conhecimento de obras. Oriente as ferramentas e materiais certos para cada etapa de conserto, hidráulica, elétrica ou acabamento.',
    saudacaoExemplo: 'Olá! Sou a Rubi, especialista em materiais e ferramentas. Qual conserto, reforma ou projeto você está executando hoje?'
  },
  geral: {
    papel: 'Consultora de Vendas & Atendimento Especial',
    diretriz: 'Atue como uma vendedora completa, gentil, entusiasta e atenciosa. Ajude o cliente a encontrar os produtos que mais combinam com o que ele procura, apresentando vantagens e valores.',
    saudacaoExemplo: 'Olá! Sou a Rubi, sua consultora de compras. O que você gostaria de encontrar hoje? Posso te sugerir os melhores produtos e novidades!'
  }
};

/**
 * Busca inteligente de produtos no catálogo por relevância
 */
export const buscarProdutosPorIntencao = (
  termo: string,
  produtos: Produto[],
  limite: number = 4
): Produto[] => {
  if (!produtos || produtos.length === 0) return [];
  const pNorm = normalizarTexto(termo);

  // Filtrar apenas produtos ativos e disponíveis
  const produtosDisponiveis = produtos.filter(p => p.ativo !== false);

  // 1. Checar se é busca por menor preço / promoção
  if (pNorm.includes('mais barato') || pNorm.includes('menor preco') || pNorm.includes('baratinho')) {
    return [...produtosDisponiveis]
      .sort((a, b) => Number(a.preco_promocional || a.preco_venda_varejo || 0) - Number(b.preco_promocional || b.preco_venda_varejo || 0))
      .slice(0, limite);
  }

  if (pNorm.includes('promocao') || pNorm.includes('oferta') || pNorm.includes('desconto')) {
    const promo = produtosDisponiveis.filter(p => p.preco_promocional && Number(p.preco_promocional) < Number(p.preco_venda_varejo));
    if (promo.length > 0) {
      return promo.slice(0, limite);
    }
  }

  if (pNorm.includes('novidade') || pNorm.includes('lancamento') || pNorm.includes('recente')) {
    return [...produtosDisponiveis]
      .sort((a, b) => new Date(b.criado_em || '').getTime() - new Date(a.criado_em || '').getTime())
      .slice(0, limite);
  }

  // 2. Pontuação por relevância
  const palavrasTermo = pNorm.split(/\s+/).filter(w => w.length >= 3);
  if (palavrasTermo.length === 0) {
    return produtosDisponiveis.slice(0, limite);
  }

  const pontuados = produtosDisponiveis.map(prod => {
    const nomeNorm = normalizarTexto(prod.nome || '');
    const descNorm = normalizarTexto(prod.descricao || '');
    const catNorm = normalizarTexto(prod.categoria?.nome || '');

    let score = 0;

    // Match exato do termo completo no nome
    if (nomeNorm.includes(pNorm)) score += 50;
    if (catNorm.includes(pNorm)) score += 30;

    // Match palavra por palavra
    for (const word of palavrasTermo) {
      if (nomeNorm.includes(word)) score += 15;
      if (catNorm.includes(word)) score += 10;
      if (descNorm.includes(word)) score += 5;
    }

    return { prod, score };
  });

  const filtrados = pontuados
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.prod);

  return filtrados.slice(0, limite);
};

/**
 * Detecta comando de voz/texto para adicionar produto à sacola
 */
export const detectarComandoSacola = (
  texto: string,
  produtosContexto: Produto[],
  ultimoSugerido?: Produto | null
): { produto: Produto; quantidade: number } | null => {
  const tNorm = normalizarTexto(texto);

  const termosAdicionar = [
    'adiciona', 'adicionar', 'adiciona para mim', 'adiciona pra mim',
    'coloca na sacola', 'coloca no carrinho', 'poe na sacola', 'poe no carrinho',
    'gostei desse', 'gostei desse produto', 'quero esse', 'quero levar esse',
    'vou levar esse', 'adiciona esse', 'quero esse produto', 'compra esse'
  ];

  const temIntencaoAdicionar = termosAdicionar.some(term => tNorm.includes(term));
  if (!temIntencaoAdicionar) return null;

  // Detectar quantidade mencionada (ex: "2 unidades", "3 desse")
  let quantidade = 1;
  const matchQtd = tNorm.match(/(\d+)\s*(?:unidades?|itens?|pecas?|desse)?/);
  if (matchQtd && matchQtd[1]) {
    const qNum = parseInt(matchQtd[1], 10);
    if (qNum > 0 && qNum <= 50) quantidade = qNum;
  }

  // 1. Se mencionou "primeiro", "segundo", "terceiro"
  if (produtosContexto.length > 0) {
    if (tNorm.includes('primeiro') || tNorm.includes('1')) {
      return { produto: produtosContexto[0], quantidade };
    }
    if (produtosContexto.length > 1 && (tNorm.includes('segundo') || tNorm.includes('2'))) {
      return { produto: produtosContexto[1], quantidade };
    }
    if (produtosContexto.length > 2 && (tNorm.includes('terceiro') || tNorm.includes('3'))) {
      return { produto: produtosContexto[2], quantidade };
    }
  }

  // 2. Se mencionou nome ou parte do nome de algum produto da lista
  for (const prod of produtosContexto) {
    const nomeNorm = normalizarTexto(prod.nome);
    const palavrasNome = nomeNorm.split(/\s+/).filter(p => p.length >= 4);
    if (palavrasNome.some(pal => tNorm.includes(pal))) {
      return { produto: prod, quantidade };
    }
  }

  // 3. Fallback: usar o último produto sugerido ou o primeiro da lista recente
  const prodAlvo = ultimoSugerido || (produtosContexto.length > 0 ? produtosContexto[0] : null);
  if (prodAlvo) {
    return { produto: prodAlvo, quantidade };
  }

  return null;
};

/**
 * Detecta dados de cadastro (Nome, Telefone, Endereço) na conversa
 */
export const detectarDadosCadastroNaMensagem = (
  texto: string,
  nomeJaConhecido?: string
): { nome?: string; telefone?: string; endereco?: string } => {
  const dados: { nome?: string; telefone?: string; endereco?: string } = {};

  // 1. Detectar Nome
  if (!nomeJaConhecido) {
    const padroesNome = [
      /(?:me chamo|meu nome e|sou o|sou a|pode me chamar de|chamar de)\s+([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,})?)/i,
      /^([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,})?)$/
    ];

    for (const regex of padroesNome) {
      const match = texto.trim().match(regex);
      if (match && match[1]) {
        const possivelNome = match[1].trim();
        // Evitar falsos positivos como "oi", "ola", "bom dia"
        const termosIgnorar = ['ola', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'sim', 'nao', 'quero', 'tudo bem', 'beleza'];
        if (!termosIgnorar.includes(normalizarTexto(possivelNome))) {
          dados.nome = possivelNome;
          break;
        }
      }
    }
  }

  // 2. Detectar Telefone / WhatsApp (ex: (85) 98888-7777 ou 85988887777)
  const telMatch = texto.match(/(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}/);
  if (telMatch && telMatch[0]) {
    const telLimpo = telMatch[0].replace(/\D/g, '');
    if (telLimpo.length >= 8) {
      dados.telefone = telLimpo;
    }
  }

  // 3. Detectar Endereço (ex: "Rua Bélgica, 945", "Av. Brasil 100", "Rua das Flores")
  const regexEndereco = /(?:rua|avenida|av|alameda|travessa|rodovia|estrada|praca|residencial|apto|bairro)\s+[^,\n]+(?:\s*,\s*\d+)?/i;
  const matchEnd = texto.match(regexEndereco);
  if (matchEnd && matchEnd[0]) {
    dados.endereco = matchEnd[0].trim();
  }

  return dados;
};

/**
 * Motor Principal da Rubi IA: Consultora de Vendas Especializada no Catálogo
 */
export const responderPerguntaClienteCatalogo = async (
  pergunta: string,
  contexto: ContextoLojaCatalogo
): Promise<RespostaRubiCatalogo> => {
  const { loja, categorias, produtos, formasEntrega, regrasAtivas, clienteAtual, nomeClienteAtual, ultimoProdutoSugerido } = contexto;
  const pNorm = normalizarTexto(pergunta);
  const nomeLoja = loja.nome_fantasia || 'nossa loja';

  // Configuração do Perfil do Negócio e Persona
  const perfilNegocio = loja.configuracoes_extras?.perfil_negocio || {};
  const segmento = perfilNegocio.segmento || 'geral';
  const especialidade = perfilNegocio.descricao_especialidade || '';
  const personaInfo = PERSONAS_SEGMENTO[segmento] || PERSONAS_SEGMENTO.geral;

  const nomeClienteEfetivo = nomeClienteAtual || clienteAtual?.nome || '';

  // 1. CHECAGEM DE COMANDO DE VOZ / TEXTO PARA ADICIONAR À SACOLA
  const comandoSacola = detectarComandoSacola(pergunta, produtos, ultimoProdutoSugerido);
  if (comandoSacola) {
    const { produto, quantidade } = comandoSacola;
    const nomeTratamento = nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : '';
    return {
      texto: `Prontinho${nomeTratamento}! Já adicionei **${quantidade > 1 ? `${quantidade}x ` : ''}${produto.nome}** à sua sacola de compras! 🛍️✨\n\nVocê pode ver os itens tocando na sacola no topo da tela. Quer que eu te mostre mais algum produto ou precisa de mais alguma coisa?`,
      produtosSugeridos: [produto],
      comandoSacola
    };
  }

  // 2. DETECÇÃO DE DADOS DE CADASTRO NA MENSAGEM
  const dadosCadastro = detectarDadosCadastroNaMensagem(pergunta, nomeClienteEfetivo);

  // Se o cliente acabou de falar o nome pela primeira vez
  if (dadosCadastro.nome && !nomeClienteEfetivo) {
    const nomeDetectado = dadosCadastro.nome;
    return {
      texto: `Que prazer te conhecer, **${nomeDetectado}**! Seja muito bem-vindo(a) à **${nomeLoja}**! ✨\n\nSou a **Rubi**, sua ${personaInfo.papel.toLowerCase()}. ${especialidade ? `Somos especialistas em ${especialidade}. ` : ''}\n\nPara facilitar sua entrega e você aproveitar ofertas exclusivas, quer me passar seu WhatsApp e endereço rapidinho? É só falar ou digitar aqui! Ou se preferir, já me conta o que você gostaria de encontrar hoje! 😊`,
      dadosCadastroDetectados: dadosCadastro
    };
  }

  // 3. DÚVIDAS ESPECÍFICAS DE REGRAS DE NEGÓCIO DA LOJA
  // A. Atacado / Distribuidor
  const termosAtacado = ['atacado', 'autoatacado', 'distribuidor', 'comprar no atacado', 'minimo atacado', 'tabela atacado', 'preco atacado', 'desconto atacado'];
  if (termosAtacado.some(t => pNorm.includes(t))) {
    const isAtacadoAtivo = Boolean(regrasAtivas.descontoAtacado > 0 || regrasAtivas.valorMinimoAtacado > 0 || regrasAtivas.qtdTotalMinimaAtacado > 0);
    const isAutoAtivo = Boolean(regrasAtivas.descontoAutoatacado > 0 || regrasAtivas.valorMinimoAutoatacado > 0 || regrasAtivas.qtdTotalMinimaAutoatacado > 0);

    if (!isAtacadoAtivo && !isAutoAtivo) {
      return {
        texto: `Aqui na **${nomeLoja}**, nossos preços já são muito especiais e praticamos valor justo para todos os clientes! Se você precisar de um lote muito grande, fala com a gente pelo WhatsApp: **${loja.whatsapp || loja.telefone || 'no botão do catálogo'}**.`
      };
    }

    let resposta = `🛍️ **Como funciona o Atacado na ${nomeLoja}:**\n\n`;
    if (isAtacadoAtivo) {
      const tipo = loja.tipo_minimo_padrao_atacado || 'valor';
      if (tipo === 'quantidade') {
        resposta += `• **Preço de Atacado:** Comprando a partir de **${regrasAtivas.qtdTotalMinimaAtacado} peças** no carrinho, você ganha preço de atacado automaticamente!\n`;
      } else {
        resposta += `• **Preço de Atacado:** Atingindo **R$ ${regrasAtivas.valorMinimoAtacado.toFixed(2)}** no total da compra, os preços de atacado são aplicados na hora!\n`;
      }
    }
    if (isAutoAtivo) {
      const tipo = loja.tipo_minimo_padrao_autoatacado || 'valor';
      if (tipo === 'quantidade') {
        resposta += `• **Distribuidor (Autoatacado):** A partir de **${regrasAtivas.qtdTotalMinimaAutoatacado} peças**, o desconto é ainda maior!\n`;
      } else {
        resposta += `• **Distribuidor (Autoatacado):** Atingindo **R$ ${regrasAtivas.valorMinimoAutoatacado.toFixed(2)}**, você desbloqueia a tabela de distribuidor!\n`;
      }
    }
    resposta += `\n💡 Conforme você vai adicionando os itens, a barra no topo mostra quanto falta para desbloquear o próximo desconto!`;
    return { texto: resposta };
  }

  // B. Pagamentos
  const termosPagamento = ['pagamento', 'pagar', 'pix', 'cartao', 'credito', 'debito', 'dinheiro', 'parcelamento', 'mercado pago'];
  if (termosPagamento.some(t => pNorm.includes(t))) {
    const mpAtivo = Boolean(loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.ativo);
    let formas = [];
    if (mpAtivo) formas.push('**Pix Automático** com QR Code dinâmico e baixa na hora');
    formas.push('**Cartão de Crédito e Débito**');
    formas.push('**Dinheiro / Pagamento no recebimento ou retirada**');
    formas.push('**Pix Manual** direto para a chave da loja');

    return {
      texto: `💳 **Formas de Pagamento na ${nomeLoja}:**\n\n${formas.map(f => `• ${f}`).join('\n')}\n\nVocê escolhe sua opção favorita na hora de finalizar o pedido na sacola!`
    };
  }

  // C. Entrega e Frete
  const termosEntrega = ['entrega', 'frete', 'entregar', 'taxa de entrega', 'retirada', 'retirar', 'buscar', 'onde fica', 'endereco'];
  if (termosEntrega.some(t => pNorm.includes(t))) {
    let formasTexto = '';
    if (formasEntrega && formasEntrega.length > 0) {
      formasTexto = formasEntrega.map(fe => `• **${fe.nome}**: R$ ${Number(fe.valor_taxa).toFixed(2)}${fe.tempo_estimado ? ` (${fe.tempo_estimado})` : ''}`).join('\n');
    } else {
      formasTexto = '• **Entrega Padrão ou Retirada no Balcão**';
    }
    let endTexto = '';
    if (loja.endereco_logradouro) {
      endTexto = `\n📍 **Nosso Endereço:** ${loja.endereco_logradouro}, ${loja.endereco_numero || 'S/N'}${loja.endereco_bairro ? ` - ${loja.endereco_bairro}` : ''}${loja.endereco_cidade ? `, ${loja.endereco_cidade}` : ''}`;
    }
    return {
      texto: `🚚 **Opções de Entrega & Retirada:**\n\n${formasTexto}${endTexto}\n\nVocê pode escolher onde quer receber ou marcar retirada na hora de fechar a compra!`
    };
  }

  // D. Dúvidas sobre Embalagem Discreta e Sigilo (Especialmente relevante para Sex Shop)
  const termosDiscrecao = ['embalagem', 'discreta', 'discreto', 'sigilo', 'privacidade', 'aparece no pacote', 'da para ver', 'segredo'];
  if (termosDiscrecao.some(t => pNorm.includes(t))) {
    return {
      texto: `🤫 **Privacidade & Discrição Absoluta Garantidas!**\n\nFique 100% tranquilo(a)! Nossas entregas e envios são realizados em **embalagens totalmente discretas, neutras, opacas e sem nenhuma menção à loja ou ao conteúdo** na parte externa do pacote.\n\nNinguém saberá o que você comprou. A sua privacidade e conforto são prioridades fundamentais para nós! ✨`
    };
  }

  // 4. BUSCA DE PRODUTOS RECOMENDADOS
  const produtosSugeridos = buscarProdutosPorIntencao(pergunta, produtos, 4);

  // 5. CONSULTA À IA GENERATIVA GEMINI (SE HOUVER CHAVE DISPONÍVEL)
  const apiKey = getGeminiApiKey();
  if (apiKey) {
    try {
      const catalogoResumo = produtos.slice(0, 30).map(p => ({
        id: p.id,
        nome: p.nome,
        categoria: p.categoria?.nome || '',
        preco: p.preco_promocional || p.preco_venda_varejo,
        preco_atacado: p.preco_venda_atacado || null
      }));

      const prompt = `
Você é a **Rubi**, a ${personaInfo.papel} da loja **${nomeLoja}** no catálogo online.
PAPEL E DIRETRIZES DO SEGMENTO (${segmento}):
${personaInfo.diretriz}
${especialidade ? `Especialidade da empresa: "${especialidade}". Destaque isso com orgulho!` : ''}

DADOS DO CLIENTE:
- Nome do cliente: ${nomeClienteEfetivo ? `"${nomeClienteEfetivo}" (chame o cliente pelo nome com gentileza e carinho)` : 'Ainda não informado (pergunte o nome de forma acolhedora se for a primeira mensagem)'}

CATÁLOGO RESUMIDO DA LOJA:
${JSON.stringify(catalogoResumo)}

INSTRUÇÕES DE RESPOSTA:
1. Converse como um(a) verdadeiro(a) vendedor(a) humano(a), simpático(a), atencioso(a) e consultivo(a).
2. Se o cliente estiver procurando um produto, apresente as opções, explique por que são boas escolhas e destaque os preços.
3. Se você identificar produtos correspondentes na lista acima, cite os nomes com clareza.
4. Finalize incentivando a adicionar à sacola (ex: "Se quiser levar algum, é só tocar em Adicionar ou me falar que eu coloco na sua sacola para você!").
5. Responda em português brasileiro com fluidez, parágrafos curtos e emojis acolhedores.

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
        return {
          texto: respostaIA.trim(),
          produtosSugeridos: produtosSugeridos.length > 0 ? produtosSugeridos : undefined,
          dadosCadastroDetectados: Object.keys(dadosCadastro).length > 0 ? dadosCadastro : undefined
        };
      }
    } catch (e) {
      console.warn('Erro ao consultar Gemini para Rubi no Catálogo:', e);
    }
  }

  // 6. MOTOR LOCAL INTELIGENTE (SE GEMINI NÃO ESTIVER DISPONÍVEL OU FALHAR)
  if (produtosSugeridos.length > 0) {
    const listaNomes = produtosSugeridos.map(p => `• **${p.nome}** por **R$ ${Number(p.preco_promocional || p.preco_venda_varejo).toFixed(2)}**`).join('\n');
    return {
      texto: `Olha só o que separei para você${nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : ''}! ✨\n\nEncontrei estas opções no nosso catálogo:\n\n${listaNomes}\n\nVocê pode tocar no botão **"+ Adicionar"** no card abaixo ou simplesmente me falar: *"Rubi, adiciona esse para mim"*!`,
      produtosSugeridos,
      dadosCadastroDetectados: Object.keys(dadosCadastro).length > 0 ? dadosCadastro : undefined
    };
  }

  // Fallback geral personalizado pelo nicho
  return {
    texto: `Olá${nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : ''}! Sou a **Rubi**, sua ${personaInfo.papel.toLowerCase()} da **${nomeLoja}**! ✨\n\n${especialidade ? `Somos especializados em **${especialidade}**. ` : ''}Me conta: o que você está procurando hoje? Posso te sugerir produtos incríveis, conferir promoções e até adicionar direto na sua sacola de compras!`,
    dadosCadastroDetectados: Object.keys(dadosCadastro).length > 0 ? dadosCadastro : undefined
  };
};

