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
  acaiteria: {
    papel: "Especialista em Açaí, Sobremesas & Delícias Geladas",
    diretriz: "Atue com muito dinamismo e simpatia. Apresente os tamanhos dos copos/tigelas (300ml, 500ml, 700ml), tipos de açaí (tradicional, trufado, zero) e pergunte quais adicionais ou coberturas o cliente deseja montar no copo!"
  },
  lanchonete: {
    papel: "Atendente de Lanches, Combos & Bebidas",
    diretriz: "Atue com agilidade e energia. Sugira os combos da casa, pergunte o ponto do hambúrguer/lanche, se deseja batata frita e qual bebida prefere para acompanhar."
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
  const rawPhoneId = String(changes?.metadata?.phone_number_id || "").trim();
  const fromCliente = normalizarTelefone(message.from);
  const nomeCliente = changes?.contacts?.[0]?.profile?.name || "";

  console.log("[WhatsAppWebhook] Evento recebido da Meta. Buscando loja com phone_number_id:", rawPhoneId);

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

  if (!wamid || !rawPhoneId || !fromCliente) {
    console.warn("[WhatsAppWebhook] Dados essenciais ausentes:", { wamid, rawPhoneId, fromCliente });
    return;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

  // 1. Identificar o Tenant correspondente pelo Phone Number ID sanitizado
  const { data: loja, error: erroLoja } = await supabaseAdmin
    .from("lojas")
    .select("*")
    .eq("meta_phone_number_id", rawPhoneId)
    .maybeSingle();

  if (erroLoja || !loja) {
    console.error("[WhatsAppWebhook] Loja não encontrada para phone_number_id:", {
      procurado: rawPhoneId,
      erro: erroLoja?.message || erroLoja
    });
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

  // 3.1. Gestão de Sessões Contextuais (whatsapp_sessoes) com Timeout de Inatividade (40 minutos)
  const TIMEOUT_SESSAO_MS = 40 * 60 * 1000;
  const dataAtualIso = new Date().toISOString();
  const timestampAtual = Date.now();
  let sessaoId: string | null = null;

  try {
    const { data: sessaoAtiva } = await supabaseAdmin
      .from("whatsapp_sessoes")
      .select("id, status, atualizado_em, criado_em")
      .eq("loja_id", loja.id)
      .eq("numero_cliente", fromCliente)
      .eq("status", "ativo")
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessaoAtiva) {
      const dataUltimaInteracao = new Date(sessaoAtiva.atualizado_em || sessaoAtiva.criado_em).getTime();
      const sessaoExpirada = timestampAtual - dataUltimaInteracao > TIMEOUT_SESSAO_MS;

      if (sessaoExpirada) {
        // Encerra a sessão anterior por timeout
        await supabaseAdmin
          .from("whatsapp_sessoes")
          .update({ status: "encerrado", atualizado_em: dataAtualIso })
          .eq("id", sessaoAtiva.id);

        // Abre uma nova sessão limpa
        const { data: novaSessao } = await supabaseAdmin
          .from("whatsapp_sessoes")
          .insert({
            loja_id: loja.id,
            numero_cliente: fromCliente,
            status: "ativo",
            criado_em: dataAtualIso,
            atualizado_em: dataAtualIso
          })
          .select("id")
          .single();

        sessaoId = novaSessao?.id || null;
      } else {
        // Sessão ativa e dentro da janela: revalida e atualiza timestamp
        sessaoId = sessaoAtiva.id;
        await supabaseAdmin
          .from("whatsapp_sessoes")
          .update({ atualizado_em: dataAtualIso })
          .eq("id", sessaoId);
      }
    } else {
      // Primeira interação ou sem sessão ativa: cria nova sessão
      const { data: novaSessao } = await supabaseAdmin
        .from("whatsapp_sessoes")
        .insert({
          loja_id: loja.id,
          numero_cliente: fromCliente,
          status: "ativo",
          criado_em: dataAtualIso,
          atualizado_em: dataAtualIso
        })
        .select("id")
        .single();

      sessaoId = novaSessao?.id || null;
    }

    // Gravar mensagem do cliente no histórico contextual da sessão
    if (sessaoId) {
      await supabaseAdmin
        .from("whatsapp_mensagens")
        .insert({
          sessao_id: sessaoId,
          loja_id: loja.id,
          origem: "user",
          conteudo: conteudoEntrada,
          metadata: {
            wamid,
            is_audio: Boolean(isAudio),
            audio_id: audioId || null
          }
        });
    }
  } catch (errSessao: any) {
    console.error("[WhatsAppWebhook] Aviso ao processar whatsapp_sessoes:", errSessao?.message);
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

    if (sessaoId) {
      await supabaseAdmin
        .from("whatsapp_sessoes")
        .update({ status: "pausado_humano", atualizado_em: dataAtualIso })
        .eq("id", sessaoId);
    }

    // Enviar mensagem amigável de auto-pausa
    const msgPausa = loja.mensagem_pausa_humano ||
      "Nosso atendimento por IA atingiu a capacidade do período. Em breve um atendente da nossa equipe continuará o seu atendimento por aqui!";

    await enviarMensagemMeta(loja.meta_phone_number_id, loja.meta_access_token, fromCliente, msgPausa);
    await salvarMensagemIa(supabaseAdmin, conversa.id, loja.id, msgPausa);
    if (sessaoId) {
      await supabaseAdmin
        .from("whatsapp_mensagens")
        .insert({
          sessao_id: sessaoId,
          loja_id: loja.id,
          origem: "model",
          conteudo: msgPausa,
          metadata: { tipo: "auto_pausa_limite" }
        });
    }
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

    if (sessaoId) {
      await supabaseAdmin
        .from("whatsapp_sessoes")
        .update({ status: "pausado_humano", atualizado_em: dataAtualIso })
        .eq("id", sessaoId);
    }

    const msgHandoff = "Entendido! Estou transferindo você para nossa equipe de atendimento. Um de nossos colaboradores responderá em breve por aqui.";
    await enviarMensagemMeta(loja.meta_phone_number_id, loja.meta_access_token, fromCliente, msgHandoff);
    await salvarMensagemIa(supabaseAdmin, conversa.id, loja.id, msgHandoff);
    if (sessaoId) {
      await supabaseAdmin
        .from("whatsapp_mensagens")
        .insert({
          sessao_id: sessaoId,
          loja_id: loja.id,
          origem: "model",
          conteudo: msgHandoff,
          metadata: { tipo: "handoff_humano" }
        });
    }
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

  // 10. RAG Dinâmico: Consultar Catálogo Ativo (com cache em memória TTL 5m) e Histórico da Sessão
  const [catalogoInfo, historicoRes] = await Promise.all([
    getCatalogoLoja(supabaseAdmin, loja),
    sessaoId
      ? supabaseAdmin
          .from("whatsapp_mensagens")
          .select("origem, conteudo, criado_em")
          .eq("sessao_id", sessaoId)
          .order("criado_em", { ascending: true })
          .limit(15)
      : supabaseAdmin
          .from("mensagens_whatsapp")
          .select("remetente, conteudo, created_at")
          .eq("conversa_id", conversa.id)
          .order("created_at", { ascending: true })
          .limit(8)
  ]);

  const dadosExpediente = obterStatusExpediente(loja);

  // 11. Montagem do Histórico Multi-turn para Gemini (`contents`)
  const msgsHistorico = (historicoRes.data || []) as any[];
  const contents: Array<{ role: "user" | "model"; parts: any[] }> = [];

  for (let i = 0; i < msgsHistorico.length; i++) {
    const m = msgsHistorico[i];
    // Normaliza origem: 'user'/'cliente' -> 'user', 'model'/'ia' -> 'model'
    const role: "user" | "model" =
      (m.origem === "model" || m.remetente === "ia") ? "model" : "user";
    const isUltimaMsg = (i === msgsHistorico.length - 1);

    const parts: any[] = [];
    if (isUltimaMsg && audioBase64) {
      parts.push({
        inlineData: {
          mimeType: audioBase64.mimeType,
          data: audioBase64.data
        }
      });
      if (textoMensagem && textoMensagem.trim()) {
        parts.push({ text: textoMensagem.trim() });
      } else {
        parts.push({ text: "O cliente enviou o áudio acima. Por favor, ouça com atenção e responda ao que foi solicitado com base nos produtos da loja." });
      }
    } else {
      parts.push({ text: m.conteudo });
    }

    // Regra da API Gemini: Mesclar mensagens consecutivas com o mesmo role
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts.push(...parts);
    } else {
      contents.push({ role, parts });
    }
  }

  // Garantir que a primeira mensagem do histórico seja 'user'
  while (contents.length > 0 && contents[0].role !== "user") {
    contents.shift();
  }

  // Fallback caso contents esteja vazio
  if (contents.length === 0) {
    const fallbackParts: any[] = [];
    if (audioBase64) {
      fallbackParts.push({
        inlineData: {
          mimeType: audioBase64.mimeType,
          data: audioBase64.data
        }
      });
    }
    fallbackParts.push({ text: textoMensagem || "Olá!" });
    contents.push({ role: "user", parts: fallbackParts });
  }

  // Garantir que a última mensagem seja 'user' para o modelo gerar a resposta
  if (contents[contents.length - 1].role !== "user") {
    contents.push({
      role: "user",
      parts: [{ text: textoMensagem || "Continuando atendimento..." }]
    });
  }

  // 12. Construir Prompt Especializado (System Instruction com RAG Dinâmico)
  const systemInstructionText = montarPromptAtendimento(
    loja,
    nomeCliente,
    catalogoInfo.catalogoFormatado,
    catalogoInfo.dadosOperacionais,
    dadosExpediente,
    Boolean(audioBase64)
  );

  // 13. Invocar a Google Gemini API com suporte a Function Calling (Tools), Áudio, Histórico e BYOK do Lojista
  const respostaGemini = await gerarRespostaGemini(
    loja.gemini_api_key,
    systemInstructionText,
    contents,
    {
      supabaseAdmin,
      loja,
      fromCliente,
      conversa,
      sessaoId
    }
  );

  if (!respostaGemini) {
    return;
  }

  // 14. Enviar Resposta via Meta Cloud API
  const envioSucesso = await enviarMensagemMeta(
    loja.meta_phone_number_id,
    loja.meta_access_token,
    fromCliente,
    respostaGemini
  );

  if (envioSucesso) {
    // 15. Gravar resposta da IA no histórico da sessão (whatsapp_mensagens) e na conversa do painel
    if (sessaoId) {
      await supabaseAdmin
        .from("whatsapp_mensagens")
        .insert({
          sessao_id: sessaoId,
          loja_id: loja.id,
          origem: "model",
          conteudo: respostaGemini,
          metadata: { status_entrega: "enviada" }
        });

      await supabaseAdmin
        .from("whatsapp_sessoes")
        .update({ atualizado_em: new Date().toISOString() })
        .eq("id", sessaoId);
    }

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
 * Declaração formal das ferramentas (Tools / Function Calling) para o Gemini
 */
const GEMINI_TOOLS_DECLARATIONS = [
  {
    functionDeclarations: [
      {
        name: "registrar_pedido",
        description: "Grava formalmente um novo pedido de compra no sistema HUBI após o cliente confirmar os itens, endereço de entrega e forma de pagamento.",
        parameters: {
          type: "OBJECT",
          properties: {
            nome_cliente: {
              type: "STRING",
              description: "Nome do cliente informado durante a conversa."
            },
            tipo_entrega: {
              type: "STRING",
              enum: ["entrega", "retirada"],
              description: "Método de recebimento escolhido pelo cliente."
            },
            endereco_entrega: {
              type: "OBJECT",
              properties: {
                logradouro: { type: "STRING" },
                numero: { type: "STRING" },
                bairro: { type: "STRING" },
                complemento: { type: "STRING" },
                ponto_referencia: { type: "STRING" }
              },
              description: "Dados de endereço completos (obrigatório se tipo_entrega for 'entrega')."
            },
            forma_pagamento: {
              type: "STRING",
              enum: ["pix", "cartao_credito", "cartao_debito", "dinheiro"],
              description: "Forma de pagamento confirmada pelo cliente."
            },
            troco_para: {
              type: "NUMBER",
              description: "Valor para troco caso a forma de pagamento seja dinheiro."
            },
            itens: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  produto_id: { type: "STRING", description: "ID UUID do produto no catálogo." },
                  nome_produto: { type: "STRING", description: "Nome exato do produto." },
                  quantidade: { type: "INTEGER", description: "Quantidade solicitada." },
                  preco_unitario: { type: "NUMBER", description: "Preço unitário em reais." },
                  observacoes: { type: "STRING", description: "Variação, sabor ou observação." }
                },
                required: ["produto_id", "nome_produto", "quantidade", "preco_unitario"]
              },
              description: "Lista dos itens e quantidades validados."
            },
            observacoes_gerais: {
              type: "STRING",
              description: "Observações gerais adicionadas pelo cliente."
            }
          },
          required: ["tipo_entrega", "forma_pagamento", "itens"]
        }
      },
      {
        name: "solicitar_atendente_humano",
        description: "Pausa a assistência da IA e transfere a conversa para a equipe de atendimento humano no painel HUBI.",
        parameters: {
          type: "OBJECT",
          properties: {
            motivo: {
              type: "STRING",
              description: "Resumo conciso do motivo da solicitação de transbordo humano."
            }
          },
          required: ["motivo"]
        }
      }
    ]
  }
];

