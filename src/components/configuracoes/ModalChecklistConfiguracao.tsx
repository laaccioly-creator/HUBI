import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Sparkles,
  ExternalLink,
  Key,
  CheckCircle2,
  Circle,
  Bot,
  ArrowRight,
  Store,
  FolderTree,
  Package,
  Truck,
  CreditCard,
  ClipboardPaste,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  PartyPopper,
  HelpCircle,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { useLojaProntidao, EtapaProntidao, TipoAcaoProntidao } from '../../hooks/useLojaProntidao';
import { salvarGeminiApiKey } from '../../services/geminiService';
import { salvarSerpApiKey } from '../../services/serpApiService';
import { ModalComoObterGeminiApiKey } from './ModalComoObterGeminiApiKey';
import { ModalOnboardingSerpApi } from '../ModalOnboardingSerpApi';

export interface ModalChecklistConfiguracaoProps {
  isOpen: boolean;
  onClose: () => void;
  onNavegar?: (tipo: TipoAcaoProntidao | string) => void;
  onAbrirRubi?: () => void;
}

export const ModalChecklistConfiguracao: React.FC<ModalChecklistConfiguracaoProps> = ({
  isOpen,
  onClose,
  onNavegar,
  onAbrirRubi,
}) => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { loja, recarregarDadosLoja } = useAuth();
  const {
    etapas,
    totalConcluidas,
    percentual,
    tudoPronto,
    etapaFoco,
    rubiDestravada,
    carregando,
    recarregar,
  } = useLojaProntidao();

  // Controle de Overlay e Tecla ESC
  useRegisterOverlay(isOpen, onClose, 'modal-checklist-configuracao', 'modal');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Estados locais do Wizard
  const [etapaSelecionadaId, setEtapaSelecionadaId] = useState<string | null>(null);
  const [modalGeminiAberto, setModalGeminiAberto] = useState<boolean>(false);
  const [modalSerperAberto, setModalSerperAberto] = useState<boolean>(false);
  const [chaveGeminiInput, setChaveGeminiInput] = useState<string>('');
  const [salvandoGemini, setSalvandoGemini] = useState<boolean>(false);
  const [chaveSerperInput, setChaveSerperInput] = useState<string>('');
  const [salvandoSerper, setSalvandoSerper] = useState<boolean>(false);
  const [comemoracaoRubiAtiva, setComemoracaoRubiAtiva] = useState<boolean>(false);
  const [listaAberta, setListaAberta] = useState<boolean>(true);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  // Sincroniza a etapa em foco automática quando o usuário abre o modal ou as etapas mudam
  useEffect(() => {
    if (isOpen) {
      if (etapaFoco) {
        setEtapaSelecionadaId(etapaFoco.id);
      } else if (etapas.length > 0 && !etapaSelecionadaId) {
        setEtapaSelecionadaId(etapas[0].id);
      }
    }
  }, [isOpen, etapaFoco]);

  if (!isOpen) return null;

  const etapaAtiva = etapas.find((e) => e.id === etapaSelecionadaId) || etapaFoco || etapas[0];

  // Helper de ícone por tipo de etapa
  const renderIconeEtapa = (tipoAcao: TipoAcaoProntidao, className = 'w-5 h-5') => {
    switch (tipoAcao) {
      case 'chave_gemini':
        return <Bot className={className} />;
      case 'chave_serper':
        return <Key className={className} />;
      case 'perfil_loja':
        return <Store className={className} />;
      case 'categorias':
        return <FolderTree className={className} />;
      case 'produtos':
        return <Package className={className} />;
      case 'entrega_pagamentos':
        return <Truck className={className} />;
      default:
        return <Sparkles className={className} />;
    }
  };

  // Manipuladores da Etapa 1 (Gemini)
  const handleColarChaveGemini = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const texto = await navigator.clipboard.readText();
        if (texto && texto.trim()) {
          setChaveGeminiInput(texto.trim());
          setMensagemErro(null);
        }
      }
    } catch {
      setMensagemErro('Não foi possível ler a área de transferência. Cole manualmente com Ctrl+V.');
    }
  };

  const handleSalvarChaveGemini = async (chaveDireta?: string) => {
    const chaveParaSalvar = (chaveDireta || chaveGeminiInput).trim();
    if (!chaveParaSalvar) {
      setMensagemErro('Por favor, informe a Chave de API do Google Gemini.');
      return;
    }

    try {
      setSalvandoGemini(true);
      setMensagemErro(null);
      await salvarGeminiApiKey(chaveParaSalvar, loja?.id, loja);
      if (recarregarDadosLoja) {
        await recarregarDadosLoja();
      }
      await recarregar();
      setChaveGeminiInput('');
      setComemoracaoRubiAtiva(true);
      setMensagemSucesso('Chave do Gemini ativada com sucesso!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar chave do Gemini.';
      setMensagemErro(msg);
    } finally {
      setSalvandoGemini(false);
    }
  };

  // Manipuladores da Etapa 2 (Serper.dev)
  const handleColarChaveSerper = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const texto = await navigator.clipboard.readText();
        if (texto && texto.trim()) {
          setChaveSerperInput(texto.trim());
          setMensagemErro(null);
        }
      }
    } catch {
      setMensagemErro('Não foi possível ler a área de transferência. Cole manualmente com Ctrl+V.');
    }
  };

  const handleSalvarChaveSerper = async (chaveDireta?: string) => {
    const chaveParaSalvar = (chaveDireta || chaveSerperInput).trim();
    if (!chaveParaSalvar) {
      setMensagemErro('Por favor, informe a Chave de API do Serper.dev.');
      return;
    }

    try {
      setSalvandoSerper(true);
      setMensagemErro(null);
      await salvarSerpApiKey(chaveParaSalvar, loja?.id, loja);
      if (recarregarDadosLoja) {
        await recarregarDadosLoja();
      }
      await recarregar();
      setChaveSerperInput('');
      setMensagemSucesso('Chave do Serper.dev ativada! Busca de fotos habilitada.');
      // Seleciona a próxima etapa pendente
      const proxima = etapas.find((e) => e.ordem > 2 && !e.concluido);
      if (proxima) {
        setEtapaSelecionadaId(proxima.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar chave do Serper.dev.';
      setMensagemErro(msg);
    } finally {
      setSalvandoSerper(false);
    }
  };

  // Navegação para etapas 3 a 6
  const executarNavegacaoEtapa = (etapa: EtapaProntidao) => {
    if (onNavegar) {
      onNavegar(etapa.tipoAcao);
      onClose();
      return;
    }

    switch (etapa.tipoAcao) {
      case 'perfil_loja':
        navigate('/config');
        break;
      case 'categorias':
        navigate('/auxiliares');
        break;
      case 'produtos':
        navigate('/products/create');
        break;
      case 'entrega_pagamentos':
        navigate('/config/frete');
        break;
      default:
        break;
    }
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          className={`relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl shadow-2xl border overflow-hidden ${
            isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}
          role="dialog"
          aria-modal="true"
        >
          {/* CABEÇALHO */}
          <div
            className={`p-5 sm:p-6 border-b shrink-0 ${
              isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-slate-50/70'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
                    <span>Checklist de Configuração da Loja</span>
                    {tudoPronto && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold">
                        100% Pronta
                      </span>
                    )}
                  </h2>
                  <p className={`text-xs sm:text-sm mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Complete os passos abaixo para que sua loja funcione com 100% de automação e inteligência.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
                  isDark
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
                title="Fechar (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* TERMÔMETRO DE PRONTIDÃO */}
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  Progresso de Implantação
                </span>
                <span className="text-emerald-500 font-black">
                  {totalConcluidas} de 6 passos concluídos ({percentual}%)
                </span>
              </div>
              <div
                className={`w-full h-3 rounded-full overflow-hidden ${
                  isDark ? 'bg-slate-800' : 'bg-slate-200'
                }`}
              >
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${percentual}%` }}
                />
              </div>
            </div>
          </div>

          {/* MENSAGENS DE ALERTA RÁPIDO */}
          {mensagemSucesso && (
            <div className="mx-5 sm:mx-6 mt-4 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-3 text-xs text-emerald-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{mensagemSucesso}</span>
              </div>
              <button
                type="button"
                onClick={() => setMensagemSucesso(null)}
                className="text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {mensagemErro && (
            <div className="mx-5 sm:mx-6 mt-4 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between gap-3 text-xs text-rose-400">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{mensagemErro}</span>
              </div>
              <button
                type="button"
                onClick={() => setMensagemErro(null)}
                className="text-rose-400 hover:text-rose-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* CORPO DO WIZARD (Scrollável) */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
            {/* CARD COMEMORATIVO DA RUBI IA APÓS ATIVAÇÃO DA ETAPA 1 */}
            {comemoracaoRubiAtiva && (
              <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-indigo-500/10 border-2 border-emerald-500/30 text-left animate-in zoom-in-95 duration-300">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/30 font-black">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div className="space-y-2 flex-1">
                    <h3 className="text-base font-black text-emerald-400 flex items-center gap-2">
                      <span>🎉 Inteligência Artificial ativada com sucesso!</span>
                    </h3>
                    <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      Olá, eu sou a <strong>Rubi IA</strong>! Agora que meu motor está ligado, vou te acompanhar e
                      ajudar a preencher todas as outras etapas da loja com sugestões inteligentes, fotos e textos
                      automáticos.
                    </p>
                    <div className="pt-2 flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setComemoracaoRubiAtiva(false);
                          setEtapaSelecionadaId('etapa-2-serper');
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-md shadow-emerald-500/20"
                      >
                        <span>Continuar para Passo 2: Ativar Fotos</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      {onAbrirRubi && (
                        <button
                          type="button"
                          onClick={() => {
                            setComemoracaoRubiAtiva(false);
                            onClose();
                            onAbrirRubi();
                          }}
                          className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                            isDark
                              ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                              : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Conversar com a Rubi Agora</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SE TODAS AS ETAPAS ESTÃO CONCLUÍDAS */}
            {tudoPronto && !comemoracaoRubiAtiva && (
              <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-indigo-500/10 border-2 border-emerald-500/30 text-center space-y-4 animate-in zoom-in-95">
                <div className="w-14 h-14 mx-auto rounded-3xl bg-emerald-500 text-slate-950 flex items-center justify-center shadow-xl shadow-emerald-500/30">
                  <PartyPopper className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-emerald-400">
                    Sua Loja está 100% Configurada e Pronta!
                  </h3>
                  <p className={`text-xs sm:text-sm max-w-md mx-auto ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Todos os 6 pilares de inteligência, catálogo, estoque e pagamentos estão operando em harmonia.
                  </p>
                </div>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate('/pos');
                    }}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-500/20"
                  >
                    <Store className="w-4 h-4" />
                    <span>Ir para o PDV (Frente de Caixa)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate('/dashboard');
                    }}
                    className={`px-5 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                      isDark
                        ? 'border-slate-700 hover:bg-slate-800 text-slate-200'
                        : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <span>Ver Painel Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* CARD DE AÇÃO GUIADA (O PRÓXIMO PASSO EM FOCO) */}
            {etapaAtiva && !tudoPronto && (
              <div
                className={`p-5 sm:p-6 rounded-3xl border-2 transition-all ${
                  etapaAtiva.concluido
                    ? isDark
                      ? 'bg-slate-900/40 border-slate-800'
                      : 'bg-slate-50 border-slate-200'
                    : 'bg-gradient-to-br from-emerald-500/5 via-teal-500/5 to-transparent border-emerald-500/40 shadow-xl shadow-emerald-500/5'
                }`}
              >
                {/* Header da Ação */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                        etapaAtiva.concluido
                          ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                          : 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                      }`}
                    >
                      {etapaAtiva.concluido ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        renderIconeEtapa(etapaAtiva.tipoAcao, 'w-5 h-5')
                      )}
                    </div>
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-wider text-emerald-500">
                        Etapa {etapaAtiva.ordem} de 6 {etapaAtiva.concluido ? '✓ Concluída' : '• Ação Necessária'}
                      </span>
                      <h3 className="text-base sm:text-lg font-black tracking-tight">{etapaAtiva.titulo}</h3>
                    </div>
                  </div>

                  {rubiDestravada && etapaAtiva.ordem > 1 && (
                    <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold">
                      <Bot className="w-3.5 h-3.5" />
                      <span>Rubi IA Ativa</span>
                    </div>
                  )}
                </div>

                <p className={`text-xs sm:text-sm mt-2 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {etapaAtiva.descricao}
                </p>

                {/* CORPO ESPECÍFICO POR ETAPA */}
                <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/80">
                  {/* ETAPA 1: GEMINI */}
                  {etapaAtiva.tipoAcao === 'chave_gemini' && (
                    <div className="space-y-4">
                      {etapaAtiva.concluido ? (
                        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 text-xs font-bold text-emerald-400">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>Chave de Inteligência Artificial configurada e operando!</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setModalGeminiAberto(true)}
                            className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                          >
                            Redefinir
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed space-y-1">
                            <p className="font-semibold text-slate-900 dark:text-slate-200">
                              Para a Rubi IA poder te ajudar a escrever textos, sugerir categorias e analisar suas
                              vendas, precisamos ativar a chave gratuita do Google.
                            </p>
                            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                              ✨ Não exige cartão de crédito e a cota do Google é 100% gratuita.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                              Você já possui uma Chave de API do Gemini?
                            </label>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {/* OPÇÃO A: NÃO TENHO, VAMOS CRIAR JUNTOS */}
                              <button
                                type="button"
                                onClick={() => setModalGeminiAberto(true)}
                                className="p-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-emerald-500/20 text-center"
                              >
                                <ExternalLink className="w-4 h-4 shrink-0" />
                                <span>Não tenho, vamos criar juntos -&gt;</span>
                              </button>

                              {/* OPÇÃO B: ATALHO DE COLAR */}
                              <button
                                type="button"
                                onClick={handleColarChaveGemini}
                                className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                                  isDark
                                    ? 'border-slate-700 hover:bg-slate-800 text-slate-200'
                                    : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                                }`}
                              >
                                <ClipboardPaste className="w-4 h-4 text-emerald-500" />
                                <span>Colar da Área de Transferência</span>
                              </button>
                            </div>
                          </div>

                          {/* CAMPO DE ENTRADA MANUAL */}
                          <div className="space-y-2 pt-2">
                            <div className="relative flex items-center">
                              <Key className="w-4 h-4 text-slate-400 absolute left-3.5" />
                              <input
                                type="password"
                                value={chaveGeminiInput}
                                onChange={(e) => setChaveGeminiInput(e.target.value)}
                                placeholder="Ou digite/cole sua chave AIzaSy..."
                                className={`w-full pl-10 pr-28 py-2.5 rounded-xl border text-xs font-mono transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                                  isDark
                                    ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600'
                                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                                }`}
                              />
                              <button
                                type="button"
                                disabled={!chaveGeminiInput.trim() || salvandoGemini}
                                onClick={() => handleSalvarChaveGemini()}
                                className="absolute right-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-xs flex items-center gap-1.5 transition cursor-pointer"
                              >
                                {salvandoGemini ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                                <span>Salvar</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ETAPA 2: SERPER.DEV */}
                  {etapaAtiva.tipoAcao === 'chave_serper' && (
                    <div className="space-y-4">
                      {etapaAtiva.concluido ? (
                        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 text-xs font-bold text-emerald-400">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>Busca de fotos Serper.dev ativa (cota gratuita de 2.500 pesquisas).</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setModalSerperAberto(true)}
                            className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                          >
                            Redefinir
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed space-y-1">
                            <p className="font-semibold text-slate-900 dark:text-slate-200">
                              O Serper.dev é o provedor que busca fotos de boa qualidade diretamente no Google Imagens
                              para o seu catálogo.
                            </p>
                            <p className="text-[11px] text-teal-600 dark:text-teal-400 font-bold">
                              📸 Você recebe 2.500 buscas gratuitas ao cadastrar com sua conta Google em 1 clique.
                            </p>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <a
                              href="https://serper.dev/signup"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-3 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-teal-500/20 text-center"
                            >
                              <ExternalLink className="w-4 h-4 shrink-0" />
                              <span>Criar Conta Serper.dev (Grátis)</span>
                            </a>

                            <button
                              type="button"
                              onClick={() => setModalSerperAberto(true)}
                              className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                                isDark
                                  ? 'border-slate-700 hover:bg-slate-800 text-slate-200'
                                  : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                              }`}
                            >
                              <HelpCircle className="w-4 h-4 text-teal-500" />
                              <span>Ver Guia Passo a Passo</span>
                            </button>
                          </div>

                          {/* CAMPO DE ENTRADA MANUAL SERPER */}
                          <div className="space-y-2 pt-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-700 dark:text-slate-300">
                                Cole a API Key do Serper.dev:
                              </span>
                              <button
                                type="button"
                                onClick={handleColarChaveSerper}
                                className="text-[11px] font-bold text-teal-500 hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <ClipboardPaste className="w-3 h-3" />
                                <span>Colar</span>
                              </button>
                            </div>
                            <div className="relative flex items-center">
                              <Key className="w-4 h-4 text-slate-400 absolute left-3.5" />
                              <input
                                type="password"
                                value={chaveSerperInput}
                                onChange={(e) => setChaveSerperInput(e.target.value)}
                                placeholder="Cole sua chave aqui..."
                                className={`w-full pl-10 pr-28 py-2.5 rounded-xl border text-xs font-mono transition focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                                  isDark
                                    ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600'
                                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                                }`}
                              />
                              <button
                                type="button"
                                disabled={!chaveSerperInput.trim() || salvandoSerper}
                                onClick={() => handleSalvarChaveSerper()}
                                className="absolute right-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-xs flex items-center gap-1.5 transition cursor-pointer"
                              >
                                {salvandoSerper ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                                <span>Salvar</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ETAPA 3: PERFIL DA LOJA */}
                  {etapaAtiva.tipoAcao === 'perfil_loja' && (
                    <div className="space-y-4">
                      {rubiDestravada && (
                        <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-2.5 text-xs text-indigo-400">
                          <Bot className="w-4 h-4 shrink-0" />
                          <span>
                            A Rubi IA pode sugerir a apresentação da empresa e formatar seus dados automaticamente!
                          </span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => executarNavegacaoEtapa(etapaAtiva)}
                          className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-md shadow-emerald-500/20"
                        >
                          <Store className="w-4 h-4" />
                          <span>Configurar Perfil &amp; WhatsApp Agora -&gt;</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ETAPA 4: CATEGORIAS */}
                  {etapaAtiva.tipoAcao === 'categorias' && (
                    <div className="space-y-4">
                      {rubiDestravada && (
                        <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-2.5 text-xs text-indigo-400">
                          <Bot className="w-4 h-4 shrink-0" />
                          <span>
                            Dica da Rubi: Você pode criar categorias completas do seu segmento em poucos cliques!
                          </span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => executarNavegacaoEtapa(etapaAtiva)}
                          className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-md shadow-emerald-500/20"
                        >
                          <FolderTree className="w-4 h-4" />
                          <span>Cadastrar Categorias -&gt;</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ETAPA 5: PRODUTOS */}
                  {etapaAtiva.tipoAcao === 'produtos' && (
                    <div className="space-y-4">
                      {rubiDestravada && (
                        <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-2.5 text-xs text-indigo-400">
                          <Bot className="w-4 h-4 shrink-0" />
                          <span>
                            Com o Serper.dev e Gemini ativos, a Rubi IA busca fotos e sugere a descrição do item em 1
                            clique!
                          </span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => executarNavegacaoEtapa(etapaAtiva)}
                          className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-md shadow-emerald-500/20"
                        >
                          <Package className="w-4 h-4" />
                          <span>Cadastrar Primeiro Produto / Serviço -&gt;</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ETAPA 6: ENTREGA & MEIOS DE PAGAMENTO */}
                  {etapaAtiva.tipoAcao === 'entrega_pagamentos' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavegar) onNavegar('entrega');
                            else navigate('/config/frete');
                            onClose();
                          }}
                          className="p-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-emerald-500/20"
                        >
                          <Truck className="w-4 h-4" />
                          <span>Configurar Entrega / Retirada -&gt;</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (onNavegar) onNavegar('pagamentos');
                            else navigate('/auxiliares');
                            onClose();
                          }}
                          className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                            isDark
                              ? 'border-slate-700 hover:bg-slate-800 text-slate-200'
                              : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <CreditCard className="w-4 h-4 text-emerald-500" />
                          <span>Configurar Meios de Pagamento (Pix) -&gt;</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* LISTA RESUMIDA RETRÁTIL DOS 6 PASSOS */}
            <div
              className={`rounded-3xl border overflow-hidden transition-all ${
                isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50/80 border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setListaAberta(!listaAberta)}
                className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-black tracking-wide uppercase text-slate-400">
                    Todos os 6 Passos de Configuração
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold">
                    {totalConcluidas}/6
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>{listaAberta ? 'Ocultar' : 'Expandir'}</span>
                  {listaAberta ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {listaAberta && (
                <div className="divide-y divide-slate-200 dark:divide-slate-800/60 border-t border-slate-200 dark:border-slate-800">
                  {etapas.map((etapa) => {
                    const isSelecionada = etapa.id === etapaAtiva?.id;

                    return (
                      <div
                        key={etapa.id}
                        onClick={() => setEtapaSelecionadaId(etapa.id)}
                        className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer transition ${
                          isSelecionada
                            ? isDark
                              ? 'bg-slate-800/70'
                              : 'bg-emerald-500/10'
                            : isDark
                            ? 'hover:bg-slate-800/30'
                            : 'hover:bg-slate-100/50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs font-black ${
                              etapa.concluido
                                ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                            }`}
                          >
                            {etapa.concluido ? <Check className="w-4 h-4 stroke-[3]" /> : etapa.ordem}
                          </div>
                          <div className="min-w-0">
                            <h4
                              className={`text-xs sm:text-sm font-bold truncate ${
                                etapa.concluido
                                  ? 'text-emerald-500'
                                  : isDark
                                  ? 'text-slate-200'
                                  : 'text-slate-800'
                              }`}
                            >
                              {etapa.titulo}
                            </h4>
                            <p
                              className={`text-[11px] truncate ${
                                isDark ? 'text-slate-400' : 'text-slate-500'
                              }`}
                            >
                              {etapa.descricao}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          {etapa.concluido ? (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              Concluído
                            </span>
                          ) : (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              Pendente
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RODAPÉ DO MODAL */}
          <div
            className={`p-4 sm:p-5 border-t shrink-0 flex items-center justify-between gap-3 ${
              isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-slate-50/70'
            }`}
          >
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline">Passos essenciais para destravar 100% dos recursos do HUBI</span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                }`}
              >
                {tudoPronto ? 'Fechar' : 'Configurar Depois'}
              </button>

              {!tudoPronto && etapaAtiva && !etapaAtiva.concluido && (
                <button
                  type="button"
                  onClick={() => {
                    if (etapaAtiva.tipoAcao === 'chave_gemini') {
                      setModalGeminiAberto(true);
                    } else if (etapaAtiva.tipoAcao === 'chave_serper') {
                      setModalSerperAberto(true);
                    } else {
                      executarNavegacaoEtapa(etapaAtiva);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-500/20"
                >
                  <span>Executar Etapa {etapaAtiva.ordem} Agora</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SUB-MODAIS EDUCATIVOS */}
      <ModalComoObterGeminiApiKey
        isOpen={modalGeminiAberto}
        onClose={() => setModalGeminiAberto(false)}
        onPreencherChave={async (chave) => {
          setModalGeminiAberto(false);
          await handleSalvarChaveGemini(chave);
        }}
      />

      <ModalOnboardingSerpApi
        isOpen={modalSerperAberto}
        onClose={() => setModalSerperAberto(false)}
        loja={loja}
        onChaveSalvaComSucesso={async (chave) => {
          setModalSerperAberto(false);
          await handleSalvarChaveSerper(chave);
        }}
      />
    </>
  );
};
