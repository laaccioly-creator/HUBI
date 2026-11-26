import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Store,
  X,
  Link,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  Tag,
  Search,
  RefreshCw,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { Produto, VariacaoProduto } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  mercadoLivreService,
  MlAtributoObrigatorioCategoria,
  MlSugestaoCategoria,
} from '../../services/mercadoLivreService';
import {
  mercadoLivreJevService,
  FichaProdutoMlHubi,
  ValorAtributoPreenchidoMl,
} from '../../services/mercadoLivreJevService';
import { catalogJevService } from '../../services/catalogJevService';
import { ehUrlExternaParaEspelhar, espelharListaImagensProduto } from '../../services/imagemStorageService';
import { garantirDescricaoProfissionalMarketplace } from '../../services/descricaoComercialService';
import {
  calcularBreakdownPrecoShopee,
  obterPermalinkAnuncioShopee,
  shopeeService,
} from '../../services/shopeeService';
import { validarGtinGs1 } from '../../utils/gdmMercadoLivreMapper';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';

function construirFichaProdutoShopee(
  produto: Produto,
  variacao: VariacaoProduto | null
): FichaProdutoMlHubi {
  return {
    produtoId: produto.id,
    variacaoId: variacao?.id || null,
    nome: variacao?.combinacao_nome ? `${produto.nome} ${variacao.combinacao_nome}` : produto.nome,
    descricao: produto.descricao || null,
    categoriaLocal: produto.categoria_nome || produto.categoria?.nome || null,
    subcategoriaLocal: produto.subcategoria_nome || produto.subcategoria?.nome || null,
    codigoBarras: variacao?.codigo_barras || produto.codigo_barras || null,
    codigoInterno: variacao?.sku || produto.codigo_interno || null,
    variacaoNome: variacao?.combinacao_nome || null,
  };
}

interface ModalVincularAnuncioShopeeProps {
  aberto: boolean;
  onFechar: () => void;
  produto: Produto | null;
  lojaId: string;
  abaInicial?: 'vincular' | 'publicar';
  onSucesso?: (info?: {
    gtinSincronizado?: string | null;
    permalink?: string | null;
    variacaoId?: string | null;
    mlItemId?: string | null;
    mlCategoryId?: string | null;
    semGtin?: boolean;
    precoCalculado?: number | null;
  }) => void;
}

