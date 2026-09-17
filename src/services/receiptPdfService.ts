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
   * Compartilha o comprovante de venda nativamente via Web Share API com o arquivo anexado.
   * Prioriza PDF; caso a plataforma móvel restrinja compartilhamento a mídias, anexa a imagem PNG de alta definição.
   * Se o ambiente não suportar Web Share com arquivos, executa upload em nuvem no Supabase Storage
   * e envia o link direto pelo WhatsApp, sem realizar download desnecessário no aparelho do operador.
   */
  static async compartilharReciboWhatsApp(
    elemento: HTMLElement,
    pedido: Pedido,
    loja: Loja
  ): Promise<void> {
    const { pdfFile, imageFile, numId } = await this.gerarArquivosRecibo(elemento, pedido, loja);

    const nomeLoja = loja.nome_fantasia || 'HUBI';
    const tituloCompartilhamento = `Recibo Pedido #${numId} - ${nomeLoja}`;
    const textoCompartilhamento = 'Olá! Segue o comprovante da sua compra.';

    // 1. Tenta compartilhamento nativo com arquivo via Web Share API Level 2
    let arquivoParaCompartilhar: File | null = null;

    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function'
    ) {
      if (navigator.canShare({ files: [pdfFile] })) {
        arquivoParaCompartilhar = pdfFile;
      } else if (imageFile && navigator.canShare({ files: [imageFile] })) {
        arquivoParaCompartilhar = imageFile;
      }
    }

    if (arquivoParaCompartilhar) {
      try {
        await navigator.share({
          files: [arquivoParaCompartilhar],
          title: tituloCompartilhamento,
          text: textoCompartilhamento
        });
        return; // Compartilhado com sucesso! O WhatsApp nativo abre com o arquivo anexado.
      } catch (err: unknown) {
        // Se o operador cancelou ou fechou a folha de compartilhamento nativa, encerra silenciosamente
        if (
          err instanceof Error &&
          (err.name === 'AbortError' ||
            err.message.toLowerCase().includes('abort') ||
            err.message.toLowerCase().includes('cancel'))
        ) {
          return;
        }
        console.warn('[ReceiptPdfService] Falha na Web Share API, ativando fallback com upload em nuvem:', err);
      }
    }

    // 2. FALLBACK ESTRUTURADO: Upload do PDF no Supabase Storage e envio do link direto no WhatsApp
    // Elimina telas intermediárias e download local indesejado no aparelho do operador
    let urlPublicaRecibo: string | null = null;
    const pathStorage = `${loja.id || 'loja'}/${numId}_${Date.now()}_recibo.pdf`;

    try {
      let bucketUsado = 'comprovantes_pdv';
      let uploadRes = await supabase.storage
        .from(bucketUsado)
        .upload(pathStorage, pdfFile, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadRes.error) {
        console.warn('[ReceiptPdfService] Bucket comprovantes_pdv indisponível, usando bucket produtos:', uploadRes.error.message);
        bucketUsado = 'produtos';
        uploadRes = await supabase.storage
          .from(bucketUsado)
          .upload(pathStorage, pdfFile, {
            contentType: 'application/pdf',
            upsert: true
          });
      }

      if (!uploadRes.error) {
        const { data: pubData } = supabase.storage
          .from(bucketUsado)
          .getPublicUrl(pathStorage);
        urlPublicaRecibo = pubData?.publicUrl || null;
      }
    } catch (storageErr) {
      console.warn('[ReceiptPdfService] Erro ao enviar comprovante para o Supabase Storage:', storageErr);
    }

    const itens = (pedido.itens || (pedido as unknown as { itens_pedido?: ItemPedido[] }).itens_pedido || []) as ItemPedido[];
    const totalQtd = itens.reduce((acc, i) => acc + Number(i.quantidade || 1), 0);
    const totalFormatado = Number(pedido.valor_total || 0).toFixed(2);
    const nomeCliente = pedido.cliente?.nome || 'Cliente';
    const baseUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : '';
    const urlReciboOficial = `${baseUrl}/recibo/${numId}`;

    const mensagemWhatsApp = `🧾 *RECIBO PEDIDO #${numId} - ${nomeLoja}*\n\n` +
      `Olá, *${nomeCliente}*! Segue o comprovante da sua compra.\n\n` +
      `💰 *Total: R$ ${totalFormatado}*\n` +
      `📦 *Itens:* ${itens.length} produto(s) (${totalQtd} unid.)\n\n` +
      `📄 *Acesse seu Recibo Oficial:*\n${urlReciboOficial}\n\n` +
      `Agradecemos a sua preferência! ✨`;

    const telCliente = pedido.cliente?.whatsapp || pedido.cliente?.telefone || '';
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
