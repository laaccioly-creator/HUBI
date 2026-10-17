import React, { useState } from 'react';
import {
  ShoppingBag,
  X,
  Link,
  PlusCircle,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Percent,
  Layers,
  ArrowRight
} from 'lucide-react';
import { Produto, VariacaoProduto } from '../../types';
import { mercadoLivreService } from '../../services/mercadoLivreService';
import {
  converterProdutoHubiParaGdmMl,
  converterGdmParaPayloadApiMl,
  calcularPrecoMercadoLivre
} from '../../utils/gdmMercadoLivreMapper';
import { useFeedbackModal } from '../../contexts/FeedbackContext';

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
  isDark = true,
  onSucesso,
}) => {
  const { mostrarErro, mostrarSucesso, mostrarAviso } = useFeedbackModal();
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

  if (!aberto || !produto) return null;

  const variacaoAtual: VariacaoProduto | null =
    produto.variacoes?.find((v) => v.id === variacaoSelecionadaId) || null;

  const precoBaseReferencia = variacaoAtual
    ? (variacaoAtual.preco_promocional && variacaoAtual.preco_promocional > 0 ? variacaoAtual.preco_promocional : variacaoAtual.preco_venda_varejo)
    : (produto.promocao_ativa && produto.preco_promocional && produto.preco_promocional > 0 ? produto.preco_promocional : produto.preco_venda_varejo);

  const precoCalculadoMl = calcularPrecoMercadoLivre(precoBaseReferencia, margemComissao, taxaFixa);
  const estoqueFisico = variacaoAtual ? variacaoAtual.quantidade_estoque : produto.quantidade_estoque;

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
      mostrarErro(err.message || 'Erro ao vincular anúncio.', 'Falha de Vínculo');
    } finally {
      setSalvando(false);
    }
  };

  const handlePublicarNovo = async () => {
    try {
      setSalvando(true);

      const gdmCanonico = converterProdutoHubiParaGdmMl(produto, variacaoAtual, {
        tipoAnuncio,
        margemSobreprecoPercentual: margemComissao,
        taxaFixaMl: taxaFixa,
        marca: marca.trim() || undefined,
        modelo: modelo.trim() || undefined,
      });

      const payloadMl = converterGdmParaPayloadApiMl(gdmCanonico, produto.descricao || undefined);

      const res = await mercadoLivreService.criarAnuncio({
        lojaId,
        produtoId: produto.id,
        variacaoId: variacaoSelecionadaId || null,
        payloadMl,
        margemSobrepreco: margemComissao,
      });

      mostrarSucesso(res.mensagem, 'Anúncio Publicado');
      if (onSucesso) onSucesso();
      onFechar();
    } catch (err: any) {
      mostrarErro(err.message || 'Erro ao publicar novo anúncio no Mercado Livre.', 'Falha na Publicação');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className={`w-full max-w-xl rounded-3xl p-6 shadow-2xl border flex flex-col max-h-[90vh] overflow-y-auto ${
          isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FFE600] flex items-center justify-center text-slate-950 font-black shadow-xs shrink-0">
              <ShoppingBag className="w-5 h-5 text-[#2D3277]" />
            </div>
            <div>
              <h3 className="font-black text-base">Integração Mercado Livre</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[280px] sm:max-w-md">
                {produto.nome}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SELETOR DE VARIAÇÃO SE EXISTIR */}
        {produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0 && (
          <div className="mt-4 p-3 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-500" />
              <span>Vincular Variação Específica:</span>
            </label>
            <select
              value={variacaoSelecionadaId}
              onChange={(e) => setVariacaoSelecionadaId(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 outline-hidden"
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
        <div className="flex border-b border-slate-200 dark:border-slate-800 mt-4">
          <button
            type="button"
            onClick={() => setAbaAtiva('vincular')}
            className={`flex-1 py-2.5 text-xs font-black border-b-2 flex items-center justify-center gap-2 transition cursor-pointer ${
              abaAtiva === 'vincular'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            <span>Vincular Anúncio Existente</span>
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva('publicar')}
            className={`flex-1 py-2.5 text-xs font-black border-b-2 flex items-center justify-center gap-2 transition cursor-pointer ${
              abaAtiva === 'publicar'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Publicar Novo Anúncio</span>
          </button>
        </div>

        {/* CONTEÚDO DA ABA 1: VINCULAR EXISTENTE */}
        {abaAtiva === 'vincular' && (
          <div className="py-4 space-y-4 animate-in fade-in">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                ID do Anúncio no Mercado Livre (MLB...)
              </label>
              <input
                type="text"
                value={mlItemIdInput}
                onChange={(e) => setMlItemIdInput(e.target.value)}
                placeholder="Ex: MLB384920192"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-hidden uppercase focus:border-emerald-500"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Localize o ID na URL do seu anúncio no Mercado Livre (ex: <code>mercadolivre.com.br/MLB-123456789...</code>).
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Estoque Físico Local Sincronizado</span>
              </div>
              <p className="text-[11px] opacity-90">
                Ao vincular, o Mercado Livre passará a espelhar os <strong>{estoqueFisico} itens</strong> do seu estoque físico local. Qualquer venda física no balcão abaterá o saldo do anúncio instantaneamente.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleVincularExistente}
                disabled={salvando}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Vinculando...</span>
                  </>
                ) : (
                  <>
                    <Link className="w-3.5 h-3.5" />
                    <span>Confirmar Vínculo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* CONTEÚDO DA ABA 2: PUBLICAR NOVO ANÚNCIO */}
        {abaAtiva === 'publicar' && (
          <div className="py-4 space-y-4 animate-in fade-in">
            {/* Tipo de Anúncio ML */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Tipo de Exposição no Mercado Livre
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipoAnuncio('gold_special')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    tipoAnuncio === 'gold_special'
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500'
                  }`}
                >
                  <span className="block text-xs font-black">Clássico</span>
                  <span className="block text-[10px] opacity-80">Exposição padrão (~11% a 14%)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTipoAnuncio('gold_pro')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    tipoAnuncio === 'gold_pro'
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500'
                  }`}
                >
                  <span className="block text-xs font-black">Premium</span>
                  <span className="block text-[10px] opacity-80">Até 12x sem juros (~16% a 19%)</span>
                </button>
              </div>
            </div>

            {/* Calculadora de Preço com Comissão */}
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 block">Margem / Comissão (%)</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={margemComissao}
                  onChange={(e) => setMargemComissao(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 block">Preço Final no ML</label>
                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-black text-sm font-mono">
                  R$ {precoCalculadoMl.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Marca e Modelo Opcionais */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Marca</label>
                <input
                  type="text"
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  placeholder="Ex: Samsung, Genérico..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Modelo</label>
                <input
                  type="text"
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="Ex: Pro, V2, Standard..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 outline-hidden"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePublicarNovo}
                disabled={salvando}
                className="px-4 py-2 rounded-xl bg-[#FFE600] hover:bg-[#F5DC00] text-slate-950 font-black text-xs flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                    <span>Publicando...</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-3.5 h-3.5 text-slate-950" />
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
