// Módulo compartilhado: supabase/functions/_shared/shopeeClient.ts
// Gerenciador centralizado de assinatura HMAC-SHA256, OAuth2 (4h/30d) e chamadas à Shopee Open Platform API v2.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gerarStateHmac, validarStateHmac } from "./mlClient.ts";

export { gerarStateHmac as gerarStateShopeeHmac, validarStateHmac as validarStateShopeeHmac };

export const SHOPEE_API_BASE = (
  Deno.env.get("SHOPEE_API_BASE") || "https://partner.shopeemobile.com"
).replace(/\/$/, "");

export interface ShopeeContaCredenciais {
  id: string;
  loja_id: string;
  ml_user_id: number;
  seller_id: string | null;
  ml_nickname: string;
  ml_site_id: string;
  access_token: string;
  refresh_token: string;
  token_expira_em: string;
  refresh_token_expires_at: string | null;
  status_conexao: "conectado" | "expirado" | "erro_autenticacao" | "desconectado";
  taxa_comissao_padrao_percentual: number;
  taxa_fixa_padrao: number;
  sincronizar_estoque_automatico: boolean;
  importar_pedidos_automatico: boolean;
  shopee_partner_id?: string | null;
  shopee_partner_key?: string | null;
}

export class ShopeeError extends Error {
  public statusCode: number;
  public userMessage: string;

  constructor(userMessage: string, statusCode: number = 500) {
    super(userMessage);
    this.name = "ShopeeError";
    this.statusCode = statusCode;
    this.userMessage = userMessage;
  }
}

