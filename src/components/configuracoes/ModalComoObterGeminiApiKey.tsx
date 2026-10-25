import React, { useState } from 'react';
import {
  X,
  Sparkles,
  ExternalLink,
  Key,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  ClipboardPaste,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface ModalComoObterGeminiApiKeyProps {
  isOpen: boolean;
  onClose: () => void;
  onPreencherChave?: (chave: string) => void;
}

export const ModalComoObterGeminiApiKey: React.FC<ModalComoObterGeminiApiKeyProps> = ({
  isOpen,
  onClose,
  onPreencherChave,
}) => {
  const { isDark } = useTheme();
  const [copiadoUrl, setCopiadoUrl] = useState<boolean>(false);
  const [chaveColada, setChaveColada] = useState<string>('');

  if (!isOpen) return null;

  const urlGoogleAiStudio = 'https://aistudio.google.com/app/apikey';

  const handleCopiarUrl = async () => {
    try {
      await navigator.clipboard.writeText(urlGoogleAiStudio);
      setCopiadoUrl(true);
      setTimeout(() => setCopiadoUrl(false), 2500);
    } catch {}
  };

  const handleColarClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const texto = await navigator.clipboard.readText();
        if (texto && texto.trim()) {
          setChaveColada(texto.trim());
          if (onPreencherChave) {
            onPreencherChave(texto.trim());
          }
        }
      }
    } catch {}
  };

  const handleConfirmarChave = () => {
    const limpa = chaveColada.trim();
    if (limpa && onPreencherChave) {
      onPreencherChave(limpa);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden border ${
          isDark
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* CABEÇALHO */}
        <div
          className={`p-5 sm:p-6 border-b flex items-start justify-between gap-4 ${
            isDark
              ? 'border-slate-800 bg-slate-900'
              : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2
                className={`text-base sm:text-lg font-black tracking-tight flex items-center gap-2 ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                Como Obter a Chave Gratuita do Google Gemini
              </h2>
              <p
                className={`text-xs mt-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Passo a passo rápido para gerar sua credencial oficial no <strong>Google AI Studio</strong> (100% gratuita).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl transition cursor-pointer ${
              isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
            }`}
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CORPO DO MODAL COM O PASSO A PASSO ILUSTRADO */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* Card de Destaque do Link Direto */}
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isDark
                ? 'bg-amber-500/10 border-amber-500/25'
                : 'bg-amber-50 border-amber-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Key className="w-5 h-5 text-amber-500 shrink-0" />
              <div>
                <span className="text-xs font-black text-amber-600 dark:text-amber-400 block">
                  Painel Oficial do Google AI Studio
                </span>
                <span
                  className={`text-[11px] font-mono break-all ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  {urlGoogleAiStudio}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopiarUrl}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs'
                }`}
              >
                {copiadoUrl ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiadoUrl ? 'Copiado!' : 'Copiar Link'}</span>
              </button>
              <a
                href={urlGoogleAiStudio}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>Acessar Google AI Studio</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Os 4 Passos Obrigatórios */}
          <div className="space-y-3">
            <span
              className={`text-[11px] font-black uppercase tracking-wider block ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Siga os 4 passos simplificados:
            </span>

            {/* Passo 1 */}
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                isDark
                  ? 'bg-slate-800 border-slate-700'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-xl border flex items-center justify-center font-black text-xs shrink-0 ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-amber-400'
                    : 'bg-white border-slate-300 text-amber-600 shadow-2xs'
                }`}
              >
                1
              </div>
              <div className="space-y-1">
                <h4
                  className={`text-xs font-black ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Acesse o Google AI Studio
                </h4>
                <p
                  className={`text-[11px] leading-relaxed ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  Abra o link <strong>aistudio.google.com/app/apikey</strong> em uma nova aba do seu navegador (ou clique no botão acima).
                </p>
              </div>
            </div>

            {/* Passo 2 */}
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                isDark
                  ? 'bg-slate-800 border-slate-700'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-xl border flex items-center justify-center font-black text-xs shrink-0 ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-amber-400'
                    : 'bg-white border-slate-300 text-amber-600 shadow-2xs'
                }`}
              >
                2
              </div>
              <div className="space-y-1">
                <h4
                  className={`text-xs font-black ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Faça login com sua conta Google
                </h4>
                <p
                  className={`text-[11px] leading-relaxed ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  Utilize sua conta corporativa da loja ou sua conta Google pessoal. A cota gratuita oferece até <strong>15 requisições por minuto</strong> sem cobrança no cartão.
                </p>
              </div>
            </div>

            {/* Passo 3 */}
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                isDark
                  ? 'bg-slate-800 border-slate-700'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-xl border flex items-center justify-center font-black text-xs shrink-0 ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-amber-400'
                    : 'bg-white border-slate-300 text-amber-600 shadow-2xs'
                }`}
              >
                3
              </div>
              <div className="space-y-1">
                <h4
                  className={`text-xs font-black ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Clique no botão azul "Create API key"
                </h4>
                <p
                  className={`text-[11px] leading-relaxed ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  No topo da tela, clique em <strong>Create API key</strong> (Criar chave de API). Se solicitado, confirme o projeto padrão do Google Cloud.
                </p>
              </div>
            </div>

            {/* Passo 4 */}
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                isDark
                  ? 'bg-slate-800 border-slate-700'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-xl border flex items-center justify-center font-black text-xs shrink-0 ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-amber-400'
                    : 'bg-white border-slate-300 text-amber-600 shadow-2xs'
                }`}
              >
                4
              </div>
              <div className="space-y-1">
                <h4
                  className={`text-xs font-black ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Copie o código gerado e cole no HUBI
                </h4>
                <p
                  className={`text-[11px] leading-relaxed ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  A chave gerada começa com <strong className="text-amber-500 font-mono">AIzaSy...</strong>. Copie esse código e cole no campo de configurações do HUBI logo abaixo.
                </p>
              </div>
            </div>
          </div>

          {/* Campo Auxiliar de Teste / Colagem Rápida */}
          <div
            className={`pt-3 border-t space-y-2 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <label
              className={`text-[11px] font-bold flex items-center justify-between ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              <span>Já copiou sua chave? Cole-a aqui para preencher o formulário:</span>
              <button
                type="button"
                onClick={handleColarClipboard}
                className="text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 font-bold text-[10px] flex items-center gap-1 cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Colar da Área de Transferência</span>
              </button>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={chaveColada}
                onChange={(e) => setChaveColada(e.target.value)}
                placeholder="Cole sua chave aqui (AIzaSy...)"
                className={`flex-1 px-3.5 py-2.5 rounded-xl border text-xs font-mono focus:outline-none focus:border-amber-500 ${
                  isDark
                    ? 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-600'
                    : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                }`}
              />
              {chaveColada.trim() && (
                <button
                  type="button"
                  onClick={handleConfirmarChave}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shrink-0 transition cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Aplicar</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RODAPÉ */}
        <div
          className={`p-4 border-t flex items-center justify-between text-xs ${
            isDark
              ? 'border-slate-800 bg-slate-950 text-slate-400'
              : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-500 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Sua chave é armazenada de forma segura e exclusiva da sua loja.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
            }`}
          >
            Entendido / Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
