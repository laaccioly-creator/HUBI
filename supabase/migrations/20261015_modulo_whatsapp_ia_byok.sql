-- ==============================================================================
-- Migração: Módulo de Atendimento Automático por WhatsApp com IA (BYOK + Meta Cloud API)
-- Data: 2026-10-15
-- Arquitetura: Multi-tenant BYOK com RLS e Normalização Relacional Estrita
-- ==============================================================================

-- 1. ADIÇÃO DE COLUNAS DE CONFIGURAÇÃO NA TABELA public.lojas
ALTER TABLE public.lojas 
ADD COLUMN IF NOT EXISTS ia_whatsapp_ativa BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS pausar_ao_atingir_limite BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS limite_mensal_alerta INTEGER DEFAULT 1000,
ADD COLUMN IF NOT EXISTS gemini_api_key TEXT,
ADD COLUMN IF NOT EXISTS meta_waba_id TEXT,
ADD COLUMN IF NOT EXISTS meta_phone_number_id TEXT,
ADD COLUMN IF NOT EXISTS meta_access_token TEXT,
ADD COLUMN IF NOT EXISTS meta_verify_token TEXT,
ADD COLUMN IF NOT EXISTS prompt_personalizado TEXT,
ADD COLUMN IF NOT EXISTS mensagem_pausa_humano TEXT;

COMMENT ON COLUMN public.lojas.ia_whatsapp_ativa IS 'Habilita ou desabilita o atendimento automático por IA no WhatsApp da loja';
COMMENT ON COLUMN public.lojas.pausar_ao_atingir_limite IS 'Pausa a IA automaticamente ao atingir o limite mensal de mensagens';
COMMENT ON COLUMN public.lojas.limite_mensal_alerta IS 'Limite mensal de mensagens contratado ou para auto-pausa (padrão 1000)';
COMMENT ON COLUMN public.lojas.gemini_api_key IS 'Chave de API Google Gemini BYOK do lojista';
COMMENT ON COLUMN public.lojas.meta_waba_id IS 'ID da Conta do WhatsApp Business (WABA) na Meta';
COMMENT ON COLUMN public.lojas.meta_phone_number_id IS 'ID do número de telefone configurado na Meta Cloud API';
COMMENT ON COLUMN public.lojas.meta_access_token IS 'Token de acesso permanente de sistema para envio via Meta Graph API';
COMMENT ON COLUMN public.lojas.meta_verify_token IS 'Token secreto para validação do handshake no Webhook da Meta';
COMMENT ON COLUMN public.lojas.prompt_personalizado IS 'Instruções e diretrizes de negócio personalizadas para o agente de IA';
COMMENT ON COLUMN public.lojas.mensagem_pausa_humano IS 'Mensagem enviada quando a IA é pausada e o cliente entra na fila humana';

-- Índice para busca rápida de loja pelo Phone Number ID recebido no Webhook da Meta
CREATE INDEX IF NOT EXISTS idx_lojas_meta_phone_number_id 
  ON public.lojas(meta_phone_number_id) 
  WHERE meta_phone_number_id IS NOT NULL;


-- 2. TABELA DE CONTROLE DE CONSUMO MENSAL (public.consumo_whatsapp)
CREATE TABLE IF NOT EXISTS public.consumo_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  mes_referencia VARCHAR(7) NOT NULL, -- Formato 'YYYY-MM' (ex: '2026-10')
  total_mensagens INTEGER NOT NULL DEFAULT 0,
  total_conversas_iniciadas INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_consumo_whatsapp_loja_mes UNIQUE (loja_id, mes_referencia)
);

CREATE INDEX IF NOT EXISTS idx_consumo_whatsapp_loja_mes 
  ON public.consumo_whatsapp(loja_id, mes_referencia);


-- 3. TABELA DE CONVERSAS DE WHATSAPP (public.conversas_whatsapp)
CREATE TABLE IF NOT EXISTS public.conversas_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  telefone_cliente VARCHAR(30) NOT NULL,
  nome_cliente VARCHAR(150),
  status VARCHAR(20) NOT NULL DEFAULT 'ia' CHECK (status IN ('ia', 'humano', 'finalizado')),
  ultima_mensagem_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_conversas_whatsapp_loja_telefone UNIQUE (loja_id, telefone_cliente)
);

CREATE INDEX IF NOT EXISTS idx_conversas_whatsapp_loja_status 
  ON public.conversas_whatsapp(loja_id, status);

CREATE INDEX IF NOT EXISTS idx_conversas_whatsapp_ultima_msg 
  ON public.conversas_whatsapp(loja_id, ultima_mensagem_em DESC);


