# Plano de Implementação Detalhado: Ajustes Operacionais de Homologação (23/10/2026)

**Data de Elaboração:** 23/10/2026  
**Autor:** Arquitetura & Engenharia Full-Stack Sênior HUBI  
**Escopo:** 9 melhorias estruturais e correções críticas homologadas no PDV, Catálogo Online, Configurações Comerciais e Orquestração de Logística/Frete.

---

## 🛡️ Diretrizes de Governança & Conformidade Arquitetural

1. **Economia de Tokens & Patch Cirúrgico (`diff-patch-only`):** Todas as refatorações subsequentes serão aplicadas exclusivamente por substituições cirúrgicas de blocos (`edit_file`), sem reescrita integral de arquivos extensos.
2. **Isolamento Multi-Tenant Estrito (`supabase-rls-guard`):** Todas as migrações SQL incluem `ENABLE ROW LEVEL SECURITY` e políticas explícitas `USING (public.usuario_pertence_loja(loja_id))` / `WITH CHECK (public.usuario_pertence_loja(loja_id))`. Toda query no frontend mantém `.eq('loja_id', loja.id)`.
3. **Modelagem Relacional Pura (`anti-jsonb-linter`):** Nenhuma coluna `JSONB` genérica será introduzida para regras de negócio, pesagem, precificação ou logística. Serão utilizadas colunas nativas e tipadas (`NUMERIC`, `BOOLEAN`, `VARCHAR`, `UUID`) nas tabelas relacionais especializadas (`produtos`, `itens_pedido`, `lojas`, `loja_shipping_configs`, `formas_entrega`).
4. **Sanitização de PII & Erros Amigáveis (`pii-leak-detector`):** Nenhum dado sensível (CPF, WhatsApp, coordenadas ou chaves de API) será exposto em logs; erros de banco serão convertidos em mensagens amigáveis em `pt-BR`.
5. **Blindagem de Fronteira em Runtime (`supabase-zod-boundary` & `total-typescript-domain`):** Uso de contratos tipados, *Discriminated Unions* e schemas Zod estritos nas fronteiras de entrada/saída (pesagem fracionada, ajuste de balança na caderneta, regras comerciais por produto e configuração de frete próprio).

---

## 🗺️ 1. Mapeamento Geral de Arquivos Impactados por Item

| Item | Escopo Resumido | Arquivos Impactados no Repositório |
| :--- | :--- | :--- |
| **1** | **Suporte a Produtos Pesáveis / Fracionados (KG / Gramas), Balança EAN-13 e Ajuste de Caderneta** | • `supabase/migrations/20261023220000_suporte_produtos_pesaveis_e_frete_proprio.sql` *(Novo)*<br>• `src/types.ts` e `src/types/domain-contracts.ts`<br>• `src/lib/validations/pesagemSchema.ts` *(Novo)* e `src/lib/validations/cadernetaSchema.ts`<br>• `src/utils/formatters.ts` (helpers `ehProdutoFracionado`, `formatarQuantidadeUnidade`, parser EAN-13 balança)<br>• `src/components/ui/ModalInputPesoFracionado.tsx` *(Novo)*<br>• `src/contexts/CartContext.tsx`<br>• `src/components/PosCheckout.tsx` e `src/components/PosCheckoutMobile.tsx`<br>• `src/components/ProdutoCadastro.tsx` e `src/components/ProdutosMobile.tsx`<br>• `src/components/CatalogoPublico.tsx`<br>• `src/components/PedidosLista.tsx`, `src/components/PedidosListaMobile.tsx` e `src/components/ModalItensPedido.tsx`<br>• `src/services/cadernetaService.ts`, `src/services/printService.ts`, `src/services/receiptPdfService.ts`, `src/components/ReciboPublico.tsx` e `src/components/pedidos/ReciboPedidoModal.tsx` |
| **2** | **Ampliação e Destaque do Alerta de Degustação / Trial no Header** | • `src/components/layout/AppLayout.tsx` (bloco de identificação da loja e contador de trial, linhas `475-514`)<br>• `src/components/assinatura/BannerAssinaturaTop.tsx` |
| **3** | **Tipografia, Alinhamento em Grade e Reformulação do "Mínimo por Produto" (Atacarejo)** | • `src/components/ConfiguracoesLoja.tsx` (estados linhas `381-393`, persistência `615-665`, subtela mobile `2460-2903` e subtela desktop `3208-3715`)<br>• `src/services/pricingEngine.ts` (`obterRegrasPrecificacao`, `calcularPrecoUnitarioPorTabela`, `avaliarNivelCarrinho`)<br>• `src/types.ts` (`Loja`, `RegrasPrecificacaoLoja`) e `src/types/domain-contracts.ts` (`RegraComercialAtacado`)<br>• `src/lib/validations/checkoutSchema.ts` |
| **4** | **Eliminação de Botão de Salvar Duplicado e Barra Inferior em Tipos de Venda** | • `src/components/ConfiguracoesLoja.tsx` (barra superior linhas `1845-1865` e `3011-3041`; remoção dos rodapés duplicados nas linhas `2904-2931` e `3732-3773`) |
| **5** | **Ocultação do Atacado e Prevenção de Descontos Indevidos no Catálogo Online** | • `src/services/pricingEngine.ts` (respeito estrito a `tiposVendaAtivos.atacado === false` e `distribuidor === false` sem contaminar com `localStorage` obsoleto)<br>• `src/components/CatalogoPublico.tsx` (cálculo de `regrasAtivas`, `temRegraAtacado` nas linhas `2741-2813`, cards de produto e modal de variações)<br>• `src/contexts/CartContext.tsx` |
| **6** | **Acesso Direto a "Opções de Frete e Entrega" sem Modal/Tela Intermediária** | • `src/components/ConfiguracoesLoja.tsx` (renomear item de menu na linha `1803` para `"Opções de Frete e Entrega"`, redirecionamento direto para `/configuracoes/frete` nas linhas `1877` e `3063`, e extinção da subtela intermediária `subTela === 'entrega'` nas linhas `5025-5062`) |
| **7** | **Correção Visual Completa do Dark Mode no Modal "Escolha Como Deseja Receber"** | • `src/components/CatalogoPublico.tsx` (container do modal de entrega nas linhas `3630-3770`)<br>• `src/components/shipping/ShippingFulfillmentSelector.tsx` (padronização dark mode `bg-slate-800/80`, `border-emerald-500`, `text-white` e `text-slate-300` nos cards de retirada, cotações, frete próprio e frete a combinar) |
| **8** | **Seção Formal de "Frete Próprio da Loja" em Configurações e no Catálogo Online** | • `supabase/migrations/20261023220000_suporte_produtos_pesaveis_e_frete_proprio.sql`<br>• `src/types/shipping.ts` (`LojaShippingConfig`)<br>• `src/services/shippingOrchestrator.ts` (`buscarConfigLoja`, `salvarConfigLoja`, `cotarOpcoesFrete`)<br>• `src/components/shipping/ShippingSettingsScreen.tsx` (nova seção dedicada "Frete Próprio (Entrega da Loja)" + gestão integrada de taxas fixas/bairros)<br>• `src/components/shipping/ShippingFulfillmentSelector.tsx` (exibição de "Entrega Própria da Loja" no Catálogo Online com valor e prazo, mantendo "Frete a combinar" apenas como fallback) |
| **9** | **Unificação Arquitetural da Gestão de Frete/Envio** | • `src/components/CadastrosAuxiliares.tsx` (remoção dos modais concorrentes de `formas_envio`, `apps_corrida` e `transportadoras` ou transformação em redirecionamento direto para `/configuracoes/frete`)<br>• `src/components/shipping/ShippingSettingsScreen.tsx` (centralização completa das formas/bairros da tabela `formas_entrega`, removendo o link quebrado `/cadastros?tab=formas_envio` na linha `1259`) |

