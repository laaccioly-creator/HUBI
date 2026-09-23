import React from 'react';
import { Sparkles, HelpCircle, Check, X, ArrowRight, Tag, DollarSign } from 'lucide-react';
import { ProdutoSugeridoIA } from '../services/geminiService';

interface ModalDuvidaProdutoIAProps {
  isOpen: boolean;
  onClose: () => void;
  opcoes: ProdutoSugeridoIA[];
  onSelecionarOpcao: (opcao: ProdutoSugeridoIA) => void;
  fotoUrl?: string;
}

export const ModalDuvidaProdutoIA: React.FC<ModalDuvidaProdutoIAProps> = ({
  isOpen,
  onClose,
  opcoes,
  onSelecionarOpcao,
  fotoUrl
}) => {
  if (!isOpen || !opcoes || opcoes.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 text-white">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-400 to-orange-500 flex items-center justify-center text-slate-950 shadow-md">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-100">
                  Qual destes produtos você deseja cadastrar?
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                A IA identificou {opcoes.length} possibilidades para a foto enviada. Selecione a correta:
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Foto do Produto Analisado */}
        {fotoUrl && (
          <div className="mx-4 sm:mx-5 mt-4 p-3 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center gap-3.5 shadow-inner">
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-white border border-slate-600/50 shrink-0 flex items-center justify-center shadow-sm">
              <img
                src={fotoUrl}
                alt="Foto analisada"
                className="w-full h-full object-contain p-1"
              />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-extrabold text-teal-400 uppercase tracking-wider block">Foto Analisada</span>
              <p className="text-xs text-slate-300 font-medium">
                Selecione qual opção abaixo corresponde ao item desta imagem:
              </p>
            </div>
          </div>
        )}

        {/* Lista de Opções Sugeridas */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
          {opcoes.map((opcao, idx) => {
            const precoEstimadoSemCentavos = opcao.preco_venda_estimado
              ? Math.floor(opcao.preco_venda_estimado)
              : 0;

            return (
              <div
                key={idx}
                onClick={() => {
                  onSelecionarOpcao(opcao);
                  onClose();
                }}
                className="group p-4 rounded-2xl border-2 border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 hover:border-teal-400/80 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md active:scale-98"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40 text-xs font-black flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <h4 className="font-bold text-xs sm:text-sm text-slate-100 group-hover:text-teal-300 transition truncate">
                      {opcao.nome}
                    </h4>
                  </div>

                  {opcao.diferencial && (
                    <div className="inline-block">
                      <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        {opcao.diferencial}
                      </span>
                    </div>
                  )}

                  {opcao.descricao && (
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {opcao.descricao}
                    </p>
                  )}

                  <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400">
                    {opcao.categoria_sugerida && (
                      <span className="flex items-center gap-1">
                        <Tag className="w-3 h-3 text-slate-500" />
                        <span>{opcao.categoria_sugerida}</span>
                      </span>
                    )}

                    {precoEstimadoSemCentavos > 0 && (
                      <span className="font-bold text-emerald-400 flex items-center gap-1">
                        <DollarSign className="w-3 h-3 text-emerald-500" />
                        <span>Sugerido: R$ {precoEstimadoSemCentavos.toFixed(2)}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="sm:self-center shrink-0">
                  <button
                    type="button"
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 group-hover:from-teal-400 group-hover:to-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md transition"
                  >
                    <span>Utilizar Este</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rodapé */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>Se nenhuma das opções for exata, você pode fechar e preencher manualmente.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
