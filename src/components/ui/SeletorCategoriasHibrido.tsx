import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Layers, ChevronDown, ChevronRight, X, Check } from 'lucide-react';
import { Categoria, Produto } from '../../types';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import {
  obterArvoreCategorias,
  obterCategoriaPaiId,
  obterSubcategoriaIdProduto,
  CategoriaComFilhas
} from '../../utils/categoriasHierarquia';

export interface OpcaoExtraCategoria {
  id: string;
  rotulo: string;
}

interface SeletorCategoriasHibridoProps {
  categorias: Categoria[];
  produtos?: Produto[];
  valorSelecionado: string;
  aoSelecionar: (idCategoriaOuSub: string) => void;
  valorTodas?: string;
  rotuloTodas?: string;
  opcoesExtrasTopo?: OpcaoExtraCategoria[];
  lojaId?: string | null;
  isDark?: boolean;
  exibirContagem?: boolean;
  apenasGavetaMobile?: boolean;
  classNameBotao?: string;
  idOverlay?: string;
}

export const SeletorCategoriasHibrido: React.FC<SeletorCategoriasHibridoProps> = ({
  categorias,
  produtos = [],
  valorSelecionado,
  aoSelecionar,
  valorTodas = 'todas',
  rotuloTodas = 'Todas as Categorias',
  opcoesExtrasTopo = [],
  lojaId,
  isDark = true,
  exibirContagem = false,
  apenasGavetaMobile = false,
  classNameBotao,
  idOverlay = 'seletor-categorias-hibrido'
}) => {
  const [aberto, setAberto] = useState(false);
  const [categoriaHoverId, setCategoriaHoverId] = useState<string | null>(null);
  const [acordeaoExpandidoIds, setAcordeaoExpandidoIds] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  useRegisterOverlay(aberto, () => setAberto(false), idOverlay, 'drawer');

  const arvoreCategorias = useMemo(
    () => obterArvoreCategorias(categorias, lojaId),
    [categorias, lojaId]
  );

  // Fecha menu desktop ao clicar fora
  useEffect(() => {
    if (!aberto) return;
    const handleClickFora = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // Verifica se o clique não foi dentro da gaveta mobile (portal/fixed)
        const targetEl = e.target as HTMLElement;
        if (targetEl.closest('[data-gaveta-categorias-mobile="true"]')) return;
        setAberto(false);
      }
    };
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [aberto]);

  // Quando abre a gaveta, se uma subcategoria estiver selecionada, já expande a categoria pai
  useEffect(() => {
    if (!aberto) {
      setCategoriaHoverId(null);
      return;
    }
    const catAtual = categorias.find((c) => c.id === valorSelecionado);
    if (catAtual) {
      const paiId = obterCategoriaPaiId(catAtual, lojaId);
      if (paiId) {
        setAcordeaoExpandidoIds((prev) => ({ ...prev, [paiId]: true }));
        setCategoriaHoverId(paiId);
      } else {
        setCategoriaHoverId(catAtual.id);
      }
    }
  }, [aberto, valorSelecionado, categorias, lojaId]);

  const contarProdutosDaCategoria = (cat: CategoriaComFilhas): number => {
    if (!produtos || produtos.length === 0) return 0;
    const idsFilhas = new Set(cat.subcategorias.map((s) => s.id));
    return produtos.filter((p) => {
      const subId = obterSubcategoriaIdProduto(p, lojaId);
      return p.categoria_id === cat.id || (subId && idsFilhas.has(subId)) || (p.categoria_id && idsFilhas.has(p.categoria_id));
    }).length;
  };

  const contarProdutosDaSubcategoria = (subId: string): number => {
    if (!produtos || produtos.length === 0) return 0;
    return produtos.filter((p) => {
      const sId = obterSubcategoriaIdProduto(p, lojaId);
      return sId === subId || p.categoria_id === subId;
    }).length;
  };

  const rotuloAtivo = useMemo(() => {
    if (valorSelecionado === valorTodas) {
      return exibirContagem && produtos.length > 0
        ? `${rotuloTodas} (${produtos.length})`
        : rotuloTodas;
    }
    const extra = opcoesExtrasTopo.find((op) => op.id === valorSelecionado);
    if (extra) return extra.rotulo;

    const catEncontrada = categorias.find((c) => c.id === valorSelecionado);
    if (!catEncontrada) return rotuloTodas;

    const paiId = obterCategoriaPaiId(catEncontrada, lojaId);
    if (paiId) {
      const pai = categorias.find((c) => c.id === paiId);
      return pai ? `${pai.nome} › ${catEncontrada.nome}` : catEncontrada.nome;
    }
    return catEncontrada.nome;
  }, [valorSelecionado, valorTodas, rotuloTodas, opcoesExtrasTopo, categorias, lojaId, exibirContagem, produtos.length]);

  const handleSelecionar = (id: string) => {
    aoSelecionar(id);
    setAberto(false);
  };

  const toggleAcordeaoMobile = (catId: string) => {
    setAcordeaoExpandidoIds((prev) => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  const categoriaHoverObj = useMemo(
    () => arvoreCategorias.find((c) => c.id === categoriaHoverId) || null,
    [arvoreCategorias, categoriaHoverId]
  );

  return (
    <div ref={containerRef} className={`relative w-full ${aberto ? 'z-[999] isolate' : ''}`}>
      {/* Botão Disparador */}
      <button
        type="button"
        onClick={() => setAberto((prev) => !prev)}
        className={
          classNameBotao ||
          `w-full flex items-center justify-between gap-2 ${
            isDark
              ? 'bg-[#000000] border border-slate-700 text-slate-100 hover:border-slate-600'
              : 'bg-white border-2 border-slate-300 text-slate-900 hover:border-slate-400'
          } focus:border-emerald-500 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold focus:outline-none transition cursor-pointer relative text-left`
        }
        title="Filtrar produtos por categoria ou subcategoria"
      >
        <Layers className="w-4 h-4 text-emerald-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
        <span className="truncate block flex-1">{rotuloAtivo}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
            aberto ? 'rotate-180 text-emerald-400' : ''
          }`}
        />
      </button>

      {/* =====================================================================
          1. DESKTOP: MENU DROPDOWN COM FLYOUT LATERAL HOVER À DIREITA
      ===================================================================== */}
      {aberto && !apenasGavetaMobile && (
        <div
          className={`hidden md:flex absolute left-0 top-full mt-1.5 z-[999] isolate rounded-2xl shadow-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 ${
            isDark
              ? 'bg-slate-900 border-slate-700 text-slate-100'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          {/* Coluna Principal de Categorias */}
          <div className="w-64 max-h-[380px] overflow-y-auto p-1.5 space-y-0.5 bg-white dark:bg-slate-900 rounded-2xl">
            {/* Opção Fixa: Todas as Categorias */}
            <button
              type="button"
              onMouseEnter={() => setCategoriaHoverId(null)}
              onClick={() => handleSelecionar(valorTodas)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                valorSelecionado === valorTodas
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : isDark
                  ? 'text-slate-100 hover:bg-slate-800 hover:text-emerald-400'
                  : 'text-slate-800 dark:text-slate-100 hover:bg-emerald-50 dark:hover:bg-slate-800 hover:text-emerald-700'
              }`}
            >
              <span className="truncate">{rotuloTodas}</span>
              {exibirContagem && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    valorSelecionado === valorTodas
                      ? 'bg-white/20 text-white'
                      : isDark
                      ? 'bg-slate-800 text-slate-400'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {produtos.length}
                </span>
              )}
            </button>

            {/* Opções Extras no Topo (ex: Destaques) */}
            {opcoesExtrasTopo.map((extra) => (
              <button
                key={extra.id}
                type="button"
                onMouseEnter={() => setCategoriaHoverId(null)}
                onClick={() => handleSelecionar(extra.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  valorSelecionado === extra.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : isDark
                    ? 'text-slate-100 hover:bg-slate-800 hover:text-emerald-400'
                    : 'text-slate-800 dark:text-slate-100 hover:bg-emerald-50 dark:hover:bg-slate-800 hover:text-emerald-700'
                }`}
              >
                <span className="truncate">{extra.rotulo}</span>
              </button>
            ))}

            <div className={`my-1 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`} />

            {/* Lista de Categorias Principais */}
            {arvoreCategorias.map((cat) => {
              const temSub = cat.subcategorias.length > 0;
              const isSelecionada =
                valorSelecionado === cat.id ||
                cat.subcategorias.some((s) => s.id === valorSelecionado);
              const isHovered = categoriaHoverId === cat.id;
              const qtd = contarProdutosDaCategoria(cat);

              return (
                <button
                  key={cat.id}
                  type="button"
                  onMouseEnter={() => setCategoriaHoverId(cat.id)}
                  onClick={() => handleSelecionar(cat.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    isSelecionada
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : isHovered
                      ? isDark
                        ? 'bg-slate-800 text-emerald-400'
                        : 'bg-emerald-50 text-emerald-700'
                      : isDark
                      ? 'text-slate-100 hover:bg-slate-800 hover:text-emerald-400'
                      : 'text-slate-800 dark:text-slate-100 hover:bg-emerald-50 dark:hover:bg-slate-800 hover:text-emerald-700'
                  }`}
                >
                  <span className="truncate text-left flex-1">{cat.nome}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {exibirContagem && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          isSelecionada
                            ? 'bg-white/20 text-white'
                            : isDark
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {qtd}
                      </span>
                    )}
                    {temSub && <ChevronRight className="w-3.5 h-3.5 opacity-80" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Flyout Flutuante Lateral Direito (quando a categoria em hover possui subcategorias) */}
          {categoriaHoverObj && categoriaHoverObj.subcategorias.length > 0 && (
            <div
              className={`w-60 max-h-[380px] overflow-y-auto p-1.5 border-l space-y-0.5 rounded-r-2xl shadow-2xl z-[999] isolate animate-in fade-in slide-in-from-left-1 duration-150 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-slate-100'
                  : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <button
                type="button"
                onClick={() => handleSelecionar(categoriaHoverObj.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  valorSelecionado === categoriaHoverObj.id
                    ? 'bg-emerald-600 text-white'
                    : isDark
                    ? 'text-emerald-400 hover:bg-slate-800'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <span className="truncate">Todas de {categoriaHoverObj.nome}</span>
                {valorSelecionado === categoriaHoverObj.id && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>

              <div className={`my-1 border-t ${isDark ? 'border-slate-700' : 'border-slate-200'}`} />

              {categoriaHoverObj.subcategorias.map((sub) => {
                const subAtiva = valorSelecionado === sub.id;
                const qtdSub = contarProdutosDaSubcategoria(sub.id);
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => handleSelecionar(sub.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                      subAtiva
                        ? 'bg-emerald-600 text-white font-bold'
                        : isDark
                        ? 'text-slate-100 hover:bg-slate-800 hover:text-emerald-400'
                        : 'text-slate-800 dark:text-slate-100 hover:bg-emerald-50 dark:hover:bg-slate-800 hover:text-emerald-700'
                    }`}
                  >
                    <span className="truncate text-left flex-1">{sub.nome}</span>
                    {exibirContagem && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          subAtiva
                            ? 'bg-white/20 text-white'
                            : isDark
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-slate-200/70 text-slate-600'
                        }`}
                      >
                        {qtdSub}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          2. MOBILE: GAVETA LATERAL DESLIZANTE ESQUERDA COM ACORDEÃO VERTICAL
      ===================================================================== */}
      {aberto && (
        <div
          data-gaveta-categorias-mobile="true"
          className={`${apenasGavetaMobile ? 'block' : 'block md:hidden'} fixed inset-0 z-[999] isolate`}
        >
          {/* Backdrop escuro */}
          <div
            onClick={() => setAberto(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          />

          {/* Gaveta Lateral Esquerda */}
          <div
            className="fixed inset-y-0 left-0 w-[80%] max-w-xs bg-white dark:bg-slate-900 shadow-2xl z-[999] flex flex-col animate-in slide-in-from-left duration-200 border-r border-slate-200 dark:border-slate-700"
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Categorias
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                aria-label="Fechar gaveta de categorias"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista Vertical com Acordeão */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {/* Opção Fixa no Topo: Todas as Categorias */}
              <button
                type="button"
                onClick={() => handleSelecionar(valorTodas)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  valorSelecionado === valorTodas
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <span>{rotuloTodas}</span>
                {valorSelecionado === valorTodas && <Check className="w-4 h-4 shrink-0" />}
              </button>

              {/* Opções Extras (ex: Destaques no PDV Mobile) */}
              {opcoesExtrasTopo.map((extra) => (
                <button
                  key={extra.id}
                  type="button"
                  onClick={() => handleSelecionar(extra.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    valorSelecionado === extra.id
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <span>{extra.rotulo}</span>
                  {valorSelecionado === extra.id && <Check className="w-4 h-4 shrink-0" />}
                </button>
              ))}

              <div className="my-2 border-t border-slate-200 dark:border-slate-800" />

              {arvoreCategorias.map((cat) => {
                const temSub = cat.subcategorias.length > 0;
                const expandido = Boolean(acordeaoExpandidoIds[cat.id]);
                const isCatAtiva = valorSelecionado === cat.id;
                const temSubAtiva = cat.subcategorias.some((s) => s.id === valorSelecionado);

                return (
                  <div key={cat.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (temSub) {
                          toggleAcordeaoMobile(cat.id);
                        } else {
                          handleSelecionar(cat.id);
                        }
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                        isCatAtiva || temSubAtiva
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-bold'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="truncate text-left flex-1">{cat.nome}</span>
                      {temSub ? (
                        expandido ? (
                          <ChevronDown className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                        )
                      ) : isCatAtiva ? (
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : null}
                    </button>

                    {/* Subcategorias Recuadas (Acordeão) */}
                    {temSub && expandido && (
                      <div className="ml-3.5 pl-3 border-l-2 border-emerald-500/30 space-y-1 py-0.5 animate-in fade-in duration-150">
                        <button
                          type="button"
                          onClick={() => handleSelecionar(cat.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                            isCatAtiva
                              ? 'bg-emerald-600 text-white'
                              : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
                          }`}
                        >
                          <span className="truncate">Todas de {cat.nome}</span>
                          {isCatAtiva && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>

                        {cat.subcategorias.map((sub) => {
                          const subAtiva = valorSelecionado === sub.id;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => handleSelecionar(sub.id)}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition cursor-pointer ${
                                subAtiva
                                  ? 'bg-emerald-600 text-white font-bold'
                                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 font-medium'
                              }`}
                            >
                              <span className="truncate text-left flex-1">{sub.nome}</span>
                              {subAtiva && <Check className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
