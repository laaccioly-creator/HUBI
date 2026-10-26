import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LayoutDashboard,
  RefreshCw,
  Settings,
  AlertTriangle,
  Calendar,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Zap,
  Menu,
  Building2,
  Store,
  Plus
} from 'lucide-react';
import { MobileMenuDrawer } from '../components/layout/MobileMenuDrawer';
import { MobileHeader } from '../components/layout/MobileHeader';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useTheme } from '../contexts/ThemeContext';
import { useMenu } from '../contexts/MenuContext';
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
import { ModalDesdobramentoMetricaLojas } from '../components/dashboard/ModalDesdobramentoMetricaLojas';
import { ConfiguracoesMetas } from '../components/configuracoes/ConfiguracoesMetas';
import { ModalEntradaEstoque } from '../components/ModalEntradaEstoque';
import { ModalAdicionarLoja } from '../components/lojas/ModalAdicionarLoja';
import { useRegisterOverlay } from '../hooks/useRegisterOverlay';
import { supabase } from '../lib/supabase';

export const DashboardCockpit: React.FC = () => {
  const { loja, usuario, lojasDisponiveis } = useAuth();
  const permissions = usePermissions();
  const { tema } = useTheme();
  const { abrirMenuMobile } = useMenu();
  const isDark = tema === 'dark';

  // Controle de permissão para gestores
  const podeGerenciarMetas =
    permissions.ehOwner ||
    permissions.ehAdmin ||
    permissions.ehGerente ||
    permissions.podeAcessarConfig;

  // Escopo de Loja: 'todas' (Visão Consolidada do Conglomerado) ou id da loja selecionada
  const ehGestorConglomerado = permissions.ehOwner || permissions.ehAdmin || permissions.ehGerente;
  const temMultiplasLojas = lojasDisponiveis && lojasDisponiveis.length > 1;
  const [escopoLojaId, setEscopoLojaId] = useState<string>(
    temMultiplasLojas && ehGestorConglomerado ? 'todas' : (loja?.id || 'todas')
  );
  const [dropdownLojasAberto, setDropdownLojasAberto] = useState<boolean>(false);
  const [modalAdicionarLojaAberto, setModalAdicionarLojaAberto] = useState<boolean>(false);

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
  const [menuDrawerAberto, setMenuDrawerAberto] = useState<boolean>(false);

  // Estados da Gaveta Lateral e Entrada de Estoque
  const [drawerMetrica, setDrawerMetrica] = useState<TipoMetricaCockpitDrawer | null>(null);
  const [modalEntradaAberto, setModalEntradaAberto] = useState<boolean>(false);
  const [produtoSelecionadoEntrada, setProdutoSelecionadoEntrada] = useState<Produto | null>(null);

  // Estados do Modal de Desdobramento por Loja (Visão Conglomerado)
  const [modalDesdobramentoAberto, setModalDesdobramentoAberto] = useState<boolean>(false);
  const [metricaDesdobramento, setMetricaDesdobramento] = useState<TipoMetricaCockpitDrawer | null>(null);
  const metricaAtivaRef = useRef<TipoMetricaCockpitDrawer | null>(null);
  const [payloadDrawerEspecifico, setPayloadDrawerEspecifico] = useState<PayloadDashboardExecutivo | null>(null);
  const [lojaDrawerEspecifica, setLojaDrawerEspecifica] = useState<{ id: string; nome: string } | null>(null);
  const [lojaIdAlvoDrawer, setLojaIdAlvoDrawer] = useState<string | null>(null);
  const [carregandoLojaId, setCarregandoLojaId] = useState<string | null>(null);

  // Registro na pilha de navegação para tecla ESC e botão Voltar Mobile
  useRegisterOverlay(menuDrawerAberto, () => setMenuDrawerAberto(false), 'cockpit-menu-drawer');
  useRegisterOverlay(modalDesdobramentoAberto, () => setModalDesdobramentoAberto(false), 'cockpit-modal-desdobramento');
  useRegisterOverlay(drawerMetrica !== null, () => {
    setDrawerMetrica(null);
    setPayloadDrawerEspecifico(null);
    setLojaDrawerEspecifica(null);
    setLojaIdAlvoDrawer(null);
    metricaAtivaRef.current = null;
  }, 'cockpit-metric-drawer');
  useRegisterOverlay(modalEntradaAberto, () => {
    setModalEntradaAberto(false);
    setProdutoSelecionadoEntrada(null);
  }, 'cockpit-modal-entrada');
  useRegisterOverlay(modalMetasAberto, () => setModalMetasAberto(false), 'cockpit-modal-metas');
  useRegisterOverlay(modalAdicionarLojaAberto, () => setModalAdicionarLojaAberto(false), 'cockpit-modal-adicionar-loja');

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
    const idAlvo = escopoLojaId === 'todas' ? 'todas' : (escopoLojaId || loja?.id);
    if (!idAlvo) return;

    const listaLojasIds = (lojasDisponiveis && lojasDisponiveis.length > 0)
      ? lojasDisponiveis.map(l => l.id)
      : (loja?.id ? [loja.id] : []);

    try {
      if (forcar) {
        setCarregando(true);
      }
      setErroCarregamento(null);

      const res = await dashboardJevService.obterDashboardExecutivo({
        lojaId: idAlvo,
        lojasIdsConglomerado: listaLojasIds,
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
  }, [escopoLojaId, loja?.id, lojasDisponiveis, tipoPeriodo, periodoOffset, dataInicioCustom, dataFimCustom]);

  useEffect(() => {
    carregarMetricas();
  }, [carregarMetricas]);

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

  // Handler do clique em qualquer um dos 6 velocímetros:
  // Se estiver na visão "Todas as Lojas", abre o modal intermediário de desdobramento por filial.
  // Se for uma loja individual, abre diretamente a gaveta lateral de auditoria.
  const handleCliqueGauge = (metrica: TipoMetricaCockpitDrawer) => {
    metricaAtivaRef.current = metrica;
    if (escopoLojaId === 'todas') {
      setMetricaDesdobramento(metrica);
      setModalDesdobramentoAberto(true);
    } else {
      setLojaDrawerEspecifica(null);
      setPayloadDrawerEspecifico(null);
      setLojaIdAlvoDrawer(null);
      setDrawerMetrica(metrica);
    }
  };

  // Handler de seleção de filial específica no modal de desdobramento
  const handleSelecionarLojaDesdobramento = (
    lojaId: string,
    lojaNome: string,
    metricaOp?: TipoMetricaCockpitDrawer | null
  ) => {
    const metricaAlvo = metricaOp || metricaDesdobramento || metricaAtivaRef.current || drawerMetrica;
    setLojaDrawerEspecifica({ id: lojaId, nome: lojaNome });
    setLojaIdAlvoDrawer(lojaId);
    setModalDesdobramentoAberto(false);
    if (metricaAlvo) {
      metricaAtivaRef.current = metricaAlvo;
      setDrawerMetrica(metricaAlvo);
    }

    // Carrega em background a auditoria analítica aprofundada isolada daquela filial
    setCarregandoLojaId(lojaId);
    dashboardJevService.obterDashboardExecutivo({
      lojaId,
      tipoPeriodo,
      periodoOffset,
      dataInicioCustom,
      dataFimCustom
    }).then((res) => {
      setPayloadDrawerEspecifico(res.payload);
    }).catch((err) => {
      console.warn('[DashboardCockpit] Erro ao carregar auditoria da filial em background:', err);
    }).finally(() => {
      setCarregandoLojaId(null);
    });
  };

  // Handler de ação "Ver Auditoria Geral Consolidada" a partir do modal de desdobramento
  const handleVerConsolidado = (metricaOp?: TipoMetricaCockpitDrawer | null) => {
    const metricaAlvo = metricaOp || metricaDesdobramento || metricaAtivaRef.current || drawerMetrica;
    setLojaDrawerEspecifica(null);
    setPayloadDrawerEspecifico(null);
    setLojaIdAlvoDrawer(null);
    setModalDesdobramentoAberto(false);
    if (metricaAlvo) {
      metricaAtivaRef.current = metricaAlvo;
      setDrawerMetrica(metricaAlvo);
    }
  };

  // Saudação contextual ao usuário
  const nomeUsuario = usuario?.nome_completo ? usuario.nome_completo.split(' ')[0] : 'Gestor';

  return (
    <div className="min-h-screen w-full flex flex-col font-sans overflow-x-hidden bg-slate-100 dark:bg-[#0B0F17] text-slate-900 dark:text-white transition-colors">
      {/* ========================================================================= */}
      {/* CABEÇALHO MOBILE UNIFICADO */}
      {/* ========================================================================= */}
      <div className="block md:hidden shrink-0">
        <MobileHeader
          titulo="Dashboard Executivo"
          subtitulo={`Olá, ${nomeUsuario} • Desempenho em tempo real`}
          iconeTitulo={
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
              <LayoutDashboard className="w-4 h-4" />
            </div>
          }
          acoesDireita={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => carregarMetricas(true)}
                disabled={carregando}
                title="Recarregar Indicadores"
                className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 dark:bg-[#000000] dark:hover:bg-[#0D111A] dark:border-[#1E293B] dark:text-slate-200 transition cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
              </button>
              {podeGerenciarMetas && (
                <button
                  type="button"
                  onClick={() => setModalMetasAberto(true)}
                  className="px-2.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 dark:bg-[#000000] dark:hover:bg-[#0D111A] dark:border-[#1E293B] dark:text-white font-bold text-xs transition cursor-pointer shadow-2xs"
                  title="Configurar Metas"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>
          }
        />
      </div>

      {/* ========================================================================= */}
      {/* CABEÇALHO DESKTOP EXECUTIVO */}
      {/* ========================================================================= */}
      <div className="hidden md:block sticky top-0 z-20 backdrop-blur-md border-b px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 bg-slate-100/95 dark:bg-[#0B0F17]/95 border-slate-300 dark:border-[#1E293B]/80 transition-colors">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          
          {/* Título & Saudação */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shadow-xs shrink-0">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Dashboard Executivo
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Olá, <span className="font-semibold text-slate-800 dark:text-slate-200">{nomeUsuario}</span> • Acompanhe o desempenho e as metas da sua operação em tempo real.
            </p>
          </div>

          {/* Seletor de Período Padronizado & Ações Rápidas */}
          <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
            
            {/* Seletor de Escopo de Loja (Consolidado vs Individual) */}
            {temMultiplasLojas && ehGestorConglomerado && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDropdownLojasAberto(prev => !prev)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-[#1E293B] bg-white hover:bg-slate-50 dark:bg-[#000000] dark:hover:bg-[#0D111A] text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-2xs"
                >
                  <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="max-w-[130px] truncate">
                    {escopoLojaId === 'todas'
                      ? '🏢 Todas as Lojas'
                      : (lojasDisponiveis.find(l => l.id === escopoLojaId)?.nome_fantasia || 'Loja')}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {dropdownLojasAberto && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setDropdownLojasAberto(false)} />
                    <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-[#1E293B] rounded-xl shadow-2xl p-1.5 z-50 text-left space-y-0.5 animate-in fade-in zoom-in-95">
                      <button
                        type="button"
                        onClick={() => {
                          setEscopoLojaId('todas');
                          setDropdownLojasAberto(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                          escopoLojaId === 'todas'
                            ? 'bg-emerald-50 border border-emerald-300 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E293B]'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Building2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="truncate">🏢 Visão Geral (Todas)</span>
                        </div>
                        {escopoLojaId === 'todas' && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                      </button>

                      <div className="my-1 border-t border-slate-200 dark:border-slate-800/80" />

                      {lojasDisponiveis.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => {
                            setEscopoLojaId(l.id);
                            setDropdownLojasAberto(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                            escopoLojaId === l.id
                              ? 'bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E293B]'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{l.nome_fantasia}</span>
                          </div>
                          {escopoLojaId === l.id && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                        </button>
                      ))}

                      {permissions.ehOwner && (
                        <>
                          <div className="my-1 border-t border-slate-200 dark:border-slate-800/80" />
                          <button
                            type="button"
                            onClick={() => {
                              setDropdownLojasAberto(false);
                              setModalAdicionarLojaAberto(true);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Adicionar Nova Loja</span>
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Botão de Adicionar Nova Filial (atalho direto quando 1 loja) */}
            {permissions.ehOwner && !temMultiplasLojas && (
              <button
                type="button"
                onClick={() => setModalAdicionarLojaAberto(true)}
                className="px-3 py-1.5 rounded-xl border border-dashed border-emerald-500/40 hover:border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/10 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                title="Adicionar Filial (+7 Dias Grátis)"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Filial</span>
              </button>
            )}

            {/* Seletor de Períodos com Design System Canônico */}
            <div className="relative flex items-center bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 dark:bg-[#000000] dark:hover:bg-[#0D111A] dark:border-[#1E293B] dark:text-slate-200 font-semibold rounded-xl p-0.5 shadow-2xs transition">
              <button
                type="button"
                onClick={() => setPeriodoOffset(prev => prev - 1)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1E293B] text-slate-700 dark:text-slate-300 transition cursor-pointer"
                title="Período Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="relative min-w-[130px] sm:min-w-[160px] text-center">
                <button
                  type="button"
                  onClick={() => setDropdownPeriodoAberto(prev => !prev)}
                  className="w-full px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-100 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>{labelExibicaoPeriodo}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                </button>

                {/* Dropdown de 9 Opções de Período */}
                {dropdownPeriodoAberto && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setDropdownPeriodoAberto(false)}
                    />
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-[#1E293B] rounded-xl shadow-2xl p-1.5 z-50 text-left space-y-0.5 animate-in fade-in zoom-in-95">
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
                              ? 'bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E293B]'
                          }`}
                        >
                          <span>{op.label}</span>
                          {tipoPeriodo === op.id && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
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
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1E293B] text-slate-700 dark:text-slate-300 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title="Próximo Período"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Inputs de Data Customizada quando 'personalizado' */}
            {tipoPeriodo === 'personalizado' && (
              <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-[#000000] border border-slate-300 dark:border-[#1E293B] rounded-xl px-2.5 py-1 text-xs w-full sm:w-auto">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">De:</span>
                  <input
                    type="date"
                    value={dataInicioCustom}
                    onChange={(e) => setDataInicioCustom(e.target.value)}
                    className="bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-0.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Até:</span>
                  <input
                    type="date"
                    value={dataFimCustom}
                    onChange={(e) => setDataFimCustom(e.target.value)}
                    className="bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-0.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            {/* Indicador de Revalidação SWR em Background */}
            {revalidando && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium animate-pulse">
                <Zap className="w-3 h-3 text-emerald-500" />
                <span>Atualizando dados...</span>
              </span>
            )}

            {/* Botão de Atualização Rápida */}
            <button
              type="button"
              onClick={() => carregarMetricas(true)}
              disabled={carregando}
              title="Recarregar Indicadores"
              className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 dark:bg-[#000000] dark:hover:bg-[#0D111A] dark:border-[#1E293B] dark:text-slate-200 font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
            </button>

            {/* Atalho para Configurar Metas */}
            {podeGerenciarMetas && (
              <button
                type="button"
                onClick={() => setModalMetasAberto(true)}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 dark:bg-[#000000] dark:hover:bg-[#0D111A] dark:border-[#1E293B] dark:text-white font-bold text-xs flex items-center gap-1.5 sm:gap-2 shadow-2xs transition cursor-pointer group"
              >
                <Settings className="w-4 h-4 text-slate-600 dark:text-slate-300 group-hover:rotate-45 transition-transform duration-200" />
                <span className="hidden sm:inline">Configurar Metas</span>
                <span className="sm:hidden">Metas</span>
              </button>
            )}

          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* CONTEÚDO PRINCIPAL (GRID DOS 6 VELOCÍMETROS) */}
      {/* ========================================================================= */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
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
            onClickDrillDown={() => handleCliqueGauge('faturamento')}
          />

          {/* 2. VOLUME DE PEDIDOS */}
          <CockpitGaugeF1
            titulo="Volume de Pedidos"
            valorRealizado={metricas.pedidos}
            valorMeta={metasProporcionais.meta_pedidos}
            tipoFormato="inteiro"
            isLoading={carregando && !payloadExecutivo}
            onClickDrillDown={() => handleCliqueGauge('pedidos')}
          />

          {/* 3. LUCRO LÍQUIDO REAL */}
          <CockpitGaugeF1
            titulo="Lucro Líquido Real"
            valorRealizado={metricas.lucro_liquido}
            valorMeta={metasProporcionais.meta_lucro_liquido}
            tipoFormato="moeda"
            isLoading={carregando && !payloadExecutivo}
            onClickDrillDown={() => handleCliqueGauge('lucro')}
          />

          {/* 4. DESPESAS OPERACIONAIS (TETO ORÇAMENTÁRIO) */}
          <CockpitGaugeF1
            titulo="Despesas Operacionais"
            subtituloTag="Teto Orçamentário"
            valorRealizado={metricas.despesas ?? 0}
            valorMeta={metasProporcionais.meta_despesas_maximas ?? metasProporcionais.meta_despesas ?? 0}
            tipoFormato="moeda"
            escalaInvertida={true}
            isLoading={carregando && !payloadExecutivo}
            onClickDrillDown={() => handleCliqueGauge('despesas')}
          />

          {/* 5. INADIMPLÊNCIA FIADO (ESCALA INVERTIDA) */}
          <CockpitGaugeF1
            titulo="Inadimplência Fiado"
            valorRealizado={metricas.inadimplencia}
            valorMeta={metasProporcionais.meta_inadimplencia_maxima}
            tipoFormato="percentual"
            escalaInvertida={true}
            isLoading={carregando && !payloadExecutivo}
            onClickDrillDown={() => handleCliqueGauge('inadimplencia')}
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
                onClickDrillDown={() => handleCliqueGauge('saude_estoque')}
              />
            );
          })()}

        </div>

        {/* Rodapé Informativo Executivo */}
        <div className={`bg-white dark:bg-[#000000] ${isDark ? 'border-2 border-slate-400' : 'border-2 border-slate-300'} rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between text-xs gap-3 text-slate-700 dark:text-slate-400 shadow-2xs transition-colors`}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Valores pré-computados com inteligência TypeSafe Jev (System 1) e sincronizados em tempo real.
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Clique em qualquer velocímetro para auditar a decomposição analítica.
            </span>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* MODAL INTERMEDIÁRIO DE DESDOBRAMENTO POR LOJA (VISÃO CONSOLIDADA) */}
      {/* ========================================================================= */}
      <ModalDesdobramentoMetricaLojas
        isOpen={modalDesdobramentoAberto}
        onClose={() => setModalDesdobramentoAberto(false)}
        tipoMetrica={metricaDesdobramento}
        periodoLabel={labelExibicaoPeriodo}
        lojas={
          (lojasDisponiveis && lojasDisponiveis.length > 0)
            ? lojasDisponiveis
            : (loja ? [loja] : [])
        }
        tipoPeriodo={tipoPeriodo}
        periodoOffset={periodoOffset}
        dataInicioCustom={dataInicioCustom}
        dataFimCustom={dataFimCustom}
        desdobramentoLojas={payloadExecutivo?.desdobramentoLojas || []}
        carregandoLojaId={carregandoLojaId}
        onSelecionarLoja={handleSelecionarLojaDesdobramento}
        onVerConsolidado={handleVerConsolidado}
      />

      {/* ========================================================================= */}
      {/* GAVETA LATERAL DE AUDITORIA E DECOMPOSIÇÃO DAS MÉTRICAS */}
      {/* ========================================================================= */}
      <CockpitMetricDrawer
        isOpen={drawerMetrica !== null}
        onClose={() => {
          setDrawerMetrica(null);
          setPayloadDrawerEspecifico(null);
          setLojaDrawerEspecifica(null);
          setLojaIdAlvoDrawer(null);
          metricaAtivaRef.current = null;
        }}
        tipoMetrica={drawerMetrica}
        payload={payloadDrawerEspecifico || payloadExecutivo}
        lojaIdAlvo={lojaIdAlvoDrawer}
        nomeLojaContexto={
          lojaDrawerEspecifica?.nome ||
          (escopoLojaId === 'todas'
            ? 'Visão Consolidada da Rede'
            : (lojasDisponiveis?.find(l => l.id === escopoLojaId)?.nome_fantasia || loja?.nome_fantasia))
        }
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
          lojaId={escopoLojaId !== 'todas' ? escopoLojaId : (loja?.id || '')}
          isModal={true}
          onClose={() => setModalMetasAberto(false)}
          onSucessoSalvar={() => {
            setModalMetasAberto(false);
            dashboardJevService.invalidarCache(escopoLojaId !== 'todas' ? escopoLojaId : undefined);
            carregarMetricas(true);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* DRAWER MENU UNIFICADO MOBILE */}
      {/* ========================================================================= */}
      <MobileMenuDrawer
        aberto={menuDrawerAberto}
        onFechar={() => setMenuDrawerAberto(false)}
      />

      {/* ========================================================================= */}
      {/* MODAL DE ADIÇÃO DE NOVA FILIAL NO CONGLOMERADO */}
      {/* ========================================================================= */}
      <ModalAdicionarLoja
        isOpen={modalAdicionarLojaAberto}
        onClose={() => setModalAdicionarLojaAberto(false)}
        onLojaCriada={() => {
          dashboardJevService.invalidarCache();
          carregarMetricas(true);
        }}
      />

    </div>
  );
};
