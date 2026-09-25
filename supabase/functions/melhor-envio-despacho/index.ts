// Supabase Edge Function: melhor-envio-despacho
// Endpoint de despacho e integração oficial com Melhor Envio (Jadlog, Correios, etc.)
// Deploy: npx supabase functions deploy melhor-envio-despacho --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ProductItemCart {
  name: string;
  quantity: number;
  unitary_value: number;
  weight?: number;
}

// =============================================================================
// VALIDADORES MATEMÁTICOS DE CPF E CNPJ (RECEITA FEDERAL)
// =============================================================================
function validarCpf(cpf: string): boolean {
  const c = cpf.replace(/\D/g, "");
  if (c.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(c)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(c.charAt(i), 10) * (10 - i);
  }
  let resto = 11 - (soma % 11);
  const dv1 = resto >= 10 ? 0 : resto;
  if (dv1 !== parseInt(c.charAt(9), 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(c.charAt(i), 10) * (11 - i);
  }
  resto = 11 - (soma % 11);
  const dv2 = resto >= 10 ? 0 : resto;
  return dv2 === parseInt(c.charAt(10), 10);
}

function validarCnpj(cnpj: string): boolean {
  const c = cnpj.replace(/\D/g, "");
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < 12; i++) {
    soma += parseInt(c.charAt(i), 10) * pesos1[i];
  }
  let resto = soma % 11;
  const dv1 = resto < 2 ? 0 : 11 - resto;
  if (dv1 !== parseInt(c.charAt(12), 10)) return false;

  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  soma = 0;
  for (let i = 0; i < 13; i++) {
    soma += parseInt(c.charAt(i), 10) * pesos2[i];
  }
  resto = soma % 11;
  const dv2 = resto < 2 ? 0 : 11 - resto;
  return dv2 === parseInt(c.charAt(13), 10);
}

function validarDocumentoReceita(doc?: string | null): boolean {
  if (!doc) return false;
  const limpo = doc.replace(/\D/g, "");
  if (limpo.length === 11) return validarCpf(limpo);
  if (limpo.length === 14) return validarCnpj(limpo);
  return false;
}

function limparTelefone(tel?: string | null): string {
  const t = (tel || "").replace(/\D/g, "");
  return t.length >= 10 ? t : "11999999999";
}

function extrairCepDeTexto(texto?: string | null): string {
  if (!texto) return "";
  const match = String(texto).match(/\b(\d{5})[-.\s]?(\d{3})\b/);
  if (match) {
    return `${match[1]}${match[2]}`;
  }
  return "";
}

