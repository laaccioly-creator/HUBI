import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UsuarioLoja, PerfilUsuario } from '../types';

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || 'https://eylpiwynsbnmcacmwiqg.supabase.co';
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_SNuv08eSyBClEQWGF3Z3oQ_28nI--9P';

// Cliente isolado do Supabase Auth mantido para compatibilidade com AuthContext (sem sobrescrever sessão local)
export const authClientIsolado = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'hubi_auth_isolated_storage',
    storage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    }
  }
});

export interface SalvarOperadorParams {
  id?: string;
  lojaId: string;
  nomeCompleto: string;
  email: string;
  whatsappAtendimento?: string | null;
  senha?: string;
  perfil: PerfilUsuario;
  ativo?: boolean;
  usuarioAuthId?: string | null;
  // Permissões granulares
  podeUsoCelularPessoal?: boolean;
  podeVerTransacoesOutros?: boolean;
  podeDarDesconto?: boolean;
  podeCadastrarAlterarProdutos?: boolean;
  podeGerenciarEstoque?: boolean;
  podeAtivarFiado?: boolean;
  podeAbrirFecharCaixa?: boolean;
  podeVerPrecoCusto?: boolean;
  podeExportarRelatorios?: boolean;
  podeEditarVendasPassadas?: boolean;
  podeTrocarLoja?: boolean;
  prestaServicos?: boolean;
  especialidadeCargo?: string | null;
  telaInicial?: string;
}

function traduzirErroColaborador(err: unknown): string {
  const raw = err as { message?: string; code?: string; details?: string } | null;
  const code = String(raw?.code || '');
  const msg = String(raw?.message || '');
  const lower = msg.toLowerCase();

  if (code === '23505' || lower.includes('duplicate key') || lower.includes('já existe um colaborador')) {
    return 'Já existe um colaborador cadastrado com este e-mail ou celular nesta loja.';
  }
  if (code === '23503' || lower.includes('foreign key') || lower.includes('usuarios_loja_usuario_auth_id_fkey')) {
    return 'Não foi possível vincular a autenticação deste colaborador. Tente salvar novamente.';
  }
  if (code === '42501' || lower.includes('permissão insuficiente') || lower.includes('row-level security')) {
    return 'Você não possui permissão de administrador ou gerente para gerenciar colaboradores nesta loja.';
  }
  if (msg && !lower.includes('violates') && !lower.includes('usuarios_loja') && !lower.includes('sqlstate')) {
    return msg;
  }
  return 'Erro ao gravar usuário no banco de dados. Tente novamente.';
}

async function extrairErroEdgeFunction(error: any, data: any): Promise<{ ehRegraNegocio: boolean; mensagem: string }> {
  if (data && typeof data === 'object' && typeof data.error === 'string' && data.error.trim()) {
    return { ehRegraNegocio: true, mensagem: data.error.trim() };
  }

  const context = error?.context;
  if (context && typeof context.json === 'function') {
    try {
      const status = Number(context.status || 0);
      const body = await context.json();
      if (body && typeof body.error === 'string' && body.error.trim()) {
        return {
          ehRegraNegocio: status >= 400 && status < 500,
          mensagem: body.error.trim(),
        };
      }
    } catch {
      // ignora erro ao ler payload HTTP
    }
  }

  return { ehRegraNegocio: false, mensagem: '' };
}

