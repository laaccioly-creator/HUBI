import { StatusPedido, Loja } from '../types';
import { obterDataOperacaoYMD } from './dataOperacao';

export const ROTULOS_STATUS_PEDIDO: Record<string, string> = {
  todos: 'Todos os status',
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  em_separacao: 'Em separação',
  em_producao: 'Em produção',
  em_expedicao: 'Em expedição',
  envio_pendente: 'Envio Pendente',
  aguardando_envio: 'Aguardando Envio',
  saiu_para_entrega: 'Saiu para Entrega',
  enviado: 'Enviado',
  pronto_para_retirar: 'Pronto para retirar',
  entregue: 'Entregue',
  concluido: 'Concluído',
  vencido: 'Vencido',
  cancelado: 'Cancelado'
};

/**
 * Verifica se um status de pedido está ativo nas configurações da loja.
 * - 'pendente', 'confirmado', 'aguardando_envio', 'enviado', 'entregue', 'concluido', 'vencido' e 'cancelado' são fixos e sempre ativos.
 * - 'em_producao', 'em_expedicao' e 'pronto_para_retirar'
 *   dependem das opções marcadas em Configurações > Pedidos e Vendas > Status de Pedido.
 */
export function isStatusPedidoAtivo(
  statusId: string,
  loja?: Loja | null
): boolean {
  if (['todos', 'pendente', 'confirmado', 'aguardando_envio', 'enviado', 'entregue', 'concluido', 'vencido', 'cancelado'].includes(statusId)) {
    return true;
  }

  const configStatus = loja?.configuracoes_extras?.status_pedidos_ativos;

  switch (statusId) {
    case 'em_producao':
      return configStatus?.em_producao ?? true;
    case 'em_expedicao':
      return configStatus?.em_expedicao ?? true;
    case 'pronto_para_retirar':
      return configStatus?.pronto_para_retirar ?? true;
    case 'em_separacao':
      // 'em_separacao' não faz parte dos fluxos configuráveis padrão do sistema
      return false;
    default: {
      // Verificar se é um status personalizado ativo
      const custom = configStatus?.status_personalizados?.find((s) => s.id === statusId);
      return custom ? Boolean(custom.ativo) : false;
    }
  }
}

/**
 * Retorna a lista de abas visíveis na tela de pedidos conforme a configuração da loja.
 */
export function obterAbasStatusVisiveis(loja?: Loja | null): { id: string; label: string }[] {
  const abas: { id: string; label: string }[] = [
    { id: 'todos', label: 'Todos os status' },
    { id: 'pendente', label: 'Pendente' },
    { id: 'confirmado', label: 'Confirmado' }
  ];

  if (isStatusPedidoAtivo('em_producao', loja)) {
    abas.push({ id: 'em_producao', label: 'Em produção' });
  }

  if (isStatusPedidoAtivo('em_expedicao', loja)) {
    abas.push({ id: 'em_expedicao', label: 'Em expedição' });
  }

  if (isStatusPedidoAtivo('pronto_para_retirar', loja)) {
    abas.push({ id: 'pronto_para_retirar', label: 'Pronto para retirar' });
  }

  abas.push({ id: 'aguardando_envio', label: 'Aguardando Envio' });
  abas.push({ id: 'enviado', label: 'Enviado' });
  abas.push({ id: 'entregue', label: 'Entregue' });

  // Status personalizados ativos
  const customizados = loja?.configuracoes_extras?.status_pedidos_ativos?.status_personalizados || [];
  customizados.forEach((st) => {
    if (st.ativo) {
      abas.push({ id: st.id, label: st.nome });
    }
  });

  // Aba para monitoramento de fiados vencidos
  abas.push({ id: 'vencido', label: 'Vencido' });
  abas.push({ id: 'cancelado', label: 'Cancelado' });

  return abas;
}

/**
 * Retorna as opções disponíveis para alterar o status de um pedido.
 * Respeita estritamente o ciclo de vida:
 * - 'pendente': Só pode evoluir exclusivamente para 'confirmado' ou 'cancelado'.
 * - 'confirmado' e superiores: Nunca podem retornar para 'pendente'.
 * - 'concluido': Permitido nas opções se incluirConcluido for true.
 * - 'cancelado': Sempre disponível como ação de encerramento.
 */
