# 🏗️ Plano de Implementação Arquitetural — Módulo de Monetização SaaS, Trial de 7 Dias, Renovação Anual e Checkout Mercado Pago

> **Status:** ⏸️ Aguardando Aprovação Formal para Execução  
> **Data do Planejamento:** 16/10/2026  
> **Conformidade de Governança:** `supabase-rls-guard`, `anti-jsonb-linter`, `pii-leak-detector` e `diff-patch-only` (`AGENTS.md` / `GEMINI.md`).

---

## 1. Diagnóstico dos Arquivos (Mapeamento de Impacto)

A inspeção cirúrgica da base de código e das documentações (`DOCUMENTACAO_SISTEMA.md` e `MAPA_COMPONENTES.md`) identificou os seguintes arquivos para criação e alteração:

### 🆕 Novos Arquivos a Serem Criados

| Caminho do Arquivo | Camada | Responsabilidade Técnica |
| :--- | :--- | :--- |
| `supabase/migrations/20261016160000_modulo_monetizacao_assinatura_anual.sql` | Banco de Dados (PostgreSQL) | Adição das colunas de ciclo de vida na tabela `public.lojas`, criação da tabela relacional `public.hubi_assinaturas_pagamentos`, índices, triggers de trial para novas lojas, backfill seguro para lojas legadas e políticas estritas de RLS. |
| `supabase/functions/hubi-criar-assinatura-mp/index.ts` | Backend / Edge Function | Geração server-side da Preferência de Checkout Pro do Mercado Pago (Plano Anual — R$ 598,80 em até 12x de R$ 49,90, Pix ou Débito) usando a credencial mestre (`MP_PLATFORM_ACCESS_TOKEN`), com `external_reference = loja.id` e gravação de registro pendente em `hubi_assinaturas_pagamentos`. |
| `supabase/functions/hubi-webhook-mp/index.ts` | Backend / Edge Function | Receptor público (`--no-verify-jwt`) de notificações `payment.created` / `payment.updated` do Mercado Pago. Consulta de autenticidade na API oficial do MP com token mestre, atualização atômica do histórico em `hubi_assinaturas_pagamentos` e extensão de `+365 dias` em `lojas.assinatura_fim_em`. |
| `src/hooks/useAssinaturaStatus.ts` | Front-end (Hook) | Motor centralizador do estado comercial da loja (`TRIAL_ATIVO`, `ANUIDADE_ATIVA`, `ALERTA_RENOVACAO`, `BLOQUEADO`), cálculo de dias restantes, disparo do checkout MP e assinatura WebSocket via Supabase Realtime na tabela `lojas`. |
| `src/components/assinatura/BannerAssinaturaTop.tsx` | Front-end (UI) | Componente responsivo (Desktop e Mobile) fixo no topo de `AppLayout.tsx` para os estados de **Trial Gratuito (7 dias)** e **Alerta de Renovação Anual (últimos 7 dias)**, com CTA direto `[Assinar Agora]` / `[Renovar Assinatura]`. |
| `src/components/assinatura/TelaBloqueioAssinatura.tsx` | Front-end (UI) | Overlay/tela irremovível de bloqueio operacional pós-vencimento com resumo comercial (R$ 49,90/mês no plano anual), botão de abertura do Checkout Mercado Pago, indicador de escuta em tempo real ("Aguardando confirmação...") e opção de logout/troca de conta. |

### ✏️ Arquivos Existentes a Serem Alterados (via Patch Pontual)

| Arquivo | Símbolo / Trecho Alvo | Alteração Prevista |
| :--- | :--- | :--- |
| `src/types.ts` | `Loja` (linhas 228–294) | Tipagem estrita de `StatusAssinaturaLoja = 'trial' \| 'ativo' \| 'atrasado' \| 'bloqueado'`, inclusão dos campos `status_assinatura`, `trial_fim_em`, `assinatura_fim_em` e `mp_preference_id` na interface `Loja`, além da interface `HubiAssinaturaPagamento`. |
| `src/contexts/AuthContext.tsx` | `cadastrarMinimalista` e `AuthProvider` | Inicialização explícita de `status_assinatura: 'trial'` e `trial_fim_em` (+7 dias) no payload de criação de novas lojas (em complemento ao `DEFAULT` do banco) e sincronização reativa do estado `loja` quando atualizado pelo Realtime. |
| `src/components/layout/AppLayout.tsx` | `AppLayout` | Consumo do hook `useAssinaturaStatus`: renderização do `<BannerAssinaturaTop />` acima do cabeçalho quando em modo Trial ou Alerta de Renovação, e substituição/bloqueio do painel operacional por `<TelaBloqueioAssinatura />` quando `modo === 'BLOQUEADO'`. |
| `DOCUMENTACAO_SISTEMA.md` e `MAPA_COMPONENTES.md` | Dicionário de Dados & Mapa | Atualização documental da tabela `lojas`, nova tabela `hubi_assinaturas_pagamentos`, Edge Functions e componentes de assinatura. |

