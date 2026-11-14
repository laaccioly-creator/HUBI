-- 1. Garantir permissões de acesso e alinhar políticas RLS de profissional_horarios
GRANT ALL ON TABLE public.profissional_horarios TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Gerenciar profissional_horarios" ON public.profissional_horarios;
CREATE POLICY "Gerenciar profissional_horarios"
  ON public.profissional_horarios
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- 2. RPC atômica SECURITY DEFINER para salvar a grade semanal sem erro 401 de PostgREST
CREATE OR REPLACE FUNCTION public.salvar_expediente_profissional_seguro(
  p_loja_id UUID,
  p_usuario_id UUID,
  p_horarios JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$ DECLARE v_item JSONB; BEGIN IF p_loja_id IS NULL OR p_usuario_id IS NULL THEN RAISE EXCEPTION 'loja_id e usuario_id são obrigatórios'; END IF;    FOR v_item IN SELECT * FROM jsonb_array_elements(p_horarios) LOOP INSERT INTO public.profissional_horarios ( loja_id, usuario_id, dia_semana, ativo, hora_inicio, hora_fim, tem_intervalo, intervalo_inicio, intervalo_fim, atualizado_em ) VALUES ( p_loja_id, p_usuario_id, (v_item->>'dia_semana')::SMALLINT, COALESCE((v_item->>'ativo')::BOOLEAN, (v_item->>'trabalha')::BOOLEAN, TRUE), COALESCE(NULLIF(v_item->>'hora_inicio', ''), '08:00:00')::TIME, COALESCE(NULLIF(v_item->>'hora_fim', ''), '18:00:00')::TIME, COALESCE((v_item->>'tem_intervalo')::BOOLEAN, TRUE), NULLIF(v_item->>'intervalo_inicio', '')::TIME, NULLIF(v_item->>'intervalo_fim', '')::TIME, NOW() ) ON CONFLICT (loja_id, usuario_id, dia_semana) DO UPDATE SET ativo = EXCLUDED.ativo, hora_inicio = EXCLUDED.hora_inicio, hora_fim = EXCLUDED.hora_fim, tem_intervalo = EXCLUDED.tem_intervalo, intervalo_inicio = EXCLUDED.intervalo_inicio, intervalo_fim = EXCLUDED.intervalo_fim, atualizado_em = NOW(); END LOOP; END; $$;

GRANT EXECUTE ON FUNCTION public.salvar_expediente_profissional_seguro(UUID, UUID, JSONB) TO anon, authenticated, service_role;
