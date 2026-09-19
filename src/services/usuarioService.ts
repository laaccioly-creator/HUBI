import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UsuarioLoja, PerfilUsuario } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://eylpiwynsbnmcacmwiqg.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_SNuv08eSyBClEQWGF3Z3oQ_28nI--9P';

// Cliente isolado do Supabase Auth para registrar novos operadores sem sobrescrever a sessão do administrador local
const authClientIsolado = createClient(supabaseUrl, supabaseAnonKey, {
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
}

export const usuarioService = {
  /**
   * Cria ou atualiza operador de loja, assegurando vínculo e credencial no Supabase Auth
   */
  async salvarOperador(params: SalvarOperadorParams): Promise<UsuarioLoja> {
    const nomeLimpo = params.nomeCompleto.trim();
    const emailLimpo = params.email.trim().toLowerCase();

    let authUserId: string | null = params.usuarioAuthId || null;

    // Se o usuário ainda não possui vínculo de auth ou é um novo cadastro e foi fornecida senha
    if (!authUserId && params.senha && params.senha.trim().length >= 6) {
      // 1. Tenta criar usuário via RPC administrativa caso exista no banco
      try {
        const { data: rpcUser, error: rpcErr } = await supabase.rpc('criar_usuario_operador', {
          p_email: emailLimpo,
          p_senha: params.senha.trim(),
          p_nome: nomeLimpo,
          p_loja_id: params.lojaId
        });
        if (!rpcErr && rpcUser?.id) {
          authUserId = rpcUser.id;
        }
      } catch {
        // RPC não configurada ou sem suporte; prossegue com signUp isolado
      }

      // 2. Criação oficial via cliente isolado do Supabase Auth (sem deslogar o admin)
      if (!authUserId) {
        try {
          const { data: signUpData, error: signUpErr } = await authClientIsolado.auth.signUp({
            email: emailLimpo,
            password: params.senha.trim(),
            options: {
              data: {
                full_name: nomeLimpo,
                loja_id: params.lojaId,
                perfil: params.perfil
              }
            }
          });

          if (signUpErr) {
            // Se o e-mail já existe no Supabase Auth, não bloqueia o vínculo na loja
            if (!signUpErr.message.toLowerCase().includes('already registered')) {
              console.warn('Aviso ao registrar usuário no Supabase Auth:', signUpErr.message);
            }
          } else if (signUpData?.user?.id) {
            authUserId = signUpData.user.id;
          }
        } catch (authErr) {
          console.warn('Erro ao chamar signUp isolado:', authErr);
        }
      }
    }

    // Se o email coincidir com o usuário atualmente autenticado no navegador, herda o id
    if (!authUserId) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email?.toLowerCase() === emailLimpo) {
        authUserId = session.user.id;
      }
    }

    // Montar payload relacional tipado (sem campos JSONB)
    const ehOwner = params.perfil === 'owner';
    const ehAdmin = ehOwner || params.perfil === 'admin';

    const payload: Partial<UsuarioLoja> = {
      loja_id: params.lojaId,
      nome_completo: nomeLimpo,
      email: emailLimpo,
      perfil: params.perfil,
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
      ativo: ehOwner ? true : (params.ativo ?? true)
    };

    if (authUserId) {
      payload.usuario_auth_id = authUserId;
    }
    if (params.senha && params.senha.trim()) {
      payload.senha_hash = params.senha.trim();
    }

    let usuarioSalvo: UsuarioLoja;

    if (params.id) {
      const { data: updateData, error: updateErr } = await supabase
        .from('usuarios_loja')
        .update(payload)
        .eq('id', params.id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      usuarioSalvo = updateData as UsuarioLoja;
    } else {
      const { data: insertData, error: insertErr } = await supabase
        .from('usuarios_loja')
        .insert([payload])
        .select()
        .single();

      if (insertErr) throw insertErr;
      usuarioSalvo = insertData as UsuarioLoja;
    }

    // Sincronização referencial via RPC de segurança
    try {
      await supabase.rpc('sincronizar_meu_usuario_auth');
    } catch (syncErr) {
      console.warn('Aviso ao sincronizar usuario_auth_id via RPC:', syncErr);
    }

    return usuarioSalvo;
  },

  /**
   * Exclui um operador da loja
   */
  async excluirOperador(usuarioId: string): Promise<void> {
    const { error } = await supabase
      .from('usuarios_loja')
      .delete()
      .eq('id', usuarioId);

    if (error) throw error;
  }
};
