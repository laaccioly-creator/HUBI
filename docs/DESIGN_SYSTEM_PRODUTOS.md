# 🎨 DESIGN SYSTEM CANÔNICO & BITEMÁTICO: MÓDULO PRODUTOS & ESTOQUE

Este documento estabelece a especificação canônica, exata e bitemática de UI/UX implementada no ecossistema do **HUBI (Produtos & Estoque)**, cobrindo telas principais, formulários de edição e cadastro, cabeçalhos móveis, listagens em grid/lista, modais de IA e filtros.

> **Regra de Ouro da Bitematicidade:** Todo elemento, componente, container ou texto DEVE apresentar suporte nativo e explícito a **Tema Claro (Light Mode)** e **Tema Escuro (Dark Mode)**, pareando classes Tailwind (`bg-... dark:bg-...`, `border-... dark:border-...`, `text-... dark:text-...`) e cores hexadecimais de alto contraste sem deixar tokens não mapeados.

---

## 1. Tokens Estruturais e Superfícies (Claro vs. Escuro)

A paleta de superfícies do HUBI utiliza o espectro Slate com pretos puros (`#000000`) e azuis escuros profundos (`#0B0F17`) para maximizar o contraste OLED e a legibilidade diurna.

| Token de Superfície | Tema Claro (Light) | Hex Claro | Tema Escuro (Dark) | Hex Escuro | Tailwind Pareado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Fundo da Aplicação (Body / Root)** | `bg-slate-100` / `bg-slate-50` | `#F1F5F9` / `#F8FAFC` | `dark:bg-[#0B0F17]` | `#0B0F17` | `bg-slate-100 dark:bg-[#0B0F17]` |
| **Superfície de Card / Elevação 1** | `bg-white` | `#FFFFFF` | `dark:bg-[#000000]` | `#000000` | `bg-white dark:bg-[#000000]` |
| **Containers Elevados / Modais** | `bg-white` | `#FFFFFF` | `dark:bg-[#0B0F17]` | `#0B0F17` | `bg-white dark:bg-[#0B0F17]` |
| **Superfícies Secundárias / Caixas** | `bg-slate-50` / `bg-slate-100/70` | `#F8FAFC` / `#F1F5F9` | `dark:bg-[#0D111A]` / `dark:bg-slate-900/80` | `#0D111A` / `#0F172A` | `bg-slate-50 dark:bg-[#0D111A]` |
| **Linhas Divisórias e Bordas Padrão** | `border-slate-200` | `#E2E8F0` | `dark:border-[#1E293B]` | `#1E293B` | `border-slate-200 dark:border-[#1E293B]` |
| **Bordas Suaves / Divisores Internos** | `border-slate-100` | `#F1F5F9` | `dark:border-slate-800/80` | `#1E293B` | `border-slate-100 dark:border-slate-800/80` |
| **Destaque Primário (Emerald)** | `bg-emerald-600` / `hover:bg-emerald-500` | `#059669` / `#10B981` | `dark:bg-emerald-500` / `dark:hover:bg-emerald-400` | `#10B981` / `#34D399` | `bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500` |
| **Destaque Translúcido (Badge / Pill)** | `bg-emerald-50` / `border-emerald-300` | `#ECFDF5` / `#6EE7B7` | `dark:bg-emerald-500/10` / `dark:border-emerald-500/30` | `rgba(16,185,129,0.1)` | `bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30` |

### Snippet JSX: Container Canônico Elevado com Borda e Sombra
```tsx
<div className="bg-white dark:bg-[#000000] border border-slate-200/80 dark:border-[#1E293B] rounded-2xl p-4 sm:p-6 shadow-sm transition-colors">
  {/* Conteúdo encapsulado */}
</div>
```

---

## 2. Tipografia, Textos e Ícones Estruturais

A tipografia do sistema é baseada na família Sans-serif padrão com pesos assertivos (`font-semibold`, `font-bold` e `font-black`), garantindo leitura veloz em frentes de caixa e armazéns sob luz solar direta.

