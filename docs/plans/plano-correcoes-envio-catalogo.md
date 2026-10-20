# Plano de Implementação: Correções e Aprimoramentos de Envio, Gestão de Pedidos e Catálogo Online com IA

**Data:** 20/10/2026  
**Escopo:** 6 melhorias e correções críticas nos módulos de **PDV/Expedição**, **Gestão de Pedidos** e **Catálogo Online com Rubi IA**.  
**Conformidade Arquitetural:**
- **Governança Relacional (`anti-jsonb-linter`):** Coluna tipada nativa `NUMERIC(10,2)` na tabela `public.loja_shipping_configs` (sem JSONB genérico).
- **Blindagem Multitenant (`supabase-rls-guard`):** Manutenção estrita de RLS por `loja_id` via `public.usuario_pertence_loja(loja_id)` e cláusula `.eq('loja_id', loja.id)` nas queries frontend.
- **Execução Cirúrgica (`diff-patch-only`):** Alterações pontuais nas linhas mapeadas abaixo, preservando funcionalidades existentes e evitando regressões visuais.

---

## 1. Parametrização do Limite sem NF-e e Condicional no Modal de Envio (PDV/Expedição)

### 1.1. Diagnóstico Técnico
- Atualmente, em `src/components/shipping/ShippingFulfillmentSelector.tsx` (linha `2311`), existe apenas um aviso estático com valor fixo (`subtotal > 1000 && cotacoes.some(c => c.provedor === 'melhor_envio')`), mantendo visível a aba **"Cotar Frete (Automático)"** e permitindo selecionar cotações do Melhor Envio (Correios/Jadlog) que falham ou bloqueiam na geração de etiqueta com Declaração de Conteúdo acima do teto.
- Não há coluna configurável em `public.loja_shipping_configs` para armazenar o limite máximo permitido para envio com Declaração de Conteúdo (`limite_declaracao_conteudo`).

### 1.2. Arquivos Envolvidos
1. **Migration Supabase (Novo Arquivo):** `supabase/migrations/20261020120000_add_limite_declaracao_conteudo_shipping.sql`
2. **Tipagens de Frete:** `src/types/shipping.ts` (Interface `LojaShippingConfig`, linhas `54-88`)
3. **Orquestrador de Frete:** `src/services/shippingOrchestrator.ts` (`buscarConfigLoja` e `salvarConfigLoja`, linhas `23-155`)
4. **Tela de Configurações de Frete:** `src/components/shipping/ShippingSettingsScreen.tsx` (Bloco 3 - Melhor Envio, linhas `104-112`, `159-166`, `395-410`, `829-905`)
5. **Modal de Definição de Envio:** `src/components/pedidos/ModalDefinirEnvio.tsx` (linhas `183-218`)
6. **Seletor de Fulfillment (Modal de Frete):** `src/components/shipping/ShippingFulfillmentSelector.tsx` (Props nas linhas `44-105`, lógica de abas `viaEntrega` nas linhas `561-597` e renderização das abas/alertas nas linhas `1655-1701` e `2460-2475`)

### 1.3. Passo a Passo da Implementação
1. **Banco de Dados (Migration SQL):**
   - Adicionar coluna tipada relacional na tabela `public.loja_shipping_configs`:
     ```sql
     ALTER TABLE public.loja_shipping_configs
       ADD COLUMN IF NOT EXISTS limite_declaracao_conteudo NUMERIC(10,2) NOT NULL DEFAULT 1000.00;

     COMMENT ON COLUMN public.loja_shipping_configs.limite_declaracao_conteudo IS
       'Valor máximo de produtos (R$) permitido para envio com Declaração de Conteúdo (sem NF-e) nas transportadoras integradas';
     ```
   - Garantir que `ALTER TABLE public.loja_shipping_configs ENABLE ROW LEVEL SECURITY;` e as políticas com `public.usuario_pertence_loja(loja_id)` permaneçam íntegras.
