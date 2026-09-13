-- ==============================================================================
-- SISTEMA HUBI - SCRIPT DE LIMPEZA DE DADOS OPERACIONAIS / MOVIMENTAÇÕES
-- Mantém 100% intactas todas as tabelas de cadastro e configurações.
-- ==============================================================================
-- 
-- TABELAS DE CADASTRO PRESERVADAS (NADA É APAGADO):
--   ✓ lojas (Configurações, dados da empresa, slug do catálogo)
--   ✓ usuarios_loja (Usuários, vendedores e permissões)
--   ✓ categorias (Categorias de produtos)
--   ✓ fornecedores (Cadastro de fornecedores)
--   ✓ produtos (Produtos, preços de varejo/atacado/autoatacado, fotos, códigos)
--   ✓ variacoes_produto (Grade de tamanhos/cores/variações dos produtos)
--   ✓ itens_combo (Composição de kits e combos)
--   ✓ clientes (Cadastro de clientes, contatos, endereços, limites de crédito)
--   ✓ formas_pagamento (Configurações de meios de pagamento e taxas)
--   ✓ formas_entrega (Opções de entrega e fretes)
--   ✓ cupons (Cupons de desconto cadastrados)
--   ✓ unidades_medida (Unidades cadastradas)
--
-- TABELAS OPERACIONAIS LIMPAS (DADOS TRANSACIONAIS ZERADOS):
--   ✗ pedidos (Vendas PDV e pedidos do catálogo)
--   ✗ itens_pedido (Itens vendidos em cada pedido)
--   ✗ pagamentos_pedido (Registros de pagamentos das vendas)
--   ✗ historico_pedidos (Auditoria e logs de alteração dos pedidos)
--   ✗ transacoes_financeiras (Fluxo de caixa, despesas, contas pagas/pendentes)
--   ✗ movimentacoes_caixa (Suprimentos, sangrias, vendas e despesas do caixa)
--   ✗ sessoes_caixa (Aberturas e fechamentos de sessões de caixa)
--   ✗ caixas (Controle legado de caixas)
--   ✗ movimentacoes_saldo_cliente (Histórico de transações de saldo de clientes)
--
-- ==============================================================================

BEGIN;

-- 1. LIMPEZA DO MÓDULO FINANCEIRO E FLUXO DE CAIXA
DELETE FROM public.transacoes_financeiras;

-- 2. LIMPEZA DO MÓDULO DE CAIXA (SESSÕES E MOVIMENTAÇÕES)
DELETE FROM public.movimentacoes_caixa;
DELETE FROM public.sessoes_caixa;
DELETE FROM public.caixas;

-- 3. LIMPEZA DE HISTÓRICO DE SALDO DE CLIENTES (CASO A TABELA EXISTA)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'movimentacoes_saldo_cliente'
    ) THEN
        EXECUTE 'DELETE FROM public.movimentacoes_saldo_cliente';
    END IF;
END $$;

-- 4. LIMPEZA DE PEDIDOS, ITENS, PAGAMENTOS E AUDITORIA
DELETE FROM public.historico_pedidos;
DELETE FROM public.pagamentos_pedido;
DELETE FROM public.itens_pedido;
DELETE FROM public.pedidos;

-- 5. REINICIAR A SEQUÊNCIA NUMÉRICA DOS PEDIDOS PARA RECOMEÇAR DO #1
ALTER SEQUENCE IF EXISTS public.pedidos_numero_pedido_seq RESTART WITH 1;

-- 6. AJUSTAR O SALDO DEVEDOR DE FIADO DOS CLIENTES
-- Como todos os pedidos e pagamentos foram apagados, os débitos acumulados
-- de fiado são zerados, mantendo intactos o cadastro e o limite de crédito.
UPDATE public.clientes
SET saldo_devedor_fiado = 0.00;

-- 7. (OPCIONAL) SE DESEJAR ZERAR OU RESTAURAR O ESTOQUE DOS PRODUTOS:
-- Caso deseje manter o estoque como está atualmente, NÃO execute as linhas abaixo.
-- Se desejar zerar o estoque de todos os produtos, descomente as duas linhas a seguir:
-- UPDATE public.produtos SET quantidade_estoque = 0;
-- UPDATE public.variacoes_produto SET quantidade_estoque = 0;

COMMIT;

-- Mensagem de confirmação de sucesso
DO $$
BEGIN
    RAISE NOTICE 'Limpeza de dados operacionais concluída com sucesso! Todos os cadastros foram preservados.';
END $$;
