import React, { useEffect, useState, useCallback } from 'react';
import {
  Bot,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  Phone
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { CardCarteiraWhatsapp } from './CardCarteiraWhatsapp';
import {
  carregarConfiguracoesWhatsApp,
  salvarConexaoMetaLoja,
  testarConexaoMetaComFallbackGlobal
} from '../../services/whatsappIaService';
import { notificarConfiguracaoSalvaParaOnboarding } from '../../services/onboardingSetupService';

export interface ConfiguracoesWhatsAppIAProps {
  lojaId?: string;
  onVoltar?: () => void;
  saveRef?: React.MutableRefObject<{ salvar: () => Promise<void> } | null>;
  onSalvandoChange?: (salvando: boolean) => void;
}

export const ConfiguracoesWhatsAppIA: React.FC<ConfiguracoesWhatsAppIAProps> = ({
  lojaId: lojaIdProp,
  onVoltar,
  saveRef,
  onSalvandoChange,
}) => {
  const { isDark } = useTheme();
  const { loja, usuario, recarregarDadosLoja } = useAuth();
  const { mostrarSucesso, mostrarErro } = useFeedbackModal();

  const lojaIdEfetivo = lojaIdProp || loja?.id || '';

  // Accordion da Conexão Própria Meta Cloud API (Atendimento Receptivo Rubi IA)
  const [acordeaoMetaAberto, setAcordeaoMetaAberto] = useState<boolean>(false);
  const [carregandoMeta, setCarregandoMeta] = useState<boolean>(false);
  const [whatsappIaReceptivaAtiva, setWhatsappIaReceptivaAtiva] = useState<boolean>(false);
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState<string>('');
  const [metaWabaId, setMetaWabaId] = useState<string>('');
  const [metaAccessToken, setMetaAccessToken] = useState<string>('');
  const [mostrarTokenMeta, setMostrarTokenMeta] = useState<boolean>(false);
  const [testandoMeta, setTestandoMeta] = useState<boolean>(false);
  const [resultadoTesteMeta, setResultadoTesteMeta] = useState<{
    sucesso: boolean;
    mensagem: string;
  } | null>(null);

  useEffect(() => {
    if (!lojaIdEfetivo) return;

    let ativo = true;
    const carregarDadosMeta = async () => {
      try {
        setCarregandoMeta(true);
        const config = await carregarConfiguracoesWhatsApp(lojaIdEfetivo);
        if (!ativo) return;

        if (config) {
          setWhatsappIaReceptivaAtiva(Boolean(config.whatsapp_ia_receptiva_ativa));
          setMetaPhoneNumberId(config.meta_phone_number_id || '');
          setMetaWabaId(config.meta_waba_id || '');
          setMetaAccessToken(config.meta_access_token || '');
        } else if (loja) {
          setWhatsappIaReceptivaAtiva(Boolean(loja.whatsapp_ia_receptiva_ativa));
          setMetaPhoneNumberId(loja.meta_phone_number_id || '');
          setMetaWabaId(loja.meta_waba_id || '');
          setMetaAccessToken(loja.meta_access_token || '');
        }
      } catch (err) {
        console.warn('[ConfiguracoesWhatsAppIA] Erro ao carregar conexão Meta:', err);
      } finally {
        if (ativo) setCarregandoMeta(false);
      }
    };

    carregarDadosMeta();
    return () => {
      ativo = false;
    };
  }, [lojaIdEfetivo]);

  const handleTestarConexaoMeta = async () => {
    try {
      setTestandoMeta(true);
      setResultadoTesteMeta(null);
      const res = await testarConexaoMetaComFallbackGlobal(metaPhoneNumberId, metaAccessToken);
      setResultadoTesteMeta(res);
    } catch (err: any) {
      setResultadoTesteMeta({
        sucesso: false,
        mensagem: err?.message || 'Erro ao validar a conexão com a Meta Graph API.',
      });
    } finally {
      setTestandoMeta(false);
    }
  };

  const handleSalvarConexaoMeta = useCallback(async () => {
    if (!lojaIdEfetivo) return;

    try {
      onSalvandoChange?.(true);
      const res = await salvarConexaoMetaLoja(lojaIdEfetivo, {
        whatsapp_ia_receptiva_ativa: whatsappIaReceptivaAtiva,
        meta_phone_number_id: metaPhoneNumberId,
        meta_waba_id: metaWabaId,
        meta_access_token: metaAccessToken,
      });

      if (!res.sucesso) {
        throw new Error(res.erro || 'Não foi possível salvar a conexão Meta da loja.');
      }

      await recarregarDadosLoja?.();
      mostrarSucesso(
        'As configurações da Conexão Própria Meta Cloud API foram salvas com sucesso.',
        'Configurações Salvas'
      );
      notificarConfiguracaoSalvaParaOnboarding('whatsapp_auto');
    } catch (err: any) {
      mostrarErro(
        err?.message || 'Erro ao salvar as configurações Meta Cloud API.',
        'Falha ao Salvar'
      );
    } finally {
      onSalvandoChange?.(false);
    }
  }, [
    lojaIdEfetivo,
    whatsappIaReceptivaAtiva,
    metaPhoneNumberId,
    metaWabaId,
    metaAccessToken,
    onSalvandoChange,
    recarregarDadosLoja,
    mostrarSucesso,
    mostrarErro,
  ]);

  useEffect(() => {
    if (saveRef) {
      saveRef.current = {
        salvar: handleSalvarConexaoMeta,
      };
    }
  }, [saveRef, handleSalvarConexaoMeta]);

  useEffect(() => {
    onSalvandoChange?.(false);
  }, [onSalvandoChange]);

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Cabeçalho da Aba */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          {onVoltar && (
            <button
              onClick={onVoltar}
              className={`p-2 rounded-xl transition-all ${
                isDark
                  ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }`}
              title="Voltar ao menu"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Atendimento WhatsApp com IA</h1>
            <p className={`text-xs md:text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Carteira Pré-Paga e Motor Híbrido de Notificações Inteligentes
            </p>
          </div>
        </div>
      </div>

      {/* CARTEIRA PRÉ-PAGA (WALLET) & MOTOR HÍBRIDO DE NOTIFICAÇÕES WHATSAPP */}
      {loja && (
        <CardCarteiraWhatsapp
          loja={loja}
          usuarioId={usuario?.id || null}
          aoAtualizarLoja={() => {
            recarregarDadosLoja?.();
          }}
        />
      )}

      {/* ACCORDION: CONEXÃO PRÓPRIA META CLOUD API (ATENDIMENTO RECEPTIVO RUBI IA) */}
      {loja && (
        <div
          className={`rounded-2xl border-2 overflow-hidden transition-colors shadow-xs ${
            isDark
              ? 'bg-black border-slate-700 text-white'
              : 'bg-white border-slate-300 text-slate-900'
          }`}
        >
          <button
            type="button"
            onClick={() => setAcordeaoMetaAberto((prev) => !prev)}
            className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left transition cursor-pointer ${
              isDark ? 'hover:bg-zinc-950' : 'hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm sm:text-base font-black leading-tight text-slate-900 dark:text-white">
                    Conexão Própria Meta Cloud API (Atendimento Receptivo Rubi IA)
                  </h3>
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                      whatsappIaReceptivaAtiva
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-200 dark:bg-zinc-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {whatsappIaReceptivaAtiva ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-0.5">
                  Configure seu número oficial na Meta para recepcionar clientes com o Rubi IA ou rotear filiais.
                </p>
              </div>
            </div>

            <div className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
              {acordeaoMetaAberto ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </button>

          {acordeaoMetaAberto && (
            <div className="p-4 sm:p-5 pt-0 sm:pt-0 border-t-2 border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in">
              {carregandoMeta ? (
                <div className="py-4 flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                  <span>Carregando configurações Meta da loja...</span>
                </div>
              ) : (
                <>
                  {/* Toggle Atendimento Receptivo */}
                  <div className="mt-4 flex items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border-2 border-slate-300 dark:border-slate-700">
                    <div className="space-y-0.5">
                      <span className="text-sm font-black text-slate-900 dark:text-white block">
                        Ativar Atendimento Receptivo com Rubi IA neste número
                      </span>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400 block">
                        Quando ativado, mensagens recebidas neste Phone Number ID serão respondidas automaticamente pelo Rubi IA.
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={whatsappIaReceptivaAtiva}
                        onChange={(e) => setWhatsappIaReceptivaAtiva(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  {/* Campos Phone Number ID e WABA ID */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                        Phone Number ID
                      </label>
                      <input
                        type="text"
                        value={metaPhoneNumberId}
                        onChange={(e) => {
                          setMetaPhoneNumberId(e.target.value);
                          if (resultadoTesteMeta) setResultadoTesteMeta(null);
                        }}
                        placeholder="Ex: 109283746510293"
                        className="w-full bg-slate-50 dark:bg-zinc-950 border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-hidden focus:border-emerald-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                        WABA ID
                      </label>
                      <input
                        type="text"
                        value={metaWabaId}
                        onChange={(e) => setMetaWabaId(e.target.value)}
                        placeholder="Ex: 405968712345678"
                        className="w-full bg-slate-50 dark:bg-zinc-950 border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-hidden focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Token Permanente Meta + Botão Testar Conexão Meta */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                      Token Permanente Meta
                    </label>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type={mostrarTokenMeta ? 'text' : 'password'}
                          value={metaAccessToken}
                          onChange={(e) => {
                            setMetaAccessToken(e.target.value);
                            if (resultadoTesteMeta) setResultadoTesteMeta(null);
                          }}
                          placeholder="EAA..."
                          className="w-full bg-slate-50 dark:bg-zinc-950 border-2 border-slate-300 dark:border-slate-700 rounded-xl pl-3.5 pr-10 py-2.5 text-xs sm:text-sm font-mono font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-hidden focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => setMostrarTokenMeta((prev) => !prev)}
                          title={mostrarTokenMeta ? 'Ocultar token' : 'Mostrar token'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                        >
                          {mostrarTokenMeta ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleTestarConexaoMeta}
                        disabled={testandoMeta || !metaPhoneNumberId.trim()}
                        className="px-4 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {testandoMeta ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                            <span>Testando...</span>
                          </>
                        ) : (
                          <>
                            <Shield className="w-4 h-4 text-emerald-500" />
                            <span>Testar Conexão Meta</span>
                          </>
                        )}
                      </button>
                    </div>

                    {resultadoTesteMeta && (
                      <div
                        className={`mt-2 p-3 rounded-xl border-2 text-xs font-bold flex items-center gap-2 ${
                          resultadoTesteMeta.sucesso
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500/50 text-emerald-900 dark:text-emerald-200'
                            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-500/50 text-rose-900 dark:text-rose-200'
                        }`}
                      >
                        {resultadoTesteMeta.sucesso ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        )}
                        <span>{resultadoTesteMeta.mensagem}</span>
                      </div>
                    )}
                  </div>

                  {/* Nota explicativa multi-filial */}
                  <div className="p-3.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border-2 border-sky-500/40 text-sky-950 dark:text-sky-200 text-xs font-semibold flex items-start gap-2.5 leading-relaxed">
                    <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                    <span>
                      Se você possui mais de uma loja/filial, informe o mesmo Phone Number ID nas filiais para que o Rubi IA identifique automaticamente o cliente ou ofereça a escolha da unidade.
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