-- 4. TABELA DE MENSAGENS DE WHATSAPP (public.mensagens_whatsapp)
CREATE TABLE IF NOT EXISTS public.mensagens_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES public.conversas_whatsapp(id) ON DELETE CASCADE,
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  remetente VARCHAR(20) NOT NULL CHECK (remetente IN ('cliente', 'ia', 'humano')),
  conteudo TEXT NOT NULL,
  message_id_meta VARCHAR(120), -- wamid único enviado pela Meta
  status_entrega VARCHAR(20) DEFAULT 'enviada',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trava de Idempotência: Garante que nenhuma mensagem da Meta seja processada ou inserida duas vezes
CREATE UNIQUE INDEX IF NOT EXISTS uq_mensagens_whatsapp_message_id_meta 
  ON public.mensagens_whatsapp (message_id_meta) 
  WHERE message_id_meta IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_conversa 
  ON public.mensagens_whatsapp(conversa_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_loja_data 
  ON public.mensagens_whatsapp(loja_id, created_at DESC);


-- 5. BLINDAGEM RLS & MULTI-TENANT (SUPABASE-RLS-GUARD)
ALTER TABLE public.consumo_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversas_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens_whatsapp ENABLE ROW LEVEL SECURITY;

-- Políticas para consumo_whatsapp
DROP POLICY IF EXISTS "consumo_whatsapp_select_policy" ON public.consumo_whatsapp;
CREATE POLICY "consumo_whatsapp_select_policy" ON public.consumo_whatsapp
  FOR SELECT USING (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "consumo_whatsapp_insert_policy" ON public.consumo_whatsapp;
CREATE POLICY "consumo_whatsapp_insert_policy" ON public.consumo_whatsapp
  FOR INSERT WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "consumo_whatsapp_update_policy" ON public.consumo_whatsapp;
CREATE POLICY "consumo_whatsapp_update_policy" ON public.consumo_whatsapp
  FOR UPDATE USING (public.usuario_pertence_loja(loja_id))
  WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "consumo_whatsapp_delete_policy" ON public.consumo_whatsapp;
CREATE POLICY "consumo_whatsapp_delete_policy" ON public.consumo_whatsapp
  FOR DELETE USING (public.usuario_pertence_loja(loja_id));

-- Políticas para conversas_whatsapp
DROP POLICY IF EXISTS "conversas_whatsapp_select_policy" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_select_policy" ON public.conversas_whatsapp
  FOR SELECT USING (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "conversas_whatsapp_insert_policy" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_insert_policy" ON public.conversas_whatsapp
  FOR INSERT WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "conversas_whatsapp_update_policy" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_update_policy" ON public.conversas_whatsapp
  FOR UPDATE USING (public.usuario_pertence_loja(loja_id))
  WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "conversas_whatsapp_delete_policy" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_delete_policy" ON public.conversas_whatsapp
  FOR DELETE USING (public.usuario_pertence_loja(loja_id));

-- Políticas para mensagens_whatsapp
DROP POLICY IF EXISTS "mensagens_whatsapp_select_policy" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_select_policy" ON public.mensagens_whatsapp
  FOR SELECT USING (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "mensagens_whatsapp_insert_policy" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_insert_policy" ON public.mensagens_whatsapp
  FOR INSERT WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "mensagens_whatsapp_update_policy" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_update_policy" ON public.mensagens_whatsapp
  FOR UPDATE USING (public.usuario_pertence_loja(loja_id))
  WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "mensagens_whatsapp_delete_policy" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_delete_policy" ON public.mensagens_whatsapp
  FOR DELETE USING (public.usuario_pertence_loja(loja_id));


-- 6. FUNÇÃO RPC ATÔMICA PARA INCREMENTO DE CONSUMO (CONCORRÊNCIA SEGURA)
CREATE OR REPLACE FUNCTION public.incrementar_consumo_whatsapp(
  p_loja_id UUID,
  p_mes VARCHAR(7),
  p_nova_conversa BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  total_mensagens INTEGER,
  total_conversas_iniciadas INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.consumo_whatsapp (loja_id, mes_referencia, total_mensagens, total_conversas_iniciadas, updated_at)
  VALUES (p_loja_id, p_mes, 1, CASE WHEN p_nova_conversa THEN 1 ELSE 0 END, NOW())
  ON CONFLICT (loja_id, mes_referencia)
  DO UPDATE SET
    total_mensagens = public.consumo_whatsapp.total_mensagens + 1,
    total_conversas_iniciadas = public.consumo_whatsapp.total_conversas_iniciadas + (CASE WHEN p_nova_conversa THEN 1 ELSE 0 END),
    updated_at = NOW()
  RETURNING public.consumo_whatsapp.total_mensagens, public.consumo_whatsapp.total_conversas_iniciadas;
END;
$$;
