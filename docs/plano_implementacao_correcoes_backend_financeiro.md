# 📋 Plano de Implementação: Correções de Schema (`pedido_entregas`) e Fluxo Financeiro de Fiado

**Data:** 19/10/2026  
**Status:** Aguardando Revisão e Autorização  
**Diretriz:** Planejamento técnico detalhado (nenhum arquivo de código-fonte foi alterado nesta etapa).

---

## 📦 1. Sincronização de Schema / Payload em `pedido_entregas`

### 1.1. Arquivos Afetados
- [`src/services/shippingOrchestrator.ts`](file:///c:/Users/User/Documents/HUBI/src/services/shippingOrchestrator.ts) (método `salvarPedidoEntrega`, linhas 685–740)
- [`src/services/vendaService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/vendaService.ts) (montagem de `entregaPayload` em `gravarVendaSupabase`, linhas 407–438)
- [`src/components/shipping/ShippingFulfillmentSelector.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/shipping/ShippingFulfillmentSelector.tsx) (emissão de `pedido_entrega` em `emitirSelecaoManual`, linhas 925–970)
- Nova Migration SQL: `supabase/migrations/20261019_corrigir_financeiro_fiado_e_schema_entregas.sql`

### 1.2. Causa Raiz Identificada
1. **Injeção de Objetos de Relação no Estado da UI:** No componente [`ShippingFulfillmentSelector.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/shipping/ShippingFulfillmentSelector.tsx#L960-L968), ao selecionar uma modalidade manual (Frota Própria, Motoboy, Correios ou App de Entrega), a função `emitirSelecaoManual` monta o objeto `pedido_entrega` contendo tanto os IDs das chaves estrangeiras (`app_entrega_id`, `transportadora_id`) quanto os objetos completos hidratados em memória (`app_entrega: appObj || null` e `transportadora: transpObj || null`).
2. **Propagação por Spread (`...pedidoEntrega`):** Em [`VendaService.gravarVendaSupabase`](file:///c:/Users/User/Documents/HUBI/src/services/vendaService.ts#L408-L422), o payload enviado para `ShippingOrchestrator.salvarPedidoEntrega` é construído via spread `{ ...pedidoEntrega, ... }`, repassando as chaves `app_entrega` e `transportadora`.
3. **Sanitização Incompleta por Blacklist:** Em [`ShippingOrchestrator.salvarPedidoEntrega`](file:///c:/Users/User/Documents/HUBI/src/services/shippingOrchestrator.ts#L701-L714), o método tenta remover propriedades virtuais usando comandos `delete payload.<campo>` individuais (`forma_entrega_nome`, `is_frete_gratis`, `tipo_entrega`, etc.), mas **não remove `payload.app_entrega` nem `payload.transportadora`**.
4. **Rejeição pelo PostgREST:** Como a tabela `public.pedido_entregas` possui apenas as colunas relacionais escalares (`app_entrega_id`, `nome_app`, `transportadora_id`, `nome_transportadora`, `transportadora_nome`, `provedor`, `tipo_operacao`) e não possui uma coluna chamada `app_entrega`, o PostgREST rejeita o `INSERT`/`UPDATE` com o erro:
   `Could not find the 'app_entrega' column of 'pedido_entregas' in the schema cache`.
   O erro cai no bloco `catch` de `VendaService` (linha 436), gerando o `WARN` em `sistema_logs` e impedindo a gravação do registro em `pedido_entregas`.

### 1.3. Plano de Alteração Passo a Passo
1. **Sanitização por Whitelist Canônica em `ShippingOrchestrator.salvarPedidoEntrega`:**
   - Em [`src/services/shippingOrchestrator.ts`](file:///c:/Users/User/Documents/HUBI/src/services/shippingOrchestrator.ts#L685-L715), substituir a remoção parcial (`delete`) por um mapeamento estrito (whitelist) contendo exclusivamente as colunas reais da tabela `public.pedido_entregas` (`pedido_id`, `forma_entrega_id`, `tipo_atendimento`, `cliente_endereco_id`, `destino_cep`, `destino_logradouro`, `destino_numero`, `destino_complemento`, `destino_bairro`, `destino_cidade`, `destino_uf`, `destino_latitude`, `destino_longitude`, `provedor`, `transportadora_nome`, `nome_transportadora`, `transportadora_id`, `servico_codigo`, `servico_correios`, `valor_frete`, `prazo_estimado_texto`, `codigo_rastreio`, `link_rastreio`, `link_etiqueta`, `pin_entrega`, `entregador_nome`, `contato_entregador`, `nome_app`, `app_entrega_id`, `codigo_corrida`, `tipo_operacao`, `status_envio`, `cotacao_id`, `despachado_em`, `despachado_por`, `atualizado_em`), além de remover explicitamente `app_entrega` e `transportadora`.
2. **Desestruturação Preventiva no `VendaService`:**
   - Em [`src/services/vendaService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/vendaService.ts#L408-L422), omitir explicitamente `app_entrega` e `transportadora` ao construir `entregaPayload`.
3. **Sincronização de Schema e Cache PostgREST via Migration:**
   - Na migration SQL, garantir com `ADD COLUMN IF NOT EXISTS` que todas as colunas operacionais (`app_entrega_id`, `transportadora_id`, `nome_transportadora`, `nome_app`, `codigo_corrida`, `servico_correios`, `tipo_operacao`, `cotacao_id`) estejam presentes em `public.pedido_entregas` e executar `NOTIFY pgrst, 'reload schema';`.

### 1.4. Impacto e Regressões
- **Zero quebra em componentes visuais:** Os objetos `app_entrega` e `transportadora` continuam disponíveis em memória na interface `PedidoEntrega` para exibição na UI e recibos, sendo filtrados apenas no momento exato do `INSERT`/`UPDATE` no Supabase.
- **Restauração da persistência logística:** Entregas de Frota Própria, Motoboy, Correios e Apps passarão a ser gravadas sem falhas na tabela `pedido_entregas` já no primeiro disparo.

---

## 💰 2. Lançamento e Status Financeiro de Vendas no Fiado

### 2.1. Arquivos Afetados
- [`schema.sql`](file:///c:/Users/User/Documents/HUBI/schema.sql) e Nova Migration SQL: `supabase/migrations/20261019_corrigir_financeiro_fiado_e_schema_entregas.sql` (função `public.fn_gerar_financeiro_pagamento` da trigger `trg_gerar_financeiro_pagamento`)
- [`src/services/vendaService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/vendaService.ts) (cálculo de `data_vencimento_fiado` no pedido e `data_pagamento: null` para parcelas fiado em `pagamentos_pedido`)
- [`src/components/PosCheckout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckout.tsx) (repasse de `dataVencimentoFiado` para `VendaService.gravarVendaSupabase`)
- [`src/components/ModalReceberFiado.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalReceberFiado.tsx) (atualização da transação pendente em `transacoes_financeiras` na quitação)
- [`src/components/ModalHistoricoFiadoCliente.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalHistoricoFiadoCliente.tsx) (atualização da transação pendente em `transacoes_financeiras` na quitação individual ou em lote)
- [`src/components/ClientesFiado.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ClientesFiado.tsx) e [`src/components/ClientePerfilMobile.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ClientePerfilMobile.tsx) (baixa de transações pendentes de fiado na quitação rápida)
- [`src/components/ModalPagamentoFechamento.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalPagamentoFechamento.tsx) e [`src/components/ModalReceberPagamento.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalReceberPagamento.tsx) (tratamento de `data_pagamento: null` quando `forma_tipo === 'fiado'` e atualização da transação pendente ao receber)
- [`src/components/FinancasCaixa.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/FinancasCaixa.tsx) (consolidação de entradas realizadas vs. pendentes no Fluxo de Caixa)

### 2.2. Causa Raiz Identificada
1. **Trigger de Banco de Dados Incondicional (`fn_gerar_financeiro_pagamento`):**
   - No arquivo [`schema.sql` (linhas 494–526)](file:///c:/Users/User/Documents/HUBI/schema.sql#L494-L526), a trigger `trg_gerar_financeiro_pagamento` dispara `AFTER INSERT ON public.pagamentos_pedido` e executa:
     ```sql
     INSERT INTO public.transacoes_financeiras (
         loja_id, tipo, categoria, descricao, valor,
         data_vencimento, data_pagamento, status, pedido_id
     ) VALUES (
         NEW.loja_id, 'ENTRADA', 'Venda', 'Recebimento Pedido #' || NEW.pedido_id,
         NEW.valor_liquido, CURRENT_DATE, NEW.data_pagamento, 'pago', NEW.pedido_id
     );
     ```
   - A função **não verifica se `NEW.eh_pagamento_fiado = TRUE`**. Como consequência, toda venda registrada no Fiado em `pagamentos_pedido` cria imediatamente uma linha em `transacoes_financeiras` com `status = 'pago'` e `data_pagamento` preenchida!
2. **Preenchimento Indevido de `data_pagamento` e Omissão de `data_vencimento_fiado` no `VendaService`:**
   - Em [`VendaService.gravarVendaSupabase` (linha 373)](file:///c:/Users/User/Documents/HUBI/src/services/vendaService.ts#L373), mesmo quando `l.forma_tipo === 'fiado'`, o serviço enviava `data_pagamento: dataIsoFinal` para `pagamentos_pedido`.
   - Além disso, [`PosCheckout.tsx` (linhas 1504–1513)](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckout.tsx#L1504-L1513) calculava `dataVencimentoFiado`, mas **não repassava** esse campo para `VendaService.gravarVendaSupabase`, fazendo com que `pedidos.data_vencimento_fiado` ficasse `null` nas vendas online do PDV.
3. **Duplicidade / Falta de Baixa na Transação Original durante a Quitação:**
   - Quando o lojista realizava a quitação do fiado em [`ModalReceberFiado.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalReceberFiado.tsx#L246-L256) ou [`ModalHistoricoFiadoCliente.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalHistoricoFiadoCliente.tsx#L353-L363), o código inseria um novo registro em `pagamentos_pedido` (disparando novamente a trigger) **e** ainda executava um `.insert()` manual adicional em `transacoes_financeiras`, sem atualizar o registro original do pedido.
4. **Leitura de `valEfetivo` no Fluxo de Caixa (`FinancasCaixa.tsx`):**
   - Em [`src/components/FinancasCaixa.tsx` (linhas 1173–1177)](file:///c:/Users/User/Documents/HUBI/src/components/FinancasCaixa.tsx#L1173-L1177):
     ```ts
     const valEfetivo = (statusPag === 'pago' || p.status === 'concluido')
       ? (valPago > 0 ? valPago : valTotal)
       : (statusPag === 'parcialmente_pago' ? valPago : 0);
     ```
     Se um pedido com parcela fiado tivesse `p.status === 'concluido'` e `valPago === 0`, a ternária `valPago > 0 ? valPago : valTotal` caía em `valTotal` e exibia o pedido como entrada paga no fluxo de caixa.

### 2.3. Plano de Alteração Passo a Passo

#### Passo 1: Atualizar a Trigger `public.fn_gerar_financeiro_pagamento()` via Migration SQL
1. Na função `public.fn_gerar_financeiro_pagamento()`:
   - Consultar `numero_pedido` e `data_vencimento_fiado` na tabela `public.pedidos` (`WHERE id = NEW.pedido_id`).
   - **Caso 1 — Lançamento de Fiado (`NEW.eh_pagamento_fiado IS TRUE`):**
     - Inserir em `public.transacoes_financeiras` com:
       - `tipo`: `'ENTRADA'`
       - `categoria`: `'Venda a Prazo (Fiado)'`
       - `descricao`: `'Venda a Prazo (Fiado) - Pedido #' || COALESCE(v_numero_pedido::text, SUBSTRING(NEW.pedido_id::text FROM 1 FOR 8))`
       - `valor`: `NEW.valor_liquido`
       - `data_vencimento`: `COALESCE(v_data_vencimento_fiado, (CURRENT_DATE + INTERVAL '30 days')::date)`
       - `data_pagamento`: `NULL`
       - `status`: `'pendente'`
       - `pedido_id`: `NEW.pedido_id`
   - **Caso 2 — Pagamento Efetivo / Quitação (`NEW.eh_pagamento_fiado IS FALSE`):**
     - Verificar se existe transação financeira com `pedido_id = NEW.pedido_id AND status = 'pendente'` (gerada por venda fiado anterior):
       - **Se existir transação pendente para aquele pedido:**
         - Se o valor pago quitar total ou igualar/superar o valor da transação pendente (`NEW.valor_liquido >= v_transacao_pendente.valor - 0.01`):
           - Atualizar a transação existente (`UPDATE public.transacoes_financeiras`) definindo:
             - `status = 'pago'`
             - `data_pagamento = COALESCE(NEW.data_pagamento, NOW())`
             - `categoria = 'Recebimento de Fiado'`
             - `atualizado_em = NOW()`
         - Se for uma **quitação parcial** (`NEW.valor_liquido < v_transacao_pendente.valor - 0.01`):
           - Reduzir o saldo da transação pendente original (`valor = valor - NEW.valor_liquido`, mantendo `status = 'pendente'` e `data_pagamento = NULL`).
           - Inserir uma nova transação correspondente ao valor efetivamente recebido agora com `status = 'pago'`, `data_pagamento = COALESCE(NEW.data_pagamento, NOW())`, `data_vencimento = CURRENT_DATE`, `categoria = 'Recebimento de Fiado'` e `pedido_id = NEW.pedido_id`.
       - **Se NÃO existir transação pendente prévia (venda normal à vista no PDV):**
         - Inserir normalmente em `public.transacoes_financeiras` com `status = 'pago'`, `data_pagamento = COALESCE(NEW.data_pagamento, NOW())`, `data_vencimento = COALESCE(NEW.data_pagamento::date, CURRENT_DATE)`.
2. **Correção Retroativa de Dados na Migration:**
   - Corrigir automaticamente no banco as transações de pedidos que foram vendidas no fiado e ainda não foram quitadas (ex.: Pedido #9), ajustando `status = 'pendente'`, `data_pagamento = NULL` e `data_vencimento = COALESCE(p.data_vencimento_fiado, (p.criado_em::date + 30))` para todos os registros em `transacoes_financeiras` cujo pedido associado tenha `saldo_devedor > 0` e `valor_pago = 0`.

#### Passo 2: Ajustar `VendaService` e `PosCheckout` na Criação da Venda Fiado
1. Em [`src/services/vendaService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/vendaService.ts):
   - Adicionar `dataVencimentoFiado?: string | null` em `GravarVendaParams`.
   - Se `valorFiadoTotal > 0` e `dataVencimentoFiado` não vier preenchida, calcular automaticamente com base no `prazo_dias` da forma de pagamento `'fiado'` (padrão 30 dias) e persistir em `pedidos.data_vencimento_fiado`.
   - Na montagem de `pagamentosFormatados` (linha 373), definir:
     `data_pagamento: l.forma_tipo === 'fiado' ? null : dataIsoFinal`.
2. Em [`src/components/PosCheckout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckout.tsx#L1676-L1699) e [`ModalPagamentoFechamento.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalPagamentoFechamento.tsx#L401):
   - Passar `dataVencimentoFiado` para `VendaService.gravarVendaSupabase`.
   - Em `ModalPagamentoFechamento.tsx`, usar `data_pagamento: l.forma_tipo === 'fiado' ? null : dataIso`.

#### Passo 3: Unificar o Fluxo de Quitação de Fiado nos Modais de Cobrança
1. Em [`src/components/ModalReceberFiado.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalReceberFiado.tsx) e [`src/components/ModalHistoricoFiadoCliente.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalHistoricoFiadoCliente.tsx):
   - Quando a quitação está vinculada a um pedido (`pedido`), a inserção da linha em `pagamentos_pedido` (`eh_pagamento_fiado: false`) já acionará a trigger `fn_gerar_financeiro_pagamento`, que atualizará a transação `'pendente'` daquele pedido em `transacoes_financeiras` para `'pago'` com `data_pagamento = dataIso`.
   - Remover o `.insert()` redundante em `transacoes_financeiras` quando `pedido` estiver presente (evitando duplicação de receitas), mantendo apenas um fallback de atualização direta (`UPDATE transacoes_financeiras SET status = 'pago', data_pagamento = dataIso WHERE pedido_id = ped.id AND status = 'pendente'`) ou inserção apenas quando for abatimento avulso sem pedido vinculado.
   - Na quitação em lote de múltiplos pedidos (`ModalHistoricoFiadoCliente.tsx`, linhas 391–430) e na quitação rápida (`ClientesFiado.tsx` e `ClientePerfilMobile.tsx`), atualizar as transações `'pendente'` em `transacoes_financeiras` dos pedidos quitados para `status = 'pago'` e `data_pagamento = dataIso`, sempre filtrando por `.eq('loja_id', loja.id)`.

#### Passo 4: Blindar a Consolidação de Caixa e Relatórios (`FinancasCaixa.tsx` e RPC Cockpit)
1. Em [`src/components/FinancasCaixa.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/FinancasCaixa.tsx#L1163-L1185):
   - Garantir que em pedidos com `saldo_devedor > 0` (fiado total ou parcial), `valEfetivo` considere **estritamente `Number(p.valor_pago || 0)`** (nunca caindo no fallback `valTotal` quando `valPago === 0`).
   - Permitir que as transações de `transacoes_financeiras` com `status === 'pendente'` (vendas no fiado ainda não recebidas) sejam listadas com `status: 'pendente'` na aba de lançamentos futuros / a receber, sem somar no saldo realizado do caixa.
2. Na RPC `public.obter_metricas_cockpit`:
   - Preservar o cálculo de **Faturamento Contábil** sobre o valor total vendido dos pedidos válidos (`valor_total`), mantendo o fiado contabilizado no faturamento comercial da loja, enquanto o **Fluxo de Caixa Realizado** e a **Sessão de Caixa** refletem estritamente os valores efetivamente pagos.

### 2.4. Impacto e Regressões
- **Faturamento Contábil vs. Caixa Realizado:** O faturamento bruto comercial continuará contabilizando a venda realizada no pedido, mas o caixa físico/digital e as entradas realizadas de `transacoes_financeiras` não serão inflados por valores ainda não recebidos.
- **Sessão de Caixa (`caixaService`):** Permanece protegida, pois `VendaService` (linha 475) já filtra `l.forma_tipo !== 'fiado'` para `movimentacoes_caixa`, e os modais de recebimento de fiado lançam no caixa apenas no ato do recebimento efetivo.
- **Isolamento Multi-Tenant (RLS):** Todas as queries e updates em `transacoes_financeiras`, `pedidos` e `clientes` manterão obrigatoriamente `.eq('loja_id', loja.id)`.
