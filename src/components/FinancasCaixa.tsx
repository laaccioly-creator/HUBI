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
  ShoppingCart
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
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
import { FinancasMobile } from './FinancasMobile';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { obterDataOperacaoISO, obterDataOperacaoYMD } from '../utils/dataOperacao';

export const FinancasCaixa: React.FC = () => {
  const { loja, usuario } = useAuth();
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

  // Modais de Operação Geral (DRE / Nova Despesa Plano de Contas)
  const [modalNovaDespesa, setModalNovaDespesa] = useState<boolean>(false);
  const [descricao, setDescricao] = useState<string>('');
  const [categoria, setCategoria] = useState<string>('Fornecedor');
  const [valor, setValor] = useState<string>('');
  const [dataVencimento, setDataVencimento] = useState<string>(obterDataOperacaoYMD());
  const [ehRecorrente, setEhRecorrente] = useState<boolean>(false);
  const [formaPagamentoDespesa, setFormaPagamentoDespesa] = useState<string>('dinheiro');
  const [salvandoDespesa, setSalvandoDespesa] = useState<boolean>(false);

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
        .select('*, cliente:clientes(*), vendedor:usuarios_loja(*), pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*))')
        .eq('loja_id', loja.id)
        .order('criado_em', { ascending: false });

      if (pedData) setPedidos(pedData as unknown as Pedido[]);

      // 3. Carregar Sessão Ativa de Caixa do Terminal (Ciclo Transacional Independente de Meia-Noite)
      try {
        const sessao = await caixaService.obterSessaoAtiva(loja.id, terminalId);
        setSessaoAtiva(sessao);
        if (sessao) {
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

  // 1. Cadastrar Nova Despesa Manual no DRE / Fluxo Geral
  const handleCadastrarDespesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.ehAdmin) {
      mostrarAviso('Permissão restrita. Apenas usuários Proprietários (Owner) ou Administradores (Admin) podem lançar despesas.', 'Acesso Restrito');
      return;
    }
    if (!loja?.id || !descricao.trim() || !valor || salvandoDespesa) return;

    try {
      setSalvandoDespesa(true);
      const valNum = Number(valor);
      const { data, error } = await supabase.from('transacoes_financeiras').insert([
        {
          loja_id: loja.id,
          tipo: 'SAIDA',
          categoria,
          descricao,
          valor: valNum,
          data_vencimento: dataVencimento,
          status: 'pago',
          eh_recorrente: ehRecorrente,
          frequencia_recorrencia: ehRecorrente ? 'mensal' : null,
          forma_pagamento: formaPagamentoDespesa
        }
      ]).select().single();

      if (error) throw error;
      if (data) setTransacoes(prev => [data, ...prev]);

      // Se paga em dinheiro físico e houver sessão de caixa aberta, registrar como despesa da gaveta
      if (formaPagamentoDespesa === 'dinheiro' && sessaoAtiva && usuario?.id) {
        try {
          await caixaService.registrarMovimentacao({
            lojaId: loja.id,
            sessaoId: sessaoAtiva.id,
            tipo: 'DESPESA',
            metodoPagamento: 'DINHEIRO',
            valor: valNum,
            descricao: `Despesa Gaveta: ${descricao} (${categoria})`,
            usuarioId: usuario.id
          });
          const res = await caixaService.obterResumoSessao(sessaoAtiva.id);
          setResumoSessao(res);
        } catch (errMov) {
          console.warn('Aviso ao registrar despesa na sessão de caixa:', errMov);
        }
      }

      setModalNovaDespesa(false);
      setDescricao('');
      setValor('');
      mostrarSucesso('Despesa lançada com sucesso!');
    } catch (err: any) {
      mostrarErro(err.message || 'Tente novamente.', 'Erro ao lançar despesa');
    } finally {
      setSalvandoDespesa(false);
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

  const handleImprimirRelatorioTexto = (texto: string) => {
    const janelaImpressao = window.open('', '_blank');
    if (!janelaImpressao) return;
    janelaImpressao.document.write(`
      <html>
        <head>
          <title>Comprovante de Fechamento de Caixa</title>
          <style>
            body { font-family: monospace; font-size: 12px; padding: 20px; white-space: pre-wrap; line-height: 1.4; color: #000; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>${texto.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body>
      </html>
    `);
    janelaImpressao.document.close();
    janelaImpressao.focus();
    setTimeout(() => {
      janelaImpressao.print();
      janelaImpressao.close();
    }, 250);
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

    // Conjuntos para controle de duplicações estritas
    const pedidosContabilizados = new Set<string>();
    const transacoesIdsContabilizados = new Set<string>();

    // 1. Processar primeiro todos os pedidos válidos (Fonte de verdade oficial para VENDAS)
    pedidos.forEach(p => {
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

    // 2. Processar todas as transações financeiras reais da tabela transacoes_financeiras
    transacoes.forEach(t => {
      // Evitar duplicatas de ID na tabela de transações
      if (t.id && transacoesIdsContabilizados.has(t.id)) return;
      if (t.id) transacoesIdsContabilizados.add(t.id);

      const tipo = String(t.tipo || '').toUpperCase() === 'SAIDA' || String(t.tipo || '').toLowerCase() === 'despesa'
        ? 'SAIDA'
        : 'ENTRADA';

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
          formaPagamento: t.forma_pagamento || undefined
        });
        return;
      }

      // SE FOR ENTRADA:
      const vinculo = identificarPedidoDaTransacao(t);

      // Se a transação pertence a uma venda/pedido:
      if (vinculo.pertence) {
        // Se encontramos o pedido correspondente:
        if (vinculo.pedido) {
          const ped = vinculo.pedido;
          // Se o pedido está cancelado, pendente ou aguardando pagamento, IGNORAMOS a transação
          if (
            ped.status === 'cancelado' ||
            ped.status === 'pendente' ||
            ped.status_pagamento === 'aguardando_pagamento'
          ) {
            return;
          }
          // Se o pedido já foi contabilizado, IGNORAMOS a transação redundante
          // para não duplicar o registro com a listagem oficial de pedidos
          if (
            pedidosContabilizados.has(ped.id.toLowerCase()) ||
            (ped.numero_pedido != null && pedidosContabilizados.has(String(ped.numero_pedido)))
          ) {
            return;
          }
        }

        // Se a transação tem um pedido_id já contabilizado:
        if (t.pedido_id && pedidosContabilizados.has(t.pedido_id.toLowerCase())) {
          return;
        }

        // Se a chave identificada já foi contabilizada:
        if (vinculo.chave && pedidosContabilizados.has(vinculo.chave.toLowerCase())) {
          return;
        }

        // Se for uma entrada de venda que NÃO estava na lista de pedidos (fallback de integridade):
        // Garantimos que não adicionamos a mesma venda mais de uma vez
        const chavePedido = vinculo.chave || t.pedido_id || t.descricao;
        if (pedidosContabilizados.has(chavePedido.toLowerCase())) {
          return;
        }
        pedidosContabilizados.add(chavePedido.toLowerCase());

        let descFormatada = t.descricao || 'Recebimento Venda';
        if (vinculo.pedido) {
          const ped = vinculo.pedido;
          const nomeCli = ped.cliente?.nome || 'Cliente Balcão';
          descFormatada = `Recebimento Venda #${ped.numero_pedido || ped.id.slice(0, 6)} - ${nomeCli}`;
        } else {
          descFormatada = descFormatada.replace(/recebimento pedido #/gi, 'Recebimento Venda #');
        }

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
  }, [pedidos, transacoes]);

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

  // Dados para Relatório Consolidado de Meios de Pagamento
  const dadosRelatorioConsolidado = useMemo(() => {
    const sessoesNoPeriodo = [
      ...historicoSessoes,
      ...(sessaoAtiva ? [sessaoAtiva] : [])
    ].filter(s => {
      if (!periodoRelatorioInicio && !periodoRelatorioFim) return true;
      const dataS = s.aberto_em.split('T')[0];
      if (periodoRelatorioInicio && dataS < periodoRelatorioInicio) return false;
      if (periodoRelatorioFim && dataS > periodoRelatorioFim) return false;
      return true;
    });

    let dinheiro = 0;
    let pix = 0;
    let debito = 0;
    let credito = 0;
    let outros = 0;
    let totalBruto = 0;

    sessoesNoPeriodo.forEach(s => {
      let vDinheiro = Number(s.total_vendas_dinheiro || 0);
      let vPix = Number(s.total_vendas_pix || 0);
      let vDebito = Number(s.total_vendas_debito || 0);
      let vCredito = Number(s.total_vendas_credito || 0);
      let vOutros = Number(s.total_vendas_outros || 0);

      // Se não possui totais calculados mas possui movimentações detalhadas
      if (vDinheiro === 0 && vPix === 0 && vDebito === 0 && vCredito === 0 && vOutros === 0 && s.movimentacoes && s.movimentacoes.length > 0) {
        s.movimentacoes.forEach(m => {
          if (m.tipo === 'VENDA') {
            const val = Number(m.valor || 0);
            if (m.metodo_pagamento === 'DINHEIRO') vDinheiro += val;
            else if (m.metodo_pagamento === 'PIX') vPix += val;
            else if (m.metodo_pagamento === 'CARTAO_DEBITO') vDebito += val;
            else if (m.metodo_pagamento === 'CARTAO_CREDITO') vCredito += val;
            else vOutros += val;
          }
        });
      }

      dinheiro += vDinheiro;
      pix += vPix;
      debito += vDebito;
      credito += vCredito;
      outros += vOutros;
      totalBruto += Number(s.faturamento_total || (vDinheiro + vPix + vDebito + vCredito + vOutros) || 0);
    });

    // Fallback de reconciliação analítica:
    // Se o total bruto apurou vendas (ex: R$ 330.21) mas o detalhamento individual está zerado
    // (ex: sessão fechada antes da indexação de movimentações), cruza com os pedidos pagos no período
    if (totalBruto > 0 && dinheiro === 0 && pix === 0 && debito === 0 && credito === 0 && outros === 0) {
      (pedidos || []).forEach(p => {
        if (p.status === 'cancelado' || p.status === 'pendente') return;
        const dataP = (p.data_venda || p.criado_em || '').split('T')[0];
        if (periodoRelatorioInicio && dataP < periodoRelatorioInicio) return;
        if (periodoRelatorioFim && dataP > periodoRelatorioFim) return;

        if (p.pagamentos && p.pagamentos.length > 0) {
          p.pagamentos.forEach(pag => {
            const val = Number(pag.valor || 0);
            const tipoFp = (pag.forma_pagamento?.tipo || '').toLowerCase();
            const nomeFp = (pag.forma_pagamento?.nome || '').toLowerCase();

            if (tipoFp === 'dinheiro' || nomeFp.includes('dinheiro')) dinheiro += val;
            else if (tipoFp === 'pix' || nomeFp.includes('pix')) pix += val;
            else if (tipoFp === 'cartao_debito' || nomeFp.includes('débito') || nomeFp.includes('debito')) debito += val;
            else if (tipoFp === 'cartao_credito' || nomeFp.includes('crédito') || nomeFp.includes('credito')) credito += val;
            else outros += val;
          });
        } else {
          dinheiro += Number(p.valor_pago || p.valor_total || 0);
        }
      });
    }

    return {
      quantidadeSessoes: sessoesNoPeriodo.length,
      dinheiro,
      pix,
      debito,
      credito,
      outros,
      totalBruto
    };
  }, [historicoSessoes, sessaoAtiva, periodoRelatorioInicio, periodoRelatorioFim, pedidos]);

  // Dados para Relatório de Sangrias e Despesas
  const dadosRelatorioSangriasDespesas = useMemo(() => {
    const sessoesNoPeriodo = [
      ...historicoSessoes,
      ...(sessaoAtiva ? [sessaoAtiva] : [])
    ].filter(s => {
      if (!periodoRelatorioInicio && !periodoRelatorioFim) return true;
      const dataS = s.aberto_em.split('T')[0];
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
  }, [historicoSessoes, sessaoAtiva, periodoRelatorioInicio, periodoRelatorioFim]);

  return (
    <div className="h-full w-full overflow-hidden bg-slate-950 text-slate-100">
      {/* 1. VISUALIZAÇÃO MOBILE EXCLUSIVA (TELAS 001 A 029) */}
      <div className="block lg:hidden h-full overflow-hidden">
        <FinancasMobile
          transacoes={transacoes}
          pedidos={pedidos}
          caixaAberto={null}
          carregando={carregando}
          onRecarregar={carregarFinanceiro}
          onAbrirCaixa={() => setModalAberturaCaixa(true)}
          onSangria={() => setModalSangria(true)}
          onSuprimento={() => setModalSuprimento(true)}
          onFechamentoCego={() => setModalFechamentoCego(true)}
          saldoEsperadoGaveta={resumoSessao?.saldoEsperadoDinheiro || 0}
        />
      </div>

      {/* 2. VISUALIZAÇÃO DESKTOP */}
      <div className="hidden lg:flex flex-col h-full overflow-hidden bg-slate-950 font-sans">
        {/* ========================================================================= */}
        {/* HEADER SUPERIOR                                                           */}
        {/* ========================================================================= */}
        <div className="p-4 md:p-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur space-y-4 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                  <span>Controle de Caixa & Sessões Transacionais</span>
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
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
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                        title="Adicionar Troco Extra na Gaveta"
                      >
                        <ArrowDown className="w-4 h-4 text-emerald-400" />
                        <span>Suprimento</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setModalSangria(true)}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-rose-400 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                        title="Retirar Dinheiro para o Cofre"
                      >
                        <ArrowUp className="w-4 h-4 text-rose-400" />
                        <span>Sangria</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setModalDespesaRapida(true)}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                        title="Despesa Paga com Dinheiro da Gaveta"
                      >
                        <Banknote className="w-4 h-4 text-amber-400" />
                        <span>Despesa Gaveta</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setModalFechamentoCego(true)}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Fechar Caixa</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setModalAberturaCaixa(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Abrir Caixa</span>
                </button>
              )}

              {permissions.ehAdmin && (
                <button
                  type="button"
                  onClick={() => setModalNovaDespesa(true)}
                  className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs shadow-lg shadow-rose-500/25 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nova Despesa (DRE)</span>
                </button>
              )}
            </div>
          </div>

          {/* CARDS DE RESUMO FINANCEIRO GERAL COM BOTÃO DETALHAR */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {/* Entradas Totais */}
            <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3 space-y-1.5 shadow-sm transition">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 flex items-center gap-1 font-semibold">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> Entradas Gerais
                </span>
                <button
                  type="button"
                  onClick={() => setModalDetalhesMetrica('entradas')}
                  className="px-2 py-0.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold transition cursor-pointer border border-emerald-500/20"
                >
                  Detalhar
                </button>
              </div>
              <span className="text-base font-black text-emerald-400 block truncate">R$ {totalReceitas.toFixed(2)}</span>
            </div>

            {/* Despesas */}
            <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3 space-y-1.5 shadow-sm transition">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 flex items-center gap-1 font-semibold">
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" /> Despesas Gerais
                </span>
                <button
                  type="button"
                  onClick={() => setModalDetalhesMetrica('saidas')}
                  className="px-2 py-0.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-bold transition cursor-pointer border border-rose-500/20"
                >
                  Detalhar
                </button>
              </div>
              <span className="text-base font-black text-rose-400 block truncate">R$ {totalDespesasPagas.toFixed(2)}</span>
            </div>

            {/* Contas a Pagar */}
            <div className="bg-slate-900/90 border border-amber-500/30 hover:border-amber-500/50 rounded-2xl p-3 space-y-1.5 shadow-sm transition">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-amber-400 flex items-center gap-1 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" /> A Pagar
                </span>
                <button
                  type="button"
                  onClick={() => setModalDetalhesMetrica('pagar')}
                  className="px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[10px] font-bold transition cursor-pointer border border-amber-500/20"
                >
                  Detalhar
                </button>
              </div>
              <span className="text-base font-black text-amber-400 block truncate">R$ {totalDespesasPendentes.toFixed(2)}</span>
            </div>

            {/* Resultado Acumulado */}
            <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3 space-y-1.5 shadow-sm transition">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-semibold truncate block">Resultado Acumulado</span>
                <button
                  type="button"
                  onClick={() => setModalDetalhesMetrica('lucro')}
                  className="px-2 py-0.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-[10px] font-bold transition cursor-pointer border border-indigo-500/20 shrink-0"
                >
                  Detalhar
                </button>
              </div>
              <span className={`text-base font-black block truncate ${lucroLiquido >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
                R$ {lucroLiquido.toFixed(2)}
              </span>
            </div>
          </div>

          {/* NAVEGAÇÃO DE ABAS */}
          <div className="flex items-center gap-2 border-b border-slate-800 overflow-x-auto">
            <button
              type="button"
              onClick={() => setAbaAtiva('caixa_atual')}
              className={`pb-2 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                abaAtiva === 'caixa_atual' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Turno / Gaveta Atual</span>
              <span className={`w-2 h-2 rounded-full ${sessaoAtiva ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('fluxo')}
              className={`pb-2 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
                abaAtiva === 'fluxo' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Fluxo Geral ({listaTransacoesUnificada.length})
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('pagar')}
              className={`pb-2 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
                abaAtiva === 'pagar' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Contas a Pagar ({listaTransacoesUnificada.filter(t => t.tipo === 'SAIDA' && t.status === 'pendente').length})
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('historico_caixas')}
              className={`pb-2 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
                abaAtiva === 'historico_caixas' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
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
                <div className="space-y-2">
                  {listaTransacoesUnificada
                    .filter(t => (abaAtiva === 'pagar' ? t.tipo === 'SAIDA' && t.status === 'pendente' : true))
                    .map((tr) => (
                      <div
                        key={tr.id}
                        className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3.5 flex items-center justify-between gap-4 transition shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              tr.tipo === 'ENTRADA' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {tr.tipo === 'ENTRADA' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                          </div>

                          <div>
                            <h4 className="text-xs font-bold text-slate-100">{tr.descricao}</h4>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 flex-wrap">
                              <span className="font-semibold text-slate-300">{tr.categoria}</span>
                              {tr.formaPagamento && (
                                <>
                                  <span>•</span>
                                  <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded uppercase font-bold text-[9px]">
                                    {tr.formaPagamento}
                                  </span>
                                </>
                              )}
                              <span>•</span>
                              <span>{new Date(tr.data).toLocaleDateString('pt-BR')}</span>
                              {tr.ehRecorrente && (
                                <span className="text-indigo-400 flex items-center gap-0.5">
                                  <Repeat className="w-2.5 h-2.5" /> Mensal
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`font-bold text-sm block ${
                              tr.tipo === 'ENTRADA' ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {tr.tipo === 'ENTRADA' ? '+' : '-'} R$ {tr.valor.toFixed(2)}
                          </span>
                          <span className="text-[10px] uppercase font-bold text-slate-500">
                            {tr.status}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* ABA 3: TURNO / GAVETA ATUAL (SESSÃO TRANSACIONAL EM TEMPO REAL) */}
              {abaAtiva === 'caixa_atual' && (
                <div className="space-y-5 max-w-5xl mx-auto">
                  {sessaoAtiva && resumoSessao ? (
                    <div className="space-y-5">
                      {/* ALERTA DE SESSÃO ABERTA HÁ MAIS DE 24 HORAS */}
                      {resumoSessao.abertoHaMaisDe24h && (
                        <div className="bg-amber-500/15 border-2 border-amber-500/60 rounded-3xl p-4 flex items-center gap-3 text-amber-200 animate-pulse">
                          <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
                          <div className="text-xs">
                            <strong className="font-bold text-sm text-amber-300 block">
                              Atenção: Sessão de Caixa aberta há mais de 24 horas ({resumoSessao.duracaoTexto})!
                            </strong>
                            <span>
                              Este caixa foi aberto em {new Date(sessaoAtiva.aberto_em).toLocaleString('pt-BR')} e continua acumulando movimentações.
                              Para evitar discrepâncias entre turnos, recomenda-se realizar o Fechamento Cego e abrir uma nova sessão.
                            </span>
                          </div>
                        </div>
                      )}

                      {/* CABEÇALHO DA SESSÃO ATIVA */}
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              <span className="font-bold text-xs text-emerald-400 uppercase tracking-wider">
                                Sessão Transacional Aberta • Terminal {sessaoAtiva.terminal_id}
                              </span>
                            </div>
                            <h3 className="text-xl font-black text-slate-100 mt-1">
                              Operador: {sessaoAtiva.usuario_abertura?.nome_completo || 'Operador'}
                            </h3>
                            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-slate-500" />
                                Aberto às {new Date(sessaoAtiva.aberto_em).toLocaleTimeString('pt-BR')} ({new Date(sessaoAtiva.aberto_em).toLocaleDateString('pt-BR')})
                              </span>
                              <span>•</span>
                              <span className="font-semibold text-emerald-400">
                                Duração: {resumoSessao.duracaoTexto}
                              </span>
                            </div>
                          </div>

                          <div className="bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-right shrink-0">
                            <span className="text-[11px] text-slate-400 block font-semibold">Fundo de Troco Inicial</span>
                            <span className="text-lg font-black text-emerald-400">
                              R$ {(resumoSessao?.fundoInicial ?? Number(sessaoAtiva.fundo_inicial || 0)).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* BIG KPI CARD: SALDO ESPERADO EM DINHEIRO NA GAVETA FÍSICA */}
                        <div className="bg-gradient-to-br from-emerald-950/40 via-slate-950 to-slate-950 border border-emerald-500/30 rounded-3xl p-5 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                                <Banknote className="w-4 h-4" /> Saldo Esperado em Dinheiro na Gaveta Física
                              </span>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Valor exato que deve constar em notas e moedas neste momento.
                              </p>
                            </div>
                            <span className="text-3xl font-black text-emerald-300">
                              R$ {resumoSessao.saldoEsperadoDinheiro.toFixed(2)}
                            </span>
                          </div>

                          {/* FÓRMULA DE COMPOSIÇÃO FÍSICA DETALHADA */}
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-800 text-[11px]">
                            <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                              <span className="text-slate-400 block text-[10px]">Fundo Inicial</span>
                              <span className="font-bold text-slate-200">+ R$ {(resumoSessao?.fundoInicial ?? Number(sessaoAtiva.fundo_inicial || 0)).toFixed(2)}</span>
                            </div>
                            <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                              <span className="text-slate-400 block text-[10px]">Vendas Dinheiro</span>
                              <span className="font-bold text-emerald-400">+ R$ {resumoSessao.totaisPorMetodo.dinheiro.toFixed(2)}</span>
                            </div>
                            <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                              <span className="text-slate-400 block text-[10px]">Suprimentos</span>
                              <span className="font-bold text-cyan-400">+ R$ {resumoSessao.totalSuprimentos.toFixed(2)}</span>
                            </div>
                            <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                              <span className="text-slate-400 block text-[10px]">Sangrias (Cofre)</span>
                              <span className="font-bold text-rose-400">- R$ {resumoSessao.totalSangrias.toFixed(2)}</span>
                            </div>
                            <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                              <span className="text-slate-400 block text-[10px]">Despesas Gaveta</span>
                              <span className="font-bold text-amber-400">- R$ {resumoSessao.totalDespesas.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        {/* VENDAS DO TURNO POR MÉTODO DE PAGAMENTO */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                              Vendas do Turno por Meio de Pagamento
                            </h4>
                            <span className="text-xs font-black text-slate-300">
                              Total Faturado: <strong className="text-emerald-400">R$ {resumoSessao.faturamentoTotalVendas.toFixed(2)}</strong>
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {/* Dinheiro */}
                            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400 font-semibold">Dinheiro</span>
                                <Banknote className="w-4 h-4 text-emerald-400" />
                              </div>
                              <span className="text-base font-bold text-emerald-400 block">
                                R$ {resumoSessao.totaisPorMetodo.dinheiro.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {resumoSessao.qtdVendasPorMetodo.dinheiro} vendas
                              </span>
                            </div>

                            {/* Pix */}
                            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400 font-semibold">Pix</span>
                                <Zap className="w-4 h-4 text-cyan-400" />
                              </div>
                              <span className="text-base font-bold text-cyan-400 block">
                                R$ {resumoSessao.totaisPorMetodo.pix.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {resumoSessao.qtdVendasPorMetodo.pix} vendas
                              </span>
                            </div>

                            {/* Cartão Débito */}
                            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400 font-semibold">Cartão Débito</span>
                                <CreditCard className="w-4 h-4 text-blue-400" />
                              </div>
                              <span className="text-base font-bold text-blue-400 block">
                                R$ {resumoSessao.totaisPorMetodo.cartao_debito.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {resumoSessao.qtdVendasPorMetodo.cartao_debito} vendas
                              </span>
                            </div>

                            {/* Cartão Crédito */}
                            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400 font-semibold">Cartão Crédito</span>
                                <CreditCard className="w-4 h-4 text-purple-400" />
                              </div>
                              <span className="text-base font-bold text-purple-400 block">
                                R$ {resumoSessao.totaisPorMetodo.cartao_credito.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {resumoSessao.qtdVendasPorMetodo.cartao_credito} vendas
                              </span>
                            </div>

                            {/* Outros */}
                            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400 font-semibold">Outros</span>
                                <Layers className="w-4 h-4 text-amber-400" />
                              </div>
                              <span className="text-base font-bold text-amber-400 block">
                                R$ {resumoSessao.totaisPorMetodo.outros.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {resumoSessao.qtdVendasPorMetodo.outros} vendas
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* LINHA DO TEMPO: MOVIMENTAÇÕES DESTA SESSÃO */}
                        <div className="border-t border-slate-800 pt-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                              Movimentações da Sessão Ativa
                            </h4>
                            {permissions.ehAdmin && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setModalSuprimento(true)}
                                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold rounded-xl border border-slate-700 cursor-pointer"
                                >
                                  + Suprimento
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setModalSangria(true)}
                                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 text-xs font-bold rounded-xl border border-slate-700 cursor-pointer"
                                >
                                  - Sangria
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setModalDespesaRapida(true)}
                                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-bold rounded-xl border border-slate-700 cursor-pointer"
                                >
                                  - Despesa
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {!sessaoAtiva.movimentacoes || sessaoAtiva.movimentacoes.length === 0 ? (
                              <p className="text-xs text-slate-500 py-6 text-center">
                                Nenhuma movimentação registrada nesta sessão de caixa até o momento.
                              </p>
                            ) : (
                              sessaoAtiva.movimentacoes.map((m) => {
                                const ehSaida = m.tipo === 'SANGRIA' || m.tipo === 'DESPESA';
                                return (
                                  <div
                                    key={m.id}
                                    className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs"
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <div
                                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                                          m.tipo === 'SUPRIMENTO'
                                            ? 'bg-emerald-500/20 text-emerald-400'
                                            : m.tipo === 'SANGRIA'
                                            ? 'bg-rose-500/20 text-rose-400'
                                            : m.tipo === 'DESPESA'
                                            ? 'bg-amber-500/20 text-amber-400'
                                            : 'bg-indigo-500/20 text-indigo-400'
                                        }`}
                                      >
                                        {m.tipo === 'SUPRIMENTO' && <ArrowDown className="w-4 h-4" />}
                                        {m.tipo === 'SANGRIA' && <ArrowUp className="w-4 h-4" />}
                                        {m.tipo === 'DESPESA' && <Banknote className="w-4 h-4" />}
                                        {m.tipo === 'VENDA' && <ShoppingCart className="w-4 h-4" />}
                                      </div>
                                      <div>
                                        <span className="font-bold text-slate-200 block">{m.descricao}</span>
                                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                          <span className="uppercase font-semibold">{m.metodo_pagamento}</span>
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

                                    <span
                                      className={`font-black text-sm ${
                                        ehSaida ? 'text-rose-400' : 'text-emerald-400'
                                      }`}
                                    >
                                      {ehSaida ? '-' : '+'} R$ {Number(m.valor).toFixed(2)}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* BOTÃO DE FECHAMENTO CEGO */}
                        <div className="border-t border-slate-800 pt-4 flex items-center justify-between">
                          <span className="text-xs text-slate-400">
                            Pronto para fechar o turno? Realize a contagem física cega.
                          </span>
                          <button
                            type="button"
                            onClick={() => setModalFechamentoCego(true)}
                            className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-2xl shadow-lg shadow-amber-500/25 transition cursor-pointer flex items-center gap-2"
                          >
                            <Lock className="w-4 h-4" />
                            <span>Realizar Fechamento Cego de Caixa</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ESTADO QUANDO NÃO HÁ SESSÃO ABERTA */
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-4 shadow-xl">
                      <div className="w-16 h-16 rounded-3xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto">
                        <Lock className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-slate-100">
                          Nenhum Caixa Aberto no Momento (Terminal {terminalId})
                        </h3>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                          Abra o caixa informando o fundo de troco inicial para registrar vendas, sangrias, suprimentos e controlar o turno.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setModalAberturaCaixa(true)}
                        className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs rounded-2xl shadow-lg shadow-emerald-500/25 transition cursor-pointer inline-flex items-center gap-2"
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
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 block mb-1">Data Início</label>
                          <input
                            type="date"
                            value={filtrosHistorico.dataInicio}
                            onChange={(e) => setFiltrosHistorico(prev => ({ ...prev, dataInicio: e.target.value }))}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 block mb-1">Data Fim</label>
                          <input
                            type="date"
                            value={filtrosHistorico.dataFim}
                            onChange={(e) => setFiltrosHistorico(prev => ({ ...prev, dataFim: e.target.value }))}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 block mb-1">Operador</label>
                          <select
                            value={filtrosHistorico.usuarioId}
                            onChange={(e) => setFiltrosHistorico(prev => ({ ...prev, usuarioId: e.target.value }))}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200"
                          >
                            <option value="todos">Todos os Operadores</option>
                            {usuariosLoja.map(u => (
                              <option key={u.id} value={u.id}>{u.nome_completo}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 block mb-1">Diferença</label>
                          <select
                            value={filtrosHistorico.statusDiferenca}
                            onChange={(e) => setFiltrosHistorico(prev => ({ ...prev, statusDiferenca: e.target.value as any }))}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200"
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
                          onClick={() => setModalRelatorioConsolidado(true)}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold text-xs rounded-xl border border-indigo-500/30 flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Meios de Pagamento</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalRelatorioSangriasDespesas(true)}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-rose-300 font-bold text-xs rounded-xl border border-rose-500/30 flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          <span>Sangrias & Despesas</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* LISTAGEM DE SESSÕES */}
                  {historicoSessoes.length === 0 ? (
                    <div className="text-center py-16 text-slate-500 text-sm bg-slate-900 border border-slate-800 rounded-3xl">
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
                          className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition shadow-sm"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-sm text-slate-100">
                                Terminal {cx.terminal_id}
                              </span>
                              <span
                                className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${
                                  cx.status === 'ABERTO'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {cx.status}
                              </span>
                              {cx.status === 'FECHADO' && (
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    isExato
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : isSobra
                                      ? 'bg-cyan-500/10 text-cyan-400'
                                      : 'bg-rose-500/10 text-rose-400'
                                  }`}
                                >
                                  {isExato
                                    ? '✓ Caixa Exato'
                                    : isSobra
                                    ? `+ R$ ${dif.toFixed(2)} (Sobra)`
                                    : `- R$ ${Math.abs(dif).toFixed(2)} (Falta)`}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-400">
                              Aberto em: <span className="text-slate-200">{new Date(cx.aberto_em).toLocaleString('pt-BR')}</span> por {cx.usuario_abertura?.nome_completo || 'Operador'}
                              {cx.fechado_em && (
                                <>
                                  {' '}• Fechado em: <span className="text-slate-200">{new Date(cx.fechado_em).toLocaleString('pt-BR')}</span>
                                </>
                              )}
                            </p>

                            <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1 flex-wrap">
                              <span>Faturamento Total: <strong className="text-slate-200">R$ {Number(cx.faturamento_total || 0).toFixed(2)}</strong></span>
                              <span>•</span>
                              <span>Esperado Dinheiro: <strong className="text-slate-200">R$ {Number(cx.saldo_dinheiro_calculado || 0).toFixed(2)}</strong></span>
                              {(cx.saldo_declarado_dinheiro != null || cx.saldo_dinheiro_declarado != null) && (
                                <>
                                  <span>•</span>
                                  <span>Declarado Físico: <strong className="text-slate-200">R$ {Number(cx.saldo_declarado_dinheiro ?? cx.saldo_dinheiro_declarado).toFixed(2)}</strong></span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleAbrirDrillDown(cx)}
                              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                            >
                              <Search className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Inspecionar (Drill-Down)</span>
                            </button>

                            {cx.fechado_em && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const { resumo } = await caixaService.obterDetalhesSessao(cx.id);
                                    const texto = caixaService.gerarTextoComprovanteFechamento(
                                      { ...resumo, sessao: cx },
                                      loja?.nome_fantasia || 'HUBI GESTÃO'
                                    );
                                    handleImprimirRelatorioTexto(texto);
                                  } catch (e) {
                                    mostrarErro('Erro ao gerar comprovante de impressão.');
                                  }
                                }}
                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 cursor-pointer transition"
                                title="Imprimir Comprovante Térmico"
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

        {/* ========================================================================= */}
        {/* MODAL: LANÇAR NOVA DESPESA (DRE GERAL)                                    */}
        {/* ========================================================================= */}
        {modalNovaDespesa && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-base text-slate-100">Lançar Nova Despesa (DRE)</h3>
                <button onClick={() => setModalNovaDespesa(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCadastrarDespesa} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">Descrição do Gasto *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Compra de Insumos / Limpeza / Fornecedor"
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-300 font-semibold block mb-1">Valor (R$) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="Ex: 40.00"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 font-semibold block mb-1">Categoria</label>
                    <select
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                    >
                      <option value="Fornecedor">Fornecedor / Insumos</option>
                      <option value="Aluguel">Aluguel / Ponto</option>
                      <option value="Energia/Água">Energia / Água / Internet</option>
                      <option value="Salário">Salário / Comissão</option>
                      <option value="Marketing">Marketing / Anúncios</option>
                      <option value="Outros">Outros / Avulso</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">Forma de Pagamento da Despesa *</label>
                  <select
                    value={formaPagamentoDespesa}
                    onChange={(e) => setFormaPagamentoDespesa(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-bold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="dinheiro">Dinheiro (Gaveta do Caixa Ativo)</option>
                    <option value="pix">Pix</option>
                    <option value="debito">Cartão de Débito</option>
                    <option value="credito">Cartão de Crédito</option>
                    <option value="transferencia">Transferência Bancária / Boleto</option>
                  </select>
                  {formaPagamentoDespesa === 'dinheiro' && sessaoAtiva && (
                    <span className="text-[10px] text-amber-400 block mt-1">
                      ℹ️ Esta despesa será debitada automaticamente da gaveta física da sessão ativa ({sessaoAtiva.terminal_id}).
                    </span>
                  )}
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">Data</label>
                  <input
                    type="date"
                    value={dataVencimento}
                    onChange={(e) => setDataVencimento(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="chkRecorrente"
                    checked={ehRecorrente}
                    onChange={(e) => setEhRecorrente(e.target.checked)}
                    className="rounded border-slate-700"
                  />
                  <label htmlFor="chkRecorrente" className="text-xs text-slate-300 font-medium cursor-pointer">
                    Despesa Fixa Recorrente (Repetir mensalmente)
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={salvandoDespesa}
                  className="w-full py-3.5 rounded-xl bg-rose-500 hover:bg-rose-400 font-bold text-white text-xs shadow-lg shadow-rose-500/25 transition mt-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {salvandoDespesa ? 'Salvando...' : 'Salvar Despesa'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: ABERTURA DE SESSÃO DE CAIXA (BLOQUEIO DE CONCORRÊNCIA)              */}
        {/* ========================================================================= */}
        {modalAberturaCaixa && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  <Unlock className="w-5 h-5 text-emerald-400" />
                  <span>Abertura de Caixa</span>
                </h3>
                <button onClick={() => setModalAberturaCaixa(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAbrirSessao} className="space-y-4">
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Terminal de Caixa:</span>
                    <strong className="text-slate-200 uppercase">{terminalId}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Operador:</span>
                    <strong className="text-slate-200">{usuario?.nome_completo || 'Operador'}</strong>
                  </div>
                  <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                    🔒 O sistema valida a concorrência e impede a abertura simultânea de mais de uma sessão ativa neste terminal.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Fundo de Troco Inicial em Dinheiro (R$):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ex: 100.00"
                    value={fundoTroco}
                    onChange={(e) => setFundoTroco(e.target.value)}
                    className="w-full bg-slate-800 border border-emerald-500 rounded-xl px-4 py-3 text-lg font-black text-emerald-400 text-center focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 block text-center mt-1">
                    Valor físico inicial em cédulas e moedas na gaveta
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={abrindoCaixa}
                  className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition cursor-pointer disabled:opacity-50"
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
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  <ArrowDown className="w-5 h-5 text-emerald-400" />
                  <span>Suprimento de Caixa (Troco Extra)</span>
                </h3>
                <button onClick={() => setModalSuprimento(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRegistrarSuprimento} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Valor a Adicionar na Gaveta (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ex: 50.00"
                    value={valorSuprimento}
                    onChange={(e) => setValorSuprimento(e.target.value)}
                    className="w-full bg-slate-800 border border-emerald-500/60 rounded-xl px-4 py-2.5 text-base font-bold text-emerald-400 text-center"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Justificativa / Motivo da Entrada *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Inserção de moedas para troco matutino"
                    value={motivoSuprimento}
                    onChange={(e) => setMotivoSuprimento(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={processandoSuprimento}
                  className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition cursor-pointer disabled:opacity-50"
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
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  <ArrowUp className="w-5 h-5 text-rose-400" />
                  <span>Sangria de Caixa (Retirada de Dinheiro)</span>
                </h3>
                <button onClick={() => setModalSangria(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRegistrarSangria} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Valor a Retirar da Gaveta (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ex: 500.00"
                    value={valorSangria}
                    onChange={(e) => setValorSangria(e.target.value)}
                    className="w-full bg-slate-800 border border-rose-500/60 rounded-xl px-4 py-2.5 text-base font-bold text-rose-400 text-center"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Justificativa Obrigatória (Destino do Valor) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Recolhimento para o cofre / Depósito bancário"
                    value={motivoSangria}
                    onChange={(e) => setMotivoSangria(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={processandoSangria}
                  className="w-full py-3.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs shadow-lg shadow-rose-500/25 transition cursor-pointer disabled:opacity-50"
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
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-amber-400" />
                  <span>Despesa Operacional de Gaveta</span>
                </h3>
                <button onClick={() => setModalDespesaRapida(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRegistrarDespesaRapida} className="space-y-4">
                <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-2xl text-xs text-amber-300">
                  ⚠️ O valor informado será debitado imediatamente do dinheiro físico da gaveta do caixa atual.
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Valor Pago em Dinheiro (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ex: 25.00"
                    value={valorDespesaRapida}
                    onChange={(e) => setValorDespesaRapida(e.target.value)}
                    className="w-full bg-slate-800 border border-amber-500/60 rounded-xl px-4 py-2.5 text-base font-bold text-amber-400 text-center"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Categoria</label>
                  <select
                    value={categoriaDespesaRapida}
                    onChange={(e) => setCategoriaDespesaRapida(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
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
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Descrição / Justificativa do Gasto *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Compra de saco de gelo emergencial"
                    value={descricaoDespesaRapida}
                    onChange={(e) => setDescricaoDespesaRapida(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={processandoDespesaRapida}
                  className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 transition cursor-pointer disabled:opacity-50"
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
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl my-8">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                    <Lock className="w-5 h-5 text-amber-400" />
                    <span>Fechamento Cego de Caixa</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Terminal: <strong className="text-slate-200">{sessaoAtiva?.terminal_id}</strong>
                  </p>
                </div>
                <button onClick={() => setModalFechamentoCego(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleFecharSessaoCega} className="space-y-4">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 text-xs text-amber-300 space-y-1">
                  <span className="font-bold block">🔒 Procedimento de Conferência Cega:</span>
                  <p className="text-[11px] leading-relaxed text-amber-200/80">
                    Digite os valores físicos apurados em cada meio de pagamento. Os saldos teóricos calculados pelo sistema
                    <strong> NÃO são exibidos nesta tela</strong> para garantir a integridade da conferência. O sistema confrontará
                    as divergências (Sobra/Falta) imediatamente após o envio.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-black text-slate-200 block mb-1">
                    Dinheiro Físico Contado na Gaveta (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={contagemDinheiro}
                    onChange={(e) => setContagemDinheiro(e.target.value)}
                    className="w-full bg-slate-800 border-2 border-amber-500 rounded-2xl px-4 py-3 text-xl font-black text-amber-400 text-center focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 block text-center mt-1">
                    Soma de todas as cédulas e moedas físicas presentes na gaveta
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Pix Apurado (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00 (Opcional)"
                      value={contagemPix}
                      onChange={(e) => setContagemPix(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 text-center"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Cartão Débito (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00 (Opcional)"
                      value={contagemDebito}
                      onChange={(e) => setContagemDebito(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 text-center"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Cartão Crédito (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00 (Opcional)"
                      value={contagemCredito}
                      onChange={(e) => setContagemCredito(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 text-center"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Outros Meios (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00 (Opcional)"
                      value={contagemOutros}
                      onChange={(e) => setContagemOutros(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 text-center"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Observações / Justificativas do Fechamento:
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Sangria realizada para o cofre; divergência justificada por troco incorreto."
                    value={observacaoFechamento}
                    onChange={(e) => setObservacaoFechamento(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={processandoFechamento}
                  className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/25 transition cursor-pointer disabled:opacity-50"
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
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl p-6 space-y-5 shadow-2xl my-8 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 font-bold flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-100">Relatório Oficial de Fechamento de Caixa</h3>
                    <p className="text-xs text-slate-400">
                      Terminal: <strong className="text-slate-200">{relatorioFechamentoResumo.sessao.terminal_id}</strong> • Duração: <strong className="text-slate-200">{relatorioFechamentoResumo.duracaoTexto}</strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setModalRelatorioFechamento(false)}
                  className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
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
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                        : isSobra
                        ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-300'
                        : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    <div>
                      <span className="font-black text-sm block">
                        {isExato ? '✓ Caixa Conciliado com Exatidão' : isSobra ? 'SOBRA DE CAIXA APURADA' : 'FALTA DE CAIXA APURADA'}
                      </span>
                      <span className="text-[11px] opacity-80">
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
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-1">
                  <span className="text-[11px] text-slate-400 font-semibold block">Total Faturado (Vendas)</span>
                  <span className="text-lg font-black text-emerald-400 block">
                    R$ {relatorioFechamentoResumo.faturamentoTotalVendas.toFixed(2)}
                  </span>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-1">
                  <span className="text-[11px] text-slate-400 font-semibold block">Esperado em Dinheiro</span>
                  <span className="text-lg font-black text-slate-100 block">
                    R$ {relatorioFechamentoResumo.saldoEsperadoDinheiro.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-500">Fundo + Vendas - Saídas</span>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-1">
                  <span className="text-[11px] text-slate-400 font-semibold block">Contado pelo Operador</span>
                  <span className="text-lg font-black text-amber-400 block">
                    R$ {Number(relatorioFechamentoResumo.sessao.saldo_declarado_dinheiro ?? relatorioFechamentoResumo.sessao.saldo_dinheiro_declarado ?? 0).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-500">Valor físico declarado</span>
                </div>
              </div>

              {/* TABELA DE VENDAS POR MEIO DE PAGAMENTO */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-300 block">Apuração por Meio de Pagamento:</span>
                <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[11px] uppercase font-semibold">
                      <tr>
                        <th className="p-2.5">Forma</th>
                        <th className="p-2.5 text-center">Vendas</th>
                        <th className="p-2.5 text-right">Calculado Sistema</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      <tr>
                        <td className="p-2.5 font-medium text-slate-200">Dinheiro</td>
                        <td className="p-2.5 text-center text-slate-400">{relatorioFechamentoResumo.qtdVendasPorMetodo.dinheiro}</td>
                        <td className="p-2.5 text-right font-bold text-slate-100">R$ {relatorioFechamentoResumo.totaisPorMetodo.dinheiro.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-medium text-slate-200">Pix</td>
                        <td className="p-2.5 text-center text-slate-400">{relatorioFechamentoResumo.qtdVendasPorMetodo.pix}</td>
                        <td className="p-2.5 text-right font-bold text-cyan-400">R$ {relatorioFechamentoResumo.totaisPorMetodo.pix.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-medium text-slate-200">Cartão de Débito</td>
                        <td className="p-2.5 text-center text-slate-400">{relatorioFechamentoResumo.qtdVendasPorMetodo.cartao_debito}</td>
                        <td className="p-2.5 text-right font-bold text-blue-400">R$ {relatorioFechamentoResumo.totaisPorMetodo.cartao_debito.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-medium text-slate-200">Cartão de Crédito</td>
                        <td className="p-2.5 text-center text-slate-400">{relatorioFechamentoResumo.qtdVendasPorMetodo.cartao_credito}</td>
                        <td className="p-2.5 text-right font-bold text-purple-400">R$ {relatorioFechamentoResumo.totaisPorMetodo.cartao_credito.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-medium text-slate-200">Outros</td>
                        <td className="p-2.5 text-center text-slate-400">{relatorioFechamentoResumo.qtdVendasPorMetodo.outros}</td>
                        <td className="p-2.5 text-right font-bold text-amber-400">R$ {relatorioFechamentoResumo.totaisPorMetodo.outros.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* AÇÕES DE COMPARTILHAMENTO E IMPRESSÃO */}
              <div className="flex items-center justify-between gap-2 pt-2 flex-wrap border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopiarRelatorioTexto(relatorioFechamentoTexto)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Copy className="w-4 h-4 text-slate-400" />
                    <span>{copiadoRelatorio ? 'Copiado!' : 'Copiar Texto'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleEnviarWhatsappRelatorioTexto(relatorioFechamentoTexto)}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleImprimirRelatorioTexto(relatorioFechamentoTexto)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-slate-400" />
                    <span>Imprimir Comprovante</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalRelatorioFechamento(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
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
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl p-6 space-y-5 shadow-2xl my-8">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                    <Search className="w-5 h-5 text-indigo-400" />
                    <span>Auditoria de Sessão (Drill-Down) • Terminal {sessaoDrillDown.terminal_id}</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    ID da Sessão: <span className="font-mono text-slate-300">{sessaoDrillDown.id}</span>
                  </p>
                </div>
                <button onClick={() => setModalDrillDown(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {carregandoDrillDown ? (
                <div className="py-16 text-center text-slate-400 text-sm">Carregando auditoria completa...</div>
              ) : resumoDrillDown ? (
                <div className="space-y-4">
                  {/* METADADOS DA SESSÃO */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Abertura</span>
                      <span className="font-semibold text-slate-200">{new Date(sessaoDrillDown.aberto_em).toLocaleString('pt-BR')}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Fechamento</span>
                      <span className="font-semibold text-slate-200">
                        {sessaoDrillDown.fechado_em ? new Date(sessaoDrillDown.fechado_em).toLocaleString('pt-BR') : 'Em Aberto'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Duração Total</span>
                      <span className="font-semibold text-emerald-400">{resumoDrillDown.duracaoTexto}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Operador Fechamento</span>
                      <span className="font-semibold text-slate-200">{sessaoDrillDown.usuario_fechamento?.nome_completo || '—'}</span>
                    </div>
                  </div>

                  {/* CARDS COMPARATIVOS */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">Total Faturado</span>
                      <span className="font-black text-sm text-emerald-400">R$ {resumoDrillDown.faturamentoTotalVendas.toFixed(2)}</span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">Esperado Dinheiro</span>
                      <span className="font-black text-sm text-slate-200">R$ {resumoDrillDown.saldoEsperadoDinheiro.toFixed(2)}</span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">Declarado Físico</span>
                      <span className="font-black text-sm text-amber-400">
                        R$ {Number(sessaoDrillDown.saldo_declarado_dinheiro ?? sessaoDrillDown.saldo_dinheiro_declarado ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">Diferença Final</span>
                      <span className={`font-black text-sm ${
                        Number(sessaoDrillDown.diferenca_dinheiro || 0) === 0
                          ? 'text-emerald-400'
                          : Number(sessaoDrillDown.diferenca_dinheiro || 0) > 0
                          ? 'text-cyan-400'
                          : 'text-rose-400'
                      }`}>
                        {Number(sessaoDrillDown.diferenca_dinheiro || 0) === 0
                          ? 'R$ 0,00'
                          : `R$ ${Number(sessaoDrillDown.diferenca_dinheiro).toFixed(2)}`}
                      </span>
                    </div>
                  </div>

                  {/* TABELA DE MOVIMENTAÇÕES AUDITADAS */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-300 block">
                      Extrato Completo de Movimentações ({resumoDrillDown.sessao.movimentacoes?.length || 0}):
                    </span>
                    <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                      {!resumoDrillDown.sessao.movimentacoes || resumoDrillDown.sessao.movimentacoes.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-4">Nenhuma movimentação detalhada.</p>
                      ) : (
                        resumoDrillDown.sessao.movimentacoes.map(m => (
                          <div
                            key={m.id}
                            className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 flex justify-between items-center text-xs"
                          >
                            <div>
                              <span className="font-bold text-slate-200 block">{m.descricao}</span>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                <span className="uppercase font-semibold">{m.tipo}</span>
                                <span>•</span>
                                <span>{m.metodo_pagamento}</span>
                                <span>•</span>
                                <span>{new Date(m.criado_em).toLocaleTimeString('pt-BR')}</span>
                              </div>
                            </div>
                            <span className={`font-bold ${
                              m.tipo === 'SANGRIA' || m.tipo === 'DESPESA' ? 'text-rose-400' : 'text-emerald-400'
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

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalDrillDown(false)}
                  className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
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
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl p-6 space-y-5 shadow-2xl my-8">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 text-indigo-400 font-bold flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-100">Relatório Consolidado de Meios de Pagamento</h3>
                    <p className="text-xs text-slate-400">Conciliação com Extratos Bancários e Maquininhas</p>
                  </div>
                </div>
                <button onClick={() => setModalRelatorioConsolidado(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* SELEÇÃO DO PERÍODO */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Data Início</label>
                  <input
                    type="date"
                    value={periodoRelatorioInicio}
                    onChange={(e) => setPeriodoRelatorioInicio(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Data Fim</label>
                  <input
                    type="date"
                    value={periodoRelatorioFim}
                    onChange={(e) => setPeriodoRelatorioFim(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200"
                  />
                </div>
              </div>

              {/* CARDS COM TOTAIS CONSOLIDADOS */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 font-semibold block">Dinheiro Físico</span>
                  <span className="text-base font-black text-emerald-400 block">
                    R$ {dadosRelatorioConsolidado.dinheiro.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 font-semibold block">Pix Bancário</span>
                  <span className="text-base font-black text-cyan-400 block">
                    R$ {dadosRelatorioConsolidado.pix.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 font-semibold block">Cartão Débito</span>
                  <span className="text-base font-black text-blue-400 block">
                    R$ {dadosRelatorioConsolidado.debito.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 font-semibold block">Cartão Crédito</span>
                  <span className="text-base font-black text-purple-400 block">
                    R$ {dadosRelatorioConsolidado.credito.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 font-semibold block">Outros / Convênio</span>
                  <span className="text-base font-black text-amber-400 block">
                    R$ {dadosRelatorioConsolidado.outros.toFixed(2)}
                  </span>
                </div>
                <div className="bg-emerald-950/30 p-3.5 rounded-2xl border border-emerald-500/40 space-y-1">
                  <span className="text-xs text-emerald-400 font-semibold block">Total Consolidado</span>
                  <span className="text-lg font-black text-emerald-300 block">
                    R$ {dadosRelatorioConsolidado.totalBruto.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    const texto = `RELATÓRIO CONSOLIDADO DE MEIOS DE PAGAMENTO\nPeríodo: ${periodoRelatorioInicio} até ${periodoRelatorioFim}\n\nDinheiro: R$ ${dadosRelatorioConsolidado.dinheiro.toFixed(2)}\nPix: R$ ${dadosRelatorioConsolidado.pix.toFixed(2)}\nCartão Débito: R$ ${dadosRelatorioConsolidado.debito.toFixed(2)}\nCartão Crédito: R$ ${dadosRelatorioConsolidado.credito.toFixed(2)}\nOutros: R$ ${dadosRelatorioConsolidado.outros.toFixed(2)}\n\nTOTAL FATURADO: R$ ${dadosRelatorioConsolidado.totalBruto.toFixed(2)}`;
                    handleCopiarRelatorioTexto(texto);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 cursor-pointer"
                >
                  Copiar Relatório
                </button>
                <button
                  type="button"
                  onClick={() => setModalRelatorioConsolidado(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
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
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl p-6 space-y-5 shadow-2xl my-8">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/15 text-rose-400 font-bold flex items-center justify-center">
                    <SlidersHorizontal className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-100">Relatório de Sangrias & Despesas de Gaveta</h3>
                    <p className="text-xs text-slate-400">Auditoria de saídas e retiradas operacionais</p>
                  </div>
                </div>
                <button onClick={() => setModalRelatorioSangriasDespesas(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* PERÍODO E TOTAIS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Total de Sangrias (Cofre)</span>
                  <span className="text-lg font-black text-rose-400 block">
                    R$ {dadosRelatorioSangriasDespesas.totalSangrias.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Total Despesas da Gaveta</span>
                  <span className="text-lg font-black text-amber-400 block">
                    R$ {dadosRelatorioSangriasDespesas.totalDespesas.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Total Geral de Saídas</span>
                  <span className="text-lg font-black text-slate-100 block">
                    R$ {dadosRelatorioSangriasDespesas.totalGeral.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* TABELA DE REGISTROS */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-300 block">
                  Lançamentos de Saída ({dadosRelatorioSangriasDespesas.itens.length}):
                </span>
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {dadosRelatorioSangriasDespesas.itens.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">Nenhuma sangria ou despesa no período.</p>
                  ) : (
                    dadosRelatorioSangriasDespesas.itens.map(item => (
                      <div
                        key={item.id}
                        className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                                item.tipo === 'SANGRIA'
                                  ? 'bg-rose-500/20 text-rose-400'
                                  : 'bg-amber-500/20 text-amber-400'
                              }`}
                            >
                              {item.tipo}
                            </span>
                            <span className="font-bold text-slate-200">{item.descricao}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1">
                            <span>Terminal: {item.terminal}</span>
                            <span>•</span>
                            <span>{new Date(item.data).toLocaleString('pt-BR')}</span>
                            <span>•</span>
                            <span>Resp: {item.operador}</span>
                          </div>
                        </div>
                        <span className="font-black text-sm text-rose-400 shrink-0">
                          - R$ {item.valor.toFixed(2)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalRelatorioSangriasDespesas(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
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
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl p-6 space-y-4 shadow-2xl my-8 animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 text-indigo-400 font-bold flex items-center justify-center">
                    <Info className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-100">
                      {modalDetalhesMetrica === 'entradas' && 'Detalhamento de Entradas (Receitas)'}
                      {modalDetalhesMetrica === 'saidas' && 'Detalhamento de Despesas'}
                      {modalDetalhesMetrica === 'pagar' && 'Detalhamento de Contas a Pagar'}
                      {modalDetalhesMetrica === 'lucro' && 'Resultado Acumulado'}
                    </h3>
                    <span className="text-xs text-slate-400">Composição detalhada dos valores apurados</span>
                  </div>
                </div>
                <button
                  onClick={() => setModalDetalhesMetrica(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {modalDetalhesMetrica === 'entradas' && (
                  <div className="space-y-3">
                    <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex justify-between items-center">
                      <span className="text-xs text-slate-400 font-semibold">Total de Entradas Recebidas:</span>
                      <span className="text-xl font-black text-emerald-400">R$ {totalReceitas.toFixed(2)}</span>
                    </div>
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-300 block">Últimas Transações de Entrada:</span>
                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                        {listaTransacoesUnificada.filter(t => t.tipo === 'ENTRADA').slice(0, 20).map((t) => (
                          <div key={t.id} className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800/80 flex justify-between items-center text-xs">
                            <div>
                              <span className="font-bold text-slate-200 block truncate">{t.descricao}</span>
                              <span className="text-[10px] text-slate-400">{t.categoria} • {new Date(t.data).toLocaleDateString('pt-BR')}</span>
                            </div>
                            <span className="font-bold text-emerald-400 text-xs shrink-0">+ R$ {t.valor.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {modalDetalhesMetrica === 'saidas' && (
                  <div className="space-y-3">
                    <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex justify-between items-center">
                      <span className="text-xs text-slate-400 font-semibold">Total de Despesas:</span>
                      <span className="text-xl font-black text-rose-400">R$ {totalDespesasPagas.toFixed(2)}</span>
                    </div>
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-300 block">Últimas Despesas Registradas:</span>
                      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                        {listaTransacoesUnificada.filter(t => t.tipo === 'SAIDA' && t.status === 'pago').slice(0, 25).map((t) => {
                          const descLimpa = t.descricao.replace(/\s*\(entrada manual\)/gi, '').trim();
                          return (
                            <div key={t.id} className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/80 flex items-start justify-between gap-4 text-xs">
                              <div className="flex-1 min-w-0">
                                <span className="font-bold text-slate-200 block line-clamp-2 leading-tight">
                                  {descLimpa}
                                </span>
                                <span className="text-[10px] text-slate-400 block mt-1">
                                  {t.categoria} • {new Date(t.data).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-black text-rose-400 text-xs block">
                                  - R$ {t.valor.toFixed(2)}
                                </span>
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
                    <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex justify-between items-center">
                      <span className="text-xs text-amber-400 font-semibold">Total de Contas Pendentes a Pagar:</span>
                      <span className="text-xl font-black text-amber-400">R$ {totalDespesasPendentes.toFixed(2)}</span>
                    </div>
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-300 block">Lista de Contas a Pagar:</span>
                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                        {listaTransacoesUnificada.filter(t => t.tipo === 'SAIDA' && t.status === 'pendente').map((t) => (
                          <div key={t.id} className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800/80 flex justify-between items-center text-xs">
                            <div>
                              <span className="font-bold text-slate-200 block truncate">{t.descricao}</span>
                              <span className="text-[10px] text-amber-400">Vencimento: {new Date(t.data).toLocaleDateString('pt-BR')}</span>
                            </div>
                            <span className="font-bold text-amber-400 text-xs shrink-0">R$ {t.valor.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {modalDetalhesMetrica === 'lucro' && (
                  <div className="space-y-3">
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2.5 text-xs">
                      <div className="flex justify-between items-center text-slate-300">
                        <span className="flex items-center gap-1.5 font-medium">
                          <ArrowUpRight className="w-4 h-4 text-emerald-400" /> (+) Entradas / Receitas Totais:
                        </span>
                        <span className="font-bold text-emerald-400 text-sm">+ R$ {totalReceitas.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between items-center text-slate-300">
                        <span className="flex items-center gap-1.5 font-medium">
                          <ArrowDownRight className="w-4 h-4 text-rose-400" /> (-) Saídas / Despesas Pagas:
                        </span>
                        <span className="font-bold text-rose-400 text-sm">- R$ {totalDespesasPagas.toFixed(2)}</span>
                      </div>

                      <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                        <span className="font-bold text-slate-100 text-sm">(=) Resultado Acumulado em Caixa:</span>
                        <span className={`text-lg font-black ${lucroLiquido >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
                          R$ {lucroLiquido.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                      💡 O resultado acumulado considera o fluxo financeiro efetivamente realizado (dinheiro que entrou menos o dinheiro que já foi pago). Contas pendentes a pagar de R$ {totalDespesasPendentes.toFixed(2)} ainda não foram debitadas.
                    </div>
                  </div>
                )}
              </div>

              <div className="p-2 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setModalDetalhesMetrica(null)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


