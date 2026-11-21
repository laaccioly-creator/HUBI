import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShoppingBag,
  X,
  Link,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  Tag,
  Search,
  RefreshCw
} from 'lucide-react';
import { Produto, VariacaoProduto } from '../../types';
import {
  mercadoLivreService,
  MlAtributoObrigatorioCategoria,
  MlSugestaoCategoria
} from '../../services/mercadoLivreService';
import {
  mercadoLivreJevService,
  FichaProdutoMlHubi,
  ValorAtributoPreenchidoMl
} from '../../services/mercadoLivreJevService';
import {
  converterProdutoHubiParaGdmMl,
  converterGdmParaPayloadApiMl,
  calcularBreakdownPrecoMercadoLivre,
  traduzirErroMercadoLivre
} from '../../utils/gdmMercadoLivreMapper';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';

function construirFichaProdutoMl(produto: Produto, variacao: VariacaoProduto | null): FichaProdutoMlHubi {
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
    rotuloVariacao1: produto.rotulo_variacao_1 || null,
    valorVariacao1: variacao?.valor_variacao_1 || null,
    rotuloVariacao2: produto.rotulo_variacao_2 || null,
    valorVariacao2: variacao?.valor_variacao_2 || null,
    pesoKg: produto.peso_kg ?? null,
    alturaCm: produto.altura_cm ?? null,
    larguraCm: produto.largura_cm ?? null,
    comprimentoCm: produto.comprimento_cm ?? null,
  };
}

function filtrarValoresAtributosCompativeis(
  valores: Record<string, ValorAtributoPreenchidoMl>,
  atributosCategoria: MlAtributoObrigatorioCategoria[]
): Record<string, ValorAtributoPreenchidoMl> {
  const proximo: Record<string, ValorAtributoPreenchidoMl> = {};
  for (const attr of atributosCategoria) {
    const atual = valores[attr.id];
    const valorNome = atual?.value_name?.trim();
    if (!valorNome) continue;

    if (attr.values.length === 0) {
      proximo[attr.id] = atual;
      continue;
    }

    const opcaoValida = attr.values.find(
      (v) =>
        (atual.value_id && v.id === atual.value_id) ||
        v.name.trim().toLowerCase() === valorNome.toLowerCase()
    );
    if (opcaoValida) {
      proximo[attr.id] = { value_id: opcaoValida.id, value_name: opcaoValida.name };
    }
  }
  return proximo;
}

interface ModalVincularAnuncioMlProps {
  aberto: boolean;
  onFechar: () => void;
  produto: Produto | null;
  lojaId: string;
  isDark?: boolean;
  onSucesso?: () => void;
}

