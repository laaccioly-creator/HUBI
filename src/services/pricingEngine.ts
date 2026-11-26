import { Loja, Produto, VariacaoProduto, TabelaPreco, RegrasPrecificacaoLoja } from '../types';

/**
 * Determina quais modalidades de venda estão ativas para a loja
 */
export const obterTiposVendaAtivos = (loja?: Loja | null): { varejo: boolean; atacado: boolean; distribuidor: boolean } => {
  if (!loja) return { varejo: true, atacado: false, distribuidor: false };
  const raw = loja.tipos_venda || (loja as any).configuracoes_extras?.tipos_venda_ativos || {};
  return {
    varejo: raw.varejo !== false,
    atacado: raw.atacado === true || (loja as any).permite_atacado === true,
    distribuidor:
      raw.distribuidor === true ||
      raw.autoatacado === true ||
      (loja as any).permite_distribuidor === true
  };
};

export const REGRAS_PADRAO_INICIAIS: RegrasPrecificacaoLoja = {
  descontoAtacado: 0,
  valorMinimoAtacado: 0,
  qtdTotalMinimaAtacado: 0,
  qtdMinimaSkuAtacado: 0,

  descontoAutoatacado: 0,
  valorMinimoAutoatacado: 0,
  qtdTotalMinimaAutoatacado: 0,
  qtdMinimaSkuAutoatacado: 0
};

export type CriterioNivelPrecificacao = 'quantidade' | 'valor' | 'minimo_sku' | null;

export function resolverCriterioNivel(
  tipoRaw?: string | null,
  valorMin?: number | null,
  qtdMin?: number | null,
  skuMin?: number | null
): CriterioNivelPrecificacao {
  const tipo = String(tipoRaw || '').toLowerCase().trim();
  if (tipo === 'quantidade' || tipo === 'quantidade_total') {
    return Number(qtdMin || 0) > 0 ? 'quantidade' : null;
  }
  if (tipo === 'valor') {
    return Number(valorMin || 0) > 0 ? 'valor' : null;
  }
  if (tipo === 'minimo_sku') {
    return 'minimo_sku';
  }
  if (Number(valorMin || 0) > 0) return 'valor';
  if (Number(qtdMin || 0) > 0) return 'quantidade';
  if (Number(skuMin || 0) > 0) return 'minimo_sku';
  return null;
}

function normalizarRegrasNivel(params: {
  tipo?: string | null;
  desconto?: number | null;
  valorMinimo?: number | null;
  qtdTotalMinima?: number | null;
  qtdMinimaSku?: number | null;
}) {
  const desconto = Math.max(0, Number(params.desconto ?? 0) || 0);
  const rawTipo = String(params.tipo || '').toLowerCase().trim();
  const val = Math.max(0, Number(params.valorMinimo ?? 0) || 0);
  const qtd = Math.max(0, Number(params.qtdTotalMinima ?? 0) || 0);
  const sku = Math.max(0, Number(params.qtdMinimaSku ?? 0) || 0);

  if (rawTipo === 'quantidade' || rawTipo === 'quantidade_total') {
    return {
      tipo: 'quantidade' as const,
      desconto,
      valorMinimo: 0,
      qtdTotalMinima: qtd,
      qtdMinimaSku: 0,
    };
  }
  if (rawTipo === 'valor') {
    return {
      tipo: 'valor' as const,
      desconto,
      valorMinimo: val,
      qtdTotalMinima: 0,
      qtdMinimaSku: 0,
    };
  }
  if (rawTipo === 'minimo_sku') {
    return {
      tipo: 'minimo_sku' as const,
      desconto,
      valorMinimo: 0,
      qtdTotalMinima: 0,
      qtdMinimaSku: sku,
    };
  }

  return {
    tipo: val > 0 ? 'valor' : qtd > 0 ? 'quantidade' : sku > 0 ? 'minimo_sku' : undefined,
    desconto,
    valorMinimo: val,
    qtdTotalMinima: val > 0 ? 0 : qtd,
    qtdMinimaSku: val > 0 || qtd > 0 ? 0 : sku,
  };
}

