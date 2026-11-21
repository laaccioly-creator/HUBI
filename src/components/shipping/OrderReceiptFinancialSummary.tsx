import React from 'react';
import { Store, Truck, MapPin, Barcode } from 'lucide-react';
import { PedidoEntrega } from '../../types/shipping';
import { formatarMoeda } from '../../utils/formatters';

interface OrderReceiptFinancialSummaryProps {
  subtotalProdutos: number;
  valorDesconto?: number;
  valorFrete: number;
  valorTotal: number;
  pedidoEntrega?: PedidoEntrega | null;
  enderecoLojaOrigem?: string | null;
  statusPagamento?: string;
  isSomenteServico?: boolean;
  modalidadeServico?: 'loja' | 'externo';
  enderecoPrestacaoServico?: string | null;
  taxaVisitaDomicilio?: number;
  className?: string;
}

export const OrderReceiptFinancialSummary: React.FC<OrderReceiptFinancialSummaryProps> = ({
  subtotalProdutos,
  valorDesconto = 0,
  valorFrete,
  valorTotal,
  pedidoEntrega,
  enderecoLojaOrigem,
  statusPagamento,
  isSomenteServico = false,
  modalidadeServico = 'loja',
  enderecoPrestacaoServico,
  taxaVisitaDomicilio,
  className = ''
}) => {
  const ehRetirada = isSomenteServico
    ? modalidadeServico === 'loja'
    : (pedidoEntrega?.tipo_atendimento === 'retirada' || valorFrete === 0);
  const transportadora = pedidoEntrega?.transportadora_nome || (ehRetirada ? 'Retirada na Loja' : 'Entrega');
  const taxaVisitaEfetiva = typeof taxaVisitaDomicilio === 'number' ? taxaVisitaDomicilio : valorFrete;

  return (
    <div
      data-recibo-root="true"
      data-theme="light"
      style={{ colorScheme: 'light' }}
      className={`space-y-4 rounded-xl border border-slate-200 p-4 bg-slate-50 ${className}`}
    >
      {/* Bloco de Modalidade e Endereço */}
      <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {ehRetirada ? (
              <Store className="w-4 h-4 text-purple-700" />
            ) : (
              <Truck className="w-4 h-4 text-emerald-700" />
            )}
            <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
              {isSomenteServico
                ? `LOCAL DO SERVIÇO: ${modalidadeServico === 'externo' ? 'EM DOMICÍLIO' : 'NA LOJA'}`
                : ehRetirada
                ? 'RETIRADA NA LOJA'
                : `ENTREGA VIA ${transportadora.toUpperCase()}`}
            </span>
          </div>

          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
            isSomenteServico
              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
              : ehRetirada 
              ? 'bg-purple-100 text-purple-900 border-purple-300'
              : 'bg-emerald-100 text-emerald-900 border-emerald-300'
          }`}>
            {isSomenteServico
              ? (modalidadeServico === 'externo'
                  ? (taxaVisitaEfetiva > 0 ? `Visita R$ ${taxaVisitaEfetiva.toFixed(2).replace('.', ',')}` : 'Em Domicílio')
                  : 'Na Loja')
              : (ehRetirada ? 'Grátis (Retirada)' : `R$ ${valorFrete.toFixed(2).replace('.', ',')}`)}
          </span>
        </div>

        {/* Endereço */}
        <div className="flex items-start gap-2 pt-1 text-xs text-slate-700 border-t border-slate-200">
          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-slate-700 block">
              {isSomenteServico
                ? 'Local da Prestação:'
                : (ehRetirada ? 'Local de Retirada (Loja):' : 'Endereço de Entrega (Cliente):')}
            </span>
            <p className="text-[11px] leading-relaxed">
              {isSomenteServico ? (
                modalidadeServico === 'externo'
                  ? (enderecoPrestacaoServico || pedidoEntrega?.destino_logradouro || 'Endereço do cliente')
                  : (enderecoPrestacaoServico || enderecoLojaOrigem || 'Balcão da Loja Física')
              ) : ehRetirada ? (
                enderecoLojaOrigem || 'Balcão da Loja Física'
              ) : pedidoEntrega?.destino_logradouro ? (
                `${pedidoEntrega.destino_logradouro}, ${pedidoEntrega.destino_numero || 'S/N'}${
                  pedidoEntrega.destino_complemento ? ` - ${pedidoEntrega.destino_complemento}` : ''
                }, ${pedidoEntrega.destino_bairro}, ${pedidoEntrega.destino_cidade}-${pedidoEntrega.destino_uf} (CEP ${pedidoEntrega.destino_cep})`
              ) : (
                'Endereço a ser confirmado com o cliente'
              )}
            </p>
          </div>
        </div>

        {/* Código de Rastreio (se houver) */}
        {pedidoEntrega?.codigo_rastreio && (
          <div className="flex items-center gap-1.5 pt-1 text-xs text-slate-700 border-t border-slate-200">
            <Barcode className="w-3.5 h-3.5 text-slate-500" />
            <span>Código de Rastreio: </span>
            <strong className="font-mono text-emerald-800">
              {pedidoEntrega.codigo_rastreio}
            </strong>
          </div>
        )}
      </div>

      {/* Tabela de Fechamento Financeiro */}
      <div className="space-y-1.5 text-xs text-slate-700">
        <div className="flex justify-between">
          <span>{isSomenteServico ? 'Subtotal dos Serviços:' : 'Subtotal dos Produtos:'}</span>
          <span className="font-semibold text-slate-900">
            {formatarMoeda(subtotalProdutos)}
          </span>
        </div>

        {valorDesconto > 0 && (
          <div className="flex justify-between text-rose-700 font-semibold">
            <span>Desconto Aplicado:</span>
            <span>
              - {formatarMoeda(valorDesconto)}
            </span>
          </div>
        )}

        {isSomenteServico ? (
          modalidadeServico === 'externo' && taxaVisitaEfetiva > 0 ? (
            <div className="flex justify-between">
              <span>Taxa de Visita (Domicílio):</span>
              <span className="font-semibold text-slate-900">
                + {formatarMoeda(taxaVisitaEfetiva)}
              </span>
            </div>
          ) : null
        ) : (
          <div className="flex justify-between">
            <span>Frete / Envio:</span>
            <span className="font-semibold text-slate-900">
              {valorFrete > 0 
                ? `+ ${formatarMoeda(valorFrete)}`
                : 'Grátis (Retirada)'}
            </span>
          </div>
        )}

        <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
          <span>Total Geral:</span>
          <span className="text-emerald-800 font-extrabold text-base">
            {formatarMoeda(valorTotal)}
          </span>
        </div>
      </div>

      {statusPagamento === 'aguardando_pesagem' && (
        <div className="p-3 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 text-xs leading-relaxed space-y-1">
          <span className="font-extrabold block">⚠️ AVISO: Valor Estimado Sujeito a Pesagem</span>
          <p>
            Valor estimado sujeito a pequena variação após a pesagem real dos produtos na loja. Aguarde a confirmação e a mensagem da loja para efetuar o pagamento.
          </p>
        </div>
      )}
    </div>
  );
};
