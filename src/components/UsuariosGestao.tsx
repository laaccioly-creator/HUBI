import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  BarChart3,
  HelpCircle,
  Shield,
  ShieldCheck,
  User,
  ChevronRight,
  TrendingUp,
  Loader2,
  DollarSign,
  ShoppingBag
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { UsuarioLoja } from '../types';
import { ModalUsuarioDrawer } from './ModalUsuarioDrawer';

export const UsuariosGestao: React.FC = () => {
  const navigate = useNavigate();
  const { loja, usuario } = useAuth();

  const [usuarios, setUsuarios] = useState<UsuarioLoja[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [modalDrawerAberto, setModalDrawerAberto] = useState<boolean>(false);
  const [usuarioSelecionadoEdicao, setUsuarioSelecionadoEdicao] = useState<UsuarioLoja | null>(null);

  // Métricas dos últimos 30 dias
  const [totalFaturamento30d, setTotalFaturamento30d] = useState<number>(0);
  const [totalVendas30d, setTotalVendas30d] = useState<number>(0);

  const carregarUsuariosEMetricas = async () => {
    if (!loja?.id) return;
    try {
      setCarregando(true);

      // 1. Carregar todos os usuários da loja
      const { data: usersData, error: usersErr } = await supabase
        .from('usuarios_loja')
        .select('*')
        .eq('loja_id', loja.id)
        .order('criado_em', { ascending: true });

      if (usersErr) throw usersErr;

      // 2. Carregar pedidos dos últimos 30 dias para cálculo de faturamento por usuário
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - 30);

      const { data: pedidos30d } = await supabase
        .from('pedidos')
        .select('id, vendedor_id, valor_total, status')
        .eq('loja_id', loja.id)
        .gte('data_venda', dataLimite.toISOString())
        .neq('status', 'cancelado');

      const pedidosValidos = pedidos30d || [];
      const faturamentoTotalGeral = pedidosValidos.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
      const totalQtdVendas = pedidosValidos.length;

      setTotalFaturamento30d(faturamentoTotalGeral);
      setTotalVendas30d(totalQtdVendas);

      // 3. Associar métricas a cada colaborador
      const listaComEstatisticas: UsuarioLoja[] = (usersData || []).map((u: any) => {
        const pedidosDoUsuario = pedidosValidos.filter(p => p.vendedor_id === u.id);
        const fatUser = pedidosDoUsuario.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
        const countUser = pedidosDoUsuario.length;
        const percUser = faturamentoTotalGeral > 0 ? (fatUser / faturamentoTotalGeral) * 100 : 0;

        return {
          ...u,
          faturamento_30d: fatUser,
          vendas_count_30d: countUser,
          percentual_participacao_30d: percUser
        };
      });

      setUsuarios(listaComEstatisticas);
    } catch (err) {
      console.error('Erro ao carregar usuários e métricas:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarUsuariosEMetricas();
  }, [loja?.id]);

  const handleAbrirAdicionar = () => {
    setUsuarioSelecionadoEdicao(null);
    setModalDrawerAberto(true);
  };

  const handleAbrirEdicao = (user: UsuarioLoja) => {
    setUsuarioSelecionadoEdicao(user);
    setModalDrawerAberto(true);
  };

  const formatarIniciais = (nome: string) => {
    if (!nome) return 'US';
    const partes = nome.trim().split(' ');
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto bg-slate-950 p-4 sm:p-6 space-y-6">
      
      {/* CABEÇALHO SUPERIOR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 flex items-center gap-2.5">
            <span>Usuários</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Gerencie sua equipe, permissões de acesso e acompanhe o desempenho de vendas.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAbrirAdicionar}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Usuários</span>
          </button>
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL (CARD LATERAL DE FATURAMENTO + TABELA) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* CARD LATERAL ESQUERDO: FATURAMENTO POR USUÁRIO */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl flex flex-col justify-between h-full min-h-[260px]">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-slate-200">Faturamento por usuário</h2>
              <span className="text-xs text-slate-400 font-medium">Últimos 30 dias</span>
            </div>

            <div className="text-center py-4 space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">
                {totalVendas30d} VENDAS
              </span>
              <span className="text-3xl sm:text-4xl font-black text-slate-100 block">
                R$ {totalFaturamento30d.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <button
              type="button"
              onClick={() => navigate('/analytics')}
              className="w-full py-2.5 text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center justify-center gap-1.5 transition cursor-pointer hover:underline"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Ver mais estatísticas</span>
            </button>
          </div>
        </div>

        {/* TABELA / LISTA DE COLABORADORES */}
        <div className="lg:col-span-8">
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
            
            {/* Título da Tabela */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs text-slate-400 font-bold uppercase tracking-wider px-2">
              <div className="flex-1">Nome</div>
              <div className="w-24 text-right">Faturamento</div>
              <div className="w-16 text-right">Vendas</div>
              <div className="w-16 text-right">%</div>
            </div>

            {/* Linhas da Tabela */}
            {carregando ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                <span>Carregando usuários...</span>
              </div>
            ) : usuarios.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                Nenhum usuário cadastrado além do administrador principal.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {usuarios.map((user) => {
                  const ehOwner = user.perfil === 'owner';
                  const ehAdmin = user.perfil === 'admin';
                  const fat = Number(user.faturamento_30d) || 0;
                  const count = Number(user.vendas_count_30d) || 0;
                  const perc = Number(user.percentual_participacao_30d) || 0;

                  return (
                    <div
                      key={user.id}
                      onClick={() => handleAbrirEdicao(user)}
                      className="py-3.5 px-2 flex items-center justify-between hover:bg-slate-800/50 rounded-2xl transition cursor-pointer group"
                    >
                      {/* Nome e Badge de Perfil */}
                      <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
                        <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center shrink-0 group-hover:border-emerald-500/40 transition">
                          {formatarIniciais(user.nome_completo)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs sm:text-sm text-slate-200 truncate group-hover:text-emerald-400 transition">
                              {user.nome_completo}
                            </span>

                            {ehOwner && (
                              <span className="text-[10px] bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-2 py-0.2 rounded-full font-black uppercase tracking-wider">
                                OWNER
                              </span>
                            )}

                            {ehAdmin && !ehOwner && (
                              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.2 rounded-full font-black uppercase tracking-wider">
                                ADMIN
                              </span>
                            )}

                            {!ehOwner && !ehAdmin && (
                              <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.2 rounded-full font-bold uppercase tracking-wider">
                                COMUM
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 truncate block mt-0.5">
                            {user.email}
                          </span>
                        </div>
                      </div>

                      {/* Faturamento */}
                      <div className="w-24 text-right text-xs font-semibold text-slate-300">
                        {fat > 0 ? `R$ ${fat.toFixed(2)}` : '-'}
                      </div>

                      {/* Vendas */}
                      <div className="w-16 text-right text-xs font-semibold text-slate-300">
                        {count > 0 ? count : '-'}
                      </div>

                      {/* % Participação */}
                      <div className="w-16 text-right text-xs font-bold text-emerald-400">
                        {perc > 0 ? `${perc.toFixed(1)}%` : '-'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* DRAWER / MODAL DE ADIÇÃO E EDIÇÃO */}
      <ModalUsuarioDrawer
        isOpen={modalDrawerAberto}
        onClose={() => setModalDrawerAberto(false)}
        usuarioEdicao={usuarioSelecionadoEdicao}
        lojaId={loja?.id || ''}
        onSalvo={carregarUsuariosEMetricas}
      />
    </div>
  );
};
