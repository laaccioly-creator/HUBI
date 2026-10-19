# 📋 Plano de Implementação: Correções de PDV, Recibos, Cupons e Expedição (Melhor Envio / Frete)

> **Status do Documento:** Aguardando Aprovação Formal  
> **Diretriz de Governança:** Conformidade estrita com `AGENTS.md` e `GEMINI.md` (`diff-patch-only`, `supabase-rls-guard`, `pii-leak-detector`, `anti-jsonb-linter`).  
> **Escopo:** Diagnóstico técnico de causa raiz e plano cirúrgico para 8 apontamentos operacionais do PDV, impressão térmica, cálculo de cupom de frete grátis e logística integrada.

---

## 1. Abertura indevida do modal ao alternar forma de entrega no PDV

### 1.1. Arquivos Afetados
- `src/components/PosCheckout.tsx` (Seletor de Forma de Entrega na barra lateral do carrinho PDV, linhas `2508–2531`).

### 1.2. Causa Raiz Identificada
No componente `PosCheckout.tsx`, o evento `onClick` do botão **"Envio"** (linha `2519`) invoca diretamente `setModalDefinirEnvioAberto(true)` logo após atualizar o estado `pedidoEntrega` com `tipo_atendimento: 'entrega'`. Enquanto no componente `src/components/vendas/CarrinhoVenda.tsx` (linha `269`) a alternância apenas altera o estado `setTipoEntrega('envio')`, no `PosCheckout.tsx` o acionamento do modal foi acoplado indevidamente à troca do seletor.

### 1.3. Plano de Alteração Passo a Passo
1. No handler `onClick` do botão **"Envio"** em `src/components/PosCheckout.tsx` (linhas `2510–2520`), remover a chamada `setModalDefinirEnvioAberto(true)`.
2. Preservar a atualização do estado interno (`setTaxaEntrega(0)`, `setPedidoEntrega(...)` com `tipo_atendimento: 'entrega'` e `setFreteConfirmado(false)`).
3. Manter a abertura do `ModalDefinirEnvio` exclusivamente vinculada ao clique intencional no botão **"Opções de Envio"** (`onClick={() => setModalDefinirEnvioAberto(true)}` na linha `2815`) ou ao atalho **"A definir"** dentro do modal de fechamento (linha `3349`).

```diff
diff --git a/src/components/PosCheckout.tsx b/src/components/PosCheckout.tsx
--- a/src/components/PosCheckout.tsx
+++ b/src/components/PosCheckout.tsx
@@ -2516,6 +2516,5 @@
                       servico_codigo: 'pendente'
                     });
                     setFreteConfirmado(false);
-                    setModalDefinirEnvioAberto(true);
                   }}
                   className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
```

### 1.4. Impacto e Regressão
- **Impacto Positivo:** O operador de caixa pode alternar livremente entre "Retirada" e "Envio" sem interrupção visual de modal, abrindo a cotação/opções de envio apenas quando desejar.
- **Prevenção de Regressão:** A trava de segurança no modal de pagamento (`ehEnvio && !isFreteConfirmado`) permanece intacta, impedindo que uma venda na modalidade "Envio" seja concluída sem definição prévia do frete.

---

## 2. Notificação/Toast sobrepondo os botões inferiores do carrinho

### 2.1. Arquivos Afetados
- `src/components/PosCheckout.tsx` (Callback `onConfirmarEnvio` do `ModalDefinirEnvio`, linha `3592`).

### 2.2. Causa Raiz Identificada
Ao confirmar a seleção de envio no `ModalDefinirEnvio` dentro do `PosCheckout.tsx` (linha `3592`), o callback `onConfirmarEnvio` executa `mostrarSucesso(\`Frete definido: R$ ${valFrete.toFixed(2)}!\`)`. No `FeedbackContext.tsx`, `mostrarSucesso` dispara um toast posicionado em `fixed bottom-4 right-4 z-[10000]`, que fica exatamente sobreposto à barra inferior da coluna direita do carrinho onde residem os botões **"Salvar"**, **"Opções de Envio"** e **"Finalizar Venda"**.

### 2.3. Plano de Alteração Passo a Passo
1. Em `src/components/PosCheckout.tsx` (linha `3592`), remover a chamada `mostrarSucesso(\`Frete definido: R$ ${valFrete.toFixed(2)}!\`)` dentro de `onConfirmarEnvio`.
2. Manter apenas a atualização reativa de `setFreteConfirmado(true)`, `setTaxaEntrega(valFrete)`, `setPedidoEntrega(...)` e o fechamento do modal `setModalDefinirEnvioAberto(false)`.

```diff
diff --git a/src/components/PosCheckout.tsx b/src/components/PosCheckout.tsx
--- a/src/components/PosCheckout.tsx
+++ b/src/components/PosCheckout.tsx
@@ -3589,6 +3589,5 @@
               });
             }
             setModalDefinirEnvioAberto(false);
-            mostrarSucesso(`Frete definido: R$ ${valFrete.toFixed(2)}!`);
           }}
           onFeedbackSucesso={() => {}}
```

### 2.4. Impacto e Regressão
- **Impacto Positivo:** Liberação imediata dos botões de ação na base do carrinho logo após confirmar o frete, permitindo clicar em "Finalizar Venda" sem bloqueio por elementos flutuantes.
- **Prevenção de Regressão:** O resumo financeiro do carrinho já exibe a linha `Taxa de Entrega: +R$ X,XX` e atualiza o `TOTAL A PAGAR` instantaneamente.

---

## 3. Divergência visual e de dados entre o recibo térmico e o recibo de tela

### 3.1. Arquivos Afetados
- `src/services/printService.ts` (`obterInfoEntregaRecibo`, `PrintService.printReceipt` e `PrintService.generateEscPosBuffer`).
- `src/components/pedidos/ReciboPedidoModal.tsx` (Unificação da resolução do nome da modalidade de entrega com `obterInfoEntregaRecibo`).
- `src/components/ModalReciboPedido.tsx` (Alinhamento visual com `ReciboPedidoModal.tsx`).

