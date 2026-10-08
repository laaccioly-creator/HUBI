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
  ExternalLink
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { usePermissions } from '../hooks/usePermissions';
import { ShippingOrchestrator } from '../services/shippingOrchestrator';
import { Pedido, StatusPedido, StatusPagamento, Cliente, UsuarioLoja } from '../types';
import { PedidoEntrega, Transportadora } from '../types/shipping';
import { extrairObservacaoLimpa } from '../utils/formatters';
import { validarRastreioCorreios, detectarServicoPorCodigo } from '../utils/correiosValidator';
import { formatarNomeTransportadora } from '../utils/shippingDisplay';
import { ModalRastreioPedido } from './shipping/ModalRastreioPedido';
import { ModalDespacharPedido } from './shipping/ModalDespacharPedido';
import { ModalImprimirEtiqueta } from './shipping/ModalImprimirEtiqueta';
import { ReciboPedidoModal } from './pedidos/ReciboPedidoModal';
import { MelhorEnvioService } from '../services/melhorEnvioService';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import {
  ROTULOS_STATUS_PEDIDO,
  obterAbasStatusVisiveis,
  obterOpcoesStatusAlteracao,
  obterInfoVencimentoFiado,
  podeEditarPedido
} from '../utils/statusPedidoUtils';

interface HistoricoItemMobile {
  status: string;
  data: string;
  usuario?: string;
  tipo?: 'status' | 'edicao' | 'criacao';
  detalhes?: string;
}