/**
 * Obtém as regras de precificação ativas da loja, priorizando sempre as colunas relacionais do banco.
 */
export const obterRegrasPrecificacao = (loja?: Loja | null): RegrasPrecificacaoLoja => {
  if (!loja?.id) return { ...REGRAS_PADRAO_INICIAIS };

  const tiposVenda = obterTiposVendaAtivos(loja);

  const temColunasRelacionais =
    loja.tipo_minimo_padrao_atacado !== undefined ||
    loja.qtd_minima_padrao_atacado !== undefined ||
    loja.valor_minimo_padrao_atacado !== undefined ||
    loja.desconto_padrao_atacado_percentual !== undefined ||
    loja.tipo_minimo_padrao_autoatacado !== undefined ||
    loja.qtd_minima_padrao_autoatacado !== undefined ||
    loja.valor_minimo_padrao_autoatacado !== undefined ||
    loja.desconto_padrao_autoatacado_percentual !== undefined;

  if (!temColunasRelacionais && typeof localStorage !== 'undefined') {
    const keyStorage = `hubi_regras_precificacao_${loja.id}`;
    const regrasSalvas = localStorage.getItem(keyStorage);

    if (regrasSalvas) {
      try {
        const parsed = JSON.parse(regrasSalvas);
        const atacNorm = normalizarRegrasNivel({
          tipo: parsed.tipoMinimoAtacado,
          desconto: parsed.descontoAtacado,
          valorMinimo: parsed.valorMinimoAtacado,
          qtdTotalMinima: parsed.qtdTotalMinimaAtacado ?? parsed.qtdMinimaAtacado,
          qtdMinimaSku: parsed.qtdMinimaSkuAtacado,
        });
        const autoNorm = normalizarRegrasNivel({
          tipo: parsed.tipoMinimoDistribuidor || parsed.tipoMinimoAutoatacado,
          desconto: parsed.descontoAutoatacado,
          valorMinimo: parsed.valorMinimoAutoatacado,
          qtdTotalMinima: parsed.qtdTotalMinimaAutoatacado ?? parsed.qtdMinimaAutoatacado,
          qtdMinimaSku: parsed.qtdMinimaSkuAutoatacado,
        });
        return {
          descontoAtacado: atacNorm.desconto,
          valorMinimoAtacado: atacNorm.valorMinimo,
          qtdTotalMinimaAtacado: atacNorm.qtdTotalMinima,
          qtdMinimaSkuAtacado: atacNorm.qtdMinimaSku,
          tipoMinimoAtacado: atacNorm.tipo,

          descontoAutoatacado: autoNorm.desconto,
          valorMinimoAutoatacado: autoNorm.valorMinimo,
          qtdTotalMinimaAutoatacado: autoNorm.qtdTotalMinima,
          qtdMinimaSkuAutoatacado: autoNorm.qtdMinimaSku,
          tipoMinimoDistribuidor: autoNorm.tipo,
          tiposVendaAtivos: tiposVenda
        };
      } catch (e) {
        console.warn('Erro ao carregar regras de precificação salvas:', e);
      }
    }
  }

  const atacNorm = normalizarRegrasNivel({
    tipo: loja.tipo_minimo_padrao_atacado,
    desconto: loja.desconto_padrao_atacado_percentual,
    valorMinimo: loja.valor_minimo_padrao_atacado,
    qtdTotalMinima: loja.qtd_minima_padrao_atacado,
    qtdMinimaSku: loja.qtd_minima_sku_padrao_atacado,
  });

  const autoNorm = normalizarRegrasNivel({
    tipo: loja.tipo_minimo_padrao_autoatacado,
    desconto: loja.desconto_padrao_autoatacado_percentual,
    valorMinimo: loja.valor_minimo_padrao_autoatacado,
    qtdTotalMinima: loja.qtd_minima_padrao_autoatacado,
    qtdMinimaSku: loja.qtd_minima_sku_padrao_autoatacado,
  });

  return {
    descontoAtacado: atacNorm.desconto,
    valorMinimoAtacado: atacNorm.valorMinimo,
    qtdTotalMinimaAtacado: atacNorm.qtdTotalMinima,
    qtdMinimaSkuAtacado: atacNorm.qtdMinimaSku,
    tipoMinimoAtacado: atacNorm.tipo,

    descontoAutoatacado: autoNorm.desconto,
    valorMinimoAutoatacado: autoNorm.valorMinimo,
    qtdTotalMinimaAutoatacado: autoNorm.qtdTotalMinima,
    qtdMinimaSkuAutoatacado: autoNorm.qtdMinimaSku,
    tipoMinimoDistribuidor: autoNorm.tipo,
    tiposVendaAtivos: tiposVenda
  };
};