---

## 2. DDL SQL Proposta (Supabase PostgreSQL)

O script abaixo respeita integralmente as diretrizes **`supabase-rls-guard`** (isolamento por `public.usuario_pertence_loja(loja_id)` + `auth.uid()`) e **`anti-jsonb-linter`** (zero colunas `JSONB` para dados financeiros; 100% tipado e relacional):

```sql
-- ==============================================================================
-- MIGRATION: 20261016160000_modulo_monetizacao_assinatura_anual.sql
-- Módulo de Monetização SaaS: Trial de 7 Dias, Renovação Anual e Checkout MP
-- ==============================================================================

-- 1. NOVAS COLUNAS DE CICLO DE VIDA NA TABELA public.lojas
ALTER TABLE public.lojas
    ADD COLUMN IF NOT EXISTS status_assinatura VARCHAR(20) NOT NULL DEFAULT 'trial'
        CONSTRAINT chk_lojas_status_assinatura CHECK (status_assinatura IN ('trial', 'ativo', 'atrasado', 'bloqueado')),
    ADD COLUMN IF NOT EXISTS trial_fim_em TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    ADD COLUMN IF NOT EXISTS assinatura_fim_em TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS mp_preference_id TEXT NULL;

-- 2. PROTEÇÃO DE LOJAS EXISTENTES (BACKFILL SEGURO)
-- Garante que lojas já em operação antes desta migration recebam 7 dias de trial
-- a partir da data da migração caso ainda não possuam trial_fim_em ou assinatura_fim_em,
-- evitando bloqueio acidental imediato de clientes legados.
UPDATE public.lojas
SET
    status_assinatura = COALESCE(status_assinatura, 'trial'),
    trial_fim_em = CASE
        WHEN trial_fim_em IS NULL OR trial_fim_em < NOW() THEN NOW() + INTERVAL '7 days'
        ELSE trial_fim_em
    END
WHERE assinatura_fim_em IS NULL;

-- 3. TRIGGER DE INICIALIZAÇÃO AUTOMÁTICA DE TRIAL PARA NOVAS LOJAS
CREATE OR REPLACE FUNCTION public.fn_inicializar_trial_nova_loja()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.status_assinatura IS NULL THEN
        NEW.status_assinatura := 'trial';
    END IF;

    IF NEW.trial_fim_em IS NULL THEN
        NEW.trial_fim_em := NOW() + INTERVAL '7 days';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lojas_inicializar_trial ON public.lojas;
CREATE TRIGGER trg_lojas_inicializar_trial
    BEFORE INSERT ON public.lojas
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_inicializar_trial_nova_loja();

-- 4. TABELA RELACIONAL DE AUDITORIA E HISTÓRICO DE FATURAS (ANTI-JSONB)
CREATE TABLE IF NOT EXISTS public.hubi_assinaturas_pagamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    mp_preference_id TEXT NOT NULL,
    mp_payment_id TEXT NULL,
    mp_collection_id TEXT NULL,
    status_pagamento VARCHAR(30) NOT NULL DEFAULT 'pendente'
        CONSTRAINT chk_hubi_assinaturas_status CHECK (
            status_pagamento IN ('pendente', 'approved', 'in_process', 'rejected', 'cancelled', 'refunded')
        ),
    meio_pagamento VARCHAR(50) NULL,          -- ex: 'pix', 'credit_card', 'debit_card'
    bandeira_metodo VARCHAR(50) NULL,         -- ex: 'visa', 'master', 'pix'
    valor_total NUMERIC(10, 2) NOT NULL DEFAULT 598.80,
    valor_mensal_referencia NUMERIC(10, 2) NOT NULL DEFAULT 49.90,
    parcelas INTEGER NOT NULL DEFAULT 1 CHECK (parcelas >= 1 AND parcelas <= 12),
    ciclo_meses INTEGER NOT NULL DEFAULT 12,
    periodo_inicio_em TIMESTAMPTZ NULL,
    periodo_fim_em TIMESTAMPTZ NULL,
    link_checkout TEXT NULL,
    aprovado_em TIMESTAMPTZ NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_hubi_assinaturas_mp_payment_id UNIQUE (mp_payment_id)
);

-- Índices de performance e busca por Webhook / Tenant
CREATE INDEX IF NOT EXISTS idx_hubi_assinaturas_loja_id
    ON public.hubi_assinaturas_pagamentos(loja_id);
CREATE INDEX IF NOT EXISTS idx_hubi_assinaturas_mp_preference_id
    ON public.hubi_assinaturas_pagamentos(mp_preference_id);
CREATE INDEX IF NOT EXISTS idx_hubi_assinaturas_mp_payment_id
    ON public.hubi_assinaturas_pagamentos(mp_payment_id);

-- Trigger de atualização de timestamp
DROP TRIGGER IF EXISTS trg_hubi_assinaturas_pagamentos_updated_at ON public.hubi_assinaturas_pagamentos;
CREATE TRIGGER trg_hubi_assinaturas_pagamentos_updated_at
    BEFORE UPDATE ON public.hubi_assinaturas_pagamentos
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_atualizar_timestamp_modificacao();

-- 5. BLINDAGEM RLS MULTI-TENANT (SUPABASE-RLS-GUARD)
ALTER TABLE public.hubi_assinaturas_pagamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hubi_assinaturas_pagamentos_select_policy" ON public.hubi_assinaturas_pagamentos;
CREATE POLICY "hubi_assinaturas_pagamentos_select_policy"
    ON public.hubi_assinaturas_pagamentos
    FOR SELECT
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "hubi_assinaturas_pagamentos_insert_policy" ON public.hubi_assinaturas_pagamentos;
CREATE POLICY "hubi_assinaturas_pagamentos_insert_policy"
    ON public.hubi_assinaturas_pagamentos
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "hubi_assinaturas_pagamentos_update_policy" ON public.hubi_assinaturas_pagamentos;
CREATE POLICY "hubi_assinaturas_pagamentos_update_policy"
    ON public.hubi_assinaturas_pagamentos
    FOR UPDATE
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id))
    WITH CHECK (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

DROP POLICY IF EXISTS "hubi_assinaturas_pagamentos_delete_policy" ON public.hubi_assinaturas_pagamentos;
CREATE POLICY "hubi_assinaturas_pagamentos_delete_policy"
    ON public.hubi_assinaturas_pagamentos
    FOR DELETE
    USING (auth.uid() IS NOT NULL AND public.usuario_pertence_loja(loja_id));

-- 6. HABILITAR SUPABASE REALTIME NA TABELA public.lojas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'lojas'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.lojas;
    END IF;
END $$;
```