---

## 📐 2. Detalhamento Técnico por Item (Arquitetura, Schemas, UI e Banco)

---

### ITEM 1: Suporte a Produtos Pesáveis / Fracionados (KG / Gramas), Balança EAN-13 e Ajuste de Caderneta

#### 1.1. Diagnóstico Arquitetural
- A tabela `public.produtos` possui `tipo_unidade` (`'un' | 'kg' | 'l' | 'm'`) e `unidade_medida` (`VARCHAR`), mas os seletores do PDV (`PosCheckout.tsx`, `PosCheckoutMobile.tsx`) e do Catálogo (`CatalogoPublico.tsx`) incrementam/decrementam quantidades apenas em passos inteiros (`+1` / `-1`) e exibem o sufixo estático `/ un` (ex.: `PosCheckout.tsx` linha `2722` e `ModalItensPedido.tsx` linha `152`).
- O leitor de código de barras (`PosCheckout.tsx` linha `875`) faz comparação literal (`p.codigo_barras === barcode`), não decodificando etiquetas de balança comercial padrão EAN-13 iniciadas pelo dígito `2` (`2CCCCCWWWWWD` ou `2CCCCCVVVVVD`).
- Em pedidos do Catálogo Online pagos via **Caderneta**, itens pesáveis (ex.: Abóbora Kabocha, Acém Bovino) sofrem variação natural de peso no momento do corte/pesagem na separação do pedido, exigindo ajuste de peso real pelo lojista com recálculo de subtotal e lançamento automático da diferença (débito ou estorno parcial) na caderneta do cliente, acompanhado de notificação.

#### 1.2. Modelagem Relacional no Supabase (Migration DDL)
Arquivo: `supabase/migrations/20261023220000_suporte_produtos_pesaveis_e_frete_proprio.sql`
```sql
-- 1. Colunas tipadas para venda fracionada/pesável em public.produtos
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS unidade_medida VARCHAR(10) NOT NULL DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS permite_fracionado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS venda_por_peso BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS codigo_balanca INTEGER NULL;

-- Sincronizar produtos já cadastrados como 'kg', 'g', 'l', 'm'
UPDATE public.produtos
SET
  unidade_medida = UPPER(COALESCE(NULLIF(TRIM(unidade_medida), ''), tipo_unidade, 'UN')),
  permite_fracionado = CASE WHEN LOWER(COALESCE(unidade_medida, tipo_unidade, 'un')) IN ('kg', 'g', 'l', 'ml', 'm', 'cm') THEN TRUE ELSE permite_fracionado END,
  venda_por_peso = CASE WHEN LOWER(COALESCE(unidade_medida, tipo_unidade, 'un')) IN ('kg', 'g') THEN TRUE ELSE venda_por_peso END;

-- 2. Garantir precisão de 3 casas decimais (NUMERIC(12,3)) para quantidades e estoques
ALTER TABLE public.produtos
  ALTER COLUMN quantidade_estoque TYPE NUMERIC(12,3) USING ROUND(quantidade_estoque::numeric, 3);

ALTER TABLE public.variacoes_produto
  ALTER COLUMN quantidade_estoque TYPE NUMERIC(12,3) USING ROUND(quantidade_estoque::numeric, 3);

ALTER TABLE public.itens_pedido
  ALTER COLUMN quantidade TYPE NUMERIC(12,3) USING ROUND(quantidade::numeric, 3),
  ADD COLUMN IF NOT EXISTS unidade_medida VARCHAR(10) NOT NULL DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS peso_solicitado_kg NUMERIC(12,3) NULL,
  ADD COLUMN IF NOT EXISTS peso_real_kg NUMERIC(12,3) NULL;
```
> **Conformidade RLS (`supabase-rls-guard`):** As tabelas `produtos`, `variacoes_produto`, `itens_pedido` e `cliente_notificacoes` mantêm `ENABLE ROW LEVEL SECURITY` e políticas `USING (public.usuario_pertence_loja(loja_id))` intactas.