### 3.2. Causa Raiz Identificada
Existem três divergências estruturais entre o template de tela (`ReciboPedidoModal.tsx`) e o gerador de impressão térmica (`src/services/printService.ts`):
1. **Nomenclatura genérica `App de Corrida` em vez de `UBER DIRECT`:**
   - Em `src/services/printService.ts` (linhas `300–348`), a flag `ehAppEntrega` é ativada quando `transp.toLowerCase().includes('uber')`. Porém, quando `provedor === 'uber'` ou `transp === 'Uber Direct'` e o campo `nome_app` está vazio (`null`), o código entra no `if (ehAppEntrega)`, não encontra `'uber flash'`, `'99'` nem `'lalamove'`, e cai no `else`:
     `formaEntregaTexto = (nomeApp && nomeApp.toLowerCase().includes('uber')) ? 'Uber Direct' : (nomeApp || 'App de Corrida');`
     Como `nomeApp` é `null`, retorna `'App de Corrida'` e nunca atinge o `else if (provedor === 'uber' || transp.toLowerCase().includes('uber direct'))` da linha `351`!
2. **Omissão do telefone do cliente e posição da data/hora:**
   - Em `PrintService.printReceipt` (`src/services/printService.ts`, linha `439`), a constante `clienteContatoFormatado` é calculada, mas **não é interpolada** no bloco HTML `<!-- Informações do Cliente -->` (linhas `525–532`).
   - Além disso, no recibo de tela (`ReciboPedidoModal.tsx`, linhas `229–232`), o número do recibo (`RECIBO #...`) e a data/hora (`dd/mm/aaaa, hh:mm`) ficam lado a lado logo abaixo do cabeçalho da loja, enquanto em `PrintService.printReceipt` a data foi isolada no rodapé (linha `667`).
3. **Divergência tipográfica e de hierarquia de blocos:**
   - O recibo de tela utiliza fonte monoespaçada (`font-mono`), cabeçalho da loja centralizado no topo (Logo → Nome da Loja → Endereço → Telefone/WhatsApp), seguido da linha `RECIBO # | Data/Hora`, `Vendedor`, `Cliente (Nome + WhatsApp)`, card `Forma de Entrega (EM CAIXA ALTA)`, lista de itens com `Itens (X un)`, bloco financeiro com `VALOR TOTAL:` alinhado em `flex justify-between`, e card de `Status Pagamento` com `✓ PAGO` / `AGUARDANDO PAGAMENTO`. Já o HTML de `PrintService.printReceipt` usa fonte sans-serif, coloca `RECIBO #` antes dos dados da loja, alinha `Total:` apenas à direita e usa estilos distintos.

### 3.3. Plano de Alteração Passo a Passo
1. **Corrigir `obterInfoEntregaRecibo` em `src/services/printService.ts` (linhas `300–365`):**
   - Priorizar a detecção de `Uber Direct` quando `provedor === 'uber'` ou `transp.toLowerCase().includes('uber direct')` ou `nomeApp?.toLowerCase().includes('uber direct')`.
   - Se `ehAppEntrega` for verdadeiro e `transp` possuir um nome específico válido (ex.: `'Uber Direct'`, `'Uber Flash'`, `'99 Entrega'`, `'Lalamove'`), utilizar o nome exato do serviço/transportadora em vez do fallback genérico `'App de Corrida'`.
2. **Padronizar o HTML de `PrintService.printReceipt` (`src/services/printService.ts`, linhas `471–670`) para espelhar 100% o layout de `ReciboPedidoModal.tsx`:**
   - Aplicar família tipográfica monoespaçada (`'ui-monospace', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace`).
   - **Bloco 1 (Cabeçalho da Loja centralizado):** Logo da loja, `nomeLoja` em caixa alta e negrito, linha de endereço da loja e linha de telefone/WhatsApp da loja, separados por borda tracejada inferior.
   - **Bloco 2 (Número e Data/Hora no topo):** `flex justify-between` contendo `RECIBO #${pedido.numero_pedido}` à esquerda e a data/hora (`dd/mm/aaaa, hh:mm`) à direita, com borda tracejada inferior.
   - **Bloco 3 (Vendedor / Canal):** Label `Vendedor:` (ou `Canal / Vendedor:`) e nome em negrito, com borda tracejada inferior.
   - **Bloco 4 (Cliente com Telefone):** Label `Cliente:`, nome do cliente em negrito e, logo abaixo, o telefone/WhatsApp (`pedido.cliente?.whatsapp || pedido.cliente?.telefone || pedido.cliente_telefone_avulso`), com borda tracejada inferior.
   - **Bloco 5 (Forma de Entrega e Endereço):** Card com `Forma de Entrega:` à esquerda e badge `${formaEntregaTexto.toUpperCase()}` à direita (ex.: `UBER DIRECT`), seguido de `Endereço de Entrega:` (ou `Local de Retirada:`), `Código da Corrida` e `Rastreio` quando presentes.
   - **Bloco 6 (Itens):** Título `ITENS (${totalQuantidade} un)` e linhas com `${quantidade}x ${nome_produto}` à esquerda e `R$ ${subtotal}` à direita.
   - **Bloco 7 (Fechamento Financeiro e VALOR TOTAL):** `Subtotal dos Produtos:`, `Desconto Aplicado:` (se > 0), `Frete (${formaEntregaTexto.toUpperCase()}):`, divisor tracejado e linha `VALOR TOTAL:` à esquerda com `R$ ${valorTotal}` em destaque à direita.
   - **Bloco 8 (Status de Pagamento e Detalhamento):** Card de saldo fiado (se aplicável) e card `Status Pagamento:` com badge `✓ PAGO` ou `AGUARDANDO PAGAMENTO`, listagem de formas de pagamento e linha `Valor Pago:` ao final, seguido de `Obs:` (se houver).
3. **Sincronizar `PrintService.generateEscPosBuffer` (`src/services/printService.ts`, linhas `910–998`):**
   - Incluir data/hora no cabeçalho junto ao `RECIBO #`, exibir o telefone/WhatsApp do cliente abaixo do nome do cliente e imprimir `formaEntregaTexto.toUpperCase()` na modalidade de entrega e na linha de frete.

