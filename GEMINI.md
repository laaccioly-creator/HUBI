# 🚀 REGRAS E DIRETRIZES PERMANENTES: SISTEMA HUBI

Este arquivo define as regras globais, convenções arquiteturais, protocolos de segurança e diretrizes permanentes de inicialização (Boot Engine) para o assistente Antigravity no projeto **HUBI**.

---

## ⚡ 1. DIRETRIZES DE BOOT ENGINE & ECONOMIA DE TOKENS (DIFF-PATCH-ONLY)

- **Regra de Output:** Em qualquer refatoração, bugfix ou implementação, é terminantemente proibido reescrever arquivos completos de 300+ linhas na resposta.
- **Padrão Mandatório de Patch:** Utilizar exclusivamente ferramentas de substituição pontual (`replace_file_content`) ou retornar blocos de unified diff (`diff --git`) com indicação cirúrgica das linhas alteradas e no máximo 3 linhas de contexto adjacente (`// ... código inalterado ...`).
- **Inspeção Econômica de Contexto:** Ao analisar arquivos extensos (`PosCheckout.tsx`, `CartContext.tsx`, etc.), ler estritamente os trechos, interfaces, tipos e blocos da função alvo através de intervalos delimitados (`StartLine` / `EndLine`) para otimizar os tokens de entrada.

---

## 🛡️ 2. BLINDAGEM RLS & MULTI-TENANT NO SUPABASE (SUPABASE-RLS-GUARD)

- **Isolamento Multitenant Estrito:** Toda migration, DDL ou tabela pública gerada deve conter obrigatoriamente:
  1. `ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;`
  2. Políticas `USING` e `WITH CHECK` isolando estritamente `loja_id` via função de segurança `public.usuario_pertence_loja(loja_id)` e verificação de autenticação `auth.uid()`.
  3. Toda query na camada de serviços React/TypeScript deve obrigatoriamente manter a cláusula `.eq('loja_id', loja.id)`.
- **Prevenção de Inconsistências:** Usar transações atômicas e travas ao lidar com fechamento de caixa e movimentações simultâneas de estoque.

---

## 🔐 3. SANITIZAÇÃO DE PII & PROTEÇÃO CONTRA VAZAMENTOS (PII-LEAK-DETECTOR)

- **Privacidade e Conformidade LGPD:** Proibir terminantemente o envio ou exposição de dados identificáveis de clientes (CPF, WhatsApp, e-mail, coordenadas de GPS) ou credenciais sensíveis/BYOK (`serpapi_key`, tokens de API da Uber Direct e Melhor Envio) em comandos `console.log`, logs de produção ou payloads públicos.
- **Tratamento Seguro de Erros:** Exceções de banco ou rede devem sempre exibir mensagens sanitizadas e amigáveis em `pt-BR`, jamais expondo o stack trace bruto ou metadados de schema do PostgreSQL para a interface final.

---

## 🧱 4. GOVERNANÇA ANTI-JSONB (ANTI-JSONB-LINTER)

- **Modelagem Relacional Pura:** Proibida a criação de colunas `JSONB` genéricas para entidades operacionais e de negócio críticas (fretes, pagamentos, rastreio, itens). Manter modelagem relacional normalizada com colunas nativas e tipadas no PostgreSQL.
- **Exceções Estritas:** O uso de campos de metadados flexíveis (`metadados` / `configuracoes_extras`) é restrito a parâmetros de customização de layout ou flags experimentais transitórias.

---

## 🧭 5. ROTEAMENTO DINÂMICO DA SUÍTE MANTIS (SOB DEMANDA)

- **Gestão de Contexto:** Não injetar as 18 sub-skills pesadas do Mantis permanentemente no prompt inicial do workspace.
- **Carregamento Condicional:** Manter ativa por padrão no boot apenas a supervisora `mantis-meta-agent`. As sub-skills (`mantis-chain`, `mantis-calibrate`, `mantis-history`, `mantis-researcher`, `mantis-patch`, etc.) são carregadas sob demanda exclusivamente mediante comando ou solicitação formal de auditoria (ex: `/mantis-audit`).

---

## 📌 6. VISÃO GERAL E PILARES DO SISTEMA HUBI

O **HUBI** é uma plataforma de gestão e vendas multiplataforma (Mobile, Tablet e Web Desktop) desenvolvida para lojistas e autônomos com sincronização em tempo real.

### Pilares Fundamentais:
1. **PDV Multiplataforma (Frente de Caixa):** Interface veloz com leitor de código de barras, busca instantânea e atalhos rápidos tanto no celular quanto no computador.
2. **Múltiplas Tabelas de Preço por Volume:** Varejo, Atacado com quantidade mínima (ex: 6+ un), Autoatacado para fardos/lotes (ex: 24+ un) e Preço Promocional temporário.
3. **Controle de Estoque com Grade de Variações:** Até 2 eixos de variação por produto com controle de estoque e código de barras individual por variação.
4. **Catálogo Online Integrado com WhatsApp:** Vitrine virtual pública (PWA) onde o cliente escolhe os produtos, calcula entrega e envia o pedido formatado direto para o WhatsApp do lojista.
5. **Gestão de Clientes & Controle de Fiado:** Limite de crédito, saldo devedor, quitação parcial de fiados e emissão/envio de comprovante via WhatsApp.
6. **Fluxo de Caixa & Contas a Pagar:** Abertura e fechamento de caixa, conferência de quebra/sobra, fundo de troco, gestão de despesas fixas recorrentes e apuração de Lucro Líquido Real.
7. **Motor de Impressão Híbrido:** Térmica Bluetooth / ESC/POS (58mm e 80mm), Folhas A4 / PDF e Recibo Digital para WhatsApp.
8. **Assistente Inteligente Rubi IA:** IA conversacional conectada aos dados da loja para insights, produtos parados e métricas.

---

## 🛠️ 7. STACK TECNOLÓGICA E CONVENÇÕES DE CÓDIGO

- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS + Lucide Icons + PWA (`vite-plugin-pwa`).
- **Backend / Persistência:** Supabase (PostgreSQL 15) com Row Level Security (RLS) e Supabase Realtime.
- **Áudio:** Web Audio API nativa.
- **Linguagem & Nomenclatura:** Código, commits, mensagens de erro, logs e nomes de tabelas/colunas sempre em **Português do Brasil (pt-BR)**.
- **Tema Visual:** Dark Slate com destaques em Emerald (`#10B981`) para ações primárias/sucessos e tipografia limpa.
- **Qualidade de Entrega:** Código limpo, fortemente tipado com TypeScript, livre de `any` dispensáveis, sem placeholders ou mocks incompletos em produção.
