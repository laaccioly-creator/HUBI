import React, { useState, useEffect } from 'react';
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

export interface ConfiguracoesWhatsAppIAProps {
  lojaId?: string;
  onVoltar?: () => void;
}

export const ConfiguracoesWhatsAppIA: React.FC<ConfiguracoesWhatsAppIAProps> = ({
  lojaId: propLojaId,
  onVoltar
}) => {
  const { isDark } = useTheme();
  const { loja } = useAuth();
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
    meta_verify_token: 'hubi_' + Math.random().toString(36).substring(2, 10),
    prompt_personalizado: '',
    mensagem_pausa_humano: 'Nosso atendimento por inteligência artificial está temporariamente pausado. Um atendente da nossa equipe continuará seu atendimento por aqui em breve!'
  });

  // URL do Webhook dinamicamente montada
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://seu-projeto.supabase.co';
  const webhookCallbackUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;

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
        setForm(prev => ({
          ...prev,
          ...configData,
          meta_verify_token: configData.meta_verify_token || prev.meta_verify_token
        }));
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

  // Handler para salvar alterações
  const handleSalvar = async () => {
    if (!idLojaAlvo) return;
    if (!podeEditar) {
      mostrarErro('Acesso restrito', 'Você não tem permissão para alterar as configurações desta loja.');
      return;
    }

    try {
      setSalvando(true);
      const res = await salvarConfiguracoesWhatsApp(idLojaAlvo, form);
      if (res.sucesso) {
        mostrarSucesso('Configurações Salvas', 'As preferências do WhatsApp com IA foram atualizadas com sucesso.');
      } else {
        mostrarErro('Erro ao salvar', res.erro || 'Não foi possível salvar as configurações.');
      }
    } catch (err: any) {
      mostrarErro('Falha na operação', 'Ocorreu um erro ao gravar no banco de dados.');
    } finally {
      setSalvando(false);
    }
  };

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
      {/* Barra Superior de Navegação e Ação */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-700/40">
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

        <button
          onClick={handleSalvar}
          disabled={salvando || !podeEditar}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-lg shadow-emerald-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {salvando ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Salvando...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Salvar Alterações</span>
            </>
          )}
        </button>
      </div>

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
        <div className="mt-5 p-4 rounded-xl bg-slate-900/40 border border-slate-700/50 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Sliders className="w-4 h-4" />
            Configuração de Webhook no Painel da Meta
          </h3>
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Copie os dados abaixo e cole na seção <strong>WhatsApp {'>'} Configuração {'>'} Webhook</strong> no painel de desenvolvedores da Meta.
          </p>

          <div className="space-y-2">
            <div>
              <span className="text-[11px] text-slate-400 uppercase font-semibold">Callback URL</span>
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  type="text"
                  readOnly
                  value={webhookCallbackUrl}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border font-mono select-all ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => copiarParaClipboard(webhookCallbackUrl, setCopiadoUrl)}
                  className="p-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 transition-all flex items-center gap-1 text-xs font-medium"
                >
                  {copiadoUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 uppercase font-semibold">Verify Token</span>
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  type="text"
                  readOnly
                  value={form.meta_verify_token}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border font-mono select-all ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => copiarParaClipboard(form.meta_verify_token, setCopiadoToken)}
                  className="p-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 transition-all flex items-center gap-1 text-xs font-medium"
                >
                  {copiadoToken ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
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
