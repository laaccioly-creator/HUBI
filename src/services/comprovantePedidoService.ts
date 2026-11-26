import { supabase } from '../lib/supabase';
import { Pedido } from '../types';
import { normalizarTelefoneComDDI } from '../utils/formatters';

export type EstadoAcaoPagamentoCatalogo =
  | 'oculto'
  | 'comprovante_enviado'
  | 'enviar_comprovante_pix'
  | 'pagar_pedido';

const TAMANHO_MAXIMO_COMPROVANTE_BYTES = 8 * 1024 * 1024; // 8 MB
const TAMANHO_MAXIMO_FALLBACK_DATA_URL_BYTES = 2 * 1024 * 1024; // 2 MB

const EXTENSOES_PERMITIDAS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);

/**
 * Identifica se o pedido do Catálogo Online possui Pix selecionado ou registrado
 * pelas colunas relacionais (`forma_pagamento_catalogo`, `comprovante_pagamento_url`,
 * `pagamentos`, `pagamentos_previstos`) ou histórico de pagamento.
 */
export function pedidoEhPixCatalogo(
  pedido: Partial<Pedido> | null | undefined,
  historico?: Array<Record<string, any>>
): boolean {
  if (!pedido) return false;

  const formaCatalogo = String(pedido.forma_pagamento_catalogo || '').toLowerCase();
  if (formaCatalogo.includes('pix')) return true;

  if (String(pedido.comprovante_pagamento_url || '').trim().length > 0) {
    return true;
  }

  if (
    Array.isArray(pedido.pagamentos) &&
    pedido.pagamentos.some((p: any) => {
      const tipo = String(p?.forma_pagamento?.tipo || p?.forma_tipo || '').toLowerCase();
      const nome = String(p?.forma_pagamento?.nome || '').toLowerCase();
      return tipo.includes('pix') || nome.includes('pix');
    })
  ) {
    return true;
  }

  if (
    Array.isArray(pedido.pagamentos_previstos) &&
    pedido.pagamentos_previstos.some((p: any) => {
      const tipo = String(p?.forma_tipo || '').toLowerCase();
      const nome = String(p?.forma_nome || '').toLowerCase();
      return tipo.includes('pix') || nome.includes('pix');
    })
  ) {
    return true;
  }

  if (
    Array.isArray(historico) &&
    historico.some(
      (h) =>
        (h?.tipo_evento === 'pagamento_catalogo' || h?.tipo_evento === 'comprovante_enviado') &&
        String(h?.descricao || h?.motivo || '').toLowerCase().includes('pix')
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Determina o estado mutuamente exclusivo dos controles de pagamento/comprovante
 * nas telas do cliente (`Meus Pedidos` e `PedidoAndamentoPublico`).
 */
export function obterEstadoAcaoPagamentoCatalogo(
  pedido: Partial<Pedido> | null | undefined,
  opcoes: {
    ehPresencial: boolean;
    historico?: Array<Record<string, any>>;
  }
): EstadoAcaoPagamentoCatalogo {
  if (!pedido) return 'oculto';

  const status = String(pedido.status || '').toLowerCase();
  const statusPagamento = String(pedido.status_pagamento || '').toLowerCase();

  if (status === 'cancelado' || statusPagamento === 'pago') {
    return 'oculto';
  }

  if (
    statusPagamento === 'aguardando_pesagem' ||
    statusPagamento === 'fiado' ||
    statusPagamento === 'caderneta'
  ) {
    return 'oculto';
  }

  if (String(pedido.comprovante_pagamento_url || '').trim().length > 0) {
    return 'comprovante_enviado';
  }

  if (opcoes.ehPresencial) {
    return 'oculto';
  }

  if (pedidoEhPixCatalogo(pedido, opcoes.historico)) {
    return 'enviar_comprovante_pix';
  }

  return 'pagar_pedido';
}

function lerArquivoComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      if (!res) {
        reject(new Error('Não foi possível ler o arquivo selecionado.'));
        return;
      }
      resolve(res);
    };
    reader.onerror = () => reject(new Error('Falha ao processar o arquivo do comprovante.'));
    reader.readAsDataURL(arquivo);
  });
}

/**
 * Valida, envia o arquivo do comprovante para o Supabase Storage (com fallback seguro)
 * e persiste o vínculo relacional via `rpc_registrar_comprovante_pedido_catalogo`.
 */