function limparCep(cep?: string | null): string {
  const digitos = (cep || "").replace(/\D/g, "");
  if (digitos.length === 7) return digitos.padStart(8, "0");
  return digitos.slice(0, 8);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const pedidoId = body.pedidoId || body.pedido_id;
    let lojaId = body.loja_id || body.lojaId;
    const usuarioId = body.usuarioId || body.usuario_id || null;
    let isSandbox = typeof body.isSandbox === "boolean" ? body.isSandbox : undefined;
    const customPayload = body.payload;

    if (!pedidoId && !lojaId) {
      return new Response(
        JSON.stringify({
          error: "Parâmetro pedidoId ou loja_id é obrigatório para o despacho do Melhor Envio.",
          code: "MISSING_REQUIRED_PARAMS",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    let pedido: any = null;
    let loja: any = null;
    let entrega: any = null;
    let itensPedido: any[] = [];

    // 1. Carregar dados do Pedido se informado
    if (pedidoId) {
      const { data: pedData, error: pedErr } = await supabaseAdmin
        .from("pedidos")
        .select(`
          *,
          cliente:clientes(*),
          loja:lojas(*),
          itens:itens_pedido(*),
          pedido_entregas:pedido_entregas(*)
        `)
        .eq("id", pedidoId)
        .maybeSingle();

      if (pedErr || !pedData) {
        return new Response(
          JSON.stringify({
            error: `Pedido não encontrado (${pedidoId}): ${pedErr?.message || "Registro inexistente"}`,
            code: "ORDER_NOT_FOUND",
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      pedido = pedData;
      lojaId = lojaId || pedido.loja_id;
      loja = pedido.loja;

      // PostgREST pode retornar relação 1-1 como objeto ou 1-N como array
      if (Array.isArray(pedido.pedido_entregas)) {
        entrega = pedido.pedido_entregas[0] || null;
      } else if (pedido.pedido_entregas && typeof pedido.pedido_entregas === "object") {
        entrega = pedido.pedido_entregas;
      }

      // Fallback seguro: se o relacionamento não trouxe entrega, busca diretamente em pedido_entregas
      if (!entrega) {
        const { data: entDb } = await supabaseAdmin
          .from("pedido_entregas")
          .select("*")
          .eq("pedido_id", pedidoId)
          .maybeSingle();
        if (entDb) {
          entrega = entDb;
        }
      }

      itensPedido = pedido.itens || [];

      // Fallback seguro: se o join não trouxe os itens, busca diretamente em itens_pedido
      if (!itensPedido || itensPedido.length === 0) {
        const { data: itensDb } = await supabaseAdmin
          .from("itens_pedido")
          .select("*")
          .eq("pedido_id", pedidoId);
        if (itensDb && itensDb.length > 0) {
          itensPedido = itensDb;
        }
      }

      if (pedido.status === "cancelado") {
        return new Response(
          JSON.stringify({
            error: "Não é permitido despachar pedidos com status cancelado.",
            code: "ORDER_CANCELLED",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 2. Carregar configurações de frete da loja
    const { data: configShipping, error: configErr } = await supabaseAdmin
      .from("loja_shipping_configs")
      .select("*")
      .eq("loja_id", lojaId)
      .maybeSingle();

    if (configErr || !configShipping) {
      return new Response(
        JSON.stringify({
          error: "Configurações de frete da loja não encontradas.",
          code: "SHIPPING_CONFIG_NOT_FOUND",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = (configShipping.melhor_envio_token || "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({
          error: "Token do Melhor Envio não configurado nesta loja. Acesse Configurações > Frete e cadastre seu token.",
          code: "MELHOR_ENVIO_TOKEN_MISSING",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isSandbox === undefined) {
      isSandbox = Boolean(configShipping.melhor_envio_sandbox_mode);
    }

    const baseUrl = isSandbox
      ? "https://sandbox.melhorenvio.com.br"
      : "https://melhorenvio.com.br";

    const headersComuns = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "HUBI Sistema (suporte@hubi.app)",
    };

    // Consulta perfil do titular no Melhor Envio para harmonizar regras de PF/PJ
    let meUser: any = null;
    try {
      const meRes = await fetch(`${baseUrl}/api/v2/me`, { headers: headersComuns });
      if (meRes.ok) {
        meUser = await meRes.json();
      }
    } catch (eMe) {
      console.warn("[MelhorEnvio-Edge] Falha ao consultar /api/v2/me:", eMe);
    }

    // -------------------------------------------------------------------------
    // AÇÃO DEDICADA: Sincronização / Consulta de Rastreamento em Tempo Real
    // -------------------------------------------------------------------------
    const acao = body.acao || body.action || "despachar";
    if (acao === "sincronizar_rastreio" || acao === "consultar_rastreio") {
      console.log(`[MelhorEnvio-Edge] Executando sincronização de rastreio para o pedido ${pedidoId}...`);

      const codRastreioExistente = (body.codigo_rastreio || entrega?.codigo_rastreio || pedido?.codigo_rastreio || "").trim();
      const transpNome = (entrega?.transportadora_nome || pedido?.nome_transportadora || "").trim();
      const servicoCorreios = entrega?.servico_correios || pedido?.servico_correios || (pedido?.metadados as any)?.servico_correios;
      const isCorreios =
        transpNome.toLowerCase().includes("correios") ||
        (entrega?.tipo_operacao === "correios") ||
        (entrega?.provedor === "correios") ||
        (entrega?.provedor === "frete_proprio" && Boolean(servicoCorreios)) ||
        Boolean(servicoCorreios) ||
        /^[a-zA-Z]{2}\d{9}[a-zA-Z]{2}$/.test(codRastreioExistente);

      // Tratamento Dedicado para Envios Correios (balcão ou contrato direto)
      if (isCorreios && codRastreioExistente) {
        console.log(`[MelhorEnvio-Edge] Sincronizando rastreio Correios para código ${codRastreioExistente}...`);
        let statusEnvioMapeado = entrega?.status_envio || (pedido?.status === "entregue" ? "entregue" : "despachado");
        let dataEntrega = (pedido?.metadados as any)?.data_entrega || null;
        let dataPostagem = entrega?.despachado_em || pedido?.despachado_em || new Date().toISOString();
        let eventosFinais: any[] = (pedido?.metadados as any)?.eventos_rastreio || (entrega as any)?.eventos_rastreio || [];

        // Consulta de eventos ao Melhor Rastreio GraphQL
        try {
          const mrQuery = {
            query: `query {
              findByTrackingCode(tracker: { trackingCode: "${codRastreioExistente}" }) {
                id
                lastStatus
                postedAt
                deliveredAt
                trackingEvents {
                  createdAt
                  status
                  title
                  description
                  location {
                    city
                    state
                  }
                }
              }
            }`
          };
          const mrRes = await fetch("https://api.melhorrastreio.com.br/graphql", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "HUBI Sistema (suporte@hubi.app)"
            },
            body: JSON.stringify(mrQuery)
          });
          if (mrRes.ok) {
            const mrData = await mrRes.json();
            const parcel = mrData?.data?.findByTrackingCode;
            if (parcel) {
              if (parcel.deliveredAt || parcel.lastStatus === "DELIVERED") {
                statusEnvioMapeado = "entregue";
                dataEntrega = parcel.deliveredAt || dataEntrega || new Date().toISOString();
              } else if (parcel.lastStatus === "OUT_FOR_DELIVERY") {
                statusEnvioMapeado = "saiu_para_entrega";
              } else if (parcel.lastStatus === "IN_TRANSIT") {
                statusEnvioMapeado = "em_transito";
              }

              if (Array.isArray(parcel.trackingEvents) && parcel.trackingEvents.length > 0) {
                eventosFinais = parcel.trackingEvents.map((ev: any) => ({
                  data: ev.createdAt,
                  data_formatada: new Date(ev.createdAt).toLocaleString("pt-BR"),
                  titulo: ev.title || ev.status,
                  descricao: ev.description,
                  local: ev.location ? `${ev.location.city || ""} - ${ev.location.state || ""}`.trim() : "",
                  tipo: ev.status
                }));
              }
            }
          }
        } catch (eMr) {
          console.warn("[MelhorEnvio-Edge] Falha na consulta GraphQL Melhor Rastreio:", eMr);
        }

        // Se o status já era 'entregue' no banco, nunca rebaixa
        if (entrega?.status_envio === "entregue" || pedido?.status === "entregue") {
          statusEnvioMapeado = "entregue";
        }

        const atualizadoEm = new Date().toISOString();
        const linkOficial = `https://rastreamento.correios.com.br/app/index.php?objeto=${codRastreioExistente}`;

        if (pedidoId) {
          await supabaseAdmin
            .from("pedido_entregas")
            .update({
              codigo_rastreio: codRastreioExistente,
              link_rastreio: linkOficial,
              status_envio: statusEnvioMapeado,
              atualizado_em: atualizadoEm,
            })
            .eq("pedido_id", pedidoId);

          const updatePed: Record<string, any> = {
            codigo_rastreio: codRastreioExistente,
            link_rastreio: linkOficial,
            metadados: {
              ...(pedido?.metadados || {}),
              provedor_frete: "correios",
              servico_correios: servicoCorreios || "PAC",
              eventos_rastreio: eventosFinais,
              data_entrega: dataEntrega
            },
            atualizado_em: atualizadoEm
          };
          if (statusEnvioMapeado === "entregue" && pedido?.status === "enviado") {
            updatePed.status = "entregue";
          }
          await supabaseAdmin
            .from("pedidos")
            .update(updatePed)
            .eq("id", pedidoId);
        }

        return new Response(
          JSON.stringify({
            sucesso: true,
            acao: "sincronizar_rastreio",
            codigo_rastreio: codRastreioExistente,
            link_rastreio: linkOficial,
            status_envio: statusEnvioMapeado,
            data_postagem: dataPostagem,
            data_entrega: dataEntrega,
            eventos_rastreio: eventosFinais,
            transportadora: servicoCorreios ? `Correios (${servicoCorreios})` : "Correios",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let orderId =
        body.ordem_id ||
        body.ordemId ||
        pedido?.metadados?.melhor_envio_order_id ||
        null;

      let orderData: any = null;

      // 1. Se já temos o ID da ordem no Melhor Envio, consulta diretamente
      if (orderId) {
        try {
          const oRes = await fetch(`${baseUrl}/api/v2/me/orders/${orderId}`, {
            headers: headersComuns,
          });
          if (oRes.ok) {
            orderData = await oRes.json();
          }
        } catch (eOrder) {
          console.warn("[MelhorEnvio-Edge] Falha ao buscar ordem por ID direto:", eOrder);
        }
      }

      // 2. Se não encontrou por ID direto, busca na listagem recente de ordens
      if (!orderData) {
        try {
          const listRes = await fetch(`${baseUrl}/api/v2/me/orders`, {
            headers: headersComuns,
          });
          if (listRes.ok) {
            const listJson = await listRes.json();
            const ordersList: any[] = Array.isArray(listJson) ? listJson : (listJson.data || []);

            const cepDestinoLimpo = limparCep(
              entrega?.destino_cep ||
              pedido?.cliente?.cep ||
              extrairCepDeTexto(pedido?.endereco_entrega)
            );
            const nomeCli = (pedido?.cliente_nome_avulso || pedido?.cliente?.nome || "").toLowerCase().trim();
            const docCli = (pedido?.cliente?.numero_documento || pedido?.cliente_documento_avulso || "").replace(/\D/g, "");
            const linkEtq = (entrega?.link_etiqueta || "").trim();

            const found = ordersList.find((ord: any) => {
              if (body.protocolo && ord.protocol === body.protocolo) return true;
              if (linkEtq && ord.id && linkEtq.includes(ord.id)) return true;

              const ordCep = limparCep(ord.to?.postal_code);
              const ordDoc = (ord.to?.document || "").replace(/\D/g, "");
              const ordNome = (ord.to?.name || "").toLowerCase().trim();

              if (cepDestinoLimpo && ordCep && cepDestinoLimpo === ordCep) {
                if (nomeCli && ordNome && (ordNome.includes(nomeCli) || nomeCli.includes(ordNome))) return true;
                if (docCli && ordDoc && docCli === ordDoc) return true;
                if (!nomeCli && !docCli) return true;
              }
              return false;
            });

            if (found) {
              orderData = found;
              orderId = found.id;
            }
          }
        } catch (eList) {
          console.warn("[MelhorEnvio-Edge] Falha ao listar ordens recentes:", eList);
        }
      }

      if (!orderData) {
        return new Response(
          JSON.stringify({
            sucesso: false,
            error: "Ordem de envio não localizada no Melhor Envio para sincronização.",
            code: "ORDER_NOT_FOUND_ON_PROVIDER",
            codigo_rastreio: entrega?.codigo_rastreio || pedido?.codigo_rastreio || "",
            status_envio: entrega?.status_envio || "despachado",
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 3. Consulta complementar ao endpoint de tracking em tempo real
      let trackingInfo: any = null;
      try {
        const trkRes = await fetch(`${baseUrl}/api/v2/me/shipment/tracking`, {
          method: "POST",
          headers: headersComuns,
          body: JSON.stringify({ orders: [orderId] }),
        });
        if (trkRes.ok) {
          const trkData = await trkRes.json();
          trackingInfo = trkData[orderId] || trkData[orderData.protocol] || null;
        }
      } catch (eTrk) {
        console.warn("[MelhorEnvio-Edge] Falha na consulta de tracking complementar:", eTrk);
      }

      // 4. Extração minuciosa do Código de Rastreio Oficial
      const codTracking = (orderData.tracking || trackingInfo?.tracking || "").trim();
      const codAuth = (orderData.authorization_code || trackingInfo?.authorization_code || "").trim();
      const codBarraJadlog = (orderData.additional_info?.volume?.[0]?.codbarra || "").trim();
      const codVolume = (orderData.volumes?.[0]?.tracking || "").trim();
      const codSelfTracking = (orderData.self_tracking || trackingInfo?.self_tracking || "").trim();

      // Prioridade: Código numérico Jadlog / Correios > Authorization Code > Self Tracking
      const codigoRastreioFinal =
        codTracking || codAuth || codVolume || codBarraJadlog || codSelfTracking || entrega?.codigo_rastreio || "";

      let linkRastreioFinal = "";
      if (codigoRastreioFinal) {
        linkRastreioFinal = `https://melhorrastreio.com.br/rastreio/${codigoRastreioFinal}`;
      } else if (codSelfTracking) {
        linkRastreioFinal = `https://melhorrastreio.com.br/rastreio/${codSelfTracking}`;
      }

      // 5. Mapeamento de Status Logístico (pedido_entregas)
      const rawStatus = (trackingInfo?.status || orderData.status || "").toLowerCase();
      let statusEnvioMapeado = "despachado";

      if (rawStatus === "delivered" || orderData.delivered_at) {
        statusEnvioMapeado = "entregue";
      } else if (rawStatus === "posted" || orderData.posted_at) {
        statusEnvioMapeado = "em_transito";
      } else if (rawStatus === "released" || rawStatus === "generated") {
        statusEnvioMapeado = "despachado";
      } else if (rawStatus === "canceled") {
        statusEnvioMapeado = "cancelado";
      }

      const atualizadoEm = new Date().toISOString();
      const dataPostagem = orderData.posted_at || (statusEnvioMapeado === "em_transito" ? (entrega?.despachado_em || atualizadoEm) : null);

      // 6. Atualiza o banco de dados Supabase
      if (pedidoId) {
        await supabaseAdmin
          .from("pedido_entregas")
          .update({
            codigo_rastreio: codigoRastreioFinal,
            link_rastreio: linkRastreioFinal,
            status_envio: statusEnvioMapeado,
            despachado_em: dataPostagem || entrega?.despachado_em || atualizadoEm,
            atualizado_em: atualizadoEm,
          })
          .eq("pedido_id", pedidoId);

        // NUNCA marcar pedidos.status como 'concluido' por sincronização da transportadora.
        // A conclusão da venda é uma operação comercial manual exclusiva do lojista no HUBI.
        const updatePedidoPayload: Record<string, any> = {
          codigo_rastreio: codigoRastreioFinal,
          link_rastreio: linkRastreioFinal,
          despachado_em: dataPostagem || pedido.despachado_em || atualizadoEm,
          metadados: {
            ...(pedido.metadados || {}),
            melhor_envio_order_id: orderId,
            melhor_envio_protocol: orderData.protocol,
            melhor_envio_status: rawStatus,
            melhor_envio_posted_at: orderData.posted_at,
            melhor_envio_delivered_at: orderData.delivered_at,
          },
          atualizado_em: atualizadoEm,
        };

        // Apenas evolui pedidos.status para 'entregue' se o pedido já estava 'enviado' e ainda não está concluído
        if (statusEnvioMapeado === "entregue" && pedido?.status === "enviado") {
          updatePedidoPayload.status = "entregue";
        }

        await supabaseAdmin
          .from("pedidos")
          .update(updatePedidoPayload)
          .eq("id", pedidoId);
      }

      console.log(`[MelhorEnvio-Edge] Sincronização concluída com sucesso! Rastreio: ${codigoRastreioFinal}, Status: ${statusEnvioMapeado}`);

      return new Response(
        JSON.stringify({
          sucesso: true,
          acao: "sincronizar_rastreio",
          ordem_id: String(orderId),
          protocolo: orderData.protocol,
          status_melhor_envio: rawStatus,
          status_envio: statusEnvioMapeado,
          status_pedido: statusPedidoMapeado,
          codigo_rastreio: codigoRastreioFinal,
          link_rastreio: linkRastreioFinal,
          link_etiqueta: entrega?.link_etiqueta || null,
          data_postagem: dataPostagem,
          data_entrega: orderData.delivered_at || null,
          transportadora: orderData.service?.company?.name || entrega?.transportadora_nome || "Jadlog",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -------------------------------------------------------------------------
    // 3. Validação e Sanitização de Documentos (from.document e to.document)
    // -------------------------------------------------------------------------
    // A. Remetente (from.document): Loja / Titular da Conta
    let docLoja = (loja?.numero_documento || "").replace(/\D/g, "");

    // Se a conta no Melhor Envio for Pessoa Física (CPF), o remetente exige estritamente CPF da conta
    if (meUser?.document_type === "cpf" && meUser?.document) {
      docLoja = String(meUser.document).replace(/\D/g, "");
    } else if (!validarDocumentoReceita(docLoja)) {
      if (meUser?.document) {
        docLoja = String(meUser.document).replace(/\D/g, "");
      } else if (isSandbox) {
        // No sandbox, utiliza o CPF homologado de testes
        docLoja = "45666490400";
      } else {
        return new Response(
          JSON.stringify({
            error: "A loja precisa de um CNPJ ou CPF válido cadastrado para emitir fretes no Melhor Envio. Atualize os dados da loja nas configurações.",
            code: "INVALID_SENDER_DOCUMENT",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // B. Destinatário (to.document): Cliente
    const cliente = pedido?.cliente;
    let docCliente = (cliente?.numero_documento || pedido?.cliente_documento_avulso || "").replace(/\D/g, "");
    if (!validarDocumentoReceita(docCliente)) {
      if (isSandbox) {
        // Fallback apenas se for ambiente de sandbox estrito e sem documento informado
        docCliente = "11144477735";
      } else {
        return new Response(
          JSON.stringify({
            error: "O CPF/CNPJ do cliente é obrigatório para emissão de frete via Melhor Envio.",
            code: "INVALID_RECEIVER_DOCUMENT",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (docCliente === docLoja) {
      if (isSandbox) {
        // No sandbox, se o lojista estiver testando consigo mesmo, usa CPF de destinatário de teste válido
        docCliente = "11144477735";
      } else {
        return new Response(
          JSON.stringify({
            error: "O CPF do destinatário não pode ser igual ao CPF do remetente no Melhor Envio.",
            code: "SAME_SENDER_RECEIVER_DOCUMENT",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // -------------------------------------------------------------------------
    // 4. Mapeamento de Produtos (products: name, quantity, unitary_value)
    // -------------------------------------------------------------------------
    let productsList: ProductItemCart[] = [];

    // Se o payload customizado veio com produtos já no formato correto
    if (customPayload?.products && Array.isArray(customPayload.products) && customPayload.products.length > 0) {
      productsList = customPayload.products.map((p: any, idx: number) => ({
        name: String(p.name || p.nome_produto || p.nome || `Item ${idx + 1}`).trim().substring(0, 50),
        quantity: Math.max(1, Math.round(Number(p.quantity || p.quantidade) || 1)),
        unitary_value: Number(p.unitary_value || p.preco_venda_unitario || p.preco_unitario || 10.00),
      }));
    } else if (itensPedido.length > 0) {
      productsList = itensPedido.map((it: any, idx: number) => ({
        name: String(it.nome_produto || it.nome || `Item ${idx + 1}`).trim().substring(0, 50),
        quantity: Math.max(1, Math.round(Number(it.quantidade) || 1)),
        unitary_value: Number(it.preco_venda_unitario || 10.00),
      }));
    } else {
      const valorTotal = Math.max(1, Number(pedido?.valor_total || 50.00));
      productsList = [
        {
          name: "Item de Pedido",
          quantity: 1,
          unitary_value: valorTotal,
        },
      ];
    }

    const valorTotalProdutos = productsList.reduce((acc, p) => acc + (p.unitary_value * p.quantity), 0);
    const valorSeguro = Math.max(Number(valorTotalProdutos.toFixed(2)) || 50.00, 1.00);
    const pesoTotal = 0.5;

    // -------------------------------------------------------------------------
    // 5. Montagem Rigorosa dos Nós from (Remetente / Loja) e to (Destinatário / Cliente)
    // -------------------------------------------------------------------------
    const dadosLoja = {
      nome_fantasia: loja?.nome_fantasia || (loja as any)?.nome_loja || '',
      razao_social: loja?.razao_social || '',
      telefone: configShipping?.origem_telefone || loja?.telefone || loja?.whatsapp || '',
      email: loja?.email || configShipping?.origem_email || 'contato@hubi.app',
      cnpj: (loja?.cnpj || loja?.numero_documento || '').replace(/\D/g, ''),
      cpf: (loja?.cpf || '').replace(/\D/g, ''),
      logradouro: configShipping?.origem_logradouro || loja?.endereco_logradouro || (loja as any)?.logradouro || 'Rua Bélgica',
      complemento: configShipping?.origem_complemento || loja?.endereco_complemento || (loja as any)?.complemento || '',
      numero: configShipping?.origem_numero || loja?.endereco_numero || (loja as any)?.numero || '945',
      bairro: configShipping?.origem_bairro || loja?.endereco_bairro || (loja as any)?.bairro || 'Maraponga',
      cidade: configShipping?.origem_cidade || loja?.endereco_cidade || (loja as any)?.cidade || 'Fortaleza',
      uf: (configShipping?.origem_uf || loja?.endereco_estado || (loja as any)?.uf || 'CE').toUpperCase().slice(0, 2),
      inscricao_estadual: loja?.inscricao_estadual || '',
      cep: (configShipping?.origem_cep || loja?.endereco_cep || (loja as any)?.cep || '60710790').replace(/\D/g, '')
    };

    let nomeRemetente = (dadosLoja.nome_fantasia || dadosLoja.razao_social || 'HOTAMAZON').trim();
    if (nomeRemetente.split(/\s+/).filter(Boolean).length < 2) {
      nomeRemetente = `${nomeRemetente} Loja`.trim();
    }

    // Garantir que os dados do destinatário venham EXCLUSIVAMENTE do endereço de entrega do pedido
    const cliente = pedido?.cliente || {};
    let endEntregaRaw: any = pedido?.endereco_entrega || entrega?.endereco || {};
    if (typeof endEntregaRaw === 'string') {
      const trimmed = endEntregaRaw.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try { endEntregaRaw = JSON.parse(trimmed); } catch {}
      } else if (trimmed) {
        const partes = trimmed.split(/,\s*|\s*-\s*/);
        const numMatch = trimmed.match(/(?:n[º°]|n\.|num|número)\s*(\d+[a-zA-Z]?|\bSN\b|\bS\/N\b)/i);
        const cepMatch = trimmed.match(/\b(\d{5})[-.\s]?(\d{3})\b/);
        const ufMatch = trimmed.match(/\b([A-Z]{2})\b/);
        endEntregaRaw = {
          logradouro: partes[0] || trimmed,
          numero: numMatch ? numMatch[1] : (partes[1] || 'SN'),
          bairro: partes[2] || '',
          cidade: partes[3] || '',
          uf: ufMatch ? ufMatch[1] : 'PE',
          cep: cepMatch ? `${cepMatch[1]}${cepMatch[2]}` : ''
        };
      }
    }

    const endEntrega = {
      destinatario: endEntregaRaw.destinatario || endEntregaRaw.nome || pedido?.cliente_nome_avulso || cliente?.nome || 'Cliente',
      logradouro: endEntregaRaw.logradouro || endEntregaRaw.rua || endEntregaRaw.address || entrega?.destino_logradouro || cliente?.endereco_logradouro || cliente?.logradouro || 'Rua Lindolfo Color',
      numero: endEntregaRaw.numero || endEntregaRaw.number || entrega?.destino_numero || cliente?.endereco_numero || cliente?.numero || 'SN',
      complemento: endEntregaRaw.complemento || endEntregaRaw.complement || entrega?.destino_complemento || cliente?.endereco_complemento || cliente?.complemento || '',
      bairro: endEntregaRaw.bairro || endEntregaRaw.district || entrega?.destino_bairro || cliente?.endereco_bairro || cliente?.bairro || 'Engenho do Meio',
      cidade: endEntregaRaw.cidade || endEntregaRaw.city || entrega?.destino_cidade || cliente?.endereco_cidade || cliente?.cidade || 'Recife',
      uf: (endEntregaRaw.uf || endEntregaRaw.estado || endEntregaRaw.state_abbr || entrega?.destino_uf || cliente?.endereco_estado || cliente?.uf || 'PE').toUpperCase().slice(0, 2),
      cep: (endEntregaRaw.cep || endEntregaRaw.postal_code || entrega?.destino_cep || cliente?.endereco_cep || cliente?.cep || '').replace(/\D/g, '')
    };

    let nomeCliente = (cliente.nome || endEntrega.destinatario || pedido?.cliente_nome_avulso || 'Cliente').trim();
    nomeCliente = nomeCliente.replace(/[\/":;,]/g, ' ').replace(/\s+/g, ' ').trim();
    if (nomeCliente.split(/\s+/).filter(Boolean).length < 2) {
      nomeCliente = `${nomeCliente} Cliente`.trim();
    }

    const sanitizarTexto = (txt?: string | null) => (txt || '').replace(/[\/":]/g, ' ').replace(/,{2,}/g, ',').replace(/\s+/g, ' ').trim();
    const sanitizarNum = (num?: string | null) => {
      const n = sanitizarTexto(num);
      return (!n || n.toUpperCase() === 'S/N' || n.toUpperCase() === 'SN') ? 'SN' : n.substring(0, 20);
    };

    const cepOrigem = (dadosLoja.cep || '60710790').replace(/\D/g, '');
    const cepDestino = (endEntrega.cep || '50730605').replace(/\D/g, '');

    const servicoCodigo = Number(entrega?.servico_codigo || customPayload?.service) || 1; // 1: PAC, 2: SEDEX, 3: Jadlog .Package, 4: .Com

    const fromPayload = {
      name: nomeRemetente,
      phone: (dadosLoja.telefone || '').replace(/\D/g, '') || '11999999999',
      email: dadosLoja.email || 'contato@hubi.app',
      document: (dadosLoja.cnpj || dadosLoja.cpf || docLoja).replace(/\D/g, ''),
      address: sanitizarTexto(dadosLoja.logradouro) || 'Rua Bélgica',
      complement: sanitizarTexto(dadosLoja.complemento).substring(0, 50),
      number: sanitizarNum(dadosLoja.numero) || '945',
      district: (sanitizarTexto(dadosLoja.bairro) || 'Maraponga').substring(0, 50),
      city: sanitizarTexto(dadosLoja.cidade) || 'Fortaleza',
      state_abbr: (dadosLoja.uf || 'CE').toUpperCase().slice(0, 2),
      state_register: dadosLoja.inscricao_estadual || '',
      postal_code: cepOrigem
    };

    const toPayload = {
      name: nomeCliente,
      phone: (cliente.telefone || cliente.whatsapp || pedido?.cliente_telefone_avulso || dadosLoja.telefone || '').replace(/\D/g, '') || '11999999999',
      email: cliente.email || pedido?.cliente_email_avulso || 'cliente@hubi.app',
      document: (cliente.cpf || cliente.cnpj || cliente.numero_documento || docCliente).replace(/\D/g, ''),
      address: sanitizarTexto(endEntrega.logradouro) || 'Rua Lindolfo Color',
      complement: sanitizarTexto(endEntrega.complemento).substring(0, 50),
      number: sanitizarNum(endEntrega.numero),
      district: (sanitizarTexto(endEntrega.bairro) || 'Engenho do Meio').substring(0, 50),
      city: sanitizarTexto(endEntrega.cidade) || 'Recife',
      state_abbr: (endEntrega.uf || 'PE').toUpperCase().slice(0, 2),
      state_register: '',
      postal_code: cepDestino
    };

    // -------------------------------------------------------------------------
    // Tratamento Condicional e Mutuamente Exclusivo de Volumes
    // -------------------------------------------------------------------------
    const pacMeta = pedido?.metadados?.pacote_envio || customPayload?.pacote || {};
    const dadosEmbalagem = {
      peso: Number(pacMeta.peso_kg || entrega?.peso_kg || customPayload?.package?.weight || customPayload?.volumes?.[0]?.weight || configShipping.embalagem_padrao_peso_kg || 0.5),
      largura: Number(pacMeta.largura_cm || entrega?.largura_cm || customPayload?.package?.width || customPayload?.volumes?.[0]?.width || configShipping.embalagem_padrao_largura_cm || 15),
      altura: Number(pacMeta.altura_cm || entrega?.altura_cm || customPayload?.package?.height || customPayload?.volumes?.[0]?.height || configShipping.embalagem_padrao_altura_cm || 10),
      comprimento: Number(pacMeta.comprimento_cm || entrega?.comprimento_cm || customPayload?.package?.length || customPayload?.volumes?.[0]?.length || configShipping.embalagem_padrao_comprimento_cm || 20),
      quantidade_volumes: Number(entrega?.quantidade_volumes || customPayload?.quantidade_volumes || (Array.isArray(customPayload?.volumes) && customPayload.volumes.length > 1 ? customPayload.volumes.length : 1)),
      volumes: Array.isArray(customPayload?.volumes) && customPayload.volumes.length > 0 ? customPayload.volumes : null,
    };

    // caixas/volumes recebidos da tela de conferência de volumes
    const listaVolumes = Array.isArray(dadosEmbalagem?.volumes) && dadosEmbalagem.volumes.length > 0
      ? dadosEmbalagem.volumes
      : (dadosEmbalagem?.quantidade_volumes > 1
          ? Array.from({ length: dadosEmbalagem.quantidade_volumes }, () => ({ ...dadosEmbalagem }))
          : null);

    const payloadCart: Record<string, any> = {
      service: servicoCodigo,
      agency: null,
      from: fromPayload,
      to: toPayload,
      products: productsList,
      options: {
        insurance_value: Number(valorSeguro.toFixed(2) || 50.00),
        receipt: false,
        own_hand: false,
        reverse: false,
        non_commercial: true
      }
    };

    const ehCorreios = servicoCodigo === 1 || servicoCodigo === 2;

    if (ehCorreios) {
      // Caso a transportadora seja Correios (serviços 1 ou 2), não permita múltiplos volumes, consolidando tudo em um único "package"
      let pesoConsolidado = dadosEmbalagem.peso;
      let alturaConsolidada = dadosEmbalagem.altura;
      let larguraConsolidada = dadosEmbalagem.largura;
      let compConsolidado = dadosEmbalagem.comprimento;

      if (listaVolumes && listaVolumes.length > 1) {
        pesoConsolidado = listaVolumes.reduce((acc: number, c: any) => acc + Number(c.peso || c.weight || 0.5), 0);
        alturaConsolidada = listaVolumes.reduce((acc: number, c: any) => acc + Number(c.altura || c.height || 10), 0);
        larguraConsolidada = Math.max(...listaVolumes.map((c: any) => Number(c.largura || c.width || 15)));
        compConsolidado = Math.max(...listaVolumes.map((c: any) => Number(c.comprimento || c.length || 20)));
      }

      payloadCart.package = {
        weight: Number(Math.max(0.1, pesoConsolidado).toFixed(2)),
        width: Math.max(11, Math.round(Number(larguraConsolidada || 15))),
        height: Math.max(4, Math.round(Number(alturaConsolidada || 10))),
        length: Math.max(16, Math.round(Number(compConsolidado || 20)))
      };
      delete payloadCart.volumes;
    } else if (listaVolumes && listaVolumes.length > 1) {
      // MÚLTIPLOS VOLUMES: usa exclusivamente 'volumes'
      payloadCart.volumes = listaVolumes.map((c: any) => ({
        weight: Number(Math.max(0.1, Number(c.peso || c.weight || 0.5)).toFixed(2)),
        width: Math.max(11, Math.round(Number(c.largura || c.width || 15))),
        height: Math.max(4, Math.round(Number(c.altura || c.height || 10))),
        length: Math.max(16, Math.round(Number(c.comprimento || c.length || 20)))
      }));
      delete payloadCart.package;
    } else {
      // VOLUME ÚNICO: usa exclusivamente 'package'
      const c = (listaVolumes && listaVolumes[0]) || dadosEmbalagem;
      payloadCart.package = {
        weight: Number(Math.max(0.1, Number(c?.peso || c?.weight || 0.5)).toFixed(2)),
        width: Math.max(11, Math.round(Number(c?.largura || c?.width || 15))),
        height: Math.max(4, Math.round(Number(c?.altura || c?.height || 10))),
        length: Math.max(16, Math.round(Number(c?.comprimento || c?.length || 20)))
      };
      delete payloadCart.volumes;
    }

    // -------------------------------------------------------------------------
    // PASSO 1: Adicionar ao Carrinho (POST /api/v2/me/cart)
    // -------------------------------------------------------------------------
    console.log('[ME-Despacho][1-Cart] Enviando payload:', JSON.stringify(payloadCart, null, 2));
    const resCart = await fetch(`${baseUrl}/api/v2/me/cart`, {
      method: "POST",
      headers: headersComuns,
      body: JSON.stringify(payloadCart),
    });

    const cartResponseText = await resCart.text();
    let cartData: any;
    try { cartData = JSON.parse(cartResponseText); } catch { cartData = cartResponseText; }
    console.log('[ME-Despacho][1-Cart] Status:', resCart.status, 'Resposta:', cartResponseText);

    if (!resCart.ok) {
      let msgAmigavel = `Erro ao criar envio no Melhor Envio (Código ${resCart.status})`;
      try {
        if (cartData && typeof cartData === 'object') {
          if (cartData.message) msgAmigavel = cartData.message;
          if (cartData.error) msgAmigavel = cartData.error;
          if (cartData.errors) {
            const det = Object.entries(cartData.errors)
              .map(([campo, errs]: [string, any]) => `${campo}: ${Array.isArray(errs) ? errs.join(", ") : errs}`)
              .join("; ");
            msgAmigavel += ` (${det})`;
          }
        }
      } catch {
        msgAmigavel += `: ${cartResponseText}`;
      }

      console.error("[MelhorEnvio-Edge] Erro no cart:", cartResponseText);
      return new Response(
        JSON.stringify({
          sucesso: false,
          error: msgAmigavel,
          erro: `Falha na etapa 1-Cart: ${msgAmigavel}`,
          code: "MELHOR_ENVIO_CART_ERROR",
          status: resCart.status,
          debug_cart: cartData,
          motivo_real_api: {
            status_cart: resCart.status,
            retorno_cart: cartData,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orderId = String(cartData.id);
    console.log(`[MelhorEnvio-Edge] Ordem criada no carrinho com ID: ${orderId}`);

    // -------------------------------------------------------------------------
    // PASSO 2: Checkout / Compra do Frete (POST /api/v2/me/shipment/checkout)
    // -------------------------------------------------------------------------
    console.log('[ME-Despacho][2-Checkout] Enviando orders:', [orderId]);
    const resCheckout = await fetch(`${baseUrl}/api/v2/me/shipment/checkout`, {
      method: "POST",
      headers: headersComuns,
      body: JSON.stringify({ orders: [orderId] }),
    });

    const checkoutResponseText = await resCheckout.text();
    let checkoutData: any;
    try { checkoutData = JSON.parse(checkoutResponseText); } catch { checkoutData = checkoutResponseText; }
    console.log('[ME-Despacho][2-Checkout] Status:', resCheckout.status, 'Resposta:', checkoutResponseText);

    if (!resCheckout.ok) {
      console.warn("[MelhorEnvio-Edge] Resposta do checkout:", checkoutResponseText);

      let msgCheckout = "Erro ao comprar a etiqueta no Melhor Envio.";
      if (checkoutResponseText.toLowerCase().includes("saldo") || checkoutResponseText.toLowerCase().includes("wallet")) {
        msgCheckout = "Saldo insuficiente na carteira do Melhor Envio para gerar a etiqueta. Adicione créditos no painel do Melhor Envio.";
      }

      return new Response(
        JSON.stringify({
          sucesso: false,
          error: msgCheckout,
          erro: `Falha na etapa 2-Checkout: ${msgCheckout}`,
          code: "MELHOR_ENVIO_CHECKOUT_FAILED",
          ordem_id: String(orderId),
          debug_cart: cartData,
          debug_checkout: checkoutData,
          motivo_real_api: {
            status_cart: resCart.status,
            retorno_cart: cartData,
            status_checkout: resCheckout.status,
            retorno_checkout: checkoutData,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delay de 2 segundos antes de chamar /api/v2/me/shipment/generate
    await new Promise((r) => setTimeout(r, 2000));

    // -------------------------------------------------------------------------
    // PASSO 3: Solicitar Geração da Etiqueta (POST /api/v2/me/shipment/generate)
    // -------------------------------------------------------------------------
    console.log('[ME-Despacho][3-Generate] Enviando orders:', [orderId]);
    let generateLiberado = false;
    let generateMensagem = "";

    const resGenerate = await fetch(`${baseUrl}/api/v2/me/shipment/generate`, {
      method: "POST",
      headers: headersComuns,
      body: JSON.stringify({ orders: [orderId] }),
    });
    const generateResponseText = await resGenerate.text();
    let generateData: any;
    try { generateData = JSON.parse(generateResponseText); } catch { generateData = generateResponseText; }
    console.log('[Generate Response]', generateResponseText);
    console.log('[ME-Despacho][3-Generate] Status:', resGenerate.status, 'Resposta:', generateResponseText);

    // Tratamento crítico na resposta da geração:
    const genLower = (generateResponseText || "").toLowerCase();
    const ehMensagemSucessoAssincrono =
      genLower.includes("encaminhado para gera") ||
      genLower.includes("fila de processamento") ||
      (genLower.includes("processo de geração") && genLower.includes("sucesso"));

    if (ehMensagemSucessoAssincrono) {
      generateLiberado = true;
    } else if (generateData && typeof generateData === 'object') {
      const orderResult = generateData[orderId] || generateData[Object.keys(generateData)[0]];
      if (orderResult && typeof orderResult === 'object') {
        if (orderResult.status === true || orderResult.status === 'released' || orderResult.status === 'generated') {
          generateLiberado = true;
        } else {
          generateLiberado = false;
          generateMensagem = orderResult.message || orderResult.error || "Geração não liberada pela transportadora";
        }
      } else if (generateData.status === true) {
        generateLiberado = true;
      } else if (generateData.status === false) {
        generateLiberado = false;
        generateMensagem = generateData.message || generateData.error || "Geração recusada pelo Melhor Envio";
      } else if (generateData.message) {
        if (genLower.includes("erro") || genLower.includes("falha") || genLower.includes("rejeit") || genLower.includes("não possível")) {
          generateLiberado = false;
          generateMensagem = generateData.message;
        } else {
          generateLiberado = true;
        }
      } else if (resGenerate.ok) {
        generateLiberado = true;
      }
    } else if (resGenerate.ok) {
      generateLiberado = true;
    }

    // Se a geração falhar ou retornar qualquer mensagem de recusa, retorne no corpo da Edge Function para o Frontend
    if (!generateLiberado) {
      console.error("[MelhorEnvio-Edge] Recusa na geração pela API:", generateData);
      return new Response(
        JSON.stringify({
          sucesso: false,
          ordem_id: String(orderId),
          erro: `Recusa na geração da etiqueta: ${generateMensagem || (typeof generateData === 'string' ? generateData : JSON.stringify(generateData))}`,
          error: `Recusa na geração da etiqueta: ${generateMensagem || (typeof generateData === 'string' ? generateData : JSON.stringify(generateData))}`,
          motivo_real_api: {
            status_cart: resCart.status,
            retorno_cart: cartData,
            status_checkout: resCheckout.status,
            retorno_checkout: checkoutData,
            status_generate: resGenerate.status,
            retorno_generate: generateData
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // -------------------------------------------------------------------------
    // PASSO 4: Obter URL de Impressão da Etiqueta (POST /api/v2/me/shipment/print)
    // No Sandbox, só chama print se generate retornou sucesso na liberação.
    // -------------------------------------------------------------------------
    let linkEtiqueta: string | null = null;
    let debugPrint: any = null;

    if (generateLiberado) {
      // Aguarda o processamento assíncrono do Melhor Envio
      await new Promise((resolve) => setTimeout(resolve, 2000));
      console.log('[ME-Despacho][4-Print] Solicitando impressao para:', [orderId]);
      try {
        const printRes = await fetch(`${baseUrl}/api/v2/me/shipment/print`, {
          method: "POST",
          headers: headersComuns,
          body: JSON.stringify({ mode: "public", orders: [orderId] }),
        });
        const printText = await printRes.clone().text();
        console.log('[ME-Despacho][4-Print] Status:', printRes.status, 'Resposta:', printText);
        try { debugPrint = JSON.parse(printText); } catch { debugPrint = printText; }

        if (printRes.ok && debugPrint && typeof debugPrint === 'object') {
          if (debugPrint?.url && !debugPrint.url.includes('/painel/envios')) {
            linkEtiqueta = debugPrint.url;
          }
        }
      } catch (ePrint: any) {
        console.warn("[ME-Despacho][4-Print] Exceção ao imprimir:", ePrint);
        debugPrint = ePrint?.message || String(ePrint);
      }
    } else {
      console.warn(`[ME-Despacho][4-Print] Geração não confirmada ou pendente: "${generateMensagem || 'não liberado'}". Chamada de print cancelada.`);
      debugPrint = {
        pulado: true,
        motivo: generateMensagem || "Etiqueta ainda não liberada no Melhor Envio",
      };
      linkEtiqueta = null;
    }

    // -------------------------------------------------------------------------
    // PASSO 5: Obter Código de Rastreamento Real com Retry Polling (GET /api/v2/me/orders/${orderId})
    // -------------------------------------------------------------------------
    let codigoRastreio = "";
    let linkRastreioOficial = "";
    let statusEnvioTransportadora = "despachado";
    let statusOrdemME = "";

    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      try {
        console.log(`[MelhorEnvio-Edge] Consultando dados da ordem ${orderId} (tentativa ${tentativa}/4)...`);
        const orderRes = await fetch(`${baseUrl}/api/v2/me/orders/${orderId}`, {
          method: "GET",
          headers: headersComuns,
        });

        if (orderRes.ok) {
          const orderData = await orderRes.json();
          statusOrdemME = (orderData.status || "").toLowerCase();

          const selfTracking = (orderData.self_tracking || "").trim(); // ex: ME26006DUM4BR
          const tracking = (orderData.tracking || "").trim(); // ex: 830803761 ou QB123456789BR
          const codAuth = (orderData.authorization_code || "").trim();
          const codVolume = (orderData.volumes?.[0]?.tracking || "").trim();
          const codBarraJadlog = (orderData.additional_info?.volume?.[0]?.codbarra || "").trim();

          if (orderData.status === "delivered" || orderData.delivered_at) {
            statusEnvioTransportadora = "entregue";
          } else if (orderData.status === "posted" || orderData.posted_at) {
            statusEnvioTransportadora = "em_transito";
          } else if (orderData.status === "released" || orderData.status === "generated") {
            statusEnvioTransportadora = "despachado";
          }

          // Prioridade: tracking oficial (ex: código numérico Jadlog 830803761) > authorization_code > volumes > self_tracking > protocol
          codigoRastreio = tracking || codAuth || codVolume || codBarraJadlog || selfTracking || orderData.protocol || "";

          if (codigoRastreio) {
            linkRastreioOficial = `https://melhorrastreio.com.br/rastreio/${codigoRastreio}`;
            console.log(`[MelhorEnvio-Edge] Código de rastreio obtido com sucesso: ${codigoRastreio}`);
            break;
          }
        }
      } catch (eOrder) {
        console.warn(`[MelhorEnvio-Edge] Erro na tentativa ${tentativa} de consulta da ordem:`, eOrder);
      }

      if (tentativa < 4) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }

    // Fallback: se ainda assim não preencheu, tenta no cartData
    if (!codigoRastreio) {
      codigoRastreio = cartData.tracking || cartData.authorization_code || cartData.self_tracking || cartData.protocol || "";
    }

    if (!linkRastreioOficial && codigoRastreio) {
      linkRastreioOficial = `https://melhorrastreio.com.br/rastreio/${codigoRastreio}`;
    }

    // Se a etiqueta ainda não estiver pronta (status !== 'released'), marque link_etiqueta = null
    // e não interrompa a persistência do código de rastreio já gerado.
    if (statusOrdemME && statusOrdemME !== 'released') {
      console.log(`[MelhorEnvio-Edge] Ordem com status '${statusOrdemME}'. link_etiqueta definido como null até ser released.`);
      linkEtiqueta = null;
    }

    const despachadoEm = new Date().toISOString();

    // -------------------------------------------------------------------------
    // PASSO 6: Atualizar Banco de Dados Supabase (pedido_entregas & pedidos)
    // NUNCA sobrescrever transportadora_nome ou nome_transportadora se já existirem!
    // -------------------------------------------------------------------------
    if (pedidoId) {
      // 1. Atualiza pedido_entregas estritamente com os dados de envio
      const updateEntregaPayload: Record<string, any> = {
        codigo_rastreio: String(codigoRastreio || ""),
        link_rastreio: linkRastreioOficial || null,
        link_etiqueta: linkEtiqueta || null,
        status_envio: statusEnvioTransportadora,
        despachado_em: despachadoEm,
        despachado_por: usuarioId || null,
        atualizado_em: despachadoEm,
      };

      await supabaseAdmin
        .from("pedido_entregas")
        .update(updateEntregaPayload)
        .eq("pedido_id", pedidoId);

      // 2. Atualiza pedidos (preservando rigorosamente status 'concluido' ou 'cancelado' e nome_transportadora)
      const { data: pedDbME } = await supabaseAdmin.from("pedidos").select("status").eq("id", pedidoId).maybeSingle();
      const statusFinal = (pedDbME?.status === "concluido" || pedido?.status === "concluido")
        ? "concluido"
        : (pedDbME?.status === "cancelado" || pedido?.status === "cancelado")
          ? "cancelado"
          : (statusEnvioTransportadora === "entregue" ? "entregue" : "enviado");

      await supabaseAdmin
        .from("pedidos")
        .update({
          status: statusFinal,
          codigo_rastreio: String(codigoRastreio || ""),
          link_rastreio: linkRastreioOficial || null,
          despachado_em: despachadoEm,
          despachado_por: usuarioId || null,
          metadados: {
            ...(pedido.metadados || {}),
            melhor_envio_order_id: String(orderId),
            melhor_envio_status: statusOrdemME || undefined,
          },
          atualizado_em: despachadoEm,
        })
        .eq("id", pedidoId);
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        ordem_id: String(orderId),
        orderId: String(orderId),
        codigo_rastreio: String(codigoRastreio || ""),
        debug_cart: cartData,
        debug_checkout: checkoutData,
        debug_generate: generateData,
        debug_print: debugPrint,
        motivo_real_api: {
          status_cart: resCart.status,
          retorno_cart: cartData,
          status_checkout: resCheckout.status,
          retorno_checkout: checkoutData,
          status_generate: resGenerate.status,
          retorno_generate: generateData
        },
        mensagem_geracao: generateMensagem || undefined,
        link_etiqueta: linkEtiqueta,
        link_rastreio: linkRastreioOficial,
        status_melhor_envio: statusOrdemME || "criado",
        transportadora: entrega?.transportadora_nome || "Melhor Envio",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[MelhorEnvio-Edge] Exceção capturada:", err);
    return new Response(
      JSON.stringify({
        sucesso: false,
        error: err.message || "Erro inesperado ao processar despacho no Melhor Envio.",
        erro: `Falha geral no despacho: ${err.message || "Erro inesperado"}`,
        code: "INTERNAL_ERROR_HANDLED",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
