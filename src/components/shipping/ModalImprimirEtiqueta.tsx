import React, { useRef, useState } from 'react';
import { X, Printer, Package, Truck, MapPin, Building2, User, Tag, ExternalLink, Loader2, FileText } from 'lucide-react';
import { Pedido, Loja } from '../../types';
import { PedidoEntrega } from '../../types/shipping';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { ehUrlEtiquetaValida } from '../PedidosLista';
import { MelhorEnvioService } from '../../services/melhorEnvioService';
import { useTheme } from '../../contexts/ThemeContext';

interface ModalImprimirEtiquetaProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  loja: Loja | null;
  entrega?: PedidoEntrega | null;
}

export const ModalImprimirEtiqueta: React.FC<ModalImprimirEtiquetaProps> = ({
  isOpen,
  onClose,
  pedido,
  loja,
  entrega
}) => {
  const { tema } = useTheme();
  const isDark = tema === 'dark';
  const { mostrarToast, mostrarSucesso, mostrarErro } = useFeedbackModal();
  const etiquetaRef = useRef<HTMLDivElement>(null);
  const [obtendoEtiquetaOficial, setObtendoEtiquetaOficial] = useState(false);

  if (!isOpen || !pedido) return null;

  const rawPe = entrega || (pedido as any).pedido_entregas || pedido.pedido_entrega;
  const pe: PedidoEntrega | null = Array.isArray(rawPe) ? (rawPe[0] || null) : (rawPe || null);
  const linkEtiquetaOficial = (pe?.link_etiqueta || (pedido as any).link_etiqueta || (pedido as any).metadados?.link_etiqueta || '').trim();

  const transportadora =
    pe?.transportadora_nome ||
    (pe?.provedor === 'uber' ? 'Uber Direct' : null) ||
    pedido.nome_transportadora ||
    pe?.servico_correios ||
    pe?.nome_transportadora ||
    ((pedido as any).nome_app?.toLowerCase().includes('uber') ? 'Uber Direct' : null) ||
    'Entrega Padrão';

  const codigoRastreio =
    pe?.codigo_rastreio ||
    pedido.codigo_rastreio ||
    `PED-${pedido.numero_pedido || pedido.id.slice(0, 6)}`;

  const pinEntrega = pe?.pin_entrega || pedido.pin_entrega || null;

  const clienteNome = pedido.cliente?.nome || pedido.cliente_nome_avulso || 'Cliente';
  const clienteTelefone = pedido.cliente?.whatsapp || pedido.cliente?.telefone || pedido.cliente_telefone_avulso || '';
  const enderecoEntrega =
    pedido.endereco_entrega ||
    (pe?.destino_logradouro
      ? `${pe.destino_logradouro}, ${pe.destino_numero || 'S/N'}${pe.destino_complemento ? ` - ${pe.destino_complemento}` : ''} - ${pe.destino_bairro || ''}, ${pe.destino_cidade || ''}/${pe.destino_uf || ''} - CEP: ${pe.destino_cep || ''}`
      : 'Endereço não informado');

  const lojaNome = loja?.nome_fantasia || loja?.razao_social || 'Remetente';
  const lojaDocumento = loja?.numero_documento || '';
  const lojaTelefone = loja?.whatsapp || loja?.telefone || '';
  const lojaEndereco = loja
    ? `${loja.endereco_logradouro || ''}, ${loja.endereco_numero || 'S/N'} ${loja.endereco_bairro ? `- ${loja.endereco_bairro}` : ''} - ${loja.endereco_cidade || ''}/${loja.endereco_estado || ''} - CEP: ${loja.endereco_cep || ''}`
    : 'Endereço da loja';

  const ehAppOuManual =
    pe?.tipo_operacao === 'app_entrega' ||
    pe?.tipo_operacao === 'frota_propria' ||
    pe?.tipo_operacao === 'motoboy' ||
    (pedido as any).tipo_operacao === 'app_entrega' ||
    Boolean((pedido as any).nome_app) ||
    pe?.provedor === 'uber' ||
    pe?.provedor === 'frete_proprio';

  const temEtiquetaOficialValida = ehUrlEtiquetaValida(linkEtiquetaOficial);

  const ehMelhorEnvio = !ehAppOuManual && (
    pe?.provedor === 'melhor_envio' ||
    (pedido as any).metadados?.provedor_frete === 'melhor_envio' ||
    Boolean((pedido as any).metadados?.melhor_envio_order_id)
  );

  const handleAbrirMelhorEnvio = async () => {
    if (temEtiquetaOficialValida) {
      window.open(linkEtiquetaOficial, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      setObtendoEtiquetaOficial(true);
      mostrarToast('Obtendo etiqueta oficial em PDF com a transportadora...', 'info');
      const lojaId = loja?.id || pedido.loja_id;
      const ordemId = (pedido.metadados as any)?.melhor_envio_order_id || pe?.codigo_rastreio;
      const urlPdf = await MelhorEnvioService.obterEtiquetaOficialPdf(pedido.id, lojaId, ordemId);
      if (urlPdf) {
        mostrarSucesso('Etiqueta oficial pronta para impressão!');
        window.open(urlPdf, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      mostrarErro(err.message || 'Etiqueta oficial ainda não liberada no Melhor Envio.');
    } finally {
      setObtendoEtiquetaOficial(false);
    }
  };

  const handleImprimir = () => {
    const conteudo = etiquetaRef.current;
    if (!conteudo) return;

    const janelaImpressao = window.open('', '_blank', 'width=800,height=600');
    if (!janelaImpressao) {
      window.print();
      return;
    }

    janelaImpressao.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Etiqueta de Envio - Pedido #${pedido.numero_pedido}</title>
          <style>
            @page {
              size: 100mm 150mm;
              margin: 4mm;
            }
            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #000;
              margin: 0;
              padding: 6px;
              background: #fff;
              font-size: 11px;
              line-height: 1.3;
            }
            .etiqueta-box {
              border: 2px solid #000;
              padding: 10px;
              max-width: 100mm;
              margin: 0 auto;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #000;
              padding-bottom: 8px;
              margin-bottom: 8px;
            }
            .header h1 {
              font-size: 16px;
              margin: 0;
              text-transform: uppercase;
            }
            .section {
              border: 1px solid #333;
              border-radius: 4px;
              padding: 8px;
              margin-bottom: 8px;
            }
            .section-title {
              font-size: 10px;
              font-weight: bold;
              text-transform: uppercase;
              color: #333;
              margin-bottom: 4px;
              border-bottom: 1px solid #ccc;
              padding-bottom: 2px;
            }
            .destaque {
              font-weight: bold;
              font-size: 12px;
            }
            .barcode-box {
              text-align: center;
              margin: 10px 0;
              padding: 6px;
              border: 1px dashed #000;
            }
            .barcode-lines {
              font-family: 'Libre Barcode 39', 'Courier New', monospace;
              font-size: 32px;
              letter-spacing: 4px;
            }
            .barcode-text {
              font-family: monospace;
              font-size: 11px;
              font-weight: bold;
              margin-top: 2px;
            }
            .footer {
              font-size: 9px;
              text-align: center;
              color: #555;
              border-top: 1px solid #ccc;
              padding-top: 4px;
              margin-top: 6px;
            }
          </style>
        </head>
        <body>
          <div class="etiqueta-box">
            <div class="header">
              <div>
                <h1>${transportadora}</h1>
                <span>Envio Padrão HUBI</span>
              </div>
              <div style="text-align: right;">
                <strong>Pedido #${pedido.numero_pedido}</strong>
              </div>
            </div>

            <div class="barcode-box">
              <div class="barcode-lines">||| | |||| | || |||| | |||</div>
              <div class="barcode-text">${codigoRastreio}</div>
              ${pinEntrega ? `<div style="font-size: 11px; font-weight: bold; margin-top: 3px; color: #000;">CÓDIGO PIN: ${pinEntrega}</div>` : ''}
            </div>

            <div class="section">
              <div class="section-title">DESTINATÁRIO</div>
              <div class="destaque">${clienteNome}</div>
              ${clienteTelefone ? `<div>Tel: ${clienteTelefone}</div>` : ''}
              <div style="margin-top: 4px;">${enderecoEntrega}</div>
            </div>

            <div class="section">
              <div class="section-title">REMETENTE</div>
              <div class="destaque">${lojaNome}</div>
              ${lojaDocumento ? `<div>CNPJ/CPF: ${lojaDocumento}</div>` : ''}
              ${lojaTelefone ? `<div>Tel: ${lojaTelefone}</div>` : ''}
              <div style="margin-top: 4px;">${lojaEndereco}</div>
            </div>

            <div class="footer">
              HUBI Plataforma de Gestão • Impresso em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    janelaImpressao.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header do Modal */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Etiqueta de Envio • Pedido #{pedido.numero_pedido}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Formato padrão para despacho e logística
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>


        {/* Área Interna da Etiqueta Harmonizada */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-900/60 flex justify-center items-start custom-scrollbar">
          <div
            ref={etiquetaRef}
            className="w-full max-w-sm bg-white text-slate-900 rounded-xl p-5 shadow-xl border border-slate-200 font-mono text-xs space-y-3.5 min-h-fit mb-4"
          >
            {/* Topo da Etiqueta */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 border-dashed">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-600" />
                <div>
                  <h4 className="font-bold text-sm text-slate-900 uppercase tracking-wide leading-none">
                    {transportadora}
                  </h4>
                  <span className="text-[10px] text-slate-500 font-semibold">Logística HUBI</span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-mono text-xs font-bold text-slate-900 block">
                  #{pedido.numero_pedido}
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 rounded uppercase">
                  Despacho
                </span>
              </div>
            </div>

            {/* Código de Rastreio / Barras Simulado */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1">
              <div className="h-9 flex items-center justify-center tracking-[4px] font-mono text-lg font-black text-slate-900 select-none">
                ||| | |||| | || |||| | |||
              </div>
              <div className="font-mono text-xs font-bold text-emerald-700 tracking-wider">
                {codigoRastreio}
              </div>
              {pinEntrega && (
                <div className="font-mono text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded inline-block mt-1">
                  PIN: {pinEntrega}
                </div>
              )}
            </div>

            {/* Bloco Destinatário */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 uppercase tracking-wider pb-1 border-b border-slate-200 border-dashed">
                <User className="w-3.5 h-3.5 text-emerald-600" />
                <span>Destinatário</span>
              </div>
              <p className="font-bold text-xs text-slate-900 pt-0.5">
                {clienteNome}
              </p>
              {clienteTelefone && (
                <p className="text-[11px] text-slate-600">
                  Tel: <strong className="text-slate-900">{clienteTelefone}</strong>
                </p>
              )}
              <div className="flex items-start gap-1 pt-1 text-[11px] text-slate-600 leading-snug">
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span className="font-semibold text-slate-900">{enderecoEntrega}</span>
              </div>
            </div>

            {/* Bloco Remetente */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 uppercase tracking-wider pb-1 border-b border-slate-200 border-dashed">
                <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Remetente</span>
              </div>
              <p className="font-bold text-xs text-slate-900 pt-0.5">
                {lojaNome}
              </p>
              {lojaDocumento && (
                <p className="text-[10px] text-slate-900 font-bold">
                  CNPJ/CPF: {lojaDocumento}
                </p>
              )}
              <p className="text-[10px] text-slate-900 font-semibold leading-tight">
                {lojaEndereco}
              </p>
            </div>
          </div>
        </div>

        {/* Footer do Modal Harmonizado com Botões Centralizados */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-900 flex flex-wrap items-center justify-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 text-slate-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 dark:text-white font-bold text-xs shadow-xs transition cursor-pointer active:scale-95"
          >
            Fechar
          </button>

          {!ehAppOuManual && ehMelhorEnvio && (
            <button
              type="button"
              disabled={obtendoEtiquetaOficial}
              onClick={handleAbrirMelhorEnvio}
              className="px-5 py-2.5 rounded-xl bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 text-slate-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 dark:text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {obtendoEtiquetaOficial ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Obtendo...</span>
                </>
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5 text-slate-900 dark:text-white" />
                  <span>Etiqueta Melhor Envio</span>
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleImprimir}
            className="px-6 py-2.5 rounded-xl bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 text-slate-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 dark:text-white font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4 text-slate-900 dark:text-white" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>
    </div>
  );
};
