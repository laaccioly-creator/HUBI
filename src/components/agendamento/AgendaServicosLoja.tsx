// =============================================================================
// COMPONENTE: AgendaServicosLoja.tsx
// Painel Visual de Controle e Gestão da Agenda de Serviços da Loja
// =============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Clock,
  User,
  MapPin,
  Building2,
  Home,
  CheckCircle2,
  AlertCircle,
  PlayCircle,
  CheckCheck,
  CalendarDays,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Phone,
  Search,
  Filter,
  X,
  Ban,
  Receipt,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  CalendarClock,
  Sparkles,
  Scissors,
  Bell,
  Info
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { agendamentoService, formatarDataPtBr, timeStringToMinutes } from '../../services/agendamentoService';
import { SELECT_PROFISSIONAL_PUBLICO } from '../../lib/publicSelects';
import { whatsappWalletService } from '../../services/whatsappWalletService';
import { supabase } from '../../lib/supabase';
import { ModalLembretesPendentesAgenda } from './ModalLembretesPendentesAgenda';
import { ModalMiniCurriculoProfissional } from './ModalMiniCurriculoProfissional';
import { ReciboPedidoModal } from '../pedidos/ReciboPedidoModal';
import { obterDataLocalYYYYMMDD } from '../../utils/dateTime';
import type {
  AgendamentoServico,
  StatusAgendamento,
  ModalidadeLocalPrestacao,
  SlotHorarioDisponivel
} from '../../types/agendamento';
import type { Produto, UsuarioLoja, Cliente, Pedido } from '../../types';

