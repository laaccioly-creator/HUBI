import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
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
  X,
  FileText,
  User,
  ArrowUpDown,
  Filter,
  Volume2,
  VolumeX,
  ShoppingBag,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Pedido, StatusPedido } from '../types';
import { PrintService } from '../services/printService';
import { audioService } from '../services/audioService';

type OrdenacaoCampo = 'data' | 'valor';
type OrdenacaoDirecao = 'asc' | 'desc';

export const PedidosLista: React.FC = () => {
  const { loja } = useAuth();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [statusFiltro, setStatusFiltro] = useState<string>('abertos');
  const [busca, setBusca] = useState<string>('');
  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(null);
  const [somAtivo, setSomAtivo] = useState<boolean>(true);
  const [campoOrdenacao, setCampoOrdenacao] = useState<OrdenacaoCampo>('data');
  const [direcaoOrdenacao, setDirecaoOrdenacao] = useState<OrdenacaoDirecao>('desc');

  const carregarPedidos = async (tocarAlerta = false) => {
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
      if (data) {
        setPedidos(data as unknown as Pedido[]);
        if (tocarAlerta && somAtivo) {
          audioService.playNewOrderSound();
        }
      }
    } catch (err) {
      console.error('Erro ao buscar pedidos:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarPedidos();

    if (loja?.id) {
      const channel = supabase
        .channel('pedidos-lista-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pedidos', filter: `loja_id=eq.${loja.id}` },
          (payload) => {
            const isNovo = payload.eventType === 'INSERT';
            carregarPedidos(isNovo);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [loja?.id, somAtivo]);

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

      audioService.playBeep();
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
    }
  };

  // Contagem de pedidos abertos (pendente, confirmado, em_producao, em_expedicao)
  const pedidosAbertosCount = useMemo(() => {
    return pedidos.filter(p => ['pendente', 'confirmado', 'em_producao', 'em_expedicao'].includes(p.status)).length;
  }, [pedidos]);

  // Filtragem e Ordenação
  const pedidosFiltrados = useMemo(() => {
    return pedidos
      .filter(p => {
        let matchStatus = true;
        if (statusFiltro === 'abertos') {
          matchStatus = ['pendente', 'confirmado', 'em_producao', 'em_expedicao'].includes(p.status);
        } else if (statusFiltro !== 'todos') {
          matchStatus = p.status === statusFiltro;
        }

        const termo = busca.toLowerCase().trim();
        const matchBusca =
          !termo ||
          p.numero_pedido.toString().includes(termo) ||
          (p.cliente?.nome && p.cliente.nome.toLowerCase().includes(termo)) ||
          (p.vendedor?.nome_completo && p.vendedor.nome_completo.toLowerCase().includes(termo)) ||
          (p.observacoes && p.observacoes.toLowerCase().includes(termo)) ||
          p.itens?.some(i => i.nome_produto.toLowerCase().includes(termo));

        return matchStatus && matchBusca;
      })
      .sort((a, b) => {
        let comparacao = 0;
        if (campoOrdenacao === 'data') {
          comparacao = new Date(a.data_venda || a.criado_em || '').getTime() - new Date(b.data_venda || b.criado_em || '').getTime();
        } else if (campoOrdenacao === 'valor') {
          comparacao = Number(a.valor_total) - Number(b.valor_total);
        }
        return direcaoOrdenacao === 'asc' ? comparacao : -comparacao;
      });
  }, [pedidos, statusFiltro, busca, campoOrdenacao, direcaoOrdenacao]);

  const toggleOrdenacao = (campo: OrdenacaoCampo) => {
    if (campoOrdenacao === campo) {
      setDirecaoOrdenacao(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setCampoOrdenacao(campo);
      setDirecaoOrdenacao('desc');
    }
  };

  const getStatusBadge = (status: StatusPedido) => {
    switch (status) {
      case 'pendente':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" /> Pendente
          </span>
        );
      case 'confirmado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Confirmado
          </span>
        );
      case 'em_producao':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Package className="w-3 h-3" /> Produção
          </span>
        );
      case 'em_expedicao':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Truck className="w-3 h-3" /> Entrega
          </span>
        );
      case 'concluido':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Concluído
          </span>
        );
      case 'cancelado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400/80 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> Cancelado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400">
            {status}
          </span>
        );
    }
  };

  const formatarData = (dataStr: string) => {
    try {
      const data = new Date(dataStr);
      const dia = String(data.getDate()).padStart(2, '0');
      const mes = String(data.getMonth() + 1).padStart(2, '0');
      const ano = String(data.getFullYear()).slice(-2);
      const hora = String(data.getHours()).padStart(2, '0');
      const min = String(data.getMinutes()).padStart(2, '0');
      return `${dia}/${mes}/${ano}, ${hora}:${min}`;
    } catch {
      return dataStr;
    }
  };

  const calcularTotalItens = (pedido: Pedido) => {
    if (!pedido.itens || pedido.itens.length === 0) return 0;
    return pedido.itens.reduce((acc, item) => acc + Number(item.quantidade), 0);
  };

  return (
    <div className="flex h-full flex-col lg:flex-row overflow-hidden bg-slate-950 text-slate-100">
      {/* CORPO PRINCIPAL: CABEÇALHO + TABELA KYTE-STYLE */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* CABEÇALHO SUPERIOR */}
        <div className="p-4 sm:px-6 py-4 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                <span>{pedidosAbertosCount} pedidos abertos</span>
              </h1>
              <p className="text-xs text-slate-400">
                {pedidos.length} pedidos no total • Atualizado em tempo real
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSomAtivo(!somAtivo)}
                title={somAtivo ? 'Notificação sonora ativada' : 'Notificação sonora desativada'}
                className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${
                  somAtivo
                    ? 'bg-slate-800/80 border-slate-700 text-emerald-400 hover:bg-slate-700'
                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800'
                }`}
              >
                {somAtivo ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span className="hidden md:inline">{somAtivo ? 'Som Ativo' : 'Mudo'}</span>
              </button>

              <button
                onClick={() => carregarPedidos()}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1.5"
              >
                Atualizar
              </button>
            </div>
          </div>

          {/* BARRA DE BUSCA E FILTROS */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            {/* Input de Busca */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Item ou cliente"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
              {busca && (
                <button
                  onClick={() => setBusca('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filtros de Status */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800/80">
                {[
                  { id: 'abertos', label: 'Abertos' },
                  { id: 'todos', label: 'Todos os status' },
                  { id: 'pendente', label: 'Pendente' },
                  { id: 'confirmado', label: 'Confirmado' },
                  { id: 'em_expedicao', label: 'Entrega' },
                  { id: 'concluido', label: 'Concluído' },
                  { id: 'cancelado', label: 'Cancelado' }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setStatusFiltro(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                      statusFiltro === f.id
                        ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* TABELA DE ALTA DENSIDADE (ESTILO KYTE WEB) */}
        <div className="flex-1 overflow-auto bg-slate-950">
          {carregando ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium">Carregando pedidos...</p>
            </div>
          ) : pedidosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-2">
              <FileText className="w-10 h-10 text-slate-600 mb-1" />
              <p className="text-sm font-semibold text-slate-300">Nenhum pedido encontrado</p>
              <p className="text-xs text-slate-500">Tente ajustar a busca ou os filtros selecionados.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Código</th>
                  <th
                    className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-200 transition"
                    onClick={() => toggleOrdenacao('data')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Data</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4 font-semibold">Cliente</th>
                  <th className="py-3 px-4 font-semibold">Vendedor</th>
                  <th className="py-3 px-4 font-semibold">Itens</th>
                  <th
                    className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-200 transition"
                    onClick={() => toggleOrdenacao('valor')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Valor</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-center">Tipo</th>
                  <th className="py-3 px-4 font-semibold">Obs.</th>
                  <th className="py-3 px-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {pedidosFiltrados.map((pedido) => {
                  const isCancelado = pedido.status === 'cancelado';
                  const totalItens = calcularTotalItens(pedido);
                  const isCatalogo = pedido.origem === 'catalogo_online';
                  const isSelecionado = pedidoSelecionado?.id === pedido.id;

                  return (
                    <tr
                      key={pedido.id}
                      onClick={() => setPedidoSelecionado(pedido)}
                      className={`cursor-pointer transition group hover:bg-slate-900/80 ${
                        isSelecionado ? 'bg-slate-900/90 ring-1 ring-inset ring-emerald-500/40' : ''
                      } ${isCancelado ? 'opacity-60' : ''}`}
                    >
                      {/* Código */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
                          <span className={`font-bold ${isCancelado ? 'line-through text-slate-400' : 'text-slate-200'}`}>
                            #{isCatalogo ? `c-${pedido.numero_pedido}` : pedido.numero_pedido}
                          </span>
                        </div>
                      </td>

                      {/* Data */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-300">
                        <span className={isCancelado ? 'line-through' : ''}>
                          {formatarData(pedido.data_venda || pedido.criado_em || '')}
                        </span>
                      </td>

                      {/* Cliente */}
                      <td className="py-3.5 px-4 max-w-[200px] truncate text-slate-200 font-medium">
                        {pedido.cliente?.nome ? (
                          <span className={isCancelado ? 'line-through' : ''}>
                            {pedido.cliente.nome}
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      {/* Vendedor / Canal */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-300">
                        {isCatalogo ? (
                          <div className="flex items-center gap-1.5 text-indigo-400 font-medium">
                            <Store className="w-3.5 h-3.5" />
                            <span>Catalog</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            <span>{pedido.vendedor?.nome_completo || 'Vendedor'}</span>
                          </div>
                        )}
                      </td>

                      {/* Itens */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-emerald-400 font-medium">
                          {totalItens} {totalItens === 1 ? 'item' : 'itens'}
                        </span>
                      </td>

                      {/* Valor */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span
                            className={`font-bold ${
                              isCancelado
                                ? 'line-through text-slate-400'
                                : 'text-slate-100'
                            }`}
                          >
                            R$ {Number(pedido.valor_total).toFixed(2)}
                          </span>
                          {Number(pedido.saldo_devedor) > 0 && !isCancelado && (
                            <span className="text-[10px] text-amber-400 font-semibold">
                              Fiado: R$ {Number(pedido.saldo_devedor).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getStatusBadge(pedido.status)}
                      </td>

                      {/* Tipo / Entrega */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {pedido.endereco_entrega || Number(pedido.valor_frete) > 0 ? (
                          <span title="Entrega / Delivery" className="inline-flex p-1 rounded-md bg-purple-500/10 text-purple-400">
                            <Truck className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span title="Retirada / Balcão" className="inline-flex p-1 rounded-md bg-slate-800 text-slate-400">
                            <ShoppingBag className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </td>

                      {/* Observações */}
                      <td className="py-3.5 px-4 max-w-[140px] truncate text-slate-500">
                        {pedido.observacoes ? pedido.observacoes : '-'}
                      </td>

                      {/* Seta de Detalhe */}
                      <td className="py-3.5 px-3 text-right">
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* DRAWER LATERAL DE DETALHES DO PEDIDO */}
      {pedidoSelecionado && (
        <div className="w-full lg:w-[450px] bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col h-full overflow-hidden shadow-2xl z-20 animate-in slide-in-from-right duration-200">
          {/* Topo do Drawer */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-100 text-lg">
                  Pedido #{pedidoSelecionado.origem === 'catalogo_online' ? `c-${pedidoSelecionado.numero_pedido}` : pedidoSelecionado.numero_pedido}
                </h3>
                {getStatusBadge(pedidoSelecionado.status)}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {formatarData(pedidoSelecionado.data_venda || pedidoSelecionado.criado_em || '')}
              </p>
            </div>
            <button
              onClick={() => setPedidoSelecionado(null)}
              className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Conteúdo do Drawer com Rolagem */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Atualizador Rápido de Status */}
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 space-y-2">
              <label className="text-xs font-semibold text-slate-400 block">Alterar Status do Pedido:</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['pendente', 'confirmado', 'em_producao', 'em_expedicao', 'concluido', 'cancelado'] as StatusPedido[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => atualizarStatus(pedidoSelecionado.id, st)}
                    className={`py-2 px-2 rounded-xl text-[11px] font-bold capitalize transition border ${
                      pedidoSelecionado.status === st
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {st === 'em_producao' ? 'Produção' : st === 'em_expedicao' ? 'Entrega' : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Informações do Cliente */}
            {pedidoSelecionado.cliente ? (
              <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 text-xs space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-400" /> Dados do Cliente
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Tabela: {pedidoSelecionado.tabela_preco_aplicada || 'Varejo'}
                  </span>
                </div>
                <p className="text-slate-200 font-semibold text-sm">{pedidoSelecionado.cliente.nome}</p>
                {pedidoSelecionado.cliente.whatsapp && (
                  <p className="text-slate-300 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    {pedidoSelecionado.cliente.whatsapp}
                  </p>
                )}
                {pedidoSelecionado.endereco_entrega && (
                  <p className="text-slate-400 flex items-start gap-1.5 pt-1">
                    <Truck className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                    <span>{pedidoSelecionado.endereco_entrega}</span>
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-slate-950/40 p-3.5 rounded-2xl border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-500" />
                <span>Cliente Avulso (Venda Balcão)</span>
              </div>
            )}

            {/* Itens do Pedido */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">
                  Itens do Pedido ({pedidoSelecionado.itens?.length || 0})
                </span>
                <span className="text-[11px] text-emerald-400 font-medium">
                  {calcularTotalItens(pedidoSelecionado)} unidades
                </span>
              </div>

              <div className="space-y-1.5">
                {pedidoSelecionado.itens?.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <span className="font-semibold text-slate-200 block">
                        {Number(item.quantidade)}x {item.nome_produto}
                      </span>
                      {item.rotulo_variacao && (
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                          {item.rotulo_variacao}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500 block">
                        Unitário: R$ {Number(item.preco_venda_unitario).toFixed(2)}
                      </span>
                    </div>
                    <span className="font-bold text-slate-100 text-sm">
                      R$ {Number(item.subtotal).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Observações */}
            {pedidoSelecionado.observacoes && (
              <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800 text-xs space-y-1">
                <span className="font-bold text-slate-400 block text-[11px]">Observações:</span>
                <p className="text-slate-300">{pedidoSelecionado.observacoes}</p>
              </div>
            )}

            {/* Resumo Financeiro */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal:</span>
                <span className="font-mono">R$ {Number(pedidoSelecionado.subtotal).toFixed(2)}</span>
              </div>
              {Number(pedidoSelecionado.valor_frete) > 0 && (
                <div className="flex justify-between text-purple-400">
                  <span>Taxa de Entrega:</span>
                  <span className="font-mono">+ R$ {Number(pedidoSelecionado.valor_frete).toFixed(2)}</span>
                </div>
              )}
              {Number(pedidoSelecionado.valor_desconto) > 0 && (
                <div className="flex justify-between text-rose-400">
                  <span>Desconto:</span>
                  <span className="font-mono">- R$ {Number(pedidoSelecionado.valor_desconto).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-emerald-400 font-bold text-base pt-2 border-t border-slate-800">
                <span>VALOR TOTAL:</span>
                <span className="font-mono">R$ {Number(pedidoSelecionado.valor_total).toFixed(2)}</span>
              </div>

              {Number(pedidoSelecionado.saldo_devedor) > 0 && (
                <div className="flex justify-between text-amber-400 font-semibold pt-1">
                  <span>Saldo Devedor (Fiado):</span>
                  <span className="font-mono">R$ {Number(pedidoSelecionado.saldo_devedor).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Botões de Ação do Drawer */}
          <div className="p-4 border-t border-slate-800 bg-slate-900 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  if (loja) PrintService.printBluetoothThermal(pedidoSelecionado, loja, '58mm');
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Térmica 58/80mm</span>
              </button>

              <button
                onClick={() => PrintService.printWindow()}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition"
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
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition"
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

