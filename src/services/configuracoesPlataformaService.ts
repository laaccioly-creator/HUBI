// src/services/configuracoesPlataformaService.ts
// Gerencia a consulta e atualização dos parâmetros comerciais globais da plataforma HUBI (Super Admin)
// Governança: supabase-rls-guard (RLS protegida via eh_super_admin_plataforma) e anti-jsonb-linter

import { supabase } from '../lib/supabase';
import { ConfiguracoesPlataformaHubi } from '../types';

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
  email_super_admin: 'laaccioly@hotmail.com',
  custo_disparo_whatsapp: 0.15,
  valor_minimo_recarga_whatsapp: 10.00,
  credito_bonus_trial_whatsapp: 2.00,
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
        dias_trial: Number(data.dias_trial) || 7,
        valor_mensal_anual: Number(data.valor_mensal_anual) || 49.90,
        valor_anual_total: Number(data.valor_anual_total) || 598.80,
        valor_plano_mensal_avulso: Number(data.valor_plano_mensal_avulso) || 69.90,
        desconto_pix_percentual: Number(data.desconto_pix_percentual) || 5.00,
        aceita_cartao_debito: Boolean(data.aceita_cartao_debito),
        max_parcelas_cartao: Number(data.max_parcelas_cartao) || 12,
        parcelas_sem_juros: Number(data.parcelas_sem_juros) || 12,
        email_super_admin: data.email_super_admin || 'laaccioly@hotmail.com',
        custo_disparo_whatsapp: Number(data.custo_disparo_whatsapp ?? 0.15),
        valor_minimo_recarga_whatsapp: Number(data.valor_minimo_recarga_whatsapp ?? 10.00),
        credito_bonus_trial_whatsapp: Number(data.credito_bonus_trial_whatsapp ?? 2.00),
        atualizado_em: data.atualizado_em,
        atualizado_por: data.atualizado_por,
      };
    } catch (err) {
      console.error('[configuracoesPlataformaService] Erro inesperado ao obter parâmetros:', err);
      return CONFIG_PLATAFORMA_PADRAO;
    }
  },

  /**
   * Salva alterações nos parâmetros globais (restrito a Super Admin via RLS)
   */
  async salvarParametros(
    parametros: Partial<Omit<ConfiguracoesPlataformaHubi, 'id' | 'atualizado_em'>>
  ): Promise<ConfiguracoesPlataformaHubi> {
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      ...parametros,
      atualizado_em: new Date().toISOString(),
      atualizado_por: user?.id || null,
    };

    const { data, error } = await supabase
      .from('configuracoes_plataforma')
      .update(payload)
      .eq('id', 1)
      .select('*')
      .single();

    if (error) {
      console.error('[configuracoesPlataformaService] Erro ao salvar parâmetros:', error.message);
      throw new Error(error.message || 'Falha ao atualizar parâmetros globais da plataforma.');
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
      atualizado_em: data.atualizado_em,
      atualizado_por: data.atualizado_por,
    };
  },
};
