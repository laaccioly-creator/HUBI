import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  ShoppingBag,
  Sparkles,
  Layers,
  Check,
  Tag
} from 'lucide-react';
import { Produto, VariacaoProduto } from '../types';

interface ModalDetalhesProdutoCatalogoProps {
  isOpen: boolean;
  onClose: () => void;
  produto: Produto | null;
  categoriaNome?: string;
  corTema?: string;
  onAdicionarAoCarrinho: (produto: Produto, variacao?: VariacaoProduto | null, quantidade?: number) => void;
  onAbrirModalVariacao?: (produto: Produto) => void;
  onPerguntarRubi: (produto: Produto) => void;
  onVerCarrinho: () => void;
  totalItensCarrinho: number;
  valorTotalCarrinho: number;
  isEsgotado: boolean;
}

export const ModalDetalhesProdutoCatalogo: React.FC<ModalDetalhesProdutoCatalogoProps> = ({
  isOpen,
  onClose,
  produto,
  categoriaNome,
  corTema = '#10B981',
  onAdicionarAoCarrinho,
  onAbrirModalVariacao,
  onPerguntarRubi,
  onVerCarrinho,
  totalItensCarrinho,
  valorTotalCarrinho,
  isEsgotado
}) => {
  const [fotoIdx, setFotoIdx] = useState<number>(0);
  const [quantidade, setQuantidade] = useState<number>(1);
  const [adicionadoSucesso, setAdicionadoSucesso] = useState<boolean>(false);
  const [variacaoSelecionada, setVariacaoSelecionada] = useState<VariacaoProduto | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFotoIdx(0);
      setQuantidade(1);
      setAdicionadoSucesso(false);
      if (produto?.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
        setVariacaoSelecionada(produto.variacoes[0]);
      } else {
        setVariacaoSelecionada(null);
      }
    }
  }, [isOpen, produto]);

  if (!isOpen || !produto) return null;

  const fotos = produto.fotos_urls && produto.fotos_urls.length > 0
    ? produto.fotos_urls
    : ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700&auto=format&fit=crop&q=80'];

  const temMaisDeUmaFoto = fotos.length > 1;

  const handleFotoAnterior = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFotoIdx(prev => (prev === 0 ? fotos.length - 1 : prev - 1));
  };

  const handleProximaFoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFotoIdx(prev => (prev === fotos.length - 1 ? 0 : prev + 1));
  };

  const temPromocao = Boolean(produto.promocao_ativa && produto.preco_promocional && Number(produto.preco_promocional) > 0);
  const precoNormal = Number(produto.preco_venda_varejo || 0);
  const precoFinal = temPromocao ? Number(produto.preco_promocional) : precoNormal;

  const handleAdicionar = () => {
    if (isEsgotado) return;

    if (produto.tem_variacoes && (!variacaoSelecionada || !produto.variacoes?.length)) {
      if (onAbrirModalVariacao) {
        onClose();
        onAbrirModalVariacao(produto);
      }
      return;
    }

    onAdicionarAoCarrinho(produto, variacaoSelecionada, quantidade);
    setAdicionadoSucesso(true);
    setTimeout(() => {
      setAdicionadoSucesso(false);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
        
        {/* CABEÇALHO DO MODAL: CATEGORIA E BOTÃO FECHAR */}
        <div className="p-4 sm:px-6 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/95 sticky top-0 z-10">
          <div className="flex items-center gap-2 min-w-0">
            {categoriaNome ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-slate-800 text-emerald-400 border border-slate-700/80 truncate">
                <Tag className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>{categoriaNome}</span>
              </span>
            ) : (
              <span className="text-xs text-slate-400 font-semibold">Detalhes do Produto</span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CORPO DO MODAL ROLÁVEL */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">

          {/* CARROSSEL DE FOTOS COM SETAS ESQUERDA E DIREITA */}
          <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 select-none shadow-inner group">
            <img
              src={fotos[fotoIdx]}
              alt={`${produto.nome} - Foto ${fotoIdx + 1}`}
              className="w-full h-full object-contain sm:object-cover transition duration-300"
            />

            {/* TAG DE ESGOTADO OU PROMOÇÃO */}
            {isEsgotado ? (
              <div className="absolute inset-0 bg-black/75 flex items-center justify-center pointer-events-none">
                <span className="bg-rose-600 text-white font-black text-xs px-4 py-1.5 rounded-full shadow-lg">
                  PRODUTO ESGOTADO
                </span>
              </div>
            ) : temPromocao ? (
              <span className="absolute top-3 left-3 bg-rose-500 text-white font-black text-[10px] px-2.5 py-1 rounded-full shadow-md tracking-wider">
                OFERTA ESPECIAL
              </span>
            ) : null}

            {/* NAVEGAÇÃO DO CARROSSEL: SETAS */}
            {temMaisDeUmaFoto && (
              <>
                <button
                  type="button"
                  onClick={handleFotoAnterior}
                  aria-label="Foto anterior"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-950/80 hover:bg-slate-900 border border-slate-700 text-white flex items-center justify-center transition shadow-lg cursor-pointer opacity-90 hover:opacity-100 hover:scale-105"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={handleProximaFoto}
                  aria-label="Próxima foto"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-950/80 hover:bg-slate-900 border border-slate-700 text-white flex items-center justify-center transition shadow-lg cursor-pointer opacity-90 hover:opacity-100 hover:scale-105"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                {/* INDICADOR DE FOTOS (1 / N) */}
                <div className="absolute bottom-2.5 right-2.5 bg-black/75 backdrop-blur-sm border border-slate-700/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                  {fotoIdx + 1} / {fotos.length}
                </div>

                {/* MINIATURAS OU PONTOS ABAIXO DA IMAGEM */}
                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-full border border-slate-800">
                  {fotos.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setFotoIdx(idx)}
                      className={`h-2 rounded-full transition-all cursor-pointer ${
                        fotoIdx === idx
                          ? 'w-5 bg-emerald-400'
                          : 'w-2 bg-slate-500 hover:bg-slate-300'
                      }`}
                      title={`Ir para foto ${idx + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* NOME DO PRODUTO */}
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-100 leading-tight">
              {produto.nome}
            </h2>
            {produto.codigo_interno && (
              <span className="text-[11px] text-slate-400 mt-1 block">
                Ref: {produto.codigo_interno}
              </span>
            )}
          </div>

          {/* VALOR DO PRODUTO: PROMOÇÃO RISCADO VS NORMAL EM DESTAQUE */}
          <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Preço</span>
              {temPromocao && (
                <span className="text-xs sm:text-sm text-slate-400 line-through font-semibold leading-none">
                  R$ {precoNormal.toFixed(2)}
                </span>
              )}
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl sm:text-3xl font-black" style={{ color: corTema }}>
                  R$ {precoFinal.toFixed(2)}
                </span>
                {temPromocao && (
                  <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                    Desconto Especial
                  </span>
                )}
              </div>
            </div>

            {/* SELETOR DE QUANTIDADE */}
            {!isEsgotado && (
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 rounded-xl p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setQuantidade(prev => Math.max(1, prev - 1))}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center font-bold text-sm transition cursor-pointer"
                  title="Diminuir quantidade"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center text-xs font-black text-white">
                  {quantidade}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantidade(prev => prev + 1)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center font-bold text-sm transition cursor-pointer"
                  title="Aumentar quantidade"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* SE POSSUIR VARIAÇÕES (GRADE) */}
          {produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Escolha a Variação:</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {produto.variacoes.map((v) => {
                  const esgotada = Number(v.quantidade_estoque || 0) <= 0;
                  const isSelected = variacaoSelecionada?.id === v.id;
                  const label = `${v.valor_variacao_1}${v.valor_variacao_2 ? ` / ${v.valor_variacao_2}` : ''}`;

                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={esgotada}
                      onClick={() => setVariacaoSelecionada(v)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-2 ring-emerald-500/30'
                          : esgotada
                          ? 'border-slate-800 bg-slate-900/50 text-slate-600 line-through cursor-not-allowed'
                          : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <span>{label}</span>
                      {esgotada && <span className="text-[10px] text-rose-400 ml-1">(Esgotado)</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* BOTÃO ADICIONAR NO CARRINHO */}
          <button
            type="button"
            disabled={isEsgotado}
            onClick={handleAdicionar}
            className={`w-full py-3.5 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition cursor-pointer ${
              isEsgotado
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                : adicionadoSucesso
                ? 'bg-emerald-600 text-white'
                : 'text-white hover:brightness-110'
            }`}
            style={{ backgroundColor: !isEsgotado && !adicionadoSucesso ? corTema : undefined }}
          >
            {isEsgotado ? (
              <span>Produto Esgotado</span>
            ) : adicionadoSucesso ? (
              <>
                <Check className="w-5 h-5" />
                <span>Adicionado ao Carrinho! ✓</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-5 h-5" />
                <span>Adicionar ao Carrinho • R$ {(precoFinal * quantidade).toFixed(2)}</span>
              </>
            )}
          </button>

          {/* DESCRIÇÃO COMPLETA DO PRODUTO */}
          <div className="space-y-2 pt-1 border-t border-slate-800/80">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Descrição do Produto
            </h4>
            <div className="p-3.5 bg-slate-950/60 rounded-2xl border border-slate-800/60 text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
              {produto.descricao?.trim() || 'Nenhuma descrição detalhada informada para este produto.'}
            </div>
          </div>

          {/* FRASE / BOTÃO INTERATIVO DA RUBI IA */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                onClose();
                onPerguntarRubi(produto);
              }}
              className="w-full p-3.5 rounded-2xl border border-indigo-500/30 bg-indigo-950/20 hover:bg-indigo-950/40 text-left flex items-center justify-between gap-3 group transition cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-indigo-200 block group-hover:text-indigo-100">
                    Dúvida sobre o produto? Pergunte para a Rubi
                  </span>
                  <span className="text-[11px] text-indigo-400/80 block">
                    Nossa IA responde dúvidas sobre tamanhos, fotos e detalhes
                  </span>
                </div>
              </div>
              <span className="text-xs font-black text-indigo-400 group-hover:translate-x-0.5 transition shrink-0">
                Perguntar &rarr;
              </span>
            </button>
          </div>

        </div>

        {/* RODAPÉ DO MODAL: BOTÃO PARA VER O CARRINHO */}
        <div className="p-4 sm:px-6 border-t border-slate-800 bg-slate-900/95 sticky bottom-0 z-10">
          <button
            type="button"
            onClick={() => {
              onClose();
              onVerCarrinho();
            }}
            className="w-full py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 hover:text-white font-bold text-xs sm:text-sm flex items-center justify-between px-5 transition cursor-pointer shadow-md"
          >
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-400" />
              <span>Ver Carrinho</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-slate-300 text-[11px] font-semibold">
                {totalItensCarrinho} {totalItensCarrinho === 1 ? 'item' : 'itens'}
              </span>
              <span className="text-emerald-400 font-black text-xs sm:text-sm">
                R$ {valorTotalCarrinho.toFixed(2)}
              </span>
            </div>
          </button>
        </div>

      </div>
    </div>
  );
};
