import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  FolderPlus,
  Edit2,
  Check,
  Loader2,
  AlertCircle,
  CornerDownRight,
  Tags
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Categoria, Produto } from '../types';
import { ModalConfirmacaoExclusao } from './ModalConfirmacaoExclusao';
import {
  obterArvoreCategorias,
  salvarVinculoCategoriaPaiLocal,
  obterSubcategoriaIdProduto
} from '../utils/categoriasHierarquia';

interface ModalGerenciarCategoriasProps {
  isOpen: boolean;
  onClose: () => void;
  categorias: Categoria[];
  onCategoriasAtualizadas: () => void;
  onCategoriaCriada?: (novaCat: Categoria) => void;
  produtos?: Produto[];
}

interface SubcategoriaChip {
  id?: string;
  nome: string;
}

export const ModalGerenciarCategorias: React.FC<ModalGerenciarCategoriasProps> = ({
  isOpen,
  onClose,
  categorias,
  onCategoriasAtualizadas,
  onCategoriaCriada,
  produtos
}) => {
  const { loja } = useAuth();
  const [novoNome, setNovoNome] = useState('');
  const [inputSubcategoria, setInputSubcategoria] = useState('');
  const [subcategoriasForm, setSubcategoriasForm] = useState<SubcategoriaChip[]>([]);
  const [idsSubcategoriasRemovidas, setIdsSubcategoriasRemovidas] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [categoriaEditando, setCategoriaEditando] = useState<Categoria | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [contagemProdutosPorCat, setContagemProdutosPorCat] = useState<Record<string, number>>({});
  const [modalExclusao, setModalExclusao] = useState<{
    aberto: boolean;
    categoria: Categoria | null;
  }>({
    aberto: false,
    categoria: null
  });

  const arvoreCategorias = useMemo(
    () => obterArvoreCategorias(categorias, loja?.id),
    [categorias, loja?.id]
  );

  useEffect(() => {
    if (!isOpen || !loja?.id) return;

    if (produtos && produtos.length > 0) {
      const mapa: Record<string, number> = {};
      produtos.forEach((p) => {
        if (p.categoria_id) {
          mapa[p.categoria_id] = (mapa[p.categoria_id] || 0) + 1;
        }
        const subId = obterSubcategoriaIdProduto(p, loja.id);
        if (subId && subId !== p.categoria_id) {
          mapa[subId] = (mapa[subId] || 0) + 1;
        }
      });
      setContagemProdutosPorCat(mapa);
      return;
    }

    let ativo = true;
    const carregarContagens = async () => {
      try {
        const { data } = await supabase
          .from('produtos')
          .select('id, categoria_id, subcategoria_id')
          .eq('loja_id', loja.id);
        if (!ativo || !data) return;
        const mapa: Record<string, number> = {};
        data.forEach((p: any) => {
          if (p.categoria_id) {
            mapa[p.categoria_id] = (mapa[p.categoria_id] || 0) + 1;
          }
          const subId = p.subcategoria_id || obterSubcategoriaIdProduto(p as Produto, loja.id);
          if (subId && subId !== p.categoria_id) {
            mapa[subId] = (mapa[subId] || 0) + 1;
          }
        });
        setContagemProdutosPorCat(mapa);
      } catch {
        // Fallback caso subcategoria_id ainda não exista no banco remoto
        const { data } = await supabase
          .from('produtos')
          .select('id, categoria_id')
          .eq('loja_id', loja.id);
        if (!ativo || !data) return;
        const mapa: Record<string, number> = {};
        data.forEach((p: any) => {
          if (p.categoria_id) {
            mapa[p.categoria_id] = (mapa[p.categoria_id] || 0) + 1;
          }
          const subId = obterSubcategoriaIdProduto(p as Produto, loja.id);
          if (subId && subId !== p.categoria_id) {
            mapa[subId] = (mapa[subId] || 0) + 1;
          }
        });
        setContagemProdutosPorCat(mapa);
      }
    };
    carregarContagens();
    return () => {
      ativo = false;
    };
  }, [isOpen, loja?.id, produtos, categorias]);

  const cancelarEdicao = () => {
    setCategoriaEditando(null);
    setNovoNome('');
    setInputSubcategoria('');
    setSubcategoriasForm([]);
    setIdsSubcategoriasRemovidas([]);
    setErroMsg(null);
  };

  const handleFecharModal = () => {
    cancelarEdicao();
    onCategoriasAtualizadas();
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleFecharModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const adicionarChipsSubcategoria = () => {
    const bruto = inputSubcategoria.trim();
    if (!bruto) return;

    const partes = bruto
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (partes.length === 0) return;

    setSubcategoriasForm((prev) => {
      const existentes = new Set(prev.map((item) => item.nome.toLowerCase()));
      const novos: SubcategoriaChip[] = [];
      for (const nome of partes) {
        if (!existentes.has(nome.toLowerCase())) {
          existentes.add(nome.toLowerCase());
          novos.push({ nome });
        }
      }
      return [...prev, ...novos];
    });
    setInputSubcategoria('');
  };

  const removerChipSubcategoria = (index: number) => {
    setSubcategoriasForm((prev) => {
      const alvo = prev[index];
      if (alvo?.id) {
        setIdsSubcategoriasRemovidas((ids) => [...ids, alvo.id!]);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const iniciarEdicaoCategoria = (catPai: Categoria) => {
    setCategoriaEditando(catPai);
    setNovoNome(catPai.nome);
    setInputSubcategoria('');
    setIdsSubcategoriasRemovidas([]);
    const filhas = (catPai.subcategorias || []).map((sub) => ({
      id: sub.id,
      nome: sub.nome
    }));
    setSubcategoriasForm(filhas);
    setErroMsg(null);
  };

  const inserirSubcategoriaComFallback = async (
    lojaId: string,
    nomeSub: string,
    categoriaPaiId: string,
    ordem: number
  ) => {
    const payloadComPai: Record<string, any> = {
      loja_id: lojaId,
      nome: nomeSub,
      categoria_pai_id: categoriaPaiId,
      ordem_exibicao: ordem,
      ativo: true
    };

    const { data, error } = await supabase
      .from('categorias')
      .insert([payloadComPai])
      .select()
      .single();

    if (!error && data) {
      salvarVinculoCategoriaPaiLocal(lojaId, data.id, categoriaPaiId);
      return data as Categoria;
    }

    // Fallback se a coluna categoria_pai_id ainda não foi aplicada na instância remota
    const { data: dataFallback, error: errFallback } = await supabase
      .from('categorias')
      .insert([
        {
          loja_id: lojaId,
          nome: nomeSub,
          ordem_exibicao: ordem,
          ativo: true
        }
      ])
      .select()
      .single();

    if (errFallback) throw errFallback;
    if (dataFallback) {
      salvarVinculoCategoriaPaiLocal(lojaId, dataFallback.id, categoriaPaiId);
    }
    return dataFallback as Categoria;
  };

  const handleSalvarFormularioCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || !novoNome.trim()) return;

    // Se o usuário digitou algo no campo de subcategoria mas não clicou em "+ Adicionar", inclui automaticamente
    let listaSubcategoriasFinal = [...subcategoriasForm];
    if (inputSubcategoria.trim()) {
      const partes = inputSubcategoria
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const existentes = new Set(listaSubcategoriasFinal.map((s) => s.nome.toLowerCase()));
      for (const p of partes) {
        if (!existentes.has(p.toLowerCase())) {
          existentes.add(p.toLowerCase());
          listaSubcategoriasFinal.push({ nome: p });
        }
      }
    }

    try {
      setSalvando(true);
      setErroMsg(null);

      let idCategoriaPai = categoriaEditando?.id || '';
      let categoriaPrincipalSalva: Categoria | null = null;

      if (categoriaEditando) {
        const { data: catAtualizada, error: errUpdate } = await supabase
          .from('categorias')
          .update({ nome: novoNome.trim() })
          .eq('id', categoriaEditando.id)
          .eq('loja_id', loja.id)
          .select()
          .single();

        if (errUpdate) throw errUpdate;
        idCategoriaPai = categoriaEditando.id;
        categoriaPrincipalSalva = (catAtualizada || categoriaEditando) as Categoria;

        // Excluir subcategorias removidas durante a edição
        if (idsSubcategoriasRemovidas.length > 0) {
          await supabase
            .from('categorias')
            .delete()
            .in('id', idsSubcategoriasRemovidas)
            .eq('loja_id', loja.id);
          idsSubcategoriasRemovidas.forEach((subId) =>
            salvarVinculoCategoriaPaiLocal(loja.id, subId, null)
          );
        }
      } else {
        const novaOrdem = categorias.length + 1;
        const { data: novaCat, error: errInsert } = await supabase
          .from('categorias')
          .insert([
            {
              loja_id: loja.id,
              nome: novoNome.trim(),
              ordem_exibicao: novaOrdem,
              ativo: true
            }
          ])
          .select()
          .single();

        if (errInsert) throw errInsert;
        idCategoriaPai = novaCat.id;
        categoriaPrincipalSalva = novaCat as Categoria;
      }

      // Persistir subcategorias novas (que ainda não possuem ID)
      const novasSubcategorias = listaSubcategoriasFinal.filter((s) => !s.id && s.nome.trim());
      let ordemBase = categorias.length + 2;
      for (const sub of novasSubcategorias) {
        await inserirSubcategoriaComFallback(
          loja.id,
          sub.nome.trim(),
          idCategoriaPai,
          ordemBase++
        );
      }

      const eraCriacao = !categoriaEditando;
      cancelarEdicao();
      onCategoriasAtualizadas();
      if (eraCriacao && categoriaPrincipalSalva && onCategoriaCriada) {
        onCategoriaCriada(categoriaPrincipalSalva);
        onClose();
        return;
      }
    } catch (err: any) {
      setErroMsg('Não foi possível salvar a categoria. Verifique os dados e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirModalExclusao = (cat: Categoria) => {
    setModalExclusao({
      aberto: true,
      categoria: cat
    });
  };

  const confirmarExclusaoCategoria = async () => {
    if (!loja?.id || !modalExclusao.categoria) return;
    const cat = modalExclusao.categoria;

    try {
      setExcluindoId(cat.id);
      setErroMsg(null);

      // Se for categoria pai com subcategorias, remove as subcategorias filhas também
      const filhas = (cat.subcategorias || []).map((s) => s.id);
      if (filhas.length > 0) {
        await supabase
          .from('categorias')
          .delete()
          .in('id', filhas)
          .eq('loja_id', loja.id);
        filhas.forEach((idFilha) => salvarVinculoCategoriaPaiLocal(loja.id, idFilha, null));
      }

      const { error } = await supabase
        .from('categorias')
        .delete()
        .eq('id', cat.id)
        .eq('loja_id', loja.id);

      if (error) throw error;
      salvarVinculoCategoriaPaiLocal(loja.id, cat.id, null);

      if (categoriaEditando?.id === cat.id) {
        cancelarEdicao();
      }

      setModalExclusao({ aberto: false, categoria: null });
      onCategoriasAtualizadas();
    } catch (err: any) {
      setErroMsg('Não foi possível excluir a categoria.');
    } finally {
      setExcluindoId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-slate-100 dark:bg-[#08131A] border-2 border-slate-300 dark:border-slate-400 rounded-2xl w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl text-black dark:text-white max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-300 dark:border-slate-700 pb-3 shrink-0">
          <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
            <FolderPlus className="w-5 h-5" />
            <h3 className="font-extrabold text-base text-black dark:text-white">
              Gerenciar Categorias e Subcategorias
            </h3>
          </div>
          <button
            type="button"
            onClick={handleFecharModal}
            className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {erroMsg && (
          <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border-2 border-rose-300 dark:border-rose-500/30 rounded-xl flex items-center gap-2 text-xs font-semibold text-rose-800 dark:text-rose-300 shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{erroMsg}</span>
          </div>
        )}

        {/* Formulário Integrado de Categoria e Subcategorias */}
        <form
          onSubmit={handleSalvarFormularioCategoria}
          className="space-y-3 bg-white dark:bg-[#050C10] border-2 border-slate-300 dark:border-slate-700 rounded-xl p-3.5 shrink-0"
        >
          <div className="flex items-center justify-between">
            <label className="text-xs font-extrabold text-black dark:text-white uppercase tracking-wider">
              {categoriaEditando ? `Editando Categoria: ${categoriaEditando.nome}` : 'Nome da Categoria Principal'}
            </label>
            {categoriaEditando && (
              <button
                type="button"
                onClick={cancelarEdicao}
                className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                Cancelar edição
              </button>
            )}
          </div>

          <input
            type="text"
            required
            placeholder="Ex: Bebidas, Hortifrúti, Gelo, Carvão..."
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            className="w-full bg-slate-50 dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 text-black dark:text-white placeholder-slate-400 rounded-xl px-3.5 py-2 text-xs font-semibold focus:border-emerald-600 dark:focus:border-emerald-500 focus:outline-none"
          />

          {/* Seção Reativa: Subcategorias vinculadas (Opcional) */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Tags className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Subcategorias vinculadas (Opcional)</span>
              </label>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Separe por vírgula ou Enter
              </span>
            </div>

            {subcategoriasForm.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800">
                {subcategoriasForm.map((sub, idx) => (
                  <span
                    key={`${sub.id || 'novo'}-${sub.nome}-${idx}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30"
                  >
                    <span>{sub.nome}</span>
                    <button
                      type="button"
                      onClick={() => removerChipSubcategoria(idx)}
                      className="text-emerald-700 dark:text-emerald-300 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                      title="Remover subcategoria"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: Cervejas, Destilados, Refrigerantes..."
                value={inputSubcategoria}
                onChange={(e) => setInputSubcategoria(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    adicionarChipsSubcategoria();
                  }
                }}
                className="flex-1 bg-slate-50 dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 text-black dark:text-white placeholder-slate-400 rounded-xl px-3 py-1.5 text-xs font-semibold focus:border-emerald-600 dark:focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={adicionarChipsSubcategoria}
                className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-black dark:text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Adicionar</span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={salvando || !novoNome.trim()}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer border border-emerald-500"
          >
            {salvando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>{categoriaEditando ? 'Salvar Alterações da Categoria' : 'Salvar Categoria'}</span>
          </button>
        </form>

        {/* Lista Geral de Categorias e Subcategorias */}
        <div className="space-y-2 pt-1 flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between text-xs text-black dark:text-slate-300 font-bold shrink-0">
            <span>Categorias Cadastradas:</span>
            <span>{arvoreCategorias.length} principais ({categorias.length} total)</span>
          </div>

          <div className="overflow-y-auto space-y-2 pr-1 flex-1">
            {arvoreCategorias.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500 font-medium">
                Nenhuma categoria criada ainda.
              </div>
            ) : (
              arvoreCategorias.map((cat) => {
                const subcategorias = cat.subcategorias || [];
                const qtdDiretaPai = contagemProdutosPorCat[cat.id] || 0;
                const qtdFilhas = subcategorias.reduce(
                  (acc, sub) => acc + (contagemProdutosPorCat[sub.id] || 0),
                  0
                );
                const totalPai = Math.max(qtdDiretaPai, qtdFilhas);

                return (
                  <div
                    key={cat.id}
                    className="bg-white dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs space-y-2 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-extrabold text-sm text-black dark:text-white line-clamp-2 break-words" title={cat.nome}>
                            {cat.nome}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                            {totalPai} {totalPai === 1 ? 'item' : 'itens'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        <button
                          type="button"
                          onClick={() => iniciarEdicaoCategoria(cat)}
                          className="p-1.5 text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 transition cursor-pointer"
                          title="Editar Categoria e Subcategorias"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={excluindoId === cat.id}
                          onClick={() => abrirModalExclusao(cat)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 transition disabled:opacity-50 cursor-pointer"
                          title="Excluir Categoria"
                        >
                          {excluindoId === cat.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Subcategorias Indentadas Abaixo da Categoria Mãe */}
                    {subcategorias.length > 0 && (
                      <div className="pl-3 border-l-2 border-emerald-500/40 space-y-1 pt-1">
                        {subcategorias.map((sub) => {
                          const qtdSub = contagemProdutosPorCat[sub.id] || 0;
                          return (
                            <div
                              key={sub.id}
                              className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-900/70 text-[11px]"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <CornerDownRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                                  {sub.nome}
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                                  ({qtdSub})
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={excluindoId === sub.id}
                                onClick={() => abrirModalExclusao(sub)}
                                className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition cursor-pointer"
                                title="Excluir Subcategoria"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <ModalConfirmacaoExclusao
        isOpen={modalExclusao.aberto}
        onClose={() => setModalExclusao({ aberto: false, categoria: null })}
        onConfirmar={confirmarExclusaoCategoria}
        titulo="Excluir Categoria"
        mensagem="Tem certeza que deseja remover esta categoria? Os produtos vinculados a ela não serão excluídos."
        itemNome={modalExclusao.categoria?.nome}
        carregando={Boolean(excluindoId)}
      />
    </div>
  );
};
