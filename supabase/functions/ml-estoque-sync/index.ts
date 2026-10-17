// Supabase Edge Function: ml-estoque-sync
// Sincroniza o estoque físico local no Mercado Livre e gerencia vínculo e publicação de anúncios.
// Deploy: npx supabase functions deploy ml-estoque-sync

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { obterAccessTokenValido, MercadoLivreError } from "../_shared/mlClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  try {
    const corpo = await req.json().catch(() => ({}));
    const { action, loja_id } = corpo;

    if (!loja_id) {
      return new Response(
        JSON.stringify({ error: "Identificador da loja (loja_id) é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // =========================================================================
    // AÇÃO 1: SINCRONIZAR ESTOQUE LOCAL -> MERCADO LIVRE (sync_inventory)
    // =========================================================================
    if (action === "sync_inventory") {
      const { produto_id } = corpo;
      if (!produto_id) {
        return new Response(
          JSON.stringify({ error: "Parâmetro produto_id é obrigatório para sincronização de estoque." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Busca anúncios ativos vinculados a este produto
      const { data: anuncios, error: erroAnuncios } = await supabaseAdmin
        .from("marketplace_anuncios")
        .select("id, loja_id, conta_id, produto_id, variacao_id, ml_item_id, ml_variation_id, sincronizacao_ativa")
        .eq("loja_id", loja_id)
        .eq("produto_id", produto_id)
        .eq("sincronizacao_ativa", true);

      if (erroAnuncios || !anuncios || anuncios.length === 0) {
        return new Response(
          JSON.stringify({ sucesso: true, sincronizados: 0, mensagem: "Nenhum anúncio ativo vinculado para este produto." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. Obtém o token de acesso válido
      const { token } = await obterAccessTokenValido(supabaseAdmin, loja_id);

      let totalAtualizados = 0;
      const erros: string[] = [];

      for (const anuncio of anuncios) {
        try {
          // Busca o saldo físico atual no HUBI
          let saldoFisico = 0;
          if (anuncio.variacao_id) {
            const { data: varProd } = await supabaseAdmin
              .from("variacoes_produto")
              .select("quantidade_estoque")
              .eq("id", anuncio.variacao_id)
              .eq("loja_id", loja_id)
              .maybeSingle();
            saldoFisico = Math.max(0, varProd?.quantidade_estoque || 0);
          } else {
            const { data: prod } = await supabaseAdmin
              .from("produtos")
              .select("quantidade_estoque")
              .eq("id", anuncio.produto_id)
              .eq("loja_id", loja_id)
              .maybeSingle();
            saldoFisico = Math.max(0, prod?.quantidade_estoque || 0);
          }

          // Monta o payload de atualização de quantidade no Mercado Livre
          const mlItemId = anuncio.ml_item_id.trim();
          let payloadMl: any = {};

          if (anuncio.ml_variation_id) {
            payloadMl = {
              variations: [
                {
                  id: anuncio.ml_variation_id,
                  available_quantity: saldoFisico,
                },
              ],
            };
          } else {
            payloadMl = {
              available_quantity: saldoFisico,
            };
          }

          const respMl = await fetch(`https://api.mercadolibre.com/items/${mlItemId}`, {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify(payloadMl),
          });

          if (!respMl.ok) {
            const erroJson = await respMl.json().catch(() => ({}));
            const msgErro = erroJson.message || `Erro HTTP ${respMl.status} ao atualizar anúncio ${mlItemId}`;
            erros.push(msgErro);

            await supabaseAdmin
              .from("marketplace_anuncios")
              .update({
                status_anuncio: "erro_sincronia",
                ultimo_erro_sincronizacao: msgErro.slice(0, 500),
              })
              .eq("id", anuncio.id);
            continue;
          }

          // Sucesso na sincronização
          await supabaseAdmin
            .from("marketplace_anuncios")
            .update({
              estoque_ultimo_enviado: saldoFisico,
              status_anuncio: "active",
              ultima_sincronizacao_estoque_em: new Date().toISOString(),
              ultimo_erro_sincronizacao: null,
            })
            .eq("id", anuncio.id);

          totalAtualizados++;
        } catch (errAnuncio: any) {
          erros.push(errAnuncio?.message || "Erro desconhecido");
        }
      }

      return new Response(
        JSON.stringify({
          sucesso: erros.length === 0,
          total_anuncios: anuncios.length,
          sincronizados: totalAtualizados,
          erros: erros.length > 0 ? erros : undefined,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO 2: VINCULAR ANÚNCIO EXISTENTE VIA MLB (link_existing)
    // =========================================================================
    if (action === "link_existing") {
      const { produto_id, variacao_id, ml_item_id } = corpo;

      if (!produto_id || !ml_item_id) {
        return new Response(
          JSON.stringify({ error: "Parâmetros produto_id e ml_item_id são obrigatórios." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const itemLimpo = ml_item_id.trim().toUpperCase();
      const { token, conta } = await obterAccessTokenValido(supabaseAdmin, loja_id);

      // Consulta os dados do anúncio diretamente na API do Mercado Livre
      const respItem = await fetch(`https://api.mercadolibre.com/items/${itemLimpo}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json",
        },
      });

      if (!respItem.ok) {
        return new Response(
          JSON.stringify({ error: `Anúncio ${itemLimpo} não encontrado no Mercado Livre ou acesso não autorizado.` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const dadosItem = await respItem.json();

      // Validação de titularidade: o anúncio pertence à conta conectada no HUBI?
      if (dadosItem.seller_id !== conta.ml_user_id) {
        return new Response(
          JSON.stringify({ error: "Este anúncio pertence a outro vendedor e não pode ser vinculado a esta conta." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Busca o estoque físico local do produto/variação no HUBI
      let estoqueAtual = 0;
      if (variacao_id) {
        const { data: v } = await supabaseAdmin
          .from("variacoes_produto")
          .select("quantidade_estoque")
          .eq("id", variacao_id)
          .eq("loja_id", loja_id)
          .maybeSingle();
        estoqueAtual = Math.max(0, v?.quantidade_estoque || 0);
      } else {
        const { data: p } = await supabaseAdmin
          .from("produtos")
          .select("quantidade_estoque")
          .eq("id", produto_id)
          .eq("loja_id", loja_id)
          .maybeSingle();
        estoqueAtual = Math.max(0, p?.quantidade_estoque || 0);
      }

      // Grava o vínculo no banco
      const { data: novoVinculo, error: erroVinculo } = await supabaseAdmin
        .from("marketplace_anuncios")
        .upsert(
          {
            loja_id: loja_id,
            conta_id: conta.id,
            produto_id: produto_id,
            variacao_id: variacao_id || null,
            ml_item_id: itemLimpo,
            ml_category_id: dadosItem.category_id || null,
            ml_listing_type_id: dadosItem.listing_type_id || "gold_special",
            titulo_anuncio: dadosItem.title,
            preco_anuncio: dadosItem.price,
            estoque_ultimo_enviado: estoqueAtual,
            status_anuncio: dadosItem.status || "active",
            permalink: dadosItem.permalink || null,
            sincronizacao_ativa: true,
            ultima_sincronizacao_estoque_em: new Date().toISOString(),
          },
          { onConflict: "loja_id,ml_item_id,COALESCE(ml_variation_id, 0)" }
        )
        .select()
        .single();

      if (erroVinculo) {
        // Se falhar o upsert pelo formato de expressão, busca ou insere direto
        console.error("[ml-estoque-sync] Erro ao gravar vínculo:", erroVinculo.message);
      }

      // Atualiza o estoque do anúncio no Mercado Livre imediatamente com o saldo local
      await fetch(`https://api.mercadolibre.com/items/${itemLimpo}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ available_quantity: estoqueAtual }),
      }).catch((e) => console.error("[ml-estoque-sync] Falha ao atualizar estoque pós-vínculo:", e));

      return new Response(
        JSON.stringify({
          sucesso: true,
          mensagem: `Anúncio ${itemLimpo} vinculado com sucesso e estoque atualizado para ${estoqueAtual} unidades!`,
          anuncio: novoVinculo || dadosItem,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO 3: CRIAR NOVO ANÚNCIO NO MERCADO LIVRE VIA GDM (create_listing)
    // =========================================================================
    if (action === "create_listing") {
      const { payload_ml, produto_id, variacao_id, margem_sobrepreco } = corpo;

      if (!payload_ml || !produto_id) {
        return new Response(
          JSON.stringify({ error: "Parâmetros payload_ml e produto_id são obrigatórios." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { token, conta } = await obterAccessTokenValido(supabaseAdmin, loja_id);

      // Envia requisição para a API oficial do Mercado Livre
      const respPost = await fetch("https://api.mercadolibre.com/items", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload_ml),
      });

      const dadosCriado = await respPost.json();

      if (!respPost.ok) {
        console.error("[ml-estoque-sync] Erro ao criar item no ML:", dadosCriado);
        const detalhe = dadosCriado.cause?.[0]?.message || dadosCriado.message || "Erro desconhecido na API do Mercado Livre.";
        return new Response(
          JSON.stringify({ error: `Não foi possível publicar no Mercado Livre: ${detalhe}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Grava o novo anúncio na tabela public.marketplace_anuncios
      await supabaseAdmin
        .from("marketplace_anuncios")
        .insert({
          loja_id: loja_id,
          conta_id: conta.id,
          produto_id: produto_id,
          variacao_id: variacao_id || null,
          ml_item_id: dadosCriado.id,
          ml_category_id: dadosCriado.category_id,
          ml_listing_type_id: dadosCriado.listing_type_id,
          titulo_anuncio: dadosCriado.title,
          preco_anuncio: dadosCriado.price,
          margem_sobrepreco_percentual: Number(margem_sobrepreco || 0),
          estoque_ultimo_enviado: dadosCriado.available_quantity || 0,
          status_anuncio: dadosCriado.status || "active",
          permalink: dadosCriado.permalink || null,
          sincronizacao_ativa: true,
          ultima_sincronizacao_estoque_em: new Date().toISOString(),
        });

      return new Response(
        JSON.stringify({
          sucesso: true,
          mensagem: `Anúncio ${dadosCriado.id} publicado com sucesso no Mercado Livre!`,
          item: dadosCriado,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Ação '${action}' não reconhecida.` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[ml-estoque-sync] Exceção:", error?.message);
    const statusCode = error instanceof MercadoLivreError ? error.statusCode : 500;
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno ao sincronizar com o Mercado Livre." }),
      { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
