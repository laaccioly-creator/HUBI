import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  X,
  FileText,
  User,
  ArrowUpDown,
  Volume2,
  VolumeX,
  Receipt,
  Check,
  Tag,
  Edit,
  CreditCard,
  ChevronDown,
  Lock,
  Copy,
  Info
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCart } from '../contexts/CartContext';
import { Pedido, StatusPedido, StatusPagamento, TabelaPreco, ItemPedido, Produto } from '../types';
import { PrintService } from '../services/printService';
import { audioService } from '../services/audioService';
import { ModalItensPedido } from './ModalItensPedido';
import { ModalDetalhesProduto } from './ModalDetalhesProduto';

type OrdenacaoCampo = 'data' | 'valor';
type OrdenacaoDirecao = 'asc' | 'desc';

const ABAS_STATUS: { id: string; label: string }[] = [
  { id: 'todos', label: 'Todos os status' },
  { id: 'pendente', label: 'Pendente' },
  { id: 'confirmado', label: 'Confirmado' },
  { id: 'em_separacao', label: 'Em separação' },
  { id: 'em_producao', label: 'Em produção' },
  { id: 'em_expedicao', label: 'Em expedição' },
  { id: 'saiu_para_entrega', label: 'Saiu para Entrega' },
  { id: 'pronto_para_retirar', label: 'Pronto para retirar' },
  { id: 'concluido', label: 'Concluído' },
  { id: 'cancelado', label: 'Cancelado' }
];

const STATUS_PEDIDO_OPCOES: { id: StatusPedido; label: string }[] = [
  { id: 'pendente', label: 'Pendente' },
  { id: 'confirmado', label: 'Confirmado' },
  { id: 'em_separacao', label: 'Em separação' },
  { id: 'em_producao', label: 'Em produção' },
  { id: 'em_expedicao', label: 'Em expedição' },
  { id: 'saiu_para_entrega', label: 'Saiu para Entrega' },
  { id: 'pronto_para_retirar', label: 'Pronto para retirar' },
  { id: 'concluido', label: 'Concluído' },
  { id: 'cancelado', label: 'Cancelado' }
];

const STATUS_PAGAMENTO_OPCOES: { id: StatusPagamento; label: string }[] = [
  { id: 'aguardando_pagamento', label: 'Aguardando pagamento' },
  { id: 'pago', label: 'Pago' },
  { id: 'parcialmente_pago', label: 'Parcialmente Pago' }
];

const TIPOS_VENDA_OPCOES: { id: TabelaPreco; label: string }[] = [
  { id: 'varejo', label: 'Varejo' },
  { id: 'atacado', label: 'Atacado' },
  { id: 'autoatacado', label: 'Distribuidor' }
];

