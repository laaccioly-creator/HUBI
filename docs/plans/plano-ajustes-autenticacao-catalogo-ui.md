# Plano de Implementação: Ajustes de Autenticação, Isolamento de Sessão, Carrinho e UI no Catálogo Online

> **Data:** 20/10/2026  
> **Escopo:** 9 pontos críticos no Catálogo Online (Fluxo de Logout, Login Social, Segurança de Senhas, Proteção de Backdrop no Cadastro, Isolamento de Carrinho por Sessão, Fechamento de Detalhes ao Adicionar, Tema Claro no Carrinho/Cupom, Limpeza Visual da Gravação na Rubi IA e Padronização dos Botões dos Cards de Produtos).  
> **Diretrizes de Governança:** Conformidade estrita com `diff-patch-only`, sanitização de credenciais/PII e paridade entre Tema Claro e Tema Escuro.

---

## 📋 Visão Geral dos 9 Pontos Críticos

| # | Módulo | Problema Identificado | Solução Arquitetada |
| :- | :--- | :--- | :--- |
| **1** | **Catálogo Online (Logout)** | Clicar em "Sair da Conta" apenas altera silenciosamente o botão do topo para "Entrar", sem feedback ou abertura da tela de reautenticação/cadastro. | Em `handleLogoutCliente`, após limpar a sessão, acionar imediatamente `setModalOnboardingMotivo('geral')` e `setModalOnboardingAberto(true)` para exibir o modal "Área do Cliente". |
| **2** | **Autenticação (Modal "Entrar na Minha Conta")** | 1) Falta de botões "Entrar com Google" e "Entrar com Apple" na tela de login.<br>2) Campo de senha vem preenchido de sessões anteriores. | 1) Incluir os botões **"Entrar com Google"** e **"Entrar com Apple"** no modo `login` de `ModalOnboardingCliente.tsx`.<br>2) Resetar `loginTelefone`, `loginSenha` e `mostrarLoginSenha` ao abrir o modal ou alternar modos, adicionando `autoComplete="current-password"`. |
| **3** | **Segurança (Modal "Criar Conta • Identificação")** | Input "Crie sua Senha" vem preenchido com a senha em claro do usuário anterior, permitindo visualizar a credencial alheia. | Zerar todos os estados de formulário (`nome`, `telefone`, `senha`, `mostrarSenha`, endereço e login) no `useEffect` de abertura (`isOpen`) e na transição para `passo1_identificacao`, aplicando `autoComplete="new-password"` no input de criação de senha. |
| **4** | **UX de Cadastro (Backdrop Lock)** | Durante o preenchimento de "Criar Conta • Identificação" ou "Criar Conta • Endereço", clicar acidentalmente fora do modal fecha a janela e descarta os dados digitados. | Em `ModalOnboardingCliente.tsx`, bloquear o fechamento por clique no backdrop e pela tecla `Escape` quando `modo === 'passo1_identificacao' || modo === 'passo2_endereco'`, permitindo fechar apenas pelo botão explícito **"X"** ou voltar pela seta **"←"**. |
| **5** | **Isolamento de Dados (Carrinho por Sessão/Usuário)** | Ao sair da conta e logar/cadastrar com outro usuário, os itens do carrinho anterior permanecem no `carrinho` local e são mesclados na conta do novo usuário. | 1) No `handleLogoutCliente`, executar limpeza completa: `setCarrinho([])`, `setCupomAplicado(null)`, `setPedidoEntrega(null)`, `cartContext?.limparCarrinho()` e remover `hubi_carrinho_catalogo_${slugKey}`.<br>2) Atrelar a chave do `sessionStorage` ao ID do cliente (`hubi_carrinho_catalogo_${slugKey}_${clienteId || 'guest'}`) e substituir (não mesclar indevidamente) o carrinho ao trocar de usuário. |
| **6** | **UX de Compra (Modal de Detalhes do Produto)** | Clicar em "Adicionar ao Carrinho • R$ XX,XX" dentro do modal de detalhes adiciona o item mas mantém o modal aberto, exigindo clique extra no "X". | Em `ModalDetalhesProdutoCatalogo.tsx`, atualizar `handleAdicionar` para invocar `onClose()` imediatamente após `onAdicionarAoCarrinho(...)`, devolvendo o cliente direto para a vitrine. |
| **7** | **UI Tema Claro (Card de Cupom e Carrinho)** | No tema claro, a tarja de cupom aplicado (`bg-emerald-950/40`, `text-slate-100`) e os cards/inputs do drawer do carrinho ficam com fundo escuro pesado e baixo contraste. | Ajustar o card de cupom ativo para `bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/40` com texto `text-slate-900 dark:text-slate-100` e adequar os cards de itens e inputs de cupom/observação do drawer para `bg-slate-50 dark:bg-slate-800/60`. |
| **8** | **UI Rubi IA (Indicadores de Gravação)** | Ao ativar a escuta de voz, surge uma barra horizontal escura/avermelhada pesada acima do input ("Gravando... Fale a sua frase...") e o botão de microfone fica vermelho com glow exagerado. | 1) Remover a barra horizontal superior de gravação (`{escutandoVoz && (...)}` nas linhas `1241-1264` de `ChatRubiCatalogo.tsx`).<br>2) Substituir o estilo vermelho agressivo do botão de microfone por um estilo discreto e harmônico no padrão esmeralda/slate, mantendo apenas a barra verde superior (*"Modo Sempre Atenta ativo..."*) e o placeholder informativo no input. |
| **9** | **Design System (Botões "Detalhar" e "Adicionar" na Vitrine)** | Os botões "Detalhar" e "Adicionar" variam de cor, formato e borda entre os modos Grade, Lista e InstaView e destoam dos botões do cabeçalho. | Padronizar em todos os 3 modos (**Grade**, **Lista** e **InstaView**) e em ambos os temas (**Claro** e **Escuro**):<br>- **"Detalhar":** Estilo secundário/outline idêntico aos botões do topo (`bg-slate-100 hover:bg-slate-200 border border-slate-300/80 text-slate-900 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 dark:text-slate-100 dark:border-2 dark:border-slate-400`).<br>- **"Adicionar":** Estilo primário esmeralda (`bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 shadow-xs`). |