export interface ItemParaAvaliacao {
  id: string;
  produto: Produto;
  variacao?: VariacaoProduto | null;
  quantidade: number;
}

export interface SkuFracionadoInfo {
  id: string;
  nome: string;
  variacaoNome?: string;
  quantidadeAtual: number;
  quantidadeMinimaExigida: number;
  faltamUnidades: number;
}

export interface ResultadoAvaliacaoCarrinho {
  tabelaAtiva: TabelaPreco;
  criterioAtendido: 'valor' | 'quantidade' | 'ambos' | 'nenhum';
  totalVarejo: number;
  totalFinal: number;
  economiaTotal: number;
  percentualDescontoMedio: number;
  totalPecas: number;

  proximoNivel: 'atacado' | 'autoatacado' | null;
  faltaValorParaProximo: number;
  faltaPecasParaProximo: number;
  progressoValorPercent: number;
  progressoQtdPercent: number;
  progressoGeralPercent: number;

  skusFracionados: SkuFracionadoInfo[];
}

function obterMinimoSkuItem(
  produto: Produto,
  nivel: 'atacado' | 'autoatacado',
  regras?: RegrasPrecificacaoLoja
): number {
  const tipoProd = nivel === 'autoatacado' ? produto.tipo_minimo_autoatacado : produto.tipo_minimo_atacado;
  const qtdProd = Number(nivel === 'autoatacado' ? produto.qtd_minima_autoatacado : produto.qtd_minima_atacado) || 0;
  const qtdPadraoSku = Number(nivel === 'autoatacado' ? regras?.qtdMinimaSkuAutoatacado : regras?.qtdMinimaSkuAtacado) || 0;
  if (tipoProd === 'minimo_sku' && qtdProd > 0) return qtdProd;
  return qtdPadraoSku > 0 ? qtdPadraoSku : 0;
}

/**
 * Calcula o preço unitário de um produto/variação para uma determinada tabela de preços
 */
