// src/services/configuracoesPlataformaService.ts
// Gerencia a consulta e atualização dos parâmetros comerciais globais da plataforma HUBI (Super Admin)
// Governança: supabase-rls-guard (RLS protegida via eh_super_admin_plataforma) e anti-jsonb-linter

import { supabase } from '../lib/supabase';
import {
  SystemBillingValues,
  validarConfiguracaoCobrancaPlataforma,
} from '../lib/validations';
import { ConfiguracoesPlataformaHubi } from '../types';
import { DomainError, Result, err } from '../types/domain-contracts';

const COLUNAS_COBRANCA_PUBLICAS =
  'dias_trial, valor_mensal_anual, valor_anual_total, valor_plano_mensal_avulso, desconto_pix_percentual, aceita_cartao_debito, max_parcelas_cartao, parcelas_sem_juros';

let billingConfigCache: SystemBillingValues | null = null;
let billingConfigInFlight: Promise<Result<SystemBillingValues, DomainError>> | null = null;
const billingConfigListeners = new Set<() => void>();

const notificarListenersCobranca = () => {
  billingConfigListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Silencioso para não interromper outros assinantes
    }
  });
};

const toNumberSafe = (val: unknown, fallback: number): number => {
  if (val === null || val === undefined || val === '') return fallback;
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
};

export const CONFIG_PLATAFORMA_PADRAO: ConfiguracoesPlataformaHubi = {
  id: 1,
  dias_trial: 7,
  valor_mensal_anual: 49.90,
  valor_anual_total: 598.80,
  valor_plano_mensal_avulso: 69.90,
  desconto_pix_percentual: 5.00,
  aceita_cartao_debito: true,
  max_parcelas_cartao: 12,
  parcelas_sem_juros: 12,
  email_super_admin: '5585997374372@hubi.app',
  custo_disparo_whatsapp: 0.15,
  valor_minimo_recarga_whatsapp: 10.00,
  credito_bonus_trial_whatsapp: 2.00,
  meta_phone_number_id: null,
  meta_waba_id: null,
  meta_access_token: null,
  meta_verify_token: 'hubi_whatsapp_webhook_token',
  serpapi_key: null,
};

