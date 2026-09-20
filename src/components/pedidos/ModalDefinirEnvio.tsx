import React, { useState } from 'react';
import { Truck, X, Check, Loader2 } from 'lucide-react';
import { Pedido } from '../../types';
import { ShippingSelectionResult } from '../../types/shipping';
import { ShippingFulfillmentSelector } from '../shipping/ShippingFulfillmentSelector';
import { ShippingOrchestrator } from '../../services/shippingOrchestrator';

export interface ModalDefinirEnvioProps {
  isOpen: boolean;
  pedido: Pedido | null;
  loja: any;
  usuario?: any;
  onClose: () => void;
  onSucesso: () => void;
  onFeedbackSucesso?: (msg: string) => void;
  onFeedbackErro?: (msg: string) => void;
}

export const ModalDefinirEnvio: React.FC<ModalDefinirEnvioProps> = ({
  isOpen,
  pedido,
  loja,
  usuario,
  onClose,
  onSucesso,
  onFeedbackSucesso,
  onFeedbackErro
}) => {
  const [selecaoPendente, setSelecaoPendente] = useState<ShippingSelectionResult | null>(null);
  const [salvando, setSalvando] = useState<boolean>(false);

  if (!isOpen || !pedido || !loja) return null;

  const handleConfirmar = async () => {
    if (!selecaoPendente || salvando) return;

    try {
      setSalvando(true);
      await ShippingOrchestrator.definirEnvioPedido(
        pedido.id,
        selecaoPendente,
        usuario?.id || null
      );

      const nomeForma = selecaoPendente.pedido_entrega?.transportadora_nome ||
        selecaoPendente.pedido_entrega?.forma_entrega_nome ||
        (selecaoPendente.opcao_frete?.transportadora_nome) ||
        (selecaoPendente.tipo_atendimento === 'retirada' ? 'Retirada na Loja' : 'Envio');

      onFeedbackSucesso?.(`Forma de envio definida com sucesso: ${nomeForma}!`);
      setSelecaoPendente(null);
      onSucesso();
      onClose();
    } catch (err: any) {
      console.error('Erro ao definir envio do pedido:', err);
      onFeedbackErro?.(err.message || 'Erro ao definir forma de envio.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[9999] animate-in fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
        {/* Header do Modal */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800">
                Definir Envio • Pedido #{pedido.numero_pedido}
              </h3>
              <p className="text-xs text-slate-500">
                Selecione o meio de entrega para expedição do pedido
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={salvando}
            onClick={() => {
              setSelecaoPendente(null);
              onClose();
            }}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com o Seletor de Fulfillment */}
        <div className="flex-1 overflow-y-auto pr-1">
          <ShippingFulfillmentSelector
            lojaId={loja.id}
            loja={loja}
            clienteId={pedido.cliente_id || pedido.cliente?.id || null}
            cliente={pedido.cliente || null}
            subtotal={Number(pedido.subtotal || pedido.valor_total || 0)}
            itens={(pedido.itens || []).map((i: any) => ({
              nome: i.nome_produto || i.produto?.nome || 'Item',
              quantidade: Number(i.quantidade || 1),
              preco_unitario: Number(i.preco_venda_unitario || i.preco_unitario || 0),
              peso_kg: (i.produto as any)?.peso_kg || 0.3,
              largura_cm: (i.produto as any)?.largura_cm || 15,
              altura_cm: (i.produto as any)?.altura_cm || 10,
              comprimento_cm: (i.produto as any)?.comprimento_cm || 20
            }))}
            valorFreteAtual={Number(pedido.valor_frete || 0)}
            tipoAtendimentoAtual="entrega"
            enderecoEntregaAtual={pedido.endereco_entrega ? {
              cep: (pedido as any).pedido_entrega?.destino_cep || '',
              logradouro: pedido.endereco_entrega,
              numero: '',
              bairro: '',
              cidade: '',
              uf: 'CE'
            } : null}
            onChange={(resultado: ShippingSelectionResult) => {
              // Apenas armazena a seleção no estado local do modal; JAMAIS fecha ou salva automaticamente!
              setSelecaoPendente(resultado);
            }}
          />
        </div>

        {/* Rodapé com Ação Explícita de Confirmação */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            {selecaoPendente ? (
              <span>
                Opção selecionada:{' '}
                <strong className="text-emerald-600 font-bold">
                  {selecaoPendente.pedido_entrega?.transportadora_nome ||
                    selecaoPendente.pedido_entrega?.forma_entrega_nome ||
                    selecaoPendente.opcao_frete?.transportadora_nome ||
                    'Frete Definido'}
                </strong>
                {selecaoPendente.valor_frete > 0 && (
                  <span className="ml-1 text-slate-700 font-semibold">
                    (R$ {selecaoPendente.valor_frete.toFixed(2)})
                  </span>
                )}
              </span>
            ) : (
              <span className="text-amber-600 italic">
                Clique em uma modalidade acima para habilitar a confirmação.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={salvando}
              onClick={() => {
                setSelecaoPendente(null);
                onClose();
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={!selecaoPendente || salvando}
              onClick={handleConfirmar}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {salvando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gravando Envio...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Confirmar Forma de Envio</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
