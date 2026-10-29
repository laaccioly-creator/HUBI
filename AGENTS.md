# 🚀 DIRETRIZES PERMANENTES DO WORKSPACE (AGENTS.md)

Este documento define as regras de governança, restrições arquiteturais e protocolos de execução para todos os agentes, subagentes e instâncias do Antigravity IDE operando no repositório **HUBI**.

---

## ⚡ 1. RESPOSTAS EM DIFF & ECONOMIA DE TOKENS (`diff-patch-only`)
- **Proibição de Reescrita Integral:** É terminantemente proibido reescrever arquivos completos com 300+ linhas de código em respostas no chat ou commits.
- **Formato Mandatório:** Toda alteração de código deve ser feita via ferramentas pontuais de patch ou exibida como unified diff (`diff --git`), contendo apenas as linhas adicionadas/alteradas e no máximo 3 linhas de contexto adjacente.
- **Inspeção Cirúrgica de Arquivos:** Ao analisar arquivos grandes (`PosCheckout.tsx`, `CartContext.tsx`, `ShippingSettingsScreen.tsx`, etc.), ler estritamente os trechos, tipos e funções envolvidos através de `StartLine` e `EndLine`.

---

## 🛡️ 2. BLINDAGEM RLS & MULTI-TENANT NO SUPABASE (`supabase-rls-guard`)
- **Isolamento de Tenant Obrigatório:** Toda e qualquer tabela pública (`public.*`) criada via migration ou DDL deve conter:
  1. `ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;`
  2. Políticas de segurança (`POLICY`) para `SELECT`, `INSERT`, `UPDATE` e `DELETE` aplicando:
     `USING (public.usuario_pertence_loja(loja_id))` e `WITH CHECK (public.usuario_pertence_loja(loja_id))`
     com validação cruzada do usuário autenticado (`auth.uid()`).
- **Camada Frontend (React/TypeScript):** Toda consulta ou mutação via Supabase Client deve explicitar `.eq('loja_id', loja.id)`.

---

## 🔐 3. SANITIZAÇÃO DE PII & PROTEÇÃO CONTRA VAZAMENTOS (`pii-leak-detector`)
- **Conformidade LGPD:** Proibido o log, transporte ou exposição pública de dados de identificação de clientes (CPF, WhatsApp, e-mail, coordenadas de geolocalização) ou chaves/segredos de API (`serpapi_key`, tokens Uber Direct e Melhor Envio).
- **Tratamento de Erros:** Erros de comunicação com PostgreSQL/Supabase devem ser interceptados e convertidos em mensagens amigáveis em `pt-BR`, sem expor SQLSTATE, nomes de tabelas internas ou stack traces.

---

## 🧱 4. GOVERNANÇA ANTI-JSONB (`anti-jsonb-linter`)
- **Proibição de Schemas Não-Estruturados:** Fica vedada a adição de colunas genéricas do tipo `JSONB` para armazenamento de entidades essenciais do negócio (vendas, fretes, entregas, pagamentos, itens).
- **Normalização Obrigatória:** A modelagem de dados deve utilizar colunas nativas e tipadas (`NUMERIC`, `TIMESTAMP`, `VARCHAR`, chaves estrangeiras) em tabelas relacionais especializadas.

---

## 🧭 5. ROTEAMENTO DINÂMICO DA SUÍTE MANTIS (`mantis-router`)
- **Otimização de Contexto:** Não carregar as 18 sub-skills do Mantis permanentemente no prompt de inicialização.
- **Inicialização Padrão:** Carregar exclusivamente a `mantis-meta-agent`. As sub-skills (`mantis-researcher`, `mantis-threat-model`, `mantis-review`, `mantis-patch`, etc.) devem ser acionadas dinamicamente sob demanda quando solicitadas explicitamente (ex: `/mantis-audit`).

---

## 🐘🐟 6. PROTOCOLO ATÔMICO DE EXECUÇÃO: ELEFANTES E PEIXINHOS (`atomic-execution-protocol`)
- **Escopo Estrito e Prevenção de Regressões:** Toda tarefa deve focar unicamente no subproblema demandado. É expressamente vedado alterar, simplificar ou excluir lógicas, botões, gateways ou componentes adjacentes homologados (ex.: ao ajustar um meio de pagamento, jamais remover outros gateways ativos ou alterar regras de métodos já validados).
- **Desacoplamento Arquitetural Mandatório:** Manter isolamento absoluto entre o PDV Desktop / Balcão (`PosCheckout.tsx`, `ModalPagamentoFechamento.tsx`) e a experiência do Catálogo Online (`ModalPagamentoFechamentoCatalogo.tsx`, `CatalogoPublico.tsx`). Nenhuma lógica de autoatendimento ao consumidor final pode impactar a frente de caixa física.
- **Validação e Isolamento Funcional:** Cada intervenção cirúrgica é tratada como unidade atômica independente: validação imediata de tipos em TypeScript (`npx tsc --noEmit`), integridade de importações e garantia de build de produção (`npm run build`) sem quebras.