/**
 * Salva formalmente um pedido na tabela public.pedidos e seus itens em public.itens_pedido
 */
async function salvarPedidoNoBanco(
  supabaseAdmin: any,
  loja: any,
  telefoneCliente: string,
  args: any,
  sessaoId: string | null
): Promise<{
  success: boolean;
  erro?: string;
  pedido_id?: string;
  numero_pedido?: number;
  subtotal?: number;
  valor_frete?: number;
  valor_total?: number;
  tipo_entrega?: string;
  forma_pagamento?: string;
  tempo_estimado?: string;
}> {
  try {
    if (!args.itens || !Array.isArray(args.itens) || args.itens.length === 0) {
      return { success: false, erro: "O pedido precisa conter pelo menos um item." };
    }

    // 1. Validar produtos e calcular subtotal com preços reais do banco
    const produtoIds = args.itens.map((it: any) => it.produto_id).filter(Boolean);
    const { data: produtosBanco } = await supabaseAdmin
      .from("produtos")
      .select("id, nome, preco_venda_varejo, preco_promocional, promocao_ativa, quantidade_estoque, ativo")
      .in("id", produtoIds)
      .eq("loja_id", loja.id);

    const mapaProdutos = new Map<string, any>((produtosBanco || []).map((p: any) => [p.id, p]));

    let subtotalCalculado = 0;
    const itensValidados: any[] = [];

    for (const item of args.itens) {
      let prodDb = mapaProdutos.get(item.produto_id);

      // Fallback: se não achar por id exato, busca por nome aproximado
      if (!prodDb && item.nome_produto) {
        const { data: prodPorNome } = await supabaseAdmin
          .from("produtos")
          .select("id, nome, preco_venda_varejo, preco_promocional, promocao_ativa, quantidade_estoque, ativo")
          .ilike("nome", `%${item.nome_produto.trim()}%`)
          .eq("loja_id", loja.id)
          .eq("ativo", true)
          .limit(1)
          .maybeSingle();

        if (prodPorNome) {
          prodDb = prodPorNome;
        }
      }

      if (!prodDb || prodDb.ativo === false) {
        return {
          success: false,
          erro: `O produto "${item.nome_produto || item.produto_id}" não está ativo ou não consta no catálogo.`
        };
      }

      // Checagem de estoque
      if (prodDb.quantidade_estoque !== null && Number(prodDb.quantidade_estoque) <= 0) {
        return {
          success: false,
          erro: `O produto "${prodDb.nome}" está esgotado no momento.`
        };
      }

      // Preço de venda real (respeita promoção se ativa)
      const precoPromo = Number(prodDb.preco_promocional || 0);
      const precoVenda = (prodDb.promocao_ativa && precoPromo > 0)
        ? precoPromo
        : Number(prodDb.preco_venda_varejo || item.preco_unitario || 0);

      const qtd = Math.max(1, parseInt(item.quantidade) || 1);
      const subItem = qtd * precoVenda;
      subtotalCalculado += subItem;

      itensValidados.push({
        loja_id: loja.id,
        produto_id: prodDb.id,
        nome_produto: prodDb.nome,
        preco_venda_unitario: precoVenda,
        quantidade: qtd,
        subtotal: subItem,
        tabela_preco_utilizada: "varejo",
        observacoes: item.observacoes ? String(item.observacoes).slice(0, 200) : null
      });
    }

    // 2. Calcular taxa de entrega / frete
    let valorFrete = 0;
    if (args.tipo_entrega === "entrega") {
      const { data: shippingConfig } = await supabaseAdmin
        .from("loja_shipping_configs")
        .select("frete_proprio_ativo, frete_proprio_valor_padrao, frete_gratis_ativo, frete_gratis_valor_minimo")
        .eq("loja_id", loja.id)
        .maybeSingle();

      const freteGratisAtivo = Boolean(shippingConfig?.frete_gratis_ativo || loja.frete_gratis_ativo);
      const freteGratisMin = Number(shippingConfig?.frete_gratis_valor_minimo || loja.frete_gratis_valor_minimo || 0);

      if (freteGratisAtivo && freteGratisMin > 0 && subtotalCalculado >= freteGratisMin) {
        valorFrete = 0;
      } else if (shippingConfig?.frete_proprio_ativo) {
        valorFrete = Number(shippingConfig.frete_proprio_valor_padrao || 12.00);
      } else {
        valorFrete = 12.00; // Padrão de Fortaleza
      }
    }

    const valorTotal = subtotalCalculado + valorFrete;

    // 3. Formatar endereço de entrega
    let enderecoTexto = "Retirada no balcão da loja";
    if (args.tipo_entrega === "entrega") {
      const end = args.endereco_entrega || {};
      const partes = [
        end.logradouro ? `${end.logradouro}, ${end.numero || "S/N"}` : null,
        end.bairro ? `Bairro: ${end.bairro}` : null,
        end.complemento ? `Compl: ${end.complemento}` : null,
        end.ponto_referencia ? `Ponto de Ref: ${end.ponto_referencia}` : null
      ].filter(Boolean);
      enderecoTexto = partes.join(" - ") || "Endereço informado no WhatsApp";
    }

    // 4. Inserir Pedido na tabela public.pedidos
    const { data: novoPedido, error: erroCriarPedido } = await supabaseAdmin
      .from("pedidos")
      .insert({
        loja_id: loja.id,
        cliente_nome_avulso: args.nome_cliente || "Cliente WhatsApp",
        cliente_telefone_avulso: telefoneCliente,
        origem: "whatsapp_bot",
        tabela_preco_aplicada: "varejo",
        status: "pendente",
        status_pagamento: "pendente",
        forma_pagamento_catalogo: args.forma_pagamento || "pix",
        troco_para: args.troco_para ? Number(args.troco_para) : null,
        subtotal: subtotalCalculado,
        subtotal_produtos: subtotalCalculado,
        valor_frete: valorFrete,
        valor_total: valorTotal,
        endereco_entrega: enderecoTexto,
        observacoes: args.observacoes_gerais ? String(args.observacoes_gerais).slice(0, 400) : null,
        data_venda: new Date().toISOString(),
        metadados: {
          tipo_entrega: args.tipo_entrega,
          sessao_id: sessaoId,
          gerado_por: "rubi_ia_function_calling",
          criado_em_fortaleza: new Date().toISOString()
        }
      })
      .select("id, numero_pedido")
      .single();

    if (erroCriarPedido || !novoPedido) {
      console.error("[WhatsAppWebhook] Erro ao criar pedido:", erroCriarPedido?.message);
      return { success: false, erro: "Erro ao registrar o pedido no banco de dados." };
    }

    // 5. Inserir Itens do Pedido na tabela public.itens_pedido
    const itensComPedidoId = itensValidados.map((it: any) => ({
      pedido_id: novoPedido.id,
      ...it
    }));

    const { error: erroItens } = await supabaseAdmin
      .from("itens_pedido")
      .insert(itensComPedidoId);

    if (erroItens) {
      console.error("[WhatsAppWebhook] Erro ao criar itens do pedido, cancelando:", erroItens.message);
      await supabaseAdmin.from("pedidos").delete().eq("id", novoPedido.id);
      return { success: false, erro: "Falha ao gravar os itens do pedido." };
    }

    return {
      success: true,
      pedido_id: novoPedido.id,
      numero_pedido: novoPedido.numero_pedido,
      subtotal: subtotalCalculado,
      valor_frete: valorFrete,
      valor_total: valorTotal,
      tipo_entrega: args.tipo_entrega,
      forma_pagamento: args.forma_pagamento,
      tempo_estimado: "30 a 50 minutos"
    };
  } catch (err: any) {
    console.error("[WhatsAppWebhook] Exceção em salvarPedidoNoBanco:", err?.message || err);
    return { success: false, erro: "Erro inesperado ao salvar pedido." };
  }
}