```diff
diff --git a/src/services/printService.ts b/src/services/printService.ts
--- a/src/services/printService.ts
+++ b/src/services/printService.ts
@@ -338,11 +338,15 @@
   } else if (ehAppEntrega) {
-    if (nomeApp && !nomeApp.toLowerCase().includes('direct')) {
+    if (provedor === 'uber' || transp.toLowerCase().includes('uber direct') || (nomeApp && nomeApp.toLowerCase().includes('uber direct'))) {
+      formaEntregaTexto = 'Uber Direct';
+    } else if (nomeApp && !nomeApp.toLowerCase().includes('direct')) {
       formaEntregaTexto = nomeApp;
     } else if (transp.toLowerCase().includes('uber flash')) {
       formaEntregaTexto = 'Uber Flash';
     } else if (transp.toLowerCase().includes('99')) {
       formaEntregaTexto = '99 Entrega';
     } else if (transp.toLowerCase().includes('lalamove')) {
       formaEntregaTexto = 'Lalamove';
+    } else if (transp && transp.toLowerCase() !== 'entrega' && !transp.toLowerCase().includes('corrida')) {
+      formaEntregaTexto = transp;
     } else {
       formaEntregaTexto = (nomeApp && nomeApp.toLowerCase().includes('uber')) ? 'Uber Direct' : (nomeApp || 'App de Corrida');
     }
```

### 3.4. Impacto e Regressão
- **Impacto Positivo:** Consistência 100% entre o recibo visualizado no modal (`ReciboPedidoModal`), o PDF baixado e a impressão térmica (`58mm`, `80mm` e `A4`).
- **Prevenção de Regressão:** Conformidade com LGPD (`pii-leak-detector`) mantendo os dados de contato restritos ao documento de recibo do pedido sem expor PII em `console.log`.

---

## 4. Falha de cálculo e validação ao aplicar cupom de frete grátis

### 4.1. Arquivos Afetados
- `src/components/PosCheckout.tsx` (Cálculo de `totalEfetivo`, `diferencaPagamento`, `handleAplicarCupom`, `handleRemoverCupom`, `handlePreencherRestanteLinha`, exibição do resumo no modal de pagamento e persistência em `handleFinalizarVenda`).

### 4.2. Causa Raiz Identificada
No componente `PosCheckout.tsx`:
1. Quando o operador aplica um cupom no modal de fechamento (`handleAplicarCupom`, linhas `755–777`), `valorDescontoCupom` recebe o valor do frete (`taxaEntrega`) e a primeira linha de pagamento (`linhasPagamento[0].valor`) é atualizada para `novoTotal = Math.max(0, total - descCupom)`.
2. Entretanto, o `useMemo` de `diferencaPagamento` (linhas `490–492`) calcula a diferença usando `total` bruto do carrinho (que **não** desconta `valorDescontoCupom`):
   ```ts
   const diferencaPagamento = useMemo(() => {
     return Number((total - totalLinhasPagamento).toFixed(2));
   }, [total, totalLinhasPagamento]);
   ```
   Como `totalLinhasPagamento` passou a ser `total - taxaEntrega`, `diferencaPagamento` resulta exatamente no valor de `taxaEntrega` (ex.: `R$ 8,95`), exibindo **"Restante a Definir: R$ 8,95"** e bloqueando o botão **"Confirmar"** (`Math.abs(diferencaPagamento) >= 0.01` na linha `3452`)!
3. Da mesma forma, `handlePreencherRestanteLinha` (linha `549`) usa `total` em vez de `totalComCupom`, e o bloco **"Resumo de Conferência"** (linhas `3358–3385`) continua exibindo o frete cheio e `Total da Venda: {formatarMoeda(total)}` sem abater o cupom de frete grátis.

### 4.3. Plano de Alteração Passo a Passo
1. Criar a constante memoizada `ehCupomFreteGratis = Boolean(cupomAplicado && cupomAplicado.tipo === 'frete_gratis')` e `totalComCupom = useMemo(() => Math.max(0, Number((total - valorDescontoCupom).toFixed(2))), [total, valorDescontoCupom])` em `src/components/PosCheckout.tsx`.
2. Caso `ehCupomFreteGratis` esteja ativo e `taxaEntrega` mude (ex.: o lojista alterou a opção de envio após aplicar o cupom), sincronizar `valorDescontoCupom` com `Number(taxaEntrega || 0)` via `useEffect`.
3. Atualizar `diferencaPagamento` (linha `490`) e `handlePreencherRestanteLinha` (linha `549`) para utilizarem `totalComCupom` em vez de `total`.
4. No bloco **"Resumo de Conferência"** do modal de fechamento (linhas `3357–3385`):
   - Na linha de **Frete**: quando `ehCupomFreteGratis` for `true`, exibir o valor original riscado (`line-through`) seguido de **`Grátis (Cupom)`** (ou `R$ 0,00`).
   - Exibir a linha de **Desconto Cupom (`{cupomAplicado.codigo}`)** quando houver cupom de desconto fixo/percentual aplicado.
   - Na linha **Total da Venda** (linha `3384`): exibir `{formatarMoeda(totalComCupom)}`.
5. Em `handleFinalizarVenda` (linhas `1662–1685`), quando `ehCupomFreteGratis` for verdadeiro:
   - Enviar `taxaEntrega: 0` (ou registrar `is_frete_gratis: true`, `valor_original: taxaEntrega`, `valor_subsidio: taxaEntrega`, `valor_frete: 0` no `pedidoEntrega`) e manter `desconto` apenas com o desconto comercial de produtos, garantindo que o frete fique efetivamente zerado no pedido e no recibo sem inflar artificialmente o desconto de produtos.

