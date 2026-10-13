# 🎨 DESIGN SYSTEM CANÔNICO & BITEMÁTICO: MÓDULO DASHBOARD EXECUTIVO

Este documento estabelece a especificação canônica, exata e bitemática de UI/UX implementada no ecossistema do **HUBI (Dashboard Executivo & Cockpit F1)**, cobrindo a tela principal do dashboard, a grade dos velocímetros de alta performance, o seletor de períodos com 9 presets analíticos, as gavetas laterais de auditoria detalhada (`CockpitMetricDrawer`), os modais de configuração de metas e a integração com inteligência de dados TypeSafe Jev.

> **Regra de Ouro da Bitematicidade no Cockpit:** Todo elemento, card, velocímetro, frame de auditoria e texto DEVE apresentar suporte nativo e explícito a **Tema Claro (Light Mode)** e **Tema Escuro (Dark Mode)**, pareando classes Tailwind (`bg-... dark:bg-...`, `border-... dark:border-...`, `text-... dark:text-...`) e cores hexadecimais estritas (preto petróleo `#08131A`, preto absoluto `#000000`, cinza menu `#F1F5F9` e verde esmeralda `#059669`).

---

## 1. Tokens Estruturais e Superfícies (Claro vs. Escuro)

O Dashboard Executivo utiliza um sistema de elevação e contraste cromático cirúrgico:
- **Tema Escuro:** Fundo em Preto Profundo (`#0B0F17`) na tela e Preto Petróleo (`#08131A`) no fundo do modal de auditoria. O interior dos frames e velocímetros adota Preto Absoluto (`#000000`) com bordas destacadas de 2px em ardósia metálica (`border-2 border-slate-400`).
- **Tema Claro:** Fundo unificado no tom cinza idêntico às pílulas do menu principal (`bg-slate-100` / `#F1F5F9`). O interior dos frames e velocímetros adota Branco Puro (`#FFFFFF`) com bordas destacadas de 2px (`border-2 border-slate-300`).

| Token de Superfície | Tema Claro (Light) | Hex Claro | Tema Escuro (Dark) | Hex Escuro | Tailwind Pareado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Fundo da Tela do Dashboard** | `bg-slate-100` | `#F1F5F9` | `dark:bg-[#0B0F17]` | `#0B0F17` | `bg-slate-100 dark:bg-[#0B0F17]` |
| **Subcabeçalho Executivo Desktop** | `bg-slate-100/95` | `#F1F5F9` (95%) | `dark:bg-[#0B0F17]/95` | `#0B0F17` (95%) | `bg-slate-100/95 dark:bg-[#0B0F17]/95 border-slate-300 dark:border-[#1E293B]/80` |
| **Superfície dos Cards de Velocímetro** | `bg-white` | `#FFFFFF` | `dark:bg-[#000000]` | `#000000` | `bg-white dark:bg-[#000000]` |
| **Bordas dos Velocímetros (Destaque)** | `border-2 border-slate-300` | `#CBD5E1` (2px) | `dark:border-2 dark:border-slate-400` | `#94A3B8` (2px) | `border-2 border-slate-300 dark:border-2 dark:border-slate-400` |
| **Fundo da Gaveta Lateral (Modal)** | `bg-slate-100` | `#F1F5F9` | `dark:bg-[#08131A]` | `#08131A` (Preto Petróleo) | `isDark ? 'bg-[#08131A]' : 'bg-slate-100'` |
| **Cabeçalho/Rodapé da Gaveta Lateral** | `bg-slate-100/95` | `#F1F5F9` (95%) | `dark:bg-[#08131A]/95` | `#08131A` (95%) | `isDark ? 'bg-[#08131A]/95' : 'bg-slate-100/95'` |
| **Interior dos Frames do Modal** | `bg-white` | `#FFFFFF` | `dark:bg-[#000000]` | `#000000` (Preto Absoluto) | `isDark ? 'bg-[#000000]' : 'bg-white'` |
| **Bordas dos Frames do Modal** | `border border-slate-300` | `#CBD5E1` (1px) | `dark:border-2 dark:border-slate-400` | `#94A3B8` (2px) | `isDark ? 'border-2 border-slate-400' : 'border border-slate-300'` |
| **Botão Fechar (Modal Topo/Rodapé)** | `bg-emerald-600 hover:bg-emerald-700` | `#059669` / `#047857` | `dark:bg-[#000000] dark:hover:bg-slate-900` | `#000000` / `#0F172A` | `isDark ? 'bg-[#000000] border-2 border-slate-400 text-slate-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700'` |
| **Botões Secundários de Ação (Repor)** | `bg-emerald-600 hover:bg-emerald-700` | `#059669` / `#047857` | `dark:bg-[#000000] dark:hover:bg-slate-900` | `#000000` / `#0F172A` | `isDark ? 'bg-[#000000] border-2 border-slate-400 text-slate-200' : 'bg-emerald-600 text-white border border-emerald-700'` |
| **Destaque Primário (Emerald)** | `text-emerald-700 bg-emerald-50` | `#047857` / `#ECFDF5` | `dark:text-emerald-400 dark:bg-emerald-500/10` | `#34D399` / `rgba(16,185,129,0.1)` | `text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30` |

