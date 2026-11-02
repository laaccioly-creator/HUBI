-- =============================================================================
-- MIGRAÇÃO DEFINITIVA: Unificação via Celular/WhatsApp e Saneamento de Duplicados
-- Data: 2026-11-02
-- Descrição:
--   1. Remove índices e constraints únicos legados que travavam atualizações.
--   2. Cria função IMMUTABLE de normalização determinística com DDI 55.
--   3. Resgata telefones de e-mails sintéticos (@hubi.app) e limpa a coluna email.
--   4. Mescla registros órfãos sem telefone (ex: LUIZ AUGUSTO via sync do catálogo).
--   5. Consolida duplicados da mesma loja pelo telefone normalizado, transferindo
--      pedidos, cadernetas, movimentações de saldo, transações, favoritos e endereços.
--   6. Remove cadastros órfãos vazios sem histórico de vendas ou saldo.
--   7. Normaliza a coluna telefone e whatsapp para todos os clientes ativos.
--   8. Recria os índices únicos (uq_clientes_loja_celular_normalizado e uq_clientes_loja_telefone).
-- =============================================================================

-- 1. Remoção imediata de índices e constraints únicos legados
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS uq_clientes_loja_telefone;
DROP INDEX IF EXISTS public.uq_clientes_loja_telefone;
DROP INDEX IF EXISTS public.idx_clientes_loja_telefone_unico;
DROP INDEX IF EXISTS public.uq_clientes_loja_celular_normalizado;

