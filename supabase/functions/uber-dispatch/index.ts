// Supabase Edge Function: uber-dispatch
// Endpoint de despacho e integração oficial com Uber Direct (Sandbox e Produção)
// Deploy: npx supabase functions deploy uber-dispatch --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * 1. Formatação de Telefone (Padrão E.164 Obrigatório)
 * - Remove qualquer caractere que não seja número.
 * - Se começar com DDD (10 ou 11 dígitos), prefixa com "+55".
 * - Se já começar com 55 e tiver 12 ou 13 dígitos, prefixa apenas com "+".
 * - Formato final estrito: string no padrão "+55859XXXXXXXX".
 */
function formatarTelefoneE164(tel?: string | null, fallback = "+5585999999999"): string {
  if (!tel) return fallback;
  const digits = String(tel).replace(/\D/g, "");
  if (!digits) return fallback;

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    return `+55${digits.substring(1)}`;
  }

  if (digits.length === 8 || digits.length === 9) {
    return `+5585${digits}`;
  }

  if (digits.length > 11) {
    return `+55${digits.slice(-11)}`;
  }

  return fallback;
}

interface UberAddressObj {
  street_address: string[];
  city: string;
  state: string;
  zip_code: string;
  country: string;
}

/**
 * 2. Formatação dos Endereços (pickup_address e dropoff_address)
 * A Uber Direct exige JSON com as seguintes chaves exatas:
 * {
 *   "street_address": ["Rua Bélgica, 945"],
 *   "city": "Fortaleza",
 *   "state": "CE",
 *   "zip_code": "60710790",
 *   "country": "BR"
 * }
 * - Em street_address: array com 1 ou 2 strings (sem vírgula pendente).
 * - Em zip_code: apenas os 8 dígitos numéricos (sem hífen ou ponto).
 */
/**
 * Sanitiza a linha principal do endereço (logradouro + número).
 * Se o logradouro já contiver o número (ex: "Rua Bélgica, 945"), não repete o campo número.
 * Garante string limpa sem vírgulas duplas ou números duplicados: ["Rua Bélgica, 945"].
 */
function sanitizarLinhaEndereco(rua?: string | null, numero?: string | null): string {
  let r = (rua || "").trim().replace(/,+$/, "").trim();
  const n = (numero || "").trim();

  // Limpa vírgulas duplas/múltiplas de partida
  r = r.replace(/,\s*,+/g, ",").trim();

  // Detecta se o logradouro já inclui o número
  const jaTemNumero =
    /,\s*\d+/.test(r) ||
    (n && n.toUpperCase() !== "S/N" && new RegExp(`(^|\\s|,)${n}(\\s|,|$)`).test(r));

  if (n && n.toUpperCase() !== "S/N" && !jaTemNumero) {
    r = `${r}, ${n}`;
  } else if (!r) {
    r = n && n.toUpperCase() !== "S/N" ? `Rua Principal, ${n}` : "Rua Principal";
  }

  // Remove vírgulas duplicadas/múltiplas, números repetidos em sequência e vírgula final
  return r
    .replace(/,\s*,+/g, ",")
    .replace(/,+/g, ",")
    .replace(/(\b\d+\b)\s*,\s*\1\b/g, "$1")
    .replace(/,\s*$/, "")
    .trim();
}

