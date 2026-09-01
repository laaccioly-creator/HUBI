import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  Plus,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  User,
  Share2,
  MoreVertical,
  X,
  Check,
  CheckCircle2,
  XCircle,
  MessageCircle,
  Receipt,
  Edit2,
  Trash2,
  Calendar,
  AlertTriangle,
  Store,
  ArrowRight,
  ArrowLeft,
  Tag,
  Mic,
  ShoppingCart,
  ShoppingBag,
  Package,
  Users,
  BarChart3,
  Ticket,
  Globe,
  UserCheck,
  UserCheck2,
  Settings,
  LogOut
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { Pedido, StatusPedido, StatusPagamento, Cliente, UsuarioLoja } from '../types';
import { PrintService, formatarDataRecibo, obterDadosPagamentoRecibo } from '../services/printService';
import { ClientePerfilMobile } from './ClientePerfilMobile';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';

interface PedidosListaMobileProps {
  pedidos: Pedido[];
  clientes: Cliente[];
  usuarios: UsuarioLoja[];
  carregando: boolean;
  onAlterarStatus: (pedidoId: string, novoStatus: StatusPedido) => void;
  onCancelarPedido: (pedido: Pedido) => void;
  onAbrirReceberPagamento: (pedido: Pedido) => void;
  onAbrirDrawerMenu: () => void;
  onClienteAtualizado: (cliente: Cliente) => void;
  onRecarregar?: () => void;
}

