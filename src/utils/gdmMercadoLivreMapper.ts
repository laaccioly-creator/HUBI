// Tradutor Canônico GDM: src/utils/gdmMercadoLivreMapper.ts
// Converte entidades de Produto/Variação do HUBI para os contratos canônicos da API do Mercado Livre
// Governança: anti-jsonb-linter e pii-leak-detector

import { Produto, VariacaoProduto } from '../types';
import { GdmAnuncioMercadoLivreCanonico, GdmAtributoMercadoLivre, MlListingTypeId } from '../types/gdm';

export interface OpcoesMapeamentoMl {
  categoriaMlId?: string;
  tipoAnuncio?: MlListingTypeId;
  margemSobreprecoPercentual?: number;
  taxaFixaMl?: number;
  marca?: string;
  modelo?: string;
}

export interface PayloadItemMercadoLivre {
  title: string;
  family_name?: string;
  category_id: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  buying_mode: 'buy_it_now';
  listing_type_id: string;
  condition: 'new';
  description?: {
    plain_text: string;
  };
  pictures: { source: string }[];
  attributes: { id: string; value_name: string }[];
  variations?: {
    attribute_combinations: { id: string; value_name: string }[];
    price: number;
    available_quantity: number;
    picture_ids?: string[];
    attributes?: { id: string; value_name: string }[];
  }[];
}

/**
 * Sanitiza o nome de família (User Products) removendo caracteres especiais bloqueados
 * pelo Mercado Livre (como /, \, |, <, >, emojis) e limitando a 60 caracteres.
 */
