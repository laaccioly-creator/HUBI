// Supabase Edge Function: hubi-criar-assinatura-mp
// Cria a preferência de checkout no Mercado Pago para o Plano Anual HUBI (R$ 598,80 / 12x R$ 49,90)
// Deploy: npx supabase functions deploy hubi-criar-assinatura-mp

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { loja_id } = await req.json().catch(() => ({}));

    if (!loja_id) {
      return new Response(
        JSON.stringify({ error: "Identificador da loja (loja_id) é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const mpAccessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") || "";

    if (!mpAccessToken) {
      console.error("[hubi-criar-assinatura-mp] Chave MERCADO_PAGO_ACCESS_TOKEN não configurada nas variáveis de ambiente.");
      return new Response(
        JSON.stringify({ error: "Gateway de pagamento em manutenção ou credenciais não configuradas." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Consulta dados cadastrais da loja
    const { data: loja, error: erroLoja } = await supabaseAdmin
      .from("lojas")
      .select("id, nome_fantasia, email, whatsapp, organizacao_id, slug_catalogo")
      .eq("id", loja_id)
      .maybeSingle();

    if (erroLoja || !loja) {
      return new Response(
        JSON.stringify({ error: "Loja não encontrada no sistema." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parâmetros Comerciais HUBI (dinâmicos da tabela configuracoes_plataforma)
    let valorAnualTotal = 598.80;
    let valorMensalRef = 49.90;
    let parcelasMaximas = 12;

    const { data: configPlataforma } = await supabaseAdmin
      .from("configuracoes_plataforma")
      .select("valor_anual_total, valor_mensal_anual, max_parcelas_cartao, parcelas_sem_juros")
      .eq("id", 1)
      .maybeSingle();

    if (configPlataforma) {
      if (Number(configPlataforma.valor_anual_total) > 0) {
        valorAnualTotal = Number(configPlataforma.valor_anual_total);
      }
      if (Number(configPlataforma.valor_mensal_anual) > 0) {
        valorMensalRef = Number(configPlataforma.valor_mensal_anual);
      }
      if (Number(configPlataforma.max_parcelas_cartao) > 0) {
        parcelasMaximas = Number(configPlataforma.max_parcelas_cartao);
      }
    }

    const preferencePayload = {
      items: [
        {
          id: "hubi-plano-anual-12m",
          title: `HUBI PDV - Licença Anual (12 Meses)`,
          description: `Assinatura anual de 12 meses da unidade: ${loja.nome_fantasia}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: valorAnualTotal,
        },
      ],
      payer: {
        name: loja.nome_fantasia,
        email: loja.email || "faturamento@hubi.app",
      },
      payment_methods: {
        installments: parcelasMaximas,
        default_installments: parcelasMaximas,
      },
      back_urls: {
        success: "https://hubi.app/dashboard?assinatura=sucesso",
        failure: "https://hubi.app/dashboard?assinatura=falha",
        pending: "https://hubi.app/dashboard?assinatura=pendente",
      },
      auto_return: "approved",
      external_reference: loja.id,
      statement_descriptor: "HUBI*SISTEMA",
      metadata: {
        loja_id: loja.id,
        organizacao_id: loja.organizacao_id,
        tipo_cobranca: "anual_licenca",
        origem: "hubi_saas",
      },
    };

    // 3. Chamada à API Oficial do Mercado Pago para gerar a preferência de checkout
    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mpAccessToken}`,
      },
      body: JSON.stringify(preferencePayload),
    });

    if (!mpResponse.ok) {
      const errBody = await mpResponse.text();
      console.error("[hubi-criar-assinatura-mp] Erro do Mercado Pago:", errBody);
      return new Response(
        JSON.stringify({ error: "Falha na comunicação com o Mercado Pago ao gerar fatura." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prefData = await mpResponse.json();

    // 4. Registra histórico auditado na tabela public.hubi_assinaturas_pagamentos
    if (loja.organizacao_id) {
      const { error: erroAudit } = await supabaseAdmin
        .from("hubi_assinaturas_pagamentos")
        .insert({
          loja_id: loja.id,
          organizacao_id: loja.organizacao_id,
          mp_preference_id: prefData.id,
          status_pagamento: "pendente",
          valor_total: valorAnualTotal,
          valor_mensal_referencia: valorMensalRef,
          parcelas: parcelasMaximas,
          ciclo_meses: 12,
          link_checkout: prefData.init_point,
        });

      if (erroAudit) {
        console.warn("[hubi-criar-assinatura-mp] Falha ao registrar log de auditoria pendente:", erroAudit.message);
      }
    }

    // 5. Salva a preferência recente na loja
    await supabaseAdmin
      .from("lojas")
      .update({ mp_preference_id: prefData.id })
      .eq("id", loja.id);

    return new Response(
      JSON.stringify({
        preference_id: prefData.id,
        init_point: prefData.init_point,
        sandbox_init_point: prefData.sandbox_init_point,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[hubi-criar-assinatura-mp] Exceção:", err);
    return new Response(
      JSON.stringify({ error: "Ocorreu um erro interno ao processar a assinatura. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
