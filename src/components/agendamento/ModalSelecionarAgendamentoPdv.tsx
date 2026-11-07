// =============================================================================
// COMPONENTE: ModalSelecionarAgendamentoPdv.tsx
// Modal de Seleção de Horário e Profissional para Serviços no PDV
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  UserCheck,
  Check,
  AlertCircle,
  Loader2,
  Building2,
  Home,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { useTheme } from '../../contexts/ThemeContext';
import { agendamentoService, formatarDataPtBr } from '../../services/agendamentoService';
import type {
  SlotHorarioDisponivel,
  ItemAgendamentoInfo,
  ModalidadeLocalPrestacao
} from '../../types/agendamento';
import type { Produto, UsuarioLoja, Cliente } from '../../types';

interface ModalSelecionarAgendamentoPdvProps {
  isOpen: boolean;
  onClose: () => void;
  produto: Produto;
  lojaId: string;
  cliente?: Cliente | null;
  agendamentoExistente?: ItemAgendamentoInfo | null;
  onConfirmar: (dadosAgendamento: ItemAgendamentoInfo) => void;
}

export const ModalSelecionarAgendamentoPdv: React.FC<ModalSelecionarAgendamentoPdvProps> = ({
  isOpen,
  onClose,
  produto,
  lojaId,
  cliente,
  agendamentoExistente,
  onConfirmar
}) => {
  useRegisterOverlay(isOpen, onClose, 'modal-selecionar-agendamento-pdv');
  const { isDark } = useTheme();

  // 1. Determinação da modalidade de local
  const modoFixo = produto.local_prestacao_servico === 'loja' || produto.local_prestacao_servico === 'externo'
    ? (produto.local_prestacao_servico as ModalidadeLocalPrestacao)
    : null;

  const [modalidadeLocal, setModalidadeLocal] = useState<ModalidadeLocalPrestacao>(() => {
    if (agendamentoExistente?.modalidade_local) return agendamentoExistente.modalidade_local;
    if (modoFixo) return modoFixo;
    return 'loja';
  });

  const [enderecoSnapshot, setEnderecoSnapshot] = useState<string>(() => {
    if (agendamentoExistente?.endereco_prestacao_snapshot) {
      return agendamentoExistente.endereco_prestacao_snapshot;
    }
    if (cliente) {
      const partes = [
        cliente.endereco_logradouro,
        cliente.endereco_numero ? `nº ${cliente.endereco_numero}` : '',
        cliente.endereco_bairro,
        cliente.endereco_cidade
      ].filter(Boolean);
      return partes.join(', ');
    }
    return '';
  });

  // 2. Profissionais habilitados
  const [profissionais, setProfissionais] = useState<UsuarioLoja[]>([]);
  const [carregandoProfissionais, setCarregandoProfissionais] = useState<boolean>(true);
  const [profissionalId, setProfissionalId] = useState<string>(
    agendamentoExistente?.profissional_id || ''
  );

  // 3. Data do Serviço
  const hojeStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [dataSelecionada, setDataSelecionada] = useState<string>(
    agendamentoExistente?.data_agendamento || hojeStr()
  );

  // 4. Slots calculados
  const [slots, setSlots] = useState<SlotHorarioDisponivel[]>([]);
  const [carregandoSlots, setCarregandoSlots] = useState<boolean>(false);
  const [slotSelecionado, setSlotSelecionado] = useState<SlotHorarioDisponivel | null>(null);
  const [observacoes, setObservacoes] = useState<string>(agendamentoExistente?.observacoes || '');
  const [erro, setErro] = useState<string | null>(null);

  const duracao = produto.duracao_estimada_minutos || 30;

  // Carregar lista de profissionais habilitados para o serviço
  useEffect(() => {
    if (!isOpen || !lojaId || !produto?.id) return;
    let montado = true;
    setCarregandoProfissionais(true);

    agendamentoService
      .listarProfissionaisHabilitadosPorServico(lojaId, produto.id)
      .then((profs) => {
        if (!montado) return;
        setProfissionais(profs);
        if (profs.length > 0) {
          if (agendamentoExistente?.profissional_id && profs.some(p => p.id === agendamentoExistente.profissional_id)) {
            setProfissionalId(agendamentoExistente.profissional_id);
          } else {
            setProfissionalId(profs[0].id);
          }
        }
      })
      .catch((err) => {
        console.error('Erro ao listar profissionais do serviço:', err);
      })
      .finally(() => {
        if (montado) setCarregandoProfissionais(false);
      });

    return () => {
      montado = false;
    };
  }, [isOpen, lojaId, produto?.id, agendamentoExistente]);

  // Recalcular slots quando profissional ou data mudarem
  useEffect(() => {
    if (!isOpen || !lojaId || !produto?.id || !profissionalId || !dataSelecionada) {
      setSlots([]);
      return;
    }

    let montado = true;
    setCarregandoSlots(true);
    setErro(null);

    agendamentoService
      .calcularSlotsDisponiveis(lojaId, produto.id, profissionalId, dataSelecionada, duracao)
      .then((resultadoSlots) => {
        if (!montado) return;
        setSlots(resultadoSlots);

        // Se tínhamos um slot selecionado anteriormente, tenta mantê-lo se ainda estiver disponível
        if (agendamentoExistente?.hora_inicio) {
          const match = resultadoSlots.find(
            s => s.hora_inicio === agendamentoExistente.hora_inicio && s.disponivel
          );
          if (match) {
            setSlotSelecionado(match);
            return;
          }
        }
        setSlotSelecionado(null);
      })
      .catch((err) => {
        if (!montado) return;
        console.error('Erro ao calcular slots disponíveis:', err);
        setErro('Não foi possível carregar os horários disponíveis.');
      })
      .finally(() => {
        if (montado) setCarregandoSlots(false);
      });

    return () => {
      montado = false;
    };
  }, [isOpen, lojaId, produto?.id, profissionalId, dataSelecionada, duracao, agendamentoExistente]);

  // Atalhos de Data
  const aplicarAtalhoData = (diasAdicionais: number) => {
    const d = new Date();
    d.setDate(d.getDate() + diasAdicionais);
    const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setDataSelecionada(str);
  };

  const profissionalAtivo = profissionais.find(p => p.id === profissionalId);

  const handleConfirmar = () => {
    setErro(null);

    if (!profissionalId || !profissionalAtivo) {
      setErro('Selecione um profissional para o atendimento.');
      return;
    }
    if (!dataSelecionada) {
      setErro('Selecione uma data para o serviço.');
      return;
    }
    if (!slotSelecionado || !slotSelecionado.disponivel) {
      setErro('Selecione um horário disponível para o agendamento.');
      return;
    }
    if (modalidadeLocal === 'externo' && !enderecoSnapshot.trim()) {
      setErro('Informe o endereço onde o serviço externo será realizado.');
      return;
    }

    const dados: ItemAgendamentoInfo = {
      profissional_id: profissionalId,
      profissional_nome: profissionalAtivo.nome_completo || profissionalAtivo.nome || 'Profissional',
      data_agendamento: dataSelecionada,
      hora_inicio: slotSelecionado.hora_inicio,
      hora_fim: slotSelecionado.hora_fim,
      modalidade_local: modalidadeLocal,
      endereco_prestacao_snapshot: modalidadeLocal === 'externo' ? enderecoSnapshot.trim() : null,
      observacoes: observacoes.trim() || null
    };

    onConfirmar(dados);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200 select-none">
      <div
        className={`w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden transition-colors ${
          isDark ? 'bg-slate-900 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Calendar size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight">
                  Agendar Horário do Serviço
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  {duracao} min
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-md">
                {produto.nome}
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

        {/* Mensagem de Erro (se houver) */}
        {erro && (
          <div className="mx-4 sm:mx-5 mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle size={16} className="shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {/* Conteúdo com Scroll */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
          {/* PASSO 1: Local de Prestação do Serviço */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <MapPin size={14} className="text-emerald-500" />
              <span>1. Onde o serviço será realizado?</span>
            </label>

            {modoFixo ? (
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-300">
                {modoFixo === 'loja' ? <Building2 size={16} className="text-emerald-500" /> : <Home size={16} className="text-emerald-500" />}
                <span>
                  {modoFixo === 'loja'
                    ? 'Prestação na própria loja (Balcão)'
                    : 'Prestação externa (No endereço do cliente)'}
                </span>
                <span className="text-[10px] text-slate-400 font-bold ml-auto">(Fixo para este serviço)</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setModalidadeLocal('loja')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                    modalidadeLocal === 'loja'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <Building2 size={15} />
                  <span>Na Loja (Presencial)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalidadeLocal('externo')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                    modalidadeLocal === 'externo'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <Home size={15} />
                  <span>Externo (Domicílio)</span>
                </button>
              </div>
            )}

            {/* Endereço caso seja externo */}
            {modalidadeLocal === 'externo' && (
              <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 dark:bg-amber-950/20 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    Endereço de Atendimento:
                  </span>
                  {cliente && (cliente.endereco_logradouro || cliente.endereco_cidade) && (
                    <button
                      type="button"
                      onClick={() => {
                        const partes = [
                          cliente.endereco_logradouro,
                          cliente.endereco_numero ? `nº ${cliente.endereco_numero}` : '',
                          cliente.endereco_bairro,
                          cliente.endereco_cidade
                        ].filter(Boolean);
                        setEnderecoSnapshot(partes.join(', '));
                      }}
                      className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      Preencher do cadastro do cliente
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Ex: Rua das Flores, 120, Apto 302 - Centro"
                  value={enderecoSnapshot}
                  onChange={(e) => setEnderecoSnapshot(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}
          </div>

          {/* PASSO 2: Seleção do Profissional */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <UserCheck size={14} className="text-emerald-500" />
              <span>2. Escolha o Profissional / Atendente:</span>
            </label>

            {carregandoProfissionais ? (
              <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin text-emerald-500" />
                <span>Carregando profissionais da loja...</span>
              </div>
            ) : profissionais.length === 0 ? (
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>Nenhum profissional habilitado encontrado para este serviço.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {profissionais.map((prof) => {
                  const selecionado = prof.id === profissionalId;
                  return (
                    <button
                      key={prof.id}
                      type="button"
                      onClick={() => setProfissionalId(prof.id)}
                      className={`p-3 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
                        selecionado
                          ? 'bg-emerald-500/10 border-emerald-500 text-slate-900 dark:text-white ring-1 ring-emerald-500/40 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <span className="text-xs font-black block truncate">
                          {prof.nome_completo || prof.nome}
                        </span>
                        {prof.especialidade_cargo && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                            {prof.especialidade_cargo}
                          </span>
                        )}
                      </div>
                      {selecionado && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* PASSO 3: Data do Atendimento */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Calendar size={14} className="text-emerald-500" />
                <span>3. Data do Serviço:</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => aplicarAtalhoData(0)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                    dataSelecionada === hojeStr()
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtalhoData(1)}
                  className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 transition cursor-pointer"
                >
                  Amanhã
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtalhoData(2)}
                  className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 transition cursor-pointer"
                >
                  +2 dias
                </button>
              </div>
            </div>

            <input
              type="date"
              min={hojeStr()}
              value={dataSelecionada}
              onChange={(e) => setDataSelecionada(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* PASSO 4: Grade de Horários Disponíveis (Slots) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock size={14} className="text-emerald-500" />
                <span>4. Horário do Atendimento:</span>
              </label>
              {slotSelecionado && (
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                  {slotSelecionado.hora_inicio} às {slotSelecionado.hora_fim}
                </span>
              )}
            </div>

            {carregandoSlots ? (
              <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                <Loader2 size={22} className="animate-spin text-emerald-500" />
                <span>Calculando horários livres na agenda...</span>
              </div>
            ) : slots.length === 0 ? (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-400 space-y-1">
                <p className="font-semibold text-slate-600 dark:text-slate-300">
                  Nenhum horário disponível para esta data.
                </p>
                <p className="text-[11px]">
                  O profissional pode não ter expediente neste dia da semana ou todos os horários já foram reservados.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                {slots.map((slot) => {
                  const ehSelecionado = slotSelecionado?.hora_inicio === slot.hora_inicio;
                  return (
                    <button
                      key={slot.hora_inicio}
                      type="button"
                      disabled={!slot.disponivel}
                      onClick={() => setSlotSelecionado(slot)}
                      title={slot.disponivel ? `${slot.hora_inicio} às ${slot.hora_fim}` : (slot.motivo_indisponibilidade || 'Indisponível')}
                      className={`p-2 rounded-xl text-xs font-bold border transition flex flex-col items-center justify-center cursor-pointer ${
                        !slot.disponivel
                          ? 'opacity-35 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-800 cursor-not-allowed text-slate-400'
                          : ehSelecionado
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20 font-black scale-102 ring-1 ring-emerald-400'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-emerald-500'
                      }`}
                    >
                      <span className="font-mono">{slot.hora_inicio}</span>
                      <span className={`text-[9px] ${ehSelecionado ? 'text-white/80' : 'text-slate-400'}`}>
                        até {slot.hora_fim}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* PASSO 5: Observações adicionais */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              Observações / Instruções para o Atendimento (Opcional):
            </label>
            <input
              type="text"
              placeholder="Ex: Cliente tem preferência por corte na tesoura"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Rodapé com Confirmação */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmar}
            disabled={!slotSelecionado || !profissionalId}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={15} />
            <span>Confirmar Horário do Serviço</span>
          </button>
        </div>
      </div>
    </div>
  );
};