export const PedidosListaMobile: React.FC<PedidosListaMobileProps> = ({
  pedidos,
  clientes,
  usuarios,
  carregando,
  onAlterarStatus,
  onCancelarPedido,
  onAbrirReceberPagamento,
  onAbrirDrawerMenu,
  onClienteAtualizado,
  onRecarregar
}) => {
  const navigate = useNavigate();
  const { loja, usuario } = useAuth();
  const { carregarPedidoParaEdicao } = useCart();

  // Estados de Navegação de Telas
  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(null);
  const [clientePerfilSelecionado, setClientePerfilSelecionado] = useState<Cliente | null>(null);
  const [drawerInternoAberto, setDrawerInternoAberto] = useState<boolean>(false);

  // Estados de Busca e Filtros Rápidos (TELA001, TELA003, TELA004)
  const [busca, setBusca] = useState<string>('');
  const [ouvindoVoz, setOuvindoVoz] = useState<boolean>(false);
  const [modalStatusAberto, setModalStatusAberto] = useState<boolean>(false);
  const [statusSelecionados, setStatusSelecionados] = useState<string[]>(['todos']);

  const alternarVoz = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Pesquisa por voz não suportada pelo navegador.');
      return;
    }
    if (ouvindoVoz) {
      setOuvindoVoz(false);
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onstart = () => setOuvindoVoz(true);
      recognition.onresult = (e: any) => {
        const t = e.results?.[0]?.[0]?.transcript;
        if (t) setBusca(t);
      };
      recognition.onerror = () => setOuvindoVoz(false);
      recognition.onend = () => setOuvindoVoz(false);
      recognition.start();
    } catch (err) {
      setOuvindoVoz(false);
    }
  };
  
  const [modalVendedoresAberto, setModalVendedoresAberto] = useState<boolean>(false);
  const [vendedoresSelecionados, setVendedoresSelecionados] = useState<string[]>(['todos']);

  // Estados do Modal de Filtros Avançados (TELA002)
  const [modalFiltrosAvancados, setModalFiltrosAvancados] = useState<boolean>(false);
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');
  const [meiosPagamentoFiltro, setMeiosPagamentoFiltro] = useState<string[]>([]);

  // Estados da Tela de Detalhes do Pedido (TELA005 a TELA009)
  const [abaDetalhe, setAbaDetalhe] = useState<'itens' | 'detalhes' | 'cliente'>('itens');
  const [modalAlterarStatus, setModalAlterarStatus] = useState<boolean>(false);
  const [modalOpcoesPedido, setModalOpcoesPedido] = useState<boolean>(false);
  const [modalAlterarVendedor, setModalAlterarVendedor] = useState<boolean>(false);
  const [salvandoVendedor, setSalvandoVendedor] = useState<boolean>(false);

  // Mapa de Clientes e Usuários para exibição rápida
  const mapaClientes = useMemo(() => {
    const map = new Map<string, Cliente>();
    clientes.forEach(c => map.set(c.id, c));
    return map;
  }, [clientes]);

  const mapaUsuarios = useMemo(() => {
    const map = new Map<string, string>();
    usuarios.forEach(u => map.set(u.id, u.nome_completo));
    return map;
  }, [usuarios]);

  const handleTrocarVendedorPedido = async (novoVendedorId: string | null) => {
    if (!pedidoSelecionado) return;
    try {
      setSalvandoVendedor(true);
      const payload: any = {
        vendedor_id: novoVendedorId
      };
      if (novoVendedorId === null) {
        payload.origem = 'catalogo_online';
      }

      const { error } = await supabase
        .from('pedidos')
        .update(payload)
        .eq('id', pedidoSelecionado.id);

      if (error) throw error;

      setPedidoSelecionado(prev => prev ? ({
        ...prev,
        vendedor_id: novoVendedorId || undefined,
        origem: novoVendedorId === null ? 'catalogo_online' : prev.origem
      }) : null);
      setModalAlterarVendedor(false);
      if (onRecarregar) await onRecarregar();
    } catch (err) {
      console.error('Erro ao alterar vendedor do pedido:', err);
      alert('Erro ao alterar vendedor do pedido.');
    } finally {
      setSalvandoVendedor(false);
    }
  };

  // Filtros aplicados
  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter(p => {
      // 1. Busca por texto (código, cliente, item)
      if (busca.trim()) {
        const t = busca.toLowerCase().trim();
        const numStr = String(p.numero_pedido);
        const cli = p.cliente_id ? mapaClientes.get(p.cliente_id) : null;
        const cliNome = cli?.nome.toLowerCase() || '';
        const itensList = p.itens || p.itens_pedido || [];
        const temItem = itensList.some((i: any) => i.nome_produto?.toLowerCase().includes(t));
        if (!numStr.includes(t) && !cliNome.includes(t) && !temItem) return false;
      }

      // 2. Filtro de Status
      if (!statusSelecionados.includes('todos')) {
        if (!statusSelecionados.includes(p.status)) return false;
      }

      // 3. Filtro de Vendedores
      if (!vendedoresSelecionados.includes('todos')) {
        if (p.origem === 'catalogo_online' && !vendedoresSelecionados.includes('catalogo_online')) return false;
        if (p.vendedor_id && !vendedoresSelecionados.includes(p.vendedor_id)) return false;
      }

      // 4. Filtro de Período (TELA002)
      if (dataInicio) {
        const dPed = new Date(p.data_venda);
        const dIni = new Date(dataInicio);
        if (dPed < dIni) return false;
      }
      if (dataFim) {
        const dPed = new Date(p.data_venda);
        const dFim = new Date(dataFim);
        dFim.setHours(23, 59, 59, 999);
        if (dPed > dFim) return false;
      }

      return true;
    });
  }, [pedidos, busca, statusSelecionados, vendedoresSelecionados, dataInicio, dataFim, mapaClientes]);

  // Agrupamento por Data (ex: Hoje, Ontem, Sexta-feira 21 de Agosto...)
  const gruposPorData = useMemo(() => {
    const grupos: { [dataLabel: string]: { label: string; pedidos: Pedido[]; totalValor: number } } = {};

    pedidosFiltrados.forEach(p => {
      const d = new Date(p.data_venda);
      const hoje = new Date();
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);

      let label = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      label = label.charAt(0).toUpperCase() + label.slice(1);

      if (d.toDateString() === hoje.toDateString()) {
        label = 'Hoje';
      } else if (d.toDateString() === ontem.toDateString()) {
        label = 'Ontem';
      }

      if (!grupos[label]) {
        grupos[label] = { label, pedidos: [], totalValor: 0 };
      }
      grupos[label].pedidos.push(p);
      grupos[label].totalValor += Number(p.valor_total || 0);
    });

    return Object.values(grupos);
  }, [pedidosFiltrados]);

  // Totais Acumulados no Rodapé
  const totalGeralPedidos = useMemo(() => {
    return pedidosFiltrados.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
  }, [pedidosFiltrados]);

  // Preset de datas na TELA002
  const aplicarPresetPeriodo = (preset: string) => {
    const hoje = new Date();
    const formatarDataInput = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'hoje') {
      setDataInicio(formatarDataInput(hoje));
      setDataFim(formatarDataInput(hoje));
    } else if (preset === 'ontem') {
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);
      setDataInicio(formatarDataInput(ontem));
      setDataFim(formatarDataInput(ontem));
    } else if (preset === 'esta_semana') {
      const inicio = new Date();
      inicio.setDate(inicio.getDate() - inicio.getDay());
      setDataInicio(formatarDataInput(inicio));
      setDataFim(formatarDataInput(hoje));
    } else if (preset === 'este_mes') {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      setDataInicio(formatarDataInput(inicio));
      setDataFim(formatarDataInput(hoje));
    } else if (preset === 'ultimos_30_dias') {
      const inicio = new Date();
      inicio.setDate(inicio.getDate() - 30);
      setDataInicio(formatarDataInput(inicio));
      setDataFim(formatarDataInput(hoje));
    }
  };

  // Se o usuário estiver vendo o perfil do cliente selecionado (TELA10 a TELA14)
  if (clientePerfilSelecionado) {
    return (
      <ClientePerfilMobile
        cliente={clientePerfilSelecionado}
        onVoltar={() => setClientePerfilSelecionado(null)}
        onClienteAtualizado={(c) => {
          setClientePerfilSelecionado(c);
          onClienteAtualizado(c);
        }}
      />
    );
  }

  // =========================================================================
  // TELA 005 a TELA 009: DETALHES DO PEDIDO MOBILE
  // =========================================================================
  if (pedidoSelecionado) {
    const cli = pedidoSelecionado.cliente_id ? mapaClientes.get(pedidoSelecionado.cliente_id) : null;
    const nomeVendedor = pedidoSelecionado.origem === 'catalogo_online'
      ? 'Catálogo Online'
      : (pedidoSelecionado.vendedor_id ? mapaUsuarios.get(pedidoSelecionado.vendedor_id) : 'Operador');

    const itensPedido = pedidoSelecionado.itens || pedidoSelecionado.itens_pedido || [];

    const totalCustoEstimado = itensPedido.reduce((acc: number, item: any) => {
      return acc + (Number(item.preco_custo_unitario || 0) * Number(item.quantidade || 1));
    }, 0);

    const lucroEstimado = Math.max(0, Number(pedidoSelecionado.valor_total || 0) - totalCustoEstimado);

    return (
      <div className="fixed inset-0 z-50 bg-white text-slate-900 flex flex-col justify-between animate-in slide-in-from-right duration-150 select-none">
        {/* Top Header */}
        <div className="h-14 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2 max-w-[260px]">
            <button
              type="button"
              onClick={() => setPedidoSelecionado(null)}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="text-xs font-bold text-slate-800 truncate">
              {new Date(pedidoSelecionado.data_venda).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cli && (
              <button
                type="button"
                onClick={() => setClientePerfilSelecionado(cli)}
                className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold uppercase truncate max-w-[100px] flex items-center gap-1"
              >
                <span className="truncate">{cli.nome}</span>
                <User className="w-3 h-3 text-slate-400 shrink-0" />
              </button>
            )}

            <button
              type="button"
              onClick={() => PrintService.printReceipt(pedidoSelecionado, loja)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900"
              title="Compartilhar"
            >
              <Share2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Resumo Superior do Pedido */}
        <div className="p-4 border-b border-slate-100 space-y-2.5 bg-white shrink-0">
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              R$ {Number(pedidoSelecionado.valor_total).toFixed(2)}
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold text-slate-400 block">#{pedidoSelecionado.numero_pedido}</span>
              <span className="text-[10px] text-slate-500 block">{nomeVendedor}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Pílula de Status (Abre TELA006) */}
            <button
              type="button"
              onClick={() => setModalAlterarStatus(true)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center gap-1.5 text-xs font-bold capitalize text-slate-700 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-emerald-500" />
              <span>{pedidoSelecionado.status.replace(/_/g, ' ')}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Pílula de Pagamento Real */}
            {(() => {
              const pagInfo = obterDadosPagamentoRecibo(pedidoSelecionado);
              const ehPago = pagInfo.foiPago;
              const nomeForma = pagInfo.pagamentosDetalhados?.[0]?.forma;
              return (
                <div
                  className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold ${
                    ehPago
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }`}
                >
                  <DollarSign className={`w-3.5 h-3.5 ${ehPago ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <span>
                    {ehPago ? 'Pago' : 'Aguardando Pagamento'}
                    {nomeForma ? ` (${nomeForma})` : ''}
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Adicionar observação */}
          <button
            type="button"
            onClick={() => {
              const obs = prompt('Adicionar observação ao pedido:', pedidoSelecionado.observacoes || '');
              if (obs !== null) {
                supabase.from('pedidos').update({ observacoes: obs }).eq('id', pedidoSelecionado.id);
                setPedidoSelecionado({ ...pedidoSelecionado, observacoes: obs });
              }
            }}
            className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1 pt-1"
          >
            <span>+ {pedidoSelecionado.observacoes ? 'Editar observação' : 'Adicionar observação'}</span>
          </button>
        </div>

        {/* Abas: ITENS | DETALHES (TELA007) | CLIENTE (TELA008) */}
        <div className="px-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0 text-xs font-bold uppercase tracking-wider text-slate-400">
          <button
            type="button"
            onClick={() => setAbaDetalhe('itens')}
            className={`py-3 border-b-2 transition flex-1 text-center cursor-pointer ${
              abaDetalhe === 'itens' ? 'border-emerald-500 text-emerald-600' : 'border-transparent hover:text-slate-700'
            }`}
          >
            ITENS
          </button>
          <button
            type="button"
            onClick={() => setAbaDetalhe('detalhes')}
            className={`py-3 border-b-2 transition flex-1 text-center cursor-pointer ${
              abaDetalhe === 'detalhes' ? 'border-emerald-500 text-emerald-600' : 'border-transparent hover:text-slate-700'
            }`}
          >
            DETALHES
          </button>
          <button
            type="button"
            onClick={() => setAbaDetalhe('cliente')}
            className={`py-3 border-b-2 transition flex-1 text-center cursor-pointer ${
              abaDetalhe === 'cliente' ? 'border-emerald-500 text-emerald-600' : 'border-transparent hover:text-slate-700'
            }`}
          >
            CLIENTE
          </button>
        </div>

        {/* Conteúdo da Aba */}
        <div className="flex-1 overflow-y-auto p-4">
          {abaDetalhe === 'itens' && (
            <div className="space-y-3 divide-y divide-slate-100">
              {itensPedido.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs font-medium">
                  Nenhum item encontrado neste pedido.
                </div>
              ) : (
                itensPedido.map((item: any, idx: number) => (
                  <div key={item.id || idx} className="pt-2 first:pt-0 flex items-center justify-between">
                    <div className="space-y-0.5 max-w-[220px]">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-700 text-xs">{item.quantidade} x</span>
                        <span className="font-bold text-xs uppercase text-slate-800 truncate">{item.nome_produto}</span>
                      </div>
                      {item.rotulo_variacao && (
                        <span className="text-[10px] text-slate-400 block">Var: {item.rotulo_variacao}</span>
                      )}
                    </div>
                    <span className="font-black text-xs text-slate-900">
                      R$ {Number(item.subtotal || (Number(item.preco_venda_unitario || 0) * Number(item.quantidade || 1))).toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TELA007: DETALHES */}
          {abaDetalhe === 'detalhes' && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-700 capitalize">{pedidoSelecionado.status.replace(/_/g, ' ')}</span>
                  <Clock className="w-4 h-4 text-emerald-500" />
                </div>
                <span className="text-[11px] text-slate-400 block">
                  {new Date(pedidoSelecionado.data_venda).toLocaleString('pt-BR')}
                </span>
              </div>

              <div className="space-y-2 pt-2 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal:</span>
                  <span>R$ {Number(pedidoSelecionado.subtotal || pedidoSelecionado.valor_total).toFixed(2)}</span>
                </div>

                {Number(pedidoSelecionado.valor_desconto || 0) > 0 && (
                  <div className="flex justify-between text-rose-500 font-bold">
                    <span>Desconto:</span>
                    <span>- R$ {Number(pedidoSelecionado.valor_desconto).toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200">
                  <span>Total:</span>
                  <span>R$ {Number(pedidoSelecionado.valor_total).toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-xs font-bold text-emerald-600 pt-1">
                  <span>Lucro estimado:</span>
                  <span>R$ {lucroEstimado.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* TELA008: CLIENTE */}
          {abaDetalhe === 'cliente' && (
            <div className="space-y-4 text-center py-6">
              {cli ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2">
                    <User className="w-5 h-5 text-slate-400" />
                    <h3 className="font-black text-sm uppercase text-slate-800">{cli.nome}</h3>
                  </div>

                  {cli.whatsapp && (
                    <a
                      href={`https://wa.me/55${cli.whatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs shadow-xs transition"
                    >
                      <MessageCircle className="w-4 h-4 fill-emerald-600 text-emerald-600" />
                      <span>Chamar no WhatsApp</span>
                    </a>
                  )}

                  <div className="pt-6">
                    <button
                      type="button"
                      onClick={() => setClientePerfilSelecionado(cli)}
                      className="text-xs font-bold text-emerald-600 hover:underline"
                    >
                      Ir ao perfil cliente
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 text-xs">Venda avulsa (Cliente não cadastrado).</div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé e Ações Inferiores (TELA005) */}
        <div className="p-3 border-t border-slate-200 bg-white space-y-2 shrink-0">
          <div className="text-[10px] text-slate-400 text-center">
            ATENÇÃO: Aproveite para editar o pedido antes de confirmá-lo.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModalOpcoesPedido(true)}
              className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-lg cursor-pointer"
            >
              ...
            </button>

            {pedidoSelecionado.status === 'pendente' ? (
              <button
                type="button"
                onClick={() => {
                  onAlterarStatus(pedidoSelecionado.id, 'confirmado');
                  setPedidoSelecionado({ ...pedidoSelecionado, status: 'confirmado' });
                }}
                className="flex-1 h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Confirmar Pedido</span>
              </button>
            ) : pedidoSelecionado.status !== 'concluido' && pedidoSelecionado.status !== 'cancelado' ? (
              <button
                type="button"
                onClick={() => {
                  if (pedidoSelecionado.status_pagamento === 'pago') {
                    onAlterarStatus(pedidoSelecionado.id, 'concluido');
                    setPedidoSelecionado({ ...pedidoSelecionado, status: 'concluido' });
                  } else {
                    onAbrirReceberPagamento(pedidoSelecionado);
                  }
                }}
                className="flex-1 h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
              >
                {pedidoSelecionado.status_pagamento === 'pago' ? 'Concluir Pedido' : 'Receber e Concluir'}
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex-1 h-12 rounded-2xl bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center">
                Pedido {pedidoSelecionado.status}
              </div>
            )}
          </div>
        </div>

        {/* TELA006: MODAL ALTERAR STATUS (BOTTOM SHEET) */}
        {modalAlterarStatus && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
            <div className="bg-white rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="font-bold text-sm text-slate-800">Selecione um status</h3>
                <button onClick={() => setModalAlterarStatus(false)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[11px] text-slate-400">
                Seus clientes serão notificados sempre que o status de um pedido for alterado.
              </p>

              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {[
                  { id: 'pendente', label: 'Pendente' },
                  { id: 'confirmado', label: 'Confirmado' },
                  { id: 'em_producao', label: 'Em Produção' },
                  { id: 'em_expedicao', label: 'Em Expedição' },
                  { id: 'saiu_para_entrega', label: 'Saiu Para Entrega' },
                  { id: 'pronto_para_retirar', label: 'Pronto Para Retirar' },
                  { id: 'concluido', label: 'Concluído' },
                  { id: 'cancelado', label: 'Cancelado' }
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      onAlterarStatus(pedidoSelecionado.id, st.id as StatusPedido);
                      setPedidoSelecionado({ ...pedidoSelecionado, status: st.id as StatusPedido });
                      setModalAlterarStatus(false);
                    }}
                    className={`w-full p-3 rounded-2xl flex items-center justify-between text-xs font-bold transition cursor-pointer ${
                      pedidoSelecionado.status === st.id
                        ? 'border-2 border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <span>{st.label}</span>
                    {pedidoSelecionado.status === st.id && <Check className="w-4 h-4 text-emerald-600" />}
                  </button>
                ))}
              </div>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setModalAlterarStatus(false);
                    navigate('/config');
                  }}
                  className="text-xs font-bold text-emerald-600 hover:underline"
                >
                  Gerenciar meus status
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TELA009: MODAL OPÇÕES DO PEDIDO (...) */}
        {modalOpcoesPedido && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
            <div className="bg-white rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="font-bold text-sm text-slate-800">Opções do pedido</h3>
                <button onClick={() => setModalOpcoesPedido(false)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setModalOpcoesPedido(false);
                  PrintService.printReceipt(pedidoSelecionado, loja);
                }}
                className="w-full p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-2 transition text-left"
              >
                <Share2 className="w-4 h-4 text-slate-500" />
                <span>Compartilhar recibo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalOpcoesPedido(false);
                  setModalAlterarVendedor(true);
                }}
                className="w-full p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-2 transition text-left"
              >
                <UserCheck2 className="w-4 h-4 text-slate-500" />
                <span>Alterar vendedor</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalOpcoesPedido(false);
                  carregarPedidoParaEdicao(pedidoSelecionado);
                  navigate('/pos');
                }}
                className="w-full p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-2 transition text-left"
              >
                <Edit2 className="w-4 h-4 text-slate-500" />
                <span>Editar pedido</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalOpcoesPedido(false);
                  onCancelarPedido(pedidoSelecionado);
                  setPedidoSelecionado(null);
                }}
                className="w-full p-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold flex items-center gap-2 transition text-left"
              >
                <Trash2 className="w-4 h-4" />
                <span>Cancelar pedido</span>
              </button>
            </div>
          </div>
        )}

        {/* MODAL ALTERAR VENDEDOR DO PEDIDO */}
        {modalAlterarVendedor && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center animate-in fade-in">
            <div className="bg-white rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom text-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <UserCheck2 className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-bold text-sm text-slate-800">Alterar Vendedor do Pedido</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setModalAlterarVendedor(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Selecione o vendedor responsável por este pedido #{pedidoSelecionado?.numero_pedido}:
              </p>

              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {/* Opção Catálogo Online */}
                <button
                  type="button"
                  disabled={salvandoVendedor}
                  onClick={() => handleTrocarVendedorPedido(null)}
                  className={`w-full p-3 rounded-2xl border text-left transition flex items-center justify-between ${
                    pedidoSelecionado?.origem === 'catalogo_online' || !pedidoSelecionado?.vendedor_id
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Globe className="w-4 h-4 text-slate-500" />
                    <div>
                      <span className="font-bold text-xs block">Catálogo Online</span>
                      <span className="text-[10px] text-slate-400">Venda originada do catálogo web</span>
                    </div>
                  </div>
                  {(pedidoSelecionado?.origem === 'catalogo_online' || !pedidoSelecionado?.vendedor_id) && (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                </button>

                {/* Vendedores da Loja */}
                {usuarios.map(usr => {
                  const ehAtual = pedidoSelecionado?.vendedor_id === usr.id;
                  return (
                    <button
                      key={usr.id}
                      type="button"
                      disabled={salvandoVendedor}
                      onClick={() => handleTrocarVendedorPedido(usr.id)}
                      className={`w-full p-3 rounded-2xl border text-left transition flex items-center justify-between ${
                        ehAtual
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <User className="w-4 h-4 text-slate-500" />
                        <div>
                          <span className="font-bold text-xs block">{usr.nome_completo}</span>
                          <span className="text-[10px] text-slate-400 capitalize">{usr.perfil || 'Vendedor'}</span>
                        </div>
                      </div>
                      {ehAtual && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // TELA 001: LISTA PRINCIPAL DE PEDIDOS MOBILE
  // =========================================================================
  return (
    <div className="flex flex-col h-full bg-white text-slate-900 overflow-hidden select-none">
      {/* 1. Header Superior Mobile (TELA001) */}
      <div className="h-14 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
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
            onClick={() => {
              if (onAbrirDrawerMenu) onAbrirDrawerMenu();
              setDrawerInternoAberto(true);
            }}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition cursor-pointer"
            title="Menu Principal"
          >
            <div className="space-y-1">
              <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
              <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
              <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
            </div>
          </button>
          <h1 className="font-black text-base text-slate-800 tracking-tight">
            Pedidos ({pedidosFiltrados.length})
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Botão de Filtros Avançados ▽ (TELA002) */}
          <button
            type="button"
            onClick={() => setModalFiltrosAvancados(true)}
            className="p-2 text-slate-600 hover:text-slate-900 transition"
            title="Filtros"
          >
            <Filter className="w-5 h-5" />
          </button>

          {/* Botão Nova Venda + */}
          <button
            type="button"
            onClick={() => navigate('/pos')}
            className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white flex items-center justify-center font-bold shadow-sm transition active:scale-95 cursor-pointer"
            title="Nova Venda"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* 2. Barra de Busca */}
      <div className="px-4 py-2 border-b border-slate-100 bg-white shrink-0">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Item, cliente ou código"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 font-medium"
          />
          <button
            type="button"
            onClick={alternarVoz}
            className={`absolute right-2.5 p-1.5 rounded-lg transition ${
              ouvindoVoz ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-400 hover:text-slate-700'
            }`}
            title="Pesquisar por voz"
          >
            <Mic className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3. Pílulas de Filtros Rápidos (TELA003 & TELA004) */}
      <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center gap-3 shrink-0 text-xs">
        {/* Status Dropdown Pill (TELA003) */}
        <button
          type="button"
          onClick={() => setModalStatusAberto(true)}
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 font-bold"
        >
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{statusSelecionados.includes('todos') ? 'Todos os status' : `${statusSelecionados.length} status`}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {/* Vendedores Dropdown Pill (TELA004) */}
        <button
          type="button"
          onClick={() => setModalVendedoresAberto(true)}
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 font-bold"
        >
          <User className="w-3.5 h-3.5 text-slate-400" />
          <span>{vendedoresSelecionados.includes('todos') ? 'Vendedores' : `${vendedoresSelecionados.length} vendedor(es)`}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* 4. Lista Agrupada de Pedidos por Data */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {carregando ? (
          <div className="text-center py-16 text-xs text-slate-400">Carregando pedidos...</div>
        ) : gruposPorData.length === 0 ? (
          <div className="text-center py-16 text-xs text-slate-400">Nenhum pedido encontrado.</div>
        ) : (
          gruposPorData.map((grupo) => (
            <div key={grupo.label} className="space-y-2">
              {/* Header do Grupo de Data */}
              <div className="px-1">
                <h3 className="font-bold text-xs text-slate-800">{grupo.label}</h3>
                <span className="text-[10px] text-slate-400">
                  {grupo.pedidos.length} {grupo.pedidos.length === 1 ? 'pedido' : 'pedidos'}, R$ {grupo.totalValor.toFixed(2)}
                </span>
              </div>

              {/* Cards de Pedido */}
              <div className="space-y-1.5">
                {grupo.pedidos.map((ped) => {
                  const cli = ped.cliente_id ? mapaClientes.get(ped.cliente_id) : null;
                  const vendedor = ped.origem === 'catalogo_online' ? 'Catálogo Online' : (ped.vendedor_id ? mapaUsuarios.get(ped.vendedor_id) : 'Operador');
                  const cancelado = ped.status === 'cancelado';

                  return (
                    <div
                      key={ped.id}
                      onClick={() => setPedidoSelecionado(ped)}
                      className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer space-y-1 shadow-xs"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          {cancelado ? (
                            <XCircle className="w-3.5 h-3.5 text-rose-500" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          <span className={`font-black ${cancelado ? 'line-through text-rose-500' : 'text-slate-900'}`}>
                            R$ {Number(ped.valor_total).toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">por {vendedor}</span>
                        </div>

                        <span className="text-[10px] text-slate-400 font-medium">
                          {new Date(ped.data_venda).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span className="truncate max-w-[230px]">
                          {(() => {
                            const its = ped.itens || ped.itens_pedido || [];
                            return `${its.length} itens: ${its.map((i: any) => `${i.quantidade}x ${i.nome_produto}`).join(', ')}`;
                          })()}
                        </span>
                        <span className="text-slate-400 font-mono">#{ped.numero_pedido}</span>
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

      {/* 5. Barra Flutuante Inferior de Totais */}
      <div className="p-3 bg-slate-900 text-white flex items-center justify-between text-xs shrink-0 shadow-lg">
        <span className="text-slate-400 font-medium">Total em pedidos</span>
        <span className="font-black text-emerald-400 text-sm">
          R$ {totalGeralPedidos.toFixed(2)} em {pedidosFiltrados.length} pedidos
        </span>
      </div>

      {/* ================================================================= */}
      {/* TELA 002: MODAL FILTROS AVANÇADOS */}
      {/* ================================================================= */}
      {modalFiltrosAvancados && (
        <div className="fixed inset-0 z-50 bg-white text-slate-900 flex flex-col justify-between animate-in slide-in-from-right duration-150">
          <div className="h-14 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
            <h2 className="font-bold text-base text-slate-800">Filtros</h2>
            <button
              type="button"
              onClick={() => setModalFiltrosAvancados(false)}
              className="p-1 rounded-full text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Informe o período */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Calendar className="w-4 h-4 text-emerald-500" />
                <span>Informe o período</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Data inicial</label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full bg-slate-50 border-b border-slate-300 py-1.5 text-xs text-slate-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Data final</label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-full bg-slate-50 border-b border-slate-300 py-1.5 text-xs text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              {/* Grid de Presets */}
              <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => aplicarPresetPeriodo('ultimos_30_dias')}
                  className="col-span-2 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 font-bold"
                >
                  Últimos 30 dias
                </button>

                {['hoje', 'ontem', 'esta_semana', 'este_mes'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => aplicarPresetPeriodo(p)}
                    className="py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 capitalize font-medium text-slate-700"
                  >
                    {p.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Meios de Pagamento */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-700">Meio de Pagamento</h4>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                {['Dinheiro', 'Cartão de Débito', 'Cartão de Crédito', 'Cheque', 'Voucher', 'Outros', 'Saldo Cliente', 'Venda Fiado', 'Pix'].map((mp) => (
                  <label key={mp} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={meiosPagamentoFiltro.includes(mp)}
                      onChange={(e) => {
                        if (e.target.checked) setMeiosPagamentoFiltro([...meiosPagamentoFiltro, mp]);
                        else setMeiosPagamentoFiltro(meiosPagamentoFiltro.filter(m => m !== mp));
                      }}
                      className="rounded text-emerald-500 focus:ring-emerald-400"
                    />
                    <span>{mp}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-slate-100 bg-white">
            <button
              type="button"
              onClick={() => setModalFiltrosAvancados(false)}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs uppercase tracking-wider shadow-md transition"
            >
              Aplicar filtro
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TELA 003: MODAL FILTRO DE STATUS (BOTTOM SHEET) */}
      {/* ================================================================= */}
      {modalStatusAberto && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
          <div className="bg-white rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-sm text-slate-800">Selecione um ou mais...</h3>
              <button onClick={() => setModalStatusAberto(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto text-xs text-slate-700">
              {[
                { id: 'todos', label: 'Todos os status' },
                { id: 'pendente', label: 'Pendente' },
                { id: 'confirmado', label: 'Confirmado' },
                { id: 'aguardando_pagamento', label: 'Aguardando pagamento' },
                { id: 'pago', label: 'Pago' },
                { id: 'em_producao', label: 'Em produção' },
                { id: 'em_expedicao', label: 'Em expedição' },
                { id: 'saiu_para_entrega', label: 'Saiu para entrega' },
                { id: 'concluido', label: 'Concluído' },
                { id: 'cancelado', label: 'Cancelado' }
              ].map((st) => (
                <label key={st.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={statusSelecionados.includes(st.id)}
                      onChange={(e) => {
                        if (st.id === 'todos') {
                          setStatusSelecionados(['todos']);
                        } else {
                          const filtrados = statusSelecionados.filter(s => s !== 'todos');
                          if (e.target.checked) setStatusSelecionados([...filtrados, st.id]);
                          else {
                            const rest = filtrados.filter(s => s !== st.id);
                            setStatusSelecionados(rest.length === 0 ? ['todos'] : rest);
                          }
                        }
                      }}
                      className="rounded text-emerald-500 focus:ring-emerald-400"
                    />
                    <span className="font-bold">{st.label}</span>
                  </div>
                  <Clock className="w-4 h-4 text-slate-400" />
                </label>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setModalStatusAberto(false)}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 text-white font-black text-xs uppercase shadow-md"
            >
              Filtrar
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TELA 004: MODAL FILTRO DE VENDEDORES (BOTTOM SHEET) */}
      {/* ================================================================= */}
      {modalVendedoresAberto && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
          <div className="bg-white rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-sm text-slate-800">Selecione um ou mais...</h3>
              <button onClick={() => setModalVendedoresAberto(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto text-xs text-slate-700">
              <label className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={vendedoresSelecionados.includes('todos')}
                    onChange={() => setVendedoresSelecionados(['todos'])}
                    className="rounded text-emerald-500"
                  />
                  <span className="font-bold">Todos os vendedores</span>
                </div>
                <User className="w-4 h-4 text-slate-400" />
              </label>

              <label className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={vendedoresSelecionados.includes('catalogo_online')}
                    onChange={(e) => {
                      const semTodos = vendedoresSelecionados.filter(v => v !== 'todos');
                      if (e.target.checked) setVendedoresSelecionados([...semTodos, 'catalogo_online']);
                      else {
                        const rest = semTodos.filter(v => v !== 'catalogo_online');
                        setVendedoresSelecionados(rest.length === 0 ? ['todos'] : rest);
                      }
                    }}
                    className="rounded text-emerald-500"
                  />
                  <span className="font-bold">Catálogo online</span>
                </div>
                <Store className="w-4 h-4 text-slate-400" />
              </label>

              {usuarios.map((usr) => (
                <label key={usr.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={vendedoresSelecionados.includes(usr.id)}
                      onChange={(e) => {
                        const semTodos = vendedoresSelecionados.filter(v => v !== 'todos');
                        if (e.target.checked) setVendedoresSelecionados([...semTodos, usr.id]);
                        else {
                          const rest = semTodos.filter(v => v !== usr.id);
                          setVendedoresSelecionados(rest.length === 0 ? ['todos'] : rest);
                        }
                      }}
                      className="rounded text-emerald-500"
                    />
                    <span className="font-bold">{usr.nome_completo}</span>
                  </div>
                  <User className="w-4 h-4 text-slate-400" />
                </label>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setModalVendedoresAberto(false)}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 text-white font-black text-xs uppercase shadow-md"
            >
              Filtrar
            </button>
          </div>
        </div>
      )}

      {/* DRAWER MENU UNIFICADO MOBILE */}
      <MobileMenuDrawer
        aberto={drawerInternoAberto}
        onFechar={() => setDrawerInternoAberto(false)}
        pedidosConfirmadosCount={pedidos.filter(p => p.status === 'confirmado').length}
      />
    </div>
  );
};
