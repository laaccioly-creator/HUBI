import React, { useState, useEffect, useCallback } from 'react';
import {
  Gauge,
  RefreshCw,
  Settings,
  AlertTriangle,
  Calendar,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Zap
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  dashboardService,
  TipoPeriodoDashboard,
  PERIODOS_DASHBOARD_OPCOES,
  METAS_PADRAO_LOJA
} from '../services/dashboardService';
import {
  dashboardJevService,
  PayloadDashboardExecutivo,
  ProdutoEstoqueRisco
} from '../services/dashboardJevService';
import { MetricasCockpit, LojaMetas, Produto } from '../types';
import { CockpitGaugeF1 } from '../components/dashboard/CockpitGaugeF1';
import {
  CockpitMetricDrawer,
  TipoMetricaCockpitDrawer
} from '../components/dashboard/CockpitMetricDrawer';
import { ConfiguracoesMetas } from '../components/configuracoes/ConfiguracoesMetas';
import { ModalEntradaEstoque } from '../components/ModalEntradaEstoque';
import { useRegisterOverlay } from '../hooks/useRegisterOverlay';
import { supabase } from '../lib/supabase';

export const DashboardCockpit: React.FC = () => {
  const { loja, usuario } = useAuth();
  const permissions = usePermissions();

  // Controle de permissão para gestores
  const podeGerenciarMetas =
    permissions.ehOwner ||
    permissions.ehAdmin ||
    permissions.ehGerente ||
    permissions.podeAcessarConfig;

  // Estados principais do seletor de período padronizado
  const [tipoPeriodo, setTipoPeriodo] = useState<TipoPeriodoDashboard>('este_mes');
  const [periodoOffset, setPeriodoOffset] = useState<number>(0);
  const [dropdownPeriodoAberto, setDropdownPeriodoAberto] = useState<boolean>(false);
  const [dataInicioCustom, setDataInicioCustom] = useState<string>('');
  const [dataFimCustom, setDataFimCustom] = useState<string>('');

  const [carregando, setCarregando] = useState<boolean>(true);
  const [revalidando, setRevalidando] = useState<boolean>(false);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [modalMetasAberto, setModalMetasAberto] = useState<boolean>(false);

  // Estados da Gaveta Lateral e Entrada de Estoque
  const [drawerMetrica, setDrawerMetrica] = useState<TipoMetricaCockpitDrawer | null>(null);
  const [modalEntradaAberto, setModalEntradaAberto] = useState<boolean>(false);
  const [produtoSelecionadoEntrada, setProdutoSelecionadoEntrada] = useState<Produto | null>(null);

  // Registro na pilha de navegação para tecla ESC e botão Voltar Mobile
  useRegisterOverlay(drawerMetrica !== null, () => setDrawerMetrica(null), 'cockpit-metric-drawer');
  useRegisterOverlay(modalEntradaAberto, () => {
    setModalEntradaAberto(false);
    setProdutoSelecionadoEntrada(null);
  }, 'cockpit-modal-entrada');
  useRegisterOverlay(modalMetasAberto, () => setModalMetasAberto(false), 'cockpit-modal-metas');

  // Payload Executivo Consolidado fornecido pelo Jev (Type-Safe Schema)
  const [payloadExecutivo, setPayloadExecutivo] = useState<PayloadDashboardExecutivo | null>(null);

  // Dados das métricas e metas proporcionais
  const [metricas, setMetricas] = useState<MetricasCockpit>({
    faturamento: 0,
    pedidos: 0,
    ticket_medio: 0,
    cmv: 0,
    despesas: 0,
    lucro_liquido: 0,
    inadimplencia: 0,
    giro_estoque: 0,
    saude_estoque: 0
  });

  const [metasProporcionais, setMetasProporcionais] = useState<LojaMetas>({
    id: 'padrao',
    loja_id: loja?.id || '',
    ...METAS_PADRAO_LOJA
  });

  // Cálculo da resolução de período atual
  const infoIntervalo = dashboardService.resolverIntervaloPeriodo(
    tipoPeriodo,
    periodoOffset,
    dataInicioCustom,
    dataFimCustom
  );
  const labelExibicaoPeriodo = infoIntervalo.label;

  // Função para buscar dados consolidados com SWR (0 ms no retorno ao Dashboard)
  const carregarMetricas = useCallback(async (forcar = false) => {
    if (!loja?.id) return;

    try {
      if (forcar) {
        setCarregando(true);
      }
      setErroCarregamento(null);

      const res = await dashboardJevService.obterDashboardExecutivo({
        lojaId: loja.id,
        tipoPeriodo,
        periodoOffset,
        dataInicioCustom,
        dataFimCustom,
        forcarAtualizacao: forcar,
        onBackgroundUpdate: (novoPayload) => {
          setPayloadExecutivo(novoPayload);
          setMetricas(novoPayload.metricas);
          setMetasProporcionais(novoPayload.metasProporcionais);
          setRevalidando(false);
        }
      });

      setPayloadExecutivo(res.payload);
      setMetricas(res.payload.metricas);
      setMetasProporcionais(res.payload.metasProporcionais);
      setRevalidando(res.isStale);
    } catch (err: any) {
      console.error('[DashboardCockpit] Erro ao carregar métricas:', err);
      setErroCarregamento('Não foi possível carregar os indicadores do cockpit no momento.');
    } finally {
      setCarregando(false);
    }
  }, [loja?.id, tipoPeriodo, periodoOffset, dataInicioCustom, dataFimCustom]);

  useEffect(() => {
    carregarMetricas();
  }, [tipoPeriodo, periodoOffset, dataInicioCustom, dataFimCustom, loja?.id]);

  // Ação de abertura de estoque a partir da gaveta lateral
  const handleAbrirEntradaEstoque = async (prodRisco?: ProdutoEstoqueRisco) => {
    if (prodRisco && loja?.id) {
      try {
        const { data } = await supabase
          .from('produtos')
          .select('*')
          .eq('id', prodRisco.id)
          .eq('loja_id', loja.id)
          .maybeSingle();

        setProdutoSelecionadoEntrada((data as Produto) || null);
      } catch {
        setProdutoSelecionadoEntrada(null);
      }
    } else {
      setProdutoSelecionadoEntrada(null);
    }
    setModalEntradaAberto(true);
  };

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

          {/* Seletor de Período Padronizado & Ações Rápidas */}
          <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
            
            {/* Seletor Kyte Style de Períodos */}
            <div className="relative flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setPeriodoOffset(prev => prev - 1)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition cursor-pointer"
                title="Período Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="relative min-w-[130px] sm:min-w-[160px] text-center">
                <button
                  type="button"
                  onClick={() => setDropdownPeriodoAberto(prev => !prev)}
                  className="w-full px-2 py-1 text-xs font-bold text-slate-200 hover:text-emerald-400 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 text-emerald-400 opacity-80" />
                  <span>{labelExibicaoPeriodo}</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>

                {/* Dropdown de 9 Opções de Período */}
                {dropdownPeriodoAberto && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setDropdownPeriodoAberto(false)}
                    />
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 text-left space-y-0.5 animate-in fade-in zoom-in-95">
                      {PERIODOS_DASHBOARD_OPCOES.map((op) => (
                        <button
                          key={op.id}
                          type="button"
                          onClick={() => {
                            setTipoPeriodo(op.id);
                            setPeriodoOffset(0);
                            setDropdownPeriodoAberto(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                            tipoPeriodo === op.id
                              ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span>{op.label}</span>
                          {tipoPeriodo === op.id && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setPeriodoOffset(prev => prev + 1)}
                disabled={periodoOffset >= 0}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title="Próximo Período"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Inputs de Data Customizada quando 'personalizado' */}
            {tipoPeriodo === 'personalizado' && (
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 font-medium">De:</span>
                  <input
                    type="date"
                    value={dataInicioCustom}
                    onChange={(e) => setDataInicioCustom(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-0.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 font-medium">Até:</span>
                  <input
                    type="date"
                    value={dataFimCustom}
                    onChange={(e) => setDataFimCustom(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-0.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            {/* Indicador de Revalidação SWR em Background */}
            {revalidando && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium animate-pulse">
                <Zap className="w-3 h-3 text-emerald-400" />
                <span>Atualizando dados...</span>
              </span>
            )}

            {/* Botão de Atualização Rápida */}
            <button
              type="button"
              onClick={() => carregarMetricas(true)}
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
              onClick={() => carregarMetricas(true)}
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
            isLoading={carregando && !payloadExecutivo}
            onClickDrillDown={() => setDrawerMetrica('faturamento')}
          />

          {/* 2. VOLUME DE PEDIDOS */}
          <CockpitGaugeF1
            titulo="Volume de Pedidos"
            valorRealizado={metricas.pedidos}
            valorMeta={metasProporcionais.meta_pedidos}
            tipoFormato="inteiro"
            isLoading={carregando && !payloadExecutivo}
            onClickDrillDown={() => setDrawerMetrica('pedidos')}
          />

          {/* 3. LUCRO LÍQUIDO REAL */}
          <CockpitGaugeF1
            titulo="Lucro Líquido Real"
            valorRealizado={metricas.lucro_liquido}
            valorMeta={metasProporcionais.meta_lucro_liquido}
            tipoFormato="moeda"
            isLoading={carregando && !payloadExecutivo}
            onClickDrillDown={() => setDrawerMetrica('lucro')}
          />

          {/* 4. TICKET MÉDIO */}
          <CockpitGaugeF1
            titulo="Ticket Médio"
            valorRealizado={metricas.ticket_medio}
            valorMeta={metasProporcionais.meta_ticket_medio}
            tipoFormato="moeda"
            isLoading={carregando && !payloadExecutivo}
            onClickDrillDown={() => setDrawerMetrica('ticket')}
          />

          {/* 5. INADIMPLÊNCIA FIADO (ESCALA INVERTIDA) */}
          <CockpitGaugeF1
            titulo="Inadimplência Fiado"
            valorRealizado={metricas.inadimplencia}
            valorMeta={metasProporcionais.meta_inadimplencia_maxima}
            tipoFormato="percentual"
            escalaInvertida={true}
            isLoading={carregando && !payloadExecutivo}
            onClickDrillDown={() => setDrawerMetrica('inadimplencia')}
          />

          {/* 6. SAÚDE DO ESTOQUE (HÍBRIDO: FASE 1 ESTOQUE MÍNIMO / FASE 2 CURVA ABC) */}
          {(() => {
            const metaRupturaEstoque = Number(
              metasProporcionais.meta_saude_estoque_max_ruptura !== undefined && metasProporcionais.meta_saude_estoque_max_ruptura !== null
                ? metasProporcionais.meta_saude_estoque_max_ruptura
                : (metasProporcionais.meta_giro_estoque ?? 0)
            );
            const totalItensEmRisco = payloadExecutivo?.decomposicoes.saudeEstoque.totalItensEmRisco ?? metricas.saude_estoque_itens_risco ?? 0;

            return (
              <CockpitGaugeF1
                titulo="Saúde do Estoque"
                subtituloTag={payloadExecutivo?.decomposicoes.saudeEstoque.subtituloTag || 'Base: Estoque Mínimo Geral'}
                valorRealizado={totalItensEmRisco}
                valorMeta={metaRupturaEstoque}
                tipoFormato="inteiro"
                escalaInvertida={true}
                valorExibicaoCustomizado={`${totalItensEmRisco} em risco`}
                metaExibicaoCustomizada={`${metaRupturaEstoque} ${metaRupturaEstoque === 1 ? 'ruptura' : 'rupturas'}`}
                isLoading={carregando && !payloadExecutivo}
                onClickDrillDown={() => setDrawerMetrica('saude_estoque')}
              />
            );
          })()}

        </div>

        {/* Rodapé Informativo Executivo */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Valores pré-computados com inteligência TypeSafe Jev (System 1) e sincronizados em tempo real.
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Clique em qualquer velocímetro para auditar a decomposição analítica.</span>
          </div>
        </div>

      </main>

      {/* ========================================================================= */}
      {/* GAVETA LATERAL DE AUDITORIA E DECOMPOSIÇÃO DAS MÉTRICAS */}
      {/* ========================================================================= */}
      <CockpitMetricDrawer
        isOpen={drawerMetrica !== null}
        onClose={() => setDrawerMetrica(null)}
        tipoMetrica={drawerMetrica}
        payload={payloadExecutivo}
        onAbrirEntradaEstoque={handleAbrirEntradaEstoque}
      />

      {/* ========================================================================= */}
      {/* MODAL DE ENTRADA RÁPIDA DE ESTOQUE (ACIONADO VIA GAVETA LATERAL) */}
      {/* ========================================================================= */}
      {modalEntradaAberto && (
        <ModalEntradaEstoque
          isOpen={modalEntradaAberto}
          onClose={() => {
            setModalEntradaAberto(false);
            setProdutoSelecionadoEntrada(null);
          }}
          produto={produtoSelecionadoEntrada}
          onEstoqueAtualizado={() => {
            setModalEntradaAberto(false);
            setProdutoSelecionadoEntrada(null);
            dashboardJevService.invalidarCache(loja?.id);
            carregarMetricas(true);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL DE AJUSTE RÁPIDO DE METAS */}
      {/* ========================================================================= */}
      {modalMetasAberto && (
        <ConfiguracoesMetas
          lojaId={loja?.id}
          isModal={true}
          onClose={() => setModalMetasAberto(false)}
          onSucessoSalvar={() => {
            setModalMetasAberto(false);
            dashboardJevService.invalidarCache(loja?.id);
            carregarMetricas(true);
          }}
        />
      )}

    </div>
  );
};
