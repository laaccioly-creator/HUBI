import React, { useState, useEffect, useMemo } from 'react';
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
  UserPlus,
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
  AlertCircle,
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
  FileText,
  Settings,
  LogOut,
  Printer,
  Truck,
  ExternalLink,
  Scale,
  Home,
  Copy,
  RefreshCw,
  Loader2,
  Ban,
  Paperclip
} from 'lucide-react';
import { ModalVisualizarComprovantePedido } from './pedidos/ModalVisualizarComprovantePedido';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePermissions } from '../hooks/usePermissions';
import { useRegisterOverlay } from '../hooks/useRegisterOverlay';
import { ShippingOrchestrator } from '../services/shippingOrchestrator';
import { Pedido, StatusPedido, StatusPagamento, Cliente, UsuarioLoja } from '../types';
import { PedidoEntrega, Transportadora } from '../types/shipping';
import { AgendamentoServico } from '../types/agendamento';
import { agendamentoService, filtrarAgendamentosVigentesDoPedido } from '../services/agendamentoService';
import { extrairObservacaoLimpa, formatarMoeda, normalizarTelefoneComDDI } from '../utils/formatters';
import {
  formatarDataLocal,
  formatarDataHoraLocal,
  obterDataLocalYYYYMMDD,
  obterInicioDiaISO,
  obterFimDiaISO
} from '../utils/dateTime';
import { extrairInfoVisitaPedido } from '../utils/taxaDomicilioUtils';
import {
  calcularResumoFinanceiroPedido,
  extrairDetalhesAgendamentosPedido,
  type AgendamentoReciboInput,
  type PedidoReciboInput
} from '../utils/reciboServicoHelper';
import { validarRastreioCorreios, detectarServicoPorCodigo } from '../utils/correiosValidator';
import { formatarNomeTransportadora } from '../utils/shippingDisplay';
import { ModalRastreioPedido } from './shipping/ModalRastreioPedido';
import { ModalDespacharPedido } from './shipping/ModalDespacharPedido';
import { ModalImprimirEtiqueta } from './shipping/ModalImprimirEtiqueta';
import { ReciboPedidoModal } from './pedidos/ReciboPedidoModal';
import { ModalConferenciaPesagemPedido } from './pedidos/ModalConferenciaPesagemPedido';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import {
  ROTULOS_STATUS_PEDIDO,
  ROTULOS_STATUS_PAGAMENTO,
  extrairInfoPagamentoEntrega,
  ehPedidoExclusivoServico,
  obterAbasStatusVisiveis,
  obterOpcoesStatusAlteracao,
  obterInfoVencimentoFiado,
  podeEditarPedido
} from '../utils/statusPedidoUtils';

import {
  HistoricoItem,
  extrairHistoricoPedidoConsolidado,
  formatarDataHoraHistorico
} from '../utils/historicoPedidoUtils';

const extrairHistoricoPedidoMobile = (pedido: Pedido): HistoricoItem[] => {
  return extrairHistoricoPedidoConsolidado(pedido);
};
import { PrintService, formatarDataRecibo, obterDadosPagamentoRecibo } from '../services/printService';
import { ClientePerfilMobile } from './ClientePerfilMobile';
import { MobileHeader } from './layout/MobileHeader';
import { ModalHistoricoFiadoCliente } from './ModalHistoricoFiadoCliente';
import { ModalDefinirEnvio } from './pedidos/ModalDefinirEnvio';

