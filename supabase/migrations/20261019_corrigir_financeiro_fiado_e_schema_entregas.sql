-- ==============================================================================
-- Migration: Corrigir Financeiro de Vendas a Prazo (Fiado) e Sincronização de Schema em pedido_entregas
-- Data: 2026-10-19
-- ==============================================================================

-- 1. ASSEGURAR COLUNAS RELACIONAIS EM public.pedido_entregas
ALTER TABLE public.pedido_entregas
    ADD COLUMN IF NOT EXISTS app_entrega_id UUID NULL REFERENCES public.apps_entrega(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS transportadora_id UUID NULL REFERENCES public.transportadoras(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS codigo_corrida VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS cotacao_id TEXT NULL,
    ADD COLUMN IF NOT EXISTS nome_app VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS nome_transportadora VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS servico_correios VARCHAR(20) NULL,
    ADD COLUMN IF NOT EXISTS tipo_operacao VARCHAR(30) NULL,
    ADD COLUMN IF NOT EXISTS contato_entregador VARCHAR(50) NULL;

-- 2. ASSEGURAR COLUNA data_vencimento_fiado NA TABELA public.pedidos
ALTER TABLE public.pedidos
    ADD COLUMN IF NOT EXISTS data_vencimento_fiado DATE;

-- 3. ATUALIZAR TRIGGER FUNCTION public.fn_gerar_financeiro_pagamento()
-- Distingue pagamentos à vista de registros a prazo (Fiado), garantindo:
-- - Venda no Fiado gera transação com status = 'pendente' e data_pagamento = NULL
-- - Quitação real do fiado abate ou converte a pendência para status = 'pago'
CREATE OR REPLACE FUNCTION public.fn_gerar_financeiro_pagamento()
RETURNS TRIGGER AS $$
DECLARE
    v_data_vencimento_fiado DATE;
    v_numero_pedido BIGINT;
    v_transacao_pendente_id UUID;
    v_valor_pendente NUMERIC(12,2);
BEGIN
    -- Se for pagamento/registro a prazo (Fiado)
    IF NEW.eh_pagamento_fiado IS TRUE THEN
        -- Buscar data de vencimento acordada e número do pedido
        SELECT data_vencimento_fiado, numero_pedido
        INTO v_data_vencimento_fiado, v_numero_pedido
        FROM public.pedidos
        WHERE id = NEW.pedido_id;

        INSERT INTO public.transacoes_financeiras (
            loja_id,
            tipo,
            categoria,
            descricao,
            valor,
            data_vencimento,
            data_pagamento,
            status,
            pedido_id
        ) VALUES (
            NEW.loja_id,
            'ENTRADA',
            'Venda a Prazo (Fiado)',
            'Venda a Prazo (Fiado) - Pedido #' || COALESCE(v_numero_pedido::text, SUBSTRING(NEW.pedido_id::text, 1, 8)),
            NEW.valor_liquido,
            COALESCE(v_data_vencimento_fiado, (CURRENT_DATE + INTERVAL '30 days')::DATE),
            NULL,
            'pendente',
            NEW.pedido_id
        );
    ELSE
        -- Se for pagamento à vista ou quitação real do fiado
        -- Verificar se existe transação de fiado pendente associada a este pedido
        SELECT id, valor INTO v_transacao_pendente_id, v_valor_pendente
        FROM public.transacoes_financeiras
        WHERE pedido_id = NEW.pedido_id
          AND status = 'pendente'
          AND tipo = 'ENTRADA'
        LIMIT 1;

        IF v_transacao_pendente_id IS NOT NULL THEN
            IF NEW.valor_liquido >= v_valor_pendente THEN
                -- Quitação total da pendência
                UPDATE public.transacoes_financeiras
                SET status = 'pago',
                    data_pagamento = COALESCE(NEW.data_pagamento, NOW()),
                    categoria = 'Recebimento de Fiado',
                    atualizado_em = NOW()
                WHERE id = v_transacao_pendente_id;
            ELSE
                -- Quitação parcial: abate o valor da pendência
                UPDATE public.transacoes_financeiras
                SET valor = valor - NEW.valor_liquido,
                    atualizado_em = NOW()
                WHERE id = v_transacao_pendente_id;

                -- Registra a parcela quitada como transação paga
                INSERT INTO public.transacoes_financeiras (
                    loja_id,
                    tipo,
                    categoria,
                    descricao,
                    valor,
                    data_vencimento,
                    data_pagamento,
                    status,
                    pedido_id
                ) VALUES (
                    NEW.loja_id,
                    'ENTRADA',
                    'Recebimento de Fiado',
                    'Recebimento Parcial Fiado - Pedido #' || SUBSTRING(NEW.pedido_id::text, 1, 8),
                    NEW.valor_liquido,
                    CURRENT_DATE,
                    COALESCE(NEW.data_pagamento, NOW()),
                    'pago',
                    NEW.pedido_id
                );
            END IF;
        ELSE
            -- Pagamento imediato comum (Dinheiro, PIX, Cartão, etc.)
            INSERT INTO public.transacoes_financeiras (
                loja_id,
                tipo,
                categoria,
                descricao,
                valor,
                data_vencimento,
                data_pagamento,
                status,
                pedido_id
            ) VALUES (
                NEW.loja_id,
                'ENTRADA',
                'Venda',
                'Recebimento Pedido #' || NEW.pedido_id,
                NEW.valor_liquido,
                CURRENT_DATE,
                COALESCE(NEW.data_pagamento, NOW()),
                'pago',
                NEW.pedido_id
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. LIMPEZA RETROATIVA SEGURA DE PEDIDOS NO FIADO NÃO QUITADOS
-- Corrige transações que foram geradas como 'pago' para pedidos no fiado em aberto (ex: Pedido #9)
UPDATE public.transacoes_financeiras tf
SET status = 'pendente',
    data_pagamento = NULL,
    categoria = 'Venda a Prazo (Fiado)',
    data_vencimento = COALESCE(p.data_vencimento_fiado, (tf.data_vencimento + INTERVAL '30 days')::DATE, (CURRENT_DATE + INTERVAL '30 days')::DATE),
    atualizado_em = NOW()
FROM public.pedidos p
WHERE tf.pedido_id = p.id
  AND p.saldo_devedor > 0
  AND p.valor_pago = 0
  AND tf.status = 'pago'
  AND tf.tipo = 'ENTRADA';

-- 5. RECARREGAR O SCHEMA CACHE DO POSTGREST
NOTIFY pgrst, 'reload schema';
