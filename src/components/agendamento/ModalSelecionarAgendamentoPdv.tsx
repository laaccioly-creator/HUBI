// =============================================================================
// COMPONENTE: ModalSelecionarAgendamentoPdv.tsx
// Modal de Seleção de Horário e Profissional para Serviços no PDV
// =============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Search,
  User,
  Plus,
  AlertTriangle
} from 'lucide-react';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { agendamentoService, formatarDataPtBr } from '../../services/agendamentoService';
import { ShippingOrchestrator } from '../../services/shippingOrchestrator';
import { ModalNovoCliente } from '../ModalNovoCliente';
import { ModalAtualizarEnderecoCliente } from '../shipping/ModalAtualizarEnderecoCliente';
import type {
  SlotHorarioDisponivel,
  ItemAgendamentoInfo,
  ModalidadeLocalPrestacao
} from '../../types/agendamento';
import type { Produto, UsuarioLoja, Cliente } from '../../types';
import type { ClienteEndereco } from '../../types/shipping';

const isEnderecoCompleto = (end?: ClienteEndereco | null): boolean => {
  if (!end) return false;
  const cepLimpo = (end.cep || '').replace(/\D/g, '');
  return Boolean(
    cepLimpo.length >= 8 &&
    end.logradouro?.trim() &&
    end.numero?.trim() &&
    end.bairro?.trim() &&
    end.cidade?.trim() &&
    end.uf?.trim()
  );
};

const formatarEnderecoSnapshot = (end: ClienteEndereco): string => {
  const linha1 = [end.logradouro, end.numero].filter(Boolean).join(', ');
  const linha2 = [end.complemento, end.bairro].filter(Boolean).join(' - ');
  const linha3 = [end.cidade, end.uf].filter(Boolean).join('/');
  const cepFmt = end.cep ? `CEP ${end.cep}` : '';
  return [linha1, linha2, linha3, cepFmt].filter(Boolean).join(' • ');
};

interface ModalSelecionarAgendamentoPdvProps {
  isOpen: boolean;
  onClose: () => void;
  produto: Produto;
  lojaId: string;
  cliente?: Cliente | null;
  clientesDisponiveis?: Cliente[];
  onClienteCadastrado?: (novoCliente: Cliente) => void;
  onClienteAtualizado?: (clienteAtualizado: Cliente) => void;
  onSincronizarClienteCarrinho?: (cliente: Cliente) => void;
  agendamentoExistente?: ItemAgendamentoInfo | null;
  onConfirmar: (dadosAgendamento: ItemAgendamentoInfo) => void;
}

