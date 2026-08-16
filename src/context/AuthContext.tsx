import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loja, UsuarioLoja } from '../types/database';

interface AuthContextType {
  loja: Loja | null;
  usuario: UsuarioLoja | null;
  carregando: boolean;
  setLoja: (loja: Loja | null) => void;
  criarLojaInicialSeVazio: () => Promise<void>;
  recarregarDadosLoja: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loja, setLoja] = useState<Loja | null>(null);
  const [usuario, setUsuario] = useState<UsuarioLoja | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);

  const carregarLoja = async () => {
    try {
      setCarregando(true);
      // Buscar primeira loja disponível no banco
      const { data: lojas, error } = await supabase
        .from('lojas')
        .select('*')
        .limit(1);

      if (error) {
        console.error('Erro ao buscar loja:', error);
      } else if (lojas && lojas.length > 0) {
        setLoja(lojas[0]);

        // Buscar ou vincular usuário admin padrão
        const { data: usuarios } = await supabase
          .from('usuarios_loja')
          .select('*')
          .eq('loja_id', lojas[0].id)
          .limit(1);

        if (usuarios && usuarios.length > 0) {
          setUsuario(usuarios[0]);
        }
      } else {
        // Banco novo sem registros: criar loja padrão inicial
        await criarLojaInicialSeVazio();
      }
    } catch (err) {
      console.error('Erro de inicialização:', err);
    } finally {
      setCarregando(false);
    }
  };

  const criarLojaInicialSeVazio = async () => {
    try {
      const novaLoja: Partial<Loja> = {
        nome_fantasia: 'Minha Loja HUBI',
        razao_social: 'HUBI Comércio & Varejo Ltda',
        tipo_documento: 'CNPJ',
        numero_documento: '12.345.678/0001-90',
        whatsapp: '85999999999',
        telefone: '8533333333',
        email: 'contato@hubiloja.com.br',
        slug_catalogo: 'minha-loja-hubi',
        cor_primaria: '#10B981',
        moeda: 'BRL',
        aceita_pedidos_online: true,
        resumo_whatsapp: true,
        sobre_loja: 'Seja muito bem-vindo à nossa loja! Entregamos com rapidez e carinho.',
        valor_minimo_pedido: 0,
        tipo_plano: 'GROW'
      };

      const { data: lojaCriada, error: erroLoja } = await supabase
        .from('lojas')
        .insert([novaLoja])
        .select()
        .single();

      if (erroLoja) {
        console.error('Erro ao criar loja inicial:', erroLoja);
        return;
      }

      setLoja(lojaCriada);

      // Criar usuário admin inicial
      const novoUsuario: Partial<UsuarioLoja> = {
        loja_id: lojaCriada.id,
        nome_completo: 'Administrador HUBI',
        email: 'admin@hubiloja.com.br',
        whatsapp_atendimento: '85999999999',
        perfil: 'admin',
        pode_ver_preco_custo: true,
        pode_exportar_relatorios: true,
        pode_editar_vendas_passadas: true,
        ativo: true
      };

      const { data: usuarioCriado } = await supabase
        .from('usuarios_loja')
        .insert([novoUsuario])
        .select()
        .single();

      if (usuarioCriado) {
        setUsuario(usuarioCriado);
      }

      // Criar formas de pagamento padrão
      await supabase.from('formas_pagamento').insert([
        { loja_id: lojaCriada.id, nome: 'Dinheiro', tipo: 'dinheiro', taxa_percentual: 0, ativo: true },
        { loja_id: lojaCriada.id, nome: 'Pix (Imediato)', tipo: 'pix', taxa_percentual: 0, ativo: true },
        { loja_id: lojaCriada.id, nome: 'Cartão de Débito', tipo: 'cartao_debito', taxa_percentual: 1.5, ativo: true },
        { loja_id: lojaCriada.id, nome: 'Cartão de Crédito 1x', tipo: 'cartao_credito', taxa_percentual: 3.2, maximo_parcelas: 12, ativo: true },
        { loja_id: lojaCriada.id, nome: 'Fiado / A Prazo', tipo: 'fiado', taxa_percentual: 0, ativo: true },
      ]);

      // Criar formas de entrega padrão
      await supabase.from('formas_entrega').insert([
        { loja_id: lojaCriada.id, nome: 'Retirada no Balcão', tipo: 'retirada', valor_taxa: 0, tempo_estimado: 'Imediato', ativo: true },
        { loja_id: lojaCriada.id, nome: 'Entrega Motoboy Express', tipo: 'taxa_fixa', valor_taxa: 10.00, tempo_estimado: '30 a 50 min', ativo: true },
      ]);

      // Criar categorias padrão
      const { data: cat1 } = await supabase.from('categorias').insert([{ loja_id: lojaCriada.id, nome: 'Geral', ordem_exibicao: 1 }]).select().single();
      const { data: cat2 } = await supabase.from('categorias').insert([{ loja_id: lojaCriada.id, nome: 'Mais Vendidos', ordem_exibicao: 2 }]).select().single();

      // Criar produtos de demonstração com múltiplas tabelas de preço e variações
      if (cat1 && cat2) {
        await supabase.from('produtos').insert([
          {
            loja_id: lojaCriada.id,
            categoria_id: cat2.id,
            nome: 'Camiseta Dry Fit Performance',
            codigo_interno: 'CAM-01',
            codigo_barras: '7891011121314',
            descricao: 'Camiseta de alta respirabilidade e secagem ultrarrápida.',
            tipo_unidade: 'un',
            preco_custo: 22.00,
            preco_venda_varejo: 49.90,
            preco_venda_atacado: 39.90,
            qtd_minima_atacado: 6,
            preco_venda_autoatacado: 32.90,
            qtd_minima_autoatacado: 24,
            preco_promocional: 44.90,
            promocao_ativa: true,
            quantidade_estoque: 120,
            tem_variacoes: true,
            rotulo_variacao_1: 'Tamanho',
            rotulo_variacao_2: 'Cor',
            exibir_catalogo: true,
            destaque: true,
            fotos_urls: ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=60']
          },
          {
            loja_id: lojaCriada.id,
            categoria_id: cat1.id,
            nome: 'Garrafa Térmica Inox 750ml',
            codigo_interno: 'GAR-02',
            codigo_barras: '7892021222324',
            descricao: 'Mantém gelado por 24h e quente por 12h. Aço cirúrgico inoxidável.',
            tipo_unidade: 'un',
            preco_custo: 35.00,
            preco_venda_varejo: 79.90,
            preco_venda_atacado: 65.00,
            qtd_minima_atacado: 6,
            preco_venda_autoatacado: 55.00,
            qtd_minima_autoatacado: 24,
            quantidade_estoque: 45,
            tem_variacoes: false,
            exibir_catalogo: true,
            destaque: true,
            fotos_urls: ['https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=500&auto=format&fit=crop&q=60']
          }
        ]);
      }
    } catch (e) {
      console.error('Erro ao inicializar dados padrão:', e);
    }
  };

  useEffect(() => {
    carregarLoja();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        loja,
        usuario,
        carregando,
        setLoja,
        criarLojaInicialSeVazio,
        recarregarDadosLoja: carregarLoja
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
