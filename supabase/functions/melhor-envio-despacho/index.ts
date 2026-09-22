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
    // 4. Mapeamento de Produtos (products: name, quantity, unitary_value, weight)
    // -------------------------------------------------------------------------
    let productsList: ProductItemCart[] = [];

    // Se o payload customizado veio com produtos já no formato correto
    if (customPayload?.products && Array.isArray(customPayload.products) && customPayload.products.length > 0) {
      productsList = customPayload.products.map((p: any, idx: number) => ({
        name: String(p.name || p.nome_produto || p.nome || `Produto ${idx + 1}`).trim().slice(0, 100),
        quantity: Math.max(1, Math.round(Number(p.quantity || p.quantidade) || 1)),
        unitary_value: Math.max(0.01, Number(p.unitary_value || p.preco_venda_unitario || p.preco_unitario || p.insurance_value || 1.00)),
        weight: Math.max(0.1, Number(p.weight || p.peso_kg || 0.3)),
      }));
    } else if (itensPedido.length > 0) {
      productsList = itensPedido.map((it: any, idx: number) => ({
        name: String(it.nome_produto || it.nome || `Produto ${idx + 1}`).trim().slice(0, 100),
        quantity: Math.max(1, Math.round(Number(it.quantidade) || 1)),
        unitary_value: Math.max(0.01, Number(it.preco_venda_unitario || 1.00)),
        weight: Math.max(0.1, Number(it.peso_kg || 0.3)),
      }));
    } else {
      const valorTotal = Math.max(1, Number(pedido?.valor_total || 1.00));
      productsList = [
        {
          name: "Mercadoria Comercial",
          quantity: 1,
          unitary_value: valorTotal,
          weight: 0.5,
        },
      ];
    }

    const valorSeguro = productsList.reduce((acc, p) => acc + (p.unitary_value * p.quantity), 0);
    const pesoTotal = productsList.reduce((acc, p) => acc + ((p.weight || 0.3) * p.quantity), 0);

    // -------------------------------------------------------------------------
    // 5. Montagem do cartPayload Oficial
    // -------------------------------------------------------------------------
    const cepOrigem = limparCep(
      configShipping?.origem_cep ||
      loja?.endereco_cep ||
      customPayload?.from?.postal_code ||
      extrairCepDeTexto(loja?.endereco_logradouro)
    );

    const cepDestino = limparCep(
      entrega?.destino_cep ||
      customPayload?.to?.postal_code ||
      cliente?.cep ||
      extrairCepDeTexto(pedido?.endereco_entrega)
    );

    if (cepOrigem.length !== 8 || cepDestino.length !== 8) {
      return new Response(
        JSON.stringify({
          error: "CEP de origem ou destino inválido. Verifique o endereço de entrega do pedido.",
          code: "INVALID_POSTAL_CODE",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clienteNome = pedido?.cliente_nome_avulso || cliente?.nome || customPayload?.to?.name || "Cliente";
    const clienteTel = limparTelefone(cliente?.whatsapp || cliente?.telefone || pedido?.cliente_telefone_avulso || customPayload?.to?.phone);
    const clienteEmail = cliente?.email || pedido?.cliente_email_avulso || customPayload?.to?.email || "cliente@hubi.app";

    const lojaNome = loja?.nome_fantasia || loja?.nome_loja || customPayload?.from?.name || "HUBI PDV";
    const lojaTel = limparTelefone(loja?.whatsapp || loja?.telefone || customPayload?.from?.phone);
    const lojaEmail = loja?.email || customPayload?.from?.email || "contato@hubi.app";

    const servicoCodigo = Number(entrega?.servico_codigo || customPayload?.service) || 1; // 1: PAC, 2: SEDEX, 3: Jadlog .Package, 4: .Com

    const cartPayload = {
      service: servicoCodigo,
      agency: null,
      from: {
        name: lojaNome,
        phone: lojaTel,
        email: lojaEmail,
        document: docLoja,
        address: configShipping.origem_logradouro || loja?.endereco_logradouro || customPayload?.from?.address || "Rua",
        complement: configShipping.origem_complemento || customPayload?.from?.complement || "",
        number: configShipping.origem_numero || loja?.endereco_numero || customPayload?.from?.number || "S/N",
        district: configShipping.origem_bairro || loja?.endereco_bairro || customPayload?.from?.district || "Bairro",
        city: configShipping.origem_cidade || loja?.endereco_cidade || customPayload?.from?.city || "Cidade",
        state_abbr: (configShipping.origem_uf || loja?.endereco_estado || customPayload?.from?.state_abbr || "SP").toUpperCase(),
        postal_code: cepOrigem,
      },
      to: {
        name: clienteNome,
        phone: clienteTel,
        email: clienteEmail,
        document: docCliente,
        address: entrega?.destino_logradouro || customPayload?.to?.address || "Rua",
        complement: entrega?.destino_complemento || customPayload?.to?.complement || "",
        number: entrega?.destino_numero || customPayload?.to?.number || "S/N",
        district: entrega?.destino_bairro || customPayload?.to?.district || "Bairro",
        city: entrega?.destino_cidade || customPayload?.to?.city || "Cidade",
        state_abbr: (entrega?.destino_uf || customPayload?.to?.state_abbr || "SP").toUpperCase(),
        postal_code: cepDestino,
      },
      products: productsList,
      volumes: [
        {
          height: 10,
          width: 15,
          length: 20,
          weight: Math.max(0.1, Number(pesoTotal.toFixed(2))),
        },
      ],
      options: {
        insurance_value: Number(valorSeguro.toFixed(2)),
        receipt: false,
        own_hand: false,
        reverse: false,
        non_commercial: true,
      },
    };

    // -------------------------------------------------------------------------
    // PASSO 1: Adicionar ao Carrinho (POST /api/v2/me/cart)
    // -------------------------------------------------------------------------
    console.log(`[MelhorEnvio-Edge] Inserindo no carrinho (${baseUrl}/api/v2/me/cart)...`);
    const cartRes = await fetch(`${baseUrl}/api/v2/me/cart`, {
      method: "POST",
      headers: headersComuns,
      body: JSON.stringify(cartPayload),
    });

    if (!cartRes.ok) {
      const errBody = await cartRes.text();
      let msgAmigavel = `Erro ao criar envio no Melhor Envio (Código ${cartRes.status})`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed.message) msgAmigavel = parsed.message;
        if (parsed.error) msgAmigavel = parsed.error;
        if (parsed.errors) {
          const det = Object.entries(parsed.errors)
            .map(([campo, errs]: [string, any]) => `${campo}: ${Array.isArray(errs) ? errs.join(", ") : errs}`)
            .join("; ");
          msgAmigavel += ` (${det})`;
        }
      } catch {
        msgAmigavel += `: ${errBody}`;
      }

      console.error("[MelhorEnvio-Edge] Erro no cart:", errBody);
      return new Response(
        JSON.stringify({
          error: msgAmigavel,
          code: "MELHOR_ENVIO_CART_ERROR",
          status: cartRes.status,
        }),
        { status: cartRes.status >= 500 ? 502 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cartData = await cartRes.json();
    const orderId = cartData.id;
    console.log(`[MelhorEnvio-Edge] Ordem criada no carrinho com ID: ${orderId}`);

    // -------------------------------------------------------------------------
    // PASSO 2: Checkout / Compra do Frete (POST /api/v2/me/shipment/checkout)
    // -------------------------------------------------------------------------
    console.log(`[MelhorEnvio-Edge] Executando checkout da ordem ${orderId}...`);
    const checkoutRes = await fetch(`${baseUrl}/api/v2/me/shipment/checkout`, {
      method: "POST",
      headers: headersComuns,
      body: JSON.stringify({ orders: [orderId] }),
    });

    if (!checkoutRes.ok) {
      const checkoutErr = await checkoutRes.text();
      console.warn("[MelhorEnvio-Edge] Resposta do checkout:", checkoutErr);

      let msgCheckout = "Erro ao comprar a etiqueta no Melhor Envio.";
      if (checkoutErr.toLowerCase().includes("saldo") || checkoutErr.toLowerCase().includes("wallet")) {
        msgCheckout = "Saldo insuficiente na carteira do Melhor Envio para gerar a etiqueta. Adicione créditos no painel do Melhor Envio.";
      }

      return new Response(
        JSON.stringify({
          error: msgCheckout,
          code: "MELHOR_ENVIO_CHECKOUT_FAILED",
          ordem_id: String(orderId),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -------------------------------------------------------------------------
    // PASSO 3: Solicitar Geração da Etiqueta (POST /api/v2/me/shipment/generate)
    // -------------------------------------------------------------------------
    console.log(`[MelhorEnvio-Edge] Solicitando geração da etiqueta para ${orderId}...`);
    await fetch(`${baseUrl}/api/v2/me/shipment/generate`, {
      method: "POST",
      headers: headersComuns,
      body: JSON.stringify({ orders: [orderId] }),
    }).catch((e) => console.warn("[MelhorEnvio-Edge] generate catch:", e));

    // -------------------------------------------------------------------------
    // PASSO 4: Obter URL de Impressão da Etiqueta (POST /api/v2/me/shipment/print)
    // -------------------------------------------------------------------------
    let linkEtiqueta = `${baseUrl}/painel/envios`;
    try {
      const printRes = await fetch(`${baseUrl}/api/v2/me/shipment/print`, {
        method: "POST",
        headers: headersComuns,
        body: JSON.stringify({ mode: "public", orders: [orderId] }),
      });
      if (printRes.ok) {
        const printData = await printRes.json();
        if (printData.url) linkEtiqueta = printData.url;
      }
    } catch (ePrint) {
      console.warn("[MelhorEnvio-Edge] Erro ao obter URL direta de impressão:", ePrint);
    }

    // -------------------------------------------------------------------------
    // PASSO 5: Obter Código de Rastreamento Real da Transportadora (GET /api/v2/me/orders/${orderId})
    // -------------------------------------------------------------------------
    let codigoRastreio = "";
    let linkRastreioOficial = "";
    let transportadoraNome = entrega?.transportadora_nome || "Melhor Envio";

    try {
      const orderRes = await fetch(`${baseUrl}/api/v2/me/orders/${orderId}`, {
        method: "GET",
        headers: headersComuns,
      });
      if (orderRes.ok) {
        const orderData = await orderRes.json();
        if (orderData.service?.company?.name) {
          transportadoraNome = orderData.service.company.name;
        }

        const selfTracking = orderData.self_tracking; // ex: ME26006DUK4BR (código reconhecido no Melhor Rastreio)
        const tracking = orderData.tracking; // ex: QB123456789BR (Correios)
        const codBarraJadlog = orderData.additional_info?.volume?.[0]?.codbarra; // remessa Jadlog

        // Prioridade para rastreio:
        // 1. tracking oficial da transportadora (se preenchido)
        // 2. self_tracking gerado pelo Melhor Envio (ME...BR)
        // 3. código de barras da minuta do volume (Jadlog)
        // NOTA: NUNCA usar protocol (ORD-...) como código de rastreamento!
        codigoRastreio = tracking || selfTracking || codBarraJadlog || "";

        if (selfTracking) {
          linkRastreioOficial = `https://melhorrastreio.com.br/rastreio/${selfTracking}`;
        } else if (tracking) {
          linkRastreioOficial = `https://melhorrastreio.com.br/rastreio/${tracking}`;
        } else if (codBarraJadlog) {
          linkRastreioOficial = `https://www.jadlog.com.br/tracking`;
        }
      }
    } catch (eOrder) {
      console.warn("[MelhorEnvio-Edge] Erro ao consultar dados atualizados da ordem:", eOrder);
    }

    if (!codigoRastreio) {
      codigoRastreio = cartData.tracking || cartData.self_tracking || "";
    }

    if (!linkRastreioOficial && codigoRastreio) {
      linkRastreioOficial = `https://melhorrastreio.com.br/rastreio/${codigoRastreio}`;
    }

    const despachadoEm = new Date().toISOString();

    // -------------------------------------------------------------------------
    // PASSO 6: Atualizar Banco de Dados Supabase (pedido_entregas & pedidos)
    // -------------------------------------------------------------------------
    if (pedidoId) {
      // 1. Atualiza pedido_entregas
      await supabaseAdmin
        .from("pedido_entregas")
        .update({
          codigo_rastreio: String(codigoRastreio),
          link_rastreio: linkRastreioOficial,
          link_etiqueta: linkEtiqueta,
          status_envio: "despachado",
          despachado_em: despachadoEm,
          despachado_por: usuarioId || null,
          atualizado_em: despachadoEm,
        })
        .eq("pedido_id", pedidoId);

      // 2. Atualiza pedidos
      await supabaseAdmin
        .from("pedidos")
        .update({
          status: "enviado",
          codigo_rastreio: String(codigoRastreio),
          link_rastreio: linkRastreioOficial,
          despachado_em: despachadoEm,
          despachado_por: usuarioId || null,
          atualizado_em: despachadoEm,
        })
        .eq("id", pedidoId);
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        ordem_id: String(orderId),
        codigo_rastreio: String(codigoRastreio),
        link_etiqueta: linkEtiqueta,
        link_rastreio: linkRastreioOficial,
        transportadora: entrega?.transportadora_nome || "Melhor Envio",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[MelhorEnvio-Edge] Exceção não tratada:", err);
    return new Response(
      JSON.stringify({
        error: err.message || "Erro inesperado ao processar despacho no Melhor Envio.",
        code: "INTERNAL_SERVER_ERROR",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