### Snippet JSX: Card Canônico do Indicador com Borda em Destaque
```tsx
<div
  onClick={onClickDrillDown}
  className={`rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-colors duration-200 select-none bg-white shadow-sm hover:bg-slate-50 dark:bg-[#000000] dark:hover:bg-[#0D111A] ${
    isDark ? 'border-2 border-slate-400' : 'border-2 border-slate-300'
  } ${
    onClickDrillDown
      ? 'cursor-pointer hover:shadow-lg dark:hover:shadow-emerald-500/5 group active:scale-[0.99]'
      : ''
  }`}
>
  {/* Conteúdo do velocímetro e métricas */}
</div>
```

---

## 2. Tipografia, Textos e Ícones Estruturais

A legibilidade no Dashboard Executivo é tratada como requisito crítico de tomada de decisão.
- **Tema Claro nos Modais:** Todas as fontes dos modais de auditoria foram padronizadas para **preto absoluto** (`text-black`), eliminando tons de cinza desbotados (`text-slate-500`, `text-slate-600`) para garantir leitura imediata e confortável sobre o fundo cinza claro e frames brancos.
- **Tema Escuro:** Uso de `dark:text-white` em títulos e `dark:text-slate-200` / `dark:text-slate-300` / `dark:text-slate-400` em subtítulos e métricas secundárias.

| Nível Tipográfico / Elemento | Tema Claro (Light) | Hex Claro | Tema Escuro (Dark) | Hex Escuro | Tailwind Pareado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Título do Dashboard (H1)** | `text-slate-900` | `#0F172A` | `dark:text-white` | `#FFFFFF` | `text-slate-900 dark:text-white font-black text-xl sm:text-2xl` |
| **Título do Velocímetro** | `text-slate-800` | `#1E293B` | `dark:text-slate-100` | `#F1F5F9` | `font-black text-xs sm:text-sm text-slate-800 dark:text-slate-100 uppercase tracking-tight` |
| **Valor Realizado (Destaque Central)** | `text-slate-900` | `#0F172A` | `dark:text-white` | `#FFFFFF` | `text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight` |
| **Valor da Meta no Rodapé do Card** | `text-slate-600` / `text-slate-800` | `#475569` / `#1E293B` | `dark:text-slate-400` / `dark:text-slate-200` | `#94A3B8` / `#E2E8F0` | `text-[11px] text-slate-600 dark:text-slate-400 font-medium` |
| **Títulos nos Modais de Auditoria** | `text-black` | `#000000` | `dark:text-white` | `#FFFFFF` | `text-black dark:text-white font-black text-base sm:text-lg` |
| **Subtítulos/Labels nos Modais** | `text-black` | `#000000` | `dark:text-slate-400` | `#94A3B8` | `text-black dark:text-slate-400 text-xs font-semibold` |
| **Ícones dos Botões de Fechar** | `text-white` | `#FFFFFF` | `dark:text-slate-200` | `#E2E8F0` | `text-white dark:text-slate-200` |

### Snippet JSX: Tipografia de Alto Contraste no Modal de Auditoria
```tsx
<div className="space-y-1">
  <div className="flex items-center gap-2">
    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
      <DollarSign className="w-4 h-4" />
    </div>
    <h2 className="text-base sm:text-lg font-black text-black dark:text-white tracking-tight">
      Auditoria de Faturamento Bruto
    </h2>
  </div>
  <p className="text-xs text-black dark:text-slate-400 font-medium">
    Decomposição detalhada das vendas brutas, descontos aplicados e canais de faturamento.
  </p>
</div>
```

---

## 3. Subcabeçalho Executivo Desktop & Mobile

O subcabeçalho da tela do dashboard (`DashboardCockpit.tsx`) oferece navegação temporal granular e ferramentas de atualização sob demanda.

