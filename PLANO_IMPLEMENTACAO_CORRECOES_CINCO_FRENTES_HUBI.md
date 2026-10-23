# 📋 PLANO DE IMPLEMENTAÇÃO TÉCNICO E DETALHADO: 5 CORREÇÕES CRÍTICAS (HUBI)

> **Data:** 22/10/2026  
> **Responsável:** Arquitetura Full-Stack React / TypeScript / Supabase (HUBI)  
> **Status:** Aguardando Aprovação Formal para Execução  
> **Governança Aplicada:** `diff-patch-only`, `supabase-rls-guard`, `pii-leak-detector`, `anti-jsonb-linter`

---

## 1. Mapeamento Exato de Arquivos e Intervalos de Linhas

| # | Demanda / Escopo | Arquivo(s) Afetado(s) | Intervalo de Linhas Alvo |
| :--- | :--- | :--- | :--- |
| **1** | Padronização Visual do Bloco Caderneta em Editar/Cadastrar Cliente | `src/components/ModalNovoCliente.tsx` | Linhas `1151–1260` |
| **2** | Ajuste da Coluna `CADERNETA` na Tabela de Clientes (Saldo Devedor vs. Limite) | `src/components/ClientesFiado.tsx` | Linhas `936–965` |
| **3** | Contraste e Identificação do Botão Carrinho no Catálogo Online (Tema Claro/Escuro) | `src/components/CatalogoPublico.tsx` | Linhas `1988–2008` |
| **4** | Meios a Prazo (Fiado e Caderneta) no Checkout do Catálogo e Botão `"X"` no Modal Pedido Enviado | `src/components/CatalogoPublico.tsx` | Estados: `255–275`<br>Submit/Contábil: `1425–1660`<br>UI Checkout Drawer: `2920–3045`<br>Modal Pedido Enviado: `3047–3140` |
| **5** | Erro Crítico HTTP 400 (PostgREST) e React Error `#310` (Rules of Hooks) ao Clicar em "Receber" | `src/components/ClientesFiado.tsx`<br>`src/components/ModalPagamentoFechamento.tsx`<br>`src/components/ModalReceberPagamento.tsx`<br>`src/components/ModalSeletorDataOperacao.tsx` | `ClientesFiado.tsx`: `78–97`<br>`ModalPagamentoFechamento.tsx`: `260–325`<br>`ModalReceberPagamento.tsx`: `130–160`<br>`ModalSeletorDataOperacao.tsx`: `28–59` |

---

## 2. Correção Detalhada da Query PostgREST e Arquitetura de Hooks (Item 5)

### 2.1. Causa Raiz e Solução do Erro HTTP 400 (Bad Request no PostgREST)
- **Sintoma:**
  `GET /rest/v1/pedidos?select=id,cliente_id,data_venda,criado_em,data_vencimento_fiado,saldo_devedor,fiado_quitado,valor_total,valor_pago,pagamentos:pagamentos_pedido(eh_pagamento_fiado,forma_pagamento:formas_pagamento(tipo,prazo_dias))&loja_id=eq... 400 (Bad Request)`
- **Diagnóstico Técnico:**
  - Em `src/components/ClientesFiado.tsx` (linhas `78–96`, função `carregarFiadosVencidos`), a consulta projeta explicitamente a coluna `prazo_dias` na relação aninhada `forma_pagamento:formas_pagamento(tipo, prazo_dias)`.
  - No banco de produção do Supabase, quando a coluna `prazo_dias` não consta no schema cache da tabela `public.formas_pagamento` (fato já evidenciado pelo fallback defensivo em `CadastrosAuxiliares.tsx` linha `779`), o PostgREST rejeita imediatamente toda a query HTTP com código `400 Bad Request`.
