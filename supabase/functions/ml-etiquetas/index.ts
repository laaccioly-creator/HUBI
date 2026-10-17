// Supabase Edge Function: ml-etiquetas
// Obtém o stream binário PDF ou ZPL2 oficial de etiqueta do Mercado Envios para expedição e despacho.
// Deploy: npx supabase functions deploy ml-etiquetas

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { obterAccessTokenValido, MercadoLivreError } from "../_shared/mlClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  try {
    const url = new URL(req.url);
    const pedidoId = url.searchParams.get("pedido_id") || (await req.json().catch(() => ({})))?.pedido_id;
    const formato = url.searchParams.get("formato") || "pdf"; // 'pdf' ou 'zpl2'

    if (!pedidoId) {
      return new Response(
        JSON.stringify({ error: "Identificador do pedido (pedido_id) é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Valida o Token JWT do operador autenticado
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Cabeçalho de autorização ausente." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: erroUser } = await supabaseUserClient.auth.getUser();
    if (erroUser || !user) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida ou expirada. Faça login novamente." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 2. Busca o pedido e valida o vínculo com a loja
    const { data: pedido, error: erroPedido } = await supabaseAdmin
      .from("pedidos")
      .select("id, loja_id, numero_pedido, ml_order_id, ml_shipment_id, ml_etiqueta_impressa")
      .eq("id", pedidoId)
      .maybeSingle();

    if (erroPedido || !pedido) {
      return new Response(
        JSON.stringify({ error: "Pedido não encontrado no sistema." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Validação multi-tenant: usuário pertence à loja do pedido?
    const { data: usuarioLoja } = await supabaseAdmin
      .from("usuarios_loja")
      .select("id")
      .eq("loja_id", pedido.loja_id)
      .eq("usuario_auth_id", user.id)
      .maybeSingle();

    if (!usuarioLoja) {
      return new Response(
        JSON.stringify({ error: "Você não tem permissão para imprimir etiquetas desta loja." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pedido.ml_shipment_id) {
      return new Response(
        JSON.stringify({ error: "Este pedido não possui envio associado no Mercado Envios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Obtém o token de acesso válido para a loja
    const { token } = await obterAccessTokenValido(supabaseAdmin, pedido.loja_id);

    // 5. Verifica o status do shipment antes de requisitar a etiqueta
    const respShipment = await fetch(`https://api.mercadolibre.com/shipments/${pedido.ml_shipment_id}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      },
    });

    if (respShipment.ok) {
      const dadosShipment = await respShipment.json();
      const statusEnvio = dadosShipment.status;
      const substatus = dadosShipment.substatus;

      // Se ainda não estiver pronto para impressão
      if (statusEnvio === "handling" && substatus !== "ready_to_print" && substatus !== "printed") {
        return new Response(
          JSON.stringify({
            error: "A etiqueta ainda está sendo gerada pelo Mercado Envios. Aguarde alguns instantes e tente novamente.",
            status_envio: statusEnvio,
            substatus: substatus,
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 6. Faz o download do binário oficial da etiqueta no Mercado Livre
    const urlEtiqueta = `https://api.mercadolibre.com/shipment_labels?shipment_ids=${pedido.ml_shipment_id}&response_type=${formato === "zpl2" ? "zpl2" : "pdf"}`;

    const respEtiqueta = await fetch(urlEtiqueta, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!respEtiqueta.ok) {
      const erroTexto = await respEtiqueta.text().catch(() => "");
      console.error("[ml-etiquetas] Erro na API de etiquetas:", erroTexto);
      return new Response(
        JSON.stringify({ error: "Não foi possível obter a etiqueta do Mercado Envios. Tente novamente em instantes." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bufferEtiqueta = await respEtiqueta.arrayBuffer();

    // 7. Marca o pedido como impresso em public.pedidos
    await supabaseAdmin
      .from("pedidos")
      .update({
        ml_etiqueta_impressa: true,
        ml_etiqueta_impressa_em: new Date().toISOString(),
      })
      .eq("id", pedido.id);

    // 8. Retorna o binário diretamente com os cabeçalhos apropriados
    const contentType = formato === "zpl2" ? "text/plain; charset=utf-8" : "application/pdf";
    const contentDisposition = `inline; filename="etiqueta_ml_${pedido.numero_pedido}_${pedido.ml_shipment_id}.${formato === "zpl2" ? "txt" : "pdf"}"`;

    return new Response(bufferEtiqueta, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
      },
    });
  } catch (error: any) {
    console.error("[ml-etiquetas] Exceção:", error?.message);
    const statusCode = error instanceof MercadoLivreError ? error.statusCode : 500;
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno ao processar a etiqueta de envio." }),
      { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
