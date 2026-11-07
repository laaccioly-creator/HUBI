// =============================================================================
// COMPONENTE: AgendaServicosLoja.tsx
// Painel Visual de Controle e Gestão da Agenda de Serviços da Loja
// =============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
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
  ExternalLink,
  Loader2,
  CalendarClock,
  Sparkles,
  Scissors,
  Bell
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { agendamentoService, formatarDataPtBr } from '../../services/agendamentoService';
import { whatsappWalletService } from '../../services/whatsappWalletService';
import { supabase } from '../../lib/supabase';
import { ModalLembretesPendentesAgenda } from './ModalLembretesPendentesAgenda';
import type {
  AgendamentoServico,
  StatusAgendamento,
  ModalidadeLocalPrestacao,
  SlotHorarioDisponivel
} from '../../types/agendamento';
import type { Produto, UsuarioLoja, Cliente } from '../../types';

export const AgendaServicosLoja: React.FC = () => {
  const { loja, usuario } = useAuth();
  const { isDark } = useTheme();
  const { mostrarSucesso, mostrarAviso, mostrarErro, mostrarToast } = useFeedbackModal();

  // 1. Estados de Filtros e Seleção
  const [dataSelecionada, setDataSelecionada] = useState<string>(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  });
  const [profissionalFiltro, setProfissionalFiltro] = useState<string>('todos');
  const [statusFiltro, setStatusFiltro] = useState<string>('todos');
  const [buscaTexto, setBuscaTexto] = useState<string>('');

  // 2. Estados de Dados
  const [agendamentos, setAgendamentos] = useState<AgendamentoServico[]>([]);
  const [profissionais, setProfissionais] = useState<UsuarioLoja[]>([]);
  const [servicos, setServicos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [enviandoWppId, setEnviandoWppId] = useState<string | null>(null);

  // 3. Estados de Modais
  const [modalNovoAberto, setModalNovoAberto] = useState<boolean>(false);
  const [modalLembretesAberto, setModalLembretesAberto] = useState<boolean>(false);
  const [totalLembretesPendentes, setTotalLembretesPendentes] = useState<number>(0);
  const [agendamentoParaRemarcar, setAgendamentoParaRemarcar] = useState<AgendamentoServico | null>(null);
  const [agendamentoParaCancelar, setAgendamentoParaCancelar] = useState<AgendamentoServico | null>(null);
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
        .select('*')
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
      setAgendamentos(dados);
    } catch (err: any) {
      console.error('Erro ao carregar agendamentos:', err);
      mostrarErro('Não foi possível carregar a lista de agendamentos.', 'Falha de Carregamento');
    } finally {
      setCarregando(false);
    }
  }, [loja?.id, dataSelecionada, profissionalFiltro, statusFiltro, mostrarErro]);

  useEffect(() => {
    carregarProfissionais();
    carregarServicos();
  }, [carregarProfissionais, carregarServicos]);

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
    } catch (err: any) {
      console.error('Erro ao alterar status:', err);
      mostrarErro(err?.message || 'Erro ao atualizar status do agendamento.');
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
    } catch (err: any) {
      console.warn('Falha no disparo automático, abrindo fallback:', err);
      const telLimpo = agendamento.cliente_whatsapp.replace(/\D/g, '');
      const urlFallback = `https://wa.me/55${telLimpo}?text=${encodeURIComponent(mensagem)}`;
      window.open(urlFallback, '_blank');
    } finally {
      setEnviandoWppId(null);
    }
  };

  // Badge de Status
  const renderBadgeStatus = (status: StatusAgendamento) => {
    switch (status) {
      case 'confirmado':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Confirmado
          </span>
        );
      case 'agendado':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5" />
            Aguardando Confirmação
          </span>
        );
      case 'em_atendimento':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
            <PlayCircle className="w-3.5 h-3.5 animate-pulse" />
            Em Atendimento
          </span>
        );
      case 'concluido':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            <CheckCheck className="w-3.5 h-3.5" />
            Concluído
          </span>
        );
      case 'cancelado':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            <X className="w-3.5 h-3.5" />
            Cancelado
          </span>
        );
      case 'nao_compareceu':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/15 text-slate-400 border border-slate-500/30">
            <AlertCircle className="w-3.5 h-3.5" />
            Não Compareceu
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`flex flex-col h-full w-full overflow-hidden ${isDark ? 'bg-[#0B0F17] text-white' : 'bg-slate-50 text-slate-900'}`}>
      {/* 1. CABEÇALHO SUPERIOR & AÇÕES */}
      <div className={`p-4 sm:p-5 border-b shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        isDark ? 'border-slate-800 bg-[#0F172A]/70' : 'border-slate-200 bg-white shadow-xs'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black flex items-center gap-2">
              Agenda de Serviços
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                Omnichannel
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Controle de horários, expediente de profissionais e lembretes via WhatsApp
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => {
              carregarAgendamentos();
              carregarContadorLembretes();
            }}
            disabled={carregando}
            className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              isDark
                ? 'border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
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
            className={`px-3 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition cursor-pointer relative ${
              totalLembretesPendentes > 0
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-500 hover:bg-amber-500/25'
                : isDark
                ? 'border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
            }`}
            title="Lembretes de atendimento via WhatsApp"
          >
            <Bell className={`w-4 h-4 ${totalLembretesPendentes > 0 ? 'text-amber-500 animate-bounce' : ''}`} />
            <span className="hidden sm:inline">Lembretes</span>
            {totalLembretesPendentes > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black">
                {totalLembretesPendentes}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setModalNovoAberto(true)}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ Novo Agendamento</span>
          </button>
        </div>
      </div>

      {/* 2. BARRA DE NAVEGAÇÃO DE DATA & FILTROS */}
      <div className={`p-3 sm:p-4 border-b shrink-0 flex flex-wrap items-center justify-between gap-3 ${
        isDark ? 'border-slate-800 bg-[#0B0F17]' : 'border-slate-200 bg-slate-100/60'
      }`}>
        {/* Seletor de Data */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-800/20 border border-slate-700/60 rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => mudarDia(-1)}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-700'
              }`}
              title="Dia Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 px-2">
              <CalendarIcon className="w-4 h-4 text-emerald-500" />
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
                isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-700'
              }`}
              title="Próximo Dia"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Chips Hoje e Amanhã */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDataSelecionada(hojeStr)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                dataSelecionada === hojeStr
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : isDark
                  ? 'bg-slate-800 text-slate-400 hover:text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setDataSelecionada(amanhaStr)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                dataSelecionada === amanhaStr
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : isDark
                  ? 'bg-slate-800 text-slate-400 hover:text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
              }`}
            >
              Amanhã
            </button>
          </div>
        </div>

        {/* Filtro por Profissional & Busca */}
        <div className="flex items-center gap-2 flex-wrap flex-1 sm:flex-initial justify-end">
          <select
            value={profissionalFiltro}
            onChange={(e) => setProfissionalFiltro(e.target.value)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium focus:outline-none focus:border-emerald-500 cursor-pointer ${
              isDark
                ? 'bg-slate-900 border-slate-700 text-white'
                : 'bg-white border-slate-300 text-slate-900'
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
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium focus:outline-none focus:border-emerald-500 cursor-pointer ${
              isDark
                ? 'bg-slate-900 border-slate-700 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <option value="todos">Todos os Status</option>
            <option value="agendado">Aguardando Confirmação</option>
            <option value="confirmado">Confirmados</option>
            <option value="em_atendimento">Em Atendimento</option>
            <option value="concluido">Concluídos</option>
            <option value="cancelado">Cancelados</option>
          </select>

          <div className="relative min-w-[140px] max-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar cliente/serviço..."
              value={buscaTexto}
              onChange={(e) => setBuscaTexto(e.target.value)}
              className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              }`}
            />
            {buscaTexto && (
              <button
                type="button"
                onClick={() => setBuscaTexto('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ALERTA DE LEMBRETES PENDENTES */}
      {totalLembretesPendentes > 0 && (
        <div className="mx-3 sm:mx-4 mt-3 p-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-600 dark:text-amber-400">
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

      {/* 3. RESUMO RÁPIDO DE CARDS (KPIs) */}
      <div className="px-4 py-3 shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className={`p-3 rounded-2xl border ${
          isDark ? 'bg-[#0F172A]/80 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <span className="text-[11px] text-slate-400 font-bold block">TOTAL DO DIA</span>
          <span className="text-xl sm:text-2xl font-black mt-0.5 block">{metricas.total}</span>
        </div>

        <div className={`p-3 rounded-2xl border ${
          isDark ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
        }`}>
          <span className="text-[11px] text-emerald-500 font-bold block">CONFIRMADOS</span>
          <span className="text-xl sm:text-2xl font-black text-emerald-500 mt-0.5 block">{metricas.confirmados}</span>
        </div>

        <div className={`p-3 rounded-2xl border ${
          isDark ? 'bg-amber-950/20 border-amber-500/30' : 'bg-amber-50 border-amber-200'
        }`}>
          <span className="text-[11px] text-amber-500 font-bold block">AGUARDANDO CONFIRMAÇÃO</span>
          <span className="text-xl sm:text-2xl font-black text-amber-500 mt-0.5 block">{metricas.agendados}</span>
        </div>

        <div className={`p-3 rounded-2xl border ${
          isDark ? 'bg-blue-950/20 border-blue-500/30' : 'bg-blue-50 border-blue-200'
        }`}>
          <span className="text-[11px] text-blue-500 font-bold block">CONCLUÍDOS</span>
          <span className="text-xl sm:text-2xl font-black text-blue-500 mt-0.5 block">{metricas.concluidos}</span>
        </div>
      </div>

      {/* 4. LISTA / TIMELINE DE AGENDAMENTOS */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
        {carregando ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            <span className="text-xs font-bold">Carregando horários agendados...</span>
          </div>
        ) : agendamentosFiltrados.length === 0 ? (
          <div className={`flex flex-col items-center justify-center py-16 px-4 rounded-3xl border text-center ${
            isDark ? 'bg-[#0F172A]/40 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <CalendarDays className="w-12 h-12 text-slate-500 mb-3 opacity-40" />
            <h3 className="font-bold text-sm sm:text-base">Nenhum agendamento para esta data</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Não há clientes agendados para {formatarDataPtBr(dataSelecionada)} com os filtros atuais.
            </p>
            <button
              type="button"
              onClick={() => setModalNovoAberto(true)}
              className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Agendar Novo Horário</span>
            </button>
          </div>
        ) : (
          agendamentosFiltrados.map((item) => {
            const isExterno = item.modalidade_local === 'externo';
            const linkMaps = item.endereco_prestacao_snapshot
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.endereco_prestacao_snapshot)}`
              : null;

            return (
              <div
                key={item.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isDark
                    ? 'bg-[#0F172A]/70 border-slate-800 hover:border-slate-700'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Bloco 1: Horário, Serviço e Badges */}
                  <div className="flex items-start gap-3">
                    <div className={`px-3 py-2 rounded-xl text-center shrink-0 border ${
                      isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                    }`}>
                      <span className="text-xs font-black text-emerald-500 block">
                        {item.hora_inicio}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium block">
                        até {item.hora_fim}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm sm:text-base">
                          {item.produto?.nome || 'Serviço Agendado'}
                        </h4>
                        {renderBadgeStatus(item.status_agendamento)}
                        {isExterno ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Home className="w-3 h-3" />
                            Externo / Domicílio
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700/40 text-slate-300 border border-slate-600/30">
                            <Building2 className="w-3 h-3" />
                            Na Loja
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-emerald-500" />
                          <strong className={isDark ? 'text-slate-200' : 'text-slate-700'}>Profissional:</strong>{' '}
                          {item.profissional?.nome_completo || 'Não informado'}
                          {item.profissional?.especialidade_cargo && (
                            <span className="text-[10px] opacity-75">({item.profissional.especialidade_cargo})</span>
                          )}
                        </span>

                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>Duração: {item.duracao_minutos} min</span>
                        </span>
                      </div>

                      {/* Endereço Domiciliar se Externo */}
                      {isExterno && item.endereco_prestacao_snapshot && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-500 dark:text-amber-400 pt-0.5">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate max-w-md">{item.endereco_prestacao_snapshot}</span>
                          {linkMaps && (
                            <a
                              href={linkMaps}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-[10px] font-bold underline hover:text-white"
                            >
                              Ver Mapa
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      )}

                      {/* Observações */}
                      {item.observacoes && (
                        <p className="text-xs text-slate-400 italic pt-0.5">
                          Obs: {item.observacoes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bloco 2: Dados do Cliente & Ações Operacionais */}
                  <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800">
                    <div className="text-left lg:text-right pr-2">
                      <span className="text-xs font-bold block">{item.cliente_nome}</span>
                      <span className="text-[11px] text-slate-400 block">{item.cliente_whatsapp}</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Cobrar Confirmação / Lembrete WhatsApp */}
                      <button
                        type="button"
                        disabled={enviandoWppId === item.id || item.status_agendamento === 'cancelado'}
                        onClick={() => handleDispararWhatsApp(item, item.status_agendamento === 'agendado' ? 'confirmacao_criacao' : 'lembrete')}
                        className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          isDark
                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/50'
                            : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                        }`}
                        title="Enviar mensagem com link para o cliente confirmar/remarcar via WhatsApp"
                      >
                        {enviandoWppId === item.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                        <span>{item.status_agendamento === 'agendado' ? 'Cobrar Confirmação' : 'Lembrete WhatsApp'}</span>
                      </button>

                      {/* Botões de Transição de Ciclo de Vida */}
                      {item.status_agendamento === 'agendado' && (
                        <button
                          type="button"
                          disabled={processandoAcaoId === item.id}
                          onClick={() => handleAlterarStatus(item.id, 'confirmado')}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer"
                        >
                          Confirmar
                        </button>
                      )}

                      {item.status_agendamento === 'confirmado' && (
                        <button
                          type="button"
                          disabled={processandoAcaoId === item.id}
                          onClick={() => handleAlterarStatus(item.id, 'em_atendimento')}
                          className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition cursor-pointer"
                        >
                          Iniciar
                        </button>
                      )}

                      {item.status_agendamento === 'em_atendimento' && (
                        <button
                          type="button"
                          disabled={processandoAcaoId === item.id}
                          onClick={() => handleAlterarStatus(item.id, 'concluido')}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer"
                        >
                          Concluir
                        </button>
                      )}

                      {/* Remarcar */}
                      {item.status_agendamento !== 'cancelado' && item.status_agendamento !== 'concluido' && (
                        <button
                          type="button"
                          onClick={() => setAgendamentoParaRemarcar(item)}
                          className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                            isDark
                              ? 'border-slate-700 bg-slate-800 text-slate-300 hover:text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          Remarcar
                        </button>
                      )}

                      {/* Cancelar */}
                      {item.status_agendamento !== 'cancelado' && item.status_agendamento !== 'concluido' && (
                        <button
                          type="button"
                          onClick={() => setAgendamentoParaCancelar(item)}
                          className="px-2 py-1.5 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
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
                className="text-slate-400 hover:text-white cursor-pointer"
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
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={processandoAcaoId === agendamentoParaCancelar.id}
                onClick={() => handleAlterarStatus(agendamentoParaCancelar.id, 'cancelado', motivoCancelamento)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
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
  const [dataAgendamento, setDataAgendamento] = useState<string>(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  });
  const [modalidadeLocal, setModalidadeLocal] = useState<ModalidadeLocalPrestacao>('loja');
  const [enderecoSnapshot, setEnderecoSnapshot] = useState<string>('');
  const [observacoes, setObservacoes] = useState<string>('');

  const [slotsDisponiveis, setSlotsDisponiveis] = useState<SlotHorarioDisponivel[]>([]);
  const [slotSelecionado, setSlotSelecionado] = useState<SlotHorarioDisponivel | null>(null);
  const [carregandoSlots, setCarregandoSlots] = useState<boolean>(false);
  const [salvando, setSalvando] = useState<boolean>(false);

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
    } catch (err: any) {
      console.error('Erro ao criar agendamento:', err);
      mostrarErro(err?.message || 'Falha ao registrar agendamento.');
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
            className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <label className="text-xs font-bold block mb-1">Profissional Designado *</label>
              <select
                value={profissionalId}
                onChange={(e) => setProfissionalId(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 cursor-pointer ${
                  isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                {profissionaisDisponiveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome_completo} {p.especialidade_cargo ? `(${p.especialidade_cargo})` : ''}
                  </option>
                ))}
              </select>
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
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || !slotSelecionado}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
            >
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>Criar Agendamento</span>
            </button>
          </div>
        </form>
      </div>
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
  profissionais: UsuarioLoja[];
  onRemarcado: () => void;
}

const ModalRemarcarAgendamentoRetaguarda: React.FC<ModalRemarcarAgendamentoRetaguardaProps> = ({
  isOpen,
  onClose,
  agendamento,
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
        agendamento.duracao_minutos || 30,
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
  }, [agendamento, profissionalId, novaData]);

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
    } catch (err: any) {
      console.error('Erro ao remarcar agendamento:', err);
      mostrarErro(err?.message || 'Falha ao remarcar horário.');
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
            className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
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
            <label className="text-xs font-bold block mb-1">Profissional:</label>
            <select
              value={profissionalId}
              onChange={(e) => setProfissionalId(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 cursor-pointer ${
                isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome_completo} {p.especialidade_cargo ? `(${p.especialidade_cargo})` : ''}
                </option>
              ))}
            </select>
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
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={salvando || !slotSelecionado}
              onClick={handleConfirmarRemarcacao}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
            >
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>Salvar Novo Horário</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