2. **Camada de Tipos e Serviço (`src/types/shipping.ts` e `src/services/shippingOrchestrator.ts`):**
   - Incluir `limite_declaracao_conteudo?: number;` em `LojaShippingConfig`.
   - Em `ShippingOrchestrator.buscarConfigLoja`, normalizar `limite_declaracao_conteudo: Number(dadosShipping?.limite_declaracao_conteudo ?? 1000.00)` (com fallback seguro para `1000.00`).
3. **Tela de Configurações (`src/components/shipping/ShippingSettingsScreen.tsx`):**
   - No Bloco 3 (*Integração Melhor Envio*), adicionar o campo numérico **"Limite para Declaração de Conteúdo sem NF-e (R$)"** (default `1000.00`), permitindo que o lojista altere o teto a qualquer momento sem novo deploy.
4. **Condicional e Ocultação de Abas no Seletor de Frete (`src/components/shipping/ShippingFulfillmentSelector.tsx` e `src/components/pedidos/ModalDefinirEnvio.tsx`):**
   - Adicionar a prop opcional `possuiNfe?: boolean` em `ShippingFulfillmentSelectorProps` (repassada por `ModalDefinirEnvio` verificando se o pedido possui chave/número de NF-e associado, ex.: `Boolean((pedido as any)?.chave_nfe || (pedido as any)?.nfe_numero || (pedido as any)?.metadados?.chave_nfe)`).
   - Calcular a flag booleana no `ShippingFulfillmentSelector`:
     ```ts
     const limiteDeclaracaoConteudo = Number(configLoja?.limite_declaracao_conteudo ?? 1000);
     const excedeLimiteSemNfe = !ehCatalogo && subtotal > limiteDeclaracaoConteudo && !possuiNfe;
     ```
   - **Regra de Estado (`useEffect` linhas `584-596`):** Se `excedeLimiteSemNfe` for `true`, forçar `setViaEntrega('manual')` e não disparar cotação automática desnecessária do Melhor Envio.
   - **Regra de Interface (linhas `1656-1700` e `2460+`):**
     - Quando `excedeLimiteSemNfe === true`:
       - **Ocultar** o seletor de abas ("Cotar Frete (Automático)" / "Informar Frete (Manual)"), exibindo diretamente a interface de **Informar Frete (Manual)**.
       - Renderizar no topo da seção de entrega um **alerta orientativo claro** para o operador:
         > *"Pedido com valor de produtos acima de R$ X.XXX,XX sem NF-e vinculada. Como o envio por Declaração de Conteúdo excede o limite parametrizado para geração automática de etiqueta, selecione e informe abaixo uma modalidade de frete manual."*
     - Quando ` subtotal <= limiteDeclaracaoConteudo ` (ou pedido com NF-e): manter a exibição normal das duas abas ("Cotar Frete (Automático)" e "Informar Frete (Manual)").

---

## 2. Ajuste na Máquina de Estados de Pedidos (Ação "Concluir" a partir de "Enviado")

### 2.1. Diagnóstico Técnico
- Em `src/utils/statusPedidoUtils.ts`:
  - Na função `obterOpcoesStatusAlteracao` (linhas `212-222`), quando `statusAtual === 'enviado' || statusAtual === 'saiu_para_entrega'`, a lista de opções só inclui `'entregue'`, `'aguardando_envio'` e `'cancelado'`, omitindo `'concluido'`.
  - Na função `validarTransicaoStatusPedido` (linhas `367-375`), a lista `permitidos` para `'enviado'` / `'saiu_para_entrega'` é `['entregue', 'aguardando_envio', 'cancelado']`. Ao clicar no botão **"Concluir"** na listagem de pedidos (`PedidosLista.tsx` linha `4072`/`4083` ou `PedidosListaMobile.tsx` linha `1522`/`1764`), `validarTransicaoStatusPedido` bloqueia a transição com a mensagem: *"A partir de Enviado, o pedido pode avançar para Entregue ou retornar para Aguardando envio."*