### Elementos do Cabeçalho:
1. **Identificação da Visão:** Ícone temático `LayoutDashboard`, título *"Dashboard Executivo"* e saudação personalizada ao usuário logado.
2. **Seletor de Período Rápido com Setas:** Navegação anterior/próximo (`ChevronLeft` / `ChevronRight`) com bloqueio de datas futuras.
3. **Dropdown de 9 Presets Canônicos:**
   - Hoje
   - Ontem
   - Esta Semana
   - Semana Passada
   - Este Mês
   - Mês Passado
   - Este Ano
   - Ano Passado
   - Personalizado (revela seletores de data `De:` e `Até:`)
4. **Indicador de Sincronização SWR:** Badge animado com `Zap` indicando atualização em background sem travar a interface.
5. **Botão de Recarga Rápida (`RefreshCw`):** Revalidação forçada do cache do TypeSafe Jev.
6. **Atalho de Configuração de Metas (`Settings`):** Acesso restrito a gestores e administradores (`permissions.podeAcessarConfig`).

### Snippet JSX: Subcabeçalho Executivo Unificado
```tsx
<div className="hidden md:block sticky top-0 z-20 backdrop-blur-md border-b px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 bg-slate-100/95 dark:bg-[#0B0F17]/95 border-slate-300 dark:border-[#1E293B]/80 transition-colors">
  <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
    {/* Título & Saudação */}
    <div className="space-y-1">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shadow-xs shrink-0">
          <LayoutDashboard className="w-5 h-5" />
        </div>
        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Dashboard Executivo
        </h1>
      </div>
      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        Olá, <span className="font-semibold text-slate-800 dark:text-slate-200">{nomeUsuario}</span> • Acompanhe o desempenho da sua operação em tempo real.
      </p>
    </div>

    {/* Controles de Período e Ações */}
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex items-center bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 dark:bg-[#000000] dark:hover:bg-[#0D111A] dark:border-[#1E293B] dark:text-slate-200 font-semibold rounded-xl p-0.5 shadow-2xs transition">
        {/* Controles de Navegação Anterior/Próximo e Dropdown de Períodos */}
      </div>
    </div>
  </div>
</div>
```

---

## 4. Grid dos 6 Velocímetros Canônicos (`CockpitGaugeF1`)