| Nível Tipográfico / Elemento | Tema Claro (Light) | Hex Claro | Tema Escuro (Dark) | Hex Escuro | Tailwind Pareado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Título Primário (H1 / Destaque)** | `text-slate-900` | `#0F172A` | `dark:text-white` / `dark:text-slate-100` | `#FFFFFF` | `text-slate-900 dark:text-white font-black` |
| **Título Secundário / Card (H2)** | `text-slate-800` | `#1E293B` | `dark:text-slate-100` | `#F1F5F9` | `text-slate-800 dark:text-slate-100 font-extrabold` |
| **Labels / Rótulos de Campos** | `text-slate-700` | `#334155` | `dark:text-slate-300` | `#CBD5E1` | `text-slate-700 dark:text-slate-300 font-medium text-xs` |
| **Subtítulos / Legendas / Categorias** | `text-slate-500` | `#64748B` | `dark:text-slate-400` | `#94A3B8` | `text-slate-500 dark:text-slate-400 text-xs` |
| **Placeholders de Input** | `placeholder-slate-400` | `#94A3B8` | `dark:placeholder-slate-500` | `#64748B` | `placeholder-slate-400 dark:placeholder-slate-500` |
| **Ícones de Navegação e Sistema** | `text-slate-900` | `#0F172A` | `dark:text-white` | `#FFFFFF` | `text-slate-900 dark:text-white stroke-[2.25]` |
| **Ícones Auxiliares / Ações Secundárias** | `text-slate-500` | `#64748B` | `dark:text-slate-400` | `#94A3B8` | `text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white` |

### Snippet JSX: Hierarquia Tipográfica Canônica
```tsx
<div className="space-y-1">
  <div className="flex items-center gap-2">
    <span className="text-slate-900 dark:text-white font-black text-base sm:text-lg tracking-tight">
      PRODUTO EXEMPLO
    </span>
    <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">
      R$ 49,90
    </span>
  </div>
  <p className="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
    BEBIDAS & DESTILADOS • SKU: BE0042
  </p>
</div>
```

---

## 3. Cabeçalho Mobile Global (`MobileHeader`)

