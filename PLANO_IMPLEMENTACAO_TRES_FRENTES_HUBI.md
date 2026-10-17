# 📋 PLANO DE IMPLEMENTAÇÃO E ARQUITETURA TÉCNICA — HUBI (OAUTH ML, PARÂMETROS GLOBAIS & TARJA TRIAL)

Este documento detalha o planejamento técnico e arquitetural para as **3 Frentes Prioritárias** do sistema HUBI, estruturado de acordo com os protocolos de governança permanentes (`diff-patch-only`, `supabase-rls-guard`, `pii-leak-detector` e `anti-jsonb-linter`).

---

## 🏗️ Visão Geral da Arquitetura

```mermaid
flowchart TD
    subgraph "Frente 1: OAuth Mercado Livre (Edge Function ml-oauth)"
        A[Navegador Lojista] -->|1. GET ?action=authorize_url + Bearer JWT| B(Edge Function: ml-oauth)
        B -->|2. Assina state via HMAC-SHA256| C[Mercado Livre Auth]
        C -->|3. Redirect GET ?code=...&state=... SEM Header| B
        B -->|4. Valida HMAC + POST /oauth/token| D[API Mercado Livre]
        B -->|5. Upsert via SERVICE_ROLE_KEY| E[(public.marketplace_contas)]
        B -->|6. HTTP 302 Redirect| F[/config?ml_status=success]
    end

    subgraph "Frente 2 & 3: Parâmetros Globais HUBI & Tarja de Trial"
        G[Super Admin HUBI] -->|Edita Card ⚙️ Parâmetros HUBI| H[(public.configuracoes_plataforma)]
        H -->|Leitura Pública Autenticada| I[Hook: useAssinaturaStatus]
        H -->|Leitura Service Role| J(Edge Function: hubi-criar-assinatura-mp)
        I -->|Cálculo: dias_trial - dias_uso| K[Componente: BannerAssinaturaTop]
    end
```

---

## 🗄️ ETAPA 1: Banco de Dados Relacional & Blindagem RLS (`supabase-rls-guard` & `anti-jsonb-linter`)

### 1.1. Nova Migration: `supabase/migrations/20261017160000_configuracoes_plataforma_global.sql`
Para eliminar valores comerciais fixos (*hardcoded*) e respeitar a **Governança Anti-JSONB**, será criada a tabela relacional tipada *singleton* `public.configuracoes_plataforma` (garantindo apenas 1 linha ativa no sistema via restrição `CHECK (id = 1)`).

