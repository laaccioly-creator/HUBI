import React from 'react';
import { X, ExternalLink, Key, ShieldCheck, CreditCard, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

interface ModalTutorialUberDirectProps {
  aberto: boolean;
  onClose: () => void;
}

export const ModalTutorialUberDirect: React.FC<ModalTutorialUberDirectProps> = ({ aberto, onClose }) => {
  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-black to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center font-bold text-lg text-emerald-400">
              UB
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Como obter as Credenciais da Uber Direct
              </h3>
              <p className="text-xs text-slate-300">
                Guia passo a passo para integração de entregas instantâneas (Uber Flash / Motoboy)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700 dark:text-slate-300">
          {/* Alerta de Link Oficial */}
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                Painel Oficial de Desenvolvedores da Uber
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Acesse com a sua conta corporativa da Uber em:
              </p>
              <a
                href="https://direct.uber.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 underline hover:text-emerald-900"
              >
                direct.uber.com <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Passos Guiados */}
          <div className="space-y-4">
            {/* Passo 1 */}
            <div className="flex gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-900 font-bold flex items-center justify-center shrink-0">
                1
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-slate-900 dark:text-white">Login e Menu Desenvolvedor</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Faça login no portal <strong className="text-slate-800 dark:text-slate-200">direct.uber.com</strong>. No menu lateral esquerdo, clique em <strong className="text-slate-800 dark:text-slate-200">Gerenciamento (Management)</strong> e em seguida selecione <strong className="text-slate-800 dark:text-slate-200">Desenvolvedor (Developer)</strong>.
                </p>
              </div>
            </div>

            {/* Passo 2 */}
            <div className="flex gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-900 font-bold flex items-center justify-center shrink-0">
                2
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-emerald-500" />
                  Copie o Customer ID (Identificador da Loja)
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Na seção superior da tela de desenvolvedor, localize o identificador exclusivo da sua organização chamado <strong className="text-slate-800 dark:text-slate-200">Customer ID</strong> (formato UUID). Copie e cole no campo correspondente no HUBI.
                </p>
              </div>
            </div>

            {/* Passo 3 */}
            <div className="flex gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-900 font-bold flex items-center justify-center shrink-0">
                3
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-slate-900 dark:text-white">Criar Aplicação (Client ID & Client Secret)</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Clique no botão <strong className="text-slate-800 dark:text-slate-200">&quot;Adicionar Aplicação&quot;</strong> ou selecione uma aplicação já existente. Você terá acesso ao <strong className="text-slate-800 dark:text-slate-200">Client ID</strong> e poderá gerar o <strong className="text-slate-800 dark:text-slate-200">Client Secret</strong>. Copie ambos com segurança.
                </p>
              </div>
            </div>

            {/* Passo 4 */}
            <div className="flex gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-900 font-bold flex items-center justify-center shrink-0">
                4
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-emerald-500" />
                  Ativação da Forma de Pagamento
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Na aba <strong className="text-slate-800 dark:text-slate-200">Cobrança / Pagamentos</strong> da Uber Direct, cadastre um cartão de crédito corporativo ou aprove o faturamento. A Uber exige método de pagamento ativo para autorizar cotações e despachos de entregadores.
                </p>
              </div>
            </div>

            {/* Passo 5 */}
            <div className="flex gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-900 font-bold flex items-center justify-center shrink-0">
                5
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-slate-900 dark:text-white">Modo Sandbox vs Produção</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Enquanto estiver testando, mantenha o switch <strong className="text-slate-800 dark:text-slate-200">&quot;Modo Sandbox&quot;</strong> ligado. Quando estiver pronto para atender clientes reais com motoboys de verdade, desative o sandbox para entrar no modo de produção.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              <strong>Importante:</strong> Certifique-se de que o endereço de origem da loja informado nas configurações do HUBI esteja correto e com número e bairro precisos, pois a Uber usa esse ponto exato para localizar o motorista e calcular o raio máximo de atendimento.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors flex items-center gap-2"
          >
            Entendido, fechar tutorial
          </button>
        </div>
      </div>
    </div>
  );
};
