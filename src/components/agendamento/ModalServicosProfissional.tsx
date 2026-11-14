import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Check,
  CheckSquare,
  Square,
  Clock,
  Loader2,
  ListChecks,
  Save
} from 'lucide-react';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { useTheme } from '../../contexts/ThemeContext';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { agendamentoService } from '../../services/agendamentoService';
import { formatarMoeda } from '../../utils/formatters';

interface ServicoItemLista {
  id: string;
  nome: string;
  preco_venda_varejo: number;
  duracao_estimada_minutos: number;
  categoria_nome: string;
}

interface ModalServicosProfissionalProps {
  isOpen: boolean;
  onClose: () => void;
  lojaId: string;
  usuario: {
    id: string;
    nome_completo: string;
  };
  onSalvo?: () => void;
}

export const ModalServicosProfissional: React.FC<ModalServicosProfissionalProps> = ({
  isOpen,
  onClose,
  lojaId,
  usuario,
  onSalvo
}) => {
  useRegisterOverlay(isOpen, onClose, 'modal-servicos-profissional');
  const { isDark } = useTheme();
  const { mostrarSucesso, mostrarErro } = useFeedbackModal();

  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [busca, setBusca] = useState<string>('');
  const [servicos, setServicos] = useState<ServicoItemLista[]>([]);
  const [vinculadosIniciais, setVinculadosIniciais] = useState<Set<string>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || !lojaId || !usuario?.id) return;
    let ativo = true;

    const carregar = async () => {
      setCarregando(true);
      setBusca('');
      try {
        const res = await agendamentoService.listarServicosComVinculoProfissional(lojaId, usuario.id);
        if (!ativo) return;
        setServicos(res.servicos);
        const setInit = new Set(res.vinculadosIds);
        setVinculadosIniciais(setInit);
        setSelecionados(new Set(res.vinculadosIds));
      } catch (err: unknown) {
        if (!ativo) return;
        const msg = err instanceof Error ? err.message : 'Erro ao carregar serviços da loja.';
        mostrarErro(msg, 'Falha ao Carregar Serviços');
      } finally {
        if (ativo) setCarregando(false);
      }
    };

    carregar();
    return () => {
      ativo = false;
    };
  }, [isOpen, lojaId, usuario?.id, mostrarErro]);

  const servicosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return servicos;
    return servicos.filter(
      (s) =>
        s.nome.toLowerCase().includes(termo) ||
        s.categoria_nome.toLowerCase().includes(termo)
    );
  }, [servicos, busca]);

  const categoriasDisponiveis = useMemo(() => {
    const mapa = new Map<string, string[]>();
    servicos.forEach((s) => {
      const lista = mapa.get(s.categoria_nome) || [];
      lista.push(s.id);
      mapa.set(s.categoria_nome, lista);
    });
    return Array.from(mapa.entries()).map(([nome, ids]) => ({ nome, ids }));
  }, [servicos]);

  const alternarServico = (servicoId: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(servicoId)) {
        next.delete(servicoId);
      } else {
        next.add(servicoId);
      }
      return next;
    });
  };

  const handleSelecionarTodos = () => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      servicosFiltrados.forEach((s) => next.add(s.id));
      return next;
    });
  };

  const handleLimparSelecao = () => {
    if (!busca.trim()) {
      setSelecionados(new Set());
      return;
    }
    setSelecionados((prev) => {
      const next = new Set(prev);
      servicosFiltrados.forEach((s) => next.delete(s.id));
      return next;
    });
  };

  const handleAlternarCategoria = (idsCategoria: string[]) => {
    const todosMarcados = idsCategoria.every((id) => selecionados.has(id));
    setSelecionados((prev) => {
      const next = new Set(prev);
      idsCategoria.forEach((id) => {
        if (todosMarcados) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });
      return next;
    });
  };

  const alteracoesPendentes = useMemo(() => {
    const alteracoes: Array<{ produtoId: string; habilitar: boolean }> = [];
    servicos.forEach((s) => {
      const estavaMarcado = vinculadosIniciais.has(s.id);
      const estaMarcado = selecionados.has(s.id);
      if (estavaMarcado !== estaMarcado) {
        alteracoes.push({ produtoId: s.id, habilitar: estaMarcado });
      }
    });
    return alteracoes;
  }, [servicos, vinculadosIniciais, selecionados]);

  const handleSalvar = async () => {
    if (!lojaId || !usuario?.id) return;
    if (alteracoesPendentes.length === 0) {
      onClose();
      return;
    }

    setSalvando(true);
    try {
      await agendamentoService.salvarServicosDoProfissional(
        lojaId,
        usuario.id,
        alteracoesPendentes
      );
      mostrarSucesso(
        `Serviços de ${usuario.nome_completo} atualizados com sucesso (${selecionados.size} habilitado(s)).`,
        'Serviços Atualizados'
      );
      onSalvo?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Não foi possível salvar os serviços do profissional.';
      mostrarErro(msg, 'Erro ao Salvar');
    } finally {
      setSalvando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border-2 ${
          isDark
            ? 'bg-[#08131A] border-slate-700 text-white'
            : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        {/* Cabeçalho */}
        <div className={`px-5 py-4 border-b flex items-center justify-between gap-3 ${
          isDark ? 'bg-[#000000] border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shrink-0">
              <ListChecks className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black truncate">
                Serviços Habilitados — {usuario.nome_completo}
              </h2>
              <p className={`text-xs font-medium truncate ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Marque os serviços que este profissional está autorizado a atender
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl transition cursor-pointer ${
              isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-200 text-slate-600'
            }`}
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Busca & Ações em Lote */}
        <div className={`p-4 border-b space-y-3 ${isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-200 bg-white'}`}>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
              <input
                type="text"
                placeholder="Buscar serviço por nome ou categoria..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs font-semibold border focus:outline-none transition ${
                  isDark
                    ? 'bg-[#000000] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500'
                    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600'
                }`}
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSelecionarTodos}
                disabled={carregando || servicosFiltrados.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer disabled:opacity-50"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Selecionar Todos</span>
              </button>
              <button
                type="button"
                onClick={handleLimparSelecao}
                disabled={carregando || selecionados.size === 0}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer disabled:opacity-50 ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Square className="w-3.5 h-3.5" />
                <span>Limpar Seleção</span>
              </button>
            </div>
          </div>

          {categoriasDisponiveis.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[11px] font-bold mr-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Por categoria:
              </span>
              {categoriasDisponiveis.map((cat) => {
                const todosMarcados = cat.ids.every((id) => selecionados.has(id));
                const algumMarcado = cat.ids.some((id) => selecionados.has(id));
                return (
                  <button
                    key={cat.nome}
                    type="button"
                    onClick={() => handleAlternarCategoria(cat.ids)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                      todosMarcados
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                        : algumMarcado
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                        : isDark
                        ? 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                        : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {todosMarcados ? '✓ ' : ''}{cat.nome} ({cat.ids.length})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Lista de Serviços */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {carregando ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <span className="text-xs font-semibold">Carregando serviços cadastrados...</span>
            </div>
          ) : servicos.length === 0 ? (
            <div className="py-12 text-center space-y-1">
              <p className="text-sm font-bold text-slate-500">Nenhum serviço ativo cadastrado na loja.</p>
              <p className="text-xs text-slate-400">Cadastre serviços em Produtos &amp; Serviços para vinculá-los aqui.</p>
            </div>
          ) : servicosFiltrados.length === 0 ? (
            <div className="py-10 text-center text-xs font-semibold text-slate-500">
              Nenhum serviço encontrado para &quot;{busca}&quot;.
            </div>
          ) : (
            servicosFiltrados.map((servico) => {
              const marcado = selecionados.has(servico.id);
              return (
                <button
                  key={servico.id}
                  type="button"
                  onClick={() => alternarServico(servico.id)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition flex items-center justify-between gap-3 cursor-pointer ${
                    marcado
                      ? isDark
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                        : 'bg-emerald-50/70 border-emerald-500 text-slate-900'
                      : isDark
                      ? 'bg-[#000000] border-slate-800 hover:border-slate-600 text-slate-200'
                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border-2 transition ${
                        marcado
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : isDark
                          ? 'bg-slate-900 border-slate-600'
                          : 'bg-white border-slate-300'
                      }`}
                    >
                      {marcado && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold truncate">{servico.nome}</div>
                      <div className={`text-[11px] font-medium flex items-center gap-2 flex-wrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <span>{servico.categoria_nome}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {servico.duracao_estimada_minutos} min
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className={`text-xs font-black shrink-0 ${marcado ? 'text-emerald-600 dark:text-emerald-400' : isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    {formatarMoeda(servico.preco_venda_varejo)}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Rodapé */}
        <div className={`px-5 py-3.5 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isDark ? 'bg-[#000000] border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            {selecionados.size} de {servicos.length} serviços selecionados
          </span>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={salvando}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSalvar}
              disabled={carregando || salvando}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{salvando ? 'Salvando...' : 'Salvar Serviços'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
