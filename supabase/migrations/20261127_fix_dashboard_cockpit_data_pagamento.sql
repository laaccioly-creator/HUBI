-- ==============================================================================
-- Migration: 20261127_fix_dashboard_cockpit_data_pagamento.sql
-- Objetivo: Garantir que o Dashboard Executivo (Cockpit F1) contabilize todos
-- os pedidos efetivamente recebidos no período pela data real de pagamento
-- (pedidos.data_pagamento ou MAX(pagamentos_pedido.data_pagamento)), sem
-- exigir status = 'concluido'.
-- ==============================================================================

-- 1. Garantir coluna relacional tipada (TIMESTAMPTZ) e índice composto
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS data_pagamento TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_loja_data_pagamento
  ON public.pedidos(loja_id, data_pagamento);

-- 2. Backfill seguro para pedidos pagos que ainda estejam com data_pagamento NULL
UPDATE public.pedidos p
SET data_pagamento = COALESCE(
  (
    SELECT MAX(pp.data_pagamento)
    FROM public.pagamentos_pedido pp
    WHERE pp.pedido_id = p.id
      AND pp.data_pagamento IS NOT NULL
      AND COALESCE(pp.eh_pagamento_fiado, FALSE) = FALSE
      AND COALESCE(pp.eh_pagamento_caderneta, FALSE) = FALSE
  ),
  p.atualizado_em,
  p.data_venda,
  p.criado_em
)
WHERE p.status <> 'cancelado'
  AND p.status_pagamento = 'pago'
  AND p.data_pagamento IS NULL;

-- 3. Atualizar RPC public.obter_metricas_cockpit para Regime de Caixa Real
-- mantendo compatibilidade estrita de contrato JSONB e validação multitenant
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
    -- Validação obrigatória de isolamento multitenant
    IF NOT public.usuario_pertence_loja(p_loja_id) THEN
        RAISE EXCEPTION 'Acesso negado à loja informada';
    END IF;

    -- 1. Faturamento e Volume de Pedidos (Regime de Caixa Real, sem exigir status = 'concluido')
    SELECT
        COALESCE(
            SUM(
                CASE
                    WHEN p.status_pagamento = 'parcialmente_pago' THEN COALESCE(p.valor_pago, 0)
                    ELSE COALESCE(NULLIF(p.valor_pago, 0), p.valor_total, 0)
                END
            ),
            0
        ),
        COUNT(p.id)
    INTO v_faturamento, v_pedidos
    FROM public.pedidos p
    WHERE p.loja_id = p_loja_id
      AND p.status <> 'cancelado'
      AND (
          p.status_pagamento = 'pago'
          OR (p.status_pagamento = 'parcialmente_pago' AND COALESCE(p.valor_pago, 0) > 0)
      )
      AND COALESCE(
          p.data_pagamento,
          (
              SELECT MAX(pp.data_pagamento)
              FROM public.pagamentos_pedido pp
              WHERE pp.pedido_id = p.id
                AND pp.data_pagamento IS NOT NULL
                AND COALESCE(pp.eh_pagamento_fiado, FALSE) = FALSE
                AND COALESCE(pp.eh_pagamento_caderneta, FALSE) = FALSE
          ),
          p.data_venda,
          p.criado_em
      ) BETWEEN p_data_inicio AND p_data_fim;

    -- 2. Ticket Médio
    IF v_pedidos > 0 THEN
        v_ticket := ROUND(v_faturamento / v_pedidos, 2);
    END IF;

    -- 3. CMV e Lucro Líquido Real (mesmo recorte de recebimento real no período)
    SELECT COALESCE(SUM(ip.quantidade * COALESCE(ip.preco_custo_unitario, pr.preco_custo, 0)), 0)
    INTO v_cmv
    FROM public.itens_pedido ip
    JOIN public.produtos pr ON pr.id = ip.produto_id
    JOIN public.pedidos ped ON ped.id = ip.pedido_id
    WHERE ped.loja_id = p_loja_id
      AND ped.status <> 'cancelado'
      AND (
          ped.status_pagamento = 'pago'
          OR (ped.status_pagamento = 'parcialmente_pago' AND COALESCE(ped.valor_pago, 0) > 0)
      )
      AND COALESCE(
          ped.data_pagamento,
          (
              SELECT MAX(pp.data_pagamento)
              FROM public.pagamentos_pedido pp
              WHERE pp.pedido_id = ped.id
                AND pp.data_pagamento IS NOT NULL
                AND COALESCE(pp.eh_pagamento_fiado, FALSE) = FALSE
                AND COALESCE(pp.eh_pagamento_caderneta, FALSE) = FALSE
          ),
          ped.data_venda,
          ped.criado_em
      ) BETWEEN p_data_inicio AND p_data_fim;

    SELECT COALESCE(SUM(valor), 0)
    INTO v_despesas
    FROM public.transacoes_financeiras
    WHERE loja_id = p_loja_id
      AND (tipo = 'SAIDA' OR tipo ILIKE 'despesa%')
      AND status = 'pago'
      AND COALESCE(data_pagamento, criado_em) BETWEEN p_data_inicio AND p_data_fim;

    v_lucro := v_faturamento - v_cmv - v_despesas;

    -- 4. Inadimplência de Fiado (> 30 dias de atraso sobre total a receber de fiado)
    SELECT
        COALESCE(SUM(CASE WHEN data_vencimento_fiado < (p_data_fim::date - 30) THEN saldo_devedor ELSE 0 END), 0),
        COALESCE(SUM(saldo_devedor), 0)
    INTO v_fiado_vencido, v_fiado_total
    FROM public.pedidos
    WHERE loja_id = p_loja_id
      AND status <> 'cancelado'
      AND saldo_devedor > 0
      AND status_pagamento <> 'pago';

    IF v_fiado_total > 0 THEN
        v_inadimplencia := ROUND((v_fiado_vencido / v_fiado_total) * 100, 2);
    ELSE
        v_inadimplencia := 0;
    END IF;

    -- 5. Giro de Estoque (Saídas de Venda vs Valor Total em Estoque)
    v_venda_saidas := v_faturamento;
    SELECT COALESCE(SUM(COALESCE(quantidade_estoque, estoque_atual, 0) * COALESCE(preco_venda_varejo, preco_venda, 0)), 0)
    INTO v_estoque_atual
    FROM public.produtos
    WHERE loja_id = p_loja_id
      AND ativo = true
      AND COALESCE(tipo_item, 'produto') <> 'servico';

    IF v_estoque_atual > 0 THEN
        v_giro := ROUND((v_venda_saidas / v_estoque_atual) * 100, 2);
    ELSE
        v_giro := 0;
    END IF;

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
