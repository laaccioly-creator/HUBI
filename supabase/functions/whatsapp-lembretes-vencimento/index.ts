// Supabase Edge Function: whatsapp-lembretes-vencimento
// Disparo matinal (08:00 BRT) de lembretes de vencimento de Caderneta de Mercadinho e Fiado
// Arquitetura 100% Relacional (zero JSONB / metadados) com idempotência diária por loja/cliente/data.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolverCredenciaisMetaSaida } from "../_shared/whatsappMetaConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface DataBrtInfo {
  ymd: string;
  br: string;
  diaMes: number;
  ultimoDiaMes: number;
  diaSemana: number;
}

function obterDataAtualBrasilia(): DataBrtInfo {
  const agora = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = fmt.formatToParts(agora);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const ano = Number(getPart("year"));
  const mes = Number(getPart("month"));
  const diaMes = Number(getPart("day"));

  const semanaMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const diaSemana = semanaMap[getPart("weekday")] ?? 0;
  const ultimoDiaMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

  const mm = String(mes).padStart(2, "0");
  const dd = String(diaMes).padStart(2, "0");

  return {
    ymd: `${ano}-${mm}-${dd}`,
    br: `${dd}/${mm}/${ano}`,
    diaMes,
    ultimoDiaMes,
    diaSemana,
  };
}

function normalizarTelefoneBrasil(telefone?: string | null): string {
  const digitos = String(telefone || "").replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.startsWith("55") && digitos.length >= 12) return digitos;
  return `55${digitos}`;
}