```diff
diff --git a/src/components/PosCheckout.tsx b/src/components/PosCheckout.tsx
--- a/src/components/PosCheckout.tsx
+++ b/src/components/PosCheckout.tsx
@@ -490,3 +490,8 @@
+  const ehCupomFreteGratis = Boolean(cupomAplicado && cupomAplicado.tipo === 'frete_gratis');
+  const totalComCupom = useMemo(() => {
+    return Math.max(0, Number((total - (valorDescontoCupom || 0)).toFixed(2)));
+  }, [total, valorDescontoCupom]);
+
   const diferencaPagamento = useMemo(() => {
-    return Number((total - totalLinhasPagamento).toFixed(2));
-  }, [total, totalLinhasPagamento]);
+    return Number((totalComCupom - totalLinhasPagamento).toFixed(2));
+  }, [totalComCupom, totalLinhasPagamento]);
@@ -547,5 +552,5 @@
       const outrasLinhas = prev.filter(l => l.id !== linhaId);
       const somaOutras = outrasLinhas.reduce((sum, l) => sum + (Number(l.valor) || 0), 0);
-      const restante = Math.max(0, Number((total - somaOutras).toFixed(2)));
+      const restante = Math.max(0, Number((totalComCupom - somaOutras).toFixed(2)));
       return prev.map(l => l.id === linhaId ? { ...l, valor: restante } : l);
     });
@@ -3357,6 +3362,11 @@
                   <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>
-                    {taxaEntrega > 0 ? (
+                    {ehCupomFreteGratis ? (
+                      <span className="inline-flex items-center gap-1.5">
+                        {taxaEntrega > 0 && <span className="line-through text-slate-400 text-[11px]">{formatarMoeda(taxaEntrega)}</span>}
+                        <span className="text-emerald-500 font-black">Grátis (Cupom)</span>
+                      </span>
+                    ) : taxaEntrega > 0 ? (
                       formatarMoeda(taxaEntrega)
                     ) : pedidoEntrega?.tipo_atendimento === 'retirada' ? (
@@ -3383,3 +3393,3 @@
                 <span>Total da Venda:</span>
-                <span className="text-emerald-600 dark:text-emerald-400 font-black text-base">{formatarMoeda(total)}</span>
+                <span className="text-emerald-600 dark:text-emerald-400 font-black text-base">{formatarMoeda(totalComCupom)}</span>
               </div>
```

### 4.4. Impacto e Regressão
- **Impacto Positivo:** Ao aplicar o cupom `FRETEGRATIS`, o frete é zerado na conferência, o "Total da Venda" passa a refletir exatamente o valor líquido a pagar, "Restante a Definir" fica em `R$ 0,00` (`Total Conferido 100%`) e o botão "Confirmar" fica imediatamente habilitado.
- **Prevenção de Regressão:** Cupons de `desconto_fixo` e `desconto_percentual` também passam a ter `diferencaPagamento` e `Total da Venda` sincronizados com `totalComCupom`.

---

## 5. Atualização cadastral de CPF no fluxo do Melhor Envio

### 5.1. Arquivos Afetados
- `src/components/PedidosLista.tsx` (Modal de captura de CPF/CNPJ nas linhas `4505–4601`, preparação de despacho nas linhas `1283–1350` e função `handleSalvarCpfEContinuarDespacho` nas linhas `1510–1607`).

### 5.2. Causa Raiz Identificada
1. **Botão de teste exposto em produção:** Na linha `4558–4565` de `src/components/PedidosLista.tsx`, há um botão `<button onClick={() => setCpfClienteInput('012.345.678-90')}>Preencher CPF Teste</button>` hardcoded no rodapé do modal.
2. **Persistência e sincronização de estado do CPF/CNPJ no cadastro do cliente:**
   - Em `handleSalvarCpfEContinuarDespacho` (linhas `1523–1533`), o update em `clientes` verifica apenas `if (ped.cliente_id)` (ignorando `ped.cliente?.id` caso `cliente_id` não esteja na raiz) e **não inclui `.eq('loja_id', loja.id)`** nem atualiza `tipo_documento` (`CPF` / `CNPJ`).
   - Além disso, o estado local (`setPedidos`, `setPedidoSelecionado`, `setClientes`) **não é atualizado com `numero_documento: docLimpo`** antes de chamar `ShippingOrchestrator.despacharMelhorEnvio` (e mesmo no bloco de sucesso nas linhas `1560–1588`, `p.cliente.numero_documento` não era atualizado no estado `pedidos`). Assim, se o despacho falhar por outro motivo (ex.: saldo na carteira) ou se o lojista despachar outro pedido do mesmo cliente na mesma sessão, o estado em memória de `ped.cliente.numero_documento` permanece vazio.
   - Adicionalmente, na linha `1284`, a busca de dados atualizados do cliente no banco (`if ((!pedCompleto.cliente || !pedCompleto.cliente.whatsapp) && pedCompleto.cliente_id)`) não recarregava o cliente quando `pedCompleto.cliente.numero_documento` estava ausente.

### 5.3. Plano de Alteração Passo a Passo
1. **Remover o botão "Preencher CPF Teste"** em `src/components/PedidosLista.tsx` (linhas `4558–4565`) e alinhar os botões `Cancelar` e `Salvar e Gerar Envio` à direita (`justify-end`).
2. **Validar matematicamente o CPF/CNPJ** (dígitos verificadores de 11 ou 14 dígitos) antes de salvar no banco, evitando gravar documentos inválidos que seriam recusados pela API do Melhor Envio.
3. **Atualizar a tabela `clientes` com isolamento multi-tenant (`supabase-rls-guard`):**
   - Determinar `const clienteIdAlvo = ped.cliente_id || ped.cliente?.id;`.
   - Executar `.from('clientes').update({ numero_documento: docLimpo, tipo_documento: docLimpo.length > 11 ? 'CNPJ' : 'CPF', atualizado_em: agoraIso }).eq('id', clienteIdAlvo).eq('loja_id', loja.id)` verificando eventual erro de persistência.
   - Executar `.from('pedidos').update({ cliente_documento_avulso: docLimpo, atualizado_em: agoraIso }).eq('id', ped.id).eq('loja_id', loja.id)`.
4. **Sincronizar imediatamente o estado local em memória** (`setClientes`, `setPedidos` para todos os pedidos daquele cliente e `setPedidoSelecionado`) logo após o `update` no Supabase — antes mesmo da chamada de despacho à API do Melhor Envio — garantindo que o documento nunca seja solicitado novamente para aquele cliente.
5. Na preparação de despacho (linha `1284`), incluir `!pedCompleto.cliente.numero_documento` na condição de refresh do cadastro do cliente no Supabase.

