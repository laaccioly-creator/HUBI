-- ==============================================================================
-- MIGRAÇÃO: FUNÇÃO DE SINCRONIZAÇÃO DE HORÁRIO OFICIAL DO SERVIDOR
-- HUBI SISTEMA - 2026
-- ==============================================================================

-- Cria ou substitui a função RPC para obter o horário oficial do PostgreSQL (Supabase)
CREATE OR REPLACE FUNCTION public.obter_horario_servidor()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT clock_timestamp();
$$;

-- Garante permissão de execução para usuários autenticados e anônimos (catálogo público/PDV)
GRANT EXECUTE ON FUNCTION public.obter_horario_servidor() TO authenticated, anon;

COMMENT ON FUNCTION public.obter_horario_servidor() IS 'Retorna o timestamp exato do relógio do servidor Supabase para sincronização de frontends.';

