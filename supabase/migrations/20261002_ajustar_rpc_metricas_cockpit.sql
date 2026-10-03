-- Migration: 20261002_ajustar_rpc_metricas_cockpit.sql
-- Aprimoramento da RPC obter_metricas_cockpit para suportar data_venda retroativa/simulada e status operacionais

CREATE OR REPLACE FUNCTION public.obter_metricas_cockpit(
    p_loja_id UUID,
    p_data_inicio TIMESTAMPTZ,
    p_data_fim TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    -- Considera data_venda (prioritária para PDV/retroativo) ou criado_em
    SELECT 
        COALESCE(SUM(COALESCE(valor_pago, valor_total, 0)), 0),
        COUNT(id)
    INTO v_faturamento, v_pedidos
    FROM public.pedidos
    WHERE loja_id = p_loja_id
      AND status NOT IN ('cancelado')
      AND (
          status = 'concluido'
          OR status_pagamento IN ('pago', 'parcial', 'parcialmente_pago')
          OR origem_venda IN ('pdv_mobile', 'pdv_desktop')
          OR status != 'pendente'
      )
      AND COALESCE(data_venda, criado_em) BETWEEN p_data_inicio AND p_data_fim;

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
      AND (
          ped.status = 'concluido'
          OR ped.status_pagamento IN ('pago', 'parcial', 'parcialmente_pago')
          OR ped.origem_venda IN ('pdv_mobile', 'pdv_desktop')
          OR ped.status != 'pendente'
      )
      AND COALESCE(ped.data_venda, ped.criado_em) BETWEEN p_data_inicio AND p_data_fim;

    SELECT COALESCE(SUM(valor), 0)
    INTO v_despesas
    FROM public.transacoes_financeiras
    WHERE loja_id = p_loja_id
      AND (tipo = 'SAIDA' OR tipo ILIKE 'despesa%')
      AND status = 'pago'
      AND COALESCE(data_pagamento, data_vencimento, criado_em) BETWEEN p_data_inicio AND p_data_fim;

    v_lucro := v_faturamento - v_cmv - v_despesas;

    -- 4. Inadimplência de Fiado (> 30 dias de atraso sobre total a receber de fiado)
    -- Utiliza p_data_fim como referência temporal para cálculo de atraso
    SELECT 
        COALESCE(SUM(CASE WHEN data_vencimento < p_data_fim - INTERVAL '30 days' THEN saldo_devedor ELSE 0 END), 0),
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

    -- Compilação do resultado
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
