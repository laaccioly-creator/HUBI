-- Migration: 20261017160000_configuracoes_plataforma_global.sql
-- Módulo de Parâmetros Globais da Plataforma HUBI (Super Admin)
-- Governança: supabase-rls-guard, anti-jsonb-linter, pii-leak-detector

-- 1. Criação da tabela singleton de parâmetros da plataforma
CREATE TABLE IF NOT EXISTS public.configuracoes_plataforma (
    id INTEGER PRIMARY KEY DEFAULT 1,
    dias_trial INTEGER NOT NULL DEFAULT 7 CHECK (dias_trial >= 1 AND dias_trial <= 90),
    valor_mensal_anual NUMERIC(10,2) NOT NULL DEFAULT 49.90 CHECK (valor_mensal_anual > 0),
    valor_anual_total NUMERIC(10,2) NOT NULL DEFAULT 598.80 CHECK (valor_anual_total > 0),
    valor_plano_mensal_avulso NUMERIC(10,2) NOT NULL DEFAULT 69.90 CHECK (valor_plano_mensal_avulso > 0),
    desconto_pix_percentual NUMERIC(5,2) NOT NULL DEFAULT 5.00 CHECK (desconto_pix_percentual >= 0 AND desconto_pix_percentual <= 100),
    aceita_cartao_debito BOOLEAN NOT NULL DEFAULT true,
    max_parcelas_cartao INTEGER NOT NULL DEFAULT 12 CHECK (max_parcelas_cartao >= 1 AND max_parcelas_cartao <= 24),
    parcelas_sem_juros INTEGER NOT NULL DEFAULT 12 CHECK (parcelas_sem_juros >= 1 AND parcelas_sem_juros <= 24),
    email_super_admin VARCHAR(255) NOT NULL DEFAULT 'laaccioly@hotmail.com',
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT chk_configuracoes_plataforma_singleton CHECK (id = 1)
);

-- Comentários documentais
COMMENT ON TABLE public.configuracoes_plataforma IS 'Tabela singleton de parâmetros comerciais globais da plataforma HUBI (Super Admin).';
COMMENT ON COLUMN public.configuracoes_plataforma.email_super_admin IS 'E-mail do administrador com privilégio total de alteração dos parâmetros comerciais globais.';

-- 2. Inserção do registro padrão (se não existir)
INSERT INTO public.configuracoes_plataforma (
    id,
    dias_trial,
    valor_mensal_anual,
    valor_anual_total,
    valor_plano_mensal_avulso,
    desconto_pix_percentual,
    aceita_cartao_debito,
    max_parcelas_cartao,
    parcelas_sem_juros,
    email_super_admin
) VALUES (
    1,
    7,
    49.90,
    598.80,
    69.90,
    5.00,
    true,
    12,
    12,
    'laaccioly@hotmail.com'
) ON CONFLICT (id) DO UPDATE SET
    email_super_admin = 'laaccioly@hotmail.com';

-- 3. Função de verificação se usuário atual é Super Admin
CREATE OR REPLACE FUNCTION public.eh_super_admin_plataforma()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_email_admin VARCHAR;
    v_user_email VARCHAR;
BEGIN
    SELECT email_super_admin INTO v_email_admin
    FROM public.configuracoes_plataforma
    WHERE id = 1;

    IF v_email_admin IS NULL THEN
        v_email_admin := 'laaccioly@hotmail.com';
    END IF;

    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = auth.uid();

    IF v_user_email IS NOT NULL AND LOWER(v_user_email) = LOWER(v_email_admin) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

-- 4. Habilitar RLS
ALTER TABLE public.configuracoes_plataforma ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS
DROP POLICY IF EXISTS "leitura_autenticada_config_plataforma" ON public.configuracoes_plataforma;
CREATE POLICY "leitura_autenticada_config_plataforma"
ON public.configuracoes_plataforma
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "escrita_restrita_super_admin" ON public.configuracoes_plataforma;
CREATE POLICY "escrita_restrita_super_admin"
ON public.configuracoes_plataforma
FOR ALL
TO authenticated
USING (public.eh_super_admin_plataforma())
WITH CHECK (public.eh_super_admin_plataforma());

-- 6. Trigger para atualizar trial_fim_em com base no dias_trial da plataforma
CREATE OR REPLACE FUNCTION public.definir_trial_nova_loja()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dias INTEGER;
BEGIN
    SELECT dias_trial INTO v_dias
    FROM public.configuracoes_plataforma
    WHERE id = 1;

    IF v_dias IS NULL THEN
        v_dias := 7;
    END IF;

    IF NEW.trial_fim_em IS NULL THEN
        NEW.trial_fim_em := (now() + (v_dias || ' days')::INTERVAL);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_definir_trial_nova_loja ON public.lojas;
CREATE TRIGGER trg_definir_trial_nova_loja
BEFORE INSERT ON public.lojas
FOR EACH ROW
EXECUTE FUNCTION public.definir_trial_nova_loja();
