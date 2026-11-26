// Supabase Edge Function: espelhar-imagem-storage
// Baixa imagens externas no servidor (contornando CORS/hotlink) e espelha no bucket público `produtos` do projeto.
// Deploy: npx supabase functions deploy espelhar-imagem-storage

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ehUrlSupabaseStorageProjeto,
  espelharImagemExternaNoStorage,
  normalizarUrlImagemExterna,
} from "../_shared/imagemStorageHelper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: "Autenticação obrigatória para processar imagens." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const corpo = await req.json().catch(() => ({}));
    const url = typeof corpo?.url === "string" ? corpo.url.trim() : "";
    const lojaId = typeof corpo?.loja_id === "string" ? corpo.loja_id.trim() : "";

    if (!url || !lojaId) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: "Informe a URL da imagem e o identificador da loja." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: erroUser,
    } = await supabaseUserClient.auth.getUser();

    if (erroUser || !user) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: "Sessão inválida ou expirada. Faça login novamente." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Blindagem multi-tenant: valida se o usuário pertence à loja informada
    const { data: usuarioLoja, error: erroVinculo } = await supabaseAdmin
      .from("usuarios_loja")
      .select("id")
      .eq("loja_id", lojaId)
      .eq("usuario_auth_id", user.id)
      .maybeSingle();

    if (erroVinculo || !usuarioLoja) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: "Você não tem permissão para armazenar imagens nesta loja." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (ehUrlSupabaseStorageProjeto(url, supabaseUrl)) {
      return new Response(
        JSON.stringify({ sucesso: true, url_publica: url, ja_espelhada: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resultado = await espelharImagemExternaNoStorage(supabaseAdmin, {
      url,
      lojaId,
      supabaseUrl,
    });

    if (!resultado.sucesso) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          url_publica: normalizarUrlImagemExterna(url),
          erro: resultado.erro || "Não foi possível espelhar a imagem externa.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        url_publica: resultado.urlPublica,
        ja_espelhada: !resultado.espelhadaAgora,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.warn("[espelhar-imagem-storage] Erro interno ao processar requisição:", err instanceof Error ? err.message : "Erro desconhecido");
    return new Response(
      JSON.stringify({
        sucesso: false,
        erro: "Não foi possível processar o espelhamento da imagem no momento.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
