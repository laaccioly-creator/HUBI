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

/**
 * Converte Uint8Array para Base64 em chunks para evitar estouro de call stack
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Baixa arquivo de áudio recebido via Meta Graph API v21.0
 */
async function baixarAudioMeta(
  audioId: string,
  accessToken: string,
  mimeRaw: string
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const metaMediaUrl = `https://graph.facebook.com/v21.0/${audioId}`;
    const metaRes = await fetch(metaMediaUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!metaRes.ok) {
      console.error(`[WhatsAppWebhook] Erro ao obter URL do áudio Meta: ${metaRes.status}`);
      return null;
    }

    const metaData = await metaRes.json();
    const directDownloadUrl = metaData?.url;
    if (!directDownloadUrl) {
      console.error("[WhatsAppWebhook] URL de download do áudio não retornada pela Meta");
      return null;
    }

    const audioRes = await fetch(directDownloadUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "HUBI-Audio-Worker/1.0"
      }
    });

    if (!audioRes.ok) {
      console.error(`[WhatsAppWebhook] Erro ao baixar binário do áudio: ${audioRes.status}`);
      return null;
    }

    const arrayBuffer = await audioRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const mimeLimpo = (mimeRaw || metaData.mime_type || "audio/ogg").split(";")[0].trim();

    return {
      data: uint8ArrayToBase64(bytes),
      mimeType: mimeLimpo
    };
  } catch (err: any) {
    console.error("[WhatsAppWebhook] Exceção ao baixar áudio da Meta:", err?.message || err);
    return null;
  }
}

/**
 * Mapeamento de Personas e Diretrizes por Segmento de Negócio (Alinhado ao Catálogo Online)
 */
