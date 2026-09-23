-- =========================================================================
-- MIGRATION: BLINDAGEM DE PEDIDOS CONCLUÍDOS E CANCELADOS (ANTI-REVERSÃO)
-- Regra de negócio:
-- 1. Um pedido com status 'concluido' (Venda) NUNCA pode ter seu status revertido
--    para 'enviado', 'entregue', 'aguardando_envio', 'confirmado' ou 'pendente'.
-- 2. A ÚNICA operação permitida sobre um pedido 'concluido' é o 'cancelado'.
-- 3. Pedidos com status 'cancelado' são estritamente imutáveis.
-- =========================================================================

-- 1. Função e Trigger no PostgreSQL para assegurar a blindagem a nível de banco
CREATE OR REPLACE FUNCTION public.fn_proteger_status_pedido()
RETURNS TRIGGER AS $$
BEGIN
    -- Se o pedido já estava 'concluido'
    IF OLD.status = 'concluido' THEN
        -- Se tentarem alterar para qualquer status que NÃO seja 'cancelado',
        -- o banco força a manutenção de 'concluido'
        IF NEW.status != 'concluido' AND NEW.status != 'cancelado' THEN
            NEW.status := 'concluido';
        END IF;
    END IF;

    -- Se o pedido já estava 'cancelado', ele é imutável
    IF OLD.status = 'cancelado' THEN
        NEW.status := 'cancelado';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proteger_status_pedido ON public.pedidos;
CREATE TRIGGER trg_proteger_status_pedido
    BEFORE UPDATE OF status ON public.pedidos
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_proteger_status_pedido();