- **Solução Arquitetural:**
  1. **No Frontend (`src/components/ClientesFiado.tsx`, linhas `90–93`):** Substituir a projeção estrita `forma_pagamento:formas_pagamento(tipo, prazo_dias)` por `forma_pagamento:formas_pagamento(*)`. O wildcard `*` retorna todas as colunas existentes no schema real sem gerar erro `400` caso `prazo_dias` não exista, mantendo compatibilidade total com `obterInfoVencimentoFiado(p)`.
  2. **Auditoria de Queries Irmãs (`PedidosLista.tsx`, `ModalPagamentoFechamento.tsx`, `ModalReceberPagamento.tsx`):** Garantir que todas as consultas aninhadas em `pagamentos_pedido` utilizem `pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*))` e que nenhuma coluna inexistente seja requisitada explicitamente.

### 2.2. Causa Raiz e Solução do Minified React Error #310 ("Rendered more hooks than during the previous render")
- **Sintoma:**
  Ao clicar no botão **"Receber"** na tela de Pedidos (`PedidosLista.tsx`) ou na gestão de clientes, a aplicação desmonta e cai no `ErrorBoundary` (*"Ops! Algo deu errado nesta tela — Minified React error #310"*).
- **Diagnóstico Técnico:**
  - `PedidosLista.tsx` (linha `4428`) mantém o componente `<ModalPagamentoFechamento />` montado na árvore com `isOpen={!!pedidoPagamentoModal}`.
  - Em `src/components/ModalPagamentoFechamento.tsx`:
    - Na **linha `264`**, existe um retorno condicional antecipado (*early return*):
      `if (!isOpen || !pedido) return null;`
    - Porém, nas **linhas `304` e `312`** (APÓS o `return null`), o componente declara dois hooks `useMemo`:
      - Linha `304`: `const clienteAptoFiado = useMemo(() => { ... }, [clientePedido]);`
      - Linha `312`: `const formasDisponiveis: FormaPagamento[] = useMemo(() => { ... }, [formasPagamento, clienteAptoFiado, linhasPagamento]);`
  - Quando `isOpen` passa de `false` (renderização inicial com 14 hooks) para `true` (ao clicar em "Receber", passando da linha 264 e executando 16 hooks), o React detecta violação direta das *Rules of Hooks* e dispara o **Erro #310**.
  - Adicionalmente, em `src/components/ModalSeletorDataOperacao.tsx` (linha `29`), há outro `if (!podeAlterarData || !modalAberto) return null;` posicionado antes de `useState` (linhas `31`, `40`) e `useEffect` (linha `44`).
- **Solução Arquitetural:**
  1. **`src/components/ModalPagamentoFechamento.tsx`:** Mover todas as derivações baseadas em `pedAtivo` / `clientePedido` e os dois blocos `useMemo` (`clienteAptoFiado` e `formasDisponiveis`) para **ANTES** da guarda `if (!isOpen || !pedido) return null;`, garantindo tratamento seguro de nulidade (`pedido?.cliente`, etc.) para que todos os hooks sejam executados incondicionalmente em 100% das renderizações.
  2. **`src/components/ModalReceberPagamento.tsx`:** Blindar a ordem dos hooks no topo do componente antes da linha `135` (`if (!isOpen || !pedido) return null;`), garantindo que qualquer memoização futura ou existente ocorra antes do early return.
  3. **`src/components/ModalSeletorDataOperacao.tsx`:** Mover o `if (!podeAlterarData || !modalAberto) return null;` da linha `29` para a linha `60` (imediatamente após o `useEffect`), eliminando qualquer risco de erro `#310` ao abrir o seletor de data de operação.

---

## 3. Especificação de Regras de Negócio e UI/UX (Itens 1 a 4)

