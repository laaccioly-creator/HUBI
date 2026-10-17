// Supabase Edge Function: hubi-webhook-mp
// Endpoint público para receber notificações do Mercado Pago e ativar/renovar anuidades
// Deploy: npx supabase functions deploy hubi-webhook-mp --no-verify-jwt

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

  // Health check / Liveness probe
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "active", service: "HUBI Mercado Pago Webhook" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    // Captura o payment_id do payload (v2 webhook ou parâmetros de query)
    const paymentId =
      body.data?.id ||
      body.id ||
      url.searchParams.get("data.id") ||
      url.searchParams.get("id");

    const topic = body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic");

    // Se a notificação não for de pagamento ou não tiver ID, confirma recebimento para o gateway
    if (!paymentId || (topic && topic !== "payment")) {
      return new Response(
        JSON.stringify({ received: true, ignored: true, reason: "not_a_payment_event" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const mpAccessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") || "";

    if (!mpAccessToken) {
      console.error("[hubi-webhook-mp] MERCADO_PAGO_ACCESS_TOKEN não configurada.");
      return new Response(
        JSON.stringify({ error: "Configuração do gateway pendente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Consulta o pagamento na API oficial do Mercado Pago para conferência segura
    const mpPaymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
      },
    });

    if (!mpPaymentRes.ok) {
      console.warn(`[hubi-webhook-mp] Falha ao consultar pagamento ${paymentId} no Mercado Pago.`);
      return new Response(
        JSON.stringify({ received: true, warning: "payment_lookup_failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payment = await mpPaymentRes.json();
    const statusPagamento = payment.status; // 'approved', 'in_process', 'rejected', 'cancelled'
    const lojaId = payment.external_reference || payment.metadata?.loja_id;
    const orgId = payment.metadata?.organizacao_id;

    if (!lojaId) {
      console.warn(`[hubi-webhook-mp] Pagamento ${paymentId} sem external_reference associado à loja.`);
      return new Response(
        JSON.stringify({ received: true, warning: "loja_id_missing" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 2. Se o pagamento foi aprovado, renova ou ativa a anuidade da loja com trava de idempotência
    if (statusPagamento === "approved") {
      // Trava de Idempotência: verifica se este mp_payment_id já foi processado e aprovado anteriormente
      const { data: pagamentoJaProcessado } = await supabaseAdmin
        .from("hubi_assinaturas_pagamentos")
        .select("id, status_pagamento")
        .eq("mp_payment_id", String(payment.id))
        .eq("status_pagamento", "approved")
        .limit(1)
        .maybeSingle();

      if (pagamentoJaProcessado) {
        console.log(`[hubi-webhook-mp] Idempotência: Pagamento ${payment.id} já processado anteriormente para a loja ${lojaId}. Ignorando duplicata.`);
        return new Response(
          JSON.stringify({ received: true, idempotent_skip: true, status: statusPagamento }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Busca dados atuais da loja para somar 365 dias (preservando dias restantes se renovação antecipada)
      const { data: lojaAtual } = await supabaseAdmin
        .from("lojas")
        .select("id, organizacao_id, status_assinatura, assinatura_fim_em")
        .eq("id", lojaId)
        .maybeSingle();

      if (lojaAtual) {
        const agora = new Date();
        let novaDataFim: Date;

        if (lojaAtual.assinatura_fim_em) {
          const fimAtual = new Date(lojaAtual.assinatura_fim_em);
          if (fimAtual.getTime() > agora.getTime()) {
            // Renovação antecipada: soma 365 dias a partir da data de vencimento atual
            novaDataFim = new Date(fimAtual.getTime() + 365 * 24 * 60 * 60 * 1000);
          } else {
            // Vencida: soma 365 dias a partir de hoje
            novaDataFim = new Date(agora.getTime() + 365 * 24 * 60 * 60 * 1000);
          }
        } else {
          // Primeira assinatura (saindo do trial): 365 dias a partir de hoje
          novaDataFim = new Date(agora.getTime() + 365 * 24 * 60 * 60 * 1000);
        }

        // Atualização atômica da loja para status ativo e nova vigência
        const { error: erroLoja } = await supabaseAdmin
          .from("lojas")
          .update({
            status_assinatura: "ativo",
            assinatura_fim_em: novaDataFim.toISOString(),
          })
          .eq("id", lojaId);

        if (erroLoja) {
          console.error(`[hubi-webhook-mp] Erro ao atualizar status da loja ${lojaId}:`, erroLoja.message);
        } else {
          console.log(`[hubi-webhook-mp] Loja ${lojaId} ativada com sucesso até ${novaDataFim.toISOString()}`);
        }

        // Atualiza ou insere o registro na tabela de auditoria de pagamentos
        const organizacaoAlvoId = lojaAtual.organizacao_id || orgId;
        if (organizacaoAlvoId) {
          // Tenta atualizar registro pendente recente dessa loja
          const { data: faturaPendente } = await supabaseAdmin
            .from("hubi_assinaturas_pagamentos")
            .select("id")
            .eq("loja_id", lojaId)
            .eq("status_pagamento", "pendente")
            .order("criado_em", { ascending: false })
            .limit(1)
            .maybeSingle();

          const dadosAtualizacao = {
            status_pagamento: "approved",
            mp_payment_id: String(payment.id),
            mp_collection_id: String(payment.id),
            meio_pagamento: payment.payment_method_id || null,
            bandeira_metodo: payment.payment_type_id || null,
            periodo_inicio_em: agora.toISOString(),
            periodo_fim_em: novaDataFim.toISOString(),
            aprovado_em: payment.date_approved || agora.toISOString(),
            valor_total: Number(payment.transaction_amount || 598.80),
          };

          if (faturaPendente) {
            await supabaseAdmin
              .from("hubi_assinaturas_pagamentos")
              .update(dadosAtualizacao)
              .eq("id", faturaPendente.id);
          } else {
            await supabaseAdmin
              .from("hubi_assinaturas_pagamentos")
              .insert({
                loja_id: lojaId,
                organizacao_id: organizacaoAlvoId,
                mp_preference_id: String(payment.order?.id || payment.id),
                valor_mensal_referencia: 49.90,
                parcelas: payment.installments || 12,
                ciclo_meses: 12,
                ...dadosAtualizacao,
              });
          }
        }
      }
    } else if (statusPagamento === "rejected" || statusPagamento === "cancelled") {
      // Registra status de cancelamento se houver fatura pendente
      await supabaseAdmin
        .from("hubi_assinaturas_pagamentos")
        .update({
          status_pagamento: statusPagamento,
          mp_payment_id: String(payment.id),
        })
        .eq("loja_id", lojaId)
        .eq("status_pagamento", "pendente");
    }

    return new Response(
      JSON.stringify({ received: true, status: statusPagamento }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[hubi-webhook-mp] Exceção no webhook:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno no processamento do webhook." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
