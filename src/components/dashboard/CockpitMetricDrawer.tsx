import React, { useEffect } from 'react';
import {
  X,
  Sparkles,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingBag,
  Clock,
  Layers,
  AlertTriangle,
  CheckCircle2,
  PackagePlus,
  ArrowUpRight,
  Receipt,
  CreditCard,
  QrCode,
  Banknote,
  Send,
  Boxes,
  HelpCircle,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import {
  PayloadDashboardExecutivo,
  ProdutoEstoqueRisco,
  ItemInadimplente
} from '../../services/dashboardJevService';
import { useTheme } from '../../contexts/ThemeContext';

export type TipoMetricaCockpitDrawer =
  | 'faturamento'
  | 'pedidos'
  | 'lucro'
  | 'ticket'
  | 'inadimplencia'
  | 'saude_estoque';

export interface CockpitMetricDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tipoMetrica: TipoMetricaCockpitDrawer | null;
  payload: PayloadDashboardExecutivo | null;
  onAbrirEntradaEstoque?: (produto?: ProdutoEstoqueRisco) => void;
}

export const CockpitMetricDrawer: React.FC<CockpitMetricDrawerProps> = ({
  isOpen,
  onClose,
  tipoMetrica,
  payload,
  onAbrirEntradaEstoque
}) => {
  const { tema } = useTheme();
  const isDark = tema === 'dark';
  // Fecha com a tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Trava o scroll do body quando aberto
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

  if (!isOpen || !tipoMetrica || !payload) {
    return null;
  }

  const { decomposicoes, metricas, metasProporcionais, parecerJev, intervalo } = payload;

  // Formatação de Moeda
  const formMoeda = (val: number) =>
    `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Informações do Cabeçalho por Tipo de Métrica
  const configsCabecalho: Record<
    TipoMetricaCockpitDrawer,
    { titulo: string; subtitulo: string; icone: React.ElementType; cor: string }
  > = {
    faturamento: {
      titulo: 'Auditoria de Faturamento Bruto',
      subtitulo: 'Decomposição de vendas por canal e meios de pagamento',
      icone: DollarSign,
      cor: 'emerald'
    },
    pedidos: {
      titulo: 'Breakdown de Volume de Pedidos',
      subtitulo: 'Status de atendimento, taxas de conversão e horários de pico',
      icone: ShoppingBag,
      cor: 'emerald'
    },
    lucro: {
      titulo: 'Mini DRE Analítico (Lucro Líquido Real)',
      subtitulo: 'Apuração real: Faturamento (-) CMV (-) Taxas (-) Despesas',
      icone: Layers,
      cor: 'emerald'
    },
    ticket: {
      titulo: 'Dispersão & Ticket Médio',
      subtitulo: 'Distribuição dos valores por compra e itens por cesta',
      icone: Receipt,
      cor: 'emerald'
    },
    inadimplencia: {
      titulo: 'Auditoria de Inadimplência Fiado',
      subtitulo: 'Títulos em atraso, vencimentos e cobrança preventiva',
      icone: AlertTriangle,
      cor: 'amber'
    },
    saude_estoque: {
      titulo: 'Saúde do Estoque & Ruptura',
      subtitulo: decomposicoes.saudeEstoque.subtituloTag,
      icone: Boxes,
      cor: 'emerald'
    }
  };

  const configAtual = configsCabecalho[tipoMetrica];
  const IconeCabecalho = configAtual.icone;

  // Disparo de mensagem no WhatsApp sanitizada
  const abrirWhatsAppCobranca = (item: ItemInadimplente) => {
    if (!item.clienteTelefoneBruto) return;
    const foneLimpo = item.clienteTelefoneBruto.replace(/\D/g, '');
    const mensagem = encodeURIComponent(
      `Olá, ${item.clienteNome}! Tudo bem? Passando para lembrar sobre a pendência do seu pedido #${item.numeroPedido} no valor de ${formMoeda(item.valorDevido)}, com vencimento em ${new Date(item.dataVencimento).toLocaleDateString('pt-BR')}. Caso precise da chave Pix ou maiores detalhes, estamos à disposição!`
    );
    window.open(`https://wa.me/55${foneLimpo}?text=${mensagem}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      {/* Backdrop com Blur Escuro */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div className={`w-screen max-w-2xl border-l flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 ${
          isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-[#E2E8F0] text-[#0F172A]'
        }`}>
          
          {/* ================================================================= */}
          {/* TOPO DO DRAWER */}
          {/* ================================================================= */}
          <div className={`p-5 sm:p-6 border-b backdrop-blur-md sticky top-0 z-10 ${
            isDark ? 'border-slate-800/80 bg-slate-900/50' : 'border-[#E2E8F0] bg-white/95'
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]'
                }`}>
                  <IconeCabecalho className="w-5 h-5" />
                </div>
                <div>
                  <h2 className={`text-base sm:text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-[#0F172A]'}`}>
                    <span>{configAtual.titulo}</span>
                  </h2>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-[#64748B]'}`}>
                    {configAtual.subtitulo} • <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-[#0F172A]'}`}>{intervalo.label}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className={`p-2 rounded-xl border transition cursor-pointer ${
                  isDark
                    ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white'
                    : 'bg-[#F1F5F9] border-[#E2E8F0] hover:bg-[#E2E8F0] text-[#475569] hover:text-[#0F172A]'
                }`}
                title="Fechar Gaveta (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Parecer do Jev System 1 (Diagnóstico Rápido) */}
            <div className={`mt-4 p-3 rounded-xl flex items-start gap-2.5 border ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-[#F8FAFC] border-[#E2E8F0]'
            }`}>
              <div className={`p-1 rounded-md shrink-0 mt-0.5 ${isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#ECFDF5] text-[#047857]'}`}>
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs space-y-0.5">
                <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-slate-200' : 'text-[#0F172A]'}`}>
                  <span>Diagnóstico Jev AI</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded uppercase tracking-wider font-mono ${
                    isDark ? 'bg-slate-800 text-emerald-400' : 'bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]'
                  }`}>
                    System 1
                  </span>
                </div>
                <p className={`leading-relaxed ${isDark ? 'text-slate-400' : 'text-[#475569]'}`}>
                  {parecerJev.diagnosticoRapido} <strong className={isDark ? 'text-slate-200' : 'text-[#0F172A]'}>{parecerJev.prioridadeImediata}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* CONTEÚDO ESPECÍFICO DE CADA UMA DAS 6 MÉTRICAS */}
          {/* ================================================================= */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">

            {/* ------------------------------------------------------------- */}
            {/* 1. GAVETA: FATURAMENTO BRUTO */}
            {/* ------------------------------------------------------------- */}
            {tipoMetrica === 'faturamento' && (
              <div className="space-y-6">
                {/* Cards de Resumo */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Faturado no Período</span>
                    <div className="text-xl sm:text-2xl font-black text-white font-mono">
                      {formMoeda(decomposicoes.faturamento.totalFaturamento)}
                    </div>
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                      Meta: {formMoeda(metasProporcionais.meta_faturamento)}
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total de Vendas</span>
                    <div className="text-xl sm:text-2xl font-black text-white font-mono">
                      {metricas.pedidos}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Ticket: {formMoeda(metricas.ticket_medio)}
                    </span>
                  </div>
                </div>

                {/* Decomposição por Canal */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Faturamento por Canal de Venda</span>
                  </h3>
                  <div className="space-y-2 bg-slate-900/50 p-3.5 rounded-xl border border-slate-800/80">
                    {Object.keys(decomposicoes.faturamento.porCanal).length === 0 ? (
                      <p className="text-xs text-slate-500 py-2 text-center">Nenhuma venda faturada no período.</p>
                    ) : (
                      Object.entries(decomposicoes.faturamento.porCanal).map(([canal, d]) => (
                        <div key={canal} className="space-y-1">
                          <div className="flex justify-between text-xs font-medium">
                            <span className="text-slate-300">{canal} ({d.quantidade} vendas)</span>
                            <span className="text-white font-mono font-bold">{formMoeda(d.total)} ({d.percentual}%)</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, d.percentual)}%` }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Decomposição por Meios de Pagamento */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Decomposição por Forma de Pagamento</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {Object.entries(decomposicoes.faturamento.porFormaPagamento).map(([forma, d]) => (
                      <div key={forma} className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300 font-bold">{forma}</span>
                          <span className="text-[11px] text-emerald-400 font-mono font-bold">{d.percentual}%</span>
                        </div>
                        <div className="text-sm font-bold text-white font-mono">
                          {formMoeda(d.total)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {d.quantidade} transaç{d.quantidade === 1 ? 'ão' : 'ões'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vendas Sumarizadas Recentes */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Vendas Sumarizadas do Período ({decomposicoes.faturamento.vendasSumarizadas.length})
                  </h3>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {decomposicoes.faturamento.vendasSumarizadas.map((v) => (
                      <div
                        key={v.id}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between text-xs hover:border-slate-700 transition"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-white">#{v.numero_pedido}</span>
                            <span className="text-slate-400">• {v.clienteNome}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            <span>{new Date(v.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                            <span>• {v.canal}</span>
                            <span>• {v.formaPagamento}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-emerald-400 text-sm">{formMoeda(v.valor)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 2. GAVETA: VOLUME DE PEDIDOS */}
            {/* ------------------------------------------------------------- */}
            {tipoMetrica === 'pedidos' && (
              <div className="space-y-6">
                {/* 4 Cards de Breakdown de Status */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Total Pedidos</span>
                    <div className="text-xl font-black text-white font-mono mt-1">{decomposicoes.pedidos.totalPedidos}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-emerald-500/20">
                    <span className="text-[10px] text-emerald-400 uppercase font-bold">Concluídos</span>
                    <div className="text-xl font-black text-emerald-400 font-mono mt-1">{decomposicoes.pedidos.concluidos}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-amber-500/20">
                    <span className="text-[10px] text-amber-400 uppercase font-bold">Pendentes</span>
                    <div className="text-xl font-black text-amber-400 font-mono mt-1">{decomposicoes.pedidos.pendentes}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-rose-500/20">
                    <span className="text-[10px] text-rose-400 uppercase font-bold">Cancelados</span>
                    <div className="text-xl font-black text-rose-400 font-mono mt-1">{decomposicoes.pedidos.cancelados}</div>
                  </div>
                </div>

                {/* Taxa de Conclusão */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-300">Taxa de Conclusão Operacional</span>
                    <p className="text-[11px] text-slate-500">Pedidos concluídos sobre o volume total recebido</p>
                  </div>
                  <div className="text-xl font-black font-mono text-emerald-400">
                    {decomposicoes.pedidos.taxaConclusao}%
                  </div>
                </div>

                {/* Distribuição por Faixa Horária */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Volume & Ticket por Faixa Horária</span>
                    </h3>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Pico: {decomposicoes.pedidos.faixaPico}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {Object.values(decomposicoes.pedidos.porFaixaHoraria).map((faixa) => {
                      const pct = decomposicoes.pedidos.totalPedidos > 0
                        ? Math.round((faixa.qtd / decomposicoes.pedidos.totalPedidos) * 100)
                        : 0;
                      return (
                        <div key={faixa.label} className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-200 font-bold">{faixa.label}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-400 text-[11px]">Ticket Médio: <strong className="text-slate-200 font-mono">{formMoeda(faixa.ticketMedio)}</strong></span>
                              <span className="text-emerald-400 font-mono font-bold">{faixa.qtd} pedidos ({pct}%)</span>
                            </div>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 3. GAVETA: LUCRO LÍQUIDO REAL (MINI DRE ANALÍTICO) */}
            {/* ------------------------------------------------------------- */}
            {tipoMetrica === 'lucro' && (
              <div className="space-y-6">
                {/* Destaque do Lucro Líquido Real */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lucro Líquido Real</span>
                    <div className="text-2xl sm:text-3xl font-black text-white font-mono">
                      {formMoeda(decomposicoes.lucro.lucroLiquidoReal)}
                    </div>
                    <span className="text-xs text-slate-400">
                      Margem Líquida Real: <strong className="text-emerald-400 font-mono">{decomposicoes.lucro.margemLiquidaPercentual}%</strong>
                    </span>
                  </div>
                  <div className="text-right space-y-1">
                    <span className="text-[11px] text-slate-500">Meta do Período</span>
                    <div className="text-sm font-mono font-bold text-slate-300">
                      {formMoeda(metasProporcionais.meta_lucro_liquido)}
                    </div>
                  </div>
                </div>

                {/* Estrutura do Mini DRE */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Demonstrativo de Resultado do Período (DRE)</span>
                  </h3>

                  <div className="bg-slate-900/60 rounded-2xl border border-slate-800 divide-y divide-slate-800/80 text-xs font-mono">
                    {/* Faturamento Bruto */}
                    <div className="p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[11px]">+</span>
                        <span className="text-slate-200 font-sans font-medium">Faturamento Bruto</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-400">{formMoeda(decomposicoes.lucro.faturamentoBruto)}</div>
                        <div className="text-[10px] text-slate-500">100.0% da receita</div>
                      </div>
                    </div>

                    {/* CMV */}
                    <div className="p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-rose-500/20 text-rose-400 font-bold flex items-center justify-center text-[11px]">-</span>
                        <span className="text-slate-300 font-sans font-medium">Custo de Mercadorias Vendidas (CMV)</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-rose-400">-{formMoeda(decomposicoes.lucro.cmv)}</div>
                        <div className="text-[10px] text-slate-500">{decomposicoes.lucro.percentualCmv}% do faturamento</div>
                      </div>
                    </div>

                    {/* Taxas de Meios de Pagamento */}
                    <div className="p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-[11px]">-</span>
                        <div>
                          <span className="text-slate-300 font-sans font-medium">Taxas de Cartão / Meios de Pagamento</span>
                          {decomposicoes.lucro.taxasGateways === 0 && (
                            <span className="block text-[10px] text-slate-500 font-sans">Sem dedução (taxas não habilitadas no PDV)</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold ${decomposicoes.lucro.taxasGateways === 0 ? 'text-slate-500' : 'text-amber-400'}`}>
                          {decomposicoes.lucro.taxasGateways > 0 ? `-${formMoeda(decomposicoes.lucro.taxasGateways)}` : formMoeda(0)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {decomposicoes.lucro.taxasGateways > 0 ? `${decomposicoes.lucro.percentualTaxas}% do faturamento` : 'Isento / Não aplicável'}
                        </div>
                      </div>
                    </div>

                    {/* Custos Operacionais / Despesas */}
                    <div className="p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-rose-500/20 text-rose-400 font-bold flex items-center justify-center text-[11px]">-</span>
                        <div>
                          <span className="text-slate-300 font-sans font-medium">Despesas Fixas & Operacionais</span>
                          {decomposicoes.lucro.custosOperacionais === 0 && (
                            <span className="block text-[10px] text-slate-500 font-sans">Nenhum lançamento de despesa no período</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold ${decomposicoes.lucro.custosOperacionais === 0 ? 'text-slate-500' : 'text-rose-400'}`}>
                          {decomposicoes.lucro.custosOperacionais > 0 ? `-${formMoeda(decomposicoes.lucro.custosOperacionais)}` : formMoeda(0)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {decomposicoes.lucro.custosOperacionais > 0 ? `${decomposicoes.lucro.percentualDespesas}% do faturamento` : '0 lançamentos no caixa'}
                        </div>
                      </div>
                    </div>

                    {/* Resultado Final */}
                    <div className="p-4 bg-emerald-500/5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-[11px]">=</span>
                        <span className="text-white font-sans font-bold text-sm">Lucro Líquido Real</span>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-emerald-400 text-base">{formMoeda(decomposicoes.lucro.lucroLiquidoReal)}</div>
                        <div className="text-[11px] text-emerald-400/90 font-bold">Margem Líquida: {decomposicoes.lucro.margemLiquidaPercentual}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 4. GAVETA: TICKET MÉDIO */}
            {/* ------------------------------------------------------------- */}
            {tipoMetrica === 'ticket' && (
              <div className="space-y-6">
                {/* 3 Métricas Principais de Dispersão */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Menor Venda</span>
                    <div className="text-base font-black text-white font-mono mt-1">{formMoeda(decomposicoes.ticket.menorVenda)}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-emerald-500/20">
                    <span className="text-[10px] text-emerald-400 uppercase font-bold">Ticket Médio</span>
                    <div className="text-base font-black text-emerald-400 font-mono mt-1">{formMoeda(decomposicoes.ticket.ticketMedio)}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Maior Venda</span>
                    <div className="text-base font-black text-white font-mono mt-1">{formMoeda(decomposicoes.ticket.maiorVenda)}</div>
                  </div>
                </div>

                {/* Correlação com Quantidade de Itens por Cesta */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-300">Itens por Cesta de Compras</span>
                    <p className="text-[11px] text-slate-500">
                      Total de {decomposicoes.ticket.quantidadeItensTotal} unidades vendidas em {metricas.pedidos} pedidos
                    </p>
                  </div>
                  <div className="text-xl font-black font-mono text-emerald-400">
                    {decomposicoes.ticket.mediaItensPorPedido} un/cesta
                  </div>
                </div>

                {/* Gráfico de Dispersão por Faixa de Compra */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Dispersão de Vendas por Faixa de Valor
                  </h3>
                  <div className="space-y-2.5">
                    {decomposicoes.ticket.dispersaoCompras.map((faixa) => (
                      <div key={faixa.faixa} className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300 font-medium">{faixa.faixa}</span>
                          <span className="font-mono font-bold text-white">
                            {faixa.quantidade} vendas ({faixa.percentual}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${faixa.percentual}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 5. GAVETA: INADIMPLÊNCIA FIADO */}
            {/* ------------------------------------------------------------- */}
            {tipoMetrica === 'inadimplencia' && (
              <div className="space-y-6">
                {/* Resumo de Inadimplência */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-rose-500/20">
                    <span className="text-[10px] text-rose-400 uppercase font-bold">Total em Atraso</span>
                    <div className="text-base font-black text-rose-400 font-mono mt-1">
                      {formMoeda(decomposicoes.inadimplencia.totalInadimplente)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Total a Receber</span>
                    <div className="text-base font-black text-white font-mono mt-1">
                      {formMoeda(decomposicoes.inadimplencia.totalReceber)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Taxa Inadimplência</span>
                    <div className="text-base font-black font-mono mt-1 text-amber-400">
                      {decomposicoes.inadimplencia.taxaInadimplencia}%
                    </div>
                  </div>
                </div>

                {/* Caso 0.0%: Status de Conformidade Total */}
                {decomposicoes.inadimplencia.itensAtrasados.length === 0 || decomposicoes.inadimplencia.taxaInadimplencia === 0 ? (
                  <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-white">Nenhum título em aberto ou vencido no período</h4>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Excelente! A sua carteira de clientes fiado está 100% conciliada e em conformidade de crédito.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Títulos & Parcelas em Atraso ({decomposicoes.inadimplencia.itensAtrasados.length})
                    </h3>

                    <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                      {decomposicoes.inadimplencia.itensAtrasados.map((it) => (
                        <div
                          key={it.pedidoId}
                          className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between gap-3"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-xs truncate">{it.clienteNome}</span>
                              <span className="text-[10px] font-mono text-slate-400 font-bold">#{it.numeroPedido}</span>
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2">
                              <span>Contato: <strong className="text-slate-300">{it.clienteContatoSeguro}</strong></span>
                              <span>•</span>
                              <span className="text-rose-400 font-bold">{it.diasAtraso} dias de atraso</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <div className="font-mono font-bold text-rose-400 text-sm">{formMoeda(it.valorDevido)}</div>
                              <div className="text-[10px] text-slate-500">
                                Venc: {new Date(it.dataVencimento).toLocaleDateString('pt-BR')}
                              </div>
                            </div>

                            {it.clienteTelefoneBruto && (
                              <button
                                type="button"
                                onClick={() => abrirWhatsAppCobranca(it)}
                                className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 transition cursor-pointer"
                                title="Enviar lembrete amigável no WhatsApp"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 6. GAVETA: SAÚDE DO ESTOQUE (HÍBRIDA FASE 1 / FASE 2) */}
            {/* ------------------------------------------------------------- */}
            {tipoMetrica === 'saude_estoque' && (
              <div className="space-y-6">
                {/* Banner Contextual da Fase (Cold Start vs Maturidade Curva ABC) */}
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                    <Boxes className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        {decomposicoes.saudeEstoque.fase === 'fase2'
                          ? 'Fase 2: Maturidade Operacional (Curva ABC)'
                          : 'Fase 1: Cold Start / Implantação'}
                      </h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                        {decomposicoes.saudeEstoque.subtituloTag}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {decomposicoes.saudeEstoque.fase === 'fase2'
                        ? 'Com mais de 30 dias de operação, o velocímetro protege exclusivamente os produtos da Classe A (responsáveis por 80% da sua receita), evitando perda de faturamento por desabastecimento.'
                        : 'Histórico inicial de vendas (< 30 dias). O indicador monitora todos os produtos cadastrados com estoque zerado ou abaixo do estoque mínimo de alerta.'}
                    </p>
                  </div>
                </div>

                {/* Métricas do Estoque */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-rose-500/20">
                    <span className="text-[10px] text-rose-400 uppercase font-bold">Itens em Risco</span>
                    <div className="text-lg font-black text-rose-400 font-mono mt-1">
                      {decomposicoes.saudeEstoque.totalItensEmRisco}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Monitorados</span>
                    <div className="text-lg font-black text-white font-mono mt-1">
                      {decomposicoes.saudeEstoque.totalItensMonitorados}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Índice Ruptura</span>
                    <div className="text-lg font-black font-mono mt-1 text-amber-400">
                      {decomposicoes.saudeEstoque.indiceRuptura}%
                    </div>
                  </div>
                </div>

                {/* Se Fase 2: Exibe Distribuição Gráfica da Curva ABC */}
                {decomposicoes.saudeEstoque.fase === 'fase2' && decomposicoes.saudeEstoque.curvaAbc && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Distribuição do Catálogo (Curva ABC)
                    </h3>
                    <div className="grid grid-cols-3 gap-2.5">
                      {/* Classe A */}
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                        <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                          <span>Classe A</span>
                          <span>80% da receita</span>
                        </div>
                        <div className="text-base font-black text-white font-mono">
                          {decomposicoes.saudeEstoque.curvaAbc.classeA.qtdProdutos} itens
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {formMoeda(decomposicoes.saudeEstoque.curvaAbc.classeA.receitaTotal)}
                        </div>
                      </div>

                      {/* Classe B */}
                      <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 space-y-1">
                        <div className="flex items-center justify-between text-xs font-bold text-cyan-400">
                          <span>Classe B</span>
                          <span>15% da receita</span>
                        </div>
                        <div className="text-base font-black text-white font-mono">
                          {decomposicoes.saudeEstoque.curvaAbc.classeB.qtdProdutos} itens
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {formMoeda(decomposicoes.saudeEstoque.curvaAbc.classeB.receitaTotal)}
                        </div>
                      </div>

                      {/* Classe C */}
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                          <span>Classe C</span>
                          <span>5% da receita</span>
                        </div>
                        <div className="text-base font-black text-white font-mono">
                          {decomposicoes.saudeEstoque.curvaAbc.classeC.qtdProdutos} itens
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {formMoeda(decomposicoes.saudeEstoque.curvaAbc.classeC.receitaTotal)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lista de Produtos em Risco / Ruptura com Ação de Reposição */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      {decomposicoes.saudeEstoque.fase === 'fase2'
                        ? 'Produtos Classe A em Risco de Ruptura'
                        : 'Produtos Abaixo do Estoque Mínimo ou Zerados'} ({decomposicoes.saudeEstoque.produtosEmRisco.length})
                    </h3>

                    {onAbrirEntradaEstoque && (
                      <button
                        type="button"
                        onClick={() => onAbrirEntradaEstoque()}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <PackagePlus className="w-3.5 h-3.5" />
                        <span>+ Entrada de Estoque</span>
                      </button>
                    )}
                  </div>

                  {decomposicoes.saudeEstoque.produtosEmRisco.length === 0 ? (
                    <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-1">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                      <h4 className="text-sm font-bold text-white">Nenhum produto em risco de desabastecimento!</h4>
                      <p className="text-xs text-slate-400">
                        {decomposicoes.saudeEstoque.fase === 'fase2'
                          ? 'Todos os produtos da Classe A estão com estoque seguro acima do mínimo.'
                          : 'Todos os produtos ativos estão com níveis saudáveis de estoque.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {decomposicoes.saudeEstoque.produtosEmRisco.map((prod) => (
                        <div
                          key={prod.id}
                          className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {prod.fotoUrl ? (
                              <img
                                src={prod.fotoUrl}
                                alt={prod.nome}
                                className="w-10 h-10 rounded-lg object-cover bg-slate-800 shrink-0 border border-slate-700"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 shrink-0 border border-slate-700">
                                <Boxes className="w-5 h-5" />
                              </div>
                            )}

                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-xs truncate">{prod.nome}</span>
                                {prod.classeAbc && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono font-bold">
                                    Classe {prod.classeAbc}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                <span>Estoque Atual: <strong className={prod.estoqueAtual <= 0 ? 'text-rose-400 font-mono' : 'text-amber-400 font-mono'}>{prod.estoqueAtual} un</strong></span>
                                <span>• Mínimo: {prod.estoqueMinimo} un</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                prod.status === 'zerado'
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              }`}
                            >
                              {prod.status === 'zerado' ? 'Zerado' : 'Crítico'}
                            </span>

                            {onAbrirEntradaEstoque && (
                              <button
                                type="button"
                                onClick={() => onAbrirEntradaEstoque(prod)}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                                title="Repor Estoque deste produto"
                              >
                                <span>+ Repor</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* ================================================================= */}
          {/* RODAPÉ DO DRAWER */}
          {/* ================================================================= */}
          <div className="p-4 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
            <span>Pressione <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">Esc</kbd> para fechar</span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition cursor-pointer"
            >
              Fechar
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
