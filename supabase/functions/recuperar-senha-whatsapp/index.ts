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
  loja_id: string | null;
  nome_completo: string | null;
  email: string | null;
  whatsapp_atendimento: string | null;
  usuario_auth_id: string | null;
  ativo: boolean | null;
}

interface ErroMetaDetalhe {
  codigoMeta: string;
  subcodigoMeta: string;
  mensagemMeta: string;
}

interface ResultadoEnvioMeta {
  ok: boolean;
  statusHttp: number;
  payload: Record<string, unknown> | null;
  erroMeta: ErroMetaDetalhe | null;
}

function extrairErroMeta(statusHttp: number, payload: unknown): ErroMetaDetalhe {
  const errObj = (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object"
      ? payload.error
      : null
  ) as Record<string, unknown> | null;

  const codigoMeta =
    errObj?.code !== undefined && errObj?.code !== null
      ? String(errObj.code)
      : `HTTP_${statusHttp}`;
  const subcodigoMeta =
    errObj?.error_subcode !== undefined && errObj?.error_subcode !== null
      ? String(errObj.error_subcode)
      : "";
  const mensagemBruta =
    (typeof errObj?.error_user_msg === "string" && errObj.error_user_msg.trim()) ||
    (typeof errObj?.message === "string" && errObj.message.trim()) ||
    `Falha HTTP ${statusHttp} na Meta Graph API`;

  return {
    codigoMeta,
    subcodigoMeta,
    mensagemMeta: mensagemBruta.slice(0, 400),
  };
}

async function registrarLogMeta(
  supabaseAdmin: ReturnType<typeof createClient>,
  params: {
    lojaId?: string | null;
    usuarioId?: string | null;
    nivel: "ERROR" | "WARN" | "INFO";
    codigoErro?: string | null;
    mensagem: string;
  }
): Promise<void> {
  try {
    await supabaseAdmin.from("sistema_logs").insert({
      loja_id: params.lojaId || null,
      usuario_id: params.usuarioId || null,
      nivel: params.nivel,
      origem: "recuperar-senha-whatsapp",
      contexto: "envio_meta_api",
      codigo_erro: params.codigoErro ? params.codigoErro.slice(0, 50) : null,
      mensagem: params.mensagem.slice(0, 1000),
    });
  } catch {
    // Nunca interrompe o fluxo principal caso a gravação de observabilidade falhe
  }
}