const extrairHistoricoPedidoMobile = (pedido: Pedido): HistoricoItemMobile[] => {
  const itens: HistoricoItemMobile[] = [];

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

  // 2. Tentar ler do metadados.historico_status (Fallback retrocompatível)
  if (pedido.metadados && typeof pedido.metadados === 'object') {
    const historicoMeta = (pedido.metadados as any).historico_status;
    if (Array.isArray(historicoMeta) && historicoMeta.length > 0) {
      itens.push(...historicoMeta.map((item: any) => ({
        status: item.status,
        data: item.data,
        usuario: item.usuario,
        tipo: item.tipo || 'status',
        detalhes: item.detalhes
      })));
    }
  }

  // 3. Fallback para tag legacy em observacoes <!--HUBI_HISTORICO:[...]--> se nao achou metadados.historico_status
  if (itens.length === 0) {
    try {
      const match = pedido.observacoes?.match(/<!--HUBI_HISTORICO:(.*?)-->/);
      if (match && match[1]) {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          itens.push(...parsed);
        }
      }
    } catch {
      // fallback
    }
  }

  // 4. Histórico de edições do pedido (metadados.historico_edicoes)
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

  if (itens.length === 0) {
    if (pedido.criado_em) {
      itens.push({
        status: 'pendente',
        data: pedido.criado_em,
        usuario: pedido.vendedor?.nome_completo || (pedido.origem === 'catalogo_online' ? 'Catálogo Online' : 'Sistema'),
        tipo: 'status'
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

  const vistos = new Set<string>();
  const itensUnicos = itens.filter(item => {
    const chave = `${item.data}_${item.status}_${item.usuario}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });

  return itensUnicos.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
};
import { PrintService, formatarDataRecibo, obterDadosPagamentoRecibo } from '../services/printService';
import { ClientePerfilMobile } from './ClientePerfilMobile';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';
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

interface PedidosListaMobileProps {
  pedidos: Pedido[];
  clientes: Cliente[];
  usuarios: UsuarioLoja[];
  carregando: boolean;
  pedidoSelecionadoInicial?: Pedido | null;
  onVoltarOrigem?: () => void;
  onAlterarStatus: (pedidoId: string, novoStatus: StatusPedido) => void;
  onCancelarPedido: (pedido: Pedido) => void;
  onAbrirReceberPagamento: (pedido: Pedido) => void;
  onAbrirReceberFiado?: (pedido: Pedido) => void;
  onAbrirDrawerMenu: () => void;
  onClienteAtualizado: (cliente: Cliente) => void;
  onRecarregar?: () => void;
  onDespacharPedido?: (pedido: Pedido) => void;
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
  onAbrirDrawerMenu,
  onClienteAtualizado,
  onRecarregar,
  onDespacharPedido
}) => {
  const navigate = useNavigate();
  const { loja, usuario } = useAuth();
  const { carregarPedidoParaEdicao } = useCart();
  const { ehAdmin, ehGerente } = usePermissions();
  const { mostrarToast } = useFeedbackModal();
  const podeConcluirManual = ehAdmin || ehGerente;

  // Estados de Navegação de Telas
  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(pedidoSelecionadoInicial || null);

  useEffect(() => {
    if (pedidoSelecionadoInicial) {
      setPedidoSelecionado(pedidoSelecionadoInicial);
    }
  }, [pedidoSelecionadoInicial]);
  const [clientePerfilSelecionado, setClientePerfilSelecionado] = useState<Cliente | null>(null);
  const [drawerInternoAberto, setDrawerInternoAberto] = useState<boolean>(false);
  const [clienteHistoricoFiadoModal, setClienteHistoricoFiadoModal] = useState<Cliente | null>(null);
  const [filtroHistoricoFiadoModal, setFiltroHistoricoFiadoModal] = useState<'todos' | 'vencidos' | 'a_vencer'>('a_vencer');
  const [pedidoReciboModal, setPedidoReciboModal] = useState<Pedido | null>(null);
  const [pedidoRastreioModal, setPedidoRastreioModal] = useState<Pedido | null>(null);
  const [pedidoEtiquetaModal, setPedidoEtiquetaModal] = useState<Pedido | null>(null);
  const [gerandoEtiquetaOficial, setGerandoEtiquetaOficial] = useState<boolean>(false);
  const [modalDefinirEnvioAberto, setModalDefinirEnvioAberto] = useState<boolean>(false);

  const handleImprimirEtiquetaOficialMelhorEnvio = async (ped: Pedido) => {
    if (!loja?.id) {
      mostrarToast('Loja não identificada.', 'erro');
      return;
    }
    const pe = ped.pedido_entrega || entregaPedido;
    const ordemId = pe?.servico_codigo || (ped as any)?.servico_codigo || (ped.codigo_rastreio?.startsWith('ORD-') ? ped.codigo_rastreio : undefined);

    setGerandoEtiquetaOficial(true);
    mostrarToast('Buscando Etiqueta Oficial em PDF na Jadlog/Correios...', 'info');
    try {
      const url = await MelhorEnvioService.obterEtiquetaOficialPdf(ped.id, loja.id, ordemId, 'etiqueta');
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        mostrarToast('Etiqueta oficial aberta em nova aba!', 'sucesso');
      } else {
        mostrarToast('Não foi possível gerar a etiqueta oficial no momento. Abrindo etiqueta HUBI.', 'aviso');
        setPedidoEtiquetaModal(ped);
      }
    } catch (err: any) {
      mostrarToast(err?.message || 'Falha ao buscar etiqueta oficial. Abrindo etiqueta interna.', 'aviso');
      setPedidoEtiquetaModal(ped);
    } finally {
      setGerandoEtiquetaOficial(false);
    }
  };

  const handleImprimirDeclaracaoConteudoMelhorEnvio = async (ped: Pedido) => {
    if (!loja?.id) return;
    const pe = ped.pedido_entrega || entregaPedido;
    const ordemId = pe?.servico_codigo || (ped as any)?.servico_codigo;

    setGerandoEtiquetaOficial(true);
    mostrarToast('Buscando Declaração de Conteúdo...', 'info');
    try {
      const url = await MelhorEnvioService.obterEtiquetaOficialPdf(ped.id, loja.id, ordemId, 'declaracao');
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        mostrarToast('Declaração de Conteúdo aberta!', 'sucesso');
      } else {
        mostrarToast('Declaração não disponível na transportadora.', 'aviso');
      }
    } catch (err: any) {
      mostrarToast(err?.message || 'Erro ao gerar declaração de conteúdo.', 'erro');
    } finally {
      setGerandoEtiquetaOficial(false);
    }
  };

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
    const cleanTel = tel.replace(/\D/g, '');
    const url = cleanTel
      ? `https://wa.me/55${cleanTel}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleAcionarDespacho = (ped: Pedido) => {
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

    const ehMelhorEnvio =
      peProvedor === 'melhor_envio' ||
      metaProvedor === 'melhor_envio' ||
      diretoProvedor === 'melhor_envio' ||
      textoConsolidado.includes('melhor envio') ||
      textoConsolidado.includes('melhorenvio');

    const nomeApp = (pedido as any)?.nome_app || pe?.nome_app || (pedido as any)?.metadados?.nome_app;
    const ehAppEntrega =
      pe?.tipo_operacao === 'app_entrega' ||
      (pedido as any)?.tipo_operacao === 'app_entrega' ||
      Boolean(pe?.app_entrega_id) ||
      Boolean(nomeApp);

    const ehUberDirect =
      !ehMelhorEnvio &&
      !ehAppEntrega &&
      (peProvedor === 'uber' ||
      metaProvedor === 'uber' ||
      diretoProvedor === 'uber' ||
      textoConsolidado.includes('uber direct'));

    const ehTransportadoraPrivada =
      !ehMelhorEnvio &&
      !ehUberDirect &&
      (pe?.tipo_operacao === 'transportadora' ||
      (pedido as any)?.tipo_operacao === 'transportadora' ||
      Boolean(pe?.transportadora_id) ||
      peTransp.toLowerCase().includes('jadlog') ||
      metaTransp.toLowerCase().includes('jadlog') ||
      diretoTransp.toLowerCase().includes('jadlog') ||
      ((peTransp.toLowerCase().includes('transportadora') || metaTransp.toLowerCase().includes('transportadora') || diretoTransp.toLowerCase().includes('transportadora')) && !textoConsolidado.includes('correios')));

    const servicoCorreios =
      (pedido as any)?.servico_correios ||
      pe?.servico_correios ||
      (textoConsolidado.includes('sedex') && !ehTransportadoraPrivada ? 'SEDEX' : '') ||
      (textoConsolidado.includes('pac') && !ehTransportadoraPrivada ? 'PAC' : '') ||
      (!ehTransportadoraPrivada ? detectarServicoPorCodigo(pe?.codigo_rastreio || pedido.codigo_rastreio) : null);

    const ehCorreios =
      !ehMelhorEnvio &&
      !ehUberDirect &&
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
    } else if (ehUberDirect) {
      prov = 'uber';
      provNome = peTransp || metaTransp || diretoTransp || 'Uber Direct';
    } else if (ehAppEntrega) {
      prov = 'frete_proprio';
      provNome = nomeApp || (peTransp && peTransp.toLowerCase() !== 'entrega' && !peTransp.toLowerCase().includes('corrida') ? peTransp : 'Uber Flash');
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
        alert(validacao.motivo || 'Código de rastreamento inválido para os Correios.');
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
    } catch (err: any) {
      console.error('Erro ao despachar pedido:', err);
      alert(err.message || 'Erro ao despachar pedido.');
    } finally {
      setDespachando(false);
    }
  };

  const handleForcarConclusaoContingencia = async () => {
    if (!pedidoSelecionado) return;
    try {
      setExecutandoContingencia(true);
      const agora = new Date().toISOString();
      await ShippingOrchestrator.forcarConclusaoManual(
        pedidoSelecionado.id,
        usuario?.id || null
      );
      const pedidoAtualizado: Pedido = {
        ...pedidoSelecionado,
        status: 'concluido',
        despachado_em: agora,
        despachado_por: usuario?.id || null
      };
      setPedidoSelecionado(pedidoAtualizado);
      onAlterarStatus(pedidoSelecionado.id, 'concluido');
      if (onRecarregar) await onRecarregar();
      setModalContingenciaAberto(false);
    } catch (err: any) {
      console.error('Erro ao forçar conclusão manual:', err);
      alert(err.message || 'Erro ao forçar conclusão manual.');
    } finally {
      setExecutandoContingencia(false);
    }
  };

  // Estados de Busca e Filtros Rápidos (TELA001, TELA003, TELA004)
  const [busca, setBusca] = useState<string>('');
  const [ouvindoVoz, setOuvindoVoz] = useState<boolean>(false);
  const [modalStatusAberto, setModalStatusAberto] = useState<boolean>(false);
  const [statusSelecionados, setStatusSelecionados] = useState<string[]>(['todos']);

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
    const ehRetirada = (pedidoSelecionado as any)?.tipo_atendimento === 'retirada' ||
      (pedidoSelecionado as any)?.tipo_entrega === 'retirada' ||
      pedidoSelecionado?.forma_entrega?.tipo === 'retirada' ||
      pedidoSelecionado?.pedido_entrega?.tipo_atendimento === 'retirada';
    return obterOpcoesStatusAlteracao(loja, pedidoSelecionado?.status, ehRetirada);
  }, [loja, pedidoSelecionado?.status, pedidoSelecionado]);

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
  const [modalVincularCliente, setModalVincularCliente] = useState<boolean>(false);
  const [buscaVincularCliente, setBuscaVincularCliente] = useState<string>('');

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

  const handleVincularClienteAoPedido = async (clienteId: string) => {
    if (!pedidoSelecionado) return;
    try {
      const { error } = await supabase
        .from('pedidos')
        .update({ cliente_id: clienteId, atualizado_em: new Date().toISOString() })
        .eq('id', pedidoSelecionado.id);
      if (error) throw error;
      setPedidoSelecionado(prev => prev ? ({ ...prev, cliente_id: clienteId }) : null);
      setModalVincularCliente(false);
      setBuscaVincularCliente('');
      if (onRecarregar) await onRecarregar();
    } catch (err) {
      console.error('Erro ao vincular cliente ao pedido:', err);
      alert('Erro ao vincular cliente ao pedido.');
    }
  };

  // Contagem de pedidos por status (tudo diferente de 'concluido' é pedido aberto)
  const contagensPorStatus = useMemo(() => {
    const counts: Record<string, number> = {
      todos: 0,
      pendente: 0,
      confirmado: 0,
      em_separacao: 0,
      em_producao: 0,
      aguardando_envio: 0,
      enviado: 0,
      entregue: 0,
      pronto_para_retirar: 0,
      cancelado: 0
    };

    const t = busca.toLowerCase().trim();

    pedidos.forEach((p) => {
      if (t) {
        const numStr = String(p.numero_pedido);
        const cli = p.cliente_id ? mapaClientes.get(p.cliente_id) : null;
        const cliNome = cli?.nome.toLowerCase() || '';
        const itensList = p.itens || p.itens_pedido || [];
        const temItem = itensList.some((i: any) => i.nome_produto?.toLowerCase().includes(t));
        if (!numStr.includes(t) && !cliNome.includes(t) && !temItem) return;
      }

      if (p.status !== 'concluido') {
        counts.todos += 1;
      }
      if (counts[p.status] !== undefined) {
        counts[p.status] += 1;
      }
    });

    return counts;
  }, [pedidos, busca, mapaClientes]);

  // Filtros aplicados
  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter(p => {
      // Regra obrigatória: só devem ser exibidos registros cujo status for diferente de concluído
      if (p.status === 'concluido') return false;

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
        const matchStatusDireto = statusSelecionados.includes(p.status);
        const querVencido = statusSelecionados.includes('vencido');
        const infoVenc = obterInfoVencimentoFiado(p);
        const temFiadoEmAberto = (p.pagamentos || []).some((pag: any) => pag.eh_pagamento_fiado || pag.forma_pagamento?.tipo === 'fiado') && !p.fiado_quitado;
        const matchVencido = querVencido && (p.status === 'vencido' || (temFiadoEmAberto && p.status !== 'cancelado' && infoVenc.estaVencido));

        if (!matchStatusDireto && !matchVencido) return false;
      }

      // 3. Filtro de Vendedores
      if (!vendedoresSelecionados.includes('todos')) {
        const pedVendedor = p.vendedor_id || (p.origem === 'catalogo_online' ? 'catalogo_online' : null);
        if (!pedVendedor || !vendedoresSelecionados.includes(pedVendedor)) return false;
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
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                setPedidoSelecionado(null);
                if (onVoltarOrigem) {
                  onVoltarOrigem();
                }
              }}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition cursor-pointer"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="text-xs font-bold text-slate-800 truncate">
              {new Date(pedidoSelecionado.data_venda).toLocaleDateString('pt-BR')}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Status textual informativo no canto superior direito */}
            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wide border ${
              pedidoSelecionado.status === 'concluido'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : pedidoSelecionado.status === 'cancelado'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : pedidoSelecionado.status === 'confirmado'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : pedidoSelecionado.status === 'em_producao' || pedidoSelecionado.status === 'em_expedicao'
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {ROTULOS_STATUS_PEDIDO[pedidoSelecionado.status] || pedidoSelecionado.status.replace(/_/g, ' ')}
            </span>

            {cli && (
              <button
                type="button"
                onClick={() => setClientePerfilSelecionado(cli)}
                className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold uppercase truncate max-w-[90px] flex items-center gap-1"
              >
                <span className="truncate">{cli.nome}</span>
                <User className="w-3 h-3 text-slate-400 shrink-0" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setPedidoReciboModal(pedidoSelecionado)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 cursor-pointer"
              title="Ver Recibo"
            >
              <FileText className="w-5 h-5" />
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
            {pedidoSelecionado.status === 'cancelado' ? (
              <div className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 flex items-center gap-1.5 text-xs font-bold text-rose-700">
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>Cancelado (Imutável)</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setModalAlterarStatus(true)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center gap-1.5 text-xs font-bold capitalize text-slate-700 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-emerald-500" />
                <span>{pedidoSelecionado.status.replace(/_/g, ' ')}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}

            {/* Pílula de Pagamento Real */}
            {(() => {
              const pagInfo = obterDadosPagamentoRecibo(pedidoSelecionado);
              const ehFiado = pagInfo.ehFiado;
              const ehPago = pagInfo.foiPago;
              const nomeFormaRaw = pagInfo.pagamentosDetalhados?.[0]?.forma;
              const formaLimpa = extrairFormaLimpa(nomeFormaRaw);

              if (ehFiado) {
                return (
                  <div className="px-3 py-1.5 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 flex items-center gap-1.5 text-xs font-bold">
                    <DollarSign className="w-3.5 h-3.5 text-purple-600" />
                    <span>Fiado</span>
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

          {/* Observação e Ação */}
          {(() => {
            const obsAtualLimpa = extrairObservacaoLimpa(pedidoSelecionado.observacoes);

            return (
              <div className="pt-1 space-y-1.5">
                {obsAtualLimpa && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                    <span className="font-bold block text-[10px] text-amber-700 uppercase tracking-wide">Observação:</span>
                    <p className="whitespace-pre-wrap break-words">{obsAtualLimpa}</p>
                  </div>
                )}
                {pedidoSelecionado.status !== 'cancelado' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const obs = prompt('Adicionar observação ao pedido:', obsAtualLimpa);
                      if (obs !== null) {
                        const obsFinal = obs.trim() || null;
                        await supabase.from('pedidos').update({ observacoes: obsFinal, atualizado_em: new Date().toISOString() }).eq('id', pedidoSelecionado.id);
                        setPedidoSelecionado({ ...pedidoSelecionado, observacoes: obsFinal });
                        if (onRecarregar) onRecarregar();
                      }
                    }}
                    className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>+ {obsAtualLimpa ? 'Editar observação' : 'Adicionar observação'}</span>
                  </button>
                )}
              </div>
            );
          })()}
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
                  {new Date(pedidoSelecionado.data_venda).toLocaleDateString('pt-BR')}
                </span>
                <div className="pt-2 border-t border-slate-200/60 flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-slate-400">Origem / Vendedor:</span>
                    <span className="font-bold text-slate-800">
                      {pedidoSelecionado.origem === 'catalogo_online' ? 'Catálogo Online' : (mapaUsuarios.get(pedidoSelecionado.vendedor_id || '') || pedidoSelecionado.vendedor?.nome_completo || 'Vendedor')}
                    </span>
                  </div>
                  {(() => {
                    const pagInfo = obterDadosPagamentoRecibo(pedidoSelecionado);
                    const ehFiado = pagInfo.ehFiado || (pedidoSelecionado.pagamentos || []).some((p: any) => p.eh_pagamento_fiado || p.forma_pagamento?.tipo === 'fiado');
                    if (!ehFiado) return null;
                    const infoVenc = obterInfoVencimentoFiado(pedidoSelecionado);
                    return (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/40">
                        <span className="text-slate-400">Data Vencimento:</span>
                        <div className="text-right">
                          <span className={`font-bold ${infoVenc.estaVencido ? 'text-rose-600' : 'text-slate-800'}`}>
                            {infoVenc.formatada}
                          </span>
                          {infoVenc.estaVencido && (
                            <span className="text-[10px] font-bold text-rose-600 block">Vencido</span>
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
                      <div className="flex items-center justify-between text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                        <span>Última edição:</span>
                        <span className="font-bold">{editorNome}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Observação no Detalhe */}
              {(() => {
                const obsLimpa = extrairObservacaoLimpa(pedidoSelecionado.observacoes);
                if (!obsLimpa) return null;
                return (
                  <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-amber-700 text-[10px] uppercase">
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
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
                    <span className="font-bold text-[11px] text-slate-500 uppercase tracking-wide block">Histórico do Pedido</span>
                    <div className="space-y-2.5">
                      {historico.map((item, idx, arr) => {
                        const isLast = idx === arr.length - 1;
                        const isEdicao = item.tipo === 'edicao';
                        return (
                          <div key={idx} className="flex items-start gap-2.5 text-xs">
                            <div
                              className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${
                                isEdicao
                                  ? 'bg-amber-500 ring-4 ring-amber-100'
                                  : isLast
                                  ? 'bg-emerald-500 ring-4 ring-emerald-100'
                                  : 'bg-slate-400'
                              }`}
                            />
                            <div>
                              <p className={`font-bold capitalize ${isEdicao ? 'text-amber-700' : isLast ? 'text-emerald-700' : 'text-slate-700'}`}>
                                {item.status.replace(/_/g, ' ')}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-normal">
                                <span>{new Date(item.data).toLocaleString('pt-BR')}</span>
                                {item.usuario && <span>• {item.usuario}</span>}
                              </div>
                              {item.detalhes && (
                                <p className="text-[10px] text-slate-500 mt-0.5">{item.detalhes}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

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

                <div className="flex justify-between text-slate-500">
                  <span>Valor do Frete:</span>
                  <span className={Number(pedidoSelecionado.valor_frete || 0) === 0 ? "text-emerald-600 font-medium" : ""}>
                    {Number(pedidoSelecionado.valor_frete || 0) > 0 
                      ? `R$ ${Number(pedidoSelecionado.valor_frete).toFixed(2)}` 
                      : 'Grátis'}
                  </span>
                </div>

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
                <div className="space-y-4 py-4 px-4">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <User className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-slate-700">Venda Avulsa</h4>
                    <p className="text-xs text-slate-400">Nenhum cliente está vinculado a este pedido.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalVincularCliente(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-sm transition active:scale-95 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Vincular Cliente</span>
                  </button>
                </div>
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
              className="h-12 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
              title="Opções do Pedido"
            >
              <MoreVertical className="w-4 h-4 text-slate-500" />
              <span>Opções</span>
            </button>

            {pedidoSelecionado.status === 'cancelado' ? (
              <div className="flex-1 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2">
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>Pedido Cancelado</span>
              </div>
            ) : pedidoSelecionado.status === 'pendente' ? (
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
            ) : (() => {
                const pagInfo = obterDadosPagamentoRecibo(pedidoSelecionado);
                const ehFiado = pagInfo.ehFiado || (pedidoSelecionado.pagamentos || []).some((p: any) => p.eh_pagamento_fiado || p.forma_pagamento?.tipo === 'fiado');
                return ehFiado && pedidoSelecionado.status === 'confirmado';
              })() ? (
              <button
                type="button"
                onClick={async () => {
                  let cli = pedidoSelecionado.cliente_id ? (mapaClientes.get(pedidoSelecionado.cliente_id) || null) : ((pedidoSelecionado.cliente as Cliente) || null);
                  if (!cli && pedidoSelecionado.cliente_id) {
                    try {
                      const { data } = await supabase.from('clientes').select('*').eq('id', pedidoSelecionado.cliente_id).single();
                      if (data) cli = data as Cliente;
                    } catch (e) {
                      console.warn('Erro ao buscar cliente:', e);
                    }
                  }

                  if (cli) {
                    setFiltroHistoricoFiadoModal('a_vencer');
                    setClienteHistoricoFiadoModal(cli);
                  } else {
                    if (onAbrirReceberFiado) {
                      onAbrirReceberFiado(pedidoSelecionado);
                    } else {
                      onAbrirReceberPagamento(pedidoSelecionado);
                    }
                  }
                }}
                className="flex-1 h-12 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition cursor-pointer active:scale-95"
                title="Receber pagamento do fiado"
              >
                <DollarSign className="w-4 h-4" />
                <span>Receber Fiado</span>
              </button>
            ) : pedidoSelecionado.status === 'aguardando_envio' ? (
              (() => {
                const pe = entregaPedido || pedidoSelecionado.pedido_entrega;
                const prov = pe?.provedor || (pedidoSelecionado as any)?.entrega_provedor;
                const ehParceiro = prov === 'uber' || prov === 'melhor_envio';

                if (ehParceiro) {
                  return (
                    <div className="flex-1 flex flex-col gap-1.5">
                      <div className="h-11 px-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 font-bold text-[11px] uppercase flex items-center justify-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Aguardando Envio ({prov === 'uber' ? 'Uber Direct' : 'Melhor Envio'})</span>
                      </div>
                    </div>
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
                    className="flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition cursor-pointer active:scale-95"
                  >
                    <Truck className="w-4 h-4" />
                    <span>Despachar / Concluir Entrega</span>
                  </button>
                );
              })()
            ) : pedidoSelecionado.status !== 'concluido' ? (
              <button
                type="button"
                onClick={() => {
                  const saldoDevedor = Number(pedidoSelecionado.saldo_devedor ?? (Number(pedidoSelecionado.valor_total || 0) - Number(pedidoSelecionado.valor_pago || 0)));
                  const estaQuitado = saldoDevedor <= 0.009;
                  if (estaQuitado) {
                    onAlterarStatus(pedidoSelecionado.id, 'concluido');
                    setPedidoSelecionado({ ...pedidoSelecionado, status: 'concluido' });
                  } else {
                    onAbrirReceberPagamento(pedidoSelecionado);
                  }
                }}
                className="flex-1 h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
              >
                {(() => {
                  const saldoDevedor = Number(pedidoSelecionado.saldo_devedor ?? (Number(pedidoSelecionado.valor_total || 0) - Number(pedidoSelecionado.valor_pago || 0)));
                  const estaQuitado = saldoDevedor <= 0.009;
                  return estaQuitado ? 'Concluir Pedido' : 'Receber e Concluir';
                })()}
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex-1 h-12 rounded-2xl bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center">
                Pedido {pedidoSelecionado.status}
              </div>
            )}
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
                {opcoesStatusAlteracao.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      if (st.id === 'concluido') {
                        const saldoDevedor = Number(pedidoSelecionado.saldo_devedor ?? (Number(pedidoSelecionado.valor_total || 0) - Number(pedidoSelecionado.valor_pago || 0)));
                        if (saldoDevedor > 0.009) {
                          setModalAlterarStatus(false);
                          onAbrirReceberPagamento(pedidoSelecionado);
                          return;
                        }
                      }
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

        {/* TELA009: MODAL OPÇÕES DO PEDIDO (COMPACTO, LIMPO & LINHA ÚNICA) */}
        {modalOpcoesPedido && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
            <div className="bg-white rounded-t-3xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto space-y-2 shadow-2xl animate-in slide-in-from-bottom">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-1">
                <h3 className="font-bold text-sm text-slate-800">Opções do Pedido #{pedidoSelecionado.numero_pedido}</h3>
                <button
                  type="button"
                  onClick={() => setModalOpcoesPedido(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Informações Logísticas e Operacionais Resolvidas com Lógica Oficial do Desktop */}
              {(() => {
                const { prov, pe, provNome, isRetirada } = resolverProvedorEntrega(pedidoSelecionado, entregaPedido);
                const isUber = prov === 'uber';
                const ehMelhorEnvio = prov === 'melhor_envio';
                const isMelhorEnvio = ehMelhorEnvio;

                const linkRastreio = (pedidoSelecionado.link_rastreio || pe?.link_rastreio || '').trim();
                const codigoRastreio = (pedidoSelecionado.codigo_rastreio || pe?.codigo_rastreio || '').trim();
                const linkEtiqueta = String((pe as any)?.link_etiqueta || (pedidoSelecionado as any)?.link_etiqueta || (pe as any)?.etiqueta_url || (pedidoSelecionado as any)?.etiqueta_url || '').trim();

                const aguardaEnvio =
                  pedidoSelecionado.status === 'aguardando_envio' ||
                  (pedidoSelecionado.status === 'confirmado' && !isRetirada);

                const emTransitoOuEntregue =
                  pedidoSelecionado.status === 'enviado' ||
                  pedidoSelecionado.status === 'saiu_para_entrega' ||
                  pedidoSelecionado.status === 'entregue';

                const prontoParaConcluir =
                  emTransitoOuEntregue ||
                  pedidoSelecionado.status === 'pronto_para_retirar';

                const temRastreio = Boolean(codigoRastreio || linkRastreio || (ehMelhorEnvio && emTransitoOuEntregue));
                const temEtiquetaEmitida = !isRetirada && Boolean(linkEtiqueta || (ehMelhorEnvio && emTransitoOuEntregue));

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
                    {/* Ação 1: Gerar Envio / Chamar Uber (se aguarda envio) */}
                    {aguardaEnvio && !isUber && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          handleAcionarDespacho(pedidoSelecionado);
                        }}
                        className="w-full h-11 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2.5 transition text-left cursor-pointer shadow-sm active:scale-98"
                      >
                        <Truck className="w-4 h-4 text-white shrink-0" />
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
                        className="w-full h-11 px-3.5 rounded-xl bg-slate-950 hover:bg-black text-white font-bold text-xs flex items-center gap-2.5 transition text-left cursor-pointer shadow-sm active:scale-98"
                      >
                        <Truck className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Chamar Uber</span>
                      </button>
                    )}

                    {/* Ação 2: Concluir Pedido (se pronto para concluir e não finalizado/cancelado) */}
                    {prontoParaConcluir && pedidoSelecionado.status !== 'concluido' && pedidoSelecionado.status !== 'cancelado' && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          onAlterarStatus(pedidoSelecionado.id, 'concluido');
                          setPedidoSelecionado({ ...pedidoSelecionado, status: 'concluido' });
                          mostrarToast('Pedido concluído com sucesso!', 'sucesso');
                        }}
                        className="w-full h-11 px-3.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs flex items-center gap-2.5 transition text-left cursor-pointer active:scale-98"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
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
                        className="w-full h-11 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center gap-2.5 border border-slate-100 transition text-left cursor-pointer active:scale-98"
                      >
                        <Package className="w-4 h-4 text-sky-600 shrink-0" />
                        <span>Rastrear Envio</span>
                      </button>
                    )}

                    {/* Ação 4: Imprimir Etiqueta (APENAS se já enviado/entregue e houver etiqueta) */}
                    {emTransitoOuEntregue && temEtiquetaEmitida && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          if (linkEtiqueta) {
                            window.open(linkEtiqueta, '_blank', 'noopener,noreferrer');
                          } else {
                            handleImprimirEtiquetaOficialMelhorEnvio(pedidoSelecionado);
                          }
                        }}
                        disabled={gerandoEtiquetaOficial}
                        className="w-full h-11 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center gap-2.5 border border-slate-100 transition text-left cursor-pointer active:scale-98"
                      >
                        <Printer className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Imprimir Etiqueta</span>
                      </button>
                    )}

                    {/* Ação 5: Declaração de Conteúdo (APENAS se já enviado e Melhor Envio) */}
                    {emTransitoOuEntregue && ehMelhorEnvio && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          handleImprimirDeclaracaoConteudoMelhorEnvio(pedidoSelecionado);
                        }}
                        disabled={gerandoEtiquetaOficial}
                        className="w-full h-11 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center gap-2.5 border border-slate-100 transition text-left cursor-pointer active:scale-98"
                      >
                        <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                        <span>Declaração de Conteúdo</span>
                      </button>
                    )}

                    {/* Ação 6: Etiqueta HUBI (APENAS se já enviado e não retirada) */}
                    {emTransitoOuEntregue && !isRetirada && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          setPedidoEtiquetaModal(pedidoSelecionado);
                        }}
                        className="w-full h-11 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center gap-2.5 border border-slate-100 transition text-left cursor-pointer active:scale-98"
                      >
                        <Tag className="w-4 h-4 text-slate-500 shrink-0" />
                        <span>Etiqueta HUBI</span>
                      </button>
                    )}

                    {/* Ação 7: Recibo (sempre disponível, fecha opções e abre Recibo oficial) */}
                    <button
                      type="button"
                      onClick={() => {
                        setModalOpcoesPedido(false);
                        setPedidoReciboModal(pedidoSelecionado);
                      }}
                      className="w-full h-11 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center gap-2.5 border border-slate-100 transition text-left cursor-pointer active:scale-98"
                    >
                      <Receipt className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Recibo</span>
                    </button>

                    {/* Ação 8: Alterar Frete (apenas se não cancelado, não concluído e ainda não despachado) */}
                    {pedidoSelecionado.status !== 'cancelado' && pedidoSelecionado.status !== 'concluido' && !emTransitoOuEntregue && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          setModalDefinirEnvioAberto(true);
                        }}
                        className="w-full h-11 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center gap-2.5 border border-slate-100 transition text-left cursor-pointer active:scale-98"
                      >
                        <Truck className="w-4 h-4 text-blue-600 shrink-0" />
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
                        className="w-full h-11 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center gap-2.5 border border-slate-100 transition text-left cursor-pointer active:scale-98"
                      >
                        <UserCheck2 className="w-4 h-4 text-slate-500 shrink-0" />
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
                        className="w-full h-11 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center gap-2.5 border border-slate-100 transition text-left cursor-pointer active:scale-98"
                      >
                        <Edit2 className="w-4 h-4 text-slate-500 shrink-0" />
                        <span>Editar Pedido</span>
                      </button>
                    )}

                    {/* Ação 11: Cancelar Pedido (ao final, em tom vermelho suave) */}
                    {pedidoSelecionado.status !== 'cancelado' && pedidoSelecionado.status !== 'concluido' && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpcoesPedido(false);
                          onCancelarPedido(pedidoSelecionado);
                          setPedidoSelecionado(null);
                        }}
                        className="w-full h-11 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs flex items-center gap-2.5 border border-rose-200/50 transition text-left cursor-pointer active:scale-98"
                      >
                        <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Cancelar Pedido</span>
                      </button>
                    )}
                  </div>
                );
              })()}
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

        {/* MODAL VINCULAR CLIENTE AO PEDIDO AVULSO */}
        {modalVincularCliente && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center animate-in fade-in">
            <div className="bg-white rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom text-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-bold text-sm text-slate-800">Vincular Cliente ao Pedido</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setModalVincularCliente(false);
                    setBuscaVincularCliente('');
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Barra de Busca de Clientes */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou telefone..."
                  value={buscaVincularCliente}
                  onChange={(e) => setBuscaVincularCliente(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 font-medium"
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
                      className="w-full p-2.5 rounded-xl border border-slate-100 hover:border-emerald-500 hover:bg-emerald-50/40 text-left transition flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <span className="font-bold text-xs text-slate-800 block">{cliItem.nome}</span>
                        <span className="text-[10px] text-slate-400">
                          {cliItem.whatsapp || cliItem.telefone || 'Sem telefone'}
                        </span>
                      </div>
                      <User className="w-4 h-4 text-slate-400" />
                    </button>
                  ))}
                {clientes.length === 0 && (
                  <div className="text-center py-6 text-xs text-slate-400">
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
            Pedidos
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

      {/* 3. Menus Dropdown: Status e Vendedores */}
      <div className="px-3 py-2 border-b border-slate-200 bg-white flex items-center gap-2 shrink-0">
        {/* Dropdown 1: Status */}
        <div className="relative flex-1 min-w-0">
          <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={statusSelecionados[0] || 'todos'}
            onChange={(e) => setStatusSelecionados([e.target.value])}
            aria-label="Filtrar por status"
            className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-7 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer truncate"
          >
            {abasStatus.map((st) => {
              const count = contagensPorStatus[st.id];
              return (
                <option key={st.id} value={st.id}>
                  {st.label} {count !== undefined ? `(${count})` : ''}
                </option>
              );
            })}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Dropdown 2: Vendedores */}
        <div className="relative flex-1 min-w-0">
          <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={vendedoresSelecionados[0] || 'todos'}
            onChange={(e) => setVendedoresSelecionados([e.target.value])}
            className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-7 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer truncate"
          >
            <option value="todos">Todos os Vendedores</option>
            <option value="catalogo_online">Catálogo Online</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome_completo}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
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

                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wide border shrink-0 ${
                          ped.status === 'concluido'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : ped.status === 'cancelado'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : ped.status === 'confirmado'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : ped.status === 'em_producao' || ped.status === 'em_expedicao'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {ROTULOS_STATUS_PEDIDO[ped.status] || ped.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500">
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
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded font-black text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono tracking-wider">
                                PIN: {pin}
                              </span>
                            );
                          })()}
                          <span className="text-slate-400 font-mono">#{ped.numero_pedido}</span>
                        </div>
                      </div>

                      {cli && (
                        <div className="flex items-center gap-1 pt-0.5 text-[10px] font-bold text-slate-600 uppercase">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{cli.nome}</span>
                        </div>
                      )}

                      {(() => {
                        const infoVenc = obterInfoVencimentoFiado(ped);
                        const temFiadoEmAberto = (ped.pagamentos || []).some((pag: any) => pag.eh_pagamento_fiado || pag.forma_pagamento?.tipo === 'fiado') && !ped.fiado_quitado;
                        const estaVencido = ped.status === 'vencido' || (temFiadoEmAberto && ped.status !== 'concluido' && ped.status !== 'cancelado' && infoVenc.estaVencido);
                        if (!estaVencido) return null;
                        return (
                          <div className="flex items-center justify-between pt-1 border-t border-rose-100 text-[10px]">
                            <span className="inline-flex items-center gap-1 font-bold text-rose-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                              Vencido
                            </span>
                            <span className="font-semibold text-rose-500">
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
                {['Dinheiro', 'Cartão de Débito', 'Cartão de Crédito', 'Cheque', 'Voucher', 'Outros', 'Saldo Cliente', 'Venda Fiado', 'Pix'].map((mp) => {
                  const marcado = meiosPagamentoFiltro.includes(mp);
                  return (
                    <label
                      key={mp}
                      className={`flex items-center gap-2.5 p-2 rounded-xl border transition cursor-pointer select-none ${
                        marcado
                          ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 font-bold'
                          : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100/60'
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
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'border-slate-300 bg-white'
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
              {abasStatus.map((st) => {
                const count = contagensPorStatus[st.id] || 0;
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
                        ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 font-bold'
                        : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          selecionado
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'border-slate-300 bg-white'
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
              {(() => {
                const todosMarcado = vendedoresSelecionados.includes('todos');
                return (
                  <div
                    onClick={() => setVendedoresSelecionados(['todos'])}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer select-none ${
                      todosMarcado
                        ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 font-bold'
                        : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          todosMarcado
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'border-slate-300 bg-white'
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
                        ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 font-bold'
                        : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          onlineMarcado
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'border-slate-300 bg-white'
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
                        ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 font-bold'
                        : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          usrMarcado
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'border-slate-300 bg-white'
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
    </div>
  );
};
