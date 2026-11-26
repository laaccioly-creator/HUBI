-- Habilita Supabase Realtime (incluindo eventos DELETE filtrados por loja_id) na tabela public.marketplace_anuncios
ALTER TABLE public.marketplace_anuncios REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'marketplace_anuncios'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_anuncios;
  END IF;
END $$;