### 2.2. Arquivos Envolvidos
1. **Utilitário da Máquina de Estados:** `src/utils/statusPedidoUtils.ts` (funções `obterOpcoesStatusAlteracao` nas linhas `212-222` e `validarTransicaoStatusPedido` nas linhas `367-375`)
2. **Listagem Desktop e Mobile (Verificação de consistência):**
   - `src/components/PedidosLista.tsx` (linhas `1024-1032`, `1083-1097`, `4070-4090`)
   - `src/components/PedidosListaMobile.tsx` (linhas `1514-1534`, `1679-1688`, `1758-1773`)

### 2.3. Passo a Passo da Implementação
1. **Atualizar `obterOpcoesStatusAlteracao` em `src/utils/statusPedidoUtils.ts` (linhas `212-222`):**
   - Adicionar `{ id: 'concluido', label: 'Concluído' }` nas opções de transição a partir de `'enviado'` / `'saiu_para_entrega'`, mantendo `'entregue'` (quando ativo na loja), `'aguardando_envio'` (estorno operacional) e `'cancelado'`.
2. **Atualizar `validarTransicaoStatusPedido` em `src/utils/statusPedidoUtils.ts` (linhas `367-375`):**
   - Incluir `'concluido'` no array `permitidos`:
     ```ts
     if (statusAtual === 'enviado' || statusAtual === 'saiu_para_entrega') {
       const permitidos = ['entregue', 'concluido', 'aguardando_envio', 'cancelado'];
       if (!permitidos.includes(novoStatus)) {
         return {
           permitido: false,
           motivo: 'A partir de Enviado, o pedido pode avançar para Entregue, Concluído ou retornar para Aguardando envio.'
         };
       }
     }
     ```
   - Preservar a trava financeira existente nas linhas `288-304` (que garante que o pedido esteja pago ou com fiado válido antes de concluir).

---

## 3. Exibição de Preço Promocional no Modal de Variações (Catálogo Online)

### 3.1. Diagnóstico Técnico
- Em `src/components/CatalogoPublico.tsx` (linhas `2488-2536`), o modal de seleção rápida de variações (`produtoModalVariacao`) renderiza na linha `2528` apenas `R$ {Number(variacao.preco_venda_varejo).toFixed(2)}`, ignorando `variacao.preco_promocional` e `produtoModalVariacao.promocao_ativa / preco_promocional`.
- Além disso, em `src/services/pricingEngine.ts` (linhas `145-150`), na tabela `'varejo'`, a função `calcularPrecoUnitarioPorTabela` verifica `produto.promocao_ativa && produto.preco_promocional`, mas não prioriza `variacao.preco_promocional` caso a variação possua preço promocional específico.

### 3.2. Arquivos Envolvidos
1. **Catálogo Público (Modal de Variações):** `src/components/CatalogoPublico.tsx` (linhas `2488-2536`)
2. **Motor de Precificação:** `src/services/pricingEngine.ts` (linhas `109-151`)

### 3.3. Passo a Passo da Implementação
1. **Cálculo e Exibição no Modal de Variações (`src/components/CatalogoPublico.tsx`, linhas `2499-2533`):**
   - Para cada `variacao` de `produtoModalVariacao`:
     ```ts
     const precoOriginalVar = Number(variacao.preco_venda_varejo || produtoModalVariacao.preco_venda_varejo || 0);
     const precoPromoCandidato = Number(
       (variacao.preco_promocional && Number(variacao.preco_promocional) > 0)
         ? variacao.preco_promocional
         : (produtoModalVariacao.promocao_ativa && produtoModalVariacao.preco_promocional ? produtoModalVariacao.preco_promocional : 0)
     );
     const temPromoVar = Boolean(
       (variacao.preco_promocional && Number(variacao.preco_promocional) > 0) ||
       (produtoModalVariacao.promocao_ativa && produtoModalVariacao.preco_promocional && Number(produtoModalVariacao.preco_promocional) > 0)
     ) && precoPromoCandidato > 0 && precoPromoCandidato < precoOriginalVar;
     const precoEfetivoVar = temPromoVar ? precoPromoCandidato : precoOriginalVar;
     ```
   - Renderizar no lado direito do botão da variação (com suporte a tema claro/escuro):
     - Quando `temPromoVar === true`: exibir o preço original riscado (`line-through text-[10px] text-slate-400 dark:text-slate-500`) ao lado/acima do preço promocional em destaque (`font-black text-xs text-emerald-600 dark:text-emerald-400`), usando `formatarMoeda`.
     - Quando `temPromoVar === false`: exibir o `formatarMoeda(precoEfetivoVar)` em destaque.
   - Ajustar também o container do modal (`linhas 2490-2515`) para suportar tema claro/escuro (`bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800`).
