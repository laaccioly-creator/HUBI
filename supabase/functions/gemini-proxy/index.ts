// Supabase Edge Function: gemini-proxy
// Deploy: npx supabase functions deploy gemini-proxy --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELOS_RAPIDOS_HOMOLOGADOS = [
  "gemini-3.8-flash",
  "gemini-2.5-flash",
] as const;

const TIMEOUT_CHAMADA_GOOGLE_MS = 8000;
const TIMEOUT_HANDLER_GLOBAL_MS = 8500;

interface ResultadoChamadaGoogle {
  ok: boolean;
  status: number;
  timeout: boolean;
  data: Record<string, unknown>;
}

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function extrairChaveGeminiDaLoja(
  registro: { gemini_api_key?: unknown; configuracoes_extras?: unknown } | null | undefined
): string {
  if (!registro) return "";
  if (typeof registro.gemini_api_key === "string" && registro.gemini_api_key.trim()) {
    return registro.gemini_api_key.trim();
  }
  let extras = registro.configuracoes_extras;
  if (typeof extras === "string") {
    try {
      extras = JSON.parse(extras);
    } catch {
      extras = null;
    }
  }
  if (extras && typeof extras === "object") {
    const iaObj = (extras as { ia?: { gemini_api_key?: unknown } }).ia;
    if (typeof iaObj?.gemini_api_key === "string" && iaObj.gemini_api_key.trim()) {
      return iaObj.gemini_api_key.trim();
    }
  }
  return "";
}

function sanitizarPayloadParaModelo(
  payloadBase: Record<string, unknown>,
  modelo: string
): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...payloadBase };
  const ehTts = modelo.toLowerCase().includes("-tts");

  const genCfgAtual =
    clone.generationConfig && typeof clone.generationConfig === "object"
      ? ({ ...(clone.generationConfig as Record<string, unknown>) })
      : {};

  // Remove thinkingConfig para evitar rejeições ou travamentos entre versões dos modelos Flash
  delete genCfgAtual.thinkingConfig;

  if (!ehTts) {
    if (genCfgAtual.temperature === undefined) {
      genCfgAtual.temperature = 0.2;
    }
    if (genCfgAtual.maxOutputTokens === undefined) {
      genCfgAtual.maxOutputTokens = 512;
    }
    clone.generationConfig = genCfgAtual;
  } else if (Object.keys(genCfgAtual).length > 0) {
    clone.generationConfig = genCfgAtual;
  } else {
    delete clone.generationConfig;
  }

  return clone;
}

async function fetchComTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function chamarGoogleGemini(
  modelo: string,
  action: string,
  apiKey: string,
  payloadBase: Record<string, unknown>
): Promise<ResultadoChamadaGoogle> {
  const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:${action}?key=${apiKey}`;
  let payloadAtual = sanitizarPayloadParaModelo(payloadBase, modelo);

  try {
    let response = await fetchComTimeout(
      googleUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadAtual),
      },
      TIMEOUT_CHAMADA_GOOGLE_MS
    );

    if (
      response.status === 400 &&
      payloadAtual.generationConfig &&
      typeof payloadAtual.generationConfig === "object"
    ) {
      const genCfg = payloadAtual.generationConfig as Record<string, unknown>;
      if (genCfg.responseSchema) {
        const { responseSchema: _rs, ...cleanGenCfg } = genCfg;
        payloadAtual = {
          ...payloadAtual,
          generationConfig: cleanGenCfg,
        };
        response = await fetchComTimeout(
          googleUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadAtual),
          },
          TIMEOUT_CHAMADA_GOOGLE_MS
        );
      }
    }

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: response.ok,
      status: response.status,
      timeout: false,
      data,
    };
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    if (isTimeout) {
      console.warn(`[gemini-proxy] Timeout (${TIMEOUT_CHAMADA_GOOGLE_MS}ms) no modelo ${modelo}.`);
      return { ok: false, status: 504, timeout: true, data: {} };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[gemini-proxy] Falha de rede no modelo ${modelo}:`, msg);
    return {
      ok: false,
      status: 502,
      timeout: false,
      data: { error: { message: msg } },
    };
  }
}

function extrairDetalheErroGoogle(data: Record<string, unknown>, status: number): string {
  const errObj = data?.error as { message?: string } | string | undefined;
  if (typeof errObj === "string" && errObj.trim()) return errObj.trim();
  if (errObj && typeof errObj === "object" && errObj.message) {
    return String(errObj.message).trim();
  }
  return `HTTP ${status}`;
}