export async function gerarHmacSha256Hex(
  mensagem: string,
  chaveSecreta: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(chaveSecreta),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinaturaBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(mensagem)
  );
  return Array.from(new Uint8Array(assinaturaBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function assinarRequisicaoPublicaShopee(
  partnerId: string,
  partnerKey: string,
  apiPath: string,
  timestamp: number
): Promise<string> {
  return await gerarHmacSha256Hex(`${partnerId}${apiPath}${timestamp}`, partnerKey);
}

export async function assinarRequisicaoLojaShopee(
  partnerId: string,
  partnerKey: string,
  apiPath: string,
  timestamp: number,
  accessToken: string,
  shopId: string | number
): Promise<string> {
  return await gerarHmacSha256Hex(
    `${partnerId}${apiPath}${timestamp}${accessToken}${shopId}`,
    partnerKey
  );
}

export async function verificarAssinaturaWebhookShopee(
  urlCompleta: string,
  rawBody: string,
  authorizationHeader: string | null,
  partnerKey: string
): Promise<boolean> {
  const assinaturaRecebida = String(authorizationHeader || "")
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();
  if (!assinaturaRecebida || !partnerKey) return false;

  const base = `${urlCompleta}|${rawBody}`;
  const esperada = (await gerarHmacSha256Hex(base, partnerKey)).toLowerCase();
  return signatureTimingSafeEqual(assinaturaRecebida, esperada);
}

function signatureTimingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function obterCredenciaisAppShopee(
  supabaseAdmin: SupabaseClient,
  lojaId?: string
): Promise<{ partnerId: string; partnerKey: string }> {
  let partnerId = (Deno.env.get("SHOPEE_PARTNER_ID") || "").trim();
  let partnerKey = (Deno.env.get("SHOPEE_PARTNER_KEY") || "").trim();

  if ((!partnerId || !partnerKey) && lojaId) {
    const { data: conta } = await supabaseAdmin
      .from("marketplace_contas")
      .select("shopee_partner_id, shopee_partner_key")
      .eq("loja_id", lojaId)
      .eq("provedor", "shopee")
      .maybeSingle();

    if (conta) {
      partnerId = partnerId || String(conta.shopee_partner_id || "").trim();
      partnerKey = partnerKey || String(conta.shopee_partner_key || "").trim();
    }
  }

  if (!partnerId || !partnerKey) {
    throw new ShopeeError(
      "Credenciais do aplicativo Shopee (Partner ID / Partner Key) não configuradas no servidor.",
      500
    );
  }

  return { partnerId, partnerKey };
}

export async function obterAccessTokenShopeeValido(
  supabaseAdmin: SupabaseClient,
  lojaId: string
): Promise<{
  token: string;
  shopId: number;
  partnerId: string;
  partnerKey: string;
  conta: ShopeeContaCredenciais;
}> {
  const { data: conta, error: erroConta } = await supabaseAdmin
    .from("marketplace_contas")
    .select(
      "id, loja_id, ml_user_id, seller_id, ml_nickname, ml_site_id, access_token, refresh_token, token_expira_em, refresh_token_expires_at, status_conexao, taxa_comissao_padrao_percentual, taxa_fixa_padrao, sincronizar_estoque_automatico, importar_pedidos_automatico, shopee_partner_id, shopee_partner_key"
    )
    .eq("loja_id", lojaId)
    .eq("provedor", "shopee")
    .maybeSingle();

  if (erroConta || !conta) {
    throw new ShopeeError("Conta da Shopee não encontrada ou não conectada nesta loja.", 404);
  }

  if (conta.status_conexao === "desconectado") {
    throw new ShopeeError("A integração com a Shopee está desconectada para esta loja.", 400);
  }

  const { partnerId, partnerKey } = await obterCredenciaisAppShopee(supabaseAdmin, lojaId);
  const shopId = Number(conta.seller_id || conta.ml_user_id);

  if (!Number.isFinite(shopId) || shopId <= 0) {
    throw new ShopeeError("Identificador da loja na Shopee (shop_id) inválido.", 400);
  }

  const agora = Date.now();
  const expiraEmMs = new Date(conta.token_expira_em).getTime();
  const cincoMinutosMs = 5 * 60 * 1000;

  if (conta.access_token && Number.isFinite(expiraEmMs) && expiraEmMs - agora > cincoMinutosMs) {
    return {
      token: conta.access_token,
      shopId,
      partnerId,
      partnerKey,
      conta: conta as ShopeeContaCredenciais,
    };
  }

  // Refresh automático de token (access_token 4h / refresh_token 30 dias)
  const apiPath = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await assinarRequisicaoPublicaShopee(partnerId, partnerKey, apiPath, timestamp);

  try {
    const respRefresh = await fetch(
      `${SHOPEE_API_BASE}${apiPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          partner_id: Number(partnerId),
          shop_id: shopId,
          refresh_token: conta.refresh_token,
        }),
      }
    );

    const dadosToken = await respRefresh.json().catch(() => ({}));
    if (!respRefresh.ok || (dadosToken?.error && dadosToken.error !== "") || !dadosToken?.access_token) {
      await supabaseAdmin
        .from("marketplace_contas")
        .update({
          status_conexao: "expirado",
          ultimo_erro_mensagem:
            "A autorização da Shopee expirou. Reconecte sua conta em Configurações.",
        })
        .eq("id", conta.id);

      throw new ShopeeError(
        "Sua sessão da Shopee expirou. Por favor, reconecte sua conta em Configurações.",
        401
      );
    }

    const expireInSeg = Number(dadosToken.expire_in || 14400);
    const novoTokenExpiraEm = new Date(Date.now() + expireInSeg * 1000).toISOString();
    const novoRefreshExpiraEm = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from("marketplace_contas")
      .update({
        access_token: dadosToken.access_token,
        refresh_token: dadosToken.refresh_token || conta.refresh_token,
        token_expira_em: novoTokenExpiraEm,
        refresh_token_expires_at: novoRefreshExpiraEm,
        status_conexao: "conectado",
        ultimo_erro_mensagem: null,
      })
      .eq("id", conta.id);

    conta.access_token = dadosToken.access_token;
    conta.refresh_token = dadosToken.refresh_token || conta.refresh_token;
    conta.token_expira_em = novoTokenExpiraEm;
    conta.refresh_token_expires_at = novoRefreshExpiraEm;
    conta.status_conexao = "conectado";

    return {
      token: dadosToken.access_token,
      shopId,
      partnerId,
      partnerKey,
      conta: conta as ShopeeContaCredenciais,
    };
  } catch (err) {
    if (err instanceof ShopeeError) throw err;
    throw new ShopeeError(
      "Não foi possível renovar a conexão com a Shopee. Tente novamente em instantes.",
      502
    );
  }
}

export async function chamarApiShopeeLoja<T = any>(params: {
  apiPath: string;
  method?: "GET" | "POST";
  token: string;
  shopId: number;
  partnerId: string;
  partnerKey: string;
  queryParams?: Record<string, string | number | boolean | Array<string | number> | undefined>;
  bodyJson?: Record<string, unknown>;
  bodyFormData?: FormData;
}): Promise<T> {
  const {
    apiPath,
    method = "GET",
    token,
    shopId,
    partnerId,
    partnerKey,
    queryParams = {},
    bodyJson,
    bodyFormData,
  } = params;

  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await assinarRequisicaoLojaShopee(
    partnerId,
    partnerKey,
    apiPath,
    timestamp,
    token,
    shopId
  );

  const search = new URLSearchParams();
  search.set("partner_id", partnerId);
  search.set("timestamp", String(timestamp));
  search.set("access_token", token);
  search.set("shop_id", String(shopId));
  search.set("sign", sign);

  for (const [k, v] of Object.entries(queryParams)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length > 0) {
        search.set(k, v.join(","));
      }
    } else {
      search.set(k, String(v));
    }
  }

  const url = `${SHOPEE_API_BASE}${apiPath}?${search.toString()}`;
  const headers: Record<string, string> = { "Accept": "application/json" };
  let body: BodyInit | undefined;

  if (bodyFormData) {
    body = bodyFormData;
  } else if (bodyJson && method === "POST") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(bodyJson);
  }

  const resp = await fetch(url, { method, headers, body });
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok || (data?.error && String(data.error).trim() !== "")) {
    const detalhe = String(data?.message || data?.error || `HTTP ${resp.status}`).trim();
    throw new ShopeeError(`Shopee: ${detalhe}`, resp.ok ? 400 : resp.status);
  }

  return data as T;
}
