import React, { useEffect, useRef, useState } from 'react';
import { X, Store, Printer, Share2, Download, CheckCircle2, MessageCircle } from 'lucide-react';
import { Pedido } from '../../types';
import { obterDadosPagamentoRecibo, formatarDataRecibo, PrintService } from '../../services/printService';
import { ReceiptPdfService } from '../../services/receiptPdfService';
import { obterInfoVencimentoFiado } from '../../utils/statusPedidoUtils';
import { extrairObservacaoLimpa, formatarMoeda } from '../../utils/formatters';
import { detectarServicoPorCodigo } from '../../utils/correiosValidator';
import { formatarNomeTransportadora } from '../../utils/shippingDisplay';
import { useTheme } from '../../contexts/ThemeContext';
import { ResultadoDisparoHibrido, whatsappWalletService } from '../../services/whatsappWalletService';

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
  const { tema } = useTheme();
  const isDark = tema === 'dark';
  const reciboRef = useRef<HTMLDivElement>(null);
  const ultimoPedidoDisparadoRef = useRef<string | null>(null);
  const [resultadoHibrido, setResultadoHibrido] = useState<ResultadoDisparoHibrido | null>(null);

  useEffect(() => {
    if (!isOpen || !pedido || !loja?.id) {
      if (!isOpen) {
        setResultadoHibrido(null);
      }
      return;
    }

    const telefoneCliente = String(
      pedido.cliente?.whatsapp ||
        pedido.cliente?.telefone ||
        (pedido as { telefone_cliente?: string }).telefone_cliente ||
        ''
    ).trim();

    if (!telefoneCliente) {
      setResultadoHibrido(null);
      return;
    }

    if (ultimoPedidoDisparadoRef.current === pedido.id) {
      return;
    }
    ultimoPedidoDisparadoRef.current = pedido.id;

    const mensagemRecibo = PrintService.generateWhatsAppMessage(pedido, loja);
    whatsappWalletService
      .dispararNotificacaoHibrida({
        lojaId: String(loja.id),
        telefoneDestino: telefoneCliente,
        mensagem: mensagemRecibo,
        eventoGatilho: 'recibo_venda',
        pedidoId: pedido.id,
        clienteId: pedido.cliente_id || pedido.cliente?.id || null,
      })
      .then((res) => {
        setResultadoHibrido(res);
      })
      .catch(() => {
        setResultadoHibrido({
          sucesso: true,
          modoEnvio: 'manual_link',
          custoAplicado: 0,
          saldoAtual: Number(loja?.whatsapp_saldo ?? 0),
          manualUrl: whatsappWalletService.construirLinkManualWhatsApp(
            telefoneCliente,
            mensagemRecibo
          ),
        });
      });
  }, [isOpen, pedido, loja]);

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
  const rawCodigoCorrida = (pedido as any)?.codigo_corrida || pe?.codigo_corrida || (pedido as any)?.metadados?.codigo_corrida;
  const codigoCorrida = (rawCodigoCorrida && !String(rawCodigoCorrida).startsWith('dqt_') && (String(rawCodigoCorrida).startsWith('del_') || !String(rawCodigoCorrida).includes('_'))) ? rawCodigoCorrida : null;
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
    } else if ((pedido.status === 'aguardando_envio' || (pedido.status as string) === 'envio_pendente') && Number(pedido.valor_frete || 0) === 0) {
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
    const itens = ped.itens || ped.itens_pedido || [];
    if (itens.length === 0) return 0;
    const soma = itens.reduce((acc: number, item: any) => acc + Math.round(Number(item.quantidade || 1)), 0);
    return Math.max(1, Math.round(soma));
  };

  const subtotalProdutos = Number((pedido as any).subtotal_produtos || pedido.subtotal || pedido.valor_total || 0);
  const valorDesconto = Number(pedido.valor_desconto || 0);
  const valorFrete = Number(pedido.valor_frete || 0);
  const valorTotal = Number(pedido.valor_total || 0);
  const pagInfo = obterDadosPagamentoRecibo(pedido);
  const obsLimpa = extrairObservacaoLimpa(pedido.observacoes);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className={`w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] ${
        isDark ? 'bg-[#08131A] border-2 border-slate-400 text-slate-100' : 'bg-slate-100 border-2 border-slate-300 text-black'
      }`}>
        <div className={`p-4 border-b flex items-center justify-between shrink-0 ${
          isDark ? 'border-slate-800 bg-[#08131A] text-white' : 'border-slate-300 bg-slate-100 text-black'
        }`}>
          <h3 className="text-sm font-bold">
            Recibo #{pedido.numero_pedido}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-black hover:bg-slate-200'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 flex justify-center items-start custom-scrollbar ${
          isDark ? 'bg-[#000000]' : 'bg-slate-100'
        }`}>
          {/* Bobina de Papel Autêntica (Branca com Tipografia Nítida em Preto/Slate) */}
          <div
            ref={reciboRef}
            data-recibo-root="true"
            style={{ colorScheme: 'light', backgroundColor: '#ffffff', color: '#0f172a' }}
            className="w-full max-w-sm bg-white text-slate-900 rounded-xl p-5 shadow-xl border border-slate-200 font-mono text-xs space-y-3.5 min-h-fit mb-6"
          >
            {/* Logo e Cabeçalho do Recibo */}
            <div className="text-center space-y-1 border-b border-slate-200 border-dashed pb-3">
              {logoLojaUrl ? (
                <img src={logoLojaUrl} alt="Logo" className="h-10 max-w-[160px] object-contain mx-auto mb-2" />
              ) : (
                <Store className="w-8 h-8 text-slate-500 mx-auto mb-1" />
              )}
              <h4 className="font-bold text-sm text-slate-900 uppercase tracking-wider">{loja?.nome_fantasia || 'HUBI PDV'}</h4>
              <p className="text-[11px] text-slate-600">{enderecoLojaFormatado}</p>
              <p className="text-[11px] text-slate-600">{loja?.whatsapp || loja?.telefone}</p>
            </div>

            {/* Número e Data */}
            <div className="flex justify-between items-center text-[11px] text-slate-600 border-b border-slate-200 border-dashed pb-2">
              <span className="font-bold text-slate-900">RECIBO #{pedido.numero_pedido}</span>
              <span>{formatarData(pedido.data_venda || pedido.criado_em || '')}</span>
            </div>

            {/* Carimbo Visual de Destaque PEDIDO CANCELADO */}
            {pedido.status === 'cancelado' && (
              <div className="py-2 px-3 border-2 border-dashed border-rose-600 bg-rose-50 text-rose-700 text-center rounded-xl select-none my-1 shadow-xs">
                <span className="font-black text-sm tracking-widest uppercase block">
                  PEDIDO CANCELADO
                </span>
                <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wide block mt-0.5">
                  Venda anulada no sistema
                </span>
              </div>
            )}

            {/* Vendedor / Canal (Antes do Cliente) */}
            <div className="space-y-0.5 border-b border-slate-200 border-dashed pb-2 text-[11px]">
              <span className="text-slate-500 font-semibold">
                {pedido.origem === 'catalogo_online' ? 'Canal / Vendedor:' : 'Vendedor:'}
              </span>
              <p className="font-bold text-slate-900">
                {pedido.origem === 'catalogo_online'
                  ? 'Catálogo Online (Pedido Online)'
                  : pedido.vendedor?.nome_completo || 'Caixa / Balcão'}
              </p>
            </div>

            {/* Cliente */}
            <div className="space-y-0.5 border-b border-slate-200 border-dashed pb-2 text-[11px]">
              <span className="text-slate-500 font-semibold">Cliente:</span>
              <p className="font-bold text-slate-900">{pedido.cliente?.nome || 'Cliente Avulso (Balcão)'}</p>
              {pedido.cliente?.whatsapp && <p className="text-slate-600">{pedido.cliente.whatsapp}</p>}
            </div>

            {/* Forma de Entrega & Endereço */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Forma de Entrega:</span>
                <span className={`font-black px-1.5 py-0.5 rounded text-[10px] ${badgeEstilo}`}>
                  {formaEntregaTexto}
                </span>
              </div>
              <div className="text-slate-700 pt-0.5">
                <strong className="text-slate-900">{ehRetirada ? 'Local de Retirada:' : 'Endereço de Entrega:'} </strong>
                <span className="text-slate-700">{ehRetirada ? enderecoLojaFormatado : enderecoDestino}</span>
              </div>
              {codigoCorrida && (
                <div className="text-emerald-700 font-bold pt-0.5">
                  Código da Corrida: {codigoCorrida}
                </div>
              )}
              {pe?.codigo_rastreio && (
                <div className="text-emerald-700 font-bold pt-0.5">
                  Rastreio: {pe.codigo_rastreio}
                </div>
              )}
            </div>

            {/* Itens */}
            <div className="space-y-2 border-b border-slate-200 border-dashed pb-2">
              <span className="font-bold text-slate-600 uppercase tracking-wider text-[10px] block">
                Itens ({calcularTotalItens(pedido)} un)
              </span>
              {(pedido.itens || []).map((item: any, idx: number) => {
                const qtdSol = Number(item.quantidade_solicitada ?? item.peso_solicitado_kg ?? 0);
                const qtdReal = Number(item.quantidade ?? 0);
                const unidade = (item.unidade_medida || item.produto?.unidade_medida || item.produto?.tipo_unidade || 'un').toLowerCase();
                const teveVariacaoPeso = unidade === 'kg' && qtdSol > 0 && Math.abs(qtdSol - qtdReal) > 0.001;
                return (
                <div key={idx} className="flex justify-between py-0.5 text-slate-800">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900">{item.quantidade}x</span>
                      <span className="text-slate-800 truncate">{item.nome_produto || item.produto?.nome || 'Produto'}</span>
                    </div>
                    {teveVariacaoPeso && (
                      <span className="text-[10px] text-amber-700 font-mono font-medium pl-5 block">
                        (Pedido: {qtdSol.toFixed(3)} kg | Pesado: {qtdReal.toFixed(3)} kg)
                      </span>
                    )}
                  </div>
                  <span className="font-bold text-slate-900 whitespace-nowrap pl-2">
                    R$ {Number(item.subtotal || (Number(item.preco_venda_unitario || item.preco_unitario || 0) * Number(item.quantidade || 1))).toFixed(2)}
                  </span>
                </div>
                );
              })}
            </div>

            {/* Fechamento Financeiro */}
            <div className="space-y-1.5 text-xs text-slate-700">
              <div className="flex justify-between">
                <span>Subtotal dos Produtos:</span>
                <span className="font-semibold text-slate-900">
                  {formatarMoeda(subtotalProdutos)}
                </span>
              </div>

              {valorDesconto > 0 && (
                <div className="flex justify-between text-rose-600 font-bold">
                  <span>Desconto Aplicado:</span>
                  <span>- {formatarMoeda(valorDesconto)}</span>
                </div>
              )}

              {!ehRetirada && (
                <div className="flex justify-between">
                  <span>Frete{formaEntregaTexto ? ` (${formaEntregaTexto})` : ''}:</span>
                  <span className="font-semibold text-slate-900">
                    {valorFrete > 0 
                      ? `+ ${formatarMoeda(valorFrete)}` 
                      : (formaEntregaTexto && !formaEntregaTexto.toLowerCase().includes('definir') && !formaEntregaTexto.toLowerCase().includes('combinar'))
                        ? 'Grátis (R$ 0,00)'
                        : 'A Definir'}
                  </span>
                </div>
              )}

              <div className="border-t border-dashed border-slate-200 pt-2 my-1"></div>

              <div className="flex justify-between items-center text-sm font-bold text-slate-900 pt-0.5">
                <span>VALOR TOTAL:</span>
                <span className="text-lg font-black text-slate-900">{formatarMoeda(valorTotal)}</span>
              </div>
            </div>

            {/* Dados do Pagamento (Após o Valor Total) */}
            {pagInfo.ehFiado && Number(pedido.saldo_devedor || 0) > 0 && (
              <div className="mt-2.5 p-3 bg-rose-50 border border-rose-200 rounded-xl text-center space-y-0.5">
                <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">
                  {pagInfo.ehCaderneta ? 'Saldo Caderneta' : 'Saldo a Pagar (Fiado)'}
                </span>
                <span className="text-sm font-black text-rose-700 block">{formatarMoeda(Number(pedido.saldo_devedor))}</span>
                <span className="text-[11px] font-bold text-rose-800 block pt-0.5">
                  Data de Vencimento: {obterInfoVencimentoFiado(pedido).formatada}
                </span>
              </div>
            )}

            <div className={`mt-3 p-3 rounded-xl border space-y-2 text-xs ${pagInfo.ehCaderneta ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex justify-between items-center pb-2 border-b border-dashed border-slate-200">
                <span className="font-bold text-[10px] text-slate-600 uppercase tracking-wider">Status Pagamento:</span>
                <span className={`font-black text-[10px] px-2 py-0.5 rounded border ${pedido.status_pagamento === 'aguardando_pesagem' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : pagInfo.ehCaderneta ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : pagInfo.foiPago ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-800 border-slate-300'}`}>
                  {pedido.status_pagamento === 'aguardando_pesagem' ? 'AGUARDANDO PESAGEM / SEPARAÇÃO' : pagInfo.ehCaderneta ? 'CADERNETA' : pagInfo.foiPago ? '✓ PAGO' : 'AGUARDANDO PAGAMENTO'}
                </span>
              </div>
              {pedido.status_pagamento === 'aguardando_pesagem' && (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-[11px] leading-relaxed">
                  ⚠️ AVISO: Valor estimado sujeito a pequena variação após a pesagem real dos produtos na loja. Aguarde a confirmação e a mensagem da loja para efetuar o pagamento.
                </div>
              )}
              {pagInfo.ehCaderneta && (
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs font-medium text-center">
                  {pagInfo.mensagemCaderneta || (() => {
                    const infoVenc = obterInfoVencimentoFiado(pedido);
                    const partes = (infoVenc.formatada || '').split('/');
                    const textoDiaMes = (partes[0] && partes[1]) ? `${partes[0]}/${partes[1]}` : infoVenc.formatada;
                    return `Anotado na caderneta para pagamento no dia ${textoDiaMes}`;
                  })()}
                </div>
              )}
              {pagInfo.foiPago && pagInfo.pagamentosDetalhados.length > 0 ? (
                <div className="space-y-1.5 pt-1 text-slate-700">
                  {pagInfo.pagamentosDetalhados.map((pag, idx) => (
                    <div key={idx} className="flex justify-between items-start text-[11px]">
                      <div>
                        <span className="font-semibold text-slate-900 block">{pag.forma}{pag.parcelas ? ` (${pag.parcelas}x)` : ''}:</span>
                        {pag.origemGateway && (
                          <span className="text-[10px] text-slate-500 block font-medium">Origem: {pag.origemGateway}</span>
                        )}
                      </div>
                      <span className="font-bold text-slate-900">{formatarMoeda(pag.valor)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-xs">
                    <span className="text-slate-700 font-medium">Valor Pago:</span>
                    <span className="text-emerald-700 font-black text-sm">{formatarMoeda(pagInfo.totalPago)}</span>
                  </div>
                </div>
              ) : null}
            </div>

            {obsLimpa && (
              <div className="border-t border-slate-200 border-dashed pt-2 text-[10px] text-slate-600">
                <strong className="text-slate-800">Obs:</strong> {obsLimpa}
              </div>
            )}
          </div>
        </div>

        {/* STATUS DO MOTOR HÍBRIDO DE WHATSAPP (QUANDO DISPARADO AUTOMATICAMENTE) */}
        {resultadoHibrido && (resultadoHibrido.modoEnvio === 'auto_janela_24h' || resultadoHibrido.modoEnvio === 'auto_tarifado') && (
          <div
            className={`px-3 py-2 border-t shrink-0 ${
              isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-black">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>✓ Recibo enviado automaticamente no WhatsApp</span>
            </div>
          </div>
        )}

        {/* BOTÕES DE AÇÃO NO RODAPÉ DO MODAL (EXATAMENTE 4 BOTÕES HORIZONTAIS COMPACTOS ALINHADOS) */}
        <div className={`p-2.5 sm:p-3 border-t flex flex-row items-center justify-between gap-1.5 sm:gap-2 shrink-0 ${
          isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-slate-100'
        }`}>
          <button
            type="button"
            onClick={() => onImprimir ? onImprimir(pedido) : PrintService.printReceipt(pedido, loja, '80mm')}
            className="flex-1 font-bold px-2 py-2.5 rounded-xl border border-emerald-600 bg-emerald-600 hover:bg-emerald-500 text-white transition text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 whitespace-nowrap shadow-xs"
            title="Imprimir Cupom Térmico 58mm/80mm"
          >
            <Printer className="w-3.5 h-3.5 shrink-0 text-white" />
            <span>Térmica</span>
          </button>

          <button
            type="button"
            onClick={() => PrintService.printReceipt(pedido, loja, 'a4')}
            className="flex-1 font-bold px-2 py-2.5 rounded-xl border border-emerald-600 bg-emerald-600 hover:bg-emerald-500 text-white transition text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 whitespace-nowrap shadow-xs"
            title="Imprimir Folha A4"
          >
            <Printer className="w-3.5 h-3.5 shrink-0 text-white" />
            <span>Imprimir A4</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              if (reciboRef.current) {
                await ReceiptPdfService.baixarPdfRecibo(reciboRef.current, pedido, loja);
              } else {
                PrintService.printReceipt(pedido, loja, 'a4');
              }
            }}
            className="flex-1 font-bold px-2 py-2.5 rounded-xl border border-emerald-600 bg-emerald-600 hover:bg-emerald-500 text-white transition text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 whitespace-nowrap shadow-xs"
            title="Baixar Recibo em PDF"
          >
            <Download className="w-3.5 h-3.5 shrink-0 text-white" />
            <span>PDF</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (onCompartilharWhatsApp) {
                onCompartilharWhatsApp(pedido);
              } else if (reciboRef.current) {
                ReceiptPdfService.compartilharReciboWhatsApp(reciboRef.current, pedido, loja);
              } else {
                const tel = pedido.cliente?.whatsapp || pedido.cliente?.telefone || '';
                const msg = PrintService.generateWhatsAppMessage(pedido, loja);
                PrintService.openWhatsApp(tel, msg);
              }
            }}
            className="flex-1 font-bold px-2 py-2.5 rounded-xl border border-emerald-600 bg-emerald-600 hover:bg-emerald-500 text-white transition text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 whitespace-nowrap shadow-xs"
            title="Compartilhar no WhatsApp"
          >
            <Share2 className="w-3.5 h-3.5 shrink-0 text-white" />
            <span>WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  );
};