function formatarMoedaBRL(valor: number): string {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function cadernetaVenceHoje(
  cliente: {
    ciclo_caderneta?: string | null;
    dia_vencimento_caderneta?: number | null;
    dia_vencimento_2_caderneta?: number | null;
    dia_semana_caderneta?: number | null;
  },
  loja: {
    ciclo_padrao_caderneta?: string | null;
    dia_vencimento_padrao_caderneta?: number | null;
    dia_vencimento_2_padrao_caderneta?: number | null;
    dia_semana_padrao_caderneta?: number | null;
  },
  hoje: DataBrtInfo
): boolean {
  const ciclo = cliente.ciclo_caderneta || loja.ciclo_padrao_caderneta || "mensal";

  if (ciclo === "semanal") {
    const diaSemanaAlvo = Number(
      cliente.dia_semana_caderneta ?? loja.dia_semana_padrao_caderneta ?? 5
    );
    return diaSemanaAlvo === hoje.diaSemana;
  }

  if (ciclo === "quinzenal") {
    const d1Raw = Number(
      cliente.dia_vencimento_caderneta ?? loja.dia_vencimento_padrao_caderneta ?? 15
    );
    const d2Default = d1Raw <= 15 ? Math.min(30, d1Raw + 15) : Math.max(1, d1Raw - 15);
    const d2Raw = Number(
      cliente.dia_vencimento_2_caderneta ?? loja.dia_vencimento_2_padrao_caderneta ?? d2Default
    );
    const d1Efetivo = Math.min(Math.max(1, Math.trunc(d1Raw)), hoje.ultimoDiaMes);
    const d2Efetivo = Math.min(Math.max(1, Math.trunc(d2Raw)), hoje.ultimoDiaMes);
    return hoje.diaMes === d1Efetivo || hoje.diaMes === d2Efetivo;
  }

  const diaMensalRaw = Number(
    cliente.dia_vencimento_caderneta ?? loja.dia_vencimento_padrao_caderneta ?? 10
  );
  const diaMensalEfetivo = Math.min(Math.max(1, Math.trunc(diaMensalRaw)), hoje.ultimoDiaMes);
  return hoje.diaMes === diaMensalEfetivo;
}

async function enviarMensagemCloudApi(params: {
  phoneNumberId: string;
  accessToken: string;
  telefoneDestino: string;
  mensagem: string;
}): Promise<boolean> {
  const fone = normalizarTelefoneBrasil(params.telefoneDestino);
  if (!fone || !params.phoneNumberId || !params.accessToken) return false;

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: fone,
        type: "text",
        text: { preview_url: false, body: params.mensagem },
      }),
    }
  );

  return res.ok;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    let lojaIdFiltro: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.loja_id === "string" && body.loja_id.trim()) {
        lojaIdFiltro = body.loja_id.trim();
      }
    } catch {
      // Body vazio (chamada via pg_cron) é válido
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const hoje = obterDataAtualBrasilia();

    const [{ data: configPlat }, lojasRes] = await Promise.all([
      supabaseAdmin
        .from("configuracoes_plataforma")
        .select("custo_disparo_whatsapp, meta_phone_number_id, meta_access_token")
        .eq("id", 1)
        .maybeSingle(),
      (() => {
        let q = supabaseAdmin
          .from("lojas")
          .select(
            "id, nome_fantasia, whatsapp_auto_ativo, whatsapp_saldo, whatsapp_bonus_expira_em, meta_phone_number_id, meta_access_token, caderneta_ativa, ciclo_padrao_caderneta, dia_vencimento_padrao_caderneta, dia_semana_padrao_caderneta, dia_vencimento_2_padrao_caderneta, wpp_auto_vencimento_caderneta, wpp_auto_vencimento_fiado"
          )
          .eq("whatsapp_auto_ativo", true);
        if (lojaIdFiltro) {
          q = q.eq("id", lojaIdFiltro);
        }
        return q;
      })(),
    ]);

    if (lojasRes.error) {
      throw new Error(`Falha ao consultar lojas elegíveis: ${lojasRes.error.message}`);
    }

    const tarifaDisparo = Number(configPlat?.custo_disparo_whatsapp ?? 0.15);
    const lojas = (lojasRes.data || []) as Array<{
      id: string;
      nome_fantasia: string | null;
      whatsapp_auto_ativo: boolean;
      whatsapp_saldo: number | null;
      whatsapp_bonus_expira_em: string | null;
      meta_phone_number_id: string | null;
      meta_access_token: string | null;
      caderneta_ativa: boolean | null;
      ciclo_padrao_caderneta: string | null;
      dia_vencimento_padrao_caderneta: number | null;
      dia_semana_padrao_caderneta: number | null;
      dia_vencimento_2_padrao_caderneta: number | null;
      wpp_auto_vencimento_caderneta: boolean | null;
      wpp_auto_vencimento_fiado: boolean | null;
    }>;

    let totalEnviados = 0;
    let totalIgnorados = 0;

    for (const loja of lojas) {
      const { phoneNumberId, accessToken } = resolverCredenciaisMetaSaida(loja, configPlat);
      if (!phoneNumberId || !accessToken) {
        continue;
      }

      let saldoAtual = Number(loja.whatsapp_saldo ?? 0);
      if (loja.whatsapp_bonus_expira_em && saldoAtual > 0) {
        const expiraTs = new Date(loja.whatsapp_bonus_expira_em).getTime();
        if (Date.now() > expiraTs) {
          const { data: recargaPaga } = await supabaseAdmin
            .from("loja_whatsapp_transacoes")
            .select("id")
            .eq("loja_id", loja.id)
            .eq("tipo", "recarga_pix")
            .eq("status_pagamento", "concluido")
            .limit(1)
            .maybeSingle();

          if (!recargaPaga) {
            saldoAtual = 0;
          }
        }
      }

      const nomeLoja = (loja.nome_fantasia || "Nossa Loja").trim();
      const cadernetaAtiva = Boolean(loja.caderneta_ativa);

      // Verifica forma de pagamento tipo 'fiado' ativa em tabela relacional (somente se Caderneta desligada)
      let fiadoAtivo = false;
      if (!cadernetaAtiva) {
        const { data: fpsFiado } = await supabaseAdmin
          .from("formas_pagamento")
          .select("id, ativo")
          .eq("loja_id", loja.id)
          .eq("tipo", "fiado")
          .eq("ativo", true)
          .limit(1);
        fiadoAtivo = Boolean(fpsFiado && fpsFiado.length > 0);
      }

      // Caso 3: Ambos desligados -> nada a disparar
      if (!cadernetaAtiva && !fiadoAtivo) {
        continue;
      }

      // Buscar envios já realizados hoje para idempotência
      const { data: enviosHoje } = await supabaseAdmin
        .from("crediario_lembretes_enviados")
        .select("cliente_id, tipo_credito")
        .eq("loja_id", loja.id)
        .eq("data_vencimento", hoje.ymd);

      const clientesJaNotificados = new Set(
        (enviosHoje || []).map((r: { cliente_id: string; tipo_credito: string }) => `${r.tipo_credito}:${r.cliente_id}`)
      );

      // Caso 1: Caderneta Ativa
      if (cadernetaAtiva && loja.wpp_auto_vencimento_caderneta !== false) {
        const { data: clientesCaderneta } = await supabaseAdmin
          .from("clientes")
          .select(
            "id, nome, whatsapp, telefone, saldo_devedor_caderneta, permite_caderneta, ciclo_caderneta, dia_vencimento_caderneta, dia_vencimento_2_caderneta, dia_semana_caderneta, whatsapp_ultima_interacao_cliente_em"
          )
          .eq("loja_id", loja.id)
          .eq("permite_caderneta", true)
          .gt("saldo_devedor_caderneta", 0);

        for (const cli of clientesCaderneta || []) {
          if (clientesJaNotificados.has(`caderneta:${cli.id}`)) {
            totalIgnorados++;
            continue;
          }
          if (!cadernetaVenceHoje(cli, loja, hoje)) {
            continue;
          }
          const telefoneDestino = cli.whatsapp || cli.telefone;
          if (!normalizarTelefoneBrasil(telefoneDestino)) {
            continue;
          }

          const janela24hAberta = Boolean(
            cli.whatsapp_ultima_interacao_cliente_em &&
              Date.now() - new Date(cli.whatsapp_ultima_interacao_cliente_em).getTime() < 24 * 60 * 60 * 1000
          );

          if (!janela24hAberta && saldoAtual < tarifaDisparo) {
            totalIgnorados++;
            continue;
          }

          const valorSaldo = Number(cli.saldo_devedor_caderneta || 0);
          const nomeCliente = (cli.nome || "Cliente").trim().split(" ")[0];
          const mensagem = `Olá, ${nomeCliente}! Tudo bem? Passando para lembrar que hoje (${hoje.br}) é o dia do acerto da sua Caderneta na *${nomeLoja}*. Saldo atual: *${formatarMoedaBRL(valorSaldo)}*. Qualquer dúvida ou para solicitar a chave Pix, estamos à disposição!`;

          const enviado = await enviarMensagemCloudApi({
            phoneNumberId,
            accessToken,
            telefoneDestino: String(telefoneDestino),
            mensagem,
          });

          if (!enviado) {
            totalIgnorados++;
            continue;
          }

          let modoEnvio = "auto_janela_24h";
          if (!janela24hAberta) {
            modoEnvio = "auto_tarifado";
            const { data: rpcDeb } = await supabaseAdmin.rpc("debitar_saldo_whatsapp_atomico", {
              p_loja_id: loja.id,
              p_valor_tarifa: tarifaDisparo,
              p_evento_gatilho: "lembrete_vencimento_caderneta",
              p_descricao: `Lembrete automático de vencimento (Caderneta) - ${cli.nome || "Cliente"}`,
              p_pedido_id: null,
              p_cliente_id: cli.id,
              p_usuario_id: null,
            });
            const linhaDeb = Array.isArray(rpcDeb) ? rpcDeb[0] : rpcDeb;
            saldoAtual = Number(linhaDeb?.saldo_posterior ?? Math.max(0, saldoAtual - tarifaDisparo));
          }

          await supabaseAdmin.from("crediario_lembretes_enviados").insert({
            loja_id: loja.id,
            cliente_id: cli.id,
            pedido_id: null,
            tipo_credito: "caderneta",
            data_vencimento: hoje.ymd,
            valor_cobrado: valorSaldo,
            modo_envio: modoEnvio,
          });

          clientesJaNotificados.add(`caderneta:${cli.id}`);
          totalEnviados++;
        }
      }

      // Caso 2: Fiado Ativo (Caderneta desligada)
      if (fiadoAtivo && loja.wpp_auto_vencimento_fiado !== false) {
        const { data: pedidosVencendoHoje } = await supabaseAdmin
          .from("pedidos")
          .select(
            "id, numero_pedido, cliente_id, saldo_devedor, data_vencimento_fiado, cliente:clientes(id, nome, whatsapp, telefone, whatsapp_ultima_interacao_cliente_em)"
          )
          .eq("loja_id", loja.id)
          .neq("status", "cancelado")
          .eq("status_pagamento", "fiado")
          .gt("saldo_devedor", 0)
          .eq("data_vencimento_fiado", hoje.ymd);

        // Consolida 1 disparo por cliente no dia
        const gruposPorCliente = new Map<
          string,
          {
            clienteId: string;
            nome: string;
            telefone: string;
            ultimaInteracao: string | null;
            valorTotal: number;
            numerosPedidos: number[];
          }
        >();

        for (const ped of pedidosVencendoHoje || []) {
          if (!ped.cliente_id) continue;
          const cliRaw = Array.isArray(ped.cliente) ? ped.cliente[0] : ped.cliente;
          if (!cliRaw) continue;
          const fone = cliRaw.whatsapp || cliRaw.telefone || "";
          if (!normalizarTelefoneBrasil(fone)) continue;

          const atual = gruposPorCliente.get(ped.cliente_id) || {
            clienteId: ped.cliente_id,
            nome: cliRaw.nome || "Cliente",
            telefone: fone,
            ultimaInteracao: cliRaw.whatsapp_ultima_interacao_cliente_em || null,
            valorTotal: 0,
            numerosPedidos: [],
          };

          atual.valorTotal += Number(ped.saldo_devedor || 0);
          if (ped.numero_pedido) {
            atual.numerosPedidos.push(Number(ped.numero_pedido));
          }
          gruposPorCliente.set(ped.cliente_id, atual);
        }

        for (const grupo of gruposPorCliente.values()) {
          if (clientesJaNotificados.has(`fiado:${grupo.clienteId}`)) {
            totalIgnorados++;
            continue;
          }

          const janela24hAberta = Boolean(
            grupo.ultimaInteracao &&
              Date.now() - new Date(grupo.ultimaInteracao).getTime() < 24 * 60 * 60 * 1000
          );

          if (!janela24hAberta && saldoAtual < tarifaDisparo) {
            totalIgnorados++;
            continue;
          }

          const nomeCliente = (grupo.nome || "Cliente").trim().split(" ")[0];
          const listaPedidos =
            grupo.numerosPedidos.length > 1
              ? `Pedidos ${grupo.numerosPedidos.map((n) => `#${n}`).join(", ")}`
              : grupo.numerosPedidos.length === 1
              ? `Pedido #${grupo.numerosPedidos[0]}`
              : "Compra a prazo";

          const mensagem = `Olá, ${nomeCliente}! Tudo bem? Lembramos que hoje (${hoje.br}) vence sua compra a prazo (${listaPedidos}) na *${nomeLoja}* no valor de *${formatarMoedaBRL(grupo.valorTotal)}*. Caso precise da chave Pix ou comprovante, responda por aqui!`;

          const enviado = await enviarMensagemCloudApi({
            phoneNumberId,
            accessToken,
            telefoneDestino: grupo.telefone,
            mensagem,
          });

          if (!enviado) {
            totalIgnorados++;
            continue;
          }

          let modoEnvio = "auto_janela_24h";
          if (!janela24hAberta) {
            modoEnvio = "auto_tarifado";
            const { data: rpcDeb } = await supabaseAdmin.rpc("debitar_saldo_whatsapp_atomico", {
              p_loja_id: loja.id,
              p_valor_tarifa: tarifaDisparo,
              p_evento_gatilho: "lembrete_vencimento_fiado",
              p_descricao: `Lembrete automático de vencimento (Fiado) - ${grupo.nome}`,
              p_pedido_id: null,
              p_cliente_id: grupo.clienteId,
              p_usuario_id: null,
            });
            const linhaDeb = Array.isArray(rpcDeb) ? rpcDeb[0] : rpcDeb;
            saldoAtual = Number(linhaDeb?.saldo_posterior ?? Math.max(0, saldoAtual - tarifaDisparo));
          }

          await supabaseAdmin.from("crediario_lembretes_enviados").insert({
            loja_id: loja.id,
            cliente_id: grupo.clienteId,
            pedido_id: null,
            tipo_credito: "fiado",
            data_vencimento: hoje.ymd,
            valor_cobrado: Number(grupo.valorTotal.toFixed(2)),
            modo_envio: modoEnvio,
          });

          clientesJaNotificados.add(`fiado:${grupo.clienteId}`);
          totalEnviados++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        dataReferencia: hoje.ymd,
        totalEnviados,
        totalIgnorados,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao processar lembretes de vencimento.";
    console.error("[whatsapp-lembretes-vencimento] Erro:", msg);
    return new Response(
      JSON.stringify({ sucesso: false, erro: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
