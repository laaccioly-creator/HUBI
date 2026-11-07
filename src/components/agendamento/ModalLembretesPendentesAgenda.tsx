// =============================================================================
// COMPONENTE: ModalLembretesPendentesAgenda.tsx
// Fila e Gestão de Disparo de Lembretes WhatsApp de Atendimento
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Bell,
  MessageCircle,
  Check,
  Send,
  Loader2,
  AlertCircle,
  Calendar,
  Clock,
  User,
  Zap,
  ExternalLink,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { useTheme } from '../../contexts/ThemeContext';
import { agendamentoService, formatarDataPtBr } from '../../services/agendamentoService';
import { whatsappWalletService } from '../../services/whatsappWalletService';
import type { AgendamentoServico } from '../../types/agendamento';
import type { Loja } from '../../types';

interface ModalLembretesPendentesAgendaProps {
  isOpen: boolean;
  onClose: () => void;
  loja: Loja;
  onLembretesAtualizados?: () => void;
}

export const ModalLembretesPendentesAgenda: React.FC<ModalLembretesPendentesAgendaProps> = ({
  isOpen,
  onClose,
  loja,
  onLembretesAtualizados
}) => {
  useRegisterOverlay(isOpen, onClose, 'modal-lembretes-pendentes-agenda');
  const { tema } = useTheme();
  const isDark = tema === 'dark';

  const [pendentes, setPendentes] = useState<AgendamentoServico[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [disparandoLote, setDisparandoLote] = useState<boolean>(false);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [feedbackSucesso, setFeedbackSucesso] = useState<string | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  const carregarPendentes = useCallback(async () => {
    if (!loja?.id) return;
    try {
      setCarregando(true);
      setErroMsg(null);
      const lista = await agendamentoService.obterLembretesPendentesLoja(loja.id);
      setPendentes(lista);
    } catch (e: any) {
      console.error('Erro ao carregar lembretes pendentes:', e);
      setErroMsg('Não foi possível carregar os lembretes pendentes.');
    } finally {
      setCarregando(false);
    }
  }, [loja?.id]);

  useEffect(() => {
    if (isOpen) {
      carregarPendentes();
      setFeedbackSucesso(null);
    }
  }, [isOpen, carregarPendentes]);

  // Disparo em lote automático
  const handleDispararTodosAutomatico = async () => {
    if (!loja?.id) return;
    try {
      setDisparandoLote(true);
      setErroMsg(null);
      setFeedbackSucesso(null);

      const res = await agendamentoService.processarLembretesPendentesLoja(loja.id);

      if (res.totalDisparados > 0) {
        setFeedbackSucesso(`${res.totalDisparados} lembrete(s) disparado(s) com sucesso via WhatsApp!`);
      } else if (res.itensManuais.length > 0) {
        setFeedbackSucesso(`Envio automático concluído com link manual para ${res.itensManuais.length} contato(s).`);
      } else {
        setFeedbackSucesso('Nenhum lembrete pendente para disparo.');
      }

      await carregarPendentes();
      onLembretesAtualizados?.();
    } catch (e: any) {
      console.error('Erro ao disparar lembretes em lote:', e);
      setErroMsg('Ocorreu uma falha no disparo dos lembretes. Verifique os créditos da carteira.');
    } finally {
      setDisparandoLote(false);
    }
  };

  // Envio manual individual via WhatsApp (wa.me)
  const handleAbrirLinkManual = (ag: AgendamentoServico) => {
    const msg = agendamentoService.gerarMensagemWhatsappAgendamento(ag, loja, 'lembrete');
    const url = whatsappWalletService.construirLinkManualWhatsApp(ag.cliente_whatsapp, msg);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Marcar como enviado manualmente
  const handleMarcarComoEnviado = async (agId: string) => {
    if (!loja?.id) return;
    try {
      setProcessandoId(agId);
      await agendamentoService.marcarLembreteComoEnviado(loja.id, agId);
      setPendentes((prev) => prev.filter((p) => p.id !== agId));
      onLembretesAtualizados?.();
    } catch (e: any) {
      console.error('Erro ao marcar lembrete como enviado:', e);
    } finally {
      setProcessandoId(null);
    }
  };

  if (!isOpen) return null;

  const temAutoAtivo = Boolean(loja.whatsapp_auto_ativo && loja.wpp_auto_lembrete_agendamento);
  const horasAntecedencia = loja.antecedencia_lembrete_horas || 24;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
      <div
        className={`w-full max-w-2xl rounded-3xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${
          isDark ? 'bg-[#0F172A] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Topo do Modal */}
        <div
          className={`p-4 sm:p-5 border-b flex items-center justify-between shrink-0 ${
            isDark ? 'border-slate-800 bg-[#0B0F17]' : 'border-slate-100 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-500">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black flex items-center gap-2">
                Lembretes de Atendimento
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
                  {pendentes.length} pendente(s)
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Clientes com horário nas próximas {horasAntecedencia}h que ainda não receberam lembrete
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl transition cursor-pointer ${
              isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-200 text-slate-600'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback de Alertas */}
        {feedbackSucesso && (
          <div className="mx-4 mt-4 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedbackSucesso}</span>
          </div>
        )}

        {erroMsg && (
          <div className="mx-4 mt-4 p-3 bg-rose-500/15 border border-rose-500/30 rounded-2xl flex items-center gap-2 text-xs text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{erroMsg}</span>
          </div>
        )}

        {/* Barra de Ação Global (Disparar Todos) */}
        {pendentes.length > 0 && (
          <div
            className={`p-4 mx-4 my-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="space-y-0.5">
              <span className="text-xs font-bold flex items-center gap-1.5 text-slate-200 dark:text-slate-200">
                <Zap className="w-4 h-4 text-emerald-400" />
                Envio em Lote
              </span>
              <p className="text-[11px] text-slate-400">
                {temAutoAtivo
                  ? 'Dispare para todos os contatos automaticamente respeitando a carteira de WhatsApp.'
                  : 'WhatsApp Automático desativado nas configurações. Envie manualmente abaixo.'}
              </p>
            </div>

            <button
              type="button"
              disabled={disparandoLote || pendentes.length === 0}
              onClick={handleDispararTodosAutomatico}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
            >
              {disparandoLote ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Disparando...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Disparar Todos ({pendentes.length})</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Lista de Clientes na Fila */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {carregando ? (
            <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              <span>Buscando agendamentos pendentes de lembrete...</span>
            </div>
          ) : pendentes.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto border border-emerald-500/20">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-sm text-white">Todos os Lembretes em Dia!</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Nenhum cliente com atendimento próximo pendente de notificação nas próximas {horasAntecedencia} horas.
              </p>
            </div>
          ) : (
            pendentes.map((ag) => {
              const estaProcessando = processandoId === ag.id;
              return (
                <div
                  key={ag.id}
                  className={`p-3.5 rounded-2xl border transition space-y-2.5 ${
                    isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-white flex items-center gap-2">
                        {ag.cliente_nome}
                        <span className="text-[11px] font-normal text-slate-400">({ag.cliente_whatsapp})</span>
                      </h4>
                      <p className="text-xs font-semibold text-emerald-400">
                        {(ag as any).produto?.nome || 'Serviço Agendado'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 self-start sm:self-auto">
                      <span className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700/80 text-slate-300 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-emerald-400" />
                        {formatarDataPtBr(ag.data_agendamento)}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700/80 text-slate-300 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        {ag.hora_inicio} às {ag.hora_fim}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                    <span className="text-slate-400 flex items-center gap-1 truncate max-w-[200px] sm:max-w-xs">
                      <User className="w-3.5 h-3.5 text-slate-500" />
                      Prof.: {(ag as any).profissional?.nome_completo || 'Designado'}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAbrirLinkManual(ag)}
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-bold text-xs flex items-center gap-1.5 border border-emerald-500/25 transition cursor-pointer"
                        title="Abrir WhatsApp Web/App com a mensagem pronta de lembrete"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Enviar no WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        disabled={estaProcessando}
                        onClick={() => handleMarcarComoEnviado(ag.id)}
                        className={`p-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                          isDark
                            ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                            : 'border-slate-300 hover:bg-slate-200 text-slate-700'
                        }`}
                        title="Marcar lembrete como já enviado"
                      >
                        {estaProcessando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-emerald-400" />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé do Modal */}
        <div
          className={`p-3.5 sm:p-4 border-t shrink-0 flex items-center justify-between ${
            isDark ? 'border-slate-800 bg-[#0B0F17]' : 'border-slate-100 bg-slate-50'
          }`}
        >
          <button
            type="button"
            onClick={carregarPendentes}
            disabled={carregando}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} />
            <span>Recarregar Fila</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