#### Estrutura de Colunas Tipadas:
| Coluna | Tipo PostgreSQL | Default | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY` | `1` | Identificador único com `CHECK (id = 1)` (Singleton) |
| `dias_trial` | `INTEGER NOT NULL` | `7` | Prazo padrão de degustação gratuita em dias |
| `valor_mensal_anual` | `NUMERIC(10,2) NOT NULL` | `49.90` | Valor mensal de referência no plano anual (`R$ 49,90`) |
| `valor_anual_total` | `NUMERIC(10,2) NOT NULL` | `598.80` | Valor cheio da anuidade (`12x R$ 49,90 = R$ 598,80`) |
| `valor_plano_mensal_avulso` | `NUMERIC(10,2) NOT NULL` | `69.90` | Valor de assinatura mensal avulsa sem fidelidade |
| `desconto_pix_percentual` | `NUMERIC(5,2) NOT NULL` | `5.00` | Percentual de desconto para pagamento à vista no PIX |
| `aceita_cartao_debito` | `BOOLEAN NOT NULL` | `true` | Habilita/desabilita débito à vista no checkout |
| `max_parcelas_cartao` | `INTEGER NOT NULL` | `12` | Limite máximo de parcelas no cartão de crédito (`1` a `12`) |
| `parcelas_sem_juros` | `INTEGER NOT NULL` | `12` | Quantidade de parcelas sem acréscimo de juros |
| `email_super_admin` | `VARCHAR(255) NOT NULL` | `'admin@hubi.app'` | E-mail mestre autorizado a editar configurações globais |
| `atualizado_em` | `TIMESTAMPTZ NOT NULL` | `now()` | Carimbo de tempo da última modificação |
| `atualizado_por` | `UUID REFERENCES auth.users(id)` | `NULL` | ID do usuário autenticado que efetuou a alteração |

#### Correção do Default de `trial_fim_em` na tabela `public.lojas`:
- Lojas criadas anteriormente tinham `trial_fim_em` calculado com `+30 days` no banco (motivo pelo qual o banner exibia **"Restam 28 dias"** após 2 dias de criação).
- A migration atualizará o default da coluna `trial_fim_em` em `public.lojas` para `(now() + interval '7 days')` e criará uma *trigger* `before insert` que lê `dias_trial` diretamente de `public.configuracoes_plataforma`.

#### Políticas de Segurança (RLS):
1. `ALTER TABLE public.configuracoes_plataforma ENABLE ROW LEVEL SECURITY;`
2. **Função Verificadora `public.eh_super_admin_plataforma()` (`SECURITY DEFINER`):**
   - Verifica se o `auth.uid()` possui e-mail igual ao `email_super_admin` registrado na tabela ou se possui a flag de super admin em `auth.users` / `organizacoes`.
3. **Política de `SELECT` (`leitura_autenticada_config_plataforma`):**
   - `USING (auth.uid() IS NOT NULL)`: Qualquer tenant autenticado pode ler os parâmetros comerciais para exibição na tarja e tela de planos.
4. **Política de `UPDATE` / `INSERT` (`escrita_restrita_super_admin`):**
   - `USING (public.eh_super_admin_plataforma()) WITH CHECK (public.eh_super_admin_plataforma())`: Bloqueia qualquer tentativa de escrita por lojistas comuns diretamente no banco.

---

## ⚡ ETAPA 2: Backend & Supabase Edge Functions

### 2.1. Frente 1 — Isolamento do Callback OAuth no Mercado Livre (`supabase/functions/ml-oauth/index.ts`)

#### Causa Raiz do Erro `UNAUTHORIZED_NO_AUTH_HEADER`:
1. **Gateway do Supabase:** Por padrão, funções implantadas sem a flag `--no-verify-jwt` (ou sem `verify_jwt = false` no `supabase/config.toml`) são barradas pelo API Gateway da Supabase antes mesmo de executar o código Deno se o cabeçalho `Authorization: Bearer <anon_key>` não estiver presente. Como o redirecionamento `GET` vem direto do navegador após o login no Mercado Livre (`https://auth.mercadolivre.com.br`), o navegador não envia headers customizados.
2. **Fluxo Interno da Função:** Dentro do `index.ts`, a rota `GET` distingue entre a chamada autenticada do lojista (`?action=authorize_url`) e o retorno público do Mercado Livre (`?code=...&state=...`).

#### Plano de Ação em `ml-oauth`:
1. **Configuração de Deploy Sem Trava Global de Gateway (`supabase/config.toml`):**
   - Definir `[functions.ml-oauth]` com `verify_jwt = false` para permitir que o redirecionamento HTTP GET do navegador alcance a função. A validação do JWT continua sendo feita **manualmente e de forma estrita dentro do código** para todas as rotas internas.
2. **Isolamento da Rota de Callback (`GET` com `code` e `state`):**
   - Se `req.method === "GET"` e `url.searchParams.has("code") && url.searchParams.has("state")`:
     - **Não exigir header `Authorization`**.
     - **Validação Criptográfica Anti-CSRF:** Executar `validarStateHmac(state, stateSecret)` usando `ML_STATE_HMAC_SECRET`. Verifica se a assinatura HMAC-SHA256 confere e se o *timestamp* embutido no `state` não expirou (janela máxima de 15 minutos). Extrai com segurança o `loja_id`.
     - **Troca do Código por Tokens:** Executar `POST https://api.mercadolibre.com/oauth/token` enviando `grant_type=authorization_code`, `client_id`, `client_secret`, `code` e `redirect_uri`.
     - **Enriquecimento de Perfil:** Consultar `GET https://api.mercadolibre.com/users/me` com o `access_token` recém-obtido para capturar `ml_nickname` e `ml_site_id`.
     - **Persistência com Service Role:** Instanciar `createClient(supabaseUrl, supabaseServiceRoleKey)` e executar `.upsert(..., { onConflict: 'loja_id,provedor' })` na tabela `public.marketplace_contas` com `status_conexao = 'conectado'`.
     - **Redirecionamento HTTP 302:** Retornar `Response.redirect("${hubiFrontendUrl}/config?ml_status=success&nickname=...", 302)` levando o lojista de volta para a tela de Configurações do HUBI.
