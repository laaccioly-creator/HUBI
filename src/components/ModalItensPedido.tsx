import React, { useState, useEffect } from 'react';
import { Package, X, Info, ShoppingBag, Scale } from 'lucide-react';
import { Pedido, ItemPedido, Produto } from '../types';
import { formatarMoeda } from '../utils/formatters';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

interface ModalItensPedidoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  onConsultarProduto: (item: ItemPedido) => void;
  onAbrirPesagem?: (pedido: Pedido) => void;
}

export const ModalItensPedido: React.FC<ModalItensPedidoProps> = ({
  isOpen,
  onClose,
  pedido,
  onConsultarProduto,
  onAbrirPesagem
}) => {
  const { tema } = useTheme();
  const isDark = tema === 'dark';
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
        .select('id, fotos_urls')
        .in('id', idsFaltantes)
        .then(({ data, error }) => {
          if (!error && data && data.length > 0) {
            const novasFotos: Record<string, string> = {};
            data.forEach((p: any) => {
              const url = (Array.isArray(p.fotos_urls) && p.fotos_urls.length > 0 ? p.fotos_urls[0] : null) ||
                          p.foto_url ||
                          p.imagem_url ||
                          null;
              if (url) novasFotos[p.id] = url;
            });
            setFotosPorProdutoId(prev => ({ ...prev, ...novasFotos }));
          }
        });
    }
  }, [isOpen, pedido]);

  if (!isOpen || !pedido) return null;

  const itens = pedido.itens || pedido.itens_pedido || [];
  const totalQuantidade = itens.length > 0 ? Math.max(1, Math.round(itens.reduce((acc, item) => acc + Math.round(Number(item.quantidade || 1)), 0))) : 0;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className={`rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150 ${
        isDark ? 'bg-[#08131A] border-2 border-slate-400 text-slate-100' : 'bg-slate-100 border-2 border-slate-300 text-black'
      }`}>
        {/* Header */}
        <div className={`p-4 sm:px-6 border-b flex items-center justify-between ${
          isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-slate-100'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
              isDark ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}>
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h3 className={`font-black text-sm sm:text-base ${isDark ? 'text-white' : 'text-black'}`}>
                Itens do Pedido #{pedido.origem === 'catalogo_online' ? `c-${pedido.numero_pedido}` : pedido.numero_pedido}
              </h3>
              <span className={`text-[11px] font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                {itens.length} produtos • {totalQuantidade} unidades no total
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-xl border transition cursor-pointer ${
              isDark ? 'bg-[#000000] border-slate-700 text-white hover:bg-slate-900' : 'bg-white border-slate-300 text-black hover:bg-slate-50'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lista de Itens */}
        <div className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5 ${
          isDark ? 'bg-[#08131A]' : 'bg-slate-100'
        }`}>
          {itens.length === 0 ? (
            <div className={`text-center py-12 text-xs font-bold ${isDark ? 'text-white' : 'text-black'}`}>
              Nenhum item registrado neste pedido.
            </div>
          ) : (
            itens.map((item) => {
              const prod = item.produto as any;
              const itemFotoUrl =
                (item as any).foto_url ||
                (item as any).imagem_url ||
                (Array.isArray((item as any).fotos_urls) && (item as any).fotos_urls[0]) ||
                (prod && Array.isArray(prod.fotos_urls) && prod.fotos_urls[0]) ||
                prod?.foto_url ||
                prod?.imagem_url ||
                (item.produto_id ? fotosPorProdutoId[item.produto_id] : null);

              return (
                <div
                  key={item.id}
                  className={`p-3 sm:p-3.5 rounded-2xl flex items-center justify-between gap-3 shadow-xs transition ${
                    isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {itemFotoUrl ? (
                      <img
                        src={itemFotoUrl}
                        alt={item.nome_produto || (item as any).nome || 'Produto'}
                        className={`w-11 h-11 rounded-xl object-cover border shrink-0 ${
                          isDark ? 'border-slate-700' : 'border-slate-300'
                        }`}
                      />
                    ) : (
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 ${
                        isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-400'
                      }`}>
                        <Package className="w-5 h-5" />
                      </div>
                    )}
                  <div className="min-w-0">
                    <span className={`font-bold text-xs sm:text-sm block truncate ${isDark ? 'text-white' : 'text-black'}`}>
                      {item.nome_produto}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className={`text-[11px] font-extrabold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        {Number(item.quantidade)}x
                      </span>
                      {item.rotulo_variacao && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-100 border-slate-300 text-black'
                        }`}>
                          {item.rotulo_variacao}
                        </span>
                      )}
                      <span className={`text-[10px] font-mono font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                        {formatarMoeda(Number(item.preco_venda_unitario))} /un
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span className={`text-xs block font-bold ${isDark ? 'text-white' : 'text-black'}`}>Subtotal</span>
                    <span className={`font-black text-sm font-mono ${isDark ? 'text-white' : 'text-black'}`}>
                      {formatarMoeda(Number(item.subtotal))}
                    </span>
                  </div>

                  {/* Botão de Detalhes do Produto */}
                  <button
                    type="button"
                    onClick={() => onConsultarProduto(item)}
                    className={`p-2 rounded-xl border transition cursor-pointer ${
                      isDark
                        ? 'bg-[#000000] border-slate-700 text-white hover:text-emerald-400 hover:bg-slate-900'
                        : 'bg-white border-slate-300 text-black hover:text-emerald-700 hover:bg-slate-50'
                    }`}
                    title="Ver Ficha e Detalhes do Produto"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          }))}
        </div>

        {/* Rodapé com Resumo */}
        <div className={`p-4 border-t flex items-center justify-between ${
          isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-slate-100'
        }`}>
          <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-black'}`}>
            <span>Total: </span>
            <span className={`font-black text-base font-mono ${isDark ? 'text-white' : 'text-black'}`}>
              {formatarMoeda(Number(pedido.valor_total))}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-5 py-2 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer active:scale-95 ${
              isDark ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500' : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
            }`}
          >
            Fechar
          </button>
          {pedido.status_pagamento === 'aguardando_pesagem' && onAbrirPesagem && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onAbrirPesagem(pedido);
              }}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition cursor-pointer active:scale-95 inline-flex items-center gap-1.5"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Informar Peso</span>
            </button>
          )}
          <button type="button" className="hidden">
          </button>
        </div>
      </div>
    </div>
  );
};