---

## 3. Divisão em Fases Claras de Implementação

### 🔹 Fase 1: Migração de Banco e Campos de Ciclo de Vida da Loja
1. Criar a migration `supabase/migrations/20261016160000_modulo_monetizacao_assinatura_anual.sql` com as 4 colunas na tabela `public.lojas` (`status_assinatura`, `trial_fim_em`, `assinatura_fim_em`, `mp_preference_id`) e a tabela `public.hubi_assinaturas_pagamentos`.
2. Atualizar `src/types.ts` com os novos atributos tipados na interface `Loja` e a nova interface `HubiAssinaturaPagamento`.
3. Ajustar `cadastrarMinimalista` em `src/contexts/AuthContext.tsx` para garantir que toda nova loja criada já nasça sincronizada no estado local com `status_assinatura: 'trial'` e `trial_fim_em` definido para `+7 dias`.

### 🔹 Fase 2: Edge Function de Criação de Preferência e Webhook de Renovação/Ativação
1. **`supabase/functions/hubi-criar-assinatura-mp/index.ts`**:
   - Valida o JWT do usuário autenticado e verifica se ele pertence à `loja_id` informada.
   - Lê a variável de ambiente segura do Supabase `MP_PLATFORM_ACCESS_TOKEN` (credencial mestre da plataforma HUBI, nunca exposta no front-end).
   - Cria uma preferência no endpoint `https://api.mercadopago.com/checkout/preferences` com:
     - `items`: `[{ title: "Assinatura Anual Sistema HUBI (12 Meses)", quantity: 1, currency_id: "BRL", unit_price: 598.80 }]`
     - `external_reference`: `loja.id`
     - `payment_methods`: `{ installments: 12, default_installments: 12 }` (habilitando Pix, Cartão de Crédito em até 12x e Débito diretamente no Checkout Mercado Pago).
     - `notification_url`: `${SUPABASE_URL}/functions/v1/hubi-webhook-mp`
     - `back_urls`: retorno automático (`auto_return: 'approved'`) para o domínio da aplicação.
   - Salva `mp_preference_id` em `public.lojas` e insere um registro `pendente` em `public.hubi_assinaturas_pagamentos` com `.eq('loja_id', loja.id)`.
   - Retorna `{ init_point, preference_id }` para redirecionamento ou abertura imediata.
