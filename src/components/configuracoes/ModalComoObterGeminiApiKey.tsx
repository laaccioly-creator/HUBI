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
  ArrowRight,
  ClipboardPaste,
  HelpCircle,
} from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100">
        {/* CABEÇALHO */}
        <div className="p-5 sm:p-6 border-b border-slate-800/80 flex items-start justify-between gap-4 bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-100 tracking-tight flex items-center gap-2">
                Como Obter a Chave Gratuita do Google Gemini
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Passo a passo rápido para gerar sua credencial oficial no <strong>Google AI Studio</strong> (100% gratuita).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CORPO DO MODAL COM O PASSO A PASSO ILUSTRADO */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* Card de Destaque do Link Direto */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Key className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <span className="text-xs font-black text-amber-300 block">Painel Oficial do Google AI Studio</span>
                <span className="text-[11px] text-slate-300 font-mono break-all">{urlGoogleAiStudio}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopiarUrl}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                {copiadoUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiadoUrl ? 'Copiado!' : 'Copiar Link'}</span>
              </button>
              <a
                href={urlGoogleAiStudio}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-950/40"
              >
                <span>Acessar Google AI Studio</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Os 4 Passos Obrigatórios */}
          <div className="space-y-3">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block">
              Siga os 4 passos simplificados:
            </span>

            {/* Passo 1 */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
              <div className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-xs text-amber-400 shrink-0">
                1
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black text-slate-200">Acesse o Google AI Studio</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Abra o link <strong className="text-slate-200">aistudio.google.com/app/apikey</strong> em uma nova aba do seu navegador (ou clique no botão acima).
                </p>
              </div>
            </div>

            {/* Passo 2 */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
              <div className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-xs text-amber-400 shrink-0">
                2
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black text-slate-200">Faça login com sua conta Google</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Utilize sua conta corporativa da loja ou sua conta Google pessoal. A cota gratuita oferece até <strong className="text-slate-200">15 requisições por minuto</strong> sem cobrança no cartão.
                </p>
              </div>
            </div>

            {/* Passo 3 */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
              <div className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-xs text-amber-400 shrink-0">
                3
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black text-slate-200">Clique no botão azul "Create API key"</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  No topo da tela, clique em <strong className="text-slate-200">Create API key</strong> (Criar chave de API). Se solicitado, confirme o projeto padrão do Google Cloud.
                </p>
              </div>
            </div>

            {/* Passo 4 */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
              <div className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-xs text-amber-400 shrink-0">
                4
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black text-slate-200">Copie o código gerado e cole no HUBI</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  A chave gerada começa com <strong className="text-amber-300 font-mono">AIzaSy...</strong>. Copie esse código e cole no campo de configurações do HUBI logo abaixo.
                </p>
              </div>
            </div>
          </div>

          {/* Campo Auxiliar de Teste / Colagem Rápida */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
              <span>Já copiou sua chave? Cole-a aqui para preencher o formulário:</span>
              <button
                type="button"
                onClick={handleColarClipboard}
                className="text-amber-400 hover:text-amber-300 font-bold text-[10px] flex items-center gap-1 cursor-pointer"
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
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
              {chaveColada.trim() && (
                <button
                  type="button"
                  onClick={handleConfirmarChave}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shrink-0 transition cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Aplicar</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RODAPÉ */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Sua chave é armazenada de forma segura e exclusiva da sua loja.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
          >
            Entendido / Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
