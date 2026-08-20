import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  BarChart3,
  Loader2,
  Shield,
  Crown
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { UsuarioLoja, MetricasUsuario } from '../types';
import { ModalUsuarioDrawer } from './ModalUsuarioDrawer';

export const UsuariosGestao: React.FC = () => {
  const navigate = useNavigate();
  const { loja } = useAuth();

  const [usuarios, setUsuarios] = useState<UsuarioLoja[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [modalDrawerAberto, setModalDrawerAberto] = useState<boolean>(false);
  const [usuarioSelecionadoEdicao, setUsuarioSelecionadoEdicao] = useState<UsuarioLoja | null>(null);

  // Métricas dos últimos 30 dias gerais da loja
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

      // 2. Definir marcos temporais para as métricas
      const agora = new Date();
      
      const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
      
      const inicioOntem = new Date(inicioHoje);
      inicioOntem.setDate(inicioOntem.getDate() - 1);
      const fimOntem = new Date(inicioHoje);

      const diaSemana = agora.getDay();
      const diffParaSegunda = (diaSemana + 6) % 7;
      const inicioSemana = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - diffParaSegunda);

      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

      // 3. Buscar pedidos relevantes para calcular estatísticas
      const { data: pedidosData } = await supabase
        .from('pedidos')
        .select('id, vendedor_id, valor_total, data_venda, status')
        .eq('loja_id', loja.id)
        .gte('data_venda', trintaDiasAtras.toISOString())
        .neq('status', 'cancelado');

      const pedidosValidos = pedidosData || [];
      
      const faturamentoTotalGeral = pedidosValidos.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
      const totalQtdVendas = pedidosValidos.length;

      setTotalFaturamento30d(faturamentoTotalGeral);
      setTotalVendas30d(totalQtdVendas);

      // 4. Calcular métricas detalhadas por colaborador
      const listaComEstatisticas: UsuarioLoja[] = (usersData || []).map((u: any) => {
        const pedidosDoUsuario = pedidosValidos.filter(p => p.vendedor_id === u.id);

        const pedidosHoje = pedidosDoUsuario.filter(p => new Date(p.data_venda) >= inicioHoje);
        const pedidosOntem = pedidosDoUsuario.filter(p => {
          const d = new Date(p.data_venda);
          return d >= inicioOntem && d < fimOntem;
        });
        const pedidosSemana = pedidosDoUsuario.filter(p => new Date(p.data_venda) >= inicioSemana);
        const pedidosMes = pedidosDoUsuario.filter(p => new Date(p.data_venda) >= inicioMes);

        const fatHoje = pedidosHoje.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
        const fatOntem = pedidosOntem.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
        const fatSemana = pedidosSemana.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
        const fatMes = pedidosMes.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
        const fat30d = pedidosDoUsuario.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
        
        const count30d = pedidosDoUsuario.length;
        const percUser = faturamentoTotalGeral > 0 ? (fat30d / faturamentoTotalGeral) * 100 : 0;

        const metricas: MetricasUsuario = {
          hoje_vendas: pedidosHoje.length,
          hoje_faturamento: fatHoje,
          ontem_vendas: pedidosOntem.length,
          ontem_faturamento: fatOntem,
          semana_vendas: pedidosSemana.length,
          semana_faturamento: fatSemana,
          mes_vendas: pedidosMes.length,
          mes_faturamento: fatMes,
          dias30_vendas: count30d,
          dias30_faturamento: fat30d,
          percentual_participacao_30d: percUser
        };

        return {
          ...u,
          faturamento_30d: fat30d,
          vendas_count_30d: count30d,
          percentual_participacao_30d: percUser,
          metricas
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
    <div className="h-full flex flex-col overflow-y-auto bg-slate-950 p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* CABEÇALHO SUPERIOR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto w-full">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-100 flex items-center gap-3">
            <span>Usuários</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Gerencie sua equipe, permissões de acesso e acompanhe o faturamento por colaborador.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAbrirAdicionar}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/25 transition cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Usuários</span>
          </button>
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL (CARD LATERAL DE FATURAMENTO + TABELA) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto w-full items-start">
        
        {/* CARD LATERAL ESQUERDO: FATURAMENTO POR USUÁRIO */}
        <div className="lg:col-span-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col items-center justify-between min-h-[360px] text-center space-y-6">
            <div className="w-full text-left space-y-1">
              <h2 className="text-base font-bold text-slate-100">Faturamento por usuário</h2>
              <span className="text-xs text-slate-400 font-medium">Últimos 30 dias</span>
            </div>

            {/* Gráfico circular donut minimalista estilizado (estilo Kyte) */}
            <div className="relative flex items-center justify-center my-2">
              <div className="w-36 h-36 rounded-full bg-emerald-500/20 flex items-center justify-center border-4 border-emerald-500/30 shadow-inner">
                <div className="w-24 h-24 rounded-full bg-slate-900 flex flex-col items-center justify-center">
                  <Users className="w-8 h-8 text-emerald-400/80" />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">
                {totalVendas30d} {totalVendas30d === 1 ? 'VENDA' : 'VENDAS'}
              </span>
              <span className="text-2xl sm:text-3xl font-black text-slate-100 block">
                R$ {totalFaturamento30d.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <button
              type="button"
              onClick={() => navigate('/analytics')}
              className="w-full py-2.5 text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center justify-center gap-2 transition cursor-pointer hover:underline border-t border-slate-800/80 pt-4"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Ver mais estatísticas</span>
            </button>
          </div>
        </div>

        {/* TABELA / LISTA DE COLABORADORES */}
        <div className="lg:col-span-8">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
            
            {/* Título da Tabela */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5 text-xs text-slate-400 font-bold uppercase tracking-wider px-3">
              <div className="flex-1">Nome</div>
              <div className="w-28 text-right">Faturamento</div>
              <div className="w-16 text-right">Vendas</div>
              <div className="w-16 text-right">%</div>
            </div>

            {/* Linhas da Tabela */}
            {carregando ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3 text-slate-400 text-xs">
                <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
                <span>Carregando equipe de usuários...</span>
              </div>
            ) : usuarios.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-xs space-y-2">
                <Users className="w-8 h-8 text-slate-600 mx-auto" />
                <p>Nenhum usuário cadastrado além do proprietário principal.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/70">
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
                      className="py-4 px-3 flex items-center justify-between hover:bg-slate-800/60 rounded-2xl transition cursor-pointer group"
                    >
                      {/* Nome e Badge de Perfil */}
                      <div className="flex items-center gap-3.5 flex-1 min-w-0 pr-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center shrink-0 group-hover:border-emerald-500/50 group-hover:bg-slate-750 transition">
                          {formatarIniciais(user.nome_completo)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-200 truncate group-hover:text-emerald-400 transition">
                              {user.nome_completo}
                            </span>

                            {ehOwner && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-teal-500/15 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                <Crown className="w-2.5 h-2.5" />
                                OWNER
                              </span>
                            )}

                            {ehAdmin && !ehOwner && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                <Shield className="w-2.5 h-2.5" />
                                ADMIN
                              </span>
                            )}

                            {!ehOwner && !ehAdmin && (
                              <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                COMUM
                              </span>
                            )}

                            {!user.ativo && (
                              <span className="text-[10px] bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                INATIVO
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 truncate block mt-0.5">
                            {user.email}
                          </span>
                        </div>
                      </div>

                      {/* Faturamento */}
                      <div className="w-28 text-right text-xs font-semibold text-slate-200">
                        {fat > 0 ? `R$ ${fat.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
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

      {/* DRAWER / PAINEL UNIFICADO DE ADIÇÃO E EDIÇÃO */}
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
