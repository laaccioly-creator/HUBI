-- =========================================================================
-- MIGRATION: Adicionar pode_trocar_loja a usuarios_loja e higienizar mínimos de produtos
-- DATA: 2026-10-24
-- =========================================================================

-- 1. Adicionar coluna pode_trocar_loja na tabela usuarios_loja
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'usuarios_loja' AND column_name = 'pode_trocar_loja'
  ) THEN
    ALTER TABLE public.usuarios_loja 
    ADD COLUMN pode_trocar_loja BOOLEAN DEFAULT FALSE NOT NULL;
  END IF;
END $$;

-- 2. Conceder permissão irrestrita para todos os usuários com perfil 'owner'
UPDATE public.usuarios_loja
SET pode_trocar_loja = TRUE
WHERE perfil = 'owner';

-- 3. Resetar quantidades mínimas legadas inseridas por default automático (6 e 24)
UPDATE public.produtos
SET qtd_minima_atacado = 0
WHERE qtd_minima_atacado = 6 
  AND (tipo_minimo_atacado IS NULL OR tipo_minimo_atacado = 'padrao_loja');

UPDATE public.produtos
SET qtd_minima_autoatacado = 0
WHERE qtd_minima_autoatacado = 24 
  AND (tipo_minimo_autoatacado IS NULL OR tipo_minimo_autoatacado = 'padrao_loja');

COMMENT ON COLUMN public.usuarios_loja.pode_trocar_loja IS 'Indica se um administrador possui permissão para navegar e trocar entre diferentes lojas da conta';

-- 4. Suporte a conferência de liquidação e comprovantes na tabela caderneta_lancamentos
ALTER TABLE public.caderneta_lancamentos
  ADD COLUMN IF NOT EXISTS status_conferencia VARCHAR(30) NOT NULL DEFAULT 'confirmado'
    CHECK (status_conferencia IN ('pendente_conferencia', 'confirmado', 'recusado')),
  ADD COLUMN IF NOT EXISTS comprovante_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS metodo_pagamento_solicitado VARCHAR(60) NULL,
  ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS confirmado_por UUID NULL REFERENCES public.usuarios_loja(id) ON DELETE SET NULL;

ALTER TABLE public.caderneta_lancamentos ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.caderneta_lancamentos.status_conferencia IS 'Status da liquidação da caderneta: pendente_conferencia (solicitado manualmente no catálogo), confirmado ou recusado';
COMMENT ON COLUMN public.caderneta_lancamentos.comprovante_url IS 'URL ou DataURI do comprovante de transferência Pix anexado pelo cliente no catálogo online';
COMMENT ON COLUMN public.caderneta_lancamentos.metodo_pagamento_solicitado IS 'Nome do método de pagamento utilizado na solicitação de liquidação';
