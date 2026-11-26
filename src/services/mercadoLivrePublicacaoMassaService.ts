import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { Categoria, Produto, VariacaoProduto } from '../types';
import { formatarDataHoraLocal, obterDataLocalYYYYMMDD } from '../utils/dateTime';
import {
  converterGdmParaPayloadApiMl,
  converterProdutoHubiParaGdmMl,
  formatarTituloMercadoLivre,
  obterPermalinkAnuncioMl,
  traduzirErroMercadoLivre,
  validarGtinGs1,
} from '../utils/gdmMercadoLivreMapper';
import {
  FichaProdutoMlHubi,
  mercadoLivreJevService,
  ValorAtributoPreenchidoMl,
} from './mercadoLivreJevService';
import {
  mercadoLivreService,
  MlAtributoObrigatorioCategoria,
} from './mercadoLivreService';
import { catalogJevService } from './catalogJevService';
import { ehUrlExternaParaEspelhar, espelharListaImagensProduto } from './imagemStorageService';
import {
  descricaoEhGenericaOuCurta,
  garantirDescricaoProfissionalMarketplace,
} from './descricaoComercialService';

export interface MarketplaceLotePublicacao {
  id: string;
  loja_id: string;
  conta_id: string | null;
  usuario_id: string | null;
  provedor: string;
  escopo_tipo: 'todos' | 'categoria' | string;
  escopo_descricao: string;
  categoria_filtro_id: string | null;
  subcategoria_filtro_id: string | null;
  tipo_exposicao: 'gold_special' | 'gold_pro' | string;
  margem_sobrepreco_percentual: number;
  custo_fixo: number;
  status_lote: 'em_andamento' | 'concluido' | 'cancelado' | string;
  total_itens: number;
  total_processados: number;
  total_sucesso: number;
  total_falha: number;
  iniciado_em: string;
  concluido_em: string | null;
}

export interface MarketplaceLotePublicacaoItem {
  id: string;
  lote_id: string;
  loja_id: string;
  produto_id: string;
  variacao_id: string | null;
  nome_produto_snapshot: string;
  sku_snapshot: string | null;
  status_item: 'sucesso' | 'falha' | string;
  ml_item_id: string | null;
  ml_category_id: string | null;
  permalink: string | null;
  preco_calculado: number | null;
  gtin_utilizado: string | null;
  gtin_origem: 'cadastro' | 'ia_gs1' | 'isento' | string | null;
  motivo_erro: string | null;
  processado_em: string;
}

export interface ItemPublicadoMassaMl {
  produtoId: string;
  nome: string;
  mlItemId: string;
  permalink: string;
  gtinSincronizado?: string | null;
}

export interface ItemFalhaMassaMl {
  produtoId: string;
  nome: string;
  motivo: string;
  tipo: 'erro' | 'pulado';
}

export interface EstadoPublicacaoMassaMl {
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
  itensPublicados: ItemPublicadoMassaMl[];
  itensFalha: ItemFalhaMassaMl[];
  versaoAtualizacao: number;
}

export interface ParamsIniciarPublicacaoMassaMl {
  lojaId: string;
  contaId?: string | null;
  usuarioId?: string | null;
  escopoTipo: 'todos' | 'categoria';
  escopoDescricao: string;
  categoriaFiltroId?: string | null;
  subcategoriaFiltroId?: string | null;
  produtos: Produto[];
  categorias: Categoria[];
  tipoAnuncio: 'gold_special' | 'gold_pro';
  margemComissao: number;
  custoFixoAbaixo79: number;
  permitirSemEanQuandoCategoriaAceitar: boolean;
}

const INTERVALO_RATE_LIMIT_MS = 1200;
const MOTIVO_SEM_EAN_OFICIAL =
  'Sem código de barras (EAN/GTIN) cadastrado e IA não localizou EAN oficial válido.';

function ehErroRejeicaoEanObrigatorio(mensagem: string): boolean {
  return /(gtin|ean|c[oó]digo universal|empty_gtin_reason|product_identifier)/i.test(mensagem || '');
}

const ESTADO_INICIAL: EstadoPublicacaoMassaMl = {
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

let estadoAtual: EstadoPublicacaoMassaMl = { ...ESTADO_INICIAL };
let cancelamentoSolicitado = false;
const ouvintes = new Set<() => void>();

function notificarOuvintes(): void {
  ouvintes.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.warn('[mercadoLivrePublicacaoMassaService] Erro em listener:', err);
    }
  });
}

