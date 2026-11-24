// Supabase Edge Function: recuperar-senha-whatsapp
// Recuperação de senha via token numérico de 6 dígitos enviado pela Meta WhatsApp Cloud API
// Deploy: npx supabase functions deploy recuperar-senha-whatsapp --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AcaoRecuperacao = "solicitar_token" | "validar_token" | "validar_e_redefinir";

interface RecuperacaoPayload {
  acao?: AcaoRecuperacao;
  telefone?: string;
  codigo?: string;
  nova_senha?: string;
}

interface OperadorVinculo {
  id: string;
  nome_completo: string | null;
  email: string | null;
  whatsapp_atendimento: string | null;
  usuario_auth_id: string | null;
  ativo: boolean | null;
}

function responderJson(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizarTelefoneBrasil(telefone: string): string {
  const texto = (telefone || "").trim();
  if (!texto) return "";

  if (texto.includes("@") && !/@hubi\.(app|internal)$/i.test(texto)) {
    return "";
  }

  const base = texto.includes("@") ? texto.split("@")[0] : texto;
  const digitos = base.replace(/\D/g, "");
  if (!digitos) return "";

  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
    return digitos;
  }

  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`;
  }

  return "";
}

function gerarCodigo6Digitos(): string {
  const range = 900000;
  const limite = Math.floor(0x100000000 / range) * range;
  const buffer = new Uint32Array(1);

  while (true) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limite) {
      return String(100000 + (buffer[0] % range));
    }
  }
}

async function gerarHashSha256Hex(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function compararTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function buscarOperadoresAtivosPorTelefone(
  supabaseAdmin: ReturnType<typeof createClient>,
  telefoneNormalizado: string
): Promise<OperadorVinculo[]> {
  const telSemDdi =
    telefoneNormalizado.startsWith("55") && telefoneNormalizado.length >= 12
      ? telefoneNormalizado.slice(2)
      : telefoneNormalizado;

  const emailCanonico = `${telefoneNormalizado}@hubi.app`;
  const emailInternoSemDdi = `${telSemDdi}@hubi.internal`;
  const emailInternoComDdi = `${telefoneNormalizado}@hubi.internal`;

  const mapa = new Map<string, OperadorVinculo>();

  const { data: diretos, error: errDiretos } = await supabaseAdmin
    .from("usuarios_loja")
    .select("id, nome_completo, email, whatsapp_atendimento, usuario_auth_id, ativo")
    .or(
      `email.ilike.${emailCanonico},email.ilike.${emailInternoSemDdi},email.ilike.${emailInternoComDdi},whatsapp_atendimento.eq.${telefoneNormalizado},whatsapp_atendimento.eq.${telSemDdi}`
    );

  if (errDiretos) {
    throw new Error("Falha ao consultar operadores cadastrados.");
  }

  for (const item of (diretos || []) as OperadorVinculo[]) {
    if (item.ativo !== false) {
      mapa.set(item.id, item);
    }
  }

  const sufixo8Digitos = telSemDdi.slice(-8);
  if (sufixo8Digitos.length === 8) {
    const { data: porSufixo } = await supabaseAdmin
      .from("usuarios_loja")
      .select("id, nome_completo, email, whatsapp_atendimento, usuario_auth_id, ativo")
      .ilike("whatsapp_atendimento", `%${sufixo8Digitos}%`);

    for (const item of (porSufixo || []) as OperadorVinculo[]) {
      if (item.ativo === false) continue;
      const foneItem = normalizarTelefoneBrasil(item.whatsapp_atendimento || "");
      if (foneItem === telefoneNormalizado) {
        mapa.set(item.id, item);
      }
    }
  }

  return Array.from(mapa.values());
}

async function obterTokenValidoParaVerificacao(
  supabaseAdmin: ReturnType<typeof createClient>,
  telefoneNormalizado: string,
  codigo: string
): Promise<{
  ok: boolean;
  tokenId?: string;
  erro?: string;
  status?: number;
}> {
  if (!/^\d{6}$/.test(codigo)) {
    return {
      ok: false,
      status: 400,
      erro: "Informe o código numérico de 6 dígitos enviado para o seu WhatsApp.",
    };
  }

  const { data: token, error: errToken } = await supabaseAdmin
    .from("recuperacao_senha_tokens")
    .select("id, codigo_hash, tentativas, expira_em, usado")
    .eq("telefone_normalizado", telefoneNormalizado)
    .eq("usado", false)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errToken || !token) {
    return {
      ok: false,
      status: 400,
      erro: "Código expirado ou inválido. Solicite um novo código pelo WhatsApp.",
    };
  }

  if (new Date(token.expira_em).getTime() <= Date.now()) {
    await supabaseAdmin
      .from("recuperacao_senha_tokens")
      .update({ usado: true })
      .eq("id", token.id);

    return {
      ok: false,
      status: 400,
      erro: "Este código expirou. Solicite um novo código pelo WhatsApp.",
    };
  }

  const tentativasAtuais = Number(token.tentativas ?? 0);
  if (tentativasAtuais >= 5) {
    await supabaseAdmin
      .from("recuperacao_senha_tokens")
      .update({ usado: true })
      .eq("id", token.id);

    return {
      ok: false,
      status: 400,
      erro: "Limite de tentativas excedido. Solicite um novo código pelo WhatsApp.",
    };
  }

  const codigoHash = await gerarHashSha256Hex(codigo);
  const confere = compararTempoConstante(codigoHash, String(token.codigo_hash || ""));

  if (!confere) {
    const novasTentativas = tentativasAtuais + 1;
    const esgotado = novasTentativas >= 5;

    await supabaseAdmin
      .from("recuperacao_senha_tokens")
      .update({
        tentativas: novasTentativas,
        ...(esgotado ? { usado: true } : {}),
      })
      .eq("id", token.id);

    return {
      ok: false,
      status: 400,
      erro: esgotado
        ? "Limite de tentativas excedido. Solicite um novo código pelo WhatsApp."
        : `Código incorreto. Você ainda possui ${5 - novasTentativas} tentativa(s).`,
    };
  }

  return {
    ok: true,
    tokenId: token.id,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  if (req.method !== "POST") {
    return responderJson(
      { sucesso: false, erro: "Método não permitido." },
      405
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as RecuperacaoPayload;
    const acao = body.acao;
    const telefoneNormalizado = normalizarTelefoneBrasil(body.telefone || "");

    if (!telefoneNormalizado) {
      return responderJson(
        {
          sucesso: false,
          erro: "Informe um número de WhatsApp válido com DDD (ex: 85 99999-9999).",
        },
        400
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !supabaseServiceKey) {
      return responderJson(
        {
          sucesso: false,
          erro: "Serviço de recuperação indisponível no momento. Tente novamente em instantes.",
        },
        503
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    if (acao === "solicitar_token") {
      const operadores = await buscarOperadoresAtivosPorTelefone(
        supabaseAdmin,
        telefoneNormalizado
      );

      if (operadores.length === 0) {
        return responderJson(
          {
            sucesso: false,
            erro: "Não encontramos nenhuma conta ativa vinculada a este WhatsApp. Verifique o número digitado.",
          },
          404
        );
      }

      const codigo = gerarCodigo6Digitos();
      const codigoHash = await gerarHashSha256Hex(codigo);
      const expiraEm = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await supabaseAdmin
        .from("recuperacao_senha_tokens")
        .update({ usado: true })
        .eq("telefone_normalizado", telefoneNormalizado)
        .eq("usado", false);

      const { data: tokenInserido, error: errInsert } = await supabaseAdmin
        .from("recuperacao_senha_tokens")
        .insert({
          telefone_normalizado: telefoneNormalizado,
          codigo_hash: codigoHash,
          tentativas: 0,
          expira_em: expiraEm,
          usado: false,
        })
        .select("id")
        .single();

      if (errInsert || !tokenInserido?.id) {
        return responderJson(
          {
            sucesso: false,
            erro: "Não foi possível gerar o código de verificação agora. Tente novamente.",
          },
          500
        );
      }

      const { data: configPlat } = await supabaseAdmin
        .from("configuracoes_plataforma")
        .select("meta_phone_number_id, meta_access_token")
        .eq("id", 1)
        .maybeSingle();

      const metaPhoneNumberId = (
        configPlat?.meta_phone_number_id ||
        Deno.env.get("META_PHONE_NUMBER_ID") ||
        ""
      ).trim();
      const metaAccessToken = (
        configPlat?.meta_access_token ||
        Deno.env.get("META_ACCESS_TOKEN") ||
        ""
      ).trim();

      if (!metaPhoneNumberId || !metaAccessToken) {
        await supabaseAdmin
          .from("recuperacao_senha_tokens")
          .update({ usado: true })
          .eq("id", tokenInserido.id);

        return responderJson(
          {
            sucesso: false,
            erro: "O envio automático via WhatsApp não está configurado no momento. Entre em contato com o suporte.",
          },
          503
        );
      }

      const mensagemWhatsApp =
        `HUBI: Seu código de verificação para redefinir sua senha é: ${codigo}.\n\n` +
        `Este código é válido por 10 minutos. Não compartilhe com ninguém.`;

      const metaRes = await fetch(
        `https://graph.facebook.com/v21.0/${metaPhoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${metaAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: telefoneNormalizado,
            type: "text",
            text: {
              preview_url: false,
              body: mensagemWhatsApp,
            },
          }),
        }
      );

      if (!metaRes.ok) {
        await supabaseAdmin
          .from("recuperacao_senha_tokens")
          .update({ usado: true })
          .eq("id", tokenInserido.id);

        return responderJson(
          {
            sucesso: false,
            erro: "Não foi possível enviar o código para o seu WhatsApp no momento. Tente novamente em instantes.",
          },
          502
        );
      }

      return responderJson({
        sucesso: true,
        mensagem: "Código de 6 dígitos enviado para o seu WhatsApp! Ele é válido por 10 minutos.",
      });
    }

    if (acao === "validar_token") {
      const codigoLimpo = String(body.codigo || "").replace(/\D/g, "");
      const validacao = await obterTokenValidoParaVerificacao(
        supabaseAdmin,
        telefoneNormalizado,
        codigoLimpo
      );

      if (!validacao.ok) {
        return responderJson(
          { sucesso: false, erro: validacao.erro },
          validacao.status || 400
        );
      }

      return responderJson({
        sucesso: true,
        mensagem: "Código validado com sucesso!",
      });
    }

    if (acao === "validar_e_redefinir") {
      const codigoLimpo = String(body.codigo || "").replace(/\D/g, "");
      const novaSenhaLimpa = String(body.nova_senha || "").trim();

      if (novaSenhaLimpa.length < 6) {
        return responderJson(
          {
            sucesso: false,
            erro: "A nova senha precisa ter no mínimo 6 caracteres.",
          },
          400
        );
      }

      const validacao = await obterTokenValidoParaVerificacao(
        supabaseAdmin,
        telefoneNormalizado,
        codigoLimpo
      );

      if (!validacao.ok || !validacao.tokenId) {
        return responderJson(
          { sucesso: false, erro: validacao.erro },
          validacao.status || 400
        );
      }

      const operadores = await buscarOperadoresAtivosPorTelefone(
        supabaseAdmin,
        telefoneNormalizado
      );

      if (operadores.length === 0) {
        return responderJson(
          {
            sucesso: false,
            erro: "Não encontramos nenhum vínculo ativo para este WhatsApp.",
          },
          404
        );
      }

      const authIds = new Set<string>();
      for (const op of operadores) {
        if (op.usuario_auth_id) {
          authIds.add(op.usuario_auth_id);
        }
      }

      for (const authId of authIds) {
        const { error: authUpdateErr } = await supabaseAdmin.auth.admin.updateUserById(
          authId,
          { password: novaSenhaLimpa }
        );
        if (authUpdateErr && authUpdateErr.status !== 404) {
          return responderJson(
            {
              sucesso: false,
              erro: "Não foi possível atualizar a senha de acesso. Tente novamente em instantes.",
            },
            500
          );
        }
      }

      const { error: rpcHashErr } = await supabaseAdmin.rpc(
        "atualizar_senha_hash_colaborador",
        {
          p_telefone: telefoneNormalizado,
          p_nova_senha: novaSenhaLimpa,
        }
      );

      if (rpcHashErr) {
        return responderJson(
          {
            sucesso: false,
            erro: "Não foi possível concluir a atualização da senha. Tente novamente.",
          },
          500
        );
      }

      await supabaseAdmin
        .from("recuperacao_senha_tokens")
        .update({ usado: true })
        .eq("telefone_normalizado", telefoneNormalizado)
        .eq("usado", false);

      return responderJson({
        sucesso: true,
        mensagem: "Senha redefinida com sucesso! Você já pode entrar com sua nova senha.",
      });
    }

    return responderJson(
      { sucesso: false, erro: "Ação de recuperação não reconhecida." },
      400
    );
  } catch {
    return responderJson(
      {
        sucesso: false,
        erro: "Ocorreu um erro ao processar sua solicitação. Tente novamente em instantes.",
      },
      500
    );
  }
});
