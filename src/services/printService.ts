/**
 * HUBI Print & Receipt Engine
 * Suporta:
 * 1. Impressão Térmica / Bobina (58mm e 80mm) e Folhas A4 / PDF (Conforme modelo de recibo)
 * 2. Janela Dedicada de Impressão com Botão de Ação Direta (compatível com iframes e sandboxes)
 * 3. Impressão Bluetooth ESC/POS Direta (Web Bluetooth API)
 * 4. Formatação de Recibo em Texto para WhatsApp e E-mail
 */

import { Pedido, Loja, ItemPedido } from '../types';

export const formatarDataRecibo = (dataIso?: string | null): string => {
  if (!dataIso) return '';
  try {
    const d = new Date(dataIso);
    if (isNaN(d.getTime())) return '';
    const meses = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    const dia = d.getDate();
    const mes = meses[d.getMonth()];
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dia} de ${mes} de ${ano} às ${hora}:${min}`;
  } catch {
    return '';
  }
};

export const formatarVendedorRecibo = (pedido: Pedido): { label: string; valor: string; ehCatalogo: boolean; contato?: string } => {
  const ehCatalogo = pedido.origem === 'catalogo_online';
  if (ehCatalogo) {
    return {
      label: 'Canal / Vendedor',
      valor: 'Catálogo Online',
      ehCatalogo: true
    };
  }

  const nome = pedido.vendedor?.nome_completo 
    || (pedido as any).nome_vendedor 
    || (pedido.origem === 'pdv_mobile' ? 'PDV Mobile' : 'Caixa / Balcão');

  const contato = pedido.vendedor?.whatsapp_atendimento ? `Tel/Whats: ${pedido.vendedor.whatsapp_atendimento}` : undefined;

  return {
    label: 'Vendedor',
    valor: nome,
    ehCatalogo: false,
    contato
  };
};

export const ehPedidoFiado = (pedido: Pedido): boolean => {
  if (!pedido) return false;
  if (Array.isArray(pedido.pagamentos) && pedido.pagamentos.length > 0) {
    const temPagamentoFiado = pedido.pagamentos.some(p => 
      p.eh_pagamento_fiado === true || 
      p.forma_pagamento?.tipo === 'fiado' ||
      p.forma_pagamento?.nome?.toLowerCase().includes('fiado')
    );
    if (temPagamentoFiado) return true;
  }
  const formaStr = String((pedido as any).forma_pagamento || (pedido as any).tipo_pagamento || '').toLowerCase();
  if (formaStr.includes('fiado')) return true;
  return false;
};

export interface InfoPagamentoRecibo {
  foiPago: boolean;
  ehFiado: boolean;
  statusTexto: string;
  totalPago: number;
  pagamentosDetalhados: Array<{
    forma: string;
    origemGateway?: string;
    valor: number;
    parcelas?: number;
    dataPagamento?: string;
  }>;
}

export const obterDadosPagamentoRecibo = (pedido: Pedido): InfoPagamentoRecibo => {
  const ehFiado = ehPedidoFiado(pedido);

  const statusPag = pedido.status_pagamento 
    || (Number(pedido.saldo_devedor) <= 0 && Number(pedido.valor_pago) > 0 ? 'pago' 
    : pedido.status === 'concluido' && (!ehFiado || Number(pedido.saldo_devedor) <= 0) ? 'pago' 
    : 'aguardando_pagamento');

  const foiPago = statusPag === 'pago' || (Number(pedido.saldo_devedor) <= 0 && Number(pedido.valor_pago) > 0);
  const totalPago = Number(pedido.valor_pago || (foiPago ? pedido.valor_total : 0));

  const itensPag: InfoPagamentoRecibo['pagamentosDetalhados'] = [];

  if (Array.isArray(pedido.pagamentos) && pedido.pagamentos.length > 0) {
    for (const p of pedido.pagamentos) {
      let nomeForma = p.forma_pagamento?.nome || 'Pagamento';
      const tipoForma = p.forma_pagamento?.tipo || '';
      const ehMercadoPago = nomeForma.toLowerCase().includes('mercado pago') 
        || tipoForma.toLowerCase().includes('mercado_pago')
        || (pedido.origem === 'catalogo_online' && (tipoForma === 'pix' || tipoForma === 'cartao_credito' || tipoForma === 'cartao_debito' || nomeForma.toLowerCase().includes('pix')));

      let origemGateway: string | undefined = undefined;
      if (ehMercadoPago) {
        origemGateway = 'Mercado Pago';
      } else if (pedido.origem === 'catalogo_online') {
        origemGateway = 'Catálogo Online';
      } else {
        origemGateway = 'PDV / Balcão';
      }

      itensPag.push({
        forma: nomeForma,
        origemGateway,
        valor: Number(p.valor || 0),
        parcelas: p.parcelas && p.parcelas > 1 ? p.parcelas : undefined,
        dataPagamento: p.data_pagamento
      });
    }
  } else if (foiPago) {
    // Fallback caso não haja registro na tabela filha pagamentos_pedido
    const ehCatalogo = pedido.origem === 'catalogo_online';
    itensPag.push({
      forma: ehCatalogo ? 'Mercado Pago Online' : 'Pagamento no Caixa',
      origemGateway: ehCatalogo ? 'Mercado Pago' : 'PDV / Balcão',
      valor: totalPago,
      dataPagamento: pedido.atualizado_em || pedido.data_venda
    });
  }

  return {
    foiPago,
    ehFiado,
    statusTexto: foiPago ? 'PAGO' : 'AGUARDANDO PAGAMENTO',
    totalPago,
    pagamentosDetalhados: itensPag
  };
};

export class PrintService {
  /**
   * Dispara a impressão do recibo formatado abrindo a janela de impressão nativa e/ou popup dedicado
   * (compatível com navegadores desktop, celulares e ambientes embutidos/iframes).
   */
  static printReceipt(pedido: Pedido, loja?: Loja | null, format: '58mm' | '80mm' | 'a4' = '80mm'): void {
    console.log('🖨️ [HUBI PrintService] Início da impressão de recibo:', { format, pedido, loja });

    if (!pedido) {
      console.warn('⚠️ [HUBI PrintService] Pedido inválido ou não fornecido para impressão!');
      return;
    }

    try {
      const isA4 = format === 'a4';
      const is58 = format === '58mm';
      const pageWidth = isA4 ? '210mm' : is58 ? '58mm' : '80mm';
      const maxCssWidth = isA4 ? '680px' : is58 ? '320px' : '380px';
      const nomeLoja = loja?.nome_fantasia || 'HUBI PDV';
      
      // Endereço e telefone da loja formatados
      const enderecoLinha = [
        loja?.endereco_logradouro,
        loja?.endereco_numero,
        loja?.endereco_bairro,
        loja?.endereco_cidade
      ].filter(Boolean).join(', ');

      const telefoneLoja = loja?.whatsapp || loja?.telefone;
      const lojaContatoFormatado = [enderecoLinha, telefoneLoja ? `+55 ${telefoneLoja}` : ''].filter(Boolean).join(' - ');

      // Dados do vendedor / canal de venda (antes do cliente)
      const vendedorInfo = formatarVendedorRecibo(pedido);

      // Dados de pagamento (após o valor total)
      const pagamentoInfo = obterDadosPagamentoRecibo(pedido);

      // Dados do cliente
      const clienteNome = pedido.cliente?.nome || (pedido as any).nome_cliente || 'Cliente';
      const clienteTelefone = pedido.cliente?.whatsapp || pedido.cliente?.telefone;
      const clienteContatoFormatado = clienteTelefone ? (clienteTelefone.startsWith('+') ? clienteTelefone : `+55 ${clienteTelefone}`) : '';

      const itens = (pedido.itens || (pedido as any).itens_pedido || []) as ItemPedido[];
      const totalQuantidade = itens.reduce((acc, item) => acc + Number(item.quantidade || 1), 0);
      const dataFormatada = formatarDataRecibo(pedido.data_venda || pedido.criado_em);

      console.log(`🖨️ [HUBI PrintService] Formatando ${itens.length} itens do pedido #${pedido.numero_pedido}...`);

      const itensHtml = itens.length > 0 ? itens.map(item => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 6px 0; font-size: ${isA4 ? '13px' : '11px'}; color: #1e293b; text-align: left; vertical-align: top;">
            <strong>${Number(item.quantidade || 1)}x</strong> ${item.nome_produto || 'Item'}
            ${item.rotulo_variacao ? ` / ${item.rotulo_variacao}` : ''}
          </td>
          <td style="padding: 6px 0; text-align: right; font-size: ${isA4 ? '13px' : '11px'}; font-weight: 600; color: #1e293b; white-space: nowrap; vertical-align: top;">
            R$ ${Number(item.subtotal || item.preco_venda_unitario || 0).toFixed(2)}
          </td>
        </tr>
      `).join('') : `
        <tr>
          <td colspan="2" style="padding: 8px 0; text-align: center; font-size: 11px; color: #64748b;">
            (Itens não detalhados)
          </td>
        </tr>
      `;

      const logoHtml = loja?.url_logo ? `
        <div style="text-align: center; margin-bottom: 12px;">
          <img src="${loja.url_logo}" alt="${nomeLoja}" style="max-height: ${isA4 ? '60px' : '45px'}; max-width: 200px; object-fit: contain;" />
        </div>
      ` : '';

      const receiptInnerHtml = `
        <div class="receipt-container" style="
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #1e293b !important;
          background: #ffffff !important;
          font-size: ${isA4 ? '13px' : '11px'};
          line-height: 1.4;
          width: 100%;
          max-width: ${maxCssWidth};
          margin: 0 auto;
          padding: ${isA4 ? '35px 25px' : '12px 8px'};
          box-sizing: border-box;
        ">
          <!-- Logo da Loja -->
          ${logoHtml}

          <!-- Título RECIBO # -->
          <div style="text-align: center; margin-bottom: 18px;">
            <h2 style="margin: 0; font-size: ${isA4 ? '20px' : '16px'}; font-weight: 700; color: #334155; letter-spacing: 0.5px;">
              RECIBO #${pedido.numero_pedido}
            </h2>
          </div>

          <!-- Informações da Loja -->
          <div style="margin-bottom: 14px; font-size: ${isA4 ? '13px' : '11px'}; color: #334155;">
            <div style="font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">
              ${nomeLoja}
            </div>
            ${lojaContatoFormatado ? `<div>${lojaContatoFormatado}</div>` : ''}
          </div>

          <!-- Informações do Vendedor / Origem (Antes do Cliente) -->
          <div style="margin-bottom: 12px; font-size: ${isA4 ? '13px' : '11px'}; color: #334155; border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px;">
            <div style="font-size: ${isA4 ? '11px' : '9px'}; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1px;">
              ${vendedorInfo.label}:
            </div>
            <div style="font-weight: 700; color: #0f172a; font-size: ${isA4 ? '14px' : '12px'};">
              ${vendedorInfo.valor}
              ${vendedorInfo.ehCatalogo ? `<span style="font-size: ${isA4 ? '11px' : '9px'}; font-weight: 600; color: #059669; margin-left: 4px;">(Pedido Online)</span>` : ''}
            </div>
            ${vendedorInfo.contato ? `<div style="font-size: ${isA4 ? '11px' : '9px'}; color: #64748b; margin-top: 1px;">${vendedorInfo.contato}</div>` : ''}
          </div>

          <!-- Informações do Cliente -->
          <div style="margin-bottom: 16px; font-size: ${isA4 ? '13px' : '11px'}; color: #334155;">
            <div style="font-size: ${isA4 ? '11px' : '9px'}; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1px;">
              Cliente:
            </div>
            <div style="font-weight: 600; margin-bottom: 2px; color: #0f172a;">
              ${clienteNome}
            </div>
            ${clienteContatoFormatado ? `<div>${clienteContatoFormatado}</div>` : ''}
            ${pedido.endereco_entrega ? `<div style="font-size: ${isA4 ? '12px' : '10px'}; color: #64748b; margin-top: 2px;">Entrega: ${pedido.endereco_entrega}</div>` : ''}
          </div>

          <!-- Resumo de Itens -->
          <div style="font-size: ${isA4 ? '14px' : '12px'}; font-weight: 600; color: #334155; margin-bottom: 4px;">
            ${itens.length} itens (Qtd.: ${totalQuantidade})
          </div>

          <!-- Linha Divisória Superior -->
          <div style="border-top: 1.5px solid #334155; margin: 4px 0 8px 0;"></div>

          <!-- Tabela de Itens -->
          <table style="width: 100%; border-collapse: collapse; margin: 4px 0;">
            <tbody>
              ${itensHtml}
            </tbody>
          </table>

          <!-- Acréscimos / Descontos se houver -->
          ${(Number(pedido.valor_desconto || 0) > 0 || Number(pedido.valor_frete || 0) > 0) ? `
            <div style="margin-top: 8px; padding-top: 6px; font-size: ${isA4 ? '12px' : '11px'}; color: #475569; border-top: 1px dashed #e2e8f0;">
              ${Number(pedido.subtotal || 0) > 0 ? `
                <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                  <span>Subtotal:</span>
                  <span>R$ ${Number(pedido.subtotal).toFixed(2)}</span>
                </div>
              ` : ''}
              ${Number(pedido.valor_desconto || 0) > 0 ? `
                <div style="display: flex; justify-content: space-between; margin: 2px 0; color: #dc2626;">
                  <span>Desconto:</span>
                  <span>- R$ ${Number(pedido.valor_desconto).toFixed(2)}</span>
                </div>
              ` : ''}
              ${Number(pedido.valor_frete || 0) > 0 ? `
                <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                  <span>Taxa de Entrega:</span>
                  <span>+ R$ ${Number(pedido.valor_frete).toFixed(2)}</span>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <!-- Total -->
          <div style="text-align: right; margin: 12px 0 6px 0; font-size: ${isA4 ? '16px' : '14px'}; font-weight: 700; color: #0f172a;">
            Total: R$ ${Number(pedido.valor_total || 0).toFixed(2)}
          </div>

          ${(pagamentoInfo.ehFiado && Number(pedido.saldo_devedor || 0) > 0) ? `
            <div style="text-align: right; margin-bottom: 6px; font-size: ${isA4 ? '13px' : '11px'}; font-weight: 600; color: #b45309;">
              Saldo a Pagar (Fiado): R$ ${Number(pedido.saldo_devedor).toFixed(2)}
            </div>
          ` : ''}

          <!-- Dados do Pagamento (Após o Valor Total) -->
          <div style="
            margin-top: 10px;
            padding: 8px 10px;
            background-color: ${pagamentoInfo.foiPago ? '#f0fdf4' : '#fffbeb'};
            border: 1px solid ${pagamentoInfo.foiPago ? '#bbf7d0' : '#fef3c7'};
            border-radius: 6px;
            font-size: ${isA4 ? '12px' : '10px'};
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; border-bottom: 1px dashed ${pagamentoInfo.foiPago ? '#86efac' : '#fde68a'}; padding-bottom: 4px;">
              <span style="font-weight: 700; color: ${pagamentoInfo.foiPago ? '#166534' : '#92400e'}; text-transform: uppercase; letter-spacing: 0.5px;">
                Status Pagamento:
              </span>
              <span style="font-weight: 800; color: ${pagamentoInfo.foiPago ? '#15803d' : '#b45309'}; background: ${pagamentoInfo.foiPago ? '#dcfce7' : '#fef3c7'}; padding: 1px 6px; border-radius: 4px; font-size: ${isA4 ? '11px' : '9px'};">
                ${pagamentoInfo.foiPago ? '✓ PAGO' : '⏳ AGUARDANDO PAGAMENTO'}
              </span>
            </div>

            ${pagamentoInfo.foiPago ? `
              <div style="margin-top: 4px;">
                ${pagamentoInfo.pagamentosDetalhados.map(pag => `
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin: 3px 0; color: #1e293b;">
                    <div>
                      <span style="font-weight: 600;">Forma:</span> ${pag.forma}${pag.parcelas ? ` (${pag.parcelas}x)` : ''}
                      ${pag.origemGateway ? `<div style="font-size: ${isA4 ? '11px' : '9px'}; color: #0284c7; font-weight: 600;">Origem: ${pag.origemGateway}</div>` : ''}
                    </div>
                    <div style="text-align: right;">
                      <span style="font-weight: 700; color: #0f172a;">R$ ${pag.valor.toFixed(2)}</span>
                    </div>
                  </div>
                `).join('')}

                <div style="display: flex; justify-content: space-between; margin-top: 6px; padding-top: 4px; border-top: 1px solid #bbf7d0; font-weight: 800; color: #166534;">
                  <span>Valor Pago:</span>
                  <span>R$ ${pagamentoInfo.totalPago.toFixed(2)}</span>
                </div>
              </div>
            ` : `
              <div style="color: #92400e; font-size: ${isA4 ? '11px' : '9px'}; margin-top: 2px;">
                Aguardando quitação pelo cliente ou confirmação de pagamento.
              </div>
            `}
          </div>

          <!-- Linha Divisória Inferior -->
          <div style="border-top: 1.5px solid #334155; margin: 8px 0 14px 0;"></div>

          <!-- Data e Hora por Extenso -->
          <div style="text-align: center; font-size: ${isA4 ? '12px' : '10px'}; color: #64748b; font-weight: 400;">
            ${dataFormatada}
          </div>
        </div>
      `;

      // 1. Atualizar container local do DOM para window.print() direto
      let printContainer = document.getElementById('hubi-print-container');
      if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'hubi-print-container';
        document.body.appendChild(printContainer);
      }
      printContainer.innerHTML = receiptInnerHtml;

      // 2. Montar documento HTML completo para nova janela / popup
      const fullDocHtml = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Recibo Pedido #${pedido.numero_pedido} - ${nomeLoja}</title>
          <style>
            @page {
              size: ${pageWidth} auto;
              margin: ${isA4 ? '10mm' : '2mm'};
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              margin: 0;
              padding: 0;
              background: #f1f5f9;
              color: #1e293b;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            }
            .action-bar {
              position: sticky;
              top: 0;
              left: 0;
              right: 0;
              background: #0f172a;
              color: #fff;
              padding: 12px 16px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              z-index: 1000;
              font-family: sans-serif;
            }
            .btn {
              padding: 8px 16px;
              border-radius: 8px;
              font-weight: bold;
              font-size: 13px;
              border: none;
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              gap: 6px;
            }
            .btn-primary {
              background: #10b981;
              color: #fff;
            }
            .btn-primary:hover {
              background: #059669;
            }
            .btn-secondary {
              background: #334155;
              color: #f8fafc;
            }
            .btn-secondary:hover {
              background: #475569;
            }
            .paper-wrapper {
              background: #fff;
              max-width: ${maxCssWidth};
              margin: 20px auto;
              box-shadow: 0 4px 20px rgba(0,0,0,0.08);
              border-radius: 8px;
              overflow: hidden;
            }
            @media print {
              .action-bar {
                display: none !important;
              }
              body {
                background: #fff !important;
              }
              .paper-wrapper {
                box-shadow: none !important;
                margin: 0 !important;
                max-width: 100% !important;
                border-radius: 0 !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="action-bar">
            <span style="font-size: 13px; font-weight: 600;">Recibo Pedido #${pedido.numero_pedido}</span>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-primary" onclick="window.print()">
                🖨️ Imprimir / Salvar PDF
              </button>
              <button class="btn btn-secondary" onclick="window.close()">
                ✕ Fechar
              </button>
            </div>
          </div>

          <div class="paper-wrapper">
            ${receiptInnerHtml}
          </div>

          <script>
            // Disparar impressão automaticamente ao carregar
            window.addEventListener('load', function() {
              setTimeout(function() {
                window.focus();
                window.print();
              }, 300);
            });
          </script>
        </body>
        </html>
      `;

      // 3. Tentar abrir Popup dedicado (garante compatibilidade 100% mesmo dentro de iframes)
      let popupWin: Window | null = null;
      try {
        const popupWidth = isA4 ? 800 : 420;
        const popupHeight = 700;
        const left = Math.max(0, (window.screen.width - popupWidth) / 2);
        const top = Math.max(0, (window.screen.height - popupHeight) / 2);
        popupWin = window.open('', '_blank', `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`);
        
        if (popupWin && popupWin.document) {
          popupWin.document.open();
          popupWin.document.write(fullDocHtml);
          popupWin.document.close();
          console.log('✅ [HUBI PrintService] Janela popup de recibo aberta com sucesso.');
          return;
        }
      } catch (popErr) {
        console.warn('⚠️ [HUBI PrintService] Bloqueio ao abrir popup, disparando fallback no container da página:', popErr);
      }

      // 4. Fallback caso popup seja restrito: dispara window.print() na página atual
      console.log('🖨️ [HUBI PrintService] Disparando window.print() na janela principal...');
      window.print();
    } catch (err) {
      console.error('❌ [HUBI PrintService] Erro ao executar impressão:', err);
      alert(`Não foi possível abrir a impressão: ${err}`);
    }
  }

  /**
   * Conecta a uma impressora térmica Bluetooth via Web Bluetooth API e envia comandos ESC/POS
   */
  static async printBluetoothThermal(pedido: Pedido, loja: Loja, paperWidth: '58mm' | '80mm' = '58mm'): Promise<boolean> {
    try {
      if (!('bluetooth' in navigator)) {
        this.printReceipt(pedido, loja, paperWidth);
        return true;
      }

      const nav = navigator as unknown as {
        bluetooth: {
          requestDevice: (options: { acceptAllDevices?: boolean; optionalServices?: string[] }) => Promise<{
            gatt?: {
              connect: () => Promise<{
                getPrimaryServices: () => Promise<Array<{
                  getCharacteristics: () => Promise<Array<{
                    properties: { write: boolean; writeWithoutResponse: boolean };
                    writeValue: (data: Uint8Array) => Promise<void>;
                    writeValueWithoutResponse?: (data: Uint8Array) => Promise<void>;
                  }>>;
                }>>;
              }>;
            };
          }>;
        };
      };

      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455'
        ]
      });

      if (!device.gatt) return false;
      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();
      
      let writeChar: { writeValue: (data: Uint8Array) => Promise<void>; writeValueWithoutResponse?: (data: Uint8Array) => Promise<void> } | null = null;
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            writeChar = char;
            break;
          }
        }
        if (writeChar) break;
      }

      if (!writeChar) {
        this.printReceipt(pedido, loja, paperWidth);
        return false;
      }

      const escPosCommands = this.generateEscPosBuffer(pedido, loja, paperWidth);
      
      const chunkSize = 100;
      for (let i = 0; i < escPosCommands.length; i += chunkSize) {
        const chunk = escPosCommands.slice(i, i + chunkSize);
        if (writeChar.writeValueWithoutResponse) {
          await writeChar.writeValueWithoutResponse(chunk);
        } else {
          await writeChar.writeValue(chunk);
        }
      }

      return true;
    } catch (err) {
      console.warn('Bluetooth indisponível ou cancelado, acionando impressão nativa do navegador:', err);
      this.printReceipt(pedido, loja, paperWidth);
      return false;
    }
  }

  /**
   * Gera o buffer de bytes ESC/POS com cabeçalho, itens, totais e corte de papel
   */
  private static generateEscPosBuffer(pedido: Pedido, loja: Loja, paperWidth: '58mm' | '80mm'): Uint8Array {
    const encoder = new TextEncoder();
    const cols = paperWidth === '58mm' ? 32 : 48;
    const divider = '-'.repeat(cols) + '\n';
    
    let text = '';
    text += '\x1B\x61\x01'; // Align Center
    text += '\x1B\x45\x01'; // Bold ON
    text += `RECIBO #${pedido.numero_pedido}\n`;
    text += `${(loja.nome_fantasia || 'HUBI').toUpperCase()}\n`;
    text += '\x1B\x45\x00'; // Bold OFF
    if (loja.telefone || loja.whatsapp) text += `Tel/Whats: ${loja.whatsapp || loja.telefone}\n`;
    if (loja.endereco_cidade) text += `${loja.endereco_cidade} - ${loja.endereco_estado || ''}\n`;
    text += divider;

    const vendedorInfo = formatarVendedorRecibo(pedido);
    text += `Vendedor: ${vendedorInfo.valor}\n`;
    if (pedido.cliente?.nome) text += `Cliente: ${pedido.cliente.nome}\n`;
    text += divider;

    text += '\x1B\x61\x00'; // Align Left
    text += 'ITEM               QTD   VALOR\n';
    text += divider;

    if (pedido.itens) {
      for (const item of pedido.itens) {
        const itemLine = `${item.nome_produto} ${item.rotulo_variacao ? `(${item.rotulo_variacao})` : ''}`.slice(0, cols - 16);
        const qtyAndVal = `${item.quantidade}x R$${Number(item.preco_venda_unitario).toFixed(2)}`;
        text += `${itemLine}\n  ${qtyAndVal} = R$${Number(item.subtotal).toFixed(2)}\n`;
      }
    }
    text += divider;

    text += `Subtotal:              R$ ${Number(pedido.subtotal).toFixed(2)}\n`;
    if (Number(pedido.valor_desconto) > 0) text += `Desconto:            - R$ ${Number(pedido.valor_desconto).toFixed(2)}\n`;
    if (Number(pedido.valor_frete) > 0) text += `Taxa de Entrega:     + R$ ${Number(pedido.valor_frete).toFixed(2)}\n`;
    text += '\x1B\x45\x01'; // Bold ON
    text += `TOTAL:                 R$ ${Number(pedido.valor_total).toFixed(2)}\n`;
    text += '\x1B\x45\x00'; // Bold OFF

    const pagamentoInfo = obterDadosPagamentoRecibo(pedido);

    if (pagamentoInfo.ehFiado && Number(pedido.saldo_devedor) > 0) {
      text += `SALDO A PAGAR (FIADO): R$ ${Number(pedido.saldo_devedor).toFixed(2)}\n`;
    }

    text += divider;
    if (pagamentoInfo.foiPago) {
      text += '\x1B\x45\x01'; // Bold ON
      text += 'PAGAMENTO: [PAGO]\n';
      text += '\x1B\x45\x00'; // Bold OFF
      for (const pag of pagamentoInfo.pagamentosDetalhados) {
        const gw = pag.origemGateway ? ` (${pag.origemGateway})` : '';
        const parc = pag.parcelas ? ` [${pag.parcelas}x]` : '';
        text += `> ${pag.forma}${parc}${gw}: R$ ${pag.valor.toFixed(2)}\n`;
      }
      text += `Total Pago: R$ ${pagamentoInfo.totalPago.toFixed(2)}\n`;
    } else {
      text += 'PAGAMENTO: [AGUARDANDO PAGAMENTO]\n';
    }

    text += divider;
    text += '\x1B\x61\x01'; // Center
    text += `${formatarDataRecibo(pedido.data_venda || pedido.criado_em)}\n\n\n`;
    text += '\x1D\x56\x41\x10'; // Cut paper command

    return encoder.encode(text);
  }

  /**
   * Formata o corpo do e-mail com base no modelo de recibo
   */
  static generateEmailBody(pedido: Pedido, loja?: Loja | null): string {
    const nomeLoja = loja?.nome_fantasia || 'HUBI';
    const itens = (pedido.itens || (pedido as any).itens_pedido || []) as ItemPedido[];
    const totalQtd = itens.reduce((acc, i) => acc + Number(i.quantidade || 1), 0);
    const dataFormatada = formatarDataRecibo(pedido.data_venda || pedido.criado_em);
    const clienteNome = pedido.cliente?.nome || (pedido as any).nome_cliente || 'Cliente';
    const vendedorInfo = formatarVendedorRecibo(pedido);
    const pagamentoInfo = obterDadosPagamentoRecibo(pedido);

    const linhasItens = itens.map(i =>
      `${Number(i.quantidade || 1)}x ${i.nome_produto}${i.rotulo_variacao ? ` / ${i.rotulo_variacao}` : ''}  -  R$ ${Number(i.subtotal || 0).toFixed(2)}`
    ).join('\n');

    let pagStr = '';
    if (pagamentoInfo.foiPago) {
      pagStr = `\nSTATUS DO PAGAMENTO: PAGO\n` +
        pagamentoInfo.pagamentosDetalhados.map(p =>
          `Forma: ${p.forma}${p.parcelas ? ` (${p.parcelas}x)` : ''}${p.origemGateway ? ` (Origem: ${p.origemGateway})` : ''} - Valor Pago: R$ ${p.valor.toFixed(2)}`
        ).join('\n') +
        `\nValor Total Pago: R$ ${pagamentoInfo.totalPago.toFixed(2)}\n`;
    } else {
      pagStr = `\nSTATUS DO PAGAMENTO: AGUARDANDO PAGAMENTO\n`;
    }

    return `RECIBO #${pedido.numero_pedido}\n\n` +
      `${nomeLoja.toUpperCase()}\n` +
      (loja?.whatsapp ? `WhatsApp: +55 ${loja.whatsapp}\n` : '') +
      (loja?.endereco_cidade ? `Local: ${loja.endereco_cidade}\n` : '') +
      `\nVendedor: ${vendedorInfo.valor}\n` +
      `Cliente: ${clienteNome}\n` +
      (pedido.cliente?.whatsapp ? `Contato: +55 ${pedido.cliente.whatsapp}\n` : '') +
      `\n${itens.length} itens (Qtd.: ${totalQtd})\n` +
      `--------------------------------------------------\n` +
      linhasItens + `\n` +
      `--------------------------------------------------\n` +
      (Number(pedido.valor_desconto) > 0 ? `Desconto: - R$ ${Number(pedido.valor_desconto).toFixed(2)}\n` : '') +
      (Number(pedido.valor_frete) > 0 ? `Taxa Entrega: + R$ ${Number(pedido.valor_frete).toFixed(2)}\n` : '') +
      `Total: R$ ${Number(pedido.valor_total).toFixed(2)}\n` +
      (pagamentoInfo.ehFiado && Number(pedido.saldo_devedor) > 0 ? `Saldo a Pagar (Fiado): R$ ${Number(pedido.saldo_devedor).toFixed(2)}\n` : '') +
      pagStr +
      `--------------------------------------------------\n` +
      `${dataFormatada}\n\n` +
      `Obrigado pela preferência!`;
  }

  /**
   * Abre o cliente de e-mail do usuário para enviar o recibo
   */
  static openEmail(pedido: Pedido, loja?: Loja | null): void {
    const emailDestino = pedido.cliente?.email || '';
    const assunto = `Recibo Pedido #${pedido.numero_pedido} - ${loja?.nome_fantasia || 'HUBI'}`;
    const corpo = this.generateEmailBody(pedido, loja);
    const mailtoUrl = `mailto:${emailDestino}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
    window.open(mailtoUrl, '_blank');
  }

  /**
   * Formata uma mensagem completa para envio direto ao WhatsApp do cliente
   */
  static generateWhatsAppMessage(pedido: Pedido, loja: Loja): string {
    const itens = (pedido.itens || (pedido as any).itens_pedido || []) as ItemPedido[];
    const totalQtd = itens.reduce((acc, i) => acc + Number(i.quantidade || 1), 0);
    const dataFormatada = formatarDataRecibo(pedido.data_venda || pedido.criado_em);
    const vendedorInfo = formatarVendedorRecibo(pedido);
    const pagamentoInfo = obterDadosPagamentoRecibo(pedido);

    const itensTexto = itens
      ? itens.map((i: ItemPedido) => `▫️ *${i.quantidade}x* ${i.nome_produto} ${i.rotulo_variacao ? `(${i.rotulo_variacao})` : ''} - R$ ${Number(i.subtotal).toFixed(2)}`).join('\n')
      : '';

    let pagWhatsApp = '';
    if (pagamentoInfo.foiPago) {
      const detalhes = pagamentoInfo.pagamentosDetalhados.map(p =>
        `💳 *Forma:* ${p.forma}${p.parcelas ? ` (${p.parcelas}x)` : ''}${p.origemGateway ? ` _[Origem: ${p.origemGateway}]_` : ''}\n💰 *Valor Pago:* R$ ${p.valor.toFixed(2)}`
      ).join('\n');
      pagWhatsApp = `\n✅ *Status do Pagamento:* PAGO\n${detalhes}\n💵 *Total Quitado:* R$ ${pagamentoInfo.totalPago.toFixed(2)}\n`;
    } else {
      pagWhatsApp = `\n⏳ *Status do Pagamento:* AGUARDANDO PAGAMENTO\n`;
    }

    return `🧾 *RECIBO #${pedido.numero_pedido} - ${loja.nome_fantasia || 'HUBI'}*

*${loja.nome_fantasia || 'HUBI'}*
${loja.whatsapp ? `Tel/Whats: +55 ${loja.whatsapp}` : ''}

👤 *Vendedor:* ${vendedorInfo.valor}
👤 *Cliente:* ${pedido.cliente?.nome || 'Cliente'}
${pedido.cliente?.whatsapp ? `Tel: +55 ${pedido.cliente.whatsapp}` : ''}

*${itens.length} itens (Qtd.: ${totalQtd})*
━━━━━━━━━━━━━━━━━━━━
${itensTexto}
━━━━━━━━━━━━━━━━━━━━
${Number(pedido.valor_desconto) > 0 ? `🏷️ *Desconto:* - R$ ${Number(pedido.valor_desconto).toFixed(2)}\n` : ''}${Number(pedido.valor_frete) > 0 ? `🛵 *Taxa de Entrega:* + R$ ${Number(pedido.valor_frete).toFixed(2)}\n` : ''}💵 *TOTAL:* R$ ${Number(pedido.valor_total).toFixed(2)}
${pagamentoInfo.ehFiado && Number(pedido.saldo_devedor) > 0 ? `⚠️ *Saldo a Pagar (Fiado):* R$ ${Number(pedido.saldo_devedor).toFixed(2)}\n` : ''}${pagWhatsApp}━━━━━━━━━━━━━━━━━━━━
${dataFormatada}

Agradecemos a sua preferência! ✨`;
  }

  /**
   * Dispara a impressão do Relatório de Fechamento de Caixa
   */
  static printFechamentoCaixa(dados: any, loja?: Loja | null, format: '58mm' | '80mm' | 'a4' = '80mm'): void {
    if (!dados) return;

    try {
      const isA4 = format === 'a4';
      const is58 = format === '58mm';
      const pageWidth = isA4 ? '210mm' : is58 ? '58mm' : '80mm';
      const maxCssWidth = isA4 ? '680px' : is58 ? '320px' : '380px';
      const nomeLoja = loja?.nome_fantasia || 'HUBI PDV';
      const formatMoeda = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const dtAbertura = dados.dataAbertura ? new Date(dados.dataAbertura).toLocaleString('pt-BR') : '-';
      const dtFechamento = dados.dataFechamento ? new Date(dados.dataFechamento).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');

      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background: #ffffff; font-size: ${isA4 ? '13px' : '11px'}; line-height: 1.4; padding: ${isA4 ? '30px' : '10px 6px'}; max-width: ${maxCssWidth}; margin: 0 auto;">
          <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;">
            <h2 style="margin: 0; font-size: ${isA4 ? '18px' : '14px'}; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px;">${nomeLoja}</h2>
            <h3 style="margin: 3px 0 0 0; font-size: ${isA4 ? '14px' : '12px'}; font-weight: 700; color: #334155;">FECHAMENTO DE CAIXA</h3>
          </div>

          <table style="width: 100%; font-size: ${isA4 ? '12px' : '10px'}; margin-bottom: 10px; border-collapse: collapse;">
            <tr>
              <td style="padding: 2px 0;"><strong>Caixa Nº:</strong> ${dados.caixaNumero}</td>
              <td style="padding: 2px 0; text-align: right;"><strong>Turno:</strong> ${dados.turno}</td>
            </tr>
            <tr>
              <td style="padding: 2px 0;" colspan="2"><strong>Operador:</strong> ${dados.operadorNome}</td>
            </tr>
            <tr>
              <td style="padding: 2px 0;" colspan="2"><strong>Abertura:</strong> ${dtAbertura}</td>
            </tr>
            <tr>
              <td style="padding: 2px 0;" colspan="2"><strong>Fechamento:</strong> ${dtFechamento}</td>
            </tr>
          </table>

          <div style="border-top: 1px dashed #64748b; margin: 8px 0;"></div>
          <div style="font-weight: 700; font-size: ${isA4 ? '13px' : '11px'}; text-transform: uppercase; margin-bottom: 6px;">Vendas por Meio de Pagamento</div>
          <table style="width: 100%; border-collapse: collapse; font-size: ${isA4 ? '12px' : '10px'};">
            <thead>
              <tr style="border-bottom: 1px solid #cbd5e1; text-align: left; color: #475569;">
                <th style="padding: 4px 0;">Forma</th>
                <th style="padding: 4px 0; text-align: center;">Qtd</th>
                <th style="padding: 4px 0; text-align: right;">Total (R$)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style="padding: 3px 0;">Dinheiro</td><td style="text-align: center;">${dados.qtdDinheiro || 0}</td><td style="text-align: right; font-weight: 600;">R$ ${formatMoeda(dados.vendasDinheiro)}</td></tr>
              <tr><td style="padding: 3px 0;">Pix</td><td style="text-align: center;">${dados.qtdPix || 0}</td><td style="text-align: right; font-weight: 600;">R$ ${formatMoeda(dados.vendasPix)}</td></tr>
              <tr><td style="padding: 3px 0;">Cartão de Débito</td><td style="text-align: center;">${dados.qtdDebito || 0}</td><td style="text-align: right; font-weight: 600;">R$ ${formatMoeda(dados.vendasDebito)}</td></tr>
              <tr><td style="padding: 3px 0;">Cartão de Crédito</td><td style="text-align: center;">${dados.qtdCredito || 0}</td><td style="text-align: right; font-weight: 600;">R$ ${formatMoeda(dados.vendasCredito)}</td></tr>
              <tr style="border-top: 1.5px solid #0f172a; font-weight: 800;">
                <td style="padding: 4px 0;">TOTAL FATURADO</td>
                <td style="text-align: center;">${dados.totalQtdVendas || 0}</td>
                <td style="text-align: right;">R$ ${formatMoeda(dados.totalBruto)}</td>
              </tr>
            </tbody>
          </table>

          <div style="border-top: 1px dashed #64748b; margin: 8px 0;"></div>
          <div style="font-weight: 700; font-size: ${isA4 ? '13px' : '11px'}; text-transform: uppercase; margin-bottom: 6px;">Movimentação da Gaveta (Dinheiro)</div>
          <table style="width: 100%; border-collapse: collapse; font-size: ${isA4 ? '12px' : '10px'};">
            <tr><td style="padding: 2px 0;">(+) Fundo de Troco Inicial:</td><td style="text-align: right; font-weight: 600;">R$ ${formatMoeda(dados.fundoInicial)}</td></tr>
            <tr><td style="padding: 2px 0;">(+) Vendas em Dinheiro:</td><td style="text-align: right; font-weight: 600;">R$ ${formatMoeda(dados.vendasDinheiro)}</td></tr>
            <tr><td style="padding: 2px 0;">(+) Suprimentos Extras:</td><td style="text-align: right; font-weight: 600;">R$ ${formatMoeda(dados.suprimentos)}</td></tr>
            <tr><td style="padding: 2px 0;">(-) Sangrias (Retiradas):</td><td style="text-align: right; font-weight: 600; color: #b91c1c;">- R$ ${formatMoeda(dados.sangrias)}</td></tr>
            <tr><td style="padding: 2px 0;">(-) Despesas Pagas no Caixa:</td><td style="text-align: right; font-weight: 600; color: #b91c1c;">- R$ ${formatMoeda(dados.despesasCaixa)}</td></tr>
            <tr style="border-top: 1px solid #cbd5e1; font-weight: 700;">
              <td style="padding: 4px 0;">(=) Saldo Esperado em Gaveta:</td>
              <td style="text-align: right;">R$ ${formatMoeda(dados.saldoEsperadoGaveta)}</td>
            </tr>
            <tr style="font-weight: 700;">
              <td style="padding: 2px 0;">Valor Declarado / Contado:</td>
              <td style="text-align: right;">R$ ${formatMoeda(dados.valorContado)}</td>
            </tr>
            <tr style="border-top: 1.5px solid #0f172a; font-weight: 800;">
              <td style="padding: 4px 0;">DIFERENÇA (QUEBRA/SOBRA):</td>
              <td style="text-align: right; color: ${dados.diferenca < 0 ? '#b91c1c' : dados.diferenca > 0 ? '#047857' : '#0f172a'};">
                R$ ${formatMoeda(dados.diferenca)} (${dados.situacaoTexto || (dados.diferenca === 0 ? 'Conferido' : dados.diferenca > 0 ? 'Sobra' : 'Falta')})
              </td>
            </tr>
          </table>

          ${dados.observacoes ? `
            <div style="border-top: 1px dashed #64748b; margin: 8px 0;"></div>
            <div style="font-size: ${isA4 ? '11px' : '9.5px'}; color: #475569;">
              <strong>Obs:</strong> ${dados.observacoes}
            </div>
          ` : ''}

          <div style="border-top: 1px dashed #64748b; margin: 16px 0 10px 0;"></div>
          <div style="text-align: center; margin-top: 24px; font-size: ${isA4 ? '11px' : '9px'}; color: #475569;">
            <div style="margin-bottom: 20px;">_________________________________________<br/>Assinatura do Operador</div>
            <div>_________________________________________<br/>Assinatura do Supervisor</div>
          </div>
        </div>
      `;

      const fullDocHtml = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Fechamento de Caixa #${dados.caixaNumero} - ${nomeLoja}</title>
          <style>
            @page { size: ${pageWidth} auto; margin: ${isA4 ? '10mm' : '2mm'}; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { margin: 0; padding: 0; background: #f1f5f9; color: #1e293b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
            .action-bar { position: sticky; top: 0; left: 0; right: 0; background: #0f172a; color: #fff; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; }
            .btn { padding: 8px 16px; border-radius: 8px; font-weight: bold; font-size: 13px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
            .btn-primary { background: #10b981; color: #fff; }
            .btn-primary:hover { background: #059669; }
            .btn-secondary { background: #334155; color: #f8fafc; }
            .paper-wrapper { background: #fff; max-width: ${maxCssWidth}; margin: 20px auto; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border-radius: 8px; overflow: hidden; }
            @media print {
              .action-bar { display: none !important; }
              body { background: #fff !important; }
              .paper-wrapper { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; border-radius: 0 !important; }
            }
          </style>
        </head>
        <body>
          <div class="action-bar">
            <span style="font-size: 13px; font-weight: 600;">Fechamento de Caixa #${dados.caixaNumero}</span>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
              <button class="btn btn-secondary" onclick="window.close()">✕ Fechar</button>
            </div>
          </div>
          <div class="paper-wrapper">${htmlContent}</div>
          <script>
            window.addEventListener('load', function() {
              setTimeout(function() { window.focus(); window.print(); }, 300);
            });
          </script>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank', 'width=600,height=750');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(fullDocHtml);
        printWindow.document.close();
      } else {
        // Fallback para iframe invisível se popup for bloqueado
        let iframe = document.getElementById('hubi-print-iframe') as HTMLIFrameElement;
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = 'hubi-print-iframe';
          iframe.style.position = 'fixed';
          iframe.style.right = '0';
          iframe.style.bottom = '0';
          iframe.style.width = '0';
          iframe.style.height = '0';
          iframe.style.border = '0';
          document.body.appendChild(iframe);
        }
        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) {
          doc.open();
          doc.write(fullDocHtml);
          doc.close();
          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          }, 400);
        }
      }
    } catch (err) {
      console.error('Erro ao imprimir fechamento de caixa:', err);
    }
  }

  /**
   * Formata uma mensagem completa para envio direto ao WhatsApp do cliente
   */
  static openWhatsApp(phone: string, message: string): void {
    const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
    const formattedPhone = cleanPhone ? (cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`) : '';
    const url = formattedPhone
      ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  /**
   * Dispara a impressão nativa do navegador
   */
  static printWindow(): void {
    window.print();
  }
}
