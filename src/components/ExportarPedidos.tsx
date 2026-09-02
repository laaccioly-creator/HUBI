import React, { useState, useEffect, useMemo } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  ShoppingBag,
  ArrowLeft,
  Filter,
  Calendar,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Pedido } from '../types';
import { orderImportExportService } from '../services/orderImportExportService';

interface ExportarPedidosProps {
  onVoltar: () => void;
}

export const ExportarPedidos: React.FC<ExportarPedidosProps> = ({ onVoltar }) => {
  const { loja } = useAuth();

  const [pedidos, setPedidos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [exportando, setExportando] = useState<boolean>(false);

  // Filtros de Data
  const dataPadraoInicio = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  }, []);

  const dataPadraoFim = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  const [dataInicio, setDataInicio] = useState<string>(dataPadraoInicio);
  const [dataFim, setDataFim] = useState<string>(dataPadraoFim);
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');

  const carregarPedidos = async () => {
    if (!loja?.id) return;
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from('pedidos')
        .select('*, cliente:clientes(*), forma_pagamento:formas_pagamento(*), itens:itens_pedido(*, produto:produtos(*))')
        .eq('loja_id', loja.id)
        .gte('data_venda', `${dataInicio}T00:00:00`)
        .lte('data_venda', `${dataFim}T23:59:59`)
        .order('data_venda', { ascending: false });

      if (error) throw error;
      if (data) setPedidos(data);
    } catch (err) {
      console.error('Erro ao carregar pedidos para exportação:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarPedidos();
  }, [loja?.id, dataInicio, dataFim]);

  const pedidosFiltrados = useMemo(() => {
    if (filtroStatus === 'todos') return pedidos;
    if (filtroStatus === 'concluido') return pedidos.filter(p => p.status === 'concluido' || p.status === 'pago');
    if (filtroStatus === 'pendente') return pedidos.filter(p => p.status === 'pendente');
    if (filtroStatus === 'cancelado') return pedidos.filter(p => p.status === 'cancelado');
    return pedidos;
  }, [pedidos, filtroStatus]);

  const metricas = useMemo(() => {
    const totalPedidos = pedidosFiltrados.length;
    const totalFaturado = pedidosFiltrados.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
    const totalItens = pedidosFiltrados.reduce((acc, p) => {
      const itens = Array.isArray(p.itens) ? p.itens : [];
      return acc + itens.reduce((accI: number, i: any) => accI + Number(i.quantidade || 0), 0);
    }, 0);

    return { totalPedidos, totalFaturado, totalItens };
  }, [pedidosFiltrados]);

  const handleExportarXLSX = () => {
    try {
      setExportando(true);
      orderImportExportService.exportarPedidosXLSX(pedidosFiltrados, loja?.nome_fantasia);
    } catch (err: any) {
      alert(`Erro ao exportar pedidos: ${err.message}`);
    } finally {
      setExportando(false);
    }
  };

  const handleExportarCSV = () => {
    try {
      setExportando(true);
      orderImportExportService.exportarPedidosCSV(pedidosFiltrados, loja?.nome_fantasia);
    } catch (err: any) {
      alert(`Erro ao exportar pedidos: ${err.message}`);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="bg-white md:bg-slate-900 border border-slate-200 md:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-6 animate-in fade-in text-slate-800 md:text-slate-100">
      {/* Topo com Título e Voltar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 md:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVoltar}
            className="p-2 rounded-xl bg-slate-100 md:bg-slate-800 hover:bg-slate-200 md:hover:bg-slate-700 text-slate-700 md:text-slate-300 transition cursor-pointer"
            title="Voltar ao menu de importação e exportação"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase">
                Histórico & Fechamento de Caixa
              </span>
            </div>
            <h2 className="font-extrabold text-base sm:text-lg text-slate-800 md:text-slate-100 flex items-center gap-2 mt-1">
              <Download className="w-5 h-5 text-emerald-600 md:text-emerald-400" />
              <span>Exportar Pedidos e Vendas</span>
            </h2>
            <p className="text-xs text-slate-500 md:text-slate-400 mt-0.5">
              Exporte seus relatórios de vendas com discriminação de itens, clientes, meios de pagamento e valores.
            </p>
          </div>
        </div>
      </div>

      {/* Card Resumo e Métricas */}
      <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-center space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total de Pedidos</span>
            <span className="text-2xl font-black text-emerald-400">{metricas.totalPedidos}</span>
          </div>

          <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-center space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Itens Vendidos</span>
            <span className="text-2xl font-black text-slate-100">{metricas.totalItens}</span>
          </div>

          <div className="p-4 bg-slate-900 rounded-2xl border border-emerald-500/30 text-center space-y-1">
            <span className="text-[10px] uppercase font-bold text-emerald-400 block">Valor Total Faturado</span>
            <span className="text-2xl font-black text-emerald-400">R$ {metricas.totalFaturado.toFixed(2)}</span>
          </div>
        </div>

        {/* Filtros de Período e Status */}
        <div className="pt-3 border-t border-slate-800 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Data Inicial:</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Data Final:</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Status do Pedido:</label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="todos">Todos os status</option>
                <option value="concluido">Pagos / Concluídos</option>
                <option value="pendente">Pendentes</option>
                <option value="cancelado">Cancelados</option>
              </select>
            </div>
          </div>

          <div className="text-right text-xs text-slate-400 pt-1">
            {carregando ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Carregando pedidos...
              </span>
            ) : (
              <span>Total selecionado para exportação: <strong className="text-emerald-400">{pedidosFiltrados.length}</strong> pedidos</span>
            )}
          </div>
        </div>

        {/* Botões de Exportação */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={handleExportarXLSX}
            disabled={exportando || pedidosFiltrados.length === 0}
            className="w-full sm:flex-1 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{exportando ? 'Gerando arquivo...' : 'Exportar Pedidos em Excel (.XLSX)'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportarCSV}
            disabled={exportando || pedidosFiltrados.length === 0}
            className="w-full sm:flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-4 h-4 text-slate-400" />
            <span>{exportando ? 'Gerando arquivo...' : 'Exportar Pedidos em CSV (.CSV)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
