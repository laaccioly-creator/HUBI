/**
 * HUBI Print & Receipt Engine
 * Suporta:
 * 1. Impressão Térmica / Bobina (58mm e 80mm) e Folhas A4 / PDF via Diálogo Nativo do Navegador
 * 2. Impressão Bluetooth ESC/POS Direta (Web Bluetooth API)
 * 3. Formatação de Recibo em Texto para WhatsApp
 */

import { Pedido, Loja, ItemPedido } from '../types';

export class PrintService {
  /**
   * Dispara a impressão do recibo formatado abrindo a janela padrão de escolha de impressora do navegador
   * (permite escolher impressora térmica bobina, A4 convencional ou Salvar como PDF).
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
      const nomeLoja = loja?.nome_fantasia || 'HUBI PDV';
      const docLoja = loja?.numero_documento ? `CNPJ/CPF: ${loja.numero_documento}` : '';
      const telLoja = (loja?.whatsapp || loja?.telefone) ? `Tel/WhatsApp: ${loja.whatsapp || loja.telefone}` : '';
      const cidLoja = loja?.endereco_cidade ? `${loja.endereco_cidade} - ${loja.endereco_estado || ''}` : '';

      const itens = (pedido.itens || (pedido as any).itens_pedido || []) as ItemPedido[];
      console.log(`🖨️ [HUBI PrintService] Formatando ${itens.length} itens do pedido #${pedido.numero_pedido}...`);

      const itensHtml = itens.length > 0 ? itens.map(item => `
        <tr style="border-bottom: 1px dashed #ddd;">
          <td style="padding: 4px 0; font-size: ${isA4 ? '13px' : '11px'};">
            <strong>${Number(item.quantidade || 1)}x</strong> ${item.nome_produto || 'Item'}
            ${item.rotulo_variacao ? `<br><small style="color: #555;">(${item.rotulo_variacao})</small>` : ''}
          </td>
          <td style="padding: 4px 0; text-align: right; font-size: ${isA4 ? '13px' : '11px'}; white-space: nowrap;">
            R$ ${Number(item.subtotal || item.preco_venda_unitario || 0).toFixed(2)}
          </td>
        </tr>
      `).join('') : `
        <tr>
          <td colspan="2" style="padding: 8px 0; text-align: center; font-size: 11px; color: #666;">
            (Itens não detalhados)
          </td>
        </tr>
      `;

      // 1. Obter ou criar o container de impressão no DOM principal
      let printContainer = document.getElementById('hubi-print-container');
      if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'hubi-print-container';
        document.body.appendChild(printContainer);
        console.log('🖨️ [HUBI PrintService] Elemento #hubi-print-container criado no DOM.');
      }

      // 2. Injetar regra @page para o tamanho do papel selecionado
      let styleTag = document.getElementById('hubi-print-style') as HTMLStyleElement;
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'hubi-print-style';
        document.head.appendChild(styleTag);
      }

      if (isA4) {
        styleTag.innerHTML = `
          @media print {
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
          }
        `;
      } else {
        const w = is58 ? '58mm' : '80mm';
        styleTag.innerHTML = `
          @media print {
            @page {
              size: ${w} auto;
              margin: 2mm;
            }
          }
        `;
      }

      // 3. Montar HTML estilizado do recibo
      printContainer.innerHTML = `
        <div style="
          font-family: ${isA4 ? "'Helvetica Neue', Helvetica, Arial, sans-serif" : "'Courier New', Courier, monospace"};
          color: #000 !important;
          background: #fff !important;
          font-size: ${isA4 ? '13px' : '11px'};
          line-height: 1.3;
          width: 100%;
          max-width: ${isA4 ? '100%' : is58 ? '58mm' : '80mm'};
          margin: 0 auto;
          padding: ${isA4 ? '10px' : '2px'};
        ">
          <div style="text-align: center; margin-bottom: 6px;">
            <h2 style="margin: 0 0 2px 0; font-size: ${isA4 ? '18px' : '14px'}; text-transform: uppercase; font-weight: bold;">
              ${nomeLoja}
            </h2>
            ${docLoja ? `<p style="margin: 1px 0; font-size: ${isA4 ? '12px' : '10px'};">${docLoja}</p>` : ''}
            ${telLoja ? `<p style="margin: 1px 0; font-size: ${isA4 ? '12px' : '10px'};">${telLoja}</p>` : ''}
            ${cidLoja ? `<p style="margin: 1px 0; font-size: ${isA4 ? '12px' : '10px'};">${cidLoja}</p>` : ''}
            <p style="margin: 4px 0 0 0; font-size: 10px; font-weight: bold;">*** COMPROVANTE NÃO FISCAL ***</p>
          </div>

          <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>

          <div style="font-size: ${isA4 ? '12px' : '10px'}; margin-bottom: 6px;">
            <div><strong>PEDIDO:</strong> #${pedido.numero_pedido}</div>
            <div><strong>DATA:</strong> ${new Date(pedido.data_venda || pedido.criado_em || '').toLocaleString('pt-BR')}</div>
            ${pedido.cliente?.nome ? `<div><strong>CLIENTE:</strong> ${pedido.cliente.nome}</div>` : ''}
            ${pedido.endereco_entrega ? `<div><strong>ENTREGA:</strong> ${pedido.endereco_entrega}</div>` : ''}
            ${pedido.observacoes ? `<div><strong>OBS:</strong> ${pedido.observacoes}</div>` : ''}
          </div>

          <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>

          <table style="width: 100%; border-collapse: collapse; margin: 6px 0;">
            <thead>
              <tr style="border-bottom: 1px solid #000; font-size: ${isA4 ? '11px' : '9px'}; text-transform: uppercase;">
                <th style="text-align: left; padding: 2px 0;">Item</th>
                <th style="text-align: right; padding: 2px 0;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itensHtml}
            </tbody>
          </table>

          <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>

          <div style="margin: 6px 0; font-size: ${isA4 ? '13px' : '11px'};">
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
            <div style="display: flex; justify-content: space-between; margin-top: 4px; padding-top: 4px; border-top: 1px solid #000; font-weight: bold; font-size: ${isA4 ? '15px' : '13px'};">
              <span>TOTAL:</span>
              <span>R$ ${Number(pedido.valor_total || 0).toFixed(2)}</span>
            </div>
            ${Number(pedido.saldo_devedor || 0) > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-top: 3px; font-weight: bold;">
                <span>Saldo Devedor (Fiado):</span>
                <span>R$ ${Number(pedido.saldo_devedor).toFixed(2)}</span>
              </div>
            ` : ''}
          </div>

          <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>

          <div style="text-align: center; margin-top: 8px; font-size: ${isA4 ? '11px' : '9px'}; color: #555;">
            <p style="margin: 2px 0;">Obrigado pela preferência!</p>
            <p style="margin: 2px 0; font-size: 8px;">HUBI • Gestão & PDV</p>
          </div>
        </div>
      `;

      console.log('🖨️ [HUBI PrintService] Disparando window.print()...');
      window.print();
      console.log('✅ [HUBI PrintService] window.print() invocado com sucesso.');
    } catch (err) {
      console.error('❌ [HUBI PrintService] Erro ao executar impressão:', err);
      alert(`Não foi possível abrir o diálogo de impressão: ${err}`);
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

