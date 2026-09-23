import React, { useState, useEffect } from 'react';
import { X, Search, Check, Image as ImageIcon, AlertCircle, Plus, Globe, Loader2, ExternalLink, Key, RefreshCw } from 'lucide-react';
import { pesquisarFotosProdutoNaInternet, FotoResultadoInternet, SerpApiQuotaError, SerpApiAuthError } from '../services/geminiService';
import { SpinnerPesquisandoIA } from './SpinnerPesquisandoIA';
import { ModalQuotaExcedidaSerpApi } from './ModalQuotaExcedidaSerpApi';

interface ModalPesquisaFotosInternetProps {
  isOpen: boolean;
  onClose: () => void;
  onAdicionarFotos: (fotosUrls: string[]) => void;
  nomeInicial: string;
  codigoBarrasInicial?: string;
  fotosAtuaisCount: number;
  maxFotos?: number;
  fotoReferencia?: string;
  segmentoLoja?: string;
  loja?: any;
  onAbrirConfiguracaoChave?: () => void;
}

export const ModalPesquisaFotosInternet: React.FC<ModalPesquisaFotosInternetProps> = ({
  isOpen,
  onClose,
  onAdicionarFotos,
  nomeInicial,
  codigoBarrasInicial = '',
  fotosAtuaisCount,
  maxFotos = 7,
  fotoReferencia,
  segmentoLoja,
  loja,
  onAbrirConfiguracaoChave
}) => {
  const [termoBusca, setTermoBusca] = useState<string>('');
  const [urlManual, setUrlManual] = useState<string>('');
  const [carregando, setCarregando] = useState<boolean>(false);
  const [fotosEncontradas, setFotosEncontradas] = useState<FotoResultadoInternet[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [erroAutenticacao, setErroAutenticacao] = useState<boolean>(false);
  const [modalQuotaAberta, setModalQuotaAberta] = useState<boolean>(false);
  const [imagensCarregadas, setImagensCarregadas] = useState<Set<string>>(new Set());
  const [imagensComErro, setImagensComErro] = useState<Set<string>>(new Set());
  const [falhasOriginal, setFalhasOriginal] = useState<Set<string>>(new Set());
  const [mensagemToast, setMensagemToast] = useState<string | null>(null);
  const [arrastandoSobre, setArrastandoSobre] = useState<boolean>(false);

  const vagasDisponiveis = Math.max(0, maxFotos - fotosAtuaisCount);

  // Captura direta via Ctrl+V (Colar Imagem da área de transferência)
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const items = Array.from(clipboardData.items || []);
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              const base64Url = reader.result as string;
              if (base64Url) {
                setFotosEncontradas((prev) => [
                  { url: base64Url, titulo: 'Foto copiada da internet (Ctrl+V)', fonte: 'Área de Transferência' },
                  ...prev
                ]);
                setSelecionadas((prev) => {
                  const n = new Set(prev);
                  n.add(base64Url);
                  return n;
                });
                setMensagemToast('Foto colada com sucesso via Ctrl+V!');
                setTimeout(() => setMensagemToast(null), 3500);
              }
            };
            reader.readAsDataURL(file);
            e.preventDefault();
            return;
          }
        }
      }

      // Se colou texto com link direto de imagem
      const text = clipboardData.getData('text')?.trim();
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        const isImage = /\.(jpg|jpeg|png|webp|avif|gif)(\?.*)?$/i.test(text) || text.includes('image') || text.includes('img') || text.includes('photo');
        if (isImage) {
          setUrlManual(text);
          setMensagemToast('Link de foto inserido! Clique em Adicionar Link.');
          setTimeout(() => setMensagemToast(null), 3000);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const termo = nomeInicial.trim() || codigoBarrasInicial.trim();
      // Remove prefixos como "7633 - " ou códigos numéricos para buscar o nome real do produto
      const termoTratado = termo
        .replace(/^[\d\w#.-]+\s*-\s*/, '')
        .replace(/^[0-9]+\s+/, '')
        .trim() || termo;

      setTermoBusca(termoTratado);
      setSelecionadas(new Set());
      setErro(null);
      setImagensCarregadas(new Set());
      setImagensComErro(new Set());
      setFalhasOriginal(new Set());

      if (termoTratado || fotoReferencia) {
        realizarBusca(termoTratado);
      } else {
        setFotosEncontradas([]);
      }
    }
  }, [isOpen, nomeInicial, codigoBarrasInicial, fotoReferencia, segmentoLoja]);

  const realizarBusca = async (termo: string) => {
    const termoTratado = termo
      .replace(/^[\d\w#.-]+\s*-\s*/, '')
      .replace(/^[0-9]+\s+/, '')
      .trim() || termo.trim();

    if (!termoTratado && !fotoReferencia) {
      setErro('Digite o nome do produto ou selecione uma foto para pesquisar.');
      return;
    }

    setCarregando(true);
    setErro(null);
    setErroAutenticacao(false);
    setSelecionadas(new Set());
    setImagensCarregadas(new Set());
    setImagensComErro(new Set());
    setFalhasOriginal(new Set());

    try {
      const resultados = await pesquisarFotosProdutoNaInternet(termoTratado, codigoBarrasInicial, fotoReferencia, segmentoLoja, loja);
      setFotosEncontradas(resultados);
      if (resultados.length === 0) {
        setErro('Nenhuma foto encontrada para este produto na web. Você também pode colar fotos copiadas da internet usando Ctrl+V ou colar o link abaixo.');
      }
    } catch (err: any) {
      console.error('Erro na busca de fotos:', err);
      if (err instanceof SerpApiQuotaError || err?.name === 'SerpApiQuotaError') {
        setModalQuotaAberta(true);
        setErro('Limite mensal de 250 buscas atingido na SerpApi. Suas buscas gratuitas renovam no início do próximo mês.');
      } else if (err instanceof SerpApiAuthError || err?.name === 'SerpApiAuthError') {
        setErroAutenticacao(true);
        setErro('Chave da SerpApi inválida ou expirada. Clique no botão abaixo para redefinir sua chave.');
      } else {
        setErro(err.message || 'Erro ao buscar fotos na internet. Tente novamente.');
      }
    } finally {
      setCarregando(false);
    }
  };

  const toggleSelecao = (foto: FotoResultadoInternet) => {
    const urlAlvo = foto.urlOriginal || foto.url;
    const novoSet = new Set(selecionadas);
    if (novoSet.has(urlAlvo)) {
      novoSet.delete(urlAlvo);
    } else {
      if (novoSet.size >= vagasDisponiveis) {
        alert(`Você só pode selecionar mais ${vagasDisponiveis} foto(s), pois o produto aceita no máximo ${maxFotos} fotos.`);
        return;
      }
      novoSet.add(urlAlvo);
    }
    setSelecionadas(novoSet);
  };

  const handleConfirmar = () => {
    if (selecionadas.size === 0) return;
    onAdicionarFotos(Array.from(selecionadas));
    onClose();
  };

  const handleAdicionarUnica = (foto: FotoResultadoInternet) => {
    const urlAlvo = foto.urlOriginal || foto.url;
    onAdicionarFotos([urlAlvo]);
    onClose();
  };

  const handleAdicionarManual = () => {
    const limpo = urlManual.trim();
    if (!limpo.startsWith('http://') && !limpo.startsWith('https://')) return;
    onAdicionarFotos([limpo]);
    setUrlManual('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastandoSobre(true);
        }}
        onDragLeave={() => setArrastandoSobre(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastandoSobre(false);
          const files = Array.from(e.dataTransfer.files || []);
          const imageFile = files.find(f => f.type.startsWith('image/'));
          if (imageFile) {
            const reader = new FileReader();
            reader.onload = () => {
              const b64 = reader.result as string;
              if (b64) {
                setFotosEncontradas(prev => [
                  { url: b64, titulo: 'Foto arrastada e solta', fonte: 'Upload Direto' },
                  ...prev
                ]);
                setSelecionadas(prev => new Set(prev).add(b64));
                setMensagemToast('Foto adicionada por arrastar e soltar!');
                setTimeout(() => setMensagemToast(null), 3000);
              }
            };
            reader.readAsDataURL(imageFile);
          }
        }}
        className={`bg-slate-900 border rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 transition-all ${
          arrastandoSobre ? 'border-teal-400 ring-4 ring-teal-500/30' : 'border-slate-800'
        }`}
      >
        {/* Notificação Toast */}
        {mensagemToast && (
          <div className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold text-xs py-2 px-4 text-center animate-in fade-in flex items-center justify-center gap-1.5 shadow-md shrink-0">
            <Check className="w-4 h-4" />
            <span>{mensagemToast}</span>
          </div>
        )}

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
                {segmentoLoja && (
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-bold truncate max-w-[130px] sm:max-w-xs" title={`Segmento Ativo: ${segmentoLoja}`}>
                    {segmentoLoja.split('/')[0].trim()}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate max-w-md mt-0.5">
                Vagas na galeria: {vagasDisponiveis} de {maxFotos} fotos disponíveis • <span className="text-slate-300">Suporta colar foto com Ctrl+V</span>
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
          {fotoReferencia && (
            <div className="flex items-center gap-3 mb-3 p-3 rounded-2xl bg-teal-500/10 border border-teal-500/25">
              <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-teal-500/40 bg-slate-900 shadow-sm">
                <img src={fotoReferencia} alt="Foto de Referência" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-bold text-xs text-slate-100 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                  Pesquisa Híbrida Ativa (Foto + IA + Catálogo)
                </span>
                <span className="text-[11px] text-slate-400 block truncate mt-0.5">
                  A IA examina a foto do produto para buscar imagens em alta resolução em lojas e e-commerces.
                </span>
              </div>
            </div>
          )}

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

          {/* Opção rápida de colar link direto de foto */}
          <div className="mt-2.5 flex gap-2">
            <input
              type="text"
              value={urlManual}
              onChange={(e) => setUrlManual(e.target.value)}
              placeholder="Ou cole o link de uma foto da internet (URL)..."
              className="flex-1 bg-slate-900/80 border border-slate-800 focus:border-teal-500/60 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none transition"
            />
            <button
              type="button"
              disabled={!urlManual.trim().startsWith('http')}
              onClick={handleAdicionarManual}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-teal-600 disabled:opacity-40 text-slate-200 hover:text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Link</span>
            </button>
          </div>
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
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{erro}</p>
              {erroAutenticacao && onAbrirConfiguracaoChave && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onAbrirConfiguracaoChave();
                  }}
                  className="mt-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-teal-500/20"
                >
                  <Key className="w-4 h-4" />
                  <span>Configurar Chave SerpApi Agora</span>
                </button>
              )}
              {!erroAutenticacao && (
                <p className="text-[11px] text-slate-500">
                  Dica: experimente buscar pelo nome comercial ou pela marca principal do item.
                </p>
              )}
            </div>
          ) : fotosEncontradas.length > 0 ? (
            (() => {
              const fotosValidas = fotosEncontradas.filter(f => {
                const urlAlvo = f.urlOriginal || f.url;
                return !imagensComErro.has(urlAlvo);
              });
            if (fotosValidas.length === 0 && fotosEncontradas.length > 0) {
              return (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 max-w-md mx-auto">
                  <AlertCircle className="w-10 h-10 text-amber-400" />
                  <p className="text-xs sm:text-sm text-slate-300">Não foi possível carregar as fotos encontradas.</p>
                  <p className="text-[11px] text-slate-500">Tente buscar por um termo mais específico ou pelo nome da marca.</p>
                </div>
              );
            }
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                  <span>
                    {fotosValidas.length} fotos encontradas. Clique para selecionar ou adicionar:
                  </span>
                  <span className="font-bold text-teal-400">
                    {selecionadas.size} selecionada(s)
                  </span>
                </div>

                {/* Grid Responsivo de fotos */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                  {fotosValidas.map((foto, idx) => {
                    const urlAlvo = foto.urlOriginal || foto.url;
                    const falhouOriginal = falhasOriginal.has(urlAlvo);
                    // Prioriza o thumbnail do Google para carregamento instantâneo (CDN do Google). Se falhar, tenta a URL original
                    const urlExibicao = (!falhouOriginal && foto.thumbnail) ? foto.thumbnail : (foto.urlOriginal || foto.url);
                    const estaSelecionada = selecionadas.has(urlAlvo);
                    const estaCarregada = imagensCarregadas.has(urlExibicao);

                    return (
                      <div
                        key={idx}
                        onClick={() => toggleSelecao(foto)}
                        className={`group relative rounded-2xl overflow-hidden border-2 cursor-pointer transition flex flex-col bg-slate-800/80 shadow-md ${
                          estaSelecionada
                            ? 'border-teal-400 ring-2 ring-teal-400/40'
                            : 'border-slate-700/80 hover:border-slate-500'
                        }`}
                      >
                        {/* Imagem */}
                        <div className="relative aspect-square w-full bg-slate-950 flex items-center justify-center overflow-hidden p-2">
                          {!estaCarregada && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 z-10 gap-1.5">
                              <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
                              <span className="text-[10px] text-slate-400 font-medium">Carregando foto...</span>
                            </div>
                          )}

                          <img
                            src={urlExibicao}
                            alt={foto.titulo || 'Foto do produto'}
                            referrerPolicy="no-referrer"
                            className={`w-full h-full object-contain group-hover:scale-105 transition-all duration-300 ${
                              estaCarregada ? 'opacity-100' : 'opacity-0'
                            }`}
                            loading="lazy"
                            onLoad={() => {
                              setImagensCarregadas(prev => new Set(prev).add(urlExibicao));
                            }}
                            onError={() => {
                              if (!falhouOriginal && foto.urlOriginal && foto.urlOriginal !== urlExibicao) {
                                // Se o thumbnail do Google falhar, tenta a URL original
                                setFalhasOriginal(prev => new Set(prev).add(urlAlvo));
                              } else {
                                setImagensComErro(prev => new Set(prev).add(urlAlvo));
                              }
                            }}
                          />

                          {/* Badge de Resolução HD */}
                          {foto.largura && foto.largura >= 600 && (
                            <span className="absolute top-2 left-2 text-[9px] font-extrabold bg-emerald-950/80 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-600/60 z-20 shadow-sm">
                              HD
                            </span>
                          )}

                          {/* Checkbox de Seleção */}
                          <div
                            className={`absolute top-2 right-2 w-6 h-6 rounded-lg flex items-center justify-center transition shadow-md z-20 ${
                              estaSelecionada
                                ? 'bg-teal-500 text-white'
                                : 'bg-black/50 text-transparent border border-white/40 group-hover:border-white'
                            }`}
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                          </div>

                          {/* Tag de Fonte */}
                          <span className="absolute bottom-1.5 left-1.5 text-[9px] font-bold bg-slate-900/85 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700/80 z-20">
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
                              toggleSelecao(foto);
                            }}
                            className={`mt-2 w-full py-1.5 text-[10px] font-bold rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${
                              estaSelecionada
                                ? 'bg-teal-500 text-slate-950 font-black shadow-sm'
                                : 'bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white'
                            }`}
                          >
                            {estaSelecionada ? (
                              <>
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                <span>Foto Selecionada</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>Selecionar Foto</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
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

      {/* Modal de Alerta de Cota Mensal Excedida (250 buscas) */}
      <ModalQuotaExcedidaSerpApi
        isOpen={modalQuotaAberta}
        onClose={() => setModalQuotaAberta(false)}
      />
    </div>
  );
};
