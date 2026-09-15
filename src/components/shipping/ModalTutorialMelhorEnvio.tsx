import React from 'react';
import { X, ExternalLink, KeyRound, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ModalTutorialMelhorEnvioProps {
  aberto: boolean;
  onClose: () => void;
}

export const ModalTutorialMelhorEnvio: React.FC<ModalTutorialMelhorEnvioProps> = ({ aberto, onClose }) => {
  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-sky-600 to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold text-lg text-white">
              ME
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Como obter o Token do Melhor Envio
              </h3>
              <p className="text-xs text-sky-100">
                Guia passo a passo para habilitar Jadlog, Correios (SEDEX/PAC), Azul Cargo e mais
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-sky-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700 dark:text-slate-300">
          {/* Alerta de Link Oficial */}
          <div className="p-4 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-sky-900 dark:text-sky-200">
                Painel Oficial do Melhor Envio
              </p>
              <p className="text-xs text-sky-700 dark:text-sky-300">
                Acesse o ambiente oficial correspondente:
              </p>
              <div className="flex flex-wrap gap-4 pt-1">
                <a
                  href="https://melhorenvio.com.br"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-800 dark:text-sky-300 underline hover:text-sky-900"
                >
                  melhorenvio.com.br (Produção) <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a
                  href="https://sandbox.melhorenvio.com.br"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-800 dark:text-sky-300 underline hover:text-sky-900"
                >
                  sandbox.melhorenvio.com.br (Ambiente de Testes) <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Passos Guiados */}
          <div className="space-y-4">
            {/* Passo 1 */}
            <div className="flex gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0">
                1
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-slate-900 dark:text-white">Acessar o Painel e Configurações</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Faça login com sua conta no Melhor Envio. Clique no ícone do seu perfil no canto superior direito e selecione a opção <strong className="text-slate-800 dark:text-slate-200">Painel de Controle</strong> ou vá direto em <strong className="text-slate-800 dark:text-slate-200">Configurações</strong>.
                </p>
              </div>
            </div>

            {/* Passo 2 */}
            <div className="flex gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0">
                2
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-slate-900 dark:text-white">Gerenciamento de Tokens de Acesso</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  No menu lateral de configurações, procure pela aba <strong className="text-slate-800 dark:text-slate-200">Tokens / Chaves de API</strong> ou <strong className="text-slate-800 dark:text-slate-200">Tokens de Acesso Pessoal (Personal Access Tokens)</strong>.
                </p>
              </div>
            </div>

            {/* Passo 3 */}
            <div className="flex gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0">
                3
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-sky-600" />
                  Gerar Novo Token com Escopo de Cálculo
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Clique no botão <strong className="text-slate-800 dark:text-slate-200">&quot;Novo Token&quot;</strong>. Dê um nome amigável (ex: <code>HUBI Sistema de Gestão</code>) e marque a permissão essencial:
                </p>
                <div className="p-2.5 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-xs font-mono font-semibold text-sky-900 dark:text-sky-200 inline-block mt-1">
                  [x] shipping-calculate (Calcular cotações de envio)
                </div>
              </div>
            </div>

            {/* Passo 4 */}
            <div className="flex gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0">
                4
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-slate-900 dark:text-white">Copiar o Token JWT</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Copie a chave JWT gerada (uma sequência longa começando com <code>eyJ...</code>) e cole no campo <strong className="text-slate-800 dark:text-slate-200">&quot;Token de Acesso (Personal Token)&quot;</strong> nas configurações do HUBI.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              <strong>Atenção:</strong> O Melhor Envio só exibe a chave completa no momento em que ela é criada. Guarde-a com segurança e, caso alterne entre Sandbox e Produção, certifique-se de usar o token correspondente de cada plataforma.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-semibold text-white bg-sky-600 hover:bg-sky-500 transition-colors flex items-center gap-2"
          >
            Entendido, fechar tutorial
          </button>
        </div>
      </div>
    </div>
  );
};