```diff
diff --git a/src/components/PedidosLista.tsx b/src/components/PedidosLista.tsx
--- a/src/components/PedidosLista.tsx
+++ b/src/components/PedidosLista.tsx
@@ -1283,4 +1283,4 @@
       let pedCompleto = ped;
-      if ((!pedCompleto.cliente || !pedCompleto.cliente.whatsapp) && pedCompleto.cliente_id) {
+      if ((!pedCompleto.cliente || !pedCompleto.cliente.whatsapp || !pedCompleto.cliente.numero_documento) && (pedCompleto.cliente_id || pedCompleto.cliente?.id)) {
         try {
           const { data: cliDb } = await supabase
@@ -1522,12 +1522,36 @@
       // 1. Atualiza o documento no cliente (se cadastrado) e no pedido
-      if (ped.cliente_id) {
-        await supabase
+      const clienteIdAlvo = ped.cliente_id || ped.cliente?.id;
+      const tipoDoc: 'CPF' | 'CNPJ' = docLimpo.length > 11 ? 'CNPJ' : 'CPF';
+      if (clienteIdAlvo) {
+        const { error: errCli } = await supabase
           .from('clientes')
-          .update({ numero_documento: docLimpo })
-          .eq('id', ped.cliente_id);
+          .update({
+            numero_documento: docLimpo,
+            tipo_documento: tipoDoc,
+            atualizado_em: new Date().toISOString()
+          })
+          .eq('id', clienteIdAlvo)
+          .eq('loja_id', loja.id);
+        if (errCli) throw new Error('Não foi possível atualizar o CPF/CNPJ no cadastro do cliente.');
       }
 
       await supabase
         .from('pedidos')
         .update({ cliente_documento_avulso: docLimpo })
-        .eq('id', ped.id);
+        .eq('id', ped.id)
+        .eq('loja_id', loja.id);
+
+      setClientes((prev) =>
+        prev.map((c) => (c.id === clienteIdAlvo ? { ...c, numero_documento: docLimpo, tipo_documento: tipoDoc } : c))
+      );
+      setPedidos((prev) =>
+        prev.map((p) =>
+          p.id === ped.id || (clienteIdAlvo && (p.cliente_id === clienteIdAlvo || p.cliente?.id === clienteIdAlvo))
+            ? {
+                ...p,
+                cliente_documento_avulso: p.id === ped.id ? docLimpo : p.cliente_documento_avulso,
+                cliente: p.cliente ? { ...p.cliente, numero_documento: docLimpo, tipo_documento: tipoDoc } : p.cliente
+              }
+            : p
+        )
+      );
@@ -4557,11 +4581,3 @@
-            <div className="flex items-center justify-between gap-2 pt-1">
-              <button
-                type="button"
-                onClick={() => setCpfClienteInput('012.345.678-90')}
-                className="text-[11px] text-emerald-500 hover:text-emerald-400 underline font-semibold transition cursor-pointer"
-                title="Preencher documento fictício para testes no Sandbox"
-              >
-                Preencher CPF Teste
-              </button>
-
+            <div className="flex items-center justify-end gap-2 pt-1">
               <div className="flex items-center gap-2">
```

### 5.4. Impacto e Regressão
- **Impacto Positivo:** Remoção definitiva de artefato de teste da interface de produção e atualização persistente do CPF/CNPJ na tabela `clientes`, eliminando retrabalho em compras futuras do mesmo cliente.
- **Prevenção de Regressão:** Respeita a blindagem RLS (`.eq('loja_id', loja.id)`) e mantém compatibilidade com pedidos de clientes avulsos (`cliente_documento_avulso`).

---

## 6. Abertura imediata da Etiqueta do Melhor Envio no primeiro clique

### 6.1. Arquivos Afetados
- `src/components/shipping/ModalImprimirEtiqueta.tsx` (`useEffect` inicial nas linhas `37–53`, `obterDocumentosOficiais` nas linhas `150–178`, `abrirOuImprimir` nas linhas `180–222`, `handleAbrirEtiquetaMelhorEnvio` nas linhas `224–240` e `handleAbrirDace` nas linhas `242–259`).
- `src/components/PedidosLista.tsx` (`handleImprimirEtiquetaOficialMelhorEnvio` nas linhas `1442–1477` e `handleImprimirDeclaracaoConteudoMelhorEnvio` nas linhas `1479–1493`).

### 6.2. Causa Raiz Identificada
O problema de exigir **dois cliques** para abrir a etiqueta ocorre pela combinação de dois fatores técnicos:
1. **Bloqueio de Popup do Navegador após `await` assíncrono (Perda de *Transient User Activation*):**
   - No **primeiro clique** em `"Etiqueta Melhor Envio"`, `handleAbrirEtiquetaMelhorEnvio` chama `const docs = await obterDocumentosOficiais()`, que invoca a Edge Function `melhor-envio-despacho` (`acao: 'imprimir_etiqueta'`). Essa requisição leva de 1,5s a 4s (consulta API do Melhor Envio + upload do PDF no Supabase Storage).
   - Quando a Promise resolve após o `await` e chama `abrirOuImprimir(docs.url_etiqueta)` → `window.open(url, '_blank')`, o navegador **bloqueia a abertura da nova aba** porque a chamada a `window.open` ocorreu fora da pilha síncrona do evento de clique do usuário!
   - No **segundo clique**, como `urlEtiquetaOficial` e `urlDaceOficial` já foram salvos no state do React durante o primeiro clique, `obterDocumentosOficiais()` entra no `if (urlEtiquetaOficial && urlDaceOficial)` (linha `151`) e retorna instantaneamente sem `await` de rede, permitindo que `window.open` funcione no segundo clique!
2. **Condição de cache incompleta na linha `151` de `ModalImprimirEtiqueta.tsx`:**
   - No `useEffect` (linhas `47–49`), quando o pedido já possui `link_etiqueta` salvo no banco, apenas `setUrlEtiquetaOficial(data.link_etiqueta)` é preenchido, enquanto `urlDaceOficial` permanece `null`.
   - Porém, a linha `151` verifica `if (urlEtiquetaOficial && urlDaceOficial)`. Como `urlDaceOficial` é `null`, mesmo quando a URL da etiqueta já existe no banco, o primeiro clique ignora `urlEtiquetaOficial` e faz uma requisição de rede desnecessária que expira o gesto do usuário!

### 6.3. Plano de Alteração Passo a Passo
1. **Separar a verificação de cache da Etiqueta e da DACE em `ModalImprimirEtiqueta.tsx`:**
   - Para a etiqueta (`handleAbrirEtiquetaMelhorEnvio`), se `urlEtiquetaOficial` já estiver disponível (ou `ehUrlStorageSupabase(linkEtiquetaOficial)` / `ehLinkPdfDireto(linkEtiquetaOficial)`), abrir imediatamente de forma síncrona sem aguardar nova requisição.
2. **Pré-carregar (`pre-fetch`) silenciosamente os documentos ao abrir o `ModalImprimirEtiqueta`:**
   - No `useEffect` de abertura do modal, quando `ehMelhorEnvio` for verdadeiro e ainda não houver URL do Supabase Storage em `urlEtiquetaOficial`, disparar em background a resolução de `MelhorEnvioService.obterDocumentosOficiais` para que as URLs já estejam prontas antes mesmo do clique.
