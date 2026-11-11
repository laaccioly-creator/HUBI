// Supabase Edge Function: buscar-fotos-serpapi
// Utiliza a API oficial do Serper.dev (https://google.serper.dev/images) com suporte a BYOK e 2.500 buscas gratuitas
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
    let num = 10;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      q = body.q || body.termo || "";
      apiKey = body.serpApiKey || body.api_key || body.apiKey || "";
      lojaId = body.loja_id || body.lojaId || "";
      num = Math.min(body.num || 10, 10);
    } else {
      const url = new URL(req.url);
      q = url.searchParams.get("q") || url.searchParams.get("termo") || "";
      apiKey = url.searchParams.get("serpApiKey") || url.searchParams.get("api_key") || url.searchParams.get("apiKey") || "";
      lojaId = url.searchParams.get("loja_id") || url.searchParams.get("lojaId") || "";
      num = Math.min(parseInt(url.searchParams.get("num") || "10", 10), 10);
    }

    // 1. Resolução da Chave de API:
    // Recebe a chave enviada no payload (BYOK do lojista armazenada em lojas.serpapi_key)
    // ou utiliza o segredo global configurado (SERPER_API_KEY, SERPAPI_KEY ou configuracoes_plataforma)
    if (!apiKey) {
      apiKey = Deno.env.get("SERPER_API_KEY") || Deno.env.get("SERPAPI_KEY") || "";

      if (!apiKey && lojaId) {
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { data: loja } = await supabaseAdmin
          .from("lojas")
          .select("serpapi_key, configuracoes_extras")
          .eq("id", lojaId)
          .maybeSingle();

        apiKey =
          loja?.serpapi_key ||
          loja?.configuracoes_extras?.ia?.serpapi_key ||
          loja?.configuracoes_extras?.ia?.serper_api_key ||
          "";
      }

      // Fallback: Chave Global da Plataforma HUBI (Super Admin)
      if (!apiKey) {
        try {
          const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
          );
          const { data: configPlataforma } = await supabaseAdmin
            .from("configuracoes_plataforma")
            .select("serpapi_key")
            .eq("id", 1)
            .maybeSingle();

          apiKey = configPlataforma?.serpapi_key || "";
        } catch {}
      }
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "Chave do Serper.dev não configurada para esta loja.",
          error_type: "auth",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!q.trim()) {
      return new Response(
        JSON.stringify({ results: [], images: [] }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Chamada à API oficial do Serper.dev:
    // Endpoint: POST https://google.serper.dev/images
    const serperResponse = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: q.trim(),
        gl: "br",
        hl: "pt-br",
        num,
      }),
    });

    const serperData = await serperResponse.json().catch(() => ({}));

    // 4. Tratamento de Erros e Quota:
    // Em caso de chave inválida ou erro 403/401 do Serper
    if (
      serperResponse.status === 401 ||
      serperResponse.status === 403 ||
      serperData.message?.toLowerCase?.().includes("unauthorized") ||
      serperData.message?.toLowerCase?.().includes("invalid api key") ||
      serperData.message?.toLowerCase?.().includes("not registered")
    ) {
      return new Response(
        JSON.stringify({
          error: "Chave do Serper.dev inválida ou expirada.",
          error_type: "auth",
          details: serperData.message || null,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Em caso de quota esgotada (429 ou créditos esgotados)
    if (
      serperResponse.status === 429 ||
      serperData.message?.toLowerCase?.().includes("credit") ||
      serperData.message?.toLowerCase?.().includes("quota") ||
      serperData.message?.toLowerCase?.().includes("rate limit")
    ) {
      return new Response(
        JSON.stringify({
          error: "Limite de cota de pesquisas gratuitas do Serper atingido.",
          error_type: "quota",
          details: serperData.message || null,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!serperResponse.ok) {
      return new Response(
        JSON.stringify({
          error: serperData.message || "Erro ao consultar a API do Serper.dev",
          error_type: "general",
        }),
        {
          status: serperResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Mapeamento da Resposta:
    // A API do Serper devolve { images: [ { imageUrl, title, source, width, height }, ... ] }
    const imagesList = Array.isArray(serperData.images)
      ? serperData.images
      : Array.isArray(serperData.images_results)
      ? serperData.images_results
      : [];

    const results = imagesList
      .filter((item: any) => {
        const url = item.imageUrl || item.original || item.link;
        if (!url || typeof url !== "string" || !url.startsWith("http")) return false;
        const w = typeof item.width === "number" ? item.width : typeof item.imageWidth === "number" ? item.imageWidth : item.original_width;
        const h = typeof item.height === "number" ? item.height : typeof item.imageHeight === "number" ? item.imageHeight : item.original_height;
        if (w && w < 250 && h && h < 250) return false;
        return true;
      })
      .slice(0, num)
      .map((item: any, index: number) => {
        const imageUrl = item.imageUrl || item.original || item.link || item.thumbnail || "";
        const largura = typeof item.width === "number" ? item.width : typeof item.imageWidth === "number" ? item.imageWidth : item.original_width;
        const altura = typeof item.height === "number" ? item.height : typeof item.imageHeight === "number" ? item.imageHeight : item.original_height;
        const titulo = item.title || q;
        const fonte = item.source || item.domain || "Google Imagens";

        return {
          url: imageUrl,
          titulo,
          largura,
          altura,
          // Compatibilidade completa com o contrato do frontend:
          urlOriginal: imageUrl,
          urlThumbnail: item.thumbnailUrl || item.thumbnail || imageUrl,
          thumbnail: item.thumbnailUrl || item.thumbnail || imageUrl,
          original: imageUrl,
          fonte,
          source: fonte,
          posicao: item.position || index + 1,
        };
      });

    return new Response(
      JSON.stringify({
        results,
        images: results,
      }),
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
