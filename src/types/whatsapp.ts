// Tipos e Interfaces para o Módulo de Atendimento Automático por WhatsApp com IA (BYOK + Meta Cloud API)

export type StatusConversaWhatsApp = 'ia' | 'humano' | 'finalizado';
export type RemetenteMensagemWhatsApp = 'cliente' | 'ia' | 'humano';

export interface ConsumoWhatsApp {
  id: string;
  loja_id: string;
  mes_referencia: string; // 'YYYY-MM'
  total_mensagens: number;
  total_conversas_iniciadas: number;
  created_at: string;
  updated_at: string;
}

export interface ConversaWhatsApp {
  id: string;
  loja_id: string;
  telefone_cliente: string;
  nome_cliente?: string | null;
  status: StatusConversaWhatsApp;
  ultima_mensagem_em: string;
  created_at: string;
  updated_at: string;
}

export interface MensagemWhatsApp {
  id: string;
  conversa_id: string;
  loja_id: string;
  remetente: RemetenteMensagemWhatsApp;
  conteudo: string;
  message_id_meta?: string | null;
  status_entrega?: string | null;
  created_at: string;
}

export interface WhatsAppConfigForm {
  ia_whatsapp_ativa: boolean;
  pausar_ao_atingir_limite: boolean;
  limite_mensal_alerta: number;
  gemini_api_key: string;
  meta_waba_id: string;
  meta_phone_number_id: string;
  meta_access_token: string;
  meta_verify_token: string;
  prompt_personalizado: string;
  mensagem_pausa_humano: string;
}
