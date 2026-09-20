import React, { useState } from 'react';
import { Store, Truck } from 'lucide-react';
import { Cliente, StatusPedido } from '../../types';
import { CartItem } from '../../contexts/CartContext';

export interface CarrinhoVendaProps {
  itens: CartItem[];
  cliente?: Cliente | null;
  onFinalizarVenda: (dadosPedido: {
    cliente_id: string | null;
    itens: CartItem[];
    subtotal: number;
    valor_frete: number;
    valor_total: number;
    status: StatusPedido;
  }) => Promise<void>;
}

export const CarrinhoVenda: React.FC<CarrinhoVendaProps> = ({
  itens,
  cliente,
  onFinalizarVenda
}) => {
  const [tipoEntrega, setTipoEntrega] = useState<'retirada' | 'envio'>('retirada');
  const [salvando, setSalvando] = useState<boolean>(false);

  const subtotal = itens.reduce((acc, item) => acc + (item.precoUnitario || 0) * item.quantidade, 0);

  const handleSalvarOuFinalizar = async () => {
    if (itens.length === 0 || salvando) return;
    try {
      setSalvando(true);
      const statusFinal: StatusPedido = tipoEntrega === 'envio' ? 'envio_pendente' : 'concluido';
      await onFinalizarVenda({
        cliente_id: cliente?.id || null,
        itens,
        subtotal,
        valor_frete: 0,
        valor_total: subtotal,
        status: statusFinal
      });
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

      <button
        type="button"
        disabled={itens.length === 0 || salvando}
        onClick={handleSalvarOuFinalizar}
        className="w-full py-2.5 px-4 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 cursor-pointer"
      >
        {salvando ? 'Processando...' : 'Finalizar Venda'}
      </button>
    </div>
  );
};
