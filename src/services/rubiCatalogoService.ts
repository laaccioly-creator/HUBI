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
  historicoMensagens?: Array<{ autor: 'rubi' | 'cliente'; texto: string }>;
  produtosJaSugeridosIds?: string[];
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
 * Mapeamento de Sinônimos e Termos Afins por Segmento
 */
export const MAPA_SINONIMOS_SEGMENTO: Record<string, Record<string, string[]>> = {
  sexshop: {
    apimentar: ['oleo', 'gel', 'massagem', 'vibrador', 'estimulador', 'lubrificante', 'fantasia', 'sensual', 'beijavel', 'vela'],
    esquentar: ['oleo', 'gel', 'termico', 'massagem', 'esquenta', 'beijavel', 'calor'],
    casal: ['oleo', 'massagem', 'jogos', 'dados', 'fantasia', 'lubrificante', 'gel', 'estimulador', 'algema', 'venda'],
    rotina: ['oleo', 'massagem', 'vela', 'gel', 'vibrador', 'fantasia', 'surpresa'],
    brinquedo: ['vibrador', 'estimulador', 'bullet', 'egg', 'sugador', 'dildo', 'anel'],
    vibrador: ['vibrador', 'bullet', 'estimulador', 'sugador', 'personal'],
    massagem: ['oleo', 'vela', 'gel', 'creme', 'beijavel'],
    lubrificante: ['lubrificante', 'gel', 'silicone', 'agua'],
    iniciante: ['bullet', 'oleo', 'gel', 'beijavel', 'lubrificante', 'vela'],
    indica: ['mais vendido', 'destaque', 'oleo', 'vibrador', 'gel', 'massagem']
  },
  restaurante: {
    almoco: ['prato', 'executivo', 'refeicao', 'carne', 'frango', 'massa'],
    jantar: ['pizza', 'hamburguer', 'lanche', 'porcao', 'massa'],
    doce: ['sobremesa', 'torta', 'sorvete', 'pudim', 'chocolate'],
    beber: ['refrigerante', 'suco', 'cerveja', 'agua']
  }
};

/**
 * Busca inteligente de produtos no catálogo por relevância
 */
