# Plano de Implementação: Ajustes no Catálogo Online (Carrinho, Rubi IA, Modais de Autenticação e Navegação)

> **Data:** 20/10/2026  
> **Escopo:** Experiência do Carrinho, Limpeza do Header da Rubi IA, Fechamento de Modais/Dropdown (`Click Outside` & `Esc`), Desbloqueio Pós-Logout e Padronização Visual dos Modais de Conta/Login.  
> **Diretrizes de Governança:** Conformidade estrita com `diff-patch-only`, suporte completo a Tema Claro/Escuro e preservação dos fluxos de autenticação do cliente.

---

## 📋 Visão Geral dos 4 Pontos Críticos

| # | Módulo | Problema Identificado | Solução Arquitetada |
| :- | :--- | :--- | :--- |
| **1** | **Catálogo Online (Drawer do Carrinho)** | Botão principal tem texto longo ("Finalizar e Enviar Pedido") ocupando 100% da largura, e falta um botão explícito para fechar o drawer e continuar comprando sem caçar o "X" no topo. | Renomear CTA principal para **"Finalizar Pedido"** e adicionar botão secundário **"Continuar Comprando"** no rodapé do drawer (lado a lado ou empilhado com proporção equilibrada), fechando o drawer ao clicar. |
| **2** | **Catálogo Online (Rubi IA)** | O botão de Viva-Voz no cabeçalho superior direito da janela da Rubi IA ficou redundante e polui a barra de título, já que agora existe o botão em destaque no corpo da conversa. | Remover completamente o botão de Viva-Voz do cabeçalho superior (`ChatRubiCatalogo.tsx`), mantendo exclusivamente o botão **"🎙️ Viva-Voz (tipo Alexa)"** posicionado ao lado de `"🔊 Ouvir resposta"` junto às mensagens da Rubi. |
| **3** | **Catálogo Online (Dropdown de Perfil & Modais de Login/Conta)** | 1) Dropdown do usuário no topo não fecha ao clicar fora.<br>2) Ao clicar em "Sair da Conta" ou abrir "Área do Cliente" / "Entrar na Minha Conta", o bloqueio `if (!clienteSelecionado)` na linha 1795 de `CatalogoPublico.tsx` forçava `bloqueioObrigatorio={true}` sem `onClose`, ocultando o botão "X" e travando o usuário fora da vitrine.<br>3) No tema escuro, `corTema` valia `#FFFFFF` (`CatalogoPublico.tsx:1053`), aplicando `style={{ backgroundColor: '#FFFFFF' }}` com `text-white` nos botões "Criar com Celular" e "Acessar Minha Conta" (texto branco sobre fundo branco). | 1) Adicionar detecção de clique fora (`useRef` + `mousedown`) e tecla `Escape` no dropdown de perfil.<br>2) Remover o bloqueio estrito de vitrine (`if (!clienteSelecionado)`) que aprisionava o cliente após logout, permitindo navegar na vitrine livremente e abrindo o `ModalOnboardingCliente` sob demanda com `onClose`, botão **"X"** visível, clique no backdrop e tecla `Escape`.<br>3) Substituir o `style={{ backgroundColor: corTema }}` quebrado nos botões de ação por classes padronizadas do Design System (`bg-emerald-600 hover:bg-emerald-500 text-white`) e adequar o modal aos temas Claro e Escuro. |
| **4** | **Catálogo Online (Modal "Área do Cliente")** | O divisor `"OU CONTINUE COM"` está visualmente desalinhado e gera poluição entre os botões de criação de conta e o link de login. | Remover completamente o bloco divisor `"ou continue com"`, mantendo a sequência limpa e direta: **"Criar com Celular"**, **"Criar com Google"**, **"Criar com Apple"** e o link **"Já tenho conta? Fazer login"**. |

---

## 🛠️ Detalhamento Técnico por Item

---

### ITEM 1: Ações e Navegabilidade no Rodapé do Carrinho (Catálogo Online)

#### 1.1. Arquivos Afetados
- `src/components/CatalogoPublico.tsx` (Rodapé do Drawer do Carrinho, aprox. linhas `2963-2975`, e backdrop do Drawer na linha `2560`).

#### 1.2. Estratégia de Implementação
1. **Fechamento também pelo Backdrop do Drawer:**
   - Na div de overlay do drawer (`fixed inset-0 bg-black/80...` na linha 2560), adicionar `onClick={(e) => { if (e.target === e.currentTarget) setDrawerCarrinhoAberto(false); }}` para que clicar fora da gaveta lateral também feche o carrinho.
