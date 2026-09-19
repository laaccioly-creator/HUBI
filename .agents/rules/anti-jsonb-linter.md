# Governança Anti-JSONB (anti-jsonb-linter)

## Regra de Modelagem de Banco de Dados
Proibida a criação de colunas `JSONB` genéricas para entidades operacionais e de negócio críticas no PostgreSQL do HUBI:
- Vendas e pedidos
- Fretes, entregas e logística
- Pagamentos e transações financeiras
- Itens de pedido e movimentações de estoque

## Normalização Relacional
- Toda entidade de negócio deve ser modelada de forma relacional pura, com tabelas específicas e colunas fortemente tipadas (`NUMERIC(10,2)`, `VARCHAR`, `TIMESTAMP WITH TIME ZONE`, `BOOLEAN`, chaves estrangeiras com integridade referencial).
- Uso de campos `JSONB` (`metadados` / `configuracoes_extras`) fica estritamente restrito a flags transitórias, preferências visuais de interface ou payloads brutos de webhooks externos para auditoria.