export const buscarProdutosPorIntencao = (
  termo: string,
  produtos: Produto[],
  limite: number = 4,
  excluirIds: string[] = [],
  segmento: string = 'geral'
): Produto[] => {
  if (!produtos || produtos.length === 0) return [];
  const pNorm = normalizarTexto(termo);

  // Filtrar apenas produtos ativos e disponíveis
  let produtosDisponiveis = produtos.filter(p => p.ativo !== false);
  if (excluirIds && excluirIds.length > 0) {
    const semExcluidos = produtosDisponiveis.filter(p => !excluirIds.includes(p.id));
    if (semExcluidos.length > 0) {
      produtosDisponiveis = semExcluidos;
    }
  }

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

  // 2. Extrair palavras e expandir sinônimos de acordo com o nicho
  const palavrasTermo = pNorm.split(/\s+/).filter(w => w.length >= 3);
  const palavrasExpandidas = new Set<string>(palavrasTermo);

  const mapaSinonimos = MAPA_SINONIMOS_SEGMENTO[segmento] || {};
  for (const [chave, sinonimos] of Object.entries(mapaSinonimos)) {
    if (pNorm.includes(chave)) {
      sinonimos.forEach(s => palavrasExpandidas.add(s));
    }
  }

  if (palavrasExpandidas.size === 0) {
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

    // Match palavra por palavra e sinônimos
    for (const word of palavrasExpandidas) {
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

  if (filtrados.length > 0) {
    return filtrados.slice(0, limite);
  }

  return produtosDisponiveis.slice(0, limite);
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
 * Extrai e sincroniza os produtos recomendados pela IA na resposta.
 * Garante 100% de coerência entre os produtos falados no áudio/texto e os cards na tela.
 */
export const extrairProdutosDaResposta = (
  textoResposta: string,
  produtosCatalogo: Produto[],
  produtosFallback: Produto[] = []
): { textoLimpo: string; produtos: Produto[] } => {
  let textoLimpo = textoResposta;
  const produtosEncontrados: Produto[] = [];
  const idsAdicionados = new Set<string>();

  // 1. Procurar tag explícita [PRODUTOS_RECOMENDADOS: id1, id2, ...] ou [PRODUTOS: ...]
  const tagRegex = /\[PRODUTOS(?:_RECOMENDADOS)?:\s*([^\]]+)\]/i;
  const tagMatch = textoLimpo.match(tagRegex);
  if (tagMatch) {
    const idsString = tagMatch[1];
    textoLimpo = textoLimpo.replace(tagMatch[0], '').trim();

    const ids = idsString.split(/[\s,;|]+/).map(id => id.trim()).filter(Boolean);
    for (const id of ids) {
      const prod = produtosCatalogo.find(p => p.id.toLowerCase() === id.toLowerCase());
      if (prod && !idsAdicionados.has(prod.id)) {
        produtosEncontrados.push(prod);
        idsAdicionados.add(prod.id);
      }
    }
  }

  // 2. Se a tag não trouxe produtos suficientes, buscar menções aos nomes dos produtos no texto
  if (produtosEncontrados.length === 0) {
    const textoNorm = normalizarTexto(textoLimpo);
    for (const prod of produtosCatalogo) {
      if (prod.ativo === false) continue;
      const nomeNorm = normalizarTexto(prod.nome || '');
      if (nomeNorm.length >= 4 && textoNorm.includes(nomeNorm)) {
        if (!idsAdicionados.has(prod.id)) {
          produtosEncontrados.push(prod);
          idsAdicionados.add(prod.id);
          if (produtosEncontrados.length >= 3) break;
        }
      }
    }
  }

  // 3. Retorna apenas os produtos efetivamente recomendados na resposta (sem forçar produtos aleatórios se não foram pedidos)
  const produtosFinais = produtosEncontrados.length > 0
    ? produtosEncontrados.slice(0, 3)
    : (produtosFallback.length > 0 ? produtosFallback.slice(0, 3) : []);

  return { textoLimpo, produtos: produtosFinais };
};

/**
 * Motor Principal da Rubi IA: Consultora de Vendas Especializada no Catálogo
 */
export const responderPerguntaClienteCatalogo = async (
  pergunta: string,
  contexto: ContextoLojaCatalogo
): Promise<RespostaRubiCatalogo> => {
  const {
    loja,
    categorias,
    produtos,
    formasEntrega,
    regrasAtivas,
    clienteAtual,
    nomeClienteAtual,
    ultimoProdutoSugerido,
    historicoMensagens = [],
    produtosJaSugeridosIds = []
  } = contexto;
  const pNorm = normalizarTexto(pergunta);
  const nomeLoja = loja.nome_fantasia || 'nossa loja';

  // Configuração do Perfil do Negócio e Persona
  const perfilNegocio = loja.configuracoes_extras?.perfil_negocio || {};
  const segmento = perfilNegocio.segmento || 'geral';
  const especialidade = perfilNegocio.descricao_especialidade || '';
  const personaInfo = PERSONAS_SEGMENTO[segmento] || PERSONAS_SEGMENTO.geral;

  const nomeClienteEfetivo = nomeClienteAtual || clienteAtual?.nome || '';

  // 1. CHECAGEM DE PROBLEMA DE ÁUDIO / FONE DE OUVIDO
  const termosAudioProblema = [
    'nao to ouvindo', 'nao estou ouvindo', 'sem som', 'nao sai som',
    'headphone', 'fone', 'nao escuto', 'nao ouco', 'nao to te ouvindo',
    'nao estou te ouvindo', 'cade a voz', 'nao falou nada', 'mudo', 'nao ta saindo som'
  ];
  if (termosAudioProblema.some(t => pNorm.includes(t))) {
    return {
      texto: `Ah, me perdoe${nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : ''}! Para me ouvir no seu fone ou alto-falante:\n\n1. Verifique se o **botão de som 🔊** no topo do nosso chat está verde/ativado;\n2. Devido à segurança do navegador, você pode tocar no botão **"🔊 Ouvir no fone"** logo abaixo da minha mensagem para liberar minha voz instantaneamente;\n3. Dê uma olhadinha no volume do seu fone e do aparelho.\n\nProntinho! Me diga se conseguiu me ouvir! O que você gostaria de explorar hoje? 😊`
    };
  }

  // 2. CHECAGEM DE COMANDO DE VOZ / TEXTO PARA ADICIONAR À SACOLA
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

  // 3. DETECÇÃO DE DADOS DE CADASTRO NA MENSAGEM
  const dadosCadastro = detectarDadosCadastroNaMensagem(pergunta, nomeClienteEfetivo);

  // Se o cliente acabou de falar o nome pela primeira vez
  if (dadosCadastro.nome && !nomeClienteEfetivo) {
    const nomeDetectado = dadosCadastro.nome;
    return {
      texto: `Que prazer te conhecer, **${nomeDetectado}**! Seja muito bem-vindo(a) à **${nomeLoja}**! ✨\n\nSou a **Rubi**, sua ${personaInfo.papel.toLowerCase()}. ${especialidade ? `Somos especialistas em ${especialidade}. ` : ''}\n\nPara agilizar suas entregas com discrição e ofertas exclusivas, quer me passar seu WhatsApp e endereço rapidinho? É só falar ou digitar aqui! Ou se preferir, já me conta o que você gostaria de encontrar hoje! 😊`,
      dadosCadastroDetectados: dadosCadastro
    };
  }

  // 4. SAUDAÇÕES NATURAIS E DIÁLOGO CORDIAL (Cumprimenta e pede o nome na 1ª interação)
  const saudacoesPuras = ['boa noite', 'bom dia', 'boa tarde', 'ola', 'oi', 'tudo bem', 'ola tudo bem', 'oi tudo bem', 'como vai', 'e ai'];
  const ehSaudacaoPura = saudacoesPuras.some(s => pNorm === s || pNorm === `${s} rubi` || pNorm === `rubi ${s}` || pNorm.startsWith(`${s} `));
  if (ehSaudacaoPura) {
    const saudacaoTempo = pNorm.includes('noite') ? 'Boa noite' : pNorm.includes('tarde') ? 'Boa tarde' : 'Olá';
    if (!nomeClienteEfetivo) {
      return {
        texto: `${saudacaoTempo}! Seja muito bem-vindo(a) à **${nomeLoja}**! ✨\n\nSou a **Rubi**, sua ${personaInfo.papel.toLowerCase()}. Antes de começarmos, **como posso te chamar? Me conta o seu nome!** 😊`
      };
    }
    return {
      texto: `${saudacaoTempo}, **${nomeClienteEfetivo}**! Que alegria falar com você novamente! ✨\n\nComo posso te ajudar hoje? Está procurando algo especial para curtir a dois, novidades ou quer sugestões dos mais vendidos? 😊`
    };
  }

  // 5. DÚVIDAS ESPECÍFICAS DE REGRAS DE NEGÓCIO DA LOJA
  // A. Atacado / Distribuidor
  const termosAtacado = ['atacado', 'autoatacado', 'distribuidor', 'comprar no atacado', 'minimo atacado', 'tabela atacado', 'preco atacado', 'desconto atacado'];
  if (termosAtacado.some(t => pNorm.includes(t))) {
    const isAtacadoAtivo = Boolean(regrasAtivas.descontoAtacado > 0 || regrasAtivas.valorMinimoAtacado > 0 || regrasAtivas.qtdTotalMinimaAtacado > 0);
    const isAutoAtivo = Boolean(regrasAtivas.descontoAutoatacado > 0 || regrasAtivas.valorMinimoAutoatacado > 0 || regrasAtivas.qtdTotalMinimaAutoatacado > 0);

    if (!isAtacadoAtivo && !isAutoAtivo) {
      return {
        texto: `Aqui na **${nomeLoja}**, nossos preços já são muito especiais e praticamos valor justo para todos os clientes! Se você precisar de um lote grande, fala com a gente pelo WhatsApp: **${loja.whatsapp || loja.telefone || 'no botão do catálogo'}**.`
      };
    }

    let resposta = `🛍️ **Como funciona o Atacado na ${nomeLoja}:**\n\n`;
    if (isAtacadoAtivo) {
      const tipo = loja.tipo_minimo_padrao_atacado || 'valor';
      if (tipo === 'quantidade') {
        resposta += `• **Preço de Atacado:** A partir de **${regrasAtivas.qtdTotalMinimaAtacado} peças** no carrinho;\n`;
      } else {
        resposta += `• **Preço de Atacado:** Atingindo **R$ ${regrasAtivas.valorMinimoAtacado.toFixed(2)}** no total da compra;\n`;
      }
    }
    if (isAutoAtivo) {
      const tipo = loja.tipo_minimo_padrao_autoatacado || 'valor';
      if (tipo === 'quantidade') {
        resposta += `• **Distribuidor:** A partir de **${regrasAtivas.qtdTotalMinimaAutoatacado} peças**;\n`;
      } else {
        resposta += `• **Distribuidor:** Atingindo **R$ ${regrasAtivas.valorMinimoAutoatacado.toFixed(2)}**.\n`;
      }
    }
    resposta += `\n💡 O desconto entra automaticamente na sacola!`;
    return { texto: resposta };
  }

  // B. Pagamentos
  const termosPagamento = ['pagamento', 'pagar', 'pix', 'cartao', 'credito', 'debito', 'dinheiro', 'parcelamento', 'mercado pago'];
  if (termosPagamento.some(t => pNorm.includes(t))) {
    const mpAtivo = Boolean(loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.ativo);
    let formas = [];
    if (mpAtivo) formas.push('**Pix Automático** com QR Code');
    formas.push('**Cartão de Crédito e Débito**');
    formas.push('**Dinheiro na entrega ou retirada**');
    formas.push('**Chave Pix direta da loja**');

    return {
      texto: `💳 **Formas de Pagamento na ${nomeLoja}:**\n\n${formas.map(f => `• ${f}`).join('\n')}\n\nVocê escolhe na hora de fechar a compra na sacola!`
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
      endTexto = `\n📍 **Endereço:** ${loja.endereco_logradouro}, ${loja.endereco_numero || 'S/N'}${loja.endereco_bairro ? ` - ${loja.endereco_bairro}` : ''}`;
    }
    return {
      texto: `🚚 **Opções de Entrega & Retirada:**\n\n${formasTexto}${endTexto}\n\nVocê escolhe onde prefere receber ao fechar o pedido!`
    };
  }

  // D. Dúvidas sobre Embalagem Discreta e Sigilo (Especialmente relevante para Sex Shop)
  const termosDiscrecao = ['embalagem', 'discreta', 'discreto', 'sigilo', 'privacidade', 'aparece no pacote', 'da para ver', 'segredo'];
  if (termosDiscrecao.some(t => pNorm.includes(t))) {
    return {
      texto: `🤫 **Privacidade & Discrição Absoluta!**\n\nFique 100% tranquilo(a)! Nossas entregas são feitas em **embalagens totalmente discretas, neutras e sem nenhuma menção à loja ou ao conteúdo** por fora.\n\nNinguém sabe o que você comprou. Total discrição garantida! ✨`
    };
  }

  // E. Dúvidas sobre Como se Cadastrar / Cadastro
  const termosCadastroDuvida = [
    'como eu faco para me cadastrar', 'como faco para me cadastrar', 'como me cadastrar',
    'como faco o cadastro', 'como fazer cadastro', 'como me cadastro', 'quero me cadastrar',
    'onde me cadastro', 'precisa de cadastro', 'como faco meu cadastro', 'fazer cadastro',
    'como cadastrar', 'como se cadastrar', 'preciso me cadastrar', 'fazer o cadastro'
  ];
  if (termosCadastroDuvida.some(t => pNorm.includes(t))) {
    const saudacaoTratamento = nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : '';
    return {
      texto: `Se cadastrar é super simples, rápido e discreto${saudacaoTratamento}! ✨\n\nVocê tem duas formas bem práticas:\n\n1. **Comigo agora mesmo:** É só me passar aqui por áudio ou texto o seu **Nome**, **WhatsApp** e **Endereço de entrega** que eu já deixo seu cadastro prontinho no sistema!\n\n2. **Ao fechar o pedido:** Escolha seus produtos no catálogo e toque na sacola. No momento de concluir, você preenche seus dados em poucos segundos!\n\nSe quiser, já pode me ditar ou digitar seus dados por aqui agora mesmo! Como você prefere? 😊`
    };
  }

  // F. Intenção de Fechar Pedido / Finalizar Compra / Fazer o Pedido
  const termosIntencaoPedido = [
    'fazer o pedido', 'fazer pedido', 'fechar pedido', 'fechar o pedido',
    'finalizar pedido', 'finalizar compra', 'concluir pedido', 'concluir compra',
    'quero pedir', 'como peco', 'como peço', 'onde peco', 'onde peço',
    'como faco o pedido', 'como faco pra pedir', 'quero comprar', 'como comprar',
    'fechar a sacola', 'vou querer esses', 'quero fechar', 'pode fechar', 'quero finalizar'
  ];
  if (termosIntencaoPedido.some(t => pNorm.includes(t))) {
    const saudacaoTratamento = nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : '';
    return {
      texto: `Que maravilha${saudacaoTratamento}! Vamos preparar seu pedido com todo carinho e total discrição! 🎉\n\nPara eu já deixar seu cadastro pronto e organizar a sua entrega, por favor me envie:\n\n• Seu **Nome completo**\n• Seu **WhatsApp**\n• Seu **Endereço com número e bairro**\n\nVocê pode me ditar falando no microfone 🎙️ ou digitar aqui! Se já colocou os produtos na sacola, após me passar os dados é só tocar na **Sacola** no topo da tela para confirmar! ✨`
    };
  }

  // 6. BUSCA PRELIMINAR DE PRODUTOS RECOMENDADOS (Fallback local)
  const produtosSugeridosPre = buscarProdutosPorIntencao(pergunta, produtos, 3, produtosJaSugeridosIds, segmento);

  // 7. CONSULTA À IA GENERATIVA GEMINI (SE HOUVER CHAVE CONFIGURADA)
  const apiKey = getGeminiApiKey(loja);
  if (apiKey) {
    try {
      const produtosAtivos = produtos.filter(p => p.ativo !== false);
      const catalogoResumo = produtosAtivos.slice(0, 40).map(p => ({
        id: p.id,
        nome: p.nome,
        categoria: p.categoria?.nome || '',
        preco: Number(p.preco_promocional || p.preco_venda_varejo || 0).toFixed(2)
      }));

      const historicoTexto = historicoMensagens.length > 0
        ? historicoMensagens.slice(-4).map(m => `${m.autor === 'rubi' ? 'Rubi' : 'Cliente'}: ${m.texto}`).join('\n')
        : '';

      const prompt = `
Você é a **Rubi**, a ${personaInfo.papel} da loja **${nomeLoja}** no catálogo online.
SEGMENTO: ${segmento} - ${personaInfo.diretriz}
${especialidade ? `Especialidade: "${especialidade}".` : ''}

CLIENTE: ${nomeClienteEfetivo ? `"${nomeClienteEfetivo}"` : 'Não informado'}

HISTÓRICO RECENTE:
${historicoTexto || '(Início)'}

CATÁLOGO RESUMIDO DA LOJA (Produtos disponíveis):
${JSON.stringify(catalogoResumo)}

DIRETRIZES CRÍTICAS DE RESPOSTA:
1. IDENTIFICAÇÃO DO CLIENTE: Se o nome do cliente ainda NÃO foi informado (CLIENTE: Não informado) e a mensagem dele for uma saudação ou início de conversa (ex: 'boa noite', 'olá', 'oi'), cumprimente de acordo com o horário, dê as boas-vindas e OBRIGATORIAMENTE pergunte: "Antes de começarmos, como posso te chamar? Me conta seu nome!"
2. SEJA SUCINTA E DIRETA: O cliente está ouvindo sua voz no fone de ouvido! NUNCA faça textos longos ou apresentações cansativas. Responda em 2 a 3 parágrafos curtos.
3. CADASTRO E PEDIDO:
   - Se o cliente perguntar como se cadastrar, explique que ele pode me ditar os dados (Nome, WhatsApp, Endereço de entrega) por aqui mesmo ou preencher na sacola. NUNCA sugira produtos nessa resposta!
   - Se o cliente demonstrar intenção de fazer o pedido ou finalizar a compra, peça os dados de entrega (Nome, WhatsApp, Endereço com número e bairro) para organizar o envio e cadastro.
4. PRODUTOS RECOMENDADOS:
   - Apresente no máximo 2 a 3 produtos APENAS quando o cliente pedir indicações, novidades ou itens específicos.
   - Para cada produto, fale apenas 1 frase curta explicando o benefício principal e mencione o valor.
   - Se o cliente pedir sugestões para casal, apimentar a relação ou sair da rotina, indique um combo rápido (ex: um óleo de massagem e um estimulador).
   - CITE APENAS PRODUTOS REAIS DO CATÁLOGO ACIMA com seus nomes exatos.
   - OBRIGATÓRIO PARA SINCRONIA: Na última linha da resposta, adicione os IDs dos produtos que você citou no formato exato: [PRODUTOS_RECOMENDADOS: id1, id2]. Se você NÃO recomendou produtos nesta mensagem, NÃO adicione essa tag!
5. Termine de forma rápida e simpática convidando a adicionar à sacola quando houver produtos recomendados.
6. Responda em português brasileiro fluido, sem rodeios.

PERGUNTA ATUAL DO CLIENTE:
"${pergunta}"
`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 600 }
      };

      const resData = await executarRequisicaoGemini(apiKey, requestBody);
      const respostaIA = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (respostaIA && respostaIA.trim()) {
        const { textoLimpo, produtos: prodsSincronizados } = extrairProdutosDaResposta(
          respostaIA.trim(),
          produtos
        );

        return {
          texto: textoLimpo,
          produtosSugeridos: prodsSincronizados.length > 0 ? prodsSincronizados : undefined,
          dadosCadastroDetectados: Object.keys(dadosCadastro).length > 0 ? dadosCadastro : undefined
        };
      }
    } catch (e) {
      console.warn('Erro ao consultar Gemini para Rubi no Catálogo:', e);
    }
  }

  // 8. MOTOR LOCAL INTELIGENTE (QUANDO GEMINI NÃO ESTÁ ATIVO OU FALHA)
  // A. Intenção Casal / Apimentar (Sex Shop)
  const termosCasalApimentar = ['apimentar', 'esquentar', 'casal', 'a dois', 'sair da rotina', 'namorados', 'surpresa'];
  const querApimentar = segmento === 'sexshop' && termosCasalApimentar.some(t => pNorm.includes(t));
  if (querApimentar) {
    const prodsCasal = buscarProdutosPorIntencao('massagem oleo estimulador lubrificante', produtos, 3, produtosJaSugeridosIds, segmento);
    const listaNomes = prodsCasal.map(p => `• **${p.nome}** (R$ ${Number(p.preco_promocional || p.preco_venda_varejo).toFixed(2)})`).join('\n');
    return {
      texto: `Adoro essa ideia${nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : ''}! 🔥 Para curtir a dois e sair da rotina, separei esta combinação perfeita de massagem e sensações:\n\n${listaNomes}\n\nQual desses mais te agrada? Se quiser, já coloco na sua sacola!`,
      produtosSugeridos: prodsCasal
    };
  }

  // B. Intenção "Só tem esses? / Outras coisas / O que mais tem?"
  const termosOutrasOpcoes = ['so tem esses', 'so tem esse', 'outras coisas', 'outros produtos', 'o que mais tem', 'tem outros', 'alem desses', 'outras opcoes'];
  const pedeOutrasOpcoes = termosOutrasOpcoes.some(t => pNorm.includes(t));
  if (pedeOutrasOpcoes) {
    const prodsNovos = buscarProdutosPorIntencao('destaque novidade', produtos, 3, produtosJaSugeridosIds, segmento);
    if (prodsNovos.length > 0) {
      const listaNomes = prodsNovos.map(p => `• **${p.nome}** (R$ ${Number(p.preco_promocional || p.preco_venda_varejo).toFixed(2)})`).join('\n');
      return {
        texto: `Temos muito mais opções sim${nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : ''}! Dá uma olhada nestas outras alternativas do catálogo:\n\n${listaNomes}\n\nSe quiser levar algum, é só tocar no botão Adicionar!`,
        produtosSugeridos: prodsNovos
      };
    }
  }

  // C. Produtos gerais encontrados por relevância
  if (produtosSugeridosPre.length > 0) {
    const listaNomes = produtosSugeridosPre.map(p => `• **${p.nome}** (R$ ${Number(p.preco_promocional || p.preco_venda_varejo).toFixed(2)})`).join('\n');
    return {
      texto: `Separei estas opções para você${nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : ''}! ✨\n\n${listaNomes}\n\nVocê pode tocar em **"+ Adicionar"** no card abaixo ou me pedir para colocar na sacola!`,
      produtosSugeridos: produtosSugeridosPre,
      dadosCadastroDetectados: Object.keys(dadosCadastro).length > 0 ? dadosCadastro : undefined
    };
  }

  // D. Resposta aberta sucinta
  return {
    texto: `Estou aqui com você${nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : ''}! 😊\n\nMe conta: o que você gostaria de ver hoje? Posso te sugerir itens para curtir a dois, relaxamento ou mostrar nossas novidades!`,
    dadosCadastroDetectados: Object.keys(dadosCadastro).length > 0 ? dadosCadastro : undefined
  };
};