#### 1.3. Schemas Zod e Utilitários de Domínio
1. **Novo Schema `src/lib/validations/pesagemSchema.ts`:**
   - `inputPesoFracionadoSchema`: valida `quantidade` positiva com até 3 casas decimais (`multipleOf(0.001)` ou arredondamento `Math.round(val * 1000) / 1000`), `preco_unitario > 0` e calcula `subtotal = Number((quantidade * preco_unitario).toFixed(2))`.
   - `etiquetaBalancaEan13Schema`: valida string de 13 dígitos numéricos iniciada por `'2'`, extraindo:
     - `codigoProdutoBalanca`: dígitos `1..5` (5 dígitos) ou `1..6` (6 dígitos, configurável/fallback automático buscando match em `codigo_balanca`, `codigo_interno` ou prefixo de `codigo_barras`).
     - `valorOuPesoCodificado`: dígitos `6..11` (dividido por `1000` para peso em KG com 3 casas decimais, ou dividido por `100` caso codifique preço total na etiqueta, convertendo `peso = valorTotal / precoKg`).
   - `ajustePesagemSeparacaoSchema`: valida o ajuste de peso de item em pedido de Catálogo Online (`pedido_id`, `loja_id`, `cliente_id`, `item_pedido_id`, `peso_solicitado_kg`, `peso_real_kg`, `preco_unitario_kg`), garantindo que o ajuste financeiro de diferença só ocorra quando `forma_pagamento === 'caderneta'` (ou `status_pagamento === 'fiado'`), bloqueando cobrança extra sem cobertura se exceder o limite disponível da caderneta.
2. **Helpers em `src/utils/formatters.ts`:**
   - `ehProdutoFracionado(produto?: Partial<Produto> | null): boolean` -> retorna `true` se `produto?.venda_por_peso === true || produto?.permite_fracionado === true || ['kg', 'g', 'l', 'ml', 'm'].includes((produto?.unidade_medida || produto?.tipo_unidade || '').toLowerCase())`.
   - `obterSiglaUnidade(produto?: Partial<Produto> | null): string` -> retorna `'kg'`, `'g'`, `'un'`, etc. formatado.
   - `formatarQuantidadeItem(quantidade: number, unidade?: string | null): string` -> para `'kg'`/`'l'`/`'m'` ou valores não-inteiros, formata com 3 casas decimais em pt-BR (`1,250 kg`); para `'un'` inteira, formata `1 un`.
   - `formatarLinhaCalculoItem(quantidade: number, precoUnitario: number, unidade?: string | null): string` -> retorna `"1,250 kg x R$ 6,40/kg = R$ 8,00"` para pesáveis ou `"2 un x R$ 10,00/un = R$ 20,00"` para unitários.

#### 1.4. Ajustes nos Componentes React (PDV, Catálogo, Cupom e Separação)
1. **Componente `src/components/ui/ModalInputPesoFracionado.tsx` (Novo):**
   - Modal ágil (compatível com teclado numérico físico e touch no mobile) exibindo nome do produto, preço por KG (`R$ 6,40 / kg`), input numérico com 3 casas decimais (`Ex: 1,250`), atalhos rápidos (`0,100 kg`, `0,250 kg`, `0,500 kg`, `1,000 kg`), alternativa de digitar em **Gramas (g)** ou **Valor desejado (R$)** (recalculando o peso automaticamente: ex. cliente pede "R$ 10,00 de Acém") e preview em tempo real: `1,250 kg x R$ 6,40/kg = R$ 8,00`.
2. **PDV (`PosCheckout.tsx`, `PosCheckoutMobile.tsx` e `CartContext.tsx`):**
   - Ao clicar em um card de produto onde `ehProdutoFracionado(produto) === true`, abrir `ModalInputPesoFracionado` em vez de inserir `1 un` direto.
   - Ao clicar sobre a quantidade/peso do item já presente no carrinho do PDV, reabrir `ModalInputPesoFracionado` para edição exata com 3 casas decimais. Os botões `-` e `+` em itens pesáveis ajustam em passos de `0,100 kg` (ou abrem o modal ao clicar no número central).
   - No leitor de código de barras (`adicionarProdutoPorCodigo`), detectar códigos de 13 dígitos iniciados por `2`: localizar o produto pelo código de balança/interno e adicionar imediatamente com o peso extraído (3 casas decimais), emitindo beep sonoro sem necessidade de digitação manual.
   - Na linha do item no carrinho e nos recibos (`printService.ts`, `receiptPdfService.ts`, `ReciboPublico.tsx`, `ReciboPedidoModal.tsx`), exibir `1,250 kg x R$ 6,40/kg = R$ 8,00` (substituindo `/ un` fixo).
3. **Catálogo Online (`CatalogoPublico.tsx`) e Ajuste de Balança na Separação (`PedidosLista.tsx` / `ModalItensPedido.tsx`):**
   - No Catálogo Online, produtos por KG permitem selecionar pesos fracionados (inputs/atalhos de gramatura ou digitação com 3 decimais, ex.: `0,500 kg`, `1,250 kg`).
   - **Regra de Pagamento Imediato (Pix / Cartão / Gateway):** O pedido é fechado e cobrado estritamente pelo peso solicitado no checkout.
   - **Regra de Pagamento a Prazo (Caderneta):** Na tela de Pedidos (`PedidosLista.tsx` / `ModalItensPedido.tsx`), durante o status `pendente`, `confirmado` ou `em_separacao`, exibir nos itens pesáveis o botão/input **"Ajustar Peso da Balança"**.
   - Quando o lojista informa o `peso_real_kg` (ex.: cliente pediu `1,000 kg` de Abóbora, mas na balança deu `1,150 kg`):
     1. Atualiza `peso_real_kg`, `quantidade` e `subtotal` em `public.itens_pedido` e recalcula `subtotal` e `valor_total` em `public.pedidos` (com `.eq('loja_id', loja.id)`).
     2. Invoca `CadernetaService.registrarAjustePesagemCaderneta(...)`, que lança a diferença (`+R$ 0,96` a débito ou `-R$ X,XX` a crédito/estorno) em `public.caderneta_lancamentos`, atualiza `saldo_devedor_caderneta` em `public.clientes` e grava uma notificação em `public.cliente_notificacoes` informando o peso real pesado na balança e o novo valor atualizado do pedido.

