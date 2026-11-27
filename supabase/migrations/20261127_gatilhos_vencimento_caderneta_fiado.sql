-- ==============================================================================
-- Migration: 20261127_gatilhos_vencimento_caderneta_fiado.sql
-- Objetivo: Gatilhos condicionais de lembrete de vencimento (Caderneta e Fiado)
-- no WhatsApp, com tabela relacional de idempotência diária e agendamento pg_cron.
-- Regra Arquitetural: 100% Relacional (ZERO JSONB / metadados).
-- ==============================================================================

-- 1. Colunas relacionais tipadas em public.lojas
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS wpp_auto_vencimento_caderneta BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS wpp_auto_vencimento_fiado BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.lojas.wpp_auto_vencimento_caderneta IS 'Ativa o disparo automático matinal (08:00 BRT) no dia do vencimento da Caderneta de Mercadinho.';
COMMENT ON COLUMN public.lojas.wpp_auto_vencimento_fiado IS 'Ativa o disparo automático matinal (08:00 BRT) no dia do vencimento das compras Fiado / a prazo.';

-- 2. Tabela relacional dedicada de idempotência diária (zero JSONB)
CREATE TABLE IF NOT EXISTS public.crediario_lembretes_enviados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  pedido_id UUID NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  tipo_credito VARCHAR(20) NOT NULL CHECK (tipo_credito IN ('caderneta', 'fiado')),
  data_vencimento DATE NOT NULL,
  valor_cobrado NUMERIC(12,2) NOT NULL,
  modo_envio VARCHAR(30) NOT NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.crediario_lembretes_enviados IS 'Registro relacional idempotente dos lembretes de vencimento (Caderneta/Fiado) disparados no WhatsApp.';

-- 3. Índices de unicidade diária e consulta por loja/data
CREATE UNIQUE INDEX IF NOT EXISTS uq_crediario_lembretes_enviados_dia
  ON public.crediario_lembretes_enviados (
    loja_id,
    tipo_credito,
    cliente_id,
    COALESCE(pedido_id, '00000000-0000-0000-0000-000000000000'::uuid),
    data_vencimento
  );

CREATE INDEX IF NOT EXISTS idx_crediario_lembretes_loja_data
  ON public.crediario_lembretes_enviados (loja_id, data_vencimento);

-- 4. Blindagem RLS Multi-tenant (SELECT, INSERT, UPDATE, DELETE)
ALTER TABLE public.crediario_lembretes_enviados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crediario_lembretes_select_loja" ON public.crediario_lembretes_enviados;
CREATE POLICY "crediario_lembretes_select_loja"
  ON public.crediario_lembretes_enviados
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "crediario_lembretes_insert_loja" ON public.crediario_lembretes_enviados;
CREATE POLICY "crediario_lembretes_insert_loja"
  ON public.crediario_lembretes_enviados
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "crediario_lembretes_update_loja" ON public.crediario_lembretes_enviados;
CREATE POLICY "crediario_lembretes_update_loja"
  ON public.crediario_lembretes_enviados
  FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
  WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "crediario_lembretes_delete_loja" ON public.crediario_lembretes_enviados;
CREATE POLICY "crediario_lembretes_delete_loja"
  ON public.crediario_lembretes_enviados
  FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crediario_lembretes_enviados TO authenticated;
GRANT ALL ON public.crediario_lembretes_enviados TO service_role;

-- 5. Agendamento matinal pg_cron às 08:00 BRT (11:00 UTC) de forma segura e idempotente
DO $$
DECLARE
  v_job_id BIGINT;
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    SELECT jobid INTO v_job_id
      FROM cron.job
     WHERE jobname = 'hubi-whatsapp-lembretes-vencimento-08h-brt'
     LIMIT 1;

    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;

    v_supabase_url := NULLIF(current_setting('app.settings.supabase_url', true), '');
    v_service_key := NULLIF(current_setting('app.settings.service_role_key', true), '');

    IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
      PERFORM cron.schedule(
        'hubi-whatsapp-lembretes-vencimento-08h-brt',
        '0 11 * * *',
        format(
          $cron$
          SELECT net.http_post(
            url := %L,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || %L
            ),
            body := '{}'::jsonb
          );
          $cron$,
          v_supabase_url || '/functions/v1/whatsapp-lembretes-vencimento',
          v_service_key
        )
      );
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Aviso ao configurar cron matinal whatsapp-lembretes-vencimento: %', SQLERRM;
END $$;
