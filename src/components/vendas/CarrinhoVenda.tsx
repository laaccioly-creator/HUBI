import React, { useState } from 'react';
import { Store, Truck, FileText, ArrowRight, AlertCircle } from 'lucide-react';
import { Cliente, StatusPedido } from '../../types';
import { CartItem } from '../../contexts/CartContext';

export interface DadosSalvarPedido {
  cliente_id: string | null;
  itens: CartItem[];
  subtotal: number;
  valor_frete: number;
  valor_total: number;
  status: StatusPedido;
  status_pagamento: 'pago' | 'aguardando_pagamento';
}

export interface CarrinhoVendaProps {
  itens: CartItem[];
  cliente?: Cliente | null;
  onFinalizarVenda: (dadosPedido: DadosSalvarPedido) => Promise<void>;
  onSalvarPedido?: (dadosPedido: DadosSalvarPedido) => Promise<void>;
  onLimparCarrinho?: () => void;
}

export const CarrinhoVenda: React.FC<CarrinhoVendaProps> = ({
  itens,
  cliente,
  onFinalizarVenda,
  onSalvarPedido,
  onLimparCarrinho
}) => {
  const [tipoEntrega, setTipoEntrega] = useState<'retirada' | 'envio'>('retirada');
  const [salvando, setSalvando] = useState<boolean>(false);

  const subtotal = itens.reduce((acc, item) => acc + (item.precoUnitario || 0) * item.quantidade, 0);

  const ehEnvio = tipoEntrega === 'envio';

  const handleSalvarPedido = async () => {
    if (itens.length === 0 || salvando) return;
    try {
      setSalvando(true);
      const payload: DadosSalvarPedido = {
        cliente_id: cliente?.id || null,
        itens,
        subtotal,
        valor_frete: 0,
        valor_total: subtotal,
        status: ehEnvio ? 'envio_pendente' : 'pendente',
        status_pagamento: 'aguardando_pagamento'
      };

      if (onSalvarPedido) {
        await onSalvarPedido(payload);
      } else {
        await onFinalizarVenda(payload);
      }

      onLimparCarrinho?.();
    } finally {
      setSalvando(false);
    }
  };

  const handleFinalizarVenda = async () => {
    if (itens.length === 0 || salvando || ehEnvio) return;
    try {
      setSalvando(true);
      await onFinalizarVenda({
        cliente_id: cliente?.id || null,
        itens,
        subtotal,
        valor_frete: 0,
        valor_total: subtotal,
        status: 'concluido',
        status_pagamento: 'pago'
      });
      onLimparCarrinho?.();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-900 border border-slate-800 rounded-xl">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <span className="text-xs font-semibold text-slate-400">Forma de Entrega:</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTipoEntrega('retirada')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
              tipoEntrega === 'retirada'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Store className="w-3 h-3" />
            Retirada
          </button>
          <button
            type="button"
            onClick={() => setTipoEntrega('envio')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
              tipoEntrega === 'envio'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Truck className="w-3 h-3" />
            Envio
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <span className="text-sm font-bold text-white">Subtotal:</span>
        <span className="text-sm font-bold text-emerald-400">
          R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {ehEnvio && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Para pedidos com entrega/envio, salve o pedido para cotar/informar o frete na tela de Pedidos antes de receber o pagamento.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          disabled={itens.length === 0 || salvando}
          onClick={handleSalvarPedido}
          className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 ${
            ehEnvio
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25 col-span-2 py-3'
              : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 shadow'
          }`}
          title={ehEnvio ? 'Salvar pedido para cotar frete na esteira de Pedidos' : 'Salva o pedido como pendente/orçamento'}
        >
          <FileText className="w-3.5 h-3.5 text-emerald-400" />
          <span>Salvar Pedido</span>
        </button>

        {!ehEnvio && (
          <button
            type="button"
            disabled={itens.length === 0 || salvando}
            onClick={handleFinalizarVenda}
            className="py-2.5 px-3 rounded-xl font-black text-xs bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1.5 transition disabled:opacity-40 cursor-pointer"
            title="Abrir tela de pagamento e concluir venda"
          >
            <span>Finalizar Venda</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}

        {ehEnvio && (
          <button
            type="button"
            disabled={true}
            className="hidden"
            title="Para pedidos com entrega/envio, salve o pedido para cotar/informar o frete na tela de Pedidos antes de receber o pagamento."
          >
            Finalizar Venda
          </button>
        )}
      </div>
    </div>
  );
};
