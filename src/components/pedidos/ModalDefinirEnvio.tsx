// HUBI - Modal de Definição e Cotação de Envio do Pedido
import React, { useState, useEffect } from 'react';
import { Truck, X, Check, Loader2 } from 'lucide-react';
import { Pedido, Cliente } from '../../types';
import { ShippingSelectionResult, ClienteEndereco } from '../../types/shipping';
import { ShippingFulfillmentSelector } from '../shipping/ShippingFulfillmentSelector';
import { ModalAtualizarEnderecoCliente } from '../shipping/ModalAtualizarEnderecoCliente';
import { ShippingOrchestrator } from '../../services/shippingOrchestrator';
import { supabase } from '../../lib/supabase';

export interface ModalDefinirEnvioProps {
  isOpen: boolean;
  pedido: Pedido | null;
  loja: any;
  usuario?: any;
  onClose: () => void;
  onSucesso: () => void;
  onFeedbackSucesso?: (msg: string) => void;
  onFeedbackErro?: (msg: string) => void;
  onConfirmarEnvio?: (resultado: ShippingSelectionResult) => void;
}

export const ModalDefinirEnvio: React.FC<ModalDefinirEnvioProps> = ({
  isOpen,
  pedido,
  loja,
  usuario,
  onClose,
  onSucesso,
  onFeedbackSucesso,
  onFeedbackErro,
  onConfirmarEnvio
}) => {
  const [selecaoPendente, setSelecaoPendente] = useState<ShippingSelectionResult | null>(null);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [modalEnderecoAberto, setModalEnderecoAberto] = useState<boolean>(false);
  const [clienteAtivo, setClienteAtivo] = useState<Cliente | null>(null);
  const [versaoFulfillment, setVersaoFulfillment] = useState<number>(0);
  const [enderecoAtualizadoLocal, setEnderecoAtualizadoLocal] = useState<Partial<ClienteEndereco> | null>(null);

  useEffect(() => {
    let ativo = true;
    if (isOpen && pedido) {
      setEnderecoAtualizadoLocal(null);
      if (pedido.cliente) {
        setClienteAtivo(pedido.cliente);
      } else if (pedido.cliente_id) {
        supabase
          .from('clientes')
          .select('id, loja_id, nome, whatsapp, telefone, endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado, endereco_principal')
          .eq('id', pedido.cliente_id)
          .maybeSingle()
          .then(({ data }) => {
            if (ativo && data) {
              setClienteAtivo(data as Cliente);
            }
          });
      } else {
        setClienteAtivo(null);
      }
    }
    return () => {
      ativo = false;
    };
  }, [isOpen, pedido]);

  if (!isOpen || !pedido || !loja) return null;

  const handleConfirmar = async () => {
    if (!selecaoPendente || salvando) return;

    try {
      setSalvando(true);
      if (onConfirmarEnvio) {
        onConfirmarEnvio(selecaoPendente);
        const nomeForma = selecaoPendente.pedido_entrega?.transportadora_nome ||
          selecaoPendente.pedido_entrega?.forma_entrega_nome ||
          (selecaoPendente.opcao_frete?.transportadora_nome) ||
          (selecaoPendente.tipo_atendimento === 'retirada' ? 'Retirada na Loja' : 'Envio');

        onFeedbackSucesso?.(`Forma de envio definida com sucesso: ${nomeForma}!`);
        setSelecaoPendente(null);
        onSucesso();
        onClose();
        return;
      }

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
            key={`fulfillment-${pedido.id}-${versaoFulfillment}`}
            lojaId={loja.id}
            loja={loja}
            clienteId={pedido.cliente_id || pedido.cliente?.id || null}
            cliente={clienteAtivo || pedido.cliente || null}
            permiteRetirada={false}
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
            enderecoEntregaAtual={enderecoAtualizadoLocal || (() => {
              const pe = (pedido as any).pedido_entrega || (Array.isArray((pedido as any).pedido_entregas) ? (pedido as any).pedido_entregas[0] : null);
              if (pe?.destino_logradouro && pe?.destino_numero && pe?.destino_cep) {
                return {
                  id: pe.cliente_endereco_id || undefined,
                  cep: pe.destino_cep,
                  logradouro: pe.destino_logradouro,
                  numero: pe.destino_numero,
                  complemento: pe.destino_complemento || null,
                  bairro: pe.destino_bairro || '',
                  cidade: pe.destino_cidade || '',
                  uf: pe.destino_uf || 'CE'
                };
              }
              return null;
            })()}
            onSolicitarAtualizarEndereco={() => {
              setModalEnderecoAberto(true);
            }}
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

        {/* Modal de Atualização de Endereço do Cliente */}
        {modalEnderecoAberto && (clienteAtivo || (pedido.cliente_id ? ({ id: pedido.cliente_id, loja_id: loja.id, nome: pedido.cliente_nome_avulso || 'Cliente' } as Cliente) : null)) && (
          <ModalAtualizarEnderecoCliente
            aberto={modalEnderecoAberto}
            onFechar={() => setModalEnderecoAberto(false)}
            cliente={(clienteAtivo || ({ id: pedido.cliente_id, loja_id: loja.id, nome: pedido.cliente_nome_avulso || 'Cliente' } as Cliente))}
            enderecoIdAtual={(() => {
              const pe = (pedido as any).pedido_entrega || (Array.isArray((pedido as any).pedido_entregas) ? (pedido as any).pedido_entregas[0] : null);
              return enderecoAtualizadoLocal?.id || pe?.cliente_endereco_id || null;
            })()}
            onSucesso={async (cliAtualizado, enderecoSalvo) => {
              setClienteAtivo(cliAtualizado);
              setModalEnderecoAberto(false);

              const cepLimpoDest = (enderecoSalvo.cep || '').replace(/\D/g, '');
              const idEndValido = enderecoSalvo.id && !enderecoSalvo.id.startsWith('cli-') && !enderecoSalvo.id.startsWith('end-') ? enderecoSalvo.id : null;

              setEnderecoAtualizadoLocal({
                id: idEndValido || undefined,
                cep: cepLimpoDest,
                logradouro: enderecoSalvo.logradouro,
                numero: enderecoSalvo.numero,
                complemento: enderecoSalvo.complemento || null,
                bairro: enderecoSalvo.bairro,
                cidade: enderecoSalvo.cidade,
                uf: enderecoSalvo.uf,
                latitude: enderecoSalvo.latitude || null,
                longitude: enderecoSalvo.longitude || null,
                is_principal: true
              });

              // Atualiza pedidos e pedido_entregas com o novo snapshot do endereço
              try {
                const linhaEndereco = cliAtualizado.endereco_principal || `${enderecoSalvo.logradouro}, ${enderecoSalvo.numero}${enderecoSalvo.complemento ? ` (${enderecoSalvo.complemento})` : ''}, ${enderecoSalvo.bairro}, ${enderecoSalvo.cidade}-${enderecoSalvo.uf}`;

                await supabase
                  .from('pedidos')
                  .update({
                    endereco_entrega: linhaEndereco,
                    atualizado_em: new Date().toISOString()
                  })
                  .eq('id', pedido.id);

                await supabase
                  .from('pedido_entregas')
                  .update({
                    cliente_endereco_id: idEndValido,
                    destino_cep: cepLimpoDest,
                    destino_logradouro: enderecoSalvo.logradouro,
                    destino_numero: enderecoSalvo.numero,
                    destino_complemento: enderecoSalvo.complemento || null,
                    destino_bairro: enderecoSalvo.bairro,
                    destino_cidade: enderecoSalvo.cidade,
                    destino_uf: enderecoSalvo.uf,
                    destino_latitude: enderecoSalvo.latitude || null,
                    destino_longitude: enderecoSalvo.longitude || null,
                    atualizado_em: new Date().toISOString()
                  })
                  .eq('pedido_id', pedido.id);
              } catch (eSync) {
                console.warn('[ModalDefinirEnvio] Aviso ao sincronizar endereço no pedido:', eSync);
              }

              setVersaoFulfillment((v) => v + 1);
              onFeedbackSucesso?.('Endereço do cliente atualizado com sucesso!');
            }}
          />
        )}
      </div>
    </div>
  );
};
