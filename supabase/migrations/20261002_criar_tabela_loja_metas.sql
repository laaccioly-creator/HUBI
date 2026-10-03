-- ==============================================================================
-- MIGRATION: 20261002_criar_tabela_loja_metas.sql
-- Módulo Cockpit Executivo F1: Tabela de Metas da Loja e Função RPC de Métricas
-- ==============================================================================

-- 1. TABELA public.loja_metas
CREATE TABLE IF NOT EXISTS public.loja_metas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    meta_faturamento NUMERIC(12, 2) NOT NULL DEFAULT 50000.00,
    meta_pedidos INTEGER NOT NULL DEFAULT 300,
    meta_lucro_liquido NUMERIC(12, 2) NOT NULL DEFAULT 15000.00,
    meta_ticket_medio NUMERIC(10, 2) NOT NULL DEFAULT 166.00,
    meta_inadimplencia_maxima NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    meta_giro_estoque NUMERIC(5, 2) NOT NULL DEFAULT 25.00,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_loja_metas_loja_id UNIQUE (loja_id)
);

-- Ativação estrita de Row Level Security (RLS)
ALTER TABLE public.loja_metas ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso Multitenant
DROP POLICY IF EXISTS "loja_metas_select_policy" ON public.loja_metas;
CREATE POLICY "loja_metas_select_policy"
    ON public.loja_metas
    FOR SELECT
    USING (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "loja_metas_insert_policy" ON public.loja_metas;
CREATE POLICY "loja_metas_insert_policy"
    ON public.loja_metas
    FOR INSERT
    WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "loja_metas_update_policy" ON public.loja_metas;
CREATE POLICY "loja_metas_update_policy"
    ON public.loja_metas
    FOR UPDATE
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "loja_metas_delete_policy" ON public.loja_metas;
CREATE POLICY "loja_metas_delete_policy"
    ON public.loja_metas
    FOR DELETE
    USING (public.usuario_pertence_loja(loja_id));

-- Trigger para atualização de timestamp
CREATE OR REPLACE FUNCTION public.fn_atualizar_timestamp_modificacao()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_loja_metas_updated_at ON public.loja_metas;
CREATE TRIGGER trg_loja_metas_updated_at
    BEFORE UPDATE ON public.loja_metas
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp_modificacao();

CREATE INDEX IF NOT EXISTS idx_loja_metas_loja_id ON public.loja_metas(loja_id);


-- 2. FUNÇÃO RPC: public.obter_metricas_cockpit
CREATE OR REPLACE FUNCTION public.obter_metricas_cockpit(
    p_loja_id UUID,
    p_data_inicio TIMESTAMPTZ,
    p_data_fim TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_resultado JSONB;
    v_faturamento NUMERIC(12,2) := 0;
    v_pedidos INTEGER := 0;
    v_ticket NUMERIC(10,2) := 0;
    v_cmv NUMERIC(12,2) := 0;
    v_despesas NUMERIC(12,2) := 0;
    v_lucro NUMERIC(12,2) := 0;
    v_fiado_vencido NUMERIC(12,2) := 0;
    v_fiado_total NUMERIC(12,2) := 0;
    v_inadimplencia NUMERIC(5,2) := 0;
    v_venda_saidas NUMERIC(12,2) := 0;
    v_estoque_atual NUMERIC(12,2) := 0;
    v_giro NUMERIC(5,2) := 0;
BEGIN
    -- Validação de isolamento multitenant
    IF NOT public.usuario_pertence_loja(p_loja_id) THEN
        RAISE EXCEPTION 'Acesso negado aos dados desta loja';
    END IF;

    -- 1. Faturamento e Volume de Pedidos
    SELECT 
        COALESCE(SUM(valor_total), 0),
        COUNT(id)
    INTO v_faturamento, v_pedidos
    FROM public.pedidos
    WHERE loja_id = p_loja_id
      AND status NOT IN ('cancelado')
      AND criado_em BETWEEN p_data_inicio AND p_data_fim;

    -- 2. Ticket Médio
    IF v_pedidos > 0 THEN
        v_ticket := ROUND(v_faturamento / v_pedidos, 2);
    END IF;

    -- 3. CMV e Lucro Líquido
    SELECT COALESCE(SUM(ip.quantidade * COALESCE(ip.preco_custo_unitario, p.preco_custo, 0)), 0)
    INTO v_cmv
    FROM public.itens_pedido ip
    JOIN public.produtos p ON p.id = ip.produto_id
    JOIN public.pedidos ped ON ped.id = ip.pedido_id
    WHERE ped.loja_id = p_loja_id
      AND ped.status NOT IN ('cancelado')
      AND ped.criado_em BETWEEN p_data_inicio AND p_data_fim;

    SELECT COALESCE(SUM(valor), 0)
    INTO v_despesas
    FROM public.transacoes_financeiras
    WHERE loja_id = p_loja_id
      AND (tipo = 'SAIDA' OR tipo ILIKE 'despesa%')
      AND status = 'pago'
      AND COALESCE(data_pagamento, data_vencimento, criado_em) BETWEEN p_data_inicio AND p_data_fim;

    v_lucro := v_faturamento - v_cmv - v_despesas;

    -- 4. Inadimplência de Fiado (> 30 dias de atraso sobre total a receber de fiado)
    SELECT 
        COALESCE(SUM(CASE WHEN data_vencimento < now() - INTERVAL '30 days' THEN saldo_devedor ELSE 0 END), 0),
        COALESCE(SUM(saldo_devedor), 0)
    INTO v_fiado_vencido, v_fiado_total
    FROM public.pedidos
    WHERE loja_id = p_loja_id
      AND status NOT IN ('cancelado')
      AND (forma_pagamento = 'fiado' OR saldo_devedor > 0)
      AND status_pagamento != 'pago';

    IF v_fiado_total > 0 THEN
        v_inadimplencia := ROUND((v_fiado_vencido / v_fiado_total) * 100, 2);
    ELSE
        v_inadimplencia := 0;
    END IF;

    -- 5. Giro de Estoque (Saídas de Venda vs Valor Total em Estoque)
    v_venda_saidas := v_faturamento;
    SELECT COALESCE(SUM(estoque_atual * preco_venda), 0)
    INTO v_estoque_atual
    FROM public.produtos
    WHERE loja_id = p_loja_id AND ativo = true;

    IF v_estoque_atual > 0 THEN
        v_giro := ROUND((v_venda_saidas / v_estoque_atual) * 100, 2);
    ELSE
        v_giro := 0;
    END IF;

    -- Objeto compilado
    v_resultado := jsonb_build_object(
        'faturamento', v_faturamento,
        'pedidos', v_pedidos,
        'ticket_medio', v_ticket,
        'cmv', v_cmv,
        'despesas', v_despesas,
        'lucro_liquido', v_lucro,
        'inadimplencia', v_inadimplencia,
        'giro_estoque', v_giro
    );

    RETURN v_resultado;
END;
$$;
