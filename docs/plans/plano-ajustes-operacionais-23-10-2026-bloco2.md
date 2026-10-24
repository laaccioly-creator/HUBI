# Plano de Implementação Detalhado — Ajustes Operacionais (Bloco 2 - 23/10/2026)

**Data da Homologação:** 23/10/2026 (Bloco 2)  
**Responsável:** Arquitetura & Engenharia Full-Stack HUBI  
**Stack:** React 18 + TypeScript + Vite + TailwindCSS + Supabase (PostgreSQL 15 + RLS) + Zod  
**Status:** Planejado — Aguardando Aprovação Formal para Execução

---

## Sumário Executivo

Este plano detalha o diagnóstico de causa-raiz, o mapeamento exato de arquivos/linhas e a estratégia cirúrgica de correção para os **6 apontamentos homologados no Bloco 2 da sessão operacional de 23/10/2026**. Nenhuma modificação destrutiva no código-fonte foi executada nesta etapa de planejamento.

---

## Mapeamento Consolidado de Arquivos Impactados

| Item | Escopo | Arquivos Afetados |
| :--- | :--- | :--- |
| **1** | Produtos Pesáveis (KG / Gramas) no PDV e Catálogo Online | `supabase/migrations/20261023233000_bloco2_pesaveis_e_saneamento_frete.sql`<br>`src/utils/formatters.ts`<br>`src/components/PosCheckout.tsx`<br>`src/components/PosCheckoutMobile.tsx`<br>`src/components/CatalogoPublico.tsx`<br>`src/components/ModalInputPesoFracionado.tsx` |
| **2** | Remoção do Card "Formas de Envio" em Cadastros & Tabelas | `src/components/CadastrosAuxiliares.tsx` |
| **3** | Padronização do Texto e Alinhamento do Card "Distribuidor" | `src/components/ConfiguracoesLoja.tsx` |
| **4** | Eliminação da Tela Intermediária de Frete (Desktop) e Texto de Transportadoras | `src/components/ConfiguracoesLoja.tsx`<br>`src/components/shipping/ShippingSettingsScreen.tsx` |
| **5** | Modal de Entrega do Catálogo: Frete Fantasma ("Frete Italia") e Ocultação do "Frete a Combinar" | `src/components/shipping/ShippingFulfillmentSelector.tsx`<br>`src/services/shippingOrchestrator.ts`<br>`src/components/CatalogoPublico.tsx` |
| **6** | Fluxo de Definição de Frete no PDV Desktop e Sanitização de Resíduos Legados | `src/components/PosCheckout.tsx`<br>`src/components/ModalPagamentoFechamento.tsx`<br>`src/components/pedidos/ModalDefinirEnvio.tsx`<br>`src/components/shipping/ShippingFulfillmentSelector.tsx`<br>`supabase/migrations/20261023233000_bloco2_pesaveis_e_saneamento_frete.sql` |

---

## Detalhamento Técnico por Item

### 1. Suporte Completo a Produtos Pesáveis Vendidos por Quilo (KG) no PDV e Catálogo Online

#### Diagnóstico de Causa-Raiz
1. **Cadastro no Banco de Dados (`produtos`):** Produtos de hortifrúti e açougue já cadastrados na loja de homologação (como *Abóbora Kabocha*, *Acém Bovino* e *Alho*) foram salvos originalmente com `tipo_unidade = 'un'` e `unidade_medida = 'UN'`, fazendo com que `ehProdutoFracionado(produto)` retorne `false`.
2. **Exibição e Seletores no Carrinho do PDV (`PosCheckout.tsx` / `PosCheckoutMobile.tsx`):**
   - No carrinho Desktop (`PosCheckout.tsx`, linhas 2722–2758), a linha de preço exibe apenas `{formatCurrency(item.preco)} / {item.tipo_unidade}` em vez da equação explícita `1,250 kg x R$ 35,00/kg = R$ 43,75`.
   - Os botões `-` e `+` no carrinho chamam `atualizarQuantidade(index, item.quantidade - 1)` e `+ 1` em degraus inteiros quando o item não está marcado com `permite_fracionado = true`.