### 3.1. Item 1 — Padronização Visual do Bloco Caderneta (`src/components/ModalNovoCliente.tsx`)
- **Diagnóstico:** Nas linhas `1151–1260`, o card `"Permite Caderneta de Mercadinho?"` e seu subcard `"Limite da Caderneta"` / `"Dia Fixo de Fechamento/Acerto"` utilizam classes em tons âmbar (`bg-amber-500`, `border-amber-500`, `text-amber-400`, `bg-amber-50`), destoando do restante do formulário.
- **Especificação de Padronização:**
  - **Card Principal (Toggle):**
    - Container do ícone `FileText`: usar estilo neutro idêntico ao padrão do sistema (`bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400`).
    - Texto de status (`Habilitado` / `Bloqueado`): `text-emerald-600 dark:text-emerald-400` quando ativo e `text-slate-500 dark:text-slate-400` quando inativo.
    - Switch (Toggle): usar `bg-emerald-600` quando `permiteCaderneta === true` e `bg-slate-300 dark:bg-slate-700` quando `false` (mesmo comportamento visual do switch de Fiado na linha `1102`).
  - **Subcard Expandido (`Limite da Caderneta` e `Dia Fixo de Fechamento/Acerto`):**
    - Container do subcard: substituir o fundo/borda âmbar por superfície neutra suave (`bg-slate-50/50 border border-slate-200 text-slate-900 dark:bg-slate-900/40 dark:border-slate-800 dark:text-white`).
    - Prefixo `R$`, input de `limiteCaderneta` e select de `diaVencimentoCaderneta`: remover todas as classes `border-amber-*` e `text-amber-*`, aplicando bordas e tipografia neutras com foco em emerald (`bg-white border border-slate-300 text-slate-900 focus:border-emerald-500 dark:bg-slate-900 dark:border-slate-700 dark:text-white`).

### 3.2. Item 2 — Ajuste da Coluna `CADERNETA` na Tabela de Clientes (`src/components/ClientesFiado.tsx`)
- **Diagnóstico:** Nas linhas `937–965`, quando `saldo_devedor_caderneta` é `0` mas `cliente.permite_caderneta` é `true`, a célula renderiza `Disp: R$ 1.000,00`, causando confusão com a coluna vizinha `"VALOR FIADO"`, que mostra exclusivamente dívida acumulada.
- **Especificação de UI/Regra:**
  - A coluna `"CADERNETA"` deve exibir **exclusivamente** o saldo devedor acumulado (`Number(cliente.saldo_devedor_caderneta || 0)`):
    - **Se `saldo_devedor_caderneta > 0`:** Renderizar o botão clicável (que abre `setClienteExtratoCaderneta(cliente)`) com o mesmo padrão visual de badge de valor a pagar da coluna `"VALOR FIADO"` (`bg-white hover:bg-slate-50 border-2 border-slate-300 text-amber-700 dark:bg-[#000000] dark:hover:bg-slate-900 dark:border-slate-700 dark:text-amber-400`), exibindo `formatarMoeda(cliente.saldo_devedor_caderneta)`.
    - **Se `saldo_devedor_caderneta <= 0` (zero ou inexistente):** Renderizar apenas um traço discreto (`-`) com `text-slate-400 dark:text-slate-600 font-mono font-bold`, sem exibir `Disp: R$ ...` e sem poluir a tabela com zeros.

### 3.3. Item 3 — Contraste e Identificação do Botão Carrinho no Catálogo Online (`src/components/CatalogoPublico.tsx`)
- **Diagnóstico:**
  - Nas linhas `1989–2008`, o botão de Carrinho usa `bg-slate-900 text-white`.
  - No arquivo global `src/index.css` (linha `157`), a regra `html.light .bg-slate-900` converte o fundo para branco no tema claro, mas a regra da linha `233` (`:not(button *):not(button)`) mantém `text-white` branco dentro de botões. Resultado: fundo claro com texto branco invisível no tema claro. Além disso, quando `totalItens > 0`, o rótulo `"Carrinho"` era ocultado.