---

## 🛠️ Detalhamento Técnico e Mapeamento por Item

---

### ITEM 1: Fluxo de Logout e Abertura Imediata do Modal de Boas-Vindas

#### 1.1. Arquivos Afetados
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx#L389-L431) (`handleLogoutCliente`)

#### 1.2. Estratégia Técnica
- Em `handleLogoutCliente`:
  - Em vez de manter `setModalOnboardingAberto(false)`, após limpar os dados da sessão do cliente anterior e desconectar o Supabase Auth local:
    ```tsx
    setModalOnboardingMotivo('geral');
    setModalOnboardingAberto(true);
    ```
  - Isso garante que, ao clicar em **"Sair da Conta"**, o cliente receba feedback imediato visualizando o modal **"Área do Cliente"** (Boas-Vindas / Cadastro / Login), podendo entrar com outra conta, criar um novo cadastro ou fechar no `"X"` caso queira apenas espiar a vitrine como visitante.

---

### ITEM 2 & ITEM 3: Login Social no Modal "Entrar na Minha Conta" e Sanitização de Senhas no Cadastro/Login

#### 2.1. Arquivos Afetados
- [`src/components/ModalOnboardingCliente.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalOnboardingCliente.tsx)

#### 2.2. Estratégia Técnica
1. **Função Centralizada de Limpeza de Credenciais e Campos (`resetarFormularios`):**
   - Criar helper interno em `ModalOnboardingCliente.tsx`:
     ```tsx
     const limparCamposCredenciais = () => {
       setNome('');
       setTelefone('');
       setSenha('');
       setMostrarSenha(false);
       setLoginTelefone('');
       setLoginSenha('');
       setMostrarLoginSenha(false);
       setCep('');
       setLogradouro('');
       setNumero('');
       setComplemento('');
       setBairro('');
       setCidade('');
       setUf('');
       setErro(null);
     };
     ```
   - Executar `limparCamposCredenciais()` e `setModo('boas_vindas')` sempre que `isOpen` mudar para `true` (via `useEffect([isOpen])`).
   - Executar a limpeza de `senha`, `mostrarSenha`, `loginSenha` e `mostrarLoginSenha` toda vez que o usuário alternar entre `boas_vindas`, `login` e `passo1_identificacao`.
2. **Prevenção de Autofill Indevido do Navegador:**
   - No formulário `passo1_identificacao`:
     - Adicionar `autoComplete="off"` no `<form>`.
     - No input de **Crie sua Senha**: definir `autoComplete="new-password"` e `name="nova_senha_cadastro_hubi"`.
   - No formulário `login`:
     - No input de **Sua Senha**: definir `autoComplete="current-password"` e `name="senha_login_hubi"`.
3. **Inclusão dos Botões "Entrar com Google" e "Entrar com Apple" na Tela de Login (`modo === 'login'`):**
   - Abaixo do botão `"Acessar Minha Conta"` no formulário de login (`linhas 549-575`), adicionar os botões de autenticação OAuth com paridade visual:
     - **"Entrar com Google"** (acionando `handleLoginGoogle`)
     - **"Entrar com Apple"** (acionando `handleLoginApple`)
   - Seguido pelo link `"Ainda não tem conta? Cadastre-se"`.

---

### ITEM 4: Bloqueio de Fechamento por Backdrop durante o Cadastro Ativo

#### 4.1. Arquivos Afetados
- [`src/components/ModalOnboardingCliente.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalOnboardingCliente.tsx#L76-L86) e linhas `338-346`.

#### 4.2. Estratégia Técnica
- Criar flag derivada:
  ```tsx
  const emFluxoCadastroAtivo = modo === 'passo1_identificacao' || modo === 'passo2_endereco';
  ```
- **No listener de teclado (`Escape`):**
  - Se `emFluxoCadastroAtivo` for `true`, ignorar a tecla `Escape` para não descartar acidentalmente o formulário em preenchimento.
- **No `onClick` do Backdrop externo:**
  - Só disparar `onClose()` se `!bloqueioObrigatorio && !emFluxoCadastroAtivo && onClose`.
- **Intenção Explícita Preservada:**
  - O botão **"X"** no canto superior direito e a seta **"←"** de voltar no cabeçalho continuam 100% funcionais em todas as etapas.

---

### ITEM 5: Isolamento de Carrinho por Sessão/Usuário e Limpeza no Logout

#### 5.1. Arquivos Afetados
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx) (`linhas 81-115`, `301-431`, `496-574`)