export const ModalVincularAnuncioMl: React.FC<ModalVincularAnuncioMlProps> = ({
  aberto,
  onFechar,
  produto,
  lojaId,
  isDark: _isDark = true,
  onSucesso,
}) => {
  const { mostrarErro, mostrarSucesso, mostrarAviso } = useFeedbackModal();
  const { isDark } = useTheme();
  useRegisterOverlay(aberto, onFechar, 'modal-vincular-anuncio-ml', 'modal');
  const [abaAtiva, setAbaAtiva] = useState<'vincular' | 'publicar'>('vincular');
  const [salvando, setSalvando] = useState<boolean>(false);

  // Estados da Aba 1: Vincular Anúncio Existente
  const [mlItemIdInput, setMlItemIdInput] = useState<string>('');
  const [variacaoSelecionadaId, setVariacaoSelecionadaId] = useState<string>('');

  // Estados da Aba 2: Publicar Novo Anúncio
  const [tipoAnuncio, setTipoAnuncio] = useState<'gold_special' | 'gold_pro'>('gold_special');
  const [margemComissao, setMargemComissao] = useState<number>(16.0);
  const [taxaFixa, setTaxaFixa] = useState<number>(6.0);
  const [marca, setMarca] = useState<string>('');
  const [modelo, setModelo] = useState<string>('');

  // Estados de Categoria Real e Atributos Dinâmicos do Mercado Livre
  const [carregandoCategoria, setCarregandoCategoria] = useState<boolean>(false);
  const [erroCategoria, setErroCategoria] = useState<string | null>(null);
  const [termoBuscaCategoria, setTermoBuscaCategoria] = useState<string>('');
  const [categoriaSelecionadaId, setCategoriaSelecionadaId] = useState<string>('');
  const [caminhoCategoriaMl, setCaminhoCategoriaMl] = useState<string>('');
  const [sugestoesCategoria, setSugestoesCategoria] = useState<MlSugestaoCategoria[]>([]);
  const [atributosCategoria, setAtributosCategoria] = useState<MlAtributoObrigatorioCategoria[]>([]);
  const [valoresAtributosExtras, setValoresAtributosExtras] = useState<
    Record<string, ValorAtributoPreenchidoMl>
  >({});

  const requisicaoCategoriaSeqRef = useRef<number>(0);
  const marcaRef = useRef<string>('');
  const modeloRef = useRef<string>('');
  const valoresAtributosExtrasRef = useRef<Record<string, ValorAtributoPreenchidoMl>>({});
  const fichaProdutoRef = useRef<FichaProdutoMlHubi | null>(null);

  marcaRef.current = marca;
  modeloRef.current = modelo;
  valoresAtributosExtrasRef.current = valoresAtributosExtras;

  const variacaoAtual: VariacaoProduto | null =
    produto?.variacoes?.find((v) => v.id === variacaoSelecionadaId) || null;
  fichaProdutoRef.current = produto ? construirFichaProdutoMl(produto, variacaoAtual) : null;

  // Carrega comissão padrão e custo fixo (< R$ 79,00) das preferências do Mercado Livre da loja
  useEffect(() => {
    if (!aberto || !lojaId) return;

    let ativo = true;
    const carregarPreferenciasMl = async () => {
      try {
        const conta = await mercadoLivreService.obterConta(lojaId);
        if (!ativo || !conta) return;

        const comissaoSalva = Number(conta.taxa_comissao_padrao_percentual);
        const custoFixoSalvo = Number(conta.taxa_fixa_padrao);

        setMargemComissao(Number.isFinite(comissaoSalva) ? comissaoSalva : 16.0);
        setTaxaFixa(Number.isFinite(custoFixoSalvo) ? custoFixoSalvo : 6.0);
      } catch (err) {
        console.warn('[ModalVincularAnuncioMl] Não foi possível carregar preferências ML da loja:', err);
      }
    };

    carregarPreferenciasMl();
    return () => {
      ativo = false;
    };
  }, [aberto, lojaId]);

  // Reinicia estados específicos do produto quando troca de item ou abre o modal
  useEffect(() => {
    requisicaoCategoriaSeqRef.current += 1;
    setCarregandoCategoria(false);
    if (!aberto || !produto) return;
    setVariacaoSelecionadaId('');
    setMlItemIdInput('');
    setMarca('');
    setModelo('');
    marcaRef.current = '';
    modeloRef.current = '';
    valoresAtributosExtrasRef.current = {};
    setTermoBuscaCategoria(produto.nome || '');
    setCategoriaSelecionadaId('');
    setCaminhoCategoriaMl('');
    setSugestoesCategoria([]);
    setAtributosCategoria([]);
    setValoresAtributosExtras({});
    setErroCategoria(null);
  }, [aberto, produto?.id]);

  const consultarCategoriaMl = useCallback(
    async (tituloConsulta?: string, categoryIdEspecifico?: string) => {
      const fichaProduto = fichaProdutoRef.current;
      if (!lojaId || !fichaProduto) return;
      const tituloLimpo = (tituloConsulta ?? '').trim();
      if (!tituloLimpo && !categoryIdEspecifico) return;

      const seq = ++requisicaoCategoriaSeqRef.current;

      try {
        setCarregandoCategoria(true);
        setErroCategoria(null);

        const res = await mercadoLivreJevService.descobrirECarregarCategoriaMl({
          lojaId,
          tituloConsulta: tituloLimpo || undefined,
          categoryIdEspecifico: categoryIdEspecifico || undefined,
          fichaProduto,
        });

        if (requisicaoCategoriaSeqRef.current !== seq) return;

        const novosAttrs = Array.isArray(res.atributos_obrigatorios) ? res.atributos_obrigatorios : [];
        const valoresCompativeis = filtrarValoresAtributosCompativeis(
          valoresAtributosExtrasRef.current,
          novosAttrs
        );

        const preenchimento = await mercadoLivreJevService.preencherAtributosCalibradosComJev({
          categoryId: res.categoria.id,
          atributosObrigatorios: novosAttrs,
          fichaProduto,
          marcaAtual: marcaRef.current,
          modeloAtual: modeloRef.current,
          valoresAtuais: valoresCompativeis,
        });

        if (requisicaoCategoriaSeqRef.current !== seq) return;

        setCategoriaSelecionadaId(res.categoria.id);
        setCaminhoCategoriaMl(res.categoria.caminho_completo);
        if (Array.isArray(res.sugestoes) && res.sugestoes.length > 0) {
          setSugestoesCategoria(res.sugestoes);
        }
        setAtributosCategoria(novosAttrs);

        if (preenchimento.marca) {
          setMarca((prev) => (prev.trim() ? prev : preenchimento.marca || prev));
        }
        if (preenchimento.modelo) {
          setModelo((prev) => (prev.trim() ? prev : preenchimento.modelo || prev));
        }

        // Mantém valores compatíveis já preenchidos pelo usuário e aplica os preenchidos pelo Jev
        setValoresAtributosExtras((prev) => ({
          ...preenchimento.atributosPreenchidos,
          ...filtrarValoresAtributosCompativeis(prev, novosAttrs),
        }));

        // Fallback não-bloqueante via gemini-proxy apenas se restarem atributos obrigatórios de texto livre vazios
        if (preenchimento.atributosTextoLivrePendentes.length > 0) {
          void mercadoLivreJevService
            .preencherAtributosTextoLivreViaGemini({
              lojaId,
              categoryId: res.categoria.id,
              fichaProduto,
              marcaAtual: marcaRef.current || preenchimento.marca || undefined,
              modeloAtual: modeloRef.current || preenchimento.modelo || undefined,
              atributosPendentes: preenchimento.atributosTextoLivrePendentes,
            })
            .then((extrasGemini) => {
              if (requisicaoCategoriaSeqRef.current !== seq) return;
              const chaves = Object.keys(extrasGemini);
              if (chaves.length === 0) return;

              setValoresAtributosExtras((prev) => {
                const proximo = { ...prev };
                for (const attrId of chaves) {
                  if (!proximo[attrId]?.value_name?.trim() && extrasGemini[attrId]?.value_name?.trim()) {
                    proximo[attrId] = extrasGemini[attrId];
                  }
                }
                return proximo;
              });
            })
            .catch(() => {
              // Falha silenciosa: usuário pode preencher manualmente os campos restantes
            });
        }
      } catch (err: unknown) {
        if (requisicaoCategoriaSeqRef.current !== seq) return;
        const mensagemOriginal =
          err instanceof Error
            ? err.message
            : 'Não foi possível consultar a categoria deste produto no Mercado Livre.';
        const { mensagemAmigavel } = traduzirErroMercadoLivre(mensagemOriginal);
        setErroCategoria(mensagemAmigavel);
      } finally {
        if (requisicaoCategoriaSeqRef.current === seq) {
          setCarregandoCategoria(false);
        }
      }
    },
    [lojaId]
  );

  // Ao abrir a aba "Publicar Novo Anúncio", consulta automaticamente a categoria predita do ML
  useEffect(() => {
    if (!aberto || !produto || abaAtiva !== 'publicar' || !lojaId) return;
    if (categoriaSelecionadaId || carregandoCategoria || erroCategoria) return;

    consultarCategoriaMl(produto.nome);
  }, [
    aberto,
    produto,
    abaAtiva,
    lojaId,
    categoriaSelecionadaId,
    carregandoCategoria,
    erroCategoria,
    consultarCategoriaMl,
  ]);

  if (!aberto || !produto) return null;

  const precoBaseReferencia = variacaoAtual
    ? (variacaoAtual.preco_promocional && variacaoAtual.preco_promocional > 0 ? variacaoAtual.preco_promocional : variacaoAtual.preco_venda_varejo)
    : (produto.promocao_ativa && produto.preco_promocional && produto.preco_promocional > 0 ? produto.preco_promocional : produto.preco_venda_varejo);

  const breakdownPreco = calcularBreakdownPrecoMercadoLivre(precoBaseReferencia, margemComissao, taxaFixa);
  const precoCalculadoMl = breakdownPreco.precoFinalMl;
  const estoqueFisico = variacaoAtual ? variacaoAtual.quantidade_estoque : produto.quantidade_estoque;

  const formatarMoeda = (valor: number) => `R$ ${valor.toFixed(2).replace('.', ',')}`;

  // Atributos obrigatórios dinâmicos da categoria (excluindo BRAND e MODEL que têm campos próprios)
  const atributosDinamicosCategoria = atributosCategoria.filter(
    (attr) => attr.id !== 'BRAND' && attr.id !== 'MODEL' && attr.id !== 'ITEM_CONDITION' && attr.id !== 'GTIN'
  );

  // Validações estritas para publicação no Mercado Livre
  const temFotos = Boolean(
    (Array.isArray(produto.fotos_urls) && produto.fotos_urls.length > 0) ||
    (Array.isArray((produto as any).fotos) && (produto as any).fotos.length > 0) ||
    (produto as any).url_foto
  );
  const temCategoria = Boolean(categoriaSelecionadaId.trim());
  const temMarca = Boolean(marca.trim());
  const temModelo = Boolean(modelo.trim());
  const temPrecoValido = precoCalculadoMl > 0;
  const temEstoque = estoqueFisico > 0;

  const camposPendentesPublicacao: string[] = [];
  if (!temFotos) camposPendentesPublicacao.push('Fotos do produto (mínimo 1 foto)');
  if (!temCategoria) camposPendentesPublicacao.push('Categoria oficial no Mercado Livre');
  if (!temMarca) camposPendentesPublicacao.push('Marca (obrigatório)');
  if (!temModelo) camposPendentesPublicacao.push('Modelo (obrigatório)');
  for (const attr of atributosDinamicosCategoria) {
    if (!valoresAtributosExtras[attr.id]?.value_name?.trim()) {
      camposPendentesPublicacao.push(`${attr.name} (obrigatório na categoria)`);
    }
  }
  if (!temPrecoValido) camposPendentesPublicacao.push('Preço final de venda maior que R$ 0,00');
  if (!temEstoque) camposPendentesPublicacao.push('Estoque físico disponível maior que 0');

  const formularioPublicacaoValido = camposPendentesPublicacao.length === 0 && !carregandoCategoria;

  const handleVincularExistente = async () => {
    const itemLimpo = mlItemIdInput.trim().toUpperCase();
    if (!itemLimpo) {
      mostrarAviso('Informe o código do anúncio (Ex: MLB1234567890).', 'Campo Obrigatório');
      return;
    }

    if (!itemLimpo.startsWith('MLB')) {
      mostrarAviso('O código do anúncio no Brasil deve começar com "MLB" (Ex: MLB384920192).', 'Código Inválido');
      return;
    }

    try {
      setSalvando(true);
      const res = await mercadoLivreService.vincularAnuncioExistente({
        lojaId,
        produtoId: produto.id,
        variacaoId: variacaoSelecionadaId || null,
        mlItemId: itemLimpo,
      });

      mostrarSucesso(res.mensagem, 'Anúncio Vinculado');
      if (onSucesso) onSucesso();
      onFechar();
    } catch (err: any) {
      const { mensagemAmigavel, detalheTecnico } = traduzirErroMercadoLivre(
        err?.message || 'Erro ao vincular anúncio.'
      );
      mostrarErro(mensagemAmigavel, 'Falha de Vínculo', detalheTecnico);
    } finally {
      setSalvando(false);
    }
  };

  const montarAtributosExtrasPayload = () => {
    return atributosDinamicosCategoria
      .map((attr) => {
        const entrada = valoresAtributosExtras[attr.id];
        if (!entrada) return null;
        let valorLimpo = entrada.value_name?.trim() || '';
        if (!valorLimpo && !entrada.value_id) return null;

        // Para atributos numéricos com unidade padrão (number_unit), anexa default_unit se o usuário informou só o número
        if (
          attr.value_type === 'number_unit' &&
          attr.default_unit &&
          valorLimpo &&
          !/[a-zA-Z]/.test(valorLimpo)
        ) {
          valorLimpo = `${valorLimpo} ${attr.default_unit}`;
        }

        return {
          id: attr.id,
          ...(entrada.value_id ? { value_id: entrada.value_id } : {}),
          value_name: valorLimpo,
        };
      })
      .filter((item): item is { id: string; value_id?: string; value_name: string } => item !== null);
  };

  const handlePublicarNovo = async () => {
    if (!formularioPublicacaoValido) {
      mostrarAviso(
        `Preencha todos os campos obrigatórios antes de publicar: ${camposPendentesPublicacao.join(', ')}.`,
        'Dados Incompletos'
      );
      return;
    }

    try {
      setSalvando(true);

      const atributosExtras = montarAtributosExtrasPayload();

      const gdmCanonico = converterProdutoHubiParaGdmMl(produto, variacaoAtual, {
        categoriaMlId: categoriaSelecionadaId,
        tipoAnuncio,
        margemSobreprecoPercentual: margemComissao,
        taxaFixaMl: taxaFixa,
        marca: marca.trim() || undefined,
        modelo: modelo.trim() || undefined,
        atributosExtras,
      });

      const payloadMl = converterGdmParaPayloadApiMl(gdmCanonico, produto.descricao || undefined);

      const res = await mercadoLivreService.criarAnuncio({
        lojaId,
        produtoId: produto.id,
        variacaoId: variacaoSelecionadaId || null,
        payloadMl,
        margemSobrepreco: margemComissao,
        categoryId: categoriaSelecionadaId,
        atributosExtras,
      });

      mostrarSucesso(res.mensagem, 'Anúncio Publicado');
      if (onSucesso) onSucesso();
      onFechar();
    } catch (err: any) {
      const { mensagemAmigavel, detalheTecnico } = traduzirErroMercadoLivre(
        err?.message || 'Erro ao publicar novo anúncio no Mercado Livre.'
      );
      mostrarErro(mensagemAmigavel, 'Falha na Publicação', detalheTecnico);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl rounded-3xl p-6 shadow-2xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-black text-slate-900 dark:text-white flex flex-col max-h-[92vh] overflow-y-auto"
      >
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-4 border-b-2 border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#FFE600] border border-amber-400 flex items-center justify-center text-slate-950 font-black shadow-xs shrink-0">
              <ShoppingBag className="w-5 h-5 text-[#2D3277]" />
            </div>
            <div>
              <h3 className="font-black text-lg leading-tight text-slate-900 dark:text-white">
                Integração Mercado Livre
              </h3>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-300 truncate max-w-[280px] sm:max-w-md mt-0.5">
                {produto.nome}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            title="Fechar"
            className={`hubi-btn-close-x p-1.5 rounded-xl border transition cursor-pointer ${
              isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SELETOR DE VARIAÇÃO SE EXISTIR */}
        {produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0 && (
          <div className="mt-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-950 border-2 border-slate-300 dark:border-slate-700 space-y-2">
            <label className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Vincular Variação Específica:</span>
            </label>
            <select
              value={variacaoSelecionadaId}
              onChange={(e) => setVariacaoSelecionadaId(e.target.value)}
              className="w-full bg-white dark:bg-black border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white outline-hidden focus:border-emerald-500"
            >
              <option value="">Produto Principal (Sem variação vinculada)</option>
              {produto.variacoes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.combinacao_nome || `${v.valor_variacao_1} ${v.valor_variacao_2 || ''}`} (Estoque: {v.quantidade_estoque})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ABAS */}
        <div className="flex border-b-2 border-slate-200 dark:border-slate-800 mt-4">
          <button
            type="button"
            onClick={() => setAbaAtiva('vincular')}
            className={`flex-1 py-3 text-sm font-black border-b-2 -mb-[2px] flex items-center justify-center gap-2 transition cursor-pointer ${
              abaAtiva === 'vincular'
                ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Link className="w-4 h-4" />
            <span>Vincular Anúncio Existente</span>
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva('publicar')}
            className={`flex-1 py-3 text-sm font-black border-b-2 -mb-[2px] flex items-center justify-center gap-2 transition cursor-pointer ${
              abaAtiva === 'publicar'
                ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Publicar Novo Anúncio</span>
          </button>
        </div>

        {/* CONTEÚDO DA ABA 1: VINCULAR EXISTENTE */}
        {abaAtiva === 'vincular' && (
          <div className="py-5 space-y-4 animate-in fade-in">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wide text-slate-800 dark:text-slate-200 block">
                ID do Anúncio no Mercado Livre (MLB...)
              </label>
              <input
                type="text"
                value={mlItemIdInput}
                onChange={(e) => setMlItemIdInput(e.target.value)}
                placeholder="Ex: MLB384920192"
                className="w-full bg-slate-50 dark:bg-zinc-950 border-2 border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono font-black text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-hidden uppercase focus:border-emerald-500"
              />
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                Localize o ID na URL do seu anúncio no Mercado Livre (ex:{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-900 border border-slate-300 dark:border-slate-700 font-mono text-slate-800 dark:text-slate-200">
                  mercadolivre.com.br/MLB-123456789...
                </code>
                ).
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500/40 text-emerald-900 dark:text-emerald-200 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-black">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Estoque Físico Local Sincronizado</span>
              </div>
              <p className="text-xs font-medium leading-relaxed">
                Ao vincular, o Mercado Livre passará a espelhar os{' '}
                <strong className="font-black underline decoration-emerald-500/60">
                  {estoqueFisico} itens
                </strong>{' '}
                do seu estoque físico local. Qualquer venda física no balcão abaterá o saldo do anúncio instantaneamente.
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando}
                className="hubi-btn-neutral px-4 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-sm font-bold text-slate-900 dark:text-slate-100 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleVincularExistente}
                disabled={salvando}
                className="hubi-btn-cta px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Vinculando...</span>
                  </>
                ) : (
                  <>
                    <Link className="w-4 h-4" />
                    <span>Confirmar Vínculo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* CONTEÚDO DA ABA 2: PUBLICAR NOVO ANÚNCIO */}
        {abaAtiva === 'publicar' && (
          <div className="py-5 space-y-4 animate-in fade-in">
            {/* Categoria no Mercado Livre (Predição Real + Seletor / Busca) */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border-2 border-slate-300 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-black uppercase tracking-wide text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Categoria no Mercado Livre</span>
                </label>
                {categoriaSelecionadaId && (
                  <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-800 dark:text-emerald-300">
                    {categoriaSelecionadaId}
                  </span>
                )}
              </div>

              {carregandoCategoria ? (
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white dark:bg-black border-2 border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Consultando categoria oficial e atributos obrigatórios no Mercado Livre...</span>
                </div>
              ) : erroCategoria ? (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-500/50 text-xs font-bold text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2">
                  <span>{erroCategoria}</span>
                  <button
                    type="button"
                    onClick={() => consultarCategoriaMl(termoBuscaCategoria || produto.nome)}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Tentar</span>
                  </button>
                </div>
              ) : caminhoCategoriaMl ? (
                <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-black border-2 border-emerald-500/50 text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-snug">
                  {caminhoCategoriaMl}
                </div>
              ) : (
                <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-black border-2 border-amber-500/50 text-xs font-bold text-amber-800 dark:text-amber-300">
                  Nenhuma categoria selecionada. Pesquise pelo nome do produto abaixo.
                </div>
              )}

              {/* Seletor entre sugestões retornadas pelo Mercado Livre */}
              {sugestoesCategoria.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                    Sugestões de Categoria (troque se desejar):
                  </label>
                  <select
                    value={categoriaSelecionadaId}
                    disabled={carregandoCategoria}
                    onChange={(e) => {
                      const novoId = e.target.value;
                      if (novoId) {
                        consultarCategoriaMl(termoBuscaCategoria || produto.nome, novoId);
                      }
                    }}
                    className="w-full bg-white dark:bg-black border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-hidden focus:border-emerald-500 disabled:opacity-60"
                  >
                    {sugestoesCategoria.map((sug) => (
                      <option key={sug.category_id} value={sug.category_id}>
                        {sug.category_name}
                        {sug.domain_name ? ` (${sug.domain_name})` : ''} — {sug.category_id}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Busca alternativa por palavra-chave */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={termoBuscaCategoria}
                  onChange={(e) => setTermoBuscaCategoria(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      consultarCategoriaMl(termoBuscaCategoria);
                    }
                  }}
                  placeholder="Buscar outra categoria (ex: Relógio de Pulso)..."
                  className="flex-1 bg-white dark:bg-black border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-hidden focus:border-emerald-500"
                />
                <button
                  type="button"
                  disabled={carregandoCategoria || !termoBuscaCategoria.trim()}
                  onClick={() => consultarCategoriaMl(termoBuscaCategoria)}
                  className="px-3.5 py-2 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Buscar</span>
                </button>
              </div>
            </div>

            {/* Tipo de Anúncio ML */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wide text-slate-800 dark:text-slate-200 block">
                Tipo de Exposição no Mercado Livre
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setTipoAnuncio('gold_special')}
                  className={`p-3.5 rounded-2xl border-2 text-left transition cursor-pointer ${
                    tipoAnuncio === 'gold_special'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                      : 'bg-slate-50 dark:bg-zinc-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
                  }`}
                >
                  <span className="block text-sm font-black">Clássico</span>
                  <span className="block text-xs font-medium opacity-90 mt-0.5">
                    Exposição padrão (~11% a 14%)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setTipoAnuncio('gold_pro')}
                  className={`p-3.5 rounded-2xl border-2 text-left transition cursor-pointer ${
                    tipoAnuncio === 'gold_pro'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                      : 'bg-slate-50 dark:bg-zinc-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
                  }`}
                >
                  <span className="block text-sm font-black">Premium</span>
                  <span className="block text-xs font-medium opacity-90 mt-0.5">
                    Até 12x sem juros (~16% a 19%)
                  </span>
                </button>
              </div>
            </div>

            {/* Calculadora de Preço com Comissão + Custo Fixo (Repasse Líquido) */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border-2 border-slate-300 dark:border-slate-700 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                    Margem / Comissão (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="95"
                    step="0.5"
                    value={margemComissao}
                    onChange={(e) => setMargemComissao(Math.max(0, Math.min(95, parseFloat(e.target.value) || 0)))}
                    className="w-full bg-white dark:bg-black border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-black text-slate-900 dark:text-white outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                    Custo Fixo (&lt; R$ 79,00) (R$)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    value={taxaFixa}
                    onChange={(e) => setTaxaFixa(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-white dark:bg-black border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-black text-slate-900 dark:text-white outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Card de Preço Final em Destaque */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border-2 border-emerald-500/50">
                <span className="text-xs font-black uppercase tracking-wide text-emerald-900 dark:text-emerald-200">
                  Preço Final no ML
                </span>
                <span className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-400">
                  {formatarMoeda(precoCalculadoMl)}
                </span>
              </div>

              {/* Breakdown Claro do Cálculo */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Preço Base HUBI (Líquido desejado)</span>
                  <span className="font-mono font-bold">{formatarMoeda(breakdownPreco.precoBaseHubi)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>+ Custo Fixo ML (&lt; R$ 79,00)</span>
                  <span className="font-mono font-bold">
                    {breakdownPreco.isentoCustoFixo
                      ? 'Isento (≥ R$ 79,00)'
                      : formatarMoeda(breakdownPreco.custoFixoAplicado)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>+ Comissão ML ({margemComissao}%)</span>
                  <span className="font-mono font-bold">{formatarMoeda(breakdownPreco.valorComissao)}</span>
                </div>
              </div>
            </div>

            {/* Marca e Modelo (Obrigatórios no Mercado Livre) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Marca</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 border border-amber-400/60 text-amber-800 dark:text-amber-300 font-bold">
                    * Obrigatório
                  </span>
                </label>
                <input
                  type="text"
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  placeholder="Ex: Samsung, Genérico..."
                  className={`w-full bg-slate-50 dark:bg-zinc-950 border-2 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-hidden transition ${
                    !marca.trim()
                      ? 'border-amber-500/70 focus:border-amber-500'
                      : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500'
                  }`}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Modelo</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 border border-amber-400/60 text-amber-800 dark:text-amber-300 font-bold">
                    * Obrigatório
                  </span>
                </label>
                <input
                  type="text"
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="Ex: Pro, V2, Standard..."
                  className={`w-full bg-slate-50 dark:bg-zinc-950 border-2 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-hidden transition ${
                    !modelo.trim()
                      ? 'border-amber-500/70 focus:border-amber-500'
                      : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500'
                  }`}
                />
              </div>
            </div>

            {/* Atributos Obrigatórios Dinâmicos da Categoria no ML */}
            {atributosDinamicosCategoria.length > 0 && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border-2 border-slate-300 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-900 dark:text-white">
                    Ficha Técnica Obrigatória da Categoria
                  </span>
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    {atributosDinamicosCategoria.length}{' '}
                    {atributosDinamicosCategoria.length === 1 ? 'campo' : 'campos'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {atributosDinamicosCategoria.map((attr) => {
                    const valorAtual = valoresAtributosExtras[attr.id]?.value_name || '';
                    const valorIdAtual = valoresAtributosExtras[attr.id]?.value_id || '';
                    const preenchido = Boolean(valorAtual.trim());
                    const temOpcoes = Array.isArray(attr.values) && attr.values.length > 0;

                    return (
                      <div key={attr.id} className="space-y-1.5">
                        <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center justify-between gap-2">
                          <span className="truncate" title={attr.name}>
                            {attr.name}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 border border-amber-400/60 text-amber-800 dark:text-amber-300 font-bold shrink-0">
                            * Obrigatório
                          </span>
                        </label>

                        {temOpcoes ? (
                          <select
                            value={valorIdAtual || valorAtual}
                            onChange={(e) => {
                              const idSelecionado = e.target.value;
                              const opcao = attr.values.find(
                                (v) => v.id === idSelecionado || v.name === idSelecionado
                              );
                              setValoresAtributosExtras((prev) => ({
                                ...prev,
                                [attr.id]: {
                                  value_id: opcao?.id,
                                  value_name: opcao?.name || '',
                                },
                              }));
                            }}
                            className={`w-full bg-white dark:bg-black border-2 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white outline-hidden transition ${
                              !preenchido
                                ? 'border-amber-500/70 focus:border-amber-500'
                                : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500'
                            }`}
                          >
                            <option value="">Selecione...</option>
                            {attr.values.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="relative flex items-center">
                            <input
                              type={attr.value_type === 'number' ? 'number' : 'text'}
                              value={valorAtual}
                              onChange={(e) => {
                                const texto = e.target.value;
                                setValoresAtributosExtras((prev) => ({
                                  ...prev,
                                  [attr.id]: {
                                    value_name: texto,
                                  },
                                }));
                              }}
                              placeholder={attr.hint || `Informe ${attr.name.toLowerCase()}...`}
                              className={`w-full bg-white dark:bg-black border-2 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-hidden transition ${
                                attr.default_unit ? 'pr-14' : ''
                              } ${
                                !preenchido
                                  ? 'border-amber-500/70 focus:border-amber-500'
                                  : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500'
                              }`}
                            />
                            {attr.default_unit && (
                              <span className="absolute right-3 text-xs font-black text-slate-500 dark:text-slate-400 pointer-events-none">
                                {attr.default_unit}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Aviso de Requisitos Pendentes para Publicação */}
            {!formularioPublicacaoValido && (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-500/60 text-amber-900 dark:text-amber-200 text-xs space-y-1.5 animate-in fade-in">
                <div className="flex items-center gap-2 font-black text-sm">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Pendências para publicação no Mercado Livre:</span>
                </div>
                <ul className="list-disc list-inside text-xs font-semibold space-y-0.5 pl-1">
                  {camposPendentesPublicacao.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando}
                className="hubi-btn-neutral px-4 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-sm font-bold text-slate-900 dark:text-slate-100 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePublicarNovo}
                disabled={salvando || !formularioPublicacaoValido}
                title={
                  !formularioPublicacaoValido
                    ? `Preencha os campos obrigatórios: ${camposPendentesPublicacao.join(', ')}`
                    : 'Publicar anúncio no Mercado Livre'
                }
                className="px-5 py-2.5 rounded-xl bg-[#FFE600] hover:bg-[#F5DC00] border border-amber-500/70 text-slate-950 font-black text-sm flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Publicando...</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4 text-slate-950" />
                    <span>Publicar no Mercado Livre</span>
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
