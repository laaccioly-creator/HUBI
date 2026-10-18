import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Lock,
  Unlock,
  Repeat,
  X,
  ArrowLeft,
  Printer,
  Copy,
  Share2,
  CheckCircle2,
  Banknote,
  Zap,
  CreditCard,
  ArrowDown,
  ArrowUp,
  Info,
  Clock,
  Calendar,
  Filter,
  FileText,
  Layers,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ChevronRight,
  HelpCircle,
  AlertCircle,
  ShoppingCart,
  FileSpreadsheet,
  Pencil,
  Trash2,
  ShieldCheck,
  AlertOctagon,
  Sparkles
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePermissions } from '../hooks/usePermissions';
import { cashAuditJevService, AuditoriaCaixaJev } from '../services/cashAuditJevService';

import {
  TransacaoFinanceira,
  Caixa,
  CaixaMovimentacao,
  Pedido,
  UsuarioLoja,
  SessaoCaixa,
  MovimentacaoCaixa,
  ResumoSessaoCaixa,
  DeclaradoPorMetodo
} from '../types';
import { PrintService } from '../services/printService';
import { caixaService } from '../services/caixaService';
import { financeExportService } from '../services/financeExportService';
import { FinancasMobile } from './FinancasMobile';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { obterDataOperacao, obterDataOperacaoISO, obterDataOperacaoYMD, formatarDataLocalYMD } from '../utils/dataOperacao';
import { formatarMoeda } from '../utils/formatters';

