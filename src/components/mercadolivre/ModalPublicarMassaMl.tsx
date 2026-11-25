import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShoppingBag,
  X,
  Minimize2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Layers,
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
import {
  obterPermalinkAnuncioMl,
  validarGtinGs1,
} from '../../utils/gdmMercadoLivreMapper';
import {
  MarketplaceContaLoja,
  mercadoLivreService,
} from '../../services/mercadoLivreService';
import {
  EstadoPublicacaoMassaMl,
  MarketplaceLotePublicacao,
  MarketplaceLotePublicacaoItem,
  mercadoLivrePublicacaoMassaService,
} from '../../services/mercadoLivrePublicacaoMassaService';
import {
  obterArvoreCategorias,
  obterCategoriaPaiId,
  obterSubcategoriaIdProduto,
  obterSubcategoriasDe,
} from '../../utils/categoriasHierarquia';
import { ModalVincularAnuncioMl } from './ModalVincularAnuncioMl';

export const ModalPublicarMassaMl: React.FC = () => {
  const { loja, usuario } = useAuth();
  const { mostrarErro } = useFeedbackModal();
  const lojaId = loja?.id || '';

  const [estado, setEstado] = useState<EstadoPublicacaoMassaMl>(() =>
    mercadoLivrePublicacaoMassaService.getEstado()
  );

  // Dados carregados relacionalmente do Supabase para o lote e relatórios
  const [produtosLoja, setProdutosLoja] = useState<Produto[]>([]);
  const [categoriasLoja, setCategoriasLoja] = useState<Categoria[]>([]);
  const [mapaAnunciosMl, setMapaAnunciosMl] = useState<Record<string, AnuncioMlResumo[]>>({});
  const [contaMl, setContaMl] = useState<MarketplaceContaLoja | null>(null);
  const [carregandoDadosBase, setCarregandoDadosBase] = useState<boolean>(false);

  // Filtro de escopo integrado no modal
  const [modoEscopo, setModoEscopo] = useState<'todos' | 'categoria'>('todos');
  const [categoriaIdSelecionada, setCategoriaIdSelecionada] = useState<string>('');
  const [subcategoriaIdSelecionada, setSubcategoriaIdSelecionada] = useState<string>('');

  // Configuração financeira e de exposição do lote
  const [tipoAnuncio, setTipoAnuncio] = useState<'gold_special' | 'gold_pro'>('gold_special');
  const [margemComissao, setMargemComissao] = useState<number>(16.0);
  const [custoFixoAbaixo79, setCustoFixoAbaixo79] = useState<number>(6.0);
  const [permitirSemEan, setPermitirSemEan] = useState<boolean>(true);
  const [carregandoConfigConta, setCarregandoConfigConta] = useState<boolean>(false);

  // Estados da aba Relatórios de Lotes
  const [lotesHistorico, setLotesHistorico] = useState<MarketplaceLotePublicacao[]>([]);
  const [carregandoLotes, setCarregandoLotes] = useState<boolean>(false);
  const [itensLoteSelecionado, setItensLoteSelecionado] = useState<MarketplaceLotePublicacaoItem[]>([]);
  const [carregandoItensLote, setCarregandoItensLote] = useState<boolean>(false);

  // Estado de correção individual a partir do relatório
  const [itemEmCorrecao, setItemEmCorrecao] = useState<MarketplaceLotePublicacaoItem | null>(null);
  const [produtoCorrecaoModal, setProdutoCorrecaoModal] = useState<Produto | null>(null);
  const [carregandoProdutoCorrecao, setCarregandoProdutoCorrecao] = useState<string | null>(null);

  useEffect(() => {
    return mercadoLivrePublicacaoMassaService.inscrever(() => {
      setEstado(mercadoLivrePublicacaoMassaService.getEstado());
    });
  }, []);

  const carregarDadosBaseDaLoja = useCallback(async () => {
    if (!lojaId) return;
    setCarregandoDadosBase(true);
    setCarregandoConfigConta(true);
    try {
      const [resCat, resProd, resMl, conta] = await Promise.all([
        supabase.from('categorias').select('*').eq('loja_id', lojaId).order('nome'),
        supabase
          .from('produtos')
          .select('*, variacoes:variacoes_produto(*)')
          .eq('loja_id', lojaId)
          .order('nome'),
        supabase
          .from('marketplace_anuncios')
          .select('id, produto_id, variacao_id, ml_item_id, status_anuncio, permalink, sincronizacao_ativa')
          .eq('loja_id', lojaId),
        mercadoLivreService.obterConta(lojaId),
      ]);

      if (!resCat.error && Array.isArray(resCat.data)) {
        setCategoriasLoja(resCat.data as Categoria[]);
      }

      if (!resProd.error && Array.isArray(resProd.data)) {
        setProdutosLoja(resProd.data as unknown as Produto[]);
      }

      if (!resMl.error && Array.isArray(resMl.data)) {
        const mapa: Record<string, AnuncioMlResumo[]> = {};
        for (const row of resMl.data as AnuncioMlResumo[]) {
          if (!row.produto_id) continue;
          if (!mapa[row.produto_id]) mapa[row.produto_id] = [];
          mapa[row.produto_id].push(row);
        }
        setMapaAnunciosMl(mapa);
      }

      setContaMl(conta);
      if (conta && estado.status === 'ocioso') {
        if (typeof conta.taxa_comissao_padrao_percentual === 'number') {
          setMargemComissao(Number(conta.taxa_comissao_padrao_percentual));
        }
        if (typeof conta.taxa_fixa_padrao === 'number') {
          setCustoFixoAbaixo79(Number(conta.taxa_fixa_padrao));
        }
      }
    } catch (err) {
      console.warn('[ModalPublicarMassaMl] Falha ao carregar dados base da loja:', err);
    } finally {
      setCarregandoDadosBase(false);
      setCarregandoConfigConta(false);
    }
  }, [lojaId, estado.status]);

  const carregarHistoricoLotes = useCallback(async () => {
    if (!lojaId) return;
    setCarregandoLotes(true);
    try {
      const lista = await mercadoLivrePublicacaoMassaService.listarLotes(lojaId, 40);
      setLotesHistorico(lista);

      const idPreferido =
        mercadoLivrePublicacaoMassaService.getEstado().loteSelecionadoRelatorioId ||
        mercadoLivrePublicacaoMassaService.getEstado().loteAtualId;

      if (idPreferido && lista.some((l) => l.id === idPreferido)) {
        mercadoLivrePublicacaoMassaService.selecionarLoteRelatorio(idPreferido);
      } else if (lista.length > 0) {
        mercadoLivrePublicacaoMassaService.selecionarLoteRelatorio(lista[0].id);
      } else {
        mercadoLivrePublicacaoMassaService.selecionarLoteRelatorio(null);
      }
    } catch (err) {
      console.warn('[ModalPublicarMassaMl] Erro ao carregar lotes:', err);
    } finally {
      setCarregandoLotes(false);
    }
  }, [lojaId]);

  // Carrega produtos, vínculos e histórico sempre que o modal estiver aberto
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

  // Carrega os itens do lote selecionado na aba Relatórios
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
    mercadoLivrePublicacaoMassaService
      .listarItensLote(lojaId, estado.loteSelecionadoRelatorioId)
      .then((itens) => {
        if (ativo) setItensLoteSelecionado(itens);
      })
      .catch((err) => {
        console.warn('[ModalPublicarMassaMl] Erro ao carregar itens do lote:', err);
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

  // Sincroniza escopo inicial vindo do filtro de tela quando abre em modo ocioso
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
      setCategoriaIdSelecionada((prev) => prev || arvoreCategorias[0]?.id || '');
      setSubcategoriaIdSelecionada('');
    }
  }, [
    estado.modalAberto,
    estado.minimizado,
    estado.status,
    estado.categoriaInicialId,
    lojaId,
    categoriasLoja,
    arvoreCategorias,
  ]);

  const handleFecharOuMinimizar = () => {
    mercadoLivrePublicacaoMassaService.fecharModal();
  };

  useRegisterOverlay(
    estado.modalAberto && !estado.minimizado && !produtoCorrecaoModal,
    handleFecharOuMinimizar,
    'modal-publicar-massa-ml',
    'modal'
  );

  // Calcula produtos no escopo e separa elegíveis vs já vinculados ao ML
  const { elegiveis, jaVinculados } = useMemo(() => {
    const ativosFisicos = produtosLoja.filter(
      (p) => p.ativo !== false && p.tipo_item !== 'servico'
    );

    const noEscopo = ativosFisicos.filter((p) => {
      if (modoEscopo === 'todos') return true;
      if (!categoriaIdSelecionada) return true;

      const subIdProduto = obterSubcategoriaIdProduto(p, lojaId);
      const idsFilhas = new Set(subcategoriasDaSelecionada.map((s) => s.id));

      if (subcategoriaIdSelecionada) {
        return (
          subIdProduto === subcategoriaIdSelecionada ||
          p.categoria_id === subcategoriaIdSelecionada
        );
      }

      return (
        p.categoria_id === categoriaIdSelecionada ||
        (subIdProduto ? idsFilhas.has(subIdProduto) : false) ||
        (p.categoria_id ? idsFilhas.has(p.categoria_id) : false)
      );
    });

    const listaElegiveis: Produto[] = [];
    let qtdVinculados = 0;

    for (const p of noEscopo) {
      const possuiVinculo = Boolean(mapaAnunciosMl[p.id] && mapaAnunciosMl[p.id].length > 0);
      if (possuiVinculo) {
        qtdVinculados++;
      } else {
        listaElegiveis.push(p);
      }
    }

    return { elegiveis: listaElegiveis, jaVinculados: qtdVinculados };
  }, [
    produtosLoja,
    modoEscopo,
    categoriaIdSelecionada,
    subcategoriaIdSelecionada,
    subcategoriasDaSelecionada,
    mapaAnunciosMl,
    lojaId,
  ]);

  const ultimoLoteConcluido = useMemo(() => {
    return (
      lotesHistorico.find((l) => l.status_lote !== 'em_andamento') ||
      lotesHistorico[0] ||
      null
    );
  }, [lotesHistorico]);

  const loteSelecionadoObj = useMemo(() => {
    return (
      lotesHistorico.find((l) => l.id === estado.loteSelecionadoRelatorioId) || null
    );
  }, [lotesHistorico, estado.loteSelecionadoRelatorioId]);

  const { itensSucessoRelatorio, itensFalhaRelatorio } = useMemo(() => {
    return {
      itensSucessoRelatorio: itensLoteSelecionado.filter((i) => i.status_item === 'sucesso'),
      itensFalhaRelatorio: itensLoteSelecionado.filter((i) => i.status_item === 'falha'),
    };
  }, [itensLoteSelecionado]);

  if (!estado.modalAberto || estado.minimizado) {
    return null;
  }

  const progressoPercentual =
    estado.total > 0 ? Math.round((estado.processados / estado.total) * 100) : 0;

  const montarDescricaoEscopo = (): string => {
    if (modoEscopo === 'todos' || !categoriaIdSelecionada) {
      return 'Todos os produtos ativos';
    }
    const catPai = categoriasLoja.find((c) => c.id === categoriaIdSelecionada);
    const catSub = subcategoriaIdSelecionada
      ? categoriasLoja.find((c) => c.id === subcategoriaIdSelecionada)
      : null;
    if (catPai && catSub) {
      return `Categoria: ${catPai.nome} > ${catSub.nome}`;
    }
    if (catPai) {
      return `Categoria: ${catPai.nome}`;
    }
    return 'Categoria selecionada';
  };

  const handleIniciarLote = () => {
    if (!lojaId || elegiveis.length === 0) return;

    mercadoLivrePublicacaoMassaService.iniciarLote({
      lojaId,
      contaId: contaMl?.id || null,
      usuarioId: usuario?.id || null,
      escopoTipo: modoEscopo === 'categoria' && categoriaIdSelecionada ? 'categoria' : 'todos',
      escopoDescricao: montarDescricaoEscopo(),
      categoriaFiltroId: modoEscopo === 'categoria' ? categoriaIdSelecionada || null : null,
      subcategoriaFiltroId:
        modoEscopo === 'categoria' ? subcategoriaIdSelecionada || null : null,
      produtos: elegiveis,
      categorias: categoriasLoja,
      tipoAnuncio,
      margemComissao: Number.isFinite(margemComissao) ? margemComissao : 0,
      custoFixoAbaixo79: Number.isFinite(custoFixoAbaixo79) ? custoFixoAbaixo79 : 0,
      permitirSemEanQuandoCategoriaAceitar: permitirSemEan,
    });
  };

  const handleAbrirCorrigirItem = async (item: MarketplaceLotePublicacaoItem) => {
    if (!lojaId) return;
    setCarregandoProdutoCorrecao(item.id);
    try {
      const { data: prodDb, error } = await supabase
        .from('produtos')
        .select('*, variacoes:variacoes_produto(*)')
        .eq('id', item.produto_id)
        .eq('loja_id', lojaId)
        .maybeSingle();

      if (error || !prodDb) {
        mostrarErro(
          'Produto não encontrado ou removido do catálogo da loja.',
          'Correção Indisponível'
        );
        return;
      }

      setItemEmCorrecao(item);
      setProdutoCorrecaoModal(prodDb as unknown as Produto);
    } catch {
      mostrarErro('Não foi possível abrir o produto para correção.', 'Erro');
    } finally {
      setCarregandoProdutoCorrecao(null);
    }
  };

  const labelOrigemGtin = (origem: string | null): string => {
    if (origem === 'cadastro') return 'Cadastro Rubi';
    if (origem === 'ia_gs1') return 'IA (GS1)';
    if (origem === 'isento') return 'Sem EAN';
    return 'Não informado';
  };

  const labelStatusLote = (statusLote: string): string => {
    if (statusLote === 'concluido') return 'Concluído';
    if (statusLote === 'cancelado') return 'Interrompido';
    return 'Em andamento';
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={(e) => {
          if (e.target === e.currentTarget && !produtoCorrecaoModal) handleFecharOuMinimizar();
        }}
      >
        <div className="w-full max-w-3xl rounded-3xl p-6 shadow-2xl border-2 border-slate-300 bg-white text-black flex flex-col max-h-[92vh] overflow-y-auto space-y-5 animate-in zoom-in-95 duration-150">
          {/* CABEÇALHO */}
          <div className="flex items-start justify-between gap-3 pb-3 border-b-2 border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#FFE600] border border-amber-400 flex items-center justify-center text-black font-black shadow-xs shrink-0">
                <ShoppingBag className="w-5 h-5 text-black" />
              </div>
              <div>
                <h3 className="font-black text-lg leading-tight text-black">
                  Publicação em Massa no Mercado Livre
                </h3>
                <p className="text-xs font-bold text-slate-700 mt-0.5">
                  {estado.abaAtiva === 'relatorios'
                    ? 'Histórico relacional de lotes publicados, pendências e correção rápida'
                    : estado.status === 'ocioso'
                    ? 'Selecione o escopo e configure os parâmetros do lote'
                    : estado.status === 'executando'
                    ? `Publicando no Mercado Livre: ${estado.processados} de ${estado.total}...`
                    : estado.status === 'cancelado'
                    ? 'Publicação em massa interrompida'
                    : 'Publicação em massa concluída'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {estado.status === 'executando' && (
                <button
                  type="button"
                  onClick={() => mercadoLivrePublicacaoMassaService.minimizar()}
                  title="Minimizar para continuar usando o sistema"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black text-xs font-bold transition cursor-pointer"
                >
                  <Minimize2 className="w-3.5 h-3.5 text-black" />
                  <span>Minimizar</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleFecharOuMinimizar}
                aria-label="Fechar"
                title={estado.status === 'executando' ? 'Minimizar para segundo plano' : 'Fechar'}
                className="hubi-btn-close-x p-1.5 rounded-xl text-slate-700 hover:text-black transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ALTERNADOR DE ABAS SUPERIOR */}
          <div className="flex items-center gap-2 border-b-2 border-slate-200 pb-3">
            <button
              type="button"
              onClick={() => mercadoLivrePublicacaoMassaService.definirAba('nova')}
              className={`px-4 py-2 rounded-xl text-xs transition cursor-pointer inline-flex items-center gap-2 border ${
                estado.abaAtiva === 'nova'
                  ? 'bg-slate-200 border-slate-400 text-black font-bold shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black font-medium'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 text-black" />
              <span>Nova Publicação em Massa</span>
            </button>

            <button
              type="button"
              onClick={() => mercadoLivrePublicacaoMassaService.definirAba('relatorios')}
              className={`px-4 py-2 rounded-xl text-xs transition cursor-pointer inline-flex items-center gap-2 border ${
                estado.abaAtiva === 'relatorios'
                  ? 'bg-slate-200 border-slate-400 text-black font-bold shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black font-medium'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5 text-black" />
              <span>Relatórios de Lotes</span>
              {ultimoLoteConcluido && ultimoLoteConcluido.total_falha > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black font-mono">
                  {ultimoLoteConcluido.total_falha}
                </span>
              )}
            </button>
          </div>

          {/* ================================================================= */}
          {/* ABA 1: NOVA PUBLICAÇÃO / EXECUÇÃO / RESUMO RÁPIDO                 */}
          {/* ================================================================= */}
          {estado.abaAtiva === 'nova' && (
            <>
              {estado.status === 'ocioso' && (
                <div className="space-y-5">
                  {/* Filtro de Escopo Integrado */}
                  <div className="space-y-3 p-4 rounded-2xl border-2 border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-black">
                        <Filter className="w-4 h-4 text-black" />
                        <span>Escopo de Produtos</span>
                      </div>
                      {carregandoDadosBase && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Atualizando catálogo...
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setModoEscopo('todos')}
                        className={`p-3 rounded-xl border-2 text-left transition cursor-pointer ${
                          modoEscopo === 'todos'
                            ? 'bg-emerald-50 border-emerald-500 text-black'
                            : 'bg-white border-slate-300 hover:bg-slate-100 text-black'
                        }`}
                      >
                        <div className="text-xs font-black">Todos os produtos ativos da loja</div>
                        <div className="text-[11px] font-medium text-slate-700 mt-0.5">
                          Considera toda a loja ainda sem vínculo no ML
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setModoEscopo('categoria')}
                        className={`p-3 rounded-xl border-2 text-left transition cursor-pointer ${
                          modoEscopo === 'categoria'
                            ? 'bg-emerald-50 border-emerald-500 text-black'
                            : 'bg-white border-slate-300 hover:bg-slate-100 text-black'
                        }`}
                      >
                        <div className="text-xs font-black">Filtrar por Categoria / Subcategoria</div>
                        <div className="text-[11px] font-medium text-slate-700 mt-0.5">
                          Escolha categoria e subcategoria neste modal
                        </div>
                      </button>
                    </div>

                    {modoEscopo === 'categoria' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-in fade-in duration-150">
                        <div className="space-y-1.5">
                          <label className="text-xs font-black text-black block">Categoria</label>
                          <select
                            value={categoriaIdSelecionada}
                            onChange={(e) => {
                              setCategoriaIdSelecionada(e.target.value);
                              setSubcategoriaIdSelecionada('');
                            }}
                            className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-black outline-hidden focus:border-emerald-500"
                          >
                            {arvoreCategorias.length === 0 ? (
                              <option value="">Nenhuma categoria cadastrada</option>
                            ) : (
                              <>
                                <option value="">Todas as categorias</option>
                                {arvoreCategorias.map((cat) => (
                                  <option key={cat.id} value={cat.id}>
                                    {cat.nome}
                                  </option>
                                ))}
                              </>
                            )}
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-black text-black block">
                            Subcategoria (opcional)
                          </label>
                          <select
                            value={subcategoriaIdSelecionada}
                            onChange={(e) => setSubcategoriaIdSelecionada(e.target.value)}
                            disabled={subcategoriasDaSelecionada.length === 0}
                            className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-black outline-hidden focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                          >
                            {subcategoriasDaSelecionada.length === 0 ? (
                              <option value="">Sem subcategorias vinculadas</option>
                            ) : (
                              <>
                                <option value="">Todas as subcategorias</option>
                                {subcategoriasDaSelecionada.map((sub) => (
                                  <option key={sub.id} value={sub.id}>
                                    {sub.nome}
                                  </option>
                                ))}
                              </>
                            )}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Contador em Tempo Real */}
                    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border-2 border-slate-300 text-xs font-black text-black">
                      <Layers className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>
                        {elegiveis.length === 1
                          ? '1 produto disponível para publicar'
                          : `${elegiveis.length} produtos disponíveis para publicar`}
                        {jaVinculados > 0
                          ? ` (${jaVinculados} ${jaVinculados === 1 ? 'já vinculado foi ignorado' : 'já vinculados foram ignorados'})`
                          : ''}
                      </span>
                    </div>
                  </div>

                  {/* Configuração Financeira e de Exposição */}
                  <div className="space-y-4 p-4 rounded-2xl border-2 border-slate-200 bg-white">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-black">
                        Exposição e Precificação do Lote
                      </span>
                      {carregandoConfigConta && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Carregando padrões...
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-black block">Tipo de Exposição</label>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setTipoAnuncio('gold_special')}
                          className={`p-3 rounded-xl border-2 text-left transition cursor-pointer ${
                            tipoAnuncio === 'gold_special'
                              ? 'bg-emerald-50 border-emerald-500 text-black'
                              : 'bg-slate-50 border-slate-300 hover:bg-slate-100 text-black'
                          }`}
                        >
                          <div className="text-xs font-black">Clássico</div>
                          <div className="text-[11px] font-medium text-slate-700">
                            Exposição padrão (menor tarifa)
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTipoAnuncio('gold_pro')}
                          className={`p-3 rounded-xl border-2 text-left transition cursor-pointer ${
                            tipoAnuncio === 'gold_pro'
                              ? 'bg-emerald-50 border-emerald-500 text-black'
                              : 'bg-slate-50 border-slate-300 hover:bg-slate-100 text-black'
                          }`}
                        >
                          <div className="text-xs font-black">Premium</div>
                          <div className="text-[11px] font-medium text-slate-700">
                            Exposição máxima e parcelamento
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-black block">
                          Margem / Comissão (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={90}
                          step={0.5}
                          value={margemComissao}
                          onChange={(e) => setMargemComissao(Number(e.target.value) || 0)}
                          className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm font-black text-black outline-hidden focus:border-emerald-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-black block">
                          Custo Fixo (&lt; R$ 79,00)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={custoFixoAbaixo79}
                          onChange={(e) => setCustoFixoAbaixo79(Number(e.target.value) || 0)}
                          className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm font-black text-black outline-hidden focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={permitirSemEan}
                        onChange={(e) => setPermitirSemEan(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-emerald-600 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-black leading-relaxed">
                        Buscar EAN oficial com IA quando ausente no cadastro e publicar sem EAN apenas se a categoria permitir (pular se exigir EAN obrigatório)
                      </span>
                    </label>
                  </div>

                  {/* Rodapé Ações */}
                  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2 border-t-2 border-slate-200">
                    <button
                      type="button"
                      onClick={handleFecharOuMinimizar}
                      className="hubi-btn-neutral px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-sm transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={elegiveis.length === 0 || carregandoDadosBase}
                      onClick={handleIniciarLote}
                      className="px-5 py-2.5 rounded-xl bg-emerald-300 hover:bg-emerald-400 text-black font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ShoppingBag className="w-4 h-4 text-black" />
                      <span>Iniciar Publicação em Massa ({elegiveis.length})</span>
                    </button>
                  </div>
                </div>
              )}

              {estado.status === 'executando' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-2xl border-2 border-slate-300 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between text-xs font-black text-black">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                        <span>
                          Publicando no Mercado Livre: {estado.processados} de {estado.total}...
                        </span>
                      </span>
                      <span className="font-mono">{progressoPercentual}%</span>
                    </div>

                    <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden border border-slate-300">
                      <div
                        className="h-full bg-emerald-400 transition-all duration-300"
                        style={{ width: `${progressoPercentual}%` }}
                      />
                    </div>

                    {estado.produtoAtualNome && (
                      <div className="text-xs text-black space-y-0.5 pt-1">
                        <div className="font-black truncate">
                          Item atual: {estado.produtoAtualNome}
                        </div>
                        <div className="font-medium text-slate-700">{estado.etapaAtual}</div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 rounded-2xl border-2 border-slate-200 bg-white">
                      <div className="text-[11px] font-black uppercase text-slate-700">
                        Processados
                      </div>
                      <div className="text-lg font-black font-mono text-black mt-0.5">
                        {estado.processados}/{estado.total}
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50">
                      <div className="text-[11px] font-black uppercase text-emerald-900">
                        Publicados
                      </div>
                      <div className="text-lg font-black font-mono text-emerald-900 mt-0.5">
                        {estado.publicados}
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl border-2 border-amber-300 bg-amber-50">
                      <div className="text-[11px] font-black uppercase text-amber-900">
                        Pendências
                      </div>
                      <div className="text-lg font-black font-mono text-amber-900 mt-0.5">
                        {estado.falhas + estado.pulados}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2.5 pt-2 border-t-2 border-slate-200">
                    <button
                      type="button"
                      onClick={() => mercadoLivrePublicacaoMassaService.cancelarExecucao()}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-bold text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <StopCircle className="w-4 h-4 text-black" />
                      <span>Interromper Fila</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => mercadoLivrePublicacaoMassaService.minimizar()}
                      className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-sm inline-flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                    >
                      <Minimize2 className="w-4 h-4 text-black" />
                      <span>Minimizar e Continuar Usando o Rubi</span>
                    </button>
                  </div>
                </div>
              )}

              {(estado.status === 'concluido' || estado.status === 'cancelado') && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50">
                      <div className="flex items-center gap-2 text-xs font-black uppercase text-emerald-900">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                        <span>Total Publicado</span>
                      </div>
                      <div className="text-2xl font-black font-mono text-black mt-1">
                        {estado.publicados}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl border-2 border-amber-300 bg-amber-50">
                      <div className="flex items-center gap-2 text-xs font-black uppercase text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-700" />
                        <span>Pulados / Com Pendência</span>
                      </div>
                      <div className="text-2xl font-black font-mono text-black mt-1">
                        {estado.falhas + estado.pulados}
                      </div>
                    </div>
                  </div>

                  {estado.itensPublicados.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-black">
                        Anúncios Publicados ({estado.itensPublicados.length})
                      </h4>
                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                        {estado.itensPublicados.map((item) => (
                          <div
                            key={`${item.produtoId}-${item.mlItemId}`}
                            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-black text-black truncate">{item.nome}</div>
                              <div className="text-[11px] font-mono font-bold text-slate-700">
                                {item.mlItemId}
                                {item.gtinSincronizado ? ` • EAN: ${item.gtinSincronizado}` : ''}
                              </div>
                            </div>
                            {item.permalink && (
                              <a
                                href={item.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-bold text-[11px] shrink-0 transition"
                              >
                                <span>Ver no Mercado Livre</span>
                                <ExternalLink className="w-3 h-3 text-black" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {estado.itensFalha.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-black">
                        Itens com Pendência ou Falha ({estado.itensFalha.length})
                      </h4>
                      <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                        {estado.itensFalha.map((falha, idx) => (
                          <div
                            key={`${falha.produtoId}-${idx}`}
                            className="p-3 rounded-xl border border-slate-300 bg-slate-50 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-black text-black">{falha.nome}</span>
                              <span className="px-2 py-0.5 rounded-md border border-slate-300 bg-white text-[10px] font-black uppercase text-black shrink-0">
                                {falha.tipo === 'pulado' ? 'Pulado' : 'Falha'}
                              </span>
                            </div>
                            <p className="text-[11px] font-medium text-slate-800 leading-relaxed">
                              {falha.motivo}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2 border-t-2 border-slate-200">
                    {estado.loteAtualId && (
                      <button
                        type="button"
                        onClick={() =>
                          mercadoLivrePublicacaoMassaService.abrirRelatorios(estado.loteAtualId)
                        }
                        className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <ClipboardList className="w-4 h-4 text-black" />
                        <span>Ver Relatório do Lote</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => mercadoLivrePublicacaoMassaService.resetarParaNovaConfiguracao()}
                      className="hubi-btn-neutral px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4 text-black" />
                      <span>Nova Publicação</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleFecharOuMinimizar}
                      className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-sm transition cursor-pointer"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ================================================================= */}
          {/* ABA 2: RELATÓRIOS DE LOTES (BANCO RELACIONAL SUPABASE)            */}
          {/* ================================================================= */}
          {estado.abaAtiva === 'relatorios' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-black">
                  Lotes Executados ({lotesHistorico.length})
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

              {carregandoLotes && lotesHistorico.length === 0 ? (
                <div className="py-10 flex items-center justify-center gap-2 text-sm font-bold text-black">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
                  <span>Carregando histórico de lotes...</span>
                </div>
              ) : lotesHistorico.length === 0 ? (
                <div className="p-6 rounded-2xl border-2 border-slate-200 bg-slate-50 text-center space-y-1.5">
                  <p className="text-sm font-black text-black">
                    Nenhum lote de publicação registrado ainda nesta loja.
                  </p>
                  <p className="text-xs font-medium text-slate-700">
                    Ao iniciar uma publicação em massa, cada execução e item processado ficará salvo aqui para consulta e correção.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Lista horizontal/compacta de lotes */}
                  <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                    {lotesHistorico.map((lote) => {
                      const selecionado = lote.id === estado.loteSelecionadoRelatorioId;
                      return (
                        <button
                          key={lote.id}
                          type="button"
                          onClick={() =>
                            mercadoLivrePublicacaoMassaService.selecionarLoteRelatorio(lote.id)
                          }
                          className={`w-full p-3 rounded-2xl border-2 text-left transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                            selecionado
                              ? 'bg-emerald-50 border-emerald-500 text-black'
                              : 'bg-white hover:bg-slate-50 border-slate-300 text-black'
                          }`}
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black text-black">
                                {formatarDataHoraLocal(lote.iniciado_em)}
                              </span>
                              <span className="px-2 py-0.5 rounded-md border border-slate-300 bg-white text-[10px] font-black uppercase text-black">
                                {labelStatusLote(lote.status_lote)}
                              </span>
                              <span className="px-2 py-0.5 rounded-md border border-slate-300 bg-slate-100 text-[10px] font-bold text-black">
                                {lote.tipo_exposicao === 'gold_pro' ? 'Premium' : 'Clássico'}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-800 truncate">
                              {lote.escopo_descricao}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 text-[11px] font-black font-mono">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 border border-emerald-400 text-emerald-950">
                              {lote.total_sucesso} publicado(s)
                            </span>
                            <span
                              className={`px-2.5 py-1 rounded-lg border ${
                                lote.total_falha > 0
                                  ? 'bg-amber-100 border-amber-400 text-amber-950'
                                  : 'bg-slate-100 border-slate-300 text-slate-800'
                              }`}
                            >
                              {lote.total_falha} pendência(s)
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Detalhes do Lote Selecionado */}
                  {loteSelecionadoObj && (
                    <div className="p-4 rounded-2xl border-2 border-slate-300 bg-slate-50 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-300">
                        <div>
                          <h4 className="text-sm font-black text-black">
                            Detalhes do Lote • {loteSelecionadoObj.escopo_descricao}
                          </h4>
                          <p className="text-xs font-bold text-slate-700 mt-0.5">
                            Iniciado em {formatarDataHoraLocal(loteSelecionadoObj.iniciado_em)} •{' '}
                            Margem {Number(loteSelecionadoObj.margem_sobrepreco_percentual || 0)}% •{' '}
                            Custo fixo {formatarMoeda(Number(loteSelecionadoObj.custo_fixo || 0))}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={carregandoItensLote || itensLoteSelecionado.length === 0}
                          onClick={() =>
                            mercadoLivrePublicacaoMassaService.exportarRelatorioLoteXlsx(
                              loteSelecionadoObj,
                              itensLoteSelecionado,
                              loja?.nome_fantasia
                            )
                          }
                          className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-xs inline-flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50 shrink-0"
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
                      ) : itensLoteSelecionado.length === 0 ? (
                        <p className="text-xs font-bold text-slate-800 text-center py-4">
                          Nenhum item processado encontrado para este lote.
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {/* ITENS COM PENDÊNCIA / ERRO */}
                          {itensFalhaRelatorio.length > 0 && (
                            <div className="space-y-2.5">
                              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-black">
                                <AlertTriangle className="w-4 h-4 text-amber-700" />
                                <span>
                                  Com Pendência / Erro ({itensFalhaRelatorio.length})
                                </span>
                              </div>
                              <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
                                {itensFalhaRelatorio.map((item) => (
                                  <div
                                    key={item.id}
                                    className="p-3.5 rounded-xl border border-slate-300 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                  >
                                    <div className="min-w-0 flex-1 space-y-2">
                                      <div className="flex items-center gap-2.5 flex-wrap">
                                        <span className="text-base font-bold text-black">
                                          {item.nome_produto_snapshot}
                                        </span>
                                        {item.sku_snapshot && (
                                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-sm font-medium font-mono text-slate-900">
                                            SKU: {item.sku_snapshot}
                                          </span>
                                        )}
                                      </div>
                                      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm font-medium text-red-900 leading-relaxed">
                                        {item.motivo_erro || 'Falha não especificada.'}
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      disabled={carregandoProdutoCorrecao === item.id}
                                      onClick={() => void handleAbrirCorrigirItem(item)}
                                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-xs inline-flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50 shrink-0"
                                    >
                                      {carregandoProdutoCorrecao === item.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                                      ) : (
                                        <Wrench className="w-3.5 h-3.5 text-black" />
                                      )}
                                      <span>Corrigir e Publicar</span>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ITENS PUBLICADOS COM SUCESSO */}
                          {itensSucessoRelatorio.length > 0 && (
                            <div className="space-y-2.5">
                              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-black">
                                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                                <span>
                                  Publicados com Sucesso ({itensSucessoRelatorio.length})
                                </span>
                              </div>
                              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                                {itensSucessoRelatorio.map((item) => {
                                  const linkAnuncio = item.ml_item_id
                                    ? obterPermalinkAnuncioMl(item.permalink, item.ml_item_id)
                                    : item.permalink || '';
                                  return (
                                    <div
                                      key={item.id}
                                      className="p-3.5 rounded-xl border border-slate-300 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                    >
                                      <div className="min-w-0 space-y-1">
                                        <div className="text-base font-bold text-black truncate">
                                          {item.nome_produto_snapshot}
                                        </div>
                                        <div className="text-sm font-medium text-slate-900 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                                          {item.ml_item_id && (
                                            <span className="font-mono">{item.ml_item_id}</span>
                                          )}
                                          {typeof item.preco_calculado === 'number' && (
                                            <span>• {formatarMoeda(item.preco_calculado)}</span>
                                          )}
                                          <span>
                                            • EAN:{' '}
                                            {item.gtin_utilizado
                                              ? `${item.gtin_utilizado} (${labelOrigemGtin(item.gtin_origem)})`
                                              : 'Sem EAN'}
                                          </span>
                                        </div>
                                      </div>

                                      {linkAnuncio && (
                                        <a
                                          href={linkAnuncio}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-xs shrink-0 transition"
                                        >
                                          <span>Ver no Mercado Livre</span>
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

              <div className="flex justify-end pt-2 border-t-2 border-slate-200">
                <button
                  type="button"
                  onClick={handleFecharOuMinimizar}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-medium text-sm transition cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Individual para "Corrigir e Publicar" item com falha no relatório */}
      <ModalVincularAnuncioMl
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
            void mercadoLivrePublicacaoMassaService
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
                mercadoLivrePublicacaoMassaService.notificarAtualizacaoExterna();
                void carregarHistoricoLotes();
              })
              .catch((errAtualiza) => {
                console.warn(
                  '[ModalPublicarMassaMl] Aviso ao atualizar item corrigido no relatório:',
                  errAtualiza
                );
              });
          }
        }}
      />
    </>
  );
};