export function obterOpcoesStatusAlteracao(
  loja?: Loja | null,
  statusAtual?: string,
  incluirConcluido: boolean = false
): { id: StatusPedido; label: string }[] {
  // Pedidos cancelados são estritamente imutáveis (read-only)
  if (statusAtual === 'cancelado') {
    return [];
  }

  // Pedidos concluídos (Vendas): a única ação permitida é o cancelamento
  if (statusAtual === 'concluido') {
    return [
      { id: 'concluido', label: 'Concluído' },
      { id: 'cancelado', label: 'Cancelar Venda' }
    ];
  }

  // 1. Ciclo estrito para pedidos Pendentes: status atual é Pendente, e só pode evoluir para Confirmado ou Cancelado
  if (statusAtual === 'pendente') {
    return [
      { id: 'pendente', label: 'Pendente' },
      { id: 'confirmado', label: 'Confirmado' },
      { id: 'cancelado', label: 'Cancelado' }
    ];
  }

  const opcoes: { id: StatusPedido; label: string }[] = [];

  // Se o pedido for confirmado ou posterior, não permite voltar para pendente
  if (statusAtual === 'confirmado') {
    opcoes.push({ id: 'confirmado', label: 'Confirmado' });
  }

  if (isStatusPedidoAtivo('em_producao', loja) || statusAtual === 'em_producao') {
    opcoes.push({ id: 'em_producao', label: 'Em produção' });
  }

  if (isStatusPedidoAtivo('em_expedicao', loja) || statusAtual === 'em_expedicao') {
    opcoes.push({ id: 'em_expedicao', label: 'Em expedição' });
  }

  if (statusAtual === 'aguardando_envio' || statusAtual === 'confirmado' || statusAtual === 'em_expedicao') {
    if (!opcoes.some(o => o.id === 'aguardando_envio')) {
      opcoes.push({ id: 'aguardando_envio', label: 'Aguardando Envio' });
    }
  }

  if (statusAtual === 'enviado' || statusAtual === 'aguardando_envio') {
    if (!opcoes.some(o => o.id === 'enviado')) {
      opcoes.push({ id: 'enviado', label: 'Enviado' });
    }
  }

  if (statusAtual === 'entregue' || statusAtual === 'enviado') {
    if (!opcoes.some(o => o.id === 'entregue')) {
      opcoes.push({ id: 'entregue', label: 'Entregue' });
    }
  }

  if (isStatusPedidoAtivo('pronto_para_retirar', loja) || statusAtual === 'pronto_para_retirar') {
    opcoes.push({ id: 'pronto_para_retirar', label: 'Pronto para retirar' });
  }

  if (statusAtual === 'vencido') {
    opcoes.push({ id: 'vencido', label: 'Vencido' });
  }

  if (incluirConcluido || statusAtual === 'concluido') {
    opcoes.push({ id: 'concluido', label: 'Concluído' });
  }

  opcoes.push({ id: 'cancelado', label: 'Cancelado' });

  return opcoes;
}

/**
 * Valida se uma transição de status é permitida pelo ciclo de vida do pedido.
 */
export function validarTransicaoStatusPedido(
  statusAtual?: string,
  novoStatus?: string,
  estaQuitado: boolean = false
): { permitido: boolean; motivo?: string; requerPagamento?: boolean } {
  if (!statusAtual || !novoStatus || statusAtual === novoStatus) {
    return { permitido: true };
  }

  // Pedidos cancelados são estritamente imutáveis (read-only)
  if (statusAtual === 'cancelado') {
    return {
      permitido: false,
      motivo: 'Pedidos cancelados são imutáveis e não permitem alteração de status.'
    };
  }

  // Pedidos concluídos (Vendas): a única transição permitida é o cancelamento
  if (statusAtual === 'concluido') {
    if (novoStatus === 'cancelado') {
      return { permitido: true };
    }
    return {
      permitido: false,
      motivo: 'Pedidos já concluídos (Vendas) são definitivos e não podem ter seu status alterado para outros fluxos, permitindo apenas o cancelamento.'
    };
  }

  // Cancelamento é permitido a partir de qualquer status
  if (novoStatus === 'cancelado') {
    return { permitido: true };
  }

  // 1. Status Pendente só pode evoluir para Confirmado (ou Cancelado)
  if (statusAtual === 'pendente') {
    if (novoStatus !== 'confirmado') {
      return {
        permitido: false,
        motivo: 'Pedidos pendentes só podem evoluir para Confirmado. Confirme o pedido antes de avançar para outras etapas.'
      };
    }
    return { permitido: true };
  }

  // 2. Status Confirmado e superiores não podem retornar para Pendente
  if (novoStatus === 'pendente') {
    return {
      permitido: false,
      motivo: 'Pedidos confirmados não podem retornar para Pendente. Para corrigir itens, o pedido deve ser cancelado e recriado.'
    };
  }

  // 3. Status Concluído exige que o pedido esteja integralmente quitado
  if (novoStatus === 'concluido') {
    if (!estaQuitado) {
      return {
        permitido: false,
        motivo: 'Para concluir o pedido, é necessário que ele esteja integralmente quitado.',
        requerPagamento: true
      };
    }
  }

  return { permitido: true };
}

