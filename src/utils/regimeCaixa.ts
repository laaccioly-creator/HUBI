import { Pedido } from '../types';
import { formatarDataLocal, obterDataLocalYYYYMMDD } from './dateTime';

/**
 * Resolve o timestamp ISO efetivo de recebimento do pedido para Regime de Caixa Real.
 * Prioridade:
 * 1. `pedido.data_pagamento`
 * 2. Maior `data_pagamento` entre pagamentos reais (não fiado / não caderneta)
 * 3. Fallback para `data_venda` ou `criado_em`
 */
export function obterDataRecebimentoPedidoISO(pedido: Partial<Pedido> | null | undefined): string {
  if (!pedido) return '';

  const dataDireta = typeof pedido.data_pagamento === 'string' ? pedido.data_pagamento.trim() : '';
  if (dataDireta) return dataDireta;

  if (Array.isArray(pedido.pagamentos) && pedido.pagamentos.length > 0) {
    let maiorIso = '';
    let maiorTs = -Infinity;

    for (const pag of pedido.pagamentos as any[]) {
      if (!pag) continue;
      if (pag.eh_pagamento_fiado || pag.eh_pagamento_caderneta) continue;
      const raw = typeof pag.data_pagamento === 'string' ? pag.data_pagamento.trim() : '';
      if (!raw) continue;
      const ts = new Date(raw).getTime();
      if (!Number.isNaN(ts) && ts > maiorTs) {
        maiorTs = ts;
        maiorIso = raw;
      }
    }

    if (maiorIso) return maiorIso;
  }

  return pedido.data_venda || pedido.criado_em || '';
}

/**
 * Resolve o objeto Date efetivo de recebimento do pedido (Regime de Caixa Real).
 */
export function obterDataRecebimentoPedidoDate(pedido: Partial<Pedido> | null | undefined): Date {
  const iso = obterDataRecebimentoPedidoISO(pedido);
  if (!iso) return new Date(NaN);
  return new Date(iso);
}

/**
 * Indica se o pedido foi efetivamente quitado (`status_pagamento === 'pago'`)
 * para compor Faturamento Realizado, Analytics e Caixa em Regime de Caixa Real.
 */
export function pedidoFoiPagoRealmente(pedido: Partial<Pedido> | null | undefined): boolean {
  if (!pedido) return false;
  if (String(pedido.status || '').toLowerCase() === 'cancelado') return false;

  if (pedido.status_pagamento) {
    return String(pedido.status_pagamento).toLowerCase() === 'pago';
  }

  return (
    Number(pedido.saldo_devedor || 0) <= 0 &&
    Number(pedido.valor_pago || 0) > 0 &&
    !pedido.eh_venda_caderneta
  );
}

/**
 * Indica se o pedido possui recebimento real contabilizável em Regime de Caixa
 * (totalmente pago ou parcialmente pago com entrada real registrada, sem exigir status 'concluido').
 */
export function pedidoTemRecebimentoReal(pedido: Partial<Pedido> | null | undefined): boolean {
  if (!pedido) return false;
  if (String(pedido.status || '').toLowerCase() === 'cancelado') return false;
  if (pedidoFoiPagoRealmente(pedido)) return true;

  const stPag = String(pedido.status_pagamento || '').toLowerCase();
  return stPag === 'parcialmente_pago' && Number(pedido.valor_pago || 0) > 0;
}

/**
 * Resolve o valor efetivamente recebido do pedido em Regime de Caixa Real.
 */
export function obterValorRecebidoPedido(pedido: Partial<Pedido> | null | undefined): number {
  if (!pedido) return 0;
  const stPag = String(pedido.status_pagamento || '').toLowerCase();
  if (stPag === 'parcialmente_pago') {
    return Number(pedido.valor_pago || 0);
  }
  const valorPago = Number(pedido.valor_pago || 0);
  if (valorPago > 0) return valorPago;
  return Number(pedido.valor_total || 0);
}

/**
 * Retorna a data efetiva do pagamento somente quando há pagamento real registrado;
 * retorna '' para pedidos ainda não pagos, evitando exibir data de pagamento falsa em recibos pendentes.
 */
export function obterDataPagamentoExplicitaPedidoISO(pedido: Partial<Pedido> | null | undefined): string {
  if (!pedido) return '';
  if (String(pedido.status || '').toLowerCase() === 'cancelado') return '';

  const dataDireta = typeof pedido.data_pagamento === 'string' ? pedido.data_pagamento.trim() : '';
  if (dataDireta) return dataDireta;

  if (Array.isArray(pedido.pagamentos) && pedido.pagamentos.length > 0) {
    let maiorIso = '';
    let maiorTs = -Infinity;

    for (const pag of pedido.pagamentos as any[]) {
      if (!pag) continue;
      if (pag.eh_pagamento_fiado || pag.eh_pagamento_caderneta) continue;
      const tipoForma = String(pag.forma_pagamento?.tipo || pag.forma_tipo || '').toLowerCase();
      const nomeForma = String(pag.forma_pagamento?.nome || pag.forma_nome || pag.nome_forma || '').toLowerCase();
      if (tipoForma === 'fiado' || tipoForma === 'caderneta' || nomeForma.includes('fiado') || nomeForma.includes('caderneta')) {
        continue;
      }
      const raw = typeof pag.data_pagamento === 'string' ? pag.data_pagamento.trim() : '';
      if (!raw) continue;
      const ts = new Date(raw).getTime();
      if (!Number.isNaN(ts) && ts > maiorTs) {
        maiorTs = ts;
        maiorIso = raw;
      }
    }

    if (maiorIso) return maiorIso;
  }

  if (pedidoTemRecebimentoReal(pedido)) {
    return (pedido.atualizado_em || pedido.data_venda || pedido.criado_em || '') as string;
  }

  return '';
}

/**
 * Verifica se o pedido foi criado em um dia civil diferente do dia do pagamento/recebimento.
 */
export function pedidoCriadoEmDiaDiferenteDoPagamento(pedido: Partial<Pedido> | null | undefined): {
  diferente: boolean;
  dataPedidoCurta: string;
  dataPedidoIso: string;
} {
  if (!pedido) {
    return { diferente: false, dataPedidoCurta: '', dataPedidoIso: '' };
  }

  const dataPedidoIso = pedido.data_venda || pedido.criado_em || '';
  const dataPagIso = obterDataRecebimentoPedidoISO(pedido);

  if (!dataPedidoIso || !dataPagIso) {
    return { diferente: false, dataPedidoCurta: '', dataPedidoIso };
  }

  const ymdPedido = obterDataLocalYYYYMMDD(dataPedidoIso);
  const ymdPagamento = obterDataLocalYYYYMMDD(dataPagIso);

  if (!ymdPedido || !ymdPagamento || ymdPedido === ymdPagamento) {
    return { diferente: false, dataPedidoCurta: '', dataPedidoIso };
  }

  const dataPedidoCurta = formatarDataLocal(dataPedidoIso, {
    day: '2-digit',
    month: '2-digit'
  });

  return {
    diferente: true,
    dataPedidoCurta,
    dataPedidoIso
  };
}