export function sanitizarNomeFamiliaMercadoLivre(nome: string): string {
  const semEspeciais = nome
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, ' ')
    .replace(/[/\\|<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = semEspeciais || 'Produto';
  return formatarTituloMercadoLivre(base);
}

/**
 * Trunca o título do produto em no máximo 60 caracteres (limite estrito da API do Mercado Livre)
 * sem cortar palavras de forma abrupta quando possível.
 */
export function formatarTituloMercadoLivre(nome: string): string {
  const nomeLimpo = nome.trim().replace(/\s+/g, ' ');
  if (nomeLimpo.length <= 60) {
    return nomeLimpo;
  }
  const truncado = nomeLimpo.slice(0, 57);
  const ultimoEspaco = truncado.lastIndexOf(' ');
  if (ultimoEspaco > 35) {
    return truncado.slice(0, ultimoEspaco).trim();
  }
  return truncado.trim();
}

/**
 * Calcula o preço de venda no Mercado Livre embutindo a margem de comissão configurada e taxa fixa
 */
export function calcularPrecoMercadoLivre(
  precoBaseHubi: number,
  margemSobreprecoPercentual: number = 0,
  taxaFixa: number = 0
): number {
  if (precoBaseHubi <= 0) return 0;
  const precoComMargem = precoBaseHubi * (1 + margemSobreprecoPercentual / 100);
  // Se o item for de baixo ticket (< R$ 79,00), o Mercado Livre aplica taxa fixa adicional
  const precoFinal = precoComMargem < 79.0 ? precoComMargem + taxaFixa : precoComMargem;
  return Math.round(precoFinal * 100) / 100;
}

/**
 * Converte um produto do HUBI para o Contrato Canônico GdmAnuncioMercadoLivreCanonico
 */
export function converterProdutoHubiParaGdmMl(
  produto: Produto,
  variacao?: VariacaoProduto | null,
  opcoes: OpcoesMapeamentoMl = {}
): GdmAnuncioMercadoLivreCanonico {
  const margem = opcoes.margemSobreprecoPercentual ?? 0;
  const taxaFixa = opcoes.taxaFixaMl ?? 0;

  const precoBase = variacao
    ? (variacao.preco_promocional && variacao.preco_promocional > 0 ? variacao.preco_promocional : variacao.preco_venda_varejo)
    : (produto.promocao_ativa && produto.preco_promocional && produto.preco_promocional > 0 ? produto.preco_promocional : produto.preco_venda_varejo);

  const estoqueDisponivel = variacao ? Math.max(0, variacao.quantidade_estoque || 0) : Math.max(0, produto.quantidade_estoque || 0);

  const precoFinal = calcularPrecoMercadoLivre(precoBase, margem, taxaFixa);

  // Monta atributos padronizados para o Mercado Livre
  const atributos: GdmAtributoMercadoLivre[] = [
    { id: 'ITEM_CONDITION', value_name: 'Novo' },
  ];

  const marcaLimpa = opcoes.marca?.replace(/\s+/g, ' ').trim();
  if (marcaLimpa) {
    atributos.push({ id: 'BRAND', value_name: marcaLimpa });
  }

  const modeloLimpo = opcoes.modelo?.replace(/\s+/g, ' ').trim();
  if (modeloLimpo) {
    atributos.push({ id: 'MODEL', value_name: modeloLimpo });
  }

  const ean = variacao?.codigo_barras || produto.codigo_barras;
  if (ean && ean.trim().length >= 8 && ean.trim().length <= 14) {
    atributos.push({ id: 'GTIN', value_name: ean.trim() });
  }

  const tituloFormatado = formatarTituloMercadoLivre(
    variacao?.combinacao_nome ? `${produto.nome} ${variacao.combinacao_nome}` : produto.nome
  );

  return {
    produto_id: produto.id,
    variacao_id: variacao?.id || null,
    titulo_anuncio: tituloFormatado,
    categoria_ml_id: opcoes.categoriaMlId || 'MLB3530', // Categoria padrão Outros
    tipo_anuncio: opcoes.tipoAnuncio || 'gold_special',
    preco_base_hubi: precoBase,
    margem_sobrepreco_percentual: margem,
    preco_final_ml: precoFinal,
    estoque_fisico_disponivel: estoqueDisponivel,
    codigo_barras_ean: ean || null,
    fotos_urls: Array.isArray(produto.fotos_urls) ? produto.fotos_urls.slice(0, 10) : [],
    atributos_ml: atributos,
  };
}

/**
 * Converte o contrato canônico GDM para o payload estrito esperado por POST /items do Mercado Livre
 */
export function converterGdmParaPayloadApiMl(
  anuncioGdm: GdmAnuncioMercadoLivreCanonico,
  descricaoTexto?: string
): PayloadItemMercadoLivre {
  const payload: PayloadItemMercadoLivre = {
    title: anuncioGdm.titulo_anuncio,
    family_name: sanitizarNomeFamiliaMercadoLivre(anuncioGdm.titulo_anuncio),
    category_id: anuncioGdm.categoria_ml_id,
    price: anuncioGdm.preco_final_ml,
    currency_id: 'BRL',
    available_quantity: anuncioGdm.estoque_fisico_disponivel,
    buying_mode: 'buy_it_now',
    listing_type_id: anuncioGdm.tipo_anuncio,
    condition: 'new',
    pictures: (anuncioGdm.fotos_urls || []).map((url) => ({ source: url })),
    attributes: anuncioGdm.atributos_ml.map((attr) => ({
      id: attr.id,
      value_name: attr.value_name,
    })),
  };

  if (descricaoTexto && descricaoTexto.trim()) {
    payload.description = {
      plain_text: descricaoTexto.trim(),
    };
  }

  return payload;
}

export interface BreakdownPrecoMercadoLivre {
  precoBaseHubi: number;
  valorComissao: number;
  precoComMargem: number;
  custoFixoAplicado: number;
  isentoCustoFixo: boolean;
  precoFinalMl: number;
}

/**
 * Calcula o detalhamento (breakdown) de formação do preço final no Mercado Livre.
 */
export function calcularBreakdownPrecoMercadoLivre(
  precoBaseHubi: number,
  margemSobreprecoPercentual: number = 0,
  custoFixoVenda: number = 0
): BreakdownPrecoMercadoLivre {
  if (precoBaseHubi <= 0) {
    return {
      precoBaseHubi: 0,
      valorComissao: 0,
      precoComMargem: 0,
      custoFixoAplicado: 0,
      isentoCustoFixo: false,
      precoFinalMl: 0,
    };
  }

  const margemSegura = Math.max(0, margemSobreprecoPercentual || 0);
  const custoFixoSeguro = Math.max(0, custoFixoVenda || 0);
  const valorComissao = precoBaseHubi * (margemSegura / 100);
  const precoComMargem = precoBaseHubi + valorComissao;
  const isentoCustoFixo = precoComMargem >= 79.0;
  const custoFixoAplicado = isentoCustoFixo ? 0 : custoFixoSeguro;
  const precoFinalMl = calcularPrecoMercadoLivre(precoBaseHubi, margemSegura, custoFixoSeguro);

  return {
    precoBaseHubi,
    valorComissao: Math.round(valorComissao * 100) / 100,
    precoComMargem: Math.round(precoComMargem * 100) / 100,
    custoFixoAplicado: Math.round(custoFixoAplicado * 100) / 100,
    isentoCustoFixo,
    precoFinalMl,
  };
}

export interface ErroMercadoLivreTraduzido {
  mensagemAmigavel: string;
  detalheTecnico?: string;
}

const REGRAS_TRADUCAO_ERRO_ML: Array<{ padrao: RegExp; mensagem: string }> = [
  {
    padrao: /family_name/i,
    mensagem:
      'Sua conta do Mercado Livre utiliza o novo padrão de catálogo (User Products) e exige um nome de família válido sem símbolos especiais. Revise o título do produto e tente publicar novamente.',
  },
  {
    padrao: /invalid_fields|body\.invalid_fields/i,
    mensagem:
      'Alguns campos do anúncio não foram aceitos pela categoria selecionada no Mercado Livre. Confira título, marca e modelo do produto.',
  },
  {
    padrao: /\b(gtin|empty_gtin_reason|product_identifier)\b/i,
    mensagem:
      'Esta categoria do Mercado Livre exige código de barras (EAN/GTIN) válido ou justificativa automática de produto sem código.',
  },
  {
    padrao: /\b(attributes|missing_required|brand|model)\b/i,
    mensagem:
      'Faltam informações obrigatórias exigidas pelo Mercado Livre para esta categoria (como Marca ou Modelo). Preencha todos os campos e tente novamente.',
  },
  {
    padrao: /\b(category_id|not_leaf|listing_allowed|catalog_required|domain)\b/i,
    mensagem:
      'A categoria identificada no Mercado Livre não permite publicação direta ou exige vínculo ao catálogo oficial.',
  },
  {
    padrao: /\b(pictures|image|picture)\b/i,
    mensagem:
      'Uma ou mais imagens do produto não puderam ser processadas pelo Mercado Livre. Verifique se as fotos estão públicas em HTTPS.',
  },
  {
    padrao: /\b(price|available_quantity)\b/i,
    mensagem:
      'O preço final ou a quantidade em estoque está fora das regras permitidas pelo Mercado Livre.',
  },
  {
    padrao: /unauthorized|forbidden|invalid_token|expired|401|403/i,
    mensagem:
      'A autorização da sua conta do Mercado Livre expirou ou o anúncio pertence a outro vendedor. Reconecte sua conta em Configurações.',
  },
];

/**
 * Traduz mensagens técnicas retornadas pela API do Mercado Livre para português claro
 * e preserva a mensagem técnica bruta para exibição discreta no modal.
 */
export function traduzirErroMercadoLivre(mensagemBruta: string): ErroMercadoLivreTraduzido {
  const texto = String(mensagemBruta || '').trim();
  if (!texto) {
    return {
      mensagemAmigavel: 'Não foi possível concluir a operação no Mercado Livre. Tente novamente em instantes.',
    };
  }

  for (const regra of REGRAS_TRADUCAO_ERRO_ML) {
    if (regra.padrao.test(texto)) {
      return {
        mensagemAmigavel: regra.mensagem,
        detalheTecnico: texto,
      };
    }
  }

  // Detecta se há erro técnico em inglês ou payload de API embutido após ":"
  const pareceErroTecnicoIngles =
    /The body does not|Validation error|invalid_|missing_|properties\s*\[|Erro ML:|HTTP\s*\d{3}/i.test(texto);

  if (pareceErroTecnicoIngles) {
    return {
      mensagemAmigavel:
        'O Mercado Livre recusou os dados enviados durante a publicação. Revise os dados do produto e tente novamente.',
      detalheTecnico: texto,
    };
  }

  return { mensagemAmigavel: texto };
}
