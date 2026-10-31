// Supabase Edge Function: whatsapp-outbound-dispatch
// Motor Híbrido de Notificações WhatsApp (Cloud API + Carteira Pré-Paga + Fallback Manual)
// Deploy: npx supabase functions deploy whatsapp-outbound-dispatch

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface DisparoPayload {
  loja_id: string;
  cliente_id?: string | null;
  pedido_id?: string | null;
  usuario_id?: string | null;
  telefone_destino: string;
  mensagem_texto: string;
  evento_gatilho: string;
  descricao_auditoria?: string;
  template_nome?: string;
  template_idioma?: string;
  template_parametros?: string[];
}

function normalizarTelefoneBrasil(telefone: string): string {
  const digitos = (telefone || "").replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.startsWith("55") && digitos.length >= 12) return digitos;
  return `55${digitos}`;
}

function construirUrlManualWhatsApp(telefone: string, mensagem: string): string {
  const foneNormalizado = normalizarTelefoneBrasil(telefone);
  return `https://api.whatsapp.com/send?phone=${foneNormalizado}&text=${encodeURIComponent(mensagem)}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    const body = (await req.json()) as DisparoPayload;
    const {
      loja_id,
      cliente_id,
      pedido_id,
      usuario_id,
      telefone_destino,
      mensagem_texto,
      evento_gatilho,
      descricao_auditoria,
      template_nome,
      template_idioma = "pt_BR",
      template_parametros = [],
    } = body;

    if (!loja_id || !telefone_destino || !mensagem_texto) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          modoEnvio: "manual_link",
          motivo: "parametros_incompletos",
          urlManual: construirUrlManualWhatsApp(telefone_destino || "", mensagem_texto || ""),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const urlManual = construirUrlManualWhatsApp(telefone_destino, mensagem_texto);
    const foneMeta = normalizarTelefoneBrasil(telefone_destino);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Carregar dados da loja e parâmetros globais da plataforma
    const [{ data: loja }, { data: configPlat }] = await Promise.all([
      supabaseAdmin
        .from("lojas")
        .select(
          "id, nome_fantasia, whatsapp_auto_ativo, whatsapp_saldo, whatsapp_bonus_expira_em, meta_phone_number_id, meta_access_token"
        )
        .eq("id", loja_id)
        .maybeSingle(),
      supabaseAdmin
        .from("configuracoes_plataforma")
        .select("custo_disparo_whatsapp")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (!loja) {
      return new Response(
        JSON.stringify({
          sucesso: true,
          modoEnvio: "manual_link",
          motivo: "loja_nao_encontrada",
          custoDebitado: 0,
          urlManual,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tarifaDisparo = Number(configPlat?.custo_disparo_whatsapp ?? 0.15);
    let saldoAtual = Number(loja.whatsapp_saldo ?? 0);

    // 2. Verificação de Expiração do Bônus de 7 Dias
    if (loja.whatsapp_bonus_expira_em && saldoAtual > 0) {
      const expiraTimestamp = new Date(loja.whatsapp_bonus_expira_em).getTime();
      if (Date.now() > expiraTimestamp) {
        const { data: recargaExistente } = await supabaseAdmin
          .from("loja_whatsapp_transacoes")
          .select("id")
          .eq("loja_id", loja_id)
          .eq("tipo", "recarga_pix")
          .eq("status_pagamento", "concluido")
          .limit(1)
          .maybeSingle();

        if (!recargaExistente) {
          await supabaseAdmin.from("loja_whatsapp_transacoes").insert({
            loja_id,
            tipo: "expiracao_bonus",
            evento_gatilho: "expiracao_trial_7d",
            valor: -saldoAtual,
            saldo_anterior: saldoAtual,
            saldo_posterior: 0,
            status_pagamento: "concluido",
            descricao: "Expiração automática do crédito bônus de degustação (7 dias)",
          });

          await supabaseAdmin
            .from("lojas")
            .update({ whatsapp_saldo: 0 })
            .eq("id", loja_id);

          saldoAtual = 0;
        }
      }
    }

    const phoneNumberId = (loja.meta_phone_number_id || Deno.env.get("META_PHONE_NUMBER_ID") || "").trim();
    const metaAccessToken = (loja.meta_access_token || Deno.env.get("META_ACCESS_TOKEN") || "").trim();
    const possuiCredenciaisCloudApi = Boolean(phoneNumberId && metaAccessToken);

    // 3. Verificar Janela Receptiva de 24 Horas do Cliente (Custo Zero)
    let janela24hAberta = false;
    if (cliente_id) {
      const { data: cli } = await supabaseAdmin
        .from("clientes")
        .select("whatsapp_ultima_interacao_cliente_em")
        .eq("loja_id", loja_id)
        .eq("id", cliente_id)
        .maybeSingle();

      if (cli?.whatsapp_ultima_interacao_cliente_em) {
        const diffMs = Date.now() - new Date(cli.whatsapp_ultima_interacao_cliente_em).getTime();
        janela24hAberta = diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000;
      }
    }

    // ROTA 1: Janela de 24 Horas Aberta (Custo Zero via Service Conversation)
    if (janela24hAberta && loja.whatsapp_auto_ativo && possuiCredenciaisCloudApi) {
      const metaRes = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${metaAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: foneMeta,
            type: "text",
            text: { preview_url: false, body: mensagem_texto },
          }),
        }
      );

      if (metaRes.ok) {
        const metaJson = await metaRes.json();
        return new Response(
          JSON.stringify({
            sucesso: true,
            modoEnvio: "auto_janela_24h",
            motivo: "janela_24h_gratuita",
            custoDebitado: 0,
            saldoRestante: saldoAtual,
            messageIdMeta: metaJson?.messages?.[0]?.id || null,
            urlManual,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ROTA 2: Fora da Janela de 24h com Automação Ativa e Saldo Disponível (Disparo Tarifado)
    if (loja.whatsapp_auto_ativo && saldoAtual >= tarifaDisparo && possuiCredenciaisCloudApi) {
      const payloadMeta = template_nome
        ? {
            messaging_product: "whatsapp",
            to: foneMeta,
            type: "template",
            template: {
              name: template_nome,
              language: { code: template_idioma },
              components:
                template_parametros.length > 0
                  ? [
                      {
                        type: "body",
                        parameters: template_parametros.map((p) => ({
                          type: "text",
                          text: p,
                        })),
                      },
                    ]
                  : [],
            },
          }
        : {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: foneMeta,
            type: "text",
            text: { preview_url: false, body: mensagem_texto },
          };

      const metaRes = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${metaAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payloadMeta),
        }
      );

      if (metaRes.ok) {
        const metaJson = await metaRes.json();
        const { data: rpcDebito } = await supabaseAdmin.rpc(
          "debitar_saldo_whatsapp_atomico",
          {
            p_loja_id: loja_id,
            p_valor_tarifa: tarifaDisparo,
            p_evento_gatilho: evento_gatilho,
            p_descricao:
              descricao_auditoria ||
              `Disparo automático WhatsApp (${evento_gatilho})`,
            p_pedido_id: pedido_id || null,
            p_cliente_id: cliente_id || null,
            p_usuario_id: usuario_id || null,
          }
        );

        const linhaDebito = Array.isArray(rpcDebito) ? rpcDebito[0] : rpcDebito;
        const novoSaldo = Number(linhaDebito?.saldo_posterior ?? Math.max(0, saldoAtual - tarifaDisparo));

        return new Response(
          JSON.stringify({
            sucesso: true,
            modoEnvio: "auto_tarifado",
            motivo: "disparo_cloud_api_tarifado",
            custoDebitado: tarifaDisparo,
            saldoRestante: novoSaldo,
            messageIdMeta: metaJson?.messages?.[0]?.id || null,
            urlManual,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ROTA 3: Fallback Manual Gratuito (Sem Saldo, Automação Desligada ou Sem Cloud API)
    const motivoFallback = !loja.whatsapp_auto_ativo
      ? "automacao_desligada"
      : saldoAtual < tarifaDisparo
        ? "saldo_insuficiente"
        : "credenciais_cloud_api_ausentes";

    return new Response(
      JSON.stringify({
        sucesso: true,
        modoEnvio: "manual_link",
        motivo: motivoFallback,
        custoDebitado: 0,
        saldoRestante: saldoAtual,
        urlManual,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : "Erro interno no motor de disparo.";
    console.error("[whatsapp-outbound-dispatch] Exceção:", mensagemErro);
    return new Response(
      JSON.stringify({
        sucesso: false,
        modoEnvio: "manual_link",
        motivo: "erro_interno",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
