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
      setErro('Por favor, cole sua Chave de API da SerpApi antes de continuar.');
      return;
    }

    if (chaveLimpa.length < 16) {
      setErro('A chave informada parece curta demais. Verifique o código copiado no painel da SerpApi.');
      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      await salvarSerpApiKey(chaveLimpa, loja?.id, loja);
      onChaveSalvaComSucesso(chaveLimpa);
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar chave SerpApi:', err);
      setErro(err.message || 'Erro ao salvar a chave de API. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100">
        
        {/* CABEÇALHO */}
        <div className="p-5 sm:p-6 border-b border-slate-800/80 flex items-start justify-between gap-4 bg-gradient-to-r from-teal-950/30 via-slate-900 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-100 tracking-tight">
                Ativar Busca Automática de Fotos de Produtos
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure sua cota gratuita de <strong>250 buscas mensais</strong> em menos de 2 minutos.
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

        {/* CORPO DO MODAL (PASSO A PASSO) */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar">
          <div className="space-y-4 text-xs">
            
            {/* ETAPA 1 */}
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <div className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                1
              </div>
              <div className="space-y-2.5 flex-1">
                <p className="font-semibold text-slate-200 leading-relaxed">
                  Clique no botão de atalho abaixo para abrir o cadastro da <strong>SerpApi</strong>:
                </p>
                <div>
                  <a
                    href="https://serpapi.com/users/sign_up"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 font-black text-xs shadow-lg shadow-teal-500/20 transition active:scale-95"
                  >
                    <span>🔗 Obter Chave Gratuita (250 fotos/mês)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>

            {/* ETAPA 2 */}
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                2
              </div>
              <p className="font-medium text-slate-300 leading-relaxed pt-0.5">
                Crie sua conta gratuita (você pode se conectar direto com sua <strong>conta Google</strong> em 1 clique).
              </p>
            </div>

            {/* ETAPA 3 */}
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                3
              </div>
              <p className="font-medium text-slate-300 leading-relaxed pt-0.5">
                Confirme seu e-mail e o código SMS recebido no celular para validação de segurança.
              </p>
            </div>

            {/* ETAPA 4 */}
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                4
              </div>
              <div className="space-y-2 flex-1">
                <p className="font-medium text-slate-300 leading-relaxed pt-0.5">
                  Na tela final <em>"Escolha um Plano"</em>, deixe marcado <strong>Plano Gratuito</strong> e clique no botão azul <strong>"Assine"</strong>.
                </p>
                <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-teal-200/90 leading-relaxed">
                    <strong>Aviso importante:</strong> Não haverá nenhuma cobrança nem necessidade de cartão de crédito. É apenas a confirmação da sua adesão ao plano 100% gratuito renovado todo mês.
                  </p>
                </div>
              </div>
            </div>

            {/* ETAPA 5 */}
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                5
              </div>
              <p className="font-medium text-slate-300 leading-relaxed pt-0.5">
                No painel principal da SerpApi, acesse a opção <strong>API Key</strong> no menu superior, copie o código da sua chave e retorne a esta tela.
              </p>
            </div>

          </div>

          {/* ÁREA DE INSERÇÃO DA CHAVE */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-teal-400" />
                <span>Cole sua Chave de API (API Key) aqui:</span>
              </label>
              <button
                type="button"
                onClick={handleColar}
                className="text-[11px] text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1 transition cursor-pointer"
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
                placeholder="Ex: 7a8b9c0d1e2f3a4b5c6d..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 pr-10 text-xs text-slate-100 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none transition font-mono"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition cursor-pointer"
                title={mostrarSenha ? 'Ocultar chave' : 'Mostrar chave'}
              >
                {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {erro && (
              <p className="text-xs text-rose-400 font-medium animate-in fade-in">
                {erro}
              </p>
            )}
          </div>
        </div>

        {/* AÇÕES DO RODAPÉ */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-bold transition cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvarEBuscar}
            disabled={salvando || !apiKey.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 text-xs font-black flex items-center gap-2 transition cursor-pointer shadow-lg shadow-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
