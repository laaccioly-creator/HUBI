// Supabase Edge Function: whatsapp-webhook
// Endpoint público para recebimento de webhooks da Meta Cloud API (WhatsApp Business)
// Deploy: npx supabase functions deploy whatsapp-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declaração global para suporte a background tasks no Supabase Deno EdgeRuntime
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<any>) => void;
} | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

/**
 * Normaliza o número de telefone para evitar formatações divergentes
 */
function normalizarTelefone(numero: string): string {
  return (numero || '').replace(/\D/g, '');
}

serve(async (req: Request) => {
  // Tratar pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // ============================================================================
  // 1. HANDSHAKE / VERIFICAÇÃO DO WEBHOOK (GET)
  // ============================================================================
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // Token padrão do ambiente ou verificação geral
    const verifyTokenEsperado = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "hubi_whatsapp_webhook_token";

    if (mode === "subscribe" && token) {
      if (token === verifyTokenEsperado) {
        return new Response(challenge || "", {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/plain" }
        });
      }

      // Se for diferente do token global, verificar se existe alguma loja com esse verify token
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

        const { data: loja } = await supabaseAdmin
          .from("lojas")
          .select("id")
          .eq("meta_verify_token", token)
          .maybeSingle();

        if (loja) {
          return new Response(challenge || "", {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "text/plain" }
          });
        }
      } catch (err: any) {
        console.error("[WhatsAppWebhook] Erro ao validar handshake com banco:", err?.message);
      }

      return new Response("Forbidden: Invalid verify token", { status: 403, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({ status: "active", service: "HUBI WhatsApp IA Webhook" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ============================================================================
  // 2. RECEBIMENTO DE EVENTOS E MENSAGENS (POST)
  // ============================================================================
  if (req.method === "POST") {
    let payload: any = {};
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
    }

    // Processamento em Background com EdgeRuntime.waitUntil para resposta < 5 segundos à Meta
    const processamentoPromise = processarEventoWhatsApp(payload).catch((err) => {
      console.error("[WhatsAppWebhook] Erro no processamento assíncrono:", err?.message || err);
    });

    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(processamentoPromise);
    }

    // Retorna imediatamente HTTP 200 OK para satisfazer a Meta Cloud API
    return new Response(JSON.stringify({ status: "received" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});

/**
 * Função executada em segundo plano para roteamento, IA e despacho
 */
async function processarEventoWhatsApp(payload: any) {
  const entry = payload?.entry?.[0];
  const changes = entry?.changes?.[0]?.value;

  // Ignorar notificações que não sejam de mensagens (ex: statuses sent, delivered, read)
  const message = changes?.messages?.[0];
  if (!message) {
    return;
  }

  const wamid = message.id; // Identificador exclusivo da Meta (wamid.HBg...)
  const metaPhoneNumberId = changes?.metadata?.phone_number_id;
  const fromCliente = normalizarTelefone(message.from);
  const nomeCliente = changes?.contacts?.[0]?.profile?.name || "";

  // Extrair texto da mensagem (suporte a texto simples, botões ou cliques interativos)
  const textoMensagem = (
    message.text?.body ||
    message.button?.text ||
    message.interactive?.button_reply?.title ||
    message.interactive?.list_reply?.title ||
    ""
  ).trim();

  if (!wamid || !metaPhoneNumberId || !fromCliente) {
    return;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

  // 1. Identificar o Tenant correspondente pelo Phone Number ID
  const { data: loja, error: lojaError } = await supabaseAdmin
    .from("lojas")
    .select(`
      id,
      nome_fantasia,
      slug_catalogo,
      ia_whatsapp_ativa,
      pausar_ao_atingir_limite,
      limite_mensal_alerta,
      gemini_api_key,
      meta_phone_number_id,
      meta_access_token,
      prompt_personalizado,
      mensagem_pausa_humano,
      endereco_logradouro,
      endereco_numero,
      endereco_bairro,
      endereco_cidade
    `)
    .eq("meta_phone_number_id", metaPhoneNumberId)
    .maybeSingle();

  if (lojaError || !loja) {
    console.warn(`[WhatsAppWebhook] Nenhuma loja encontrada para phone_number_id: ${metaPhoneNumberId}`);
    return;
  }

  // 2. Buscar ou Criar a Conversa no banco
  let isNovaConversa = false;
  let conversa: any = null;

  const { data: conversaExistente } = await supabaseAdmin
    .from("conversas_whatsapp")
    .select("*")
    .eq("loja_id", loja.id)
    .eq("telefone_cliente", fromCliente)
    .maybeSingle();

  if (conversaExistente) {
    conversa = conversaExistente;
    // Atualizar data da última mensagem
    await supabaseAdmin
      .from("conversas_whatsapp")
      .update({ ultima_mensagem_em: new Date().toISOString() })
      .eq("id", conversa.id);
  } else {
    isNovaConversa = true;
    const { data: novaConversa, error: criaConversaErr } = await supabaseAdmin
      .from("conversas_whatsapp")
      .insert({
        loja_id: loja.id,
        telefone_cliente: fromCliente,
        nome_cliente: nomeCliente || null,
        status: "ia",
        ultima_mensagem_em: new Date().toISOString()
      })
      .select()
      .single();

    if (criaConversaErr || !novaConversa) {
      console.error("[WhatsAppWebhook] Erro ao criar conversa:", criaConversaErr?.message);
      return;
    }
    conversa = novaConversa;
  }

  // 3. Trava de Idempotência: Inserir a mensagem recebida com o `message_id_meta` (wamid)
  // Se já existir no banco (UNIQUE constraint), a inserção falhará e abortaremos o processamento
  const { error: insertMsgError } = await supabaseAdmin
    .from("mensagens_whatsapp")
    .insert({
      conversa_id: conversa.id,
      loja_id: loja.id,
      remetente: "cliente",
      conteudo: textoMensagem || "[Mídia / Anexo sem legenda]",
      message_id_meta: wamid,
      status_entrega: "recebida"
    });

  if (insertMsgError) {
    // Código 23505 = unique_violation no PostgreSQL
    console.log(`[WhatsAppWebhook] Mensagem duplicada ignorada (wamid: ${wamid})`);
    return;
  }

  // 4. Checar se a IA está ativa na loja
  if (loja.ia_whatsapp_ativa === false) {
    return;
  }

  // 5. Checagem de Limite Mensal e Auto-pausa (Franquia de 1.000 mensagens)
  const mesAtual = new Date().toISOString().substring(0, 7); // 'YYYY-MM'
  const { data: consumoAtual } = await supabaseAdmin
    .from("consumo_whatsapp")
    .select("total_mensagens")
    .eq("loja_id", loja.id)
    .eq("mes_referencia", mesAtual)
    .maybeSingle();

  const totalConsumo = consumoAtual?.total_mensagens || 0;
  const limiteMax = loja.limite_mensal_alerta || 1000;

  if (loja.pausar_ao_atingir_limite && totalConsumo >= limiteMax) {
    // Transicionar status para humano
    await supabaseAdmin
      .from("conversas_whatsapp")
      .update({ status: "humano" })
      .eq("id", conversa.id);

    // Opcionalmente enviar mensagem amigável de auto-pausa
    const msgPausa = loja.mensagem_pausa_humano ||
      "Nosso atendimento por IA atingiu a capacidade do período. Em breve um atendente da nossa equipe continuará o seu atendimento por aqui!";

    await enviarMensagemMeta(loja.meta_phone_number_id, loja.meta_access_token, fromCliente, msgPausa);
    await salvarMensagemIa(supabaseAdmin, conversa.id, loja.id, msgPausa);
    return;
  }

  // 6. Se a conversa já estiver com atendente humano, a IA não deve intervir
  if (conversa.status === "humano") {
    return;
  }

  // 7. Detecção de Intenção de Handoff Humano ("atendente", "falar com pessoa")
  const textoLimpoLower = textoMensagem.toLowerCase();
  const termosHandoff = [
    "atendente",
    "falar com atendente",
    "falar com pessoa",
    "humano",
    "suporte humano",
    "pessoa real",
    "falar com alguém"
  ];

  const solicitaHumano = termosHandoff.some((termo) => textoLimpoLower.includes(termo));
  if (solicitaHumano) {
    await supabaseAdmin
      .from("conversas_whatsapp")
      .update({ status: "humano" })
      .eq("id", conversa.id);

    const msgHandoff = "Entendido! Estou transferindo você para nossa equipe de atendimento. Um de nossos colaboradores responderá em breve por aqui.";
    await enviarMensagemMeta(loja.meta_phone_number_id, loja.meta_access_token, fromCliente, msgHandoff);
    await salvarMensagemIa(supabaseAdmin, conversa.id, loja.id, msgHandoff);
    return;
  }

  // 8. Se a loja não possui Gemini API Key ou Meta Access Token cadastrados, não prosseguir
  if (!loja.gemini_api_key || !loja.meta_access_token) {
    return;
  }

  // 9. Buscar Contexto de Produtos e Histórico Recente
  const [produtosRes, historicoRes] = await Promise.all([
    supabaseAdmin
      .from("produtos")
      .select("nome, preco_venda, categoria, codigo_barras, estoque_atual")
      .eq("loja_id", loja.id)
      .eq("ativo", true)
      .limit(35),
    supabaseAdmin
      .from("mensagens_whatsapp")
      .select("remetente, conteudo, created_at")
      .eq("conversa_id", conversa.id)
      .order("created_at", { ascending: false })
      .limit(8)
  ]);

  const produtos = produtosRes.data || [];
  const historico = (historicoRes.data || []).reverse();

  // 10. Construir Prompt Especializado para o Google Gemini
  const promptSistema = montarPromptAtendimento(loja, nomeCliente, produtos, historico, textoMensagem);

  // 11. Invocar a Google Gemini API (BYOK do Lojista)
  const respostaGemini = await gerarRespostaGemini(loja.gemini_api_key, promptSistema);

  if (!respostaGemini) {
    return;
  }

  // 12. Enviar Resposta via Meta Cloud API
  const envioSucesso = await enviarMensagemMeta(
    loja.meta_phone_number_id,
    loja.meta_access_token,
    fromCliente,
    respostaGemini
  );

  if (envioSucesso) {
    // 13. Gravar mensagem enviada e incrementar contador de consumo atomicamente
    await salvarMensagemIa(supabaseAdmin, conversa.id, loja.id, respostaGemini);

    await supabaseAdmin.rpc("incrementar_consumo_whatsapp", {
      p_loja_id: loja.id,
      p_mes: mesAtual,
      p_nova_conversa: isNovaConversa
    });
  }
}

/**
 * Salva a resposta da IA no histórico de mensagens
 */
async function salvarMensagemIa(supabaseAdmin: any, conversaId: string, lojaId: string, conteudo: string) {
  try {
    await supabaseAdmin.from("mensagens_whatsapp").insert({
      conversa_id: conversaId,
      loja_id: lojaId,
      remetente: "ia",
      conteudo,
      status_entrega: "enviada"
    });
  } catch (err: any) {
    console.error("[WhatsAppWebhook] Erro ao gravar mensagem IA:", err?.message);
  }
}

/**
 * Despacha mensagem via Meta Graph API v21.0
 */
async function enviarMensagemMeta(
  metaPhoneNumberId: string,
  metaAccessToken: string,
  destinatario: string,
  texto: string
): Promise<boolean> {
  try {
    const url = `https://graph.facebook.com/v21.0/${metaPhoneNumberId}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${metaAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: destinatario,
        type: "text",
        text: { body: texto }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("[WhatsAppWebhook] Erro ao enviar mensagem Meta:", JSON.stringify(errData));
      return false;
    }

    return true;
  } catch (err: any) {
    console.error("[WhatsAppWebhook] Falha de rede ao enviar Meta:", err?.message);
    return false;
  }
}

/**
 * Gera a resposta através do modelo Gemini 1.5 Flash usando a chave BYOK do lojista
 */
async function gerarRespostaGemini(apiKey: string, prompt: string): Promise<string | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 600
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`[WhatsAppWebhook] Erro Gemini API HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const textoGerado = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return (textoGerado || "").trim();
  } catch (err: any) {
    console.error("[WhatsAppWebhook] Exceção ao consultar Gemini:", err?.message);
    return null;
  }
}

/**
 * Constrói o contexto dinâmico do agente de IA
 */
function montarPromptAtendimento(
  loja: any,
  nomeCliente: string,
  produtos: any[],
  historico: any[],
  mensagemAtual: string
): string {
  const listaProdutosTexto = produtos.length > 0
    ? produtos.map(p => `- ${p.nome}: R$ ${Number(p.preco_venda || 0).toFixed(2)}${p.categoria ? ` (${p.categoria})` : ''}`).join('\n')
    : 'Nenhum produto cadastrado no momento.';

  const historicoTexto = historico.length > 0
    ? historico.map(h => `${h.remetente === 'cliente' ? 'Cliente' : 'Você (IA)'}: ${h.conteudo}`).join('\n')
    : 'Início da conversa.';

  const enderecoTexto = [
    loja.endereco_logradouro,
    loja.endereco_numero,
    loja.endereco_bairro,
    loja.endereco_cidade
  ].filter(Boolean).join(', ');

  const catalogoLink = loja.slug_catalogo
    ? `https://hubi.com.br/catalogo/${loja.slug_catalogo}`
    : '';

  return `
Você é a atendente virtual e consultora de vendas da loja "${loja.nome_fantasia || 'Nossa Loja'}".
Seu objetivo é prestar um atendimento ágil, gentil, acolhedor e focado em converter vendas ou tirar dúvidas dos clientes.

### DADOS DA LOJA:
- Nome: ${loja.nome_fantasia || 'Nossa Loja'}
- Endereço: ${enderecoTexto || 'Consulte nosso balcão'}
${catalogoLink ? `- Catálogo Online: ${catalogoLink}` : ''}

### ORIENTAÇÕES ESPECÍFICAS DA LOJA:
${loja.prompt_personalizado ? loja.prompt_personalizado : 'Atenda com presteza e ofereça opções do catálogo.'}

### PRODUTOS DISPONÍVEIS:
${listaProdutosTexto}

### REGRAS OBRIGATÓRIAS DE COMPORTAMENTO:
1. Responda sempre em Português do Brasil (pt-BR) de forma amigável e concisa (máximo 2 a 3 parágrafos curtos).
2. Se o cliente perguntar sobre produtos ou preços, use as informações de produtos acima. Se não souber ou não tiver o item, seja sincera e sugira conferir o catálogo online ou aguardar um atendente.
3. Se o cliente desejar falar com um humano, informe que está transferindo para nossa equipe.
4. Jamais invente promoções ou condições que não foram especificadas.
5. Quando oportuno, convide o cliente a ver mais itens no catálogo online: ${catalogoLink}.

### HISTÓRICO RECENTE DA CONVERSA:
${historicoTexto}

### MENSAGEM DO CLIENTE AGORA (${nomeCliente ? `Nome: ${nomeCliente}` : 'Cliente'}):
"${mensagemAtual}"

Responda diretamente ao cliente:
`.trim();
}