#### 5.2. Estratégia Técnica
1. **Chave de Storage Isolada por Cliente:**
   - Definir chave dinâmica de persistência do carrinho na sessão:
     ```tsx
     const storageCartKey = `hubi_carrinho_catalogo_${slugKey}_${clienteSelecionado?.id || 'visitante'}`;
     ```
2. **Limpeza Total no Logout (`handleLogoutCliente`):**
   - Ao clicar em **"Sair da Conta"**, limpar todo o estado de compra em memória e no storage:
     - `setCarrinho([]);`
     - `setPedidoEntrega(null);`
     - `setCupomAplicado(null);`
     - `setDescontoCupom(0);`
     - `setFreteGratisCupom(false);`
     - `setCodigoCupomInput('');`
     - `setMensagemCupom(null);`
     - `setObservacoes('');`
     - `cartContext?.limparCarrinho();`
     - Remover do `sessionStorage` tanto `hubi_carrinho_catalogo_${slugKey}` (legado) quanto `hubi_carrinho_catalogo_${slugKey}_${clienteSelecionado?.id}` e `hubi_carrinho_catalogo_${slugKey}_visitante`.
3. **Isolamento na Troca/Entrada de Cliente (`handleSelecionarCliente` e `carregarCarrinhoRemoto`):**
   - Ao autenticar ou cadastrar um cliente em `handleSelecionarCliente(cliente)`:
     - Se havia um cliente diferente anteriormente (ou se acabou de criar conta), reiniciar `carrinhoRemotoCarregadoRef.current = false` e carregar exclusivamente os itens vinculados àquele `cliente.id` no banco (`ClienteCatalogoService.listarCarrinho`), sem herdar lixo de sessão de outro usuário.

