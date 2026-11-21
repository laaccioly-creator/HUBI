import { supabase } from '../lib/supabase';
import { SyncService } from './syncService';

export interface VariacaoDeltaInput {
  id?: string | null;
  valor_variacao_1: string;
  valor_variacao_2?: string | null;
  combinacao_nome?: string | null;
  codigo_barras?: string | null;
  sku?: string | null;
  preco_custo?: number | null;
  preco_venda_varejo: number;
  preco_venda_atacado?: number | null;
  preco_venda_autoatacado?: number | null;
  preco_promocional?: number | null;
  quantidade_estoque: number;
  estoque_minimo_alerta?: number;
  ativo?: boolean;
}

export class ProdutoService {
  /**
   * Realiza upload de Data URL base64 para o bucket `produtos` no Supabase Storage.
   * Mantém fallback seguro para a URL original caso o bucket não esteja acessível.
   */
  static async uploadFotoDataUrl(dataUrl: string, lojaId?: string | null): Promise<string> {
    if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
    try {
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      const nomeArquivo = `${lojaId || 'geral'}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;

      const { error } = await supabase.storage
        .from('produtos')
        .upload(nomeArquivo, blob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (error) {
        console.warn('[ProdutoService] Aviso ao subir imagem no bucket produtos:', error);
        return dataUrl;
      }

      const { data: publicData } = supabase.storage
        .from('produtos')
        .getPublicUrl(nomeArquivo);

      return publicData?.publicUrl || dataUrl;
    } catch (err) {
      console.warn('[ProdutoService] Falha ao enviar imagem para Storage:', err);
      return dataUrl;
    }
  }
  /**
   * Sincronização Delta Inteligente de Variações de Produtos (Sem Recriação Destrutiva)
   * 
   * 1. UPDATE: Variações com ID existente no banco são atualizadas mantendo estritamente a PK original.
   * 2. INSERT: Apenas novas variações adicionadas pelo usuário são inseridas com novo UUID.
   * 3. DELETE: Apenas variações explicitamente removidas pelo usuário são deletadas (com fallback
   *    para soft-delete 'ativo = false' caso possuam vínculo com vendas ou movimentações históricas).
   */
  static async sincronizarVariacoesDelta(
    lojaId?: string | null,
    produtoId?: string | null,
    variacoesNovas: VariacaoDeltaInput[] = [],
    temVariacoes: boolean = true
  ): Promise<void> {
    if (!lojaId || !produtoId) return;

    // 1. Buscar variações existentes no banco para este produto
    const { data: variacoesExistentes, error: erroBusca } = await supabase
      .from('variacoes_produto')
      .select('id, valor_variacao_1, valor_variacao_2, ativo')
      .eq('produto_id', produtoId)
      .eq('loja_id', lojaId);

    if (erroBusca) {
      console.error('[ProdutoService] Erro ao buscar variações existentes:', erroBusca);
      throw new Error(`Falha ao verificar grade existente do produto: ${erroBusca.message}`);
    }

    const existentes = variacoesExistentes || [];
    const mapaExistentes = new Map(existentes.map(v => [v.id, v]));

    // Se o usuário desativou a grade do produto ou a lista está vazia
    if (!temVariacoes || variacoesNovas.length === 0) {
      for (const varExistente of existentes) {
        try {
          const { error: erroDel } = await supabase
            .from('variacoes_produto')
            .delete()
            .eq('id', varExistente.id)
            .eq('loja_id', lojaId);

          if (erroDel) {
            // Fallback para soft-delete caso possua registros dependentes em itens_pedido
            await supabase
              .from('variacoes_produto')
              .update({ ativo: false })
              .eq('id', varExistente.id)
              .eq('loja_id', lojaId);
          }
        } catch {
          await supabase
            .from('variacoes_produto')
            .update({ ativo: false })
            .eq('id', varExistente.id)
            .eq('loja_id', lojaId);
        }
      }
      return;
    }

    // 2. Identificar operações: UPDATE, INSERT e DELETE
    const idsMantidos = new Set<string>();
    const paraAtualizar: VariacaoDeltaInput[] = [];
    const paraInserir: any[] = [];

    for (const v of variacoesNovas) {
      const rot1 = (v.valor_variacao_1 || '').trim() || 'Padrão';
      const rot2 = (v.valor_variacao_2 || '').trim() || null;
      const comb = v.combinacao_nome || (rot2 ? `${rot1} / ${rot2}` : rot1);
      const precoCusto = v.preco_custo !== undefined && v.preco_custo !== null && Number(v.preco_custo) > 0
        ? Number(v.preco_custo)
        : null;
      const precoVarejo = Number(v.preco_venda_varejo) || 0;
      const precoAtacado = v.preco_venda_atacado !== undefined && v.preco_venda_atacado !== null && Number(v.preco_venda_atacado) > 0
        ? Number(v.preco_venda_atacado)
        : null;
      const precoAutoatacado = v.preco_venda_autoatacado !== undefined && v.preco_venda_autoatacado !== null && Number(v.preco_venda_autoatacado) > 0
        ? Number(v.preco_venda_autoatacado)
        : null;
      const precoPromocional = v.preco_promocional !== undefined && v.preco_promocional !== null && Number(v.preco_promocional) > 0
        ? Number(v.preco_promocional)
        : null;
      const qtdEstoque = Number(v.quantidade_estoque) || 0;
      const estMinimo = Number(v.estoque_minimo_alerta) || 0;
      const ean = (v.codigo_barras || '').trim() || null;
      const sku = (v.sku || '').trim() || null;
      const ativo = v.ativo !== false;

      const idValido = v.id && SyncService.isUuidValido(v.id) ? v.id : null;

      if (idValido && mapaExistentes.has(idValido)) {
        // Já existe no banco: UPDATE
        idsMantidos.add(idValido);
        paraAtualizar.push({
          id: idValido,
          valor_variacao_1: rot1,
          valor_variacao_2: rot2,
          combinacao_nome: comb,
          codigo_barras: ean,
          sku: sku,
          preco_custo: precoCusto,
          preco_venda_varejo: precoVarejo,
          preco_venda_atacado: precoAtacado,
          preco_venda_autoatacado: precoAutoatacado,
          preco_promocional: precoPromocional,
          quantidade_estoque: qtdEstoque,
          estoque_minimo_alerta: estMinimo,
          ativo: ativo
        });
      } else {
        // Nova opção criada pelo usuário: INSERT
        paraInserir.push({
          loja_id: lojaId,
          produto_id: produtoId,
          valor_variacao_1: rot1,
          valor_variacao_2: rot2,
          combinacao_nome: comb,
          codigo_barras: ean,
          sku: sku,
          preco_custo: precoCusto,
          preco_venda_varejo: precoVarejo,
          preco_venda_atacado: precoAtacado,
          preco_venda_autoatacado: precoAutoatacado,
          preco_promocional: precoPromocional,
          quantidade_estoque: qtdEstoque,
          estoque_minimo_alerta: estMinimo,
          ativo: ativo
        });
      }
    }

    // 3. Executar UPDATES mantendo estritamente os IDs existentes
    for (const vUp of paraAtualizar) {
      if (!vUp.id) continue;
      const { error: erroUpdate } = await supabase
        .from('variacoes_produto')
        .update({
          valor_variacao_1: vUp.valor_variacao_1,
          valor_variacao_2: vUp.valor_variacao_2,
          combinacao_nome: vUp.combinacao_nome,
          codigo_barras: vUp.codigo_barras,
          sku: vUp.sku,
          preco_custo: vUp.preco_custo,
          preco_venda_varejo: vUp.preco_venda_varejo,
          preco_venda_atacado: vUp.preco_venda_atacado,
          preco_venda_autoatacado: vUp.preco_venda_autoatacado,
          preco_promocional: vUp.preco_promocional,
          quantidade_estoque: vUp.quantidade_estoque,
          estoque_minimo_alerta: vUp.estoque_minimo_alerta,
          ativo: vUp.ativo
        })
        .eq('id', vUp.id)
        .eq('loja_id', lojaId);

      if (erroUpdate) {
        console.warn(`[ProdutoService] Aviso ao atualizar variação ${vUp.id}:`, erroUpdate);
      }
    }

    // 4. Executar INSERTS para as novas variações adicionadas
    if (paraInserir.length > 0) {
      const { error: erroInsert } = await supabase
        .from('variacoes_produto')
        .insert(paraInserir);

      if (erroInsert) {
        console.error('[ProdutoService] Erro ao inserir novas variações:', erroInsert);
        throw new Error(`Falha ao cadastrar novas variações: ${erroInsert.message}`);
      }
    }

    // 5. Executar DELETES para variações que foram excluídas pelo operador
    const paraExcluir = existentes.filter(ex => !idsMantidos.has(ex.id));
    for (const varExcluir of paraExcluir) {
      try {
        const { error: erroDel } = await supabase
          .from('variacoes_produto')
          .delete()
          .eq('id', varExcluir.id)
          .eq('loja_id', lojaId);

        if (erroDel) {
          // Se houver vínculo relacional com vendas passadas, faz soft-delete seguro
          await supabase
            .from('variacoes_produto')
            .update({ ativo: false })
            .eq('id', varExcluir.id)
            .eq('loja_id', lojaId);
        }
      } catch {
        await supabase
          .from('variacoes_produto')
          .update({ ativo: false })
          .eq('id', varExcluir.id)
          .eq('loja_id', lojaId);
      }
    }
  }
}