/**
 * Realiza o transbordo humano: pausa o bot e marca a conversa para atendimento manual
 */
async function pausarParaHandoffHumano(
  supabaseAdmin: any,
  loja: any,
  conversa: any,
  sessaoId: string | null,
  motivo: string
): Promise<void> {
  const agoraIso = new Date().toISOString();

  await supabaseAdmin
    .from("conversas_whatsapp")
    .update({ status: "humano", ultima_mensagem_em: agoraIso })
    .eq("id", conversa.id);

  if (sessaoId) {
    await supabaseAdmin
      .from("whatsapp_sessoes")
      .update({
        status: "pausado_humano",
        atualizado_em: agoraIso
      })
      .eq("id", sessaoId);

    await supabaseAdmin
      .from("whatsapp_mensagens")
      .insert({
        sessao_id: sessaoId,
        loja_id: loja.id,
        origem: "model",
        conteudo: `[TRANSBORDO HUMANO ACIONADO]: ${motivo}`,
        metadata: { tipo: "handoff_humano", motivo, data: agoraIso }
      });
  }
}

/**
 * Gera a resposta através da Google Gemini API usando a chave BYOK do lojista,
 * com suporte a Function Calling (Tools), systemInstruction, histórico contextual em contents e auto-recuperação (Self-Healing).
 */
