import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Gauge,
  RefreshCw,
  Settings,
  AlertTriangle,
  Calendar,
  Sparkles,
  ArrowUpRight,
  TrendingUp
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  dashboardService,
  PeriodoDashboard,
  METAS_PADRAO_LOJA
} from '../services/dashboardService';
import { MetricasCockpit, LojaMetas } from '../types';
import { CockpitGaugeF1 } from '../components/dashboard/CockpitGaugeF1';
import { ConfiguracoesMetas } from '../components/configuracoes/ConfiguracoesMetas';

export const DashboardCockpit: React.FC = () => {
  const navigate = useNavigate();
  const { loja, usuario } = useAuth();
  const permissions = usePermissions();

  // Controle de permissão para gestores
  const podeGerenciarMetas =
    permissions.ehOwner ||
    permissions.ehAdmin ||
    permissions.ehGerente ||
    permissions.podeAcessarConfig;

  // Estados principais
  const [periodo, setPeriodo] = useState<PeriodoDashboard>('mes');
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [modalMetasAberto, setModalMetasAberto] = useState<boolean>(false);

  // Dados das métricas e metas proporcionais
  const [metricas, setMetricas] = useState<MetricasCockpit>({
    faturamento: 0,
    pedidos: 0,
    ticket_medio: 0,
    cmv: 0,
    despesas: 0,
    lucro_liquido: 0,
    inadimplencia: 0,
    giro_estoque: 0
  });

  const [metasProporcionais, setMetasProporcionais] = useState<LojaMetas>({
    id: 'padrao',
    loja_id: loja?.id || '',
    ...METAS_PADRAO_LOJA
  });

  // Função para buscar dados consolidados
  const carregarMetricas = useCallback(async () => {
    if (!loja?.id) return;

    try {
      setCarregando(true);
      setErroCarregamento(null);

      const resultado = await dashboardService.obterMetricasCockpit(loja.id, periodo);
      setMetricas(resultado.metricas);
      setMetasProporcionais(resultado.metasProporcionais);
    } catch (err: any) {
      console.error('[DashboardCockpit] Erro ao carregar métricas:', err);
      setErroCarregamento('Não foi possível carregar os indicadores do cockpit no momento.');
    } finally {
      setCarregando(false);
    }
  }, [loja?.id, periodo]);

  useEffect(() => {
    carregarMetricas();
  }, [carregarMetricas]);

  // Opções de períodos do Segmented Control
  const opcoesPeriodo: { id: PeriodoDashboard; label: string }[] = [
    { id: 'hoje', label: 'Hoje' },
    { id: 'semana', label: 'Esta Semana' },
    { id: 'mes', label: 'Este Mês' },
    { id: 'ano', label: 'Este Ano' }
  ];

  // Saudação contextual ao usuário
  const nomeUsuario = usuario?.nome_completo ? usuario.nome_completo.split(' ')[0] : 'Gestor';

  return (
    <div className="min-h-full w-full bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* ========================================================================= */}
      {/* CABEÇALHO EXECUTIVO */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          
          {/* Título & Saudação */}
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm shadow-emerald-500/10">
                <Gauge className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <span>Dashboard Executivo</span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-400">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  Cockpit F1
                </span>
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              Olá, <span className="font-semibold text-slate-200">{nomeUsuario}</span> • Acompanhe o desempenho e as metas da sua operação em tempo real.
            </p>
          </div>

          {/* Segmented Control de Período & Ações Rápidas */}
          <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
            
            {/* Pílulas de Seleção Temporal */}
            <div className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-xl shadow-inner">
              {opcoesPeriodo.map((opt) => {
                const ativo = periodo === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPeriodo(opt.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                      ativo
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Botão de Atualização Rápida */}
            <button
              type="button"
              onClick={carregarMetricas}
              disabled={carregando}
              title="Recarregar Indicadores"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            {/* Atalho para Configurar Metas (Gestores) */}
            {podeGerenciarMetas && (
              <button
                type="button"
                onClick={() => setModalMetasAberto(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 hover:bg-slate-850 text-slate-200 hover:text-emerald-400 text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-sm group"
              >
                <Settings className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 group-hover:rotate-45 transition-transform duration-200" />
                <span>Configurar Metas</span>
              </button>
            )}

          </div>

        </div>
      </header>

      {/* ========================================================================= */}
      {/* CONTEÚDO PRINCIPAL (GRID DOS 6 VELOCÍMETROS) */}
      {/* ========================================================================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Banner de Erro com Retry */}
        {erroCarregamento && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-center justify-between text-xs text-rose-300 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{erroCarregamento}</span>
            </div>
            <button
              type="button"
              onClick={carregarMetricas}
              className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold transition cursor-pointer"
            >
              Tentar Novamente
            </button>
          </div>
        )}

        {/* Grid dos 6 Cockpits Esportivos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          
          {/* 1. FATURAMENTO BRUTO */}
          <CockpitGaugeF1
            titulo="Faturamento Bruto"
            valorRealizado={metricas.faturamento}
            valorMeta={metasProporcionais.meta_faturamento}
            tipoFormato="moeda"
            isLoading={carregando}
            onClickDrillDown={() => navigate('/analytics')}
          />

          {/* 2. VOLUME DE PEDIDOS */}
          <CockpitGaugeF1
            titulo="Volume de Pedidos"
            valorRealizado={metricas.pedidos}
            valorMeta={metasProporcionais.meta_pedidos}
            tipoFormato="inteiro"
            isLoading={carregando}
            onClickDrillDown={() => navigate('/sales')}
          />

          {/* 3. LUCRO LÍQUIDO REAL */}
          <CockpitGaugeF1
            titulo="Lucro Líquido Real"
            valorRealizado={metricas.lucro_liquido}
            valorMeta={metasProporcionais.meta_lucro_liquido}
            tipoFormato="moeda"
            isLoading={carregando}
            onClickDrillDown={() => navigate('/finances')}
          />

          {/* 4. TICKET MÉDIO */}
          <CockpitGaugeF1
            titulo="Ticket Médio"
            valorRealizado={metricas.ticket_medio}
            valorMeta={metasProporcionais.meta_ticket_medio}
            tipoFormato="moeda"
            isLoading={carregando}
            onClickDrillDown={() => navigate('/analytics')}
          />

          {/* 5. INADIMPLÊNCIA FIADO (ESCALA INVERTIDA) */}
          <CockpitGaugeF1
            titulo="Inadimplência Fiado"
            valorRealizado={metricas.inadimplencia}
            valorMeta={metasProporcionais.meta_inadimplencia_maxima}
            tipoFormato="percentual"
            escalaInvertida={true}
            isLoading={carregando}
            onClickDrillDown={() => navigate('/customers')}
          />

          {/* 6. GIRO DE ESTOQUE */}
          <CockpitGaugeF1
            titulo="Giro de Estoque"
            valorRealizado={metricas.giro_estoque}
            valorMeta={metasProporcionais.meta_giro_estoque}
            tipoFormato="percentual"
            isLoading={carregando}
            onClickDrillDown={() => navigate('/products')}
          />

        </div>

        {/* Rodapé Informativo Executivo */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Valores sincronizados com o motor de apuração financeira e estoque do HUBI.
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Clique em qualquer velocímetro para ver detalhes da métrica.</span>
          </div>
        </div>

      </main>

      {/* ========================================================================= */}
      {/* MODAL DE AJUSTE RÁPIDO DE METAS */}
      {/* ========================================================================= */}
      {modalMetasAberto && (
        <ConfiguracoesMetas
          lojaId={loja?.id}
          isModal={true}
          onClose={() => setModalMetasAberto(false)}
          onSucessoSalvar={(novasMetas) => {
            setModalMetasAberto(false);
            carregarMetricas();
          }}
        />
      )}

    </div>
  );
};
