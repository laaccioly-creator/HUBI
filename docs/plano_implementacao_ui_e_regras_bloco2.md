# 📋 Plano de Implementação: Interface, Usabilidade e Regras de Negócio (Bloco 2)

> **Status:** Aguardando Revisão e Aprovação  
> **Escopo:** 12 apontamentos de UI/UX, Catálogo Online, Assistente Rubi IA, Logística/Melhor Envio, Precificação e PDV  
> **Impacto em Banco de Dados (DDL/Migrations):** **Nenhum** (todas as colunas necessárias — como regras de precificação em `public.lojas` e metadados de transporte em `public.pedidos` / `public.pedido_entregas` — já existem no schema atual do Supabase).

---

## 1. Contraste do Botão do Carrinho no Tema Escuro (Catálogo Online)

### 1.1. Arquivos Alvo
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx#L1004-L1005) (definição de `corTema` e renderização do botão do carrinho no cabeçalho entre as linhas `1875–1899`).

### 1.2. Causa Raiz Técnica
- Na linha `1004` de [`CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx#L1004), a constante `corTema` é definida como:
  ```ts
  const corTema = isDark ? '#FFFFFF' : '#000000';
  ```
- Nas linhas `1878–1898`, o botão do Carrinho aplica `className="... text-white ..."` combinado com `style={{ backgroundColor: corTema }}`, e o badge de quantidade usa `bg-white text-slate-950`.
- Quando o tema escuro está ativo (`isDark === true`), `corTema` assume `#FFFFFF` (branco puro). Como o texto e o ícone estão fixos em `text-white` e o badge também é `bg-white`, o botão inteiro renderiza como um retângulo branco sólido com texto branco invisível.

### 1.3. Plano de Alteração Passo a Passo
1. Remover o atributo inline `style={{ backgroundColor: corTema }}` do botão do Carrinho no header de [`CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx#L1878-L1898).
2. Aplicar classes condicionais alinhadas ao Design System e ao menu superior desktop (`AppLayout.tsx`):
   - **Tema Escuro (`isDark`):** `bg-slate-800/90 hover:bg-slate-700/90 text-white border-2 border-emerald-400 shadow-xs` (com destaque esmeralda caso `quantidadeTotalCarrinho > 0` ou `border-slate-400` quando vazio).
   - **Tema Claro (`!isDark`):** `bg-slate-900 hover:bg-slate-800 text-white border border-slate-900 shadow-xs` (ou `bg-emerald-600 hover:bg-emerald-500 text-white` quando houver itens).
3. Estilizar o badge contador (`quantidadeTotalCarrinho`) com alto contraste em ambos os temas: `bg-emerald-500 text-slate-950 font-black` no tema escuro e `bg-white text-slate-950 font-black` no tema claro.

### 1.4. Cenários de Teste e Validação
- **Cenário 1 (Tema Escuro - Carrinho Vazio e com Itens):** Ativar o tema escuro no catálogo online e verificar que o botão "Carrinho", seu ícone `ShoppingCart` e o badge numérico apresentam leitura nítida sob fundo escuro com borda destacada.
- **Cenário 2 (Tema Claro - Carrinho Vazio e com Itens):** Alternar para o tema claro e confirmar que o botão mantém contraste elevado e legibilidade imediata.

---

## 2. Otimização e Despoluição do Rodapé da IA (Rubi no Catálogo Online)

### 2.1. Arquivos Alvo
- [`src/components/ChatRubiCatalogo.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ChatRubiCatalogo.tsx#L860-L1048) (botões flutuantes na tela principal e barra de controles interna do modal/drawer da Rubi IA).

### 2.2. Causa Raiz Técnica
- Entre as linhas `862–916` de [`ChatRubiCatalogo.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ChatRubiCatalogo.tsx#L862-L916), quando o chat está fechado (`!aberto`), o componente renderiza uma fileira horizontal fixa (`fixed bottom-20 sm:bottom-6 left-4 z-40 flex items-center gap-2`) contendo **3 botões separados**:
  1. Pílula principal *"Fale com a Rubi ✨"* (`linhas 863–879`, cujo texto fica oculto no mobile por `hidden sm:inline`);
  2. Botão secundário *"Chamar 'Rubi'"* / *"Rubi ouvindo..."* (`linhas 882–900`);
  3. Botão circular avulso de microfone `<Mic />` (`linhas 903–915`).
- Essa tripla renderização ocupa grande largura horizontal no canto inferior esquerdo, sobrepõe os cards e preços dos produtos ao rolar a vitrine e expõe a função de escuta contínua (*wake word*) fora de contexto.

### 2.3. Plano de Alteração Passo a Passo
1. Na renderização fechada (`!aberto`, linhas `862–916` de [`ChatRubiCatalogo.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ChatRubiCatalogo.tsx#L862-L916)):
   - Remover completamente da tela principal os 2 botões extras soltos (o botão *"Chamar 'Rubi'"* e o botão circular `<Mic />`).
   - Manter exclusivamente a pílula principal **"Fale com a Rubi ✨"**, exibindo seu rótulo de forma compacta e legível tanto em mobile quanto em desktop, com um indicador sutil caso o modo de escuta contínua esteja ativo.
2. Dentro do modal/drawer da Rubi (`aberto === true`, logo abaixo do cabeçalho entre as linhas `958–1046`):
   - Consolidar o controle de voz contínua em uma barra/toggle intuitiva e autoexplicativa: **"Modo Sempre Alerta (Voz Contínua)"** acompanhada da descrição curta *"Ative para conversar por voz ou chamar 'Rubi' a qualquer momento"*.
   - Manter o botão de microfone pontual (`toggleGravacao`) integrado exclusivamente na barra inferior de digitação do chat (`linhas 1258–1268`).

### 2.4. Cenários de Teste e Validação
- **Cenário 1 (Despoluição na Vitrine Mobile e Desktop):** Rolar o catálogo online até o final em telas mobile (retrato/paisagem) e desktop, verificando que apenas a pílula compacta *"Fale com a Rubi"* é exibida sem cobrir preços ou botões dos cards.
- **Cenário 2 (Ativação Interna do Modo Sempre Alerta):** Abrir o modal da Rubi, ativar a chave *"Modo Sempre Alerta (Voz Contínua)"* dentro do drawer e testar a captura de voz normalmente.

---

## 3. Padronização Visual do Modal da IA (Rubi) no Tema Claro

### 3.1. Arquivos Alvo
- [`src/components/ChatRubiCatalogo.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ChatRubiCatalogo.tsx#L53-L66) (helper `formatarNegrito` e estrutura completa do modal nas linhas `919–1281`).

### 3.2. Causa Raiz Técnica
- O componente [`ChatRubiCatalogo.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ChatRubiCatalogo.tsx#L919-L1281) não consome o hook `useTheme()` e possui classes escuras hardcoded em toda a sua árvore JSX:
  - Container principal: `bg-slate-900 border-slate-700` (`linha 922`);
  - Cabeçalho: `bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950/60 border-slate-700/80` (`linha 929`);
  - Área de mensagens: `bg-slate-900/95` (`linha 1049`);
  - Balão da assistente: `bg-slate-800 text-slate-200 border-slate-700/80` (`linha 1072`) e negrito fixo em `text-slate-100` (`linha 59`);
  - Botão *"Ouvir resposta"*: `bg-slate-950/70 text-emerald-400 border-emerald-500/30` (`linha 1087`);
  - Faixa de chips *"Dúvidas frequentes"*: `bg-slate-950/80` com pílulas `bg-slate-800/90 text-slate-300 border-slate-700` (`linhas 1207–1214`);
  - Rodapé de input: `bg-slate-950 border-slate-800` com input `bg-slate-900 border-slate-700/80 text-slate-100` (`linhas 1254–1276`).
- Quando o catálogo está no Tema Claro, o modal exibe blocos chumbo/pretos misturados com textos opacos de baixo contraste.

### 3.3. Plano de Alteração Passo a Passo
1. Importar `useTheme` (`import { useTheme } from '../contexts/ThemeContext'`) em [`ChatRubiCatalogo.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ChatRubiCatalogo.tsx) e extrair `const { isDark } = useTheme()`.
2. Parametrizar a estilização de todo o modal para o **Tema Claro (`!isDark`)** preservando o visual atual no **Tema Escuro (`isDark`)**:
   - **Container e Corpo do Chat:** Fundo branco contínuo (`bg-white border-slate-200 text-slate-900`), área de mensagens `bg-slate-50/70`.
   - **Cabeçalho:** Superfície clara institucional (`bg-white border-b border-slate-200`), título *"Rubi • Assistente Virtual"* em `#111827` (`text-slate-900 font-black`), subtítulo *"Online agora"* em `text-emerald-700 font-semibold`, e botões de ação (`Volume2`, `Trash2`, `X`) com ícones em cinza-escuro de alto contraste (`text-slate-700 hover:text-slate-950 hover:bg-slate-100`).
   - **Balões de Mensagem e `formatarNegrito`:**
     - Balão da Rubi no tema claro: `bg-white text-slate-800 border border-slate-200 shadow-2xs`.
     - Helper `formatarNegrito`: usar `font-bold text-inherit` (ou `text-slate-950 dark:text-slate-100`) para não renderizar texto branco invisível sobre balão claro.
   - **Botão de Áudio (*"Ouvir resposta"*):** No tema claro, estilizar como pílula limpa (`bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold shadow-2xs`).
   - **Mini-cards de Produtos Recomendados:** No tema claro, `bg-white border-slate-200 shadow-xs text-slate-900`, título do produto `text-slate-900` e botão *"Adicionar"* em `bg-emerald-600 hover:bg-emerald-500 text-white`.
   - **Seção *"Dúvidas frequentes"* (Chips):** Container `bg-slate-50 border-t border-slate-200`, label em `text-slate-600 font-bold`, e cada chip com fundo `#F3F4F6` (`bg-slate-100`), borda `#D1D5DB` (`border-slate-300`), texto `#1F2937` (`text-slate-800 font-semibold`) e hover esmeralda (`hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300`).
   - **Rodapé e Input de Mensagem:** Container `bg-white border-t border-slate-200`, input com fundo claro (`bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500`), botão de microfone `bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200` e botão de enviar `bg-emerald-600 hover:bg-emerald-500 text-white`.

### 3.4. Cenários de Teste e Validação
- **Cenário 1 (Inspeção Completa no Tema Claro):** Com o catálogo em tema claro, abrir o chat da Rubi e validar o contraste do cabeçalho, mensagens em negrito, botão *"Ouvir resposta"*, cards de produtos sugeridos, chips de *"Dúvidas frequentes"* e barra de digitação.
- **Cenário 2 (Regressão no Tema Escuro):** Alternar para o tema escuro e verificar que o modal mantém sua paleta Dark Slate original intacta.

---

## 4. Contraste do Subtítulo da Loja no Tema Escuro (Catálogo Online)

### 4.1. Arquivos Alvo
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx#L1770-L1785) (bloco de título `h1` e subtítulo `<p>` no cabeçalho da loja).

### 4.2. Causa Raiz Técnica
- Nas linhas `1771` e `1779–1781` de [`CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx#L1771-L1781):
  ```tsx
  <h1 className="text-lg sm:text-xl font-black text-slate-100 tracking-tight truncate">
  ...
  <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
    <span>Catálogo Oficial</span>
    <span>•</span>
    <strong className="text-slate-200">{produtos.length} produtos disponíveis</strong>
  </p>
  ```
- No tema escuro (`bg-slate-900/95`), `text-slate-400` fica apagado e sem destaque suficiente; além disso, no tema claro, `text-slate-100` e `text-slate-200` perdem contraste caso não sejam condicionados a `isDark`.

### 4.3. Plano de Alteração Passo a Passo
1. Atualizar o `h1` (`linha 1771`) para usar cor condicional de máximo contraste:
   - `isDark ? 'text-white' : 'text-slate-900'`
2. Atualizar o parágrafo de subtítulo (`linhas 1779–1781`) para aplicar **branco puro (`#FFFFFF` / `text-white`)** no tema escuro e cinza-escuro nítido no tema claro:
   - `<p className={\`text-xs flex items-center gap-1.5 mt-0.5 font-medium \${isDark ? 'text-white' : 'text-slate-700'}\`}>`
   - `<strong className={\`font-extrabold \${isDark ? 'text-white' : 'text-slate-950'}\`}>{produtos.length} produtos disponíveis</strong>`

### 4.4. Cenários de Teste e Validação
- **Cenário 1 (Tema Escuro):** Verificar no cabeçalho do catálogo que o texto *"Catálogo Oficial • X produtos disponíveis"* é exibido em branco puro (`#FFFFFF`) com leitura imediata.
- **Cenário 2 (Tema Claro):**Alternar para o tema claro e confirmar que o título e o subtítulo permanecem em tom escuro nítido (`text-slate-900` / `text-slate-700`).

---

## 5. Padronização dos Botões Superiores e Barra de Busca no Catálogo com Base no Menu Desktop

### 5.1. Arquivos Alvo
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx#L1788-L2085) (barra de ações superior nas linhas `1788–1975` e barra de busca/filtros/visualização nas linhas `2013–2085`).
- Referência de padrão visual: [`src/components/layout/AppLayout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/layout/AppLayout.tsx#L515-L528).

### 5.2. Causa Raiz Técnica
- No menu superior desktop do sistema ([`AppLayout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/layout/AppLayout.tsx#L518-L526)), os botões seguem uma especificação rigorosa de alto contraste:
  - **Tema Escuro (Inativo):** `bg-slate-800/80 text-slate-100 hover:bg-slate-700/80 hover:text-white border-2 border-slate-400 shadow-xs`
  - **Tema Escuro (Ativo):** `bg-slate-800/90 hover:bg-slate-800 text-white font-bold border-2 border-emerald-400 shadow-xs`
  - **Tema Claro (Inativo):** `bg-slate-100 hover:bg-slate-200 border border-slate-300/80 text-slate-900 font-semibold shadow-xs`
  - **Tema Claro (Ativo):** `bg-slate-100 hover:bg-slate-200/90 border border-emerald-500/50 ring-1 ring-emerald-500/30 shadow-inner text-slate-950 font-bold`
- Já em [`CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx#L1788-L2085), os botões superiores (*Vitrine*, *Pedidos*, *Favoritos*, *Sino de Notificações*, *Sol/Lua*, *Carrinho*, *Entrar/Perfil*) e a barra inferior de controles (*Input de Busca*, *Select de Categorias*, *Toggle Grade/Lista*) utilizam classes fixas `bg-slate-800/80 text-slate-300 border-slate-700/80`, ficando escuros no tema claro e sem as bordas de alto contraste (`border-2 border-slate-400` / `border-emerald-400`) no tema escuro.

### 5.3. Plano de Alteração Passo a Passo
1. Criar em [`CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx) helpers de classe baseados exatamente nos tokens de [`AppLayout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/layout/AppLayout.tsx#L518-L526):
   - `getCatalogHeaderBtnClass(ativo?: boolean)`:
     - Se `isDark`: `ativo ? 'bg-slate-800/90 hover:bg-slate-800 text-white font-bold border-2 border-emerald-400 shadow-xs' : 'bg-slate-800/80 text-slate-100 hover:bg-slate-700/80 hover:text-white font-semibold border-2 border-slate-400 shadow-xs'`
     - Se `!isDark`: `ativo ? 'bg-slate-100 hover:bg-slate-200/90 border border-emerald-500/50 ring-1 ring-emerald-500/30 shadow-inner text-slate-950 font-bold' : 'bg-slate-100 hover:bg-slate-200 border border-slate-300/80 text-slate-900 font-semibold shadow-xs'`
2. Aplicar `getCatalogHeaderBtnClass` em todos os botões de ação do cabeçalho (`linhas 1788–1972`):
   - Botão **Vitrine** (ativo quando os modais secundários estão fechados);
   - Botão **Pedidos** (`ativo={modalPedidosAberto}`);
   - Botão **Favoritos** (`ativo={modalFavoritosAberto}`);
   - Botão **Notificações / Sino** (`ativo={modalNotificacoesAberto}`);
   - Botão **Alternador de Tema (Sol / Lua)**;
   - Botão **Carrinho** (`ativo={modalCarrinhoAberto || quantidadeTotalCarrinho > 0}`);
   - Botão **Entrar / Minha Conta** (`ativo={menuUsuarioAberto || modalOnboardingAberto}`).
3. Padronizar a linha de filtros e busca (`linhas 2013–2084`) com a mesma linguagem visual:
   - **Barra de Pesquisa (`input`):**
     - `isDark`: `bg-slate-800/80 text-white placeholder:text-slate-300 border-2 border-slate-400 focus:border-emerald-400 shadow-xs` (ícone `Search` em `text-slate-200`).
     - `!isDark`: `bg-slate-100 text-slate-900 placeholder:text-slate-500 border border-slate-300/80 focus:bg-white focus:border-emerald-500 shadow-xs` (ícone `Search` em `text-slate-600`).
   - **Seletor de Categorias (`select`):** Mesmos tokens de fundo, texto e borda do input de busca.
   - **Alternador de Visualização (Grade / Lista):** Container e botões internos utilizando os tokens ativo/inativo de `getCatalogHeaderBtnClass`.

### 5.4. Cenários de Teste e Validação
- **Cenário 1 (Comparação Lado a Lado no Tema Escuro):** Comparar os botões do topo do catálogo e a barra de pesquisa com o menu superior do ERP no tema escuro, validando bordas `border-2 border-slate-400` (inativo) e `border-emerald-400` (ativo) e textos 100% legíveis.
- **Cenário 2 (Comparação Lado a Lado no Tema Claro):** Alternar para o tema claro e verificar que todos os botões do topo, barra de pesquisa, seletor de categorias e toggle grade/lista assumem superfícies claras (`bg-slate-100`), bordas definidas (`border-slate-300/80`) e textos escuros (`text-slate-900`).

---

## 6. Unificação de "Regras de Precificação" dentro de "Tipos de Venda"

### 6.1. Arquivos Alvo
- [`src/components/ConfiguracoesLoja.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ConfiguracoesLoja.tsx#L190-L235) (estados, hidratação, `handleSalvarTiposVenda` nas linhas `1124–1170`, view mobile nas linhas `2200–2319` e view desktop nas linhas `2595–2829`).
- [`src/components/CadastrosAuxiliares.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CadastrosAuxiliares.tsx#L1543-L1550) (remoção do atalho duplicado *"Regras de Precificação"* do menu de Cadastros Auxiliares).

### 6.2. Causa Raiz Técnica
- Atualmente, a experiência do lojista está fragmentada em dois módulos distintos:
  1. Em **Configurações $\rightarrow$ Tipos de Venda** ([`ConfiguracoesLoja.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ConfiguracoesLoja.tsx#L2595-L2829)), o lojista apenas marca/desmarca os checkboxes de **Varejo**, **Atacado** e **Distribuidor**.
  2. Em **Cadastros $\rightarrow$ Regras de Precificação** ([`CadastrosAuxiliares.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CadastrosAuxiliares.tsx#L2380-L2757)), ficam os parâmetros de desconto padrão (`desconto_padrao_atacado_percentual`, `desconto_padrao_autoatacado_percentual`) e critérios de pedido mínimo no carrinho (`tipo_minimo_padrao_atacado`, `valor_minimo_padrao_atacado`, `qtd_minima_padrao_atacado`, `qtd_minima_sku_padrao_atacado` e equivalentes de Distribuidor).

### 6.3. Plano de Alteração Passo a Passo
1. Em [`ConfiguracoesLoja.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ConfiguracoesLoja.tsx):
   - Adicionar os estados de regras de precificação sincronizados com `loja` (e fallback em `localStorage.getItem(\`hubi_regras_precificacao_\${loja.id}\`)`):
     - **Atacado:** `descontoAtacado` (`%`), `tipoMinimoAtacado` (`'valor' | 'quantidade'`), `valorMinimoAtacado` (`R$`), `qtdMinimaAtacado` (`un.`), `qtdMinimaSkuAtacado` (`un.`).
     - **Distribuidor (Autoatacado):** `descontoDistribuidor` (`%`), `tipoMinimoDistribuidor` (`'valor' | 'quantidade'`), `valorMinimoDistribuidor` (`R$`), `qtdMinimaDistribuidor` (`un.`), `qtdMinimaSkuDistribuidor` (`un.`).
2. Nos cards de **Atacado** e **Distribuidor** dentro de `subTela === 'tipos-venda'` (tanto na seção Mobile `linhas 2248–2305` quanto na seção Desktop `linhas 2685–2810`):
   - Quando a modalidade estiver ativa (`tipoVendaAtacado === true` ou `tipoVendaDistribuidor === true`), exibir dentro do próprio card um painel expansível/integrado contendo:
     1. **Desconto Padrão da Modalidade (%):** Input numérico para cálculo automático sobre o preço de varejo;
     2. **Critério de Ativação no Carrinho:** Seletor entre *Por Valor Mínimo (R$)* e *Por Quantidade de Peças*;
     3. **Parâmetros de Mínimo:** Input de *Valor Mínimo do Pedido (R$)* (quando critério = `'valor'`) ou *Quantidade Mínima no Carrinho (Peças)* + *Mínimo por Produto/SKU (Unid.)* (quando critério = `'quantidade'`).
3. Atualizar `handleSalvarTiposVenda` (`linhas 1124–1170` de [`ConfiguracoesLoja.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ConfiguracoesLoja.tsx#L1124-L1170)):
   - Persistir em uma única operação `.update(...).eq('id', loja.id)` na tabela `public.lojas` tanto os tipos ativos (`tipos_venda` e `configuracoes_extras.tipos_venda_ativos`) quanto todas as colunas de precificação (`desconto_padrao_atacado_percentual`, `desconto_padrao_autoatacado_percentual`, `tipo_minimo_padrao_atacado`, `valor_minimo_padrao_atacado`, `qtd_minima_padrao_atacado`, `qtd_minima_sku_padrao_atacado`, `tipo_minimo_padrao_autoatacado`, `valor_minimo_padrao_autoatacado`, `qtd_minima_padrao_autoatacado`, `qtd_minima_sku_padrao_autoatacado`), além de atualizar o cache local `hubi_regras_precificacao_${loja.id}` e `atualizarDadosLoja()`.
4. Em [`CadastrosAuxiliares.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CadastrosAuxiliares.tsx#L1543-L1550):
   - Remover o item `{ id: 'precificacao', label: 'Regras de Precificação', ... }` do array `itensMenuCadastros`, centralizando toda a configuração em **Configurações $\rightarrow$ Tipos de Venda**.

### 6.4. Cenários de Teste e Validação
- **Cenário 1 (Configuração Unificada):** Acessar *Configurações $\rightarrow$ Tipos de Venda*, ativar *Atacado* e *Distribuidor*, preencher descontos e mínimos diretamente nos respectivos cards e clicar em *Salvar Configurações*.
- **Cenário 2 (Reflexo no Cadastro de Produto e Catálogo):** Abrir o cadastro de um produto e o catálogo online para confirmar que os percentuais e regras de pedido mínimo salvos em *Tipos de Venda* são aplicados imediatamente.
- **Cenário 3 (Menu de Cadastros Limpo):** Acessar a tela de *Cadastros* e verificar que o card avulso *"Regras de Precificação"* não é mais exibido.

---

## 7. Divergência de Modalidade no Upgrade de Frete Grátis (PAC $\rightarrow$ SEDEX)

### 7.1. Arquivos Alvo
- [`src/components/shipping/ShippingFulfillmentSelector.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/shipping/ShippingFulfillmentSelector.tsx#L774-L804) (montagem de `pedido_entrega` em `emitirSelecao`).
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx#L1040-L1045) (cálculo de `valorFreteEfetivo` na linha `1042`, gravação de `payloadPedido` e `entregaPayload` nas linhas `1333–1405`, e confirmação do modal nas linhas `3255–3316`).
- [`src/services/melhorEnvioService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/melhorEnvioService.ts#L502-L525) (resolução de `serviceId` no momento de gerar a etiqueta no Melhor Envio).
- [`src/components/PedidosLista.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PedidosLista.tsx#L603-L634) (`resolverProvedorEntrega` e exibição do serviço na listagem/detalhes).

### 7.2. Causa Raiz Técnica
Existem **4 pontos encadeados** que causam a perda da escolha paga (SEDEX) ou o retorno indevido para PAC (Frete Grátis) após a confirmação do pedido:
1. **Sobrescrita do valor do frete em `CatalogoPublico.tsx` (`linha 1042`):**
   ```ts
   const valorFreteEfetivo = (freteGratisCupom || (elegivelFreteGratisLoja && (!pedidoEntrega || pedidoEntrega.is_frete_gratis || pedidoEntrega.valor_frete === 0))) ? 0 : valorFreteBase;
   ```
   Embora `valorFreteEfetivo` cheque `pedidoEntrega.is_frete_gratis`, quando o cliente abre novamente o modal de envio (`linhas 3258–3260`), a prop passada é `opcaoSelecionadaId={pedidoEntrega?.servico_codigo}`. No `ShippingFulfillmentSelector`, o `useEffect` de cotação (`linhas 410–427`) só preserva a opção se `opcoes.some(o => o.id === selecionadaId)`. Como para cotações do Melhor Envio `o.id` é `'me_1'` (SEDEX) ou `'me_2'` (PAC), enquanto `pedidoEntrega.servico_codigo` é `'1'` ou `'2'`, `opcoes.some(o => o.id === '1')` retorna **`false`**! Com isso, o seletor descarta a seleção do SEDEX e **auto-seleciona novamente a opção mais barata (`ordenados[0]`, que é o PAC R$ 0,00)**!
2. **Ausência de `servico_correios` em `emitirSelecao` (`ShippingFulfillmentSelector.tsx`, linhas `774–804`):**
   Ao construir o objeto `pedido_entrega`, `emitirSelecao` preenche `transportadora_nome: opcao.transportadora_nome` (ex.: `"Correios (SEDEX)"`) e `servico_codigo: opcao.servico_codigo` (`"1"`), mas **não preenche `servico_correios`** (`'SEDEX'` ou `'PAC'`).
3. **Omissão das colunas de transporte no insert de `public.pedidos` (`CatalogoPublico.tsx`, linhas `1333–1366`):**
   Ao finalizar o pedido no catálogo online, `payloadPedido` não envia `nome_transportadora`, `servico_correios` nem `tipo_operacao` para a tabela `public.pedidos`, e `entregaPayload` (`linha 1386`) não garante `servico_correios`.
4. **Fallback fixo para PAC (`service: 1`) ou inversão de IDs em `melhorEnvioService.ts` (`linhas 502–520`):**
   Na função `solicitarEnvioMelhorEnvio` ([`melhorEnvioService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/melhorEnvioService.ts#L502-L520)):
   ```ts
   let serviceId = Number(entrega?.servico_codigo);
   if (!serviceId || isNaN(serviceId)) {
     const servicoCorreios = (entrega?.servico_correios || pedido.servico_correios || '').toUpperCase();
     if (servicoCorreios === 'SEDEX') {
       serviceId = 2; // <-- BUG CRÍTICO: No Melhor Envio, 1 = PAC e 2 = SEDEX!
     } else {
       serviceId = 1; // Default PAC
     }
   }
   ```
   Além disso, se `entrega` não vier carregada no objeto `pedido` durante o clique em "Despachar Pedido" em [`PedidosLista.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PedidosLista.tsx), `entrega?.servico_codigo` é `undefined` e `pedido.servico_correios` está vazio (pois o catálogo não salvou `servico_correios` em `pedidos`), fazendo com que `solicitarEnvioMelhorEnvio` caia sempre no fallback `serviceId = 1` (**PAC**)!

### 7.3. Plano de Alteração Passo a Passo
1. Em [`ShippingFulfillmentSelector.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/shipping/ShippingFulfillmentSelector.tsx):
   - Na reconciliação de `opcaoSelecionadaId` (`linhas 410–427`), aceitar correspondência tanto por `o.id === selecionadaId` quanto por `o.servico_codigo === String(selecionadaId)`, evitando que o modal resete de SEDEX para PAC ao ser reaberto ou re-renderizado.
   - Em `emitirSelecao` (`linhas 774–804`), inferir e gravar explicitamente `servico_correios` (`'SEDEX'`, `'PAC'` ou `'MINI_ENVIOS'`) sempre que a opção selecionada for dos Correios (via `opcao.servico_nome` / `opcao.transportadora_nome` / `opcao.servico_codigo`), além de manter `is_frete_gratis: opcao.is_frete_gratis ?? (opcao.valor === 0 && elegivelFreteGratis)`.
2. Em [`CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx):
   - Em `payloadPedido` (`linhas 1333–1366`), incluir explicitamente:
     - `nome_transportadora: pedidoEntrega?.transportadora_nome || null`
     - `servico_correios: pedidoEntrega?.servico_correios || (pedidoEntrega?.transportadora_nome?.toUpperCase().includes('SEDEX') ? 'SEDEX' : pedidoEntrega?.transportadora_nome?.toUpperCase().includes('PAC') ? 'PAC' : null)`
   - Em `entregaPayload` (`linhas 1385–1396`), garantir a persistência de `servico_correios`, `transportadora_nome`, `servico_codigo`, `valor_frete: valorFreteEfetivo` e `is_frete_gratis: valorFreteEfetivo === 0 && (freteGratisCupom || elegivelFreteGratisLoja)`.
3. Em [`melhorEnvioService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/melhorEnvioService.ts#L502-L525):
   - Na função `solicitarEnvioMelhorEnvio`, caso `entrega` não esteja anexada em memória ao `pedido` recebido, buscar o registro em `public.pedido_entregas` (`.eq('pedido_id', pedido.id).eq('loja_id', lojaId).maybeSingle()`) antes de decidir o `serviceId`.
   - Resolver `serviceId` priorizando `Number(entrega?.servico_codigo)` e, caso ausente, verificar `entrega?.servico_correios`, `pedido.servico_correios` e `entrega?.transportadora_nome || pedido.nome_transportadora` (identificando `'SEDEX'` $\rightarrow$ `2`, `'PAC'` $\rightarrow$ `1`).
4. Em [`PedidosLista.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PedidosLista.tsx#L603-L634):
   - Em `resolverProvedorEntrega`, exibir a modalidade exata contratada (`entrega?.transportadora_nome || pedido.nome_transportadora || entrega?.servico_correios || pedido.servico_correios`) para que o card do pedido e o recibo mostrem claramente **Correios (SEDEX)** e o valor pago pelo upgrade (`R$ 26,86`).

### 7.4. Cenários de Teste e Validação
- **Cenário 1 (Upgrade PAC Grátis $\rightarrow$ SEDEX Pago no Catálogo):** Com um carrinho elegível a Frete Grátis (onde PAC = `R$ 0,00` e SEDEX = `R$ 26,86`), selecionar **SEDEX (`R$ 26,86`)**, confirmar e concluir o pedido.
- **Cenário 2 (Conferência em Pedidos, Recibo e Despacho):** Verificar na tela de *Pedidos*, no *Recibo* e ao acionar *Gerar Etiqueta / Despachar* que o serviço permanece **Correios (SEDEX)** com `servico_codigo = '2'` e `valor_frete = 26.86`, sem reverter para PAC.

---

## 8. Tratamento de Erro do Melhor Envio: Limite de Seguro sem NF-e (`E-CRT-0001` > R$ 1.000,00)

### 8.1. Arquivos Alvo
- [`src/services/melhorEnvioService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/melhorEnvioService.ts#L675-L720) (tratamento de erro da Edge Function `melhor-envio-proxy` ao adicionar etiqueta ao carrinho).
- [`src/components/PedidosLista.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PedidosLista.tsx#L935-L985) (fluxo `handleDespacharPedido` e feedback de erro ao operador).
- [`src/components/shipping/ShippingFulfillmentSelector.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/shipping/ShippingFulfillmentSelector.tsx#L995-L1020) (aviso preventivo quando o subtotal do pedido ultrapassa R$ 1.000,00).

### 8.2. Causa Raiz Técnica
- Na linha `631` de [`melhorEnvioService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/melhorEnvioService.ts#L631), a integração envia `non_commercial: true` (envio com Declaração de Conteúdo, sem chave de Nota Fiscal Eletrônica) e `insurance_value: valorSegurado` (valor dos itens do pedido).
- Por regra regulatória das transportadoras e da API do Melhor Envio, envios não comerciais (`non_commercial: true`) possuem teto máximo de seguro de **R$ 1.000,00**, retornando HTTP `422` com o código `E-CRT-0001` (*"O valor segurado para envios não comerciais não pode ultrapassar R$ 1.000,00."*).
- Nas linhas `680–685` de [`melhorEnvioService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/melhorEnvioService.ts#L680-L685), o sistema dispara um `window.alert('Diagnóstico Melhor Envio (422):\n' + JSON.stringify(...))` seguido de `throw new Error(...)` com o JSON bruto, violando a diretriz de sanitização de erros e bloqueando o despacho sem oferecer saída operacional ao lojista.

### 8.3. Plano de Alteração Passo a Passo
1. Em [`melhorEnvioService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/melhorEnvioService.ts#L675-L720):
   - Remover o `window.alert` com despejo de JSON bruto (`linhas 681–683`).
   - Inspecionar se o payload de erro contém `E-CRT-0001` ou a mensagem de limite de valor segurado (`"valor segurado"` / `"1.000,00"` / `"envios não comerciais"`).
   - Quando detectado, lançar um erro estruturado com código identificável (`error.code = 'MELHOR_ENVIO_LIMITE_SEGURO_SEM_NFE'`) e mensagem amigável em `pt-BR`:
     > *"Não foi possível gerar a etiqueta automática: o Melhor Envio limita o seguro de envios com Declaração de Conteúdo (sem Nota Fiscal) a R$ 1.000,00. Para concluir o envio deste pedido, utilize o Despacho Manual (postagem direta no balcão/transportadora com código de rastreio) ou gere a etiqueta com NF-e diretamente no painel do Melhor Envio."*
2. Em [`PedidosLista.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PedidosLista.tsx#L935-L985):
   - No `catch` de `handleDespacharPedido` (e `handleSalvarCpfEContinuarDespacho`), interceptar o erro `MELHOR_ENVIO_LIMITE_SEGURO_SEM_NFE` (ou texto equivalente).
   - Em vez de apenas exibir um erro estático, abrir imediatamente o modal de despacho manual (`setPedidoParaDespachar(pedido); setModalDespachoAberto(true);`) acompanhado do aviso explicativo para que o operador possa informar a transportadora/código de rastreio e concluir o despacho do pedido sem bloqueio.
3. Em [`ShippingFulfillmentSelector.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/shipping/ShippingFulfillmentSelector.tsx):
   - Quando `subtotal > 1000`, exibir um banner informativo âmbar discreto junto às opções do Melhor Envio alertando o operador do PDV que pedidos acima de R$ 1.000,00 exigem NF-e no Melhor Envio ou postagem manual no balcão.

### 8.4. Cenários de Teste e Validação
- **Cenário 1 (Despacho de Pedido > R$ 1.000,00 via Melhor Envio):** Tentar despachar um pedido com valor de produtos superior a R$ 1.000,00 (ex.: Pedido #20 de R$ 1.031,79) e verificar que nenhum JSON técnico (`E-CRT-0001`) é exibido em `window.alert`.
- **Cenário 2 (Contingência para Despacho Manual):** Confirmar que o sistema apresenta a mensagem explicativa em português claro e abre o modal de Despacho Manual permitindo concluir o envio do pedido.

---

## 9. Inconsistência de Preços no "Radar de Preços de Mercado" (IA Gemini)

### 9.1. Arquivos Alvo
- [`src/components/ProdutoCadastro.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ProdutoCadastro.tsx#L164-L267) (funções `processarListaConcorrentes` nas linhas `164–193`, `pesquisarPrecosMercadoIA` nas linhas `197–267` e handler `handleBuscarPrecoMedioIA` nas linhas `1015–1070`).

### 9.2. Causa Raiz Técnica
A análise das funções `pesquisarPrecosMercadoIA` e `processarListaConcorrentes` em [`ProdutoCadastro.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ProdutoCadastro.tsx#L164-L267) revelou **3 falhas diretas** que distorcem a estimativa de preço:
1. **Ancoragem Artificial em Preços Baixos no Prompt (`linhas 225 e 239`):**
   O prompt enviado ao Gemini contém instruções e exemplos fixos de valores baixos:
   - Linha `225`: `'(ex: se no Mercado Livre custa entre R$ 11,00 e R$ 19,90, reflita essa faixa real)'`
   - Linha `239`: `'{ "loja": "Shopee", "preco": 12.90, "url": "..." }'`
   Esse viés induz o modelo a ancorar estimativas na faixa de R$ 12,00 a R$ 35,00 mesmo para produtos de ticket superior (cosméticos profissionais, eletrônicos, kits ou embalagens maiores).
2. **Falta de Contexto de Especificação e Preço de Custo/Referência:**
   `pesquisarPrecosMercadoIA` recebe apenas `(nomeProduto, categoriaNome, barcode, segmento)`, ignorando a `descricao` do produto e o `precoCusto` / `precoVendaVarejo` já preenchidos na tela, o que faz a IA confundir o produto principal com acessórios, refis, sachês ou miniaturas.
3. **Ausência de Filtragem Estatística de Outliers (`processarListaConcorrentes`, linhas `164–193`):**
   A função calcula a média aritmética simples de todos os itens retornados sem descartar valores discrepantes (outliers extremos abaixo ou acima da mediana).

### 9.3. Plano de Alteração Passo a Passo
1. Reformular o prompt de `pesquisarPrecosMercadoIA` em [`ProdutoCadastro.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ProdutoCadastro.tsx#L197-L267):
   - Remover completamente os exemplos viesados de `R$ 11,00 e R$ 19,90` e `preco: 12.90`.
   - Incluir como parâmetros opcionais de contexto: `descricaoProduto`, `unidadeMedida` e `precoCustoReferencia` (quando o lojista já tiver preenchido o preço de custo, informando à IA que se trata do produto principal completo e não de um acessório/sachê de valor ínfimo).
   - Instruir explicitamente o modelo a:
     1. Considerar **marca exata, modelo, volume/peso (ml, g, kg, L) e apresentação (unidade avulsa vs kit)**;
     2. **Descartar** acessórios, peças de reposição, amostras grátis, sachês, refis avulsos ou produtos usados;
     3. Praticar os preços reais de varejo vigentes no e-commerce brasileiro (Mercado Livre, Amazon Brasil, Magazine Luiza, Shopee Oficial, Beleza na Web/Época/Drogasil conforme o segmento).
2. Implementar saneamento estatístico de outliers em `processarListaConcorrentes` (`linhas 164–193`):
   - Ordenar os preços válidos e calcular a **mediana** central da amostra.
   - Filtrar ofertas aberrantes que destoem drasticamente da mediana (descartar preços `< mediana * 0.45` ou `> mediana * 2.20` quando houver 4 ou mais cotações, além de descartar preços inferiores a `precoCusto * 0.70` quando o custo já estiver informado pelo usuário).
   - Calcular `precoMedio`, `menoresPrecos` e `maioresPrecos` exclusivamente sobre a amostra saneada.

### 9.4. Cenários de Teste e Validação
- **Cenário 1 (Produto de Ticket Médio/Alto - ~R$ 99,90):** Cadastrar ou editar um produto cujo valor real de mercado gira em torno de R$ 99,90, acionar o *Radar de Preços de Mercado* e verificar que a média, os 3 menores e os 3 maiores preços refletem a faixa real do produto completo, sem ancorar em R$ 30,00.
- **Cenário 2 (Filtragem de Outliers):** Simular retorno contendo um acessório barato (ex.: R$ 14,90 em meio a cotações de R$ 95,00–R$ 110,00) e confirmar que o filtro estatístico descarta o outlier antes de exibir o card.

---

## 10. Falha na Ação "Sair da Conta" (Logout) no Catálogo Online

### 10.1. Arquivos Alvo
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx#L361-L379) (função `handleLogoutCliente` nas linhas `361–379` e `useEffect` de sessão OAuth nas linhas `525–602`).

### 10.2. Causa Raiz Técnica
- Em [`CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx#L361-L379), a função `handleLogoutCliente` limpa o estado local `setClienteSelecionado(null)` e remove chaves do `sessionStorage`.
- Porém, logo abaixo, o `useEffect` das linhas `525–602` possui `[loja?.id, clienteSelecionado?.id]` em seu array de dependências:
  ```ts
  useEffect(() => {
    if (!loja?.id) return;
    const verificarSessaoOAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && !clienteSelecionado) {
        await sincronizarUsuarioOAuth(session.user);
      }
    };
    verificarSessaoOAuth();
    ...
  }, [loja?.id, clienteSelecionado?.id]);
  ```
- Assim que `handleLogoutCliente()` define `clienteSelecionado` como `null`, esse `useEffect` dispara imediatamente! Como a sessão OAuth do Supabase (`supabase.auth.getSession()`) continua ativa no navegador (ou o bloqueio de auto-login pós-logout não foi registrado), `verificarSessaoOAuth()` encontra `session.user`, executa `sincronizarUsuarioOAuth(session.user)` e **re-loga o cliente automaticamente em poucos milissegundos**, além de poder acionar modais de complemento cadastral.

### 10.3. Plano de Alteração Passo a Passo
1. Em [`CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx):
   - Criar uma flag persistida por sessão `hubi_catalogo_logout_manual_${slugKey}` no `sessionStorage` e um `useRef<boolean>(false)` (`logoutManualRef`).
2. Ao executar `handleLogoutCliente` (`linhas 361–379`):
   - Definir `logoutManualRef.current = true` e `sessionStorage.setItem(\`hubi_catalogo_logout_manual_\${slugKey}\`, 'true')`.
   - Fechar preventivamente todos os menus e modais vinculados à conta (`setMenuUsuarioAberto(false)`, `setModalOnboardingAberto(false)`, `setModalContatoAberto(false)`, `setModalEnderecoAberto(false)`, `setModalPedidosAberto(false)`, `setModalFavoritosAberto(false)`, `setModalNotificacoesAberto(false)`).
   - Limpar estados do cliente (`setClienteSelecionado(null)`, `setNomeCliente('')`, `setWhatsappCliente('')`, `setEnderecoEntrega('')`, `setFavoritosIds([])`, `setContagemNotificacoesNaoLidas(0)`).
   - Remover `hubi_catalogo_cliente_${slugKey}`, `hubi_oauth_catalogo_login` e `hubi_oauth_catalogo_slug` do `sessionStorage`/`localStorage`.
   - Caso a sessão ativa no Supabase Auth tenha sido iniciada pelo fluxo OAuth do catálogo (`localStorage.getItem('hubi_oauth_catalogo_login')` ou quando o usuário autenticado não for o operador administrativo da loja), executar `await supabase.auth.signOut({ scope: 'local' })`.
3. No `useEffect` de `verificarSessaoOAuth` (`linhas 525–602`):
   - Verificar no início se `logoutManualRef.current === true` ou `sessionStorage.getItem(\`hubi_catalogo_logout_manual_\${slugKey}\`) === 'true'`. Se verdadeiro, **não** re-hidratar automaticamente o cliente via `verificarSessaoOAuth`.
   - Ao iniciar um novo login intencional (em `handleSelecionarCliente` ou ao clicar em *"Entrar com Google"* no `ModalOnboardingCliente`), limpar a flag `hubi_catalogo_logout_manual_${slugKey}` e `logoutManualRef.current = false`.

### 10.4. Cenários de Teste e Validação
- **Cenário 1 (Logout de Cliente Identificado por WhatsApp/CPF ou Google OAuth):** Clicar no menu do usuário no topo do catálogo e selecionar **"Sair da conta"**. Confirmar que o menu fecha imediatamente, nenhum modal pisca na tela e o botão superior volta para **"Entrar"**.
- **Cenário 2 (Persistência após F5):** Recarregar a página do catálogo após sair da conta e confirmar que o cliente permanece deslogado até que faça um novo login intencional.

---

## 11. Padronização Visual do Modal "Meus Favoritos" (Temas Claro e Escuro)

### 11.1. Arquivos Alvo
- [`src/components/ModalFavoritosCliente.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalFavoritosCliente.tsx#L1-L212) (estrutura completa do modal, estado vazio e cards de produtos favoritados).

### 11.2. Causa Raiz Técnica
1. **Ausência de suporte ao Tema Claro:** [`ModalFavoritosCliente.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalFavoritosCliente.tsx#L91-L185) não utiliza `useTheme()` e aplica classes fixas de tema escuro (`bg-slate-900 border-slate-800`, cabeçalho `bg-slate-950/70`, cards `bg-slate-950/60 border-slate-800/80`). Quando aberto no Tema Claro, o modal inteiro fica escuro e destoa da vitrine.
2. **Botões com texto branco sobre fundo branco no Tema Escuro (`linhas 141–145` e `189–196`):**
   - O botão **"Explorar Catálogo"** (`linha 143`) e os botões **"Adicionar ao Carrinho"** (`linha 191`) usam `className="... text-white ..."` junto com `style={{ backgroundColor: corTema }}`.
   - Como `CatalogoPublico.tsx` passa `corTema = isDark ? '#FFFFFF' : '#000000'`, no **Tema Escuro** `corTema` é `#FFFFFF` (branco). O resultado é um botão branco sólido com texto e ícone brancos (`text-white`), deixando os botões completamente ilegíveis!

### 11.3. Plano de Alteração Passo a Passo
1. Importar `useTheme` (`import { useTheme } from '../contexts/ThemeContext'`) em [`ModalFavoritosCliente.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalFavoritosCliente.tsx) e obter `const { isDark } = useTheme()`.
2. Adaptar a superfície do modal para respeitar `isDark`:
   - **Container do Modal:** `isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'`.
   - **Cabeçalho:** `isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'`, título em `isDark ? 'text-white' : 'text-slate-900'`, subtítulo em `isDark ? 'text-slate-400' : 'text-slate-600'`, e botão fechar (`X`) em `isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/70'`.
   - **Cards de Produtos Favoritos:** `isDark ? 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700' : 'bg-white border-slate-200 hover:border-emerald-500/40 shadow-2xs'`, nome do produto em `isDark ? 'text-slate-100' : 'text-slate-900'` e preço em `isDark ? 'text-emerald-400' : 'text-emerald-700'`.
3. Substituir o `style={{ backgroundColor: corTema }}` nos botões de ação primária (**"Explorar Catálogo"** e **"Adicionar ao Carrinho"**) por estilização institucional de alto contraste:
   - `bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-xs transition-all active:scale-[0.98]` (garantindo contraste 100% nítido tanto no tema claro quanto no tema escuro).

### 11.4. Cenários de Teste e Validação
- **Cenário 1 (Modal Meus Favoritos no Tema Claro):** Abrir *Favoritos* com o tema claro ativo (com lista vazia e com produtos favoritados) e verificar fundo claro (`#FFFFFF`), textos escuros nítidos e botões *"Explorar Catálogo"* / *"Adicionar ao Carrinho"* perfeitamente legíveis.
- **Cenário 2 (Modal Meus Favoritos no Tema Escuro):** Alternar para o tema escuro, abrir *Favoritos* e confirmar que os botões *"Explorar Catálogo"* e *"Adicionar ao Carrinho"* exibem fundo verde esmeralda institucional com texto branco legível, eliminando a tarja branca cega.

---

## 12. Exibição Condicional da Barra de "Frete Grátis" no PDV

### 12.1. Arquivos Alvo
- [`src/components/PosCheckout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckout.tsx#L2587-L2614) (termômetro de Frete Grátis no carrinho desktop do PDV).
- [`src/components/PosCheckoutMobile.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckoutMobile.tsx#L1030-L1078) (termômetro de Frete Grátis no carrinho mobile do PDV).

### 12.2. Causa Raiz Técnica
- Em [`PosCheckout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckout.tsx#L2588), a barra de progresso de Frete Grátis (*"Faltam R$ X para Frete Grátis"* / *"Cliente ganhou Frete Grátis!"*) é renderizada com a condição:
  ```tsx
  {freteGratisAtivoLoja && freteGratisMinimoLoja > 0 && (() => { ... })()}
  ```
- De forma análoga, em [`PosCheckoutMobile.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckoutMobile.tsx#L1030), o termômetro é renderizado sempre que `cfg.frete_gratis_ativo && Number(cfg.frete_gratis_valor_minimo) > 0`, sem verificar se a modalidade de atendimento selecionada no carrinho é **Envio** (`pedidoEntrega?.tipo_atendimento === 'entrega'`).
- Como o PDV inicia por padrão na modalidade **Retirada** (venda presencial no balcão), o termômetro de frete grátis aparece indevidamente em vendas presenciais sem entrega.

### 12.3. Plano de Alteração Passo a Passo
1. Em [`PosCheckout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckout.tsx#L2588):
   - Condicionar a renderização do termômetro de Frete Grátis à variável `ehEnvio` (`pedidoEntrega?.tipo_atendimento === 'entrega'`):
     ```tsx
     {ehEnvio && freteGratisAtivoLoja && freteGratisMinimoLoja > 0 && (() => {
     ```
2. Em [`PosCheckoutMobile.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckoutMobile.tsx#L1030):
   - Adicionar a verificação `pedidoEntrega?.tipo_atendimento === 'entrega'` na condição de renderização do termômetro de Frete Grátis no modal do carrinho mobile.
3. No Catálogo Online ([`CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx#L3055-L3091)):
   - Caso o cliente tenha selecionado explicitamente a opção de **Retirada na Loja** (`pedidoEntrega?.tipo_atendimento === 'retirada'`), ocultar também o banner de termômetro de frete grátis no resumo do carrinho, mantendo-o visível apenas quando for entrega ou enquanto ainda não houver modalidade restrita a retirada.

### 12.4. Cenários de Teste e Validação
- **Cenário 1 (PDV Desktop e Mobile em "Retirada"):** Adicionar produtos ao carrinho do PDV com a chave *"Forma de Entrega"* em **Retirada** e confirmar que a barra de progresso de Frete Grátis **não** é exibida.
- **Cenário 2 (PDV Desktop e Mobile ao Alternar para "Envio"):** Alternar a chave *"Forma de Entrega"* para **Envio** e verificar que a barra de progresso de Frete Grátis passa a ser exibida imediatamente (desde que a loja possua regra de frete grátis ativa).
