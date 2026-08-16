import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Eye,
  Printer,
  Share2,
  CheckCircle2,
  Clock,
  Truck,
  Package,
  XCircle,
  Phone,
  Store,
  ChevronRight,
  X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Pedido, StatusPedido } from '../../types/database';
import { PrintService } from '../../services/printService';

export const OrdersPage: React.FC = () => {
  const { loja } = useAuth();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [statusFiltro, setStatusFiltro] = useState<string>('todos');
  const [busca, setBusca] = useState<string>('');
  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(null);

  const carregarPedidos = async () => {
    if (!loja?.id) return;
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          *,
          cliente:clientes(*),
          vendedor:usuarios_loja(*),
          itens:itens_pedido(*),
          pagamentos:pagamentos_pedido(*)
        `)
        .eq('loja_id', loja.id)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      if (data) setPedidos(data as unknown as Pedido[]);
    } catch (err) {
      console.error('Erro ao buscar pedidos:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarPedidos();

    // Inscrever no Realtime para atualizar pedidos na hora
    if (loja?.id) {
      const channel = supabase
        .channel('pedidos-alteracoes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pedidos', filter: `loja_id=eq.${loja.id}` },
          () => {
            carregarPedidos();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [loja?.id]);

  // Alterar Status do Pedido
  const atualizarStatus = async (pedidoId: string, novoStatus: StatusPedido) => {
    try {
      const { error } = await supabase
        .from('pedidos')
        .update({ status: novoStatus, atualizado_em: new Date().toISOString() })
        .eq('id', pedidoId);

      if (error) throw error;
      
      setPedidos(prev =>
        prev.map(p => (p.id === pedidoId ? { ...p, status: novoStatus } : p))
      );

      if (pedidoSelecionado && pedidoSelecionado.id === pedidoId) {
        setPedidoSelecionado(prev => prev ? { ...prev, status: novoStatus } : null);
      }
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
    }
  };

  const pedidosFiltrados = pedidos.filter(p => {
    const matchStatus = statusFiltro === 'todos' || p.status === statusFiltro;
    const matchBusca =
      p.numero_pedido.toString().includes(busca) ||
      (p.cliente?.nome && p.cliente.nome.toLowerCase().includes(busca.toLowerCase())) ||
      (p.observacoes && p.observacoes.toLowerCase().includes(busca.toLowerCase()));

    return matchStatus && matchBusca;
  });

  const getStatusBadge = (status: StatusPedido) => {
    switch (status) {
      case 'pendente':
        return <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Pendente</span>;
      case 'confirmado':
        return <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Confirmado</span>;
      case 'em_producao':
        return <span className="bg-blue-500/10 text-blue-400 border border-blue-500/30 text-xs px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Em Produção</span>;
      case 'em_expedicao':
        return <span className="bg-purple-500/10 text-purple-400 border border-purple-500/30 text-xs px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Em Entrega</span>;
      case 'concluido':
        return <span className="bg-slate-800 text-slate-300 text-xs px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5">Concluído</span>;
      case 'cancelado':
        return <span className="bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Cancelado</span>;
    }
  };

  return (
    <div className="flex h-full flex-col lg:flex-row overflow-hidden bg-slate-950">
      {/* LISTAGEM DE PEDIDOS */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header e Filtros */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="font-bold text-lg text-slate-100 flex items-center gap-2">
              <span>Gestão de Pedidos</span>
              <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full font-medium text-slate-400">
                {pedidosFiltrados.length} pedidos
              </span>
            </h1>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por nº do pedido, cliente..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Filtro por Status */}
            <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto scrollbar-none">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'pendente', label: 'Pendentes' },
                { id: 'confirmado', label: 'Confirmados' },
                { id: 'em_expedicao', label: 'Em Entrega' },
                { id: 'concluido', label: 'Concluídos' }
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFiltro(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                    statusFiltro === f.id
                      ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tabela / Cards de Pedidos */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {carregando ? (
            <div className="text-center py-12 text-slate-500 text-sm">Carregando pedidos...</div>
          ) : pedidosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">Nenhum pedido encontrado.</div>
          ) : (
            pedidosFiltrados.map((pedido) => (
              <div
                key={pedido.id}
                onClick={() => setPedidoSelecionado(pedido)}
                className={`bg-slate-900/80 hover:bg-slate-800/80 border rounded-2xl p-4 cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm ${
                  pedidoSelecionado?.id === pedido.id ? 'border-emerald-500 ring-1 ring-emerald-500/50' : 'border-slate-800/80'
                }`}
              >
                {/* Info Esquerda */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-base text-slate-100">
                      #{pedido.numero_pedido}
                    </span>
                    {pedido.origem === 'catalogo_online' ? (
                      <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                        <Store className="w-3 h-3" /> Catálogo
                      </span>
                    ) : (
                      <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded">
                        PDV
                      </span>
                    )}
                    {getStatusBadge(pedido.status)}
                  </div>

                  <p className="text-xs text-slate-300 font-medium">
                    {pedido.cliente?.nome ? `👤 ${pedido.cliente.nome}` : '👤 Cliente Avulso (Balcão)'}
                  </p>

                  <p className="text-[11px] text-slate-500">
                    {new Date(pedido.data_venda).toLocaleString('pt-BR')} • {pedido.itens?.length || 0} itens
                  </p>
                </div>

                {/* Info Direita / Valores */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800/60">
                  <span className="font-bold text-emerald-400 text-base">
                    R$ {Number(pedido.valor_total).toFixed(2)}
                  </span>
                  {Number(pedido.saldo_devedor) > 0 && (
                    <span className="text-[10px] text-amber-400 font-bold">
                      Fiado: R$ {Number(pedido.saldo_devedor).toFixed(2)}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
                    Ver detalhes <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* DRAWER LATERAL: DETALHES DO PEDIDO SELECIONADO & AÇÕES DE IMPRESSÃO */}
      {pedidoSelecionado && (
        <div className="w-full lg:w-[420px] bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-200">
          {/* Header Drawer */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-100 text-base">Pedido #{pedidoSelecionado.numero_pedido}</h3>
              <p className="text-xs text-slate-400">{new Date(pedidoSelecionado.data_venda).toLocaleString('pt-BR')}</p>
            </div>
            <button
              onClick={() => setPedidoSelecionado(null)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Conteúdo Drawer */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Status e Mudança Rápida */}
            <div className="bg-slate-800/60 p-3.5 rounded-2xl border border-slate-800 space-y-2">
              <label className="text-xs font-semibold text-slate-400 block">Atualizar Status:</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['pendente', 'confirmado', 'em_producao', 'em_expedicao', 'concluido', 'cancelado'] as StatusPedido[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => atualizarStatus(pedidoSelecionado.id, st)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold capitalize transition ${
                      pedidoSelecionado.status === st
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Dados do Cliente */}
            {pedidoSelecionado.cliente && (
              <div className="bg-slate-800/40 p-3.5 rounded-2xl border border-slate-800 text-xs space-y-1.5">
                <span className="font-bold text-slate-200 block">Dados do Cliente</span>
                <p className="text-slate-300">👤 {pedidoSelecionado.cliente.nome}</p>
                {pedidoSelecionado.cliente.whatsapp && (
                  <p className="text-slate-400 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-emerald-400" />
                    {pedidoSelecionado.cliente.whatsapp}
                  </p>
                )}
                {pedidoSelecionado.endereco_entrega && (
                  <p className="text-slate-400">📍 {pedidoSelecionado.endereco_entrega}</p>
                )}
              </div>
            )}

            {/* Itens do Pedido */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300">Itens Comprados</span>
              <div className="space-y-1.5">
                {pedidoSelecionado.itens?.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-200 block">
                        {item.quantidade}x {item.nome_produto}
                      </span>
                      {item.rotulo_variacao && (
                        <span className="text-[10px] text-slate-400">{item.rotulo_variacao}</span>
                      )}
                    </div>
                    <span className="font-bold text-slate-200">
                      R$ {Number(item.subtotal).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Totais */}
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 font-mono text-xs space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal:</span>
                <span>R$ {Number(pedidoSelecionado.subtotal).toFixed(2)}</span>
              </div>
              {Number(pedidoSelecionado.valor_frete) > 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>Frete:</span>
                  <span>+ R$ {Number(pedidoSelecionado.valor_frete).toFixed(2)}</span>
                </div>
              )}
              {Number(pedidoSelecionado.valor_desconto) > 0 && (
                <div className="flex justify-between text-rose-400">
                  <span>Desconto:</span>
                  <span>- R$ {Number(pedidoSelecionado.valor_desconto).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-emerald-400 font-bold text-sm pt-1 border-t border-slate-800">
                <span>TOTAL:</span>
                <span>R$ {Number(pedidoSelecionado.valor_total).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Botões de Ação do Drawer */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/90 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  if (loja) PrintService.printBluetoothThermal(pedidoSelecionado, loja, '58mm');
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Térmica 58/80mm</span>
              </button>

              <button
                onClick={() => PrintService.printWindow()}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700"
              >
                <Printer className="w-4 h-4 text-indigo-400" />
                <span>Imprimir A4</span>
              </button>
            </div>

            {pedidoSelecionado.cliente?.whatsapp && (
              <button
                onClick={() => {
                  if (loja && pedidoSelecionado.cliente?.whatsapp) {
                    const msg = PrintService.generateWhatsAppMessage(pedidoSelecionado, loja);
                    PrintService.openWhatsApp(pedidoSelecionado.cliente.whatsapp, msg);
                  }
                }}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow"
              >
                <Share2 className="w-4 h-4" />
                <span>Enviar Recibo por WhatsApp</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