3. **Catálogo Online (`CatalogoPublico.tsx`):**
   - O `CatalogoPublico.tsx` ainda não importa nem aciona o `ModalInputPesoFracionado` ao adicionar um produto pesável ao carrinho, adicionando sempre `1` unidade inteira e exibindo seletores unitários `(- 1 +)` na sacola.

#### Plano de Ação
1. **Migration SQL (`supabase/migrations/20261023233000_bloco2_pesaveis_e_saneamento_frete.sql`):**
   - Garantir que todo produto com `tipo_unidade IN ('kg', 'g', 'l', 'ml', 'm')` ou `unidade_medida IN ('KG', 'G', 'L', 'ML', 'M')` tenha `permite_fracionado = true` e `venda_por_peso = true`.
   - Atualizar no banco os produtos tipicamente pesáveis (cujo nome contenha `(kg)`, `/kg`, `kg`, ou itens de hortifrúti/açougue como `Abóbora%`, `Acém%`, `Alho%` cadastrados sem unidade fracionada) para `tipo_unidade = 'kg'`, `unidade_medida = 'KG'`, `permite_fracionado = true` e `venda_por_peso = true`, mantendo conformidade com RLS.
2. **Utilitário `ehProdutoFracionado` (`src/utils/formatters.ts`):**
   - Reforçar `ehProdutoFracionado` para considerar `venda_por_peso === true`, `permite_fracionado === true`, `unidade_medida === 'KG'` / `'G'` e sufixos explícitos no nome (`(kg)`, `/kg`).
3. **PDV Desktop (`src/components/PosCheckout.tsx`) e Mobile (`src/components/PosCheckoutMobile.tsx`):**
   - Ao clicar em um card de produto pesável na grade ou buscar via leitor/teclado, abrir obrigatoriamente o `ModalInputPesoFracionado` com 3 casas decimais (`1,250 kg`) e cálculo em tempo real (`peso_em_kg * preco_por_kg = subtotal_item`).
   - No carrinho lateral, exibir para itens pesáveis a formatação comercial completa via `formatarLinhaCalculoItem(item.quantidade, item.preco, 'KG')` (ex.: `1,250 kg x R$ 35,00/kg = R$ 43,75`).
   - Substituir o comportamento do seletor de quantidade do item pesável no carrinho: clicar no peso ou nos botões abre o `ModalInputPesoFracionado` (ou incrementa/decrementa em frações de `0,100 kg`), nunca tratando como `1 un`.
4. **Catálogo Online (`src/components/CatalogoPublico.tsx`):**
   - Integrar o `ModalInputPesoFracionado` ao fluxo de adição de produto pesável no `CatalogoPublico.tsx` (ou permitir seleção/digitação em incrementos fracionados de peso com 3 casas decimais).
   - Na sacola/carrinho do Catálogo Online, formatar o item pesável como `1,250 kg x R$ 35,00/kg = R$ 43,75` e permitir clicar no peso para reajustar a quantidade fracionada, refletindo o valor proporcional exato no fechamento.

---

### 2. Remoção do Card "Formas de Envio" em Cadastros & Tabelas (`CadastrosAuxiliares.tsx`)

#### Diagnóstico de Causa-Raiz
- No arquivo `src/components/CadastrosAuxiliares.tsx` (linhas 1548–1549), a matriz `itensMenuCadastros` ainda mantém o item `{ id: 'formas_envio', label: 'Formas de Envio', icon: Truck, cor: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', desc: 'Motoboy, Correios e taxas de entrega' }`.
- Isso cria duplicidade e concorrência direta com a central oficial em `Configurações > Opções de Frete e Entrega`.

#### Plano de Ação
1. Remover o objeto `{ id: 'formas_envio', ... }` de `itensMenuCadastros` em `src/components/CadastrosAuxiliares.tsx` (linhas 1548–1549).
2. Preservar o alinhamento responsivo da grade de cards auxiliares restantes (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).

---