2. **Paridade no `pricingEngine.ts` (linhas `145-150`):**
   - Garantir que `calcularPrecoUnitarioPorTabela` considere `variacao?.preco_promocional` (se `> 0`) ou `produto.preco_promocional` quando `produto.promocao_ativa` estiver ativa.

---

## 4. Padronização Visual do Botão de Finalização do Carrinho (Catálogo Online)

### 4.1. Diagnóstico Técnico
- Em `src/components/CatalogoPublico.tsx` (linhas `2943-2951`), o botão principal **"Finalizar e Enviar Pedido"** no rodapé do drawer do carrinho utiliza as classes:
  ```tsx
  className="w-full py-4 rounded-2xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-black text-sm shadow-md flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer hover:opacity-90 active:scale-98"
  ```
- Isso faz com que no tema escuro ele fique branco com texto preto, destoando do CTA verde esmeralda (`bg-emerald-600 hover:bg-emerald-500 text-white`) utilizado no botão **"Selecionar"** da Forma de Entrega (linha `2919`).

### 4.2. Arquivos Envolvidos
1. **Catálogo Público (Drawer do Carrinho):** `src/components/CatalogoPublico.tsx` (linhas `2943-2951`)

### 4.3. Passo a Passo da Implementação
1. **Substituir Classes do Botão CTA (`src/components/CatalogoPublico.tsx`, linha `2947`):**
   - Atualizar para o padrão verde esmeralda do Design System HUBI:
     ```tsx
     className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer active:scale-98"
     ```
   - Garante fundo verde (`bg-emerald-600`), hover consistente (`hover:bg-emerald-500`) e tipografia branca (`text-white`) em ambos os temas (claro e escuro).

---

## 5. Proporções, Tipografia e Botões no Modal de Detalhes do Produto (Catálogo Online)

### 5.1. Diagnóstico Técnico
- Em `src/components/ModalDetalhesProdutoCatalogo.tsx`:
  1. **Container da Imagem Excessivamente Grande (linhas `153-158`):** Usa `aspect-square w-full` com `sm:object-cover`, ocupando uma área vertical excessiva no modal (`max-w-lg`) e empurrando título, preço e botão para fora da primeira dobra.
  2. **Tipografia Desproporcional (linhas `221` e `241`):**
     - Título usa `text-lg sm:text-xl font-black`.
     - Preço usa `text-2xl sm:text-3xl font-black` e aplica `style={{ color: corTema }}`.
  3. **Botão "Adicionar ao Carrinho" Branco Ilegível (linhas `315-327`):**
     - O botão aplica `className="... text-white"` combinado com `style={{ backgroundColor: !isEsgotado && !adicionadoSucesso ? corTema : undefined }}`.
     - Em `src/components/CatalogoPublico.tsx` (linha `1053`), `corTema` é definido como `isDark ? '#FFFFFF' : '#000000'`. No tema escuro, `backgroundColor: '#FFFFFF'` + `text-white` resulta em um botão **100% branco com texto branco (invisível)**.
  4. **Incompatibilidade com Tema Claro (todo o arquivo `ModalDetalhesProdutoCatalogo.tsx` e `DescricaoFormatadaProduto.tsx`):**
     - As classes do modal estão fixas em tons escuros (`bg-slate-900`, `border-slate-800`, `text-slate-100`, `bg-slate-950/80`), ficando fora do padrão quando o catálogo está no tema claro.
  5. **Preço da Variação Selecionada no Modal (linhas `88-90`):**
     - Calcula `precoNormal` e `precoFinal` apenas do `produto`, sem refletir `variacaoSelecionada` quando o usuário troca de variação dentro do modal.