export const calcularPrecoUnitarioPorTabela = (
  produto: Produto,
  variacao?: VariacaoProduto | null,
  tabela: TabelaPreco = 'varejo',
  descontoFallbackPercent: number = 0,
  quantidadeItem?: number,
  regras?: RegrasPrecificacaoLoja
): number => {
  const precoVarejo = Number(variacao ? variacao.preco_venda_varejo : produto.preco_venda_varejo) || 0;
  const atacadoAtivo = regras ? regras.tiposVendaAtivos?.atacado === true : true;
  const distribuidorAtivo = regras ? regras.tiposVendaAtivos?.distribuidor === true : false;

  if (tabela === 'autoatacado' && regras && !distribuidorAtivo) {
    tabela = atacadoAtivo ? 'atacado' : 'varejo';
  }
  if (tabela === 'atacado' && regras && !atacadoAtivo) {
    tabela = 'varejo';
  }

  if (quantidadeItem !== undefined && tabela !== 'promocional') {
    const criterioAtacado = resolverCriterioNivel(
      regras?.tipoMinimoAtacado ?? produto.tipo_minimo_atacado,
      regras?.valorMinimoAtacado,
      regras?.qtdTotalMinimaAtacado,
      regras?.qtdMinimaSkuAtacado
    );
    const criterioAuto = resolverCriterioNivel(
      regras?.tipoMinimoDistribuidor ?? produto.tipo_minimo_autoatacado,
      regras?.valorMinimoAutoatacado,
      regras?.qtdTotalMinimaAutoatacado,
      regras?.qtdMinimaSkuAutoatacado
    );

    const exigeSkuAtacado = criterioAtacado === 'minimo_sku';
    const exigeSkuAuto = criterioAuto === 'minimo_sku';
    const minSkuAtacado = exigeSkuAtacado ? obterMinimoSkuItem(produto, 'atacado', regras) : 0;
    const minSkuAuto = exigeSkuAuto ? obterMinimoSkuItem(produto, 'autoatacado', regras) : 0;

    if (distribuidorAtivo && exigeSkuAuto && minSkuAuto > 0 && quantidadeItem >= minSkuAuto) {
      tabela = 'autoatacado';
      descontoFallbackPercent = regras?.descontoAutoatacado ?? descontoFallbackPercent;
    } else if (atacadoAtivo && exigeSkuAtacado && minSkuAtacado > 0 && quantidadeItem >= minSkuAtacado) {
      if (tabela !== 'autoatacado') {
        tabela = 'atacado';
        descontoFallbackPercent = regras?.descontoAtacado ?? descontoFallbackPercent;
      }
    } else if (
      tabela === 'atacado' &&
      exigeSkuAtacado &&
      (minSkuAtacado <= 0 || quantidadeItem < minSkuAtacado)
    ) {
      tabela = 'varejo';
    } else if (
      tabela === 'autoatacado' &&
      exigeSkuAuto &&
      (minSkuAuto <= 0 || quantidadeItem < minSkuAuto)
    ) {
      tabela = (atacadoAtivo && exigeSkuAtacado && minSkuAtacado > 0 && quantidadeItem >= minSkuAtacado) ? 'atacado' : 'varejo';
    }
  }

  if (tabela === 'promocional') {
    const precoPromo = variacao ? variacao.preco_promocional : produto.preco_promocional;
    if (produto.promocao_ativa && precoPromo && Number(precoPromo) > 0) {
      return Number(precoPromo);
    }
  }

  if (tabela === 'autoatacado') {
    const precoAuto = variacao ? variacao.preco_venda_autoatacado : produto.preco_venda_autoatacado;
    if (precoAuto && Number(precoAuto) > 0) {
      return Number(precoAuto);
    }
    if (descontoFallbackPercent > 0) {
      return precoVarejo * (1 - descontoFallbackPercent / 100);
    }
    const precoAtac = variacao ? variacao.preco_venda_atacado : produto.preco_venda_atacado;
    if (precoAtac && Number(precoAtac) > 0) return Number(precoAtac);
    return precoVarejo;
  }

  if (tabela === 'atacado') {
    const precoAtac = variacao ? variacao.preco_venda_atacado : produto.preco_venda_atacado;
    if (precoAtac && Number(precoAtac) > 0) {
      return Number(precoAtac);
    }
    if (descontoFallbackPercent > 0) {
      return precoVarejo * (1 - descontoFallbackPercent / 100);
    }
    return precoVarejo;
  }

  // Varejo / Padrão (com checagem de promoção)
  const precoPromoVar = variacao?.preco_promocional && Number(variacao.preco_promocional) > 0 ? Number(variacao.preco_promocional) : null;
  if (precoPromoVar) {
    return precoPromoVar;
  }

  if (produto.promocao_ativa && produto.preco_promocional && Number(produto.preco_promocional) > 0) {
    return Number(produto.preco_promocional);
  }

  return precoVarejo;
};

/**
 * Avalia em tempo real todos os itens do carrinho contra as regras de precificação
 */
