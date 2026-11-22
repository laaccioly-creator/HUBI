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

const MAPA_SEGMENTOS_LOJA: Record<string, string> = {
  sexshop: "Sex Shop",
  moda: "Moda",
  lingerie: "Lingerie",
  cosmeticos: "Cosméticos",
  motepecas: "Motopeças",
  restaurante: "Restaurante",
  mercado: "Mercado",
  petshop: "Pet Shop",
  papelaria: "Papelaria",
  otica: "Ótica",
  informatica: "Informática",
  eletronicos: "Eletrônicos",
  construcao: "Material de Construção",
  artesanato: "Artesanato",
};

function normalizarSemAcentos(texto: string): string {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function extrairRamoCurto(ramoBruto: string): string {
  const primeiro = String(ramoBruto || "").split("/")[0].trim();
  if (!primeiro) return "";
  const norm = normalizarSemAcentos(primeiro);
  if (norm === "geral" || norm === "varejo comercial geral" || norm === "varejo geral") {
    return "";
  }
  return MAPA_SEGMENTOS_LOJA[norm] || primeiro;
}

function extrairChaveSerperDaLoja(
  registro: { serper_api_key?: unknown; configuracoes_extras?: unknown } | null | undefined
): string {
  if (!registro) return "";
  if (typeof registro.serper_api_key === "string" && registro.serper_api_key.trim()) {
    return registro.serper_api_key.trim();
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
    const iaObj = (extras as { ia?: { serper_api_key?: unknown; serpapi_key?: unknown } }).ia;
    const candidata = iaObj?.serper_api_key || iaObj?.serpapi_key;
    if (typeof candidata === "string" && candidata.trim()) {
      return candidata.trim();
    }
  }
  return "";
}

function ehNichoAdulto(texto: string): boolean {
  const norm = normalizarSemAcentos(texto);
  if (!norm) return false;
  return /\b(sex\s*shop|sexshop|erotic[oa]s?|intim[oa]s?|adult[oa]s?|sensua(?:l|is)|bem[\s-]*estar\s+intimo|vibrador(?:es)?|dildo|masturbador|plug\s+anal)\b/i.test(
    norm
  );
}

function ehResultadoIrrelevanteImagem(url: string, titulo: string, fonte: string): boolean {
  const urlLower = url.toLowerCase();
  const tituloLower = titulo.toLowerCase();
  const fonteLower = fonte.toLowerCase();

  const dominiosBloqueados = [
    "scribd.com",
    "slideshare.net",
    "issuu.com",
    "calameo.com",
    "academia.edu",
    "researchgate.net",
    "docplayer",
    "dreamstime.com",
    "depositphotos.com",
    "123rf.com",
    "alamy.com",
    "shutterstock.com",
    "istockphoto.com",
  ];

  if (dominiosBloqueados.some((d) => urlLower.includes(d) || fonteLower.includes(d))) {
    return true;
  }

  if (
    urlLower.endsWith(".pdf") ||
    urlLower.includes(".pdf?") ||
    urlLower.endsWith(".svg") ||
    urlLower.includes(".svg?") ||
    urlLower.includes("favicon") ||
    urlLower.includes("placeholder") ||
    urlLower.includes("watermark")
  ) {
    return true;
  }

  if (/[/._-](logo|icon|brand)[/._-]/i.test(urlLower) || tituloLower.startsWith("logo ")) {
    return true;
  }

  return false;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let q = "";
    let apiKey = "";
    let lojaId = "";
    let num = 10;
    let engine = "google_images";
    let ramoAtividade = "";
    let safeParam = "";

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      q = body.q || body.termo || "";
      apiKey = body.serpApiKey || body.api_key || body.apiKey || "";
      lojaId = body.loja_id || body.lojaId || "";
      num = Math.min(body.num || 10, 20);
      engine = body.engine || "google_images";
      ramoAtividade = String(body.ramo_atividade || body.ramoAtividade || body.segmento || "").trim();
      safeParam = String(body.safe || "").trim().toLowerCase();
    } else {
      const url = new URL(req.url);
      q = url.searchParams.get("q") || url.searchParams.get("termo") || "";
      apiKey = url.searchParams.get("serpApiKey") || url.searchParams.get("api_key") || url.searchParams.get("apiKey") || "";
      lojaId = url.searchParams.get("loja_id") || url.searchParams.get("lojaId") || "";
      num = Math.min(parseInt(url.searchParams.get("num") || "10", 10), 20);
      engine = url.searchParams.get("engine") || "google_images";
      ramoAtividade = String(
        url.searchParams.get("ramo_atividade") ||
          url.searchParams.get("ramoAtividade") ||
          url.searchParams.get("segmento") ||
          ""
      ).trim();
      safeParam = String(url.searchParams.get("safe") || "").trim().toLowerCase();
    }

    // 1. Resolução da Chave de API (própria -> herdada da organização -> plataforma/env) e contexto do segmento:
    let sobreLoja = "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin =
      supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

    if (lojaId && supabaseAdmin && (!apiKey || !ramoAtividade || safeParam !== "off")) {
      const { data: loja } = await supabaseAdmin
        .from("lojas")
        .select("id, organizacao_id, serper_api_key, configuracoes_extras, sobre_loja")
        .eq("id", lojaId)
        .maybeSingle();

      if (!apiKey && loja) {
        apiKey = extrairChaveSerperDaLoja(loja);

        // Herança multi-loja: se filial não possui chave própria, busca irmã/matriz da mesma organização
        if (!apiKey && loja.organizacao_id) {
          const { data: lojasIrmas } = await supabaseAdmin
            .from("lojas")
            .select("ativo, serper_api_key, configuracoes_extras")
            .eq("organizacao_id", loja.organizacao_id)
            .neq("id", loja.id)
            .limit(20);

          if (Array.isArray(lojasIrmas)) {
            const irmasOrdenadas = [
              ...lojasIrmas.filter((item) => item.ativo !== false),
              ...lojasIrmas.filter((item) => item.ativo === false),
            ];
            for (const irma of irmasOrdenadas) {
              const chaveIrma = extrairChaveSerperDaLoja(irma);
              if (chaveIrma) {
                apiKey = chaveIrma;
                break;
              }
            }
          }
        }
      }

      sobreLoja = typeof loja?.sobre_loja === "string" ? loja.sobre_loja.trim() : "";
      const extrasLoja =
        typeof loja?.configuracoes_extras === "string"
          ? (() => {
              try {
                return JSON.parse(loja.configuracoes_extras);
              } catch {
                return {};
              }
            })()
          : loja?.configuracoes_extras;
      const segDb = String(extrasLoja?.perfil_negocio?.segmento || "").trim();
      if (!ramoAtividade && segDb) {
        ramoAtividade = MAPA_SEGMENTOS_LOJA[normalizarSemAcentos(segDb)] || segDb;
      }
    }

    // Fallback global opcional em configuracoes_plataforma e depois variável de ambiente SERPER_API_KEY
    if (!apiKey && supabaseAdmin) {
      try {
        const { data: cfgs } = await supabaseAdmin
          .from("configuracoes_plataforma")
          .select("*")
          .limit(10);
        if (Array.isArray(cfgs)) {
          for (const row of cfgs as Array<Record<string, unknown>>) {
            if (typeof row.serper_api_key === "string" && row.serper_api_key.trim()) {
              apiKey = row.serper_api_key.trim();
              break;
            }
            if (row.chave === "serper_api_key" && typeof row.valor === "string" && row.valor.trim()) {
              apiKey = row.valor.trim();
              break;
            }
          }
        }
      } catch {
        // Tabela ou coluna opcional ausente; segue para fallback de Secret
      }
    }

    if (!apiKey) {
      apiKey = String(Deno.env.get("SERPER_API_KEY") || "").trim();
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "Chave do Serper.dev não configurada para esta loja. Cadastre sua chave gratuita (2.500 consultas grátis em https://serper.dev/api-key) nas Configurações da Loja.",
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

    const ramoCurto = extrairRamoCurto(ramoAtividade);
    let queryFinal = q.trim();
    if (
      engine === "google_images" &&
      ramoCurto &&
      !normalizarSemAcentos(queryFinal).includes(normalizarSemAcentos(ramoCurto))
    ) {
      queryFinal = `${queryFinal} ${ramoCurto}`.trim();
    }

    const safeOff =
      safeParam === "off" ||
      ehNichoAdulto(ramoAtividade) ||
      ehNichoAdulto(sobreLoja) ||
      ehNichoAdulto(queryFinal);

    // 2. Chamada à API oficial do Serper.dev (suporta images, shopping e search):
    const serperEndpoint =
      engine === "google_shopping" || engine === "shopping"
        ? "https://google.serper.dev/shopping"
        : engine === "google" || engine === "search"
        ? "https://google.serper.dev/search"
        : "https://google.serper.dev/images";

    const serperPayload: Record<string, unknown> = {
      q: queryFinal,
      gl: "br",
      hl: "pt-br",
      num: engine === "google_images" ? Math.min(Math.max(num * 2, 20), 40) : num,
      ...(safeOff ? { safe: "off" } : {}),
    };

    const serperResponse = await fetch(serperEndpoint, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(serperPayload),
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
    if (engine === "google_shopping" || engine === "shopping" || engine === "google" || engine === "search") {
      const shoppingList = Array.isArray(serperData.shopping)
        ? serperData.shopping
        : Array.isArray(serperData.shopping_results)
        ? serperData.shopping_results
        : [];
      const organicList = Array.isArray(serperData.organic)
        ? serperData.organic
        : Array.isArray(serperData.organic_results)
        ? serperData.organic_results
        : [];

      return new Response(
        JSON.stringify({
          shopping: shoppingList,
          shopping_results: shoppingList,
          organic: organicList,
          results: shoppingList.length > 0 ? shoppingList : organicList,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // A API do Serper devolve { images: [ { imageUrl, title, source, width, height }, ... ] }
    const imagesList = Array.isArray(serperData.images)
      ? serperData.images
      : Array.isArray(serperData.images_results)
      ? serperData.images_results
      : [];

    const imagensValidas = imagesList
      .map((item: any, index: number) => {
        const imageUrl = item?.imageUrl || item?.original || item?.link || item?.thumbnail || "";
        if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("http")) {
          return null;
        }
        const largura =
          typeof item.width === "number"
            ? item.width
            : typeof item.imageWidth === "number"
            ? item.imageWidth
            : typeof item.original_width === "number"
            ? item.original_width
            : undefined;
        const altura =
          typeof item.height === "number"
            ? item.height
            : typeof item.imageHeight === "number"
            ? item.imageHeight
            : typeof item.original_height === "number"
            ? item.original_height
            : undefined;

        if (largura && largura < 250 && altura && altura < 250) {
          return null;
        }

        const titulo = String(item.title || queryFinal);
        const fonte = String(item.source || item.domain || "Google Imagens");
        if (ehResultadoIrrelevanteImagem(imageUrl, titulo, fonte)) {
          return null;
        }

        let scoreQualidade = 0;
        if (largura && altura) {
          if (largura >= 500 && altura >= 500) scoreQualidade += 3;
          else if (largura >= 350 && altura >= 350) scoreQualidade += 2;
          const proporcao = Math.max(largura / Math.max(altura, 1), altura / Math.max(largura, 1));
          if (proporcao <= 1.8) scoreQualidade += 2;
          else if (proporcao > 2.8) scoreQualidade -= 2;
        }
        const tituloNorm = normalizarSemAcentos(titulo);
        const urlNorm = imageUrl.toLowerCase();
        if (
          urlNorm.includes("fundo-branco") ||
          urlNorm.includes("produto") ||
          urlNorm.includes("catalog") ||
          urlNorm.includes("loja") ||
          tituloNorm.includes("comprar") ||
          tituloNorm.includes("r$")
        ) {
          scoreQualidade += 1;
        }

        return {
          scoreQualidade,
          posicaoOriginal: item.position || index + 1,
          dado: {
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
          },
        };
      })
      .filter((entry: any): entry is NonNullable<typeof entry> => Boolean(entry));

    imagensValidas.sort((a: any, b: any) => {
      if (b.scoreQualidade !== a.scoreQualidade) {
        return b.scoreQualidade - a.scoreQualidade;
      }
      return a.posicaoOriginal - b.posicaoOriginal;
    });

    const results = imagensValidas.slice(0, num).map((entry: any) => entry.dado);

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
