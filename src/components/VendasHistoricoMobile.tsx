import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronDown,
  Clock,
  DollarSign,
  User,
  Share2,
  Receipt,
  X,
  Check,
  CheckCircle2,
  XCircle,
  Calendar,
  CreditCard,
  Wallet,
  Coins,
  Copy,
  Printer,
  Mail,
  ArrowLeft
} from 'lucide-react';
import { Pedido, Cliente, UsuarioLoja } from '../types';
import { PrintService, formatarDataRecibo } from '../services/printService';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';

interface VendasHistoricoMobileProps {
  vendas: Pedido[];
  clientes: Cliente[];
  usuarios: UsuarioLoja[];
  carregando: boolean;
  onVerItens: (pedido: Pedido) => void;
  onVerRecibo: (pedido: Pedido) => void;
  onCancelarVenda: (pedido: Pedido) => void;
}

export const VendasHistoricoMobile: React.FC<VendasHistoricoMobileProps> = ({
  vendas,
  clientes,
  usuarios,
  carregando,
  onVerItens,
  onVerRecibo,
  onCancelarVenda
}) => {
  const navigate = useNavigate();
  const { loja, usuario } = useAuth();
  const permissions = usePermissions();

  const [busca, setBusca] = useState<string>('');
  const [drawerMenuAberto, setDrawerMenuAberto] = useState<boolean>(false);
  const [drawerFiltrosAberto, setDrawerFiltrosAberto] = useState<boolean>(false);
  const [vendaDetalhes, setVendaDetalhes] = useState<Pedido | null>(null);
  const [copiado, setCopiado] = useState<boolean>(false);

  // Filtros
  const [periodoFiltro, setPeriodoFiltro] = useState<string>('todos');
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');
  const [vendedorFiltroId, setVendedorFiltroId] = useState<string>('todos');
  const [meiosPagamentoFiltro, setMeiosPagamentoFiltro] = useState<string[]>([]);

  // Mapas de lookup
  const mapaClientes = useMemo(() => {
    const map = new Map<string, Cliente>();
    clientes.forEach((c) => map.set(c.id, c));
    return map;
  }, [clientes]);

  const mapaUsuarios = useMemo(() => {
    const map = new Map<string, string>();
    usuarios.forEach((u) => map.set(u.id, u.nome_completo));
    return map;
  }, [usuarios]);

  // Filtragem de vendas
  const vendasFiltradas = useMemo(() => {
    return vendas.filter((venda) => {
      // Regra de permissão
      if (!permissions.podeVerTransacoesOutros && usuario && venda.vendedor_id && venda.vendedor_id !== usuario.id) {
        return false;
      }

      // Busca por cliente ou produto
      if (busca.trim()) {
        const termo = busca.toLowerCase();
        const nomeCli = venda.cliente?.nome?.toLowerCase() || '';
        const numPed = String(venda.numero_pedido || '').toLowerCase();
        const temItem = (venda.itens || venda.itens_pedido || []).some((it) =>
          it.nome_produto?.toLowerCase().includes(termo)
        );
        if (!nomeCli.includes(termo) && !numPed.includes(termo) && !temItem) {
          return false;
        }
      }

      // Filtro de vendedor
      if (vendedorFiltroId !== 'todos') {
        if (vendedorFiltroId === 'catalogo') {
          if (venda.origem !== 'catalogo_online') return false;
        } else {
          if (venda.vendedor_id !== vendedorFiltroId) return false;
        }
      }

      // Filtro de meio de pagamento
      if (meiosPagamentoFiltro.length > 0) {
        const tipos = (venda.pagamentos || []).map((p: any) => p.forma_pagamento?.tipo?.toLowerCase());
        const match = meiosPagamentoFiltro.some((m) => tipos.includes(m.toLowerCase()));
        if (!match) return false;
      }

      // Filtro por Data
      if (periodoFiltro !== 'todos') {
        const dtVenda = new Date(venda.data_venda || venda.criado_em || Date.now());
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        if (periodoFiltro === 'hoje') {
          if (dtVenda < hoje) return false;
        } else if (periodoFiltro === 'ontem') {
          const ontem = new Date(hoje);
          ontem.setDate(ontem.getDate() - 1);
          if (dtVenda < ontem || dtVenda >= hoje) return false;
        } else if (periodoFiltro === '30dias') {
          const limite = new Date();
          limite.setDate(limite.getDate() - 30);
          if (dtVenda < limite) return false;
        } else if (periodoFiltro === 'custom') {
          const rawData = venda.data_venda || venda.criado_em || '';
          if (dataInicio && rawData && new Date(rawData) < new Date(dataInicio + 'T00:00:00')) return false;
          if (dataFim && rawData && new Date(rawData) > new Date(dataFim + 'T23:59:59')) return false;
        }
      }

      return true;
    });
  }, [vendas, busca, vendedorFiltroId, meiosPagamentoFiltro, periodoFiltro, dataInicio, dataFim, permissions.podeVerTransacoesOutros, usuario]);

  // Agrupamento por Data
  const gruposPorData = useMemo(() => {
    const grupos: { [key: string]: { label: string; vendas: Pedido[]; totalValor: number } } = {};
    const hoje = new Date();
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);

    vendasFiltradas.forEach((v) => {
      const d = new Date(v.data_venda || v.criado_em || Date.now());
      let label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

      if (d.toDateString() === hoje.toDateString()) {
        label = 'Hoje';
      } else if (d.toDateString() === ontem.toDateString()) {
        label = 'Ontem';
      }

      if (!grupos[label]) {
        grupos[label] = { label, vendas: [], totalValor: 0 };
      }
      grupos[label].vendas.push(v);
      if (v.status !== 'cancelado') {
        grupos[label].totalValor += Number(v.valor_total || 0);
      }
    });

    return Object.values(grupos);
  }, [vendasFiltradas]);

  const totalGeral = useMemo(() => {
    return vendasFiltradas
      .filter((v) => v.status !== 'cancelado')
      .reduce((acc, v) => acc + Number(v.valor_total || 0), 0);
  }, [vendasFiltradas]);

  const obterIconePagamento = (p: Pedido) => {
    const tipo = (p.pagamentos?.[0] as any)?.forma_pagamento?.tipo?.toLowerCase() || '';
    if (tipo === 'dinheiro') return <Coins className="w-3.5 h-3.5 text-emerald-600" />;
    if (tipo === 'pix') return <Wallet className="w-3.5 h-3.5 text-teal-600" />;
    return <CreditCard className="w-3.5 h-3.5 text-sky-600" />;
  };

  const handleCopiarRecibo = (pedido: Pedido) => {
    const texto = `Pedido #${pedido.numero_pedido}\nData: ${pedido.data_venda || ''}\nTotal: R$ ${Number(pedido.valor_total).toFixed(2)}`;
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  // Se houver uma venda selecionada para detalhes (Sheet de Detalhes no tema claro)
  if (vendaDetalhes) {
    const cli = vendaDetalhes.cliente_id ? mapaClientes.get(vendaDetalhes.cliente_id) : null;
    const nomeVendedor =
      vendaDetalhes.origem === 'catalogo_online'
        ? 'Catálogo Online'
        : vendaDetalhes.vendedor_id
        ? mapaUsuarios.get(vendaDetalhes.vendedor_id)
        : 'Operador';
    const cancelado = vendaDetalhes.status === 'cancelado';
    const itens = vendaDetalhes.itens || vendaDetalhes.itens_pedido || [];

    return (
      <div className="fixed inset-0 z-50 bg-white text-slate-900 flex flex-col justify-between animate-in slide-in-from-right duration-150 select-none">
        {/* Header */}
        <div className="h-14 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVendaDetalhes(null)}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h2 className="font-bold text-sm text-slate-800">
                Venda #{vendaDetalhes.numero_pedido}
              </h2>
              <span className="text-[10px] text-slate-400">
                {new Date(vendaDetalhes.data_venda).toLocaleString('pt-BR')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => PrintService.printReceipt(vendaDetalhes, loja)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
              title="Imprimir Recibo"
            >
              <Printer className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Card de Valor Total */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">Valor Total</span>
              <span className={`text-2xl font-black ${cancelado ? 'line-through text-rose-500' : 'text-slate-900'}`}>
                R$ {Number(vendaDetalhes.valor_total).toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
              <span className="text-slate-500">Vendido por:</span>
              <span className="font-bold text-slate-800">{nomeVendedor}</span>
            </div>

            {cli && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Cliente:</span>
                <span className="font-bold text-slate-800">{cli.nome}</span>
              </div>
            )}

            {cancelado && (
              <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-1.5 mt-2">
                <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Esta venda foi cancelada</span>
              </div>
            )}
          </div>

          {/* Lista de Produtos da Venda */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Itens da Venda ({itens.length})
            </h3>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-xs">
              {itens.map((it: any, idx: number) => (
                <div key={idx} className="p-3 flex items-center justify-between text-xs">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="font-bold text-slate-800 truncate">{it.nome_produto}</p>
                    <p className="text-[11px] text-slate-500">
                      {it.quantidade}x R$ {Number(it.preco_venda_unitario).toFixed(2)}
                    </p>
                  </div>
                  <span className="font-bold text-slate-900 shrink-0">
                    R$ {(Number(it.quantidade) * Number(it.preco_venda_unitario)).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Ações de Compartilhamento do Recibo */}
          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Comprovante</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (loja && vendaDetalhes) {
                    const msg = PrintService.generateWhatsAppMessage(vendaDetalhes, loja);
                    PrintService.openWhatsApp(vendaDetalhes.cliente?.whatsapp || '', msg);
                  }
                }}
                className="p-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"
              >
                <Share2 className="w-4 h-4" />
                <span>Enviar WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => handleCopiarRecibo(vendaDetalhes)}
                className="p-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 border border-slate-200 transition"
              >
                {copiado ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiado ? 'Copiado!' : 'Copiar Recibo'}</span>
              </button>
            </div>

            {!cancelado && permissions.ehAdmin && (
              <button
                type="button"
                onClick={() => {
                  setVendaDetalhes(null);
                  onCancelarVenda(vendaDetalhes);
                }}
                className="w-full mt-2 p-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <XCircle className="w-4 h-4" />
                <span>Cancelar Venda</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 text-slate-900 select-none">
      {/* 1. Header Superior Mobile */}
      <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition cursor-pointer"
            title="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setDrawerMenuAberto(true)}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition cursor-pointer"
            title="Menu Principal"
          >
            <div className="space-y-1">
              <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
              <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
              <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
            </div>
          </button>
          <h1 className="font-bold text-base text-slate-800">Vendas</h1>
        </div>

        <button
          type="button"
          onClick={() => setDrawerFiltrosAberto(true)}
          className={`p-2 rounded-xl border transition ${
            periodoFiltro !== 'todos' || vendedorFiltroId !== 'todos' || meiosPagamentoFiltro.length > 0
              ? 'bg-emerald-50 text-emerald-600 border-emerald-300 font-bold'
              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
          }`}
          title="Filtros"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Campo de Busca Integrado */}
      <div className="p-3 bg-white border-b border-slate-200 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por cliente ou produto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Lista Agrupada por Data */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {carregando ? (
          <div className="text-center py-16 text-xs text-slate-400">Carregando histórico de vendas...</div>
        ) : gruposPorData.length === 0 ? (
          <div className="text-center py-16 text-xs text-slate-400">Nenhuma venda encontrada.</div>
        ) : (
          gruposPorData.map((grupo) => (
            <div key={grupo.label} className="space-y-2">
              <div className="px-1 flex items-baseline justify-between">
                <h3 className="font-bold text-xs text-slate-800">{grupo.label}</h3>
                <span className="text-[10px] text-slate-400 font-medium">
                  {grupo.vendas.length} {grupo.vendas.length === 1 ? 'venda' : 'vendas'} • R$ {grupo.totalValor.toFixed(2)}
                </span>
              </div>

              <div className="space-y-1.5">
                {grupo.vendas.map((v) => {
                  const cli = v.cliente_id ? mapaClientes.get(v.cliente_id) : null;
                  const vendedor =
                    v.origem === 'catalogo_online'
                      ? 'Catálogo Online'
                      : v.vendedor_id
                      ? mapaUsuarios.get(v.vendedor_id)
                      : 'Operador';
                  const cancelado = v.status === 'cancelado';
                  const itens = v.itens || v.itens_pedido || [];

                  return (
                    <div
                      key={v.id}
                      onClick={() => setVendaDetalhes(v)}
                      className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer space-y-1.5 shadow-xs"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          {cancelado ? (
                            <XCircle className="w-3.5 h-3.5 text-rose-500" />
                          ) : (
                            obterIconePagamento(v)
                          )}
                          <span className={`font-black ${cancelado ? 'line-through text-rose-500' : 'text-slate-900'}`}>
                            R$ {Number(v.valor_total).toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">por {vendedor}</span>
                        </div>

                        <span className="text-[10px] text-slate-400 font-medium">
                          {new Date(v.data_venda).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span className="truncate max-w-[220px]">
                          {itens.length} itens: {itens.map((i: any) => `${i.quantidade}x ${i.nome_produto}`).join(', ')}
                        </span>
                        <span className="text-slate-400 font-mono">#{v.numero_pedido}</span>
                      </div>

                      {cli && (
                        <div className="flex items-center gap-1 pt-0.5 text-[10px] font-bold text-slate-600 uppercase">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{cli.nome}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 4. Barra Flutuante Inferior de Totais */}
      <div className="p-3 bg-slate-900 text-white flex items-center justify-between text-xs shrink-0 shadow-lg">
        <span className="text-slate-400 font-medium">Total em vendas</span>
        <span className="font-black text-emerald-400 text-sm">
          R$ {totalGeral.toFixed(2)} em {vendasFiltradas.filter((v) => v.status !== 'cancelado').length} vendas
        </span>
      </div>

      {/* 5. Modal / Gaveta de Filtros Avançados Mobile (Tema Claro) */}
      {drawerFiltrosAberto && (
        <div className="fixed inset-0 z-50 bg-white text-slate-900 flex flex-col justify-between animate-in slide-in-from-right duration-150">
          <div className="h-14 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
            <h2 className="font-bold text-base text-slate-800">Filtros de Vendas</h2>
            <button
              type="button"
              onClick={() => setDrawerFiltrosAberto(false)}
              className="p-1 rounded-full text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Período */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Calendar className="w-4 h-4 text-emerald-500" />
                <span>Período</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'todos', label: 'Tudo' },
                  { id: 'hoje', label: 'Hoje' },
                  { id: 'ontem', label: 'Ontem' },
                  { id: '30dias', label: 'Últimos 30 dias' }
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriodoFiltro(p.id)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition border ${
                      periodoFiltro === p.id
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Vendedores */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <User className="w-4 h-4 text-emerald-500" />
                <span>Vendedor / Operador</span>
              </div>

              <select
                value={vendedorFiltroId}
                onChange={(e) => setVendedorFiltroId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
              >
                <option value="todos">Todos os vendedores</option>
                <option value="catalogo">Catálogo Online</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome_completo}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-4 border-t border-slate-200 bg-white flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPeriodoFiltro('todos');
                setVendedorFiltroId('todos');
                setMeiosPagamentoFiltro([]);
                setDrawerFiltrosAberto(false);
              }}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => setDrawerFiltrosAberto(false)}
              className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-md transition"
            >
              Aplicar Filtros
            </button>
          </div>
        </div>
      )}

      {/* Menu Gaveta Lateral */}
      <MobileMenuDrawer
        aberto={drawerMenuAberto}
        onFechar={() => setDrawerMenuAberto(false)}
      />
    </div>
  );
};
