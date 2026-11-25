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

const COLUNAS_OPERACIONAIS_LOJISTA =
  'id, dias_trial, valor_mensal_anual, valor_anual_total, valor_plano_mensal_avulso, desconto_pix_percentual, aceita_cartao_debito, max_parcelas_cartao, parcelas_sem_juros, email_super_admin, custo_disparo_whatsapp, valor_minimo_recarga_whatsapp, credito_bonus_trial_whatsapp, meta_phone_number_id, meta_waba_id, meta_access_token, meta_verify_token, mp_ambiente, mp_public_key, meta_hubi_faturamento, meta_hubi_vendas, meta_hubi_conversao_percentual, meta_hubi_max_nao_renovados, meta_hubi_lojas_ativas, meta_hubi_receita_whatsapp, atualizado_em, atualizado_por';

const COLUNAS_SUPER_ADMIN_COMPLETAS =
  `${COLUNAS_OPERACIONAIS_LOJISTA}, mp_access_token, mp_webhook_secret`;

const EMAIL_SUPER_ADMIN_MESTRE = '5585997374372@hubi.app';

export interface ResultadoSessaoSuperAdmin {
  autenticado: boolean;
  ehSuperAdmin: boolean;
  emailUsuario: string | null;
  emailMestre: string;
  motivo: 'ok' | 'sessao_ausente' | 'nao_autorizado';
}

export interface ResultadoParametrosSuperAdmin {
  dados: ConfiguracoesPlataformaHubi | null;
  origem: 'banco' | 'sessao_ausente' | 'nao_autorizado' | 'erro';
  emailMestre: string;
  emailUsuario: string | null;
  mensagemErro?: string;
}

export interface ResultadoTesteCredencialMp {
  sucesso: boolean;
  mensagem: string;
  nome?: string;
  email?: string;
  isTestUser?: boolean;
}

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

const mapearLinhaPlataforma = (
  data: any,
  incluirSegredosMp = false
): ConfiguracoesPlataformaHubi => ({
  id: data.id,
  dias_trial: toNumberSafe(data.dias_trial, 7),
  valor_mensal_anual: toNumberSafe(data.valor_mensal_anual, 49.90),
  valor_anual_total: toNumberSafe(data.valor_anual_total, 598.80),
  valor_plano_mensal_avulso: toNumberSafe(data.valor_plano_mensal_avulso, 69.90),
  desconto_pix_percentual: toNumberSafe(data.desconto_pix_percentual, 5.00),
  aceita_cartao_debito: Boolean(data.aceita_cartao_debito),
  max_parcelas_cartao: toNumberSafe(data.max_parcelas_cartao, 12),
  parcelas_sem_juros: toNumberSafe(data.parcelas_sem_juros, 12),
  email_super_admin: data.email_super_admin || EMAIL_SUPER_ADMIN_MESTRE,
  custo_disparo_whatsapp: toNumberSafe(data.custo_disparo_whatsapp, 0.15),
  valor_minimo_recarga_whatsapp: toNumberSafe(data.valor_minimo_recarga_whatsapp, 10.00),
  credito_bonus_trial_whatsapp: toNumberSafe(data.credito_bonus_trial_whatsapp, 2.00),
  meta_phone_number_id: data.meta_phone_number_id || null,
  meta_waba_id: data.meta_waba_id || null,
  meta_access_token: data.meta_access_token || null,
  meta_verify_token: data.meta_verify_token || 'hubi_whatsapp_webhook_token',
  mp_ambiente: data.mp_ambiente === 'producao' ? 'producao' : 'sandbox',
  mp_public_key: data.mp_public_key || null,
  mp_access_token: incluirSegredosMp ? (data.mp_access_token || null) : null,
  mp_webhook_secret: incluirSegredosMp ? (data.mp_webhook_secret || null) : null,
  meta_hubi_faturamento: toNumberSafe(data.meta_hubi_faturamento, 0.00),
  meta_hubi_vendas: toNumberSafe(data.meta_hubi_vendas, 0),
  meta_hubi_conversao_percentual: toNumberSafe(data.meta_hubi_conversao_percentual, 0.00),
  meta_hubi_max_nao_renovados: toNumberSafe(data.meta_hubi_max_nao_renovados, 0),
  meta_hubi_lojas_ativas: toNumberSafe(data.meta_hubi_lojas_ativas, 0),
  meta_hubi_receita_whatsapp: toNumberSafe(data.meta_hubi_receita_whatsapp, 0.00),
  atualizado_em: data.atualizado_em,
  atualizado_por: data.atualizado_por,
});

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
  email_super_admin: EMAIL_SUPER_ADMIN_MESTRE,
  custo_disparo_whatsapp: 0.15,
  valor_minimo_recarga_whatsapp: 10.00,
  credito_bonus_trial_whatsapp: 2.00,
  meta_phone_number_id: null,
  meta_waba_id: null,
  meta_access_token: null,
  meta_verify_token: 'hubi_whatsapp_webhook_token',
  mp_ambiente: 'sandbox',
  mp_public_key: null,
  mp_access_token: null,
  mp_webhook_secret: null,
  meta_hubi_faturamento: 0.00,
  meta_hubi_vendas: 0,
  meta_hubi_conversao_percentual: 0.00,
  meta_hubi_max_nao_renovados: 0,
  meta_hubi_lojas_ativas: 0,
  meta_hubi_receita_whatsapp: 0.00,
};

