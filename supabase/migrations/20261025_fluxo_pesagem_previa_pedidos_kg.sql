-- Migration: Fluxo Parametrizável de Pedidos com Itens por Quilo / Pesagem Posterior
-- Data: 2026-10-25
-- Diretrizes: mantis-threat-model, mantis-patch, supabase-rls-guard, anti-jsonb-linter, pii-leak-detector

-- 1. ADICIONAR COLUNA RELACIONAL NA TABELA LOJAS
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS exigir_pesagem_previa_pagamento BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.lojas.exigir_pesagem_previa_pagamento IS 
  'Quando TRUE, pedidos no catálogo online com itens vendidos por quilo (kg) têm o pagamento bloqueado até o lojista aferir o peso real na balança.';

-- 2. ADICIONAR COLUNA QUANTIDADE_SOLICITADA NA TABELA ITENS_PEDIDO
ALTER TABLE public.itens_pedido
  ADD COLUMN IF NOT EXISTS quantidade_solicitada NUMERIC(12,3) NULL;

COMMENT ON COLUMN public.itens_pedido.quantidade_solicitada IS 
  'Quantidade/peso originalmente solicitado pelo cliente no pedido, preservando transparência comparativa contra a quantidade pesada final.';

-- Retroalimentar itens existentes que ainda não possuem quantidade_solicitada
UPDATE public.itens_pedido
SET quantidade_solicitada = quantidade
WHERE quantidade_solicitada IS NULL;

-- 3. VALIDAÇÃO DE CONSTRAINTS IDEMPOTENTE EM PEDIDOS E LOJA_WHATSAPP_TRANSACOES
DO $$
DECLARE
  v_con_name TEXT;
BEGIN
  -- Verificar se existe check constraint na coluna status_pagamento em public.pedidos
  FOR v_con_name IN (
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'pedidos'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status_pagamento%'
  ) LOOP
    EXECUTE 'ALTER TABLE public.pedidos DROP CONSTRAINT ' || quote_ident(v_con_name);
  END LOOP;

  -- Se aplicável, recriar constraint incluindo 'aguardando_pesagem'
  -- Permitindo os status oficiais do HUBI
  ALTER TABLE public.pedidos
    ADD CONSTRAINT chk_pedidos_status_pagamento
    CHECK (status_pagamento IN (
      'aguardando_pesagem',
      'aguardando_pagamento',
      'pago',
      'parcialmente_pago',
      'fiado',
      'caderneta',
      'cancelado'
    ));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN OTHERS THEN
    NULL;
END $$;

