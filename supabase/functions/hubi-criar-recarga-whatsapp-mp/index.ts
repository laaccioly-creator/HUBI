// Supabase Edge Function: hubi-criar-recarga-whatsapp-mp
// Gera cobrança Pix dinâmica no Mercado Pago para recarga da Carteira Pré-Paga de WhatsApp
// Deploy: npx supabase functions deploy hubi-criar-recarga-whatsapp-mp

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

interface CriarRecargaPayload {
  loja_id: string;
  valor_recarga: number;
  usuario_id?: string | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Partial<CriarRecargaPayload>;
    const lojaId = String(body.loja_id || "").trim();
    const valorRecarga = Number(body.valor_recarga || 0);
    const usuarioId = body.usuario_id || null;

    if (!lojaId || !Number.isFinite(valorRecarga) || valorRecarga <= 0) {
      return new Response(
        JSON.stringify({ error: "Identificador da loja e valor de recarga válido são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Consulta parâmetros globais e credenciais MP exclusivas da plataforma
    const configMp = await obterConfigMpPlataforma(supabaseAdmin);
    const valorMinimoRecarga = configMp.valorMinimoRecargaWhatsapp;

    if (valorRecarga < valorMinimoRecarga) {
      return new Response(
        JSON.stringify({
          error: `O valor mínimo para recarga de créditos WhatsApp é de R$ ${valorMinimoRecarga.toFixed(2).replace(".", ",")}.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Consulta dados da loja (saldo atual e dados cadastrais para o pagador)
    const { data: loja, error: erroLoja } = await supabaseAdmin
      .from("lojas")
      .select("id, nome_fantasia, email, whatsapp_saldo")
      .eq("id", lojaId)
      .maybeSingle();

    if (erroLoja || !loja) {
      return new Response(
        JSON.stringify({ error: "Loja não encontrada no sistema." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenFinal = configMp.mpAccessToken;
    const saldoAtual = Number(loja.whatsapp_saldo ?? 0);

    // 3. Registra transação pendente no ledger auditável loja_whatsapp_transacoes
    const { data: transacaoCriada, error: erroTransacao } = await supabaseAdmin
      .from("loja_whatsapp_transacoes")
      .insert({
        loja_id: loja.id,
        usuario_id: usuarioId,
        tipo: "recarga_pix",
        evento_gatilho: "recarga_carteira_pix",
        valor: Number(valorRecarga.toFixed(2)),
        saldo_anterior: saldoAtual,
        saldo_posterior: saldoAtual,
        status_pagamento: "pendente",
        descricao: `Recarga de Créditos WhatsApp via Pix (R$ ${valorRecarga.toFixed(2).replace(".", ",")})`,
      })
      .select("id")
      .single();

    if (erroTransacao || !transacaoCriada) {
      console.error("[hubi-criar-recarga-whatsapp-mp] Falha ao criar registro no ledger:", erroTransacao?.message);
      return new Response(
        JSON.stringify({ error: "Não foi possível registrar a intenção de recarga na carteira." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tokenFinal) {
      return new Response(
        JSON.stringify({
          error: "Gateway Mercado Pago da plataforma não configurado no painel Super Admin.",
          transacao_id: transacaoCriada.id,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Identificação do perfil do coletor e ambiente configurado pelo Super Admin
    const perfilColetor = await consultarPerfilColetorMp(tokenFinal);
    const collectorEmail = perfilColetor.email;
    const isSandboxMode = configMp.mpAmbiente === "sandbox";

    const externalRefObj = {
      loja_id: loja.id,
      tipo: "recarga_whatsapp",
      transacao_id: transacaoCriada.id,
      valor: valorRecarga,
    };
    const externalReference = JSON.stringify(externalRefObj);

    // 5. Gera preferência oficial do Mercado Pago Checkout Pro (suporte a Pix, Cartão, etc.)
    const preferencePayload: Record<string, any> = {
      items: [
        {
          id: `recarga-wpp-${transacaoCriada.id}`,
          title: `HUBI - Recarga de Créditos WhatsApp (R$ ${valorRecarga.toFixed(2).replace(".", ",")})`,
          quantity: 1,
          unit_price: Number(valorRecarga.toFixed(2)),
          currency_id: "BRL",
        },
      ],
      external_reference: externalReference,
      notification_url: `${supabaseUrl}/functions/v1/hubi-webhook-mp`,
      back_urls: {
        success: "https://hubi.app/dashboard?recarga=sucesso",
        failure: "https://hubi.app/dashboard?recarga=falha",
        pending: "https://hubi.app/dashboard?recarga=pendente",
      },
      auto_return: "approved",
      metadata: {
        loja_id: loja.id,
        transacao_id: transacaoCriada.id,
        tipo_cobranca: "whatsapp_wallet",
      },
    };

    if (isSandboxMode) {
      preferencePayload.payer = {
        email: `comprador.teste.${Date.now()}@testuser.com`,
      };
    } else if (loja.email && (!collectorEmail || loja.email.toLowerCase().trim() !== collectorEmail)) {
      preferencePayload.payer = {
        email: loja.email.trim(),
      };
    }

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenFinal}`,
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

    if (!mpResponse.ok || !prefData.id) {
      console.error("[hubi-criar-recarga-whatsapp-mp] Erro do Mercado Pago:", mpResponse.status);
      return new Response(
        JSON.stringify({ error: "Falha na comunicação com o Mercado Pago ao gerar fatura de recarga." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const checkoutUrl = isSandboxMode
      ? (prefData.sandbox_init_point || prefData.init_point)
      : (prefData.init_point || prefData.sandbox_init_point);

    // Vincula a preferência criada à transação no ledger
    await supabaseAdmin
      .from("loja_whatsapp_transacoes")
      .update({ mp_payment_id: prefData.id })
      .eq("id", transacaoCriada.id);

    return new Response(
      JSON.stringify({
        sucesso: true,
        transacao_id: transacaoCriada.id,
        preference_id: prefData.id,
        init_point: checkoutUrl,
        checkout_url: checkoutUrl,
        sandbox_init_point: prefData.sandbox_init_point,
        modo: configMp.mpAmbiente,
        is_sandbox: isSandboxMode,
        valor: Number(valorRecarga.toFixed(2)),
        external_reference: externalReference,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[hubi-criar-recarga-whatsapp-mp] Erro interno:", err instanceof Error ? err.message : "Erro");
    return new Response(
      JSON.stringify({ error: "Ocorreu um erro inesperado ao iniciar a recarga via Mercado Pago." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