---

### ITEM 2: Ampliação e Destaque do Alerta de Degustação / Trial no Header Lateral (`AppLayout.tsx` / `BannerAssinaturaTop.tsx`)

#### 2.1. Diagnóstico Visual
- Em `src/components/layout/AppLayout.tsx` (linhas `475-514`), o bloco de identificação da loja ativa no topo esquerdo comprime o nome da loja (`text-xs lg:text-sm`) e renderiza o alerta de degustação com fontes minúsculas:
  - Contador `"Restam 7 dias"`: `text-[10px]` (linha `491`).
  - Botão `"Assinar"`: `text-[9px] px-2 py-0.5` (linha `497`).
  - Subtítulo `"Garanta por apenas R$ 49,90/mês"`: `text-[9px]` (linha `502`).
- O container pai possui `max-w-[260px]`, desperdiçando a margem livre à direita antes da grade central de botões.

#### 2.2. Especificação dos Ajustes
1. **Arquivo:** `src/components/layout/AppLayout.tsx` (linhas `475-514`):
   - Ampliar a largura útil do bloco esquerdo de `min-w-44 lg:min-w-56 max-w-[260px]` para `min-w-52 lg:min-w-64 max-w-[310px]`.
   - Subir ligeiramente o título da loja (`loja?.nome_fantasia`, ex.: `"mercadinho italia"`) aplicando `-mt-0.5 leading-none` para liberar espaço vertical imediato abaixo dele.
   - Aumentar a escala tipográfica do contador dinâmico (`"Restam X dias"`) de `text-[10px]` para `text-xs lg:text-[13px] font-extrabold text-amber-500 tracking-tight`.
   - Aumentar o botão `"ASSINAR"` de `text-[9px] px-2 py-0.5` para `text-[11px] lg:text-xs px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider shadow-sm`.
   - Aumentar a fonte do subtítulo da oferta (`"Garanta por apenas R$ 49,90/mês"`) de `text-[9px]` para `text-[11px] lg:text-xs font-semibold text-slate-600 dark:text-slate-300 mt-0.5`.

---

### ITEM 3: Tipografia, Alinhamento em Grade e Reformulação do "Mínimo por Produto" em Tipos de Venda (`ConfiguracoesLoja.tsx` / `pricingEngine.ts`)

#### 3.1. Diagnóstico Técnico e Regra de Negócio
- Na subtela `tipos-venda` de `src/components/ConfiguracoesLoja.tsx` (linhas `3244-3713`), os 3 cards (*1. Varejo*, *2. Atacado*, *3. Distribuidor*) utilizam `text-xs` nas descrições (linhas `3275`, `3311`, `3528`), e como os textos têm comprimentos diferentes e não possuem altura mínima padronizada (`min-h`), os blocos de `Desconto Padrão (%)`, `Opção 1`, `Opção 2` e `Opção 3` ficam desalinhados horizontalmente entre os cards de Atacado e Distribuidor.
- Na **Opção 3**, o rótulo usa o jargão técnico `"3. Por Mínimo por SKU (Atacarejo direto)"` / `"3. Por Mínimo por SKU (Lotes fechados)"` e exibe um input numérico global (`qtdMinimaSkuAtacado` / `qtdMinimaSkuAutoatacado`, ex.: `"6 un de cada produto"`).
- **Correção de Domínio:** No modelo de Atacarejo / Mínimo por Produto, cada produto possui sua própria quantidade mínima cadastrada individualmente na ficha do produto (`produto.qtd_minima_atacado` e `produto.qtd_minima_autoatacado` em `ProdutoCadastro.tsx`). Portanto, na tela de configurações da loja, a Opção 3 deve ser **exclusivamente um seletor/chave liga-desliga** (sem input numérico global de peças).

#### 3.2. Passo a Passo da Implementação
1. **Tipografia e Alinhamento Estrito em Grade (`src/components/ConfiguracoesLoja.tsx`):**
   - Aumentar a fonte das descrições dos 3 cards (Varejo, Atacado, Distribuidor) de `text-xs` para `text-sm leading-relaxed font-medium` e aplicar `min-h-[64px]` no parágrafo descritivo de cada card no desktop, garantindo que a linha divisória (`border-t`) comece exatamente na mesma coordenada Y nos cards.
   - Estruturar os sub-blocos internos dos cards de Atacado e Distribuidor com alturas simétricas (`min-h-[104px]` para Opção 1 e Opção 2, e `min-h-[88px]` para Opção 3), de modo que `Desconto Padrão (%)`, `Opção 1 (Por Valor Mínimo Total)`, `Opção 2 (Por Quantidade Global de Peças)` e `Opção 3 (Mínimo por Produto)` fiquem perfeitamente alinhados na horizontal.
2. **Reformulação da Opção 3 ("3. Mínimo por Produto"):**
   - Renomear no Card Atacado (Desktop e Mobile) para: **`3. Mínimo por Produto (Atacarejo direto)`**.
   - Renomear no Card Distribuidor (Desktop e Mobile) para: **`3. Mínimo por Produto (Lotes fechados)`**.
   - Substituir o input numérico global de peças por uma **chave seletora (toggle switch liga/desliga)** integrada ao card da Opção 3, acompanhada do texto explicativo:
     > *"Ativa o preço de atacado/distribuidor individualmente por produto quando o cliente atingir a quantidade mínima definida no cadastro daquele produto."*
   - Ao ativar a chave da Opção 3, selecionar `tipoMinimoAtacado = 'minimo_sku'` (ou `'minimo_produto'` mapeado para `'minimo_sku'` / `'quantidade'` no banco para retrocompatibilidade).
