import React, { useState, useEffect } from 'react';
import { X, Search, Check, Image as ImageIcon, AlertCircle, Plus, Globe } from 'lucide-react';
import { pesquisarFotosProdutoNaInternet, FotoResultadoInternet } from '../services/geminiService';
import { SpinnerPesquisandoIA } from './SpinnerPesquisandoIA';

interface ModalPesquisaFotosInternetProps {
  isOpen: boolean;
  onClose: () => void;
  onAdicionarFotos: (fotosUrls: string[]) => void;
  nomeInicial: string;
  codigoBarrasInicial?: string;
  fotosAtuaisCount: number;
  maxFotos?: number;
}

export const ModalPesquisaFotosInternet: React.FC<ModalPesquisaFotosInternetProps> = ({
  isOpen,
  onClose,
  onAdicionarFotos,
  nomeInicial,
  codigoBarrasInicial = '',
  fotosAtuaisCount,
  maxFotos = 7
}) => {
  const [termoBusca, setTermoBusca] = useState<string>(nomeInicial || '');
  const [carregando, setCarregando] = useState<boolean>(false);
  const [fotosEncontradas, setFotosEncontradas] = useState<FotoResultadoInternet[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  const vagasDisponiveis = Math.max(0, maxFotos - fotosAtuaisCount);

  useEffect(() => {
    if (isOpen) {
      const termo = nomeInicial.trim() || codigoBarrasInicial.trim();
      setTermoBusca(termo);
      setSelecionadas(new Set());
      setErro(null);
      if (termo) {
        realizarBusca(termo);
      } else {
        setFotosEncontradas([]);
      }
    }
  }, [isOpen, nomeInicial, codigoBarrasInicial]);

  const realizarBusca = async (termo: string) => {
    if (!termo.trim()) {
      setErro('Digite o nome ou código do produto para pesquisar.');
      return;
    }

    setCarregando(true);
    setErro(null);
    setSelecionadas(new Set());

    try {
      const resultados = await pesquisarFotosProdutoNaInternet(termo, codigoBarrasInicial);
      setFotosEncontradas(resultados);
      if (resultados.length === 0) {
        setErro('Nenhuma foto de boa qualidade encontrada para este termo. Tente simplificar o nome do produto.');
      }
    } catch (err: any) {
      console.error('Erro na busca de fotos:', err);
      setErro(err.message || 'Erro ao buscar fotos na internet. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  };

  const toggleSelecao = (url: string) => {
    const novoSet = new Set(selecionadas);
    if (novoSet.has(url)) {
      novoSet.delete(url);
    } else {
      if (novoSet.size >= vagasDisponiveis) {
        alert(`Você só pode selecionar mais ${vagasDisponiveis} foto(s), pois o produto aceita no máximo ${maxFotos} fotos.`);
        return;
      }
      novoSet.add(url);
    }
    setSelecionadas(novoSet);
  };

  const handleConfirmar = () => {
    if (selecionadas.size === 0) return;
    onAdicionarFotos(Array.from(selecionadas));
    onClose();
  };

  const handleAdicionarUnica = (url: string) => {
    onAdicionarFotos([url]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header do Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-100">
                  Pesquisar Fotos na Internet
                </h3>
                <span className="text-[10px] bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-full font-bold">
                  Galeria Online
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-md mt-0.5">
                Vagas na galeria: {vagasDisponiveis} de {maxFotos} fotos disponíveis
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Busca de Fotos */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/50 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              realizarBusca(termoBusca);
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                placeholder="Ex: Coca Cola Lata 350ml, Camiseta Preta..."
                className="w-full bg-slate-900 border border-slate-700 focus:border-teal-500 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none transition"
              />
            </div>
            <button
              type="submit"
              disabled={carregando || !termoBusca.trim()}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 transition"
            >
              <Search className="w-4 h-4" />
              <span>Buscar</span>
            </button>
          </form>
        </div>

        {/* Conteúdo: Spinner / Erro / Grid de Fotos */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-[300px]">
          {carregando ? (
            <div className="py-12 flex items-center justify-center">
              <SpinnerPesquisandoIA
                texto="Pesquisando"
                subtexto={`Buscando fotos de boa qualidade para "${termoBusca}"...`}
              />
            </div>
          ) : erro ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 max-w-md mx-auto">
              <AlertCircle className="w-10 h-10 text-amber-400" />
              <p className="text-xs sm:text-sm text-slate-300">{erro}</p>
              <p className="text-[11px] text-slate-500">
                Dica: experimente buscar pelo nome comercial ou pela marca principal do item.
              </p>
            </div>
          ) : fotosEncontradas.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                <span>
                  {fotosEncontradas.length} fotos encontradas. Clique para selecionar ou adicionar:
                </span>
                <span className="font-bold text-teal-400">
                  {selecionadas.size} selecionada(s)
                </span>
              </div>

              {/* Grid Responsivo de 6 a 8 fotos */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {fotosEncontradas.map((foto, idx) => {
                  const estaSelecionada = selecionadas.has(foto.url);
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleSelecao(foto.url)}
                      className={`group relative rounded-2xl overflow-hidden border-2 cursor-pointer transition flex flex-col bg-slate-800/80 shadow-md ${
                        estaSelecionada
                          ? 'border-teal-400 ring-2 ring-teal-400/40'
                          : 'border-slate-700/80 hover:border-slate-500'
                      }`}
                    >
                      {/* Imagem */}
                      <div className="relative aspect-square w-full bg-slate-950 flex items-center justify-center overflow-hidden p-2">
                        <img
                          src={foto.url}
                          alt={foto.titulo || 'Foto do produto'}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain group-hover:scale-105 transition duration-200"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />

                        {/* Checkbox de Seleção */}
                        <div
                          className={`absolute top-2 right-2 w-6 h-6 rounded-lg flex items-center justify-center transition shadow-md ${
                            estaSelecionada
                              ? 'bg-teal-500 text-white'
                              : 'bg-black/50 text-transparent border border-white/40 group-hover:border-white'
                          }`}
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>

                        {/* Tag de Fonte */}
                        <span className="absolute bottom-1.5 left-1.5 text-[9px] font-bold bg-slate-900/85 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700/80">
                          {foto.fonte || 'Web'}
                        </span>
                      </div>

                      {/* Título & Ação rápida */}
                      <div className="p-2 flex flex-col justify-between flex-1 bg-slate-850">
                        <p className="text-[11px] font-medium text-slate-200 line-clamp-2 leading-tight">
                          {foto.titulo || 'Foto do produto'}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdicionarUnica(foto.url);
                          }}
                          className="mt-2 w-full py-1 text-[10px] font-bold rounded-lg bg-slate-700 hover:bg-teal-600 text-slate-200 hover:text-white transition flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Usar Esta</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2 text-slate-400">
              <ImageIcon className="w-10 h-10 text-slate-600" />
              <p className="text-xs">Digite o nome do produto e clique em Buscar para localizar fotos.</p>
            </div>
          )}
        </div>

        {/* Footer do Modal */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/95 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400">
            {selecionadas.size > 0 ? (
              <span className="text-teal-300 font-bold">
                {selecionadas.size} foto(s) pronta(s) para adicionar
              </span>
            ) : (
              <span>Selecione uma ou mais fotos para incluir</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={selecionadas.size === 0}
              onClick={handleConfirmar}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white text-xs font-black shadow-lg shadow-teal-500/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar à Galeria ({selecionadas.size})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
