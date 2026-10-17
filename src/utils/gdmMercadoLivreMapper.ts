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

  if (opcoes.marca) {
    atributos.push({ id: 'BRAND', value_name: opcoes.marca.trim() });
  }

  if (opcoes.modelo) {
    atributos.push({ id: 'MODEL', value_name: opcoes.modelo.trim() });
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