3. **Motor de Precificação (`src/services/pricingEngine.ts`):**
   - Atualizar `obterRegrasPrecificacao`, `calcularPrecoUnitarioPorTabela` e `avaliarNivelCarrinho`:
     - Incluir `tipoMinimoAtacado` e `tipoMinimoDistribuidor` em `RegrasPrecificacaoLoja`.
     - Quando a regra da loja for **Opção 3 (`minimo_sku` / Mínimo por Produto)**:
       - Cada item do carrinho é avaliado contra o seu próprio `item.produto.qtd_minima_atacado` (ou `item.produto.qtd_minima_autoatacado` para distribuidor).
       - Se `item.quantidade >= qtdMinimaDoProduto` (e `qtdMinimaDoProduto > 0`), aquele item recebe o preço de atacado/distribuidor individualmente (Atacarejo direto), mesmo que outros itens do carrinho estejam em quantidade unitária de varejo!
       - Caso o item ainda não tenha atingido `item.produto.qtd_minima_atacado`, `skusFracionados` aponta exatamente quantas unidades faltam daquele produto específico (`faltamUnidades = produto.qtd_minima_atacado - item.quantidade`).

---

### ITEM 4: Eliminação de Botão de Salvar Duplicado e Barra Inferior Inoperante (`ConfiguracoesLoja.tsx`)

#### 4.1. Diagnóstico
- Na subtela `tipos-venda` de `src/components/ConfiguracoesLoja.tsx`:
  - Existe a barra superior global de Configurações (linhas `1845-1865` no mobile e `3011-3041` no desktop) com a seta de voltar à esquerda e o botão `"Salvar"` no canto superior direito.
  - Porém, no final da subtela `tipos-venda` foram renderizados um segundo botão `"Salvar Tipos de Venda"` e um botão `"Voltar ao Menu"` tanto no mobile (linhas `2904-2931`) quanto no desktop (linhas `3732-3773`).
  - Além disso, o botão superior direito na subtela `tipos-venda` chama `handleSalvarTodasConfiguracoes` apenas se `isDirty` for verdadeiro (e `isDirty` não observa todos os estados de `tipos-venda` de forma unificada com `handleSalvarTiposVenda`).

#### 4.2. Passo a Passo da Implementação
1. **Unificar Ação Principal no Topo Direito (`src/components/ConfiguracoesLoja.tsx`):**
   - No cabeçalho superior (Mobile linhas `1845-1865` e Desktop linhas `3011-3041`), quando `subTela === 'tipos-venda'`, exibir o botão único **"Salvar"** no canto superior direito acionando diretamente `handleSalvarTiposVenda` (ou integrando `handleSalvarTiposVenda` dentro de `handleSalvarTodasConfiguracoes`), habilitado e responsivo com estado `salvandoTiposVenda`.
2. **Remover Integralmente a Barra Inferior Duplicada:**
   - Remover os blocos das linhas `2904-2931` (Mobile: botões `"Salvar Tipos de Venda"` e `"Voltar ao Menu"`) e `3732-3773` (Desktop: rodapé com `"Voltar ao Menu"` e `"Salvar Tipos de Venda"`).
   - Manter estritamente a seta de voltar no topo esquerdo e o único botão `"Salvar"` no canto superior direito.

---

### ITEM 5: Ocultação do Atacado e Prevenção de Descontos Indevidos no Catálogo Online (`CatalogoPublico.tsx` / `pricingEngine.ts` / `CartContext.tsx`)

#### 5.1. Diagnóstico da Causa Raiz
1. Em `src/components/CatalogoPublico.tsx` (linhas `2743-2748`), a flag `temRegraAtacado` é calculada assim:
   ```ts
   const temRegraAtacado = Boolean(
     (loja?.qtd_minima_padrao_atacado && Number(loja.qtd_minima_padrao_atacado) > 0) ||
     (loja?.valor_minimo_padrao_atacado && Number(loja.valor_minimo_padrao_atacado) > 0) ||
     avaliacaoCarrinho.proximoNivel ||
     avaliacaoCarrinho.tabelaAtiva !== 'varejo'
   );
   ```
   Como `loja.qtd_minima_padrao_atacado` e `loja.valor_minimo_padrao_atacado` continuam salvos nas colunas do banco mesmo quando o lojista desliga os switches de Atacado e Distribuidor (`tipos_venda.atacado = false` e `tipos_venda.distribuidor = false`), `temRegraAtacado` resulta em `true`!
2. Como `avaliacaoCarrinho.proximoNivel` é `null` (porque atacado e distribuidor estão desligados) e `tabelaAtiva` é `'varejo'`, o ternário nas linhas `2768-2798` cai no `else` final (linha `2793`), exibindo falsamente: **`"Preço de Atacado Liberado! 0%"`**!
3. Além disso, em `src/services/pricingEngine.ts` (linhas `21-48`), `obterRegrasPrecificacao(loja)` lê o `localStorage` (`hubi_regras_precificacao_${loja.id}`) sem verificar se `atacado` / `distribuidor` foram desativados, e em diversos pontos do `CatalogoPublico.tsx` (cards de vitrine e modal de detalhes), badges de atacado e preços riscados são exibidos sem checar se `permiteAtacado` ou `permiteDistribuidor` estão ativos.