3. **Proteção Mantida nas Demais Rotas:**
   - Na rota `GET ?action=authorize_url` e nas rotas `POST` administrativas, exigir obrigatoriamente `req.headers.get("Authorization")`, validar o usuário com `supabaseUserClient.auth.getUser()` e checar se o usuário pertence à `loja_id` na tabela `public.usuarios_loja`.

---

### 2.2. Frente 2 — Integração do Checkout com os Parâmetros Globais (`supabase/functions/hubi-criar-assinatura-mp/index.ts`)
- Atualizar a Edge Function `hubi-criar-assinatura-mp` para consultar `public.configuracoes_plataforma` (via `SUPABASE_SERVICE_ROLE_KEY`) antes de montar o payload do Mercado Pago:
  - Substituir as constantes fixas `VALOR_ANUAL_TOTAL = 598.80` e `PARCELAS_MAXIMAS = 12` pelos campos dinâmicos `valor_anual_total`, `valor_mensal_anual` e `max_parcelas_cartao` vindos do banco.

---

## 💻 ETAPA 3: Frontend, Serviços e Componentes Visuais (`diff-patch-only`)

### 3.1. Frente 2 — Serviço e Card de Parâmetros Globais HUBI (Super Admin)

1. **Contrato de Tipagem (`src/types.ts`):**
   - Adicionar a interface `ConfiguracoesPlataformaHubi` refletindo fielmente as colunas da tabela `public.configuracoes_plataforma`.
2. **Serviço (`src/services/configuracoesPlataformaService.ts`):**
   - `obterParametrosPlataforma()`: busca a linha `id = 1` de `public.configuracoes_plataforma` (com fallback seguro em memória caso offline: `dias_trial: 7`, `valor_mensal_anual: 49.90`).
   - `salvarParametrosPlataforma(dados)`: executa `.update({ ...dados, atualizado_em: new Date().toISOString(), atualizado_por: user.id }).eq('id', 1)`.
3. **Componente Restrito (`src/components/configuracoes/CardParametrosHubiAdmin.tsx`):**
   - Exibido na tela de Configurações (`ConfiguracoesLoja.tsx`) **exclusivamente** quando o usuário logado for identificado como Super Admin (`ehSuperAdmin`).
   - Contém campos numéricos e seletores claros para:
     - **Prazo de Degustação (`dias_trial`):** em dias (ex: `7`).
     - **Valor Mensal no Plano Anual (`R$`):** ex: `49,90` (calcula e exibe o total anual automaticamente: `R$ 598,80`).
     - **Valor do Plano Mensal Avulso (`R$`):** ex: `69,90`.
     - **Regras de Checkout:** Desconto PIX (`%`), Aceitar Débito (Toggle), Máximo de Parcelas (`1x` a `12x`) e Parcelas sem Juros.
   - Botão `[ Salvar Parâmetros Globais ]` com feedback via modal/toast e atualização imediata em tela.

---

### 3.2. Frente 3 — Cálculo Dinâmico Baseado em `criado_em` e `dias_trial` (`src/hooks/useAssinaturaStatus.ts`)

#### Por que estava exibindo "28 dias"?
- O cálculo anterior priorizava a coluna `loja.trial_fim_em` do banco de dados, que havia sido populada na criação da loja com `now() + 30 days`. Assim, uma loja com 2 dias de uso exibia `30 - 2 = 28 dias`.

#### Nova Regra de Cálculo Determinística:
1. O hook `useAssinaturaStatus` carregará `dias_trial` (padrão `7`) e `valor_mensal_anual` (padrão `49,90`) da tabela `configuracoes_plataforma`.
2. **Fórmula de Dias Restantes Baseada na Criação da Loja (`loja.criado_em`):**
   - `Data Expiração Trial = new Date(loja.criado_em).getTime() + (dias_trial * 86400000)`
   - `Dias Restantes = Math.max(0, Math.ceil((Data Expiração Trial - agoraMs) / 86400000))`
   - *Evolução Diária:*
     - Dia 0 (dia do cadastro): **Restam 7 dias**
     - Após 24h (1º dia completo de uso): **Restam 6 dias**
     - Após 48h (2º dia completo de uso): **Restam 5 dias**
     - Quando `Dias Restantes <= 0`: status passa para `BLOQUEADO`.
