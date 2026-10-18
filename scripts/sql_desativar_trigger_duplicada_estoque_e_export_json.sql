-- Script: Desativação da Trigger Duplicada de Estoque e Atualização de export_hubi_json
-- Executar no SQL Editor do Supabase

-- 1. Remover a trigger legada que causava a baixa em dobro
DROP TRIGGER IF EXISTS trg_atualizar_estoque_ao_inserir_item ON public.itens_pedido;
DROP FUNCTION IF EXISTS public.fn_atualizar_estoque_pedido();

-- 2. Atualizar ou criar a função export_hubi_json com suporte a sessoes_caixa e movimentacoes_caixa
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