#### 5.2. Passo a Passo da Implementação
1. **Blindar `src/services/pricingEngine.ts`:**
   - Criar helper exportado `obterTiposVendaAtivos(loja?: Loja | null): { varejo: boolean; atacado: boolean; distribuidor: boolean }` que lê `loja?.tipos_venda || loja?.configuracoes_extras?.tipos_venda_ativos`, garantindo que se `atacado === false`, todas as metas e descontos de atacado retornados por `obterRegrasPrecificacao` sejam zerados (`descontoAtacado: 0, valorMinimoAtacado: 0, qtdTotalMinimaAtacado: 0, qtdMinimaSkuAtacado: 0`), e o mesmo para `distribuidor === false`.
   - Em `calcularPrecoUnitarioPorTabela`, se a tabela solicitada for `'atacado'` ou `'autoatacado'`, garantir que na ausência de permissão ela retorne estritamente o preço de `'varejo'`.
2. **Blindar `src/components/CatalogoPublico.tsx`:**
   - Declarar de forma reativa no topo do componente:
     ```ts
     const tiposVendaAtivos = useMemo(() => obterTiposVendaAtivos(loja), [loja]);
     const permiteAtacado = Boolean(tiposVendaAtivos.atacado);
     const permiteDistribuidor = Boolean(tiposVendaAtivos.distribuidor);
     const permiteDescontoVolume = permiteAtacado || permiteDistribuidor;
     ```
   - Na barra de termômetro (linha `2743`):
     - `temRegraAtacado` deve exigir obrigatoriamente `permiteDescontoVolume && (...)`. Se `permiteAtacado === false && permiteDistribuidor === false`, a barra de termômetro de atacado é **100% ocultada**.
     - Corrigir também o ternário da linha `2788`: só exibir `"Preço de Atacado Liberado!"` quando `avaliacaoCarrinho.tabelaAtiva === 'atacado'`.
   - Nos cards de produtos da vitrine, modal de detalhes (`ModalDetalhesProdutoCatalogo.tsx`) e itens do carrinho:
     - Se `!permiteDescontoVolume`, jamais exibir preço riscado de atacado nem selos de atacado/distribuidor; exibir apenas o preço regular de varejo (ou promocional se `promocao_ativa === true`).
   - Escutar o evento `hubi_regras_precificacao_alteradas` e mudanças no objeto `loja` via Supabase Realtime para atualizar o carrinho público instantaneamente.

---

### ITEM 6: Acesso Direto a "Opções de Frete e Entrega" sem Modal/Tela Intermediária (`ConfiguracoesLoja.tsx`)

#### 6.1. Diagnóstico
- Em `src/components/ConfiguracoesLoja.tsx`:
  - Linha `1803`: o botão no menu de Configurações chama-se `{ id: 'entrega', label: 'Opções de Entrega', icon: Truck }`.
  - Ao clicar nele, define `setSubTela('entrega')`, que renderiza uma tela intermediária quase vazia (linhas `5025-5062` no desktop e `2948+` no mobile) contendo apenas um banner com o botão `"Configurar Frete Avançado"` que navega para `/configuracoes/frete` (`ShippingSettingsScreen.tsx`).

#### 6.2. Passo a Passo da Implementação
1. Em `src/components/ConfiguracoesLoja.tsx`:
   - Na linha `1803`, alterar o item do array `itensMenu` para:
     ```ts
     { id: 'entrega', label: 'Opções de Frete e Entrega', icon: Truck },
     ```
   - Nos handlers de clique dos cards de menu (Mobile linha `1877` e Desktop linha `3063`), adicionar o roteamento direto:
     ```ts
     } else if (item.id === 'entrega') {
       navigate('/configuracoes/frete');
     }
     ```
   - Caso a URL receba `?tab=entrega` ou `subTelaInicial === 'entrega'` (linha `340`), redirecionar imediatamente via `navigate('/configuracoes/frete', { replace: true })`.
   - Remover a subtela intermediária redundante `subTela === 'entrega'` (linhas `5023-5062`).

---

### ITEM 7: Correção Visual Completa do Dark Mode no Modal "Escolha Como Deseja Receber" (`CatalogoPublico.tsx` / `ShippingFulfillmentSelector.tsx`)

#### 7.1. Diagnóstico Visual
- No modal **"Escolha Como Deseja Receber"** (`CatalogoPublico.tsx` linha `3630` -> `ShippingFulfillmentSelector.tsx` com `modoCatalogo={true}` e `temaDark={isDark}`):
  - Nas linhas `2109-2145` de `ShippingFulfillmentSelector.tsx` (card `"Frete a combinar"` quando `!temUber && !temMelhorEnvio`) e na linha `2184` (spinner de cálculo), as classes de cor foram escritas fixas para o tema claro (`bg-emerald-50/80 text-slate-900`, `bg-slate-50 hover:bg-slate-100/70 text-slate-800`, `text-slate-600`), ignorando a variável `ehDark`!
  - Além disso, em diversos cards de endereço, retirada e opções manuais/cotadas no modo escuro, há mistura de fundos claros ou contrastes baixos que prejudicam a leitura de textos e badges.

#### 7.2. Passo a Passo da Implementação
1. **Padronização Dark Mode HUBI em `src/components/shipping/ShippingFulfillmentSelector.tsx`:**
   - Auditar e substituir todos os cards de seleção (Retirada na Loja, Entrega Própria da Loja, Cotações Uber/Melhor Envio e Frete a Combinar) para respeitar estritamente `ehDark`:
     - **Card Selecionado no Dark Mode:** `bg-slate-800/80 border-2 border-emerald-500 text-white shadow-md shadow-emerald-950/30`
     - **Card Não Selecionado no Dark Mode:** `bg-slate-900/70 hover:bg-slate-800/60 border border-slate-800 text-slate-200`
     - **Tipografia Principal no Dark Mode:** `text-white font-bold`
     - **Subtítulos / Descrições / Prazos no Dark Mode:** `text-slate-300`
     - **Badges no Dark Mode:** `bg-emerald-500/20 text-emerald-300 border border-emerald-500/40`
   - Corrigir especificamente os blocos das linhas `2109-2145` e `2184` que estavam sem condicional `ehDark`.
