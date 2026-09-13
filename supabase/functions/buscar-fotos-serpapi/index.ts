// Supabase Edge Function: buscar-fotos-serpapi
// Deploy: supabase functions deploy buscar-fotos-serpapi --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let q = "";
    let apiKey = "";
    let lojaId = "";
    let num = 20;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      q = body.q || "";
      apiKey = body.api_key || "";
      lojaId = body.loja_id || "";
      num = body.num || 20;
    } else {
      const url = new URL(req.url);
      q = url.searchParams.get("q") || "";
      apiKey = url.searchParams.get("api_key") || "";
      lojaId = url.searchParams.get("loja_id") || "";
      num = parseInt(url.searchParams.get("num") || "20", 10);
    }

    // Se a chave não foi passada diretamente no payload, tenta recuperá-la pelo lojaId no banco
    if (!apiKey && lojaId) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { data: loja } = await supabaseAdmin
        .from("lojas")
        .select("serpapi_key, configuracoes_extras")
        .eq("id", lojaId)
        .single();

      apiKey =
        loja?.serpapi_key ||
        loja?.configuracoes_extras?.ia?.serpapi_key ||
        "";
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "Chave da SerpApi não configurada para esta loja.",
          error_type: "auth",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!q) {
      return new Response(
        JSON.stringify({ results: [] }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const searchParams = new URLSearchParams({
      engine: "google_images",
      q,
      hl: "pt",
      gl: "br",
      api_key: apiKey,
    });

    const serpRes = await fetch(`https://serpapi.com/search.json?${searchParams.toString()}`);
    const serpData = await serpRes.json().catch(() => ({}));

    if (
      serpRes.status === 429 ||
      serpData.error?.toLowerCase?.().includes("searches limit") ||
      serpData.error?.toLowerCase?.().includes("run out of searches") ||
      serpData.error?.toLowerCase?.().includes("quota")
    ) {
      return new Response(
        JSON.stringify({
          error: "Limite de cota de 250 pesquisas da SerpApi atingido.",
          error_type: "quota",
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (
      serpRes.status === 401 ||
      serpRes.status === 403 ||
      serpData.error?.toLowerCase?.().includes("invalid api key") ||
      serpData.error?.toLowerCase?.().includes("unauthorized")
    ) {
      return new Response(
        JSON.stringify({
          error: "Chave SerpApi inválida ou expirada.",
          error_type: "auth",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!serpRes.ok) {
      return new Response(
        JSON.stringify({
          error: serpData.error || "Erro ao consultar SerpApi",
          error_type: "general",
        }),
        {
          status: serpRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const imagesResults = Array.isArray(serpData.images_results)
      ? serpData.images_results
      : [];

    const results = imagesResults.slice(0, num).map((item: any, index: number) => ({
      urlOriginal: item.original || item.link || item.thumbnail || "",
      urlThumbnail: item.thumbnail || item.original || item.link || "",
      titulo: item.title || q,
      fonte: item.source || item.domain || "Google Imagens",
      posicao: item.position || index + 1,
    }));

    return new Response(
      JSON.stringify({ results }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message, error_type: "general" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
