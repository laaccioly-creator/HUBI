import React, { useState } from 'react';
import {
  X,
  Sparkles,
  ExternalLink,
  Key,
  CheckCircle2,
  Info,
  Loader2,
  Eye,
  EyeOff,
  ClipboardPaste
} from 'lucide-react';
import { salvarSerpApiKey } from '../services/serpApiService';
import { Loja } from '../types';

interface ModalOnboardingSerpApiProps {
  isOpen: boolean;
  onClose: () => void;
  loja?: Loja | null;
  onChaveSalvaComSucesso: (novaChave: string) => void;
}

export const ModalOnboardingSerpApi: React.FC<ModalOnboardingSerpApiProps> = ({
  isOpen,
  onClose,
  loja,
  onChaveSalvaComSucesso
}) => {
  const [apiKey, setApiKey] = useState<string>('');
  const [mostrarSenha, setMostrarSenha] = useState<boolean>(false);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleColar = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const texto = await navigator.clipboard.readText();
        if (texto) {
          setApiKey(texto.trim());
          setErro(null);
        }
      }
    } catch {
      // Falha de permissão do navegador ao ler clipboard silenciosa
    }
  };

  const handleSalvarEBuscar = async () => {
    const chaveLimpa = apiKey.trim();
    if (!chaveLimpa) {
      setErro('Por favor, cole sua API Key do Serper.dev antes de continuar.');
      return;
    }

    if (chaveLimpa.length < 16) {
      setErro('A chave informada parece curta demais. Verifique o código copiado no painel do Serper.dev.');
      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      await salvarSerpApiKey(chaveLimpa, loja?.id, loja);
      onChaveSalvaComSucesso(chaveLimpa);
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar API Key do Serper.dev:', err);
      setErro(err.message || 'Erro ao salvar a chave de API. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-800 dark:text-slate-100">
        
        {/* CABEÇALHO */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 bg-emerald-50/50 dark:bg-gradient-to-r dark:from-emerald-950/20 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-start gap-3.5 flex-1 min-w-0 pr-2">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 shadow-xs mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight leading-snug">
                Ativar Busca Automática de Fotos
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Configure sua cota gratuita de 2.500 buscas do Serper.dev em menos de 1 minuto.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CORPO DO MODAL (PASSO A PASSO SERPER.DEV) */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="space-y-3 text-sm">
            
            {/* PASSO 1 */}
            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100">
              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                1
              </div>
              <div className="space-y-2.5 flex-1">
                <p className="font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                  Clique no botão de atalho abaixo para abrir o site do Serper.dev:
                </p>
                <div>
                  <a
                    href="https://serper.dev/signup"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition active:scale-95 cursor-pointer"
                  >
                    <span>Criar Conta no Serper.dev (2.500 buscas grátis)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>

            {/* PASSO 2 */}
            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100">
              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                2
              </div>
              <p className="font-medium text-slate-700 dark:text-slate-200 leading-relaxed pt-0.5">
                Cadastre-se gratuitamente (pode usar o botão <strong>'Sign in with Google'</strong> com sua conta Google em 1 clique).
              </p>
            </div>

            {/* PASSO 3 */}
            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100">
              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                3
              </div>
              <p className="font-medium text-slate-700 dark:text-slate-200 leading-relaxed pt-0.5">
                No painel principal do Serper, copie o código da sua <strong>API Key</strong> que aparece no topo da tela.
              </p>
            </div>

            {/* PASSO 4 (CAIXA DE DESTAQUE) */}
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
              <Info className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm leading-relaxed">
                <strong>Sem cartão de crédito:</strong> Não é necessário cartão de crédito. Você ganha <strong>2.500 pesquisas gratuitas</strong> imediatamente ao cadastrar.
              </p>
            </div>

          </div>

          {/* ÁREA DE INSERÇÃO DA CHAVE */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Cole sua API Key do Serper.dev aqui:</span>
              </label>
              <button
                type="button"
                onClick={handleColar}
                className="text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 font-bold flex items-center gap-1.5 transition cursor-pointer px-2.5 py-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Colar</span>
              </button>
            </div>

            <div className="relative">
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  if (erro) setErro(null);
                }}
                placeholder="Ex: a1b2c3d4e5f6..."
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3.5 pr-11 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition font-mono shadow-2xs"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                title={mostrarSenha ? 'Ocultar chave' : 'Mostrar chave'}
              >
                {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {erro && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold animate-in fade-in flex items-center gap-1.5 pt-0.5">
                {erro}
              </p>
            )}
          </div>
        </div>

        {/* AÇÕES DO RODAPÉ */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/60 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs sm:text-sm font-bold transition cursor-pointer shadow-xs disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvarEBuscar}
            disabled={salvando || !apiKey.trim()}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            {salvando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Salvar e Buscar Foto</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