// Componente de Auditoria de Fechamento de Caixa com Jev TypeSafe
const CardAuditoriaFechamentoCaixa: React.FC<{
  diferencaDinheiro: number;
  totalEntradas: number;
  observacaoFechamento?: string | null;
  usuarioNome?: string;
}> = ({ diferencaDinheiro, totalEntradas, observacaoFechamento, usuarioNome }) => {
  const [auditoria, setAuditoria] = useState<AuditoriaCaixaJev | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    cashAuditJevService
      .auditarFechamento({ diferencaDinheiro, totalEntradas, observacaoFechamento, usuarioNome })
      .then((res) => {
        if (ativo) setAuditoria(res);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [diferencaDinheiro, totalEntradas, observacaoFechamento, usuarioNome]);

  if (carregando) {
    return (
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-2 text-xs text-slate-500 animate-pulse">
        <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-spin" />
        <span>Auditoria de fechamento via IA TypeSafe...</span>
      </div>
    );
  }

  if (!auditoria) return null;

  return (
    <div
      className={`p-3.5 rounded-2xl border text-xs flex items-start gap-3 transition ${
        auditoria.badgeCor === 'emerald'
          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
          : auditoria.badgeCor === 'amber'
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-rose-50 border-rose-200 text-rose-900'
      }`}
    >
      {auditoria.badgeCor === 'emerald' && <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />}
      {auditoria.badgeCor === 'amber' && <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
      {auditoria.badgeCor === 'rose' && <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}

      <div className="space-y-1 flex-1">
        <div className="flex items-center justify-between">
          <span className="font-extrabold text-xs uppercase tracking-wide">
            {auditoria.nivel === 'conciliado'
              ? 'Conferência de Caixa Conciliada'
              : auditoria.nivel === 'atencao'
              ? 'Divergência Tolerável • Atenção'
              : 'Requer Auditoria da Gerência'}
          </span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-black/5 text-slate-700 flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-amber-500" /> Jev Audit
          </span>
        </div>
        <p className="text-xs text-slate-700 leading-relaxed font-medium">
          {auditoria.parecer}
        </p>
      </div>
    </div>
  );
};

export const FinancasCaixa: React.FC = () => {
  const { loja, usuario } = useAuth();
  const { tema } = useTheme();
  const isDark = tema === 'dark';
  const permissions = usePermissions();
  const navigate = useNavigate();
  const { mostrarSucesso, mostrarErro, mostrarAviso } = useFeedbackModal();

  useEffect(() => {
    if (!permissions.podeAcessarFinancas) {
      navigate('/pos');
    }
  }, [permissions.podeAcessarFinancas, navigate]);

  const [transacoes, setTransacoes] = useState<TransacaoFinanceira[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [movimentacoesCaixaLoja, setMovimentacoesCaixaLoja] = useState<MovimentacaoCaixa[]>([]);
  const [filtroPeriodoFluxo, setFiltroPeriodoFluxo] = useState<'sessao_atual' | 'hoje' | 'mes' | 'todos'>('sessao_atual');
  const [carregando, setCarregando] = useState<boolean>(true);
  const [abaAtiva, setAbaAtiva] = useState<'caixa_atual' | 'fluxo' | 'pagar' | 'historico_caixas'>('caixa_atual');
  const [modalDetalhesMetrica, setModalDetalhesMetrica] = useState<'entradas' | 'saidas' | 'pagar' | 'lucro' | null>(null);

  // ==========================================
  // ESTADO DO MÓDULO DE SESSÕES TRANSACIONAIS
  // ==========================================
  const [terminalId, setTerminalId] = useState<string>(() => caixaService.obterTerminalId());
  const [sessaoAtiva, setSessaoAtiva] = useState<SessaoCaixa | null>(null);
  const [resumoSessao, setResumoSessao] = useState<ResumoSessaoCaixa | null>(null);
  const [historicoSessoes, setHistoricoSessoes] = useState<SessaoCaixa[]>([]);
  const [usuariosLoja, setUsuariosLoja] = useState<UsuarioLoja[]>([]);
  const [filtrosHistorico, setFiltrosHistorico] = useState<{
    dataInicio: string;
    dataFim: string;
    usuarioId: string;
    statusDiferenca: 'todos' | 'com_diferenca' | 'exato';
  }>({
    dataInicio: '',
    dataFim: '',
    usuarioId: 'todos',
    statusDiferenca: 'todos'
  });

  // Drill-down de sessão passada
  const [sessaoDrillDown, setSessaoDrillDown] = useState<SessaoCaixa | null>(null);
  const [resumoDrillDown, setResumoDrillDown] = useState<ResumoSessaoCaixa | null>(null);
  const [modalDrillDown, setModalDrillDown] = useState<boolean>(false);
  const [carregandoDrillDown, setCarregandoDrillDown] = useState<boolean>(false);

  // Abertura de Sessão de Caixa
  const [modalAberturaCaixa, setModalAberturaCaixa] = useState<boolean>(false);
  const [fundoTroco, setFundoTroco] = useState<string>('100.00');
  const [abrindoCaixa, setAbrindoCaixa] = useState<boolean>(false);

  // Movimentações: Suprimento, Sangria e Despesa Rápida
  const [modalSuprimento, setModalSuprimento] = useState<boolean>(false);
  const [valorSuprimento, setValorSuprimento] = useState<string>('');
  const [motivoSuprimento, setMotivoSuprimento] = useState<string>('');
  const [processandoSuprimento, setProcessandoSuprimento] = useState<boolean>(false);

  const [modalSangria, setModalSangria] = useState<boolean>(false);
  const [valorSangria, setValorSangria] = useState<string>('');
  const [motivoSangria, setMotivoSangria] = useState<string>('');
  const [processandoSangria, setProcessandoSangria] = useState<boolean>(false);

  const [modalDespesaRapida, setModalDespesaRapida] = useState<boolean>(false);
  const [valorDespesaRapida, setValorDespesaRapida] = useState<string>('');
  const [descricaoDespesaRapida, setDescricaoDespesaRapida] = useState<string>('');
  const [categoriaDespesaRapida, setCategoriaDespesaRapida] = useState<string>('Despesas Operacionais');
  const [processandoDespesaRapida, setProcessandoDespesaRapida] = useState<boolean>(false);

  // Fechamento Cego de Caixa
  const [modalFechamentoCego, setModalFechamentoCego] = useState<boolean>(false);
  const [contagemDinheiro, setContagemDinheiro] = useState<string>('');
  const [contagemPix, setContagemPix] = useState<string>('');
  const [contagemCredito, setContagemCredito] = useState<string>('');
  const [contagemDebito, setContagemDebito] = useState<string>('');
  const [contagemOutros, setContagemOutros] = useState<string>('');
  const [observacaoFechamento, setObservacaoFechamento] = useState<string>('');
  const [processandoFechamento, setProcessandoFechamento] = useState<boolean>(false);

  // Pré-preenche os meios digitais com os valores apurados pelo sistema no turno mantendo o dinheiro físico vazio
  useEffect(() => {
    if (modalFechamentoCego && resumoSessao) {
      const pixVal = Number(resumoSessao.totaisPorMetodo?.pix || 0);
      const debitoVal = Number(resumoSessao.totaisPorMetodo?.cartao_debito || 0);
      const creditoVal = Number(resumoSessao.totaisPorMetodo?.cartao_credito || 0);
      const outrosVal = Number(resumoSessao.totaisPorMetodo?.outros || 0);

      setContagemPix(pixVal > 0 ? pixVal.toFixed(2) : '0.00');
      setContagemDebito(debitoVal > 0 ? debitoVal.toFixed(2) : '0.00');
      setContagemCredito(creditoVal > 0 ? creditoVal.toFixed(2) : '0.00');
      setContagemOutros(outrosVal > 0 ? outrosVal.toFixed(2) : '0.00');
      setContagemDinheiro('');
    }
  }, [modalFechamentoCego, resumoSessao]);

  // Relatório de Fechamento de Caixa
  const [modalRelatorioFechamento, setModalRelatorioFechamento] = useState<boolean>(false);
  const [relatorioFechamentoTexto, setRelatorioFechamentoTexto] = useState<string>('');
  const [relatorioFechamentoResumo, setRelatorioFechamentoResumo] = useState<ResumoSessaoCaixa | null>(null);
  const [copiadoRelatorio, setCopiadoRelatorio] = useState<boolean>(false);

  // Relatórios Gerenciais Consolidados
  const [modalRelatorioConsolidado, setModalRelatorioConsolidado] = useState<boolean>(false);
  const [modalRelatorioSangriasDespesas, setModalRelatorioSangriasDespesas] = useState<boolean>(false);
  const [periodoRelatorioInicio, setPeriodoRelatorioInicio] = useState<string>(obterDataOperacaoYMD());
  const [periodoRelatorioFim, setPeriodoRelatorioFim] = useState<string>(obterDataOperacaoYMD());

  // Modais de Operação Geral (DRE / Nova Despesa Plano de Contas / Contas a Pagar)
  const [modalNovaDespesa, setModalNovaDespesa] = useState<boolean>(false);
  const [statusLancamento, setStatusLancamento] = useState<'pago' | 'pendente'>('pago');
  const [transacaoEditando, setTransacaoEditando] = useState<any | null>(null);
  const [descricao, setDescricao] = useState<string>('');
  const [categoria, setCategoria] = useState<string>('Fornecedor');
  const [valor, setValor] = useState<string>('');
  const [dataVencimento, setDataVencimento] = useState<string>(obterDataOperacaoYMD());
  const [ehRecorrente, setEhRecorrente] = useState<boolean>(false);
  const [formaPagamentoDespesa, setFormaPagamentoDespesa] = useState<string>('dinheiro');
  const [salvandoDespesa, setSalvandoDespesa] = useState<boolean>(false);

  // Modais de Exclusão e Baixa de Contas a Pagar
  const [modalConfirmarExclusao, setModalConfirmarExclusao] = useState<{
    aberta: boolean;
    transacao: any | null;
    processando: boolean;
  }>({ aberta: false, transacao: null, processando: false });

  const [modalBaixarConta, setModalBaixarConta] = useState<{
    aberta: boolean;
    transacao: any | null;
    formaPagamento: string;
    dataPagamento: string;
    processando: boolean;
  }>({ aberta: false, transacao: null, formaPagamento: 'dinheiro', dataPagamento: obterDataOperacaoYMD(), processando: false });

  // Fallback de compatibilidade com estrutura legada
  const [caixaAberto, setCaixaAberto] = useState<Caixa | null>(null);
  const [movimentacoesCaixa, setMovimentacoesCaixa] = useState<CaixaMovimentacao[]>([]);
  const [historicoCaixas, setHistoricoCaixas] = useState<Caixa[]>([]);
  const [relatorioDados, setRelatorioDados] = useState<any | null>(null);

  // Carregamento de dados com modelo de Sessões Transacionais
  const carregarFinanceiro = async () => {
    if (!loja?.id) return;
    try {
      setCarregando(true);

      // 1. Carregar transações manuais (DRE / Fluxo Geral)
      const { data: trData } = await supabase
        .from('transacoes_financeiras')
        .select('*, fornecedor:fornecedores(*)')
        .eq('loja_id', loja.id)
        .order('data_vencimento', { ascending: false });

      if (trData) setTransacoes(trData);

      // 2. Carregar pedidos e pagamentos para unificação do fluxo geral
      const { data: pedData } = await supabase
        .from('pedidos')
        .select('*, cliente:clientes(*), vendedor:usuarios_loja!pedidos_vendedor_id_fkey(*), pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*))')
        .eq('loja_id', loja.id)
        .order('criado_em', { ascending: false });

      if (pedData) setPedidos(pedData as unknown as Pedido[]);

      // 2.5 Carregar movimentações de caixa da loja para indexação precisa de sessão
      try {
        const { data: movsData } = await supabase
          .from('movimentacoes_caixa')
          .select('*')
          .eq('loja_id', loja.id)
          .order('criado_em', { ascending: false });

        if (movsData) setMovimentacoesCaixaLoja(movsData as MovimentacaoCaixa[]);
      } catch (errMovs) {
        console.warn('Aviso ao consultar movimentações de caixa:', errMovs);
      }

      // 3. Carregar Sessão Ativa de Caixa do Terminal (Ciclo Transacional Independente de Meia-Noite)
      try {
        const sessao = await caixaService.obterSessaoAtiva(loja.id, terminalId, usuario?.id);
        setSessaoAtiva(sessao);
        if (sessao) {
          if (sessao.terminal_id && sessao.terminal_id !== terminalId) {
            setTerminalId(sessao.terminal_id);
          }
          const res = await caixaService.obterResumoSessao(sessao.id);
          setResumoSessao(res);
        } else {
          setResumoSessao(null);
        }
      } catch (errSessao) {
        console.warn('Aviso ao consultar sessão ativa de caixa:', errSessao);
      }

      // 4. Carregar Histórico de Sessões de Caixa (Auditoria e Drill-Down)
      try {
        const hist = await caixaService.listarHistoricoSessoes(loja.id, {
          terminalId: 'todos',
          dataInicio: filtrosHistorico.dataInicio || undefined,
          dataFim: filtrosHistorico.dataFim || undefined,
          usuarioId: filtrosHistorico.usuarioId !== 'todos' ? filtrosHistorico.usuarioId : undefined,
          statusDiferenca: filtrosHistorico.statusDiferenca
        });
        setHistoricoSessoes(hist);
      } catch (errHist) {
        console.warn('Aviso ao consultar histórico de sessões:', errHist);
      }

      // 5. Carregar usuários da loja para filtro
      try {
        const { data: usersData } = await supabase
          .from('usuarios_loja')
          .select('*')
          .eq('loja_id', loja.id)
          .order('nome_completo', { ascending: true });
        if (usersData) setUsuariosLoja(usersData);
      } catch (e) {}

    } catch (err) {
      console.error('Erro ao carregar dados financeiros:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarFinanceiro();
  }, [loja?.id, terminalId, filtrosHistorico.dataInicio, filtrosHistorico.dataFim, filtrosHistorico.usuarioId, filtrosHistorico.statusDiferenca]);

  // Abrir Modal de Nova Despesa (Paga)
  const abrirModalNovaDespesa = () => {
    setTransacaoEditando(null);
    setStatusLancamento('pago');
    setDescricao('');
    setValor('');
    setCategoria('Fornecedor');
    setDataVencimento(obterDataOperacaoYMD());
    setEhRecorrente(false);
    setFormaPagamentoDespesa('dinheiro');
    setModalNovaDespesa(true);
  };

  // Abrir Modal de Nova Conta a Pagar (Pendente)
  const abrirModalNovaContaPagar = () => {
    setTransacaoEditando(null);
    setStatusLancamento('pendente');
    setDescricao('');
    setValor('');
    setCategoria('Fornecedor');
    setDataVencimento(obterDataOperacaoYMD());
    setEhRecorrente(false);
    setFormaPagamentoDespesa('transferencia');
    setModalNovaDespesa(true);
  };

  // Abrir Modal para Edição de Lançamento Financeiro Manual
  const abrirModalEditarTransacao = (tr: any) => {
    setTransacaoEditando(tr);
    const ehPendente = tr.status === 'pendente';
    setStatusLancamento(ehPendente ? 'pendente' : 'pago');
    const descLimpa = (tr.descricao || '').replace(/\s*\(entrada manual\)/gi, '').trim();
    setDescricao(descLimpa);
    setValor(tr.valor != null ? String(tr.valor) : '');
    setCategoria(tr.categoria || 'Fornecedor');
    const rawData = tr.dataVencimento || tr.data || tr.criado_em;
    setDataVencimento(rawData ? formatarDataLocalYMD(rawData) : obterDataOperacaoYMD());
    setEhRecorrente(Boolean(tr.ehRecorrente));
    setFormaPagamentoDespesa(tr.formaPagamento || (ehPendente ? 'transferencia' : 'dinheiro'));
    setModalNovaDespesa(true);
  };

  // Utilitário para gerar data ISO operacional compatível com a data YMD selecionada
  const gerarDataIsoOperacional = (ymd: string) => {
    if (!ymd) return obterDataOperacaoISO();
    const opYmd = obterDataOperacaoYMD();
    if (ymd === opYmd) {
      return obterDataOperacaoISO();
    }
    const dOp = obterDataOperacao();
    const hora = String(dOp.getHours()).padStart(2, '0');
    const min = String(dOp.getMinutes()).padStart(2, '0');
    const sec = String(dOp.getSeconds()).padStart(2, '0');
    const d = new Date(`${ymd}T${hora}:${min}:${sec}`);
    return isNaN(d.getTime()) ? `${ymd}T12:00:00.000Z` : d.toISOString();
  };

  // 1. Cadastrar / Editar Despesa ou Conta a Pagar Manual no DRE / Fluxo Geral
  const handleSalvarDespesaOuContaPagar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.ehAdmin) {
      mostrarAviso('Permissão restrita. Apenas usuários Proprietários (Owner) ou Administradores (Admin) podem lançar ou alterar despesas e contas a pagar.', 'Acesso Restrito');
      return;
    }
    if (!loja?.id || !descricao.trim() || !valor || salvandoDespesa) return;

    try {
      setSalvandoDespesa(true);
      const valNum = Number(valor);
      if (isNaN(valNum) || valNum <= 0) {
        mostrarAviso('Informe um valor numérico válido maior que zero.');
        return;
      }

      const ehPendente = statusLancamento === 'pendente';

      if (transacaoEditando && transacaoEditando.id) {
        // MODO ATUALIZAÇÃO (UPDATE)
        const updatePayload: any = {
          tipo: 'SAIDA',
          categoria,
          descricao: descricao.trim(),
          valor: valNum,
          data_vencimento: dataVencimento,
          status: ehPendente ? 'pendente' : 'pago',
          eh_recorrente: ehRecorrente,
          frequencia_recorrencia: ehRecorrente ? 'mensal' : null,
          forma_pagamento: formaPagamentoDespesa || null
        };

        if (!ehPendente) {
          if (!transacaoEditando.data_pagamento || formatarDataLocalYMD(transacaoEditando.data_vencimento) !== dataVencimento) {
            updatePayload.data_pagamento = gerarDataIsoOperacional(dataVencimento);
          }
        }

        const { data, error } = await supabase
          .from('transacoes_financeiras')
          .update(updatePayload)
          .eq('id', transacaoEditando.id)
          .select('*, fornecedor:fornecedores(*)')
          .single();

        if (error) throw error;
        if (data) {
          setTransacoes(prev => prev.map(item => item.id === data.id ? data : item));
        }

        mostrarSucesso(ehPendente ? 'Conta a pagar atualizada com sucesso!' : 'Despesa atualizada com sucesso!');
      } else {
        // MODO INSERÇÃO (NOVO REGISTRO)
        const insertPayload: any = {
          loja_id: loja.id,
          tipo: 'SAIDA',
          categoria,
          descricao: descricao.trim(),
          valor: valNum,
          data_vencimento: dataVencimento,
          status: ehPendente ? 'pendente' : 'pago',
          eh_recorrente: ehRecorrente,
          frequencia_recorrencia: ehRecorrente ? 'mensal' : null,
          forma_pagamento: formaPagamentoDespesa || null
        };

        if (!ehPendente) {
          insertPayload.data_pagamento = gerarDataIsoOperacional(dataVencimento);
        }

        const { data, error } = await supabase
          .from('transacoes_financeiras')
          .insert([insertPayload])
          .select('*, fornecedor:fornecedores(*)')
          .single();

        if (error) throw error;
        if (data) setTransacoes(prev => [data, ...prev]);

        // Se paga em dinheiro físico na gaveta e houver sessão de caixa aberta, registrar como despesa da gaveta
        if (!ehPendente && formaPagamentoDespesa === 'dinheiro' && sessaoAtiva && usuario?.id) {
          try {
            const mov = await caixaService.registrarMovimentacao({
              lojaId: loja.id,
              sessaoId: sessaoAtiva.id,
              tipo: 'DESPESA',
              metodoPagamento: 'DINHEIRO',
              valor: valNum,
              descricao: `Despesa Gaveta: ${descricao.trim()} (${categoria})`,
              usuarioId: usuario.id
            });
            if (mov) setMovimentacoesCaixaLoja(prev => [mov, ...prev]);
            const res = await caixaService.obterResumoSessao(sessaoAtiva.id);
            setResumoSessao(res);
          } catch (errMov) {
            console.warn('Aviso ao registrar despesa na sessão de caixa:', errMov);
          }
        }

        mostrarSucesso(ehPendente ? 'Conta a pagar cadastrada com sucesso!' : 'Despesa lançada com sucesso!');
      }

      setModalNovaDespesa(false);
      setTransacaoEditando(null);
      setDescricao('');
      setValor('');
    } catch (err: any) {
      mostrarErro(err.message || 'Tente novamente.', 'Erro ao salvar lançamento financeiro');
    } finally {
      setSalvandoDespesa(false);
    }
  };

  // Excluir Lançamento Financeiro Manual
  const handleExcluirTransacao = async () => {
    if (!permissions.ehAdmin) {
      mostrarAviso('Permissão restrita. Apenas administradores podem excluir lançamentos financeiros.', 'Acesso Restrito');
      return;
    }
    const tr = modalConfirmarExclusao.transacao;
    if (!tr?.id) return;

    try {
      setModalConfirmarExclusao(prev => ({ ...prev, processando: true }));
      const { error } = await supabase
        .from('transacoes_financeiras')
        .delete()
        .eq('id', tr.id);

      if (error) throw error;

      setTransacoes(prev => prev.filter(item => item.id !== tr.id));
      setModalConfirmarExclusao({ aberta: false, transacao: null, processando: false });
      mostrarSucesso('Lançamento financeiro excluído com sucesso!');
    } catch (err: any) {
      mostrarErro(err.message || 'Tente novamente.', 'Erro ao excluir');
      setModalConfirmarExclusao(prev => ({ ...prev, processando: false }));
    }
  };

  // Dar Baixa / Liquidar Conta a Pagar
  const handleLiquidarContaPagar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.ehAdmin) {
      mostrarAviso('Permissão restrita. Apenas administradores podem dar baixa em contas a pagar.', 'Acesso Restrito');
      return;
    }
    const tr = modalBaixarConta.transacao;
    if (!tr?.id) return;

    try {
      setModalBaixarConta(prev => ({ ...prev, processando: true }));
      const forma = modalBaixarConta.formaPagamento || 'dinheiro';
      const dataIso = modalBaixarConta.dataPagamento
        ? gerarDataIsoOperacional(modalBaixarConta.dataPagamento)
        : obterDataOperacaoISO();

      const { data, error } = await supabase
        .from('transacoes_financeiras')
        .update({
          status: 'pago',
          forma_pagamento: forma,
          data_pagamento: dataIso
        })
        .eq('id', tr.id)
        .select('*, fornecedor:fornecedores(*)')
        .single();

      if (error) throw error;

      if (data) {
        setTransacoes(prev => prev.map(item => item.id === data.id ? data : item));
      }

      // Se pago em dinheiro e caixa aberto, debitar da gaveta
      if (forma === 'dinheiro' && sessaoAtiva && usuario?.id && loja?.id) {
        try {
          const mov = await caixaService.registrarMovimentacao({
            lojaId: loja.id,
            sessaoId: sessaoAtiva.id,
            tipo: 'DESPESA',
            metodoPagamento: 'DINHEIRO',
            valor: Number(tr.valor || 0),
            descricao: `Baixa Conta a Pagar: ${tr.descricao} (${tr.categoria || 'Geral'})`,
            usuarioId: usuario.id
          });
          if (mov) setMovimentacoesCaixaLoja(prev => [mov, ...prev]);
          const res = await caixaService.obterResumoSessao(sessaoAtiva.id);
          setResumoSessao(res);
        } catch (errMov) {
          console.warn('Aviso ao registrar baixa na sessão de caixa:', errMov);
        }
      }

      setModalBaixarConta({ aberta: false, transacao: null, formaPagamento: 'dinheiro', dataPagamento: obterDataOperacaoYMD(), processando: false });
      mostrarSucesso('Conta a pagar baixada com sucesso como PAGA!');
    } catch (err: any) {
      mostrarErro(err.message || 'Tente novamente.', 'Erro ao dar baixa na conta');
      setModalBaixarConta(prev => ({ ...prev, processando: false }));
    }
  };

  // 2. Abertura Formal de Sessão de Caixa (com Bloqueio de Concorrência)
  const handleAbrirSessao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || !usuario?.id) return;
    if (!permissions.podeAbrirFecharCaixa) {
      mostrarAviso('Permissão restrita. Seu usuário não possui autorização para abrir ou fechar o caixa.', 'Acesso Restrito');
      return;
    }
    try {
      setAbrindoCaixa(true);
      const valFundo = Number(fundoTroco) || 0;
      const nova = await caixaService.abrirSessao(loja.id, usuario.id, valFundo, terminalId);
      const res = await caixaService.obterResumoSessao(nova.id);
      setSessaoAtiva(nova);
      setResumoSessao(res);
      setModalAberturaCaixa(false);
      mostrarSucesso(`Sessão de caixa aberta com sucesso no terminal ${nova.terminal_id}! Fundo de troco: R$ ${valFundo.toFixed(2)}`);
      await carregarFinanceiro();
    } catch (err: any) {
      const msg = err.message || 'Erro ao abrir caixa.';
      const titulo = msg.includes('Bloqueio de Concorrência')
        ? 'Bloqueio de Concorrência'
        : msg.includes('sessoes_caixa') || msg.includes('schema cache')
        ? 'Tabela Não Encontrada no Supabase'
        : 'Erro ao Abrir Caixa';
      mostrarErro(msg, titulo);
    } finally {
      setAbrindoCaixa(false);
    }
  };

  // 3. Registrar Suprimento (Entrada Manual de Troco na Gaveta - Justificativa Obrigatória)
  const handleRegistrarSuprimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.ehAdmin) {
      mostrarAviso('Permissão restrita. Apenas administradores podem registrar suprimento.', 'Acesso Restrito');
      return;
    }
    if (!sessaoAtiva?.id || !loja?.id || !usuario?.id) {
      mostrarAviso('É necessário que haja uma sessão de caixa aberta para realizar suprimento.');
      return;
    }
    const valNum = Number(valorSuprimento);
    if (isNaN(valNum) || valNum <= 0) {
      mostrarAviso('Informe um valor válido maior que zero.');
      return;
    }
    if (!motivoSuprimento.trim()) {
      mostrarAviso('A justificativa do suprimento é obrigatória.');
      return;
    }

    try {
      setProcessandoSuprimento(true);
      await caixaService.registrarMovimentacao({
        lojaId: loja.id,
        sessaoId: sessaoAtiva.id,
        tipo: 'SUPRIMENTO',
        metodoPagamento: 'DINHEIRO',
        valor: valNum,
        descricao: `Suprimento: ${motivoSuprimento.trim()}`,
        usuarioId: usuario.id
      });
      setModalSuprimento(false);
      setValorSuprimento('');
      setMotivoSuprimento('');
      mostrarSucesso(`Suprimento de R$ ${valNum.toFixed(2)} registrado com sucesso na gaveta!`);
      const res = await caixaService.obterResumoSessao(sessaoAtiva.id);
      setResumoSessao(res);
    } catch (err: any) {
      mostrarErro(err.message, 'Erro ao registrar suprimento');
    } finally {
      setProcessandoSuprimento(false);
    }
  };

  // 4. Registrar Sangria (Retirada Preventiva para Cofre/Depósito - Justificativa Obrigatória)
  const handleRegistrarSangria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.ehAdmin) {
      mostrarAviso('Permissão restrita. Apenas administradores podem registrar sangria.', 'Acesso Restrito');
      return;
    }
    if (!sessaoAtiva?.id || !loja?.id || !usuario?.id) {
      mostrarAviso('É necessário que haja uma sessão de caixa aberta para realizar sangria.');
      return;
    }
    const valNum = Number(valorSangria);
    if (isNaN(valNum) || valNum <= 0) {
      mostrarAviso('Informe um valor válido maior que zero.');
      return;
    }
    if (!motivoSangria.trim()) {
      mostrarAviso('A justificativa da sangria é obrigatória.');
      return;
    }

    try {
      setProcessandoSangria(true);
      await caixaService.registrarMovimentacao({
        lojaId: loja.id,
        sessaoId: sessaoAtiva.id,
        tipo: 'SANGRIA',
        metodoPagamento: 'DINHEIRO',
        valor: valNum,
        descricao: `Sangria: ${motivoSangria.trim()}`,
        usuarioId: usuario.id
      });
      setModalSangria(false);
      setValorSangria('');
      setMotivoSangria('');
      mostrarSucesso(`Sangria de R$ ${valNum.toFixed(2)} registrada com sucesso!`);
      const res = await caixaService.obterResumoSessao(sessaoAtiva.id);
      setResumoSessao(res);
    } catch (err: any) {
      mostrarErro(err.message, 'Erro ao registrar sangria');
    } finally {
      setProcessandoSangria(false);
    }
  };

  // 5. Registrar Despesa Operacional Rápida (Paga com Dinheiro da Gaveta)
  const handleRegistrarDespesaRapida = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.ehAdmin) {
      mostrarAviso('Permissão restrita. Apenas administradores podem lançar despesas de caixa.');
      return;
    }
    if (!sessaoAtiva?.id || !loja?.id || !usuario?.id) {
      mostrarAviso('É necessário que haja uma sessão de caixa aberta.');
      return;
    }
    const valNum = Number(valorDespesaRapida);
    if (isNaN(valNum) || valNum <= 0) {
      mostrarAviso('Informe um valor válido maior que zero.');
      return;
    }
    if (!descricaoDespesaRapida.trim()) {
      mostrarAviso('A descrição/justificativa da despesa é obrigatória.');
      return;
    }

    try {
      setProcessandoDespesaRapida(true);
      // Registra saída física na sessão de caixa
      await caixaService.registrarMovimentacao({
        lojaId: loja.id,
        sessaoId: sessaoAtiva.id,
        tipo: 'DESPESA',
        metodoPagamento: 'DINHEIRO',
        valor: valNum,
        descricao: `Despesa Gaveta: ${descricaoDespesaRapida.trim()} (${categoriaDespesaRapida})`,
        usuarioId: usuario.id
      });

      // Registra no DRE geral (transacoes_financeiras) sem campo caixa_id
      try {
        await supabase.from('transacoes_financeiras').insert([{
          loja_id: loja.id,
          tipo: 'SAIDA',
          categoria: categoriaDespesaRapida,
          descricao: `Despesa Caixa (${sessaoAtiva.terminal_id}): ${descricaoDespesaRapida.trim()}`,
          valor: valNum,
          data_vencimento: obterDataOperacaoYMD(),
          data_pagamento: obterDataOperacaoISO(),
          status: 'pago',
          forma_pagamento: 'dinheiro'
        }]);
      } catch (errDre) {
        console.warn('Aviso ao registrar despesa no DRE geral:', errDre);
      }

      setModalDespesaRapida(false);
      setValorDespesaRapida('');
      setDescricaoDespesaRapida('');
      mostrarSucesso(`Despesa de R$ ${valNum.toFixed(2)} paga com dinheiro da gaveta registrada com sucesso!`);
      const res = await caixaService.obterResumoSessao(sessaoAtiva.id);
      setResumoSessao(res);
      await carregarFinanceiro();
    } catch (err: any) {
      mostrarErro(err.message, 'Erro ao registrar despesa rápida');
    } finally {
      setProcessandoDespesaRapida(false);
    }
  };

  // 6. Fechamento Cego de Caixa (Conferência Cega e Apuração de Sobra/Falta)
  const handleFecharSessaoCega = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessaoAtiva?.id || !usuario?.id) return;
    if (!permissions.podeAbrirFecharCaixa) {
      mostrarAviso('Permissão restrita. Seu usuário não possui autorização para abrir ou fechar o caixa.', 'Acesso Restrito');
      return;
    }

    try {
      setProcessandoFechamento(true);

      const parseMoeda = (val: string | number) => {
        if (!val) return 0;
        const limpo = String(val).trim().replace(',', '.');
        const num = parseFloat(limpo);
        return isNaN(num) ? 0 : num;
      };

      const contagem: DeclaradoPorMetodo = {
        dinheiro: parseMoeda(contagemDinheiro),
        pix: parseMoeda(contagemPix),
        cartao_credito: parseMoeda(contagemCredito),
        cartao_debito: parseMoeda(contagemDebito),
        outros: parseMoeda(contagemOutros)
      };

      const { sessao: sessaoFechada, resumo, statusDiferenca } = await caixaService.fecharSessao({
        sessaoId: sessaoAtiva.id,
        usuarioId: usuario.id,
        contagemDeclarada: contagem,
        observacoes: observacaoFechamento
      });

      const textoRecibo = caixaService.gerarTextoComprovanteFechamento(
        { ...resumo, sessao: sessaoFechada },
        loja?.nome_fantasia || 'HUBI GESTÃO'
      );

      setRelatorioFechamentoTexto(textoRecibo);
      setRelatorioFechamentoResumo({ ...resumo, sessao: sessaoFechada });
      setModalFechamentoCego(false);
      setModalRelatorioFechamento(true);
      setSessaoAtiva(null);
      setResumoSessao(null);
      setContagemDinheiro('');
      setContagemPix('');
      setContagemCredito('');
      setContagemDebito('');
      setContagemOutros('');
      setObservacaoFechamento('');

      const difVal = Number(sessaoFechada.diferenca_dinheiro || 0);
      const msgDif = statusDiferenca === 'exato'
        ? 'Caixa conciliado com exatidão (R$ 0,00 de diferença).'
        : statusDiferenca === 'sobra'
        ? `Fechamento concluído com SOBRA de R$ ${difVal.toFixed(2)}.`
        : `Fechamento concluído com FALTA de R$ ${Math.abs(difVal).toFixed(2)}.`;

      mostrarSucesso(msgDif, 'Caixa Encerrado com Sucesso');
      await carregarFinanceiro();
    } catch (err: any) {
      mostrarErro(err.message, 'Erro ao encerrar sessão de caixa');
    } finally {
      setProcessandoFechamento(false);
    }
  };

  // 7. Drill-Down: Inspecionar Sessão Passada no Histórico
  const handleAbrirDrillDown = async (sessao: SessaoCaixa) => {
    try {
      setCarregandoDrillDown(true);
      setSessaoDrillDown(sessao);
      setModalDrillDown(true);
      const { resumo } = await caixaService.obterDetalhesSessao(sessao.id);
      setResumoDrillDown(resumo);
    } catch (err: any) {
      mostrarErro('Erro ao carregar detalhes da sessão: ' + (err.message || 'Tente novamente'));
    } finally {
      setCarregandoDrillDown(false);
    }
  };

  // Ações de Compartilhamento do Relatório de Fechamento
  const handleCopiarRelatorioTexto = (texto: string) => {
    navigator.clipboard.writeText(texto);
    setCopiadoRelatorio(true);
    setTimeout(() => setCopiadoRelatorio(false), 2000);
  };

  const handleEnviarWhatsappRelatorioTexto = (texto: string) => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank');
  };

  const handleImprimirRelatorioTexto = (textoOuResumo?: any) => {
    if (textoOuResumo && typeof textoOuResumo === 'object') {
      PrintService.printFechamentoCaixa(textoOuResumo, loja);
      return;
    }
    if (relatorioFechamentoResumo) {
      PrintService.printFechamentoCaixa(relatorioFechamentoResumo, loja);
      return;
    }
    PrintService.printFechamentoCaixa({ sessao: sessaoAtiva || {}, textoRecibo: textoOuResumo }, loja);
  };

  // 7. Lista unificada de transações com descrições limpas e sem duplicações (Item 8 e 4b)
  const listaTransacoesUnificada = useMemo(() => {
    const resultado: Array<{
      id: string;
      tipo: 'ENTRADA' | 'SAIDA';
      categoria: string;
      descricao: string;
      valor: number;
      data: string;
      status: string;
      ehRecorrente?: boolean;
      formaPagamento?: string;
      dataVencimento?: string | null;
      dataPagamento?: string | null;
      raw?: any;
    }> = [];

    // Mapeamento e identificadores de pedidos
    const pedidosMap = new Map<string, Pedido>();
    const pedidosNumMap = new Map<number, Pedido>();

    pedidos.forEach(p => {
      if (p.id) {
        pedidosMap.set(p.id, p);
        pedidosMap.set(p.id.toLowerCase(), p);
      }
      if (p.numero_pedido != null) {
        pedidosNumMap.set(Number(p.numero_pedido), p);
      }
    });

    // Mapeamento de pedidos para suas respectivas sessões de caixa através das movimentações
    const pedidoSessaoMap = new Map<string, string>(); // pedido_id -> sessao_caixa_id
    movimentacoesCaixaLoja.forEach(m => {
      if (m.pedido_id && m.sessao_caixa_id) {
        pedidoSessaoMap.set(m.pedido_id.toLowerCase(), m.sessao_caixa_id);
      }
    });

    historicoSessoes.forEach(s => {
      (s.movimentacoes || []).forEach(m => {
        if (m.pedido_id && s.id) {
          pedidoSessaoMap.set(m.pedido_id.toLowerCase(), s.id);
        }
      });
    });

    const timestampAberturaSessao = sessaoAtiva ? new Date(sessaoAtiva.aberto_em).getTime() : null;
    const dataAberturaSessaoYMD = sessaoAtiva ? formatarDataLocalYMD(sessaoAtiva.aberto_em) : null;
    const dataOperacaoHojeYMD = obterDataOperacaoYMD();

    // Filtro de escopo para pedidos
    const pedidoPertenceAoEscopo = (p: Pedido): boolean => {
      if (filtroPeriodoFluxo === 'todos') return true;

      const sessaoDoPedido = p.id ? pedidoSessaoMap.get(p.id.toLowerCase()) : null;

      if (filtroPeriodoFluxo === 'sessao_atual' && sessaoAtiva) {
        // Se explicitamente vinculado a esta sessão ativa
        if (sessaoDoPedido && sessaoDoPedido === sessaoAtiva.id) {
          return true;
        }

        // Se registrado em outra sessão (ex: sessão anterior do dia anterior), NÃO pertence
        if (sessaoDoPedido && sessaoDoPedido !== sessaoAtiva.id) {
          return false;
        }

        // Se não possui registro de movimentação, verificar por data e horário de abertura
        const dataPedidoIso = p.data_venda || p.criado_em || '';
        const dataPedidoYMD = formatarDataLocalYMD(dataPedidoIso);

        // Não pode ser de data anterior à abertura da sessão
        if (dataAberturaSessaoYMD && dataPedidoYMD < dataAberturaSessaoYMD) {
          return false;
        }

        // Não pode ter sido criado antes da hora em que a sessão foi aberta
        if (timestampAberturaSessao && dataPedidoIso) {
          const timePedido = new Date(dataPedidoIso).getTime();
          if (timePedido < timestampAberturaSessao) {
            return false;
          }
        }

        return true;
      }

      if (filtroPeriodoFluxo === 'mes') {
        const dataPedidoIso = p.data_venda || p.criado_em || '';
        const dataPedidoYMD = formatarDataLocalYMD(dataPedidoIso);
        return dataPedidoYMD.slice(0, 7) === dataOperacaoHojeYMD.slice(0, 7);
      }

      // Se filtro for 'hoje' ou se não houver sessão ativa
      const dataPedidoIso = p.data_venda || p.criado_em || '';
      const dataPedidoYMD = formatarDataLocalYMD(dataPedidoIso);
      return dataPedidoYMD === dataOperacaoHojeYMD;
    };

    // Função auxiliar para verificar se uma transação financeira pertence a um pedido
    const identificarPedidoDaTransacao = (t: TransacaoFinanceira): { pertence: boolean; pedido?: Pedido; chave?: string } => {
      // 1. Por pedido_id
      if (t.pedido_id) {
        const ped = pedidosMap.get(t.pedido_id) || pedidosMap.get(t.pedido_id.toLowerCase());
        return { pertence: true, pedido: ped, chave: t.pedido_id.toLowerCase() };
      }

      const desc = (t.descricao || '').trim();

      // 2. Por UUID na descrição (ex: gerado automaticamente pelo trigger SQL: "Recebimento Pedido #<UUID>")
      const uuidMatch = desc.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuidMatch && uuidMatch[0]) {
        const uuid = uuidMatch[0].toLowerCase();
        const ped = pedidosMap.get(uuid);
        return { pertence: true, pedido: ped, chave: uuid };
      }

      // 3. Por menção a pedido ou venda numérica (ex: "Recebimento Pedido #12", "Recebimento Venda #12", "Pedido 12", "Venda 12")
      const numMatch = desc.match(/(?:recebimento\s+)?(?:pedido|venda)\s*(?:#|\bn[ºo]\b)?\s*(\d+)/i);
      if (numMatch && numMatch[1]) {
        const num = Number(numMatch[1]);
        const ped = pedidosNumMap.get(num);
        return { pertence: true, pedido: ped, chave: String(num) };
      }

      // 4. Se a categoria é explicitamente "Venda" ou "Venda Balcão / PDV"
      if (t.categoria === 'Venda' || t.categoria === 'Venda Balcão / PDV') {
        return { pertence: true, chave: desc.toLowerCase() };
      }

      return { pertence: false };
    };

    // Filtro de escopo para transações financeiras
    const transacaoPertenceAoEscopo = (t: TransacaoFinanceira, tipo: 'ENTRADA' | 'SAIDA'): boolean => {
      if (filtroPeriodoFluxo === 'todos') return true;

      // Se a transação estiver vinculada a um pedido, segue estritamente a pertinência do pedido
      const vinculo = identificarPedidoDaTransacao(t);
      if (vinculo.pertence) {
        const ped = vinculo.pedido || (t.pedido_id ? pedidosMap.get(t.pedido_id.toLowerCase()) : null);
        if (ped) {
          return pedidoPertenceAoEscopo(ped);
        }
        if (t.pedido_id) {
          const sessaoId = pedidoSessaoMap.get(t.pedido_id.toLowerCase());
          if (filtroPeriodoFluxo === 'sessao_atual' && sessaoAtiva && sessaoId && sessaoId !== sessaoAtiva.id) {
            return false;
          }
        }
      }

      // Contas a pagar pendentes podem ser visualizadas
      if (tipo === 'SAIDA' && String(t.status || '').toLowerCase() === 'pendente') {
        return true;
      }

      // Para despesas manuais / gerais: se houver movimentação correspondente na gaveta do caixa,
      // a pertinência da sessão do caixa é soberana e estrita
      if (tipo === 'SAIDA') {
        const movAssociada = movimentacoesCaixaLoja.find(m => {
          if (m.tipo !== 'DESPESA') return false;
          if (Math.abs(Number(m.valor) - Number(t.valor)) > 0.01) return false;
          const descTr = (t.descricao || '').toLowerCase().trim();
          const descMov = (m.descricao || '').toLowerCase();
          return descMov.includes(descTr) || (t.categoria && descMov.includes(t.categoria.toLowerCase()));
        });

        if (movAssociada && movAssociada.sessao_caixa_id) {
          if (filtroPeriodoFluxo === 'sessao_atual' && sessaoAtiva) {
            if (movAssociada.sessao_caixa_id !== sessaoAtiva.id) {
              return false;
            }
            return true;
          }
        }
      }

      // Extrai datas de competência da transação
      const dataVencYMD = t.data_vencimento ? formatarDataLocalYMD(t.data_vencimento) : '';
      const dataPagYMD = t.data_pagamento ? formatarDataLocalYMD(t.data_pagamento) : '';
      const dataCriadoYMD = t.criado_em ? formatarDataLocalYMD(t.criado_em) : '';

      const dataTransacaoIso = t.data_pagamento || t.criado_em || (t.data_vencimento ? `${t.data_vencimento}T12:00:00.000Z` : '');
      const dataTransacaoYMD = dataPagYMD || dataVencYMD || dataCriadoYMD;

      if (filtroPeriodoFluxo === 'sessao_atual') {
        if (sessaoAtiva) {
          // Não pode ser de data anterior à data de abertura da sessão ativa
          if (dataVencYMD && dataAberturaSessaoYMD && dataVencYMD < dataAberturaSessaoYMD) {
            return false;
          }
          if (dataTransacaoYMD && dataAberturaSessaoYMD && dataTransacaoYMD < dataAberturaSessaoYMD) {
            return false;
          }
          // Não pode ter sido efetuada antes da hora exata em que a sessão abriu
          if (timestampAberturaSessao && dataTransacaoIso) {
            const timeTr = new Date(dataTransacaoIso).getTime();
            if (timeTr < timestampAberturaSessao) {
              return false;
            }
          }
          // Se a data de competência da despesa for posterior à data da sessão, não pertence a este turno
          if (dataVencYMD && dataAberturaSessaoYMD && dataVencYMD > dataAberturaSessaoYMD) {
            return false;
          }
          return true;
        }

        // Se o caixa estiver fechado, exibe apenas os lançamentos da data operacional de hoje
        const dataRefYMD = dataVencYMD || dataTransacaoYMD;
        return dataRefYMD === dataOperacaoHojeYMD;
      }

      if (filtroPeriodoFluxo === 'mes') {
        const dataRefYMD = dataVencYMD || dataTransacaoYMD;
        return dataRefYMD.slice(0, 7) === dataOperacaoHojeYMD.slice(0, 7);
      }

      const dataRefYMD = dataVencYMD || dataTransacaoYMD;
      return dataRefYMD === dataOperacaoHojeYMD;
    };

    // Conjuntos para controle de duplicações estritas
    const pedidosContabilizados = new Set<string>();
    const transacoesIdsContabilizados = new Set<string>();

    // 1. Processar primeiro todos os pedidos válidos (Fonte de verdade oficial para VENDAS)
    pedidos.forEach(p => {
      // Ignorar pedidos que não pertençam ao escopo do turno/dia selecionado
      if (!pedidoPertenceAoEscopo(p)) return;

      // Ignorar e registrar pedidos cancelados para não puxar transações deles
      if (p.status === 'cancelado') {
        if (p.id) pedidosContabilizados.add(p.id.toLowerCase());
        if (p.numero_pedido != null) pedidosContabilizados.add(String(p.numero_pedido));
        return;
      }

      // Identificar status de pagamento do pedido
      const statusPag = p.status_pagamento || (Number(p.saldo_devedor) <= 0 && Number(p.valor_pago) > 0 ? 'pago' : Number(p.valor_pago) > 0 ? 'parcialmente_pago' : 'aguardando_pagamento');

      // Pedidos pendentes ou com pagamento aguardando NÃO entram nas entradas do caixa
      if (p.status === 'pendente' || statusPag === 'aguardando_pagamento') {
        // Bloqueia no conjunto para evitar que qualquer transação financeira órfã seja somada
        if (p.id) pedidosContabilizados.add(p.id.toLowerCase());
        if (p.numero_pedido != null) pedidosContabilizados.add(String(p.numero_pedido));
        return;
      }

      const valPago = Number(p.valor_pago || 0);
      const valTotal = Number(p.valor_total || 0);
      const valEfetivo = (statusPag === 'pago' || p.status === 'concluido')
        ? (valPago > 0 ? valPago : valTotal)
        : (statusPag === 'parcialmente_pago' ? valPago : 0);

      if (valEfetivo <= 0) {
        if (p.id) pedidosContabilizados.add(p.id.toLowerCase());
        if (p.numero_pedido != null) pedidosContabilizados.add(String(p.numero_pedido));
        return;
      }

      // Registrar como contabilizado para evitar que o trigger do Supabase duplique
      if (p.id) pedidosContabilizados.add(p.id.toLowerCase());
      if (p.numero_pedido != null) pedidosContabilizados.add(String(p.numero_pedido));

      const nomeCliente = p.cliente?.nome || 'Cliente Balcão';

      // Combinar múltiplas formas de pagamento se houver divisão (ex: Dinheiro + Pix)
      let fpNome = 'Dinheiro';
      if (p.pagamentos && p.pagamentos.length > 0) {
        const metodos = Array.from(
          new Set(
            p.pagamentos
              .map(pag => pag.forma_pagamento?.nome)
              .filter((nome): nome is string => Boolean(nome))
          )
        );
        if (metodos.length > 0) {
          fpNome = metodos.join(' + ');
        }
      }

      resultado.push({
        id: `ped_${p.id}`,
        tipo: 'ENTRADA',
        categoria: 'Venda Balcão / PDV',
        descricao: `Recebimento Venda #${p.numero_pedido || p.id.slice(0, 6)} - ${nomeCliente}`,
        valor: valEfetivo,
        data: p.data_venda || p.criado_em || new Date().toISOString(),
        status: 'pago',
        formaPagamento: fpNome
      });
    });

    // 2. Processar todas as transações financeiras reais da tabela transacoes_financeiras
    transacoes.forEach(t => {
      // Evitar duplicatas de ID na tabela de transações
      if (t.id && transacoesIdsContabilizados.has(t.id)) return;

      const tipo = String(t.tipo || '').toUpperCase() === 'SAIDA' || String(t.tipo || '').toLowerCase() === 'despesa'
        ? 'SAIDA'
        : 'ENTRADA';

      // Ignorar transações que não pertençam ao escopo do turno/dia selecionado
      if (!transacaoPertenceAoEscopo(t, tipo)) return;

      if (t.id) transacoesIdsContabilizados.add(t.id);

      // SE FOR SAÍDA (Despesas, Fornecedores, Contas a Pagar):
      if (tipo === 'SAIDA') {
        const status = String(t.status || 'pago').toLowerCase();
        resultado.push({
          id: t.id,
          tipo: 'SAIDA',
          categoria: t.categoria || 'Despesas Gerais',
          descricao: t.descricao || 'Despesa',
          valor: Number(t.valor || 0),
          data: t.data_vencimento || t.data_pagamento || t.criado_em || new Date().toISOString(),
          status: status === 'pago' ? 'pago' : status === 'pendente' ? 'pendente' : status,
          ehRecorrente: t.eh_recorrente,
          formaPagamento: t.forma_pagamento || undefined,
          dataVencimento: t.data_vencimento,
          dataPagamento: t.data_pagamento,
          raw: t
        });
        return;
      }

      // SE FOR ENTRADA:
      const vinculo = identificarPedidoDaTransacao(t);

      // Se a transação pertence a uma venda/pedido:
      if (vinculo.pertence) {
        // Se encontramos o pedido no catálogo do sistema (seja desta sessão ou de outra sessão/dia),
        // ele é de competência estrita do catálogo de pedidos. Não duplicar nem vazar sessões!
        if (vinculo.pedido) {
          return;
        }

        // Se o pedido_id existe no sistema, também ignorar
        if (t.pedido_id && (pedidosMap.has(t.pedido_id) || pedidosMap.has(t.pedido_id.toLowerCase()))) {
          return;
        }

        // Se a chave já foi contabilizada em pedidos:
        if (vinculo.chave && pedidosContabilizados.has(vinculo.chave.toLowerCase())) {
          return;
        }

        // Se for classificada como venda mas não encontramos o pedido e o filtro é turno atual:
        // verificar se não é de sessão anterior
        if (t.pedido_id && pedidoSessaoMap.has(t.pedido_id.toLowerCase())) {
          const sessaoId = pedidoSessaoMap.get(t.pedido_id.toLowerCase());
          if (filtroPeriodoFluxo === 'sessao_atual' && sessaoAtiva && sessaoId && sessaoId !== sessaoAtiva.id) {
            return;
          }
        }

        // Caso seja uma transação financeira de venda sem correspondência no banco de pedidos:
        const chavePedido = vinculo.chave || t.pedido_id || t.descricao;
        if (pedidosContabilizados.has(chavePedido.toLowerCase())) {
          return;
        }
        pedidosContabilizados.add(chavePedido.toLowerCase());

        let descFormatada = t.descricao || 'Recebimento Venda';
        descFormatada = descFormatada.replace(/recebimento pedido #/gi, 'Recebimento Venda #');

        const status = String(t.status || 'pago').toLowerCase();
        resultado.push({
          id: t.id,
          tipo: 'ENTRADA',
          categoria: t.categoria || 'Venda Balcão / PDV',
          descricao: descFormatada,
          valor: Number(t.valor || 0),
          data: t.data_pagamento || t.data_vencimento || t.criado_em || new Date().toISOString(),
          status: status === 'pago' ? 'pago' : status === 'pendente' ? 'pendente' : status,
          ehRecorrente: t.eh_recorrente,
          formaPagamento: t.forma_pagamento || undefined
        });
        return;
      }

      // Se for uma entrada legítima NÃO vinculada a pedido (ex: Quitação de Fiado, Aporte, etc.):
      const status = String(t.status || 'pago').toLowerCase();
      resultado.push({
        id: t.id,
        tipo: 'ENTRADA',
        categoria: t.categoria || 'Outras Receitas',
        descricao: t.descricao || 'Recebimento',
        valor: Number(t.valor || 0),
        data: t.data_pagamento || t.data_vencimento || t.criado_em || new Date().toISOString(),
        status: status === 'pago' ? 'pago' : status === 'pendente' ? 'pendente' : status,
        ehRecorrente: t.eh_recorrente,
        formaPagamento: t.forma_pagamento || undefined
      });
    });

    // Ordenar por data decrescente
    return resultado.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [pedidos, transacoes, sessaoAtiva, historicoSessoes, movimentacoesCaixaLoja, filtroPeriodoFluxo]);

  const totalReceitas = listaTransacoesUnificada
    .filter(t => t.tipo === 'ENTRADA' && (t.status === 'pago' || t.status === 'concluido' || t.status === 'concluído'))
    .reduce((acc, t) => acc + t.valor, 0);

  const totalDespesasPagas = listaTransacoesUnificada
    .filter(t => t.tipo === 'SAIDA' && (t.status === 'pago' || t.status === 'concluido' || t.status === 'concluído'))
    .reduce((acc, t) => acc + t.valor, 0);

  const totalDespesasPendentes = listaTransacoesUnificada
    .filter(t => t.tipo === 'SAIDA' && t.status === 'pendente')
    .reduce((acc, t) => acc + t.valor, 0);

  const lucroLiquido = totalReceitas - totalDespesasPagas;

  // Funções de exportação para Excel (.xlsx) das métricas de Finanças & Caixa
  const handleExportarEntradas = () => {
    try {
      const entradas = listaTransacoesUnificada.filter(t => t.tipo === 'ENTRADA');
      if (entradas.length === 0) {
        mostrarAviso('Nenhuma entrada/receita encontrada para exportar no período atual.');
        return;
      }
      financeExportService.exportarEntradasXLSX(entradas, loja?.nome_fantasia);
      mostrarSucesso(`Planilha de Entradas Gerais exportada com sucesso (${entradas.length} registros)!`);
    } catch (err: any) {
      console.error('Erro ao exportar entradas para Excel:', err);
      mostrarErro('Não foi possível exportar a planilha de Entradas Gerais.');
    }
  };

  const handleExportarDespesas = () => {
    try {
      const despesas = listaTransacoesUnificada.filter(
        t => t.tipo === 'SAIDA' && (t.status === 'pago' || t.status === 'concluido' || t.status === 'concluído')
      );
      if (despesas.length === 0) {
        mostrarAviso('Nenhuma despesa paga encontrada para exportar no período atual.');
        return;
      }
      financeExportService.exportarDespesasXLSX(despesas, loja?.nome_fantasia);
      mostrarSucesso(`Planilha de Despesas Gerais exportada com sucesso (${despesas.length} registros)!`);
    } catch (err: any) {
      console.error('Erro ao exportar despesas para Excel:', err);
      mostrarErro('Não foi possível exportar a planilha de Despesas Gerais.');
    }
  };

  const handleExportarContasPagar = () => {
    try {
      const contasPagar = listaTransacoesUnificada.filter(
        t => t.tipo === 'SAIDA' && t.status === 'pendente'
      );
      if (contasPagar.length === 0) {
        mostrarAviso('Nenhuma conta pendente a pagar encontrada para exportar.');
        return;
      }
      financeExportService.exportarContasPagarXLSX(contasPagar, loja?.nome_fantasia);
      mostrarSucesso(`Planilha de Contas a Pagar exportada com sucesso (${contasPagar.length} registros)!`);
    } catch (err: any) {
      console.error('Erro ao exportar contas a pagar para Excel:', err);
      mostrarErro('Não foi possível exportar a planilha de Contas a Pagar.');
    }
  };

  // Dados para Relatório Consolidado de Meios de Pagamento
  const dadosRelatorioConsolidado = useMemo(() => {
    // 1. Unificar histórico com a sessão ativa atual em tempo real (evitando duplicidade por ID)
    const mapaSessoes = new Map<string, SessaoCaixa>();
    
    (historicoSessoes || []).forEach(s => {
      if (s?.id) mapaSessoes.set(s.id, s);
    });

    if (resumoSessao?.sessao) {
      const sessaoAtualizada: SessaoCaixa = {
        ...resumoSessao.sessao,
        total_vendas_dinheiro: resumoSessao.totaisPorMetodo.dinheiro,
        total_vendas_pix: resumoSessao.totaisPorMetodo.pix,
        total_vendas_debito: resumoSessao.totaisPorMetodo.cartao_debito,
        total_vendas_credito: resumoSessao.totaisPorMetodo.cartao_credito,
        total_vendas_outros: resumoSessao.totaisPorMetodo.outros,
        faturamento_total: resumoSessao.faturamentoTotalVendas,
        saldo_dinheiro_calculado: resumoSessao.saldoEsperadoDinheiro,
        movimentacoes: resumoSessao.sessao.movimentacoes
      };
      mapaSessoes.set(resumoSessao.sessao.id, sessaoAtualizada);
    } else if (sessaoAtiva?.id && !mapaSessoes.has(sessaoAtiva.id)) {
      mapaSessoes.set(sessaoAtiva.id, sessaoAtiva);
    }

    const sessoesNoPeriodo = Array.from(mapaSessoes.values()).filter(s => {
      if (!s.aberto_em) return false;
      if (!periodoRelatorioInicio && !periodoRelatorioFim) return true;
      const dataS = formatarDataLocalYMD(s.aberto_em);
      if (periodoRelatorioInicio && dataS < periodoRelatorioInicio) return false;
      if (periodoRelatorioFim && dataS > periodoRelatorioFim) return false;
      return true;
    });

    let dinheiro = 0;
    let pix = 0;
    let debito = 0;
    let credito = 0;
    let outros = 0;

    const pedidosProcessados = new Set<string>();

    // 1. Processar todos os pedidos pagos no período (Fonte canônica oficial de todas as vendas da loja: PDV e Catálogo Online)
    (pedidos || []).forEach(p => {
      if (p.status === 'cancelado' || p.status === 'pendente') return;
      const statusPag = p.status_pagamento || (Number(p.saldo_devedor) <= 0 && Number(p.valor_pago) > 0 ? 'pago' : '');
      if (statusPag !== 'pago' && p.status !== 'concluido') return;

      const dataP = formatarDataLocalYMD(p.data_venda || p.criado_em);
      if (periodoRelatorioInicio && dataP < periodoRelatorioInicio) return;
      if (periodoRelatorioFim && dataP > periodoRelatorioFim) return;

      if (p.id) pedidosProcessados.add(p.id.toLowerCase());

      if (p.pagamentos && p.pagamentos.length > 0) {
        p.pagamentos.forEach(pag => {
          const val = Number(pag.valor || 0);
          const tipoFp = (pag.forma_pagamento?.tipo || '').toLowerCase();
          const nomeFp = (pag.forma_pagamento?.nome || '').toLowerCase();

          if (tipoFp === 'dinheiro' || nomeFp.includes('dinheiro')) {
            dinheiro += val;
          } else if (tipoFp === 'pix' || nomeFp.includes('pix')) {
            pix += val;
          } else if (tipoFp === 'cartao_debito' || nomeFp.includes('débito') || nomeFp.includes('debito')) {
            debito += val;
          } else if (tipoFp === 'cartao_credito' || nomeFp.includes('crédito') || nomeFp.includes('credito')) {
            credito += val;
          } else {
            outros += val;
          }
        });
      } else {
        const val = Number(p.valor_pago || p.valor_total || 0);
        const fp = ((p as any).forma_pagamento_padrao || (p as any).forma_pagamento || '').toLowerCase();
        if (fp.includes('pix')) {
          pix += val;
        } else if (fp.includes('débito') || fp.includes('debito')) {
          debito += val;
        } else if (fp.includes('crédito') || fp.includes('credito')) {
          credito += val;
        } else if (fp.includes('dinheiro')) {
          dinheiro += val;
        } else if (p.origem === 'catalogo_online') {
          credito += val; // Mercado pago padrão
        } else {
          dinheiro += val;
        }
      }
    });

    // 2. Adicionar movimentações de vendas avulsas de sessões que não tenham vindo de pedidos
    const todasMovs: MovimentacaoCaixa[] = [];
    if (resumoSessao?.sessao?.movimentacoes) {
      todasMovs.push(...resumoSessao.sessao.movimentacoes);
    }
    (historicoSessoes || []).forEach(s => {
      if (s.id !== resumoSessao?.sessao?.id && s.movimentacoes) {
        todasMovs.push(...s.movimentacoes);
      }
    });

    todasMovs.forEach(m => {
      if (m.tipo !== 'VENDA') return;
      if (m.pedido_id && pedidosProcessados.has(m.pedido_id.toLowerCase())) return;

      const dataM = formatarDataLocalYMD(m.criado_em);
      if (periodoRelatorioInicio && dataM < periodoRelatorioInicio) return;
      if (periodoRelatorioFim && dataM > periodoRelatorioFim) return;

      const val = Number(m.valor || 0);
      switch (m.metodo_pagamento) {
        case 'DINHEIRO': dinheiro += val; break;
        case 'PIX': pix += val; break;
        case 'CARTAO_DEBITO': debito += val; break;
        case 'CARTAO_CREDITO': credito += val; break;
        default: outros += val; break;
      }
    });

    const totalBruto = dinheiro + pix + debito + credito + outros;

    return {
      quantidadeSessoes: sessoesNoPeriodo.length,
      dinheiro,
      pix,
      debito,
      credito,
      outros,
      totalBruto
    };
  }, [historicoSessoes, sessaoAtiva, resumoSessao, periodoRelatorioInicio, periodoRelatorioFim, pedidos]);

  // Dados para Relatório de Sangrias e Despesas
  const dadosRelatorioSangriasDespesas = useMemo(() => {
    const mapaSessoes = new Map<string, SessaoCaixa>();
    
    (historicoSessoes || []).forEach(s => {
      if (s?.id) mapaSessoes.set(s.id, s);
    });

    if (resumoSessao?.sessao) {
      mapaSessoes.set(resumoSessao.sessao.id, resumoSessao.sessao);
    } else if (sessaoAtiva?.id && !mapaSessoes.has(sessaoAtiva.id)) {
      mapaSessoes.set(sessaoAtiva.id, sessaoAtiva);
    }

    const sessoesNoPeriodo = Array.from(mapaSessoes.values()).filter(s => {
      if (!s.aberto_em) return false;
      if (!periodoRelatorioInicio && !periodoRelatorioFim) return true;
      const dataS = formatarDataLocalYMD(s.aberto_em);
      if (periodoRelatorioInicio && dataS < periodoRelatorioInicio) return false;
      if (periodoRelatorioFim && dataS > periodoRelatorioFim) return false;
      return true;
    });

    const itens: Array<{
      id: string;
      tipo: string;
      data: string;
      terminal: string;
      valor: number;
      descricao: string;
      operador: string;
    }> = [];

    let totalSangrias = 0;
    let totalDespesas = 0;

    sessoesNoPeriodo.forEach(s => {
      (s.movimentacoes || []).forEach(m => {
        if (m.tipo === 'SANGRIA' || m.tipo === 'DESPESA') {
          const val = Number(m.valor || 0);
          if (m.tipo === 'SANGRIA') totalSangrias += val;
          if (m.tipo === 'DESPESA') totalDespesas += val;
          itens.push({
            id: m.id,
            tipo: m.tipo,
            data: m.criado_em,
            terminal: s.terminal_id,
            valor: val,
            descricao: m.descricao || (m.tipo === 'SANGRIA' ? 'Sangria de Caixa' : 'Despesa Operacional'),
            operador: m.usuario?.nome_completo || 'Operador'
          });
        }
      });
    });

    itens.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    return {
      itens,
      totalSangrias,
      totalDespesas,
      totalGeral: totalSangrias + totalDespesas
    };
  }, [historicoSessoes, sessaoAtiva, resumoSessao, periodoRelatorioInicio, periodoRelatorioFim]);

  const [filtroMovimentacoes, setFiltroMovimentacoes] = useState<'todas' | 'vendas' | 'suprimentos' | 'sangrias' | 'despesas'>('todas');

  const movimentacoesDaSessao = useMemo(() => {
    return sessaoAtiva?.movimentacoes || [];
  }, [sessaoAtiva]);

  const vendasDaSessao = useMemo(() => {
    if (!sessaoAtiva) return [];
    return pedidos.filter(p => {
      const dataVenda = p.data_venda || p.criado_em;
      if (!dataVenda) return false;
      const tVenda = new Date(dataVenda).getTime();
      const tAbertura = new Date(sessaoAtiva.aberto_em).getTime();
      const tFechamento = sessaoAtiva.fechado_em ? new Date(sessaoAtiva.fechado_em).getTime() : Infinity;
      return tVenda >= tAbertura && tVenda <= tFechamento;
    });
  }, [sessaoAtiva, pedidos]);

  const handleReimprimirFechamento = async (cx: SessaoCaixa) => {
    try {
      const { resumo } = await caixaService.obterDetalhesSessao(cx.id);
      PrintService.printFechamentoCaixa({ ...resumo, sessao: cx }, loja);
    } catch (e) {
      mostrarErro('Erro ao gerar comprovante de impressão.');
    }
  };

  return (
    <div className={`h-full w-full overflow-hidden select-none ${isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-black'}`}>
      {/* 1. VISUALIZAÇÃO MOBILE EXCLUSIVA (TELAS 001 A 029) */}
      <div className="block lg:hidden h-full overflow-hidden">
        <FinancasMobile
          sessaoAtiva={sessaoAtiva}
          resumoSessao={resumoSessao}
          historicoSessoes={historicoSessoes}
          transacoes={transacoes}
          pedidos={pedidos}
          usuariosLoja={usuariosLoja}
          carregando={carregando}
          onRecarregar={carregarFinanceiro}
          totalReceitas={totalReceitas}
          totalDespesasPagas={totalDespesasPagas}
          totalDespesasPendentes={totalDespesasPendentes}
          lucroLiquido={lucroLiquido}
          listaTransacoesUnificada={listaTransacoesUnificada}
          movimentacoesDaSessao={movimentacoesDaSessao}
          vendasDaSessao={vendasDaSessao}
          abaAtiva={abaAtiva}
          setAbaAtiva={setAbaAtiva}
          filtroPeriodoFluxo={filtroPeriodoFluxo}
          setFiltroPeriodoFluxo={setFiltroPeriodoFluxo}
          filtroMovimentacoes={filtroMovimentacoes}
          setFiltroMovimentacoes={setFiltroMovimentacoes}
          filtrosHistorico={filtrosHistorico}
          setFiltrosHistorico={setFiltrosHistorico}
          onAbrirCaixa={() => setModalAberturaCaixa(true)}
          onSuprimento={() => setModalSuprimento(true)}
          onSangria={() => setModalSangria(true)}
          onDespesaGaveta={() => setModalDespesaRapida(true)}
          onFechamentoCego={() => setModalFechamentoCego(true)}
          onNovaDespesa={abrirModalNovaDespesa}
          onNovaContaPagar={abrirModalNovaContaPagar}
          onEditarTransacao={abrirModalEditarTransacao}
          onBaixarConta={(tr) => setModalBaixarConta({
            aberta: true,
            transacao: tr,
            formaPagamento: (tr as any).formaPagamento || 'dinheiro',
            dataPagamento: obterDataOperacaoYMD(),
            processando: false
          })}
          onConfirmarExclusao={(tr) => setModalConfirmarExclusao({ aberta: true, transacao: tr, processando: false })}
          onDetalhesMetrica={(tipo) => setModalDetalhesMetrica(tipo)}
          onExportarEntradas={handleExportarEntradas}
          onDrillDownSessao={handleAbrirDrillDown}
          onReimprimirFechamento={handleReimprimirFechamento}
          saldoEsperadoGaveta={resumoSessao?.saldoEsperadoDinheiro || 0}
        />
      </div>

      {/* 2. VISUALIZAÇÃO DESKTOP */}
      <div className={`hidden lg:flex flex-col h-full overflow-hidden font-sans ${isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-black'}`}>
        {/* ========================================================================= */}
        {/* HEADER SUPERIOR                                                           */}
        {/* ========================================================================= */}
        <div className={`p-4 md:p-6 space-y-4 shrink-0 ${isDark ? 'bg-[#08131A] border-b border-slate-700' : 'bg-slate-100 border-b-2 border-slate-300'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className={`p-2.5 rounded-2xl transition cursor-pointer shadow-xs ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-white hover:bg-slate-900' : 'bg-white border-2 border-slate-300 text-black hover:bg-slate-100'
                }`}
                title="Voltar"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className={`text-xl font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-black'}`}>
                  <DollarSign className="w-5 h-5 text-emerald-500" />
                  <span>Controle de Caixa & Sessões Transacionais</span>
                </h1>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Ciclo de vida por turnos contínuos (sessao_caixa_id), suprimentos, sangrias, despesas e conferência cega.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {sessaoAtiva ? (
                <>
                  {permissions.ehAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => setModalSuprimento(true)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                        title="Adicionar Troco Extra na Gaveta"
                      >
                        <ArrowDown className="w-4 h-4 text-white" />
                        <span>Suprimento</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setModalSangria(true)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                        title="Retirar Dinheiro para o Cofre"
                      >
                        <ArrowUp className="w-4 h-4 text-white" />
                        <span>Sangria</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setModalDespesaRapida(true)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                        title="Despesa Paga com Dinheiro da Gaveta"
                      >
                        <Banknote className="w-4 h-4 text-white" />
                        <span>Despesa Gaveta</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setModalFechamentoCego(true)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <Lock className="w-4 h-4 text-white" />
                    <span>Fechar Caixa</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setModalAberturaCaixa(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                >
                  <Unlock className="w-4 h-4 text-white" />
                  <span>Abrir Caixa</span>
                </button>
              )}

            </div>
          </div>

          {/* CARDS DE RESUMO FINANCEIRO GERAL COM INFORMAÇÕES CENTRALIZADAS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Entradas Totais */}
            <div className={`rounded-2xl p-4 shadow-xs text-center flex flex-col items-center justify-center transition space-y-1 ${
              isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <div className="w-full flex items-center justify-between gap-1">
                <span className={`text-sm font-bold flex items-center gap-1.5 truncate ${isDark ? 'text-white' : 'text-black'}`}>
                  <ArrowUpRight className="w-4 h-4 text-emerald-500 shrink-0" /> Entradas Gerais
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleExportarEntradas}
                    title="Exportar Entradas Gerais para Excel (.xlsx)"
                    className="px-1.5 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-bold text-[10px] transition cursor-pointer flex items-center gap-1 shadow-xs"
                  >
                    <FileSpreadsheet className="w-3 h-3" />
                    <span>Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalDetalhesMetrica('entradas')}
                    className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-bold text-[10px] transition cursor-pointer shadow-xs"
                  >
                    Detalhar
                  </button>
                </div>
              </div>
              <span className={`text-2xl sm:text-3xl font-black tracking-tight block truncate text-center pt-1 ${isDark ? 'text-white' : 'text-black'}`}>
                {formatarMoeda(totalReceitas)}
              </span>
            </div>

            {/* Despesas */}
            <div className={`rounded-2xl p-4 shadow-xs text-center flex flex-col items-center justify-center transition space-y-1 ${
              isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <div className="w-full flex items-center justify-between gap-1">
                <span className={`text-sm font-bold flex items-center gap-1.5 truncate ${isDark ? 'text-white' : 'text-black'}`}>
                  <ArrowDownRight className="w-4 h-4 text-rose-500 shrink-0" /> Despesas Gerais
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {permissions.ehAdmin && (
                    <button
                      type="button"
                      onClick={abrirModalNovaDespesa}
                      title="Lançar Nova Despesa"
                      className="px-1.5 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-bold text-[10px] transition cursor-pointer flex items-center gap-0.5 shadow-xs"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Nova</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setModalDetalhesMetrica('saidas')}
                    className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-bold text-[10px] transition cursor-pointer shadow-xs"
                  >
                    Detalhar
                  </button>
                </div>
              </div>
              <span className={`text-2xl sm:text-3xl font-black tracking-tight block truncate text-center pt-1 ${isDark ? 'text-white' : 'text-black'}`}>
                {formatarMoeda(totalDespesasPagas)}
              </span>
            </div>

            {/* Contas a Pagar */}
            <div className={`rounded-2xl p-4 shadow-xs text-center flex flex-col items-center justify-center transition space-y-1 ${
              isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <div className="w-full flex items-center justify-between gap-1">
                <span className={`text-sm font-bold flex items-center gap-1.5 truncate ${isDark ? 'text-white' : 'text-black'}`}>
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /> A Pagar
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {permissions.ehAdmin && (
                    <button
                      type="button"
                      onClick={abrirModalNovaContaPagar}
                      title="Lançar Nova Conta a Pagar"
                      className="px-1.5 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-bold text-[10px] transition cursor-pointer flex items-center gap-0.5 shadow-xs"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Nova</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setModalDetalhesMetrica('pagar')}
                    className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-bold text-[10px] transition cursor-pointer shadow-xs"
                  >
                    Detalhar
                  </button>
                </div>
              </div>
              <span className={`text-2xl sm:text-3xl font-black tracking-tight block truncate text-center pt-1 ${isDark ? 'text-white' : 'text-black'}`}>
                {formatarMoeda(totalDespesasPendentes)}
              </span>
            </div>

            {/* Resultado Acumulado */}
            <div className={`rounded-2xl p-4 shadow-xs text-center flex flex-col items-center justify-center transition space-y-1 ${
              isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <div className="w-full flex items-center justify-between gap-1">
                <div className="text-left">
                  <span className={`text-sm font-bold truncate block ${isDark ? 'text-white' : 'text-black'}`}>Resultado Acumulado</span>
                  <span className="text-[10px] text-emerald-500 font-bold block">
                    {filtroPeriodoFluxo === 'sessao_atual' ? '• Turno Atual' : filtroPeriodoFluxo === 'hoje' ? '• Hoje' : filtroPeriodoFluxo === 'mes' ? '• Este Mês' : '• Todos'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalDetalhesMetrica('lucro')}
                  className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-bold text-[10px] transition cursor-pointer shrink-0 shadow-xs"
                >
                  Detalhar
                </button>
              </div>
              <span className={`text-2xl sm:text-3xl font-black tracking-tight block truncate text-center pt-1 ${isDark ? 'text-white' : 'text-black'}`}>
                {formatarMoeda(lucroLiquido)}
              </span>
            </div>
          </div>

          {/* NAVEGAÇÃO DE ABAS */}
          <div className={`flex items-center gap-2 border-b overflow-x-auto ${isDark ? 'border-slate-700' : 'border-slate-300'}`}>
            <button
              type="button"
              onClick={() => setAbaAtiva('caixa_atual')}
              className={`pb-2 px-3 text-xs transition whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                abaAtiva === 'caixa_atual'
                  ? 'border-b-2 border-emerald-500 text-emerald-500 font-black'
                  : isDark ? 'text-white hover:text-emerald-400 font-bold' : 'text-black hover:text-emerald-600 font-bold'
              }`}
            >
              <span>Turno / Gaveta Atual</span>
              <span className={`w-2 h-2 rounded-full ${sessaoAtiva ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`}></span>
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('fluxo')}
              className={`pb-2 px-3 text-xs transition whitespace-nowrap cursor-pointer ${
                abaAtiva === 'fluxo'
                  ? 'border-b-2 border-emerald-500 text-emerald-500 font-black'
                  : isDark ? 'text-white hover:text-emerald-400 font-bold' : 'text-black hover:text-emerald-600 font-bold'
              }`}
            >
              Fluxo Geral ({listaTransacoesUnificada.length})
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('pagar')}
              className={`pb-2 px-3 text-xs transition whitespace-nowrap cursor-pointer ${
                abaAtiva === 'pagar'
                  ? 'border-b-2 border-emerald-500 text-emerald-500 font-black'
                  : isDark ? 'text-white hover:text-emerald-400 font-bold' : 'text-black hover:text-emerald-600 font-bold'
              }`}
            >
              Contas a Pagar ({listaTransacoesUnificada.filter(t => t.tipo === 'SAIDA' && t.status === 'pendente').length})
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('historico_caixas')}
              className={`pb-2 px-3 text-xs transition whitespace-nowrap cursor-pointer ${
                abaAtiva === 'historico_caixas'
                  ? 'border-b-2 border-emerald-500 text-emerald-500 font-black'
                  : isDark ? 'text-white hover:text-emerald-400 font-bold' : 'text-black hover:text-emerald-600 font-bold'
              }`}
            >
              Histórico & Auditoria ({historicoSessoes.length})
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CORPO / LISTAGEM DA ABA SELECIONADA                                       */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
          {carregando ? (
            <div className="text-center py-16 text-slate-500 text-sm">Carregando dados financeiros e de caixa...</div>
          ) : (
            <>
              {/* ABA 1 & 2: FLUXO GERAL / CONTAS A PAGAR */}
              {(abaAtiva === 'fluxo' || abaAtiva === 'pagar') && (
                <div className="space-y-3">
                  {abaAtiva === 'fluxo' && (
                    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-2xl ${
                      isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300 shadow-xs'
                    }`}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {sessaoAtiva && (
                          <button
                            type="button"
                            onClick={() => setFiltroPeriodoFluxo('sessao_atual')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                              filtroPeriodoFluxo === 'sessao_atual'
                                ? 'bg-emerald-600 text-white shadow-xs border border-emerald-500'
                                : isDark
                                ? 'bg-[#08131A] text-white hover:text-emerald-400 border border-slate-700'
                                : 'bg-slate-100 text-black hover:text-emerald-600 border border-slate-300'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span>Turno Atual ({new Date(sessaoAtiva.aberto_em).toLocaleDateString('pt-BR')})</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setFiltroPeriodoFluxo('hoje')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                            filtroPeriodoFluxo === 'hoje'
                              ? 'bg-emerald-600 text-white shadow-xs border border-emerald-500'
                              : isDark
                              ? 'bg-[#08131A] text-white hover:text-emerald-400 border border-slate-700'
                              : 'bg-slate-100 text-black hover:text-emerald-600 border border-slate-300'
                          }`}
                        >
                          Hoje
                        </button>
                        <button
                          type="button"
                          onClick={() => setFiltroPeriodoFluxo('mes')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                            filtroPeriodoFluxo === 'mes'
                              ? 'bg-emerald-600 text-white shadow-xs border border-emerald-500'
                              : isDark
                              ? 'bg-[#08131A] text-white hover:text-emerald-400 border border-slate-700'
                              : 'bg-slate-100 text-black hover:text-emerald-600 border border-slate-300'
                          }`}
                        >
                          Este Mês
                        </button>
                        <button
                          type="button"
                          onClick={() => setFiltroPeriodoFluxo('todos')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                            filtroPeriodoFluxo === 'todos'
                              ? 'bg-emerald-600 text-white shadow-xs border border-emerald-500'
                              : isDark
                              ? 'bg-[#08131A] text-white hover:text-emerald-400 border border-slate-700'
                              : 'bg-slate-100 text-black hover:text-emerald-600 border border-slate-300'
                          }`}
                        >
                          Todos os Registros
                        </button>
                      </div>
                      <span className={`text-[11px] font-bold px-2 ${isDark ? 'text-white' : 'text-black'}`}>
                        {listaTransacoesUnificada.length} {listaTransacoesUnificada.length === 1 ? 'registro' : 'registros'}
                      </span>
                    </div>
                  )}

                  {abaAtiva === 'pagar' && (
                    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-2xl ${
                      isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300 shadow-xs'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-black flex items-center gap-1.5 px-2 ${isDark ? 'text-white' : 'text-black'}`}>
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          <span>Contas e Despesas Pendentes a Pagar ({listaTransacoesUnificada.filter(t => t.tipo === 'SAIDA' && t.status === 'pendente').length})</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleExportarContasPagar}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>Exportar Excel</span>
                        </button>
                        {permissions.ehAdmin && (
                          <button
                            type="button"
                            onClick={abrirModalNovaContaPagar}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Nova Conta a Pagar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {listaTransacoesUnificada
                    .filter(t => (abaAtiva === 'pagar' ? t.tipo === 'SAIDA' && t.status === 'pendente' : true)).length === 0 ? (
                    <div className={`text-center py-12 rounded-3xl p-6 border-2 border-dashed ${
                      isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-slate-300 text-black'
                    }`}>
                      <Layers className={`w-8 h-8 mx-auto mb-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                      <p className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>
                        {abaAtiva === 'pagar' ? 'Nenhuma conta a pagar pendente.' : 'Nenhuma movimentação registrada no período selecionado.'}
                      </p>
                      <p className={`text-[11px] mt-1 max-w-md mx-auto font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        {abaAtiva === 'pagar'
                          ? 'Todas as contas e despesas operacionais estão em dia.'
                          : sessaoAtiva && filtroPeriodoFluxo === 'sessao_atual'
                          ? 'O caixa deste turno foi aberto com o fundo inicial informado e ainda não possui vendas ou despesas registradas.'
                          : 'Não há entradas ou despesas cadastradas para os critérios aplicados.'}
                      </p>
                    </div>
                  ) : (
                    listaTransacoesUnificada
                      .filter(t => (abaAtiva === 'pagar' ? t.tipo === 'SAIDA' && t.status === 'pendente' : true))
                      .map((tr) => (
                        <div
                          key={tr.id}
                          className={`rounded-2xl p-3.5 flex items-center justify-between gap-4 transition shadow-xs ${
                            isDark
                              ? 'bg-[#000000] border border-slate-700 hover:border-slate-600'
                              : 'bg-white border-2 border-slate-300 hover:border-slate-400'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                tr.tipo === 'ENTRADA' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                              }`}
                            >
                              {tr.tipo === 'ENTRADA' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                            </div>

                            <div className="min-w-0">
                              <h4 className={`text-xs font-black truncate ${isDark ? 'text-white' : 'text-black'}`}>{tr.descricao}</h4>
                              <div className={`flex items-center gap-2 text-[10px] mt-0.5 flex-wrap ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>{tr.categoria}</span>
                                {tr.formaPagamento && (
                                  <>
                                    <span>•</span>
                                    <span className={`px-2 py-0.5 rounded uppercase font-black text-[9px] ${
                                      isDark ? 'bg-[#08131A] text-white border border-slate-700' : 'bg-slate-100 text-black border border-slate-300'
                                    }`}>
                                      {tr.formaPagamento}
                                    </span>
                                  </>
                                )}
                                <span>•</span>
                                <span className="font-medium">{new Date(tr.data).toLocaleDateString('pt-BR')}</span>
                                {tr.ehRecorrente && (
                                  <span className="text-emerald-500 font-bold flex items-center gap-0.5">
                                    <Repeat className="w-2.5 h-2.5" /> Mensal
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <span className={`font-black text-sm block ${isDark ? 'text-white' : 'text-black'}`}>
                                {tr.tipo === 'ENTRADA' ? '+' : '-'} {formatarMoeda(tr.valor)}
                              </span>
                              <span className={`text-[10px] uppercase font-black ${tr.status === 'pendente' ? 'text-amber-500' : (isDark ? 'text-emerald-400' : 'text-emerald-600')}`}>
                                {tr.status}
                              </span>
                            </div>

                            {/* AÇÕES DE GESTÃO: BAIXAR CONTA, EDITAR, EXCLUIR */}
                            {permissions.ehAdmin && !tr.id.startsWith('ped_') && (
                              <div className={`flex items-center gap-1.5 pl-2 border-l ${isDark ? 'border-slate-700' : 'border-slate-300'}`}>
                                {tr.tipo === 'SAIDA' && tr.status === 'pendente' && (
                                  <button
                                    type="button"
                                    onClick={() => setModalBaixarConta({
                                      aberta: true,
                                      transacao: tr,
                                      formaPagamento: tr.formaPagamento || 'dinheiro',
                                      dataPagamento: obterDataOperacaoYMD(),
                                      processando: false
                                    })}
                                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1 border border-emerald-500 shadow-xs transition cursor-pointer"
                                    title="Dar Baixa / Marcar como Paga"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Pagar</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => abrirModalEditarTransacao(tr)}
                                  className={`p-1.5 rounded-xl transition cursor-pointer border ${
                                    isDark
                                      ? 'bg-[#08131A] hover:bg-slate-900 text-white border-slate-700'
                                      : 'bg-slate-100 hover:bg-slate-200 text-black border-slate-300'
                                  }`}
                                  title="Editar Lançamento"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setModalConfirmarExclusao({ aberta: true, transacao: tr, processando: false })}
                                  className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold transition cursor-pointer border border-rose-500/30"
                                  title="Excluir Lançamento"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              )}

              {/* ABA 3: TURNO / GAVETA ATUAL (SESSÃO TRANSACIONAL EM TEMPO REAL) */}
              {abaAtiva === 'caixa_atual' && (
                <div className="space-y-5 max-w-5xl mx-auto">
                  {sessaoAtiva && resumoSessao ? (
                    <div className="space-y-5">
                      {/* ALERTA DE SESSÃO ABERTA HÁ MAIS DE 24 HORAS */}
                      {resumoSessao.abertoHaMaisDe24h && (
                        <div className={`rounded-3xl p-4 flex items-center gap-3 animate-pulse border-2 ${
                          isDark
                            ? 'bg-amber-500/15 border-amber-500/60 text-amber-200'
                            : 'bg-[#FEF3C7] border-[#FDE68A] text-[#92400E]'
                        }`}>
                          <AlertTriangle className={`w-6 h-6 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                          <div className="text-xs">
                            <strong className={`font-bold text-sm block ${isDark ? 'text-amber-300' : 'text-[#78350F]'}`}>
                              Atenção: Sessão de Caixa aberta há mais de 24 horas ({resumoSessao.duracaoTexto})!
                            </strong>
                            <span className={isDark ? 'text-amber-200/90' : 'text-[#92400E]'}>
                              Este caixa foi aberto em {new Date(sessaoAtiva.aberto_em).toLocaleString('pt-BR')} e continua acumulando movimentações.
                              Para evitar discrepâncias entre turnos, recomenda-se realizar o Fechamento Cego e abrir uma nova sessão.
                            </span>
                          </div>
                        </div>
                      )}


                      {/* CABEÇALHO DA SESSÃO ATIVA */}
                      <div className={`rounded-3xl p-6 shadow-sm space-y-6 ${
                        isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                      }`}>
                        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 ${
                          isDark ? 'border-slate-700' : 'border-slate-200'
                        }`}>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              <span className="font-black text-xs text-emerald-500 uppercase tracking-wider">
                                Sessão Transacional Aberta • Terminal {sessaoAtiva.terminal_id}
                              </span>
                            </div>
                            <h3 className={`text-xl font-black mt-1 ${isDark ? 'text-white' : 'text-black'}`}>
                              Operador: {sessaoAtiva.usuario_abertura?.nome_completo || 'Operador'}
                            </h3>
                            <div className={`flex items-center gap-3 text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              <span className="flex items-center gap-1 font-medium">
                                <Clock className="w-3.5 h-3.5 text-emerald-500" />
                                Aberto às {new Date(sessaoAtiva.aberto_em).toLocaleTimeString('pt-BR')} ({new Date(sessaoAtiva.aberto_em).toLocaleDateString('pt-BR')})
                              </span>
                              <span>•</span>
                              <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                                Duração: {resumoSessao.duracaoTexto}
                              </span>
                            </div>
                          </div>

                          <div className={`rounded-2xl px-5 py-3 text-right shrink-0 ${
                            isDark ? 'bg-[#08131A] border border-slate-700' : 'bg-slate-50 border border-slate-200'
                          }`}>
                            <span className={`text-[11px] block font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Fundo de Troco Inicial</span>
                            <span className={`text-lg font-black ${isDark ? 'text-white' : 'text-black'}`}>
                              {formatarMoeda(resumoSessao?.fundoInicial ?? Number(sessaoAtiva.fundo_inicial || 0))}
                            </span>
                          </div>
                        </div>

                        {/* BIG KPI CARD: SALDO ESPERADO EM DINHEIRO NA GAVETA FÍSICA */}
                        <div className={`rounded-3xl p-5 space-y-3 ${
                          isDark ? 'bg-[#08131A] border border-slate-700' : 'bg-slate-50 border-2 border-slate-200'
                        }`}>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <span className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                                isDark ? 'text-white' : 'text-black'
                              }`}>
                                <Banknote className="w-4 h-4 text-emerald-500" /> Saldo Esperado em Dinheiro na Gaveta Física
                              </span>
                              <p className={`text-[11px] mt-0.5 font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                Valor exato que deve constar em notas e moedas neste momento.
                              </p>
                            </div>
                            <span className={`text-3xl font-black ${isDark ? 'text-white' : 'text-black'}`}>
                              {formatarMoeda(resumoSessao.saldoEsperadoDinheiro)}
                            </span>
                          </div>

                          {/* FÓRMULA DE COMPOSIÇÃO FÍSICA DETALHADA */}
                          <div className={`grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t text-[11px] ${
                            isDark ? 'border-slate-700' : 'border-slate-200'
                          }`}>
                            <div className={`p-2 rounded-xl border ${
                              isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                            }`}>
                              <span className={`block text-[10px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Fundo Inicial</span>
                              <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>+ {formatarMoeda(resumoSessao?.fundoInicial ?? Number(sessaoAtiva.fundo_inicial || 0))}</span>
                            </div>
                            <div className={`p-2 rounded-xl border ${
                              isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                            }`}>
                              <span className={`block text-[10px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Vendas Dinheiro</span>
                              <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>+ {formatarMoeda(resumoSessao.totaisPorMetodo.dinheiro)}</span>
                            </div>
                            <div className={`p-2 rounded-xl border ${
                              isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                            }`}>
                              <span className={`block text-[10px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Suprimentos</span>
                              <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>+ {formatarMoeda(resumoSessao.totalSuprimentos)}</span>
                            </div>
                            <div className={`p-2 rounded-xl border ${
                              isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                            }`}>
                              <span className={`block text-[10px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Sangrias (Cofre)</span>
                              <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>- {formatarMoeda(resumoSessao.totalSangrias)}</span>
                            </div>
                            <div className={`p-2 rounded-xl border ${
                              isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                            }`}>
                              <span className={`block text-[10px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Despesas Gaveta</span>
                              <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>- {formatarMoeda(resumoSessao.totalDespesas)}</span>
                            </div>
                          </div>
                        </div>

                        {/* VENDAS DO TURNO POR MÉTODO DE PAGAMENTO */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className={`font-black text-xs uppercase tracking-wider ${isDark ? 'text-white' : 'text-black'}`}>
                              Vendas do Turno por Meio de Pagamento
                            </h4>
                            <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              Total Faturado: <strong className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{formatarMoeda(resumoSessao.faturamentoTotalVendas)}</strong>
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {/* Dinheiro */}
                            <div className={`p-3.5 rounded-2xl border space-y-1 ${
                              isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-50 border-2 border-slate-200'
                            }`}>
                              <div className="flex items-center justify-between">
                                <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>Dinheiro</span>
                                <Banknote className="w-4 h-4 text-emerald-500" />
                              </div>
                              <span className={`text-base font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                                {formatarMoeda(resumoSessao.totaisPorMetodo.dinheiro)}
                              </span>
                              <span className={`text-[10px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                {resumoSessao.qtdVendasPorMetodo.dinheiro} vendas
                              </span>
                            </div>

                            {/* Pix */}
                            <div className={`p-3.5 rounded-2xl border space-y-1 ${
                              isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-50 border-2 border-slate-200'
                            }`}>
                              <div className="flex items-center justify-between">
                                <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>Pix</span>
                                <Zap className="w-4 h-4 text-emerald-500" />
                              </div>
                              <span className={`text-base font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                                {formatarMoeda(resumoSessao.totaisPorMetodo.pix)}
                              </span>
                              <span className={`text-[10px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                {resumoSessao.qtdVendasPorMetodo.pix} vendas
                              </span>
                            </div>

                            {/* Cartão Débito */}
                            <div className={`p-3.5 rounded-2xl border space-y-1 ${
                              isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-50 border-2 border-slate-200'
                            }`}>
                              <div className="flex items-center justify-between">
                                <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>Cartão Débito</span>
                                <CreditCard className="w-4 h-4 text-emerald-500" />
                              </div>
                              <span className={`text-base font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                                {formatarMoeda(resumoSessao.totaisPorMetodo.cartao_debito)}
                              </span>
                              <span className={`text-[10px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                {resumoSessao.qtdVendasPorMetodo.cartao_debito} vendas
                              </span>
                            </div>

                            {/* Cartão Crédito */}
                            <div className={`p-3.5 rounded-2xl border space-y-1 ${
                              isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-50 border-2 border-slate-200'
                            }`}>
                              <div className="flex items-center justify-between">
                                <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>Cartão Crédito</span>
                                <CreditCard className="w-4 h-4 text-emerald-500" />
                              </div>
                              <span className={`text-base font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                                {formatarMoeda(resumoSessao.totaisPorMetodo.cartao_credito)}
                              </span>
                              <span className={`text-[10px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                {resumoSessao.qtdVendasPorMetodo.cartao_credito} vendas
                              </span>
                            </div>

                            {/* Outros */}
                            <div className={`p-3.5 rounded-2xl border space-y-1 ${
                              isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-50 border-2 border-slate-200'
                            }`}>
                              <div className="flex items-center justify-between">
                                <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>Outros</span>
                                <Layers className="w-4 h-4 text-emerald-500" />
                              </div>
                              <span className={`text-base font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                                {formatarMoeda(resumoSessao.totaisPorMetodo.outros)}
                              </span>
                              <span className={`text-[10px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                {resumoSessao.qtdVendasPorMetodo.outros} vendas
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* LINHA DO TEMPO: MOVIMENTAÇÕES DESTA SESSÃO */}
                        <div className={`border-t pt-4 space-y-3 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                          <div className="flex items-center justify-between">
                            <h4 className={`font-black text-xs uppercase tracking-wider ${isDark ? 'text-white' : 'text-black'}`}>
                              Movimentações da Sessão Ativa
                            </h4>
                            {permissions.ehAdmin && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setModalSuprimento(true)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs rounded-xl cursor-pointer shadow-xs transition"
                                >
                                  + Suprimento
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setModalSangria(true)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs rounded-xl cursor-pointer shadow-xs transition"
                                >
                                  - Sangria
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setModalDespesaRapida(true)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs rounded-xl cursor-pointer shadow-xs transition"
                                >
                                  - Despesa
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {!sessaoAtiva.movimentacoes || sessaoAtiva.movimentacoes.length === 0 ? (
                              <p className={`text-xs py-6 text-center font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                Nenhuma movimentação registrada nesta sessão de caixa até o momento.
                              </p>
                            ) : (
                              sessaoAtiva.movimentacoes.map((m) => {
                                const ehSaida = m.tipo === 'SANGRIA' || m.tipo === 'DESPESA';
                                return (
                                  <div
                                    key={m.id}
                                    className={`p-3 rounded-2xl border flex items-center justify-between text-xs ${
                                      isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-50 border border-slate-200'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <div
                                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                                          ehSaida
                                            ? 'bg-rose-500/10 text-rose-500'
                                            : 'bg-emerald-500/10 text-emerald-500'
                                        }`}
                                      >
                                        {m.tipo === 'SUPRIMENTO' && <ArrowDown className="w-4 h-4" />}
                                        {m.tipo === 'SANGRIA' && <ArrowUp className="w-4 h-4" />}
                                        {m.tipo === 'DESPESA' && <Banknote className="w-4 h-4" />}
                                        {m.tipo === 'VENDA' && <ShoppingCart className="w-4 h-4" />}
                                      </div>
                                      <div>
                                        <span className={`font-bold block ${isDark ? 'text-white' : 'text-black'}`}>{m.descricao}</span>
                                        <div className={`flex items-center gap-2 text-[10px] mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                          <span className="uppercase font-bold">{m.metodo_pagamento}</span>
                                          <span>•</span>
                                          <span>{new Date(m.criado_em).toLocaleTimeString('pt-BR')}</span>
                                          {m.usuario?.nome_completo && (
                                            <>
                                              <span>•</span>
                                              <span>{m.usuario.nome_completo}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <span className={`font-black text-sm ${ehSaida ? 'text-rose-500' : (isDark ? 'text-white' : 'text-black')}`}>
                                      {ehSaida ? '-' : '+'} {formatarMoeda(m.valor)}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* BOTÃO DE FECHAMENTO CEGO */}
                        <div className={`border-t pt-4 flex items-center justify-between ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                          <span className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            Pronto para fechar o turno? Realize a contagem física cega.
                          </span>
                          <button
                            type="button"
                            onClick={() => setModalFechamentoCego(true)}
                            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs rounded-2xl shadow-xs transition cursor-pointer flex items-center gap-2"
                          >
                            <Lock className="w-4 h-4" />
                            <span>Realizar Fechamento Cego de Caixa</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ESTADO QUANDO NÃO HÁ SESSÃO ABERTA */
                    <div className={`rounded-3xl p-12 text-center space-y-4 shadow-xl ${
                      isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                    }`}>
                      <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto border ${
                        isDark ? 'bg-[#08131A] border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-600'
                      }`}>
                        <Lock className="w-8 h-8 text-emerald-500" />
                      </div>
                      <div>
                        <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>
                          Nenhum Caixa Aberto no Momento (Terminal {terminalId})
                        </h3>
                        <p className={`text-xs max-w-sm mx-auto mt-1 font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          Abra o caixa informando o fundo de troco inicial para registrar vendas, sangrias, suprimentos e controlar o turno.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setModalAberturaCaixa(true)}
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs rounded-2xl shadow-xs transition cursor-pointer inline-flex items-center gap-2"
                      >
                        <Unlock className="w-4 h-4" />
                        <span>Abrir Sessão de Caixa</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ABA 4: HISTÓRICO & AUDITORIA DE SESSÕES PASSADAS */}
              {abaAtiva === 'historico_caixas' && (
                <div className="space-y-4 max-w-5xl mx-auto">
                  {/* BARRA DE FILTROS E RELATÓRIOS GERENCIAIS */}
                  <div className={`rounded-3xl p-4 space-y-3 shadow-xs ${
                    isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                  }`}>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
                        <div>
                          <label className={`text-[10px] font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>Data Início</label>
                          <input
                            type="date"
                            value={filtrosHistorico.dataInicio}
                            onChange={(e) => setFiltrosHistorico(prev => ({ ...prev, dataInicio: e.target.value }))}
                            className={`w-full rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none transition ${
                              isDark
                                ? 'bg-[#08131A] border border-slate-700 text-white focus:border-emerald-500'
                                : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                            }`}
                          />
                        </div>
                        <div>
                          <label className={`text-[10px] font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>Data Fim</label>
                          <input
                            type="date"
                            value={filtrosHistorico.dataFim}
                            onChange={(e) => setFiltrosHistorico(prev => ({ ...prev, dataFim: e.target.value }))}
                            className={`w-full rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none transition ${
                              isDark
                                ? 'bg-[#08131A] border border-slate-700 text-white focus:border-emerald-500'
                                : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                            }`}
                          />
                        </div>
                        <div>
                          <label className={`text-[10px] font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>Operador</label>
                          <select
                            value={filtrosHistorico.usuarioId}
                            onChange={(e) => setFiltrosHistorico(prev => ({ ...prev, usuarioId: e.target.value }))}
                            className={`w-full rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none transition cursor-pointer ${
                              isDark
                                ? 'bg-[#08131A] border border-slate-700 text-white focus:border-emerald-500'
                                : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                            }`}
                          >
                            <option value="todos">Todos os Operadores</option>
                            {usuariosLoja.map(u => (
                              <option key={u.id} value={u.id}>{u.nome_completo}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={`text-[10px] font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>Diferença</label>
                          <select
                            value={filtrosHistorico.statusDiferenca}
                            onChange={(e) => setFiltrosHistorico(prev => ({ ...prev, statusDiferenca: e.target.value as any }))}
                            className={`w-full rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none transition cursor-pointer ${
                              isDark
                                ? 'bg-[#08131A] border border-slate-700 text-white focus:border-emerald-500'
                                : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                            }`}
                          >
                            <option value="todos">Todas</option>
                            <option value="com_diferenca">Com Divergência (Sobra/Falta)</option>
                            <option value="exato">Somente Exato (Sem Falta)</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 md:pt-0 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (filtrosHistorico.dataInicio) setPeriodoRelatorioInicio(filtrosHistorico.dataInicio);
                            if (filtrosHistorico.dataFim) setPeriodoRelatorioFim(filtrosHistorico.dataFim);
                            setModalRelatorioConsolidado(true);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                        >
                          <FileText className="w-4 h-4" />
                          <span>Meios de Pagamento</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (filtrosHistorico.dataInicio) setPeriodoRelatorioInicio(filtrosHistorico.dataInicio);
                            if (filtrosHistorico.dataFim) setPeriodoRelatorioFim(filtrosHistorico.dataFim);
                            setModalRelatorioSangriasDespesas(true);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                        >
                          <SlidersHorizontal className="w-4 h-4" />
                          <span>Sangrias & Despesas</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* LISTAGEM DE SESSÕES */}
                  {historicoSessoes.length === 0 ? (
                    <div className={`text-center py-16 text-sm rounded-3xl border ${
                      isDark ? 'bg-[#000000] border-slate-700 text-slate-300' : 'bg-white border-2 border-slate-300 text-slate-600'
                    }`}>
                      Nenhuma sessão de caixa encontrada para os filtros selecionados.
                    </div>
                  ) : (
                    historicoSessoes.map((cx) => {
                      const dif = Number(cx.diferenca_dinheiro || 0);
                      const isExato = Math.abs(dif) < 0.01;
                      const isSobra = dif > 0.01;
                      const isFalta = dif < -0.01;

                      return (
                        <div
                          key={cx.id}
                          className={`rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition shadow-xs ${
                            isDark
                              ? 'bg-[#000000] border border-slate-700 hover:border-slate-600'
                              : 'bg-white border-2 border-slate-300 hover:border-slate-400'
                          }`}
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-black text-sm ${isDark ? 'text-white' : 'text-black'}`}>
                                Terminal {cx.terminal_id}
                              </span>
                              <span
                                className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${
                                  cx.status === 'ABERTO'
                                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                    : isDark ? 'bg-[#08131A] text-slate-300 border border-slate-700' : 'bg-slate-100 text-slate-700 border border-slate-300'
                                }`}
                              >
                                {cx.status}
                              </span>
                              {cx.status === 'FECHADO' && (
                                <span
                                  className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                    isExato
                                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                      : isSobra
                                      ? 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20'
                                      : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                  }`}
                                >
                                  {isExato
                                    ? '✓ Caixa Exato'
                                    : isSobra
                                    ? `+ ${formatarMoeda(dif)} (Sobra)`
                                    : `- ${formatarMoeda(Math.abs(dif))} (Falta)`}
                                </span>
                              )}
                            </div>

                            <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              Aberto em: <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>{new Date(cx.aberto_em).toLocaleString('pt-BR')}</span> por {cx.usuario_abertura?.nome_completo || 'Operador'}
                              {cx.fechado_em && (
                                <>
                                  {' '}• Fechado em: <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>{new Date(cx.fechado_em).toLocaleString('pt-BR')}</span>
                                </>
                              )}
                            </p>

                            <div className={`flex items-center gap-3 text-[11px] pt-1 flex-wrap ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              <span>Faturamento Total: <strong className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{formatarMoeda(cx.faturamento_total || 0)}</strong></span>
                              <span>•</span>
                              <span>Esperado Dinheiro: <strong className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{formatarMoeda(cx.saldo_dinheiro_calculado || 0)}</strong></span>
                              {(cx.saldo_declarado_dinheiro != null || cx.saldo_dinheiro_declarado != null) && (
                                <>
                                  <span>•</span>
                                  <span>Declarado Físico: <strong className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{formatarMoeda(cx.saldo_declarado_dinheiro ?? cx.saldo_dinheiro_declarado)}</strong></span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleAbrirDrillDown(cx)}
                              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                            >
                              <Search className="w-4 h-4 text-white" />
                              <span>Inspecionar (Drill-Down)</span>
                            </button>

                            {cx.fechado_em && (
                              <button
                                type="button"
                                onClick={() => handleReimprimirFechamento(cx)}
                                className={`p-2 rounded-xl border cursor-pointer transition flex items-center gap-1.5 shadow-xs ${
                                  isDark
                                    ? 'bg-[#08131A] hover:bg-slate-900 text-white border-slate-700'
                                    : 'bg-slate-100 hover:bg-slate-200 text-black border-slate-300'
                                }`}
                                title="Imprimir Comprovante Oficial de Fechamento"
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
              )}
            </>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: LANÇAR NOVA DESPESA (DRE GERAL)                                    */}
        {/* ========================================================================= */}
        {modalNovaDespesa && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
            <div className={`rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl my-8 ${
              isDark ? 'bg-[#08131A] text-white border-2 border-slate-400' : 'bg-slate-100 text-black border-2 border-slate-300'
            }`}>
              <div className={`flex items-center justify-between border-b pb-3 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold border ${
                    statusLancamento === 'pendente'
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                  }`}>
                    {statusLancamento === 'pendente' ? (
                      <AlertTriangle className="w-5 h-5" />
                    ) : (
                      <ArrowDownRight className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>
                      {transacaoEditando
                        ? (statusLancamento === 'pendente' ? 'Editar Conta a Pagar' : 'Editar Despesa')
                        : (statusLancamento === 'pendente' ? 'Nova Conta a Pagar' : 'Lançar Nova Despesa (DRE)')}
                    </h3>
                    <p className={`text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {statusLancamento === 'pendente'
                        ? 'Programe contas ou despesas futuras a pagar'
                        : 'Lance despesas operacionais ou compras já pagas'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setModalNovaDespesa(false);
                    setTransacaoEditando(null);
                  }}
                  className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* SELETOR DE TIPO: DESPESA PAGA vs CONTA A PAGAR */}
              <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-2xl border ${
                isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
              }`}>
                <button
                  type="button"
                  onClick={() => setStatusLancamento('pago')}
                  className={`py-2 px-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    statusLancamento === 'pago'
                      ? 'bg-emerald-600 text-white shadow-xs border border-emerald-500'
                      : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-black'
                  }`}
                >
                  <ArrowDownRight className="w-3.5 h-3.5" />
                  <span>Despesa Paga</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusLancamento('pendente')}
                  className={`py-2 px-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    statusLancamento === 'pendente'
                      ? 'bg-emerald-600 text-white shadow-xs border border-emerald-500'
                      : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-black'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Conta a Pagar</span>
                </button>
              </div>

              <form onSubmit={handleSalvarDespesaOuContaPagar} className="space-y-3.5">
                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                    Descrição / Fornecedor / Título *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={statusLancamento === 'pendente' ? "Ex: Boleto Aluguel Março / Fornecedor Bebidas" : "Ex: Compra de Insumos / Limpeza / Fornecedor"}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    className={`w-full rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none transition ${
                      isDark
                        ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500'
                        : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-600'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>Valor (R$) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="Ex: 150.00"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      className={`w-full rounded-xl px-3.5 py-2 text-xs font-black focus:outline-none transition ${
                        isDark
                          ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500'
                          : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-600'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>Categoria</label>
                    <select
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value)}
                      className={`w-full rounded-xl px-3 py-2 text-xs font-bold focus:outline-none transition cursor-pointer ${
                        isDark
                          ? 'bg-[#000000] border border-slate-700 text-white focus:border-emerald-500'
                          : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                      }`}
                    >
                      <option value="Fornecedor">Fornecedor / Insumos</option>
                      <option value="Aluguel">Aluguel / Ponto Comercial</option>
                      <option value="Energia/Água">Energia / Água / Internet</option>
                      <option value="Salário">Salário / Comissão</option>
                      <option value="Impostos">Impostos / Guias Fiscais</option>
                      <option value="Marketing">Marketing / Anúncios</option>
                      <option value="Manutenção">Manutenção / Equipamentos</option>
                      <option value="Outros">Outros / Avulso</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                    {statusLancamento === 'pendente' ? 'Forma Prevista de Pagamento' : 'Forma de Pagamento Utilizada *'}
                  </label>
                  <select
                    value={formaPagamentoDespesa}
                    onChange={(e) => setFormaPagamentoDespesa(e.target.value)}
                    className={`w-full rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none transition cursor-pointer ${
                      isDark
                        ? 'bg-[#000000] border border-slate-700 text-white focus:border-emerald-500'
                        : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                    }`}
                  >
                    <option value="dinheiro">Dinheiro (Gaveta do Caixa Ativo)</option>
                    <option value="pix">Pix</option>
                    <option value="debito">Cartão de Débito</option>
                    <option value="credito">Cartão de Crédito</option>
                    <option value="transferencia">Transferência Bancária / Boleto</option>
                  </select>
                  {statusLancamento === 'pago' && formaPagamentoDespesa === 'dinheiro' && sessaoAtiva && (
                    <div className={`p-2.5 rounded-xl text-[11px] mt-1.5 flex items-center gap-1.5 border ${
                      isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>Esta despesa será debitada da gaveta física da sessão ativa ({sessaoAtiva.terminal_id}).</span>
                    </div>
                  )}
                  {statusLancamento === 'pendente' && (
                    <span className={`text-[10px] block mt-1 font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      💡 Contas pendentes NÃO debitam do resultado financeiro até serem baixadas/pagas.
                    </span>
                  )}
                </div>

                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                    {statusLancamento === 'pendente' ? 'Data de Vencimento *' : 'Data do Pagamento *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={dataVencimento}
                    onChange={(e) => setDataVencimento(e.target.value)}
                    className={`w-full rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none transition ${
                      isDark
                        ? 'bg-[#000000] border border-slate-700 text-white focus:border-emerald-500'
                        : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                    }`}
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="chkRecorrente"
                    checked={ehRecorrente}
                    onChange={(e) => setEhRecorrente(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="chkRecorrente" className={`text-xs font-bold cursor-pointer ${isDark ? 'text-white' : 'text-black'}`}>
                    Despesa Fixa Recorrente (Repetir mensalmente)
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={salvandoDespesa}
                  className="w-full py-3.5 rounded-xl font-black text-xs shadow-xs transition mt-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white"
                >
                  {salvandoDespesa
                    ? 'Salvando...'
                    : transacaoEditando
                    ? (statusLancamento === 'pendente' ? 'Salvar Alterações da Conta' : 'Salvar Alterações da Despesa')
                    : (statusLancamento === 'pendente' ? 'Cadastrar Conta a Pagar' : 'Confirmar Lançamento de Despesa')}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: CONFIRMAR EXCLUSÃO DE LANÇAMENTO FINANCEIRO                        */}
        {/* ========================================================================= */}
        {modalConfirmarExclusao.aberta && modalConfirmarExclusao.transacao && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className={`rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl ${
              isDark ? 'bg-[#08131A] text-white border-2 border-slate-400' : 'bg-slate-100 text-black border-2 border-slate-300'
            }`}>
              <div className={`flex items-center justify-between border-b pb-3 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center font-bold">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Confirmar Exclusão</h3>
                    <p className={`text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Exclusão irreversível de lançamento</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalConfirmarExclusao({ aberta: false, transacao: null, processando: false })}
                  className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className={`p-4 rounded-2xl border space-y-2 text-xs ${
                isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
              }`}>
                <span className={`block font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Lançamento a ser excluído permanentemente:</span>
                <p className={`font-black text-sm ${isDark ? 'text-white' : 'text-black'}`}>
                  {modalConfirmarExclusao.transacao.descricao}
                </p>
                <div className={`flex items-center justify-between pt-2 border-t text-xs ${
                  isDark ? 'border-slate-700' : 'border-slate-200'
                }`}>
                  <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                    Categoria: <strong className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>{modalConfirmarExclusao.transacao.categoria}</strong>
                  </span>
                  <span className="text-sm font-black text-rose-500">
                    R$ {Number(modalConfirmarExclusao.transacao.valor || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className={`p-3 rounded-xl text-xs leading-relaxed border ${
                isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                ⚠️ Esta ação não pode ser desfeita. O registro será removido das contas a pagar, DRE e dos relatórios financeiros.
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalConfirmarExclusao({ aberta: false, transacao: null, processando: false })}
                  className={`flex-1 py-3 font-bold text-xs rounded-xl cursor-pointer transition border ${
                    isDark
                      ? 'bg-[#08131A] hover:bg-slate-900 text-white border-slate-700'
                      : 'bg-slate-100 hover:bg-slate-200 text-black border-slate-300'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={modalConfirmarExclusao.processando}
                  onClick={handleExcluirTransacao}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {modalConfirmarExclusao.processando ? 'Excluindo...' : 'Sim, Excluir'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: BAIXAR / LIQUIDAR CONTA A PAGAR                                     */}
        {/* ========================================================================= */}
        {modalBaixarConta.aberta && modalBaixarConta.transacao && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className={`rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl ${
              isDark ? 'bg-[#08131A] text-white border-2 border-slate-400' : 'bg-slate-100 text-black border-2 border-slate-300'
            }`}>
              <div className={`flex items-center justify-between border-b pb-3 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Baixar / Liquidar Conta a Pagar</h3>
                    <p className={`text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Confirmação de pagamento efetuado</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalBaixarConta({ aberta: false, transacao: null, formaPagamento: 'dinheiro', dataPagamento: obterDataOperacaoYMD(), processando: false })}
                  className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className={`p-4 rounded-2xl border space-y-2 text-xs ${
                isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <span className={`text-[11px] block font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Título / Conta:</span>
                    <strong className={`text-sm block font-black ${isDark ? 'text-white' : 'text-black'}`}>{modalBaixarConta.transacao.descricao}</strong>
                    <span className={`text-[10px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>{modalBaixarConta.transacao.categoria}</span>
                  </div>
                  <span className="text-base font-black text-amber-500 shrink-0">
                    R$ {Number(modalBaixarConta.transacao.valor || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <form onSubmit={handleLiquidarContaPagar} className="space-y-3.5">
                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                    Forma de Pagamento Efetiva *
                  </label>
                  <select
                    value={modalBaixarConta.formaPagamento}
                    onChange={(e) => setModalBaixarConta(prev => ({ ...prev, formaPagamento: e.target.value }))}
                    className={`w-full rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none transition cursor-pointer ${
                      isDark
                        ? 'bg-[#000000] border border-slate-700 text-white focus:border-emerald-500'
                        : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                    }`}
                  >
                    <option value="dinheiro">Dinheiro (Gaveta do Caixa Ativo)</option>
                    <option value="pix">Pix Bancário</option>
                    <option value="debito">Cartão de Débito</option>
                    <option value="credito">Cartão de Crédito</option>
                    <option value="transferencia">Transferência Bancária / Boleto</option>
                  </select>
                  {modalBaixarConta.formaPagamento === 'dinheiro' && sessaoAtiva && (
                    <div className={`p-2.5 rounded-xl text-[11px] mt-1.5 flex items-center gap-1.5 border ${
                      isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>O valor será debitado automaticamente da gaveta do caixa atual ({sessaoAtiva.terminal_id}).</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                    Data do Pagamento *
                  </label>
                  <input
                    type="date"
                    required
                    value={modalBaixarConta.dataPagamento}
                    onChange={(e) => setModalBaixarConta(prev => ({ ...prev, dataPagamento: e.target.value }))}
                    className={`w-full rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none transition ${
                      isDark
                        ? 'bg-[#000000] border border-slate-700 text-white focus:border-emerald-500'
                        : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                    }`}
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalBaixarConta({ aberta: false, transacao: null, formaPagamento: 'dinheiro', dataPagamento: obterDataOperacaoYMD(), processando: false })}
                    className={`flex-1 py-3.5 font-bold text-xs rounded-xl cursor-pointer transition border ${
                      isDark
                        ? 'bg-[#08131A] hover:bg-slate-900 text-white border-slate-700'
                        : 'bg-slate-100 hover:bg-slate-200 text-black border-slate-300'
                    }`}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={modalBaixarConta.processando}
                    className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 border border-emerald-500"
                  >
                    {modalBaixarConta.processando ? 'Processando...' : 'Confirmar Pagamento'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: ABERTURA DE SESSÃO DE CAIXA (BLOQUEIO DE CONCORRÊNCIA)              */}
        {/* ========================================================================= */}
        {modalAberturaCaixa && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className={`rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl ${
              isDark ? 'bg-[#08131A] text-white border-2 border-slate-400' : 'bg-slate-100 text-black border-2 border-slate-300'
            }`}>
              <div className={`flex items-center justify-between border-b pb-3 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold">
                    <Unlock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Abertura de Caixa</h3>
                    <p className={`text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Início de turno e fundo de troco</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalAberturaCaixa(false)}
                  className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAbrirSessao} className="space-y-4">
                <div className={`p-3.5 rounded-2xl border space-y-1.5 text-xs ${
                  isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-300 font-bold' : 'text-slate-600 font-bold'}>Terminal de Caixa:</span>
                    <strong className={`uppercase font-black ${isDark ? 'text-white' : 'text-black'}`}>{terminalId}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-300 font-bold' : 'text-slate-600 font-bold'}>Operador:</span>
                    <strong className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{usuario?.nome_completo || 'Operador'}</strong>
                  </div>
                  <p className={`text-[10px] pt-1 border-t font-medium ${
                    isDark ? 'text-slate-400 border-slate-800' : 'text-slate-500 border-slate-200'
                  }`}>
                    🔒 O sistema valida a concorrência e impede a abertura simultânea de mais de uma sessão ativa neste terminal.
                  </p>
                </div>

                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                    Fundo de Troco Inicial em Dinheiro (R$):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ex: 100.00"
                    value={fundoTroco}
                    onChange={(e) => setFundoTroco(e.target.value)}
                    className={`w-full rounded-xl px-4 py-3 text-2xl font-black text-center focus:outline-none transition border-2 ${
                      isDark
                        ? 'bg-[#000000] border-emerald-500 text-emerald-400'
                        : 'bg-emerald-50/50 border-emerald-500 text-emerald-700'
                    }`}
                  />
                  <span className={`text-[10px] block text-center mt-1 font-medium ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                    Valor físico inicial em cédulas e moedas na gaveta
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={abrindoCaixa}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-xs transition cursor-pointer disabled:opacity-50 border border-emerald-500"
                >
                  {abrindoCaixa ? 'Abrindo Sessão...' : 'Confirmar Abertura de Caixa'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: SUPRIMENTO (TROCO EXTRA - JUSTIFICATIVA OBRIGATÓRIA)                */}
        {/* ========================================================================= */}
        {modalSuprimento && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className={`rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl ${
              isDark ? 'bg-[#08131A] text-white border-2 border-slate-400' : 'bg-slate-100 text-black border-2 border-slate-300'
            }`}>
              <div className={`flex items-center justify-between border-b pb-3 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold">
                    <ArrowDown className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Suprimento de Caixa (Troco Extra)</h3>
                    <p className={`text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Entrada física de troco na gaveta</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalSuprimento(false)}
                  className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRegistrarSuprimento} className="space-y-4">
                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                    Valor a Adicionar na Gaveta (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ex: 50.00"
                    value={valorSuprimento}
                    onChange={(e) => setValorSuprimento(e.target.value)}
                    className={`w-full rounded-xl px-4 py-2.5 text-xl font-black text-center focus:outline-none transition border-2 ${
                      isDark
                        ? 'bg-[#000000] border-emerald-500 text-emerald-400'
                        : 'bg-emerald-50/50 border-emerald-500 text-emerald-700'
                    }`}
                  />
                </div>

                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                    Justificativa / Motivo da Entrada *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Inserção de moedas para troco matutino"
                    value={motivoSuprimento}
                    onChange={(e) => setMotivoSuprimento(e.target.value)}
                    className={`w-full rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none transition ${
                      isDark
                        ? 'bg-[#000000] border border-slate-700 text-white focus:border-emerald-500'
                        : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                    }`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={processandoSuprimento}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {processandoSuprimento ? 'Registrando...' : 'Confirmar Suprimento'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: SANGRIA (RETIRADA PARA COFRE - JUSTIFICATIVA OBRIGATÓRIA)           */}
        {/* ========================================================================= */}
        {modalSangria && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className={`rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl ${
              isDark ? 'bg-[#08131A] text-white border-2 border-slate-400' : 'bg-slate-100 text-black border-2 border-slate-300'
            }`}>
              <div className={`flex items-center justify-between border-b pb-3 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center font-bold">
                    <ArrowUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Sangria de Caixa (Retirada de Dinheiro)</h3>
                    <p className={`text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Recolhimento de dinheiro da gaveta para o cofre</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalSangria(false)}
                  className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRegistrarSangria} className="space-y-4">
                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                    Valor a Retirar da Gaveta (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ex: 500.00"
                    value={valorSangria}
                    onChange={(e) => setValorSangria(e.target.value)}
                    className={`w-full rounded-xl px-4 py-2.5 text-xl font-black text-center focus:outline-none transition border-2 ${
                      isDark
                        ? 'bg-[#000000] border-rose-500 text-rose-400'
                        : 'bg-rose-50/50 border-rose-500 text-rose-700'
                    }`}
                  />
                </div>

                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                    Justificativa Obrigatória (Destino do Valor) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Recolhimento para o cofre / Depósito bancário"
                    value={motivoSangria}
                    onChange={(e) => setMotivoSangria(e.target.value)}
                    className={`w-full rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none transition ${
                      isDark
                        ? 'bg-[#000000] border border-slate-700 text-white focus:border-emerald-500'
                        : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                    }`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={processandoSangria}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {processandoSangria ? 'Processando...' : 'Confirmar Sangria'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: DESPESA RÁPIDA DE GAVETA (PAGA EM DINHEIRO FÍSICO)                  */}
        {/* ========================================================================= */}
        {modalDespesaRapida && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className={`rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl ${
              isDark ? 'bg-[#08131A] text-white border-2 border-slate-400' : 'bg-slate-100 text-black border-2 border-slate-300'
            }`}>
              <div className={`flex items-center justify-between border-b pb-3 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center font-bold">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Despesa Operacional de Gaveta</h3>
                    <p className={`text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Saída imediata de dinheiro da gaveta</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalDespesaRapida(false)}
                  className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRegistrarDespesaRapida} className="space-y-4">
                <div className={`p-3 rounded-2xl text-xs leading-relaxed border ${
                  isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  ⚠️ O valor informado será debitado imediatamente do dinheiro físico da gaveta do caixa atual.
                </div>

                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                    Valor Pago em Dinheiro (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ex: 25.00"
                    value={valorDespesaRapida}
                    onChange={(e) => setValorDespesaRapida(e.target.value)}
                    className={`w-full rounded-xl px-4 py-2.5 text-xl font-black text-center focus:outline-none transition border-2 ${
                      isDark
                        ? 'bg-[#000000] border-amber-500 text-amber-400'
                        : 'bg-amber-50/50 border-amber-500 text-amber-700'
                    }`}
                  />
                </div>

                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>Categoria</label>
                  <select
                    value={categoriaDespesaRapida}
                    onChange={(e) => setCategoriaDespesaRapida(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 text-xs font-bold focus:outline-none transition cursor-pointer ${
                      isDark
                        ? 'bg-[#000000] border border-slate-700 text-white focus:border-emerald-500'
                        : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                    }`}
                  >
                    <option value="Despesas Operacionais">Despesas Operacionais</option>
                    <option value="Alimentação Funcionários">Alimentação / Lanche</option>
                    <option value="Insumos / Gelo">Insumos de Urgência / Gelo</option>
                    <option value="Limpeza / Descartáveis">Limpeza / Descartáveis</option>
                    <option value="Frete / Motoboy">Frete / Motoboy Avulso</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                    Descrição / Justificativa do Gasto *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Compra de saco de gelo emergencial"
                    value={descricaoDespesaRapida}
                    onChange={(e) => setDescricaoDespesaRapida(e.target.value)}
                    className={`w-full rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none transition ${
                      isDark
                        ? 'bg-[#000000] border border-slate-700 text-white focus:border-emerald-500'
                        : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                    }`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={processandoDespesaRapida}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {processandoDespesaRapida ? 'Lançando...' : 'Confirmar Saída da Gaveta'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: FECHAMENTO CEGO DE CAIXA (CONFERÊNCIA CEGA SEM VALOR ESPERADO)     */}
        {/* ========================================================================= */}
        {modalFechamentoCego && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
            <div className={`rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl my-8 ${
              isDark ? 'bg-[#08131A] text-white border-2 border-slate-400' : 'bg-slate-100 text-black border-2 border-slate-300'
            }`}>
              <div className={`flex items-center justify-between border-b pb-3 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center font-bold">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Fechamento Cego de Caixa</h3>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      Terminal: <strong className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{sessaoAtiva?.terminal_id}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalFechamentoCego(false)}
                  className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleFecharSessaoCega} className="space-y-4">
                <div className={`rounded-2xl p-3.5 text-xs space-y-1 border ${
                  isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  <span className="font-black block">🔒 Conferência e Fechamento de Caixa:</span>
                  <p className="text-[11px] leading-relaxed font-medium">
                    Os valores de <strong>Pix, Cartão e Outros Meios</strong> foram pré-preenchidos automaticamente com base nos lançamentos registrados pelo sistema para facilitar sua conferência com as maquininhas e extratos (editáveis se houver ajuste).
                    O <strong>Dinheiro Físico</strong> deve ser contado na gaveta para apuração de sobra ou quebra.
                  </p>
                </div>

                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                    Dinheiro Físico Contado na Gaveta (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={contagemDinheiro}
                    onChange={(e) => setContagemDinheiro(e.target.value)}
                    className={`w-full rounded-2xl px-4 py-3 text-2xl font-black text-center focus:outline-none transition border-2 ${
                      isDark
                        ? 'bg-[#000000] border-emerald-500 text-emerald-400'
                        : 'bg-white border-2 border-emerald-600 text-emerald-700'
                    }`}
                  />
                  <span className={`text-[10px] block text-center mt-1 font-medium ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                    Soma de todas as cédulas e moedas físicas presentes na gaveta
                  </span>
                </div>

                <div className={`grid grid-cols-2 gap-3 pt-2 border-t ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                  <div>
                    <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>Pix Apurado (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={contagemPix}
                      onChange={(e) => setContagemPix(e.target.value)}
                      className={`w-full rounded-xl px-3 py-2 text-xs font-bold text-center focus:outline-none transition ${
                        isDark
                          ? 'bg-[#000000] border border-slate-700 text-white focus:border-emerald-500'
                          : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>Cartão Débito (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={contagemDebito}
                      onChange={(e) => setContagemDebito(e.target.value)}
                      className={`w-full rounded-xl px-3 py-2 text-xs font-bold text-center focus:outline-none transition ${
                        isDark
                          ? 'bg-[#000000] border border-slate-700 text-white focus:border-emerald-500'
                          : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>Cartão Crédito (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={contagemCredito}
                      onChange={(e) => setContagemCredito(e.target.value)}
                      className={`w-full rounded-xl px-3 py-2 text-xs font-bold text-center focus:outline-none transition ${
                        isDark
                          ? 'bg-[#000000] border border-slate-700 text-white focus:border-emerald-500'
                          : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>Outros Meios (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={contagemOutros}
                      onChange={(e) => setContagemOutros(e.target.value)}
                      className={`w-full rounded-xl px-3 py-2 text-xs font-bold text-center focus:outline-none transition ${
                        isDark
                          ? 'bg-[#000000] border border-slate-700 text-white focus:border-emerald-500'
                          : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>
                    Observações / Justificativas do Fechamento:
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Sangria realizada para o cofre; divergência justificada por troco incorreto."
                    value={observacaoFechamento}
                    onChange={(e) => setObservacaoFechamento(e.target.value)}
                    className={`w-full rounded-xl p-3 text-xs font-bold focus:outline-none resize-none transition ${
                      isDark
                        ? 'bg-[#000000] border border-slate-700 text-white focus:border-emerald-500'
                        : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                    }`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={processandoFechamento}
                  className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-sm shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {processandoFechamento ? 'Apurando e Encerrando...' : 'Concluir Fechamento Cego'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: RELATÓRIO OFICIAL DE FECHAMENTO (APÓS CONFERÊNCIA CEGA)             */}
        {/* ========================================================================= */}
        {modalRelatorioFechamento && relatorioFechamentoResumo && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
            <div className={`rounded-3xl w-full max-w-2xl p-6 space-y-5 shadow-2xl my-8 animate-in zoom-in-95 ${
              isDark ? 'bg-[#08131A] text-white border-2 border-slate-400' : 'bg-slate-100 text-black border-2 border-slate-300'
            }`}>
              <div className={`flex items-center justify-between border-b pb-3 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-bold flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Relatório Oficial de Fechamento de Caixa</h3>
                    <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      Terminal: <strong className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{relatorioFechamentoResumo.sessao.terminal_id}</strong> • Duração: <strong className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{relatorioFechamentoResumo.duracaoTexto}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalRelatorioFechamento(false)}
                  className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* STATUS DA DIFERENÇA APURADA */}
              {(() => {
                const dif = Number(relatorioFechamentoResumo.sessao.diferenca_dinheiro || 0);
                const isExato = Math.abs(dif) < 0.01;
                const isSobra = dif > 0.01;
                return (
                  <div
                    className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
                      isExato
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                        : isSobra
                        ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-500'
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                    }`}
                  >
                    <div>
                      <span className="font-black text-sm block">
                        {isExato ? '✓ Caixa Conciliado com Exatidão' : isSobra ? 'SOBRA DE CAIXA APURADA' : 'FALTA DE CAIXA APURADA'}
                      </span>
                      <span className="text-[11px] opacity-80 font-medium">
                        {isExato
                          ? 'O saldo físico contado confere exatamente com o saldo esperado pelo sistema.'
                          : isSobra
                          ? `Constatado valor físico superior em R$ ${dif.toFixed(2)}.`
                          : `Constatada divergência física negativa em R$ ${Math.abs(dif).toFixed(2)}.`}
                      </span>
                    </div>
                    <span className="text-xl font-black shrink-0">
                      {isExato ? 'R$ 0,00' : `${dif > 0 ? '+' : '-'} R$ ${Math.abs(dif).toFixed(2)}`}
                    </span>
                  </div>
                );
              })()}

              {/* CARDS DE RESUMO DO FECHAMENTO */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={`p-3.5 rounded-2xl border space-y-1 ${
                  isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <span className={`text-[11px] font-bold block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Total Faturado (Vendas)</span>
                  <span className={`text-lg font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                    R$ {relatorioFechamentoResumo.faturamentoTotalVendas.toFixed(2)}
                  </span>
                </div>

                <div className={`p-3.5 rounded-2xl border space-y-1 ${
                  isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <span className={`text-[11px] font-bold block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Esperado em Dinheiro</span>
                  <span className={`text-lg font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                    R$ {relatorioFechamentoResumo.saldoEsperadoDinheiro.toFixed(2)}
                  </span>
                  <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Fundo + Vendas - Saídas</span>
                </div>

                <div className={`p-3.5 rounded-2xl border space-y-1 ${
                  isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <span className={`text-[11px] font-bold block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Contado pelo Operador</span>
                  <span className={`text-lg font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                    R$ {Number(relatorioFechamentoResumo.sessao.saldo_declarado_dinheiro ?? relatorioFechamentoResumo.sessao.saldo_dinheiro_declarado ?? 0).toFixed(2)}
                  </span>
                  <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Valor físico declarado</span>
                </div>
              </div>

              {/* TABELA DE VENDAS POR MEIO DE PAGAMENTO */}
              <div className="space-y-2">
                <span className={`text-xs font-black block ${isDark ? 'text-white' : 'text-black'}`}>Apuração por Meio de Pagamento:</span>
                <div className={`rounded-2xl overflow-hidden text-xs border ${
                  isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <table className="w-full text-left">
                    <thead className={`border-b text-[11px] uppercase font-black ${
                      isDark ? 'bg-[#08131A] text-white border-slate-700' : 'bg-slate-100 text-black border-slate-200'
                    }`}>
                      <tr>
                        <th className="p-2.5">Forma</th>
                        <th className="p-2.5 text-center">Vendas</th>
                        <th className="p-2.5 text-right">Calculado Sistema</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                      <tr className={isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50/75'}>
                        <td className={`p-2.5 font-bold ${isDark ? 'text-white' : 'text-black'}`}>Dinheiro</td>
                        <td className={`p-2.5 text-center ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{relatorioFechamentoResumo.qtdVendasPorMetodo.dinheiro}</td>
                        <td className={`p-2.5 text-right font-black ${isDark ? 'text-white' : 'text-black'}`}>R$ {relatorioFechamentoResumo.totaisPorMetodo.dinheiro.toFixed(2)}</td>
                      </tr>
                      <tr className={isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50/75'}>
                        <td className={`p-2.5 font-bold ${isDark ? 'text-white' : 'text-black'}`}>Pix</td>
                        <td className={`p-2.5 text-center ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{relatorioFechamentoResumo.qtdVendasPorMetodo.pix}</td>
                        <td className={`p-2.5 text-right font-black ${isDark ? 'text-white' : 'text-black'}`}>R$ {relatorioFechamentoResumo.totaisPorMetodo.pix.toFixed(2)}</td>
                      </tr>
                      <tr className={isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50/75'}>
                        <td className={`p-2.5 font-bold ${isDark ? 'text-white' : 'text-black'}`}>Cartão de Débito</td>
                        <td className={`p-2.5 text-center ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{relatorioFechamentoResumo.qtdVendasPorMetodo.cartao_debito}</td>
                        <td className={`p-2.5 text-right font-black ${isDark ? 'text-white' : 'text-black'}`}>R$ {relatorioFechamentoResumo.totaisPorMetodo.cartao_debito.toFixed(2)}</td>
                      </tr>
                      <tr className={isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50/75'}>
                        <td className={`p-2.5 font-bold ${isDark ? 'text-white' : 'text-black'}`}>Cartão de Crédito</td>
                        <td className={`p-2.5 text-center ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{relatorioFechamentoResumo.qtdVendasPorMetodo.cartao_credito}</td>
                        <td className={`p-2.5 text-right font-black ${isDark ? 'text-white' : 'text-black'}`}>R$ {relatorioFechamentoResumo.totaisPorMetodo.cartao_credito.toFixed(2)}</td>
                      </tr>
                      <tr className={isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50/75'}>
                        <td className={`p-2.5 font-bold ${isDark ? 'text-white' : 'text-black'}`}>Outros</td>
                        <td className={`p-2.5 text-center ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{relatorioFechamentoResumo.qtdVendasPorMetodo.outros}</td>
                        <td className={`p-2.5 text-right font-black ${isDark ? 'text-white' : 'text-black'}`}>R$ {relatorioFechamentoResumo.totaisPorMetodo.outros.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* AÇÕES DE COMPARTILHAMENTO E IMPRESSÃO */}
              <div className={`flex items-center justify-between gap-2 pt-2 flex-wrap border-t ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopiarRelatorioTexto(relatorioFechamentoTexto)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                      isDark
                        ? 'bg-[#000000] hover:bg-slate-900 text-white border-slate-700'
                        : 'bg-white hover:bg-slate-100 text-black border-2 border-slate-300'
                    }`}
                  >
                    <Copy className="w-4 h-4 text-emerald-500" />
                    <span>{copiadoRelatorio ? 'Copiado!' : 'Copiar Texto'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleEnviarWhatsappRelatorioTexto(relatorioFechamentoTexto)}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleImprimirRelatorioTexto(relatorioFechamentoResumo)}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-xs"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Imprimir Comprovante</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalRelatorioFechamento(false)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      isDark
                        ? 'bg-[#08131A] hover:bg-slate-900 text-white border-slate-700'
                        : 'bg-slate-100 hover:bg-slate-200 text-black border border-slate-300'
                    }`}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: DRILL-DOWN / AUDITORIA DE SESSÃO PASSADA                            */}
        {/* ========================================================================= */}
        {modalDrillDown && sessaoDrillDown && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
            <div className={`rounded-3xl w-full max-w-3xl p-6 space-y-5 shadow-2xl my-8 ${
              isDark ? 'bg-[#08131A] text-white border-2 border-slate-400' : 'bg-slate-100 text-black border-2 border-slate-300'
            }`}>
              <div className={`flex items-center justify-between border-b pb-3 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold">
                    <Search className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>
                      Auditoria de Sessão (Drill-Down) • Terminal {sessaoDrillDown.terminal_id}
                    </h3>
                    <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      ID da Sessão: <span className={`font-mono font-bold ${isDark ? 'text-white' : 'text-black'}`}>{sessaoDrillDown.id}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalDrillDown(false)}
                  className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {carregandoDrillDown ? (
                <div className={`py-16 text-center text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Carregando auditoria completa...</div>
              ) : resumoDrillDown ? (
                <div className="space-y-4">
                  {/* METADADOS DA SESSÃO */}
                  <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 p-3.5 rounded-2xl border text-xs ${
                    isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                  }`}>
                    <div>
                      <span className={`text-[10px] block font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Abertura</span>
                      <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{new Date(sessaoDrillDown.aberto_em).toLocaleString('pt-BR')}</span>
                    </div>
                    <div>
                      <span className={`text-[10px] block font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Fechamento</span>
                      <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>
                        {sessaoDrillDown.fechado_em ? new Date(sessaoDrillDown.fechado_em).toLocaleString('pt-BR') : 'Em Aberto'}
                      </span>
                    </div>
                    <div>
                      <span className={`text-[10px] block font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Duração Total</span>
                      <span className="font-black text-emerald-500">{resumoDrillDown.duracaoTexto}</span>
                    </div>
                    <div>
                      <span className={`text-[10px] block font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Operador Fechamento</span>
                      <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{sessaoDrillDown.usuario_fechamento?.nome_completo || '—'}</span>
                    </div>
                  </div>

                  {/* CARDS COMPARATIVOS */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className={`border p-3 rounded-2xl ${
                      isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                    }`}>
                      <span className={`text-[10px] block font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Total Faturado</span>
                      <span className={`font-black text-sm block ${isDark ? 'text-white' : 'text-black'}`}>R$ {resumoDrillDown.faturamentoTotalVendas.toFixed(2)}</span>
                    </div>
                    <div className={`border p-3 rounded-2xl ${
                      isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                    }`}>
                      <span className={`text-[10px] block font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Esperado Dinheiro</span>
                      <span className={`font-black text-sm block ${isDark ? 'text-white' : 'text-black'}`}>R$ {resumoDrillDown.saldoEsperadoDinheiro.toFixed(2)}</span>
                    </div>
                    <div className={`border p-3 rounded-2xl ${
                      isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                    }`}>
                      <span className={`text-[10px] block font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Declarado Físico</span>
                      <span className={`font-black text-sm block ${isDark ? 'text-white' : 'text-black'}`}>
                        R$ {Number(sessaoDrillDown.saldo_declarado_dinheiro ?? sessaoDrillDown.saldo_dinheiro_declarado ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <div className={`border p-3 rounded-2xl ${
                      isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                    }`}>
                      <span className={`text-[10px] block font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Diferença Final</span>
                      <span className={`font-black text-sm block ${isDark ? 'text-white' : 'text-black'}`}>
                        {Number(sessaoDrillDown.diferenca_dinheiro || 0) === 0
                          ? 'R$ 0,00'
                          : `R$ ${Number(sessaoDrillDown.diferenca_dinheiro).toFixed(2)}`}
                      </span>
                    </div>
                  </div>

                  {/* PARECER DE AUDITORIA INTELIGENTE DE FECHAMENTO (Jev TypeSafe) */}
                  {sessaoDrillDown.fechado_em && (
                    <CardAuditoriaFechamentoCaixa
                      diferencaDinheiro={Number(sessaoDrillDown.diferenca_dinheiro || 0)}
                      totalEntradas={resumoDrillDown.faturamentoTotalVendas}
                      observacaoFechamento={sessaoDrillDown.observacoes_fechamento}
                      usuarioNome={sessaoDrillDown.usuario_fechamento?.nome_completo}
                    />
                  )}

                  {/* TABELA DE MOVIMENTAÇÕES AUDITADAS */}
                  <div className="space-y-2">
                    <span className={`text-xs font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                      Extrato Completo de Movimentações ({resumoDrillDown.sessao.movimentacoes?.length || 0}):
                    </span>
                    <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                      {!resumoDrillDown.sessao.movimentacoes || resumoDrillDown.sessao.movimentacoes.length === 0 ? (
                        <p className={`text-xs text-center py-4 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Nenhuma movimentação detalhada.</p>
                      ) : (
                        resumoDrillDown.sessao.movimentacoes.map(m => (
                          <div
                            key={m.id}
                            className={`p-2.5 rounded-xl border flex justify-between items-center text-xs ${
                              isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border border-slate-200'
                            }`}
                          >
                            <div>
                              <span className={`font-bold block ${isDark ? 'text-white' : 'text-black'}`}>{m.descricao}</span>
                              <div className={`flex items-center gap-2 text-[10px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                <span className="uppercase font-bold">{m.tipo}</span>
                                <span>•</span>
                                <span>{m.metodo_pagamento}</span>
                                <span>•</span>
                                <span>{new Date(m.criado_em).toLocaleTimeString('pt-BR')}</span>
                              </div>
                            </div>
                            <span className={`font-black ${
                              m.tipo === 'SANGRIA' || m.tipo === 'DESPESA' ? 'text-rose-500' : (isDark ? 'text-white' : 'text-black')
                            }`}>
                              {m.tipo === 'SANGRIA' || m.tipo === 'DESPESA' ? '-' : '+'} R$ {Number(m.valor).toFixed(2)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className={`flex items-center justify-between gap-2 pt-2 border-t ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                {sessaoDrillDown.fechado_em ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (resumoDrillDown) {
                        PrintService.printFechamentoCaixa({ ...resumoDrillDown, sessao: sessaoDrillDown }, loja);
                      }
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs rounded-xl flex items-center gap-2 transition cursor-pointer shadow-xs"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Imprimir Comprovante</span>
                  </button>
                ) : <div />}
                <button
                  type="button"
                  onClick={() => setModalDrillDown(false)}
                  className={`px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ml-auto border ${
                    isDark
                      ? 'bg-[#08131A] hover:bg-slate-900 text-white border-slate-700'
                      : 'bg-slate-100 hover:bg-slate-200 text-black border border-slate-300'
                  }`}
                >
                  Fechar Auditoria
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: RELATÓRIO CONSOLIDADO DE MEIOS DE PAGAMENTO (CONCILIAÇÃO BANCÁRIA)  */}
        {/* ========================================================================= */}
        {modalRelatorioConsolidado && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
            <div className={`rounded-3xl w-full max-w-2xl p-6 space-y-5 shadow-2xl my-8 ${
              isDark ? 'bg-[#08131A] text-white border-2 border-slate-400' : 'bg-slate-100 text-black border-2 border-slate-300'
            }`}>
              <div className={`flex items-center justify-between border-b pb-3 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-bold flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Relatório Consolidado de Meios de Pagamento</h3>
                    <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Conciliação com Extratos Bancários e Maquininhas</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalRelatorioConsolidado(false)}
                  className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* SELEÇÃO DO PERÍODO */}
              <div className={`grid grid-cols-2 gap-3 p-3.5 rounded-2xl border ${
                isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
              }`}>
                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>Data Início</label>
                  <input
                    type="date"
                    value={periodoRelatorioInicio}
                    onChange={(e) => setPeriodoRelatorioInicio(e.target.value)}
                    className={`w-full rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none transition ${
                      isDark
                        ? 'bg-[#08131A] border border-slate-700 text-white focus:border-emerald-500'
                        : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                    }`}
                  />
                </div>
                <div>
                  <label className={`text-xs font-black block mb-1 ${isDark ? 'text-white' : 'text-black'}`}>Data Fim</label>
                  <input
                    type="date"
                    value={periodoRelatorioFim}
                    onChange={(e) => setPeriodoRelatorioFim(e.target.value)}
                    className={`w-full rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none transition ${
                      isDark
                        ? 'bg-[#08131A] border border-slate-700 text-white focus:border-emerald-500'
                        : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-600'
                    }`}
                  />
                </div>
              </div>

              {/* CARDS COM TOTAIS CONSOLIDADOS */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className={`p-3.5 rounded-2xl border space-y-1 ${
                  isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <span className={`text-xs font-bold block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Dinheiro Físico</span>
                  <span className="text-base font-black text-emerald-500 block">
                    R$ {dadosRelatorioConsolidado.dinheiro.toFixed(2)}
                  </span>
                </div>
                <div className={`p-3.5 rounded-2xl border space-y-1 ${
                  isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <span className={`text-xs font-bold block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Pix Bancário</span>
                  <span className="text-base font-black text-cyan-500 block">
                    R$ {dadosRelatorioConsolidado.pix.toFixed(2)}
                  </span>
                </div>
                <div className={`p-3.5 rounded-2xl border space-y-1 ${
                  isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <span className={`text-xs font-bold block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Cartão Débito</span>
                  <span className="text-base font-black text-blue-500 block">
                    R$ {dadosRelatorioConsolidado.debito.toFixed(2)}
                  </span>
                </div>
                <div className={`p-3.5 rounded-2xl border space-y-1 ${
                  isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <span className={`text-xs font-bold block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Cartão Crédito</span>
                  <span className="text-base font-black text-purple-500 block">
                    R$ {dadosRelatorioConsolidado.credito.toFixed(2)}
                  </span>
                </div>
                <div className={`p-3.5 rounded-2xl border space-y-1 ${
                  isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <span className={`text-xs font-bold block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Outros / Convênio</span>
                  <span className="text-base font-black text-amber-500 block">
                    R$ {dadosRelatorioConsolidado.outros.toFixed(2)}
                  </span>
                </div>
                <div className={`p-3.5 rounded-2xl border space-y-1 ${
                  isDark ? 'bg-emerald-950/40 border-emerald-800/60' : 'bg-emerald-50 border-2 border-emerald-200'
                }`}>
                  <span className="text-xs text-emerald-500 font-bold block">Total Consolidado</span>
                  <span className="text-lg font-black text-emerald-500 block">
                    R$ {dadosRelatorioConsolidado.totalBruto.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className={`flex justify-end gap-2 pt-2 border-t ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => {
                    const texto = `RELATÓRIO CONSOLIDADO DE MEIOS DE PAGAMENTO\nPeríodo: ${periodoRelatorioInicio} até ${periodoRelatorioFim}\n\nDinheiro: R$ ${dadosRelatorioConsolidado.dinheiro.toFixed(2)}\nPix: R$ ${dadosRelatorioConsolidado.pix.toFixed(2)}\nCartão Débito: R$ ${dadosRelatorioConsolidado.debito.toFixed(2)}\nCartão Crédito: R$ ${dadosRelatorioConsolidado.credito.toFixed(2)}\nOutros: R$ ${dadosRelatorioConsolidado.outros.toFixed(2)}\n\nTOTAL FATURADO: R$ ${dadosRelatorioConsolidado.totalBruto.toFixed(2)}`;
                    handleCopiarRelatorioTexto(texto);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-black text-xs rounded-xl cursor-pointer shadow-xs transition"
                >
                  Copiar Relatório
                </button>
                <button
                  type="button"
                  onClick={() => setModalRelatorioConsolidado(false)}
                  className={`px-4 py-2 text-xs font-bold rounded-xl cursor-pointer transition border ${
                    isDark
                      ? 'bg-[#08131A] hover:bg-slate-900 text-white border-slate-700'
                      : 'bg-slate-100 hover:bg-slate-200 text-black border border-slate-300'
                  }`}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: RELATÓRIO DE SANGRIAS E DESPESAS DE GAVETA                          */}
        {/* ========================================================================= */}
        {modalRelatorioSangriasDespesas && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
            <div className={`rounded-3xl w-full max-w-3xl p-6 space-y-5 shadow-2xl my-8 ${
              isDark ? 'bg-[#08131A] text-white border-2 border-slate-400' : 'bg-slate-100 text-black border-2 border-slate-300'
            }`}>
              <div className={`flex items-center justify-between border-b pb-3 ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 font-bold flex items-center justify-center">
                    <SlidersHorizontal className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Relatório de Sangrias & Despesas de Gaveta</h3>
                    <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Auditoria de saídas e retiradas operacionais</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalRelatorioSangriasDespesas(false)}
                  className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* PERÍODO E TOTAIS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={`p-3.5 rounded-2xl border space-y-1 ${
                  isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <span className={`text-[11px] font-bold block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Total de Sangrias (Cofre)</span>
                  <span className="text-lg font-black text-rose-500 block">
                    R$ {dadosRelatorioSangriasDespesas.totalSangrias.toFixed(2)}
                  </span>
                </div>
                <div className={`p-3.5 rounded-2xl border space-y-1 ${
                  isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <span className={`text-[11px] font-bold block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Total Despesas da Gaveta</span>
                  <span className="text-lg font-black text-amber-500 block">
                    R$ {dadosRelatorioSangriasDespesas.totalDespesas.toFixed(2)}
                  </span>
                </div>
                <div className={`p-3.5 rounded-2xl border space-y-1 ${
                  isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <span className={`text-[11px] font-bold block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Total Geral de Saídas</span>
                  <span className={`text-lg font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                    R$ {dadosRelatorioSangriasDespesas.totalGeral.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* TABELA DE REGISTROS */}
              <div className="space-y-2">
                <span className={`text-xs font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                  Lançamentos de Saída ({dadosRelatorioSangriasDespesas.itens.length}):
                </span>
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {dadosRelatorioSangriasDespesas.itens.length === 0 ? (
                    <p className={`text-xs py-6 text-center font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Nenhuma sangria ou despesa no período.</p>
                  ) : (
                    dadosRelatorioSangriasDespesas.itens.map(item => (
                      <div
                        key={item.id}
                        className={`p-3 rounded-2xl border flex items-center justify-between text-xs ${
                          isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                                item.tipo === 'SANGRIA'
                                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                  : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                              }`}
                            >
                              {item.tipo}
                            </span>
                            <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{item.descricao}</span>
                          </div>
                          <div className={`flex items-center gap-2 text-[10px] mt-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            <span>Terminal: {item.terminal}</span>
                            <span>•</span>
                            <span>{new Date(item.data).toLocaleString('pt-BR')}</span>
                            <span>•</span>
                            <span>Resp: {item.operador}</span>
                          </div>
                        </div>
                        <span className="font-black text-sm text-rose-500 shrink-0">
                          - R$ {item.valor.toFixed(2)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className={`flex justify-end gap-2 pt-2 border-t ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => setModalRelatorioSangriasDespesas(false)}
                  className={`px-4 py-2 text-xs font-bold rounded-xl cursor-pointer transition border ${
                    isDark
                      ? 'bg-[#08131A] hover:bg-slate-900 text-white border-slate-700'
                      : 'bg-slate-100 hover:bg-slate-200 text-black border border-slate-300'
                  }`}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: DETALHAMENTO DE MÉTRICAS FINANCEIRAS GERAIS                        */}
        {/* ========================================================================= */}
        {modalDetalhesMetrica && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
            <div
              className={`rounded-3xl w-full max-w-xl p-6 space-y-4 shadow-2xl my-8 animate-in zoom-in-95 duration-150 ${
                isDark
                  ? 'bg-[#08131A] text-white border-2 border-slate-400'
                  : 'bg-slate-100 text-black border-2 border-slate-300'
              }`}
            >
              <div
                className={`flex items-center justify-between border-b pb-3 ${
                  isDark ? 'border-slate-700' : 'border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center border font-bold ${
                      isDark
                        ? 'bg-[#000000] border-slate-700 text-white'
                        : 'bg-white border-2 border-slate-300 text-black'
                    }`}
                  >
                    <Info className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>
                      {modalDetalhesMetrica === 'entradas' && 'Detalhamento de Entradas (Receitas)'}
                      {modalDetalhesMetrica === 'saidas' && 'Detalhamento de Despesas'}
                      {modalDetalhesMetrica === 'pagar' && 'Detalhamento de Contas a Pagar'}
                      {modalDetalhesMetrica === 'lucro' && 'Resultado Acumulado'}
                    </h3>
                    <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      Composição detalhada dos valores apurados
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalDetalhesMetrica(null)}
                  className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {modalDetalhesMetrica === 'entradas' && (
                  <div className="space-y-3">
                    <div
                      className={`p-4 rounded-2xl border flex justify-between items-center gap-3 ${
                        isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                      }`}
                    >
                      <div>
                        <span className={`text-xs font-bold block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          Total de Entradas Recebidas:
                        </span>
                        <span className={`text-xl font-black ${isDark ? 'text-white' : 'text-black'}`}>
                          R$ {totalReceitas.toFixed(2)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleExportarEntradas}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5 border border-emerald-500 transition cursor-pointer shadow-xs"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Exportar Excel</span>
                      </button>
                    </div>
                    <div className="space-y-2">
                      <span className={`text-xs font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                        Últimas Transações de Entrada:
                      </span>
                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                        {listaTransacoesUnificada.filter(t => t.tipo === 'ENTRADA').slice(0, 20).map((t) => (
                          <div
                            key={t.id}
                            className={`p-2.5 rounded-xl border flex justify-between items-center text-xs shadow-2xs ${
                              isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                            }`}
                          >
                            <div>
                              <span className={`font-black block truncate ${isDark ? 'text-white' : 'text-black'}`}>
                                {t.descricao}
                              </span>
                              <span className={`text-[10px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                {t.categoria} • {new Date(t.data).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <span className="font-black text-emerald-500 text-xs shrink-0">
                              + R$ {t.valor.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {modalDetalhesMetrica === 'saidas' && (
                  <div className="space-y-3">
                    <div
                      className={`p-4 rounded-2xl border flex justify-between items-center gap-3 ${
                        isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                      }`}
                    >
                      <div>
                        <span className={`text-xs font-bold block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          Total de Despesas:
                        </span>
                        <span className={`text-xl font-black ${isDark ? 'text-white' : 'text-black'}`}>
                          R$ {totalDespesasPagas.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleExportarDespesas}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5 border border-emerald-500 transition cursor-pointer shadow-xs"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>Exportar Excel</span>
                        </button>
                        {permissions.ehAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setModalDetalhesMetrica(null);
                              abrirModalNovaDespesa();
                            }}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1 border border-emerald-500 shadow-xs transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Nova Despesa</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className={`text-xs font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                        Últimas Despesas Registradas:
                      </span>
                      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                        {listaTransacoesUnificada.filter(t => t.tipo === 'SAIDA' && t.status === 'pago').slice(0, 25).map((t) => {
                          const descLimpa = t.descricao.replace(/\s*\(entrada manual\)/gi, '').trim();
                          return (
                            <div
                              key={t.id}
                              className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs shadow-2xs ${
                                isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <span className={`font-black block truncate leading-tight ${isDark ? 'text-white' : 'text-black'}`}>
                                  {descLimpa}
                                </span>
                                <span className={`text-[10px] block mt-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                  {t.categoria} • {new Date(t.data).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-black text-rose-500 text-xs block">
                                  - R$ {t.valor.toFixed(2)}
                                </span>
                                {permissions.ehAdmin && !t.id.startsWith('ped_') && (
                                  <div className={`flex items-center gap-1 pl-2 border-l ${isDark ? 'border-slate-700' : 'border-slate-300'}`}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setModalDetalhesMetrica(null);
                                        abrirModalEditarTransacao(t);
                                      }}
                                      className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                                      title="Editar Despesa"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setModalDetalhesMetrica(null);
                                        setModalConfirmarExclusao({ aberta: true, transacao: t, processando: false });
                                      }}
                                      className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer"
                                      title="Excluir Despesa"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {modalDetalhesMetrica === 'pagar' && (
                  <div className="space-y-3">
                    <div
                      className={`p-4 rounded-2xl border flex justify-between items-center gap-3 ${
                        isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                      }`}
                    >
                      <div>
                        <span className={`text-xs font-bold block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          Total de Contas Pendentes a Pagar:
                        </span>
                        <span className={`text-xl font-black ${isDark ? 'text-white' : 'text-black'}`}>
                          R$ {totalDespesasPendentes.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleExportarContasPagar}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5 border border-emerald-500 transition cursor-pointer shadow-xs"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>Exportar Excel</span>
                        </button>
                        {permissions.ehAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setModalDetalhesMetrica(null);
                              abrirModalNovaContaPagar();
                            }}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1 border border-emerald-500 shadow-xs transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Nova Conta</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className={`text-xs font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                        Lista de Contas a Pagar ({listaTransacoesUnificada.filter(t => t.tipo === 'SAIDA' && t.status === 'pendente').length}):
                      </span>
                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                        {listaTransacoesUnificada.filter(t => t.tipo === 'SAIDA' && t.status === 'pendente').map((t) => (
                          <div
                            key={t.id}
                            className={`p-2.5 rounded-xl border flex justify-between items-center text-xs shadow-2xs ${
                              isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                            }`}
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <span className={`font-black block truncate ${isDark ? 'text-white' : 'text-black'}`}>
                                {t.descricao}
                              </span>
                              <span className={`text-[10px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                Vencimento: {new Date(t.data).toLocaleDateString('pt-BR')} • {t.categoria}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`font-black text-xs ${isDark ? 'text-white' : 'text-black'}`}>
                                R$ {t.valor.toFixed(2)}
                              </span>
                              {permissions.ehAdmin && (
                                <div className={`flex items-center gap-1 pl-2 border-l ${isDark ? 'border-slate-700' : 'border-slate-300'}`}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setModalDetalhesMetrica(null);
                                      setModalBaixarConta({
                                        aberta: true,
                                        transacao: t,
                                        formaPagamento: t.formaPagamento || 'dinheiro',
                                        dataPagamento: obterDataOperacaoYMD(),
                                        processando: false
                                      });
                                    }}
                                    className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] flex items-center gap-0.5 cursor-pointer shadow-xs border border-emerald-500"
                                    title="Pagar / Baixar Conta"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Pagar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setModalDetalhesMetrica(null);
                                      abrirModalEditarTransacao(t);
                                    }}
                                    className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                                    title="Editar Conta"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setModalDetalhesMetrica(null);
                                      setModalConfirmarExclusao({ aberta: true, transacao: t, processando: false });
                                    }}
                                    className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer"
                                    title="Excluir Conta"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {modalDetalhesMetrica === 'lucro' && (
                  <div className="space-y-3">
                    <div
                      className={`p-4 rounded-2xl border space-y-2.5 text-xs ${
                        isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                      }`}
                    >
                      <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        <span className="flex items-center gap-1.5 font-bold">
                          <ArrowUpRight className="w-4 h-4 text-emerald-500" /> (+) Entradas / Receitas Totais:
                        </span>
                        <span className="font-black text-emerald-500 text-sm">+ R$ {totalReceitas.toFixed(2)}</span>
                      </div>

                      <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        <span className="flex items-center gap-1.5 font-bold">
                          <ArrowDownRight className="w-4 h-4 text-rose-500" /> (-) Saídas / Despesas Pagas:
                        </span>
                        <span className="font-black text-rose-500 text-sm">- R$ {totalDespesasPagas.toFixed(2)}</span>
                      </div>

                      <div className={`pt-2 border-t flex justify-between items-center ${isDark ? 'border-slate-700' : 'border-slate-300'}`}>
                        <span className={`font-black text-sm ${isDark ? 'text-white' : 'text-black'}`}>(=) Resultado Acumulado em Caixa:</span>
                        <span className={`text-lg font-black ${lucroLiquido >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          R$ {lucroLiquido.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-2xl border text-[11px] leading-relaxed ${
                        isDark
                          ? 'bg-[#08131A] border-slate-700 text-slate-300'
                          : 'bg-slate-50 border-2 border-slate-200 text-slate-700'
                      }`}
                    >
                      💡 O resultado acumulado considera o fluxo financeiro efetivamente realizado (dinheiro que entrou menos o dinheiro que já foi pago). Contas pendentes a pagar de R$ {totalDespesasPendentes.toFixed(2)} ainda não foram debitadas.
                    </div>
                  </div>
                )}
              </div>

              <div className={`p-2 border-t flex justify-end ${isDark ? 'border-slate-700' : 'border-slate-300'}`}>
                <button
                  type="button"
                  onClick={() => setModalDetalhesMetrica(null)}
                  className={`px-5 py-2 rounded-xl text-xs font-black transition cursor-pointer border ${
                    isDark
                      ? 'bg-[#08131A] hover:bg-slate-900 text-white border-slate-700'
                      : 'bg-slate-100 hover:bg-slate-200 text-black border-2 border-slate-300'
                  }`}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};