-- 4. RPC SECURITY DEFINER: OBTER DADOS SEGURA E SANITIZADA DO PEDIDO PARA PAGAMENTO NO CATÁLOGO
CREATE OR REPLACE FUNCTION public.obter_pedido_para_pagamento_catalogo(
  p_pedido_id UUID,
  p_slug_catalogo VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja_id UUID;
  v_pedido RECORD;
  v_itens JSONB;
  v_cliente RECORD;
  v_slug_limpo VARCHAR;
BEGIN
  v_slug_limpo := LOWER(TRIM(COALESCE(p_slug_catalogo, '')));

  -- 1. Validar que o slug corresponde a uma loja ativa existente
  SELECT id INTO v_loja_id
  FROM public.lojas
  WHERE LOWER(TRIM(slug_catalogo)) = v_slug_limpo
     OR id::text = v_slug_limpo
  LIMIT 1;

  IF v_loja_id IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'LOJA_NAO_ENCONTRADA',
      'mensagem', 'Loja não identificada pelo catálogo informado.'
    );
  END IF;

  -- 2. Buscar o pedido garantindo isolamento estrito de tenant (loja_id)
  SELECT
    p.id,
    p.numero_pedido,
    p.loja_id,
    p.cliente_id,
    p.status,
    p.status_pagamento,
    p.subtotal,
    p.subtotal_produtos,
    p.valor_frete,
    p.valor_desconto,
    p.valor_desconto_cupom,
    p.valor_total,
    p.saldo_devedor,
    p.cliente_nome_avulso,
    p.cliente_telefone_avulso,
    p.forma_pagamento_catalogo,
    p.criado_em,
    p.atualizado_em
  INTO v_pedido
  FROM public.pedidos p
  WHERE p.id = p_pedido_id AND p.loja_id = v_loja_id;

  IF v_pedido.id IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'PEDIDO_NAO_ENCONTRADO',
      'mensagem', 'Pedido não encontrado ou não pertence a esta unidade.'
    );
  END IF;

  -- 3. Obter dados seguros do cliente associado se houver (sem expor PII desnecessário)
  IF v_pedido.cliente_id IS NOT NULL THEN
    SELECT
      c.id,
      c.nome,
      c.permite_caderneta,
      COALESCE(c.saldo_devedor_caderneta, 0) AS saldo_devedor_caderneta,
      COALESCE(c.limite_credito_caderneta, 0) AS limite_credito_caderneta
    INTO v_cliente
    FROM public.clientes c
    WHERE c.id = v_pedido.cliente_id AND c.loja_id = v_loja_id;
  END IF;

  -- 4. Obter itens do pedido com histórico de pesagem e subtotais
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ip.id,
        'produto_id', ip.produto_id,
        'nome_produto', ip.nome_produto,
        'rotulo_variacao', ip.rotulo_variacao,
        'quantidade', ip.quantidade,
        'quantidade_solicitada', COALESCE(ip.quantidade_solicitada, ip.quantidade),
        'peso_solicitado_kg', ip.peso_solicitado_kg,
        'peso_real_kg', ip.peso_real_kg,
        'preco_venda_unitario', ip.preco_venda_unitario,
        'subtotal', ip.subtotal,
        'unidade_medida', ip.unidade_medida
      ) ORDER BY ip.criado_em ASC
    ),
    '[]'::jsonb
  )
  INTO v_itens
  FROM public.itens_pedido ip
  WHERE ip.pedido_id = v_pedido.id AND ip.loja_id = v_loja_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'pedido', jsonb_build_object(
      'id', v_pedido.id,
      'numero_pedido', v_pedido.numero_pedido,
      'loja_id', v_pedido.loja_id,
      'cliente_id', v_pedido.cliente_id,
      'status', v_pedido.status,
      'status_pagamento', v_pedido.status_pagamento,
      'subtotal', v_pedido.subtotal,
      'subtotal_produtos', v_pedido.subtotal_produtos,
      'valor_frete', v_pedido.valor_frete,
      'valor_desconto', v_pedido.valor_desconto,
      'valor_desconto_cupom', v_pedido.valor_desconto_cupom,
      'valor_total', v_pedido.valor_total,
      'saldo_devedor', v_pedido.saldo_devedor,
      'cliente_nome_avulso', v_pedido.cliente_nome_avulso,
      'cliente_telefone_avulso', v_pedido.cliente_telefone_avulso,
      'forma_pagamento_catalogo', v_pedido.forma_pagamento_catalogo,
      'criado_em', v_pedido.criado_em,
      'itens', v_itens,
      'cliente', CASE 
        WHEN v_cliente.id IS NOT NULL THEN jsonb_build_object(
          'id', v_cliente.id,
          'nome', v_cliente.nome,
          'permite_caderneta', COALESCE(v_cliente.permite_caderneta, false),
          'saldo_devedor_caderneta', v_cliente.saldo_devedor_caderneta,
          'limite_credito_caderneta', v_cliente.limite_credito_caderneta
        )
        ELSE NULL 
      END
    )
  );
END;
$$;

COMMENT ON FUNCTION public.obter_pedido_para_pagamento_catalogo(UUID, VARCHAR) IS 
  'Consulta segura e pública de dados de pedido para quitação online após separação/pesagem balança no catálogo.';

-- Conceder permissão de execução
GRANT EXECUTE ON FUNCTION public.obter_pedido_para_pagamento_catalogo(UUID, VARCHAR) TO anon;
GRANT EXECUTE ON FUNCTION public.obter_pedido_para_pagamento_catalogo(UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obter_pedido_para_pagamento_catalogo(UUID, VARCHAR) TO service_role;
