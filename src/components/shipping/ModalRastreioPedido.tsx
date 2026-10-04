import React, { useState } from 'react';
import {
  X,
  Truck,
  Package,
  MapPin,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  MessageCircle,
  Clock,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Tag,
  Globe,
  Phone
} from 'lucide-react';
import { Pedido, Loja } from '../../types';
import { PedidoEntrega, Transportadora } from '../../types/shipping';
import { ShippingOrchestrator } from '../../services/shippingOrchestrator';
import { supabase } from '../../services/supabase';
import { detectarServicoPorCodigo } from '../../utils/correiosValidator';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { useTheme } from '../../contexts/ThemeContext';

async function consultarMelhorRastreioGraphQL(codigoRastreio: string) {
  try {
    const mrQuery = {
      query: `query {
        findByTrackingCode(tracker: { trackingCode: "${codigoRastreio.trim()}" }) {
          id
          lastStatus
          postedAt
          deliveredAt
          trackingEvents {
            createdAt
            status
            title
            description
            location {
              city
              state
            }
          }
        }
      }`
    };
    const res = await fetch('https://api.melhorrastreio.com.br/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'HUBI Sistema (suporte@hubi.app)'
      },
      body: JSON.stringify(mrQuery)
    });
    if (res.ok) {
      const data = await res.json();
      return data?.data?.findByTrackingCode || null;
    }
  } catch (err) {
    console.warn('[ModalRastreioPedido] Falha ao consultar Melhor Rastreio GraphQL:', err);
  }
  return null;
}

interface ModalRastreioPedidoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  entrega: PedidoEntrega | null;
  loja: Loja | null;
  onAtualizarStatus?: () => void;
  onImprimirEtiqueta?: () => void;
}

