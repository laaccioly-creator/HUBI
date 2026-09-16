# 🚀 REGRAS E DIRETRIZES PERMANENTES: SISTEMA HUBI

Este arquivo define as regras globais, convenções arquiteturais e protocolos de ativação de ferramentas e skills para o assistente Antigravity no projeto **HUBI**.

---

## 🎯 1. ATIVAÇÃO PROATIVA DE SKILLS E FERRAMENTAS

O assistente deve manter prontidão contínua e acionar proativamente as skills disponíveis conforme o contexto da demanda:

- **Auditoria, Qualidade e Segurança (Suite Mantis):**
  - Para análise estrutural de vulnerabilidades, modelos de ameaça ou revisões defensivas de segurança, consultar e seguir as diretrizes das skills `mantis-*` (`mantis-researcher`, `mantis-threat-model`, `mantis-review`, `mantis-architecture`, `mantis-patch`, etc.).
  - Em correções críticas de segurança ou rotas expostas de banco/API, adotar o fluxo de validação e testes rigorosos.
- **Interfaces e Visualizações Ricas (`generative_ui`):**
  - Sempre que for benéfico apresentar diagramas de fluxo, gráficos de vendas/estoque, comparativos ou widgets interativos além de texto puro, utilizar os recursos da skill `generative_ui`.
- **Customizações e Governança do Antigravity (`agy-customizations`, `antigravity-guide`):**
  - Consultar para extensão de capacidades, regras, MCP servers e padronizações da IDE e do CLI.

---

## 📌 2. VISÃO GERAL E PILARES DO SISTEMA HUBI

O **HUBI** é uma plataforma de gestão e vendas multiplataforma (Mobile, Tablet e Web Desktop) desenvolvida para lojistas e autônomos com sincronização em tempo real.

### Pilares Fundamentais:
1. **PDV Multiplataforma (Frente de Caixa):** Interface veloz com leitor de código de barras, busca instantânea e atalhos rápidos tanto no celular quanto no computador.
2. **Múltiplas Tabelas de Preço por Volume:** Varejo, Atacado com quantidade mínima (ex: 6+ un), Autoatacado para fardos/lotes (ex: 24+ un) e Preço Promocional temporário.
3. **Controle de Estoque com Grade de Variações:** Até 2 eixos de variação por produto (ex: Tamanho P/M/G e Cor) com controle de estoque e código de barras individual por variação.
4. **Catálogo Online Integrado com WhatsApp:** Vitrine virtual pública (PWA) onde o cliente final escolhe os produtos, calcula taxa de entrega e envia o pedido formatado direto para o WhatsApp do lojista.
5. **Gestão de Clientes & Controle de Fiado:** Limite de crédito, saldo devedor, quitação parcial de fiados e emissão/envio de comprovante via WhatsApp.
6. **Fluxo de Caixa & Contas a Pagar:** Abertura e fechamento de caixa, conferência de quebra/sobra, fundo de troco, gestão de despesas fixas recorrentes e apuração de Lucro Líquido Real.
7. **Motor de Impressão Híbrido:**
   - **Térmica Bluetooth / ESC/POS (58mm e 80mm)** via Web Bluetooth API.
   - **Folhas A4 / PDF** para orçamentos e relatórios.
   - **Recibo Digital** para WhatsApp.
8. **Assistente Inteligente Rubi IA:** IA conversacional conectada aos dados da loja para insights, produtos parados e métricas.

---

## 🛠️ 3. STACK TECNOLÓGICA E CONVENÇÕES DE CÓDIGO

- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS + Lucide Icons + PWA (`vite-plugin-pwa`).
- **Backend / Persistência:** Supabase (PostgreSQL 15) com Row Level Security (RLS) e Supabase Realtime.
- **Áudio:** Web Audio API nativa.
- **Linguagem & Nomenclatura:** Código, commits, mensagens de erro, logs e nomes de tabelas/colunas sempre em **Português do Brasil (pt-BR)**.
- **Tema Visual:** Dark Slate com destaques em Emerald (`#10B981`) para ações primárias/sucessos e tipografia limpa.

---

## 🔒 4. SEGURANÇA, INTEGRIDADE E BANCO DE DADOS

- **Isolamento Multitenant:** Todas as consultas, inserções e mutações devem obrigatoriamente incluir e validar o `loja_id` e o usuário autenticado (`auth.uid()`).
- **Prevenção de Inconsistências:** Usar transações atômicas e travas quando lidar com fechamento de caixa e movimentações simultâneas de estoque.
- **Preservação de Código:** Nunca remover comentários explicativos, regras de negócio preexistentes ou tipos sem autorização explícita.
- **Qualidade de Entrega:** Código limpo, fortemente tipado com TypeScript, livre de `any` dispensáveis, sem placeholders ou mocks incompletos em produção.