O [`MobileHeader`](file:///c:/Users/User/Documents/HUBI/src/components/layout/MobileHeader.tsx) é o componente unificado de navegação no mobile (`h-14 sm:h-16`). Ele consolida a tríade ergonômica:
1. **Botão Voltar (`<`)**: Retrocede no histórico de rotas com fallback inteligente ou invoca rotina de confirmação (`onVoltar`).
2. **Menu Hambúrguer (`☰`)**: Abre o menu lateral responsivo através do `useMenu()`.
3. **Título e Ações de Contexto**: Ações contextuais de IA, busca, compartilhamento ou adição de itens.

### Snippet JSX: Implementação Exata do `MobileHeader`
```tsx
import React from 'react';
import { ArrowLeft, Menu, Sparkles, Plus } from 'lucide-react';

export const MobileHeaderExemplo: React.FC = () => {
  return (
    <header className="h-14 sm:h-16 border-b border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#0B0F17] px-3 sm:px-4 flex items-center justify-between shrink-0 sticky top-0 z-20 select-none transition-colors">
      {/* Bloco Esquerda: [ Voltar ] [ Menu ] [ Título & Subtítulo ] */}
      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
        {/* Botão Voltar */}
        <button
          type="button"
          onClick={() => window.history.back()}
          className="p-1.5 sm:p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1E293B] text-slate-800 dark:text-slate-200 transition cursor-pointer shrink-0"
          title="Voltar"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Botão Menu Hambúrguer */}
        <button
          type="button"
          onClick={() => {}}
          className="p-1.5 sm:p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1E293B] text-slate-900 dark:text-white transition cursor-pointer shrink-0"
          title="Menu Principal"
          aria-label="Menu Principal"
        >
          <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-slate-900 dark:text-white stroke-[2.25]" />
        </button>

        {/* Título e Subtítulo */}
        <div className="min-w-0 flex-1">
          <h1 className="font-black text-sm sm:text-base text-slate-900 dark:text-white tracking-tight truncate leading-tight">
            Produtos & Estoque
          </h1>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">
            42 itens cadastrados
          </p>
        </div>
      </div>

      {/* Bloco Direita: Ações Contextuais */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          className="px-2.5 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition select-none bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
        >
          <Sparkles className="w-4 h-4 text-emerald-500" />
          <span>IA</span>
        </button>
        <button
          type="button"
          className="p-2 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition cursor-pointer"
          title="Novo Produto"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>
      </div>
    </header>
  );
};
```

---

## 4. Listagem de Produtos & Cards (Mobile e Desktop)

A listagem móvel e desktop é otimizada para alta densidade informacional, mantendo altura uniforme, cantos arredondados padronizados (`rounded-xl` / `rounded-2xl`) e contenção estrita de texto com `line-clamp-2`.

### Container do Card e Estados
- **Fundo Padrão:** `bg-white dark:bg-[#000000]`
- **Hover/Toque:** `hover:bg-slate-50 dark:hover:bg-[#0D111A]`
- **Borda Divisória:** `divide-slate-100 dark:divide-[#1E293B]`
- **Padding:** `p-4`

### Thumbnail de Foto vs. Estado Canônico "Sem Foto"
- **Com Foto:** Container `w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shrink-0 shadow-sm bg-white dark:bg-slate-900` com imagem `object-cover`.
- **Sem Foto:** Mesma geometria estrita com fundo neutro suave, ícone `ImageOff` com opacidade atenuada e texto "Sem foto".
  - Light: `bg-slate-50 border border-slate-200 text-slate-400`
  - Dark: `dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-500`

### Pílula de Preço Fixo (Direita)
- **Preço Regular:**
  - Light: `bg-slate-800/80 border border-slate-700/60 text-white font-semibold text-xs tracking-tight shadow-sm`
  - Dark: `bg-slate-800/80 border border-slate-700/60 text-white font-semibold text-xs tracking-tight shadow-sm`
- **Preço Promocional:**
  - `bg-emerald-500/10 border border-emerald-500 text-emerald-700 dark:text-emerald-400 font-semibold text-xs`

### Snippet JSX: Linha Canônica da Listagem de Produtos
```tsx
import React from 'react';
import { ImageOff } from 'lucide-react';

interface CardProdutoProps {
  nome: string;
  categoria: string;
  preco: number;
  precoPromocional?: number;
  fotoUrl?: string;
  onClick: () => void;
}

export const ItemListaProduto: React.FC<CardProdutoProps> = ({
  nome,
  categoria,
  preco,
  precoPromocional,
  fotoUrl,
  onClick
}) => {
  const temPromocao = Boolean(precoPromocional && precoPromocional > 0);

  return (
    <div
      onClick={onClick}
      className="p-4 flex items-center justify-between bg-white dark:bg-[#000000] hover:bg-slate-50 dark:hover:bg-[#0D111A] border-b border-slate-100 dark:border-[#1E293B] transition-colors cursor-pointer select-none"
    >
      {/* Lado Esquerdo: Miniatura e Textos */}
      <div className="flex items-center gap-3.5 flex-1 min-w-0 pr-2">
        {/* Frame da Foto / Placeholder */}
        <div className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center shrink-0 shadow-xs bg-white dark:bg-slate-900">
          {fotoUrl ? (
            <img src={fotoUrl} alt={nome} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-1 bg-slate-50 dark:bg-slate-900/80 text-slate-400 dark:text-slate-500 text-center select-none">
              <ImageOff className="w-4 h-4 opacity-50 mb-0.5" />
              <span className="text-[9px] font-medium leading-none tracking-tight">Sem foto</span>
            </div>
          )}
        </div>

        {/* Textos com Truncamento Seguro */}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase line-clamp-2 leading-snug">
            {nome}
          </h2>
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5 truncate">
            {categoria}
          </p>
        </div>
      </div>

      {/* Lado Direito: Pílula de Preço */}
      <div className="shrink-0 ml-3 text-right">
        {temPromocao ? (
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-400 line-through font-semibold mb-0.5">
              R$ {preco.toFixed(2).replace('.', ',')}
            </span>
            <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500 text-emerald-700 dark:text-emerald-400 font-semibold text-xs tracking-tight shadow-2xs">
              R$ {precoPromocional?.toFixed(2).replace('.', ',')}
            </span>
          </div>
        ) : (
          <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-white font-semibold text-xs tracking-tight shadow-2xs">
            R$ {preco.toFixed(2).replace('.', ',')}
          </span>
        )}
      </div>
    </div>
  );
};
```

---

## 5. Pílulas de Ação (Action Pills) e Switches de Status

As **Action Pills** fornecem comandos contextuais rápidos de altura uniforme (`h-10`) com alinhamento entre ícones e legendas.

### Comparativo Bitemático: Pílulas de Ação
- **Tema Claro (Light):** `bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 shadow-2xs`
- **Tema Escuro (Dark):** `dark:bg-[#000000] dark:hover:bg-[#0D111A] dark:border-[#1E293B] dark:text-slate-200`
- **Ícones Internos:** `text-slate-500 dark:text-slate-300`

### Toggle Switch "Ativo / Inativo"
- **Container Externo:** `relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out`
  - Estado Ativo: `bg-emerald-500 dark:bg-emerald-500`
  - Estado Inativo: `bg-slate-300 dark:bg-slate-700`
- **Círculo Interno:** `pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out`
  - Estado Ativo: `translate-x-5`
  - Estado Inativo: `translate-x-0`

### Snippet JSX: Pílulas de Ação & Toggle Switch
```tsx
import React, { useState } from 'react';
import { Sparkles, Upload, Globe } from 'lucide-react';

export const ExemploAcoesEToggle: React.FC = () => {
  const [ativo, setAtivo] = useState(true);

  return (
    <div className="space-y-4 p-4 bg-white dark:bg-[#000000] border border-slate-200 dark:border-[#1E293B] rounded-2xl max-w-md">
      {/* Linha do Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-slate-900 dark:text-white block">Status do Item</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Visibilidade nas vendas e PDV</span>
        </div>
        <button
          type="button"
          onClick={() => setAtivo(!ativo)}
          className="flex items-center gap-2 cursor-pointer focus:outline-none"
        >
          <span className={`text-xs font-bold ${ativo ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
            {ativo ? 'Ativo' : 'Inativo'}
          </span>
          <div
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              ativo ? 'bg-emerald-500 dark:bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                ativo ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </div>
        </button>
      </div>

      {/* Pílulas de Ação Verticais */}
      <div className="space-y-2">
        <button
          type="button"
          className="w-full h-10 px-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer bg-white hover:bg-slate-50 dark:bg-[#000000] dark:hover:bg-[#0D111A] border border-slate-300 dark:border-[#1E293B] text-slate-700 dark:text-slate-200 transition shadow-2xs"
        >
          <div className="flex items-center gap-2 truncate">
            <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
            <span className="font-bold truncate">Preencher com nossa IA</span>
          </div>
          <span className="text-[10px] text-slate-400">Automático</span>
        </button>

        <button
          type="button"
          className="w-full h-10 px-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer bg-white hover:bg-slate-50 dark:bg-[#000000] dark:hover:bg-[#0D111A] border border-slate-300 dark:border-[#1E293B] text-slate-700 dark:text-slate-200 transition shadow-2xs"
        >
          <div className="flex items-center gap-2 truncate">
            <Upload className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
            <span className="font-bold truncate">Galeria de Fotos</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">(0/7)</span>
        </button>

        <button
          type="button"
          className="w-full h-10 px-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer bg-white hover:bg-slate-50 dark:bg-[#000000] dark:hover:bg-[#0D111A] border border-slate-300 dark:border-[#1E293B] text-slate-700 dark:text-slate-200 transition shadow-2xs"
        >
          <div className="flex items-center gap-2 truncate">
            <Globe className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
            <span className="font-bold truncate">Pesquisar Fotos na Web</span>
          </div>
        </button>
      </div>
    </div>
  );
};
```

---

## 6. Modal / Gaveta de Filtros e Badges Ativas

A gaveta de filtros apresenta opções em cartões clicáveis com caixas de marcação personalizadas (`Check`) e chips de filtros aplicados na barra horizontal.

### Estados dos Botões de Filtro
- **Não Selecionado:**
  - Light: `bg-white border-slate-200 text-slate-700`
  - Dark: `dark:bg-[#000000] dark:border-[#1E293B] dark:text-slate-300`
- **Selecionado:**
  - Light: `bg-[#ECFDF5] border-emerald-600 text-emerald-800 font-bold`
  - Dark: `dark:bg-[#000000] dark:border-[#10B981] dark:text-[#34D399] font-bold`

### Chips / Badges de Filtros Ativos
- **Chip Selecionado (com botão 'X'):**
  - `border border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 shrink-0 font-medium`
- **Botão de Ação Primária:**
  - `w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md transition text-sm sm:text-base cursor-pointer`

### Snippet JSX: Opção de Filtro e Barra de Chips Ativos
```tsx
import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

export const FiltrosExemplo: React.FC = () => {
  const [selecionado, setSelecionado] = useState(true);

  return (
    <div className="space-y-4">
      {/* Barra de Chips Ativos com Botão 'X' */}
      <div className="bg-slate-50 dark:bg-[#0B0F17] border-b border-slate-200 dark:border-[#1E293B] px-3 py-2 flex items-center gap-1.5 overflow-x-auto">
        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
          Filtros:
        </span>
        <div className="border border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 shrink-0 font-medium">
          <span>Sem Estoque 🔴</span>
          <button
            type="button"
            className="p-0.5 rounded-full hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Cartão de Seleção de Filtro */}
      <div
        onClick={() => setSelecionado(!selecionado)}
        className={`flex items-center justify-between p-3 transition cursor-pointer select-none rounded-xl border ${
          selecionado
            ? 'bg-[#ECFDF5] dark:bg-[#000000] border-emerald-600 dark:border-[#10B981] text-emerald-800 dark:text-[#34D399] font-bold'
            : 'bg-white dark:bg-[#000000] border-slate-200 dark:border-[#1E293B] text-slate-700 dark:text-slate-300'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
              selecionado ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 dark:border-slate-700'
            }`}
          >
            {selecionado && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
          </div>
          <span className="text-xs sm:text-sm">Mínimo de Estoque</span>
        </div>
        <span className="text-xs">🟡</span>
      </div>

      {/* Botão de Rodapé da Gaveta */}
      <button
        type="button"
        className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md transition text-sm cursor-pointer"
      >
        Filtrar Produtos
      </button>
    </div>
  );
};
```

---

## 7. Formulários e Inputs

Os inputs do sistema garantem consistência milimétrica com foco e anel visual em tom esmeralda (`focus:border-emerald-600 dark:focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500`).

### Especificação dos Campos de Entrada
- **Campos de Texto / EAN / Código:**
  - Light: `bg-white border-slate-200 text-slate-900 placeholder-slate-400`
  - Dark: `dark:bg-[#000000] dark:border-slate-800 dark:text-white dark:placeholder-slate-500`
- **Dropdowns / Selects:**
  - Light: `bg-white border-slate-200 text-slate-900`
  - Dark: `dark:bg-[#000000] dark:border-slate-800 dark:text-white`
- **Valores Numéricos / Preço:**
  - Alinhamento à direita, font-mono ou font-bold: `text-right font-bold`

### Snippet JSX: Conjunto de Inputs Canônicos do Formulário
```tsx
import React, { useState } from 'react';

export const FormularioInputsExemplo: React.FC = () => {
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const [categoria, setCategoria] = useState('');

  return (
    <div className="space-y-4 max-w-xl p-6 bg-white dark:bg-[#000000] border border-slate-200/80 dark:border-[#1E293B] rounded-2xl">
      {/* Campo de Texto Padrão */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Nome do Produto *
        </label>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Coca-Cola Lata 350ml"
          className="w-full h-11 bg-white dark:bg-[#000000] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl px-3.5 text-xs focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-medium transition-colors"
        />
      </div>

      {/* Grid Duplo: Categoria e Preço */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Select */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Categoria *
          </label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="w-full h-11 bg-white dark:bg-[#000000] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl px-3.5 text-xs focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-medium transition-colors"
          >
            <option value="">Selecione uma Categoria...</option>
            <option value="1">Bebidas</option>
            <option value="2">Alimentos</option>
            <option value="3">Higiene</option>
          </select>
        </div>

        {/* Campo de Preço */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Preço de Venda (R$) *
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
              R$
            </span>
            <input
              type="text"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              placeholder="0,00"
              className="w-full h-11 bg-white dark:bg-[#000000] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl pl-9 pr-3.5 text-xs font-bold text-right focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

## 8. Modal de Visor de Câmera Inline (Ergonomia Mobile)

Para eliminar problemas de OOM (*Out Of Memory*) em navegadores mobile Android e iOS, o visor de câmera HTML5 opera em tela cheia fixa com enquadramento por borda translúcida pontilhada.

### Snippet JSX: Visor de Câmera Bitemático em Tela Cheia
```tsx
import React, { useRef } from 'react';
import { Camera, X } from 'lucide-react';

interface VisorCameraProps {
  onCapturar: () => void;
  onFechar: () => void;
}

export const VisorCameraMobile: React.FC<VisorCameraProps> = ({ onCapturar, onFechar }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col justify-between p-4 text-white select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-white leading-tight">Fotografar Produto</h3>
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
              Enquadre o produto na guia
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Visor com Moldura Central */}
      <div className="w-full flex-1 max-h-[60vh] md:max-h-none bg-black rounded-2xl overflow-hidden relative border border-slate-800 flex items-center justify-center my-3 shadow-2xl">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {/* Moldura Guia */}
        <div className="absolute inset-6 sm:inset-10 border-2 border-dashed border-emerald-500/50 rounded-xl pointer-events-none flex items-center justify-center">
          <span className="text-[11px] font-bold text-emerald-400/80 bg-black/60 px-3 py-1 rounded-full uppercase tracking-wider backdrop-blur-xs shadow-sm">
            Posicione o produto aqui
          </span>
        </div>
      </div>

      {/* Barra de Ações Inferior */}
      <div className="flex items-center gap-3 w-full pt-1 pb-2">
        <button
          type="button"
          onClick={onFechar}
          className="flex-1 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm flex items-center justify-center transition cursor-pointer active:scale-98"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onCapturar}
          className="flex-2 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-lg active:scale-98"
        >
          <Camera className="w-4 h-4" />
          <span>Capturar Foto</span>
        </button>
      </div>
    </div>
  );
};
```

---

## 9. Sumário de Governança e Regras de Replicação

1. **Sem Injeção Inline de Estilo Arbitrário:** Manter estritamente os pares de classes Tailwind padronizados (`bg-white dark:bg-[#000000]`, `bg-slate-100 dark:bg-[#0B0F17]`, `border-slate-200 dark:border-[#1E293B]`).
2. **Ícones Fortemente Contrastados:** Em modo claro, botões de ação e ícones de navegação devem usar `text-slate-900` com `stroke-[2.25]`. No modo escuro, `dark:text-white`.
3. **Truncamento Obrigatório em Itens de Catálogo:** Nomes de produtos devem ter `line-clamp-2` com `leading-snug` ou `leading-[1.125rem]` para eliminar overflow ou vazamento sobre o preço.
4. **Sem Perda de Foco em Modais:** Qualquer componente de modal móvel deve herdar fundo escuro translúcido com `backdrop-blur-sm` e contraste absoluto de texto.
