import React, { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { Categoria, Produto } from '../../types';
import type { AnuncioMlResumo } from '../ProdutosEstoque';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { mercadoLivreService } from '../../services/mercadoLivreService';
import {
  EstadoPublicacaoMassaMl,
  mercadoLivrePublicacaoMassaService,
} from '../../services/mercadoLivrePublicacaoMassaService';
import {
  obterArvoreCategorias,
  obterCategoriaPaiId,
  obterSubcategoriaIdProduto,
  obterSubcategoriasDe,
} from '../../utils/categoriasHierarquia';

interface ModalPublicarMassaMlProps {
  lojaId: string;
  produtos: Produto[];
  categorias: Categoria[];
  mapaAnunciosMl: Record<string, AnuncioMlResumo[]>;
}

export const ModalPublicarMassaMl: React.FC<ModalPublicarMassaMlProps> = ({
  lojaId,
  produtos,
  categorias,
  mapaAnunciosMl,
}) => {
  const [estado, setEstado] = useState<EstadoPublicacaoMassaMl>(() =>
    mercadoLivrePublicacaoMassaService.getEstado()
  );

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

  useEffect(() => {
    return mercadoLivrePublicacaoMassaService.inscrever(() => {
      setEstado(mercadoLivrePublicacaoMassaService.getEstado());
    });
  }, []);

  const arvoreCategorias = useMemo(
    () => obterArvoreCategorias(categorias, lojaId),
    [categorias, lojaId]
  );

  const subcategoriasDaSelecionada = useMemo(
    () =>
      categoriaIdSelecionada
        ? obterSubcategoriasDe(categorias, categoriaIdSelecionada, lojaId)
        : [],
    [categorias, categoriaIdSelecionada, lojaId]
  );

  // Inicializa escopo com filtro vindo da tela e carrega preferências da conta ML ao abrir em modo ocioso
  useEffect(() => {
    if (!estado.modalAberto || estado.minimizado || !lojaId) return;

    if (estado.status === 'ocioso') {
      if (estado.categoriaInicialId) {
        const catObj = categorias.find((c) => c.id === estado.categoriaInicialId);
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
        setCategoriaIdSelecionada(arvoreCategorias[0]?.id || '');
        setSubcategoriaIdSelecionada('');
      }

      let ativo = true;
      setCarregandoConfigConta(true);
      mercadoLivreService
        .obterConta(lojaId)
        .then((conta) => {
          if (!ativo || !conta) return;
          if (typeof conta.taxa_comissao_padrao_percentual === 'number') {
            setMargemComissao(Number(conta.taxa_comissao_padrao_percentual));
          }
          if (typeof conta.taxa_fixa_padrao === 'number') {
            setCustoFixoAbaixo79(Number(conta.taxa_fixa_padrao));
          }
        })
        .catch(() => {
          // Mantém valores padrão silenciosamente
        })
        .finally(() => {
          if (ativo) setCarregandoConfigConta(false);
        });

      return () => {
        ativo = false;
      };
    }
  }, [
    estado.modalAberto,
    estado.minimizado,
    estado.status,
    estado.categoriaInicialId,
    lojaId,
    categorias,
    arvoreCategorias,
  ]);

  const handleFecharOuMinimizar = () => {
    mercadoLivrePublicacaoMassaService.fecharModal();
  };

  useRegisterOverlay(
    estado.modalAberto && !estado.minimizado,
    handleFecharOuMinimizar,
    'modal-publicar-massa-ml',
    'modal'
  );

  // Calcula produtos no escopo e separa elegíveis vs já vinculados ao ML
  const { elegiveis, jaVinculados } = useMemo(() => {
    const ativosFisicos = produtos.filter(
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
    produtos,
    modoEscopo,
    categoriaIdSelecionada,
    subcategoriaIdSelecionada,
    subcategoriasDaSelecionada,
    mapaAnunciosMl,
    lojaId,
  ]);

  if (!estado.modalAberto || estado.minimizado) {
    return null;
  }

  const progressoPercentual =
    estado.total > 0 ? Math.round((estado.processados / estado.total) * 100) : 0;

  const handleIniciarLote = () => {
    if (!lojaId || elegiveis.length === 0) return;

    mercadoLivrePublicacaoMassaService.iniciarLote({
      lojaId,
      produtos: elegiveis,
      categorias,
      tipoAnuncio,
      margemComissao: Number.isFinite(margemComissao) ? margemComissao : 0,
      custoFixoAbaixo79: Number.isFinite(custoFixoAbaixo79) ? custoFixoAbaixo79 : 0,
      permitirSemEanQuandoCategoriaAceitar: permitirSemEan,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleFecharOuMinimizar();
      }}
    >
      <div className="w-full max-w-2xl rounded-3xl p-6 shadow-2xl border-2 border-slate-300 bg-white text-black flex flex-col max-h-[92vh] overflow-y-auto space-y-5 animate-in zoom-in-95 duration-150">
        {/* CABEÇALHO */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b-2 border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#FFE600] border border-amber-400 flex items-center justify-center text-black font-black shadow-xs shrink-0">
              <ShoppingBag className="w-5 h-5 text-black" />
            </div>
            <div>
              <h3 className="font-black text-lg leading-tight text-black">
                Publicar em Massa no Mercado Livre
              </h3>
              <p className="text-xs font-bold text-slate-700 mt-0.5">
                {estado.status === 'ocioso'
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

        {/* TELA 1: CONFIGURAÇÃO DO LOTE */}
        {estado.status === 'ocioso' && (
          <div className="space-y-5">
            {/* Filtro de Escopo Integrado */}
            <div className="space-y-3 p-4 rounded-2xl border-2 border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-black">
                <Filter className="w-4 h-4 text-black" />
                <span>Escopo de Produtos</span>
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
                  Tentar publicar sem EAN quando a categoria permitir (pular se exigir EAN obrigatório)
                </span>
              </label>
            </div>

            {/* Rodapé Ações */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2 border-t-2 border-slate-200">
              <button
                type="button"
                onClick={handleFecharOuMinimizar}
                className="hubi-btn-neutral px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-bold text-sm transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={elegiveis.length === 0}
                onClick={handleIniciarLote}
                className="px-5 py-2.5 rounded-xl bg-emerald-300 hover:bg-emerald-400 text-black font-black text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShoppingBag className="w-4 h-4 text-black" />
                <span>
                  Iniciar Publicação em Massa ({elegiveis.length})
                </span>
              </button>
            </div>
          </div>
        )}

        {/* TELA 2: EXECUÇÃO EM ANDAMENTO */}
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
                <div className="text-[11px] font-black uppercase text-slate-700">Processados</div>
                <div className="text-lg font-black font-mono text-black mt-0.5">
                  {estado.processados}/{estado.total}
                </div>
              </div>
              <div className="p-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50">
                <div className="text-[11px] font-black uppercase text-emerald-900">Publicados</div>
                <div className="text-lg font-black font-mono text-emerald-900 mt-0.5">
                  {estado.publicados}
                </div>
              </div>
              <div className="p-3 rounded-2xl border-2 border-amber-300 bg-amber-50">
                <div className="text-[11px] font-black uppercase text-amber-900">Pendências</div>
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
                className="px-5 py-2.5 rounded-xl bg-emerald-300 hover:bg-emerald-400 text-black font-black text-sm inline-flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
              >
                <Minimize2 className="w-4 h-4 text-black" />
                <span>Minimizar e Continuar Usando o Rubi</span>
              </button>
            </div>
          </div>
        )}

        {/* TELA 3: RESUMO FINAL */}
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
              <button
                type="button"
                onClick={() => mercadoLivrePublicacaoMassaService.resetarParaNovaConfiguracao()}
                className="hubi-btn-neutral px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-bold text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-black" />
                <span>Nova Publicação</span>
              </button>

              <button
                type="button"
                onClick={handleFecharOuMinimizar}
                className="px-5 py-2.5 rounded-xl bg-emerald-300 hover:bg-emerald-400 text-black font-black text-sm transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