### 3. Padronização do Texto Explicativo e Alinhamento do Card "Distribuidor" (`ConfiguracoesLoja.tsx`)

#### Diagnóstico de Causa-Raiz
- Em `src/components/ConfiguracoesLoja.tsx` (subtela `tipos-venda`, linha 3529), o texto descritivo do card **Distribuidor** é:
  > *"Condições especiais para grandes volumes, revendedores e parceiros comerciais."*
- Já o card **Atacado** (linha 3375) possui um texto mais extenso de 3 linhas:
  > *"Permite aplicar automaticamente o preço de atacado quando o carrinho atingir a quantidade mínima de itens ou valor configurado."*
- Essa diferença de extensão cria desnível visual na altura do cabeçalho dos cards em telas intermediárias.

#### Plano de Ação
1. Em `src/components/ConfiguracoesLoja.tsx` (linha 3529), substituir o texto do card **Distribuidor** exatamente por:
   > *"Permite aplicar automaticamente o preço de distribuidor quando o carrinho atingir a quantidade mínima de itens ou valor configurado."*
2. Garantir `min-h-[3.75rem]` uniforme nos parágrafos descritivos dos 3 cards (Varejo, Atacado e Distribuidor) para simetria horizontal estrita nos blocos subsequentes (`Desconto Padrão (%)`, `Opção 1`, `Opção 2` e `Opção 3`).

---

### 4. Eliminação Definitiva da Tela Intermediária de Frete e Simplificação do Texto de Transportadoras

#### Diagnóstico de Causa-Raiz
1. **Menu de Configurações no Desktop (`src/components/ConfiguracoesLoja.tsx`):**
   - O componente `ConfiguracoesLoja.tsx` possui **dois blocos distintos** que renderizam `itensMenu.map`:
     - Bloco Mobile (linhas 1873–1893): já possuía `else if (item.id === 'entrega') { navigate('/configuracoes/frete'); }`.
     - Bloco Desktop (linhas 3063–3077): **não possuía** a condição `item.id === 'entrega'`, caindo no `else { setSubTela(item.id as SubTelaConfig); }` e abrindo a subtela intermediária `{subTela === 'entrega' && (...)}` (linha 5025) que contém apenas o botão *"Configurar Frete Avançado"*.
2. **Card "Transportadoras Parceiras & Cargas" (`src/components/shipping/ShippingSettingsScreen.tsx`):**
   - Nas linhas 1281–1283, o subtítulo exibe: `Cadastre empresas parceiras com link direto de rastreio (using {{codigo}}).`
   - Nas linhas 1372–1378, há um rodapé redundante dentro do card: *"Toda a gestão logística de frete próprio, motoboys, integrações automáticas e transportadoras parceiras está centralizada nesta tela."*

#### Plano de Ação
1. Em `src/components/ConfiguracoesLoja.tsx` (linhas 3067–3075): adicionar `else if (item.id === 'entrega') { navigate('/configuracoes/frete'); }` no handler `onClick` da grade Desktop e remover o bloco residual `{subTela === 'entrega' && (...)}` (linhas 5025–5054).
2. Em `src/components/shipping/ShippingSettingsScreen.tsx`:
   - Alterar o parágrafo das linhas 1281–1283 para exibir estritamente:
     > *"Cadastre empresas parceiras com link direto de rastreio."*
   - Remover o bloco de rodapé redundante das linhas 1372–1378 para manter o card limpo e enxuto tanto no tema claro quanto no tema escuro.

---

### 5. Correção no Modal de Entrega do Catálogo: Frete Fantasma e Ocultação do Frete a Combinar

#### Diagnóstico de Causa-Raiz
1. **Bloqueio Indevido da Cotação do Frete Próprio (`src/components/shipping/ShippingFulfillmentSelector.tsx`):**
   - Na linha 569: `const temIntegracaoAutomatica = Boolean(temUber || temMelhorEnvio);` (ignora `temFreteProprio`).
   - Na linha 611: `if (excedeLimiteSemNfe || (!temUber && !temMelhorEnvio)) { setCotacoes([]); return; }`.
   - Consequência: quando a loja possui **Frete Próprio (Entrega da Loja)** ativo em `loja_shipping_configs`, mas Uber Direct e Melhor Envio estão desligados, `executarCotacao` aborta antes de chamar `ShippingOrchestrator.cotarOpcoesFrete`! Com isso, a opção `opcao_frete_proprio` nunca chega ao array `cotacoes`.
