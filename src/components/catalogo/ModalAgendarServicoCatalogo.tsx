// =============================================================================
// COMPONENTE: ModalAgendarServicoCatalogo.tsx
// Modal Mobile-First para Agendamento de Serviços no Catálogo Online PWA
// =============================================================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  MapPin,
  Building2,
  Home,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  AlertCircle,
  Scissors
} from 'lucide-react';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { useTheme } from '../../contexts/ThemeContext';
import { agendamentoService, formatarDataPtBr } from '../../services/agendamentoService';
import type {
  ItemAgendamentoInfo,
  ModalidadeLocalPrestacao,
  SlotHorarioDisponivel
} from '../../types/agendamento';
import type { Produto, UsuarioLoja } from '../../types';

export interface ModalAgendarServicoCatalogoProps {
  isOpen: boolean;
  onClose: () => void;
  produto: Produto;
  lojaId: string;
  onConfirmarAgendamento: (dadosAgendamento: ItemAgendamentoInfo) => void;
}

export const ModalAgendarServicoCatalogo: React.FC<ModalAgendarServicoCatalogoProps> = ({
  isOpen,
  onClose,
  produto,
  lojaId,
  onConfirmarAgendamento
}) => {
  useRegisterOverlay(isOpen, onClose, 'modal-agendar-servico-catalogo');
  const { isDark } = useTheme();

  // 1. Determinação da modalidade inicial
  const localConfigurado = produto.local_prestacao_servico || 'loja';
  const ehLocalFixo = localConfigurado === 'loja' || localConfigurado === 'externo';

  const [modalidadeLocal, setModalidadeLocal] = useState<ModalidadeLocalPrestacao>(
    localConfigurado === 'externo' ? 'externo' : 'loja'
  );

  // 2. Profissionais habilitados
  const [profissionais, setProfissionais] = useState<UsuarioLoja[]>([]);
  const [profissionalSelecionado, setProfissionalSelecionado] = useState<UsuarioLoja | null>(null);
  const [carregandoProfissionais, setCarregandoProfissionais] = useState<boolean>(true);

  // 3. Seleção de Data
  const [dataSelecionada, setDataSelecionada] = useState<string>(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  });

  // 4. Slots de Horário
  const [slots, setSlots] = useState<SlotHorarioDisponivel[]>([]);
  const [slotSelecionado, setSlotSelecionado] = useState<SlotHorarioDisponivel | null>(null);
  const [carregandoSlots, setCarregandoSlots] = useState<boolean>(false);
  const [observacoesCliente, setObservacoesCliente] = useState<string>('');

  const carouselRef = useRef<HTMLDivElement>(null);

  // Carrega profissionais habilitados para o serviço
  useEffect(() => {
    if (!isOpen || !lojaId || !produto?.id) return;
    let ativo = true;
    setCarregandoProfissionais(true);

    agendamentoService
      .listarProfissionaisHabilitadosPorServico(lojaId, produto.id)
      .then((lista) => {
        if (ativo) {
          setProfissionais(lista);
          if (lista.length > 0) {
            setProfissionalSelecionado(lista[0]);
          } else {
            setProfissionalSelecionado(null);
          }
        }
      })
      .catch((err) => {
        console.error('Erro ao carregar colaboradores do serviço no catálogo:', err);
      })
      .finally(() => {
        if (ativo) setCarregandoProfissionais(false);
      });

    return () => {
      ativo = false;
    };
  }, [isOpen, lojaId, produto?.id]);

  // Carrega slots disponíveis quando profissional ou data mudam
  useEffect(() => {
    if (!isOpen || !lojaId || !produto?.id || !profissionalSelecionado?.id || !dataSelecionada) {
      setSlots([]);
      setSlotSelecionado(null);
      return;
    }

    let ativo = true;
    setCarregandoSlots(true);
    setSlotSelecionado(null);

    const duracao = produto.duracao_estimada_minutos || 30;

    agendamentoService
      .calcularSlotsDisponiveis(lojaId, produto.id, profissionalSelecionado.id, dataSelecionada, duracao)
      .then((listaSlots) => {
        if (ativo) {
          setSlots(listaSlots);
        }
      })
      .catch((err) => {
        console.error('Erro ao calcular horários livres no catálogo:', err);
      })
      .finally(() => {
        if (ativo) setCarregandoSlots(false);
      });

    return () => {
      ativo = false;
    };
  }, [isOpen, lojaId, produto?.id, produto.duracao_estimada_minutos, profissionalSelecionado?.id, dataSelecionada]);

  // Gera lista dos próximos 14 dias para o carrossel horizontal
  const diasCarrossel = useMemo(() => {
    const diasSemanaNomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const lista = [];
    const hoje = new Date();

    for (let i = 0; i < 14; i++) {
      const d = new Date(hoje);
      d.setDate(d.getDate() + i);
      const dataIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      lista.push({
        iso: dataIso,
        diaNumero: String(d.getDate()).padStart(2, '0'),
        diaSemana: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : diasSemanaNomes[d.getDay()],
        mes: mesesNomes[d.getMonth()]
      });
    }
    return lista;
  }, []);

  const handleConfirmar = () => {
    if (!profissionalSelecionado) {
      alert('Selecione um profissional para o atendimento.');
      return;
    }
    if (!slotSelecionado) {
      alert('Selecione um horário disponível para o atendimento.');
      return;
    }

    onConfirmarAgendamento({
      profissional_id: profissionalSelecionado.id,
      profissional_nome: profissionalSelecionado.nome_completo,
      data_agendamento: dataSelecionada,
      hora_inicio: slotSelecionado.hora_inicio,
      hora_fim: slotSelecionado.hora_fim,
      modalidade_local: modalidadeLocal,
      observacoes: observacoesCliente.trim() || null
    });
    onClose();
  };

  const duracaoMinutos = produto.duracao_estimada_minutos || 30;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className={`w-full sm:max-w-xl max-h-[92vh] sm:rounded-3xl rounded-t-3xl border flex flex-col shadow-2xl overflow-hidden transition-all animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200 ${
        isDark ? 'bg-[#0B0F17] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        
        {/* CABEÇALHO DO MODAL */}
        <div className={`p-4 sm:p-5 border-b shrink-0 flex items-center justify-between ${
          isDark ? 'border-slate-800/80 bg-slate-900/60' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-black text-emerald-500 tracking-wider block">
                Agendamento de Serviço
              </span>
              <h2 className="text-sm sm:text-base font-black truncate">
                {produto.nome}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl text-slate-400 hover:text-white transition cursor-pointer ${
              isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200 hover:text-slate-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CORPO DO MODAL (ROLÁVEL) */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-5">
          
          {/* PASSO 1: LOCAL DE PRESTAÇÃO */}
          <div>
            <label className="text-xs font-black uppercase text-slate-400 tracking-wider block mb-2">
              1. Onde você deseja o atendimento?
            </label>

            {ehLocalFixo ? (
              <div className={`p-3 rounded-2xl border flex items-center gap-3 ${
                isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                  {modalidadeLocal === 'loja' ? <Building2 className="w-5 h-5" /> : <Home className="w-5 h-5" />}
                </div>
                <div>
                  <span className="text-xs font-bold block">
                    {modalidadeLocal === 'loja' ? 'Atendimento Presencial na Loja' : 'Atendimento a Domicílio (Externo)'}
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    {modalidadeLocal === 'loja'
                      ? 'O serviço será realizado no endereço físico da nossa loja.'
                      : 'O profissional comparecerá no endereço que você cadastrar no pedido.'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setModalidadeLocal('loja')}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    modalidadeLocal === 'loja'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 ring-2 ring-emerald-500/30'
                      : isDark
                      ? 'border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Building2 className="w-5 h-5" />
                    {modalidadeLocal === 'loja' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  </div>
                  <span className="text-xs font-black block">Na Loja</span>
                  <span className="text-[10px] opacity-75">Atendimento no estabelecimento</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalidadeLocal('externo')}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    modalidadeLocal === 'externo'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 ring-2 ring-emerald-500/30'
                      : isDark
                      ? 'border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Home className="w-5 h-5" />
                    {modalidadeLocal === 'externo' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  </div>
                  <span className="text-xs font-black block">A Domicílio</span>
                  <span className="text-[10px] opacity-75">No endereço de sua escolha</span>
                </button>
              </div>
            )}
          </div>

          {/* PASSO 2: SELEÇÃO DE PROFISSIONAL */}
          <div>
            <label className="text-xs font-black uppercase text-slate-400 tracking-wider block mb-2">
              2. Com qual profissional?
            </label>

            {carregandoProfissionais ? (
              <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                <span>Carregando profissionais disponíveis...</span>
              </div>
            ) : profissionais.length === 0 ? (
              <div className="p-3.5 rounded-2xl border border-dashed border-amber-500/40 text-center text-xs text-amber-500">
                Nenhum colaborador com agenda aberta cadastrado para este serviço.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {profissionais.map((prof) => {
                  const isSel = profissionalSelecionado?.id === prof.id;
                  const iniciais = prof.nome_completo
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <button
                      key={prof.id}
                      type="button"
                      onClick={() => setProfissionalSelecionado(prof)}
                      className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center gap-3 ${
                        isSel
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 ring-2 ring-emerald-500/30'
                          : isDark
                          ? 'border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl font-black text-xs flex items-center justify-center shrink-0 border ${
                        isSel
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : isDark
                          ? 'bg-slate-800 border-slate-700 text-slate-300'
                          : 'bg-white border-slate-300 text-slate-700'
                      }`}>
                        {iniciais}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold truncate block">
                          {prof.nome_completo}
                        </span>
                        {prof.especialidade_cargo && (
                          <span className="text-[10px] text-slate-400 truncate block">
                            {prof.especialidade_cargo}
                          </span>
                        )}
                      </div>
                      {isSel && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* PASSO 3: DATA DO ATENDIMENTO */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black uppercase text-slate-400 tracking-wider">
                3. Escolha o dia
              </label>
              <span className="text-xs font-bold text-emerald-500">
                {formatarDataPtBr(dataSelecionada)}
              </span>
            </div>

            {/* Carrossel de Dias */}
            <div
              ref={carouselRef}
              className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none snap-x"
            >
              {diasCarrossel.map((diaItem) => {
                const isSel = diaItem.iso === dataSelecionada;
                return (
                  <button
                    key={diaItem.iso}
                    type="button"
                    onClick={() => setDataSelecionada(diaItem.iso)}
                    className={`min-w-[62px] py-2.5 px-1.5 rounded-2xl border text-center transition cursor-pointer snap-start shrink-0 flex flex-col items-center justify-center ${
                      isSel
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/20'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-[10px] font-bold opacity-80 block uppercase">
                      {diaItem.diaSemana}
                    </span>
                    <span className="text-base font-black my-0.5 block leading-tight">
                      {diaItem.diaNumero}
                    </span>
                    <span className="text-[9px] font-medium opacity-70 block uppercase">
                      {diaItem.mes}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PASSO 4: HORÁRIOS DISPONÍVEIS */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-500" />
                <span>4. Horário Disponível</span>
              </label>
              <span className="text-[11px] text-slate-400">
                ⏱️ Duração: <strong className={isDark ? 'text-white' : 'text-slate-900'}>{duracaoMinutos} min</strong>
              </span>
            </div>

            {carregandoSlots ? (
              <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                <span>Buscando horários livres com o profissional...</span>
              </div>
            ) : slots.length === 0 ? (
              <div className={`p-4 rounded-2xl border text-center text-xs font-semibold ${
                isDark
                  ? 'text-slate-200 bg-slate-800 border border-slate-700'
                  : 'text-slate-800 bg-slate-100 border border-slate-300'
              }`}>
                Nenhum horário livre para este profissional em {formatarDataPtBr(dataSelecionada)}. Selecione outro dia acima.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                {slots.map((slot) => {
                  const isSel = slotSelecionado?.hora_inicio === slot.hora_inicio;
                  return (
                    <button
                      key={slot.hora_inicio}
                      type="button"
                      disabled={!slot.disponivel}
                      onClick={() => setSlotSelecionado(slot)}
                      className={`py-2 px-2 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center cursor-pointer ${
                        !slot.disponivel
                          ? 'opacity-30 cursor-not-allowed bg-slate-900/30 border-slate-800 text-slate-500 line-through'
                          : isSel
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/20'
                          : isDark
                          ? 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-200'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                      }`}
                      title={slot.motivo_indisponibilidade}
                    >
                      <span className="text-xs font-black">{slot.hora_inicio}</span>
                      <span className="text-[9px] opacity-75">às {slot.hora_fim}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* OBSERVAÇÕES PARA O ATENDIMENTO */}
          <div>
            <label className="text-xs font-black uppercase text-slate-400 tracking-wider block mb-1.5">
              Observações ou Preferências (opcional)
            </label>
            <textarea
              rows={2}
              placeholder="Ex: Preferência de corte, modelo do equipamento ou detalhe para o profissional..."
              value={observacoesCliente}
              onChange={(e) => setObservacoesCliente(e.target.value)}
              className={`w-full px-3 py-2 rounded-2xl border text-xs focus:outline-none focus:border-emerald-500 resize-none ${
                isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            />
          </div>

        </div>

        {/* RODAPÉ COM RESUMO & CONFIRMAÇÃO */}
        <div className={`p-4 sm:p-5 border-t shrink-0 flex flex-col gap-2.5 ${
          isDark ? 'border-slate-800 bg-[#0F172A]' : 'border-slate-200 bg-white'
        }`}>
          {slotSelecionado && profissionalSelecionado && (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="truncate">
                📅 {formatarDataPtBr(dataSelecionada)} às {slotSelecionado.hora_inicio} • {profissionalSelecionado.nome_completo}
              </span>
              <span className="font-bold text-emerald-500 shrink-0">
                {modalidadeLocal === 'loja' ? 'Na Loja' : 'A Domicílio'}
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={!slotSelecionado || !profissionalSelecionado}
            onClick={handleConfirmar}
            className={`w-full py-3.5 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-md active:scale-98 ${
              !slotSelecionado || !profissionalSelecionado
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-50'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Confirmar e Agendar Horário</span>
          </button>
        </div>

      </div>
    </div>
  );
};
