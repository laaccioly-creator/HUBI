// Serviço de Frontend: src/services/shopeeService.ts
// Gerencia comunicação da camada React com shopee-oauth, shopee-estoque-sync e tabelas unificadas (plataforma='shopee').

import { supabase, supabaseFunctionsBaseUrl } from '../lib/supabase';
import {
  MarketplaceAnuncioItem,
  MlAtributoObrigatorioCategoria,
  MlConsultaCategoriaResultado,
} from './mercadoLivreService';
import { validarGtinGs1 } from '../utils/gdmMercadoLivreMapper';

export interface ShopeeContaLoja {
  id: string;
  loja_id: string;
  provedor: 'shopee';
  plataforma?: 'shopee' | string;
  ml_user_id: number;
  seller_id?: string | null;
  ml_nickname: string;
  ml_site_id: string;
  token_expira_em: string;
  refresh_token_expires_at?: string | null;
  status_conexao: 'conectado' | 'expirado' | 'erro_autenticacao' | 'desconectado';
  sincronizar_estoque_automatico: boolean;
  importar_pedidos_automatico: boolean;
  taxa_comissao_padrao_percentual: number;
  taxa_fixa_padrao: number;
  ultima_sincronizacao_em?: string | null;
  ultimo_erro_mensagem?: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface ShopeeCanalLogistico {
  logistics_channel_id: number;
  logistics_channel_name: string;
  enabled: boolean;
}

export interface ShopeeConsultaCategoriaResultado extends MlConsultaCategoriaResultado {
  canais_logisticos?: ShopeeCanalLogistico[];
}

export function obterPermalinkAnuncioShopee(
  permalink?: string | null,
  itemId?: string | null,
  shopId?: string | number | null
): string {
  const linkLimpo = typeof permalink === 'string' ? permalink.trim() : '';
  if (linkLimpo && /^https?:\/\//i.test(linkLimpo)) {
    return linkLimpo;
  }
  const idLimpo = String(itemId || '').replace(/\D/g, '').trim();
  const shopLimpo = String(shopId || '').replace(/\D/g, '').trim();
  if (idLimpo && shopLimpo) {
    return `https://shopee.com.br/product/${shopLimpo}/${idLimpo}`;
  }
  return '';
}

export function calcularBreakdownPrecoShopee(
  precoBaseHubi: number,
  margemSobreprecoPercentual: number = 0,
  custoFixoVenda: number = 0
): {
  precoBaseHubi: number;
  valorComissao: number;
  custoFixoAplicado: number;
  precoFinalShopee: number;
} {
  if (!Number.isFinite(precoBaseHubi) || precoBaseHubi <= 0) {
    return {
      precoBaseHubi: 0,
      valorComissao: 0,
      custoFixoAplicado: 0,
      precoFinalShopee: 0,
    };
  }

  const margemSegura = Math.min(85, Math.max(0, Number(margemSobreprecoPercentual || 0)));
  const custoFixoSeguro = Math.max(0, Number(custoFixoVenda || 0));
  const precoFinalBruto = (precoBaseHubi + custoFixoSeguro) / (1 - margemSegura / 100);
  const precoFinalShopee = Number(precoFinalBruto.toFixed(2));
  const valorComissao = Number((precoFinalShopee * (margemSegura / 100)).toFixed(2));

  return {
    precoBaseHubi: Number(precoBaseHubi.toFixed(2)),
    valorComissao,
    custoFixoAplicado: Number(custoFixoSeguro.toFixed(2)),
    precoFinalShopee,
  };
}

async function obterSessaoValida() {
  const {
    data: { session: sessaoInicial },
  } = await supabase.auth.getSession();
  if (sessaoInicial?.access_token) return sessaoInicial;

  try {
    const {
      data: { session: sessaoRenovada },
    } = await supabase.auth.refreshSession();
    if (sessaoRenovada?.access_token) return sessaoRenovada;
  } catch {
    // Segue para erro abaixo
  }

  throw new Error(
    'Sessão não identificada. Por favor, atualize a página (F5) ou faça login novamente.'
  );
}

async function extrairMensagemErroShopee(error: unknown, data?: any): Promise<string> {
  if (data) {
    if (typeof data.error === 'string' && data.error.trim()) return data.error;
    if (typeof data.message === 'string' && data.message.trim()) return data.message;
  }

  if (error && typeof error === 'object') {
    const errObj = error as any;
    if (errObj.context && typeof errObj.context.json === 'function') {
      try {
        const body = await errObj.context.json();
        if (typeof body?.error === 'string' && body.error.trim()) return body.error;
        if (typeof body?.message === 'string' && body.message.trim()) return body.message;
      } catch {
        // Ignora falha de leitura JSON
      }
    }
    if (
      typeof errObj.message === 'string' &&
      errObj.message.trim() &&
      !errObj.message.includes('non-2xx status code')
    ) {
      return errObj.message;
    }
  }

  return 'Falha na comunicação com a Shopee. Verifique a conexão da sua conta ou tente novamente.';
}

export const shopeeService = {
  async obterConta(lojaId: string): Promise<ShopeeContaLoja | null> {
    if (!lojaId) return null;

    const { data, error } = await supabase
      .from('marketplace_contas')
      .select(
        'id, loja_id, provedor, plataforma, ml_user_id, seller_id, ml_nickname, ml_site_id, token_expira_em, refresh_token_expires_at, status_conexao, sincronizar_estoque_automatico, importar_pedidos_automatico, taxa_comissao_padrao_percentual, taxa_fixa_padrao, ultima_sincronizacao_em, ultimo_erro_mensagem, criado_em, atualizado_em'
      )
      .eq('loja_id', lojaId)
      .eq('provedor', 'shopee')
      .maybeSingle();

    if (error) {
      console.error('[shopeeService] Erro ao buscar conta Shopee:', error.message);
      return null;
    }

    return (data as ShopeeContaLoja) || null;
  },

  async buscarContaConectada(lojaId: string): Promise<ShopeeContaLoja | null> {
    const conta = await this.obterConta(lojaId);
    if (!conta || conta.status_conexao !== 'conectado') {
      return null;
    }
    return conta;
  },

  async obterUrlAutorizacao(lojaId: string): Promise<string> {
    const session = await obterSessaoValida();

    const resposta = await fetch(
      `${supabaseFunctionsBaseUrl}/shopee-oauth?action=authorize_url&loja_id=${encodeURIComponent(lojaId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );

    if (!resposta.ok) {
      const erroJson = await resposta.json().catch(() => ({}));
      throw new Error(erroJson.error || 'Falha ao gerar link de conexão da Shopee.');
    }

    const resJson = await resposta.json();
    if (!resJson?.url) {
      throw new Error('URL de autorização da Shopee não retornada pelo servidor.');
    }

    return resJson.url;
  },

  async processarCallbackCodigo(
    code: string,
    shopId: string,
    state: string
  ): Promise<ShopeeContaLoja> {
    const session = await obterSessaoValida().catch(() => null);
    const { data, error } = await supabase.functions.invoke('shopee-oauth', {
      body: { action: 'exchange_code', code, shop_id: shopId, state },
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    });

    if (error || !data?.sucesso) {
      const msg = await extrairMensagemErroShopee(error, data);
      throw new Error(msg);
    }

    return data.conta as ShopeeContaLoja;
  },

  async desconectarConta(lojaId: string): Promise<void> {
    const session = await obterSessaoValida().catch(() => null);
    const { data, error } = await supabase.functions.invoke('shopee-oauth', {
      body: { action: 'disconnect', loja_id: lojaId },
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    });

    if (error || !data?.sucesso) {
      const { error: erroUpdate } = await supabase
        .from('marketplace_contas')
        .update({
          status_conexao: 'desconectado',
          ultimo_erro_mensagem: 'Desconectado manualmente pelo usuário.',
        })
        .eq('loja_id', lojaId)
        .eq('provedor', 'shopee');

      if (erroUpdate) {
        throw new Error('Não foi possível desconectar a conta da Shopee.');
      }
    }
  },

  async salvarConfiguracoes(
    lojaId: string,
    params: {
      sincronizar_estoque_automatico?: boolean;
      importar_pedidos_automatico?: boolean;
      taxa_comissao_padrao_percentual?: number;
      taxa_fixa_padrao?: number;
    }
  ): Promise<void> {
    const { error } = await supabase
      .from('marketplace_contas')
      .update(params)
      .eq('loja_id', lojaId)
      .eq('provedor', 'shopee');

    if (error) {
      throw new Error('Erro ao salvar preferências da Shopee.');
    }
  },

  async listarAnuncios(lojaId: string): Promise<MarketplaceAnuncioItem[]> {
    const { data, error } = await supabase
      .from('marketplace_anuncios')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('plataforma', 'shopee')
      .order('criado_em', { ascending: false });

    if (error) {
      console.error('[shopeeService] Erro ao listar anúncios Shopee:', error.message);
      return [];
    }

    return (data as MarketplaceAnuncioItem[]) || [];
  },

  async consultarCategoria(params: {
    lojaId: string;
    titulo?: string;
    categoryId?: string;
  }): Promise<ShopeeConsultaCategoriaResultado> {
    await obterSessaoValida().catch(() => null);

    const { data, error } = await supabase.functions.invoke('shopee-estoque-sync', {
      body: {
        action: 'consultar_categoria',
        loja_id: params.lojaId,
        titulo: params.titulo,
        category_id: params.categoryId,
      },
    });

    if (error || !data?.sucesso) {
      const msg = await extrairMensagemErroShopee(error, data);
      throw new Error(msg);
    }

    return data as ShopeeConsultaCategoriaResultado;
  },

  async vincularAnuncioExistente(params: {
    lojaId: string;
    produtoId: string;
    variacaoId?: string | null;
    itemId: string;
  }): Promise<{
    sucesso: boolean;
    mensagem: string;
    permalink?: string;
    anuncio?: any;
  }> {
    await supabase.auth.refreshSession().catch(() => null);

    const { data, error } = await supabase.functions.invoke('shopee-estoque-sync', {
      body: {
        action: 'link_existing',
        loja_id: params.lojaId,
        produto_id: params.produtoId,
        variacao_id: params.variacaoId,
        item_id: params.itemId,
      },
    });

    if (error || !data?.sucesso) {
      const msg = await extrairMensagemErroShopee(error, data);
      throw new Error(msg);
    }

    return data;
  },

  async criarAnuncio(params: {
    lojaId: string;
    produtoId: string;
    variacaoId?: string | null;
    itemName: string;
    description: string;
    originalPrice: number;
    normalStock: number;
    categoryId?: string;
    margemSobrepreco?: number;
    marca?: string;
    gtin?: string | null;
    semGtin?: boolean;
    atributosExtras?: Array<{ id: string; value_id?: string; value_name: string }>;
    fotosUrls?: string[];
  }): Promise<{
    sucesso: boolean;
    mensagem: string;
    permalink?: string;
    gtin_sincronizado?: string | null;
    item: any;
  }> {
    await supabase.auth.refreshSession().catch(() => null);

    const gtinDigitos =
      !params.semGtin && typeof params.gtin === 'string'
        ? params.gtin.replace(/\D/g, '').trim()
        : '';
    const gtinValido = gtinDigitos && validarGtinGs1(gtinDigitos) ? gtinDigitos : '';

    const { data, error } = await supabase.functions.invoke('shopee-estoque-sync', {
      body: {
        action: 'create_listing',
        loja_id: params.lojaId,
        produto_id: params.produtoId,
        variacao_id: params.variacaoId,
        item_name: params.itemName,
        description: params.description,
        original_price: params.originalPrice,
        normal_stock: params.normalStock,
        category_id: params.categoryId,
        margem_sobrepreco: params.margemSobrepreco,
        marca: params.marca,
        gtin: gtinValido || null,
        sem_gtin: Boolean(params.semGtin || !gtinValido),
        atributos_extras: params.atributosExtras,
        fotos_urls: params.fotosUrls,
      },
    });

    if (error || !data?.sucesso) {
      const msg = await extrairMensagemErroShopee(error, data);
      throw new Error(msg);
    }

    return data;
  },

  async sincronizarStatusAnuncios(lojaId: string): Promise<{
    sucesso: boolean;
    total_verificados: number;
    removidos: number;
    atualizados: number;
    ids_removidos: string[];
  }> {
    await obterSessaoValida().catch(() => null);

    const { data, error } = await supabase.functions.invoke('shopee-estoque-sync', {
      body: {
        action: 'sync_listings_status',
        loja_id: lojaId,
      },
    });

    if (error || !data?.sucesso) {
      const msg = await extrairMensagemErroShopee(error, data);
      throw new Error(msg);
    }

    return {
      sucesso: true,
      total_verificados: Number(data.total_verificados || 0),
      removidos: Number(data.removidos || 0),
      atualizados: Number(data.atualizados || 0),
      ids_removidos: Array.isArray(data.ids_removidos) ? data.ids_removidos : [],
    };
  },

  async desvincularAnuncio(params: {
    lojaId: string;
    anuncioId?: string;
    produtoId?: string;
    mlItemId?: string;
  }): Promise<void> {
    if (!params.lojaId) return;

    let query = supabase
      .from('marketplace_anuncios')
      .delete()
      .eq('loja_id', params.lojaId)
      .eq('plataforma', 'shopee');

    if (params.anuncioId) {
      query = query.eq('id', params.anuncioId);
    } else if (params.produtoId && params.mlItemId) {
      query = query.eq('produto_id', params.produtoId).eq('ml_item_id', params.mlItemId);
    } else if (params.produtoId) {
      query = query.eq('produto_id', params.produtoId);
    } else if (params.mlItemId) {
      query = query.eq('ml_item_id', params.mlItemId);
    } else {
      return;
    }

    const { error } = await query;
    if (error) {
      throw new Error('Não foi possível desvincular o anúncio da Shopee.');
    }
  },

  async sincronizarEstoqueProduto(lojaId: string, produtoId: string): Promise<void> {
    try {
      await supabase.functions.invoke('shopee-estoque-sync', {
        body: {
          action: 'sync_stock',
          loja_id: lojaId,
          produto_id: produtoId,
        },
      });
    } catch (err: any) {
      console.warn('[shopeeService] Aviso ao sincronizar estoque Shopee pós-venda:', err?.message);
    }
  },
};

export type { MlAtributoObrigatorioCategoria };