async function gerarRespostaGemini(
  apiKey: string,
  systemInstructionText: string,
  contents: any[],
  contextoTool?: {
    supabaseAdmin: any;
    loja: any;
    fromCliente: string;
    conversa: any;
    sessaoId: string | null;
  }
): Promise<string | null> {
  const chaveLimpa = (apiKey || "").trim();
  if (!chaveLimpa) {
    console.error("[WhatsAppWebhook] Chave de API do Gemini ausente ou vazia.");
    return null;
  }

  const modelos = await getAvailableGeminiModelsEdge(chaveLimpa);

  const payload: any = {
    systemInstruction: {
      parts: [{ text: systemInstructionText }]
    },
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1200
    }
  };

  if (contextoTool) {
    payload.tools = GEMINI_TOOLS_DECLARATIONS;
  }

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

        // Se o modelo rejeitar o campo tools (caso de modelo incompatível), tentar sem tools
        if (response.status === 400 && errorText.includes("tools")) {
          console.warn(`[WhatsAppWebhook] Modelo ${modelo} não aceitou tools. Tentando sem tools...`);
          const payloadSemTools = { ...payload };
          delete payloadSemTools.tools;

          const respSemTools = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadSemTools)
          });

          if (respSemTools.ok) {
            const dataSt = await respSemTools.json();
            const textoSt = dataSt?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textoSt) return textoSt.trim();
          }
        }

        // Se o modelo rejeitar o campo systemInstruction (caso legado), fallback embutindo na primeira mensagem
        if (response.status === 400 && errorText.includes("systemInstruction")) {
          console.warn(`[WhatsAppWebhook] Modelo ${modelo} não aceitou systemInstruction. Tentando incorporar no primeiro turno...`);
          const primeiroTurno = contents[0] || { role: "user", parts: [] };
          const payloadFallback = {
            contents: [
              {
                role: "user",
                parts: [
                  { text: `[INSTRUÇÕES DO SISTEMA]:\n${systemInstructionText}\n` },
                  ...(primeiroTurno.parts || [])
                ]
              },
              ...contents.slice(1)
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1200
            }
          };

          const respFallback = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadFallback)
          });

          if (respFallback.ok) {
            const dataFb = await respFallback.json();
            const textoFb = dataFb?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textoFb) return textoFb.trim();
          }
        }

        return null;
      }

      const data = await response.json();
      const candidate = data?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const functionCallPart = parts.find((p: any) => p.functionCall);

      // Tratamento de Function Calling (Tools)
      if (functionCallPart?.functionCall && contextoTool) {
        const { name, args } = functionCallPart.functionCall;
        console.log(`[WhatsAppWebhook] Gemini invocou Function Calling: ${name}`, JSON.stringify(args));

        if (name === "solicitar_atendente_humano") {
          await pausarParaHandoffHumano(
            contextoTool.supabaseAdmin,
            contextoTool.loja,
            contextoTool.conversa,
            contextoTool.sessaoId,
            args?.motivo || "Solicitado pelo cliente via WhatsApp"
          );
          return "Entendido! Estou transferindo seu atendimento para nossa equipe agora mesmo. Um de nossos colaboradores assumirá a conversa por aqui em instantes. Obrigado pela compreensão!";
        }

        if (name === "registrar_pedido") {
          const resultado = await salvarPedidoNoBanco(
            contextoTool.supabaseAdmin,
            contextoTool.loja,
            contextoTool.fromCliente,
            args,
            contextoTool.sessaoId
          );

          // Segundo turno: informar o Gemini sobre o resultado da gravação do pedido para gerar a mensagem final amigável
          try {
            const payloadSegundoTurno = {
              systemInstruction: {
                parts: [{ text: systemInstructionText }]
              },
              contents: [
                ...contents,
                candidate.content,
                {
                  role: "function",
                  parts: [
                    {
                      functionResponse: {
                        name: "registrar_pedido",
                        response: {
                          name: "registrar_pedido",
                          content: resultado
                        }
                      }
                    }
                  ]
                }
              ],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1200
              }
            };

            const respTurno2 = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payloadSegundoTurno)
            });

            if (respTurno2.ok) {
              const data2 = await respTurno2.json();
              const textoFinal = data2?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textoFinal && textoFinal.trim()) {
                return textoFinal.trim();
              }
            }
          } catch (errTurno2: any) {
            console.warn("[WhatsAppWebhook] Aviso ao chamar 2º turno do tool:", errTurno2?.message);
          }

          // Fallback resiliente garantido caso o 2º turno da IA não responda
          if (resultado.success) {
            const freteTxt = resultado.valor_frete ? `R$ ${resultado.valor_frete.toFixed(2)}` : "Grátis";
            return `🎉 *Pedido #${resultado.numero_pedido} Confirmado com Sucesso!*\n\n• *Subtotal:* R$ ${resultado.subtotal?.toFixed(2)}\n• *Taxa de Entrega:* ${freteTxt}\n• *Total Geral:* *R$ ${resultado.valor_total?.toFixed(2)}*\n• *Forma de Pagamento:* ${String(resultado.forma_pagamento || "pix").toUpperCase()}\n• *Tempo Estimado:* ${resultado.tempo_estimado}\n\nNossa equipe já recebeu seu pedido no sistema HUBI e está separando tudo com muito carinho!`;
          } else {
            return `Ops! Tivemos uma pequena divergência ao registrar seu pedido: ${resultado.erro || "Por favor, confirme os itens novamente com a gente."}`;
          }
        }
      }

      // Resposta textual direta
      const textoGerado = parts[0]?.text;
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
 * Interface do item em cache do catálogo dinâmico
 */
