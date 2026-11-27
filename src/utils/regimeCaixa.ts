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
