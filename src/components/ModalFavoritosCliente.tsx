import React, { useEffect, useState } from 'react';
import { X, Star, ShoppingBag, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { Produto, ClienteFavorito } from '../types';
import { ClienteCatalogoService } from '../services/clienteCatalogoService';

interface ModalFavoritosClienteProps {
  isOpen: boolean;
  onClose: () => void;
  lojaId: string;
  clienteId: string;
  corTema?: string;
  onAdicionarAoCarrinho: (produto: Produto) => void;
  onRemoverFavorito: (produtoId: string) => void;
  onExplorarCatalogo?: () => void;
}

export const ModalFavoritosCliente: React.FC<ModalFavoritosClienteProps> = ({
  isOpen,
  onClose,
  lojaId,
  clienteId,
  corTema = '#10B981',
  onAdicionarAoCarrinho,
  onRemoverFavorito,
  onExplorarCatalogo
}) => {
  const [favoritos, setFavoritos] = useState<ClienteFavorito[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregarFavoritos = async () => {
    if (!lojaId || !clienteId) return;
    try {
      setCarregando(true);
      setErro(null);
      const data = await ClienteCatalogoService.listarFavoritosCompletos(lojaId, clienteId);
      setFavoritos(data);
    } catch {
      setErro('Não foi possível carregar seus produtos favoritos.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      carregarFavoritos();
    }
  }, [isOpen, lojaId, clienteId]);

  if (!isOpen) return null;

  const handleRemover = async (produtoId: string) => {
    try {
      await ClienteCatalogoService.alternarFavorito(lojaId, clienteId, produtoId);
      setFavoritos((prev) => prev.filter((f) => f.produto_id !== produtoId));
      onRemoverFavorito(produtoId);
    } catch {
      // Ignore
    }
  };

  const formatarPreco = (val?: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border-2 border-slate-700/80 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-amber-400 bg-amber-400/10 border border-amber-400/20 shadow"
            >
              <Star className="w-5 h-5 fill-amber-400" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-100 flex items-center gap-2">
                <span>Meus Favoritos</span>
                {favoritos.length > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-amber-500/20">
                    {favoritos.length}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">Produtos que você marcou com a estrelinha</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de Erro */}
        {erro && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{erro}</span>
          </div>
        )}

        {/* Lista de Produtos Favoritados */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {carregando ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span className="text-xs">Carregando favoritos...</span>
            </div>
          ) : favoritos.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-amber-400/40">
                <Star className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-200">Sua lista de favoritos está vazia</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Toque na estrelinha nos produtos do catálogo para salvá-los aqui e comprar quando quiser.
                </p>
              </div>
              {onExplorarCatalogo && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onExplorarCatalogo();
                  }}
                  className="mt-2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow transition hover:brightness-110 cursor-pointer"
                  style={{ backgroundColor: corTema }}
                >
                  Explorar Catálogo
                </button>
              )}
            </div>
          ) : (
            favoritos.map((fav) => {
              const prod = fav.produto;
              if (!prod) return null;

              return (
                <div
                  key={fav.id}
                  className="bg-slate-950/60 border border-slate-800 hover:border-slate-700 rounded-2xl p-3 flex items-center gap-3 transition"
                >
                  {/* Foto do Produto */}
                  <div className="w-16 h-16 rounded-xl bg-slate-900 border border-slate-800 shrink-0 overflow-hidden flex items-center justify-center">
                    {prod.fotos_urls && prod.fotos_urls.length > 0 ? (
                      <img src={prod.fotos_urls[0]} alt={prod.nome} className="w-full h-full object-cover" />
                    ) : (
                      <ShoppingBag className="w-6 h-6 text-slate-600" />
                    )}
                  </div>

                  {/* Informações */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-slate-100 truncate">{prod.nome}</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                      {formatarPreco(prod.promocao_ativa && prod.preco_promocional ? Number(prod.preco_promocional) : Number(prod.preco_venda_varejo))}
                    </p>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRemover(prod.id)}
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition cursor-pointer"
                      title="Remover dos favoritos"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onAdicionarAoCarrinho(prod);
                      }}
                      className="px-3 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow transition hover:brightness-110 active:scale-95 cursor-pointer"
                      style={{ backgroundColor: corTema }}
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Adicionar</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