3. **Preservar o contexto de gesto do usuário (*User Gesture*) quando a requisição assíncrona for necessária no primeiro clique:**
   - Tanto em `ModalImprimirEtiqueta.tsx` (`handleAbrirEtiquetaMelhorEnvio` e `handleAbrirDace`) quanto em `PedidosLista.tsx` (`handleImprimirEtiquetaOficialMelhorEnvio` e `handleImprimirDeclaracaoConteudoMelhorEnvio`), caso a URL ainda não esteja em memória no momento do clique:
     1. Abrir a janela/aba **sincronamente** no início do clique: `const novaAba = window.open('about:blank', '_blank');` (renderizando um HTML leve de `"Carregando etiqueta oficial do Melhor Envio..."` na nova aba).
     2. Aguardar `await obterDocumentosOficiais()`.
     3. Assim que `docs.url_etiqueta` retornar, redirecionar a aba já aberta (`novaAba.location.replace(docs.url_etiqueta)`) ou, caso ocorra erro, fechar `novaAba.close()` e exibir o erro no modal.

```diff
diff --git a/src/components/shipping/ModalImprimirEtiqueta.tsx b/src/components/shipping/ModalImprimirEtiqueta.tsx
--- a/src/components/shipping/ModalImprimirEtiqueta.tsx
+++ b/src/components/shipping/ModalImprimirEtiqueta.tsx
@@ -150,4 +150,7 @@
-  const obterDocumentosOficiais = async (): Promise<{ url_etiqueta: string; url_dace: string }> => {
-    if (urlEtiquetaOficial && urlDaceOficial) {
-      return { url_etiqueta: urlEtiquetaOficial, url_dace: urlDaceOficial };
+  const obterDocumentosOficiais = async (apenasEtiqueta = false): Promise<{ url_etiqueta: string; url_dace: string }> => {
+    if (apenasEtiqueta && urlEtiquetaOficial) {
+      return { url_etiqueta: urlEtiquetaOficial, url_dace: urlDaceOficial || urlEtiquetaOficial };
+    }
+    if (urlEtiquetaOficial && urlDaceOficial) {
+      return { url_etiqueta: urlEtiquetaOficial, url_dace: urlDaceOficial };
     }
@@ -224,13 +227,25 @@
   const handleAbrirEtiquetaMelhorEnvio = async () => {
+    if (urlEtiquetaOficial) {
+      abrirOuImprimir(urlEtiquetaOficial);
+      return;
+    }
+    const abaPrevia = window.open('about:blank', '_blank');
     try {
       setObtendoEtiquetaOficial(true);
       mostrarToast('Abrindo Etiqueta Oficial do Melhor Envio...', 'info');
-      const docs = await obterDocumentosOficiais();
+      const docs = await obterDocumentosOficiais(true);
       if (docs.url_etiqueta) {
-        abrirOuImprimir(docs.url_etiqueta);
+        if (abaPrevia && !abaPrevia.closed) {
+          abaPrevia.location.replace(docs.url_etiqueta);
+        } else {
+          abrirOuImprimir(docs.url_etiqueta);
+        }
       } else {
+        abaPrevia?.close();
         mostrarErro('Etiqueta oficial não encontrada.');
       }
     } catch (err: any) {
+      abaPrevia?.close();
       console.error('[DEBUG_ETIQUETA] Erro ao abrir etiqueta:', err);
       mostrarErro(err?.message || 'Falha ao abrir a Etiqueta Oficial.');
     } finally {
```

### 6.4. Impacto e Regressão
- **Impacto Positivo:** A etiqueta oficial do Melhor Envio (e a Declaração DACE) abre na nova aba **sempre no primeiro clique**, eliminando o bloqueio silencioso de popup do navegador após chamadas assíncronas.
- **Prevenção de Regressão:** Se a geração falhar na API do Melhor Envio, a aba prévia é fechada automaticamente (`abaPrevia?.close()`) e o modal de erro amigável em `pt-BR` é exibido normalmente.

---

## 7. Opção de "Frete Manual" quando endereço estiver incompleto

### 7.1. Arquivos Afetados
- `src/components/shipping/ShippingFulfillmentSelector.tsx`:
  - `emitirSelecaoManual` (linhas `809–962`)
  - `handleAlterarValorManualForma` e handlers auxiliares `handleAlterar*` (linhas `965–1076`)
  - `handleSelecionarFormaManual` (linhas `1078–1093`)
  - Renderização condicional da validação de endereço e abas `Cotar Frete (Automático)` / `Informar Frete (Manual)` (linhas `1633–1718`).

### 7.2. Causa Raiz Identificada
No componente `ShippingFulfillmentSelector.tsx`, existem três travas que impedem o lojista de informar o frete manualmente quando o endereço do cliente está incompleto (ou sem CEP/logradouro/número):
1. **Bloqueio estrutural da árvore JSX (linhas `1641–1667`):** A condição `(!clienteId || !enderecoSelecionado || !(enderecoSelecionado.cep || '').replace(/\D/g, '') || !(enderecoSelecionado.logradouro || '').trim())` substitui **todo** o conteúdo de entrega pelo card de aviso `"Endereço incompleto para entrega"` contendo apenas o botão `"Atualizar Endereço"`. Com isso, o seletor de abas (`Cotar Frete (Automático)` vs. `Informar Frete (Manual)`) e a `VIA B (Manual)` sequer são renderizados.
2. **Trava no clique da forma manual (`handleSelecionarFormaManual`, linhas `1083–1086`):**
   ```ts
   if (!clienteId || !enderecoSelecionado || cepLimpo.length !== 8 || !logrLimpo || !numLimpo) {
     onSolicitarAtualizarEndereco?.();
     return;
   }
   ```
   Mesmo na aba manual, clicar em uma forma de entrega (ex.: Motoboy, Frete Próprio, App de Corrida) forçava a abertura do modal de endereço e abortava a seleção!
3. **Guarda `if (!endAlvo) return;` em `emitirSelecaoManual` (linha `827`) e `if (enderecoSelecionado)` nos handlers `handleAlterar*` (linhas `970–1075`):** Se o cliente ainda não tiver um objeto `enderecoSelecionado`, `emitirSelecaoManual` retorna silenciosamente sem emitir a opção para o `ModalDefinirEnvio`, mantendo o botão `"Confirmar"` do modal desabilitado.

