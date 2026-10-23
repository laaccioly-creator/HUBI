# 📋 PLANO DE IMPLEMENTAÇÃO TÉCNICO E DETALHADO — 5 ITENS CRÍTICOS (HUBI)

**Data de Elaboração:** 23/10/2026  
**Status:** Aguardando Aprovação Formal para Execução  
**Governança Aplicada:** `diff-patch-only` | `supabase-rls-guard` (`.eq('loja_id', loja.id)`) | `pii-leak-detector` | `anti-jsonb-linter`

---

## 1. MAPEAMENTO DE ARQUIVOS E LINHAS

Abaixo estão listados todos os componentes, contextos e serviços impactados, com a identificação cirúrgica dos intervalos de linhas analisados no código-fonte atual:

### Item 1: Opção "Caderneta de Mercadinho" ao Receber Pedido
- **[ModalPagamentoFechamento.tsx](file:///c:/Users/User/Documents/HUBI/src/components/ModalPagamentoFechamento.tsx)** (Modal principal acionado pelo botão "Receber" na Central de Pedidos em [PedidosLista.tsx](file:///c:/Users/User/Documents/HUBI/src/components/PedidosLista.tsx#L4428-L4443)):
  - **Linhas `186-192` (`FORMAS_PADRAO`):** Lista estática de fallback que hoje contempla apenas `dinheiro`, `pix`, `cartao_credito`, `cartao_debito` e `fiado` (ausência do tipo `caderneta`).
  - **Linhas `195-223` (`useEffect` / `buscarFormas`):** Consulta a tabela `formas_pagamento` filtrada por `.eq('loja_id', loja.id)` e injeta apenas `fiado` caso ausente; não injeta a forma virtual/nativa `caderneta` quando `loja.caderneta_ativa === true`.
  - **Linhas `265-283` (`clientePedidoMemo`, `clienteAptoFiado`, `formasDisponiveis`):** Calcula a elegibilidade apenas para `fiado` e filtra `formasDisponiveis` sem contemplar `fp.tipo === 'caderneta'`.
  - **Linhas `351-368` (`recarregarPedido`):** Recarrega `pedidos` com `clientes(*)`, sendo necessário garantir a hidratação fresca de `permite_caderneta`, `limite_caderneta`, `saldo_devedor_caderneta` e `dia_vencimento_caderneta` sempre com `.eq('loja_id', loja.id)`.
  - **Linhas `442-629` (`handleConfirmarRecebimento`):** Fluxo de gravação em `pagamentos_pedido`, atualização de status do pedido, lançamento no livro razão (`CadernetaService.registrarCompraCaderneta`), proteção do `saldo_devedor_fiado` (linhas `547-570`) e filtro de entradas reais de caixa `pagamentosCaixa` (linha `573`).
  - **Linhas `812-838` e `962-992`:** Renderização dos botões de seleção de forma de pagamento e do card informativo de limite de crédito por linha de pagamento.
- **[ModalReceberPagamento.tsx](file:///c:/Users/User/Documents/HUBI/src/components/ModalReceberPagamento.tsx)** (Modal secundário de recebimento para consistência sistêmica):
  - **Linhas `63-95` (`carregarFormas`):** Mesma necessidade de injeção condicional da forma `caderneta` quando `loja.caderneta_ativa === true` e cliente elegível.
  - **Linhas `217-375` (`handleConfirmarPagamento`):** Validação de limite disponível da caderneta, gravação de `eh_pagamento_caderneta` em `pagamentos_pedido`, chamada ao [cadernetaService.ts](file:///c:/Users/User/Documents/HUBI/src/services/cadernetaService.ts#L59-L115) e exclusão de `caderneta` da movimentação física de caixa (`movimentacoes_caixa`).
- **[cadernetaService.ts](file:///c:/Users/User/Documents/HUBI/src/services/cadernetaService.ts)**:
  - **Linhas `59-115` (`registrarCompraCaderneta`):** Serviço existente que grava a transação em `caderneta_lancamentos`, atualiza `saldo_devedor_caderneta` na tabela `clientes` e marca `eh_venda_caderneta = true` e `ciclo_referencia_caderneta` em `pedidos`.

---

### Item 2: Onboarding Obrigatório e Bloqueio de Acesso Anônimo no Catálogo Online
- **[CatalogoPublico.tsx](file:///c:/Users/User/Documents/HUBI/src/components/CatalogoPublico.tsx)**:
  - **Linhas `247-266`:** Inicialização de `clienteSelecionado` (via `sessionStorage` com chave `hubi_cliente_catalogo_${slugKey}`) e estado `modalOnboardingAberto` (atualmente iniciado como `false`).
  - **Linhas `658-735` (`verificarSessaoOAuth`):** Verificação assíncrona de sessão ativa do Supabase Auth ao montar o catálogo e vínculo com registro em `clientes` (`.eq('loja_id', loja.id)`).
  - **Linhas `1203-1240` (`adicionarAoCarrinho`):** Função que adiciona produtos à sacola; hoje não bloqueia a execução quando `clienteSelecionado == null`.
  - **Linhas `2415-2610`:** Renderização da grade de produtos da vitrine e botões de ação dos cards.
  - **Linhas `3451-3489`:** Instanciação do `<ModalOnboardingCliente />` e sincronização do estado autenticado.
- **[ModalOnboardingCliente.tsx](file:///c:/Users/User/Documents/HUBI/src/components/ModalOnboardingCliente.tsx)**:
  - **Linhas `19-28` (`ModalOnboardingClienteProps`):** Já possui a propriedade `bloqueioObrigatorio?: boolean`.
  - **Linhas `107-117`, `371-378` e `411-420`:** Tratamento da tecla `Escape`, clique no backdrop e ocultação do botão `X` quando `bloqueioObrigatorio === true`.

---

### Item 3: Substituição da Tarja Superior de Trial por Widget Flutuante Arrastável
- **[BannerAssinaturaTop.tsx](file:///c:/Users/User/Documents/HUBI/src/components/assinatura/BannerAssinaturaTop.tsx)**:
  - **Linhas `1-159`:** Componente completo que atualmente renderiza uma barra horizontal vermelha (`w-full`) no topo da aplicação para os estados `trial_ativo`, `inadimplente` e `bloqueado`.
- **[AppLayout.tsx](file:///c:/Users/User/Documents/HUBI/src/components/layout/AppLayout.tsx)**:
  - **Linha `420`:** Ponto de montagem de `<BannerAssinaturaTop />` dentro da estrutura principal do layout.
- **[ChatAjudaIA.tsx](file:///c:/Users/User/Documents/HUBI/src/components/ChatAjudaIA.tsx)** (Referência arquitetural interna):
  - **Linhas `56-68` e `228-289`:** Mecânica consolidada de arrasto (`onMouseDown`, `onTouchStart`, `mousemove`, `touchmove`, cálculo de `houveArrastoRef` e limites de viewport `window.innerWidth` / `window.innerHeight`).

---

### Item 4: Limpeza Completa de Formulário ao "Sair sem Salvar" no Cadastro de Produtos
- **[ProdutoCadastro.tsx](file:///c:/Users/User/Documents/HUBI/src/components/ProdutoCadastro.tsx)**:
  - **Linhas `401-477`:** Leitura de `rascunhoSalvo` no `sessionStorage` (`hubi_rascunho_novo_produto_${loja?.id || 'padrao'}`) e inicialização de todos os estados do formulário (`nome`, `codigoInterno`, `codigoBarras`, `fotosUrls`, `fotoPrincipal`, `precoCusto`, `precoVendaVarejo`, `opcoesVariacao`, `dadosMercado`, etc.).
  - **Linhas `620-650` (`snapshotAtual`, `snapshotInicial` e `isDirty`):** Onde `snapshotInicial` hoje captura erroneamente o estado já poluído pelo `rascunhoSalvo` e onde `setTemAlteracoesNaoSalvas(isDirty)` é sincronizado.
  - **Linhas `685-741` (`handleNavegarParaAuxiliares` e `useEffect` de auto-save):** Persistência automática no `sessionStorage` a cada alteração de estado.
  - **Linhas `1595-1622`:** Botões de "Voltar" no cabeçalho que acionam `verificarSaidaComConfirmacao(() => navigate('/products'))` sem invocar limpeza do formulário ou do `sessionStorage`.
- **[FeedbackContext.tsx](file:///c:/Users/User/Documents/HUBI/src/contexts/FeedbackContext.tsx)**:
  - **Linhas `34-43` e `116-140` (`verificarSaidaComConfirmacao`):** Gerenciador global do modal "Alterações Não Salvas" (acionado também pelo menu lateral e tecla `ESC` em [AppLayout.tsx](file:///c:/Users/User/Documents/HUBI/src/components/layout/AppLayout.tsx#L78-L120)).

---

### Item 5: Reorganização Visual e Padronização do Card de Modelos em Importar Clientes
- **[ImportarClientes.tsx](file:///c:/Users/User/Documents/HUBI/src/components/ImportarClientes.tsx)**:
  - **Linhas `178-244`:** Container do Card de Download de Modelos de Importação, atualmente estruturado com `flex flex-col md:flex-row md:items-center justify-between gap-4`, que comprime a coluna textual à esquerda e desalinha os 4 botões de ação à direita.

---

## 2. ARQUITETURA DE ESTADO E DADOS

### 2.1. Passagem de Dados e Contabilização da Caderneta no Recebimento (`ModalPagamentoFechamento.tsx` e `ModalReceberPagamento.tsx`)

1. **Hidratação Segura dos Dados de Crédito do Cliente:**
   - Ao abrir o modal para um pedido vinculado a um cliente (`pedido.cliente_id`), caso o objeto `pedido.cliente` não contenha as propriedades `permite_caderneta`, `limite_caderneta` e `saldo_devedor_caderneta` atualizadas, o método `recarregarPedido()` (ou busca complementar em `clientes`) consultará:
     `supabase.from('clientes').select('id, nome, telefone, permite_fiado, limite_credito_fiado, saldo_devedor_fiado, permite_caderneta, limite_caderneta, saldo_devedor_caderneta, dia_vencimento_caderneta').eq('id', pedido.cliente_id).eq('loja_id', loja.id).single()`.
2. **Regra de Elegibilidade (`clienteAptoCaderneta`):**
   - Calculada via `useMemo`:
     - `loja?.caderneta_ativa === true`
     - `clientePedidoMemo?.id` presente
     - `clientePedidoMemo?.permite_caderneta === true`
     - `limiteDisponivelCaderneta = Math.max(0, Number(clientePedidoMemo?.limite_caderneta || 0) - Number(clientePedidoMemo?.saldo_devedor_caderneta || 0))`
     - Elegível para nova alocação quando `limiteDisponivelCaderneta > 0` (ou se a linha já estiver selecionada como `caderneta` para exibir o alerta de excesso).
3. **Injeção na Lista de Formas Disponíveis (`formasDisponiveis`):**
   - No carregamento de `formas_pagamento`, garantir que a opção `{ id: 'fp_caderneta_' + loja.id, loja_id: loja.id, nome: 'Caderneta', tipo: 'caderneta', taxa_percentual: 0, ativo: true }` esteja presente na lista base quando `loja?.caderneta_ativa === true`.
   - Filtrar `formasDisponiveis` para exibir `fp.tipo === 'caderneta'` somente quando `clienteAptoCaderneta === true`.
4. **Validação e Persistência Transacional ao Confirmar Recebimento:**
   - Somar todas as linhas de pagamento ativas cujo `forma_tipo === 'caderneta'` (`totalAlocadoCaderneta`).
   - Validar antes de persistir: se `totalAlocadoCaderneta > limiteDisponivelCaderneta + 0.009`, bloquear a submissão e exibir toast amigável em `pt-BR` informando o saldo disponível na Caderneta.
   - Na inserção em `pagamentos_pedido`, gravar `eh_pagamento_caderneta: linha.forma_tipo === 'caderneta'` e recuperar o `id` gerado (`.select('id').single()`).
   - Para cada linha `caderneta`, executar `CadernetaService.registrarCompraCaderneta({ lojaId: loja.id, clienteId: pedido.cliente_id, pedidoId: pedido.id, pagamentoPedidoId: pagInserido.id, valor: linha.valor, usuarioId: usuario?.id, numeroPedido: pedido.numero_pedido })`, que insere o débito em `caderneta_lancamentos` e incrementa `saldo_devedor_caderneta` em `clientes`.
   - **Isolamento Contábil (Caixa e Fiado):**
     - Pagamentos do tipo `caderneta` **não** entram em `pagamentosCaixa` (`l.forma_tipo !== 'fiado' && l.forma_tipo !== 'caderneta'`), pois não representam entrada imediata de numerário na gaveta do caixa no ato da venda.
     - Pagamentos do tipo `caderneta` **não** abatem `saldo_devedor_fiado` na rotina de baixa de fiado das linhas `547-570`.

### 2.2. Mecanismo de Reset Completo no Cadastro de Produtos (`ProdutoCadastro.tsx` e `FeedbackContext.tsx`)

1. **Causa Raiz da Retenção Indevida:**
   - Atualmente, `ProdutoCadastro.tsx` salva qualquer caractere digitado ou foto gerada no `sessionStorage` (`hubi_rascunho_novo_produto_${loja?.id || 'padrao'}`). Quando o usuário clica em "Voltar" e confirma **"Sair sem salvar"**, o modal apenas seta `temAlteracoesNaoSalvas = false` e navega para fora, mantendo a chave no `sessionStorage`. Ao abrir novamente "Novo Produto", o componente lê o `sessionStorage` residual e ainda define `snapshotInicial` com os dados sujos.
2. **Arquitetura da Solução:**
   - **Higienização na Inicialização (`useMemo` de `rascunhoSalvo`):** O rascunho do `sessionStorage` para novo produto (`!id`) só deve ser restaurado se a flag `sessionStorage.getItem('hubi_origem_cadastro_produto') === 'true'` estiver presente (ou seja, exclusivamente quando o usuário clicou em "+ Nova Categoria" / "+ Novo Fornecedor" via `handleNavegarParaAuxiliares` e retornou). Caso contrário, na montagem de um novo cadastro (`!id`), qualquer rascunho órfão anterior é descartado imediatamente.
   - **Snapshot Inicial Limpo:** Garantir que `snapshotInicial` para um novo produto represente sempre o estado vazio padrão (`INITIAL_CLEAN_SNAPSHOT`), para que mesmo após restaurar um rascunho vindo de Cadastros Auxiliares a flag `isDirty` continue detectando que há dados não salvos.
   - **Função `limparFormularioCompleto()`:** Função centralizada em `ProdutoCadastro.tsx` que:
     - Remove `sessionStorage.removeItem(CHAVE_RASCUNHO)` e `sessionStorage.removeItem('hubi_origem_cadastro_produto')`;
     - Reseta explicitamente todos os estados (`nome`, `codigoInterno`, `codigoBarras`, `categoriaId`, `fornecedorId`, `descricao`, `tipoUnidade`, `tipoItem`, `ativo`, `fotosUrls`, `fotoPrincipal`, `novaFotoUrl`, `pesoKg`, `alturaCm`, `larguraCm`, `comprimentoCm`, `precoCusto`, `precoVendaVarejo`, `precoVendaAtacado`, `qtdMinimaAtacado`, `valorMinimoAtacado`, `precoVendaAutoatacado`, `qtdMinimaAutoatacado`, `valorMinimoAutoatacado`, `precoPromocional`, `promocaoAtiva`, `quantidadeEstoque`, `estoqueMinimoAlerta`, `dataValidade`, `exibirCatalogo`, `destaque`, `temVariacoes`, `nomeTipoVariacao`, `etapaVariacao`, `opcoesVariacao`, `novaOpcaoNome`, `novaOpcaoEstoque`, `dadosMercado`, `sucessoIAMsg`, `opcoesDuvidaIA`);
     - Seta `setTemAlteracoesNaoSalvas(false)`.
   - **Integração com "Sair sem salvar" (`FeedbackContext.tsx`):**
     - Ao acionar `verificarSaidaComConfirmacao(onProsseguir)` (seja pelo botão Voltar do `ProdutoCadastro`, pelo menu lateral do `AppLayout` ou pela tecla `ESC`), ou ao registrar um listener/callback de descarte quando o usuário confirma **"Sair sem salvar"**, invocar a limpeza do `sessionStorage` e o reset completo dos estados antes de concluir a navegação.

---

## 3. ESPECIFICAÇÃO DE UI/UX

### 3.1. Modal de Recebimento — Opção e Card de Caderneta (`ModalPagamentoFechamento.tsx`)
- **Botão de Seleção da Forma:** Quando `fp.tipo === 'caderneta'`, exibir ícone `BookOpen` com destaque visual âmbar/esmeralda compatível com o tema Dark Slate e badge discreta do limite disponível.
- ** Painel de Validação da Linha Selecionada:** Ao selecionar `Caderneta` em uma parcela/linha de pagamento, renderizar um banner compacto logo abaixo da linha (análogo ao de Fiado nas linhas `962-992`), exibindo:
  - *"Limite disponível na Caderneta: R$ XX,XX"* (e dia de vencimento do cliente).
  - Alerta visual em vermelho (`text-red-400`) caso o valor alocado na linha/soma ultrapasse o limite disponível, desabilitando a confirmação.

### 3.2. Bloqueio de Vitrine e Onboarding Obrigatório (`CatalogoPublico.tsx` & `ModalOnboardingCliente.tsx`)
- **Disparo Imediato:** Assim que o carregamento inicial da loja e da sessão OAuth finalizar (`!carregando && !verificandoSessaoOAuth && loja`), se `!clienteSelecionado?.id`, abrir automaticamente `ModalOnboardingCliente` com `bloqueioObrigatorio={true}` e `motivo="geral"`.
- **Bloqueio de Fechamento Livre:** Com `bloqueioObrigatorio={!clienteSelecionado?.id}`, o modal oculta o botão `X`, ignora cliques no backdrop e bloqueia a tecla `Escape`.
- **Proteção Visual e Funcional da Vitrine (Defense-in-Depth):**
  - Enquanto `!clienteSelecionado?.id`, a área da vitrine de produtos ao fundo recebe filtro visual de bloqueio (`blur-[2px] pointer-events-none select-none opacity-60`) e, caso por qualquer razão o modal não esteja visível, exibe um backdrop fixo com CTA centralizado *"Identifique-se para acessar o catálogo e fazer seu pedido"*.
  - As funções `adicionarAoCarrinho` e abertura de seleção de variação contam com trava explícita no início: se `!clienteSelecionado?.id`, interrompem a adição à sacola e forçam `setModalOnboardingAberto(true)`.

### 3.3. Widget Flutuante Arrastável de Trial (`BannerAssinaturaTop.tsx`)
- **Descontinuação da Tarja Horizontal:** Remover a barra `w-full bg-red-600` do fluxo estático superior para o status `trial_ativo`.
- **Estrutura do Card Flutuante Compacto:**
  - Posicionamento `fixed z-40 select-none touch-none` com dimensões enxutas e proporcionais aos botões do topo (`max-w-[260px] sm:max-w-[280px] rounded-2xl p-2.5 bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 shadow-xl shadow-black/50`).
  - Indicador visual de arrasto (`GripVertical` discreto na lateral esquerda com `cursor-grab active:cursor-grabbing`).
  - **Hierarquia Textual Simplificada:**
    1. Linha principal em destaque: `"Restam X dias gratuitos"` (com ícone `Sparkles` ou `Clock` e contagem dinâmica via `diasRestantesTrial`).
    2. Subtítulo compacto: `"Garanta seu plano por apenas R$ 49,90/mês"`.
    3. Botão de ação integrado: `"Assinar Agora"` (`bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all`), disparando `iniciarCheckoutAssinatura()` apenas quando `!houveArrastoRef.current`.
- **Mecânica de Arrasto e Persistência (`localStorage`):**
  - Suporte completo a Mouse (`onMouseDown` / `mousemove` / `mouseup`) e Touch (`onTouchStart` / `touchmove` / `touchend`) com clamping de bordas da janela (`Math.max(12, Math.min(window.innerWidth - larguraWidget, novaPosX))`).
  - Persistência automática das coordenadas `{ x, y }` na chave `'hubi_trial_widget_pos'` no `localStorage`, restaurando a posição escolhida pelo lojista entre recarregamentos e trocas de rota (com recalibragem automática em `window.resize` para nunca ficar fora da tela).

### 3.4. Card de Download de Modelos em Importar Clientes (`ImportarClientes.tsx`)
- **Mudança de Layout (Empilhamento Vertical Fluido):**
  - Substituir o container `flex-col md:flex-row` (linha `180`) por um fluxo vertical estruturado (`flex flex-col gap-4`).
  - **Bloco Superior (Largura Total `w-full`):**
    - Badge `"LAYOUT OFICIAL DE CLIENTES"` alinhada ao ícone no topo.
    - Título `"Baixe a Planilha Modelo de Importação de Clientes"` ocupando 100% da largura horizontal, sem esmagamento em colunas estreitas.
    - Texto explicativo fluido com leitura confortável em toda a extensão do card.
  - **Bloco Inferior de Ações (Grid/Flex Horizontal Balanceado):**
    - Posicionado imediatamente abaixo do texto explicativo (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1` ou `flex flex-wrap items-center gap-2.5 w-full`):
      1. **Botão Principal (`Modelo WhatsApp (.XLSX)`):** Verde Esmeralda oficial (`bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 font-black shadow-md shadow-emerald-600/20`).
      2. **Botões Secundários (`Modelo Completo (.XLSX)` e `Modelo (.CSV)`):** Dark Slate neutro padronizado (`bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold`).
      3. **Botão do Guia (`Como Extrair Contatos? (Guia)`):** Alto contraste e legibilidade no padrão HUBI (`bg-slate-800/90 hover:bg-slate-700 text-emerald-400 border border-emerald-500/40 font-bold`).

---

## 4. FASES DE EXECUÇÃO RECOMENDADAS

A implementação seguirá a ordem sequencial abaixo (utilizando estritamente patches cirúrgicos via `edit_file` após aprovação):

1. **Fase 1 — Reorganização Visual do Card de Modelos (`ImportarClientes.tsx`):**
   - Ajuste rápido e isolado de UI/UX no topo da tela de importação de clientes, validando responsividade e padronização de cores do Design System.
2. **Fase 2 — Widget Flutuante Arrastável de Trial (`BannerAssinaturaTop.tsx`):**
   - Refatoração da tarja superior para o card flutuante arrastável com persistência em `localStorage` (`hubi_trial_widget_pos`) e textos simplificados.
3. **Fase 3 — Limpeza Completa ao "Sair sem Salvar" no Cadastro de Produtos (`ProdutoCadastro.tsx` e `FeedbackContext.tsx`):**
   - Implementação de `limparFormularioCompleto()`, expurgo determinístico do rascunho no `sessionStorage` ao descartar alterações e blindagem da inicialização de novos produtos.
4. **Fase 4 — Onboarding Obrigatório e Bloqueio da Vitrine no Catálogo Público (`CatalogoPublico.tsx` e `ModalOnboardingCliente.tsx`):**
   - Ativação do disparo imediato do modal de identificação para visitantes não autenticados, bloqueio de fechamento anônimo (`bloqueioObrigatorio`) e trava na sacola/vitrine.
5. **Fase 5 — Habilitação e Contabilização de "Caderneta de Mercadinho" no Recebimento (`ModalPagamentoFechamento.tsx` e `ModalReceberPagamento.tsx`):**
   - Carregamento garantido das colunas de caderneta do cliente (`.eq('loja_id', loja.id)`), exibição condicional da forma de pagamento `Caderneta`, validação de limite disponível e integração com `CadernetaService.registrarCompraCaderneta` sem contaminar o saldo de caixa físico nem o saldo de fiado.
6. **Fase 6 — Verificação de Tipagem (`tsc --noEmit`) e Validação Integrada:**
   - Checagem estática de TypeScript sem erros e revisão de conformidade com as regras `supabase-rls-guard`, `pii-leak-detector` e `anti-jsonb-linter`.
