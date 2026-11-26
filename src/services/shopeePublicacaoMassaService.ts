import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { Categoria, Produto, VariacaoProduto } from '../types';
import { formatarDataHoraLocal, obterDataLocalYYYYMMDD } from '../utils/dateTime';
import { validarGtinGs1 } from '../utils/gdmMercadoLivreMapper';
import { FichaProdutoMlHubi, mercadoLivreJevService } from './mercadoLivreJevService';
import {
  MarketplaceLotePublicacao,
  MarketplaceLotePublicacaoItem,
} from './mercadoLivrePublicacaoMassaService';
import { mercadoLivreService, MlAtributoObrigatorioCategoria } from './mercadoLivreService';
import { catalogJevService } from './catalogJevService';
import { ehUrlExternaParaEspelhar, espelharListaImagensProduto } from './imagemStorageService';
import {
  descricaoEhGenericaOuCurta,
  garantirDescricaoProfissionalMarketplace,
} from './descricaoComercialService';
import {
  calcularBreakdownPrecoShopee,
  obterPermalinkAnuncioShopee,
  shopeeService,
} from './shopeeService';

export interface ItemPublicadoMassaShopee {
  produtoId: string;
  nome: string;
  mlItemId: string;
  permalink: string;
  gtinSincronizado?: string | null;
}

export interface ItemFalhaMassaShopee {
  produtoId: string;
  nome: string;
  motivo: string;
  tipo: 'erro' | 'pulado';
}

export interface EstadoPublicacaoMassaShopee {
  lojaId: string | null;
  status: 'ocioso' | 'executando' | 'concluido' | 'cancelado';
  modalAberto: boolean;
  minimizado: boolean;
  abaAtiva: 'nova' | 'relatorios';
  loteAtualId: string | null;
  loteSelecionadoRelatorioId: string | null;
  categoriaInicialId: string | null;
  total: number;
  processados: number;
  publicados: number;
  falhas: number;
  pulados: number;
  produtoAtualNome: string;
  etapaAtual: string;
  itensPublicados: ItemPublicadoMassaShopee[];
  itensFalha: ItemFalhaMassaShopee[];
  versaoAtualizacao: number;
}

export interface ParamsIniciarPublicacaoMassaShopee {
  lojaId: string;
  contaId?: string | null;
  shopId?: number | null;
  usuarioId?: string | null;
  escopoTipo: 'todos' | 'categoria';
  escopoDescricao: string;
  categoriaFiltroId?: string | null;
  subcategoriaFiltroId?: string | null;
  produtos: Produto[];
  categorias: Categoria[];
  margemComissao: number;
  custoFixo: number;
  permitirSemEan: boolean;
}

const INTERVALO_RATE_LIMIT_MS = 1500;
const MOTIVO_SEM_EAN_OFICIAL =
  'Sem código de barras (EAN/GTIN) cadastrado e IA não localizou EAN oficial válido.';

const ESTADO_INICIAL: EstadoPublicacaoMassaShopee = {
  lojaId: null,
  status: 'ocioso',
  modalAberto: false,
  minimizado: false,
  abaAtiva: 'nova',
  loteAtualId: null,
  loteSelecionadoRelatorioId: null,
  categoriaInicialId: null,
  total: 0,
  processados: 0,
  publicados: 0,
  falhas: 0,
  pulados: 0,
  produtoAtualNome: '',
  etapaAtual: '',
  itensPublicados: [],
  itensFalha: [],
  versaoAtualizacao: 0,
};

let estadoAtual: EstadoPublicacaoMassaShopee = { ...ESTADO_INICIAL };
let cancelamentoSolicitado = false;
const ouvintes = new Set<() => void>();

function notificarOuvintes(): void {
  ouvintes.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.warn('[shopeePublicacaoMassaService] Erro em listener:', err);
    }
  });
}

function atualizarEstado(parcial: Partial<EstadoPublicacaoMassaShopee>): void {
  estadoAtual = {
    ...estadoAtual,
    ...parcial,
  };
  notificarOuvintes();
}

async function aguardarComCancelamento(duracaoMs: number): Promise<void> {
  const passoMs = 100;
  let decorrido = 0;
  while (decorrido < duracaoMs && !cancelamentoSolicitado) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(passoMs, duracaoMs - decorrido))
    );
    decorrido += passoMs;
  }
}

