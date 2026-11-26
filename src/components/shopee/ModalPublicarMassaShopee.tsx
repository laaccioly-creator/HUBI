import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Store,
  X,
  Minimize2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Filter,
  StopCircle,
  RotateCcw,
  ClipboardList,
  Download,
  Wrench,
  RefreshCw,
} from 'lucide-react';
import { Categoria, Produto } from '../../types';
import { AnuncioMlResumo } from '../ProdutosEstoque';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { formatarDataHoraLocal } from '../../utils/dateTime';
import { formatarMoeda } from '../../utils/formatters';
import { validarGtinGs1 } from '../../utils/gdmMercadoLivreMapper';
import {
  MarketplaceLotePublicacao,
  MarketplaceLotePublicacaoItem,
} from '../../services/mercadoLivrePublicacaoMassaService';
import {
  obterPermalinkAnuncioShopee,
  ShopeeContaLoja,
  shopeeService,
} from '../../services/shopeeService';
import {
  EstadoPublicacaoMassaShopee,
  shopeePublicacaoMassaService,
} from '../../services/shopeePublicacaoMassaService';
import {
  obterArvoreCategorias,
  obterCategoriaPaiId,
  obterSubcategoriaIdProduto,
  obterSubcategoriasDe,
} from '../../utils/categoriasHierarquia';
import { ModalVincularAnuncioShopee } from './ModalVincularAnuncioShopee';

