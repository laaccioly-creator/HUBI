import React from 'react';
import { X, Store, Printer, Share2, Copy, Edit } from 'lucide-react';
import { Pedido } from '../../types';
import { obterDadosPagamentoRecibo, formatarDataRecibo, PrintService } from '../../services/printService';
import { extrairObservacaoLimpa } from '../../utils/formatters';
import { detectarServicoPorCodigo } from '../../utils/correiosValidator';
import { formatarNomeTransportadora } from '../../utils/shippingDisplay';

export interface ReciboPedidoModalProps {
  isOpen: boolean;
  pedido: Pedido | null;
  loja: any;
  onClose: () => void;
  onImprimir?: (pedido: Pedido) => void;
  onCompartilharWhatsApp?: (pedido: Pedido) => void;
  onCopiarTexto?: (pedido: Pedido) => void;
  onEditarRecibo?: () => void;
}

export const ReciboPedidoModal: React.FC<ReciboPedidoModalProps> = ({
  isOpen,
  pedido,
  loja,
  onClose,
  onImprimir,
  onCompartilharWhatsApp,
  onCopiarTexto,
  onEditarRecibo
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
  const nomeApp = (pedido as any)?.nome_app || pe?.nome_app || (pedido as any)?.metadados?.nome_app;
  const codigoCorrida = (pedido as any)?.codigo_corrida || pe?.codigo_corrida || (pedido as any)?.metadados?.codigo_corrida;
  const codigoRastreio = pe?.codigo_rastreio || pedido.codigo_rastreio || (pedido as any)?.metadados?.codigo_rastreio;

  if (!ehRetirada) {
    const provedor = (pe?.provedor || (pedido as any).metadados?.provedor_frete || '').toLowerCase();
    const transp = (pe?.transportadora_nome || pe?.forma_entrega_nome || metaTransp || pedido.forma_entrega?.nome || (pedido as any).nome_transportadora || '').trim();
    const servico = (pe?.servico_codigo || (pedido as any).metadados?.servico_frete_codigo || '').toLowerCase();

    const ehMelhorEnvio =
      provedor === 'melhor_envio' ||
      (pedido as any).metadados?.provedor_frete === 'melhor_envio' ||
      Boolean((pedido as any).metadados?.melhor_envio_order_id) ||
      (pe?.provedor as any) === 'melhor_envio' ||
      transp.toLowerCase().includes('melhor envio') ||
      transp.toLowerCase().includes('melhorenvio');

    const ehTransportadoraPrivada =
      !ehMelhorEnvio &&
      (pe?.tipo_operacao === 'transportadora' ||
      (pedido as any)?.tipo_operacao === 'transportadora' ||
      Boolean(pe?.transportadora_id) ||
      transp.toLowerCase().includes('jadlog') ||
      (transp.toLowerCase().includes('transportadora') && !transp.toLowerCase().includes('correios')));

    const servicoCorreios =
      (pedido as any).servico_correios ||
      pe?.servico_correios ||
      (servico === '1' || servico.includes('sedex') || (transp.toLowerCase().includes('sedex') && !ehTransportadoraPrivada) ? 'SEDEX' : '') ||
      (servico === '2' || servico.includes('pac') || (transp.toLowerCase().includes('pac') && !ehTransportadoraPrivada) ? 'PAC' : '') ||
      (!ehTransportadoraPrivada ? detectarServicoPorCodigo(codigoRastreio) : null);

    const ehCorreios =
      !ehTransportadoraPrivada &&
      (provedor === 'correios' ||
      pe?.tipo_operacao === 'correios' ||
      (pedido as any)?.tipo_operacao === 'correios' ||
      transp.toLowerCase().includes('correios') ||
      servico.includes('correios') ||
      servico === '1' ||
      servico === '2' ||
      Boolean(servicoCorreios));

    const ehAppEntrega =
      pe?.tipo_operacao === 'app_entrega' ||
      (pedido as any)?.tipo_operacao === 'app_entrega' ||
      Boolean(pe?.app_entrega_id) ||
      Boolean(nomeApp) ||
      Boolean(codigoCorrida) ||
      (!ehTransportadoraPrivada && !ehCorreios && (
        transp.toLowerCase().includes('uber') ||
        transp.toLowerCase().includes('99') ||
        transp.toLowerCase().includes('lalamove')
      ));

    if (ehMelhorEnvio) {
      if (transp.toLowerCase().includes('jadlog') || servico.includes('jadlog') || servico === '3' || servico === '4') {
        if (servico === '3' || transp.toLowerCase().includes('.package') || transp.toLowerCase().includes('package')) {
          formaEntregaTexto = 'Jadlog (.Package)';
        } else if (servico === '4' || transp.toLowerCase().includes('.com') || transp.toLowerCase().includes('jadlog.com')) {
          formaEntregaTexto = 'Jadlog (.Com)';
        } else {
          formaEntregaTexto = 'Jadlog (.Package)';
        }
      } else if (transp.toLowerCase().includes('correios') || servico.includes('correios') || servico === '1' || servico === '2') {
        const servicoReal = servicoCorreios || (servico === '1' ? 'SEDEX' : servico === '2' ? 'PAC' : '');
        formaEntregaTexto = servicoReal ? `Correios (${servicoReal})` : 'Correios';
      } else {
        formaEntregaTexto = transp || 'Melhor Envio';
      }
    } else if (ehTransportadoraPrivada) {
      if (transp.toLowerCase().includes('jadlog') || servico.includes('jadlog')) {
        formaEntregaTexto = 'Jadlog (.Package)';
      } else {
        formaEntregaTexto = formatarNomeTransportadora(transp || 'Transportadora');
      }
    } else if (ehCorreios) {
      formaEntregaTexto = servicoCorreios ? `Correios (${servicoCorreios})` : 'Correios';
    } else if (ehAppEntrega) {
      if (nomeApp && !nomeApp.toLowerCase().includes('direct')) {
        formaEntregaTexto = nomeApp;
      } else if (transp.toLowerCase().includes('uber flash')) {
        formaEntregaTexto = 'Uber Flash';
      } else if (transp.toLowerCase().includes('99')) {
        formaEntregaTexto = '99 Entrega';
      } else if (transp.toLowerCase().includes('lalamove')) {
        formaEntregaTexto = 'Lalamove';
      } else {
        formaEntregaTexto = (nomeApp && nomeApp.toLowerCase().includes('uber')) ? 'Uber Direct' : (nomeApp || 'App de Corrida');
      }
    } else if (transp.toLowerCase().includes('uber flash')) {
      formaEntregaTexto = 'Uber Flash';
    } else if (provedor === 'uber' || transp.toLowerCase().includes('uber direct')) {
      formaEntregaTexto = 'Uber Direct';
    } else if (transp && transp.toLowerCase() !== 'entrega' && transp.toLowerCase() !== 'entrega padrão' && transp.toLowerCase() !== 'envio a definir') {
      formaEntregaTexto = formatarNomeTransportadora(transp);
    } else if (pedido.status === 'envio_pendente' && Number(pedido.valor_frete || 0) === 0) {
      formaEntregaTexto = 'Envio (A Definir)';
    } else {
      formaEntregaTexto = 'Entrega';
    }
  }

  const subtotalProdutos = Number((pedido as any).subtotal_produtos || pedido.subtotal || pedido.valor_total || 0);
  const valorDesconto = Number(pedido.valor_desconto || 0);
  const valorFrete = Number(pedido.valor_frete || 0);
  const valorTotal = Number(pedido.valor_total || 0);
  const pagInfo = obterDadosPagamentoRecibo(pedido);
  const obsLimpa = extrairObservacaoLimpa(pedido.observacoes);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="w-full max-w-lg bg-[#0f172a] border border-slate-700/80 rounded-3xl overflow-hidden shadow-2xl shadow-black/80 flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-700/80 flex items-center justify-between bg-slate-900/90 shrink-0">
          <h3 className="text-sm font-bold text-white">
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
          <div className="w-full max-w-sm bg-[#1e293b]/70 text-slate-200 rounded-xl p-4 sm:p-5 shadow-xl border border-slate-700/60 font-mono text-xs space-y-3.5 min-h-fit mb-6">
            <div className="text-center space-y-1 border-b border-slate-700/60 border-dashed pb-3">
              <Store className="w-8 h-8 text-slate-400 mx-auto mb-1" />
              <h4 className="font-bold text-sm text-white uppercase tracking-wider">{loja?.nome_fantasia || loja?.nome || 'HUBI PDV'}</h4>
              <p className="text-[11px] text-slate-400">Comprovante de Pedido / Venda</p>
              <p className="text-[10px] text-slate-500">{formatarDataRecibo(pedido.criado_em)}</p>
            </div>

            <div className="space-y-1 text-xs border-b border-slate-700/60 border-dashed pb-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Pedido:</span>
                <span className="font-bold text-white">#{pedido.numero_pedido}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cliente:</span>
                <span className="font-bold text-white">{pedido.cliente?.nome || 'Consumidor Final'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Forma de Entrega:</span>
                <span className="font-bold text-white">{ehRetirada ? 'Retirada na Loja' : formaEntregaTexto}</span>
              </div>
              {codigoCorrida && (
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>Código da Corrida:</span>
                  <span>{codigoCorrida}</span>
                </div>
              )}
              {codigoRastreio && (
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>Código de Rastreio:</span>
                  <span>{codigoRastreio}</span>
                </div>
              )}
            </div>

            {/* Itens */}
            <div className="space-y-1.5 border-b border-slate-700/60 border-dashed pb-3">
              {(pedido.itens || []).map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between text-xs">
                  <span className="truncate pr-2 text-slate-300">
                    {item.quantidade}x {item.nome_produto || item.produto?.nome || 'Produto'}
                  </span>
                  <span className="font-semibold text-white shrink-0">
                    R$ {(Number(item.quantidade || 1) * Number(item.preco_venda_unitario || item.preco_unitario || 0)).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Totais */}
            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Subtotal dos Produtos:</span>
                <span className="font-semibold text-white">R$ {subtotalProdutos.toFixed(2)}</span>
              </div>

              {valorDesconto > 0 && (
                <div className="flex justify-between text-rose-400 font-bold">
                  <span>Desconto:</span>
                  <span>- R$ {valorDesconto.toFixed(2)}</span>
                </div>
              )}

              {!ehRetirada && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Frete ({formaEntregaTexto}):</span>
                  <span className="font-semibold text-white">
                    {valorFrete > 0
                      ? `+ R$ ${valorFrete.toFixed(2)}`
                      : 'A Definir'}
                  </span>
                </div>
              )}

              <div className="border-t border-dashed border-slate-700/60 pt-2 my-1"></div>

              {/* CORREÇÃO CRÍTICA DO VALOR TOTAL */}
              <div className="flex justify-between items-center text-sm font-bold text-white pt-0.5">
                <span className="text-white font-bold tracking-wide">VALOR TOTAL:</span>
                <span className="text-lg font-black text-white">R$ {valorTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Status e Discriminação do Pagamento */}
            {pagInfo.ehFiado && Number(pedido.saldo_devedor) > 0 && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-500/30 rounded-xl text-center space-y-0.5">
                <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">Saldo a Pagar (Fiado)</span>
                <span className="text-sm font-black text-rose-300">R$ {Number(pedido.saldo_devedor).toFixed(2)}</span>
              </div>
            )}

            {/* CARD INFERIOR DE PAGAMENTO: FIM DO VERDE SOBRE VERDE */}
            <div className="mt-3 p-3 rounded-xl border border-slate-700/50 bg-slate-800/80 space-y-2 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-dashed border-slate-700/60">
                <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Status Pagamento:</span>
                <span className={`font-semibold text-[10px] px-2 py-0.5 rounded border ${
                  pagInfo.foiPago
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                }`}>
                  {pagInfo.foiPago ? '✓ PAGO' : 'AGUARDANDO PAGAMENTO'}
                </span>
              </div>
              {pagInfo.foiPago && pagInfo.pagamentosDetalhados.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {pagInfo.pagamentosDetalhados.map((pag, idx) => (
                    <div key={idx} className="flex justify-between items-start text-[11px]">
                      <div>
                        <span className="font-semibold text-white block">{pag.forma}{pag.parcelas ? ` (${pag.parcelas}x)` : ''}</span>
                        {pag.origemGateway && (
                          <span className="text-[10px] text-slate-400 block font-normal">Origem: {pag.origemGateway}</span>
                        )}
                      </div>
                      <span className="font-bold text-white">R$ {pag.valor.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center font-bold text-xs pt-2 border-t border-slate-700/60">
                    <span className="text-slate-300">Valor Pago:</span>
                    <span className="text-emerald-400 font-black text-sm">R$ {pagInfo.totalPago.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {obsLimpa && (
              <div className="border-t border-slate-700/60 border-dashed pt-2 text-[10px] text-slate-400">
                <strong className="text-slate-300">Obs:</strong> {obsLimpa}
              </div>
            )}
          </div>
        </div>

        {/* BOTÕES DE AÇÃO NO RODAPÉ DO MODAL */}
        <div className="p-4 border-t border-slate-700/80 bg-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div>
            {onEditarRecibo && (
              <button
                type="button"
                onClick={onEditarRecibo}
                className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Editar meu recibo</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => onImprimir ? onImprimir(pedido) : PrintService.printReceipt(pedido, loja, '80mm')}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white border border-slate-700 hover:border-slate-600 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Imprimir Cupom Térmico 58mm ou 80mm"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>Térmica 58/80mm</span>
            </button>

            <button
              type="button"
              onClick={() => PrintService.printReceipt(pedido, loja, 'a4')}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-md shadow-emerald-600/30 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Imprimir Folha A4"
            >
              <Printer className="w-3.5 h-3.5 text-white" />
              <span>Imprimir A4</span>
            </button>

            {onCompartilharWhatsApp && (
              <button
                type="button"
                onClick={() => onCompartilharWhatsApp(pedido)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-emerald-400 border border-slate-700 hover:border-slate-600 transition flex items-center gap-1.5 cursor-pointer"
                title="Compartilhar no WhatsApp"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </button>
            )}

            {onCopiarTexto && (
              <button
                type="button"
                onClick={() => onCopiarTexto(pedido)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                title="Copiar texto do recibo"
              >
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Copiar</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