export async function enviarComprovantePedidoCatalogo(params: {
  pedidoId: string;
  lojaId: string;
  arquivo: File;
}): Promise<{
  url: string;
  enviadoEm: string;
  formaPagamentoCatalogo: string;
}> {
  const { pedidoId, lojaId, arquivo } = params;

  if (!pedidoId || !lojaId) {
    throw new Error('Pedido inválido para envio de comprovante.');
  }

  if (!arquivo) {
    throw new Error('Selecione um arquivo de comprovante para enviar.');
  }

  if (arquivo.size > TAMANHO_MAXIMO_COMPROVANTE_BYTES) {
    throw new Error('O comprovante deve ter no máximo 8 MB.');
  }

  const extRaw = (arquivo.name.split('.').pop() || '').toLowerCase().trim();
  const mimePermitido =
    arquivo.type.startsWith('image/') || arquivo.type === 'application/pdf';

  if (!mimePermitido && !EXTENSOES_PERMITIDAS.has(extRaw)) {
    throw new Error('Formato não suportado. Envie uma imagem (JPG, PNG, WEBP) ou PDF.');
  }

  const extSegura = EXTENSOES_PERMITIDAS.has(extRaw)
    ? extRaw
    : arquivo.type === 'application/pdf'
    ? 'pdf'
    : 'jpg';

  const nomeBase = `${pedidoId}_${Date.now()}.${extSegura}`;
  let urlFinal = '';

  // 1. Tenta bucket dedicado de comprovantes
  const caminhoPrincipal = `${lojaId}/${nomeBase}`;
  const resPrincipal = await supabase.storage
    .from('comprovantes-pagamento')
    .upload(caminhoPrincipal, arquivo, {
      upsert: true,
      contentType: arquivo.type || undefined
    });

  if (!resPrincipal.error) {
    const { data: pubData } = supabase.storage
      .from('comprovantes-pagamento')
      .getPublicUrl(caminhoPrincipal);
    if (pubData?.publicUrl) {
      urlFinal = pubData.publicUrl;
    }
  }

  // 2. Fallback para bucket 'produtos' se o bucket dedicado não estiver provisionado
  if (!urlFinal) {
    const caminhoProdutos = `comprovantes/${lojaId}/${nomeBase}`;
    const resProdutos = await supabase.storage
      .from('produtos')
      .upload(caminhoProdutos, arquivo, {
        upsert: true,
        contentType: arquivo.type || undefined
      });

    if (!resProdutos.error) {
      const { data: pubData } = supabase.storage
        .from('produtos')
        .getPublicUrl(caminhoProdutos);
      if (pubData?.publicUrl) {
        urlFinal = pubData.publicUrl;
      }
    }
  }

  // 3. Fallback controlado em Data URL para arquivos pequenos caso o Storage esteja bloqueado
  if (!urlFinal) {
    if (arquivo.size > TAMANHO_MAXIMO_FALLBACK_DATA_URL_BYTES) {
      throw new Error(
        'Não foi possível armazenar arquivos acima de 2 MB no momento. Envie uma imagem menor ou um print do comprovante.'
      );
    }
    urlFinal = await lerArquivoComoDataUrl(arquivo);
  }

  const { data, error } = await (supabase as any).rpc(
    'rpc_registrar_comprovante_pedido_catalogo',
    {
      p_pedido_id: pedidoId,
      p_loja_id: lojaId,
      p_comprovante_url: urlFinal
    }
  );

  if (error) {
    throw new Error('Não foi possível salvar o comprovante agora. Tente novamente em instantes.');
  }

  const registro = Array.isArray(data) ? data[0] : data;

  return {
    url: registro?.comprovante_pagamento_url || urlFinal,
    enviadoEm: registro?.comprovante_enviado_em || new Date().toISOString(),
    formaPagamentoCatalogo: registro?.forma_pagamento_catalogo || 'pix'
  };
}

/**
 * Monta o link oficial do WhatsApp da loja (com DDI 55 higienizado)
 * contendo identificação do pedido, nome do cliente, valor e link do comprovante.
 */
export function montarLinkWhatsappComprovantePix(params: {
  whatsappLoja?: string | null;
  numeroPedido?: number | string | null;
  nomeCliente?: string | null;
  valorTotal?: number | null;
  comprovanteUrl?: string | null;
}): string | null {
  const telefoneDDI = normalizarTelefoneComDDI(params.whatsappLoja);
  if (!telefoneDDI) return null;

  const numeroFmt = params.numeroPedido != null && String(params.numeroPedido).trim() !== ''
    ? `#${params.numeroPedido}`
    : '';
  const nomeClienteFmt = (params.nomeCliente || '').trim() || 'Cliente do Catálogo';
  const valorFmt = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(params.valorTotal || 0));

  const url = (params.comprovanteUrl || '').trim();
  const linhaComprovante = /^https?:\/\//i.test(url)
    ? `📎 *Comprovante:* ${url}`
    : '📎 *Comprovante:* Anexado diretamente no pedido (disponível no painel da loja).';

  const linhas = [
    `Olá! Segue o comprovante de pagamento Pix do *Pedido ${numeroFmt}*.`.replace('  ', ' '),
    `👤 *Cliente:* ${nomeClienteFmt}`,
    `💰 *Valor total:* ${valorFmt}`,
    linhaComprovante
  ];

  return `https://wa.me/${telefoneDDI}?text=${encodeURIComponent(linhas.join('\n'))}`;
}

/**
 * Abre o comprovante em nova aba com segurança (suporta URLs HTTP(S) e fallback Data URL via Blob).
 */
export function abrirComprovanteEmNovaAba(url?: string | null): void {
  const limpa = (url || '').trim();
  if (!limpa || typeof window === 'undefined') return;

  if (/^https?:\/\//i.test(limpa)) {
    window.open(limpa, '_blank', 'noopener,noreferrer');
    return;
  }

  if (limpa.startsWith('data:')) {
    try {
      const [header, base64] = limpa.split(',');
      const mimeMatch = header.match(/data:([^;]+);base64/i);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const binario = atob(base64 || '');
      const bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i += 1) {
        bytes[i] = binario.charCodeAt(i);
      }
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      return;
    } catch {
      window.open(limpa, '_blank', 'noopener,noreferrer');
    }
  }
}
