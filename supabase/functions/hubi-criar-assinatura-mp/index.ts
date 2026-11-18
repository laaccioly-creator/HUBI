// Supabase Edge Function: hubi-criar-assinatura-mp
// Cria a preferência de checkout no Mercado Pago para o Plano Anual HUBI (R$ 598,80 / 12x R$ 49,90)
// Deploy: npx supabase functions deploy hubi-criar-assinatura-mp

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  consultarPerfilColetorMp,
  obterConfigMpPlataforma,
} from "../_shared/mpPlataformaConfig.ts";

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
    const body = await req.json().catch(() => ({}));
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 0. Modo de validação de credencial MP do Super Admin
    if (body?.action === "testar_credencial") {
      const configMp = await obterConfigMpPlataforma(supabaseAdmin);
      const tokenParaTeste = String(body?.access_token || "").trim() || configMp.mpAccessToken;

      if (!tokenParaTeste) {
        return new Response(
          JSON.stringify({
            sucesso: false,
            mensagem: "Informe o Access Token do Mercado Pago para validar a credencial.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const perfil = await consultarPerfilColetorMp(tokenParaTeste);
      if (!perfil.ok) {
        return new Response(
          JSON.stringify({
            sucesso: false,
            mensagem: `Credencial rejeitada pelo Mercado Pago (HTTP ${perfil.status || "erro"}). Verifique o Access Token informado.`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          sucesso: true,
          id: perfil.id,
          nome: perfil.nomeExibicao,
          email: perfil.email,
          nickname: perfil.nickname,
          is_test_user: perfil.isCollectorTestUser,
          mensagem: `Conta conectada: ${perfil.nomeExibicao}${perfil.email ? ` (${perfil.email})` : ""} • ${
            perfil.isCollectorTestUser ? "Usuário de Teste / Sandbox" : "Conta de Produção"
          }`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const loja_id = body?.loja_id;

    if (!loja_id) {
      return new Response(
        JSON.stringify({ error: "Identificador da loja (loja_id) é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // 2. Parâmetros e Credenciais do Mercado Pago EXCLUSIVOS da plataforma (configuracoes_plataforma)
    const configMp = await obterConfigMpPlataforma(supabaseAdmin);
    const mpAccessToken = configMp.mpAccessToken;
    const valorAnualTotal = configMp.valorAnualTotal;
    const valorMensalRef = configMp.valorMensalAnual;
    const parcelasMaximas = configMp.maxParcelasCartao;

    if (!mpAccessToken) {
      console.error("[hubi-criar-assinatura-mp] Access Token do Mercado Pago da plataforma não configurado.");
      return new Response(
        JSON.stringify({ error: "Gateway de pagamento da plataforma em manutenção ou credenciais não configuradas." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2.1 Identificação do perfil do coletor e ambiente configurado pelo Super Admin
    const perfilColetor = await consultarPerfilColetorMp(mpAccessToken);
    const isCollectorTestUser = perfilColetor.isCollectorTestUser;
    const isSandboxMode = configMp.mpAmbiente === "sandbox";
    const backUrlBase = String(body?.back_url || "https://hubi.app/dashboard").trim().replace(/\/+$/, "");

    // 2.2 Payload Canônico da Preferência Checkout Pro (espelhado de public.criar_link_mercado_pago do Catálogo Online)
    const preferencePayload: Record<string, any> = {
      items: [
        {
          title: `HUBI PDV - Licença Anual (${loja.nome_fantasia})`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: Number(Number(valorAnualTotal).toFixed(2)),
        },
      ],
      external_reference: String(loja.id),
      back_urls: {
        success: `${backUrlBase}?assinatura=sucesso`,
        failure: `${backUrlBase}?assinatura=falha`,
        pending: `${backUrlBase}?assinatura=pendente`,
      },
      auto_return: "approved",
      notification_url: `${supabaseUrl}/functions/v1/hubi-webhook-mp`,
    };

    const tokenPrefix = configMp.mpTokenPrefixo;

    console.log("[hubi-criar-assinatura-mp][MP DIAGNÓSTICO] Credencial e ambiente:", {
      origem_credencial: configMp.mpTokenOrigem,
      token_prefix: tokenPrefix,
      mp_ambiente: configMp.mpAmbiente,
      is_sandbox: isSandboxMode,
      collector_id: perfilColetor.id,
      conta_coletora_teste: isCollectorTestUser,
    });

    console.log(
      "[hubi-criar-assinatura-mp][MP DIAGNÓSTICO] Payload enviado para POST /checkout/preferences:",
      JSON.stringify(preferencePayload, null, 2)
    );

    // 3. Chamada à API Oficial do Mercado Pago para gerar a preferência de checkout
    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mpAccessToken}`,
      },
      body: JSON.stringify(preferencePayload),
    });

    const respText = await mpResponse.text();
    let prefData: any = {};
    try {
      prefData = JSON.parse(respText);
    } catch (_) {
      prefData = { raw: respText };
    }

    console.log("[hubi-criar-assinatura-mp][MP DIAGNÓSTICO] Resposta Mercado Pago:", {
      status_http_mp: mpResponse.status,
      id: prefData?.id,
      collector_id: prefData?.collector_id,
      init_point: prefData?.init_point,
      sandbox_init_point: prefData?.sandbox_init_point,
      body: prefData,
    });

    const diagnosticoMp = {
      origem_credencial: configMp.mpTokenOrigem,
      token_prefix: tokenPrefix,
      mp_ambiente: configMp.mpAmbiente,
      is_sandbox: isSandboxMode,
      collector_id: perfilColetor.id || prefData?.collector_id || null,
      conta_coletora_teste: isCollectorTestUser,
      payload_enviado: preferencePayload,
      status_http_mp: mpResponse.status,
      resposta_mp: prefData,
    };

    if (!mpResponse.ok || !prefData?.id) {
      console.error("[hubi-criar-assinatura-mp] Erro do Mercado Pago:", mpResponse.status, prefData);
      return new Response(
        JSON.stringify({
          error: prefData?.message || "Falha na comunicação com o Mercado Pago ao gerar fatura.",
          status_mp: mpResponse.status,
          detalhe_mp: prefData,
          diagnostico_mp: diagnosticoMp,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Seleciona init_point padrão TSB do Catálogo Online (fallback para sandbox_init_point se necessário)
    const checkoutUrl = prefData.init_point || prefData.sandbox_init_point;

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
          link_checkout: checkoutUrl,
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
        init_point: checkoutUrl,
        checkout_url: checkoutUrl,
        sandbox_init_point: prefData.sandbox_init_point,
        modo: configMp.mpAmbiente,
        is_sandbox: isSandboxMode,
        conta_coletora_teste: isCollectorTestUser,
        token_prefix: tokenPrefix,
        diagnostico_mp: diagnosticoMp,
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
