import React from 'react';
import { X, Store, Printer, Share2, Copy, Edit } from 'lucide-react';
import { Pedido } from '../../types';
import { obterDadosPagamentoRecibo, formatarDataRecibo, PrintService } from '../../services/printService';
import { obterInfoVencimentoFiado } from '../../utils/statusPedidoUtils';
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
        formaEntregaTexto = 'MELHOR ENVIO (JADLOG)';
      } else if (transp.toLowerCase().includes('correios') || servico.includes('correios') || servico === '1' || servico === '2') {
        formaEntregaTexto = servicoCorreios ? `CORREIOS (${servicoCorreios})` : 'MELHOR ENVIO (CORREIOS)';
      } else {
        formaEntregaTexto = transp ? (transp.toUpperCase().includes('MELHOR ENVIO') ? transp.toUpperCase() : `MELHOR ENVIO (${transp.toUpperCase()})`) : 'MELHOR ENVIO';
      }
    } else if (ehTransportadoraPrivada) {
      formaEntregaTexto = formatarNomeTransportadora(transp || 'Jadlog').toUpperCase();
    } else if (ehCorreios) {
      formaEntregaTexto = servicoCorreios ? `CORREIOS (${servicoCorreios})` : 'CORREIOS';
    } else if (ehAppEntrega) {
      formaEntregaTexto = (nomeApp || (transp && transp.toLowerCase() !== 'entrega' && !transp.toLowerCase().includes('corrida') ? transp : 'Uber Flash')).toUpperCase();
    } else if (provedor === 'uber' || transp.toLowerCase().includes('uber direct') || transp.toLowerCase().includes('uber flash')) {
      formaEntregaTexto = 'UBER FLASH';
    } else if (transp && transp.toLowerCase() !== 'entrega' && transp.toLowerCase() !== 'entrega padrão' && transp.toLowerCase() !== 'envio a definir') {
      formaEntregaTexto = transp.toUpperCase();
    } else if (pedido.status === 'envio_pendente' && Number(pedido.valor_frete || 0) === 0) {
      formaEntregaTexto = 'ENVIO (A DEFINIR)';
    } else {
      formaEntregaTexto = 'ENTREGA';
    }
  }

  const badgeEstilo = ehRetirada 
    ? 'bg-purple-100 text-purple-800' 
    : 'bg-emerald-100 text-emerald-800';

  const logoLojaUrl = loja?.url_logo || (loja as any)?.logo_url;
  const enderecoLojaFormatado = [
    loja?.endereco_logradouro,
    loja?.endereco_numero,
    loja?.endereco_bairro,
    loja?.endereco_cidade
  ].filter(Boolean).join(', ') || 'Endereço da Loja';

  const enderecoDestino = (() => {
    if (pe?.destino_logradouro) {
      const comp = pe.destino_complemento ? ` - ${pe.destino_complemento}` : '';
      const cep = pe.destino_cep ? ` (CEP: ${pe.destino_cep})` : '';
      return `${pe.destino_logradouro}, ${pe.destino_numero || 'S/N'}${comp}, ${pe.destino_bairro}, ${pe.destino_cidade}-${pe.destino_uf}${cep}`;
    }
    if (pedido.endereco_entrega) {
      return pedido.endereco_entrega;
    }
    if (pedido.cliente?.endereco_principal) {
      return pedido.cliente.endereco_principal;
    }
    return 'Endereço não informado';
  })();

  const formatarData = (dataStr?: string | null) => {
    if (!dataStr) return '';
    try {
      const d = new Date(dataStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const calcularTotalItens = (ped: Pedido) => {
    return (ped.itens || []).reduce((acc: number, item: any) => acc + Number(item.quantidade || 1), 0);
  };

  const subtotalProdutos = Number((pedido as any).subtotal_produtos || pedido.subtotal || pedido.valor_total || 0);
  const valorDesconto = Number(pedido.valor_desconto || 0);
  const valorFrete = Number(pedido.valor_frete || 0);
  const valorTotal = Number(pedido.valor_total || 0);
  const pagInfo = obterDadosPagamentoRecibo(pedido);
  const obsLimpa = extrairObservacaoLimpa(pedido.observacoes);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-700/80 flex items-center justify-between bg-slate-900 shrink-0">
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

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-slate-900 flex justify-center items-start custom-scrollbar">
          <div className="w-full max-w-sm bg-black text-slate-200 rounded-xl p-5 shadow-2xl border border-slate-700/70 font-mono text-xs space-y-3.5 min-h-fit mb-6">
            {/* Logo e Cabeçalho do Recibo */}
            <div className="text-center space-y-1 border-b border-slate-700/60 border-dashed pb-3">
              {logoLojaUrl ? (
                <img src={logoLojaUrl} alt="Logo" className="h-10 max-w-[160px] object-contain mx-auto mb-2" />
              ) : (
                <Store className="w-8 h-8 text-slate-400 mx-auto mb-1" />
              )}
              <h4 className="font-bold text-sm text-white uppercase tracking-wider">{loja?.nome_fantasia || 'HUBI PDV'}</h4>
              <p className="text-[11px] text-slate-400">{enderecoLojaFormatado}</p>
              <p className="text-[11px] text-slate-400">{loja?.whatsapp || loja?.telefone}</p>
            </div>

            {/* Número e Data */}
            <div className="flex justify-between items-center text-[11px] text-slate-400 border-b border-slate-700/60 border-dashed pb-2">
              <span className="font-bold text-white">RECIBO #{pedido.numero_pedido}</span>
              <span>{formatarData(pedido.data_venda || pedido.criado_em || '')}</span>
            </div>

            {/* Vendedor / Canal (Antes do Cliente) */}
            <div className="space-y-0.5 border-b border-slate-700/60 border-dashed pb-2 text-[11px]">
              <span className="text-slate-400 font-semibold">
                {pedido.origem === 'catalogo_online' ? 'Canal / Vendedor:' : 'Vendedor:'}
              </span>
              <p className="font-bold text-white">
                {pedido.origem === 'catalogo_online'
                  ? 'Catálogo Online (Pedido Online)'
                  : pedido.vendedor?.nome_completo || 'Caixa / Balcão'}
              </p>
            </div>

            {/* Cliente */}
            <div className="space-y-0.5 border-b border-slate-700/60 border-dashed pb-2 text-[11px]">
              <span className="text-slate-400 font-semibold">Cliente:</span>
              <p className="font-bold text-white">{pedido.cliente?.nome || 'Cliente Avulso (Balcão)'}</p>
              {pedido.cliente?.whatsapp && <p className="text-slate-300">{pedido.cliente.whatsapp}</p>}
            </div>

            {/* Forma de Entrega & Endereço */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-[11px] space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-300 uppercase text-[10px] tracking-wider">Forma de Entrega:</span>
                <span className={`font-black px-1.5 py-0.5 rounded text-[10px] ${badgeEstilo}`}>
                  {formaEntregaTexto}
                </span>
              </div>
              <div className="text-slate-300 pt-0.5">
                <strong className="text-white">{ehRetirada ? 'Local de Retirada:' : 'Endereço de Entrega:'} </strong>
                <span className="text-slate-200">{ehRetirada ? enderecoLojaFormatado : enderecoDestino}</span>
              </div>
              {(pe?.codigo_corrida || (pedido as any)?.codigo_corrida) && (
                <div className="text-emerald-400 font-bold pt-0.5">
                  Código da Corrida: {pe?.codigo_corrida || (pedido as any)?.codigo_corrida}
                </div>
              )}
              {pe?.codigo_rastreio && (
                <div className="text-emerald-400 font-bold pt-0.5">
                  Rastreio: {pe.codigo_rastreio}
                </div>
              )}
            </div>

            {/* Itens */}
            <div className="space-y-2 border-b border-slate-700/60 border-dashed pb-2">
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block">
                Itens ({calcularTotalItens(pedido)} un)
              </span>
              {(pedido.itens || []).map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between py-0.5 text-slate-200">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white">{item.quantidade}x</span>
                    <span className="text-slate-200">{item.nome_produto || item.produto?.nome || 'Produto'}</span>
                  </div>
                  <span className="font-bold text-white whitespace-nowrap pl-2">
                    R$ {Number(item.subtotal || (Number(item.preco_venda_unitario || item.preco_unitario || 0) * Number(item.quantidade || 1))).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Fechamento Financeiro */}
            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal dos Produtos:</span>
                <span className="font-semibold text-white">
                  R$ {subtotalProdutos.toFixed(2)}
                </span>
              </div>

              {valorDesconto > 0 && (
                <div className="flex justify-between text-rose-400 font-bold">
                  <span>Desconto Aplicado:</span>
                  <span>- R$ {valorDesconto.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-300">
                <span>Frete{formaEntregaTexto && !ehRetirada ? ` (${formaEntregaTexto})` : ''}:</span>
                <span className="font-semibold text-white">
                  {valorFrete > 0 
                    ? `+ R$ ${valorFrete.toFixed(2)}` 
                    : ehRetirada 
                      ? 'Grátis (Retirada)'
                      : (formaEntregaTexto && !formaEntregaTexto.toLowerCase().includes('definir') && !formaEntregaTexto.toLowerCase().includes('combinar'))
                        ? 'Grátis (R$ 0,00)'
                        : 'A Definir'}
                </span>
              </div>

              <div className="border-t border-dashed border-slate-700/60 pt-2 my-1"></div>

              <div className="flex justify-between items-center text-sm font-bold text-white pt-0.5">
                <span>VALOR TOTAL:</span>
                <span className="text-lg font-black text-white">R$ {valorTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Dados do Pagamento (Após o Valor Total) */}
            {pagInfo.ehFiado && Number(pedido.saldo_devedor || 0) > 0 && (
              <div className="mt-2.5 p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-center space-y-0.5">
                <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider block">Saldo a Pagar (Fiado)</span>
                <span className="text-sm font-black text-rose-400 block">R$ {Number(pedido.saldo_devedor).toFixed(2)}</span>
                <span className="text-[11px] font-bold text-rose-300 block pt-0.5">
                  Data de Vencimento: {obterInfoVencimentoFiado(pedido).formatada}
                </span>
              </div>
            )}

            <div className="mt-3 p-3 rounded-xl border border-slate-700/50 bg-slate-800/80 space-y-2 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-dashed border-slate-700/60">
                <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Status Pagamento:</span>
                <span className={`font-black text-[10px] px-2 py-0.5 rounded border ${pagInfo.foiPago ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
                  {pagInfo.foiPago ? '✓ PAGO' : 'AGUARDANDO PAGAMENTO'}
                </span>
              </div>
              {pagInfo.foiPago && pagInfo.pagamentosDetalhados.length > 0 ? (
                <div className="space-y-1.5 pt-1 text-slate-300">
                  {pagInfo.pagamentosDetalhados.map((pag, idx) => (
                    <div key={idx} className="flex justify-between items-start text-[11px]">
                      <div>
                        <span className="font-semibold text-white block">{pag.forma}{pag.parcelas ? ` (${pag.parcelas}x)` : ''}</span>
                        {pag.origemGateway && (
                          <span className="text-[10px] text-slate-400 block font-medium">Origem: {pag.origemGateway}</span>
                        )}
                      </div>
                      <span className="font-bold text-white">R$ {pag.valor.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t border-slate-700/60 text-xs">
                    <span className="text-slate-300 font-medium">Valor Pago:</span>
                    <span className="text-emerald-400 font-black text-sm">R$ {pagInfo.totalPago.toFixed(2)}</span>
                  </div>
                </div>
              ) : null}
            </div>

            {obsLimpa && (
              <div className="border-t border-slate-700/70 border-dashed pt-2 text-[10px] text-slate-400">
                <strong className="text-slate-300">Obs:</strong> {obsLimpa}
              </div>
            )}
          </div>
        </div>

        {/* BOTÕES DE AÇÃO NO RODAPÉ DO MODAL */}
        <div className="p-4 border-t border-slate-700/80 bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
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
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg transition-colors text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95"
              title="Imprimir Cupom Térmico 58mm ou 80mm"
            >
              <Printer className="w-3.5 h-3.5 text-white" />
              <span>Térmica 58/80mm</span>
            </button>

            <button
              type="button"
              onClick={() => PrintService.printReceipt(pedido, loja, 'a4')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg transition-colors text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95"
              title="Imprimir Folha A4"
            >
              <Printer className="w-3.5 h-3.5 text-white" />
              <span>Imprimir A4</span>
            </button>

            {onCompartilharWhatsApp && (
              <button
                type="button"
                onClick={() => onCompartilharWhatsApp(pedido)}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-emerald-400 border border-slate-700 hover:border-slate-600 transition flex items-center gap-1.5 cursor-pointer"
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
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
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
