-- Migration: 20261102_add_flags_disparo_whatsapp_lojas.sql
-- Adiciona flags granulares de controle de disparo de WhatsApp na tabela lojas

ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS wpp_auto_pedido_confirmado BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS wpp_auto_pesagem_concluida BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS wpp_auto_status_separacao BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wpp_auto_pronto_retirada BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS wpp_auto_despacho_rastreio BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS wpp_auto_pedido_entregue BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wpp_auto_recibo_venda BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wpp_auto_comprovante_fiado BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.lojas.wpp_auto_pedido_confirmado IS 'Disparo automático ao confirmar novo pedido do catálogo';
COMMENT ON COLUMN public.lojas.wpp_auto_pesagem_concluida IS 'Disparo automático ao liberar pagamento de itens pesáveis';
COMMENT ON COLUMN public.lojas.wpp_auto_status_separacao IS 'Disparo automático em mudanças de status do pedido';
COMMENT ON COLUMN public.lojas.wpp_auto_pronto_retirada IS 'Disparo automático quando o pedido está pronto para retirada';
COMMENT ON COLUMN public.lojas.wpp_auto_despacho_rastreio IS 'Disparo automático com código e link de rastreio de envio';
COMMENT ON COLUMN public.lojas.wpp_auto_pedido_entregue IS 'Disparo automático quando a entrega é concluída com sucesso';
COMMENT ON COLUMN public.lojas.wpp_auto_recibo_venda IS 'Disparo automático do recibo digital de venda no PDV Balcão';
COMMENT ON COLUMN public.lojas.wpp_auto_comprovante_fiado IS 'Disparo automático do comprovante de lançamento na caderneta/fiado';

NOTIFY pgrst, 'reload schema';
