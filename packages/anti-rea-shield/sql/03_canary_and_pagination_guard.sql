-- ============================================================================
-- 03_canary_and_pagination_guard.sql
-- Proteção contra raspagem em massa de catálogo (Anti-Scraping Harvest)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_listar_catalogo_protegido(
  p_loja_id uuid,
  p_limite integer DEFAULT 60,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.produtos
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite_seguro integer;
BEGIN
  IF p_loja_id IS NULL THEN
    RAISE EXCEPTION 'Identificador da loja é obrigatório.';
  END IF;

  -- Limita paginação máxima por chamada para impedir dump integral em 1 requisição
  v_limite_seguro := LEAST(GREATEST(COALESCE(p_limite, 60), 1), 120);

  RETURN QUERY
  SELECT p.*
  FROM public.produtos p
  WHERE p.loja_id = p_loja_id
    AND p.ativo = true
  ORDER BY p.nome ASC
  LIMIT v_limite_seguro
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