function selecionarVariacaoElegivel(produto: Produto): VariacaoProduto | null {
  if (!produto.tem_variacoes || !Array.isArray(produto.variacoes) || produto.variacoes.length === 0) {
    return null;
  }
  const variacaoComEstoque = produto.variacoes.find((v) => Number(v.quantidade_estoque || 0) > 0);
  return variacaoComEstoque || produto.variacoes[0] || null;
}

function construirFichaProdutoShopee(
  produto: Produto,
  variacao: VariacaoProduto | null,
  mapaCategorias: Map<string, Categoria>
): FichaProdutoMlHubi {
  const categoriaLocal =
    produto.categoria_nome ||
    produto.categoria?.nome ||
    (produto.categoria_id ? mapaCategorias.get(produto.categoria_id)?.nome : null) ||
    null;
  const subcategoriaLocal =
    produto.subcategoria_nome ||
    produto.subcategoria?.nome ||
    (produto.subcategoria_id ? mapaCategorias.get(produto.subcategoria_id)?.nome : null) ||
    null;

  return {
    produtoId: produto.id,
    variacaoId: variacao?.id || null,
    nome: variacao?.combinacao_nome ? `${produto.nome} ${variacao.combinacao_nome}` : produto.nome,
    descricao: produto.descricao || null,
    categoriaLocal,
    subcategoriaLocal,
    codigoBarras: variacao?.codigo_barras || produto.codigo_barras || null,
    codigoInterno: variacao?.sku || produto.codigo_interno || null,
    variacaoNome: variacao?.combinacao_nome || null,
  };
}

