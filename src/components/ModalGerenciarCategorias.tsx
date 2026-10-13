import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  FolderPlus,
  Edit2,
  Check,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Categoria } from '../types';
import { ModalConfirmacaoExclusao } from './ModalConfirmacaoExclusao';

interface ModalGerenciarCategoriasProps {
  isOpen: boolean;
  onClose: () => void;
  categorias: Categoria[];
  onCategoriasAtualizadas: () => void;
  onCategoriaCriada?: (novaCat: Categoria) => void;
}

export const ModalGerenciarCategorias: React.FC<ModalGerenciarCategoriasProps> = ({
  isOpen,
  onClose,
  categorias,
  onCategoriasAtualizadas,
  onCategoriaCriada
}) => {
  const { loja } = useAuth();
  const [novoNome, setNovoNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [categoriaEditando, setCategoriaEditando] = useState<Categoria | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState('');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [modalExclusao, setModalExclusao] = useState<{
    aberto: boolean;
    categoria: Categoria | null;
  }>({
    aberto: false,
    categoria: null
  });

  if (!isOpen) return null;

  const handleCriarCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || !novoNome.trim()) return;

    try {
      setSalvando(true);
      setErroMsg(null);

      const novaOrdem = categorias.length + 1;
      const { data, error } = await supabase
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

      if (error) throw error;

      setNovoNome('');
      onCategoriasAtualizadas();
      if (data && onCategoriaCriada) {
        onCategoriaCriada(data as Categoria);
      }
    } catch (err: any) {
      setErroMsg(err.message || 'Erro ao criar categoria.');
    } finally {
      setSalvando(false);
    }
  };

  const handleSalvarEdicao = async () => {
    if (!categoriaEditando || !nomeEdicao.trim()) return;

    try {
      setSalvandoEdicao(true);
      setErroMsg(null);

      const { error } = await supabase
        .from('categorias')
        .update({ nome: nomeEdicao.trim() })
        .eq('id', categoriaEditando.id);

      if (error) throw error;

      setCategoriaEditando(null);
      setNomeEdicao('');
      onCategoriasAtualizadas();
    } catch (err: any) {
      setErroMsg(err.message || 'Erro ao atualizar categoria.');
    } finally {
      setSalvandoEdicao(false);
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

      const { error } = await supabase
        .from('categorias')
        .delete()
        .eq('id', cat.id)
        .eq('loja_id', loja.id);

      if (error) throw error;

      setModalExclusao({ aberto: false, categoria: null });
      onCategoriasAtualizadas();
    } catch (err: any) {
      setErroMsg(err.message || 'Erro ao excluir categoria.');
    } finally {
      setExcluindoId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-slate-100 dark:bg-[#08131A] border-2 border-slate-300 dark:border-slate-400 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl text-black dark:text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-300 dark:border-slate-700 pb-3">
          <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
            <FolderPlus className="w-5 h-5" />
            <h3 className="font-extrabold text-base text-black dark:text-white">Gerenciar Categorias</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {erroMsg && (
          <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border-2 border-rose-300 dark:border-rose-500/30 rounded-xl flex items-center gap-2 text-xs font-semibold text-rose-800 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{erroMsg}</span>
          </div>
        )}

        {/* Formulário Nova Categoria */}
        <form onSubmit={handleCriarCategoria} className="space-y-2">
          <label className="text-xs font-bold text-black dark:text-white block">Criar Nova Categoria:</label>
          <div className="flex gap-2">
            <input
              type="text"
              required
              placeholder="Ex: Bebidas, Roupas, Alimentos..."
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              className="flex-1 bg-white dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 text-black dark:text-white placeholder-slate-400 rounded-xl px-3.5 py-2 text-xs font-semibold focus:border-emerald-600 dark:focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={salvando}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs shadow-md flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer border border-emerald-500"
            >
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Adicionar</span>
            </button>
          </div>
        </form>

        {/* Lista de Categorias */}
        <div className="space-y-2 pt-2 border-t border-slate-300 dark:border-slate-700">
          <div className="flex items-center justify-between text-xs text-black dark:text-slate-300 font-bold">
            <span>Categorias Cadastradas:</span>
            <span>{categorias.length} categorias</span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
            {categorias.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500 font-medium">
                Nenhuma categoria criada ainda.
              </div>
            ) : (
              categorias.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between bg-white dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs group hover:border-slate-400 dark:hover:border-slate-600 transition"
                >
                  {categoriaEditando?.id === cat.id ? (
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <input
                        type="text"
                        value={nomeEdicao}
                        onChange={(e) => setNomeEdicao(e.target.value)}
                        className="flex-1 bg-white dark:bg-[#000000] border-2 border-emerald-500 text-black dark:text-white rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        disabled={salvandoEdicao}
                        onClick={handleSalvarEdicao}
                        className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
                        title="Salvar"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCategoriaEditando(null)}
                        className="p-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white cursor-pointer"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-bold text-black dark:text-white">{cat.nome}</span>
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            setCategoriaEditando(cat);
                            setNomeEdicao(cat.nome);
                          }}
                          className="p-1 text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 rounded transition cursor-pointer"
                          title="Editar Nome"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={excluindoId === cat.id}
                          onClick={() => abrirModalExclusao(cat)}
                          className="p-1 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 rounded transition disabled:opacity-50 cursor-pointer"
                          title="Excluir Categoria"
                        >
                          {excluindoId === cat.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Botão Fechar */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-white hover:bg-slate-50 dark:bg-[#000000] dark:hover:bg-slate-900 text-black dark:text-white border-2 border-slate-300 dark:border-slate-700 text-xs font-bold transition cursor-pointer"
        >
          Concluir
        </button>
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
