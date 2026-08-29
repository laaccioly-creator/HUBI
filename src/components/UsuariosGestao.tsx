import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  BarChart3,
  Loader2,
  Shield,
  Crown,
  ArrowLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { UsuarioLoja, MetricasUsuario } from '../types';
import { ModalUsuarioDrawer } from './ModalUsuarioDrawer';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';

const CORES_PALETA = [
  '#10B981', // Emerald
  '#6366F1', // Indigo
  '#3B82F6', // Blue
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#06B6D4', // Cyan
  '#84CC16'  // Lime
];

export const UsuariosGestao: React.FC = () => {
  const navigate = useNavigate();
  const { loja } = useAuth();
  const permissions = usePermissions();

  useEffect(() => {
    if (!permissions.podeAcessarUsuarios) {
      navigate('/pos');
    }
  }, [permissions.podeAcessarUsuarios, navigate]);

  const [usuarios, setUsuarios] = useState<UsuarioLoja[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [modalDrawerAberto, setModalDrawerAberto] = useState<boolean>(false);
  const [drawerMenuAberto, setDrawerMenuAberto] = useState<boolean>(false);
  const [usuarioSelecionadoEdicao, setUsuarioSelecionadoEdicao] = useState<UsuarioLoja | null>(null);
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);

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

      // 3. Buscar pedidos relevantes para calcular estatísticas (Apenas pagos/parcialmente pagos - Item 9)
      const { data: pedidosData } = await supabase
        .from('pedidos')
        .select('id, vendedor_id, valor_total, valor_pago, saldo_devedor, data_venda, criado_em, status')
        .eq('loja_id', loja.id)
        .gte('data_venda', trintaDiasAtras.toISOString())
        .neq('status', 'cancelado')
        .neq('status', 'pendente');

      const obterValorEfetivo = (p: any): number => {
        const statusPag = (p as any).status_pagamento || (Number(p.saldo_devedor) <= 0 && Number(p.valor_pago) > 0 ? 'pago' : Number(p.valor_pago) > 0 ? 'parcialmente_pago' : 'aguardando_pagamento');
        if (statusPag === 'pago') return Number(p.valor_pago || p.valor_total || 0);
        if (statusPag === 'parcialmente_pago') return Number(p.valor_pago || 0);
        return 0;
      };

      const pedidosValidos = (pedidosData || []).filter(p => {
        const st = String(p.status || '').toLowerCase();
        if (st === 'cancelado' || st === 'pendente') return false;

        const statusPag = (p as any).status_pagamento || (Number(p.saldo_devedor) <= 0 && Number(p.valor_pago) > 0 ? 'pago' : Number(p.valor_pago) > 0 ? 'parcialmente_pago' : 'aguardando_pagamento');
        if (statusPag !== 'pago' && statusPag !== 'parcialmente_pago') return false;

        return obterValorEfetivo(p) > 0;
      });
      
      const faturamentoTotalGeral = pedidosValidos.reduce((acc, p) => acc + obterValorEfetivo(p), 0);
      const totalQtdVendas = pedidosValidos.length;

      setTotalFaturamento30d(faturamentoTotalGeral);
      setTotalVendas30d(totalQtdVendas);

      // 4. Calcular métricas detalhadas por colaborador
      const listaComEstatisticas: UsuarioLoja[] = (usersData || []).map((u: any) => {
        const pedidosDoUsuario = pedidosValidos.filter(p => p.vendedor_id === u.id);

        const pedidosHoje = pedidosDoUsuario.filter(p => new Date(p.data_venda || p.criado_em) >= inicioHoje);
        const pedidosOntem = pedidosDoUsuario.filter(p => {
          const d = new Date(p.data_venda || p.criado_em);
          return d >= inicioOntem && d < fimOntem;
        });
        const pedidosSemana = pedidosDoUsuario.filter(p => new Date(p.data_venda || p.criado_em) >= inicioSemana);
        const pedidosMes = pedidosDoUsuario.filter(p => new Date(p.data_venda || p.criado_em) >= inicioMes);

        const fatHoje = pedidosHoje.reduce((acc, p) => acc + obterValorEfetivo(p), 0);
        const fatOntem = pedidosOntem.reduce((acc, p) => acc + obterValorEfetivo(p), 0);
        const fatSemana = pedidosSemana.reduce((acc, p) => acc + obterValorEfetivo(p), 0);
        const fatMes = pedidosMes.reduce((acc, p) => acc + obterValorEfetivo(p), 0);
        const fat30d = pedidosDoUsuario.reduce((acc, p) => acc + obterValorEfetivo(p), 0);
        
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

  // Estrutura dos dados para o Gráfico de Pizza
  const dadosGraficoUsuarios = useMemo(() => {
    const lista: { id: string; nome: string; valor: number; vendas: number; percentual: number; cor: string }[] = [];

    usuarios.forEach((u, idx) => {
      const fat = Number(u.faturamento_30d) || 0;
      const vendas = Number(u.vendas_count_30d) || 0;
      const perc = Number(u.percentual_participacao_30d) || 0;
      if (fat > 0 || vendas > 0) {
        lista.push({
          id: u.id,
          nome: u.nome_completo,
          valor: fat,
          vendas: vendas,
          percentual: perc,
          cor: CORES_PALETA[idx % CORES_PALETA.length]
        });
      }
    });

    // Checar se há vendas sem vendedor atribuído (ex: catálogo online ou avulso)
    const totalAtribuido = lista.reduce((acc, i) => acc + i.valor, 0);
    const totalVendasAtribuidas = lista.reduce((acc, i) => acc + i.vendas, 0);
    const fatRestante = Math.max(0, totalFaturamento30d - totalAtribuido);
    const vendasRestantes = Math.max(0, totalVendas30d - totalVendasAtribuidas);

    if (fatRestante > 0.01 || vendasRestantes > 0) {
      const percRestante = totalFaturamento30d > 0 ? (fatRestante / totalFaturamento30d) * 100 : 0;
      lista.push({
        id: 'catalogo_ou_balcao',
        nome: 'Catálogo / Venda Direta',
        valor: fatRestante,
        vendas: vendasRestantes,
        percentual: percRestante,
        cor: CORES_PALETA[lista.length % CORES_PALETA.length]
      });
    }

    return lista;
  }, [usuarios, totalFaturamento30d, totalVendas30d]);

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

  // Renderizar Gráfico Donut/Pizza Interativo
  const renderGraficoPizza = () => {
    if (dadosGraficoUsuarios.length === 0 || totalFaturamento30d === 0) {
      return (
        <div className="relative flex items-center justify-center my-2">
          <div className="w-40 h-40 rounded-full bg-slate-800/40 flex items-center justify-center border-4 border-slate-700/50 shadow-inner">
            <div className="w-24 h-24 rounded-full bg-slate-900 flex flex-col items-center justify-center text-center p-2">
              <Users className="w-6 h-6 text-slate-500 mb-1" />
              <span className="text-[10px] text-slate-500 font-medium">Sem vendas</span>
            </div>
          </div>
        </div>
      );
    }

    const radius = 56;
    const strokeWidth = 22;
    const circumference = 2 * Math.PI * radius;
    const hoveredItem = dadosGraficoUsuarios.find(u => u.id === hoveredUserId);
    let currentAccumulated = 0;

    return (
      <div className="relative flex flex-col items-center justify-center my-2 select-none w-full">
        <div className="relative w-44 h-44 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
            {/* Fundo do círculo */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="transparent"
              stroke="#1E293B"
              strokeWidth={strokeWidth}
            />
            {dadosGraficoUsuarios.map((item) => {
              const isHovered = hoveredUserId === item.id;
              const strokeDasharray = `${(item.percentual / 100) * circumference} ${circumference}`;
              const strokeDashoffset = -((currentAccumulated / 100) * circumference);
              currentAccumulated += item.percentual;

              return (
                <circle
                  key={item.id}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="transparent"
                  stroke={item.cor}
                  strokeWidth={isHovered ? strokeWidth + 2 : strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-200 cursor-pointer"
                  style={{
                    filter: isHovered ? 'brightness(1.15)' : 'none',
                    opacity: hoveredUserId && !isHovered ? 0.75 : 1
                  }}
                  onMouseEnter={() => setHoveredUserId(item.id)}
                  onMouseLeave={() => setHoveredUserId(null)}
                />
              );
            })}
          </svg>

          {/* Informações no Centro da Pizza / Donut */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center pointer-events-none transition-all duration-200">
            {hoveredItem ? (
              <div className="animate-in fade-in zoom-in-95 flex flex-col items-center justify-center">
                <span className="text-[11px] font-bold text-slate-200 truncate max-w-[110px]" title={hoveredItem.nome}>
                  {hoveredItem.nome}
                </span>
                <span className="text-base font-black text-slate-100 mt-0.5">
                  {hoveredItem.percentual.toFixed(1)}%
                </span>
                <span className="text-[11px] font-bold text-emerald-400">
                  R$ {hoveredItem.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-slate-400 font-medium">
                  {hoveredItem.vendas} {hoveredItem.vendas === 1 ? 'venda' : 'vendas'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <Users className="w-5 h-5 text-emerald-400 mb-0.5" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {totalVendas30d} {totalVendas30d === 1 ? 'VENDA' : 'VENDAS'}
                </span>
                <span className="text-xs font-black text-slate-200">100,0%</span>
              </div>
            )}
          </div>
        </div>

        {/* Mini legenda com cores das fatias */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 max-w-[280px]">
          {dadosGraficoUsuarios.map((item) => (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => setHoveredUserId(item.id)}
              onMouseLeave={() => setHoveredUserId(null)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] transition cursor-pointer border ${
                hoveredUserId === item.id
                  ? 'bg-slate-800 text-slate-100 border-emerald-500/50 shadow-sm'
                  : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.cor }} />
              <span className="truncate max-w-[75px] font-semibold">{item.nome.split(' ')[0]}</span>
              <span className="font-bold text-slate-200">{item.percentual.toFixed(1)}%</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full w-full overflow-hidden select-none">
      {/* 1. VISÃO MOBILE EXCLUSIVA (TEMA CLARO PADRÃO PEDIDOS/PRODUTOS) */}
      <div className="block md:hidden h-full flex flex-col overflow-y-auto bg-slate-50 text-slate-900 font-sans">
        {/* Header Superior Mobile */}
        <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0">
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
              onClick={() => setDrawerMenuAberto(true)}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition cursor-pointer"
              title="Menu Principal"
            >
              <div className="space-y-1">
                <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
                <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
                <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
              </div>
            </button>
            <h1 className="font-bold text-base text-slate-800">Usuários ({usuarios.length})</h1>
          </div>

          <button
            type="button"
            onClick={handleAbrirAdicionar}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Novo</span>
          </button>
        </div>

        {/* Conteúdo Mobile com Scroll */}
        <div className="p-4 space-y-4 flex-1">
          {/* Gráfico Donut de Desempenho em Card Branco */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-2">
            <span className="text-xs font-bold text-slate-700 block">Vendas por Colaborador (30 dias)</span>
            {renderGraficoPizza()}
          </div>

          {/* Lista de Colaboradores em Cards Brancos */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block px-1">
              Colaboradores Cadastrados ({usuarios.length})
            </span>

            {carregando ? (
              <div className="text-center py-12 text-xs text-slate-400">Carregando equipe...</div>
            ) : (
              usuarios.map((u) => {
                const isAdmin = u.perfil === 'admin' || u.perfil === 'owner';
                const fat = Number(u.faturamento_30d) || 0;
                const cor = dadosGraficoUsuarios.find(d => d.id === u.id)?.cor || '#10B981';

                return (
                  <div
                    key={u.id}
                    onClick={() => handleAbrirEdicao(u)}
                    className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-xs"
                        style={{ backgroundColor: cor }}
                      >
                        {formatarIniciais(u.nome_completo)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800 text-xs sm:text-sm truncate">
                            {u.nome_completo}
                          </span>
                          {isAdmin ? (
                            <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          ) : (
                            <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 block truncate">
                          {u.email || (isAdmin ? 'Administrador' : 'Vendedor')}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-black text-slate-900 text-xs sm:text-sm block">
                        R$ {fat.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400">30 dias</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Menu Gaveta Lateral */}
        <MobileMenuDrawer
          aberto={drawerMenuAberto}
          onFechar={() => setDrawerMenuAberto(false)}
        />
      </div>

      {/* 2. VISÃO DESKTOP (100% PRESERVADA NO TEMA ESCURO ORIGINAL) */}
      <div className="hidden md:flex flex-col h-full overflow-y-auto bg-slate-950 p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* CABEÇALHO SUPERIOR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition cursor-pointer"
            title="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-100 flex items-center gap-3">
              <span>Usuários</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Gerencie sua equipe, permissões de acesso e acompanhe o faturamento por colaborador.
            </p>
          </div>
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
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col items-center justify-between min-h-[380px] text-center space-y-4">
            <div className="w-full text-left space-y-1">
              <h2 className="text-base font-bold text-slate-100">Faturamento por usuário</h2>
              <span className="text-xs text-slate-400 font-medium">Últimos 30 dias</span>
            </div>

            {/* Gráfico de Pizza / Donut Interativo */}
            {renderGraficoPizza()}

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
                  const corUser = dadosGraficoUsuarios.find(d => d.id === user.id)?.cor || '#64748B';
                  const isHovered = hoveredUserId === user.id;

                  return (
                    <div
                      key={user.id}
                      onClick={() => handleAbrirEdicao(user)}
                      onMouseEnter={() => setHoveredUserId(user.id)}
                      onMouseLeave={() => setHoveredUserId(null)}
                      className={`py-4 px-3 flex items-center justify-between rounded-2xl transition cursor-pointer group ${
                        isHovered ? 'bg-slate-800/90 ring-1 ring-emerald-500/40 shadow-md' : 'hover:bg-slate-800/60'
                      }`}
                    >
                      {/* Nome e Badge de Perfil */}
                      <div className="flex items-center gap-3.5 flex-1 min-w-0 pr-3">
                        <div
                          className="w-10 h-10 rounded-xl bg-slate-800 border text-slate-200 font-bold text-xs flex items-center justify-center shrink-0 transition"
                          style={{ borderColor: isHovered ? corUser : '#334155' }}
                        >
                          {formatarIniciais(user.nome_completo)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: corUser }} />
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
