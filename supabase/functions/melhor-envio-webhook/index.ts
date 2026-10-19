// Supabase Edge Function: melhor-envio-webhook
// Endpoint público para receber webhooks e eventos de tracking em tempo real do Melhor Envio
// Deploy: npx supabase functions deploy melhor-envio-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-custom-loja-id, accept",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Liveness / Health Check
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "active", service: "HUBI Melhor Envio Webhook" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Capturar dados essenciais do payload do webhook
    const eventType = (body.event || body.event_type || body.type || body.topic || "").toLowerCase();
    const orderId = String(body.order_id || body.resource_id || body.id || body.data?.id || body.data?.order_id || "");
    const trackingCode = String(body.tracking || body.tracking_code || body.data?.tracking || body.data?.tracking_code || "").trim();
    const rawStatus = (body.status || body.data?.status || "").toLowerCase().trim();

    if (!orderId && !trackingCode) {
      return new Response(
        JSON.stringify({ received: true, aviso: "Webhook recebido sem identificador de pedido ou rastreio." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Mapear status logístico
    let statusEnvioMapeado: string | null = null;
    let deveMarcarPedidoEntregue = false;

    if (
      eventType.includes("delivered") ||
      rawStatus === "delivered" ||
      rawStatus === "entregue"
    ) {
      statusEnvioMapeado = "entregue";
      deveMarcarPedidoEntregue = true;
    } else if (
      eventType.includes("out_for_delivery") ||
      rawStatus === "out_for_delivery" ||
      rawStatus === "saiu_para_entrega"
    ) {
      statusEnvioMapeado = "saiu_para_entrega";
    } else if (
      eventType.includes("posted") ||
      eventType.includes("in_transit") ||
      rawStatus === "posted" ||
      rawStatus === "in_transit" ||
      rawStatus === "em_transito"
    ) {
      statusEnvioMapeado = "em_transito";
    } else if (eventType.includes("canceled") || rawStatus === "canceled") {
      statusEnvioMapeado = "cancelado";
    }

    if (!statusEnvioMapeado) {
      return new Response(
        JSON.stringify({ received: true, info: "Evento sem alteração de status logístico relevante." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Localizar o pedido correspondente no Supabase
    // 1. Tentar por pedido_entregas (codigo_rastreio ou cotacao_id)
    let pedidoIdEncontrado: string | null = null;
    let lojaIdEncontrada: string | null = null;

    if (trackingCode) {
      const { data: entPorCod } = await supabaseAdmin
        .from("pedido_entregas")
        .select("pedido_id, pedidos!inner(loja_id, status)")
        .eq("codigo_rastreio", trackingCode)
        .maybeSingle();

      if (entPorCod) {
        pedidoIdEncontrado = entPorCod.pedido_id;
        lojaIdEncontrada = (entPorCod as any).pedidos?.loja_id || null;
      }
    }

    if (!pedidoIdEncontrado && orderId) {
      // 2. Tentar por pedidos.metadados -> melhor_envio_order_id
      const { data: pedPorMeta } = await supabaseAdmin
        .from("pedidos")
        .select("id, loja_id, status")
        .eq("metadados->>melhor_envio_order_id", orderId)
        .maybeSingle();

      if (pedPorMeta) {
        pedidoIdEncontrado = pedPorMeta.id;
        lojaIdEncontrada = pedPorMeta.loja_id;
      }
    }

    if (!pedidoIdEncontrado) {
      return new Response(
        JSON.stringify({ received: true, aviso: "Pedido não localizado para o evento informado." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const agora = new Date().toISOString();

    // 1. Atualizar pedido_entregas
    await supabaseAdmin
      .from("pedido_entregas")
      .update({
        status_envio: statusEnvioMapeado,
        atualizado_em: agora,
      })
      .eq("pedido_id", pedidoIdEncontrado);

    // 2. Se foi entregue, atualizar pedidos.status para 'entregue' (se não estiver concluído ou cancelado)
    const { data: pedAtual } = await supabaseAdmin
      .from("pedidos")
      .select("status, metadados")
      .eq("id", pedidoIdEncontrado)
      .maybeSingle();

    if (pedAtual) {
      const updatePayload: Record<string, any> = {
        atualizado_em: agora,
        metadados: {
          ...(pedAtual.metadados || {}),
          melhor_envio_status: rawStatus || statusEnvioMapeado,
          ...(deveMarcarPedidoEntregue ? { data_entrega: agora } : {}),
        },
      };

      if (deveMarcarPedidoEntregue && pedAtual.status !== "concluido" && pedAtual.status !== "cancelado") {
        updatePayload.status = "entregue";
      }

      await supabaseAdmin
        .from("pedidos")
        .update(updatePayload)
        .eq("id", pedidoIdEncontrado);
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        pedido_id: pedidoIdEncontrado,
        status_envio: statusEnvioMapeado,
        pedido_status: deveMarcarPedidoEntregue ? "entregue" : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ sucesso: false, erro: "Erro ao processar webhook do Melhor Envio." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
