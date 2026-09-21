// Supabase Edge Function: uber-dispatch
// Endpoint de criação e despacho oficial de entregas via Uber Direct
// Deploy: supabase functions deploy uber-dispatch --no-verify-jwt

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
    const { loja_id, pedido_id, payload } = await req.json().catch(() => ({}));

    if (!loja_id) {
      return new Response(
        JSON.stringify({ error: "loja_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Buscar credenciais da Uber para a loja
    const { data: configLoja, error: errConfig } = await supabaseAdmin
      .from("loja_shipping_configs")
      .select("uber_customer_id, uber_client_id, uber_client_secret, uber_sandbox_mode, uber_ativo")
      .eq("loja_id", loja_id)
      .maybeSingle();

    if (errConfig || !configLoja?.uber_customer_id || !configLoja?.uber_client_id || !configLoja?.uber_client_secret) {
      return new Response(
        JSON.stringify({ error: "Credenciais da Uber Direct não configuradas para esta loja" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isSandbox = configLoja.uber_sandbox_mode !== false;
    const authUrl = isSandbox ? "https://sandbox-login.uber.com/oauth/v2/token" : "https://login.uber.com/oauth/v2/token";
    const baseUrl = isSandbox ? "https://sandbox-api.uber.com" : "https://api.uber.com";

    // 1. Obter Token OAuth2
    const tokenParams = new URLSearchParams();
    tokenParams.append("client_id", configLoja.uber_client_id.trim());
    tokenParams.append("client_secret", configLoja.uber_client_secret.trim());
    tokenParams.append("grant_type", "client_credentials");
    tokenParams.append("scope", "eats.deliveries");

    const tokenRes = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errToken = await tokenRes.text();
      return new Response(
        JSON.stringify({ error: `Erro na autenticação Uber: ${errToken}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token } = await tokenRes.json();

    // 2. Chamar POST /v1/customers/{customer_id}/deliveries
    const deliveryEndpoint = `${baseUrl}/v1/customers/${encodeURIComponent(configLoja.uber_customer_id.trim())}/deliveries`;
    const deliveryRes = await fetch(deliveryEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!deliveryRes.ok) {
      const errBody = await deliveryRes.text();
      return new Response(
        JSON.stringify({ error: `Erro ao criar entrega na Uber Direct: ${errBody}` }),
        { status: deliveryRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const deliveryData = await deliveryRes.json();

    // 3. Extrair propriedades canônicas oficiais
    const trackingUrl = deliveryData.tracking_url || deliveryData.trackingUrl || (deliveryData.id ? `https://direct.uber.com/tracking/${deliveryData.id}` : "");
    const deliveryId = deliveryData.id || deliveryData.delivery_id;
    const pin = deliveryData.dropoff_pin || deliveryData.pickup_pin || deliveryData.verification?.pincode || deliveryData.pin_entrega || deliveryData.pincode || null;

    return new Response(
      JSON.stringify({
        id: deliveryId,
        delivery_id: deliveryId,
        tracking_url: trackingUrl,
        link_rastreio: trackingUrl,
        dropoff_pin: deliveryData.dropoff_pin || null,
        pickup_pin: deliveryData.pickup_pin || null,
        pin_entrega: pin,
        status: deliveryData.status || "processing",
        raw: deliveryData,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno no despacho Uber" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
