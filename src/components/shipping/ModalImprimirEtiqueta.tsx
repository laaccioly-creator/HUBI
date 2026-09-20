import React, { useRef } from 'react';
import { X, Printer, Package, Truck, MapPin, Building2, User, Barcode } from 'lucide-react';
import { Pedido, Loja } from '../../types';
import { PedidoEntrega } from '../../types/shipping';

interface ModalImprimirEtiquetaProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  loja: Loja | null;
}

export const ModalImprimirEtiqueta: React.FC<ModalImprimirEtiquetaProps> = ({
  isOpen,
  onClose,
  pedido,
  loja
}) => {
  const etiquetaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !pedido) return null;

  const pe: PedidoEntrega | null =
    (pedido as any).pedido_entregas?.[0] || pedido.pedido_entrega || null;

  const transportadora =
    pe?.transportadora_nome ||
    pe?.servico_correios ||
    pe?.nome_transportadora ||
    'Transportadora Padrão';

  const codigoRastreio =
    pe?.codigo_rastreio ||
    pedido.codigo_rastreio ||
    `PED-${pedido.numero_pedido}`;

  const clienteNome = pedido.cliente?.nome || 'Cliente';
  const clienteTelefone = pedido.cliente?.whatsapp || pedido.cliente?.telefone || '';
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
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90vh]">
        {/* Header do Modal */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-100">
                Etiqueta de Envio • Pedido #{pedido.numero_pedido}
              </h3>
              <p className="text-[11px] text-slate-400">
                Formato padrão para despacho e logística
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Prévia da Etiqueta */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-950 flex justify-center">
          <div
            ref={etiquetaRef}
            className="w-full max-w-sm bg-white text-slate-950 rounded-2xl p-4 sm:p-5 shadow-lg border-2 border-slate-300 space-y-3.5 text-xs select-text font-sans"
          >
            {/* Topo da Etiqueta */}
            <div className="flex items-center justify-between pb-3 border-b-2 border-slate-950">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-slate-900" />
                <div>
                  <h4 className="font-black text-sm uppercase tracking-wide leading-none">
                    {transportadora}
                  </h4>
                  <span className="text-[10px] text-slate-600 font-medium">Logística HUBI</span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-mono text-xs font-bold text-slate-800 block">
                  #{pedido.numero_pedido}
                </span>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded uppercase">
                  Despacho
                </span>
              </div>
            </div>

            {/* Código de Rastreio / Barras Simulado */}
            <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-center space-y-1">
              <div className="h-9 flex items-center justify-center tracking-[4px] font-mono text-lg font-black text-slate-800 select-none">
                ||| | |||| | || |||| | |||
              </div>
              <div className="font-mono text-xs font-bold text-slate-700 tracking-wider">
                {codigoRastreio}
              </div>
            </div>

            {/* Bloco Destinatário */}
            <div className="p-3 bg-slate-100/80 rounded-xl border border-slate-200 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-200">
                <User className="w-3.5 h-3.5 text-slate-700" />
                <span>Destinatário</span>
              </div>
              <p className="font-black text-xs text-slate-950 pt-0.5">
                {clienteNome}
              </p>
              {clienteTelefone && (
                <p className="text-[11px] text-slate-600">
                  Tel: <strong>{clienteTelefone}</strong>
                </p>
              )}
              <div className="flex items-start gap-1 pt-1 text-[11px] text-slate-700 leading-snug">
                <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                <span>{enderecoEntrega}</span>
              </div>
            </div>

            {/* Bloco Remetente */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-200">
                <Building2 className="w-3.5 h-3.5 text-slate-700" />
                <span>Remetente</span>
              </div>
              <p className="font-bold text-xs text-slate-900 pt-0.5">
                {lojaNome}
              </p>
              {lojaDocumento && (
                <p className="text-[10px] text-slate-600">
                  CNPJ/CPF: {lojaDocumento}
                </p>
              )}
              <p className="text-[10px] text-slate-600 leading-tight">
                {lojaEndereco}
              </p>
            </div>
          </div>
        </div>

        {/* Footer do Modal */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handleImprimir}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Etiqueta</span>
          </button>
        </div>
      </div>
    </div>
  );
};