function formatarEnderecoUber(
  logradouro?: string | null,
  numero?: string | null,
  complemento?: string | null,
  bairro?: string | null,
  cidade?: string | null,
  estado?: string | null,
  cep?: string | null,
  enderecoCompletoFallback?: string | null
): string {
  // Se o fallback já for um JSON válido com street_address, sanitiza e retorna
  if (enderecoCompletoFallback && enderecoCompletoFallback.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(enderecoCompletoFallback);
      if (parsed.street_address && Array.isArray(parsed.street_address)) {
        const objValido: UberAddressObj = {
          street_address: parsed.street_address.map((s: string) => sanitizarLinhaEndereco(String(s))),
          city: parsed.city || cidade || "Fortaleza",
          state: (parsed.state || estado || "CE").toUpperCase(),
          zip_code: String(parsed.zip_code || cep || "60710790").replace(/\D/g, ""),
          country: "BR",
        };
        return JSON.stringify(objValido);
      }
    } catch {
      // continua para a montagem normal
    }
  }

  let zipCode = (cep || "").replace(/\D/g, "");
  let rua = (logradouro || "").trim();
  let num = (numero || "").trim();
  let comp = (complemento || "").trim();
  let bair = (bairro || "").trim();
  let cid = (cidade || "").trim();
  let uf = (estado || "").trim().toUpperCase();

  if ((!rua || !cid || !zipCode) && enderecoCompletoFallback) {
    const partes = enderecoCompletoFallback.split(",").map((p: string) => p.trim());
    if (!rua && partes.length > 0) rua = partes[0];
    if (!num && partes.length > 1) {
      const matchNum = partes[1].match(/\d+/);
      if (matchNum) num = matchNum[0];
    }
    if (!zipCode) {
      const matchCep = enderecoCompletoFallback.match(/\d{5}-?\d{3}|\d{8}/);
      if (matchCep) zipCode = matchCep[0].replace(/\D/g, "");
    }
    if (!cid && partes.length >= 3) {
      const parteFinal = partes[partes.length - 1] || "";
      const parteCidUf = partes[partes.length - 2] || "";
      if (parteCidUf.includes("-")) {
        const sub = parteCidUf.split("-");
        cid = sub[0].trim();
        uf = sub[1].trim().toUpperCase();
      } else if (parteFinal.includes("-")) {
        const sub = parteFinal.split("-");
        cid = sub[0].trim();
        uf = sub[1].trim().toUpperCase();
      }
    }
  }

  if (!rua) rua = "Rua Principal";
  if (!cid) cid = "Fortaleza";
  if (!uf || uf.length !== 2) uf = "CE";
  if (!zipCode || zipCode.length !== 8) zipCode = "60710790";

  const linha1 = sanitizarLinhaEndereco(rua, num);
  const partesLinha2 = [comp, bair].filter(Boolean).join(" - ").trim().replace(/,+$/, "");
  const streetAddress = partesLinha2 ? [linha1, partesLinha2] : [linha1];

  const obj: UberAddressObj = {
    street_address: streetAddress,
    city: cid,
    state: uf,
    zip_code: zipCode,
    country: "BR",
  };

  return JSON.stringify(obj);
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

    // 3. Autenticação OAuth 2.0 (https://login.uber.com/oauth/v2/token)
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

    // 3.1. Ação Especial: Consulta e Sincronização em Tempo Real de Status com a Uber Direct
    if (body.acao === "consultar_status" || body.acao === "sincronizar_status") {
      const deliveryId = body.delivery_id || pedido?.codigo_rastreio || entrega?.codigo_rastreio;
      if (!deliveryId) {
        return new Response(
          JSON.stringify({ error: "delivery_id ou código de rastreio não encontrado para este pedido.", code: "DELIVERY_ID_MISSING" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const getEndpoint = `https://api.uber.com/v1/customers/${encodeURIComponent(uberCustomerId)}/deliveries/${encodeURIComponent(deliveryId)}`;
      const getRes = await fetch(getEndpoint, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!getRes.ok) {
        const errText = await getRes.text();
        return new Response(
          JSON.stringify({ error: "Falha ao consultar entrega na Uber Direct", details: errText }),
          { status: getRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const uberData = await getRes.json();
      const statusUber = (uberData.status || "").toLowerCase().trim();
      const agoraIso = new Date().toISOString();

      const courierName = uberData.courier?.name || null;
      const courierPhone = uberData.courier?.phone_number || null;

      if (statusUber === "delivered" || statusUber === "completed") {
        if (pedidoId) {
          const updateEnt: Record<string, any> = {
            status_envio: "entregue",
            atualizado_em: agoraIso,
          };
          if (courierName) updateEnt.entregador_nome = courierName;
          if (courierPhone) updateEnt.contato_entregador = courierPhone;

          await supabaseAdmin
            .from("pedido_entregas")
            .update(updateEnt)
            .eq("pedido_id", pedidoId);

          const { data: pDb } = await supabaseAdmin.from("pedidos").select("status").eq("id", pedidoId).maybeSingle();
          if (pDb?.status !== "concluido" && pDb?.status !== "cancelado") {
            const updatePed: Record<string, any> = {
              status: "entregue",
              atualizado_em: agoraIso,
            };
            if (courierName) updatePed.entregador_nome = courierName;

            await supabaseAdmin
              .from("pedidos")
              .update(updatePed)
              .eq("id", pedidoId);
          }
        }
      } else if (statusUber === "canceled") {
        if (pedidoId) {
          await supabaseAdmin
            .from("pedido_entregas")
            .update({ status_envio: "cancelado", atualizado_em: agoraIso })
            .eq("pedido_id", pedidoId);
        }
      } else if (statusUber === "pickup" || statusUber === "pickup_complete" || statusUber === "dropoff") {
        if (pedidoId) {
          const updateEnt: Record<string, any> = {
            status_envio: "em_transito",
            atualizado_em: agoraIso,
          };
          if (courierName) updateEnt.entregador_nome = courierName;
          if (courierPhone) updateEnt.contato_entregador = courierPhone;

          await supabaseAdmin
            .from("pedido_entregas")
            .update(updateEnt)
            .eq("pedido_id", pedidoId);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: statusUber,
          delivery: uberData,
          courier: uberData.courier || null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Montar Payload de Criação da Entrega (POST /v1/customers/{customer_id}/deliveries)
    const pickupName =
      customPayload?.pickup_name ||
      customPayload?.pickup?.name ||
      loja?.nome_fantasia ||
      "HUBI Loja";

    const pickupPhone = formatarTelefoneE164(
      customPayload?.pickup_phone_number ||
      customPayload?.pickup?.phone_number ||
      loja?.whatsapp ||
      loja?.telefone
    );

    const clienteNome =
      customPayload?.dropoff_name ||
      customPayload?.dropoff?.name ||
      pedido?.cliente?.nome ||
      pedido?.cliente_nome_avulso ||
      "Cliente";

    const clienteTelefone =
      pedido?.cliente?.whatsapp ||
      pedido?.cliente?.telefone ||
      pedido?.cliente_telefone_avulso ||
      "";

    const dropoffPhone = formatarTelefoneE164(
      customPayload?.dropoff_phone_number ||
      customPayload?.dropoff?.phone_number ||
      clienteTelefone,
      pickupPhone
    );

    const rawPickupAddress =
      typeof customPayload?.pickup_address === "string"
        ? customPayload.pickup_address
        : customPayload?.pickup?.address;

    const pickupAddressStr = formatarEnderecoUber(
      loja?.endereco_logradouro,
      loja?.endereco_numero,
      loja?.endereco_complemento,
      loja?.endereco_bairro,
      loja?.endereco_cidade,
      loja?.endereco_estado,
      loja?.endereco_cep,
      rawPickupAddress
    );

    const rawDropoffAddress =
      typeof customPayload?.dropoff_address === "string"
        ? customPayload.dropoff_address
        : (customPayload?.dropoff?.address || pedido?.endereco_entrega);

    const dropoffAddressStr = formatarEnderecoUber(
      entrega?.destino_logradouro,
      entrega?.destino_numero,
      entrega?.destino_complemento,
      entrega?.destino_bairro,
      entrega?.destino_cidade,
      entrega?.destino_uf,
      entrega?.destino_cep,
      rawDropoffAddress
    );

    // 3. Formatação de Itens (manifest_items)
    const rawItems = customPayload?.manifest_items || itens;
    const manifestItems = (rawItems && rawItems.length > 0)
      ? rawItems.map((i: any) => ({
          name: (i.nome_produto || i.name || "Produto").trim(),
          quantity: Math.max(1, Math.round(Number(i.quantidade || i.quantity || 1))),
          size: "small",
        }))
      : [
          {
            name: `Pedido #${pedido?.numero_pedido || pedido?.id?.slice(0, 6) || "HUBI"}`,
            quantity: 1,
            size: "small",
          },
        ];

    const deliveryPayload: Record<string, any> = {
      pickup_name: pickupName,
      pickup_address: pickupAddressStr,
      pickup_phone_number: pickupPhone,
      dropoff_name: clienteNome,
      dropoff_address: dropoffAddressStr,
      dropoff_phone_number: dropoffPhone,
      manifest_items: manifestItems,
    };

    // Configuração de Sandbox na Uber Direct (RoboCourier automático)
    if (isSandbox) {
      deliveryPayload.test_specifications = {
        robo_courier_specification: {
          mode: "auto",
        },
      };
    }

    // 4. Log Detalhado de Depuração
    console.log("PAYLOAD ENVIADO UBER:", JSON.stringify(deliveryPayload));

    // 5. Chamada à API da Uber Direct
    const deliveryEndpoint = `https://api.uber.com/v1/customers/${encodeURIComponent(uberCustomerId)}/deliveries`;
    const uberResponse = await fetch(deliveryEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(deliveryPayload),
    });

    const uberData = await uberResponse.json();

    if (!uberResponse.ok) {
      console.error("UBER ERROR DETAILS:", JSON.stringify(uberData));

      const rawCode = String(uberData.code || "").toLowerCase();
      const rawMsg = String(uberData.message || "").toLowerCase();
      const metadataDetails = String(uberData.metadata?.details || uberData.details || "").toLowerCase();
      const fullErrorText = `${rawCode} ${rawMsg} ${metadataDetails}`;

      const ehErroRaioOuIndeliverable =
        fullErrorText.includes("address_undeliverable") ||
        fullErrorText.includes("outside the delivery radius") ||
        fullErrorText.includes("outside_delivery_radius") ||
        fullErrorText.includes("delivery radius") ||
        fullErrorText.includes("max_distance_exceeded") ||
        fullErrorText.includes("distance_exceeded");

      const mensagemAmigavel = ehErroRaioOuIndeliverable
        ? "Endereço fora do raio de atendimento da Uber (Distância máxima permitida: ~5 km). Escolha outra forma de envio como Frete Próprio ou Melhor Envio."
        : (uberData.message || "Erro na Uber Direct");

      return new Response(
        JSON.stringify({
          error: mensagemAmigavel,
          message: mensagemAmigavel,
          raw_message: uberData.message,
          code: uberData.code || (ehErroRaioOuIndeliverable ? "OUTSIDE_DELIVERY_RADIUS" : "UBER_ERROR"),
          metadata_details: uberData.metadata?.details || null,
          details: uberData,
        }),
        {
          status: uberResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 7. Tratamento de Sucesso
    const trackingUrl =
      uberData.tracking_url ||
      uberData.trackingUrl ||
      (uberData.id ? `https://direct.uber.com/tracking/${uberData.id}` : "");
    const deliveryId = uberData.id || uberData.delivery_id;
    const pin =
      uberData.dropoff_pin ||
      uberData.pickup_pin ||
      uberData.verification?.pincode ||
      uberData.pin_entrega ||
      uberData.pincode ||
      null;

    return new Response(
      JSON.stringify({
        tracking_url: trackingUrl,
        link_rastreio: trackingUrl,
        delivery_id: deliveryId,
        id: deliveryId,
        pin: pin,
        pin_entrega: pin,
        status: uberData.status || "em_transito",
        is_sandbox: Boolean(isSandbox),
        raw: uberData,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("ERRO INTERNO EDGE FUNCTION:", err);
    return new Response(
      JSON.stringify({
        error: err.message || "Erro interno inesperado no despacho da Uber Direct.",
        code: "INTERNAL_EDGE_ERROR",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
