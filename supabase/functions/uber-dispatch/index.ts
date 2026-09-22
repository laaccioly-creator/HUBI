// Supabase Edge Function: uber-dispatch
// Endpoint de despacho e integração oficial com Uber Direct (Sandbox e Produção)
// Deploy: supabase functions deploy uber-dispatch --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function formatarTelefoneE164(tel?: string | null, fallback = "+5511999999999"): string {
  if (!tel) return fallback;
  const digits = tel.replace(/\D/g, "");
  if (digits.length < 10) return fallback;
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  return `+55${digits}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const pedidoId = body.pedidoId || body.pedido_id;
    let isSandbox = typeof body.isSandbox === "boolean" ? body.isSandbox : undefined;
    let lojaId = body.loja_id || body.lojaId;
    const customPayload = body.payload;

    if (!pedidoId && !lojaId) {
      return new Response(
        JSON.stringify({
          error: "Parâmetro pedidoId ou loja_id é obrigatório para o despacho.",
          code: "MISSING_REQUIRED_PARAMS",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    let pedido: any = null;
    let loja: any = null;
    let itens: any[] = [];
    let entrega: any = null;

    // 1. Carregar dados do Pedido caso fornecido
    if (pedidoId) {
      const { data: pedData, error: pedErr } = await supabaseAdmin
        .from("pedidos")
        .select(`
          *,
          cliente:clientes(*),
          loja:lojas(*),
          itens:itens_pedido(*),
          pedido_entregas:pedido_entregas(*)
        `)
        .eq("id", pedidoId)
        .maybeSingle();

      if (pedErr || !pedData) {
        return new Response(
          JSON.stringify({
            error: `Pedido não encontrado (${pedidoId}): ${pedErr?.message || "Registro inexistente"}`,
            code: "ORDER_NOT_FOUND",
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      pedido = pedData;
      lojaId = lojaId || pedido.loja_id;
      loja = pedido.loja;
      itens = pedido.itens || [];
      entrega = pedido.pedido_entregas?.[0] || null;
    }

    // Se ainda não tiver os dados da loja, buscar pelo lojaId
    if (!loja && lojaId) {
      const { data: lojaData } = await supabaseAdmin
        .from("lojas")
        .select("*")
        .eq("id", lojaId)
        .maybeSingle();
      if (lojaData) loja = lojaData;
    }

    // 2. Leitura de Credenciais da Uber Direct
    // Busca preferencialmente na tabela loja_shipping_configs ou variáveis de ambiente
    let uberCustomerId = "";
    let uberClientId = "";
    let uberClientSecret = "";
    let sandboxModeFromDb = true;

    if (lojaId) {
      const { data: configLoja } = await supabaseAdmin
        .from("loja_shipping_configs")
        .select("uber_customer_id, uber_client_id, uber_client_secret, uber_sandbox_mode, uber_ativo")
        .eq("loja_id", lojaId)
        .maybeSingle();

      if (configLoja) {
        uberCustomerId = (configLoja.uber_customer_id || "").trim();
        uberClientId = (configLoja.uber_client_id || "").trim();
        uberClientSecret = (configLoja.uber_client_secret || "").trim();
        if (configLoja.uber_sandbox_mode !== undefined && configLoja.uber_sandbox_mode !== null) {
          sandboxModeFromDb = Boolean(configLoja.uber_sandbox_mode);
        }
      }
    }

    // Fallbacks para variáveis de ambiente seguras se não configurado na loja
    uberCustomerId = uberCustomerId || Deno.env.get("UBER_CUSTOMER_ID") || "";
    uberClientId = uberClientId || Deno.env.get("UBER_CLIENT_ID") || "";
    uberClientSecret = uberClientSecret || Deno.env.get("UBER_CLIENT_SECRET") || "";

    if (isSandbox === undefined) {
      isSandbox = sandboxModeFromDb;
    }

    if (!uberCustomerId || !uberClientId || !uberClientSecret) {
      return new Response(
        JSON.stringify({
          error: "Credenciais da Uber Direct (Customer ID, Client ID e Client Secret) não estão configuradas para esta loja.",
          code: "UBER_CREDENTIALS_MISSING",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Autenticação OAuth 2.0
    // Endpoint oficial: https://login.uber.com/oauth/v2/token
    const tokenParams = new URLSearchParams();
    tokenParams.append("client_id", uberClientId);
    tokenParams.append("client_secret", uberClientSecret);
    tokenParams.append("grant_type", "client_credentials");
    tokenParams.append("scope", "eats.deliveries");

    const tokenRes = await fetch("https://login.uber.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errTokenText = await tokenRes.text();
      let parsedTokenErr: any;
      try {
        parsedTokenErr = JSON.parse(errTokenText);
      } catch {
        parsedTokenErr = { message: errTokenText };
      }

      return new Response(
        JSON.stringify({
          error: parsedTokenErr.error_description || parsedTokenErr.message || "Erro na autenticação OAuth com a Uber Direct.",
          details: parsedTokenErr,
          code: parsedTokenErr.error || "OAUTH_FAILED",
          status: tokenRes.status,
        }),
        { status: tokenRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token } = await tokenRes.json();

    // 4. Montar Payload de Criação da Entrega (POST /v1/customers/{customer_id}/deliveries)
    let deliveryPayload: any = null;

    if (customPayload) {
      deliveryPayload = { ...customPayload };
    } else {
      // Montagem automática a partir dos dados do pedido e da loja
      const enderecoOrigem = [
        loja?.endereco_logradouro,
        loja?.endereco_numero ? `Nº ${loja.endereco_numero}` : null,
        loja?.endereco_complemento,
        loja?.endereco_bairro,
        loja?.endereco_cidade && loja?.endereco_estado ? `${loja.endereco_cidade} - ${loja.endereco_estado}` : null,
        loja?.endereco_cep ? `CEP ${loja.endereco_cep.replace(/\D/g, '')}` : null,
      ].filter(Boolean).join(", ");

      const enderecoDestino = [
        entrega?.destino_logradouro,
        entrega?.destino_numero ? `Nº ${entrega.destino_numero}` : null,
        entrega?.destino_complemento,
        entrega?.destino_bairro,
        entrega?.destino_cidade && entrega?.destino_uf ? `${entrega.destino_cidade} - ${entrega.destino_uf}` : null,
        entrega?.destino_cep ? `CEP ${entrega.destino_cep.replace(/\D/g, '')}` : null,
      ].filter(Boolean).join(", ") || pedido?.endereco_entrega || "";

      const clienteNome = pedido?.cliente?.nome || pedido?.cliente_nome_avulso || "Cliente";
      const clienteTelefone = pedido?.cliente?.whatsapp || pedido?.cliente?.telefone || pedido?.cliente_telefone_avulso || "";

      const manifestItems = (itens && itens.length > 0)
        ? itens.map((i: any) => ({
            name: `${i.quantidade || 1}x ${i.nome_produto || "Produto"}`,
            quantity: Number(i.quantidade || 1),
            price: Math.round(Number(i.subtotal || i.preco_venda_unitario || 0) * 100),
          }))
        : [
            {
              name: `Pedido #${pedido?.numero_pedido || pedido?.id?.slice(0, 6) || "HUBI"}`,
              quantity: 1,
              price: Math.round(Number(pedido?.valor_total || 0) * 100),
            },
          ];

      deliveryPayload = {
        pickup: {
          name: loja?.nome_fantasia || "HUBI Loja",
          address: enderecoOrigem,
          phone_number: formatarTelefoneE164(loja?.whatsapp || loja?.telefone),
        },
        dropoff: {
          name: clienteNome,
          address: enderecoDestino,
          phone_number: formatarTelefoneE164(clienteTelefone, formatarTelefoneE164(loja?.whatsapp)),
        },
        manifest_items: manifestItems,
      };
    }

    // Configuração de Sandbox na Uber Direct (RoboCourier automático)
    if (isSandbox) {
      deliveryPayload.test_specifications = deliveryPayload.test_specifications || {
        robo_courier_specification: {
          mode: "auto",
        },
      };
    } else {
      delete deliveryPayload.test_specifications;
    }

    // 5. Chamada à API da Uber Direct
    const deliveryEndpoint = `https://api.uber.com/v1/customers/${encodeURIComponent(uberCustomerId)}/deliveries`;
    const deliveryRes = await fetch(deliveryEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(deliveryPayload),
    });

    // 6. Tratamento de Erros da Uber Direct (status >= 400)
    // NÃO gerar mocks: repassar o código original e o JSON descritivo da Uber
    if (!deliveryRes.ok) {
      const errBodyText = await deliveryRes.text();
      let errBody: any;
      try {
        errBody = JSON.parse(errBodyText);
      } catch {
        errBody = { message: errBodyText };
      }

      const mensagemDetalhada =
        errBody.message ||
        errBody.error ||
        errBody.code ||
        `Erro retornado pela Uber Direct (HTTP ${deliveryRes.status})`;

      return new Response(
        JSON.stringify({
          error: mensagemDetalhada,
          details: errBody,
          code: errBody.code || "UBER_API_ERROR",
          status: deliveryRes.status,
        }),
        {
          status: deliveryRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 7. Tratamento de Sucesso
    const deliveryData = await deliveryRes.json();
    const trackingUrl =
      deliveryData.tracking_url ||
      deliveryData.trackingUrl ||
      (deliveryData.id ? `https://direct.uber.com/tracking/${deliveryData.id}` : "");
    const deliveryId = deliveryData.id || deliveryData.delivery_id;
    const pin =
      deliveryData.dropoff_pin ||
      deliveryData.pickup_pin ||
      deliveryData.verification?.pincode ||
      deliveryData.pin_entrega ||
      deliveryData.pincode ||
      null;

    // Resposta estruturada para o frontend
    return new Response(
      JSON.stringify({
        tracking_url: trackingUrl,
        link_rastreio: trackingUrl,
        delivery_id: deliveryId,
        id: deliveryId,
        pin: pin,
        pin_entrega: pin,
        status: deliveryData.status || "em_transito",
        is_sandbox: Boolean(isSandbox),
        raw: deliveryData,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: err.message || "Erro interno inesperado no despacho da Uber Direct.",
        code: "INTERNAL_EDGE_ERROR",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
