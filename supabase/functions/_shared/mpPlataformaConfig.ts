// supabase/functions/_shared/mpPlataformaConfig.ts
// Helper compartilhado para leitura das credenciais e parâmetros do Mercado Pago da plataforma HUBI.
// Utiliza exclusivamente o token da plataforma (public.configuracoes_plataforma.mp_access_token)
// com fallback para variável de ambiente, nunca utilizando tokens de lojas individuais.

export type AmbienteMercadoPago = "sandbox" | "producao";

export interface MpPlataformaConfig {
  mpAmbiente: AmbienteMercadoPago;
  mpAccessToken: string;
  mpPublicKey: string | null;
  mpWebhookSecret: string | null;
  valorMensalAnual: number;
  valorAnualTotal: number;
  maxParcelasCartao: number;
  parcelasSemJuros: number;
  aceitaCartaoDebito: boolean;
  descontoPixPercentual: number;
  valorMinimoRecargaWhatsapp: number;
}

export interface PerfilColetorMp {
  ok: boolean;
  status: number;
  id: string;
  nickname: string;
  email: string;
  nomeExibicao: string;
  isCollectorTestUser: boolean;
}

const COLUNAS_CONFIG_MP =
  "mp_ambiente, mp_access_token, mp_public_key, mp_webhook_secret, valor_anual_total, valor_mensal_anual, max_parcelas_cartao, parcelas_sem_juros, aceita_cartao_debito, desconto_pix_percentual, valor_minimo_recarga_whatsapp";

const COLUNAS_CONFIG_LEGADO =
  "valor_anual_total, valor_mensal_anual, max_parcelas_cartao, parcelas_sem_juros, aceita_cartao_debito, desconto_pix_percentual, valor_minimo_recarga_whatsapp";

export async function obterConfigMpPlataforma(supabaseAdmin: any): Promise<MpPlataformaConfig> {
  let { data, error } = await supabaseAdmin
    .from("configuracoes_plataforma")
    .select(COLUNAS_CONFIG_MP)
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    const fallback = await supabaseAdmin
      .from("configuracoes_plataforma")
      .select(COLUNAS_CONFIG_LEGADO)
      .eq("id", 1)
      .maybeSingle();
    data = fallback.data;
  }

  const envToken = (
    Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ||
    Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ||
    ""
  ).trim();

  const dbToken = typeof data?.mp_access_token === "string" ? data.mp_access_token.trim() : "";
  const mpAccessToken = dbToken || envToken;

  const mpAmbiente: AmbienteMercadoPago =
    data?.mp_ambiente === "producao" ? "producao" : "sandbox";

  const valorMensalRaw = Number(data?.valor_mensal_anual);
  const valorMensalAnual = Number.isFinite(valorMensalRaw) && valorMensalRaw > 0
    ? Number(valorMensalRaw.toFixed(2))
    : 49.90;

  const valorAnualRaw = Number(data?.valor_anual_total);
  const valorAnualCalculado = Number((valorMensalAnual * 12).toFixed(2));
  const valorAnualTotal = Number.isFinite(valorMensalRaw) && valorMensalRaw > 0
    ? valorAnualCalculado
    : (Number.isFinite(valorAnualRaw) && valorAnualRaw > 0 ? Number(valorAnualRaw.toFixed(2)) : 598.80);

  const maxParcelasRaw = Number(data?.max_parcelas_cartao);
  const maxParcelasCartao = Number.isFinite(maxParcelasRaw) && maxParcelasRaw >= 1
    ? Math.trunc(maxParcelasRaw)
    : 12;

  const semJurosRaw = Number(data?.parcelas_sem_juros);
  const parcelasSemJuros = Number.isFinite(semJurosRaw) && semJurosRaw >= 1
    ? Math.trunc(semJurosRaw)
    : maxParcelasCartao;

  const descontoPixRaw = Number(data?.desconto_pix_percentual);
  const descontoPixPercentual = Number.isFinite(descontoPixRaw) && descontoPixRaw >= 0
    ? Number(descontoPixRaw.toFixed(2))
    : 5.00;

  const minRecargaRaw = Number(data?.valor_minimo_recarga_whatsapp);
  const valorMinimoRecargaWhatsapp = Number.isFinite(minRecargaRaw) && minRecargaRaw > 0
    ? Number(minRecargaRaw.toFixed(2))
    : 10.00;

  return {
    mpAmbiente,
    mpAccessToken,
    mpPublicKey: typeof data?.mp_public_key === "string" && data.mp_public_key.trim()
      ? data.mp_public_key.trim()
      : null,
    mpWebhookSecret: typeof data?.mp_webhook_secret === "string" && data.mp_webhook_secret.trim()
      ? data.mp_webhook_secret.trim()
      : null,
    valorMensalAnual,
    valorAnualTotal,
    maxParcelasCartao,
    parcelasSemJuros,
    aceitaCartaoDebito: data?.aceita_cartao_debito !== false,
    descontoPixPercentual,
    valorMinimoRecargaWhatsapp,
  };
}

export async function consultarPerfilColetorMp(mpAccessToken: string): Promise<PerfilColetorMp> {
  try {
    const meRes = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${mpAccessToken}` },
    });

    if (!meRes.ok) {
      return {
        ok: false,
        status: meRes.status,
        id: "",
        nickname: "",
        email: "",
        nomeExibicao: "",
        isCollectorTestUser: false,
      };
    }

    const meData = await meRes.json();
    const email = String(meData.email || "").trim().toLowerCase();
    const nickname = String(meData.nickname || "").trim();
    const nomeCompleto = [meData.first_name, meData.last_name].filter(Boolean).join(" ").trim();
    const nomeExibicao = nomeCompleto || nickname || "Conta Mercado Pago";
    const tags: string[] = Array.isArray(meData.tags) ? meData.tags : [];
    const isCollectorTestUser =
      email.endsWith("@testuser.com") ||
      tags.includes("test_user") ||
      mpAccessToken.startsWith("TEST-");

    return {
      ok: true,
      status: meRes.status,
      id: String(meData.id || ""),
      nickname,
      email,
      nomeExibicao,
      isCollectorTestUser,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      id: "",
      nickname: "",
      email: "",
      nomeExibicao: "",
      isCollectorTestUser: mpAccessToken.startsWith("TEST-"),
    };
  }
}
