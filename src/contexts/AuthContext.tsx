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

      // Buscar todas as lojas cadastradas
      const { data: todasLojas, error: erroLojas } = await supabase
        .from('lojas')
        .select('*')
        .order('criado_em', { ascending: false });

      if (erroLojas) {
        console.warn('Aviso ao listar lojas:', erroLojas.message);
      }

      if (todasLojas && todasLojas.length > 0) {
        setLojasDisponiveis(todasLojas);

        // Se houver um ID salvo no localStorage e ele existir na lista
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

          // Buscar usuário da loja
          const { data: usuarios } = await supabase
            .from('usuarios_loja')
            .select('*')
            .eq('loja_id', lojaParaAtivar.id)
            .limit(1);

          if (usuarios && usuarios.length > 0) {
            setUsuario(usuarios[0]);
          }
        } else {
          // Mais de uma loja e nenhuma selecionada
          setLoja(null);
          setUsuario(null);
        }
      } else {
        // Nenhuma loja cadastrada ainda no sistema
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
        // Criar usuário admin se não existir
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

  // Cadastrar um novo PDV / Loja
  const cadastrarPdv = async (dadosLoja: Partial<Loja>, dadosUsuario: Partial<UsuarioLoja>): Promise<Loja> => {
    const slugBase = (dadosLoja.nome_fantasia || 'loja')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const slugFinal = `${slugBase}-${Math.floor(1000 + Math.random() * 9000)}`;

    const novaLojaPayload: Partial<Loja> = {
      nome_fantasia: dadosLoja.nome_fantasia?.trim() || 'Meu Estabelecimento',
      razao_social: dadosLoja.razao_social?.trim() || dadosLoja.nome_fantasia?.trim() || 'Meu Estabelecimento',
      tipo_documento: dadosLoja.tipo_documento || 'CNPJ',
      numero_documento: dadosLoja.numero_documento?.trim() || null,
      whatsapp: dadosLoja.whatsapp?.replace(/\D/g, '') || '',
      telefone: dadosLoja.telefone?.replace(/\D/g, '') || null,
      email: dadosLoja.email?.trim() || 'contato@pdv.com',
      endereco_logradouro: dadosLoja.endereco_logradouro || null,
      endereco_numero: dadosLoja.endereco_numero || null,
      endereco_complemento: dadosLoja.endereco_complemento || null,
      endereco_bairro: dadosLoja.endereco_bairro || null,
      endereco_cidade: dadosLoja.endereco_cidade || null,
      endereco_estado: dadosLoja.endereco_estado || null,
      endereco_cep: dadosLoja.endereco_cep || null,
      slug_catalogo: slugFinal,
      cor_primaria: '#10B981',
      moeda: 'BRL',
      aceita_pedidos_online: true,
      resumo_whatsapp: true,
      tipo_plano: 'GROW',
      valor_minimo_pedido: 0,
      sobre_loja: `Bem-vindo ao ${dadosLoja.nome_fantasia}! Faça seu pedido online com rapidez.`
    };

    const { data: lojaCriada, error: erroLoja } = await supabase
      .from('lojas')
      .insert([novaLojaPayload])
      .select()
      .single();

    if (erroLoja || !lojaCriada) {
      throw new Error(`Erro ao cadastrar PDV: ${erroLoja?.message || 'Falha desconhecida'}`);
    }

    // Criar Usuário Administrador
    const novoUsuarioPayload: Partial<UsuarioLoja> = {
      loja_id: lojaCriada.id,
      nome_completo: dadosUsuario.nome_completo?.trim() || 'Administrador',
      email: dadosUsuario.email?.trim() || dadosLoja.email?.trim() || 'admin@pdv.com',
      whatsapp_atendimento: dadosLoja.whatsapp?.replace(/\D/g, '') || null,
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

    // Criar Formas de Pagamento Padrão
    try {
      await supabase.from('formas_pagamento').insert([
        { loja_id: lojaCriada.id, nome: 'Dinheiro', tipo: 'dinheiro', taxa_percentual: 0, ativo: true, exibir_catalogo: true },
        { loja_id: lojaCriada.id, nome: 'Pix (Imediato)', tipo: 'pix', taxa_percentual: 0, ativo: true, exibir_catalogo: true },
        { loja_id: lojaCriada.id, nome: 'Cartão de Débito', tipo: 'cartao_debito', taxa_percentual: 1.5, ativo: true, exibir_catalogo: true },
        { loja_id: lojaCriada.id, nome: 'Cartão de Crédito', tipo: 'cartao_credito', taxa_percentual: 3.2, maximo_parcelas: 12, ativo: true, exibir_catalogo: true },
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
      console.warn('Aviso na criação de dados padrão do PDV:', seedErr);
    }

    // Atualizar Estados e LocalStorage
    setLoja(lojaCriada);
    if (usuarioCriado) setUsuario(usuarioCriado);
    setLojasDisponiveis(prev => [lojaCriada, ...prev]);
    localStorage.setItem(STORAGE_KEY_LOJA_ID, lojaCriada.id);

    return lojaCriada;
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
        desconectarPdv,
        recarregarDadosLoja: carregarLoja
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
