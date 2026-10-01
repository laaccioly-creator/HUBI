import { getGeminiApiKey, executarRequisicaoGemini } from './geminiService';
import { rubiCatalogoJevService } from './rubiCatalogoJevService';
import { Loja, Produto, Categoria, FormaEntrega, RegrasPrecificacaoLoja, Cliente } from '../types';
import { LojaShippingConfig } from '../types/shipping';
import { ShippingOrchestrator } from './shippingOrchestrator';
import { sanitizarCaixaTexto } from '../components/DescricaoFormatadaProduto';

export interface ContextoLojaCatalogo {
  loja: Loja;
  categorias: Categoria[];
  produtos: Produto[];
  formasEntrega: FormaEntrega[];
  regrasAtivas: RegrasPrecificacaoLoja;
  clienteAtual?: Cliente | null;
  nomeClienteAtual?: string;
  ultimoProdutoSugerido?: Produto | null;
  produtoConsultado?: Produto | null;
  historicoMensagens?: Array<{ autor: 'rubi' | 'cliente'; texto: string }>;
  produtosJaSugeridosIds?: string[];
  configShippingLoja?: LojaShippingConfig | null;
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
 * Corrige transcrições fonéticas imperfeitas do SpeechRecognition (STT) para os termos reais do catálogo
 */
export const corrigirTranscricaoVoz = (str: string): string => {
  if (!str) return '';
  let corrigido = str;
  // Bullet vibratório frequentemente transcrito como "boletim", "bolo aí te", "bolo ai te", "bulete", "bulet", "bolo vibratório"
  corrigido = corrigido.replace(/\b(?:bolo\s+a[ií]\s+te|bolo\s+a[ií]|boletim|bulete|bulet|bule)\s*vibrat[oó]rio\b/gi, 'bullet vibratório');
  corrigido = corrigido.replace(/\b(?:boletim|bulete|bulet)\b/gi, 'bullet');
  corrigido = corrigido.replace(/\bbolo\s+vibrat[oó]rio\b/gi, 'bullet vibratório');
  corrigido = corrigido.replace(/\bbolo\s+a[ií]\s+te\b/gi, 'bullet');
  // Chibata transcrita como chumbada
  corrigido = corrigido.replace(/\bchumbada\b/gi, 'chibata');
  return corrigido;
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
    brinquedo: ['vibrador', 'estimulador', 'bullet', 'egg', 'sugador', 'dildo', 'anel', 'capsula'],
    vibrador: ['vibrador', 'vibradores', 'bullet', 'capsula', 'dedeira', 'batom', 'estimulador', 'sugador', 'personal'],
    vibradores: ['vibrador', 'vibradores', 'bullet', 'capsula', 'dedeira', 'batom', 'estimulador', 'sugador'],
    bullet: ['bullet', 'capsula', 'vibratoria', 'vibrador'],
    capsula: ['capsula', 'bullet', 'vibratoria', 'vibrador'],
    compacto: ['bullet', 'capsula', 'dedeira', 'batom', 'mini', 'pequeno', 'bolsa'],
    discreto: ['bullet', 'capsula', 'batom', 'dedeira', 'mini'],
    massagem: ['oleo', 'vela', 'gel', 'creme', 'beijavel'],
    lubrificante: ['lubrificante', 'gel', 'silicone', 'agua'],
    iniciante: ['bullet', 'capsula', 'oleo', 'gel', 'beijavel', 'lubrificante', 'vela'],
    indica: ['mais vendido', 'destaque', 'oleo', 'vibrador', 'bullet', 'gel', 'massagem']
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
      // Match exato por nome completo
      if (nomeNorm.length >= 4 && textoNorm.includes(nomeNorm)) {
        if (!idsAdicionados.has(prod.id)) {
          produtosEncontrados.push(prod);
          idsAdicionados.add(prod.id);
          if (produtosEncontrados.length >= 3) break;
        }
      } else {
        // Match por palavras-chave principais (ex: "bullet" e "capsula")
        const palavrasNome = nomeNorm.split(/[\s,.;:!?\-+]+/).filter(w => w.length >= 4);
        if (palavrasNome.length > 0 && palavrasNome.some(pal => textoNorm.includes(pal))) {
          if (!idsAdicionados.has(prod.id)) {
            produtosEncontrados.push(prod);
            idsAdicionados.add(prod.id);
            if (produtosEncontrados.length >= 3) break;
          }
        }
      }
    }
  }

  // 3. Retorna apenas os produtos efetivamente recomendados na resposta (sem forçar produtos aleatórios se não foram pedidos)
  const produtosFinais = produtosEncontrados.length > 0
    ? produtosEncontrados.slice(0, 3)
    : (produtosFallback.length > 0 ? produtosFallback.slice(0, 3) : []);

  // Limpar conectivos ou pontuações suspensas que possam ter ficado no final
  textoLimpo = textoLimpo.replace(/\s+(e|ou|com|de|para|que)\s*$/i, '.').trim();
  if (!/[.!?]$/.test(textoLimpo) && textoLimpo.length > 20) {
    textoLimpo = textoLimpo.replace(/[,;:\s]+$/, '') + '.';
  }

  return { textoLimpo, produtos: produtosFinais };
};

