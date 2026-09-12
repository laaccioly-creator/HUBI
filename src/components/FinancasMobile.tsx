import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  DollarSign,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Lock,
  Unlock,
  Banknote,
  Zap,
  CreditCard,
  ArrowDown,
  ArrowUp,
  Clock,
  Calendar,
  Search,
  CheckCircle2,
  FileSpreadsheet,
  Pencil,
  Trash2,
  Printer,
  Receipt,
  TrendingUp,
  RefreshCw,
  Store,
  Layers,
  Check,
  X
} from 'lucide-react';
import {
  TransacaoFinanceira,
  Pedido,
  UsuarioLoja,
  SessaoCaixa,
  MovimentacaoCaixa,
  ResumoSessaoCaixa
} from '../types';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';
import { obterDataOperacaoYMD } from '../utils/dataOperacao';

export interface FinancasMobileProps {
  // Dados & Sessão
  sessaoAtiva: SessaoCaixa | null;
  resumoSessao: ResumoSessaoCaixa | null;
  historicoSessoes: SessaoCaixa[];
  transacoes: TransacaoFinanceira[];
  pedidos: Pedido[];
  usuariosLoja: UsuarioLoja[];
  carregando: boolean;
  onRecarregar: () => Promise<void>;

  // Totais & Métricas
  totalReceitas: number;
  totalDespesasPagas: number;
  totalDespesasPendentes: number;
  lucroLiquido: number;

  // Listas calculadas
  listaTransacoesUnificada: any[];
  movimentacoesDaSessao: MovimentacaoCaixa[];
  vendasDaSessao: Pedido[];

  // Estados de Abas e Filtros
  abaAtiva: 'caixa_atual' | 'fluxo' | 'pagar' | 'historico_caixas';
  setAbaAtiva: (aba: 'caixa_atual' | 'fluxo' | 'pagar' | 'historico_caixas') => void;
  filtroPeriodoFluxo: 'sessao_atual' | 'hoje' | 'mes' | 'todos';
  setFiltroPeriodoFluxo: (p: 'sessao_atual' | 'hoje' | 'mes' | 'todos') => void;
  filtroMovimentacoes: 'todas' | 'vendas' | 'suprimentos' | 'sangrias' | 'despesas';
  setFiltroMovimentacoes: (f: 'todas' | 'vendas' | 'suprimentos' | 'sangrias' | 'despesas') => void;
  filtrosHistorico: {
    dataInicio: string;
    dataFim: string;
    usuarioId: string;
    statusDiferenca: 'todos' | 'com_diferenca' | 'exato';
  };
  setFiltrosHistorico: React.Dispatch<React.SetStateAction<{
    dataInicio: string;
    dataFim: string;
    usuarioId: string;
    statusDiferenca: 'todos' | 'com_diferenca' | 'exato';
  }>>;

  // Ações de Caixa
  onAbrirCaixa: () => void;
  onSuprimento: () => void;
  onSangria: () => void;
  onDespesaGaveta: () => void;
  onFechamentoCego: () => void;

  // Ações de Despesas / Métricas
  onNovaDespesa: () => void;
  onNovaContaPagar: () => void;
  onEditarTransacao: (tr: TransacaoFinanceira) => void;
  onBaixarConta: (tr: TransacaoFinanceira) => void;
  onConfirmarExclusao: (tr: TransacaoFinanceira) => void;
  onDetalhesMetrica: (tipo: 'entradas' | 'saidas' | 'pagar' | 'lucro') => void;
  onExportarEntradas: () => void;

  // Ações de Histórico
  onDrillDownSessao: (s: SessaoCaixa) => void;
  onReimprimirFechamento: (s: SessaoCaixa) => void;

  // Compatibilidade Legada (opcional)
  caixaAberto?: any;
  saldoEsperadoGaveta?: number;
}