2. **`supabase/functions/hubi-webhook-mp/index.ts`**:
   - Recebe eventos `payment.created` e `payment.updated` do Mercado Pago.
   - Extrai o `data.id` (ID do pagamento) e faz um `GET https://api.mercadopago.com/v1/payments/{id}` usando `MP_PLATFORM_ACCESS_TOKEN` (prevenindo spoofing de webhook).
   - Valida se `status === 'approved'` e obtém `loja_id` via `external_reference`.
   - **Idempotência Estrita:** Verifica em `public.hubi_assinaturas_pagamentos` se `mp_payment_id` já foi processado com `status_pagamento = 'approved'`. Se já foi, retorna `200 OK` sem duplicar dias.
   - **Cálculo de Vigência (+365 dias):**
     - Se `loja.assinatura_fim_em` atual for maior que `NOW()` (renovação antecipada), calcula `novo_fim = loja.assinatura_fim_em + INTERVAL '365 days'`.
     - Caso contrário (primeira assinatura pós-trial ou assinatura já vencida), calcula `novo_fim = NOW() + INTERVAL '365 days'`.
   - Atualiza `public.lojas` definindo `status_assinatura = 'ativo'` e `assinatura_fim_em = novo_fim`.
   - Atualiza/insere o registro auditável em `public.hubi_assinaturas_pagamentos` com `meio_pagamento`, `bandeira_metodo`, `parcelas`, `periodo_inicio_em`, `periodo_fim_em` e `aprovado_em`.

### 🔹 Fase 3: Hook de Ciclo de Vida, Banners Duplos (Trial e Renovação Prévia) e Tela de Bloqueio
1. **Hook `src/hooks/useAssinaturaStatus.ts`**:
   - Avalia a loja ativa em `useAuth()` e classifica em 4 estados determinísticos:
     - **`TRIAL_ATIVO`**: `status_assinatura === 'trial'` e `NOW() < trial_fim_em`. Calcula `diasRestantes = Math.max(1, Math.ceil((trial_fim_em - agora) / 86400000))`. Exibe o banner de degustação.
     - **`ANUIDADE_ATIVA`**: `status_assinatura === 'ativo'` e `diasRestantes > 7` até `assinatura_fim_em`. Nenhum banner exibido (`oculto`).
     - **`ALERTA_RENOVACAO`**: `status_assinatura === 'ativo'` e `diasRestantes >= 1 && diasRestantes <= 7` até `assinatura_fim_em`. Reativa o banner no topo para renovação preventiva.
     - **`BLOQUEADO`**:
       - `status_assinatura === 'bloqueado'` ou `'atrasado'`, **OU**
       - `status_assinatura === 'trial'` com `NOW() >= trial_fim_em` (e sem `assinatura_fim_em` futuro), **OU**
       - `assinatura_fim_em !== null` com `NOW() >= assinatura_fim_em`.
   - Expõe `iniciarCheckoutAssinatura()` que chama `supabase.functions.invoke('hubi-criar-assinatura-mp', { body: { loja_id: loja.id } })` e redireciona o lojista ao `init_point` oficial do Mercado Pago.