/**
 * Gera a resposta inteligente sobre entrega e retirada analisando a configuração real da loja.
 * Reconhece integrações ativas (Uber Direct, Melhor Envio), frete próprio com valor fixo ou cotação manual na hora.
 */
export const formatarRespostaEntregaInteligente = async (
  contexto: ContextoLojaCatalogo
): Promise<RespostaRubiCatalogo> => {
  const { loja, formasEntrega = [] } = contexto;
  const nomeLoja = loja.nome_fantasia || 'nossa loja';

  // 1. Obter a configuração especializada de envio (da prop ou do banco via ShippingOrchestrator)
  let shippingConfig = contexto.configShippingLoja;
  if (!shippingConfig) {
    try {
      shippingConfig = await ShippingOrchestrator.buscarConfigLoja(loja.id);
    } catch (e) {
      console.warn('[rubiCatalogoService] Falha ao carregar shippingConfig:', e);
    }
  }

  // 2. Diagnóstico das capacidades ativas de envio
  const temUber = Boolean(shippingConfig?.uber_ativo && shippingConfig?.uber_client_id);
  const temMelhorEnvio = Boolean(shippingConfig?.melhor_envio_ativo && shippingConfig?.melhor_envio_token);
  const temIntegracaoAutomatica = temUber || temMelhorEnvio;

  const permiteRetirada = Boolean(
    shippingConfig?.permite_retirada_loja ||
    shippingConfig?.retirada_balcao_ativa ||
    formasEntrega.some(f => f.tipo === 'retirada' && f.ativo !== false)
  );

  const freteProprioConfig = Boolean(shippingConfig?.frete_proprio_ativo);
  const temFormaFreteProprio = formasEntrega.some(
    f => (f.tipo === 'frota_propria' || f.tipo === 'motoboy') && f.ativo !== false
  );
  const freteProprioAtivo = freteProprioConfig || temFormaFreteProprio;
  const tipoCobrancaProprio = shippingConfig?.frete_proprio_tipo_cobranca || 'manual';
  const valorFixoProprio = Number(shippingConfig?.frete_proprio_valor_padrao || 0);

  const freteGratisAtivo = Boolean(
    shippingConfig?.frete_gratis_ativo || loja.frete_gratis_ativo
  );
  const freteGratisValorMinimo = Number(
    shippingConfig?.frete_gratis_valor_minimo || loja.frete_gratis_valor_minimo || 0
  );

  let endTexto = '';
  if (loja.endereco_logradouro) {
    endTexto = ` (${loja.endereco_logradouro}, ${loja.endereco_numero || 'S/N'}${loja.endereco_bairro ? ` - ${loja.endereco_bairro}` : ''})`;
  }

  // 3. Montagem estruturada da resposta
  let resposta = `🚚 **Como funciona a Entrega & Retirada na ${nomeLoja}:**\n\n`;

  // Item 1: Retirada no Balcão
  if (permiteRetirada) {
    resposta += `• **Retirada no Balcão:** Você pode escolher seus produtos pelo catálogo e retirar diretamente na nossa loja física com **frete grátis**!${endTexto ? `\n  📍 *Local:* ${endTexto.replace(/^\s*\(/, '').replace(/\)$/, '')}` : ''}\n\n`;
  }

  // Item 2: Entrega no Endereço
  resposta += `• **Entrega no seu Endereço:**\n`;

  if (temIntegracaoAutomatica) {
    resposta += `  Ao colocar os itens na sacola e informar seu endereço ou CEP ao finalizar, nosso sistema calcula na hora as opções disponíveis com prazos e valores para a sua região:\n`;
    if (temUber) {
      resposta += `  🛵 **Aplicativo de Corrida / Motoboy:** Entrega expressa no mesmo dia via Uber Flash ou motoboy parceiro;\n`;
    }
    if (temMelhorEnvio) {
      resposta += `  📦 **Correios:** PAC e Sedex com código de rastreamento;\n`;
      resposta += `  🚛 **Transportadoras Parceiras:** Opções de envio seguro com cotação imediata;\n`;
    }
    if (freteProprioAtivo) {
      if (tipoCobrancaProprio === 'fixo' && valorFixoProprio > 0) {
        resposta += `  🚗 **Frete Próprio da Loja:** Taxa fixa de R$ ${valorFixoProprio.toFixed(2)} para entrega na nossa região;\n`;
      } else if (tipoCobrancaProprio === 'gratis') {
        resposta += `  🚗 **Frete Próprio da Loja:** Entrega gratuita para a nossa área de atendimento;\n`;
      } else {
        resposta += `  🚗 **Frete Próprio da Loja:** Entrega local personalizada;\n`;
      }
    }
  } else {
    // Loja SEM integrações ativas de Uber Direct ou Melhor Envio
    if (freteProprioAtivo && tipoCobrancaProprio === 'fixo' && valorFixoProprio > 0) {
      resposta += `  Trabalhamos com **Frete Próprio da Loja** com taxa fixa de **R$ ${valorFixoProprio.toFixed(2)}** para entregas na nossa cidade/região!\n`;
      resposta += `  🛵 Seu pedido sai para entrega assim que for separado e conferido pela nossa equipe.\n`;
    } else {
      resposta += `  Fazemos **cotação de frete personalizada na hora**! Ao concluir o seu pedido aqui pelo catálogo, **nossa equipe entrará em contato direto pelo seu WhatsApp** para combinar o melhor meio de envio (motoboy, entrega própria ou transportadora) e te informar o valor exato do frete antes do despacho.\n`;
    }
  }

  // Item 3: Frete Grátis Promocional
  if (freteGratisAtivo && freteGratisValorMinimo > 0) {
    resposta += `\n🎉 **Super Vantagem:** Frete Grátis nas compras a partir de **R$ ${freteGratisValorMinimo.toFixed(2)}**!`;
  }

  // Item 4: Sigilo e Discrição (Especialmente relevante para sexshop, lingerie ou cosméticos)
  const segmento = loja.configuracoes_extras?.perfil_negocio?.segmento || 'geral';
  if (segmento === 'sexshop' || segmento === 'lingerie') {
    resposta += `\n\n🤫 *Garantia de Sigilo:* Todos os pedidos são enviados em **embalagens 100% discretas, neutras e sem identificação externa**, preservando total privacidade!`;
  }

  resposta += `\n\nVocê escolhe onde e como prefere receber ao fechar o pedido na sacola! 😊`;

  return { texto: resposta };
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
    produtoConsultado,
    historicoMensagens = [],
    produtosJaSugeridosIds = []
  } = contexto;
  const perguntaCorrigida = corrigirTranscricaoVoz(pergunta);
  const pNorm = normalizarTexto(perguntaCorrigida);
  const nomeLoja = loja.nome_fantasia || 'nossa loja';

  // Configuração do Perfil do Negócio e Persona
  const perfilNegocio = loja.configuracoes_extras?.perfil_negocio || {};
  const segmento = perfilNegocio.segmento || 'geral';
  const especialidade = perfilNegocio.descricao_especialidade || '';
  const personaInfo = PERSONAS_SEGMENTO[segmento] || PERSONAS_SEGMENTO.geral;

  const nomeClienteEfetivo = nomeClienteAtual || clienteAtual?.nome || '';

  // IDENTIFICAÇÃO DE PRODUTO ALVO EM CONSULTA / DÚVIDA / FOTO
  let produtoAlvo: Produto | null = produtoConsultado || null;

  // 1. Checar se a pergunta é uma referência anafórica ao produto anterior ("dele", "desse", "esse produto", "foto dele", "ver ele")
  const termosReferenciaAoUltimo = [
    'foto dele', 'manda foto dele', 'manda uma foto dele', 'ver foto dele',
    'quero ver ele', 'mostra ele', 'foto desse', 'desse produto', 'esse produto',
    'sobre ele', 'tem foto dele', 'cade a foto dele', 'manda foto desse', 'ver esse'
  ];
  if (!produtoAlvo && ultimoProdutoSugerido && termosReferenciaAoUltimo.some(t => pNorm.includes(t))) {
    produtoAlvo = ultimoProdutoSugerido;
  }

  // 2. Se o nome veio entre aspas
  if (!produtoAlvo) {
    const matchAspas = perguntaCorrigida.match(/"([^"]+)"/) || perguntaCorrigida.match(/“([^”]+)”/);
    if (matchAspas && matchAspas[1]) {
      const nomeEntreAspasNorm = normalizarTexto(matchAspas[1]);
      produtoAlvo = produtos.find(p => normalizarTexto(p.nome) === nomeEntreAspasNorm)
        || produtos.find(p => normalizarTexto(p.nome).includes(nomeEntreAspasNorm) || nomeEntreAspasNorm.includes(normalizarTexto(p.nome)))
        || null;
    }
  }

  // 3. Busca por match inteligente de palavras-chave do produto na frase
  if (!produtoAlvo) {
    const palavrasPergunta = pNorm.split(/[\s,.;:!?\-+]+/).filter(w => w.length >= 3);
    const stopWords = new Set([
      'mais', 'para', 'como', 'onde', 'qual', 'quais', 'esse', 'essa', 'este', 'esta',
      'sobre', 'quero', 'queria', 'voce', 'tem', 'passa', 'detalhes', 'manda', 'mandar',
      'foto', 'aqui', 'mim', 'poder', 'ver', 'fazer', 'localizar', 'sistema', 'catalogo',
      'bom', 'boa', 'olha', 'olhada', 'acho', 'achar', 'gostaria', 'dar', 'uma', 'uns'
    ]);
    const palavrasChaveBusca = palavrasPergunta.filter(w => !stopWords.has(w));

    if (palavrasChaveBusca.length > 0) {
      let melhorScore = 0;
      let melhorProd: Produto | null = null;

      for (const prod of produtos) {
        if (prod.ativo === false) continue;
        const nomeProdNorm = normalizarTexto(prod.nome || '');
        const palavrasNome = nomeProdNorm.split(/[\s,.;:!?\-+]+/).filter(w => w.length >= 3);

        let score = 0;
        // Match exato do nome inteiro
        if (pNorm.includes(nomeProdNorm)) score += 100;

        // Match das palavras-chave
        for (const chave of palavrasChaveBusca) {
          if (palavrasNome.includes(chave)) {
            score += 35; // palavra exata presente no nome
          } else if (nomeProdNorm.includes(chave)) {
            score += 15;
          }
        }

        // Bônus se termo muito característico der match direto (ex: bullet)
        if (palavrasChaveBusca.includes('bullet') && nomeProdNorm.includes('bullet')) {
          score += 40;
        }

        if (score > melhorScore && score >= 30) {
          melhorScore = score;
          melhorProd = prod;
        }
      }

      if (melhorProd) {
        produtoAlvo = melhorProd;
      }
    }
  }

  // 4. CHECAGEM DIRETA DE PEDIDO DE FOTO OU VISUALIZAÇÃO DO PRODUTO NO CATÁLOGO
  const termosPedidoFoto = [
    'manda foto', 'mandar foto', 'mande foto', 'mande uma foto', 'manda uma foto',
    'ver foto', 'quero ver foto', 'mostra foto', 'mostrar foto', 'tem foto',
    'quero ver', 'como ver', 'como faco para ver', 'como faco pra ver',
    'como localizar', 'como achar', 'onde fica', 'onde acho', 'como faco para localizar',
    'como faco pra localizar', 'cade a foto', 'me mostra ele', 'me mostra esse',
    'quero ver esse', 'foto dele'
  ];
  const ehPedidoDeFoto = termosPedidoFoto.some(t => pNorm.includes(t));
  const produtoParaFoto = produtoAlvo || ultimoProdutoSugerido;

  if (ehPedidoDeFoto && produtoParaFoto) {
    const precoEfetivo = Number(produtoParaFoto.preco_promocional || produtoParaFoto.preco_venda_varejo || 0);
    const temPromocao = Boolean(produtoParaFoto.promocao_ativa && produtoParaFoto.preco_promocional && Number(produtoParaFoto.preco_promocional) > 0);
    const precoStr = `R$ ${precoEfetivo.toFixed(2)}${temPromocao ? ' (oferta especial!)' : ''}`;

    return {
      texto: `Com certeza! Já separei e estou exibindo o card com a foto, o preço e os detalhes do **${produtoParaFoto.nome}** por apenas **${precoStr}** logo aqui embaixo para você ver! ✨\n\nVocê pode tocar na foto ou no botão com o ícone de olho para abrir e ver em tamanho maior, ou tocar no botão **+** para colocar direto na sua sacola de compras! O que achou? 😊`,
      produtosSugeridos: [produtoParaFoto]
    };
  }

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
  const comandoSacola = detectarComandoSacola(pergunta, produtos, produtoAlvo || ultimoProdutoSugerido);
  if (comandoSacola) {
    const { produto, quantidade } = comandoSacola;
    const nomeTratamento = nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : '';
    return {
      texto: `Prontinho${nomeTratamento}! Já adicionei **${quantidade > 1 ? `${quantidade}x ` : ''}${produto.nome}** à sua sacola de compras! 🛍️✨\n\nVocê pode ver os itens tocando na sacola no topo da tela. Quer que eu te mostre mais algum produto ou precisa de mais alguma coisa?`,
      produtosSugeridos: [produto],
      comandoSacola
    };
  }

  // 3. TRIAGEM OPERACIONAL INSTANTÂNEA VIA JEV (SYSTEM ONE - FASE 3)
  // Rastreio de pedidos, validação de comprovantes Pix, atacado e reclamações urgentes em < 300ms
  const triagemJev = await rubiCatalogoJevService.classificarIntencao(pergunta, contexto);

  if (triagemJev.intencao === 'rastreio_pedido') {
    return await rubiCatalogoJevService.rastrearPedidoCliente(pergunta, contexto);
  }

  if (triagemJev.intencao === 'comprovante_pix') {
    return await rubiCatalogoJevService.processarComprovantePix(pergunta, contexto);
  }

  if (triagemJev.intencao === 'reclamacao_urgente') {
    return rubiCatalogoJevService.processarReclamacaoUrgente(pergunta, contexto);
  }

  if (triagemJev.intencao === 'orcamento_atacado') {
    return rubiCatalogoJevService.processarDuvidaAtacado(contexto);
  }

  if (triagemJev.intencao === 'duvida_frete') {
    return await formatarRespostaEntregaInteligente(contexto);
  }

  if (triagemJev.intencao === 'dados_contato') {
    const dadosCadastro = detectarDadosCadastroNaMensagem(pergunta, nomeClienteEfetivo);
    const telFormatado = dadosCadastro.telefone ? ` (${dadosCadastro.telefone})` : '';
    return {
      texto: `Perfeito! Já anotei o seu contato de WhatsApp${telFormatado}! ✨\n\nComo posso te ajudar agora? Posso te sugerir os produtos mais procurados ou tirar dúvidas sobre qualquer item do catálogo! 😊`,
      dadosCadastroDetectados: dadosCadastro
    };
  }

  // 4. DETECÇÃO DE DADOS DE CADASTRO NA MENSAGEM
  const dadosCadastro = detectarDadosCadastroNaMensagem(pergunta, nomeClienteEfetivo);
  const ehDuvidaDeProduto = Boolean(produtoAlvo);

  // Se o cliente acabou de falar o nome pela primeira vez
  if (dadosCadastro.nome && !nomeClienteEfetivo && !produtoAlvo && !ehDuvidaDeProduto) {
    const nomeDetectado = dadosCadastro.nome;
    return {
      texto: `Que prazer te conhecer, **${nomeDetectado}**! Seja muito bem-vindo(a) à **${nomeLoja}**! ✨\n\nSou a **Rubi**, sua ${personaInfo.papel.toLowerCase()}. ${especialidade ? `Somos especialistas em ${especialidade}. ` : ''}\n\nPara agilizar suas entregas com discrição e ofertas exclusivas, quer me passar seu WhatsApp e endereço rapidinho? É só falar ou digitar aqui! Ou se preferir, já me conta o que você gostaria de encontrar hoje! 😊`,
      dadosCadastroDetectados: dadosCadastro
    };
  }

  // 4. SAUDAÇÕES NATURAIS PURAS
  // NUNCA disparar se a mensagem for uma dúvida sobre produto ou tiver mais perguntas
  const termosPerguntaNaoSaudacao = [
    'duvida', 'produto', 'informac', 'saber', 'preco', 'quanto', 'entrega', 'frete',
    'embalagem', 'como funciona', 'serve', 'usar', 'gostaria', 'indica', 'vende', 'tem', 'posso', 'qual'
  ];
  const contemTermoPergunta = termosPerguntaNaoSaudacao.some(t => pNorm.includes(t));
  const fraseLimpa = pNorm.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const palavras = fraseLimpa.split(' ').filter(Boolean);

  const saudacoesExatas = new Set([
    'boa noite', 'bom dia', 'boa tarde', 'ola', 'oi', 'tudo bem',
    'ola tudo bem', 'oi tudo bem', 'como vai', 'e ai',
    'ola rubi', 'oi rubi', 'bom dia rubi', 'boa tarde rubi', 'boa noite rubi',
    'e ai rubi', 'oi rubi tudo bem', 'ola rubi tudo bem'
  ]);

  const ehSaudacaoPura = !produtoAlvo && !ehDuvidaDeProduto && !contemTermoPergunta && palavras.length <= 4 && saudacoesExatas.has(fraseLimpa);
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
    if (mpAtivo) formas.push('Pix com confirmação imediata');
    formas.push('Cartão de crédito e débito');
    formas.push('Dinheiro na entrega ou retirada');
    formas.push('Chave Pix direta da loja');

    return {
      texto: `Aqui na **${nomeLoja}** a gente facilita tudo pra você! ✨\n\nAceitamos ${formas.slice(0, -1).join(', ')} e também ${formas[formas.length - 1]}. Na hora de fechar a sua sacola de compras, você escolhe a opção que achar mais prática! Posso te sugerir os produtos mais procurados da loja? 😊`
    };
  }

  // C. Entrega e Frete
  const termosEntrega = ['entrega', 'frete', 'entregar', 'taxa de entrega', 'retirada', 'retirar', 'buscar', 'onde fica', 'endereco'];
  if (termosEntrega.some(t => pNorm.includes(t))) {
    return await formatarRespostaEntregaInteligente(contexto);
  }

  // D. Dúvidas sobre Embalagem Discreta e Sigilo (Especialmente relevante para Sex Shop)
  const termosDiscrecao = ['embalagem', 'discreta', 'discreto', 'sigilo', 'privacidade', 'aparece no pacote', 'da para ver', 'segredo'];
  if (termosDiscrecao.some(t => pNorm.includes(t))) {
    return {
      texto: `🤫 **Pode ficar com o coração 100% tranquilo(a)!**\n\nNossas entregas são feitas em **embalagens totalmente discretas, neutras e sem nenhuma identificação da loja por fora**. Ninguém sabe o que tem dentro, garantimos sigilo absoluto pra você fazer suas compras com total liberdade e privacidade! ✨`
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
  const produtosSugeridosPre = buscarProdutosPorIntencao(perguntaCorrigida, produtos, 3, produtosJaSugeridosIds, segmento);

  // 7. CONSULTA À IA GENERATIVA GEMINI (SE HOUVER CHAVE CONFIGURADA)
  const apiKey = getGeminiApiKey(loja);
  if (apiKey) {
    try {
      // SELEÇÃO INTELIGENTE DE PRODUTOS RELEVANTES PARA O GEMINI
      const prodsRelevantes = buscarProdutosPorIntencao(perguntaCorrigida, produtos, 30, [], segmento);
      const catalogoMap = new Map<string, Produto>();

      if (produtoAlvo) {
        catalogoMap.set(produtoAlvo.id, produtoAlvo);
      }
      if (ultimoProdutoSugerido && !catalogoMap.has(ultimoProdutoSugerido.id)) {
        catalogoMap.set(ultimoProdutoSugerido.id, ultimoProdutoSugerido);
      }
      for (const p of prodsRelevantes) {
        if (!catalogoMap.has(p.id)) {
          catalogoMap.set(p.id, p);
        }
      }

      // Completar até 50 produtos com itens ativos do catálogo
      const produtosAtivos = produtos.filter(p => p.ativo !== false);
      for (const p of produtosAtivos) {
        if (catalogoMap.size >= 50) break;
        if (!catalogoMap.has(p.id)) {
          catalogoMap.set(p.id, p);
        }
      }

      const catalogoResumo = Array.from(catalogoMap.values()).map(p => ({
        id: p.id,
        nome: p.nome,
        categoria: p.categoria?.nome || '',
        preco: Number(p.preco_promocional || p.preco_venda_varejo || 0).toFixed(2),
        descricao: p.descricao ? p.descricao.slice(0, 100) : ''
      }));

      const historicoTexto = historicoMensagens.length > 0
        ? historicoMensagens.slice(-4).map(m => `${m.autor === 'rubi' ? 'Rubi' : 'Cliente'}: ${m.texto}`).join('\n')
        : '';

      const infoProdutoAlvo = produtoAlvo ? `
PRODUTO ESPECÍFICO EM CONSULTA / DÚVIDA DO CLIENTE:
- ID: "${produtoAlvo.id}"
- Nome Exato: "${produtoAlvo.nome}"
- Categoria: "${produtoAlvo.categoria?.nome || 'Geral'}"
- Preço Normal: R$ ${Number(produtoAlvo.preco_venda_varejo || 0).toFixed(2)}
${produtoAlvo.promocao_ativa && produtoAlvo.preco_promocional ? `- Preço Promocional Atual: R$ ${Number(produtoAlvo.preco_promocional).toFixed(2)} (OFERTA ESPECIAL ATIVA)` : ''}
- Descrição Completa e Diferenciais:
"""
${sanitizarCaixaTexto(produtoAlvo.descricao || 'Produto de alta qualidade e muita procura no catálogo.')}
"""
${produtoAlvo.tem_variacoes && produtoAlvo.variacoes?.length ? `- Variações/Opções: ${produtoAlvo.variacoes.map(v => `${v.valor_variacao_1}${v.valor_variacao_2 ? ` / ${v.valor_variacao_2}` : ''}`).join(', ')}` : ''}

INSTRUÇÃO CRÍTICA PARA ESTE PRODUTO:
O cliente está com dúvida sobre este produto específico!
1. Responda IMEDIATAMENTE explicando para que serve, sensações, modo de uso ou diferenciais com base na descrição acima.
2. Destaque o valor atual do produto de forma convidativa e natural (R$ ${Number(produtoAlvo.preco_promocional || produtoAlvo.preco_venda_varejo || 0).toFixed(2)}).
3. NUNCA dê apenas uma saudação genérica de boas-vindas pedindo o nome do cliente! Responda a dúvida primeiro. Ao final, de forma simpática, você pode perguntar como chamá-lo ou convidá-lo a colocar na sacola.
4. IMPORTANTE: Escreva todas as frases completas com pontuação final (. ou !). NUNCA pare no meio de uma frase.
5. OBRIGATÓRIO: Conclua todo o texto e somente na última linha, isolada, adicione a tag: [PRODUTOS_RECOMENDADOS: ${produtoAlvo.id}]
` : '';

      const prompt = `
Você é a **Rubi**, a ${personaInfo.papel} da loja **${nomeLoja}** no catálogo online.
SEGMENTO: ${segmento} - ${personaInfo.diretriz}
${especialidade ? `Especialidade: "${especialidade}".` : ''}

CLIENTE: ${nomeClienteEfetivo ? `"${nomeClienteEfetivo}"` : 'Não informado'}

HISTÓRICO RECENTE:
${historicoTexto || '(Início)'}

${infoProdutoAlvo}

CATÁLOGO REAL DA LOJA (Produtos efetivamente disponíveis no estoque):
${JSON.stringify(catalogoResumo)}

🚨 DIRETRIZES INVIOLÁVEIS DE ATENDIMENTO E ZERO ALUCINAÇÃO:
1. PROIBIDO INVENTAR PRODUTOS OU PREÇOS: Você SÓ PODE recomendar, descrever ou citar produtos que constam LITERALMENTE na lista "CATÁLOGO REAL DA LOJA" acima! NUNCA invente nomes de modelos fictícios (como "Discreet", "Velvet Touch", etc.) e NUNCA invente preços. Use rigorosamente o valor que está no campo "preco" de cada produto listado. Se o produto custa 6.50, fale "6 e 50". Jamais fale 69 e 90 ou outros valores não existentes!
2. VISUALIZAÇÃO E FOTOS DE PRODUTOS:
   - NUNCA diga que "não pode mandar fotos por aqui" ou que "por ser chat de texto não consegue mostrar fotos"! O sistema do catálogo exibe automaticamente o card com a foto do produto, valor e botão de sacola logo abaixo da sua mensagem!
   - Quando o cliente pedir foto ou quiser ver o produto, confirme com entusiasmo que já está mostrando o card com a foto e os detalhes dele logo abaixo para ele ver e tocar.
   - OBRIGATÓRIO: Adicione na última linha isolada a tag [PRODUTOS_RECOMENDADOS: id] para que a foto do produto apareça na tela!
3. HUMANIZAÇÃO TOTAL (CONVERSA NATURAL ENTRE DOIS HUMANOS):
   - Converse com entusiasmo acolhedor, empatia e espontaneidade — como uma excelente consultora ou vendedora atenciosa conversando cara a cara no balcão da loja física ou em um áudio descontraído de WhatsApp.
   - Fale em parágrafos contínuos, calorosos e vivos (evite listas mecânicas de bullets).
   - Use expressões naturais e afetuosas do dia a dia brasileiro: "Olha só", "Com certeza!", "Ah, excelente escolha!", "Pode deixar comigo", "Temos sim!", "Fica super à vontade", "Você vai adorar!".
4. DÚVIDAS SOBRE PRODUTOS TÊM PRIORIDADE TOTAL: Se a pergunta for sobre um produto específico, responda com detalhes acolhedores e envolventes imediatamente. Jamais bloqueie o atendimento exigindo o nome do cliente.
5. IDENTIFICAÇÃO DO CLIENTE: Somente quando o cliente fizer uma saudação simples e isolada (sem perguntas nem produtos), dê as boas-vindas e pergunte: "Antes de começarmos, como posso te chamar? Me conta seu nome!"
6. SEJA CONCISA E FLUIDA: O cliente pode estar ouvindo sua voz no fone de ouvido ou viva-voz! Responda em 2 a 3 parágrafos curtos, bem pontuados e agradáveis de ouvir.
7. CADASTRO E PEDIDO:
   - Se o cliente perguntar como se cadastrar, explique de maneira leve que ele pode me ditar os dados (Nome, WhatsApp, Endereço de entrega) por aqui mesmo ou preencher na sacola ao fechar.
   - Se o cliente demonstrar intenção de fazer o pedido ou finalizar a compra, peça os dados de entrega com carinho para organizar o envio e cadastro.
8. PRODUTOS RECOMENDADOS:
   - Apresente no máximo 2 a 3 produtos APENAS quando o cliente pedir indicações, novidades ou itens específicos.
   - CITE APENAS PRODUTOS REAIS DO CATÁLOGO com seus nomes exatos e preços exatos.
   - OBRIGATÓRIO PARA SINCRONIA: Na última linha isolada da resposta, adicione os IDs dos produtos que você citou no formato exato: [PRODUTOS_RECOMENDADOS: id1, id2]. Se você NÃO recomendou produtos nesta mensagem, NÃO adicione essa tag!
9. Se o cliente perguntar por algo que não temos no catálogo, seja transparente e gentil: informe que no momento não temos esse modelo específico e ofereça as melhores opções que realmente temos no catálogo.

PERGUNTA ATUAL DO CLIENTE:
"${perguntaCorrigida}"
`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1000 }
      };

      const resData = await executarRequisicaoGemini(apiKey, requestBody);
      const respostaIA = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (respostaIA && respostaIA.trim()) {
        const { textoLimpo, produtos: prodsSincronizados } = extrairProdutosDaResposta(
          respostaIA.trim(),
          produtos,
          produtoAlvo ? [produtoAlvo] : []
        );

        return {
          texto: textoLimpo,
          produtosSugeridos: prodsSincronizados.length > 0 ? prodsSincronizados : (produtoAlvo ? [produtoAlvo] : undefined),
          dadosCadastroDetectados: Object.keys(dadosCadastro).length > 0 ? dadosCadastro : undefined
        };
      }
    } catch (e) {
      console.warn('Erro ao consultar Gemini para Rubi no Catálogo:', e);
    }
  }

  // 8. MOTOR LOCAL INTELIGENTE (QUANDO GEMINI NÃO ESTÁ ATIVO OU FALHA)
  // A. Resposta Rápida e Detalhada sobre Produto Específico
  if (produtoAlvo) {
    const precoNormal = Number(produtoAlvo.preco_venda_varejo || 0);
    const temPromocao = Boolean(produtoAlvo.promocao_ativa && produtoAlvo.preco_promocional && Number(produtoAlvo.preco_promocional) > 0);
    const precoFinal = temPromocao ? Number(produtoAlvo.preco_promocional) : precoNormal;
    const descFormatada = produtoAlvo.descricao ? sanitizarCaixaTexto(produtoAlvo.descricao) : '';

    let textoResposta = `O **${produtoAlvo.nome}** é uma excelente escolha! ✨\n\n`;

    if (descFormatada) {
      // Extrair até 2 primeiros parágrafos limpos da descrição
      const paragrafos = descFormatada
        .split(/\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 10);
      const resumoDesc = paragrafos.slice(0, 2).join('\n\n');
      textoResposta += `${resumoDesc || descFormatada}\n\n`;
    } else {
      textoResposta += `É um item super especial e de alta qualidade do nosso catálogo!\n\n`;
    }

    textoResposta += `💰 **Valor:** R$ ${precoFinal.toFixed(2)}${temPromocao ? ' *(em oferta especial!)*' : ''}\n`;

    if (produtoAlvo.tem_variacoes && produtoAlvo.variacoes && produtoAlvo.variacoes.length > 0) {
      const varsTexto = produtoAlvo.variacoes
        .map(v => `${v.valor_variacao_1}${v.valor_variacao_2 ? ` / ${v.valor_variacao_2}` : ''}`)
        .join(', ');
      textoResposta += `📦 **Opções:** ${varsTexto}\n`;
    }

    textoResposta += `\nQuer que eu adicione ele na sua sacola de compras? É só tocar no botão **"+ Adicionar"** aqui no card ou me pedir por voz! 🛍️`;

    if (!nomeClienteEfetivo) {
      textoResposta += `\n\n*(A propósito, como posso te chamar? Me conta o seu nome!)* 😊`;
    }

    return {
      texto: textoResposta,
      produtosSugeridos: [produtoAlvo],
      dadosCadastroDetectados: Object.keys(dadosCadastro).length > 0 ? dadosCadastro : undefined
    };
  }

  // B. Intenção Casal / Apimentar (Sex Shop)
  const termosCasalApimentar = ['apimentar', 'esquentar', 'casal', 'a dois', 'sair da rotina', 'namorados', 'surpresa'];
  const querApimentar = segmento === 'sexshop' && termosCasalApimentar.some(t => pNorm.includes(t));
  if (querApimentar) {
    const prodsCasal = buscarProdutosPorIntencao('massagem oleo estimulador lubrificante', produtos, 3, produtosJaSugeridosIds, segmento);
    return {
      texto: `Adoro essa ideia${nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : ''}! 🔥 Separei opções perfeitas para vocês curtirem a dois e saírem da rotina. Dá uma olhadinha nas opções logo abaixo! Qual delas você gostaria de conhecer melhor ou já colocar na sua sacola?`,
      produtosSugeridos: prodsCasal
    };
  }

  // C. Intenção "Só tem esses? / Outras coisas / O que mais tem?"
  const termosOutrasOpcoes = ['so tem esses', 'so tem esse', 'outras coisas', 'outros produtos', 'o que mais tem', 'tem outros', 'alem desses', 'outras opcoes'];
  const pedeOutrasOpcoes = termosOutrasOpcoes.some(t => pNorm.includes(t));
  if (pedeOutrasOpcoes) {
    const prodsNovos = buscarProdutosPorIntencao('destaque novidade', produtos, 3, produtosJaSugeridosIds, segmento);
    if (prodsNovos.length > 0) {
      return {
        texto: `Temos muito mais opções sim${nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : ''}! Separei outras novidades maravilhosas do nosso catálogo para você. Dá uma olhada nas opções logo abaixo! Se gostar de alguma, me avisa que já coloco na sua sacola!`,
        produtosSugeridos: prodsNovos
      };
    }
  }

  // D. Produtos gerais encontrados por relevância
  if (produtosSugeridosPre.length > 0) {
    return {
      texto: `Separei estas recomendações especiais para você${nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : ''}! ✨ Dê uma olhadinha nos produtos logo abaixo. Você pode me pedir para colocar algum na sua sacola ou tocar no botão de adicionar!`,
      produtosSugeridos: produtosSugeridosPre,
      dadosCadastroDetectados: Object.keys(dadosCadastro).length > 0 ? dadosCadastro : undefined
    };
  }

  // E. Resposta aberta sucinta
  return {
    texto: `Estou aqui com você${nomeClienteEfetivo ? `, ${nomeClienteEfetivo}` : ''}! 😊\n\nMe conta: o que você gostaria de ver hoje? Posso te sugerir itens para curtir a dois, relaxamento ou mostrar nossas novidades!`,
    dadosCadastroDetectados: Object.keys(dadosCadastro).length > 0 ? dadosCadastro : undefined
  };
};

