import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Sparkles,
  CheckCircle2,
  Clock,
  Bot,
  Camera,
  MapPin,
  Tags,
  CreditCard,
  ListChecks,
  FolderTree,
  Target,
  Store,
  Globe,
  Truck,
  Car,
  Package,
  MessageCircle,
  ShoppingBag,
  CalendarClock,
  Scale,
  BookOpen,
  HelpCircle,
  ArrowRight,
  Loader2,
  AlertCircle,
  Check,
  Ruler,
  Sliders,
  Info,
  Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { supabase } from '../../lib/supabase';
import { Categoria } from '../../types';
import { salvarGeminiApiKey } from '../../services/geminiService';
import { dashboardService } from '../../services/dashboardService';
import { SEGMENTOS_NEGOCIO } from '../ConfiguracoesLoja';
import {
  EtapaOnboardingId,
  StatusOnboardingCompleto,
  TiposVendaLoja,
  avaliarProgressoCompletoOnboarding,
  salvarRespostasOnboarding,
  atualizarConfiguracaoDiretaLoja,
  salvarPerfilNegocioIALoja,
  notificarConfiguracaoSalvaParaOnboarding,
  registrarRetornoOnboarding,
} from '../../services/onboardingSetupService';
import { ModalComoObterGeminiApiKey } from '../configuracoes/ModalComoObterGeminiApiKey';
import { ModalOnboardingSerpApi } from '../ModalOnboardingSerpApi';
import { ModalGerenciarCategorias } from '../ModalGerenciarCategorias';
import { ModalTutorialMelhorEnvio } from '../shipping/ModalTutorialMelhorEnvio';
import { ModalTutorialUberDirect } from '../shipping/ModalTutorialUberDirect';
import { ModalPorQueUsarModulo, AcaoModalPorQueUsar } from './ModalPorQueUsarModulo';

export interface ModalQuestionarioOnboardingProps {
  isOpen: boolean;
  onClose: () => void;
  etapaDestaque?: EtapaOnboardingId | null;
  onAdiarSessao?: () => void;
  onConcluirQuestionario?: () => void;
}

interface ItemStatusOperacionalConfig {
  campo:
    | 'status_em_separacao'
    | 'status_em_expedicao'
    | 'status_aguardando_envio'
    | 'status_enviado'
    | 'status_entregue'
    | 'status_pronto_para_retirar';
  titulo: string;
  descricao: string;
  dotClass: string;
}

const ITENS_STATUS_OPCIONAIS: ItemStatusOperacionalConfig[] = [
  {
    campo: 'status_em_separacao',
    titulo: 'Em separação',
    descricao: 'Separação de itens no estoque',
    dotClass: 'bg-rose-500',
  },
  {
    campo: 'status_em_expedicao',
    titulo: 'Em expedição',
    descricao: 'Conferência interna e embalagem',
    dotClass: 'bg-amber-500',
  },
  {
    campo: 'status_aguardando_envio',
    titulo: 'Aguardando envio',
    descricao: 'Etapa intermediária de coleta/espera',
    dotClass: 'bg-yellow-400',
  },
  {
    campo: 'status_enviado',
    titulo: 'Enviado',
    descricao: 'Mercadoria despachada em trânsito',
    dotClass: 'bg-blue-500',
  },
  {
    campo: 'status_entregue',
    titulo: 'Entregue',
    descricao: 'Mercadoria entregue ao cliente final',
    dotClass: 'bg-teal-500',
  },
  {
    campo: 'status_pronto_para_retirar',
    titulo: 'Pronto para retirar',
    descricao: 'Disponível no balcão para retirada',
    dotClass: 'bg-sky-400',
  },
];

interface ModuloOpcionalCardDef {
  id: EtapaOnboardingId;
  titulo: string;
  descricaoComercial: string;
  rotaDestino: string;
  icone: React.ComponentType<{ className?: string }>;
  tutorialTipo?: 'melhor_envio' | 'uber_direct';
}

const MODULOS_OPCIONAIS_DEFINICAO: ModuloOpcionalCardDef[] = [
  {
    id: 'catalogo_online',
    titulo: 'Vitrine Virtual (Catálogo Online PWA)',
    descricaoComercial:
      'Receba pedidos 24h por dia com link próprio e vitrine responsiva sem precisar atender um por um no chat.',
    rotaDestino: '/catalog-config',
    icone: Globe,
  },
  {
    id: 'gateway_pagamento',
    titulo: 'Gateway de Pagamentos Online (Mercado Pago, Asaas e outros)',
    descricaoComercial:
      'Receba via Pix dinâmico (com baixa automática instantânea) e Cartão de Crédito/Débito direto no catálogo.',
    rotaDestino: '/config?tab=pagamentos&campo=topo',
    icone: CreditCard,
  },
  {
    id: 'melhor_envio',
    titulo: 'Cotação Automática Nacional (Melhor Envio)',
    descricaoComercial:
      'Seu cliente calcula PAC, SEDEX e Jadlog direto no catálogo e fecha o pedido sozinho, sem intervenção humana para cotar frete, além de emitir etiquetas em 1 clique.',
    rotaDestino: '/config/frete',
    icone: Package,
    tutorialTipo: 'melhor_envio',
  },
  {
    id: 'uber_direct',
    titulo: 'Entregas Expressas Locais (Uber Direct)',
    descricaoComercial:
      'Chame entregadores parceiros ponto a ponto automaticamente no fechamento do pedido com rastreio ao vivo.',
    rotaDestino: '/config/frete',
    icone: Truck,
    tutorialTipo: 'uber_direct',
  },
  {
    id: 'apps_corrida',
    titulo: 'Apps de Corrida Externos (99, Lalamove, etc.)',
    descricaoComercial:
      'Registre código da corrida e link de acompanhamento nos pedidos despachados para transparência com o cliente.',
    rotaDestino: '/config/frete',
    icone: Car,
  },
  {
    id: 'transportadoras_manuais',
    titulo: 'Transportadoras Manuais / Frota Própria',
    descricaoComercial:
      'Cadastre transportadoras próprias (ônibus, Braspress, motoboy) com link de rastreio e prazo personalizados.',
    rotaDestino: '/config/frete',
    icone: Store,
  },
  {
    id: 'whatsapp_auto',
    titulo: 'Notificações Ativas no WhatsApp (Meta Cloud API)',
    descricaoComercial:
      'Avise o cliente automaticamente por disparo ativo quando o pedido sair para entrega, ficar pronto para retirada ou lembrar do agendamento.',
    rotaDestino: '/config?tab=whatsapp-ia&campo=topo',
    icone: MessageCircle,
  },
  {
    id: 'whatsapp_ia_receptiva',
    titulo: 'Robô Atendente / Vendedora IA no WhatsApp (Meta Cloud API)',
    descricaoComercial:
      'Atendimento receptivo 24h com IA respondendo dúvidas, consultando estoque e fechando pedidos direto pelo WhatsApp oficial da loja.',
    rotaDestino: '/config?tab=whatsapp-ia&campo=topo',
    icone: Bot,
  },
  {
    id: 'mercado_livre',
    titulo: 'Integração com Mercado Livre',
    descricaoComercial:
      'Sincronize o estoque físico com seus anúncios em tempo real e imprima etiquetas direto pela Rubi.',
    rotaDestino: '/config?tab=parceiros&campo=topo',
    icone: ShoppingBag,
  },
  {
    id: 'agendamento_servicos',
    titulo: 'Agendamento de Serviços com Hora Marcada',
    descricaoComercial:
      'Agenda online 24h por profissional, sem conflito de horário e confirmação automática via link no WhatsApp.',
    rotaDestino: '/users',
    icone: CalendarClock,
  },
  {
    id: 'venda_por_peso',
    titulo: 'Venda por Peso / Balança',
    descricaoComercial:
      'O cliente pede no catálogo e o pagamento só é liberado após você pesar o item na balança e confirmar o valor real.',
    rotaDestino: '/catalog-config',
    icone: Scale,
  },
  {
    id: 'caderneta_fiado',
    titulo: 'Caderneta de Mercadinho / Fiado',
    descricaoComercial:
      'Conta corrente mensal com dia fixo de vencimento, histórico de lançamentos e limite de crédito por cliente.',
    rotaDestino: '/config?tab=pagamentos&campo=topo',
    icone: BookOpen,
  },
];

