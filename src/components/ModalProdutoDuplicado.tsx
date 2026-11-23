import React from 'react';
import { AlertTriangle, Package, RefreshCw, PlusCircle, X } from 'lucide-react';
import type { Produto } from '../types';
import type { MotivoDuplicidade } from '../utils/produtoDuplicado';
import { formatarMoeda } from '../utils/formatters';
import { useTheme } from '../contexts/ThemeContext';
import { useRegisterOverlay } from '../hooks/useRegisterOverlay';

export interface ModalProdutoDuplicadoProps {
  isOpen: boolean;
  produtoExistente: Produto | null;
  motivo: MotivoDuplicidade;
  categoriaNome?: string;
  onAtualizarExistente: (produto: Produto) => void;
  onCadastrarNovo: () => void;
  onCancelar: () => void;
}

function obterSubtituloPorMotivo(motivo: MotivoDuplicidade): string {
  switch (motivo) {
    case 'codigo_barras':
      return 'Encontramos um item ativo nesta loja utilizando o mesmo código de barras (EAN).';
    case 'nome_identico':
      return 'Encontramos um item ativo nesta loja com nome idêntico ao informado.';
    case 'nome_similar':
    default:
      return 'Encontramos um item ativo nesta loja com nome, marca ou especificação equivalente.';
  }
}

export const ModalProdutoDuplicado: React.FC<ModalProdutoDuplicadoProps> = ({
  isOpen,
  produtoExistente,
  motivo,
  categoriaNome,
  onAtualizarExistente,
  onCadastrarNovo,
  onCancelar
}) => {
  const { isDark } = useTheme();

  useRegisterOverlay(isOpen, onCancelar, 'modal-produto-duplicado', 'modal');

  if (!isOpen || !produtoExistente) return null;

  const fotoUrl = Array.isArray(produtoExistente.fotos_urls) ? produtoExistente.fotos_urls[0] : undefined;
  const precoVenda = Number(produtoExistente.preco_venda_varejo || 0);
  const estoqueAtual = Number(produtoExistente.quantidade_estoque ?? 0);
  const nomeCategoria = categoriaNome || produtoExistente.categoria?.nome || 'Sem categoria';

  return (
    <div className="fixed inset-0 z-[99990] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 ${
          isDark
            ? 'bg-[#000000] border border-slate-700 text-white'
            : 'bg-white border-2 border-slate-300 text-black'
        }`}
      >
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Fechar"
          title="Fechar"
          className={`absolute top-4 right-4 p-2 rounded-xl border transition cursor-pointer ${
            isDark
              ? 'border-slate-700 bg-zinc-900 text-slate-200 hover:bg-slate-800'
              : 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
          }`}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-3 pr-8">
          <div
            className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${
              isDark
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                : 'bg-amber-50 border-amber-300 text-amber-600'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className={`text-base font-black leading-snug ${isDark ? 'text-white' : 'text-black'}`}>
              Produto já cadastrado nesta loja
            </h3>
            <p className={`text-sm mt-1 leading-relaxed font-medium ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
              {obterSubtituloPorMotivo(motivo)}
            </p>
          </div>
        </div>

        <div
          className={`rounded-2xl p-3.5 border flex items-center gap-3.5 ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
          }`}
        >
          <div
            className={`w-16 h-16 rounded-xl border overflow-hidden shrink-0 flex items-center justify-center ${
              isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
            }`}
          >
            {fotoUrl ? (
              <img src={fotoUrl} alt={produtoExistente.nome} className="w-full h-full object-cover" />
            ) : (
              <Package className={`w-7 h-7 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <p className={`font-black text-sm leading-snug line-clamp-2 ${isDark ? 'text-white' : 'text-black'}`}>
              {produtoExistente.nome}
            </p>
            <p className={`text-xs font-semibold truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Categoria: <span className="font-bold">{nomeCategoria}</span>
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs pt-0.5">
              <span className={`font-extrabold ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                Preço: {formatarMoeda(precoVenda)}
              </span>
              <span className={`font-bold ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                Estoque: {estoqueAtual} {produtoExistente.tipo_unidade || 'un'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => onAtualizarExistente(produtoExistente)}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-300 hover:bg-emerald-400 border border-emerald-400 text-black font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.99]"
          >
            <RefreshCw className="w-4 h-4 shrink-0" />
            <span>Atualizar Produto Existente</span>
          </button>

          <button
            type="button"
            onClick={onCadastrarNovo}
            className={`w-full min-h-[42px] px-4 py-2.5 rounded-xl border font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
              isDark
                ? 'bg-zinc-900 hover:bg-slate-800 border-slate-700 text-white'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black'
            }`}
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>Cadastrar Novo Mesmo Assim</span>
          </button>

          <button
            type="button"
            onClick={onCancelar}
            className={`w-full min-h-[40px] px-4 py-2 rounded-xl border font-semibold text-sm transition cursor-pointer ${
              isDark
                ? 'bg-transparent hover:bg-slate-900 border-slate-800 text-slate-300'
                : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
            }`}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
