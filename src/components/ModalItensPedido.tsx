import React, { useState, useEffect } from 'react';
import { Package, X, Info, ShoppingBag } from 'lucide-react';
import { Pedido, ItemPedido, Produto } from '../types';
import { formatarMoeda } from '../utils/formatters';
import { supabase } from '../lib/supabase';

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
  const [fotosPorProdutoId, setFotosPorProdutoId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || !pedido) return;
    const itens = pedido.itens || pedido.itens_pedido || [];
    const idsFaltantes = itens
      .map(it => it.produto_id)
      .filter((id): id is string => Boolean(id) && !fotosPorProdutoId[id!]);

    if (idsFaltantes.length > 0) {
      supabase
        .from('produtos')
        .select('id, foto_url, fotos_urls')
        .in('id', idsFaltantes)
        .then(({ data }) => {
          if (data && data.length > 0) {
            const novasFotos: Record<string, string> = {};
            data.forEach((p: any) => {
              const url = p.foto_url || (Array.isArray(p.fotos_urls) ? p.fotos_urls[0] : null);
              if (url) novasFotos[p.id] = url;
            });
            setFotosPorProdutoId(prev => ({ ...prev, ...novasFotos }));
          }
        });
    }
  }, [isOpen, pedido]);

  if (!isOpen || !pedido) return null;

  const itens = pedido.itens || pedido.itens_pedido || [];
  const totalQuantidade = itens.reduce((acc, item) => acc + Number(item.quantidade), 0);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150 text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="p-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                Itens do Pedido #{pedido.origem === 'catalogo_online' ? `c-${pedido.numero_pedido}` : pedido.numero_pedido}
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {itens.length} produtos • {totalQuantidade} unidades no total
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lista de Itens */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5 bg-slate-50 dark:bg-slate-950/40">
          {itens.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Nenhum item registrado neste pedido.
            </div>
          ) : (
            itens.map((item) => (
              <div
                key={item.id}
                className="p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {(() => {
                    const prod = item.produto as any;
                    const foto = (item as any).foto_url || 
                                 (item as any).imagem_url || 
                                 prod?.foto_url || 
                                 prod?.imagem_url || 
                                 (item.produto_id ? fotosPorProdutoId[item.produto_id] : null) ||
                                 (item as any).fotos_urls?.[0] || 
                                 item.produto?.fotos_urls?.[0];

                    return foto ? (
                      <img
                        src={foto}
                        alt={item.nome_produto || (item as any).nome || (item as any).descricao || 'Produto'}
                        className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shrink-0">
                        <Package className="w-5 h-5 text-slate-400" />
                      </div>
                    );
                  })()}
                  <div className="min-w-0">
                    <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 block truncate">
                      {item.nome_produto}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        {Number(item.quantidade)}x
                      </span>
                      {item.rotulo_variacao && (
                        <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
                          {item.rotulo_variacao}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {formatarMoeda(Number(item.preco_venda_unitario))} /un
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Subtotal</span>
                    <span className="font-bold text-slate-900 dark:text-white text-sm font-mono">
                      {formatarMoeda(Number(item.subtotal))}
                    </span>
                  </div>

                  {/* Botão de Detalhes do Produto */}
                  <button
                    type="button"
                    onClick={() => onConsultarProduto(item)}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition cursor-pointer"
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
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span>Total: </span>
            <span className="text-slate-900 dark:text-white font-bold text-base font-mono">
              {formatarMoeda(Number(pedido.valor_total))}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 text-slate-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 dark:text-white text-xs font-bold shadow-xs transition cursor-pointer active:scale-95"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
