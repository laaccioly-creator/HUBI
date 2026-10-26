import React, { useState, useEffect, useMemo } from 'react';
import { Scale, Check, X, AlertCircle, Loader2, Share2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { Pedido, ItemPedido, Loja } from '../../types';
import { formatarMoeda } from '../../utils/formatters';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import { EstoquePedidoService } from '../../services/estoquePedidoService';
import { whatsappWalletService, ResultadoDisparoHibrido } from '../../services/whatsappWalletService';

interface ModalConferenciaPesagemPedidoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  loja: Loja | null;
  usuarioId?: string | null;
  onPesagemConfirmada: (pedidoAtualizado: Pedido) => void;
}

interface ItemPesagemState {
  id: string;
  nome: string;
  rotuloVariacao?: string | null;
  tipoUnidade: string;
  ehPesavel: boolean;
  precoUnitario: number;
  quantidadeSolicitada: number;
  pesoAferido: number;
  pesoAferidoStr?: string;
  subtotal: number;
}

export const ModalConferenciaPesagemPedido: React.FC<ModalConferenciaPesagemPedidoProps> = ({
  isOpen,
  onClose,
  pedido,
  loja,
  usuarioId,
  onPesagemConfirmada
}) => {
  const { tema } = useTheme();
  const isDark = tema === 'dark';

  const [itensState, setItensState] = useState<ItemPesagemState[]>([]);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucessoDisparo, setSucessoDisparo] = useState<ResultadoDisparoHibrido | null>(null);
  const [pedidoConcluido, setPedidoConcluido] = useState<Pedido | null>(null);

  // Inicializar itens do pedido com suporte a pesagem
  useEffect(() => {
    if (!isOpen || !pedido) {
      setItensState([]);
      setErro(null);
      setSucessoDisparo(null);
      setPedidoConcluido(null);
      return;
    }

    const rawItens = (pedido.itens || pedido.itens_pedido || []) as ItemPedido[];

    const mapearItens = (produtosMap: Map<string, any>) => {
      return rawItens.map((it) => {
        const p = (it as any).produto || (it as any).produtos || produtosMap.get(it.produto_id);
        const unidade = (
          (it as any).tipo_unidade ||
          it.unidade_medida ||
          p?.tipo_unidade ||
          p?.unidade_medida ||
          'un'
        ).toLowerCase();

        const ehPesavel =
          unidade === 'kg' ||
          Boolean(p?.venda_por_peso) ||
          p?.tipo_unidade === 'kg' ||
          (it as any).produtos?.tipo_unidade === 'kg' ||
          it.peso_solicitado_kg != null;

        const precoUnit = Number(it.preco_venda_unitario || it.preco_unitario || 0);
        const qtdSol = Number(it.quantidade_solicitada ?? it.peso_solicitado_kg ?? it.quantidade ?? 1);
        const pesoAf = Number(it.peso_real_kg ?? it.quantidade ?? qtdSol);
        const sub = Math.round(pesoAf * precoUnit * 100) / 100;

        return {
          id: it.id,
          nome: it.nome_produto || (it as any).nome || p?.nome || 'Produto',
          rotuloVariacao: it.rotulo_variacao,
          tipoUnidade: ehPesavel ? 'kg' : unidade,
          ehPesavel,
          precoUnitario: precoUnit,
          quantidadeSolicitada: qtdSol,
          pesoAferido: pesoAf,
          pesoAferidoStr: pesoAf > 0 ? pesoAf.toString() : '',
          subtotal: sub
        };
      });
    };

    setItensState(mapearItens(new Map()));
    setErro(null);

    // Resiliência defensiva: busca cadastro de produtos para garantir herança de tipo_unidade mesmo em pedidos legados
    const idsFaltantes = rawItens.map(it => it.produto_id).filter(Boolean);
    if (idsFaltantes.length > 0) {
      supabase
        .from('produtos')
        .select('id, nome, tipo_unidade, unidade_medida, venda_por_peso')
        .in('id', idsFaltantes)
        .then(({ data }) => {
          if (data && data.length > 0) {
            const map = new Map<string, any>();
            data.forEach((prod) => map.set(prod.id, prod));
            setItensState(mapearItens(map));
          }
        });
    }
  }, [isOpen, pedido]);

  // Filtragem estrita: exibir exclusivamente itens por quilo (kg), mantendo itens em 'un' nos cálculos
  const itensPesaveis = useMemo(() => {
    return itensState.filter((it) => it.tipoUnidade === 'kg' || it.ehPesavel);
  }, [itensState]);

  // Totais recalculados instantaneamente
  const { subtotalProdutos, valorFrete, valorDescontos, valorTotalDefinitivo, diferencaTotal } = useMemo(() => {
    if (!pedido) {
      return { subtotalProdutos: 0, valorFrete: 0, valorDescontos: 0, valorTotalDefinitivo: 0, diferencaTotal: 0 };
    }

    const subProd = itensState.reduce((acc, item) => acc + item.subtotal, 0);
    const frete = Number(pedido.valor_frete || 0);
    const desc = Number(pedido.valor_desconto || 0) + Number(pedido.valor_desconto_cupom || 0);
    const totalDef = Math.max(0, subProd - desc) + frete;
    const dif = totalDef - Number(pedido.valor_total || 0);

    return {
      subtotalProdutos: subProd,
      valorFrete: frete,
      valorDescontos: desc,
      valorTotalDefinitivo: totalDef,
      diferencaTotal: dif
    };
  }, [itensState, pedido]);

  if (!isOpen || !pedido) return null;

  const handleAlterarPeso = (itemId: string, novoValorStr: string) => {
    // Permite digitação decimal fluida com vírgula ou ponto
    const valorNormalizado = novoValorStr.replace(',', '.');
    const valorNum = parseFloat(valorNormalizado);

    setItensState((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const pesoValido = isNaN(valorNum) || valorNum < 0 ? 0 : valorNum;
        const sub = Math.round(pesoValido * it.precoUnitario * 100) / 100;
        return {
          ...it,
          pesoAferido: pesoValido,
          pesoAferidoStr: novoValorStr,
          subtotal: sub
        };
      })
    );
  };

  const handleConfirmarPesagem = async () => {
    if (!pedido || !loja?.id) return;

    // Validação de segurança: nenhum item pesável pode ter peso <= 0
    const itemInvalido = itensPesaveis.find((it) => it.pesoAferido <= 0);
    if (itemInvalido) {
      setErro(`O produto "${itemInvalido.nome}" precisa ter um peso maior que zero.`);
      return;
    }

    try {
      setSalvando(true);
      setErro(null);

      const dataAtualIso = new Date().toISOString();

      // 1. Atualizar public.itens_pedido com o peso aferido e subtotais
      await Promise.all(
        itensState.map(async (it) => {
          return supabase
            .from('itens_pedido')
            .update({
              quantidade: it.pesoAferido,
              peso_real_kg: it.ehPesavel ? it.pesoAferido : null,
              unidade_medida: it.ehPesavel ? 'KG' : 'UN',
              tipo_unidade: it.ehPesavel ? 'kg' : it.tipoUnidade,
              subtotal: it.subtotal,
              atualizado_em: dataAtualIso
            })
            .eq('id', it.id)
            .eq('loja_id', loja.id);
        })
      );

      // 2. Atualizar public.pedidos com novos totais e avançar status
      const { data: pedidoAtualizado, error: errPedido } = await supabase
        .from('pedidos')
        .update({
          subtotal: subtotalProdutos,
          subtotal_produtos: subtotalProdutos,
          valor_total: valorTotalDefinitivo,
          saldo_devedor: valorTotalDefinitivo,
          status: 'confirmado',
          status_pagamento: 'aguardando_pagamento',
          atualizado_em: dataAtualIso
        })
        .eq('id', pedido.id)
        .eq('loja_id', loja.id)
        .select()
        .single();

      if (errPedido || !pedidoAtualizado) {
        throw new Error(errPedido?.message || 'Falha ao atualizar totais do pedido.');
      }

      // 3. Efetuar baixa idempotente de estoque no peso real aferido
      try {
        await EstoquePedidoService.baixarEstoquePedido({
          pedidoId: pedido.id,
          lojaId: loja.id,
          usuarioId: usuarioId || null
        });
      } catch (errEstoque) {
        console.warn('[ModalConferenciaPesagemPedido] Aviso ao movimentar estoque:', errEstoque);
      }

      // 4. Gravar log auditável em historico_pedidos
      try {
        await supabase.from('historico_pedidos').insert({
          loja_id: loja.id,
          pedido_id: pedido.id,
          usuario_id: usuarioId || null,
          tipo_evento: 'pesagem_confirmada',
          status_anterior: pedido.status || 'pendente',
          status_novo: 'confirmado',
          motivo: `Pesagem de balança confirmada. Valor ajustado de ${formatarMoeda(Number(pedido.valor_total || 0))} para ${formatarMoeda(valorTotalDefinitivo)}.`,
          criado_em: dataAtualIso
        });
      } catch (errHist) {
        console.warn('[ModalConferenciaPesagemPedido] Aviso ao gravar historico_pedidos:', errHist);
      }

      // 5. Motor Híbrido de WhatsApp: Disparar notificação de liberação com Deep Link
      const foneCliente = (
        pedido.cliente?.whatsapp ||
        pedido.cliente?.telefone ||
        pedido.cliente_telefone_avulso ||
        ''
      ).trim();

      const nomeCliente = (
        pedido.cliente?.nome ||
        pedido.cliente_nome_avulso ||
        'Cliente'
      ).trim();

      const dominioAtual = typeof window !== 'undefined' ? window.location.host : 'hubi.app';
      const slugLoja = loja.slug_catalogo || loja.id;
      const deepLinkPagamento = `https://${dominioAtual}/catalog/${slugLoja}?pagar_pedido=${pedido.id}`;

      const textoMensagem = `Olá ${nomeCliente}! Seu pedido #${pedido.numero_pedido} já foi pesado e separado na loja ${loja.nome_fantasia}. O valor definitivo ficou em ${formatarMoeda(valorTotalDefinitivo)}. Toque no link abaixo para escolher como pagar: ${deepLinkPagamento}`;

      let resultadoEnvio: ResultadoDisparoHibrido = {
        sucesso: true,
        modoEnvio: 'manual_link',
        custoAplicado: 0,
        saldoAtual: Number(loja.whatsapp_saldo ?? 0),
        manualUrl: whatsappWalletService.construirLinkManualWhatsApp(foneCliente, textoMensagem)
      };

      if (foneCliente) {
        try {
          resultadoEnvio = await whatsappWalletService.dispararNotificacaoHibrida({
            lojaId: loja.id,
            telefoneDestino: foneCliente,
            mensagem: textoMensagem,
            eventoGatilho: 'liberacao_pagamento_pesagem',
            pedidoId: pedido.id,
            clienteId: pedido.cliente_id || null,
            usuarioId: usuarioId || null
          });
        } catch (errWpp) {
          console.warn('[ModalConferenciaPesagemPedido] Fallback manual de WhatsApp acionado:', errWpp);
        }
      }

      setPedidoConcluido(pedidoAtualizado as Pedido);
      setSucessoDisparo(resultadoEnvio);
      onPesagemConfirmada(pedidoAtualizado as Pedido);
    } catch (e: any) {
      console.error('[ModalConferenciaPesagemPedido] Erro ao confirmar pesagem:', e);
      setErro(e?.message || 'Ocorreu um erro ao registrar os pesos do pedido. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in">
      <div
        className={`rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150 ${
          isDark
            ? 'bg-[#08131A] border-2 border-slate-700 text-slate-100'
            : 'bg-white border-2 border-slate-300 text-slate-900'
        }`}
      >
        {/* CABEÇALHO */}
        <div
          className={`p-4 sm:px-6 border-b flex items-center justify-between ${
            isDark ? 'border-slate-800 bg-[#000000]/60' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base">
                Informar Peso do Pedido #{pedido.numero_pedido}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Informe os pesos reais aferidos na balança para liberar o pagamento definitivo
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              isDark
                ? 'bg-[#000000] border-slate-700 text-white hover:bg-slate-900'
                : 'bg-white border-slate-300 text-slate-900 hover:bg-slate-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FEEDBACK DE SUCESSO PÓS-CONFIRMAÇÃO */}
        {sucessoDisparo ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-6 sm:p-8 space-y-6 text-center overflow-y-auto flex-1">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h4 className="text-lg font-black text-slate-900 dark:text-white">Pesagem Confirmada com Sucesso!</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  O valor definitivo do pedido #{pedido.numero_pedido} foi atualizado para{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400">{formatarMoeda(valorTotalDefinitivo)}</strong> e o estoque foi baixado com precisão.
                </p>
              </div>

              {/* STATUS DO DISPARO WHATSAPP */}
              <div
                className={`p-4 rounded-2xl border text-left space-y-3 ${
                  sucessoDisparo.modoEnvio !== 'manual_link'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                    : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>Notificação WhatsApp</span>
                  <span
                    className={`uppercase text-[10px] px-2.5 py-0.5 rounded-full border ${
                      sucessoDisparo.modoEnvio !== 'manual_link'
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {sucessoDisparo.modoEnvio !== 'manual_link' ? '⚡ Enviado Automaticamente' : '📲 Envio Manual'}
                  </span>
                </div>

                {sucessoDisparo.modoEnvio !== 'manual_link' ? (
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    A mensagem com o link de pagamento foi entregue diretamente ao cliente pelo número oficial da sua loja.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      Clique no botão abaixo para abrir o WhatsApp e enviar o link de pagamento ao cliente em 1 clique:
                    </p>
                    {sucessoDisparo.manualUrl && (
                      <a
                        href={sucessoDisparo.manualUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-md cursor-pointer"
                      >
                        <Share2 className="w-4 h-4" />
                        <span>Enviar Link de Pagamento no WhatsApp</span>
                        <ExternalLink className="w-3.5 h-3.5 ml-1" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RODAPÉ ESTRUTURADO COM BOTÃO SECUNDÁRIO */}
            <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-end">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Concluir e Fechar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* MENSAGEM DE ERRO SE HOUVER */}
            {erro && (
              <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            {/* LISTA DE ITENS PARA CONFERÊNCIA (ESTRITAMENTE KG) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Itens por Quilo ({itensPesaveis.length})
              </div>

              {itensPesaveis.map((item) => (
                <div
                  key={item.id}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition space-y-2.5 ${
                    isDark
                      ? 'border-slate-800 bg-slate-900/60'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs sm:text-sm block truncate">
                          {item.nome}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                          KG
                        </span>
                      </div>

                      {item.rotuloVariacao && (
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          {item.rotuloVariacao}
                        </span>
                      )}

                      <span className="text-xs font-mono font-bold text-slate-500 block mt-0.5">
                        {formatarMoeda(item.precoUnitario)} /kg
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        Subtotal do Item
                      </span>
                      <span className="text-sm sm:text-base font-black font-mono text-emerald-500 block">
                        {formatarMoeda(item.subtotal)}
                      </span>
                    </div>
                  </div>

                  {/* CONTROLE DE PESAGEM / QUANTIDADE */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs text-slate-500">
                      <span>Qtd. Solicitada: </span>
                      <strong className="text-slate-900 dark:text-slate-100 font-mono">
                        {item.quantidadeSolicitada.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg
                      </strong>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Peso Aferido (Balança):
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={salvando}
                          value={item.pesoAferidoStr ?? (item.pesoAferido > 0 ? item.pesoAferido.toString() : '')}
                          onChange={(e) => handleAlterarPeso(item.id, e.target.value)}
                          placeholder="0,000"
                          className="w-28 p-2 rounded-xl text-right font-mono font-black text-sm border focus:outline-hidden transition border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                        <span className="absolute left-2.5 top-2.5 text-xs text-slate-400 font-bold uppercase pointer-events-none">
                          KG
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* PAINEL DE FECHAMENTO FINANCEIRO RECALCULADO */}
            <div
              className={`p-4 sm:px-6 border-t space-y-3 ${
                isDark ? 'border-slate-800 bg-[#000000]/80' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Subtotal Itens</span>
                  <strong className="font-mono text-xs sm:text-sm font-black">{formatarMoeda(subtotalProdutos)}</strong>
                </div>

                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Frete Fixo</span>
                  <strong className="font-mono text-xs sm:text-sm font-black">{formatarMoeda(valorFrete)}</strong>
                </div>

                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Descontos</span>
                  <strong className="font-mono text-xs sm:text-sm font-black text-rose-500">
                    - {formatarMoeda(valorDescontos)}
                  </strong>
                </div>

                <div className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block uppercase font-black">
                    Total Definitivo
                  </span>
                  <strong className="font-mono text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400">
                    {formatarMoeda(valorTotalDefinitivo)}
                  </strong>
                </div>
              </div>

              {Math.abs(diferencaTotal) > 0.009 && (
                <div className="text-right text-[11px] text-slate-500">
                  Variação em relação ao pedido inicial:
                  <span className={`font-mono font-bold ml-1 ${diferencaTotal > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {diferencaTotal > 0 ? `+ ${formatarMoeda(diferencaTotal)}` : formatarMoeda(diferencaTotal)}
                  </span>
                </div>
              )}

              {/* BOTÕES DE AÇÃO */}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  disabled={salvando}
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={salvando}
                  onClick={handleConfirmarPesagem}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition cursor-pointer active:scale-95"
                >
                  {salvando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processando Baixa & Notificação...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Confirmar Pesagem & Liberar Pagamento</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