const PERSONAS_SEGMENTO: Record<string, { papel: string; diretriz: string }> = {
  restaurante: {
    papel: "Maître & Consultora Gastronômica",
    diretriz: "Atue como atendente de alta gastronomia e delivery. Apresente os pratos destacando o sabor, ingredientes frescos, porções e acompanhamentos. Sempre pergunte se o cliente deseja uma bebida ou sobremesa para acompanhar."
  },
  moda: {
    papel: "Consultora de Estilo & Personal Stylist",
    diretriz: "Atue como consultora de moda acolhedora e antenada. Sugira combinações de looks, ocasiões de uso, tecidos e caimento, valorizando o bom gosto do cliente. Se houver tamanhos ou cores, pergunte a preferência."
  },
  lingerie: {
    papel: "Consultora Especialista em Lingerie & Moda Íntima",
    diretriz: "Atue com delicadeza, conforto, sofisticação, extremo cuidado e acolhimento. Destaque conforto, qualidade dos tecidos, caimento perfeito e ocasiões especiais com discrição e empatia."
  },
  sexshop: {
    papel: "Consultora Especialista em Produtos Eróticos & Bem-Estar Íntimo",
    diretriz: "Atue com naturalidade, sofisticação, respeito, mente aberta e absoluta discrição. Aborde dúvidas sem tabus nem preconceitos, com linguagem acolhedora, respeitosa e esclarecedora (explicando tipos de estimulação, materiais como silicone cirúrgico, modos de vibração, cosméticos eróticos e garantia total de embalagem 100% discreta)."
  },
  cosmeticos: {
    papel: "Especialista em Beleza, Skincare & Cuidados",
    diretriz: "Atue como especialista em cosméticos e maquiagem. Pergunte sobre tipos de pele e cabelo, destacando benefícios de hidratação, fixação e fragrâncias."
  },
  mercado: {
    papel: "Atendente Prático de Compras & Despensa",
    diretriz: "Atue com agilidade, presteza e foco em economia. Ajude a encontrar produtos da cesta básica, bebidas e itens da despensa, ressaltando ofertas e compras práticas."
  },
  petshop: {
    papel: "Consultora Apaixonada por Pets",
    diretriz: "Atue com carinho genuíno por animais. Pergunte o porte, idade e raça do pet para sugerir a melhor ração, petisco, brinquedo ou acessório com muito afeto."
  },
  eletronicos: {
    papel: "Consultora Especialista em Tecnologia",
    diretriz: "Atue com foco técnico, compatibilidade e inovação. Destaque potência, conectividade, cabos corretos, garantia e performance dos aparelhos e acessórios."
  },
  farmacia: {
    papel: "Consultora de Saúde & Bem-Estar",
    diretriz: "Atue com responsabilidade, foco em nutrição, suplementos, vitaminas e cuidados preventivos de saúde. Mantenha tom calmo, empático e acolhedor."
  },
  construcao: {
    papel: "Consultor Prático de Reformas & Obras",
    diretriz: "Atue com objetividade e conhecimento de obras. Oriente as ferramentas e materiais certos para cada etapa de conserto, hidráulica, elétrica ou acabamento."
  },
  geral: {
    papel: "Consultora de Vendas & Atendimento Especial",
    diretriz: "Atue como uma vendedora completa, gentil, entusiasta e atenciosa. Ajude o cliente a encontrar os produtos que mais combinam com o que ele procura, apresentando vantagens e valores."
  }
};

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

  const messageType = message.type || "text";
  const isAudio = messageType === "audio" || Boolean(message.audio);
  const audioId = message.audio?.id;
  const audioMimeTypeRaw = message.audio?.mime_type || "audio/ogg";

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
      segmento,
      configuracoes_extras,
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
  const conteudoEntrada = isAudio
    ? "🎤 [Mensagem de Áudio]"
    : (textoMensagem || "[Mídia / Anexo sem legenda]");

  const { error: insertMsgError } = await supabaseAdmin
    .from("mensagens_whatsapp")
    .insert({
      conversa_id: conversa.id,
      loja_id: loja.id,
      remetente: "cliente",
      conteudo: conteudoEntrada,
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

  // 9. Download do Áudio Meta (se mensagem for de voz/áudio)
  let audioBase64: { data: string; mimeType: string } | null = null;
  if (isAudio && audioId) {
    audioBase64 = await baixarAudioMeta(audioId, loja.meta_access_token, audioMimeTypeRaw);
  }

  // 10. Buscar Contexto de Produtos, Categorias e Histórico Recente
  const [produtosRes, categoriasRes, historicoRes] = await Promise.all([
    supabaseAdmin
      .from("produtos")
      .select("id, nome, preco_venda_varejo, preco_promocional, promocao_ativa, descricao, categoria_id, variacoes:variacoes_produto(valor_variacao_1, valor_variacao_2)")
      .eq("loja_id", loja.id)
      .eq("ativo", true)
      .limit(45),
    supabaseAdmin
      .from("categorias")
      .select("id, nome")
      .eq("loja_id", loja.id)
      .eq("ativo", true),
    supabaseAdmin
      .from("mensagens_whatsapp")
      .select("remetente, conteudo, created_at")
      .eq("conversa_id", conversa.id)
      .order("created_at", { ascending: false })
      .limit(8)
  ]);

  let produtosRaw = produtosRes.data || [];
  if (produtosRes.error) {
    console.warn("[WhatsAppWebhook] Aviso ao buscar produtos com variacoes:", produtosRes.error.message);
    const fallbackProds = await supabaseAdmin
      .from("produtos")
      .select("id, nome, preco_venda_varejo, preco_promocional, promocao_ativa, descricao, categoria_id")
      .eq("loja_id", loja.id)
      .eq("ativo", true)
      .limit(45);
    produtosRaw = fallbackProds.data || [];
  }

  const mapaCategorias = new Map((categoriasRes.data || []).map((c: any) => [c.id, c.nome]));
  const produtosFormatados = produtosRaw.map((p: any) => ({
    ...p,
    categoria: mapaCategorias.get(p.categoria_id) || "Geral"
  }));

  const historico = (historicoRes.data || []).reverse();

  // 11. Construir Prompt Especializado Alinhado ao Catálogo Online
  const promptSistema = montarPromptAtendimento(
    loja,
    nomeCliente,
    produtosFormatados,
    historico,
    textoMensagem,
    Boolean(audioBase64)
  );

  // 12. Invocar a Google Gemini API com suporte a Áudio e Texto (BYOK do Lojista)
  const respostaGemini = await gerarRespostaGemini(loja.gemini_api_key, promptSistema, audioBase64);

  if (!respostaGemini) {
    return;
  }

  // 13. Enviar Resposta via Meta Cloud API
  const envioSucesso = await enviarMensagemMeta(
    loja.meta_phone_number_id,
    loja.meta_access_token,
    fromCliente,
    respostaGemini
  );

  if (envioSucesso) {
    // 14. Gravar mensagem enviada e incrementar contador de consumo atomicamente
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
    const textoLimpo = (texto || "").trim();
    if (!textoLimpo) return false;

    const textoAjustado = textoLimpo.length > 4000
      ? textoLimpo.slice(0, 3995) + "..."
      : textoLimpo;

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
        text: { body: textoAjustado }
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

// Cache em memória dos modelos Gemini por API Key no ciclo de vida da Edge Function
const cacheModelosValidosEdge = new Map<string, string[]>();
const MODELOS_EDGE_CONTINGENCIA = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-1.5-flash-8b"];

/**
 * Extrai pontuação de prioridade para modelos Gemini:
 * Prioriza a família Flash e as versões mais recentes (3.8 > 3.5 > 2.5 > 1.5).
 */
function calcularScoreModeloEdge(nome: string): number {
  const limpo = nome.toLowerCase().replace("models/", "");
  let score = 0;
  if (limpo.includes("flash")) score += 1000;
  if (limpo.includes("pro")) score -= 200;

  const match = limpo.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    score += parseFloat(match[1]) * 100;
  }
  if (limpo.includes("lite")) score += 10;
  return score;
}

/**
 * Descoberta Dinâmica de Modelos Gemini disponíveis na conta do lojista (BYOK).
 */
async function getAvailableGeminiModelsEdge(
  apiKey: string,
  forcarAtualizacao = false
): Promise<string[]> {
  const chave = apiKey.trim();
  if (!chave) return MODELOS_EDGE_CONTINGENCIA;

  if (!forcarAtualizacao) {
    const emCache = cacheModelosValidosEdge.get(chave);
    if (emCache && emCache.length > 0) return emCache;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(chave)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    if (res.ok) {
      const data = await res.json();
      const models: any[] = data?.models || [];

      const candidatos = models
        .filter((m: any) => {
          const nome = (m.name || "").replace("models/", "").toLowerCase();
          const suportaGenerate =
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes("generateContent");

          if (!suportaGenerate) return false;

          // Ignora modelos não textuais ou pesados
          if (
            nome.includes("embedding") ||
            nome.includes("aqa") ||
            nome.includes("bison") ||
            nome.includes("tts") ||
            nome.includes("image") ||
            nome.includes("live") ||
            nome.includes("realtime") ||
            nome.includes("customtools") ||
            nome.includes("computer-use") ||
            nome.includes("deep-research") ||
            nome.includes("antigravity") ||
            nome.includes("lyria")
          ) {
            return false;
          }
          return true;
        })
        .map((m: any) => (m.name || "").replace("models/", ""));

      if (candidatos.length > 0) {
        candidatos.sort((a, b) => calcularScoreModeloEdge(b) - calcularScoreModeloEdge(a));
        cacheModelosValidosEdge.set(chave, candidatos);
        return candidatos;
      }
    }
  } catch (err: any) {
    console.warn("[WhatsAppWebhook] Falha ao consultar modelos dinâmicos na Google API:", err?.message || err);
  }

  return MODELOS_EDGE_CONTINGENCIA;
}

/**
 * Gera a resposta através da Google Gemini API usando a chave BYOK do lojista,
 * com suporte multimodal a áudio e texto, descoberta dinâmica de modelos e auto-recuperação (Self-Healing).
 */
async function gerarRespostaGemini(
  apiKey: string,
  prompt: string,
  audioData?: { data: string; mimeType: string } | null
): Promise<string | null> {
  const chaveLimpa = (apiKey || "").trim();
  if (!chaveLimpa) {
    console.error("[WhatsAppWebhook] Chave de API do Gemini ausente ou vazia.");
    return null;
  }

  const modelos = await getAvailableGeminiModelsEdge(chaveLimpa);

  const parts: any[] = [];
  if (audioData?.data) {
    parts.push({
      inlineData: {
        mimeType: audioData.mimeType,
        data: audioData.data
      }
    });
  }
  parts.push({ text: prompt });

  const payload = {
    contents: [
      {
        role: "user",
        parts
      }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1200
    }
  };

  for (let i = 0; i < modelos.length; i++) {
    const modelo = modelos[i];
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(chaveLimpa)}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(
          `[WhatsAppWebhook] Erro Gemini API (${modelo}) HTTP ${response.status}: ${errorText}`
        );

        if (response.status === 404) {
          console.warn(`[WhatsAppWebhook] Modelo ${modelo} retornou 404. Invalidando cache e auto-recuperando...`);
          cacheModelosValidosEdge.delete(chaveLimpa);
          continue;
        }
        return null;
      }

      const data = await response.json();
      const textoGerado = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textoGerado) {
        return textoGerado.trim();
      }
    } catch (err: any) {
      console.error(`[WhatsAppWebhook] Exceção ao consultar Gemini (${modelo}):`, err?.message || err);
    }
  }

  return null;
}

