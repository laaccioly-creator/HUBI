-- Migration: 20261126_comprovante_pagamento_pedidos.sql
-- Objetivo: Controle relacional puro do comprovante de pagamento (Pix/transferência)
-- na tabela public.pedidos e RPC SECURITY DEFINER para registro auditável pelo Catálogo Online.

-- 1. Colunas relacionais explícitas em public.pedidos (sem JSONB genérico)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS comprovante_pagamento_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS comprovante_enviado_em TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.pedidos.comprovante_pagamento_url IS 'URL pública (Storage) ou Data URL do comprovante de pagamento Pix/transferência enviado pelo cliente.';
COMMENT ON COLUMN public.pedidos.comprovante_enviado_em IS 'Carimbo de data/hora do envio do comprovante de pagamento pelo cliente.';

-- 2. Garantir bucket público dedicado para comprovantes de pagamento (idempotente)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'comprovantes-pagamento',
    'comprovantes-pagamento',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
  ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION
  WHEN insufficient_privilege OR undefined_table THEN
    NULL;
END $$;

-- Políticas idempotentes de leitura e upload para o bucket de comprovantes
DO $$
BEGIN
  DROP POLICY IF EXISTS comprovantes_pagamento_public_select ON storage.objects;
  CREATE POLICY comprovantes_pagamento_public_select
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'comprovantes-pagamento');

  DROP POLICY IF EXISTS comprovantes_pagamento_public_insert ON storage.objects;
  CREATE POLICY comprovantes_pagamento_public_insert
    ON storage.objects
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (bucket_id = 'comprovantes-pagamento');
EXCEPTION
  WHEN insufficient_privilege OR undefined_table THEN
    NULL;
END $$;

-- 3. RPC SECURITY DEFINER para registrar o comprovante do pedido no Catálogo Online
CREATE OR REPLACE FUNCTION public.rpc_registrar_comprovante_pedido_catalogo(
  p_pedido_id UUID,
  p_loja_id UUID,
  p_comprovante_url TEXT
)
RETURNS TABLE (
  pedido_id UUID,
  comprovante_pagamento_url TEXT,
  comprovante_enviado_em TIMESTAMPTZ,
  forma_pagamento_catalogo TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, security_audit
AS $$
DECLARE
  v_ped RECORD;
  v_url TEXT;
  v_agora TIMESTAMPTZ := NOW();
  v_forma TEXT;
BEGIN
  IF p_pedido_id IS NULL OR p_loja_id IS NULL THEN
    RAISE EXCEPTION 'Pedido e loja são obrigatórios.';
  END IF;

  v_url := NULLIF(TRIM(COALESCE(p_comprovante_url, '')), '');
  IF v_url IS NULL THEN
    RAISE EXCEPTION 'URL do comprovante inválida.';
  END IF;

  IF v_url !~* '^(https?://|data:(image/[a-z0-9.+-]+|application/pdf);base64,)' THEN
    RAISE EXCEPTION 'Formato do comprovante não permitido.';
  END IF;

  SELECT p.id, p.status, p.status_pagamento, p.forma_pagamento_catalogo
    INTO v_ped
    FROM public.pedidos p
   WHERE p.id = p_pedido_id
     AND p.loja_id = p_loja_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado para esta loja.';
  END IF;

  IF v_ped.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é possível enviar comprovante para um pedido cancelado.';
  END IF;

  UPDATE public.pedidos
     SET comprovante_pagamento_url = v_url,
         comprovante_enviado_em = v_agora,
         forma_pagamento_catalogo = COALESCE(NULLIF(TRIM(public.pedidos.forma_pagamento_catalogo), ''), 'pix'),
         atualizado_em = v_agora
   WHERE id = p_pedido_id
     AND loja_id = p_loja_id
  RETURNING public.pedidos.forma_pagamento_catalogo INTO v_forma;

  INSERT INTO public.historico_pedidos (
    loja_id,
    pedido_id,
    usuario_id,
    tipo_evento,
    status_anterior,
    status_novo,
    descricao,
    motivo,
    criado_em
  ) VALUES (
    p_loja_id,
    p_pedido_id,
    NULL,
    'comprovante_enviado',
    v_ped.status,
    v_ped.status,
    'Comprovante de pagamento Pix enviado pelo cliente via Catálogo Online',
    'Comprovante de pagamento Pix enviado pelo cliente',
    v_agora
  );

  RETURN QUERY SELECT p_pedido_id, v_url, v_agora, v_forma;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_registrar_comprovante_pedido_catalogo(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_registrar_comprovante_pedido_catalogo(UUID, UUID, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