### 5.2. Arquivos Envolvidos
1. **Modal de Detalhes do Produto:** `src/components/ModalDetalhesProdutoCatalogo.tsx` (linhas `88-395`)
2. **Componente de Descrição Formatada:** `src/components/DescricaoFormatadaProduto.tsx` (linhas `195-256`)
3. **Modal Secundário de Produto na Rubi IA (Verificação de paridade):** `src/components/ChatRubiCatalogo.tsx` (linhas `1320-1405`)

### 5.3. Passo a Passo da Implementação
1. **Redimensionamento da Imagem (`src/components/ModalDetalhesProdutoCatalogo.tsx`, linhas `153-158`):**
   - Substituir `aspect-square w-full` por um container de altura controlada (~50% da área anterior): `h-44 sm:h-52 w-full rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center`.
   - Na tag `<img>`, aplicar `w-full h-full object-contain p-2 transition duration-300` para exibir o produto inteiro sem cortes e sem ocupar toda a viewport.
2. **Ajuste de Escala Tipográfica e Preço por Variação (`linhas 88-91` e `220-250`):**
   - Atualizar cálculo de `precoNormal` e `precoFinal` para considerar `variacaoSelecionada` (com paridade à regra do item 3).
   - Reduzir título do produto (`linha 221`) de `text-lg sm:text-xl font-black` para `text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-snug`.
   - Reduzir preço em destaque (`linha 241`) de `text-2xl sm:text-3xl font-black` com `style={{ color: corTema }}` para `text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400` (removendo o `style={{ color: corTema }}` que deixava o preço branco/preto sem destaque).
3. **Padronização do Botão "Adicionar ao Carrinho" (`linhas 315-341`):**
   - Remover `style={{ backgroundColor: ... }}` baseado em `corTema`.
   - Aplicar estilização padronizada verde com texto branco:
     ```tsx
     className={`w-full py-3 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition cursor-pointer ${
       isEsgotado
         ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700 cursor-not-allowed opacity-60'
         : adicionadoSucesso
         ? 'bg-emerald-700 text-white'
         : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 active:scale-98'
     }`}
     ```
4. **Alinhamento de Tokens Tema Claro / Escuro (`ModalDetalhesProdutoCatalogo.tsx` e `DescricaoFormatadaProduto.tsx`):**
   - No `ModalDetalhesProdutoCatalogo.tsx`:
     - Container principal: `bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100`.
     - Cabeçalho e rodapé sticky: `bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-800`.
     - Card de preço e seletor de quantidade: `bg-slate-50 dark:bg-slate-950/80 border-slate-200 dark:border-slate-800/80`.
     - Botões de variação, botão da Rubi IA e botão "Ver Carrinho": classes responsivas a tema claro (`bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300`) e escuro (`dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700`).
   - No `DescricaoFormatadaProduto.tsx` (linhas `196`, `204`, `211`, `222`, `234`, `248`):
     - Substituir fundos e textos fixos escuros por variantes dual-theme (`bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800/70 text-slate-700 dark:text-slate-200`).

---

## 6. Destaque e Visibilidade do Modo Viva-Voz na Rubi IA (Catálogo Online)

### 6.1. Diagnóstico Técnico
- Em `src/components/ChatRubiCatalogo.tsx`:
  - O botão de Viva-Voz (`alternarModoWakeWord`) está localizado apenas no cabeçalho superior (linhas `933-953`), com o rótulo oculto em telas móveis (`hidden sm:inline`) e exibindo apenas o ícone `<Radio />`.
  - Abaixo de cada mensagem da Rubi (linhas `1069-1086`), existe apenas o botão **"🔊 Ouvir resposta"**, perdendo a oportunidade de apresentar ao usuário o controle de conversa contínua exatamente no fluxo de leitura/escuta da resposta.

