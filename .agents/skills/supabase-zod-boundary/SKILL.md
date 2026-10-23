---
name: supabase-zod-boundary
description: Blindagem de fronteira em runtime com Zod e contratos estritos do Supabase PostgREST no sistema HUBI. Use ao criar ou revisar mutações no Supabase, fechamento de vendas com múltiplos pagamentos (split payment), lançamentos de Caderneta de Mercadinho, webhooks do Mercado Pago e hidratação de dados do localStorage.
---

# Supabase & Zod Boundary Validation (`supabase-zod-boundary`)

Esta skill define o protocolo de validação de fronteira em runtime e aderência estrita às constraints do PostgreSQL/Supabase no sistema **HUBI**.

## Quando Ativar esta Skill
- Ao implementar `.insert()`, `.update()` ou `.upsert()` no Supabase Client (`supabase.from(...)`).
- Ao processar fechamento de vendas no PDV (`PosCheckout.tsx`, `vendaService.ts`, `ModalPagamentoFechamento.tsx`).
- Ao gravar lançamentos contábeis de **Caderneta de Mercadinho** ou **Fiado**.
- Ao ler/hidratar rascunhos do `localStorage` ou respostas de APIs externas (Mercado Pago, Melhor Envio, Uber Direct).

---

## Protocolos de Blindagem de Fronteira

### 1. Prevenção de Erros HTTP 400 (CHECK Constraints do PostgreSQL)
A tabela `public.formas_pagamento` possui a constraint `CHECK (tipo IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'fiado', 'outro'))`.
- Na UI, a modalidade `'caderneta'` existe como `TipoPagamentoUI`.
- Antes de persistir em `formas_pagamento`, converta obrigatoriamente via `mapTipoPagamentoUiParaDb(tipoUi)` de `src/types/domain-contracts.ts`, que mapeia `'caderneta'` para `{ tipo: 'outro', nomePadrao: 'Caderneta de Mercadinho' } satisfies Pick<TablesInsert<'formas_pagamento'>, 'tipo'> & { nomePadrao: string }`.

### 2. Validação Pré-Mutação com Schemas Zod (`src/lib/validations/`)
Nunca inicie a criação de um cabeçalho em `public.pedidos` antes de validar o payload completo de fechamento e pré-resolver as formas de pagamento:

```typescript
import { validarFechamentoVenda } from '../lib/validations';

const validacao = validarFechamentoVenda(payloadCheckout);
if (!validacao.ok) {
  mostrarErro(validacao.error.mensagem); // Mensagem amigável em pt-BR
  return;
}
// Apenas com validacao.data garantido e tipado prossegue para o banco
```

### 3. Regras Invariantes Validadas na Fronteira
1. **Caderneta (`cadernetaLancamentoSchema`):**
   - Exige `loja_id` (`LojaId`) e `cliente_id` (`ClienteId`) em formato UUID válido.
   - Em lançamentos a débito (`tipo_lancamento === 'debito'`), valida que `valor <= (limite_caderneta - saldo_devedor_caderneta)`.
2. **Checkout / Split Payment (`fechamentoVendaSchema`):**
   - Garante pelo menos 1 linha de pagamento com `valor > 0`.
   - Garante que a soma dos pagamentos alocados corresponde ao `valor_total` líquido do pedido (tolerância de `R$ 0,01`).
   - Exige `cliente_id` válido sempre que qualquer linha utilizar `fiado` ou `caderneta`.