2. **Exibição Indevida de "Frete a combinar (R$ 0,00)":**
   - Na linha 2261 de `ShippingFulfillmentSelector.tsx`, como `cotacoes` ficava vazio (`cotacoes.length === 0`), o componente exibia o card `"Frete a combinar (R$ 0,00)"` mesmo com Retirada na Loja e Frete Próprio ativos.
3. **Linha Desformatada "Frete Italia - R$ 0,00" que Desaparece ao Clicar:**
   - Na tabela legada `public.formas_entrega`, existe um registro residual `"Frete Italia"` com `taxa = 0`.
   - Em `ShippingFulfillmentSelector.tsx` (linhas 351–363 e 2425–2450), registros de `formas_entrega` eram carregados e injetados como opções manuais ou pré-selecionados na inicialização, gerando conflito com `ShippingSelection` do Catálogo e revertendo para `"Frete a combinar"` ao clicar.

#### Plano de Ação
1. **`src/services/shippingOrchestrator.ts`:**
   - Garantir que a opção `opcao_frete_proprio` gerada em `cotarOpcoesFrete` utilize o nome oficial configurado (`config.frete_proprio_nome || 'Entrega da Loja (Frete Próprio)'`) e o prazo configurado (`config.frete_proprio_prazo_estimado || 'Entrega no mesmo dia'`), inclusive quando `frete_proprio_valor` for `0` (frete grátis) ou valor fixo, com `id: 'opcao_frete_proprio'` estável.
2. **`src/components/shipping/ShippingFulfillmentSelector.tsx`:**
   - Incluir `temFreteProprio` na flag `temIntegracaoAutomatica` (`Boolean(temFreteProprio || temUber || temMelhorEnvio)`) e na guarda de `executarCotacao` (linha 611).
   - Para o Frete Próprio sem exigência de cálculo externo por CEP (valor fixo configurado em `loja_shipping_configs`), disponibilizar imediatamente o card oficial de **Frete Próprio (Entrega da Loja)** com seu valor (`frete_proprio_valor`), frete grátis acima do mínimo (`frete_proprio_Minimo_gratis`) e prazo estimado (`frete_proprio_prazo_estimado`), mesmo antes ou independente de APIs externas.
   - Ocultar compulsoriamente o card `"Frete a combinar"` sempre que a loja possuir qualquer método oficial ativo (`permiteRetirada || temFreteProprio || temUber || temMelhorEnvio || transportadorasCadastradas.length > 0`).
   - Remover a renderização de registros da tabela legada `formas_entrega` (como `"Frete Italia"`) dentro do modal do Catálogo e unificar a chave de seleção (`selectedId`) no estado do carrinho para que a escolha de **Entrega da Loja (Frete Próprio)** ou **Retirada na Loja** persista de forma estável.

---

### 6. Correção do Fluxo de Definição de Frete no PDV Desktop e Sanitização de Resíduos Legados

#### Diagnóstico de Causa-Raiz
1. **Flash / Sobreposição ao Clicar em "A definir" no Modal de Pagamento & Fechamento:**
   - No `ModalPagamentoFechamento.tsx` (linha 1295), o botão `"A definir"` dispara `onAbrirModalEnvio()`, que em `PosCheckout.tsx` (linha 3592) monta `<ModalDefinirEnvio />` enquanto `ModalPagamentoFechamento` permanece aberto no mesmo nível de portal/empilhamento ou re-renderiza estados concorrentes.
