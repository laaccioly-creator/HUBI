import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  ShoppingBag,
  ShoppingCart,
  Package,
  Users,
  DollarSign,
  BarChart3,
  Settings,
  Sparkles,
  ExternalLink,
  Store,
  Bell,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { audioService } from '../services/audioService';

export const LayoutNavegacao: React.FC = () => {
  const location = useLocation();
  const { loja, usuario } = useAuth();
  const [pedidosPendentesCount, setPedidosPendentesCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!loja?.id) return;

    const carregarPendentes = async () => {
      const { count } = await supabase
        .from('pedidos')
        .select('*', { count: 'exact', head: true })
        .eq('loja_id', loja.id)
        .eq('status', 'pendente');
      
      setPedidosPendentesCount(count || 0);
    };

    carregarPendentes();

    const channel = supabase
      .channel('novos-pedidos-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pedidos', filter: `loja_id=eq.${loja.id}` },
        (payload) => {
          if (payload.new.status === 'pendente') {
            audioService.playNewOrderSound();
            setPedidosPendentesCount(prev => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loja?.id]);

  const navItems = [
    { name: 'PDV (Vender)', path: '/pos', icon: ShoppingCart, highlight: true },
    { name: 'Pedidos', path: '/orders', icon: ShoppingBag, badge: pedidosPendentesCount },
    { name: 'Produtos & Estoque', path: '/products', icon: Package },
    { name: 'Clientes & Fiado', path: '/customers', icon: Users },
    { name: 'Finanças & Caixa', path: '/finances', icon: DollarSign },
    { name: 'Estatísticas', path: '/analytics', icon: BarChart3 },
    { name: 'Assistente IA (Kai)', path: '/smart-assistant', icon: Sparkles, badgeText: 'IA' },
    { name: 'Configurações', path: '/config', icon: Settings }
  ];

  const catalogUrl = loja?.slug_catalogo ? `/catalog/${loja.slug_catalogo}` : '/catalog';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* SIDEBAR DESKTOP */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-800 bg-slate-900/90 backdrop-blur-xl z-20">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center font-bold text-white shadow-lg shadow-emerald-500/20 text-lg">
              {loja?.nome_fantasia ? loja.nome_fantasia.slice(0, 2).toUpperCase() : 'HB'}
            </div>
            <div className="overflow-hidden">
              <h2 className="font-bold text-slate-100 text-sm truncate leading-tight">
                {loja?.nome_fantasia || 'HUBI Sistema'}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[11px] text-emerald-400 font-medium">Online</span>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 font-semibold'
                    : item.highlight
                    ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : item.highlight ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>{item.name}</span>
                </div>

                {item.badge !== undefined && item.badge > 0 && (
                  <span className="bg-rose-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full animate-bounce">
                    {item.badge}
                  </span>
                )}

                {item.badgeText && (
                  <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded">
                    {item.badgeText}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 space-y-2">
          <Link
            to={catalogUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between w-full px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700/60 transition"
          >
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-emerald-400" />
              <span>Ver Catálogo Online</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </Link>

          <div className="px-2 py-1 text-xs text-slate-400 flex items-center justify-between">
            <span className="truncate">{usuario?.nome_completo || 'Operador'}</span>
            <span className="text-[10px] uppercase font-bold bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
              {usuario?.perfil || 'Admin'}
            </span>
          </div>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header Mobile */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-white text-sm shadow">
              {loja?.nome_fantasia ? loja.nome_fantasia.slice(0, 2).toUpperCase() : 'HB'}
            </div>
            <span className="font-bold text-sm text-slate-100 truncate max-w-[160px]">
              {loja?.nome_fantasia || 'HUBI'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/orders"
              className="relative p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
            >
              <Bell className="w-4 h-4" />
              {pedidosPendentesCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
                  {pedidosPendentesCount}
                </span>
              )}
            </Link>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Menu Dropdown Mobile Extra */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 py-3 space-y-2 z-30 animate-in slide-in-from-top duration-200">
            <Link
              to="/smart-assistant"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800"
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Assistente Kai (IA)</span>
            </Link>
            <Link
              to="/analytics"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800"
            >
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <span>Estatísticas & Relatórios</span>
            </Link>
            <Link
              to="/config"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span>Configurações</span>
            </Link>
            <Link
              to={catalogUrl}
              target="_blank"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm font-medium"
            >
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4" />
                <span>Abrir Catálogo Público</span>
              </div>
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Conteúdo Principal */}
        <main className="flex-1 overflow-y-auto bg-slate-950 pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Bottom Navigation Bar Mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 flex items-center justify-around px-2 z-30">
          <Link
            to="/pos"
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              location.pathname === '/pos' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <div className="relative">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-1">Vender</span>
          </Link>

          <Link
            to="/orders"
            className={`flex flex-col items-center justify-center flex-1 py-1 transition relative ${
              location.pathname === '/orders' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <div className="relative">
              <ShoppingBag className="w-5 h-5" />
              {pedidosPendentesCount > 0 && (
                <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold">
                  {pedidosPendentesCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-1">Pedidos</span>
          </Link>

          <Link
            to="/products"
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              location.pathname.startsWith('/products') ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Package className="w-5 h-5" />
            <span className="text-[10px] mt-1">Produtos</span>
          </Link>

          <Link
            to="/customers"
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              location.pathname === '/customers' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] mt-1">Clientes</span>
          </Link>

          <Link
            to="/finances"
            className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
              location.pathname === '/finances' ? 'text-emerald-400 font-bold' : 'text-slate-400'
            }`}
          >
            <DollarSign className="w-5 h-5" />
            <span className="text-[10px] mt-1">Finanças</span>
          </Link>
        </nav>
      </div>
    </div>
  );
};