export const usuarioService = {
  /**
   * Cria ou atualiza operador de loja via Edge Function `criar-colaborador-loja`
   * com fallback seguro para a RPC `criar_usuario_operador` (sem jamais enviar UUID fictício em `usuario_auth_id`).
   */
  async salvarOperador(params: SalvarOperadorParams): Promise<UsuarioLoja> {
    const nomeLimpo = params.nomeCompleto.trim();

    // Normalização canônica do WhatsApp e E-mail técnico HUBI
    // Padrão canônico: 55 + DDD + Número + @hubi.app (ex: 5585997374372@hubi.app)
    const rawDigitsWhats = params.whatsappAtendimento ? params.whatsappAtendimento.replace(/\D/g, '') : '';
    let emailLimpo = params.email.trim().toLowerCase();
    let whatsappFinal: string | null = null;

    if (rawDigitsWhats) {
      const telefoneNormalizadoCom55 = (rawDigitsWhats.length === 10 || rawDigitsWhats.length === 11)
        ? `55${rawDigitsWhats}`
        : (rawDigitsWhats.startsWith('55') && (rawDigitsWhats.length === 12 || rawDigitsWhats.length === 13) ? rawDigitsWhats : `55${rawDigitsWhats}`);

      // Se não for um e-mail tradicional externo (ex: @gmail.com), adota estritamente o padrão canônico @hubi.app
      const ehEmailExterno = emailLimpo.includes('@') && !emailLimpo.includes('@hubi.');
      if (!ehEmailExterno) {
        emailLimpo = `${telefoneNormalizadoCom55}@hubi.app`;
      }

      whatsappFinal = rawDigitsWhats.startsWith('55') && (rawDigitsWhats.length === 12 || rawDigitsWhats.length === 13)
        ? rawDigitsWhats.slice(2)
        : rawDigitsWhats;
    } else if (emailLimpo.includes('@hubi.internal') || emailLimpo.includes('@hubi.app')) {
      const parteNumerica = emailLimpo.replace(/@hubi\.(internal|app)/, '').replace(/\D/g, '');
      const telefoneNormalizadoCom55 = (parteNumerica.length === 10 || parteNumerica.length === 11)
        ? `55${parteNumerica}`
        : parteNumerica;
      emailLimpo = `${telefoneNormalizadoCom55}@hubi.app`;
      whatsappFinal = parteNumerica.startsWith('55') && (parteNumerica.length === 12 || parteNumerica.length === 13)
        ? parteNumerica.slice(2)
        : parteNumerica;
    } else if (params.whatsappAtendimento) {
      whatsappFinal = params.whatsappAtendimento.trim();
    }

    const ehOwner = params.perfil === 'owner';
    const ehAdmin = ehOwner || params.perfil === 'admin';
    const senhaLimpa = params.senha?.trim() || undefined;
    const telaInicialEfetiva = params.telaInicial || (ehAdmin || params.perfil === 'gerente' ? 'dashboard' : 'pos');

    let authUserIdExistente: string | null = params.usuarioAuthId || null;
    if (!authUserIdExistente) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email?.toLowerCase() === emailLimpo) {
        authUserIdExistente = session.user.id;
      }
    }

    // 1. Rota Principal: Edge Function administrativa `criar-colaborador-loja`
    // Cria/vincula usuário oficial em auth.users e grava public.usuarios_loja atomicamente
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('criar-colaborador-loja', {
        body: {
          id: params.id || null,
          loja_id: params.lojaId,
          nome_completo: nomeLimpo,
          email: emailLimpo,
          whatsapp_atendimento: whatsappFinal,
          senha: senhaLimpa,
          perfil: params.perfil,
          ativo: ehOwner ? true : (params.ativo ?? true),
          usuario_auth_id: authUserIdExistente,
          pode_trocar_loja: ehOwner ? true : (ehAdmin ? Boolean(params.podeTrocarLoja) : false),
          pode_uso_celular_pessoal: ehAdmin ? true : (params.podeUsoCelularPessoal ?? true),
          pode_ver_transacoes_outros: ehAdmin ? true : (params.podeVerTransacoesOutros ?? false),
          pode_dar_desconto: ehAdmin ? true : (params.podeDarDesconto ?? false),
          pode_cadastrar_alterar_produtos: ehAdmin ? true : (params.podeCadastrarAlterarProdutos ?? false),
          pode_gerenciar_estoque: ehAdmin ? true : (params.podeGerenciarEstoque ?? false),
          pode_ativar_fiado: ehAdmin ? true : (params.podeAtivarFiado ?? false),
          pode_abrir_fechar_caixa: ehAdmin ? true : (params.podeAbrirFecharCaixa ?? false),
          pode_ver_preco_custo: ehAdmin || Boolean(params.podeVerPrecoCusto),
          pode_exportar_relatorios: ehAdmin || Boolean(params.podeExportarRelatorios),
          pode_editar_vendas_passadas: ehAdmin || Boolean(params.podeEditarVendasPassadas),
          presta_servicos: Boolean(params.prestaServicos),
          especialidade_cargo: params.especialidadeCargo?.trim() || null,
          tela_inicial: telaInicialEfetiva,
        },
      });

      if (!fnErr && fnData?.sucesso && fnData?.usuario) {
        return fnData.usuario as UsuarioLoja;
      }

      if (fnErr || (fnData && !fnData.sucesso)) {
        const { ehRegraNegocio, mensagem } = await extrairErroEdgeFunction(fnErr, fnData);
        if (ehRegraNegocio && mensagem) {
          throw new Error(mensagem);
        }
      }
    } catch (edgeEx: unknown) {
      if (edgeEx instanceof Error && (
        edgeEx.message.includes('Já existe um colaborador') ||
        edgeEx.message.includes('permissão') ||
        edgeEx.message.includes('Sessão expirada')
      )) {
        throw edgeEx;
      }
      // Edge Function indisponível: prossegue para fallback seguro na RPC
    }

    // 2. Fallback Seguro: RPC `criar_usuario_operador` (valida auth.users no banco e evita violar FK)
    try {
      const { data: rpcUser, error: rpcErr } = await supabase.rpc('criar_usuario_operador', {
        p_loja_id: params.lojaId,
        p_nome_completo: nomeLimpo,
        p_email: emailLimpo,
        p_whatsapp_atendimento: whatsappFinal,
        p_senha_hash: senhaLimpa || null,
        p_perfil: params.perfil,
        p_usuario_auth_id: authUserIdExistente,
        p_pode_trocar_loja: ehOwner ? true : (ehAdmin ? Boolean(params.podeTrocarLoja) : false),
        p_pode_uso_celular_pessoal: ehAdmin ? true : (params.podeUsoCelularPessoal ?? true),
        p_pode_ver_transacoes_outros: ehAdmin ? true : (params.podeVerTransacoesOutros ?? false),
        p_pode_dar_desconto: ehAdmin ? true : (params.podeDarDesconto ?? false),
        p_pode_cadastrar_alterar_produtos: ehAdmin ? true : (params.podeCadastrarAlterarProdutos ?? false),
        p_pode_gerenciar_estoque: ehAdmin ? true : (params.podeGerenciarEstoque ?? false),
        p_pode_ativar_fiado: ehAdmin ? true : (params.podeAtivarFiado ?? false),
        p_pode_abrir_fechar_caixa: ehAdmin ? true : (params.podeAbrirFecharCaixa ?? false),
        p_pode_ver_preco_custo: ehAdmin || Boolean(params.podeVerPrecoCusto),
        p_pode_exportar_relatorios: ehAdmin || Boolean(params.podeExportarRelatorios),
        p_pode_editar_vendas_passadas: ehAdmin || Boolean(params.podeEditarVendasPassadas),
        p_presta_servicos: Boolean(params.prestaServicos),
        p_especialidade_cargo: params.especialidadeCargo?.trim() || null,
        p_tela_inicial: telaInicialEfetiva,
        p_ativo: ehOwner ? true : (params.ativo ?? true),
        p_id: params.id || null,
      });

      if (!rpcErr && rpcUser) {
        return rpcUser as UsuarioLoja;
      }

      if (rpcErr && !['42883', 'PGRST202'].includes(String(rpcErr.code || ''))) {
        throw new Error(traduzirErroColaborador(rpcErr));
      }
    } catch (rpcEx: unknown) {
      if (rpcEx instanceof Error && !rpcEx.message.includes('criar_usuario_operador')) {
        throw rpcEx;
      }
    }

    // 3. Último Fallback: Persistência direta em `usuarios_loja` sem jamais enviar UUID inventado em usuario_auth_id
    const payload: Partial<UsuarioLoja> = {
      loja_id: params.lojaId,
      nome_completo: nomeLimpo,
      email: emailLimpo,
      whatsapp_atendimento: whatsappFinal,
      perfil: params.perfil,
      pode_trocar_loja: ehOwner ? true : (ehAdmin ? Boolean(params.podeTrocarLoja) : false),
      pode_uso_celular_pessoal: ehAdmin ? true : (params.podeUsoCelularPessoal ?? true),
      pode_ver_transacoes_outros: ehAdmin ? true : (params.podeVerTransacoesOutros ?? false),
      pode_dar_desconto: ehAdmin ? true : (params.podeDarDesconto ?? false),
      pode_cadastrar_alterar_produtos: ehAdmin ? true : (params.podeCadastrarAlterarProdutos ?? false),
      pode_gerenciar_estoque: ehAdmin ? true : (params.podeGerenciarEstoque ?? false),
      pode_ativar_fiado: ehAdmin ? true : (params.podeAtivarFiado ?? false),
      pode_abrir_fechar_caixa: ehAdmin ? true : (params.podeAbrirFecharCaixa ?? false),
      pode_ver_preco_custo: ehAdmin || (params.podeVerPrecoCusto ?? false),
      pode_exportar_relatorios: ehAdmin || (params.podeExportarRelatorios ?? false),
      pode_editar_vendas_passadas: ehAdmin || (params.podeEditarVendasPassadas ?? false),
      presta_servicos: Boolean(params.prestaServicos),
      especialidade_cargo: params.especialidadeCargo?.trim() || null,
      tela_inicial: telaInicialEfetiva,
      ativo: ehOwner ? true : (params.ativo ?? true),
      usuario_auth_id: params.id ? (authUserIdExistente || null) : null,
    };

    if (senhaLimpa) {
      payload.senha_hash = senhaLimpa;
    }

    let usuarioSalvo: UsuarioLoja;

    if (params.id) {
      const { data: updateData, error: updateErr } = await supabase
        .from('usuarios_loja')
        .update(payload)
        .eq('id', params.id)
        .eq('loja_id', params.lojaId)
        .select()
        .single();

      if (updateErr) throw new Error(traduzirErroColaborador(updateErr));
      usuarioSalvo = updateData as UsuarioLoja;
    } else {
      const { data: existenteLoja } = await supabase
        .from('usuarios_loja')
        .select('id')
        .eq('loja_id', params.lojaId)
        .ilike('email', emailLimpo)
        .limit(1)
        .maybeSingle();

      if (existenteLoja?.id) {
        throw new Error('Já existe um colaborador cadastrado com este e-mail ou celular nesta loja.');
      }

      const { data: insertData, error: insertErr } = await supabase
        .from('usuarios_loja')
        .insert([payload])
        .select()
        .single();

      if (insertErr) throw new Error(traduzirErroColaborador(insertErr));
      usuarioSalvo = insertData as UsuarioLoja;
    }

    return usuarioSalvo;
  },

  /**
   * Exclui um operador da loja
   */
  async excluirOperador(usuarioId: string, lojaId?: string): Promise<void> {
    let query = supabase
      .from('usuarios_loja')
      .delete()
      .eq('id', usuarioId);

    if (lojaId) {
      query = query.eq('loja_id', lojaId);
    }

    const { error } = await query;
    if (error) throw new Error(traduzirErroColaborador(error));
  }
};
