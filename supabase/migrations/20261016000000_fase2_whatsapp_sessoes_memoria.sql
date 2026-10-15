-- Migration: 20261016000000_fase2_whatsapp_sessoes_memoria.sql
-- Fase 2: Gestão de Sessões, Histórico e Memória Contextual (WhatsApp IA)

-- 1. Tabela de Sessões de Atendimento
CREATE TABLE IF NOT EXISTS public.whatsapp_sessoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    numero_cliente VARCHAR(30) NOT NULL,
    status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'encerrado', 'pausado_humano')),
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Índices otimizados para busca de sessão ativa por loja e cliente
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessoes_busca 
ON public.whatsapp_sessoes (loja_id, numero_cliente, status, atualizado_em DESC);

-- Habilitar RLS e criar políticas com isolamento de tenant
ALTER TABLE public.whatsapp_sessoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_sessoes_loja_policy" ON public.whatsapp_sessoes;
CREATE POLICY "whatsapp_sessoes_loja_policy" ON public.whatsapp_sessoes
    FOR ALL
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));


-- 2. Tabela de Histórico de Mensagens da Sessão
CREATE TABLE IF NOT EXISTS public.whatsapp_mensagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sessao_id UUID NOT NULL REFERENCES public.whatsapp_sessoes(id) ON DELETE CASCADE,
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    origem VARCHAR(15) NOT NULL CHECK (origem IN ('user', 'model')),
    conteudo TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Índices otimizados para ordenação cronológica do histórico
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_sessao 
ON public.whatsapp_mensagens (sessao_id, criado_em ASC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_loja 
ON public.whatsapp_mensagens (loja_id, criado_em DESC);

-- Habilitar RLS e criar políticas com isolamento de tenant
ALTER TABLE public.whatsapp_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_mensagens_loja_policy" ON public.whatsapp_mensagens;
CREATE POLICY "whatsapp_mensagens_loja_policy" ON public.whatsapp_mensagens
    FOR ALL
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));
