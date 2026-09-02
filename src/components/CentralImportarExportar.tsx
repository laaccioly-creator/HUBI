import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  Users,
  Package,
  ShoppingBag,
  ArrowLeft,
  AlertTriangle,
  Info,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { ImportarClientes } from './ImportarClientes';
import { ExportarClientes } from './ExportarClientes';
import { ImportarExportarProdutos } from './ImportarExportarProdutos';
import { ImportarPedidos } from './ImportarPedidos';
import { ExportarPedidos } from './ExportarPedidos';

export type SubViewImportExport =
  | 'menu'
  | 'importar-clientes'
  | 'exportar-clientes'
  | 'importar-produtos'
  | 'exportar-produtos'
  | 'importar-pedidos'
  | 'exportar-pedidos';

interface CentralImportarExportarProps {
  onVoltar: () => void;
}

export const CentralImportarExportar: React.FC<CentralImportarExportarProps> = ({ onVoltar }) => {
  const [subView, setSubView] = useState<SubViewImportExport>('menu');

  if (subView === 'importar-clientes') {
    return <ImportarClientes onVoltar={() => setSubView('menu')} />;
  }

  if (subView === 'exportar-clientes') {
    return <ExportarClientes onVoltar={() => setSubView('menu')} />;
  }

  if (subView === 'importar-produtos') {
    return <ImportarExportarProdutos onVoltar={() => setSubView('menu')} abaInicial="importar" />;
  }

  if (subView === 'exportar-produtos') {
    return <ImportarExportarProdutos onVoltar={() => setSubView('menu')} abaInicial="exportar" />;
  }

  if (subView === 'importar-pedidos') {
    return <ImportarPedidos onVoltar={() => setSubView('menu')} />;
  }

  if (subView === 'exportar-pedidos') {
    return <ExportarPedidos onVoltar={() => setSubView('menu')} />;
  }

  const botoesAcao = [
    {
      id: 'importar-clientes',
      label: 'Importar Clientes',
      sublabel: 'Cadastrar contatos em lote via planilha modelo',
      icon: Users,
      actionType: 'import',
      badge: '1º Passo',
      badgeCor: 'bg-emerald-500 text-slate-950 font-black',
      iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    },
    {
      id: 'exportar-clientes',
      label: 'Exportar Clientes',
      sublabel: 'Baixar base de contatos, dados e fiados',
      icon: Users,
      actionType: 'export',
      badge: 'Excel / CSV',
      badgeCor: 'bg-slate-800 text-slate-300 font-bold',
      iconBg: 'bg-slate-800 text-slate-300 border-slate-700'
    },
    {
      id: 'importar-produtos',
      label: 'Importar Produtos',
      sublabel: 'Cadastrar e atualizar catálogo e estoque',
      icon: Package,
      actionType: 'import',
      badge: '2º Passo',
      badgeCor: 'bg-emerald-500 text-slate-950 font-black',
      iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    },
    {
      id: 'exportar-produtos',
      label: 'Exportar Produtos',
      sublabel: 'Baixar todos os produtos e preços cadastrados',
      icon: Package,
      actionType: 'export',
      badge: 'Excel / CSV',
      badgeCor: 'bg-slate-800 text-slate-300 font-bold',
      iconBg: 'bg-slate-800 text-slate-300 border-slate-700'
    },
    {
      id: 'importar-pedidos',
      label: 'Importar Pedidos',
      sublabel: 'Importar histórico de vendas e itens vendidos',
      icon: ShoppingBag,
      actionType: 'import',
      badge: '3º Passo',
      badgeCor: 'bg-amber-500 text-slate-950 font-black',
      iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    },
    {
      id: 'exportar-pedidos',
      label: 'Exportar Pedidos',
      sublabel: 'Relatório detalhado de vendas e faturamento',
      icon: ShoppingBag,
      actionType: 'export',
      badge: 'Excel / CSV',
      badgeCor: 'bg-slate-800 text-slate-300 font-bold',
      iconBg: 'bg-slate-800 text-slate-300 border-slate-700'
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Topo do Módulo */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 md:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVoltar}
            className="p-2 rounded-xl bg-slate-100 md:bg-slate-800 hover:bg-slate-200 md:hover:bg-slate-700 text-slate-700 md:text-slate-300 transition cursor-pointer"
            title="Voltar ao menu de configurações"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-extrabold text-base sm:text-lg text-slate-800 md:text-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 md:text-emerald-400" />
              <span>Importar / Exportar</span>
            </h2>
            <p className="text-xs text-slate-500 md:text-slate-400 mt-0.5">
              Gerencie a importação e exportação em massa de Clientes, Produtos e Pedidos via planilhas Excel (.xlsx) e CSV.
            </p>
          </div>
        </div>
      </div>

      {/* Banner de Alerta Didático da Ordem Recomendada */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-xs sm:text-sm text-slate-100">
              Atenção à Ordem Obrigatória de Importação
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Para evitar erros de relacionamento entre as tabelas do sistema, siga rigorosamente esta sequência:
            </p>
          </div>
        </div>

        {/* Linha do Tempo da Sequência */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-1 relative">
            <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-black text-[9px] uppercase tracking-wider">
              1º Passo: Clientes
            </span>
            <p className="text-xs text-slate-200 font-bold pt-1">Pessoas & Compradores</p>
            <p className="text-[11px] text-slate-400 leading-snug">
              Os clientes devem ser cadastrados primeiro para que os pedidos possam ser vinculados a eles.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-1 relative">
            <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-black text-[9px] uppercase tracking-wider">
              2º Passo: Produtos
            </span>
            <p className="text-xs text-slate-200 font-bold pt-1">Catálogo & Estoque</p>
            <p className="text-[11px] text-slate-400 leading-snug">
              Os produtos, códigos e preços precisam existir antes para compor os itens dos pedidos.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-amber-500/30 space-y-1 relative">
            <span className="inline-block px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-black text-[9px] uppercase tracking-wider">
              3º Passo: Pedidos
            </span>
            <p className="text-xs text-slate-200 font-bold pt-1">Vendas & Histórico</p>
            <p className="text-[11px] text-slate-400 leading-snug">
              Importados por último, vinculando com precisão os clientes e produtos já cadastrados.
            </p>
          </div>
        </div>
      </div>

      {/* GRADE DE BOTÕES (SEGUINDO O MESMO MODELO DE CONFIGURAÇÕES) */}
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {botoesAcao.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setSubView(btn.id as SubViewImportExport)}
              className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-850 hover:shadow-lg hover:shadow-emerald-500/5 flex flex-col items-center justify-center text-center gap-3 transition-all duration-200 cursor-pointer group relative"
            >
              {btn.badge && (
                <span className={`absolute top-3 right-3 text-[9px] px-2 py-0.5 rounded-full shadow-xs ${btn.badgeCor}`}>
                  {btn.badge}
                </span>
              )}

              <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/30 text-emerald-400 flex items-center justify-center transition-all group-hover:scale-110 relative">
                <btn.icon className="w-6 h-6" />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-[10px]">
                  {btn.actionType === 'import' ? (
                    <Upload className="w-2.5 h-2.5 text-emerald-400" />
                  ) : (
                    <Download className="w-2.5 h-2.5 text-cyan-400" />
                  )}
                </span>
              </div>

              <div>
                <span className="font-bold text-xs sm:text-sm text-slate-200 group-hover:text-emerald-400 transition leading-tight block">
                  {btn.label}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {btn.sublabel}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