export const configuracoesPlataformaService = {
  /**
   * Obtém a linha singleton de parâmetros globais da plataforma HUBI
   */
  async obterParametros(): Promise<ConfiguracoesPlataformaHubi> {
    try {
      const { data, error } = await supabase
        .from('configuracoes_plataforma')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        console.warn('[configuracoesPlataformaService] Aviso ao buscar parâmetros, usando padrão:', error.message);
        return CONFIG_PLATAFORMA_PADRAO;
      }

      if (!data) {
        return CONFIG_PLATAFORMA_PADRAO;
      }

      return {
        id: data.id,
        dias_trial: toNumberSafe(data.dias_trial, 7),
        valor_mensal_anual: toNumberSafe(data.valor_mensal_anual, 49.90),
        valor_anual_total: toNumberSafe(data.valor_anual_total, 598.80),
        valor_plano_mensal_avulso: toNumberSafe(data.valor_plano_mensal_avulso, 69.90),
        desconto_pix_percentual: toNumberSafe(data.desconto_pix_percentual, 5.00),
        aceita_cartao_debito: Boolean(data.aceita_cartao_debito),
        max_parcelas_cartao: toNumberSafe(data.max_parcelas_cartao, 12),
        parcelas_sem_juros: toNumberSafe(data.parcelas_sem_juros, 12),
        email_super_admin: data.email_super_admin || '5585997374372@hubi.app',
        custo_disparo_whatsapp: toNumberSafe(data.custo_disparo_whatsapp, 0.15),
        valor_minimo_recarga_whatsapp: toNumberSafe(data.valor_minimo_recarga_whatsapp, 10.00),
        credito_bonus_trial_whatsapp: toNumberSafe(data.credito_bonus_trial_whatsapp, 2.00),
        meta_phone_number_id: data.meta_phone_number_id || null,
        meta_waba_id: data.meta_waba_id || null,
        meta_access_token: data.meta_access_token || null,
        meta_verify_token: data.meta_verify_token || 'hubi_whatsapp_webhook_token',
        serpapi_key: data.serpapi_key || null,
        atualizado_em: data.atualizado_em,
        atualizado_por: data.atualizado_por,
      };
    } catch (err) {
      console.error('[configuracoesPlataformaService] Erro inesperado ao obter parâmetros:', err);
      return CONFIG_PLATAFORMA_PADRAO;
    }
  },

  /**
   * Retorna o cache em memória já validado das configurações comerciais, caso exista.
   */
  obterCacheConfiguracaoCobranca(): SystemBillingValues | null {
    return billingConfigCache;
  },

  /**
   * Limpa o cache em memória das configurações comerciais (ex.: troca de sessão).
   */
  limparCacheConfiguracaoCobranca(): void {
    billingConfigCache = null;
    billingConfigInFlight = null;
  },

  /**
   * Permite que hooks/componentes assinem atualizações após edição pelo Super Admin.
   */
  assinarAtualizacoesConfiguracaoCobranca(listener: () => void): () => void {
    billingConfigListeners.add(listener);
    return () => {
      billingConfigListeners.delete(listener);
    };
  },

  /**
   * Obtém exclusivamente os parâmetros públicos de planos e condições de pagamento
   * diretamente do Supabase com validação de fronteira via Zod e deduplicação de requests.
   */
  async obterConfiguracaoCobranca(
    forcarAtualizacao = false
  ): Promise<Result<SystemBillingValues, DomainError>> {
    if (!forcarAtualizacao && billingConfigCache) {
      return { ok: true, data: billingConfigCache };
    }

    if (!forcarAtualizacao && billingConfigInFlight) {
      return billingConfigInFlight;
    }

    const requisicao = (async (): Promise<Result<SystemBillingValues, DomainError>> => {
      try {
        const { data, error } = await supabase
          .from('configuracoes_plataforma')
          .select(COLUNAS_COBRANCA_PUBLICAS)
          .eq('id', 1)
          .maybeSingle();

        if (error || !data) {
          return err({
            codigo: 'ERRO_PERSISTENCIA',
            mensagem: 'Não foi possível carregar os valores dos planos no momento.',
          });
        }

        const validado = validarConfiguracaoCobrancaPlataforma(data);
        if (validado.ok) {
          billingConfigCache = validado.data;
        }
        return validado;
      } catch {
        return err({
          codigo: 'ERRO_PERSISTENCIA',
          mensagem: 'Não foi possível carregar os valores dos planos no momento.',
        });
      } finally {
        billingConfigInFlight = null;
      }
    })();

    billingConfigInFlight = requisicao;
    return requisicao;
  },

  /**
   * Salva alterações nos parâmetros globais (restrito a Super Admin via RLS)
   */
  async salvarParametros(
    parametros: Partial<Omit<ConfiguracoesPlataformaHubi, 'id' | 'atualizado_em'>>
  ): Promise<ConfiguracoesPlataformaHubi> {
    const { data: { user } } = await supabase.auth.getUser();

    const payload: any = {
      ...parametros,
      atualizado_em: new Date().toISOString(),
      atualizado_por: user?.id || null,
    };

    // 1. Tenta UPDATE direto no registro singleton id = 1
    let { data, error } = await supabase
      .from('configuracoes_plataforma')
      .update(payload)
      .eq('id', 1)
      .select('*')
      .maybeSingle();

    // 2. Se falhar com erro de FK ou RLS relacionado ao atualizado_por, retenta sem o campo
    if (error && payload.atualizado_por) {
      delete payload.atualizado_por;
      const retry = await supabase
        .from('configuracoes_plataforma')
        .update(payload)
        .eq('id', 1)
        .select('*')
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    // 3. Fallback: se a linha ainda não existia no banco, executa upsert
    if (!data && !error) {
      const resUpsert = await supabase
        .from('configuracoes_plataforma')
        .upsert({ id: 1, ...payload }, { onConflict: 'id' })
        .select('*')
        .maybeSingle();
      data = resUpsert.data;
      error = resUpsert.error;
    }

    if (error) {
      console.error('[configuracoesPlataformaService] Erro ao salvar parâmetros:', error.message);
      throw new Error('Não foi possível salvar os parâmetros globais da plataforma. Verifique suas permissões ou tente novamente.');
    }

    this.limparCacheConfiguracaoCobranca();
    notificarListenersCobranca();

    if (!data) {
      return await this.obterParametros();
    }

    return {
      id: data.id,
      dias_trial: Number(data.dias_trial),
      valor_mensal_anual: Number(data.valor_mensal_anual),
      valor_anual_total: Number(data.valor_anual_total),
      valor_plano_mensal_avulso: Number(data.valor_plano_mensal_avulso),
      desconto_pix_percentual: Number(data.desconto_pix_percentual),
      aceita_cartao_debito: Boolean(data.aceita_cartao_debito),
      max_parcelas_cartao: Number(data.max_parcelas_cartao),
      parcelas_sem_juros: Number(data.parcelas_sem_juros),
      email_super_admin: data.email_super_admin,
      custo_disparo_whatsapp: Number(data.custo_disparo_whatsapp ?? 0.15),
      valor_minimo_recarga_whatsapp: Number(data.valor_minimo_recarga_whatsapp ?? 10.00),
      credito_bonus_trial_whatsapp: Number(data.credito_bonus_trial_whatsapp ?? 2.00),
      meta_phone_number_id: data.meta_phone_number_id || null,
      meta_waba_id: data.meta_waba_id || null,
      meta_access_token: data.meta_access_token || null,
      meta_verify_token: data.meta_verify_token || 'hubi_whatsapp_webhook_token',
      serpapi_key: data.serpapi_key || null,
      atualizado_em: data.atualizado_em,
      atualizado_por: data.atualizado_por,
    };
  },
};
