/**
 * HUBI Print & Receipt Engine
 * Suporta:
 * 1. Impressão Térmica / Bobina (58mm e 80mm) e Folhas A4 / PDF
 * 2. Janela Dedicada de Impressão com Botão de Ação Direta (compatível com iframes e sandboxes)
 * 3. Impressão Bluetooth ESC/POS Direta (Web Bluetooth API)
 * 4. Formatação de Recibo em Texto para WhatsApp
 */

import { Pedido, Loja, ItemPedido } from '../types';

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
      const maxCssWidth = isA4 ? '780px' : is58 ? '320px' : '380px';
      const nomeLoja = loja?.nome_fantasia || 'HUBI PDV';
      const docLoja = loja?.numero_documento ? `CNPJ/CPF: ${loja.numero_documento}` : '';
      const telLoja = (loja?.whatsapp || loja?.telefone) ? `Tel/WhatsApp: ${loja.whatsapp || loja.telefone}` : '';
      const cidLoja = loja?.endereco_cidade ? `${loja.endereco_cidade} - ${loja.endereco_estado || ''}` : '';

      const extras = (loja?.configuracoes_extras as any) || {};
      const configRecibo = extras.recibo || {};
      const cabecalhoCustom = configRecibo.cabecalho ? `<p style="margin: 4px 0; font-size: ${isA4 ? '12px' : '10px'}; font-style: italic; color: #475569;">"${configRecibo.cabecalho}"</p>` : '';
      const rodapeCustom = configRecibo.rodape || 'Obrigado pela preferência!';
      const incluirCliente = configRecibo.adicionar_cliente !== false;

      const itens = (pedido.itens || (pedido as any).itens_pedido || []) as ItemPedido[];
      console.log(`🖨️ [HUBI PrintService] Formatando ${itens.length} itens do pedido #${pedido.numero_pedido}...`);

      const itensHtml = itens.length > 0 ? itens.map(item => `
        <tr style="border-bottom: 1px dashed #e2e8f0;">
          <td style="padding: 5px 0; font-size: ${isA4 ? '13px' : '11px'}; color: #000;">
            <strong>${Number(item.quantidade || 1)}x</strong> ${item.nome_produto || 'Item'}
            ${configRecibo.exibir_codigo_produto && (item as any).codigo_interno ? `<br><span style="color: #64748b; font-size: 9px;">Cód: ${(item as any).codigo_interno}</span>` : ''}
            ${item.rotulo_variacao ? `<br><span style="color: #64748b; font-size: 10px;">(${item.rotulo_variacao})</span>` : ''}
          </td>
          <td style="padding: 5px 0; text-align: right; font-size: ${isA4 ? '13px' : '11px'}; font-weight: bold; color: #000; white-space: nowrap;">
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

      const receiptInnerHtml = `
        <div class="receipt-container" style="
          font-family: ${isA4 ? "'Helvetica Neue', Helvetica, Arial, sans-serif" : "'Courier New', Courier, monospace"};
          color: #000 !important;
          background: #fff !important;
          font-size: ${isA4 ? '13px' : '11px'};
          line-height: 1.35;
          width: 100%;
          max-width: ${maxCssWidth};
          margin: 0 auto;
          padding: ${isA4 ? '20px' : '8px'};
          box-sizing: border-box;
        ">
          <!-- Cabeçalho -->
          <div style="text-align: center; margin-bottom: 8px;">
            <h2 style="margin: 0 0 3px 0; font-size: ${isA4 ? '18px' : '15px'}; text-transform: uppercase; font-weight: 800; color: #000;">
              ${nomeLoja}
            </h2>
            ${docLoja ? `<p style="margin: 2px 0; font-size: ${isA4 ? '12px' : '10px'}; color: #334155;">${docLoja}</p>` : ''}
            ${telLoja ? `<p style="margin: 2px 0; font-size: ${isA4 ? '12px' : '10px'}; color: #334155;">${telLoja}</p>` : ''}
            ${cidLoja ? `<p style="margin: 2px 0; font-size: ${isA4 ? '12px' : '10px'}; color: #334155;">${cidLoja}</p>` : ''}
            ${cabecalhoCustom}
            <p style="margin: 6px 0 0 0; font-size: 10px; font-weight: bold; color: #000; letter-spacing: 0.5px;">*** COMPROVANTE NÃO FISCAL ***</p>
          </div>

          <div style="border-top: 1px dashed #000; margin: 8px 0;"></div>

          <!-- Informações do Pedido -->
          <div style="font-size: ${isA4 ? '12px' : '11px'}; margin-bottom: 6px; color: #000;">
            <div style="display: flex; justify-content: space-between;">
              <span><strong>PEDIDO:</strong> #${pedido.numero_pedido}</span>
              <span style="text-transform: capitalize;"><strong>TABELA:</strong> ${pedido.tabela_preco_aplicada || 'Varejo'}</span>
            </div>
            <div><strong>DATA:</strong> ${new Date(pedido.data_venda || pedido.criado_em || '').toLocaleString('pt-BR')}</div>
            ${incluirCliente && pedido.cliente?.nome ? `<div><strong>CLIENTE:</strong> ${pedido.cliente.nome}</div>` : ''}
            ${incluirCliente && pedido.endereco_entrega ? `<div><strong>ENTREGA:</strong> ${pedido.endereco_entrega}</div>` : ''}
            ${pedido.observacoes ? `<div><strong>OBS:</strong> ${pedido.observacoes}</div>` : ''}
          </div>

          <div style="border-top: 1px dashed #000; margin: 8px 0;"></div>

          <!-- Tabela de Itens -->
          <table style="width: 100%; border-collapse: collapse; margin: 6px 0;">
            <thead>
              <tr style="border-bottom: 1px solid #000; font-size: ${isA4 ? '11px' : '9px'}; text-transform: uppercase;">
                <th style="text-align: left; padding: 3px 0; color: #000;">Item</th>
                <th style="text-align: right; padding: 3px 0; color: #000;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itensHtml}
            </tbody>
          </table>

          <div style="border-top: 1px dashed #000; margin: 8px 0;"></div>

          <!-- Totais -->
          <div style="margin: 6px 0; font-size: ${isA4 ? '13px' : '11px'}; color: #000;">
            <div style="display: flex; justify-content: space-between; margin: 2px 0;">
              <span>Subtotal:</span>
              <span>R$ ${Number(pedido.subtotal || 0).toFixed(2)}</span>
            </div>
            ${Number(pedido.valor_desconto || 0) > 0 ? `
              <div style="display: flex; justify-content: space-between; margin: 2px 0; color: #000;">
                <span>Desconto:</span>
                <span>- R$ ${Number(pedido.valor_desconto).toFixed(2)}</span>
              </div>
            ` : ''}
            ${Number(pedido.valor_frete || 0) > 0 ? `
              <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                <span>Taxa Entrega:</span>
                <span>+ R$ ${Number(pedido.valor_frete).toFixed(2)}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; margin-top: 6px; padding-top: 6px; border-top: 1px solid #000; font-weight: bold; font-size: ${isA4 ? '16px' : '14px'};">
              <span>TOTAL:</span>
              <span>R$ ${Number(pedido.valor_total || 0).toFixed(2)}</span>
            </div>
            ${Number(pedido.saldo_devedor || 0) > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-top: 4px; font-weight: bold; color: #b45309;">
                <span>Saldo Devedor (Fiado):</span>
                <span>R$ ${Number(pedido.saldo_devedor).toFixed(2)}</span>
              </div>
            ` : ''}
          </div>

          <div style="border-top: 1px dashed #000; margin: 8px 0;"></div>

          <!-- Rodapé -->
          <div style="text-align: center; margin-top: 10px; font-size: ${isA4 ? '11px' : '9px'}; color: #64748b;">
            <p style="margin: 2px 0; font-weight: 500;">${rodapeCustom}</p>
            <p style="margin: 2px 0; font-size: 8px;">HUBI • Sistema de Gestão & PDV</p>
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
              color: #000;
              font-family: ${isA4 ? "'Helvetica Neue', Helvetica, Arial, sans-serif" : "'Courier New', Courier, monospace"};
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
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
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
        // Se Bluetooth não estiver disponível, abre o diálogo de impressão padrão na formatação de bobina
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
          '000018f0-0000-1000-8000-00805f9b34fb', // Standard Print Service
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
        // Fallback para impressão via diálogo do navegador
        this.printReceipt(pedido, loja, paperWidth);
        return false;
      }

      // Montar buffer de comandos ESC/POS
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
    text += `${(loja.nome_fantasia || 'HUBI').toUpperCase()}\n`;
    text += '\x1B\x45\x00'; // Bold OFF
    if (loja.telefone || loja.whatsapp) text += `Tel/Whats: ${loja.whatsapp || loja.telefone}\n`;
    if (loja.endereco_cidade) text += `${loja.endereco_cidade} - ${loja.endereco_estado || ''}\n`;
    text += divider;

    text += `PEDIDO #${pedido.numero_pedido}\n`;
    text += `Data: ${new Date(pedido.data_venda || pedido.criado_em || '').toLocaleString('pt-BR')}\n`;
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

    if (Number(pedido.saldo_devedor) > 0) {
      text += `PAGO:                  R$ ${Number(pedido.valor_pago).toFixed(2)}\n`;
      text += `SALDO DEVEDOR (FIADO): R$ ${Number(pedido.saldo_devedor).toFixed(2)}\n`;
    }

    text += divider;
    text += '\x1B\x61\x01'; // Center
    text += 'Obrigado pela preferência!\n\n\n\n';
    text += '\x1D\x56\x41\x10'; // Cut paper command

    return encoder.encode(text);
  }

  /**
   * Formata uma mensagem completa para envio direto ao WhatsApp do cliente
   */
  static generateWhatsAppMessage(pedido: Pedido, loja: Loja): string {
    const itensTexto = pedido.itens
      ? pedido.itens.map((i: ItemPedido) => `▫️ *${i.quantidade}x* ${i.nome_produto} ${i.rotulo_variacao ? `(${i.rotulo_variacao})` : ''} - R$ ${Number(i.subtotal).toFixed(2)}`).join('\n')
      : '';

    return `🛍️ *PEDIDO #${pedido.numero_pedido} - ${loja.nome_fantasia || 'HUBI'}*

Olá, ${pedido.cliente?.nome || 'Cliente'}! Segue o resumo do seu pedido:

${itensTexto}

━━━━━━━━━━━━━━━━━━━━
💰 *Subtotal:* R$ ${Number(pedido.subtotal).toFixed(2)}
${Number(pedido.valor_desconto) > 0 ? `🏷️ *Desconto:* R$ ${Number(pedido.valor_desconto).toFixed(2)}\n` : ''}${Number(pedido.valor_frete) > 0 ? `🛵 *Taxa de Entrega:* R$ ${Number(pedido.valor_frete).toFixed(2)}\n` : ''}💵 *VALOR TOTAL:* R$ ${Number(pedido.valor_total).toFixed(2)}
${Number(pedido.saldo_devedor) > 0 ? `⚠️ *Saldo a Pagar (Fiado):* R$ ${Number(pedido.saldo_devedor).toFixed(2)}\n` : '✅ *Status:* Pagamento Confirmado'}
━━━━━━━━━━━━━━━━━━━━
📍 *Entrega:* ${pedido.endereco_entrega || 'Retirada na loja'}
${pedido.observacoes ? `📝 *Observações:* ${pedido.observacoes}\n` : ''}
Agradecemos a sua preferência! ✨`;
  }

  /**
   * Abre o WhatsApp com a mensagem formatada
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

