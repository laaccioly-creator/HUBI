import React, { useEffect, useState } from 'react';
import { X, Star, ShoppingBag, Loader2, AlertCircle, Trash2, Check } from 'lucide-react';
import { Produto, ClienteFavorito } from '../types';
import { ClienteCatalogoService } from '../services/clienteCatalogoService';
import { useTheme } from '../contexts/ThemeContext';

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
  const { isDark } = useTheme();
  const [favoritos, setFavoritos] = useState<ClienteFavorito[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [produtosAdicionados, setProdutosAdicionados] = useState<Record<string, boolean>>({});

  const handleAdicionarItem = (prod: Produto) => {
    onAdicionarAoCarrinho(prod);
    setProdutosAdicionados((prev) => ({ ...prev, [prod.id]: true }));
    setTimeout(() => {
      setProdutosAdicionados((prev) => ({ ...prev, [prod.id]: false }));
    }, 2500);
  };

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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 border ${
          isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        } cursor-default`}
      >
        {/* Cabeçalho */}
        <div className={`p-4 border-b flex items-center justify-between ${
          isDark ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-amber-500 bg-amber-500/10 border border-amber-500/20 shadow-xs"
            >
              <Star className="w-5 h-5 fill-amber-500" />
            </div>
            <div>
              <h3 className={`font-extrabold text-sm sm:text-base flex items-center gap-2 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}>
                <span>Meus Favoritos</span>
                {favoritos.length > 0 && (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    isDark ? 'bg-slate-800 text-amber-400 border-amber-500/20' : 'bg-amber-50 text-amber-800 border-amber-300'
                  }`}>
                    {favoritos.length}
                  </span>
                )}
              </h3>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Produtos que você marcou com a estrelinha</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-xl transition cursor-pointer ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/80'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de Erro */}
        {erro && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-500 flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{erro}</span>
          </div>
        )}

        {/* Lista de Produtos Favoritados */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {carregando ? (
            <div className={`py-12 flex flex-col items-center justify-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <span className="text-xs">Carregando favoritos...</span>
            </div>
          ) : favoritos.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-3">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                isDark ? 'bg-slate-800/80 border border-slate-700 text-amber-400/40' : 'bg-slate-100 border border-slate-300 text-amber-500/50'
              }`}>
                <Star className="w-7 h-7" />
              </div>
              <div>
                <p className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>Sua lista de favoritos está vazia</p>
                <p className={`text-xs mt-1 max-w-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
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
                  className="mt-2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs bg-emerald-600 hover:bg-emerald-500 transition cursor-pointer active:scale-95"
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
                  className={`rounded-2xl p-3 flex items-center gap-3 transition border ${
                    isDark
                      ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      : 'bg-white border-slate-200 hover:border-emerald-500/40 shadow-xs'
                  }`}
                >
                  {/* Foto do Produto */}
                  <div className={`w-16 h-16 rounded-xl shrink-0 overflow-hidden flex items-center justify-center border ${
                    isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    {prod.fotos_urls && prod.fotos_urls.length > 0 ? (
                      <img src={prod.fotos_urls[0]} alt={prod.nome} className="w-full h-full object-cover" />
                    ) : (
                      <ShoppingBag className={`w-6 h-6 ${isDark ? 'text-slate-600' : 'text-slate-400'}`} />
                    )}
                  </div>

                  {/* Informações */}
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-xs font-bold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{prod.nome}</h4>
                    <p className={`text-[11px] mt-0.5 font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                      {formatarPreco(prod.promocao_ativa && prod.preco_promocional ? Number(prod.preco_promocional) : Number(prod.preco_venda_varejo))}
                    </p>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRemover(prod.id)}
                      className={`p-2 rounded-xl transition cursor-pointer ${
                        isDark ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-800' : 'text-slate-500 hover:text-rose-600 hover:bg-slate-100'
                      }`}
                      title="Remover dos favoritos"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAdicionarItem(prod)}
                      className={`px-3 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer ${
                        produtosAdicionados[prod.id]
                          ? 'bg-emerald-700 ring-2 ring-emerald-400/50'
                          : 'bg-emerald-600 hover:bg-emerald-500'
                      }`}
                      title={produtosAdicionados[prod.id] ? 'Produto adicionado ao seu carrinho!' : 'Adicionar ao carrinho'}
                    >
                      {produtosAdicionados[prod.id] ? (
                        <>
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Adicionado ✓</span>
                        </>
                      ) : (
                        <>
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Adicionar</span>
                        </>
                      )}
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
