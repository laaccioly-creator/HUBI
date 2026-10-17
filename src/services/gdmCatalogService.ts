import { supabase } from '../lib/supabase';
import { logger } from './loggerService';
import {
  GdmProdutoCanonico,
  GdmVariacaoCanonica,
  GdmSincronizacaoCatalogoOpcoes,
  GdmResultadoSincronizacao
} from '../types/gdm';
import { Categoria, Produto, VariacaoProduto } from '../types';

/**
 * GdmCatalogService
 * Gerenciamento de Catálogo Canônico e Arquitetura de Dados Mestres (GDM).
 * Permite a exportação canônica e clonagem/sincronização de catálogos
 * entre filiais de uma mesma organização, respeitando RLS e isolamento multi-tenant.
 */
export class GdmCatalogService {
  /**
   * Exporta os produtos e variações de uma loja no modelo canônico GDM.
   */
  public static async exportarCatalogoCanonico(lojaId: string): Promise<GdmProdutoCanonico[]> {
    if (!lojaId) throw new Error('Identificador da loja é obrigatório.');

    try {
      const { data: produtos, error: errProd } = await supabase
        .from('produtos')
        .select(`
          *,
          categoria:categorias(nome),
          variacoes:variacoes_produto(*)
        `)
        .eq('loja_id', lojaId)
        .eq('ativo', true)
        .order('nome', { ascending: true });

      if (errProd) {
        logger.error('GdmCatalogService', 'exportar_catalogo', errProd, { loja_id: lojaId });
        throw new Error(`Falha ao exportar catálogo: ${errProd.message}`);
      }

      const lista = (produtos || []) as any[];

      return lista.map((p) => {
        const variacoesCanonicas: GdmVariacaoCanonica[] = (p.variacoes || []).map((v: VariacaoProduto) => ({
          sku: v.sku || null,
          codigo_barras: v.codigo_barras || null,
          valor_variacao_1: v.valor_variacao_1,
          valor_variacao_2: v.valor_variacao_2 || null,
          preco_custo_referencia: v.preco_custo || null,
          preco_venda_sugerido: v.preco_venda_varejo,
          preco_venda_atacado: v.preco_venda_atacado || null,
          preco_venda_autoatacado: v.preco_venda_autoatacado || null
        }));

        return {
          codigo_interno: p.codigo_interno || null,
          codigo_barras: p.codigo_barras || null,
          nome: p.nome,
          tipo_item: p.tipo_item || 'produto',
          tipo_unidade: p.tipo_unidade || 'un',
          descricao: p.descricao || null,
          fotos_urls: Array.isArray(p.fotos_urls) ? p.fotos_urls : [],
          categoria_nome: p.categoria?.nome || null,
          preco_custo_referencia: Number(p.preco_custo || 0),
          preco_venda_sugerido: Number(p.preco_venda_varejo || 0),
          preco_venda_atacado: p.preco_venda_atacado != null ? Number(p.preco_venda_atacado) : null,
          qtd_minima_atacado: p.qtd_minima_atacado != null ? Number(p.qtd_minima_atacado) : null,
          preco_venda_autoatacado: p.preco_venda_autoatacado != null ? Number(p.preco_venda_autoatacado) : null,
          qtd_minima_autoatacado: p.qtd_minima_autoatacado != null ? Number(p.qtd_minima_autoatacado) : null,
          tem_variacoes: Boolean(p.tem_variacoes),
          rotulo_variacao_1: p.rotulo_variacao_1 || null,
          rotulo_variacao_2: p.rotulo_variacao_2 || null,
          variacoes: variacoesCanonicas
        };
      });
    } catch (err: any) {
      logger.error('GdmCatalogService', 'exportar_catalogo', err, { loja_id: lojaId });
      throw err;
    }
  }

