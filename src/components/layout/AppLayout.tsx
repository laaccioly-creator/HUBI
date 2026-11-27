import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  ShoppingCart,
  Package,
  Users,
  DollarSign,
  BarChart3,
  Settings,
  Sparkles,
  Layers,
  ExternalLink,
  Store,
  Bell,
  X,
  LogOut,
  Loader2,
  UserCheck,
  ChevronDown,
  Check,
  Globe,
  Receipt,
  Ticket,
  Sun,
  Moon,
  Laptop,
  Calendar,
  LayoutDashboard,
  Building2,
  Plus,
  AlertTriangle,
  Wallet,
  ArrowLeft,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme, ModoTema } from '../../contexts/ThemeContext';
import { useMenu } from '../../contexts/MenuContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { overlayStackService } from '../../services/overlayStackService';
import { useDataOperacao } from '../../contexts/DataOperacaoContext';
import { supabase } from '../../lib/supabase';
import { audioService } from '../../services/audioService';
import { CadastroPdv } from '../CadastroPdv';
import { ChatAjudaIA } from '../ChatAjudaIA';
import { DesktopAppPrompt, DesktopInstallButton } from '../DesktopAppPrompt';
import { MobileMenuDrawer } from './MobileMenuDrawer';
import { ModalSeletorDataOperacao } from '../ModalSeletorDataOperacao';
import { ModalAdicionarLoja } from '../lojas/ModalAdicionarLoja';
import { BannerDataOperacao } from '../BannerDataOperacao';
import { TelaBloqueioAssinatura } from '../assinatura/TelaBloqueioAssinatura';
import { useAssinaturaStatus } from '../../hooks/useAssinaturaStatus';
import { useSystemBillingConfig } from '../../hooks/useSystemBillingConfig';
import { BarraProgressoPublicacaoMassaMl } from '../mercadolivre/BarraProgressoPublicacaoMassaMl';
import { ModalPublicarMassaMl } from '../mercadolivre/ModalPublicarMassaMl';
import { BarraProgressoPublicacaoMassaShopee } from '../shopee/BarraProgressoPublicacaoMassaShopee';
import { ModalPublicarMassaShopee } from '../shopee/ModalPublicarMassaShopee';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { logger } from '../../services/loggerService';
import { UsuarioLoja } from '../../types';
import { ModalRecargaWhatsapp } from '../configuracoes/ModalRecargaWhatsapp';
import { formatarMoeda as formatCurrency } from '../../utils/formatters';
import { ModalQuestionarioOnboarding } from '../onboarding/ModalQuestionarioOnboarding';
import {
  avaliarProgressoCompletoOnboarding,
  obterRetornoOnboardingAtivo,
  consumirRetornoOnboarding,
  limparRetornoOnboarding,
  EVENTO_RETORNO_ONBOARDING,
  EVENTO_ABRIR_QUESTIONARIO,
  EVENTO_ONBOARDING_SALVO,
  EtapaOnboardingId,
  RetornoOnboardingEstado,
} from '../../services/onboardingSetupService';

const formatadorBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const AppLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const origemVendas = searchParams.get('origem') === 'sales';
  const { loja, usuario, usuarioLogado, session, carregando, desconectarPdv, selecionarUsuario, lojasDisponiveis, selecionarLoja, recarregarDadosLoja, setLoja } = useAuth();
  const { status: statusAssinatura, diasRestantesTrial, confirmandoRetornoPagamento } = useAssinaturaStatus();
  const {
    valorMensalAnual,
    isLoading: carregandoConfigCobranca,
    error: erroConfigCobranca,
  } = useSystemBillingConfig();
  const ehTrial = statusAssinatura === 'TRIAL_ATIVO' || (typeof diasRestantesTrial === 'number' && diasRestantesTrial > 0);
  const [modalAssinaturaManualAberto, setModalAssinaturaManualAberto] = useState<boolean>(false);
  const [modalRecargaWhatsappAberto, setModalRecargaWhatsappAberto] = useState<boolean>(false);
  const [bannerSaldoWhatsappDispensado, setBannerSaldoWhatsappDispensado] = useState<boolean>(false);
  const permissions = usePermissions();
  const { verificarSaidaComConfirmacao } = useFeedbackModal();
  const { tema, setTema } = useTheme();
  const { mobileMenuOpen, setMobileMenuOpen } = useMenu();
  const { dataOperacaoFormatada, modoSimulacaoAtivo, abrirModal: abrirModalData } = useDataOperacao();
  const [pedidosConfirmadosCount, setPedidosConfirmadosCount] = useState<number>(0);
  const [maisMenuOpen, setMaisMenuOpen] = useState<boolean>(false);
  const [userMenuOpen, setUserMenuOpen] = useState<boolean>(false);
  const [storeDropdownOpen, setStoreDropdownOpen] = useState<boolean>(false);
  const [mobileStoreDropdownOpen, setMobileStoreDropdownOpen] = useState<boolean>(false);
  const [modalAdicionarLojaAberto, setModalAdicionarLojaAberto] = useState<boolean>(false);
  const [listaUsuariosLoja, setListaUsuariosLoja] = useState<UsuarioLoja[]>([]);
  const [modalQuestionarioOnboardingAberto, setModalQuestionarioOnboardingAberto] = useState<boolean>(false);
  const [etapaDestaqueOnboarding, setEtapaDestaqueOnboarding] = useState<EtapaOnboardingId | null>(null);
  const [retornoOnboardingAtivo, setRetornoOnboardingAtivo] = useState<RetornoOnboardingEstado | null>(() =>
    obterRetornoOnboardingAtivo()
  );
  const [etapaRecemSalvaOnboarding, setEtapaRecemSalvaOnboarding] = useState<boolean>(false);
  const verificouPrimeiroAcessoRef = useRef<string | null>(null);
  const timerRetornoAutomaticoRef = useRef<number | null>(null);

  const podeTrocarLoja = permissions.ehOwner || Boolean(usuario?.pode_trocar_loja || usuarioLogado?.pode_trocar_loja);

  const nomeExibicaoUsuario = useMemo(() => {
    const nomeOperador = (usuarioLogado?.nome || usuario?.nome_completo || '').trim();
    const metaNome = (
      session?.user?.user_metadata?.nome_completo ||
      session?.user?.user_metadata?.full_name ||
      session?.user?.user_metadata?.name ||
      ''
    ).trim();
    const salvoReal = (localStorage.getItem('hubi_user_real_name') || '').trim();
    const ehGenerico = (n: string) =>
      !n || ['proprietario', 'proprietário', 'operador', 'administrador', 'admin', 'user', 'owner'].includes(n.toLowerCase());

    if (!ehGenerico(nomeOperador)) return nomeOperador;
    if (!ehGenerico(metaNome)) return metaNome;
    if (!ehGenerico(salvoReal)) return salvoReal;
    return nomeOperador || metaNome || salvoReal || 'Operador';
  }, [usuarioLogado?.nome, usuario?.nome_completo, session?.user?.user_metadata]);

  const inicialAvatar = (nomeExibicaoUsuario || 'O').trim().slice(0, 1).toUpperCase();

  const maisMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const storeDropdownRef = useRef<HTMLDivElement>(null);
  const mobileStoreDropdownRef = useRef<HTMLDivElement>(null);

  const handleNavegacaoMenu = (path: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    verificarSaidaComConfirmacao(() => {
      window.dispatchEvent(new CustomEvent('hubi_navegacao_menu', { detail: { path } }));
      if (path === '/config' || path === '/configuracoes') {
        window.dispatchEvent(new CustomEvent('hubi_reset_configuracoes'));
      }
      navigate(path);
    });
  };

  // Manipulador global da tecla ESC (Desktop Stack) e Popstate (Mobile Voltar)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mobileMenuOpen) {
          setMobileMenuOpen(false);
          return;
        }
        if (maisMenuOpen) {
          setMaisMenuOpen(false);
          return;
        }
        if (userMenuOpen) {
          setUserMenuOpen(false);
          return;
        }
        if (storeDropdownOpen) {
          setStoreDropdownOpen(false);
          return;
        }
        if (mobileStoreDropdownOpen) {
          setMobileStoreDropdownOpen(false);
          return;
        }

        // Nível 1 (Overlays): Fecha o overlay no topo da pilha (modais, drawers, popovers)
        const fechouOverlay = overlayStackService.handleEscape();
        if (fechouOverlay) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Nível 2 (Telas / Submenus): Se não houver nenhum modal aberto, retrocede rota anterior
        if (location.pathname !== '/pos' && location.pathname !== '/dashboard' && location.pathname !== '/') {
          e.preventDefault();
          verificarSaidaComConfirmacao(() => {
            if (location.pathname.startsWith('/products/')) {
              navigate('/products');
            } else if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/pos');
            }
          });
        }
      }
    };

    const handlePopState = (e: PopStateEvent) => {
      // Mobile: Intercepta o botão voltar físico/virtual para fechar modal antes de descarregar a tela
      const fechouOverlay = overlayStackService.handlePopstate();
      if (fechouOverlay) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [mobileMenuOpen, maisMenuOpen, userMenuOpen, storeDropdownOpen, mobileStoreDropdownOpen, location.pathname, navigate, verificarSaidaComConfirmacao]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (maisMenuRef.current && !maisMenuRef.current.contains(event.target as Node)) {
        setMaisMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (storeDropdownRef.current && !storeDropdownRef.current.contains(event.target as Node)) {
        setStoreDropdownOpen(false);
      }
      if (mobileStoreDropdownRef.current && !mobileStoreDropdownRef.current.contains(event.target as Node)) {
        setMobileStoreDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Ocultar barra do navegador no Mobile em todas as telas
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && (
      window.innerWidth < 768 ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    );
    if (!isMobile) return;

    // Rolagem suave para colapsar barra de URL
    const hideAddressBar = () => {
      if (window.scrollY === 0) {
        window.scrollTo(0, 1);
      }
    };
    setTimeout(hideAddressBar, 300);

    const handleFirstTouch = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
      if (!isStandalone && document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      window.removeEventListener('touchstart', handleFirstTouch);
    };

    window.addEventListener('touchstart', handleFirstTouch, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleFirstTouch);
    };
  }, []);

  // Abertura automática do Questionário de Implantação Inicial no 1º acesso da loja
  useEffect(() => {
    if (
      carregando ||
      !loja?.id ||
      !permissions.podeAcessarConfig ||
      confirmandoRetornoPagamento ||
      statusAssinatura === 'BLOQUEADO'
    ) {
      return;
    }

    if (verificouPrimeiroAcessoRef.current === loja.id) {
      return;
    }

    if (obterRetornoOnboardingAtivo()) {
      verificouPrimeiroAcessoRef.current = loja.id;
      return;
    }

    try {
      if (sessionStorage.getItem(`hubi_onboarding_adiado_${loja.id}`) === 'true') {
        verificouPrimeiroAcessoRef.current = loja.id;
        return;
      }
    } catch {
      // Silencioso caso sessionStorage esteja bloqueado
    }

    let cancelado = false;
    verificouPrimeiroAcessoRef.current = loja.id;

    avaliarProgressoCompletoOnboarding(loja.id, {
      sincronizarDetectados: false,
      lojaFallback: loja,
    })
      .then((status) => {
        if (
          !cancelado &&
          !status.setup.id.startsWith('local-') &&
          !status.setup.questionario_respondido &&
          !status.tudoPronto
        ) {
          setEtapaDestaqueOnboarding(null);
          setModalQuestionarioOnboardingAberto(true);
        }
      })
      .catch(() => {
        // Degradação graciosa em caso de erro transitório
      });

    return () => {
      cancelado = true;
    };
  }, [
    loja?.id,
    carregando,
    permissions.podeAcessarConfig,
    confirmandoRetornoPagamento,
    statusAssinatura,
  ]);

  // Listeners globais do fluxo "Ida e Volta" do Questionário de Implantação
  useEffect(() => {
    const handleRetornoAlterado = () => {
      setRetornoOnboardingAtivo(obterRetornoOnboardingAtivo());
      setEtapaRecemSalvaOnboarding(false);
    };

    const handleAbrirQuestionario = (evento: Event) => {
      const customEvent = evento as CustomEvent<{ etapaDestaque?: EtapaOnboardingId | null }>;
      setEtapaDestaqueOnboarding(customEvent.detail?.etapaDestaque ?? null);
      setModalQuestionarioOnboardingAberto(true);
    };

    const handleOnboardingSalvo = () => {
      const retorno = obterRetornoOnboardingAtivo();
      if (!retorno) return;
      setEtapaRecemSalvaOnboarding(true);

      if (timerRetornoAutomaticoRef.current !== null) {
        window.clearTimeout(timerRetornoAutomaticoRef.current);
      }

      timerRetornoAutomaticoRef.current = window.setTimeout(() => {
        timerRetornoAutomaticoRef.current = null;
        const consumido = consumirRetornoOnboarding();
        setRetornoOnboardingAtivo(null);
        setEtapaRecemSalvaOnboarding(false);
        if (consumido) {
          setEtapaDestaqueOnboarding(consumido.etapaId);
          setModalQuestionarioOnboardingAberto(true);
        }
      }, 900);
    };

    window.addEventListener(EVENTO_RETORNO_ONBOARDING, handleRetornoAlterado);
    window.addEventListener(EVENTO_ABRIR_QUESTIONARIO, handleAbrirQuestionario);
    window.addEventListener(EVENTO_ONBOARDING_SALVO, handleOnboardingSalvo);

    return () => {
      window.removeEventListener(EVENTO_RETORNO_ONBOARDING, handleRetornoAlterado);
      window.removeEventListener(EVENTO_ABRIR_QUESTIONARIO, handleAbrirQuestionario);
      window.removeEventListener(EVENTO_ONBOARDING_SALVO, handleOnboardingSalvo);
      if (timerRetornoAutomaticoRef.current !== null) {
        window.clearTimeout(timerRetornoAutomaticoRef.current);
      }
    };
  }, []);

  const handleVoltarParaQuestionario = () => {
    if (timerRetornoAutomaticoRef.current !== null) {
      window.clearTimeout(timerRetornoAutomaticoRef.current);
      timerRetornoAutomaticoRef.current = null;
    }
    const consumido = consumirRetornoOnboarding();
    setRetornoOnboardingAtivo(null);
    setEtapaRecemSalvaOnboarding(false);
    setEtapaDestaqueOnboarding(consumido?.etapaId ?? null);
    setModalQuestionarioOnboardingAberto(true);
  };

  const handleDispensarBannerRetorno = () => {
    if (timerRetornoAutomaticoRef.current !== null) {
      window.clearTimeout(timerRetornoAutomaticoRef.current);
      timerRetornoAutomaticoRef.current = null;
    }
    limparRetornoOnboarding();
    setRetornoOnboardingAtivo(null);
    setEtapaRecemSalvaOnboarding(false);
  };

  useEffect(() => {
    if (!loja?.id) return;

    logger.definirContexto({
      lojaId: loja.id,
      organizacaoId: loja.organizacao_id,
      usuarioId: usuario?.id,
    });

    const carregarConfirmados = async () => {
      let query = supabase
        .from('pedidos')
        .select('*', { count: 'exact', head: true })
        .eq('loja_id', loja.id)
        .eq('status', 'confirmado');

      // Se for operador comum restrito, conta apenas seus pedidos confirmados
      if (usuario && !permissions.podeVerTransacoesOutros) {
        query = query.eq('vendedor_id', usuario.id);
      }
      
      const { count } = await query;
      setPedidosConfirmadosCount(count || 0);
    };

    carregarConfirmados();

    // Carregar usuários da loja para alternador de operador
    const carregarUsuariosLoja = async () => {
      const { data: users } = await supabase
        .from('usuarios_loja')
        .select('*')
        .eq('loja_id', loja.id)
        .eq('ativo', true)
        .order('criado_em', { ascending: true });

      if (users) {
        setListaUsuariosLoja(users);
      }
    };
    carregarUsuariosLoja();

    const canalNome = `pedidos_confirmados_${loja.id}_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(canalNome)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos', filter: `loja_id=eq.${loja.id}` },
        (payload) => {
          const novo = payload.new as any;
          const antigo = payload.old as any;

          // Se o usuário só pode ver as próprias transações, checa se o pedido pertence a ele
          if (usuario && !permissions.podeVerTransacoesOutros && novo?.vendedor_id && novo.vendedor_id !== usuario.id) {
            return;
          }

          // Se acabou de virar confirmado ou entrou como confirmado
          if (novo?.status === 'confirmado' && antigo?.status !== 'confirmado') {
            audioService.playNewOrderSound();
          }

          carregarConfirmados();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loja?.id, usuario?.id, permissions.podeVerTransacoesOutros]);

  const isDark = tema === 'dark';

  // Se estiver carregando os dados do PDV
  if (carregando && (loja || lojasDisponiveis.length === 0)) {
    return (
      <div className={`h-screen w-screen flex flex-col items-center justify-center space-y-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <img
          src="/logo.png?v=2"
          alt="Rubi"
          className="w-16 h-16 rounded-2xl object-contain animate-pulse drop-shadow-2xl"
        />
        <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-900 font-medium'}`}>
          <Loader2 className={`w-4 h-4 animate-spin ${isDark ? 'text-emerald-400' : 'text-slate-900'}`} />
          <span>Carregando Sistema Rubi...</span>
        </div>
      </div>
    );
  }

  // Se NÃO houver loja identificada, abrir tela de cadastro / login de PDV obrigatório
  if (!loja) {
    return <CadastroPdv />;
  }

  // Se usuário estiver bloqueado para uso em celular pessoal
  if (permissions.bloqueadoPorDispositivoMovel) {
    return (
      <div className={`h-screen w-screen flex flex-col items-center justify-center p-6 text-center space-y-5 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-400 flex items-center justify-center shadow-2xl">
          <X className="w-10 h-10" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className={`text-xl font-black ${isDark ? 'text-slate-100' : 'text-black'}`}>Acesso Mobile Não Autorizado</h2>
          <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-900'}`}>
            Olá, <strong className={isDark ? 'text-slate-200' : 'text-black'}>{nomeExibicaoUsuario}</strong>. Seu usuário não possui permissão para acessar o sistema através de celular pessoal.
          </p>
          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-700'}`}>
            Utilize um computador autorizado da loja ou contate o administrador para solicitar a liberação do acesso móvel.
          </p>
        </div>
        <button
          type="button"
          onClick={desconectarPdv}
          className={`px-6 py-3 rounded-xl text-xs font-bold border transition flex items-center gap-2 cursor-pointer ${
            isDark
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              : 'hubi-btn-neutral bg-slate-100 hover:bg-slate-200 text-black border-slate-300 font-semibold'
          }`}
        >
          <LogOut className="w-4 h-4 text-rose-500 dark:text-rose-400" />
          <span>Trocar Operador / Sair</span>
        </button>
      </div>
    );
  }

  const catalogUrl = loja?.slug_catalogo ? `/catalog/${loja.slug_catalogo}` : '/catalog';

  // 12 BOTÕES DISTRIBUÍDOS EM 2 FILEIRAS DE 6 BOTÕES CADA (ALINHADOS E COM FONTE BRANCA)
  const ehGestor = permissions.ehOwner || permissions.ehAdmin || permissions.ehGerente;

  const row1Buttons = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
      badge: undefined,
      visivel: permissions.podeAcessarDashboard
    },
    {
      name: 'Vender (PDV)',
      path: '/pos',
      icon: ShoppingCart,
      badge: undefined,
      visivel: permissions.podeAcessarPdv
    },
    {
      name: 'Pedidos',
      path: '/orders',
      icon: ShoppingBag,
      badge: undefined,
      visivel: permissions.podeAcessarPedidos
    },
    {
      name: 'Vendas',
      path: '/sales',
      icon: Receipt,
      badge: undefined,
      visivel: permissions.podeAcessarVendas
    },
    {
      name: 'Agenda',
      path: '/agenda',
      icon: Calendar,
      badge: undefined,
      visivel: loja?.trabalha_com_agenda === true
    },
    {
      name: 'Produtos & Serviços',
      path: '/products',
      icon: Package,
      badge: undefined,
      visivel: permissions.podeAcessarProdutos
    },
    {
      name: 'Clientes',
      path: '/customers',
      icon: Users,
      badge: undefined,
      visivel: permissions.podeAcessarClientes
    }
  ].filter(b => b.visivel);

  const row2Buttons = [
    {
      name: 'Finanças & Caixa',
      path: '/finances',
      icon: DollarSign,
      badge: undefined,
      visivel: permissions.podeAcessarFinancas
    },
    {
      name: 'Estatísticas',
      path: '/analytics',
      icon: BarChart3,
      badge: undefined,
      visivel: permissions.podeAcessarAnalytics
    },
    {
      name: 'Cupons de Desconto',
      path: '/coupons',
      icon: Ticket,
      badge: undefined,
      visivel: permissions.podeAcessarCupons
    },
    {
      name: 'Catálogo Online',
      path: '/catalog-config',
      icon: Globe,
      badge: undefined,
      visivel: permissions.podeAcessarCatalogo
    },
    {
      name: 'Cadastros & Tabelas',
      path: '/auxiliares',
      icon: Layers,
      badge: undefined,
      visivel: permissions.podeAcessarAuxiliares
    },
    {
      name: 'Colaboradores',
      path: '/users',
      icon: UserCheck,
      badge: undefined,
      visivel: permissions.podeAcessarUsuarios
    },
    {
      name: 'Configurações',
      path: '/config',
      icon: Settings,
      badge: undefined,
      visivel: permissions.podeAcessarConfig
    }
  ].filter(b => b.visivel);

  const todosOsBotoes = [...row1Buttons, ...row2Buttons];
  const isPosRoute = location.pathname === '/pos' || location.pathname === '/';
  const isDashboardRoute = location.pathname === '/dashboard';

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden ${isDark ? 'bg-slate-950 text-slate-100' : (isDashboardRoute || isPosRoute) ? 'bg-slate-100 text-[#0F172A]' : 'bg-[#F8FAFC] text-[#0F172A]'}`}>
      {/* BANNER GLOBAL DE DATA OPERACIONAL SIMULADA */}
      <BannerDataOperacao />

      {/* BANNER / BOTÃO DE INSTALAÇÃO DO APP DESKTOP */}
      <DesktopAppPrompt />

      {/* PRIMEIRA LINHA GLOBAL MOBILE: LOJA ATIVA (COM TROCA RÁPIDA) + ALTERNADOR DE TEMA */}
      <div
        className={`md:hidden h-11 px-3 border-b flex items-center justify-between gap-2 shrink-0 relative z-40 select-none ${
          isDark
            ? 'bg-slate-950 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="relative min-w-0 flex-1" ref={mobileStoreDropdownRef}>
          {podeTrocarLoja && lojasDisponiveis.length > 1 ? (
            <button
              type="button"
              onClick={() => setMobileStoreDropdownOpen(prev => !prev)}
              className={`inline-flex items-center gap-1.5 max-w-full py-1 px-1.5 -ml-1.5 rounded-xl transition cursor-pointer ${
                isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-100'
              }`}
              title="Trocar de loja"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="font-black text-xs tracking-tight truncate">
                {loja?.nome_fantasia || 'Rubi PDV'}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                } ${mobileStoreDropdownOpen ? 'rotate-180' : ''}`}
              />
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 max-w-full py-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="font-black text-xs tracking-tight truncate">
                {loja?.nome_fantasia || 'Rubi PDV'}
              </span>
            </div>
          )}

          {podeTrocarLoja && lojasDisponiveis.length > 1 && mobileStoreDropdownOpen && (
            <div
              className={`absolute top-full left-0 mt-1.5 w-64 rounded-2xl p-1.5 z-50 space-y-0.5 border shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-white'
                  : 'bg-white border-slate-300 text-black'
              }`}
            >
              <div
                className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b ${
                  isDark ? 'text-slate-400 border-slate-800' : 'text-slate-600 border-slate-200'
                }`}
              >
                Lojas da Organização
              </div>
              <div className="max-h-56 overflow-y-auto space-y-0.5 py-1">
                {lojasDisponiveis.map((l) => {
                  const ativa = l.id === loja?.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={async () => {
                        setMobileStoreDropdownOpen(false);
                        if (!ativa) {
                          await selecionarLoja(l.id);
                          await recarregarDadosLoja();
                        }
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition text-left cursor-pointer ${
                        ativa
                          ? isDark
                            ? 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30'
                            : 'bg-emerald-50 text-emerald-900 font-bold border border-emerald-300'
                          : isDark
                          ? 'text-slate-200 hover:bg-slate-800'
                          : 'text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Building2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            ativa ? 'text-emerald-500' : 'text-slate-400'
                          }`}
                        />
                        <span className="truncate">{l.nome_fantasia}</span>
                      </div>
                      {ativa && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setTema(isDark ? 'light' : 'dark')}
          className={`p-1.5 rounded-xl border transition flex items-center justify-center cursor-pointer shrink-0 ${
            isDark
              ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-amber-400'
              : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-indigo-600'
          }`}
          title={isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
          aria-label={isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-600" />
          )}
        </button>
      </div>

      {/* TOP HEADER DESKTOP (BARRA SUPERIOR EM 2 FILEIRAS DE 6 BOTÕES) */}
      <header className={`hidden md:block border-b z-40 relative shrink-0 shadow-xs ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-[#E2E8F0]'}`}>
        <div className="px-3 md:px-5 py-2 flex items-center justify-between gap-4">
          {/* IDENTIFICAÇÃO DA LOJA E INFORMATIVO DE TRIAL FIXO COM DROPDOWN DE TROCA RÁPIDA */}
          <div className="relative shrink-0 min-w-52 lg:min-w-64 max-w-[310px]" ref={storeDropdownRef}>
            <button
              type="button"
              onClick={podeTrocarLoja ? () => setStoreDropdownOpen(prev => !prev) : undefined}
              className={`flex items-center gap-2.5 group text-left min-w-0 w-full p-1 -m-1 rounded-xl transition ${
                podeTrocarLoja ? 'cursor-pointer hover:bg-slate-500/5' : 'cursor-default'
              }`}
              title={podeTrocarLoja ? "Clique para alternar de filial / loja" : (loja?.nome_fantasia || "Rubi PDV")}
            >
              {loja?.nome_fantasia ? (
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center font-black text-white shadow-lg shadow-emerald-500/20 text-sm shrink-0 transition ${
                  podeTrocarLoja ? 'group-hover:scale-105' : ''
                }`}>
                  {loja.nome_fantasia.slice(0, 2).toUpperCase()}
                </div>
              ) : (
                <img
                  src="/logo.png?v=2"
                  alt="Rubi"
                  className={`w-9 h-9 rounded-xl object-contain shrink-0 transition ${
                    podeTrocarLoja ? 'group-hover:scale-105' : ''
                  }`}
                />
              )}
              <div className="hidden sm:block min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h1 className={`font-bold text-xs lg:text-sm truncate max-w-[130px] lg:max-w-[160px] leading-tight transition ${
                    isDark ? 'text-slate-100' : 'text-[#0F172A]'
                  } ${podeTrocarLoja ? 'group-hover:text-emerald-500' : ''}`}>
                    {loja?.nome_fantasia || 'Rubi PDV'}
                  </h1>
                  {podeTrocarLoja && (
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 transition shrink-0 ${storeDropdownOpen ? 'rotate-180' : ''}`} />
                  )}
                </div>
                {ehTrial ? (
                  <div className="flex flex-col mt-0.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      {carregandoConfigCobranca ? (
                        <span className="inline-block h-3.5 w-20 rounded bg-amber-500/20 animate-pulse" />
                      ) : (
                        <span className="text-xs lg:text-[13px] font-extrabold text-amber-500 whitespace-nowrap tracking-tight">
                          Restam {diasRestantesTrial} {diasRestantesTrial === 1 ? 'dia' : 'dias'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setModalAssinaturaManualAberto(true)}
                        className="px-2.5 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] lg:text-[11px] uppercase tracking-wider transition shadow-xs cursor-pointer active:scale-95"
                      >
                        Assinar
                      </button>
                    </div>
                    {carregandoConfigCobranca ? (
                      <span className="inline-block h-3 w-32 rounded bg-slate-500/20 animate-pulse mt-1" />
                    ) : !erroConfigCobranca && valorMensalAnual > 0 ? (
                      <span className="text-[10px] lg:text-[11px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap mt-0.5">
                        Garanta por apenas {formatadorBRL.format(valorMensalAnual)}/mês
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[9px] text-emerald-500 font-semibold uppercase tracking-wider">Conectado</span>
                  </div>
                )}
              </div>
            </button>

            {/* Menu Suspenso de Troca Rápida de Loja */}
            {podeTrocarLoja && storeDropdownOpen && (
              <div className={`absolute top-full left-0 mt-2 w-72 rounded-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150 border shadow-2xl ${
                isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-[#E2E8F0] text-slate-900'
              }`}>
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200/50 dark:border-slate-800">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Lojas da Organização
                  </span>
                  {permissions.ehOwner && (
                    <button
                      type="button"
                      onClick={() => {
                        setStoreDropdownOpen(false);
                        setModalAdicionarLojaAberto(true);
                      }}
                      className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 hover:text-emerald-400 transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Nova Filial</span>
                    </button>
                  )}
                </div>

                <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar py-1">
                  {lojasDisponiveis.map((l) => {
                    const ativa = l.id === loja?.id;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={async () => {
                          setStoreDropdownOpen(false);
                          if (!ativa) {
                            await selecionarLoja(l.id);
                            await recarregarDadosLoja();
                          }
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition text-left cursor-pointer ${
                          ativa
                            ? 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30'
                            : isDark
                            ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Building2 className={`w-3.5 h-3.5 shrink-0 ${ativa ? 'text-emerald-400' : 'text-slate-400'}`} />
                          <span className="truncate">{l.nome_fantasia}</span>
                        </div>
                        {ativa && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* GRID CENTRAL EM EXATAMENTE 2 FILEIRAS BALANCEADAS */}
          <nav className="flex flex-col gap-1.5 flex-1 max-w-5xl min-w-0 justify-center">
            {/* FILEIRA 1 */}
            <div className={`grid gap-1 lg:gap-1.5 w-full ${row1Buttons.length <= 6 ? 'grid-cols-6' : 'grid-cols-7'}`}>
              {row1Buttons.map((item) => {
                const Icon = item.icon;
                const isActive = (() => {
                  if (item.path === '/pos') {
                    return location.pathname === '/pos' || location.pathname === '/';
                  }
                  if (origemVendas) {
                    if (item.path === '/sales') return true;
                    if (item.path === '/orders') return false;
                  }
                  return location.pathname.startsWith(item.path);
                })();

                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={(e) => handleNavegacaoMenu(item.path, e)}
                    className={`flex items-center justify-center gap-1 lg:gap-1.5 px-1.5 lg:px-2 py-1.5 rounded-xl text-[11px] lg:text-xs font-semibold transition-all duration-150 text-center select-none relative truncate cursor-pointer ${
                      isActive
                        ? isDark
                          ? 'bg-slate-800/90 hover:bg-slate-800 text-white font-bold border-2 border-emerald-400 shadow-xs translate-y-[1px]'
                          : 'bg-slate-100 hover:bg-slate-200/90 border border-emerald-500/50 ring-1 ring-emerald-500/30 shadow-inner translate-y-[1px] text-slate-950 font-bold'
                        : isDark
                        ? 'bg-slate-800/80 text-slate-100 hover:bg-slate-700/80 hover:text-white border-2 border-slate-400 shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 border border-slate-300/80 text-slate-900 font-semibold shadow-xs'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.name}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* FILEIRA 2 (7 BOTÕES) */}
            <div className="grid grid-cols-7 gap-1 lg:gap-1.5 w-full">
              {row2Buttons.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.path);

                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={(e) => handleNavegacaoMenu(item.path, e)}
                    className={`flex items-center justify-center gap-1 lg:gap-1.5 px-1 lg:px-1.5 py-1.5 rounded-xl text-[11px] lg:text-xs font-semibold transition-all duration-150 text-center select-none relative truncate cursor-pointer ${
                      isActive
                        ? isDark
                          ? 'bg-slate-800/90 hover:bg-slate-800 text-white font-bold border-2 border-emerald-400 shadow-xs translate-y-[1px]'
                          : 'bg-slate-100 hover:bg-slate-200/90 border border-emerald-500/50 ring-1 ring-emerald-500/30 shadow-inner translate-y-[1px] text-slate-950 font-bold'
                        : isDark
                        ? 'bg-slate-800/80 text-slate-100 hover:bg-slate-700/80 hover:text-white border-2 border-slate-400 shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 border border-slate-300/80 text-slate-900 font-semibold shadow-xs'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* LADO DIREITO: MENU DO USUÁRIO & ALTERNADOR DE TEMA */}
          <div className="flex items-center gap-1.5 shrink-0 justify-end">
            {/* Alternador Rápido de Tema (Sol / Lua) */}
            <button
              type="button"
              onClick={() => setTema(isDark ? 'light' : 'dark')}
              className={`p-2 rounded-xl transition flex items-center justify-center cursor-pointer text-xs shadow-xs ${
                isDark
                  ? 'bg-slate-800/80 hover:bg-slate-700/80 text-amber-400 border-2 border-slate-400'
                  : 'bg-slate-100 hover:bg-slate-200 text-indigo-600 border border-slate-300/80'
              }`}
              title={isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
              aria-label={isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" />
              )}
            </button>

            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen(prev => !prev)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition text-left cursor-pointer shadow-xs ${
                  isDark
                    ? 'bg-slate-800/80 hover:bg-slate-700/80 border-2 border-slate-400 text-white font-semibold'
                    : 'bg-slate-100 hover:bg-slate-200 border border-slate-300/80 text-slate-900 font-semibold'
                }`}
              >
                <div className={`w-5 h-5 rounded-md font-bold text-[10px] flex items-center justify-center border ${
                  isDark
                    ? 'bg-emerald-600/30 text-white border-emerald-500/40'
                    : 'bg-slate-200 text-slate-900 border-slate-300'
                }`}>
                  {inicialAvatar}
                </div>
                <span className={`text-xs font-semibold max-w-[85px] lg:max-w-[120px] truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {nomeExibicaoUsuario.toUpperCase()}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 ${isDark ? 'text-slate-300' : 'text-slate-800'}`} />
              </button>

              {userMenuOpen && (
                <div className={`absolute top-full right-0 mt-2 w-64 rounded-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150 border ${
                  isDark ? 'bg-slate-900 border-slate-800 shadow-2xl' : 'bg-white border-[#E2E8F0] shadow-xl'
                }`}>
                  <div className={`px-3 py-2 mb-1 rounded-xl border ${isDark ? 'border-slate-800 bg-slate-950/50' : 'border-[#E2E8F0] bg-[#F8FAFC]'}`}>
                    <p className={`text-xs font-bold truncate ${isDark ? 'text-slate-100' : 'text-[#0F172A]'}`}>{nomeExibicaoUsuario.toUpperCase()}</p>
                    <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-wider">{usuarioLogado?.perfil || usuario?.perfil || 'Comum'}</p>
                  </div>

                  {(permissions.ehOwner || permissions.ehAdmin) && (
                    <div className={`px-1 py-1 mb-1 border-b ${isDark ? 'border-slate-800' : 'border-[#E2E8F0]'}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          abrirModalData();
                        }}
                        className={`w-full px-2.5 py-2 rounded-xl text-left text-xs font-bold text-amber-500 flex items-center justify-between transition cursor-pointer border border-amber-500/20 ${
                          isDark ? 'hover:bg-slate-800' : 'hover:bg-amber-50/60'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Data Operacional</span>
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-mono">
                          {dataOperacaoFormatada}
                        </span>
                      </button>
                    </div>
                  )}

                  <div className={`px-3 py-2 mb-1 border-b ${isDark ? 'border-slate-800/80' : 'border-[#E2E8F0]'}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1.5 ${isDark ? 'text-slate-400' : 'text-[#64748B]'}`}>
                      Tema do Sistema
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setTema('dark');
                          setUserMenuOpen(false);
                        }}
                        className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          tema === 'dark'
                            ? 'bg-slate-800 text-amber-300 border border-slate-700'
                            : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-[#64748B] hover:text-[#0F172A]'
                        }`}
                      >
                        <Moon className="w-3.5 h-3.5" />
                        <span>Escuro</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTema('light');
                          setUserMenuOpen(false);
                        }}
                        className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          tema === 'light'
                            ? 'bg-slate-200 text-black border border-slate-400 shadow-xs font-bold'
                            : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-[#64748B] hover:text-[#0F172A]'
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5 text-amber-600" />
                        <span>Claro</span>
                      </button>
                    </div>
                  </div>

                  {permissions.podeAcessarConfig && (
                    <Link
                      to="/config"
                      onClick={() => setUserMenuOpen(false)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition ${
                        isDark ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-slate-800 hover:bg-slate-100 hover:text-slate-900 font-medium'
                      }`}
                    >
                      <Settings className={`w-3.5 h-3.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
                      <span>Configurações</span>
                    </Link>
                  )}

                  <Link
                    to={catalogUrl}
                    target="_blank"
                    onClick={() => setUserMenuOpen(false)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs transition ${
                      isDark ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-slate-800 hover:bg-slate-100 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Store className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Catálogo Online</span>
                    </div>
                    <ExternalLink className={`w-3 h-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  </Link>

                  {permissions.podeTrocarLoja && (
                    <div className="pt-2 pb-1 border-t border-slate-700/50">
                      <div className="flex items-center justify-between px-3 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Minhas Lojas
                        </span>
                        {permissions.ehOwner && (
                          <button
                            type="button"
                            onClick={() => {
                              setUserMenuOpen(false);
                              setModalAdicionarLojaAberto(true);
                            }}
                            className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Nova</span>
                          </button>
                        )}
                      </div>

                      <div className="max-h-36 overflow-y-auto space-y-0.5 custom-scrollbar">
                        {lojasDisponiveis.map((l) => {
                          const ativa = l.id === loja?.id;
                          return (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => {
                                setUserMenuOpen(false);
                                if (!ativa) selecionarLoja(l.id);
                              }}
                              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition text-left ${
                                ativa
                                  ? 'bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30'
                                  : isDark
                                  ? 'text-slate-300 hover:bg-slate-800'
                                  : 'text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <Building2 className={`w-3 h-3 shrink-0 ${ativa ? 'text-emerald-400' : 'text-slate-400'}`} />
                                <span className="truncate">{l.nome_fantasia}</span>
                              </div>
                              {ativa && <Check className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      desconectarPdv();
                    }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 font-semibold transition text-left mt-1 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Trocar PDV / Sair</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* DRAWER MENU UNIFICADO MOBILE */}
      <MobileMenuDrawer
        aberto={mobileMenuOpen}
        onFechar={() => setMobileMenuOpen(false)}
        pedidosConfirmadosCount={pedidosConfirmadosCount}
        onAbrirNovaFilial={permissions.ehOwner ? () => setModalAdicionarLojaAberto(true) : undefined}
        ehTrial={ehTrial}
        diasRestantesTrial={diasRestantesTrial}
        onAbrirAssinatura={() => setModalAssinaturaManualAberto(true)}
      />

      {/* BANNER DISCRETO DE ALERTA DE SALDO BAIXO DA CARTEIRA WHATSAPP */}
      {!bannerSaldoWhatsappDispensado &&
        loja?.whatsapp_auto_ativo === true &&
        Number(loja?.whatsapp_saldo ?? 2.0) <= Number(loja?.whatsapp_alerta_saldo_baixo ?? 5.0) && (
          <>
            {/* Mobile: estritamente 1 única linha compacta */}
            <div
              className={`md:hidden px-3 py-1.5 border-b flex flex-nowrap items-center justify-between gap-2 z-30 transition-all ${
                isDark
                  ? 'bg-slate-900 border-slate-800 text-slate-100'
                  : 'bg-slate-100 border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1 text-[11px] font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="truncate whitespace-nowrap">
                  Saldo WhatsApp baixo (
                  <strong className="font-extrabold text-amber-600 dark:text-amber-300">
                    {formatCurrency(Number(loja?.whatsapp_saldo ?? 0))}
                  </strong>
                  )
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalRecargaWhatsappAberto(true)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 flex items-center gap-1 transition shadow-2xs cursor-pointer ${
                    isDark
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                      : 'bg-white hover:bg-slate-50 text-slate-900 border border-slate-300'
                  }`}
                >
                  <Wallet className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>Recarregar saldo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBannerSaldoWhatsappDispensado(true)}
                  className={`hubi-btn-close-x p-1 rounded-lg transition cursor-pointer shrink-0 ${
                    isDark
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                  title="Dispensar aviso por agora"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Desktop */}
            <div
              className={`hidden md:flex px-4 py-2 border-b items-center justify-between gap-3 z-30 transition-all ${
                isDark
                  ? 'bg-slate-900 border-slate-800 text-slate-100'
                  : 'bg-slate-100 border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                <span className="inline-flex items-center gap-1.5 text-amber-500 dark:text-amber-400 font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Aviso de Saldo:</span>
                </span>
                <span>
                  Saldo WhatsApp baixo (
                  <strong className="font-bold text-amber-600 dark:text-amber-300">
                    {formatCurrency(Number(loja?.whatsapp_saldo ?? 0))}
                  </strong>
                  ).
                </span>
                <button
                  type="button"
                  onClick={() => setModalRecargaWhatsappAberto(true)}
                  className={`ml-1 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer ${
                    isDark
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                      : 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300'
                  }`}
                >
                  <Wallet className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Recarregar saldo</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setBannerSaldoWhatsappDispensado(true)}
                className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer shrink-0 ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
                title="Dispensar aviso por agora"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

      {/* BARRA SUPERIOR DE RETORNO AO QUESTIONÁRIO DE IMPLANTAÇÃO ("IDA E VOLTA") */}
      {retornoOnboardingAtivo && !modalQuestionarioOnboardingAberto && (
        <div
          className={`px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 z-30 transition-all ${
            isDark
              ? 'bg-emerald-950/75 border-emerald-800/80 text-emerald-100'
              : 'bg-emerald-50 border-emerald-200 text-emerald-950'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 font-black text-emerald-600 dark:text-emerald-400">
              {etapaRecemSalvaOnboarding ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <Sparkles className="w-4 h-4 shrink-0" />
              )}
              <span>Questionário de Implantação:</span>
            </span>
            <span className="font-bold">{retornoOnboardingAtivo.etapaTitulo}</span>
            <span className="opacity-80 hidden sm:inline">
              {etapaRecemSalvaOnboarding
                ? '— Configuração salva! Retornando ao questionário...'
                : '— Salve esta configuração e volte para acompanhar o ✓ atualizado.'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleVoltarParaQuestionario}
              className={`px-3.5 py-1.5 rounded-xl text-xs inline-flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                isDark
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-black'
                  : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-semibold'
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para o Questionário</span>
            </button>
            <button
              type="button"
              onClick={handleDispensarBannerRetorno}
              className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
              title="Ocultar barra de retorno"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ÁREA DE CONTEÚDO PRINCIPAL (BACKGROUND UNIFICADO #F8FAFC NO LIGHT / #020617 NO DARK) */}
      <main className={`flex-1 overflow-y-auto ${isDark ? 'bg-slate-950 text-slate-100' : (isDashboardRoute || isPosRoute) ? 'bg-slate-100 text-slate-900' : 'bg-slate-50 text-slate-900'} pb-0`}>
        <ErrorBoundary origem="AppLayoutConteudo">
          <Outlet />
        </ErrorBoundary>
      </main>

      {/* WIDGET FLUTUANTE DE AJUDA & SUPORTE IA */}
      <ChatAjudaIA />

      {/* MODAL DE AJUSTE DA DATA OPERACIONAL (OWNER ONLY) */}
      <ModalSeletorDataOperacao />

      {/* MODAL DE EXPANSÃO / NOVA FILIAL DO CONGLOMERADO */}
      <ModalAdicionarLoja
        isOpen={modalAdicionarLojaAberto}
        onClose={() => setModalAdicionarLojaAberto(false)}
      />

      {/* OVERLAY ÚNICO E ESTÁVEL DE CONFIRMAÇÃO DE RETORNO DO MERCADO PAGO */}
      {confirmandoRetornoPagamento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div
            className={`w-full max-w-md rounded-3xl border p-8 text-center shadow-2xl space-y-4 ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-black tracking-tight">
                Confirmando pagamento e liberando acesso...
              </h3>
              <p className="text-xs text-slate-400">
                Estamos validando o retorno do Mercado Pago e sincronizando sua loja.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY DE BLOQUEIO OPERACIONAL SELETIVO POR LOJA E MODAL DE ASSINATURA MANUAL */}
      {!confirmandoRetornoPagamento && (
        <TelaBloqueioAssinatura
          aberturaManual={modalAssinaturaManualAberto}
          onCloseManual={() => setModalAssinaturaManualAberto(false)}
        />
      )}
      {loja && (
        <ModalRecargaWhatsapp
          aberto={modalRecargaWhatsappAberto}
          aoFechar={() => setModalRecargaWhatsappAberto(false)}
          loja={loja}
          usuarioId={usuario?.id || null}
          aoConcluirRecarga={() => {
            recarregarDadosLoja?.();
          }}
        />
      )}
      {loja && permissions.podeAcessarConfig && (
        <ModalQuestionarioOnboarding
          isOpen={modalQuestionarioOnboardingAberto}
          onClose={() => {
            setModalQuestionarioOnboardingAberto(false);
            setEtapaDestaqueOnboarding(null);
          }}
          etapaDestaque={etapaDestaqueOnboarding}
          onAdiarSessao={() => {
            try {
              sessionStorage.setItem(`hubi_onboarding_adiado_${loja.id}`, 'true');
            } catch {
              // Silencioso
            }
          }}
          onConcluirQuestionario={() => {
            try {
              sessionStorage.removeItem(`hubi_onboarding_adiado_${loja.id}`);
            } catch {
              // Silencioso
            }
          }}
        />
      )}
      <BarraProgressoPublicacaoMassaMl />
      <ModalPublicarMassaMl />
      <BarraProgressoPublicacaoMassaShopee />
      <ModalPublicarMassaShopee />
      <div className="hidden"

      />
    </div>
  );
};
