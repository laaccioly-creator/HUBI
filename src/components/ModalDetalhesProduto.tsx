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
import { useTheme } from '../contexts/ThemeContext';

interface ModalDetalhesProdutoProps {
  isOpen: boolean;
  onClose: () => void;
  produto: Produto | null;
  apenasGrade?: boolean;
}

export const ModalDetalhesProduto: React.FC<ModalDetalhesProdutoProps> = ({
  isOpen,
  onClose,
  produto,
  apenasGrade = false
}) => {
  const { tema } = useTheme();
  const isDark = tema === 'dark';
  const [fotoSelecionadaIdx, setFotoSelecionadaIdx] = useState<number>(0);

  if (!isOpen || !produto) return null;

  const temVariacoes = Boolean(produto.tem_variacoes && Array.isArray(produto.variacoes) && produto.variacoes.length > 0);
  const estoqueReal = temVariacoes
    ? produto.variacoes!.reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0)
    : Number(produto.quantidade_estoque || 0);

  const fotos = produto.fotos_urls && produto.fotos_urls.length > 0
    ? produto.fotos_urls
    : ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=60'];

  const fotoPrincipal = fotos[fotoSelecionadaIdx] || fotos[0];
  const temEstoqueBaixo = estoqueReal <= Number(produto.estoque_minimo_alerta || 0);

  // MODO EXCLUSIVO DE DETALHAMENTO DE GRADE (ITEM 4)
  if (apenasGrade) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
        <div className={`rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150 ${
          isDark ? 'bg-[#08131A] border-2 border-slate-400 text-white' : 'bg-slate-100 border-2 border-slate-300 text-black'
        }`}>
          {/* Header */}
          <div className={`p-4 sm:px-6 border-b flex items-center justify-between ${
            isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-slate-100'
          }`}>
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold ${
                isDark ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}>
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`font-black text-sm sm:text-base line-clamp-1 ${isDark ? 'text-white' : 'text-black'}`}>{produto.nome}</h3>
                <span className={`text-[11px] font-bold ${isDark ? 'text-white' : 'text-black'}`}>Estoque por Variação / Grade</span>
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

          {/* Conteúdo com Tabela de Variações */}
          <div className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 ${isDark ? 'bg-[#08131A]' : 'bg-slate-100'}`}>
            {temVariacoes && produto.variacoes && produto.variacoes.length > 0 ? (
              <div className="space-y-2">
                {produto.variacoes.map((v) => {
                  const vEstoque = Number(v.quantidade_estoque || 0);
                  const rotulo1 = produto.rotulo_variacao_1 || 'Variação';
                  const rotulo2 = produto.rotulo_variacao_2;
                  const isBaixo = vEstoque <= Number(v.estoque_minimo_alerta || produto.estoque_minimo_alerta || 0);

                  return (
                    <div
                      key={v.id}
                      className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 shadow-xs ${
                        isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className={`font-bold text-xs block truncate ${isDark ? 'text-white' : 'text-black'}`}>
                          {rotulo1 ? <span className={`font-medium text-[11px] ${isDark ? 'text-white' : 'text-black'}`}>{rotulo1}: </span> : null}
                          {v.valor_variacao_1}
                          {v.valor_variacao_2 && (
                            <span>
                              {' '}• {rotulo2 ? <span className={`font-medium text-[11px] ${isDark ? 'text-white' : 'text-black'}`}>{rotulo2}: </span> : null}{v.valor_variacao_2}
                            </span>
                          )}
                        </span>
                        <div className={`flex items-center gap-2 mt-0.5 text-[11px] font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                          {v.sku && <span className="font-mono">SKU: {v.sku}</span>}
                          {v.codigo_barras && <span>• Cód: {v.codigo_barras}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-xs font-mono font-black ${isDark ? 'text-white' : 'text-black'}`}>
                          R$ {Number(v.preco_venda_varejo || produto.preco_venda_varejo).toFixed(2)}
                        </span>
                        <span className={`px-2.5 py-1 rounded-xl font-mono font-bold text-xs border ${
                          vEstoque <= 0
                            ? isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-rose-100 text-rose-900 border-rose-300'
                            : isBaixo
                            ? isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-amber-100 text-amber-900 border-amber-300'
                            : isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        }`}>
                          {vEstoque} {produto.tipo_unidade || 'un'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`text-center py-8 text-xs font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                Este produto não possui variações/grade cadastradas.
              </div>
            )}
          </div>

          {/* Rodapé com Resumo Total */}
          <div className={`p-4 border-t flex items-center justify-between ${
            isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-slate-100'
          }`}>
            <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-black'}`}>
              Total em Grade:{' '}
              <strong className={`font-black text-sm ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{estoqueReal} {produto.tipo_unidade || 'un'}</strong>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer active:scale-95 ${
                isDark ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500' : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
              }`}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // MODO COMPLETO (FICHA TÉCNICA E DETALHES GERAIS)
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className={`rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150 ${
        isDark ? 'bg-[#08131A] border-2 border-slate-400 text-white' : 'bg-slate-100 border-2 border-slate-300 text-black'
      }`}>
        {/* Header do Modal */}
        <div className={`p-4 sm:px-6 border-b flex items-center justify-between ${
          isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-slate-100'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${
              isDark ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600'
            }`}>
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className={`font-black text-sm sm:text-base line-clamp-1 ${isDark ? 'text-white' : 'text-black'}`}>{produto.nome}</h3>
              <span className={`text-[11px] font-bold ${isDark ? 'text-white' : 'text-black'}`}>Consulta e Ficha Técnica do Produto</span>
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

        {/* Conteúdo com Rolagem */}
        <div className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 ${isDark ? 'bg-[#08131A]' : 'bg-slate-100'}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Galeria de Fotos */}
            <div className="space-y-2.5 flex flex-col items-center">
              <div className={`relative w-full max-w-[220px] sm:max-w-[240px] aspect-square rounded-2xl overflow-hidden border flex items-center justify-center shadow-xs ${
                isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
              }`}>
                <img
                  src={fotoPrincipal}
                  alt={produto.nome}
                  className="w-full h-full object-cover"
                />
                {produto.destaque && (
                  <span className="absolute top-2 left-2 bg-amber-500 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                    <Star className="w-2.5 h-2.5 fill-current" /> Destaque
                  </span>
                )}
                {produto.exibir_catalogo && (
                  <span className="absolute top-2 right-2 bg-emerald-600 text-white font-bold text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                    <Eye className="w-2.5 h-2.5" /> No Catálogo
                  </span>
                )}
              </div>

              {/* Thumbnails se houver mais de 1 foto */}
              {fotos.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-[240px]">
                  {fotos.map((f, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setFotoSelecionadaIdx(idx)}
                      className={`relative w-11 h-11 rounded-lg overflow-hidden border shrink-0 transition ${
                        fotoSelecionadaIdx === idx
                          ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                          : isDark ? 'border-slate-700 opacity-60 hover:opacity-100' : 'border-slate-300 opacity-60 hover:opacity-100'
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
              {/* Categoria, Status Ativo e Código */}
              <div className={`flex items-center justify-between text-xs pb-2 border-b ${
                isDark ? 'border-slate-800 text-white' : 'border-slate-300 text-black'
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                    <Folder className="w-3.5 h-3.5 text-indigo-500" />
                    {produto.categoria?.nome || 'Geral'}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${
                    produto.ativo !== false
                      ? isDark ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : isDark ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' : 'bg-rose-50 text-rose-700 border-rose-300'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${produto.ativo !== false ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    {produto.ativo !== false ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                {produto.codigo_interno && (
                  <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${
                    isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                  }`}>
                    SKU #{produto.codigo_interno}
                  </span>
                )}
              </div>

              {/* Bloco de Preços */}
              <div className={`p-3.5 rounded-xl border space-y-2 ${
                isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
              }`}>
                <span className={`text-[11px] font-black uppercase tracking-wider block ${isDark ? 'text-white' : 'text-black'}`}>
                  Tabelas de Preço
                </span>

                <div className="flex justify-between items-center text-xs">
                  <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>Preço Varejo:</span>
                  <span className={`font-black text-sm ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    R$ {Number(produto.preco_venda_varejo).toFixed(2)}
                  </span>
                </div>

                {Number(produto.preco_venda_atacado) > 0 && (
                  <div className="flex justify-between items-center text-xs">
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                      Preço Atacado ({produto.qtd_minima_atacado || 1}+ un):
                    </span>
                    <span className={`font-black ${isDark ? 'text-indigo-400' : 'text-indigo-700'}`}>
                      R$ {Number(produto.preco_venda_atacado).toFixed(2)}
                    </span>
                  </div>
                )}

                {Number(produto.preco_venda_autoatacado) > 0 && (
                  <div className="flex justify-between items-center text-xs">
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                      Preço Distribuidor ({produto.qtd_minima_autoatacado || 1}+ un):
                    </span>
                    <span className={`font-black ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>
                      R$ {Number(produto.preco_venda_autoatacado).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Estoque e Unidade */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className={`p-3 rounded-xl border space-y-1 ${
                  isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                }`}>
                  <span className={`text-[10px] font-bold block ${isDark ? 'text-white' : 'text-black'}`}>
                    {temVariacoes ? 'Estoque Total (Grade)' : 'Estoque Atual'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-black ${
                      estoqueReal <= 0 ? 'text-rose-500' : temEstoqueBaixo ? 'text-amber-500' : isDark ? 'text-emerald-400' : 'text-emerald-700'
                    }`}>
                      {estoqueReal} {produto.tipo_unidade || 'un'}
                    </span>
                    {temEstoqueBaixo && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                  </div>
                </div>

                <div className={`p-3 rounded-xl border space-y-1 ${
                  isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                }`}>
                  <span className={`text-[10px] font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Código de Barras</span>
                  <span className={`text-xs font-mono font-bold truncate block ${isDark ? 'text-white' : 'text-black'}`}>
                    {produto.codigo_barras || (produto.codigo_interno ? `Cód: ${produto.codigo_interno}` : 'Não cadastrado')}
                  </span>
                </div>
              </div>

              {/* Variações do Produto se houver */}
              {temVariacoes && produto.variacoes && produto.variacoes.length > 0 && (
                <div className={`p-3.5 rounded-xl border space-y-2 ${
                  isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-black uppercase tracking-wider block ${isDark ? 'text-white' : 'text-black'}`}>
                      Estoque por Variação / Grade ({produto.variacoes.length})
                    </span>
                    <span className={`text-[10px] font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                      Total: {estoqueReal} {produto.tipo_unidade || 'un'}
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pt-1">
                    {produto.variacoes.map((v) => {
                      const vEstoque = Number(v.quantidade_estoque || 0);
                      const rotulo1 = produto.rotulo_variacao_1 || 'Variação';
                      const rotulo2 = produto.rotulo_variacao_2;
                      return (
                        <div key={v.id} className={`flex justify-between items-center text-xs p-2 rounded-xl border transition ${
                          isDark ? 'bg-[#08131A] border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-black'
                        }`}>
                          <div className="min-w-0 pr-2">
                            <span className={`font-bold block truncate ${isDark ? 'text-white' : 'text-black'}`}>
                              {rotulo1 ? <span className={`font-medium text-[11px] ${isDark ? 'text-white' : 'text-black'}`}>{rotulo1}: </span> : null}
                              {v.valor_variacao_1}
                              {v.valor_variacao_2 && (
                                <span>
                                  {' '}• {rotulo2 ? <span className={`font-medium text-[11px] ${isDark ? 'text-white' : 'text-black'}`}>{rotulo2}: </span> : null}{v.valor_variacao_2}
                                </span>
                              )}
                            </span>
                            {v.sku && (
                              <span className={`text-[10px] font-mono font-bold ${isDark ? 'text-white' : 'text-black'}`}>SKU: {v.sku}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className={`font-mono font-bold text-[11px] ${isDark ? 'text-white' : 'text-black'}`}>
                              R$ {Number(v.preco_venda_varejo || produto.preco_venda_varejo).toFixed(2)}
                            </span>
                            <span className={`text-[11px] px-2 py-0.5 rounded-lg font-mono font-bold border ${
                              vEstoque <= 0
                                ? isDark ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-rose-100 text-rose-900 border-rose-300'
                                : vEstoque <= Number(v.estoque_minimo_alerta || produto.estoque_minimo_alerta || 0)
                                ? isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-amber-100 text-amber-900 border-amber-300'
                                : isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            }`}>
                              {vEstoque} {produto.tipo_unidade || 'un'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Descrição do Produto */}
          {produto.descricao && (
            <div className={`p-3.5 rounded-xl border space-y-1.5 ${
              isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <span className={`text-xs font-black flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-black'}`}>
                <FileText className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} /> Descrição do Produto
              </span>
              <p className={`text-xs font-medium whitespace-pre-wrap leading-relaxed ${isDark ? 'text-white' : 'text-black'}`}>
                {produto.descricao}
              </p>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className={`p-4 border-t flex justify-end ${
          isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-slate-100'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer active:scale-95 ${
              isDark ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500' : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
            }`}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