interface CatalogoCacheItem {
  timestamp: number;
  catalogoFormatado: string;
  totalProdutos: number;
  dadosOperacionais: {
    origemEndereco: string;
    retiradaTexto: string;
    deliveryTexto: string;
    freteGratisTexto: string;
    pixTexto: string;
    cartaoTexto: string;
    dinheiroTexto: string;
    tempoEstimadoEntrega: string;
  };
}

// Cache em memória do catálogo formatado por loja (TTL de 5 minutos)
const cacheCatalogoLojas = new Map<string, CatalogoCacheItem>();
const TTL_CATALOGO_MS = 5 * 60 * 1000;

/**
 * Consulta e formata dinamicamente o catálogo ativo da loja via Supabase (RAG estruturado),
 * com cache em memória com TTL de 5 minutos para alta performance.
 */
async function getCatalogoLoja(
  supabaseAdmin: any,
  loja: any
): Promise<CatalogoCacheItem> {
  const agora = Date.now();
  const emCache = cacheCatalogoLojas.get(loja.id);
  if (emCache && agora - emCache.timestamp < TTL_CATALOGO_MS) {
    return emCache;
  }

  try {
    // Consultar Produtos, Categorias, Configurações de Frete e Formas de Entrega em paralelo
    const [prodsRes, catsRes, shippingRes] = await Promise.all([
      supabaseAdmin
        .from("produtos")
        .select(`
          id,
          nome,
          descricao,
          preco_venda_varejo,
          preco_promocional,
          promocao_ativa,
          quantidade_estoque,
          exibir_catalogo,
          ativo,
          destaque,
          categoria_id,
          variacoes:variacoes_produto(id, valor_variacao_1, valor_variacao_2, preco_venda_varejo, preco_promocional, quantidade_estoque, ativo)
        `)
        .eq("loja_id", loja.id)
        .eq("ativo", true)
        .order("nome", { ascending: true })
        .limit(100),
      supabaseAdmin
        .from("categorias")
        .select("id, nome, ordem_exibicao")
        .eq("loja_id", loja.id)
        .eq("ativo", true)
        .order("ordem_exibicao", { ascending: true }),
      supabaseAdmin
        .from("loja_shipping_configs")
        .select("*")
        .eq("loja_id", loja.id)
        .maybeSingle()
    ]);

    let produtosRaw = prodsRes.data || [];
    if (prodsRes.error || produtosRaw.length === 0) {
      const fallbackProds = await supabaseAdmin
        .from("produtos")
        .select("id, nome, preco_venda_varejo, preco_promocional, promocao_ativa, descricao, categoria_id, quantidade_estoque")
        .eq("loja_id", loja.id)
        .eq("ativo", true)
        .limit(60);
      if (fallbackProds.data && fallbackProds.data.length > 0) {
        produtosRaw = fallbackProds.data;
      }
    }

    const categoriasRaw = catsRes.data || [];
    const mapaCategorias = new Map<string, string>();
    categoriasRaw.forEach((c: any) => {
      mapaCategorias.set(c.id, c.nome);
    });

    // Agrupar produtos por Categoria para formatação compacta em Markdown
    const produtosPorCategoria = new Map<string, any[]>();
    for (const prod of produtosRaw) {
      const catNome = (prod.categoria_id && mapaCategorias.get(prod.categoria_id)) || "Geral";
      if (!produtosPorCategoria.has(catNome)) {
        produtosPorCategoria.set(catNome, []);
      }
      produtosPorCategoria.get(catNome)!.push(prod);
    }

    // Montar texto enxuto do Cardápio / Catálogo (RAG Dinâmico)
    const linhasCatalogo: string[] = [];
    for (const [categoriaNome, listaProds] of produtosPorCategoria.entries()) {
      linhasCatalogo.push(`\n[Categoria: ${categoriaNome}]`);
      for (const p of listaProds) {
        const precoVenda = Number(p.preco_venda_varejo || 0);
        const precoPromo = Number(p.preco_promocional || 0);
        const emPromocao = Boolean(p.promocao_ativa && precoPromo > 0);
        const precoEfetivo = emPromocao ? precoPromo : precoVenda;

        // Disponibilidade / Estoque
        const esgotado = (p.quantidade_estoque !== null && p.quantidade_estoque !== undefined && Number(p.quantidade_estoque) <= 0);
        const statusDisp = esgotado ? " [ESGOTADO NO MOMENTO]" : " (Disponível)";

        const precoFormatado = emPromocao
          ? `R$ ${precoEfetivo.toFixed(2)} (PROMOÇÃO, era R$ ${precoVenda.toFixed(2)})`
          : `R$ ${precoEfetivo.toFixed(2)}`;

        const descCurta = p.descricao
          ? ` - ${p.descricao.replace(/\r?\n/g, " ").slice(0, 95)}`
          : "";

        let variacoesTxt = "";
        if (Array.isArray(p.variacoes) && p.variacoes.length > 0) {
          const varAtivas = p.variacoes.filter((v: any) => v.ativo !== false);
          if (varAtivas.length > 0) {
            const opcoes = varAtivas.map((v: any) => {
              const label = [v.valor_variacao_1, v.valor_variacao_2].filter(Boolean).join(" / ");
              const varPreco = v.preco_promocional && Number(v.preco_promocional) > 0
                ? Number(v.preco_promocional)
                : Number(v.preco_venda_varejo || precoEfetivo);
              return `${label} (R$ ${varPreco.toFixed(2)})`;
            }).join(" | ");
            variacoesTxt = ` | Opções: ${opcoes}`;
          }
        }

        linhasCatalogo.push(`• ${p.nome} — ${precoFormatado}${statusDisp}${descCurta}${variacoesTxt}`);
      }
    }

    const catalogoFormatado = linhasCatalogo.join("\n").trim() || "Nenhum produto ativo cadastrado no momento.";

    // Parâmetros Comerciais e Operacionais da Loja
    const shipping = shippingRes.data || {};
    const configExtras = loja.configuracoes_extras || {};
    const pagamentos = configExtras.pagamentos || {};
    const entregaRetirada = configExtras.entrega_retirada || {};

    const enderecoArray = [
      shipping.origem_logradouro || loja.endereco_logradouro,
      shipping.origem_numero || loja.endereco_numero,
      shipping.origem_bairro || loja.endereco_bairro,
      shipping.origem_cidade || loja.endereco_cidade || "Fortaleza",
      shipping.origem_uf || loja.endereco_uf || "CE"
    ].filter(Boolean);

    const origemEndereco = enderecoArray.length > 0
      ? enderecoArray.join(", ")
      : "Consulte nosso balcão de atendimento";

    const permiteRetirada = Boolean(
      shipping.permite_retirada_loja ||
      shipping.retirada_balcao_ativa ||
      shipping.retirada_loja_ativa ||
      entregaRetirada.trabalho_com_retirada
    );
    const retiradaTexto = permiteRetirada
      ? `Retirada disponível no balcão da loja (${origemEndereco}) - Grátis`
      : "Retirada presencial não disponível no momento";

    const freteFixo = Number(shipping.frete_proprio_valor_padrao || 0);
    const taxaEntregaDesc = freteFixo > 0 ? `Taxa padrão de R$ ${freteFixo.toFixed(2)}` : "Consulte taxa conforme o bairro";
    const deliveryTexto = entregaRetirada.descricao_entregas ||
      `Entregas para Fortaleza e região metropolitana via UBER envios / Motoboy (${taxaEntregaDesc})`;

    const freteGratisAtivo = Boolean(shipping.frete_gratis_ativo || loja.frete_gratis_ativo);
    const freteGratisMin = Number(shipping.frete_gratis_valor_minimo || loja.frete_gratis_valor_minimo || 0);
    const freteGratisTexto = freteGratisAtivo && freteGratisMin > 0
      ? `Frete Grátis disponível para compras a partir de R$ ${freteGratisMin.toFixed(2)}`
      : "Consulte condições de entrega";

    const chavePix = pagamentos.pix_chave ? `Chave: ${pagamentos.pix_chave}` : "Chave Pix informada ao fechar o pedido";
    const pixTexto = pagamentos.pix_ativo !== false ? `Pix (${chavePix})` : "Não aceito";
    const cartaoTexto = (pagamentos.credito_ativo !== false || pagamentos.debito_ativo !== false)
      ? "Cartões de Crédito e Débito (maquininha na entrega ou link digital seguro)"
      : "Consulte condições";
    const dinheiroTexto = pagamentos.dinheiro_ativo !== false
      ? "Dinheiro em espécie (favor informar se necessita de troco)"
      : "Não aceito";

    const tempoEstimadoEntrega = configExtras.horarios_funcionamento?.tempoEntrega || "30 a 50 minutos";

    const itemCache: CatalogoCacheItem = {
      timestamp: agora,
      catalogoFormatado,
      totalProdutos: produtosRaw.length,
      dadosOperacionais: {
        origemEndereco,
        retiradaTexto,
        deliveryTexto,
        freteGratisTexto,
        pixTexto,
        cartaoTexto,
        dinheiroTexto,
        tempoEstimadoEntrega
      }
    };

    cacheCatalogoLojas.set(loja.id, itemCache);
    return itemCache;
  } catch (err: any) {
    console.error("[WhatsAppWebhook] Erro em getCatalogoLoja:", err?.message || err);
    return {
      timestamp: agora,
      catalogoFormatado: "Catálogo temporariamente indisponível para consulta.",
      totalProdutos: 0,
      dadosOperacionais: {
        origemEndereco: "Consulte nosso balcão",
        retiradaTexto: "Consulte balcão",
        deliveryTexto: "Entregas para Fortaleza e região metropolitana",
        freteGratisTexto: "",
        pixTexto: "Pix",
        cartaoTexto: "Cartões",
        dinheiroTexto: "Dinheiro",
        tempoEstimadoEntrega: "40 minutos"
      }
    };
  }
}

