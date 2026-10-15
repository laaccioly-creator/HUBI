// Serviço de Frontend para Gestão e Conexão do Atendimento WhatsApp IA (BYOK + Meta Cloud API)
import { supabase } from '../lib/supabase';
import { ConsumoWhatsApp, WhatsAppConfigForm } from '../types/whatsapp';

/**
 * Testa a chave de API do Google Gemini informada pelo lojista (BYOK).
 * Realiza uma requisição leve com token reduzido para checar autenticidade e cota.
 */
export const testarConexaoGemini = async (apiKey: string): Promise<{ sucesso: boolean; mensagem: string }> => {
  const chaveLimpa = (apiKey || '').trim();
  if (!chaveLimpa) {
    return { sucesso: false, mensagem: 'Por favor, insira uma API Key válida do Google Gemini.' };
  }

  try {
    // Utiliza a rota oficial de listagem de modelos para validação imediata da chave sem gastar cota de geração
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${chaveLimpa}`;

    const resposta = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (resposta.ok) {
      return { sucesso: true, mensagem: 'Chave do Google Gemini validada com sucesso! Conexão ativa.' };
    }

    if (resposta.status === 400 || resposta.status === 403) {
      return { sucesso: false, mensagem: 'Chave de API inválida ou sem permissão. Verifique sua chave no Google AI Studio.' };
    }

    if (resposta.status === 429) {
      return { sucesso: false, mensagem: 'Cota de requisições excedida na API do Gemini. Tente novamente em instantes.' };
    }

    return { sucesso: false, mensagem: `Falha na verificação da chave (Status HTTP ${resposta.status}).` };
  } catch (error: any) {
    return { sucesso: false, mensagem: 'Não foi possível conectar aos servidores do Google Gemini. Verifique sua internet.' };
  }
};

/**
 * Testa a conectividade com a Meta Graph API utilizando o Phone Number ID e Access Token
 */
export const testarConexaoMeta = async (
  metaPhoneNumberId: string,
  metaAccessToken: string
): Promise<{ sucesso: boolean; mensagem: string }> => {
  const phoneId = (metaPhoneNumberId || '').trim();
  const token = (metaAccessToken || '').trim();

  if (!phoneId || !token) {
    return { sucesso: false, mensagem: 'Preencha o Phone Number ID e o Token de Acesso da Meta.' };
  }

  try {
    const url = `https://graph.facebook.com/v21.0/${phoneId}?fields=verified_name,code_verification_status,display_phone_number`;
    const resposta = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const dados = await resposta.json().catch(() => ({}));

    if (resposta.ok && dados.id) {
      const nomeExibicao = dados.verified_name || dados.display_phone_number || phoneId;
      return {
        sucesso: true,
        mensagem: `Conexão com a Meta realizada com sucesso! Número vinculado: ${nomeExibicao}`
      };
    }

    const mensagemErro = dados.error?.message || 'Falha na validação das credenciais da Meta Cloud API.';
    return { sucesso: false, mensagem: mensagemErro };
  } catch (error: any) {
    return { sucesso: false, mensagem: 'Erro de rede ao comunicar com os servidores da Meta.' };
  }
};

/**
 * Carrega os dados de consumo de mensagens da loja no mês corrente (YYYY-MM)
 */
export const carregarConsumoMesAtual = async (lojaId: string): Promise<ConsumoWhatsApp | null> => {
  if (!lojaId) return null;

  try {
    const mesAtual = new Date().toISOString().substring(0, 7); // '2026-10'
    const { data, error } = await supabase
      .from('consumo_whatsapp')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('mes_referencia', mesAtual)
      .maybeSingle();

    if (error) {
      console.warn('Erro ao carregar consumo de WhatsApp:', error.message);
      return null;
    }

    return data as ConsumoWhatsApp | null;
  } catch (err: any) {
    console.warn('Exceção ao consultar consumo de WhatsApp:', err?.message);
    return null;
  }
};

/**
 * Carrega as configurações de WhatsApp IA da loja
 */
export const carregarConfiguracoesWhatsApp = async (lojaId: string): Promise<WhatsAppConfigForm | null> => {
  if (!lojaId) return null;

  try {
    const { data, error } = await supabase
      .from('lojas')
      .select(`
        ia_whatsapp_ativa,
        pausar_ao_atingir_limite,
        limite_mensal_alerta,
        gemini_api_key,
        meta_waba_id,
        meta_phone_number_id,
        meta_access_token,
        meta_verify_token,
        prompt_personalizado,
        mensagem_pausa_humano
      `)
      .eq('id', lojaId)
      .maybeSingle();

    if (error) {
      console.error('[carregarConfiguracoesWhatsApp] Erro Supabase:', error);
      throw error;
    }

    if (!data) return null;

    return {
      ia_whatsapp_ativa: data.ia_whatsapp_ativa !== false,
      pausar_ao_atingir_limite: data.pausar_ao_atingir_limite === true,
      limite_mensal_alerta: data.limite_mensal_alerta || 1000,
      gemini_api_key: data.gemini_api_key || '',
      meta_waba_id: data.meta_waba_id || '',
      meta_phone_number_id: data.meta_phone_number_id || '',
      meta_access_token: data.meta_access_token || '',
      meta_verify_token: data.meta_verify_token || 'hubi_whatsapp_webhook_token',
      prompt_personalizado: data.prompt_personalizado || '',
      mensagem_pausa_humano: data.mensagem_pausa_humano || 'Nosso atendimento por inteligência artificial está temporariamente pausado. Um atendente da nossa equipe continuará seu atendimento por aqui em breve!'
    };
  } catch (err: any) {
    console.warn('Erro ao carregar configurações de WhatsApp IA:', err?.message || err);
    return null;
  }
};

/**
 * Salva as configurações de WhatsApp IA da loja no Supabase
 */
export const salvarConfiguracoesWhatsApp = async (
  lojaId: string,
  config: Partial<WhatsAppConfigForm>
): Promise<{ sucesso: boolean; erro?: string }> => {
  if (!lojaId) return { sucesso: false, erro: 'Identificador da loja ausente.' };

  try {
    const payload = {
      ia_whatsapp_ativa: config.ia_whatsapp_ativa ?? true,
      pausar_ao_atingir_limite: Boolean(config.pausar_ao_atingir_limite),
      limite_mensal_alerta: Number(config.limite_mensal_alerta) || 1000,
      gemini_api_key: config.gemini_api_key ? config.gemini_api_key.trim() : null,
      meta_waba_id: config.meta_waba_id ? config.meta_waba_id.trim() : null,
      meta_phone_number_id: config.meta_phone_number_id ? config.meta_phone_number_id.trim() : null,
      meta_access_token: config.meta_access_token ? config.meta_access_token.trim() : null,
      meta_verify_token: config.meta_verify_token ? config.meta_verify_token.trim() : 'hubi_whatsapp_webhook_token',
      prompt_personalizado: config.prompt_personalizado ? config.prompt_personalizado.trim() : null,
      mensagem_pausa_humano: config.mensagem_pausa_humano ? config.mensagem_pausa_humano.trim() : null,
      atualizado_em: new Date().toISOString()
    };

    const { error } = await supabase
      .from('lojas')
      .update(payload)
      .eq('id', lojaId);

    if (error) {
      console.error('[salvarConfiguracoesWhatsApp] Erro Supabase:', error);
      throw error;
    }

    return { sucesso: true };
  } catch (err: any) {
    return { sucesso: false, erro: err?.message || 'Falha ao salvar configurações.' };
  }
};
