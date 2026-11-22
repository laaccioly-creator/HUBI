// Supabase Edge Function: gemini-proxy
// Deploy: npx supabase functions deploy gemini-proxy --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELO_PADRAO_GEMINI = "gemini-2.5-flash";
const MODELO_FALLBACK_GEMINI = "gemini-2.0-flash";
const MODELOS_DESCONTINUADOS = new Set([
  "gemini-3.8-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash-lite",
]);

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function sanitizarPayloadParaModelo(
  payloadBase: Record<string, unknown>,
  modelo: string
): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...payloadBase };
  if (
    !modelo.startsWith("gemini-2.5") &&
    clone.generationConfig &&
    typeof clone.generationConfig === "object"
  ) {
    const genCfg = clone.generationConfig as Record<string, unknown>;
    if ("thinkingConfig" in genCfg) {
      const { thinkingConfig: _tc, ...restoGenCfg } = genCfg;
      clone.generationConfig = restoGenCfg;
    }
  }
  return clone;
}

async function chamarGoogleGemini(
  modelo: string,
  action: string,
  apiKey: string,
  payloadBase: Record<string, unknown>
): Promise<{ response: Response; data: Record<string, unknown> }> {
  const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:${action}?key=${apiKey}`;
  let payloadAtual = sanitizarPayloadParaModelo(payloadBase, modelo);

  let response = await fetch(googleUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadAtual),
  });

  if (
    response.status === 400 &&
    payloadAtual.generationConfig &&
    typeof payloadAtual.generationConfig === "object"
  ) {
    const genCfg = payloadAtual.generationConfig as Record<string, unknown>;
    if (genCfg.thinkingConfig || genCfg.responseSchema) {
      const { thinkingConfig: _tc, responseSchema: _rs, ...cleanGenCfg } = genCfg;
      payloadAtual = {
        ...payloadAtual,
        generationConfig: cleanGenCfg,
      };
      response = await fetch(googleUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadAtual),
      });
    }
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { response, data };
}

function traduzirErroGooglePtBr(status: number, detalhe: string): { statusHttp: number; error: string } {
  if (status === 401 || status === 403) {
    return {
      statusHttp: 422,
      error: "Chave da API do Google Gemini inválida ou sem permissão.",
    };
  }
  if (status === 429) {
    return {
      statusHttp: 429,
      error: "Limite temporário de requisições da IA atingido. Aguarde alguns segundos e tente novamente.",
    };
  }
  if (status === 400) {
    return {
      statusHttp: 400,
      error: "Não foi possível processar o conteúdo enviado para a IA. Tente com outra foto ou texto.",
    };
  }
  if (status >= 500) {
    return {
      statusHttp: 502,
      error: "O serviço do Google Gemini está temporariamente indisponível. Tente novamente em instantes.",
    };
  }
  return {
    statusHttp: 422,
    error: detalhe
      ? "Não foi possível obter resposta válida da IA para esta solicitação."
      : "Falha ao consultar o motor de Inteligência Artificial.",
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ ok: false, error: "Método não permitido.", detalhe: "method_not_allowed" }, 405);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const {
      contents,
      generationConfig,
      safetySettings,
      systemInstruction,
      tools,
      model = MODELO_PADRAO_GEMINI,
      action = "generateContent",
      api_key,
      apiKey,
      loja_id,
      lojaId,
      requestBody,
    } = body;

    const lojaIdResolvido = String(lojaId || loja_id || "").trim();
    const apiKeyPayload = String(apiKey || api_key || "").trim();
    let resolvedApiKey = apiKeyPayload;

    // 1. Validação de loja ativa (sem exigir JWT auth.users) e resolução da chave BYOK da loja
    if (lojaIdResolvido) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        if (supabaseUrl && serviceKey) {
          const supabaseAdmin = createClient(supabaseUrl, serviceKey);
          const { data: loja, error: lojaError } = await supabaseAdmin
            .from("lojas")
            .select("id, ativo, gemini_api_key, configuracoes_extras")
            .eq("id", lojaIdResolvido)
            .maybeSingle();

          if (!lojaError && (!loja || loja.ativo === false)) {
            return jsonResponse(
              {
                ok: false,
                error: "Loja não encontrada ou inativa para uso da IA.",
                detalhe: "loja_invalida",
              },
              403
            );
          }

          if (!resolvedApiKey && loja) {
            const extras = loja.configuracoes_extras as { ia?: { gemini_api_key?: string } } | null;
            resolvedApiKey = String(
              loja.gemini_api_key || extras?.ia?.gemini_api_key || ""
            ).trim();
          }
        }
      } catch (err) {
        console.warn("[gemini-proxy] Falha ao consultar loja:", err);
      }
    }

    // 2. Fallback para segredo da plataforma nos Secrets do Supabase
    if (!resolvedApiKey) {
      resolvedApiKey = (
        Deno.env.get("GEMINI_API_KEY") ||
        Deno.env.get("GOOGLE_AI_STUDIO_API_KEY") ||
        ""
      ).trim();
    }

    if (!resolvedApiKey) {
      return jsonResponse(
        {
          ok: false,
          error: "Chave da API do Google Gemini não configurada no servidor ou na loja.",
          detalhe: "chave_ausente",
        },
        400
      );
    }

    // 3. Construção do payload da Google Generative Language API
    const googlePayload: Record<string, unknown> = {};
    if (requestBody && typeof requestBody === "object") {
      Object.assign(googlePayload, requestBody as Record<string, unknown>);
      delete googlePayload.model;
    } else {
      if (contents) googlePayload.contents = contents;
      if (generationConfig) googlePayload.generationConfig = generationConfig;
      if (safetySettings) googlePayload.safetySettings = safetySettings;
      if (systemInstruction) googlePayload.systemInstruction = systemInstruction;
      if (tools) googlePayload.tools = tools;
    }

    let cleanModel = String(model || MODELO_PADRAO_GEMINI).replace(/^models\//, "").trim();
    if (!cleanModel || MODELOS_DESCONTINUADOS.has(cleanModel.toLowerCase())) {
      cleanModel = MODELO_PADRAO_GEMINI;
    }

    const actionLimpa = String(action || "generateContent").trim() || "generateContent";

    let resultadoGoogle = await chamarGoogleGemini(
      cleanModel,
      actionLimpa,
      resolvedApiKey,
      googlePayload
    );

    // Fallback automático caso a Google API retorne 404 para o modelo primário
    if (resultadoGoogle.response.status === 404 && cleanModel !== MODELO_FALLBACK_GEMINI) {
      console.warn(`[gemini-proxy] Modelo ${cleanModel} retornou 404. Tentando fallback ${MODELO_FALLBACK_GEMINI}...`);
      resultadoGoogle = await chamarGoogleGemini(
        MODELO_FALLBACK_GEMINI,
        actionLimpa,
        resolvedApiKey,
        googlePayload
      );
    }

    if (!resultadoGoogle.response.ok) {
      const errObj = resultadoGoogle.data?.error as { message?: string } | string | undefined;
      const detalheGoogle =
        typeof errObj === "string"
          ? errObj
          : String(errObj?.message || resultadoGoogle.response.statusText || "");
      const traduzido = traduzirErroGooglePtBr(resultadoGoogle.response.status, detalheGoogle);

      return jsonResponse(
        {
          ok: false,
          error: traduzido.error,
          detalhe: detalheGoogle || `HTTP ${resultadoGoogle.response.status}`,
        },
        traduzido.statusHttp
      );
    }

    return jsonResponse(resultadoGoogle.data, 200);
  } catch (err: unknown) {
    const detalhe = err instanceof Error ? err.message : String(err);
    console.error("[gemini-proxy] Erro ao processar requisição:", err);
    return jsonResponse(
      {
        ok: false,
        error: "Falha interna ao processar requisição Gemini.",
        detalhe,
      },
      500
    );
  }
});