/**
 * Calcula o status de expediente da loja no fuso horário oficial de Fortaleza (America/Fortaleza = UTC-3)
 */
function obterStatusExpediente(loja: any) {
  const agora = new Date();

  // Fuso horário oficial do Ceará / Fortaleza
  const horaMinutoStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(agora);

  const diaSemanaStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    weekday: "long"
  }).format(agora);

  const [horas, minutos] = horaMinutoStr.split(":").map(Number);
  const minutosAtuais = horas * 60 + minutos;

  // Horários configurados na loja ou padrão comercial de Fortaleza (08:00 às 22:00)
  const configHorarios = loja.configuracoes_extras?.horarios_funcionamento || {};
  const aberturaMin = typeof configHorarios.aberturaMin === "number" ? configHorarios.aberturaMin : (8 * 60);
  const fechamentoMin = typeof configHorarios.fechamentoMin === "number" ? configHorarios.fechamentoMin : (22 * 60);
  const diasFechados: string[] = Array.isArray(configHorarios.diasFechados) ? configHorarios.diasFechados : [];

  const diaMinusculo = diaSemanaStr.toLowerCase();
  const diaFechado = diasFechados.some((d) => diaMinusculo.includes(d.toLowerCase()));
  const dentroDoHorario = minutosAtuais >= aberturaMin && minutosAtuais < fechamentoMin;

  const estaAberto = !diaFechado && dentroDoHorario;
  const horarioExibicao = configHorarios.descricao ||
    "Segunda a Sábado das 08:00 às 22:00 (Domingos e Feriados das 14:00 às 21:00)";

  return {
    estaAberto,
    horaAtualFortaleza: horaMinutoStr,
    diaSemanaFortaleza: diaSemanaStr,
    horarioExibicao
  };
}

