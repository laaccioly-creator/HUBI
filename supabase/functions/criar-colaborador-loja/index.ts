// Supabase Edge Function: criar-colaborador-loja
// Criação e atualização segura de colaboradores (Auth + public.usuarios_loja)
// Arquitetura 100% Relacional (zero JSONB) e blindagem contra FK usuarios_loja_usuario_auth_id_fkey.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface ColaboradorPayload {
  id?: string | null;
  loja_id: string;
  nome_completo: string;
  email?: string | null;
  whatsapp_atendimento?: string | null;
  senha?: string | null;
  perfil: string;
  ativo?: boolean;
  usuario_auth_id?: string | null;
  pode_trocar_loja?: boolean;
  pode_uso_celular_pessoal?: boolean;
  pode_ver_transacoes_outros?: boolean;
  pode_dar_desconto?: boolean;
  pode_cadastrar_alterar_produtos?: boolean;
  pode_gerenciar_estoque?: boolean;
  pode_ativar_fiado?: boolean;
  pode_abrir_fechar_caixa?: boolean;
  pode_ver_preco_custo?: boolean;
  pode_exportar_relatorios?: boolean;
  pode_editar_vendas_passadas?: boolean;
  presta_servicos?: boolean;
  especialidade_cargo?: string | null;
  tela_inicial?: string | null;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function localizarAuthUserPorEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  emailAlvo: string
): Promise<string | null> {
  const emailNorm = emailAlvo.trim().toLowerCase();
  if (!emailNorm) return null;

  let page = 1;
  const perPage = 1000;

  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) break;

    const encontrado = data.users.find(
      (u) => (u.email || "").trim().toLowerCase() === emailNorm
    );
    if (encontrado?.id) {
      return encontrado.id;
    }

    if (data.users.length < perPage) break;
    page++;
  }

  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse(
        { sucesso: false, error: "Configuração do servidor incompleta para gerenciar colaboradores." },
        500
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Validar JWT do solicitante
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return jsonResponse(
        { sucesso: false, error: "Sessão expirada ou não autenticada. Faça login novamente." },
        401
      );
    }

    const { data: userRes, error: authErr } = await supabaseAdmin.auth.getUser(token);
    const caller = userRes?.user;
    if (authErr || !caller?.id) {
      return jsonResponse(
        { sucesso: false, error: "Não foi possível validar sua autenticação. Faça login novamente." },
        401
      );
    }

    // 2. Ler e validar payload básico
    const body = (await req.json().catch(() => ({}))) as Partial<ColaboradorPayload>;
    const lojaId = String(body.loja_id || "").trim();
    const nomeLimpo = String(body.nome_completo || "").trim();
    const emailLimpo = String(body.email || "").trim().toLowerCase();
    const senhaLimpa = String(body.senha || "").trim();
    const perfil = String(body.perfil || "vendedor").trim() || "vendedor";
    const registroId = body.id ? String(body.id).trim() : null;

    if (!lojaId || !nomeLimpo) {
      return jsonResponse(
        { sucesso: false, error: "Informe a loja e o nome completo do colaborador." },
        400
      );
    }

    // 3. Validar autorização multi-tenant (owner, admin ou gerente da loja ou admin de conglomerado)
    let autorizado = false;

    const { data: perfisNaLoja } = await supabaseAdmin
      .from("usuarios_loja")
      .select("id, perfil, ativo, usuario_auth_id, email")
      .eq("loja_id", lojaId)
      .eq("ativo", true);

    const callerEmail = (caller.email || "").trim().toLowerCase();
    if (Array.isArray(perfisNaLoja)) {
      autorizado = perfisNaLoja.some((u) => {
        const mesmoAuth = u.usuario_auth_id === caller.id;
        const mesmoEmail = Boolean(callerEmail) && (u.email || "").trim().toLowerCase() === callerEmail;
        const ehGestor = ["owner", "admin", "gerente"].includes(String(u.perfil || "").toLowerCase());
        return (mesmoAuth || mesmoEmail) && ehGestor;
      });
    }

    if (!autorizado) {
      const { data: lojaAlvo } = await supabaseAdmin
        .from("lojas")
        .select("id, organizacao_id")
        .eq("id", lojaId)
        .maybeSingle();

      if (lojaAlvo?.organizacao_id) {
        const { data: org } = await supabaseAdmin
          .from("organizacoes")
          .select("dono_usuario_id")
          .eq("id", lojaAlvo.organizacao_id)
          .maybeSingle();

        if (org?.dono_usuario_id === caller.id) {
          autorizado = true;
        } else {
          const { data: outrasLojas } = await supabaseAdmin
            .from("lojas")
            .select("id")
            .eq("organizacao_id", lojaAlvo.organizacao_id);

          const idsOrg = (outrasLojas || []).map((l: { id: string }) => l.id);
          if (idsOrg.length > 0) {
            const { data: gestorOrg } = await supabaseAdmin
              .from("usuarios_loja")
              .select("id, perfil, pode_trocar_loja, usuario_auth_id, email")
              .in("loja_id", idsOrg)
              .eq("ativo", true);

            if (Array.isArray(gestorOrg)) {
              autorizado = gestorOrg.some((u) => {
                const mesmoAuth = u.usuario_auth_id === caller.id;
                const mesmoEmail = Boolean(callerEmail) && (u.email || "").trim().toLowerCase() === callerEmail;
                const p = String(u.perfil || "").toLowerCase();
                const podeMulti = p === "owner" || ((p === "admin" || p === "gerente") && Boolean(u.pode_trocar_loja));
                return (mesmoAuth || mesmoEmail) && podeMulti;
              });
            }
          }
        }
      }
    }

    if (!autorizado) {
      return jsonResponse(
        { sucesso: false, error: "Você não possui permissão de administrador ou gerente para gerenciar colaboradores desta loja." },
        403
      );
    }

    // 4. Impedir duplicidade de colaborador com o mesmo e-mail na mesma loja (novo cadastro)
    if (!registroId && emailLimpo) {
      const { data: duplicado } = await supabaseAdmin
        .from("usuarios_loja")
        .select("id")
        .eq("loja_id", lojaId)
        .ilike("email", emailLimpo)
        .limit(1)
        .maybeSingle();

      if (duplicado?.id) {
        return jsonResponse(
          {
            sucesso: false,
            codigo: "EMAIL_JA_CADASTRADO",
            error: "Já existe um colaborador cadastrado com este e-mail ou celular nesta loja.",
          },
          409
        );
      }
    }

    // 5. Resolver ou criar usuário oficial em auth.users (garantindo que usuario_auth_id nunca quebre FK)
    let authUserIdValidado: string | null = null;
    const authIdCandidato = body.usuario_auth_id ? String(body.usuario_auth_id).trim() : null;

    if (authIdCandidato) {
      const { data: existingById } = await supabaseAdmin.auth.admin.getUserById(authIdCandidato);
      if (existingById?.user?.id) {
        authUserIdValidado = existingById.user.id;
      }
    }

    if (!authUserIdValidado && emailLimpo) {
      authUserIdValidado = await localizarAuthUserPorEmail(supabaseAdmin, emailLimpo);

      if (!authUserIdValidado && senhaLimpa.length >= 6) {
        const { data: createdAuth, error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
          email: emailLimpo,
          password: senhaLimpa,
          email_confirm: true,
          user_metadata: {
            nome_completo: nomeLimpo,
            full_name: nomeLimpo,
            loja_id: lojaId,
            perfil,
          },
        });

        if (!createAuthErr && createdAuth?.user?.id) {
          authUserIdValidado = createdAuth.user.id;
        } else if (createAuthErr) {
          // Corrida eventual: tenta localizar novamente por e-mail caso já exista
          authUserIdValidado = await localizarAuthUserPorEmail(supabaseAdmin, emailLimpo);
        }
      }
    }

    // Se estiver editando colaborador com nova senha e já houver authUserIdValidado, sincroniza senha no Auth
    if (registroId && authUserIdValidado && senhaLimpa.length >= 6) {
      await supabaseAdmin.auth.admin
        .updateUserById(authUserIdValidado, { password: senhaLimpa })
        .catch(() => null);
    }

    // 6. Montar payload relacional puro (zero JSONB) para public.usuarios_loja
    const ehOwner = perfil === "owner";
    const ehAdmin = ehOwner || perfil === "admin";

    const payloadDb: Record<string, unknown> = {
      loja_id: lojaId,
      nome_completo: nomeLimpo,
      email: emailLimpo || null,
      whatsapp_atendimento: body.whatsapp_atendimento?.trim() || null,
      perfil,
      pode_trocar_loja: ehOwner ? true : ehAdmin ? Boolean(body.pode_trocar_loja) : false,
      pode_uso_celular_pessoal: ehAdmin ? true : (body.pode_uso_celular_pessoal ?? true),
      pode_ver_transacoes_outros: ehAdmin ? true : (body.pode_ver_transacoes_outros ?? false),
      pode_dar_desconto: ehAdmin ? true : (body.pode_dar_desconto ?? false),
      pode_cadastrar_alterar_produtos: ehAdmin ? true : (body.pode_cadastrar_alterar_produtos ?? false),
      pode_gerenciar_estoque: ehAdmin ? true : (body.pode_gerenciar_estoque ?? false),
      pode_ativar_fiado: ehAdmin ? true : (body.pode_ativar_fiado ?? false),
      pode_abrir_fechar_caixa: ehAdmin ? true : (body.pode_abrir_fechar_caixa ?? false),
      pode_ver_preco_custo: ehAdmin || Boolean(body.pode_ver_preco_custo),
      pode_exportar_relatorios: ehAdmin || Boolean(body.pode_exportar_relatorios),
      pode_editar_vendas_passadas: ehAdmin || Boolean(body.pode_editar_vendas_passadas),
      presta_servicos: Boolean(body.presta_servicos),
      especialidade_cargo: body.especialidade_cargo?.trim() || null,
      tela_inicial: body.tela_inicial || (ehAdmin || perfil === "gerente" ? "dashboard" : "pos"),
      ativo: ehOwner ? true : (body.ativo ?? true),
      usuario_auth_id: authUserIdValidado,
    };

    if (senhaLimpa.length >= 6) {
      payloadDb.senha_hash = senhaLimpa;
    }

    let usuarioSalvo: Record<string, unknown> | null = null;
    if (registroId) {
      const { data: updData, error: updErr } = await supabaseAdmin
        .from("usuarios_loja")
        .update(payloadDb)
        .eq("id", registroId)
        .eq("loja_id", lojaId)
        .select()
        .single();

      if (updErr) {
        return jsonResponse(
          { sucesso: false, error: "Não foi possível atualizar os dados do colaborador. Verifique as informações e tente novamente." },
          400
        );
      }
      usuarioSalvo = updData as Record<string, unknown>;
    } else {
      const { data: insData, error: insErr } = await supabaseAdmin
        .from("usuarios_loja")
        .insert([payloadDb])
        .select()
        .single();

      if (insErr) {
        const msgTraduzida = insErr.code === "23505"
          ? "Já existe um colaborador cadastrado com este e-mail ou celular nesta loja."
          : "Não foi possível concluir o cadastro do colaborador no banco de dados.";
        return jsonResponse({ sucesso: false, error: msgTraduzida }, insErr.code === "23505" ? 409 : 400);
      }
      usuarioSalvo = insData as Record<string, unknown>;
    }

    return jsonResponse({ sucesso: true, usuario: usuarioSalvo }, 200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno ao gerenciar colaborador.";
    console.error("[criar-colaborador-loja] Exceção:", msg);
    return jsonResponse(
      { sucesso: false, error: "Ocorreu um erro inesperado ao salvar o colaborador. Tente novamente." },
      500
    );
  }
});
