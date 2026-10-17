-- ==============================================================================
-- SISTEMA HUBI - MIGRAÇÃO DE OBSERVABILIDADE & LOGS DO SISTEMA
-- Versão: 20261017010000
-- ==============================================================================

-- 1. CRIAÇÃO DA TABELA RELACIONAL SISTEMA_LOGS (SEM JSONB GENÉRICO DE NEGÓCIO)
CREATE TABLE IF NOT EXISTS public.sistema_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
    organizacao_id UUID REFERENCES public.organizacoes(id) ON DELETE SET NULL,
    usuario_id UUID REFERENCES public.usuarios_loja(id) ON DELETE SET NULL,
    nivel VARCHAR(15) NOT NULL CHECK (nivel IN ('ERROR', 'WARN', 'FATAL', 'INFO')),
    origem VARCHAR(60) NOT NULL,
    contexto VARCHAR(120) NOT NULL,
    mensagem TEXT NOT NULL,
    codigo_erro VARCHAR(50),
    stack_trace TEXT,
    rota_url VARCHAR(255),
    dispositivo_info VARCHAR(255),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ÍNDICES DE PESQUISA E AUDITORIA TEMPORAL
CREATE INDEX IF NOT EXISTS idx_sistema_logs_loja_criado
    ON public.sistema_logs(loja_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_sistema_logs_nivel_criado
    ON public.sistema_logs(nivel, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_sistema_logs_origem_criado
    ON public.sistema_logs(origem, criado_em DESC);

-- 3. HABILITAÇÃO E POLÍTICAS DE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.sistema_logs ENABLE ROW LEVEL SECURITY;

-- Inserção permitida para operadores autenticados e rotas públicas da loja (Catálogo, Checkout, etc.)
CREATE POLICY "sistema_logs_insert" ON public.sistema_logs
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- Leitura estritamente restrita a gestores e administradores da própria loja
CREATE POLICY "sistema_logs_select_admin" ON public.sistema_logs
    FOR SELECT TO authenticated
    USING (loja_id IS NOT NULL AND public.eh_gerente_ou_admin(loja_id));

-- Proibição de UPDATE e DELETE por clientes (apenas expurgo via rotina agendada)
REVOKE UPDATE, DELETE ON public.sistema_logs FROM anon, authenticated;

-- 4. FUNÇÃO DE EXPURGO AUTOMÁTICO (RETENÇÃO ENXUTA DE 30 DIAS)
CREATE OR REPLACE FUNCTION public.expurgar_sistema_logs_antigos()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_removidos INTEGER;
BEGIN
    DELETE FROM public.sistema_logs
    WHERE criado_em < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS v_removidos = ROW_COUNT;
    RETURN v_removidos;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expurgar_sistema_logs_antigos() TO service_role;
