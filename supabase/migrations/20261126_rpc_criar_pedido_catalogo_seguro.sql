-- =============================================================================
-- MIGRATION: 20261126_rpc_criar_pedido_catalogo_seguro.sql
-- Onda 3 (Anti-REA-Shield Camada 04 - Zero-Trust Catálogo Online):
--   1. public.rpc_criar_pedido_catalogo_seguro: recálculo de preços, cupons,
--      frete e gravação atômica de pedidos + itens_pedido no servidor.
--   2. public.rpc_autenticar_cliente_catalogo: validação de senha_hash no
--      servidor sem trafegar hashes para o navegador.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. GARANTIA IDEMPOTENTE DAS COLUNAS RELACIONAIS DE PRECIFICAÇÃO
-- -----------------------------------------------------------------------------
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS desconto_padrao_atacado_percentual NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tipo_minimo_padrao_atacado VARCHAR(30) DEFAULT 'valor',
  ADD COLUMN IF NOT EXISTS qtd_minima_padrao_atacado NUMERIC(12,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_minimo_padrao_atacado NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qtd_minima_sku_padrao_atacado NUMERIC(12,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_padrao_autoatacado_percentual NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tipo_minimo_padrao_autoatacado VARCHAR(30) DEFAULT 'valor',
  ADD COLUMN IF NOT EXISTS qtd_minima_padrao_autoatacado NUMERIC(12,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_minimo_padrao_autoatacado NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qtd_minima_sku_padrao_autoatacado NUMERIC(12,3) DEFAULT 0;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tipo_minimo_atacado VARCHAR(30) DEFAULT 'quantidade',
  ADD COLUMN IF NOT EXISTS valor_minimo_atacado NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tipo_minimo_autoatacado VARCHAR(30) DEFAULT 'quantidade',
  ADD COLUMN IF NOT EXISTS valor_minimo_autoatacado NUMERIC(12,2) DEFAULT NULL;

-- -----------------------------------------------------------------------------
-- 1. RPC ANTI-FRAUDE DE CRIAÇÃO DE PEDIDO DO CATÁLOGO ONLINE
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_criar_pedido_catalogo_seguro(
  uuid, uuid[], uuid[], numeric[], uuid, text, uuid, uuid, numeric, numeric,
  boolean, text, text, boolean, text, date, text, text, text, text, text,
  text, text, text, text, timestamptz
);

CREATE OR REPLACE FUNCTION public.rpc_criar_pedido_catalogo_seguro(
  p_loja_id uuid,
  p_produto_ids uuid[],
  p_variacao_ids uuid[],
  p_quantidades numeric[],
  p_cliente_id uuid DEFAULT NULL,
  p_tabela_preco_solicitada text DEFAULT 'varejo',
  p_cupom_id uuid DEFAULT NULL,
  p_forma_entrega_id uuid DEFAULT NULL,
  p_valor_frete numeric DEFAULT 0,
  p_valor_taxa_domicilio numeric DEFAULT 0,
  p_levar_produto_no_atendimento boolean DEFAULT false,
  p_status_pagamento text DEFAULT 'aguardando_pagamento',
  p_forma_pagamento_catalogo text DEFAULT 'a_combinar',
  p_eh_venda_caderneta boolean DEFAULT false,
  p_ciclo_referencia_caderneta text DEFAULT NULL,
  p_data_vencimento_fiado date DEFAULT NULL,
  p_endereco_entrega text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_nome_transportadora text DEFAULT NULL,
  p_servico_correios text DEFAULT NULL,
  p_tipo_operacao text DEFAULT 'entrega',
  p_cliente_nome_avulso text DEFAULT NULL,
  p_cliente_telefone_avulso text DEFAULT NULL,
  p_cliente_documento_avulso text DEFAULT NULL,
  p_cliente_email_avulso text DEFAULT NULL,
  p_data_venda timestamptz DEFAULT now()
)
RETURNS TABLE (
  pedido_id uuid,
  numero_pedido bigint,
  subtotal numeric,
  valor_desconto numeric,
  valor_frete numeric,
  valor_total numeric,
  itens_ids uuid[]
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, security_audit
AS $$
DECLARE
  v_loja record;
  v_prod record;
  v_var record;
  v_cupom record;
  v_forma_entrega record;
  v_qtd_itens integer;
  v_idx integer;
  v_prod_id uuid;
  v_var_id uuid;
  v_qtd numeric;
  v_tabela_efetiva text;
  v_tabela_item text;
  v_atacado_ativo boolean;
  v_distribuidor_ativo boolean;
  v_criterio_atacado text;
  v_criterio_auto text;
  v_desc_atacado numeric(12,2) := 0;
  v_desc_auto numeric(12,2) := 0;
  v_qtd_min_atacado numeric(12,3) := 0;
  v_val_min_atacado numeric(12,2) := 0;
  v_sku_min_atacado numeric(12,3) := 0;
  v_qtd_min_auto numeric(12,3) := 0;
  v_val_min_auto numeric(12,2) := 0;
  v_sku_min_auto numeric(12,3) := 0;
  v_total_varejo numeric(12,2) := 0;
  v_total_pecas numeric(12,3) := 0;
  v_algum_sku_atacado boolean := false;
  v_algum_sku_auto boolean := false;
  v_elegivel_atacado boolean := false;
  v_elegivel_auto boolean := false;
  v_min_sku_item_atacado numeric(12,3) := 0;
  v_min_sku_item_auto numeric(12,3) := 0;
  v_preco_varejo numeric(12,2);
  v_preco_promo numeric(12,2);
  v_preco_explicit numeric(12,2);
  v_preco_unitario numeric(12,2);
  v_preco_custo numeric(12,2);
  v_subtotal_item numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_desconto_cupom numeric(12,2) := 0;
  v_cupom_codigo text := NULL;
  v_cupom_id_valido uuid := NULL;
  v_frete_gratis_cupom boolean := false;
  v_elegivel_frete_gratis_loja boolean := false;
  v_valor_frete numeric(12,2) := 0;
  v_valor_taxa_dom numeric(12,2) := 0;
  v_valor_total numeric(12,2) := 0;
  v_pedido_id uuid;
  v_numero_pedido bigint;
  v_item_id uuid;
  v_itens_ids uuid[] := ARRAY[]::uuid[];
  v_status_pagamento_seguro text;
  v_tipo_unidade text;
  v_unidade_medida text;
  v_eh_kg boolean;
  v_rotulo_variacao text;
  v_data_op timestamptz := COALESCE(p_data_venda, now());
BEGIN
  -- 1. Guarda de bloqueio Honeypot / Anti-REA
  IF EXISTS (
    SELECT 1
    FROM information_schema.routines
    WHERE routine_schema = 'security_audit'
      AND routine_name = 'ator_esta_bloqueado'
  ) THEN
    IF security_audit.ator_esta_bloqueado() THEN
      RAISE EXCEPTION 'Operação bloqueada por política de segurança.';
    END IF;
  END IF;

  IF p_loja_id IS NULL THEN
    RAISE EXCEPTION 'Identificador da loja é obrigatório.';
  END IF;

  -- 2. Validação da loja, catálogo ativo e regras relacionais de precificação
  SELECT
    l.id,
    l.aceita_pedidos_online,
    l.tipos_venda,
    l.frete_gratis_ativo,
    l.frete_gratis_valor_minimo,
    l.desconto_padrao_atacado_percentual,
    l.tipo_minimo_padrao_atacado,
    l.qtd_minima_padrao_atacado,
    l.valor_minimo_padrao_atacado,
    l.qtd_minima_sku_padrao_atacado,
    l.desconto_padrao_autoatacado_percentual,
    l.tipo_minimo_padrao_autoatacado,
    l.qtd_minima_padrao_autoatacado,
    l.valor_minimo_padrao_autoatacado,
    l.qtd_minima_sku_padrao_autoatacado
  INTO v_loja
  FROM public.lojas l
  WHERE l.id = p_loja_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loja não localizada.';
  END IF;

  IF COALESCE(v_loja.aceita_pedidos_online, true) = false THEN
    RAISE EXCEPTION 'Esta loja não está aceitando pedidos online no momento.';
  END IF;

  -- 3. Validação estrutural dos arrays de itens
  v_qtd_itens := COALESCE(array_length(p_produto_ids, 1), 0);
  IF v_qtd_itens <= 0 THEN
    RAISE EXCEPTION 'O carrinho precisa conter ao menos um item válido.';
  END IF;

  IF COALESCE(array_length(p_variacao_ids, 1), 0) <> v_qtd_itens
     OR COALESCE(array_length(p_quantidades, 1), 0) <> v_qtd_itens THEN
    RAISE EXCEPTION 'Parâmetros inconsistentes para os itens do pedido.';
  END IF;

  -- Determina modalidades comerciais ativas e normaliza critérios estritamente (> 0)
  v_atacado_ativo := COALESCE((v_loja.tipos_venda->>'atacado')::boolean, false);
  v_distribuidor_ativo := COALESCE(
    (v_loja.tipos_venda->>'distribuidor')::boolean,
    (v_loja.tipos_venda->>'autoatacado')::boolean,
    false
  );

  v_desc_atacado := GREATEST(COALESCE(v_loja.desconto_padrao_atacado_percentual, 0), 0);
  v_qtd_min_atacado := GREATEST(COALESCE(v_loja.qtd_minima_padrao_atacado, 0), 0);
  v_val_min_atacado := GREATEST(COALESCE(v_loja.valor_minimo_padrao_atacado, 0), 0);
  v_sku_min_atacado := GREATEST(COALESCE(v_loja.qtd_minima_sku_padrao_atacado, 0), 0);

  v_criterio_atacado := CASE
    WHEN NOT v_atacado_ativo THEN NULL
    WHEN LOWER(COALESCE(v_loja.tipo_minimo_padrao_atacado, '')) IN ('quantidade', 'quantidade_total') THEN
      CASE WHEN v_qtd_min_atacado > 0 THEN 'quantidade' ELSE NULL END
    WHEN LOWER(COALESCE(v_loja.tipo_minimo_padrao_atacado, '')) = 'valor' THEN
      CASE WHEN v_val_min_atacado > 0 THEN 'valor' ELSE NULL END
    WHEN LOWER(COALESCE(v_loja.tipo_minimo_padrao_atacado, '')) = 'minimo_sku' THEN 'minimo_sku'
    WHEN v_val_min_atacado > 0 THEN 'valor'
    WHEN v_qtd_min_atacado > 0 THEN 'quantidade'
    WHEN v_sku_min_atacado > 0 THEN 'minimo_sku'
    ELSE NULL
  END;

  v_desc_auto := GREATEST(COALESCE(v_loja.desconto_padrao_autoatacado_percentual, 0), 0);
  v_qtd_min_auto := GREATEST(COALESCE(v_loja.qtd_minima_padrao_autoatacado, 0), 0);
  v_val_min_auto := GREATEST(COALESCE(v_loja.valor_minimo_padrao_autoatacado, 0), 0);
  v_sku_min_auto := GREATEST(COALESCE(v_loja.qtd_minima_sku_padrao_autoatacado, 0), 0);

  v_criterio_auto := CASE
    WHEN NOT v_distribuidor_ativo THEN NULL
    WHEN LOWER(COALESCE(v_loja.tipo_minimo_padrao_autoatacado, '')) IN ('quantidade', 'quantidade_total') THEN
      CASE WHEN v_qtd_min_auto > 0 THEN 'quantidade' ELSE NULL END
    WHEN LOWER(COALESCE(v_loja.tipo_minimo_padrao_autoatacado, '')) = 'valor' THEN
      CASE WHEN v_val_min_auto > 0 THEN 'valor' ELSE NULL END
    WHEN LOWER(COALESCE(v_loja.tipo_minimo_padrao_autoatacado, '')) = 'minimo_sku' THEN 'minimo_sku'
    WHEN v_val_min_auto > 0 THEN 'valor'
    WHEN v_qtd_min_auto > 0 THEN 'quantidade'
    WHEN v_sku_min_auto > 0 THEN 'minimo_sku'
    ELSE NULL
  END;

  -- 4A. Primeira passada: valida catálogo e acumula total varejo + peças + elegibilidade SKU
  FOR v_idx IN 1..v_qtd_itens LOOP
    v_prod_id := p_produto_ids[v_idx];
    v_var_id := p_variacao_ids[v_idx];
    v_qtd := p_quantidades[v_idx];

    IF v_prod_id IS NULL OR v_qtd IS NULL OR v_qtd <= 0 THEN
      RAISE EXCEPTION 'Item inválido ou quantidade não positiva no pedido.';
    END IF;

    SELECT *
    INTO v_prod
    FROM public.produtos p
    WHERE p.id = v_prod_id
      AND p.loja_id = p_loja_id
      AND COALESCE(p.ativo, true) = true
      AND COALESCE(p.exibir_catalogo, true) = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Um dos produtos selecionados não está disponível no catálogo.';
    END IF;

    v_var := NULL;
    IF v_var_id IS NOT NULL THEN
      SELECT *
      INTO v_var
      FROM public.variacoes_produto vp
      WHERE vp.id = v_var_id
        AND vp.produto_id = v_prod.id
        AND vp.loja_id = p_loja_id
        AND COALESCE(vp.ativo, true) = true;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Uma das variações selecionadas não está mais disponível.';
      END IF;
    END IF;

    v_preco_varejo := COALESCE(
      CASE WHEN v_var.id IS NOT NULL THEN v_var.preco_venda_varejo ELSE NULL END,
      v_prod.preco_venda_varejo,
      0
    );

    v_total_varejo := v_total_varejo + (v_preco_varejo * v_qtd);
    v_total_pecas := v_total_pecas + v_qtd;

    IF v_criterio_atacado = 'minimo_sku' THEN
      v_min_sku_item_atacado := CASE
        WHEN v_prod.tipo_minimo_atacado = 'minimo_sku' AND COALESCE(v_prod.qtd_minima_atacado, 0) > 0 THEN v_prod.qtd_minima_atacado
        WHEN v_sku_min_atacado > 0 THEN v_sku_min_atacado
        ELSE 0
      END;
      IF v_min_sku_item_atacado > 0 AND v_qtd >= v_min_sku_item_atacado THEN
        v_algum_sku_atacado := true;
      END IF;
    END IF;

    IF v_criterio_auto = 'minimo_sku' THEN
      v_min_sku_item_auto := CASE
        WHEN v_prod.tipo_minimo_autoatacado = 'minimo_sku' AND COALESCE(v_prod.qtd_minima_autoatacado, 0) > 0 THEN v_prod.qtd_minima_autoatacado
        WHEN v_sku_min_auto > 0 THEN v_sku_min_auto
        ELSE 0
      END;
      IF v_min_sku_item_auto > 0 AND v_qtd >= v_min_sku_item_auto THEN
        v_algum_sku_auto := true;
      END IF;
    END IF;
  END LOOP;

  -- Determina a tabela efetiva exclusivamente no servidor (impede fraude via DevTools)
  v_elegivel_auto := v_distribuidor_ativo AND (
    (v_criterio_auto = 'valor' AND v_val_min_auto > 0 AND v_total_varejo >= v_val_min_auto) OR
    (v_criterio_auto = 'quantidade' AND v_qtd_min_auto > 0 AND v_total_pecas >= v_qtd_min_auto) OR
    (v_criterio_auto = 'minimo_sku' AND v_algum_sku_auto)
  );

  v_elegivel_atacado := v_atacado_ativo AND (
    (v_criterio_atacado = 'valor' AND v_val_min_atacado > 0 AND v_total_varejo >= v_val_min_atacado) OR
    (v_criterio_atacado = 'quantidade' AND v_qtd_min_atacado > 0 AND v_total_pecas >= v_qtd_min_atacado) OR
    (v_criterio_atacado = 'minimo_sku' AND v_algum_sku_atacado)
  );

  IF v_elegivel_auto THEN
    v_tabela_efetiva := 'autoatacado';
  ELSIF v_elegivel_atacado THEN
    v_tabela_efetiva := 'atacado';
  ELSE
    v_tabela_efetiva := 'varejo';
  END IF;

  -- 4B. Segunda passada de cálculo: soma subtotal autoritativo aplicando a tabela efetiva
  FOR v_idx IN 1..v_qtd_itens LOOP
    v_prod_id := p_produto_ids[v_idx];
    v_var_id := p_variacao_ids[v_idx];
    v_qtd := p_quantidades[v_idx];

    SELECT * INTO v_prod FROM public.produtos p WHERE p.id = v_prod_id AND p.loja_id = p_loja_id;
    v_var := NULL;
    IF v_var_id IS NOT NULL THEN
      SELECT * INTO v_var FROM public.variacoes_produto vp WHERE vp.id = v_var_id AND vp.produto_id = v_prod.id AND vp.loja_id = p_loja_id;
    END IF;

    v_preco_varejo := COALESCE(
      CASE WHEN v_var.id IS NOT NULL THEN v_var.preco_venda_varejo ELSE NULL END,
      v_prod.preco_venda_varejo,
      0
    );
    v_preco_promo := CASE
      WHEN v_var.id IS NOT NULL AND COALESCE(v_var.preco_promocional, 0) > 0 THEN v_var.preco_promocional
      WHEN COALESCE(v_prod.promocao_ativa, false) = true AND COALESCE(v_prod.preco_promocional, 0) > 0 THEN v_prod.preco_promocional
      ELSE NULL
    END;

    v_tabela_item := v_tabela_efetiva;
    IF v_criterio_auto = 'minimo_sku' OR v_criterio_atacado = 'minimo_sku' THEN
      v_min_sku_item_auto := CASE
        WHEN v_criterio_auto = 'minimo_sku' AND v_prod.tipo_minimo_autoatacado = 'minimo_sku' AND COALESCE(v_prod.qtd_minima_autoatacado, 0) > 0 THEN v_prod.qtd_minima_autoatacado
        WHEN v_criterio_auto = 'minimo_sku' AND v_sku_min_auto > 0 THEN v_sku_min_auto
        ELSE 0
      END;
      v_min_sku_item_atacado := CASE
        WHEN v_criterio_atacado = 'minimo_sku' AND v_prod.tipo_minimo_atacado = 'minimo_sku' AND COALESCE(v_prod.qtd_minima_atacado, 0) > 0 THEN v_prod.qtd_minima_atacado
        WHEN v_criterio_atacado = 'minimo_sku' AND v_sku_min_atacado > 0 THEN v_sku_min_atacado
        ELSE 0
      END;

      IF v_distribuidor_ativo AND v_criterio_auto = 'minimo_sku' AND v_min_sku_item_auto > 0 AND v_qtd >= v_min_sku_item_auto THEN
        v_tabela_item := 'autoatacado';
      ELSIF v_atacado_ativo AND v_criterio_atacado = 'minimo_sku' AND v_min_sku_item_atacado > 0 AND v_qtd >= v_min_sku_item_atacado THEN
        IF v_tabela_item <> 'autoatacado' THEN v_tabela_item := 'atacado'; END IF;
      ELSIF v_tabela_item = 'autoatacado' AND v_criterio_auto = 'minimo_sku' THEN
        v_tabela_item := CASE WHEN v_atacado_ativo AND v_criterio_atacado <> 'minimo_sku' AND v_elegivel_atacado THEN 'atacado' ELSE 'varejo' END;
      ELSIF v_tabela_item = 'atacado' AND v_criterio_atacado = 'minimo_sku' THEN
        v_tabela_item := 'varejo';
      END IF;
    END IF;

    IF v_tabela_item = 'autoatacado' THEN
      v_preco_explicit := COALESCE(
        NULLIF(CASE WHEN v_var.id IS NOT NULL THEN v_var.preco_venda_autoatacado ELSE NULL END, 0),
        NULLIF(v_prod.preco_venda_autoatacado, 0)
      );
      IF v_preco_explicit IS NOT NULL THEN
        v_preco_unitario := v_preco_explicit;
      ELSIF v_desc_auto > 0 THEN
        v_preco_unitario := ROUND(v_preco_varejo * (1 - v_desc_auto / 100.0), 2);
      ELSE
        v_preco_unitario := COALESCE(
          NULLIF(CASE WHEN v_var.id IS NOT NULL THEN v_var.preco_venda_atacado ELSE NULL END, 0),
          NULLIF(v_prod.preco_venda_atacado, 0),
          v_preco_varejo
        );
      END IF;
    ELSIF v_tabela_item = 'atacado' THEN
      v_preco_explicit := COALESCE(
        NULLIF(CASE WHEN v_var.id IS NOT NULL THEN v_var.preco_venda_atacado ELSE NULL END, 0),
        NULLIF(v_prod.preco_venda_atacado, 0)
      );
      IF v_preco_explicit IS NOT NULL THEN
        v_preco_unitario := v_preco_explicit;
      ELSIF v_desc_atacado > 0 THEN
        v_preco_unitario := ROUND(v_preco_varejo * (1 - v_desc_atacado / 100.0), 2);
      ELSE
        v_preco_unitario := v_preco_varejo;
      END IF;
    ELSE
      v_preco_unitario := COALESCE(v_preco_promo, v_preco_varejo);
    END IF;

    v_subtotal_item := ROUND(v_preco_unitario * v_qtd, 2);
    v_subtotal := ROUND(v_subtotal + v_subtotal_item, 2);
  END LOOP;

  -- 5. Validação e recálculo de cupom de desconto no servidor
  IF p_cupom_id IS NOT NULL THEN
    SELECT *
    INTO v_cupom
    FROM public.cupons c
    WHERE c.id = p_cupom_id
      AND c.loja_id = p_loja_id
      AND COALESCE(c.ativo, true) = true;

    IF FOUND THEN
      IF (v_cupom.data_inicio IS NULL OR v_cupom.data_inicio <= now())
         AND (v_cupom.data_fim IS NULL OR v_cupom.data_fim >= now())
         AND (v_cupom.limite_usos IS NULL OR COALESCE(v_cupom.usos_count, 0) < v_cupom.limite_usos)
         AND (COALESCE(v_cupom.tem_valor_minimo, false) = false OR v_subtotal >= COALESCE(v_cupom.valor_minimo_carrinho, 0)) THEN

        v_cupom_id_valido := v_cupom.id;
        v_cupom_codigo := v_cupom.codigo;

        IF v_cupom.tipo = 'desconto_fixo' THEN
          v_desconto_cupom := LEAST(v_subtotal, GREATEST(ROUND(COALESCE(v_cupom.valor, 0), 2), 0));
        ELSIF v_cupom.tipo = 'desconto_percentual' THEN
          v_desconto_cupom := LEAST(v_subtotal, ROUND(v_subtotal * GREATEST(COALESCE(v_cupom.valor, 0), 0) / 100.0, 2));
        ELSIF v_cupom.tipo = 'frete_gratis' THEN
          v_frete_gratis_cupom := true;
        END IF;
      END IF;
    END IF;
  END IF;

  -- 6. Validação de frete e taxa de domicílio
  v_elegivel_frete_gratis_loja := COALESCE(v_loja.frete_gratis_ativo, false) = true
    AND v_subtotal >= COALESCE(v_loja.frete_gratis_valor_minimo, 0);

  IF v_frete_gratis_cupom OR v_elegivel_frete_gratis_loja THEN
    v_valor_frete := 0;
  ELSE
    v_valor_frete := GREATEST(ROUND(COALESCE(p_valor_frete, 0), 2), 0);
    IF p_forma_entrega_id IS NOT NULL THEN
      SELECT *
      INTO v_forma_entrega
      FROM public.formas_entrega fe
      WHERE fe.id = p_forma_entrega_id
        AND fe.loja_id = p_loja_id
        AND COALESCE(fe.ativo, true) = true;

      IF FOUND AND v_forma_entrega.tipo = 'taxa_fixa' AND COALESCE(v_forma_entrega.valor_taxa, 0) > 0 THEN
        v_valor_frete := GREATEST(v_valor_frete, ROUND(v_forma_entrega.valor_taxa, 2));
      END IF;
    END IF;
  END IF;

  v_valor_taxa_dom := GREATEST(ROUND(COALESCE(p_valor_taxa_domicilio, 0), 2), 0);
  v_valor_total := GREATEST(ROUND(v_subtotal + v_valor_frete + v_valor_taxa_dom - v_desconto_cupom, 2), 0);

  v_status_pagamento_seguro := CASE
    WHEN p_status_pagamento IN ('aguardando_pesagem', 'aguardando_pagamento', 'fiado', 'caderneta') THEN p_status_pagamento
    ELSE 'aguardando_pagamento'
  END;

  -- 7. Inserção atômica do pedido
  INSERT INTO public.pedidos (
    loja_id,
    cliente_id,
    origem,
    status,
    status_pagamento,
    forma_pagamento_catalogo,
    eh_venda_caderneta,
    ciclo_referencia_caderneta,
    data_vencimento_fiado,
    fiado_quitado,
    tabela_preco_aplicada,
    subtotal,
    subtotal_produtos,
    valor_frete,
    valor_taxa_domicilio,
    levar_produto_no_atendimento,
    valor_desconto,
    valor_total,
    saldo_devedor,
    troco_para,
    cupom_id,
    cupom_codigo,
    valor_desconto_cupom,
    endereco_entrega,
    observacoes,
    forma_entrega_id,
    nome_transportadora,
    servico_correios,
    tipo_operacao,
    cliente_nome_avulso,
    cliente_telefone_avulso,
    cliente_documento_avulso,
    cliente_email_avulso,
    data_venda,
    criado_em,
    atualizado_em
  )
  VALUES (
    p_loja_id,
    p_cliente_id,
    'catalogo_online',
    'pendente',
    v_status_pagamento_seguro,
    COALESCE(NULLIF(TRIM(p_forma_pagamento_catalogo), ''), 'a_combinar'),
    COALESCE(p_eh_venda_caderneta, false),
    p_ciclo_referencia_caderneta,
    p_data_vencimento_fiado,
    false,
    v_tabela_efetiva,
    v_subtotal,
    v_subtotal,
    v_valor_frete,
    v_valor_taxa_dom,
    COALESCE(p_levar_produto_no_atendimento, false),
    v_desconto_cupom,
    v_valor_total,
    v_valor_total,
    NULL,
    v_cupom_id_valido,
    v_cupom_codigo,
    v_desconto_cupom,
    p_endereco_entrega,
    NULLIF(TRIM(COALESCE(p_observacoes, '')), ''),
    p_forma_entrega_id,
    p_nome_transportadora,
    p_servico_correios,
    COALESCE(NULLIF(TRIM(p_tipo_operacao), ''), 'entrega'),
    p_cliente_nome_avulso,
    p_cliente_telefone_avulso,
    p_cliente_documento_avulso,
    p_cliente_email_avulso,
    v_data_op,
    v_data_op,
    v_data_op
  )
  RETURNING id, public.pedidos.numero_pedido
  INTO v_pedido_id, v_numero_pedido;

  -- 8. Inserção atômica dos itens com snapshot de preço e custo autoritativo
  FOR v_idx IN 1..v_qtd_itens LOOP
    v_prod_id := p_produto_ids[v_idx];
    v_var_id := p_variacao_ids[v_idx];
    v_qtd := p_quantidades[v_idx];

    SELECT *
    INTO v_prod
    FROM public.produtos p
    WHERE p.id = v_prod_id
      AND p.loja_id = p_loja_id;

    v_var := NULL;
    IF v_var_id IS NOT NULL THEN
      SELECT *
      INTO v_var
      FROM public.variacoes_produto vp
      WHERE vp.id = v_var_id
        AND vp.produto_id = v_prod.id
        AND vp.loja_id = p_loja_id;
    END IF;

    v_preco_varejo := COALESCE(
      CASE WHEN v_var.id IS NOT NULL THEN v_var.preco_venda_varejo ELSE NULL END,
      v_prod.preco_venda_varejo,
      0
    );

    v_preco_promo := CASE
      WHEN v_var.id IS NOT NULL AND COALESCE(v_var.preco_promocional, 0) > 0 THEN v_var.preco_promocional
      WHEN COALESCE(v_prod.promocao_ativa, false) = true AND COALESCE(v_prod.preco_promocional, 0) > 0 THEN v_prod.preco_promocional
      ELSE NULL
    END;

    v_tabela_item := v_tabela_efetiva;
    IF v_criterio_auto = 'minimo_sku' OR v_criterio_atacado = 'minimo_sku' THEN
      v_min_sku_item_auto := CASE
        WHEN v_criterio_auto = 'minimo_sku' AND v_prod.tipo_minimo_autoatacado = 'minimo_sku' AND COALESCE(v_prod.qtd_minima_autoatacado, 0) > 0 THEN v_prod.qtd_minima_autoatacado
        WHEN v_criterio_auto = 'minimo_sku' AND v_sku_min_auto > 0 THEN v_sku_min_auto
        ELSE 0
      END;
      v_min_sku_item_atacado := CASE
        WHEN v_criterio_atacado = 'minimo_sku' AND v_prod.tipo_minimo_atacado = 'minimo_sku' AND COALESCE(v_prod.qtd_minima_atacado, 0) > 0 THEN v_prod.qtd_minima_atacado
        WHEN v_criterio_atacado = 'minimo_sku' AND v_sku_min_atacado > 0 THEN v_sku_min_atacado
        ELSE 0
      END;

      IF v_distribuidor_ativo AND v_criterio_auto = 'minimo_sku' AND v_min_sku_item_auto > 0 AND v_qtd >= v_min_sku_item_auto THEN
        v_tabela_item := 'autoatacado';
      ELSIF v_atacado_ativo AND v_criterio_atacado = 'minimo_sku' AND v_min_sku_item_atacado > 0 AND v_qtd >= v_min_sku_item_atacado THEN
        IF v_tabela_item <> 'autoatacado' THEN v_tabela_item := 'atacado'; END IF;
      ELSIF v_tabela_item = 'autoatacado' AND v_criterio_auto = 'minimo_sku' THEN
        v_tabela_item := CASE WHEN v_atacado_ativo AND v_criterio_atacado <> 'minimo_sku' AND v_elegivel_atacado THEN 'atacado' ELSE 'varejo' END;
      ELSIF v_tabela_item = 'atacado' AND v_criterio_atacado = 'minimo_sku' THEN
        v_tabela_item := 'varejo';
      END IF;
    END IF;

    IF v_tabela_item = 'autoatacado' THEN
      v_preco_explicit := COALESCE(
        NULLIF(CASE WHEN v_var.id IS NOT NULL THEN v_var.preco_venda_autoatacado ELSE NULL END, 0),
        NULLIF(v_prod.preco_venda_autoatacado, 0)
      );
      IF v_preco_explicit IS NOT NULL THEN
        v_preco_unitario := v_preco_explicit;
      ELSIF v_desc_auto > 0 THEN
        v_preco_unitario := ROUND(v_preco_varejo * (1 - v_desc_auto / 100.0), 2);
      ELSE
        v_preco_unitario := COALESCE(
          NULLIF(CASE WHEN v_var.id IS NOT NULL THEN v_var.preco_venda_atacado ELSE NULL END, 0),
          NULLIF(v_prod.preco_venda_atacado, 0),
          v_preco_varejo
        );
      END IF;
    ELSIF v_tabela_item = 'atacado' THEN
      v_preco_explicit := COALESCE(
        NULLIF(CASE WHEN v_var.id IS NOT NULL THEN v_var.preco_venda_atacado ELSE NULL END, 0),
        NULLIF(v_prod.preco_venda_atacado, 0)
      );
      IF v_preco_explicit IS NOT NULL THEN
        v_preco_unitario := v_preco_explicit;
      ELSIF v_desc_atacado > 0 THEN
        v_preco_unitario := ROUND(v_preco_varejo * (1 - v_desc_atacado / 100.0), 2);
      ELSE
        v_preco_unitario := v_preco_varejo;
      END IF;
    ELSE
      v_preco_unitario := COALESCE(v_preco_promo, v_preco_varejo);
    END IF;

    v_preco_custo := COALESCE(
      CASE WHEN v_var.id IS NOT NULL THEN v_var.preco_custo ELSE NULL END,
      v_prod.preco_custo,
      0
    );

    v_tipo_unidade := LOWER(COALESCE(NULLIF(TRIM(v_prod.tipo_unidade), ''), NULLIF(TRIM(v_prod.unidade_medida), ''), 'un'));
    v_eh_kg := v_tipo_unidade = 'kg';
    v_unidade_medida := CASE
      WHEN v_eh_kg THEN 'KG'
      WHEN NULLIF(TRIM(v_prod.unidade_medida), '') IS NOT NULL THEN UPPER(TRIM(v_prod.unidade_medida))
      ELSE 'UN'
    END;

    v_rotulo_variacao := CASE
      WHEN v_var.id IS NOT NULL THEN NULLIF(TRIM(CONCAT(v_var.valor_variacao_1, ' ', COALESCE(v_var.valor_variacao_2, ''))), '')
      ELSE NULL
    END;

    v_subtotal_item := ROUND(v_preco_unitario * v_qtd, 2);

    INSERT INTO public.itens_pedido (
      loja_id,
      pedido_id,
      produto_id,
      tipo_item,
      variacao_id,
      tabela_preco_utilizada,
      nome_produto,
      rotulo_variacao,
      preco_custo_unitario,
      preco_venda_unitario,
      quantidade,
      quantidade_solicitada,
      unidade_medida,
      tipo_unidade,
      peso_solicitado_kg,
      subtotal,
      criado_em
    )
    VALUES (
      p_loja_id,
      v_pedido_id,
      v_prod.id,
      COALESCE(v_prod.tipo_item, 'produto'),
      v_var.id,
      v_tabela_efetiva,
      v_prod.nome,
      v_rotulo_variacao,
      v_preco_custo,
      v_preco_unitario,
      v_qtd,
      v_qtd,
      v_unidade_medida,
      v_tipo_unidade,
      CASE WHEN v_eh_kg THEN v_qtd ELSE NULL END,
      v_subtotal_item,
      v_data_op
    )
    RETURNING id INTO v_item_id;

    v_itens_ids := array_append(v_itens_ids, v_item_id);
  END LOOP;

  RETURN QUERY
  SELECT
    v_pedido_id,
    v_numero_pedido,
    v_subtotal,
    v_desconto_cupom,
    v_valor_frete,
    v_valor_total,
    v_itens_ids;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_criar_pedido_catalogo_seguro(
  uuid, uuid[], uuid[], numeric[], uuid, text, uuid, uuid, numeric, numeric,
  boolean, text, text, boolean, text, date, text, text, text, text, text,
  text, text, text, text, timestamptz
) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. RPC DE AUTENTICAÇÃO DO CLIENTE DO CATÁLOGO (SEM TRAFEGAR senha_hash)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_autenticar_cliente_catalogo(uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.rpc_autenticar_cliente_catalogo(
  p_loja_id uuid,
  p_tel_ddi text,
  p_tel_sem_ddi text,
  p_hash_ddi text,
  p_hash_sem_ddi text,
  p_senha_legado text
)
RETURNS TABLE (
  sucesso boolean,
  mensagem text,
  id uuid,
  loja_id uuid,
  nome text,
  telefone text,
  whatsapp text,
  email text,
  numero_documento text,
  tabela_preco_padrao text,
  endereco_principal text,
  endereco_secundario text,
  saldo_devedor_fiado numeric,
  limite_credito numeric,
  permite_fiado boolean,
  data_aniversario date,
  observacoes text,
  permite_caderneta boolean,
  limite_caderneta numeric,
  saldo_devedor_caderneta numeric,
  dia_vencimento_caderneta integer,
  ciclo_caderneta text,
  dia_semana_caderneta integer,
  dia_vencimento_2_caderneta integer,
  criado_em timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, security_audit
AS $$
DECLARE
  v_cli record;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.routines
    WHERE routine_schema = 'security_audit'
      AND routine_name = 'ator_esta_bloqueado'
  ) THEN
    IF security_audit.ator_esta_bloqueado() THEN
      RETURN QUERY SELECT
        false, 'Operação bloqueada por política de segurança.'::text,
        NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text,
        NULL::text, NULL::text, NULL::text, NULL::text, NULL::numeric, NULL::numeric,
        NULL::boolean, NULL::date, NULL::text, NULL::boolean, NULL::numeric,
        NULL::numeric, NULL::integer, NULL::text, NULL::integer, NULL::integer, NULL::timestamptz;
      RETURN;
    END IF;
  END IF;

  IF p_loja_id IS NULL THEN
    RETURN QUERY SELECT
      false, 'Identificador da loja é obrigatório.'::text,
      NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::numeric, NULL::numeric,
      NULL::boolean, NULL::date, NULL::text, NULL::boolean, NULL::numeric,
      NULL::numeric, NULL::integer, NULL::text, NULL::integer, NULL::integer, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT *
  INTO v_cli
  FROM public.clientes c
  WHERE c.loja_id = p_loja_id
    AND (
      c.telefone = p_tel_ddi
      OR c.whatsapp = p_tel_ddi
      OR c.telefone = p_tel_sem_ddi
      OR c.whatsapp = p_tel_sem_ddi
    )
  ORDER BY c.criado_em ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_cli.senha_hash IS NULL OR TRIM(v_cli.senha_hash) = '' THEN
    UPDATE public.clientes
    SET
      senha_hash = p_hash_ddi,
      telefone = p_tel_ddi,
      whatsapp = p_tel_ddi,
      email = CASE WHEN email LIKE '%@hubi.app%' THEN NULL ELSE email END
    WHERE public.clientes.id = v_cli.id
      AND public.clientes.loja_id = p_loja_id;

    v_cli.telefone := p_tel_ddi;
    v_cli.whatsapp := p_tel_ddi;
    IF v_cli.email LIKE '%@hubi.app%' THEN
      v_cli.email := NULL;
    END IF;
  ELSIF v_cli.senha_hash NOT IN (p_hash_ddi, p_hash_sem_ddi, COALESCE(p_senha_legado, '')) THEN
    RETURN QUERY SELECT
      false, 'Senha incorreta. Verifique e tente novamente.'::text,
      NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::numeric, NULL::numeric,
      NULL::boolean, NULL::date, NULL::text, NULL::boolean, NULL::numeric,
      NULL::numeric, NULL::integer, NULL::text, NULL::integer, NULL::integer, NULL::timestamptz;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    'Autenticado com sucesso.'::text,
    v_cli.id,
    v_cli.loja_id,
    v_cli.nome::text,
    v_cli.telefone::text,
    v_cli.whatsapp::text,
    v_cli.email::text,
    v_cli.numero_documento::text,
    v_cli.tabela_preco_padrao::text,
    v_cli.endereco_principal::text,
    v_cli.endereco_secundario::text,
    v_cli.saldo_devedor_fiado,
    v_cli.limite_credito,
    v_cli.permite_fiado,
    v_cli.data_aniversario,
    v_cli.observacoes::text,
    v_cli.permite_caderneta,
    v_cli.limite_caderneta,
    v_cli.saldo_devedor_caderneta,
    v_cli.dia_vencimento_caderneta::integer,
    v_cli.ciclo_caderneta::text,
    v_cli.dia_semana_caderneta,
    v_cli.dia_vencimento_2_caderneta,
    v_cli.criado_em;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_autenticar_cliente_catalogo(uuid, text, text, text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
