import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Pedido, Loja, ItemPedido } from '../types';
import { PrintService } from './printService';

export interface GerarPdfReciboResult {
  blob: Blob;
  file: File;
  fileName: string;
  url: string;
}

export class ReceiptPdfService {
  /**
   * Renderiza fielmente o componente visual do recibo exibido na tela em um documento PDF.
   * Utiliza html2canvas para captura em alta resolução e jsPDF para compilação com dimensões exatas de recibo.
   */
  static async gerarPdfRecibo(
    elemento: HTMLElement,
    pedido: Pedido,
    loja?: Loja | null
  ): Promise<GerarPdfReciboResult> {
    if (!elemento) {
      throw new Error('Elemento visual do recibo não encontrado para geração de PDF.');
    }

    // Captura com escala 2x para nitidez tipográfica superior no mobile e desktop
    const canvas = await html2canvas(elemento, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 5000,
      width: elemento.scrollWidth || elemento.offsetWidth,
      height: elemento.scrollHeight || elemento.offsetHeight
    });

    // Dimensões do PDF proporcionais ao recibo (largura padrão 80mm de bobina de PDV)
    const pdfWidthMm = 80;
    const aspectRatio = canvas.height / canvas.width;
    const pdfHeightMm = Math.max(80, pdfWidthMm * aspectRatio);

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pdfWidthMm, pdfHeightMm]
    });

    const imgData = canvas.toDataURL('image/png', 1.0);
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm, undefined, 'FAST');

    const blob = pdf.output('blob');
    const numId = pedido.numero_pedido ? String(pedido.numero_pedido) : pedido.id.slice(0, 8);
    const fileName = `recibo_pedido_${numId}.pdf`;

    let file: File;
    try {
      file = new File([blob], fileName, { type: 'application/pdf' });
    } catch {
      // Fallback para navegadores legados que não suportam o construtor File
      file = Object.assign(blob, {
        name: fileName,
        lastModified: Date.now()
      }) as unknown as File;
    }

    const url = URL.createObjectURL(blob);

    return { blob, file, fileName, url };
  }

  /**
   * Compartilha o PDF do comprovante de venda diretamente via WhatsApp usando a Web Share API nativa.
   * Caso o navegador não tenha suporte a arquivos no Web Share, realiza o download automático do PDF
   * e abre o WhatsApp com mensagem formatada e instrução do envio.
   */
  static async compartilharReciboWhatsApp(
    elemento: HTMLElement,
    pedido: Pedido,
    loja: Loja
  ): Promise<void> {
    const { file, fileName, url } = await this.gerarPdfRecibo(elemento, pedido, loja);

    // 1. Tentar compartilhamento nativo com arquivo (Web Share API Level 2)
    const podeCompartilharArquivo =
      typeof navigator !== 'undefined' &&
      !!navigator.share &&
      !!navigator.canShare &&
      navigator.canShare({ files: [file] });

    if (podeCompartilharArquivo) {
      try {
        await navigator.share({
          files: [file],
          title: `Recibo #${pedido.numero_pedido || ''} - ${loja.nome_fantasia || 'HUBI'}`,
          text: `Segue o comprovante do Pedido #${pedido.numero_pedido || ''}.`
        });
        // Revogação de memória pós compartilhamento
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return;
      } catch (err: unknown) {
        // Se o operador apenas cancelou ou fechou o diálogo nativo, não forçar fallback
        if (
          err instanceof Error &&
          (err.name === 'AbortError' ||
            err.message.toLowerCase().includes('abort') ||
            err.message.toLowerCase().includes('cancel'))
        ) {
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          return;
        }
        console.warn('[ReceiptPdfService] Falha na Web Share API, executando fallback estruturado:', err);
      }
    }

    // 2. Fallback Estruturado: Download automático do PDF e abertura do WhatsApp com resumo formal
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (errDownload) {
      console.warn('[ReceiptPdfService] Erro ao disparar download do PDF:', errDownload);
    }

    const itens = (pedido.itens || (pedido as unknown as { itens_pedido?: ItemPedido[] }).itens_pedido || []) as ItemPedido[];
    const totalQtd = itens.reduce((acc, i) => acc + Number(i.quantidade || 1), 0);
    const totalFormatado = Number(pedido.valor_total || 0).toFixed(2);

    const mensagemWhatsApp = `🧾 *COMPROVANTE DE VENDA #${pedido.numero_pedido || ''}*\n` +
      `🏢 *${loja.nome_fantasia || 'HUBI'}*\n\n` +
      `Olá, *${pedido.cliente?.nome || 'Cliente'}*! Segue o comprovante da sua compra.\n\n` +
      `💵 *Total:* R$ ${totalFormatado}\n` +
      `📦 *Itens:* ${itens.length} produto(s) (${totalQtd} unid.)\n` +
      `📄 *Comprovante em PDF:* O arquivo oficial (*${fileName}*) foi gerado e baixado no seu dispositivo para visualização.\n\n` +
      `Agradecemos a sua preferência! ✨`;

    const telCliente = pedido.cliente?.whatsapp || pedido.cliente?.telefone || '';
    PrintService.openWhatsApp(telCliente, mensagemWhatsApp);

    // Revogação segura do objeto URL da memória
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  /**
   * Baixa diretamente o arquivo PDF gerado a partir do elemento visual.
   */
  static async baixarPdfRecibo(
    elemento: HTMLElement,
    pedido: Pedido,
    loja?: Loja | null
  ): Promise<void> {
    const { fileName, url } = await this.gerarPdfRecibo(elemento, pedido, loja);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    }
  }
}