2. **Verificação em `src/components/CatalogoPublico.tsx` (linhas `3642-3769`):**
   - Garantir que o wrapper do modal passe `temaDark={isDark}` sincronizado com o estado real de tema do Catálogo Público e que o cabeçalho/rodapé do modal utilizem `bg-slate-900 border-slate-800 text-white` no dark mode.

---

### ITEM 8: Seção Formal de "Frete Próprio da Loja" em Configurações e no Catálogo Online (`ShippingSettingsScreen.tsx` / `ShippingFulfillmentSelector.tsx`)

#### 8.1. Diagnóstico
- Embora `src/types/shipping.ts` (linhas `79-81`) e `src/services/shippingOrchestrator.ts` (linhas `483-505`) já possuam suporte parcial para `frete_proprio_ativo`, `frete_proprio_tipo_cobranca` e `frete_proprio_valor_padrao`, **não existe seção visual em `ShippingSettingsScreen.tsx`** para o lojista ativar e configurar o **Frete Próprio (Entrega da Loja)** (Grátis, Taxa Fixa ou por Bairro + Prazo Estimado).
- Adicionalmente, em `ShippingFulfillmentSelector.tsx` (linha `655`), o `runtimeConfig` forçava `frete_proprio_ativo: false` e na linha `611` abortava a cotação caso `!temUber && !temMelhorEnvio`, impedindo que a opção formal **"Entrega Própria da Loja"** aparecesse automaticamente para o cliente no Catálogo Online!

#### 8.2. Modelagem Relacional no Supabase (Migration DDL)
No arquivo `supabase/migrations/20261023220000_suporte_produtos_pesaveis_e_frete_proprio.sql`:
```sql
ALTER TABLE public.loja_shipping_configs
  ADD COLUMN IF NOT EXISTS frete_proprio_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS frete_proprio_nome VARCHAR(100) NOT NULL DEFAULT 'Entrega Própria da Loja',
  ADD COLUMN IF NOT EXISTS frete_proprio_tipo_cobranca VARCHAR(20) NOT NULL DEFAULT 'fixo', -- 'gratis' | 'fixo' | 'bairro'
  ADD COLUMN IF NOT EXISTS frete_proprio_valor_padrao NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS frete_proprio_prazo_estimado VARCHAR(80) NOT NULL DEFAULT 'Entrega hoje (30 a 60 min)';
```
- Para cobrança **Por Bairro (`'bairro'`)**, utilizar a tabela relacional existente `public.formas_entrega` (`tipo = 'bairro'`, `nome = Nome do Bairro`, `valor_taxa = NUMERIC(10,2)`, `tempo_estimado = VARCHAR`, `ativo = BOOLEAN`), mantendo 100% de conformidade com `anti-jsonb-linter` e `supabase-rls-guard`.

#### 8.3. Passo a Passo da Implementação
1. **Tela `src/components/shipping/ShippingSettingsScreen.tsx`:**
   - Adicionar o bloco dedicado **"Frete Próprio (Entrega da Loja / Motoboy Local)"** com:
     - Switch principal de ativação (`freteProprioAtivo`).
     - Seletor de Modo de Cobrança:
       1. **Grátis (`R$ 0,00`)**
       2. **Taxa Fixa Única (`R$ X,XX`)** -> Input de valor padrão (`freteProprioValorPadrao`).
       3. **Taxa por Bairro / Região** -> Gerenciador relacional inline (conectado a `public.formas_entrega` da loja) permitindo adicionar/editar/excluir bairros ou modalidades locais (ex.: *"Frete Italia - Centro: R$ 5,00"*).
     - Input de **Prazo Estimado de Entrega** (ex.: `"30 a 60 minutos"` ou `"Entrega no mesmo dia"`).
2. **Orquestrador e Seletor no Catálogo (`src/services/shippingOrchestrator.ts` e `src/components/shipping/ShippingFulfillmentSelector.tsx`):**
   - Em `ShippingOrchestrator.buscarConfigLoja` e `salvarConfigLoja`, hidratar e persistir os campos `frete_proprio_*`.
   - Em `ShippingFulfillmentSelector.tsx`:
     - Remover o bloqueio `frete_proprio_ativo: false` na linha `655` e permitir que `executarCotacao` rode quando `temFreteProprio || temFormasEntregaEnvio` estiver ativo.
     - No Catálogo Online (`ehCatalogo === true`), exibir os cards formais de **"Entrega Própria da Loja"** (e/ou taxas cadastradas da loja compatíveis com o bairro do cliente) com valor exato (`Grátis` ou `R$ X,XX`) e prazo estimado (`30 a 60 min`).
     - Manter o card **"Frete a combinar"** estritamente como *fallback* quando nenhum método (Uber, Melhor Envio ou Frete Próprio) estiver ativo ou retornar cobertura para o endereço.

---

### ITEM 9: Unificação Arquitetural da Gestão de Frete/Envio (`ShippingSettingsScreen.tsx` vs `CadastrosAuxiliares.tsx`)

#### 9.1. Diagnóstico de Concorrência Arquitetural
- Atualmente existem dois lugares concorrentes gerenciando logística:
  1. `Cadastros & Tabelas` (`src/components/CadastrosAuxiliares.tsx`): possui 3 cards de logística (`Formas de Envio`, `Apps de Corrida`, `Transportadoras`), onde o usuário cadastrou o *"Frete Italia"* na tabela `public.formas_entrega`.
  2. `Configurações > Frete` (`src/components/shipping/ShippingSettingsScreen.tsx`): já gerencia `Apps de Corrida` (Bloco 6), `Transportadoras` (Bloco 7), `Uber Direct`, `Melhor Envio`, `Retirada na Loja` e `Frete Grátis`, mas na linha `1259` tinha um botão apontando para uma rota inexistente (`/cadastros?tab=formas_envio`).