  /**
   * Clona com segurança o catálogo (categorias, produtos e variações) de uma loja
   * matriz/origem para uma nova filial da mesma organização.
   */
  public static async clonarCatalogoEntreLojas(
    opcoes: GdmSincronizacaoCatalogoOpcoes
  ): Promise<GdmResultadoSincronizacao> {
    const inicio = performance.now();
    const erros: string[] = [];
    let totalCategoriasClonadas = 0;
    let totalProdutosClonados = 0;
    let totalVariacoesClonadas = 0;

    const {
      organizacaoId,
      lojaOrigemId,
      lojaDestinoId,
      copiarPrecos = true,
      copiarEstoqueZerado = true,
      copiarCategorias = true
    } = opcoes;

    if (!organizacaoId || !lojaOrigemId || !lojaDestinoId) {
      throw new Error('organizacaoId, lojaOrigemId e lojaDestinoId são obrigatórios.');
    }

    if (lojaOrigemId === lojaDestinoId) {
      throw new Error('A loja de origem e destino não podem ser a mesma.');
    }

    // 1. Validação de isolamento do conglomerado (Ambas as lojas devem pertencer à mesma organização)
    const { data: lojasOrg, error: errLojas } = await supabase
      .from('lojas')
      .select('id, organizacao_id')
      .in('id', [lojaOrigemId, lojaDestinoId]);

    if (errLojas || !lojasOrg || lojasOrg.length !== 2) {
      throw new Error('Não foi possível validar as lojas da organização.');
    }

    const ambasPertencem = lojasOrg.every(l => l.organizacao_id === organizacaoId);
    if (!ambasPertencem) {
      throw new Error('Violação de segurança: as lojas não pertencem à mesma organização.');
    }

    try {
      // 2. Mapeamento e clonagem de categorias
      const mapaCategorias = new Map<string, string>(); // idOrigem -> idDestino

      if (copiarCategorias) {
        const { data: catOrigem, error: errCatOrigem } = await supabase
          .from('categorias')
          .select('*')
          .eq('loja_id', lojaOrigemId)
          .eq('ativo', true);

        if (errCatOrigem) {
          throw new Error(`Erro ao consultar categorias de origem: ${errCatOrigem.message}`);
        }

        const { data: catDestinoExistentes, error: errCatDestino } = await supabase
          .from('categorias')
          .select('id, nome')
          .eq('loja_id', lojaDestinoId);

        if (errCatDestino) {
          throw new Error(`Erro ao consultar categorias de destino: ${errCatDestino.message}`);
        }

        const mapNomeParaIdDestino = new Map<string, string>();
        (catDestinoExistentes || []).forEach(cd => {
          mapNomeParaIdDestino.set(cd.nome.trim().toLowerCase(), cd.id);
        });

        for (const cat of catOrigem || []) {
          const chaveNome = cat.nome.trim().toLowerCase();
          if (mapNomeParaIdDestino.has(chaveNome)) {
            mapaCategorias.set(cat.id, mapNomeParaIdDestino.get(chaveNome)!);
          } else {
            const { data: novaCat, error: errNovaCat } = await supabase
              .from('categorias')
              .insert({
                loja_id: lojaDestinoId,
                nome: cat.nome,
                icone: cat.icone || null,
                ordem_exibicao: cat.ordem_exibicao || 0,
                ativo: true
              })
              .select('id, nome')
              .single();

            if (errNovaCat || !novaCat) {
              erros.push(`Falha ao clonar categoria "${cat.nome}": ${errNovaCat?.message}`);
            } else {
              mapaCategorias.set(cat.id, novaCat.id);
              mapNomeParaIdDestino.set(chaveNome, novaCat.id);
              totalCategoriasClonadas++;
            }
          }
        }
      }

      // 3. Consulta de produtos da loja de origem
      const { data: prodsOrigem, error: errProdsOrigem } = await supabase
        .from('produtos')
        .select('*')
        .eq('loja_id', lojaOrigemId)
        .eq('ativo', true);

      if (errProdsOrigem) {
        throw new Error(`Erro ao consultar produtos de origem: ${errProdsOrigem.message}`);
      }

      // Consulta produtos já existentes no destino para evitar duplicações
      const { data: prodsDestinoExistentes } = await supabase
        .from('produtos')
        .select('id, nome, codigo_interno, codigo_barras')
        .eq('loja_id', lojaDestinoId);

      const nomesExistentesDestino = new Set(
        (prodsDestinoExistentes || []).map(p => p.nome.trim().toLowerCase())
      );

      for (const p of prodsOrigem || []) {
        if (nomesExistentesDestino.has(p.nome.trim().toLowerCase())) {
          continue; // Pula se já houver produto de mesmo nome no destino
        }

        const categoriaDestinoId = p.categoria_id ? mapaCategorias.get(p.categoria_id) || null : null;

        const payloadProduto: any = {
          loja_id: lojaDestinoId,
          categoria_id: categoriaDestinoId,
          nome: p.nome,
          tipo_item: p.tipo_item || 'produto',
          tipo_unidade: p.tipo_unidade || 'un',
          unidade_medida: p.unidade_medida || null,
          codigo_interno: p.codigo_interno || null,
          codigo_barras: p.codigo_barras || null,
          descricao: p.descricao || null,
          fotos_urls: p.fotos_urls || [],
          preco_custo: copiarPrecos ? (p.preco_custo || 0) : 0,
          preco_venda_varejo: copiarPrecos ? (p.preco_venda_varejo || 0) : 0,
          preco_venda_atacado: copiarPrecos ? (p.preco_venda_atacado || null) : null,
          tipo_minimo_atacado: p.tipo_minimo_atacado || null,
          qtd_minima_atacado: p.qtd_minima_atacado || 1,
          valor_minimo_atacado: p.valor_minimo_atacado || null,
          preco_venda_autoatacado: copiarPrecos ? (p.preco_venda_autoatacado || null) : null,
          tipo_minimo_autoatacado: p.tipo_minimo_autoatacado || null,
          qtd_minima_autoatacado: p.qtd_minima_autoatacado || 1,
          valor_minimo_autoatacado: p.valor_minimo_autoatacado || null,
          preco_promocional: null,
          promocao_ativa: false,
          quantidade_estoque: copiarEstoqueZerado ? 0 : (p.quantidade_estoque || 0),
          estoque_minimo_alerta: p.estoque_minimo_alerta || 0,
          permite_estoque_negativo: Boolean(p.permite_estoque_negativo),
          tem_variacoes: Boolean(p.tem_variacoes),
          rotulo_variacao_1: p.rotulo_variacao_1 || null,
          rotulo_variacao_2: p.rotulo_variacao_2 || null,
          ativo: true
        };

        const { data: novoProduto, error: errNovoProd } = await supabase
          .from('produtos')
          .insert(payloadProduto)
          .select('id')
          .single();

        if (errNovoProd || !novoProduto) {
          erros.push(`Falha ao clonar produto "${p.nome}": ${errNovoProd?.message}`);
          continue;
        }

        totalProdutosClonados++;
        nomesExistentesDestino.add(p.nome.trim().toLowerCase());

        // Se o produto tiver variações, cloná-las
        if (p.tem_variacoes) {
          const { data: varsOrigem } = await supabase
            .from('variacoes_produto')
            .select('*')
            .eq('produto_id', p.id)
            .eq('loja_id', lojaOrigemId)
            .eq('ativo', true);

          if (varsOrigem && varsOrigem.length > 0) {
            const variacoesFormatadas = varsOrigem.map(v => ({
              loja_id: lojaDestinoId,
              produto_id: novoProduto.id,
              valor_variacao_1: v.valor_variacao_1,
              valor_variacao_2: v.valor_variacao_2 || null,
              combinacao_nome: v.combinacao_nome || null,
              sku: v.sku || null,
              codigo_barras: v.codigo_barras || null,
              preco_custo: copiarPrecos ? (v.preco_custo || 0) : 0,
              preco_venda_varejo: copiarPrecos ? (v.preco_venda_varejo || 0) : 0,
              preco_venda_atacado: copiarPrecos ? (v.preco_venda_atacado || null) : null,
              preco_venda_autoatacado: copiarPrecos ? (v.preco_venda_autoatacado || null) : null,
              preco_promocional: null,
              quantidade_estoque: copiarEstoqueZerado ? 0 : (v.quantidade_estoque || 0),
              estoque_minimo_alerta: v.estoque_minimo_alerta || 0,
              permite_estoque_negativo: Boolean(v.permite_estoque_negativo),
              ativo: true
            }));

            const { error: errVars } = await supabase
              .from('variacoes_produto')
              .insert(variacoesFormatadas);

            if (errVars) {
              erros.push(`Falha ao clonar variações de "${p.nome}": ${errVars.message}`);
            } else {
              totalVariacoesClonadas += variacoesFormatadas.length;
            }
          }
        }
      }

      const duracao = Math.round(performance.now() - inicio);

      logger.info(
        'GdmCatalogService',
        'clonar_catalogo',
        `Sincronização de catálogo concluída da loja ${lojaOrigemId} para ${lojaDestinoId}: ${totalProdutosClonados} produtos, ${totalVariacoesClonadas} variações e ${totalCategoriasClonadas} categorias.`,
        { loja_id: lojaDestinoId, organizacao_id: organizacaoId }
      );

      return {
        sucesso: erros.length === 0,
        totalCategoriasClonadas,
        totalProdutosClonados,
        totalVariacoesClonadas,
        erros,
        tempoExecucaoMs: duracao
      };
    } catch (e: any) {
      const duracao = Math.round(performance.now() - inicio);
      logger.error('GdmCatalogService', 'clonar_catalogo', e, { loja_id: lojaDestinoId, organizacao_id: organizacaoId });
      return {
        sucesso: false,
        totalCategoriasClonadas,
        totalProdutosClonados,
        totalVariacoesClonadas,
        erros: [...erros, e.message || 'Erro inesperado na sincronização.'],
        tempoExecucaoMs: duracao
      };
    }
  }
}
