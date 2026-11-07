// =============================================================================
// COMPONENTE: ModalExpedienteProfissional.tsx
// Configuração da Grade de Expediente Semanal do Colaborador (Dom a Sáb)
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  Coffee,
  Check,
  AlertCircle,
  Loader2,
  Copy,
  Save,
  User
} from 'lucide-react';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { useTheme } from '../../contexts/ThemeContext';
import { agendamentoService } from '../../services/agendamentoService';
import type { ProfissionalHorario, DiaSemana } from '../../types/agendamento';
import { DIA_SEMANA_NOMES } from '../../types/agendamento';
import type { UsuarioLoja } from '../../types';

interface ModalExpedienteProfissionalProps {
  isOpen: boolean;
  onClose: () => void;
  lojaId: string;
  profissional: UsuarioLoja;
  onSalvo?: () => void;
}

export const ModalExpedienteProfissional: React.FC<ModalExpedienteProfissionalProps> = ({
  isOpen,
  onClose,
  lojaId,
  profissional,
  onSalvo
}) => {
  useRegisterOverlay(isOpen, onClose, 'modal-expediente-profissional');
  const { isDark } = useTheme();

  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<boolean>(false);

  const [horarios, setHorarios] = useState<ProfissionalHorario[]>([]);

  useEffect(() => {
    if (!isOpen || !lojaId || !profissional?.id) return;

    let montado = true;
    setCarregando(true);
    setErro(null);
    setSucesso(false);

    agendamentoService
      .obterExpedienteProfissional(lojaId, profissional.id)
      .then((dados) => {
        if (montado) {
          setHorarios(dados);
        }
      })
      .catch((err) => {
        if (montado) {
          console.error('Erro ao carregar expediente:', err);
          setErro('Não foi possível carregar os horários do colaborador.');
        }
      })
      .finally(() => {
        if (montado) {
          setCarregando(false);
        }
      });

    return () => {
      montado = false;
    };
  }, [isOpen, lojaId, profissional?.id]);

  const handleToggleDia = (diaSemana: DiaSemana) => {
    setHorarios((prev) =>
      prev.map((h) => (h.dia_semana === diaSemana ? { ...h, ativo: !h.ativo } : h))
    );
  };

  const handleChangeCampo = (
    diaSemana: DiaSemana,
    campo: keyof ProfissionalHorario,
    valor: any
  ) => {
    setHorarios((prev) =>
      prev.map((h) => (h.dia_semana === diaSemana ? { ...h, [campo]: valor } : h))
    );
  };

  // Replicar horário da Segunda-feira (1) para Terça a Sexta (2 a 5)
  const handleReplicarSegundaParaUteis = () => {
    const segunda = horarios.find((h) => h.dia_semana === 1);
    if (!segunda) return;

    setHorarios((prev) =>
      prev.map((h) => {
        if (h.dia_semana >= 2 && h.dia_semana <= 5) {
          return {
            ...h,
            ativo: segunda.ativo,
            hora_inicio: segunda.hora_inicio,
            hora_fim: segunda.hora_fim,
            tem_intervalo: segunda.tem_intervalo,
            intervalo_inicio: segunda.intervalo_inicio,
            intervalo_fim: segunda.intervalo_fim
          };
        }
        return h;
      })
    );
  };

  const handleSalvar = async () => {
    if (!lojaId || !profissional?.id) return;

    try {
      setSalvando(true);
      setErro(null);

      // Validação básica de horários
      for (const h of horarios) {
        if (h.ativo) {
          if (!h.hora_inicio || !h.hora_fim) {
            setErro(`Preencha os horários de início e fim para ${DIA_SEMANA_NOMES[h.dia_semana]}.`);
            setSalvando(false);
            return;
          }
          if (h.hora_inicio >= h.hora_fim) {
            setErro(`O horário de início deve ser anterior ao término em ${DIA_SEMANA_NOMES[h.dia_semana]}.`);
            setSalvando(false);
            return;
          }
          if (h.tem_intervalo) {
            if (!h.intervalo_inicio || !h.intervalo_fim) {
              setErro(`Preencha o intervalo de almoço para ${DIA_SEMANA_NOMES[h.dia_semana]}.`);
              setSalvando(false);
              return;
            }
            if (h.intervalo_inicio >= h.intervalo_fim) {
              setErro(`O início do intervalo deve ser anterior ao retorno em ${DIA_SEMANA_NOMES[h.dia_semana]}.`);
              setSalvando(false);
              return;
            }
          }
        }
      }

      await agendamentoService.salvarExpedienteProfissional(lojaId, profissional.id, horarios);

      setSucesso(true);
      if (onSalvo) onSalvo();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Erro ao salvar expediente:', err);
      setErro(err?.message || 'Erro ao salvar a grade de horários. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
          isDark ? 'bg-slate-900 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Calendar size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                Expediente de Atendimento
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                <User size={13} className="text-emerald-500" />
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {profissional.nome_completo || profissional.nome}
                </span>
                {profissional.especialidade_cargo && (
                  <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    {profissional.especialidade_cargo}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Barra de Ações Rápidas */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between flex-wrap gap-2 shrink-0">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Defina os dias e horários em que este colaborador recebe agendamentos:
          </span>
          <button
            type="button"
            onClick={handleReplicarSegundaParaUteis}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition cursor-pointer"
            title="Aplica o horário configurado na Segunda-feira para Terça, Quarta, Quinta e Sexta"
          >
            <Copy size={13} />
            <span>Copiar 2ª para 3ª a 6ª</span>
          </button>
        </div>

        {/* Mensagens de Erro / Sucesso */}
        {erro && (
          <div className="mx-4 sm:mx-5 mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {sucesso && (
          <div className="mx-4 sm:mx-5 mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
            <Check size={16} className="shrink-0" />
            <span>Grade de atendimento salva com sucesso!</span>
          </div>
        )}

        {/* Conteúdo com Scroll */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
          {carregando ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin text-emerald-500" />
              <p className="text-xs text-slate-400">Carregando horários de atendimento...</p>
            </div>
          ) : (
            horarios.map((dia) => {
              const diaNome = DIA_SEMANA_NOMES[dia.dia_semana];
              return (
                <div
                  key={dia.dia_semana}
                  className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                    dia.ativo
                      ? isDark
                        ? 'bg-slate-800/70 border-slate-700'
                        : 'bg-white border-slate-200 shadow-xs'
                      : isDark
                      ? 'bg-slate-800/20 border-slate-800/40 opacity-60'
                      : 'bg-slate-50 border-slate-100 opacity-60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Switch e Nome do Dia */}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={dia.ativo}
                        onClick={() => handleToggleDia(dia.dia_semana)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          dia.ativo ? 'bg-emerald-600' : isDark ? 'bg-slate-700' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            dia.ativo ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      <span className="text-sm font-bold tracking-tight">
                        {diaNome}
                      </span>
                      {!dia.ativo && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          (Folga / Fechado)
                        </span>
                      )}
                    </div>

                    {/* Controles de Horário (somente se ativo) */}
                    {dia.ativo && (
                      <div className="flex flex-wrap items-center gap-3">
                        {/* Expediente Principal */}
                        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                          <Clock size={14} className="text-emerald-500 shrink-0" />
                          <input
                            type="time"
                            value={dia.hora_inicio}
                            onChange={(e) => handleChangeCampo(dia.dia_semana, 'hora_inicio', e.target.value)}
                            className="bg-transparent text-xs font-semibold focus:outline-none w-16"
                          />
                          <span className="text-xs text-slate-400">às</span>
                          <input
                            type="time"
                            value={dia.hora_fim}
                            onChange={(e) => handleChangeCampo(dia.dia_semana, 'hora_fim', e.target.value)}
                            className="bg-transparent text-xs font-semibold focus:outline-none w-16"
                          />
                        </div>

                        {/* Intervalo de Almoço */}
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={dia.tem_intervalo}
                              onChange={(e) => handleChangeCampo(dia.dia_semana, 'tem_intervalo', e.target.checked)}
                              className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500"
                            />
                            <Coffee size={13} className="text-amber-500" />
                            <span>Intervalo</span>
                          </label>

                          {dia.tem_intervalo && (
                            <div className="flex items-center gap-1.5 bg-amber-500/10 dark:bg-amber-950/20 px-2.5 py-1.5 rounded-lg border border-amber-500/20">
                              <input
                                type="time"
                                value={dia.intervalo_inicio || '12:00'}
                                onChange={(e) => handleChangeCampo(dia.dia_semana, 'intervalo_inicio', e.target.value)}
                                className="bg-transparent text-xs font-semibold text-amber-700 dark:text-amber-300 focus:outline-none w-16"
                              />
                              <span className="text-xs text-amber-500">às</span>
                              <input
                                type="time"
                                value={dia.intervalo_fim || '13:00'}
                                onChange={(e) => handleChangeCampo(dia.dia_semana, 'intervalo_fim', e.target.value)}
                                className="bg-transparent text-xs font-semibold text-amber-700 dark:text-amber-300 focus:outline-none w-16"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé com Botão Salvar */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/80 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando || carregando}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
          >
            {salvando ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Salvando Grade...</span>
              </>
            ) : (
              <>
                <Save size={15} />
                <span>Salvar Grade de Expediente</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