export const ModalPublicarMassaShopee: React.FC = () => {
  const { loja, usuario } = useAuth();
  const { mostrarErro } = useFeedbackModal();
  const lojaId = loja?.id || '';

  const [estado, setEstado] = useState<EstadoPublicacaoMassaShopee>(() =>
    shopeePublicacaoMassaService.getEstado()
  );

  const [produtosLoja, setProdutosLoja] = useState<Produto[]>([]);
  const [categoriasLoja, setCategoriasLoja] = useState<Categoria[]>([]);
  const [mapaAnunciosShopee, setMapaAnunciosShopee] = useState<Record<string, AnuncioMlResumo[]>>({});
  const [contaShopee, setContaShopee] = useState<ShopeeContaLoja | null>(null);
  const [carregandoDadosBase, setCarregandoDadosBase] = useState<boolean>(false);

  const [modoEscopo, setModoEscopo] = useState<'todos' | 'categoria'>('todos');
  const [categoriaIdSelecionada, setCategoriaIdSelecionada] = useState<string>('');
  const [subcategoriaIdSelecionada, setSubcategoriaIdSelecionada] = useState<string>('');

  const [margemComissao, setMargemComissao] = useState<number>(20.0);
  const [custoFixo, setCustoFixo] = useState<number>(4.0);
  const [permitirSemEan, setPermitirSemEan] = useState<boolean>(true);

  const [lotesHistorico, setLotesHistorico] = useState<MarketplaceLotePublicacao[]>([]);
  const [carregandoLotes, setCarregandoLotes] = useState<boolean>(false);
  const [itensLoteSelecionado, setItensLoteSelecionado] = useState<MarketplaceLotePublicacaoItem[]>([]);
  const [carregandoItensLote, setCarregandoItensLote] = useState<boolean>(false);

  const [itemEmCorrecao, setItemEmCorrecao] = useState<MarketplaceLotePublicacaoItem | null>(null);
  const [produtoCorrecaoModal, setProdutoCorrecaoModal] = useState<Produto | null>(null);
  const [carregandoProdutoCorrecao, setCarregandoProdutoCorrecao] = useState<string | null>(null);

  useEffect(() => {
    return shopeePublicacaoMassaService.inscrever(() => {
      setEstado(shopeePublicacaoMassaService.getEstado());
    });
  }, []);

  const carregarDadosBaseDaLoja = useCallback(async () => {
    if (!lojaId) return;
    setCarregandoDadosBase(true);
    try {
      const [resCat, resProd, resShopee, conta] = await Promise.all([
        supabase.from('categorias').select('*').eq('loja_id', lojaId).order('nome'),
        supabase
          .from('produtos')
          .select('*, variacoes:variacoes_produto(*)')
          .eq('loja_id', lojaId)
          .order('nome'),
        supabase
          .from('marketplace_anuncios')
          .select('id, produto_id, variacao_id, ml_item_id, status_anuncio, permalink, sincronizacao_ativa')
          .eq('loja_id', lojaId)
          .eq('plataforma', 'shopee'),
        shopeeService.obterConta(lojaId),
      ]);

      if (!resCat.error && Array.isArray(resCat.data)) {
        setCategoriasLoja(resCat.data as Categoria[]);
      }
      if (!resProd.error && Array.isArray(resProd.data)) {
        setProdutosLoja(resProd.data as unknown as Produto[]);
      }
      if (!resShopee.error && Array.isArray(resShopee.data)) {
        const mapa: Record<string, AnuncioMlResumo[]> = {};
        for (const row of resShopee.data as AnuncioMlResumo[]) {
          if (!row.produto_id) continue;
          if (!mapa[row.produto_id]) mapa[row.produto_id] = [];
          mapa[row.produto_id].push(row);
        }
        setMapaAnunciosShopee(mapa);
      }

      setContaShopee(conta);
      if (conta && estado.status === 'ocioso') {
        if (typeof conta.taxa_comissao_padrao_percentual === 'number') {
          setMargemComissao(Number(conta.taxa_comissao_padrao_percentual));
        }
        if (typeof conta.taxa_fixa_padrao === 'number') {
          setCustoFixo(Number(conta.taxa_fixa_padrao));
        }
      }
    } catch (err) {
      console.warn('[ModalPublicarMassaShopee] Falha ao carregar dados base:', err);
    } finally {
      setCarregandoDadosBase(false);
    }
  }, [lojaId, estado.status]);

  const carregarHistoricoLotes = useCallback(async () => {
    if (!lojaId) return;
    setCarregandoLotes(true);
    try {
      const lista = await shopeePublicacaoMassaService.listarLotes(lojaId, 40);
      setLotesHistorico(lista);

      const idPreferido =
        shopeePublicacaoMassaService.getEstado().loteSelecionadoRelatorioId ||
        shopeePublicacaoMassaService.getEstado().loteAtualId;

      if (idPreferido && lista.some((l) => l.id === idPreferido)) {
        shopeePublicacaoMassaService.selecionarLoteRelatorio(idPreferido);
      } else if (lista.length > 0) {
        shopeePublicacaoMassaService.selecionarLoteRelatorio(lista[0].id);
      } else {
        shopeePublicacaoMassaService.selecionarLoteRelatorio(null);
      }
    } catch (err) {
      console.warn('[ModalPublicarMassaShopee] Erro ao carregar lotes:', err);
    } finally {
      setCarregandoLotes(false);
    }
  }, [lojaId]);

  useEffect(() => {
    if (!estado.modalAberto || estado.minimizado || !lojaId) return;
    void carregarDadosBaseDaLoja();
    void carregarHistoricoLotes();
  }, [
    estado.modalAberto,
    estado.minimizado,
    estado.versaoAtualizacao,
    lojaId,
    carregarDadosBaseDaLoja,
    carregarHistoricoLotes,
  ]);

  useEffect(() => {
    if (
      !estado.modalAberto ||
      estado.minimizado ||
      estado.abaAtiva !== 'relatorios' ||
      !lojaId ||
      !estado.loteSelecionadoRelatorioId
    ) {
      if (!estado.loteSelecionadoRelatorioId) {
        setItensLoteSelecionado([]);
      }
      return;
    }

    let ativo = true;
    setCarregandoItensLote(true);
    shopeePublicacaoMassaService
      .listarItensLote(lojaId, estado.loteSelecionadoRelatorioId)
      .then((itens) => {
        if (ativo) setItensLoteSelecionado(itens);
      })
      .catch(() => {
        if (ativo) setItensLoteSelecionado([]);
      })
      .finally(() => {
        if (ativo) setCarregandoItensLote(false);
      });

    return () => {
      ativo = false;
    };
  }, [
    estado.modalAberto,
    estado.minimizado,
    estado.abaAtiva,
    estado.loteSelecionadoRelatorioId,
    estado.versaoAtualizacao,
    lojaId,
  ]);

  const arvoreCategorias = useMemo(
    () => obterArvoreCategorias(categoriasLoja, lojaId),
    [categoriasLoja, lojaId]
  );

  const subcategoriasDaSelecionada = useMemo(
    () =>
      categoriaIdSelecionada
        ? obterSubcategoriasDe(categoriasLoja, categoriaIdSelecionada, lojaId)
        : [],
    [categoriasLoja, categoriaIdSelecionada, lojaId]
  );

  useEffect(() => {
    if (!estado.modalAberto || estado.minimizado || !lojaId || estado.status !== 'ocioso') {
      return;
    }
    if (estado.categoriaInicialId) {
      const catObj = categoriasLoja.find((c) => c.id === estado.categoriaInicialId);
      const paiId = catObj ? obterCategoriaPaiId(catObj, lojaId) : null;
      if (paiId) {
        setModoEscopo('categoria');
        setCategoriaIdSelecionada(paiId);
        setSubcategoriaIdSelecionada(catObj?.id || '');
      } else {
        setModoEscopo('categoria');
        setCategoriaIdSelecionada(estado.categoriaInicialId);
        setSubcategoriaIdSelecionada('');
      }
    } else {
      setModoEscopo('todos');
      setCategoriaIdSelecionada('');
      setSubcategoriaIdSelecionada('');
    }
  }, [estado.modalAberto, estado.minimizado, estado.categoriaInicialId, estado.status, categoriasLoja, lojaId]);

  const produtosElegiveis = useMemo(() => {
    return produtosLoja.filter((p) => {
      if (p.tipo_item === 'servico') return false;
      if (p.ativo === false) return false;
      if (mapaAnunciosShopee[p.id] && mapaAnunciosShopee[p.id].length > 0) return false;

      if (modoEscopo === 'categoria' && categoriaIdSelecionada) {
        const catSubIds = new Set<string>(
          obterSubcategoriasDe(categoriasLoja, categoriaIdSelecionada, lojaId).map((s) => s.id)
        );
        const subIdProd = obterSubcategoriaIdProduto(p, lojaId);
        if (subcategoriaIdSelecionada) {
          if (p.categoria_id !== subcategoriaIdSelecionada && subIdProd !== subcategoriaIdSelecionada) {
            return false;
          }
        } else {
          const pertencePai =
            p.categoria_id === categoriaIdSelecionada ||
            Boolean(p.categoria_id && catSubIds.has(p.categoria_id)) ||
            Boolean(subIdProd && catSubIds.has(subIdProd));
          if (!pertencePai) return false;
        }
      }
      return true;
    });
  }, [
    produtosLoja,
    mapaAnunciosShopee,
    modoEscopo,
    categoriaIdSelecionada,
    subcategoriaIdSelecionada,
    categoriasLoja,
    lojaId,
  ]);

  const escopoDescricaoAtual = useMemo(() => {
    if (modoEscopo !== 'categoria' || !categoriaIdSelecionada) {
      return 'Todos os produtos sem anúncio Shopee';
    }
    const catNome = categoriasLoja.find((c) => c.id === categoriaIdSelecionada)?.nome || 'Categoria';
    if (subcategoriaIdSelecionada) {
      const subNome =
        categoriasLoja.find((c) => c.id === subcategoriaIdSelecionada)?.nome || '';
      return subNome ? `${catNome} > ${subNome}` : catNome;
    }
    return catNome;
  }, [modoEscopo, categoriaIdSelecionada, subcategoriaIdSelecionada, categoriasLoja]);

  const handleFecharOuMinimizar = () => {
    if (estado.status === 'executando') {
      shopeePublicacaoMassaService.minimizar();
    } else {
      shopeePublicacaoMassaService.fecharModal();
    }
  };

  useRegisterOverlay(
    estado.modalAberto && !estado.minimizado,
    handleFecharOuMinimizar,
    'modal-publicar-massa-shopee',
    'modal'
  );

  if (!estado.modalAberto || estado.minimizado) {
    return null;
  }

  const handleIniciarLote = () => {
    if (!lojaId || produtosElegiveis.length === 0) return;
    shopeePublicacaoMassaService.iniciarLote({
      lojaId,
      contaId: contaShopee?.id || null,
      shopId: Number(contaShopee?.seller_id || contaShopee?.ml_user_id || 0) || null,
      usuarioId: usuario?.id || null,
      escopoTipo: modoEscopo,
      escopoDescricao: escopoDescricaoAtual,
      categoriaFiltroId: modoEscopo === 'categoria' ? categoriaIdSelecionada || null : null,
      subcategoriaFiltroId:
        modoEscopo === 'categoria' && subcategoriaIdSelecionada
          ? subcategoriaIdSelecionada
          : null,
      produtos: produtosElegiveis,
      categorias: categoriasLoja,
      margemComissao,
      custoFixo,
      permitirSemEan,
    });
  };

  const handleAbrirCorrigirItem = async (item: MarketplaceLotePublicacaoItem) => {
    try {
      setCarregandoProdutoCorrecao(item.id);
      const { data: prodDb, error } = await supabase
        .from('produtos')
        .select('*, variacoes:variacoes_produto(*)')
        .eq('id', item.produto_id)
        .eq('loja_id', lojaId)
        .maybeSingle();

      if (error || !prodDb) {
        mostrarErro('Não foi possível localizar os dados atualizados deste produto.');
        return;
      }
      setItemEmCorrecao(item);
      setProdutoCorrecaoModal(prodDb as unknown as Produto);
    } catch {
      mostrarErro('Falha ao abrir correção individual na Shopee.');
    } finally {
      setCarregandoProdutoCorrecao(null);
    }
  };

  const loteSelecionadoObj =
    lotesHistorico.find((l) => l.id === estado.loteSelecionadoRelatorioId) || null;
  const itensFalhaRelatorio = itensLoteSelecionado.filter((i) => i.status_item === 'falha');
  const itensSucessoRelatorio = itensLoteSelecionado.filter((i) => i.status_item === 'sucesso');
  const percentual = estado.total > 0 ? Math.round((estado.processados / estado.total) * 100) : 0;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white text-black border-2 border-slate-300 shadow-2xl p-6 space-y-5">
          {/* CABEÇALHO */}
          <div className="flex items-start justify-between gap-3 pb-4 border-b-2 border-slate-200">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-[#EE4D2D] flex items-center justify-center text-white shrink-0 shadow-xs">
                <Store className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-black text-xl text-black leading-tight">
                  Publicar em Massa na Shopee
                </h3>
                <p className="text-xs font-bold text-slate-700 mt-0.5">
                  Pipeline automático: Serper + JEV + GS1, espelhamento de fotos e descrição profissional
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {estado.status === 'executando' && (
                <button
                  type="button"
                  onClick={() => shopeePublicacaoMassaService.minimizar()}
                  title="Minimizar para o canto"
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black cursor-pointer"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handleFecharOuMinimizar}
                aria-label="Fechar"
                className="hubi-btn-close-x p-1.5 rounded-xl text-slate-700 hover:text-black transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ABAS */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100 border border-slate-300">
            <button
              type="button"
              onClick={() => shopeePublicacaoMassaService.definirAba('nova')}
              className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                estado.abaAtiva === 'nova'
                  ? 'bg-[#EE4D2D] text-white shadow-xs'
                  : 'text-black hover:bg-slate-200'
              }`}
            >
              <Store className="w-4 h-4" />
              <span>Nova Publicação em Massa</span>
            </button>
            <button
              type="button"
              onClick={() => shopeePublicacaoMassaService.definirAba('relatorios')}
              className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                estado.abaAtiva === 'relatorios'
                  ? 'bg-[#EE4D2D] text-white shadow-xs'
                  : 'text-black hover:bg-slate-200'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>Relatórios de Lotes ({lotesHistorico.length})</span>
            </button>
          </div>

          {/* ABA 1: NOVA PUBLICAÇÃO */}
          {estado.abaAtiva === 'nova' && (
            <>
              {estado.status === 'ocioso' && (
                <div className="space-y-4">
                  {/* ESCOPO */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-300 space-y-3">
                    <span className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5" />
                      <span>Escopo de Produtos para Publicação</span>
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setModoEscopo('todos')}
                        className={`p-3 rounded-xl border-2 text-left text-xs font-bold cursor-pointer ${
                          modoEscopo === 'todos'
                            ? 'bg-emerald-50 border-emerald-500 text-black'
                            : 'bg-white border-slate-300 text-black'
                        }`}
                      >
                        Todos os produtos sem anúncio Shopee
                      </button>
                      <button
                        type="button"
                        onClick={() => setModoEscopo('categoria')}
                        className={`p-3 rounded-xl border-2 text-left text-xs font-bold cursor-pointer ${
                          modoEscopo === 'categoria'
                            ? 'bg-emerald-50 border-emerald-500 text-black'
                            : 'bg-white border-slate-300 text-black'
                        }`}
                      >
                        Filtrar por Categoria / Subcategoria
                      </button>
                    </div>

                    {modoEscopo === 'categoria' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <select
                          value={categoriaIdSelecionada}
                          onChange={(e) => {
                            setCategoriaIdSelecionada(e.target.value);
                            setSubcategoriaIdSelecionada('');
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black"
                        >
                          <option value="">Todas as categorias</option>
                          {arvoreCategorias.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.nome}
                            </option>
                          ))}
                        </select>
                        {subcategoriasDaSelecionada.length > 0 && (
                          <select
                            value={subcategoriaIdSelecionada}
                            onChange={(e) => setSubcategoriaIdSelecionada(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black"
                          >
                            <option value="">Todas as subcategorias</option>
                            {subcategoriasDaSelecionada.map((sub) => (
                              <option key={sub.id} value={sub.id}>
                                {sub.nome}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>

                  {/* CONFIGURAÇÃO DE PREÇO E EAN */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-300 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-black">
                          Margem / Comissão Shopee (%)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="60"
                          step="0.5"
                          value={margemComissao}
                          onChange={(e) => setMargemComissao(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-black">
                          Taxa Fixa por Item (R$)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="30"
                          step="0.5"
                          value={custoFixo}
                          onChange={(e) => setCustoFixo(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black"
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs font-bold text-black cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permitirSemEan}
                        onChange={(e) => setPermitirSemEan(e.target.checked)}
                      />
                      <span>
                        Permitir publicar produtos sem EAN quando a IA não encontrar GTIN oficial
                      </span>
                    </label>
                  </div>

                  {/* RESUMO ELEGÍVEL */}
                  <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-black text-black block">
                        {carregandoDadosBase
                          ? 'Carregando produtos da loja...'
                          : `${produtosElegiveis.length} produto(s) pronto(s) para fila na Shopee`}
                      </span>
                      <span className="text-xs font-medium text-slate-800">
                        Produtos já vinculados na Shopee, serviços e inativos são ignorados automaticamente.
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={carregandoDadosBase || produtosElegiveis.length === 0}
                      onClick={handleIniciarLote}
                      className="px-5 py-2.5 rounded-xl bg-emerald-300 hover:bg-emerald-400 text-black text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <CheckCircle2 className="w-4 h-4 text-black" />
                      <span>Iniciar Publicação ({produtosElegiveis.length})</span>
                    </button>
                  </div>
                </div>
              )}

              {estado.status === 'executando' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl border-2 border-slate-300 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black text-black">
                        Processando: {estado.processados} de {estado.total} ({percentual}%)
                      </span>
                      <span className="text-xs font-bold text-slate-800 font-mono">
                        {estado.publicados} ok • {estado.falhas + estado.pulados} pendência(s)
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden border border-slate-300">
                      <div
                        className="h-full bg-emerald-400 transition-all duration-300"
                        style={{ width: `${percentual}%` }}
                      />
                    </div>
                    <div className="text-xs font-bold text-black">
                      Produto atual: {estado.produtoAtualNome || '-'}
                    </div>
                    <div className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                      <span>{estado.etapaAtual || 'Processando...'}</span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => shopeePublicacaoMassaService.cancelarExecucao()}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <StopCircle className="w-4 h-4" />
                      <span>Interromper Lote</span>
                    </button>
                  </div>
                </div>
              )}

              {(estado.status === 'concluido' || estado.status === 'cancelado') && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl border-2 border-emerald-400 bg-emerald-50 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-black text-black">
                        {estado.status === 'cancelado'
                          ? 'Publicação Shopee interrompida'
                          : 'Publicação Shopee concluída'}
                      </h4>
                      <p className="text-xs font-bold text-slate-800 mt-0.5">
                        {estado.publicados} publicado(s) • {estado.falhas} falha(s) • {estado.pulados} pulado(s)
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2 border-t-2 border-slate-200">
                    {estado.loteAtualId && (
                      <button
                        type="button"
                        onClick={() => shopeePublicacaoMassaService.abrirRelatorios(estado.loteAtualId)}
                        className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <ClipboardList className="w-4 h-4 text-black" />
                        <span>Ver Relatório do Lote</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => shopeePublicacaoMassaService.resetarParaNovaConfiguracao()}
                      className="hubi-btn-neutral px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4 text-black" />
                      <span>Nova Publicação</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleFecharOuMinimizar}
                      className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-sm cursor-pointer"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ABA 2: RELATÓRIOS DE LOTES */}
          {estado.abaAtiva === 'relatorios' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-black">
                  Lotes Shopee Executados ({lotesHistorico.length})
                </span>
                <button
                  type="button"
                  disabled={carregandoLotes}
                  onClick={() => void carregarHistoricoLotes()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-black ${carregandoLotes ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
              </div>

              {lotesHistorico.length === 0 ? (
                <div className="p-6 rounded-2xl border-2 border-slate-200 bg-slate-50 text-center text-sm font-bold text-black">
                  Nenhum lote Shopee registrado ainda nesta loja.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                    {lotesHistorico.map((lote) => {
                      const selecionado = lote.id === estado.loteSelecionadoRelatorioId;
                      return (
                        <button
                          key={lote.id}
                          type="button"
                          onClick={() => shopeePublicacaoMassaService.selecionarLoteRelatorio(lote.id)}
                          className={`w-full p-3 rounded-2xl border-2 text-left transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                            selecionado
                              ? 'bg-emerald-50 border-emerald-500 text-black'
                              : 'bg-white hover:bg-slate-50 border-slate-300 text-black'
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="text-xs font-black text-black block">
                              {formatarDataHoraLocal(lote.iniciado_em)} • {lote.escopo_descricao}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-[11px] font-black font-mono">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 border border-emerald-400 text-emerald-950">
                              {lote.total_sucesso} publicado(s)
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-400 text-amber-950">
                              {lote.total_falha} pendência(s)
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {loteSelecionadoObj && (
                    <div className="p-4 rounded-2xl border-2 border-slate-300 bg-slate-50 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-300">
                        <div>
                          <h4 className="text-sm font-black text-black">
                            Detalhes do Lote • {loteSelecionadoObj.escopo_descricao}
                          </h4>
                          <p className="text-xs font-bold text-slate-700 mt-0.5">
                            Iniciado em {formatarDataHoraLocal(loteSelecionadoObj.iniciado_em)} • Margem{' '}
                            {Number(loteSelecionadoObj.margem_sobrepreco_percentual || 0)}% • Taxa fixa{' '}
                            {formatarMoeda(Number(loteSelecionadoObj.custo_fixo || 0))}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={carregandoItensLote || itensLoteSelecionado.length === 0}
                          onClick={() =>
                            shopeePublicacaoMassaService.exportarRelatorioLoteXlsx(
                              loteSelecionadoObj,
                              itensLoteSelecionado,
                              loja?.nome_fantasia
                            )
                          }
                          className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Download className="w-4 h-4 text-black" />
                          <span>Exportar Relatório (.xlsx)</span>
                        </button>
                      </div>

                      {carregandoItensLote ? (
                        <div className="py-6 flex items-center justify-center gap-2 text-xs font-bold text-black">
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                          <span>Carregando itens do lote...</span>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {itensFalhaRelatorio.length > 0 && (
                            <div className="space-y-2.5">
                              <div className="flex items-center gap-1.5 text-xs font-black uppercase text-black">
                                <AlertTriangle className="w-4 h-4 text-amber-700" />
                                <span>Com Pendência / Erro ({itensFalhaRelatorio.length})</span>
                              </div>
                              <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
                                {itensFalhaRelatorio.map((item) => (
                                  <div
                                    key={item.id}
                                    className="p-3.5 rounded-xl border border-slate-300 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                  >
                                    <div className="min-w-0 flex-1 space-y-2">
                                      <div className="text-base font-bold text-black">
                                        {item.nome_produto_snapshot}
                                      </div>
                                      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm font-medium text-red-900 leading-relaxed">
                                        {item.motivo_erro || 'Falha não especificada.'}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={carregandoProdutoCorrecao === item.id}
                                      onClick={() => void handleAbrirCorrigirItem(item)}
                                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-xs inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                                    >
                                      <Wrench className="w-3.5 h-3.5 text-black" />
                                      <span>Corrigir e Publicar</span>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {itensSucessoRelatorio.length > 0 && (
                            <div className="space-y-2.5">
                              <div className="flex items-center gap-1.5 text-xs font-black uppercase text-black">
                                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                                <span>Publicados com Sucesso ({itensSucessoRelatorio.length})</span>
                              </div>
                              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                                {itensSucessoRelatorio.map((item) => {
                                  const link = obterPermalinkAnuncioShopee(
                                    item.permalink,
                                    item.ml_item_id,
                                    contaShopee?.seller_id || contaShopee?.ml_user_id
                                  );
                                  return (
                                    <div
                                      key={item.id}
                                      className="p-3.5 rounded-xl border border-slate-300 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                    >
                                      <div className="min-w-0 space-y-1">
                                        <div className="text-base font-bold text-black truncate">
                                          {item.nome_produto_snapshot}
                                        </div>
                                        <div className="text-sm font-medium text-slate-900 flex flex-wrap items-center gap-2">
                                          {item.ml_item_id && (
                                            <span className="font-mono">#{item.ml_item_id}</span>
                                          )}
                                          {typeof item.preco_calculado === 'number' && (
                                            <span>• {formatarMoeda(item.preco_calculado)}</span>
                                          )}
                                        </div>
                                      </div>
                                      {link && (
                                        <a
                                          href={link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-xs shrink-0"
                                        >
                                          <span>Ver na Shopee</span>
                                          <ExternalLink className="w-3.5 h-3.5 text-black" />
                                        </a>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CORRIGIR E PUBLICAR */}
      <ModalVincularAnuncioShopee
        aberto={Boolean(produtoCorrecaoModal)}
        onFechar={() => {
          setProdutoCorrecaoModal(null);
          setItemEmCorrecao(null);
        }}
        produto={produtoCorrecaoModal}
        lojaId={lojaId}
        abaInicial="publicar"
        onSucesso={(info) => {
          const itemAlvo = itemEmCorrecao;
          setProdutoCorrecaoModal(null);
          setItemEmCorrecao(null);
          if (itemAlvo && lojaId) {
            const gtinUsado =
              info?.gtinSincronizado && validarGtinGs1(info.gtinSincronizado)
                ? info.gtinSincronizado
                : null;
            void shopeePublicacaoMassaService
              .marcarItemCorrigidoComSucesso({
                lojaId,
                loteId: itemAlvo.lote_id,
                itemId: itemAlvo.id,
                mlItemId: info?.mlItemId || null,
                mlCategoryId: info?.mlCategoryId || null,
                permalink: info?.permalink || null,
                precoCalculado: info?.precoCalculado ?? null,
                gtinUtilizado: gtinUsado,
                gtinOrigem: gtinUsado ? 'cadastro' : 'isento',
              })
              .then(() => {
                shopeePublicacaoMassaService.notificarAtualizacaoExterna();
                void carregarHistoricoLotes();
              });
          }
        }}
      />
    </>
  );
};