export const ModalRastreioPedido: React.FC<ModalRastreioPedidoProps> = ({
  isOpen,
  onClose,
  pedido,
  entrega,
  loja,
  onAtualizarStatus,
  onImprimirEtiqueta
}) => {
  const { mostrarSucesso, mostrarToast } = useFeedbackModal();
  const { tema } = useTheme();
  const isDark = tema === 'dark';
  const [copiado, setCopiado] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [mensagemFeedback, setMensagemFeedback] = useState<string | null>(null);
  const [transportadoraObj, setTransportadoraObj] = useState<Transportadora | null>(null);

  // Estados reativos locais atualizados na hora ao sincronizar
  const [codigoRastreioLocal, setCodigoRastreioLocal] = useState<string>('');
  const [linkRastreioLocal, setLinkRastreioLocal] = useState<string>('');
  const [statusEnvioLocal, setStatusEnvioLocal] = useState<string>('');
  const [dataPostagemLocal, setDataPostagemLocal] = useState<string | null>(null);
  const [dataEntregaLocal, setDataEntregaLocal] = useState<string | null>(null);
  const [eventosRastreioLocal, setEventosRastreioLocal] = useState<any[]>([]);

  const peResolvido: PedidoEntrega | null =
    entrega || (Array.isArray((pedido as any)?.pedido_entregas) ? (pedido as any)?.pedido_entregas[0] : (pedido as any)?.pedido_entregas) || pedido?.pedido_entrega || null;

  // Carrega dados da transportadora vinculada caso seja modalidade transportadora manual
  React.useEffect(() => {
    let ativo = true;
    async function carregarTransp() {
      if (!isOpen || !pedido) return;
      const peCurrent: PedidoEntrega | null =
        entrega || (Array.isArray((pedido as any)?.pedido_entregas) ? (pedido as any)?.pedido_entregas[0] : (pedido as any)?.pedido_entregas) || pedido?.pedido_entrega || null;
      const transpId = peCurrent?.transportadora_id;
      const lojaId = loja?.id || pedido?.loja_id;

      if (peCurrent?.transportadora) {
        setTransportadoraObj(peCurrent.transportadora);
        return;
      }
      if (transpId && lojaId) {
        try {
          const t = await ShippingOrchestrator.buscarTransportadora(transpId, lojaId);
          if (ativo && t) setTransportadoraObj(t);
        } catch (err) {
          console.warn('Erro ao buscar transportadora no modal de rastreio:', err);
        }
      } else {
        setTransportadoraObj(null);
      }
    }
    carregarTransp();
    return () => {
      ativo = false;
    };
  }, [isOpen, pedido?.id, peResolvido?.transportadora_id, peResolvido?.transportadora, loja?.id, pedido?.loja_id]);

  // Ref para garantir execução única de auto-sincronização por abertura de modal
  const sincronizadoRef = React.useRef<string | null>(null);

  const handleSincronizarRastreio = React.useCallback(async (silencioso = false) => {
    if (!pedido) return;
    try {
      if (!silencioso) setAtualizando(true);

      const codAlvo = (codigoRastreioLocal || peResolvido?.codigo_rastreio || pedido.codigo_rastreio || '').trim();
      const ordemIdMeta = (pedido.metadados as any)?.melhor_envio_order_id || (codAlvo.startsWith('ORD-') ? codAlvo : undefined);

      // 1. Invoca Edge Function para sincronizar status atualizado com o provedor / Melhor Envio / Correios
      let dadosSinc: any = null;
      try {
        const { data, error } = await supabase.functions.invoke('melhor-envio-despacho', {
          body: {
            pedidoId: pedido.id,
            loja_id: loja?.id || pedido.loja_id,
            acao: 'sincronizar_rastreio',
            codigo_rastreio: codAlvo || undefined,
            ordem_id: ordemIdMeta
          }
        });
        if (!error && data?.sucesso) {
          dadosSinc = data;
        }
      } catch (errEdge) {
        console.warn('Erro ao chamar edge function de rastreio:', errEdge);
      }

      // 2. Fallback / Enriquecimento direto via Melhor Rastreio GraphQL caso não tenha retornado eventos da edge
      const codParaConsulta = (dadosSinc?.codigo_rastreio || codAlvo || '').trim();
      const codValidoGraphQL = codParaConsulta && !codParaConsulta.startsWith('ORD-') && !codParaConsulta.includes('-');

      if (codValidoGraphQL && (!dadosSinc?.eventos_rastreio || dadosSinc.eventos_rastreio.length === 0)) {
        try {
          const parcel = await consultarMelhorRastreioGraphQL(codValidoGraphQL);
          if (parcel) {
            const rawEvents = Array.isArray(parcel.trackingEvents) ? parcel.trackingEvents : [];
            const evs = rawEvents.map((ev: any) => ({
              data: ev.createdAt,
              data_formatada: new Date(ev.createdAt).toLocaleString('pt-BR'),
              titulo: ev.title || ev.status,
              descricao: ev.description,
              local: ev.location ? `${ev.location.city || ''} - ${ev.location.state || ''}`.trim() : '',
              tipo: ev.status
            }));

            const stMapeado =
              parcel.deliveredAt || parcel.lastStatus === 'DELIVERED'
                ? 'entregue'
                : parcel.lastStatus === 'OUT_FOR_DELIVERY'
                ? 'saiu_para_entrega'
                : parcel.lastStatus === 'IN_TRANSIT'
                ? 'em_transito'
                : parcel.postedAt || evs.length > 0
                ? 'postado'
                : 'aguardando_postagem';

            dadosSinc = {
              sucesso: true,
              codigo_rastreio: codValidoGraphQL,
              link_rastreio: `https://melhorrastreio.com.br/app/${codValidoGraphQL}`,
              status_envio: stMapeado,
              data_postagem: parcel.postedAt || null,
              data_entrega: parcel.deliveredAt || null,
              eventos_rastreio: evs
            };
          }
        } catch (errDirect) {
          console.warn('Falha na consulta direta ao Melhor Rastreio:', errDirect);
        }
      }

      if (dadosSinc?.sucesso) {
        const codLimpo = String(dadosSinc.codigo_rastreio || '').trim();
        const codValido = codLimpo && !codLimpo.startsWith('ORD-') && !codLimpo.includes('-') ? codLimpo : '';
        if (codValido) {
          setCodigoRastreioLocal(codValido);
          setLinkRastreioLocal(`https://melhorrastreio.com.br/app/${codValido}`);
        } else if (dadosSinc.link_rastreio) {
          setLinkRastreioLocal(dadosSinc.link_rastreio);
        }

        const statusMapeadoFinal = dadosSinc.status_envio || 'aguardando_postagem';
        setStatusEnvioLocal(statusMapeadoFinal);
        setDataPostagemLocal(dadosSinc.data_postagem || null);
        setDataEntregaLocal(dadosSinc.data_entrega || null);
        const evs = Array.isArray(dadosSinc.eventos_rastreio) ? dadosSinc.eventos_rastreio : [];
        setEventosRastreioLocal(evs);

        if (!silencioso) {
          if (evs.length === 0 && statusMapeadoFinal !== 'entregue') {
            mostrarToast('Aguardando primeira postagem ou atualização na agência.', 'info');
          } else {
            const statusLabel =
              statusMapeadoFinal === 'em_transito'
                ? 'Em Trânsito'
                : statusMapeadoFinal === 'saiu_para_entrega'
                ? 'Saiu para Entrega'
                : statusMapeadoFinal === 'entregue'
                ? 'Entregue'
                : statusMapeadoFinal === 'postado'
                ? 'Postado'
                : 'Atualizado';
            mostrarSucesso(`Status sincronizado: ${statusLabel}!`);
          }
        }
        if (onAtualizarStatus) onAtualizarStatus();
      } else if (!silencioso) {
        mostrarToast('Aguardando postagem ou primeira atualização da transportadora.', 'info');
      }
    } catch {
      if (!silencioso) {
        setMensagemFeedback('Não foi possível sincronizar no momento. Tente novamente mais tarde.');
      }
    } finally {
      if (!silencioso) {
        setAtualizando(false);
        setTimeout(() => setMensagemFeedback(null), 4000);
      }
    }
  }, [pedido?.id, pedido?.loja_id, pedido?.codigo_rastreio, loja?.id, codigoRastreioLocal, peResolvido?.codigo_rastreio, onAtualizarStatus, mostrarSucesso, mostrarToast]);

  // Sincroniza estados reativos locais apenas quando os identificadores das props mudarem
  React.useEffect(() => {
    if (!pedido) return;
    const peCurrent: PedidoEntrega | null =
      entrega || (pedido as any)?.pedido_entregas?.[0] || pedido?.pedido_entrega || null;

    setCodigoRastreioLocal((peCurrent?.codigo_rastreio || pedido?.codigo_rastreio || '').trim());
    setLinkRastreioLocal((peCurrent?.link_rastreio || pedido?.link_rastreio || '').trim());
    const isEntregue = peCurrent?.status_envio === 'entregue' || pedido?.status === 'entregue';
    setStatusEnvioLocal(isEntregue ? 'entregue' : (peCurrent?.status_envio || (peCurrent?.despachado_em || pedido?.despachado_em ? 'despachado' : 'pendente')));
    setDataPostagemLocal(peCurrent?.despachado_em || pedido?.despachado_em || null);

    const meta = (pedido?.metadados as any) || {};
    const evs = meta.eventos_rastreio || (peCurrent as any)?.eventos_rastreio || [];
    setEventosRastreioLocal(Array.isArray(evs) ? evs : []);
    setDataEntregaLocal(meta.data_entrega || meta.melhor_envio_delivered_at || (peCurrent as any)?.entregue_em || null);
  }, [pedido?.id, (pedido?.metadados as any)?.data_entrega, entrega?.id, isOpen]);

  // Sincroniza automaticamente ao abrir o modal
  React.useEffect(() => {
    if (!isOpen || !pedido) {
      sincronizadoRef.current = null;
      return;
    }

    // Se já sincronizou nesta sessão de abertura para este pedido, não repete
    if (sincronizadoRef.current === pedido.id) return;

    const peCurrent: PedidoEntrega | null =
      entrega || (Array.isArray((pedido as any)?.pedido_entregas) ? (pedido as any)?.pedido_entregas[0] : (pedido as any)?.pedido_entregas) || pedido?.pedido_entrega || null;
    const prov = peCurrent?.provedor || (pedido?.metadados as any)?.provedor_frete;
    const cod = (peCurrent?.codigo_rastreio || pedido?.codigo_rastreio || '').trim();
    const st = peCurrent?.status_envio;

    const podeSincronizar =
      (prov === 'melhor_envio' ||
       prov === 'jadlog' ||
       prov === 'correios' ||
       Boolean((pedido.metadados as any)?.melhor_envio_order_id) ||
       Boolean(peCurrent?.link_etiqueta || (pedido as any)?.link_etiqueta) ||
       Boolean(cod)) &&
      st !== 'entregue' &&
      st !== 'cancelado';

    if (podeSincronizar) {
      sincronizadoRef.current = pedido.id;
      handleSincronizarRastreio(false);
    }
  }, [isOpen, pedido?.id, handleSincronizarRastreio]);

  // Early return SÓ APÓS TODOS OS HOOKS TEREM SIDO DECLARADOS!
  if (!isOpen || !pedido) return null;

  const pe: PedidoEntrega | null = peResolvido;

  const codigoRastreio = (codigoRastreioLocal || pe?.codigo_rastreio || pedido.codigo_rastreio || '').trim();
  const linkRastreio = (linkRastreioLocal || pe?.link_rastreio || pedido.link_rastreio || '').trim();
  const linkEtiqueta = (pe?.link_etiqueta || (pedido as any).link_etiqueta || (pedido as any).metadados?.link_etiqueta || '').trim();

  const servicoDetectado = detectarServicoPorCodigo(codigoRastreio);
  const servicoCorreios =
    (pedido as any)?.servico_correios ||
    pe?.servico_correios ||
    (servicoDetectado && servicoDetectado !== 'OUTRO' ? servicoDetectado : null);

  const transpRaw = (pe?.transportadora_nome || pe?.nome_transportadora || (pedido as any)?.nome_transportadora || '').trim();

  const ehCorreios =
    pe?.tipo_operacao === 'correios' ||
    (pedido as any)?.tipo_operacao === 'correios' ||
    (pe?.provedor as any) === 'correios' ||
    transpRaw.toLowerCase().includes('correios') ||
    Boolean(servicoCorreios) ||
    (servicoDetectado !== null && servicoDetectado !== 'OUTRO');

  const provedorFinal = pe?.provedor || (pedido?.metadados as any)?.provedor_frete;
  const ehMelhorEnvio = provedorFinal === 'melhor_envio';
  const ehUber = provedorFinal === 'uber' || pe?.tipo_operacao === 'uber' || (pedido as any)?.tipo_operacao === 'uber';
  const ehAppCorrida = pe?.tipo_operacao === 'app_entrega' || Boolean(pe?.app_entrega_id);
  const ehTransportadoraManual = (pe?.tipo_operacao === 'transportadora' || Boolean(pe?.transportadora_id)) && !ehMelhorEnvio;

  const nomeTransportadoraExibicao = transportadoraObj?.nome || pe?.nome_transportadora || transpRaw || 'Transportadora';

  const transportadora = ehCorreios
    ? (servicoCorreios ? `Correios (${servicoCorreios})` : 'Correios')
    : ehUber
    ? 'Uber Direct'
    : ehAppCorrida
    ? (pe?.nome_app || 'App de Corrida')
    : ehTransportadoraManual
    ? nomeTransportadoraExibicao
    : (transpRaw || 'Melhor Envio');

  // Montagem da URL de rastreio para Transportadora manual (com interpolação de {{codigo}})
  let urlRastreioTransportadora: string | null = null;
  if (ehTransportadoraManual && transportadoraObj) {
    if (transportadoraObj.url_rastreio && codigoRastreio) {
      if (transportadoraObj.url_rastreio.includes('{{codigo}}')) {
        urlRastreioTransportadora = transportadoraObj.url_rastreio.replace(/\{\{codigo\}\}/g, encodeURIComponent(codigoRastreio));
      } else {
        urlRastreioTransportadora = `${transportadoraObj.url_rastreio}${encodeURIComponent(codigoRastreio)}`;
      }
    } else if (transportadoraObj.site) {
      urlRastreioTransportadora = transportadoraObj.site;
    }
  }

  // Link WhatsApp de atendimento da Transportadora (se cadastrado)
  const whatsTranspLimpo = (transportadoraObj?.whatsapp || '').replace(/\D/g, '');
  const linkWhatsTransp = whatsTranspLimpo
    ? `https://api.whatsapp.com/send?phone=55${whatsTranspLimpo}&text=${encodeURIComponent(`Olá! Gostaria de informações sobre o envio com código ${codigoRastreio || ''}.`)}`
    : null;

  const statusEnvio = statusEnvioLocal || pe?.status_envio || (pe?.despachado_em || pedido.despachado_em ? 'despachado' : 'pendente');
  const despachadoEm = dataPostagemLocal || pe?.despachado_em || pedido.despachado_em || pedido.criado_em;

  const handleCopiarCodigo = () => {
    if (!codigoRastreio) return;
    navigator.clipboard.writeText(codigoRastreio);
    setCopiado(true);
    mostrarSucesso('Código copiado para a área de transferência!');
    setTimeout(() => setCopiado(false), 2500);
  };

  const handleCompartilharWhatsApp = () => {
    const tel = (pedido.cliente?.whatsapp || pedido.cliente?.telefone || pedido.cliente_telefone_avulso || '').replace(/\D/g, '');
    const nomeCli = pedido.cliente?.nome || pedido.cliente_nome_avulso || 'Cliente';
    const numPed = pedido.numero_pedido || pedido.id.slice(0, 5);

    let linkAcompanhamento = '';
    if (ehCorreios && codigoRastreio) {
      linkAcompanhamento = `https://melhorrastreio.com.br/app/${codigoRastreio}`;
    } else if (ehMelhorEnvio && codigoRastreio) {
      linkAcompanhamento = `https://melhorrastreio.com.br/app/${codigoRastreio}`;
    } else if (urlRastreioTransportadora) {
      linkAcompanhamento = urlRastreioTransportadora;
    } else if (linkRastreio && !linkRastreio.includes('imprimir')) {
      linkAcompanhamento = linkRastreio;
    }

    let texto = `Olá, *${nomeCli}*! 👋\n\n`;
    texto += `Seu pedido *#${numPed}* foi despachado via *${transportadora}*!\n\n`;
    if (codigoRastreio) {
      texto += `📦 *Código de Rastreio:* ${codigoRastreio}\n`;
    }
    if (linkAcompanhamento) {
      texto += `🔗 *Acompanhe a entrega:* ${linkAcompanhamento}\n\n`;
    }
    texto += `Agradecemos pela preferência! Qualquer dúvida, estamos à disposição. 😊`;

    const url = tel
      ? `https://api.whatsapp.com/send?phone=55${tel}&text=${encodeURIComponent(texto)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;

    window.open(url, '_blank');
  };

  const handleAbrirPortalCorreios = () => {
    if (codigoRastreio) {
      try {
        navigator.clipboard.writeText(codigoRastreio);
        mostrarToast('Código copiado! Cole no campo de rastreio dos Correios.', 'info');
      } catch {
        // Fallback silencioso
      }
    }
    window.open('https://rastreamento.correios.com.br/app/index.php', '_blank');
  };

  // Extração das datas dos eventos de rastreamento reais
  const evEtiqueta = eventosRastreioLocal.find(e => e.tipo === 'etiqueta_emitida' || (e.titulo || '').toLowerCase().includes('etiqueta'));
  const evPostado = eventosRastreioLocal.find(e => e.tipo === 'postado' || (e.titulo || '').toLowerCase().includes('postado') || (e.tipo || '').toLowerCase().includes('posted'));
  const evTransito = eventosRastreioLocal.find(e => e.tipo === 'em_transito' || (e.titulo || '').toLowerCase().includes('transferência') || (e.titulo || '').toLowerCase().includes('trânsito') || (e.tipo || '').toLowerCase().includes('transit'));
  const evSaiu = eventosRastreioLocal.find(e => e.tipo === 'saiu_para_entrega' || (e.titulo || '').toLowerCase().includes('saiu') || (e.tipo || '').toLowerCase().includes('out_for_delivery'));
  const evEntregue = eventosRastreioLocal.find(e => e.tipo === 'entregue' || (e.titulo || '').toLowerCase().includes('entregue') || (e.tipo || '').toLowerCase().includes('delivered'));

  const temEventosReais = eventosRastreioLocal.length > 0;
  const ehEntregue = statusEnvio === 'entregue' || Boolean(evEntregue);
  const ehSaiu = statusEnvio === 'saiu_para_entrega' || Boolean(evSaiu) || ehEntregue;
  const ehTransito = statusEnvio === 'em_transito' || Boolean(evTransito) || ehSaiu;
  const ehPostado = Boolean(evPostado) || (Boolean(dataPostagemLocal) && temEventosReais) || ehTransito;

  // Definição das etapas da linha do tempo
  const etapas = (ehCorreios && !temEventosReais) ? [
    {
      id: 'criado',
      titulo: 'Pedido Realizado & Confirmado',
      descricao: 'Venda aprovada e integrada na loja',
      data: pedido.data_venda || pedido.criado_em,
      concluido: true,
      ativo: false
    },
    {
      id: 'despacho_hubi',
      titulo: 'Despacho Registrado no Sistema',
      descricao: `Envio registrado no HUBI via ${transportadora}`,
      data: despachadoEm,
      concluido: true,
      ativo: false
    },
    {
      id: 'aguardando_correios',
      titulo: 'Aguardando Postagem nos Correios',
      descricao: 'Aguardando postagem ou primeira atualização dos Correios.',
      data: null,
      concluido: false,
      ativo: true
    },
    {
      id: 'transito',
      titulo: 'Em Trânsito',
      descricao: 'Transferência entre centros operacionais dos Correios',
      data: null,
      concluido: false,
      ativo: false
    },
    {
      id: 'entregue',
      titulo: 'Objeto Entregue',
      descricao: 'Entrega finalizada com sucesso ao destinatário',
      data: null,
      concluido: false,
      ativo: false
    }
  ] : [
    {
      id: 'criado',
      titulo: 'Pedido Realizado & Confirmado',
      descricao: 'Venda aprovada e integrada na loja',
      data: pedido.data_venda || pedido.criado_em,
      concluido: true,
      ativo: false
    },
    {
      id: 'etiqueta',
      titulo: 'Etiqueta Emitida & Despachado',
      descricao: `Envio gerado via ${transportadora}`,
      data: evEtiqueta?.data || despachadoEm,
      concluido: Boolean(despachadoEm || statusEnvio !== 'pendente' || evEtiqueta),
      ativo: statusEnvio === 'pendente' && !despachadoEm
    },
    {
      id: 'postado',
      titulo: 'Objeto Postado na Agência',
      descricao: ehCorreios
        ? (evPostado?.descricao || (evPostado?.local ? `Postado na agência (${evPostado.local})` : 'Objeto recebido e postado na agência'))
        : 'Pacote conferido e recebido pela transportadora',
      data: evPostado?.data || (ehPostado ? dataPostagemLocal : null),
      concluido: ehPostado,
      ativo: statusEnvio === 'postado' || (statusEnvio === 'despachado' && !ehTransito)
    },
    {
      id: 'transito',
      titulo: 'Em Trânsito',
      descricao: ehCorreios
        ? (evTransito?.descricao || 'Transferência entre centros operacionais dos Correios')
        : 'Transferência entre centros operacionais e de distribuição',
      data: evTransito?.data || null,
      concluido: ehTransito,
      ativo: statusEnvio === 'em_transito'
    },
    {
      id: 'saiu_entrega',
      titulo: 'Saiu para Entrega',
      descricao: ehCorreios
        ? (evSaiu?.descricao || 'Carteiro dos Correios a caminho do endereço de entrega')
        : 'Motorista ou carteiro a caminho do endereço de entrega',
      data: evSaiu?.data || null,
      concluido: ehSaiu,
      ativo: statusEnvio === 'saiu_para_entrega'
    },
    {
      id: 'entregue',
      titulo: 'Objeto Entregue',
      descricao: ehCorreios && evEntregue?.local
        ? `Objeto entregue ao destinatário em ${evEntregue.local}`
        : (evEntregue?.descricao || 'Entrega finalizada com sucesso ao destinatário'),
      data: ehEntregue
        ? (evEntregue?.data || dataEntregaLocal || (pe as any)?.entregue_em || (pedido.metadados as any)?.data_entrega || pe?.atualizado_em || null)
        : null,
      concluido: ehEntregue,
      ativo: ehEntregue
    }
  ];

  const linkCorreiosOficial = codigoRastreio
    ? `https://rastreamento.correios.com.br/app/index.php?objeto=${codigoRastreio}`
    : null;

  const urlRastreioOficial = ehCorreios
    ? linkCorreiosOficial
    : (codigoRastreio
        ? `https://melhorrastreio.com.br/app/${codigoRastreio}`
        : (linkRastreio && !linkRastreio.includes('imprimir') ? linkRastreio : null));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`w-full max-w-xl rounded-3xl p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto border ${
        isDark ? 'bg-slate-900 border-slate-700/80 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
      }`}>
        {/* Cabeçalho */}
        <div className={`flex items-center justify-between border-b pb-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
              isDark ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}>
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Rastreamento do Pedido #{pedido.numero_pedido || pedido.id.slice(0, 5)}
                </h3>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border uppercase ${
                  isDark ? 'bg-black border-slate-800 text-emerald-400' : 'bg-slate-100 border-slate-200 text-emerald-700'
                }`}>
                  {transportadora}
                </span>
              </div>
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                Acompanhe as etapas de envio e movimentação da carga
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-xl transition cursor-pointer ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Card do Código de Rastreio */}
        <div className={`border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="space-y-1">
            <span className={`text-[11px] font-bold uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Código de Rastreamento:
            </span>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-base font-black px-3 py-1 rounded-xl border ${
                isDark ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-emerald-700 bg-emerald-50 border-emerald-200'
              }`}>
                {codigoRastreio || 'Pendente de sincronização'}
              </span>
              {codigoRastreio && (
                <button
                  type="button"
                  onClick={handleCopiarCodigo}
                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                    isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                  title="Copiar código de rastreio"
                >
                  {copiado ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSincronizarRastreio(false)}
              disabled={atualizando}
              className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-xs'
              }`}
              title="Consultar atualizações na transportadora"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${atualizando ? 'animate-spin text-emerald-500' : isDark ? 'text-slate-400' : 'text-slate-500'}`} />
              <span>{atualizando ? 'Atualizando...' : 'Atualizar'}</span>
            </button>

            <button
              type="button"
              onClick={handleCompartilharWhatsApp}
              className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                isDark ? 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
              }`}
              title="Enviar rastreio no WhatsApp do cliente"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>
          </div>
        </div>

        {mensagemFeedback && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{mensagemFeedback}</span>
          </div>
        )}

        {/* Alerta Realista para Correios sem movimentação registrada */}
        {ehCorreios && !temEventosReais && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold block text-amber-200">Aguardando Atualização dos Correios</span>
              <p className="text-[11px] text-amber-300/80 leading-relaxed">
                Aguardando postagem ou primeira atualização dos Correios.
              </p>
            </div>
          </div>
        )}

        {/* Linha do Tempo (Stepper) */}
        <div className="space-y-4 pt-1">
          <h4 className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            <Clock className={`w-4 h-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
            <span>Linha do Tempo da Entrega</span>
          </h4>

          <div className={`relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 ${
            isDark ? 'before:bg-slate-800' : 'before:bg-slate-200'
          }`}>
            {etapas.map((etapa) => {
              const concluido = etapa.concluido;
              const ativo = etapa.ativo;

              return (
                <div key={etapa.id} className="relative flex items-start gap-3.5 group">
                  {/* Ponto / Marcador */}
                  <div
                    className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                      concluido
                        ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20 shadow-md shadow-emerald-500/30'
                        : ativo
                        ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-500/30 shadow-md shadow-amber-500/20'
                        : isDark
                        ? 'bg-slate-800 text-slate-600 border border-slate-700'
                        : 'bg-slate-200 text-slate-400 border border-slate-300'
                    }`}
                  >
                    {concluido ? (
                      <Check className="w-3 h-3 stroke-[3]" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-current" />
                    )}
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold ${
                          concluido
                            ? (isDark ? 'text-slate-100' : 'text-slate-900')
                            : ativo
                            ? (isDark ? 'text-amber-300' : 'text-amber-600')
                            : (isDark ? 'text-slate-500' : 'text-slate-400')
                        }`}
                      >
                        {etapa.titulo}
                      </span>
                      {etapa.data && (
                        <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {new Date(etapa.data).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>
                    <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      {etapa.descricao}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Histórico Detalhado de Movimentações */}
        {eventosRastreioLocal.length > 0 && (
          <div className={`border rounded-2xl p-4 space-y-3 ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`flex items-center justify-between border-b pb-2.5 ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
              <span className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <Package className={`w-4 h-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                <span>Histórico de Movimentações ({eventosRastreioLocal.length})</span>
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isDark ? 'text-slate-300 bg-slate-900 border-slate-800' : 'text-slate-600 bg-white border-slate-200'
              }`}>
                {ehCorreios ? 'Correios Oficial' : 'Transportadora'}
              </span>
            </div>

            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {[...eventosRastreioLocal].reverse().map((ev, idx) => {
                const ehEntregaFinal = ev.tipo === 'entregue' || (ev.titulo || '').toLowerCase().includes('entregue');
                const ehSaiu = ev.tipo === 'saiu_para_entrega' || (ev.titulo || '').toLowerCase().includes('saiu');
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border text-xs space-y-1 transition ${
                      ehEntregaFinal
                        ? isDark
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : ehSaiu
                        ? isDark
                          ? 'bg-sky-500/10 border-sky-500/30 text-sky-200'
                          : 'bg-sky-50 border-sky-200 text-sky-900'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 text-slate-200'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold flex items-center gap-1.5">
                        {ehEntregaFinal ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        ) : ehSaiu ? (
                          <Truck className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                        ) : (
                          <Package className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                        )}
                        <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{ev.titulo || ev.tipo}</span>
                      </span>
                      <span className={`text-[11px] shrink-0 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {ev.data_formatada || (ev.data ? new Date(ev.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')}
                      </span>
                    </div>
                    {ev.local && (
                      <p className={`text-[11px] flex items-center gap-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>{ev.local}</span>
                      </p>
                    )}
                    {ev.descricao && ev.descricao !== ev.titulo && (
                      <p className={`text-[11px] leading-relaxed pl-4 ${isDark ? 'text-slate-300/90' : 'text-slate-600'}`}>
                        {ev.descricao}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Endereço de Destino */}
        {pedido.endereco_entrega && (
          <div className={`border rounded-2xl p-3.5 space-y-1 ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
              isDark ? 'text-emerald-400' : 'text-emerald-700'
            }`}>
              <MapPin className={`w-3 h-3 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
              Endereço de Entrega do Destinatário
            </span>
            <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {pedido.endereco_entrega}
            </p>
          </div>
        )}

        {/* Barra de Ações do Rodapé Unificada */}
        <div className={`pt-4 flex flex-wrap items-center justify-end gap-3 border-t ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          {/* Botão Primário: Imprimir Etiqueta */}
          <button
            type="button"
            onClick={() => {
              if (onImprimirEtiqueta) {
                onImprimirEtiqueta();
              } else if (linkEtiqueta) {
                window.open(linkEtiqueta, '_blank', 'noopener,noreferrer');
              }
            }}
            className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer active:scale-95"
            title="Imprimir Etiqueta de Envio"
          >
            <Tag className="w-3.5 h-3.5 text-white" />
            <span>Imprimir Etiqueta</span>
          </button>

          {/* Rastreio Transportadora Manual (se houver url específica) */}
          {ehTransportadoraManual && urlRastreioTransportadora && (
            <a
              href={urlRastreioTransportadora}
              target="_blank"
              rel="noopener noreferrer"
              className={`py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 border cursor-pointer active:scale-95 ${
                isDark ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-xs'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>
                {transportadoraObj?.url_rastreio && codigoRastreio
                  ? `Rastrear na ${nomeTransportadoraExibicao}`
                  : `Acessar ${nomeTransportadoraExibicao}`}
              </span>
            </a>
          )}

          {/* UBER DIRECT: Link nativo da corrida ao vivo mantido em nova aba */}
          {ehUber && linkRastreio && (
            <a
              href={linkRastreio}
              target="_blank"
              rel="noopener noreferrer"
              className={`py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 border cursor-pointer active:scale-95 ${
                isDark ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Acompanhar Uber</span>
            </a>
          )}

          {/* APP DE CORRIDA: Link da corrida se houver */}
          {ehAppCorrida && linkRastreio && (
            <a
              href={linkRastreio}
              target="_blank"
              rel="noopener noreferrer"
              className={`py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 border cursor-pointer active:scale-95 ${
                isDark ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Acompanhar Corrida</span>
            </a>
          )}

          {/* Botão Fechar em estilo outline verde */}
          <button
            type="button"
            onClick={onClose}
            className={`py-2.5 px-5 rounded-xl border font-semibold text-xs transition cursor-pointer ${
              isDark ? 'border-2 border-emerald-600 text-emerald-400 hover:bg-emerald-950/40' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