- **Especificação de Padronização:**
  - Aplicar ao botão de Carrinho (linhas `1989–2008`) exatamente o mesmo acabamento de superfície e borda dos botões vizinhos (`Vitrine`, `Pedidos`, `Favoritos`):
    - Classes do botão: `relative p-2 sm:px-2.5 sm:py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300/80 text-slate-700 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 dark:text-white dark:border-2 dark:border-slate-400 font-semibold transition flex items-center gap-1.5 cursor-pointer text-xs shadow-xs`
  - **Conteúdo Interno do Botão:**
    - Ícone `<ShoppingBag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />`.
    - Rótulo de texto sempre presente em telas maiores: `<span className="hidden lg:inline text-slate-700 dark:text-white font-semibold">Carrinho</span>`.
    - Quando `totalItens > 0`, exibir a badge verde de alto contraste ao lado do texto:
      `<span className="bg-emerald-500 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">{totalItens}</span>`.

### 3.4. Item 4 — Meios a Prazo (Fiado e Caderneta) no Checkout do Catálogo e Botão `"X"` no Modal Pedido Enviado (`src/components/CatalogoPublico.tsx`)

#### Parte A: Seleção de Meio de Pagamento no Checkout do Catálogo
- **Regras de Elegibilidade (Cliente Autenticado no Catálogo):**
  1. **Opção Padrão (`online_combinar`):** `"Pagamento Online / Na Entrega"` (sempre disponível).
  2. **Opção `"Fiado / A Prazo"` (`fiado`):** Exibida somente se o cliente estiver identificado (`clienteSelecionado?.id`), possuir `clienteSelecionado.permite_fiado === true` e tiver limite disponível suficiente:
     $$\text{Limite Disponível Fiado} = \max(0, \text{limite\_credito} - \text{saldo\_devedor\_fiado})$$
     - Se o total do pedido ultrapassar o limite disponível, a opção aparece desabilitada com aviso claro do saldo disponível.
  3. **Opção `"Caderneta de Mercadinho"` (`caderneta`):** Exibida somente se `Boolean(loja?.caderneta_ativa)` for verdadeiro, o cliente estiver identificado (`clienteSelecionado?.id`), possuir `clienteSelecionado.permite_caderneta === true` e tiver limite disponível na caderneta:
     $$\text{Limite Disponível Caderneta} = \max(0, \text{limite\_caderneta} - \text{saldo\_devedor\_caderneta})$$
     - Se o total do pedido ultrapassar o limite disponível da caderneta, a opção aparece desabilitada informando o limite disponível.
- **Comportamento Contábil e de Persistência no Submit (`handleFinalizarPedido`):**
  - Estado local adicionado: `formaPagamentoCatalogoEscolhida: 'padrao' | 'fiado' | 'caderneta'` (inicializado como `'padrao'`, resetado caso o cliente mude ou o total supere o limite).
  - **Quando `'fiado'` for selecionado:**
    - `payloadPedido`: `forma_pagamento_catalogo: 'fiado'`, `status_pagamento: 'fiado'`, `fiado_quitado: false`, `saldo_devedor: total`, `data_vencimento_fiado` calculada (+30 dias padrão).
    - Inserção em `public.pagamentos_pedido` com `eh_pagamento_fiado: true`, `valor: total`.
    - Atualização do `saldo_devedor_fiado` do cliente em `public.clientes`.
    - **Não gera** cobrança PIX/Link do Mercado Pago (`pixInfoRes = null`, `linkPagamentoUrl = null`).
    - Mensagem de WhatsApp exibe: `💳 *Pagamento:* Fiado / A Prazo`.
  - **Quando `'caderneta'` for selecionado:**
    - `payloadPedido`: `forma_pagamento_catalogo: 'caderneta'`, `status_pagamento: 'fiado'`, `eh_venda_caderneta: true`, `ciclo_referencia_caderneta: CadernetaService.obterCicloReferenciaAtual()`, `saldo_devedor: total`.
    - Inserção em `public.pagamentos_pedido` com `eh_pagamento_caderneta: true`, `valor: total`.
    - Chamada a `CadernetaService.registrarCompraCaderneta(...)` para gravar o lançamento no ledger `public.caderneta_lancamentos` e atualizar `saldo_devedor_caderneta` do cliente.
    - **Não gera** cobrança PIX/Link do Mercado Pago (`pixInfoRes = null`, `linkPagamentoUrl = null`).
    - Mensagem de WhatsApp exibe: `💳 *Pagamento:* Caderneta de Mercadinho`.

