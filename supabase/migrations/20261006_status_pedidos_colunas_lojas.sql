-- Migração para parametrização dos status operacionais opcionais na tabela public.lojas
-- Substituição da abordagem JSONB por colunas relacionais tipadas (BOOLEAN)

ALTER TABLE public.lojas 
ADD COLUMN IF NOT EXISTS status_em_separacao BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS status_em_expedicao BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS status_aguardando_envio BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS status_enviado BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS status_entregue BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS status_pronto_para_retirar BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.lojas.status_em_separacao IS 'Habilita o status operacional Em separação';
COMMENT ON COLUMN public.lojas.status_em_expedicao IS 'Habilita o status operacional Em expedição';
COMMENT ON COLUMN public.lojas.status_aguardando_envio IS 'Habilita o status operacional Aguardando envio';
COMMENT ON COLUMN public.lojas.status_enviado IS 'Habilita o status operacional Enviado';
COMMENT ON COLUMN public.lojas.status_entregue IS 'Habilita o status operacional Entregue';
COMMENT ON COLUMN public.lojas.status_pronto_para_retirar IS 'Habilita o status operacional Pronto para retirar';
