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
  Info,
  Mail,
  Download,
  ArrowLeft,
  DollarSign,
  Loader2,
  RefreshCw,
  Ban,
  Wallet,
  Coins,
  Send,
  HelpCircle,
  ExternalLink,
  MessageCircle,
  Percent,
  Plus
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCart } from '../contexts/CartContext';
import { Pedido, StatusPedido, StatusPagamento, TabelaPreco, ItemPedido, Produto, Cliente, UsuarioLoja } from '../types';
import { PrintService, formatarDataRecibo, obterDadosPagamentoRecibo } from '../services/printService';
import { audioService } from '../services/audioService';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { ModalNovoCliente } from './ModalNovoCliente';
import { ModalItensPedido } from './ModalItensPedido';
import { ModalDetalhesProduto } from './ModalDetalhesProduto';
import { ModalReceberPagamento } from './ModalReceberPagamento';
import { ModalConfigurarRecibo } from './ModalConfigurarRecibo';
import { PedidosListaMobile } from './PedidosListaMobile';

type OrdenacaoCampo = 'data' | 'valor' | 'codigo';
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

interface HistoricoItem {
  status: string;
  data: string;
  usuario?: string;
}

export const PedidosLista: React.FC = () => {
  const { loja, usuario } = useAuth();
  const permissions = usePermissions();
  const { carregarPedidoParaEdicao } = useCart();
  const navigate = useNavigate();
  const { mostrarSucesso, mostrarAviso, mostrarErro } = useFeedbackModal();

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioLoja[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [statusFiltro, setStatusFiltro] = useState<string>('todos');
  const [busca, setBusca] = useState<string>('');
  
  // Modais e Detalhes
  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(null);
  const [pedidoReciboModal, setPedidoReciboModal] = useState<Pedido | null>(null);
  const [pedidoItensModal, setPedidoItensModal] = useState<Pedido | null>(null);
  const [pedidoReceberModal, setPedidoReceberModal] = useState<Pedido | null>(null);
  const [produtoDetalhesModal, setProdutoDetalhesModal] = useState<Produto | null>(null);
  const [modalNovoClienteAberto, setModalNovoClienteAberto] = useState<boolean>(false);
  
  // Novos Modais da Especificação (TELA004, TELA005, TELA010)
  const [modalCancelarPedidoAberto, setModalCancelarPedidoAberto] = useState<boolean>(false);
  const [gavetaConcluirVendaAberta, setGavetaConcluirVendaAberta] = useState<boolean>(false);
  const [modalConfigurarReciboAberto, setModalConfigurarReciboAberto] = useState<boolean>(false);
  const [modalDescontoAberto, setModalDescontoAberto] = useState<boolean>(false);

  // Estados de Conclusão de Venda (TELA005)
  const [meioPagamentoConclusao, setMeioPagamentoConclusao] = useState<string>('dinheiro');
  const [valorRecebidoConclusao, setValorRecebidoConclusao] = useState<string>('');
  const [salvandoConclusao, setSalvandoConclusao] = useState<boolean>(false);

  // Edição de Desconto e Observação
  const [novoDescontoValor, setNovoDescontoValor] = useState<string>('');
  const [observacaoTexto, setObservacaoTexto] = useState<string>('');
  const [exibirObsRecibo, setExibirObsRecibo] = useState<boolean>(true);

  const [copiado, setCopiado] = useState<boolean>(false);
  const [somAtivo, setSomAtivo] = useState<boolean>(true);
  const [campoOrdenacao, setCampoOrdenacao] = useState<OrdenacaoCampo>('data');
  const [direcaoOrdenacao, setDirecaoOrdenacao] = useState<OrdenacaoDirecao>('desc');

  // Escuta reset de navegação do menu superior
  useEffect(() => {
    const handleMenuNav = (e: any) => {
      if (e.detail?.path === '/orders') {
        setPedidoSelecionado(null);
      }
    };
    window.addEventListener('hubi_navegacao_menu', handleMenuNav);
    return () => window.removeEventListener('hubi_navegacao_menu', handleMenuNav);
  }, []);


  const handleSalvarObservacao = async () => {
    if (!pedidoSelecionado) return;
    const novoTexto = observacaoTexto.trim() || null;
    if (novoTexto === (pedidoSelecionado.observacoes || null)) return;

    try {
      const { error } = await supabase
        .from('pedidos')
        .update({
          observacoes: novoTexto,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', pedidoSelecionado.id);

      if (error) throw error;

      setPedidoSelecionado((prev) => (prev ? { ...prev, observacoes: novoTexto } : null));
      setPedidos((prev) =>
        prev.map((p) => (p.id === pedidoSelecionado.id ? { ...p, observacoes: novoTexto } : p))
      );
    } catch (err: any) {
      console.error('Erro ao salvar observação do pedido:', err);
    }
  };

  const resolverStatusPagamento = (pedido: Pedido): StatusPagamento => {
    if (pedido.status_pagamento === 'pago') return 'pago';
    if (Number(pedido.saldo_devedor) <= 0 && Number(pedido.valor_pago) > 0) return 'pago';
    if (Number(pedido.valor_pago) > 0 && Number(pedido.saldo_devedor) > 0) return 'parcialmente_pago';
    if (pedido.status_pagamento) return pedido.status_pagamento;
    return 'aguardando_pagamento';
  };

  const extrairHistoricoPedido = (pedido: Pedido): HistoricoItem[] => {
    const itens: HistoricoItem[] = [];
    
    // 1. Tentar ler do metadados.historico_status
    if (pedido.metadados && typeof pedido.metadados === 'object') {
      const historicoMeta = (pedido.metadados as any).historico_status;
      if (Array.isArray(historicoMeta) && historicoMeta.length > 0) {
        return historicoMeta;
      }
    }

    // 2. Fallback para tag legacy em observacoes <!--HUBI_HISTORICO:[...]-->
    try {
      const match = pedido.observacoes?.match(/<!--HUBI_HISTORICO:(.*?)-->/);
      if (match && match[1]) {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      // fallback
    }

    if (pedido.criado_em) {
      itens.push({
        status: 'pendente',
        data: pedido.criado_em,
        usuario: pedido.vendedor?.nome_completo || 'Sistema'
      });
    }
    if (pedido.status && pedido.status !== 'pendente') {
      itens.push({
        status: pedido.status,
        data: pedido.atualizado_em || pedido.data_venda || new Date().toISOString(),
        usuario: pedido.vendedor?.nome_completo || 'Operador'
      });
    }
    return itens;
  };

  const adicionarHistoricoMetadados = (pedido: Pedido | null | undefined, novoStatus: string, usuarioNome?: string): Record<string, any> => {
    const historicoAtual = pedido ? extrairHistoricoPedido(pedido) : [];
    const novoItem: HistoricoItem = {
      status: novoStatus,
      data: new Date().toISOString(),
      usuario: usuarioNome || 'Operador'
    };

    const historicoAtualizado = [...historicoAtual, novoItem];

    const metaBase = (pedido?.metadados && typeof pedido.metadados === 'object')
      ? { ...pedido.metadados }
      : {};

    metaBase.historico_status = historicoAtualizado;
    return metaBase;
  };

  const carregarPedidos = async (tocarAlerta = false) => {
    if (!loja?.id) return;
    try {
      setCarregando(true);

      supabase.from('clientes').select('*').eq('loja_id', loja.id).then(({ data }) => {
        if (data) setClientes(data);
      });
      supabase.from('usuarios_loja').select('*').eq('loja_id', loja.id).then(({ data }) => {
        if (data) setUsuarios(data);
      });

      let query = supabase
        .from('pedidos')
        .select(`
          *,
          cliente:clientes(*),
          vendedor:usuarios_loja(*),
          itens:itens_pedido(*),
          pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*))
        `)
        .eq('loja_id', loja.id);

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
        .channel(`pedidos-lista-realtime-${loja.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pedidos', filter: `loja_id=eq.${loja.id}` },
          (payload) => {
            if (usuario && !permissions.podeVerTransacoesOutros && (payload.new as any)?.vendedor_id !== usuario.id) {
              return;
            }
            const isNovo = payload.eventType === 'INSERT';
            carregarPedidos(isNovo);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pagamentos_pedido', filter: `loja_id=eq.${loja.id}` },
          () => {
            carregarPedidos(false);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [loja?.id, usuario?.id, somAtivo, permissions.podeVerTransacoesOutros]);

  useEffect(() => {
    if (pedidoSelecionado) {
      const obsLimpa = (pedidoSelecionado.observacoes || '')
        .replace(/\[PAG_PREVISTO:.*?\]/g, '')
        .replace(/\[DESCONTO_PERC:[0-9.]+\]/g, '')
        .replace(/<!--HUBI_HISTORICO:.*?-->/g, '')
        .trim();
      setObservacaoTexto(obsLimpa);
      setValorRecebidoConclusao(Number(pedidoSelecionado.valor_total || 0).toFixed(2));
      setNovoDescontoValor(Number(pedidoSelecionado.valor_desconto || 0).toFixed(2));
    }
  }, [pedidoSelecionado]);

  const handleConsultarProduto = async (item: ItemPedido) => {
    try {
      if (item.produto_id) {
        const { data, error } = await supabase
          .from('produtos')
          .select('*, categoria:categorias(*), variacoes:variacoes_produto(*)')
          .eq('id', item.produto_id)
          .single();

        if (!error && data) {
          setProdutoDetalhesModal(data as Produto);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar detalhes do produto:', err);
    }
  };

  const atualizarStatus = async (pedidoId: string, novoStatus: StatusPedido) => {
    try {
      const pedAlvo = pedidos.find((p) => p.id === pedidoId) || pedidoSelecionado;
      const novosMetadados = adicionarHistoricoMetadados(
        pedAlvo,
        novoStatus,
        usuario?.nome_completo || 'Operador'
      );

      // Limpar tag legada de observacoes caso ainda exista
      let obsLimpa = pedAlvo?.observacoes || '';
      obsLimpa = obsLimpa.replace(/<!--HUBI_HISTORICO:.*?-->/g, '').trim();

      const { error } = await supabase
        .from('pedidos')
        .update({
          status: novoStatus,
          observacoes: obsLimpa || null,
          metadados: novosMetadados,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', pedidoId);

      if (error) throw error;

      setPedidos((prev) =>
        prev.map((p) =>
          p.id === pedidoId
            ? { ...p, status: novoStatus, observacoes: obsLimpa || null, metadados: novosMetadados }
            : p
        )
      );

      if (pedidoSelecionado && pedidoSelecionado.id === pedidoId) {
        if (novoStatus === 'concluido') {
          setPedidoSelecionado(null);
        } else {
          setPedidoSelecionado((prev) =>
            prev
              ? { ...prev, status: novoStatus, observacoes: obsLimpa || null, metadados: novosMetadados }
              : null
          );
        }
      }

      audioService.playBeep();
    } catch (err: any) {
      console.error('Erro ao atualizar status do pedido:', err);
      mostrarErro(`Erro ao atualizar status: ${err.message || 'Tente novamente.'}`);
    }
  };

  const handleAlterarClientePedido = async (novoClienteId: string) => {
    if (!pedidoSelecionado) return;
    try {
      const clienteEncontrado = clientes.find((c) => c.id === novoClienteId) || null;
      const clienteIdFinal = novoClienteId === 'avulso' ? null : novoClienteId;

      const { error } = await supabase
        .from('pedidos')
        .update({
          cliente_id: clienteIdFinal,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', pedidoSelecionado.id);

      if (error) throw error;

      setPedidoSelecionado((prev) => (prev ? { ...prev, cliente_id: clienteIdFinal, cliente: clienteEncontrado } : null));
      setPedidos((prev) =>
        prev.map((p) => (p.id === pedidoSelecionado.id ? { ...p, cliente_id: clienteIdFinal, cliente: clienteEncontrado } : p))
      );
      mostrarSucesso('Cliente do pedido alterado com sucesso!');
    } catch (err: any) {
      console.error('Erro ao alterar cliente do pedido:', err);
      mostrarErro(`Erro ao atualizar cliente: ${err.message || 'Tente novamente.'}`);
    }
  };

  const handleClienteCriado = (novoCliente: Cliente) => {
    setClientes((prev) => [novoCliente, ...prev]);
    setModalNovoClienteAberto(false);
    if (pedidoSelecionado) {
      handleAlterarClientePedido(novoCliente.id);
    }
  };

  const handleSalvarMeioPagamento = async () => {
    if (!pedidoSelecionado || !loja?.id) return;
    try {
      setSalvandoConclusao(true);
      const dataIso = new Date().toISOString();

      const { data: fps } = await supabase.from('formas_pagamento').select('*').eq('loja_id', loja.id);
      const listaFPs = fps && fps.length > 0 ? fps : [];
      const fpEncontrada = listaFPs.find(
        (f: any) => f.nome?.toLowerCase().includes(meioPagamentoConclusao) || f.tipo === meioPagamentoConclusao
      ) || listaFPs[0];

      if (fpEncontrada?.id) {
        await supabase.from('pagamentos_pedido').delete().eq('pedido_id', pedidoSelecionado.id);
        const { error: erroPag } = await supabase.from('pagamentos_pedido').insert([
          {
            loja_id: loja.id,
            pedido_id: pedidoSelecionado.id,
            forma_pagamento_id: fpEncontrada.id,
            valor: Number(pedidoSelecionado.valor_total || 0),
            parcelas: 1,
            valor_taxa: 0,
            valor_liquido: Number(pedidoSelecionado.valor_total || 0),
            data_pagamento: dataIso,
            eh_pagamento_fiado: meioPagamentoConclusao === 'fiado'
          }
        ]);
        if (erroPag) throw erroPag;
      }

      await supabase
        .from('pedidos')
        .update({ atualizado_em: dataIso })
        .eq('id', pedidoSelecionado.id);

      const { data: pedidoAtualizado } = await supabase
        .from('pedidos')
        .select(`
          *,
          cliente:clientes(*),
          vendedor:usuarios_loja(*),
          itens:itens_pedido(*),
          pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*))
        `)
        .eq('id', pedidoSelecionado.id)
        .single();

      if (pedidoAtualizado) {
        setPedidoSelecionado(pedidoAtualizado);
        setPedidos((prev) => prev.map((p) => (p.id === pedidoAtualizado.id ? pedidoAtualizado : p)));
      }

      audioService.playBeep();
      setGavetaConcluirVendaAberta(false);
      mostrarSucesso('Pedido salvo com sucesso');
    } catch (err: any) {
      console.error('Erro ao salvar meio de pagamento:', err);
      mostrarErro(`Erro ao salvar meio de pagamento: ${err.message || 'Tente novamente.'}`);
    } finally {
      setSalvandoConclusao(false);
    }
  };

  // Concluir Venda (TELA005)
  const handleConfirmarConcluirVenda = async () => {
    if (!pedidoSelecionado || !loja?.id) return;
    setSalvandoConclusao(true);

    try {
      const valorTotal = Number(pedidoSelecionado.valor_total || 0);

      const { data: formas } = await supabase
        .from('formas_pagamento')
        .select('*')
        .eq('loja_id', loja.id);

      let formaId = formas?.[0]?.id;
      if (formas && formas.length > 0) {
        const formaEncontrada = formas.find(
          (f) =>
            f.tipo?.toLowerCase() === meioPagamentoConclusao.toLowerCase() ||
            f.nome?.toLowerCase().includes(meioPagamentoConclusao.toLowerCase())
        );
        if (formaEncontrada) formaId = formaEncontrada.id;
      }

      if (formaId) {
        await supabase.from('pagamentos_pedido').delete().eq('pedido_id', pedidoSelecionado.id);
        await supabase.from('pagamentos_pedido').insert({
          pedido_id: pedidoSelecionado.id,
          loja_id: loja.id,
          forma_pagamento_id: formaId,
          valor: valorTotal,
          criado_em: new Date().toISOString()
        });
      }

      const { error } = await supabase
        .from('pedidos')
        .update({
          status: 'concluido',
          status_pagamento: 'pago',
          valor_pago: valorTotal,
          saldo_devedor: 0,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', pedidoSelecionado.id);

      if (error) throw error;

      setGavetaConcluirVendaAberta(false);
      setPedidoSelecionado(null);
      carregarPedidos();
      audioService.playNewOrderSound();
    } catch (err: any) {
      console.error('Erro ao concluir venda:', err);
      mostrarErro(err.message || 'Tente novamente.', 'Erro ao concluir venda');
    } finally {
      setSalvandoConclusao(false);
    }
  };

  const handleConfirmarCancelarPedido = async () => {
    if (!pedidoSelecionado) return;
    await atualizarStatus(pedidoSelecionado.id, 'cancelado');
    setModalCancelarPedidoAberto(false);
  };

  const handleSalvarDesconto = async () => {
    if (!pedidoSelecionado) return;
    const descontoNum = parseFloat(novoDescontoValor.replace(',', '.')) || 0;
    const subtotal = Number(pedidoSelecionado.subtotal || pedidoSelecionado.valor_total || 0);
    const novoTotal = Math.max(0, subtotal - descontoNum);

    try {
      const { error } = await supabase
        .from('pedidos')
        .update({
          valor_desconto: descontoNum,
          valor_total: novoTotal,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', pedidoSelecionado.id);

      if (error) throw error;

      setPedidoSelecionado((prev) =>
        prev ? { ...prev, valor_desconto: descontoNum, valor_total: novoTotal } : null
      );
      setModalDescontoAberto(false);
      carregarPedidos();
    } catch (err) {
      console.error('Erro ao salvar desconto:', err);
    }
  };

  const handleCopiarLinkAndamento = (pedido: Pedido) => {
    const origin = window.location.origin;
    const link = `${origin}/order-tracking/${pedido.numero_pedido || pedido.id}`;
    navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleCompartilharWhatsApp = (pedido: Pedido) => {
    const origin = window.location.origin;
    const link = `${origin}/order-tracking/${pedido.numero_pedido || pedido.id}`;
    const texto = `Olá! Acompanhe o andamento do seu pedido #${pedido.numero_pedido} na ${loja?.nome_fantasia || 'nossa loja'} em tempo real pelo link:\n${link}`;
    const tel = pedido.cliente?.whatsapp || pedido.cliente?.telefone || '';
    const cleanTel = tel.replace(/\D/g, '');
    const url = cleanTel
      ? `https://wa.me/55${cleanTel}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
  };

  const handleCopiarReciboTexto = (pedido: Pedido) => {
    if (!loja) return;
    const msg = PrintService.generateWhatsAppMessage(pedido, loja);
    navigator.clipboard.writeText(msg);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleEditarPedido = (pedido: Pedido) => {
    if (pedido.status !== 'pendente') {
      mostrarAviso('A alteração completa de produtos só é permitida para pedidos com status Pendente.', 'Edição Restrita');
      return;
    }
    carregarPedidoParaEdicao(pedido);
    navigate('/pos');
  };

  const contagensPorStatus = useMemo(() => {
    const counts: Record<string, number> = {
      todos: 0,
      pendente: 0,
      confirmado: 0,
      em_separacao: 0,
      em_producao: 0,
      em_expedicao: 0,
      saiu_para_entrega: 0,
      pronto_para_retirar: 0,
      cancelado: 0
    };

    pedidos.forEach((p) => {
      // Tudo com status diferente de 'concluido' é pedido aberto / ativo (conta em 'todos')
      if (p.status !== 'concluido') {
        counts.todos += 1;
      }
      if (counts[p.status] !== undefined) {
        counts[p.status] += 1;
      }
    });

    return counts;
  }, [pedidos]);

  const pedidosAbertosCount = useMemo(() => {
    return pedidos.filter((p) =>
      ['pendente', 'confirmado', 'em_separacao', 'em_producao', 'em_expedicao', 'saiu_para_entrega', 'pronto_para_retirar'].includes(p.status)
    ).length;
  }, [pedidos]);

  const pedidosFiltrados = useMemo(() => {
    return pedidos
      .filter((p) => {
        if (p.status === 'concluido') return false;

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
          p.itens?.some((i) => i.nome_produto.toLowerCase().includes(termo));

        return matchStatus && matchBusca;
      })
      .sort((a, b) => {
        let valA: any = 0;
        let valB: any = 0;

        if (campoOrdenacao === 'data') {
          valA = new Date(a.data_venda || a.criado_em || '').getTime();
          valB = new Date(b.data_venda || b.criado_em || '').getTime();
        } else if (campoOrdenacao === 'valor') {
          valA = Number(a.valor_total || 0);
          valB = Number(b.valor_total || 0);
        } else if (campoOrdenacao === 'codigo') {
          valA = Number(a.numero_pedido || 0);
          valB = Number(b.numero_pedido || 0);
        }

        if (valA < valB) return direcaoOrdenacao === 'asc' ? -1 : 1;
        if (valA > valB) return direcaoOrdenacao === 'asc' ? 1 : -1;
        return 0;
      });
  }, [pedidos, statusFiltro, busca, campoOrdenacao, direcaoOrdenacao]);

  const toggleOrdenacao = (campo: OrdenacaoCampo) => {
    if (campoOrdenacao === campo) {
      setDirecaoOrdenacao(direcaoOrdenacao === 'asc' ? 'desc' : 'asc');
    } else {
      setCampoOrdenacao(campo);
      setDirecaoOrdenacao('desc');
    }
  };

  const formatarData = (dataStr: string) => {
    try {
      const d = new Date(dataStr);
      return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return dataStr;
    }
  };

  const calcularTotalItens = (pedido: Pedido) => {
    const itens = pedido.itens || pedido.itens_pedido || [];
    return itens.reduce((acc, i) => acc + Number(i.quantidade || 1), 0);
  };

  const calcularLucroEstimado = (pedido: Pedido) => {
    const itens = pedido.itens || pedido.itens_pedido || [];
    const totalVenda = Number(pedido.valor_total || 0);
    const custoTotal = itens.reduce((acc, i) => {
      const custo = Number(i.preco_custo_unitario || (i.preco_venda_unitario * 0.5));
      return acc + (custo * Number(i.quantidade || 1));
    }, 0);
    return Math.max(0, totalVenda - custoTotal);
  };

  const enderecoLojaFormatado = [
    loja?.endereco_logradouro,
    loja?.endereco_numero,
    loja?.endereco_bairro,
    loja?.endereco_cidade
  ].filter(Boolean).join(', ') || 'Endereço da Loja';

  const logoLojaUrl = loja?.url_logo || (loja as any)?.logo_url;

  const getStatusBadge = (status: StatusPedido) => {
    switch (status) {
      case 'pendente':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">🟡 Pendente</span>;
      case 'confirmado':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">🟢 Confirmado</span>;
      case 'em_producao':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">🔵 Em produção</span>;
      case 'saiu_para_entrega':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">🚚 Saiu para Entrega</span>;
      case 'pronto_para_retirar':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-500/15 text-teal-400 border border-teal-500/30">🏪 Pronto Retirada</span>;
      case 'cancelado':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">❌ Cancelado</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 capitalize">{status.replace('_', ' ')}</span>;
    }
  };

  const getStatusPagamentoBadge = (status: StatusPagamento) => {
    switch (status) {
      case 'pago':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">🟢 Pago</span>;
      case 'parcialmente_pago':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">🟡 Parcial</span>;
      case 'aguardando_pagamento':
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">🕒 Aguardando pagamento</span>;
    }
  };

  return (
    <>
      {/* VISÃO MOBILE DE PEDIDOS (CONFORME TELA001 A TELA010 DISPONIBILIZADAS) */}
      <div className="md:hidden h-full flex flex-col overflow-hidden bg-slate-900 text-slate-100">
        <PedidosListaMobile
          pedidos={pedidos}
          clientes={clientes}
          usuarios={usuarios}
          carregando={carregando}
          onAlterarStatus={atualizarStatus}
          onCancelarPedido={(ped) => atualizarStatus(ped.id, 'cancelado')}
          onAbrirReceberPagamento={(ped) => setPedidoReceberModal(ped)}
          onAbrirDrawerMenu={() => {}}
          onClienteAtualizado={() => carregarPedidos()}
          onRecarregar={carregarPedidos}
        />
      </div>

      {/* VISÃO DESKTOP DE PEDIDOS */}
      <div className="hidden md:flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
        {/* SE UM PEDIDO ESTIVER SELECIONADO: EXIBIR A VISÃO DETALHADA DO PEDIDO (TELA002, TELA002A, TELA002B) */}
        {pedidoSelecionado ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-150 max-w-7xl mx-auto w-full">
          {/* HEADER DA VISÃO DETALHADA DO PEDIDO (TELA002) */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800 bg-slate-950/90 sticky top-0 z-20 backdrop-blur">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPedidoSelecionado(null)}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                title="Voltar para a lista de pedidos"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl md:text-2xl font-black text-slate-100 flex items-center gap-2">
                  <span>Pedido #{pedidoSelecionado.origem === 'catalogo_online' ? `c-${pedidoSelecionado.numero_pedido}` : pedidoSelecionado.numero_pedido}</span>
                  <span className="text-emerald-400 font-bold text-lg">Total R$ {Number(pedidoSelecionado.valor_total || 0).toFixed(2)}</span>
                </h1>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>{formatarData(pedidoSelecionado.data_venda || pedidoSelecionado.criado_em || '')}</span>
                  {pedidoSelecionado.vendedor?.nome_completo && (
                    <>
                      <span>•</span>
                      <span>{pedidoSelecionado.vendedor.nome_completo}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Ações Rápidas do Topo: Link de Andamento, Cancelar, Concluir Venda (TELA002) */}
            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              {/* Seletor de Status Interativo */}
              <div className="relative inline-block">
                <select
                  value={pedidoSelecionado.status}
                  onChange={(e) => atualizarStatus(pedidoSelecionado.id, e.target.value as StatusPedido)}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer appearance-none pr-8"
                >
                  {STATUS_PEDIDO_OPCOES.filter((op) => op.id !== 'concluido').map((op) => (
                    <option key={op.id} value={op.id}>
                      Status: {op.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Botão Copiar Link e Compartilhar no WhatsApp (TELA002) */}
              <button
                type="button"
                onClick={() => handleCopiarLinkAndamento(pedidoSelecionado)}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 transition flex items-center gap-1.5 cursor-pointer"
                title="Copiar link da página de andamento do pedido"
              >
                <Copy className="w-3.5 h-3.5 text-emerald-400" />
                <span>{copiado ? 'Copiado!' : 'Copiar link'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleCompartilharWhatsApp(pedidoSelecionado)}
                className="px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-xs font-bold text-emerald-400 transition flex items-center gap-1.5 cursor-pointer"
                title="Compartilhar link de andamento no WhatsApp"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </button>

              {/* Botão Cancelar Pedido (TELA004) */}
              <button
                type="button"
                onClick={() => setModalCancelarPedidoAberto(true)}
                className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition cursor-pointer"
                title="Cancelar pedido"
              >
                <Ban className="w-4 h-4" />
              </button>

              {/* Botão Principal Concluir Venda (TELA005) */}
              {resolverStatusPagamento(pedidoSelecionado) !== 'pago' ? (
                <button
                  type="button"
                  onClick={() => setPedidoReceberModal(pedidoSelecionado)}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Receber Pagamento</span>
                </button>
              ) : pedidoSelecionado.status !== 'concluido' ? (
                <button
                  type="button"
                  onClick={() => atualizarStatus(pedidoSelecionado.id, 'concluido')}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  <span>Concluir Pedido</span>
                </button>
              ) : (
                <div className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Pago e Concluído</span>
                </div>
              )}
            </div>
          </div>

          {/* GRID PRINCIPAL: COLUNA ESQUERDA (CLIENTE, OBS, ITENS) + COLUNA DIREITA (RESUMO, PAGAMENTO, RECIBO, HISTÓRICO) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* COLUNA ESQUERDA (7 colunas) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Card Cliente (TELA002) */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente</span>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <select
                        value={pedidoSelecionado.cliente_id || 'avulso'}
                        onChange={(e) => handleAlterarClientePedido(e.target.value)}
                        className="bg-slate-950 border border-slate-700 hover:border-emerald-500 rounded-xl pl-2.5 pr-7 py-1 text-xs font-bold text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer appearance-none max-w-[170px] truncate"
                        title="Alterar cliente do pedido"
                      >
                        <option value="avulso">Cliente Avulso (Balcão)</option>
                        {clientes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    <button
                      type="button"
                      onClick={() => setModalNovoClienteAberto(true)}
                      className="p-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 border border-emerald-500/30 transition cursor-pointer"
                      title="Adicionar novo cliente"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-slate-800 border border-slate-700 text-slate-200 font-black text-sm flex items-center justify-center">
                      {pedidoSelecionado.cliente?.nome
                        ? pedidoSelecionado.cliente.nome.slice(0, 2).toUpperCase()
                        : 'AV'}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-100">
                        {pedidoSelecionado.cliente?.nome || 'Cliente Avulso (Balcão)'}
                      </h4>
                      {pedidoSelecionado.cliente?.whatsapp || pedidoSelecionado.cliente?.telefone ? (
                        <a
                          href={`https://wa.me/55${(pedidoSelecionado.cliente.whatsapp || pedidoSelecionado.cliente.telefone || '').replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-emerald-400 hover:underline inline-flex items-center gap-1.5 mt-0.5"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>+{pedidoSelecionado.cliente.whatsapp || pedidoSelecionado.cliente.telefone}</span>
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500">Sem telefone cadastrado</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Observação (TELA002) */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Observação</span>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Digite aqui uma observação para o pedido..."
                    value={observacaoTexto}
                    onChange={(e) => setObservacaoTexto(e.target.value)}
                    onBlur={handleSalvarObservacao}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exibirObsRecibo}
                      onChange={(e) => setExibirObsRecibo(e.target.checked)}
                      className="rounded text-emerald-500 focus:ring-emerald-500 border-slate-700 bg-slate-950"
                    />
                    <span>Exibir no recibo</span>
                  </label>
                </div>
              </div>

              {/* Card Itens do Pedido (TELA002 / TELA002A) */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-sm font-bold text-slate-100">
                    {pedidoSelecionado.itens?.length || 0} itens no pedido
                  </span>
                  <button
                    type="button"
                    onClick={() => handleEditarPedido(pedidoSelecionado)}
                    className="text-xs text-emerald-400 hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>
                </div>

                <div className="divide-y divide-slate-800/60">
                  {pedidoSelecionado.itens?.map((item, idx) => (
                    <div
                      key={idx}
                      className="py-3 flex items-center justify-between gap-3 group hover:bg-slate-800/30 px-2 rounded-xl transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                          <Package className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-emerald-400 text-xs">{item.quantidade}x</span>
                            <span className="text-xs font-bold text-slate-100 truncate">{item.nome_produto}</span>
                          </div>
                          {item.rotulo_variacao && (
                            <span className="text-[10px] text-slate-400 block">
                              Variação: {item.rotulo_variacao}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-slate-100 block">
                          R$ {Number(item.subtotal || item.preco_venda_unitario * item.quantidade || 0).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          R$ {Number(item.preco_venda_unitario || 0).toFixed(2)} un
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* COLUNA DIREITA (5 colunas): RESUMO, PAGAMENTO, RECIBO PREVIEW, HISTÓRICO */}
            <div className="lg:col-span-5 space-y-6">
              {/* Card Resumo do Pedido (TELA002) */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Resumo do pedido</span>
                  <button
                    type="button"
                    onClick={() => handleEditarPedido(pedidoSelecionado)}
                    className="text-xs text-emerald-400 hover:underline font-bold cursor-pointer"
                  >
                    Editar
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span>Subtotal de produtos</span>
                    <span className="font-bold">
                      R$ {Number(pedidoSelecionado.subtotal || pedidoSelecionado.valor_total || 0).toFixed(2)}
                    </span>
                  </div>

                  {Number(pedidoSelecionado.valor_desconto || 0) > 0 && (
                    <div className="flex justify-between text-rose-400 font-semibold">
                      <span>Desconto</span>
                      <span>-R$ {Number(pedidoSelecionado.valor_desconto).toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-base font-black text-slate-100 pt-2 border-t border-slate-800">
                    <span>Total</span>
                    <span className="text-emerald-400">
                      R$ {Number(pedidoSelecionado.valor_total || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* Lucro Estimado (TELA002) */}
                  <div className="text-right pt-1">
                    <span className="text-[11px] font-bold text-emerald-400">
                      Lucro estimado: R$ {calcularLucroEstimado(pedidoSelecionado).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Meios de Pagamento (TELA002) */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Meios de pagamento</span>
                  <button
                    type="button"
                    onClick={() => setPedidoReceberModal(pedidoSelecionado)}
                    className="text-xs text-emerald-400 hover:underline font-bold cursor-pointer"
                  >
                    Editar
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2 text-slate-200 font-bold">
                    <Coins className="w-4 h-4 text-emerald-400" />
                    <span className="capitalize">
                      {pedidoSelecionado.pagamentos && pedidoSelecionado.pagamentos.length > 0
                        ? pedidoSelecionado.pagamentos[pedidoSelecionado.pagamentos.length - 1]?.forma_pagamento?.nome || 'Dinheiro / Pix'
                        : 'Dinheiro / Pix'}
                    </span>
                  </div>
                  <span className="font-black text-slate-100">
                    R$ {Number(pedidoSelecionado.valor_total || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Card Recibo Preview (TELA002A) */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recibo</span>
                  <button
                    type="button"
                    onClick={() => setPedidoReciboModal(pedidoSelecionado)}
                    className="text-xs text-emerald-400 hover:underline font-bold cursor-pointer"
                  >
                    Ver completo
                  </button>
                </div>

                {/* Mini Preview do Recibo */}
                <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 text-center space-y-2">
                  {logoLojaUrl ? (
                    <img src={logoLojaUrl} alt="Logo" className="h-8 max-w-[120px] object-contain mx-auto" />
                  ) : (
                    <Store className="w-6 h-6 text-emerald-400 mx-auto" />
                  )}
                  <p className="text-xs font-black text-slate-200">
                    RECIBO #{pedidoSelecionado.numero_pedido}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {loja?.nome_fantasia || 'HUBI PDV'} • {loja?.whatsapp || loja?.telefone}
                  </p>
                </div>

                {/* Botões de Ação do Recibo (TELA002A) */}
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopiarReciboTexto(pedidoSelecionado)}
                    className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs flex flex-col items-center justify-center transition cursor-pointer"
                    title="Copiar texto do recibo"
                  >
                    <Copy className="w-4 h-4 mb-0.5 text-emerald-400" />
                    <span className="text-[10px]">{copiado ? 'Copiado' : 'Copiar'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => PrintService.printReceipt(pedidoSelecionado, loja, 'a4')}
                    className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs flex flex-col items-center justify-center transition cursor-pointer"
                    title="Baixar PDF / A4"
                  >
                    <Download className="w-4 h-4 mb-0.5 text-sky-400" />
                    <span className="text-[10px]">PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCompartilharWhatsApp(pedidoSelecionado)}
                    className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs flex flex-col items-center justify-center transition cursor-pointer"
                    title="Enviar recibo pelo WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4 mb-0.5 text-emerald-400" />
                    <span className="text-[10px]">WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => PrintService.printReceipt(pedidoSelecionado, loja, '80mm')}
                    className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs flex flex-col items-center justify-center transition shadow cursor-pointer font-bold"
                    title="Imprimir recibo térmico"
                  >
                    <Printer className="w-4 h-4 mb-0.5" />
                    <span className="text-[10px]">Imprimir</span>
                  </button>
                </div>
              </div>

              {/* Card Histórico do Pedido (TELA002B) */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-800 pb-2">
                  Histórico do Pedido
                </span>

                <div className="space-y-3 text-xs">
                  {extrairHistoricoPedido(pedidoSelecionado).map((item, idx, arr) => {
                    const isLast = idx === arr.length - 1;
                    const rotuloStatus = STATUS_PEDIDO_OPCOES.find((s) => s.id === item.status)?.label || item.status;
                    return (
                      <div key={idx} className="flex items-start gap-2.5">
                        <div
                          className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${
                            isLast ? 'bg-emerald-400 ring-4 ring-emerald-400/20' : 'bg-slate-600'
                          }`}
                        />
                        <div>
                          <p className={`font-bold capitalize ${isLast ? 'text-emerald-400' : 'text-slate-300'}`}>
                            {rotuloStatus}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-normal">
                            <span>{formatarData(item.data)}</span>
                            {item.usuario && <span>• Por {item.usuario}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* SE NENHUM PEDIDO ESTIVER SELECIONADO: EXIBIR A TABELA PRINCIPAL DE PEDIDOS (TELA001) */
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* HEADER DA LISTAGEM DE PEDIDOS (TELA001) */}
          <div className="p-4 md:p-6 pb-2 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-black text-slate-100 flex items-center gap-2">
                    <span>{pedidosAbertosCount} pedidos abertos</span>
                  </h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {pedidosFiltrados.length} pedidos listados • Tempo real
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSomAtivo(!somAtivo)}
                  className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    somAtivo
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                  title={somAtivo ? 'Som de novos pedidos ativado' : 'Som desativado'}
                >
                  {somAtivo ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  <span className="hidden sm:inline">{somAtivo ? 'Som Ativo' : 'Mudo'}</span>
                </button>
              </div>
            </div>

            {/* Barra de Pesquisa e Filtros Rápidos (TELA001) */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
              <div className="relative w-full md:w-48 lg:w-56 shrink-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Item ou cliente..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
                {busca && (
                  <button
                    onClick={() => setBusca('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex-1 flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                {ABAS_STATUS.map((f) => {
                  const count = contagensPorStatus[f.id] || 0;
                  const isActive = statusFiltro === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setStatusFiltro(f.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-emerald-500 text-slate-950 shadow-sm font-bold'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      <span>{f.label}</span>
                      <span
                        className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-slate-950/25 text-slate-950'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* TABELA DE PEDIDOS (TELA001) */}
          <div className="flex-1 overflow-auto p-4 md:p-6">
            {carregando ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                <p className="text-sm">Carregando pedidos...</p>
              </div>
            ) : pedidosFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-2">
                <Package className="w-10 h-10 stroke-1" />
                <p className="text-sm font-medium">Nenhum pedido encontrado com os filtros selecionados.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px] tracking-wider bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
                    <th
                      className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-200 transition min-w-[120px]"
                      onClick={() => toggleOrdenacao('codigo')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Código</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-200 transition min-w-[140px]"
                      onClick={() => toggleOrdenacao('data')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Data</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4 font-semibold min-w-[160px]">Cliente</th>
                    <th className="py-3 px-4 font-semibold min-w-[130px]">Vendedor</th>
                    <th className="py-3 px-4 font-semibold text-center min-w-[90px]">Itens</th>
                    <th
                      className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-200 transition min-w-[110px]"
                      onClick={() => toggleOrdenacao('valor')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Valor</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4 font-semibold text-center min-w-[150px]">Status Pedido</th>
                    <th className="py-3 px-4 font-semibold text-center min-w-[160px]">Status Pagamento</th>
                    <th className="py-3 px-4 font-semibold text-center min-w-[130px]">Tipo da Venda</th>
                    <th className="py-3 px-4 font-semibold text-center min-w-[150px]">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pedidosFiltrados.map((pedido) => {
                    const isCancelado = pedido.status === 'cancelado';
                    const totalItens = calcularTotalItens(pedido);
                    const isCatalogo = pedido.origem === 'catalogo_online';
                    const statusPag = resolverStatusPagamento(pedido);

                    return (
                      <tr
                        key={pedido.id}
                        className={`transition group hover:bg-slate-900/60 ${isCancelado ? 'opacity-60' : ''}`}
                      >
                        <td className="py-3.5 px-4 whitespace-nowrap font-medium">
                          <div className="flex items-center gap-2">
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
                            <button
                              type="button"
                              title="Abrir Detalhes do Pedido (TELA002)"
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

                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-300">
                          <span className={isCancelado ? 'line-through' : ''}>
                            {formatarData(pedido.data_venda || pedido.criado_em || '')}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-semibold text-slate-200">
                            {pedido.cliente?.nome || 'Cliente Avulso (Balcão)'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            <span>{pedido.vendedor?.nome_completo || 'Catálogo Online'}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-center">
                          <button
                            type="button"
                            onClick={() => setPedidoItensModal(pedido)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition cursor-pointer"
                          >
                            <Package className="w-3 h-3" />
                            <span>{totalItens} itens</span>
                          </button>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-black text-slate-100">
                            R$ {Number(pedido.valor_total || 0).toFixed(2)}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-center">
                          {getStatusBadge(pedido.status)}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-center">
                          {getStatusPagamentoBadge(statusPag)}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-center text-slate-300 capitalize font-medium">
                          {pedido.tabela_preco_aplicada || 'Varejo'}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {pedido.status === 'pendente' ? (
                              <button
                                type="button"
                                onClick={() => handleEditarPedido(pedido)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                <span>Alterar</span>
                              </button>
                            ) : statusPag !== 'pago' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setPedidoReceberModal(pedido);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 cursor-pointer"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                                <span>Receber</span>
                              </button>
                            ) : pedido.status !== 'concluido' ? (
                              <button
                                type="button"
                                onClick={() => atualizarStatus(pedido.id, 'concluido')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition cursor-pointer active:scale-95"
                                title="Concluir Pedido"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                <span>Concluir Pedido</span>
                              </button>
                            ) : (
                              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Concluído</span>
                              </div>
                            )}
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
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CANCELAR PEDIDO? (TELA004)                                      */}
      {/* ========================================================================= */}
      {modalCancelarPedidoAberto && pedidoSelecionado && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl animate-in zoom-in-95 text-center">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold text-slate-200">
                R$ {Number(pedidoSelecionado.valor_total || 0).toFixed(2)} para{' '}
                {pedidoSelecionado.cliente?.nome || 'Cliente Balcão'}
              </span>
              <button
                type="button"
                onClick={() => setModalCancelarPedidoAberto(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="w-14 h-14 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center mx-auto">
              <Ban className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-100">Cancelar pedido?</h3>
              <p className="text-xs text-slate-400">Este pedido não poderá ser alterado.</p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalCancelarPedidoAberto(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition cursor-pointer"
              >
                Voltar
              </button>

              <button
                type="button"
                onClick={handleConfirmarCancelarPedido}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                Cancelar pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* GAVETA 2: CONCLUIR VENDA (TELA005)                                       */}
      {/* ========================================================================= */}
      {gavetaConcluirVendaAberta && pedidoSelecionado && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <h3 className="text-base font-bold text-slate-100">Concluir venda</h3>
              <button
                type="button"
                onClick={() => setGavetaConcluirVendaAberta(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div>
                <h4 className="text-2xl font-black text-slate-100">
                  R$ {Number(pedidoSelecionado.valor_total || 0).toFixed(2)}
                </h4>
                <p className="text-xs text-slate-400">
                  de {pedidoSelecionado.cliente?.nome || 'Cliente Avulso (Balcão)'}
                </p>
              </div>

              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-300 block">Selecione o meio de pagamento</span>

                <div className="space-y-2">
                  {[
                    { id: 'dinheiro', label: 'Dinheiro', icon: Coins },
                    { id: 'cartao_debito', label: 'Cartão de Débito', icon: CreditCard },
                    { id: 'cartao_credito', label: 'Cartão de Crédito', icon: CreditCard },
                    { id: 'pix', label: 'Pix', icon: Wallet },
                    { id: 'fiado', label: 'Venda Fiado', icon: FileText },
                    { id: 'saldo_cliente', label: 'Saldo Cliente', icon: User },
                    { id: 'link_pagamento', label: 'Link de Pagamento', icon: ExternalLink },
                    { id: 'outros', label: 'Outros', icon: DollarSign }
                  ].map((m) => {
                    const IconComp = m.icon;
                    const isSel = meioPagamentoConclusao === m.id;
                    return (
                      <div
                        key={m.id}
                        onClick={() => setMeioPagamentoConclusao(m.id)}
                        className={`p-3 rounded-2xl border transition cursor-pointer flex flex-col gap-2 ${
                          isSel
                            ? 'bg-emerald-950/40 border-emerald-500/50'
                            : 'bg-slate-950/60 hover:bg-slate-800/60 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSel ? 'border-emerald-400 bg-emerald-500' : 'border-slate-600'}`}>
                            {isSel && <div className="w-1.5 h-1.5 rounded-full bg-slate-950"></div>}
                          </div>
                          <IconComp className={`w-4 h-4 ${isSel ? 'text-emerald-400' : 'text-slate-400'}`} />
                          <span className={`text-xs font-bold ${isSel ? 'text-slate-100' : 'text-slate-300'}`}>
                            {m.label}
                          </span>
                        </div>

                        {/* Se Dinheiro selecionado: input do valor recebido */}
                        {isSel && m.id === 'dinheiro' && (
                          <div className="pt-2 border-t border-slate-800/80">
                            <label className="text-[10px] text-slate-400 block mb-1">Valor recebido</label>
                            <input
                              type="text"
                              value={valorRecebidoConclusao}
                              onChange={(e) => setValorRecebidoConclusao(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-bold focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setGavetaConcluirVendaAberta(false)}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleSalvarMeioPagamento}
                disabled={salvandoConclusao}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 border border-emerald-500/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {salvandoConclusao ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                ) : (
                  <FileText className="w-4 h-4 text-emerald-400" />
                )}
                <span>Salvar</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmarConcluirVenda}
                disabled={salvandoConclusao}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-black text-white transition flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
              >
                {salvandoConclusao ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Concluindo...</span>
                  </>
                ) : (
                  <span>Concluir venda</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: RECIBO COMPLETO (TELA007 / TELA008)                             */}
      {/* ========================================================================= */}
      {pedidoReciboModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <h3 className="text-sm font-bold text-slate-100">
                Recibo #{pedidoReciboModal.numero_pedido}
              </h3>
              <button
                type="button"
                onClick={() => setPedidoReciboModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/90 flex justify-center">
              <div className="w-full max-w-sm bg-white text-slate-900 rounded-xl p-5 shadow-2xl border border-slate-300 font-mono text-xs space-y-3">
                {/* Logo e Cabeçalho do Recibo */}
                <div className="text-center space-y-1 border-b border-slate-300 border-dashed pb-3">
                  {logoLojaUrl ? (
                    <img src={logoLojaUrl} alt="Logo" className="h-10 max-w-[160px] object-contain mx-auto mb-2" />
                  ) : (
                    <Store className="w-8 h-8 text-slate-700 mx-auto mb-1" />
                  )}
                  <h4 className="font-black text-sm text-slate-950 uppercase">{loja?.nome_fantasia || 'HUBI PDV'}</h4>
                  <p className="text-[11px] text-slate-600">{enderecoLojaFormatado}</p>
                  <p className="text-[11px] text-slate-600">{loja?.whatsapp || loja?.telefone}</p>
                </div>

                {/* Número e Data */}
                <div className="flex justify-between items-center text-[11px] text-slate-600 border-b border-slate-200 border-dashed pb-2">
                  <span className="font-bold text-slate-900">RECIBO #{pedidoReciboModal.numero_pedido}</span>
                  <span>{formatarData(pedidoReciboModal.data_venda || pedidoReciboModal.criado_em || '')}</span>
                </div>

                {/* Vendedor / Canal (Antes do Cliente) */}
                <div className="space-y-0.5 border-b border-slate-300 border-dashed pb-2 text-[11px]">
                  <span className="text-slate-500 font-semibold">
                    {pedidoReciboModal.origem === 'catalogo_online' ? 'Canal / Vendedor:' : 'Vendedor:'}
                  </span>
                  <p className="font-bold text-slate-900">
                    {pedidoReciboModal.origem === 'catalogo_online'
                      ? 'Catálogo Online (Pedido Online)'
                      : pedidoReciboModal.vendedor?.nome_completo || 'Caixa / Balcão'}
                  </p>
                </div>

                {/* Cliente */}
                <div className="space-y-0.5 border-b border-slate-300 border-dashed pb-2 text-[11px]">
                  <span className="text-slate-500 font-semibold">Cliente:</span>
                  <p className="font-bold text-slate-900">{pedidoReciboModal.cliente?.nome || 'Cliente Avulso (Balcão)'}</p>
                  {pedidoReciboModal.cliente?.whatsapp && <p className="text-slate-600">{pedidoReciboModal.cliente.whatsapp}</p>}
                </div>

                {/* Itens */}
                <div className="space-y-2 border-b border-slate-300 border-dashed pb-2">
                  <span className="font-bold text-slate-600 uppercase tracking-wider text-[10px] block">
                    Itens ({calcularTotalItens(pedidoReciboModal)} un)
                  </span>
                  {pedidoReciboModal.itens?.map((item, idx) => (
                    <div key={idx} className="flex justify-between py-0.5 text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-950">{item.quantidade}x</span>
                        <span className="text-slate-800">{item.nome_produto}</span>
                      </div>
                      <span className="font-bold text-slate-900 whitespace-nowrap pl-2">
                        R$ {Number(item.subtotal || item.preco_venda_unitario * item.quantidade || 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Totais */}
                <div className="space-y-1 text-xs text-slate-700">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-slate-900">R$ {Number(pedidoReciboModal.subtotal || pedidoReciboModal.valor_total || 0).toFixed(2)}</span>
                  </div>
                  {Number(pedidoReciboModal.valor_desconto || 0) > 0 && (
                    <div className="flex justify-between text-red-600 font-bold">
                      <span>Desconto:</span>
                      <span>-R$ {Number(pedidoReciboModal.valor_desconto).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(pedidoReciboModal.valor_frete || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>Taxa de Entrega:</span>
                      <span className="font-semibold">+R$ {Number(pedidoReciboModal.valor_frete).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-slate-950 pt-2 border-t border-slate-900">
                    <span>TOTAL:</span>
                    <span>R$ {Number(pedidoReciboModal.valor_total || 0).toFixed(2)}</span>
                  </div>

                  {/* Dados do Pagamento (Após o Valor Total) */}
                  {(() => {
                    const pagInfo = obterDadosPagamentoRecibo(pedidoReciboModal);
                    return (
                      <>
                        {pagInfo.ehFiado && Number(pedidoReciboModal.saldo_devedor || 0) > 0 && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-center space-y-0.5">
                            <span className="text-[10px] font-bold text-red-800 uppercase tracking-wider block">Saldo a Pagar (Fiado)</span>
                            <span className="text-sm font-black text-red-600">R$ {Number(pedidoReciboModal.saldo_devedor).toFixed(2)}</span>
                          </div>
                        )}

                        <div className={`mt-2.5 p-2.5 rounded-lg border text-xs ${pagInfo.foiPago ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex justify-between items-center pb-1.5 border-b border-dashed border-slate-300">
                          <span className="font-bold text-[10px] text-slate-700 uppercase">Status Pagamento:</span>
                          <span className={`font-black text-[10px] px-1.5 py-0.5 rounded ${pagInfo.foiPago ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {pagInfo.foiPago ? '✓ PAGO' : 'AGUARDANDO PAGAMENTO'}
                          </span>
                        </div>
                        {pagInfo.foiPago && pagInfo.pagamentosDetalhados.length > 0 ? (
                          <div className="space-y-1.5 pt-1.5 text-slate-800">
                            {pagInfo.pagamentosDetalhados.map((pag, idx) => (
                              <div key={idx} className="flex justify-between items-start text-[11px]">
                                <div>
                                  <span className="font-semibold">{pag.forma}</span>
                                  {pag.origemGateway && (
                                    <span className="text-[10px] text-sky-700 block font-medium">Origem: {pag.origemGateway}</span>
                                  )}
                                </div>
                                <span className="font-bold text-slate-900">R$ {pag.valor.toFixed(2)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between font-extrabold text-emerald-900 pt-1.5 border-t border-emerald-200 text-xs">
                              <span>Valor Pago:</span>
                              <span>R$ {pagInfo.totalPago.toFixed(2)}</span>
                            </div>
                          </div>
                        ) : null}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Footer do Modal de Recibo com Ações e Link "Editar meu recibo" (TELA007 / TELA010) */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setModalConfigurarReciboAberto(true)}
                className="text-xs text-emerald-400 hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Editar meu recibo</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => PrintService.printReceipt(pedidoReciboModal, loja, '80mm')}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition cursor-pointer"
                >
                  Térmica 58/80mm
                </button>

                <button
                  type="button"
                  onClick={() => PrintService.printReceipt(pedidoReciboModal, loja, 'a4')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition shadow cursor-pointer"
                >
                  Imprimir A4
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: EDITAR DESCONTO                                                 */}
      {/* ========================================================================= */}
      {modalDescontoAberto && pedidoSelecionado && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-slate-100">Editar Desconto</h3>
              <button
                type="button"
                onClick={() => setModalDescontoAberto(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Valor do desconto (R$)</label>
              <input
                type="text"
                value={novoDescontoValor}
                onChange={(e) => setNovoDescontoValor(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-bold focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalDescontoAberto(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvarDesconto}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-xs font-bold text-white"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURAR RECIBO (TELA010) */}
      <ModalConfigurarRecibo
        aberto={modalConfigurarReciboAberto}
        onClose={() => setModalConfigurarReciboAberto(false)}
      />

      {/* MODAL DE ITENS DO PEDIDO (TELA008) */}
      <ModalItensPedido
        isOpen={!!pedidoItensModal}
        pedido={pedidoItensModal}
        onClose={() => setPedidoItensModal(null)}
        onConsultarProduto={handleConsultarProduto}
      />

      {/* MODAL DE DETALHES DO PRODUTO */}
      <ModalDetalhesProduto
        isOpen={!!produtoDetalhesModal}
        produto={produtoDetalhesModal}
        onClose={() => setProdutoDetalhesModal(null)}
      />

      {/* MODAL DE RECEBER PAGAMENTO */}
      <ModalReceberPagamento
        isOpen={!!pedidoReceberModal}
        pedido={pedidoReceberModal}
        onClose={() => setPedidoReceberModal(null)}
        onPagamentoConcluido={(pedidoAtualizado) => {
          setPedidoReceberModal(null);
          if (pedidoAtualizado && pedidoSelecionado?.id === pedidoAtualizado.id) {
            setPedidoSelecionado(pedidoAtualizado);
          }
          carregarPedidos();
        }}
      />

      {/* MODAL NOVO CLIENTE */}
      <ModalNovoCliente
        isOpen={modalNovoClienteAberto}
        onClose={() => setModalNovoClienteAberto(false)}
        onClienteCadastrado={handleClienteCriado}
      />
      </div>
    </>
  );
};