function atualizarEstado(parcial: Partial<EstadoPublicacaoMassaMl>): void {
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
    await new Promise((resolve) => setTimeout(resolve, Math.min(passoMs, duracaoMs - decorrido)));
    decorrido += passoMs;
  }
}

function construirFichaProdutoLote(
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

function montarAtributosExtrasLote(
  atributosObrigatorios: MlAtributoObrigatorioCategoria[],
  valores: Record<string, ValorAtributoPreenchidoMl>
): Array<{ id: string; value_id?: string; value_name: string }> {
  return atributosObrigatorios
    .filter((attr) => attr.id !== 'BRAND' && attr.id !== 'MODEL' && attr.id !== 'ITEM_CONDITION' && attr.id !== 'GTIN')
    .map((attr) => {
      const entrada = valores[attr.id];
      if (!entrada) return null;
      let valorLimpo = (entrada.value_name || '').trim();
      if (!valorLimpo && !entrada.value_id) return null;

      if (
        attr.value_type === 'number_unit' &&
        attr.default_unit &&
        valorLimpo &&
        !valorLimpo.includes(attr.default_unit) &&
        !/[a-zA-Z"°%]/.test(valorLimpo)
      ) {
        valorLimpo = `${valorLimpo} ${attr.default_unit}`;
      }

      return {
        id: attr.id,
        ...(entrada.value_id ? { value_id: entrada.value_id } : {}),
        value_name: valorLimpo,
      };
    })
    .filter((item): item is { id: string; value_id?: string; value_name: string } => item !== null);
}

function selecionarVariacaoElegivel(produto: Produto): VariacaoProduto | null {
  if (!produto.tem_variacoes || !Array.isArray(produto.variacoes) || produto.variacoes.length === 0) {
    return null;
  }
  const variacaoComEstoque = produto.variacoes.find((v) => Number(v.quantidade_estoque || 0) > 0);
  return variacaoComEstoque || produto.variacoes[0] || null;
}

async function criarRegistroLoteDb(params: ParamsIniciarPublicacaoMassaMl): Promise<string | null> {
  try {
    let contaIdResolvida = params.contaId || null;
    if (!contaIdResolvida) {
      const conta = await mercadoLivreService.obterConta(params.lojaId);
      contaIdResolvida = conta?.id || null;
    }

    const { data, error } = await supabase
      .from('marketplace_lotes_publicacao')
      .insert({
        loja_id: params.lojaId,
        conta_id: contaIdResolvida,
        usuario_id: params.usuarioId || null,
        provedor: 'mercadolivre',
        plataforma: 'mercadolivre',
        escopo_tipo: params.escopoTipo,
        escopo_descricao: params.escopoDescricao.slice(0, 200),
        categoria_filtro_id: params.categoriaFiltroId || null,
        subcategoria_filtro_id: params.subcategoriaFiltroId || null,
        tipo_exposicao: params.tipoAnuncio,
        margem_sobrepreco_percentual: Number(params.margemComissao || 0),
        custo_fixo: Number(params.custoFixoAbaixo79 || 0),
        status_lote: 'em_andamento',
        total_itens: params.produtos.length,
        total_processados: 0,
        total_sucesso: 0,
        total_falha: 0,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[mercadoLivrePublicacaoMassaService] Erro ao criar cabeçalho do lote:', error.message);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.warn('[mercadoLivrePublicacaoMassaService] Exceção ao criar cabeçalho do lote:', err);
    return null;
  }
}

async function persistirItemLoteEContadores(params: {
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
    const skuSnapshot = (params.variacao?.sku || params.produto.codigo_interno || '').trim().slice(0, 100) || null;
    const { error: erroItem } = await supabase
      .from('marketplace_lotes_publicacao_itens')
      .insert({
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

    if (erroItem) {
      console.warn('[mercadoLivrePublicacaoMassaService] Erro ao gravar item do lote:', erroItem.message);
    }

    const { error: erroLote } = await supabase
      .from('marketplace_lotes_publicacao')
      .update({
        total_processados: params.totalProcessados,
        total_sucesso: params.totalSucesso,
        total_falha: params.totalFalha,
      })
      .eq('id', params.loteId)
      .eq('loja_id', params.lojaId);

    if (erroLote) {
      console.warn('[mercadoLivrePublicacaoMassaService] Erro ao atualizar contadores do lote:', erroLote.message);
    }
  } catch (err) {
    console.warn('[mercadoLivrePublicacaoMassaService] Exceção ao persistir item do lote:', err);
  }
}

async function processarFilaEmSegundoPlano(params: ParamsIniciarPublicacaoMassaMl): Promise<void> {
  const {
    lojaId,
    produtos,
    categorias,
    tipoAnuncio,
    margemComissao,
    custoFixoAbaixo79,
    permitirSemEanQuandoCategoriaAceitar,
  } = params;

  const mapaCategorias = new Map<string, Categoria>(categorias.map((c) => [c.id, c]));
  const loteId = await criarRegistroLoteDb(params);

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

    await persistirItemLoteEContadores({
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
    if (cancelamentoSolicitado) {
      break;
    }

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

    // Validação local rápida: fotos, preço e estoque antes de consumir IA/API ML
    if (fotosValidas.length === 0) {
      await registrarFalhaEPersistir({
        produto,
        variacao,
        motivo: 'Produto sem fotos cadastradas. O Mercado Livre exige pelo menos 1 imagem.',
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
        motivo: 'Estoque físico zerado. É necessário saldo maior que 0 para publicar no Mercado Livre.',
        tipoLocal: 'pulado',
        precoCalculado: precoBase,
      });
      continue;
    }

    let executouChamadaExterna = false;
    let semGtin = false;
    let categoryIdContexto: string | null = null;
    let precoCalculadoContexto: number | null = precoBase;
    let gtinUtilizadoContexto: string | null = null;
    let gtinOrigemContexto: 'cadastro' | 'ia_gs1' | 'isento' | null = null;

    try {
      executouChamadaExterna = true;
      const fichaProduto = construirFichaProdutoLote(produto, variacao, mapaCategorias);
      const tituloConsulta = formatarTituloMercadoLivre(fichaProduto.nome);

      // Etapa 1: Identificar categoria no ML e atributos obrigatórios
      atualizarEstado({
        etapaAtual: 'Identificando categoria e ficha técnica via IA...',
      });

      const resultadoCat = await mercadoLivreJevService.descobrirECarregarCategoriaMl({
        lojaId,
        tituloConsulta,
        fichaProduto,
      });

      if (cancelamentoSolicitado) break;

      const categoryId = resultadoCat.categoria?.id || '';
      if (!categoryId) {
        throw new Error('Não foi possível identificar automaticamente uma categoria do Mercado Livre para este produto.');
      }
      categoryIdContexto = categoryId;

      const atributosObrigatorios = resultadoCat.atributos_obrigatorios || [];

      const resultadoJev = await mercadoLivreJevService.preencherAtributosCalibradosComJev({
        categoryId,
        atributosObrigatorios,
        fichaProduto,
      });

      if (cancelamentoSolicitado) break;

      let marcaFinal = (resultadoJev.marca || '').trim();
      let modeloFinal = (resultadoJev.modelo || '').trim();
      let valoresAtributos: Record<string, ValorAtributoPreenchidoMl> = {
        ...resultadoJev.atributosPreenchidos,
      };

      const gtinCadastroDigitos = String(variacao?.codigo_barras || produto.codigo_barras || '')
        .replace(/\D/g, '')
        .trim();
      const possuiGtinValidoCadastro = validarGtinGs1(gtinCadastroDigitos);

      const atributosPendentes = atributosObrigatorios.filter((attr) => {
        if (attr.id === 'BRAND' || attr.id === 'MODEL' || attr.id === 'ITEM_CONDITION' || attr.id === 'GTIN') {
          return false;
        }
        return !valoresAtributos[attr.id]?.value_name?.trim();
      });

      const precisaGemini =
        !marcaFinal ||
        !modeloFinal ||
        !possuiGtinValidoCadastro ||
        atributosPendentes.length > 0;

      if (!possuiGtinValidoCadastro) {
        atualizarEstado({
          etapaAtual: 'Buscando EAN oficial (Serper + JEV) e ficha técnica...',
        });
      }

      const promessaEanSerperJev = !possuiGtinValidoCadastro
        ? catalogJevService
            .descobrirEAuditarEanComSerperJev({
              nomeProduto: fichaProduto.nome,
              marca: marcaFinal || undefined,
              modelo: modeloFinal || undefined,
              sku: fichaProduto.codigoInterno,
              categoriaNome: fichaProduto.categoriaLocal,
              loja: { id: lojaId },
            })
            .catch(() => null)
        : Promise.resolve(null);

      const promessaGemini = precisaGemini
        ? mercadoLivreJevService.preencherAtributosTextoLivreViaGemini({
            lojaId,
            categoryId,
            fichaProduto,
            marcaAtual: marcaFinal || undefined,
            modeloAtual: modeloFinal || undefined,
            gtinAtual: possuiGtinValidoCadastro ? gtinCadastroDigitos : undefined,
            atributosPendentes,
          })
        : Promise.resolve(null);

      const [resEanSerperJev, resGemini] = await Promise.all([
        promessaEanSerperJev,
        promessaGemini,
      ]);

      let gtinSerperJev: string | undefined;
      if (resEanSerperJev?.ean && validarGtinGs1(resEanSerperJev.ean)) {
        gtinSerperJev = resEanSerperJev.ean;
      }

      let gtinSugeridoIa: string | undefined;

      if (resGemini) {
        if (!marcaFinal && resGemini.marca) {
          marcaFinal = resGemini.marca.trim();
        }
        if (!modeloFinal && resGemini.modelo) {
          modeloFinal = resGemini.modelo.trim();
        }
        if (resGemini.gtin && validarGtinGs1(resGemini.gtin)) {
          gtinSugeridoIa = resGemini.gtin;
        }
        if (resGemini.atributos && Object.keys(resGemini.atributos).length > 0) {
          valoresAtributos = {
            ...valoresAtributos,
            ...resGemini.atributos,
          };
        }
      }

      if (!marcaFinal) marcaFinal = 'Genérico';
      if (!modeloFinal) {
        modeloFinal = produto.codigo_interno?.trim().slice(0, 50) || 'Padrão';
      }

      if (cancelamentoSolicitado) break;

      // Etapa 2: Validar EAN/GTIN com dígito verificador GS1 (cadastro Rubi -> Serper + JEV -> Gemini -> fallback)
      const gtinFinal = possuiGtinValidoCadastro
        ? gtinCadastroDigitos
        : gtinSerperJev && validarGtinGs1(gtinSerperJev)
        ? gtinSerperJev
        : gtinSugeridoIa && validarGtinGs1(gtinSugeridoIa)
        ? gtinSugeridoIa
        : '';

      gtinOrigemContexto = gtinFinal
        ? possuiGtinValidoCadastro
          ? 'cadastro'
          : 'ia_gs1'
        : 'isento';
      gtinUtilizadoContexto = gtinFinal || null;

      if (!gtinFinal && !permitirSemEanQuandoCategoriaAceitar) {
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

      semGtin = !gtinFinal;

      // Etapa 2.5: Espelhamento preventivo de imagens externas para o Supabase Storage próprio
      let fotosProntasLote = fotosValidas;
      if (fotosValidas.some(ehUrlExternaParaEspelhar)) {
        atualizarEstado({
          etapaAtual: 'Hospedando imagens do produto no servidor...',
        });
        fotosProntasLote = await espelharListaImagensProduto(fotosValidas, lojaId, produto.id);
        const houveAlteracaoFoto =
          fotosProntasLote.length !== fotosValidas.length ||
          fotosProntasLote.some((u, idx) => u !== fotosValidas[idx]);
        if (houveAlteracaoFoto) {
          await supabase
            .from('produtos')
            .update({ fotos_urls: fotosProntasLote })
            .eq('id', produto.id)
            .eq('loja_id', lojaId)
            .then(({ error: erroFoto }) => {
              if (erroFoto) {
                console.warn(
                  '[mercadoLivrePublicacaoMassaService] Aviso ao retroalimentar fotos espelhadas:',
                  erroFoto.message
                );
              }
            });
        }
      }

      if (cancelamentoSolicitado) break;

      // Etapa 2.6: Garante descrição comercial profissional (plain_text 900-2200 chars) antes de publicar no ML
      const atributosExtras = montarAtributosExtrasLote(atributosObrigatorios, valoresAtributos);

      if (descricaoEhGenericaOuCurta(produto.descricao)) {
        atualizarEstado({
          etapaAtual: 'Gerando descrição comercial profissional via IA...',
        });
      }

      const atributosTecnicosDescricao = atributosExtras
        .map((attr) => {
          const def = atributosObrigatorios.find((a) => a.id === attr.id);
          return {
            nome: def?.name || attr.id,
            valor: attr.value_name || '',
          };
        })
        .filter((item) => Boolean(item.valor));

      const resultadoDescricao = await garantirDescricaoProfissionalMarketplace({
        nome: produto.nome,
        marca: marcaFinal,
        modelo: modeloFinal,
        categoriaNome: fichaProduto.categoriaLocal || undefined,
        descricaoAtual: produto.descricao || undefined,
        codigoBarras: !semGtin ? gtinFinal : produto.codigo_barras,
        atributosTecnicos: atributosTecnicosDescricao,
        pesoKg: produto.peso_kg ?? null,
        alturaCm: produto.altura_cm ?? null,
        larguraCm: produto.largura_cm ?? null,
        comprimentoCm: produto.comprimento_cm ?? null,
        loja: { id: lojaId },
        canal: 'mercado_livre',
      });

      if (cancelamentoSolicitado) break;

      const descricaoMlFinal = resultadoDescricao.descricao || produto.descricao || undefined;
      if (resultadoDescricao.foiEnriquecida && descricaoMlFinal) {
        await supabase
          .from('produtos')
          .update({ descricao: descricaoMlFinal })
          .eq('id', produto.id)
          .eq('loja_id', lojaId)
          .then(({ error: erroDesc }) => {
            if (erroDesc) {
              console.warn(
                '[mercadoLivrePublicacaoMassaService] Aviso ao retroalimentar descrição profissional:',
                erroDesc.message
              );
            }
          });
      }

      // Etapa 3: Montar GDM e invocar Edge Function ml-estoque-sync (create_listing)
      atualizarEstado({
        etapaAtual: 'Publicando anúncio no Mercado Livre...',
      });

      const produtoComFotosEspelhadas: Produto = {
        ...produto,
        fotos_urls: fotosProntasLote,
      };

      const gdmCanonico = converterProdutoHubiParaGdmMl(produtoComFotosEspelhadas, variacao, {
        categoriaMlId: categoryId,
        tipoAnuncio,
        margemSobreprecoPercentual: margemComissao,
        taxaFixaMl: custoFixoAbaixo79,
        marca: marcaFinal,
        modelo: modeloFinal,
        gtin: semGtin ? null : gtinFinal,
        semGtin,
        atributosExtras,
      });

      precoCalculadoContexto = gdmCanonico.preco_final_ml;

      const payloadMl = converterGdmParaPayloadApiMl(gdmCanonico, descricaoMlFinal);

      const res = await mercadoLivreService.criarAnuncio({
        lojaId,
        produtoId: produto.id,
        variacaoId: variacao?.id || null,
        payloadMl,
        margemSobrepreco: margemComissao,
        marca: marcaFinal,
        modelo: modeloFinal,
        gtin: semGtin ? null : gtinFinal,
        semGtin,
        categoryId,
        atributosExtras,
      });

      // Retroalimenta o EAN oficial descoberto pela IA no cadastro interno do Rubi
      const gtinParaRetroalimentar =
        res.gtin_sincronizado || (!semGtin ? gtinFinal : null);
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
          .catch((errSync) => {
            console.warn(
              '[mercadoLivrePublicacaoMassaService] Aviso ao sincronizar codigo_barras pós-publicação:',
              errSync
            );
          });
      }

      const mlItemId = String(res.item?.id || '').trim();
      const permalink = obterPermalinkAnuncioMl(res.permalink || res.item?.permalink, mlItemId);
      const precoFinalPublicado =
        typeof res.item?.price === 'number' && Number.isFinite(res.item.price)
          ? res.item.price
          : precoCalculadoContexto;

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
            mlItemId,
            permalink,
            gtinSincronizado: gtinParaRetroalimentar,
          },
        ],
      });

      await persistirItemLoteEContadores({
        loteId,
        lojaId,
        produto,
        variacao,
        statusItem: 'sucesso',
        mlItemId: mlItemId || null,
        mlCategoryId: res.item?.category_id || categoryIdContexto,
        permalink: permalink || null,
        precoCalculado: precoFinalPublicado,
        gtinUtilizado: gtinUtilizadoContexto,
        gtinOrigem: gtinOrigemContexto,
        motivoErro: null,
        totalProcessados: totalProcessadosDb,
        totalSucesso: totalSucessoDb,
        totalFalha: totalFalhaDb,
      });
    } catch (err: unknown) {
      const mensagemBruta = err instanceof Error ? err.message : String(err || 'Erro ao publicar no Mercado Livre.');
      const traduzido = traduzirErroMercadoLivre(mensagemBruta);

      const rejeicaoPorEan =
        semGtin &&
        (ehErroRejeicaoEanObrigatorio(mensagemBruta) ||
          ehErroRejeicaoEanObrigatorio(traduzido.mensagemAmigavel));

      const motivoFinal = rejeicaoPorEan
        ? MOTIVO_SEM_EAN_OFICIAL
        : traduzido.detalheTecnico
        ? `${traduzido.mensagemAmigavel} (${traduzido.detalheTecnico})`
        : traduzido.mensagemAmigavel;

      await registrarFalhaEPersistir({
        produto,
        variacao,
        motivo: motivoFinal,
        tipoLocal: rejeicaoPorEan ? 'pulado' : 'erro',
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

  const statusFinalLote: 'concluido' | 'cancelado' = cancelamentoSolicitado ? 'cancelado' : 'concluido';

  if (loteId) {
    try {
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
    } catch (errFinal) {
      console.warn('[mercadoLivrePublicacaoMassaService] Erro ao encerrar lote no banco:', errFinal);
    }
  }

  atualizarEstado({
    status: statusFinalLote,
    produtoAtualNome: '',
    etapaAtual: '',
    versaoAtualizacao: estadoAtual.versaoAtualizacao + 1,
  });
}

export const mercadoLivrePublicacaoMassaService = {
  getEstado(): EstadoPublicacaoMassaMl {
    return estadoAtual;
  },

  inscrever(listener: () => void): () => void {
    ouvintes.add(listener);
    return () => {
      ouvintes.delete(listener);
    };
  },

  abrirModal(categoriaInicialId?: string | null): void {
    if (estadoAtual.status === 'executando' || estadoAtual.status === 'concluido' || estadoAtual.status === 'cancelado') {
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
      loteSelecionadoRelatorioId: loteId !== undefined ? loteId : estadoAtual.loteSelecionadoRelatorioId || estadoAtual.loteAtualId || null,
    });
  },

  definirAba(aba: 'nova' | 'relatorios'): void {
    atualizarEstado({
      abaAtiva: aba,
    });
  },

  selecionarLoteRelatorio(loteId: string | null): void {
    atualizarEstado({
      loteSelecionadoRelatorioId: loteId,
    });
  },

  notificarAtualizacaoExterna(): void {
    atualizarEstado({
      versaoAtualizacao: estadoAtual.versaoAtualizacao + 1,
    });
  },

  fecharModal(): void {
    if (estadoAtual.status === 'executando') {
      atualizarEstado({
        modalAberto: false,
        minimizado: true,
      });
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
    atualizarEstado({
      modalAberto: false,
      minimizado: true,
    });
  },

  restaurar(): void {
    atualizarEstado({
      modalAberto: true,
      minimizado: false,
    });
  },

  cancelarExecucao(): void {
    if (estadoAtual.status === 'executando') {
      cancelamentoSolicitado = true;
      atualizarEstado({
        etapaAtual: 'Interrompendo após concluir o item atual...',
      });
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

  iniciarLote(params: ParamsIniciarPublicacaoMassaMl): void {
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
      etapaAtual: 'Preparando fila de publicação...',
      itensPublicados: [],
      itensFalha: [],
    });

    void processarFilaEmSegundoPlano(params);
  },

  async listarLotes(lojaId: string, limite = 30): Promise<MarketplaceLotePublicacao[]> {
    if (!lojaId) return [];
    const { data, error } = await supabase
      .from('marketplace_lotes_publicacao')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('plataforma', 'mercadolivre')
      .order('iniciado_em', { ascending: false })
      .limit(limite);

    if (error) {
      throw new Error('Não foi possível carregar o histórico de lotes de publicação.');
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
      throw new Error('Não foi possível carregar os itens do lote selecionado.');
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
      .eq('loja_id', params.lojaId);

    atualizarEstado({
      versaoAtualizacao: estadoAtual.versaoAtualizacao + 1,
    });
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
      'Código ML': item.ml_item_id || '-',
      'Categoria ML': item.ml_category_id || '-',
      'Preço ML (R$)':
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
        Exposição: lote.tipo_exposicao === 'gold_pro' ? 'Premium' : 'Clássico',
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
      { wch: 14 },
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
    XLSX.writeFile(wb, `${safeNomeLoja}_Relatorio_ML_${dataStr}.xlsx`);
  },
};
