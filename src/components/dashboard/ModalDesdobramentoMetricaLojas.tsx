import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Building2,
  Store,
  BarChart3,
  ChevronRight,
  Loader2,
  DollarSign,
  ShoppingBag,
  Layers,
  Receipt,
  Banknote,
  AlertTriangle,
  Boxes,
  Info
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { CockpitGaugeF1 } from './CockpitGaugeF1';
import { TipoMetricaCockpitDrawer } from './CockpitMetricDrawer';
import {
  dashboardService,
  DesdobramentoLojaItem,
  TipoPeriodoDashboard
} from '../../services/dashboardService';
import { Loja } from '../../types';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { formatarMoeda } from '../../utils/formatters';

export interface ModalDesdobramentoMetricaLojasProps {
  isOpen: boolean;
  onClose: () => void;
  tipoMetrica: TipoMetricaCockpitDrawer | null;
  periodoLabel: string;
  desdobramentoLojas?: DesdobramentoLojaItem[];
  lojas?: Loja[];
  tipoPeriodo?: TipoPeriodoDashboard;
  periodoOffset?: number;
  dataInicioCustom?: string;
  dataFimCustom?: string;
  carregandoLojaId?: string | null;
  onSelecionarLoja: (lojaId: string, lojaNome: string, metrica?: TipoMetricaCockpitDrawer | null) => void;
  onVerConsolidado: (metrica?: TipoMetricaCockpitDrawer | null) => void;
}

interface ConfigMetricaVisual {
  tituloGauge: string;
  tituloModal: string;
  subtituloTag?: string;
  tipoFormato: 'moeda' | 'inteiro' | 'percentual';
  escalaInvertida?: boolean;
  icone: React.ElementType;
}

