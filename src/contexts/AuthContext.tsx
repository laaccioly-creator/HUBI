import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loja, UsuarioLoja } from '../types';

interface AuthContextType {
  loja: Loja | null;
  usuario: UsuarioLoja | null;
  lojasDisponiveis: Loja[];
  carregando: boolean;
  setLoja: (loja: Loja | null) => void;
  selecionarLoja: (lojaId: string) => Promise<boolean>;
  selecionarUsuario: (usuarioId: string) => Promise<boolean>;
  cadastrarPdv: (dadosLoja: Partial<Loja>, dadosUsuario: Partial<UsuarioLoja>) => Promise<Loja>;
  cadastrarMinimalista: (params: { nome: string; email: string; senha?: string }) => Promise<Loja>;
  entrarComEmail: (email: string, senha?: string) => Promise<boolean>;
  entrarComGoogle: () => Promise<any>;
  desconectarPdv: () => void;
  recarregarDadosLoja: () => Promise<void>;
}

const STORAGE_KEY_LOJA_ID = 'hubi_active_loja_id';
const STORAGE_KEY_USUARIO_ID = 'hubi_active_usuario_id';

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loja, setLoja] = useState<Loja | null>(null);
  const [usuario, setUsuario] = useState<UsuarioLoja | null>(null);
  const [lojasDisponiveis, setLojasDisponiveis] = useState<Loja[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);

  // Carregar lojas e identificar se há uma loja ativa salva ou selecionada
  const carregarLoja = async () => {
    try {
      setCarregando(true);
      const activeLojaId = localStorage.getItem(STORAGE_KEY_LOJA_ID);
      const activeUsuarioId = localStorage.getItem(STORAGE_KEY_USUARIO_ID);

      // Autocura inicial se houver sessão ativa no Supabase Auth
      const { data: { session } } = await supabase.auth.getSession();
      const authUser = session?.user || null;

      if (authUser) {
        try {
          await supabase.rpc('sincronizar_meu_usuario_auth');
        } catch (rpcErr) {
          console.warn('Aviso ao sincronizar usuario_auth_id via RPC:', rpcErr);
        }
      }

      const { data: todasLojas, error: erroLojas } = await supabase
        .from('lojas')
        .select('*')
        .order('criado_em', { ascending: false });

      if (erroLojas) {
        console.warn('Aviso ao listar lojas:', erroLojas.message);
      }

      if (todasLojas && todasLojas.length > 0) {
        setLojasDisponiveis(todasLojas);

        let lojaParaAtivar: Loja | null = null;
        if (activeLojaId) {
          lojaParaAtivar = todasLojas.find(l => l.id === activeLojaId) || null;
        }

        if (!lojaParaAtivar && todasLojas.length === 1) {
          lojaParaAtivar = todasLojas[0];
        }

        if (lojaParaAtivar) {
          setLoja(lojaParaAtivar);
          localStorage.setItem(STORAGE_KEY_LOJA_ID, lojaParaAtivar.id);

          // Buscar usuário ativo da loja com autocura e fallback
          let usuarioAtivo: UsuarioLoja | null = null;

          if (authUser?.id) {
            // 1. Consulta prioritária por usuario_auth_id = user.id
            const { data: userPorAuthId } = await supabase
              .from('usuarios_loja')
              .select('*')
              .eq('usuario_auth_id', authUser.id)
              .eq('loja_id', lojaParaAtivar.id)
              .maybeSingle();

            if (userPorAuthId) {
              usuarioAtivo = userPorAuthId;
            } else if (authUser.email) {
              // 2. Fallback buscando por LOWER(email) = LOWER(user.email)
              const emailAuthLimpo = authUser.email.trim().toLowerCase();
              const { data: userPorEmail } = await supabase
                .from('usuarios_loja')
                .select('*')
                .ilike('email', emailAuthLimpo)
                .eq('loja_id', lojaParaAtivar.id)
                .maybeSingle();

              if (userPorEmail) {
                try {
                  await supabase
                    .from('usuarios_loja')
                    .update({ usuario_auth_id: authUser.id })
                    .eq('id', userPorEmail.id);
                  await supabase.rpc('sincronizar_meu_usuario_auth');
                  usuarioAtivo = { ...userPorEmail, usuario_auth_id: authUser.id };
                } catch (syncErr) {
                  console.warn('Erro ao atualizar usuario_auth_id no fallback:', syncErr);
                  usuarioAtivo = userPorEmail;
                }
              }
            }
          }

          if (!usuarioAtivo && activeUsuarioId) {
            const { data: userSalvo } = await supabase
              .from('usuarios_loja')
              .select('*')
              .eq('id', activeUsuarioId)
              .eq('loja_id', lojaParaAtivar.id)
              .maybeSingle();

            if (userSalvo) {
              const uSalvo = userSalvo as UsuarioLoja;
              if (authUser?.id && !uSalvo.usuario_auth_id) {
                try {
                  await supabase
                    .from('usuarios_loja')
                    .update({ usuario_auth_id: authUser.id })
                    .eq('id', uSalvo.id);
                  await supabase.rpc('sincronizar_meu_usuario_auth');
                  usuarioAtivo = { ...uSalvo, usuario_auth_id: authUser.id };
                } catch (vErr) {
                  console.warn('Aviso ao vincular usuario_auth_id:', vErr);
                  usuarioAtivo = uSalvo;
                }
              } else {
                usuarioAtivo = uSalvo;
              }
            }
          }

          if (!usuarioAtivo) {
            const { data: usuarios } = await supabase
              .from('usuarios_loja')
              .select('*')
              .eq('loja_id', lojaParaAtivar.id)
              .order('criado_em', { ascending: true });

            if (usuarios && usuarios.length > 0) {
              const primeiroUser = usuarios[0] as UsuarioLoja;
              if (authUser?.id && !primeiroUser.usuario_auth_id) {
                try {
                  await supabase
                    .from('usuarios_loja')
                    .update({ usuario_auth_id: authUser.id })
                    .eq('id', primeiroUser.id);
                  await supabase.rpc('sincronizar_meu_usuario_auth');
                  usuarioAtivo = { ...primeiroUser, usuario_auth_id: authUser.id };
                } catch (vErr) {
                  console.warn('Aviso ao vincular usuario_auth_id:', vErr);
                  usuarioAtivo = primeiroUser;
                }
              } else {
                usuarioAtivo = primeiroUser;
              }
            }
          }

          if (usuarioAtivo) {
            setUsuario(usuarioAtivo);
            localStorage.setItem(STORAGE_KEY_USUARIO_ID, usuarioAtivo.id);
          }
        } else {
          setLoja(null);
          setUsuario(null);
        }
      } else {
        setLojasDisponiveis([]);
        setLoja(null);
        setUsuario(null);
        localStorage.removeItem(STORAGE_KEY_LOJA_ID);
        localStorage.removeItem(STORAGE_KEY_USUARIO_ID);
      }
    } catch (err) {
      console.error('Erro de inicialização do PDV:', err);
      setLoja(null);
    } finally {
      setCarregando(false);
    }
  };

  // Selecionar um usuário/operador da loja
  const selecionarUsuario = async (usuarioId: string): Promise<boolean> => {
    try {
      const { data: userBuscado, error } = await supabase
        .from('usuarios_loja')
        .select('*')
        .eq('id', usuarioId)
        .single();

      if (error || !userBuscado) {
        console.warn('Usuário não encontrado:', usuarioId);
        return false;
      }

      // Limpa filtros salvos na sessão ao trocar de operador/usuário
      try {
        sessionStorage.clear();
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('hubi_filtro_') || key.startsWith('hubi_mob_filtro_')) {
            localStorage.removeItem(key);
          }
        });
      } catch {}

      setUsuario(userBuscado);
      localStorage.setItem(STORAGE_KEY_USUARIO_ID, userBuscado.id);
      return true;
    } catch (e) {
      console.error('Erro ao trocar de operador:', e);
      return false;
    }
  };

  // Selecionar uma loja existente
  const selecionarLoja = async (lojaId: string): Promise<boolean> => {
    try {
      setCarregando(true);
      const { data: lojaBuscada, error } = await supabase
        .from('lojas')
        .select('*')
        .eq('id', lojaId)
        .single();

      if (error || !lojaBuscada) {
        throw new Error('Não foi possível carregar a loja selecionada.');
      }

      setLoja(lojaBuscada);
      localStorage.setItem(STORAGE_KEY_LOJA_ID, lojaBuscada.id);

      const { data: { session } } = await supabase.auth.getSession();
      const authUserId = session?.user?.id || null;

      const { data: usuarios } = await supabase
        .from('usuarios_loja')
        .select('*')
        .eq('loja_id', lojaBuscada.id)
        .order('criado_em', { ascending: true });

      if (usuarios && usuarios.length > 0) {
        let u = usuarios[0];
        if (authUserId && (!u.usuario_auth_id || u.usuario_auth_id !== authUserId)) {
          try {
            await supabase
              .from('usuarios_loja')
              .update({ usuario_auth_id: authUserId })
              .eq('id', u.id);
            await supabase.rpc('sincronizar_meu_usuario_auth');
            u = { ...u, usuario_auth_id: authUserId };
          } catch (syncErr) {
            console.warn('Aviso ao sincronizar usuario_auth_id na seleção de loja:', syncErr);
          }
        }
        setUsuario(u);
        localStorage.setItem(STORAGE_KEY_USUARIO_ID, u.id);
      } else {
        const { data: novoUser } = await supabase
          .from('usuarios_loja')
          .insert([{
            loja_id: lojaBuscada.id,
            usuario_auth_id: authUserId,
            nome_completo: 'Proprietário',
            email: lojaBuscada.email,
            perfil: 'owner',
            pode_uso_celular_pessoal: true,
            pode_ver_transacoes_outros: true,
            pode_dar_desconto: true,
            pode_cadastrar_alterar_produtos: true,
            pode_gerenciar_estoque: true,
            pode_ativar_fiado: true,
            pode_ver_preco_custo: true,
            pode_exportar_relatorios: true,
            pode_editar_vendas_passadas: true,
            ativo: true
          }])
          .select()
          .single();

        if (novoUser) {
          if (authUserId) {
            try {
              await supabase.rpc('sincronizar_meu_usuario_auth');
            } catch (rpcErr) {
              console.warn('Aviso ao sincronizar RPC após criar usuário:', rpcErr);
            }
          }
          setUsuario(novoUser);
          localStorage.setItem(STORAGE_KEY_USUARIO_ID, novoUser.id);
        }
      }

      return true;
    } catch (e) {
      console.error('Erro ao selecionar loja:', e);
      return false;
    } finally {
      setCarregando(false);
    }
  };

  // Entrar com E-mail e Senha (com autocura RPC)
  const entrarComEmail = async (emailBusca: string, senha?: string): Promise<boolean> => {
    try {
      setCarregando(true);
      const emailTrim = emailBusca.trim().toLowerCase();
      let authUserId: string | null = null;

      // Autenticação oficial via Supabase Auth se senha for fornecida
      if (senha && senha.trim().length > 0) {
        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
          email: emailTrim,
          password: senha.trim()
        });

        if (authErr) {
          const msg = authErr.message.toLowerCase();
          if (msg.includes('invalid login credentials') || msg.includes('invalid_grant')) {
            throw new Error('E-mail ou senha incorretos. Por favor, verifique suas credenciais.');
          }
          if (msg.includes('email not confirmed')) {
            throw new Error('E-mail ainda não confirmado no sistema. Verifique sua caixa de entrada.');
          }
          throw new Error(authErr.message || 'Falha ao autenticar usuário.');
        }

        if (authData.session?.user) {
          authUserId = authData.session.user.id;
          try {
            await supabase.rpc('sincronizar_meu_usuario_auth');
          } catch (rpcErr) {
            console.warn('Aviso ao sincronizar pós signInWithPassword:', rpcErr);
          }
        }
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        authUserId = session?.user?.id || null;
      }

      // 1. Buscar perfil em usuarios_loja prioritariamente por usuario_auth_id (auth.uid())
      let usuarioEncontrado: UsuarioLoja | null = null;
      let lojaAssociada: Loja | null = null;

      if (authUserId) {
        const { data: userAuth } = await supabase
          .from('usuarios_loja')
          .select('*, loja:lojas(*)')
          .eq('usuario_auth_id', authUserId)
          .maybeSingle();

        if (userAuth) {
          usuarioEncontrado = userAuth as UsuarioLoja;
          lojaAssociada = (userAuth.loja || null) as Loja | null;
        }
      }

      // 2. Fallback por LOWER(email) = LOWER(session.user.email) com autocura imediata
      if (!usuarioEncontrado) {
        const { data: usersFound } = await supabase
          .from('usuarios_loja')
          .select('*, loja:lojas(*)')
          .ilike('email', emailTrim)
          .limit(1);

        if (usersFound && usersFound.length > 0) {
          const uRaw = usersFound[0] as any;
          const u = uRaw as UsuarioLoja;
          if (authUserId && (!u.usuario_auth_id || u.usuario_auth_id !== authUserId)) {
            try {
              await supabase
                .from('usuarios_loja')
                .update({ usuario_auth_id: authUserId })
                .eq('id', u.id);
              await supabase.rpc('sincronizar_meu_usuario_auth');
              usuarioEncontrado = { ...u, usuario_auth_id: authUserId };
            } catch (syncErr) {
              console.warn('Aviso ao auto-vincular usuario_auth_id no login:', syncErr);
              usuarioEncontrado = u;
            }
          } else {
            usuarioEncontrado = u;
          }
          lojaAssociada = (uRaw.loja || null) as Loja | null;
        }
      }

      // 3. Fallback para proprietários com registro direto na tabela de lojas
      if (!usuarioEncontrado) {
        const { data: lojasEncontradas } = await supabase
          .from('lojas')
          .select('*')
          .ilike('email', emailTrim)
          .limit(1);

        if (lojasEncontradas && lojasEncontradas.length > 0) {
          const lojaPrimeira = lojasEncontradas[0];
          lojaAssociada = lojaPrimeira;
          const { data: usuarios } = await supabase
            .from('usuarios_loja')
            .select('*')
            .eq('loja_id', lojaPrimeira.id)
            .order('criado_em', { ascending: true });

          if (usuarios && usuarios.length > 0) {
            let u = usuarios[0] as UsuarioLoja;
            if (authUserId && (!u.usuario_auth_id || u.usuario_auth_id !== authUserId)) {
              try {
                await supabase
                  .from('usuarios_loja')
                  .update({ usuario_auth_id: authUserId })
                  .eq('id', u.id);
                await supabase.rpc('sincronizar_meu_usuario_auth');
                u = { ...u, usuario_auth_id: authUserId };
              } catch (syncErr) {
                console.warn('Aviso ao sincronizar usuario_auth_id no login de loja:', syncErr);
              }
            }
            usuarioEncontrado = u;
          }
        }
      }

      if (lojaAssociada) {
        setLoja(lojaAssociada);
        localStorage.setItem(STORAGE_KEY_LOJA_ID, lojaAssociada.id);
      }
      if (usuarioEncontrado) {
        setUsuario(usuarioEncontrado);
        localStorage.setItem(STORAGE_KEY_USUARIO_ID, usuarioEncontrado.id);
        return true;
      }

      throw new Error('Nenhuma conta encontrada com este e-mail. Crie uma nova conta em segundos!');
    } catch (err: any) {
      console.error('Erro ao entrar com e-mail:', err);
      throw err;
    } finally {
      setCarregando(false);
    }
  };

  // Login com Google OAuth oficial do Supabase (Abre tela do Google com prompt=select_account)
  const entrarComGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        queryParams: {
          prompt: 'select_account',
          access_type: 'offline'
        },
        redirectTo: window.location.origin
      }
    });

    if (error) {
      throw error;
    }
    return data;
  };

  // Cadastro Minimalista (Estilo Kyte: Nome + Email + Senha)
  const cadastrarMinimalista = async (params: { nome: string; email: string; senha?: string }): Promise<Loja> => {
    const nomeLimpo = params.nome.trim();
    const emailLimpo = params.email.trim().toLowerCase();

    // 1. Verificar se já existe uma loja com este e-mail para evitar duplicatas
    const { data: lojasExistentes } = await supabase
      .from('lojas')
      .select('*')
      .ilike('email', emailLimpo)
      .order('criado_em', { ascending: false });

    if (lojasExistentes && lojasExistentes.length > 0) {
      // Se houver mais de uma, preferir a que tiver clientes ou a mais recente
      let lojaEscolhida = lojasExistentes[0];
      for (const l of lojasExistentes) {
        const { count } = await supabase
          .from('clientes')
          .select('*', { count: 'exact', head: true })
          .eq('loja_id', l.id);
        if (count && count > 0) {
          lojaEscolhida = l;
          break;
        }
      }

      setLoja(lojaEscolhida);
      localStorage.setItem(STORAGE_KEY_LOJA_ID, lojaEscolhida.id);

      const { data: usuarios } = await supabase
        .from('usuarios_loja')
        .select('*')
        .eq('loja_id', lojaEscolhida.id)
        .limit(1);

      if (usuarios && usuarios.length > 0) {
        setUsuario(usuarios[0]);
      }
      return lojaEscolhida;
    }

    const slugBase = nomeLimpo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const slugFinal = `${slugBase || 'loja'}-${Math.floor(1000 + Math.random() * 9000)}`;

    const novaLojaPayload: Partial<Loja> = {
      nome_fantasia: nomeLimpo,
      razao_social: nomeLimpo,
      tipo_documento: 'CPF',
      whatsapp: '00000000000',
      email: emailLimpo,
      slug_catalogo: slugFinal,
      cor_primaria: '#10B981',
      moeda: 'BRL',
      aceita_pedidos_online: true,
      resumo_whatsapp: true,
      tipo_plano: 'GROW',
      valor_minimo_pedido: 0,
      sobre_loja: `Bem-vindo ao catálogo de ${nomeLimpo}! Faça seus pedidos online aqui.`
    };

    const { data: lojaCriada, error: erroLoja } = await supabase
      .from('lojas')
      .insert([novaLojaPayload])
      .select()
      .single();

    if (erroLoja || !lojaCriada) {
      throw new Error(`Erro ao criar conta: ${erroLoja?.message || 'Falha na criação da loja'}`);
    }

    // Obter sessão atual do Supabase Auth ou registrar usuário se senha for fornecida
    let authUserId: string | null = null;
    const { data: { session: sessaoAtual } } = await supabase.auth.getSession();
    if (sessaoAtual?.user) {
      authUserId = sessaoAtual.user.id;
    } else if (params.senha && params.senha.trim().length >= 6) {
      try {
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: emailLimpo,
          password: params.senha.trim(),
          options: {
            data: { full_name: nomeLimpo }
          }
        });
        if (!signUpErr && signUpData?.user) {
          authUserId = signUpData.user.id;
        }
      } catch (authErr) {
        console.warn('Aviso ao registrar usuário no Supabase Auth:', authErr);
      }
    }

    // Criar Usuário Proprietário (Owner) com todas as permissões ativas e usuario_auth_id vinculado
    const novoUsuarioPayload: Partial<UsuarioLoja> = {
      loja_id: lojaCriada.id,
      usuario_auth_id: authUserId,
      nome_completo: nomeLimpo,
      email: emailLimpo,
      perfil: 'owner',
      pode_uso_celular_pessoal: true,
      pode_ver_transacoes_outros: true,
      pode_dar_desconto: true,
      pode_cadastrar_alterar_produtos: true,
      pode_gerenciar_estoque: true,
      pode_ativar_fiado: true,
      pode_ver_preco_custo: true,
      pode_exportar_relatorios: true,
      pode_editar_vendas_passadas: true,
      ativo: true
    };

    const { data: usuarioCriado } = await supabase
      .from('usuarios_loja')
      .insert([novoUsuarioPayload])
      .select()
      .single();

    if (authUserId) {
      try {
        await supabase.rpc('sincronizar_meu_usuario_auth');
      } catch (rpcErr) {
        console.warn('Aviso ao sincronizar pós-criação da loja:', rpcErr);
      }
    }

    // Criar dados padrão essenciais do PDV (Formas de Pagamento e Entrega)
    try {
      await supabase.from('formas_pagamento').insert([
        { loja_id: lojaCriada.id, nome: 'Dinheiro', tipo: 'dinheiro', taxa_percentual: 0, ativo: true, exibir_catalogo: true },
        { loja_id: lojaCriada.id, nome: 'Pix (Imediato)', tipo: 'pix', taxa_percentual: 0, ativo: true, exibir_catalogo: true },
        { loja_id: lojaCriada.id, nome: 'Cartão de Débito', tipo: 'cartao_debito', taxa_percentual: 1.5, ativo: true, exibir_catalogo: true },
        { loja_id: lojaCriada.id, nome: 'Cartão de Crédito 1x', tipo: 'cartao_credito', taxa_percentual: 3.2, maximo_parcelas: 12, ativo: true, exibir_catalogo: true },
        { loja_id: lojaCriada.id, nome: 'Fiado / A Prazo', tipo: 'fiado', taxa_percentual: 0, ativo: true, exibir_catalogo: false }
      ]);

      await supabase.from('formas_entrega').insert([
        { loja_id: lojaCriada.id, nome: 'Retirada no Balcão', tipo: 'retirada', valor_taxa: 0, tempo_estimado: 'Imediato', ativo: true },
        { loja_id: lojaCriada.id, nome: 'Entrega Motoboy / Local', tipo: 'taxa_fixa', valor_taxa: 10.00, tempo_estimado: '30 a 50 min', ativo: true }
      ]);

      await supabase.from('categorias').insert([
        { loja_id: lojaCriada.id, nome: 'Geral', ordem_exibicao: 1, ativo: true },
        { loja_id: lojaCriada.id, nome: 'Destaques', ordem_exibicao: 2, ativo: true }
      ]);
    } catch (seedErr) {
      console.warn('Aviso ao inicializar tabelas padrão do PDV:', seedErr);
    }

    setLoja(lojaCriada);
    if (usuarioCriado) setUsuario(usuarioCriado);
    setLojasDisponiveis(prev => [lojaCriada, ...prev]);
    localStorage.setItem(STORAGE_KEY_LOJA_ID, lojaCriada.id);

    return lojaCriada;
  };

  // Cadastrar um PDV completo com dados estendidos
  const cadastrarPdv = async (dadosLoja: Partial<Loja>, dadosUsuario: Partial<UsuarioLoja>): Promise<Loja> => {
    return cadastrarMinimalista({
      nome: dadosLoja.nome_fantasia || 'Meu Estabelecimento',
      email: dadosLoja.email || 'contato@loja.com'
    });
  };

  // Desconectar / Trocar de PDV
  const desconectarPdv = () => {
    try {
      sessionStorage.clear();
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('hubi_filtro_') || key.startsWith('hubi_mob_filtro_')) {
          localStorage.removeItem(key);
        }
      });
    } catch {}
    localStorage.removeItem(STORAGE_KEY_LOJA_ID);
    localStorage.removeItem(STORAGE_KEY_USUARIO_ID);
    setLoja(null);
    setUsuario(null);
  };

  useEffect(() => {
    carregarLoja();

    // Escutar eventos de login com OAuth (Google, etc.) e restauração de sessão
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      // 1. Autocura imediata para qualquer evento de autenticação
      if (session?.user) {
        try {
          await supabase.rpc('sincronizar_meu_usuario_auth');
        } catch (rpcErr) {
          console.warn('Aviso ao executar sincronizar_meu_usuario_auth no onAuthStateChange:', rpcErr);
        }
      }

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session?.user?.email) {
          const emailAuth = session.user.email.toLowerCase();
          const nomeAuth = session.user.user_metadata?.full_name || session.user.user_metadata?.name || emailAuth.split('@')[0];

          // Autocura / Sincronização referencial em usuarios_loja
          try {
            await supabase
              .from('usuarios_loja')
              .update({ usuario_auth_id: session.user.id })
              .ilike('email', emailAuth)
              .is('usuario_auth_id', null);
            await supabase.rpc('sincronizar_meu_usuario_auth');
          } catch (syncErr) {
            console.warn('Aviso ao sincronizar usuarios_loja no onAuthStateChange:', syncErr);
          }

          // 1. Verificar se este usuário autenticado já é um operador/administrador cadastrado em alguma loja
          const { data: usersLoja } = await supabase
            .from('usuarios_loja')
            .select('*, loja:lojas(*)')
            .or(`usuario_auth_id.eq.${session.user.id},email.ilike.${emailAuth}`)
            .order('criado_em', { ascending: true })
            .limit(1);

          if (usersLoja && usersLoja.length > 0) {
            const uRaw = usersLoja[0] as any;
            const u = uRaw as UsuarioLoja;
            const lojaAssoc = (uRaw.loja || null) as Loja | null;
            if (lojaAssoc) {
              setLoja(lojaAssoc);
              localStorage.setItem(STORAGE_KEY_LOJA_ID, lojaAssoc.id);
            }
            setUsuario(u);
            localStorage.setItem(STORAGE_KEY_USUARIO_ID, u.id);
            return;
          }

          // 2. Verificar se já existe uma loja diretamente para este e-mail (proprietário)
          const { data: lojasExistentes } = await supabase
            .from('lojas')
            .select('*')
            .ilike('email', emailAuth)
            .limit(1);

          if (lojasExistentes && lojasExistentes.length > 0) {
            setLoja(lojasExistentes[0]);
            localStorage.setItem(STORAGE_KEY_LOJA_ID, lojasExistentes[0].id);

            // Carregar o usuário da loja correspondente
            const { data: userLoja } = await supabase
              .from('usuarios_loja')
              .select('*')
              .eq('loja_id', lojasExistentes[0].id)
              .or(`usuario_auth_id.eq.${session.user.id},email.ilike.${emailAuth}`)
              .order('criado_em', { ascending: true })
              .limit(1);

            if (userLoja && userLoja.length > 0) {
              setUsuario(userLoja[0]);
              localStorage.setItem(STORAGE_KEY_USUARIO_ID, userLoja[0].id);
            }
          } else {
            try {
              await cadastrarMinimalista({
                nome: nomeAuth,
                email: emailAuth
              });
            } catch (e) {
              console.error('Erro ao auto-criar conta pós-OAuth:', e);
            }
          }
        }
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        loja,
        usuario,
        lojasDisponiveis,
        carregando,
        setLoja,
        selecionarLoja,
        selecionarUsuario,
        cadastrarPdv,
        cadastrarMinimalista,
        entrarComEmail,
        entrarComGoogle,
        desconectarPdv,
        recarregarDadosLoja: carregarLoja
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
