-- ==============================================================================
-- MIGRATION: 20260924_logistica_consolidada.sql
-- Módulo Consolidado de Logística, Despacho e Integrações HUBI
-- ==============================================================================

-- 1. TABELA public.apps_entrega
CREATE TABLE IF NOT EXISTS public.apps_entrega (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- RLS para apps_entrega
ALTER TABLE public.apps_entrega ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apps_entrega_select_policy" ON public.apps_entrega;
CREATE POLICY "apps_entrega_select_policy" ON public.apps_entrega
  FOR SELECT
  USING (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "apps_entrega_insert_policy" ON public.apps_entrega;
CREATE POLICY "apps_entrega_insert_policy" ON public.apps_entrega
  FOR INSERT
  WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "apps_entrega_update_policy" ON public.apps_entrega;
CREATE POLICY "apps_entrega_update_policy" ON public.apps_entrega
  FOR UPDATE
  USING (public.usuario_pertence_loja(loja_id))
  WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "apps_entrega_delete_policy" ON public.apps_entrega;
CREATE POLICY "apps_entrega_delete_policy" ON public.apps_entrega
  FOR DELETE
  USING (public.usuario_pertence_loja(loja_id));

CREATE INDEX IF NOT EXISTS idx_apps_entrega_loja_ativo 
  ON public.apps_entrega(loja_id, ativo);


-- 2. TABELA public.transportadoras (Relacionamento e Rastreio Completo)
CREATE TABLE IF NOT EXISTS public.transportadoras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  site VARCHAR(255) NULL,
  url_rastreio TEXT NULL,
  pessoa_contato VARCHAR(120) NULL,
  telefone VARCHAR(20) NULL,
  whatsapp VARCHAR(20) NULL,
  observacoes TEXT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- RLS para transportadoras
ALTER TABLE public.transportadoras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transportadoras_select_policy" ON public.transportadoras;
CREATE POLICY "transportadoras_select_policy" ON public.transportadoras
  FOR SELECT
  USING (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "transportadoras_insert_policy" ON public.transportadoras;
CREATE POLICY "transportadoras_insert_policy" ON public.transportadoras
  FOR INSERT
  WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "transportadoras_update_policy" ON public.transportadoras;
CREATE POLICY "transportadoras_update_policy" ON public.transportadoras
  FOR UPDATE
  USING (public.usuario_pertence_loja(loja_id))
  WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "transportadoras_delete_policy" ON public.transportadoras;
CREATE POLICY "transportadoras_delete_policy" ON public.transportadoras
  FOR DELETE
  USING (public.usuario_pertence_loja(loja_id));

CREATE INDEX IF NOT EXISTS idx_transportadoras_loja_ativo 
  ON public.transportadoras(loja_id, ativo);


-- 3. RELACIONAMENTOS EM public.pedido_entregas
ALTER TABLE public.pedido_entregas
  ADD COLUMN IF NOT EXISTS transportadora_id UUID NULL REFERENCES public.transportadoras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS app_entrega_id UUID NULL REFERENCES public.apps_entrega(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS codigo_corrida VARCHAR(100) NULL;

CREATE INDEX IF NOT EXISTS idx_pedido_entregas_transportadora_id 
  ON public.pedido_entregas(transportadora_id);


-- 4. SEEDS DEFENSIVOS POR LOJA
-- Apps de Entrega Padrão
INSERT INTO public.apps_entrega (loja_id, nome, ativo)
SELECT l.id, app.nome, true
FROM public.lojas l
CROSS JOIN (
  VALUES 
    ('Uber Flash'),
    ('99Entrega'),
    ('Lalamove')
) AS app(nome)
WHERE NOT EXISTS (
  SELECT 1 FROM public.apps_entrega ae 
  WHERE ae.loja_id = l.id AND LOWER(ae.nome) = LOWER(app.nome)
);

-- Transportadoras Padrão com Templates de Rastreio (suporte a {{codigo}})
INSERT INTO public.transportadoras (loja_id, nome, site, url_rastreio, ativo)
SELECT 
  l.id, 
  transp.nome, 
  transp.site, 
  transp.url_rastreio, 
  true
FROM public.lojas l
CROSS JOIN (
  VALUES 
    (
      'Jadlog', 
      'https://www.jadlog.com.br', 
      'https://www.jadlog.com.br/jadlog/tracking?tracking={{codigo}}'
    ),
    (
      'Braspress', 
      'https://www.braspress.com', 
      'https://www.braspress.com/rastreie-sua-encomenda/'
    ),
    (
      'Total Express', 
      'https://totalexpress.com.br', 
      'https://tracking.totalexpress.com.br/'
    )
) AS transp(nome, site, url_rastreio)
WHERE NOT EXISTS (
  SELECT 1 FROM public.transportadoras t 
  WHERE t.loja_id = l.id AND LOWER(t.nome) = LOWER(transp.nome)
);