async function enviarRequisicaoMeta(
  phoneNumberId: string,
  accessToken: string,
  payloadEnvio: Record<string, unknown>
): Promise<ResultadoEnvioMeta> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payloadEnvio),
      }
    );

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const possuiErroCorpo = Boolean(json && typeof json === "object" && "error" in json && json.error);

    if (!res.ok || possuiErroCorpo) {
      return {
        ok: false,
        statusHttp: res.status || 502,
        payload: json,
        erroMeta: extrairErroMeta(res.status || 502, json),
      };
    }

    return {
      ok: true,
      statusHttp: res.status,
      payload: json,
      erroMeta: null,
    };
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : "Erro de rede ao consultar Meta Graph API";
    return {
      ok: false,
      statusHttp: 502,
      payload: null,
      erroMeta: {
        codigoMeta: "META_NETWORK_ERROR",
        subcodigoMeta: "",
        mensagemMeta: detalhe.slice(0, 400),
      },
    };
  }
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
    .select("id, loja_id, nome_completo, email, whatsapp_atendimento, usuario_auth_id, ativo")
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
      .select("id, loja_id, nome_completo, email, whatsapp_atendimento, usuario_auth_id, ativo")
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

      const operadorPrincipal = operadores[0];

      if (!metaPhoneNumberId || !metaAccessToken) {
        await supabaseAdmin
          .from("recuperacao_senha_tokens")
          .update({ usado: true })
          .eq("id", tokenInserido.id);

        await registrarLogMeta(supabaseAdmin, {
          lojaId: operadorPrincipal?.loja_id,
          usuarioId: operadorPrincipal?.id,
          nivel: "ERROR",
          codigoErro: "META_CREDENTIALS_MISSING",
          mensagem:
            "Credenciais da API do WhatsApp (meta_phone_number_id / meta_access_token) ausentes em configuracoes_plataforma e variaveis de ambiente.",
        });

        const msgCredenciais = "Credenciais da API do WhatsApp não configuradas na plataforma.";
        return responderJson(
          {
            sucesso: false,
            erro: msgCredenciais,
            error: msgCredenciais,
          },
          500
        );
      }

      const templateNome = (Deno.env.get("META_TEMPLATE_OTP") || "hello_world").trim();
      const templateIdioma = (Deno.env.get("META_TEMPLATE_OTP_LANG") || "pt_BR").trim();
      const errosParametroTemplate = new Set(["132000", "132012", "131008"]);
      const ehTemplateAutenticacao = templateNome.toLowerCase() !== "hello_world";

      const componentesSomenteBody = [
        {
          type: "body",
          parameters: [{ type: "text", text: codigo }],
        },
      ];

      const componentesComBotao = [
        ...componentesSomenteBody,
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: codigo }],
        },
      ];

      const montarPayloadTemplate = (
        componentes: Record<string, unknown>[]
      ): Record<string, unknown> => ({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: telefoneNormalizado,
        type: "template",
        template: {
          name: templateNome,
          language: { code: templateIdioma },
          components: componentes,
        },
      });

      const usouBotaoNaTentativaInicial = ehTemplateAutenticacao;
      const componentesIniciais = usouBotaoNaTentativaInicial
        ? componentesComBotao
        : componentesSomenteBody;

      // Tentativa 1A: Template de autenticação envia body + botão Copiar Código; placeholder usa somente body
      let resultadoEnvio = await enviarRequisicaoMeta(
        metaPhoneNumberId,
        metaAccessToken,
        montarPayloadTemplate(componentesIniciais)
      );
      let modoEnvio = "template";

      // Tentativa 1B: Fallback bidirecional caso componente de botão ou parâmetro seja rejeitado (#132000, #132012, #131008)
      const codigoErroInicial = resultadoEnvio.erroMeta?.codigoMeta || "";
      if (
        !resultadoEnvio.ok &&
        errosParametroTemplate.has(codigoErroInicial) &&
        ehTemplateAutenticacao
      ) {
        const componentesAlternativos = usouBotaoNaTentativaInicial
          ? componentesSomenteBody
          : componentesComBotao;

        resultadoEnvio = await enviarRequisicaoMeta(
          metaPhoneNumberId,
          metaAccessToken,
          montarPayloadTemplate(componentesAlternativos)
        );
      }

      // Tentativa 2: Fallback para texto livre caso template não exista (#132001) ou placeholder hello_world incompatível
      const codigoErroPosTemplate = resultadoEnvio.erroMeta?.codigoMeta || "";
      const deveTentarTextoLivre =
        !resultadoEnvio.ok &&
        (codigoErroPosTemplate === "132001" ||
          (!ehTemplateAutenticacao && errosParametroTemplate.has(codigoErroPosTemplate)));

      if (deveTentarTextoLivre) {
        const codigoFallback = resultadoEnvio.erroMeta?.codigoMeta || "";
        const detalheTemplate = resultadoEnvio.erroMeta?.mensagemMeta || "Template indisponível";

        await registrarLogMeta(supabaseAdmin, {
          lojaId: operadorPrincipal?.loja_id,
          usuarioId: operadorPrincipal?.id,
          nivel: "WARN",
          codigoErro: codigoFallback,
          mensagem: `Template '${templateNome}' (${templateIdioma}) falhou (${detalheTemplate}). Tentando fallback em texto livre para janela de 24h.`,
        });

        resultadoEnvio = await enviarRequisicaoMeta(
          metaPhoneNumberId,
          metaAccessToken,
          {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: telefoneNormalizado,
            type: "text",
            text: {
              preview_url: false,
              body: `HUBI: Seu código de verificação para redefinir sua senha é: *${codigo}*. Válido por 10 minutos.`,
            },
          }
        );
        modoEnvio = "texto_janela_24h";
      }

      if (!resultadoEnvio.ok) {
        await supabaseAdmin
          .from("recuperacao_senha_tokens")
          .update({ usado: true })
          .eq("id", tokenInserido.id);

        const erroMeta = resultadoEnvio.erroMeta || {
          codigoMeta: String(resultadoEnvio.statusHttp || 502),
          subcodigoMeta: "",
          mensagemMeta: "Falha desconhecida na Meta Graph API",
        };
        const sufixoSubcodigo = erroMeta.subcodigoMeta ? `/${erroMeta.subcodigoMeta}` : "";
        const detalheMetaFormatado = `(#${erroMeta.codigoMeta}${sufixoSubcodigo}) ${erroMeta.mensagemMeta}`;

        await registrarLogMeta(supabaseAdmin, {
          lojaId: operadorPrincipal?.loja_id,
          usuarioId: operadorPrincipal?.id,
          nivel: "ERROR",
          codigoErro: erroMeta.codigoMeta,
          mensagem: `Erro Meta Cloud API ao enviar OTP (${modoEnvio}): ${detalheMetaFormatado}`,
        });

        const mensagemErroClara = `Não foi possível entregar o código no WhatsApp: ${detalheMetaFormatado}. Verifique se o template de autenticação está aprovado no Gerenciador do WhatsApp.`;
        const statusRetorno =
          resultadoEnvio.statusHttp >= 400 && resultadoEnvio.statusHttp < 500 ? 400 : 502;

        return responderJson(
          {
            sucesso: false,
            erro: mensagemErroClara,
            error: mensagemErroClara,
            meta_error_code: erroMeta.codigoMeta,
          },
          statusRetorno
        );
      }

      return responderJson({
        sucesso: true,
        modo_envio: modoEnvio,
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
