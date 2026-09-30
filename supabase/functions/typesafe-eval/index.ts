// Supabase Edge Function: typesafe-eval
// Proxy seguro para a API System One (Jev) da TypeSafe AI
// Deploy: npx supabase functions deploy typesafe-eval --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface QuestionPayload {
  type: "choice" | "score" | "noul";
  instructions: string | Record<string, unknown> | Array<unknown>;
  criteria?: Record<string, unknown> | Array<unknown>;
}

interface RequestBody {
  state: string | Record<string, unknown> | Array<unknown>;
  questions: Record<string, QuestionPayload>;
  model?: string;
}

serve(async (req: Request) => {
  // Tratamento de preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ erro: "Método não permitido. Utilize POST." }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const apiKey = Deno.env.get("TYPESAFE_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          erro: "Chave TYPESAFE_API_KEY não configurada nos secrets do Supabase.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body: RequestBody = await req.json().catch(() => ({}));
    const { state, questions, model = "jev-latest" } = body;

    if (!state) {
      return new Response(
        JSON.stringify({ erro: "O campo 'state' é obrigatório no payload." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!questions || typeof questions !== "object" || Object.keys(questions).length === 0) {
      return new Response(
        JSON.stringify({ erro: "O mapa de perguntas 'questions' é obrigatório e deve conter ao menos uma questão." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Chamada oficial à API do TypeSafe (System One / Jev)
    const typesafeResponse = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        state,
        questions,
      }),
    });

    if (!typesafeResponse.ok) {
      const status = typesafeResponse.status;
      let mensagemAmigavel = "Falha na comunicação com a API do TypeSafe.";

      if (status === 401 || status === 403) {
        mensagemAmigavel = "Autenticação falhou com a API da TypeSafe. Verifique se o token é válido.";
      } else if (status === 429) {
        mensagemAmigavel = "Limite de requisições excedido na TypeSafe. Tente novamente em instantes.";
      } else if (status === 400 || status === 422) {
        mensagemAmigavel = "Formato de perguntas ou estado inválido para a avaliação do Jev.";
      }

      return new Response(
        JSON.stringify({ erro: mensagemAmigavel, status }),
        {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await typesafeResponse.json();

    return new Response(
      JSON.stringify({
        sucesso: true,
        model: data.model,
        answers: data.answers,
        usage: data.usage,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (_error) {
    // Sanitização estrita: jamais expor stack trace ao cliente final
    return new Response(
      JSON.stringify({ erro: "Ocorreu um erro interno ao processar a avaliação no servidor." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
