# 🛡️ AUDITORIA GERAL, OBSERVABILIDADE E PLANO DE EVOLUÇÃO ARQUITETURAL (HUBI)

> **Data da Auditoria:** 16/10/2026  
> **Escopo:** Segurança Multi-tenant (RLS & Credenciais), Performance & Índices SQL, Ciclo de Vida Realtime, Infraestrutura Centralizada de Logs (`sistema_logs`), Arquitetura GDM / TypeSafe System One e Resiliência Operacional.  
> **Diretrizes de Governança Aplicadas:** `diff-patch-only`, `supabase-rls-guard`, `pii-leak-detector`, `anti-jsonb-linter`.

---

## 1. DIAGNÓSTICO ATUAL POR PILAR (ACHADOS DE CÓDIGO E BANCO)

### 🛡️ Pilar 1: Segurança e Isolamento Multi-loja (RLS & Chaves)

#### 1.1. Achados Críticos de Row Level Security (RLS) no Supabase
A inspeção de [`schema.sql`](file:///c:/Users/User/Documents/HUBI/schema.sql) e das migrações em `supabase/migrations/` revelou brechas de isolamento multi-tenant que precisam de blindagem imediata:

1. **Políticas Permissivas `USING (true)` em Tabelas Operacionais Internas ([`schema.sql`](file:///c:/Users/User/Documents/HUBI/schema.sql#L668-L674)):**
   - As políticas `"cupons_loja_all"`, `"unidades_medida_all"`, `"movimentacoes_saldo_cliente_all"`, `"historico_pedidos_all"`, `"pedidos_pagamentos_previstos_all"`, `"sessoes_caixa_all"` e `"movimentacoes_caixa_all"` foram declaradas com `FOR ALL USING (true) WITH CHECK (true)`.
   - **Risco:** Como no PostgreSQL políticas `PERMISSIVE` são combinadas com `OR`, qualquer política `USING (true)` anula o isolamento de `usuario_pertence_loja(loja_id)` para aquela tabela, permitindo leitura ou mutação cruzada entre tenants se um cliente autenticado ou anônimo disparar requisições diretas via PostgREST.

2. **Exposição de PII na Tabela `public.clientes` ([`schema.sql`](file:///c:/Users/User/Documents/HUBI/schema.sql#L685-L687)):**
   - As políticas `"catalogo_clientes_publico"` (`FOR SELECT USING (true)`), `"catalogo_clientes_insert"` (`WITH CHECK (true)`) e `"catalogo_clientes_update"` (`USING (true)`) permitem leitura e alteração pública irrestrita de CPF/CNPJ, WhatsApp, e-mail e saldo de fiado de clientes de todas as lojas.
   - **Solução Arquitetural:** O sistema já dispõe da RPC `SECURITY DEFINER` [`public.salvar_cliente_catalogo`](file:///c:/Users/User/Documents/HUBI/schema.sql#L718-L782), tornando desnecessário o acesso direto `anon` de leitura/escrita irrestrita na tabela `public.clientes`.

3. **Leitura Pública Irrestrita de Colunas Sensíveis em `public.lojas` ([`schema.sql`](file:///c:/Users/User/Documents/HUBI/schema.sql#L677)):**
   - A política `"catalogo_lojas_publico"` (`FOR SELECT USING (true)`) permite que o Catálogo Público consulte os dados da vitrine, mas expõe todas as colunas da linha no PostgREST se for executado `SELECT *`, incluindo `serpapi_key` e subchaves de `configuracoes_extras`.
   - **Tabelas Conformes:** As novas tabelas [`public.organizacoes`](file:///c:/Users/User/Documents/HUBI/supabase/migrations/20261016170000_conglomerado_multilojas_e_assinaturas_mp.sql#L87-L115) e [`public.hubi_assinaturas_pagamentos`](file:///c:/Users/User/Documents/HUBI/supabase/migrations/20261016170000_conglomerado_multilojas_e_assinaturas_mp.sql#L118-L133) já estão blindadas com `auth.uid()` e `usuario_pertence_loja(loja_id)`.

#### 1.2. Varredura de Credenciais e Tokens no Front-end (`src/`)
- **Credenciais Master da Plataforma (Seguras):**
  - `SUPABASE_SERVICE_ROLE_KEY` e `MERCADO_PAGO_ACCESS_TOKEN` existem **exclusivamente** nas Edge Functions ([`hubi-criar-assinatura-mp/index.ts`](file:///c:/Users/User/Documents/HUBI/supabase/functions/hubi-criar-assinatura-mp/index.ts#L31-L32) e [`hubi-webhook-mp/index.ts`](file:///c:/Users/User/Documents/HUBI/supabase/functions/hubi-webhook-mp/index.ts#L48-L50)) via `Deno.env.get(...)`. Nenhuma chave administrativa da plataforma trafega no bundle React.
- **Pontos de Atenção BYOK (Chaves do Lojista no Front-end):**
  - [`src/components/ConfiguracoesLoja.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ConfiguracoesLoja.tsx#L721-L766): manipula `serpapi_key` (com fallback em `localStorage.getItem('hubi_serpapi_key')`) e `stripe.secret_key` dentro de `configuracoes_extras`.
  - [`src/services/uberDirectService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/uberDirectService.ts#L151-L183) e [`src/components/shipping/ShippingSettingsScreen.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/shipping/ShippingSettingsScreen.tsx#L102-L157): trafegam `uber_client_secret` para configuração e despacho.

---

### ⚡ Pilar 2: Performance, Índices SQL e Eficiência de Render

#### 2.1. Otimização de Banco de Dados e Índices Compostos Faltantes
Embora [`schema.sql`](file:///c:/Users/User/Documents/HUBI/schema.sql#L566-L638) possua índices B-Tree iniciais, as consultas analíticas do Cockpit Executivo F1 ([`src/services/dashboardJevService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/dashboardJevService.ts#L381-L488)) e da fila logística sofrem *Sequential Scans* ou *Filter Scans* nos seguintes cenários:
1. **`public.pedidos`:** Falta índice composto cobrindo `(loja_id, data_venda DESC, status)` para acelerar o recorte temporal do Cockpit F1 e DRE sem varrer pedidos cancelados (`WHERE loja_id = $1 AND status <> 'cancelado'`).
2. **`public.movimentacoes_caixa`:** As consultas do Cockpit ([`dashboardJevService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/dashboardJevService.ts#L400-L403)) filtram `.eq('loja_id', id).in('tipo', ['sangria', 'despesa'])`, mas só existe índice em `(loja_id, criado_em DESC)`. Falta índice composto `(loja_id, tipo, criado_em DESC)`.
3. **`public.transacoes_financeiras`:** As consultas filtram `.eq('loja_id', id).eq('status', 'pago')` ordenando/filtrando por `data_pagamento`. Falta índice composto `(loja_id, status, tipo, data_pagamento DESC)`.
4. **`public.itens_pedido`:** Falta índice composto `(loja_id, pedido_id, produto_id)` com `INCLUDE (quantidade, subtotal, preco_custo_unitario)` para permitir *Index-Only Scans* no cálculo de CMV e Curva ABC.

#### 2.2. Acessos Redundantes e Sobrecarga de Payload no Front-end
1. **Full Table Scan de Pedidos no Cockpit F1 ([`src/services/dashboardJevService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/dashboardJevService.ts#L382-L450)):**
   - `computarPayloadCompleto` executa `supabase.from('pedidos').select('*, cliente:clientes(*), itens:itens_pedido(*), pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*))').eq('loja_id', id)` **sem cláusula `.gte('criado_em', ...)`** no banco, trazendo todo o histórico da loja para filtrar em memória no JavaScript (linha 518).
2. **Duplicidade de Listener de Pedidos (`AppLayout` + `PedidosLista`):**
   - [`src/components/layout/AppLayout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/layout/AppLayout.tsx#L198-L243) mantém uma subscription Realtime e faz queries em `pedidos` a cada mudança na tabela, ao mesmo tempo em que [`src/components/PedidosLista.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PedidosLista.tsx#L868-L895) abre outro canal para a mesma tabela `pedidos`.

#### 2.3. Auditoria Completa do Ciclo de Vida Realtime (6 Canais Mapeados)
Todos os 6 pontos de `.channel(` do repositório foram auditados quanto à ordem `.on()` -> `.subscribe()`, unicidade de canal e filtros de tenant:

| Arquivo e Linha | Nome Atual do Canal | `.on()` antes de `.subscribe()`? | Cleanup `removeChannel`? | Diagnóstico / Risco Encontrado |
| :--- | :--- | :---: | :---: | :--- |
| [`src/hooks/useAssinaturaStatus.ts:49`](file:///c:/Users/User/Documents/HUBI/src/hooks/useAssinaturaStatus.ts#L49-L73) | `loja_assinatura_${loja.id}_${hash}` | ✅ Sim | ✅ Sim | **Corrigido e Blindado.** Sufixo único impede colisão entre componentes simultâneos. |
| [`src/components/layout/AppLayout.tsx:222`](file:///c:/Users/User/Documents/HUBI/src/components/layout/AppLayout.tsx#L221-L247) | `'pedidos-confirmados-realtime'` | ✅ Sim | ✅ Sim | **Risco Alto:** Nome estático global sem `loja.id` nem hash de instância. Em re-execuções rápidas do `useEffect` (troca de loja/usuário ou StrictMode), pode colidir no cache interno do Supabase Client. |
| [`src/hooks/usePedidosRealtime.ts:40`](file:///c:/Users/User/Documents/HUBI/src/hooks/usePedidosRealtime.ts#L39-L63) | `'hook-pedidos-realtime'` | ✅ Sim | ✅ Sim | **Risco Alto:** Nome estático global. Se dois componentes montarem `usePedidosRealtime` simultaneamente, lançará `cannot add postgres_changes callbacks after subscribe()`. |
| [`src/components/PedidoAndamentoPublico.tsx:122`](file:///c:/Users/User/Documents/HUBI/src/components/PedidoAndamentoPublico.tsx#L121-L137) | `andamento_pedido_${id}` | ✅ Sim | ✅ Sim | **Risco Crítico de Broadcast:** Os 3 listeners `.on()` (`pedidos`, `pedido_entregas`, `historico_pedidos`) **não possuem `filter`** (`id=eq.${id}` / `pedido_id=eq.${id}`). Qualquer pedido alterado em qualquer loja dispara `carregarDados()` em todos os clientes com a tela aberta. |
| [`src/components/PedidosLista.tsx:869`](file:///c:/Users/User/Documents/HUBI/src/components/PedidosLista.tsx#L868-L895) | `pedidos-lista-realtime-${loja.id}` | ✅ Sim | ✅ Sim | **Risco Médio:** O listener da linha 883 (`table: 'pedido_entregas'`) não possui `filter: loja_id=eq.${loja.id}`, recarregando a lista em eventos de outras lojas. Falta sufixo único de montagem. |
| [`src/components/VendasHistorico.tsx:245`](file:///c:/Users/User/Documents/HUBI/src/components/VendasHistorico.tsx#L244-L260) | `vendas-historico-realtime-${loja.id}` | ✅ Sim | ✅ Sim | **Risco Baixo:** Tem filtro por `loja_id`, mas recomenda-se adicionar sufixo único de instância para evitar colisão em transições rápidas de rota. |

---

### 🪵 Pilar 3: Infraestrutura Centralizada de Logs de Erros e Observabilidade

#### 3.1. Diagnóstico Atual
- **Ausência de Persistência de Erros:** Atualmente o projeto possui mais de 120 chamadas isoladas a `console.error` e `console.warn` espalhadas pelos serviços e componentes, sem persistência estruturada no Supabase. Quando um operador de caixa enfrenta uma falha silenciosa no navegador ou celular, o erro se perde no dispositivo local.
- **Ausência de `<ErrorBoundary>` Global e por Rota:** Em [`src/App.tsx`](file:///c:/Users/User/Documents/HUBI/src/App.tsx#L83-L295) e [`src/main.tsx`](file:///c:/Users/User/Documents/HUBI/src/main.tsx), não há componente de contenção (`ErrorBoundary`) nem captura global (`window.onerror` / `window.onunhandledrejection`). Qualquer exceção de renderização desmonta toda a árvore React, resultando em tela branca sem opção de recuperação de sessão.

#### 3.2. Arquitetura Proposta (`public.sistema_logs` + `loggerService.ts` + `ErrorBoundary.tsx`)
- **Tabela Relacional `public.sistema_logs`:** Colunas estritamente tipadas (`id`, `loja_id`, `organizacao_id`, `usuario_id`, `nivel`, `origem`, `contexto`, `mensagem`, `codigo_erro`, `stack_trace`, `rota_url`, `user_agent`, `criado_em`) respeitando o `anti-jsonb-linter` e o `pii-leak-detector` (sanitização automática de CPF, tokens, e-mails e telefones antes do envio).
- **Retenção Automática:** Função SQL `public.expurgar_sistema_logs_antigos()` mantendo apenas os últimos 30 dias para evitar inchaço de armazenamento.

---

### 🧩 Pilar 4: Arquitetura de Dados Mestres (GDM / TypeSafe System One)

#### 4.1. Diagnóstico da Cobertura Atual do Jev / TypeSafe System One
O HUBI já conta com uma fundação sólida em [`src/services/typesafeService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/typesafeService.ts) (conectado à Edge Function `typesafe-eval` com orçamento estrito de latência via `Promise.race` de 2000ms) e 7 micro-serviços especializados:
1. [`addressParserJevService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/addressParserJevService.ts): Extração tipada de endereços desestruturados vindos do WhatsApp.
2. [`cashAuditJevService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/cashAuditJevService.ts): Diagnóstico probabilístico (`choice`/`score`) de quebras e sobras no fechamento de turno.
3. [`creditRiskJevService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/creditRiskJevService.ts): Avaliação de risco de inadimplência na concessão de fiado.
4. [`orderGuardJevService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/orderGuardJevService.ts): Validação de anomalias em pedidos antes do despacho logístico.
5. [`dashboardJevService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/dashboardJevService.ts): Motor de inteligência executiva do Cockpit F1.
6. [`rubiCatalogoJevService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/rubiCatalogoJevService.ts) & [`catalogJevService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/catalogJevService.ts): Assistência de vendas e busca semântica na vitrine pública.
7. [`rubiRouterService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/rubiRouterService.ts): Roteador de intenções de baixa latência (< 800ms).

#### 4.2. Lacunas e Oportunidades de Expansão GDM (Global Data Model)
- **Ausência de Schemas Canônicos Compartilhados (Front-end ↔ Edge Functions ↔ Banco):** Atualmente, [`src/types.ts`](file:///c:/Users/User/Documents/HUBI/src/types.ts) concentra todas as interfaces no cliente, enquanto as Edge Functions em `supabase/functions/` validam payloads manualmente sem compartilhar contratos tipados.
- **Catálogo Multi-Loja & Sincronização de Produtos:** No conglomerado recém-implementado, cada filial cadastra produtos do zero. Um contrato GDM de **Catálogo Mestre da Organização** permitirá clonar/sincronizar produtos, códigos EAN, fotos e grades de variação da Matriz para novas filiais com 1 clique, mantendo estoques e preços locais independentes.
- **Julgamento Jev de Conciliação e Prevenção de Churn SaaS:** Usar primitivas `score` e `noul` do `typesafeService` para detectar quedas abruptas de uso em filiais recém-criadas (durante os 7 dias de trial) e sugerir ações de ativação no painel do gestor.

---

### 🔄 Pilar 5: Resiliência Operacional, Idempotência e Ajustes Imediatos

#### 5.1. Tolerância a Falhas no PDV ([`src/services/vendaService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/vendaService.ts) & [`src/services/syncService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/syncService.ts))
- **Gravação Sequencial Não-Transacional em `VendaService.gravarVendaSupabase` ([`src/services/vendaService.ts:231-350`](file:///c:/Users/User/Documents/HUBI/src/services/vendaService.ts#L231-L350)):**
  - Hoje a gravação de uma venda no PDV faz 4 chamadas de rede separadas em sequência: (1) `INSERT INTO pedidos`, (2) `INSERT INTO itens_pedido`, (3) `INSERT INTO pagamentos_pedido`, (4) `ShippingOrchestrator.salvarEntregaPedido` e `EstoquePedidoService.baixarEstoquePedido`.
  - **Risco em Oscilação de Rede:** Se a conexão cair exatamente após o passo 1 ou 2, o pedido é criado no banco sem pagamentos ou sem todos os itens, gerando inconsistência financeira e de estoque.
  - **Solução Proposta:** Criar uma RPC transacional `public.gravar_venda_pdv_atomica(...)` ou chave de idempotência `idempotency_key` no pedido para que retentativas de rede nunca dupliquem vendas.

#### 5.2. Idempotência e Ajustes Imediatos (Aplicados ✅)
1. **Trava de Idempotência em [`supabase/functions/hubi-webhook-mp/index.ts`](file:///c:/Users/User/Documents/HUBI/supabase/functions/hubi-webhook-mp/index.ts#L90-L108) (APLICADO):**
   - Adicionada verificação prévia em `hubi_assinaturas_pagamentos` por `mp_payment_id = String(payment.id)` e `status_pagamento = 'approved'`. Caso o Mercado Pago reenvie a notificação do mesmo pagamento, a função retorna `200 OK` com `idempotent_skip: true`, impedindo soma duplicada de +365 dias na vigência da loja.
2. **Contraste Visual de Alerta em [`src/components/assinatura/BannerAssinaturaTop.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/assinatura/BannerAssinaturaTop.tsx#L31-L148) (APLICADO):**
   - Atualizado para fundo vermelho escuro/sangue sólido (`bg-[#7F1D1D] border-b border-red-800`) com tipografia branca pura em alto contraste (`text-white font-extrabold`).
3. **Configuração de Parcelamento em [`supabase/functions/hubi-criar-assinatura-mp/index.ts`](file:///c:/Users/User/Documents/HUBI/supabase/functions/hubi-criar-assinatura-mp/index.ts#L77-L80) (APLICADO):**
   - Explicitados `"installments": 12` e `"default_installments": 12` no objeto `payment_methods`.

---

## 2. MATRIZ DE PRIORIZAÇÃO (IMPACTO VS. ESFORÇO)

| ID | Iniciativa / Correção | Pilar | Impacto | Esforço | Prioridade | Status |
| :-: | :--- | :-: | :-: | :-: | :-: | :-: |
| **P0.1** | Banner vermelho sangue sólido em alto contraste (`BannerAssinaturaTop.tsx`) | Pilar 5 | Alto | Baixo | **IMEDIATA** | ✅ Aplicado |
| **P0.2** | Parcelamento `installments: 12` / `default_installments: 12` (`hubi-criar-assinatura-mp`) | Pilar 5 | Alto | Baixo | **IMEDIATA** | ✅ Aplicado |
| **P0.3** | Trava de idempotência por `mp_payment_id` no webhook (`hubi-webhook-mp`) | Pilar 5 | Crítico | Baixo | **IMEDIATA** | ✅ Aplicado |
| **P1.1** | Remoção das políticas `USING (true)` em tabelas internas e substituição por `usuario_pertence_loja(loja_id)` | Pilar 1 | Crítico | Baixo | **CRÍTICA (Fase 1)** | 📋 Planejado |
| **P1.2** | Blindagem de PII em `public.clientes` e View/RPC segura para leitura pública do catálogo em `public.lojas` | Pilar 1 | Crítico | Médio | **CRÍTICA (Fase 1)** | 📋 Planejado |
| **P2.1** | Correção dos 5 canais Realtime restantes (filtros `id=eq.` / `loja_id=eq.` e sufixos únicos de instância) | Pilar 2 | Crítico | Baixo | **CRÍTICA (Fase 2)** | 📋 Planejado |
| **P2.2** | Criação dos Índices Compostos SQL para Cockpit F1, Caixa e Itens de Pedido + Filtro temporal na query do Cockpit | Pilar 2 | Alto | Baixo | **ALTA (Fase 2)** | 📋 Planejado |
| **P3.1** | Tabela `public.sistema_logs`, serviço `loggerService.ts` com sanitizador LGPD e `<ErrorBoundary>` global | Pilar 3 | Alto | Médio | **ALTA (Fase 3)** | 📋 Planejado |
| **P5.1** | Idempotência na gravação de vendas do PDV (`client_request_id` / transação atômica) | Pilar 5 | Alto | Médio | **ALTA (Fase 4)** | 📋 Planejado |
| **P4.1** | Contratos GDM compartilhados e Clonagem de Catálogo Mestre entre filiais da mesma Organização | Pilar 4 | Médio | Médio | **MÉDIA (Fase 4)** | 📋 Planejado |

---

## 3. PLANO DE IMPLEMENTAÇÃO FASEADO (CRONOLÓGICO)

### 🚀 Fase 1: Blindagem Definitiva de RLS, Multi-Tenant e Proteção de PII (Pilar 1)

**Objetivo:** Eliminar todas as políticas `USING (true)` residuais em tabelas operacionais e impedir exposição pública de PII de clientes ou chaves de API da loja.

#### 1.1. Nova Migração SQL (`supabase/migrations/20261017000000_blindagem_rls_pii_e_indices_performance.sql`)
```sql
-- ============================================================================
-- 1. REMOÇÃO DE POLÍTICAS PERMISSIVAS RESIDUAIS (USING TRUE) E BLINDAGEM RLS
-- ============================================================================

DROP POLICY IF EXISTS "cupons_loja_all" ON public.cupons;
CREATE POLICY "cupons_isolamento_loja" ON public.cupons
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "unidades_medida_all" ON public.unidades_medida;
CREATE POLICY "unidades_medida_isolamento_loja" ON public.unidades_medida
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "movimentacoes_saldo_cliente_all" ON public.movimentacoes_saldo_cliente;
CREATE POLICY "movimentacoes_saldo_cliente_isolamento_loja" ON public.movimentacoes_saldo_cliente
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "historico_pedidos_all" ON public.historico_pedidos;
CREATE POLICY "historico_pedidos_isolamento_loja" ON public.historico_pedidos
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "pedidos_pagamentos_previstos_all" ON public.pedidos_pagamentos_previstos;
CREATE POLICY "pedidos_pagamentos_previstos_isolamento_loja" ON public.pedidos_pagamentos_previstos
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "sessoes_caixa_all" ON public.sessoes_caixa;
CREATE POLICY "sessoes_caixa_isolamento_loja" ON public.sessoes_caixa
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "movimentacoes_caixa_all" ON public.movimentacoes_caixa;
CREATE POLICY "movimentacoes_caixa_isolamento_loja" ON public.movimentacoes_caixa
    FOR ALL TO authenticated
    USING (public.usuario_pertence_loja(loja_id))
    WITH CHECK (public.usuario_pertence_loja(loja_id));

-- ============================================================================
-- 2. PROTEÇÃO LGPD NA TABELA DE CLIENTES (REMOÇÃO DE LEITURA/UPDATE PÚBLICO)
-- O Catálogo Online utiliza a RPC SECURITY DEFINER public.salvar_cliente_catalogo
-- ============================================================================
DROP POLICY IF EXISTS "catalogo_clientes_publico" ON public.clientes;
DROP POLICY IF EXISTS "catalogo_clientes_insert" ON public.clientes;
DROP POLICY IF EXISTS "catalogo_clientes_update" ON public.clientes;
```

---

### ⚡ Fase 2: Índices Compostos de Alta Performance & Saneamento Realtime (Pilar 2)

**Objetivo:** Acelerar consultas do Cockpit F1/PDV em 10x em bases volumosas e blindar todos os canais WebSocket contra vazamento de eventos e colisões de canal.

#### 2.1. Índices Compostos SQL (Incluídos na Migração)
```sql
-- Índices Compostos para Cockpit Executivo F1, DRE e Curva ABC
CREATE INDEX IF NOT EXISTS idx_pedidos_loja_datavenda_status
    ON public.pedidos(loja_id, data_venda DESC, status)
    WHERE status <> 'cancelado';

CREATE INDEX IF NOT EXISTS idx_movimentacoes_caixa_loja_tipo_criado
    ON public.movimentacoes_caixa(loja_id, tipo, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_transacoes_fin_loja_status_tipo_pag
    ON public.transacoes_financeiras(loja_id, status, tipo, data_pagamento DESC);

CREATE INDEX IF NOT EXISTS idx_itens_pedido_loja_pedido_produto
    ON public.itens_pedido(loja_id, pedido_id, produto_id);
```

#### 2.2. Refatorações Cirúrgicas no Front-end (`diff-patch-only`)
1. **[`src/components/PedidoAndamentoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PedidoAndamentoPublico.tsx#L121-L137):**
   - Adicionar `filter: \`id=eq.\${id}\`` na tabela `pedidos` e `filter: \`pedido_id=eq.\${id}\`` nas tabelas `pedido_entregas` e `historico_pedidos`, além de sufixo único no nome do canal.
2. **[`src/components/layout/AppLayout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/layout/AppLayout.tsx#L221-L247) e [`src/hooks/usePedidosRealtime.ts`](file:///c:/Users/User/Documents/HUBI/src/hooks/usePedidosRealtime.ts#L39-L63):**
   - Substituir nomes estáticos `'pedidos-confirmados-realtime'` e `'hook-pedidos-realtime'` por canais escopados com `loja.id` e hash de instância (`pedidos_confirmados_${loja.id}_${hash}`).
3. **[`src/components/PedidosLista.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PedidosLista.tsx#L881-L887):**
   - Adicionar `filter: \`loja_id=eq.\${loja.id}\`` no listener de `pedido_entregas`.
4. **[`src/services/dashboardJevService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/dashboardJevService.ts#L382-L450):**
   - Limitar a busca de `transacoes_financeiras` e `movimentacoes_caixa` por janela temporal indexada e evitar tráfego desnecessário de registros antigos.

---

### 🪵 Fase 3: Infraestrutura Centralizada de Logs e Error Boundaries (Pilar 3)

**Objetivo:** Garantir observabilidade em produção com conformidade LGPD e zero telas brancas.

#### 3.1. DDL da Tabela `public.sistema_logs` (Sem JSONB genérico de negócio)
```sql
CREATE TABLE IF NOT EXISTS public.sistema_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
    organizacao_id UUID REFERENCES public.organizacoes(id) ON DELETE SET NULL,
    usuario_id UUID REFERENCES public.usuarios_loja(id) ON DELETE SET NULL,
    nivel VARCHAR(15) NOT NULL CHECK (nivel IN ('ERROR', 'WARN', 'FATAL', 'INFO')),
    origem VARCHAR(60) NOT NULL, -- Ex: 'PosCheckout', 'VendaService', 'ErrorBoundary', 'WindowOnError'
    contexto VARCHAR(120) NOT NULL, -- Ação sendo executada (ex: 'gravarVendaSupabase')
    mensagem TEXT NOT NULL,
    codigo_erro VARCHAR(50),
    stack_trace TEXT,
    rota_url VARCHAR(255),
    dispositivo_info VARCHAR(255),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sistema_logs_loja_criado
    ON public.sistema_logs(loja_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_sistema_logs_nivel_criado
    ON public.sistema_logs(nivel, criado_em DESC);

ALTER TABLE public.sistema_logs ENABLE ROW LEVEL SECURITY;

-- Qualquer operador autenticado da loja pode inserir logs da própria loja
CREATE POLICY "sistema_logs_insert_loja" ON public.sistema_logs
    FOR INSERT TO authenticated
    WITH CHECK (loja_id IS NULL OR public.usuario_pertence_loja(loja_id));

-- Apenas gestores/admins da loja podem consultar os logs da sua unidade
CREATE POLICY "sistema_logs_select_admin" ON public.sistema_logs
    FOR SELECT TO authenticated
    USING (loja_id IS NOT NULL AND public.eh_gerente_ou_admin(loja_id));

-- Função de expurgo automático para retenção enxuta (30 dias)
CREATE OR REPLACE FUNCTION public.expurgar_sistema_logs_antigos()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_removidos INTEGER;
BEGIN
    DELETE FROM public.sistema_logs
    WHERE criado_em < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS v_removidos = ROW_COUNT;
    RETURN v_removidos;
END;
$$;
```

#### 3.2. Criação do Utilitário `src/services/loggerService.ts`
- **Responsabilidades:**
  - `logger.error(origem, contexto, erro, lojaId?, usuarioId?)` e `logger.warn(...)`.
  - **Sanitizador PII integrado (`pii-leak-detector`):** Mascaramento automático via Regex de CPFs, telefones, e-mails e chaves Bearer/API antes de persistir em `public.sistema_logs`.
  - **Fila Assíncrona Não-Bloqueante (Fire-and-Forget + Debounce):** Despacha em background para o Supabase sem jamais travar a thread da UI ou o fechamento de caixa.

#### 3.3. Criação de `src/components/common/ErrorBoundary.tsx`
- Envolve `<AppRotasInternas />` em [`src/App.tsx`](file:///c:/Users/User/Documents/HUBI/src/App.tsx) e o `<Outlet />` em [`src/components/layout/AppLayout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/layout/AppLayout.tsx).
- Registra automaticamente falhas de renderização (`componentDidCatch`) e falhas globais (`window.onerror` / `unhandledrejection`) no `loggerService`.
- Exibe uma interface amigável em Dark Slate com botões `[ Tentar Novamente ]` e `[ Voltar ao PDV Seguro ]` sem perder o carrinho salvo no `localStorage`.

---

### 🔄 Fase 4: Resiliência do PDV e Contratos GDM Multi-Loja (Pilares 4 e 5)

**Objetivo:** Blindar o fechamento de vendas no PDV contra oscilações de rede e padronizar contratos de dados entre filiais do conglomerado.

1. **Prevenção de Duplicidade de Vendas em Oscilação de Rede ([`src/services/vendaService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/vendaService.ts)):**
   - Geração de chave de idempotência por rascunho de carrinho e verificação prévia antes de reinserir pedido em caso de retry automático do navegador.
   - Integração com `loggerService.error` em falhas parciais de inserção de itens ou pagamentos, acionando fallback imediato para o `SyncService` (IndexedDB offline).
2. **Contratos GDM de Catálogo Multi-Loja (`src/types/gdm.ts`):**
   - Tipagem canônica compartilhada para sincronização de produtos entre lojas da mesma `organizacao_id` e padronização de payloads entre Front-end e Edge Functions.
