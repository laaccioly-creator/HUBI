import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  MapPin,
  User,
  CheckCircle2,
  AlertCircle,
  CalendarCheck,
  CalendarX,
  MessageCircle,
  Download,
  ExternalLink,
  Loader2,
  ArrowLeft,
  Store,
  Scissors,
  Check,
  RefreshCw,
  Info
} from 'lucide-react';
import { agendamentoService, formatarDataPtBr } from '../services/agendamentoService';
import { supabase } from '../lib/supabase';
import type {
  AgendamentoPublicoDetalhes,
  SlotHorarioDisponivel
} from '../types/agendamento';
import type { UsuarioLoja } from '../types';
import { formatarMoeda } from '../utils/formatters';

interface DadosLojaComplementar {
  logo_url?: string | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_bairro?: string | null;
  endereco_cidade?: string | null;
  cor_primaria?: string | null;
}

export const ConfirmarAgendamentoPublico: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [agendamento, setAgendamento] = useState<AgendamentoPublicoDetalhes | null>(null);
  const [lojaInfo, setLojaInfo] = useState<DadosLojaComplementar | null>(null);
  const [profissionaisHabilitados, setProfissionaisHabilitados] = useState<UsuarioLoja[]>([]);
  const [processandoAcao, setProcessandoAcao] = useState<boolean>(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Estados de Remarcação Interativa
  const [remarcando, setRemarcando] = useState<boolean>(false);
  const [novaData, setNovaData] = useState<string>('');
  const [novaHora, setNovaHora] = useState<string>('');
  const [profissionalRemarcacaoId, setProfissionalRemarcacaoId] = useState<string>('');
  const [slotsDisponiveis, setSlotsDisponiveis] = useState<SlotHorarioDisponivel[]>([]);
  const [carregandoSlots, setCarregandoSlots] = useState<boolean>(false);

  // Estados de Cancelamento
  const [cancelando, setCancelando] = useState<boolean>(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState<string>('');

  const carregarDados = useCallback(async () => {
    if (!token) {
      setErro('Token de agendamento não informado ou inválido.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErro(null);
      const dados = await agendamentoService.obterAgendamentoPorTokenPublico(token);

      if (!dados) {
        setErro('Agendamento não encontrado. O link pode ter expirado ou o código é inválido.');
        setAgendamento(null);
        return;
      }

      setAgendamento(dados);
      setProfissionalRemarcacaoId(dados.profissional_id);

      // Busca dados complementares da loja (logo e endereço físico)
      try {
        const { data: storeData } = await supabase
          .from('lojas')
          .select('logo_url, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, cor_primaria')
          .eq('id', dados.loja_id)
          .single();

        if (storeData) {
          setLojaInfo(storeData);
        }
      } catch (errStore) {
        console.warn('Erro ao carregar dados complementares da loja:', errStore);
      }

      // Busca lista de outros colaboradores habilitados para o serviço
      try {
        const profs = await agendamentoService.listarProfissionaisHabilitadosPorServico(
          dados.loja_id,
          dados.produto_id
        );
        setProfissionaisHabilitados(profs);
      } catch (errProfs) {
        console.warn('Erro ao listar profissionais habilitados:', errProfs);
      }
    } catch (e: any) {
      console.error('Erro ao carregar agendamento:', e);
      setErro('Não foi possível carregar os detalhes do agendamento. Tente novamente mais tarde.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Recalcular slots disponíveis para remarcação quando a data ou profissional mudar
  useEffect(() => {
    if (!remarcando || !novaData || !agendamento) return;

    let cancelado = false;
    const buscarSlots = async () => {
      try {
        setCarregandoSlots(true);
        setNovaHora('');
        const profId = profissionalRemarcacaoId || agendamento.profissional_id;
        const slots = await agendamentoService.calcularSlotsDisponiveis(
          agendamento.loja_id,
          agendamento.produto_id,
          profId,
          novaData,
          agendamento.duracao_minutos || 30,
          agendamento.id
        );
        if (!cancelado) {
          setSlotsDisponiveis(slots);
        }
      } catch (err) {
        console.warn('Erro ao carregar horários disponíveis para remarcação:', err);
        if (!cancelado) setSlotsDisponiveis([]);
      } finally {
        if (!cancelado) setCarregandoSlots(false);
      }
    };

    buscarSlots();
    return () => {
      cancelado = true;
    };
  }, [remarcando, novaData, profissionalRemarcacaoId, agendamento]);

  // Ação 1: Confirmar Presença
  const handleConfirmarPresenca = async () => {
    if (!token) return;
    try {
      setProcessandoAcao(true);
      setErro(null);
      const res = await agendamentoService.processarAcaoCliente({
        p_token: token,
        p_acao: 'confirmar'
      });

      if (res.sucesso) {
        setMensagemSucesso('Sua presença foi confirmada com sucesso! O estabelecimento já foi notificado.');
        await carregarDados();
      } else {
        setErro(res.mensagem || 'Não foi possível confirmar o agendamento.');
      }
    } catch (e: any) {
      console.error('Erro ao confirmar presença:', e);
      setErro('Falha de comunicação ao confirmar presença. Tente novamente.');
    } finally {
      setProcessandoAcao(false);
    }
  };

  // Ação 2: Concluir Remarcação
  const handleConfirmarRemarcacao = async () => {
    if (!token || !novaData || !novaHora) {
      setErro('Por favor, selecione uma data e um horário livre para remarcar.');
      return;
    }

    try {
      setProcessandoAcao(true);
      setErro(null);
      const profId = profissionalRemarcacaoId || agendamento?.profissional_id;
      const res = await agendamentoService.processarAcaoCliente({
        p_token: token,
        p_acao: 'remarcar',
        p_nova_data: novaData,
        p_nova_hora_inicio: novaHora,
        p_novo_profissional_id: profId
      });

      if (res.sucesso) {
        setMensagemSucesso('Agendamento remarcado com sucesso! O horário anterior foi liberado.');
        setRemarcando(false);
        setNovaData('');
        setNovaHora('');
        await carregarDados();
      } else {
        setErro(res.mensagem || 'Não foi possível remarcar o atendimento.');
      }
    } catch (e: any) {
      console.error('Erro ao remarcar agendamento:', e);
      setErro('Falha de comunicação ao remarcar agendamento. Tente novamente.');
    } finally {
      setProcessandoAcao(false);
    }
  };

  // Ação 3: Concluir Cancelamento
  const handleConfirmarCancelamento = async () => {
    if (!token) return;
    try {
      setProcessandoAcao(true);
      setErro(null);
      const res = await agendamentoService.processarAcaoCliente({
        p_token: token,
        p_acao: 'cancelar',
        p_motivo: motivoCancelamento || 'Cancelado pelo cliente pela página pública'
      });

      if (res.sucesso) {
        setMensagemSucesso('Agendamento cancelado com sucesso. O horário foi liberado.');
        setCancelando(false);
        await carregarDados();
      } else {
        setErro(res.mensagem || 'Não foi possível cancelar o agendamento.');
      }
    } catch (e: any) {
      console.error('Erro ao cancelar agendamento:', e);
      setErro('Falha de comunicação ao cancelar agendamento. Tente novamente.');
    } finally {
      setProcessandoAcao(false);
    }
  };

  // Google Calendar URL
  const linkGoogleCalendar = useMemo(() => {
    if (!agendamento) return '#';
    try {
      const dataInicio = new Date(agendamento.data_hora_inicio);
      const dataFim = new Date(agendamento.data_hora_fim);

      const formatIsoUtc = (date: Date) =>
        date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

      const titulo = encodeURIComponent(`${agendamento.produto_nome} - ${agendamento.loja_nome}`);
      const detalhes = encodeURIComponent(
        `Atendimento com ${agendamento.profissional_nome}.\nServiço: ${agendamento.produto_nome}\nLocal: ${
          agendamento.modalidade_local === 'loja'
            ? [lojaInfo?.endereco_logradouro, lojaInfo?.endereco_numero, lojaInfo?.endereco_bairro, lojaInfo?.endereco_cidade].filter(Boolean).join(', ') || 'Na Loja'
            : agendamento.endereco_prestacao_snapshot || 'A Domicílio'
        }`
      );
      const local = encodeURIComponent(
        agendamento.modalidade_local === 'loja'
          ? [lojaInfo?.endereco_logradouro, lojaInfo?.endereco_numero, lojaInfo?.endereco_cidade].filter(Boolean).join(', ') || agendamento.loja_nome
          : agendamento.endereco_prestacao_snapshot || 'Endereço do Cliente'
      );

      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titulo}&dates=${formatIsoUtc(
        dataInicio
      )}/${formatIsoUtc(dataFim)}&details=${detalhes}&location=${local}`;
    } catch {
      return '#';
    }
  }, [agendamento, lojaInfo]);

  // Download do arquivo .ICS (Apple Calendar / Outlook)
  const handleDownloadIcs = () => {
    if (!agendamento) return;
    try {
      const dataInicio = new Date(agendamento.data_hora_inicio);
      const dataFim = new Date(agendamento.data_hora_fim);

      const formatIsoUtc = (date: Date) =>
        date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

      const enderecoLojaStr = [lojaInfo?.endereco_logradouro, lojaInfo?.endereco_numero, lojaInfo?.endereco_bairro, lojaInfo?.endereco_cidade].filter(Boolean).join(', ');
      const localEfetivo = agendamento.modalidade_local === 'loja'
        ? (enderecoLojaStr || agendamento.loja_nome)
        : (agendamento.endereco_prestacao_snapshot || 'A Domicílio');

      const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//HUBI//Agendamento Omnichannel//PT',
        'BEGIN:VEVENT',
        `UID:${agendamento.id}@hubi.com.br`,
        `DTSTAMP:${formatIsoUtc(new Date())}`,
        `DTSTART:${formatIsoUtc(dataInicio)}`,
        `DTEND:${formatIsoUtc(dataFim)}`,
        `SUMMARY:${agendamento.produto_nome} - ${agendamento.loja_nome}`,
        `DESCRIPTION:Profissional: ${agendamento.profissional_nome}\\nLocal: ${localEfetivo}`,
        `LOCATION:${localEfetivo}`,
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');

      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agendamento_${agendamento.data_agendamento}_${agendamento.hora_inicio.replace(':', '')}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Erro ao gerar arquivo .ics:', e);
    }
  };

  // Link para conversa direta com a loja no WhatsApp
  const linkWhatsAppLoja = useMemo(() => {
    if (!agendamento || !agendamento.loja_whatsapp) return '#';
    const numLimpo = agendamento.loja_whatsapp.replace(/\D/g, '');
    const numFinal = numLimpo.startsWith('55') ? numLimpo : `55${numLimpo}`;
    const txt = encodeURIComponent(
      `Olá, ${agendamento.loja_nome}! Gostaria de tirar uma dúvida sobre o meu agendamento de *${agendamento.produto_nome}* no dia *${formatarDataPtBr(agendamento.data_agendamento)} às ${agendamento.hora_inicio}*.`
    );
    return `https://wa.me/${numFinal}?text=${txt}`;
  }, [agendamento]);

  // Carrossel de datas para remarcação (próximos 14 dias)
  const diasDisponiveisRemarcacao = useMemo(() => {
    const lista: { data: string; diaSemana: string; diaMes: string }[] = [];
    const hoje = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(hoje);
      d.setDate(hoje.getDate() + i);
      const ano = d.getFullYear();
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const dia = String(d.getDate()).padStart(2, '0');
      const dataStr = `${ano}-${mes}-${dia}`;

      const nomeDia = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      const diaMes = `${dia}/${mes}`;

      lista.push({
        data: dataStr,
        diaSemana: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : nomeDia.toUpperCase(),
        diaMes
      });
    }
    return lista;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-3" />
        <p className="text-sm text-slate-400 font-medium">Carregando detalhes do agendamento...</p>
      </div>
    );
  }

  if (erro && !agendamento) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Agendamento Indisponível</h2>
          <p className="text-sm text-slate-400 leading-relaxed">{erro}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition border border-slate-700"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Início</span>
          </Link>
        </div>
      </div>
    );
  }

  if (!agendamento) return null;

  const status = agendamento.status_agendamento;
  const podeRemarcar =
    (status === 'agendado' || status === 'confirmado') &&
    agendamento.qtd_remarcacoes < (agendamento.limite_remarcacoes_cliente || 2);

  const podeCancelar = status === 'agendado' || status === 'confirmado';

  const enderecoLojaCompleto = [
    lojaInfo?.endereco_logradouro,
    lojaInfo?.endereco_numero,
    lojaInfo?.endereco_bairro,
    lojaInfo?.endereco_cidade
  ].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 antialiased py-6 px-4 sm:px-6">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Topo / Identidade Visual da Loja */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            {lojaInfo?.logo_url ? (
              <img
                src={lojaInfo.logo_url}
                alt={agendamento.loja_nome}
                className="w-10 h-10 rounded-2xl object-cover border border-slate-700 bg-slate-800"
              />
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 font-black">
                <Store className="w-5 h-5" />
              </div>
            )}
            <div>
              <h1 className="font-black text-sm text-white tracking-wide">{agendamento.loja_nome}</h1>
              <p className="text-[11px] text-slate-400">Comprovante de Agendamento</p>
            </div>
          </div>

          {/* Badge de Status */}
          <span
            className={`text-xs font-bold px-3 py-1 rounded-full border shadow-2xs ${
              status === 'confirmado'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : status === 'concluido'
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : status === 'em_atendimento'
                ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 animate-pulse'
                : status === 'cancelado' || status === 'nao_compareceu'
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}
          >
            {status === 'confirmado'
              ? '✓ Presença Confirmada'
              : status === 'concluido'
              ? 'Concluído'
              : status === 'em_atendimento'
              ? 'Em Atendimento'
              : status === 'cancelado'
              ? 'Cancelado'
              : status === 'nao_compareceu'
              ? 'Não Compareceu'
              : 'Aguardando Confirmação'}
          </span>
        </div>

        {/* Feedback de Mensagem */}
        {mensagemSucesso && (
          <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-300 animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            <span className="flex-1 leading-relaxed font-medium">{mensagemSucesso}</span>
          </div>
        )}

        {erro && (
          <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-rose-300 animate-in fade-in">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span className="flex-1 leading-relaxed">{erro}</span>
          </div>
        )}

        {/* Card Principal de Resumo do Atendimento */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Scissors className="w-3 h-3 text-emerald-400" />
              Serviço Contratado
            </span>
            <h2 className="text-xl font-black text-white">{agendamento.produto_nome}</h2>
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold">
              <span>{formatarMoeda(Number(agendamento.preco_venda_varejo || 0))}</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400 font-normal">Duração Estimada: {agendamento.duracao_minutos} min</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-800/80">
            {/* Data e Horário */}
            <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                Data & Horário
              </span>
              <p className="text-sm font-bold text-white capitalize">
                {formatarDataPtBr(agendamento.data_agendamento)}
              </p>
              <p className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {agendamento.hora_inicio} às {agendamento.hora_fim}
              </p>
            </div>

            {/* Profissional Responsável */}
            <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-emerald-400" />
                Profissional Responsável
              </span>
              <p className="text-sm font-bold text-white truncate">
                {agendamento.profissional_nome}
              </p>
              {agendamento.especialidade_cargo && (
                <p className="text-xs text-slate-400 truncate">
                  {agendamento.especialidade_cargo}
                </p>
              )}
            </div>
          </div>

          {/* Local de Prestação */}
          <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              Local de Execução
            </span>
            <p className="text-xs font-bold text-white">
              {agendamento.modalidade_local === 'loja'
                ? '🏪 Atendimento Presencial na Loja'
                : '🏠 Atendimento a Domicílio (No seu endereço)'}
            </p>
            <p className="text-xs text-slate-300 leading-relaxed pt-0.5">
              {agendamento.modalidade_local === 'loja'
                ? enderecoLojaCompleto || 'Consulte o endereço diretamente com o estabelecimento.'
                : agendamento.endereco_prestacao_snapshot || 'Endereço fornecido no momento do agendamento.'}
            </p>
          </div>

          {/* Dados do Cliente */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/60">
            <span>Cliente: <strong className="text-white">{agendamento.cliente_nome}</strong></span>
            {agendamento.cliente_whatsapp && (
              <span>WhatsApp: <strong className="text-white">{agendamento.cliente_whatsapp}</strong></span>
            )}
          </div>

          {/* Histórico / Aviso de Remarcações */}
          {agendamento.qtd_remarcacoes > 0 && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-[11px] text-amber-300">
              <Info className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>
                Este agendamento já foi remarcado {agendamento.qtd_remarcacoes} vez(es). (Limite de {agendamento.limite_remarcacoes_cliente || 2} permitida(s))
              </span>
            </div>
          )}
        </div>

        {/* 3 BOTÕES DE AÇÃO PRINCIPAIS */}
        <div className="space-y-2.5">
          {/* BOTÃO 1: Confirmar Presença (Apenas se pendente de confirmação) */}
          {status === 'agendado' && (
            <button
              type="button"
              disabled={processandoAcao}
              onClick={handleConfirmarPresenca}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {processandoAcao ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CalendarCheck className="w-5 h-5" />
                  <span>Confirmar Minha Presença</span>
                </>
              )}
            </button>
          )}

          {/* BOTÃO 2: Remarcar Horário */}
          {podeRemarcar && !remarcando && (
            <button
              type="button"
              onClick={() => {
                setRemarcando(true);
                setNovaData(diasDisponiveisRemarcacao[0]?.data || '');
              }}
              className="w-full py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-850 text-slate-200 font-bold text-xs border border-slate-800 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Remarcar Horário</span>
            </button>
          )}

          {/* BOTÃO 3: Cancelar Atendimento */}
          {podeCancelar && !cancelando && (
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => setCancelando(true)}
                className="text-xs text-rose-400/80 hover:text-rose-400 hover:underline transition cursor-pointer"
              >
                Não poderei comparecer? Cancelar agendamento
              </button>
            </div>
          )}
        </div>

        {/* SELETOR INTERATIVO DE REMARCAÇÃO */}
        {remarcando && (
          <div className="bg-[#0F172A] border border-amber-500/30 rounded-3xl p-5 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Remarcação de Horário</span>
              </h3>
              <button
                type="button"
                onClick={() => setRemarcando(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Fechar
              </button>
            </div>

            {/* Passo A: Profissional Habilitado (Padrão: Atual, com opção de trocar) */}
            {profissionaisHabilitados.length > 1 && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400">1. Selecione o Profissional</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {profissionaisHabilitados.map((prof) => {
                    const ativo = profissionalRemarcacaoId === prof.id;
                    return (
                      <button
                        key={prof.id}
                        type="button"
                        onClick={() => setProfissionalRemarcacaoId(prof.id)}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center gap-2 ${
                          ativo
                            ? 'bg-amber-500/15 border-amber-500 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <User className="w-4 h-4 text-amber-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold truncate">{prof.nome_completo}</p>
                          {prof.especialidade_cargo && (
                            <p className="text-[10px] text-slate-400 truncate">{prof.especialidade_cargo}</p>
                          )}
                        </div>
                        {ativo && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Passo B: Seletor de Nova Data */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400">
                {profissionaisHabilitados.length > 1 ? '2. Selecione a Nova Data' : '1. Selecione a Nova Data'}
              </label>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                {diasDisponiveisRemarcacao.map((item) => {
                  const selecionado = novaData === item.data;
                  return (
                    <button
                      key={item.data}
                      type="button"
                      onClick={() => setNovaData(item.data)}
                      className={`shrink-0 px-3 py-2 rounded-xl border text-center transition cursor-pointer min-w-[70px] ${
                        selecionado
                          ? 'bg-amber-500 text-slate-950 font-black border-amber-400 shadow-md'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="block text-[10px] uppercase">{item.diaSemana}</span>
                      <span className="block text-xs font-bold">{item.diaMes}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Passo C: Horários Livres Calculados em Tempo Real */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400">
                {profissionaisHabilitados.length > 1 ? '3. Selecione o Novo Horário' : '2. Selecione o Novo Horário'}
              </label>
              {carregandoSlots ? (
                <div className="py-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Consultando horários livres...</span>
                </div>
              ) : slotsDisponiveis.filter(s => s.disponivel).length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">
                  Nenhum horário livre encontrado para esta data. Selecione outro dia acima.
                </p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-44 overflow-y-auto pr-1">
                  {slotsDisponiveis
                    .filter((s) => s.disponivel)
                    .map((slot) => {
                      const ativo = novaHora === slot.hora_inicio;
                      return (
                        <button
                          key={slot.hora_inicio}
                          type="button"
                          onClick={() => setNovaHora(slot.hora_inicio)}
                          className={`py-2 px-1 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                            ativo
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                              : 'bg-slate-900 text-slate-200 border-slate-800 hover:border-amber-500/50'
                          }`}
                        >
                          {slot.hora_inicio}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Confirmação da Remarcação */}
            <button
              type="button"
              disabled={processandoAcao || !novaHora}
              onClick={handleConfirmarRemarcacao}
              className="w-full py-3.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
            >
              {processandoAcao ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>Confirmar Novo Horário ({novaHora ? `${formatarDataPtBr(novaData)} às ${novaHora}` : 'Selecione acima'})</span>
              )}
            </button>
          </div>
        )}

        {/* DIÁLOGO DE CANCELAMENTO */}
        {cancelando && (
          <div className="bg-[#0F172A] border border-rose-500/30 rounded-3xl p-5 space-y-3 animate-in fade-in">
            <h3 className="font-bold text-sm text-rose-400 flex items-center gap-2">
              <CalendarX className="w-4 h-4" />
              <span>Confirmar Cancelamento do Agendamento</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tem certeza que deseja cancelar? Seu horário será liberado imediatamente para outros clientes.
            </p>
            <input
              type="text"
              placeholder="Motivo do cancelamento (opcional)..."
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-emerald-500"
            />
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCancelando(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={processandoAcao}
                onClick={handleConfirmarCancelamento}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {processandoAcao ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Sim, Cancelar</span>}
              </button>
            </div>
          </div>
        )}

        {/* INTEGRAÇÃO COM CALENDÁRIOS (Google Agenda e .ICS) */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-3xl p-4 space-y-3">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-emerald-400" />
            Adicionar à Minha Agenda
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <a
              href={linkGoogleCalendar}
              target="_blank"
              rel="noreferrer"
              className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-800 transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              <span>Google Agenda</span>
            </a>
            <button
              type="button"
              onClick={handleDownloadIcs}
              className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-800 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Apple / Outlook (.ics)</span>
            </button>
          </div>
        </div>

        {/* Falar no WhatsApp com a Loja */}
        {agendamento.loja_whatsapp && (
          <a
            href={linkWhatsAppLoja}
            target="_blank"
            rel="noreferrer"
            className="w-full py-3 px-4 rounded-2xl bg-[#0F172A] hover:bg-slate-800 text-emerald-400 font-bold text-xs border border-emerald-500/20 transition flex items-center justify-center gap-2 shadow-2xs"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Falar com {agendamento.loja_nome} no WhatsApp</span>
          </a>
        )}

        {/* Link para o catálogo da loja */}
        {agendamento.loja_slug && (
          <div className="pt-2 text-center">
            <Link
              to={`/catalog/${agendamento.loja_slug}`}
              className="text-xs text-slate-500 hover:text-slate-300 transition"
            >
              ← Ver mais produtos e serviços em <strong>{agendamento.loja_nome}</strong>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
