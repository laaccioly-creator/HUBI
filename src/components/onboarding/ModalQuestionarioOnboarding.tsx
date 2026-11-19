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
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { supabase } from '../../lib/supabase';
import { Categoria } from '../../types';
import { salvarGeminiApiKey } from '../../services/geminiService';
import {
  EtapaOnboardingId,
  ChaveInteresseOnboarding,
  StatusOnboardingCompleto,
  SnapshotLojaOnboarding,
  TiposVendaLoja,
  avaliarProgressoCompletoOnboarding,
  salvarRespostasOnboarding,
  atualizarConfiguracaoDiretaLoja,
  registrarRetornoOnboarding,
} from '../../services/onboardingSetupService';
import { ModalComoObterGeminiApiKey } from '../configuracoes/ModalComoObterGeminiApiKey';
import { ModalOnboardingSerpApi } from '../ModalOnboardingSerpApi';
import { ModalGerenciarCategorias } from '../ModalGerenciarCategorias';
import { ModalTutorialMelhorEnvio } from '../shipping/ModalTutorialMelhorEnvio';
import { ModalTutorialUberDirect } from '../shipping/ModalTutorialUberDirect';

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
  chaveInteresse: ChaveInteresseOnboarding;
  titulo: string;
  descricaoComercial: string;
  rotaDestino: string;
  icone: React.ComponentType<{ className?: string }>;
  tutorialTipo?: 'melhor_envio' | 'uber_direct';
  campoDiretoLoja?: 'exigir_pesagem_previa_pagamento' | 'caderneta_ativa';
}

