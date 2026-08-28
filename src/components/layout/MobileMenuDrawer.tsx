import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ShoppingCart,
  ShoppingBag,
  Receipt,
  Package,
  Users,
  DollarSign,
  BarChart3,
  Ticket,
  Globe,
  Sparkles,
  Layers,
  UserCheck,
  Settings,
  Store,
  ExternalLink,
  LogOut,
  X
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../lib/supabase';

interface MobileMenuDrawerProps {
  aberto: boolean;
  onFechar: () => void;
  pedidosConfirmadosCount?: number;
}

export const MobileMenuDrawer: React.FC<MobileMenuDrawerProps> = ({
  aberto,
  onFechar,
  pedidosConfirmadosCount: countProp
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loja, usuario, desconectarPdv } = useAuth();
  const permissions = usePermissions();
  const [internalCount, setInternalCount] = useState<number>(0);

  // Monitorar contagem de pedidos confirmados em tempo real se não foi passado via prop
  useEffect(() => {
    if (countProp !== undefined) {
      setInternalCount(countProp);
      return;
    }
    if (!loja?.id) return;

    const carregarContagem = async () => {
      let query = supabase
        .from('pedidos')
        .select('*', { count: 'exact', head: true })
        .eq('loja_id', loja.id)
        .eq('status', 'confirmado');

      if (usuario && !permissions.podeVerTransacoesOutros) {
        query = query.eq('vendedor_id', usuario.id);
      }

      const { count } = await query;
      setInternalCount(count || 0);
    };

    carregarContagem();
  }, [loja?.id, usuario?.id, permissions.podeVerTransacoesOutros, countProp]);

  // Fechar no ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && aberto) {
        onFechar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const catalogUrl = loja?.slug_catalogo ? `/catalog/${loja.slug_catalogo}` : '/catalog';
  const pedidosCount = countProp !== undefined ? countProp : internalCount;

  const navegarPara = (caminho: string) => {
    onFechar();
    navigate(caminho);
  };

  const modulos = [
    {
      nome: 'Vender (Frente de Caixa)',
      caminho: '/pos',
      icone: ShoppingCart,
      visivel: permissions.podeAcessarPdv,
      badge: undefined
    },
    {
      nome: 'Pedidos',
      caminho: '/orders',
      icone: ShoppingBag,
      visivel: permissions.podeAcessarPedidos,
      badge: pedidosCount > 0 ? pedidosCount : undefined
    },
    {
      nome: 'Vendas / Histórico',
      caminho: '/sales',
      icone: Receipt,
      visivel: permissions.podeAcessarVendas,
      badge: undefined
    },
    {
      nome: 'Produtos & Estoque',
      caminho: '/products',
      icone: Package,
      visivel: permissions.podeAcessarProdutos,
      badge: undefined
    },
    {
      nome: 'Clientes',
      caminho: '/customers',
      icone: Users,
      visivel: permissions.podeAcessarClientes,
      badge: undefined
    },
    {
      nome: 'Finanças & Caixa',
      caminho: '/finances',
      icone: DollarSign,
      visivel: permissions.podeAcessarFinancas,
      badge: undefined
    },
    {
      nome: 'Estatísticas & Relatórios',
      caminho: '/analytics',
      icone: BarChart3,
      visivel: permissions.podeAcessarAnalytics,
      badge: undefined
    },
    {
      nome: 'Cupons de Desconto',
      caminho: '/coupons',
      icone: Ticket,
      visivel: permissions.podeAcessarCupons,
      badge: undefined
    },
    {
      nome: 'Catálogo Online',
      caminho: '/catalog-config',
      icone: Globe,
      visivel: permissions.podeAcessarCatalogo,
      badge: undefined
    },
    {
      nome: 'Assistente Rubi (IA)',
      caminho: '/smart-assistant',
      icone: Sparkles,
      visivel: permissions.podeAcessarRubiIA,
      badge: undefined
    },
    {
      nome: 'Cadastros & Tabelas Auxiliares',
      caminho: '/auxiliares',
      icone: Layers,
      visivel: permissions.podeAcessarAuxiliares,
      badge: undefined
    },
    {
      nome: 'Gestão de Usuários',
      caminho: '/users',
      icone: UserCheck,
      visivel: permissions.podeAcessarUsuarios,
      badge: undefined
    },
    {
      nome: 'Configurações',
      caminho: '/config',
      icone: Settings,
      visivel: permissions.podeAcessarConfig,
      badge: undefined
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex select-none">
      {/* Backdrop com desfoque */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onFechar}
      />

      {/* Painel do Drawer */}
      <div className="relative w-4/5 max-w-xs bg-slate-900 text-slate-100 h-full flex flex-col z-10 shadow-2xl animate-in slide-in-from-left duration-200">
        {/* Header do Drawer */}
        <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center font-black text-slate-950 text-base shadow-lg shadow-emerald-500/20 shrink-0">
              {loja?.nome_fantasia ? loja.nome_fantasia.slice(0, 2).toUpperCase() : 'HB'}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-100 truncate">{loja?.nome_fantasia || 'HUBI PDV'}</h3>
              <p className="text-[10px] text-emerald-400 font-semibold truncate">{usuario?.nome_completo || 'Operador'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Links de Módulos com Scroll */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 text-sm">
          {modulos
            .filter((m) => m.visivel)
            .map((item) => {
              const Icone = item.icone;
              const isAtivo =
                item.caminho === '/pos'
                  ? location.pathname === '/pos' || location.pathname === '/'
                  : location.pathname.startsWith(item.caminho);

              return (
                <button
                  key={item.caminho}
                  type="button"
                  onClick={() => navegarPara(item.caminho)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition ${
                    isAtivo
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold'
                      : 'hover:bg-slate-800 text-slate-200 hover:text-emerald-400 font-medium'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icone className={`w-5 h-5 shrink-0 ${isAtivo ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <span className="truncate">{item.nome}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
        </div>

        {/* Rodapé do Drawer */}
        <div className="p-3 border-t border-slate-800 space-y-2 bg-slate-950/80 shrink-0">
          <a
            href={catalogUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onFechar}
            className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/20 transition"
          >
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4" />
              <span>Abrir Catálogo Público</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            type="button"
            onClick={() => {
              onFechar();
              desconectarPdv();
            }}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-rose-400 hover:bg-rose-500/10 text-xs font-bold transition text-left cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Trocar Estabelecimento / Sair</span>
          </button>
        </div>
      </div>
    </div>
  );
};
