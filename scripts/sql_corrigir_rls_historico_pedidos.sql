-- ==============================================================================
-- CORREÇÃO RLS: TABELA historico_pedidos
-- Permite inserção e consulta via cliente da aplicação
-- ==============================================================================

DROP POLICY IF EXISTS "historico_pedidos_loja_all" ON public.historico_pedidos;
DROP POLICY IF EXISTS "historico_pedidos_all" ON public.historico_pedidos;

CREATE POLICY "historico_pedidos_all" ON public.historico_pedidos 
FOR ALL USING (true) WITH CHECK (true);