### 7.3. Plano de Alteração Passo a Passo
1. **Desacoplar a aba "Informar Frete (Manual)" da validação de endereço completo na UI (`ShippingFulfillmentSelector.tsx`, linhas `1633–1718`):**
   - Renderizar o seletor de abas (`Cotar Frete (Automático)` | `Informar Frete (Manual)`) sempre que `!ehCatalogo && temIntegracaoAutomatica`, independentemente de o endereço estar completo ou incompleto.
   - Exibir o card de alerta `"Endereço incompleto para entrega"` **apenas quando o lojista estiver na aba de cotação automática** (`viaEntrega === 'cotar'`), pois somente a cotação automatizada (Uber Direct / Melhor Envio) exige CEP e logradouro completos.
   - Dentro do card `"Endereço incompleto para entrega"`, exibir dois botões lado a lado:
     1. **`Atualizar Endereço`** (`onClick={() => onSolicitarAtualizarEndereco?.()}`)
     2. **`Informar Frete (Manual)`** (`onClick={() => { setModalidade('entrega'); setViaEntrega('manual'); }}`)
2. **Liberar `handleSelecionarFormaManual`, `emitirSelecaoManual` e handlers `handleAlterar*` para funcionar mesmo com endereço parcial ou ausente:**
   - Em `handleSelecionarFormaManual` (linhas `1078–1093`), remover o bloqueio que invocava `onSolicitarAtualizarEndereco()` e permitir a seleção imediata da forma manual.
   - Em `emitirSelecaoManual` (linha `827`), remover `if (!endAlvo) return;` e utilizar um fallback seguro `const endSeguro: Partial<ClienteEndereco> = endAlvo || enderecoEntregaAtual || {};`, populando `destino_cep: endSeguro.cep || ''`, `destino_logradouro: endSeguro.logradouro || ''`, etc.
   - Nos handlers `handleAlterarValorManualForma` e demais `handleAlterar*` (linhas `970–1075`), remover a exigência `if (enderecoSelecionado)` para que qualquer edição de valor, entregador ou código de corrida emita o `onChange` normalmente.

```diff
diff --git a/src/components/shipping/ShippingFulfillmentSelector.tsx b/src/components/shipping/ShippingFulfillmentSelector.tsx
--- a/src/components/shipping/ShippingFulfillmentSelector.tsx
+++ b/src/components/shipping/ShippingFulfillmentSelector.tsx
@@ -826,3 +826,3 @@
   ) => {
-    if (!endAlvo) return;
+    const endSeguro: Partial<ClienteEndereco> = endAlvo || enderecoEntregaAtual || {};
     const numVal = parseFloat(valorStr.replace(',', '.')) || 0;
@@ -911,3 +911,3 @@
-    const chaveEmissao = `manual_${forma.id}_${numVal}_${endAlvo.cep}_${endAlvo.numero}_${entregadorFinal || ''}_${rastreioFinal || ''}_${linkFinal || ''}_${pinFinal || ''}_${nomeAppFinal || ''}_${servicoCorreiosFinal || ''}_${nomeTransportadoraFinal || ''}_${appEntregaIdFinal || ''}_${transportadoraIdFinal || ''}_${codigoCorridaFinal || ''}`;
+    const chaveEmissao = `manual_${forma.id}_${numVal}_${endSeguro.cep || ''}_${endSeguro.numero || ''}_${entregadorFinal || ''}_${rastreioFinal || ''}_${linkFinal || ''}_${pinFinal || ''}_${nomeAppFinal || ''}_${servicoCorreiosFinal || ''}_${nomeTransportadoraFinal || ''}_${appEntregaIdFinal || ''}_${transportadoraIdFinal || ''}_${codigoCorridaFinal || ''}`;
     if (ultimoResultadoEmitidoRef.current === chaveEmissao) return;
@@ -1078,10 +1078,2 @@
   const handleSelecionarFormaManual = (forma: FormaEntrega) => {
-    const cepLimpo = (enderecoSelecionado?.cep || '').replace(/\D/g, '');
-    const logrLimpo = (enderecoSelecionado?.logradouro || '').trim();
-    const numLimpo = (enderecoSelecionado?.numero || '').trim();
-
-    if (!clienteId || !enderecoSelecionado || cepLimpo.length !== 8 || !logrLimpo || !numLimpo) {
-      onSolicitarAtualizarEndereco?.();
-      return;
-    }
-
     setModalidade('entrega');
```

### 7.4. Impacto e Regressão
- **Impacto Positivo:** O lojista ganha autonomia total para escolher entre completar o endereço para cotar via API ou lançar imediatamente um frete manual (Taxa Fixa, Motoboy, App de Corrida manual, Transportadora manual) e concluir a venda sem bloqueios.
- **Prevenção de Regressão:** No Catálogo Público (`ehCatalogo === true`), a exigência de endereço completo para o cliente final permanece inalterada.

---

## 8. Sincronização automática do status de entrega (tracking)

### 8.1. Arquivos Afetados
- `supabase/functions/melhor-envio-webhook/index.ts` (**Novo Endpoint Edge Function** público para recepção de webhooks do Melhor Envio, seguindo o padrão arquitetural de `supabase/functions/uber-webhook/index.ts`).
- `supabase/functions/melhor-envio-despacho/index.ts` (Adição da ação `sincronizar_rastreios_pendentes` para varredura em lote via Cron/Background dos pedidos com status `'enviado'`).
- `supabase/migrations/20261019_cron_sync_rastreio_pedidos.sql` (**Nova Migration** configurando agendamento periódico via `pg_cron` + `pg_net` se disponível no projeto e índice otimizado para busca de entregas em trânsito).
- `src/services/melhorEnvioService.ts` (Método `sincronizarPedidosEnviadosBackground(lojaId: string)`).
- `src/components/PedidosLista.tsx` e `src/components/PedidosListaMobile.tsx` (Trigger silencioso em segundo plano ao carregar a lista de pedidos para sincronizar pedidos com `status === 'enviado'` que ainda não foram atualizados nas últimas horas, garantindo fallback automático imediato mesmo caso o webhook externo ou `pg_cron` não dispare).

