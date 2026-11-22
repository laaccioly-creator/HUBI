import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  RefreshCw,
  Settings,
  Users,
  AlertTriangle,
  ShieldAlert,
  Menu
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { useMenu } from '../contexts/MenuContext';
import {
  dashboardService,
  TipoPeriodoDashboard,
  PERIODOS_DASHBOARD_OPCOES
} from '../services/dashboardService';
import { CockpitGaugeF1 } from '../components/dashboard/CockpitGaugeF1';
import {
  areaHubiService,
  EstagioComercialLoja,
  LojaAreaHubi,
  MetasAreaHubi,
  PayloadCockpitAreaHubi
} from '../services/areaHubiService';
import { DrawerComercialAreaHubi } from '../components/areaHubi/DrawerComercialAreaHubi';
import { ModalConfigurarMetasHubi } from '../components/areaHubi/ModalConfigurarMetasHubi';
import { ModalEditarLojaSuperAdmin } from '../components/areaHubi/ModalEditarLojaSuperAdmin';
import { ModalAtivarAssinaturaManual } from '../components/areaHubi/ModalAtivarAssinaturaManual';
import { MobileHeader } from '../components/layout/MobileHeader';

const METAS_HUBI_VAZIAS: MetasAreaHubi = {
  meta_hubi_faturamento: 0,
  meta_hubi_vendas: 0,
  meta_hubi_conversao_percentual: 0,
  meta_hubi_max_nao_renovados: 0,
  meta_hubi_lojas_ativas: 0,
  meta_hubi_receita_whatsapp: 0,
};

