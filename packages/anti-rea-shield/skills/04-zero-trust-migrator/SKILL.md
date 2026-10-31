---
name: zero-trust-migrator
description: Auditoria estática de código React/TypeScript para identificar segredos VITE_* expostos e regras de negócio financeiras executadas no cliente, migrando-as para RPCs PostgreSQL SECURITY DEFINER ou Edge Functions.
---

# Skill 04: Zero-Trust Business Logic Migrator

## Objetivo
Garantir que segredos de API (Gemini, SerpApi, Mercado Pago, Uber Direct, Melhor Envio) e cálculos críticos (descontos, fechamento de caixa, limites de fiado/caderneta) residam exclusivamente no servidor.

## Fluxo de Trabalho
1. Execute o scanner estático (`ast-scanner.ts` ou `npx anti-rea-shield audit`) para listar pontos de exposição no front-end.
2. Utilize `templates/rpc-template.sql` para encapsular mutações multi-tabela em transações ACID protegidas por `public.usuario_pertence_loja(p_loja_id)`.
3. Utilize `templates/edge-fn-template.ts` para chamadas a APIs externas com chaves privadas no Vault/Secrets do Supabase.