### 8.2. Causa Raiz Identificada
Atualmente, a atualização do status do pedido de `"enviado"` para `"entregue"` para remessas do Melhor Envio e Correios só ocorre dentro da ação `"sincronizar_rastreio"` da Edge Function `melhor-envio-despacho` (`supabase/functions/melhor-envio-despacho/index.ts`, linha `609`), a qual **só é chamada quando o usuário clica manualmente no botão "Rastrear"** (que abre o `ModalRastreioPedido.tsx`, linha `157`).
Diferentemente da integração Uber Direct — que já possui a Edge Function `supabase/functions/uber-webhook/index.ts` —, **não existe um endpoint de webhook para o Melhor Envio** nem uma rotina periódica/background que sincronize os pedidos em trânsito (`status = 'enviado'`).

### 8.3. Plano de Alteração Passo a Passo
1. **Criar a Edge Function `supabase/functions/melhor-envio-webhook/index.ts`:**
   - Suportar `GET` (healthcheck de validação do painel Melhor Envio) e `POST` (recepção de eventos como `order.delivered`, `order.posted`, `order.in_transit`, `order.cancelled` ou payload contendo `data.id`, `data.tracking`, `data.status === 'delivered'` / `data.delivered_at`).
   - Validar opcionalmente assinatura `X-ME-Signature` (HMAC-SHA256) quando configurada, sem expor tokens ou PII em logs (`pii-leak-detector`).
   - Localizar a entrega e o pedido correspondente em `pedido_entregas` e `pedidos` via `codigo_rastreio` ou `cotacao_id` / `melhor_envio_order_id`.
   - Quando o evento indicar entrega concluída (`delivered` / `order.delivered` / `delivered_at != null`):
     - Atualizar `pedido_entregas` (`status_envio = 'entregue'`, `atualizado_em = agoraIso`).
     - Atualizar `pedidos` (`status = 'entregue'`, `atualizado_em = agoraIso`), preservando pedidos já `'concluido'` ou `'cancelado'`.
     - Inserir registro auditável em `historico_pedidos` (`status_anterior`, `status_novo: 'entregue'`, `descricao: 'Pedido entregue automaticamente via Webhook Melhor Envio'`).
2. **Adicionar ação em lote `sincronizar_rastreios_pendentes` em `supabase/functions/melhor-envio-despacho/index.ts`:**
   - Buscar pedidos com `status = 'enviado'` (filtrando por `loja_id` quando informado, ou todas as lojas ativas quando acionado via Cron Service Role), cujo `pedido_entregas.status_envio` seja diferente de `'entregue'` e `'cancelado'`.
   - Consultar em lote na API do Melhor Envio (`POST /api/v2/me/shipment/tracking` que aceita `{ orders: [...] }`) e/ou API GraphQL do Melhor Rastreio para códigos Correios/Jadlog.
   - Para cada pedido identificado como `delivered` / `DELIVERED`, atualizar `pedido_entregas.status_envio = 'entregue'`, `pedidos.status = 'entregue'` e gravar em `historico_pedidos`, retornando a lista de pedidos atualizados.
3. **Configurar rotina periódica (Cron + Fallback Background):**
   - Criar migration `supabase/migrations/20261019_cron_sync_rastreio_pedidos.sql` habilitando de forma segura (bloco `DO $$ ... EXCEPTION WHEN OTHERS THEN ... $$`) um job `pg_cron` a cada 30 minutos que invoca a Edge Function `melhor-envio-despacho` com `{"acao": "sincronizar_rastreios_pendentes"}`, respeitando integralmente `supabase-rls-guard` e `anti-jsonb-linter`.
   - Na camada Frontend (`PedidosLista.tsx` e `PedidosListaMobile.tsx`), adicionar um efeito não-bloqueante (com throttle de 10 minutos por sessão via `sessionStorage`) que, ao identificar pedidos listados com `status === 'enviado'`, dispara `MelhorEnvioService.sincronizarPedidosEnviadosBackground(loja.id)` e atualiza silenciosamente a tabela na tela caso algum pedido tenha mudado para `'entregue'`.

### 8.4. Impacto e Regressão
- **Impacto Positivo:** Os pedidos despachados via Melhor Envio / Correios / Jadlog têm seu status atualizado automaticamente para **"Entregue"** em tempo real (via Webhook) e com garantia de consistência eventual (via Cron / Background Sync), sem exigir que o lojista clique manualmente em "Rastrear" pedido por pedido.
- **Prevenção de Regressão:**
  - Pedidos com status `'concluido'` ou `'cancelado'` nunca têm seu status sobrescrito.
  - Nenhum dado sensível (CPF, WhatsApp, tokens) é exposto em logs (`pii-leak-detector`).
  - Nenhuma coluna `JSONB` adicional é criada (`anti-jsonb-linter`), utilizando exclusivamente as colunas tipadas já existentes em `pedidos`, `pedido_entregas` e `historico_pedidos`.

---

## ✅ Checklist de Validação Pós-Autorização
- [ ] **Item 1:** Alternar entre "Retirada" e "Envio" no PDV Desktop sem abertura automática do modal.
- [ ] **Item 2:** Confirmar frete no `ModalDefinirEnvio` do PDV sem exibir toast cobrindo os botões inferiores.
- [ ] **Item 3:** Imprimir recibo térmico (`58mm`/`80mm`) e validar telefone do cliente no cabeçalho, data/hora no topo, nome exato (`UBER DIRECT`) e alinhamento idêntico ao recibo de tela.
- [ ] **Item 4:** Aplicar cupom `FRETEGRATIS` no fechamento do PDV, verificar frete zerado, `Total da Venda` abatido e `Restante a Definir: R$ 0,00`.
- [ ] **Item 5:** Verificar ausência do botão `Preencher CPF Teste` e confirmar gravação do CPF/CNPJ na tabela `clientes` com `.eq('loja_id', loja.id)`.
- [ ] **Item 6:** Clicar 1 única vez em `"Etiqueta Melhor Envio"` e validar abertura imediata do PDF em nova aba sem bloqueio de popup.
- [ ] **Item 7:** Abrir `ModalDefinirEnvio` para cliente com endereço incompleto e validar presença e funcionamento da opção `"Informar Frete (Manual)"`.
- [ ] **Item 8:** Validar recepção do `melhor-envio-webhook` e sincronização automática em lote (`sincronizar_rastreios_pendentes`) atualizando pedidos de `"Enviado"` para `"Entregue"`.
