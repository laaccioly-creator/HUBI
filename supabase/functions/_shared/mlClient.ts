// Módulo compartilhado: supabase/functions/_shared/mlClient.ts
// Gerenciador centralizado de chamadas à API do Mercado Livre, renovação transparente de OAuth e sanitização de erros.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface MlContaCredenciais {
  id: string;
  loja_id: string;
  ml_user_id: number;
  ml_nickname: string;
  ml_site_id: string;
  access_token: string;
  refresh_token: string;
  token_expira_em: string;
  status_conexao: 'conectado' | 'expirado' | 'erro_autenticacao' | 'desconectado';
  taxa_comissao_padrao_percentual: number;
  taxa_fixa_padrao: number;
  sincronizar_estoque_automatico: boolean;
}

export interface MlTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token: string;
}

/**
 * Erro de comunicação com o Mercado Livre sanitizado em pt-BR (pii-leak-detector)
 */
export class MercadoLivreError extends Error {
  public statusCode: number;
  public userMessage: string;

  constructor(userMessage: string, statusCode: number = 500) {
    super(userMessage);
    this.name = 'MercadoLivreError';
    this.statusCode = statusCode;
    this.userMessage = userMessage;
  }
}

/**
 * Obtém ou renova automaticamente o access_token válido para a loja informada.
 * Se o token atual expirar em menos de 5 minutos, executa a renovação via refresh_token.
 */
export async function obterAccessTokenValido(
  supabaseAdmin: SupabaseClient,
  lojaId: string
): Promise<{ token: string; conta: MlContaCredenciais }> {
  const { data: conta, error: erroConta } = await supabaseAdmin
    .from("marketplace_contas")
    .select("id, loja_id, ml_user_id, ml_nickname, ml_site_id, access_token, refresh_token, token_expira_em, status_conexao, taxa_comissao_padrao_percentual, taxa_fixa_padrao, sincronizar_estoque_automatico")
    .eq("loja_id", lojaId)
    .eq("provedor", "mercadolivre")
    .maybeSingle();

  if (erroConta || !conta) {
    throw new MercadoLivreError("Conta do Mercado Livre não encontrada ou não conectada nesta loja.", 404);
  }

  if (conta.status_conexao === 'desconectado') {
    throw new MercadoLivreError("A integração com o Mercado Livre está desconectada para esta loja.", 400);
  }

  const agora = Date.now();
  const expiraEmMs = new Date(conta.token_expira_em).getTime();
  const cincoMinutosMs = 5 * 60 * 1000;

  // Se o token ainda é válido com margem de segurança de 5 minutos, retorna-o
  if (expiraEmMs - agora > cincoMinutosMs) {
    return { token: conta.access_token, conta: conta as MlContaCredenciais };
  }

  // Token expirado ou prestes a expirar: realiza refresh
  const mlAppId = Deno.env.get("ML_APP_ID") || "";
  const mlClientSecret = Deno.env.get("ML_CLIENT_SECRET") || "";

  if (!mlAppId || !mlClientSecret) {
    throw new MercadoLivreError("Credenciais de aplicativo do Mercado Livre não configuradas no servidor.", 500);
  }

  try {
    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("client_id", mlAppId);
    params.append("client_secret", mlClientSecret);
    params.append("refresh_token", conta.refresh_token);

    const respostaRefresh = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: params.toString(),
    });

    if (!respostaRefresh.ok) {
      // Atualiza status para expirado para que o lojista veja alerta na tela
      await supabaseAdmin
        .from("marketplace_contas")
        .update({
          status_conexao: "expirado",
          ultimo_erro_mensagem: "A autorização do Mercado Livre expirou. Reconecte sua conta em Configurações.",
        })
        .eq("id", conta.id);

      throw new MercadoLivreError("Sua sessão do Mercado Livre expirou. Por favor, reconecte sua conta em Configurações.", 401);
    }

    const dadosToken: MlTokenResponse = await respostaRefresh.json();
    const novoExpiraEm = new Date(Date.now() + (dadosToken.expires_in || 21600) * 1000).toISOString();

    const { error: erroUpdate } = await supabaseAdmin
      .from("marketplace_contas")
      .update({
        access_token: dadosToken.access_token,
        refresh_token: dadosToken.refresh_token,
        token_expira_em: novoExpiraEm,
        status_conexao: "conectado",
        ultimo_erro_mensagem: null,
      })
      .eq("id", conta.id);

    if (erroUpdate) {
      console.error("[mlClient] Falha ao persistir novos tokens:", erroUpdate.message);
    }

    conta.access_token = dadosToken.access_token;
    conta.refresh_token = dadosToken.refresh_token;
    conta.token_expira_em = novoExpiraEm;
    conta.status_conexao = "conectado";

    return { token: dadosToken.access_token, conta: conta as MlContaCredenciais };
  } catch (err: any) {
    if (err instanceof MercadoLivreError) throw err;
    throw new MercadoLivreError("Não foi possível renovar a conexão com o Mercado Livre. Tente novamente em instantes.", 502);
  }
}

/**
 * Assina um state anti-CSRF combinando loja_id, timestamp e HMAC-SHA256
 */
export async function gerarStateHmac(lojaId: string, secret: string): Promise<string> {
  const timestamp = Date.now().toString();
  const payload = `${lojaId}:${timestamp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${payload}:${signatureHex}`;
}

/**
 * Valida se o state retornado no callback OAuth é íntegro e não expirou (máximo 15 minutos)
 */
export async function validarStateHmac(state: string, secret: string): Promise<{ valido: boolean; lojaId?: string }> {
  try {
    const partes = state.split(":");
    if (partes.length !== 3) return { valido: false };

    const [lojaId, timestampStr, signatureRecebida] = partes;
    const timestamp = parseInt(timestampStr, 10);
    const quinzeMinutosMs = 15 * 60 * 1000;

    if (isNaN(timestamp) || Date.now() - timestamp > quinzeMinutosMs) {
      return { valido: false };
    }

    const payload = `${lojaId}:${timestampStr}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const signatureCalculada = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (signatureCalculada !== signatureRecebida) {
      return { valido: false };
    }

    return { valido: true, lojaId };
  } catch {
    return { valido: false };
  }
}
