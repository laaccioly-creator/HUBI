// Supabase Edge Function: hubi-criar-recarga-whatsapp-mp
// Gera cobrança Pix dinâmica no Mercado Pago para recarga da Carteira Pré-Paga de WhatsApp
// Deploy: npx supabase functions deploy hubi-criar-recarga-whatsapp-mp

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const mpAccessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") || Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || "";

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Consulta parâmetros globais da plataforma para validar valor mínimo de recarga
    const { data: configPlataforma } = await supabaseAdmin
      .from("configuracoes_plataforma")
      .select("valor_minimo_recarga_whatsapp")
      .eq("id", 1)
      .maybeSingle();

    const valorMinimoRecarga = Number(configPlataforma?.valor_minimo_recarga_whatsapp ?? 10.0);

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

    const externalReference = `whatsapp_wallet:${loja.id}:${transacaoCriada.id}`;

    if (!mpAccessToken) {
      return new Response(
        JSON.stringify({
          error: "Gateway Mercado Pago da plataforma não configurado (MERCADO_PAGO_ACCESS_TOKEN ausente).",
          transacao_id: transacaoCriada.id,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Gera cobrança Pix dinâmica na API v1/payments do Mercado Pago
    const mpPixPayload = {
      transaction_amount: Number(valorRecarga.toFixed(2)),
      description: `HUBI - Recarga Carteira WhatsApp (${loja.nome_fantasia})`,
      payment_method_id: "pix",
      external_reference: externalReference,
      notification_url: `${supabaseUrl}/functions/v1/hubi-webhook-mp`,
      payer: {
        email: loja.email || `financeiro+${loja.id.slice(0, 8)}@hubi.app`,
        first_name: String(loja.nome_fantasia || "Lojista HUBI").slice(0, 40),
      },
      metadata: {
        loja_id: loja.id,
        transacao_id: transacaoCriada.id,
        tipo_cobranca: "whatsapp_wallet",
      },
    };

    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mpAccessToken}`,
        "X-Idempotency-Key": `hubi-wpp-wallet-${transacaoCriada.id}`,
      },
      body: JSON.stringify(mpPixPayload),
    });

    if (!mpResponse.ok) {
      console.error("[hubi-criar-recarga-whatsapp-mp] Falha ao gerar Pix no Mercado Pago:", mpResponse.status);
      return new Response(
        JSON.stringify({ error: "Não foi possível gerar o QR Code Pix no Mercado Pago no momento." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mpData = await mpResponse.json();
    const mpPaymentId = String(mpData.id || "");
    const qrCode = String(mpData.point_of_interaction?.transaction_data?.qr_code || "");
    const qrCodeBase64 = String(mpData.point_of_interaction?.transaction_data?.qr_code_base64 || "");
    const ticketUrl = String(mpData.point_of_interaction?.transaction_data?.ticket_url || "");

    // Vincula o mp_payment_id à transação pendente
    if (mpPaymentId) {
      await supabaseAdmin
        .from("loja_whatsapp_transacoes")
        .update({ mp_payment_id: mpPaymentId })
        .eq("id", transacaoCriada.id)
        .eq("loja_id", loja.id);
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        transacao_id: transacaoCriada.id,
        mp_payment_id: mpPaymentId,
        qr_code: qrCode,
        qr_code_base64: qrCodeBase64,
        ticket_url: ticketUrl,
        valor: Number(valorRecarga.toFixed(2)),
        external_reference: externalReference,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[hubi-criar-recarga-whatsapp-mp] Erro interno:", err instanceof Error ? err.message : "Erro");
    return new Response(
      JSON.stringify({ error: "Ocorreu um erro inesperado ao iniciar a recarga via Pix." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
