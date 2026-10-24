-- =============================================================================
-- MIGRAÇÃO: Higienização de Clientes Duplicados e Chave Única de Celular por Loja
-- Data: 2026-10-24
-- =============================================================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Unifica clientes duplicados que compartilham a mesma loja_id e o mesmo celular normalizado (mínimo 8 dígitos)
  FOR rec IN (
    WITH clientes_normalizados AS (
      SELECT
        id,
        loja_id,
        regexp_replace(coalesce(nullif(whatsapp, ''), telefone, ''), '\D', '', 'g') AS fone_limpo,
        coalesce(saldo_devedor_caderneta, 0) AS saldo_cad,
        coalesce(saldo_devedor_fiado, 0) AS saldo_fiado,
        criado_em,
        ROW_NUMBER() OVER (
          PARTITION BY loja_id, regexp_replace(coalesce(nullif(whatsapp, ''), telefone, ''), '\D', '', 'g')
          ORDER BY
            (CASE WHEN coalesce(saldo_devedor_caderneta, 0) > 0 OR coalesce(saldo_devedor_fiado, 0) > 0 THEN 1 ELSE 0 END) DESC,
            (CASE WHEN senha_hash IS NOT NULL AND senha_hash <> '' THEN 1 ELSE 0 END) DESC,
            (CASE WHEN permite_caderneta = true OR permite_fiado = true THEN 1 ELSE 0 END) DESC,
            criado_em ASC
        ) AS rn
      FROM public.clientes
      WHERE length(regexp_replace(coalesce(nullif(whatsapp, ''), telefone, ''), '\D', '', 'g')) >= 8
    ),
    principais AS (
      SELECT id AS principal_id, loja_id, fone_limpo
      FROM clientes_normalizados
      WHERE rn = 1
    ),
    duplicados AS (
      SELECT
        d.id AS duplicado_id,
        p.principal_id,
        d.loja_id,
        d.saldo_cad,
        d.saldo_fiado
      FROM clientes_normalizados d
      JOIN principais p
        ON p.loja_id = d.loja_id
       AND p.fone_limpo = d.fone_limpo
      WHERE d.rn > 1
    )
    SELECT * FROM duplicados
  ) LOOP
    -- Transfere pedidos e lançamentos para o cliente principal
    UPDATE public.pedidos
       SET cliente_id = rec.principal_id
     WHERE loja_id = rec.loja_id
       AND cliente_id = rec.duplicado_id;

    UPDATE public.caderneta_lancamentos
       SET cliente_id = rec.principal_id
     WHERE loja_id = rec.loja_id
       AND cliente_id = rec.duplicado_id;

    -- Consolida saldos no cliente principal
    UPDATE public.clientes
       SET saldo_devedor_caderneta = coalesce(saldo_devedor_caderneta, 0) + rec.saldo_cad,
           saldo_devedor_fiado = coalesce(saldo_devedor_fiado, 0) + rec.saldo_fiado
     WHERE id = rec.principal_id
       AND loja_id = rec.loja_id;

    -- Remove o registro duplicado
    DELETE FROM public.clientes
     WHERE id = rec.duplicado_id
       AND loja_id = rec.loja_id;
  END LOOP;
END $$;

-- Índice único por loja + telefone normalizado (quando houver ao menos 8 dígitos numéricos)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_loja_telefone_unico
  ON public.clientes (
    loja_id,
    regexp_replace(coalesce(nullif(whatsapp, ''), telefone, ''), '\D', '', 'g')
  )
  WHERE length(regexp_replace(coalesce(nullif(whatsapp, ''), telefone, ''), '\D', '', 'g')) >= 8;