function traduzirErroGooglePtBr(status: number, detalhe: string): { statusHttp: number; error: string } {
  if (status === 401 || status === 403) {
    return {
      statusHttp: 422,
      error: "Chave de API do Google Gemini inválida ou sem cota. Verifique em Configurações > IA.",
    };
  }
  if (status === 429) {
    return {
      statusHttp: 429,
      error: "Limite de cota da API do Google Gemini atingido. Aguarde alguns segundos ou verifique em Configurações > IA.",
    };
  }
  if (status === 400) {
    const resumo = detalhe ? detalhe.slice(0, 180) : "parâmetros ou imagem inválidos";
    return {
      statusHttp: 400,
      error: `A API do Google Gemini recusou a solicitação: ${resumo}.`,
    };
  }
  if (status === 504) {
    return {
      statusHttp: 504,
      error: "A leitura pela IA demorou mais que o esperado. Tente novamente em instantes.",
    };
  }
  return {
    statusHttp: status >= 500 ? 502 : 422,
    error: detalhe
      ? `Erro ao consultar a API do Google Gemini (${status}): ${detalhe.slice(0, 180)}`
      : "Não foi possível obter resposta válida da API do Google Gemini.",
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  let etapaAtual = "inicio";

  const executarHandler = async (): Promise<Response> => {
    try {
      if (req.method !== "POST") {
        return jsonResponse({ ok: false, error: "Método não permitido.", detalhe: "method_not_allowed" }, 405);
      }

      etapaAtual = "lendo_body";
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const {
        contents,
        generationConfig,
        safetySettings,
        systemInstruction,
        tools,
        model,
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

      // 1. Consulta rápida da chave BYOK (própria ou herdada da mesma organizacao_id)
      etapaAtual = "buscando_chave_db";
      if (!resolvedApiKey && lojaIdResolvido) {
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
          if (supabaseUrl && serviceKey) {
            const supabaseAdmin = createClient(supabaseUrl, serviceKey);
            const { data: loja, error: lojaError } = await supabaseAdmin
              .from("lojas")
              .select("id, ativo, organizacao_id, gemini_api_key, configuracoes_extras")
              .eq("id", lojaIdResolvido)
              .maybeSingle();

            if (!lojaError && loja && loja.ativo === false) {
              return jsonResponse(
                {
                  ok: false,
                  error: "Loja não encontrada ou inativa para uso da IA.",
                  detalhe: "loja_invalida",
                },
                403
              );
            }

            if (loja) {
              resolvedApiKey = extrairChaveGeminiDaLoja(loja);

              if (!resolvedApiKey && loja.organizacao_id) {
                const { data: lojasIrmas } = await supabaseAdmin
                  .from("lojas")
                  .select("ativo, gemini_api_key, configuracoes_extras")
                  .eq("organizacao_id", loja.organizacao_id)
                  .neq("id", loja.id)
                  .limit(20);

                if (Array.isArray(lojasIrmas)) {
                  const irmasOrdenadas = [
                    ...lojasIrmas.filter((item) => item.ativo !== false),
                    ...lojasIrmas.filter((item) => item.ativo === false),
                  ];
                  for (const irma of irmasOrdenadas) {
                    const chaveIrma = extrairChaveGeminiDaLoja(irma);
                    if (chaveIrma) {
                      resolvedApiKey = chaveIrma;
                      break;
                    }
                  }
                }
              }
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
            error: "Chave de API do Google Gemini não configurada. Verifique em Configurações > IA.",
            detalhe: "chave_ausente",
            statusGoogle: 401,
          },
          400
        );
      }

      // 3. Construção do payload limpo da Google Generative Language API
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

      // 4. 'gemini-3.8-flash' como primário e fallback para 'gemini-2.5-flash' apenas em HTTP 404
      etapaAtual = "chamando_google_gemini";
      const requestedModel = String(model || "").replace(/^models\//i, "").trim();
      const filaModelos: string[] = requestedModel.toLowerCase().includes("-tts")
        ? [requestedModel, ...MODELOS_RAPIDOS_HOMOLOGADOS]
        : [...MODELOS_RAPIDOS_HOMOLOGADOS];

      const actionLimpa = String(action || "generateContent").trim() || "generateContent";
      let ultimoResultado: ResultadoChamadaGoogle | null = null;

      for (const modeloAtual of filaModelos) {
        const res = await chamarGoogleGemini(
          modeloAtual,
          actionLimpa,
          resolvedApiKey,
          googlePayload
        );

        if (res.ok) {
          return jsonResponse(res.data, 200);
        }

        ultimoResultado = res;
        const detalheAtual = extrairDetalheErroGoogle(res.data, res.status);
        const eh404Modelo = res.status === 404;

        // Fallback imediato para 'gemini-2.5-flash' apenas se HTTP 404
        if (eh404Modelo) {
          continue;
        }

        if (res.timeout) {
          return jsonResponse(
            {
              ok: false,
              timeout: true,
              etapaTravada: etapaAtual,
              error: `Timeout interno na etapa: ${etapaAtual}`,
              statusGoogle: 504,
            },
            200
          );
        }

        const traduzido = traduzirErroGooglePtBr(res.status, detalheAtual);
        return jsonResponse(
          {
            ok: false,
            error: traduzido.error,
            detalhe: detalheAtual,
            statusGoogle: res.status,
          },
          traduzido.statusHttp
        );
      }

      const statusFinal = ultimoResultado?.status || 502;
      const detalheFinal = ultimoResultado
        ? extrairDetalheErroGoogle(ultimoResultado.data, statusFinal)
        : "modelo_indisponivel";
      const traduzidoFinal = traduzirErroGooglePtBr(statusFinal, detalheFinal);

      return jsonResponse(
        {
          ok: false,
          error: traduzidoFinal.error,
          detalhe: detalheFinal,
          statusGoogle: statusFinal,
        },
        traduzidoFinal.statusHttp
      );
    } catch (err: unknown) {
      const detalhe = err instanceof Error ? err.message : String(err);
      console.error("[gemini-proxy] Erro ao processar requisição:", err);
      return jsonResponse(
        {
          ok: false,
          etapaTravada: etapaAtual,
          error: `Falha interna no proxy de IA (${etapaAtual}): ${detalhe.slice(0, 160)}`,
          detalhe,
        },
        500
      );
    }
  };

  let timerGlobalId: number | undefined;
  const timeoutGlobalPromise = new Promise<Response>((resolve) => {
    timerGlobalId = setTimeout(() => {
      resolve(
        jsonResponse(
          {
            ok: false,
            timeout: true,
            etapaTravada: etapaAtual,
            error: `Timeout interno na etapa: ${etapaAtual}`,
          },
          200
        )
      );
    }, TIMEOUT_HANDLER_GLOBAL_MS);
  });

  try {
    return await Promise.race([executarHandler(), timeoutGlobalPromise]);
  } finally {
    if (timerGlobalId !== undefined) {
      clearTimeout(timerGlobalId);
    }
  }
});
