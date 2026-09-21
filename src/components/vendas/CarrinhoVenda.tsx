// HUBI - Rodapé de Ações do Carrinho de Venda (PDV Desktop)
import React, { useState, useMemo, useEffect } from 'react';
import { Store, Truck, FileText, ArrowRight } from 'lucide-react';
import { Cliente, Pedido, StatusPedido } from '../../types';
import { CartItem } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { ModalDefinirEnvio } from '../pedidos/ModalDefinirEnvio';
import { ShippingSelectionResult } from '../../types/shipping';

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
  clienteSelecionado?: Cliente | null;
  loja?: any;
  usuario?: any;
  onFinalizarVenda: (dadosPedido: DadosSalvarPedido) => Promise<void>;
  onSalvarPedido?: (dadosPedido: DadosSalvarPedido) => Promise<void>;
  onLimparCarrinho?: () => void;
}

export const CarrinhoVenda: React.FC<CarrinhoVendaProps> = ({
  itens,
  cliente,
  clienteSelecionado,
  loja: lojaProp,
  usuario: usuarioProp,
  onFinalizarVenda,
  onSalvarPedido,
  onLimparCarrinho
}) => {
  const { loja: lojaAuth, usuario: usuarioAuth } = useAuth();
  const loja = lojaProp || lojaAuth;
  const usuario = usuarioProp || usuarioAuth;
  const clienteAtivo = clienteSelecionado !== undefined ? clienteSelecionado : (cliente || null);

  const [tipoEntrega, setTipoEntrega] = useState<'retirada' | 'envio'>('retirada');
  const [salvando, setSalvando] = useState<boolean>(false);
  const [modalEnvioAberto, setModalEnvioAberto] = useState<boolean>(false);
  const [freteConfirmado, setFreteConfirmado] = useState<boolean>(false);
  const [valorFrete, setValorFrete] = useState<number>(0);
  const [selecaoEnvio, setSelecaoEnvio] = useState<ShippingSelectionResult | null>(null);

  const subtotal = itens.reduce((acc, item) => acc + (item.precoUnitario || 0) * item.quantidade, 0);
  const ehEnvio = tipoEntrega === 'envio';
  const temCliente = Boolean(clienteAtivo && clienteAtivo.id);

  // Resetar frete ao esvaziar carrinho ou alterar cliente
  useEffect(() => {
    if (itens.length === 0) {
      setFreteConfirmado(false);
      setValorFrete(0);
      setSelecaoEnvio(null);
    }
  }, [itens.length]);

  useEffect(() => {
    setFreteConfirmado(false);
    setValorFrete(0);
    setSelecaoEnvio(null);
  }, [clienteAtivo?.id]);

  const valorFreteEfetivo = ehEnvio && freteConfirmado ? valorFrete : 0;
  const valorTotal = subtotal + valorFreteEfetivo;

  const pedidoParaEnvio: Pedido = useMemo(() => {
    return {
      id: 'carrinho_temp',
      numero_pedido: 'PDV',
      loja_id: loja?.id || '',
      cliente_id: clienteAtivo?.id || null,
      cliente: clienteAtivo || undefined,
      subtotal,
      valor_total: valorTotal,
      valor_frete: valorFrete,
      status: 'pendente',
      status_pagamento: 'aguardando_pagamento',
      itens: itens.map((item, idx) => ({
        id: `item_${idx}`,
        pedido_id: 'carrinho_temp',
        produto_id: item.produto.id,
        produto: item.produto,
        quantidade: item.quantidade,
        preco_unitario: item.precoUnitario || 0,
        preco_venda_unitario: item.precoUnitario || 0,
        valor_total: (item.precoUnitario || 0) * item.quantidade,
        nome_produto: item.produto.nome
      })) as any
    } as unknown as Pedido;
  }, [itens, clienteAtivo, loja?.id, subtotal, valorTotal, valorFrete]);

  const handleSalvarPedido = async () => {
    if (itens.length === 0 || salvando) return;
    try {
      setSalvando(true);
      const payload: DadosSalvarPedido = {
        cliente_id: clienteAtivo?.id || null,
        itens,
        subtotal,
        valor_frete: valorFreteEfetivo,
        valor_total: valorTotal,
        status: ehEnvio ? 'envio_pendente' : 'pendente',
        status_pagamento: 'aguardando_pagamento'
      };

      if (onSalvarPedido) {
        await onSalvarPedido(payload);
      } else {
        await onFinalizarVenda(payload);
      }

      onLimparCarrinho?.();
      setFreteConfirmado(false);
      setValorFrete(0);
      setSelecaoEnvio(null);
    } finally {
      setSalvando(false);
    }
  };

  const handleFinalizarVenda = async () => {
    if (itens.length === 0 || salvando) return;
    if (ehEnvio && !freteConfirmado) return;

    try {
      setSalvando(true);
      await onFinalizarVenda({
        cliente_id: clienteAtivo?.id || null,
        itens,
        subtotal,
        valor_frete: valorFreteEfetivo,
        valor_total: valorTotal,
        status: ehEnvio ? 'envio_pendente' : 'concluido',
        status_pagamento: 'pago'
      });
      onLimparCarrinho?.();
      setFreteConfirmado(false);
      setValorFrete(0);
      setSelecaoEnvio(null);
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

      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Subtotal:</span>
          <span className="font-semibold text-slate-200">
            R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {ehEnvio && freteConfirmado && (
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Frete ({selecaoEnvio?.pedido_entrega?.transportadora_nome || selecaoEnvio?.opcao_frete?.transportadora_nome || 'Envio'}):</span>
            <span className="font-semibold text-emerald-400">
              {valorFrete > 0
                ? `R$ ${valorFrete.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : 'Grátis'}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-sm font-bold text-white">
          <span>Total:</span>
          <span className="text-base font-black text-emerald-400">
            R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="flex flex-row items-center gap-2 pt-1">
        {/* Botão Salvar */}
        <button
          type="button"
          disabled={itens.length === 0 || salvando}
          onClick={handleSalvarPedido}
          className="flex-1 py-2 px-2.5 min-h-[44px] rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 shadow flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-center"
          title="Salvar pedido como orçamento/pendente"
        >
          <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Salvar</span>
        </button>

        {/* Botão Opções de Envio (visível exclusivamente quando tipoEntrega === 'envio') */}
        {ehEnvio && (
          <button
            type="button"
            disabled={!temCliente || salvando || itens.length === 0}
            onClick={() => setModalEnvioAberto(true)}
            className={`flex-1 py-2 px-2 min-h-[44px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition text-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              freteConfirmado
                ? 'bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 shadow'
            }`}
            title={
              !temCliente
                ? 'Selecione um cliente para cotar o frete'
                : freteConfirmado
                ? 'Frete definido! Clique para alterar opções'
                : 'Definir opções de envio'
            }
          >
            <Truck className={`w-3.5 h-3.5 shrink-0 ${freteConfirmado ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="leading-tight">
              Opções<br />de Envio
            </span>
          </button>
        )}

        {/* Botão Finalizar Venda */}
        <button
          type="button"
          disabled={
            itens.length === 0 ||
            salvando ||
            (ehEnvio && !freteConfirmado)
          }
          onClick={handleFinalizarVenda}
          className={`flex-1 py-2 px-2 min-h-[44px] rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition text-center ${
            ehEnvio && !freteConfirmado
              ? 'bg-slate-800 border border-slate-700 text-slate-500 opacity-50 cursor-not-allowed'
              : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
          title={
            ehEnvio && !freteConfirmado
              ? 'Defina as opções de frete antes de finalizar a venda'
              : 'Abrir tela de pagamento e concluir venda'
          }
        >
          <span className="leading-tight">
            Finalizar<br />Venda
          </span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
        </button>
      </div>

      {/* Modal de Definição de Envio */}
      {modalEnvioAberto && (
        <ModalDefinirEnvio
          isOpen={modalEnvioAberto}
          pedido={pedidoParaEnvio}
          loja={loja}
          usuario={usuario}
          onClose={() => setModalEnvioAberto(false)}
          onSucesso={() => {}}
          onConfirmarEnvio={(resultado: ShippingSelectionResult) => {
            setFreteConfirmado(true);
            setValorFrete(Number(resultado.valor_frete || 0));
            setSelecaoEnvio(resultado);
            setModalEnvioAberto(false);
          }}
        />
      )}
    </div>
  );
};