async function criarRegistroLoteShopeeDb(
  params: ParamsIniciarPublicacaoMassaShopee
): Promise<{ loteId: string | null; shopId: number | null }> {
  try {
    let contaIdResolvida = params.contaId || null;
    let shopIdResolvido = params.shopId || null;
    if (!contaIdResolvida || !shopIdResolvido) {
      const conta = await shopeeService.obterConta(params.lojaId);
      contaIdResolvida = conta?.id || contaIdResolvida;
      shopIdResolvido = Number(conta?.seller_id || conta?.ml_user_id || 0) || shopIdResolvido;
    }

    const { data, error } = await supabase
      .from('marketplace_lotes_publicacao')
      .insert({
        loja_id: params.lojaId,
        conta_id: contaIdResolvida,
        usuario_id: params.usuarioId || null,
        provedor: 'shopee',
        plataforma: 'shopee',
        escopo_tipo: params.escopoTipo,
        escopo_descricao: params.escopoDescricao.slice(0, 200),
        categoria_filtro_id: params.categoriaFiltroId || null,
        subcategoria_filtro_id: params.subcategoriaFiltroId || null,
        tipo_exposicao: 'shopee_padrao',
        margem_sobrepreco_percentual: Number(params.margemComissao || 0),
        custo_fixo: Number(params.custoFixo || 0),
        status_lote: 'em_andamento',
        total_itens: params.produtos.length,
        total_processados: 0,
        total_sucesso: 0,
        total_falha: 0,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[shopeePublicacaoMassaService] Erro ao criar cabeçalho do lote:', error.message);
      return { loteId: null, shopId: shopIdResolvido };
    }

    return { loteId: data?.id || null, shopId: shopIdResolvido };
  } catch (err) {
    console.warn('[shopeePublicacaoMassaService] Exceção ao criar lote:', err);
    return { loteId: null, shopId: params.shopId || null };
  }
}

async function persistirItemLoteShopeeEContadores(params: {
  loteId: string | null;
  lojaId: string;
  produto: Produto;
  variacao: VariacaoProduto | null;
  statusItem: 'sucesso' | 'falha';
  mlItemId?: string | null;
  mlCategoryId?: string | null;
  permalink?: string | null;
  precoCalculado?: number | null;
  gtinUtilizado?: string | null;
  gtinOrigem?: 'cadastro' | 'ia_gs1' | 'isento' | null;
  motivoErro?: string | null;
  totalProcessados: number;
  totalSucesso: number;
  totalFalha: number;
}): Promise<void> {
  if (!params.loteId) return;

  try {
    const skuSnapshot =
      (params.variacao?.sku || params.produto.codigo_interno || '').trim().slice(0, 100) || null;

    await supabase.from('marketplace_lotes_publicacao_itens').insert({
      lote_id: params.loteId,
      loja_id: params.lojaId,
      produto_id: params.produto.id,
      variacao_id: params.variacao?.id || null,
      nome_produto_snapshot: (params.produto.nome || 'Produto').slice(0, 255),
      sku_snapshot: skuSnapshot,
      status_item: params.statusItem,
      ml_item_id: params.mlItemId || null,
      ml_category_id: params.mlCategoryId || null,
      permalink: params.permalink || null,
      preco_calculado:
        typeof params.precoCalculado === 'number' && Number.isFinite(params.precoCalculado)
          ? params.precoCalculado
          : null,
      gtin_utilizado: params.gtinUtilizado || null,
      gtin_origem: params.gtinOrigem || null,
      motivo_erro: params.motivoErro || null,
    });

    await supabase
      .from('marketplace_lotes_publicacao')
      .update({
        total_processados: params.totalProcessados,
        total_sucesso: params.totalSucesso,
        total_falha: params.totalFalha,
      })
      .eq('id', params.loteId)
      .eq('loja_id', params.lojaId);
  } catch (err) {
    console.warn('[shopeePublicacaoMassaService] Erro ao persistir item do lote:', err);
  }
}

async function processarFilaShopeeEmSegundoPlano(
  params: ParamsIniciarPublicacaoMassaShopee
): Promise<void> {
  const {
    lojaId,
    produtos,
    categorias,
    margemComissao,
    custoFixo,
    permitirSemEan,
  } = params;

  const mapaCategorias = new Map<string, Categoria>(categorias.map((c) => [c.id, c]));
  const { loteId, shopId } = await criarRegistroLoteShopeeDb(params);

  if (loteId) {
    atualizarEstado({
      loteAtualId: loteId,
      loteSelecionadoRelatorioId: loteId,
    });
  }

  let totalProcessadosDb = 0;
  let totalSucessoDb = 0;
  let totalFalhaDb = 0;

  const registrarFalhaEPersistir = async (args: {
    produto: Produto;
    variacao: VariacaoProduto | null;
    motivo: string;
    tipoLocal: 'pulado' | 'erro';
    mlCategoryId?: string | null;
    precoCalculado?: number | null;
    gtinUtilizado?: string | null;
    gtinOrigem?: 'cadastro' | 'ia_gs1' | 'isento' | null;
  }) => {
    totalProcessadosDb += 1;
    totalFalhaDb += 1;

    atualizarEstado({
      processados: estadoAtual.processados + 1,
      falhas: args.tipoLocal === 'erro' ? estadoAtual.falhas + 1 : estadoAtual.falhas,
      pulados: args.tipoLocal === 'pulado' ? estadoAtual.pulados + 1 : estadoAtual.pulados,
      itensFalha: [
        ...estadoAtual.itensFalha,
        {
          produtoId: args.produto.id,
          nome: args.produto.nome,
          motivo: args.motivo,
          tipo: args.tipoLocal,
        },
      ],
    });

    await persistirItemLoteShopeeEContadores({
      loteId,
      lojaId,
      produto: args.produto,
      variacao: args.variacao,
      statusItem: 'falha',
      mlCategoryId: args.mlCategoryId || null,
      precoCalculado: args.precoCalculado ?? null,
      gtinUtilizado: args.gtinUtilizado || null,
      gtinOrigem: args.gtinOrigem || null,
      motivoErro: args.motivo,
      totalProcessados: totalProcessadosDb,
      totalSucesso: totalSucessoDb,
      totalFalha: totalFalhaDb,
    });
  };

  for (let indice = 0; indice < produtos.length; indice++) {
    if (cancelamentoSolicitado) break;

    const produto = produtos[indice];
    const variacao = selecionarVariacaoElegivel(produto);
    const fotosValidas = Array.isArray(produto.fotos_urls)
      ? produto.fotos_urls.filter((url) => typeof url === 'string' && url.trim().length > 0)
      : [];

    atualizarEstado({
      produtoAtualNome: produto.nome,
      etapaAtual: `Validando dados locais (${indice + 1} de ${produtos.length})...`,
    });

    const precoBase = variacao
      ? variacao.preco_promocional && variacao.preco_promocional > 0
        ? Number(variacao.preco_promocional)
        : Number(variacao.preco_venda_varejo || 0)
      : produto.promocao_ativa && produto.preco_promocional && produto.preco_promocional > 0
      ? Number(produto.preco_promocional)
      : Number(produto.preco_venda_varejo || 0);

    if (fotosValidas.length === 0) {
      await registrarFalhaEPersistir({
        produto,
        variacao,
        motivo: 'Produto sem fotos cadastradas. A Shopee exige pelo menos 1 imagem.',
        tipoLocal: 'pulado',
        precoCalculado: Number.isFinite(precoBase) && precoBase > 0 ? precoBase : null,
      });
      continue;
    }

    if (!Number.isFinite(precoBase) || precoBase <= 0) {
      await registrarFalhaEPersistir({
        produto,
        variacao,
        motivo: 'Preço de venda inválido ou zerado.',
        tipoLocal: 'pulado',
      });
      continue;
    }

    const estoqueDisponivel = variacao
      ? Math.max(0, Number(variacao.quantidade_estoque || 0))
      : Math.max(0, Number(produto.quantidade_estoque || 0));

    if (estoqueDisponivel <= 0) {
      await registrarFalhaEPersistir({
        produto,
        variacao,
        motivo: 'Estoque físico zerado. É necessário saldo maior que 0 para publicar na Shopee.',
        tipoLocal: 'pulado',
        precoCalculado: precoBase,
      });
      continue;
    }

    let executouChamadaExterna = false;
    let categoryIdContexto: string | null = null;
    const breakdown = calcularBreakdownPrecoShopee(precoBase, margemComissao, custoFixo);
    const precoCalculadoContexto: number | null = breakdown.precoFinalShopee;
    let gtinUtilizadoContexto: string | null = null;
    let gtinOrigemContexto: 'cadastro' | 'ia_gs1' | 'isento' | null = null;

    try {
      executouChamadaExterna = true;
      const fichaProduto = construirFichaProdutoShopee(produto, variacao, mapaCategorias);

      // 1. Consulta categoria recomendada e atributos obrigatórios na Shopee
      atualizarEstado({
        etapaAtual: 'Consultando categoria e atributos na Shopee...',
      });

      const resCat = await shopeeService.consultarCategoria({
        lojaId,
        titulo: fichaProduto.nome.slice(0, 120),
      });
      if (cancelamentoSolicitado) break;

      const categoryId = resCat.categoria?.id || '';
      categoryIdContexto = categoryId || null;
      const atributosObrigatorios: MlAtributoObrigatorioCategoria[] =
        resCat.atributos_obrigatorios || [];

      // 2. Pipeline compartilhado Serper + JEV + GS1 para EAN/marca/atributos
      const gtinCadastro = String(variacao?.codigo_barras || produto.codigo_barras || '')
        .replace(/\D/g, '')
        .trim();
      const possuiGtinCadastro = validarGtinGs1(gtinCadastro);

      if (!possuiGtinCadastro) {
        atualizarEstado({
          etapaAtual: 'Buscando EAN oficial (Serper + JEV) e ficha técnica...',
        });
      }

      const [resEanSerperJev, resGemini] = await Promise.all([
        possuiGtinCadastro
          ? Promise.resolve(null)
          : catalogJevService
              .descobrirEAuditarEanComSerperJev({
                nomeProduto: fichaProduto.nome,
                categoriaNome: fichaProduto.categoriaLocal,
                sku: fichaProduto.codigoInterno,
                loja: { id: lojaId },
              })
              .catch(() => null),
        mercadoLivreJevService
          .preencherAtributosTextoLivreViaGemini({
            lojaId,
            categoryId: categoryId || 'shopee',
            fichaProduto,
            gtinAtual: possuiGtinCadastro ? gtinCadastro : undefined,
            atributosPendentes: atributosObrigatorios,
          })
          .catch(() => null),
      ]);

      if (cancelamentoSolicitado) break;

      const marcaFinal = (resGemini?.marca || '').trim() || 'Genérico';
      const modeloFinal =
        (resGemini?.modelo || '').trim() ||
        produto.codigo_interno?.trim().slice(0, 50) ||
        'Padrão';

      const gtinFinal = possuiGtinCadastro
        ? gtinCadastro
        : resEanSerperJev?.ean && validarGtinGs1(resEanSerperJev.ean)
        ? resEanSerperJev.ean
        : resGemini?.gtin && validarGtinGs1(resGemini.gtin)
        ? resGemini.gtin
        : '';

      gtinOrigemContexto = gtinFinal
        ? possuiGtinCadastro
          ? 'cadastro'
          : 'ia_gs1'
        : 'isento';
      gtinUtilizadoContexto = gtinFinal || null;

      if (!gtinFinal && !permitirSemEan) {
        await registrarFalhaEPersistir({
          produto,
          variacao,
          motivo: MOTIVO_SEM_EAN_OFICIAL,
          tipoLocal: 'pulado',
          mlCategoryId: categoryIdContexto,
          precoCalculado: precoCalculadoContexto,
          gtinUtilizado: null,
          gtinOrigem: 'isento',
        });
        if (indice < produtos.length - 1 && !cancelamentoSolicitado) {
          await aguardarComCancelamento(INTERVALO_RATE_LIMIT_MS);
        }
        continue;
      }

      // 3. Espelhamento preventivo das imagens externas para o Supabase Storage
      let fotosProntasShopee = fotosValidas;
      if (fotosValidas.some(ehUrlExternaParaEspelhar)) {
        atualizarEstado({
          etapaAtual: 'Hospedando imagens do produto no servidor...',
        });
        fotosProntasShopee = await espelharListaImagensProduto(fotosValidas, lojaId, produto.id);
        const mudouFoto =
          fotosProntasShopee.length !== fotosValidas.length ||
          fotosProntasShopee.some((u, idx) => u !== fotosValidas[idx]);
        if (mudouFoto) {
          await supabase
            .from('produtos')
            .update({ fotos_urls: fotosProntasShopee })
            .eq('id', produto.id)
            .eq('loja_id', lojaId);
        }
      }

      // 4. Descrição comercial profissional unificada (plain_text 900-2200 chars)
      if (descricaoEhGenericaOuCurta(produto.descricao)) {
        atualizarEstado({
          etapaAtual: 'Gerando descrição comercial profissional via IA...',
        });
      }

      const atributosExtras = atributosObrigatorios
        .map((attr) => {
          const valorIa = resGemini?.atributos?.[attr.id];
          if (valorIa?.value_name?.trim()) {
            return {
              id: attr.id,
              ...(valorIa.value_id ? { value_id: valorIa.value_id } : {}),
              value_name: valorIa.value_name.trim(),
            };
          }
          if (attr.values && attr.values.length > 0) {
            return {
              id: attr.id,
              value_id: attr.values[0].id,
              value_name: attr.values[0].name,
            };
          }
          return null;
        })
        .filter((x): x is { id: string; value_id?: string; value_name: string } => x !== null);

      const resultadoDescricao = await garantirDescricaoProfissionalMarketplace({
        nome: produto.nome,
        marca: marcaFinal,
        modelo: modeloFinal,
        categoriaNome: fichaProduto.categoriaLocal || undefined,
        descricaoAtual: produto.descricao || undefined,
        codigoBarras: gtinFinal || produto.codigo_barras,
        atributosTecnicos: atributosExtras.map((a) => ({
          nome: atributosObrigatorios.find((d) => d.id === a.id)?.name || a.id,
          valor: a.value_name,
        })),
        pesoKg: produto.peso_kg ?? null,
        alturaCm: produto.altura_cm ?? null,
        larguraCm: produto.largura_cm ?? null,
        comprimentoCm: produto.comprimento_cm ?? null,
        loja: { id: lojaId },
        canal: 'shopee',
      });

      const descricaoFinal =
        resultadoDescricao.descricao || produto.descricao || fichaProduto.nome;
      if (resultadoDescricao.foiEnriquecida && resultadoDescricao.descricao) {
        await supabase
          .from('produtos')
          .update({ descricao: resultadoDescricao.descricao })
          .eq('id', produto.id)
          .eq('loja_id', lojaId);
      }

      if (cancelamentoSolicitado) break;

      // 5. Publicar na Shopee
      atualizarEstado({
        etapaAtual: 'Publicando anúncio na Shopee...',
      });

      const res = await shopeeService.criarAnuncio({
        lojaId,
        produtoId: produto.id,
        variacaoId: variacao?.id || null,
        itemName: fichaProduto.nome.slice(0, 120),
        description: descricaoFinal,
        originalPrice: breakdown.precoFinalShopee,
        normalStock: estoqueDisponivel,
        categoryId: categoryId || undefined,
        margemSobrepreco: margemComissao,
        marca: marcaFinal,
        gtin: gtinFinal || null,
        semGtin: !gtinFinal,
        atributosExtras,
        fotosUrls: fotosProntasShopee,
      });

      const gtinParaRetroalimentar = res.gtin_sincronizado || gtinFinal || null;
      if (gtinParaRetroalimentar && validarGtinGs1(gtinParaRetroalimentar)) {
        gtinUtilizadoContexto = gtinParaRetroalimentar;
        await mercadoLivreService
          .sincronizarCodigoBarrasPosPublicacao({
            lojaId,
            produtoId: produto.id,
            variacaoId: variacao?.id || null,
            gtin: gtinParaRetroalimentar,
            codigoBarrasAtualProduto: produto.codigo_barras,
          })
          .catch(() => null);
      }

      const itemIdCriado = String(res.item?.id || '').trim();
      const permalink = obterPermalinkAnuncioShopee(
        res.permalink || res.item?.permalink,
        itemIdCriado,
        shopId
      );

      totalProcessadosDb += 1;
      totalSucessoDb += 1;

      atualizarEstado({
        processados: estadoAtual.processados + 1,
        publicados: estadoAtual.publicados + 1,
        versaoAtualizacao: estadoAtual.versaoAtualizacao + 1,
        itensPublicados: [
          ...estadoAtual.itensPublicados,
          {
            produtoId: produto.id,
            nome: produto.nome,
            mlItemId: itemIdCriado,
            permalink,
            gtinSincronizado: gtinParaRetroalimentar,
          },
        ],
      });

      await persistirItemLoteShopeeEContadores({
        loteId,
        lojaId,
        produto,
        variacao,
        statusItem: 'sucesso',
        mlItemId: itemIdCriado || null,
        mlCategoryId: res.item?.category_id || categoryIdContexto,
        permalink: permalink || null,
        precoCalculado: breakdown.precoFinalShopee,
        gtinUtilizado: gtinUtilizadoContexto,
        gtinOrigem: gtinOrigemContexto,
        motivoErro: null,
        totalProcessados: totalProcessadosDb,
        totalSucesso: totalSucessoDb,
        totalFalha: totalFalhaDb,
      });
    } catch (err: unknown) {
      const msgErro =
        err instanceof Error ? err.message : 'Erro ao publicar produto na Shopee.';
      await registrarFalhaEPersistir({
        produto,
        variacao,
        motivo: msgErro,
        tipoLocal: 'erro',
        mlCategoryId: categoryIdContexto,
        precoCalculado: precoCalculadoContexto,
        gtinUtilizado: gtinUtilizadoContexto,
        gtinOrigem: gtinOrigemContexto,
      });
    }

    if (executouChamadaExterna && indice < produtos.length - 1 && !cancelamentoSolicitado) {
      atualizarEstado({
        etapaAtual: 'Aguardando intervalo de segurança entre requisições...',
      });
      await aguardarComCancelamento(INTERVALO_RATE_LIMIT_MS);
    }
  }

  const statusFinalLote: 'concluido' | 'cancelado' = cancelamentoSolicitado
    ? 'cancelado'
    : 'concluido';

  if (loteId) {
    await supabase
      .from('marketplace_lotes_publicacao')
      .update({
        status_lote: statusFinalLote,
        total_processados: totalProcessadosDb,
        total_sucesso: totalSucessoDb,
        total_falha: totalFalhaDb,
        concluido_em: new Date().toISOString(),
      })
      .eq('id', loteId)
      .eq('loja_id', lojaId);
  }

  atualizarEstado({
    status: statusFinalLote,
    produtoAtualNome: '',
    etapaAtual: '',
    versaoAtualizacao: estadoAtual.versaoAtualizacao + 1,
  });
}

export const shopeePublicacaoMassaService = {
  getEstado(): EstadoPublicacaoMassaShopee {
    return estadoAtual;
  },

  inscrever(listener: () => void): () => void {
    ouvintes.add(listener);
    return () => {
      ouvintes.delete(listener);
    };
  },

  abrirModal(categoriaInicialId?: string | null): void {
    if (
      estadoAtual.status === 'executando' ||
      estadoAtual.status === 'concluido' ||
      estadoAtual.status === 'cancelado'
    ) {
      atualizarEstado({
        modalAberto: true,
        minimizado: false,
      });
      return;
    }

    atualizarEstado({
      ...ESTADO_INICIAL,
      versaoAtualizacao: estadoAtual.versaoAtualizacao,
      modalAberto: true,
      minimizado: false,
      abaAtiva: 'nova',
      categoriaInicialId: categoriaInicialId || null,
    });
  },

  abrirRelatorios(loteId?: string | null): void {
    atualizarEstado({
      modalAberto: true,
      minimizado: false,
      abaAtiva: 'relatorios',
      loteSelecionadoRelatorioId:
        loteId !== undefined
          ? loteId
          : estadoAtual.loteSelecionadoRelatorioId || estadoAtual.loteAtualId || null,
    });
  },

  definirAba(aba: 'nova' | 'relatorios'): void {
    atualizarEstado({ abaAtiva: aba });
  },

  selecionarLoteRelatorio(loteId: string | null): void {
    atualizarEstado({ loteSelecionadoRelatorioId: loteId });
  },

  notificarAtualizacaoExterna(): void {
    atualizarEstado({ versaoAtualizacao: estadoAtual.versaoAtualizacao + 1 });
  },

  fecharModal(): void {
    if (estadoAtual.status === 'executando') {
      atualizarEstado({ modalAberto: false, minimizado: true });
      return;
    }
    atualizarEstado({
      ...ESTADO_INICIAL,
      versaoAtualizacao: estadoAtual.versaoAtualizacao,
      modalAberto: false,
      minimizado: false,
    });
  },

  minimizar(): void {
    atualizarEstado({ modalAberto: false, minimizado: true });
  },

  restaurar(): void {
    atualizarEstado({ modalAberto: true, minimizado: false });
  },

  cancelarExecucao(): void {
    if (estadoAtual.status === 'executando') {
      cancelamentoSolicitado = true;
      atualizarEstado({ etapaAtual: 'Interrompendo após concluir o item atual...' });
    }
  },

  resetarParaNovaConfiguracao(): void {
    if (estadoAtual.status === 'executando') return;
    atualizarEstado({
      ...ESTADO_INICIAL,
      versaoAtualizacao: estadoAtual.versaoAtualizacao,
      modalAberto: true,
      minimizado: false,
      abaAtiva: 'nova',
    });
  },

  iniciarLote(params: ParamsIniciarPublicacaoMassaShopee): void {
    if (estadoAtual.status === 'executando') return;
    if (!params.lojaId || params.produtos.length === 0) return;

    cancelamentoSolicitado = false;
    atualizarEstado({
      lojaId: params.lojaId,
      status: 'executando',
      modalAberto: true,
      minimizado: false,
      abaAtiva: 'nova',
      loteAtualId: null,
      total: params.produtos.length,
      processados: 0,
      publicados: 0,
      falhas: 0,
      pulados: 0,
      produtoAtualNome: params.produtos[0]?.nome || '',
      etapaAtual: 'Preparando fila de publicação Shopee...',
      itensPublicados: [],
      itensFalha: [],
    });

    void processarFilaShopeeEmSegundoPlano(params);
  },

  async listarLotes(lojaId: string, limite = 30): Promise<MarketplaceLotePublicacao[]> {
    if (!lojaId) return [];
    const { data, error } = await supabase
      .from('marketplace_lotes_publicacao')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('plataforma', 'shopee')
      .order('iniciado_em', { ascending: false })
      .limit(limite);

    if (error) {
      throw new Error('Não foi possível carregar o histórico de lotes Shopee.');
    }

    return (data || []) as MarketplaceLotePublicacao[];
  },

  async listarItensLote(lojaId: string, loteId: string): Promise<MarketplaceLotePublicacaoItem[]> {
    if (!lojaId || !loteId) return [];
    const { data, error } = await supabase
      .from('marketplace_lotes_publicacao_itens')
      .select('*')
      .eq('lote_id', loteId)
      .eq('loja_id', lojaId)
      .order('processado_em', { ascending: true });

    if (error) {
      throw new Error('Não foi possível carregar os itens do lote Shopee.');
    }

    return (data || []) as MarketplaceLotePublicacaoItem[];
  },

  async marcarItemCorrigidoComSucesso(params: {
    lojaId: string;
    loteId: string;
    itemId: string;
    mlItemId?: string | null;
    mlCategoryId?: string | null;
    permalink?: string | null;
    precoCalculado?: number | null;
    gtinUtilizado?: string | null;
    gtinOrigem?: 'cadastro' | 'ia_gs1' | 'isento' | null;
  }): Promise<void> {
    if (!params.lojaId || !params.loteId || !params.itemId) return;

    const { error: erroItem } = await supabase
      .from('marketplace_lotes_publicacao_itens')
      .update({
        status_item: 'sucesso',
        motivo_erro: null,
        ml_item_id: params.mlItemId || null,
        ml_category_id: params.mlCategoryId || null,
        permalink: params.permalink || null,
        ...(typeof params.precoCalculado === 'number' && Number.isFinite(params.precoCalculado)
          ? { preco_calculado: params.precoCalculado }
          : {}),
        gtin_utilizado: params.gtinUtilizado || null,
        gtin_origem: params.gtinOrigem || (params.gtinUtilizado ? 'cadastro' : 'isento'),
        processado_em: new Date().toISOString(),
      })
      .eq('id', params.itemId)
      .eq('lote_id', params.loteId)
      .eq('loja_id', params.lojaId);

    if (erroItem) {
      throw new Error('Não foi possível atualizar o status do item corrigido no relatório.');
    }

    const itensAtualizados = await this.listarItensLote(params.lojaId, params.loteId);
    const totalSucesso = itensAtualizados.filter((i) => i.status_item === 'sucesso').length;
    const totalFalha = itensAtualizados.filter((i) => i.status_item === 'falha').length;

    await supabase
      .from('marketplace_lotes_publicacao')
      .update({
        total_sucesso: totalSucesso,
        total_falha: totalFalha,
        total_processados: itensAtualizados.length,
      })
      .eq('id', params.loteId)
      .eq('loja_id', lojaIdForUpdate(params.lojaId));

    atualizarEstado({ versaoAtualizacao: estadoAtual.versaoAtualizacao + 1 });
  },

  exportarRelatorioLoteXlsx(
    lote: MarketplaceLotePublicacao,
    itens: MarketplaceLotePublicacaoItem[],
    nomeLoja?: string
  ): void {
    const labelOrigemGtin = (origem: string | null): string => {
      if (origem === 'cadastro') return 'Cadastro Rubi';
      if (origem === 'ia_gs1') return 'IA (GS1)';
      if (origem === 'isento') return 'Sem EAN';
      return '-';
    };

    const linhasItens = itens.map((item, idx) => ({
      '#': idx + 1,
      Produto: item.nome_produto_snapshot,
      SKU: item.sku_snapshot || '-',
      Status: item.status_item === 'sucesso' ? 'Publicado' : 'Falha / Pendência',
      'Código Shopee': item.ml_item_id || '-',
      'Categoria Shopee': item.ml_category_id || '-',
      'Preço Shopee (R$)':
        typeof item.preco_calculado === 'number' ? Number(item.preco_calculado.toFixed(2)) : '-',
      'EAN / GTIN': item.gtin_utilizado || '-',
      'Origem EAN': labelOrigemGtin(item.gtin_origem),
      'Link Anúncio': item.permalink || '-',
      'Motivo da Pendência': item.motivo_erro || '-',
      'Processado em': item.processado_em ? formatarDataHoraLocal(item.processado_em) : '-',
    }));

    const linhasResumo = [
      {
        Loja: nomeLoja || 'Rubi',
        'ID do Lote': lote.id,
        Escopo: lote.escopo_descricao,
        Plataforma: 'Shopee',
        'Margem (%)': Number(lote.margem_sobrepreco_percentual || 0),
        'Custo Fixo (R$)': Number(lote.custo_fixo || 0),
        Status:
          lote.status_lote === 'concluido'
            ? 'Concluído'
            : lote.status_lote === 'cancelado'
            ? 'Cancelado'
            : 'Em andamento',
        'Total no Lote': lote.total_itens,
        Publicados: lote.total_sucesso,
        'Com Pendência': lote.total_falha,
        'Iniciado em': formatarDataHoraLocal(lote.iniciado_em),
        'Concluído em': lote.concluido_em ? formatarDataHoraLocal(lote.concluido_em) : '-',
      },
    ];

    const wb = XLSX.utils.book_new();
    const wsItens = XLSX.utils.json_to_sheet(
      linhasItens.length > 0 ? linhasItens : [{ Mensagem: 'Nenhum item registrado neste lote.' }]
    );
    wsItens['!cols'] = [
      { wch: 5 },
      { wch: 42 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 48 },
      { wch: 52 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, wsItens, 'Itens_do_Lote');

    const wsResumo = XLSX.utils.json_to_sheet(linhasResumo);
    wsResumo['!cols'] = [
      { wch: 24 },
      { wch: 38 },
      { wch: 30 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 16 },
      { wch: 20 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo_do_Lote');

    const safeNomeLoja = (nomeLoja || 'Rubi')
      .replace(/[^a-zA-Z0-9À-ÿ_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const dataStr = obterDataLocalYYYYMMDD();
    XLSX.writeFile(wb, `${safeNomeLoja}_Relatorio_Shopee_${dataStr}.xlsx`);
  },
};

function lojaIdForUpdate(lojaId: string): string {
  return lojaId;
}
