import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loja, UsuarioLoja, Organizacao } from '../types';
import { authClientIsolado } from '../services/usuarioService';

interface AuthContextType {
  loja: Loja | null;
  usuario: UsuarioLoja | null;
  organizacao: Organizacao | null;
  lojasDisponiveis: Loja[];
  carregando: boolean;
  setLoja: (loja: Loja | null) => void;
  selecionarLoja: (lojaId: string) => Promise<boolean>;
  selecionarUsuario: (usuarioId: string) => Promise<boolean>;
  cadastrarPdv: (dadosLoja: Partial<Loja>, dadosUsuario: Partial<UsuarioLoja>) => Promise<Loja>;
  cadastrarMinimalista: (params: { nome: string; email: string; senha?: string }) => Promise<Loja>;
  adicionarNovaFilial: (params: {
    nome: string;
    whatsapp?: string;
    numero_documento?: string;
    cidade?: string;
    estado?: string;
    endereco_cep?: string;
    endereco_logradouro?: string;
    endereco_numero?: string;
    endereco_complemento?: string;
    endereco_bairro?: string;
    endereco_cidade?: string;
    endereco_estado?: string;
  }) => Promise<Loja>;
  entrarComEmail: (email: string, senha?: string) => Promise<boolean>;
  entrarComGoogle: () => Promise<any>;
  desconectarPdv: () => void | Promise<void>;
  recarregarDadosLoja: () => Promise<void>;
}

