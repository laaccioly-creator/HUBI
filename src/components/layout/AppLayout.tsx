import React, { useState, useEffect, useRef } from 'react';
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
  Menu,
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
  Laptop
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme, ModoTema } from '../../contexts/ThemeContext';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../lib/supabase';
import { audioService } from '../../services/audioService';
import { CadastroPdv } from '../CadastroPdv';
import { ChatAjudaIA } from '../ChatAjudaIA';
import { DesktopAppPrompt, DesktopInstallButton } from '../DesktopAppPrompt';
import { UsuarioLoja } from '../../types';

export const AppLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { loja, usuario, carregando, desconectarPdv, selecionarUsuario } = useAuth();
  const permissions = usePermissions();
  const { tema, setTema } = useTheme();
  const [pedidosConfirmadosCount, setPedidosConfirmadosCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [maisMenuOpen, setMaisMenuOpen] = useState<boolean>(false);
  const [userMenuOpen, setUserMenuOpen] = useState<boolean>(false);
  const [listaUsuariosLoja, setListaUsuariosLoja] = useState<UsuarioLoja[]>([]);

  const maisMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Manipulador global da tecla ESC em todo o sistema
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

        // Se houver algum modal fixo no DOM, deixa o modal tratar
        const openModal = document.querySelector('.fixed.inset-0, [role="dialog"]');
        if (!openModal) {
          if (location.pathname !== '/pos' && location.pathname !== '/') {
            navigate(-1);
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [mobileMenuOpen, maisMenuOpen, userMenuOpen, location.pathname, navigate]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (maisMenuRef.current && !maisMenuRef.current.contains(event.target as Node)) {
        setMaisMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
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

  useEffect(() => {
    if (!loja?.id) return;

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

    const channel = supabase
      .channel('pedidos-confirmados-realtime')
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

  // Se estiver carregando os dados do PDV
  if (carregando) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-2xl">
          <Store className="w-8 h-8 text-emerald-400 animate-pulse" />
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          <span>Carregando Sistema HUBI...</span>
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
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-5">
        <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center shadow-2xl">
          <X className="w-10 h-10" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-xl font-black text-slate-100">Acesso Mobile Não Autorizado</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Olá, <strong className="text-slate-200">{usuario?.nome_completo || 'Operador'}</strong>. Seu usuário não possui permissão para acessar o sistema através de celular pessoal.
          </p>
          <p className="text-xs text-slate-500">
            Utilize um computador autorizado da loja ou contate o administrador para solicitar a liberação do acesso móvel.
          </p>
        </div>
        <button
          type="button"
          onClick={desconectarPdv}
          className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition flex items-center gap-2"
        >
          <LogOut className="w-4 h-4 text-rose-400" />
          <span>Trocar Operador / Sair</span>
        </button>
      </div>
    );
  }

  const catalogUrl = loja?.slug_catalogo ? `/catalog/${loja.slug_catalogo}` : '/catalog';

  const todosBotoesPrincipais = [
    {
      name: 'Vender (PDV)',
      path: '/pos',
      icon: ShoppingCart,
      isPrimary: true,
      visivel: permissions.podeAcessarPdv
    },
    {
      name: 'Pedidos',
      path: '/orders',
      icon: ShoppingBag,
      badge: pedidosConfirmadosCount,
      visivel: permissions.podeAcessarPedidos
    },
    {
      name: 'Vendas',
      path: '/sales',
      icon: Receipt,
      visivel: permissions.podeAcessarVendas
    },
    {
      name: 'Produtos & Estoque',
      path: '/products',
      icon: Package,
      visivel: permissions.podeAcessarProdutos
    },
    {
      name: 'Clientes',
      path: '/customers',
      icon: Users,
      visivel: permissions.podeAcessarClientes
    },
    {
      name: 'Finanças & Caixa',
      path: '/finances',
      icon: DollarSign,
      visivel: permissions.podeAcessarFinancas
    },
    {
      name: 'Estatísticas',
      path: '/analytics',
      icon: BarChart3,
      visivel: permissions.podeAcessarAnalytics
    },
    {
      name: 'Rubi IA',
      path: '/smart-assistant',
      icon: Sparkles,
      isAi: true,
      visivel: permissions.podeAcessarRubiIA
    }
  ];

  const mainButtons = todosBotoesPrincipais.filter(b => b.visivel);

  const todosBotoesExtras = [
    {
      name: 'Catálogo Online',
      path: '/catalog-config',
      icon: Globe,
      description: 'Vitrine, cores e pedidos online',
      visivel: permissions.podeAcessarCatalogo
    },
    {
      name: 'Cupons de Desconto',
      path: '/coupons',
      icon: Ticket,
      description: 'Promoções e cupons de frete grátis',
      visivel: permissions.podeAcessarCupons
    },
    {
      name: 'Cadastros & Tabelas',
      path: '/auxiliares',
      icon: Layers,
      description: 'Categorias, Fornecedores, Formas',
      visivel: permissions.podeAcessarAuxiliares
    },
    {
      name: 'Gestão de Usuários',
      path: '/users',
      icon: UserCheck,
      description: 'Controle de operadores e acessos',
      visivel: permissions.podeAcessarUsuarios
    },
    {
      name: 'Configurações',
      path: '/config',
      icon: Settings,
      description: 'Dados da loja e taxas',
      visivel: permissions.podeAcessarConfig
    }
  ];

  const extraButtons = todosBotoesExtras.filter(b => b.visivel);
  const isExtraActive = extraButtons.some(item => location.pathname.startsWith(item.path));
  const isPosRoute = location.pathname === '/pos' || location.pathname === '/';
  const isCustomMobileRoute = isPosRoute || location.pathname.startsWith('/products') || location.pathname.startsWith('/orders') || location.pathname.startsWith('/catalog-config') || location.pathname.startsWith('/finances');

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* BANNER / BOTÃO DE INSTALAÇÃO DO APP DESKTOP */}
      <DesktopAppPrompt />

      {/* TOP HEADER / BARRA SUPERIOR EM 2 LINHAS (PADRÃO DESKTOP & MOBILE) */}
      <header className={`bg-slate-900 border-b border-slate-800/80 z-30 shrink-0 shadow-md ${isCustomMobileRoute ? 'hidden md:block' : ''}`}>
        {/* LINHA 1: IDENTIFICAÇÃO DA LOJA + MÓDULOS OPERACIONAIS PRINCIPAIS + AÇÕES RÁPIDAS */}
        <div className="px-3 md:px-5 py-2.5 flex items-center justify-between gap-3 border-b border-slate-800/50">
          {/* IDENTIFICAÇÃO DA LOJA (ESQUERDA - COM MARGEM GENEROSA PARA A DIREITA) */}
          <div className="flex items-center gap-3 shrink-0 mr-2 lg:mr-4">
            <Link to="/pos" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center font-black text-white shadow-lg shadow-emerald-500/20 text-sm shrink-0 group-hover:scale-105 transition">
                {loja?.nome_fantasia ? loja.nome_fantasia.slice(0, 2).toUpperCase() : 'HB'}
              </div>
              <div className="hidden sm:block min-w-0">
                <h1 className="font-bold text-slate-100 text-xs lg:text-sm truncate max-w-[110px] md:max-w-[130px] lg:max-w-[160px] leading-tight group-hover:text-emerald-400 transition">
                  {loja?.nome_fantasia || 'HUBI PDV'}
                </h1>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[9px] text-emerald-400 font-semibold uppercase tracking-wider">Conectado</span>
                </div>
              </div>
            </Link>
          </div>

          {/* BARRA HORIZONTAL DE MÓDULOS OPERACIONAIS PRINCIPAIS (LINHA 1) */}
          <nav className="hidden md:flex items-center gap-1.5 lg:gap-2 flex-1 justify-center min-w-0 px-1 overflow-x-auto scrollbar-none">
            {mainButtons.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);

              if (item.isPrimary) {
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 shrink-0 shadow-md ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-emerald-500/25 ring-2 ring-emerald-400/40'
                        : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500 hover:text-white border border-emerald-500/40'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">{item.name}</span>
                  </Link>
                );
              }

              if (item.isAi) {
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25 ring-1 ring-indigo-400/40'
                        : 'bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 border border-indigo-500/20'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="whitespace-nowrap">{item.name}</span>
                    <span className="bg-indigo-500/30 text-indigo-200 text-[8px] font-extrabold px-1 rounded">IA</span>
                  </Link>
                );
              }

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 shrink-0 relative ${
                    isActive
                      ? 'bg-slate-800 text-white shadow-sm border border-slate-700 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className="whitespace-nowrap">{item.name}</span>

                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full animate-bounce">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* AÇÕES DA DIREITA (TEMA CLARO/ESCURO + CATÁLOGO + USUÁRIO) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* SELETOR DE TEMA: APENAS MODO ESCURO E MODO CLARO */}
            <div className="flex items-center bg-slate-800 border border-slate-700/80 rounded-xl p-0.5" title={`Tema ativo: ${tema === 'dark' ? 'Modo Escuro' : 'Modo Claro'}`}>
              <button
                type="button"
                onClick={() => setTema('dark')}
                className={`p-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-bold ${
                  tema === 'dark' ? 'bg-slate-700 text-amber-300 shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Ativar Modo Escuro (Noturno)"
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setTema('light')}
                className={`p-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-bold ${
                  tema === 'light' ? 'bg-amber-500/20 text-amber-400 shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Ativar Modo Claro (Diurno)"
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
            </div>

            <Link
              to={catalogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium border border-slate-700 transition shadow-sm"
              title="Abrir Catálogo Online do Cliente"
            >
              <Store className="w-3.5 h-3.5 text-emerald-400" />
              <span>Catálogo</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>

            {/* NOTIFICAÇÃO MOBILE / RÁPIDA */}
            <Link
              to="/orders"
              className="md:hidden relative p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
            >
              <Bell className="w-4 h-4" />
              {pedidosConfirmadosCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
                  {pedidosConfirmadosCount}
                </span>
              )}
            </Link>

            {/* MENU DO USUÁRIO / TROCAR PDV */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen(prev => !prev)}
                className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition text-left cursor-pointer"
              >
                <div className="w-6 h-6 rounded-lg bg-emerald-600/20 text-emerald-400 font-bold text-[11px] flex items-center justify-center border border-emerald-500/30">
                  {usuario?.nome_completo ? usuario.nome_completo.slice(0, 1).toUpperCase() : 'U'}
                </div>
                <span className="text-xs font-medium text-slate-200 max-w-[90px] truncate">
                  {usuario?.nome_completo || 'Operador'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2 border-b border-slate-800 mb-1 bg-slate-950/50 rounded-xl">
                    <p className="text-xs font-bold text-slate-100 truncate">{usuario?.nome_completo || 'Operador'}</p>
                    <p className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider">{usuario?.perfil || 'Comum'}</p>
                  </div>

                  {/* Seletor de Tema no Menu do Usuário */}
                  <div className="px-3 py-2 border-b border-slate-800/80 mb-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Tema do Sistema
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTema('dark')}
                        className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                          tema === 'dark' ? 'bg-slate-800 text-amber-300 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Moon className="w-3.5 h-3.5" />
                        <span>Escuro</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTema('light')}
                        className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                          tema === 'light' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5" />
                        <span>Claro</span>
                      </button>
                    </div>
                  </div>

                  {permissions.podeAcessarConfig && (
                    <Link
                      to="/config"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-400" />
                      <span>Configurações</span>
                    </Link>
                  )}

                  <Link
                    to={catalogUrl}
                    target="_blank"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <Store className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Catálogo Online</span>
                    </div>
                    <ExternalLink className="w-3 h-3 text-slate-500" />
                  </Link>

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

            {/* BOTÃO MENU HAMBURGUER MOBILE */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* LINHA 2: GESTÃO & CONFIGURAÇÕES (APRESENTADOS DIRETAMENTE SEM DROPDOWN 'MAIS') */}
        {extraButtons.length > 0 && (
          <div className="hidden md:flex items-center justify-between px-3 md:px-5 py-1.5 bg-slate-950/40 text-xs overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-1.5 lg:gap-2">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mr-1 shrink-0">
                Gestão & Configuração:
              </span>
              {extraButtons.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.path);

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl transition font-medium shrink-0 ${
                      isActive
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <span className="whitespace-nowrap">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* MENU DROPDOWN MOBILE (APENAS MÓDULOS AUTORIZADOS) */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-slate-900 border-t border-slate-800 px-4 py-3 space-y-1.5 z-40 max-h-[80vh] overflow-y-auto animate-in slide-in-from-top duration-200">
            {permissions.podeAcessarPdv && (
              <Link
                to="/pos"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 font-bold text-sm border border-emerald-500/30"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Vender (Frente de Caixa)</span>
              </Link>
            )}

            {permissions.podeAcessarPedidos && (
              <Link
                to="/orders"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-3 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800"
              >
                <div className="flex items-center gap-3">
                  <ShoppingBag className="w-4 h-4 text-slate-400" />
                  <span>Pedidos</span>
                </div>
                {pedidosConfirmadosCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {pedidosConfirmadosCount}
                  </span>
                )}
              </Link>
            )}

            {permissions.podeAcessarVendas && (
              <Link
                to="/sales"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800"
              >
                <Receipt className="w-4 h-4 text-slate-400" />
                <span>Vendas</span>
              </Link>
            )}

            {permissions.podeAcessarProdutos && (
              <Link
                to="/products"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800"
              >
                <Package className="w-4 h-4 text-slate-400" />
                <span>Produtos & Estoque</span>
              </Link>
            )}

            {permissions.podeAcessarClientes && (
              <Link
                to="/customers"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800"
              >
                <Users className="w-4 h-4 text-slate-400" />
                <span>Clientes</span>
              </Link>
            )}

            {permissions.podeAcessarFinancas && (
              <Link
                to="/finances"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800"
              >
                <DollarSign className="w-4 h-4 text-slate-400" />
                <span>Finanças & Caixa</span>
              </Link>
            )}

            {permissions.podeAcessarAnalytics && (
              <Link
                to="/analytics"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800"
              >
                <BarChart3 className="w-4 h-4 text-slate-400" />
                <span>Estatísticas & Relatórios</span>
              </Link>
            )}

            {permissions.podeAcessarRubiIA && (
              <Link
                to="/smart-assistant"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-indigo-300 hover:bg-indigo-500/10 font-semibold"
              >
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Assistente Rubi (IA)</span>
              </Link>
            )}

            {permissions.podeAcessarCatalogo && (
              <Link
                to="/catalog-config"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-emerald-300 hover:bg-emerald-500/10 font-semibold"
              >
                <Globe className="w-4 h-4 text-emerald-400" />
                <span>Catálogo Online</span>
              </Link>
            )}

            {permissions.podeAcessarAuxiliares && (
              <Link
                to="/auxiliares"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800"
              >
                <Layers className="w-4 h-4 text-slate-400" />
                <span>Cadastros & Tabelas Auxiliares</span>
              </Link>
            )}

            {permissions.podeAcessarUsuarios && (
              <Link
                to="/users"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800"
              >
                <UserCheck className="w-4 h-4 text-slate-400" />
                <span>Gestão de Usuários</span>
              </Link>
            )}

            {permissions.podeAcessarConfig && (
              <Link
                to="/config"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Configurações</span>
              </Link>
            )}

            <Link
              to={catalogUrl}
              target="_blank"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-sm font-medium"
            >
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4" />
                <span>Abrir Catálogo Público</span>
              </div>
              <ExternalLink className="w-4 h-4" />
            </Link>

            <div className="pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  desconectarPdv();
                }}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 text-sm font-semibold transition text-left"
              >
                <LogOut className="w-4 h-4" />
                <span>Trocar de Estabelecimento / Sair</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ÁREA DE CONTEÚDO PRINCIPAL (OCUPA 100% DA LARGURA) */}
      <main className={`flex-1 overflow-y-auto bg-slate-950 ${isCustomMobileRoute ? 'pb-0' : 'pb-20 md:pb-0'}`}>
        <Outlet />
      </main>

      {/* WIDGET FLUTUANTE DE AJUDA & SUPORTE IA (TELA009) */}
      <ChatAjudaIA />

      {/* BOTTOM NAVIGATION BAR MOBILE (MÓDULOS PRINCIPAIS AUTORIZADOS) */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 flex items-center justify-around px-2 z-30 ${isCustomMobileRoute ? 'hidden' : ''}`}>
        {permissions.podeAcessarPdv && (
          <Link
            to="/pos"
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              location.pathname === '/pos' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <div className="relative">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-1 font-medium">Vender</span>
          </Link>
        )}

        {permissions.podeAcessarPedidos && (
          <Link
            to="/orders"
            className={`flex flex-col items-center justify-center flex-1 py-1 transition relative ${
              location.pathname === '/orders' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <div className="relative">
              <ShoppingBag className="w-5 h-5" />
              {pedidosConfirmadosCount > 0 && (
                <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold">
                  {pedidosConfirmadosCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-1 font-medium">Pedidos</span>
          </Link>
        )}

        {permissions.podeAcessarProdutos && (
          <Link
            to="/products"
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              location.pathname.startsWith('/products') ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Package className="w-5 h-5" />
            <span className="text-[10px] mt-1 font-medium">Produtos</span>
          </Link>
        )}

        {permissions.podeAcessarClientes && (
          <Link
            to="/customers"
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              location.pathname === '/customers' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] mt-1 font-medium">Clientes</span>
          </Link>
        )}

        {permissions.podeAcessarFinancas && (
          <Link
            to="/finances"
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              location.pathname === '/finances' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <DollarSign className="w-5 h-5" />
            <span className="text-[10px] mt-1 font-medium">Finanças</span>
          </Link>
        )}
      </nav>
    </div>
  );
};
