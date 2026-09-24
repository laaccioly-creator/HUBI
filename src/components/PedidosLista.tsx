import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Plus,
  AlertTriangle,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCart } from '../contexts/CartContext';
import { ShippingOrchestrator } from '../services/shippingOrchestrator';
import { Pedido, StatusPedido, StatusPagamento, TabelaPreco, ItemPedido, Produto, Cliente, UsuarioLoja } from '../types';
import { PedidoEntrega } from '../types/shipping';
import { PrintService, formatarDataRecibo, obterDadosPagamentoRecibo } from '../services/printService';
import { extrairObservacaoLimpa } from '../utils/formatters';
import { validarRastreioCorreios, detectarServicoPorCodigo } from '../utils/correiosValidator';
import { audioService } from '../services/audioService';
import { obterDataOperacaoISO } from '../utils/dataOperacao';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { ModalNovoCliente } from './ModalNovoCliente';
import { ModalItensPedido } from './ModalItensPedido';
import { ModalDetalhesProduto } from './ModalDetalhesProduto';
import { ModalPagamentoFechamento } from './ModalPagamentoFechamento';
import { ModalReceberFiado } from './ModalReceberFiado';
import { ModalConfigurarRecibo } from './ModalConfigurarRecibo';
import { ModalImprimirEtiqueta } from './shipping/ModalImprimirEtiqueta';
import { ModalRastreioPedido } from './shipping/ModalRastreioPedido';
import { ModalDefinirEnvio } from './pedidos/ModalDefinirEnvio';
import { ShippingFulfillmentSelector } from './shipping/ShippingFulfillmentSelector';
import { ShippingSelectionResult } from '../types/shipping';
import { PedidosListaMobile } from './PedidosListaMobile';
import {
  ROTULOS_STATUS_PEDIDO,
  isStatusPedidoAtivo,
  obterAbasStatusVisiveis,
  obterOpcoesStatusAlteracao,
  obterInfoVencimentoFiado,
  validarTransicaoStatusPedido,
  podeEditarPedido
} from '../utils/statusPedidoUtils';

type OrdenacaoCampo = 'data' | 'valor' | 'codigo';
type OrdenacaoDirecao = 'asc' | 'desc';

interface HistoricoItem {
  status: string;
  data: string;
  usuario?: string;
  tipo?: 'status' | 'edicao' | 'criacao';
  detalhes?: string;
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

  // Abas de status ativas conforme configurações da loja
  const abasStatus = useMemo(() => {
    return obterAbasStatusVisiveis(loja);
  }, [loja]);

  // Se o filtro selecionado for desativado nas configurações, reseta para 'todos'
  useEffect(() => {
    if (statusFiltro !== 'todos' && !abasStatus.some((a) => a.id === statusFiltro)) {
      setStatusFiltro('todos');
    }
  }, [abasStatus, statusFiltro]);
  
  // Parâmetros de URL (?id=... ou ?numero=... e ?origem=sales)
  const [searchParams, setSearchParams] = useSearchParams();
  const pedidoIdParam = searchParams.get('id');
  const numeroPedidoParam = searchParams.get('numero');
  const origemParam = searchParams.get('origem');

  // Modais e Detalhes
  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(null);

  const handleVoltarListaPedidos = () => {
    setPedidoSelecionado(null);
    if (origemParam === 'sales') {
      navigate('/sales');
    } else if (searchParams.has('id') || searchParams.has('numero') || searchParams.has('origem')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('id');
      nextParams.delete('numero');
      nextParams.delete('origem');
      setSearchParams(nextParams, { replace: true });
    }
  };

  // Opções de status permitidas para alteração no pedido selecionado
  const opcoesStatusSelecionado = useMemo(() => {
    return obterOpcoesStatusAlteracao(loja, pedidoSelecionado?.status, false);
  }, [loja, pedidoSelecionado?.status]);
  const [pedidoReciboModal, setPedidoReciboModal] = useState<Pedido | null>(null);
  const [pedidoEtiquetaModal, setPedidoEtiquetaModal] = useState<Pedido | null>(null);
  const [pedidoRastreioModal, setPedidoRastreioModal] = useState<Pedido | null>(null);
  const [pedidoEscolherEnvio, setPedidoEscolherEnvio] = useState<Pedido | null>(null);
  const [pedidoItensModal, setPedidoItensModal] = useState<Pedido | null>(null);
  const [pedidoReceberModal, setPedidoReceberModal] = useState<Pedido | null>(null);
  const [pedidoReceberFiadoModal, setPedidoReceberFiadoModal] = useState<Pedido | null>(null);
  const [concluirAposReceber, setConcluirAposReceber] = useState<boolean>(false);
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

  // Estados de Despacho Logístico e Contingência RBAC
  const [modalDespachoAberto, setModalDespachoAberto] = useState<boolean>(false);
  const [entregadorNomeDespacho, setEntregadorNomeDespacho] = useState<string>('');
  const [contatoEntregadorDespacho, setContatoEntregadorDespacho] = useState<string>('');
  const [codigoRastreioDespacho, setCodigoRastreioDespacho] = useState<string>('');
  const [linkRastreioDespacho, setLinkRastreioDespacho] = useState<string>('');
  const [pinEntregaDespacho, setPinEntregaDespacho] = useState<string>('');
  const [nomeAppDespacho, setNomeAppDespacho] = useState<string>('Uber');
  const [servicoCorreiosDespacho, setServicoCorreiosDespacho] = useState<'PAC' | 'SEDEX'>('SEDEX');
  const [nomeTransportadoraDespacho, setNomeTransportadoraDespacho] = useState<string>('');
  const [despachando, setDespachando] = useState<boolean>(false);
  const [modalContingenciaAberto, setModalContingenciaAberto] = useState<boolean>(false);
  const [executandoContingencia, setExecutandoContingencia] = useState<boolean>(false);
  const [entregaPedido, setEntregaPedido] = useState<PedidoEntrega | null>(null);

  // Modal para capturar CPF/CNPJ do cliente para o Melhor Envio sem travar o lojista
  const [modalCpfClienteAberto, setModalCpfClienteAberto] = useState<boolean>(false);
  const [cpfClienteInput, setCpfClienteInput] = useState<string>('');
  const [salvandoCpfEDespachando, setSalvandoCpfEDespachando] = useState<boolean>(false);
  const [pedidoPendenteDespacho, setPedidoPendenteDespacho] = useState<{ ped: Pedido; entrega: PedidoEntrega } | null>(null);

  useEffect(() => {
    if (pedidoSelecionado) {
      const raw = (pedidoSelecionado as any).pedido_entregas || pedidoSelecionado.pedido_entrega;
      if (raw && (Array.isArray(raw) ? raw.length > 0 : true)) {
        setEntregaPedido(Array.isArray(raw) ? raw[0] : raw);
      } else {
        ShippingOrchestrator.buscarPedidoEntrega(pedidoSelecionado.id).then((entrega) => {
          if (entrega) {
            setEntregaPedido(entrega);
            setPedidoSelecionado((prev) => (prev && prev.id === pedidoSelecionado.id ? { ...prev, pedido_entrega: entrega } : prev));
          }
        });
      }
    } else {
      setEntregaPedido(null);
    }
  }, [pedidoSelecionado?.id]);

  const [copiado, setCopiado] = useState<boolean>(false);
  const [somAtivo, setSomAtivo] = useState<boolean>(true);
  const [campoOrdenacao, setCampoOrdenacao] = useState<OrdenacaoCampo>('data');
  const [direcaoOrdenacao, setDirecaoOrdenacao] = useState<OrdenacaoDirecao>('desc');

  // Seleciona pedido automaticamente se fornecido via parâmetro na URL (?id=... ou ?numero=...)
  useEffect(() => {
    if (!pedidoIdParam && !numeroPedidoParam) return;

    if (
      pedidoSelecionado &&
      (pedidoSelecionado.id === pedidoIdParam ||
        (numeroPedidoParam && String(pedidoSelecionado.numero_pedido) === String(numeroPedidoParam)))
    ) {
      return;
    }

    if (pedidos.length > 0) {
      const match = pedidos.find(
        (p) =>
          p.id === pedidoIdParam ||
          (numeroPedidoParam && String(p.numero_pedido) === String(numeroPedidoParam))
      );
      if (match) {
        setPedidoSelecionado(match);
        return;
      }
    }

    if (loja?.id && !carregando) {
      let q = supabase
        .from('pedidos')
        .select(`
          *,
          cliente:clientes(*),
          vendedor:usuarios_loja!pedidos_vendedor_id_fkey(*),
          atualizado_por_usuario:usuarios_loja!pedidos_atualizado_por_fkey(*),
          itens:itens_pedido(*),
          pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*)),
          pagamentos_previstos:pedidos_pagamentos_previstos(*),
          historico:historico_pedidos(*, usuario:usuarios_loja(*)),
          pedido_entregas(*)
        `)
        .eq('loja_id', loja.id);

      if (pedidoIdParam) {
        q = q.eq('id', pedidoIdParam);
      } else if (numeroPedidoParam) {
        q = q.eq('numero_pedido', Number(numeroPedidoParam));
      }

      q.maybeSingle().then(({ data, error }) => {
        if (!error && data) {
          const rawEntrega = (data as any).pedido_entregas || data.pedido_entrega;
          const pe = Array.isArray(rawEntrega) ? (rawEntrega[0] || null) : (rawEntrega || null);
          setPedidoSelecionado({
            ...data,
            pedido_entrega: pe,
            pedido_entregas: rawEntrega
          } as unknown as Pedido);
        }
      });
    }
  }, [pedidoIdParam, numeroPedidoParam, pedidos, loja?.id, carregando]);

  // Escuta reset de navegação do menu superior
  useEffect(() => {
    const handleMenuNav = (e: any) => {
      if (e.detail?.path === '/orders') {
        setPedidoSelecionado(null);
        if (searchParams.has('id') || searchParams.has('numero') || searchParams.has('origem')) {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete('id');
          nextParams.delete('numero');
          nextParams.delete('origem');
          setSearchParams(nextParams, { replace: true });
        }
      }
    };
    window.addEventListener('hubi_navegacao_menu', handleMenuNav);
    return () => window.removeEventListener('hubi_navegacao_menu', handleMenuNav);
  }, [searchParams]);


