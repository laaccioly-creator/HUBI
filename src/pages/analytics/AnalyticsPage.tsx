import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  CreditCard,
  ShoppingBag,
  DollarSign,
  Award,
  Calendar
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Pedido } from '../../types/database';

export const AnalyticsPage: React.FC = () => {
  const { loja } = useAuth();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [periodo, setPeriodo] = useState<string>('30d');

  useEffect(() => {
    if (!loja?.id) return;
    const carregarAnalytics = async () => {
      try {
        setCarregando(true);
        const { data } = await supabase
          .from('pedidos')
          .select('*, itens:itens_pedido(*), vendedor:usuarios_loja(*)')
          .eq('loja_id', loja.id)
          .eq('status', 'confirmado');

        if (data) setPedidos(data as unknown as Pedido[]);
      } catch (err) {
        console.error('Erro ao carregar estatísticas:', err);
      } finally {
        setCarregando(false);
      }
    };

    carregarAnalytics();
  }, [loja?.id]);

  // Métricas Calculadas
  const faturamentoTotal = pedidos.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
  const totalVendas = pedidos.length;
  const ticketMedio = totalVendas > 0 ? faturamentoTotal / totalVendas : 0;

  // Lucro Real (Venda - Custo)
  const lucroRealTotal = pedidos.reduce((acc, p) => {
    const custoPedido = p.itens?.reduce((accI, item) => accI + (Number(item.preco_custo_unitario) * Number(item.quantidade)), 0) || 0;
    return acc + (Number(p.valor_total) - custoPedido);
  }, 0);

  // Ranking de Produtos Mais Vendidos
  const produtosMap: Record<string, { nome: string; qtd: number; total: number }> = {};
  pedidos.forEach(p => {
    p.itens?.forEach(item => {
      if (!produtosMap[item.nome_produto]) {
        produtosMap[item.nome_produto] = { nome: item.nome_produto, qtd: 0, total: 0 };
      }
      produtosMap[item.nome_produto].qtd += Number(item.quantidade);
      produtosMap[item.nome_produto].total += Number(item.subtotal);
    });
  });

  const rankingProdutos = Object.values(produtosMap).sort((a, b) => b.qtd - a.qtd).slice(0, 5);

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-slate-950 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <span>Estatísticas & Analytics</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Acompanhe o faturamento, ticket médio, lucro real e ranking de vendas da sua loja.
          </p>
        </div>

        {/* Seletor de Período */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
          <Calendar className="w-3.5 h-3.5 text-slate-400 ml-2" />
          {[
            { id: 'hoje', label: 'Hoje' },
            { id: '7d', label: '7 dias' },
            { id: '30d', label: '30 dias' },
            { id: 'mes', label: 'Este Mês' }
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setPeriodo(p.id)}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                periodo === p.id ? 'bg-emerald-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards de Desempenho */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Faturamento Total
          </span>
          <span className="text-xl md:text-2xl font-black text-emerald-400">
            R$ {faturamentoTotal.toFixed(2)}
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <ShoppingBag className="w-3.5 h-3.5 text-indigo-400" /> Volume de Vendas
          </span>
          <span className="text-xl md:text-2xl font-black text-slate-100">
            {totalVendas} pedidos
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-amber-400" /> Ticket Médio
          </span>
          <span className="text-xl md:text-2xl font-black text-slate-100">
            R$ {ticketMedio.toFixed(2)}
          </span>
        </div>

        <div className="bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-4 space-y-1">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-emerald-400" /> Lucro Líquido Real
          </span>
          <span className="text-xl md:text-2xl font-black text-emerald-400">
            R$ {lucroRealTotal.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Ranking de Mais Vendidos */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400" />
          <span>Top Produtos Mais Vendidos</span>
        </h2>

        {rankingProdutos.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">Ainda não há vendas registradas para montar o ranking.</p>
        ) : (
          <div className="space-y-2.5">
            {rankingProdutos.map((prod, index) => (
              <div
                key={index}
                className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-xl bg-slate-800 text-slate-200 font-bold text-xs flex items-center justify-center">
                    {index + 1}º
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">{prod.nome}</h4>
                    <span className="text-[10px] text-slate-500">{prod.qtd} unidades vendidas</span>
                  </div>
                </div>

                <span className="font-bold text-xs text-emerald-400">
                  R$ {prod.total.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
