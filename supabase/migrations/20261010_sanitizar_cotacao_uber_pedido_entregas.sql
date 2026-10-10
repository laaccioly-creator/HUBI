-- Migration: Sanitização de tokens de cotação dqt_ salvos indevidamente como código de corrida ou rastreio
-- e consolidação do provedor 'uber' em pedido_entregas.

-- 1. Garante que a coluna cotacao_id existe
ALTER TABLE public.pedido_entregas ADD COLUMN IF NOT EXISTS cotacao_id TEXT;

-- 2. Migrar tokens dqt_ que estejam em codigo_corrida ou codigo_rastreio para cotacao_id e anular os campos de despacho
UPDATE public.pedido_entregas
SET
  cotacao_id = COALESCE(cotacao_id, CASE WHEN codigo_corrida LIKE 'dqt_%' THEN codigo_corrida WHEN codigo_rastreio LIKE 'dqt_%' THEN codigo_rastreio END),
  codigo_corrida = CASE WHEN codigo_corrida LIKE 'dqt_%' THEN NULL ELSE codigo_corrida END,
  codigo_rastreio = CASE WHEN codigo_rastreio LIKE 'dqt_%' THEN NULL ELSE codigo_rastreio END
WHERE codigo_corrida LIKE 'dqt_%' OR codigo_rastreio LIKE 'dqt_%';

-- 3. Sanitizar tabela pedidos para remover tokens dqt_
UPDATE public.pedidos
SET
  codigo_corrida = CASE WHEN codigo_corrida LIKE 'dqt_%' THEN NULL ELSE codigo_corrida END,
  codigo_rastreio = CASE WHEN codigo_rastreio LIKE 'dqt_%' THEN NULL ELSE codigo_rastreio END
WHERE codigo_corrida LIKE 'dqt_%' OR codigo_rastreio LIKE 'dqt_%';

-- 4. Consolidar provedor = 'uber' para entregas cuja transportadora ou app seja Uber
UPDATE public.pedido_entregas
SET provedor = 'uber'
WHERE provedor <> 'uber'
  AND (
    LOWER(COALESCE(transportadora_nome, '')) LIKE '%uber%'
    OR LOWER(COALESCE(nome_app, '')) LIKE '%uber%'
    OR LOWER(COALESCE(forma_entrega_nome, '')) LIKE '%uber%'
  );
