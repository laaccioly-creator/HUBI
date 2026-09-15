import React from 'react';
import { Store, Truck, MapPin, Barcode } from 'lucide-react';
import { PedidoEntrega } from '../../types/shipping';

interface OrderReceiptFinancialSummaryProps {
  subtotalProdutos: number;
  valorDesconto?: number;
  valorFrete: number;
  valorTotal: number;
  pedidoEntrega?: PedidoEntrega | null;
  enderecoLojaOrigem?: string | null;
  className?: string;
}

export const OrderReceiptFinancialSummary: React.FC<OrderReceiptFinancialSummaryProps> = ({
  subtotalProdutos,
  valorDesconto = 0,
  valorFrete,
  valorTotal,
  pedidoEntrega,
  enderecoLojaOrigem,
  className = ''
}) => {
  const ehRetirada = pedidoEntrega?.tipo_atendimento === 'retirada' || valorFrete === 0;
  const transportadora = pedidoEntrega?.transportadora_nome || (ehRetirada ? 'Retirada na Loja' : 'Entrega');

  return (
    <div className={`space-y-4 rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/50 ${className}`}>
      {/* Bloco de Modalidade e Endereço */}
      <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {ehRetirada ? (
              <Store className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            ) : (
              <Truck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            )}
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              {ehRetirada ? 'RETIRADA NA LOJA' : `ENTREGA VIA ${transportadora.toUpperCase()}`}
            </span>
          </div>

          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
            ehRetirada 
              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
          }`}>
            {ehRetirada ? 'Grátis (Retirada)' : `R$ ${valorFrete.toFixed(2).replace('.', ',')}`}
          </span>
        </div>

        {/* Endereço */}
        <div className="flex items-start gap-2 pt-1 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-700/60">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-slate-700 dark:text-slate-300 block">
              {ehRetirada ? 'Local de Retirada (Loja):' : 'Endereço de Entrega (Cliente):'}
            </span>
            <p className="text-[11px] leading-relaxed">
              {ehRetirada ? (
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
          <div className="flex items-center gap-1.5 pt-1 text-xs text-slate-700 dark:text-slate-300 border-t border-slate-100 dark:border-slate-700/60">
            <Barcode className="w-3.5 h-3.5 text-slate-400" />
            <span>Código de Rastreio: </span>
            <strong className="font-mono text-emerald-600 dark:text-emerald-400">
              {pedidoEntrega.codigo_rastreio}
            </strong>
          </div>
        )}
      </div>

      {/* Tabela de Fechamento Financeiro */}
      <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex justify-between">
          <span>Subtotal dos Produtos:</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            R$ {subtotalProdutos.toFixed(2).replace('.', ',')}
          </span>
        </div>

        {valorDesconto > 0 && (
          <div className="flex justify-between text-rose-600 dark:text-rose-400">
            <span>Desconto Aplicado:</span>
            <span className="font-semibold">
              - R$ {valorDesconto.toFixed(2).replace('.', ',')}
            </span>
          </div>
        )}

        <div className="flex justify-between">
          <span>Frete / Envio:</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {valorFrete > 0 
              ? `+ R$ ${valorFrete.toFixed(2).replace('.', ',')}`
              : 'Grátis (Retirada)'}
          </span>
        </div>

        <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white">
          <span>Total Geral:</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-base">
            R$ {valorTotal.toFixed(2).replace('.', ',')}
          </span>
        </div>
      </div>
    </div>
  );
};
