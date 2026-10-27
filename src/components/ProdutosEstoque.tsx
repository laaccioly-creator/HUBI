import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Package,
  Star,
  Eye,
  EyeOff,
  Trash2,
  Edit2,
  FolderPlus,
  PackagePlus,
  ArrowDownLeft,
  ArrowUpDown,
  AlertTriangle,
  Layers,
  Info,
  ArrowLeft,
  Filter,
  Check,
  X,
  ShoppingBag
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePermissions } from '../hooks/usePermissions';
import { Produto, Categoria } from '../types';
import { ModalGerenciarCategorias } from './ModalGerenciarCategorias';
import { ModalEntradaEstoque } from './ModalEntradaEstoque';
import { ModalDetalhesProduto } from './ModalDetalhesProduto';
import { ModalVincularAnuncioMl } from './mercadolivre/ModalVincularAnuncioMl';
import { ProdutosMobile } from './ProdutosMobile';
import { formatarMoeda } from '../utils/formatters';

export const ProdutosEstoque: React.FC = () => {
  const { loja, usuario } = useAuth();
  const { isDark } = useTheme();
  const permissions = usePermissions();
  const navigate = useNavigate();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [busca, setBusca] = useState<string>('');
  const [categoriasFiltro, setCategoriasFiltro] = useState<string[]>(() => {
    try {
      if (!usuario?.id) return [];
      const salvo = sessionStorage.getItem(`hubi_filtro_produtos_sessao_${usuario.id}`);
      if (salvo) {
        const dados = JSON.parse(salvo);
        return Array.isArray(dados.categorias) ? dados.categorias : [];
      }
      return [];
    } catch {
      return [];
    }
  });
  const [filtroEstoque, setFiltroEstoque] = useState<string>(() => {
    try {
      if (!usuario?.id) return 'todos';
      const salvo = sessionStorage.getItem(`hubi_filtro_produtos_sessao_${usuario.id}`);
      if (salvo) {
        const dados = JSON.parse(salvo);
        return typeof dados.estoque === 'string' ? dados.estoque : 'todos';
      }
      return 'todos';
    } catch {
      return 'todos';
    }
  });
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'ativos' | 'inativos'>(() => {
    try {
      if (!usuario?.id) return 'todos';
      const salvo = sessionStorage.getItem(`hubi_filtro_produtos_sessao_${usuario.id}`);
      if (salvo) {
        const dados = JSON.parse(salvo);
        if (dados.ativo === 'ativos' || dados.ativo === 'inativos') return dados.ativo;
      }
      return 'todos';
    } catch {
      return 'todos';
    }
  });
  const [modalFiltroAberto, setModalFiltroAberto] = useState<boolean>(false);

  // Modais
  const [modalCategorias, setModalCategorias] = useState<boolean>(false);
  const [produtoEstoqueAlvo, setProdutoEstoqueAlvo] = useState<Produto | null>(null);
  const [produtoDetalhes, setProdutoDetalhes] = useState<Produto | null>(null);
  const [produtoGradeModal, setProdutoGradeModal] = useState<Produto | null>(null);
  const [produtoMlModal, setProdutoMlModal] = useState<Produto | null>(null);

  const carregarProdutos = async () => {
    if (!loja?.id) return;
    try {
      setCarregando(true);
      const { data: prodData, error } = await supabase
        .from('produtos')
        .select('*, variacoes:variacoes_produto(*), categoria:categorias(*)')
        .eq('loja_id', loja.id)
        .order('nome');

      if (error) throw error;
      if (prodData) setProdutos(prodData as unknown as Produto[]);

      const { data: catData } = await supabase
        .from('categorias')
        .select('*')
        .eq('loja_id', loja.id)
        .order('ordem_exibicao');

      if (catData) setCategorias(catData);
    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarProdutos();
  }, [loja?.id]);

  // Limpeza de filtros antigos legados em localStorage permanente
  useEffect(() => {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('hubi_filtro_produtos_') || key.startsWith('hubi_mob_filtro_')) {
          localStorage.removeItem(key);
        }
      });
    } catch {}
  }, []);

  // Quando trocar de usuário ou sair do sistema, os filtros são redefinidos/restaurados conforme o novo usuário ativo
  useEffect(() => {
    if (!usuario?.id) {
      setCategoriasFiltro([]);
      setFiltroEstoque('todos');
      setFiltroAtivo('todos');
      return;
    }
    try {
      const salvo = sessionStorage.getItem(`hubi_filtro_produtos_sessao_${usuario.id}`);
      if (salvo) {
        const dados = JSON.parse(salvo);
        setCategoriasFiltro(Array.isArray(dados.categorias) ? dados.categorias : []);
        setFiltroEstoque(typeof dados.estoque === 'string' ? dados.estoque : 'todos');
        setFiltroAtivo(dados.ativo === 'ativos' || dados.ativo === 'inativos' ? dados.ativo : 'todos');
      } else {
        setCategoriasFiltro([]);
        setFiltroEstoque('todos');
        setFiltroAtivo('todos');
      }
    } catch {
      setCategoriasFiltro([]);
      setFiltroEstoque('todos');
      setFiltroAtivo('todos');
    }
  }, [usuario?.id]);

  // Persistir filtros apenas na sessão atual do usuário ativo
  useEffect(() => {
    if (!usuario?.id) return;
    try {
      const dados = {
        categorias: categoriasFiltro,
        estoque: filtroEstoque,
        ativo: filtroAtivo
      };
      sessionStorage.setItem(`hubi_filtro_produtos_sessao_${usuario.id}`, JSON.stringify(dados));
    } catch (e) {
      console.error('Erro ao persistir filtros de sessão:', e);
    }
  }, [categoriasFiltro, filtroEstoque, filtroAtivo, usuario?.id]);

  // Tecla ESC para fechar modal de filtro
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalFiltroAberto) {
        setModalFiltroAberto(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalFiltroAberto]);

  const toggleAtivo = async (produtoId: string, valorAtual: boolean) => {
    try {
      const novoValor = valorAtual === false ? true : false;
      const { error } = await supabase
        .from('produtos')
        .update({ ativo: novoValor })
        .eq('id', produtoId);

      if (error) throw error;
      setProdutos(prev =>
        prev.map(p => (p.id === produtoId ? { ...p, ativo: novoValor } : p))
      );
    } catch (err) {
      console.error('Erro ao alterar status ativo:', err);
    }
  };

  const toggleExibirCatalogo = async (produtoId: string, valorAtual: boolean) => {
    try {
      const { error } = await supabase
        .from('produtos')
        .update({ exibir_catalogo: !valorAtual })
        .eq('id', produtoId);

      if (error) throw error;
      setProdutos(prev =>
        prev.map(p => (p.id === produtoId ? { ...p, exibir_catalogo: !valorAtual } : p))
      );
    } catch (err) {
      console.error('Erro ao alterar visibilidade:', err);
    }
  };

  const toggleDestaque = async (produtoId: string, valorAtual: boolean) => {
    try {
      const { error } = await supabase
        .from('produtos')
        .update({ destaque: !valorAtual })
        .eq('id', produtoId);

      if (error) throw error;
      setProdutos(prev =>
        prev.map(p => (p.id === produtoId ? { ...p, destaque: !valorAtual } : p))
      );
    } catch (err) {
      console.error('Erro ao alterar destaque:', err);
    }
  };

  const excluirProduto = async (produtoId: string) => {
    if (!confirm('Deseja realmente remover este produto?')) return;
    try {
      const { error } = await supabase.from('produtos').delete().eq('id', produtoId);
      if (error) throw error;
      setProdutos(prev => prev.filter(p => p.id !== produtoId));
    } catch (err) {
      console.error('Erro ao excluir produto:', err);
    }
  };

  // Funções utilitárias de cálculo de estoque por variação
  const getEstoqueReal = (p: Produto): number => {
    if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
      return p.variacoes.reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0);
    }
    return Number(p.quantidade_estoque || 0);
  };

  const getValorVendaEstoque = (p: Produto): number => {
    if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
      return p.variacoes.reduce((acc, v) => {
        const precoVar = Number(v.preco_venda_varejo) || Number(p.preco_venda_varejo) || 0;
        return acc + (Number(v.quantidade_estoque || 0) * precoVar);
      }, 0);
    }
    return Number(p.quantidade_estoque || 0) * Number(p.preco_venda_varejo || 0);
  };

  const getValorCustoEstoque = (p: Produto): number => {
    if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
      return p.variacoes.reduce((acc, v) => {
        const custoVar = Number(v.preco_custo) || Number(p.preco_custo) || 0;
        return acc + (Number(v.quantidade_estoque || 0) * custoVar);
      }, 0);
    }
    return Number(p.quantidade_estoque || 0) * Number(p.preco_custo || 0);
  };

  const totalItensEstoque = produtos.reduce((acc, p) => acc + getEstoqueReal(p), 0);
  const valorTotalEstoque = produtos.reduce((acc, p) => acc + getValorVendaEstoque(p), 0);
  const valorCustoEstoque = produtos.reduce((acc, p) => acc + getValorCustoEstoque(p), 0);
  const produtosAlertaEstoque = produtos.filter(p => getEstoqueReal(p) <= Number(p.estoque_minimo_alerta));

  const produtosFiltrados = produtos.filter(p => {
    const matchBusca =
      p.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (p.codigo_interno && p.codigo_interno.toLowerCase().includes(busca.toLowerCase())) ||
      (p.codigo_barras && p.codigo_barras.includes(busca));

    const matchCategoria =
      categoriasFiltro.length === 0 ||
      (p.categoria_id && categoriasFiltro.includes(p.categoria_id));

    const estoqueProduto = getEstoqueReal(p);
    const matchEstoque =
      filtroEstoque === 'todos' ||
      (filtroEstoque === 'baixo' && estoqueProduto <= Number(p.estoque_minimo_alerta)) ||
      (filtroEstoque === 'zerado' && estoqueProduto <= 0);

    const matchAtivo =
      filtroAtivo === 'todos' ||
      (filtroAtivo === 'ativos' && p.ativo !== false) ||
      (filtroAtivo === 'inativos' && p.ativo === false);

    return matchBusca && matchCategoria && matchEstoque && matchAtivo;
  });

  const temFiltroAtivo = categoriasFiltro.length > 0 || filtroEstoque !== 'todos' || filtroAtivo !== 'todos';
  const qtdFiltrosAtivos = categoriasFiltro.length + (filtroEstoque !== 'todos' ? 1 : 0) + (filtroAtivo !== 'todos' ? 1 : 0);

  return (
    <div className={`h-full w-full overflow-hidden select-none ${isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-black'}`}>
      {/* 1. VISUALIZAÇÃO MOBILE EXCLUSIVA (TELAS 001 A 020) */}
      <div className="block md:hidden h-full overflow-hidden">
        <ProdutosMobile
          produtos={produtos}
          categorias={categorias}
          carregando={carregando}
          onRecarregar={carregarProdutos}
        />
      </div>

      {/* 2. VISUALIZAÇÃO DESKTOP (UNIFICADA COM DESIGN SYSTEM) */}
      <div className={`hidden md:flex flex-col h-full overflow-hidden font-sans ${isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-black'}`}>
        {/* Header Superior */}
        <div className={`p-4 md:p-6 border-b space-y-4 backdrop-blur ${isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-slate-100'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className={`p-2.5 rounded-xl border transition cursor-pointer ${isDark ? 'bg-[#000000] border-slate-700 hover:bg-slate-900 text-white' : 'bg-white border-2 border-slate-300 hover:bg-slate-50 text-black'}`}
              title="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className={`text-2xl font-black flex items-center gap-2 ${isDark ? 'text-white' : 'text-black'}`}>
                <Package className="w-6 h-6 text-emerald-500" />
                <span>Produtos & Estoque</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${isDark ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-100 text-emerald-900 border-2 border-emerald-400'}`}>
                  {produtos.length}
                </span>
              </h1>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-black font-semibold'}`}>
                Gerencie seus produtos, dê entrada em compras, controle custos e inventário
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Botão Gerenciar Categorias */}
            {permissions.podeCadastrarAlterarProdutos && (
              <button
                type="button"
                onClick={() => setModalCategorias(true)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition cursor-pointer shadow-sm ${isDark ? 'bg-[#000000] hover:bg-slate-900 border-slate-700 text-white' : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black'}`}
                title="Gerenciar Categorias de Produtos"
              >
                <FolderPlus className="w-4 h-4 text-emerald-500" />
                <span>Categorias</span>
              </button>
            )}

            {/* Botão Novo Produto */}
            {permissions.podeCadastrarAlterarProdutos && (
              <Link
                to="/products/create"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs shadow-md transition cursor-pointer border border-emerald-500"
              >
                <Plus className="w-4 h-4" />
                <span>+ Novo Produto</span>
              </Link>
            )}
          </div>
        </div>

        {/* Cards de Métricas de Estoque - Centralizados e Tipografia Padronizada */}
        {(() => {
          const controlaEstoque = loja?.configuracoes_extras?.controlar_estoque !== false && loja?.configuracoes_extras?.geral?.controlar_estoque !== false;
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className={`rounded-2xl p-3.5 shadow-sm text-center flex flex-col items-center justify-center space-y-1 ${
                isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
              }`}>
                <span className={`text-xs font-bold uppercase tracking-wider block text-center ${isDark ? 'text-slate-300' : 'text-black font-extrabold'}`}>
                  Total de Produtos
                </span>
                <span className={`text-lg sm:text-xl font-black tracking-tight block text-center font-mono ${isDark ? 'text-white' : 'text-black'}`}>
                  {produtos.length} itens
                </span>
              </div>

              <div className={`rounded-2xl p-3.5 shadow-sm text-center flex flex-col items-center justify-center space-y-1 ${
                isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
              }`}>
                <span className={`text-xs font-bold uppercase tracking-wider block text-center ${isDark ? 'text-slate-300' : 'text-black font-extrabold'}`}>
                  Estoque Físico Total
                </span>
                {controlaEstoque ? (
                  <span className={`text-lg sm:text-xl font-black tracking-tight block text-center font-mono ${isDark ? 'text-white' : 'text-black'}`}>
                    {totalItensEstoque} un
                  </span>
                ) : (
                  <span className={`text-xs font-semibold block pt-1 text-center ${isDark ? 'text-slate-400' : 'text-black'}`}>
                    Sem controle de estoque
                  </span>
                )}
              </div>

              <div className={`rounded-2xl p-3.5 shadow-sm text-center flex flex-col items-center justify-center space-y-1 ${
                isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
              }`}>
                <span className={`text-xs font-bold uppercase tracking-wider block text-center ${isDark ? 'text-slate-300' : 'text-black font-extrabold'}`}>
                  Valor em Venda (Varejo)
                </span>
                {controlaEstoque ? (
                  <span className={`text-lg sm:text-xl font-black tracking-tight block text-center font-mono ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    {formatarMoeda(valorTotalEstoque)}
                  </span>
                ) : (
                  <span className={`text-xs font-semibold block pt-1 text-center ${isDark ? 'text-slate-400' : 'text-black'}`}>
                    Sem controle de estoque
                  </span>
                )}
              </div>

              {permissions.podeVerPrecoCusto && (
                <div className={`rounded-2xl p-3.5 shadow-sm text-center flex flex-col items-center justify-center space-y-1 ${
                  isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <span className={`text-xs font-bold uppercase tracking-wider block text-center ${isDark ? 'text-slate-300' : 'text-black font-extrabold'}`}>
                    Valor em Custo
                  </span>
                  {controlaEstoque ? (
                    <span className={`text-lg sm:text-xl font-black tracking-tight block text-center font-mono ${isDark ? 'text-white' : 'text-black'}`}>
                      {formatarMoeda(valorCustoEstoque)}
                    </span>
                  ) : (
                    <span className={`text-xs font-semibold block pt-1 text-center ${isDark ? 'text-slate-400' : 'text-black'}`}>
                      Sem controle de estoque
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Área dividida em duas partes iguais: Busca (esquerda) e Filtros (direita) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          {/* Parte 1: Área de Busca (50%) */}
          <div className="relative w-full">
            <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
            <input
              type="text"
              placeholder="Buscar por nome, código SKU ou código de barras..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className={`w-full rounded-xl pl-10 pr-9 py-2 text-xs transition shadow-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium ${
                isDark
                  ? 'bg-[#000000] border border-slate-700 text-white placeholder-slate-400 focus:border-emerald-500'
                  : 'bg-white border-2 border-slate-300 text-black placeholder-slate-400 focus:border-emerald-600 font-semibold'
              }`}
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-black'}`}
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Parte 2: Área reservada para Filtros (50%) - Botão e Chips na MESMA LINHA */}
          <div className="flex items-center gap-2 flex-wrap min-h-[38px]">
            <button
              type="button"
              onClick={() => setModalFiltroAberto(true)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm shrink-0 ${
                temFiltroAtivo
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 shadow-md'
                  : isDark
                  ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-white'
                  : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black'
              }`}
              title="Filtrar por Categoria, Estoque e Ativo"
            >
              <Filter className={`w-4 h-4 ${temFiltroAtivo ? 'text-white' : isDark ? 'text-slate-400' : 'text-black'}`} />
              <span>Filtros</span>
              {qtdFiltrosAtivos > 0 && (
                <span className="w-5 h-5 rounded-full bg-white text-emerald-800 font-black text-[10px] flex items-center justify-center shadow-xs">
                  {qtdFiltrosAtivos}
                </span>
              )}
            </button>

            {/* Chips dos Filtros Selecionados na MESMA linha logo à direita de Filtros */}
            {categoriasFiltro.map((catId) => {
              const catObj = categorias.find(c => c.id === catId);
              const nomeCat = catObj ? catObj.nome : 'Categoria';
              return (
                <div
                  key={catId}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold shadow-xs shrink-0 animate-in fade-in ${
                    isDark
                      ? 'bg-[#000000] text-emerald-400 border border-emerald-500/50'
                      : 'bg-white text-emerald-800 border-2 border-emerald-300'
                  }`}
                >
                  <span>{nomeCat}</span>
                  <button
                    type="button"
                    onClick={() => setCategoriasFiltro(prev => prev.filter(id => id !== catId))}
                    className="p-0.5 rounded-md hover:opacity-80 transition cursor-pointer"
                    title={`Remover filtro ${nomeCat}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {filtroEstoque !== 'todos' && (
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold shadow-xs shrink-0 animate-in fade-in ${
                isDark
                  ? 'bg-[#000000] text-indigo-400 border border-indigo-500/50'
                  : 'bg-white text-indigo-900 border-2 border-indigo-300'
              }`}>
                <span>{filtroEstoque === 'baixo' ? 'Estoque Baixo' : 'Sem Estoque'}</span>
                <button
                  type="button"
                  onClick={() => setFiltroEstoque('todos')}
                  className="p-0.5 rounded-md hover:opacity-80 transition cursor-pointer"
                  title="Remover filtro de estoque"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {filtroAtivo !== 'todos' && (
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold shadow-xs shrink-0 animate-in fade-in ${
                isDark
                  ? 'bg-[#000000] text-teal-400 border border-teal-500/50'
                  : 'bg-white text-teal-900 border-2 border-teal-300'
              }`}>
                <span>{filtroAtivo === 'ativos' ? 'Ativos' : 'Inativos'}</span>
                <button
                  type="button"
                  onClick={() => setFiltroAtivo('todos')}
                  className="p-0.5 rounded-md hover:opacity-80 transition cursor-pointer"
                  title="Remover filtro de status"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid / Tabela de Produtos com cabeçalho fixo no scroll */}
      <div className="flex-1 min-h-0 overflow-hidden p-4 md:p-6 flex flex-col">
        {carregando ? (
          <div className="text-center py-16 text-slate-500 text-sm">Carregando estoque...</div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm space-y-3">
            <Package className="w-12 h-12 opacity-30 mx-auto" />
            <p>Nenhum produto cadastrado com esses filtros.</p>
            <Link
              to="/products/create"
              className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-bold underline"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Primeiro Produto</span>
            </Link>
          </div>
        ) : (
          <div className={`flex-1 min-h-0 rounded-2xl shadow-sm overflow-y-auto overflow-x-auto ${isDark ? 'bg-[#08131A] border-2 border-slate-400' : 'bg-slate-100 border-2 border-slate-300'}`}>
            <table className={`w-full text-left text-xs border-collapse ${isDark ? 'text-white' : 'text-black'}`}>
              <thead className={`sticky top-0 z-20 shadow-xs border-b uppercase text-[10px] tracking-wider font-extrabold ${isDark ? 'bg-[#000000] text-white border-slate-700' : 'bg-white text-black border-slate-300'}`}>
                <tr>
                  <th className="p-3.5">Produto</th>
                  <th className="p-3.5">Categoria</th>
                  <th className="p-3.5">Varejo</th>
                  <th className="p-3.5">Atacado</th>
                  <th className="p-3.5">Estoque Atual</th>
                  <th className="p-3.5 text-center">Ativo</th>
                  <th className="p-3.5 text-center">Catálogo</th>
                  <th className="p-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800 bg-[#000000]' : 'divide-slate-200 bg-white'}`}>
                  {produtosFiltrados.map((produto) => {
                    const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60';
                    const estoqueQtd = getEstoqueReal(produto);
                    const estoqueBaixo = estoqueQtd <= Number(produto.estoque_minimo_alerta || 0);
                    const temVariacoesGrade = Boolean(produto.tem_variacoes && Array.isArray(produto.variacoes) && produto.variacoes.length > 0);

                    return (
                      <tr key={produto.id} className={`transition group ${isDark ? 'hover:bg-slate-900/60' : 'hover:bg-slate-50'}`}>
                        <td className="p-3.5">
                          <div
                            onClick={() => setProdutoDetalhes(produto)}
                            className="flex items-center gap-3 cursor-pointer group/prod select-none"
                            title="Clique para ver ficha completa e detalhes do produto"
                          >
                            <img
                              src={fotoUrl}
                              alt={produto.nome}
                              className={`w-11 h-11 rounded-xl object-cover shrink-0 group-hover/prod:scale-105 transition duration-150 ${isDark ? 'bg-[#000000] border border-slate-700 group-hover/prod:border-emerald-500' : 'bg-slate-100 border border-slate-300 group-hover/prod:border-emerald-600'}`}
                            />
                            <div className="min-w-0">
                              <span className={`font-bold block text-xs group-hover/prod:underline transition truncate ${isDark ? 'text-white group-hover/prod:text-emerald-400' : 'text-black group-hover/prod:text-emerald-700'}`}>
                                {produto.nome}
                              </span>
                              {produto.codigo_interno && (
                                <span className={`text-[10px] font-mono block ${isDark ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                                  Cód: {produto.codigo_interno}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className={`p-3.5 font-bold ${isDark ? 'text-slate-200' : 'text-black'}`}>
                          {produto.categoria?.nome || 'Geral'}
                        </td>

                        <td className={`p-3.5 font-extrabold font-mono ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                          {formatarMoeda(produto.preco_venda_varejo)}
                        </td>

                        <td className={`p-3.5 font-bold font-mono ${isDark ? 'text-white' : 'text-black'}`}>
                          {produto.preco_venda_atacado ? (
                            <span className="font-bold font-mono">
                              {formatarMoeda(produto.preco_venda_atacado)}{' '}
                              <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>({produto.qtd_minima_atacado}+ un)</span>
                            </span>
                          ) : (
                            <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>-</span>
                          )}
                        </td>

                        {/* Estoque Atual e Botões de Ação Padronizados */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0 ${
                                estoqueQtd <= 0
                                  ? isDark ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-rose-50 text-rose-700 border-2 border-rose-300'
                                  : estoqueBaixo
                                  ? isDark ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-amber-50 text-amber-800 border-2 border-amber-300'
                                  : isDark
                                  ? 'bg-[#000000] text-white border border-slate-700'
                                  : 'bg-white text-black border-2 border-slate-300'
                              }`}
                            >
                              {estoqueBaixo && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                              <span>{estoqueQtd} {produto.tipo_unidade || 'un'}</span>
                            </span>

                            {/* 1. Botão de Entrada Rápida de Estoque (Sempre primeiro) */}
                            {permissions.podeGerenciarEstoque && (
                              <button
                                type="button"
                                onClick={() => setProdutoEstoqueAlvo(produto)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer shadow-xs shrink-0 ${
                                  isDark
                                    ? 'bg-[#000000] hover:bg-slate-900 border border-emerald-500/50 text-emerald-400'
                                    : 'bg-white hover:bg-slate-50 border-2 border-emerald-300 text-emerald-800'
                                }`}
                                title="Dar entrada por compra ou ajustar estoque"
                              >
                                <PackagePlus className="w-3 h-3 text-emerald-500" />
                                <span>Entrada</span>
                              </button>
                            )}

                            {/* 2. Botão Grade (Segundo, quando houver variações) */}
                            {temVariacoesGrade && (
                              <button
                                type="button"
                                onClick={() => setProdutoGradeModal(produto)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer shadow-xs shrink-0 ${
                                  isDark
                                    ? 'bg-[#000000] hover:bg-slate-900 border border-indigo-500/50 text-indigo-300'
                                    : 'bg-white hover:bg-slate-50 border-2 border-indigo-300 text-indigo-900'
                                }`}
                                title="Ver estoque detalhado por cor, tamanho ou variação"
                              >
                                <Layers className="w-3 h-3 text-indigo-500" />
                                <span>Grade</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Status Ativo: Sim / Não */}
                        <td className="p-3.5 text-center">
                          {permissions.podeCadastrarAlterarProdutos ? (
                            <button
                              type="button"
                              onClick={() => toggleAtivo(produto.id, produto.ativo)}
                              className="cursor-pointer"
                              title={produto.ativo !== false ? 'Clique para desativar produto' : 'Clique para ativar produto'}
                            >
                              {produto.ativo !== false ? (
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold transition ${
                                  isDark
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                                    : 'bg-emerald-50 text-emerald-800 border-2 border-emerald-300 hover:bg-emerald-100'
                                }`}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Sim
                                </span>
                              ) : (
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold transition ${
                                  isDark
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30'
                                    : 'bg-rose-50 text-rose-800 border-2 border-rose-300 hover:bg-rose-100'
                                }`}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                  Não
                                </span>
                              )}
                            </button>
                          ) : (
                            produto.ativo !== false ? (
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                isDark
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : 'bg-emerald-50 text-emerald-800 border-2 border-emerald-300'
                              }`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Sim
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                isDark
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                  : 'bg-rose-50 text-rose-800 border-2 border-rose-300'
                              }`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                Não
                              </span>
                            )
                          )}
                        </td>

                        <td className="p-3.5 text-center">
                          {permissions.podeCadastrarAlterarProdutos ? (
                            <button
                              onClick={() => toggleExibirCatalogo(produto.id, produto.exibir_catalogo)}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                produto.exibir_catalogo
                                  ? isDark ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-emerald-700 hover:bg-emerald-100'
                                  : isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-200'
                              }`}
                              title={produto.exibir_catalogo ? 'Visível no Catálogo' : 'Oculto do Catálogo'}
                            >
                              {produto.exibir_catalogo ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                          ) : (
                            <span className={produto.exibir_catalogo ? isDark ? 'text-emerald-400' : 'text-emerald-700' : isDark ? 'text-slate-400' : 'text-slate-500'}>
                              {produto.exibir_catalogo ? <Eye className="w-4 h-4 inline" /> : <EyeOff className="w-4 h-4 inline" />}
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Botão Detalhar / Ver Ficha Técnica Completa */}
                            <button
                              type="button"
                              onClick={() => setProdutoDetalhes(produto)}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                isDark
                                  ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                                  : 'text-black hover:text-indigo-700 hover:bg-slate-200'
                              }`}
                              title="Ver Ficha Completa do Produto"
                            >
                              <Info className="w-4 h-4" />
                            </button>

                            {permissions.podeCadastrarAlterarProdutos && (
                              <>
                                {/* Botão Alterar / Editar Produto */}
                                <Link
                                  to={`/products/edit/${produto.id}`}
                                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                                    isDark
                                      ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                                      : 'text-black hover:text-indigo-700 hover:bg-slate-200'
                                  }`}
                                  title="Alterar Produto"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Link>

                                <button
                                  type="button"
                                  onClick={() => setProdutoMlModal(produto)}
                                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                                    isDark ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10' : 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                                  }`}
                                  title="Integrar com Mercado Livre (Vincular ou Publicar)"
                                >
                                  <ShoppingBag className="w-4 h-4 text-[#FFE600]" />
                                </button>

                                <button
                                  onClick={() => toggleDestaque(produto.id, produto.destaque)}
                                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                                    produto.destaque ? 'text-amber-400' : isDark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-black'
                                  }`}
                                  title={produto.destaque ? 'Produto em Destaque' : 'Destacar Produto'}
                                >
                                  <Star className="w-4 h-4 fill-current" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        )}
      </div>
      {/* Fim da visualização desktop */}
      </div>

      {/* Modal Gerenciar Categorias */}
      <ModalGerenciarCategorias
        isOpen={modalCategorias}
        onClose={() => setModalCategorias(false)}
        categorias={categorias}
        onCategoriasAtualizadas={carregarProdutos}
      />

      {/* Modal Entrada de Estoque */}
      <ModalEntradaEstoque
        isOpen={!!produtoEstoqueAlvo}
        onClose={() => setProdutoEstoqueAlvo(null)}
        produto={produtoEstoqueAlvo}
        onEstoqueAtualizado={carregarProdutos}
      />

      {/* Modal Detalhes do Produto (Ficha Técnica Completa) */}
      <ModalDetalhesProduto
        isOpen={!!produtoDetalhes}
        onClose={() => setProdutoDetalhes(null)}
        produto={produtoDetalhes}
        apenasGrade={false}
      />

      {/* Modal Exclusivo de Detalhar Grade (Item 4) */}
      <ModalDetalhesProduto
        isOpen={!!produtoGradeModal}
        onClose={() => setProdutoGradeModal(null)}
        produto={produtoGradeModal}
        apenasGrade={true}
      />

      {/* Modal Integração Mercado Livre */}
      <ModalVincularAnuncioMl
        aberto={!!produtoMlModal}
        onFechar={() => setProdutoMlModal(null)}
        produto={produtoMlModal}
        lojaId={loja?.id || ''}
        isDark={isDark}
        onSucesso={carregarProdutos}
      />

      {/* Modal de Filtros de Produtos & Estoque */}
      {modalFiltroAberto && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalFiltroAberto(false);
          }}
        >
          <div className={`rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-150 ${
            isDark ? 'bg-[#08131A] border-2 border-slate-400 text-white' : 'bg-slate-100 border-2 border-slate-300 text-black'
          }`}>
            {/* Cabeçalho do Modal */}
            <div className={`flex items-center justify-between border-b pb-3.5 ${
              isDark ? 'border-slate-700' : 'border-slate-300'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs shrink-0 ${
                  isDark ? 'bg-[#000000] border border-emerald-500/50 text-emerald-400' : 'bg-emerald-600 text-white'
                }`}>
                  <Filter className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`font-black text-base leading-tight ${isDark ? 'text-white' : 'text-black'}`}>Filtrar Produtos & Estoque</h3>
                  <p className={`text-[11px] font-bold ${isDark ? 'text-white' : 'text-black'}`}>Escolha as categorias e a situação de estoque desejadas</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalFiltroAberto(false)}
                className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer shadow-xs"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Opções de Filtro */}
            <div className="space-y-5">
              {/* Categoria */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-black'}`}>
                    Categoria
                  </label>
                  {categoriasFiltro.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCategoriasFiltro([])}
                      className={`text-[11px] hover:underline cursor-pointer font-black ${
                        isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-700 hover:text-emerald-800'
                      }`}
                    >
                      Limpar categorias
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  <button
                    type="button"
                    onClick={() => setCategoriasFiltro([])}
                    className={`p-2.5 rounded-xl text-xs font-black text-left transition cursor-pointer flex items-center justify-between shadow-xs ${
                      categoriasFiltro.length === 0
                        ? 'bg-emerald-600 border border-emerald-500 text-white'
                        : isDark
                        ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-white'
                        : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black'
                    }`}
                  >
                    <span>Todas as Categorias</span>
                    {categoriasFiltro.length === 0 && <Check className="w-4 h-4 text-white shrink-0 ml-1" />}
                  </button>

                  {categorias.map((c) => {
                    const isSelected = categoriasFiltro.includes(c.id);
                    const qtdProdutosNaCat = produtos.filter(p => p.categoria_id === c.id).length;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCategoriasFiltro(prev =>
                            isSelected ? prev.filter(id => id !== c.id) : [...prev, c.id]
                          );
                        }}
                        className={`p-2.5 rounded-xl text-xs font-black text-left transition cursor-pointer flex items-center justify-between truncate shadow-xs ${
                          isSelected
                            ? 'bg-emerald-600 border border-emerald-500 text-white'
                            : isDark
                            ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-white'
                            : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black'
                        }`}
                      >
                        <span className="truncate">{c.icone ? `${c.icone} ` : ''}{c.nome} ({qtdProdutosNaCat})</span>
                        {isSelected && <Check className="w-4 h-4 text-white shrink-0 ml-1" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Situação do Estoque */}
              <div className="space-y-2">
                <label className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-black'}`}>
                  Situação do Estoque
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFiltroEstoque('todos')}
                    className={`p-3 rounded-xl text-xs font-black text-center transition cursor-pointer flex flex-col items-center gap-1 shadow-xs ${
                      filtroEstoque === 'todos'
                        ? 'bg-emerald-600 border border-emerald-500 text-white'
                        : isDark
                        ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-white'
                        : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black'
                    }`}
                  >
                    <span>Todos</span>
                    <span className={`text-[10px] ${filtroEstoque === 'todos' ? 'text-white font-bold' : isDark ? 'text-white font-semibold' : 'text-black font-medium'}`}>
                      Sem restrição
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFiltroEstoque('baixo')}
                    className={`p-3 rounded-xl text-xs font-black text-center transition cursor-pointer flex flex-col items-center gap-1 shadow-xs ${
                      filtroEstoque === 'baixo'
                        ? 'bg-amber-600 border border-amber-500 text-white'
                        : isDark
                        ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-amber-400'
                        : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-amber-900'
                    }`}
                  >
                    <span>⚠️ Estoque Baixo</span>
                    <span className={`text-[10px] ${filtroEstoque === 'baixo' ? 'text-white font-bold' : isDark ? 'text-amber-400 font-bold' : 'text-amber-800 font-bold'}`}>
                      {produtosAlertaEstoque.length} itens
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFiltroEstoque('zerado')}
                    className={`p-3 rounded-xl text-xs font-black text-center transition cursor-pointer flex flex-col items-center gap-1 shadow-xs ${
                      filtroEstoque === 'zerado'
                        ? 'bg-rose-600 border border-rose-500 text-white'
                        : isDark
                        ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-rose-400'
                        : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-rose-900'
                    }`}
                  >
                    <span>🚫 Sem Estoque</span>
                    <span className={`text-[10px] ${filtroEstoque === 'zerado' ? 'text-white font-bold' : isDark ? 'text-rose-400 font-bold' : 'text-rose-800 font-bold'}`}>
                      Zerados
                    </span>
                  </button>
                </div>
              </div>

              {/* Status do Produto (Ativo / Inativo) */}
              <div className="space-y-2">
                <label className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-black'}`}>
                  Status do Produto
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFiltroAtivo('todos')}
                    className={`p-3 rounded-xl text-xs font-black text-center transition cursor-pointer flex flex-col items-center gap-1 shadow-xs ${
                      filtroAtivo === 'todos'
                        ? 'bg-emerald-600 border border-emerald-500 text-white'
                        : isDark
                        ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-white'
                        : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black'
                    }`}
                  >
                    <span>Todos</span>
                    <span className={`text-[10px] ${filtroAtivo === 'todos' ? 'text-white font-bold' : isDark ? 'text-white font-semibold' : 'text-black font-medium'}`}>
                      Ativos e Inativos
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFiltroAtivo('ativos')}
                    className={`p-3 rounded-xl text-xs font-black text-center transition cursor-pointer flex flex-col items-center gap-1 shadow-xs ${
                      filtroAtivo === 'ativos'
                        ? 'bg-emerald-600 border border-emerald-500 text-white'
                        : isDark
                        ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-emerald-400'
                        : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-emerald-900'
                    }`}
                  >
                    <span>✅ Ativos</span>
                    <span className={`text-[10px] ${filtroAtivo === 'ativos' ? 'text-white font-bold' : isDark ? 'text-emerald-400 font-bold' : 'text-emerald-800 font-bold'}`}>
                      Habilitados
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFiltroAtivo('inativos')}
                    className={`p-3 rounded-xl text-xs font-black text-center transition cursor-pointer flex flex-col items-center gap-1 shadow-xs ${
                      filtroAtivo === 'inativos'
                        ? 'bg-rose-600 border border-rose-500 text-white'
                        : isDark
                        ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-rose-400'
                        : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-rose-900'
                    }`}
                  >
                    <span>🚫 Inativos</span>
                    <span className={`text-[10px] ${filtroAtivo === 'inativos' ? 'text-white font-bold' : isDark ? 'text-rose-400 font-bold' : 'text-rose-800 font-bold'}`}>
                      Desabilitados
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Rodapé do Modal */}
            <div className={`flex items-center justify-between pt-3.5 border-t ${
              isDark ? 'border-slate-700' : 'border-slate-300'
            }`}>
              <button
                type="button"
                onClick={() => {
                  setCategoriasFiltro([]);
                  setFiltroEstoque('todos');
                  setFiltroAtivo('todos');
                }}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isDark
                    ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-white'
                    : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black'
                }`}
              >
                Limpar Filtros
              </button>

              <button
                type="button"
                onClick={() => setModalFiltroAberto(false)}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-xs shadow-md transition cursor-pointer border border-emerald-500"
              >
                Aplicar e Ver ({produtosFiltrados.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