/**
 * Constrói o contexto dinâmico do agente de IA alinhado à Rubi do Catálogo Online
 */
function montarPromptAtendimento(
  loja: any,
  nomeCliente: string,
  produtos: any[],
  historico: any[],
  mensagemAtual: string,
  temAudio: boolean
): string {
  // 1. Identificar Persona do Nicho
  const configExtras = loja.configuracoes_extras || {};
  const iaConfig = configExtras.ia || {};
  const segmento = (loja.segmento || iaConfig.segmento || "geral").toLowerCase();
  const personaInfo = PERSONAS_SEGMENTO[segmento] || PERSONAS_SEGMENTO.geral;

  const nomeLoja = loja.nome_fantasia || "Nossa Loja";
  const catalogoLink = loja.slug_catalogo
    ? `https://hubi.com.br/catalogo/${loja.slug_catalogo}`
    : "";

  const enderecoTexto = [
    loja.endereco_logradouro,
    loja.endereco_numero,
    loja.endereco_bairro,
    loja.endereco_cidade
  ].filter(Boolean).join(", ");

  // 2. Resumo Estruturado do Catálogo Real
  const catalogoResumo = produtos.map((p: any) => {
    const precoFinal = p.promocao_ativa && p.preco_promocional && Number(p.preco_promocional) > 0
      ? Number(p.preco_promocional)
      : Number(p.preco_venda_varejo || 0);

    const variacoesTxt = Array.isArray(p.variacoes) && p.variacoes.length > 0
      ? p.variacoes.map((v: any) => `${v.valor_variacao_1 || ''}${v.valor_variacao_2 ? ` / ${v.valor_variacao_2}` : ''}`).filter(Boolean).join(', ')
      : undefined;

    return {
      id: p.id,
      nome: p.nome,
      categoria: p.categoria || "Geral",
      preco: precoFinal.toFixed(2),
      em_promocao: Boolean(p.promocao_ativa && p.preco_promocional),
      descricao: p.descricao ? p.descricao.slice(0, 140) : "",
      opcoes_variacoes: variacoesTxt || undefined,
      link_direto: catalogoLink ? `${catalogoLink}?p=${p.id}` : undefined
    };
  });

  // 3. Histórico Recente de Mensagens
  const historicoTexto = historico.length > 0
    ? historico.map((h: any) => `${h.remetente === "cliente" ? "Cliente" : "Rubi (Você)"}: ${h.conteudo}`).join("\n")
    : "(Início da conversa)";

  // 4. Instrução Específica para Áudio
  const instrucaoAudio = temAudio
    ? `
🎧 O CLIENTE ENVIOU UM ÁUDIO DE VOZ NO WHATSAPP (ANEXO ACIMA):
Ouça o áudio com atenção aos detalhes, compreenda cada dúvida, tom e intenção expressa na fala do cliente. Responda diretamente ao que ele disse no áudio com assertividade, simpatia e conhecimento pleno dos produtos da loja!
`
    : "";

  return `
Você é a **Rubi**, a ${personaInfo.papel} da loja **${nomeLoja}** no atendimento ao cliente pelo WhatsApp.
SEGMENTO DA LOJA: ${segmento} - ${personaInfo.diretriz}

DADOS DA LOJA:
- Nome: ${nomeLoja}
- Endereço / Retirada: ${enderecoTexto || "Consulte nosso balcão"}
${catalogoLink ? `- Link Oficial do Catálogo Online: ${catalogoLink}` : ""}
${loja.prompt_personalizado ? `- Diretrizes Específicas do Lojista: "${loja.prompt_personalizado}"` : ""}

CLIENTE ATUAL: ${nomeCliente ? `"${nomeCliente}"` : "Nome não informado"}

HISTÓRICO RECENTE DA CONVERSA:
${historicoTexto}

CATÁLOGO REAL DA LOJA (Produtos efetivamente disponíveis no estoque):
${JSON.stringify(catalogoResumo, null, 2)}

🚨 DIRETRIZES INVIOLÁVEIS DE ATENDIMENTO E ZERO ALUCINAÇÃO:
1. PROIBIDO INVENTAR PRODUTOS OU PREÇOS: Você SÓ PODE recomendar, descrever ou citar produtos que constam LITERALMENTE na lista "CATÁLOGO REAL DA LOJA" acima! NUNCA invente nomes de produtos, modelos fictícios ou marcas que a loja não vende. Use rigorosamente o valor que está no campo "preco" de cada produto listado. Se custa 6.50, diga "R$ 6,50". Jamais invente preços inexistentes!
2. PREÇOS PROMOCIONAIS: Se o produto tiver "em_promocao: true", valorize com entusiasmo a oferta especial para o cliente!
3. VARIAÇÕES E OPÇÕES: Se o produto tiver "opcoes_variacoes", informe as opções disponíveis (tamanhos, cores ou sabores) de forma natural.
4. HUMANIZAÇÃO TOTAL (CONVERSA NATURAL ENTRE DOIS HUMANOS NO WHATSAPP):
   - Converse com entusiasmo acolhedor, empatia e espontaneidade — como uma excelente consultora ou vendedora atenciosa conversando cara a cara no balcão da loja física ou em um áudio descontraído de WhatsApp.
   - Fale em parágrafos contínuos, calorosos e vivos. Evite listas frias ou mecânicas de bullets.
   - Use expressões naturais e afetuosas do dia a dia brasileiro: "Olha só", "Com certeza!", "Ah, excelente escolha!", "Pode deixar comigo", "Temos sim!", "Fica super à vontade", "Você vai adorar!".
5. DÚVIDAS SOBRE PRODUTOS TÊM PRIORIDADE TOTAL: Se o cliente perguntar sobre um produto, responda imediatamente explicando para que serve, benefícios, modo de uso ou diferenciais, informando o valor. Jamais bloqueie o atendimento exigindo o nome do cliente.
6. IDENTIFICAÇÃO DO CLIENTE: Somente quando o cliente fizer uma saudação simples e isolada (sem perguntas nem produtos), dê as boas-vindas e pergunte de forma leve e simpática: "Antes de começarmos, como posso te chamar? Me conta seu nome!"
7. PRODUTOS INDISPONÍVEIS: Se o cliente perguntar por algo que não temos no catálogo, seja transparente e gentil: informe que no momento não temos esse item específico e ofereça com simpatia as melhores opções similares que realmente constam no catálogo.
8. FECHAMENTO DE PEDIDOS E LINKS:
   - Se o cliente quiser conferir fotos e detalhes, envie o link do catálogo: ${catalogoLink}.
   - Se o cliente perguntar de um produto específico, pode fornecer o link direto do item no catálogo: ${catalogoLink}?p=ID_DO_PRODUTO.
   - Se o cliente quiser fechar o pedido diretamente por aqui pelo WhatsApp, acolha com alegria e solicite os dados com carinho: itens/quantidades desejadas, endereço completo para entrega e forma de pagamento (Pix, Cartão ou Dinheiro).
9. MANTENHA A CONVERSA CONCISA E FLUIDA: Responda em 2 a 3 parágrafos curtos, bem pontuados e agradáveis de ler no celular. Escreva sempre frases completas com pontuação final. NUNCA corte uma frase no meio.
${instrucaoAudio}
${!temAudio ? `MENSAGEM ATUAL DO CLIENTE:\n"${mensagemAtual}"` : ""}

Responda diretamente ao cliente agora com o tom e carinho da Rubi:
`.trim();
}