export const PedidosLista: React.FC = () => {
  const { loja, usuario } = useAuth();
  const permissions = usePermissions();
  const { carregarPedidoParaEdicao } = useCart();
  const navigate = useNavigate();

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [statusFiltro, setStatusFiltro] = useState<string>('todos');
  const [busca, setBusca] = useState<string>('');
  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(null);
  const [pedidoReciboModal, setPedidoReciboModal] = useState<Pedido | null>(null);
  const [pedidoItensModal, setPedidoItensModal] = useState<Pedido | null>(null);
  const [produtoDetalhesModal, setProdutoDetalhesModal] = useState<Produto | null>(null);
  const [copiado, setCopiado] = useState<boolean>(false);
  const [somAtivo, setSomAtivo] = useState<boolean>(true);
  const [campoOrdenacao, setCampoOrdenacao] = useState<OrdenacaoCampo>('data');
  const [direcaoOrdenacao, setDirecaoOrdenacao] = useState<OrdenacaoDirecao>('desc');

  const podeAlterarTipoVenda = permissions.ehAdmin;

  const carregarPedidos = async (tocarAlerta = false) => {
    if (!loja?.id) return;
    try {
      setCarregando(true);
      let query = supabase
        .from('pedidos')
        .select(`
          *,
          cliente:clientes(*),
          vendedor:usuarios_loja(*),
          itens:itens_pedido(*),
          pagamentos:pagamentos_pedido(*)
        `)
        .eq('loja_id', loja.id);

      // Se o usuário NÃO tem permissão de ver transações de outros operadores, filtra apenas os seus
      if (usuario && !permissions.podeVerTransacoesOutros) {
        query = query.eq('vendedor_id', usuario.id);
      }

      const { data, error } = await query.order('criado_em', { ascending: false });

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
            // Se o usuário só pode ver suas vendas, não processa updates de outros vendedores
            if (usuario && !permissions.podeVerTransacoesOutros && (payload.new as any)?.vendedor_id !== usuario.id) {
              return;
            }
            const isNovo = payload.eventType === 'INSERT';
            carregarPedidos(isNovo);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [loja?.id, usuario?.id, somAtivo, permissions.podeVerTransacoesOutros]);

  const handleConsultarProduto = async (item: ItemPedido) => {
    try {
      if (item.produto_id) {
        const { data, error } = await supabase
          .from('produtos')
          .select('*, categoria:categorias(*), variacoes:variacoes_produto(*)')
          .eq('id', item.produto_id)
          .maybeSingle();

        if (data) {
          setProdutoDetalhesModal(data as unknown as Produto);
          return;
        }
      }
      setProdutoDetalhesModal({
        id: item.produto_id || 'temp',
        loja_id: loja?.id || '',
        nome: item.nome_produto,
        preco_venda_varejo: item.preco_venda_unitario,
        preco_custo: 0,
        quantidade_estoque: 0,
        estoque_minimo_alerta: 0,
        tipo_unidade: 'un',
        ativo: true,
        exibir_catalogo: true,
        destaque: false,
        fotos_urls: [],
        tem_variacoes: false,
        controlar_estoque: false,
        promocao_ativa: false,
        qtd_minima_atacado: 1,
        qtd_minima_autoatacado: 1,
        criado_em: new Date().toISOString()
      } as unknown as Produto);
    } catch (e) {
      console.warn('Erro ao carregar detalhes do produto:', e);
    }
  };

  const statusConfig = (loja?.configuracoes_extras as any)?.status_pedidos_ativos || {};
  const isStatusHabilitado = (statusId: string) => {
    if (statusId === 'em_producao') return statusConfig.em_producao !== false;
    if (statusId === 'em_expedicao') return statusConfig.em_expedicao !== false;
    if (statusId === 'saiu_para_entrega') return statusConfig.saiu_para_entrega !== false;
    if (statusId === 'pronto_para_retirar') return statusConfig.pronto_para_retirar !== false;
    return true;
  };

  const getOpcoesStatusPermitidas = (pedido: Pedido) => {
    if (pedido.status === 'pendente') {
      // Quando pendente, só pode passar para confirmado
      return [
        { id: 'pendente' as StatusPedido, label: 'Pendente' },
        { id: 'confirmado' as StatusPedido, label: 'Confirmado' }
      ];
    }
    const opcoesDisponiveis = STATUS_PEDIDO_OPCOES.filter(opt => isStatusHabilitado(opt.id));

    if (permissions.ehVendedorOuComum) {
      // Vendedor/Comum não pode alterar depois de confirmado
      return opcoesDisponiveis.filter(opt => opt.id === pedido.status);
    }
    // Demais perfis (Gerente, Admin, Owner) podem alternar entre status pós-pendente
    return opcoesDisponiveis.filter(opt => opt.id !== 'pendente');
  };

  const podeAlterarStatusDoPedido = (pedido: Pedido) => {
    if (pedido.status === 'pendente') return true;
    if (permissions.ehVendedorOuComum) return false;
    return true;
  };

  const atualizarStatus = async (pedidoId: string, novoStatus: StatusPedido) => {
    const pedidoAlvo = pedidos.find(p => p.id === pedidoId);
    if (!pedidoAlvo) return;

    // Validações de transição de status
    if (pedidoAlvo.status === 'pendente' && novoStatus !== 'confirmado' && novoStatus !== 'pendente') {
      alert('Pedidos com status Pendente só podem ser alterados para Confirmado.');
      return;
    }
    if (permissions.ehVendedorOuComum && pedidoAlvo.status !== 'pendente') {
      alert('Seu perfil só pode alterar pedidos de Pendente para Confirmado.');
      return;
    }

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

      if (pedidoReciboModal && pedidoReciboModal.id === pedidoId) {
        setPedidoReciboModal(prev => prev ? { ...prev, status: novoStatus } : null);
      }

      if (pedidoItensModal && pedidoItensModal.id === pedidoId) {
        setPedidoItensModal(prev => prev ? { ...prev, status: novoStatus } : null);
      }

      audioService.playBeep();
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
    }
  };

  const atualizarStatusPagamento = async (pedidoId: string, novoStatusPagamento: StatusPagamento) => {
    try {
      const ehPago = novoStatusPagamento === 'pago';
      const ped = pedidos.find(p => p.id === pedidoId);
      const totalPed = ped ? Number(ped.valor_total) : 0;

      const { error } = await supabase
        .from('pedidos')
        .update({
          valor_pago: ehPago ? totalPed : novoStatusPagamento === 'aguardando_pagamento' ? 0 : ped?.valor_pago,
          saldo_devedor: ehPago ? 0 : novoStatusPagamento === 'aguardando_pagamento' ? totalPed : ped?.saldo_devedor,
          fiado_quitado: ehPago,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', pedidoId);

      if (error) throw error;

      setPedidos(prev =>
        prev.map(p => (p.id === pedidoId ? {
          ...p,
          status_pagamento: novoStatusPagamento,
          valor_pago: ehPago ? totalPed : novoStatusPagamento === 'aguardando_pagamento' ? 0 : p.valor_pago,
          saldo_devedor: ehPago ? 0 : novoStatusPagamento === 'aguardando_pagamento' ? totalPed : p.saldo_devedor,
          fiado_quitado: ehPago
        } : p))
      );

      if (pedidoSelecionado?.id === pedidoId) {
        setPedidoSelecionado(prev => prev ? {
          ...prev,
          status_pagamento: novoStatusPagamento,
          valor_pago: ehPago ? totalPed : novoStatusPagamento === 'aguardando_pagamento' ? 0 : prev.valor_pago,
          saldo_devedor: ehPago ? 0 : novoStatusPagamento === 'aguardando_pagamento' ? totalPed : prev.saldo_devedor,
          fiado_quitado: ehPago
        } : null);
      }

      audioService.playBeep();
    } catch (err: any) {
      console.error('Erro ao atualizar status de pagamento:', err);
      alert(`Erro ao atualizar status de pagamento: ${err.message || 'Tente novamente.'}`);
    }
  };

  const atualizarTipoVenda = async (pedidoId: string, novoTipo: TabelaPreco) => {
    try {
      const { error } = await supabase
        .from('pedidos')
        .update({
          tabela_preco_aplicada: novoTipo,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', pedidoId);

      if (error) throw error;

      setPedidos(prev =>
        prev.map(p => (p.id === pedidoId ? { ...p, tabela_preco_aplicada: novoTipo } : p))
      );

      if (pedidoSelecionado && pedidoSelecionado.id === pedidoId) {
        setPedidoSelecionado(prev => prev ? { ...prev, tabela_preco_aplicada: novoTipo } : null);
      }

      if (pedidoReciboModal && pedidoReciboModal.id === pedidoId) {
        setPedidoReciboModal(prev => prev ? { ...prev, tabela_preco_aplicada: novoTipo } : null);
      }

      audioService.playBeep();
    } catch (err: any) {
      console.error('Erro ao atualizar tipo de venda:', err);
      alert(`Erro ao alterar Tipo da Venda: ${err.message || 'Tente novamente.'}`);
    }
  };

  const handleEditarPedido = (pedido: Pedido) => {
    if (pedido.status !== 'pendente') {
      alert('A alteração de pedido só é permitida para pedidos com status Pendente.');
      return;
    }
    carregarPedidoParaEdicao(pedido);
    navigate('/pos');
  };

  // Contagem de pedidos abertos
  const pedidosAbertosCount = useMemo(() => {
    return pedidos.filter(p => ['pendente', 'confirmado', 'em_separacao', 'em_producao', 'em_expedicao', 'saiu_para_entrega', 'pronto_para_retirar'].includes(p.status)).length;
  }, [pedidos]);

  // Filtragem e Ordenação
  const pedidosFiltrados = useMemo(() => {
    return pedidos
      .filter(p => {
        let matchStatus = true;
        if (statusFiltro !== 'todos') {
          matchStatus = p.status === statusFiltro;
        }

        const termo = busca.toLowerCase().trim();
        const nomeCli = p.cliente?.nome || 'cliente avulso (balcão)';
        const matchBusca =
          !termo ||
          p.numero_pedido.toString().includes(termo) ||
          nomeCli.toLowerCase().includes(termo) ||
          (p.vendedor?.nome_completo && p.vendedor.nome_completo.toLowerCase().includes(termo)) ||
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

  const resolverStatusPagamento = (pedido: Pedido): StatusPagamento => {
    if (pedido.status_pagamento) return pedido.status_pagamento;
    if (Number(pedido.saldo_devedor) <= 0 && Number(pedido.valor_pago) > 0) return 'pago';
    if (Number(pedido.valor_pago) > 0 && Number(pedido.saldo_devedor) > 0) return 'parcialmente_pago';
    return 'aguardando_pagamento';
  };

  const getStatusBadge = (status: StatusPedido, showChevron = false) => {
    let content;
    switch (status) {
      case 'pendente':
        content = (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5" /> <span>Pendente</span>
            {showChevron && <ChevronDown className="w-3 h-3 ml-0.5 text-amber-400/70" />}
          </span>
        );
        break;
      case 'confirmado':
        content = (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> <span>Confirmado</span>
            {showChevron && <ChevronDown className="w-3 h-3 ml-0.5 text-emerald-400/70" />}
          </span>
        );
        break;
      case 'em_separacao':
        content = (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Package className="w-3.5 h-3.5" /> <span>Em separação</span>
            {showChevron && <ChevronDown className="w-3 h-3 ml-0.5 text-cyan-400/70" />}
          </span>
        );
        break;
      case 'em_producao':
        content = (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Package className="w-3.5 h-3.5" /> <span>Em produção</span>
            {showChevron && <ChevronDown className="w-3 h-3 ml-0.5 text-blue-400/70" />}
          </span>
        );
        break;
      case 'em_expedicao':
        content = (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Truck className="w-3.5 h-3.5" /> <span>Em expedição</span>
            {showChevron && <ChevronDown className="w-3 h-3 ml-0.5 text-purple-400/70" />}
          </span>
        );
        break;
      case 'saiu_para_entrega':
        content = (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Truck className="w-3.5 h-3.5" /> <span>Saiu para Entrega</span>
            {showChevron && <ChevronDown className="w-3 h-3 ml-0.5 text-indigo-400/70" />}
          </span>
        );
        break;
      case 'pronto_para_retirar':
        content = (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <Store className="w-3.5 h-3.5" /> <span>Pronto para retirar</span>
            {showChevron && <ChevronDown className="w-3 h-3 ml-0.5 text-teal-400/70" />}
          </span>
        );
        break;
      case 'concluido':
        content = (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> <span>Concluído</span>
            {showChevron && <ChevronDown className="w-3 h-3 ml-0.5 text-slate-400" />}
          </span>
        );
        break;
      case 'cancelado':
        content = (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400/80 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" /> <span>Cancelado</span>
            {showChevron && <ChevronDown className="w-3 h-3 ml-0.5 text-rose-400/70" />}
          </span>
        );
        break;
      default:
        content = (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400">
            {status}
            {showChevron && <ChevronDown className="w-3 h-3 ml-0.5 text-slate-400" />}
          </span>
        );
    }
    return content;
  };

  const getStatusPagamentoBadge = (status: StatusPagamento, showChevron = false) => {
    switch (status) {
      case 'pago':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> <span>Pago</span>
            {showChevron && <ChevronDown className="w-3 h-3 ml-0.5 text-emerald-400/70" />}
          </span>
        );
      case 'parcialmente_pago':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
            <CreditCard className="w-3.5 h-3.5" /> <span>Parcialmente Pago</span>
            {showChevron && <ChevronDown className="w-3 h-3 ml-0.5 text-sky-400/70" />}
          </span>
        );
      case 'aguardando_pagamento':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5" /> <span>Aguardando pagamento</span>
            {showChevron && <ChevronDown className="w-3 h-3 ml-0.5 text-amber-400/70" />}
          </span>
        );
    }
  };

  const getTipoVendaBadge = (tabela?: TabelaPreco | string | null, showChevron = false) => {
    let label = 'Varejo';
    let cls = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    if (tabela === 'atacado') {
      label = 'Atacado';
      cls = 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    } else if (tabela === 'autoatacado') {
      label = 'Distribuidor';
      cls = 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    } else if (tabela === 'promocional') {
      label = 'Promocional';
      cls = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    }

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border ${cls}`}>
        <span>{label}</span>
        {showChevron && <ChevronDown className="w-3 h-3 ml-0.5 opacity-75" />}
      </span>
    );
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

  const handleCopiarReciboTexto = (pedido: Pedido) => {
    if (!loja) return;
    const msg = PrintService.generateWhatsAppMessage(pedido, loja);
    navigator.clipboard.writeText(msg);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="flex h-full flex-col lg:flex-row overflow-hidden bg-slate-950 text-slate-100">
      {/* CORPO PRINCIPAL: CABEÇALHO + TABELA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* CABEÇALHO SUPERIOR */}
        <div className="p-4 sm:px-6 py-4 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                <span>{pedidosAbertosCount} pedidos abertos</span>
              </h1>
              <p className="text-xs text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                <span>{pedidos.length} pedidos listados • Tempo real</span>
                {!permissions.podeVerTransacoesOutros && (
                  <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">
                    👤 Seus Pedidos ({usuario?.nome_completo || 'Vendedor'})
                  </span>
                )}
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

            {/* Abas de Status Filtradas conforme Configuração */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800/80">
                {ABAS_STATUS.filter(f => isStatusHabilitado(f.id)).map((f) => (
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

        {/* TABELA DE PEDIDOS */}
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
                  <th className="py-3 px-4 font-semibold">Status Pedido</th>
                  <th className="py-3 px-4 font-semibold">Status Pagamento</th>
                  <th className="py-3 px-4 font-semibold text-center">Tipo da Venda</th>
                  <th className="py-3 px-4 font-semibold text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {pedidosFiltrados.map((pedido) => {
                  const isCancelado = pedido.status === 'cancelado';
                  const totalItens = calcularTotalItens(pedido);
                  const isCatalogo = pedido.origem === 'catalogo_online';
                  const isSelecionado = pedidoSelecionado?.id === pedido.id;
                  const statusPag = resolverStatusPagamento(pedido);
                  const permiteTrocarTipo = podeAlterarTipoVenda && (statusPag === 'aguardando_pagamento' || Number(pedido.valor_pago) === 0);
                  const isPendente = pedido.status === 'pendente';

                  return (
                    <tr
                      key={pedido.id}
                      className={`transition group hover:bg-slate-900/60 ${
                        isSelecionado ? 'bg-slate-900/90 ring-1 ring-inset ring-emerald-500/40' : ''
                      } ${isCancelado ? 'opacity-60' : ''}`}
                    >
                      {/* Código com Primeiro Ícone para Recibo e Segundo para Pedido */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-medium">
                        <div className="flex items-center gap-2">
                          {/* 1º ÍCONE: BOTÃO DE RECIBO */}
                          <button
                            type="button"
                            title="Ver Recibo do Pedido"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPedidoReciboModal(pedido);
                            }}
                            className="p-1 rounded-lg hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                          >
                            <Receipt className="w-4 h-4" />
                          </button>

                          {/* 2º CÓDIGO DO PEDIDO (#xxxx) */}
                          <button
                            type="button"
                            title="Abrir Detalhes do Pedido"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPedidoSelecionado(pedido);
                            }}
                            className={`font-bold hover:underline cursor-pointer ${
                              isCancelado ? 'line-through text-slate-400' : 'text-slate-200 group-hover:text-emerald-400'
                            }`}
                          >
                            #{isCatalogo ? `c-${pedido.numero_pedido}` : pedido.numero_pedido}
                          </button>
                        </div>
                      </td>

                      {/* Data */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-300">
                        <span className={isCancelado ? 'line-through' : ''}>
                          {formatarData(pedido.data_venda || pedido.criado_em || '')}
                        </span>
                      </td>

                      {/* Cliente (Cliente Avulso (Balcão) se não identificado) */}
                      <td className="py-3.5 px-4 max-w-[200px] truncate text-slate-200 font-medium">
                        <span className={isCancelado ? 'line-through' : ''}>
                          {pedido.cliente?.nome || 'Cliente Avulso (Balcão)'}
                        </span>
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

                      {/* Itens (Clique abre o modal de itens do pedido) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPedidoItensModal(pedido);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/25 transition cursor-pointer active:scale-95 shadow-sm"
                          title="Clique para ver os itens deste pedido"
                        >
                          <Package className="w-3.5 h-3.5" />
                          <span>{totalItens} {totalItens === 1 ? 'item' : 'itens'}</span>
                        </button>
                      </td>

                      {/* Valor Total Limpo (Sem texto de Fiado) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`font-bold text-sm ${
                            isCancelado
                              ? 'line-through text-slate-400'
                              : 'text-slate-100'
                          }`}
                        >
                          R$ {Number(pedido.valor_total).toFixed(2)}
                        </span>
                      </td>

                      {/* Status do Pedido (com regras de transição) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {podeAlterarStatusDoPedido(pedido) ? (
                          <div className="relative inline-flex items-center cursor-pointer group" title="Clique para alterar status do pedido">
                            {getStatusBadge(pedido.status, true)}
                            <select
                              value={pedido.status}
                              onChange={(e) => atualizarStatus(pedido.id, e.target.value as StatusPedido)}
                              className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                            >
                              {getOpcoesStatusPermitidas(pedido).map((opt) => (
                                <option key={opt.id} value={opt.id} className="bg-slate-900 text-slate-200">
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          getStatusBadge(pedido.status, false)
                        )}
                      </td>

                      {/* Status do Pagamento (Estritamente Informativo) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getStatusPagamentoBadge(statusPag, false)}
                      </td>

                      {/* Tipo da Venda (Varejo / Atacado / Distribuidor) - Alterável por Owner/Admin quando Aguardando Pagamento */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {permiteTrocarTipo ? (
                          <div className="relative inline-flex items-center cursor-pointer group" title="Clique para alterar Tipo da Venda (Owner/Admin)">
                            {getTipoVendaBadge(pedido.tabela_preco_aplicada, true)}
                            <select
                              value={pedido.tabela_preco_aplicada || 'varejo'}
                              onChange={(e) => atualizarTipoVenda(pedido.id, e.target.value as TabelaPreco)}
                              className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                            >
                              {TIPOS_VENDA_OPCOES.map((opt) => (
                                <option key={opt.id} value={opt.id} className="bg-slate-900 text-slate-200">
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1" title={podeAlterarTipoVenda ? 'Tipo da venda bloqueado após pagamento' : 'Apenas Owner e Admin podem alterar'}>
                            {getTipoVendaBadge(pedido.tabela_preco_aplicada, false)}
                            {!podeAlterarTipoVenda && <Lock className="w-3 h-3 text-slate-600" />}
                          </div>
                        )}
                      </td>

                      {/* Ações (Consultar Produtos / Alterar Pedido se Pendente) */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPedidoItensModal(pedido)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition cursor-pointer border border-slate-700/80"
                            title="Consultar produtos do pedido"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={!isPendente}
                            onClick={() => handleEditarPedido(pedido)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                              isPendente
                                ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer shadow-sm active:scale-95'
                                : 'bg-slate-900 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-40'
                            }`}
                            title={isPendente ? 'Carregar pedido no PDV para alteração' : 'Alteração permitida apenas para pedidos com status Pendente'}
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Alterar</span>
                          </button>
                        </div>
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
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                <span>{formatarData(pedidoSelecionado.data_venda || pedidoSelecionado.criado_em || '')}</span>
                <span>•</span>
                <span>{getTipoVendaBadge(pedidoSelecionado.tabela_preco_aplicada)}</span>
                <span>•</span>
                <span>{getStatusPagamentoBadge(resolverStatusPagamento(pedidoSelecionado))}</span>
              </div>
            </div>
            <button
              onClick={() => setPedidoSelecionado(null)}
              className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Conteúdo do Drawer com Rolagem */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Botão de Alterar Pedido se Pendente */}
            {pedidoSelecionado.status === 'pendente' && (
              <button
                type="button"
                onClick={() => handleEditarPedido(pedidoSelecionado)}
                className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer shadow"
              >
                <Edit className="w-4 h-4" />
                <span>Alterar Produtos e Valores no PDV</span>
              </button>
            )}

            {/* Informações do Cliente */}
            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 text-xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-emerald-400" /> Dados do Cliente
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  Tabela: {pedidoSelecionado.tabela_preco_aplicada === 'autoatacado' ? 'Distribuidor' : pedidoSelecionado.tabela_preco_aplicada || 'Varejo'}
                </span>
              </div>
              <p className="text-slate-200 font-semibold text-sm">
                {pedidoSelecionado.cliente?.nome || 'Cliente Avulso (Balcão)'}
              </p>
              {pedidoSelecionado.cliente?.whatsapp && (
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

            {/* Itens do Pedido com Ação de Detalhar Produto */}
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
                    className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-center justify-between text-xs gap-2"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <span className="font-semibold text-slate-200 block truncate">
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

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-slate-100 text-sm">
                        R$ {Number(item.subtotal).toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleConsultarProduto(item)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition cursor-pointer"
                        title="Ver Detalhes do Produto"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resumo Financeiro Limpo */}
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
            </div>
          </div>

          {/* Botões de Ação do Drawer */}
          <div className="p-4 border-t border-slate-800 bg-slate-900 space-y-2">
            <button
              onClick={() => setPedidoReciboModal(pedidoSelecionado)}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold flex items-center justify-center gap-2 border border-slate-700 transition shadow-sm cursor-pointer"
            >
              <Receipt className="w-4 h-4" />
              <span>Ver Apresentação do Recibo</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  if (pedidoSelecionado) PrintService.printReceipt(pedidoSelecionado, loja, '80mm');
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Térmica 58/80mm</span>
              </button>

              <button
                onClick={() => {
                  if (pedidoSelecionado) PrintService.printReceipt(pedidoSelecionado, loja, 'a4');
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
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
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Enviar Recibo por WhatsApp</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE APRESENTAÇÃO DO RECIBO */}
      {pedidoReciboModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Topo do Modal de Recibo */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-100 text-sm">Recibo do Pedido #{pedidoReciboModal.numero_pedido}</h3>
                  <p className="text-[11px] text-slate-400">{loja?.nome_fantasia || 'HUBI PDV'}</p>
                </div>
              </div>
              <button
                onClick={() => setPedidoReciboModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Visualização do Cupom/Recibo (Estilo Cupom Fiscal / Térmica) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 text-slate-200 font-mono text-xs space-y-3 shadow-inner">
                {/* Cabeçalho do Recibo */}
                <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-800">
                  <h4 className="font-bold text-slate-100 text-sm tracking-wide uppercase">
                    {loja?.nome_fantasia || 'MINHA LOJA'}
                  </h4>
                  {loja?.numero_documento && (
                    <p className="text-[11px] text-slate-400">CNPJ/CPF: {loja.numero_documento}</p>
                  )}
                  {loja?.whatsapp && (
                    <p className="text-[11px] text-slate-400">WhatsApp: {loja.whatsapp}</p>
                  )}
                  {loja?.endereco_cidade && (
                    <p className="text-[11px] text-slate-400">{loja.endereco_cidade} - {loja.endereco_estado || 'UF'}</p>
                  )}
                  <p className="text-[10px] text-emerald-400 pt-1 font-sans font-bold uppercase tracking-wider">
                    *** COMPROVANTE NÃO FISCAL ***
                  </p>
                </div>

                {/* Dados da Venda */}
                <div className="space-y-1 text-[11px] text-slate-300 pb-2 border-b border-dashed border-slate-800">
                  <div className="flex justify-between">
                    <span>PEDIDO:</span>
                    <span className="font-bold text-slate-100">#{pedidoReciboModal.numero_pedido}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>DATA:</span>
                    <span>{formatarData(pedidoReciboModal.data_venda || pedidoReciboModal.criado_em || '')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>TABELA:</span>
                    <span className="capitalize">{pedidoReciboModal.tabela_preco_aplicada === 'autoatacado' ? 'Distribuidor' : pedidoReciboModal.tabela_preco_aplicada || 'Varejo'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>STATUS:</span>
                    <span className="capitalize">{pedidoReciboModal.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>PAGAMENTO:</span>
                    <span className="capitalize">{STATUS_PAGAMENTO_OPCOES.find(o => o.id === resolverStatusPagamento(pedidoReciboModal))?.label || 'Aguardando pagamento'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>CLIENTE:</span>
                    <span className="font-bold text-slate-100">{pedidoReciboModal.cliente?.nome || 'Cliente Avulso (Balcão)'}</span>
                  </div>
                  {pedidoReciboModal.endereco_entrega && (
                    <div className="pt-1 text-[10px] text-slate-400">
                      <span>ENTREGA: {pedidoReciboModal.endereco_entrega}</span>
                    </div>
                  )}
                </div>

                {/* Tabela de Itens */}
                <div className="space-y-2 pb-3 border-b border-dashed border-slate-800">
                  <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold">
                    <span>Qtd / Descrição</span>
                    <span>Total</span>
                  </div>
                  <div className="space-y-1.5">
                    {pedidoReciboModal.itens?.map((item, idx) => (
                      <div key={idx} className="space-y-0.5">
                        <div className="flex justify-between text-[11px]">
                          <span className="font-medium text-slate-200">
                            {Number(item.quantidade)}x {item.nome_produto} {item.rotulo_variacao ? `(${item.rotulo_variacao})` : ''}
                          </span>
                          <span className="font-bold text-slate-100">
                            R$ {Number(item.subtotal).toFixed(2)}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          (R$ {Number(item.preco_venda_unitario).toFixed(2)} un)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totais do Recibo */}
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between text-slate-400">
                    <span>SUBTOTAL:</span>
                    <span>R$ {Number(pedidoReciboModal.subtotal).toFixed(2)}</span>
                  </div>
                  {Number(pedidoReciboModal.valor_desconto) > 0 && (
                    <div className="flex justify-between text-rose-400">
                      <span>DESCONTO:</span>
                      <span>- R$ {Number(pedidoReciboModal.valor_desconto).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(pedidoReciboModal.valor_frete) > 0 && (
                    <div className="flex justify-between text-purple-400">
                      <span>TAXA ENTREGA:</span>
                      <span>+ R$ {Number(pedidoReciboModal.valor_frete).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-emerald-400 font-bold text-sm pt-1 border-t border-slate-800">
                    <span>TOTAL A PAGAR:</span>
                    <span>R$ {Number(pedidoReciboModal.valor_total).toFixed(2)}</span>
                  </div>

                  {Number(pedidoReciboModal.saldo_devedor) > 0 && (
                    <div className="flex justify-between text-amber-400 font-bold pt-1 text-[11px]">
                      <span>SALDO FIADO:</span>
                      <span>R$ {Number(pedidoReciboModal.saldo_devedor).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Rodapé do Recibo */}
                <div className="text-center pt-3 border-t border-dashed border-slate-800 text-[10px] text-slate-500">
                  <p>Obrigado pela preferência!</p>
                  <p className="pt-0.5">HUBI • Sistema de Gestão e PDV</p>
                </div>
              </div>
            </div>

            {/* Ações do Modal de Recibo */}
            <div className="p-4 border-t border-slate-800 bg-slate-900 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    if (pedidoReciboModal) {
                      PrintService.printReceipt(pedidoReciboModal, loja, '80mm');
                    }
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-emerald-400" />
                  <span>Imprimir 58/80mm</span>
                </button>

                <button
                  onClick={() => {
                    if (pedidoReciboModal) {
                      PrintService.printReceipt(pedidoReciboModal, loja, 'a4');
                    }
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-indigo-400" />
                  <span>Imprimir A4</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleCopiarReciboTexto(pedidoReciboModal)}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  {copiado ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                  <span>{copiado ? 'Copiado!' : 'Copiar Texto'}</span>
                </button>

                {pedidoReciboModal.cliente?.whatsapp ? (
                  <button
                    onClick={() => {
                      if (loja && pedidoReciboModal.cliente?.whatsapp) {
                        const msg = PrintService.generateWhatsAppMessage(pedidoReciboModal, loja);
                        PrintService.openWhatsApp(pedidoReciboModal.cliente.whatsapp, msg);
                      }
                    }}
                    className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (loja) {
                        const msg = PrintService.generateWhatsAppMessage(pedidoReciboModal, loja);
                        PrintService.openWhatsApp('', msg);
                      }
                    }}
                    className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Enviar WhatsApp</span>
                  </button>
                )}
              </div>

              <button
                onClick={() => setPedidoReciboModal(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ITENS DO PEDIDO */}
      <ModalItensPedido
        isOpen={!!pedidoItensModal}
        onClose={() => setPedidoItensModal(null)}
        pedido={pedidoItensModal}
        onConsultarProduto={(item) => handleConsultarProduto(item)}
      />

      {/* MODAL DE DETALHES DO PRODUTO (CONSULTA FICHA TÉCNICA) */}
      <ModalDetalhesProduto
        isOpen={!!produtoDetalhesModal}
        onClose={() => setProdutoDetalhesModal(null)}
        produto={produtoDetalhesModal}
      />
    </div>
  );
};



