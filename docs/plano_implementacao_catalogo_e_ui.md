# 📋 Plano de Implementação: Interface, Catálogo Online e Fluxos de Venda

> **Status do Documento:** Planejamento Técnico Detalhado (Aguardando Revisão e Autorização)
> **Repositório:** HUBI — Sistema de Gestão e Vendas Multiplataforma
> **Conformidade:** `diff-patch-only`, `supabase-rls-guard`, `pii-leak-detector`, `anti-jsonb-linter`

---

## Sumário Executivo

Este documento apresenta o diagnóstico técnico de causa raiz e o plano de alteração passo a passo para solucionar os **14 apontamentos** de UI/UX, regras de negócio, precificação e integrações de pagamento e rastreio no Catálogo Online e no painel administrativo do HUBI.

---

## 1. Contraste e Legibilidade no Modal de Data Operacional (Tema Claro)

### 1.1. Mapeamento de Arquivos
- [`src/components/ModalSeletorDataOperacao.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalSeletorDataOperacao.tsx)
- [`src/index.css`](file:///c:/Users/User/Documents/HUBI/src/index.css)

### 1.2. Diagnóstico da Causa Raiz
- Em `ModalSeletorDataOperacao.tsx` (linhas 76–258), o componente utiliza classes estáticas voltadas exclusivamente ao tema escuro (`bg-slate-900`, `text-slate-100`, `bg-slate-950`, `border-slate-700`) sem consumir o hook `useTheme()`.
- Além disso, em `src/index.css` (linhas 240–251), a regra global de `html.light` estiliza apenas `input[type="text"]`, `search`, `number`, `tel`, `email` e `password`, omitindo `input[type="date"]` e `input[type="time"]`. Com isso, no tema claro, os campos de data e hora mantêm `bg-slate-950` enquanto o navegador renderiza o texto nativo ou ícone do calendário/relógio sem contraste adequado.

### 1.3. Plano de Mudança Passo a Passo
1. Importar e instanciar `const { tema } = useTheme(); const isDark = tema === 'dark';` em `ModalSeletorDataOperacao.tsx`.
2. Adeguar o container do modal, cabeçalho, card de status do servidor, alerta explicativo e botões de atalhos rápidos para alternar entre tema escuro e tema claro (`bg-white border-slate-200 text-slate-900` no tema claro).
3. Estilizar explicitamente os inputs `type="date"` (linha 143) e `type="time"` (linha 167) no tema claro com:
   - Fundo claro: `bg-white` (`#FFFFFF`) ou `bg-slate-50` (`#F9FAFB`);
   - Borda nítida: `border-slate-300 focus:border-amber-500`;
   - Texto e ícone de alto contraste: `text-slate-900` (`#111827`) e `[color-scheme:light]` quando `!isDark` (`[color-scheme:dark]` quando `isDark`).
4. Adicionar `html.light input[type="date"], html.light input[type="time"]` na regra de inputs claros em `src/index.css` (linha 245) garantindo `background-color: #ffffff !important; border-color: #cbd5e1 !important; color: #111827 !important; color-scheme: light !important;`.

### 1.4. Análise de Regressão e Validação
- Testar abertura do modal "Data Operacional do Sistema" tanto no tema claro quanto no tema escuro (Desktop e Mobile).
- Verificar legibilidade dos números da data/hora e visibilidade do ícone nativo de calendário/relógio nos navegadores Chrome/Edge/Safari.

---

## 2. Fundo de Troco Inicial Zerado (Abertura de Caixa)

### 2.1. Mapeamento de Arquivos
- [`src/components/FinancasCaixa.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/FinancasCaixa.tsx)

### 2.2. Diagnóstico da Causa Raiz
- Em `src/components/FinancasCaixa.tsx` (linha 190), o estado `fundoTroco` é inicializado com valor fixo `'100.00'`:
  ```ts
  const [fundoTroco, setFundoTroco] = useState<string>('100.00');
  ```
- Isso obriga o operador a apagar manualmente os caracteres toda vez que vai iniciar um turno sem troco ou com valor diferente.

### 2.3. Plano de Mudança Passo a Passo
1. Em `src/components/FinancasCaixa.tsx` (linha 190), alterar o valor inicial do estado para `'0.00'` (ou `''` com fallback `0` na submissão e `placeholder="0,00"`):
   ```ts
   const [fundoTroco, setFundoTroco] = useState<string>('0.00');
   ```
2. Na abertura do modal de abertura de caixa e no input numérico (linha 3206), atualizar `placeholder="0,00"` e garantir que `min="0"` seja respeitado, permitindo abrir o caixa diretamente com `0,00` sem necessidade de digitação extra.

### 2.4. Análise de Regressão e Validação
- Abrir o modal "Abertura de Caixa" e validar que o campo vem com `0.00` (ou placeholder `0,00`).
- Confirmar a abertura de sessão com R$ 0,00 e também digitando um valor específico (ex.: R$ 50,00), verificando se `saldo_esperado_dinheiro` e `fundo_inicial` são gravados corretamente em `sessoes_caixa`.

---

## 3. Ocultar Produtos sem Estoque no Catálogo Online

### 3.1. Mapeamento de Arquivos
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx)

### 3.2. Diagnóstico da Causa Raiz
- Em `src/components/CatalogoPublico.tsx` (linha 1641), a variável `semEstoqueModo` assume `'exibir'` por padrão (`const semEstoqueModo = catConfig?.produtos_sem_estoque || 'exibir';`).
- No filtro `produtosFiltrados` (linhas 1671–1677), produtos com estoque menor ou igual a zero só são ocultados se `semEstoqueModo === 'ocultar'`. Como resultado, produtos esgotados ou com `quantidade_estoque <= 0` continuam aparecendo na vitrine pública.

### 3.3. Plano de Mudança Passo a Passo
1. Em `src/components/CatalogoPublico.tsx` (linhas 1671–1677), ajustar a regra de filtragem em `produtosFiltrados` para filtrar estritamente produtos ativos com estoque positivo (`getEstoqueTotal(p) > 0`, exceto se `p.tipo_item === 'servico'`):
   ```ts
   // Exibir estritamente produtos ativos com quantidade positiva em estoque
   if (p.tipo_item !== 'servico') {
     const est = getEstoqueTotal(p);
     if (est <= 0) return false;
   }
   ```
2. Atualizar também a contagem de produtos por categoria no seletor dropdown de categorias (linhas 1996 e 1999) para contabilizar apenas os produtos disponíveis em estoque (`getEstoqueTotal(p) > 0`), evitando que uma categoria mostre `(5)` no seletor mas exiba `0` itens ao ser clicada.
3. No modal de seleção de variações (`produtoModalVariacao`, linha 2414), filtrar ou ocultar variações com `quantidade_estoque <= 0` (ou manter apenas variações com `Number(v.quantidade_estoque || 0) > 0`).

### 3.4. Análise de Regressão e Validação
- Cadastrar/verificar produto com `quantidade_estoque = 0` e confirmar que ele não é exibido em nenhum dos modos de visualização (Grade, Lista, Instaview) nem na busca do catálogo.
- Verificar produtos com variações: se todas as variações estiverem zeradas (`getEstoqueTotal(p) <= 0`), o produto não deve aparecer; se apenas uma variação tiver estoque `> 0`, o produto aparece.

---

## 4. Seletor de Tema (Claro / Escuro) no Catálogo Online

### 4.1. Mapeamento de Arquivos
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx)
- [`src/contexts/ThemeContext.tsx`](file:///c:/Users/User/Documents/HUBI/src/contexts/ThemeContext.tsx)

### 4.2. Diagnóstico da Causa Raiz
- `CatalogoPublico.tsx` não importa `useTheme` nem oferece botão de alternância de tema em seu `<header>`. O cliente final fica preso ao tema herdado do navegador/dispositivo sem poder alternar entre Modo Claro e Modo Escuro.

### 4.3. Plano de Mudança Passo a Passo
1. Em `src/components/CatalogoPublico.tsx`, importar `Sun` e `Moon` de `lucide-react` e o hook `useTheme` de `../contexts/ThemeContext`.
2. Extrair `const { tema, toggleTema } = useTheme(); const isDark = tema === 'dark';`.
3. Na barra de ações superior direita do `<header>` (ao lado de Vitrine, Pedidos, Favoritos, Notificações e Carrinho, por volta da linha 1847), adicionar o botão toggle de tema (Sol $\leftrightarrow$ Lua):
   - Quando `isDark` for `true`, exibir ícone `<Sun className="w-4 h-4 text-amber-400" />` para mudar para o tema claro.
   - Quando `isDark` for `false`, exibir ícone `<Moon className="w-4 h-4 text-slate-700" />` para mudar para o tema escuro.
4. Garantir que o clique acione `toggleTema()`, que já persiste a escolha no `localStorage` (`theme-preference` e `hubi_theme_preference`) e sincroniza a classe `light`/`dark` na tag `<html>`.

### 4.4. Análise de Regressão e Validação
- Clicar no botão Sol/Lua no cabeçalho do catálogo (Desktop e Mobile), verificar a troca instantânea de tema e recarregar a página (`F5`) para confirmar a persistência via `localStorage`.

---

## 5. Remoção do Card de "Cor Principal" nas Configurações do Catálogo

### 5.1. Mapeamento de Arquivos
- [`src/components/ConfiguracaoCatalogo.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ConfiguracaoCatalogo.tsx)
- [`src/components/ConfiguracaoCatalogoMobile.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ConfiguracaoCatalogoMobile.tsx)
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx)

### 5.2. Diagnóstico da Causa Raiz
- Em `ConfiguracaoCatalogo.tsx` (linhas 478–580), existe o card **"2. COR PRINCIPAL / TEMA DE CORES"** com seletor de paleta e preview interativo.
- Em `ConfiguracaoCatalogoMobile.tsx` (linhas 913–925 e 1009–1144), existe o item de menu e a sub-tela `cor-principal`.
- No catálogo público (`CatalogoPublico.tsx`, linha 1002), `corTema` é lido de `loja?.cor_primaria || '#10B981'`, aplicando cores variadas que descaracterizam a identidade institucional baseada no tema claro/escuro.

### 5.3. Plano de Mudança Passo a Passo
1. Em `src/components/ConfiguracaoCatalogo.tsx`:
   - Remover completamente o bloco JSX `/* 2. COR PRINCIPAL / TEMA DE CORES */` (linhas 478–580).
2. Em `src/components/ConfiguracaoCatalogoMobile.tsx`:
   - Remover o botão de navegação para `cor-principal` na sub-tela `opcoes-exibicao` (linhas 913–925) e remover o bloco `subTela === 'cor-principal'` (linhas 1009–1144).
3. Fixar a regra institucional de cores baseada no tema ativo:
   - No **Tema Escuro (`isDark === true`)**: cor institucional de destaque/texto principal em **branco (`#FFFFFF`)** (e contraste de texto escuro `#0F172A` sobre botões brancos, ou conforme tokens do PDV).
   - No **Tema Claro (`isDark === false`)**: cor institucional principal em **preto (`#000000` / `#0F172A`)** com texto branco (`#FFFFFF`).

### 5.4. Análise de Regressão e Validação
- Acessar *Configurações > Catálogo Online* no Desktop e no Mobile e verificar que o card/menu "Cor principal" foi totalmente removido sem quebrar o salvamento das demais configurações (nome, logo, banner, modo de exibição).
- Verificar no Catálogo Online que os elementos institucionais respeitam estritamente o branco no tema escuro e preto no tema claro.

---

## 6. Padronização Visual do Modal "Escolha Como Deseja Receber"

### 6.1. Mapeamento de Arquivos
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx) (linhas 3180–3320)
- [`src/components/shipping/ShippingFulfillmentSelector.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/shipping/ShippingFulfillmentSelector.tsx) (linhas 1265–1398 e 2066–2425)

### 6.2. Diagnóstico da Causa Raiz
- Em `CatalogoPublico.tsx` (linha 3192), o modal "Escolha Como Deseja Receber" possui estilização fixa escura (`bg-slate-900 border-2 border-slate-600/80 text-white`) e o ícone de cabeçalho usa `bg-emerald-950/60`.
- Em `ShippingFulfillmentSelector.tsx`, quando `ehCatalogo` é `true`:
  - O card "Retirar na Loja" (linhas 1344–1397) usa classes fixas escuras (`bg-slate-800/40 border-slate-700/60 text-slate-200`, botão "Ver no Mapa" em `bg-slate-800`), ignorando a variável `ehDark`.
  - O divisor "Opções de Entrega" (linhas 1625–1628) usa `border-slate-700/60` e `text-slate-200` fixos quando `ehCatalogo` é `true`.
  - Os cards de "Frete a combinar" (linhas 2070, 2151, 2225) alternam entre estilos claros fixos (linha 2070) e escuros fixos (linhas 2151 e 2225), causando inconsistência visual com o tema claro e com o drawer "Seu Pedido".

### 6.3. Plano de Mudança Passo a Passo
1. Em `CatalogoPublico.tsx` (linhas 3192–3318):
   - Alinhar o container do modal "Escolha Como Deseja Receber" aos mesmos tokens visuais do carrinho lateral ("Seu Pedido"):
     - Tema Claro: `bg-white border border-slate-200 text-slate-900 shadow-2xl rounded-3xl`
     - Tema Escuro: `bg-slate-900 border border-slate-800 text-slate-100 shadow-2xl rounded-3xl`
   - Padronizar o ícone do cabeçalho (`MapPin`): fundo suave `bg-emerald-50 text-emerald-600 border-emerald-200` no tema claro e `bg-emerald-500/10 text-emerald-400 border-emerald-500/20` no tema escuro (removendo o quadrado cinza-escuro pesado).
   - Passar `temaDark={isDark}` explicitamente para `<ShippingFulfillmentSelector />`.
   - Alinhar o botão "Confirmar Opção" ao mesmo estilo de botão de ação do carrinho (`rounded-2xl font-bold text-xs py-3 px-6`).
2. Em `ShippingFulfillmentSelector.tsx`:
   - No bloco `ehCatalogo` de "Retirar na Loja" (linhas 1344–1397), substituir as cores escuras fixas por classes condicionais baseadas em `ehDark`:
     - Selecionado no claro: `bg-emerald-50/90 border-2 border-emerald-500 text-slate-900`; não selecionado no claro: `bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800`.
     - Botão "Ver no Mapa" no claro: `bg-white hover:bg-slate-100 text-slate-700 border border-slate-200`.
   - Nas linhas 1625–1628 e nos cards de "Frete a combinar" (linhas 2068–2260), unificar o estilo com base em `ehDark` para que todos os cards de frete/transportadora tenham exatamente a mesma borda, raio (`rounded-2xl`) e tipografia em ambos os temas.

### 6.4. Análise de Regressão e Validação
- Abrir o carrinho lateral no catálogo, clicar em "Selecionar / Alterar" forma de entrega e validar o modal "Escolha Como Deseja Receber" tanto no tema claro quanto no tema escuro.
- Testar seleção de "Retirar na Loja", "Frete a Combinar" e cotações de transportadoras (Uber / Melhor Envio).

---

## 7. Ajuste nos Termômetros e Resumo do Carrinho Lateral

### 7.1. Mapeamento de Arquivos
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx) (linhas 2502–2595 e 2777–2790)

### 7.2. Diagnóstico da Causa Raiz
1. **Badge indevida no termômetro de atacado (linhas 2542–2546):** Renderiza `{avaliacaoCarrinho.economiaTotal > 0 && (<span>-R$ {avaliacaoCarrinho.economiaTotal.toFixed(2)}</span>)}`. Quando há um produto com preço promocional no varejo, `economiaTotal` fica `> 0` (ex.: `R$ 6,00`), exibindo a badge `-R$ 6.00` no termômetro de atacado mesmo sem ter atingido o atacado.
2. **Repetição de porcentagem no termômetro de frete grátis (linhas 2577 e 2583):** O texto exibe `para Frete Grátis! ({percentual}%)` na linha 2577 e logo ao lado direito exibe novamente `{percentual}%` na linha 2583.
3. **Tipografia pequena e baixo contraste (linhas 2507 e 2564):** Os termômetros usam `text-[11px]` e `text-slate-300`, ficando pequenos e com baixo contraste no tema claro.
4. **Linha redundante no resumo do carrinho (linhas 2778–2790):** O bloco `{avaliacaoCarrinho.economiaTotal > 0 && (...)}` exibe `Desconto de Volume (varejo): - R$ 6,00` mesmo quando o item já está precificado com seu valor unitário no `subtotal`, dando a impressão de que o desconto deveria ser subtraído novamente do subtotal.

### 7.3. Plano de Mudança Passo a Passo
1. Em `src/components/CatalogoPublico.tsx`:
   - **Remover a badge `-R$ ...`** do topo do termômetro de atacado (remover linhas 2542–2546).
   - **Remover a repetição `({percentual}%)`** do texto da linha 2577, mantendo apenas o indicador percentual alinhado à direita da barra (`{percentual}%` na linha 2583).
   - **Aumentar a tipografia e contraste de ambos os termômetros:** alterar de `text-[11px]` para `text-xs sm:text-[13px] font-bold`, aplicando cor preta (`text-slate-950 font-extrabold` / `#000000`) no tema claro e `text-white font-bold` no tema escuro.
   - **Remover a linha redundante "Desconto de Volume"** do resumo de valores do carrinho (remover linhas 2777–2790).

### 7.4. Análise de Regressão e Validação
- Adicionar produtos com e sem promoção ao carrinho do catálogo.
- Verificar que os termômetros de Atacado e Frete Grátis aparecem em negrito, com fonte legível, cor preta no tema claro, sem a badge `-R$ 6.00` e sem porcentagem duplicada.
- Confirmar que o resumo inferior exibe apenas `Subtotal`, `Desconto Cupom` (se houver cupom ativo), `Forma de Entrega` e `Total do Pedido`.

---

## 8. Hierarquia e Cores dos Botões no Modal de Pedido Concluído

### 8.1. Mapeamento de Arquivos
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx) (linhas 2894–2986)

### 8.2. Diagnóstico da Causa Raiz
- Em `CatalogoPublico.tsx` (linha 2944), o botão "Pagar com Mercado Pago" utiliza `bg-sky-600 hover:bg-sky-500 text-white` (azul genérico).
- Na linha 2966, o botão "Enviar Resumo no WhatsApp da Loja" utiliza `bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg` (verde sólido chamativo), competindo visualmente com a ação primária de pagamento.

### 8.3. Plano de Mudança Passo a Passo
1. Em `src/components/CatalogoPublico.tsx` (linhas 2940–2949):
   - Estilizar o botão **"Pagar com Mercado Pago"** com o amarelo oficial do Mercado Pago (`#FFE600`), hover `#F5DC00`, tipografia escura de alto contraste (`text-slate-950 font-black`), tornando-o o único botão de destaque forte no modal:
     ```tsx
     className="w-full py-3.5 rounded-2xl bg-[#FFE600] hover:bg-[#F5DC00] text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-400/20 transition cursor-pointer border border-[#E6CF00]"
     ```
2. Em `src/components/CatalogoPublico.tsx` (linhas 2951–2983):
   - Padronizar o botão **"Enviar Resumo no WhatsApp da Loja"** como botão neutro/secundário, exatamente no mesmo padrão visual dos botões **"Acompanhar Pedido"** e **"Voltar ao Catálogo"**:
     - No Tema Claro: `bg-[#F3F4F6] hover:bg-slate-200 text-slate-900 border border-slate-200`
     - No Tema Escuro: `bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700`
     - Raio e espaçamento idênticos: `w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer`.
3. Adequar também o card container do modal `pedidoConcluidoModal` (linha 2896) e o box de instruções (linha 2914) para respeitar `isDark` no tema claro (`bg-white border-slate-200 text-slate-900` e `bg-slate-50 border-slate-200 text-slate-700`).

### 8.4. Análise de Regressão e Validação
- Concluir um pedido no catálogo online com Mercado Pago ativo e verificar o modal "Pedido #... Enviado!".
- Confirmar que "Pagar com Mercado Pago" se destaca em amarelo `#FFE600` com texto escuro e que os 3 botões abaixo ("Acompanhar Pedido", "Enviar Resumo no WhatsApp da Loja" e "Voltar ao Catálogo") possuem hierarquia secundária neutra e uniforme.

---

## 9. Tratamento de Cancelamento no Checkout do Mercado Pago (Loop/Loading)

### 9.1. Mapeamento de Arquivos
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx) (linhas 1590–1617)
- [`src/index.css`](file:///c:/Users/User/Documents/HUBI/src/index.css)

### 9.2. Diagnóstico da Causa Raiz
- Em `CatalogoPublico.tsx` (linhas 1602–1607), `handleAbrirCheckoutMP` instancia `new MP_SDK(publicKey.trim(), { locale: 'pt-BR' })` e chama:
  ```ts
  mp.checkout({
    preference: { id: pedidoConcluidoModal.preferenceId },
    autoOpen: true,
  });
  ```
- O SDK v2 do Mercado Pago (`https://sdk.mercadopago.com/js/v2`) injeta um overlay/iframe e um container de spinner (`.mp-mercadopago-checkout-wrapper` / iframe do Checkout Pro) no `document.body`. Quando o usuário fecha o modal pelo "X" (desistência/cancelamento) ou ocorre falha de carregamento do iframe, o SDK em certas versões mobile/desktop mantém o overlay/spinner ativo no DOM ou não limpa o estado de abertura, travando a interação com o modal do pedido subjacente.
- Além disso, não há callbacks/listeners configurados nem limpeza defensiva de overlays órfãos do Mercado Pago ao fechar/retornar o foco para a janela.

### 9.3. Plano de Mudança Passo a Passo
1. Em `src/components/CatalogoPublico.tsx`:
   - Adicionar estado `const [abrindoCheckoutMP, setAbrindoCheckoutMP] = useState(false);`.
   - Configurar `handleAbrirCheckoutMP` com tratamento de eventos do ciclo de vida do modal/iframe do Mercado Pago e listener de mensagens (`window.addEventListener('message', ...)` e `MutationObserver` / verificação de fechamento do iframe `.mp-mercadopago-checkout-wrapper`):
     - Ao detectar o evento de fechamento/cancelamento do iframe do Mercado Pago (mensagens de `close`, `cancel`, `mp-close` ou remoção/ocultação do iframe do MP), resetar imediatamente `setAbrindoCheckoutMP(false)` e remover do DOM quaisquer overlays/spinners residuais (`.mp-mercadopago-checkout-wrapper`, `.mercadopago-checkout-wrapper`, `iframe[src*="mercadopago"]` órfãos) que bloqueiem o clique na tela.
     - Garantir também um botão/ação de escape ou timeout de segurança caso o SDK falhe em inicializar o iframe, fazendo fallback limpo ou liberando a UI imediatamente.

### 9.4. Análise de Regressão e Validação
- Clicar em "Pagar com Mercado Pago" no modal de pedido concluído, aguardar a abertura do checkout modal e fechá-lo clicando no "X".
- Verificar que nenhum spinner fica sobreposto e que todos os botões do modal ("Pagar com Mercado Pago", "Acompanhar Pedido", "WhatsApp", "Voltar ao Catálogo") continuam 100% clicáveis e responsivos imediatamente.

---

## 10. Padronização do Modal "Meus Pedidos" (Tema Claro)

### 10.1. Mapeamento de Arquivos
- [`src/components/ModalPedidosCliente.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalPedidosCliente.tsx)
- [`src/index.css`](file:///c:/Users/User/Documents/HUBI/src/index.css)

### 10.2. Diagnóstico da Causa Raiz
- Em `src/components/ModalPedidosCliente.tsx` (linhas 120–236), o componente não utiliza `useTheme()` e possui classes escuras fixas:
  - Container do modal (linha 121): `bg-slate-900 border-2 border-slate-700/80`
  - Cabeçalho (linha 123): `bg-slate-950/70 border-slate-800`
  - Cards internos dos pedidos (linha 189): `bg-slate-950/60 border border-slate-800` (que não é sobrescrito pelo `index.css` porque `.bg-slate-950/60` não estava mapeado nas regras de `html.light`!).
  - Título do pedido (linha 193): `text-white` (que sobre fundo escuro/claro gerava contraste incorreto).
  - Badges e botões "Recibo" e "Rastrear Pedido" (linhas 215 e 226): `bg-slate-800 text-slate-200 border-slate-700`.

### 10.3. Plano de Mudança Passo a Passo
1. Em `src/components/ModalPedidosCliente.tsx`:
   - Importar e usar `const { tema } = useTheme(); const isDark = tema === 'dark';`.
   - Adequar o container principal (linha 121):
     - Claro: `bg-white border border-slate-200 text-slate-900`
     - Escuro: `bg-slate-900 border border-slate-800 text-slate-100`
   - Adequar o cabeçalho (linha 123):
     - Claro: `bg-white border-b border-slate-200` com título `text-slate-900` (`#111827`) e subtítulo `text-slate-500`.
     - Escuro: `bg-slate-900 border-b border-slate-800` com título `text-slate-100` e subtítulo `text-slate-400`.
   - Adequar os cards de cada pedido (linha 189):
     - Claro: `bg-[#F9FAFB] border border-slate-200 hover:border-slate-300 shadow-xs` com título `Pedido #...` em `text-slate-900 font-black`, data em `text-slate-500`, label `Total:` em `text-slate-600` e valor em `text-slate-900 font-extrabold`.
     - Escuro: `bg-slate-950/60 border border-slate-800 hover:border-slate-700` com textos claros.
   - Adequar os botões **"Recibo"** e **"Rastrear Pedido"** (linhas 215 e 226) e as badges de status (`getStatusBadge`, linhas 78–117) para alto contraste no tema claro (`bg-white hover:bg-slate-100 text-slate-800 border-slate-300` e `bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200`).

### 10.4. Análise de Regressão e Validação
- Abrir o modal "Meus Pedidos" no tema claro e no tema escuro.
- Verificar que no tema claro o fundo é branco puro, os cards são cinza neutro claro (`#F9FAFB`) com bordas sutis e todos os textos possuem alto contraste.

---

## 11. Correção da Rota de Rastreio Público ("Pedido não encontrado")

### 11.1. Mapeamento de Arquivos
- [`src/components/PedidoAndamentoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PedidoAndamentoPublico.tsx)
- [`src/components/ModalPedidosCliente.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalPedidosCliente.tsx)
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx)
- `supabase/migrations/` (Nova migration de ajuste de RLS para leitura pública de rastreio se necessário)

### 11.2. Diagnóstico da Causa Raiz
Existem **3 causas combinadas** que provocam o erro `"Pedido não encontrado"` ao acessar `/order-tracking/10`:
1. **Relação Inexistente na Query Principal (`PedidoAndamentoPublico.tsx`, linha 55):**
   A query faz `.select('*, cliente:clientes(*), itens:itens_pedido(*), vendedor:usuarios(*), pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*)), pedido_entregas:pedido_entregas(*)')`.
   A tabela `usuarios` **não existe** no schema do banco (a tabela correta é `usuarios_loja!pedidos_vendedor_id_fkey(*)`). O PostgREST retorna erro `PGRST200: Could not find a relationship between 'pedidos' and 'usuarios' in the schema cache`! Na linha 80 (`if (error) throw error;`), a exceção é lançada, `pedido` permanece `null` e a tela renderiza **"Pedido não encontrado"**!
2. **Colisão de `numero_pedido` entre múltiplas lojas:**
   Quando o parâmetro na URL é o número sequencial (ex.: `10`), `query.eq('numero_pedido', 10)` pode retornar mais de um registro se houver outra loja, ou falhar se não usar o `id` (UUID) único do pedido. Enviar `ped.id` (UUID) nos links de rastreio garante unicidade absoluta, mantendo o suporte a `numero_pedido` como fallback.
3. **Políticas RLS para consulta pública anônima (`anon`):**
   No catálogo online, o comprador não possui sessão autenticada no Supabase Auth (`auth.uid()` é `null`, role `anon`). Se alguma das tabelas filhas no `.select()` aninhado (`formas_pagamento`, `usuarios_loja`, `historico_pedidos`) bloquear leitura para `anon`, ou se `PedidoAndamentoPublico` não tiver o fallback resiliente que `ReciboPublico.tsx` possui (linhas 128–158), a consulta falha.

### 11.3. Plano de Mudança Passo a Passo
1. **Corrigir a query e adicionar Fallback Resiliente em `src/components/PedidoAndamentoPublico.tsx` (linhas 49–115):**
   - Substituir `vendedor:usuarios(*)` por `vendedor:usuarios_loja!pedidos_vendedor_id_fkey(*)`.
   - Implementar o mesmo padrão de busca resiliente de `ReciboPublico.tsx`: se a query com joins aninhados retornar erro ou vazio, executar busca direta em `pedidos` (`select('*')`) e buscar `itens_pedido`, `clientes`, `pagamentos_pedido`, `pedido_entregas` e `historico_pedidos` via `Promise.allSettled`, garantindo que o pedido seja sempre carregado mesmo se uma relação opcional tiver restrição de RLS.
   - Caso a busca por `numero_pedido` retorne múltiplos pedidos, ordenar por `criado_em DESC` (`limit(1)`).
2. **Padronizar os links de "Rastrear Pedido" / "Acompanhar Pedido":**
   - Em `ModalPedidosCliente.tsx` (linha 223): usar `/order-tracking/${ped.id || ped.numero_pedido}`.
   - Em `CatalogoPublico.tsx` (linhas 1568, 2929, 2953): incluir `pedidoId: pedidoCriado.id` no estado `pedidoConcluidoModal` e apontar o link para `/order-tracking/${pedidoConcluidoModal.pedidoId || pedidoConcluidoModal.numeroPedido}`.
3. **Garantir Renderização da Linha do Tempo para Pedidos Recém-Criados (`PedidoAndamentoPublico.tsx`, linhas 305–340):**
   - Mesmo que `historico_pedidos` ainda esteja vazio ou o pedido esteja com status `'pendente'` / `'aguardando_envio'`, renderizar sempre o marco inicial **"Pedido Realizado / Recebido"** com a data de criação do pedido e o status atual em destaque.
4. **Verificar/Garantir RLS de leitura pública de rastreamento:**
   - Garantir via migration idempotente que `historico_pedidos` e `pedido_entregas` permitam `SELECT` público vinculado ao acompanhamento de pedidos, sem expor dados sensíveis de outras lojas.

### 11.4. Análise de Regressão e Validação
- Clicar em "Rastrear Pedido" no modal "Meus Pedidos" (ex.: Pedido #10) e também no modal de Pedido Concluído.
- Confirmar que a página `/order-tracking/:id` abre imediatamente (tanto via UUID quanto via número sequencial `/order-tracking/10`), exibe o status correto, a linha do tempo e o recibo completo.

---

## 12. Regra de Exibição da Linha "Desconto Aplicado" no Recibo

### 12.1. Mapeamento de Arquivos
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx) (linha 1342)
- [`src/components/ModalReciboPedido.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalReciboPedido.tsx) (linhas 169–172 e 305–310)
- [`src/components/ReciboPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ReciboPublico.tsx) (linhas 205–208 e 393–399)
- [`src/components/PedidoAndamentoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PedidoAndamentoPublico.tsx) (linhas 236–245 e 536–542)
- [`src/components/pedidos/ReciboPedidoModal.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/pedidos/ReciboPedidoModal.tsx) (linhas 315–322)
- [`src/components/shipping/OrderReceiptFinancialSummary.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/shipping/OrderReceiptFinancialSummary.tsx) (linhas 95–102)
- [`src/services/printService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/printService.ts) (linhas 590–600 e geração de texto WhatsApp)

### 12.2. Diagnóstico da Causa Raiz
- **Onde o erro nasce:** Em `src/components/CatalogoPublico.tsx` (linha 1342), ao gravar o pedido vindo do catálogo online, o código faz:
  ```ts
  subtotal, // R$ 105,20 (já com preço promocional unitário aplicado nos itens!)
  subtotal_produtos: subtotal, // R$ 105,20
  valor_frete: valorFreteEfetivo, // R$ 24,87
  valor_desconto: (Number(avaliacaoCarrinho.economiaTotal || 0) + Number(descontoCupom || 0)), // R$ 6,00!
  valor_total: total, // R$ 130,07 (105,20 + 24,87)
  ```
- Como `avaliacaoCarrinho.economiaTotal` calcula a diferença entre `preco_venda_varejo` e `preco_promocional` (ex.: R$ 6,00), mas os itens (`itens_pedido`) e o `subtotal` já foram gravados pelo preço promocional unitário (somando R$ 105,20), gravar `economiaTotal` dentro de `valor_desconto` faz com que o recibo mostre:
  - Subtotal dos Produtos: R$ 105,20
  - Desconto Aplicado: - R$ 6,00
  - Frete: + R$ 24,87
  - VALOR TOTAL: R$ 130,07
- Matematicamente, $105,20 - 6,00 + 24,87$ seria $124,07$, mas o total é $130,07$, gerando a impressão de erro de soma!
- Conforme a regra de negócio estabelecida: **preço promocional cadastrado no produto (ou preço da tabela ativa do item) é apenas o preço unitário de venda daquele item e NÃO deve gerar linha de "Desconto Aplicado" global**.

### 12.3. Plano de Mudança Passo a Passo
1. **Na criação do pedido no Catálogo (`src/components/CatalogoPublico.tsx`, linha 1342):**
   - Gravar em `valor_desconto` **exclusivamente** o desconto global efetivo (cupom de desconto real):
     ```ts
     valor_desconto: Number(descontoCupom || 0),
     ```
   - Na mensagem de WhatsApp do catálogo (linha 1542), exibir linha de desconto apenas quando houver `descontoCupom > 0`.
2. **Blindagem Matemática nos Componentes de Recibo e Impressão (`ModalReciboPedido.tsx`, `ReciboPublico.tsx`, `PedidoAndamentoPublico.tsx`, `ReciboPedidoModal.tsx`, `OrderReceiptFinancialSummary.tsx` e `printService.ts`):**
   - Criar/aplicar uma função utilitária ou verificação consistente para `valorDescontoEfetivo`:
     - O desconto global exibido na linha `"Desconto Aplicado"` só deve aparecer quando houver um desconto global real que efetivamente abateu o `subtotalProdutos` para compor o `valorTotal` (ou seja, quando `(subtotalProdutos + valorFrete - valorTotal) > 0.01` ou quando `valor_desconto_cupom > 0` / desconto global aplicado no fechamento).
     - Se `Math.abs((subtotalProdutos + valorFrete) - valorTotal) < 0.05` (como nos pedidos já salvos onde `subtotal = 105,20`, `frete = 24,87` e `total = 130,07`), `valorDescontoEfetivo` será `0`, ocultando automaticamente a linha `"Desconto Aplicado: - R$ 6,00"` inclusive para os pedidos históricos já gravados no banco!

### 12.4. Análise de Regressão e Validação
- Abrir o recibo do Pedido #10 (ou qualquer pedido com item promocional de R$ 105,20 + frete de R$ 24,87 = R$ 130,07) e verificar que a linha `Desconto Aplicado: - R$ 6,00` não é mais exibida.
- Realizar uma venda com desconto global no PDV (ex.: R$ 10,00 ou 10%) ou com Cupom de Desconto no Catálogo e confirmar que, nesses casos reais, a linha `Desconto Aplicado` é exibida e a matemática `Subtotal - Desconto + Frete = Total` fecha 100%.

---

## 13. Padronização Visual Global do Tema Claro do Catálogo (Base Vender PDV)

### 13.1. Mapeamento de Arquivos
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx)
- [`src/index.css`](file:///c:/Users/User/Documents/HUBI/src/index.css)

### 13.2. Diagnóstico da Causa Raiz
- Atualmente, `CatalogoPublico.tsx` foi construído apenas com classes escuras (`bg-slate-950`, `bg-slate-900/80`, `border-slate-800`) e depende das sobrescritas genéricas de `html.light` no `src/index.css`.
- Isso gera problemas visuais no Tema Claro:
  - O fundo principal, a barra de pesquisa e os cards ficam todos brancos ou com contrastes chapados sem profundidade;
  - A barra fixa de categorias/pesquisa (`bg-slate-950/95`, linha 1978) não é capturada pelo seletor `div.bg-slate-950` do `index.css` por causa da opacidade `/95`, mantendo uma **faixa escura desconexa** no meio da tela clara!
  - O painel lateral do carrinho ("Seu Pedido") não segue a estrutura visual de superfícies do carrinho da tela **Vender (PDV)** (`PosCheckout.tsx`).

### 13.3. Plano de Mudança Passo a Passo
1. **Replicar os tokens do Tema Claro da tela Vender (`PosCheckout.tsx`) em `CatalogoPublico.tsx` usando `isDark` (`useTheme`):**
   - **Fundo Geral da Página:** Cinza suave `#F1F5F9` / `#F8FAFC` (`bg-slate-100 text-slate-900` quando `!isDark`).
   - **Header Superior:** Fundo branco puro (`bg-white/95 border-b border-slate-200 shadow-xs`), título em `text-slate-900`, botões de navegação (Vitrine, Pedidos, Favoritos, Notificações, Tema) com `bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200/80`.
   - **Barra Fixa de Pesquisa e Categorias (linha 1978):** Remover a faixa escura no modo claro aplicando `bg-slate-100/95 border-b border-slate-200/80` no tema claro, com seletor de categorias e input de busca em fundo branco (`bg-white border-2 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500`), idêntico ao PDV (`PosCheckout.tsx` linhas 2040 e 2089).
   - **Seletor de Modo de Exibição (Lista / Grade / Instaview):** Container `bg-white border-2 border-slate-300`, botão ativo em `bg-slate-900 text-white` e inativos em `text-slate-500 hover:text-slate-800`.
   - **Cards de Produtos (Lista, Grade e Instaview):** Fundo branco puro (`bg-white`), bordas suaves definidas (`border-2 border-slate-200/90 hover:border-slate-300 shadow-sm`), moldura da foto em `bg-slate-100`, título do produto em `text-slate-900 font-bold`, preço em destaque e botão de adicionar seguindo a identidade institucional (preto `#0F172A` com texto branco no tema claro, ou verde esmeralda do PDV conforme padrão).
   - **Painel Lateral do Carrinho ("Seu Pedido", linha 2455):** Alinhar à estrutura do painel direito do PDV (`bg-slate-100 border-l-2 border-slate-300`, header `bg-white border-b border-slate-200`, itens em cards brancos `bg-white border border-slate-200 shadow-xs`, rodapé de totais em `bg-white border-t border-slate-200`).

### 13.4. Análise de Regressão e Validação
- Inspecionar o Catálogo Online no Tema Claro em resoluções Desktop e Mobile.
- Comparar lado a lado com a tela **Vender (PDV)** no tema claro: validar fundo `#F1F5F9`, ausência de faixas escuras na barra de busca, cards brancos com profundidade e carrinho lateral padronizado.

---

## 14. Padronização Visual Global do Tema Escuro do Catálogo (Base Vender PDV)

### 14.1. Mapeamento de Arquivos
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx)
- [`src/index.css`](file:///c:/Users/User/Documents/HUBI/src/index.css)

### 14.2. Diagnóstico da Causa Raiz
- No tema escuro do catálogo:
  - As imagens de produtos (especialmente fotos com fundo transparente ou proporções variadas) ou containers de imagem exibem contrastes desalinhados e os cards utilizam `bg-slate-900/80` translúcido em vez do fundo escuro sólido e contínuo do PDV (`#111827` / `#1F2937` / `#0B1120`).
  - Os botões superiores do cabeçalho (Vitrine, Pedidos, Favoritos, Notificações) utilizam fundos translúcidos `bg-slate-800/80 border-slate-700/80` que diferem dos seletores escuros nítidos do PDV.
  - Preços e botões utilizavam `corTema` variável em vez da tipografia em branco puro e destaques institucionais do modo escuro.

### 14.3. Plano de Mudança Passo a Passo
1. Em `src/components/CatalogoPublico.tsx` (quando `isDark === true`):
   - **Fundo Contínuo e Cards de Produtos:** Alinhar os cards de produtos (Grade, Lista e Instaview) ao tema escuro da tela **Vender (PDV)**:
     - Container do card: `bg-[#111827] hover:bg-[#1F2937]/80 border border-slate-800 hover:border-slate-700 shadow-md`
     - Moldura integrada para as fotos: `bg-[#1F2937] border border-slate-800/60` com `object-cover` uniforme, eliminando qualquer bloco branco solto atrás das fotos.
     - Tipografia do título e preço em **branco puro (`#FFFFFF` / `text-white`)** com alto contraste.
   - **Botões Superiores do Header e Barra de Pesquisa:**
     - Substituir os fundos translúcidos por seletores escuros sólidos seguindo o PDV (`bg-[#111827] hover:bg-[#1F2937] text-white border border-slate-700`).
     - Inputs de busca e dropdown de categorias no modo escuro com `bg-[#111827] border border-slate-700 text-white placeholder:text-slate-400 focus:border-emerald-500`.
   - **Painel Lateral do Carrinho ("Seu Pedido") no Tema Escuro:**
     - Container `bg-[#0B1120] border-l border-slate-800`, cards dos itens em `bg-[#111827] border border-slate-800`, textos em branco puro (`text-white`) e resumo financeiro nítido.

### 14.4. Análise de Regressão e Validação
- Alternar para o Tema Escuro no Catálogo Online (via novo botão Sol/Lua do header) e validar os 3 modos de exibição (Grade, Lista, Instaview).
- Confirmar ausência de blocos brancos soltos nas fotos, tipografia em branco puro, botões do topo alinhados ao PDV e contraste impecável no carrinho lateral e modais.

---

## Matriz Resumo de Arquivos Impactados

| Arquivo | Itens Atendidos |
| :--- | :--- |
| `src/components/ModalSeletorDataOperacao.tsx` | Item 1 |
| `src/components/FinancasCaixa.tsx` | Item 2 |
| `src/components/CatalogoPublico.tsx` | Itens 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14 |
| `src/components/ConfiguracaoCatalogo.tsx` | Item 5 |
| `src/components/ConfiguracaoCatalogoMobile.tsx` | Item 5 |
| `src/components/shipping/ShippingFulfillmentSelector.tsx` | Item 6 |
| `src/components/ModalPedidosCliente.tsx` | Itens 10, 11 |
| `src/components/PedidoAndamentoPublico.tsx` | Itens 11, 12 |
| `src/components/ModalReciboPedido.tsx` | Item 12 |
| `src/components/ReciboPublico.tsx` | Item 12 |
| `src/components/pedidos/ReciboPedidoModal.tsx` | Item 12 |
| `src/components/shipping/OrderReceiptFinancialSummary.tsx` | Item 12 |
| `src/services/printService.ts` | Item 12 |
| `src/index.css` | Itens 1, 9, 10, 13, 14 |
