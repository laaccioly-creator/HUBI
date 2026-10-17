// Supabase Edge Function: ml-webhook
// Receptor público e idempotente de notificações de pedidos (orders_v2) do Mercado Livre.
// Deploy: npx supabase functions deploy ml-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { obterAccessTokenValido, MercadoLivreError } from "../_shared/mlClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  try {
    const payload = await req.json().catch(() => null);

    if (!payload || !payload.resource || !payload.topic) {
      return new Response(
        JSON.stringify({ error: "Payload de notificação incompleto." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      _id: notificationId,
      topic,
      resource,
      user_id: mlUserId,
      sent,
    } = payload;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Identifica a loja correspondente pelo ml_user_id (vendedor)
    const { data: conta, error: erroConta } = await supabaseAdmin
      .from("marketplace_contas")
      .select("id, loja_id, ml_user_id, status_conexao, importar_pedidos_automatico")
      .eq("ml_user_id", mlUserId)
      .eq("provedor", "mercadolivre")
      .maybeSingle();

    if (erroConta || !conta) {
      // Retorna 200 para evitar que o Mercado Livre retente indefinidamente
      console.warn(`[ml-webhook] Notificação recebida para vendedor não cadastrado: ${mlUserId}`);
      return new Response(
        JSON.stringify({ sucesso: false, mensagem: "Vendedor não vinculado a nenhuma loja do HUBI." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!conta.importar_pedidos_automatico || conta.status_conexao === "desconectado") {
      return new Response(
        JSON.stringify({ sucesso: true, mensagem: "Importação de pedidos desativada para esta loja." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extrai o ID numérico do recurso a partir da URI (Ex: /orders/2000004928192 -> 2000004928192)
    const resourceMatch = resource.match(/\d+/);
    const mlResourceId = resourceMatch ? parseInt(resourceMatch[0], 10) : 0;
    const notifIdSanitizado = (notificationId || `notif_${Date.now()}_${mlResourceId}`).toString();

    // 2. Registro de Idempotência em public.marketplace_pedidos_webhook
    const { data: webhookLog, error: erroLog } = await supabaseAdmin
      .from("marketplace_pedidos_webhook")
      .insert({
        loja_id: conta.loja_id,
        conta_id: conta.id,
        ml_notification_id: notifIdSanitizado,
        topico: topic,
        recurso_uri: resource,
        ml_resource_id: mlResourceId,
        ml_user_id: mlUserId,
        status_processamento: "processando",
        enviado_pelo_ml_em: sent || new Date().toISOString(),
      })
      .select("id, status_processamento")
      .maybeSingle();

    if (erroLog) {
      // Se já existe registro idêntico para a chave única, loga e encerra idempotentemente
      console.warn(`[ml-webhook] Evento duplicado ignorado: ${topic} #${mlResourceId}`);
      return new Response(
        JSON.stringify({ sucesso: true, mensagem: "Evento já recebido e registrado anteriormente." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Processamento exclusivo do tópico 'orders_v2'
    if (topic !== "orders_v2") {
      await supabaseAdmin
        .from("marketplace_pedidos_webhook")
        .update({ status_processamento: "ignorado", mensagem_resultado: `Tópico ${topic} não requer importação direta.` })
        .eq("id", webhookLog.id);

      return new Response(
        JSON.stringify({ sucesso: true, mensagem: `Tópico ${topic} recebido com sucesso.` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Consulta os detalhes oficiais do pedido na API do Mercado Livre
    const { token } = await obterAccessTokenValido(supabaseAdmin, conta.loja_id);

    const respOrder = await fetch(`https://api.mercadolibre.com/orders/${mlResourceId}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      },
    });

    if (!respOrder.ok) {
      throw new Error(`Falha HTTP ${respOrder.status} ao consultar detalhes do pedido ${mlResourceId} no Mercado Livre.`);
    }

    const orderData = await respOrder.json();

    // Apenas pedidos com status 'paid' geram baixa física imediata e pedido ativo
    if (orderData.status !== "paid") {
      await supabaseAdmin
        .from("marketplace_pedidos_webhook")
        .update({
          status_processamento: "ignorado",
          mensagem_resultado: `Pedido com status '${orderData.status}' (aguardando confirmação de pagamento).`,
        })
        .eq("id", webhookLog.id);

      return new Response(
        JSON.stringify({ sucesso: true, mensagem: `Pedido ${mlResourceId} ainda não está pago (status: ${orderData.status}).` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Identifica os itens do pedido e localiza o vínculo em marketplace_anuncios
    const orderItems = orderData.order_items || [];
    if (orderItems.length === 0) {
      throw new Error("Pedido do Mercado Livre não contém itens.");
    }

    const primeiroItem = orderItems[0];
    const mlItemId = primeiroItem.item.id;
    const mlVariationId = primeiroItem.item.variation_id || null;

    // Localiza o produto e variação locais vinculados
    const { data: anuncioVinculado } = await supabaseAdmin
      .from("marketplace_anuncios")
      .select("produto_id, variacao_id")
      .eq("loja_id", conta.loja_id)
      .eq("ml_item_id", mlItemId)
      .maybeSingle();

    if (!anuncioVinculado) {
      await supabaseAdmin
        .from("marketplace_pedidos_webhook")
        .update({
          status_processamento: "erro",
          mensagem_resultado: `O anúncio ${mlItemId} não possui vínculo com nenhum produto cadastrado no HUBI.`,
        })
        .eq("id", webhookLog.id);

      return new Response(
        JSON.stringify({ sucesso: false, error: `Anúncio ${mlItemId} não vinculado ao HUBI.` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Sanitização de PII (LGPD) e preparação dos valores
    const compradorNome = orderData.buyer
      ? `${orderData.buyer.first_name || ""} ${orderData.buyer.last_name || ""}`.trim() || orderData.buyer.nickname || "Comprador Mercado Livre"
      : "Comprador Mercado Livre";

    const subtotal = Number(orderData.total_amount || 0);
    const valorFrete = Number(orderData.shipping?.cost || 0);
    const valorTotal = subtotal; // No Mercado Livre o total_amount já reflete o valor pago
    const quantidade = Number(primeiroItem.quantity || 1);
    const precoUnitario = Number(primeiroItem.unit_price || 0);
    const mlShipmentId = orderData.shipping?.id || null;
    const mlPackId = orderData.pack_id || null;
    const mlLogisticType = orderData.shipping?.logistic_type || "drop_off";

    // 6. Chamada à RPC atômica: cria pedido + baixa estoque físico na mesma transação
    const { data: novoPedidoId, error: erroRpc } = await supabaseAdmin.rpc(
      "processar_pedido_mercado_livre_atomico",
      {
        p_loja_id: conta.loja_id,
        p_ml_order_id: mlResourceId,
        p_ml_pack_id: mlPackId,
        p_ml_shipment_id: mlShipmentId,
        p_ml_logistic_type: mlLogisticType,
        p_cliente_nome: compradorNome.slice(0, 150),
        p_subtotal: subtotal,
        p_valor_frete: valorFrete,
        p_valor_total: valorTotal,
        p_produto_id: anuncioVinculado.produto_id,
        p_variacao_id: anuncioVinculado.variacao_id || null,
        p_quantidade: quantidade,
        p_preco_unitario: precoUnitario,
      }
    );

    if (erroRpc || !novoPedidoId) {
      console.error("[ml-webhook] Erro ao executar RPC processar_pedido_mercado_livre_atomico:", erroRpc);
      await supabaseAdmin
        .from("marketplace_pedidos_webhook")
        .update({
          status_processamento: "erro",
          mensagem_resultado: erroRpc?.message?.slice(0, 500) || "Erro ao gravar pedido e abater estoque.",
        })
        .eq("id", webhookLog.id);

      return new Response(
        JSON.stringify({ error: "Falha ao gravar pedido localmente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Atualiza o webhook log como processado com sucesso
    await supabaseAdmin
      .from("marketplace_pedidos_webhook")
      .update({
        status_processamento: "processado",
        pedido_interno_id: novoPedidoId,
        mensagem_resultado: `Pedido #${mlResourceId} importado com sucesso. Saldo local abatido.`,
        processado_em: new Date().toISOString(),
      })
      .eq("id", webhookLog.id);

    return new Response(
      JSON.stringify({
        sucesso: true,
        mensagem: `Pedido #${mlResourceId} importado com sucesso!`,
        pedido_id: novoPedidoId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[ml-webhook] Erro inesperado:", error?.message);
    return new Response(
      JSON.stringify({ error: "Erro interno no processamento do webhook." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