export const configuracoesPlataformaService = {
  /**
   * Obtém a linha singleton de parâmetros globais para lojistas comuns.
   * Nunca seleciona nem expõe `mp_access_token` ou `mp_webhook_secret`.
   */
  async obterParametros(): Promise<ConfiguracoesPlataformaHubi> {
    try {
      let { data, error } = await supabase
        .from('configuracoes_plataforma')
        .select(COLUNAS_OPERACIONAIS_LOJISTA)
        .eq('id', 1)
        .maybeSingle();

      if (error && error.message?.includes('column')) {
        const fallback = await supabase
          .from('configuracoes_plataforma')
          .select('*')
          .eq('id', 1)
          .maybeSingle();
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        console.warn('[configuracoesPlataformaService] Aviso ao buscar parâmetros, usando padrão:', error.message);
        return CONFIG_PLATAFORMA_PADRAO;
      }

      if (!data) {
        return CONFIG_PLATAFORMA_PADRAO;
      }

      return mapearLinhaPlataforma(data, false);
    } catch (err) {
      console.error('[configuracoesPlataformaService] Erro inesperado ao obter parâmetros:', err);
      return CONFIG_PLATAFORMA_PADRAO;
    }
  },

  /**
   * Aguarda a restauração da sessão do Supabase Auth (renovando JWT expirado quando possível)
   * e valida o e-mail autenticado contra `email_super_admin` na plataforma.
   */
  async garantirSessaoSuperAdmin(): Promise<ResultadoSessaoSuperAdmin> {
    try {
      let { data: { session } } = await supabase.auth.getSession();

      const expirandoOuExpirado = Boolean(
        session?.expires_at && session.expires_at * 1000 <= Date.now() + 60_000
      );

      if (!session || expirandoOuExpirado) {
        const { data: refreshed } = await supabase.auth.refreshSession().catch(() => ({
          data: { session: null },
        }));
        if (refreshed?.session) {
          session = refreshed.session;
        }
      }

      if (!session?.user) {
        return {
          autenticado: false,
          ehSuperAdmin: false,
          emailUsuario: null,
          emailMestre: EMAIL_SUPER_ADMIN_MESTRE,
          motivo: 'sessao_ausente',
        };
      }

      let emailMestre = EMAIL_SUPER_ADMIN_MESTRE;
      try {
        const { data: cfg } = await supabase
          .from('configuracoes_plataforma')
          .select('email_super_admin')
          .eq('id', 1)
          .maybeSingle();
        if (cfg?.email_super_admin) {
          emailMestre = String(cfg.email_super_admin).trim() || EMAIL_SUPER_ADMIN_MESTRE;
        }
      } catch {
        // Mantém fallback EMAIL_SUPER_ADMIN_MESTRE caso a leitura falhe
      }

      const emailUsuario = (session.user.email || '').toLowerCase().trim() || null;
      const ehSuperAdmin = Boolean(
        emailUsuario && emailUsuario === emailMestre.toLowerCase().trim()
      );

      return {
        autenticado: true,
        ehSuperAdmin,
        emailUsuario,
        emailMestre,
        motivo: ehSuperAdmin ? 'ok' : 'nao_autorizado',
      };
    } catch {
      return {
        autenticado: false,
        ehSuperAdmin: false,
        emailUsuario: null,
        emailMestre: EMAIL_SUPER_ADMIN_MESTRE,
        motivo: 'sessao_ausente',
      };
    }
  },

  /**
   * Obtém todos os parâmetros globais com diagnóstico explícito de sessão e autorização,
   * sem mascarar falhas de autenticação ou RLS com valores padrão hardcoded.
   */
  async obterParametrosSuperAdminDetalhado(): Promise<ResultadoParametrosSuperAdmin> {
    try {
      const verificacao = await this.garantirSessaoSuperAdmin();
      if (!verificacao.autenticado) {
        return {
          dados: null,
          origem: 'sessao_ausente',
          emailMestre: verificacao.emailMestre,
          emailUsuario: null,
          mensagemErro:
            'Sessão de autenticação expirada ou ausente neste dispositivo. Renove o login para carregar os parâmetros globais.',
        };
      }

      if (!verificacao.ehSuperAdmin) {
        return {
          dados: null,
          origem: 'nao_autorizado',
          emailMestre: verificacao.emailMestre,
          emailUsuario: verificacao.emailUsuario,
          mensagemErro: 'Acesso restrito ao Super Admin da plataforma Rubi.',
        };
      }

      let { data, error } = await supabase
        .from('configuracoes_plataforma')
        .select(COLUNAS_SUPER_ADMIN_COMPLETAS)
        .eq('id', 1)
        .maybeSingle();

      if (error && error.message?.includes('column')) {
        const fallback = await supabase
          .from('configuracoes_plataforma')
          .select('*')
          .eq('id', 1)
          .maybeSingle();
        data = fallback.data;
        error = fallback.error;
      }

      if (error || !data) {
        return {
          dados: null,
          origem: 'erro',
          emailMestre: verificacao.emailMestre,
          emailUsuario: verificacao.emailUsuario,
          mensagemErro: 'Não foi possível carregar os parâmetros globais da plataforma.',
        };
      }

      return {
        dados: mapearLinhaPlataforma(data, true),
        origem: 'banco',
        emailMestre: verificacao.emailMestre,
        emailUsuario: verificacao.emailUsuario,
      };
    } catch (err) {
      console.error('[configuracoesPlataformaService] Erro ao obter parâmetros Super Admin:', err);
      return {
        dados: null,
        origem: 'erro',
        emailMestre: EMAIL_SUPER_ADMIN_MESTRE,
        emailUsuario: null,
        mensagemErro: 'Erro inesperado ao consultar os parâmetros globais da plataforma.',
      };
    }
  },

  /**
   * Obtém todos os parâmetros globais (incluindo credenciais privadas do Mercado Pago)
   * exclusivamente quando o usuário autenticado for o Super Admin mestre.
   */
  async obterParametrosSuperAdmin(): Promise<ConfiguracoesPlataformaHubi> {
    const detalhe = await this.obterParametrosSuperAdminDetalhado();
    if (detalhe.dados) {
      return detalhe.dados;
    }
    if (detalhe.origem === 'nao_autorizado') {
      return await this.obterParametros();
    }
    return CONFIG_PLATAFORMA_PADRAO;
  },

  /**
   * Valida o Access Token do Mercado Pago da plataforma via Edge Function (com fallback /users/me).
   */
  async testarCredencialMercadoPago(
    accessToken: string,
    ambiente?: 'sandbox' | 'producao'
  ): Promise<ResultadoTesteCredencialMp> {
    const tokenLimpo = accessToken.trim();
    if (!tokenLimpo) {
      return {
        sucesso: false,
        mensagem: 'Informe o Access Token do Mercado Pago para validar a credencial.',
      };
    }

    try {
      const { data, error } = await supabase.functions.invoke('hubi-criar-assinatura-mp', {
        body: {
          action: 'testar_credencial',
          access_token: tokenLimpo,
          ambiente,
        },
      });

      if (!error && data && typeof data.sucesso === 'boolean') {
        return {
          sucesso: data.sucesso,
          mensagem: data.mensagem || (data.sucesso ? 'Credencial validada com sucesso.' : 'Credencial inválida.'),
          nome: data.nome,
          email: data.email,
          isTestUser: Boolean(data.is_test_user),
        };
      }
    } catch {
      // Continua para fallback direto caso a Edge Function ainda não tenha sido publicada com a ação de teste
    }

    try {
      const resp = await fetch('https://api.mercadopago.com/users/me', {
        headers: {
          Authorization: `Bearer ${tokenLimpo}`,
        },
      });

      if (!resp.ok) {
        return {
          sucesso: false,
          mensagem: `Credencial rejeitada pelo Mercado Pago (HTTP ${resp.status}). Verifique se o Access Token está correto.`,
        };
      }

      const meData = await resp.json();
      const nomeExibicao =
        [meData.first_name, meData.last_name].filter(Boolean).join(' ').trim() ||
        meData.nickname ||
        'Conta Mercado Pago';
      const emailConta = String(meData.email || '').trim();
      const tags: string[] = Array.isArray(meData.tags) ? meData.tags : [];
      const isTestUser =
        emailConta.toLowerCase().endsWith('@testuser.com') ||
        tags.includes('test_user') ||
        tokenLimpo.startsWith('TEST-');

      return {
        sucesso: true,
        nome: nomeExibicao,
        email: emailConta,
        isTestUser,
        mensagem: `Conta conectada: ${nomeExibicao}${emailConta ? ` (${emailConta})` : ''} • ${
          isTestUser ? 'Usuário de Teste / Sandbox' : 'Conta de Produção'
        }`,
      };
    } catch {
      return {
        sucesso: false,
        mensagem: 'Não foi possível comunicar com a API do Mercado Pago para validar o token.',
      };
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
      return await this.obterParametrosSuperAdmin();
    }

    return mapearLinhaPlataforma(data, true);
  },
};
