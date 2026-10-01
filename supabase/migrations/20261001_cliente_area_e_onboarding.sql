-- =========================================================================
-- MIGRATION: ÁREA DO CLIENTE & ONBOARDING RELACIONAL DO CATÁLOGO ONLINE
-- Data: 2026-10-01
-- Governança: Modelagem Relacional Pura (Anti-JSONB) & RLS Multitenant
-- =========================================================================

-- 1. Resolução automática de telefones duplicados em clientes de teste
-- Mantém apenas 1 cliente com o telefone original e incrementa os demais sequencialmente (4373, 4374, 4375...)
WITH duplicados AS (
  SELECT 
    id,
    loja_id,
    telefone,
    whatsapp,
    ROW_NUMBER() OVER (
      PARTITION BY loja_id, regexp_replace(telefone, '\D', '', 'g') 
      ORDER BY criado_em DESC NULLS LAST, id DESC
    ) AS seq
  FROM public.clientes
  WHERE telefone IS NOT NULL AND trim(telefone) != ''
)
UPDATE public.clientes c
SET 
  telefone = CASE 
    WHEN regexp_replace(d.telefone, '\D', '', 'g') LIKE '%4372' THEN
      '(85) 99737-' || (4372 + d.seq - 1)::text
    ELSE 
      d.telefone || '-' || (d.seq - 1)::text
  END,
  whatsapp = CASE 
    WHEN regexp_replace(COALESCE(d.whatsapp, d.telefone), '\D', '', 'g') LIKE '%4372' THEN
      '8599737' || (4372 + d.seq - 1)::text
    WHEN d.whatsapp IS NOT NULL THEN 
      d.whatsapp || (d.seq - 1)::text
    ELSE c.whatsapp
  END
FROM duplicados d
WHERE c.id = d.id AND d.seq > 1;

-- 2. Extensão da tabela clientes para autenticação direta e OAuth
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'senha_hash'
  ) THEN
    ALTER TABLE public.clientes ADD COLUMN senha_hash VARCHAR(255);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'auth_uid'
  ) THEN
    ALTER TABLE public.clientes ADD COLUMN auth_uid UUID;
  END IF;
END $$;

-- 3. Índice para prevenção de duplicidade por telefone na mesma loja
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_loja_telefone 
  ON public.clientes (loja_id, telefone) 
  WHERE telefone IS NOT NULL AND trim(telefone) != '';

-- 4. Tabela cliente_favoritos
CREATE TABLE IF NOT EXISTS public.cliente_favoritos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cliente_produto_favorito UNIQUE (cliente_id, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_cliente_favoritos_loja_cliente 
  ON public.cliente_favoritos (loja_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_favoritos_produto 
  ON public.cliente_favoritos (produto_id);

-- 5. Tabela cliente_notificacoes
CREATE TABLE IF NOT EXISTS public.cliente_notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  titulo VARCHAR(200) NOT NULL,
  mensagem TEXT NOT NULL,
  lida BOOLEAN NOT NULL DEFAULT FALSE,
  link_acao VARCHAR(500),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cliente_notificacoes_loja_cliente 
  ON public.cliente_notificacoes (loja_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_notificacoes_lida 
  ON public.cliente_notificacoes (cliente_id, lida);

-- 6. HABILITAÇÃO DE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.cliente_favoritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_notificacoes ENABLE ROW LEVEL SECURITY;

-- Políticas para cliente_favoritos
DROP POLICY IF EXISTS "cliente_favoritos_operadores_policy" ON public.cliente_favoritos;
CREATE POLICY "cliente_favoritos_operadores_policy"
  ON public.cliente_favoritos
  FOR ALL
  TO authenticated, anon
  USING (loja_id IS NOT NULL)
  WITH CHECK (loja_id IS NOT NULL);

-- Políticas para cliente_notificacoes
DROP POLICY IF EXISTS "cliente_notificacoes_operadores_policy" ON public.cliente_notificacoes;
CREATE POLICY "cliente_notificacoes_operadores_policy"
  ON public.cliente_notificacoes
  FOR ALL
  TO authenticated, anon
  USING (loja_id IS NOT NULL)
  WITH CHECK (loja_id IS NOT NULL);
