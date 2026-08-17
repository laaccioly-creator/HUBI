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

  const handleExcluirCategoria = async (catId: string) => {
    if (!confirm('Deseja realmente remover esta categoria?')) return;

    try {
      setExcluindoId(catId);
      setErroMsg(null);

      const { error } = await supabase
        .from('categorias')
        .delete()
        .eq('id', catId);

      if (error) throw error;

      onCategoriasAtualizadas();
    } catch (err: any) {
      setErroMsg(err.message || 'Erro ao excluir categoria.');
    } finally {
      setExcluindoId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <FolderPlus className="w-5 h-5" />
            <h3 className="font-bold text-base text-slate-100">Gerenciar Categorias</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {erroMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{erroMsg}</span>
          </div>
        )}

        {/* Formulário Nova Categoria */}
        <form onSubmit={handleCriarCategoria} className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">Criar Nova Categoria:</label>
          <div className="flex gap-2">
            <input
              type="text"
              required
              placeholder="Ex: Bebidas, Roupas, Alimentos..."
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={salvando}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-md shadow-emerald-500/25 flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
            >
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Adicionar</span>
            </button>
          </div>
        </form>

        {/* Lista de Categorias */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">Categorias Cadastradas:</span>
            <span>{categorias.length} categorias</span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
            {categorias.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">
                Nenhuma categoria criada ainda.
              </div>
            ) : (
              categorias.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between bg-slate-950/70 border border-slate-800/80 rounded-xl px-3.5 py-2 text-xs group hover:border-slate-700 transition"
                >
                  {categoriaEditando?.id === cat.id ? (
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <input
                        type="text"
                        value={nomeEdicao}
                        onChange={(e) => setNomeEdicao(e.target.value)}
                        className="flex-1 bg-slate-800 border border-emerald-500 rounded-lg px-2.5 py-1 text-xs text-slate-100 focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        disabled={salvandoEdicao}
                        onClick={handleSalvarEdicao}
                        className="p-1 rounded bg-emerald-500 text-white hover:bg-emerald-400"
                        title="Salvar"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCategoriaEditando(null)}
                        className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-medium text-slate-200">{cat.nome}</span>
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            setCategoriaEditando(cat);
                            setNomeEdicao(cat.nome);
                          }}
                          className="p-1 text-slate-400 hover:text-emerald-400 rounded transition"
                          title="Editar Nome"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={excluindoId === cat.id}
                          onClick={() => handleExcluirCategoria(cat.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded transition disabled:opacity-50"
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
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
        >
          Concluir
        </button>
      </div>
    </div>
  );
};