export const AgendaServicosLoja: React.FC = () => {
  const { loja, usuario } = useAuth();
  const { isDark } = useTheme();
  const { mostrarSucesso, mostrarAviso, mostrarErro, mostrarToast } = useFeedbackModal();
  const navigate = useNavigate();

  // 1. Estados de Filtros e Seleção
  const [dataSelecionada, setDataSelecionada] = useState<string>(() => obterDataLocalYYYYMMDD());
  const [profissionalFiltro, setProfissionalFiltro] = useState<string>('todos');
  const [statusFiltro, setStatusFiltro] = useState<string>('todos');
  const [buscaTexto, setBuscaTexto] = useState<string>('');

  // 2. Estados de Dados
  const [agendamentos, setAgendamentos] = useState<AgendamentoServico[]>([]);
  const [profissionais, setProfissionais] = useState<UsuarioLoja[]>([]);
  const [servicos, setServicos] = useState<Produto[]>([]);
  const [duracoesCustomizadas, setDuracoesCustomizadas] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState<boolean>(true);
  const [enviandoWppId, setEnviandoWppId] = useState<string | null>(null);

  // 3. Estados de Modais
  const [modalNovoAberto, setModalNovoAberto] = useState<boolean>(false);
  const [modalLembretesAberto, setModalLembretesAberto] = useState<boolean>(false);
  const [totalLembretesPendentes, setTotalLembretesPendentes] = useState<number>(0);
  const [agendamentoParaRemarcar, setAgendamentoParaRemarcar] = useState<AgendamentoServico | null>(null);
  const [agendamentoParaCancelar, setAgendamentoParaCancelar] = useState<AgendamentoServico | null>(null);
  const [agendamentoEnderecoModal, setAgendamentoEnderecoModal] = useState<AgendamentoServico | null>(null);
  const [pedidoParaRecibo, setPedidoParaRecibo] = useState<Pedido | null>(null);
  const [carregandoReciboId, setCarregandoReciboId] = useState<string | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState<string>('');
  const [processandoAcaoId, setProcessandoAcaoId] = useState<string | null>(null);

  // Carrega contagem de lembretes pendentes dentro da janela da loja
  const carregarContadorLembretes = useCallback(async () => {
    if (!loja?.id) return;
    try {
      const pendentes = await agendamentoService.obterLembretesPendentesLoja(loja.id);
      setTotalLembretesPendentes(pendentes.length);
    } catch (err) {
      console.warn('Erro ao carregar contagem de lembretes pendentes:', err);
    }
  }, [loja?.id]);

  // Carrega lista de profissionais habilitados da loja
  const carregarProfissionais = useCallback(async () => {
    if (!loja?.id) return;
    try {
      const { data, error } = await supabase
        .from('usuarios_loja')
        .select(SELECT_PROFISSIONAL_PUBLICO)
        .eq('loja_id', loja.id)
        .eq('ativo', true)
        .eq('presta_servicos', true)
        .order('nome_completo', { ascending: true });

      if (!error && data) {
        setProfissionais(data as UsuarioLoja[]);
      }
    } catch (err) {
      console.warn('Erro ao carregar colaboradores de serviço:', err);
    }
  }, [loja?.id]);

  // Carrega produtos que são serviços
  const carregarServicos = useCallback(async () => {
    if (!loja?.id) return;
    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .eq('loja_id', loja.id)
        .eq('tipo_item', 'servico')
        .eq('ativo', true)
        .order('nome', { ascending: true });

      if (!error && data) {
        setServicos(data as Produto[]);
      }
    } catch (err) {
      console.warn('Erro ao carregar serviços cadastrados:', err);
    }
  }, [loja?.id]);

  // Carrega durações customizadas configuradas em servico_profissionais
  const carregarDuracoesCustomizadas = useCallback(async () => {
    if (!loja?.id) return;
    try {
      const { data, error } = await supabase
        .from('servico_profissionais')
        .select('produto_id, usuario_id, duracao_customizada_minutos')
        .eq('loja_id', loja.id)
        .eq('ativo', true);

      if (!error && data) {
        const mapa: Record<string, number> = {};
        data.forEach((row: { produto_id: string; usuario_id: string; duracao_customizada_minutos: number | null }) => {
          if (typeof row.duracao_customizada_minutos === 'number' && row.duracao_customizada_minutos > 0) {
            mapa[`${row.produto_id}:${row.usuario_id}`] = row.duracao_customizada_minutos;
          }
        });
        setDuracoesCustomizadas(mapa);
      }
    } catch (err) {
      console.warn('Erro ao carregar durações customizadas de profissionais:', err);
    }
  }, [loja?.id]);

  // Carrega agendamentos da data selecionada
  const carregarAgendamentos = useCallback(async () => {
    if (!loja?.id) return;
    setCarregando(true);
    try {
      const dados = await agendamentoService.listarAgendamentosLoja({
        lojaId: loja.id,
        dataInicio: dataSelecionada,
        dataFim: dataSelecionada,
        profissionalId: profissionalFiltro !== 'todos' ? profissionalFiltro : undefined,
        status: statusFiltro !== 'todos' ? (statusFiltro as StatusAgendamento) : undefined
      });
      setAgendamentos(dados || []);
    } catch (err: unknown) {
      console.error('[AgendaServicosLoja] Erro ao carregar agendamentos:', err);
      setAgendamentos([]);
      const errMsg = err instanceof Error ? err.message : String(err || 'Erro ao consultar agendamentos.');
      mostrarErro(errMsg, 'Erro ao Carregar Agenda');
    } finally {
      setCarregando(false);
    }
  }, [loja?.id, dataSelecionada, profissionalFiltro, statusFiltro, mostrarErro]);

  useEffect(() => {
    carregarProfissionais();
    carregarServicos();
    carregarDuracoesCustomizadas();
  }, [carregarProfissionais, carregarServicos, carregarDuracoesCustomizadas]);

  useEffect(() => {
    carregarAgendamentos();
    carregarContadorLembretes();
  }, [carregarAgendamentos, carregarContadorLembretes]);

  // Navegação de Dias
  const mudarDia = (deltaDias: number) => {
    const [ano, mes, dia] = dataSelecionada.split('-').map(Number);
    const novaData = new Date(ano, mes - 1, dia);
    novaData.setDate(novaData.getDate() + deltaDias);
    const str = `${novaData.getFullYear()}-${String(novaData.getMonth() + 1).padStart(2, '0')}-${String(novaData.getDate()).padStart(2, '0')}`;
    setDataSelecionada(str);
  };

  const hojeStr = useMemo(() => {
    const agora = new Date();
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  }, []);

  const amanhaStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const servicosPorId = useMemo(() => {
    const mapa = new Map<string, Produto>();
    servicos.forEach((s) => mapa.set(s.id, s));
    return mapa;
  }, [servicos]);

  // Calcula duração real do agendamento em minutos (customizada -> produto -> registro -> diferença início/fim)
  const calcularDuracaoMinutos = useCallback((item: AgendamentoServico): number => {
    const duracaoCustomizada = duracoesCustomizadas[`${item.produto_id}:${item.profissional_id}`];
    if (typeof duracaoCustomizada === 'number' && duracaoCustomizada > 0) {
      return duracaoCustomizada;
    }

    const duracaoProduto =
      item.produto?.duracao_estimada_minutos ??
      servicosPorId.get(item.produto_id)?.duracao_estimada_minutos;
    if (typeof duracaoProduto === 'number' && duracaoProduto > 0) {
      return duracaoProduto;
    }

    if (typeof item.duracao_minutos === 'number' && item.duracao_minutos > 0) {
      return item.duracao_minutos;
    }

    const inicioMin = timeStringToMinutes(item.hora_inicio);
    const fimMin = timeStringToMinutes(item.hora_fim);
    const diffMin = fimMin - inicioMin;
    if (diffMin > 0) {
      return diffMin;
    }

    return 30;
  }, [duracoesCustomizadas, servicosPorId]);

  // Métricas do Dia
  const metricas = useMemo(() => {
    const total = agendamentos.length;
    const confirmados = agendamentos.filter((a) => a.status_agendamento === 'confirmado').length;
    const agendados = agendamentos.filter((a) => a.status_agendamento === 'agendado').length;
    const concluidos = agendamentos.filter((a) => a.status_agendamento === 'concluido').length;
    const emAtendimento = agendamentos.filter((a) => a.status_agendamento === 'em_atendimento').length;
    const cancelados = agendamentos.filter((a) => a.status_agendamento === 'cancelado').length;
    return { total, confirmados, agendados, concluidos, emAtendimento, cancelados };
  }, [agendamentos]);

  // Agendamentos Filtrados por Busca de Texto
  const agendamentosFiltrados = useMemo(() => {
    if (!buscaTexto.trim()) return agendamentos;
    const t = buscaTexto.toLowerCase().trim();
    return agendamentos.filter(
      (a) =>
        a.cliente_nome.toLowerCase().includes(t) ||
        a.cliente_whatsapp.includes(t) ||
        (a.produto?.nome && a.produto.nome.toLowerCase().includes(t)) ||
        (a.profissional?.nome_completo && a.profissional.nome_completo.toLowerCase().includes(t))
    );
  }, [agendamentos, buscaTexto]);

  // Transição de Status
  const handleAlterarStatus = async (agendamentoId: string, novoStatus: StatusAgendamento, motivo?: string) => {
    if (!loja?.id) return;
    setProcessandoAcaoId(agendamentoId);
    try {
      await agendamentoService.alterarStatusAgendamento(loja.id, agendamentoId, novoStatus, motivo);
      mostrarToast(`Status atualizado para "${novoStatus}".`, 'sucesso');
      await carregarAgendamentos();
    } catch (err: unknown) {
      console.error('Erro ao alterar status:', err);
      const errMsg = err instanceof Error ? err.message : 'Erro ao atualizar status do agendamento.';
      mostrarErro(errMsg);
    } finally {
      setProcessandoAcaoId(null);
      setAgendamentoParaCancelar(null);
      setMotivoCancelamento('');
    }
  };

  // Disparo de Lembrete / Confirmação via WhatsApp
  const handleDispararWhatsApp = async (agendamento: AgendamentoServico, tipo: 'confirmacao_criacao' | 'lembrete') => {
    if (!loja?.id || !agendamento.cliente_whatsapp) {
      mostrarAviso('Agendamento não possui número de WhatsApp do cliente cadastrado.');
      return;
    }

    setEnviandoWppId(agendamento.id);
    const mensagem = agendamentoService.gerarMensagemWhatsappAgendamento(agendamento, loja, tipo);

    try {
      const resp = await whatsappWalletService.dispararNotificacaoHibrida({
        lojaId: loja.id,
        loja,
        telefoneDestino: agendamento.cliente_whatsapp,
        mensagem,
        eventoGatilho: tipo === 'confirmacao_criacao' ? 'agendamento_criado' : 'lembrete_agendamento',
        pedidoId: agendamento.pedido_id,
        clienteId: agendamento.cliente_id,
        usuarioId: usuario?.id
      });

      if (resp.modoEnvio === 'manual_link' && resp.manualUrl) {
        window.open(resp.manualUrl, '_blank');
        mostrarToast('Link do WhatsApp aberto para envio manual.', 'info');
      } else if (resp.sucesso) {
        mostrarSucesso('Mensagem de agendamento enviada automaticamente com sucesso!');
        // Registra que lembrete foi enviado
        if (tipo === 'lembrete') {
          await supabase
            .from('agendamentos_servicos')
            .update({ lembrete_enviado: true, lembrete_enviado_em: new Date().toISOString() })
            .eq('id', agendamento.id)
            .eq('loja_id', loja.id);
          carregarAgendamentos();
        }
      } else {
        const telLimpo = agendamento.cliente_whatsapp.replace(/\D/g, '');
        const urlFallback = `https://wa.me/55${telLimpo}?text=${encodeURIComponent(mensagem)}`;
        window.open(urlFallback, '_blank');
        mostrarToast('Link manual do WhatsApp aberto.', 'info');
      }
    } catch (err: unknown) {
      console.warn('Falha no disparo automático, abrindo fallback:', err);
      const telLimpo = agendamento.cliente_whatsapp.replace(/\D/g, '');
      const urlFallback = `https://wa.me/55${telLimpo}?text=${encodeURIComponent(mensagem)}`;
      window.open(urlFallback, '_blank');
    } finally {
      setEnviandoWppId(null);
    }
  };

  // Carrega o pedido completo vinculado e abre o ReciboPedidoModal
  const handleAbrirReciboPedido = useCallback(async (agendamento: AgendamentoServico) => {
    if (!loja?.id || !agendamento.pedido_id) {
      mostrarAviso('Este agendamento não possui pedido vinculado.');
      return;
    }

    setCarregandoReciboId(agendamento.id);
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          *,
          cliente:clientes(*),
          vendedor:usuarios_loja!pedidos_vendedor_id_fkey(*),
          atualizado_por_usuario:usuarios_loja!pedidos_atualizado_por_fkey(*),
          itens:itens_pedido(*),
          pagamentos:pagamentos_pedido(
            *,
            forma_pagamento:formas_pagamento(*)
          )
        `)
        .eq('loja_id', String(loja.id))
        .eq('id', agendamento.pedido_id)
        .maybeSingle();

      if (error || !data) {
        mostrarErro('Não foi possível carregar os dados do recibo deste pedido.');
        return;
      }

      setPedidoParaRecibo(data as unknown as Pedido);
    } catch {
      mostrarErro('Não foi possível carregar o recibo do pedido. Tente novamente.');
    } finally {
      setCarregandoReciboId(null);
    }
  }, [loja?.id, mostrarAviso, mostrarErro]);

  // Badge de Status
  const renderBadgeStatus = (status: StatusAgendamento) => {
    switch (status) {
      case 'confirmado':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
              isDark
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Confirmado
          </span>
        );
      case 'agendado':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
              isDark
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Aguardando Confirmação
          </span>
        );
      case 'em_atendimento':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
              isDark
                ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                : 'bg-purple-50 text-purple-700 border-purple-200'
            }`}
          >
            <PlayCircle className="w-3.5 h-3.5 animate-pulse" />
            Em Atendimento
          </span>
        );
      case 'concluido':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
              isDark
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Concluído
          </span>
        );
      case 'cancelado':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
              isDark
                ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            <X className="w-3.5 h-3.5" />
            Cancelado
          </span>
        );
      case 'nao_compareceu':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
              isDark
                ? 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Não Compareceu
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`flex flex-col h-full w-full overflow-hidden font-sans ${isDark ? 'bg-[#0B0F17] text-white' : 'bg-slate-50 text-slate-900'}`}>
      {/* BLOCO SUPERIOR: CABEÇALHO + KPIs + BARRA UNIFICADA DE BUSCA/FILTROS */}
      <div className={`p-4 md:p-6 border-b space-y-4 shrink-0 ${
        isDark ? 'border-slate-800/80 bg-[#0B0F17]' : 'border-slate-200/80 bg-slate-50'
      }`}>
        {/* 1. CABEÇALHO SUPERIOR & AÇÕES */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className={`p-2.5 rounded-xl border transition cursor-pointer shrink-0 ${
                isDark
                  ? 'bg-[#05080f] border-slate-800/80 hover:bg-slate-900 text-white'
                  : 'bg-white border-slate-200/80 hover:bg-slate-50 text-slate-900 shadow-xs'
              }`}
              title="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className={`text-2xl font-black flex items-center gap-2.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <CalendarIcon className="w-7 h-7 text-emerald-500 shrink-0" />
                <span>Agenda de Serviços</span>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                    isDark
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  }`}
                >
                  {metricas.total}
                </span>
              </h1>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Controle de horários, expediente de profissionais e lembretes via WhatsApp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
            <button
              type="button"
              onClick={() => {
                carregarAgendamentos();
                carregarContadorLembretes();
              }}
              disabled={carregando}
              className={`h-10 px-3.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
                isDark
                  ? 'border-slate-800/80 bg-[#05080f] hover:bg-slate-900 text-slate-200'
                  : 'border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700'
              }`}
              title="Atualizar Agenda"
            >
              <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin text-emerald-500' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>

            {/* Botão de Lembretes Pendentes */}
            <button
              type="button"
              onClick={() => setModalLembretesAberto(true)}
              className={`h-10 px-3.5 rounded-xl border text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer shadow-xs ${
                totalLembretesPendentes > 0
                  ? isDark
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
                    : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                  : isDark
                  ? 'border-slate-800/80 bg-[#05080f] hover:bg-slate-900 text-slate-200'
                  : 'border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700'
              }`}
              title="Lembretes de atendimento via WhatsApp"
            >
              <Bell className={`w-4 h-4 ${totalLembretesPendentes > 0 ? 'text-amber-500 animate-bounce' : ''}`} />
              <span className="hidden sm:inline">Lembretes</span>
              {totalLembretesPendentes > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black leading-none">
                  {totalLembretesPendentes}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setModalNovoAberto(true)}
              className="hubi-btn-cta h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center justify-center gap-2 transition cursor-pointer shadow-sm border border-emerald-500"
            >
              <Plus className="w-4 h-4" />
              <span>+ Novo Agendamento</span>
            </button>
          </div>
        </div>

        {/* 2. CARDS DE MÉTRICAS (4 KPI CARDS CENTRALIZADOS) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={`rounded-2xl shadow-sm p-5 text-center border ${
            isDark ? 'bg-[#05080f] border-slate-800/80' : 'bg-white border-slate-200/80'
          }`}>
            <span className={`text-xs font-bold uppercase tracking-wider block ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              TOTAL DO DIA
            </span>
            <span className={`text-2xl font-extrabold mt-1 block ${
              isDark ? 'text-white' : 'text-slate-900'
            }`}>
              {metricas.total}
            </span>
          </div>

          <div className={`rounded-2xl shadow-sm p-5 text-center border ${
            isDark ? 'bg-[#05080f] border-slate-800/80' : 'bg-white border-slate-200/80'
          }`}>
            <span className={`text-xs font-bold uppercase tracking-wider block ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              CONFIRMADOS
            </span>
            <span className={`text-2xl font-extrabold mt-1 block ${
              isDark ? 'text-emerald-400' : 'text-emerald-600'
            }`}>
              {metricas.confirmados}
            </span>
          </div>

          <div className={`rounded-2xl shadow-sm p-5 text-center border ${
            isDark ? 'bg-[#05080f] border-slate-800/80' : 'bg-white border-slate-200/80'
          }`}>
            <span className={`text-xs font-bold uppercase tracking-wider block ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              AGUARDANDO CONFIRMAÇÃO
            </span>
            <span className={`text-2xl font-extrabold mt-1 block ${
              isDark ? 'text-amber-400' : 'text-amber-600'
            }`}>
              {metricas.agendados}
            </span>
          </div>

          <div className={`rounded-2xl shadow-sm p-5 text-center border ${
            isDark ? 'bg-[#05080f] border-slate-800/80' : 'bg-white border-slate-200/80'
          }`}>
            <span className={`text-xs font-bold uppercase tracking-wider block ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              CONCLUÍDOS
            </span>
            <span className={`text-2xl font-extrabold mt-1 block ${
              isDark ? 'text-blue-400' : 'text-blue-600'
            }`}>
              {metricas.concluidos}
            </span>
          </div>
        </div>

        {/* 3. BARRA DE FILTROS E BUSCA UNIFICADA */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Input de Busca Principal à Esquerda */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`} />
            <input
              type="text"
              placeholder="Buscar cliente, serviço ou telefone..."
              value={buscaTexto}
              onChange={(e) => setBuscaTexto(e.target.value)}
              className={`w-full h-10 rounded-xl pl-10 pr-9 text-xs font-medium transition shadow-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                isDark
                  ? 'bg-[#0f172a] border border-slate-800 text-white placeholder-slate-400 focus:border-emerald-500'
                  : 'bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-emerald-500'
              }`}
            />
            {buscaTexto && (
              <button
                type="button"
                onClick={() => setBuscaTexto('')}
                className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer ${
                  isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Navegação de Data + Hoje / Amanhã */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`h-10 inline-flex items-center gap-1 rounded-xl border px-1 shadow-xs ${
              isDark ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <button
                type="button"
                onClick={() => mudarDia(-1)}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700'
                }`}
                title="Dia Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 px-1.5">
                <CalendarIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                <input
                  type="date"
                  value={dataSelecionada}
                  onChange={(e) => setDataSelecionada(e.target.value)}
                  className={`bg-transparent font-bold text-xs focus:outline-none cursor-pointer ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                />
              </div>

              <button
                type="button"
                onClick={() => mudarDia(1)}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700'
                }`}
                title="Próximo Dia"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className={`h-10 inline-flex items-center gap-1 p-1 rounded-xl border shadow-xs ${
              isDark ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <button
                type="button"
                onClick={() => setDataSelecionada(hojeStr)}
                className={`h-8 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                  dataSelecionada === hojeStr
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : isDark
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setDataSelecionada(amanhaStr)}
                className={`h-8 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                  dataSelecionada === amanhaStr
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : isDark
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Amanhã
              </button>
            </div>
          </div>

          {/* Selects Profissional e Status */}
          <select
            value={profissionalFiltro}
            onChange={(e) => setProfissionalFiltro(e.target.value)}
            className={`h-10 px-3 rounded-xl border text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer ${
              isDark
                ? 'bg-[#0f172a] border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <option value="todos">Todos os Profissionais</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome_completo} {p.especialidade_cargo ? `(${p.especialidade_cargo})` : ''}
              </option>
            ))}
          </select>

          <select
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
            className={`h-10 px-3 rounded-xl border text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer ${
              isDark
                ? 'bg-[#0f172a] border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <option value="todos">Todos os Status</option>
            <option value="agendado">Aguardando Confirmação</option>
            <option value="confirmado">Confirmados</option>
            <option value="em_atendimento">Em Atendimento</option>
            <option value="concluido">Concluídos</option>
            <option value="cancelado">Cancelados</option>
          </select>
        </div>
      </div>

      {/* ALERTA DE LEMBRETES PENDENTES */}
      {totalLembretesPendentes > 0 && (
        <div className={`mx-4 md:mx-6 mt-4 p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shrink-0 ${
          isDark
            ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              Você tem <strong>{totalLembretesPendentes} lembrete(s) pendente(s)</strong> para atendimentos próximos. Notifique seus clientes para garantir presença!
            </span>
          </div>
          <button
            type="button"
            onClick={() => setModalLembretesAberto(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 cursor-pointer transition shadow-xs self-end sm:self-auto"
          >
            Ver Fila de Lembretes ({totalLembretesPendentes})
          </button>
        </div>
      )}

      {/* 4. LISTAGEM EM TABELA/LISTA UNIFICADA */}
      <div className="flex-1 min-h-0 overflow-hidden p-4 md:p-6 flex flex-col">
        {carregando ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            <span className="text-xs font-bold">Carregando horários agendados...</span>
          </div>
        ) : agendamentosFiltrados.length === 0 ? (
          <div className={`flex flex-col items-center justify-center py-16 px-4 rounded-2xl border text-center shadow-sm ${
            isDark ? 'bg-[#05080f] border-slate-800/90' : 'bg-white border-slate-200'
          }`}>
            <CalendarDays className="w-12 h-12 text-slate-500 mb-3 opacity-40" />
            <h3 className={`font-bold text-sm sm:text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Nenhum agendamento para esta data
            </h3>
            <p className={`text-xs mt-1 max-w-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Não há clientes agendados para {formatarDataPtBr(dataSelecionada)} com os filtros atuais.
            </p>
            <button
              type="button"
              onClick={() => setModalNovoAberto(true)}
              className="hubi-btn-cta mt-4 h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Agendar Novo Horário</span>
            </button>
          </div>
        ) : (
          <div className={`flex-1 min-h-0 flex flex-col rounded-2xl border overflow-hidden shadow-sm ${
            isDark ? 'bg-[#05080f] border-slate-800/90' : 'bg-white border-slate-200'
          }`}>
            {/* Cabeçalho da Tabela/Lista */}
            <div className={`hidden md:grid md:grid-cols-[110px_minmax(220px,1.7fr)_minmax(150px,1.1fr)_minmax(130px,0.9fr)_minmax(160px,1fr)_minmax(185px,1.1fr)] gap-4 items-center text-[11px] font-bold uppercase tracking-wider px-5 py-3.5 border-b shrink-0 ${
              isDark
                ? 'text-slate-400 bg-[#0b111a] border-slate-800'
                : 'text-slate-500 bg-slate-50/80 border-slate-200'
            }`}>
              <span>HORÁRIO</span>
              <span>SERVIÇO &amp; PROFISSIONAL</span>
              <span>CLIENTE</span>
              <span>LOCAL</span>
              <span>STATUS</span>
              <span className="text-right">AÇÕES</span>
            </div>

            {/* Linhas com scroll */}
            <div className={`flex-1 min-h-0 overflow-y-auto divide-y ${
              isDark ? 'divide-slate-800/70' : 'divide-slate-100'
            }`}>
              {agendamentosFiltrados.map((item) => {
                const modalidade = item.modalidade_local as string;
                const isExterno = modalidade === 'externo' || modalidade === 'domicilio';
                const duracaoMinutos = calcularDuracaoMinutos(item);

                return (
                  <div
                    key={item.id}
                    className={`grid grid-cols-1 md:grid-cols-[110px_minmax(220px,1.7fr)_minmax(150px,1.1fr)_minmax(130px,0.9fr)_minmax(160px,1fr)_minmax(185px,1.1fr)] gap-3 md:gap-4 items-start md:items-center px-5 py-4 transition-colors ${
                      isDark ? 'hover:bg-slate-900/40' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* 1. HORÁRIO */}
                    <div>
                      <div
                        className={`w-24 rounded-xl p-2 text-center border ${
                          isDark
                            ? 'bg-slate-800/80 border-slate-700/60'
                            : 'bg-slate-100 border-slate-200/80'
                        }`}
                      >
                        <span className={`text-sm font-extrabold block leading-tight ${
                          isDark ? 'text-emerald-400' : 'text-emerald-600'
                        }`}>
                          {(item.hora_inicio || '').slice(0, 5)}
                        </span>
                        <span className={`text-[11px] font-medium block mt-0.5 ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}>
                          até {(item.hora_fim || '').slice(0, 5)}
                        </span>
                      </div>
                    </div>

                    {/* 2. SERVIÇO & PROFISSIONAL */}
                    <div className="min-w-0 space-y-1">
                      <h4 className={`font-bold text-sm truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {item.produto?.nome || 'Serviço Agendado'}
                      </h4>

                      <div className={`flex items-center gap-3 text-xs flex-wrap ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}>
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          {item.profissional?.url_foto ? (
                            <img
                              src={item.profissional.url_foto}
                              alt={item.profissional.nome_completo || 'Profissional'}
                              className="w-5 h-5 rounded-md object-cover shrink-0 border border-emerald-500/30"
                            />
                          ) : (
                            <User className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          )}
                          <span className={`font-medium truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            {item.profissional?.nome_completo || 'Não informado'}
                          </span>
                          {item.profissional?.especialidade_cargo && (
                            <span className="text-[11px] opacity-75">
                              ({item.profissional.especialidade_cargo})
                            </span>
                          )}
                        </span>

                        <span className="inline-flex items-center gap-1 shrink-0">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Duração: {duracaoMinutos} min</span>
                        </span>
                      </div>

                      {/* Alerta Operacional de Material para Levar (Pedido Híbrido) */}
                      {item.pedido?.levar_produto_no_atendimento === true &&
                        (item.itens_fisicos_levar?.length || 0) > 0 && (
                          <div className={`mt-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-start gap-1.5 ${
                            isDark
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                              : 'border-amber-300 bg-amber-50 text-amber-800'
                          }`}>
                            <span className="shrink-0">📦</span>
                            <span>
                              Material para levar na visita (Pedido #{item.pedido.numero_pedido}):{' '}
                              {item.itens_fisicos_levar!
                                .map(
                                  (prod) =>
                                    `${prod.quantidade}x ${prod.nome_produto}${
                                      prod.rotulo_variacao ? ` (${prod.rotulo_variacao})` : ''
                                    }`
                                )
                                .join(', ')}
                            </span>
                          </div>
                        )}

                      {/* Observações */}
                      {item.observacoes && (
                        <p className={`text-[11px] italic pt-0.5 truncate ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`} title={item.observacoes}>
                          Obs: {item.observacoes}
                        </p>
                      )}
                    </div>

                    {/* 3. CLIENTE */}
                    <div className="min-w-0">
                      <span className={`text-xs font-bold block truncate ${
                        isDark ? 'text-white' : 'text-slate-900'
                      }`}>
                        {item.cliente_nome}
                      </span>
                      <span className={`text-xs block truncate ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}>
                        {item.cliente_whatsapp}
                      </span>
                    </div>

                    {/* 4. LOCAL */}
                    <div className="min-w-0">
                      {isExterno ? (
                        <button
                          type="button"
                          onClick={() => setAgendamentoEnderecoModal(item)}
                          title="Clique para ver o endereço e o mapa"
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border cursor-pointer transition-colors ${
                            isDark
                              ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                          }`}
                        >
                          <Home className="w-3 h-3 shrink-0" />
                          Em Domicílio
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          isDark
                            ? 'bg-slate-800/80 text-slate-300 border-slate-700/70'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          <Building2 className="w-3 h-3 shrink-0" />
                          Na Loja
                        </span>
                      )}
                    </div>

                    {/* 5. STATUS */}
                    <div>{renderBadgeStatus(item.status_agendamento)}</div>

                    {/* 6. AÇÕES */}
                    <div className="flex items-center justify-start md:justify-end gap-1.5 flex-wrap">
                      {/* 1 Ação Principal Contextual */}
                      {item.status_agendamento === 'agendado' && (
                        <button
                          type="button"
                          disabled={processandoAcaoId === item.id}
                          onClick={() => handleAlterarStatus(item.id, 'confirmado')}
                          className="hubi-btn-cta bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-3.5 py-1.5 text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                          title="Confirmar agendamento"
                        >
                          {processandoAcaoId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>Confirmar</span>
                        </button>
                      )}

                      {item.status_agendamento === 'confirmado' && (
                        <button
                          type="button"
                          disabled={processandoAcaoId === item.id}
                          onClick={() => handleAlterarStatus(item.id, 'em_atendimento')}
                          className="hubi-btn-cta bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-3.5 py-1.5 text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                          title="Iniciar atendimento"
                        >
                          {processandoAcaoId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <PlayCircle className="w-3.5 h-3.5" />
                          )}
                          <span>Iniciar</span>
                        </button>
                      )}

                      {item.status_agendamento === 'em_atendimento' && (
                        <button
                          type="button"
                          disabled={processandoAcaoId === item.id}
                          onClick={() => handleAlterarStatus(item.id, 'concluido')}
                          className="hubi-btn-cta bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl px-3.5 py-1.5 text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                          title="Concluir atendimento"
                        >
                          {processandoAcaoId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCheck className="w-3.5 h-3.5" />
                          )}
                          <span>Concluir</span>
                        </button>
                      )}

                      {/* Ver Recibo do Pedido */}
                      {item.pedido_id && (
                        <button
                          type="button"
                          disabled={carregandoReciboId === item.id}
                          onClick={() => void handleAbrirReciboPedido(item)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-40 ${
                            isDark
                              ? 'text-slate-300 hover:text-white hover:bg-slate-800'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                          title="Ver Recibo do Pedido"
                        >
                          {carregandoReciboId === item.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Receipt className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      {/* Lembrete / Cobrar Confirmação via WhatsApp */}
                      <button
                        type="button"
                        disabled={enviandoWppId === item.id || item.status_agendamento === 'cancelado'}
                        onClick={() =>
                          handleDispararWhatsApp(
                            item,
                            item.status_agendamento === 'agendado' ? 'confirmacao_criacao' : 'lembrete'
                          )
                        }
                        className={`p-1.5 rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          isDark
                            ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15'
                            : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title={
                          item.status_agendamento === 'agendado'
                            ? 'Cobrar confirmação via WhatsApp'
                            : 'Lembrete WhatsApp'
                        }
                      >
                        {enviandoWppId === item.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <MessageCircle className="w-4 h-4" />
                        )}
                      </button>

                      {/* Remarcar */}
                      {item.status_agendamento !== 'cancelado' && item.status_agendamento !== 'concluido' && (
                        <button
                          type="button"
                          onClick={() => setAgendamentoParaRemarcar(item)}
                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                            isDark
                              ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                          title="Remarcar horário"
                        >
                          <CalendarClock className="w-4 h-4" />
                        </button>
                      )}

                      {/* Cancelar */}
                      {item.status_agendamento !== 'cancelado' && item.status_agendamento !== 'concluido' && (
                        <button
                          type="button"
                          onClick={() => setAgendamentoParaCancelar(item)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isDark
                              ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10'
                              : 'text-rose-500 hover:text-rose-600 hover:bg-rose-50'
                          }`}
                          title="Cancelar agendamento"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 5. MODAL: NOVO AGENDAMENTO AVULSO NA RETAGUARDA */}
      {modalNovoAberto && (
        <ModalNovoAgendamentoAvulso
          isOpen={modalNovoAberto}
          onClose={() => setModalNovoAberto(false)}
          lojaId={loja?.id || ''}
          servicosDisponiveis={servicos}
          profissionaisDisponiveis={profissionais}
          onAgendamentoCriado={() => {
            setModalNovoAberto(false);
            carregarAgendamentos();
          }}
        />
      )}

      {/* 6. MODAL: REMARCAÇÃO RÁPIDA PELA RETAGUARDA */}
      {agendamentoParaRemarcar && (
        <ModalRemarcarAgendamentoRetaguarda
          isOpen={Boolean(agendamentoParaRemarcar)}
          onClose={() => setAgendamentoParaRemarcar(null)}
          agendamento={agendamentoParaRemarcar}
          duracaoMinutos={calcularDuracaoMinutos(agendamentoParaRemarcar)}
          profissionais={profissionais}
          onRemarcado={() => {
            setAgendamentoParaRemarcar(null);
            mostrarSucesso('Agendamento remarcado com sucesso!');
            carregarAgendamentos();
          }}
        />
      )}

      {/* 7. MODAL: CANCELAMENTO */}
      {agendamentoParaCancelar && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-md rounded-3xl p-5 border shadow-2xl space-y-4 ${
            isDark ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
          }`}>
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
              <h3 className="font-bold text-sm flex items-center gap-2 text-rose-500">
                <AlertCircle className="w-5 h-5" />
                Confirmar Cancelamento
              </h3>
              <button
                type="button"
                onClick={() => setAgendamentoParaCancelar(null)}
                className={`hubi-btn-close-x p-1.5 rounded-xl border transition cursor-pointer ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Tem certeza que deseja cancelar o agendamento de{' '}
              <strong className={isDark ? 'text-white' : 'text-slate-900'}>
                {agendamentoParaCancelar.cliente_nome}
              </strong>{' '}
              para o serviço{' '}
              <strong className={isDark ? 'text-white' : 'text-slate-900'}>
                {agendamentoParaCancelar.produto?.nome || 'Serviço'}
              </strong>{' '}
              às {agendamentoParaCancelar.hora_inicio}?
            </p>

            <div>
              <label className="text-xs font-bold block mb-1">Motivo do cancelamento (opcional):</label>
              <input
                type="text"
                placeholder="Ex: Cliente solicitou cancelamento por telefone"
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-rose-500 ${
                  isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAgendamentoParaCancelar(null)}
                className="hubi-btn-neutral px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white cursor-pointer transition"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={processandoAcaoId === agendamentoParaCancelar.id}
                onClick={() => handleAlterarStatus(agendamentoParaCancelar.id, 'cancelado', motivoCancelamento)}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                {processandoAcaoId === agendamentoParaCancelar.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                )}
                <span>Cancelar e Liberar Vaga</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL: FILA DE LEMBRETES PENDENTES WHATSAPP */}
      {modalLembretesAberto && loja && (
        <ModalLembretesPendentesAgenda
          isOpen={modalLembretesAberto}
          onClose={() => setModalLembretesAberto(false)}
          loja={loja}
          onLembretesAtualizados={() => {
            carregarAgendamentos();
            carregarContadorLembretes();
          }}
        />
      )}

      {/* 9. MODAL COMPACTO: LOCAL DE ATENDIMENTO EM DOMICÍLIO */}
      {agendamentoEnderecoModal && loja && (
        <ModalEnderecoDomicilioAgenda
          isOpen={Boolean(agendamentoEnderecoModal)}
          agendamento={agendamentoEnderecoModal}
          lojaId={String(loja.id)}
          onClose={() => setAgendamentoEnderecoModal(null)}
        />
      )}

      {/* 10. MODAL DE RECIBO DO PEDIDO VINCULADO */}
      <ReciboPedidoModal
        isOpen={Boolean(pedidoParaRecibo)}
        pedido={pedidoParaRecibo}
        loja={loja}
        onClose={() => setPedidoParaRecibo(null)}
      />
    </div>
  );
};

// =============================================================================
// SUBCOMPONENTE MODAL: NOVO AGENDAMENTO AVULSO NA RETAGUARDA
// =============================================================================

interface ModalNovoAgendamentoAvulsoProps {
  isOpen: boolean;
  onClose: () => void;
  lojaId: string;
  servicosDisponiveis: Produto[];
  profissionaisDisponiveis: UsuarioLoja[];
  onAgendamentoCriado: () => void;
}

const ModalNovoAgendamentoAvulso: React.FC<ModalNovoAgendamentoAvulsoProps> = ({
  isOpen,
  onClose,
  lojaId,
  servicosDisponiveis,
  profissionaisDisponiveis,
  onAgendamentoCriado
}) => {
  useRegisterOverlay(isOpen, onClose, 'modal-novo-agendamento-avulso');
  const { isDark } = useTheme();
  const { mostrarAviso, mostrarErro, mostrarSucesso } = useFeedbackModal();

  const [clienteNome, setClienteNome] = useState<string>('');
  const [clienteWhatsapp, setClienteWhatsapp] = useState<string>('');
  const [servicoId, setServicoId] = useState<string>('');
  const [profissionalId, setProfissionalId] = useState<string>('');
  const [dataAgendamento, setDataAgendamento] = useState<string>(() => obterDataLocalYYYYMMDD());
  const [modalidadeLocal, setModalidadeLocal] = useState<ModalidadeLocalPrestacao>('loja');
  const [enderecoSnapshot, setEnderecoSnapshot] = useState<string>('');
  const [observacoes, setObservacoes] = useState<string>('');

  const [slotsDisponiveis, setSlotsDisponiveis] = useState<SlotHorarioDisponivel[]>([]);
  const [slotSelecionado, setSlotSelecionado] = useState<SlotHorarioDisponivel | null>(null);
  const [carregandoSlots, setCarregandoSlots] = useState<boolean>(false);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [profissionalCurriculo, setProfissionalCurriculo] = useState<UsuarioLoja | null>(null);

  // Inicializa com primeiro serviço
  useEffect(() => {
    if (servicosDisponiveis.length > 0 && !servicoId) {
      setServicoId(servicosDisponiveis[0].id);
    }
  }, [servicosDisponiveis, servicoId]);

  // Inicializa com primeiro profissional
  useEffect(() => {
    if (profissionaisDisponiveis.length > 0 && !profissionalId) {
      setProfissionalId(profissionaisDisponiveis[0].id);
    }
  }, [profissionaisDisponiveis, profissionalId]);

  const servicoAtual = useMemo(() => {
    return servicosDisponiveis.find((s) => s.id === servicoId);
  }, [servicosDisponiveis, servicoId]);

  // Recalcular slots quando mudar profissional, data ou serviço
  useEffect(() => {
    if (!lojaId || !servicoId || !profissionalId || !dataAgendamento) {
      setSlotsDisponiveis([]);
      setSlotSelecionado(null);
      return;
    }

    let ativo = true;
    setCarregandoSlots(true);
    setSlotSelecionado(null);

    const duracao = servicoAtual?.duracao_estimada_minutos || 30;

    agendamentoService
      .calcularSlotsDisponiveis(lojaId, servicoId, profissionalId, dataAgendamento, duracao)
      .then((slots) => {
        if (ativo) {
          setSlotsDisponiveis(slots);
        }
      })
      .catch((err) => {
        console.error('Erro ao calcular horários livres:', err);
      })
      .finally(() => {
        if (ativo) setCarregandoSlots(false);
      });

    return () => {
      ativo = false;
    };
  }, [lojaId, servicoId, profissionalId, dataAgendamento, servicoAtual]);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteNome.trim()) {
      mostrarAviso('Informe o nome do cliente.');
      return;
    }
    if (!clienteWhatsapp.trim()) {
      mostrarAviso('Informe o WhatsApp do cliente para envio de confirmação.');
      return;
    }
    if (!servicoId) {
      mostrarAviso('Selecione um serviço.');
      return;
    }
    if (!profissionalId) {
      mostrarAviso('Selecione um profissional habilitado.');
      return;
    }
    if (!slotSelecionado) {
      mostrarAviso('Selecione um horário disponível no quadro abaixo.');
      return;
    }
    if (modalidadeLocal === 'externo' && !enderecoSnapshot.trim()) {
      mostrarAviso('Para atendimento externo, informe o endereço de prestação do serviço.');
      return;
    }

    setSalvando(true);
    try {
      await agendamentoService.criarAgendamento({
        lojaId,
        produtoId: servicoId,
        profissionalId,
        clienteNome,
        clienteWhatsapp,
        dataAgendamento,
        horaInicio: slotSelecionado.hora_inicio,
        horaFim: slotSelecionado.hora_fim,
        modalidadeLocal,
        enderecoPrestacaoSnapshot: modalidadeLocal === 'externo' ? enderecoSnapshot.trim() : null,
        observacoes: observacoes.trim() || null
      });

      mostrarSucesso('Agendamento criado com sucesso!');
      onAgendamentoCriado();
    } catch (err: unknown) {
      console.error('Erro ao criar agendamento:', err);
      const errMsg = err instanceof Error ? err.message : 'Falha ao registrar agendamento.';
      mostrarErro(errMsg);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in">
      <div className={`w-full max-w-xl max-h-[90vh] rounded-3xl border flex flex-col shadow-2xl overflow-hidden ${
        isDark ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
      }`}>
        <div className="p-4 border-b border-slate-700/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-emerald-500" />
            <h3 className="font-bold text-sm sm:text-base">Novo Agendamento Avulso</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`hubi-btn-close-x p-1.5 rounded-xl border transition cursor-pointer ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSalvar} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Dados do Cliente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold block mb-1">Nome do Cliente *</label>
              <input
                type="text"
                required
                placeholder="Ex: João da Silva"
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 ${
                  isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div>
              <label className="text-xs font-bold block mb-1">WhatsApp do Cliente *</label>
              <input
                type="text"
                required
                placeholder="(DDD) 99999-9999"
                value={clienteWhatsapp}
                onChange={(e) => setClienteWhatsapp(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 ${
                  isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>

          {/* Seleção de Serviço e Profissional */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold block mb-1">Serviço *</label>
              <select
                value={servicoId}
                onChange={(e) => setServicoId(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 cursor-pointer ${
                  isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                {servicosDisponiveis.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome} ({s.duracao_estimada_minutos || 30} min)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold block mb-1.5">2. Com qual profissional? *</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-0.5">
                {profissionaisDisponiveis.map((p) => {
                  const isSel = p.id === profissionalId;
                  const iniciais = (p.nome_completo || 'PR')
                    .split(' ')
                    .filter(Boolean)
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();
                  const temCurriculoAprovado = Boolean(p.mini_curriculo?.trim()) && p.curriculo_aprovado === true;

                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setProfissionalId(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setProfissionalId(p.id);
                        }
                      }}
                      className={`p-2.5 rounded-2xl border text-left transition cursor-pointer flex items-center gap-3 ${
                        isSel
                          ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                          : isDark
                          ? 'border-slate-800 bg-slate-900/70 hover:bg-slate-800'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div className={`w-14 h-14 rounded-xl font-black text-sm flex items-center justify-center shrink-0 border overflow-hidden ${
                        isSel
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : isDark
                          ? 'bg-slate-800 border-slate-700 text-slate-200'
                          : 'bg-white border-slate-300 text-slate-700'
                      }`}>
                        {p.url_foto ? (
                          <img src={p.url_foto} alt={p.nome_completo} className="w-full h-full object-cover" />
                        ) : (
                          iniciais
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold truncate">{p.nome_completo}</span>
                          {temCurriculoAprovado && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setProfissionalCurriculo(p);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-black border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white dark:border-slate-700 transition cursor-pointer"
                            >
                              <Info className="w-3 h-3" />
                              <span>Ver currículo</span>
                            </button>
                          )}
                        </div>
                        {p.especialidade_cargo && (
                          <span className="text-[11px] text-slate-400 truncate block">{p.especialidade_cargo}</span>
                        )}
                      </div>
                      {isSel && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Data do Agendamento */}
          <div>
            <label className="text-xs font-bold block mb-1">Data do Agendamento *</label>
            <input
              type="date"
              required
              value={dataAgendamento}
              onChange={(e) => setDataAgendamento(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 cursor-pointer ${
                isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
          </div>

          {/* Modalidade de Local */}
          <div>
            <label className="text-xs font-bold block mb-1">Local da Prestação</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModalidadeLocal('loja')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  modalidadeLocal === 'loja'
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : isDark
                    ? 'bg-slate-900 border-slate-700 text-slate-400'
                    : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Na Loja Física
              </button>
              <button
                type="button"
                onClick={() => setModalidadeLocal('externo')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  modalidadeLocal === 'externo'
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : isDark
                    ? 'bg-slate-900 border-slate-700 text-slate-400'
                    : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}
              >
                <Home className="w-3.5 h-3.5" />
                Externo (Domicílio)
              </button>
            </div>
          </div>

          {modalidadeLocal === 'externo' && (
            <div>
              <label className="text-xs font-bold block mb-1">Endereço de Atendimento *</label>
              <input
                type="text"
                required
                placeholder="Rua, número, complemento, bairro e cidade"
                value={enderecoSnapshot}
                onChange={(e) => setEnderecoSnapshot(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 ${
                  isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          )}

          {/* Horários Disponíveis */}
          <div>
            <label className="text-xs font-bold block mb-1.5 flex items-center justify-between">
              <span>Horários Disponíveis (em tempo real) *</span>
              {carregandoSlots && (
                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Calculando slots...
                </span>
              )}
            </label>

            {carregandoSlots ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Verificando expediente e conflitos de horários...
              </div>
            ) : slotsDisponiveis.length === 0 ? (
              <div className="py-6 px-4 rounded-xl border border-dashed border-amber-500/40 text-center text-xs text-amber-500">
                Nenhum horário disponível para este profissional nesta data. Tente outro dia ou colaborador.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                {slotsDisponiveis.map((slot) => {
                  const isSel = slotSelecionado?.hora_inicio === slot.hora_inicio;
                  return (
                    <button
                      key={slot.hora_inicio}
                      type="button"
                      disabled={!slot.disponivel}
                      onClick={() => setSlotSelecionado(slot)}
                      className={`p-2 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center cursor-pointer ${
                        !slot.disponivel
                          ? 'opacity-30 cursor-not-allowed bg-slate-900/40 border-slate-800 text-slate-500 line-through'
                          : isSel
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                          : isDark
                          ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800'
                      }`}
                      title={slot.motivo_indisponibilidade}
                    >
                      <span>{slot.hora_inicio}</span>
                      <span className="text-[9px] opacity-75">{slot.hora_fim}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold block mb-1">Observações Internas</label>
            <textarea
              rows={2}
              placeholder="Instruções para o profissional..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 resize-none ${
                isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700/60">
            <button
              type="button"
              onClick={onClose}
              className="hubi-btn-neutral px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || !slotSelecionado}
              className="hubi-btn-cta px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
            >
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>Criar Agendamento</span>
            </button>
          </div>
        </form>
      </div>

      <ModalMiniCurriculoProfissional
        isOpen={Boolean(profissionalCurriculo)}
        onClose={() => setProfissionalCurriculo(null)}
        profissional={profissionalCurriculo}
        onSelecionar={(prof) => setProfissionalId(prof.id)}
      />
    </div>
  );
};

// =============================================================================
// SUBCOMPONENTE MODAL: REMARCAÇÃO RÁPIDA PELA RETAGUARDA
// =============================================================================

interface ModalRemarcarAgendamentoRetaguardaProps {
  isOpen: boolean;
  onClose: () => void;
  agendamento: AgendamentoServico;
  duracaoMinutos?: number;
  profissionais: UsuarioLoja[];
  onRemarcado: () => void;
}

const ModalRemarcarAgendamentoRetaguarda: React.FC<ModalRemarcarAgendamentoRetaguardaProps> = ({
  isOpen,
  onClose,
  agendamento,
  duracaoMinutos,
  profissionais,
  onRemarcado
}) => {
  useRegisterOverlay(isOpen, onClose, 'modal-remarcar-agendamento-retaguarda');
  const { isDark } = useTheme();
  const { mostrarAviso, mostrarErro } = useFeedbackModal();

  const [novaData, setNovaData] = useState<string>(agendamento.data_agendamento);
  const [profissionalId, setProfissionalId] = useState<string>(agendamento.profissional_id);
  const [motivo, setMotivo] = useState<string>('');

  const [slotsDisponiveis, setSlotsDisponiveis] = useState<SlotHorarioDisponivel[]>([]);
  const [slotSelecionado, setSlotSelecionado] = useState<SlotHorarioDisponivel | null>(null);
  const [carregandoSlots, setCarregandoSlots] = useState<boolean>(false);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [profissionalCurriculo, setProfissionalCurriculo] = useState<UsuarioLoja | null>(null);

  useEffect(() => {
    if (!agendamento.loja_id || !agendamento.produto_id || !profissionalId || !novaData) return;

    let ativo = true;
    setCarregandoSlots(true);
    setSlotSelecionado(null);

    agendamentoService
      .calcularSlotsDisponiveis(
        agendamento.loja_id,
        agendamento.produto_id,
        profissionalId,
        novaData,
        duracaoMinutos || agendamento.duracao_minutos || 30,
        agendamento.id
      )
      .then((slots) => {
        if (ativo) setSlotsDisponiveis(slots);
      })
      .catch((err) => {
        console.error('Erro ao calcular slots para remarcação:', err);
      })
      .finally(() => {
        if (ativo) setCarregandoSlots(false);
      });

    return () => {
      ativo = false;
    };
  }, [agendamento, duracaoMinutos, profissionalId, novaData]);

  const handleConfirmarRemarcacao = async () => {
    if (!slotSelecionado) {
      mostrarAviso('Selecione o novo horário disponível.');
      return;
    }

    setSalvando(true);
    try {
      await agendamentoService.remarcarAgendamento(
        agendamento.loja_id,
        agendamento.id,
        novaData,
        slotSelecionado.hora_inicio,
        profissionalId,
        motivo.trim() || undefined
      );
      onRemarcado();
    } catch (err: unknown) {
      console.error('Erro ao remarcar agendamento:', err);
      const errMsg = err instanceof Error ? err.message : 'Falha ao remarcar horário.';
      mostrarErro(errMsg);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in">
      <div className={`w-full max-w-md rounded-3xl border flex flex-col shadow-2xl overflow-hidden ${
        isDark ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
      }`}>
        <div className="p-4 border-b border-slate-700/60 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-sm sm:text-base flex items-center gap-2 text-emerald-400">
            <Clock className="w-5 h-5" />
            Remarcar Horário do Atendimento
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={`hubi-btn-close-x p-1.5 rounded-xl border transition cursor-pointer ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <div className="text-xs text-slate-400">
            Cliente: <strong className={isDark ? 'text-white' : 'text-slate-900'}>{agendamento.cliente_nome}</strong>
            <br />
            Serviço: <strong className={isDark ? 'text-white' : 'text-slate-900'}>{agendamento.produto?.nome || 'Serviço'}</strong>
          </div>

          <div>
            <label className="text-xs font-bold block mb-1.5">2. Com qual profissional?</label>
            <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-0.5">
              {profissionais.map((p) => {
                const isSel = p.id === profissionalId;
                const iniciais = (p.nome_completo || 'PR')
                  .split(' ')
                  .filter(Boolean)
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();
                const temCurriculoAprovado = Boolean(p.mini_curriculo?.trim()) && p.curriculo_aprovado === true;

                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setProfissionalId(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setProfissionalId(p.id);
                      }
                    }}
                    className={`p-2.5 rounded-2xl border text-left transition cursor-pointer flex items-center gap-3 ${
                      isSel
                        ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                        : isDark
                        ? 'border-slate-800 bg-slate-900/70 hover:bg-slate-800'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-14 h-14 rounded-xl font-black text-sm flex items-center justify-center shrink-0 border overflow-hidden ${
                      isSel
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : isDark
                        ? 'bg-slate-800 border-slate-700 text-slate-200'
                        : 'bg-white border-slate-300 text-slate-700'
                    }`}>
                      {p.url_foto ? (
                        <img src={p.url_foto} alt={p.nome_completo} className="w-full h-full object-cover" />
                      ) : (
                        iniciais
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold truncate">{p.nome_completo}</span>
                        {temCurriculoAprovado && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProfissionalCurriculo(p);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-black border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white dark:border-slate-700 transition cursor-pointer"
                          >
                            <Info className="w-3 h-3" />
                            <span>Ver currículo</span>
                          </button>
                        )}
                      </div>
                      {p.especialidade_cargo && (
                        <span className="text-[11px] text-slate-400 truncate block">{p.especialidade_cargo}</span>
                      )}
                    </div>
                    {isSel && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold block mb-1">Nova Data:</label>
            <input
              type="date"
              value={novaData}
              onChange={(e) => setNovaData(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 cursor-pointer ${
                isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div>
            <label className="text-xs font-bold block mb-1.5">Novo Horário Disponível:</label>
            {carregandoSlots ? (
              <div className="py-6 text-center text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1 text-emerald-500" />
                Buscando horários disponíveis...
              </div>
            ) : slotsDisponiveis.length === 0 ? (
              <div className="py-4 text-center text-xs text-amber-500">
                Nenhum horário livre para esta data.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto p-1">
                {slotsDisponiveis.map((slot) => {
                  const isSel = slotSelecionado?.hora_inicio === slot.hora_inicio;
                  return (
                    <button
                      key={slot.hora_inicio}
                      type="button"
                      disabled={!slot.disponivel}
                      onClick={() => setSlotSelecionado(slot)}
                      className={`p-2 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center cursor-pointer ${
                        !slot.disponivel
                          ? 'opacity-30 cursor-not-allowed bg-slate-900/40 border-slate-800 text-slate-500 line-through'
                          : isSel
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : isDark
                          ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800'
                      }`}
                    >
                      <span>{slot.hora_inicio}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold block mb-1">Motivo da Remarcação (opcional):</label>
            <input
              type="text"
              placeholder="Ex: Pedido pelo cliente por WhatsApp"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 ${
                isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700/60">
            <button
              type="button"
              onClick={onClose}
              className="hubi-btn-neutral px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={salvando || !slotSelecionado}
              onClick={handleConfirmarRemarcacao}
              className="hubi-btn-cta px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
            >
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>Salvar Novo Horário</span>
            </button>
          </div>
        </div>
      </div>

      <ModalMiniCurriculoProfissional
        isOpen={Boolean(profissionalCurriculo)}
        onClose={() => setProfissionalCurriculo(null)}
        profissional={profissionalCurriculo}
        onSelecionar={(prof) => setProfissionalId(prof.id)}
      />
    </div>
  );
};

// =============================================================================
// SUBCOMPONENTE MODAL: ENDEREÇO & MAPA (ATENDIMENTO EM DOMICÍLIO)
// =============================================================================

interface ModalEnderecoDomicilioAgendaProps {
  isOpen: boolean;
  agendamento: AgendamentoServico;
  lojaId: string;
  onClose: () => void;
}

const formatarEnderecoClienteAgendamento = (dados: Partial<Cliente> | null | undefined): string => {
  if (!dados) return '';
  if (dados.endereco_principal?.trim()) return dados.endereco_principal.trim();
  const partes: string[] = [];
  const logradouroNumero = [dados.endereco_logradouro, dados.endereco_numero]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(', ');
  if (logradouroNumero) partes.push(logradouroNumero);
  if (dados.endereco_complemento?.trim()) partes.push(dados.endereco_complemento.trim());
  if (dados.endereco_bairro?.trim()) partes.push(dados.endereco_bairro.trim());
  const cidadeUf = [dados.endereco_cidade, dados.endereco_estado]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join('/');
  if (cidadeUf) partes.push(cidadeUf);
  if (dados.endereco_cep?.trim()) partes.push(`CEP ${dados.endereco_cep.trim()}`);
  return partes.join(' - ');
};

const ModalEnderecoDomicilioAgenda: React.FC<ModalEnderecoDomicilioAgendaProps> = ({
  isOpen,
  agendamento,
  lojaId,
  onClose
}) => {
  const { isDark } = useTheme();
  const [enderecoCarregado, setEnderecoCarregado] = useState<string>('');
  const [carregandoEndereco, setCarregandoEndereco] = useState<boolean>(false);
  const [copiado, setCopiado] = useState<boolean>(false);

  useRegisterOverlay(isOpen, onClose, 'modal-endereco-domicilio-agenda');

  useEffect(() => {
    if (!isOpen) return;
    setCopiado(false);
    const snapshot = (agendamento.endereco_prestacao_snapshot || '').trim();
    const doCliente = formatarEnderecoClienteAgendamento(agendamento.cliente);
    const inicial = snapshot || doCliente;
    setEnderecoCarregado(inicial);

    if (inicial || !agendamento.cliente_id) {
      setCarregandoEndereco(false);
      return;
    }

    let ativo = true;
    setCarregandoEndereco(true);
    void (async () => {
      try {
        const [{ data: cliData }, { data: endData }] = await Promise.all([
          supabase
            .from('clientes')
            .select('endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado, endereco_cep, endereco_principal')
            .eq('loja_id', lojaId)
            .eq('id', agendamento.cliente_id as string)
            .maybeSingle(),
          supabase
            .from('cliente_enderecos')
            .select('logradouro, numero, complemento, bairro, cidade, uf, cep, is_principal')
            .eq('cliente_id', agendamento.cliente_id as string)
            .order('is_principal', { ascending: false })
            .limit(1)
            .maybeSingle()
        ]);

        if (!ativo) return;
        const formattedCli = formatarEnderecoClienteAgendamento(cliData as Partial<Cliente> | null);
        if (formattedCli) {
          setEnderecoCarregado(formattedCli);
        } else if (endData?.logradouro) {
          const formattedEnd = formatarEnderecoClienteAgendamento({
            endereco_logradouro: endData.logradouro,
            endereco_numero: endData.numero,
            endereco_complemento: endData.complemento,
            endereco_bairro: endData.bairro,
            endereco_cidade: endData.cidade,
            endereco_estado: endData.uf,
            endereco_cep: endData.cep
          });
          setEnderecoCarregado(formattedEnd);
        }
      } finally {
        if (ativo) setCarregandoEndereco(false);
      }
    })();

    return () => {
      ativo = false;
    };
  }, [isOpen, agendamento, lojaId]);

  const enderecoCompleto = enderecoCarregado.trim();
  const urlMaps = enderecoCompleto
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto)}`
    : null;

  const handleCopiarEndereco = async () => {
    if (!enderecoCompleto) return;
    try {
      await navigator.clipboard.writeText(enderecoCompleto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-2xl p-5 border shadow-2xl space-y-4 ${
          isDark
            ? 'bg-[#0F172A] border-slate-700 text-white'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div
          className={`flex items-center justify-between pb-3 border-b ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'
              }`}
            >
              <Home className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm truncate">Local do Atendimento — Em Domicílio</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div
            className={`rounded-xl p-3 border space-y-1 ${
              isDark ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold text-sm">
              <User className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">{agendamento.cliente_nome || 'Cliente'}</span>
            </div>
            <div className={`flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              <Scissors className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{agendamento.produto?.nome || 'Serviço'}</span>
            </div>
          </div>

          <div
            className={`rounded-xl p-3.5 border space-y-1.5 ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Endereço Completo</span>
            </div>
            {carregandoEndereco ? (
              <div className="flex items-center gap-2 py-1 text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Carregando endereço...</span>
              </div>
            ) : (
              <p className={`text-xs leading-relaxed font-medium break-words ${
                enderecoCompleto
                  ? isDark ? 'text-slate-200' : 'text-slate-800'
                  : 'text-slate-400 italic'
              }`}>
                {enderecoCompleto || 'Endereço não informado neste agendamento.'}
              </p>
            )}
          </div>
        </div>

        <div
          className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <button
            type="button"
            disabled={!enderecoCompleto}
            onClick={() => void handleCopiarEndereco()}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isDark
                ? 'border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200'
                : 'border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            {copiado ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Endereço</span>
              </>
            )}
          </button>

          {urlMaps ? (
            <a
              href={urlMaps}
              target="_blank"
              rel="noreferrer"
              className="hubi-btn-cta px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Abrir no Google Maps</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="px-4 py-2 rounded-xl bg-emerald-600/40 text-white/70 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-not-allowed"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Abrir no Google Maps</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