export const ModalSelecionarAgendamentoPdv: React.FC<ModalSelecionarAgendamentoPdvProps> = ({
  isOpen,
  onClose,
  produto,
  lojaId,
  cliente,
  clientesDisponiveis,
  onClienteCadastrado,
  onClienteAtualizado,
  onSincronizarClienteCarrinho,
  agendamentoExistente,
  onConfirmar
}) => {
  useRegisterOverlay(isOpen, onClose, 'modal-selecionar-agendamento-pdv');
  const { isDark } = useTheme();

  // 0. Identificação do Cliente e Endereços
  const [listaClientes, setListaClientes] = useState<Cliente[]>(clientesDisponiveis || []);
  const [carregandoClientes, setCarregandoClientes] = useState<boolean>(false);
  const [clienteSelecionadoModal, setClienteSelecionadoModal] = useState<Cliente | null>(cliente || null);
  const [buscaCliente, setBuscaCliente] = useState<string>('');
  const [dropdownClientesAberto, setDropdownClientesAberto] = useState<boolean>(false);
  const [modalNovoClienteAberto, setModalNovoClienteAberto] = useState<boolean>(false);

  const [enderecosCliente, setEnderecosCliente] = useState<ClienteEndereco[]>([]);
  const [carregandoEnderecos, setCarregandoEnderecos] = useState<boolean>(false);
  const [enderecoSelecionado, setEnderecoSelecionado] = useState<ClienteEndereco | null>(null);
  const [modalAtualizarEnderecoAberto, setModalAtualizarEnderecoAberto] = useState<boolean>(false);
  const [modalEscolherEnderecoAberto, setModalEscolherEnderecoAberto] = useState<boolean>(false);

  useRegisterOverlay(
    modalEscolherEnderecoAberto,
    () => setModalEscolherEnderecoAberto(false),
    'modal-escolher-endereco-agendamento-pdv'
  );

  // 1. Determinação da modalidade de local
  const modoFixo = produto.local_prestacao_servico === 'loja' || produto.local_prestacao_servico === 'externo'
    ? (produto.local_prestacao_servico as ModalidadeLocalPrestacao)
    : null;

  const [modalidadeLocal, setModalidadeLocal] = useState<ModalidadeLocalPrestacao>(() => {
    if (agendamentoExistente?.modalidade_local) return agendamentoExistente.modalidade_local;
    if (modoFixo) return modoFixo;
    return 'loja';
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

  // Sincronizar lista de clientes e cliente inicial ao abrir
  useEffect(() => {
    if (!isOpen) return;
    if (clientesDisponiveis && clientesDisponiveis.length > 0) {
      setListaClientes(clientesDisponiveis);
    } else if (lojaId) {
      let montado = true;
      setCarregandoClientes(true);
      void (async () => {
        try {
          const { data, error: erroClientes } = await supabase
            .from('clientes')
            .select('*')
            .eq('loja_id', lojaId)
            .eq('ativo', true)
            .order('nome', { ascending: true });
          if (montado && !erroClientes && data) {
            setListaClientes(data as Cliente[]);
          }
        } finally {
          if (montado) setCarregandoClientes(false);
        }
      })();
      return () => {
        montado = false;
      };
    }
  }, [isOpen, lojaId, clientesDisponiveis]);

  useEffect(() => {
    if (!isOpen) return;
    if (cliente) {
      setClienteSelecionadoModal(cliente);
      return;
    }
    if (agendamentoExistente?.cliente_id && listaClientes.length > 0) {
      const encontrado = listaClientes.find(c => c.id === agendamentoExistente.cliente_id) || null;
      if (encontrado) setClienteSelecionadoModal(encontrado);
    }
  }, [isOpen, cliente, agendamentoExistente?.cliente_id, listaClientes]);

  const carregarEnderecosDoCliente = useCallback(async (clienteId: string, preferredEnderecoId?: string | null) => {
    if (!clienteId) {
      setEnderecosCliente([]);
      setEnderecoSelecionado(null);
      return;
    }
    setCarregandoEnderecos(true);
    try {
      const lista = await ShippingOrchestrator.listarEnderecosCliente(clienteId);
      setEnderecosCliente(lista);
      const targetId = preferredEnderecoId ?? agendamentoExistente?.cliente_endereco_id ?? null;
      const porId = targetId ? lista.find(e => e.id === targetId && isEnderecoCompleto(e)) : null;
      const primeiroValido = lista.find(e => isEnderecoCompleto(e)) || null;
      setEnderecoSelecionado(porId || primeiroValido || lista[0] || null);
    } catch (err) {
      console.error('Erro ao carregar endereços do cliente:', err);
      setEnderecosCliente([]);
      setEnderecoSelecionado(null);
    } finally {
      setCarregandoEnderecos(false);
    }
  }, [agendamentoExistente?.cliente_endereco_id]);

  useEffect(() => {
    if (!isOpen || !clienteSelecionadoModal?.id) {
      setEnderecosCliente([]);
      setEnderecoSelecionado(null);
      return;
    }
    carregarEnderecosDoCliente(clienteSelecionadoModal.id);
  }, [isOpen, clienteSelecionadoModal?.id, carregarEnderecosDoCliente]);

  const clientesFiltrados = useMemo(() => {
    const termo = buscaCliente.trim().toLowerCase();
    const termoLimpo = termo.replace(/\D/g, '');
    if (!termo) return listaClientes.slice(0, 30);
    return listaClientes.filter((c) => {
      const nomeMatch = (c.nome || '').toLowerCase().includes(termo);
      const tel = (c.whatsapp || c.telefone || '').replace(/\D/g, '');
      const doc = (c.numero_documento || '').replace(/\D/g, '');
      const telMatch = termoLimpo ? tel.includes(termoLimpo) : (c.whatsapp || c.telefone || '').toLowerCase().includes(termo);
      const docMatch = termoLimpo ? doc.includes(termoLimpo) : (c.numero_documento || '').toLowerCase().includes(termo);
      return nomeMatch || telMatch || docMatch;
    }).slice(0, 30);
  }, [listaClientes, buscaCliente]);

  const enderecoValido = isEnderecoCompleto(enderecoSelecionado);

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
  const podeConfirmar = Boolean(
    slotSelecionado &&
    profissionalId &&
    (modalidadeLocal !== 'externo' || (clienteSelecionadoModal && enderecoValido))
  );

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
    if (modalidadeLocal === 'externo') {
      if (!clienteSelecionadoModal) {
        setErro('Selecione um cliente para confirmar o atendimento externo.');
        return;
      }
      if (!enderecoSelecionado || !isEnderecoCompleto(enderecoSelecionado)) {
        setErro('O endereço do cliente precisa estar completo para agendar atendimento externo.');
        return;
      }
    }

    if (clienteSelecionadoModal && onSincronizarClienteCarrinho) {
      onSincronizarClienteCarrinho(clienteSelecionadoModal);
    }

    const dados: ItemAgendamentoInfo = {
      profissional_id: profissionalId,
      profissional_nome: profissionalAtivo.nome_completo || profissionalAtivo.nome || 'Profissional',
      data_agendamento: dataSelecionada,
      hora_inicio: slotSelecionado.hora_inicio,
      hora_fim: slotSelecionado.hora_fim,
      modalidade_local: modalidadeLocal,
      cliente_id: clienteSelecionadoModal?.id || null,
      cliente_endereco_id: modalidadeLocal === 'externo' ? (enderecoSelecionado?.id || null) : null,
      endereco_prestacao_snapshot:
        modalidadeLocal === 'externo' && enderecoSelecionado
          ? formatarEnderecoSnapshot(enderecoSelecionado)
          : null,
      observacoes: observacoes.trim() || null
    };

    onConfirmar(dados);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
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
          {/* SEÇÃO: Identificação do Cliente */}
          <div className="space-y-2 relative">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <User size={14} className="text-emerald-500" />
                <span>Cliente do Agendamento:</span>
                {modalidadeLocal === 'externo' && (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    (Obrigatório para domicílio)
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={() => setModalNovoClienteAberto(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold transition cursor-pointer"
              >
                <Plus size={12} />
                <span>Novo Cliente</span>
              </button>
            </div>

            {clienteSelecionadoModal ? (
              <div className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                isDark
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-white'
                  : 'bg-emerald-50/70 border-emerald-200 text-slate-900'
              }`}>
                <div className="min-w-0">
                  <p className="text-xs font-black truncate">{clienteSelecionadoModal.nome}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {clienteSelecionadoModal.whatsapp || clienteSelecionadoModal.telefone || 'Sem WhatsApp'}
                    {clienteSelecionadoModal.numero_documento ? ` • Doc: ${clienteSelecionadoModal.numero_documento}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setClienteSelecionadoModal(null);
                    setBuscaCliente('');
                    setDropdownClientesAberto(true);
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-500 transition shrink-0 cursor-pointer"
                >
                  Trocar
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative flex items-center">
                  <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={buscaCliente}
                    onFocus={() => setDropdownClientesAberto(true)}
                    onChange={(e) => {
                      setBuscaCliente(e.target.value);
                      setDropdownClientesAberto(true);
                    }}
                    placeholder="Buscar cliente por nome, WhatsApp ou CPF..."
                    className={`w-full pl-9 pr-8 py-2.5 rounded-xl border text-xs font-semibold focus:outline-none focus:border-emerald-500 ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-500'
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
                    }`}
                  />
                  {buscaCliente && (
                    <button
                      type="button"
                      onClick={() => setBuscaCliente('')}
                      className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {dropdownClientesAberto && (
                  <div className={`mt-1.5 rounded-2xl border shadow-xl max-h-48 overflow-y-auto z-30 ${
                    isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                  }`}>
                    {carregandoClientes ? (
                      <div className="p-3 text-xs text-slate-400 flex items-center justify-center gap-2">
                        <Loader2 size={14} className="animate-spin text-emerald-500" />
                        <span>Carregando clientes...</span>
                      </div>
                    ) : clientesFiltrados.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-500 space-y-2">
                        <p>Nenhum cliente encontrado.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setDropdownClientesAberto(false);
                            setModalNovoClienteAberto(true);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold cursor-pointer"
                        >
                          <Plus size={12} />
                          <span>Cadastrar Novo Cliente</span>
                        </button>
                      </div>
                    ) : (
                      clientesFiltrados.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setClienteSelecionadoModal(c);
                            setBuscaCliente('');
                            setDropdownClientesAberto(false);
                          }}
                          className={`w-full px-3 py-2.5 text-left border-b last:border-b-0 flex items-center justify-between gap-2 transition cursor-pointer ${
                            isDark
                              ? 'border-slate-800 hover:bg-slate-800/80'
                              : 'border-slate-100 hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="text-xs font-bold block truncate">{c.nome}</span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                              {c.whatsapp || c.telefone || 'Sem telefone'}
                              {c.numero_documento ? ` • ${c.numero_documento}` : ''}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                            Selecionar
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

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

            {/* Endereço caso seja externo (integrado com cadastro do cliente) */}
            {modalidadeLocal === 'externo' && (
              <div className="space-y-2 animate-in fade-in">
                {!clienteSelecionadoModal ? (
                  <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5">
                    <AlertCircle size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="font-semibold">
                      Selecione um cliente acima para verificar o endereço de atendimento.
                    </span>
                  </div>
                ) : carregandoEnderecos ? (
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-500 flex items-center gap-2">
                    <Loader2 size={15} className="animate-spin text-emerald-500 shrink-0" />
                    <span>Verificando endereço cadastrado do cliente...</span>
                  </div>
                ) : !enderecoValido ? (
                  <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 space-y-2.5">
                    <div className="flex items-start gap-2.5 text-amber-900 dark:text-amber-200 text-xs">
                      <AlertTriangle size={16} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <span className="font-semibold leading-relaxed">
                        O endereço deste cliente não está cadastrado ou está incompleto. Atualize o endereço para agendar atendimento externo.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalAtualizarEnderecoAberto(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                    >
                      <MapPin size={14} />
                      <span>Atualizar Endereço do Cliente</span>
                    </button>
                  </div>
                ) : (
                  <div className={`p-3.5 rounded-xl border space-y-2 ${
                    isDark
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-white'
                      : 'bg-slate-50 border-emerald-200 text-slate-900'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                              Endereço de Atendimento Validado
                            </span>
                            {enderecoSelecionado?.identificador && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                {enderecoSelecionado.identificador}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5 break-words">
                            {enderecoSelecionado ? formatarEnderecoSnapshot(enderecoSelecionado) : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (enderecosCliente.length > 1) {
                            setModalEscolherEnderecoAberto(true);
                          } else {
                            setModalAtualizarEnderecoAberto(true);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-emerald-500 transition shrink-0 cursor-pointer"
                      >
                        Alterar / Outro Endereço
                      </button>
                    </div>
                  </div>
                )}
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
            disabled={!podeConfirmar}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={15} />
            <span>Confirmar Horário do Serviço</span>
          </button>
        </div>
      </div>
    </div>

    {/* Submodal: Cadastrar Novo Cliente */}
    <ModalNovoCliente
      isOpen={modalNovoClienteAberto}
      onClose={() => setModalNovoClienteAberto(false)}
      onClienteCadastrado={(novoCliente) => {
        setListaClientes(prev => [novoCliente, ...prev]);
        setClienteSelecionadoModal(novoCliente);
        setDropdownClientesAberto(false);
        setModalNovoClienteAberto(false);
        onClienteCadastrado?.(novoCliente);
      }}
    />

    {/* Submodal: Escolher Outro Endereço Cadastrado */}
    {modalEscolherEnderecoAberto && clienteSelecionadoModal && (
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
        <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}>
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-emerald-500" />
              <h3 className="text-sm font-black">Selecionar Endereço do Cliente</h3>
            </div>
            <button
              type="button"
              onClick={() => setModalEscolherEnderecoAberto(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-4 max-h-72 overflow-y-auto space-y-2">
            {enderecosCliente.map((end) => {
              const completo = isEnderecoCompleto(end);
              const ativo = enderecoSelecionado?.id === end.id;
              return (
                <button
                  key={end.id}
                  type="button"
                  disabled={!completo}
                  onClick={() => {
                    setEnderecoSelecionado(end);
                    setModalEscolherEnderecoAberto(false);
                  }}
                  className={`w-full p-3 rounded-xl border text-left transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    ativo
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-400">
                      {end.identificador || (end.is_principal ? 'Principal' : 'Endereço')}
                    </span>
                    {!completo && (
                      <span className="text-[10px] font-bold text-amber-600">Incompleto</span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {formatarEnderecoSnapshot(end)}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setModalEscolherEnderecoAberto(false)}
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={() => {
                setModalEscolherEnderecoAberto(false);
                setModalAtualizarEnderecoAberto(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
            >
              <Plus size={14} />
              <span>Editar / Novo Endereço</span>
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Submodal: Atualizar / Cadastrar Endereço do Cliente */}
    {modalAtualizarEnderecoAberto && clienteSelecionadoModal && (
      <ModalAtualizarEnderecoCliente
        aberto={modalAtualizarEnderecoAberto}
        onFechar={() => setModalAtualizarEnderecoAberto(false)}
        cliente={clienteSelecionadoModal}
        enderecoIdAtual={enderecoSelecionado?.id || null}
        onSucesso={(clienteAtualizado, enderecoSalvo) => {
          setClienteSelecionadoModal(clienteAtualizado);
          setListaClientes(prev => prev.map(c => c.id === clienteAtualizado.id ? clienteAtualizado : c));
          onClienteAtualizado?.(clienteAtualizado);
          setModalAtualizarEnderecoAberto(false);
          carregarEnderecosDoCliente(clienteAtualizado.id, enderecoSalvo.id);
        }}
      />
    )}
    </>
  );
};
