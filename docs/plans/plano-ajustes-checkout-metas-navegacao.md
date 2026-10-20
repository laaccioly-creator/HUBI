# Plano de Implementação: Ajustes em Checkout (Fiado), Metas do Cockpit e Guarda de Navegação Global

**Data:** 20/10/2026  
**Escopo:** Gestão de Pedidos / PDV (`ModalPagamentoFechamento.tsx` e `PosCheckout.tsx`), Persistência e Zeramento de Padrões de Metas (`dashboardService.ts`, `ConfiguracoesMetas.tsx`, `DashboardCockpit.tsx` e Migration SQL) e Correção de Falsos-Positivos no Modal Global de "Alterações Não Salvas" (`ConfiguracoesLoja.tsx`, `PosCheckout.tsx`, `CadastrosAuxiliares.tsx`).

---

## 1. Condicional de Exibição do Meio de Pagamento "Fiado" conforme Limite de Crédito do Cliente

### Diagnóstico Técnico
- Em [`PosCheckout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckout.tsx#L425-L445), a lista `formasPagamentoDisponiveis` já filtra o tipo `'fiado'` exigindo `permissions.podeAtivarFiado && clienteAptoFiado` (onde `clienteAptoFiado` valida `Boolean(clienteSelecionado && clienteSelecionado.permite_fiado && Number(clienteSelecionado.limite_credito || 0) > 0)`).
- Contudo, em [`ModalPagamentoFechamento.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalPagamentoFechamento.tsx#L195-L223) (utilizado na Gestão de Pedidos e no Fechamento/Recebimento de Pedidos), o efeito `buscarFormas` força a inclusão de `Fiado` na lista `formasPagamento` (linhas 210-213) e renderiza todos os botões de `formasPagamento` indistintamente na grade de seleção (linhas 780-816), mesmo quando:
  - O pedido não possui cliente vinculado (`!pedidoAtual.cliente`);
  - O cliente não possui permissão de fiado ativa (` !pedidoAtual.cliente.permite_fiado`);
  - O saldo disponível de limite de crédito do cliente é zero ou negativo (`Number(pedidoAtual.cliente.limite_credito || 0) <= 0`).
  *(Nota arquitetural: no modelo de dados do HUBI, `cliente.limite_credito` armazena o saldo disponível de crédito para novas compras em fiado, sendo deduzido a cada venda a prazo e recomposto na quitação).*

### Alterações Planejadas
1. **Arquivo [`src/components/ModalPagamentoFechamento.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalPagamentoFechamento.tsx):**
   - Criar o `useMemo` `clienteAptoFiado`:
     ```ts
     const clientePedido = pedidoLocal?.cliente || pedido?.cliente;
     const clienteAptoFiado = useMemo(() => {
       return Boolean(
         clientePedido?.id &&
         clientePedido.permite_fiado === true &&
         Number(clientePedido.limite_credito || 0) > 0
       );
     }, [clientePedido]);
     ```
   - Criar o `useMemo` `formasPagamentoDisponiveis` filtrando `formasPagamento` para ocultar completamente `fp.tipo === 'fiado'` caso `!clienteAptoFiado` (ou se a configuração global da loja desabilitar fiado), preservando a exibição apenas caso a linha já esteja salva originalmente como fiado em edição ou o cliente cumpra os requisitos.
   - Substituir o `.map` da grade de botões de meio de pagamento (linha 780) e a seleção de forma padrão em `handleAdicionarLinha` (linha 316) para utilizar `formasPagamentoDisponiveis`.
2. **Arquivo [`src/components/PosCheckout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckout.tsx):**
   - Reforçar `clienteAptoFiado` (linhas 426-432) garantindo validação explícita de `Boolean(clienteSelecionado?.id && clienteSelecionado.permite_fiado === true && Number(clienteSelecionado.limite_credito || 0) > 0)` e impedindo que uma linha de pagamento mantenha `forma_tipo === 'fiado'` caso o operador troque o cliente do carrinho para um cliente sem limite disponível.

---

## 2. Investigação de Causa Raiz, Persistência e Remoção de Padrões das Metas da Loja (Dashboard Cockpit)

### Diagnóstico de Causa Raiz (Por que as metas foram revertidas para 50.000 / 300 / 15.000 / 5.000)
A auditoria técnica no código e nas migrations identificou **4 causas raiz combinadas**:
1. **Ausência da coluna `meta_despesas_maximas` e defaults fixos na tabela `public.loja_metas` ([`20261002_criar_tabela_loja_metas.sql`](file:///c:/Users/User/Documents/HUBI/supabase/migrations/20261002_criar_tabela_loja_metas.sql#L7-L19)):**
   - A DDL original criou `public.loja_metas` com `DEFAULT 50000.00`, `DEFAULT 300`, `DEFAULT 15000.00`, `DEFAULT 166.00`, `DEFAULT 5.00`, `DEFAULT 25.00` e **não criou a coluna `meta_despesas_maximas`**.
   - Quando [`salvarMetasLoja`](file:///c:/Users/User/Documents/HUBI/src/services/dashboardService.ts#L395-L411) executa o `upsert`, o PostgREST falha por não encontrar `meta_despesas_maximas`, acionando o bloco de retry (linha 402) que **deleta `payload.meta_despesas_maximas`** antes de salvar. No próximo carregamento, `data.meta_despesas_maximas` vem `undefined` e cai no fallback `METAS_PADRAO_LOJA.meta_despesas_maximas ?? 5000.0` (`R$ 5.000,00`).
2. **Fallback Silencioso para `METAS_PADRAO_LOJA` em [`obterMetasLoja`](file:///c:/Users/User/Documents/HUBI/src/services/dashboardService.ts#L268-L322):**
   - Qualquer falha de rede, ausência de registro inicial na tabela `loja_metas` ou loja recém-adicionada retorna o objeto `METAS_PADRAO_LOJA` com valores fictícios (`meta_faturamento: 50000.0`, `meta_pedidos: 300`, `meta_lucro_liquido: 15000.0`, `meta_ticket_medio: 166.0`, `meta_despesas_maximas: 5000.0`, `meta_inadimplencia_maxima: 5.0`, `meta_giro_estoque: 25.0`).
3. **Conflito de Escopo Consolidado (`'todas'`) vs Loja Individual no [`DashboardCockpit.tsx`](file:///c:/Users/User/Documents/HUBI/src/pages/DashboardCockpit.tsx#L65-L67):**
   - Para gestores com mais de uma loja, o Cockpit inicia com `escopoLojaId = 'todas'`, mas o botão **"Configurar Metas"** (linha 646) passa `lojaId={loja?.id}` e no `onSucessoSalvar` (linha 651) chama `dashboardJevService.invalidarCache(loja?.id)`.
   - Na função [`invalidarCache(lojaId)`](file:///c:/Users/User/Documents/HUBI/src/services/dashboardJevService.ts#L281-L299), a limpeza remove apenas chaves que contenham o UUID de `lojaId`, **mantendo intacto o cache `hubi_cockpit_jev_v1_todas_...`** no `memoryCache` e `sessionStorage`. Além disso, qualquer filial sem metas salvas soma os valores fictícios de `METAS_PADRAO_LOJA` na visão consolidada.
4. **Travas Hardcoded de Mínimo e Fallbacks (`Math.max(1, ...)` e `?? 5000`):**
   - Em [`dashboardService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/dashboardService.ts#L251), `calcularMetasProporcionais` força `Math.max(1, ...)` em `meta_pedidos` e `?? 5000.0` em `meta_despesas_maximas` (linha 254).
   - Em [`ConfiguracoesMetas.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/configuracoes/ConfiguracoesMetas.tsx#L137), `handleSalvar` força `meta_pedidos: Math.max(1, ...)` e o input possui `min="1"` (linha 285), impedindo que a meta fique zerada (`0`).
   - Em [`DashboardCockpit.tsx`](file:///c:/Users/User/Documents/HUBI/src/pages/DashboardCockpit.tsx#L548), o velocímetro de Despesas possui fallback hardcoded `?? 5000`.

### Alterações Planejadas
1. **Nova Migration SQL [`supabase/migrations/20261021_ajustar_loja_metas_defaults_zero.sql`](file:///c:/Users/User/Documents/HUBI/supabase/migrations/20261021_ajustar_loja_metas_defaults_zero.sql):**
   - Garantir a existência das colunas `meta_despesas_maximas NUMERIC(12, 2) NOT NULL DEFAULT 0` e `meta_saude_estoque_max_ruptura NUMERIC(8, 2) NOT NULL DEFAULT 0` em `public.loja_metas`.
   - Alterar o `DEFAULT` de todas as colunas de metas (`meta_faturamento`, `meta_pedidos`, `meta_lucro_liquido`, `meta_ticket_medio`, `meta_despesas_maximas`, `meta_inadimplencia_maxima`, `meta_giro_estoque`, `meta_saude_estoque_max_ruptura`) para `0`.
   - Reafirmar `ALTER TABLE public.loja_metas ENABLE ROW LEVEL SECURITY;` e as políticas `SELECT`, `INSERT`, `UPDATE`, `DELETE` com `public.usuario_pertence_loja(loja_id)` em estrita conformidade com `supabase-rls-guard`.
2. **Arquivo [`src/services/dashboardService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/dashboardService.ts):**
   - Zerar integralmente a constante `METAS_PADRAO_LOJA`:
     ```ts
     export const METAS_PADRAO_LOJA: Omit<LojaMetas, 'id' | 'loja_id' | 'criado_em' | 'atualizado_em'> = {
       meta_faturamento: 0,
       meta_pedidos: 0,
       meta_lucro_liquido: 0,
       meta_ticket_medio: 0,
       meta_despesas_maximas: 0,
       meta_inadimplencia_maxima: 0,
       meta_giro_estoque: 0,
       meta_saude_estoque_max_ruptura: 0
     };
     ```
   - Em `calcularMetasProporcionais`, remover `Math.max(1, ...)` de `meta_pedidos` (usar `Math.max(0, Math.round(Number(metasMensais.meta_pedidos || 0) * fator))`) e remover o fallback `5000.0` de `meta_despesas_maximas` (usar `0`).
   - Em `salvarMetasLoja` e `obterMetasLoja`:
     - Remover todos os fallbacks `5000.0`.
     - Garantir persistência dupla resiliente: gravar via `upsert` na tabela `public.loja_metas` filtrada por `loja_id` **e** sincronizar espelho local por tenant (`localStorage.setItem('hubi_loja_metas_' + lojaId, JSON.stringify(...))`) + `lojas.configuracoes_extras.metas_loja` caso a coluna `meta_despesas_maximas` ainda não tenha sido aplicada no banco remoto, evitando qualquer perda de valor em recarregamentos.
3. **Arquivo [`src/components/configuracoes/ConfiguracoesMetas.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/configuracoes/ConfiguracoesMetas.tsx):**
   - Inicializar todos os estados com `0` (via `METAS_PADRAO_LOJA` zerado), remover todos os `?? 5000`, alterar `meta_pedidos` em `handleSalvar` para `Math.max(0, Math.round(metaPedidos))` e o atributo `min="0"` no input de Volume de Pedidos.
4. **Arquivos [`src/pages/DashboardCockpit.tsx`](file:///c:/Users/User/Documents/HUBI/src/pages/DashboardCockpit.tsx), [`src/services/dashboardJevService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/dashboardJevService.ts) e [`src/components/dashboard/CockpitGaugeF1.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/dashboard/CockpitGaugeF1.tsx):**
   - Em `DashboardCockpit.tsx`: remover `?? 5000` na linha 548 (usar `?? 0`); passar `lojaId={escopoLojaId !== 'todas' ? escopoLojaId : loja?.id}` para `ConfiguracoesMetas`; e em `invalidarCache` limpar tanto as chaves da `lojaId` quanto as chaves consolidadas (`_todas_`).
   - Em `CockpitGaugeF1.tsx`: quando `metaValida === 0` em métricas normais (`!escalaInvertida`), exibir `Sem meta` no badge e manter `percentualMeta = 0` para não simular 100% de meta atingida quando a meta ainda está zerada (`0`).

---

## 3. Auditoria e Correção do Modal Falso-Positivo de "Alterações Não Salvas" (Navegação Global)

### Diagnóstico de Causa Raiz
A auditoria em todos os componentes que invocam `setTemAlteracoesNaoSalvas` do [`FeedbackContext.tsx`](file:///c:/Users/User/Documents/HUBI/src/contexts/FeedbackContext.tsx) revelou o motivo exato pelo qual abrir **"Configurações"** e clicar em outro item do menu dispara o alerta *"Alterações Não Salvas"* sem nenhuma edição:

1. **Divergência estrutural entre `setSnapshotInicial` e `snapshotAtual` em [`src/components/ConfiguracoesLoja.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ConfiguracoesLoja.tsx):**
   - **Chaves de IA/Busca ausentes em `snapshotAtual`:** Na inicialização (`linhas 1074-1076`), `setSnapshotInicial` passa `googleSearchApiKey`, `googleSearchCx` e `serpApiKey` para `gerarSnapshotConfig`. Porém, o `useMemo` de `snapshotAtual` (`linhas 1536-1631`) **esqueceu de passar essas 3 propriedades**! Resultado: se a loja tiver qualquer chave configurada no banco ou no `localStorage`, `snapshotInicial` terá a chave preenchida e `snapshotAtual` terá `""`, tornando `isDirty = true` no instante em que a página abre!
   - **Fallbacks booleanos divergentes para Status de Pedidos:** Na inicialização dos estados (`linhas 976-981`) e em `gerarSnapshotConfig` (`linhas 287-292`), o fallback padrão dos status (`statusEmSeparacao`, `statusEmExpedicao`, `statusAguardandoEnvio`, `statusEnviado`, `statusEntregue`, `statusProntoRetirar`) é `?? true`. Já no objeto passado para `setSnapshotInicial` (`linhas 1145-1150`), o fallback foi escrito como `?? false`! Assim, se qualquer coluna booleana vier `null` do banco, `snapshotInicial` grava `false` enquanto `snapshotAtual` grava `true` (`isDirty = true` imediato).
   - **Propriedades `descricaoEntregas` e `tipoVenda*` ausentes em `setSnapshotInicial`:** `snapshotAtual` inclui `descricaoEntregas` (linha 1621) e `tipoVendaVarejo`, `tipoVendaAtacado`, `tipoVendaDistribuidor` (linhas 1628-1630), mas `setSnapshotInicial` (`linhas 1151-1158`) omitiu `descricaoEntregas` e as 3 flags de tipo de venda! Como o estado inicial de `descricaoEntregas` (`linha 789`) possui texto padrão e `entregaRet.descricao_entregas` pode estar vazio ou preenchido, ou `tipoVendaAtacado`/`tipoVendaDistribuidor` pode ser `false`, `snapshotInicial` e `snapshotAtual` divergem imediatamente ao montar a tela.
2. **Proteção adicional no PDV ([`src/components/PosCheckout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckout.tsx#L299-L328)):**
   - Caso o carrinho esteja vazio (`itens.length === 0`) e não haja `pedidoEmEdicao`, alterações automáticas de hidratação ou seleção de aba não devem travar a saída do PDV com modal de alterações não salvas.

### Alterações Planejadas
1. **Arquivo [`src/components/ConfiguracoesLoja.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ConfiguracoesLoja.tsx):**
   - Unificar os parâmetros de `snapshotAtual` adicionando `googleSearchApiKey`, `googleSearchCx` e `serpApiKey` na lista de propriedades e dependências do `useMemo` (`linhas 1535-1727`).
   - Em `inicializarConfiguracoesAsync` (`linhas 1062-1161`), corrigir os fallbacks de `statusEmSeparacao`..`statusProntoRetirar` para `?? true`, incluir `descricaoEntregas`, `tipoVendaVarejo`, `tipoVendaAtacado`, `tipoVendaDistribuidor` e remover a chave morta `telaInicialPadrao`.
   - Adicionar sincronização determinística via ref (`sincronizandoInicialRef`): enquanto a carga assíncrona inicial (`inicializarConfiguracoesAsync`) estiver em andamento ou recém-concluída sem interação do usuário, igualar `snapshotInicial` exatamente ao `snapshotAtual` resultante após a hidratação, e garantir que na tela de menu principal (`subTela === 'menu'`) ou em subtelas autônomas (`metas`, `whatsapp-ia`, `exportar`, `importar-exportar`) `isDirty` nunca seja disparado indevidamente.
2. **Arquivo [`src/components/PosCheckout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckout.tsx):**
   - No `useEffect` que controla `setTemAlteracoesNaoSalvas` (`linhas 299-328`), se `!pedidoEmEdicao && itens.length === 0`, atualizar `snapshotInicialRef.current = snapshotAtual` e garantir `setTemAlteracoesNaoSalvas(false)`, de modo que o modal só apareça no PDV se houver itens no carrinho não finalizados ou um pedido existente em edição modificado.

---

## 4. Plano de Verificação
1. **Build & Tipagem:** Executar `npm run build` (`tsc && vite build`) garantindo zero erros de compilação TypeScript.
2. **Checklist Funcional:**
   - **Item 1 (Fiado):** Abrir o modal de Pagamento & Fechamento para um pedido sem cliente, ou com cliente sem `permite_fiado`, ou com `limite_credito <= 0` → botão "Fiado" não é exibido. Para cliente com `permite_fiado = true` e `limite_credito > 0` → botão "Fiado" aparece normalmente.
   - **Item 2 (Metas da Loja):** Abrir Dashboard Cockpit e Configurações de Metas para loja sem metas configuradas → todos os indicadores iniciam em `0` (`R$ 0,00`). Salvar metas personalizadas → recarregar a página e alternar entre loja individual e visão consolidada → valores permanecem exatamente como salvos, sem reverter para `50.000`, `300`, `15.000` ou `5.000`.
   - **Item 3 (Navegação sem Falso-Positivo):** Abrir a tela de Configurações, navegar pelos cards ou clicar imediatamente em qualquer outro item do menu lateral (PDV, Pedidos, Produtos, Cockpit) sem editar campos → navegação ocorre livremente sem disparar o modal *"Alterações Não Salvas"*. Editar um campo de configuração e tentar sair sem salvar → modal *"Alterações Não Salvas"* é exibido corretamente.
