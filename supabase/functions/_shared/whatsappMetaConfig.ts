// Módulo compartilhado: supabase/functions/_shared/whatsappMetaConfig.ts
// Resolve credenciais da Meta Cloud API para disparos ativos (saída) e atendimento receptivo (entrada).

export interface LojaMetaCredenciaisParcial {
  meta_phone_number_id?: string | null;
  meta_access_token?: string | null;
}

export interface PlataformaMetaCredenciaisParcial {
  meta_phone_number_id?: string | null;
  meta_access_token?: string | null;
  meta_verify_token?: string | null;
}

export interface CredenciaisMetaSaidaResolvidas {
  phoneNumberId: string;
  accessToken: string;
  origem: "loja" | "plataforma";
}

/**
 * Na saída (disparos de recibos/notificações):
 * - Se a loja possuir meta_phone_number_id e meta_access_token próprios preenchidos, usa-os;
 * - Caso contrário, utiliza os parâmetros globais de configuracoes_plataforma (com fallback para secrets de ambiente).
 */
export function resolverCredenciaisMetaSaida(
  loja?: LojaMetaCredenciaisParcial | null,
  configPlat?: PlataformaMetaCredenciaisParcial | null
): CredenciaisMetaSaidaResolvidas {
  const lojaPhoneId = (loja?.meta_phone_number_id || "").trim();
  const lojaToken = (loja?.meta_access_token || "").trim();

  if (lojaPhoneId && lojaToken) {
    return {
      phoneNumberId: lojaPhoneId,
      accessToken: lojaToken,
      origem: "loja",
    };
  }

  const platPhoneId = (configPlat?.meta_phone_number_id || Deno.env.get("META_PHONE_NUMBER_ID") || "").trim();
  const platToken = (configPlat?.meta_access_token || Deno.env.get("META_ACCESS_TOKEN") || "").trim();

  return {
    phoneNumberId: platPhoneId,
    accessToken: platToken,
    origem: "plataforma",
  };
}

/**
 * Na entrada (webhook receptivo / envio pelo phone_number_id vinculado):
 * - Usa o token da própria loja se preenchido, ou o token global de configuracoes_plataforma.
 */
export function resolverTokenMetaReceptivo(
  loja?: LojaMetaCredenciaisParcial | null,
  configPlat?: PlataformaMetaCredenciaisParcial | null
): string {
  return (
    loja?.meta_access_token ||
    configPlat?.meta_access_token ||
    Deno.env.get("META_ACCESS_TOKEN") ||
    ""
  ).trim();
}