/**
 * Constrói o contexto dinâmico do agente de IA alinhado à Rubi (System Instruction com RAG estruturado)
 */
function montarPromptAtendimento(
  loja: any,
  nomeCliente: string,
  catalogoFormatado: string,
  dadosOperacionais: any,
  dadosExpediente: any,
  temAudio: boolean
): string {
  // Identificar Persona do Nicho
  const configExtras = loja.configuracoes_extras || {};
  const perfilNegocio = configExtras.perfil_negocio || {};
  const iaConfig = configExtras.ia || {};
  const segmento = (loja.segmento || perfilNegocio.segmento || iaConfig.segmento || "geral").toLowerCase();
  const personaInfo = PERSONAS_SEGMENTO[segmento] || PERSONAS_SEGMENTO.geral;

  const nomeLoja = loja.nome_fantasia || "HOTAMAZON";
  const catalogoLink = loja.slug_catalogo
    ? `https://hubi.com.br/catalogo/${loja.slug_catalogo}`
    : "";

  const instrucaoAudio = temAudio
    ? `
🎧 O CLIENTE ENVIOU UM ÁUDIO DE VOZ NO WHATSAPP (ANEXO ACIMA):
Ouça o áudio com atenção aos detalhes, compreenda cada dúvida, tom e intenção expressa na fala do cliente. Responda diretamente ao que ele disse no áudio com assertividade, simpatia e conhecimento pleno dos produtos da loja!
`
    : "";

  const avisoExpediente = !dadosExpediente.estaAberto
    ? `
⚠️ STATUS DE EXPEDIENTE DA LOJA: FORA DO HORÁRIO DE EXPEDIÇÃO IMEDIATA
• Horário atual em Fortaleza: ${dadosExpediente.horaAtualFortaleza} (${dadosExpediente.diaSemanaFortaleza}).
• Nosso horário regular de entregas: ${dadosExpediente.horarioExibicao}.
• REGRA FORA DE HORÁRIO: Avise com gentileza que no momento nossa equipe de entregas imediatas está fora do expediente presencial, mas continue o atendimento normalmente com atenção, tirando dúvidas de produtos e montando o pedido do cliente para ser preparado e despachado com prioridade total na abertura do próximo turno!`
    : `
✅ STATUS DE EXPEDIENTE DA LOJA: ABERTO E OPERANDO
• Horário atual em Fortaleza: ${dadosExpediente.horaAtualFortaleza} (${dadosExpediente.diaSemanaFortaleza}). Entregas e atendimento a todo vapor!`;

  return `
Você é a **Rubi**, a ${personaInfo.papel} da loja **${nomeLoja}** no atendimento ao cliente pelo WhatsApp.
SEGMENTO DA LOJA: ${segmento} - ${personaInfo.diretriz}

DADOS DA LOJA & PARÂMETROS OPERACIONAIS:
- Nome da Loja: ${nomeLoja}
- Endereço / Localização: ${dadosOperacionais.origemEndereco}
- Retirada no Balcão: ${dadosOperacionais.retiradaTexto}
- Entregas para Fortaleza e Região: ${dadosOperacionais.deliveryTexto}
- Política de Frete Grátis: ${dadosOperacionais.freteGratisTexto}
- Formas de Pagamento Aceitas:
  • Pix: ${dadosOperacionais.pixTexto}
  • Cartões: ${dadosOperacionais.cartaoTexto}
  • Dinheiro: ${dadosOperacionais.dinheiroTexto}
- Tempo Estimado de Preparo/Entrega: ${dadosOperacionais.tempoEstimadoEntrega}
${catalogoLink ? `- Link Oficial do Catálogo Online: ${catalogoLink}` : ""}
${loja.prompt_personalizado ? `- Diretrizes Específicas do Lojista: "${loja.prompt_personalizado}"` : ""}

${avisoExpediente}

CLIENTE ATUAL: ${nomeCliente ? `"${nomeCliente}"` : "Nome não informado"}

CARDÁPIO / CATÁLOGO DINÂMICO DA LOJA (Produtos reais cadastrados no estoque):
${catalogoFormatado}

🚨 DIRETRIZES INVIOLÁVEIS DE ATENDIMENTO E ENGENHARIA DE PROMPT:
1. REGRAS COMERCIAIS RÍGIDAS & ZERO ALUCINAÇÃO:
   - Você SÓ PODE oferecer, detalhar ou confirmar produtos, sabores, opções e preços que constam LITERALMENTE no "CARDÁPIO / CATÁLOGO DINÂMICO DA LOJA" acima!
   - NUNCA invente itens inexistentes, marcas fictícias ou complementos ausentes.
   - Use rigorosamente os valores numéricos informados (se custa 16.00, informe exatamente R$ 16,00).
   - ITENS ESGOTADOS: Se o cliente solicitar um item marcado com [ESGOTADO NO MOMENTO], informe educadamente a indisponibilidade e sugira as melhores alternativas similares ativas no cardápio.

2. COMUNICAÇÃO NATURAL PARA WHATSAPP:
   - Mensagens curtas, agradáveis e fáceis de ler no celular.
   - Use negrito com moderação para destacar nomes de produtos e valores (ex: *Copo 300ml*, *R$ 16,00*).
   - Use listas com bullets simples quando listar opções.
   - Evite blocos cansativos de texto. Mantenha parágrafos objetivos (2 a 3 parágrafos curtos no máximo).
   - Fale sempre com cordialidade, entusiasmo acolhedor, respeito e empatia.

3. CONDUÇÃO DO FUNIL DE VENDAS E FECHAMENTO DE PEDIDO:
   - PASSO 1 (Acolhimento): Identifique se o cliente quer tirar dúvidas de produtos, fazer um pedido ou suporte.
   - PASSO 2 (Escolha dos Itens): Ao receber o interesse, confirme o item, tamanho, sabor/variação e quantidade desejada.
   - PASSO 3 (Entrega ou Retirada): Pergunte se deseja receber por Delivery ou Retirar no balcão da loja. Se for entrega, solicite o endereço completo com bairro e ponto de referência para conferência da rota em Fortaleza/Região.
   - PASSO 4 (Forma de Pagamento): Confirme como prefere pagar (Pix, Cartão de Crédito/Débito, ou Dinheiro informando se necessita de troco).
   - PASSO 5 (Resumo e Finalização): Apresente o resumo prévio com os itens escolhidos, subtotal e previsão para confirmação final do cliente.

4. TRANSBORDO / ATENDIMENTO HUMANO:
   - Caso o cliente solicite explicitamente falar com um atendente humano ou demonstre insatisfação recorrente, acione a ferramenta 'solicitar_atendente_humano' ou informe com cordialidade que a equipe humana foi notificada.

5. USO DE FERRAMENTAS / FUNCTION CALLING (GRAVAÇÃO DO PEDIDO):
   - Quando o cliente concordar com os itens, endereço/método de entrega e forma de pagamento, invoque IMEDIATAMENTE a ferramenta 'registrar_pedido' com os dados validados.
   - NUNCA diga que o pedido foi gerado ou finalizado sem antes acionar a ferramenta 'registrar_pedido'!
   - Se o cliente solicitar falar com atendente ou pessoa da equipe, invoque a ferramenta 'solicitar_atendente_humano'.

${instrucaoAudio}
Responda diretamente ao cliente agora com base no histórico da conversa e no catálogo ativo:
`.trim();
}
