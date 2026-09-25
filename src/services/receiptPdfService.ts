import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Pedido, Loja, ItemPedido } from '../types';
import { PrintService } from './printService';
import { supabase } from '../lib/supabase';

export interface ArquivosReciboResult {
  pdfBlob: Blob;
  pdfFile: File;
  pdfFileName: string;
  imageBlob: Blob | null;
  imageFile: File | null;
  imageFileName: string;
  numId: string;
}

export class ReceiptPdfService {
  /**
   * Captura o elemento do recibo e gera tanto o arquivo PDF quanto a imagem PNG em alta resolução.
   */
  static async gerarArquivosRecibo(
    elemento: HTMLElement,
    pedido: Pedido,
    loja?: Loja | null
  ): Promise<ArquivosReciboResult> {
    if (!elemento) {
      throw new Error('Elemento visual do recibo não encontrado para captura.');
    }

    const numId = pedido.numero_pedido ? String(pedido.numero_pedido) : pedido.id.slice(0, 8);
    const pdfFileName = `recibo_pedido_${numId}.pdf`;
    const imageFileName = `recibo_pedido_${numId}.png`;

    // Captura com escala 2x para nitidez tipográfica superior sem atraso excessivo de ativação
    const canvas = await html2canvas(elemento, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 2000,
      width: elemento.scrollWidth || elemento.offsetWidth,
      height: elemento.scrollHeight || elemento.offsetHeight
    });

    // 1. Gera o Blob de Imagem (PNG)
    const imageBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });

    let imageFile: File | null = null;
    if (imageBlob) {
      try {
        imageFile = new File([imageBlob], imageFileName, { type: 'image/png' });
      } catch {
        imageFile = Object.assign(imageBlob, {
          name: imageFileName,
          lastModified: Date.now()
        }) as unknown as File;
      }
    }

    // 2. Compila o documento PDF (80mm contínuo)
    const pdfWidthMm = 80;
    const aspectRatio = canvas.height / canvas.width;
    const pdfHeightMm = Math.max(80, pdfWidthMm * aspectRatio);

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pdfWidthMm, pdfHeightMm]
    });

    const imgData = canvas.toDataURL('image/png', 0.95);
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm, undefined, 'FAST');

    const pdfBlob = pdf.output('blob');
    let pdfFile: File;
    try {
      pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' });
    } catch {
      pdfFile = Object.assign(pdfBlob, {
        name: pdfFileName,
        lastModified: Date.now()
      }) as unknown as File;
    }

    return {
      pdfBlob,
      pdfFile,
      pdfFileName,
      imageBlob,
      imageFile,
      imageFileName,
      numId
    };
  }

  /**
   * Envia o comprovante de venda diretamente para o WhatsApp do cliente que realizou o pedido.
   * Evita telas intermediárias de compartilhamento do sistema operacional (Windows/Mac)
   * e abre imediatamente a conversa com o cliente no WhatsApp com a mensagem formatada e o link do recibo.
   */
  static async compartilharReciboWhatsApp(
    _elemento: HTMLElement,
    pedido: Pedido,
    loja: Loja
  ): Promise<void> {
    // 1. Identifica o telefone do cliente diretamente do pedido
    const rawPe = (pedido as any).pedido_entrega || (pedido as any).pedido_entregas;
    const pe = Array.isArray(rawPe) ? rawPe[0] : rawPe;

    let telCliente =
      pedido.cliente?.whatsapp ||
      pedido.cliente?.telefone ||
      pedido.cliente?.telefone2 ||
      pe?.whatsapp ||
      pe?.telefone ||
      (pedido as any).telefone_contato ||
      '';

    // 2. Se o cliente não possuir telefone cadastrado, solicita ao operador
    if (!telCliente && typeof window !== 'undefined') {
      const telDigitado = window.prompt(
        'Este cliente não possui WhatsApp cadastrado na venda.\n' +
        'Digite o número do WhatsApp com DDD (ex: 85999998888) para enviar diretamente, ou clique em Cancelar para selecionar o contato no WhatsApp:'
      );
      if (telDigitado && telDigitado.trim()) {
        telCliente = telDigitado.trim();
      }
    }

    // 3. Monta a mensagem completa e estruturada do recibo com link oficial
    const mensagemWhatsApp = PrintService.generateWhatsAppMessage(pedido, loja);

    // 4. Dispara a abertura direta do WhatsApp para o cliente (sem telas intermediárias do SO)
    PrintService.openWhatsApp(telCliente, mensagemWhatsApp);
  }

  /**
   * Baixa diretamente o arquivo PDF gerado a partir do elemento visual (quando solicitado explicitamente pelo operador).
   */
  static async baixarPdfRecibo(
    elemento: HTMLElement,
    pedido: Pedido,
    loja?: Loja | null
  ): Promise<void> {
    const { pdfBlob, pdfFileName } = await this.gerarArquivosRecibo(elemento, pedido, loja);
    const url = URL.createObjectURL(pdfBlob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    }
  }
}
