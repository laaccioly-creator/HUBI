import { Categoria, Produto, VariacaoProduto } from '../types';
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
  produtos: Produto[];
  categorias: Categoria[];
  tipoAnuncio: 'gold_special' | 'gold_pro';
  margemComissao: number;
  custoFixoAbaixo79: number;
  permitirSemEanQuandoCategoriaAceitar: boolean;
}

const INTERVALO_RATE_LIMIT_MS = 1200;

const ESTADO_INICIAL: EstadoPublicacaoMassaMl = {
  lojaId: null,
  status: 'ocioso',
  modalAberto: false,
  minimizado: false,
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
        !/[a-zA-Z]/.test(valorLimpo)
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

    // Validação local rápida: fotos, preço e estoque antes de consumir IA/API ML
    if (fotosValidas.length === 0) {
      atualizarEstado({
        processados: estadoAtual.processados + 1,
        pulados: estadoAtual.pulados + 1,
        itensFalha: [
          ...estadoAtual.itensFalha,
          {
            produtoId: produto.id,
            nome: produto.nome,
            motivo: 'Produto sem fotos cadastradas. O Mercado Livre exige pelo menos 1 imagem.',
            tipo: 'pulado',
          },
        ],
      });
      continue;
    }

    const precoBase = variacao
      ? variacao.preco_promocional && variacao.preco_promocional > 0
        ? Number(variacao.preco_promocional)
        : Number(variacao.preco_venda_varejo || 0)
      : produto.promocao_ativa && produto.preco_promocional && produto.preco_promocional > 0
      ? Number(produto.preco_promocional)
      : Number(produto.preco_venda_varejo || 0);

    if (!Number.isFinite(precoBase) || precoBase <= 0) {
      atualizarEstado({
        processados: estadoAtual.processados + 1,
        pulados: estadoAtual.pulados + 1,
        itensFalha: [
          ...estadoAtual.itensFalha,
          {
            produtoId: produto.id,
            nome: produto.nome,
            motivo: 'Preço de venda inválido ou zerado.',
            tipo: 'pulado',
          },
        ],
      });
      continue;
    }

    const estoqueDisponivel = variacao
      ? Math.max(0, Number(variacao.quantidade_estoque || 0))
      : Math.max(0, Number(produto.quantidade_estoque || 0));

    if (estoqueDisponivel <= 0) {
      atualizarEstado({
        processados: estadoAtual.processados + 1,
        pulados: estadoAtual.pulados + 1,
        itensFalha: [
          ...estadoAtual.itensFalha,
          {
            produtoId: produto.id,
            nome: produto.nome,
            motivo: 'Estoque físico zerado. É necessário saldo maior que 0 para publicar no Mercado Livre.',
            tipo: 'pulado',
          },
        ],
      });
      continue;
    }

    let executouChamadaExterna = false;

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

      let gtinSugeridoIa: string | undefined;

      if (precisaGemini) {
        const resGemini = await mercadoLivreJevService.preencherAtributosTextoLivreViaGemini({
          lojaId,
          categoryId,
          fichaProduto,
          marcaAtual: marcaFinal || undefined,
          modeloAtual: modeloFinal || undefined,
          gtinAtual: possuiGtinValidoCadastro ? gtinCadastroDigitos : undefined,
          atributosPendentes,
        });

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

      // Etapa 2: Validar EAN/GTIN com dígito verificador GS1
      const gtinFinal = possuiGtinValidoCadastro
        ? gtinCadastroDigitos
        : gtinSugeridoIa && validarGtinGs1(gtinSugeridoIa)
        ? gtinSugeridoIa
        : '';

      if (!gtinFinal && !permitirSemEanQuandoCategoriaAceitar) {
        atualizarEstado({
          processados: estadoAtual.processados + 1,
          pulados: estadoAtual.pulados + 1,
          itensFalha: [
            ...estadoAtual.itensFalha,
            {
              produtoId: produto.id,
              nome: produto.nome,
              motivo:
                'Produto sem código de barras (EAN/GTIN) válido e a publicação sem EAN está desativada.',
              tipo: 'pulado',
            },
          ],
        });
        if (indice < produtos.length - 1 && !cancelamentoSolicitado) {
          await aguardarComCancelamento(INTERVALO_RATE_LIMIT_MS);
        }
        continue;
      }

      const semGtin = !gtinFinal;

      // Etapa 3: Montar GDM e invocar Edge Function ml-estoque-sync (create_listing)
      atualizarEstado({
        etapaAtual: 'Publicando anúncio no Mercado Livre...',
      });

      const atributosExtras = montarAtributosExtrasLote(atributosObrigatorios, valoresAtributos);

      const gdmCanonico = converterProdutoHubiParaGdmMl(produto, variacao, {
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

      const payloadMl = converterGdmParaPayloadApiMl(gdmCanonico, produto.descricao || undefined);

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

      const mlItemId = String(res.item?.id || '').trim();
      const permalink = obterPermalinkAnuncioMl(res.permalink || res.item?.permalink, mlItemId);

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
            gtinSincronizado: res.gtin_sincronizado || (semGtin ? null : gtinFinal),
          },
        ],
      });
    } catch (err: unknown) {
      const mensagemBruta = err instanceof Error ? err.message : String(err || 'Erro ao publicar no Mercado Livre.');
      const traduzido = traduzirErroMercadoLivre(mensagemBruta);
      const motivoFinal = traduzido.detalheTecnico
        ? `${traduzido.mensagemAmigavel} (${traduzido.detalheTecnico})`
        : traduzido.mensagemAmigavel;

      atualizarEstado({
        processados: estadoAtual.processados + 1,
        falhas: estadoAtual.falhas + 1,
        itensFalha: [
          ...estadoAtual.itensFalha,
          {
            produtoId: produto.id,
            nome: produto.nome,
            motivo: motivoFinal,
            tipo: 'erro',
          },
        ],
      });
    }

    if (executouChamadaExterna && indice < produtos.length - 1 && !cancelamentoSolicitado) {
      atualizarEstado({
        etapaAtual: 'Aguardando intervalo de segurança entre requisições...',
      });
      await aguardarComCancelamento(INTERVALO_RATE_LIMIT_MS);
    }
  }

  atualizarEstado({
    status: cancelamentoSolicitado ? 'cancelado' : 'concluido',
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
      categoriaInicialId: categoriaInicialId || null,
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
};
