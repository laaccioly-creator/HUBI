-- ==============================================================================
-- MIGRATION: 20261122233000_ciclos_fechamento_caderneta.sql
-- Adiciona colunas relacionais dedicadas para ciclos da Caderneta de Mercadinho
-- (semanal, quinzenal e mensal) em public.clientes e public.lojas
-- ==============================================================================

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS ciclo_caderneta TEXT DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS dia_semana_caderneta INTEGER,
  ADD COLUMN IF NOT EXISTS dia_vencimento_2_caderneta INTEGER;

ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS ciclo_padrao_caderneta TEXT DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS dia_semana_padrao_caderneta INTEGER,
  ADD COLUMN IF NOT EXISTS dia_vencimento_2_padrao_caderneta INTEGER;

COMMENT ON COLUMN public.clientes.ciclo_caderneta IS 'Frequência de fechamento da caderneta: semanal, quinzenal ou mensal';
COMMENT ON COLUMN public.clientes.dia_semana_caderneta IS 'Dia da semana do acerto (0 = Domingo a 6 = Sábado) para ciclo semanal';
COMMENT ON COLUMN public.clientes.dia_vencimento_2_caderneta IS 'Segundo dia do mês (1 a 31) para ciclo quinzenal';
COMMENT ON COLUMN public.lojas.ciclo_padrao_caderneta IS 'Frequência padrão de fechamento da caderneta para novos clientes';
COMMENT ON COLUMN public.lojas.dia_semana_padrao_caderneta IS 'Dia da semana padrão (0 a 6) para caderneta semanal';
COMMENT ON COLUMN public.lojas.dia_vencimento_2_padrao_caderneta IS 'Segundo dia do mês padrão (1 a 31) para caderneta quinzenal';
