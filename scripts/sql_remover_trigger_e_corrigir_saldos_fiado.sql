-- ==============================================================================
-- CORREÇÃO DE SALDOS DE FIADO E REMOÇÃO DE TRIGGER PROBLEMÁTICA
-- Sistema HUBI - ERP / PDV
-- ==============================================================================

-- 1. REMOVER TRIGGER E FUNÇÃO QUE INSERIAM SALDO FIADO PARA PEDIDOS NÃO-FIADO
-- A trigger anterior adicionava indevidamente o total do pedido em 'saldo_devedor_fiado'
-- sempre que um pedido era criado com cliente, mesmo quando pago em dinheiro, cartão, pix ou orçamento.
DROP TRIGGER IF EXISTS trg_atualizar_saldo_fiado ON public.pedidos;
DROP FUNCTION IF EXISTS public.fn_atualizar_saldo_fiado_cliente();

-- 2. RECALCULAR O SALDO DEVEDOR DE FIADO DE TODOS OS CLIENTES
-- O saldo devedor de fiado de um cliente deve ser EXCLUSIVAMENTE a soma
-- das linhas de pagamento com 'eh_pagamento_fiado = TRUE' ou forma do tipo 'fiado',
-- pertencentes a pedidos não cancelados e com 'fiado_quitado = FALSE'.
UPDATE public.clientes c
SET saldo_devedor_fiado = COALESCE((
    SELECT SUM(pp.valor)
    FROM public.pagamentos_pedido pp
    JOIN public.pedidos p ON p.id = pp.pedido_id
    WHERE p.cliente_id = c.id
      AND p.status <> 'cancelado'
      AND p.fiado_quitado = FALSE
      AND (
          pp.eh_pagamento_fiado = TRUE 
          OR pp.forma_pagamento_id IN (
              SELECT fp.id FROM public.formas_pagamento fp WHERE fp.tipo = 'fiado'
          )
      )
), 0.00);