2. **Seção "Retirada Presencial" Exibida Dentro de Pedido Marcado como "Entrega" + Item Legado "Frete Italia":**
   - Em `ModalDefinirEnvio.tsx` (linhas 92–100), `<ShippingFulfillmentSelector />` é renderizado sem ocultar a seção de Retirada quando o operador já definiu no PDV que o pedido é para **Entrega**.
   - Além disso, o bloco "Entrega Própria / Motoboy da Loja" em `ShippingFulfillmentSelector.tsx` (linhas 2425–2453) iterava sobre a tabela legada `formas_entrega`, listando `"Frete Italia - R$ 0,00"` em vez de exibir o **Frete Próprio Oficial** parametrizado em `loja_shipping_configs` (`Configurações > Opções de Frete e Entrega`).

#### Plano de Ação
1. **Transição Limpa de Modal (`src/components/PosCheckout.tsx` / `src/components/pedidos/ModalDefinirEnvio.tsx`):**
   - Garantir hierarquia de `z-index` dedicada (`z-[120]`) e isolamento de eventos (`stopPropagation`) na abertura do `ModalDefinirEnvio` a partir do `ModalPagamentoFechamento`, eliminando qualquer flash visual ou remontagem dupla.
2. **Contextualização Estrita para Entrega no PDV (`src/components/pedidos/ModalDefinirEnvio.tsx` & `src/components/shipping/ShippingFulfillmentSelector.tsx`):**
   - Adicionar a prop `ocultarRetirada?: boolean` (ativa quando aberto a partir do fluxo de "Definir Frete / Entrega" do PDV) para não exibir a opção redundante de Retirada Presencial quando o pedido já é de entrega.
   - Substituir a listagem da tabela legada `formas_entrega` pela exibição direta das opções oficiais configuradas em `Configurações > Opções de Frete e Entrega`:
     1. **Frete Próprio da Loja** (lendo `frete_proprio_ativo`, `frete_proprio_nome`, `frete_proprio_valor`, `frete_proprio_prazo_estimado` de `loja_shipping_configs`, com possibilidade de ajuste rápido de taxa no PDV).
     2. **Transportadoras Parceiras Ativas** (`loja_transportadoras`).
     3. **Apps de Corrida / Motoboy Ativos** (`loja_apps_entrega`) e integrações automáticas (`Uber Direct` / `Melhor Envio`).
3. **Saneamento de Banco de Dados (`supabase/migrations/20261023233000_bloco2_pesaveis_e_saneamento_frete.sql`):**
   - Desativar/remover registros legados órfãos como `"Frete Italia"` em `public.formas_entrega` quando a loja já possui `loja_shipping_configs` configurado, garantindo que nenhum componente legado volte a exibi-lo.

---

## Plano de Verificação e Homologação Técnica

1. **Validação de Schema e Migration SQL:** Execução limpa da migration `20261023233000_bloco2_pesaveis_e_saneamento_frete.sql` respeitando RLS (`usuario_pertence_loja(loja_id)`).
2. **Checagem Estática e Build de Produção:** Execução de `npm run build` (`tsc && vite build`) com zero erros de tipagem.
3. **Checklist Funcional dos 6 Itens:**
   - [ ] Produtos por KG (Abóbora Kabocha, Acém Bovino, Alho) abrem entrada de peso (`1,250 kg`) no PDV e no Catálogo Online e exibem `1,250 kg x R$ 35,00/kg = R$ 43,75`.
   - [ ] Card "Formas de Envio" removido de `Cadastros & Tabelas`.
   - [ ] Texto do card "Distribuidor" padronizado e alinhado horizontalmente com "Atacado" em `Tipos de Venda`.
   - [ ] Clique em "Opções de Frete e Entrega" no Desktop navega direto para `/configuracoes/frete` sem tela intermediária, e card de Transportadoras exibe apenas *"Cadastre empresas parceiras com link direto de rastreio."* sem textos redundantes.
   - [ ] Modal de entrega do Catálogo Online exibe apenas Retirada na Loja e Frete Próprio oficial (com valor e prazo configurados), sem "Frete a combinar" e sem "Frete Italia".
   - [ ] Botão "A definir" no fechamento do PDV Desktop abre diretamente o seletor de envio sem flash, sem opção de Retirada redundante e sem o resíduo "Frete Italia".