const MODULOS_OPCIONAIS_DEFINICAO: ModuloOpcionalCardDef[] = [
  {
    id: 'catalogo_online',
    chaveInteresse: 'interesse_catalogo_online',
    titulo: 'Vitrine Virtual (Catálogo Online PWA)',
    descricaoComercial:
      'Receba pedidos 24h por dia com link próprio e vitrine responsiva sem precisar atender um por um no chat.',
    rotaDestino: '/catalog-config',
    icone: Globe,
  },
  {
    id: 'gateway_pagamento',
    chaveInteresse: 'interesse_gateway_pagamento',
    titulo: 'Gateway de Pagamentos Online (Mercado Pago, Asaas e outros)',
    descricaoComercial:
      'Receba via Pix dinâmico (com baixa automática instantânea) e Cartão de Crédito/Débito direto no catálogo.',
    rotaDestino: '/config?tab=pagamentos',
    icone: CreditCard,
  },
  {
    id: 'melhor_envio',
    chaveInteresse: 'interesse_melhor_envio',
    titulo: 'Cotação Automática Nacional (Melhor Envio)',
    descricaoComercial:
      'Seu cliente calcula PAC, SEDEX e Jadlog direto no catálogo e fecha o pedido sozinho, sem intervenção humana para cotar frete, além de emitir etiquetas em 1 clique.',
    rotaDestino: '/config/frete',
    icone: Package,
    tutorialTipo: 'melhor_envio',
  },
  {
    id: 'uber_direct',
    chaveInteresse: 'interesse_uber_direct',
    titulo: 'Entregas Expressas Locais (Uber Direct)',
    descricaoComercial:
      'Chame entregadores parceiros ponto a ponto automaticamente no fechamento do pedido com rastreio ao vivo.',
    rotaDestino: '/config/frete',
    icone: Truck,
    tutorialTipo: 'uber_direct',
  },
  {
    id: 'apps_corrida',
    chaveInteresse: 'interesse_apps_corrida',
    titulo: 'Apps de Corrida Externos (99, Lalamove, etc.)',
    descricaoComercial:
      'Registre código da corrida e link de acompanhamento nos pedidos despachados para transparência com o cliente.',
    rotaDestino: '/config/frete',
    icone: Car,
  },
  {
    id: 'transportadoras_manuais',
    chaveInteresse: 'interesse_transportadoras_manuais',
    titulo: 'Transportadoras Manuais / Frota Própria',
    descricaoComercial:
      'Cadastre transportadoras próprias (ônibus, Braspress, motoboy) com link de rastreio e prazo personalizados.',
    rotaDestino: '/config/frete',
    icone: Store,
  },
  {
    id: 'whatsapp_auto',
    chaveInteresse: 'interesse_whatsapp_auto',
    titulo: 'Notificações Automáticas no WhatsApp (Meta Cloud API)',
    descricaoComercial:
      'Avise o cliente automaticamente quando o pedido sair para entrega, ficar pronto para retirada ou lembrar do agendamento.',
    rotaDestino: '/config?tab=whatsapp-ia',
    icone: MessageCircle,
  },
  {
    id: 'mercado_livre',
    chaveInteresse: 'interesse_mercado_livre',
    titulo: 'Integração com Mercado Livre',
    descricaoComercial:
      'Sincronize o estoque físico com seus anúncios em tempo real e imprima etiquetas direto pelo HUBI.',
    rotaDestino: '/config?tab=parceiros',
    icone: ShoppingBag,
  },
  {
    id: 'agendamento_servicos',
    chaveInteresse: 'interesse_agendamento_servicos',
    titulo: 'Agendamento de Serviços com Hora Marcada',
    descricaoComercial:
      'Agenda online 24h por profissional, sem conflito de horário e confirmação automática via link no WhatsApp.',
    rotaDestino: '/users',
    icone: CalendarClock,
  },
  {
    id: 'venda_por_peso',
    chaveInteresse: 'interesse_venda_por_peso',
    titulo: 'Venda por Peso / Balança',
    descricaoComercial:
      'O cliente pede no catálogo e o pagamento só é liberado após você pesar o item na balança e confirmar o valor real.',
    rotaDestino: '/catalog-config',
    icone: Scale,
    campoDiretoLoja: 'exigir_pesagem_previa_pagamento',
  },
  {
    id: 'caderneta_fiado',
    chaveInteresse: 'interesse_caderneta_fiado',
    titulo: 'Caderneta de Mercadinho / Fiado',
    descricaoComercial:
      'Conta corrente mensal com dia fixo de vencimento, histórico de lançamentos e limite de crédito por cliente.',
    rotaDestino: '/config?tab=pagamentos',
    icone: BookOpen,
    campoDiretoLoja: 'caderneta_ativa',
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
  const { loja, recarregarDadosLoja } = useAuth();

  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvandoConclusao, setSalvandoConclusao] = useState<boolean>(false);
  const [salvandoChaveInline, setSalvandoChaveInline] = useState<string | null>(null);
  const [statusCompleto, setStatusCompleto] = useState<StatusOnboardingCompleto | null>(null);
  const [erroMensagem, setErroMensagem] = useState<string | null>(null);
  const [avisoSucesso, setAvisoSucesso] = useState<string | null>(null);
  const [destaqueTemporarioId, setDestaqueTemporarioId] = useState<EtapaOnboardingId | null>(null);

  // Sub-modais educativos / operacionais integrados
  const [modalGeminiAberto, setModalGeminiAberto] = useState<boolean>(false);
  const [modalSerperAberto, setModalSerperAberto] = useState<boolean>(false);
  const [modalCategoriasAberto, setModalCategoriasAberto] = useState<boolean>(false);
  const [categoriasLoja, setCategoriasLoja] = useState<Categoria[]>([]);
  const [carregandoCategorias, setCarregandoCategorias] = useState<boolean>(false);
  const [modalMelhorEnvioAberto, setModalMelhorEnvioAberto] = useState<boolean>(false);
  const [modalUberDirectAberto, setModalUberDirectAberto] = useState<boolean>(false);

  const cardRefs = useRef<Partial<Record<EtapaOnboardingId, HTMLDivElement | null>>>({});

  const algumSubModalAberto =
    modalGeminiAberto ||
    modalSerperAberto ||
    modalCategoriasAberto ||
    modalMelhorEnvioAberto ||
    modalUberDirectAberto;

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
    try {
      setErroMensagem(null);
      const resultado = await avaliarProgressoCompletoOnboarding(loja.id);
      setStatusCompleto(resultado);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar o diagnóstico da implantação.';
      setErroMensagem(msg);
    } finally {
      setCarregando(false);
    }
  }, [loja?.id]);

  useEffect(() => {
    if (!isOpen || !loja?.id) return;
    setCarregando(true);
    carregarProgresso();
  }, [isOpen, loja?.id, carregarProgresso]);

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
    registrarRetornoOnboarding(etapaId, etapaTitulo);
    onClose();
    navigate(rotaDestino);
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

  const handleSelecionarInteresseModulo = async (
    modulo: ModuloOpcionalCardDef,
    querUsar: boolean
  ) => {
    if (!loja?.id || !statusCompleto) return;
    setErroMensagem(null);
    setSalvandoChaveInline(modulo.id);

    setStatusCompleto((prev) => {
      if (!prev) return prev;
      const nextSetup = {
        ...prev.setup,
        [modulo.chaveInteresse]: querUsar,
      };
      const nextSnapshot: SnapshotLojaOnboarding = { ...prev.lojaSnapshot };
      if (modulo.campoDiretoLoja === 'exigir_pesagem_previa_pagamento') {
        nextSnapshot.exigir_pesagem_previa_pagamento = querUsar;
      }
      if (modulo.campoDiretoLoja === 'caderneta_ativa') {
        nextSnapshot.caderneta_ativa = querUsar;
      }
      return {
        ...prev,
        setup: nextSetup,
        lojaSnapshot: nextSnapshot,
      };
    });

    try {
      await salvarRespostasOnboarding(loja.id, {
        [modulo.chaveInteresse]: querUsar,
      });

      if (modulo.campoDiretoLoja === 'exigir_pesagem_previa_pagamento') {
        await atualizarConfiguracaoDiretaLoja(loja.id, {
          exigir_pesagem_previa_pagamento: querUsar,
        });
        await recarregarDadosLoja();
      } else if (modulo.campoDiretoLoja === 'caderneta_ativa') {
        await atualizarConfiguracaoDiretaLoja(loja.id, {
          caderneta_ativa: querUsar,
        });
        await recarregarDadosLoja();
      }

      await carregarProgresso();
    } catch (err) {
      setErroMensagem(
        err instanceof Error ? err.message : 'Não foi possível salvar a escolha do módulo.'
      );
      await carregarProgresso();
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

  const totalAtivas = statusCompleto?.totalAtivas ?? 8;
  const totalConcluidas = statusCompleto?.totalConcluidas ?? 0;
  const percentual = statusCompleto?.percentual ?? 0;
  const tudoPronto = Boolean(statusCompleto?.tudoPronto);

  const etapaGemini = obterEtapaPorId('ia_gemini');
  const etapaSerper = obterEtapaPorId('busca_fotos_serper');
  const etapaDados = obterEtapaPorId('dados_loja_cep');
  const etapaTiposVenda = obterEtapaPorId('tipos_venda');
  const etapaPagamentos = obterEtapaPorId('formas_pagamento');
  const etapaStatusPedidos = obterEtapaPorId('status_pedidos');
  const etapaCategorias = obterEtapaPorId('categorias_unidades');
  const etapaMetas = obterEtapaPorId('metas_loja');

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
              : 'bg-white border-slate-200 text-slate-900'
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
                  <p className={`text-xs sm:text-sm mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
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
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Termômetro de Progresso */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  Termômetro de Prontidão (Essenciais + Módulos Escolhidos)
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
                <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
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
                      <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        Bloco 1 de 2
                      </span>
                      <h3 className="text-base sm:text-lg font-black">
                        Configurações Essenciais (Obrigatórias para rodar 100%)
                      </h3>
                    </div>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      {statusCompleto?.etapasEssenciais.filter((e) => e.concluido).length ?? 0}/8 concluídas
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
                          <h4 className="font-black text-sm sm:text-base">
                            1. Inteligência Artificial Base (Google Gemini)
                          </h4>
                          <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
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
                            '/config?tab=dados-loja'
                          )
                        }
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                      >
                        <span>Configurar Chave</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalGeminiAberto(true)}
                        className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                          isDark
                            ? 'border-slate-700 hover:bg-slate-800 text-slate-200'
                            : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <HelpCircle className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Como obter gratuitamente</span>
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
                          <h4 className="font-black text-sm sm:text-base">
                            2. Busca Automática de Fotos (Serper.dev)
                          </h4>
                          <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
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
                            '/config?tab=dados-loja'
                          )
                        }
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                      >
                        <span>Configurar Serper.dev</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalSerperAberto(true)}
                        className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                          isDark
                            ? 'border-slate-700 hover:bg-slate-800 text-slate-200'
                            : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <HelpCircle className="w-3.5 h-3.5 text-teal-500" />
                        <span>Como obter</span>
                      </button>
                    </div>
                  </div>

                  {/* Card 3: Dados da Loja e Endereço/CEP de Origem */}
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
                          <h4 className="font-black text-sm sm:text-base">
                            3. Dados da Loja e Endereço/CEP de Origem
                          </h4>
                          <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            O WhatsApp comercial e o <strong>CEP de origem</strong> são obrigatórios para calcular qualquer frete, entrega local ou retirada na loja.
                          </p>
                        </div>
                      </div>
                      {renderBadgeStatus(Boolean(etapaDados?.concluido))}
                    </div>

                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() =>
                          navegarParaConfigurarEtapa(
                            'dados_loja_cep',
                            'Dados da Loja e Endereço/CEP de Origem',
                            '/config?tab=dados-loja'
                          )
                        }
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                      >
                        <span>Preencher Dados e CEP</span>
                        <ArrowRight className="w-3.5 h-3.5" />
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
                          <h4 className="font-black text-sm sm:text-base">
                            4. Tabelas de Preço e Tipos de Venda
                          </h4>
                          <p className={`text-xs sm:text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
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
                              <span className="text-xs font-black block">{opt.titulo}</span>
                              <span className={`text-[11px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {opt.desc}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                      <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Alterações salvas automaticamente na loja.
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          navegarParaConfigurarEtapa(
                            'tipos_venda',
                            'Tabelas de Preço e Tipos de Venda',
                            '/config?tab=tipos-venda'
                          )
                        }
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer ${
                          isDark
                            ? 'border-slate-700 hover:bg-slate-800 text-slate-200'
                            : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <Sliders className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Configurar Regras de Desconto</span>
                      </button>
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
                          <h4 className="font-black text-sm sm:text-base">
                            5. Formas de Pagamento e Taxas de Maquininha
                          </h4>
                          <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            Cadastre Pix, Dinheiro, Cartões e taxas das operadoras para calcular seu lucro líquido real nas vendas.
                          </p>
                        </div>
                      </div>
                      {renderBadgeStatus(Boolean(etapaPagamentos?.concluido))}
                    </div>

                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() =>
                          navegarParaConfigurarEtapa(
                            'formas_pagamento',
                            'Formas de Pagamento e Taxas de Maquininha',
                            '/config?tab=pagamentos'
                          )
                        }
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                      >
                        <span>Configurar Pagamentos</span>
                        <ArrowRight className="w-3.5 h-3.5" />
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
                          <h4 className="font-black text-sm sm:text-base">
                            6. Fluxo de Status dos Pedidos (Kanban)
                          </h4>
                          <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            Defina quais etapas opcionais aparecem no seu painel de pedidos (os status Pendente, Confirmado, Cancelado e Concluído são padrão).
                          </p>
                        </div>
                      </div>
                      {renderBadgeStatus(Boolean(etapaStatusPedidos?.concluido))}
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
                                <span className="text-xs font-bold block truncate">{item.titulo}</span>
                                <span className={`text-[11px] block truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                  {item.descricao}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`text-[11px] font-semibold ${
                                  ativo
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-slate-500 dark:text-slate-400'
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
                            <h4 className="font-black text-sm sm:text-base">
                              7. Categorias e Unidades de Medida
                            </h4>
                            {statusCompleto?.setup.unidades_conferidas && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <Check className="w-3 h-3" />
                                Unidades conferidas
                              </span>
                            )}
                          </div>
                          <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
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
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm disabled:opacity-60"
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
                        className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                          isDark
                            ? 'border-slate-700 hover:bg-slate-800 text-slate-200'
                            : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <Ruler className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Conferir Unidades</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card 8: Metas da Loja (Cockpit Executivo F1) */}
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
                          <h4 className="font-black text-sm sm:text-base">
                            8. Metas da Loja (Cockpit Executivo F1)
                          </h4>
                          <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            Defina suas metas de faturamento, pedidos e lucro para alimentar os velocímetros em tempo real do Dashboard.
                          </p>
                        </div>
                      </div>
                      {renderBadgeStatus(Boolean(etapaMetas?.concluido))}
                    </div>

                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() =>
                          navegarParaConfigurarEtapa(
                            'metas_loja',
                            'Metas da Loja (Cockpit Executivo F1)',
                            '/config?tab=metas'
                          )
                        }
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                      >
                        <span>Definir Minhas Metas</span>
                        <ArrowRight className="w-3.5 h-3.5" />
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
                      <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        Bloco 2 de 2
                      </span>
                      <h3 className="text-base sm:text-lg font-black">
                        Módulos e Integrações Opcionais (Sob Demanda)
                      </h3>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Escolha apenas o que faz sentido para sua loja hoje. O Passo a Passo Guiado mostrará somente os módulos selecionados.
                      </p>
                    </div>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
                      {statusCompleto?.etapasOpcionaisAtivas.length ?? 0} de 11 escolhidos
                    </span>
                  </div>

                  <div className="space-y-3.5">
                    {MODULOS_OPCIONAIS_DEFINICAO.map((modulo, idx) => {
                      const etapaStatus = obterEtapaPorId(modulo.id);
                      const querUsar = Boolean(statusCompleto?.setup[modulo.chaveInteresse]);
                      const configurado = Boolean(etapaStatus?.concluido);
                      const Icone = modulo.icone;
                      const emSalvamento = salvandoChaveInline === modulo.id;

                      return (
                        <div
                          key={modulo.id}
                          ref={(el) => {
                            cardRefs.current[modulo.id] = el;
                          }}
                          className={classeCardBase(modulo.id, querUsar && configurado)}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                <Icone className="w-5 h-5" />
                              </div>
                              <div className="space-y-1">
                                <h4 className="font-black text-sm sm:text-base">
                                  {idx + 1}. {modulo.titulo}
                                </h4>
                                <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                  {modulo.descricaoComercial}
                                </p>
                              </div>
                            </div>

                            {querUsar && renderBadgeStatus(configurado, 'Aguardando configuração')}
                          </div>

                          {/* Escolha Sim / Não + Ações */}
                          <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={emSalvamento}
                                onClick={() => handleSelecionarInteresseModulo(modulo, true)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                                  querUsar
                                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                                    : isDark
                                    ? 'bg-slate-900 border-slate-700 text-slate-300 hover:border-emerald-500/50'
                                    : 'bg-white border-slate-300 text-slate-700 hover:border-emerald-500/50'
                                }`}
                              >
                                {querUsar && <Check className="w-3.5 h-3.5" />}
                                <span>Sim, quero usar</span>
                              </button>

                              <button
                                type="button"
                                disabled={emSalvamento}
                                onClick={() => handleSelecionarInteresseModulo(modulo, false)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                                  !querUsar
                                    ? isDark
                                      ? 'bg-slate-800 border-slate-600 text-white'
                                      : 'bg-slate-200 border-slate-400 text-slate-900'
                                    : isDark
                                    ? 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                                    : 'bg-white border-slate-300 text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                Não preciso agora
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
                                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                                    isDark
                                      ? 'border-slate-700 hover:bg-slate-800 text-sky-400'
                                      : 'border-slate-300 hover:bg-slate-100 text-sky-700'
                                  }`}
                                >
                                  <HelpCircle className="w-3.5 h-3.5" />
                                  <span>Ver Tutorial</span>
                                </button>
                              )}
                            </div>

                            {querUsar && (
                              <button
                                type="button"
                                onClick={() =>
                                  navegarParaConfigurarEtapa(
                                    modulo.id,
                                    modulo.titulo,
                                    modulo.rotaDestino
                                  )
                                }
                                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                              >
                                <span>Configurar Agora</span>
                                <ArrowRight className="w-3.5 h-3.5" />
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
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>
                Você pode reabrir este assistente a qualquer momento em Configurações.
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleAdiar}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                }`}
              >
                Continuar depois
              </button>

              <button
                type="button"
                disabled={salvandoConclusao || carregando}
                onClick={handleConcluirQuestionario}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-md shadow-emerald-500/20"
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
    </>
  );
};
