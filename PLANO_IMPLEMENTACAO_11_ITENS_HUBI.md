# 📋 PLANO DE IMPLEMENTAÇÃO TÉCNICO E DETALHADO — 11 ITENS CRÍTICOS (HUBI)

**Data de Elaboração:** 23/10/2026  
**Status:** Aguardando Aprovação Formal para Execução  
**Governança Aplicada:** `diff-patch-only` | `supabase-rls-guard` (`.eq('loja_id', loja.id)`) | `pii-leak-detector` | `anti-jsonb-linter`

---

## 1. MAPEAMENTO DE ARQUIVOS E COMPONENTES

Abaixo está a relação exata de todos os arquivos do repositório que serão modificados para atender aos 11 itens mapeados, com a indicação precisa de suas funções e intervalos de linhas atuais:

| Item | Componente / Serviço | Caminho do Arquivo | Intervalo / Trecho Alvo |
| :--- | :--- | :--- | :--- |
| **1 & 2** | Cabeçalho e Barra Superior | [`src/components/layout/AppLayout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/layout/AppLayout.tsx) | Linhas `420` (remoção da tarja/widget flutuante) e `472-495` (slot superior esquerdo do header). |
| **1 & 2** | Modal de Assinatura e Checkout | [`src/components/assinatura/TelaBloqueioAssinatura.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/assinatura/TelaBloqueioAssinatura.tsx) | Linhas `21-36` (adaptação para suporte a abertura manual sob demanda com botão de fechar quando em trial). |
| **1 & 2** | Descontinuação do Widget Arrastável | [`src/components/assinatura/BannerAssinaturaTop.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/assinatura/BannerAssinaturaTop.tsx) | Descontinuação do card flutuante e do listener de drag and drop. |
| **3** | Contexto do Carrinho e Rascunho | [`src/contexts/CartContext.tsx`](file:///c:/Users/User/Documents/HUBI/src/contexts/CartContext.tsx) | Linhas `113-146` (re-hidratação com chave multi-tenant) e `148-191` (auto-save isolado por `lojaId` + `usuarioId`). |
| **4** | Autenticação e Resolução de Nome | [`src/contexts/AuthContext.tsx`](file:///c:/Users/User/Documents/HUBI/src/contexts/AuthContext.tsx) | Linhas `108-198` (`carregarLoja`), `286-342` (`selecionarLoja`) e `781-801` (`adicionarNovaFilial`). |
| **4** | Menu de Perfil no Cabeçalho | [`src/components/layout/AppLayout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/layout/AppLayout.tsx) | Linhas `570-602` (exibição do nome real no botão e dropdown). |
| **5** | Dropdown de Tabela de Preço | [`src/components/ModalNovoCliente.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalNovoCliente.tsx) | Linhas `1043-1060` (renderização dinâmica baseada em `loja.permite_atacado` e `loja.permite_distribuidor`). |
| **6** | Persistência da Caderneta | [`src/components/ConfiguracoesLoja.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ConfiguracoesLoja.tsx) | Linhas `955-956` (hidratação), `1383-1384` (update em `lojas`) e `1468-1472` (sincronização de estado). |
| **7** | Limpeza de Botões Redundantes | [`src/components/ConfiguracoesLoja.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ConfiguracoesLoja.tsx) | Linhas `2440-2520` (eliminação do bloco duplicado) e `3148-3180` / `3620-3658` (unificação da barra de ações). |
| **8** | Regras Comerciais Mutuamente Exclusivas | [`src/components/ConfiguracoesLoja.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ConfiguracoesLoja.tsx) | Linhas `3305-3410` (Atacado) e `3475-3595` (Distribuidor) transformados em 3 opções mutuamente exclusivas via Radio. |
| **8** | Motor de Precificação e Termômetros | [`src/services/pricingEngine.ts`](file:///c:/Users/User/Documents/HUBI/src/services/pricingEngine.ts) | Linhas `120-180` (ocultação de termômetro global no modo SKU e cálculo individual por item). |
| **9** | Estilização do Subcard de Caderneta | [`src/components/PosCheckout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckout.tsx) | Linhas `3355-3395` (remoção total dos tons âmbar/amarelo, adoção de `bg-slate-50` / `border-slate-200` / texto slate/emerald). |
| **9** | Padronização no Modal de Fechamento | [`src/components/ModalPagamentoFechamento.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/ModalPagamentoFechamento.tsx) | Linhas `1095-1135` (harmonização com a paleta neutra). |
| **10** | Resolução da Forma de Pagamento | [`src/services/syncService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/syncService.ts) | Linhas `46-72` (`resolverFormaPagamentoId` com tratamento seguro de constraint para `'caderneta'` / `'outro'`). |
| **11** | Atomicidade e Prevenção de Vendas Órfãs | [`src/components/PosCheckout.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/PosCheckout.tsx) | Linhas `1380-1440` (`salvarComoPendenteComPagamento`: pré-resolução das formas e rollback compensatório no `catch`). |
| **11** | Gravação de Vendas com Transação Segura | [`src/services/vendaService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/vendaService.ts) | Linhas `348-405` (`gravarVendaSupabase`: pré-validação de todas as formas de pagamento antes do insert em `pedidos`). |

---

## 2. ARQUITETURA DE ESTADO E DADOS

### 2.1. Isolamento Multi-Tenancy do Carrinho de Vendas (`CartContext.tsx`)
- **Problema Diagnosticado:** A persistência local utilizava a chave genérica `hubi_pos_cart_draft_${loja.id}`. Ao alternar de loja (ex: HOTAMAZON para Mercadinho Itália), se a segunda loja não possuísse rascunho anterior salvo, o hook de leitura não limpava o estado em memória (`itens`, `pedidoEmEdicao`, `clienteSelecionado`). Imediatamente a seguir, o hook de auto-save era acionado pelo novo `loja.id`, gravando os itens e o pedido em edição da loja A dentro da chave da loja B.
- **Solução Arquitetural:**
  1. **Tupla de Isolamento:** A chave de armazenamento passa a ser estritamente:
     `const draftKey = 'hubi_cart_' + loja.id + '_' + (usuario?.id || 'anon');`
  2. **Ciclo de Troca de Tenant:**
     - Criar uma referência de rastreamento `contextoAtivoRef.current = loja.id + '_' + (usuario?.id || 'anon')`.
     - Ao detectar alteração em `loja.id` ou `usuario.id`:
       - Marcar `isHydrated = false`;
       - Limpar imediatamente todos os estados em memória (`setItens([])`, `setClienteSelecionadoState(null)`, `setPedidoEmEdicao(null)`, `setSnapshotPedidoOriginal(null)`, `setDescontoState(0)`, `setDescontoPercentualState(0)`, `setTaxaEntregaState(0)`, `setEnderecoEntrega(null)`, `setDadosEndereco(null)`);
       - Buscar o rascunho correspondente à nova tupla no `localStorage`;
       - Filtrar e validar rigorosamente se os itens recuperados possuem `item.produto.loja_id === loja.id` e `pedidoEmEdicao?.loja_id === loja.id` antes de popular a memória;
       - Finalizar marcando `isHydrated = true` para aquela tupla específica.
  3. **Guarda de Salvamento:** O efeito de auto-save só executa se `isHydrated === true` E se o contexto atual conferir exatamente com a tupla em memória, impedindo qualquer vazamento cruzado.

### 2.2. Resolução do Nome Real do Usuário (`AuthContext.tsx` e `AppLayout.tsx`)
- **Problema Diagnosticado:** Ao criar ou trocar para filiais ("mercadinho italia"), `usuarios_loja` foi inicializado com `nome_completo: 'Proprietário'`. O header então priorizava essa string cadastrada em vez do nome real do usuário autenticado no Supabase.
- **Solução Arquitetural:**
  1. Em `AuthContext.tsx`, criar a função auxiliar `obterNomeRealUsuario(authUser, uLoja, lojasDisponiveis)`:
     - Verifica se `uLoja.nome_completo` é genérico (nulo, vazio, `'Proprietário'`, `'Operador'` ou `'Admin'`);
     - Em caso positivo, busca o nome real em:
       * Metadados da sessão Auth: `authUser.user_metadata?.full_name || authUser.user_metadata?.name`;
       * Outro registro do mesmo usuário (`usuario_auth_id` ou `email`) nas demais lojas do conglomerado onde haja nome real (ex: `"LUIZ AUGUSTO"`);
     - Se encontrado um nome real válido, atualiza assincronamente a tabela `usuarios_loja` (`update({ nome_completo: nomeReal })`) e atualiza o estado local `setUsuario`.
  2. No `AppLayout.tsx`, caso `usuario?.nome_completo` ainda seja genérico, exibir em fallback o nome resolvido da sessão Auth, jamais o cargo bruto.

### 2.3. Correção de Erro HTTP 400 ao Gravar Caderneta e Atomicidade (`SyncService.ts`, `PosCheckout.tsx` e `vendaService.ts`)
- **Problema Diagnosticado:** A tabela `public.formas_pagamento` possui uma constraint de verificação no banco de dados: `CHECK (tipo IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'fiado', 'outro'))`. Ao selecionar Caderneta no PDV, o serviço `resolverFormaPagamentoId` tentava inserir `{ tipo: 'caderneta' }`, o PostgREST rejeitava com HTTP 400 e lançava exceção. Como a inserção da venda pai em `pedidos` ocorria **antes** de resolver os pagamentos, a venda #23/24 ficava gravada como órfã, sem itens nem pagamentos.
- **Solução Arquitetural:**
  1. **Ajuste em `SyncService.resolverFormaPagamentoId`:**
     - Ao buscar forma de pagamento por tipo `caderneta`, consulta `tipo = 'caderneta'` ou `tipo IN ('outro', 'outros')` com nome contendo `'Caderneta'`.
     - Caso precise criar a forma padrão para a loja:
       * Tenta primeiro inserir com `tipo: 'caderneta'`.
       * Em caso de erro 400 / check constraint violation, realiza fallback automático transparente inserindo com `tipo: 'outro'`, `nome: 'Caderneta de Mercadinho'`, garantindo compatibilidade total e zero falhas de rede.
  2. **Pré-Resolução de Pagamentos (Inversão de Dependência):**
     - Tanto em `PosCheckout.tsx` (`salvarComoPendenteComPagamento` e `handleFinalizarVenda`) quanto em `VendaService.gravarVendaSupabase`:
       * Executar a validação e resolução de todas as formas de pagamento (`resolverFormaPagamentoId`) **antes** de efetuar qualquer `insert` na tabela `pedidos`.
  3. **Rollback Compensatório no `catch`:**
     - Se a inserção de itens ou pagamentos falhar após a criação do cabeçalho em `pedidos`:
       * O bloco `catch` executa imediatamente um delete compensatório do `pedidoIdCriado` (`supabase.from('pedidos').delete().eq('id', pedidoIdCriado)`), impedindo vendas órfãs ou duplicadas no banco.
  4. **DDL de Atualização do Schema (Recomendado):**
     - Disponibilizar migration SQL para expandir a constraint:
       `ALTER TABLE public.formas_pagamento DROP CONSTRAINT IF EXISTS formas_pagamento_tipo_check;`
       `ALTER TABLE public.formas_pagamento ADD CONSTRAINT formas_pagamento_tipo_check CHECK (tipo IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'fiado', 'outro', 'outros', 'caderneta'));`

---

## 3. ESPECIFICAÇÃO DE UI/UX

### 3.1. Novo Informativo de Trial Fixo no Canto Superior Esquerdo (`AppLayout.tsx`)
- **Descontinuação do Widget Arrastável:**
  - Remover completamente o container flutuante (`data-drag-container="true"`), os hooks de arrasto (mouse/touch) e o componente `<BannerAssinaturaTop />` do fluxo livre.
- **Alocação no Slot Superior Esquerdo:**
  - Localizado diretamente no container de identificação da loja (`<div className="flex items-center gap-3 shrink-0 w-64 lg:w-72">`):
    - **Cenário A: Assinatura Ativa (Anuidade Paga):**
      * Mantém o avatar da loja, nome fantasia e a badge verde pulsante `"CONECTADO"`.
    - **Cenário B: Período de Degustação / Trial:**
      * Mantém o avatar da loja e o nome fantasia para identificação clara da unidade ativa;
      * Substitui a linha `"CONECTADO"` por uma estrutura compacta em duas linhas:
        1. Linha 1: Ícone `Sparkles` âmbar/esmeralda + texto em negrito `"Restam X dias gratuitos"` (onde `X` é dinâmico via `diasRestantesTrial`);
        2. Linha 2: Texto discreto `"Garanta seu plano por apenas R$ 49,90/mês"`;
      * Botão compacto integrado:
        - Estilo: `bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] px-2.5 py-1 rounded-lg shadow-sm`;
        - Rótulo: `"Assinar"`;
        - Ação: Dispara abertura do modal oficial de planos (`TelaBloqueioAssinatura` / `ModalAssinaturaPlano`) e conexão ao Mercado Pago.

### 3.2. Resgate do Modal de Assinatura e Integração ao Mercado Pago
- **Comportamento do Modal:**
  - Reaproveitar o componente homologado [`TelaBloqueioAssinatura.tsx`](file:///c:/Users/User/Documents/HUBI/src/components/assinatura/TelaBloqueioAssinatura.tsx), estendendo-o para aceitar a prop `aberturaManual?: boolean` e callback `onFechar?: () => void`.
  - Quando aberto manualmente via clique em "Assinar":
    * Exibe o card detalhado do **Plano Anual HUBI** (R$ 49,90/mês — faturado em 12x no cartão ou Pix), a lista de benefícios inclusos e o botão primário de pagamento;
    * Disponibiliza botão de fechar (`X` no topo e botão secundário *"Continuar no período gratuito"*), pois a loja não está bloqueada;
    * Conecta o clique do botão diretamente à rotina `iniciarCheckoutAssinatura()`, exibindo o spinner de carregamento e redirecionando para a preferência oficial do Mercado Pago gerada pela Edge Function `hubi-criar-assinatura-mp`.

### 3.3. Padronização Visual do Bloco "Caderneta Mensal" no PDV (`PosCheckout.tsx` e `ModalPagamentoFechamento.tsx`)
- **Problema Visual:** O card atualmente exibe fundo amarelo desbotado (`bg-amber-500/10` / `bg-amber-950/30`), borda âmbar (`border-amber-500/30`) e textos marrom/âmbar, destoando da linguagem visual sóbria do HUBI.
- **Novo Padrão Visual (Idêntico ao Card de Totais do PDV):**
  - **Fundo:** Neutro suave (`bg-slate-50` no tema claro / `bg-slate-900` no tema escuro);
  - **Bordas:** Sutil e elegante (`border border-slate-200` no tema claro / `border-slate-800` no escuro);
  - **Cabeçalho:** Ícone `BookOpen` em esmeralda discreto (`text-emerald-500`), título `"Caderneta de Mercadinho:"` e nome do cliente em destaque neutro (`text-slate-800` / `text-slate-100`);
  - **Linhas Informativas:** Textos secundários em slate (`text-slate-500` / `text-slate-400`), valores destacados em esmeralda (`text-emerald-600` / `text-emerald-400`) e data de vencimento em tipografia limpa;
  - **Alerta de Limite Excedido:** Exibido em vermelho puro (`text-rose-500` com borda `border-rose-200` / `border-rose-900/40`), eliminando qualquer tom amarelado.

### 3.4. Unificação e Higienização da Tela "Tipos de Venda" (`ConfiguracoesLoja.tsx`)
- **Remoção de Duplicidades:**
  - Excluir o bloco duplicado nas linhas `2440-2520` (versão mobile legada que renderizava formulário paralelo).
  - Remover botões de salvar redundantes: manter rigorosamente **uma única barra de ações superior/inferior coesa** com botões `"Voltar"` e `"Salvar Tipos de Venda"`.
- **Reformulação dos Critérios Comerciais (Radio Buttons Mutuamente Exclusivos):**
  - Nos cards de **Atacado** e **Distribuidor**, substituir a coexistência de campos por um seletor de 3 opções mutuamente exclusivas via Radio:
    1. **Opção 1 — Por Valor Total da Compra (R$):**
       - Ex: "Ativar atacado a partir de R$ 300,00 no total do pedido".
    2. **Opção 2 — Por Quantidade Global de Peças (Grade Livre / Sortida):**
       - Ex: "Ativar atacado a partir de 6 peças no carrinho (produtos variados)".
    3. **Opção 3 — Por Quantidade Mínima por Produto/SKU (Modelo Atacarejo):**
       - Ex: "Ativar atacado apenas quando o cliente atingir o mínimo específico daquele SKU (ex: 6 un do mesmo refrigerante)".
  - **Impacto no PDV e Carrinho:**
    - Se a loja estiver no modo SKU (Opção 3): o termômetro de volume global do carrinho é ocultado, e o selo de preço atacado é aplicado e sinalizado diretamente na linha de cada produto assim que a quantidade dele atingir a meta individual.

### 3.5. Filtro Dinâmico de Tabelas de Preço no Cadastro de Clientes (`ModalNovoCliente.tsx`)
- No dropdown `"Tabela de Preço Padrão"`:
  - Opção `"Varejo (Preço Normal)"`: Sempre presente (padrão do sistema).
  - Opção `"Atacado"`: Renderizada apenas se `loja?.permite_atacado !== false` e `tiposVendaAtivos.atacado !== false`.
  - Opção `"Autoatacado / Distribuidor"`: Renderizada apenas se `loja?.permite_distribuidor !== false` e `tiposVendaAtivos.distribuidor !== false`.

---

## 4. FASES SEQUENCIAIS DE EXECUÇÃO

A implementação seguirá uma ordem lógica com dependências encadeadas e validação contínua:

### Fase 1: Governança de Dados, RLS e Multi-Tenancy (Itens 3, 4 e 6)
1. **Carrinho PDV:** Implementar o isolamento por tupla `hubi_cart_${lojaId}_${usuarioId}` no `CartContext.tsx`, com esvaziamento imediato de memória e trava de auto-save durante a transição de loja.
2. **Resolução de Usuário:** Atualizar `AuthContext.tsx` e `AppLayout.tsx` para sincronizar e exibir o nome real do usuário autenticado, eliminando o fallback `'Proprietário'`.
3. **Persistência de Caderneta:** Auditar mutações em `ConfiguracoesLoja.tsx`, garantindo que `caderneta_ativa` e `dia_vencimento_padrao_caderneta` sejam salvos de forma atômica e reflitam no objeto global `loja`.

### Fase 2: Atomicidade de Vendas e Resolução de Formas de Pagamento (Itens 10 e 11)
1. **Resolução de Pagamentos:** Adequar `SyncService.resolverFormaPagamentoId` para mapear/inserir `caderneta` com fallback resiliente para `tipo: 'outro'`, prevenindo erro HTTP 400.
2. **Atomicidade no PDV:** Refatorar `salvarComoPendenteComPagamento` em `PosCheckout.tsx` e `gravarVendaSupabase` em `vendaService.ts` para pré-resolver todas as formas de pagamento antes da criação do pedido e aplicar rollback compensatório em caso de falha.

### Fase 3: Reformulação de UI e Experiência do Header / Assinatura (Itens 1 e 2)
1. **Descontinuação do Widget Arrastável:** Remover `BannerAssinaturaTop.tsx` e a mecânica flutuante.
2. **Header Lateral Esquerdo:** Integrar o informativo de trial diretamente no slot esquerdo do `AppLayout.tsx`, abaixo do nome da loja ativa.
3. **Modal de Assinatura:** Adaptar `TelaBloqueioAssinatura.tsx` para abertura manual via botão "Assinar", com integração ao checkout do Mercado Pago e opção de fechar.

### Fase 4: Refinamento de Configurações Comerciais e PDV (Itens 5, 7, 8 e 9)
1. **Cadastro de Clientes:** Aplicar o filtro dinâmico de tabelas de preço ativas no `ModalNovoCliente.tsx`.
2. **Tipos de Venda:** Higienizar `ConfiguracoesLoja.tsx`, removendo blocos e botões duplicados e implementando os 3 Radio Buttons mutuamente exclusivos (Valor, Qtd Global, Mín por SKU).
3. **Motor de Precificação:** Ajustar `pricingEngine.ts` para respeitar a modalidade SKU sem conflitos no termômetro do carrinho.
4. **Padronização Visual:** Harmonizar o subcard de Caderneta em `PosCheckout.tsx` e `ModalPagamentoFechamento.tsx` para a paleta neutra Slate/Emerald.

### Fase 5: Compilação Estática e Roteiro de Testes
1. Executar `npm run build` (`tsc && vite build`) para garantir zero erros de tipagem TypeScript.
2. **Roteiro de Testes Funcionais:**
   - Alternar entre HOTAMAZON e Mercadinho Itália e verificar que o carrinho e pedidos em edição não vazam;
   - Verificar que o nome "LUIZ AUGUSTO" permanece no header em ambas as lojas;
   - Realizar venda no PDV selecionando Caderneta e constatar que a venda e os pagamentos gravam com sucesso, sem erros 400 nem pedidos órfãos duplicados;
   - Testar o clique no botão "Assinar" do header e validar a abertura do modal comercial;
   - Testar desativação de Atacado em Configurações e conferir que a opção desaparece do cadastro de clientes.
