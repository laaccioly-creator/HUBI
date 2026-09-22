// Supabase Edge Function: uber-webhook
// Endpoint público para receber eventos de status da Uber Direct
// Deploy: npx supabase functions deploy uber-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Suporte a verificação de liveness / health check (GET)
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "active", service: "HUBI Uber Direct Webhook" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    console.log("WEBHOOK RECEBIDO UBER:", JSON.stringify(body));

    // Capturar dados canônicos em diferentes formatos de payload da Uber
    const eventType = body.event_type || body.type || body.event || "";
    const deliveryId =
      body.delivery_id ||
      body.resource_id ||
      body.data?.id ||
      body.data?.delivery_id ||
      body.meta?.resource_id ||
      body.id;

    const rawStatus = (
      body.status ||
      body.data?.status ||
      body.meta?.status ||
      body.delivery_status ||
      ""
    ).toLowerCase().trim();

    if (!deliveryId) {
      console.warn("[UberWebhook] Evento recebido sem delivery_id identificável.");
      return new Response(
        JSON.stringify({ received: true, warning: "delivery_id ausente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Localizar registro em pedido_entregas pelo codigo_rastreio (delivery_id)
    let { data: entrega } = await supabaseAdmin
      .from("pedido_entregas")
      .select("*, pedido:pedidos(*)")
      .eq("codigo_rastreio", deliveryId)
      .maybeSingle();

    // Fallback 1: Buscar por link_rastreio caso o deliveryId esteja na URL
    if (!entrega) {
      const { data: entregaPorLink } = await supabaseAdmin
        .from("pedido_entregas")
        .select("*, pedido:pedidos(*)")
        .ilike("link_rastreio", `%${deliveryId}%`)
        .limit(1)
        .maybeSingle();

      if (entregaPorLink) entrega = entregaPorLink;
    }

    // Fallback 2: Buscar diretamente na tabela pedidos
    let pedido: any = entrega?.pedido || null;
    let pedidoId = entrega?.pedido_id || null;

    if (!pedido) {
      const { data: pedData } = await supabaseAdmin
        .from("pedidos")
        .select("*")
        .eq("codigo_rastreio", deliveryId)
        .maybeSingle();

      if (pedData) {
        pedido = pedData;
        pedidoId = pedData.id;
      }
    }

    if (!pedidoId) {
      console.warn(`[UberWebhook] Nenhum pedido encontrado no HUBI para delivery_id: ${deliveryId}`);
      return new Response(
        JSON.stringify({ received: true, warning: `Pedido não encontrado para ${deliveryId}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const agoraIso = new Date().toISOString();

    // 2. Regras de Atualização conforme o status notificado pela Uber
    // Status de Entrega Concluída: delivered, completed, finished, dropoff ou complete === true
    const ehEntregaFinalizada =
      rawStatus === "delivered" ||
      rawStatus === "completed" ||
      rawStatus === "finished" ||
      rawStatus === "dropoff" ||
      body.complete === true ||
      body.data?.complete === true ||
      eventType.includes("delivered");

    // Status de Entrega Cancelada
    const ehEntregaCancelada =
      rawStatus === "canceled" ||
      rawStatus === "cancelled" ||
      eventType.includes("canceled");

    if (ehEntregaFinalizada) {
      console.log(`[UberWebhook] Marcando pedido #${pedido?.numero_pedido || pedidoId} como 'entregue' via Uber.`);

      // Atualiza pedido_entregas
      const { error: errEntrega } = await supabaseAdmin
        .from("pedido_entregas")
        .update({
          status_envio: "entregue",
          entregue_em: agoraIso,
          atualizado_em: agoraIso,
        })
        .eq("pedido_id", pedidoId);

      if (errEntrega) {
        console.error("ERRO AO ATUALIZAR ENTREGA:", errEntrega);
      }

      // Atualiza pedidos para status 'entregue' (mantém aberto para o operador clicar em [ Concluir ])
      const { error: errPedido } = await supabaseAdmin
        .from("pedidos")
        .update({
          status: "entregue",
          atualizado_em: agoraIso,
        })
        .eq("id", pedidoId);

      if (errPedido) {
        console.error("ERRO AO ATUALIZAR PEDIDO:", errPedido);
      }

      // Registra evento no historico_pedidos
      if (pedido?.loja_id) {
        try {
          await supabaseAdmin.from("historico_pedidos").insert({
            loja_id: pedido.loja_id,
            pedido_id: pedidoId,
            tipo_evento: "status_alterado",
            status_anterior: pedido.status || "saiu_para_entrega",
            status_novo: "entregue",
            descricao: `Entrega concluída pelo motorista Uber Direct (Notificação automática do Webhook)`,
            criado_em: agoraIso,
          });
        } catch (eHist) {
          console.warn("[UberWebhook] Aviso ao registrar histórico:", eHist);
        }
      }
    } else if (ehEntregaCancelada) {
      console.warn(`[UberWebhook] Corrida cancelada na Uber para pedido #${pedido?.numero_pedido || pedidoId}.`);

      await supabaseAdmin
        .from("pedido_entregas")
        .update({
          status_envio: "cancelado",
          atualizado_em: agoraIso,
        })
        .eq("pedido_id", pedidoId);

      const obsAtual = pedido?.observacoes ? `${pedido.observacoes}\n` : "";
      const novaObs = `${obsAtual}[Uber Direct] Corrida cancelada na Uber em ${new Date().toLocaleString("pt-BR")}.`;

      await supabaseAdmin
        .from("pedidos")
        .update({
          observacoes: novaObs,
          atualizado_em: agoraIso,
        })
        .eq("id", pedidoId);

      if (pedido?.loja_id) {
        try {
          await supabaseAdmin.from("historico_pedidos").insert({
            loja_id: pedido.loja_id,
            pedido_id: pedidoId,
            tipo_evento: "status_alterado",
            status_anterior: pedido.status || null,
            status_novo: pedido.status || null,
            descricao: `Corrida Uber Direct cancelada pelo provedor externo.`,
            criado_em: agoraIso,
          });
        } catch (eHist) {
          console.warn("[UberWebhook] Aviso ao registrar histórico de cancelamento:", eHist);
        }
      }
    } else {
      console.log(`[UberWebhook] Evento recebido com status transitório: ${rawStatus} para pedido #${pedido?.numero_pedido || pedidoId}`);
    }

    return new Response(
      JSON.stringify({ success: true, received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[UberWebhook] Erro ao processar webhook:", err);
    return new Response(
      JSON.stringify({ received: true, error: err.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
