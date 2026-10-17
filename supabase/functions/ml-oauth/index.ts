// Supabase Edge Function: ml-oauth
// Gerencia a autorização OAuth 2.0 com o Mercado Livre (Geração de URL de consentimento e troca de code por tokens).
// Deploy: npx supabase functions deploy ml-oauth

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gerarStateHmac, validarStateHmac, MlTokenResponse } from "../_shared/mlClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const mlAppId = Deno.env.get("ML_APP_ID") || "";
  const mlClientSecret = Deno.env.get("ML_CLIENT_SECRET") || "";
  const mlRedirectUri = Deno.env.get("ML_REDIRECT_URI") || "";
  const stateSecret = Deno.env.get("ML_STATE_HMAC_SECRET") || mlClientSecret || "hubi-ml-secret-salt";
  const hubiFrontendUrl = Deno.env.get("HUBI_FRONTEND_URL") || "http://localhost:5173";

  const url = new URL(req.url);

  try {
    // ------------------------------------------------------------------------
    // 1. GET: ROTA DE CALLBACK OAUTH (REDIRECIONAMENTO DIRETO DO MERCADO LIVRE)
    // ------------------------------------------------------------------------
    if (req.method === "GET") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      // CASO A: RETORNO DE CALLBACK DO MERCADO LIVRE (CODE + STATE)
      if (code && state) {
        // 1. Validação do state assinado (anti-CSRF e extração do loja_id)
        const { valido, lojaId } = await validarStateHmac(state, stateSecret);
        if (!valido || !lojaId) {
          console.error("[ml-oauth] State inválido ou expirado no callback GET");
          const redirectErro = `${hubiFrontendUrl}/config?ml_status=error&ml_msg=${encodeURIComponent("Parâmetro de sessão expirado ou inválido. Tente novamente.")}`;
          return Response.redirect(redirectErro, 302);
        }

        // 2. Troca do authorization_code pelo par de access_token e refresh_token
        const params = new URLSearchParams();
        params.append("grant_type", "authorization_code");
        params.append("client_id", mlAppId);
        params.append("client_secret", mlClientSecret);
        params.append("code", code);
        params.append("redirect_uri", mlRedirectUri);

        const respostaTroca = await fetch("https://api.mercadolibre.com/oauth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
          },
          body: params.toString(),
        });

        if (!respostaTroca.ok) {
          const erroJson = await respostaTroca.json().catch(() => ({}));
          console.error("[ml-oauth] Falha na troca do code por token no callback GET:", erroJson);
          const redirectErro = `${hubiFrontendUrl}/config?ml_status=error&ml_msg=${encodeURIComponent("Falha ao autorizar no Mercado Livre. Verifique as credenciais do aplicativo.")}`;
          return Response.redirect(redirectErro, 302);
        }

        const tokenData: MlTokenResponse = await respostaTroca.json();

        // 3. Consulta dados do usuário vendedor (nickname, site_id)
        const respostaUsuario = await fetch("https://api.mercadolibre.com/users/me", {
          headers: {
            "Authorization": `Bearer ${tokenData.access_token}`,
            "Accept": "application/json",
          },
        });

        let mlNickname = `vendedor_${tokenData.user_id}`;
        let mlSiteId = "MLB";

        if (respostaUsuario.ok) {
          const usuarioDados = await respostaUsuario.json();
          mlNickname = usuarioDados.nickname || mlNickname;
          mlSiteId = usuarioDados.site_id || mlSiteId;
        }

        // 4. Persistência segura via Service Role (sem RLS de usuário, pois é callback de sistema)
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
        const tokenExpiraEm = new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString();

        const { error: erroUpsert } = await supabaseAdmin
          .from("marketplace_contas")
          .upsert(
            {
              loja_id: lojaId,
              provedor: "mercadolivre",
              ml_user_id: tokenData.user_id,
              ml_nickname: mlNickname,
              ml_site_id: mlSiteId,
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
              token_expira_em: tokenExpiraEm,
              escopos: tokenData.scope || null,
              status_conexao: "conectado",
              sincronizar_estoque_automatico: true,
              importar_pedidos_automatico: true,
              ultima_sincronizacao_em: new Date().toISOString(),
              ultimo_erro_mensagem: null,
            },
            { onConflict: "loja_id,provedor" }
          );

        if (erroUpsert) {
          console.error("[ml-oauth] Erro ao gravar conta no banco via callback GET:", erroUpsert.message);
          const redirectErro = `${hubiFrontendUrl}/config?ml_status=error&ml_msg=${encodeURIComponent("Erro ao salvar conta no banco de dados.")}`;
          return Response.redirect(redirectErro, 302);
        }

        // 5. Redirecionamento 302 de sucesso para a tela de configurações do HUBI
        const redirectSucesso = `${hubiFrontendUrl}/config?ml_status=success&nickname=${encodeURIComponent(mlNickname)}`;
        return Response.redirect(redirectSucesso, 302);
      }

      // CASO B: GERA A URL DE AUTORIZAÇÃO OAUTH 2.0 (REQUER AUTHENTICATION HEADER)
      const lojaId = url.searchParams.get("loja_id");
      const action = url.searchParams.get("action");

      if (action !== "authorize_url" || !lojaId) {
        return new Response(
          JSON.stringify({ error: "Parâmetros inválidos. 'action=authorize_url' e 'loja_id' são obrigatórios." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validação do Token JWT do usuário autenticado chamador
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Cabeçalho de autorização ausente." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseUserClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: erroUser } = await supabaseUserClient.auth.getUser();
      if (erroUser || !user) {
        return new Response(
          JSON.stringify({ error: "Usuário não autenticado no HUBI." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validação multi-tenant: o usuário autenticado pertence a esta loja?
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data: usuarioLoja, error: erroVinculo } = await supabaseAdmin
        .from("usuarios_loja")
        .select("id, perfil")
        .eq("loja_id", lojaId)
        .eq("usuario_auth_id", user.id)
        .maybeSingle();

      if (erroVinculo || !usuarioLoja) {
        return new Response(
          JSON.stringify({ error: "Você não tem permissão para gerenciar integrações desta loja." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!mlAppId || !mlRedirectUri) {
        return new Response(
          JSON.stringify({ error: "Integração do Mercado Livre não configurada (faltam ML_APP_ID ou ML_REDIRECT_URI)." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Gera o state assinado via HMAC contendo loja_id e timestamp
      const state = await gerarStateHmac(lojaId, stateSecret);

      const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${mlAppId}&redirect_uri=${encodeURIComponent(mlRedirectUri)}&state=${encodeURIComponent(state)}`;

      return new Response(
        JSON.stringify({ url: authUrl, state }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ------------------------------------------------------------------------
    // 2. POST: CALLBACK DE TROCA DE CODE POR ACCESS_TOKEN / REFRESH_TOKEN
    // ------------------------------------------------------------------------
    if (req.method === "POST") {
      const corpo = await req.json().catch(() => ({}));
      const { code, state, action } = corpo;

      // Suporte para ação de desconectar
      if (action === "disconnect") {
        const { loja_id } = corpo;
        if (!loja_id) {
          return new Response(
            JSON.stringify({ error: "Parâmetro loja_id é obrigatório para desconectar." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
        await supabaseAdmin
          .from("marketplace_contas")
          .update({
            status_conexao: "desconectado",
            ultimo_erro_mensagem: "Conta desconectada manualmente pelo usuário.",
          })
          .eq("loja_id", loja_id)
          .eq("provedor", "mercadolivre");

        return new Response(
          JSON.stringify({ sucesso: true, mensagem: "Conta do Mercado Livre desconectada com sucesso." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!code || !state) {
        return new Response(
          JSON.stringify({ error: "Parâmetros 'code' e 'state' são obrigatórios no callback OAuth." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Valida o state anti-CSRF
      const { valido, lojaId } = await validarStateHmac(state, stateSecret);
      if (!valido || !lojaId) {
        return new Response(
          JSON.stringify({ error: "Parâmetro 'state' inválido ou expirado. Inicie a conexão novamente." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Faz a troca de authorization_code pelo par de tokens
      const params = new URLSearchParams();
      params.append("grant_type", "authorization_code");
      params.append("client_id", mlAppId);
      params.append("client_secret", mlClientSecret);
      params.append("code", code);
      params.append("redirect_uri", mlRedirectUri);

      const respostaTroca = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: params.toString(),
      });

      if (!respostaTroca.ok) {
        const erroJson = await respostaTroca.json().catch(() => ({}));
        console.error("[ml-oauth] Erro na troca de code:", erroJson);
        return new Response(
          JSON.stringify({ error: "Não foi possível autorizar o Mercado Livre com o código fornecido. Tente novamente." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenData: MlTokenResponse = await respostaTroca.json();

      // Consulta os dados do usuário no Mercado Livre (nickname, site_id)
      const respostaUsuario = await fetch("https://api.mercadolibre.com/users/me", {
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "Accept": "application/json",
        },
      });

      let mlNickname = `vendedor_${tokenData.user_id}`;
      let mlSiteId = "MLB";

      if (respostaUsuario.ok) {
        const usuarioDados = await respostaUsuario.json();
        mlNickname = usuarioDados.nickname || mlNickname;
        mlSiteId = usuarioDados.site_id || mlSiteId;
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
      const tokenExpiraEm = new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString();

      // Grava ou atualiza a conta conectada no Supabase (UPSERT por loja_id + provedor)
      const { data: contaSalva, error: erroUpsert } = await supabaseAdmin
        .from("marketplace_contas")
        .upsert(
          {
            loja_id: lojaId,
            provedor: "mercadolivre",
            ml_user_id: tokenData.user_id,
            ml_nickname: mlNickname,
            ml_site_id: mlSiteId,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expira_em: tokenExpiraEm,
            escopos: tokenData.scope || null,
            status_conexao: "conectado",
            sincronizar_estoque_automatico: true,
            importar_pedidos_automatico: true,
            ultima_sincronizacao_em: new Date().toISOString(),
            ultimo_erro_mensagem: null,
          },
          { onConflict: "loja_id,provedor" }
        )
        .select("id, loja_id, ml_user_id, ml_nickname, ml_site_id, token_expira_em, status_conexao, sincronizar_estoque_automatico, taxa_comissao_padrao_percentual")
        .single();

      if (erroUpsert) {
        console.error("[ml-oauth] Erro ao gravar conta no banco:", erroUpsert.message);
        return new Response(
          JSON.stringify({ error: "Falha ao salvar conexão do Mercado Livre no banco de dados." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          sucesso: true,
          mensagem: `Conta ${mlNickname} conectada com sucesso ao HUBI!`,
          conta: contaSalva,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Método HTTP não suportado." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[ml-oauth] Exceção inesperada:", error?.message);
    return new Response(
      JSON.stringify({ error: "Ocorreu um erro interno ao processar a autenticação com o Mercado Livre." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