---

### ITEM 6: Fechamento Automático do Modal de Detalhes ao Adicionar ao Carrinho

#### 6.1. Arquivos Afetados
- [`src/components/ModalDetalhesProdutoCatalogo.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalDetalhesProdutoCatalogo.tsx#L99-L115) (`handleAdicionar`)

#### 6.2. Estratégia Técnica
- Em `handleAdicionar` (`ModalDetalhesProdutoCatalogo.tsx`):
  ```tsx
  const handleAdicionar = () => {
    if (isEsgotado) return;

    if (produto.tem_variacoes && (!variacaoSelecionada || !produto.variacoes?.length)) {
      if (onAbrirModalVariacao) {
        onClose();
        onAbrirModalVariacao(produto);
      }
      return;
    }

    onAdicionarAoCarrinho(produto, variacaoSelecionada, quantidade);
    onClose();
  };
  ```
- Dessa forma, assim que o cliente clica em **"Adicionar ao Carrinho • R$ XX,XX"**, o item é inserido com a variação e quantidade escolhidas e o modal fecha imediatamente, retornando o cliente para a vitrine.

---

### ITEM 7: Ajuste Visual do Card de Cupom Ativo e Cards do Carrinho no Tema Claro

#### 7.1. Arquivos Afetados
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx#L2730-L2875) (Drawer do Carrinho)

#### 7.2. Estratégia Técnica
1. **Tarja de Cupom Ativo (`linhas 2819-2840`):**
   - Substituir `bg-emerald-950/40 border border-emerald-500/40` e textos claros fixos por classes responsivas ao tema:
     - Container: `p-2.5 bg-slate-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-500/40 rounded-xl flex items-center justify-between shadow-2xs`
     - Ícone de check: `w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-xs`
     - Código do cupom: `text-xs font-black text-slate-900 dark:text-slate-100`
     - Subtítulo do desconto: `text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 block`
     - Botão remover (`X`): `p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition text-xs cursor-pointer`
2. **Harmonia com os Demais Elementos do Drawer no Tema Claro (`linhas 2731-2855`):**
   - Cards de itens do carrinho: `bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2` com título `text-slate-900 dark:text-slate-100` e seletor de quantidade `border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900`.
   - Inputs de observações e código de cupom: `bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100`.

---

### ITEM 8: Limpeza Visual dos Indicadores de Gravação na Rubi IA

#### 8.1. Arquivos Afetados
- [`src/components/ChatRubiCatalogo.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ChatRubiCatalogo.tsx#L1240-L1295)

#### 8.2. Estratégia Técnica
1. **Remoção da Tarja Preta/Vermelha sobre o Input:**
   - Remover integralmente o bloco `{escutandoVoz && ( <div className="px-3.5 py-2 bg-gradient-to-r from-rose-950/80 via-slate-900 to-slate-950 ...">...</div> )}` das linhas `1240-1264`.
2. **Suavização do Botão de Microfone na Barra Inferior (`linhas 1277-1290`):**
   - Remover a classe vermelha agressiva (`bg-rose-600 border-rose-500 text-white animate-pulse shadow-lg shadow-rose-600/30`).
   - Substituir por um estado ativo sutil e alinhado à identidade esmeralda/slate do chat:
     ```tsx
     escutandoVoz
       ? isDark
         ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-400'
         : 'bg-emerald-50 border-emerald-300 text-emerald-700'
       : isDark
         ? 'bg-slate-900 border-slate-700 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/50'
         : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-emerald-700 hover:bg-slate-200'
     ```
   - Manter apenas a barra verde superior (`modoWakeWord`: *"Modo Sempre Atenta ativo: Diga 'Rubi, ...' para falar!"*) e o placeholder discreto dentro do campo de texto (`"Ouvindo... fale à vontade no seu ritmo"`).

---

### ITEM 9: Padronização Visual dos Botões "Detalhar" e "Adicionar" nos Cards de Produtos

#### 9.1. Arquivos Afetados
- [`src/components/CatalogoPublico.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx#L2224-L2485) (Modos **Lista**, **InstaView** e **Grade**)

#### 9.2. Estratégia Técnica
- Replicar exatamente a linguagem visual, tipografia, bordas e cores dos botões do cabeçalho superior:
  - **Botão "Detalhar" (Estilo Secundário / Outline Suave — espelhando "Pedidos" / "Favoritos" do topo):**
    - Classes unificadas:
      `bg-slate-100 hover:bg-slate-200 border border-slate-300/80 text-slate-900 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 dark:text-slate-100 dark:border-2 dark:border-slate-400 font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-xs`
    - Ícone `<Eye className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300 shrink-0" />` + texto `Detalhar` (no Modo Grade, exibir ícone + texto compacto ou manter ambos alinhados lado a lado na base do card).
  - **Botão "Adicionar" (Estilo Primário Verde Esmeralda — espelhando os CTAs principais e destaque "Vitrine"):**
    - Quando disponível (`!esgotado`):
      `bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 dark:border-2 dark:border-emerald-400 font-bold transition flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-xs active:scale-95`
    - Quando esgotado (`esgotado`):
      `bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 font-semibold flex items-center justify-center gap-1 text-xs cursor-not-allowed opacity-60`
  - **Aplicação Uniforme nos 3 Modos de Exibição:**
    1. **Modo Lista (`linhas 2224-2260`):** Botões `"Detalhar"` e `"Adicionar"` lado a lado com a nova estilização.
    2. **Modo InstaView (`linhas 2335-2372`):** Botões `"Detalhar"` e `"Adicionar"` lado a lado com a nova estilização.
    3. **Modo Grade (`linhas 2443-2486`):** Ajustar o rodapé do card em grade para acomodar uniformemente os botões `"Detalhar"` e `"Adicionar"` com a mesma identidade visual, bordas e cores em ambos os temas.

---

## ✅ Checklist de Verificação Pré-Commit

- [ ] **Item 1:** Clicar em "Sair da Conta" encerra a sessão e abre imediatamente o modal "Área do Cliente".
- [ ] **Item 2:** Modal "Entrar na Minha Conta" exibe os botões "Entrar com Google" e "Entrar com Apple" e sempre inicia com o campo de senha vazio.
- [ ] **Item 3:** Formulário "Criar Conta • Identificação" inicia com nome, telefone e senha 100% vazios e `autoComplete="new-password"`.
- [ ] **Item 4:** Nas telas de preenchimento de cadastro (`passo1_identificacao` e `passo2_endereco`), clicar fora do modal (backdrop) ou apertar `Esc` **não** fecha o modal; apenas os botões "X" e "←" fecham/voltam.
- [ ] **Item 5:** Fazer logout limpa imediatamente o carrinho local e impede que um novo usuário herde itens do usuário anterior.
- [ ] **Item 6:** Clicar em "Adicionar ao Carrinho" no modal de detalhes do produto fecha o modal automaticamente após adicionar o item.
- [ ] **Item 7:** No Tema Claro, o card de cupom aplicado e os itens do carrinho exibem fundo claro suave (`bg-slate-50`/`bg-slate-100`) e textos de alto contraste.
- [ ] **Item 8:** Na Rubi IA, a tarja preta/vermelha acima do input foi removida e o botão de microfone não fica vermelho gigante ao gravar.
- [ ] **Item 9:** Os botões "Detalhar" e "Adicionar" seguem o mesmo padrão visual nos modos Grade, Lista e InstaView, tanto no Tema Claro quanto no Tema Escuro.
