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
import { useTheme } from '../contexts/ThemeContext';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';
import { MobileHeader } from './layout/MobileHeader';
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
  const { isDark } = useTheme();
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
    <div className={`flex flex-col h-full w-full overflow-hidden font-sans select-none ${isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-black'}`}>
      {/* 1. CABEÇALHO SUPERIOR MOBILE UNIFICADO */}
      <MobileHeader
        titulo="Finanças & Caixa"
        subtitulo={
          sessaoAtiva
            ? `Turno ${sessaoAtiva.terminal_id} • ${sessaoAtiva.usuario_abertura?.nome_completo || 'Operador'}`
            : 'Nenhum turno aberto'
        }
        acoesDireita={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRecarregar}
              disabled={carregando}
              className={`p-1.5 rounded-xl active:scale-95 transition cursor-pointer ${
                isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-200'
              }`}
              title="Recarregar dados"
            >
              <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin text-emerald-500' : ''}`} />
            </button>

            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide border flex items-center gap-1.5 ${
                sessaoAtiva
                  ? isDark
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : isDark
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-rose-50 text-rose-800 border-rose-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${sessaoAtiva ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              {sessaoAtiva ? 'ABERTO' : 'FECHADO'}
            </span>
          </div>
        }
      />


      {/* 2. BARRA DE AÇÕES RÁPIDAS DE CAIXA */}
      <div className={`p-2.5 sm:p-3 shrink-0 shadow-xs ${isDark ? 'bg-[#08131A] border-b border-slate-700' : 'bg-slate-100 border-b-2 border-slate-300'}`}>
        {sessaoAtiva ? (
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {/* Suprimento */}
            <button
              type="button"
              onClick={onSuprimento}
              className={`py-2 px-1 rounded-xl font-bold text-[11px] flex flex-col items-center justify-center gap-1 transition active:scale-95 cursor-pointer shadow-xs ${
                isDark
                  ? 'bg-[#000000] border border-slate-700 text-white hover:bg-slate-900'
                  : 'bg-white border-2 border-slate-300 text-black hover:bg-slate-100'
              }`}
              title="Adicionar Troco Extra na Gaveta"
            >
              <ArrowDown className="w-4 h-4 text-emerald-500" />
              <span className="truncate">Suprimento</span>
            </button>

            {/* Sangria */}
            <button
              type="button"
              onClick={onSangria}
              className={`py-2 px-1 rounded-xl font-bold text-[11px] flex flex-col items-center justify-center gap-1 transition active:scale-95 cursor-pointer shadow-xs ${
                isDark
                  ? 'bg-[#000000] border border-slate-700 text-white hover:bg-slate-900'
                  : 'bg-white border-2 border-slate-300 text-black hover:bg-slate-100'
              }`}
              title="Retirar Dinheiro para o Cofre"
            >
              <ArrowUp className="w-4 h-4 text-rose-500" />
              <span className="truncate">Sangria</span>
            </button>

            {/* Despesa de Gaveta */}
            <button
              type="button"
              onClick={onDespesaGaveta}
              className={`py-2 px-1 rounded-xl font-bold text-[11px] flex flex-col items-center justify-center gap-1 transition active:scale-95 cursor-pointer shadow-xs ${
                isDark
                  ? 'bg-[#000000] border border-slate-700 text-white hover:bg-slate-900'
                  : 'bg-white border-2 border-slate-300 text-black hover:bg-slate-100'
              }`}
              title="Despesa Paga com Dinheiro da Gaveta"
            >
              <Banknote className="w-4 h-4 text-amber-500" />
              <span className="truncate">Desp. Gaveta</span>
            </button>

            {/* Fechar Caixa */}
            <button
              type="button"
              onClick={onFechamentoCego}
              className="py-2 px-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] flex flex-col items-center justify-center gap-1 transition active:scale-95 cursor-pointer border border-emerald-500 shadow-xs"
              title="Fechar Turno / Conferência Cega"
            >
              <Lock className="w-4 h-4 text-white" />
              <span className="truncate">Fechar Caixa</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAbrirCaixa}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md border border-emerald-500 flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer"
          >
            <Unlock className="w-4 h-4" />
            <span>Abrir Novo Turno de Caixa</span>
          </button>
        )}
      </div>

      {/* 3. CARDS DE RESUMO FINANCEIRO GERAL (2x2) */}
      <div className={`p-2.5 sm:p-3 shrink-0 ${isDark ? 'bg-[#08131A] border-b border-slate-700' : 'bg-slate-100 border-b-2 border-slate-300'}`}>
        <div className="grid grid-cols-2 gap-2">
          {/* Entradas */}
          <div className={`rounded-2xl p-2.5 shadow-xs space-y-1 ${isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold flex items-center gap-1 ${isDark ? 'text-white' : 'text-black'}`}>
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> Entradas
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onExportarEntradas}
                  title="Exportar Excel"
                  className="p-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold cursor-pointer border border-emerald-500 transition"
                >
                  <FileSpreadsheet className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onDetalhesMetrica('entradas')}
                  className="px-1.5 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold cursor-pointer border border-emerald-500 transition"
                >
                  Detalhar
                </button>
              </div>
            </div>
            <span className={`text-sm font-black block truncate ${isDark ? 'text-white' : 'text-black'}`}>
              R$ {totalReceitas.toFixed(2)}
            </span>
          </div>

          {/* Despesas */}
          <div className={`rounded-2xl p-2.5 shadow-xs space-y-1 ${isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold flex items-center gap-1 ${isDark ? 'text-white' : 'text-black'}`}>
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" /> Despesas
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onNovaDespesa}
                  className="px-1.5 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold flex items-center gap-0.5 cursor-pointer border border-emerald-500 transition"
                >
                  <Plus className="w-2.5 h-2.5" /> Nova
                </button>
                <button
                  type="button"
                  onClick={() => onDetalhesMetrica('saidas')}
                  className="px-1.5 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold cursor-pointer border border-emerald-500 transition"
                >
                  Detalhar
                </button>
              </div>
            </div>
            <span className={`text-sm font-black block truncate ${isDark ? 'text-white' : 'text-black'}`}>
              R$ {totalDespesasPagas.toFixed(2)}
            </span>
          </div>

          {/* A Pagar */}
          <div className={`rounded-2xl p-2.5 shadow-xs space-y-1 ${isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold flex items-center gap-1 ${isDark ? 'text-white' : 'text-black'}`}>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> A Pagar
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onNovaContaPagar}
                  className="px-1.5 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold flex items-center gap-0.5 cursor-pointer border border-emerald-500 transition"
                >
                  <Plus className="w-2.5 h-2.5" /> Nova
                </button>
                <button
                  type="button"
                  onClick={() => onDetalhesMetrica('pagar')}
                  className="px-1.5 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold cursor-pointer border border-emerald-500 transition"
                >
                  Detalhar
                </button>
              </div>
            </div>
            <span className={`text-sm font-black block truncate ${isDark ? 'text-white' : 'text-black'}`}>
              R$ {totalDespesasPendentes.toFixed(2)}
            </span>
          </div>

          {/* Resultado */}
          <div className={`rounded-2xl p-2.5 shadow-xs space-y-1 ${isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'}`}>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <span className={`text-[10px] font-bold block truncate ${isDark ? 'text-white' : 'text-black'}`}>Resultado</span>
                <span className="text-[8px] font-bold text-emerald-500 block truncate">
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
                className="px-1.5 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold cursor-pointer border border-emerald-500 transition"
              >
                Detalhar
              </button>
            </div>
            <span className={`text-sm font-black block truncate ${isDark ? 'text-white' : 'text-black'}`}>
              R$ {lucroLiquido.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* 4. NAVEGAÇÃO DAS 4 ABAS HORIZONTAIS */}
      <div className={`flex items-center gap-1.5 px-3 pt-2 pb-2 overflow-x-auto scrollbar-none shrink-0 ${isDark ? 'bg-[#08131A] border-b border-slate-700' : 'bg-slate-100 border-b-2 border-slate-300'}`}>
        {/* Aba 1 */}
        <button
          type="button"
          onClick={() => setAbaAtiva('caixa_atual')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
            abaAtiva === 'caixa_atual'
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-black border border-emerald-500 shadow-xs'
              : isDark
              ? 'bg-[#000000] text-white border border-slate-700 hover:bg-slate-900'
              : 'bg-white text-black border-2 border-slate-300 hover:bg-slate-100'
          }`}
        >
          <span>Turno / Gaveta</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              sessaoAtiva ? 'bg-emerald-300 animate-pulse' : 'bg-slate-400'
            }`}
          />
        </button>

        {/* Aba 2 */}
        <button
          type="button"
          onClick={() => setAbaAtiva('fluxo')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
            abaAtiva === 'fluxo'
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-black border border-emerald-500 shadow-xs'
              : isDark
              ? 'bg-[#000000] text-white border border-slate-700 hover:bg-slate-900'
              : 'bg-white text-black border-2 border-slate-300 hover:bg-slate-100'
          }`}
        >
          <span>Fluxo Geral</span>
          <span className="text-[10px] font-bold opacity-80">
            ({listaTransacoesUnificada.length})
          </span>
        </button>

        {/* Aba 3 */}
        <button
          type="button"
          onClick={() => setAbaAtiva('pagar')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
            abaAtiva === 'pagar'
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-black border border-emerald-500 shadow-xs'
              : isDark
              ? 'bg-[#000000] text-white border border-slate-700 hover:bg-slate-900'
              : 'bg-white text-black border-2 border-slate-300 hover:bg-slate-100'
          }`}
        >
          <span>Contas a Pagar</span>
          {totalDespesasPendentes > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[9px] font-black">
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
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-black border border-emerald-500 shadow-xs'
              : isDark
              ? 'bg-[#000000] text-white border border-slate-700 hover:bg-slate-900'
              : 'bg-white text-black border-2 border-slate-300 hover:bg-slate-100'
          }`}
        >
          <span>Histórico</span>
          <span className="text-[10px] font-bold opacity-80">
            ({historicoSessoes.length})
          </span>
        </button>
      </div>

      {/* 5. CORPO / CONTEÚDO DA ABA SELECIONADA */}
      <div className={`flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 ${isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-black'}`}>
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
                      <div className={`rounded-2xl p-3 flex items-center gap-2.5 animate-pulse border-2 ${
                        isDark ? 'bg-amber-500/15 border-amber-500/60 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-900'
                      }`}>
                        <AlertTriangle className={`w-5 h-5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                        <div className="text-[11px] leading-tight">
                          <strong className="block font-bold">
                            Atenção: Turno aberto há mais de 24h ({resumoSessao.duracaoTexto})
                          </strong>
                          Recomenda-se realizar o Fechamento Cego e abrir uma nova sessão.
                        </div>
                      </div>
                    )}

                    {/* KPI PRINCIPAL: SALDO ESPERADO EM DINHEIRO NA GAVETA FÍSICA */}
                    <div className={`p-4 rounded-3xl shadow-xs space-y-3 ${
                      isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className={`text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            <Banknote className="w-4 h-4 text-emerald-500" /> Saldo Esperado em Dinheiro na Gaveta
                          </span>
                          <span className={`text-2xl font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                            R$ {saldoDinheiroExibicao.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-white bg-emerald-600 border border-emerald-500 px-2.5 py-1 rounded-xl shadow-xs">
                          Físico na Gaveta
                        </span>
                      </div>

                      {/* FÓRMULA DETALHADA DA GAVETA */}
                      <div className={`grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-2 border-t text-[10px] ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <div className={`p-2 rounded-xl shadow-xs ${isDark ? 'bg-[#08131A] border border-slate-700 text-white' : 'bg-slate-50 border border-slate-200 text-black'}`}>
                          <span className={`block text-[9px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Fundo Inicial</span>
                          <span className="font-bold">
                            + R$ {(resumoSessao.fundoInicial ?? Number(sessaoAtiva.fundo_inicial || 0)).toFixed(2)}
                          </span>
                        </div>
                        <div className={`p-2 rounded-xl shadow-xs ${isDark ? 'bg-[#08131A] border border-slate-700 text-white' : 'bg-slate-50 border border-slate-200 text-black'}`}>
                          <span className={`block text-[9px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Vendas em Dinheiro</span>
                          <span className="font-bold text-emerald-500">
                            + R$ {resumoSessao.totaisPorMetodo.dinheiro.toFixed(2)}
                          </span>
                        </div>
                        <div className={`p-2 rounded-xl shadow-xs ${isDark ? 'bg-[#08131A] border border-slate-700 text-white' : 'bg-slate-50 border border-slate-200 text-black'}`}>
                          <span className={`block text-[9px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Suprimentos</span>
                          <span className="font-bold text-cyan-500">
                            + R$ {resumoSessao.totalSuprimentos.toFixed(2)}
                          </span>
                        </div>
                        <div className={`p-2 rounded-xl shadow-xs ${isDark ? 'bg-[#08131A] border border-slate-700 text-white' : 'bg-slate-50 border border-slate-200 text-black'}`}>
                          <span className={`block text-[9px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sangrias (Cofre)</span>
                          <span className="font-bold text-rose-500">
                            - R$ {resumoSessao.totalSangrias.toFixed(2)}
                          </span>
                        </div>
                        <div className={`p-2 rounded-xl shadow-xs ${isDark ? 'bg-[#08131A] border border-slate-700 text-white' : 'bg-slate-50 border border-slate-200 text-black'}`}>
                          <span className={`block text-[9px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Despesas de Gaveta</span>
                          <span className="font-bold text-amber-500">
                            - R$ {resumoSessao.totalDespesas.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* VENDAS DO TURNO POR MEIO DE PAGAMENTO */}
                    <div className={`rounded-3xl p-3.5 shadow-xs space-y-2.5 ${
                      isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                    }`}>
                      <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-black'}`}>
                          Vendas por Meio de Pagamento
                        </span>
                        <span className="text-xs font-black text-emerald-500">
                          Total: R$ {resumoSessao.faturamentoTotalVendas.toFixed(2)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Dinheiro */}
                        <div className={`p-2.5 rounded-xl space-y-1 ${isDark ? 'bg-[#08131A] border border-slate-700' : 'bg-slate-50 border border-slate-200'}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Dinheiro</span>
                            <Banknote className="w-3.5 h-3.5 text-emerald-500" />
                          </div>
                          <span className={`text-sm font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                            R$ {resumoSessao.totaisPorMetodo.dinheiro.toFixed(2)}
                          </span>
                          <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {resumoSessao.qtdVendasPorMetodo.dinheiro} vendas
                          </span>
                        </div>

                        {/* Pix */}
                        <div className={`p-2.5 rounded-xl space-y-1 ${isDark ? 'bg-[#08131A] border border-slate-700' : 'bg-slate-50 border border-slate-200'}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Pix</span>
                            <Zap className="w-3.5 h-3.5 text-cyan-500" />
                          </div>
                          <span className={`text-sm font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                            R$ {resumoSessao.totaisPorMetodo.pix.toFixed(2)}
                          </span>
                          <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {resumoSessao.qtdVendasPorMetodo.pix} vendas
                          </span>
                        </div>

                        {/* Cartão Débito */}
                        <div className={`p-2.5 rounded-xl space-y-1 ${isDark ? 'bg-[#08131A] border border-slate-700' : 'bg-slate-50 border border-slate-200'}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Débito</span>
                            <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                          </div>
                          <span className={`text-sm font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                            R$ {resumoSessao.totaisPorMetodo.cartao_debito.toFixed(2)}
                          </span>
                          <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {resumoSessao.qtdVendasPorMetodo.cartao_debito} vendas
                          </span>
                        </div>

                        {/* Cartão Crédito */}
                        <div className={`p-2.5 rounded-xl space-y-1 ${isDark ? 'bg-[#08131A] border border-slate-700' : 'bg-slate-50 border border-slate-200'}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Crédito</span>
                            <CreditCard className="w-3.5 h-3.5 text-purple-400" />
                          </div>
                          <span className={`text-sm font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                            R$ {resumoSessao.totaisPorMetodo.cartao_credito.toFixed(2)}
                          </span>
                          <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {resumoSessao.qtdVendasPorMetodo.cartao_credito} vendas
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* MOVIMENTAÇÕES DO TURNO COM FILTROS */}
                    <div className={`rounded-3xl p-3.5 shadow-xs space-y-3 ${
                      isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-black'}`}>
                          Movimentações do Turno
                        </span>
                        <span className={`text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
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
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-black border border-emerald-500 shadow-xs'
                                : isDark
                                ? 'bg-[#08131A] text-white border border-slate-700 hover:bg-slate-900'
                                : 'bg-slate-100 text-black border border-slate-300 hover:bg-slate-200'
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
                          <div className={`text-center py-6 text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            Nenhuma movimentação registrada neste filtro.
                          </div>
                        ) : (
                          movimentacoesTurnoFiltradas.map((m) => {
                            const isEntrada = m.tipo === 'VENDA' || m.tipo === 'SUPRIMENTO';
                            return (
                              <div
                                key={m.id}
                                className={`flex items-center justify-between p-2.5 rounded-xl text-xs ${
                                  isDark ? 'bg-[#08131A] border border-slate-700' : 'bg-slate-50 border border-slate-200'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                                      m.tipo === 'VENDA'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : m.tipo === 'SUPRIMENTO'
                                        ? 'bg-cyan-500/20 text-cyan-400'
                                        : m.tipo === 'SANGRIA'
                                        ? 'bg-rose-500/20 text-rose-400'
                                        : 'bg-amber-500/20 text-amber-400'
                                    }`}
                                  >
                                    {m.tipo === 'VENDA' && <ArrowUpRight className="w-3.5 h-3.5" />}
                                    {m.tipo === 'SUPRIMENTO' && <ArrowDown className="w-3.5 h-3.5" />}
                                    {m.tipo === 'SANGRIA' && <ArrowUp className="w-3.5 h-3.5" />}
                                    {m.tipo === 'DESPESA' && <Banknote className="w-3.5 h-3.5" />}
                                  </div>
                                  <div className="min-w-0">
                                    <span className={`font-bold block truncate ${isDark ? 'text-white' : 'text-black'}`}>
                                      {m.tipo === 'VENDA' && 'Venda Realizada'}
                                      {m.tipo === 'SUPRIMENTO' && 'Suprimento (Troco)'}
                                      {m.tipo === 'SANGRIA' && 'Sangria (Cofre)'}
                                      {m.tipo === 'DESPESA' && (m.descricao || 'Despesa de Gaveta')}
                                    </span>
                                    <span className={`text-[10px] block truncate ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                      {new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • {m.metodo_pagamento || 'Dinheiro'}
                                    </span>
                                  </div>
                                </div>

                                <span
                                  className={`font-black text-xs shrink-0 ${
                                    isEntrada ? 'text-emerald-500' : 'text-rose-500'
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
                      <div className={`rounded-3xl p-3.5 shadow-xs space-y-2 ${
                        isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                      }`}>
                        <span className={`text-xs font-bold uppercase tracking-wider block ${isDark ? 'text-white' : 'text-black'}`}>
                          Pedidos do Turno ({vendasDaSessao.length})
                        </span>
                        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                          {vendasDaSessao.map((p) => (
                            <div
                              key={p.id}
                              className={`flex items-center justify-between p-2 rounded-xl text-xs ${
                                isDark ? 'bg-[#08131A] border border-slate-700' : 'bg-slate-50 border border-slate-200'
                              }`}
                            >
                              <div>
                                <span className={`font-bold block ${isDark ? 'text-white' : 'text-black'}`}>
                                  Pedido #{p.numero_pedido || p.id.slice(0, 6)}
                                </span>
                                <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                  {p.cliente?.nome || p.cliente_nome_avulso || 'Consumidor Final'} • {p.criado_em ? new Date(p.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </div>
                              <span className="font-black text-emerald-500">
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
                  <div className={`rounded-3xl p-6 text-center space-y-4 shadow-xs ${
                    isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                  }`}>
                    <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center border border-rose-500/30">
                      <Lock className="w-7 h-7" />
                    </div>
                    <div className="space-y-1">
                      <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Turno de Caixa Fechado</h3>
                      <p className={`text-xs max-w-xs mx-auto ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        Abra um novo turno com fundo de troco para iniciar vendas no PDV, receber pagamentos e controlar a gaveta física.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onAbrirCaixa}
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md border border-emerald-500 flex items-center justify-center gap-2 cursor-pointer transition active:scale-98"
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
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                        filtroPeriodoFluxo === 'sessao_atual'
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-black border border-emerald-500 shadow-xs'
                          : isDark
                          ? 'bg-[#000000] text-white border border-slate-700 hover:bg-slate-900'
                          : 'bg-white text-black border-2 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span>Turno Atual</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFiltroPeriodoFluxo('hoje')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      filtroPeriodoFluxo === 'hoje'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-black border border-emerald-500 shadow-xs'
                        : isDark
                        ? 'bg-[#000000] text-white border border-slate-700 hover:bg-slate-900'
                        : 'bg-white text-black border-2 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    Hoje
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroPeriodoFluxo('mes')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      filtroPeriodoFluxo === 'mes'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-black border border-emerald-500 shadow-xs'
                        : isDark
                        ? 'bg-[#000000] text-white border border-slate-700 hover:bg-slate-900'
                        : 'bg-white text-black border-2 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    Este Mês
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroPeriodoFluxo('todos')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      filtroPeriodoFluxo === 'todos'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-black border border-emerald-500 shadow-xs'
                        : isDark
                        ? 'bg-[#000000] text-white border border-slate-700 hover:bg-slate-900'
                        : 'bg-white text-black border-2 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    Todos os Registros
                  </button>
                </div>

                {/* Mini DRE do Período */}
                <div className={`rounded-3xl p-3.5 shadow-xs grid grid-cols-3 gap-2 text-center text-xs ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                }`}>
                  <div>
                    <span className={`text-[10px] font-semibold block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Entradas</span>
                    <span className="font-black text-emerald-500 text-sm block">
                      R$ {totalReceitas.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className={`text-[10px] font-semibold block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Saídas Pagas</span>
                    <span className="font-black text-rose-500 text-sm block">
                      R$ {totalDespesasPagas.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className={`text-[10px] font-semibold block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Saldo</span>
                    <span className={`font-black text-sm block ${isDark ? 'text-white' : 'text-black'}`}>
                      R$ {lucroLiquido.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Campo de Busca */}
                <div className="relative">
                  <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                  <input
                    type="text"
                    placeholder="Buscar no fluxo por descrição ou categoria..."
                    value={termoBuscaFluxo}
                    onChange={(e) => setTermoBuscaFluxo(e.target.value)}
                    className={`w-full rounded-xl pl-9 pr-3 py-2.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 transition ${
                      isDark
                        ? 'bg-[#000000] border border-slate-700 text-white placeholder-slate-400'
                        : 'bg-white border-2 border-slate-300 text-black placeholder-slate-500'
                    }`}
                  />
                </div>

                {/* Lista de Transações */}
                <div className="space-y-2">
                  {transacoesFluxoFiltradas.length === 0 ? (
                    <div className={`text-center py-10 text-xs rounded-2xl p-4 ${
                      isDark ? 'bg-[#000000] border border-slate-700 text-slate-400' : 'bg-white border-2 border-slate-300 text-slate-600'
                    }`}>
                      Nenhum registro encontrado no período selecionado.
                    </div>
                  ) : (
                    transacoesFluxoFiltradas.map((t) => {
                      const isEntrada = t.tipo === 'ENTRADA';
                      return (
                        <div
                          key={t.id}
                          className={`rounded-2xl p-3 shadow-xs space-y-1.5 ${
                            isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className={`font-bold text-xs block truncate ${isDark ? 'text-white' : 'text-black'}`}>
                                {t.descricao}
                              </span>
                              <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                {t.categoria || 'Geral'} • {new Date(t.data_vencimento || (t as any).criado_em || (t as any).data || Date.now()).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <span
                              className={`font-black text-xs shrink-0 ${
                                isEntrada ? 'text-emerald-500' : 'text-rose-500'
                              }`}
                            >
                              {isEntrada ? '+' : '-'} R$ {Number(t.valor || 0).toFixed(2)}
                            </span>
                          </div>

                          <div className={`flex items-center justify-between pt-1 border-t text-[10px] ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold ${
                                t.status === 'pago'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              }`}
                            >
                              {t.status === 'pago' ? 'PAGO' : 'PENDENTE'}
                            </span>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onEditarTransacao(t)}
                                className={`p-1.5 rounded-lg transition cursor-pointer border ${
                                  isDark
                                    ? 'bg-[#08131A] text-white hover:bg-slate-900 border-slate-700'
                                    : 'bg-slate-100 text-black hover:bg-slate-200 border-slate-200'
                                }`}
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onConfirmarExclusao(t)}
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition cursor-pointer"
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
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-black border border-emerald-500 shadow-xs'
                          : isDark
                          ? 'bg-[#000000] text-white border border-slate-700 hover:bg-slate-900'
                          : 'bg-white text-black border-2 border-slate-300 hover:bg-slate-100'
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
                    <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                    <input
                      type="text"
                      placeholder="Buscar conta a pagar..."
                      value={termoBuscaPagar}
                      onChange={(e) => setTermoBuscaPagar(e.target.value)}
                      className={`w-full rounded-xl pl-9 pr-3 py-2.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 transition ${
                        isDark
                          ? 'bg-[#000000] border border-slate-700 text-white placeholder-slate-400'
                          : 'bg-white border-2 border-slate-300 text-black placeholder-slate-500'
                      }`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={onNovaContaPagar}
                    className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1 shrink-0 cursor-pointer border border-emerald-500 shadow-xs transition active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Nova</span>
                  </button>
                </div>

                {/* Lista de Contas a Pagar */}
                <div className="space-y-2">
                  {contasPagarFiltradas.length === 0 ? (
                    <div className={`text-center py-10 text-xs rounded-2xl p-4 ${
                      isDark ? 'bg-[#000000] border border-slate-700 text-slate-400' : 'bg-white border-2 border-slate-300 text-slate-600'
                    }`}>
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
                          className={`rounded-2xl p-3 shadow-xs space-y-2 ${
                            isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className={`font-bold text-xs block truncate ${isDark ? 'text-white' : 'text-black'}`}>
                                {tr.descricao}
                              </span>
                              <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                {tr.categoria || 'Geral'} • Vence em: {tr.data_vencimento ? new Date(tr.data_vencimento).toLocaleDateString('pt-BR') : 'Sem data'}
                              </span>
                            </div>
                            <span className="font-black text-sm text-amber-500 shrink-0">
                              R$ {Number(tr.valor || 0).toFixed(2)}
                            </span>
                          </div>

                          <div className={`flex items-center justify-between pt-1 border-t text-xs ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                tr.status === 'pago'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : isVencido
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 font-black'
                                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              }`}
                            >
                              {tr.status === 'pago' ? 'PAGA' : isVencido ? 'VENCIDA' : 'PENDENTE'}
                            </span>

                            <div className="flex items-center gap-1.5">
                              {tr.status === 'pendente' && (
                                <button
                                  type="button"
                                  onClick={() => onBaixarConta(tr)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] flex items-center gap-1 cursor-pointer border border-emerald-500 shadow-xs transition"
                                >
                                  <Check className="w-3 h-3 stroke-[3]" />
                                  <span>Pagar</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onEditarTransacao(tr)}
                                className={`p-1.5 rounded-lg transition cursor-pointer border ${
                                  isDark
                                    ? 'bg-[#08131A] text-white hover:bg-slate-900 border-slate-700'
                                    : 'bg-slate-100 text-black hover:bg-slate-200 border-slate-200'
                                }`}
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onConfirmarExclusao(tr)}
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition cursor-pointer"
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
                <div className={`rounded-3xl p-3.5 shadow-xs space-y-2 text-xs ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                }`}>
                  <span className={`font-bold block uppercase tracking-wider text-[10px] ${isDark ? 'text-white' : 'text-black'}`}>
                    Filtrar Sessões
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={`text-[10px] block mb-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Operador</label>
                      <select
                        value={filtrosHistorico.usuarioId}
                        onChange={(e) =>
                          setFiltrosHistorico((prev) => ({ ...prev, usuarioId: e.target.value }))
                        }
                        className={`w-full rounded-xl px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                          isDark
                            ? 'bg-[#08131A] border border-slate-700 text-white'
                            : 'bg-slate-50 border border-slate-300 text-black'
                        }`}
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
                      <label className={`text-[10px] block mb-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Conferência</label>
                      <select
                        value={filtrosHistorico.statusDiferenca}
                        onChange={(e) =>
                          setFiltrosHistorico((prev) => ({
                            ...prev,
                            statusDiferenca: e.target.value as any
                          }))
                        }
                        className={`w-full rounded-xl px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                          isDark
                            ? 'bg-[#08131A] border border-slate-700 text-white'
                            : 'bg-slate-50 border border-slate-300 text-black'
                        }`}
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
                    <div className={`text-center py-10 text-xs rounded-2xl p-4 ${
                      isDark ? 'bg-[#000000] border border-slate-700 text-slate-400' : 'bg-white border-2 border-slate-300 text-slate-600'
                    }`}>
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
                          className={`rounded-2xl p-3 shadow-xs space-y-2.5 ${
                            isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className={`font-bold text-xs block ${isDark ? 'text-white' : 'text-black'}`}>
                                Terminal {cx.terminal_id} • {cx.usuario_abertura?.nome_completo || 'Operador'}
                              </span>
                              <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                Aberto: {new Date(cx.aberto_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                              {cx.fechado_em && (
                                <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                  Fechado: {new Date(cx.fechado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                                </span>
                              )}
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                                !cx.fechado_em
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : !temDiferenca
                                  ? isDark ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-slate-100 text-slate-700 border border-slate-200'
                                  : isSobra
                                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
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

                          <div className={`grid grid-cols-2 gap-2 p-2 rounded-xl text-[10px] ${
                            isDark ? 'bg-[#08131A] border border-slate-700' : 'bg-slate-50 border border-slate-200'
                          }`}>
                            <div>
                              <span className={`block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Fundo Inicial:</span>
                              <strong className={isDark ? 'text-white' : 'text-slate-800'}>
                                R$ {Number(cx.fundo_inicial || 0).toFixed(2)}
                              </strong>
                            </div>
                            <div>
                              <span className={`block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Faturamento Total:</span>
                              <strong className="text-emerald-500">
                                R$ {Number(cx.faturamento_total || 0).toFixed(2)}
                              </strong>
                            </div>
                          </div>

                          <div className={`flex items-center justify-end gap-2 pt-1 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                            <button
                              type="button"
                              onClick={() => onDrillDownSessao(cx)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1 cursor-pointer border border-emerald-500 shadow-xs transition"
                            >
                              <Search className="w-3.5 h-3.5" />
                              <span>Detalhar</span>
                            </button>

                            {cx.fechado_em && (
                              <button
                                type="button"
                                onClick={() => onReimprimirFechamento(cx)}
                                className={`p-1.5 rounded-lg cursor-pointer transition border ${
                                  isDark ? 'bg-[#08131A] text-white hover:bg-slate-900 border-slate-700' : 'bg-slate-100 text-black hover:bg-slate-200 border-slate-200'
                                }`}
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
