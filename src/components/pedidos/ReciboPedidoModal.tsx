import React from 'react';
import { X, Store, Printer, Share2, Copy } from 'lucide-react';
import { Pedido } from '../../types';
import { obterDadosPagamentoRecibo, formatarDataRecibo } from '../../services/printService';
import { extrairObservacaoLimpa } from '../../utils/formatters';

export interface ReciboPedidoModalProps {
  isOpen: boolean;
  pedido: Pedido | null;
  loja: any;
  onClose: () => void;
  onImprimir?: (pedido: Pedido) => void;
  onCompartilharWhatsApp?: (pedido: Pedido) => void;
  onCopiarTexto?: (pedido: Pedido) => void;
}

export const ReciboPedidoModal: React.FC<ReciboPedidoModalProps> = ({
  isOpen,
  pedido,
  loja,
  onClose,
  onImprimir,
  onCompartilharWhatsApp,
  onCopiarTexto
}) => {
  if (!isOpen || !pedido) return null;

  const rawPe = (pedido as any).pedido_entrega || (pedido as any).pedido_entregas;
  const pe = Array.isArray(rawPe) ? rawPe[0] : rawPe;
  const metaTransp = (pedido as any).metadados?.transportadora_nome;
  const metaTipo = (pedido as any).metadados?.tipo_atendimento;
  const ehRetirada = pe?.tipo_atendimento === 'retirada' ||
    metaTipo === 'retirada' ||
    (!pe && !metaTransp && Number(pedido.valor_frete || 0) === 0 && !pedido.endereco_entrega);

  let formaEntregaTexto = 'RETIRADA NA LOJA';
  if (!ehRetirada) {
    const provedor = (pe?.provedor || (pedido as any).metadados?.provedor_frete || '').toLowerCase();
    const transp = (pe?.transportadora_nome || pe?.forma_entrega_nome || metaTransp || pedido.forma_entrega?.nome || (pedido as any).nome_transportadora || '').trim();
    const servico = (pe?.servico_codigo || (pedido as any).metadados?.servico_frete_codigo || '').toLowerCase();

    if (provedor === 'correios' || transp.toLowerCase().includes('correios') || servico.includes('correios') || servico === '1' || servico === '2') {
      formaEntregaTexto = 'CORREIOS';
    } else if (provedor === 'uber' || transp.toLowerCase().includes('uber') || servico.includes('uber')) {
      formaEntregaTexto = 'UBER FLASH';
    } else if (transp.toLowerCase().includes('jadlog') || servico.includes('jadlog') || servico === '3' || servico === '4') {
      formaEntregaTexto = 'JADLOG';
    } else if (transp && transp.toLowerCase() !== 'entrega' && transp.toLowerCase() !== 'entrega padrão' && transp.toLowerCase() !== 'envio a definir') {
      formaEntregaTexto = transp.toUpperCase();
    } else if (pedido.status === 'envio_pendente' && Number(pedido.valor_frete || 0) === 0) {
      formaEntregaTexto = 'ENVIO (A DEFINIR)';
    } else {
      formaEntregaTexto = 'ENTREGA';
    }
  }

  const subtotalProdutos = Number((pedido as any).subtotal_produtos || pedido.subtotal || pedido.valor_total || 0);
  const valorDesconto = Number(pedido.valor_desconto || 0);
  const valorFrete = Number(pedido.valor_frete || 0);
  const valorTotal = Number(pedido.valor_total || 0);
  const pagInfo = obterDadosPagamentoRecibo(pedido);
  const obsLimpa = extrairObservacaoLimpa(pedido.observacoes);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 shrink-0">
          <h3 className="text-sm font-bold text-slate-100">
            Recibo #{pedido.numero_pedido}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-slate-950/90 flex justify-center items-start custom-scrollbar">
          <div className="w-full max-w-sm bg-white text-slate-900 rounded-xl p-5 pb-8 sm:p-6 sm:pb-8 shadow-2xl border border-slate-300 font-mono text-xs space-y-3 min-h-fit mb-6">
            <div className="text-center space-y-1 border-b border-slate-300 border-dashed pb-3">
              <Store className="w-8 h-8 text-slate-700 mx-auto mb-1" />
              <h4 className="font-bold text-sm uppercase tracking-wider">{loja?.nome || 'HUBI LOJA'}</h4>
              <p className="text-[11px] text-slate-600">Comprovante de Pedido / Venda</p>
              <p className="text-[10px] text-slate-500">{formatarDataRecibo(pedido.criado_em)}</p>
            </div>

            <div className="space-y-1 text-xs border-b border-slate-300 border-dashed pb-2">
              <div className="flex justify-between">
                <span className="text-slate-600">Pedido:</span>
                <span className="font-bold">#{pedido.numero_pedido}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Cliente:</span>
                <span className="font-bold">{pedido.cliente?.nome || 'Consumidor Final'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Forma de Atendimento:</span>
                <span className="font-bold">{formaEntregaTexto}</span>
              </div>
            </div>

            {/* Itens */}
            <div className="space-y-1.5 border-b border-slate-300 border-dashed pb-3">
              {(pedido.itens || []).map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between text-xs">
                  <span className="truncate pr-2">
                    {item.quantidade}x {item.nome_produto || item.produto?.nome || 'Produto'}
                  </span>
                  <span className="font-semibold shrink-0">
                    R$ {(Number(item.quantidade || 1) * Number(item.preco_venda_unitario || item.preco_unitario || 0)).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Totais */}
            <div className="space-y-1.5 text-xs text-slate-700">
              <div className="flex justify-between text-slate-800">
                <span>Subtotal dos Produtos:</span>
                <span className="font-semibold text-slate-900">R$ {subtotalProdutos.toFixed(2)}</span>
              </div>

              {valorDesconto > 0 && (
                <div className="flex justify-between text-red-600 font-bold">
                  <span>Desconto:</span>
                  <span>- R$ {valorDesconto.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-800">
                <span>Frete ({formaEntregaTexto}):</span>
                <span className="font-semibold text-slate-900">
                  {valorFrete > 0
                    ? `+ R$ ${valorFrete.toFixed(2)}`
                    : ehRetirada
                      ? 'Grátis (Retirada)'
                      : 'A Definir'}
                </span>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 my-1"></div>

              <div className="flex justify-between items-center text-sm font-black text-slate-950 pt-0.5">
                <span>VALOR TOTAL:</span>
                <span className="text-base font-black">R$ {valorTotal.toFixed(2)}</span>
              </div>
            </div>

            {obsLimpa && (
              <div className="border-t border-slate-300 border-dashed pt-2 text-[10px] text-slate-600">
                <strong>Obs:</strong> {obsLimpa}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end gap-2 shrink-0">
          {onCopiarTexto && (
            <button
              type="button"
              onClick={() => onCopiarTexto(pedido)}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="Copiar texto do recibo"
            >
              <Copy className="w-4 h-4" />
              <span>Copiar</span>
            </button>
          )}
          {onCompartilharWhatsApp && (
            <button
              type="button"
              onClick={() => onCompartilharWhatsApp(pedido)}
              className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="Enviar recibo pelo WhatsApp"
            >
              <Share2 className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>
          )}
          {onImprimir && (
            <button
              type="button"
              onClick={() => onImprimir(pedido)}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="Imprimir recibo"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