export const ModalQuestionarioOnboarding: React.FC<ModalQuestionarioOnboardingProps> = ({
  isOpen,
  onClose,
  etapaDestaque,
  onAdiarSessao,
  onConcluirQuestionario,
}) => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { loja, usuario, carregando: carregandoAuth, recarregarDadosLoja } = useAuth();
  const lojaRef = useRef(loja);
  lojaRef.current = loja;

  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvandoConclusao, setSalvandoConclusao] = useState<boolean>(false);
  const [salvandoChaveInline, setSalvandoChaveInline] = useState<string | null>(null);
  const [statusCompleto, setStatusCompleto] = useState<StatusOnboardingCompleto | null>(null);
  const [erroMensagem, setErroMensagem] = useState<string | null>(null);
  const [avisoSucesso, setAvisoSucesso] = useState<string | null>(null);
  const [destaqueTemporarioId, setDestaqueTemporarioId] = useState<EtapaOnboardingId | null>(null);

  // Estados inline para Identidade do Negócio (IAs) e Metas Rápidas (Cockpit F1)
  const [segmentoInline, setSegmentoInline] = useState<string>('geral');
  const [especialidadeInline, setEspecialidadeInline] = useState<string>('');
  const [metaFaturamentoInline, setMetaFaturamentoInline] = useState<string>('');
  const [metaPedidosInline, setMetaPedidosInline] = useState<string>('');
  const [metaLucroInline, setMetaLucroInline] = useState<string>('');

  // Sub-modais educativos / operacionais integrados
  const [modalGeminiAberto, setModalGeminiAberto] = useState<boolean>(false);
  const [modalSerperAberto, setModalSerperAberto] = useState<boolean>(false);
  const [modalCategoriasAberto, setModalCategoriasAberto] = useState<boolean>(false);
  const [categoriasLoja, setCategoriasLoja] = useState<Categoria[]>([]);
  const [carregandoCategorias, setCarregandoCategorias] = useState<boolean>(false);
  const [modalMelhorEnvioAberto, setModalMelhorEnvioAberto] = useState<boolean>(false);
  const [modalUberDirectAberto, setModalUberDirectAberto] = useState<boolean>(false);
  const [etapaPorQueUsarId, setEtapaPorQueUsarId] = useState<EtapaOnboardingId | null>(null);

  const cardRefs = useRef<Partial<Record<EtapaOnboardingId, HTMLDivElement | null>>>({});
  const requisicaoIdRef = useRef<number>(0);

  const algumSubModalAberto =
    modalGeminiAberto ||
    modalSerperAberto ||
    modalCategoriasAberto ||
    modalMelhorEnvioAberto ||
    modalUberDirectAberto ||
    etapaPorQueUsarId !== null;

  useRegisterOverlay(isOpen, onClose, 'modal-questionario-onboarding', 'modal');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !algumSubModalAberto) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, algumSubModalAberto]);

  const carregarProgresso = useCallback(async () => {
    if (!loja?.id) return;
    const reqId = ++requisicaoIdRef.current;
    try {
      setErroMensagem(null);
      const resultado = await avaliarProgressoCompletoOnboarding(loja.id, {
        sincronizarDetectados: true,
        lojaFallback: lojaRef.current,
      });
      if (reqId === requisicaoIdRef.current) {
        setStatusCompleto(resultado);
        setSegmentoInline(resultado.lojaSnapshot.segmento_negocio || 'geral');
        setEspecialidadeInline(resultado.lojaSnapshot.especialidade_negocio || '');
        setMetaFaturamentoInline(
          resultado.lojaSnapshot.meta_faturamento > 0
            ? String(resultado.lojaSnapshot.meta_faturamento)
            : ''
        );
        setMetaPedidosInline(
          resultado.lojaSnapshot.meta_pedidos > 0
            ? String(resultado.lojaSnapshot.meta_pedidos)
            : ''
        );
        setMetaLucroInline(
          resultado.lojaSnapshot.meta_lucro_liquido > 0
            ? String(resultado.lojaSnapshot.meta_lucro_liquido)
            : ''
        );
      }
    } catch (err) {
      if (reqId === requisicaoIdRef.current) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar o diagnóstico da implantação.';
        setErroMensagem(msg);
      }
    } finally {
      if (reqId === requisicaoIdRef.current) {
        setCarregando(false);
      }
    }
  }, [loja?.id]);

  useEffect(() => {
    if (!isOpen) return;
    if (carregandoAuth) {
      setCarregando(true);
      return;
    }
    if (!loja?.id) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    carregarProgresso();
    return () => {
      requisicaoIdRef.current++;
    };
  }, [isOpen, carregandoAuth, loja?.id, carregarProgresso]);

  useEffect(() => {
    if (!isOpen || !etapaDestaque || carregando) return;
    setDestaqueTemporarioId(etapaDestaque);

    const timerScroll = window.setTimeout(() => {
      const alvo = cardRefs.current[etapaDestaque];
      if (alvo) {
        alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);

    const timerLimpar = window.setTimeout(() => {
      setDestaqueTemporarioId(null);
    }, 3200);

    return () => {
      window.clearTimeout(timerScroll);
      window.clearTimeout(timerLimpar);
    };
  }, [isOpen, etapaDestaque, carregando]);

  if (!isOpen) return null;

  const exibirSucessoTemporario = (texto: string) => {
    setAvisoSucesso(texto);
    window.setTimeout(() => setAvisoSucesso(null), 3500);
  };

  const navegarParaConfigurarEtapa = (
    etapaId: EtapaOnboardingId,
    etapaTitulo: string,
    rotaDestino: string
  ) => {
    const queryIndex = rotaDestino.indexOf('?');
    const searchParamsDestino = new URLSearchParams(
      queryIndex >= 0 ? rotaDestino.slice(queryIndex + 1) : ''
    );
    const abaAlvo = searchParamsDestino.get('tab') || searchParamsDestino.get('aba') || undefined;
    const campoAlvo = searchParamsDestino.get('campo') || undefined;

    registrarRetornoOnboarding(etapaId, etapaTitulo);
    onClose();
    navigate(rotaDestino, {
      state: {
        abaAlvo,
        campoAlvo,
        focoTimestamp: Date.now(),
      },
    });
  };

  const handleToggleTipoVenda = async (campo: keyof TiposVendaLoja) => {
    if (!loja?.id || !statusCompleto) return;
    const atual = statusCompleto.lojaSnapshot.tipos_venda;
    const proximo: TiposVendaLoja = {
      ...atual,
      [campo]: !atual[campo],
    };

    if (!proximo.varejo && !proximo.atacado && !proximo.distribuidor) {
      setErroMensagem('Mantenha pelo menos uma tabela de venda ativa (Varejo, Atacado ou Distribuidor).');
      return;
    }

    setErroMensagem(null);
    setSalvandoChaveInline(`tipo_${campo}`);
    setStatusCompleto((prev) =>
      prev
        ? {
            ...prev,
            lojaSnapshot: { ...prev.lojaSnapshot, tipos_venda: proximo },
          }
        : prev
    );

    try {
      await atualizarConfiguracaoDiretaLoja(loja.id, { tipos_venda: proximo });
      await recarregarDadosLoja();
      await carregarProgresso();
    } catch (err) {
      setErroMensagem(
        err instanceof Error ? err.message : 'Erro ao atualizar tabelas de venda.'
      );
      await carregarProgresso();
    } finally {
      setSalvandoChaveInline(null);
    }
  };

  const handleToggleStatusOperacional = async (
    campo: ItemStatusOperacionalConfig['campo']
  ) => {
    if (!loja?.id || !statusCompleto) return;
    const valorAtual = statusCompleto.lojaSnapshot[campo];
    const novoValor = !valorAtual;

    setErroMensagem(null);
    setSalvandoChaveInline(campo);
    setStatusCompleto((prev) =>
      prev
        ? {
            ...prev,
            lojaSnapshot: { ...prev.lojaSnapshot, [campo]: novoValor },
          }
        : prev
    );

    try {
      await atualizarConfiguracaoDiretaLoja(loja.id, { [campo]: novoValor });
      await recarregarDadosLoja();
      await carregarProgresso();
    } catch (err) {
      setErroMensagem(
        err instanceof Error ? err.message : 'Erro ao atualizar status operacional.'
      );
      await carregarProgresso();
    } finally {
      setSalvandoChaveInline(null);
    }
  };

  const handleManterApenasStatusPadrao = async () => {
    if (!loja?.id || !statusCompleto) return;
    setErroMensagem(null);
    setSalvandoChaveInline('status_padrao');
    setStatusCompleto((prev) =>
      prev
        ? {
            ...prev,
            lojaSnapshot: {
              ...prev.lojaSnapshot,
              status_em_separacao: false,
              status_em_expedicao: false,
              status_aguardando_envio: false,
              status_enviado: false,
              status_entregue: false,
              status_pronto_para_retirar: false,
            },
          }
        : prev
    );

    try {
      await atualizarConfiguracaoDiretaLoja(loja.id, {
        status_em_separacao: false,
        status_em_expedicao: false,
        status_aguardando_envio: false,
        status_enviado: false,
        status_entregue: false,
        status_pronto_para_retirar: false,
      });
      await recarregarDadosLoja();
      await carregarProgresso();
      exibirSucessoTemporario('Fluxo configurado para usar apenas os status padrão do sistema.');
    } catch (err) {
      setErroMensagem(
        err instanceof Error ? err.message : 'Erro ao restaurar os status padrão do sistema.'
      );
      await carregarProgresso();
    } finally {
      setSalvandoChaveInline(null);
    }
  };

  const handleAbrirModalCategorias = async () => {
    if (!loja?.id) return;
    try {
      setCarregandoCategorias(true);
      const { data } = await supabase
        .from('categorias')
        .select('*')
        .eq('loja_id', loja.id)
        .order('ordem_exibicao');
      setCategoriasLoja((data as Categoria[] | null) || []);
      setModalCategoriasAberto(true);
    } catch {
      setErroMensagem('Não foi possível abrir a gestão de categorias no momento.');
    } finally {
      setCarregandoCategorias(false);
    }
  };

  const handleConferirUnidades = async () => {
    if (!loja?.id) return;
    try {
      setSalvandoChaveInline('unidades_conferidas');
      await salvarRespostasOnboarding(loja.id, { unidades_conferidas: true });
      navegarParaConfigurarEtapa(
        'categorias_unidades',
        'Categorias e Unidades de Medida',
        '/auxiliares?tab=unidades'
      );
    } catch (err) {
      setErroMensagem(
        err instanceof Error ? err.message : 'Não foi possível atualizar o status de unidades.'
      );
    } finally {
      setSalvandoChaveInline(null);
    }
  };

  const handleOperarSozinho = async () => {
    if (!loja?.id) return;
    const proximoValor = !Boolean(statusCompleto?.setup.opera_sozinho);
    try {
      setSalvandoChaveInline('opera_sozinho');
      setErroMensagem(null);
      await salvarRespostasOnboarding(loja.id, { opera_sozinho: proximoValor });
      await carregarProgresso();
      setAvisoSucesso(
        proximoValor
          ? 'Etapa marcada como concluída: operação individual ("Opero esta loja sozinho").'
          : 'Preferência de operação individual desmarcada.'
      );
    } catch (err) {
      setErroMensagem(
        err instanceof Error ? err.message : 'Não foi possível salvar a preferência de equipe.'
      );
    } finally {
      setSalvandoChaveInline(null);
    }
  };

  const handleSalvarPerfilIAInline = async () => {
    if (!loja?.id) return;
    try {
      setErroMensagem(null);
      setSalvandoChaveInline('perfil_negocio_ia');
      await salvarPerfilNegocioIALoja(loja.id, {
        segmento: segmentoInline || 'geral',
        descricao_especialidade: especialidadeInline,
      });
      await recarregarDadosLoja();
      await carregarProgresso();
      exibirSucessoTemporario(
        'Identidade do negócio salva! Todas as IAs do sistema Rubi agora operam calibradas para o seu nicho.'
      );
    } catch (err) {
      setErroMensagem(
        err instanceof Error ? err.message : 'Não foi possível salvar a identidade do negócio.'
      );
    } finally {
      setSalvandoChaveInline(null);
    }
  };

  const handleSalvarMetasRapidasInline = async () => {
    if (!loja?.id) return;
    const faturamento = Number(String(metaFaturamentoInline).replace(',', '.')) || 0;
    const pedidos = Math.max(0, Math.round(Number(String(metaPedidosInline).replace(',', '.')) || 0));
    const lucro = Math.max(0, Number(String(metaLucroInline).replace(',', '.')) || 0);

    if (faturamento <= 0) {
      setErroMensagem(
        'Informe uma Meta de Faturamento Mensal maior que zero para ativar os velocímetros do Cockpit F1.'
      );
      return;
    }

    try {
      setErroMensagem(null);
      setSalvandoChaveInline('metas_rapidas');
      const ticketCalculado = pedidos > 0 ? Math.round((faturamento / pedidos) * 100) / 100 : 0;
      await dashboardService.salvarMetasLoja(
        loja.id,
        {
          meta_faturamento: faturamento,
          meta_pedidos: pedidos,
          meta_lucro_liquido: lucro,
          meta_ticket_medio: ticketCalculado,
        },
        usuario?.id
      );
      await salvarRespostasOnboarding(loja.id, { metas_conferidas: true });
      notificarConfiguracaoSalvaParaOnboarding('metas_loja');
      await carregarProgresso();
      exibirSucessoTemporario(
        'Metas salvas! Os velocímetros do Dashboard / Cockpit F1 já refletem suas metas.'
      );
    } catch (err) {
      setErroMensagem(
        err instanceof Error ? err.message : 'Não foi possível salvar as metas da loja.'
      );
    } finally {
      setSalvandoChaveInline(null);
    }
  };

  const handleConcluirQuestionario = async () => {
    if (!loja?.id) {
      onClose();
      return;
    }
    try {
      setSalvandoConclusao(true);
      setErroMensagem(null);
      await salvarRespostasOnboarding(loja.id, {
        questionario_respondido: true,
        respondido_em: new Date().toISOString(),
      });
      await carregarProgresso();
      onConcluirQuestionario?.();
      onClose();
    } catch (err) {
      setErroMensagem(
        err instanceof Error ? err.message : 'Erro ao concluir o questionário inicial.'
      );
    } finally {
      setSalvandoConclusao(false);
    }
  };

  const handleAdiar = () => {
    onAdiarSessao?.();
    onClose();
  };

  const obterEtapaPorId = (id: EtapaOnboardingId) =>
    statusCompleto?.etapasEssenciais.find((e) => e.id === id) ||
    statusCompleto?.etapasOpcionaisTodas.find((e) => e.id === id) ||
    null;

  const renderBadgeStatus = (concluido: boolean, textoPendente = 'Pendente') =>
    concluido ? (
      <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>✓ Configurado</span>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0">
        <Clock className="w-3.5 h-3.5" />
        <span>{textoPendente}</span>
      </span>
    );

  const classeCardBase = (etapaId: EtapaOnboardingId, concluido: boolean) => {
    const destacado = destaqueTemporarioId === etapaId;
    return `rounded-2xl p-4 sm:p-5 border transition-all duration-200 ${
      destacado
        ? 'ring-2 ring-emerald-500 border-emerald-500 shadow-lg shadow-emerald-500/15'
        : concluido
        ? isDark
          ? 'bg-emerald-950/15 border-emerald-800/50'
          : 'bg-emerald-50/40 border-emerald-200'
        : isDark
        ? 'bg-slate-900/70 border-slate-800'
        : 'bg-slate-50/80 border-slate-200'
    }`;
  };

  const totalAtivas = statusCompleto?.totalAtivas ?? 10;
  const totalConcluidas = statusCompleto?.totalConcluidas ?? 0;
  const percentual = statusCompleto?.percentual ?? 0;
  const tudoPronto = Boolean(statusCompleto?.tudoPronto);

  const etapaGemini = obterEtapaPorId('ia_gemini');
  const etapaSerper = obterEtapaPorId('busca_fotos_serper');
  const etapaPerfilIa = obterEtapaPorId('perfil_negocio_ia');
  const segmentoSalvoOnboarding = statusCompleto?.lojaSnapshot.segmento_negocio || 'geral';
  const especialidadeSalvaOnboarding = statusCompleto?.lojaSnapshot.especialidade_negocio || '';
  const identidadeInlineAlterada =
    segmentoInline !== segmentoSalvoOnboarding ||
    especialidadeInline.trim() !== especialidadeSalvaOnboarding.trim();
  const exibirSalvarIdentidade =
    !Boolean(etapaPerfilIa?.concluido) || identidadeInlineAlterada;
  const etapaDados = obterEtapaPorId('dados_loja_cep');
  const etapaTiposVenda = obterEtapaPorId('tipos_venda');
  const etapaPagamentos = obterEtapaPorId('formas_pagamento');
  const etapaStatusPedidos = obterEtapaPorId('status_pedidos');
  const etapaCategorias = obterEtapaPorId('categorias_unidades');
  const etapaMetas = obterEtapaPorId('metas_loja');
  const etapaColaboradores = obterEtapaPorId('colaboradores');
  const qtdStatusOpcionaisAtivos = ITENS_STATUS_OPCIONAIS.filter((item) =>
    Boolean(statusCompleto?.lojaSnapshot[item.campo])
  ).length;

  const classeBotaoAcaoNeutra = isDark
    ? 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 shadow-xs'
    : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 shadow-xs';

  const classeBotaoPrincipalAcao = isDark
    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 font-black shadow-xs'
    : 'bg-emerald-300 hover:bg-emerald-400 text-black border border-emerald-400 font-black shadow-xs';

  const classeBotaoSecundarioNeutro = isDark
    ? 'bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200'
    : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800';

  const classeBotaoPorQueUsar = isDark
    ? 'bg-transparent hover:bg-slate-800 border border-slate-700/80 text-slate-200 hover:text-white'
    : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 hover:text-slate-900';

  const obterConfigModalPorQueUsar = (
    etapaId: EtapaOnboardingId | null
  ): {
    icone: React.ComponentType<{ className?: string }> | null;
    configurado: boolean;
    acoes: AcaoModalPorQueUsar[];
  } => {
    if (!etapaId) {
      return { icone: null, configurado: false, acoes: [] };
    }

    switch (etapaId) {
      case 'ia_gemini':
        return {
          icone: Bot,
          configurado: Boolean(etapaGemini?.concluido),
          acoes: [
            {
              id: 'como-obter-gemini',
              rotulo: 'Como obter',
              variante: 'secundaria_neutra',
              icone: 'help',
              onClick: () => {
                setEtapaPorQueUsarId(null);
                setModalGeminiAberto(true);
              },
            },
            {
              id: 'configurar-gemini',
              rotulo: 'Configurar Chave',
              variante: 'primaria_neutra',
              icone: 'arrow',
              onClick: () => {
                setEtapaPorQueUsarId(null);
                navegarParaConfigurarEtapa(
                  'ia_gemini',
                  'Inteligência Artificial Base (Google Gemini)',
                  '/config?tab=dados-loja&campo=gemini_api_key'
                );
              },
            },
          ],
        };
      case 'busca_fotos_serper':
        return {
          icone: Camera,
          configurado: Boolean(etapaSerper?.concluido),
          acoes: [
            {
              id: 'como-obter-serper',
              rotulo: 'Como obter',
              variante: 'secundaria_neutra',
              icone: 'help',
              onClick: () => {
                setEtapaPorQueUsarId(null);
                setModalSerperAberto(true);
              },
            },
            {
              id: 'configurar-serper',
              rotulo: 'Configurar Serper.dev',
              variante: 'primaria_neutra',
              icone: 'arrow',
              onClick: () => {
                setEtapaPorQueUsarId(null);
                navegarParaConfigurarEtapa(
                  'busca_fotos_serper',
                  'Busca Automática de Fotos (Serper.dev)',
                  '/config?tab=dados-loja&campo=serper_api_key'
                );
              },
            },
          ],
        };
      case 'perfil_negocio_ia':
        return {
          icone: Sparkles,
          configurado: Boolean(etapaPerfilIa?.concluido),
          acoes: [
            {
              id: 'abrir-dados-loja-ia',
              rotulo: 'Configurar Identidade',
              variante: 'primaria_neutra',
              icone: 'arrow',
              onClick: () => {
                setEtapaPorQueUsarId(null);
                navegarParaConfigurarEtapa(
                  'perfil_negocio_ia',
                  'Identidade do Negócio (Segmento & Especialidade para IAs)',
                  '/config?tab=dados-loja&campo=identidade_negocio'
                );
              },
            },
          ],
        };
      case 'dados_loja_cep':
        return {
          icone: MapPin,
          configurado: Boolean(etapaDados?.concluido),
          acoes: [
            {
              id: 'configurar-dados-cep',
              rotulo: 'Preencher Dados e CEP',
              variante: 'primaria_neutra',
              icone: 'arrow',
              onClick: () => {
                setEtapaPorQueUsarId(null);
                navegarParaConfigurarEtapa(
                  'dados_loja_cep',
                  'Dados da Loja e Endereço/CEP de Origem',
                  '/config?tab=dados-loja&campo=topo'
                );
              },
            },
          ],
        };
      case 'tipos_venda':
        return {
          icone: Tags,
          configurado: Boolean(etapaTiposVenda?.concluido),
          acoes: [
            {
              id: 'configurar-regras-desconto',
              rotulo: 'Configurar Regras de Desconto',
              variante: 'primaria_neutra',
              icone: 'sliders',
              onClick: () => {
                setEtapaPorQueUsarId(null);
                navegarParaConfigurarEtapa(
                  'tipos_venda',
                  'Tabelas de Preço e Tipos de Venda',
                  '/config?tab=tipos-venda&campo=topo'
                );
              },
            },
          ],
        };
      case 'formas_pagamento':
        return {
          icone: CreditCard,
          configurado: Boolean(etapaPagamentos?.concluido),
          acoes: [
            {
              id: 'configurar-pagamentos',
              rotulo: 'Configurar Pagamentos',
              variante: 'primaria_neutra',
              icone: 'arrow',
              onClick: () => {
                setEtapaPorQueUsarId(null);
                navegarParaConfigurarEtapa(
                  'formas_pagamento',
                  'Formas de Pagamento e Taxas de Maquininha',
                  '/config?tab=pagamentos&campo=topo'
                );
              },
            },
          ],
        };
      case 'status_pedidos':
        return {
          icone: ListChecks,
          configurado: Boolean(etapaStatusPedidos?.concluido),
          acoes: [
            ...(qtdStatusOpcionaisAtivos > 0
              ? [
                  {
                    id: 'manter-status-padrao',
                    rotulo:
                      salvandoChaveInline === 'status_padrao'
                        ? 'Aplicando...'
                        : 'Manter apenas os status padrão',
                    variante: 'secundaria_neutra' as const,
                    disabled: salvandoChaveInline === 'status_padrao',
                    onClick: () => {
                      handleManterApenasStatusPadrao();
                    },
                  },
                ]
              : []),
            {
              id: 'abrir-config-pedidos',
              rotulo: 'Abrir Config. de Pedidos',
              variante: 'primaria_neutra',
              icone: 'arrow',
              onClick: () => {
                setEtapaPorQueUsarId(null);
                navegarParaConfigurarEtapa(
                  'status_pedidos',
                  'Fluxo de Status dos Pedidos',
                  '/config?tab=pedidos-vendas'
                );
              },
            },
          ],
        };
      case 'categorias_unidades':
        return {
          icone: FolderTree,
          configurado: Boolean(etapaCategorias?.concluido),
          acoes: [
            {
              id: 'conferir-unidades',
              rotulo: 'Conferir Unidades',
              variante: 'secundaria_neutra',
              icone: 'ruler',
              disabled: salvandoChaveInline === 'unidades_conferidas',
              onClick: () => {
                setEtapaPorQueUsarId(null);
                handleConferirUnidades();
              },
            },
            {
              id: 'cadastrar-categorias',
              rotulo: 'Cadastrar Categorias',
              variante: 'primaria_neutra',
              icone: 'folder',
              disabled: carregandoCategorias,
              onClick: () => {
                setEtapaPorQueUsarId(null);
                handleAbrirModalCategorias();
              },
            },
          ],
        };
      case 'metas_loja':
        return {
          icone: Target,
          configurado: Boolean(etapaMetas?.concluido),
          acoes: [
            {
              id: 'definir-metas',
              rotulo: 'Definir Minhas Metas',
              variante: 'primaria_neutra',
              icone: 'arrow',
              onClick: () => {
                setEtapaPorQueUsarId(null);
                navegarParaConfigurarEtapa(
                  'metas_loja',
                  'Metas da Loja (Cockpit Executivo F1)',
                  '/config?tab=metas&campo=topo'
                );
              },
            },
          ],
        };
      case 'colaboradores':
        return {
          icone: Users,
          configurado: Boolean(etapaColaboradores?.concluido),
          acoes: [
            {
              id: 'opero-sozinho',
              rotulo: 'Opero esta loja sozinho',
              variante: 'secundaria_neutra',
              icone: 'check',
              ativo: Boolean(statusCompleto?.setup.opera_sozinho),
              disabled: salvandoChaveInline === 'opera_sozinho',
              onClick: () => {
                setEtapaPorQueUsarId(null);
                void handleOperarSozinho();
              },
            },
            {
              id: 'cadastrar-colaboradores',
              rotulo: 'Cadastrar Colaboradores',
              variante: 'primaria_neutra',
              icone: 'arrow',
              onClick: () => {
                setEtapaPorQueUsarId(null);
                navegarParaConfigurarEtapa(
                  'colaboradores',
                  'Cadastro de Colaboradores',
                  '/users'
                );
              },
            },
          ],
        };
      default: {
        const modulo = MODULOS_OPCIONAIS_DEFINICAO.find((m) => m.id === etapaId);
        if (!modulo) {
          return { icone: null, configurado: false, acoes: [] };
        }
        const configurado = Boolean(obterEtapaPorId(modulo.id)?.concluido);
        const acoesModulo: AcaoModalPorQueUsar[] = [];

        if (modulo.tutorialTipo) {
          acoesModulo.push({
            id: `tutorial-${modulo.id}`,
            rotulo: 'Ver Tutorial',
            variante: 'secundaria_neutra',
            icone: 'help',
            onClick: () => {
              setEtapaPorQueUsarId(null);
              if (modulo.tutorialTipo === 'melhor_envio') {
                setModalMelhorEnvioAberto(true);
              } else {
                setModalUberDirectAberto(true);
              }
            },
          });
        }

        if (configurado) {
          acoesModulo.push({
            id: `atualizar-${modulo.id}`,
            rotulo: 'Atualizar',
            variante: 'primaria_neutra',
            onClick: () => {
              setEtapaPorQueUsarId(null);
              navegarParaConfigurarEtapa(modulo.id, modulo.titulo, modulo.rotaDestino);
            },
          });
        } else {
          acoesModulo.push({
            id: `configurar-${modulo.id}`,
            rotulo: 'Configurar Agora',
            variante: 'primaria_neutra',
            icone: 'arrow',
            onClick: () => {
              setEtapaPorQueUsarId(null);
              navegarParaConfigurarEtapa(modulo.id, modulo.titulo, modulo.rotaDestino);
            },
          });
        }

        return {
          icone: modulo.icone,
          configurado,
          acoes: acoesModulo,
        };
      }
    }
  };

  const configModalPorQueUsar = obterConfigModalPorQueUsar(etapaPorQueUsarId);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-questionario-onboarding"
          className={`relative w-full max-w-4xl max-h-[94vh] flex flex-col rounded-3xl shadow-2xl border overflow-hidden ${
            isDark
              ? 'bg-slate-950 border-slate-800 text-slate-100'
              : 'bg-white border-slate-200 text-black'
          }`}
        >
          {/* CABEÇALHO + TERMÔMETRO EM TEMPO REAL */}
          <div
            className={`p-5 sm:p-6 border-b shrink-0 ${
              isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id="titulo-questionario-onboarding"
                      className="text-lg sm:text-xl font-black tracking-tight"
                    >
                      Questionário de Implantação Inicial da Loja
                    </h2>
                    {tudoPronto && (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-black">
                        100% Pronta
                      </span>
                    )}
                  </div>
                  <p className={`text-sm sm:text-[15px] mt-1 font-normal ${isDark ? 'text-slate-200' : 'text-black'}`}>
                    Responda o perfil da sua operação, configure no clique e acompanhe seu progresso em tempo real.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAdiar}
                title="Fechar (Esc)"
                className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
                  isDark
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                    : 'text-slate-900 hover:text-black hover:bg-slate-200'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Termômetro de Progresso */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs sm:text-sm font-bold">
                <span className={isDark ? 'text-slate-200' : 'text-black'}>
                  Termômetro de Prontidão ({statusCompleto?.etapasEssenciais.length ?? 9} Essenciais + {statusCompleto?.etapasOpcionaisAtivas.length ?? 0} Módulos Ativos)
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-black">
                  {totalConcluidas} de {totalAtivas} etapas configuradas ({percentual}%)
                </span>
              </div>
              <div
                className={`w-full h-3 rounded-full overflow-hidden ${
                  isDark ? 'bg-slate-800' : 'bg-slate-200'
                }`}
              >
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${percentual}%` }}
                />
              </div>
            </div>
          </div>

          {/* ALERTAS RÁPIDOS */}
          {avisoSucesso && (
            <div className="mx-5 sm:mx-6 mt-4 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{avisoSucesso}</span>
              </div>
              <button
                type="button"
                onClick={() => setAvisoSucesso(null)}
                className="cursor-pointer opacity-70 hover:opacity-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {erroMensagem && (
            <div className="mx-5 sm:mx-6 mt-4 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-between gap-3 text-xs font-bold text-rose-700 dark:text-rose-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erroMensagem}</span>
              </div>
              <button
                type="button"
                onClick={() => setErroMensagem(null)}
                className="cursor-pointer opacity-70 hover:opacity-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* CORPO SCROLLÁVEL */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-8">
            {carregando && !statusCompleto ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                <p className={`text-[15px] font-medium ${isDark ? 'text-slate-200' : 'text-black'}`}>
                  Diagnosticando configurações da sua loja...
                </p>
              </div>
            ) : (
              <>
                {/* ================================================================= */}
                {/* BLOCO 1 — CONFIGURAÇÕES ESSENCIAIS (OBRIGATÓRIAS PARA RODAR 100%) */}
                {/* ================================================================= */}
                <section className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Bloco 1 de 2
                      </span>
                      <h3 className="text-base sm:text-lg font-black">
                        Configurações Essenciais (Obrigatórias para rodar 100%)
                      </h3>
                    </div>
                    <span className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-black'}`}>
                      {statusCompleto?.etapasEssenciais.filter((e) => e.concluido).length ?? 0}/{statusCompleto?.etapasEssenciais.length ?? 9} concluídas
                    </span>
                  </div>

                  {/* Card 1: Inteligência Artificial Base (Google Gemini) */}
                  <div
                    ref={(el) => {
                      cardRefs.current.ia_gemini = el;
                    }}
                    className={classeCardBase('ia_gemini', Boolean(etapaGemini?.concluido))}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <Bot className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className={`text-base font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                            1. Inteligência Artificial Base (Google Gemini)
                          </h4>
                          <p className={`text-sm sm:text-[15px] leading-relaxed font-normal ${isDark ? 'text-slate-200' : 'text-black'}`}>
                            Libera a <strong>Rubi IA</strong> para ajudar no setup, gerar descrições profissionais de produtos e atender clientes automaticamente.
                          </p>
                        </div>
                      </div>
                      {renderBadgeStatus(Boolean(etapaGemini?.concluido))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          navegarParaConfigurarEtapa(
                            'ia_gemini',
                            'Inteligência Artificial Base (Google Gemini)',
                            '/config?tab=dados-loja&campo=gemini_api_key'
                          )
                        }
                        className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer ${classeBotaoAcaoNeutra}`}
                      >
                        <span>Configurar Chave</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalGeminiAberto(true)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${classeBotaoSecundarioNeutro}`}
                      >
                        <HelpCircle className={`w-3.5 h-3.5 ${isDark ? 'text-slate-300' : 'text-slate-950'}`} />
                        <span>Como obter</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEtapaPorQueUsarId('ia_gemini')}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${classeBotaoPorQueUsar}`}
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Por que usar?</span>
                      </button>
                    </div>
                  </div>

                  {/* Card 2: Busca Automática de Fotos (Serper.dev) */}
                  <div
                    ref={(el) => {
                      cardRefs.current.busca_fotos_serper = el;
                    }}
                    className={classeCardBase('busca_fotos_serper', Boolean(etapaSerper?.concluido))}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                          <Camera className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className={`text-base font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                            2. Busca Automática de Fotos (Serper.dev)
                          </h4>
                          <p className={`text-sm sm:text-[15px] leading-relaxed font-normal ${isDark ? 'text-slate-200' : 'text-black'}`}>
                            Puxa fotos profissionais pelo código de barras ou nome do produto em segundos e ativa o Radar de Preços.
                          </p>
                        </div>
                      </div>
                      {renderBadgeStatus(Boolean(etapaSerper?.concluido))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          navegarParaConfigurarEtapa(
                            'busca_fotos_serper',
                            'Busca Automática de Fotos (Serper.dev)',
                            '/config?tab=dados-loja&campo=serper_api_key'
                          )
                        }
                        className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer ${classeBotaoAcaoNeutra}`}
                      >
                        <span>Configurar Serper.dev</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalSerperAberto(true)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${classeBotaoSecundarioNeutro}`}
                      >
                        <HelpCircle className={`w-3.5 h-3.5 ${isDark ? 'text-slate-300' : 'text-slate-950'}`} />
                        <span>Como obter</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEtapaPorQueUsarId('busca_fotos_serper')}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${classeBotaoPorQueUsar}`}
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Por que usar?</span>
                      </button>
                    </div>
                  </div>

                  {/* Card 3: Identidade do Negócio (Segmento & Especialidade para Calibração das IAs) */}
                  <div
                    ref={(el) => {
                      cardRefs.current.perfil_negocio_ia = el;
                    }}
                    className={classeCardBase('perfil_negocio_ia', Boolean(etapaPerfilIa?.concluido))}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            3. Identidade do Negócio (Segmento & Especialidade para IAs)
                          </h4>
                          <p className={`text-sm sm:text-[15px] leading-relaxed font-normal ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            Estes dois campos alimentam diretamente todas as IAs do Rubi: <strong>Cadastro Inteligente de Produtos</strong>, <strong>Busca de Fotos</strong>, <strong>Assistente Executiva Rubi</strong> e <strong>Vendedora IA</strong>. Sem defini-los, a IA fica genérica e menos assertiva.
                          </p>
                        </div>
                      </div>
                      {renderBadgeStatus(Boolean(etapaPerfilIa?.concluido), 'Recomendado')}
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="onboarding-segmento-negocio"
                          className={`text-xs sm:text-sm font-bold block ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                        >
                          Segmento de Atuação (Recomendado):
                        </label>
                        <select
                          id="onboarding-segmento-negocio"
                          value={segmentoInline}
                          onChange={(e) => setSegmentoInline(e.target.value)}
                          className={`w-full rounded-xl px-3.5 py-2.5 text-sm font-medium border focus:border-emerald-500 outline-hidden ${
                            isDark
                              ? 'bg-slate-950 border-slate-700 text-white'
                              : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        >
                          {SEGMENTOS_NEGOCIO.map((seg) => (
                            <option key={seg.id} value={seg.id}>
                              {seg.icone} {seg.nome} — {seg.papel}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="onboarding-especialidade-negocio"
                          className={`text-xs sm:text-sm font-bold block ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                        >
                          Especialidade ou Foco Principal da Loja (Opcional — Alto Impacto):
                        </label>
                        <input
                          id="onboarding-especialidade-negocio"
                          type="text"
                          value={especialidadeInline}
                          onChange={(e) => setEspecialidadeInline(e.target.value)}
                          placeholder="Ex: Roupas femininas, peças Honda e Yamaha, informática gamer..."
                          className={`w-full rounded-xl px-3.5 py-2.5 text-sm border focus:border-emerald-500 outline-hidden ${
                            isDark
                              ? 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
                              : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-500'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2.5">
                      {exibirSalvarIdentidade && (
                        <button
                          type="button"
                          disabled={salvandoChaveInline === 'perfil_negocio_ia'}
                          onClick={() => void handleSalvarPerfilIAInline()}
                          className={`px-3.5 py-2 rounded-xl text-xs inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 ${classeBotaoPrincipalAcao}`}
                        >
                          {salvandoChaveInline === 'perfil_negocio_ia' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>Salvar Identidade</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          navegarParaConfigurarEtapa(
                            'perfil_negocio_ia',
                            'Identidade do Negócio (Segmento & Especialidade para IAs)',
                            '/config?tab=dados-loja&campo=identidade_negocio'
                          )
                        }
                        className={`px-3.5 py-2 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer ${classeBotaoAcaoNeutra}`}
                      >
                        <span>Configurar Identidade</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setEtapaPorQueUsarId('perfil_negocio_ia')}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${classeBotaoPorQueUsar}`}
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Por que usar?</span>
                      </button>
                    </div>
                  </div>

                  {/* Card 4: Dados da Loja e Endereço/CEP de Origem */}
                  <div
                    ref={(el) => {
                      cardRefs.current.dados_loja_cep = el;
                    }}
                    className={classeCardBase('dados_loja_cep', Boolean(etapaDados?.concluido))}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                          <MapPin className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            4. Dados da Loja e Endereço/CEP de Origem
                          </h4>
                          <p className={`text-sm sm:text-[15px] leading-relaxed font-normal ${isDark ? 'text-slate-200' : 'text-black'}`}>
                            O WhatsApp comercial e o <strong>CEP de origem</strong> são obrigatórios para calcular qualquer frete, entrega local ou retirada na loja.
                          </p>
                        </div>
                      </div>
                      {renderBadgeStatus(Boolean(etapaDados?.concluido))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          navegarParaConfigurarEtapa(
                            'dados_loja_cep',
                            'Dados da Loja e Endereço/CEP de Origem',
                            '/config?tab=dados-loja&campo=topo'
                          )
                        }
                        className={`px-3.5 py-2 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer ${classeBotaoAcaoNeutra}`}
                      >
                        <span>Preencher Dados e CEP</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEtapaPorQueUsarId('dados_loja_cep')}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${classeBotaoPorQueUsar}`}
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Por que usar?</span>
                      </button>
                    </div>
                  </div>

                  {/* Card 4: Tabelas de Preço e Tipos de Venda */}
                  <div
                    ref={(el) => {
                      cardRefs.current.tipos_venda = el;
                    }}
                    className={classeCardBase('tipos_venda', Boolean(etapaTiposVenda?.concluido))}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                          <Tags className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className={`text-base font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                            5. Tabelas de Preço e Tipos de Venda
                          </h4>
                          <p className={`text-sm sm:text-[15px] font-semibold ${isDark ? 'text-slate-100' : 'text-black'}`}>
                            Quais tabelas de venda você utiliza?
                          </p>
                        </div>
                      </div>
                      {renderBadgeStatus(Boolean(etapaTiposVenda?.concluido))}
                    </div>

                    <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {(
                        [
                          { chave: 'varejo', titulo: 'Varejo', desc: 'Venda unitária padrão' },
                          { chave: 'atacado', titulo: 'Atacado', desc: 'Desconto por lote/mínimo' },
                          { chave: 'distribuidor', titulo: 'Autoatacado / Distribuidor', desc: 'Fardos e caixas fechadas' },
                        ] as const
                      ).map((opt) => {
                        const marcado = Boolean(statusCompleto?.lojaSnapshot.tipos_venda[opt.chave]);
                        return (
                          <label
                            key={opt.chave}
                            className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition select-none ${
                              marcado
                                ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-500/10'
                                : isDark
                                ? 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={marcado}
                              disabled={salvandoChaveInline === `tipo_${opt.chave}`}
                              onChange={() => handleToggleTipoVenda(opt.chave)}
                              className="mt-0.5 w-4 h-4 rounded accent-emerald-600 cursor-pointer shrink-0"
                            />
                            <div className="min-w-0">
                              <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>{opt.titulo}</span>
                              <span className={`text-sm leading-relaxed font-normal block ${isDark ? 'text-slate-200' : 'text-black'}`}>
                                {opt.desc}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-black'}`}>
                        Alterações salvas automaticamente na loja.
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            navegarParaConfigurarEtapa(
                              'tipos_venda',
                              'Tabelas de Preço e Tipos de Venda',
                              '/config?tab=tipos-venda&campo=topo'
                            )
                          }
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer ${classeBotaoSecundarioNeutro}`}
                        >
                          <Sliders className={`w-3.5 h-3.5 ${isDark ? 'text-slate-300' : 'text-slate-950'}`} />
                          <span>Configurar Regras de Desconto</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEtapaPorQueUsarId('tipos_venda')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${classeBotaoPorQueUsar}`}
                        >
                          <Info className="w-3.5 h-3.5" />
                          <span>Por que usar?</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card 5: Formas de Pagamento e Taxas de Maquininha */}
                  <div
                    ref={(el) => {
                      cardRefs.current.formas_pagamento = el;
                    }}
                    className={classeCardBase('formas_pagamento', Boolean(etapaPagamentos?.concluido))}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <CreditCard className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className={`text-base font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                            6. Formas de Pagamento e Taxas de Maquininha
                          </h4>
                          <p className={`text-sm sm:text-[15px] leading-relaxed font-normal ${isDark ? 'text-slate-200' : 'text-black'}`}>
                            Cadastre Pix, Dinheiro, Cartões e taxas das operadoras para calcular seu lucro líquido real nas vendas.
                          </p>
                        </div>
                      </div>
                      {renderBadgeStatus(Boolean(etapaPagamentos?.concluido))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          navegarParaConfigurarEtapa(
                            'formas_pagamento',
                            'Formas de Pagamento e Taxas de Maquininha',
                            '/config?tab=pagamentos&campo=topo'
                          )
                        }
                        className={`px-3.5 py-2 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer ${classeBotaoAcaoNeutra}`}
                      >
                        <span>Configurar Pagamentos</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEtapaPorQueUsarId('formas_pagamento')}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${classeBotaoPorQueUsar}`}
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Por que usar?</span>
                      </button>
                    </div>
                  </div>

                  {/* Card 6: Fluxo de Status dos Pedidos */}
                  <div
                    ref={(el) => {
                      cardRefs.current.status_pedidos = el;
                    }}
                    className={classeCardBase('status_pedidos', Boolean(etapaStatusPedidos?.concluido))}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                          <ListChecks className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className={`text-base font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                              7. Fluxo de Status dos Pedidos (Kanban)
                            </h4>
                            {qtdStatusOpcionaisAtivos === 0 && (
                              <span className="inline-flex items-center gap-1 text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" />
                                Usando status padrão do sistema
                              </span>
                            )}
                          </div>
                          <p className={`text-sm sm:text-[15px] leading-relaxed font-normal ${isDark ? 'text-slate-200' : 'text-black'}`}>
                            Defina quais etapas opcionais aparecem no seu painel de pedidos (os status <strong>Pendente, Confirmado, Cancelado e Concluído</strong> já vêm ativos por padrão no sistema).
                          </p>
                        </div>
                      </div>
                      {renderBadgeStatus(Boolean(etapaStatusPedidos?.concluido))}
                    </div>

                    <div
                      className={`mt-3 p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2.5 ${
                        isDark
                          ? 'bg-slate-950/60 border-slate-800 text-slate-200'
                          : 'bg-white border-slate-200 text-black'
                      }`}
                    >
                      <span className="text-sm font-medium">
                        {qtdStatusOpcionaisAtivos === 0
                          ? 'Operando com os 4 status padrão do sistema (Pendente, Confirmado, Cancelado e Concluído). Ative etapas extras abaixo apenas se precisar.'
                          : `${qtdStatusOpcionaisAtivos} ${
                              qtdStatusOpcionaisAtivos === 1 ? 'status opcional ativo' : 'status opcionais ativos'
                            } além dos 4 status padrão.`}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {qtdStatusOpcionaisAtivos > 0 && (
                          <button
                            type="button"
                            disabled={salvandoChaveInline === 'status_padrao'}
                            onClick={handleManterApenasStatusPadrao}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-50 ${classeBotaoAcaoNeutra}`}
                          >
                            {salvandoChaveInline === 'status_padrao'
                              ? 'Aplicando...'
                              : 'Manter apenas os status padrão'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEtapaPorQueUsarId('status_pedidos')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${classeBotaoPorQueUsar}`}
                        >
                          <Info className="w-3.5 h-3.5" />
                          <span>Por que usar?</span>
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {ITENS_STATUS_OPCIONAIS.map((item) => {
                        const ativo = Boolean(statusCompleto?.lojaSnapshot[item.campo]);
                        const emSalvamento = salvandoChaveInline === item.campo;
                        return (
                          <div
                            key={item.campo}
                            onClick={() => {
                              if (!emSalvamento) {
                                handleToggleStatusOperacional(item.campo);
                              }
                            }}
                            className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-colors duration-200 select-none ${
                              ativo
                                ? 'border-emerald-300 dark:border-emerald-700/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                                : isDark
                                ? 'bg-slate-950 border-slate-800 hover:border-slate-700'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`w-2.5 h-2.5 rounded-full ${item.dotClass} shrink-0`} />
                              <div className="min-w-0">
                                <span className={`text-sm font-bold block truncate ${isDark ? 'text-white' : 'text-black'}`}>{item.titulo}</span>
                                <span className={`text-sm leading-relaxed font-normal block truncate ${isDark ? 'text-slate-200' : 'text-black'}`}>
                                  {item.descricao}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`text-xs font-semibold ${
                                  ativo
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : isDark
                                    ? 'text-slate-200'
                                    : 'text-slate-950'
                                }`}
                              >
                                {ativo ? 'Ativo' : 'Desativado'}
                              </span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={ativo}
                                aria-label={`${item.titulo}: ${ativo ? 'Ativo' : 'Desativado'}`}
                                disabled={emSalvamento}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleStatusOperacional(item.campo);
                                }}
                                className={`relative inline-flex h-6 w-[42px] shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                  ativo
                                    ? 'bg-emerald-500 dark:bg-emerald-600'
                                    : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                              >
                                <span
                                  aria-hidden="true"
                                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white manter-branco shadow-sm transition-transform duration-200 ease-in-out ${
                                    ativo ? 'translate-x-5' : 'translate-x-0.5'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card 7: Categorias e Unidades de Medida */}
                  <div
                    ref={(el) => {
                      cardRefs.current.categorias_unidades = el;
                    }}
                    className={classeCardBase('categorias_unidades', Boolean(etapaCategorias?.concluido))}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                          <FolderTree className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className={`text-base font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                              8. Categorias e Unidades de Medida
                            </h4>
                            {statusCompleto?.setup.unidades_conferidas && (
                              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                <Check className="w-3 h-3" />
                                Unidades conferidas
                              </span>
                            )}
                          </div>
                          <p className={`text-sm sm:text-[15px] leading-relaxed font-normal ${isDark ? 'text-slate-200' : 'text-black'}`}>
                            Organize seus produtos em categorias e revise as unidades de medida (UN, KG, CX, L) usadas no PDV e estoque.
                          </p>
                        </div>
                      </div>
                      {renderBadgeStatus(Boolean(etapaCategorias?.concluido))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        disabled={carregandoCategorias}
                        onClick={handleAbrirModalCategorias}
                        className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 ${classeBotaoAcaoNeutra}`}
                      >
                        {carregandoCategorias ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FolderTree className="w-3.5 h-3.5" />
                        )}
                        <span>Cadastrar Categorias</span>
                      </button>

                      <button
                        type="button"
                        disabled={salvandoChaveInline === 'unidades_conferidas'}
                        onClick={handleConferirUnidades}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${classeBotaoSecundarioNeutro}`}
                      >
                        <Ruler className={`w-3.5 h-3.5 ${isDark ? 'text-slate-300' : 'text-slate-950'}`} />
                        <span>Conferir Unidades</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setEtapaPorQueUsarId('categorias_unidades')}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${classeBotaoPorQueUsar}`}
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Por que usar?</span>
                      </button>
                    </div>
                  </div>

                  {/* Card 9: Metas da Loja (Cockpit Executivo F1) */}
                  <div
                    ref={(el) => {
                      cardRefs.current.metas_loja = el;
                    }}
                    className={classeCardBase('metas_loja', Boolean(etapaMetas?.concluido))}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                          <Target className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            9. Metas da Loja (Cockpit Executivo F1)
                          </h4>
                          <p className={`text-sm sm:text-[15px] leading-relaxed font-normal ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            Sem metas configuradas, os velocímetros do <strong>Dashboard / Cockpit Executivo F1</strong> permanecem zerados (<code>0.00</code>). Defina sua meta mensal agora ou agende no checklist.
                          </p>
                        </div>
                      </div>
                      {renderBadgeStatus(Boolean(etapaMetas?.concluido))}
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label
                          htmlFor="onboarding-meta-faturamento"
                          className={`text-xs font-bold block ${isDark ? 'text-slate-200' : 'text-slate-900'}`}
                        >
                          Meta Faturamento Mensal (R$):
                        </label>
                        <input
                          id="onboarding-meta-faturamento"
                          type="number"
                          min="0"
                          step="100"
                          value={metaFaturamentoInline}
                          onChange={(e) => setMetaFaturamentoInline(e.target.value)}
                          placeholder="Ex: 30000"
                          className={`w-full rounded-xl px-3 py-2 text-sm font-semibold border focus:border-emerald-500 outline-hidden ${
                            isDark
                              ? 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
                              : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-500'
                          }`}
                        />
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor="onboarding-meta-pedidos"
                          className={`text-xs font-bold block ${isDark ? 'text-slate-200' : 'text-slate-900'}`}
                        >
                          Meta Pedidos / Mês (Opcional):
                        </label>
                        <input
                          id="onboarding-meta-pedidos"
                          type="number"
                          min="0"
                          step="1"
                          value={metaPedidosInline}
                          onChange={(e) => setMetaPedidosInline(e.target.value)}
                          placeholder="Ex: 150"
                          className={`w-full rounded-xl px-3 py-2 text-sm font-semibold border focus:border-emerald-500 outline-hidden ${
                            isDark
                              ? 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
                              : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-500'
                          }`}
                        />
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor="onboarding-meta-lucro"
                          className={`text-xs font-bold block ${isDark ? 'text-slate-200' : 'text-slate-900'}`}
                        >
                          Meta Lucro Líquido (R$, Opcional):
                        </label>
                        <input
                          id="onboarding-meta-lucro"
                          type="number"
                          min="0"
                          step="100"
                          value={metaLucroInline}
                          onChange={(e) => setMetaLucroInline(e.target.value)}
                          placeholder="Ex: 8000"
                          className={`w-full rounded-xl px-3 py-2 text-sm font-semibold border focus:border-emerald-500 outline-hidden ${
                            isDark
                              ? 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
                              : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-500'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        disabled={salvandoChaveInline === 'metas_rapidas'}
                        onClick={() => void handleSalvarMetasRapidasInline()}
                        className={`px-3.5 py-2 rounded-xl text-xs inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 ${classeBotaoPrincipalAcao}`}
                      >
                        {salvandoChaveInline === 'metas_rapidas' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Target className="w-3.5 h-3.5" />
                        )}
                        <span>Salvar Metas Rápidas</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          navegarParaConfigurarEtapa(
                            'metas_loja',
                            'Metas da Loja (Cockpit Executivo F1)',
                            '/config?tab=metas&campo=topo'
                          )
                        }
                        className={`px-3.5 py-2 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer ${classeBotaoAcaoNeutra}`}
                      >
                        <span>Configurar Todas as Metas</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setEtapaPorQueUsarId('metas_loja')}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${classeBotaoPorQueUsar}`}
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Por que usar?</span>
                      </button>
                    </div>
                  </div>

                  {/* Card 10: Cadastro de Colaboradores */}
                  <div
                    ref={(el) => {
                      cardRefs.current.colaboradores = el;
                    }}
                    className={classeCardBase('colaboradores', Boolean(etapaColaboradores?.concluido))}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <Users className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                              10. Cadastro de Colaboradores
                            </h4>
                            {statusCompleto?.setup.opera_sozinho ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                <Check className="w-3 h-3" />
                                Operação individual
                              </span>
                            ) : ((statusCompleto?.lojaSnapshot.colaboradores_equipe_count ?? 0) >= 1 ||
                                (statusCompleto?.lojaSnapshot.colaboradores_ativos_count ?? 0) >= 2) && (
                              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                <Check className="w-3 h-3" />
                                {statusCompleto?.lojaSnapshot.colaboradores_ativos_count} colaboradores ativos
                              </span>
                            )}
                          </div>
                          <p className={`text-sm sm:text-[15px] leading-relaxed font-normal ${isDark ? 'text-slate-200' : 'text-black'}`}>
                            Adicione vendedores, operadores de caixa, técnicos ou prestadores de serviço
                          </p>
                        </div>
                      </div>
                      {renderBadgeStatus(Boolean(etapaColaboradores?.concluido))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          navegarParaConfigurarEtapa(
                            'colaboradores',
                            'Cadastro de Colaboradores',
                            '/users'
                          )
                        }
                        className="px-3.5 py-2 rounded-xl bg-emerald-300 hover:bg-emerald-400 border border-emerald-400 text-black font-black text-xs inline-flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Cadastrar Colaboradores</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={salvandoChaveInline === 'opera_sozinho'}
                        onClick={() => void handleOperarSozinho()}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 ${
                          statusCompleto?.setup.opera_sozinho
                            ? isDark
                              ? 'bg-emerald-950/40 border border-emerald-600/60 text-emerald-300'
                              : 'bg-emerald-50 border border-emerald-400 text-emerald-900'
                            : classeBotaoSecundarioNeutro
                        }`}
                      >
                        {salvandoChaveInline === 'opera_sozinho' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Opero esta loja sozinho</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEtapaPorQueUsarId('colaboradores')}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${classeBotaoPorQueUsar}`}
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Por que usar?</span>
                      </button>
                    </div>
                  </div>
                </section>

                {/* ================================================================= */}
                {/* BLOCO 2 — MÓDULOS E INTEGRAÇÕES OPCIONAIS (SOB DEMANDA)           */}
                {/* ================================================================= */}
                <section className="space-y-4 pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Bloco 2 de 2
                      </span>
                      <h3 className="text-base sm:text-lg font-black">
                        Módulos e Integrações Opcionais (Sob Demanda)
                      </h3>
                      <p className={`text-sm mt-1 leading-relaxed font-normal ${isDark ? 'text-slate-200' : 'text-black'}`}>
                        Ative e configure apenas os recursos que fazem sentido para sua operação. Módulos configurados entram automaticamente no termômetro.
                      </p>
                    </div>
                    <span className={`text-sm font-bold shrink-0 ${isDark ? 'text-slate-200' : 'text-black'}`}>
                      {statusCompleto?.etapasOpcionaisAtivas.length ?? 0} de{' '}
                      {
                        MODULOS_OPCIONAIS_DEFINICAO.filter(
                          (modulo) =>
                            modulo.id !== 'agendamento_servicos' ||
                            loja?.trabalha_com_agenda === true
                        ).length
                      }{' '}
                      ativos
                    </span>
                  </div>

                  <div className="space-y-3.5">
                    {MODULOS_OPCIONAIS_DEFINICAO.filter(
                      (modulo) =>
                        modulo.id !== 'agendamento_servicos' ||
                        loja?.trabalha_com_agenda === true
                    ).map((modulo, idx) => {
                      const etapaStatus = obterEtapaPorId(modulo.id);
                      const configurado = Boolean(etapaStatus?.concluido);
                      const Icone = modulo.icone;

                      return (
                        <div
                          key={modulo.id}
                          ref={(el) => {
                            cardRefs.current[modulo.id] = el;
                          }}
                          className={classeCardBase(modulo.id, configurado)}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                <Icone className="w-5 h-5" />
                              </div>
                              <div className="space-y-1">
                                <h4 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                  {idx + 1}. {modulo.titulo}
                                </h4>
                                <p className={`text-sm sm:text-[15px] leading-relaxed font-normal ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                  {modulo.descricaoComercial}
                                </p>
                                {modulo.id === 'whatsapp_ia_receptiva' && (
                                  <div
                                    className={`mt-2 p-3 rounded-xl border text-xs sm:text-sm leading-relaxed font-medium flex items-start gap-2 ${
                                      isDark
                                        ? 'bg-amber-950/30 border-amber-700/60 text-amber-200'
                                        : 'bg-amber-50 border-amber-300 text-slate-900'
                                    }`}
                                  >
                                    <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-700'}`} />
                                    <span>
                                      <strong>Requisito da API Oficial da Meta:</strong> exige um <strong>número de telefone exclusivo cadastrado na WhatsApp Cloud API</strong>, que não pode ser utilizado simultaneamente no aplicativo WhatsApp do celular.
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {configurado && renderBadgeStatus(true)}
                          </div>

                          {/* Ação Única Contextual + Ajuda */}
                          <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                navegarParaConfigurarEtapa(
                                  modulo.id,
                                  modulo.titulo,
                                  modulo.rotaDestino
                                )
                              }
                              className={`px-3.5 py-2 rounded-xl font-semibold text-sm flex items-center gap-1.5 transition cursor-pointer ${classeBotaoAcaoNeutra}`}
                            >
                              {configurado ? (
                                <span>Atualizar</span>
                              ) : (
                                <>
                                  <span>Configurar Agora</span>
                                  <ArrowRight className="w-4 h-4" />
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => setEtapaPorQueUsarId(modulo.id)}
                              className={`px-3.5 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer ${classeBotaoPorQueUsar}`}
                            >
                              <Info className="w-4 h-4" />
                              <span>Por que usar?</span>
                            </button>

                            {modulo.tutorialTipo && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (modulo.tutorialTipo === 'melhor_envio') {
                                    setModalMelhorEnvioAberto(true);
                                  } else {
                                    setModalUberDirectAberto(true);
                                  }
                                }}
                                className={`px-3.5 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer ${classeBotaoSecundarioNeutro}`}
                              >
                                <HelpCircle className={`w-4 h-4 ${isDark ? 'text-slate-200' : 'text-black'}`} />
                                <span>Ver Tutorial</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </div>

          {/* RODAPÉ FIXO */}
          <div
            className={`p-4 sm:p-5 border-t shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className={`flex items-center gap-2 text-xs sm:text-sm font-medium ${isDark ? 'text-slate-200' : 'text-black'}`}>
              <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>
                Você pode reabrir este questionário a qualquer momento em Configurações.
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleAdiar}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    : 'bg-slate-200 hover:bg-slate-300 text-black'
                }`}
              >
                Continuar depois
              </button>

              <button
                type="button"
                disabled={salvandoConclusao || carregando}
                onClick={handleConcluirQuestionario}
                className={`px-5 py-2.5 rounded-xl disabled:opacity-50 text-xs flex items-center gap-2 transition cursor-pointer shadow-md shadow-emerald-500/20 ${
                  isDark
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-black'
                    : 'bg-emerald-300 hover:bg-emerald-400 border border-emerald-400 text-black font-bold'
                }`}
              >
                {salvandoConclusao ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Salvar e Concluir Questionário</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SUB-MODAIS EDUCATIVOS E OPERACIONAIS */}
      <ModalComoObterGeminiApiKey
        isOpen={modalGeminiAberto}
        onClose={() => setModalGeminiAberto(false)}
        onPreencherChave={async (chave) => {
          setModalGeminiAberto(false);
          if (!loja?.id) return;
          try {
            await salvarGeminiApiKey(chave, loja.id, loja);
            await recarregarDadosLoja();
            await carregarProgresso();
            exibirSucessoTemporario('Chave do Google Gemini configurada com sucesso!');
          } catch (err) {
            setErroMensagem(
              err instanceof Error ? err.message : 'Erro ao salvar chave do Gemini.'
            );
          }
        }}
      />

      <ModalOnboardingSerpApi
        isOpen={modalSerperAberto}
        onClose={() => setModalSerperAberto(false)}
        loja={loja}
        onChaveSalvaComSucesso={async () => {
          setModalSerperAberto(false);
          await recarregarDadosLoja();
          await carregarProgresso();
          exibirSucessoTemporario('Chave do Serper.dev configurada com sucesso!');
        }}
      />

      <ModalGerenciarCategorias
        isOpen={modalCategoriasAberto}
        onClose={() => {
          setModalCategoriasAberto(false);
          carregarProgresso();
        }}
        categorias={categoriasLoja}
        onCategoriasAtualizadas={async () => {
          if (loja?.id) {
            const { data } = await supabase
              .from('categorias')
              .select('*')
              .eq('loja_id', loja.id)
              .order('ordem_exibicao');
            setCategoriasLoja((data as Categoria[] | null) || []);
          }
          await carregarProgresso();
        }}
      />

      <ModalTutorialMelhorEnvio
        aberto={modalMelhorEnvioAberto}
        onClose={() => setModalMelhorEnvioAberto(false)}
      />

      <ModalTutorialUberDirect
        aberto={modalUberDirectAberto}
        onClose={() => setModalUberDirectAberto(false)}
      />

      <ModalPorQueUsarModulo
        etapaId={etapaPorQueUsarId}
        icone={configModalPorQueUsar.icone}
        configurado={configModalPorQueUsar.configurado}
        acoes={configModalPorQueUsar.acoes}
        onClose={() => setEtapaPorQueUsarId(null)}
      />
    </>
  );
};