  const handleSalvarObservacao = async () => {
    if (!pedidoSelecionado || pedidoSelecionado.status === 'cancelado') return;
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

  const resolverProvedorEntrega = (
    pedido: Pedido | null,
    entregaState?: PedidoEntrega | null
  ): {
    prov: 'uber' | 'melhor_envio' | 'frete_proprio' | 'retirada_loja';
    provNome: string;
    pe: PedidoEntrega | null;
    rawPe: any;
    isRetirada: boolean;
  } => {
    if (!pedido) {
      return {
        prov: 'frete_proprio',
        provNome: 'Frete Próprio / Entrega Local',
        pe: null,
        rawPe: null,
        isRetirada: false
      };
    }

    const rawPe = entregaState || (pedido as any).pedido_entregas || pedido.pedido_entrega;
    const pe: PedidoEntrega | null = Array.isArray(rawPe) ? (rawPe[0] || null) : (rawPe || null);

    const meta = (pedido as any)?.metadados || {};
    const metaProvedor = String(meta.provedor_frete || '').toLowerCase();
    const metaTransp = String(meta.transportadora_nome || '').trim();
    const metaTipo = String(meta.tipo_atendimento || '').toLowerCase();

    const diretoProvedor = String((pedido as any)?.entrega_provedor || '').toLowerCase();
    const diretoTransp = String(
      (pedido as any)?.transportadora_nome ||
      (pedido as any)?.forma_entrega_nome ||
      (pedido as any)?.forma_entrega?.nome ||
      ''
    ).trim();

    const peProvedor = String(pe?.provedor || '').toLowerCase();
    const peTransp = String(pe?.transportadora_nome || '').trim();
    const peTipo = String(pe?.tipo_atendimento || '').toLowerCase();

    const textoConsolidado = `${metaProvedor} ${metaTransp} ${diretoProvedor} ${diretoTransp} ${peProvedor} ${peTransp} ${pedido.observacoes || ''}`.toLowerCase();

    const isRetirada =
      peTipo === 'retirada' ||
      metaTipo === 'retirada' ||
      diretoProvedor === 'retirada_loja' ||
      peProvedor === 'retirada_loja' ||
      textoConsolidado.includes('retirada na loja') ||
      textoConsolidado.includes('retirada') ||
      (!pe && !metaTransp && !diretoTransp && Number(pedido.valor_frete || 0) === 0 && !pedido.endereco_entrega);

    let prov: 'uber' | 'melhor_envio' | 'frete_proprio' | 'retirada_loja' = 'frete_proprio';
    let provNome = 'Frete Próprio / Entrega Local';

    const servicoCorreios =
      (pedido as any)?.servico_correios ||
      pe?.servico_correios ||
      (textoConsolidado.includes('sedex') ? 'SEDEX' : '') ||
      (textoConsolidado.includes('pac') ? 'PAC' : '') ||
      detectarServicoPorCodigo(pe?.codigo_rastreio || pedido.codigo_rastreio);

    const ehCorreios =
      peProvedor === 'correios' ||
      metaProvedor === 'correios' ||
      diretoProvedor === 'correios' ||
      pe?.tipo_operacao === 'correios' ||
      (pedido as any)?.tipo_operacao === 'correios' ||
      peTransp.toLowerCase().includes('correios') ||
      metaTransp.toLowerCase().includes('correios') ||
      diretoTransp.toLowerCase().includes('correios') ||
      Boolean(servicoCorreios);

    if (isRetirada) {
      prov = 'retirada_loja';
      provNome = 'Retirada na Loja';
    } else if (ehCorreios) {
      prov = 'frete_proprio';
      provNome = servicoCorreios ? `Correios (${servicoCorreios})` : 'Correios';
    } else if (
      peProvedor === 'frete_proprio' ||
      metaProvedor === 'frete_proprio' ||
      diretoProvedor === 'frete_proprio'
    ) {
      prov = 'frete_proprio';
      provNome = peTransp || metaTransp || diretoTransp || 'Frete Próprio / Entrega Local';
    } else if (
      peProvedor === 'uber' ||
      metaProvedor === 'uber' ||
      diretoProvedor === 'uber'
    ) {
      prov = 'uber';
      provNome = peTransp || metaTransp || diretoTransp || 'Uber Direct';
    } else if (
      peProvedor === 'melhor_envio' ||
      metaProvedor === 'melhor_envio' ||
      diretoProvedor === 'melhor_envio'
    ) {
      prov = 'melhor_envio';
      provNome = peTransp || metaTransp || diretoTransp || 'Melhor Envio';
    } else if (
      textoConsolidado.includes('uber direct') ||
      textoConsolidado.includes('uber flash')
    ) {
      prov = 'uber';
      provNome = peTransp || metaTransp || diretoTransp || 'Uber Direct';
    } else if (
      textoConsolidado.includes('melhor envio') ||
      textoConsolidado.includes('melhorenvio')
    ) {
      prov = 'melhor_envio';
      provNome = peTransp || metaTransp || diretoTransp || 'Melhor Envio';
    } else if (Number(pedido.valor_frete || 0) > 0 || pedido.endereco_entrega) {
      prov = 'frete_proprio';
      provNome = peTransp || metaTransp || diretoTransp || 'Frete Próprio / Entrega Local';
    }

    return { prov, provNome, pe, rawPe, isRetirada };
  };

  // Identificação e crítica em tempo real para despacho via Correios (SEDEX / PAC)
  const ehDespachoCorreios = useMemo(() => {
    if (!pedidoSelecionado) return false;
    const opTipo = entregaPedido?.tipo_operacao || (pedidoSelecionado as any)?.tipo_operacao || entregaPedido?.tipo_entrega;
    const { provNome, pe } = resolverProvedorEntrega(pedidoSelecionado, entregaPedido);
    return (
      opTipo === 'correios' ||
      pe?.tipo_operacao === 'correios' ||
      (pedidoSelecionado as any)?.tipo_operacao === 'correios' ||
      (pe?.provedor as any) === 'correios' ||
      provNome.toLowerCase().includes('correios') ||
      String((pedidoSelecionado as any).forma_entrega_nome || pedidoSelecionado.forma_entrega?.nome || '').toLowerCase().includes('correios') ||
      String(pedidoSelecionado.nome_transportadora || '').toLowerCase().includes('correios') ||
      String(entregaPedido?.transportadora_nome || '').toLowerCase().includes('correios') ||
      Boolean(pedidoSelecionado.servico_correios) ||
      Boolean(pe?.servico_correios)
    );
  }, [pedidoSelecionado, entregaPedido]);

  const validacaoCorreiosDespacho = useMemo(() => {
    if (!ehDespachoCorreios) {
      return { valido: true, motivo: '', codigoFormatado: codigoRastreioDespacho };
    }
    return validarRastreioCorreios(codigoRastreioDespacho, servicoCorreiosDespacho);
  }, [ehDespachoCorreios, codigoRastreioDespacho, servicoCorreiosDespacho]);

  const resolverStatusPagamento = (pedido: Pedido): StatusPagamento => {
    const temFiado = (pedido.pagamentos || []).some(
      (p: any) => p.eh_pagamento_fiado || p.forma_pagamento?.tipo === 'fiado'
    );
    if (temFiado && !pedido.fiado_quitado) {
      return 'fiado';
    }
    if (pedido.status_pagamento === 'pago') return 'pago';
    if (Number(pedido.saldo_devedor) <= 0 && Number(pedido.valor_pago) > 0) return 'pago';
    if (Number(pedido.valor_pago) > 0 && Number(pedido.saldo_devedor) > 0) return 'parcialmente_pago';
    if (pedido.status_pagamento) return pedido.status_pagamento;
    return 'aguardando_pagamento';
  };

  const extrairHistoricoPedido = (pedido: Pedido): HistoricoItem[] => {
    const itens: HistoricoItem[] = [];
    
    // 1. Tabela relacional historico_pedidos (Prioridade Máxima)
    if (Array.isArray(pedido.historico) && pedido.historico.length > 0) {
      pedido.historico.forEach(h => {
        itens.push({
          status: h.status_novo || h.tipo_evento,
          data: h.criado_em,
          usuario: h.usuario?.nome_completo || 'Operador',
          tipo: (h.tipo_evento === 'pedido_editado' || h.tipo_evento === 'edicao_pdv') ? 'edicao' : 'status',
          detalhes: h.descricao || (h.detalhes ? JSON.stringify(h.detalhes) : undefined)
        });
      });
    }

    // 2. Status de metadados.historico_status (Fallback retrocompatível)
    if (pedido.metadados && typeof pedido.metadados === 'object') {
      const historicoMeta = (pedido.metadados as any).historico_status;
      if (Array.isArray(historicoMeta) && historicoMeta.length > 0) {
        historicoMeta.forEach((it: any) => {
          itens.push({
            status: it.status,
            data: it.data,
            usuario: it.usuario,
            tipo: 'status'
          });
        });
      }
    }

    // 3. Histórico de edições do pedido (metadados.historico_edicoes)
    if (pedido.metadados && typeof pedido.metadados === 'object') {
      const historicoEdicoes = (pedido.metadados as any).historico_edicoes;
      if (Array.isArray(historicoEdicoes) && historicoEdicoes.length > 0) {
        historicoEdicoes.forEach((ed: any) => {
          itens.push({
            status: ed.acao || 'Edição no PDV',
            data: ed.data,
            usuario: ed.usuario_nome || 'Operador',
            tipo: 'edicao',
            detalhes: ed.detalhes
          });
        });
      }
    }

    // 4. Fallback inicial se não houver histórico estruturado
    if (itens.length === 0) {
      if (pedido.criado_em) {
        itens.push({
          status: 'pendente',
          data: pedido.criado_em,
          usuario: pedido.vendedor?.nome_completo || 'Sistema',
          tipo: 'criacao'
        });
      }
      if (pedido.status && pedido.status !== 'pendente') {
        itens.push({
          status: pedido.status,
          data: pedido.atualizado_em || pedido.data_venda || new Date().toISOString(),
          usuario: pedido.vendedor?.nome_completo || 'Operador',
          tipo: 'status'
        });
      }
    }

    // Remove duplicatas exatas se houver sobreposição entre tabela e metadados antigos
    const vistos = new Set<string>();
    const itensUnicos = itens.filter(item => {
      const chave = `${item.data}_${item.status}_${item.usuario}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });

    return itensUnicos.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  };

  const adicionarHistoricoMetadados = (pedido: Pedido | null | undefined, novoStatus: string, usuarioNome?: string): Record<string, any> => {
    const historicoAtual = pedido ? extrairHistoricoPedido(pedido) : [];
    const novoItem: HistoricoItem = {
      status: novoStatus,
      data: new Date().toISOString(),
      usuario: usuarioNome || 'Operador',
      tipo: 'status'
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
          vendedor:usuarios_loja!pedidos_vendedor_id_fkey(*),
          atualizado_por_usuario:usuarios_loja!pedidos_atualizado_por_fkey(*),
          itens:itens_pedido(*),
          pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*)),
          pagamentos_previstos:pedidos_pagamentos_previstos(*),
          historico:historico_pedidos(*, usuario:usuarios_loja(*)),
          pedido_entregas(*)
        `)
        .eq('loja_id', loja.id);

      if (usuario && !permissions.podeVerTransacoesOutros) {
        query = query.eq('vendedor_id', usuario.id);
      }

      let { data, error } = await query.order('criado_em', { ascending: false });

      // Fallback retrocompatível se a tabela historico_pedidos ainda não tiver sido criada no Supabase
      if (error && (error.message?.includes('historico_pedidos') || error.code === 'PGRST200')) {
        let fallbackQuery = supabase
          .from('pedidos')
          .select(`
            *,
            cliente:clientes(*),
            vendedor:usuarios_loja!pedidos_vendedor_id_fkey(*),
            atualizado_por_usuario:usuarios_loja!pedidos_atualizado_por_fkey(*),
            itens:itens_pedido(*),
            pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*)),
            pedido_entregas(*)
          `)
          .eq('loja_id', loja.id);

        if (usuario && !permissions.podeVerTransacoesOutros) {
          fallbackQuery = fallbackQuery.eq('vendedor_id', usuario.id);
        }
        const fallbackRes = await fallbackQuery.order('criado_em', { ascending: false });
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) throw error;
      if (data) {
        // Sincronizar pedidos com fiado vencido não quitado que ainda não estejam com status 'vencido'
        const pedidosVencidosParaAtualizar = (data as any[]).filter((p: any) => {
          if (p.status === 'concluido' || p.status === 'cancelado' || p.status === 'vencido') return false;
          const temFiado = (p.pagamentos || []).some((pag: any) => pag.eh_pagamento_fiado || pag.forma_pagamento?.tipo === 'fiado');
          return temFiado && !p.fiado_quitado && obterInfoVencimentoFiado(p).estaVencido;
        });

        if (pedidosVencidosParaAtualizar.length > 0) {
          const ids = pedidosVencidosParaAtualizar.map(p => p.id);
          supabase
            .from('pedidos')
            .update({ status: 'vencido', atualizado_em: new Date().toISOString() })
            .in('id', ids)
            .then(() => {});
          
          // Refletir imediatamente no estado em memória
          data.forEach((p: any) => {
            if (ids.includes(p.id)) {
              p.status = 'vencido';
            }
          });
        }

        const pedidosNormalizados = (data as any[]).map((p: any) => {
          const rawEntrega = p.pedido_entregas || p.pedido_entrega;
          const pe = Array.isArray(rawEntrega) ? (rawEntrega[0] || null) : (rawEntrega || null);
          return {
            ...p,
            pedido_entrega: pe,
            pedido_entregas: rawEntrega
          };
        });

        setPedidos(pedidosNormalizados as unknown as Pedido[]);
        setPedidoSelecionado((prev) => {
          if (!prev) return null;
          const atualizado = pedidosNormalizados.find((p: any) => p.id === prev.id);
          return atualizado ? (atualizado as unknown as Pedido) : prev;
        });
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
      const obsLimpa = extrairObservacaoLimpa(pedidoSelecionado.observacoes);
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
      if (!pedAlvo) return;

      if (pedAlvo.status === 'cancelado') {
        mostrarAviso('Pedidos cancelados são estritamente somente leitura e não podem ter seu status alterado.', 'Ação Bloqueada');
        return;
      }

      if (pedAlvo.status === 'concluido' && novoStatus !== 'cancelado') {
        mostrarAviso('Pedidos já concluídos (Vendas) são definitivos e não podem ter seu status alterado, exceto por cancelamento da venda.', 'Ação Bloqueada');
        return;
      }

      // Validação estrita: não permitir alterar para status desativados nas configurações da loja
      if (!isStatusPedidoAtivo(novoStatus, loja) && pedAlvo.status !== novoStatus) {
        mostrarAviso(
          `O status "${ROTULOS_STATUS_PEDIDO[novoStatus] || novoStatus}" está desativado em Configurações > Pedidos e Vendas.`,
          'Status Desativado'
        );
        return;
      }

      // Condicionamento estrito: Conclusão exige que o saldo devedor seja R$ 0,00
      const saldoDevedor = Number(pedAlvo.saldo_devedor ?? (Number(pedAlvo.valor_total || 0) - Number(pedAlvo.valor_pago || 0)));
      const estaQuitado = saldoDevedor <= 0.009;

      if (novoStatus === 'concluido' && !estaQuitado) {
        setPedidoReceberModal(pedAlvo);
        setConcluirAposReceber(true);
        mostrarAviso(
          `Para marcar o pedido #${pedAlvo.numero_pedido} como Concluído, liquide o saldo pendente de R$ ${saldoDevedor.toFixed(2)}.`,
          'Recebimento Obrigatório'
        );
        return;
      }

      const validacaoCiclo = validarTransicaoStatusPedido(pedAlvo.status, novoStatus, estaQuitado);
      if (!validacaoCiclo.permitido) {
        if (validacaoCiclo.requerPagamento) {
          setPedidoReceberModal(pedAlvo);
          setConcluirAposReceber(true);
        }
        mostrarAviso(validacaoCiclo.motivo || 'Transição de status não permitida.', 'Ação Bloqueada');
        return;
      }

      // Validação estrita para Correios: não permite confirmar envio sem código válido
      if (novoStatus === 'enviado') {
        const { pe, provNome } = resolverProvedorEntrega(pedAlvo, entregaPedido);
        const ehPedCorreios =
          pe?.tipo_operacao === 'correios' ||
          (pedAlvo as any)?.tipo_operacao === 'correios' ||
          (pe?.provedor as any) === 'correios' ||
          provNome.toLowerCase().includes('correios') ||
          String((pedAlvo as any).forma_entrega_nome || pedAlvo.forma_entrega?.nome || '').toLowerCase().includes('correios') ||
          String(pedAlvo.nome_transportadora || '').toLowerCase().includes('correios') ||
          Boolean(pedAlvo.servico_correios);

        if (ehPedCorreios) {
          const rastreioAtual = pedAlvo.codigo_rastreio || pe?.codigo_rastreio;
          const servicoAtual = pedAlvo.servico_correios || pe?.servico_correios || 'SEDEX';
          const validacao = validarRastreioCorreios(rastreioAtual, servicoAtual);

          if (!validacao.valido) {
            handleDespacharPedido(pedAlvo);
            mostrarAviso(
              'Para despachar pedidos via Correios, é obrigatório selecionar o serviço (SEDEX ou PAC) e informar o código de rastreamento válido.',
              'Código de Rastreamento Obrigatório'
            );
            return;
          }
        }
      }

      // Limpar tag legada e metadados de cliente em observações caso ainda existam
      let obsLimpa = extrairObservacaoLimpa(pedAlvo?.observacoes);

      const dataIsoAlteracao = new Date().toISOString();
      const { error } = await supabase
        .from('pedidos')
        .update({
          status: novoStatus,
          observacoes: obsLimpa || null,
          atualizado_por: usuario?.id || null,
          atualizado_em: dataIsoAlteracao
        })
        .eq('id', pedidoId);

      if (error) throw error;

      // Se o pedido foi concluído ou entregue, atualiza a entrega correspondente
      if (novoStatus === 'concluido' || (novoStatus as string) === 'entregue') {
        try {
          await supabase
            .from('pedido_entregas')
            .update({
              status_envio: 'entregue',
              entregue_em: dataIsoAlteracao,
              atualizado_em: dataIsoAlteracao
            })
            .eq('pedido_id', pedidoId);
        } catch (errEntrega) {
          console.warn('Aviso ao atualizar status_envio em pedido_entregas:', errEntrega);
        }
      }
      if (loja?.id) {
        try {
          const rotulo = ROTULOS_STATUS_PEDIDO[novoStatus] || novoStatus;
          await supabase.from('historico_pedidos').insert({
            loja_id: loja.id,
            pedido_id: pedidoId,
            usuario_id: usuario?.id || null,
            tipo_evento: novoStatus === 'cancelado' ? 'cancelado' : 'status_alterado',
            status_anterior: pedAlvo?.status || null,
            status_novo: novoStatus,
            descricao: `Status alterado para ${rotulo} por ${usuario?.nome_completo || 'Operador'}`,
            criado_em: dataIsoAlteracao
          });
        } catch (errHist) {
          console.warn('Aviso ao registrar historico_pedidos:', errHist);
        }
      }

      // Se o pedido cancelado continha fiado não quitado, estornar o saldo devedor e devolver o limite de crédito do cliente
      if (novoStatus === 'cancelado' && pedAlvo?.cliente_id && !pedAlvo.fiado_quitado) {
        const fiadoDoPedido = (pedAlvo.pagamentos || [])
          .filter((p: any) => (p.eh_pagamento_fiado || p.forma_pagamento?.tipo === 'fiado') && !p.fiado_quitado)
          .reduce((sum: number, p: any) => sum + Number(p.valor || 0), 0);

        if (fiadoDoPedido > 0) {
          try {
            const { data: cliDb } = await supabase
              .from('clientes')
              .select('saldo_devedor_fiado, limite_credito')
              .eq('id', pedAlvo.cliente_id)
              .single();

            if (cliDb) {
              const novoSaldo = Math.max(0, Number(cliDb.saldo_devedor_fiado || 0) - fiadoDoPedido);
              const novoLimite = Number(cliDb.limite_credito || 0) + fiadoDoPedido;
              await supabase.from('clientes').update({
                saldo_devedor_fiado: novoSaldo,
                limite_credito: novoLimite
              }).eq('id', pedAlvo.cliente_id);

              setClientes((prev) =>
                prev.map((c) =>
                  c.id === pedAlvo.cliente_id
                    ? { ...c, saldo_devedor_fiado: novoSaldo, limite_credito: novoLimite }
                    : c
                )
              );
            }
          } catch (errEstorno) {
            console.warn('Falha ao estornar fiado do cliente ao cancelar pedido:', errEstorno);
          }
        }
      }

      setPedidos((prev) =>
        prev.map((p) =>
          p.id === pedidoId
            ? { ...p, status: novoStatus, observacoes: obsLimpa || null }
            : p
        )
      );

      if (pedidoSelecionado && pedidoSelecionado.id === pedidoId) {
        if (novoStatus === 'concluido') {
          setPedidoSelecionado(null);
        } else {
          setPedidoSelecionado((prev) =>
            prev
              ? { ...prev, status: novoStatus, observacoes: obsLimpa || null }
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

  const handleDespacharPedido = async (pedidoAlvo?: Pedido | React.MouseEvent<any>) => {
    const ped = (pedidoAlvo && typeof pedidoAlvo === 'object' && 'numero_pedido' in pedidoAlvo) ? (pedidoAlvo as Pedido) : pedidoSelecionado;
    if (!ped || !loja?.id || ped.status === 'cancelado') return;
    setPedidoSelecionado(ped);

    const { prov, pe } = resolverProvedorEntrega(ped, ped.id === pedidoSelecionado?.id ? entregaPedido : null);

    // Se for Frete Próprio ou Entrega Manual/Transportadora da Loja, abre modal
    if (prov === 'frete_proprio' || pe?.provedor === 'frete_proprio') {
      const servicoDetectado = (ped.servico_correios as any) || (pe?.servico_correios as any) || (detectarServicoPorCodigo(ped.codigo_rastreio || pe?.codigo_rastreio) === 'PAC' ? 'PAC' : 'SEDEX');
      setEntregadorNomeDespacho(ped.entregador_nome || pe?.entregador_nome || '');
      setContatoEntregadorDespacho(ped.contato_entregador || pe?.contato_entregador || '');
      setCodigoRastreioDespacho(ped.codigo_rastreio || pe?.codigo_rastreio || '');
      setLinkRastreioDespacho(ped.link_rastreio || pe?.link_rastreio || '');
      setPinEntregaDespacho(ped.pin_entrega || pe?.pin_entrega || '');
      setNomeAppDespacho(ped.nome_app || pe?.nome_app || '');
      setServicoCorreiosDespacho(servicoDetectado);
      setNomeTransportadoraDespacho(ped.nome_transportadora || pe?.nome_transportadora || pe?.transportadora_nome || '');
      setModalDespachoAberto(true);
      return;
    }

    // Se for Uber Direct ou Melhor Envio, dispara chamada de API integrada
    try {
      setDespachando(true);
      const agora = new Date().toISOString();
      const config = await ShippingOrchestrator.buscarConfigLoja(loja.id);
      if (!config) {
        throw new Error('Configurações logísticas da loja não encontradas.');
      }

      // 1. Buscar a entrega atualizada no banco caso pe esteja nulo ou incompleto
      let entregaValida = pe;
      if (!entregaValida || !entregaValida.destino_logradouro || !entregaValida.destino_cep) {
        try {
          const peDb = await ShippingOrchestrator.buscarPedidoEntrega(ped.id);
          if (peDb) {
            entregaValida = peDb;
          }
        } catch (peErr) {
          console.warn('Falha ao buscar entrega no banco:', peErr);
        }
      }

      if (!entregaValida) {
        entregaValida = {
          pedido_id: ped.id,
          tipo_atendimento: 'entrega',
          valor_frete: Number(ped.valor_frete || 0),
          destino_logradouro: ped.endereco_entrega || '',
          provedor: prov
        };
      }

      // 2. Garantir que dados do cliente (nome, telefone) estejam presentes no pedido
      let pedCompleto = ped;
      if ((!pedCompleto.cliente || !pedCompleto.cliente.whatsapp) && pedCompleto.cliente_id) {
        try {
          const { data: cliDb } = await supabase
            .from('clientes')
            .select('*')
            .eq('id', pedCompleto.cliente_id)
            .maybeSingle();

          if (cliDb) {
            pedCompleto = { ...pedCompleto, cliente: cliDb };
          }
        } catch (cliErr) {
          console.warn('Falha ao carregar dados do cliente para despacho:', cliErr);
        }
      }

      if (prov === 'uber') {
        const resultado = await ShippingOrchestrator.despacharUberDirect(
          loja,
          config,
          pedCompleto,
          entregaValida,
          usuario?.id || null
        );

        setPedidos((prev) =>
          prev.map((p) =>
            p.id === ped.id
              ? {
                  ...p,
                  status: 'enviado',
                  link_rastreio: resultado.link_rastreio,
                  pin_entrega: resultado.pin_entrega || p.pin_entrega,
                  despachado_em: agora,
                  despachado_por: usuario?.id || null
                }
              : p
          )
        );

        setPedidoSelecionado((prev) =>
          prev
            ? {
                ...prev,
                status: 'enviado',
                link_rastreio: resultado.link_rastreio,
                pin_entrega: resultado.pin_entrega || prev.pin_entrega,
                despachado_em: agora,
                despachado_por: usuario?.id || null
              }
            : null
        );

        const entregaAtualizada = await ShippingOrchestrator.buscarPedidoEntrega(ped.id);
        if (entregaAtualizada) setEntregaPedido(entregaAtualizada);

        mostrarSucesso(
          resultado.pin_entrega
            ? `Corrida Uber Direct solicitada com sucesso! Código PIN: ${resultado.pin_entrega}`
            : 'Corrida Uber Direct solicitada com sucesso!'
        );
      } else if (prov === 'melhor_envio') {
        const docCliente = (pedCompleto.cliente?.numero_documento || pedCompleto.cliente_documento_avulso || '').replace(/\D/g, '');
        if (!docCliente) {
          setPedidoPendenteDespacho({ ped: pedCompleto, entrega: entregaValida });
          setCpfClienteInput('');
          setModalCpfClienteAberto(true);
          setDespachando(false);
          return;
        }

        const resultado = await ShippingOrchestrator.despacharMelhorEnvio(
          loja,
          config,
          pedCompleto,
          entregaValida,
          usuario?.id || null
        );

        const urlRastreio = resultado.codigo_rastreio
          ? `https://melhorrastreio.com.br/rastreio/${resultado.codigo_rastreio}`
          : (resultado.link_rastreio && !resultado.link_rastreio.includes('imprimir') ? resultado.link_rastreio : null);

        setPedidos((prev) =>
          prev.map((p) =>
            p.id === ped.id
              ? {
                  ...p,
                  status: 'enviado',
                  codigo_rastreio: resultado.codigo_rastreio,
                  link_rastreio: urlRastreio,
                  despachado_em: agora,
                  despachado_por: usuario?.id || null
                }
              : p
          )
        );

        setPedidoSelecionado((prev) =>
          prev
            ? {
                ...prev,
                status: 'enviado',
                codigo_rastreio: resultado.codigo_rastreio,
                link_rastreio: urlRastreio,
                despachado_em: agora,
                despachado_por: usuario?.id || null
              }
            : null
        );

        const entregaAtualizada = await ShippingOrchestrator.buscarPedidoEntrega(ped.id);
        if (entregaAtualizada) setEntregaPedido(entregaAtualizada);

        mostrarSucesso(`Etiqueta gerada com sucesso! Rastreio: ${resultado.codigo_rastreio}`);
      }
    } catch (err: any) {
      console.error('Erro ao despachar pedido via API integrada:', err);
      let mensagem = err?.message || 'Falha na comunicação com o provedor de frete.';
      const msgLower = mensagem.toLowerCase();
      if (msgLower.includes('saldo') || msgLower.includes('wallet')) {
        mensagem = 'Saldo insuficiente na carteira do Melhor Envio para gerar a etiqueta. Adicione créditos no painel do Melhor Envio.';
      } else if (msgLower.includes('token') && (msgLower.includes('missing') || msgLower.includes('não configurado'))) {
        mensagem = 'Token do Melhor Envio não configurado nesta loja. Acesse Configurações > Frete e cadastre seu token.';
      } else if (msgLower.includes('cep') && msgLower.includes('inválido')) {
        mensagem = 'CEP de origem ou de entrega inválido para envio. Verifique o endereço do pedido.';
      } else if (msgLower.includes('documento') && msgLower.includes('inválido')) {
        mensagem = 'CPF ou CNPJ do cliente ou da loja inválido para emissão da etiqueta.';
      }
      mostrarErro(mensagem);
    } finally {
      setDespachando(false);
    }
  };

  const formatarMascaraDocumento = (valor: string) => {
    const limpo = valor.replace(/\D/g, '').slice(0, 14);
    if (limpo.length <= 11) {
      return limpo
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    return limpo
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  };

  const handleSalvarCpfEContinuarDespacho = async () => {
    if (!pedidoPendenteDespacho || !loja) return;
    const docLimpo = cpfClienteInput.replace(/\D/g, '');
    if (!docLimpo || (docLimpo.length !== 11 && docLimpo.length !== 14)) {
      mostrarErro('Por favor, informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
      return;
    }

    try {
      setSalvandoCpfEDespachando(true);
      const { ped, entrega } = pedidoPendenteDespacho;

      // 1. Atualiza o documento no cliente (se cadastrado) e no pedido
      if (ped.cliente_id) {
        await supabase
          .from('clientes')
          .update({ numero_documento: docLimpo })
          .eq('id', ped.cliente_id);
      }

      await supabase
        .from('pedidos')
        .update({ cliente_documento_avulso: docLimpo })
        .eq('id', ped.id);

      const pedAtualizado: Pedido = {
        ...ped,
        cliente_documento_avulso: docLimpo,
        cliente: ped.cliente ? { ...ped.cliente, numero_documento: docLimpo } : ped.cliente
      };

      setModalCpfClienteAberto(false);
      setDespachando(true);

      const config = await ShippingOrchestrator.buscarConfigLoja(loja.id);
      if (!config) throw new Error('Configuração de frete não encontrada.');

      const resultado = await ShippingOrchestrator.despacharMelhorEnvio(
        loja,
        config,
        pedAtualizado,
        entrega,
        usuario?.id || null
      );

      const agora = new Date().toISOString();
      const urlRastreio = resultado.codigo_rastreio
        ? `https://melhorrastreio.com.br/rastreio/${resultado.codigo_rastreio}`
        : (resultado.link_rastreio && !resultado.link_rastreio.includes('imprimir') ? resultado.link_rastreio : null);

      setPedidos((prev) =>
        prev.map((p) =>
          p.id === ped.id
            ? {
                ...p,
                status: 'enviado',
                codigo_rastreio: resultado.codigo_rastreio,
                link_rastreio: urlRastreio,
                despachado_em: agora,
                despachado_por: usuario?.id || null
              }
            : p
        )
      );

      setPedidoSelecionado((prev) =>
        prev
          ? {
              ...prev,
              status: 'enviado',
              codigo_rastreio: resultado.codigo_rastreio,
              link_rastreio: urlRastreio,
              despachado_em: agora,
              despachado_por: usuario?.id || null
            }
          : null
      );

      const entregaAtualizada = await ShippingOrchestrator.buscarPedidoEntrega(ped.id);
      if (entregaAtualizada) setEntregaPedido(entregaAtualizada);

      mostrarSucesso(`Etiqueta gerada com sucesso! Rastreio: ${resultado.codigo_rastreio}`);
    } catch (err: any) {
      console.error('Erro ao salvar CPF e despachar:', err);
      let mensagem = err?.message || 'Falha na comunicação com o provedor de frete.';
      const msgLower = mensagem.toLowerCase();
      if (msgLower.includes('saldo') || msgLower.includes('wallet')) {
        mensagem = 'Saldo insuficiente na carteira do Melhor Envio para gerar a etiqueta. Adicione créditos no painel do Melhor Envio.';
      }
      mostrarErro(mensagem);
    } finally {
      setSalvandoCpfEDespachando(false);
      setDespachando(false);
      setPedidoPendenteDespacho(null);
    }
  };

  const handleConfirmarDespacho = async () => {
    if (!pedidoSelecionado || pedidoSelecionado.status === 'cancelado') return;

    if (ehDespachoCorreios) {
      const validacao = validarRastreioCorreios(codigoRastreioDespacho, servicoCorreiosDespacho);
      if (!validacao.valido) {
        mostrarAviso(
          validacao.motivo || 'Código de rastreamento inválido para os Correios.',
          'Validação dos Correios'
        );
        return;
      }
    }

    try {
      setDespachando(true);
      const rastreioNormalizado = codigoRastreioDespacho.trim().toUpperCase().replace(/\s+/g, '');
      const agora = new Date().toISOString();
      const { pe } = resolverProvedorEntrega(pedidoSelecionado, entregaPedido);
      const nomeAppFinal = ehDespachoCorreios ? undefined : (nomeAppDespacho.trim() || undefined);
      const nomeTranspFinal = ehDespachoCorreios ? 'Correios' : (nomeTransportadoraDespacho.trim() || undefined);
      const linkRastreioFinal = ehDespachoCorreios && rastreioNormalizado
        ? `https://rastreamento.correios.com.br/app/index.php?objeto=${rastreioNormalizado}`
        : (linkRastreioDespacho.trim() || undefined);

      await ShippingOrchestrator.despacharEntregaManual(
        pedidoSelecionado.id,
        {
          entregadorNome: entregadorNomeDespacho.trim() || undefined,
          contatoEntregador: contatoEntregadorDespacho.trim() || undefined,
          codigoRastreio: rastreioNormalizado || undefined,
          linkRastreio: linkRastreioFinal,
          pinEntrega: pinEntregaDespacho.trim() || undefined,
          nomeApp: nomeAppFinal,
          servicoCorreios: servicoCorreiosDespacho || undefined,
          nomeTransportadora: nomeTranspFinal,
          tipoOperacao: (pe?.tipo_operacao || (pedidoSelecionado as any).tipo_operacao) || undefined,
          usuarioId: usuario?.id || null
        }
      );
      setPedidos((prev) =>
        prev.map((p) =>
          p.id === pedidoSelecionado.id
            ? {
                ...p,
                status: 'enviado',
                entregador_nome: entregadorNomeDespacho.trim() || p.entregador_nome,
                contato_entregador: contatoEntregadorDespacho.trim() || p.contato_entregador,
                codigo_rastreio: rastreioNormalizado || p.codigo_rastreio,
                link_rastreio: linkRastreioFinal || p.link_rastreio,
                pin_entrega: pinEntregaDespacho.trim() || p.pin_entrega,
                nome_app: ehDespachoCorreios ? undefined : (nomeAppFinal || p.nome_app),
                servico_correios: servicoCorreiosDespacho || p.servico_correios,
                nome_transportadora: nomeTranspFinal || p.nome_transportadora,
                despachado_em: agora,
                despachado_por: usuario?.id || null
              }
            : p
        )
      );
      setPedidoSelecionado((prev) =>
        prev
          ? {
              ...prev,
              status: 'enviado',
              entregador_nome: entregadorNomeDespacho.trim() || prev.entregador_nome,
              contato_entregador: contatoEntregadorDespacho.trim() || prev.contato_entregador,
              codigo_rastreio: rastreioNormalizado || prev.codigo_rastreio,
              link_rastreio: linkRastreioFinal || prev.link_rastreio,
              pin_entrega: pinEntregaDespacho.trim() || prev.pin_entrega,
              nome_app: ehDespachoCorreios ? undefined : (nomeAppFinal || prev.nome_app),
              servico_correios: servicoCorreiosDespacho || prev.servico_correios,
              nome_transportadora: nomeTranspFinal || prev.nome_transportadora,
              despachado_em: agora,
              despachado_por: usuario?.id || null
            }
          : null
      );
      const entregaAtualizada = await ShippingOrchestrator.buscarPedidoEntrega(pedidoSelecionado.id);
      if (entregaAtualizada) setEntregaPedido(entregaAtualizada);
      mostrarSucesso('Pedido despachado para entrega com sucesso!');
      setModalDespachoAberto(false);
      setEntregadorNomeDespacho('');
      setContatoEntregadorDespacho('');
      setCodigoRastreioDespacho('');
      setLinkRastreioDespacho('');
      setPinEntregaDespacho('');
      setNomeTransportadoraDespacho('');
    } catch (err: any) {
      console.error('Erro ao despachar pedido:', err);
      mostrarErro(`Erro ao despachar pedido: ${err.message || 'Tente novamente.'}`);
    } finally {
      setDespachando(false);
    }
  };

  const handleForcarConclusaoContingencia = async () => {
    if (!pedidoSelecionado || pedidoSelecionado.status === 'cancelado') return;
    try {
      setExecutandoContingencia(true);
      const agora = new Date().toISOString();
      await ShippingOrchestrator.forcarDespachoManual(
        pedidoSelecionado.id,
        usuario?.id || null
      );
      setPedidos((prev) =>
        prev.map((p) =>
          p.id === pedidoSelecionado.id
            ? {
                ...p,
                status: 'enviado',
                despachado_em: agora,
                despachado_por: usuario?.id || null
              }
            : p
        )
      );
      setPedidoSelecionado((prev) =>
        prev
          ? {
              ...prev,
              status: 'enviado',
              despachado_em: agora,
              despachado_por: usuario?.id || null
            }
          : null
      );
      const entregaAtualizada = await ShippingOrchestrator.buscarPedidoEntrega(pedidoSelecionado.id);
      if (entregaAtualizada) setEntregaPedido(entregaAtualizada);
      mostrarSucesso('Despacho manual forçado com sucesso via contingência!');
      setModalContingenciaAberto(false);
    } catch (err: any) {
      console.error('Erro ao forçar despacho manual:', err);
      mostrarErro(`Erro ao forçar despacho manual: ${err.message || 'Tente novamente.'}`);
    } finally {
      setExecutandoContingencia(false);
    }
  };

  const handleAlterarClientePedido = async (novoClienteId: string) => {
    if (!pedidoSelecionado || pedidoSelecionado.status === 'cancelado') return;
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
      const dataIso = obterDataOperacaoISO();

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
          vendedor:usuarios_loja!pedidos_vendedor_id_fkey(*),
          atualizado_por_usuario:usuarios_loja!pedidos_atualizado_por_fkey(*),
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
        const dataIso = obterDataOperacaoISO();
        await supabase.from('pagamentos_pedido').delete().eq('pedido_id', pedidoSelecionado.id);
        await supabase.from('pagamentos_pedido').insert({
          pedido_id: pedidoSelecionado.id,
          loja_id: loja.id,
          forma_pagamento_id: formaId,
          valor: valorTotal,
          data_pagamento: dataIso,
          criado_em: dataIso
        });
      }

      const obsLimpa = extrairObservacaoLimpa(pedidoSelecionado.observacoes);
      const dataIsoConclusao = obterDataOperacaoISO();
      const { error } = await supabase
        .from('pedidos')
        .update({
          status: 'concluido',
          status_pagamento: 'pago',
          valor_pago: valorTotal,
          saldo_devedor: 0,
          observacoes: obsLimpa || null,
          atualizado_por: usuario?.id || null,
          atualizado_em: dataIsoConclusao
        })
        .eq('id', pedidoSelecionado.id);

      if (error) throw error;

      // Atualizar status_envio da entrega para entregue
      try {
        await supabase
          .from('pedido_entregas')
          .update({
            status_envio: 'entregue',
            entregue_em: dataIsoConclusao,
            atualizado_em: dataIsoConclusao
          })
          .eq('pedido_id', pedidoSelecionado.id);
      } catch (eEnt) {
        console.warn('Aviso ao atualizar status_envio em pedido_entregas:', eEnt);
      }

      // Inserir registro relacional na tabela historico_pedidos
      try {
        await supabase.from('historico_pedidos').insert({
          loja_id: loja.id,
          pedido_id: pedidoSelecionado.id,
          usuario_id: usuario?.id || null,
          tipo_evento: 'status_alterado',
          status_anterior: pedidoSelecionado.status || null,
          status_novo: 'concluido',
          descricao: `Venda concluída e pagamento confirmado por ${usuario?.nome_completo || 'Operador'}`
        });
      } catch (eHist) {
        console.warn('Aviso ao registrar historico_pedidos:', eHist);
      }

      // Limpar pagamentos previstos vinculados agora que o pedido está concluído
      try {
        await supabase.from('pedidos_pagamentos_previstos').delete().eq('pedido_id', pedidoSelecionado.id);
      } catch (ePrev) {}

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
    if (!pedidoSelecionado || pedidoSelecionado.status === 'cancelado') return;
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

  const handleCompartilharRastreioUber = (ped: Pedido) => {
    const pe = (ped as any).pedido_entrega || (ped as any).pedido_entregas?.[0];
    const link = ped.link_rastreio || pe?.link_rastreio;
    if (!link) {
      mostrarAviso('Link de rastreio não disponível para este pedido.');
      return;
    }
    const pin = ped.pin_entrega || pe?.pin_entrega;
    const pinTexto = pin ? `\n*PIN de Confirmação:* ${pin}` : '';
    const texto = `🚗 Olá! Seu pedido #${ped.numero_pedido} está a caminho via Uber Flash!\n\nAcompanhe o motorista no mapa ao vivo pelo link:\n${link}${pinTexto}\n\nObrigado por comprar conosco!`;
    const tel = ped.cliente?.whatsapp || ped.cliente?.telefone || '';
    const cleanTel = tel.replace(/\D/g, '');
    const url = cleanTel
      ? `https://wa.me/55${cleanTel}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
  };

  const handleCopiarRastreioUber = (ped: Pedido) => {
    const pe = (ped as any).pedido_entrega || (ped as any).pedido_entregas?.[0];
    const link = ped.link_rastreio || pe?.link_rastreio;
    if (!link) {
      mostrarAviso('Link de rastreio não disponível para este pedido.');
      return;
    }
    navigator.clipboard.writeText(link);
    mostrarSucesso('Link de rastreio da Uber copiado para a área de transferência!');
  };

  const handleCopiarReciboTexto = (pedido: Pedido) => {
    if (!loja) return;
    const msg = PrintService.generateWhatsAppMessage(pedido, loja);
    navigator.clipboard.writeText(msg);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleEditarPedido = async (pedido: Pedido) => {
    if (!podeEditarPedido(pedido)) {
      mostrarAviso('A alteração de produtos só é permitida para pedidos Pendentes ou com Envio Pendente (aguardando pagamento).', 'Edição Restrita');
      return;
    }
    await carregarPedidoParaEdicao(pedido);
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
      aguardando_envio: 0,
      enviado: 0,
      entregue: 0,
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
      } else if (p.status === 'saiu_para_entrega') {
        counts.enviado += 1;
      } else if (p.status === 'envio_pendente') {
        counts.aguardando_envio += 1;
      }
    });

    return counts;
  }, [pedidos]);

  const pedidosAbertosCount = useMemo(() => {
    return pedidos.filter((p) =>
      ['pendente', 'confirmado', 'em_separacao', 'em_producao', 'em_expedicao', 'aguardando_envio', 'enviado', 'entregue', 'pronto_para_retirar'].includes(p.status)
    ).length;
  }, [pedidos]);

  const pedidosFiltrados = useMemo(() => {
    return pedidos
      .filter((p) => {
        if (p.status === 'concluido') return false;

        let matchStatus = true;
        if (statusFiltro === 'vencido') {
          const infoVenc = obterInfoVencimentoFiado(p);
          const temFiado = (p.pagamentos || []).some((pag: any) => pag.eh_pagamento_fiado || pag.forma_pagamento?.tipo === 'fiado');
          matchStatus = p.status === 'vencido' || (temFiado && !p.fiado_quitado && infoVenc.estaVencido);
        } else if (statusFiltro !== 'todos') {
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
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

  const getStatusBadge = (status: StatusPedido, pedido?: Pedido) => {
    switch (status) {
      case 'pendente':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">🟡 Pendente</span>;
      case 'confirmado':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">🟢 Confirmado</span>;
      case 'em_producao':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">🔵 Em produção</span>;
      case 'em_expedicao':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">📦 Em expedição</span>;
      case 'aguardando_envio':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">📦 Aguardando Envio</span>;
      case 'enviado':
      case 'saiu_para_entrega':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">🚚 Enviado</span>;
      case 'pronto_para_retirar':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-500/15 text-teal-400 border border-teal-500/30">🏪 Pronto Retirada</span>;
      case 'vencido': {
        const infoVenc = pedido ? obterInfoVencimentoFiado(pedido) : null;
        return (
          <div className="inline-flex flex-col items-center">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              ⏰ Vencido
            </span>
            {infoVenc && (
              <span className="text-[10px] text-rose-400/90 font-semibold mt-0.5 whitespace-nowrap">
                Vencimento: {infoVenc.formatada}
              </span>
            )}
          </div>
        );
      }
      case 'entregue':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40">📍 Entregue</span>;
      case 'concluido':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✅ Concluído</span>;
      case 'cancelado':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">❌ Cancelado</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 capitalize">{status.replace('_', ' ')}</span>;
    }
  };

  const getStatusPagamentoBadge = (status: StatusPagamento) => {
    switch (status) {
      case 'pago':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">🟢 Pago</span>;
      case 'fiado':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">🏷️ Fiado</span>;
      case 'parcialmente_pago':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">🟡 Parcial</span>;
      case 'aguardando_pagamento':
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">🕒 Aguardando pagamento</span>;
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
          pedidoSelecionadoInicial={pedidoSelecionado}
          onVoltarOrigem={handleVoltarListaPedidos}
          onAlterarStatus={atualizarStatus}
          onCancelarPedido={(ped) => atualizarStatus(ped.id, 'cancelado')}
          onAbrirReceberPagamento={(ped) => {
            setPedidoReceberModal(ped);
            setConcluirAposReceber(true);
          }}
          onAbrirReceberFiado={(ped) => {
            setPedidoReceberFiadoModal(ped);
          }}
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
                onClick={handleVoltarListaPedidos}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                title={origemParam === 'sales' ? 'Voltar para Vendas' : 'Voltar para a lista de pedidos'}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl md:text-2xl font-black text-slate-100 flex items-center gap-2">
                  <span>Pedido #{pedidoSelecionado.origem === 'catalogo_online' ? `c-${pedidoSelecionado.numero_pedido}` : pedidoSelecionado.numero_pedido}</span>
                  <span className="text-emerald-400 font-bold text-lg">Total R$ {Number(pedidoSelecionado.valor_total || 0).toFixed(2)}</span>
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{formatarData(pedidoSelecionado.data_venda || pedidoSelecionado.criado_em || '')}</span>
                  </span>
                  {pedidoSelecionado.origem === 'catalogo_online' ? (
                    <>
                      <span>•</span>
                      <span className="text-sky-400 font-semibold">Origem: Catálogo Online</span>
                    </>
                  ) : pedidoSelecionado.vendedor?.nome_completo ? (
                    <>
                      <span>•</span>
                      <span>Vendedor: {pedidoSelecionado.vendedor.nome_completo}</span>
                    </>
                  ) : null}
                  {(() => {
                    const editorNome = pedidoSelecionado.atualizado_por_usuario?.nome_completo ||
                      usuarios.find(u => u.id === pedidoSelecionado.atualizado_por)?.nome_completo ||
                      (pedidoSelecionado.metadados as any)?.ultimo_editor?.usuario_nome ||
                      (pedidoSelecionado.metadados as any)?.ultimo_editor?.nome;
                    if (!editorNome) return null;
                    return (
                      <>
                        <span>•</span>
                        <span className="text-amber-400/90 text-[11px] bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-medium">
                          Última edição por {editorNome}
                        </span>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Ações Rápidas do Topo: Link de Andamento, Cancelar, Concluir Venda (TELA002) */}
            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              {/* Seletor de Status Interativo ou Badge Fixo para Cancelado */}
              {pedidoSelecionado.status === 'cancelado' ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-bold">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Cancelado</span>
                </div>
              ) : (
                <div className="relative inline-block">
                  <select
                    value={pedidoSelecionado.status}
                    onChange={(e) => atualizarStatus(pedidoSelecionado.id, e.target.value as StatusPedido)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer appearance-none pr-8"
                  >
                    {opcoesStatusSelecionado.filter((op) => op.id !== 'concluido').map((op) => (
                      <option key={op.id} value={op.id}>
                        Status: {op.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}

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

              {/* Botão Editar Pedido */}
              {podeEditarPedido(pedidoSelecionado) && (
                <button
                  type="button"
                  onClick={() => handleEditarPedido(pedidoSelecionado)}
                  className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-bold text-amber-300 transition flex items-center gap-1.5 cursor-pointer"
                  title="Editar itens e informações do pedido no PDV"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Editar Pedido</span>
                </button>
              )}

              {/* Botão Imprimir Etiqueta no Modal */}
              {(() => {
                const { prov, pe, isRetirada } = resolverProvedorEntrega(pedidoSelecionado, entregaPedido);
                const temEtiquetaModal = pedidoSelecionado.status !== 'cancelado' && !isRetirada && (
                  prov === 'melhor_envio' ||
                  prov === 'uber' ||
                  pe?.provedor === 'uber' ||
                  pe?.tipo_operacao === 'correios' ||
                  pe?.tipo_operacao === 'transportadora' ||
                  pe?.servico_correios ||
                  pe?.nome_transportadora ||
                  pedidoSelecionado.servico_correios ||
                  pedidoSelecionado.nome_transportadora ||
                  Boolean(pedidoSelecionado.endereco_entrega) ||
                  (pedidoSelecionado as any).tipo_entrega === 'envio'
                );
                if (temEtiquetaModal) {
                  return (
                    <button
                      type="button"
                      onClick={() => setPedidoEtiquetaModal(pedidoSelecionado)}
                      className="px-3 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-xs font-bold text-sky-300 transition flex items-center gap-1.5 cursor-pointer"
                      title="Imprimir Etiqueta de Envio"
                    >
                      <Tag className="w-3.5 h-3.5" />
                      <span>Etiqueta</span>
                    </button>
                  );
                }
                return null;
              })()}

              {/* Botão Cancelar Pedido (TELA004) */}
              {pedidoSelecionado.status !== 'cancelado' && pedidoSelecionado.status !== 'concluido' && (
                <button
                  type="button"
                  onClick={() => setModalCancelarPedidoAberto(true)}
                  className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition cursor-pointer"
                  title="Cancelar pedido"
                >
                  <Ban className="w-4 h-4" />
                </button>
              )}

              {/* Botão Principal Concluir Venda / Receber Fiado (TELA005) */}
              {pedidoSelecionado.status === 'cancelado' ? (
                <div className="px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-1.5">
                  <XCircle className="w-4 h-4" />
                  <span>Pedido Cancelado</span>
                </div>
              ) : resolverStatusPagamento(pedidoSelecionado) === 'fiado' && pedidoSelecionado.status === 'confirmado' ? (
                <button
                  type="button"
                  onClick={() => {
                    setPedidoReceberFiadoModal(pedidoSelecionado);
                  }}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black transition flex items-center gap-2 shadow-lg shadow-purple-500/20 cursor-pointer active:scale-95"
                  title="Receber pagamento do fiado"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Receber Fiado</span>
                </button>
              ) : resolverStatusPagamento(pedidoSelecionado) !== 'pago' && resolverStatusPagamento(pedidoSelecionado) !== 'fiado' ? (
                <button
                  type="button"
                  onClick={() => setPedidoReceberModal(pedidoSelecionado)}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Receber Pagamento</span>
                </button>
              ) : pedidoSelecionado.status === 'aguardando_envio' ? (
                (() => {
                  const { prov } = resolverProvedorEntrega(pedidoSelecionado, entregaPedido);

                  return (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDespacharPedido}
                        disabled={despachando}
                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95 disabled:opacity-50"
                      >
                        {despachando ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Despachando...</span>
                          </>
                        ) : (
                          <>
                            <Truck className="w-4 h-4" />
                            <span>
                              {prov === 'uber'
                                ? 'Chamar Uber Direct'
                                : prov === 'melhor_envio'
                                ? 'Gerar Etiqueta de Envio'
                                : 'Despachar / Concluir Entrega'}
                            </span>
                          </>
                        )}
                      </button>

                      {(prov === 'uber' || prov === 'melhor_envio') && (permissions.ehAdmin || permissions.ehGerente) && (
                        <button
                          type="button"
                          onClick={() => setModalContingenciaAberto(true)}
                          className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 text-xs font-bold border border-amber-500/30 flex items-center gap-1.5 cursor-pointer transition"
                          title="Válvula de contingência RBAC: Forçar despacho manual caso a API externa falhe"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Forçar Despacho Manual</span>
                        </button>
                      )}
                    </div>
                  );
                })()
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

          {/* BANNER VISUAL INFORMATIVO PARA PEDIDO CANCELADO */}
          {pedidoSelecionado.status === 'cancelado' && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-black text-rose-200 block">PEDIDO CANCELADO (SOMENTE LEITURA)</span>
                <p className="text-rose-300/90 leading-relaxed">
                  Este pedido foi cancelado e está congelado para histórico e auditoria. Não é permitida nenhuma alteração de status, itens, recebimento de pagamento ou despacho.
                </p>
                {pedidoSelecionado.observacoes && (
                  <p className="text-rose-200/80 font-mono text-[11px] pt-1">
                    Observação / Motivo: {pedidoSelecionado.observacoes}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* GRID PRINCIPAL: COLUNA ESQUERDA (CLIENTE, OBS, ITENS) + COLUNA DIREITA (RESUMO, PAGAMENTO, RECIBO, HISTÓRICO) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* COLUNA ESQUERDA (7 colunas) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Card Cliente (TELA002) */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente</span>
                  {pedidoSelecionado.status !== 'cancelado' && (
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
                  )}
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
                    disabled={pedidoSelecionado.status === 'cancelado'}
                    readOnly={pedidoSelecionado.status === 'cancelado'}
                    onChange={(e) => setObservacaoTexto(e.target.value)}
                    onBlur={handleSalvarObservacao}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <label className={`flex items-center gap-2 text-xs text-slate-400 ${pedidoSelecionado.status === 'cancelado' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      disabled={pedidoSelecionado.status === 'cancelado'}
                      checked={exibirObsRecibo}
                      onChange={(e) => setExibirObsRecibo(e.target.checked)}
                      className="rounded text-emerald-500 focus:ring-emerald-500 border-slate-700 bg-slate-950 disabled:cursor-not-allowed"
                    />
                    <span>Exibir no recibo</span>
                  </label>
                </div>
              </div>

              {/* Card Logística & Envio (Desktop) */}
              {(() => {
                const { prov, provNome, pe, rawPe } = resolverProvedorEntrega(pedidoSelecionado, entregaPedido);

                console.log('DEBUG PEDIDO ENTREGA:', { id: pedidoSelecionado.id, pe: rawPe, prov });

                const temDadosEntrega = Boolean(pe || pedidoSelecionado.endereco_entrega || pedidoSelecionado.entregador_nome || Number(pedidoSelecionado.valor_frete || 0) > 0);
                if (!temDadosEntrega) return null;

                const entregador = pe?.entregador_nome || pedidoSelecionado.entregador_nome;
                const linkRastreio = pe?.link_rastreio || pedidoSelecionado.link_rastreio;
                const codigoRastreio = pe?.codigo_rastreio || pedidoSelecionado.codigo_rastreio;
                const pin = pe?.pin_entrega;
                const despachadoEm = pe?.despachado_em || pedidoSelecionado.despachado_em;

                return (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                      <div className="flex items-center gap-2 font-bold text-slate-200 text-xs uppercase tracking-wider">
                        <Truck className="w-4 h-4 text-emerald-400" />
                        <span>Logística & Despacho</span>
                      </div>
                      <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                        {provNome}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      {pedidoSelecionado.endereco_entrega && (
                        <div>
                          <span className="text-slate-400 block text-[11px]">Endereço de Entrega:</span>
                          <span className="font-semibold text-slate-200">{pedidoSelecionado.endereco_entrega}</span>
                        </div>
                      )}

                      {(codigoRastreio || despachadoEm || pedidoSelecionado.status === 'enviado') && (
                        <div className="flex justify-between items-center pt-1 border-t border-slate-800/60">
                          <span className="text-slate-400">Código de Rastreio:</span>
                          {codigoRastreio ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-200 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                {codigoRastreio}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(codigoRastreio);
                                  mostrarSucesso('Código de rastreio copiado!');
                                }}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                                title="Copiar código de rastreio"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-amber-400 italic">
                                Pendente de sincronização
                              </span>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    mostrarSucesso('Sincronizando com a transportadora...');
                                    await supabase.functions.invoke('melhor-envio-despacho', {
                                      body: {
                                        pedidoId: pedidoSelecionado.id,
                                        loja_id: loja?.id || pedidoSelecionado.loja_id,
                                        acao: 'sincronizar_rastreio',
                                        isSandbox: true
                                      }
                                    });
                                    await carregarPedidos();
                                    mostrarSucesso('Rastreamento sincronizado com sucesso!');
                                  } catch {
                                    mostrarErro('Não foi possível sincronizar no momento.');
                                  }
                                }}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                                title="Sincronizar código de rastreio agora"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {entregador && (
                        <div className="flex justify-between items-center pt-1 border-t border-slate-800/60">
                          <span className="text-slate-400">Entregador:</span>
                          <span className="font-bold text-slate-200">{entregador}</span>
                        </div>
                      )}

                      {pin && (
                        <div className="flex justify-between items-center pt-1 border-t border-slate-800/60">
                          <span className="text-slate-400">PIN de Confirmação:</span>
                          <span className="font-mono font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            {pin}
                          </span>
                        </div>
                      )}

                      {despachadoEm && (
                        <div className="flex justify-between items-center pt-1 border-t border-slate-800/60">
                          <span className="text-slate-400">Despachado em:</span>
                          <span className="text-slate-300">{new Date(despachadoEm).toLocaleString('pt-BR')}</span>
                        </div>
                      )}

                      {(linkRastreio || codigoRastreio || despachadoEm || pedidoSelecionado.status === 'enviado') && (() => {
                        if (ehDespachoCorreios) {
                          return (
                            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setPedidoRastreioModal(pedidoSelecionado)}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-md shadow-emerald-500/20 cursor-pointer active:scale-95"
                              >
                                <Package className="w-4 h-4" />
                                <span>Rastrear Envio nos Correios</span>
                              </button>

                              {(pe?.link_etiqueta || (pedidoSelecionado as any).link_etiqueta) && (
                                <a
                                  href={pe?.link_etiqueta || (pedidoSelecionado as any).link_etiqueta}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-bold text-xs transition cursor-pointer"
                                  title="Imprimir Etiqueta Oficial dos Correios (PDF)"
                                >
                                  <Tag className="w-3.5 h-3.5" />
                                  <span>Imprimir Etiqueta</span>
                                </a>
                              )}
                            </div>
                          );
                        }

                        const ehUber =
                          prov === 'uber' ||
                          (pedidoSelecionado.nome_app && pedidoSelecionado.nome_app.toLowerCase().includes('uber')) ||
                          (linkRastreio && (linkRastreio.includes('uber.com') || linkRastreio.includes('ubr.to')));

                        return (
                          <div className="pt-2">
                            {ehUber && linkRastreio ? (
                              <div className="space-y-2">
                                <a
                                  href={linkRastreio}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full py-2.5 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 transition cursor-pointer active:scale-95"
                                >
                                  <span>🚗 Acompanhar Motorista no Mapa ao Vivo</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleCopiarRastreioUber(pedidoSelecionado)}
                                    className="flex-1 py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                                    title="Copiar link de rastreio da Uber"
                                  >
                                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Copiar Link</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCompartilharRastreioUber(pedidoSelecionado)}
                                    className="flex-1 py-1.5 px-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                                    title="Enviar link de rastreio para o cliente no WhatsApp"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    <span>WhatsApp</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPedidoRastreioModal(pedidoSelecionado)}
                                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 font-bold text-xs transition cursor-pointer"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>Acompanhar Rastreio em Tempo Real</span>
                                </button>

                                {(pe?.link_etiqueta || (pedidoSelecionado as any).link_etiqueta) && (
                                  <a
                                    href={pe?.link_etiqueta || (pedidoSelecionado as any).link_etiqueta}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-bold text-xs transition cursor-pointer"
                                    title="Imprimir Etiqueta Oficial da Transportadora (PDF)"
                                  >
                                    <Tag className="w-3.5 h-3.5" />
                                    <span>Imprimir Etiqueta</span>
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}

              {/* Card Itens do Pedido (TELA002 / TELA002A) */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-sm font-bold text-slate-100">
                    {pedidoSelecionado.itens?.length || 0} itens no pedido
                  </span>
                  {podeEditarPedido(pedidoSelecionado) && (
                    <button
                      type="button"
                      onClick={() => handleEditarPedido(pedidoSelecionado)}
                      className="text-xs text-emerald-400 hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Editar itens</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {pedidoSelecionado.itens?.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-xs shrink-0">
                          {item.quantidade}x
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-200 block truncate">
                            {item.nome_produto || item.produto?.nome || 'Produto'}
                          </span>
                          {item.codigo_barras && (
                            <span className="text-[10px] text-slate-500 font-mono block">
                              EAN: {item.codigo_barras}
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
                  {podeEditarPedido(pedidoSelecionado) && (
                    <button
                      type="button"
                      onClick={() => handleEditarPedido(pedidoSelecionado)}
                      className="text-xs text-emerald-400 hover:underline font-bold cursor-pointer"
                    >
                      Editar
                    </button>
                  )}
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

                  <div className="flex justify-between text-slate-300">
                    <span>Valor do frete</span>
                    <span className={Number(pedidoSelecionado.valor_frete || 0) === 0 ? "text-emerald-400 font-bold" : "font-bold"}>
                      {Number(pedidoSelecionado.valor_frete || 0) > 0
                        ? `R$ ${Number(pedidoSelecionado.valor_frete).toFixed(2)}`
                        : 'Grátis'}
                    </span>
                  </div>

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
                  {pedidoSelecionado.status !== 'cancelado' && (
                    <button
                      type="button"
                      onClick={() => setPedidoReceberModal(pedidoSelecionado)}
                      className="text-xs text-emerald-400 hover:underline font-bold cursor-pointer"
                    >
                      Editar
                    </button>
                  )}
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

                {resolverStatusPagamento(pedidoSelecionado) === 'fiado' && (() => {
                  const infoVenc = obterInfoVencimentoFiado(pedidoSelecionado);
                  return (
                    <div className="flex items-center justify-between text-xs p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
                      <span className="text-slate-400 font-semibold">Data de Vencimento:</span>
                      <div className="text-right">
                        <span className={`font-bold ${infoVenc.estaVencido ? 'text-rose-400' : 'text-slate-200'}`}>
                          {infoVenc.formatada}
                        </span>
                        {infoVenc.estaVencido && (
                          <span className="text-[9px] font-black uppercase text-rose-300 bg-rose-500/20 border border-rose-500/30 px-1.5 py-0.2 rounded ml-1.5">
                            Vencido
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
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
                  {pedidoSelecionado.status === 'cancelado' && (
                    <div className="inline-block px-2.5 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-400 text-[10px] font-black uppercase tracking-wider">
                      CANCELADO
                    </div>
                  )}
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
                    const isEdicao = item.tipo === 'edicao';
                    const rotuloStatus = isEdicao ? (item.status || 'Edição no Pedido') : (ROTULOS_STATUS_PEDIDO[item.status] || item.status);
                    return (
                      <div key={idx} className="flex items-start gap-2.5">
                        <div
                          className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${
                            isEdicao
                              ? 'bg-amber-400 ring-4 ring-amber-400/20'
                              : isLast
                              ? 'bg-emerald-400 ring-4 ring-emerald-400/20'
                              : 'bg-slate-600'
                          }`}
                        />
                        <div>
                          <p className={`font-bold capitalize ${isEdicao ? 'text-amber-400' : isLast ? 'text-emerald-400' : 'text-slate-300'}`}>
                            {rotuloStatus}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-normal">
                            <span>{formatarData(item.data)}</span>
                            {item.usuario && <span>• Por {item.usuario}</span>}
                          </div>
                          {item.detalhes && (
                            <p className="text-[10px] text-slate-400 mt-0.5">{item.detalhes}</p>
                          )}
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
                {abasStatus.map((f) => {
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
                      <span className="bg-red-600 text-white text-[10px] font-black min-w-[18px] h-[18px] px-1.5 rounded-full flex items-center justify-center shadow-xs">
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
                      className="py-2.5 px-2 font-semibold cursor-pointer hover:text-slate-200 transition min-w-[85px]"
                      onClick={() => toggleOrdenacao('codigo')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Código</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      className="py-2.5 px-2 font-semibold cursor-pointer hover:text-slate-200 transition min-w-[95px]"
                      onClick={() => toggleOrdenacao('data')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Data</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold min-w-[130px]">Cliente</th>
                    <th className="py-2.5 px-2 font-semibold min-w-[110px]">Vendedor</th>
                    <th className="py-2.5 px-2 font-semibold text-center min-w-[70px]">Itens</th>
                    <th
                      className="py-2.5 px-2 font-semibold cursor-pointer hover:text-slate-200 transition min-w-[85px]"
                      onClick={() => toggleOrdenacao('valor')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Valor</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-2.5 px-2 font-semibold text-center min-w-[120px]">Status Pedido</th>
                    <th className="py-2.5 px-2 font-semibold text-center min-w-[130px]">Status Pagamento</th>
                    <th className="py-2.5 px-2 font-semibold text-center min-w-[115px]">Data Vencimento</th>
                    <th className="py-2.5 px-2 font-semibold text-center min-w-[120px]">Etiqueta Envio</th>
                    <th className="py-2.5 px-2 font-semibold text-center min-w-[130px]">Ações</th>
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
                        <td className="py-2.5 px-2 whitespace-nowrap font-medium">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              title="Ver Recibo do Pedido"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPedidoReciboModal(pedido);
                              }}
                              className="p-1 rounded-lg hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                            >
                              <Receipt className="w-3.5 h-3.5" />
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

                        <td className="py-2.5 px-2 whitespace-nowrap text-slate-300">
                          <span className={isCancelado ? 'line-through' : ''}>
                            {formatarData(pedido.data_venda || pedido.criado_em || '')}
                          </span>
                        </td>

                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          <span className="font-semibold text-slate-200">
                            {pedido.cliente?.nome || 'Cliente Avulso (Balcão)'}
                          </span>
                        </td>

                        <td className="py-2.5 px-2 whitespace-nowrap text-slate-400">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-slate-500" />
                              <span className={pedido.origem === 'catalogo_online' ? 'text-sky-400 font-semibold' : ''}>
                                {pedido.origem === 'catalogo_online' ? 'Catálogo Online' : (pedido.vendedor?.nome_completo || 'Vendedor')}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-2 whitespace-nowrap text-center">
                          <button
                            type="button"
                            onClick={() => setPedidoItensModal(pedido)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition cursor-pointer"
                          >
                            <Package className="w-3 h-3" />
                            <span>{totalItens} itens</span>
                          </button>
                        </td>

                        <td className="py-2.5 px-2 whitespace-nowrap">
                          <span className="font-black text-slate-100">
                            R$ {Number(pedido.valor_total || 0).toFixed(2)}
                          </span>
                        </td>

                        <td className="py-2.5 px-2 whitespace-nowrap text-center">
                          {(() => {
                            const infoVenc = obterInfoVencimentoFiado(pedido);
                            const temFiadoEmAberto = (pedido.pagamentos || []).some((pag: any) => pag.eh_pagamento_fiado || pag.forma_pagamento?.tipo === 'fiado') && !pedido.fiado_quitado;
                            const estaVencido = pedido.status === 'vencido' || (temFiadoEmAberto && pedido.status !== 'concluido' && pedido.status !== 'cancelado' && infoVenc.estaVencido);
                            return (
                              <div className="flex items-center justify-center">
                                {getStatusBadge(estaVencido ? 'vencido' : pedido.status, pedido)}
                              </div>
                            );
                          })()}
                        </td>

                        <td className="py-2.5 px-2 whitespace-nowrap text-center">
                          {getStatusPagamentoBadge(statusPag)}
                        </td>

                        <td className="py-2.5 px-2 whitespace-nowrap text-center">
                          {statusPag === 'fiado' ? (() => {
                            const infoVenc = obterInfoVencimentoFiado(pedido);
                            if (infoVenc.estaVencido) {
                              return (
                                <div className="inline-flex flex-col items-center">
                                  <span className="font-bold text-rose-400 text-xs">
                                    {infoVenc.formatada}
                                  </span>
                                  <span className="text-[9px] font-black uppercase text-rose-300 bg-rose-500/20 border border-rose-500/30 px-1.5 py-0.2 rounded mt-0.5 tracking-wider">
                                    Vencido
                                  </span>
                                </div>
                              );
                            }
                            return (
                              <span className="font-medium text-slate-300 text-xs">
                                {infoVenc.formatada}
                              </span>
                            );
                          })() : (
                            <span className="text-slate-600 font-mono text-xs">-</span>
                          )}
                        </td>

                        <td className="py-2.5 px-2 whitespace-nowrap text-center">
                          {(() => {
                            const { prov, pe, isRetirada } = resolverProvedorEntrega(pedido);
                            const temEtiqueta =
                              pedido.status !== 'cancelado' &&
                              !isRetirada &&
                              (prov === 'melhor_envio' ||
                               prov === 'uber' ||
                               pe?.provedor === 'uber' ||
                               pe?.tipo_operacao === 'correios' ||
                               pe?.tipo_operacao === 'transportadora' ||
                               pe?.servico_correios ||
                               pe?.nome_transportadora ||
                               pedido.servico_correios ||
                               pedido.nome_transportadora ||
                               Boolean(pedido.endereco_entrega) ||
                               (pedido as any).tipo_entrega === 'envio');

                            if (temEtiqueta) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => setPedidoEtiquetaModal(pedido)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 transition cursor-pointer"
                                  title="Imprimir Etiqueta de Envio"
                                >
                                  <Tag className="w-3 h-3" />
                                  <span>Etiqueta</span>
                                </button>
                              );
                            }
                            return <span className="text-slate-600 font-mono text-xs">-</span>;
                          })()}
                        </td>

                        <td className="py-2.5 px-2 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {pedido.status === 'cancelado' ? (
                              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30">
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Cancelado</span>
                              </div>
                            ) : (
                              <>
                                {podeEditarPedido(pedido) && (
                                  <button
                                    type="button"
                                    onClick={() => handleEditarPedido(pedido)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer"
                                    title="Editar itens e informações do pedido no PDV"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                    <span>Alterar</span>
                                  </button>
                                )}

                                {(pedido.status === 'aguardando_envio' && !pedido.forma_entrega_id && !pedido.nome_transportadora && Number(pedido.valor_frete || 0) === 0 && ((pedido as any).tipo_entrega === 'envio' || (pedido as any).tipo_atendimento === 'entrega')) ? (
                                  /* ETAPA 1: Escolher Envio (obrigatório antes do recebimento quando frete a calcular) */
                                  <button
                                    type="button"
                                    onClick={() => setPedidoEscolherEnvio(pedido)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm transition cursor-pointer active:scale-95"
                                    title="Definir modalidade de envio do pedido"
                                  >
                                    <Truck className="w-3.5 h-3.5" />
                                    <span>Escolher Envio</span>
                                  </button>
                                ) : (statusPag === 'fiado' && pedido.status === 'confirmado') ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPedidoReceberFiadoModal(pedido);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition cursor-pointer active:scale-95"
                                    title="Receber pagamento do fiado"
                                  >
                                    <DollarSign className="w-3.5 h-3.5" />
                                    <span>Receber Fiado</span>
                                  </button>
                                ) : pedido.status === 'aguardando_envio' ? (
                                  /* ETAPA 2: Frete definido -> Se aguardando pagamento: permite apenas [Receber] (e [Alterar] acima). Se pago/fiado: libera [Chamar Uber] ou [Confirmar Envio] */
                                  <div className="flex items-center gap-1">
                                    {statusPag !== 'pago' && statusPag !== 'fiado' ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPedidoReceberModal(pedido);
                                        }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 cursor-pointer"
                                        title="Receber pagamento com frete somado ao total"
                                      >
                                        <DollarSign className="w-3.5 h-3.5" />
                                        <span>Receber</span>
                                      </button>
                                    ) : (
                                      (() => {
                                        const { prov } = resolverProvedorEntrega(pedido);
                                        const isUber = prov === 'uber';
                                        const isMelhorEnvio = prov === 'melhor_envio';

                                        return (
                                          <button
                                            type="button"
                                            onClick={() => handleDespacharPedido(pedido)}
                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black text-white shadow-sm transition cursor-pointer active:scale-95 ${
                                              isUber
                                                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'
                                                : isMelhorEnvio
                                                ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
                                                : 'bg-emerald-600 hover:bg-emerald-500'
                                            }`}
                                            title={isUber ? 'Chamar Uber Flash / Direct' : isMelhorEnvio ? 'Gerar Envio no Melhor Envio' : 'Confirmar despacho manual'}
                                          >
                                            <Truck className="w-3.5 h-3.5" />
                                            <span>
                                              {isUber ? 'Chamar Uber' : isMelhorEnvio ? 'Gerar Envio' : 'Confirmar Envio'}
                                            </span>
                                          </button>
                                        );
                                      })()
                                    )}
                                  </div>
                                ) : statusPag !== 'pago' && statusPag !== 'fiado' ? (
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
                                ) : (pedido.status === 'enviado' || pedido.status === 'saiu_para_entrega' || pedido.status === 'entregue') ? (
                                  /* ETAPA 3: Concluir Pedido com ações de rastreio ao vivo para Uber */
                                  <div className="flex items-center gap-1">
                                    {(() => {
                                      const { prov, pe, provNome } = resolverProvedorEntrega(pedido);
                                      const link = (pedido.link_rastreio || pe?.link_rastreio || '').trim();
                                      const cod = (pedido.codigo_rastreio || pe?.codigo_rastreio || '').trim();
                                      const ehCorreios =
                                        provNome.toLowerCase().includes('correios') ||
                                        pe?.tipo_operacao === 'correios' ||
                                        (pedido as any)?.tipo_operacao === 'correios' ||
                                        Boolean(pedido.servico_correios || pe?.servico_correios) ||
                                        detectarServicoPorCodigo(cod) !== null;

                                      if (ehCorreios && cod) {
                                        return (
                                          <button
                                            type="button"
                                            onClick={() => setPedidoRastreioModal(pedido)}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition cursor-pointer"
                                            title="Rastrear envio nos Correios"
                                          >
                                            <Package className="w-3.5 h-3.5" />
                                            <span>Rastrear</span>
                                          </button>
                                        );
                                      }

                                      const ehUber =
                                        !ehCorreios &&
                                        (prov === 'uber' ||
                                        (pedido.nome_app && pedido.nome_app.toLowerCase().includes('uber')) ||
                                        link.includes('uber.com') ||
                                        link.includes('ubr.to'));

                                      if (ehUber && link) {
                                        return (
                                          <>
                                            <a
                                              href={link}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm transition cursor-pointer active:scale-95 border border-emerald-400"
                                              title="Abrir mapa de rastreio ao vivo da Uber Direct"
                                            >
                                              <span>🚗</span>
                                              <span>Mapa Uber</span>
                                              <ExternalLink className="w-3 h-3" />
                                            </a>
                                            <button
                                              type="button"
                                              onClick={() => handleCompartilharRastreioUber(pedido)}
                                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 transition cursor-pointer"
                                              title="Enviar link de rastreio da Uber no WhatsApp"
                                            >
                                              <MessageCircle className="w-3.5 h-3.5" />
                                            </button>
                                          </>
                                        );
                                      }
                                      return null;
                                    })()}
                                    <button
                                      type="button"
                                      onClick={() => atualizarStatus(pedido.id, 'concluido')}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition cursor-pointer active:scale-95"
                                      title="Concluir Pedido Entregue"
                                    >
                                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                      <span>Concluir</span>
                                    </button>
                                  </div>
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
                              </>
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
      {pedidoReciboModal && (() => {
        const rawPe = (pedidoReciboModal as any).pedido_entrega || (pedidoReciboModal as any).pedido_entregas;
        const pe = Array.isArray(rawPe) ? rawPe[0] : rawPe;
        const metaTransp = (pedidoReciboModal as any).metadados?.transportadora_nome;
        const metaTipo = (pedidoReciboModal as any).metadados?.tipo_atendimento;
        const ehRetirada = pe?.tipo_atendimento === 'retirada' ||
          metaTipo === 'retirada' ||
          (!pe && !metaTransp && Number(pedidoReciboModal.valor_frete || 0) === 0 && !pedidoReciboModal.endereco_entrega);

        let formaEntregaTexto = 'RETIRADA NA LOJA';
        let badgeEstilo = 'bg-purple-100 text-purple-800';

        if (!ehRetirada) {
          badgeEstilo = 'bg-emerald-100 text-emerald-800';
          const provedor = (pe?.provedor || (pedidoReciboModal as any).metadados?.provedor_frete || '').toLowerCase();
          const transp = (pe?.transportadora_nome || pe?.forma_entrega_nome || metaTransp || pedidoReciboModal.forma_entrega?.nome || (pedidoReciboModal as any).nome_transportadora || '').trim();
          const servico = (pe?.servico_codigo || (pedidoReciboModal as any).metadados?.servico_frete_codigo || '').toLowerCase();
          const servicoCorreios =
            (pedidoReciboModal as any)?.servico_correios ||
            pe?.servico_correios ||
            (servico === '1' || servico.includes('sedex') || transp.toLowerCase().includes('sedex') ? 'SEDEX' : '') ||
            (servico === '2' || servico.includes('pac') || transp.toLowerCase().includes('pac') ? 'PAC' : '') ||
            detectarServicoPorCodigo(pe?.codigo_rastreio || pedidoReciboModal.codigo_rastreio);

          const ehCorreios =
            provedor === 'correios' ||
            pe?.tipo_operacao === 'correios' ||
            (pedidoReciboModal as any)?.tipo_operacao === 'correios' ||
            transp.toLowerCase().includes('correios') ||
            servico.includes('correios') ||
            servico === '1' ||
            servico === '2' ||
            Boolean(servicoCorreios);

          if (ehCorreios) {
            formaEntregaTexto = servicoCorreios ? `CORREIOS (${servicoCorreios})` : 'CORREIOS';
          } else if (provedor === 'uber' || transp.toLowerCase().includes('uber') || servico.includes('uber')) {
            formaEntregaTexto = 'UBER FLASH';
          } else if (transp.toLowerCase().includes('jadlog') || servico.includes('jadlog') || servico === '3' || servico === '4') {
            formaEntregaTexto = 'JADLOG';
          } else if (transp && transp.toLowerCase() !== 'entrega' && transp.toLowerCase() !== 'entrega padrão' && transp.toLowerCase() !== 'envio a definir') {
            formaEntregaTexto = transp.toUpperCase();
          } else if (pedidoReciboModal.status === 'envio_pendente' && Number(pedidoReciboModal.valor_frete || 0) === 0) {
            formaEntregaTexto = 'ENVIO (A DEFINIR)';
          } else {
            formaEntregaTexto = 'ENTREGA';
          }
        }

        const enderecoDestino = (() => {
          if (pe?.destino_logradouro) {
            const comp = pe.destino_complemento ? ` - ${pe.destino_complemento}` : '';
            const cep = pe.destino_cep ? ` (CEP: ${pe.destino_cep})` : '';
            return `${pe.destino_logradouro}, ${pe.destino_numero || 'S/N'}${comp}, ${pe.destino_bairro}, ${pe.destino_cidade}-${pe.destino_uf}${cep}`;
          }
          if (pedidoReciboModal.endereco_entrega) {
            return pedidoReciboModal.endereco_entrega;
          }
          if (pedidoReciboModal.cliente?.endereco_principal) {
            return pedidoReciboModal.cliente.endereco_principal;
          }
          return 'Endereço não informado';
        })();

        const pagInfo = obterDadosPagamentoRecibo(pedidoReciboModal);
        const subtotalProdutos = Number((pedidoReciboModal as any).subtotal_produtos || pedidoReciboModal.subtotal || pedidoReciboModal.valor_total || 0);
        const valorDesconto = Number(pedidoReciboModal.valor_desconto || 0);
        const valorFrete = Number(pedidoReciboModal.valor_frete || 0);
        const valorTotal = Number(pedidoReciboModal.valor_total || 0);

        return (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 shrink-0">
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

              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-slate-950/90 flex justify-center items-start custom-scrollbar">
                <div className="w-full max-w-sm bg-white text-slate-900 rounded-xl p-5 pb-8 sm:p-6 sm:pb-8 shadow-2xl border border-slate-300 font-mono text-xs space-y-3 min-h-fit mb-6">
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

                  {/* Forma de Entrega & Endereço */}
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200 border-dashed text-[11px] space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-700 uppercase">Forma de Entrega:</span>
                      <span className={`font-black px-1.5 py-0.5 rounded text-[10px] ${badgeEstilo}`}>
                        {formaEntregaTexto}
                      </span>
                    </div>
                    <div className="text-slate-600 pt-0.5">
                      <strong className="text-slate-800">{ehRetirada ? 'Local de Retirada:' : 'Endereço de Entrega:'} </strong>
                      <span>{ehRetirada ? enderecoLojaFormatado : enderecoDestino}</span>
                    </div>
                    {pe?.codigo_rastreio && (
                      <div className="text-emerald-700 font-bold pt-0.5">
                        Rastreio: {pe.codigo_rastreio}
                      </div>
                    )}
                  </div>

                  {/* Itens */}
                  <div className="space-y-2 border-b border-slate-300 border-dashed pb-2">
                    <span className="font-bold text-slate-600 uppercase tracking-wider text-[10px] block">
                      Itens ({calcularTotalItens(pedidoReciboModal)} un)
                    </span>
                    {pedidoReciboModal.itens?.map((item, idx) => (
                      <div key={idx} className="flex justify-between py-0.5 text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{item.quantidade}x</span>
                          <span className="text-slate-800">{item.nome_produto}</span>
                        </div>
                        <span className="font-bold text-slate-900 whitespace-nowrap pl-2">
                          R$ {Number(item.subtotal || item.preco_venda_unitario * item.quantidade || 0).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Fechamento Financeiro */}
                  <div className="space-y-1.5 text-xs text-slate-700">
                    <div className="flex justify-between text-slate-800">
                      <span>Subtotal dos Produtos:</span>
                      <span className="font-semibold text-slate-900">
                        R$ {subtotalProdutos.toFixed(2)}
                      </span>
                    </div>

                    {valorDesconto > 0 && (
                      <div className="flex justify-between text-red-600 font-bold">
                        <span>Desconto Aplicado:</span>
                        <span>- R$ {valorDesconto.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-slate-800">
                      <span>Frete{formaEntregaTexto && !ehRetirada ? ` (${formaEntregaTexto})` : ''}:</span>
                      <span className="font-semibold text-slate-900">
                        {valorFrete > 0 
                          ? `+ R$ ${valorFrete.toFixed(2)}` 
                          : ehRetirada 
                            ? 'Grátis (Retirada)'
                            : 'A Definir'}
                      </span>
                    </div>

                    <div className="border-t border-dashed border-slate-300 pt-2 my-1"></div>

                    <div className="flex justify-between items-center text-sm font-black text-slate-950 pt-0.5">
                      <span>VALOR TOTAL:</span>
                      <span className="text-base font-black">R$ {valorTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Dados do Pagamento (Após o Valor Total) */}
                  {pagInfo.ehFiado && Number(pedidoReciboModal.saldo_devedor || 0) > 0 && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-center space-y-0.5">
                      <span className="text-[10px] font-bold text-red-800 uppercase tracking-wider block">Saldo a Pagar (Fiado)</span>
                      <span className="text-sm font-black text-red-600 block">R$ {Number(pedidoReciboModal.saldo_devedor).toFixed(2)}</span>
                      <span className="text-[11px] font-bold text-red-700 block pt-0.5">
                        Data de Vencimento: {obterInfoVencimentoFiado(pedidoReciboModal).formatada}
                      </span>
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
                </div>
              </div>

              {/* Footer do Modal de Recibo com Ações e Link "Editar meu recibo" (TELA007 / TELA010) */}
              <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
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
        );
      })()}

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

      </div>

      {/* MODAL DE DETALHES DO PRODUTO */}
      <ModalDetalhesProduto
        isOpen={!!produtoDetalhesModal}
        produto={produtoDetalhesModal}
        onClose={() => setProdutoDetalhesModal(null)}
      />

      {/* MODAL OFICIAL DE PAGAMENTO & FECHAMENTO */}
      <ModalPagamentoFechamento
        isOpen={!!pedidoReceberModal}
        pedido={pedidoReceberModal}
        concluirAoQuitar={concluirAposReceber}
        onClose={() => {
          setPedidoReceberModal(null);
          setConcluirAposReceber(false);
        }}
        onPagamentoConcluido={(pedidoAtualizado) => {
          setPedidoReceberModal(null);
          setConcluirAposReceber(false);
          if (pedidoAtualizado && pedidoSelecionado?.id === pedidoAtualizado.id) {
            setPedidoSelecionado(pedidoAtualizado);
          }
          carregarPedidos();
        }}
      />

      {/* MODAL DE RECEBER PAGAMENTO DO FIADO (COM DEVOLUÇÃO DE CRÉDITO) */}
      <ModalReceberFiado
        isOpen={!!pedidoReceberFiadoModal}
        pedido={pedidoReceberFiadoModal}
        cliente={clientes.find(c => c.id === pedidoReceberFiadoModal?.cliente_id) || (pedidoReceberFiadoModal?.cliente as any) || null}
        onClose={() => setPedidoReceberFiadoModal(null)}
        onRecebimentoConcluido={(pedidoAtualizado) => {
          setPedidoReceberFiadoModal(null);
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

      {/* MODAL DESPACHO FRETE PRÓPRIO (DESKTOP) */}
      {modalDespachoAberto && pedidoSelecionado && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-100">
                    Despachar Pedido #{pedidoSelecionado.numero_pedido}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {entregaPedido?.transportadora_nome || 'Despacho Logístico'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalDespachoAberto(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {pedidoSelecionado.endereco_entrega && (
                <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">
                    Destino da Entrega:
                  </span>
                  <p className="text-slate-200 font-medium text-xs leading-relaxed">
                    {pedidoSelecionado.endereco_entrega}
                  </p>
                </div>
              )}

              {(() => {
                const opTipo = entregaPedido?.tipo_operacao || (pedidoSelecionado as any)?.tipo_operacao || entregaPedido?.tipo_entrega;

                return (
                  <div className="space-y-3.5">
                    {/* MEIO: Frota Própria / Motoboy */}
                    {(opTipo === 'frota_propria' || opTipo === 'motoboy' || opTipo === 'proprio' || (!opTipo && (entregadorNomeDespacho || !linkRastreioDespacho))) && (
                      <div className="space-y-2.5 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">
                          🛵 Dados do Entregador / Motoboy
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 block">Nome:</label>
                            <input
                              type="text"
                              placeholder="Ex: Carlos (Moto)"
                              value={entregadorNomeDespacho}
                              onChange={(e) => setEntregadorNomeDespacho(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 block">Contato / Telefone:</label>
                            <input
                              type="text"
                              placeholder="Ex: (85) 99999-0000"
                              value={contatoEntregadorDespacho}
                              onChange={(e) => setContatoEntregadorDespacho(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* MEIO: App de Corrida (Uber / 99 / etc.) */}
                    {(opTipo === 'app_entrega' || (!opTipo && (linkRastreioDespacho || pinEntregaDespacho))) && (
                      <div className="space-y-2.5 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">
                          📍 Corrida por Aplicativo (Uber / 99)
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 block">App de Corrida:</label>
                            <select
                              value={nomeAppDespacho}
                              onChange={(e) => setNomeAppDespacho(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-medium"
                            >
                              <option value="Uber">Uber Flash</option>
                              <option value="99">99 Entregas</option>
                              <option value="Lalamove">Lalamove</option>
                              <option value="Outro">Outro App</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 block flex items-center justify-between">
                              <span>PIN da Corrida:</span>
                              <span className="text-[10px] text-emerald-400 font-bold">4 dígitos</span>
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={4}
                              placeholder="Ex: 4892"
                              value={pinEntregaDespacho}
                              onChange={(e) => setPinEntregaDespacho(e.target.value.replace(/\D/g, '').slice(0, 4))}
                              className="w-full bg-slate-900 border-2 border-emerald-500/60 rounded-xl px-3 py-2 text-xs text-emerald-300 font-black tracking-widest text-center focus:outline-none focus:border-emerald-400"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-300 block">Link de Rastreio da Corrida:</label>
                          <input
                            type="url"
                            placeholder="https://trip.uber.com/... ou https://99app.com/..."
                            value={linkRastreioDespacho}
                            onChange={(e) => setLinkRastreioDespacho(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* MEIO: Correios */}
                    {(opTipo === 'correios' || ehDespachoCorreios) && (
                      <div className="space-y-2.5 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                            <span>📦</span> Correios (PAC / SEDEX)
                          </span>
                          {codigoRastreioDespacho && (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                validacaoCorreiosDespacho.valido
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              }`}
                            >
                              {validacaoCorreiosDespacho.valido ? 'Padrão Válido' : 'Padrão Inválido'}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 block">
                              Serviço: <span className="text-rose-400">*</span>
                            </label>
                            <select
                              value={servicoCorreiosDespacho}
                              onChange={(e) => setServicoCorreiosDespacho(e.target.value as 'PAC' | 'SEDEX')}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-medium"
                            >
                              <option value="SEDEX">SEDEX</option>
                              <option value="PAC">PAC</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 block">
                              Código de Rastreamento: <span className="text-rose-400">*</span>
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                maxLength={13}
                                placeholder={servicoCorreiosDespacho === 'PAC' ? 'Ex: QB123456789BR' : 'Ex: SB123456789BR'}
                                value={codigoRastreioDespacho}
                                onChange={(e) => {
                                  const val = e.target.value.toUpperCase().replace(/\s+/g, '').slice(0, 13);
                                  setCodigoRastreioDespacho(val);
                                }}
                                className={`w-full bg-slate-900 border rounded-xl px-3 py-2 text-xs text-slate-100 uppercase font-mono font-bold placeholder:text-slate-500 focus:outline-none tracking-wider ${
                                  codigoRastreioDespacho.length > 0
                                    ? validacaoCorreiosDespacho.valido
                                      ? 'border-emerald-500/80 focus:border-emerald-500 text-emerald-300'
                                      : 'border-rose-500/80 focus:border-rose-500 text-rose-300'
                                    : 'border-slate-700 focus:border-emerald-500'
                                }`}
                              />
                              {codigoRastreioDespacho && (
                                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                  {validacaoCorreiosDespacho.valido ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  ) : (
                                    <AlertCircle className="w-4 h-4 text-rose-400" />
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Mensagens de Crítica e Feedback em tempo real */}
                        <div className="pt-0.5">
                          {!codigoRastreioDespacho ? (
                            <p className="text-[11px] text-amber-400/90 font-medium flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                              <span>Obrigatório preencher o código no padrão dos Correios (13 dígitos: 2 letras + 9 números + BR).</span>
                            </p>
                          ) : !validacaoCorreiosDespacho.valido ? (
                            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-1.5 text-[11px]">
                              <div className="flex items-start gap-1.5 font-bold">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
                                <span>{validacaoCorreiosDespacho.motivo}</span>
                              </div>
                              {validacaoCorreiosDespacho.servicoDetectado &&
                                validacaoCorreiosDespacho.servicoDetectado !== servicoCorreiosDespacho &&
                                validacaoCorreiosDespacho.servicoDetectado !== 'OUTRO' && (
                                  <div className="pt-0.5 flex items-center gap-2">
                                    <span className="text-[10px] text-slate-300">Prefixo identificado como {validacaoCorreiosDespacho.servicoDetectado}:</span>
                                    <button
                                      type="button"
                                      onClick={() => setServicoCorreiosDespacho(validacaoCorreiosDespacho.servicoDetectado as 'PAC' | 'SEDEX')}
                                      className="px-2 py-0.5 rounded-lg bg-rose-500/30 hover:bg-rose-500/40 text-rose-100 text-[10px] font-bold underline cursor-pointer transition"
                                    >
                                      Mudar serviço para {validacaoCorreiosDespacho.servicoDetectado}
                                    </button>
                                  </div>
                                )}
                            </div>
                          ) : (
                            <p className="text-[11px] text-emerald-400 font-bold flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                              <span>Código de rastreamento {servicoCorreiosDespacho} validado com sucesso!</span>
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* MEIO: Transportadora */}
                    {opTipo === 'transportadora' && (
                      <div className="space-y-2.5 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">
                          🚛 Transportadora Privada
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 block">Nome da Transportadora:</label>
                            <input
                              type="text"
                              placeholder="Ex: Jadlog, Total Express"
                              value={nomeTransportadoraDespacho}
                              onChange={(e) => setNomeTransportadoraDespacho(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 block">Código de Rastreio:</label>
                            <input
                              type="text"
                              placeholder="Ex: JAD12345678"
                              value={codigoRastreioDespacho}
                              onChange={(e) => setCodigoRastreioDespacho(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 uppercase font-mono font-bold placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setModalDespachoAberto(false)}
                disabled={despachando}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              {(() => {
                const podeConfirmar = !despachando && (!ehDespachoCorreios || validacaoCorreiosDespacho.valido);
                return (
                  <button
                    type="button"
                    onClick={handleConfirmarDespacho}
                    disabled={!podeConfirmar}
                    className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition ${
                      podeConfirmar
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 cursor-pointer active:scale-95'
                        : 'bg-slate-800 text-slate-500 border border-slate-700/80 cursor-not-allowed opacity-60'
                    }`}
                    title={!podeConfirmar && ehDespachoCorreios ? validacaoCorreiosDespacho.motivo || 'Informe o código de rastreamento válido dos Correios' : undefined}
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>{despachando ? 'Despachando...' : 'Confirmar e Concluir'}</span>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONTINGÊNCIA RBAC (DESKTOP) */}
      {modalContingenciaAberto && pedidoSelecionado && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-100">
                    Válvula de Contingência (Admin)
                  </h3>
                  <p className="text-[11px] text-slate-400">Despacho manual forçado</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalContingenciaAberto(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2 text-xs text-amber-300">
              <p className="font-bold text-amber-200">
                Deseja forçar o despacho do Pedido #{pedidoSelecionado.numero_pedido}?
              </p>
              <p className="text-[11px] text-amber-300/80 leading-relaxed">
                Esta ação é exclusiva para Gerentes/Administradores e deve ser usada caso a API da transportadora parceira (Uber/Melhor Envio) esteja indisponível ou a entrega tenha sido resolvida por fora. O status mudará para &quot;Saiu para Entrega&quot;.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setModalContingenciaAberto(false)}
                disabled={executandoContingencia}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleForcarConclusaoContingencia}
                disabled={executandoContingencia}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{executandoContingencia ? 'Despachando...' : 'Sim, Forçar Despacho'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPRIMIR ETIQUETA DE ENVIO */}
      <ModalImprimirEtiqueta
        isOpen={!!pedidoEtiquetaModal}
        pedido={pedidoEtiquetaModal}
        loja={loja}
        onClose={() => setPedidoEtiquetaModal(null)}
      />

      {/* MODAL RASTREIO E TIMELINE DA ENTREGA */}
      <ModalRastreioPedido
        isOpen={Boolean(pedidoRastreioModal)}
        pedido={pedidoRastreioModal}
        entrega={entregaPedido}
        loja={loja}
        onClose={() => setPedidoRastreioModal(null)}
        onAtualizarStatus={() => carregarPedidos()}
      />

      {/* MODAL DEFINIR ENVIO (FLUXO ESTÁTICO DE EXPEDIÇÃO COM CONFIRMAÇÃO EXPLÍCITA) */}
      <ModalDefinirEnvio
        isOpen={Boolean(pedidoEscolherEnvio)}
        pedido={pedidoEscolherEnvio}
        loja={loja}
        usuario={usuario}
        onClose={() => setPedidoEscolherEnvio(null)}
        onSucesso={() => carregarPedidos()}
        onFeedbackSucesso={(msg) => mostrarSucesso(msg)}
        onFeedbackErro={(msg) => mostrarErro(msg)}
      />

      {/* MODAL PARA PREENCHER CPF/CNPJ DO CLIENTE (MELHOR ENVIO) */}
      {modalCpfClienteAberto && pedidoPendenteDespacho && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-100">
                    CPF/CNPJ do Destinatário
                  </h3>
                  <p className="text-[11px] text-teal-400 font-semibold uppercase tracking-wider">
                    Melhor Envio (Correios / Jadlog)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalCpfClienteAberto(false);
                  setPedidoPendenteDespacho(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-2xl space-y-1.5 text-xs text-slate-300">
              <p className="font-bold text-slate-200">
                Cliente: {pedidoPendenteDespacho.ped.cliente?.nome || pedidoPendenteDespacho.ped.cliente_nome_avulso || 'Destinatário'}
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                As transportadoras parceiras (Correios e Jadlog) exigem obrigatoriamente o CPF ou CNPJ do destinatário para emissão e rastreamento da etiqueta fiscal.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                CPF ou CNPJ do Cliente:
              </label>
              <input
                type="text"
                autoFocus
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                value={cpfClienteInput}
                onChange={(e) => setCpfClienteInput(formatarMascaraDocumento(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-teal-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 font-mono focus:outline-none transition"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCpfClienteInput('012.345.678-90')}
                className="text-[11px] text-teal-400 hover:text-teal-300 underline font-semibold transition cursor-pointer"
                title="Preencher documento fictício para testes no Sandbox"
              >
                Preencher CPF Teste
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalCpfClienteAberto(false);
                    setPedidoPendenteDespacho(null);
                  }}
                  disabled={salvandoCpfEDespachando}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSalvarCpfEContinuarDespacho}
                  disabled={salvandoCpfEDespachando || !cpfClienteInput.trim()}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-teal-500/20 transition cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {salvandoCpfEDespachando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Gerando Envio...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Salvar e Gerar Envio</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
