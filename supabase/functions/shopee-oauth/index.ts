// Supabase Edge Function: shopee-oauth
// Gerencia autorização OAuth 2.0 + assinatura HMAC-SHA256 da Shopee Open Platform API v2.
// Deploy: npx supabase functions deploy shopee-oauth --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  SHOPEE_API_BASE,
  assinarRequisicaoLojaShopee,
  assinarRequisicaoPublicaShopee,
  gerarStateShopeeHmac,
  obterCredenciaisAppShopee,
  validarStateShopeeHmac,
} from "../_shared/shopeeClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

async function concluirTrocaTokenShopee(params: {
  supabaseAdmin: any;
  lojaId: string;
  code: string;
  shopId: number;
  partnerId: string;
  partnerKey: string;
}) {
  const { supabaseAdmin, lojaId, code, shopId, partnerId, partnerKey } = params;

  const tokenPath = "/api/v2/auth/token/get";
  const tsToken = Math.floor(Date.now() / 1000);
  const signToken = await assinarRequisicaoPublicaShopee(
    partnerId,
    partnerKey,
    tokenPath,
    tsToken
  );

  const respTroca = await fetch(
    `${SHOPEE_API_BASE}${tokenPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${tsToken}&sign=${signToken}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        code,
        shop_id: shopId,
        partner_id: Number(partnerId),
      }),
    }
  );

  const tokenData = await respTroca.json().catch(() => ({}));
  if (!respTroca.ok || (tokenData?.error && tokenData.error !== "") || !tokenData?.access_token) {
    throw new Error(
      tokenData?.message || tokenData?.error || "Falha ao trocar código por token na Shopee."
    );
  }

  // Consulta nome oficial da loja na Shopee (/api/v2/shop/get_shop_info)
  let shopName = `Shopee_${shopId}`;
  try {
    const infoPath = "/api/v2/shop/get_shop_info";
    const tsInfo = Math.floor(Date.now() / 1000);
    const signInfo = await assinarRequisicaoLojaShopee(
      partnerId,
      partnerKey,
      infoPath,
      tsInfo,
      tokenData.access_token,
      shopId
    );
    const respInfo = await fetch(
      `${SHOPEE_API_BASE}${infoPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${tsInfo}&access_token=${encodeURIComponent(tokenData.access_token)}&shop_id=${shopId}&sign=${signInfo}`,
      { headers: { "Accept": "application/json" } }
    );
    const infoJson = await respInfo.json().catch(() => ({}));
    if (respInfo.ok && typeof infoJson?.shop_name === "string" && infoJson.shop_name.trim()) {
      shopName = infoJson.shop_name.trim().slice(0, 120);
    }
  } catch {
    // Mantém fallback seguro com shop_id
  }

  const expireInSeg = Number(tokenData.expire_in || 14400);
  const tokenExpiraEm = new Date(Date.now() + expireInSeg * 1000).toISOString();
  const refreshExpiraEm = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const dadosConta = {
    loja_id: lojaId,
    provedor: "shopee" as const,
    plataforma: "shopee" as const,
    ml_user_id: shopId,
    seller_id: String(shopId),
    ml_nickname: shopName,
    ml_site_id: "BR",
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_expira_em: tokenExpiraEm,
    refresh_token_expires_at: refreshExpiraEm,
    status_conexao: "conectado" as const,
    sincronizar_estoque_automatico: true,
    importar_pedidos_automatico: true,
    ultima_sincronizacao_em: new Date().toISOString(),
    ultimo_erro_mensagem: null,
  };

  const { data: contaExistente } = await supabaseAdmin
    .from("marketplace_contas")
    .select("id")
    .eq("loja_id", lojaId)
    .eq("provedor", "shopee")
    .maybeSingle();

  if (contaExistente?.id) {
    const { data: atualizada, error: erroUpdate } = await supabaseAdmin
      .from("marketplace_contas")
      .update(dadosConta)
      .eq("id", contaExistente.id)
      .select()
      .single();

    if (erroUpdate) throw new Error(erroUpdate.message);
    return { conta: atualizada, shopName };
  }

  const { data: inserida, error: erroInsert } = await supabaseAdmin
    .from("marketplace_contas")
    .insert(dadosConta)
    .select()
    .single();

  if (erroInsert) throw new Error(erroInsert.message);
  return { conta: inserida, shopName };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const shopeeRedirectUri =
    Deno.env.get("SHOPEE_REDIRECT_URI") ||
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/shopee-oauth`;
  const hubiFrontendUrl =
    Deno.env.get("APP_URL") ||
    Deno.env.get("FRONTEND_URL") ||
    Deno.env.get("HUBI_FRONTEND_URL") ||
    "https://rubi.ia.br";

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      const code = url.searchParams.get("code");
      const shopIdStr = url.searchParams.get("shop_id");
      const state = url.searchParams.get("state");

      // CASO A: Callback oficial da Shopee (?code=...&shop_id=...&state=...)
      if (code && shopIdStr && state) {
        const shopId = Number(shopIdStr);
        const stateSecret =
          (Deno.env.get("SHOPEE_STATE_HMAC_SECRET") || Deno.env.get("SHOPEE_PARTNER_KEY") || "hubi-shopee-state-salt");

        const { valido, lojaId } = await validarStateShopeeHmac(state, stateSecret);
        if (!valido || !lojaId || !Number.isFinite(shopId) || shopId <= 0) {
          const redirectErro = `${hubiFrontendUrl}/config?tab=parceiros&shopee_status=error&shopee_msg=${encodeURIComponent("Sessão de autorização expirada ou inválida. Tente conectar novamente.")}`;
          return Response.redirect(redirectErro, 302);
        }

        try {
          const { partnerId, partnerKey } = await obterCredenciaisAppShopee(supabaseAdmin, lojaId);
          const { shopName } = await concluirTrocaTokenShopee({
            supabaseAdmin,
            lojaId,
            code,
            shopId,
            partnerId,
            partnerKey,
          });

          const redirectSucesso = `${hubiFrontendUrl}/config?tab=parceiros&shopee_status=success&shop_name=${encodeURIComponent(shopName)}`;
          return Response.redirect(redirectSucesso, 302);
        } catch (errCallback: any) {
          console.error("[shopee-oauth] Erro no callback GET:", errCallback?.message);
          const redirectErro = `${hubiFrontendUrl}/config?tab=parceiros&shopee_status=error&shopee_msg=${encodeURIComponent(errCallback?.message || "Falha ao concluir conexão com a Shopee.")}`;
          return Response.redirect(redirectErro, 302);
        }
      }

      // CASO B: Gerar URL de autorização OAuth2 assinada via GET ?action=authorize_url&loja_id=...
      const action = url.searchParams.get("action");
      const lojaId = url.searchParams.get("loja_id");

      if (action !== "authorize_url" || !lojaId) {
        return new Response(
          JSON.stringify({ error: "Parâmetros inválidos. Informe action=authorize_url e loja_id." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
      const {
        data: { user },
        error: erroUser,
      } = await supabaseUserClient.auth.getUser();
      if (erroUser || !user) {
        return new Response(
          JSON.stringify({ error: "Sessão inválida ou expirada." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: usuarioLoja } = await supabaseAdmin
        .from("usuarios_loja")
        .select("id")
        .eq("loja_id", lojaId)
        .eq("usuario_auth_id", user.id)
        .maybeSingle();

      if (!usuarioLoja) {
        return new Response(
          JSON.stringify({ error: "Você não tem permissão para gerenciar integrações desta loja." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { partnerId, partnerKey } = await obterCredenciaisAppShopee(supabaseAdmin, lojaId);
      const stateSecret =
        Deno.env.get("SHOPEE_STATE_HMAC_SECRET") || partnerKey || "hubi-shopee-state-salt";
      const stateAssinado = await gerarStateShopeeHmac(lojaId, stateSecret);

      const authPath = "/api/v2/shop/auth_partner";
      const timestamp = Math.floor(Date.now() / 1000);
      const sign = await assinarRequisicaoPublicaShopee(partnerId, partnerKey, authPath, timestamp);
      const redirectComState = `${shopeeRedirectUri}${shopeeRedirectUri.includes("?") ? "&" : "?"}state=${encodeURIComponent(stateAssinado)}`;

      const urlAutorizacao = `${SHOPEE_API_BASE}${authPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirectComState)}`;

      return new Response(
        JSON.stringify({ sucesso: true, url: urlAutorizacao }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST") {
      const corpo = await req.json().catch(() => ({}));
      const action = typeof corpo?.action === "string" ? corpo.action : "";
      const lojaId = typeof corpo?.loja_id === "string" ? corpo.loja_id.trim() : "";

      if (action === "get_auth_url") {
        if (!lojaId) {
          return new Response(
            JSON.stringify({ error: "loja_id é obrigatório." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
          return new Response(
            JSON.stringify({ error: "Autenticação obrigatória." }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const supabaseUserClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await supabaseUserClient.auth.getUser();
        if (!user) {
          return new Response(
            JSON.stringify({ error: "Sessão expirada." }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: usuarioLoja } = await supabaseAdmin
          .from("usuarios_loja")
          .select("id")
          .eq("loja_id", lojaId)
          .eq("usuario_auth_id", user.id)
          .maybeSingle();

        if (!usuarioLoja) {
          return new Response(
            JSON.stringify({ error: "Sem permissão para esta loja." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { partnerId, partnerKey } = await obterCredenciaisAppShopee(supabaseAdmin, lojaId);
        const stateSecret =
          Deno.env.get("SHOPEE_STATE_HMAC_SECRET") || partnerKey || "hubi-shopee-state-salt";
        const stateAssinado = await gerarStateShopeeHmac(lojaId, stateSecret);
        const authPath = "/api/v2/shop/auth_partner";
        const timestamp = Math.floor(Date.now() / 1000);
        const sign = await assinarRequisicaoPublicaShopee(partnerId, partnerKey, authPath, timestamp);
        const redirectComState = `${shopeeRedirectUri}${shopeeRedirectUri.includes("?") ? "&" : "?"}state=${encodeURIComponent(stateAssinado)}`;
        const urlAutorizacao = `${SHOPEE_API_BASE}${authPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirectComState)}`;

        return new Response(
          JSON.stringify({ sucesso: true, url: urlAutorizacao }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "exchange_code" || (corpo?.code && corpo?.shop_id && corpo?.state)) {
        const stateSecret =
          Deno.env.get("SHOPEE_STATE_HMAC_SECRET") || Deno.env.get("SHOPEE_PARTNER_KEY") || "hubi-shopee-state-salt";
        const { valido, lojaId: lojaDoState } = await validarStateShopeeHmac(
          String(corpo.state || ""),
          stateSecret
        );
        const lojaAlvo = lojaDoState || lojaId;
        const shopIdNum = Number(corpo.shop_id);

        if (!valido || !lojaAlvo || !Number.isFinite(shopIdNum) || shopIdNum <= 0) {
          return new Response(
            JSON.stringify({ error: "Parâmetros de autorização Shopee inválidos ou expirados." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { partnerId, partnerKey } = await obterCredenciaisAppShopee(supabaseAdmin, lojaAlvo);
        const { conta } = await concluirTrocaTokenShopee({
          supabaseAdmin,
          lojaId: lojaAlvo,
          code: String(corpo.code),
          shopId: shopIdNum,
          partnerId,
          partnerKey,
        });

        return new Response(
          JSON.stringify({ sucesso: true, conta }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "disconnect" && lojaId) {
        const { error: erroDesc } = await supabaseAdmin
          .from("marketplace_contas")
          .update({
            status_conexao: "desconectado",
            ultimo_erro_mensagem: "Desconectado manualmente pelo lojista.",
          })
          .eq("loja_id", lojaId)
          .eq("provedor", "shopee");

        if (erroDesc) throw new Error(erroDesc.message);

        return new Response(
          JSON.stringify({ sucesso: true, mensagem: "Conta Shopee desconectada." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Ação OAuth Shopee não reconhecida." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Método HTTP não suportado." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[shopee-oauth] Erro:", err?.message);
    return new Response(
      JSON.stringify({ error: err?.userMessage || err?.message || "Erro interno ao processar autenticação Shopee." }),
      { status: err?.statusCode || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
