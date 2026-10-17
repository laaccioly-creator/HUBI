// Serviço de Frontend: src/services/mercadoLivreService.ts
// Gerencia a comunicação da camada React com as Edge Functions e tabelas do Mercado Livre
// Governança: supabase-rls-guard (filtro estrito por loja_id) e pii-leak-detector

import { supabase } from '../lib/supabase';

export interface MarketplaceContaLoja {
  id: string;
  loja_id: string;
  provedor: 'mercadolivre';
  ml_user_id: number;
  ml_nickname: string;
  ml_site_id: string;
  token_expira_em: string;
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

export interface MarketplaceAnuncioItem {
  id: string;
  loja_id: string;
  conta_id: string;
  produto_id: string;
  variacao_id?: string | null;
  ml_item_id: string;
  ml_variation_id?: number | null;
  ml_category_id?: string | null;
  ml_listing_type_id: string;
  titulo_anuncio: string;
  preco_anuncio: number;
  margem_sobrepreco_percentual: number;
  estoque_ultimo_enviado: number;
  status_anuncio: 'active' | 'paused' | 'closed' | 'under_review' | 'erro_sincronia';
  permalink?: string | null;
  sincronizacao_ativa: boolean;
  ultima_sincronizacao_estoque_em?: string | null;
  ultimo_erro_sincronizacao?: string | null;
}

/**
 * Helper para obter a sessão JWT válida do usuário autenticado.
 * Tenta refreshSession() caso a sessão inicial esteja nula ou expirada.
 */
async function obterSessaoValida() {
  const { data: { session: sessaoInicial } } = await supabase.auth.getSession();
  if (sessaoInicial?.access_token) {
    return sessaoInicial;
  }

  // Tenta renovar a sessão persistida no storage local
  try {
    const { data: { session: sessaoRenovada } } = await supabase.auth.refreshSession();
    if (sessaoRenovada?.access_token) {
      return sessaoRenovada;
    }
  } catch (err) {
    console.warn('[mercadoLivreService] Tentativa de renovar sessão falhou:', err);
  }

  throw new Error('Sessão não identificada. Por favor, atualize a página (F5) ou faça login novamente para continuar.');
}

export const mercadoLivreService = {
  /**
   * Obtém a conta conectada do Mercado Livre para a loja ativa
   */
  async obterConta(lojaId: string): Promise<MarketplaceContaLoja | null> {
    if (!lojaId) return null;

    const { data, error } = await supabase
      .from('marketplace_contas')
      .select('id, loja_id, provedor, ml_user_id, ml_nickname, ml_site_id, token_expira_em, status_conexao, sincronizar_estoque_automatico, importar_pedidos_automatico, taxa_comissao_padrao_percentual, taxa_fixa_padrao, ultima_sincronizacao_em, ultimo_erro_mensagem, criado_em, atualizado_em')
      .eq('loja_id', lojaId)
      .eq('provedor', 'mercadolivre')
      .maybeSingle();

    if (error) {
      console.error('[mercadoLivreService] Erro ao buscar conta ML:', error.message);
      return null;
    }

    return (data as MarketplaceContaLoja) || null;
  },

  /**
   * Solicita a URL oficial de consentimento OAuth 2.0 à Edge Function ml-oauth
   */
  async obterUrlAutorizacao(lojaId: string): Promise<string> {
    const session = await obterSessaoValida();

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const resposta = await fetch(`${supabaseUrl}/functions/v1/ml-oauth?action=authorize_url&loja_id=${lojaId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!resposta.ok) {
      const erroJson = await resposta.json().catch(() => ({}));
      throw new Error(erroJson.error || 'Falha ao gerar link de conexão do Mercado Livre.');
    }

    const resJson = await resposta.json();
    if (!resJson?.url) {
      throw new Error('URL de autorização não retornada pelo servidor.');
    }

    return resJson.url;
  },

  /**
   * Finaliza o fluxo OAuth trocando o authorization code recebido na URL de retorno
   */
  async processarCallbackCodigo(code: string, state: string): Promise<MarketplaceContaLoja> {
    const session = await obterSessaoValida().catch(() => null);
    const { data, error } = await supabase.functions.invoke('ml-oauth', {
      body: { code, state },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });

    if (error || !data?.sucesso) {
      throw new Error(data?.error || error?.message || 'Falha ao autorizar conexão com o Mercado Livre.');
    }

    return data.conta as MarketplaceContaLoja;
  },

  /**
   * Desconecta a conta do Mercado Livre da loja ativa
   */
  async desconectarConta(lojaId: string): Promise<void> {
    const session = await obterSessaoValida().catch(() => null);
    const { data, error } = await supabase.functions.invoke('ml-oauth', {
      body: { action: 'disconnect', loja_id: lojaId },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });

    if (error || !data?.sucesso) {
      // Fallback direto via Supabase Client caso a Edge Function não esteja disponível
      const { error: erroUpdate } = await supabase
        .from('marketplace_contas')
        .update({
          status_conexao: 'desconectado',
          ultimo_erro_mensagem: 'Desconectado manualmente pelo usuário.',
        })
        .eq('loja_id', lojaId)
        .eq('provedor', 'mercadolivre');

      if (erroUpdate) {
        throw new Error('Não foi possível desconectar a conta. Tente novamente.');
      }
    }
  },

  /**
   * Atualiza as configurações de sincronização da conta
   */
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
      .eq('provedor', 'mercadolivre');

    if (error) {
      throw new Error('Erro ao salvar preferências do Mercado Livre.');
    }
  },

  /**
   * Lista os anúncios vinculados aos produtos desta loja
   */
  async listarAnuncios(lojaId: string): Promise<MarketplaceAnuncioItem[]> {
    const { data, error } = await supabase
      .from('marketplace_anuncios')
      .select('*')
      .eq('loja_id', lojaId)
      .order('criado_em', { ascending: false });

    if (error) {
      console.error('[mercadoLivreService] Erro ao listar anúncios:', error.message);
      return [];
    }

    return (data as MarketplaceAnuncioItem[]) || [];
  },

  /**
   * Vincula um anúncio existente do Mercado Livre via código MLB... ao produto do HUBI
   */
  async vincularAnuncioExistente(params: {
    lojaId: string;
    produtoId: string;
    variacaoId?: string | null;
    mlItemId: string;
  }): Promise<{ sucesso: boolean; mensagem: string }> {
    const { data, error } = await supabase.functions.invoke('ml-estoque-sync', {
      body: {
        action: 'link_existing',
        loja_id: params.lojaId,
        produto_id: params.produtoId,
        variacao_id: params.variacaoId,
        ml_item_id: params.mlItemId,
      },
    });

    if (error || !data?.sucesso) {
      throw new Error(data?.error || error?.message || 'Falha ao vincular anúncio do Mercado Livre.');
    }

    return data;
  },

  /**
   * Publica um novo anúncio no Mercado Livre a partir do payload GDM gerado
   */
  async criarAnuncio(params: {
    lojaId: string;
    produtoId: string;
    variacaoId?: string | null;
    payloadMl: any;
    margemSobrepreco?: number;
  }): Promise<{ sucesso: boolean; mensagem: string; item: any }> {
    const { data, error } = await supabase.functions.invoke('ml-estoque-sync', {
      body: {
        action: 'create_listing',
        loja_id: params.lojaId,
        produto_id: params.produtoId,
        variacao_id: params.variacaoId,
        payload_ml: params.payloadMl,
        margem_sobrepreco: params.margemSobrepreco,
      },
    });

    if (error || !data?.sucesso) {
      throw new Error(data?.error || error?.message || 'Falha ao publicar anúncio no Mercado Livre.');
    }

    return data;
  },

  /**
   * Dispara a sincronização de estoque no Mercado Livre para um produto específico (assíncrono)
   */
  async sincronizarEstoqueProduto(lojaId: string, produtoId: string): Promise<void> {
    try {
      await supabase.functions.invoke('ml-estoque-sync', {
        body: {
          action: 'sync_inventory',
          loja_id: lojaId,
          produto_id: produtoId,
        },
      });
    } catch (err: any) {
      console.warn('[mercadoLivreService] Aviso ao disparar sincronização pós-venda:', err?.message);
    }
  },

  /**
   * Baixa a etiqueta oficial do Mercado Envios em PDF e abre em nova aba para impressão
   */
  async imprimirEtiquetaPedido(pedidoId: string): Promise<void> {
    const session = await obterSessaoValida();

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const resposta = await fetch(`${supabaseUrl}/functions/v1/ml-etiquetas?pedido_id=${pedidoId}&formato=pdf`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!resposta.ok) {
      const erroJson = await resposta.json().catch(() => ({}));
      throw new Error(erroJson.error || 'Falha ao obter etiqueta do Mercado Envios.');
    }

    const blob = await resposta.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  },
};