A tela central organiza os indicadores em um grid responsivo (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6`), cada um representado por um velocímetro vetorial estilo Fórmula 1 renderizado em SVG puro sem bibliotecas pesadas de terceiros.

### Os 6 Indicadores do Cockpit:
1. **Faturamento Bruto:** Volume total vendido no período versus meta financeira proporcional. Formato monetário (`R$`).
2. **Volume de Pedidos:** Quantidade de transações concluídas versus meta de pedidos. Formato numérico inteiro.
3. **Lucro Líquido Real:** Resultado líquido após dedução de CMV (Custo da Mercadoria Vendida), impostos, taxas e despesas operacionais. Formato monetário (`R$`).
4. **Despesas Operacionais (Teto Orçamentário):** Despesas pagas versus orçamento estipulado. Utiliza **escala invertida** (gastos menores que 80% são verdes; acima de 100% são estouro vermelho).
5. **Inadimplência Fiado:** Percentual de saldo em aberto vencido versus teto de tolerância tolerado. Utiliza **escala invertida** (quanto menor, melhor).
6. **Saúde do Estoque:** Monitoramento híbrido (produtos abaixo do estoque mínimo geral e itens de Curva A em ruptura iminente). Utiliza **escala invertida** (menos rupturas = indicador mais saudável).

### Geometria e Gradientes do Velocímetro SVG:
- **Arco Semicircular:** Raio de 82px, centro em `(110, 105)`, comprimento de arco de ~257.61px.
- **Escala Visual:** Amplitude de 0% a 125% da meta estipulada.
- **Ângulo da Agulha:** Rotação angular de -90° (0%) a +90° (125%).
- **Marcador Polar de Meta:** Tick em 100% (`propMeta = 0.8`) posicionado na coordenada polar correspondente.
- **Gradiente Normal:** Vermelho (0-60%) ➔ Amarelo (60-80%) ➔ Verde Esmeralda (80-100%).
- **Gradiente Invertido:** Verde Esmeralda (0-60%) ➔ Amarelo (60-80%) ➔ Vermelho (80-100%).

### Snippet JSX: Componente Completo do Velocímetro F1
```tsx
<svg viewBox="0 0 220 130" className="w-full max-w-[210px] h-auto overflow-visible">
  <defs>
    <linearGradient id={`${gradientId}-normal`} x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#ef4444" />
      <stop offset="55%" stopColor="#ef4444" />
      <stop offset="65%" stopColor="#f59e0b" />
      <stop offset="78%" stopColor="#eab308" />
      <stop offset="82%" stopColor="#10b981" />
      <stop offset="100%" stopColor="#059669" />
    </linearGradient>
    <filter id={`${gradientId}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity={isDark ? "0.8" : "0.2"} />
    </filter>
  </defs>

  {/* Trilha de Fundo */}
  <path
    d="M 28 105 A 82 82 0 0 1 192 105"
    fill="none"
    stroke={isDark ? '#1E293B' : '#E2E8F0'}
    strokeWidth="11"
    strokeLinecap="round"
  />

  {/* Arco Dinâmico Preenchido */}
  <path
    d="M 28 105 A 82 82 0 0 1 192 105"
    fill="none"
    stroke={`url(#${gradientId}-${escalaInvertida ? 'invertido' : 'normal'})`}
    strokeWidth="11"
    strokeLinecap="round"
    strokeDasharray={compArco}
    strokeDashoffset={dashOffset}
    className="transition-all duration-700 ease-out"
  />

  {/* Agulha Esportiva */}
  <g transform={`rotate(${anguloAgulha}, 110, 105)`} className="transition-transform duration-700 ease-out">
    <line x1="110" y1="105" x2="110" y2="30" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
    <circle cx="110" cy="105" r="5" fill="#10B981" />
  </g>
</svg>
```

---

## 5. Gaveta Lateral de Auditoria (`CockpitMetricDrawer`)

Ao clicar em qualquer velocímetro, uma gaveta lateral animada (`w-full sm:max-w-xl md:max-w-2xl`) é disparada, permitindo ao gestor inspecionar a decomposição analítica profunda do indicador.

### Comportamento Bitemático da Gaveta:
- **Tema Escuro:**
  - Fundo geral do drawer: Preto Petróleo (`#08131A`).
  - Interior dos cartões analíticos: Preto Absoluto (`#000000`) com `border-2 border-slate-400`.
  - Botões de fechar: `bg-[#000000]` com `border-2 border-slate-400` e texto `slate-200`.
- **Tema Claro:**
  - Fundo geral do drawer: `bg-slate-100` (`#F1F5F9`).
  - Interior dos cartões analíticos: Branco Puro (`#FFFFFF`) com `border border-slate-300`.
  - Tipografia de todo o modal: **Preto Absoluto** (`text-black`) para máxima legibilidade.
  - Botões de fechar (topo e rodapé) e botões de ação: Verde fechado do carrinho de vendas (`bg-emerald-600 hover:bg-emerald-700 text-white font-bold border border-emerald-700 shadow-sm`).

### Decomposições Disponíveis por Indicador:
1. **Auditoria de Faturamento Bruto:** Faturado líquido, descontos concedidos, ticket médio, canais de venda (PDV vs Catálogo WhatsApp) e evolução diária.
2. **Auditoria de Volume de Pedidos:** Total de pedidos, itens por pedido, status dos pedidos e distribuição por horários de pico.
3. **Auditoria de Lucro Líquido Real:** Receita bruta deduzida de CMV, despesas fixas, impostos e comissões para apurar a margem líquida percentual e monetária real.
4. **Auditoria de Ticket Médio:** Relação faturamento/pedidos, produtos mais frequentes no carrinho e oportunidades de upsell.
5. **Auditoria de Despesas Operacionais:** Rateio por categoria (aluguel, funcionários, energia, embalagens, fornecedores), status de pagamento e alertas de vencimento.
6. **Auditoria de Inadimplência Fiado:** Clientes com contas em aberto, valor vencido vs a vencer, prazo médio de recebimento e envio de cobrança via WhatsApp.
7. **Auditoria de Saúde do Estoque:** Itens com estoque zerado ou abaixo do mínimo, capital parado em estoque e botão direto para **+ Repor Estoque** (abrindo o `ModalEntradaEstoque`).

### Snippet JSX: Estilização Bitemática dos Botões e Frames do Drawer
```tsx
const cardBorderClass = isDark ? 'border-2 border-slate-400' : 'border border-slate-300';
const drawerBorderClass = isDark ? 'border-l-2 border-slate-400' : 'border-l border-slate-300';
const buttonBorderClass = isDark ? 'border-2 border-slate-400' : 'border border-slate-300';
const drawerBgClass = isDark ? 'bg-[#08131A]' : 'bg-slate-100';
const drawerHeaderFooterBgClass = isDark ? 'bg-[#08131A]/95' : 'bg-slate-100/95';

// Botão de Fechar no Cabeçalho
const closeButtonClass = isDark
  ? `p-2 rounded-xl bg-[#000000] ${buttonBorderClass} text-slate-200 hover:bg-slate-900 transition cursor-pointer shadow-xs`
  : 'p-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 transition cursor-pointer shadow-sm';

// Botão de Fechar no Rodapé
const footerCloseButtonClass = isDark
  ? `px-4 py-2 rounded-xl bg-[#000000] hover:bg-slate-900 ${buttonBorderClass} text-slate-200 font-semibold transition cursor-pointer shadow-xs`
  : 'px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold border border-emerald-700 transition cursor-pointer shadow-sm';

// Botões Secundários (ex: + Repor Estoque, Paginação)
const secondaryButtonClass = isDark
  ? 'bg-[#000000] hover:bg-slate-900 border-2 border-slate-400 text-slate-200 font-semibold'
  : 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold border border-emerald-700 shadow-sm';
```

---

## 6. Configuração de Metas da Loja (`ConfiguracoesMetas`)

O gestor da loja pode calibrar as metas operacionais a qualquer momento através do componente `ConfiguracoesMetas.tsx`, definindo os parâmetros que ajustam os ponteiros de 100% dos velocímetros.

### Parâmetros Configuráveis:
1. **Meta de Faturamento Mensal (R$):** Valor bruto almejado para o mês corrente.
2. **Meta de Volume de Pedidos:** Quantidade de transações desejadas.
3. **Meta de Lucro Líquido (R$):** Meta de rentabilidade real no período.
4. **Teto Orçamentário de Despesas (R$):** Limite máximo tolerado de despesas fixas/variáveis.
5. **Tolerância Máxima de Inadimplência (%):** Percentual aceitável de crédito em atraso.
6. **Meta de Rupturas de Estoque:** Quantidade máxima admitida de produtos zerados.

Os cálculos de metas proporcionais (`metasProporcionais`) convertem automaticamente a meta mensal para o recorte de tempo selecionado no seletor (ex: diário, semanal, mensal ou customizado).

---

## 7. Motor de Inteligência Executiva (TypeSafe Jev & SWR)

O Dashboard é alimentado pelo serviço [`dashboardJevService.ts`](file:///c:/Users/User/Documents/HUBI/src/services/dashboardJevService.ts), que utiliza inferência e consolidação estruturada (TypeSafe Jev / System 1):

1. **Schema Executivo Consolidado:** Tipagem estrita com `PayloadDashboardExecutivo`, integrando vendas concluídas, sangrias/suprimentos de caixa, despesas a pagar, parcelas de fiado e posição atual de estoque.
2. **Estratégia SWR (Stale-While-Revalidate):** O dashboard exibe imediatamente os dados persistidos em cache e dispara uma verificação assíncrona em segundo plano, atualizando o velocímetro com animação fluida assim que novos dados chegam.
3. **Invalidação Transacional:** Ao registrar uma venda no PDV, dar entrada de estoque via `ModalEntradaEstoque` ou quitar um fiado, o cache do Jev para a `loja_id` é automaticamente invalidado via `dashboardJevService.invalidarCache(loja.id)`.

---

## 8. Sumário de Governança e Regras de Replicação

Para garantir consistência contínua nas próximas evoluções do Dashboard Executivo:

1. **Preservação Bitemática Estrita:**
   - No Tema Claro, nunca utilizar `bg-slate-50` ou fundos arbitrários no container principal; utilizar sempre `bg-slate-100` (`#F1F5F9`) para manter harmonia com as pílulas do menu.
   - No Tema Escuro, manter a distinção entre Preto Petróleo (`#08131A`) no fundo do modal e Preto Absoluto (`#000000`) no interior dos frames com bordas `border-2 border-slate-400`.
2. **Destaque de Borda em 2px:**
   - Na tela principal do dashboard, todos os cartões de indicadores e o rodapé analítico devem manter `border-2 border-slate-300` (Light) e `border-2 border-slate-400` (Dark).
3. **Legibilidade Máxima das Letras no Tema Claro:**
   - Textos dentro dos modais de auditoria devem sempre aplicar `text-black` no Tema Claro para eliminar qualquer efeito esmaecido ou de baixo contraste.
4. **Botões de Ação Padronizados:**
   - No Tema Claro, os botões de ação e fechamento dos modais devem adotar o verde esmeralda fechado (`bg-emerald-600 hover:bg-emerald-700 text-white font-bold border border-emerald-700`).
5. **Blindagem RLS e Multi-Tenant:**
   - Todas as requisições Supabase disparadas pelos serviços do dashboard devem conter obrigatoriamente a cláusula `.eq('loja_id', loja.id)`.
6. **Normatização Relacional:**
   - Proibido o uso de colunas `JSONB` arbitrárias para persistência de métricas consolidadas ou metas operacionais.
