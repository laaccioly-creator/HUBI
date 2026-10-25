import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Key,
  Shield,
  Save,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Phone,
  ArrowLeft,
  Eye,
  EyeOff,
  Sliders,
  MessageSquare,
  HelpCircle,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import {
  carregarConfiguracoesWhatsApp,
  salvarConfiguracoesWhatsApp,
  carregarConsumoMesAtual,
  testarConexaoGemini,
  testarConexaoMeta
} from '../../services/whatsappIaService';
import { ConsumoWhatsApp, WhatsAppConfigForm } from '../../types/whatsapp';
import { CardCarteiraWhatsapp } from './CardCarteiraWhatsapp';

export interface ConfiguracoesWhatsAppIAProps {
  lojaId?: string;
  onVoltar?: () => void;
  saveRef?: React.MutableRefObject<{ salvar: () => Promise<void> } | null>;
  onSalvandoChange?: (salvando: boolean) => void;
}

export const ConfiguracoesWhatsAppIA: React.FC<ConfiguracoesWhatsAppIAProps> = ({
  lojaId: propLojaId,
  onVoltar,
  saveRef,
  onSalvandoChange
}) => {
  const { isDark } = useTheme();
  const { loja, usuario, recarregarDadosLoja } = useAuth();
  const permissions = usePermissions();
  const { mostrarSucesso, mostrarErro } = useFeedbackModal();

  const idLojaAlvo = propLojaId || loja?.id;

  // Permissão de edição restrita a gestores
  const podeEditar =
    permissions.ehOwner ||
    permissions.ehAdmin ||
    permissions.ehGerente ||
    permissions.podeAcessarConfig;

  // Estados principais
  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mostrarGeminiKey, setMostrarGeminiKey] = useState<boolean>(false);
  const [mostrarMetaToken, setMostrarMetaToken] = useState<boolean>(false);
  const [copiadoUrl, setCopiadoUrl] = useState<boolean>(false);
  const [copiadoToken, setCopiadoToken] = useState<boolean>(false);

  // Estados de testes de conexão
  const [testandoGemini, setTestandoGemini] = useState<boolean>(false);
  const [statusGemini, setStatusGemini] = useState<{ sucesso: boolean; mensagem: string } | null>(null);

  const [testandoMeta, setTestandoMeta] = useState<boolean>(false);
  const [statusMeta, setStatusMeta] = useState<{ sucesso: boolean; mensagem: string } | null>(null);

  // Consumo do mês
  const [consumo, setConsumo] = useState<ConsumoWhatsApp | null>(null);

  // Formulário de configurações
  const [form, setForm] = useState<WhatsAppConfigForm>({
    ia_whatsapp_ativa: true,
    pausar_ao_atingir_limite: true,
    limite_mensal_alerta: 1000,
    gemini_api_key: '',
    meta_waba_id: '',
    meta_phone_number_id: '',
    meta_access_token: '',
    meta_verify_token: 'hubi_whatsapp_webhook_token',
    prompt_personalizado: '',
    mensagem_pausa_humano: 'Nosso atendimento por inteligência artificial está temporariamente pausado. Um atendente da nossa equipe continuará seu atendimento por aqui em breve!'
  });

  // URL do Webhook dinamicamente montada com o host do Supabase em execução
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://eylpiwynsbnmcacmwiqg.supabase.co';
  const webhookCallbackUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/whatsapp-webhook`;
  const tokenVerifyExibicao = form.meta_verify_token || 'hubi_whatsapp_webhook_token';

  // Carregar dados da loja e consumo
  const carregarDados = async () => {
    if (!idLojaAlvo) return;
    try {
      setCarregando(true);
      const [configData, consumoData] = await Promise.all([
        carregarConfiguracoesWhatsApp(idLojaAlvo),
        carregarConsumoMesAtual(idLojaAlvo)
      ]);

      if (configData) {
        setForm({
          ia_whatsapp_ativa: configData.ia_whatsapp_ativa !== false,
          pausar_ao_atingir_limite: configData.pausar_ao_atingir_limite === true,
          limite_mensal_alerta: configData.limite_mensal_alerta || 1000,
          gemini_api_key: configData.gemini_api_key || '',
          meta_waba_id: configData.meta_waba_id || '',
          meta_phone_number_id: configData.meta_phone_number_id || '',
          meta_access_token: configData.meta_access_token || '',
          meta_verify_token: configData.meta_verify_token || 'hubi_whatsapp_webhook_token',
          prompt_personalizado: configData.prompt_personalizado || '',
          mensagem_pausa_humano: configData.mensagem_pausa_humano || 'Nosso atendimento por inteligência artificial está temporariamente pausado. Um atendente da nossa equipe continuará seu atendimento por aqui em breve!'
        });
      }

      setConsumo(consumoData);
    } catch (err: any) {
      console.warn('Erro ao carregar configurações de WhatsApp:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [idLojaAlvo]);

  // Handler oficial para salvar alterações
  const handleSalvar = useCallback(async () => {
    if (!idLojaAlvo) {
      mostrarErro('Erro ao salvar', 'Identificador da loja ausente.');
      return;
    }

    try {
      setSalvando(true);
      if (onSalvandoChange) onSalvandoChange(true);

      const formSanitizado: WhatsAppConfigForm = {
        ...form,
        meta_phone_number_id: (form.meta_phone_number_id || '').trim(),
        meta_waba_id: (form.meta_waba_id || '').trim(),
        meta_access_token: (form.meta_access_token || '').trim(),
        gemini_api_key: (form.gemini_api_key || '').trim(),
        prompt_personalizado: (form.prompt_personalizado || '').trim(),
        mensagem_pausa_humano: (form.mensagem_pausa_humano || '').trim(),
        meta_verify_token: (form.meta_verify_token || 'hubi_whatsapp_webhook_token').trim()
      };

      const res = await salvarConfiguracoesWhatsApp(idLojaAlvo, formSanitizado);
      if (res.sucesso) {
        setForm(formSanitizado);
        mostrarSucesso('Configurações Salvas', 'As credenciais e preferências do WhatsApp com IA foram atualizadas no banco com sucesso!');
        setMensagemSucesso('Configurações salvas no banco com sucesso!');
        setTimeout(() => setMensagemSucesso(null), 4000);
        if (recarregarDadosLoja) {
          await recarregarDadosLoja();
        }
      } else {
        mostrarErro('Erro ao salvar no banco', res.erro || 'Não foi possível salvar as configurações no Supabase.');
      }
    } catch (err: any) {
      mostrarErro('Falha na operação', err?.message || 'Ocorreu um erro ao gravar no banco de dados.');
    } finally {
      setSalvando(false);
      if (onSalvandoChange) onSalvandoChange(false);
    }
  }, [idLojaAlvo, form, onSalvandoChange, mostrarSucesso, mostrarErro, recarregarDadosLoja]);

  // Conectar saveRef para o botão único do header da página
  useEffect(() => {
    if (saveRef) {
      saveRef.current = { salvar: handleSalvar };
    }
    return () => {
      if (saveRef) saveRef.current = null;
    };
  }, [saveRef, handleSalvar]);

  // Testar conexão Gemini
  const handleTestarGemini = async () => {
    setStatusGemini(null);
    setTestandoGemini(true);
    const resultado = await testarConexaoGemini(form.gemini_api_key);
    setStatusGemini(resultado);
    setTestandoGemini(false);
  };

  // Testar conexão Meta
  const handleTestarMeta = async () => {
    setStatusMeta(null);
    setTestandoMeta(true);
    const resultado = await testarConexaoMeta(form.meta_phone_number_id, form.meta_access_token);
    setStatusMeta(resultado);
    setTestandoMeta(false);
  };

  // Funções de copiar para a área de transferência
  const copiarParaClipboard = (texto: string, setStatus: (val: boolean) => void) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(texto);
    setStatus(true);
    setTimeout(() => setStatus(false), 2000);
  };

  // Cálculos de consumo
  const totalMensagens = consumo?.total_mensagens || 0;
  const limiteMax = form.limite_mensal_alerta || 1000;
  const porcentagemConsumo = Math.min(100, Math.round((totalMensagens / limiteMax) * 100));

  if (carregando) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          Carregando módulo de WhatsApp e IA...
        </p>
      </div>
    );
  }

  return (
    <div className={`p-4 md:p-6 space-y-6 max-w-5xl mx-auto ${isDark ? 'text-white' : 'text-slate-900'}`}>
      {/* Barra Superior de Navegação */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-700/40">
        <div className="flex items-center gap-3">
          {onVoltar && (
            <button
              onClick={onVoltar}
              className={`p-2 rounded-xl transition-all ${
                isDark ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
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
              Automação inteligente 24/7 com Google Gemini e Meta Cloud API (BYOK)
            </p>
          </div>
        </div>
      </div>

      {/* Feedback Visual Verde de Sucesso */}
      {mensagemSucesso && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 text-xs md:text-sm font-bold shadow-sm animate-in fade-in ${
          isDark
            ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
            : 'bg-emerald-50 border-2 border-emerald-400 text-emerald-900'
        }`}>
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{mensagemSucesso}</span>
        </div>
      )}

      {/* 0. CARTEIRA PRÉ-PAGA (WALLET) & MOTOR HÍBRIDO DE NOTIFICAÇÕES WHATSAPP */}
      {loja && (
        <CardCarteiraWhatsapp
          loja={loja}
          usuarioId={usuario?.id || null}
          aoAtualizarLoja={() => {
            recarregarDadosLoja?.();
          }}
        />
      )}

      {/* 1. CARD: STATUS GERAL & CONTROLE DE CONSUMO */}
      <div className={`p-5 rounded-2xl border transition-all ${
        isDark ? 'bg-[#0F1E26] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-700/30">
          <div className="flex items-center gap-3">
            <div className={`w-3.5 h-3.5 rounded-full ${form.ia_whatsapp_ativa ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
            <div>
              <h2 className="font-semibold text-base md:text-lg">Status do Agente Inteligente</h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {form.ia_whatsapp_ativa
                  ? 'A IA responderá automaticamente às dúvidas e pedidos dos clientes.'
                  : 'A IA está pausada. Nenhuma mensagem automática será enviada.'}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={form.ia_whatsapp_ativa}
              onChange={(e) => setForm(prev => ({ ...prev, ia_whatsapp_ativa: e.target.checked }))}
              disabled={!podeEditar}
              className="sr-only peer"
            />
            <div className="w-12 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            <span className="ml-3 text-sm font-medium">
              {form.ia_whatsapp_ativa ? 'Ativado' : 'Pausado'}
            </span>
          </label>
        </div>

        {/* Barra de Progresso de Consumo Mensal */}
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between text-xs md:text-sm">
            <span className="font-medium flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Consumo Mensal de Mensagens ({new Date().toISOString().substring(0, 7)})
            </span>
            <span className="font-bold">
              {totalMensagens.toLocaleString('pt-BR')} / {limiteMax.toLocaleString('pt-BR')} ({porcentagemConsumo}%)
            </span>
          </div>

          <div className="w-full bg-slate-700/50 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                porcentagemConsumo >= 90
                  ? 'bg-rose-500'
                  : porcentagemConsumo >= 75
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${porcentagemConsumo}%` }}
            />
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs md:text-sm">
              <input
                type="checkbox"
                checked={form.pausar_ao_atingir_limite}
                onChange={(e) => setForm(prev => ({ ...prev, pausar_ao_atingir_limite: e.target.checked }))}
                disabled={!podeEditar}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-700"
              />
              <span>Pausar IA automaticamente ao atingir o limite mensal (evita cobranças extras)</span>
            </label>

            <div className="flex items-center gap-2">
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Limite mensal:</span>
              <input
                type="number"
                min="100"
                step="100"
                value={form.limite_mensal_alerta}
                onChange={(e) => setForm(prev => ({ ...prev, limite_mensal_alerta: parseInt(e.target.value) || 1000 }))}
                disabled={!podeEditar}
                className={`w-24 px-2 py-1 text-xs rounded-lg border text-right font-semibold ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-300'
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. CARD: GOOGLE GEMINI (BYOK) */}
      <div className={`p-5 rounded-2xl border transition-all ${
        isDark ? 'bg-[#0F1E26] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-700/30">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="font-semibold text-base md:text-lg">Google Gemini API (BYOK)</h2>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 hover:underline"
          >
            <span>Obter chave gratuita</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <p className={`text-xs md:text-sm mt-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          No modelo <strong>BYOK (Bring Your Own Key)</strong>, você insere sua chave de API do Gemini 1.5 Flash. O plano gratuito da Google oferece até 15 requisições por minuto com custo zero para a sua loja.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Chave de API do Gemini
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <input
                type={mostrarGeminiKey ? 'text' : 'password'}
                placeholder="AIzaSy..."
                value={form.gemini_api_key}
                onChange={(e) => setForm(prev => ({ ...prev, gemini_api_key: e.target.value }))}
                disabled={!podeEditar}
                className={`w-full pl-3 pr-10 py-2.5 text-sm rounded-xl border outline-none font-mono transition-all ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 focus:border-emerald-500 text-white'
                    : 'bg-slate-50 border-slate-300 focus:border-emerald-600 text-slate-900'
                }`}
              />
              <button
                type="button"
                onClick={() => setMostrarGeminiKey(!mostrarGeminiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
              >
                {mostrarGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="button"
              onClick={handleTestarGemini}
              disabled={testandoGemini || !form.gemini_api_key}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-medium transition-all ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
              } disabled:opacity-50`}
            >
              {testandoGemini ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Testando...</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4 text-emerald-400" />
                  <span>Testar Chave</span>
                </>
              )}
            </button>
          </div>

          {/* Feedback do Teste Gemini */}
          {statusGemini && (
            <div className={`p-3 rounded-xl flex items-center gap-2 text-xs md:text-sm ${
              statusGemini.sucesso
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              {statusGemini.sucesso ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{statusGemini.mensagem}</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. CARD: META CLOUD API (WHATSAPP BUSINESS) */}
      <div className={`p-5 rounded-2xl border transition-all ${
        isDark ? 'bg-[#0F1E26] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-700/30">
          <div className="flex items-center gap-2.5">
            <Phone className="w-5 h-5 text-emerald-400" />
            <h2 className="font-semibold text-base md:text-lg">Meta Cloud API (WhatsApp Oficial)</h2>
          </div>
          <a
            href="https://developers.facebook.com/apps/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 hover:underline"
          >
            <span>Portal Meta Developers</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Phone Number ID
            </label>
            <input
              type="text"
              placeholder="Ex: 104523991283..."
              value={form.meta_phone_number_id}
              onChange={(e) => setForm(prev => ({ ...prev, meta_phone_number_id: e.target.value }))}
              disabled={!podeEditar}
              className={`w-full px-3 py-2 text-sm rounded-xl border outline-none font-mono ${
                isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              WhatsApp Business Account ID (WABA)
            </label>
            <input
              type="text"
              placeholder="Ex: 109283746501..."
              value={form.meta_waba_id}
              onChange={(e) => setForm(prev => ({ ...prev, meta_waba_id: e.target.value }))}
              disabled={!podeEditar}
              className={`w-full px-3 py-2 text-sm rounded-xl border outline-none font-mono ${
                isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>
        </div>

        {/* Token de Acesso Meta */}
        <div className="mt-4 space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Token de Acesso Permanente (System User Token)
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <input
                type={mostrarMetaToken ? 'text' : 'password'}
                placeholder="EAA..."
                value={form.meta_access_token}
                onChange={(e) => setForm(prev => ({ ...prev, meta_access_token: e.target.value }))}
                disabled={!podeEditar}
                className={`w-full pl-3 pr-10 py-2.5 text-sm rounded-xl border outline-none font-mono ${
                  isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
              <button
                type="button"
                onClick={() => setMostrarMetaToken(!mostrarMetaToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
              >
                {mostrarMetaToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="button"
              onClick={handleTestarMeta}
              disabled={testandoMeta || !form.meta_phone_number_id || !form.meta_access_token}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-medium transition-all ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
              } disabled:opacity-50`}
            >
              {testandoMeta ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Validando...</span>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Testar Meta API</span>
                </>
              )}
            </button>
          </div>

          {/* Feedback do Teste Meta */}
          {statusMeta && (
            <div className={`p-3 mt-2 rounded-xl flex items-center gap-2 text-xs md:text-sm ${
              statusMeta.sucesso
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              {statusMeta.sucesso ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{statusMeta.mensagem}</span>
            </div>
          )}
        </div>

        {/* Informações do Webhook da Meta para Copiar */}
        <div className={`mt-5 p-5 rounded-2xl border transition-all ${
          isDark
            ? 'bg-[#0a1820] border-emerald-500/30 shadow-lg shadow-black/40'
            : 'bg-emerald-50/70 border-emerald-300 shadow-xs'
        } space-y-4`}>
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Sliders className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400">
                Configuração de Webhook no Painel da Meta
              </h3>
              <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                Copie a <strong>Callback URL</strong> e o <strong>Verify Token</strong> abaixo e cole no portal <strong>Meta for Developers &gt; WhatsApp &gt; Configuração &gt; Webhook</strong>.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div>
              <label className={`block text-xs uppercase font-bold tracking-wider mb-1.5 ${
                isDark ? 'text-slate-200' : 'text-slate-800'
              }`}>
                Callback URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookCallbackUrl}
                  className={`w-full px-3.5 py-2.5 text-xs md:text-sm rounded-xl border font-mono select-all font-semibold outline-none transition-all ${
                    isDark
                      ? 'bg-[#060e13] border-slate-700 text-emerald-300 focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-emerald-900 focus:border-emerald-600'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => copiarParaClipboard(webhookCallbackUrl, setCopiadoUrl)}
                  className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1.5 text-xs font-semibold shadow-md shadow-emerald-950/20 active:scale-95 flex-shrink-0"
                  title="Copiar Callback URL"
                >
                  {copiadoUrl ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span className="hidden sm:inline">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-white" />
                      <span className="hidden sm:inline">Copiar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className={`block text-xs uppercase font-bold tracking-wider mb-1.5 ${
                isDark ? 'text-slate-200' : 'text-slate-800'
              }`}>
                Verify Token
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={tokenVerifyExibicao}
                  className={`w-full px-3.5 py-2.5 text-xs md:text-sm rounded-xl border font-mono select-all font-semibold outline-none transition-all ${
                    isDark
                      ? 'bg-[#060e13] border-slate-700 text-emerald-300 focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-emerald-900 focus:border-emerald-600'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => copiarParaClipboard(tokenVerifyExibicao, setCopiadoToken)}
                  className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1.5 text-xs font-semibold shadow-md shadow-emerald-950/20 active:scale-95 flex-shrink-0"
                  title="Copiar Verify Token"
                >
                  {copiadoToken ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span className="hidden sm:inline">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-white" />
                      <span className="hidden sm:inline">Copiar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-medium border ${
            isDark ? 'bg-slate-900/80 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
          }`}>
            <span className="text-emerald-400 font-bold">💡 Dica:</span>
            <span>Após salvar a URL e Token na Meta, vá na aba <strong>Campos do Webhook</strong> e clique em <strong>Assinar</strong> no campo <strong>messages</strong>.</span>
          </div>
        </div>
      </div>

      {/* 4. CARD: PERSONALIZAÇÃO DO PROMPT & FALLBACK HUMANO */}
      <div className={`p-5 rounded-2xl border transition-all ${
        isDark ? 'bg-[#0F1E26] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-700/30">
          <MessageSquare className="w-5 h-5 text-emerald-400" />
          <h2 className="font-semibold text-base md:text-lg">Instruções do Assistente & Atendimento Humano</h2>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Orientações Especiais e Regras da Loja (Prompt Personalizado)
            </label>
            <p className={`text-xs mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Informe regras específicas do seu negócio. Ex: Chave Pix para transferências, tempo médio de entrega, promoções ativas ou política de trocas.
            </p>
            <textarea
              rows={4}
              placeholder="Ex: Nossa chave Pix é 11999999999. Informar que o tempo médio de entrega é de 45 minutos. Para pedidos acima de R$ 100 o frete é grátis."
              value={form.prompt_personalizado}
              onChange={(e) => setForm(prev => ({ ...prev, prompt_personalizado: e.target.value }))}
              disabled={!podeEditar}
              className={`w-full p-3 text-sm rounded-xl border outline-none ${
                isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Mensagem Automática para Fila de Atendimento Humano
            </label>
            <p className={`text-xs mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Disparada quando o cliente pede para falar com um atendente ou quando a cota mensal é atingida.
            </p>
            <textarea
              rows={2}
              value={form.mensagem_pausa_humano}
              onChange={(e) => setForm(prev => ({ ...prev, mensagem_pausa_humano: e.target.value }))}
              disabled={!podeEditar}
              className={`w-full p-3 text-sm rounded-xl border outline-none ${
                isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