const extrairFormaLimpa = (forma?: string): string => {
  if (!forma) return '';
  const match = forma.match(/Pagamento\s*\((.+)\)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return forma.replace(/^Pagamento\s*[-:]?\s*/i, '').trim();
};

const formatarDataLocalYMD = (d: Date): string => {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
};

interface PedidosListaMobileProps {
  pedidos: Pedido[];
  clientes: Cliente[];
  usuarios: UsuarioLoja[];
  carregando: boolean;
  pedidoSelecionadoInicial?: Pedido | null;
  onVoltarOrigem?: () => void;
  onAlterarStatus: (
    pedidoId: string,
    novoStatus: StatusPedido,
    motivoCancelamento?: string,
    acaoConclusaoDireta?: boolean
  ) => Promise<void> | void;
  onCancelarPedido: (pedido: Pedido, motivo?: string) => Promise<void> | void;
  onAbrirReceberPagamento: (pedido: Pedido) => void;
  onAbrirReceberFiado?: (pedido: Pedido) => void;
  onAbrirDrawerMenu?: () => void;
  onClienteAtualizado: (cliente: Cliente) => void;
  onRecarregar?: () => void;
  onDespacharPedido?: (pedido: Pedido) => void;
  onImprimirEtiquetaMl?: (pedido: Pedido) => void;
  imprimindoEtiquetaMlId?: string | null;
  onAbrirNovoCliente?: () => void;
}

export const PedidosListaMobile: React.FC<PedidosListaMobileProps> = ({
  pedidos,
  clientes,
  usuarios,
  carregando,
  pedidoSelecionadoInicial,
  onVoltarOrigem,
  onAlterarStatus,
  onCancelarPedido,
  onAbrirReceberPagamento,
  onAbrirReceberFiado,
  onClienteAtualizado,
  onRecarregar,
  onDespacharPedido,
  onImprimirEtiquetaMl,
  imprimindoEtiquetaMlId,
  onAbrirNovoCliente
}) => {
  const navigate = useNavigate();
  const { loja, usuario } = useAuth();
  const { carregarPedidoParaEdicao } = useCart();
  const { isDark } = useTheme();
  const { ehAdmin, ehGerente, podeVerPrecoCusto } = usePermissions();
  const { mostrarToast } = useFeedbackModal();
  const podeConcluirManual = ehAdmin || ehGerente;

  // Estados de Navegação de Telas
  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(pedidoSelecionadoInicial || null);

  useEffect(() => {
    if (pedidoSelecionadoInicial) {
      setPedidoSelecionado(pedidoSelecionadoInicial);
    }
  }, [pedidoSelecionadoInicial]);

  // Sincronização reativa instantânea do pedido aberto com a lista de pedidos
  useEffect(() => {
    if (pedidoSelecionado) {
      const match = pedidos.find(p => p.id === pedidoSelecionado.id);
      if (match) {
        setPedidoSelecionado(prev => {
          if (!prev) return match;
          return {
            ...prev,
            ...match,
            status: match.status,
            status_pagamento: match.status_pagamento,
            valor_pago: match.valor_pago,
            saldo_devedor: match.saldo_devedor,
            valor_total: match.valor_total,
            pagamentos: match.pagamentos || prev.pagamentos,
            historico: match.historico || prev.historico,
            pedido_entrega: match.pedido_entrega || prev.pedido_entrega,
            ...((match as any)?.pedido_entregas ? { pedido_entregas: (match as any).pedido_entregas } : {})
          };
        });
      }
    }
  }, [pedidos]);
  const [clientePerfilSelecionado, setClientePerfilSelecionado] = useState<Cliente | null>(null);
  const [clienteHistoricoFiadoModal, setClienteHistoricoFiadoModal] = useState<Cliente | null>(null);
  const [filtroHistoricoFiadoModal, setFiltroHistoricoFiadoModal] = useState<'todos' | 'vencidos' | 'a_vencer'>('a_vencer');
  const [pedidoReciboModal, setPedidoReciboModal] = useState<Pedido | null>(null);
  const [pedidoComprovanteModal, setPedidoComprovanteModal] = useState<Pedido | null>(null);
  const [pedidoRastreioModal, setPedidoRastreioModal] = useState<Pedido | null>(null);
  const [pedidoEtiquetaModal, setPedidoEtiquetaModal] = useState<Pedido | null>(null);
  const [modalDefinirEnvioAberto, setModalDefinirEnvioAberto] = useState<boolean>(false);
  const [pedidoParaPesagem, setPedidoParaPesagem] = useState<Pedido | null>(null);
  const [modalConfirmarCancelamentoAberto, setModalConfirmarCancelamentoAberto] = useState<boolean>(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState<string>('');
  const [cancelandoPedido, setCancelandoPedido] = useState<boolean>(false);
  const [editandoObsPedido, setEditandoObsPedido] = useState<boolean>(false);
  const [textoObsEditando, setTextoObsEditando] = useState<string>('');
  const [salvandoObs, setSalvandoObs] = useState<boolean>(false);
  const [linkRastreioEditando, setLinkRastreioEditando] = useState<boolean>(false);
  const [linkRastreioInput, setLinkRastreioInput] = useState<string>('');
  const [salvandoLinkRastreio, setSalvandoLinkRastreio] = useState<boolean>(false);
  const [sincronizandoRastreio, setSincronizandoRastreio] = useState<boolean>(false);

  // Estados de Despacho Logístico e Contingência RBAC
  const [modalDespachoAberto, setModalDespachoAberto] = useState<boolean>(false);
  const [entregadorNomeDespacho, setEntregadorNomeDespacho] = useState<string>('');
  const [contatoEntregadorDespacho, setContatoEntregadorDespacho] = useState<string>('');
  const [codigoRastreioDespacho, setCodigoRastreioDespacho] = useState<string>('');
  const [linkRastreioDespacho, setLinkRastreioDespacho] = useState<string>('');
  const [pinEntregaDespacho, setPinEntregaDespacho] = useState<string>('');
  const [nomeAppDespacho, setNomeAppDespacho] = useState<string>('');
  const [servicoCorreiosDespacho, setServicoCorreiosDespacho] = useState<'PAC' | 'SEDEX'>('SEDEX');
  const [nomeTransportadoraDespacho, setNomeTransportadoraDespacho] = useState<string>('');
  const [despachando, setDespachando] = useState<boolean>(false);
  const [modalContingenciaAberto, setModalContingenciaAberto] = useState<boolean>(false);
  const [executandoContingencia, setExecutandoContingencia] = useState<boolean>(false);
  const [entregaPedido, setEntregaPedido] = useState<PedidoEntrega | null>(null);
  const [agendamentosPedido, setAgendamentosPedido] = useState<AgendamentoServico[]>([]);

  useEffect(() => {
    if (pedidoSelecionado) {
      if (pedidoSelecionado.pedido_entrega) {
        setEntregaPedido(pedidoSelecionado.pedido_entrega);
      } else {
        ShippingOrchestrator.buscarPedidoEntrega(pedidoSelecionado.id).then(entrega => {
          setEntregaPedido(entrega);
        });
      }
    } else {
      setEntregaPedido(null);
    }
  }, [pedidoSelecionado]);

  useEffect(() => {
    let ativo = true;
    const pedidoId = pedidoSelecionado?.id;
    const lojaId = loja?.id ? String(loja.id) : '';

    if (!pedidoId || !lojaId) {
      setAgendamentosPedido([]);
      return;
    }

    const itensDoPedido = pedidoSelecionado.itens || pedidoSelecionado.itens_pedido || [];
    const iniciais = filtrarAgendamentosVigentesDoPedido(
      (pedidoSelecionado.agendamentos || []) as Array<AgendamentoServico & AgendamentoReciboInput>,
      itensDoPedido
    );
    setAgendamentosPedido(iniciais);

    agendamentoService
      .buscarAgendamentosVigentesDoPedido(lojaId, pedidoId, itensDoPedido)
      .then((vigentes) => {
        if (ativo) {
          setAgendamentosPedido(vigentes);
        }
      })
      .catch(() => {
        // Mantém fallback em memória caso a consulta falhe
      });

    return () => {
      ativo = false;
    };
  }, [pedidoSelecionado?.id, loja?.id]);

  const [transportadorasLista, setTransportadorasLista] = useState<Transportadora[]>([]);

  useEffect(() => {
    if (loja?.id) {
      ShippingOrchestrator.listarTransportadoras(loja.id)
        .then(setTransportadorasLista)
        .catch(() => {});
    }
  }, [loja?.id]);

  const handleRastrearTransportadora = (ped: Pedido) => {
    const raw = (ped as any).pedido_entregas || ped.pedido_entrega || entregaPedido;
    const pe: PedidoEntrega | null = Array.isArray(raw) ? (raw[0] || null) : (raw || null);
    const codRastreio = (pe?.codigo_rastreio || ped.codigo_rastreio || '').trim();

    if (codRastreio) {
      navigator.clipboard.writeText(codRastreio);
    }

    const transpId = pe?.transportadora_id || (ped as any)?.transportadora_id;
    const transpNome = pe?.transportadora_nome || (ped as any)?.nome_transportadora || (ped as any)?.transportadora_nome || '';

    const transpObj = transportadorasLista.find(t =>
      (transpId && t.id === transpId) ||
      (transpNome && t.nome.toLowerCase() === transpNome.toLowerCase()) ||
      (transpNome && t.nome.toLowerCase().includes('jadlog') && transpNome.toLowerCase().includes('jadlog'))
    );

    let siteUrl = transpObj?.site?.trim() || '';
    if (!siteUrl && (transpNome.toLowerCase().includes('jadlog') || String((ped as any)?.forma_entrega_nome || '').toLowerCase().includes('jadlog'))) {
      siteUrl = 'https://www.jadlog.com.br/jadlog/home';
    }

    if (siteUrl) {
      const urlFinal = siteUrl.startsWith('http://') || siteUrl.startsWith('https://')
        ? siteUrl
        : `https://${siteUrl}`;
      window.open(urlFinal, '_blank', 'noopener,noreferrer');
    } else {
      const termo = transpNome ? `rastreamento ${transpNome}` : 'rastreamento transportadora';
      const busca = `https://www.google.com/search?q=${encodeURIComponent(termo)}`;
      window.open(busca, '_blank', 'noopener,noreferrer');
    }
  };

  const handleAvisarWhatsApp = (ped: Pedido) => {
    const origin = window.location.origin;
    const link = `${origin}/order-tracking/${ped.numero_pedido || ped.id}`;
    const rotuloStatus = ROTULOS_STATUS_PEDIDO[ped.status] || ped.status;
    const texto = `Olá! O seu pedido #${ped.numero_pedido} na ${loja?.nome_fantasia || 'nossa loja'} está com o status: *${rotuloStatus}*.\n\nAcompanhe o andamento em tempo real pelo link:\n${link}\n\nQualquer dúvida, estamos à disposição!`;
    const tel = ped.cliente?.whatsapp || ped.cliente?.telefone || '';
    const cleanTel = normalizarTelefoneComDDI(tel);
    const url = cleanTel
      ? `https://wa.me/${cleanTel}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopiarLinkPedido = (ped: Pedido) => {
    const origin = window.location.origin;
    const link = `${origin}/order-tracking/${ped.numero_pedido || ped.id}`;
    try {
      navigator.clipboard.writeText(link);
      mostrarToast('Link de acompanhamento copiado!', 'sucesso');
    } catch {
      mostrarToast('Não foi possível copiar o link.', 'erro');
    }
  };

  const handleSalvarLinkRastreioMobile = async (pedidoId: string) => {
    if (!loja?.id) return;
    if (!linkRastreioInput.trim()) {
      mostrarToast('Por favor, informe uma URL válida.', 'aviso');
      return;
    }
    setSalvandoLinkRastreio(true);
    try {
      const urlFinal = linkRastreioInput.trim();
      const meta = (pedidoSelecionado?.metadados && typeof pedidoSelecionado.metadados === 'object')
        ? { ...pedidoSelecionado.metadados, link_rastreio: urlFinal }
        : { link_rastreio: urlFinal };

      await Promise.all([
        supabase
          .from('pedidos')
          .update({ link_rastreio: urlFinal, metadados: meta, atualizado_em: new Date().toISOString() })
          .eq('id', pedidoId)
          .eq('loja_id', loja.id),
        supabase
          .from('pedido_entregas')
          .update({ link_rastreio: urlFinal, atualizado_em: new Date().toISOString() })
          .eq('pedido_id', pedidoId)
      ]);

      mostrarToast('Link de rastreio salvo com sucesso!', 'sucesso');
      setLinkRastreioEditando(false);
      setLinkRastreioInput('');
      setPedidoSelecionado(prev => prev && prev.id === pedidoId ? ({ ...prev, link_rastreio: urlFinal, metadados: meta } as Pedido) : prev);
      if (onRecarregar) await onRecarregar();
    } catch {
      mostrarToast('Não foi possível salvar o link de rastreio.', 'erro');
    } finally {
      setSalvandoLinkRastreio(false);
    }
  };

  const resolverStatusPagamento = (pedido: Pedido): StatusPagamento => {
    const temCaderneta = Boolean(
      (pedido as any).eh_venda_caderneta ||
      (pedido as any).eh_pagamento_caderneta ||
      (pedido.pagamentos || []).some(
        (p: any) => p.eh_pagamento_caderneta || p.forma_pagamento?.tipo === 'caderneta' || p.tipo === 'caderneta' || (p.forma_pagamento?.nome || '').toLowerCase().includes('caderneta')
      )
    );
    if (temCaderneta && !pedido.fiado_quitado) {
      return 'caderneta';
    }
    const temFiado = (pedido.pagamentos || []).some(
      (p: any) => p.eh_pagamento_fiado || p.forma_pagamento?.tipo === 'fiado'
    );
    if (temFiado && !pedido.fiado_quitado) {
      return 'fiado';
    }
    if (pedido.status_pagamento === 'aguardando_pesagem') return 'aguardando_pesagem';
    if (pedido.status_pagamento === 'pago') return 'pago';
    if (Number(pedido.saldo_devedor) <= 0 && Number(pedido.valor_pago) > 0) return 'pago';
    if (Number(pedido.valor_pago) > 0 && Number(pedido.saldo_devedor) > 0) return 'parcialmente_pago';
    if (pedido.status_pagamento) return pedido.status_pagamento;
    return 'aguardando_pagamento';
  };

  const handleAcionarDespacho = (ped: Pedido) => {
    const statusPag = resolverStatusPagamento(ped);
    const estaPagoOuFiado = statusPag === 'pago' || statusPag === 'fiado' || statusPag === 'caderneta';
    if (!estaPagoOuFiado) {
      mostrarToast('Este pedido possui pagamento pendente. Efetue o recebimento antes de despachar.', 'aviso');
      onAbrirReceberPagamento(ped);
      return;
    }
    if (onDespacharPedido) {
      onDespacharPedido(ped);
    } else {
      setModalDespachoAberto(true);
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

    const temTransportadoraManualCadastrada = Boolean(pe?.transportadora_id);

    const ehMelhorEnvio =
      peProvedor === 'melhor_envio' ||
      metaProvedor === 'melhor_envio' ||
      diretoProvedor === 'melhor_envio' ||
      textoConsolidado.includes('melhor envio') ||
      textoConsolidado.includes('melhorenvio') ||
      Boolean(meta.melhor_envio_order_id) ||
      (!temTransportadoraManualCadastrada && (
        textoConsolidado.includes('jadlog') ||
        textoConsolidado.includes('.package') ||
        textoConsolidado.includes('.com')
      ));

    const nomeApp = (pedido as any)?.nome_app || pe?.nome_app || (pedido as any)?.metadados?.nome_app;
    const ehUber =
      !ehMelhorEnvio &&
      (peProvedor === 'uber' ||
      metaProvedor === 'uber' ||
      diretoProvedor === 'uber' ||
      peTransp.toLowerCase().includes('uber') ||
      metaTransp.toLowerCase().includes('uber') ||
      diretoTransp.toLowerCase().includes('uber') ||
      String(nomeApp || '').toLowerCase().includes('uber') ||
      textoConsolidado.includes('uber direct') ||
      textoConsolidado.includes('uber flash') ||
      textoConsolidado.includes('uber'));

    const ehAppEntrega =
      !ehUber &&
      (pe?.tipo_operacao === 'app_entrega' ||
      (pedido as any)?.tipo_operacao === 'app_entrega' ||
      Boolean(pe?.app_entrega_id) ||
      Boolean(nomeApp));

    const ehTransportadoraPrivada =
      !ehMelhorEnvio &&
      !ehUber &&
      (temTransportadoraManualCadastrada ||
      ((pe?.tipo_operacao === 'transportadora' || (pedido as any)?.tipo_operacao === 'transportadora') &&
       (peTransp.toLowerCase().includes('transportadora') || metaTransp.toLowerCase().includes('transportadora') || diretoTransp.toLowerCase().includes('transportadora')) &&
       !textoConsolidado.includes('correios')));

    const servicoCorreios =
      (pedido as any)?.servico_correios ||
      pe?.servico_correios ||
      (textoConsolidado.includes('sedex') && !ehTransportadoraPrivada ? 'SEDEX' : '') ||
      (textoConsolidado.includes('pac') && !ehTransportadoraPrivada ? 'PAC' : '') ||
      (!ehTransportadoraPrivada ? detectarServicoPorCodigo(pe?.codigo_rastreio || pedido.codigo_rastreio) : null);

    const ehCorreios =
      !ehMelhorEnvio &&
      !ehUber &&
      !ehTransportadoraPrivada &&
      (peProvedor === 'correios' ||
      metaProvedor === 'correios' ||
      diretoProvedor === 'correios' ||
      pe?.tipo_operacao === 'correios' ||
      (pedido as any)?.tipo_operacao === 'correios' ||
      peTransp.toLowerCase().includes('correios') ||
      metaTransp.toLowerCase().includes('correios') ||
      diretoTransp.toLowerCase().includes('correios') ||
      Boolean(servicoCorreios));

    if (isRetirada) {
      prov = 'retirada_loja';
      provNome = 'Retirada na Loja';
    } else if (ehMelhorEnvio) {
      prov = 'melhor_envio';
      const transpNomeBase = peTransp || metaTransp || diretoTransp || '';
      if (transpNomeBase && !transpNomeBase.toLowerCase().includes('melhor envio')) {
        provNome = `Melhor Envio (${formatarNomeTransportadora(transpNomeBase)})`;
      } else {
        provNome = transpNomeBase || 'Melhor Envio';
      }
    } else if (ehUber) {
      prov = 'uber';
      provNome = peTransp || metaTransp || diretoTransp || (nomeApp && String(nomeApp).toLowerCase().includes('flash') ? 'Uber Flash' : 'Uber Direct');
    } else if (ehAppEntrega) {
      prov = 'frete_proprio';
      provNome = nomeApp || peTransp || 'App de Entrega';
    } else if (ehTransportadoraPrivada) {
      prov = 'frete_proprio';
      provNome = formatarNomeTransportadora(peTransp || metaTransp || diretoTransp || 'Jadlog');
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
    } else if (Number(pedido.valor_frete || 0) > 0 || pedido.endereco_entrega) {
      prov = 'frete_proprio';
      provNome = peTransp || metaTransp || diretoTransp || 'Frete Próprio / Entrega Local';
    }

    return { prov, provNome, pe, rawPe, isRetirada };
  };

  const ehDespachoTransportadora = useMemo(() => {
    if (!pedidoSelecionado) return false;
    const pe = entregaPedido || pedidoSelecionado.pedido_entrega;
    const opTipo = pe?.tipo_operacao || (pedidoSelecionado as any)?.tipo_operacao || pe?.tipo_entrega;
    const transpNome = String(pedidoSelecionado.nome_transportadora || pe?.transportadora_nome || pe?.nome_transportadora || (pedidoSelecionado as any).forma_entrega_nome || pedidoSelecionado.forma_entrega?.nome || '').toLowerCase();
    return (
      opTipo === 'transportadora' ||
      Boolean(pe?.transportadora_id) ||
      Boolean((pedidoSelecionado as any)?.transportadora_id) ||
      (!transpNome.includes('correios') && (
        transpNome.includes('jadlog') ||
        transpNome.includes('transportadora') ||
        transpNome.includes('braspress') ||
        transpNome.includes('azul') ||
        transpNome.includes('latam') ||
        transpNome.includes('total express') ||
        transpNome.includes('rodonaves')
      ))
    );
  }, [pedidoSelecionado, entregaPedido]);

  // Identificação e crítica em tempo real para despacho via Correios (SEDEX / PAC)
  const ehDespachoCorreios = useMemo(() => {
    if (!pedidoSelecionado || ehDespachoTransportadora) return false;
    const pe = entregaPedido || pedidoSelecionado.pedido_entrega;
    const opTipo = pe?.tipo_operacao || (pedidoSelecionado as any)?.tipo_operacao || pe?.tipo_entrega;
    return (
      opTipo === 'correios' ||
      pe?.tipo_operacao === 'correios' ||
      (pedidoSelecionado as any)?.tipo_operacao === 'correios' ||
      (pe?.provedor as any) === 'correios' ||
      String((pedidoSelecionado as any).forma_entrega_nome || pedidoSelecionado.forma_entrega?.nome || '').toLowerCase().includes('correios') ||
      String(pedidoSelecionado.nome_transportadora || '').toLowerCase().includes('correios') ||
      String(pe?.transportadora_nome || '').toLowerCase().includes('correios') ||
      Boolean(pedidoSelecionado.servico_correios) ||
      Boolean(pe?.servico_correios)
    );
  }, [pedidoSelecionado, entregaPedido, ehDespachoTransportadora]);

  const validacaoCorreiosDespacho = useMemo(() => {
    if (!ehDespachoCorreios) {
      return { valido: true, motivo: '', codigoFormatado: codigoRastreioDespacho };
    }
    return validarRastreioCorreios(codigoRastreioDespacho, servicoCorreiosDespacho);
  }, [ehDespachoCorreios, codigoRastreioDespacho, servicoCorreiosDespacho]);

  const handleConfirmarDespacho = async () => {
    if (!pedidoSelecionado) return;

    if (ehDespachoCorreios) {
      const validacao = validarRastreioCorreios(codigoRastreioDespacho, servicoCorreiosDespacho);
      if (!validacao.valido) {
        mostrarToast(validacao.motivo || 'Código de rastreamento inválido para os Correios.', 'aviso');
        return;
      }
    }

    try {
      setDespachando(true);
      const rastreioNormalizado = codigoRastreioDespacho.trim().toUpperCase().replace(/\s+/g, '');
      const agora = new Date().toISOString();
      const pe = entregaPedido || pedidoSelecionado.pedido_entrega;
      await ShippingOrchestrator.despacharEntregaManual(
        pedidoSelecionado.id,
        {
          entregadorNome: entregadorNomeDespacho.trim() || undefined,
          contatoEntregador: contatoEntregadorDespacho.trim() || undefined,
          codigoRastreio: rastreioNormalizado || undefined,
          linkRastreio: linkRastreioDespacho.trim() || undefined,
          pinEntrega: pinEntregaDespacho.trim() || undefined,
          nomeApp: nomeAppDespacho.trim() || undefined,
          servicoCorreios: servicoCorreiosDespacho || undefined,
          nomeTransportadora: nomeTransportadoraDespacho.trim() || undefined,
          tipoOperacao: (pe?.tipo_operacao || (pedidoSelecionado as any).tipo_operacao) || undefined,
          usuarioId: usuario?.id || null
        }
      );
      const pedidoAtualizado: Pedido = {
        ...pedidoSelecionado,
        status: 'enviado',
        entregador_nome: entregadorNomeDespacho.trim() || pedidoSelecionado.entregador_nome,
        contato_entregador: contatoEntregadorDespacho.trim() || pedidoSelecionado.contato_entregador,
        codigo_rastreio: codigoRastreioDespacho.trim() || pedidoSelecionado.codigo_rastreio,
        link_rastreio: linkRastreioDespacho.trim() || pedidoSelecionado.link_rastreio,
        pin_entrega: pinEntregaDespacho.trim() || pedidoSelecionado.pin_entrega,
        nome_app: nomeAppDespacho.trim() || pedidoSelecionado.nome_app,
        servico_correios: servicoCorreiosDespacho || pedidoSelecionado.servico_correios,
        nome_transportadora: nomeTransportadoraDespacho.trim() || pedidoSelecionado.nome_transportadora,
        despachado_em: agora,
        despachado_por: usuario?.id || null
      };
      setPedidoSelecionado(pedidoAtualizado);
      onAlterarStatus(pedidoSelecionado.id, 'enviado');
      if (onRecarregar) await onRecarregar();
      setModalDespachoAberto(false);
      setEntregadorNomeDespacho('');
      setContatoEntregadorDespacho('');
      setCodigoRastreioDespacho('');
      setLinkRastreioDespacho('');
      setPinEntregaDespacho('');
      setNomeTransportadoraDespacho('');
    } catch (err) {
      console.error('Erro ao despachar pedido:', err);
      mostrarToast('Não foi possível despachar o pedido. Verifique os dados e tente novamente.', 'erro');
    } finally {
      setDespachando(false);
    }
  };

  const handleForcarConclusaoContingencia = async () => {
    if (!pedidoSelecionado) return;
    try {
      setExecutandoContingencia(true);
      await ShippingOrchestrator.forcarConclusaoManual(
        pedidoSelecionado.id,
        usuario?.id || null
      );
      await onAlterarStatus(pedidoSelecionado.id, 'concluido');
      setPedidoSelecionado(null);
      setModalContingenciaAberto(false);
    } catch (err) {
      console.error('Erro ao forçar conclusão manual:', err);
      mostrarToast('Não foi possível concluir o pedido manualmente. Tente novamente.', 'erro');
    } finally {
      setExecutandoContingencia(false);
    }
  };

  // Estados de Busca e Filtros Rápidos (TELA001, TELA003, TELA004)
  const [busca, setBusca] = useState<string>('');
  const [ouvindoVoz, setOuvindoVoz] = useState<boolean>(false);
  const [modalStatusAberto, setModalStatusAberto] = useState<boolean>(false);
  const [statusSelecionados, setStatusSelecionados] = useState<string[]>(['todos']);
  const [statusPagamentoSelecionado, setStatusPagamentoSelecionado] = useState<string>('todos');

  // Abas de status ativas da loja
  const abasStatus = useMemo(() => {
    return obterAbasStatusVisiveis(loja);
  }, [loja]);

  useEffect(() => {
    if (!statusSelecionados.includes('todos')) {
      const validos = statusSelecionados.filter((s) => abasStatus.some((a) => a.id === s));
      if (validos.length === 0) {
        setStatusSelecionados(['todos']);
      } else if (validos.length !== statusSelecionados.length) {
        setStatusSelecionados(validos);
      }
    }
  }, [abasStatus, statusSelecionados]);

  // Opções para o modal de alteração de status
  const opcoesStatusAlteracao = useMemo(() => {
    const { isRetirada } = resolverProvedorEntrega(pedidoSelecionado, entregaPedido);
    const ehExclusivoServico = ehPedidoExclusivoServico(
      pedidoSelecionado?.itens || pedidoSelecionado?.itens_pedido
    );
    return obterOpcoesStatusAlteracao(loja, pedidoSelecionado?.status, isRetirada, ehExclusivoServico);
  }, [loja, pedidoSelecionado, entregaPedido]);

  const alternarVoz = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      mostrarToast('Pesquisa por voz não suportada pelo navegador.', 'aviso');
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
  const [canalFiltro, setCanalFiltro] = useState<'todos' | 'pdv' | 'catalogo_online' | 'mercadolivre'>('todos');

  // Estados da Tela de Detalhes do Pedido (TELA005 a TELA009)
  const [abaDetalhe, setAbaDetalhe] = useState<'itens' | 'detalhes' | 'cliente'>('itens');
  const [modalAlterarStatus, setModalAlterarStatus] = useState<boolean>(false);
  const [modalOpcoesPedido, setModalOpcoesPedido] = useState<boolean>(false);
  const [modalAlterarVendedor, setModalAlterarVendedor] = useState<boolean>(false);
  const [salvandoVendedor, setSalvandoVendedor] = useState<boolean>(false);
  const [modalVincularCliente, setModalVincularCliente] = useState<boolean>(false);
  const [buscaVincularCliente, setBuscaVincularCliente] = useState<string>('');

  // Registro na Pilha LIFO de Overlays Mobile (pai antes de filhos)
  useRegisterOverlay(Boolean(pedidoSelecionado), () => {
    setPedidoSelecionado(null);
    onVoltarOrigem?.();
  }, 'pedidos-mobile-detalhe', 'drawer');
  useRegisterOverlay(Boolean(clientePerfilSelecionado), () => setClientePerfilSelecionado(null), 'pedidos-mobile-cliente-perfil', 'drawer');
  useRegisterOverlay(modalFiltrosAvancados, () => setModalFiltrosAvancados(false), 'pedidos-mobile-filtros', 'drawer');
  useRegisterOverlay(modalStatusAberto, () => setModalStatusAberto(false), 'pedidos-mobile-filtro-status', 'modal');
  useRegisterOverlay(modalVendedoresAberto, () => setModalVendedoresAberto(false), 'pedidos-mobile-filtro-vendedores', 'modal');
  useRegisterOverlay(modalAlterarStatus, () => setModalAlterarStatus(false), 'pedidos-mobile-alterar-status', 'modal');
  useRegisterOverlay(modalOpcoesPedido, () => setModalOpcoesPedido(false), 'pedidos-mobile-opcoes-pedido', 'modal');
  useRegisterOverlay(modalAlterarVendedor, () => setModalAlterarVendedor(false), 'pedidos-mobile-alterar-vendedor', 'modal');
  useRegisterOverlay(modalVincularCliente, () => {
    setModalVincularCliente(false);
    setBuscaVincularCliente('');
  }, 'pedidos-mobile-vincular-cliente', 'modal');
  useRegisterOverlay(modalConfirmarCancelamentoAberto, () => {
    if (!cancelandoPedido) {
      setModalConfirmarCancelamentoAberto(false);
      setMotivoCancelamento('');
    }
  }, 'pedidos-mobile-confirmar-cancelamento', 'modal');

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
    if (!pedidoSelecionado || !loja?.id || pedidoSelecionado.status === 'cancelado') return;
    try {
      setSalvandoVendedor(true);
      const payload: any = {
        vendedor_id: novoVendedorId,
        atualizado_em: new Date().toISOString()
      };
      if (novoVendedorId === null) {
        payload.origem = 'catalogo_online';
      }

      const { error } = await supabase
        .from('pedidos')
        .update(payload)
        .eq('id', pedidoSelecionado.id)
        .eq('loja_id', loja.id);

      if (error) throw error;

      setPedidoSelecionado(prev => prev ? ({
        ...prev,
        vendedor_id: novoVendedorId || undefined,
        origem: novoVendedorId === null ? 'catalogo_online' : prev.origem
      }) : null);
      setModalAlterarVendedor(false);
      mostrarToast('Vendedor alterado com sucesso!', 'sucesso');
      if (onRecarregar) await onRecarregar();
    } catch {
      mostrarToast('Erro ao alterar vendedor do pedido.', 'erro');
    } finally {
      setSalvandoVendedor(false);
    }
  };

  const handleVincularClienteAoPedido = async (clienteId: string) => {
    if (!pedidoSelecionado || !loja?.id || pedidoSelecionado.status === 'cancelado') return;
    try {
      const { error } = await supabase
        .from('pedidos')
        .update({ cliente_id: clienteId, atualizado_em: new Date().toISOString() })
        .eq('id', pedidoSelecionado.id)
        .eq('loja_id', loja.id);
      if (error) throw error;
      setPedidoSelecionado(prev => prev ? ({ ...prev, cliente_id: clienteId }) : null);
      setModalVincularCliente(false);
      setBuscaVincularCliente('');
      mostrarToast('Cliente vinculado ao pedido!', 'sucesso');
      if (onRecarregar) await onRecarregar();
    } catch {
      mostrarToast('Erro ao vincular cliente ao pedido.', 'erro');
    }
  };

  // Base de pedidos da listagem mobile (respeitando busca de texto e excluindo concluídos)
  const pedidosBaseMobile = useMemo(() => {
    const t = busca.toLowerCase().trim();
    return pedidos.filter((p) => {
      if (p.status === 'concluido') return false;
      if (t) {
        const numStr = String(p.numero_pedido || '');
        const numCatalogo = p.origem === 'catalogo_online' ? `c-${numStr}` : numStr;
        const cli = p.cliente_id ? mapaClientes.get(p.cliente_id) : null;
        const cliNome = (cli?.nome || p.cliente?.nome || '').toLowerCase();
        const vendedorNome = (
          p.origem === 'mercadolivre'
            ? 'mercado livre'
            : p.origem === 'catalogo_online'
            ? 'catálogo online'
            : (p.vendedor_id ? mapaUsuarios.get(p.vendedor_id) : p.vendedor?.nome_completo) || ''
        ).toLowerCase();
        const itensList = p.itens || p.itens_pedido || [];
        const temItem = itensList.some((i: any) => i.nome_produto?.toLowerCase().includes(t));
        if (!numStr.includes(t) && !numCatalogo.includes(t) && !cliNome.includes(t) && !vendedorNome.includes(t) && !temItem) {
          return false;
        }
      }
      return true;
    });
  }, [pedidos, busca, mapaClientes, mapaUsuarios]);

  // Opções dinâmicas de Status do Pedido (somente > 0)
  const opcoesStatusPedidoMobile = useMemo(() => {
    const contagens: Record<string, number> = {};
    pedidosBaseMobile.forEach((p) => {
      const st = p.status;
      contagens[st] = (contagens[st] || 0) + 1;
    });

    const ordemDesejada = [
      'pendente',
      'confirmado',
      'em_separacao',
      'em_producao',
      'em_expedicao',
      'aguardando_envio',
      'enviado',
      'pronto_para_retirar',
      'entregue',
      'vencido',
      'cancelado'
    ];

    const opcoes: { id: string; label: string; count: number }[] = [];
    ordemDesejada.forEach((id) => {
      const count = contagens[id] || 0;
      if (count > 0) {
        opcoes.push({
          id,
          label: ROTULOS_STATUS_PEDIDO[id] || id,
          count
        });
      }
    });

    Object.keys(contagens).forEach((id) => {
      if (!ordemDesejada.includes(id) && contagens[id] > 0) {
        opcoes.push({
          id,
          label: ROTULOS_STATUS_PEDIDO[id] || id,
          count: contagens[id]
        });
      }
    });

    return opcoes;
  }, [pedidosBaseMobile]);

  // Opções dinâmicas de Status de Pagamento (somente > 0)
  const opcoesStatusPagamentoMobile = useMemo(() => {
    const contagens: Record<string, number> = {};
    pedidosBaseMobile.forEach((p) => {
      const sp = p.status_pagamento || 'aguardando_pagamento';
      contagens[sp] = (contagens[sp] || 0) + 1;
    });

    const ordemPagamento = [
      'pago',
      'aguardando_pagamento',
      'caderneta',
      'fiado',
      'parcialmente_pago',
      'aguardando_pesagem',
      'cancelado'
    ];

    const opcoes: { id: string; label: string; count: number }[] = [];
    ordemPagamento.forEach((id) => {
      const count = contagens[id] || 0;
      if (count > 0) {
        opcoes.push({
          id,
          label: ROTULOS_STATUS_PAGAMENTO[id] || id,
          count
        });
      }
    });

    Object.keys(contagens).forEach((id) => {
      if (!ordemPagamento.includes(id) && contagens[id] > 0) {
        opcoes.push({
          id,
          label: ROTULOS_STATUS_PAGAMENTO[id] || id,
          count: contagens[id]
        });
      }
    });

    return opcoes;
  }, [pedidosBaseMobile]);

  // Contagem de pedidos por status (tudo diferente de 'concluido' é pedido aberto)
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
      vencido: 0,
      cancelado: 0
    };

    pedidosBaseMobile.forEach((p) => {
      counts.todos += 1;
      if (counts[p.status] !== undefined) {
        counts[p.status] += 1;
      }
    });

    return counts;
  }, [pedidosBaseMobile]);

  // Filtros aplicados
  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter(p => {
      // Regra obrigatória: só devem ser exibidos registros cujo status for diferente de concluído
      if (p.status === 'concluido') return false;

      // 1. Busca por texto (código, cliente, vendedor, item)
      if (busca.trim()) {
        const t = busca.toLowerCase().trim();
        const numStr = String(p.numero_pedido || '');
        const numCatalogo = p.origem === 'catalogo_online' ? `c-${numStr}` : numStr;
        const cli = p.cliente_id ? mapaClientes.get(p.cliente_id) : null;
        const cliNome = (cli?.nome || p.cliente?.nome || '').toLowerCase();
        const vendedorNome = (
          p.origem === 'mercadolivre'
            ? 'mercado livre'
            : p.origem === 'catalogo_online'
            ? 'catálogo online'
            : (p.vendedor_id ? mapaUsuarios.get(p.vendedor_id) : p.vendedor?.nome_completo) || ''
        ).toLowerCase();
        const itensList = p.itens || p.itens_pedido || [];
        const temItem = itensList.some((i: any) => i.nome_produto?.toLowerCase().includes(t));
        if (!numStr.includes(t) && !numCatalogo.includes(t) && !cliNome.includes(t) && !vendedorNome.includes(t) && !temItem) return false;
      }

      // 2. Filtro de Status do Pedido
      if (!statusSelecionados.includes('todos')) {
        const matchStatusDireto = statusSelecionados.includes(p.status);
        const querVencido = statusSelecionados.includes('vencido');
        const infoVenc = obterInfoVencimentoFiado(p);
        const temFiadoEmAberto = (p.pagamentos || []).some((pag: any) => pag.eh_pagamento_fiado || pag.forma_pagamento?.tipo === 'fiado') && !p.fiado_quitado;
        const matchVencido = querVencido && (p.status === 'vencido' || (temFiadoEmAberto && p.status !== 'cancelado' && infoVenc.estaVencido));

        if (!matchStatusDireto && !matchVencido) return false;
      }

      // 3. Filtro de Status de Pagamento
      if (statusPagamentoSelecionado !== 'todos') {
        const sp = p.status_pagamento || 'aguardando_pagamento';
        if (sp !== statusPagamentoSelecionado) return false;
      }

      // 4. Filtro de Canal / Origem
      if (canalFiltro !== 'todos') {
        if (canalFiltro === 'pdv' && (p.origem === 'catalogo_online' || p.origem === 'mercadolivre')) return false;
        if (canalFiltro === 'catalogo_online' && p.origem !== 'catalogo_online') return false;
        if (canalFiltro === 'mercadolivre' && p.origem !== 'mercadolivre') return false;
      }

      // 5. Filtro de Vendedores
      if (!vendedoresSelecionados.includes('todos')) {
        const pedVendedor = p.vendedor_id || (p.origem === 'catalogo_online' ? 'catalogo_online' : null);
        if (!pedVendedor || !vendedoresSelecionados.includes(pedVendedor)) return false;
      }

      // 6. Filtro de Meios de Pagamento
      if (meiosPagamentoFiltro.length > 0) {
        const pagInfo = obterDadosPagamentoRecibo(p);
        const nomesFormas = [
          ...(p.pagamentos || []).map((pg: any) => `${pg.forma_pagamento?.nome || ''} ${pg.forma_pagamento?.tipo || ''} ${pg.eh_pagamento_fiado ? 'fiado venda fiado' : ''} ${pg.eh_pagamento_caderneta ? 'caderneta' : ''}`),
          ...(pagInfo.pagamentosDetalhados || []).map((d) => d.forma || ''),
          pagInfo.ehFiado ? 'fiado venda fiado' : '',
          pagInfo.ehCaderneta ? 'caderneta' : ''
        ].join(' ').toLowerCase();

        const deuMatchMeio = meiosPagamentoFiltro.some((mp) => {
          const mpLower = mp.toLowerCase();
          if (mpLower === 'venda fiado') return nomesFormas.includes('fiado');
          if (mpLower === 'pix') return nomesFormas.includes('pix');
          if (mpLower === 'cartão de débito') return nomesFormas.includes('débito') || nomesFormas.includes('debito') || nomesFormas.includes('cartao_debito');
          if (mpLower === 'cartão de crédito') return nomesFormas.includes('crédito') || nomesFormas.includes('credito') || nomesFormas.includes('cartao_credito');
          if (mpLower === 'dinheiro') return nomesFormas.includes('dinheiro');
          if (mpLower === 'caderneta') return nomesFormas.includes('caderneta');
          return nomesFormas.includes(mpLower);
        });
        if (!deuMatchMeio) return false;
      }

      // 7. Filtro de Período (com fronteiras locais sem deslocamento UTC)
      if (dataInicio) {
        const dPed = new Date(p.data_venda || p.criado_em || '');
        const dIni = new Date(obterInicioDiaISO(dataInicio));
        if (dPed < dIni) return false;
      }
      if (dataFim) {
        const dPed = new Date(p.data_venda || p.criado_em || '');
        const dFim = new Date(obterFimDiaISO(dataFim));
        if (dPed > dFim) return false;
      }

      return true;
    });
  }, [pedidos, busca, statusSelecionados, statusPagamentoSelecionado, canalFiltro, vendedoresSelecionados, meiosPagamentoFiltro, dataInicio, dataFim, mapaClientes, mapaUsuarios]);

  // Agrupamento por Data (ex: Hoje, Ontem, Sexta-feira 21 de Agosto...)
  const gruposPorData = useMemo(() => {
    const grupos: { [dataLabel: string]: { label: string; pedidos: Pedido[]; totalValor: number } } = {};
    const hoje = new Date();
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const hojeYmd = obterDataLocalYYYYMMDD(hoje);
    const ontemYmd = obterDataLocalYYYYMMDD(ontem);

    pedidosFiltrados.forEach(p => {
      const d = new Date(p.data_venda);
      const ymd = obterDataLocalYYYYMMDD(d);

      let label = formatarDataLocal(d, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      label = label.charAt(0).toUpperCase() + label.slice(1);

      if (ymd === hojeYmd) {
        label = 'Hoje';
      } else if (ymd === ontemYmd) {
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

  // Preset de datas na TELA002 (horário local)
  const aplicarPresetPeriodo = (preset: string) => {
    const hoje = new Date();
    if (preset === 'hoje') {
      const h = formatarDataLocalYMD(hoje);
      setDataInicio(h);
      setDataFim(h);
    } else if (preset === 'ontem') {
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);
      const o = formatarDataLocalYMD(ontem);
      setDataInicio(o);
      setDataFim(o);
    } else if (preset === 'esta_semana') {
      const inicio = new Date();
      inicio.setDate(inicio.getDate() - inicio.getDay());
      setDataInicio(formatarDataLocalYMD(inicio));
      setDataFim(formatarDataLocalYMD(hoje));
    } else if (preset === 'este_mes') {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      setDataInicio(formatarDataLocalYMD(inicio));
      setDataFim(formatarDataLocalYMD(hoje));
    } else if (preset === 'ultimos_30_dias') {
      const inicio = new Date();
      inicio.setDate(inicio.getDate() - 30);
      setDataInicio(formatarDataLocalYMD(inicio));
      setDataFim(formatarDataLocalYMD(hoje));
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
      <div className={`fixed inset-0 z-50 flex flex-col justify-between animate-in slide-in-from-right duration-150 select-none ${isDark ? 'bg-[#08131A] text-slate-100' : 'bg-slate-100 text-black'}`}>
        {/* Top Header */}
        <div className={`h-14 px-4 flex items-center justify-between shrink-0 ${isDark ? 'bg-[#08131A] border-b border-slate-800' : 'bg-slate-100 border-b border-slate-300'}`}>
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                setPedidoSelecionado(null);
                if (onVoltarOrigem) {
                  onVoltarOrigem();
                }
              }}
              className={`p-1 rounded-full transition cursor-pointer ${isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-700'}`}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className={`text-xs font-bold truncate ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
              {formatarDataLocal(pedidoSelecionado.data_venda)}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Status textual informativo no canto superior direito */}
            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wide border ${
              pedidoSelecionado.status === 'concluido'
                ? (isDark ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40' : 'bg-emerald-50 text-emerald-900 border-emerald-300')
                : pedidoSelecionado.status === 'cancelado'
                ? (isDark ? 'bg-red-950/50 text-red-300 border-red-500/40' : 'bg-red-50 text-red-900 border-red-300')
                : pedidoSelecionado.status === 'vencido'
                ? (isDark ? 'bg-red-950/50 text-red-300 border-red-500/40' : 'bg-red-50 text-red-900 border-red-300')
                : pedidoSelecionado.status === 'confirmado'
                ? (isDark ? 'bg-blue-950/50 text-blue-300 border-blue-500/40' : 'bg-blue-50 text-blue-900 border-blue-300')
                : pedidoSelecionado.status === 'em_producao' || pedidoSelecionado.status === 'em_expedicao' || pedidoSelecionado.status === 'em_separacao'
                ? (isDark ? 'bg-indigo-950/50 text-indigo-300 border-indigo-500/40' : 'bg-indigo-50 text-indigo-900 border-indigo-300')
                : (isDark ? 'bg-amber-950/50 text-amber-300 border-amber-500/40' : 'bg-amber-50 text-amber-900 border-amber-300')
            }`}>
              {ROTULOS_STATUS_PEDIDO[pedidoSelecionado.status] || pedidoSelecionado.status.replace(/_/g, ' ')}
            </span>

            {cli && (
              <button
                type="button"
                onClick={() => setClientePerfilSelecionado(cli)}
                className={`hubi-btn-neutral px-2 py-1 rounded-lg text-[11px] font-bold uppercase truncate max-w-[90px] flex items-center gap-1 cursor-pointer ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black'
                }`}
              >
                <span className="truncate">{cli.nome}</span>
                <User className={`w-3 h-3 shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setPedidoReciboModal(pedidoSelecionado)}
              className={`p-1.5 rounded-lg cursor-pointer ${isDark ? 'text-slate-400 hover:text-white' : 'text-black hover:bg-slate-200'}`}
              title="Ver Recibo"
            >
              <FileText className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Resumo Superior do Pedido */}
        <div className={`mx-3 mt-3 p-4 rounded-2xl space-y-2.5 shrink-0 shadow-xs ${
          isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
        }`}>
          <div className="flex items-baseline justify-between">
            <div className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-black'}`}>
              R$ {Number(pedidoSelecionado.valor_total).toFixed(2)}
            </div>
            <div className="text-right space-y-0.5">
              <div className="flex items-center justify-end gap-1.5">
                {pedidoSelecionado.origem === 'mercadolivre' && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FFE600] text-slate-950 font-black text-[9px] uppercase">
                    <ShoppingBag className="w-2.5 h-2.5" />
                    ML
                  </span>
                )}
                <span className={`text-[11px] font-bold font-mono ${isDark ? 'text-slate-300' : 'text-black'}`}>
                  #{pedidoSelecionado.origem === 'catalogo_online' ? `c-${pedidoSelecionado.numero_pedido}` : pedidoSelecionado.numero_pedido}
                </span>
              </div>
              <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>
                {pedidoSelecionado.origem === 'mercadolivre' ? 'Mercado Livre' : nomeVendedor}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Pílula de Status (Abre TELA006 — bloqueada para cancelado e concluido) */}
            {pedidoSelecionado.status === 'cancelado' ? (
              <div
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold ${
                  isDark ? 'border-red-500/40 bg-red-950/40 text-red-300' : 'border-red-300 bg-red-50 text-red-950'
                }`}
              >
                <XCircle className={`w-3.5 h-3.5 ${isDark ? 'text-red-400' : 'text-red-700'}`} />
                <span>Cancelado (Imutável)</span>
              </div>
            ) : pedidoSelecionado.status === 'concluido' ? (
              <div
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold ${
                  isDark ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300' : 'border-emerald-300 bg-emerald-50 text-emerald-950'
                }`}
              >
                <CheckCircle2 className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
                <span>Concluído (Definitivo)</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setModalAlterarStatus(true)}
                className={`hubi-btn-neutral px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
                  isDark ? 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200' : 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-black'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{ROTULOS_STATUS_PEDIDO[pedidoSelecionado.status] || pedidoSelecionado.status.replace(/_/g, ' ')}</span>
                <ChevronDown className={`w-3.5 h-3.5 ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
              </button>
            )}

            {/* Pílula de Pagamento Real */}
            {(() => {
              const pagInfo = obterDadosPagamentoRecibo(pedidoSelecionado);
              const ehFiado = pagInfo.ehFiado;
              const ehPago = pagInfo.foiPago;
              const nomeFormaRaw = pagInfo.pagamentosDetalhados?.[0]?.forma;
              const formaLimpa = extrairFormaLimpa(nomeFormaRaw);

              if (pagInfo.ehCaderneta) {
                return (
                  <div className="px-3 py-1.5 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 flex items-center gap-1.5 text-xs font-bold">
                    <DollarSign className="w-3.5 h-3.5 text-purple-600" />
                    <span>Caderneta</span>
                  </div>
                );
              }

              if (ehFiado) {
                return (
                  <div className="px-3 py-1.5 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 flex items-center gap-1.5 text-xs font-bold">
                    <DollarSign className="w-3.5 h-3.5 text-purple-600" />
                    <span>Fiado</span>
                  </div>
                );
              }

              if (pedidoSelecionado.status_pagamento === 'aguardando_pesagem') {
                return (
                  <div className="px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 flex items-center gap-1.5 text-xs font-bold">
                    <Scale className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Aguardando Pesagem</span>
                  </div>
                );
              }

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
                    {formaLimpa ? ` (${formaLimpa})` : ''}
                  </span>
                </div>
              );
            })()}
          </div>

          {/* BANNER VISUAL INFORMATIVO PARA PEDIDO CANCELADO */}
          {pedidoSelecionado.status === 'cancelado' && (
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-2.5 ${
                isDark ? 'bg-red-950/40 border-red-500/40' : 'bg-red-50 border-red-300'
              }`}
            >
              <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${isDark ? 'text-red-400' : 'text-red-700'}`} />
              <div className="space-y-1 min-w-0">
                <span className={`font-extrabold text-sm tracking-wide block ${isDark ? 'text-red-300' : 'text-red-950'}`}>
                  PEDIDO CANCELADO (SOMENTE LEITURA)
                </span>
                <p className={`font-medium text-sm leading-relaxed ${isDark ? 'text-red-200' : 'text-red-900'}`}>
                  Este pedido foi cancelado e está congelado para histórico e auditoria. Não é permitida nenhuma alteração de status, itens, recebimento de pagamento ou despacho.
                </p>
                {pedidoSelecionado.observacoes && (
                  <p className={`font-semibold text-xs pt-1 break-words ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                    Observação / Motivo: {pedidoSelecionado.observacoes}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Observação e Editor Inline */}
          {(() => {
            const obsAtualLimpa = extrairObservacaoLimpa(pedidoSelecionado.observacoes);

            return (
              <div className="pt-1 space-y-1.5">
                {obsAtualLimpa && !editandoObsPedido && (
                  <div className={`p-2.5 rounded-xl text-xs border ${
                    isDark ? 'bg-[#08131A] border-amber-500/40 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-950'
                  }`}>
                    <span className={`font-bold block text-[10px] uppercase tracking-wide ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>
                      Observação:
                    </span>
                    <p className="whitespace-pre-wrap break-words">{obsAtualLimpa}</p>
                  </div>
                )}

                {editandoObsPedido ? (
                  <div className="space-y-2">
                    <textarea
                      value={textoObsEditando}
                      onChange={(e) => setTextoObsEditando(e.target.value)}
                      rows={2}
                      placeholder="Digite a observação do pedido..."
                      className={`w-full rounded-xl p-2.5 text-xs resize-none focus:outline-none focus:border-emerald-500 ${
                        isDark ? 'bg-[#08131A] border border-slate-700 text-white placeholder:text-slate-500' : 'bg-white border border-slate-300 text-black placeholder:text-slate-500'
                      }`}
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={salvandoObs}
                        onClick={() => setEditandoObsPedido(false)}
                        className={`hubi-btn-neutral px-3 py-1.5 rounded-xl text-xs transition cursor-pointer ${
                          isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700' : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-semibold'
                        }`}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={salvandoObs || !loja?.id}
                        onClick={async () => {
                          if (!loja?.id) return;
                          setSalvandoObs(true);
                          try {
                            const obsFinal = textoObsEditando.trim() || null;
                            const { error } = await supabase
                              .from('pedidos')
                              .update({ observacoes: obsFinal, atualizado_em: new Date().toISOString() })
                              .eq('id', pedidoSelecionado.id)
                              .eq('loja_id', loja.id);
                            if (error) throw error;
                            setPedidoSelecionado({ ...pedidoSelecionado, observacoes: obsFinal });
                            setEditandoObsPedido(false);
                            mostrarToast('Observação salva com sucesso!', 'sucesso');
                            if (onRecarregar) onRecarregar();
                          } catch {
                            mostrarToast('Não foi possível salvar a observação.', 'erro');
                          } finally {
                            setSalvandoObs(false);
                          }
                        }}
                        className="hubi-btn-cta px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                      >
                        {salvandoObs ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  pedidoSelecionado.status !== 'cancelado' && (
                    <button
                      type="button"
                      onClick={() => {
                        setTextoObsEditando(obsAtualLimpa);
                        setEditandoObsPedido(true);
                      }}
                      className={`text-xs font-bold hover:underline flex items-center gap-1 cursor-pointer ${
                        isDark ? 'text-emerald-400' : 'text-emerald-800'
                      }`}
                    >
                      <span>+ {obsAtualLimpa ? 'Editar observação' : 'Adicionar observação'}</span>
                    </button>
                  )
                )}
              </div>
            );
          })()}
        </div>

        {/* Abas: ITENS | DETALHES (TELA007) | CLIENTE (TELA008) */}
        <div className={`px-4 mt-3 flex items-center justify-between shrink-0 text-xs font-bold uppercase tracking-wider ${
          isDark ? 'bg-[#08131A] border-b border-slate-800 text-slate-400' : 'bg-slate-100 border-b border-slate-300 text-slate-600'
        }`}>
          <button
            type="button"
            onClick={() => setAbaDetalhe('itens')}
            className={`py-3 border-b-2 transition flex-1 text-center cursor-pointer ${
              abaDetalhe === 'itens' ? 'border-emerald-500 text-emerald-500' : (isDark ? 'border-transparent hover:text-slate-200' : 'border-transparent hover:text-black')
            }`}
          >
            ITENS
          </button>
          <button
            type="button"
            onClick={() => setAbaDetalhe('detalhes')}
            className={`py-3 border-b-2 transition flex-1 text-center cursor-pointer ${
              abaDetalhe === 'detalhes' ? 'border-emerald-500 text-emerald-500' : (isDark ? 'border-transparent hover:text-slate-200' : 'border-transparent hover:text-black')
            }`}
          >
            DETALHES
          </button>
          <button
            type="button"
            onClick={() => setAbaDetalhe('cliente')}
            className={`py-3 border-b-2 transition flex-1 text-center cursor-pointer ${
              abaDetalhe === 'cliente' ? 'border-emerald-500 text-emerald-500' : (isDark ? 'border-transparent hover:text-slate-200' : 'border-transparent hover:text-black')
            }`}
          >
            CLIENTE
          </button>
        </div>

        {/* Conteúdo da Aba */}
        <div className="flex-1 overflow-y-auto p-4">
          {abaDetalhe === 'itens' && (
            <div className={`p-4 rounded-2xl ${isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'}`}>
              <div className={`space-y-3 divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
                {itensPedido.length === 0 ? (
                  <div className={`text-center py-12 text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Nenhum item encontrado neste pedido.
                  </div>
                ) : (
                  itensPedido.map((item: any, idx: number) => (
                    <div key={item.id || idx} className="pt-2.5 first:pt-0 flex items-center justify-between gap-2.5">
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`font-black text-xs shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-md ${
                            isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-black font-bold'
                          }`}>
                            {item.quantidade}x
                          </span>
                          <span className={`font-bold text-xs uppercase truncate block flex-1 min-w-0 ${isDark ? 'text-slate-100' : 'text-black'}`} title={item.nome_produto}>
                            {item.nome_produto}
                          </span>
                        </div>
                        {item.rotulo_variacao && (
                          <span className={`text-[10px] block truncate ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Var: {item.rotulo_variacao}</span>
                        )}
                      </div>
                      <span className={`font-black text-xs shrink-0 whitespace-nowrap ${isDark ? 'text-white' : 'text-black'}`}>
                        R$ {Number(item.subtotal || (Number(item.preco_venda_unitario || 0) * Number(item.quantidade || 1))).toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TELA007: DETALHES */}
          {abaDetalhe === 'detalhes' && (
            <div className="space-y-4">
              <div className={`p-3.5 rounded-2xl space-y-2 ${
                isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`font-bold text-xs ${isDark ? 'text-slate-200' : 'text-black'}`}>
                    {ROTULOS_STATUS_PEDIDO[pedidoSelecionado.status] || pedidoSelecionado.status.replace(/_/g, ' ')}
                  </span>
                  <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className={`text-[11px] block ${isDark ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>
                  {formatarDataLocal(pedidoSelecionado.data_venda)}
                </span>
                <div className={`pt-2 border-t flex flex-col gap-1.5 text-xs ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-900 font-medium'}>Origem / Vendedor:</span>
                    <span className={`font-bold ${isDark ? 'text-slate-100' : 'text-black'}`}>
                      {pedidoSelecionado.origem === 'mercadolivre'
                        ? 'Mercado Livre'
                        : pedidoSelecionado.origem === 'catalogo_online'
                        ? 'Catálogo Online'
                        : (mapaUsuarios.get(pedidoSelecionado.vendedor_id || '') || pedidoSelecionado.vendedor?.nome_completo || 'Vendedor')}
                    </span>
                  </div>
                  {(() => {
                    const pagInfo = obterDadosPagamentoRecibo(pedidoSelecionado);
                    const ehFiado = pagInfo.ehFiado || (pedidoSelecionado.pagamentos || []).some((p: any) => p.eh_pagamento_fiado || p.forma_pagamento?.tipo === 'fiado');
                    if (!ehFiado) return null;
                    const infoVenc = obterInfoVencimentoFiado(pedidoSelecionado);
                    return (
                      <div className={`flex items-center justify-between text-xs pt-1 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <span className={isDark ? 'text-slate-400' : 'text-slate-900 font-medium'}>Data Vencimento:</span>
                        <div className="text-right">
                          <span className={`font-bold ${infoVenc.estaVencido ? 'text-red-600 dark:text-red-400' : (isDark ? 'text-slate-200' : 'text-black')}`}>
                            {infoVenc.formatada}
                          </span>
                          {infoVenc.estaVencido && (
                            <span className="text-[10px] font-bold text-red-600 dark:text-red-400 block">Vencido</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {(() => {
                    const editorNome = pedidoSelecionado.atualizado_por_usuario?.nome_completo ||
                      mapaUsuarios.get(pedidoSelecionado.atualizado_por || '') ||
                      (pedidoSelecionado.metadados as any)?.ultimo_editor?.usuario_nome ||
                      (pedidoSelecionado.metadados as any)?.ultimo_editor?.nome;
                    if (!editorNome) return null;
                    return (
                      <div className={`flex items-center justify-between text-[11px] px-2 py-1 rounded-lg border ${
                        isDark ? 'text-amber-300 bg-[#08131A] border-amber-500/40' : 'text-amber-900 bg-amber-50 border-amber-300'
                      }`}>
                        <span>Última edição:</span>
                        <span className="font-bold">{editorNome}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Card Logística & Despacho (Mobile — espelha Desktop dentro do fluxo de cards existente) */}
              {(() => {
                const { prov, provNome, pe } = resolverProvedorEntrega(pedidoSelecionado, entregaPedido);
                const infoVisita = extrairInfoVisitaPedido(pedidoSelecionado, loja);
                const entregador = pe?.entregador_nome || pedidoSelecionado.entregador_nome;
                const linkRastreio = (pe?.link_rastreio || pedidoSelecionado.link_rastreio || '').trim();
                const codigoRastreio = (pe?.codigo_rastreio || pedidoSelecionado.codigo_rastreio || '').trim();
                const pin = pe?.pin_entrega || pedidoSelecionado.pin_entrega;
                const despachadoEm = pe?.despachado_em || pedidoSelecionado.despachado_em;
                const ehUber = prov === 'uber' || Boolean(pedidoSelecionado.nome_app?.toLowerCase().includes('uber'));
                const codCorridaRaw = pe?.codigo_corrida || (pedidoSelecionado as any)?.codigo_corrida || (pedidoSelecionado as any)?.metadados?.codigo_corrida;
                const codCorridaExibir = ehUber
                  ? (codCorridaRaw && !String(codCorridaRaw).startsWith('del_') ? codCorridaRaw : null)
                  : codCorridaRaw;

                const temDadosLogistica = Boolean(
                  pe ||
                  infoVisita.temServicoExterno ||
                  pedidoSelecionado.endereco_entrega ||
                  entregador ||
                  codigoRastreio ||
                  linkRastreio ||
                  pin ||
                  Number(pedidoSelecionado.valor_frete || 0) > 0
                );
                if (!temDadosLogistica) return null;

                return (
                  <div className={`p-3.5 rounded-2xl space-y-2.5 text-xs ${
                    isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                  }`}>
                    <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                      <div className="flex items-center gap-1.5 font-bold">
                        <Truck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className={`uppercase tracking-wider text-[11px] ${isDark ? 'text-slate-200' : 'text-black'}`}>
                          Logística &amp; Despacho
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                          isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-300 text-black'
                        }`}>
                          {provNome}
                        </span>
                        {pedidoSelecionado.status !== 'concluido' && pedidoSelecionado.status !== 'cancelado' && (
                          <button
                            type="button"
                            onClick={() => setModalDefinirEnvioAberto(true)}
                            className={`text-[11px] font-bold hover:underline cursor-pointer ${
                              isDark ? 'text-emerald-400' : 'text-emerald-800'
                            }`}
                          >
                            Alterar
                          </button>
                        )}
                      </div>
                    </div>

                    {infoVisita.temServicoExterno && (
                      <div className={`p-2.5 rounded-xl border space-y-1 ${
                        isDark ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-100' : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      }`}>
                        <div className="flex items-center gap-1.5 font-bold text-[11px]">
                          <Home className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Atendimento no Endereço do Cliente</span>
                        </div>
                        {(infoVisita.enderecoVisita || pedidoSelecionado.endereco_entrega) && (
                          <p className={`text-[11px] pl-5 ${isDark ? 'text-slate-200' : 'text-black'}`}>
                            <strong>Endereço:</strong> {infoVisita.enderecoVisita || pedidoSelecionado.endereco_entrega}
                          </p>
                        )}
                        {infoVisita.ehPedidoMisto && (
                          <p className={`text-[11px] pl-5 font-semibold ${isDark ? 'text-emerald-300' : 'text-emerald-900'}`}>
                            📦 Levar produto junto na visita do profissional (Frete Grátis)
                          </p>
                        )}
                      </div>
                    )}

                    {pedidoSelecionado.endereco_entrega && (
                      <div className="space-y-0.5">
                        <span className={`block text-[10px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                          Endereço de Entrega:
                        </span>
                        <span className={`font-semibold break-words ${isDark ? 'text-slate-100' : 'text-black'}`}>
                          {pedidoSelecionado.endereco_entrega}
                        </span>
                      </div>
                    )}

                    {codCorridaExibir && (
                      <div className={`flex justify-between items-center pt-1.5 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <span className={isDark ? 'text-slate-400' : 'text-slate-900 font-medium'}>Código da Corrida:</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-mono font-bold px-2 py-0.5 rounded border ${
                            isDark ? 'text-slate-200 bg-slate-800 border-slate-700' : 'text-black bg-slate-100 border-slate-300'
                          }`}>
                            {codCorridaExibir}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(String(codCorridaExibir));
                              mostrarToast('Código da corrida copiado!', 'sucesso');
                            }}
                            className={`p-1 rounded transition cursor-pointer ${isDark ? 'text-slate-400 hover:text-emerald-400' : 'text-slate-700 hover:text-black'}`}
                            title="Copiar código da corrida"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {!ehUber && (codigoRastreio || (prov === 'melhor_envio' && (despachadoEm || pedidoSelecionado.status === 'enviado'))) && (
                      <div className={`flex justify-between items-center pt-1.5 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <span className={isDark ? 'text-slate-400' : 'text-slate-900 font-medium'}>Código de Rastreio:</span>
                        {codigoRastreio ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`font-mono font-bold px-2 py-0.5 rounded border ${
                              isDark ? 'text-slate-200 bg-slate-800 border-slate-700' : 'text-black bg-slate-100 border-slate-300'
                            }`}>
                              {codigoRastreio}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(codigoRastreio);
                                mostrarToast('Código de rastreio copiado!', 'sucesso');
                              }}
                              className={`p-1 rounded transition cursor-pointer ${isDark ? 'text-slate-400 hover:text-emerald-400' : 'text-slate-700 hover:text-black'}`}
                              title="Copiar código"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[11px] italic font-semibold ${isDark ? 'text-amber-400' : 'text-amber-900'}`}>
                              Pendente de sincronização
                            </span>
                            <button
                              type="button"
                              disabled={sincronizandoRastreio}
                              onClick={async () => {
                                setSincronizandoRastreio(true);
                                try {
                                  await supabase.functions.invoke('melhor-envio-despacho', {
                                    body: {
                                      pedidoId: pedidoSelecionado.id,
                                      loja_id: loja?.id || pedidoSelecionado.loja_id,
                                      acao: 'sincronizar_rastreio',
                                      isSandbox: true
                                    }
                                  });
                                  if (onRecarregar) await onRecarregar();
                                  mostrarToast('Rastreamento sincronizado com sucesso!', 'sucesso');
                                } catch {
                                  mostrarToast('Não foi possível sincronizar no momento.', 'erro');
                                } finally {
                                  setSincronizandoRastreio(false);
                                }
                              }}
                              className={`p-1 rounded transition cursor-pointer ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 border border-slate-300 text-black'}`}
                              title="Sincronizar código de rastreio"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${sincronizandoRastreio ? 'animate-spin' : ''}`} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {entregador && (
                      <div className={`flex justify-between items-center pt-1.5 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <span className={isDark ? 'text-slate-400' : 'text-slate-900 font-medium'}>Entregador:</span>
                        <span className={`font-bold ${isDark ? 'text-slate-100' : 'text-black'}`}>{entregador}</span>
                      </div>
                    )}

                    {pin && (
                      <div className={`flex justify-between items-center pt-1.5 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <span className={isDark ? 'text-slate-400' : 'text-slate-900 font-medium'}>PIN de Confirmação:</span>
                        <span className={`font-mono font-black px-2 py-0.5 rounded border ${
                          isDark ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-emerald-950 bg-emerald-50 border-emerald-300'
                        }`}>
                          {pin}
                        </span>
                      </div>
                    )}

                    {despachadoEm && (
                      <div className={`flex justify-between items-center pt-1.5 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <span className={isDark ? 'text-slate-400' : 'text-slate-900 font-medium'}>Despachado em:</span>
                        <span className={isDark ? 'text-slate-300' : 'text-black font-medium'}>{formatarDataHoraLocal(despachadoEm)}</span>
                      </div>
                    )}

                    {/* Link de Rastreio + Compartilhamento Uber WhatsApp */}
                    <div className={`pt-1.5 border-t space-y-2 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                      {linkRastreioEditando ? (
                        <div className="space-y-1.5">
                          <input
                            type="url"
                            value={linkRastreioInput}
                            onChange={(e) => setLinkRastreioInput(e.target.value)}
                            placeholder="https://rastreamento..."
                            className={`w-full rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:border-emerald-500 ${
                              isDark ? 'bg-[#08131A] border border-slate-700 text-white' : 'bg-white border border-slate-300 text-black'
                            }`}
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setLinkRastreioEditando(false)}
                              className={`hubi-btn-neutral px-3 py-1 rounded-lg text-[11px] cursor-pointer ${
                                isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 border border-slate-300 text-black font-semibold'
                              }`}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={salvandoLinkRastreio}
                              onClick={() => handleSalvarLinkRastreioMobile(pedidoSelecionado.id)}
                              className="hubi-btn-cta px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                            >
                              {salvandoLinkRastreio ? 'Salvando...' : 'Salvar Link'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {linkRastreio && (
                            <a
                              href={linkRastreio}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`hubi-btn-neutral inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] border cursor-pointer ${
                                isDark ? 'bg-[#08131A] border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-slate-100 border-slate-300 text-black font-semibold hover:bg-slate-200'
                              }`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Abrir Rastreio</span>
                            </a>
                          )}
                          {ehUber && (linkRastreio || pin) && cli && (cli.whatsapp || cli.telefone) && (
                            <button
                              type="button"
                              onClick={() => {
                                const tel = normalizarTelefoneComDDI(cli.whatsapp || cli.telefone || '');
                                const msg = `Olá ${cli.nome}! Seu pedido #${pedidoSelecionado.numero_pedido} já saiu para entrega via Uber.\n${linkRastreio ? `Acompanhe ao vivo: ${linkRastreio}\n` : ''}${pin ? `Informe este PIN ao motorista ao receber: *${pin}*` : ''}`;
                                window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
                              }}
                              className="hubi-btn-cta inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>Enviar Rastreio/PIN WhatsApp</span>
                            </button>
                          )}
                          {pedidoSelecionado.status !== 'cancelado' && pedidoSelecionado.status !== 'concluido' && (
                            <button
                              type="button"
                              onClick={() => {
                                setLinkRastreioInput(linkRastreio);
                                setLinkRastreioEditando(true);
                              }}
                              className={`text-[11px] font-bold hover:underline cursor-pointer ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}
                            >
                              {linkRastreio ? 'Editar link rastreio' : '+ Informar link rastreio'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Observação no Detalhe */}
              {(() => {
                const obsLimpa = extrairObservacaoLimpa(pedidoSelecionado.observacoes);
                if (!obsLimpa) return null;
                return (
                  <div className={`p-3.5 rounded-2xl text-xs space-y-1 ${
                    isDark ? 'bg-[#000000] border border-slate-700 text-slate-100' : 'bg-white border-2 border-slate-300 text-black'
                  }`}>
                    <div className="flex items-center gap-1.5 font-bold text-amber-500 text-[10px] uppercase">
                      <FileText className="w-3.5 h-3.5" />
                      <span>Observação do Pedido</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words">{obsLimpa}</p>
                  </div>
                );
              })()}

              {/* Histórico de Status */}
              {(() => {
                const historico = extrairHistoricoPedidoMobile(pedidoSelecionado);
                if (historico.length === 0) return null;
                return (
                  <div className={`p-3.5 rounded-2xl space-y-3 ${
                    isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                  }`}>
                    <span className={`font-bold text-[11px] uppercase tracking-wide block ${isDark ? 'text-slate-300' : 'text-black'}`}>Histórico do Pedido</span>
                    <div className="space-y-2.5">
                      {historico.map((item, idx, arr) => {
                        const isLast = idx === arr.length - 1;
                        const isEdicao = item.tipo === 'edicao';
                        return (
                          <div key={idx} className="flex items-start gap-2.5 text-xs">
                            <div
                              className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${
                                isEdicao
                                  ? 'bg-amber-500 ring-4 ring-amber-500/20'
                                  : isLast
                                  ? 'bg-emerald-500 ring-4 ring-emerald-500/20'
                                  : 'bg-slate-500'
                              }`}
                            />
                            <div>
                              <p className={`font-bold capitalize ${
                                isEdicao
                                  ? 'text-amber-500'
                                  : isLast
                                  ? 'text-emerald-500'
                                  : (isDark ? 'text-slate-300' : 'text-black')
                              }`}>
                                {item.status.replace(/_/g, ' ')}
                              </p>
                              <div className={`flex items-center gap-1.5 text-[10px] font-normal ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                <span>{formatarDataHoraHistorico(item.data)}</span>
                                {item.usuario && <span>• {item.usuario}</span>}
                              </div>
                              {item.detalhes && (
                                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{item.detalhes}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Card Agendamento do Serviço (Mobile) */}
              {(() => {
                const detalhesAgendamentos = extrairDetalhesAgendamentosPedido(
                  pedidoSelecionado as PedidoReciboInput,
                  agendamentosPedido as AgendamentoReciboInput[],
                  loja
                );
                if (detalhesAgendamentos.length === 0) return null;

                return (
                  <div className={`p-3.5 rounded-2xl space-y-2.5 ${
                    isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                        <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-black'}`}>
                          {detalhesAgendamentos.length > 1 ? 'AGENDAMENTOS DO SERVIÇO' : 'AGENDAMENTO DO SERVIÇO'}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide border ${
                        detalhesAgendamentos[0].modalidadeLocal === 'externo'
                          ? (isDark ? 'bg-amber-950/50 text-amber-300 border-amber-800/60' : 'bg-amber-50 text-amber-700 border-amber-200')
                          : (isDark ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/60' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                      }`}>
                        {detalhesAgendamentos[0].badgeModalidadeLabel}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {detalhesAgendamentos.map((ag) => (
                        <div
                          key={ag.id}
                          className={`rounded-xl p-3 space-y-1.5 border ${
                            isDark
                              ? 'bg-emerald-950/20 border-emerald-800/50'
                              : 'bg-emerald-50/60 border-emerald-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-xs font-bold leading-snug ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                              Serviço: {ag.servicoNome}
                            </p>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border shrink-0 ${
                              isDark ? 'bg-slate-900 text-slate-200 border-slate-700' : 'bg-white text-slate-700 border-slate-200'
                            }`}>
                              {ag.statusLabel}
                            </span>
                          </div>

                          <div className={`space-y-1 text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <div className="flex items-center gap-1.5">
                              <User className="w-3 h-3 text-emerald-500 shrink-0" />
                              <span>
                                Profissional: <strong className={isDark ? 'text-slate-100' : 'text-slate-900'}>{ag.profissionalNome}</strong>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-emerald-500 shrink-0" />
                              <span>
                                Data e Horário: <strong className={isDark ? 'text-slate-100' : 'text-slate-900'}>{ag.dataHorarioTexto}</strong>
                              </span>
                            </div>
                            <div className="flex items-start gap-1.5">
                              {ag.modalidadeLocal === 'externo' ? (
                                <Home className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                              ) : (
                                <Store className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                              )}
                              <span>
                                Local: <strong className={isDark ? 'text-slate-100' : 'text-slate-900'}>{ag.localAtendimentoTexto}</strong>
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className={`p-3.5 rounded-2xl space-y-2 text-xs ${
                isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
              }`}>
                {(() => {
                  const resumo = calcularResumoFinanceiroPedido(
                    pedidoSelecionado as PedidoReciboInput,
                    agendamentosPedido as AgendamentoReciboInput[]
                  );

                  return (
                    <>
                      {resumo.subtotalProdutos > 0 && (
                        <div className={`flex justify-between ${isDark ? 'text-slate-400' : 'text-slate-900 font-medium'}`}>
                          <span>Subtotal dos Produtos:</span>
                          <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-black'}`}>
                            {formatarMoeda(resumo.subtotalProdutos)}
                          </span>
                        </div>
                      )}

                      {resumo.subtotalServicos > 0 && (
                        <div className={`flex justify-between ${isDark ? 'text-slate-400' : 'text-slate-900 font-medium'}`}>
                          <span>Subtotal dos Serviços:</span>
                          <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-black'}`}>
                            {formatarMoeda(resumo.subtotalServicos)}
                          </span>
                        </div>
                      )}

                      {resumo.taxaVisitaDomicilio > 0 && (
                        <div className={`flex justify-between ${isDark ? 'text-slate-400' : 'text-slate-900 font-medium'}`}>
                          <span>Taxa de Visita (Domicílio):</span>
                          <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-black'}`}>
                            + {formatarMoeda(resumo.taxaVisitaDomicilio)}
                          </span>
                        </div>
                      )}

                      {resumo.exibirFreteEntrega && (
                        <div className={`flex justify-between ${isDark ? 'text-slate-400' : 'text-slate-900 font-medium'}`}>
                          <span>Frete de Entrega:</span>
                          <span className={`font-bold ${resumo.valorFreteEntrega === 0 ? 'text-emerald-700 dark:text-emerald-400' : (isDark ? 'text-slate-200' : 'text-black')}`}>
                            {resumo.valorFreteEntrega > 0
                              ? `+ ${formatarMoeda(resumo.valorFreteEntrega)}`
                              : formatarMoeda(0)}
                          </span>
                        </div>
                      )}

                      {resumo.valorDesconto > 0 && (
                        <div className="flex justify-between text-red-600 dark:text-red-400 font-bold">
                          <span>Desconto:</span>
                          <span>- {formatarMoeda(resumo.valorDesconto)}</span>
                        </div>
                      )}

                      <div className={`flex justify-between text-base font-black pt-2 border-t ${
                        isDark ? 'border-slate-800 text-white' : 'border-slate-300 text-black'
                      }`}>
                        <span>Total:</span>
                        <span className={isDark ? 'text-emerald-400' : 'text-black'}>{formatarMoeda(resumo.valorTotal)}</span>
                      </div>
                    </>
                  );
                })()}

                {podeVerPrecoCusto && (
                  <div className={`flex justify-between text-xs font-bold pt-1 ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                    <span>Lucro estimado:</span>
                    <span>{formatarMoeda(lucroEstimado)}</span>
                  </div>
                )}
              </div>

              {/* Card Pagamento, Expedição & Quitação de Fiado (Mobile DETALHES) */}
              {(() => {
                const statusPagDet = resolverStatusPagamento(pedidoSelecionado);
                const infoEntrega = extrairInfoPagamentoEntrega(pedidoSelecionado);
                const ehFiadoEmAberto = statusPagDet === 'fiado' && !pedidoSelecionado.fiado_quitado && pedidoSelecionado.status !== 'cancelado';
                const pags = pedidoSelecionado.pagamentos || [];

                return (
                  <div className={`p-3.5 rounded-2xl space-y-2.5 text-xs ${
                    isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                  }`}>
                    <span className={`font-bold text-[11px] uppercase tracking-wider block border-b pb-1.5 ${
                      isDark ? 'text-slate-300 border-slate-800' : 'text-black border-slate-200'
                    }`}>
                      Meios de Pagamento
                    </span>

                    {pags.length > 0 ? (
                      <div className="space-y-1.5">
                        {pags.map((pg: any, i: number) => (
                          <div key={pg.id || i} className="flex items-center justify-between">
                            <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-black'}`}>
                              {pg.forma_pagamento?.nome || (pg.eh_pagamento_caderneta ? 'Caderneta' : pg.eh_pagamento_fiado ? 'Fiado' : 'Pagamento')}
                            </span>
                            <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>
                              {formatarMoeda(Number(pg.valor || 0))}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>
                        Status: {ROTULOS_STATUS_PAGAMENTO[statusPagDet] || statusPagDet}
                      </div>
                    )}

                    {infoEntrega && statusPagDet !== 'pago' && (
                      <div className={`p-2.5 rounded-xl border space-y-1 ${
                        isDark ? 'bg-amber-950/30 border-amber-500/40 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-950'
                      }`}>
                        <div className="flex items-center gap-1.5 font-bold text-[10px] uppercase tracking-wider">
                          <Truck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>Expedição • {infoEntrega.badgeTexto}</span>
                        </div>
                        <p className="text-[11px] leading-snug">{infoEntrega.mensagemPopover}</p>
                      </div>
                    )}

                    {pedidoSelecionado.comprovante_pagamento_url && (
                      <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                        isDark
                          ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                          : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      }`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Receipt className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="text-[11px] font-bold truncate">Comprovante Pix Anexado</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPedidoComprovanteModal(pedidoSelecionado)}
                          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                            isDark
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                              : 'bg-emerald-300 hover:bg-emerald-400 text-black border border-emerald-400'
                          }`}
                        >
                          <span>Ver Comprovante Pix</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {ehFiadoEmAberto && onAbrirReceberFiado && (
                      <button
                        type="button"
                        onClick={() => onAbrirReceberFiado(pedidoSelecionado)}
                        className="hubi-btn-cta w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <DollarSign className="w-4 h-4" />
                        <span>Receber Fiado</span>
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* TELA008: CLIENTE */}
          {abaDetalhe === 'cliente' && (
            <div className={`p-4 rounded-2xl space-y-4 text-center py-6 ${
              isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
            }`}>
              {cli ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2">
                    <User className={`w-5 h-5 ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
                    <h3 className={`font-black text-sm uppercase ${isDark ? 'text-white' : 'text-black'}`}>{cli.nome}</h3>
                  </div>

                  {cli.whatsapp && (
                    <a
                      href={`https://wa.me/${normalizarTelefoneComDDI(cli.whatsapp)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hubi-btn-cta inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Chamar no WhatsApp</span>
                    </a>
                  )}

                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={() => setClientePerfilSelecionado(cli)}
                      className={`text-xs font-bold hover:underline cursor-pointer ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}
                    >
                      Ir ao perfil cliente
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 py-4 px-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
                    isDark ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-700'
                  }`}>
                    <User className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>Venda Avulsa</h4>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>Nenhum cliente está vinculado a este pedido.</p>
                  </div>
                  {pedidoSelecionado.status !== 'cancelado' && (
                    <button
                      type="button"
                      onClick={() => setModalVincularCliente(true)}
                      className="hubi-btn-cta inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Vincular Cliente</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé e Ações Inferiores (TELA005) */}
        <div className={`p-3 shrink-0 ${isDark ? 'bg-[#08131A] border-t border-slate-800' : 'bg-slate-100 border-t border-slate-300'}`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModalOpcoesPedido(true)}
              className={`hubi-btn-neutral h-12 px-4 rounded-2xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                isDark ? 'bg-[#000000] hover:bg-slate-900 text-slate-200 border border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-black border border-slate-300'
              }`}
              title="Opções do Pedido"
            >
              <MoreVertical className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-black'}`} />
              <span>Opções</span>
            </button>

            {pedidoSelecionado.status === 'cancelado' ? (
              <div
                className={`flex-1 h-12 rounded-2xl border font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 ${
                  isDark ? 'bg-red-950/40 border-red-500/40 text-red-300' : 'bg-red-50 border-red-300 text-red-950'
                }`}
              >
                <XCircle className={`w-4 h-4 ${isDark ? 'text-red-400' : 'text-red-700'}`} />
                <span>Pedido Cancelado</span>
              </div>
            ) : (() => {
                const statusPag = resolverStatusPagamento(pedidoSelecionado);
                const saldoDevedor = Number(pedidoSelecionado.saldo_devedor ?? (Number(pedidoSelecionado.valor_total || 0) - Number(pedidoSelecionado.valor_pago || 0)));
                const ehFiado = statusPag === 'fiado';
                const ehCaderneta = statusPag === 'caderneta';
                const ehCredito = ehFiado || ehCaderneta;
                const temPagamentoPendente = !ehCredito && (statusPag === 'aguardando_pagamento' || statusPag === 'parcialmente_pago' || saldoDevedor > 0.009);

                // Prioridade 0: Aguardando pesagem de balança (mesmo se status === 'pendente')
                if (statusPag === 'aguardando_pesagem') {
                  return (
                    <button
                      type="button"
                      onClick={() => setPedidoParaPesagem(pedidoSelecionado)}
                      className="hubi-btn-cta flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition cursor-pointer active:scale-95"
                    >
                      <Scale className="w-4 h-4" />
                      <span>Informar Peso</span>
                    </button>
                  );
                }

                // Prioridade 1: Se tiver pagamento pendente
                if (temPagamentoPendente) {
                  return (
                    <button
                      type="button"
                      onClick={() => onAbrirReceberPagamento(pedidoSelecionado)}
                      className="hubi-btn-cta flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition cursor-pointer active:scale-95"
                      title="Receber pagamento pendente"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>Receber Pagamento</span>
                    </button>
                  );
                }

                // Prioridade 1.5: Pedido pendente sem pagamento pendente (só se não for crédito/pago)
                if (pedidoSelecionado.status === 'pendente' && !ehCredito) {
                  return (
                    <button
                      type="button"
                      onClick={async () => {
                        await onAlterarStatus(pedidoSelecionado.id, 'confirmado');
                      }}
                      className="hubi-btn-cta flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Confirmar Pedido</span>
                    </button>
                  );
                }

                // Prioridade 3: Se status for aguardando_envio e já estiver pago/fiado (não aplicável a serviço exclusivo)
                if (
                  pedidoSelecionado.status === 'aguardando_envio' &&
                  !ehPedidoExclusivoServico(pedidoSelecionado.itens || pedidoSelecionado.itens_pedido)
                ) {
                  const { prov, pe } = resolverProvedorEntrega(pedidoSelecionado, entregaPedido);

                  if (prov === 'uber') {
                    return (
                      <button
                        type="button"
                        onClick={() => handleAcionarDespacho(pedidoSelecionado)}
                        className="hubi-btn-cta flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition cursor-pointer active:scale-95"
                        title="Chamar Uber Direct agora"
                      >
                        <Truck className="w-4 h-4" />
                        <span>Chamar Uber</span>
                      </button>
                    );
                  }

                  if (prov === 'melhor_envio') {
                    return (
                      <button
                        type="button"
                        onClick={() => handleAcionarDespacho(pedidoSelecionado)}
                        className="hubi-btn-cta flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition cursor-pointer active:scale-95"
                        title="Gerar envio no Melhor Envio"
                      >
                        <Truck className="w-4 h-4" />
                        <span>Gerar Envio</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setEntregadorNomeDespacho(pedidoSelecionado.entregador_nome || pe?.entregador_nome || '');
                        setContatoEntregadorDespacho(pedidoSelecionado.contato_entregador || pe?.contato_entregador || '');
                        setCodigoRastreioDespacho(pedidoSelecionado.codigo_rastreio || pe?.codigo_rastreio || '');
                        setLinkRastreioDespacho(pedidoSelecionado.link_rastreio || pe?.link_rastreio || '');
                        setPinEntregaDespacho(pedidoSelecionado.pin_entrega || pe?.pin_entrega || '');
                        setNomeAppDespacho(pedidoSelecionado.nome_app || pe?.nome_app || 'Uber');
                        setServicoCorreiosDespacho((pedidoSelecionado.servico_correios as any) || (pe?.servico_correios as any) || 'SEDEX');
                        setNomeTransportadoraDespacho(pedidoSelecionado.nome_transportadora || pe?.nome_transportadora || pe?.transportadora_nome || '');
                        setModalDespachoAberto(true);
                      }}
                      className="hubi-btn-cta flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition cursor-pointer active:scale-95"
                    >
                      <Truck className="w-4 h-4" />
                      <span>Despachar / Concluir Entrega</span>
                    </button>
                  );
                }

                // Prioridade 4: Conclusão permitida apenas para status operacionais/finais (ou pedidos exclusivos de serviço)
                const { isRetirada } = resolverProvedorEntrega(pedidoSelecionado, entregaPedido);
                const ehExclusivoServicoDetalhe = ehPedidoExclusivoServico(
                  pedidoSelecionado.itens || pedidoSelecionado.itens_pedido
                );
                const estaPagoOuCreditoDetalhe =
                  statusPag === 'pago' || ehFiado || ehCaderneta;
                const podeConcluirFinal =
                  pedidoSelecionado.status === 'entregue' ||
                  pedidoSelecionado.status === 'pronto_para_retirar' ||
                  (pedidoSelecionado.status === 'confirmado' && (isRetirada || ehExclusivoServicoDetalhe)) ||
                  (pedidoSelecionado.status === 'pendente' && ehExclusivoServicoDetalhe && estaPagoOuCreditoDetalhe) ||
                  (pedidoSelecionado.status === 'aguardando_envio' && ehExclusivoServicoDetalhe) ||
                  pedidoSelecionado.status === 'enviado';

                if (podeConcluirFinal) {
                  return (
                    <button
                      type="button"
                      onClick={async () => {
                        const saldoDevedorAtual = Number(pedidoSelecionado.saldo_devedor ?? (Number(pedidoSelecionado.valor_total || 0) - Number(pedidoSelecionado.valor_pago || 0)));
                        const podeConcluirSemPagamentoImediato = saldoDevedorAtual <= 0.009 || ehFiado || ehCaderneta || statusPag === 'pago';
                        if (podeConcluirSemPagamentoImediato) {
                          await onAlterarStatus(pedidoSelecionado.id, 'concluido', undefined, true);
                        } else {
                          onAbrirReceberPagamento(pedidoSelecionado);
                        }
                      }}
                      className="hubi-btn-cta flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                    >
                      <span>Concluir Pedido</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  );
                }

                if (pedidoSelecionado.status !== 'concluido') {
                  if (ehFiado && !pedidoSelecionado.fiado_quitado && onAbrirReceberFiado) {
                    return (
                      <button
                        type="button"
                        onClick={() => onAbrirReceberFiado(pedidoSelecionado)}
                        className="hubi-btn-cta flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                      >
                        <DollarSign className="w-4 h-4" />
                        <span>Receber Fiado</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      type="button"
                      onClick={() => setModalAlterarStatus(true)}
                      className={`hubi-btn-neutral flex-1 h-12 rounded-2xl text-xs flex items-center justify-center gap-2 transition cursor-pointer border ${isDark ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 font-bold' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black font-semibold'}`}
                    >
                      <Clock className="w-4 h-4" />
                      <span>Alterar Status</span>
                    </button>
                  );
                }

                return (
                  <div className={`flex-1 h-12 rounded-2xl font-bold text-xs flex items-center justify-center border ${
                    isDark ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-300 text-black'
                  }`}>
                    Pedido Concluído
                  </div>
                );
              })()}
          </div>
        </div>

        {/* MODAL DESPACHO REUTILIZÁVEL (MOBILE) */}
        <ModalDespacharPedido
          isOpen={modalDespachoAberto && Boolean(pedidoSelecionado)}
          onClose={() => setModalDespachoAberto(false)}
          pedido={pedidoSelecionado}
          entrega={entregaPedido}
          loja={loja}
          onDespachado={() => {
            setModalDespachoAberto(false);
            if (onRecarregar) onRecarregar();
          }}
        />



        {/* TELA006: MODAL ALTERAR STATUS (BOTTOM SHEET) */}
        {modalAlterarStatus && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
            <div className={`rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom ${
              isDark ? 'bg-[#08131A] border-2 border-slate-400 text-slate-100' : 'bg-slate-100 border-2 border-slate-300 text-black'
            }`}>
              <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
                <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>Selecione um status</h3>
                <button
                  type="button"
                  onClick={() => setModalAlterarStatus(false)}
                  className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>
                Seus clientes serão notificados sempre que o status de um pedido for alterado.
              </p>

              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {opcoesStatusAlteracao.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={async () => {
                      if (st.id === 'cancelado') {
                        setModalAlterarStatus(false);
                        setMotivoCancelamento('');
                        setModalConfirmarCancelamentoAberto(true);
                        return;
                      }

                      const statusExigeQuitacao = [
                        'em_separacao',
                        'aguardando_envio',
                        'em_producao',
                        'em_expedicao',
                        'pronto_para_retirar',
                        'enviado',
                        'saiu_para_entrega',
                        'entregue',
                        'concluido',
                      ].includes(st.id);

                      if (statusExigeQuitacao) {
                        const statusPagAtual = resolverStatusPagamento(pedidoSelecionado);
                        if (statusPagAtual === 'aguardando_pesagem') {
                          setModalAlterarStatus(false);
                          mostrarToast('Informe o peso dos itens na balança antes de avançar para expedição.', 'aviso');
                          setPedidoParaPesagem(pedidoSelecionado);
                          return;
                        }
                        const pagInfoAtual = obterDadosPagamentoRecibo(pedidoSelecionado);
                        const saldoDevedor = Number(pedidoSelecionado.saldo_devedor ?? (Number(pedidoSelecionado.valor_total || 0) - Number(pedidoSelecionado.valor_pago || 0)));
                        const isentoQuitacaoImediata =
                          statusPagAtual === 'pago' ||
                          statusPagAtual === 'fiado' ||
                          statusPagAtual === 'caderneta' ||
                          pagInfoAtual.foiPago ||
                          pagInfoAtual.ehFiado ||
                          pagInfoAtual.ehCaderneta ||
                          saldoDevedor <= 0.009;

                        if (!isentoQuitacaoImediata) {
                          setModalAlterarStatus(false);
                          mostrarToast('Confirme o recebimento do pagamento antes de avançar para expedição/entrega.', 'aviso');
                          onAbrirReceberPagamento(pedidoSelecionado);
                          return;
                        }
                      }
                      await onAlterarStatus(pedidoSelecionado.id, st.id as StatusPedido);
                      setModalAlterarStatus(false);
                    }}
                    className={`w-full p-3 rounded-2xl flex items-center justify-between text-xs font-bold transition cursor-pointer ${
                      pedidoSelecionado.status === st.id
                        ? (isDark ? 'border-2 border-emerald-500 bg-[#000000] text-emerald-400' : 'border-2 border-emerald-600 bg-emerald-50 text-emerald-900')
                        : (isDark ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-slate-200' : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black')
                    }`}
                  >
                    <span>{st.label}</span>
                    {pedidoSelecionado.status === st.id && <Check className="w-4 h-4 text-emerald-500" />}
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
                  className="text-xs font-bold text-emerald-500 hover:underline"
                >
                  Gerenciar meus status
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TELA009: MODAL OPÇÕES DO PEDIDO (COMPACTO, LIMPO & LINHA ÚNICA) */}
        {modalOpcoesPedido && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
            <div className={`rounded-t-3xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto space-y-2 shadow-2xl animate-in slide-in-from-bottom ${
              isDark ? 'bg-[#08131A] border-2 border-slate-400 text-slate-100' : 'bg-slate-100 border-2 border-slate-300 text-black'
            }`}>
              <div className={`flex items-center justify-between border-b pb-2.5 mb-1 ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
                <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>
                  Opções do Pedido #{pedidoSelecionado.origem === 'catalogo_online' ? `c-${pedidoSelecionado.numero_pedido}` : pedidoSelecionado.numero_pedido}
                </h3>
                <button
                  type="button"
                  onClick={() => setModalOpcoesPedido(false)}
                  className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Informações Logísticas e Operacionais Resolvidas com Lógica Oficial do Desktop */}
              {(() => {
                const { prov, pe, provNome, isRetirada } = resolverProvedorEntrega(pedidoSelecionado, entregaPedido);
                const metaPed = (typeof pedidoSelecionado.metadados === 'object' && pedidoSelecionado.metadados !== null) ? pedidoSelecionado.metadados : {};
                const isUber = prov === 'uber' ||
                  (pe?.transportadora_nome || '').toLowerCase().includes('uber') ||
                  (pe?.forma_entrega_nome || '').toLowerCase().includes('uber') ||
                  (String((pedidoSelecionado as any).transportadora_nome || pedidoSelecionado.nome_transportadora || '')).toLowerCase().includes('uber') ||
                  (pedidoSelecionado.forma_entrega?.nome || '').toLowerCase().includes('uber') ||
                  (String((metaPed as any).transportadora_nome || '')).toLowerCase().includes('uber') ||
                  (String((metaPed as any).nome_app || '')).toLowerCase().includes('uber') ||
                  (pe?.nome_app || '').toLowerCase().includes('uber');
                const ehMelhorEnvio = prov === 'melhor_envio';
                const isMelhorEnvio = ehMelhorEnvio;

                const linkRastreio = (pedidoSelecionado.link_rastreio || pe?.link_rastreio || '').trim();
                const codigoRastreio = (pedidoSelecionado.codigo_rastreio || pe?.codigo_rastreio || '').trim();
                const linkEtiqueta = String((pe as any)?.link_etiqueta || (pedidoSelecionado as any)?.link_etiqueta || (pe as any)?.etiqueta_url || (pedidoSelecionado as any)?.etiqueta_url || '').trim();

                const statusPag = resolverStatusPagamento(pedidoSelecionado);
                const estaPagoOuFiado = statusPag === 'pago' || statusPag === 'fiado' || statusPag === 'caderneta';
                const saldoDevedor = Number(pedidoSelecionado.saldo_devedor ?? (Number(pedidoSelecionado.valor_total || 0) - Number(pedidoSelecionado.valor_pago || 0)));
                const precisaPesagem = pedidoSelecionado.status !== 'cancelado' && statusPag === 'aguardando_pesagem';
                const precisaReceber =
                  pedidoSelecionado.status !== 'cancelado' &&
                  statusPag !== 'aguardando_pesagem' &&
                  statusPag !== 'caderneta' &&
                  statusPag !== 'fiado' &&
                  (statusPag === 'aguardando_pagamento' || statusPag === 'parcialmente_pago' || saldoDevedor > 0.009);

                const isUberDespachado = Boolean(
                  (pe?.codigo_corrida && pe.codigo_corrida.startsWith('del_')) ||
                  (pedidoSelecionado.codigo_rastreio && pedidoSelecionado.codigo_rastreio.startsWith('del_')) ||
                  (pe?.codigo_rastreio && pe.codigo_rastreio.startsWith('del_')) ||
                  pe?.status_envio === 'em_transito' ||
                  pe?.status_envio === 'entregue'
                );

                const ehExclusivoServicoOpcoes = ehPedidoExclusivoServico(
                  pedidoSelecionado.itens || pedidoSelecionado.itens_pedido
                );

                const aguardaEnvio =
                  !ehExclusivoServicoOpcoes &&
                  estaPagoOuFiado &&
                  pedidoSelecionado.status !== 'cancelado' &&
                  pedidoSelecionado.status !== 'concluido' &&
                  !isRetirada &&
                  (isUber ? !isUberDespachado : (pedidoSelecionado.status === 'aguardando_envio' || pedidoSelecionado.status === 'confirmado'));

                const emTransitoOuEntregue = isUber
                  ? isUberDespachado
                  : (pedidoSelecionado.status === 'enviado' ||
                     pedidoSelecionado.status === 'saiu_para_entrega' ||
                     pedidoSelecionado.status === 'entregue');

                const prontoParaConcluir =
                  emTransitoOuEntregue ||
                  pedidoSelecionado.status === 'pronto_para_retirar' ||
                  (pedidoSelecionado.status === 'confirmado' && (ehExclusivoServicoOpcoes || isRetirada));

                const temRastreio = Boolean(codigoRastreio || linkRastreio || (ehMelhorEnvio && emTransitoOuEntregue));

                const ehTranspManual =
                  !ehMelhorEnvio &&
                  (provNome.toLowerCase().includes('transportadora') ||
                   provNome.toLowerCase().includes('jadlog') ||
                   pe?.tipo_operacao === 'transportadora' ||
                   (pedidoSelecionado as any)?.tipo_operacao === 'transportadora' ||
                   Boolean(pe?.transportadora_id));

                const ehCorreios =
                  !ehMelhorEnvio &&
                  !ehTranspManual &&
                  (provNome.toLowerCase().includes('correios') ||
                   pe?.tipo_operacao === 'correios' ||
                   (pedidoSelecionado as any)?.tipo_operacao === 'correios' ||
                   Boolean(pedidoSelecionado.servico_correios || pe?.servico_correios) ||
                   detectarServicoPorCodigo(codigoRastreio) !== null);

                return (
                  <div className="space-y-1.5">
                    {/* Ação 0.A: Informar Peso (se aguardando pesagem na balança) */}
                    {precisaPesagem && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          setPedidoParaPesagem(pedidoSelecionado);
                        }}
                        className="hubi-btn-cta w-full h-11 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2.5 transition text-left cursor-pointer shadow-sm active:scale-98"
                      >
                        <Scale className="w-4 h-4 shrink-0" />
                        <span>Informar Peso</span>
                      </button>
                    )}

                    {/* Ação 0.B: Receber Pagamento (se pendente de quitação) */}
                    {precisaReceber && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          onAbrirReceberPagamento(pedidoSelecionado);
                        }}
                        className="hubi-btn-cta w-full h-11 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2.5 transition text-left cursor-pointer shadow-sm active:scale-98"
                      >
                        <DollarSign className="w-4 h-4 shrink-0" />
                        <span>Receber Pagamento</span>
                      </button>
                    )}

                    {/* Ação 0.C: Receber Fiado em Aberto */}
                    {statusPag === 'fiado' && !pedidoSelecionado.fiado_quitado && pedidoSelecionado.status !== 'cancelado' && onAbrirReceberFiado && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          onAbrirReceberFiado(pedidoSelecionado);
                        }}
                        className="hubi-btn-cta w-full h-11 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2.5 transition text-left cursor-pointer shadow-sm active:scale-98"
                      >
                        <DollarSign className="w-4 h-4 shrink-0" />
                        <span>Receber Fiado</span>
                      </button>
                    )}

                    {/* Ação 1: Gerar Envio / Chamar Uber (se aguarda envio e está pago/fiado) */}
                    {aguardaEnvio && !isUber && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          handleAcionarDespacho(pedidoSelecionado);
                        }}
                        className="hubi-btn-cta w-full h-11 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2.5 transition text-left cursor-pointer shadow-sm active:scale-98"
                      >
                        <Truck className="w-4 h-4 shrink-0" />
                        <span>Gerar Envio</span>
                      </button>
                    )}

                    {aguardaEnvio && isUber && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          handleAcionarDespacho(pedidoSelecionado);
                        }}
                        className="hubi-btn-cta w-full h-11 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2.5 transition text-left cursor-pointer shadow-sm active:scale-98"
                      >
                        <Truck className="w-4 h-4 shrink-0" />
                        <span>Chamar Uber</span>
                      </button>
                    )}

                    {/* Ação: Confirmar Pedido (se status for pendente e ainda não quitado/pago) */}
                    {pedidoSelecionado.status === 'pendente' && !estaPagoOuFiado && (
                      <button
                        type="button"
                        onClick={async () => {
                          setModalOpcoesPedido(false);
                          await onAlterarStatus(pedidoSelecionado.id, 'confirmado');
                        }}
                        className="hubi-btn-cta w-full h-11 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2.5 transition text-left cursor-pointer active:scale-98 shadow-sm"
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Confirmar Pedido</span>
                      </button>
                    )}

                    {/* Ação 2: Concluir Pedido (se pronto para concluir e NUNCA se pendente) */}
                    {prontoParaConcluir && pedidoSelecionado.status !== 'pendente' && pedidoSelecionado.status !== 'concluido' && pedidoSelecionado.status !== 'cancelado' && (
                      <button
                        type="button"
                        onClick={async () => {
                          setModalOpcoesPedido(false);
                          await onAlterarStatus(pedidoSelecionado.id, 'concluido', undefined, true);
                        }}
                        className="hubi-btn-cta w-full h-11 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2.5 transition text-left cursor-pointer active:scale-98 shadow-sm"
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Concluir Pedido</span>
                      </button>
                    )}

                    {/* Ação 3: Rastrear Envio (APENAS se já enviado/entregue e houver rastreio) */}
                    {emTransitoOuEntregue && temRastreio && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          if (ehMelhorEnvio) {
                            setPedidoRastreioModal(pedidoSelecionado);
                          } else if (ehCorreios) {
                            if (codigoRastreio) {
                              try { navigator.clipboard.writeText(codigoRastreio); } catch {}
                            }
                            mostrarToast('Código copiado! Abrindo Correios.');
                            window.open('https://rastreamento.correios.com.br/app/index.php', '_blank');
                          } else if (ehTranspManual) {
                            handleRastrearTransportadora(pedidoSelecionado);
                          } else if (linkRastreio) {
                            window.open(linkRastreio, '_blank', 'noopener,noreferrer');
                          }
                        }}
                        className={`hubi-btn-neutral w-full h-11 px-3.5 rounded-xl font-semibold text-xs flex items-center gap-2.5 transition text-left cursor-pointer active:scale-98 border ${
                          isDark ? 'bg-[#000000] hover:bg-slate-900 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-black border-slate-300'
                        }`}
                      >
                        <Package className="w-4 h-4 text-sky-500 shrink-0" />
                        <span>Rastrear Envio</span>
                      </button>
                    )}

                    {/* Ação: Etiqueta Mercado Livre (ML) */}
                    {pedidoSelecionado.origem === 'mercadolivre' && pedidoSelecionado.ml_shipment_id && onImprimirEtiquetaMl && (
                      <button
                        type="button"
                        disabled={imprimindoEtiquetaMlId === pedidoSelecionado.id}
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          onImprimirEtiquetaMl(pedidoSelecionado);
                        }}
                        className={`hubi-btn-neutral w-full h-11 px-3.5 rounded-xl font-bold text-xs flex items-center gap-2.5 transition text-left cursor-pointer active:scale-98 disabled:opacity-50 border ${
                          pedidoSelecionado.ml_etiqueta_impressa
                            ? (isDark ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300' : 'bg-emerald-50 border-emerald-300 text-emerald-900')
                            : 'bg-[#FFE600] hover:bg-[#F5DC00] text-slate-950 border-amber-400'
                        }`}
                      >
                        <Printer className="w-4 h-4 shrink-0" />
                        <span>{pedidoSelecionado.ml_etiqueta_impressa ? 'Reimprimir Etiqueta ML' : 'Imprimir Etiqueta ML'}</span>
                      </button>
                    )}

                    {/* Ação: Etiqueta Térmica / Padrão */}
                    {emTransitoOuEntregue && !isRetirada && !(pedidoSelecionado.origem === 'mercadolivre' && pedidoSelecionado.ml_shipment_id) && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          setPedidoEtiquetaModal(pedidoSelecionado);
                        }}
                        className={`hubi-btn-neutral w-full h-11 px-3.5 rounded-xl font-semibold text-xs flex items-center gap-2.5 transition text-left cursor-pointer active:scale-98 border ${
                          isDark ? 'bg-[#000000] hover:bg-slate-900 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-black border-slate-300'
                        }`}
                      >
                        <Tag className={`w-4 h-4 shrink-0 ${isDark ? 'text-slate-400' : 'text-black'}`} />
                        <span>Etiqueta de Envio</span>
                      </button>
                    )}

                    {/* Ação 5: Avisar no WhatsApp & Copiar Link */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          handleAvisarWhatsApp(pedidoSelecionado);
                        }}
                        className={`hubi-btn-neutral h-11 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98 border ${
                          isDark ? 'bg-[#000000] hover:bg-slate-900 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-black border-slate-300'
                        }`}
                      >
                        <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleCopiarLinkPedido(pedidoSelecionado);
                          setModalOpcoesPedido(false);
                        }}
                        className={`hubi-btn-neutral h-11 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98 border ${
                          isDark ? 'bg-[#000000] hover:bg-slate-900 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-black border-slate-300'
                        }`}
                      >
                        <Copy className="w-4 h-4 shrink-0" />
                        <span>Copiar link</span>
                      </button>
                    </div>

                    {/* Ação 6: Recibo (sempre disponível, fecha opções e abre Recibo oficial) */}
                    <button
                      type="button"
                      onClick={() => {
                        setModalOpcoesPedido(false);
                        setPedidoReciboModal(pedidoSelecionado);
                      }}
                      className={`hubi-btn-neutral w-full h-11 px-3.5 rounded-xl font-semibold text-xs flex items-center gap-2.5 transition text-left cursor-pointer active:scale-98 border ${
                        isDark ? 'bg-[#000000] hover:bg-slate-900 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-black border-slate-300'
                      }`}
                    >
                      <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Recibo</span>
                    </button>

                    {/* Ação 7: Alterar Frete (sempre presente para pedidos não cancelados e não concluídos) */}
                    {pedidoSelecionado.status !== 'cancelado' && pedidoSelecionado.status !== 'concluido' && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          setModalDefinirEnvioAberto(true);
                        }}
                        className={`hubi-btn-neutral w-full h-11 px-3.5 rounded-xl font-semibold text-xs flex items-center gap-2.5 transition text-left cursor-pointer active:scale-98 border ${
                          isDark ? 'bg-[#000000] hover:bg-slate-900 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-black border-slate-300'
                        }`}
                      >
                        <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>Alterar Frete</span>
                      </button>
                    )}

                    {/* Ação 9: Alterar Vendedor (se não cancelado e não concluído) */}
                    {pedidoSelecionado.status !== 'cancelado' && pedidoSelecionado.status !== 'concluido' && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          setModalAlterarVendedor(true);
                        }}
                        className={`hubi-btn-neutral w-full h-11 px-3.5 rounded-xl font-semibold text-xs flex items-center gap-2.5 transition text-left cursor-pointer active:scale-98 border ${
                          isDark ? 'bg-[#000000] hover:bg-slate-900 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-black border-slate-300'
                        }`}
                      >
                        <UserCheck2 className={`w-4 h-4 shrink-0 ${isDark ? 'text-slate-400' : 'text-black'}`} />
                        <span>Alterar Vendedor</span>
                      </button>
                    )}

                    {/* Ação 10: Editar Pedido (apenas se podeEditarPedido) */}
                    {podeEditarPedido(pedidoSelecionado) && (
                      <button
                        type="button"
                        onClick={async () => {
                          setModalOpcoesPedido(false);
                          await carregarPedidoParaEdicao(pedidoSelecionado);
                          navigate('/pos', { state: { subTela: 'carrinho' } });
                        }}
                        className={`hubi-btn-neutral w-full h-11 px-3.5 rounded-xl font-semibold text-xs flex items-center gap-2.5 transition text-left cursor-pointer active:scale-98 border ${
                          isDark ? 'bg-[#000000] hover:bg-slate-900 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-black border-slate-300'
                        }`}
                      >
                        <Edit2 className={`w-4 h-4 shrink-0 ${isDark ? 'text-slate-400' : 'text-black'}`} />
                        <span>Editar Pedido</span>
                      </button>
                    )}

                    {/* Ação 11: Cancelar Pedido (ao final, em tom vermelho suave) */}
                    {pedidoSelecionado.status !== 'cancelado' && pedidoSelecionado.status !== 'concluido' && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          setMotivoCancelamento('');
                          setModalConfirmarCancelamentoAberto(true);
                        }}
                        className={`w-full h-11 px-3.5 rounded-xl font-bold text-xs flex items-center gap-2.5 transition text-left cursor-pointer active:scale-98 ${
                          isDark ? 'bg-[#000000] hover:bg-red-950/40 text-red-400 border border-red-500/40' : 'bg-red-50 hover:bg-red-100 text-red-900 border border-red-300'
                        }`}
                      >
                        <Trash2 className={`w-4 h-4 shrink-0 ${isDark ? 'text-red-400' : 'text-red-700'}`} />
                        <span>Cancelar Pedido</span>
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* MODAL DE CONFIRMAÇÃO DEFENSIVO PARA CANCELAMENTO DE PEDIDO */}
        {modalConfirmarCancelamentoAberto && pedidoSelecionado && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className={`rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl animate-in zoom-in-95 ${
              isDark ? 'bg-[#08131A] border-2 border-slate-400 text-slate-100' : 'bg-slate-100 border-2 border-slate-300 text-black'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                    <Ban className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className={`font-bold text-sm truncate ${isDark ? 'text-white' : 'text-black'}`}>
                      Cancelar Pedido #{pedidoSelecionado.origem === 'catalogo_online' ? `c-${pedidoSelecionado.numero_pedido}` : pedidoSelecionado.numero_pedido}
                    </h3>
                    <span className={`text-[11px] block ${isDark ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>
                      Estorno automático de estoque e financeiro
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (cancelandoPedido) return;
                    setModalConfirmarCancelamentoAberto(false);
                    setMotivoCancelamento('');
                  }}
                  className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer ${
                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className={`p-3 rounded-2xl text-xs leading-relaxed font-medium border ${
                isDark ? 'bg-red-950/40 border-red-500/40 text-red-200' : 'bg-red-50 border-red-300 text-red-900'
              }`}>
                Esta ação não pode ser desfeita. Os itens retornarão ao estoque e eventuais saldos de fiado vinculados serão estornados.
              </div>

              <div className="space-y-1">
                <label className={`text-xs font-bold block ${isDark ? 'text-slate-200' : 'text-black'}`}>
                  Motivo do Cancelamento <span className="text-red-600">*</span>:
                </label>
                <textarea
                  value={motivoCancelamento}
                  onChange={(e) => setMotivoCancelamento(e.target.value)}
                  rows={2}
                  placeholder="Informe o motivo do cancelamento (ex: Desistência do cliente)..."
                  className={`w-full rounded-xl p-2.5 text-xs resize-none focus:outline-none focus:border-red-500 ${
                    isDark ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500' : 'bg-white border border-slate-300 text-black placeholder:text-slate-500'
                  }`}
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={cancelandoPedido}
                  onClick={() => {
                    setModalConfirmarCancelamentoAberto(false);
                    setMotivoCancelamento('');
                  }}
                  className={`hubi-btn-neutral flex-1 h-11 rounded-xl text-xs transition cursor-pointer ${
                    isDark ? 'bg-[#000000] hover:bg-slate-900 text-slate-200 border border-slate-700 font-bold' : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-semibold'
                  }`}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={!motivoCancelamento.trim() || cancelandoPedido}
                  onClick={async () => {
                    if (!motivoCancelamento.trim()) return;
                    setCancelandoPedido(true);
                    try {
                      await onCancelarPedido(pedidoSelecionado, motivoCancelamento.trim());
                      setModalConfirmarCancelamentoAberto(false);
                      setMotivoCancelamento('');
                      setPedidoSelecionado(null);
                    } finally {
                      setCancelandoPedido(false);
                    }
                  }}
                  className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition cursor-pointer shadow-sm active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {cancelandoPedido ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                  <span>{cancelandoPedido ? 'Cancelando...' : 'Sim, Cancelar'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL ALTERAR VENDEDOR DO PEDIDO */}
        {modalAlterarVendedor && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center animate-in fade-in">
            <div className={`rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom ${
              isDark ? 'bg-[#08131A] border-2 border-slate-400 text-slate-100' : 'bg-slate-100 border-2 border-slate-300 text-black'
            }`}>
              <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
                <div className="flex items-center gap-2">
                  <UserCheck2 className="w-4 h-4 text-emerald-500" />
                  <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>Alterar Vendedor do Pedido</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setModalAlterarVendedor(false)}
                  className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-900 font-medium'}`}>
                Selecione o vendedor responsável por este pedido #{pedidoSelecionado?.numero_pedido}:
              </p>

              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {/* Opção Catálogo Online */}
                <button
                  type="button"
                  disabled={salvandoVendedor}
                  onClick={() => handleTrocarVendedorPedido(null)}
                  className={`w-full p-3 rounded-2xl text-left transition flex items-center justify-between cursor-pointer ${
                    pedidoSelecionado?.origem === 'catalogo_online' || !pedidoSelecionado?.vendedor_id
                      ? (isDark ? 'bg-[#000000] border-2 border-emerald-500 text-emerald-400 shadow-xs' : 'bg-slate-200 border-2 border-slate-500 text-black font-bold shadow-xs')
                      : (isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-white border border-slate-300 text-black hover:bg-slate-50')
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Globe className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
                    <div>
                      <span className="font-bold text-xs block">Catálogo Online</span>
                      <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>Venda originada do catálogo web</span>
                    </div>
                  </div>
                  {(pedidoSelecionado?.origem === 'catalogo_online' || !pedidoSelecionado?.vendedor_id) && (
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
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
                      className={`w-full p-3 rounded-2xl text-left transition flex items-center justify-between cursor-pointer ${
                        ehAtual
                          ? (isDark ? 'bg-[#000000] border-2 border-emerald-500 text-emerald-400 shadow-xs' : 'bg-slate-200 border-2 border-slate-500 text-black font-bold shadow-xs')
                          : (isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-white border border-slate-300 text-black hover:bg-slate-50')
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <User className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
                        <div>
                          <span className="font-bold text-xs block">{usr.nome_completo}</span>
                          <span className={`text-[10px] capitalize ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>{usr.perfil || 'Vendedor'}</span>
                        </div>
                      </div>
                      {ehAtual && <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* MODAL VINCULAR CLIENTE AO PEDIDO AVULSO */}
        {modalVincularCliente && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center animate-in fade-in">
            <div className={`rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom ${
              isDark ? 'bg-[#08131A] border-2 border-slate-400 text-slate-100' : 'bg-slate-100 border-2 border-slate-300 text-black'
            }`}>
              <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-500" />
                  <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>Vincular Cliente ao Pedido</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  {onAbrirNovoCliente && (
                    <button
                      type="button"
                      onClick={() => {
                        setModalVincularCliente(false);
                        onAbrirNovoCliente();
                      }}
                      className={`hubi-btn-neutral px-2.5 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                        isDark ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700' : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black'
                      }`}
                    >
                      + Novo Cliente
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setModalVincularCliente(false);
                      setBuscaVincularCliente('');
                    }}
                    className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Barra de Busca de Clientes */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou telefone..."
                  value={buscaVincularCliente}
                  onChange={(e) => setBuscaVincularCliente(e.target.value)}
                  className={`w-full rounded-xl pl-9 pr-3 py-2 text-xs font-medium focus:outline-none focus:border-emerald-500 ${
                    isDark ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500' : 'bg-white border border-slate-300 text-black placeholder:text-slate-500'
                  }`}
                  autoFocus
                />
              </div>

              {/* Lista de Clientes */}
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {clientes
                  .filter((c) => {
                    if (!buscaVincularCliente.trim()) return true;
                    const t = buscaVincularCliente.toLowerCase().trim();
                    return (
                      c.nome.toLowerCase().includes(t) ||
                      (c.whatsapp && c.whatsapp.includes(t)) ||
                      (c.telefone && c.telefone.includes(t))
                    );
                  })
                  .slice(0, 30)
                  .map((cliItem) => (
                    <button
                      key={cliItem.id}
                      type="button"
                      onClick={() => handleVincularClienteAoPedido(cliItem.id)}
                      className={`w-full p-2.5 rounded-xl text-left transition flex items-center justify-between cursor-pointer ${
                        isDark ? 'bg-[#000000] border border-slate-700 hover:border-emerald-500 hover:bg-slate-900 text-slate-200' : 'bg-white border border-slate-300 hover:bg-slate-50 text-black'
                      }`}
                    >
                      <div>
                        <span className={`font-bold text-xs block ${isDark ? 'text-slate-100' : 'text-black'}`}>{cliItem.nome}</span>
                        <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>
                          {cliItem.whatsapp || cliItem.telefone || 'Sem telefone'}
                        </span>
                      </div>
                      <User className="w-4 h-4 text-slate-400" />
                    </button>
                  ))}
                {clientes.length === 0 && (
                  <div className={`text-center py-6 text-xs ${isDark ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>
                    Nenhum cliente cadastrado.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal de Histórico de Fiado Detalhado (Compras Fiado a Vencer) */}
        <ModalHistoricoFiadoCliente
          isOpen={!!clienteHistoricoFiadoModal}
          onClose={() => setClienteHistoricoFiadoModal(null)}
          cliente={clienteHistoricoFiadoModal}
          filtroInicial={filtroHistoricoFiadoModal}
          onClienteAtualizado={(c) => {
            onClienteAtualizado(c);
            if (onRecarregar) onRecarregar();
          }}
        />

        {/* MODAL OFICIAL DE RECIBO DO PEDIDO (REUTILIZADO DO DESKTOP) */}
        <ReciboPedidoModal
          isOpen={Boolean(pedidoReciboModal)}
          pedido={pedidoReciboModal}
          loja={loja}
          onClose={() => setPedidoReciboModal(null)}
        />

        {/* MODAL DE RASTREAMENTO DE ENVIOS (CORREIOS / MELHOR ENVIO) */}
        <ModalRastreioPedido
          isOpen={Boolean(pedidoRastreioModal)}
          onClose={() => setPedidoRastreioModal(null)}
          pedido={pedidoRastreioModal}
          entrega={entregaPedido}
          loja={loja}
          onAtualizarStatus={() => {
            if (onRecarregar) onRecarregar();
            setPedidoRastreioModal((prev: any) => (prev ? { ...prev, status: 'entregue' } : null));
          }}
        />

        {/* MODAL DE IMPRESSÃO DE ETIQUETA DE ENVIO */}
        {pedidoEtiquetaModal && loja && (
          <ModalImprimirEtiqueta
            isOpen={Boolean(pedidoEtiquetaModal)}
            onClose={() => setPedidoEtiquetaModal(null)}
            pedido={pedidoEtiquetaModal}
            loja={loja}
            entrega={entregaPedido}
          />
        )}

        {/* MODAL DEFINIR / ALTERAR ENVIO DO PEDIDO (MOBILE) */}
        <ModalDefinirEnvio
          isOpen={modalDefinirEnvioAberto && Boolean(pedidoSelecionado)}
          pedido={pedidoSelecionado}
          loja={loja}
          usuario={usuario}
          onClose={() => setModalDefinirEnvioAberto(false)}
          onSucesso={() => {
            setModalDefinirEnvioAberto(false);
            mostrarToast('Envio e entrega atualizados com sucesso!', 'sucesso');
            if (onRecarregar) onRecarregar();
          }}
          onFeedbackSucesso={(msg) => mostrarToast(msg, 'sucesso')}
          onFeedbackErro={(msg) => mostrarToast(msg, 'erro')}
        />

        {/* MODAL DE CONFERÊNCIA DE PESAGEM / BALANÇA (DENTRO DO DETALHE MOBILE) */}
        <ModalConferenciaPesagemPedido
          isOpen={Boolean(pedidoParaPesagem)}
          pedido={pedidoParaPesagem}
          loja={loja}
          usuarioId={usuario?.id}
          onClose={() => setPedidoParaPesagem(null)}
          onPesagemConfirmada={(pedidoAtualizado) => {
            setPedidoSelecionado((prev) =>
              prev && prev.id === pedidoAtualizado.id ? { ...prev, ...pedidoAtualizado } : prev
            );
            if (onRecarregar) onRecarregar();
          }}
        />
      </div>
    );
  }

  // =========================================================================
  // TELA 001: LISTA PRINCIPAL DE PEDIDOS MOBILE
  // =========================================================================
  return (
    <div className={`flex flex-col h-full overflow-hidden select-none ${isDark ? 'bg-[#08131A] text-slate-100' : 'bg-slate-100 text-black'}`}>
      {/* 1. Header Superior Mobile Unificado (TELA001) */}
      <MobileHeader
        titulo="Pedidos"
        acoesDireita={
          <div className="flex items-center gap-2">
            {/* Botão de Filtros Avançados ▽ (TELA002) */}
            <button
              type="button"
              onClick={() => setModalFiltrosAvancados(true)}
              className={`hubi-btn-neutral relative p-2 transition rounded-xl border cursor-pointer ${
                isDark ? 'bg-[#000000] border-slate-700 text-slate-300 hover:text-white hover:bg-slate-900' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black'
              }`}
              title="Filtros"
            >
              <Filter className="w-4 h-4" />
              {(dataInicio || dataFim || meiosPagamentoFiltro.length > 0 || canalFiltro !== 'todos' || !vendedoresSelecionados.includes('todos')) && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
              )}
            </button>

            {/* Botão Nova Venda + */}
            <button
              type="button"
              onClick={() => navigate('/pos')}
              className="hubi-btn-cta w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center shadow-sm transition active:scale-95 cursor-pointer"
              title="Nova Venda"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        }
      />

      {/* 2. Barra de Busca */}
      <div className={`px-4 py-2 shrink-0 ${isDark ? 'bg-[#08131A] border-b border-slate-800' : 'bg-slate-100 border-b border-slate-300'}`}>
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Item, cliente, vendedor ou código"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className={`w-full rounded-xl pl-10 pr-16 py-2.5 text-xs sm:text-sm font-medium focus:outline-none focus:border-emerald-500 ${
              isDark ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500' : 'bg-white border border-slate-300 text-black placeholder:text-slate-500'
            }`}
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              className={`absolute right-10 p-1 rounded-lg transition cursor-pointer ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-700 hover:text-black'}`}
              title="Limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={alternarVoz}
            className={`absolute right-2.5 p-1.5 rounded-lg transition cursor-pointer ${
              ouvindoVoz ? 'bg-red-600 text-white animate-pulse' : (isDark ? 'text-slate-400 hover:text-white' : 'text-slate-700 hover:text-black')
            }`}
            title="Pesquisar por voz"
          >
            <Mic className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3. Menus Dropdown: Status e Vendedores */}
      <div className={`px-3 py-2 flex items-center gap-2 shrink-0 ${isDark ? 'bg-[#08131A] border-b border-slate-800' : 'bg-slate-100 border-b border-slate-300'}`}>
        {/* Dropdown 1: Status Pedido */}
        <div className="relative flex-1 min-w-0">
          <Clock className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
          <select
            value={statusSelecionados[0] || 'todos'}
            onChange={(e) => setStatusSelecionados([e.target.value])}
            aria-label="Filtrar por status do pedido"
            className={`w-full appearance-none rounded-xl pl-8 pr-7 py-2 text-xs font-semibold cursor-pointer truncate focus:outline-none focus:border-emerald-500 ${
              isDark ? 'bg-[#000000] border border-slate-700 text-slate-200' : 'bg-white border border-slate-300 text-black'
            }`}
          >
            <option value="todos">Status Pedido: Todos ({pedidosBaseMobile.length})</option>
            {opcoesStatusPedidoMobile.map((st) => (
              <option key={st.id} value={st.id}>
                Status Pedido: {st.label} ({st.count})
              </option>
            ))}
          </select>
          <ChevronDown className={`w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
        </div>

        {/* Dropdown 2: Status Pagamento */}
        <div className="relative flex-1 min-w-0">
          <DollarSign className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
          <select
            value={statusPagamentoSelecionado}
            onChange={(e) => setStatusPagamentoSelecionado(e.target.value)}
            aria-label="Filtrar por status de pagamento"
            className={`w-full appearance-none rounded-xl pl-8 pr-7 py-2 text-xs font-semibold cursor-pointer truncate focus:outline-none focus:border-emerald-500 ${
              isDark ? 'bg-[#000000] border border-slate-700 text-slate-200' : 'bg-white border border-slate-300 text-black'
            }`}
          >
            <option value="todos">Status Pagamento: Todos ({pedidosBaseMobile.length})</option>
            {opcoesStatusPagamentoMobile.map((sp) => (
              <option key={sp.id} value={sp.id}>
                Status Pagamento: {sp.label} ({sp.count})
              </option>
            ))}
          </select>
          <ChevronDown className={`w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
        </div>
      </div>

      {/* 4. Lista Agrupada de Pedidos por Data */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {carregando && pedidos.length === 0 ? (
          <div className={`text-center py-16 text-xs ${isDark ? 'text-slate-400' : 'text-black font-semibold'}`}>Carregando pedidos...</div>
        ) : gruposPorData.length === 0 ? (
          <div className={`text-center py-16 text-xs ${isDark ? 'text-slate-400' : 'text-black font-semibold'}`}>Nenhum pedido encontrado.</div>
        ) : (
          gruposPorData.map((grupo) => (
            <div key={grupo.label} className="space-y-2">
              {/* Header do Grupo de Data */}
              <div className="px-1">
                <h3 className={`font-bold text-xs ${isDark ? 'text-slate-200' : 'text-black'}`}>{grupo.label}</h3>
                <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>
                  {grupo.pedidos.length} {grupo.pedidos.length === 1 ? 'pedido' : 'pedidos'}, R$ {grupo.totalValor.toFixed(2)}
                </span>
              </div>

              {/* Cards de Pedido */}
              <div className="space-y-1.5">
                {grupo.pedidos.map((ped) => {
                  const cli = ped.cliente_id ? mapaClientes.get(ped.cliente_id) : null;
                  const vendedor = ped.origem === 'mercadolivre'
                    ? 'Mercado Livre'
                    : ped.origem === 'catalogo_online'
                    ? 'Catálogo Online'
                    : (ped.vendedor_id ? mapaUsuarios.get(ped.vendedor_id) : 'Operador');
                  const cancelado = ped.status === 'cancelado';

                  return (
                    <div
                      key={ped.id}
                      onClick={() => setPedidoSelecionado(ped)}
                      className={`p-3 rounded-2xl transition cursor-pointer space-y-1 shadow-xs ${
                        isDark ? 'bg-[#000000] border border-slate-700 text-slate-100 hover:bg-slate-900' : 'bg-white border border-slate-300 text-black hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {cancelado ? (
                            <XCircle className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-red-400' : 'text-red-700'}`} />
                          ) : (
                            <Clock className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
                          )}
                          <span className={`font-black shrink-0 ${cancelado ? 'line-through text-red-600 dark:text-red-400' : (isDark ? 'text-white' : 'text-black')}`}>
                            R$ {Number(ped.valor_total).toFixed(2)}
                          </span>
                          {ped.origem === 'mercadolivre' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-[#FFE600] text-slate-950 font-black text-[9px] shrink-0">
                              <ShoppingBag className="w-2.5 h-2.5" />
                              ML
                            </span>
                          ) : (
                            <span className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>por {vendedor}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {Boolean((ped.comprovante_pagamento_url || '').trim()) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPedidoComprovanteModal(ped);
                              }}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border flex items-center gap-1 shadow-xs transition cursor-pointer active:scale-95 ${
                                isDark
                                  ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900'
                              }`}
                              title="Visualizar comprovante Pix enviado pelo cliente"
                            >
                              <Paperclip className="w-3 h-3" />
                              <span>Comprovante</span>
                            </button>
                          )}
                          {ped.status_pagamento === 'aguardando_pesagem' && ped.status !== 'cancelado' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPedidoParaPesagem(ped);
                              }}
                              className="hubi-btn-cta px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                            >
                              <Scale className="w-3 h-3" />
                              <span>Informar Peso</span>
                            </button>
                          )}
                          {ped.origem === 'mercadolivre' && ped.ml_shipment_id && onImprimirEtiquetaMl && ped.status !== 'cancelado' && (
                            <button
                              type="button"
                              disabled={imprimindoEtiquetaMlId === ped.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onImprimirEtiquetaMl(ped);
                              }}
                              className={`px-2 py-0.5 rounded-lg text-[9px] font-black border cursor-pointer disabled:opacity-50 ${
                                ped.ml_etiqueta_impressa
                                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                  : 'bg-[#FFE600] text-slate-950 border-amber-400'
                              }`}
                              title="Etiqueta Mercado Livre"
                            >
                              {ped.ml_etiqueta_impressa ? 'Reimprimir ML' : 'Etiqueta ML'}
                            </button>
                          )}
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wide border shrink-0 ${
                            ped.status === 'concluido'
                              ? (isDark ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40' : 'bg-emerald-50 text-emerald-900 border-emerald-300')
                              : ped.status === 'cancelado' || ped.status === 'vencido'
                              ? (isDark ? 'bg-red-950/50 text-red-300 border-red-500/40' : 'bg-red-50 text-red-900 border-red-300')
                              : ped.status === 'confirmado'
                              ? (isDark ? 'bg-blue-950/50 text-blue-300 border-blue-500/40' : 'bg-blue-50 text-blue-900 border-blue-300')
                              : ped.status === 'em_producao' || ped.status === 'em_expedicao' || ped.status === 'em_separacao'
                              ? (isDark ? 'bg-indigo-950/50 text-indigo-300 border-indigo-500/40' : 'bg-indigo-50 text-indigo-900 border-indigo-300')
                              : (isDark ? 'bg-amber-950/50 text-amber-300 border-amber-500/40' : 'bg-amber-50 text-amber-900 border-amber-300')
                          }`}>
                            {ROTULOS_STATUS_PEDIDO[ped.status] || ped.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>

                      <div className={`flex items-center justify-between text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>
                        <span className="truncate max-w-[200px]">
                          {(() => {
                            const its = ped.itens || ped.itens_pedido || [];
                            return `${its.length} itens: ${its.map((i: any) => `${i.quantidade}x ${i.nome_produto}`).join(', ')}`;
                          })()}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {(() => {
                            const pin = ped.pin_entrega || ped.pedido_entrega?.pin_entrega;
                            if (!pin) return null;
                            return (
                              <span className={`inline-flex items-center px-1.5 py-0.2 rounded font-black text-[9px] font-mono tracking-wider ${
                                isDark ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                              }`}>
                                PIN: {pin}
                              </span>
                            );
                          })()}
                          <span className={`font-mono font-bold ${isDark ? 'text-slate-300' : 'text-black'}`}>
                            #{ped.origem === 'catalogo_online' ? `c-${ped.numero_pedido}` : ped.numero_pedido}
                          </span>
                        </div>
                      </div>

                      {cli && (
                        <div className={`flex items-center gap-1 pt-0.5 text-[10px] font-bold uppercase ${isDark ? 'text-slate-300' : 'text-black'}`}>
                          <User className={`w-3 h-3 ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
                          <span>{cli.nome}</span>
                        </div>
                      )}

                      {(() => {
                        const infoVenc = obterInfoVencimentoFiado(ped);
                        const temFiadoEmAberto = (ped.pagamentos || []).some((pag: any) => pag.eh_pagamento_fiado || pag.forma_pagamento?.tipo === 'fiado') && !ped.fiado_quitado;
                        const estaVencido = ped.status === 'vencido' || (temFiadoEmAberto && ped.status !== 'concluido' && ped.status !== 'cancelado' && infoVenc.estaVencido);
                        if (!estaVencido) return null;
                        return (
                          <div className={`flex items-center justify-between pt-1 border-t text-[10px] ${isDark ? 'border-red-900/50' : 'border-red-200'}`}>
                            <span className="inline-flex items-center gap-1 font-bold text-red-600 dark:text-red-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                              Vencido
                            </span>
                            <span className="font-semibold text-red-600 dark:text-red-400">
                              Vencimento: {infoVenc.formatada}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 5. Barra Flutuante Inferior de Totais */}
      <div className={`p-3 flex items-center justify-between text-xs shrink-0 shadow-lg ${
        isDark ? 'bg-[#000000] border-t border-slate-800 text-slate-200' : 'bg-white border-t border-slate-300 text-black'
      }`}>
        <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-black'}`}>Total em pedidos</span>
        <span className={`font-black text-sm ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
          R$ {totalGeralPedidos.toFixed(2)} em {pedidosFiltrados.length} pedidos
        </span>
      </div>

      {/* ================================================================= */}
      {/* TELA 002: MODAL FILTROS AVANÇADOS */}
      {/* ================================================================= */}
      {modalFiltrosAvancados && (
        <div className={`fixed inset-0 z-50 flex flex-col justify-between animate-in slide-in-from-right duration-150 ${
          isDark ? 'bg-[#08131A] text-slate-100' : 'bg-slate-100 text-black'
        }`}>
          <div className={`h-14 px-4 flex items-center justify-between shrink-0 ${isDark ? 'bg-[#08131A] border-b border-slate-800' : 'bg-slate-100 border-b border-slate-300'}`}>
            <h2 className={`font-bold text-base ${isDark ? 'text-white' : 'text-black'}`}>Filtros</h2>
            <div className="flex items-center gap-2">
              {(dataInicio || dataFim || meiosPagamentoFiltro.length > 0 || canalFiltro !== 'todos' || !vendedoresSelecionados.includes('todos') || !statusSelecionados.includes('todos') || statusPagamentoSelecionado !== 'todos') && (
                <button
                  type="button"
                  onClick={() => {
                    setDataInicio('');
                    setDataFim('');
                    setMeiosPagamentoFiltro([]);
                    setCanalFiltro('todos');
                    setVendedoresSelecionados(['todos']);
                    setStatusSelecionados(['todos']);
                    setStatusPagamentoSelecionado('todos');
                  }}
                  className={`hubi-btn-neutral px-2.5 py-1 rounded-xl text-xs transition cursor-pointer ${
                    isDark ? 'bg-slate-800 text-slate-200 border border-slate-700' : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-semibold'
                  }`}
                >
                  Limpar
                </button>
              )}
              <button
                type="button"
                onClick={() => setModalFiltrosAvancados(false)}
                className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Canal de Venda & Vendedores */}
            <div className={`p-4 rounded-2xl space-y-3 ${isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'}`}>
              <h4 className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-black'}`}>Canal e Vendedor</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: 'todos', label: 'Todos canais' },
                  { id: 'pdv', label: 'PDV / Balcão' },
                  { id: 'catalogo_online', label: 'Catálogo Online' },
                  { id: 'mercadolivre', label: 'Mercado Livre' }
                ].map((c) => {
                  const ativo = canalFiltro === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCanalFiltro(c.id as any)}
                      className={`hubi-btn-neutral py-2 px-2.5 rounded-xl border text-xs transition cursor-pointer ${
                        ativo
                          ? (isDark ? 'bg-emerald-600 text-white border-emerald-500 font-bold' : 'bg-slate-200 border-slate-500 text-black font-bold')
                          : (isDark ? 'bg-slate-900 border-slate-700 text-slate-300 font-semibold' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black font-semibold')
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setModalVendedoresAberto(true)}
                className={`hubi-btn-neutral w-full py-2.5 px-3 rounded-xl border text-xs flex items-center justify-between transition cursor-pointer ${
                  isDark ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 font-semibold' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black font-semibold'
                }`}
              >
                <span>
                  Vendedores:{' '}
                  {vendedoresSelecionados.includes('todos')
                    ? 'Todos'
                    : `${vendedoresSelecionados.length} selecionado(s)`}
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Informe o período */}
            <div className={`p-4 rounded-2xl space-y-3 ${isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'}`}>
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <Calendar className="w-4 h-4" />
                <span className={isDark ? 'text-slate-200' : 'text-black'}>Informe o período</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-[10px] font-bold block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-900'}`}>Data inicial</label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className={`w-full py-1.5 px-2 rounded-lg text-xs focus:outline-none ${isDark ? 'bg-slate-900 border border-slate-700 text-white' : 'bg-white border border-slate-300 text-black'}`}
                  />
                </div>

                <div>
                  <label className={`text-[10px] font-bold block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-900'}`}>Data final</label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className={`w-full py-1.5 px-2 rounded-lg text-xs focus:outline-none ${isDark ? 'bg-slate-900 border border-slate-700 text-white' : 'bg-white border border-slate-300 text-black'}`}
                  />
                </div>
              </div>

              {/* Grid de Presets */}
              <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => aplicarPresetPeriodo('ultimos_30_dias')}
                  className={`hubi-btn-neutral col-span-2 py-2 rounded-xl font-bold transition cursor-pointer ${
                    isDark ? 'bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black'
                  }`}
                >
                  Últimos 30 dias
                </button>

                {['hoje', 'ontem', 'esta_semana', 'este_mes'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => aplicarPresetPeriodo(p)}
                    className={`hubi-btn-neutral py-2 rounded-xl capitalize font-semibold transition cursor-pointer ${
                      isDark ? 'bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black'
                    }`}
                  >
                    {p.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Meios de Pagamento */}
            <div className={`p-4 rounded-2xl space-y-2.5 ${isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'}`}>
              <h4 className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-black'}`}>Meio de Pagamento</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {['Dinheiro', 'Cartão de Débito', 'Cartão de Crédito', 'Caderneta', 'Venda Fiado', 'Pix', 'Voucher', 'Outros'].map((mp) => {
                  const marcado = meiosPagamentoFiltro.includes(mp);
                  return (
                    <label
                      key={mp}
                      className={`flex items-center gap-2.5 p-2 rounded-xl border transition cursor-pointer select-none ${
                        marcado
                          ? (isDark ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold' : 'bg-slate-200 border-slate-500 text-black font-bold')
                          : (isDark ? 'border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800' : 'border border-slate-300 bg-slate-100 text-black hover:bg-slate-200')
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={(e) => {
                          if (e.target.checked) setMeiosPagamentoFiltro([...meiosPagamentoFiltro, mp]);
                          else setMeiosPagamentoFiltro(meiosPagamentoFiltro.filter(m => m !== mp));
                        }}
                        className="sr-only"
                      />
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          marcado
                            ? (isDark ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-emerald-600 border-emerald-700 text-white')
                            : (isDark ? 'border-slate-600 bg-black' : 'border-slate-400 bg-white')
                        }`}
                      >
                        {marcado && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                      </div>
                      <span className="truncate">{mp}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={`p-4 shrink-0 ${isDark ? 'bg-[#08131A] border-t border-slate-800' : 'bg-slate-100 border-t border-slate-300'}`}>
            <button
              type="button"
              onClick={() => setModalFiltrosAvancados(false)}
              className="hubi-btn-cta w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition cursor-pointer"
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
          <div className={`rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom ${
            isDark ? 'bg-[#08131A] border-2 border-slate-400 text-slate-100' : 'bg-slate-100 border-2 border-slate-300 text-black'
          }`}>
            <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
              <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>Selecione um ou mais...</h3>
              <button
                type="button"
                onClick={() => setModalStatusAberto(false)}
                className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto text-xs">
              {[{ id: 'todos', label: 'Todos os status', count: pedidosBaseMobile.length }, ...opcoesStatusPedidoMobile].map((st) => {
                const count = st.count || 0;
                const selecionado = statusSelecionados.includes(st.id);
                return (
                  <div
                    key={st.id}
                    onClick={() => {
                      if (st.id === 'todos') {
                        setStatusSelecionados(['todos']);
                      } else {
                        const filtrados = statusSelecionados.filter(s => s !== 'todos');
                        if (!selecionado) setStatusSelecionados([...filtrados, st.id]);
                        else {
                          const rest = filtrados.filter(s => s !== st.id);
                          setStatusSelecionados(rest.length === 0 ? ['todos'] : rest);
                        }
                      }
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer select-none ${
                      selecionado
                        ? (isDark ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold' : 'bg-slate-200 border-slate-500 text-black font-bold')
                        : (isDark ? 'border border-slate-700 bg-[#000000] text-slate-300 hover:bg-slate-900' : 'border border-slate-300 bg-white text-black hover:bg-slate-50')
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          selecionado
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : (isDark ? 'border-slate-600 bg-black' : 'border-slate-400 bg-white')
                        }`}
                      >
                        {selecionado && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                      </div>
                      <span className="font-bold text-xs sm:text-sm">{st.label}</span>
                    </div>
                    <span className="bg-red-600 text-white text-[10px] font-black min-w-[20px] h-[20px] px-1.5 rounded-full flex items-center justify-center shadow-xs">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setModalStatusAberto(false)}
              className="hubi-btn-cta w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase shadow-sm transition cursor-pointer"
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
          <div className={`rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom ${
            isDark ? 'bg-[#08131A] border-2 border-slate-400 text-slate-100' : 'bg-slate-100 border-2 border-slate-300 text-black'
          }`}>
            <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
              <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>Selecione um ou mais...</h3>
              <button
                type="button"
                onClick={() => setModalVendedoresAberto(false)}
                className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto text-xs">
              {(() => {
                const todosMarcado = vendedoresSelecionados.includes('todos');
                return (
                  <div
                    onClick={() => setVendedoresSelecionados(['todos'])}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer select-none ${
                      todosMarcado
                        ? (isDark ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold' : 'bg-slate-200 border-slate-500 text-black font-bold')
                        : (isDark ? 'border border-slate-700 bg-[#000000] text-slate-300 hover:bg-slate-900' : 'border border-slate-300 bg-white text-black hover:bg-slate-50')
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          todosMarcado
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : (isDark ? 'border-slate-600 bg-black' : 'border-slate-400 bg-white')
                        }`}
                      >
                        {todosMarcado && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                      </div>
                      <span className="font-bold text-xs sm:text-sm">Todos os vendedores</span>
                    </div>
                    <User className="w-4 h-4 text-slate-400" />
                  </div>
                );
              })()}

              {(() => {
                const onlineMarcado = vendedoresSelecionados.includes('catalogo_online');
                return (
                  <div
                    onClick={() => {
                      const semTodos = vendedoresSelecionados.filter(v => v !== 'todos');
                      if (!onlineMarcado) setVendedoresSelecionados([...semTodos, 'catalogo_online']);
                      else {
                        const rest = semTodos.filter(v => v !== 'catalogo_online');
                        setVendedoresSelecionados(rest.length === 0 ? ['todos'] : rest);
                      }
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer select-none ${
                      onlineMarcado
                        ? (isDark ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold' : 'bg-slate-200 border-slate-500 text-black font-bold')
                        : (isDark ? 'border border-slate-700 bg-[#000000] text-slate-300 hover:bg-slate-900' : 'border border-slate-300 bg-white text-black hover:bg-slate-50')
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          onlineMarcado
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : (isDark ? 'border-slate-600 bg-black' : 'border-slate-400 bg-white')
                        }`}
                      >
                        {onlineMarcado && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                      </div>
                      <span className="font-bold text-xs sm:text-sm">Catálogo online</span>
                    </div>
                    <Store className="w-4 h-4 text-slate-400" />
                  </div>
                );
              })()}

              {usuarios.map((usr) => {
                const usrMarcado = vendedoresSelecionados.includes(usr.id);
                return (
                  <div
                    key={usr.id}
                    onClick={() => {
                      const semTodos = vendedoresSelecionados.filter(v => v !== 'todos');
                      if (!usrMarcado) setVendedoresSelecionados([...semTodos, usr.id]);
                      else {
                        const rest = semTodos.filter(v => v !== usr.id);
                        setVendedoresSelecionados(rest.length === 0 ? ['todos'] : rest);
                      }
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer select-none ${
                      usrMarcado
                        ? (isDark ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold' : 'bg-slate-200 border-slate-500 text-black font-bold')
                        : (isDark ? 'border border-slate-700 bg-[#000000] text-slate-300 hover:bg-slate-900' : 'border border-slate-300 bg-white text-black hover:bg-slate-50')
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          usrMarcado
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : (isDark ? 'border-slate-600 bg-black' : 'border-slate-400 bg-white')
                        }`}
                      >
                        {usrMarcado && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                      </div>
                      <span className="font-bold text-xs sm:text-sm">{usr.nome_completo}</span>
                    </div>
                    <User className="w-4 h-4 text-slate-400" />
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setModalVendedoresAberto(false)}
              className="hubi-btn-cta w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase shadow-sm transition cursor-pointer"
            >
              Filtrar
            </button>
          </div>
        </div>
      )}

      {/* MODAL HISTORICO FIADO DO CLIENTE (COMPRAS FIADO A VENCER) */}
      <ModalHistoricoFiadoCliente
        isOpen={!!clienteHistoricoFiadoModal}
        onClose={() => setClienteHistoricoFiadoModal(null)}
        cliente={clienteHistoricoFiadoModal}
        filtroInicial={filtroHistoricoFiadoModal}
        onClienteAtualizado={(c) => {
          onClienteAtualizado(c);
          if (onRecarregar) onRecarregar();
        }}
      />

      {/* MODAL OFICIAL DE RECIBO DO PEDIDO (REUTILIZADO DO DESKTOP) */}
      <ReciboPedidoModal
        isOpen={Boolean(pedidoReciboModal)}
        pedido={pedidoReciboModal}
        loja={loja}
        onClose={() => setPedidoReciboModal(null)}
      />

      {/* MODAL DE RASTREAMENTO DE ENVIOS (CORREIOS / MELHOR ENVIO) */}
      <ModalRastreioPedido
        isOpen={Boolean(pedidoRastreioModal)}
        onClose={() => setPedidoRastreioModal(null)}
        pedido={pedidoRastreioModal}
        entrega={entregaPedido}
        loja={loja}
        onAtualizarStatus={() => {
          if (onRecarregar) onRecarregar();
          setPedidoRastreioModal((prev: any) => (prev ? { ...prev, status: 'entregue' } : null));
        }}
      />

      {/* MODAL DE IMPRESSÃO DE ETIQUETA DE ENVIO */}
      {pedidoEtiquetaModal && loja && (
        <ModalImprimirEtiqueta
          isOpen={Boolean(pedidoEtiquetaModal)}
          onClose={() => setPedidoEtiquetaModal(null)}
          pedido={pedidoEtiquetaModal}
          loja={loja}
          entrega={entregaPedido}
        />
      )}

      {/* MODAL DEFINIR / ALTERAR ENVIO DO PEDIDO (MOBILE) */}
      <ModalDefinirEnvio
        isOpen={modalDefinirEnvioAberto && Boolean(pedidoSelecionado)}
        pedido={pedidoSelecionado}
        loja={loja}
        usuario={usuario}
        onClose={() => setModalDefinirEnvioAberto(false)}
        onSucesso={() => {
          setModalDefinirEnvioAberto(false);
          mostrarToast('Envio e entrega atualizados com sucesso!', 'sucesso');
          if (onRecarregar) onRecarregar();
        }}
        onFeedbackSucesso={(msg) => mostrarToast(msg, 'sucesso')}
        onFeedbackErro={(msg) => mostrarToast(msg, 'erro')}
      />

      {/* MODAL DE CONFERÊNCIA DE PESAGEM / BALANÇA (MOBILE) */}
      <ModalConferenciaPesagemPedido
        isOpen={Boolean(pedidoParaPesagem)}
        pedido={pedidoParaPesagem}
        loja={loja}
        usuarioId={usuario?.id}
        onClose={() => setPedidoParaPesagem(null)}
        onPesagemConfirmada={(pedidoAtualizado) => {
          setPedidoSelecionado((prev) =>
            prev && prev.id === pedidoAtualizado.id ? { ...prev, ...pedidoAtualizado } : prev
          );
          if (onRecarregar) onRecarregar();
        }}
      />
      {/* MODAL INTERNO DE VISUALIZAÇÃO DE COMPROVANTE PIX */}
      <ModalVisualizarComprovantePedido
        isOpen={Boolean(pedidoComprovanteModal)}
        pedido={pedidoComprovanteModal}
        onClose={() => setPedidoComprovanteModal(null)}
      />
    </div>
  );
};
