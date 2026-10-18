-- Migração: Desativação de Trigger Concorrente de Baixa de Estoque e Suporte a Sessões de Caixa no Export JSON
-- Data: 2026-10-18

-- ==============================================================================
-- 1. ELIMINAÇÃO DA TRIGGER DUPLICADA DE ESTOQUE (BUG DE BAIXA EM DOBRO)
-- Conforme especificado na Seção 4.9 da documentação, a autoridade única e
-- idempotente de movimentação e baixa de estoque é o EstoquePedidoService.ts,
-- orientado pela flag pedidos.estoque_baixado e auditoria em public.movimentacoes_estoque.
-- A trigger legada abaixo executava AFTER INSERT ON public.itens_pedido de forma cega,
-- causando decremento duplicado (2x) em cada venda do PDV.
-- ==============================================================================

DROP TRIGGER IF EXISTS trg_atualizar_estoque_ao_inserir_item ON public.itens_pedido;
DROP FUNCTION IF EXISTS public.fn_atualizar_estoque_pedido();

-- ==============================================================================
-- 2. FUNÇÃO RPC DE EXPORTAÇÃO JSON DE AUDITORIA (export_hubi_json)
-- Atualizada para ler as tabelas ativas 'sessoes_caixa' e 'movimentacoes_caixa'
-- e manter a chave 'caixas' preenchida com as sessões ativas para retrocompatibilidade.
-- ==============================================================================

DROP FUNCTION IF EXISTS public.export_hubi_json CASCADE;
DROP FUNCTION IF EXISTS public.export_hubi_json(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.export_hubi_json(p_loja_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resultado JSONB;
BEGIN
    -- Validação de segurança multi-tenant
    IF NOT public.usuario_pertence_loja(p_loja_id) AND NOT public.eh_super_admin_plataforma() THEN
        RAISE EXCEPTION 'Acesso negado aos dados da loja informada.';
    END IF;

    SELECT jsonb_build_object(
        'loja', (
            SELECT to_jsonb(l) FROM public.lojas l WHERE l.id = p_loja_id
        ),
        'usuarios_loja', (
            SELECT COALESCE(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
            FROM public.usuarios_loja u
            WHERE u.loja_id = p_loja_id
        ),
        'produtos', (
            SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
            FROM public.produtos p
            WHERE p.loja_id = p_loja_id
        ),
        'variacoes_produto', (
            SELECT COALESCE(jsonb_agg(to_jsonb(vp)), '[]'::jsonb)
            FROM public.variacoes_produto vp
            JOIN public.produtos p ON p.id = vp.produto_id
            WHERE p.loja_id = p_loja_id
        ),
        'pedidos', (
            SELECT COALESCE(jsonb_agg(to_jsonb(ped)), '[]'::jsonb)
            FROM public.pedidos ped
            WHERE ped.loja_id = p_loja_id
        ),
        'itens_pedido', (
            SELECT COALESCE(jsonb_agg(to_jsonb(ip)), '[]'::jsonb)
            FROM public.itens_pedido ip
            JOIN public.pedidos ped ON ped.id = ip.pedido_id
            WHERE ped.loja_id = p_loja_id
        ),
        'pagamentos_pedido', (
            SELECT COALESCE(jsonb_agg(to_jsonb(pp)), '[]'::jsonb)
            FROM public.pedidos_pagamentos_previstos pp
            JOIN public.pedidos ped ON ped.id = pp.pedido_id
            WHERE ped.loja_id = p_loja_id
        ),
        'sessoes_caixa', (
            SELECT COALESCE(jsonb_agg(to_jsonb(sc)), '[]'::jsonb)
            FROM public.sessoes_caixa sc
            WHERE sc.loja_id = p_loja_id
        ),
        'movimentacoes_caixa', (
            SELECT COALESCE(jsonb_agg(to_jsonb(mc)), '[]'::jsonb)
            FROM public.movimentacoes_caixa mc
            WHERE mc.loja_id = p_loja_id
        ),
        -- Alias 'caixas' retrocompatível mapeando as sessões de caixa para scripts legados
        'caixas', (
            SELECT COALESCE(jsonb_agg(to_jsonb(sc)), '[]'::jsonb)
            FROM public.sessoes_caixa sc
            WHERE sc.loja_id = p_loja_id
        ),
        'movimentacoes_estoque', (
            SELECT COALESCE(jsonb_agg(to_jsonb(me)), '[]'::jsonb)
            FROM public.movimentacoes_estoque me
            WHERE me.loja_id = p_loja_id
        ),
        'clientes', (
            SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
            FROM public.clientes c
            WHERE c.loja_id = p_loja_id
        ),
        'formas_pagamento', (
            SELECT COALESCE(jsonb_agg(to_jsonb(fp)), '[]'::jsonb)
            FROM public.formas_pagamento_loja fp
            WHERE fp.loja_id = p_loja_id
        ),
        'gerado_em', NOW()
    ) INTO v_resultado;

    RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION public.export_hubi_json(UUID) IS 'Exporta dados operacionais consolidados da loja em formato JSON para auditoria e conferência';