const STORAGE_KEY_LOJA_ID = 'hubi_active_loja_id';
const STORAGE_KEY_USUARIO_ID = 'hubi_active_usuario_id';

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loja, setLoja] = useState<Loja | null>(null);
  const [usuario, setUsuario] = useState<UsuarioLoja | null>(null);
  const [organizacao, setOrganizacao] = useState<Organizacao | null>(null);
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

          if (lojaParaAtivar.organizacao_id) {
            try {
              const { data: orgData } = await supabase
                .from('organizacoes')
                .select('*')
                .eq('id', lojaParaAtivar.organizacao_id)
                .maybeSingle();
              if (orgData) {
                setOrganizacao(orgData as Organizacao);
              }
            } catch (orgErr) {
              console.warn('Aviso ao carregar organização da loja:', orgErr);
            }
          }

          // Resolução soberana e consistente do operador ativo da loja
          let usuarioAtivo: UsuarioLoja | null = null;

          // 1. Prioridade Soberana: operador registrado localmente na sessão ativa do PDV (activeUsuarioId)
          if (activeUsuarioId) {
            const { data: userSalvo } = await supabase
              .from('usuarios_loja')
              .select('*')
              .eq('id', activeUsuarioId)
              .eq('loja_id', lojaParaAtivar.id)
              .maybeSingle();

            if (userSalvo && userSalvo.ativo !== false) {
              const uSalvo = userSalvo as UsuarioLoja;
              usuarioAtivo = uSalvo;

              // Se o token Supabase Auth em cache pertencer ao mesmo e-mail, vincula se necessário
              if (authUser?.id) {
                const emailAuth = (authUser.email || '').trim().toLowerCase();
                const emailSalvo = (uSalvo.email || '').trim().toLowerCase();

                if (!uSalvo.usuario_auth_id && emailAuth === emailSalvo) {
                  try {
                    await supabase
                      .from('usuarios_loja')
                      .update({ usuario_auth_id: authUser.id })
                      .eq('id', uSalvo.id);
                    await supabase.rpc('sincronizar_meu_usuario_auth');
                    usuarioAtivo = { ...uSalvo, usuario_auth_id: authUser.id };
                  } catch (vErr) {
                    console.warn('Aviso ao vincular usuario_auth_id:', vErr);
                  }
                }
              }
            }
          }

          // 2. Se não houver operador ativo salvo no storage, consulta por conta autenticada no Supabase
          if (!usuarioAtivo && authUser?.id) {
            const { data: userPorAuthId } = await supabase
              .from('usuarios_loja')
              .select('*')
              .eq('usuario_auth_id', authUser.id)
              .eq('loja_id', lojaParaAtivar.id)
              .maybeSingle();

            if (userPorAuthId && userPorAuthId.ativo !== false) {
              usuarioAtivo = userPorAuthId;
            } else if (authUser.email) {
              const emailAuthLimpo = authUser.email.trim().toLowerCase();
              const { data: userPorEmail } = await supabase
                .from('usuarios_loja')
                .select('*')
                .ilike('email', emailAuthLimpo)
                .eq('loja_id', lojaParaAtivar.id)
                .maybeSingle();

              if (userPorEmail && userPorEmail.ativo !== false) {
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

          // 3. Fallback final: primeiro usuário ativo da loja
          if (!usuarioAtivo) {
            const { data: usuarios } = await supabase
              .from('usuarios_loja')
              .select('*')
              .eq('loja_id', lojaParaAtivar.id)
              .eq('ativo', true)
              .order('criado_em', { ascending: true });

            if (usuarios && usuarios.length > 0) {
              usuarioAtivo = usuarios[0] as UsuarioLoja;
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

      if (lojaBuscada.organizacao_id) {
        try {
          const { data: orgData } = await supabase
            .from('organizacoes')
            .select('*')
            .eq('id', lojaBuscada.organizacao_id)
            .maybeSingle();
          if (orgData) {
            setOrganizacao(orgData as Organizacao);
          }
        } catch (orgErr) {
          console.warn('Aviso ao carregar organização na seleção de loja:', orgErr);
        }
      }

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

  // Entrar com E-mail e Senha (com suporte resiliente para operadores da loja e proprietários)
  const entrarComEmail = async (emailBusca: string, senha?: string): Promise<boolean> => {
    try {
      const emailTrim = emailBusca.trim().toLowerCase();
      const senhaInformada = (senha || '').trim();
      let authUserId: string | null = null;
      let usuarioEncontrado: UsuarioLoja | null = null;
      let lojaAssociada: Loja | null = null;

      // 1. Prioridade: verificar se o usuário é um operador/administrador cadastrado em usuarios_loja
      const { data: usersFound } = await supabase
        .from('usuarios_loja')
        .select('*, loja:lojas(*)')
        .ilike('email', emailTrim);

      if (usersFound && usersFound.length > 0) {
        const uCand = (usersFound.find(u => u.ativo !== false) || usersFound[0]) as any;

        if (uCand.ativo === false) {
          throw new Error('Este usuário foi desativado pelo administrador da loja.');
        }

        // Validação da credencial do colaborador contra a senha gravada no banco da loja
        if (senhaInformada.length > 0) {
          const senhaGravada = (uCand.senha_hash || '').trim();
          if (senhaGravada && senhaGravada !== senhaInformada) {
            throw new Error('E-mail ou senha incorretos. Por favor, verifique suas credenciais.');
          }
        }

        usuarioEncontrado = uCand;
        lojaAssociada = (uCand.loja || null) as Loja | null;

        if (!lojaAssociada && uCand.loja_id) {
          const { data: lojaDb } = await supabase
            .from('lojas')
            .select('*')
            .eq('id', uCand.loja_id)
            .maybeSingle();
          if (lojaDb) {
            lojaAssociada = lojaDb as Loja;
          }
        }

        // Sincronização em segundo plano não-bloqueante no Supabase Auth (se GoTrue estiver operante)
        if (senhaInformada.length > 0) {
          supabase.auth.signInWithPassword({
            email: emailTrim,
            password: senhaInformada
          }).then(({ data: authData }) => {
            if (authData?.session?.user && !uCand.usuario_auth_id) {
              supabase
                .from('usuarios_loja')
                .update({ usuario_auth_id: authData.session.user.id })
                .eq('id', uCand.id)
                .then(() => {});
            }
          }).catch(() => {});
        }
      }

      // 2. Se não estiver em usuarios_loja, autentica via Supabase Auth oficial (ex: proprietários)
      if (!usuarioEncontrado) {
        if (senhaInformada.length > 0) {
          const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
            email: emailTrim,
            password: senhaInformada
          });

          if (authErr) {
            const msg = authErr.message.toLowerCase();
            if (msg.includes('invalid login credentials') || msg.includes('invalid_grant')) {
              throw new Error('E-mail ou senha incorretos. Por favor, verifique suas credenciais.');
            }
            if (msg.includes('email not confirmed')) {
              throw new Error('E-mail ainda não confirmado no sistema. Verifique sua caixa de entrada.');
            }
            throw new Error('E-mail ou senha incorretos. Por favor, verifique suas credenciais.');
          }

          if (authData?.session?.user) {
            authUserId = authData.session.user.id;
          }
        } else {
          const { data: { session } } = await supabase.auth.getSession();
          authUserId = session?.user?.id || null;
        }

        // Busca loja associada ao proprietário
        const { data: lojasEncontradas } = await supabase
          .from('lojas')
          .select('*')
          .ilike('email', emailTrim)
          .limit(1);

        if (lojasEncontradas && lojasEncontradas.length > 0) {
          const primeiraLoja = lojasEncontradas[0];
          lojaAssociada = primeiraLoja;
          const { data: usuarios } = await supabase
            .from('usuarios_loja')
            .select('*')
            .eq('loja_id', primeiraLoja.id)
            .order('criado_em', { ascending: true });

          if (usuarios && usuarios.length > 0) {
            let u = usuarios[0] as UsuarioLoja;
            if (authUserId && (!u.usuario_auth_id || u.usuario_auth_id !== authUserId)) {
              try {
                await supabase
                  .from('usuarios_loja')
                  .update({ usuario_auth_id: authUserId })
                  .eq('id', u.id);
                u = { ...u, usuario_auth_id: authUserId };
              } catch {}
            }
            usuarioEncontrado = u;
          }
        }
      }

      // Se nenhum usuário e nenhuma loja foram encontrados
      if (!usuarioEncontrado && !lojaAssociada) {
        throw new Error('Nenhuma conta encontrada com este e-mail. Crie uma nova conta em segundos!');
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
      console.warn('Falha no login com e-mail:', err?.message || err);
      throw err;
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
      status_assinatura: 'trial',
      trial_fim_em: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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

  // Adicionar nova filial vinculada à organização atual
  const adicionarNovaFilial = async (params: {
    nome: string;
    whatsapp?: string;
    numero_documento?: string;
    cidade?: string;
    estado?: string;
    endereco_cep?: string;
    endereco_logradouro?: string;
    endereco_numero?: string;
    endereco_complemento?: string;
    endereco_bairro?: string;
    endereco_cidade?: string;
    endereco_estado?: string;
  }): Promise<Loja> => {
    const nomeLimpo = params.nome.trim();
    if (!nomeLimpo) throw new Error('O nome da loja é obrigatório.');

    const { data: { session } } = await supabase.auth.getSession();
    const authUserId = session?.user?.id || null;
    const authEmail = session?.user?.email || loja?.email || 'contato@hubi.app';

    // Determinar organizacao_id
    let orgId = organizacao?.id || loja?.organizacao_id || null;
    if (!orgId) {
      const { data: novaOrg } = await supabase
        .from('organizacoes')
        .insert([{
          nome: `Grupo ${loja?.nome_fantasia || nomeLimpo}`,
          dono_usuario_id: authUserId,
          email_principal: authEmail
        }])
        .select()
        .single();

      if (novaOrg) {
        orgId = novaOrg.id;
        setOrganizacao(novaOrg as Organizacao);
        if (loja?.id) {
          await supabase.from('lojas').update({ organizacao_id: novaOrg.id }).eq('id', loja.id);
          setLoja(prev => prev ? { ...prev, organizacao_id: novaOrg.id } : null);
        }
      }
    }

    const slugBase = nomeLimpo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const slugFinal = `${slugBase || 'filial'}-${Math.floor(1000 + Math.random() * 9000)}`;
    const trialFimIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const cidadeFinal = params.endereco_cidade || params.cidade || loja?.endereco_cidade || null;
    const estadoFinal = params.endereco_estado || params.estado || loja?.endereco_estado || null;

    const novaLojaPayload: Partial<Loja> = {
      organizacao_id: orgId,
      status_assinatura: 'trial',
      trial_fim_em: trialFimIso,
      nome_fantasia: nomeLimpo,
      razao_social: nomeLimpo,
      tipo_documento: 'CPF',
      numero_documento: params.numero_documento || null,
      whatsapp: params.whatsapp ? params.whatsapp.replace(/\D/g, '') : (loja?.whatsapp || '00000000000'),
      email: authEmail,
      endereco_cep: params.endereco_cep ? params.endereco_cep.replace(/\D/g, '') : (loja?.endereco_cep || null),
      endereco_logradouro: params.endereco_logradouro || loja?.endereco_logradouro || null,
      endereco_numero: params.endereco_numero || loja?.endereco_numero || null,
      endereco_complemento: params.endereco_complemento || loja?.endereco_complemento || null,
      endereco_bairro: params.endereco_bairro || loja?.endereco_bairro || null,
      endereco_cidade: cidadeFinal,
      endereco_estado: estadoFinal,
      slug_catalogo: slugFinal,
      cor_primaria: loja?.cor_primaria || '#10B981',
      moeda: 'BRL',
      aceita_pedidos_online: true,
      resumo_whatsapp: true,
      tipo_plano: 'GROW',
      valor_minimo_pedido: 0,
      sobre_loja: `Bem-vindo à ${nomeLimpo}! Faça seus pedidos online aqui.`
    };

    const { data: novaLoja, error: erroLoja } = await supabase
      .from('lojas')
      .insert([novaLojaPayload])
      .select()
      .single();

    if (erroLoja || !novaLoja) {
      throw new Error(`Erro ao criar filial: ${erroLoja?.message || 'Falha na criação da filial'}`);
    }

    // Criar perfil de Owner para o usuário na nova filial
    if (authUserId) {
      await supabase.from('usuarios_loja').insert([{
        loja_id: novaLoja.id,
        usuario_auth_id: authUserId,
        nome_completo: usuario?.nome_completo || 'Proprietário',
        email: authEmail,
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
      }]);
    }

    // Formas de pagamento, entrega e logística padrão para a nova filial
    try {
      await supabase.from('formas_pagamento').insert([
        { loja_id: novaLoja.id, nome: 'Dinheiro', tipo: 'dinheiro', taxa_percentual: 0, ativo: true, exibir_catalogo: true },
        { loja_id: novaLoja.id, nome: 'Pix (Imediato)', tipo: 'pix', taxa_percentual: 0, ativo: true, exibir_catalogo: true },
        { loja_id: novaLoja.id, nome: 'Cartão de Débito', tipo: 'cartao_debito', taxa_percentual: 1.5, ativo: true, exibir_catalogo: true },
        { loja_id: novaLoja.id, nome: 'Cartão de Crédito 1x', tipo: 'cartao_credito', taxa_percentual: 3.2, maximo_parcelas: 12, ativo: true, exibir_catalogo: true }
      ]);
      await supabase.from('formas_entrega').insert([
        { loja_id: novaLoja.id, nome: 'Retirada no Balcão', tipo: 'retirada', valor_taxa: 0, tempo_estimado: 'Imediato', ativo: true }
      ]);
      await supabase.from('categorias').insert([
        { loja_id: novaLoja.id, nome: 'Geral', ordem_exibicao: 1, ativo: true }
      ]);
      try {
        await supabase.from('loja_shipping_configs').insert([{
          loja_id: novaLoja.id,
          retirada_balcao_ativa: true,
          retirada_loja_ativa: true,
          permite_retirada_loja: true,
          frete_gratis_ativo: false,
          frete_gratis_valor_minimo: 0.00
        }]);
      } catch {}
    } catch (seedErr) {
      console.warn('Aviso ao inicializar tabelas da filial:', seedErr);
    }

    setLojasDisponiveis(prev => [novaLoja as Loja, ...prev]);
    return novaLoja as Loja;
  };

  // Desconectar / Trocar de PDV (Limpeza completa de ambiente e encerramento de sessão)
  const desconectarPdv = async () => {
    try {
      await supabase.auth.signOut().catch(() => {});
    } catch {}

    try {
      sessionStorage.clear();
      const chavesParaPreservar = ['hubi_catalogo_slug', 'theme', 'vite-ui-theme'];
      Object.keys(localStorage).forEach(key => {
        if (!chavesParaPreservar.includes(key)) {
          if (
            key.startsWith('sb-') ||
            key.startsWith('hubi_') ||
            key === STORAGE_KEY_LOJA_ID ||
            key === STORAGE_KEY_USUARIO_ID
          ) {
            localStorage.removeItem(key);
          }
        }
      });
    } catch {}

    setLoja(null);
    setUsuario(null);
    setOrganizacao(null);

    // Notificar formulários e componentes da tela de login para limpeza imediata de credenciais
    try {
      window.dispatchEvent(new CustomEvent('hubi_logout_limpar_formulario'));
    } catch {}
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

      if (event === 'SIGNED_OUT') {
        const activeUserLocal = localStorage.getItem(STORAGE_KEY_USUARIO_ID);
        if (!activeUserLocal) {
          setLoja(null);
          setUsuario(null);
          setOrganizacao(null);
        }
        return;
      }

      // Prevenção de reversão involuntária para o administrador ao renovar token ou iniciar sessão:
      // Se já existe um operador local ativo na loja (STORAGE_KEY_USUARIO_ID) e o e-mail da sessão for diferente,
      // a sessão local do operador ativo tem precedência soberana!
      const activeUserLocal = localStorage.getItem(STORAGE_KEY_USUARIO_ID);
      const activeLojaLocal = localStorage.getItem(STORAGE_KEY_LOJA_ID);

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session?.user?.email) {
          const emailAuth = session.user.email.toLowerCase();
          const nomeAuth = session.user.user_metadata?.full_name || session.user.user_metadata?.name || emailAuth.split('@')[0];

          if (activeUserLocal && activeLojaLocal) {
            const { data: checkLocal } = await supabase
              .from('usuarios_loja')
              .select('id, email, loja_id')
              .eq('id', activeUserLocal)
              .maybeSingle();

            if (checkLocal && checkLocal.loja_id === activeLojaLocal) {
              const emailLocal = (checkLocal.email || '').toLowerCase().trim();
              if (emailLocal && emailLocal !== emailAuth) {
                // Operador do PDV ativo é diferente da conta do Supabase Auth.
                // Respeita soberania do operador local e não sobrescreve.
                return;
              }
            }
          }

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
        organizacao,
        lojasDisponiveis,
        carregando,
        setLoja,
        selecionarLoja,
        selecionarUsuario,
        cadastrarPdv,
        cadastrarMinimalista,
        adicionarNovaFilial,
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