#### 9.2. Passo a Passo da Implementação
1. **Centralização Completa em `src/components/shipping/ShippingSettingsScreen.tsx` (`Configurações > Opções de Frete e Entrega`):**
   - Incorporar a listagem e o CRUD completo da tabela `public.formas_entrega` (incluindo o *"Frete Italia"* já cadastrado pelo lojista) diretamente dentro da seção **"Frete Próprio & Modalidades de Entrega da Loja"** em `ShippingSettingsScreen.tsx`.
   - Remover o link quebrado `/cadastros?tab=formas_envio` da linha `1259`.
2. **Desambiguação em `src/components/CadastrosAuxiliares.tsx`:**
   - Remover a duplicidade de modais logísticos em `Cadastros & Tabelas` (`formas_envio`, `apps_corrida`, `transportadoras`), mantendo em `Cadastros & Tabelas` apenas os cadastros base de catálogo/financeiro (*Categorias*, *Unidades de Medida*, *Fornecedores*, *Formas de Pagamento*) **ou** fazer com que o card unificado de *"Frete e Formas de Envio"* em `CadastrosAuxiliares.tsx` redirecione diretamente (`navigate('/configuracoes/frete')`) para a tela oficial centralizada.
   - Caso `CadastrosAuxiliares.tsx` seja acessado via query param legado `?tab=formas_envio`, redirecionar automaticamente para `/configuracoes/frete`.

---

## 🔄 3. Ordem Lógica de Execução (Fases de Implementação)

Para garantir zero regressão e integridade de compilação TypeScript em todas as etapas, a execução seguirá 4 fases sequenciais:

### Fase 1: Fundação de Banco de Dados, Contratos TypeScript e Schemas Zod
1. Criar a migration `supabase/migrations/20261023220000_suporte_produtos_pesaveis_e_frete_proprio.sql` (colunas de produtos pesáveis, precisão `NUMERIC(12,3)` e colunas de Frete Próprio em `loja_shipping_configs` com RLS).
2. Atualizar `src/types.ts`, `src/types/shipping.ts` e `src/types/domain-contracts.ts`.
3. Criar `src/lib/validations/pesagemSchema.ts` e atualizar `src/lib/validations/checkoutSchema.ts` e `src/lib/validations/index.ts`.
4. Adicionar os formatadores de peso/unidade e parser de etiqueta de balança EAN-13 em `src/utils/formatters.ts`.

### Fase 2: Header Lateral, Tipos de Venda e Motor de Precificação (Itens 2, 3, 4 e 5)
1. **Item 2:** Ajustar layout e escala tipográfica do bloco de Trial/Degustação em `src/components/layout/AppLayout.tsx`.
2. **Itens 3 e 4:** Refatorar a subtela `tipos-venda` em `src/components/ConfiguracoesLoja.tsx` (alinhamento horizontal em grade, aumento de fonte das descrições, substituição de "SKU" por "Produto" com switch liga/desliga sem input numérico global, e remoção dos botões inferiores duplicados).
3. **Itens 3 e 5:** Atualizar `src/services/pricingEngine.ts` e `src/components/CatalogoPublico.tsx` para suportar mínimo individual por produto e ocultar compulsoriamente o termômetro e descontos de atacado quando `atacado === false` e `distribuidor === false`.

### Fase 3: Unificação Logística, Frete Próprio e Dark Mode do Modal de Entrega (Itens 6, 7, 8 e 9)
1. **Item 6:** Atualizar `src/components/ConfiguracoesLoja.tsx` para renomear o botão para `"Opções de Frete e Entrega"`, navegar direto para `/configuracoes/frete` e extinguir a subtela intermediária.
2. **Itens 8 e 9:** Expandir `src/services/shippingOrchestrator.ts` e `src/components/shipping/ShippingSettingsScreen.tsx` com a seção completa de **Frete Próprio (Entrega da Loja)** e gerenciamento integrado de `public.formas_entrega` (incluindo registros como *"Frete Italia"*), redirecionando os atalhos de `src/components/CadastrosAuxiliares.tsx`.
3. **Itens 7 e 8:** Corrigir todas as classes de Dark Mode (`bg-slate-800/80`, `border-emerald-500`, `text-white`, `text-slate-300`) e exibir formalmente a "Entrega Própria da Loja" em `src/components/shipping/ShippingFulfillmentSelector.tsx` e `src/components/CatalogoPublico.tsx`.

### Fase 4: Produtos Pesáveis / Fracionados no PDV, Catálogo, Recibos e Caderneta (Item 1)
1. Criar `src/components/ui/ModalInputPesoFracionado.tsx`.
2. Atualizar `src/components/ProdutoCadastro.tsx` e `src/components/ProdutosMobile.tsx` para expor claramente a configuração de venda por peso / fracionada e código de balança.
3. Integrar o modal de peso (3 casas decimais), leitor de etiqueta de balança EAN-13 e formatação `1,250 kg x R$ 6,40/kg = R$ 8,00` em `src/contexts/CartContext.tsx`, `src/components/PosCheckout.tsx`, `src/components/PosCheckoutMobile.tsx` e `src/components/CatalogoPublico.tsx`.
4. Atualizar recibos (`printService.ts`, `receiptPdfService.ts`, `ReciboPublico.tsx`, `ReciboPedidoModal.tsx`, `ModalItensPedido.tsx`) e implementar o fluxo de **Ajuste de Balança na Separação com Débito/Crédito na Caderneta e Notificação ao Cliente** em `src/services/cadernetaService.ts` e `src/components/PedidosLista.tsx`.
5. Executar validação estática (`tsc --noEmit` e `vite build`) garantindo build limpo e tipagem 100% íntegra.