export const ModalVincularAnuncioShopee: React.FC<ModalVincularAnuncioShopeeProps> = ({
  aberto,
  onFechar,
  produto,
  lojaId,
  abaInicial = 'publicar',
  onSucesso,
}) => {
  const { mostrarErro, mostrarSucesso, mostrarAviso, confirmar } = useFeedbackModal();
  const { loja } = useAuth();
  useRegisterOverlay(aberto, onFechar, 'modal-vincular-anuncio-shopee', 'modal');

  const [abaAtiva, setAbaAtiva] = useState<'vincular' | 'publicar'>(abaInicial);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [vinculosExistentes, setVinculosExistentes] = useState<
    Array<{
      id: string;
      ml_item_id: string;
      status_anuncio: string;
      permalink?: string | null;
      variacao_id?: string | null;
    }>
  >([]);
  const [desvinculandoId, setDesvinculandoId] = useState<string | null>(null);

  const [itemIdInput, setItemIdInput] = useState<string>('');
  const [variacaoSelecionadaId, setVariacaoSelecionadaId] = useState<string>('');
  const [shopIdConta, setShopIdConta] = useState<number | null>(null);

  const [margemComissao, setMargemComissao] = useState<number>(20.0);
  const [taxaFixa, setTaxaFixa] = useState<number>(4.0);
  const [marca, setMarca] = useState<string>('');
  const [modelo, setModelo] = useState<string>('');
  const [gtin, setGtin] = useState<string>('');
  const [semGtin, setSemGtin] = useState<boolean>(true);
  const [origemEanConfirmado, setOrigemEanConfirmado] = useState<{
    fonte?: string;
    confianca: number;
  } | null>(null);

  const [carregandoCategoria, setCarregandoCategoria] = useState<boolean>(false);
  const [erroCategoria, setErroCategoria] = useState<string | null>(null);
  const [termoBuscaCategoria, setTermoBuscaCategoria] = useState<string>('');
  const [categoriaSelecionadaId, setCategoriaSelecionadaId] = useState<string>('');
  const [caminhoCategoriaShopee, setCaminhoCategoriaShopee] = useState<string>('');
  const [sugestoesCategoria, setSugestoesCategoria] = useState<MlSugestaoCategoria[]>([]);
  const [atributosCategoria, setAtributosCategoria] = useState<MlAtributoObrigatorioCategoria[]>([]);
  const [valoresAtributosExtras, setValoresAtributosExtras] = useState<
    Record<string, ValorAtributoPreenchidoMl>
  >({});

  const requisicaoCategoriaSeqRef = useRef<number>(0);
  const gtinRef = useRef<string>('');
  const fichaProdutoRef = useRef<FichaProdutoMlHubi | null>(null);

  gtinRef.current = gtin;

  const variacaoAtual: VariacaoProduto | null =
    produto?.variacoes?.find((v) => v.id === variacaoSelecionadaId) || null;
  fichaProdutoRef.current = produto ? construirFichaProdutoShopee(produto, variacaoAtual) : null;

  useEffect(() => {
    if (!aberto || !lojaId) return;
    let ativo = true;
    shopeeService.obterConta(lojaId).then((conta) => {
      if (!ativo || !conta) return;
      setShopIdConta(Number(conta.seller_id || conta.ml_user_id) || null);
      if (Number.isFinite(Number(conta.taxa_comissao_padrao_percentual))) {
        setMargemComissao(Number(conta.taxa_comissao_padrao_percentual));
      }
      if (Number.isFinite(Number(conta.taxa_fixa_padrao))) {
        setTaxaFixa(Number(conta.taxa_fixa_padrao));
      }
    }).catch(() => null);
    return () => {
      ativo = false;
    };
  }, [aberto, lojaId]);

  useEffect(() => {
    requisicaoCategoriaSeqRef.current += 1;
    setCarregandoCategoria(false);
    if (!aberto || !produto) return;
    setAbaAtiva(abaInicial);
    setVariacaoSelecionadaId('');
    setItemIdInput('');
    setMarca('');
    setModelo('');
    setTermoBuscaCategoria(produto.nome || '');
    setCategoriaSelecionadaId('');
    setCaminhoCategoriaShopee('');
    setSugestoesCategoria([]);
    setAtributosCategoria([]);
    setValoresAtributosExtras({});
    setErroCategoria(null);
  }, [aberto, produto?.id, abaInicial]);

  const carregarVinculosExistentes = useCallback(async () => {
    if (!aberto || !produto || !lojaId) return;
    const { data, error } = await supabase
      .from('marketplace_anuncios')
      .select('id, ml_item_id, status_anuncio, permalink, variacao_id')
      .eq('loja_id', lojaId)
      .eq('produto_id', produto.id)
      .eq('plataforma', 'shopee');
    if (!error && Array.isArray(data)) {
      setVinculosExistentes(data);
    }
  }, [aberto, produto?.id, lojaId]);

  useEffect(() => {
    void carregarVinculosExistentes();
  }, [carregarVinculosExistentes]);

  useEffect(() => {
    if (!aberto || !produto) return;
    const codigoExistente = (variacaoAtual?.codigo_barras || produto.codigo_barras || '')
      .replace(/\D/g, '')
      .trim();
    if (validarGtinGs1(codigoExistente)) {
      setGtin(codigoExistente);
      setSemGtin(false);
      setOrigemEanConfirmado({ fonte: 'Cadastro do Rubi', confianca: 100 });
    } else {
      setGtin('');
      setSemGtin(true);
      setOrigemEanConfirmado(null);
    }
  }, [aberto, produto?.id, variacaoAtual?.id]);

  const consultarCategoriaShopee = useCallback(
    async (tituloAlvo?: string, categoryIdAlvo?: string) => {
      if (!lojaId || !fichaProdutoRef.current) return;
      const seq = ++requisicaoCategoriaSeqRef.current;

      try {
        setCarregandoCategoria(true);
        setErroCategoria(null);

        const res = await shopeeService.consultarCategoria({
          lojaId,
          titulo: tituloAlvo,
          categoryId: categoryIdAlvo,
        });

        if (requisicaoCategoriaSeqRef.current !== seq) return;

        setCategoriaSelecionadaId(res.categoria.id);
        setCaminhoCategoriaShopee(res.categoria.caminho_completo || res.categoria.name);
        setSugestoesCategoria(res.sugestoes || []);
        setAtributosCategoria(res.atributos_obrigatorios || []);

        const ficha = fichaProdutoRef.current;
        const gtinAtualLimpo = gtinRef.current.replace(/\D/g, '').trim();
        const gtinValidoAtual = validarGtinGs1(gtinAtualLimpo);

        const promessaEan = !gtinValidoAtual
          ? catalogJevService
              .descobrirEAuditarEanComSerperJev({
                nomeProduto: ficha.nome,
                categoriaNome: ficha.categoriaLocal,
                sku: ficha.codigoInterno,
                loja,
              })
              .catch(() => null)
          : Promise.resolve(null);

        const promessaGemini = mercadoLivreJevService
          .preencherAtributosTextoLivreViaGemini({
            lojaId,
            categoryId: res.categoria.id,
            fichaProduto: ficha,
            gtinAtual: gtinValidoAtual ? gtinAtualLimpo : undefined,
            atributosPendentes: res.atributos_obrigatorios || [],
          })
          .catch(() => null);

        void Promise.all([promessaEan, promessaGemini]).then(([resEan, resGemini]) => {
          if (requisicaoCategoriaSeqRef.current !== seq) return;

          if (resGemini?.marca) {
            setMarca((prev) => (prev.trim() ? prev : resGemini.marca || prev));
          }
          if (resGemini?.modelo) {
            setModelo((prev) => (prev.trim() ? prev : resGemini.modelo || prev));
          }

          const gtinJaValido = validarGtinGs1(gtinRef.current.replace(/\D/g, '').trim());
          if (!gtinJaValido) {
            if (resEan?.ean && validarGtinGs1(resEan.ean)) {
              setGtin(resEan.ean);
              setSemGtin(false);
              setOrigemEanConfirmado({
                fonte: resEan.fonte,
                confianca: resEan.confiancaPercentual,
              });
            } else if (resGemini?.gtin && validarGtinGs1(resGemini.gtin)) {
              setGtin(resGemini.gtin);
              setSemGtin(false);
            }
          }

          if (resGemini?.atributos && Object.keys(resGemini.atributos).length > 0) {
            setValoresAtributosExtras((prev) => ({
              ...resGemini.atributos,
              ...prev,
            }));
          }
        });
      } catch (err: any) {
        if (requisicaoCategoriaSeqRef.current !== seq) return;
        setErroCategoria(
          err?.message || 'Não foi possível consultar a categoria recomendada na Shopee.'
        );
      } finally {
        if (requisicaoCategoriaSeqRef.current === seq) {
          setCarregandoCategoria(false);
        }
      }
    },
    [lojaId, loja]
  );

  useEffect(() => {
    if (!aberto || !produto || abaAtiva !== 'publicar' || !lojaId) return;
    if (categoriaSelecionadaId || carregandoCategoria || erroCategoria) return;
    void consultarCategoriaShopee(produto.nome);
  }, [
    aberto,
    produto,
    abaAtiva,
    lojaId,
    categoriaSelecionadaId,
    carregandoCategoria,
    erroCategoria,
    consultarCategoriaShopee,
  ]);

  if (!aberto || !produto) return null;

  const precoBaseHubi = variacaoAtual
    ? variacaoAtual.preco_promocional && variacaoAtual.preco_promocional > 0
      ? Number(variacaoAtual.preco_promocional)
      : Number(variacaoAtual.preco_venda_varejo || 0)
    : produto.promocao_ativa && produto.preco_promocional && produto.preco_promocional > 0
    ? Number(produto.preco_promocional)
    : Number(produto.preco_venda_varejo || 0);

  const estoqueFisico = variacaoAtual
    ? Math.max(0, Number(variacaoAtual.quantidade_estoque || 0))
    : Math.max(0, Number(produto.quantidade_estoque || 0));

  const breakdown = calcularBreakdownPrecoShopee(precoBaseHubi, margemComissao, taxaFixa);
  const gtinLimpo = gtin.replace(/\D/g, '').trim();
  const temFotos = Array.isArray(produto.fotos_urls) && produto.fotos_urls.length > 0;

  const handleVincularExistente = async () => {
    const idLimpo = itemIdInput.replace(/\D/g, '').trim();
    if (!idLimpo) {
      mostrarAviso('Informe o ID numérico do anúncio na Shopee.', 'Campo Obrigatório');
      return;
    }

    try {
      setSalvando(true);
      const res = await shopeeService.vincularAnuncioExistente({
        lojaId,
        produtoId: produto.id,
        variacaoId: variacaoSelecionadaId || null,
        itemId: idLimpo,
      });
      mostrarSucesso(res.mensagem, 'Anúncio Shopee Vinculado');
      if (onSucesso) {
        onSucesso({
          permalink: res.permalink || null,
          variacaoId: variacaoSelecionadaId || null,
          mlItemId: idLimpo,
        });
      }
      onFechar();
    } catch (err: any) {
      mostrarErro(err?.message || 'Erro ao vincular anúncio da Shopee.');
    } finally {
      setSalvando(false);
    }
  };

  const handleDesvincularItem = (anuncioId: string, itemId: string) => {
    confirmar({
      titulo: 'Desvincular Anúncio Shopee',
      mensagem: `Deseja remover o vínculo local do anúncio Shopee #${itemId}? O anúncio continuará na Shopee.`,
      textoConfirmar: 'Desvincular',
      textoCancelar: 'Cancelar',
      onConfirmar: async () => {
        try {
          setDesvinculandoId(anuncioId);
          await shopeeService.desvincularAnuncio({ lojaId, anuncioId });
          await carregarVinculosExistentes();
          mostrarSucesso(`Vínculo #${itemId} removido do Rubi.`);
        } catch (err: any) {
          mostrarErro(err?.message || 'Erro ao desvincular anúncio da Shopee.');
        } finally {
          setDesvinculandoId(null);
        }
      },
    });
  };

  const handlePublicarNovo = async () => {
    if (!temFotos) {
      mostrarAviso('Adicione pelo menos 1 foto ao produto antes de publicar na Shopee.');
      return;
    }
    if (!categoriaSelecionadaId) {
      mostrarAviso('Selecione ou aguarde a identificação da categoria Shopee.');
      return;
    }
    if (breakdown.precoFinalShopee <= 0 || estoqueFisico <= 0) {
      mostrarAviso('Produto precisa de preço e estoque físico maior que 0 para publicar.');
      return;
    }
    if (!semGtin && gtinLimpo && !validarGtinGs1(gtinLimpo)) {
      mostrarAviso('O EAN/GTIN digitado não passou na validação GS1 Módulo 10.');
      return;
    }

    try {
      setSalvando(true);

      // 1. Espelha imagens externas antes do envio
      const fotosOriginais = Array.isArray(produto.fotos_urls) ? produto.fotos_urls : [];
      let fotosProntas = fotosOriginais;
      if (fotosOriginais.some(ehUrlExternaParaEspelhar)) {
        fotosProntas = await espelharListaImagensProduto(fotosOriginais, lojaId, produto.id);
        if (fotosProntas.some((u, idx) => u !== fotosOriginais[idx])) {
          await supabase
            .from('produtos')
            .update({ fotos_urls: fotosProntas })
            .eq('id', produto.id)
            .eq('loja_id', lojaId);
        }
      }

      // 2. Gera/enriquece descrição comercial profissional plain_text
      const atributosExtrasPayload = atributosCategoria
        .map((attr) => {
          const val = valoresAtributosExtras[attr.id];
          if (!val?.value_name?.trim() && !val?.value_id) return null;
          return {
            id: attr.id,
            ...(val.value_id ? { value_id: val.value_id } : {}),
            value_name: (val.value_name || '').trim(),
          };
        })
        .filter((x): x is { id: string; value_id?: string; value_name: string } => x !== null);

      const resultadoDescricao = await garantirDescricaoProfissionalMarketplace({
        nome: produto.nome,
        marca: marca.trim() || undefined,
        modelo: modelo.trim() || undefined,
        categoriaNome:
          caminhoCategoriaShopee || produto.categoria_nome || produto.categoria?.nome || undefined,
        descricaoAtual: produto.descricao || undefined,
        codigoBarras: !semGtin && gtinLimpo ? gtinLimpo : produto.codigo_barras,
        atributosTecnicos: atributosExtrasPayload.map((a) => ({
          nome: atributosCategoria.find((d) => d.id === a.id)?.name || a.id,
          valor: a.value_name,
        })),
        pesoKg: produto.peso_kg ?? null,
        alturaCm: produto.altura_cm ?? null,
        larguraCm: produto.largura_cm ?? null,
        comprimentoCm: produto.comprimento_cm ?? null,
        loja,
        canal: 'shopee',
      });

      const descricaoShopee = resultadoDescricao.descricao || produto.descricao || produto.nome;
      if (resultadoDescricao.foiEnriquecida && resultadoDescricao.descricao) {
        await supabase
          .from('produtos')
          .update({ descricao: resultadoDescricao.descricao })
          .eq('id', produto.id)
          .eq('loja_id', lojaId);
      }

      const nomeAnuncio = variacaoAtual?.combinacao_nome
        ? `${produto.nome} ${variacaoAtual.combinacao_nome}`.slice(0, 120)
        : produto.nome.slice(0, 120);

      const res = await shopeeService.criarAnuncio({
        lojaId,
        produtoId: produto.id,
        variacaoId: variacaoSelecionadaId || null,
        itemName: nomeAnuncio,
        description: descricaoShopee,
        originalPrice: breakdown.precoFinalShopee,
        normalStock: estoqueFisico,
        categoryId: categoriaSelecionadaId,
        margemSobrepreco: margemComissao,
        marca: marca.trim() || undefined,
        gtin: semGtin ? null : gtinLimpo,
        semGtin,
        atributosExtras: atributosExtrasPayload,
        fotosUrls: fotosProntas,
      });

      const gtinSinc =
        !semGtin && validarGtinGs1(gtinLimpo) ? gtinLimpo : res.gtin_sincronizado || null;
      if (gtinSinc) {
        await mercadoLivreService
          .sincronizarCodigoBarrasPosPublicacao({
            lojaId,
            produtoId: produto.id,
            variacaoId: variacaoAtual?.id || null,
            gtin: gtinSinc,
            codigoBarrasAtualProduto: produto.codigo_barras,
          })
          .catch(() => null);
      }

      mostrarSucesso(res.mensagem, 'Publicado na Shopee');
      if (onSucesso) {
        onSucesso({
          gtinSincronizado: gtinSinc,
          permalink: res.permalink || res.item?.permalink || null,
          variacaoId: variacaoAtual?.id || null,
          mlItemId: String(res.item?.id || '').trim() || null,
          mlCategoryId: categoriaSelecionadaId,
          semGtin: Boolean(semGtin),
          precoCalculado: breakdown.precoFinalShopee,
        });
      }
      onFechar();
    } catch (err: any) {
      mostrarErro(err?.message || 'Não foi possível publicar o anúncio na Shopee.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white text-black border-2 border-slate-300 shadow-2xl p-6 space-y-5">
        {/* CABEÇALHO */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b-2 border-slate-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#EE4D2D] flex items-center justify-center text-white shrink-0 shadow-xs">
              <Store className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-lg text-black leading-tight truncate">
                Shopee • {produto.nome}
              </h3>
              <p className="text-xs font-bold text-slate-700 mt-0.5">
                Estoque físico: {estoqueFisico} un • Base Rubi: R$ {precoBaseHubi.toFixed(2).replace('.', ',')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            aria-label="Fechar"
            className="hubi-btn-close-x p-1.5 rounded-xl text-slate-700 hover:text-black transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* VÍNCULOS ATUAIS */}
        {vinculosExistentes.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-300 space-y-2">
            <span className="text-xs font-black uppercase tracking-wider text-black block">
              Anúncios Shopee Vinculados ({vinculosExistentes.length})
            </span>
            <div className="space-y-2">
              {vinculosExistentes.map((v) => {
                const url = obterPermalinkAnuncioShopee(v.permalink, v.ml_item_id, shopIdConta);
                return (
                  <div
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-300"
                  >
                    <div className="flex items-center gap-2 text-xs font-black font-mono text-black">
                      <span className="px-2 py-0.5 rounded bg-[#EE4D2D] text-white">
                        Shopee • #{v.ml_item_id}
                      </span>
                      <span className="text-slate-700 uppercase text-[10px]">
                        {v.status_anuncio}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black text-xs font-bold inline-flex items-center gap-1"
                        >
                          <span>Ver na Shopee</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={desvinculandoId === v.id}
                        onClick={() => void handleDesvincularItem(v.id, v.ml_item_id)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Desvincular</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ABAS */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100 border border-slate-300">
          <button
            type="button"
            onClick={() => setAbaAtiva('publicar')}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
              abaAtiva === 'publicar'
                ? 'bg-[#EE4D2D] text-white shadow-xs'
                : 'text-black hover:bg-slate-200'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Publicar Novo Anúncio</span>
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva('vincular')}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
              abaAtiva === 'vincular'
                ? 'bg-[#EE4D2D] text-white shadow-xs'
                : 'text-black hover:bg-slate-200'
            }`}
          >
            <Link className="w-4 h-4" />
            <span>Vincular Existente</span>
          </button>
        </div>

        {/* SELETOR DE VARIAÇÃO */}
        {produto.tem_variacoes && Array.isArray(produto.variacoes) && produto.variacoes.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-black" />
              <span>Variação / Grade (Opcional)</span>
            </label>
            <select
              value={variacaoSelecionadaId}
              onChange={(e) => setVariacaoSelecionadaId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-slate-300 text-sm font-bold text-black outline-hidden focus:border-[#EE4D2D]"
            >
              <option value="">Produto principal ({produto.quantidade_estoque || 0} un)</option>
              {produto.variacoes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.combinacao_nome || v.valor_variacao_1} — Estoque: {v.quantidade_estoque} un
                </option>
              ))}
            </select>
          </div>
        )}

        {abaAtiva === 'vincular' ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-black block">
                ID do Anúncio na Shopee (Item ID)
              </label>
              <input
                type="text"
                value={itemIdInput}
                onChange={(e) => setItemIdInput(e.target.value)}
                placeholder="Ex: 23491827364"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-slate-300 text-sm font-mono font-bold text-black outline-hidden focus:border-[#EE4D2D]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={onFechar}
                className="hubi-btn-neutral px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black text-sm font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={salvando}
                onClick={() => void handleVincularExistente()}
                className="px-5 py-2.5 rounded-xl bg-emerald-300 hover:bg-emerald-400 text-black text-sm font-black inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Vincular Anúncio</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* CATEGORIA SHOPEE */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-300 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Categoria Oficial na Shopee</span>
                </span>
                <button
                  type="button"
                  disabled={carregandoCategoria}
                  onClick={() => void consultarCategoriaShopee(termoBuscaCategoria || produto.nome)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${carregandoCategoria ? 'animate-spin' : ''}`} />
                  <span>Recarregar</span>
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={termoBuscaCategoria}
                  onChange={(e) => setTermoBuscaCategoria(e.target.value)}
                  placeholder="Buscar categoria Shopee..."
                  className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black"
                />
                <button
                  type="button"
                  disabled={carregandoCategoria}
                  onClick={() => void consultarCategoriaShopee(termoBuscaCategoria)}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Buscar</span>
                </button>
              </div>

              {carregandoCategoria ? (
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                  <span>Consultando categoria, atributos e EAN oficial (Serper + JEV)...</span>
                </div>
              ) : erroCategoria ? (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{erroCategoria}</span>
                </div>
              ) : categoriaSelecionadaId ? (
                <div className="space-y-2">
                  <div className="text-xs font-black text-emerald-950 bg-emerald-100 border border-emerald-400 px-3 py-2 rounded-xl">
                    {caminhoCategoriaShopee} (ID: {categoriaSelecionadaId})
                  </div>
                  {sugestoesCategoria.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {sugestoesCategoria.map((sug) => (
                        <button
                          key={sug.category_id}
                          type="button"
                          onClick={() => void consultarCategoriaShopee(undefined, sug.category_id)}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                            sug.category_id === categoriaSelecionadaId
                              ? 'bg-[#EE4D2D] text-white border-[#EE4D2D]'
                              : 'bg-white text-black border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {sug.category_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* MARCA, MODELO, EAN */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-black">Marca</label>
                <input
                  type="text"
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  placeholder="Ex: Intelbras / Genérico"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-black">Modelo</label>
                <input
                  type="text"
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="Ex: Padrão"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-300 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs font-black text-black">
                  Código Universal (EAN / GTIN)
                </label>
                {origemEanConfirmado && !semGtin && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 border border-emerald-400 text-[10px] font-black text-emerald-950">
                    Validado GS1 • {origemEanConfirmado.fonte} ({origemEanConfirmado.confianca}%)
                  </span>
                )}
              </div>
              <input
                type="text"
                disabled={semGtin}
                value={gtin}
                onChange={(e) => setGtin(e.target.value)}
                placeholder="Ex: 7891234567895"
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-mono font-bold text-black disabled:bg-slate-200"
              />
              <label className="flex items-center gap-2 text-xs font-bold text-black cursor-pointer">
                <input
                  type="checkbox"
                  checked={semGtin}
                  onChange={(e) => setSemGtin(e.target.checked)}
                />
                <span>Produto sem código de barras (isento de GTIN)</span>
              </label>
            </div>

            {/* ATRIBUTOS OBRIGATÓRIOS DA CATEGORIA SHOPEE */}
            {atributosCategoria.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-300 space-y-2.5">
                <span className="text-xs font-black uppercase tracking-wider text-black block">
                  Atributos Obrigatórios da Categoria ({atributosCategoria.length})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {atributosCategoria.map((attr) => {
                    const valorAtual = valoresAtributosExtras[attr.id]?.value_name || '';
                    return (
                      <div key={attr.id} className="space-y-1">
                        <label className="text-xs font-bold text-black block">
                          {attr.name}
                        </label>
                        {attr.values.length > 0 ? (
                          <select
                            value={valoresAtributosExtras[attr.id]?.value_id || ''}
                            onChange={(e) => {
                              const opt = attr.values.find((v) => v.id === e.target.value);
                              setValoresAtributosExtras((prev) => ({
                                ...prev,
                                [attr.id]: opt
                                  ? { value_id: opt.id, value_name: opt.name }
                                  : { value_name: '' },
                              }));
                            }}
                            className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black"
                          >
                            <option value="">Selecione...</option>
                            {attr.values.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={valorAtual}
                            onChange={(e) =>
                              setValoresAtributosExtras((prev) => ({
                                ...prev,
                                [attr.id]: { value_name: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PRECIFICAÇÃO SHOPEE */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-300 space-y-3">
              <span className="text-xs font-black uppercase tracking-wider text-black block">
                Formação de Preço na Shopee
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-black">Margem / Comissão (%)</label>
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
                  <label className="text-xs font-bold text-black">Taxa Fixa Shopee (R$)</label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.5"
                    value={taxaFixa}
                    onChange={(e) => setTaxaFixa(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black"
                  />
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white border border-slate-300 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Preço Final Calculado na Shopee:
                </span>
                <span className="text-base font-black text-emerald-900 font-mono">
                  R$ {breakdown.precoFinalShopee.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2 border-t-2 border-slate-200">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando}
                className="hubi-btn-neutral px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black text-sm font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={salvando || carregandoCategoria || !categoriaSelecionadaId}
                onClick={() => void handlePublicarNovo()}
                className="px-5 py-2.5 rounded-xl bg-emerald-300 hover:bg-emerald-400 text-black text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span>Publicando na Shopee...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-black" />
                    <span>Publicar na Shopee</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