export const ModalDesdobramentoMetricaLojas: React.FC<ModalDesdobramentoMetricaLojasProps> = ({
  isOpen,
  onClose,
  tipoMetrica,
  periodoLabel,
  desdobramentoLojas,
  lojas: lojasProps,
  tipoPeriodo,
  periodoOffset,
  dataInicioCustom,
  dataFimCustom,
  carregandoLojaId,
  onSelecionarLoja,
  onVerConsolidado
}) => {
  const { tema } = useTheme();
  const { loja, lojasDisponiveis } = useAuth();
  const isDark = tema === 'dark';

  // Estados locais de controle de carga e dados das filiais
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [itensDesdobramento, setItensDesdobramento] = useState<DesdobramentoLojaItem[]>(
    desdobramentoLojas || []
  );

  // Fonte de lojas soberana e sem restrições de organizacao_id para suportar lojas avulsas e redes
  const lojasAtivas = useMemo(() => {
    if (lojasProps && lojasProps.length > 0) return lojasProps;
    if (lojasDisponiveis && lojasDisponiveis.length > 0) return lojasDisponiveis;
    if (loja) return [loja];
    return [];
  }, [lojasProps, lojasDisponiveis, loja]);

  // Rotina de busca resiliente com Promise.allSettled e isolamento de erros por loja
  const carregarMetricasFiliais = useCallback(async () => {
    setIsLoading(true);
    try {
      if (lojasAtivas.length === 0) {
        setItensDesdobramento([]);
        return;
      }

      // Se o dashboard pai já forneceu dados completos para todas as lojas, utiliza diretamente
      if (desdobramentoLojas && desdobramentoLojas.length >= lojasAtivas.length) {
        setItensDesdobramento(desdobramentoLojas);
        return;
      }

      const intervalo = dashboardService.resolverIntervaloPeriodo(
        tipoPeriodo || 'este_mes',
        periodoOffset || 0,
        dataInicioCustom,
        dataFimCustom
      );

      const resultadosSettled = await Promise.allSettled(
        lojasAtivas.map(async (l) => {
          try {
            const res = await dashboardService.obterMetricasCockpit(
              l.id,
              intervalo.dataInicioIso,
              intervalo.dataFimIso,
              intervalo.diasIntervalo
            );
            return {
              lojaId: l.id,
              lojaNome: l.nome_fantasia || 'Loja',
              metricas: res.metricas,
              metasProporcionais: res.metasProporcionais
            } as DesdobramentoLojaItem;
          } catch (lojaErr) {
            console.warn(`[ModalDesdobramentoMetricaLojas] Falha ao consultar filial ${l.id}:`, lojaErr);
            const metasPadrao = await dashboardService.obterMetasLoja(l.id).catch(() => ({
              id: 'padrao',
              loja_id: l.id,
              ...dashboardService.METAS_PADRAO_LOJA
            }));
            return {
              lojaId: l.id,
              lojaNome: l.nome_fantasia || 'Loja',
              metricas: {
                faturamento: 0,
                pedidos: 0,
                ticket_medio: 0,
                cmv: 0,
                despesas: 0,
                lucro_liquido: 0,
                inadimplencia: 0,
                giro_estoque: 0,
                saude_estoque: 0
              },
              metasProporcionais: metasPadrao
            } as DesdobramentoLojaItem;
          }
        })
      );

      const itensFinais: DesdobramentoLojaItem[] = [];
      resultadosSettled.forEach((r) => {
        if (r.status === 'fulfilled' && r.value) {
          itensFinais.push(r.value);
        }
      });

      setItensDesdobramento(itensFinais);
    } catch (errGeral) {
      console.error('[ModalDesdobramentoMetricaLojas] Erro geral ao buscar métricas das filiais:', errGeral);
    } finally {
      setIsLoading(false);
    }
  }, [lojasAtivas, desdobramentoLojas, tipoPeriodo, periodoOffset, dataInicioCustom, dataFimCustom]);

  // Disparo controlado na abertura do modal
  useEffect(() => {
    if (isOpen && tipoMetrica) {
      if (desdobramentoLojas && desdobramentoLojas.length > 0 && desdobramentoLojas.length >= lojasAtivas.length) {
        setItensDesdobramento(desdobramentoLojas);
        setIsLoading(false);
      } else {
        carregarMetricasFiliais();
      }
    }
  }, [isOpen, tipoMetrica, desdobramentoLojas, lojasAtivas.length, carregarMetricasFiliais]);

  // Travar o scroll do body enquanto o modal estiver aberto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Configurações visuais por métrica
  const configMetrica: ConfigMetricaVisual | null = useMemo(() => {
    if (!tipoMetrica) return null;

    switch (tipoMetrica) {
      case 'faturamento':
        return {
          tituloGauge: 'Faturamento Bruto',
          tituloModal: 'Desdobramento de Faturamento Bruto por Loja',
          tipoFormato: 'moeda',
          escalaInvertida: false,
          icone: DollarSign
        };
      case 'pedidos':
        return {
          tituloGauge: 'Volume de Pedidos',
          tituloModal: 'Desdobramento de Volume de Pedidos por Loja',
          tipoFormato: 'inteiro',
          escalaInvertida: false,
          icone: ShoppingBag
        };
      case 'lucro':
        return {
          tituloGauge: 'Lucro Líquido Real',
          tituloModal: 'Desdobramento de Lucro Líquido Real por Loja',
          tipoFormato: 'moeda',
          escalaInvertida: false,
          icone: Layers
        };
      case 'ticket':
        return {
          tituloGauge: 'Ticket Médio',
          tituloModal: 'Desdobramento de Ticket Médio por Loja',
          tipoFormato: 'moeda',
          escalaInvertida: false,
          icone: Receipt
        };
      case 'despesas':
        return {
          tituloGauge: 'Despesas Operacionais',
          tituloModal: 'Desdobramento de Despesas Operacionais por Loja',
          subtituloTag: 'Teto Orçamentário',
          tipoFormato: 'moeda',
          escalaInvertida: true,
          icone: Banknote
        };
      case 'inadimplencia':
        return {
          tituloGauge: 'Inadimplência Fiado',
          tituloModal: 'Desdobramento de Inadimplência Fiado por Loja',
          tipoFormato: 'percentual',
          escalaInvertida: true,
          icone: AlertTriangle
        };
      case 'saude_estoque':
        return {
          tituloGauge: 'Saúde do Estoque',
          tituloModal: 'Desdobramento de Saúde do Estoque por Loja',
          subtituloTag: 'Itens em Risco',
          tipoFormato: 'inteiro',
          escalaInvertida: true,
          icone: Boxes
        };
      default:
        return null;
    }
  }, [tipoMetrica]);

  // Totalizadores consolidados da métrica para o banner informativo
  const resumoConsolidado = useMemo(() => {
    if (!tipoMetrica || itensDesdobramento.length === 0) {
      return { totalRealizado: 0, totalMeta: 0, textoRealizado: '', textoMeta: '', pctGeral: 0 };
    }

    let realizado = 0;
    let meta = 0;

    itensDesdobramento.forEach(item => {
      switch (tipoMetrica) {
        case 'faturamento':
          realizado += Number(item.metricas.faturamento || 0);
          meta += Number(item.metasProporcionais.meta_faturamento || 0);
          break;
        case 'pedidos':
          realizado += Number(item.metricas.pedidos || 0);
          meta += Number(item.metasProporcionais.meta_pedidos || 0);
          break;
        case 'lucro':
          realizado += Number(item.metricas.lucro_liquido || 0);
          meta += Number(item.metasProporcionais.meta_lucro_liquido || 0);
          break;
        case 'ticket':
          realizado += Number(item.metricas.faturamento || 0);
          meta += Number(item.metasProporcionais.meta_faturamento || 0);
          break;
        case 'despesas':
          realizado += Number(item.metricas.despesas || 0);
          meta += Number(item.metasProporcionais.meta_despesas_maximas ?? item.metasProporcionais.meta_despesas ?? 0);
          break;
        case 'inadimplencia':
          realizado += Number(item.metricas.inadimplencia || 0);
          meta += Number(item.metasProporcionais.meta_inadimplencia_maxima || 0);
          break;
        case 'saude_estoque':
          realizado += Number(item.metricas.saude_estoque_itens_risco || 0);
          meta += Number(item.metasProporcionais.meta_saude_estoque_max_ruptura || 0);
          break;
      }
    });

    if (tipoMetrica === 'inadimplencia' && itensDesdobramento.length > 0) {
      realizado = Math.round((realizado / itensDesdobramento.length) * 100) / 100;
      meta = Math.round((meta / itensDesdobramento.length) * 100) / 100;
    }

    if (tipoMetrica === 'ticket') {
      const somaPedidos = itensDesdobramento.reduce((acc, it) => acc + Number(it.metricas.pedidos || 0), 0);
      realizado = somaPedidos > 0 ? Math.round((realizado / somaPedidos) * 100) / 100 : 0;
      meta = itensDesdobramento.length > 0
        ? Math.round((itensDesdobramento.reduce((acc, it) => acc + Number(it.metasProporcionais.meta_ticket_medio || 0), 0) / itensDesdobramento.length) * 100) / 100
        : 0;
    }

    let textoRealizado = '';
    let textoMeta = '';
    const pctGeral = meta > 0 ? (realizado / meta) * 100 : 0;

    if (configMetrica?.tipoFormato === 'moeda') {
      textoRealizado = formatarMoeda(realizado);
      textoMeta = formatarMoeda(meta);
    } else if (configMetrica?.tipoFormato === 'percentual') {
      textoRealizado = `${realizado.toFixed(1)}%`;
      textoMeta = `${meta.toFixed(1)}%`;
    } else {
      textoRealizado = realizado.toLocaleString('pt-BR');
      textoMeta = meta.toLocaleString('pt-BR');
    }

    return { totalRealizado: realizado, totalMeta: meta, textoRealizado, textoMeta, pctGeral };
  }, [tipoMetrica, itensDesdobramento, configMetrica]);

  if (!isOpen || !tipoMetrica || !configMetrica) {
    return null;
  }

  const IconeCabecalho = configMetrica.icone;

  // Extrai valor realizado e meta individual para a loja
  const extrairValoresLoja = (item: DesdobramentoLojaItem) => {
    let valorRealizado = 0;
    let valorMeta = 0;
    let valorExibicaoCustomizado: string | undefined;
    let metaExibicaoCustomizada: string | undefined;

    switch (tipoMetrica) {
      case 'faturamento':
        valorRealizado = Number(item.metricas.faturamento || 0);
        valorMeta = Number(item.metasProporcionais.meta_faturamento || 0);
        break;
      case 'pedidos':
        valorRealizado = Number(item.metricas.pedidos || 0);
        valorMeta = Number(item.metasProporcionais.meta_pedidos || 0);
        break;
      case 'lucro':
        valorRealizado = Number(item.metricas.lucro_liquido || 0);
        valorMeta = Number(item.metasProporcionais.meta_lucro_liquido || 0);
        break;
      case 'ticket':
        valorRealizado = Number(item.metricas.ticket_medio || 0);
        valorMeta = Number(item.metasProporcionais.meta_ticket_medio || 0);
        break;
      case 'despesas':
        valorRealizado = Number(item.metricas.despesas || 0);
        valorMeta = Number(item.metasProporcionais.meta_despesas_maximas ?? item.metasProporcionais.meta_despesas ?? 0);
        break;
      case 'inadimplencia':
        valorRealizado = Number(item.metricas.inadimplencia || 0);
        valorMeta = Number(item.metasProporcionais.meta_inadimplencia_maxima || 0);
        break;
      case 'saude_estoque':
        valorRealizado = Number(item.metricas.saude_estoque_itens_risco || 0);
        valorMeta = Number(item.metasProporcionais.meta_saude_estoque_max_ruptura || 0);
        valorExibicaoCustomizado = `${valorRealizado} em risco`;
        metaExibicaoCustomizada = `${valorMeta} ${valorMeta === 1 ? 'ruptura' : 'rupturas'}`;
        break;
    }

    const metaValida = Number(valorMeta || 0);
    const realizadoValido = Number(valorRealizado || 0);
    const percentual = metaValida > 0 ? (realizadoValido / metaValida) * 100 : 0;

    return {
      valorRealizado,
      valorMeta,
      valorExibicaoCustomizado,
      metaExibicaoCustomizada,
      percentual
    };
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto animate-in fade-in duration-200 flex items-center justify-center p-3 sm:p-5 lg:p-8">
      {/* Backdrop com Blur Escuro */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Container Principal do Modal */}
      <div
        className={`relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-3xl overflow-hidden shadow-2xl transition-all z-10 animate-in zoom-in-95 duration-200 ${
          isDark
            ? 'bg-[#08131A] border-2 border-slate-700 text-slate-100'
            : 'bg-slate-50 border-2 border-slate-300 text-slate-900'
        }`}
      >
        {/* ================================================================= */}
        {/* CABEÇALHO DO MODAL */}
        {/* ================================================================= */}
        <div
          className={`p-4 sm:p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-20 backdrop-blur-md ${
            isDark ? 'bg-[#08131A]/95 border-slate-700' : 'bg-white/95 border-slate-300'
          }`}
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 shadow-xs">
              <IconeCabecalho className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-xl font-black tracking-tight text-slate-900 dark:text-white">
                  {configMetrica.tituloModal}
                </h2>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  🏢 Visão Comparativa
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                Competência: <strong className="text-slate-900 dark:text-slate-200 font-bold">{periodoLabel}</strong>
                {itensDesdobramento.length > 0 && (
                  <> • Comparativo entre {itensDesdobramento.length} {itensDesdobramento.length === 1 ? 'filial' : 'filiais'} da rede</>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {/* Botão de Ação Destacado: Ver Auditoria Geral Consolidada */}
            <button
              type="button"
              onClick={() => onVerConsolidado(tipoMetrica)}
              className="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm transition cursor-pointer active:scale-98"
              title="Abrir auditoria analítica consolidada de todas as lojas reunidas"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Ver Auditoria Geral Consolidada</span>
            </button>

            {/* Botão Fechar */}
            <button
              type="button"
              onClick={onClose}
              className={`p-2 sm:p-2.5 rounded-xl transition cursor-pointer shadow-xs ${
                isDark
                  ? 'bg-[#000000] border-2 border-slate-700 text-slate-300 hover:bg-slate-900 hover:text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Fechar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* CORPO DO MODAL */}
        {/* ================================================================= */}
        <div className="p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-6 flex-1">
          {/* Banner Informativo Consolidado */}
          <div
            className={`rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs transition-colors ${
              isDark
                ? 'bg-[#000000] border-2 border-slate-700 text-slate-300'
                : 'bg-white border-2 border-slate-300 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
                <Info className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">
                  Total Consolidado da Rede: <span className="text-emerald-600 dark:text-emerald-400">{resumoConsolidado.textoRealizado}</span>
                  {resumoConsolidado.totalMeta > 0 && (
                    <span className="font-normal text-slate-500 dark:text-slate-400"> (Meta: {resumoConsolidado.textoMeta} • {resumoConsolidado.pctGeral.toFixed(1)}%)</span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Toque em qualquer card abaixo para abrir a auditoria detalhada isolada daquela filial específica.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <Building2 className="w-3.5 h-3.5" />
              <span>{itensDesdobramento.length} {itensDesdobramento.length === 1 ? 'Loja Monitorada' : 'Lojas Monitoradas'}</span>
            </div>
          </div>

          {/* Grid de Velocímetros das Lojas com Estados de Carga e Empty State Amigável */}
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mx-auto animate-spin">
                <Loader2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Carregando dados das filiais...
              </p>
            </div>
          ) : itensDesdobramento.length === 0 ? (
            <div className="py-12 sm:py-16 text-center space-y-4 max-w-md mx-auto animate-in fade-in">
              <div className="w-16 h-16 rounded-3xl bg-slate-500/10 border border-slate-500/20 text-slate-400 flex items-center justify-center mx-auto">
                <Building2 className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                  Nenhuma filial encontrada para esta organização
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Não foram localizadas filiais adicionais configuradas. Você pode visualizar a auditoria geral consolidada da operação.
                </p>
              </div>
              <div className="pt-2 flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onVerConsolidado(tipoMetrica)}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-xs active:scale-98"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Ver Auditoria Geral Consolidada</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
              {itensDesdobramento.map((item) => {
                const {
                  valorRealizado,
                  valorMeta,
                  valorExibicaoCustomizado,
                  metaExibicaoCustomizada,
                  percentual
                } = extrairValoresLoja(item);

                const estaCarregandoEstaLoja = carregandoLojaId === item.lojaId;

                // Estilo da badge de percentual
                let badgeClass = '';
                let badgeTexto = '';

                if (configMetrica.escalaInvertida) {
                  if (valorRealizado <= valorMeta || valorMeta === 0) {
                    badgeClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
                    badgeTexto = valorMeta > 0 ? `${percentual.toFixed(1)}% do teto` : 'Sem teto';
                  } else {
                    badgeClass = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
                    badgeTexto = `Excedeu (+${(percentual - 100).toFixed(1)}%)`;
                  }
                } else {
                  if (percentual >= 100) {
                    badgeClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
                    badgeTexto = `${percentual.toFixed(1)}% atingido`;
                  } else if (percentual >= 75) {
                    badgeClass = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
                    badgeTexto = `${percentual.toFixed(1)}% da meta`;
                  } else {
                    badgeClass = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
                    badgeTexto = `${percentual.toFixed(1)}% da meta`;
                  }
                }

                return (
                  <div
                    key={item.lojaId}
                    onClick={() => onSelecionarLoja(item.lojaId, item.lojaNome, tipoMetrica)}
                    className={`group relative rounded-3xl p-4 sm:p-5 flex flex-col justify-between transition-all cursor-pointer shadow-sm hover:shadow-xl active:scale-[0.99] ${
                      isDark
                        ? 'bg-[#000000] border-2 border-slate-700 hover:border-emerald-500'
                        : 'bg-white border-2 border-slate-300 hover:border-emerald-600'
                    }`}
                  >
                    {/* Topo do Card: Nome da Filial & Badge */}
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2 truncate">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
                          <Store className="w-4 h-4" />
                        </div>
                        <span
                          className="font-black text-sm sm:text-base text-slate-900 dark:text-white truncate"
                          title={item.lojaNome}
                        >
                          {item.lojaNome}
                        </span>
                      </div>

                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${badgeClass}`}>
                        {badgeTexto}
                      </span>
                    </div>

                    {/* Velocímetro da Filial */}
                    <div className="py-2 pointer-events-none">
                      <CockpitGaugeF1
                        titulo={configMetrica.tituloGauge}
                        subtituloTag={configMetrica.subtituloTag}
                        valorRealizado={valorRealizado}
                        valorMeta={valorMeta}
                        tipoFormato={configMetrica.tipoFormato}
                        escalaInvertida={configMetrica.escalaInvertida}
                        valorExibicaoCustomizado={valorExibicaoCustomizado}
                        metaExibicaoCustomizada={metaExibicaoCustomizada}
                      />
                    </div>

                    {/* Rodapé do Card: Ação de Auditar */}
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">
                        Auditoria isolada
                      </span>
                      <div className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 group-hover:translate-x-1 transition-transform">
                        {estaCarregandoEstaLoja ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Abrindo auditoria...</span>
                          </>
                        ) : (
                          <>
                            <span>Auditar esta filial</span>
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