#### Parte B: Botão `"X"` no Canto Superior Direito do Modal Pedido Enviado
- **Localização:** `src/components/CatalogoPublico.tsx` (linhas `3048–3066`, bloco `{pedidoConcluidoModal && (...)}`).
- **Especificação de UI:**
  - Adicionar `relative` ao container do modal (`bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 ...`).
  - Inserir no topo superior direito (`absolute top-4 right-4`) um botão `"X"` de fechamento rápido:
    ```tsx
    <button
      type="button"
      onClick={() => {
        setPedidoConcluidoModal(null);
        setPixAprovadoEmTempoReal(false);
      }}
      className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
      title="Fechar"
      aria-label="Fechar modal de pedido enviado"
    >
      <X className="w-5 h-5" />
    </button>
    ```
  - No modal de pedido enviado, ocultar o botão amarelo `"Pagar com Mercado Pago"` sempre que o pedido tiver sido concluído via **Fiado** ou **Caderneta**, exibindo em seu lugar uma badge informativa confirmando o lançamento em Fiado ou na Caderneta do cliente.

---

## 4. Fases e Ordem Recomendada de Execução

### Fase 1 — Estabilização Crítica: PostgREST HTTP 400 e React Error #310 (Item 5)
1. Refatorar `src/components/ModalPagamentoFechamento.tsx` movendo os hooks `useMemo` (`clienteAptoFiado` e `formasDisponiveis`) para antes do `if (!isOpen || !pedido) return null;`.
2. Refatorar `src/components/ModalSeletorDataOperacao.tsx` movendo o early return para depois dos hooks `useState` e `useEffect`.
3. Ajustar a query de `carregarFiadosVencidos` em `src/components/ClientesFiado.tsx` para usar `forma_pagamento:formas_pagamento(*)`, eliminando o erro HTTP 400.

### Fase 2 — Padronização Visual de Clientes e Caderneta (Itens 1 e 2)
1. Padronizar o bloco `"Permite Caderneta de Mercadinho?"` e seu subcard em `src/components/ModalNovoCliente.tsx` (remover âmbar/amarelo e aplicar o padrão neutro + switch emerald idêntico ao bloco de Fiado).
2. Atualizar a coluna `"CADERNETA"` em `src/components/ClientesFiado.tsx` para exibir exclusivamente o saldo devedor acumulado (`saldo_devedor_caderneta`) ou `-` quando zerado.

### Fase 3 — Catálogo Online: Contraste do Botão Carrinho, Pagamentos a Prazo e Modal Pós-Pedido (Itens 3 e 4)
1. Padronizar o botão `"Carrinho"` no cabeçalho de `src/components/CatalogoPublico.tsx` com alto contraste no tema claro (`text-slate-700`) e escuro (`text-white`), mantendo o rótulo `"Carrinho"` e a badge de quantidade.
2. Implementar o seletor de Forma de Pagamento no drawer de checkout de `src/components/CatalogoPublico.tsx` habilitando `"Fiado"` e `"Caderneta"` conforme permissão e limite disponível do cliente autenticado, integrando o registro contábil (`pagamentos_pedido`, `clientes` e `CadernetaService.registrarCompraCaderneta`).
3. Adicionar o botão `"X"` no canto superior direito do modal de Pedido Enviado em `src/components/CatalogoPublico.tsx`.

### Fase 4 — Validação de Tipagem e Build de Produção
1. Executar `npx tsc --noEmit` para assegurar zero erros de TypeScript.
2. Executar `npm run build` para validar o bundle de produção.