/**
 * Determina se um pedido pode ser editado no carrinho/PDV.
 *
 * Cenários permitidos:
 * 1. status === 'pendente'
 * 2. status === 'envio_pendente' OU status === 'aguardando_envio',
 *    DESDE QUE status_pagamento === 'aguardando_pagamento'.
 *
 * Bloqueios mantidos:
 * - Se status_pagamento === 'pago' (exceto status estrito 'pendente')
 * - Se em trânsito ou finalizado: 'saiu_para_entrega', 'enviado', 'concluido', 'cancelado'
 */
export function podeEditarPedido(
  pedidoOuStatus?: { status?: string; status_pagamento?: string } | string | null,
  statusPagamento?: string
): boolean {
  if (!pedidoOuStatus) return false;

  const status = typeof pedidoOuStatus === 'string' ? pedidoOuStatus : pedidoOuStatus.status;
  const statusPag = typeof pedidoOuStatus === 'object' ? pedidoOuStatus.status_pagamento : statusPagamento;

  if (!status) return false;

  // Bloqueio mantido: pedidos concluídos, cancelados ou em trânsito/expedição externa
  const statusBloqueados = ['enviado', 'entregue', 'concluido', 'cancelado'];
  if (statusBloqueados.includes(status)) {
    return false;
  }

  // 1. Status 'pendente': sempre permitido
  if (status === 'pendente') {
    return true;
  }

  // 2. Status 'aguardando_envio':
  // Permitido DESDE QUE o status_pagamento seja 'aguardando_pagamento' (ou não esteja pago)
  if (status === 'aguardando_envio') {
    const ehPago = statusPag === 'pago';
    const ehAguardando = statusPag === 'aguardando_pagamento' || !statusPag || statusPag === 'pendente';
    return !ehPago && ehAguardando;
  }

  return false;
}

/**
 * Informa se o status do pedido permite edição estrutural do carrinho (itens e quantidades).
 */
export function podeEditarItensPedido(status?: string, statusPagamento?: string): boolean {
  return podeEditarPedido(status, statusPagamento);
}

/**
 * Informa se o status do pedido permite aplicar ou alterar descontos.
 */
export function podeEditarDescontoPedido(status?: string, statusPagamento?: string): boolean {
  return podeEditarPedido(status, statusPagamento);
}

/**
 * Obtém a data de vencimento formatada e indicador de vencimento de um pedido com fiado.
 */
export function obterInfoVencimentoFiado(pedido: any): {
  dataIso: string | null;
  formatada: string;
  estaVencido: boolean;
  temVencimento: boolean;
} {
  let dataVenc: string | null = pedido?.data_vencimento_fiado || null;

  if (!dataVenc && pedido?.metadados) {
    try {
      const meta = typeof pedido.metadados === 'string' ? JSON.parse(pedido.metadados) : pedido.metadados;
      dataVenc = meta?.data_vencimento_fiado || null;
    } catch (e) {}
  }

  // Se não houver data explícita, calcular com base no prazo da forma fiado ou 30 dias a partir da venda
  if (!dataVenc && (pedido?.data_venda || pedido?.criado_em)) {
    let diasPrazo = 30;
    const pagFiado = (pedido?.pagamentos || []).find((p: any) => p.eh_pagamento_fiado || p.forma_pagamento?.tipo === 'fiado');
    if (pagFiado?.forma_pagamento?.prazo_dias) {
      diasPrazo = Number(pagFiado.forma_pagamento.prazo_dias) || 30;
    }
    const dataRef = new Date(pedido.data_venda || pedido.criado_em);
    dataRef.setDate(dataRef.getDate() + diasPrazo);
    const ano = dataRef.getFullYear();
    const mes = String(dataRef.getMonth() + 1).padStart(2, '0');
    const dia = String(dataRef.getDate()).padStart(2, '0');
    dataVenc = `${ano}-${mes}-${dia}`;
  }

  const hoje = obterDataOperacaoYMD();
  if (!dataVenc) {
    dataVenc = hoje;
  }

  // Regra: Vencido apenas a partir do dia seguinte ao vencimento.
  // Exemplo: Se vence dia 10, no dia 10 ainda está a vencer. Só considera vencido no dia 11 (dataVenc < hoje).
  const estaVencido = dataVenc < hoje;

  let formatada = '-';
  try {
    const [ano, mes, dia] = dataVenc.split('-');
    if (ano && mes && dia) {
      formatada = `${dia}/${mes}/${ano}`;
    } else {
      const d = new Date(dataVenc);
      formatada = d.toLocaleDateString('pt-BR');
    }
  } catch {
    formatada = dataVenc;
  }

  return {
    dataIso: dataVenc,
    formatada,
    estaVencido,
    temVencimento: !!dataVenc && formatada !== '-'
  };
}

/**
 * Retorna true se o pedido ou status informado for 'cancelado'.
 */
export function isPedidoCancelado(pedidoOuStatus?: { status?: string } | string | null): boolean {
  if (!pedidoOuStatus) return false;
  const status = typeof pedidoOuStatus === 'string' ? pedidoOuStatus : pedidoOuStatus.status;
  return status === 'cancelado';
}
