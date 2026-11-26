// Supabase Edge Function: shopee-webhook
// Receptor público e idempotente de notificações Push da Shopee (code=3 pedidos, code=4 status de anúncio).
// Deploy: npx supabase functions deploy shopee-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  chamarApiShopeeLoja,
  obterAccessTokenShopeeValido,
  obterCredenciaisAppShopee,
  verificarAssinaturaWebhookShopee,
} from "../_shared/shopeeClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function mapearStatusItemShopee(itemStatus: string): "active" | "paused" | "under_review" | "closed" {
  const upper = String(itemStatus || "").trim().toUpperCase();
  if (upper === "NORMAL") return "active";
  if (upper === "UNLIST") return "paused";
  if (upper === "REVIEWING") return "under_review";
  if (upper === "DELETED" || upper === "BANNED" || upper === "SELLER_DELETE" || upper === "SHOPEE_DELETE") {
    return "closed";
  }
  return "active";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    const rawBody = await req.text();
    const payload = rawBody ? JSON.parse(rawBody) : null;

    if (!payload || typeof payload !== "object") {
      return new Response(
        JSON.stringify({ sucesso: true, mensagem: "Ping vazio recebido." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const code = Number(payload.code ?? -1);
    const shopId = Number(payload.shop_id || payload?.data?.shop_id || 0);
    const msgId = String(payload.msg_id || `sp_${Date.now()}_${shopId}_${code}`);

    // Verificação / teste inicial de URL Push no console da Shopee (code=0)
    if (code === 0 || !shopId) {
      return new Response(
        JSON.stringify({ sucesso: true, mensagem: "Webhook Shopee validado." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Localiza a conta da loja pelo shop_id
    const { data: conta, error: erroConta } = await supabaseAdmin
      .from("marketplace_contas")
      .select("id, loja_id, ml_user_id, status_conexao, importar_pedidos_automatico, shopee_partner_key")
      .eq("provedor", "shopee")
      .eq("ml_user_id", shopId)
      .maybeSingle();

    if (erroConta || !conta) {
      console.warn(`[shopee-webhook] Notificação para shop_id não cadastrado: ${shopId}`);
      return new Response(
        JSON.stringify({ sucesso: false, mensagem: "Loja Shopee não vinculada ao Rubi." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Validação HMAC-SHA256 da Shopee quando houver Authorization + partnerKey configurado
    const authHeader = req.headers.get("Authorization");
    const creds = await obterCredenciaisAppShopee(supabaseAdmin, conta.loja_id).catch(() => null);
    const partnerKey = creds?.partnerKey || conta.shopee_partner_key || "";
    if (partnerKey && authHeader) {
      const valido = await verificarAssinaturaWebhookShopee(req.url, rawBody, authHeader, partnerKey);
      if (!valido) {
        console.warn("[shopee-webhook] Assinatura HMAC inválida rejeitada.");
        return new Response(
          JSON.stringify({ error: "Assinatura HMAC inválida." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (conta.status_conexao === "desconectado") {
      return new Response(
        JSON.stringify({ sucesso: true, mensagem: "Integração Shopee desconectada para esta loja." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const topico =
      code === 3 ? "shopee_order_status" : code === 4 ? "shopee_item_status" : `shopee_code_${code}`;
    const orderSn = typeof payload?.data?.ordersn === "string"
      ? payload.data.ordersn
      : typeof payload?.data?.order_sn === "string"
      ? payload.data.order_sn
      : "";
    const itemIdPush = Number(payload?.data?.item_id || 0);
    const recursoUri = orderSn ? `/orders/${orderSn}` : itemIdPush ? `/items/${itemIdPush}` : `/shopee/${code}`;
    const resourceIdNum = itemIdPush > 0 ? itemIdPush : Math.abs(Date.now() % 2000000000);

    // 3. Log de idempotência em public.marketplace_pedidos_webhook
    const { data: webhookLog, error: erroLog } = await supabaseAdmin
      .from("marketplace_pedidos_webhook")
      .insert({
        loja_id: conta.loja_id,
        conta_id: conta.id,
        plataforma: "shopee",
        ml_notification_id: msgId,
        topico,
        recurso_uri: recursoUri,
        ml_resource_id: resourceIdNum,
        ml_user_id: shopId,
        status_processamento: "processando",
        enviado_pelo_ml_em: payload.timestamp
          ? new Date(Number(payload.timestamp) * 1000).toISOString()
          : new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (erroLog) {
      return new Response(
        JSON.stringify({ sucesso: true, mensagem: "Evento Shopee duplicado ignorado." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // EVENTO DE ANÚNCIO (code === 4: item_status_update / exclusão / banimento)
    // =========================================================================
    if (code === 4 && itemIdPush > 0) {
      const auth = await obterAccessTokenShopeeValido(supabaseAdmin, conta.loja_id);
      const resInfo = await chamarApiShopeeLoja<any>({
        apiPath: "/api/v2/product/get_item_base_info",
        method: "GET",
        token: auth.token,
        shopId: auth.shopId,
        partnerId: auth.partnerId,
        partnerKey: auth.partnerKey,
        queryParams: { item_id_list: [itemIdPush] },
      }).catch(() => null);

      const item = resInfo?.response?.item_list?.[0];
      const statusPushRaw = String(payload?.data?.status || item?.item_status || "").toUpperCase();
      const statusNormalizado = mapearStatusItemShopee(statusPushRaw);

      if (!item || statusNormalizado === "closed") {
        await supabaseAdmin
          .from("marketplace_anuncios")
          .delete()
          .eq("loja_id", conta.loja_id)
          .eq("plataforma", "shopee")
          .eq("ml_item_id", String(itemIdPush));

        if (webhookLog?.id) {
          await supabaseAdmin
            .from("marketplace_pedidos_webhook")
            .update({
              status_processamento: "processado",
              mensagem_resultado: `Anúncio Shopee #${itemIdPush} excluído/banido. Vínculo removido do Rubi.`,
              processado_em: new Date().toISOString(),
            })
            .eq("id", webhookLog.id);
        }

        return new Response(
          JSON.stringify({ sucesso: true, acao: "removido", item_id: itemIdPush }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabaseAdmin
        .from("marketplace_anuncios")
        .update({
          status_anuncio: statusNormalizado,
          ultima_sincronizacao_estoque_em: new Date().toISOString(),
        })
        .eq("loja_id", conta.loja_id)
        .eq("plataforma", "shopee")
        .eq("ml_item_id", String(itemIdPush));

      if (webhookLog?.id) {
        await supabaseAdmin
          .from("marketplace_pedidos_webhook")
          .update({
            status_processamento: "processado",
            mensagem_resultado: `Anúncio Shopee #${itemIdPush} atualizado para '${statusNormalizado}'.`,
            processado_em: new Date().toISOString(),
          })
          .eq("id", webhookLog.id);
      }

      return new Response(
        JSON.stringify({ sucesso: true, acao: "atualizado", item_id: itemIdPush, status: statusNormalizado }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // EVENTO DE PEDIDO (code === 3: order_status_update)
    // =========================================================================
    if (code === 3 && orderSn) {
      if (!conta.importar_pedidos_automatico) {
        return new Response(
          JSON.stringify({ sucesso: true, mensagem: "Importação de pedidos Shopee desativada para esta loja." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const statusPushOrder = String(payload?.data?.status || "").toUpperCase();
      if (statusPushOrder && !["READY_TO_SHIP", "PROCESSED"].includes(statusPushOrder)) {
        if (webhookLog?.id) {
          await supabaseAdmin
            .from("marketplace_pedidos_webhook")
            .update({
              status_processamento: "ignorado",
              mensagem_resultado: `Pedido Shopee ${orderSn} com status '${statusPushOrder}' aguardando aprovação/preparo.`,
            })
            .eq("id", webhookLog.id);
        }
        return new Response(
          JSON.stringify({ sucesso: true, mensagem: `Status '${statusPushOrder}' ignorado.` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const auth = await obterAccessTokenShopeeValido(supabaseAdmin, conta.loja_id);
      const resOrder = await chamarApiShopeeLoja<any>({
        apiPath: "/api/v2/order/get_order_detail",
        method: "GET",
        token: auth.token,
        shopId: auth.shopId,
        partnerId: auth.partnerId,
        partnerKey: auth.partnerKey,
        queryParams: {
          order_sn_list: orderSn,
          response_optional_fields:
            "item_list,buyer_user_id,buyer_username,total_amount,actual_shipping_fee,estimated_shipping_fee",
        },
      });

      const orderData = resOrder?.response?.order_list?.[0];
      if (!orderData) {
        throw new Error(`Detalhes do pedido Shopee ${orderSn} não retornados.`);
      }

      const statusReal = String(orderData.order_status || statusPushOrder).toUpperCase();
      if (!["READY_TO_SHIP", "PROCESSED"].includes(statusReal)) {
        if (webhookLog?.id) {
          await supabaseAdmin
            .from("marketplace_pedidos_webhook")
            .update({
              status_processamento: "ignorado",
              mensagem_resultado: `Pedido Shopee ${orderSn} ainda não pago/pronto ('${statusReal}').`,
            })
            .eq("id", webhookLog.id);
        }
        return new Response(
          JSON.stringify({ sucesso: true, mensagem: `Pedido ${orderSn} ainda em '${statusReal}'.` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const primeiroItem = Array.isArray(orderData.item_list) ? orderData.item_list[0] : null;
      if (!primeiroItem?.item_id) {
        throw new Error(`Pedido Shopee ${orderSn} sem itens listados.`);
      }

      const { data: anuncioVinculado } = await supabaseAdmin
        .from("marketplace_anuncios")
        .select("produto_id, variacao_id")
        .eq("loja_id", conta.loja_id)
        .eq("plataforma", "shopee")
        .eq("ml_item_id", String(primeiroItem.item_id))
        .maybeSingle();

      if (!anuncioVinculado) {
        if (webhookLog?.id) {
          await supabaseAdmin
            .from("marketplace_pedidos_webhook")
            .update({
              status_processamento: "erro",
              mensagem_resultado: `Anúncio Shopee #${primeiroItem.item_id} não vinculado a um produto no Rubi.`,
            })
            .eq("id", webhookLog.id);
        }
        return new Response(
          JSON.stringify({ sucesso: false, error: `Anúncio Shopee #${primeiroItem.item_id} não vinculado.` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const compradorNome = String(orderData.buyer_username || "Comprador Shopee").trim().slice(0, 150);
      const valorTotal = Number(orderData.total_amount || 0);
      const valorFrete = Number(orderData.actual_shipping_fee || orderData.estimated_shipping_fee || 0);
      const quantidade = Math.max(1, Number(primeiroItem.model_quantity_purchased || 1));
      const precoUnitario = Number(
        primeiroItem.model_discounted_price || primeiroItem.model_original_price || (valorTotal / quantidade)
      );

      const { data: novoPedidoId, error: erroRpc } = await supabaseAdmin.rpc(
        "processar_pedido_shopee_atomico",
        {
          p_loja_id: conta.loja_id,
          p_shopee_order_sn: orderSn,
          p_cliente_nome: compradorNome,
          p_subtotal: valorTotal,
          p_valor_frete: valorFrete,
          p_valor_total: valorTotal,
          p_produto_id: anuncioVinculado.produto_id,
          p_variacao_id: anuncioVinculado.variacao_id || null,
          p_quantidade: quantidade,
          p_preco_unitario: precoUnitario,
        }
      );

      if (erroRpc || !novoPedidoId) {
        if (webhookLog?.id) {
          await supabaseAdmin
            .from("marketplace_pedidos_webhook")
            .update({
              status_processamento: "erro",
              mensagem_resultado: erroRpc?.message?.slice(0, 450) || "Erro ao importar pedido Shopee.",
            })
            .eq("id", webhookLog.id);
        }
        return new Response(
          JSON.stringify({ error: "Falha ao gravar pedido Shopee localmente." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (webhookLog?.id) {
        await supabaseAdmin
          .from("marketplace_pedidos_webhook")
          .update({
            status_processamento: "processado",
            pedido_interno_id: novoPedidoId,
            mensagem_resultado: `Pedido Shopee #${orderSn} importado e estoque baixado.`,
            processado_em: new Date().toISOString(),
          })
          .eq("id", webhookLog.id);
      }

      return new Response(
        JSON.stringify({ sucesso: true, pedido_id: novoPedidoId, order_sn: orderSn }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (webhookLog?.id) {
      await supabaseAdmin
        .from("marketplace_pedidos_webhook")
        .update({
          status_processamento: "ignorado",
          mensagem_resultado: `Evento Shopee code=${code} registrado sem ação requerida.`,
        })
        .eq("id", webhookLog.id);
    }

    return new Response(
      JSON.stringify({ sucesso: true, mensagem: "Evento Shopee recebido." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[shopee-webhook] Erro inesperado:", err?.message);
    return new Response(
      JSON.stringify({ error: "Erro interno no processamento do webhook Shopee." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