export const FinancasMobile: React.FC<FinancasMobileProps> = ({
  sessaoAtiva,
  resumoSessao,
  historicoSessoes,
  usuariosLoja,
  carregando,
  onRecarregar,
  totalReceitas,
  totalDespesasPagas,
  totalDespesasPendentes,
  lucroLiquido,
  listaTransacoesUnificada,
  movimentacoesDaSessao,
  vendasDaSessao,
  abaAtiva,
  setAbaAtiva,
  filtroPeriodoFluxo,
  setFiltroPeriodoFluxo,
  filtroMovimentacoes,
  setFiltroMovimentacoes,
  filtrosHistorico,
  setFiltrosHistorico,
  onAbrirCaixa,
  onSuprimento,
  onSangria,
  onDespesaGaveta,
  onFechamentoCego,
  onNovaDespesa,
  onNovaContaPagar,
  onEditarTransacao,
  onBaixarConta,
  onConfirmarExclusao,
  onDetalhesMetrica,
  onExportarEntradas,
  onDrillDownSessao,
  onReimprimirFechamento,
  saldoEsperadoGaveta
}) => {
  const navigate = useNavigate();
  const [menuDrawerAberto, setMenuDrawerAberto] = useState(false);

  // Estados locais para busca e filtros de abas
  const [termoBuscaFluxo, setTermoBuscaFluxo] = useState('');
  const [termoBuscaPagar, setTermoBuscaPagar] = useState('');
  const [filtroStatusPagar, setFiltroStatusPagar] = useState<'pendente' | 'pago' | 'vencido' | 'todos'>('pendente');

  // Filtragem de Fluxo Geral
  const transacoesFluxoFiltradas = useMemo(() => {
    return listaTransacoesUnificada.filter((t) => {
      if (!termoBuscaFluxo) return true;
      const busca = termoBuscaFluxo.toLowerCase();
      const desc = (t.descricao || '').toLowerCase();
      const cat = (t.categoria || '').toLowerCase();
      const cli = ((t as any).cliente_nome || (t as any).cliente?.nome || (t as any).cliente_nome_avulso || '').toLowerCase();
      return desc.includes(busca) || cat.includes(busca) || cli.includes(busca);
    });
  }, [listaTransacoesUnificada, termoBuscaFluxo]);

  // Filtragem de Contas a Pagar
  const hojeYMD = obterDataOperacaoYMD();
  const contasPagarFiltradas = useMemo(() => {
    const despesas = listaTransacoesUnificada.filter((t) => t.tipo === 'SAIDA');
    return despesas.filter((t) => {
      // Filtro de status
      if (filtroStatusPagar === 'pendente') {
        if (t.status !== 'pendente') return false;
      } else if (filtroStatusPagar === 'pago') {
        if (t.status !== 'pago') return false;
      } else if (filtroStatusPagar === 'vencido') {
        if (t.status !== 'pendente') return false;
        const dtVenc = t.data_vencimento || (t as any).dataVencimento;
        if (!dtVenc || dtVenc >= hojeYMD) return false;
      }

      // Filtro de busca textual
      if (termoBuscaPagar) {
        const busca = termoBuscaPagar.toLowerCase();
        const desc = (t.descricao || '').toLowerCase();
        const cat = (t.categoria || '').toLowerCase();
        const forn = ((t as any).fornecedor_nome || (t as any).fornecedor?.nome_fantasia || (t as any).fornecedor?.nome || '').toLowerCase();
        if (!desc.includes(busca) && !cat.includes(busca) && !forn.includes(busca)) {
          return false;
        }
      }

      return true;
    });
  }, [listaTransacoesUnificada, filtroStatusPagar, termoBuscaPagar, hojeYMD]);

  // Filtragem de Histórico de Caixas
  const historicoFiltrado = useMemo(() => {
    return historicoSessoes.filter((cx) => {
      if (filtrosHistorico.usuarioId !== 'todos' && cx.aberto_por_usuario_id !== filtrosHistorico.usuarioId && cx.usuario_abertura?.id !== filtrosHistorico.usuarioId) {
        return false;
      }
      if (filtrosHistorico.dataInicio && cx.aberto_em < filtrosHistorico.dataInicio) {
        return false;
      }
      if (filtrosHistorico.dataFim && cx.aberto_em > filtrosHistorico.dataFim + 'T23:59:59') {
        return false;
      }
      if (filtrosHistorico.statusDiferenca === 'com_diferenca') {
        const dif = Number(cx.diferenca_dinheiro || 0);
        if (Math.abs(dif) <= 0.01) return false;
      } else if (filtrosHistorico.statusDiferenca === 'exato') {
        const dif = Number(cx.diferenca_dinheiro || 0);
        if (Math.abs(dif) > 0.01) return false;
      }
      return true;
    });
  }, [historicoSessoes, filtrosHistorico]);

  // Filtragem de Movimentações do Turno
  const movimentacoesTurnoFiltradas = useMemo(() => {
    if (!movimentacoesDaSessao) return [];
    if (filtroMovimentacoes === 'todas') return movimentacoesDaSessao;
    return movimentacoesDaSessao.filter((m) => {
      if (filtroMovimentacoes === 'vendas') return m.tipo === 'VENDA';
      if (filtroMovimentacoes === 'suprimentos') return m.tipo === 'SUPRIMENTO';
      if (filtroMovimentacoes === 'sangrias') return m.tipo === 'SANGRIA';
      if (filtroMovimentacoes === 'despesas') return m.tipo === 'DESPESA';
      return true;
    });
  }, [movimentacoesDaSessao, filtroMovimentacoes]);

  const saldoDinheiroExibicao =
    resumoSessao?.saldoEsperadoDinheiro ?? saldoEsperadoGaveta ?? (sessaoAtiva?.fundo_inicial || 0);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-50 text-slate-900 font-sans select-none">
      {/* 1. CABEÇALHO SUPERIOR MOBILE */}
      <div className="h-14 border-b border-slate-200 bg-white px-3 sm:px-4 flex items-center justify-between shrink-0 sticky top-0 z-20 shadow-2xs">
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
            onClick={() => setMenuDrawerAberto(true)}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition cursor-pointer"
            title="Menu Principal"
          >
            <div className="space-y-1">
              <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
              <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
              <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
            </div>
          </button>
          <div className="min-w-0">
            <h1 className="font-black text-sm sm:text-base text-slate-800 leading-tight truncate">
              Finanças & Caixa
            </h1>
            <p className="text-[10px] text-slate-500 truncate">
              {sessaoAtiva
                ? `Turno ${sessaoAtiva.terminal_id} • ${sessaoAtiva.usuario_abertura?.nome_completo || 'Operador'}`
                : 'Nenhum turno aberto'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRecarregar}
            disabled={carregando}
            className="p-1.5 rounded-xl text-slate-500 hover:bg-slate-100 active:scale-95 transition cursor-pointer"
            title="Recarregar dados"
          >
            <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide border flex items-center gap-1.5 ${
              sessaoAtiva
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                sessaoAtiva ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            />
            {sessaoAtiva ? 'ABERTO' : 'FECHADO'}
          </span>
        </div>
      </div>

      {/* 2. BARRA DE AÇÕES RÁPIDAS DE CAIXA */}
      <div className="p-2.5 sm:p-3 bg-white border-b border-slate-200 shrink-0 shadow-2xs">
        {sessaoAtiva ? (
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {/* Suprimento */}
            <button
              type="button"
              onClick={onSuprimento}
              className="py-2 px-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-[11px] flex flex-col items-center justify-center gap-1 transition active:scale-95 cursor-pointer shadow-2xs"
              title="Adicionar Troco Extra na Gaveta"
            >
              <ArrowDown className="w-4 h-4 text-emerald-600" />
              <span className="truncate">Suprimento</span>
            </button>

            {/* Sangria */}
            <button
              type="button"
              onClick={onSangria}
              className="py-2 px-1 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-bold text-[11px] flex flex-col items-center justify-center gap-1 transition active:scale-95 cursor-pointer shadow-2xs"
              title="Retirar Dinheiro para o Cofre"
            >
              <ArrowUp className="w-4 h-4 text-rose-600" />
              <span className="truncate">Sangria</span>
            </button>

            {/* Despesa de Gaveta */}
            <button
              type="button"
              onClick={onDespesaGaveta}
              className="py-2 px-1 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold text-[11px] flex flex-col items-center justify-center gap-1 transition active:scale-95 cursor-pointer shadow-2xs"
              title="Despesa Paga com Dinheiro da Gaveta"
            >
              <Banknote className="w-4 h-4 text-amber-600" />
              <span className="truncate">Desp. Gaveta</span>
            </button>

            {/* Fechar Caixa */}
            <button
              type="button"
              onClick={onFechamentoCego}
              className="py-2 px-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-black text-[11px] flex flex-col items-center justify-center gap-1 transition active:scale-95 cursor-pointer shadow-2xs"
              title="Fechar Turno / Conferência Cega"
            >
              <Lock className="w-4 h-4 text-amber-400" />
              <span className="truncate">Fechar Caixa</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAbrirCaixa}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer"
          >
            <Unlock className="w-4 h-4" />
            <span>Abrir Novo Turno de Caixa</span>
          </button>
        )}
      </div>

      {/* 3. CARDS DE RESUMO FINANCEIRO GERAL (2x2) */}
      <div className="p-2.5 sm:p-3 bg-slate-100/70 border-b border-slate-200 shrink-0">
        <div className="grid grid-cols-2 gap-2">
          {/* Entradas */}
          <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> Entradas
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onExportarEntradas}
                  title="Exportar Excel"
                  className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[9px] font-bold cursor-pointer"
                >
                  <FileSpreadsheet className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onDetalhesMetrica('entradas')}
                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-bold cursor-pointer"
                >
                  Detalhar
                </button>
              </div>
            </div>
            <span className="text-sm font-black text-emerald-600 block truncate">
              R$ {totalReceitas.toFixed(2)}
            </span>
          </div>

          {/* Despesas */}
          <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" /> Despesas
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onNovaDespesa}
                  className="px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[9px] font-bold flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="w-2.5 h-2.5" /> Nova
                </button>
                <button
                  type="button"
                  onClick={() => onDetalhesMetrica('saidas')}
                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-bold cursor-pointer"
                >
                  Detalhar
                </button>
              </div>
            </div>
            <span className="text-sm font-black text-rose-600 block truncate">
              R$ {totalDespesasPagas.toFixed(2)}
            </span>
          </div>

          {/* A Pagar */}
          <div className="bg-white border border-amber-200 rounded-xl p-2.5 shadow-2xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> A Pagar
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onNovaContaPagar}
                  className="px-1.5 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 text-[9px] font-bold flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="w-2.5 h-2.5" /> Nova
                </button>
                <button
                  type="button"
                  onClick={() => onDetalhesMetrica('pagar')}
                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-bold cursor-pointer"
                >
                  Detalhar
                </button>
              </div>
            </div>
            <span className="text-sm font-black text-amber-600 block truncate">
              R$ {totalDespesasPendentes.toFixed(2)}
            </span>
          </div>

          {/* Resultado */}
          <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs space-y-1">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-slate-500 block truncate">Resultado</span>
                <span className="text-[8px] font-bold text-indigo-600 block truncate">
                  {filtroPeriodoFluxo === 'sessao_atual'
                    ? 'Turno'
                    : filtroPeriodoFluxo === 'hoje'
                    ? 'Hoje'
                    : filtroPeriodoFluxo === 'mes'
                    ? 'Este Mês'
                    : 'Geral'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onDetalhesMetrica('lucro')}
                className="px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[9px] font-bold cursor-pointer"
              >
                Detalhar
              </button>
            </div>
            <span
              className={`text-sm font-black block truncate ${
                lucroLiquido >= 0 ? 'text-indigo-600' : 'text-rose-600'
              }`}
            >
              R$ {lucroLiquido.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* 4. NAVEGAÇÃO DAS 4 ABAS HORIZONTAIS */}
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-1.5 bg-white border-b border-slate-200 overflow-x-auto scrollbar-none shrink-0">
        {/* Aba 1 */}
        <button
          type="button"
          onClick={() => setAbaAtiva('caixa_atual')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
            abaAtiva === 'caixa_atual'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span>Turno / Gaveta</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              sessaoAtiva ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
            }`}
          />
        </button>

        {/* Aba 2 */}
        <button
          type="button"
          onClick={() => setAbaAtiva('fluxo')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
            abaAtiva === 'fluxo'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span>Fluxo Geral</span>
          <span className="text-[10px] font-bold opacity-75">
            ({listaTransacoesUnificada.length})
          </span>
        </button>

        {/* Aba 3 */}
        <button
          type="button"
          onClick={() => setAbaAtiva('pagar')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
            abaAtiva === 'pagar'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span>Contas a Pagar</span>
          {totalDespesasPendentes > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-black">
              {listaTransacoesUnificada.filter((t) => t.tipo === 'SAIDA' && t.status === 'pendente').length}
            </span>
          )}
        </button>

        {/* Aba 4 */}
        <button
          type="button"
          onClick={() => setAbaAtiva('historico_caixas')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
            abaAtiva === 'historico_caixas'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span>Histórico</span>
          <span className="text-[10px] font-bold opacity-75">
            ({historicoSessoes.length})
          </span>
        </button>
      </div>

      {/* 5. CORPO / CONTEÚDO DA ABA SELECIONADA */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {carregando ? (
          <div className="text-center py-16 text-slate-400 text-xs flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
            <span>Carregando dados financeiros...</span>
          </div>
        ) : (
          <>
            {/* ================================================================= */}
            {/* ABA 1: TURNO / GAVETA ATUAL                                       */}
            {/* ================================================================= */}
            {abaAtiva === 'caixa_atual' && (
              <div className="space-y-3">
                {sessaoAtiva && resumoSessao ? (
                  <>
                    {/* Alerta de 24 horas */}
                    {resumoSessao.abertoHaMaisDe24h && (
                      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 flex items-center gap-2.5 text-amber-900 animate-pulse">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        <div className="text-[11px] leading-tight">
                          <strong className="block font-bold">
                            Atenção: Turno aberto há mais de 24h ({resumoSessao.duracaoTexto})
                          </strong>
                          Recomenda-se realizar o Fechamento Cego e abrir uma nova sessão.
                        </div>
                      </div>
                    )}

                    {/* KPI PRINCIPAL: SALDO ESPERADO EM DINHEIRO NA GAVETA FÍSICA */}
                    <div className="bg-gradient-to-br from-emerald-900 to-slate-900 text-white p-4 rounded-2xl shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-300 flex items-center gap-1.5">
                            <Banknote className="w-4 h-4" /> Saldo Esperado em Dinheiro na Gaveta
                          </span>
                          <span className="text-2xl font-black text-emerald-200 block">
                            R$ {saldoDinheiroExibicao.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-300 bg-white/10 px-2 py-1 rounded-xl">
                          Físico na Gaveta
                        </span>
                      </div>

                      {/* FÓRMULA DETALHADA DA GAVETA */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-2 border-t border-white/15 text-[10px]">
                        <div className="bg-black/25 p-2 rounded-xl">
                          <span className="text-slate-300 block text-[9px]">Fundo Inicial</span>
                          <span className="font-bold text-slate-100">
                            + R$ {(resumoSessao.fundoInicial ?? Number(sessaoAtiva.fundo_inicial || 0)).toFixed(2)}
                          </span>
                        </div>
                        <div className="bg-black/25 p-2 rounded-xl">
                          <span className="text-slate-300 block text-[9px]">Vendas em Dinheiro</span>
                          <span className="font-bold text-emerald-300">
                            + R$ {resumoSessao.totaisPorMetodo.dinheiro.toFixed(2)}
                          </span>
                        </div>
                        <div className="bg-black/25 p-2 rounded-xl">
                          <span className="text-slate-300 block text-[9px]">Suprimentos</span>
                          <span className="font-bold text-cyan-300">
                            + R$ {resumoSessao.totalSuprimentos.toFixed(2)}
                          </span>
                        </div>
                        <div className="bg-black/25 p-2 rounded-xl">
                          <span className="text-slate-300 block text-[9px]">Sangrias (Cofre)</span>
                          <span className="font-bold text-rose-300">
                            - R$ {resumoSessao.totalSangrias.toFixed(2)}
                          </span>
                        </div>
                        <div className="bg-black/25 p-2 rounded-xl">
                          <span className="text-slate-300 block text-[9px]">Despesas de Gaveta</span>
                          <span className="font-bold text-amber-300">
                            - R$ {resumoSessao.totalDespesas.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* VENDAS DO TURNO POR MEIO DE PAGAMENTO */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Vendas por Meio de Pagamento
                        </span>
                        <span className="text-xs font-black text-emerald-700">
                          Total: R$ {resumoSessao.faturamentoTotalVendas.toFixed(2)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Dinheiro */}
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                          <div className="flex items-center justify-between text-slate-500">
                            <span className="text-[11px] font-bold">Dinheiro</span>
                            <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                          </div>
                          <span className="text-sm font-bold text-emerald-700 block">
                            R$ {resumoSessao.totaisPorMetodo.dinheiro.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {resumoSessao.qtdVendasPorMetodo.dinheiro} vendas
                          </span>
                        </div>

                        {/* Pix */}
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                          <div className="flex items-center justify-between text-slate-500">
                            <span className="text-[11px] font-bold">Pix</span>
                            <Zap className="w-3.5 h-3.5 text-cyan-600" />
                          </div>
                          <span className="text-sm font-bold text-cyan-700 block">
                            R$ {resumoSessao.totaisPorMetodo.pix.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {resumoSessao.qtdVendasPorMetodo.pix} vendas
                          </span>
                        </div>

                        {/* Cartão Débito */}
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                          <div className="flex items-center justify-between text-slate-500">
                            <span className="text-[11px] font-bold">Débito</span>
                            <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                          </div>
                          <span className="text-sm font-bold text-indigo-700 block">
                            R$ {resumoSessao.totaisPorMetodo.cartao_debito.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {resumoSessao.qtdVendasPorMetodo.cartao_debito} vendas
                          </span>
                        </div>

                        {/* Cartão Crédito */}
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                          <div className="flex items-center justify-between text-slate-500">
                            <span className="text-[11px] font-bold">Crédito</span>
                            <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                          </div>
                          <span className="text-sm font-bold text-purple-700 block">
                            R$ {resumoSessao.totaisPorMetodo.cartao_credito.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {resumoSessao.qtdVendasPorMetodo.cartao_credito} vendas
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* MOVIMENTAÇÕES DO TURNO COM FILTROS */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Movimentações do Turno
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          {movimentacoesTurnoFiltradas.length} registro(s)
                        </span>
                      </div>

                      {/* Filtros em Pílulas */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                        {(['todas', 'vendas', 'suprimentos', 'sangrias', 'despesas'] as const).map((filtro) => (
                          <button
                            key={filtro}
                            type="button"
                            onClick={() => setFiltroMovimentacoes(filtro)}
                            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold whitespace-nowrap transition cursor-pointer ${
                              filtroMovimentacoes === filtro
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {filtro === 'todas' && 'Todas'}
                            {filtro === 'vendas' && 'Vendas'}
                            {filtro === 'suprimentos' && 'Suprimentos'}
                            {filtro === 'sangrias' && 'Sangrias'}
                            {filtro === 'despesas' && 'Despesas'}
                          </button>
                        ))}
                      </div>

                      {/* Lista de Movimentações */}
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {movimentacoesTurnoFiltradas.length === 0 ? (
                          <div className="text-center py-6 text-slate-400 text-xs">
                            Nenhuma movimentação registrada neste filtro.
                          </div>
                        ) : (
                          movimentacoesTurnoFiltradas.map((m) => {
                            const isEntrada = m.tipo === 'VENDA' || m.tipo === 'SUPRIMENTO';
                            return (
                              <div
                                key={m.id}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                                      m.tipo === 'VENDA'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : m.tipo === 'SUPRIMENTO'
                                        ? 'bg-cyan-100 text-cyan-700'
                                        : m.tipo === 'SANGRIA'
                                        ? 'bg-rose-100 text-rose-700'
                                        : 'bg-amber-100 text-amber-700'
                                    }`}
                                  >
                                    {m.tipo === 'VENDA' && <ArrowUpRight className="w-3.5 h-3.5" />}
                                    {m.tipo === 'SUPRIMENTO' && <ArrowDown className="w-3.5 h-3.5" />}
                                    {m.tipo === 'SANGRIA' && <ArrowUp className="w-3.5 h-3.5" />}
                                    {m.tipo === 'DESPESA' && <Banknote className="w-3.5 h-3.5" />}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="font-bold text-slate-800 block truncate">
                                      {m.tipo === 'VENDA' && 'Venda Realizada'}
                                      {m.tipo === 'SUPRIMENTO' && 'Suprimento (Troco)'}
                                      {m.tipo === 'SANGRIA' && 'Sangria (Cofre)'}
                                      {m.tipo === 'DESPESA' && (m.descricao || 'Despesa de Gaveta')}
                                    </span>
                                    <span className="text-[10px] text-slate-500 block truncate">
                                      {new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • {m.metodo_pagamento || 'Dinheiro'}
                                    </span>
                                  </div>
                                </div>

                                <span
                                  className={`font-black text-xs shrink-0 ${
                                    isEntrada ? 'text-emerald-700' : 'text-rose-700'
                                  }`}
                                >
                                  {isEntrada ? '+' : '-'} R$ {Number(m.valor || 0).toFixed(2)}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* VENDAS DA SESSÃO */}
                    {vendasDaSessao && vendasDaSessao.length > 0 && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs space-y-2">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                          Pedidos do Turno ({vendasDaSessao.length})
                        </span>
                        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                          {vendasDaSessao.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/70 text-xs"
                            >
                              <div>
                                <span className="font-bold text-slate-800 block">
                                  Pedido #{p.numero_pedido || p.id.slice(0, 6)}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {p.cliente?.nome || p.cliente_nome_avulso || 'Consumidor Final'} • {p.criado_em ? new Date(p.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </div>
                              <span className="font-bold text-emerald-700">
                                R$ {Number(p.valor_total || 0).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* ESTADO: CAIXA FECHADO */
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 text-center space-y-4 shadow-2xs">
                    <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
                      <Lock className="w-7 h-7" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-black text-base text-slate-800">Turno de Caixa Fechado</h3>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto">
                        Abra um novo turno com fundo de troco para iniciar vendas no PDV, receber pagamentos e controlar a gaveta física.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onAbrirCaixa}
                      className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer transition"
                    >
                      <Unlock className="w-4 h-4" />
                      <span>Abrir Novo Turno de Caixa</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ================================================================= */}
            {/* ABA 2: FLUXO GERAL                                                */}
            {/* ================================================================= */}
            {abaAtiva === 'fluxo' && (
              <div className="space-y-3">
                {/* Seletor de Período */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {sessaoAtiva && (
                    <button
                      type="button"
                      onClick={() => setFiltroPeriodoFluxo('sessao_atual')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1 ${
                        filtroPeriodoFluxo === 'sessao_atual'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                      <span>Turno Atual</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFiltroPeriodoFluxo('hoje')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      filtroPeriodoFluxo === 'hoje'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >
                    Hoje
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroPeriodoFluxo('mes')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      filtroPeriodoFluxo === 'mes'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >
                    Este Mês
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroPeriodoFluxo('todos')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      filtroPeriodoFluxo === 'todos'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >
                    Todos os Registros
                  </button>
                </div>

                {/* Mini DRE do Período */}
                <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block">Entradas</span>
                    <span className="font-bold text-emerald-600">
                      R$ {totalReceitas.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block">Saídas Pagas</span>
                    <span className="font-bold text-rose-600">
                      R$ {totalDespesasPagas.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block">Saldo</span>
                    <span
                      className={`font-black ${
                        lucroLiquido >= 0 ? 'text-indigo-600' : 'text-rose-600'
                      }`}
                    >
                      R$ {lucroLiquido.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Campo de Busca */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar no fluxo por descrição ou categoria..."
                    value={termoBuscaFluxo}
                    onChange={(e) => setTermoBuscaFluxo(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Lista de Transações */}
                <div className="space-y-2">
                  {transacoesFluxoFiltradas.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-xs bg-white rounded-2xl border border-slate-200 p-4">
                      Nenhum registro encontrado no período selecionado.
                    </div>
                  ) : (
                    transacoesFluxoFiltradas.map((t) => {
                      const isEntrada = t.tipo === 'ENTRADA';
                      return (
                        <div
                          key={t.id}
                          className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-bold text-xs text-slate-800 block truncate">
                                {t.descricao}
                              </span>
                              <span className="text-[10px] text-slate-500 block">
                                {t.categoria || 'Geral'} • {new Date(t.data_vencimento || (t as any).criado_em || (t as any).data || Date.now()).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <span
                              className={`font-black text-xs shrink-0 ${
                                isEntrada ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {isEntrada ? '+' : '-'} R$ {Number(t.valor || 0).toFixed(2)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px]">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold ${
                                t.status === 'pago'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {t.status === 'pago' ? 'PAGO' : 'PENDENTE'}
                            </span>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onEditarTransacao(t)}
                                className="p-1 text-slate-500 hover:text-emerald-600 cursor-pointer"
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onConfirmarExclusao(t)}
                                className="p-1 text-slate-500 hover:text-rose-600 cursor-pointer"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* ABA 3: CONTAS A PAGAR                                             */}
            {/* ================================================================= */}
            {abaAtiva === 'pagar' && (
              <div className="space-y-3">
                {/* Filtros de Status */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {(['pendente', 'vencido', 'pago', 'todos'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFiltroStatusPagar(st)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                        filtroStatusPagar === st
                          ? 'bg-amber-500 text-slate-950 shadow-2xs font-black'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {st === 'pendente' && 'Pendentes'}
                      {st === 'vencido' && 'Vencidas'}
                      {st === 'pago' && 'Já Pagas'}
                      {st === 'todos' && 'Todas'}
                    </button>
                  ))}
                </div>

                {/* Campo de Busca e Botão Nova Conta */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar conta a pagar..."
                      value={termoBuscaPagar}
                      onChange={(e) => setTermoBuscaPagar(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={onNovaContaPagar}
                    className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Nova</span>
                  </button>
                </div>

                {/* Lista de Contas a Pagar */}
                <div className="space-y-2">
                  {contasPagarFiltradas.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-xs bg-white rounded-2xl border border-slate-200 p-4">
                      Nenhuma conta a pagar encontrada neste filtro.
                    </div>
                  ) : (
                    contasPagarFiltradas.map((tr) => {
                      const isVencido =
                        tr.status === 'pendente' &&
                        tr.data_vencimento &&
                        tr.data_vencimento < hojeYMD;

                      return (
                        <div
                          key={tr.id}
                          className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-bold text-xs text-slate-800 block truncate">
                                {tr.descricao}
                              </span>
                              <span className="text-[10px] text-slate-500 block">
                                {tr.categoria || 'Geral'} • Vence em: {tr.data_vencimento ? new Date(tr.data_vencimento).toLocaleDateString('pt-BR') : 'Sem data'}
                              </span>
                            </div>
                            <span className="font-black text-sm text-amber-600 shrink-0">
                              R$ {Number(tr.valor || 0).toFixed(2)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                tr.status === 'pago'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : isVencido
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200 font-black'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {tr.status === 'pago' ? 'PAGA' : isVencido ? 'VENCIDA' : 'PENDENTE'}
                            </span>

                            <div className="flex items-center gap-1.5">
                              {tr.status === 'pendente' && (
                                <button
                                  type="button"
                                  onClick={() => onBaixarConta(tr)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[10px] flex items-center gap-1 cursor-pointer shadow-2xs"
                                >
                                  <Check className="w-3 h-3 stroke-[3]" />
                                  <span>Pagar</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onEditarTransacao(tr)}
                                className="p-1 text-slate-500 hover:text-emerald-600 cursor-pointer"
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onConfirmarExclusao(tr)}
                                className="p-1 text-slate-500 hover:text-rose-600 cursor-pointer"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* ABA 4: HISTÓRICO & AUDITORIA DE CAIXAS                            */}
            {/* ================================================================= */}
            {abaAtiva === 'historico_caixas' && (
              <div className="space-y-3">
                {/* Filtros de Histórico */}
                <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs space-y-2 text-xs">
                  <span className="font-bold text-slate-700 block uppercase tracking-wider text-[10px]">
                    Filtrar Sessões
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">Operador</label>
                      <select
                        value={filtrosHistorico.usuarioId}
                        onChange={(e) =>
                          setFiltrosHistorico((prev) => ({ ...prev, usuarioId: e.target.value }))
                        }
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-xs text-slate-700"
                      >
                        <option value="todos">Todos os Operadores</option>
                        {usuariosLoja.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nome_completo || u.email}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">Conferência</label>
                      <select
                        value={filtrosHistorico.statusDiferenca}
                        onChange={(e) =>
                          setFiltrosHistorico((prev) => ({
                            ...prev,
                            statusDiferenca: e.target.value as any
                          }))
                        }
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-xs text-slate-700"
                      >
                        <option value="todos">Todas</option>
                        <option value="com_diferenca">Com Diferença</option>
                        <option value="exato">Fechamento Exato</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Lista de Sessões Anteriores */}
                <div className="space-y-2">
                  {historicoFiltrado.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-xs bg-white rounded-2xl border border-slate-200 p-4">
                      Nenhuma sessão de caixa encontrada no histórico.
                    </div>
                  ) : (
                    historicoFiltrado.map((cx) => {
                      const diferenca = Number(cx.diferenca_dinheiro || 0);
                      const temDiferenca = Math.abs(diferenca) > 0.01;
                      const isSobra = diferenca > 0.01;

                      return (
                        <div
                          key={cx.id}
                          className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-bold text-xs text-slate-800 block">
                                Terminal {cx.terminal_id} • {cx.usuario_abertura?.nome_completo || 'Operador'}
                              </span>
                              <span className="text-[10px] text-slate-500 block">
                                Aberto: {new Date(cx.aberto_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                              {cx.fechado_em && (
                                <span className="text-[10px] text-slate-500 block">
                                  Fechado: {new Date(cx.fechado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                                </span>
                              )}
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                                !cx.fechado_em
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : !temDiferenca
                                  ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                  : isSobra
                                  ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {!cx.fechado_em
                                ? '● ABERTO'
                                : !temDiferenca
                                ? 'EXATO'
                                : isSobra
                                ? `+ R$ ${diferenca.toFixed(2)}`
                                : `- R$ ${Math.abs(diferenca).toFixed(2)}`}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl text-[10px] border border-slate-200/60">
                            <div>
                              <span className="text-slate-400 block">Fundo Inicial:</span>
                              <strong className="text-slate-700">
                                R$ {Number(cx.fundo_inicial || 0).toFixed(2)}
                              </strong>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Faturamento Total:</span>
                              <strong className="text-emerald-700">
                                R$ {Number(cx.faturamento_total || 0).toFixed(2)}
                              </strong>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => onDrillDownSessao(cx)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                            >
                              <Search className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Detalhar</span>
                            </button>

                            {cx.fechado_em && (
                              <button
                                type="button"
                                onClick={() => onReimprimirFechamento(cx)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition"
                                title="Reimprimir Comprovante de Fechamento"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 6. DRAWER DE NAVEGAÇÃO MOBILE */}
      <MobileMenuDrawer
        aberto={menuDrawerAberto}
        onFechar={() => setMenuDrawerAberto(false)}
      />
    </div>
  );
};
