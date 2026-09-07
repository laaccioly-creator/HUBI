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
  X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Produto, Categoria } from '../types';
import { ModalGerenciarCategorias } from './ModalGerenciarCategorias';
import { ModalEntradaEstoque } from './ModalEntradaEstoque';
import { ModalDetalhesProduto } from './ModalDetalhesProduto';
import { ProdutosMobile } from './ProdutosMobile';

export const ProdutosEstoque: React.FC = () => {
  const { loja, usuario } = useAuth();
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
  const [modalFiltroAberto, setModalFiltroAberto] = useState<boolean>(false);

  // Modais
  const [modalCategorias, setModalCategorias] = useState<boolean>(false);
  const [produtoEstoqueAlvo, setProdutoEstoqueAlvo] = useState<Produto | null>(null);
  const [produtoDetalhes, setProdutoDetalhes] = useState<Produto | null>(null);
  const [produtoGradeModal, setProdutoGradeModal] = useState<Produto | null>(null);

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
      return;
    }
    try {
      const salvo = sessionStorage.getItem(`hubi_filtro_produtos_sessao_${usuario.id}`);
      if (salvo) {
        const dados = JSON.parse(salvo);
        setCategoriasFiltro(Array.isArray(dados.categorias) ? dados.categorias : []);
        setFiltroEstoque(typeof dados.estoque === 'string' ? dados.estoque : 'todos');
      } else {
        setCategoriasFiltro([]);
        setFiltroEstoque('todos');
      }
    } catch {
      setCategoriasFiltro([]);
      setFiltroEstoque('todos');
    }
  }, [usuario?.id]);

  // Persistir filtros apenas na sessão atual do usuário ativo
  useEffect(() => {
    if (!usuario?.id) return;
    try {
      const dados = {
        categorias: categoriasFiltro,
        estoque: filtroEstoque
      };
      sessionStorage.setItem(`hubi_filtro_produtos_sessao_${usuario.id}`, JSON.stringify(dados));
    } catch (e) {
      console.error('Erro ao persistir filtros de sessão:', e);
    }
  }, [categoriasFiltro, filtroEstoque, usuario?.id]);

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

    return matchBusca && matchCategoria && matchEstoque;
  });

  const temFiltroAtivo = categoriasFiltro.length > 0 || filtroEstoque !== 'todos';
  const qtdFiltrosAtivos = categoriasFiltro.length + (filtroEstoque !== 'todos' ? 1 : 0);

  return (
    <div className="h-full w-full overflow-hidden bg-slate-950 text-slate-100">
      {/* 1. VISUALIZAÇÃO MOBILE EXCLUSIVA (TELAS 001 A 020) */}
      <div className="block md:hidden h-full overflow-hidden">
        <ProdutosMobile
          produtos={produtos}
          categorias={categorias}
          carregando={carregando}
          onRecarregar={carregarProdutos}
        />
      </div>

      {/* 2. VISUALIZAÇÃO DESKTOP (MANTIDA 100% INTACTA) */}
      <div className="hidden md:flex flex-col h-full overflow-hidden bg-slate-950 font-sans">
        {/* Header Superior */}
        <div className="p-4 md:p-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition cursor-pointer"
              title="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-slate-100 flex items-center gap-2">
                <Package className="w-6 h-6 text-emerald-400" />
                <span>Produtos & Estoque</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  {produtos.length}
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs font-bold transition cursor-pointer shadow-sm"
                title="Gerenciar Categorias de Produtos"
              >
                <FolderPlus className="w-4 h-4 text-indigo-400" />
                <span>Categorias</span>
              </button>
            )}

            {/* Botão Novo Produto */}
            {permissions.podeCadastrarAlterarProdutos && (
              <Link
                to="/products/create"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Novo Produto</span>
              </Link>
            )}
          </div>
        </div>

        {/* Cards de Métricas de Estoque */}
        {(() => {
          const controlaEstoque = loja?.configuracoes_extras?.controlar_estoque !== false && loja?.configuracoes_extras?.geral?.controlar_estoque !== false;
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
                <span className="text-xs text-slate-400 block">Total de Produtos</span>
                <span className="text-lg font-bold text-slate-100">{produtos.length} itens</span>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
                <span className="text-xs text-slate-400 block">Estoque Físico Total</span>
                {controlaEstoque ? (
                  <span className="text-lg font-bold text-emerald-400">{totalItensEstoque} un</span>
                ) : (
                  <span className="text-xs font-semibold text-slate-400 block pt-1">Sem controle de estoque</span>
                )}
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
                <span className="text-xs text-slate-400 block">Valor em Venda (Varejo)</span>
                {controlaEstoque ? (
                  <span className="text-lg font-bold text-indigo-400">R$ {valorTotalEstoque.toFixed(2)}</span>
                ) : (
                  <span className="text-xs font-semibold text-slate-400 block pt-1">Sem controle de estoque</span>
                )}
              </div>

              {permissions.podeVerPrecoCusto && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
                  <span className="text-xs text-slate-400 block">Valor em Custo</span>
                  {controlaEstoque ? (
                    <span className="text-lg font-bold text-slate-300">R$ {valorCustoEstoque.toFixed(2)}</span>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400 block pt-1">Sem controle de estoque</span>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Área dividida em duas partes iguais: Busca (esquerda) e Filtros (direita) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* Parte 1: Área de Busca (50%) */}
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, código SKU ou código de barras..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-9 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Parte 2: Área reservada para Filtros (50%) */}
          <div className="flex flex-col gap-2">
            <div>
              <button
                type="button"
                onClick={() => setModalFiltroAberto(true)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition cursor-pointer shadow-xs ${
                  temFiltroAtivo
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                    : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-300'
                }`}
                title="Filtrar por Categoria e Estoque"
              >
                <Filter className={`w-4 h-4 ${temFiltroAtivo ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>Filtros</span>
                {qtdFiltrosAtivos > 0 && (
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px] flex items-center justify-center shadow-xs">
                    {qtdFiltrosAtivos}
                  </span>
                )}
              </button>
            </div>

            {/* Filtros ativos posicionados abaixo de Filtros, na área reservada para filtros */}
            {temFiltroAtivo && (
              <div className="flex items-center gap-2 flex-wrap pt-0.5 animate-in fade-in duration-150">
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                  Filtros ativos:
                </span>

                {categoriasFiltro.map((catId) => {
                  const catObj = categorias.find(c => c.id === catId);
                  const nomeCat = catObj ? `${catObj.icone ? catObj.icone + ' ' : ''}${catObj.nome}` : 'Categoria';
                  return (
                    <div
                      key={catId}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium shadow-xs"
                    >
                      <span>Categoria: <strong>{nomeCat}</strong></span>
                      <button
                        type="button"
                        onClick={() => setCategoriasFiltro(prev => prev.filter(id => id !== catId))}
                        className="p-0.5 rounded-full hover:bg-emerald-500/30 text-emerald-300 hover:text-white transition cursor-pointer"
                        title={`Desmarcar ${nomeCat}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

                {filtroEstoque !== 'todos' && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-medium shadow-xs">
                    <span>
                      Estoque: <strong>{filtroEstoque === 'baixo' ? 'Estoque Baixo' : 'Sem Estoque'}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiltroEstoque('todos')}
                      className="p-0.5 rounded-full hover:bg-indigo-500/30 text-indigo-300 hover:text-white transition cursor-pointer"
                      title="Desmarcar filtro de estoque"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setCategoriasFiltro([]);
                    setFiltroEstoque('todos');
                  }}
                  className="text-[11px] text-slate-400 hover:text-rose-400 underline ml-1 cursor-pointer transition"
                  title="Limpar todos os filtros"
                >
                  Limpar filtros
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid / Tabela de Produtos */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
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
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3.5">Produto</th>
                    <th className="p-3.5">Categoria</th>
                    <th className="p-3.5">Varejo</th>
                    <th className="p-3.5">Atacado</th>
                    <th className="p-3.5">Estoque Atual</th>
                    <th className="p-3.5 text-center">Catálogo</th>
                    <th className="p-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {produtosFiltrados.map((produto) => {
                    const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60';
                    const estoqueQtd = getEstoqueReal(produto);
                    const estoqueBaixo = estoqueQtd <= Number(produto.estoque_minimo_alerta || 0);
                    const temVariacoesGrade = Boolean(produto.tem_variacoes && Array.isArray(produto.variacoes) && produto.variacoes.length > 0);

                    return (
                      <tr key={produto.id} className="hover:bg-slate-800/40 transition group">
                        <td className="p-3.5">
                          <div
                            onClick={() => setProdutoDetalhes(produto)}
                            className="flex items-center gap-3 cursor-pointer group/prod select-none"
                            title="Clique para ver ficha completa e detalhes do produto"
                          >
                            <img
                              src={fotoUrl}
                              alt={produto.nome}
                              className="w-11 h-11 rounded-xl object-cover bg-slate-950 border border-slate-800 shrink-0 group-hover/prod:scale-105 group-hover/prod:border-emerald-500/50 transition duration-150"
                            />
                            <div className="min-w-0">
                              <span className="font-bold text-slate-100 block text-xs group-hover/prod:text-emerald-400 group-hover/prod:underline transition truncate">
                                {produto.nome}
                              </span>
                              {produto.codigo_interno && (
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  Cód: {produto.codigo_interno}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="p-3.5 text-slate-400">
                          {produto.categoria?.nome || 'Geral'}
                        </td>

                        <td className="p-3.5 font-bold text-emerald-400">
                          R$ {Number(produto.preco_venda_varejo).toFixed(2)}
                        </td>

                        <td className="p-3.5 text-slate-300">
                          {produto.preco_venda_atacado ? (
                            <span>
                              R$ {Number(produto.preco_venda_atacado).toFixed(2)}{' '}
                              <span className="text-[10px] text-slate-500">({produto.qtd_minima_atacado}+ un)</span>
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* Estoque Atual sem variações soltas, com Botão Detalhar apenas se tem_variacoes */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold inline-flex items-center gap-1 ${
                                estoqueQtd <= 0
                                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                  : estoqueBaixo
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-200 border border-slate-700'
                              }`}
                            >
                              {estoqueBaixo && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                              <span>{estoqueQtd} {produto.tipo_unidade || 'un'}</span>
                            </span>

                            {/* Botão Detalhar ao lado do estoque atual (EXIBIDO APENAS SE HOUVER VARIÁVEIS/GRADE) */}
                            {temVariacoesGrade && (
                              <button
                                type="button"
                                onClick={() => setProdutoGradeModal(produto)}
                                className="px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer shadow-sm"
                                title="Ver estoque detalhado por cor, tamanho ou variação"
                              >
                                <Layers className="w-3 h-3 text-indigo-400" />
                                <span>Detalhar Grade ({produto.variacoes?.length})</span>
                              </button>
                            )}

                            {/* Botão de Entrada Rápida de Estoque */}
                            {permissions.podeGerenciarEstoque && (
                              <button
                                type="button"
                                onClick={() => setProdutoEstoqueAlvo(produto)}
                                className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                                title="Dar entrada por compra ou ajustar estoque"
                              >
                                <PackagePlus className="w-3 h-3 text-emerald-400" />
                                <span>+ Entrada</span>
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="p-3.5 text-center">
                          {permissions.podeCadastrarAlterarProdutos ? (
                            <button
                              onClick={() => toggleExibirCatalogo(produto.id, produto.exibir_catalogo)}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                produto.exibir_catalogo
                                  ? 'text-emerald-400 hover:bg-emerald-500/10'
                                  : 'text-slate-600 hover:bg-slate-800'
                              }`}
                              title={produto.exibir_catalogo ? 'Visível no Catálogo' : 'Oculto do Catálogo'}
                            >
                              {produto.exibir_catalogo ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                          ) : (
                            <span className={produto.exibir_catalogo ? 'text-emerald-400' : 'text-slate-600'}>
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
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition cursor-pointer"
                              title="Ver Ficha Completa do Produto"
                            >
                              <Info className="w-4 h-4" />
                            </button>

                            {permissions.podeCadastrarAlterarProdutos && (
                              <>
                                {/* Botão Alterar / Editar Produto */}
                                <Link
                                  to={`/products/edit/${produto.id}`}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition cursor-pointer"
                                  title="Alterar Produto"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Link>

                                <button
                                  onClick={() => toggleDestaque(produto.id, produto.destaque)}
                                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                                    produto.destaque ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'
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

      {/* Modal de Filtros de Produtos & Estoque */}
      {modalFiltroAberto && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalFiltroAberto(false);
          }}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl text-slate-100 animate-in zoom-in-95 duration-150">
            {/* Cabeçalho do Modal */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Filter className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-100">Filtrar Produtos & Estoque</h3>
                  <p className="text-[11px] text-slate-400">Escolha as categorias e a situação de estoque desejadas</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalFiltroAberto(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
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
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Categoria
                  </label>
                  {categoriasFiltro.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCategoriasFiltro([])}
                      className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
                    >
                      Limpar categorias
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  <button
                    type="button"
                    onClick={() => setCategoriasFiltro([])}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition cursor-pointer flex items-center justify-between ${
                      categoriasFiltro.length === 0
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span>Todas as Categorias</span>
                    {categoriasFiltro.length === 0 && <Check className="w-3.5 h-3.5 text-emerald-400" />}
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
                        className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition cursor-pointer flex items-center justify-between truncate ${
                          isSelected
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 font-bold'
                            : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span className="truncate">{c.icone ? `${c.icone} ` : ''}{c.nome} ({qtdProdutosNaCat})</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Situação do Estoque */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Situação do Estoque
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFiltroEstoque('todos')}
                    className={`p-3 rounded-xl border text-xs font-semibold text-center transition cursor-pointer flex flex-col items-center gap-1 ${
                      filtroEstoque === 'todos'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span>Todos</span>
                    <span className="text-[10px] text-slate-400">Sem restrição</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFiltroEstoque('baixo')}
                    className={`p-3 rounded-xl border text-xs font-semibold text-center transition cursor-pointer flex flex-col items-center gap-1 ${
                      filtroEstoque === 'baixo'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span>⚠️ Estoque Baixo</span>
                    <span className="text-[10px] text-amber-400/80">{produtosAlertaEstoque.length} itens</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFiltroEstoque('zerado')}
                    className={`p-3 rounded-xl border text-xs font-semibold text-center transition cursor-pointer flex flex-col items-center gap-1 ${
                      filtroEstoque === 'zerado'
                        ? 'bg-rose-500/15 border-rose-500 text-rose-300 font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span>🚫 Sem Estoque</span>
                    <span className="text-[10px] text-rose-400/80">Zerados</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Rodapé do Modal */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setCategoriasFiltro([]);
                  setFiltroEstoque('todos');
                }}
                className="text-xs text-slate-400 hover:text-rose-400 transition cursor-pointer"
              >
                Limpar Filtros
              </button>

              <button
                type="button"
                onClick={() => setModalFiltroAberto(false)}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition cursor-pointer"
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
