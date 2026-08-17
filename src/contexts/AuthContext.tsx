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
  cadastrarPdv: (dadosLoja: Partial<Loja>, dadosUsuario: Partial<UsuarioLoja>) => Promise<Loja>;
  cadastrarMinimalista: (params: { nome: string; email: string; senha?: string }) => Promise<Loja>;
  entrarComEmail: (email: string, senha?: string) => Promise<boolean>;
  desconectarPdv: () => void;
  recarregarDadosLoja: () => Promise<void>;
}

const STORAGE_KEY_LOJA_ID = 'hubi_active_loja_id';

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

          const { data: usuarios } = await supabase
            .from('usuarios_loja')
            .select('*')
            .eq('loja_id', lojaParaAtivar.id)
            .limit(1);

          if (usuarios && usuarios.length > 0) {
            setUsuario(usuarios[0]);
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
      }
    } catch (err) {
      console.error('Erro de inicialização do PDV:', err);
      setLoja(null);
    } finally {
      setCarregando(false);
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

      const { data: usuarios } = await supabase
        .from('usuarios_loja')
        .select('*')
        .eq('loja_id', lojaBuscada.id)
        .limit(1);

      if (usuarios && usuarios.length > 0) {
        setUsuario(usuarios[0]);
      } else {
        const { data: novoUser } = await supabase
          .from('usuarios_loja')
          .insert([{
            loja_id: lojaBuscada.id,
            nome_completo: 'Administrador',
            email: lojaBuscada.email,
            perfil: 'admin',
            pode_ver_preco_custo: true,
            pode_exportar_relatorios: true,
            pode_editar_vendas_passadas: true,
            ativo: true
          }])
          .select()
          .single();

        if (novoUser) setUsuario(novoUser);
      }

      return true;
    } catch (e) {
      console.error('Erro ao selecionar loja:', e);
      return false;
    } finally {
      setCarregando(false);
    }
  };

  // Entrar com E-mail
  const entrarComEmail = async (emailBusca: string): Promise<boolean> => {
    try {
      setCarregando(true);
      const emailTrim = emailBusca.trim().toLowerCase();

      // Buscar por loja com este email
      let { data: lojasEncontradas, error } = await supabase
        .from('lojas')
        .select('*')
        .ilike('email', emailTrim)
        .limit(1);

      // Se não encontrou por email na loja, buscar em usuarios_loja
      if (!lojasEncontradas || lojasEncontradas.length === 0) {
        const { data: users } = await supabase
          .from('usuarios_loja')
          .select('*, loja:lojas(*)')
          .ilike('email', emailTrim)
          .limit(1);

        if (users && users.length > 0 && users[0].loja) {
          lojasEncontradas = [users[0].loja as Loja];
        }
      }

      if (lojasEncontradas && lojasEncontradas.length > 0) {
        const lojaEncontrada = lojasEncontradas[0];
        setLoja(lojaEncontrada);
        localStorage.setItem(STORAGE_KEY_LOJA_ID, lojaEncontrada.id);

        const { data: usuarios } = await supabase
          .from('usuarios_loja')
          .select('*')
          .eq('loja_id', lojaEncontrada.id)
          .limit(1);

        if (usuarios && usuarios.length > 0) {
          setUsuario(usuarios[0]);
        }
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

  // Cadastro Minimalista (Estilo Kyte: Nome + Email + Senha)
  const cadastrarMinimalista = async (params: { nome: string; email: string; senha?: string }): Promise<Loja> => {
    const nomeLimpo = params.nome.trim();
    const emailLimpo = params.email.trim().toLowerCase();

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

    // Criar Usuário Administrador
    const novoUsuarioPayload: Partial<UsuarioLoja> = {
      loja_id: lojaCriada.id,
      nome_completo: nomeLimpo,
      email: emailLimpo,
      perfil: 'admin',
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
    localStorage.removeItem(STORAGE_KEY_LOJA_ID);
    setLoja(null);
    setUsuario(null);
  };

  useEffect(() => {
    carregarLoja();
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
        cadastrarPdv,
        cadastrarMinimalista,
        entrarComEmail,
        desconectarPdv,
        recarregarDadosLoja: carregarLoja
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
