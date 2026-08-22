import React, { useState } from 'react';
import {
  Package,
  X,
  Tag,
  Barcode,
  Layers,
  DollarSign,
  AlertTriangle,
  FileText,
  Folder,
  Star,
  Eye,
  CheckCircle2
} from 'lucide-react';
import { Produto } from '../types';

interface ModalDetalhesProdutoProps {
  isOpen: boolean;
  onClose: () => void;
  produto: Produto | null;
}

export const ModalDetalhesProduto: React.FC<ModalDetalhesProdutoProps> = ({
  isOpen,
  onClose,
  produto
}) => {
  const [fotoSelecionadaIdx, setFotoSelecionadaIdx] = useState<number>(0);

  if (!isOpen || !produto) return null;

  const fotos = produto.fotos_urls && produto.fotos_urls.length > 0
    ? produto.fotos_urls
    : ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=60'];

  const fotoPrincipal = fotos[fotoSelecionadaIdx] || fotos[0];
  const temEstoqueBaixo = Number(produto.quantidade_estoque) <= Number(produto.estoque_minimo_alerta);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
        {/* Header do Modal */}
        <div className="p-4 sm:px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-100 line-clamp-1">{produto.nome}</h3>
              <span className="text-[11px] text-slate-400">Consulta e Ficha Técnica do Produto</span>
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

        {/* Conteúdo com Rolagem */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Galeria de Fotos */}
            <div className="space-y-2.5">
              <div className="relative aspect-square w-full bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
                <img
                  src={fotoPrincipal}
                  alt={produto.nome}
                  className="w-full h-full object-cover"
                />
                {produto.destaque && (
                  <span className="absolute top-2 left-2 bg-amber-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                    <Star className="w-3 h-3 fill-current" /> Destaque
                  </span>
                )}
                {produto.exibir_catalogo && (
                  <span className="absolute top-2 right-2 bg-emerald-500/90 text-white font-bold text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                    <Eye className="w-3 h-3" /> No Catálogo
                  </span>
                )}
              </div>

              {/* Thumbnails se houver mais de 1 foto */}
              {fotos.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {fotos.map((f, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setFotoSelecionadaIdx(idx)}
                      className={`relative w-14 h-14 rounded-xl overflow-hidden border shrink-0 transition ${
                        fotoSelecionadaIdx === idx
                          ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                          : 'border-slate-800 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={f} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Informações Comerciais e Preços */}
            <div className="space-y-3.5">
              {/* Categoria e Código */}
              <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
                <span className="flex items-center gap-1.5 font-medium">
                  <Folder className="w-3.5 h-3.5 text-indigo-400" />
                  {produto.categoria?.nome || 'Geral'}
                </span>
                {produto.codigo_interno && (
                  <span className="font-mono text-[11px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                    SKU #{produto.codigo_interno}
                  </span>
                )}
              </div>

              {/* Bloco de Preços */}
              <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Tabelas de Preço
                </span>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300">Preço Varejo:</span>
                  <span className="font-bold text-emerald-400 text-sm">
                    R$ {Number(produto.preco_venda_varejo).toFixed(2)}
                  </span>
                </div>

                {Number(produto.preco_venda_atacado) > 0 && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">
                      Preço Atacado ({produto.qtd_minima_atacado || 1}+ un):
                    </span>
                    <span className="font-bold text-blue-400">
                      R$ {Number(produto.preco_venda_atacado).toFixed(2)}
                    </span>
                  </div>
                )}

                {Number(produto.preco_venda_autoatacado) > 0 && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">
                      Preço Distribuidor ({produto.qtd_minima_autoatacado || 1}+ un):
                    </span>
                    <span className="font-bold text-indigo-400">
                      R$ {Number(produto.preco_venda_autoatacado).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Estoque e Unidade */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 bg-slate-950/70 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 font-medium block">Estoque Atual</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-black ${temEstoqueBaixo ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {produto.quantidade_estoque} {produto.tipo_unidade || 'un'}
                    </span>
                    {temEstoqueBaixo && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                </div>

                <div className="p-3 bg-slate-950/70 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 font-medium block">Código de Barras</span>
                  <span className="text-xs font-mono font-bold text-slate-300 truncate block">
                    {produto.codigo_barras || 'Não cadastrado'}
                  </span>
                </div>
              </div>

              {/* Variações do Produto se houver */}
              {produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0 && (
                <div className="p-3 bg-slate-950/70 rounded-2xl border border-slate-800 space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-400 block">
                    Variações ({produto.variacoes.length})
                  </span>
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {produto.variacoes.map((v) => (
                      <div key={v.id} className="flex justify-between items-center text-xs py-1 border-b border-slate-800/50">
                        <span className="text-slate-200">
                          {v.valor_variacao_1} {v.valor_variacao_2 ? `- ${v.valor_variacao_2}` : ''}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          {v.quantidade_estoque} un • R$ {Number(v.preco_venda_varejo).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Descrição do Produto */}
          {produto.descricao && (
            <div className="p-3.5 bg-slate-950/50 rounded-2xl border border-slate-800 space-y-1.5">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400" /> Descrição do Produto
              </span>
              <p className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed">
                {produto.descricao}
              </p>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex justify-end">
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
