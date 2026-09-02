import React, { useState, useEffect, useMemo } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Users,
  ArrowLeft,
  Filter,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Cliente } from '../types';
import { clientImportExportService } from '../services/clientImportExportService';

interface ExportarClientesProps {
  onVoltar: () => void;
}

export const ExportarClientes: React.FC<ExportarClientesProps> = ({ onVoltar }) => {
  const { loja } = useAuth();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [exportando, setExportando] = useState<boolean>(false);

  // Filtros
  const [apenasAtivos, setApenasAtivos] = useState<boolean>(false);
  const [apenasComTelefone, setApenasComTelefone] = useState<boolean>(false);
  const [apenasComFiado, setApenasComFiado] = useState<boolean>(false);

  const carregarClientes = async () => {
    if (!loja?.id) return;
    try {
      setCarregando(true);
      const { data } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', loja.id)
        .order('nome', { ascending: true });

      if (data) setClientes(data as Cliente[]);
    } catch (err) {
      console.error('Erro ao carregar clientes para exportação:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarClientes();
  }, [loja?.id]);

  const clientesFiltrados = useMemo(() => {
    return clientes.filter(c => {
      if (apenasAtivos && (c as any).ativo === false) return false;
      if (apenasComTelefone && !c.telefone && !c.whatsapp) return false;
      if (apenasComFiado && Number(c.saldo_devedor_fiado || 0) <= 0) return false;
      return true;
    });
  }, [clientes, apenasAtivos, apenasComTelefone, apenasComFiado]);

  const handleExportarXLSX = () => {
    try {
      setExportando(true);
      clientImportExportService.exportarClientesXLSX(clientesFiltrados, loja?.nome_fantasia);
    } catch (err: any) {
      alert(`Erro ao exportar clientes: ${err.message}`);
    } finally {
      setExportando(false);
    }
  };

  const handleExportarCSV = () => {
    try {
      setExportando(true);
      clientImportExportService.exportarClientesCSV(clientesFiltrados, loja?.nome_fantasia);
    } catch (err: any) {
      alert(`Erro ao exportar clientes: ${err.message}`);
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
                Base de Contatos & Fiado
              </span>
            </div>
            <h2 className="font-extrabold text-base sm:text-lg text-slate-800 md:text-slate-100 flex items-center gap-2 mt-1">
              <Download className="w-5 h-5 text-emerald-600 md:text-emerald-400" />
              <span>Exportar Clientes</span>
            </h2>
            <p className="text-xs text-slate-500 md:text-slate-400 mt-0.5">
              Exporte seus contatos cadastrados, telefones, endereços e históricos de fiado para planilhas.
            </p>
          </div>
        </div>
      </div>

      {/* Card Resumo e Métricas */}
      <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-center space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total de Clientes</span>
            <span className="text-2xl font-black text-emerald-400">{clientes.length}</span>
          </div>

          <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-center space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Com WhatsApp / Telefone</span>
            <span className="text-2xl font-black text-slate-100">
              {clientes.filter(c => c.whatsapp || c.telefone).length}
            </span>
          </div>

          <div className="p-4 bg-slate-900 rounded-2xl border border-rose-500/20 text-center space-y-1">
            <span className="text-[10px] uppercase font-bold text-rose-400 block">Com Débito Fiado</span>
            <span className="text-2xl font-black text-rose-400">
              {clientes.filter(c => Number(c.saldo_devedor_fiado || 0) > 0).length}
            </span>
          </div>
        </div>

        {/* Opções de Filtro */}
        <div className="pt-3 border-t border-slate-800 space-y-3">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-emerald-400" />
            <span>Filtros de Exportação:</span>
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex items-center gap-2.5 p-3 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={apenasComTelefone}
                onChange={(e) => setApenasComTelefone(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-xs font-semibold text-slate-300">
                Apenas com WhatsApp / Telefone
              </span>
            </label>

            <label className="flex items-center gap-2.5 p-3 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={apenasComFiado}
                onChange={(e) => setApenasComFiado(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-xs font-semibold text-slate-300">
                Apenas com Saldo Devedor (Fiado)
              </span>
            </label>

            <label className="flex items-center gap-2.5 p-3 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={apenasAtivos}
                onChange={(e) => setApenasAtivos(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-xs font-semibold text-slate-300">
                Apenas Clientes Ativos
              </span>
            </label>
          </div>

          <div className="text-right text-xs text-slate-400 pt-1">
            Total selecionado para exportação: <strong className="text-emerald-400">{clientesFiltrados.length}</strong> clientes
          </div>
        </div>

        {/* Botões de Exportação */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={handleExportarXLSX}
            disabled={exportando || clientesFiltrados.length === 0}
            className="w-full sm:flex-1 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{exportando ? 'Gerando arquivo...' : 'Exportar Clientes em Excel (.XLSX)'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportarCSV}
            disabled={exportando || clientesFiltrados.length === 0}
            className="w-full sm:flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-4 h-4 text-slate-400" />
            <span>{exportando ? 'Gerando arquivo...' : 'Exportar Clientes em CSV (.CSV)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
