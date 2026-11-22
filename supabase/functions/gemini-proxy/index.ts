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
  "gemini-2.5-flash",
  "gemini-3.8-flash",
  "gemini-2.5-flash-lite",
] as const;

const TIMEOUT_CHAMADA_GOOGLE_MS = 9000;
const TIMEOUT_LIST_MODELS_MS = 4000;
const REGEX_MODELO_FLASH_PADRAO = /^models\/gemini-(\d+(?:\.\d+)?)-flash$/i;

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
  const suportaThinking = /^gemini-(?:2\.5|3)/i.test(modelo);
  const ehTts = modelo.toLowerCase().includes("-tts");

  const genCfgAtual =
    clone.generationConfig && typeof clone.generationConfig === "object"
      ? ({ ...(clone.generationConfig as Record<string, unknown>) })
      : {};

  if (!ehTts) {
    if (genCfgAtual.temperature === undefined) {
      genCfgAtual.temperature = 0.2;
    }
    if (genCfgAtual.maxOutputTokens === undefined) {
      genCfgAtual.maxOutputTokens = 600;
    }
    if (suportaThinking) {
      if (!("thinkingConfig" in genCfgAtual)) {
        genCfgAtual.thinkingConfig = { thinkingBudget: 0 };
      }
    } else if ("thinkingConfig" in genCfgAtual) {
      delete genCfgAtual.thinkingConfig;
    }
    clone.generationConfig = genCfgAtual;
  } else if ("thinkingConfig" in genCfgAtual) {
    const { thinkingConfig: _tc, ...restoGenCfg } = genCfgAtual;
    clone.generationConfig = restoGenCfg;
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
      if (genCfg.thinkingConfig || genCfg.responseSchema) {
        const { thinkingConfig: _tc, responseSchema: _rs, ...cleanGenCfg } = genCfg;
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

async function resolverModeloFlashViaListModels(apiKey: string): Promise<string | null> {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetchComTimeout(
      listUrl,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      TIMEOUT_LIST_MODELS_MS
    );

    if (!res.ok) return null;

    const json = (await res.json().catch(() => ({}))) as {
      models?: Array<{
        name?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    const lista = Array.isArray(json.models) ? json.models : [];

    const candidatos = lista
      .filter((m) => {
        const metodos = Array.isArray(m.supportedGenerationMethods)
          ? m.supportedGenerationMethods
          : [];
        return metodos.includes("generateContent");
      })
      .map((m) => {
        const nomeOriginal = String(m.name || "").trim();
        const match = REGEX_MODELO_FLASH_PADRAO.exec(nomeOriginal);
        if (!match) return null;
        const versao = parseFloat(match[1]);
        if (Number.isNaN(versao) || versao < 2.5) return null;
        return {
          nomeLimpo: nomeOriginal.replace(/^models\//i, ""),
          versao,
        };
      })
      .filter((item): item is { nomeLimpo: string; versao: number } => item !== null)
      .sort((a, b) => b.versao - a.versao);

    return candidatos[0]?.nomeLimpo || null;
  } catch {
    return null;
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

    // 1. Validação de loja ativa (sem exigir JWT auth.users) e resolução da chave BYOK (própria ou herdada da organização)
    if (lojaIdResolvido) {
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
            resolvedApiKey = extrairChaveGeminiDaLoja(loja);

            // Herança multi-loja: se filial não possui chave própria, herda da matriz/irmã na mesma organização
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

    // 4. Montagem da lista ordenada de modelos rápidos homologados (sem bloquear no ListModels)
    const requestedModel = String(model || "").replace(/^models\//i, "").trim();
    const filaModelos: string[] = requestedModel.toLowerCase().includes("-tts")
      ? [requestedModel, ...MODELOS_RAPIDOS_HOMOLOGADOS]
      : (MODELOS_RAPIDOS_HOMOLOGADOS as readonly string[]).includes(requestedModel)
        ? [requestedModel, ...MODELOS_RAPIDOS_HOMOLOGADOS.filter((m) => m !== requestedModel)]
        : [...MODELOS_RAPIDOS_HOMOLOGADOS];

    const actionLimpa = String(action || "generateContent").trim() || "generateContent";

    let ultimoResultado: ResultadoChamadaGoogle | null = null;
    let todosForam404 = true;

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
      const ehIndisponibilidadeModelo =
        res.status === 404 ||
        /no longer available|not found|is not supported/i.test(detalheAtual);

      // Erros definitivos de chave/cota/payload não devem esperar outros modelos
      if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 429) {
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

      if (!ehIndisponibilidadeModelo) {
        todosForam404 = false;
        break;
      }
    }

    // 5. Contingência extrema: consulta ListModels (timeout 4s) apenas se todos retornaram 404
    if (todosForam404) {
      const modeloDescoberto = await resolverModeloFlashViaListModels(resolvedApiKey);
      if (modeloDescoberto && !filaModelos.includes(modeloDescoberto)) {
        const resDescoberto = await chamarGoogleGemini(
          modeloDescoberto,
          actionLimpa,
          resolvedApiKey,
          googlePayload
        );
        if (resDescoberto.ok) {
          return jsonResponse(resDescoberto.data, 200);
        }
        ultimoResultado = resDescoberto;
      }
    }

    const statusFinal = ultimoResultado?.status || 502;
    const detalheFinal = ultimoResultado
      ? extrairDetalheErroGoogle(ultimoResultado.data, statusFinal)
      : "timeout_ou_rede";
    const traduzidoFinal = traduzirErroGooglePtBr(statusFinal, detalheFinal);

    return jsonResponse(
      {
        ok: false,
        error: traduzidoFinal.error,
        detalhe: ultimoResultado?.timeout ? "timeout_9s" : detalheFinal,
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
        error: `Falha interna no proxy de IA: ${detalhe.slice(0, 160)}`,
        detalhe,
      },
      500
    );
  }
});
