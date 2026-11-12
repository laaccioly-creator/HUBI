// Supabase Edge Function: gemini-proxy
// Deploy: npx supabase functions deploy gemini-proxy --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Método não permitido" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      contents,
      generationConfig,
      safetySettings,
      systemInstruction,
      tools,
      model = "gemini-3.8-flash",
      action = "generateContent",
      api_key,
      loja_id,
      requestBody,
    } = body;

    // 1. Resolução segura da chave Gemini:
    // Prioridade 1: Chave BYOK explicitamente fornecida
    // Prioridade 2: Chave cadastrada na loja (banco de dados)
    // Prioridade 3: Segredo da plataforma armazenado nos Secrets do Supabase (GEMINI_API_KEY)
    let resolvedApiKey = (api_key || "").trim();

    if (!resolvedApiKey && loja_id) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        if (supabaseUrl && serviceKey) {
          const supabaseAdmin = createClient(supabaseUrl, serviceKey);
          const { data: loja } = await supabaseAdmin
            .from("lojas")
            .select("gemini_api_key, configuracoes_extras")
            .eq("id", loja_id)
            .maybeSingle();

          resolvedApiKey = (
            loja?.gemini_api_key ||
            loja?.configuracoes_extras?.ia?.gemini_api_key ||
            ""
          ).trim();
        }
      } catch (err) {
        console.warn("[gemini-proxy] Falha ao consultar loja:", err);
      }
    }

    if (!resolvedApiKey) {
      resolvedApiKey = (
        Deno.env.get("GEMINI_API_KEY") ||
        Deno.env.get("GOOGLE_AI_STUDIO_API_KEY") ||
        ""
      ).trim();
    }

    if (!resolvedApiKey) {
      return new Response(
        JSON.stringify({
          error: "Chave da API do Google Gemini não configurada no servidor ou na loja.",
          error_type: "auth",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Construção do payload da Google Generative Language API
    const googlePayload: Record<string, unknown> = {};

    if (requestBody && typeof requestBody === "object") {
      Object.assign(googlePayload, requestBody);
    } else {
      if (contents) googlePayload.contents = contents;
      if (generationConfig) googlePayload.generationConfig = generationConfig;
      if (safetySettings) googlePayload.safetySettings = safetySettings;
      if (systemInstruction) googlePayload.systemInstruction = systemInstruction;
      if (tools) googlePayload.tools = tools;
    }

    let cleanModel = String(model || "gemini-3.8-flash").replace(/^models\//, "");
    if (cleanModel === "gemini-2.5-flash-lite" || cleanModel === "gemini-3.5-flash-lite") {
      cleanModel = "gemini-3.8-flash";
    }
    const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:${action}?key=${resolvedApiKey}`;

    const googleResponse = await fetch(googleUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(googlePayload),
    });

    const responseData = await googleResponse.json().catch(() => ({}));

    return new Response(JSON.stringify(responseData), {
      status: googleResponse.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err: any) {
    console.error("[gemini-proxy] Erro ao processar requisição:", err);
    return new Response(
      JSON.stringify({
        error: "Falha interna ao processar requisição Gemini",
        detail: err?.message || String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
