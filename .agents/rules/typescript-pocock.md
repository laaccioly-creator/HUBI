# 🛡️ Engenharia Defensiva TypeScript — Padrão Matt Pocock (`typescript-pocock`)

Este documento estabelece as regras obrigatórias de **TypeScript Estrito, Modelagem de Domínio e Validação de Fronteira em Runtime** (baseadas em *Total TypeScript* de Matt Pocock), adaptadas para a stack **React 18 + Vite + Supabase (PostgREST) + TailwindCSS** do sistema **HUBI**.

---

## 1. Zero `any` e Zero Casts Cegos (`as`)
- **Proibição de `any` e `as unknown as T`:** É proibido silenciar o compilador com `any` ou casts forçados em payloads de banco de dados, eventos ou respostas de API.
- **Uso Obrigatório de `satisfies` e `as const`:** Para configurações, mapas estáticos e payloads literais, utilize `satisfies` para validar o contrato mantendo a inferência mais específica possível:
  ```typescript
  // ❌ PROIBIDO: Cast que esconde erro de constraint no banco
  const payload = {
    loja_id: lojaId,
    nome: 'Caderneta',
    tipo: 'caderneta', // Erro HTTP 400 em runtime!
  } as any;

  // ✅ OBRIGATÓRIO: Verificação estrutural estrita com satisfies
  const payload = {
    loja_id: lojaId,
    nome: 'Caderneta de Mercadinho',
    tipo: 'outro',
    ativo: true,
    taxa_percentual: 0,
  } satisfies TablesInsert<'formas_pagamento'>;
  ```

---

## 2. Derivação Estrita do Schema Supabase (`TablesInsert` / `TablesRow`)
- **Proibição de Payloads Manuais Soltos:** Nenhuma mutação `.insert()` ou `.update()` no Supabase pode usar tipos inventados manualmente que divergem das constraints `CHECK` do PostgreSQL.
- **Fonte Única de Verdade:** Todo payload enviado ao PostgREST deve satisfazer `TablesInsert<'nome_tabela'>` ou `TablesUpdate<'nome_tabela'>` definidos em `src/types/domain-contracts.ts`.
- **Distinção UI vs. Persistência:** Tipos de interface de usuário (ex: `TipoPagamentoUI` contendo `'caderneta'`) devem passar por um *mapper* determinístico e tipado antes de tocar a camada de persistência (`TipoFormaPagamentoDb`).

---

## 3. Tipos de Retorno Explícitos nas Fronteiras (`Explicit Return Types`)
- **Funções Exportadas de Serviços e Hooks:** Toda função pública exportada em `src/services/*`, `src/lib/*` e `src/utils/*` deve declarar explicitamente seu tipo de retorno (ex: `Promise<Result<Pedido, DomainError>>`).
- **Exceção:** Componentes React funcionais que retornam `JSX.Element` e callbacks inline curtos podem usar inferência natural.

---

## 4. Uniões Discriminadas para Estados e Regras Comerciais (`Discriminated Unions`)
- **Proibição de "Boolean Soup":** Nunca modele estados mutuamente exclusivos usando múltiplos booleanos ou campos opcionais concorrentes (`isLoading`, `isError`, `data?`).
- **Modelagem de Regras de Negócio:** Regras comerciais mutuamente exclusivas (como Atacado por Valor Mínimo, Quantidade Global ou Mínimo por SKU) devem ser modeladas como Uniões Discriminadas pela propriedade literal `modo` ou `status`:
  ```typescript
  // ❌ PROIBIDO: Campos simultâneos que causam contradição no PDV
  interface RegraFraca {
    tipo?: string;
    valorMinimo?: number;
    qtdGlobal?: number;
    minimoSku?: number;
  }

  // ✅ OBRIGATÓRIO: Discriminated Union (estados inválidos são irrepresentáveis)
  export type RegraComercialAtacado =
    | { readonly modo: 'VALOR_MINIMO'; readonly valorMinimo: number; readonly percentualDesconto: number }
    | { readonly modo: 'QUANTIDADE_GLOBAL'; readonly quantidadeMinima: number; readonly percentualDesconto: number }
    | { readonly modo: 'POR_SKU'; readonly quantidadeMinimaPorSku: number; readonly percentualPadrao: number };
  ```
- **Checagem Exaustiva (`assertNever`):** Todo bloco `switch` sobre uma união discriminada deve conter um ramo `default` invocando `assertNever(regra)` para garantir erro de compilação caso um novo modo seja adicionado no futuro.

---

## 5. Isolamento Multi-Tenant com Branded Types (`Branded Types`)
- **Prevenção de Vazamento entre Lojas:** Identificadores críticos (`LojaId`, `UsuarioId`, `ClienteId`, `PedidoId`, `CartStorageKey`) não devem ser passados como `string` pura em funções críticas de domínio.
- **Chave de Persistência Blindada:** A chave de armazenamento local do carrinho do PDV deve ser construída exclusivamente via factory `createCartStorageKey(lojaId: LojaId, usuarioId: UsuarioId): CartStorageKey`, tornando impossível ler ou gravar rascunhos sem o contexto validado de tenant e operador.

---

## 6. Validação de Fronteira em Runtime com Zod & Result Pattern (`Fail Fast`)
- **Fronteiras Não-Confiáveis:** Dados vindos de formulários, `localStorage`, parâmetros de URL, Edge Functions ou gateways externos (Mercado Pago, Uber Direct, Melhor Envio) devem ser validados com schemas **Zod** (`src/lib/validations/*`) antes de alimentar contextos, stores ou mutações Supabase.
- **Result Pattern (`Result<T, E>`):** Prefira retornar `{ ok: true, data: T } | { ok: false, error: E }` em operações críticas (fechamento de venda, lançamento em caderneta) em vez de lançar exceções não tipadas ou usar `try/catch` genéricos que engolem falhas.