2. **Layout de Dupla Ação no Rodapé (`CatalogoPublico.tsx` linhas `2964-2973`):**
   - Substituir o botão único de largura total por um container flexível/grid (`grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1`):
     - **Botão Secundário ("Continuar Comprando"):**
       - Fecha o drawer (`onClick={() => setDrawerCarrinhoAberto(false)}`) e devolve o foco imediato à vitrine.
       - Estilização responsiva e com contraste nos temas claro e escuro:
         `w-full py-3.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer active:scale-98`
     - **Botão Principal ("Finalizar Pedido"):**
       - Rótulo curto e direto: `enviandoPedido ? 'Enviando...' : aceitaPedidos ? 'Finalizar Pedido' : 'Enviar Consulta'`.
       - Estilização Esmeralda de destaque:
         `w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer active:scale-98`

---

### ITEM 2: Limpeza da Barra Superior e Destaque Único do Viva-Voz na Rubi IA

#### 2.1. Arquivos Afetados
- `src/components/ChatRubiCatalogo.tsx` (Cabeçalho do modal/janela da Rubi IA, linhas `930-954`).

#### 2.2. Estratégia de Implementação
1. **Remoção do Controle Redundante no Header:**
   - Remover o botão de `alternarModoWakeWord` das linhas `932-953` dentro do cabeçalho superior (`{/* Botão de Modo Sempre Atenta (Wake Word Rubi) */}`), deixando no header apenas os ícones de controle de janela/áudio geral (Volume TTS, Expandir/Restaurar e Fechar `X`).
2. **Preservação do Botão Principal no Corpo da Conversa:**
   - Manter intacto o botão **"🎙️ Viva-Voz (tipo Alexa)"** / **"🟢 Viva-Voz Ativo (tipo Alexa)"** posicionado ao lado de **"🔊 Ouvir resposta"** abaixo das mensagens da Rubi (`linhas 1070-1107`), garantindo destaque visual único e feedback de microfone ativo (`animate-pulse` + anel esmeralda).

---

### ITEM 3: Experiência de Modais de Perfil, Login e Fechamento (`Click Outside` e `Escape`)

#### 3.1. Diagnóstico da Causa Raiz
1. **Aprisionamento ao Sair da Conta ou Abrir Modal de Login:**
   - Em `src/components/CatalogoPublico.tsx` (linhas `1795-1809`), existe um retorno antecipado:
     ```tsx
     if (!clienteSelecionado) {
       return (
         <div className="min-h-screen bg-slate-950 ...">
           <ModalOnboardingCliente isOpen={true} bloqueioObrigatorio={true} ... />
         </div>
       );
     }
     ```
   - Como `bloqueioObrigatorio={true}` é passado e nenhum `onClose` é fornecido:
     - Quando o usuário clica em **"Sair da Conta"**, `clienteSelecionado` vira `null` e a tela inteira da vitrine é desmontada, jogando o usuário em uma tela preta com o modal sem botão "X" e sem possibilidade de fechar para voltar à vitrine.
     - Além disso, toda a infraestrutura para visitantes navegarem na vitrine e se autenticarem apenas quando necessário (ao clicar em "Entrar", "Favoritos", "Pedidos", "Notificações" ou "Finalizar Pedido") **já existe pronta** no `CatalogoPublico.tsx` (linhas `1867`, `1885`, `1908`, `2020`, `1265`, `3153`).
2. **Botões Brancos Ilegíveis no Tema Escuro:**
   - Em `CatalogoPublico.tsx` (linha `1053`), `const corTema = isDark ? '#FFFFFF' : '#000000';` é repassado para `ModalOnboardingCliente`.
   - Em `ModalOnboardingCliente.tsx`, os botões **"Criar com Celular"** (linha 421), **"Acessar Minha Conta"** (linha 542), **"Avançar para Endereço"** (linha 639) e **"Concluir Cadastro"** (linha 808) usam `className="... text-white"` combinado com `style={{ backgroundColor: corTema }}`. No tema escuro (`corTema = '#FFFFFF'`), o botão fica com fundo branco (`#FFFFFF`) e texto branco (`text-white`), tornando o texto completamente invisível!

#### 3.2. Arquivos Afetados
- `src/components/CatalogoPublico.tsx`
- `src/components/ModalOnboardingCliente.tsx`
- `src/components/ModalPedidosCliente.tsx`
- `src/components/ModalFavoritosCliente.tsx`
- `src/components/ModalNotificacoesCliente.tsx`
- `src/components/ModalContatoClienteCatalogo.tsx`
- `src/components/ModalEnderecoClienteCatalogo.tsx`
- `src/components/ModalBuscaClienteCatalogo.tsx`

#### 3.3. Estratégia de Implementação
1. **Desbloqueio da Vitrine Pós-Logout (`CatalogoPublico.tsx`):**
   - Remover o bloco `if (!clienteSelecionado)` das linhas `1793-1809` de `CatalogoPublico.tsx`. Assim, ao entrar no catálogo ou clicar em **"Sair da Conta"**, o cliente permanece na vitrine de produtos normalmente e pode abrir/fechar os modais de login ("Entrar", "Favoritos", "Pedidos", "Finalizar Pedido") livremente sem ficar preso.