export const AreaHubiCockpit: React.FC = () => {
  const navigate = useNavigate();
  const { tema } = useTheme();
  const isDark = tema === 'dark';
  const { mostrarSucesso } = useFeedbackModal();
  const { abrirMenuMobile } = useMenu();

  // Filtro de Período (mesmo padrão do Dashboard Executivo)
  const [tipoPeriodo, setTipoPeriodo] = useState<TipoPeriodoDashboard>('este_mes');
  const [periodoOffset, setPeriodoOffset] = useState<number>(0);
  const [dropdownPeriodoAberto, setDropdownPeriodoAberto] = useState<boolean>(false);
  const [dataInicioCustom, setDataInicioCustom] = useState<string>('');
  const [dataFimCustom, setDataFimCustom] = useState<string>('');

  // Dados do Cockpit Executivo
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [payload, setPayload] = useState<PayloadCockpitAreaHubi | null>(null);

  // Overlays / Drawer / Modais
  const [drawerAberto, setDrawerAberto] = useState<boolean>(false);
  const [abaDrawer, setAbaDrawer] = useState<EstagioComercialLoja>('trial_ativo');
  const [tituloDrawer, setTituloDrawer] = useState<string>('Carteira Comercial HUBI');
  const [modalMetasAberto, setModalMetasAberto] = useState<boolean>(false);
  const [lojaParaEditar, setLojaParaEditar] = useState<LojaAreaHubi | null>(null);
  const [lojaParaAtivarManual, setLojaParaAtivarManual] = useState<LojaAreaHubi | null>(null);

  const infoIntervalo = dashboardService.resolverIntervaloPeriodo(
    tipoPeriodo,
    periodoOffset,
    dataInicioCustom,
    dataFimCustom
  );

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true);
      setErro(null);
      const dados = await areaHubiService.obterDadosCockpit(
        infoIntervalo.dataInicioIso,
        infoIntervalo.dataFimIso
      );
      setPayload(dados);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar os dados executivos da Área HUBI.';
      setErro(msg);
    } finally {
      setCarregando(false);
    }
  }, [infoIntervalo.dataInicioIso, infoIntervalo.dataFimIso]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const metricas = payload?.metricas || {
    faturamento_bruto_hubi: 0,
    faturamento_assinaturas: 0,
    receita_whatsapp: 0,
    volume_assinaturas: 0,
    cadastros_periodo: 0,
    assinantes_do_periodo: 0,
    taxa_conversao_percentual: 0,
    nao_renovados_e_expirados: 0,
    lojas_ativas_pagantes: 0,
  };

  const metas = payload?.metas || METAS_HUBI_VAZIAS;
  const lojas = payload?.lojas || [];

  const resumoEstagios = useMemo(() => {
    const counts: Record<EstagioComercialLoja, number> = {
      trial_ativo: 0,
      trial_vencido: 0,
      churn_nao_renovado: 0,
      assinante_ativo: 0,
    };
    for (const l of lojas) {
      counts[l.estagio_comercial] = (counts[l.estagio_comercial] || 0) + 1;
    }
    return counts;
  }, [lojas]);

  const abrirDrawerNaAba = (aba: EstagioComercialLoja, titulo?: string) => {
    setAbaDrawer(aba);
    setTituloDrawer(titulo || 'Carteira Comercial HUBI');
    setDrawerAberto(true);
  };

  const handleSalvarMetas = async (novasMetas: MetasAreaHubi) => {
    await areaHubiService.salvarMetasHubi(novasMetas);
    mostrarSucesso('Metas executivas da plataforma HUBI salvas com sucesso.', 'Metas Atualizadas');
    await carregarDados();
  };

  const neutralBtnClass = isDark
    ? 'bg-[#000000] hover:bg-[#0D111A] border border-[#1E293B] text-slate-200 font-bold'
    : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-semibold';

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isDark ? 'bg-[#08131A] text-slate-100' : 'bg-slate-100 text-black'
      }`}
    >
      {/* Header Mobile */}
      <div className="block md:hidden">
        <MobileHeader
          titulo="Área HUBI"
          subtitulo="Super Admin SaaS"
          mostrarVoltar={true}
          onVoltar={() => navigate('/config')}
          iconeTitulo={
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
          }
          acoesDireita={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => carregarDados()}
                disabled={carregando}
                title="Recarregar"
                className={`p-2 rounded-xl transition cursor-pointer disabled:opacity-50 shadow-2xs ${neutralBtnClass}`}
              >
                <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setModalMetasAberto(true)}
                title="Configurar Metas HUBI"
                className={`p-2 rounded-xl transition cursor-pointer shadow-2xs ${neutralBtnClass}`}
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={abrirMenuMobile}
                title="Menu"
                className={`p-2 rounded-xl transition cursor-pointer shadow-2xs ${neutralBtnClass}`}
              >
                <Menu className="w-4 h-4" />
              </button>
            </div>
          }
        />
      </div>

      {/* Header Desktop + Controles de Período */}
      <div
        className={`sticky top-0 z-30 border-b backdrop-blur-md transition-colors ${
          isDark ? 'border-slate-800/80 bg-[#08131A]/95' : 'border-slate-300 bg-white/95'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Esquerda: Voltar + Título */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/config')}
              className={`hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition cursor-pointer shadow-2xs ${neutralBtnClass}`}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar</span>
            </button>

            <div className="hidden md:flex w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>

            <div className="hidden md:block min-w-0">
              <div className="flex items-center gap-2">
                <h1 className={`text-base sm:text-lg font-black truncate ${isDark ? 'text-white' : 'text-black'}`}>
                  Área HUBI — Cockpit Executivo
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                  Super Admin
                </span>
              </div>
              <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>
                Indicadores globais SaaS, conversão de trials e gestão comercial de assinantes
              </p>
            </div>
          </div>

          {/* Direita: Período, Refresh, Carteira, Configurar Metas */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
            {/* Seletor de Períodos */}
            <div
              className={`relative flex items-center font-semibold rounded-xl p-0.5 shadow-2xs transition ${
                isDark
                  ? 'bg-[#000000] border border-[#1E293B] text-slate-200'
                  : 'bg-slate-100 border border-slate-300 text-black'
              }`}
            >
              <button
                type="button"
                onClick={() => setPeriodoOffset((prev) => prev - 1)}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isDark ? 'hover:bg-[#1E293B] text-slate-300' : 'hover:bg-slate-200 text-black'
                }`}
                title="Período Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="relative min-w-[130px] sm:min-w-[155px] text-center">
                <button
                  type="button"
                  onClick={() => setDropdownPeriodoAberto((prev) => !prev)}
                  className={`w-full px-2 py-1 text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    isDark ? 'font-bold text-slate-100' : 'hover:bg-slate-200 rounded-lg text-black font-semibold'
                  }`}
                >
                  <Calendar className={`w-3.5 h-3.5 ${isDark ? 'text-slate-400' : 'text-black'}`} />
                  <span>{infoIntervalo.label}</span>
                  <ChevronDown className={`w-3 h-3 ${isDark ? 'text-slate-500' : 'text-black'}`} />
                </button>

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
                          {tipoPeriodo === op.id && (
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setPeriodoOffset((prev) => prev + 1)}
                disabled={periodoOffset >= 0}
                className={`p-1.5 rounded-lg transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  isDark ? 'hover:bg-[#1E293B] text-slate-300' : 'hover:bg-slate-200 text-black'
                }`}
                title="Próximo Período"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {tipoPeriodo === 'personalizado' && (
              <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-[#000000] border border-slate-300 dark:border-[#1E293B] rounded-xl px-2.5 py-1 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-semibold">De:</span>
                  <input
                    type="date"
                    value={dataInicioCustom}
                    onChange={(e) => setDataInicioCustom(e.target.value)}
                    className="bg-white dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-800 rounded-lg px-2 py-0.5 text-xs text-black dark:text-slate-100"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-semibold">Até:</span>
                  <input
                    type="date"
                    value={dataFimCustom}
                    onChange={(e) => setDataFimCustom(e.target.value)}
                    className="bg-white dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-800 rounded-lg px-2 py-0.5 text-xs text-black dark:text-slate-100"
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => abrirDrawerNaAba('trial_ativo', 'Carteira Comercial HUBI')}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Users className="w-4 h-4" />
              <span>Leads & Lojas ({lojas.length})</span>
            </button>

            <button
              type="button"
              onClick={() => carregarDados()}
              disabled={carregando}
              title="Atualizar Cockpit"
              className={`hidden md:inline-flex p-2 rounded-xl shadow-2xs transition cursor-pointer disabled:opacity-50 ${neutralBtnClass}`}
            >
              <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setModalMetasAberto(true)}
              className={`hidden md:inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs shadow-2xs transition cursor-pointer group ${neutralBtnClass}`}
            >
              <Settings className="w-4 h-4 group-hover:rotate-45 transition-transform duration-200" />
              <span>Configurar Metas HUBI</span>
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo Principal: Grid 2x3 dos 6 Velocímetros + Atalhos Comerciais */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {erro && (
          <div className="p-4 rounded-2xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 flex flex-wrap items-center justify-between gap-3 text-xs text-red-800 dark:text-red-200">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
              <span className="font-semibold">{erro}</span>
            </div>
            <button
              type="button"
              onClick={() => carregarDados()}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${neutralBtnClass}`}
            >
              Tentar Novamente
            </button>
          </div>
        )}

        {/* Grid 2x3 — 6 Velocímetros F1 HUBI */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {/* 1. Faturamento Bruto HUBI */}
          <CockpitGaugeF1
            titulo="Faturamento Bruto HUBI"
            subtituloTag="Assinaturas + Recargas WhatsApp"
            valorRealizado={metricas.faturamento_bruto_hubi}
            valorMeta={metas.meta_hubi_faturamento}
            tipoFormato="moeda"
            isLoading={carregando && !payload}
            onClickDrillDown={() =>
              abrirDrawerNaAba('assinante_ativo', 'Faturamento & Assinantes HUBI')
            }
          />

          {/* 2. Volume de Assinaturas (Vendas) */}
          <CockpitGaugeF1
            titulo="Volume de Assinaturas"
            subtituloTag="Mercado Pago + Ativações Manuais"
            valorRealizado={metricas.volume_assinaturas}
            valorMeta={metas.meta_hubi_vendas}
            tipoFormato="inteiro"
            isLoading={carregando && !payload}
            onClickDrillDown={() =>
              abrirDrawerNaAba('assinante_ativo', 'Vendas & Assinaturas Aprovadas')
            }
          />

          {/* 3. Taxa de Conversão (Trial -> Assinante) */}
          <CockpitGaugeF1
            titulo="Taxa de Conversão (Trial → Pago)"
            subtituloTag={`${metricas.assinantes_do_periodo} assinantes de ${metricas.cadastros_periodo} cadastros`}
            valorRealizado={metricas.taxa_conversao_percentual}
            valorMeta={metas.meta_hubi_conversao_percentual}
            tipoFormato="percentual"
            isLoading={carregando && !payload}
            onClickDrillDown={() =>
              abrirDrawerNaAba('trial_ativo', 'Conversão de Trials & Leads')
            }
          />

          {/* 4. Não Renovados & Trials Expirados (Arco Invertido) */}
          <CockpitGaugeF1
            titulo="Não Renovados & Trials Expirados"
            subtituloTag="Lojas pendentes de reativação"
            valorRealizado={metricas.nao_renovados_e_expirados}
            valorMeta={metas.meta_hubi_max_nao_renovados}
            tipoFormato="inteiro"
            escalaInvertida={true}
            isLoading={carregando && !payload}
            onClickDrillDown={() =>
              abrirDrawerNaAba(
                resumoEstagios.trial_vencido >= resumoEstagios.churn_nao_renovado
                  ? 'trial_vencido'
                  : 'churn_nao_renovado',
                'Reativação: Vencidos & Churn'
              )
            }
          />

          {/* 5. Base de Lojas Ativas Pagantes */}
          <CockpitGaugeF1
            titulo="Base de Lojas Ativas Pagantes"
            subtituloTag="Vigência em dia hoje"
            valorRealizado={metricas.lojas_ativas_pagantes}
            valorMeta={metas.meta_hubi_lojas_ativas}
            tipoFormato="inteiro"
            isLoading={carregando && !payload}
            onClickDrillDown={() =>
              abrirDrawerNaAba('assinante_ativo', 'Base de Lojas Ativas Pagantes')
            }
          />

          {/* 6. Receita Carteira WhatsApp */}
          <CockpitGaugeF1
            titulo="Receita Carteira WhatsApp"
            subtituloTag="Recargas Pix aprovadas no período"
            valorRealizado={metricas.receita_whatsapp}
            valorMeta={metas.meta_hubi_receita_whatsapp}
            tipoFormato="moeda"
            isLoading={carregando && !payload}
            onClickDrillDown={() =>
              abrirDrawerNaAba('assinante_ativo', 'Carteira de Lojas — WhatsApp')
            }
          />
        </div>

        {/* Atalhos Rápidos dos 4 Estágios Comerciais */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${
            isDark
              ? 'bg-[#000000] border-slate-700 text-slate-100'
              : 'bg-white border-slate-300 text-black shadow-sm'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>
                Segmentação Comercial da Carteira
              </h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                Clique em qualquer estágio para abrir a gestão direta, WhatsApp contextualizado e ativação manual
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                id: 'trial_ativo' as EstagioComercialLoja,
                titulo: 'Em Período de Teste Ativo',
                qtd: resumoEstagios.trial_ativo,
                desc: 'Acompanhamento de onboarding',
              },
              {
                id: 'trial_vencido' as EstagioComercialLoja,
                titulo: 'Teste Vencido (Não Assinaram)',
                qtd: resumoEstagios.trial_vencido,
                desc: 'Oportunidades para conversão',
              },
              {
                id: 'churn_nao_renovado' as EstagioComercialLoja,
                titulo: 'Assinantes Não Renovados',
                qtd: resumoEstagios.churn_nao_renovado,
                desc: 'Recuperação de churn',
              },
              {
                id: 'assinante_ativo' as EstagioComercialLoja,
                titulo: 'Assinantes Ativos',
                qtd: resumoEstagios.assinante_ativo,
                desc: 'Base recorrente adimplente',
              },
            ].map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => abrirDrawerNaAba(card.id, card.titulo)}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                  isDark
                    ? 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-slate-100'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black'
                }`}
              >
                <div className="text-xs font-bold truncate">{card.titulo}</div>
                <div className="text-2xl font-black mt-1">{card.qtd}</div>
                <div className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                  {card.desc}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Gaveta Lateral Comercial */}
      <DrawerComercialAreaHubi
        isOpen={drawerAberto}
        onClose={() => setDrawerAberto(false)}
        lojas={lojas}
        abaInicial={abaDrawer}
        tituloContexto={tituloDrawer}
        onEditarLoja={(l) => setLojaParaEditar(l)}
        onAtivarManual={(l) => setLojaParaAtivarManual(l)}
      />

      {/* Modal Configurar Metas HUBI */}
      <ModalConfigurarMetasHubi
        isOpen={modalMetasAberto}
        onClose={() => setModalMetasAberto(false)}
        metasAtuais={metas}
        onSalvar={handleSalvarMetas}
      />

      {/* Modal Ver / Editar Dados da Loja (Super Admin) */}
      <ModalEditarLojaSuperAdmin
        isOpen={Boolean(lojaParaEditar)}
        onClose={() => setLojaParaEditar(null)}
        loja={lojaParaEditar}
        onSucesso={async () => {
          mostrarSucesso('Dados cadastrais e vigência da loja atualizados com sucesso.', 'Loja Atualizada');
          await carregarDados();
        }}
      />

      {/* Modal Ativar / Renovar Assinatura Manualmente */}
      <ModalAtivarAssinaturaManual
        isOpen={Boolean(lojaParaAtivarManual)}
        onClose={() => setLojaParaAtivarManual(null)}
        loja={lojaParaAtivarManual}
        onSucesso={async () => {
          mostrarSucesso(
            'Assinatura ativada manualmente e contabilizada no Faturamento Bruto HUBI.',
            'Assinatura Ativada'
          );
          await carregarDados();
        }}
      />
    </div>
  );
};
