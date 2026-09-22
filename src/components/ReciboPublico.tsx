import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Printer,
  Download,
  Share2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Store,
  MapPin,
  Calendar,
  CreditCard,
  ShoppingBag,
  ExternalLink
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Pedido, Loja, ItemPedido } from '../types';
import {
  formatarDataRecibo,
  obterDadosPagamentoRecibo,
  formatarVendedorRecibo,
  obterInfoEntregaRecibo,
  PrintService
} from '../services/printService';
import { ReceiptPdfService } from '../services/receiptPdfService';
import { obterInfoVencimentoFiado } from '../utils/statusPedidoUtils';

export const ReciboPublico: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [loja, setLoja] = useState<Loja | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [baixandoPdf, setBaixandoPdf] = useState<boolean>(false);
  const [compartilhando, setCompartilhando] = useState<boolean>(false);
  const reciboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const buscarPedido = async () => {
      if (!id) {
        setErroMsg('Identificador de pedido não informado.');
        setCarregando(false);
        return;
      }

      try {
        setCarregando(true);
        setErroMsg(null);

        // Busca o pedido com todas as relações estruturadas
        const { data: pedData, error: pedErr } = await supabase
          .from('pedidos')
          .select(`
            *,
            cliente:clientes(*),
            vendedor:usuarios(*),
            itens:itens_pedido(*),
            pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*)),
            pedido_entrega:pedido_entregas(*)
          `)
          .eq('id', id)
          .single();

        if (pedErr || !pedData) {
          throw new Error('Pedido não encontrado no sistema.');
        }

        setPedido(pedData as unknown as Pedido);

        // Busca os dados da loja
        if (pedData.loja_id) {
          const { data: lojaData } = await supabase
            .from('lojas')
            .select('*')
            .eq('id', pedData.loja_id)
            .single();

          if (lojaData) setLoja(lojaData as Loja);
        }
      } catch (err: unknown) {
        console.error('Erro ao carregar recibo público:', err);
        setErroMsg((err as Error).message || 'Não foi possível carregar os dados do comprovante.');
      } finally {
        setCarregando(false);
      }
    };

    buscarPedido();
  }, [id]);

  const handleBaixarPdf = async () => {
    if (!reciboRef.current || !pedido || !loja) return;
    try {
      setBaixandoPdf(true);
      await ReceiptPdfService.baixarPdfRecibo(reciboRef.current, pedido, loja);
    } catch (err) {
      console.error('Erro ao gerar PDF do recibo:', err);
    } finally {
      setBaixandoPdf(false);
    }
  };

  const handleCompartilharWhatsApp = async () => {
    if (!reciboRef.current || !pedido || !loja) return;
    try {
      setCompartilhando(true);
      await ReceiptPdfService.compartilharReciboWhatsApp(reciboRef.current, pedido, loja);
    } catch (err) {
      console.error('Erro ao compartilhar via WhatsApp:', err);
    } finally {
      setCompartilhando(false);
    }
  };

  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/30">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
        <p className="text-sm font-semibold text-slate-300">Carregando recibo oficial...</p>
      </div>
    );
  }

  if (erroMsg || !pedido) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white text-center">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/20 text-rose-400 flex items-center justify-center mb-4 border border-rose-500/30">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-black text-slate-100 mb-1">Recibo não encontrado</h2>
        <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
          {erroMsg || 'Verifique o endereço informado ou solicite uma nova via ao estabelecimento.'}
        </p>
        <Link
          to="/"
          className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
        >
          Voltar à Página Inicial
        </Link>
      </div>
    );
  }

  const {
    ehRetirada,
    formaEntregaTexto,
    labelEndereco,
    enderecoExibicao
  } = obterInfoEntregaRecibo(pedido, loja);

  const badgeEstilo = ehRetirada ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800';

  const valorSubtotal = Number(
    (pedido as unknown as { subtotal_produtos?: number }).subtotal_produtos ||
    pedido.subtotal ||
    pedido.valor_total ||
    0
  );
  const valorDesconto = Number(pedido.valor_desconto || 0);
  const valorFrete = Number(pedido.valor_frete || 0);
  const valorTotal = Number(pedido.valor_total || 0);
  const pagInfo = obterDadosPagamentoRecibo(pedido);
  const itens = (pedido.itens || (pedido as unknown as { itens_pedido?: ItemPedido[] }).itens_pedido || []) as ItemPedido[];
  const totalQtdItens = itens.reduce((acc, i) => acc + Number(i.quantidade || 1), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-3 sm:p-6 select-none print:p-0 print:bg-white">
      {/* Barra Superior de Ações */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-black tracking-tight text-white block">Comprovante Oficial</span>
            <span className="text-[10px] text-slate-400">Pedido #{pedido.numero_pedido}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.print()}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition cursor-pointer border border-slate-700"
            title="Imprimir"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>

          <button
            type="button"
            disabled={baixandoPdf}
            onClick={handleBaixarPdf}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-semibold flex items-center gap-1 transition cursor-pointer border border-slate-700 disabled:opacity-50"
            title="Baixar PDF"
          >
            {baixandoPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">PDF</span>
          </button>

          <button
            type="button"
            disabled={compartilhando}
            onClick={handleCompartilharWhatsApp}
            className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md disabled:opacity-50"
            title="Compartilhar no WhatsApp"
          >
            {compartilhando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            <span>WhatsApp</span>
          </button>
        </div>
      </div>

      {/* Recibo Impresso / Renderizado Fiel */}
      <div className="w-full max-w-md print:max-w-full">
        <div
          ref={reciboRef}
          className="bg-white text-slate-900 p-6 sm:p-7 rounded-3xl border border-slate-200 text-xs space-y-3 shadow-2xl font-mono print:shadow-none print:border-0 print:rounded-none"
        >
          {/* Logo da Loja */}
          {loja?.url_logo && (
            <div className="text-center pb-1">
              <img
                src={loja.url_logo}
                alt={loja.nome_fantasia}
                crossOrigin="anonymous"
                className="max-h-12 max-w-[160px] mx-auto object-contain"
              />
            </div>
          )}

          {/* Cabeçalho do Recibo */}
          <div className="text-center border-b border-slate-200 border-dashed pb-2">
            <h4 className="font-black text-slate-900 text-base tracking-wide uppercase">
              RECIBO #{pedido.numero_pedido}
            </h4>
            <p className="font-bold text-slate-800 uppercase text-[11px]">
              {loja?.nome_fantasia || 'HUBI PDV'}
            </p>
            <p className="text-slate-500 text-[10px]">
              {[loja?.endereco_logradouro, loja?.endereco_numero, loja?.endereco_bairro, loja?.endereco_cidade].filter(Boolean).join(', ')}
              {loja?.whatsapp ? ` • +55 ${loja.whatsapp}` : (loja?.telefone ? ` • +55 ${loja.telefone}` : '')}
            </p>
          </div>

          {/* Vendedor / Origem */}
          <div className="space-y-0.5 text-xs text-slate-700 border-b border-slate-200 border-dashed pb-2">
            <span className="text-slate-500 font-semibold">
              {pedido.origem === 'catalogo_online' ? 'Canal / Vendedor:' : 'Vendedor:'}
            </span>
            <p className="font-bold text-slate-900">
              {pedido.origem === 'catalogo_online'
                ? 'Catálogo Online (Pedido Online)'
                : pedido.vendedor?.nome_completo || (pedido as unknown as { nome_vendedor?: string }).nome_vendedor || 'Caixa / Balcão'}
            </p>
          </div>

          {/* Cliente */}
          <div className="space-y-0.5 text-xs text-slate-700 border-b border-slate-200 border-dashed pb-2">
            <p className="font-bold text-slate-900">Cliente: {pedido.cliente?.nome || 'Cliente Avulso'}</p>
            {(pedido.cliente?.whatsapp || pedido.cliente?.telefone) && (
              <p className="text-slate-500 text-[10px]">
                Tel: +55 {pedido.cliente.whatsapp || pedido.cliente.telefone}
              </p>
            )}
          </div>

          {/* Forma de Entrega & Endereço */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 border-dashed text-[11px] space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-700 uppercase">Forma de Entrega:</span>
              <span className={`font-black px-1.5 py-0.5 rounded text-[10px] ${badgeEstilo}`}>
                {formaEntregaTexto}
              </span>
            </div>
            <div className="text-slate-600 pt-0.5">
              <strong className="text-slate-800">{labelEndereco} </strong>
              <span>{enderecoExibicao}</span>
            </div>
          </div>

          {/* Resumo de itens */}
          <div className="font-bold text-slate-600 text-[10px] uppercase tracking-wider">
            {itens.length} itens (Qtd.: {totalQtdItens})
          </div>

          {/* Tabela de Itens */}
          <div className="space-y-1.5 border-b border-slate-200 border-dashed pb-2">
            {itens.map((item, idx) => (
              <div key={idx} className="flex justify-between items-start text-xs text-slate-800">
                <span>
                  <strong className="text-slate-950">{Number(item.quantidade)}x</strong> {item.nome_produto} {item.rotulo_variacao ? ` / ${item.rotulo_variacao}` : ''}
                </span>
                <span className="font-bold text-slate-900 whitespace-nowrap pl-3">
                  R$ {Number(item.subtotal || item.preco_venda_unitario || 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          {/* Fechamento Financeiro */}
          <div className="space-y-1.5 text-xs text-slate-700">
            <div className="flex justify-between text-slate-800">
              <span>Subtotal dos Produtos:</span>
              <span className="font-semibold text-slate-900">R$ {valorSubtotal.toFixed(2)}</span>
            </div>

            {valorDesconto > 0 && (
              <div className="flex justify-between text-red-600 font-bold">
                <span>Desconto Aplicado:</span>
                <span>- R$ {valorDesconto.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-800">
              <span>Frete{formaEntregaTexto && !ehRetirada ? ` (${formaEntregaTexto})` : ''}:</span>
              <span className="font-semibold text-slate-900">
                {valorFrete > 0 ? `+ R$ ${valorFrete.toFixed(2)}` : 'Grátis (Retirada)'}
              </span>
            </div>

            <div className="border-t border-dashed border-slate-300 pt-2 my-1" />

            <div className="flex justify-between items-center text-sm font-black text-slate-950 pt-0.5">
              <span>VALOR TOTAL:</span>
              <span className="text-base font-black">R$ {valorTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Status do Pagamento */}
          {pagInfo.ehFiado && Number(pedido.saldo_devedor) > 0 && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-center space-y-0.5">
              <span className="text-[10px] font-bold text-red-800 uppercase tracking-wider block">Saldo a Pagar (Fiado)</span>
              <span className="text-sm font-black text-red-600">R$ {Number(pedido.saldo_devedor).toFixed(2)}</span>
              {obterInfoVencimentoFiado(pedido).temVencimento && (
                <span className="text-[11px] font-bold text-red-700 block pt-0.5">
                  Data de Vencimento: {obterInfoVencimentoFiado(pedido).formatada}
                </span>
              )}
            </div>
          )}

          <div className={`mt-2.5 p-2.5 rounded-lg border text-xs ${pagInfo.foiPago ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex justify-between items-center pb-1.5 border-b border-dashed border-slate-200">
              <span className="font-bold text-[10px] text-slate-700 uppercase">Status Pagamento:</span>
              <span className={`font-black text-[10px] px-1.5 py-0.5 rounded ${pagInfo.foiPago ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {pagInfo.foiPago ? '✓ PAGO' : 'AGUARDANDO PAGAMENTO'}
              </span>
            </div>
            {pagInfo.foiPago && pagInfo.pagamentosDetalhados.length > 0 && (
              <div className="space-y-1.5 pt-1.5 text-slate-800">
                {pagInfo.pagamentosDetalhados.map((pag, idx) => (
                  <div key={idx} className="flex justify-between items-start text-[11px]">
                    <div>
                      <span className="font-semibold">{pag.forma}</span>
                      {pag.origemGateway && (
                        <span className="text-[10px] text-sky-700 block font-medium">Origem: {pag.origemGateway}</span>
                      )}
                    </div>
                    <span className="font-bold text-slate-900">R$ {pag.valor.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-extrabold text-emerald-900 pt-1.5 border-t border-emerald-200 text-xs">
                  <span>Valor Pago:</span>
                  <span>R$ {pagInfo.totalPago.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-700 my-2" />

          {/* Data por Extenso */}
          <div className="text-center text-[11px] text-slate-500">
            {formatarDataRecibo(pedido.data_venda || pedido.criado_em)}
          </div>

          <div className="text-center text-[9px] text-slate-400 pt-1 border-t border-slate-100">
            Comprovante Oficial • HUBI PDV
          </div>
        </div>
      </div>
    </div>
  );
};