3. O hook também exporá `valorMensalReferencia` (formatado em `pt-BR`, ex: `49,90`) para que o banner exiba dinamicamente o preço definido pelo Super Admin.

---

### 3.3. Frente 3 — Padronização Visual da Tarja de Degustação (`src/components/assinatura/BannerAssinaturaTop.tsx`)

#### Especificação de UI/UX e Contraste:
1. **Container da Tarja:**
   - Classes fixas independentes do tema claro/escuro: `bg-red-600 border-b border-red-700 text-white px-4 py-2 text-xs shadow-md`.
2. **Layout Centralizado Lado a Lado:**
   - Container interno com `max-w-7xl mx-auto flex items-center justify-center relative`.
   - Bloco central com `flex flex-wrap items-center justify-center gap-2 text-center`:
     - Ícone `Sparkles` branco (`text-white`).
     - Frase corrida 100% em branco puro (`text-white !text-white`):
       > **Período de Degustação Gratuito:** Restam **6 dias** na loja **Nome da Loja**. Garanta o plano anual por apenas **R$ 49,90/mês**.
3. **Botão `"Assinar Agora →"` (Alto Contraste Sólido):**
   - Posicionado imediatamente ao lado de `"R$ 49,90/mês"`.
   - Estilo imune a variações de tema (sempre fundo branco com texto escuro):
     ```tsx
     className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white hover:bg-gray-100 text-gray-900 font-bold active:scale-95 shadow-sm transition disabled:opacity-50 cursor-pointer shrink-0"
     ```
   - Ícone `ArrowRight` e texto `"Assinar Agora"` explicitamente com `text-gray-900` para impedir que fiquem vermelhos ou invisíveis no tema claro/escuro.
4. **Botão Fechar (`X`):**
   - Mantido alinhado na extremidade direita (`absolute right-2`) em branco puro (`text-white hover:bg-white/20`).

---

## 📁 Resumo dos Arquivos a Serem Criados / Modificados

| Arquivo | Ação | Frente |
| :--- | :--- | :--- |
| `supabase/migrations/20261017160000_configuracoes_plataforma_global.sql` | **Criar** | Frente 2 & 3 (Tabela `configuracoes_plataforma`, RLS Super Admin e ajuste de `trial_fim_em`) |
| `supabase/config.toml` | **Patch** | Frente 1 (`verify_jwt = false` para `ml-oauth` aceitar redirect GET do navegador) |
| `supabase/functions/ml-oauth/index.ts` | **Patch** | Frente 1 (Rota de callback GET isolada, HMAC `state`, troca de token e redirect 302) |
| `supabase/functions/hubi-criar-assinatura-mp/index.ts` | **Patch** | Frente 2 (Leitura dinâmica dos preços e parcelas da tabela `configuracoes_plataforma`) |
| `src/types.ts` | **Patch** | Frente 2 (Interface `ConfiguracoesPlataformaHubi`) |
| `src/services/configuracoesPlataformaService.ts` | **Criar** | Frente 2 (CRUD singleton de configurações globais da plataforma) |
| `src/components/configuracoes/CardParametrosHubiAdmin.tsx` | **Criar** | Frente 2 (Interface restrita `"⚙️ Parâmetros HUBI"` para o Super Admin) |
| `src/components/ConfiguracoesLoja.tsx` | **Patch** | Frente 2 (Inclusão condicional do card `"⚙️ Parâmetros HUBI"` para o Super Admin) |
| `src/hooks/useAssinaturaStatus.ts` | **Patch** | Frente 2 & 3 (Cálculo dinâmico `criado_em + dias_trial` e consumo do preço dinâmico) |
| `src/components/assinatura/BannerAssinaturaTop.tsx` | **Patch** | Frente 3 (Texto 100% `text-white`, layout centralizado e botão `bg-white text-gray-900 font-bold`) |
