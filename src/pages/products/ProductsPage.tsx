import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Package,
  AlertTriangle,
  Sparkles,
  Star,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Tag
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Produto, Categoria } from '../../types/database';

export const ProductsPage: React.FC = () => {
  const { loja, usuario } = useAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [busca, setBusca] = useState<string>('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas');
  const [filtroEstoque, setFiltroEstoque] = useState<string>('todos');

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

  // Alternar Visibilidade no Catálogo Online
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

  // Alternar Destaque / Favorito
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

  // Excluir Produto
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

  // Métricas do Dashboard de Estoque
  const totalItensEstoque = produtos.reduce((acc, p) => acc + Number(p.quantidade_estoque || 0), 0);
  const valorTotalEstoque = produtos.reduce((acc, p) => acc + (Number(p.quantidade_estoque || 0) * Number(p.preco_venda_varejo || 0)), 0);
  const valorCustoEstoque = produtos.reduce((acc, p) => acc + (Number(p.quantidade_estoque || 0) * Number(p.preco_custo || 0)), 0);
  const produtosAlertaEstoque = produtos.filter(p => Number(p.quantidade_estoque) <= Number(p.estoque_minimo_alerta));

  const produtosFiltrados = produtos.filter(p => {
    const matchBusca =
      p.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (p.codigo_interno && p.codigo_interno.toLowerCase().includes(busca.toLowerCase())) ||
      (p.codigo_barras && p.codigo_barras.includes(busca));

    const matchCategoria = categoriaFiltro === 'todas' || p.categoria_id === categoriaFiltro;

    const matchEstoque =
      filtroEstoque === 'todos' ||
      (filtroEstoque === 'baixo' && Number(p.quantidade_estoque) <= Number(p.estoque_minimo_alerta)) ||
      (filtroEstoque === 'zerado' && Number(p.quantidade_estoque) <= 0);

    return matchBusca && matchCategoria && matchEstoque;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950">
      {/* HEADER & DASHBOARD DE MÉTRICAS */}
      <div className="p-4 md:p-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-400" />
              <span>Produtos & Estoque</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Gerencie seus produtos, preços de atacado/varejo, variações e controle de estoque.
            </p>
          </div>

          <Link
            to="/products/create"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Produto</span>
          </Link>
        </div>

        {/* Cards de Métricas do Estoque */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <span className="text-xs text-slate-400 block">Total de Produtos</span>
            <span className="text-lg font-bold text-slate-100">{produtos.length} itens</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <span className="text-xs text-slate-400 block">Estoque Físico</span>
            <span className="text-lg font-bold text-emerald-400">{totalItensEstoque} un</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <span className="text-xs text-slate-400 block">Valor em Venda (Varejo)</span>
            <span className="text-lg font-bold text-indigo-400">R$ {valorTotalEstoque.toFixed(2)}</span>
          </div>

          {usuario?.pode_ver_preco_custo !== false && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
              <span className="text-xs text-slate-400 block">Valor em Custo</span>
              <span className="text-lg font-bold text-slate-300">R$ {valorCustoEstoque.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Filtros e Busca */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, código ou código de barras..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
            >
              <option value="todas">Todas as Categorias</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>

            <select
              value={filtroEstoque}
              onChange={(e) => setFiltroEstoque(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
            >
              <option value="todos">Estoque: Todos</option>
              <option value="baixo">⚠️ Estoque Baixo ({produtosAlertaEstoque.length})</option>
              <option value="zerado">🚫 Sem Estoque</option>
            </select>
          </div>
        </div>
      </div>

      {/* TABELA DE PRODUTOS */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {carregando ? (
          <div className="text-center py-16 text-slate-500 text-sm">Carregando catálogo...</div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">Nenhum produto cadastrado com esses filtros.</div>
        ) : (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3.5">Produto</th>
                    <th className="p-3.5">Categoria</th>
                    <th className="p-3.5">Varejo</th>
                    <th className="p-3.5">Atacado</th>
                    <th className="p-3.5">Autoatacado</th>
                    <th className="p-3.5">Estoque</th>
                    <th className="p-3.5 text-center">Catálogo</th>
                    <th className="p-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {produtosFiltrados.map((produto) => {
                    const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60';
                    const estoqueBaixo = Number(produto.quantidade_estoque) <= Number(produto.estoque_minimo_alerta);

                    return (
                      <tr key={produto.id} className="hover:bg-slate-800/40 transition">
                        {/* Imagem + Nome */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-3">
                            <img
                              src={fotoUrl}
                              alt={produto.nome}
                              className="w-10 h-10 rounded-xl object-cover bg-slate-950 border border-slate-800"
                            />
                            <div>
                              <span className="font-bold text-slate-100 block text-xs">{produto.nome}</span>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                {produto.codigo_interno && <span>#{produto.codigo_interno}</span>}
                                {produto.tem_variacoes && (
                                  <span className="text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded font-semibold">
                                    {produto.variacoes?.length || 0} variações
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Categoria */}
                        <td className="p-3.5 text-slate-400">
                          {produto.categoria?.nome || 'Geral'}
                        </td>

                        {/* Preço Varejo */}
                        <td className="p-3.5 font-bold text-emerald-400">
                          R$ {Number(produto.preco_venda_varejo).toFixed(2)}
                        </td>

                        {/* Preço Atacado */}
                        <td className="p-3.5 text-slate-300">
                          {produto.preco_venda_atacado ? (
                            <span>R$ {Number(produto.preco_venda_atacado).toFixed(2)} <span className="text-[10px] text-slate-500">({produto.qtd_minima_atacado}+ un)</span></span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* Preço Autoatacado */}
                        <td className="p-3.5 text-slate-300">
                          {produto.preco_venda_autoatacado ? (
                            <span>R$ {Number(produto.preco_venda_autoatacado).toFixed(2)} <span className="text-[10px] text-slate-500">({produto.qtd_minima_autoatacado}+ un)</span></span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* Estoque */}
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                              estoqueBaixo
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-200'
                            }`}
                          >
                            {produto.quantidade_estoque} {produto.tipo_unidade}
                          </span>
                        </td>

                        {/* Switch Catálogo Online */}
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => toggleExibirCatalogo(produto.id, produto.exibir_catalogo)}
                            className={`p-1.5 rounded-lg transition ${
                              produto.exibir_catalogo
                                ? 'text-emerald-400 hover:bg-emerald-500/10'
                                : 'text-slate-600 hover:bg-slate-800'
                            }`}
                            title={produto.exibir_catalogo ? 'Visível no Catálogo' : 'Oculto do Catálogo'}
                          >
                            {produto.exibir_catalogo ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                        </td>

                        {/* Ações */}
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => toggleDestaque(produto.id, produto.destaque)}
                              className={`p-1.5 rounded-lg transition ${
                                produto.destaque ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'
                              }`}
                            >
                              <Star className="w-4 h-4 fill-current" />
                            </button>

                            <button
                              onClick={() => excluirProduto(produto.id)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
    </div>
  );
};
