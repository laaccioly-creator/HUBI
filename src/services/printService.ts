/**
 * HUBI Print & Receipt Engine
 * Suporta:
 * 1. Impressão Térmica Bluetooth Direta (ESC/POS 58mm e 80mm via Web Bluetooth API)
 * 2. Impressão Padrão do Navegador (A4 ou Bobina)
 * 3. Formatação de Recibo em Texto para WhatsApp
 */

import { Pedido, Loja } from '../types/database';

export class PrintService {
  /**
   * Conecta a uma impressora térmica Bluetooth via Web Bluetooth API e envia comandos ESC/POS
   */
  static async printBluetoothThermal(pedido: Pedido, loja: Loja, paperWidth: '58mm' | '80mm' = '58mm'): Promise<boolean> {
    try {
      if (!('bluetooth' in navigator)) {
        alert('Seu navegador não suporta Web Bluetooth. Recomendamos usar o Google Chrome no celular ou computador.');
        return false;
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
        alert('Não foi possível encontrar a porta de escrita da impressora Bluetooth.');
        return false;
      }

      // Montar buffer de comandos ESC/POS
      const escPosCommands = this.generateEscPosBuffer(pedido, loja, paperWidth);
      
      // Enviar em blocos de 100 bytes
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
      console.error('Erro ao imprimir via Bluetooth:', err);
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
    // Centralizado
    text += '\x1B\x61\x01'; // Align Center
    text += '\x1B\x45\x01'; // Bold ON
    text += `${loja.nome_fantasia.toUpperCase()}\n`;
    text += '\x1B\x45\x00'; // Bold OFF
    if (loja.telefone || loja.whatsapp) text += `Tel/Whats: ${loja.whatsapp || loja.telefone}\n`;
    if (loja.endereco_cidade) text += `${loja.endereco_cidade} - ${loja.endereco_estado || ''}\n`;
    text += divider;

    text += `PEDIDO #${pedido.numero_pedido}\n`;
    text += `Data: ${new Date(pedido.data_venda).toLocaleString('pt-BR')}\n`;
    if (pedido.cliente?.nome) text += `Cliente: ${pedido.cliente.nome}\n`;
    text += divider;

    // Alinhado à esquerda
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

    // Totais
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
      ? pedido.itens.map(i => `▫️ *${i.quantidade}x* ${i.nome_produto} ${i.rotulo_variacao ? `(${i.rotulo_variacao})` : ''} - R$ ${Number(i.subtotal).toFixed(2)}`).join('\n')
      : '';

    return `🛍️ *PEDIDO #${pedido.numero_pedido} - ${loja.nome_fantasia}*

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
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  /**
   * Dispara a impressão nativa do navegador
   */
  static printWindow(): void {
    window.print();
  }
}