2. **Componente `src/components/assinatura/BannerAssinaturaTop.tsx`**:
   - Segue a identidade visual do HUBI (inspirado em `BannerDataOperacao.tsx`):
     - **Modo Trial:** Destaque Emerald/Cyan com texto *"Você está no período de teste: restam X dias. Garanta o plano anual por apenas R$ 49,90/mês"* e botão **`[Assinar Agora]`**.
     - **Modo Renovação (≤ 7 dias):** Destaque Amber com texto *"Sua assinatura anual vence em X dias. Renove agora para manter sua loja operando sem interrupções"* e botão **`[Renovar Assinatura]`**.
3. **Componente `src/components/assinatura/TelaBloqueioAssinatura.tsx`**:
   - Quando `modo === 'BLOQUEADO'`, `AppLayout.tsx` renderiza esta tela de bloqueio em tela cheia (impedindo acesso ao PDV, pedidos, estoque e financeiro).
   - Exibe o card da loja, status do vencimento, proposta transparente (**12x de R$ 49,90** ou **R$ 598,80/ano à vista no Pix** via Mercado Pago), botão primário **`[Regularizar / Assinar Agora no Mercado Pago]`**, botão secundário **`[Já paguei — Verificar agora]`** e botão **`[Sair / Trocar Conta]`**.

### 🔹 Fase 4: Gatilho de Checkout Mercado Pago e Desbloqueio em Tempo Real via Supabase Realtime
1. **Escuta WebSocket (`Supabase Realtime`) em `useAssinaturaStatus.ts`**:
   - Cria um canal dedicado `supabase.channel('assinatura-loja-' + loja.id)` escutando eventos `UPDATE` na tabela `public.lojas` com filtro `id=eq.${loja.id}`.
   - Assim que o `hubi-webhook-mp` processar o pagamento e atualizar `status_assinatura = 'ativo'` e `assinatura_fim_em`, o evento WebSocket atualiza imediatamente o objeto `loja` no `AuthContext`, dispara um efeito sonoro de confirmação (`audioService`) e **remove instantaneamente a tela de bloqueio ou o banner**, sem necessidade de F5.
2. **Retorno de Checkout via Query Param (`?assinatura_mp=sucesso`)**:
   - Caso o lojista retorne do redirect do Mercado Pago antes do evento WebSocket ou após reconexão, o hook detecta o parâmetro na URL, executa `recarregarDadosLoja()` e exibe um modal/toast amigável de boas-vindas ao plano anual.

---

## 4. Tratamento de Exceções e Casos de Borda

1. **Proteção de Lojas Antigas Existentes no Banco (Zero Bloqueio Acidental):**
   - Na migration SQL, o comando `UPDATE public.lojas` aplica uma regra de transição suave: todas as lojas já cadastradas que não possuam `assinatura_fim_em` recebem `status_assinatura = 'trial'` e `trial_fim_em = NOW() + INTERVAL '7 days'` (caso `trial_fim_em` seja nulo ou passado). Dessa forma, **nenhuma loja em operação atualmente será bloqueada de surpresa** no momento do deploy.
2. **Renovação Antecipada Preservando o Saldo de Dias Restantes:**
   - Quando o lojista clica em **`[Renovar Assinatura]`** faltando, por exemplo, 5 dias para vencer (ou mesmo durante o trial), a fórmula no webhook utiliza `GREATEST(COALESCE(assinatura_fim_em, trial_fim_em, NOW()), NOW()) + INTERVAL '365 days'`. Assim, o lojista **nunca perde os dias restantes** do seu período atual: os 365 dias são somados ao término vigente.
3. **Tolerância a Falhas Temporárias de Rede (Fail-Safe Offline/Instabilidade):**
   - Se o navegador estiver momentaneamente sem internet (`!navigator.onLine`) ou se uma requisição de refresh do Supabase falhar por oscilação de rede, o hook `useAssinaturaStatus` **mantém o último estado válido em cache** da `loja` e aplica uma tolerância de segurança para não bloquear abruptamente uma operação de caixa em andamento por erro de transporte HTTP, bloqueando apenas quando houver expiração temporal comprovada (`NOW() >= fim_vigencia`).
4. **Sanitização LGPD e Segurança de Credenciais (`pii-leak-detector`):**
   - O `MP_PLATFORM_ACCESS_TOKEN` jamais trafega para o cliente React. Erros de comunicação com a API do Mercado Pago ou PostgreSQL são interceptados nas Edge Functions e retornados em mensagens claras em `pt-BR` (*"Não foi possível iniciar o checkout no momento. Tente novamente em instantes."*), sem expor stack traces, tokens ou SQLSTATE.
