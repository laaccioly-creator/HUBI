import React from 'react';
import { Package, X, Info, ShoppingBag } from 'lucide-react';
import { Pedido, ItemPedido, Produto } from '../types';

interface ModalItensPedidoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  onConsultarProduto: (item: ItemPedido) => void;
}

export const ModalItensPedido: React.FC<ModalItensPedidoProps> = ({
  isOpen,
  onClose,
  pedido,
  onConsultarProduto
}) => {
  if (!isOpen || !pedido) return null;

  const itens = pedido.itens || pedido.itens_pedido || [];
  const totalQuantidade = itens.reduce((acc, item) => acc + Number(item.quantidade), 0);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-100">
                Itens do Pedido #{pedido.origem === 'catalogo_online' ? `c-${pedido.numero_pedido}` : pedido.numero_pedido}
              </h3>
              <span className="text-[11px] text-slate-400">
                {itens.length} produtos • {totalQuantidade} unidades no total
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lista de Itens */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5">
          {itens.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              Nenhum item registrado neste pedido.
            </div>
          ) : (
            itens.map((item) => (
              <div
                key={item.id}
                className="p-3 sm:p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 hover:border-slate-700 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-xs sm:text-sm text-slate-100 block truncate">
                      {item.nome_produto}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-[11px] font-bold text-emerald-400">
                        {Number(item.quantidade)}x
                      </span>
                      {item.rotulo_variacao && (
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                          {item.rotulo_variacao}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500 font-mono">
                        R$ {Number(item.preco_venda_unitario).toFixed(2)} /un
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Subtotal</span>
                    <span className="font-bold text-slate-100 text-sm font-mono">
                      R$ {Number(item.subtotal).toFixed(2)}
                    </span>
                  </div>

                  {/* Botão de Detalhes do Produto */}
                  <button
                    type="button"
                    onClick={() => onConsultarProduto(item)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition cursor-pointer"
                    title="Ver Ficha e Detalhes do Produto"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Rodapé com Resumo */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            <span>Total: </span>
            <span className="text-emerald-400 font-bold text-base font-mono">
              R$ {Number(pedido.valor_total).toFixed(2)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