2. **Fechamento do Dropdown de Perfil ao Clicar Fora e via `Esc` (`CatalogoPublico.tsx`):**
   - Criar `const menuUsuarioRef = useRef<HTMLDivElement>(null);` envolvendo o botão de perfil e o dropdown (`linhas 1962-2018`).
   - Adicionar um `useEffect` que escuta `mousedown` (fechando `menuUsuarioAberto` se `!menuUsuarioRef.current.contains(event.target)`) e `keydown` para a tecla `Escape`.
3. **Botão "X", Clique no Backdrop e Tecla `Escape` em Todos os Modais de Conta/Autenticação:**
   - Em `ModalOnboardingCliente.tsx`:
     - Exibir sempre o botão **"X"** no canto superior direito quando `onClose` estiver presente, permitindo fechar em qualquer etapa (`boas_vindas`, `login`, `passo1_identificacao`, `passo2_endereco`).
     - Adicionar handler no container do backdrop (`onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}`).
     - Adicionar `useEffect` escutando `keydown` (`e.key === 'Escape'`) para acionar `onClose()`.
   - Aplicar a mesma proteção de clique no backdrop (`if (e.target === e.currentTarget) onClose()`) e tecla `Escape` nos modais complementares da conta do cliente (`ModalPedidosCliente.tsx`, `ModalFavoritosCliente.tsx`, `ModalNotificacoesCliente.tsx`, `ModalContatoClienteCatalogo.tsx`, `ModalEnderecoClienteCatalogo.tsx`, `ModalBuscaClienteCatalogo.tsx`) e no modal de seleção de variações (`produtoModalVariacao` em `CatalogoPublico.tsx`).
4. **Correção Definitiva de Contraste e Tema Claro/Escuro em `ModalOnboardingCliente.tsx`:**
   - Substituir o `style={{ backgroundColor: corTema }}` nos botões principais (**"Criar com Celular"**, **"Acessar Minha Conta"**, **"Avançar para Endereço"**, **"Concluir Cadastro"**) e no ícone de destaque por classes sólidas do Design System:
     `bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20`
   - Padronizar as superfícies, bordas, inputs e textos de `ModalOnboardingCliente.tsx` e `ModalNotificacoesCliente.tsx` com classes duplas `light/dark` (`bg-white dark:bg-slate-900`, `text-slate-900 dark:text-slate-100`, inputs com `bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100`), garantindo legibilidade máxima tanto no tema claro quanto no escuro.

---

### ITEM 4: Simplificação Visual do Modal de Boas-Vindas ("Área do Cliente")

#### 4.1. Arquivos Afetados
- `src/components/ModalOnboardingCliente.tsx` (Linhas `427-434`).

#### 4.2. Estratégia de Implementação
1. **Remoção do Divisor `"OU CONTINUE COM"`:**
   - Remover integralmente o bloco:
     ```tsx
     {/* Divisor Visual */}
     <div className="relative flex items-center justify-center my-3">
       <div className="border-t border-slate-800 w-full"></div>
       <span className="bg-slate-900 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
         ou continue com
       </span>
     </div>
     ```
2. **Alinhamento Direto dos Botões de Ação:**
   - Agrupar os 3 botões de criação de conta em uma pilha limpa (`<div className="space-y-2.5">`):
     1. **Criar com Celular** (`bg-emerald-600 hover:bg-emerald-500 text-white`)
     2. **Criar com Google** (`bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-100 dark:border-slate-700`)
     3. **Criar com Apple** (`bg-slate-900 hover:bg-slate-800 text-white dark:bg-black dark:hover:bg-neutral-900 border border-slate-800 dark:border-neutral-700`)
   - Logo abaixo, manter o botão/link centralizado: **"Já tenho conta? Fazer login"** (`text-emerald-600 dark:text-emerald-400 hover:underline font-bold`).

---

## ✅ Checklist de Validação Pós-Implementação

- [ ] **Item 1:** No rodapé do carrinho, os botões **"Continuar Comprando"** e **"Finalizar Pedido"** estão visíveis, proporcionais e clicáveis; clicar em "Continuar Comprando" ou fora do drawer fecha o carrinho e retorna à vitrine.
- [ ] **Item 2:** O cabeçalho da Rubi IA não exibe mais o botão de Viva-Voz; o botão **"🎙️ Viva-Voz (tipo Alexa)"** permanece em destaque ao lado de **"🔊 Ouvir resposta"** nas mensagens da Rubi.
- [ ] **Item 3:** Clicar fora do dropdown do perfil de usuário (ou apertar `Esc`) fecha o menu; clicar em "Sair da Conta" mantém o usuário na vitrine; todos os modais de autenticação/conta possuem botão "X", fecham ao clicar no backdrop ou teclar `Esc`, e apresentam contraste legível nos temas claro e escuro.
- [ ] **Item 4:** O modal "Área do Cliente" não possui mais a linha divisória `"OU CONTINUE COM"`, exibindo os 3 botões alinhados seguidos do link de login.
- [ ] **Build & Tipagem:** `npm run build` (`tsc && vite build`) executa sem erros.