-- 2. Função IMMUTABLE para normalização determinística de telefone com DDI 55
CREATE OR REPLACE FUNCTION public.normalizar_telefone_com_ddi(tel TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digitos TEXT;
BEGIN
  IF tel IS NULL OR trim(tel) = '' THEN
    RETURN NULL;
  END IF;

  digitos := regexp_replace(tel, '\D', '', 'g');
  IF digitos = '' THEN
    RETURN NULL;
  END IF;

  -- Se já contém DDI 55 e possui 12 ou 13 dígitos
  IF (length(digitos) = 12 OR length(digitos) = 13) AND digitos LIKE '55%' THEN
    RETURN digitos;
  END IF;

  -- Se possui 10 ou 11 dígitos (DDD + número), adiciona o DDI 55
  IF length(digitos) = 10 OR length(digitos) = 11 THEN
    RETURN '55' || digitos;
  END IF;

  RETURN digitos;
END;
$$;

-- 3. Resgata telefone de e-mails sintéticos @hubi.app caso o cadastro esteja sem telefone/whatsapp
UPDATE public.clientes
   SET whatsapp = public.normalizar_telefone_com_ddi(split_part(email, '@', 1)),
       telefone = coalesce(nullif(telefone, ''), public.normalizar_telefone_com_ddi(split_part(email, '@', 1))),
       telefone_is_whatsapp = true
 WHERE email LIKE '%@hubi.app'
   AND (whatsapp IS NULL OR trim(whatsapp) = '' OR telefone IS NULL OR trim(telefone) = '')
   AND length(regexp_replace(split_part(email, '@', 1), '\D', '', 'g')) >= 10;

-- 4. Limpeza de todos os e-mails sintéticos @hubi.app da tabela de clientes
UPDATE public.clientes
   SET email = NULL
 WHERE email LIKE '%@hubi.app';

-- 5. Mesclagem de registros órfãos sem telefone com o cadastro principal da mesma loja
DO $$
DECLARE
  rec_orfao RECORD;
  v_principal_id UUID;
BEGIN
  FOR rec_orfao IN (
    SELECT o.id AS orfao_id, o.loja_id, o.nome, o.email, o.auth_uid,
           coalesce(o.saldo_devedor_caderneta, 0) AS saldo_cad,
           coalesce(o.saldo_devedor_fiado, 0) AS saldo_fiado,
           coalesce(o.saldo_credito, 0) AS saldo_cred
      FROM public.clientes o
     WHERE (o.whatsapp IS NULL OR trim(o.whatsapp) = '')
       AND (o.telefone IS NULL OR trim(o.telefone) = '')
  ) LOOP
    -- Tenta associar ao registro principal que possui telefone na mesma loja
    SELECT p.id INTO v_principal_id
      FROM public.clientes p
     WHERE p.loja_id = rec_orfao.loja_id
       AND p.id <> rec_orfao.orfao_id
       AND (p.whatsapp IS NOT NULL OR p.telefone IS NOT NULL)
       AND (
         (rec_orfao.auth_uid IS NOT NULL AND p.auth_uid = rec_orfao.auth_uid)
         OR (rec_orfao.email IS NOT NULL AND lower(trim(p.email)) = lower(trim(rec_orfao.email)))
         OR (
           lower(trim(p.nome)) = lower(trim(rec_orfao.nome))
           OR split_part(lower(trim(p.nome)), ' ', 1) = split_part(lower(trim(rec_orfao.nome)), ' ', 1)
         )
       )
     ORDER BY
       (CASE WHEN coalesce(p.saldo_devedor_caderneta, 0) > 0 OR coalesce(p.saldo_devedor_fiado, 0) > 0 THEN 1 ELSE 0 END) DESC,
       (CASE WHEN p.senha_hash IS NOT NULL AND p.senha_hash <> '' THEN 1 ELSE 0 END) DESC,
       p.criado_em ASC
     LIMIT 1;

    IF v_principal_id IS NOT NULL THEN
      -- Migra pedidos
      UPDATE public.pedidos
         SET cliente_id = v_principal_id
       WHERE cliente_id = rec_orfao.orfao_id;

      -- Migra lançamentos de caderneta
      UPDATE public.caderneta_lancamentos
         SET cliente_id = v_principal_id
       WHERE cliente_id = rec_orfao.orfao_id;

      -- Migra movimentações de saldo
      UPDATE public.movimentacoes_saldo_cliente
         SET cliente_id = v_principal_id
       WHERE cliente_id = rec_orfao.orfao_id;

      -- Migra transações de whatsapp da loja
      UPDATE public.loja_whatsapp_transacoes
         SET cliente_id = v_principal_id
       WHERE cliente_id = rec_orfao.orfao_id;

      -- Migra endereços
      UPDATE public.cliente_enderecos
         SET cliente_id = v_principal_id
       WHERE cliente_id = rec_orfao.orfao_id;

      -- Consolida saldo no principal
      UPDATE public.clientes
         SET saldo_devedor_caderneta = coalesce(saldo_devedor_caderneta, 0) + rec_orfao.saldo_cad,
             saldo_devedor_fiado = coalesce(saldo_devedor_fiado, 0) + rec_orfao.saldo_fiado,
             saldo_credito = coalesce(saldo_credito, 0) + rec_orfao.saldo_cred
       WHERE id = v_principal_id;

      -- Remove o registro órfão
      DELETE FROM public.clientes
       WHERE id = rec_orfao.orfao_id;
    END IF;
  END LOOP;
END $$;

-- 6. Mesclagem de clientes duplicados por telefone/whatsapp normalizado (Loop Pass 1)
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN (
    WITH fones_clientes AS (
      SELECT
        id,
        loja_id,
        public.normalizar_telefone_com_ddi(
          CASE 
            WHEN whatsapp IS NOT NULL AND trim(whatsapp) != '' THEN whatsapp
            ELSE telefone
          END
        ) AS fone_principal,
        coalesce(saldo_devedor_caderneta, 0) AS saldo_cad,
        coalesce(saldo_devedor_fiado, 0) AS saldo_fiado,
        coalesce(saldo_credito, 0) AS saldo_cred,
        senha_hash,
        email,
        numero_documento,
        endereco_principal,
        criado_em,
        ROW_NUMBER() OVER (
          PARTITION BY loja_id, public.normalizar_telefone_com_ddi(
            CASE 
              WHEN whatsapp IS NOT NULL AND trim(whatsapp) != '' THEN whatsapp
              ELSE telefone
            END
          )
          ORDER BY
            (CASE WHEN coalesce(saldo_devedor_caderneta, 0) > 0 OR coalesce(saldo_devedor_fiado, 0) > 0 THEN 1 ELSE 0 END) DESC,
            (CASE WHEN senha_hash IS NOT NULL AND senha_hash <> '' THEN 1 ELSE 0 END) DESC,
            (CASE WHEN permite_caderneta = true OR permite_fiado = true THEN 1 ELSE 0 END) DESC,
            (CASE WHEN numero_documento IS NOT NULL AND numero_documento <> '' THEN 1 ELSE 0 END) DESC,
            criado_em ASC
        ) AS rn
      FROM public.clientes
      WHERE public.normalizar_telefone_com_ddi(coalesce(nullif(whatsapp, ''), telefone)) IS NOT NULL
        AND length(public.normalizar_telefone_com_ddi(coalesce(nullif(whatsapp, ''), telefone))) >= 10
    ),
    principais AS (
      SELECT * FROM fones_clientes WHERE rn = 1
    ),
    duplicados AS (
      SELECT
        d.id AS duplicado_id,
        p.id AS principal_id,
        d.loja_id,
        d.saldo_cad,
        d.saldo_fiado,
        d.saldo_cred,
        d.senha_hash AS dup_senha_hash,
        d.email AS dup_email,
        d.numero_documento AS dup_doc,
        d.endereco_principal AS dup_end
      FROM fones_clientes d
      JOIN principais p
        ON p.loja_id = d.loja_id
       AND p.fone_principal = d.fone_principal
      WHERE d.rn > 1
    )
    SELECT * FROM duplicados
  ) LOOP
    -- Reponta pedidos
    UPDATE public.pedidos
       SET cliente_id = rec.principal_id
     WHERE cliente_id = rec.duplicado_id;

    -- Reponta lançamentos de caderneta
    UPDATE public.caderneta_lancamentos
       SET cliente_id = rec.principal_id
     WHERE cliente_id = rec.duplicado_id;

    -- Reponta movimentações de saldo
    UPDATE public.movimentacoes_saldo_cliente
       SET cliente_id = rec.principal_id
     WHERE cliente_id = rec.duplicado_id;

    -- Reponta transações whatsapp da loja
    UPDATE public.loja_whatsapp_transacoes
       SET cliente_id = rec.principal_id
     WHERE cliente_id = rec.duplicado_id;

    -- Reponta endereços
    UPDATE public.cliente_enderecos
       SET cliente_id = rec.principal_id
     WHERE cliente_id = rec.duplicado_id;

    -- Trata cliente_favoritos evitando colisão na chave única (cliente_id, produto_id)
    DELETE FROM public.cliente_favoritos f
     WHERE f.cliente_id = rec.duplicado_id
       AND EXISTS (
         SELECT 1 FROM public.cliente_favoritos p
          WHERE p.cliente_id = rec.principal_id
            AND p.produto_id = f.produto_id
       );
    UPDATE public.cliente_favoritos
       SET cliente_id = rec.principal_id
     WHERE cliente_id = rec.duplicado_id;

    -- Trata cliente_carrinho_itens evitando colisão na chave única
    DELETE FROM public.cliente_carrinho_itens c
     WHERE c.cliente_id = rec.duplicado_id
       AND EXISTS (
         SELECT 1 FROM public.cliente_carrinho_itens p
          WHERE p.cliente_id = rec.principal_id
            AND p.produto_id = c.produto_id
            AND coalesce(p.variacao_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(c.variacao_id, '00000000-0000-0000-0000-000000000000'::uuid)
       );
    UPDATE public.cliente_carrinho_itens
       SET cliente_id = rec.principal_id
     WHERE cliente_id = rec.duplicado_id;

    -- Reponta notificações
    UPDATE public.cliente_notificacoes
       SET cliente_id = rec.principal_id
     WHERE cliente_id = rec.duplicado_id;

    -- Consolida dados no cliente principal
    UPDATE public.clientes
       SET saldo_devedor_caderneta = coalesce(saldo_devedor_caderneta, 0) + rec.saldo_cad,
           saldo_devedor_fiado = coalesce(saldo_devedor_fiado, 0) + rec.saldo_fiado,
           saldo_credito = coalesce(saldo_credito, 0) + rec.saldo_cred,
           senha_hash = coalesce(senha_hash, rec.dup_senha_hash),
           numero_documento = coalesce(numero_documento, rec.dup_doc),
           endereco_principal = coalesce(endereco_principal, rec.dup_end)
     WHERE id = rec.principal_id;

    -- Exclui o duplicado com segurança
    DELETE FROM public.clientes
     WHERE id = rec.duplicado_id;
  END LOOP;
END $$;

-- 7. Mesclagem cruzada residual (Pass 2: onde telefone de um coincide com whatsapp de outro)
DO $$
DECLARE
  rec2 RECORD;
BEGIN
  FOR rec2 IN (
    SELECT d.id AS duplicado_id, p.id AS principal_id,
           coalesce(d.saldo_devedor_caderneta, 0) AS saldo_cad,
           coalesce(d.saldo_devedor_fiado, 0) AS saldo_fiado,
           coalesce(d.saldo_credito, 0) AS saldo_cred,
           d.senha_hash AS dup_senha_hash,
           d.numero_documento AS dup_doc,
           d.endereco_principal AS dup_end
      FROM public.clientes d
      JOIN public.clientes p
        ON p.loja_id = d.loja_id
       AND p.id <> d.id
       AND (
         public.normalizar_telefone_com_ddi(p.telefone) = public.normalizar_telefone_com_ddi(d.whatsapp)
         OR public.normalizar_telefone_com_ddi(p.whatsapp) = public.normalizar_telefone_com_ddi(d.telefone)
       )
     WHERE d.id > p.id
  ) LOOP
    UPDATE public.pedidos SET cliente_id = rec2.principal_id WHERE cliente_id = rec2.duplicado_id;
    UPDATE public.caderneta_lancamentos SET cliente_id = rec2.principal_id WHERE cliente_id = rec2.duplicado_id;
    UPDATE public.movimentacoes_saldo_cliente SET cliente_id = rec2.principal_id WHERE cliente_id = rec2.duplicado_id;
    UPDATE public.loja_whatsapp_transacoes SET cliente_id = rec2.principal_id WHERE cliente_id = rec2.duplicado_id;
    UPDATE public.cliente_enderecos SET cliente_id = rec2.principal_id WHERE cliente_id = rec2.duplicado_id;
    
    DELETE FROM public.cliente_favoritos f
     WHERE f.cliente_id = rec2.duplicado_id
       AND EXISTS (
         SELECT 1 FROM public.cliente_favoritos p
          WHERE p.cliente_id = rec2.principal_id
            AND p.produto_id = f.produto_id
       );
    UPDATE public.cliente_favoritos SET cliente_id = rec2.principal_id WHERE cliente_id = rec2.duplicado_id;

    DELETE FROM public.cliente_carrinho_itens c
     WHERE c.cliente_id = rec2.duplicado_id
       AND EXISTS (
         SELECT 1 FROM public.cliente_carrinho_itens p
          WHERE p.cliente_id = rec2.principal_id
            AND p.produto_id = c.produto_id
            AND coalesce(p.variacao_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(c.variacao_id, '00000000-0000-0000-0000-000000000000'::uuid)
       );
    UPDATE public.cliente_carrinho_itens SET cliente_id = rec2.principal_id WHERE cliente_id = rec2.duplicado_id;

    UPDATE public.cliente_notificacoes SET cliente_id = rec2.principal_id WHERE cliente_id = rec2.duplicado_id;

    UPDATE public.clientes
       SET saldo_devedor_caderneta = coalesce(saldo_devedor_caderneta, 0) + rec2.saldo_cad,
           saldo_devedor_fiado = coalesce(saldo_devedor_fiado, 0) + rec2.saldo_fiado,
           saldo_credito = coalesce(saldo_credito, 0) + rec2.saldo_cred,
           senha_hash = coalesce(senha_hash, rec2.dup_senha_hash),
           numero_documento = coalesce(numero_documento, rec2.dup_doc),
           endereco_principal = coalesce(endereco_principal, rec2.dup_end)
     WHERE id = rec2.principal_id;

    DELETE FROM public.clientes WHERE id = rec2.duplicado_id;
  END LOOP;
END $$;

-- 8. Remoção de cadastros órfãos vazios (sem telefone, sem pedidos e sem saldo)
DELETE FROM public.clientes c
 WHERE (c.whatsapp IS NULL OR trim(c.whatsapp) = '')
   AND (c.telefone IS NULL OR trim(c.telefone) = '')
   AND coalesce(c.saldo_devedor_caderneta, 0) = 0
   AND coalesce(c.saldo_devedor_fiado, 0) = 0
   AND NOT EXISTS (
     SELECT 1 FROM public.pedidos p WHERE p.cliente_id = c.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.caderneta_lancamentos cl WHERE cl.cliente_id = c.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.movimentacoes_saldo_cliente m WHERE m.cliente_id = c.id
   );

-- 9. Normalização de todos os telefones e whatsapps dos clientes restantes (agora garantidamente sem duplicidades)
UPDATE public.clientes
   SET whatsapp = public.normalizar_telefone_com_ddi(coalesce(nullif(whatsapp, ''), telefone)),
       telefone = public.normalizar_telefone_com_ddi(coalesce(nullif(telefone, ''), whatsapp)),
       telefone_is_whatsapp = true
 WHERE coalesce(nullif(whatsapp, ''), telefone) IS NOT NULL;

-- 10. Criação dos índices únicos limpos e inequívocos
CREATE UNIQUE INDEX uq_clientes_loja_celular_normalizado
  ON public.clientes (
    loja_id,
    public.normalizar_telefone_com_ddi(coalesce(nullif(whatsapp, ''), telefone))
  )
  WHERE public.normalizar_telefone_com_ddi(coalesce(nullif(whatsapp, ''), telefone)) IS NOT NULL
    AND length(public.normalizar_telefone_com_ddi(coalesce(nullif(whatsapp, ''), telefone))) >= 10;

CREATE UNIQUE INDEX uq_clientes_loja_telefone
  ON public.clientes (loja_id, telefone)
  WHERE telefone IS NOT NULL AND trim(telefone) != '';