export const avaliarNivelCarrinho = (
  itens: ItemParaAvaliacao[],
  regras: RegrasPrecificacaoLoja
): ResultadoAvaliacaoCarrinho => {
  const atacadoAtivo = regras.tiposVendaAtivos?.atacado === true;
  const distribuidorAtivo = regras.tiposVendaAtivos?.distribuidor === true;

  const criterioAtacado = atacadoAtivo
    ? resolverCriterioNivel(
        regras.tipoMinimoAtacado,
        regras.valorMinimoAtacado,
        regras.qtdTotalMinimaAtacado,
        regras.qtdMinimaSkuAtacado
      )
    : null;
  const criterioAuto = distribuidorAtivo
    ? resolverCriterioNivel(
        regras.tipoMinimoDistribuidor,
        regras.valorMinimoAutoatacado,
        regras.qtdTotalMinimaAutoatacado,
        regras.qtdMinimaSkuAutoatacado
      )
    : null;

  const atacadoTemMetaGlobal = criterioAtacado === 'quantidade' || criterioAtacado === 'valor';
  const autoTemMetaGlobal = criterioAuto === 'quantidade' || criterioAuto === 'valor';

  if (!itens || itens.length === 0) {
    const proximoNivelInicial = atacadoTemMetaGlobal ? 'atacado' : (autoTemMetaGlobal ? 'autoatacado' : null);
    const criterioInicial = proximoNivelInicial === 'atacado' ? criterioAtacado : criterioAuto;
    const metaValorInicial =
      criterioInicial === 'valor'
        ? (proximoNivelInicial === 'atacado' ? Number(regras.valorMinimoAtacado || 0) : Number(regras.valorMinimoAutoatacado || 0))
        : 0;
    const metaPecasInicial =
      criterioInicial === 'quantidade'
        ? (proximoNivelInicial === 'atacado' ? Number(regras.qtdTotalMinimaAtacado || 0) : Number(regras.qtdTotalMinimaAutoatacado || 0))
        : 0;

    return {
      tabelaAtiva: 'varejo',
      criterioAtendido: 'nenhum',
      totalVarejo: 0,
      totalFinal: 0,
      economiaTotal: 0,
      percentualDescontoMedio: 0,
      totalPecas: 0,
      proximoNivel: proximoNivelInicial,
      faltaValorParaProximo: metaValorInicial,
      faltaPecasParaProximo: metaPecasInicial,
      progressoValorPercent: 0,
      progressoQtdPercent: 0,
      progressoGeralPercent: 0,
      skusFracionados: []
    };
  }

  // 1. Calcular totais base em Varejo
  let totalVarejo = 0;
  let totalPecas = 0;

  for (const item of itens) {
    const precoUnitVarejo = Number(item.variacao ? item.variacao.preco_venda_varejo : item.produto.preco_venda_varejo) || 0;
    totalVarejo += precoUnitVarejo * item.quantidade;
    totalPecas += item.quantidade;
  }

  // 2. Verificar conformidade de SKUs apenas quando o critério ativo do nível for 'minimo_sku'
  const skusAbaixoMinimoAtacado: SkuFracionadoInfo[] = [];
  const skusAbaixoMinimoAuto: SkuFracionadoInfo[] = [];
  let algumSkuAtendeAtacado = false;
  let algumSkuAtendeAuto = false;

  const exigeSkuAtacado = criterioAtacado === 'minimo_sku';
  const exigeSkuAuto = criterioAuto === 'minimo_sku';

  for (const item of itens) {
    if (exigeSkuAtacado) {
      const minSkuAtacado = obterMinimoSkuItem(item.produto, 'atacado', regras);
      if (minSkuAtacado > 0) {
        if (item.quantidade >= minSkuAtacado) {
          algumSkuAtendeAtacado = true;
        } else {
          skusAbaixoMinimoAtacado.push({
            id: item.id,
            nome: item.produto.nome,
            variacaoNome: item.variacao ? `${item.variacao.valor_variacao_1}${item.variacao.valor_variacao_2 ? ` - ${item.variacao.valor_variacao_2}` : ''}` : undefined,
            quantidadeAtual: item.quantidade,
            quantidadeMinimaExigida: minSkuAtacado,
            faltamUnidades: Math.max(0, minSkuAtacado - item.quantidade)
          });
        }
      }
    }

    if (exigeSkuAuto) {
      const minSkuAuto = obterMinimoSkuItem(item.produto, 'autoatacado', regras);
      if (minSkuAuto > 0) {
        if (item.quantidade >= minSkuAuto) {
          algumSkuAtendeAuto = true;
        } else {
          skusAbaixoMinimoAuto.push({
            id: item.id,
            nome: item.produto.nome,
            variacaoNome: item.variacao ? `${item.variacao.valor_variacao_1}${item.variacao.valor_variacao_2 ? ` - ${item.variacao.valor_variacao_2}` : ''}` : undefined,
            quantidadeAtual: item.quantidade,
            quantidadeMinimaExigida: minSkuAuto,
            faltamUnidades: Math.max(0, minSkuAuto - item.quantidade)
          });
        }
      }
    }
  }

  const todosSkusAtendemAtacado = !exigeSkuAtacado || skusAbaixoMinimoAtacado.length === 0;
  const todosSkusAtendemAuto = !exigeSkuAuto || skusAbaixoMinimoAuto.length === 0;

  // 3. Avaliar Elegibilidade Autoatacado / Distribuidor usando exclusivamente o critério configurado (> 0)
  const valorMinAuto = Number(regras.valorMinimoAutoatacado || 0);
  const qtdMinAuto = Number(regras.qtdTotalMinimaAutoatacado || 0);
  const atendeValorAuto = criterioAuto === 'valor' && valorMinAuto > 0 && totalVarejo >= valorMinAuto;
  const atendeQtdTotalAuto = criterioAuto === 'quantidade' && qtdMinAuto > 0 && totalPecas >= qtdMinAuto;
  const atendeSkuAuto = criterioAuto === 'minimo_sku' && algumSkuAtendeAuto;
  const elegivelAutoatacado = distribuidorAtivo && (atendeValorAuto || atendeQtdTotalAuto || atendeSkuAuto);

  // 4. Avaliar Elegibilidade Atacado usando exclusivamente o critério configurado (> 0)
  const valorMinAtac = Number(regras.valorMinimoAtacado || 0);
  const qtdMinAtac = Number(regras.qtdTotalMinimaAtacado || 0);
  const atendeValorAtacado = criterioAtacado === 'valor' && valorMinAtac > 0 && totalVarejo >= valorMinAtac;
  const atendeQtdTotalAtacado = criterioAtacado === 'quantidade' && qtdMinAtac > 0 && totalPecas >= qtdMinAtac;
  const atendeSkuAtacado = criterioAtacado === 'minimo_sku' && algumSkuAtendeAtacado;
  const elegivelAtacado = atacadoAtivo && (atendeValorAtacado || atendeQtdTotalAtacado || atendeSkuAtacado);

  // 5. Determinar Tabela Ativa e Próximo Nível
  let tabelaAtiva: TabelaPreco = 'varejo';
  let criterioAtendido: 'valor' | 'quantidade' | 'ambos' | 'nenhum' = 'nenhum';
  let proximoNivel: 'atacado' | 'autoatacado' | null = null;
  let faltaValor = 0;
  let faltaPecas = 0;
  let metaValor = 0;
  let metaPecas = 0;
  let skusFracionados: SkuFracionadoInfo[] = [];

  if (elegivelAutoatacado) {
    tabelaAtiva = 'autoatacado';
    criterioAtendido = atendeValorAuto ? 'valor' : 'quantidade';
    proximoNivel = null;
    faltaValor = 0;
    faltaPecas = 0;
    skusFracionados = [];
  } else if (elegivelAtacado) {
    tabelaAtiva = 'atacado';
    criterioAtendido = atendeValorAtacado ? 'valor' : 'quantidade';
    proximoNivel = autoTemMetaGlobal ? 'autoatacado' : null;
    if (proximoNivel === 'autoatacado') {
      if (criterioAuto === 'quantidade' && qtdMinAuto > 0) {
        metaPecas = qtdMinAuto;
        faltaPecas = Math.max(0, qtdMinAuto - totalPecas);
      } else if (criterioAuto === 'valor' && valorMinAuto > 0) {
        metaValor = valorMinAuto;
        faltaValor = Math.max(0, valorMinAuto - totalVarejo);
      }
    }

    if (exigeSkuAtacado && !todosSkusAtendemAtacado) {
      skusFracionados = skusAbaixoMinimoAtacado;
    } else if (exigeSkuAuto && !todosSkusAtendemAuto) {
      skusFracionados = skusAbaixoMinimoAuto;
    }
  } else {
    tabelaAtiva = 'varejo';
    criterioAtendido = 'nenhum';
    proximoNivel = atacadoTemMetaGlobal ? 'atacado' : (autoTemMetaGlobal ? 'autoatacado' : null);
    if (proximoNivel === 'atacado') {
      if (criterioAtacado === 'quantidade' && qtdMinAtac > 0) {
        metaPecas = qtdMinAtac;
        faltaPecas = Math.max(0, qtdMinAtac - totalPecas);
      } else if (criterioAtacado === 'valor' && valorMinAtac > 0) {
        metaValor = valorMinAtac;
        faltaValor = Math.max(0, valorMinAtac - totalVarejo);
      }
      if (exigeSkuAtacado && !todosSkusAtendemAtacado) {
        skusFracionados = skusAbaixoMinimoAtacado;
      }
    } else if (proximoNivel === 'autoatacado') {
      if (criterioAuto === 'quantidade' && qtdMinAuto > 0) {
        metaPecas = qtdMinAuto;
        faltaPecas = Math.max(0, qtdMinAuto - totalPecas);
      } else if (criterioAuto === 'valor' && valorMinAuto > 0) {
        metaValor = valorMinAuto;
        faltaValor = Math.max(0, valorMinAuto - totalVarejo);
      }
      if (exigeSkuAuto && !todosSkusAtendemAuto) {
        skusFracionados = skusAbaixoMinimoAuto;
      }
    }
  }

  // 6. Calcular Totais com a Tabela Ativa
  let totalFinal = 0;
  const descontoFallback = tabelaAtiva === 'autoatacado' ? regras.descontoAutoatacado : tabelaAtiva === 'atacado' ? regras.descontoAtacado : 0;

  for (const item of itens) {
    const precoUnit = calcularPrecoUnitarioPorTabela(item.produto, item.variacao, tabelaAtiva, descontoFallback, item.quantidade, regras);
    totalFinal += precoUnit * item.quantidade;
  }

  const economiaTotal = Math.max(0, totalVarejo - totalFinal);
  const percentualDescontoMedio = totalVarejo > 0 ? (economiaTotal / totalVarejo) * 100 : 0;

  // 7. Cálculo de Porcentagem de Progresso
  const progressoValorPercent = metaValor > 0 ? Math.min(100, Math.round((totalVarejo / metaValor) * 100)) : 0;
  const progressoQtdPercent = metaPecas > 0 ? Math.min(100, Math.round((totalPecas / metaPecas) * 100)) : 0;
  const progressoGeralPercent =
    proximoNivel === null && tabelaAtiva !== 'varejo'
      ? 100
      : metaPecas > 0
      ? progressoQtdPercent
      : metaValor > 0
      ? progressoValorPercent
      : 0;

  return {
    tabelaAtiva,
    criterioAtendido,
    totalVarejo,
    totalFinal,
    economiaTotal,
    percentualDescontoMedio,
    totalPecas,
    proximoNivel,
    faltaValorParaProximo: faltaValor,
    faltaPecasParaProximo: faltaPecas,
    progressoValorPercent,
    progressoQtdPercent,
    progressoGeralPercent,
    skusFracionados
  };
};
