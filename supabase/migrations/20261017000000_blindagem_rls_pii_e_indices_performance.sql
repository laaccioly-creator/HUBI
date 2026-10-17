-- ==============================================================================
-- SISTEMA HUBI - MIGRAÇÃO DE BLINDAGEM RLS, PROTEÇÃO DE PII E ÍNDICES COMPOSTOS
-- Versão: 20261017000000
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. REMOÇÃO DE POLÍTICAS PERMISSIVAS RESIDUAIS (USING TRUE) E BLINDAGEM MULTI-TENANT
-- ------------------------------------------------------------------------------

-- Tabela: cupons
DROP POLICY IF EXISTS "cupons_loja_all" ON public.cupons;
CREATE POLICY "cupons_isolamento_loja" ON public.cupons
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

-- Tabela: unidades_medida
DROP POLICY IF EXISTS "unidades_medida_all" ON public.unidades_medida;
CREATE POLICY "unidades_medida_isolamento_loja" ON public.unidades_medida
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

-- Tabela: movimentacoes_saldo_cliente
DROP POLICY IF EXISTS "movimentacoes_saldo_cliente_all" ON public.movimentacoes_saldo_cliente;
CREATE POLICY "movimentacoes_saldo_cliente_isolamento_loja" ON public.movimentacoes_saldo_cliente
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

-- Tabela: historico_pedidos
DROP POLICY IF EXISTS "historico_pedidos_all" ON public.historico_pedidos;
CREATE POLICY "historico_pedidos_isolamento_loja" ON public.historico_pedidos
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

-- Tabela: pedidos_pagamentos_previstos
DROP POLICY IF EXISTS "pedidos_pagamentos_previstos_all" ON public.pedidos_pagamentos_previstos;
CREATE POLICY "pedidos_pagamentos_previstos_isolamento_loja" ON public.pedidos_pagamentos_previstos
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

-- Tabela: sessoes_caixa
DROP POLICY IF EXISTS "sessoes_caixa_all" ON public.sessoes_caixa;
CREATE POLICY "sessoes_caixa_isolamento_loja" ON public.sessoes_caixa
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

-- Tabela: movimentacoes_caixa
DROP POLICY IF EXISTS "movimentacoes_caixa_all" ON public.movimentacoes_caixa;
CREATE POLICY "movimentacoes_caixa_isolamento_loja" ON public.movimentacoes_caixa
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

-- ------------------------------------------------------------------------------
-- 2. PROTEÇÃO DE PII NA TABELA DE CLIENTES (LGPD)
-- O catálogo público consome exclusivamente a RPC SECURITY DEFINER public.salvar_cliente_catalogo
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "catalogo_clientes_publico" ON public.clientes;
DROP POLICY IF EXISTS "catalogo_clientes_insert" ON public.clientes;
DROP POLICY IF EXISTS "catalogo_clientes_update" ON public.clientes;

-- Permite que usuários autenticados da loja acessem seus clientes normalmente
DROP POLICY IF EXISTS "clientes_loja_all" ON public.clientes;
CREATE POLICY "clientes_isolamento_loja" ON public.clientes
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

-- ------------------------------------------------------------------------------
-- 3. ÍNDICES COMPOSTOS DE ALTA PERFORMANCE (COCKPIT F1, FINANCEIRO, PEDIDOS)
-- ------------------------------------------------------------------------------

-- Pedidos ativos filtrados por loja e ordenados por data da venda
CREATE INDEX IF NOT EXISTS idx_pedidos_loja_datavenda_status
    ON public.pedidos(loja_id, data_venda DESC, status)
    WHERE status <> 'cancelado';

-- Movimentações de caixa (sangrias/despesas para Cockpit F1)
CREATE INDEX IF NOT EXISTS idx_movimentacoes_caixa_loja_tipo_criado
    ON public.movimentacoes_caixa(loja_id, tipo, criado_em DESC);

-- Transações financeiras pagas (DRE e receitas)
CREATE INDEX IF NOT EXISTS idx_transacoes_fin_loja_status_tipo_pag
    ON public.transacoes_financeiras(loja_id, status, tipo, data_pagamento DESC);

-- Itens de pedido para cálculo de CMV e Curva ABC
CREATE INDEX IF NOT EXISTS idx_itens_pedido_loja_pedido_produto
    ON public.itens_pedido(loja_id, pedido_id, produto_id);

-- Analisar tabelas para atualizar estatísticas do planejador PostgreSQL
ANALYZE public.pedidos;
ANALYZE public.itens_pedido;
ANALYZE public.movimentacoes_caixa;
ANALYZE public.transacoes_financeiras;
ANALYZE public.clientes;
