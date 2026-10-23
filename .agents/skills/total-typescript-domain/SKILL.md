---
name: total-typescript-domain
description: Modelagem avançada de domínio em TypeScript baseada nos padrões de Matt Pocock (Total TypeScript) adaptada ao HUBI. Use ao modelar regras comerciais (Atacado/Distribuidor), estados de UI assíncronos, isolamento multi-tenant com Branded Types (LojaId, UsuarioId, CartStorageKey), checagem exaustiva (assertNever) e tratamento funcional de erros (Result<T, E>).
---

# Total TypeScript Domain Modeling (`total-typescript-domain`)

Esta skill orienta a implementação de modelagem de domínio defensiva no sistema **HUBI**, tornando estados inválidos e vazamentos multi-tenant impossíveis de compilar.

## Quando Ativar esta Skill
- Ao criar ou refatorar regras comerciais (ex: modalidades de preço Varejo, Atacado, Distribuidor/Autoatacado).
- Ao manipular identificadores de entidades entre múltiplos tenants (`LojaId`, `UsuarioId`, `ClienteId`, `PedidoId`).
- Ao construir chaves de persistência local (`CartStorageKey`) para evitar vazamento de carrinho no PDV.
- Ao substituir múltiplos booleanos de estado (`loading`, `error`, `success`) em componentes ou contextos React.

---

## Padrões Canônicos de Implementação

### 1. Branded Types para Isolamento Multi-Tenant
Importe sempre os tipos e construtores de `src/types/domain-contracts.ts`:

```typescript
import {
  LojaId,
  UsuarioId,
  CartStorageKey,
  toLojaId,
  toUsuarioId,
  createCartStorageKey
} from '../types/domain-contracts';

// O compilador impede passar usuarioId no lugar de lojaId:
const lojaId: LojaId = toLojaId(loja.id);
const usuarioId: UsuarioId = toUsuarioId(usuario?.id ?? 'anon');
const storageKey: CartStorageKey = createCartStorageKey(lojaId, usuarioId);
```

### 2. Discriminated Unions para Regras Comerciais
Nunca permita que `valorMinimo`, `quantidadeGlobal` e `minimoPorSku` coexistam ativos no mesmo objeto de regra. Use a união discriminada `RegraComercialAtacado` com checagem exaustiva via `assertNever`:

```typescript
import { RegraComercialAtacado, assertNever } from '../types/domain-contracts';

export function verificarElegibilidadeAtacado(
  regra: RegraComercialAtacado,
  totalReais: number,
  totalPecas: number,
  menorQtdSku: number
): boolean {
  switch (regra.modo) {
    case 'VALOR_MINIMO':
      return totalReais >= regra.valorMinimo;
    case 'QUANTIDADE_GLOBAL':
      return totalPecas >= regra.quantidadeMinima;
    case 'POR_SKU':
      return menorQtdSku >= regra.quantidadeMinimaPorSku;
    default:
      return assertNever(regra);
  }
}
```

### 3. `satisfies` + `as const` para Configurações Estáticas
Sempre valide mapas de configuração sem perder a inferência literal das chaves:

```typescript
export const MAPA_MODOS_ATACADO = {
  VALOR_MINIMO: { rotulo: 'Por Valor Mínimo Total (R$)', exigeTermometroGlobal: true },
  QUANTIDADE_GLOBAL: { rotulo: 'Por Quantidade Global de Peças', exigeTermometroGlobal: true },
  POR_SKU: { rotulo: 'Por Mínimo por Produto/SKU (Atacarejo)', exigeTermometroGlobal: false }
} as const satisfies Record<RegraComercialAtacado['modo'], { rotulo: string; exigeTermometroGlobal: boolean }>;
```

### 4. Result Pattern (`Result<T, E>`) para Operações Críticas
Evite `throw new Error` descontrolado em regras de negócio. Retorne `Result<T, DomainError>` usando os helpers `ok()` e `err()` de `src/types/domain-contracts.ts`.