### 6.2. Arquivos Envolvidos
1. **Componente da Assistente Rubi IA no Catálogo:** `src/components/ChatRubiCatalogo.tsx` (linhas `930-954` no header e linhas `1069-1087` junto ao botão "Ouvir resposta")

### 6.3. Passo a Passo da Implementação
1. **Posicionar o Botão "Viva-Voz (tipo Alexa)" ao Lado de "Ouvir resposta" (`src/components/ChatRubiCatalogo.tsx`, linhas `1069-1087`):**
   - Envolver a área de ações abaixo da bolha de mensagem da Rubi (`msg.remetente === 'rubi'`) em um container flexível (`flex flex-wrap items-center gap-1.5 mt-0.5`).
   - Manter o botão **"🔊 Ouvir resposta"** e adicionar imediatamente ao seu lado o botão de ação explícita do Viva-Voz:
     ```tsx
     <button
       type="button"
       onClick={alternarModoWakeWord}
       className={`text-[10px] flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition cursor-pointer select-none font-bold ${
         modoWakeWord
           ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs ring-2 ring-emerald-500/30'
           : isDark
             ? 'text-indigo-300 hover:text-white bg-indigo-950/70 hover:bg-indigo-900/80 border-indigo-500/40'
             : 'text-indigo-800 hover:text-indigo-950 bg-indigo-50 hover:bg-indigo-100 border-indigo-300 shadow-2xs'
       }`}
       title={
         modoWakeWord
           ? 'Modo Viva-Voz ativo! Fale naturalmente com a Rubi. Clique para desativar.'
           : 'Ativar conversa contínua por voz sem precisar tocar na tela'
       }
     >
       <Radio className={`w-3 h-3 shrink-0 ${modoWakeWord ? 'text-white animate-pulse' : 'text-indigo-500 dark:text-indigo-400'}`} />
       <span>{modoWakeWord ? '🟢 Viva-Voz Ativo (tipo Alexa)' : '🎙️ Viva-Voz (tipo Alexa)'}</span>
     </button>
     ```
2. **Manter Sincronia e Feedback Visual de Microfone Ativo (`linhas 932-953` e `1013-1033`):**
   - Atualizar também o botão no cabeçalho (linhas `933-953`) para exibir visivelmente o texto **`Viva-Voz (tipo Alexa)`** com indicador pulsante quando `modoWakeWord` ou `escutandoVoz` estiver ativo, garantindo feedback visual imediato em toda a janela do chat.

---

## Resumo da Ordem de Execução Recomendada (Após Aprovação)

1. **Etapa 1 (Banco & Configs de Envio):** Criar migration `20261020120000_add_limite_declaracao_conteudo_shipping.sql` + atualizar `src/types/shipping.ts`, `src/services/shippingOrchestrator.ts`, `src/components/shipping/ShippingSettingsScreen.tsx`, `src/components/pedidos/ModalDefinirEnvio.tsx` e `src/components/shipping/ShippingFulfillmentSelector.tsx`.
2. **Etapa 2 (Máquina de Estados de Pedidos):** Atualizar `src/utils/statusPedidoUtils.ts` para liberar a transição direta `enviado -> concluido`.
3. **Etapa 3 (Catálogo - Variações, Drawer e Modal de Detalhes):** Atualizar `src/services/pricingEngine.ts`, `src/components/CatalogoPublico.tsx`, `src/components/ModalDetalhesProdutoCatalogo.tsx` e `src/components/DescricaoFormatadaProduto.tsx`.
4. **Etapa 4 (Rubi IA - Viva-Voz):** Atualizar `src/components/ChatRubiCatalogo.tsx` adicionando o botão explícito **"Viva-Voz (tipo Alexa)"** ao lado de **"Ouvir resposta"** com feedback visual ativo.
