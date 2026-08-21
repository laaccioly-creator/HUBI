import { Loja, Produto, VariacaoProduto, TabelaPreco, RegrasPrecificacaoLoja } from '../types';

export const REGRAS_PADRAO_INICIAIS: RegrasPrecificacaoLoja = {
  descontoAtacado: 20,
  valorMinimoAtacado: 1500,
  qtdTotalMinimaAtacado: 50,
  qtdMinimaSkuAtacado: 6,

  descontoAutoatacado: 25,
  valorMinimoAutoatacado: 3000,
  qtdTotalMinimaAutoatacado: 100,
  qtdMinimaSkuAutoatacado: 6
};

/**
 * Obtém as regras de precificação ativas da loja, consultando o cache local e o objeto Loja
 */
export const obterRegrasPrecificacao = (loja?: Loja | null): RegrasPrecificacaoLoja => {
  if (!loja?.id) return { ...REGRAS_PADRAO_INICIAIS };

  const keyStorage = `hubi_regras_precificacao_${loja.id}`;
  const regrasSalvas = localStorage.getItem(keyStorage);

  if (regrasSalvas) {
    try {
      const parsed = JSON.parse(regrasSalvas);
      return {
        descontoAtacado: Number(parsed.descontoAtacado ?? REGRAS_PADRAO_INICIAIS.descontoAtacado),
        valorMinimoAtacado: Number(parsed.valorMinimoAtacado ?? REGRAS_PADRAO_INICIAIS.valorMinimoAtacado),
        qtdTotalMinimaAtacado: Number(parsed.qtdTotalMinimaAtacado ?? parsed.qtdMinimaAtacado ?? REGRAS_PADRAO_INICIAIS.qtdTotalMinimaAtacado),
        qtdMinimaSkuAtacado: Number(parsed.qtdMinimaSkuAtacado ?? REGRAS_PADRAO_INICIAIS.qtdMinimaSkuAtacado),

        descontoAutoatacado: Number(parsed.descontoAutoatacado ?? REGRAS_PADRAO_INICIAIS.descontoAutoatacado),
        valorMinimoAutoatacado: Number(parsed.valorMinimoAutoatacado ?? REGRAS_PADRAO_INICIAIS.valorMinimoAutoatacado),
        qtdTotalMinimaAutoatacado: Number(parsed.qtdTotalMinimaAutoatacado ?? parsed.qtdMinimaAutoatacado ?? REGRAS_PADRAO_INICIAIS.qtdTotalMinimaAutoatacado),
        qtdMinimaSkuAutoatacado: Number(parsed.qtdMinimaSkuAutoatacado ?? REGRAS_PADRAO_INICIAIS.qtdMinimaSkuAutoatacado)
      };
    } catch (e) {
      console.warn('Erro ao carregar regras de precificação salvas:', e);
    }
  }

  // Fallback para campos da loja no banco de dados
  return {
    descontoAtacado: Number(loja.desconto_padrao_atacado_percentual ?? REGRAS_PADRAO_INICIAIS.descontoAtacado),
    valorMinimoAtacado: Number(loja.valor_minimo_padrao_atacado ?? REGRAS_PADRAO_INICIAIS.valorMinimoAtacado),
    qtdTotalMinimaAtacado: Number(loja.qtd_minima_padrao_atacado ?? REGRAS_PADRAO_INICIAIS.qtdTotalMinimaAtacado),
    qtdMinimaSkuAtacado: Number(loja.qtd_minima_sku_padrao_atacado ?? REGRAS_PADRAO_INICIAIS.qtdMinimaSkuAtacado),

    descontoAutoatacado: Number(loja.desconto_padrao_autoatacado_percentual ?? REGRAS_PADRAO_INICIAIS.descontoAutoatacado),
    valorMinimoAutoatacado: Number(loja.valor_minimo_padrao_autoatacado ?? REGRAS_PADRAO_INICIAIS.valorMinimoAutoatacado),
    qtdTotalMinimaAutoatacado: Number(loja.qtd_minima_padrao_autoatacado ?? REGRAS_PADRAO_INICIAIS.qtdTotalMinimaAutoatacado),
    qtdMinimaSkuAutoatacado: Number(loja.qtd_minima_sku_padrao_autoatacado ?? REGRAS_PADRAO_INICIAIS.qtdMinimaSkuAutoatacado)
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

/**
 * Calcula o preço unitário de um produto/variação para uma determinada tabela de preços
 */
export const calcularPrecoUnitarioPorTabela = (
  produto: Produto,
  variacao?: VariacaoProduto | null,
  tabela: TabelaPreco = 'varejo',
  descontoFallbackPercent: number = 0
): number => {
  const precoVarejo = Number(variacao ? variacao.preco_venda_varejo : produto.preco_venda_varejo) || 0;

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
    // Fallback: se não tiver preço explícito, calcula aplicando o % de desconto sobre o varejo
    if (descontoFallbackPercent > 0) {
      return precoVarejo * (1 - descontoFallbackPercent / 100);
    }
    // Fallback para preço de atacado se existir
    const precoAtac = variacao ? variacao.preco_venda_atacado : produto.preco_venda_atacado;
    if (precoAtac && Number(precoAtac) > 0) return Number(precoAtac);
    return precoVarejo;
  }

  if (tabela === 'atacado') {
    const precoAtac = variacao ? variacao.preco_venda_atacado : produto.preco_venda_atacado;
    if (precoAtac && Number(precoAtac) > 0) {
      return Number(precoAtac);
    }
    // Fallback: se não tiver preço explícito, calcula aplicando o % de desconto sobre o varejo
    if (descontoFallbackPercent > 0) {
      return precoVarejo * (1 - descontoFallbackPercent / 100);
    }
    return precoVarejo;
  }

  // Varejo / Padrão (com checagem de promoção)
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
  if (!itens || itens.length === 0) {
    return {
      tabelaAtiva: 'varejo',
      criterioAtendido: 'nenhum',
      totalVarejo: 0,
      totalFinal: 0,
      economiaTotal: 0,
      percentualDescontoMedio: 0,
      totalPecas: 0,
      proximoNivel: 'atacado',
      faltaValorParaProximo: regras.valorMinimoAtacado,
      faltaPecasParaProximo: regras.qtdTotalMinimaAtacado,
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

  // 2. Verificar conformidade de SKUs para Atacado e Autoatacado
  const skusAbaixoMinimoAtacado: SkuFracionadoInfo[] = [];
  const skusAbaixoMinimoAuto: SkuFracionadoInfo[] = [];

  for (const item of itens) {
    if (item.quantidade < regras.qtdMinimaSkuAtacado) {
      skusAbaixoMinimoAtacado.push({
        id: item.id,
        nome: item.produto.nome,
        variacaoNome: item.variacao ? `${item.variacao.valor_variacao_1}${item.variacao.valor_variacao_2 ? ` - ${item.variacao.valor_variacao_2}` : ''}` : undefined,
        quantidadeAtual: item.quantidade,
        quantidadeMinimaExigida: regras.qtdMinimaSkuAtacado,
        faltamUnidades: regras.qtdMinimaSkuAtacado - item.quantidade
      });
    }

    if (item.quantidade < regras.qtdMinimaSkuAutoatacado) {
      skusAbaixoMinimoAuto.push({
        id: item.id,
        nome: item.produto.nome,
        variacaoNome: item.variacao ? `${item.variacao.valor_variacao_1}${item.variacao.valor_variacao_2 ? ` - ${item.variacao.valor_variacao_2}` : ''}` : undefined,
        quantidadeAtual: item.quantidade,
        quantidadeMinimaExigida: regras.qtdMinimaSkuAutoatacado,
        faltamUnidades: regras.qtdMinimaSkuAutoatacado - item.quantidade
      });
    }
  }

  const todosSkusAtendemAtacado = skusAbaixoMinimoAtacado.length === 0;
  const todosSkusAtendemAuto = skusAbaixoMinimoAuto.length === 0;

  // 3. Avaliar Elegibilidade Autoatacado / Distribuidor
  const atendeValorAuto = Number(regras.valorMinimoAutoatacado) > 0 && totalVarejo >= Number(regras.valorMinimoAutoatacado);
  const atendeQtdAuto = Number(regras.qtdTotalMinimaAutoatacado) > 0 && totalPecas >= Number(regras.qtdTotalMinimaAutoatacado) && todosSkusAtendemAuto;
  const elegivelAutoatacado = atendeValorAuto || atendeQtdAuto;

  // 4. Avaliar Elegibilidade Atacado
  const atendeValorAtacado = Number(regras.valorMinimoAtacado) > 0 && totalVarejo >= Number(regras.valorMinimoAtacado);
  const atendeQtdAtacado = Number(regras.qtdTotalMinimaAtacado) > 0 && totalPecas >= Number(regras.qtdTotalMinimaAtacado) && todosSkusAtendemAtacado;
  const elegivelAtacado = atendeValorAtacado || atendeQtdAtacado;

  // 5. Determinar Tabela Ativa
  let tabelaAtiva: TabelaPreco = 'varejo';
  let criterioAtendido: 'valor' | 'quantidade' | 'ambos' | 'nenhum' = 'nenhum';
  let proximoNivel: 'atacado' | 'autoatacado' | null = 'atacado';
  let faltaValor = 0;
  let faltaPecas = 0;
  let metaValor = regras.valorMinimoAtacado;
  let metaPecas = regras.qtdTotalMinimaAtacado;
  let skusFracionados: SkuFracionadoInfo[] = [];

  if (elegivelAutoatacado) {
    tabelaAtiva = 'autoatacado';
    criterioAtendido = (atendeValorAuto && atendeQtdAuto) ? 'ambos' : atendeValorAuto ? 'valor' : 'quantidade';
    proximoNivel = null; // Já no topo máximo
    faltaValor = 0;
    faltaPecas = 0;
    skusFracionados = [];
  } else if (elegivelAtacado) {
    tabelaAtiva = 'atacado';
    criterioAtendido = (atendeValorAtacado && atendeQtdAtacado) ? 'ambos' : atendeValorAtacado ? 'valor' : 'quantidade';
    proximoNivel = 'autoatacado';
    metaValor = regras.valorMinimoAutoatacado;
    metaPecas = regras.qtdTotalMinimaAutoatacado;
    faltaValor = Math.max(0, regras.valorMinimoAutoatacado - totalVarejo);
    faltaPecas = Math.max(0, regras.qtdTotalMinimaAutoatacado - totalPecas);

    // Se já atingiu a meta de peças do autoatacado mas tem SKU com < minSkuAuto
    if (totalPecas >= regras.qtdTotalMinimaAutoatacado && !todosSkusAtendemAuto) {
      skusFracionados = skusAbaixoMinimoAuto;
    }
  } else {
    tabelaAtiva = 'varejo';
    criterioAtendido = 'nenhum';
    proximoNivel = 'atacado';
    metaValor = regras.valorMinimoAtacado;
    metaPecas = regras.qtdTotalMinimaAtacado;
    faltaValor = Math.max(0, regras.valorMinimoAtacado - totalVarejo);
    faltaPecas = Math.max(0, regras.qtdTotalMinimaAtacado - totalPecas);

    // Se já atingiu a meta global de peças do atacado mas tem SKU fracionado (< 6 un)
    if (totalPecas >= regras.qtdTotalMinimaAtacado && !todosSkusAtendemAtacado) {
      skusFracionados = skusAbaixoMinimoAtacado;
    }
  }

  // 6. Calcular Totais com a Tabela Ativa
  let totalFinal = 0;
  const descontoFallback = tabelaAtiva === 'autoatacado' ? regras.descontoAutoatacado : tabelaAtiva === 'atacado' ? regras.descontoAtacado : 0;

  for (const item of itens) {
    const precoUnit = calcularPrecoUnitarioPorTabela(item.produto, item.variacao, tabelaAtiva, descontoFallback);
    totalFinal += precoUnit * item.quantidade;
  }

  const economiaTotal = Math.max(0, totalVarejo - totalFinal);
  const percentualDescontoMedio = totalVarejo > 0 ? (economiaTotal / totalVarejo) * 100 : 0;

  // 7. Cálculo de Porcentagem de Progresso
  const progressoValorPercent = metaValor > 0 ? Math.min(100, Math.round((totalVarejo / metaValor) * 100)) : 0;
  const progressoQtdPercent = metaPecas > 0 ? Math.min(100, Math.round((totalPecas / metaPecas) * 100)) : 0;
  const progressoGeralPercent = Math.max(progressoValorPercent, progressoQtdPercent);

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
