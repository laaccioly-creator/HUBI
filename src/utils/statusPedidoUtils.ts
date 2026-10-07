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
 * Configuração padrão de fallback caso a loja ainda não possua o nó salvo
 */
export const STATUS_PEDIDOS_ATIVOS_PADRAO = {
  em_separacao: true,
  em_expedicao: true,
  aguardando_envio: true,
  enviado: true,
  entregue: true,
  pronto_para_retirar: true
};

/**
 * Verifica se um status de pedido está ativo nas configurações da loja.
 * - 'todos', 'pendente', 'confirmado', 'concluido', 'cancelado' e 'vencido' são fixos/obrigatórios e sempre ativos.
 * - 'em_separacao', 'em_expedicao', 'aguardando_envio', 'enviado', 'entregue' e 'pronto_para_retirar'
 *   são operacionais opcionais e dependem das colunas tipadas BOOLEAN na tabela lojas (ou fallback para status_pedidos_ativos).
 */
export function isStatusPedidoAtivo(
  statusId: string,
  loja?: Loja | null
): boolean {
  if (['todos', 'pendente', 'confirmado', 'concluido', 'vencido', 'cancelado'].includes(statusId)) {
    return true;
  }

  const configStatus = loja?.configuracoes_extras?.status_pedidos_ativos;

  switch (statusId) {
    case 'em_separacao':
      if (typeof loja?.status_em_separacao === 'boolean') return loja.status_em_separacao;
      return configStatus?.em_separacao ?? configStatus?.em_producao ?? false;
    case 'em_producao':
      if (typeof loja?.status_em_separacao === 'boolean') return loja.status_em_separacao;
      return configStatus?.em_separacao ?? configStatus?.em_producao ?? false;
    case 'em_expedicao':
      if (typeof loja?.status_em_expedicao === 'boolean') return loja.status_em_expedicao;
      return configStatus?.em_expedicao ?? false;
    case 'aguardando_envio':
    case 'envio_pendente':
      if (typeof loja?.status_aguardando_envio === 'boolean') return loja.status_aguardando_envio;
      return configStatus?.aguardando_envio ?? false;
    case 'enviado':
    case 'saiu_para_entrega':
      if (typeof loja?.status_enviado === 'boolean') return loja.status_enviado;
      return configStatus?.enviado ?? configStatus?.saiu_para_entrega ?? false;
    case 'entregue':
      if (typeof loja?.status_entregue === 'boolean') return loja.status_entregue;
      return configStatus?.entregue ?? false;
    case 'pronto_para_retirar':
      if (typeof loja?.status_pronto_para_retirar === 'boolean') return loja.status_pronto_para_retirar;
      return configStatus?.pronto_para_retirar ?? false;
    default: {
      // Verificar se é um status personalizado ativo
      const custom = configStatus?.status_personalizados?.find((s) => s.id === statusId);
      return custom ? Boolean(custom.ativo) : false;
    }
  }
}

/**
 * Retorna a lista de abas visíveis na tela de pedidos conforme a configuração da loja.
 * - Fixas: 'todos', 'pendente', 'confirmado', 'vencido', 'cancelado'
 * - Opcionais: 'em_separacao', 'em_expedicao', 'aguardando_envio', 'enviado', 'entregue', 'pronto_para_retirar'
 */
export function obterAbasStatusVisiveis(loja?: Loja | null): { id: string; label: string }[] {
  const abas: { id: string; label: string }[] = [
    { id: 'todos', label: 'Todos os status' },
    { id: 'pendente', label: 'Pendente' },
    { id: 'confirmado', label: 'Confirmado' }
  ];

  if (isStatusPedidoAtivo('em_separacao', loja)) {
    abas.push({ id: 'em_separacao', label: 'Em separação' });
  }

  if (isStatusPedidoAtivo('em_expedicao', loja)) {
    abas.push({ id: 'em_expedicao', label: 'Em expedição' });
  }

  if (isStatusPedidoAtivo('aguardando_envio', loja)) {
    abas.push({ id: 'aguardando_envio', label: 'Aguardando envio' });
  }

  if (isStatusPedidoAtivo('enviado', loja)) {
    abas.push({ id: 'enviado', label: 'Enviado' });
  }

  if (isStatusPedidoAtivo('entregue', loja)) {
    abas.push({ id: 'entregue', label: 'Entregue' });
  }

  if (isStatusPedidoAtivo('pronto_para_retirar', loja)) {
    abas.push({ id: 'pronto_para_retirar', label: 'Pronto para retirar' });
  }

  // Status personalizados ativos
  const customizados = loja?.configuracoes_extras?.status_pedidos_ativos?.status_personalizados || [];
  customizados.forEach((st) => {
    if (st.ativo) {
      abas.push({ id: st.id, label: st.nome });
    }
  });

  // Abas fixas finais: monitoramento de fiados vencidos e pedidos cancelados
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
  ehRetiradaBalcao: boolean = false
): { id: StatusPedido; label: string }[] {
  // Pedidos cancelados e concluídos são estados finais consolidados
  if (!statusAtual || statusAtual === 'cancelado' || statusAtual === 'concluido') {
    return [];
  }

  // De pendente: permite apenas Confirmado ou Cancelado
  if (statusAtual === 'pendente') {
    return [
      { id: 'confirmado', label: 'Confirmado' },
      { id: 'cancelado', label: 'Cancelar Pedido' }
    ];
  }

  const opcoes: { id: StatusPedido; label: string }[] = [];

  // De confirmado: Permite transitar para Em separação (se ativo), Aguardando envio (se ativo), Pronto para retirar (se ativo e entrega balcão) ou Cancelado
  if (statusAtual === 'confirmado') {
    if (isStatusPedidoAtivo('em_separacao', loja)) {
      opcoes.push({ id: 'em_separacao', label: 'Em separação' });
    }
    if (isStatusPedidoAtivo('aguardando_envio', loja)) {
      opcoes.push({ id: 'aguardando_envio', label: 'Aguardando envio' });
    }
    if (ehRetiradaBalcao && isStatusPedidoAtivo('pronto_para_retirar', loja)) {
      opcoes.push({ id: 'pronto_para_retirar', label: 'Pronto para retirar' });
    }
    opcoes.push({ id: 'cancelado', label: 'Cancelar Pedido' });
    return opcoes;
  }

  // De em_separacao: Permite transitar para Em expedição (se ativo), Aguardando envio (se ativo), Pronto para retirar (se ativo) ou Cancelado
  if (statusAtual === 'em_separacao' || statusAtual === 'em_producao') {
    if (isStatusPedidoAtivo('em_expedicao', loja)) {
      opcoes.push({ id: 'em_expedicao', label: 'Em expedição' });
    }
    if (isStatusPedidoAtivo('aguardando_envio', loja)) {
      opcoes.push({ id: 'aguardando_envio', label: 'Aguardando envio' });
    }
    if (isStatusPedidoAtivo('pronto_para_retirar', loja)) {
      opcoes.push({ id: 'pronto_para_retirar', label: 'Pronto para retirar' });
    }
    opcoes.push({ id: 'cancelado', label: 'Cancelar Pedido' });
    return opcoes;
  }

  // De em_expedicao: Permite transitar para Aguardando envio (se ativo), Pronto para retirar (se ativo) ou Cancelado
  if (statusAtual === 'em_expedicao') {
    if (isStatusPedidoAtivo('aguardando_envio', loja)) {
      opcoes.push({ id: 'aguardando_envio', label: 'Aguardando envio' });
    }
    if (isStatusPedidoAtivo('pronto_para_retirar', loja)) {
      opcoes.push({ id: 'pronto_para_retirar', label: 'Pronto para retirar' });
    }
    opcoes.push({ id: 'cancelado', label: 'Cancelar Pedido' });
    return opcoes;
  }

  // De aguardando_envio: Permite transitar para Enviado ou Cancelado
  if (statusAtual === 'aguardando_envio' || statusAtual === 'envio_pendente') {
    if (isStatusPedidoAtivo('enviado', loja)) {
      opcoes.push({ id: 'enviado', label: 'Enviado' });
    }
    opcoes.push({ id: 'cancelado', label: 'Cancelar Pedido' });
    return opcoes;
  }

  // De enviado: Permite transitar para Entregue ou retornar para Aguardando envio (estorno operacional)
  if (statusAtual === 'enviado' || statusAtual === 'saiu_para_entrega') {
    if (isStatusPedidoAtivo('entregue', loja)) {
      opcoes.push({ id: 'entregue', label: 'Entregue' });
    }
    if (isStatusPedidoAtivo('aguardando_envio', loja)) {
      opcoes.push({ id: 'aguardando_envio', label: 'Retornar para Aguardando envio' });
    }
    opcoes.push({ id: 'cancelado', label: 'Cancelar Pedido' });
    return opcoes;
  }

  // De pronto_para_retirar: Permite transitar para Entregue / Concluído ou Cancelado
  if (statusAtual === 'pronto_para_retirar') {
    if (isStatusPedidoAtivo('entregue', loja)) {
      opcoes.push({ id: 'entregue', label: 'Entregue' });
    }
    opcoes.push({ id: 'concluido', label: 'Concluído' });
    opcoes.push({ id: 'cancelado', label: 'Cancelar Pedido' });
    return opcoes;
  }

  // De entregue: Permite transitar para Concluído
  if (statusAtual === 'entregue') {
    opcoes.push({ id: 'concluido', label: 'Concluído' });
    opcoes.push({ id: 'cancelado', label: 'Cancelar Pedido' });
    return opcoes;
  }

  // Status especiais (vencido, etc.)
  if (statusAtual === 'vencido') {
    opcoes.push({ id: 'concluido', label: 'Concluído' });
    opcoes.push({ id: 'cancelado', label: 'Cancelar Pedido' });
    return opcoes;
  }

  opcoes.push({ id: 'cancelado', label: 'Cancelar Pedido' });
  return opcoes;
}

/**
 * Valida se uma transição de status é permitida pela Máquina de Estados do pedido.
 */
export function validarTransicaoStatusPedido(
  statusAtual?: string,
  novoStatus?: string,
  estaQuitado: boolean = false,
  ehRetiradaBalcao: boolean = false,
  loja?: Loja | null
): { permitido: boolean; motivo?: string; requerPagamento?: boolean } {
  if (!statusAtual || !novoStatus || statusAtual === novoStatus) {
    return { permitido: true };
  }

  // Pedidos cancelados e concluídos são estritamente imutáveis
  if (statusAtual === 'cancelado' || statusAtual === 'concluido') {
    return {
      permitido: false,
      motivo: `Pedidos com status "${ROTULOS_STATUS_PEDIDO[statusAtual] || statusAtual}" são definitivos e não permitem alteração.`
    };
  }

  // Cancelamento é permitido a partir de qualquer estado não final
  if (novoStatus === 'cancelado') {
    return { permitido: true };
  }

  // Validação do status ativo nas configurações da loja
  if (loja && !isStatusPedidoAtivo(novoStatus, loja)) {
    return {
      permitido: false,
      motivo: `O status "${ROTULOS_STATUS_PEDIDO[novoStatus] || novoStatus}" está desativado nas configurações da loja.`
    };
  }

  // Trava financeira: avanços operacionais exigem quitação do pedido
  const statusAvancoOperacional = [
    'em_separacao',
    'em_expedicao',
    'aguardando_envio',
    'enviado',
    'pronto_para_retirar',
    'entregue',
    'concluido'
  ];

  if (statusAvancoOperacional.includes(novoStatus) && !estaQuitado) {
    return {
      permitido: false,
      motivo: 'Este pedido ainda não foi pago. Efetue o recebimento antes de avançar para separação ou envio.',
      requerPagamento: true
    };
  }

  // 1. Status Pendente só pode evoluir para Confirmado (ou Cancelado)
  if (statusAtual === 'pendente') {
    if (novoStatus !== 'confirmado') {
      return {
        permitido: false,
        motivo: 'Pedidos pendentes só podem evoluir para Confirmado. Confirme o pedido antes de avançar.'
      };
    }
    return { permitido: true };
  }

  // 2. Não permitir retornar para Pendente
  if (novoStatus === 'pendente') {
    return {
      permitido: false,
      motivo: 'Pedidos confirmados ou operacionais não podem retornar para Pendente.'
    };
  }

  // 3. Regras de transição do fluxo
  if (statusAtual === 'confirmado') {
    const permitidos = ['em_separacao', 'aguardando_envio', 'cancelado'];
    if (ehRetiradaBalcao) permitidos.push('pronto_para_retirar');
    if (!permitidos.includes(novoStatus)) {
      return {
        permitido: false,
        motivo: 'A partir de Confirmado, o pedido pode avançar para Em separação, Aguardando envio ou Pronto para retirar.'
      };
    }
  }

  if (statusAtual === 'em_separacao' || statusAtual === 'em_producao') {
    const permitidos = ['em_expedicao', 'aguardando_envio', 'pronto_para_retirar', 'cancelado'];
    if (!permitidos.includes(novoStatus)) {
      return {
        permitido: false,
        motivo: 'A partir de Em separação, o pedido pode avançar para Em expedição, Aguardando envio ou Pronto para retirar.'
      };
    }
  }

  if (statusAtual === 'em_expedicao') {
    const permitidos = ['aguardando_envio', 'pronto_para_retirar', 'cancelado'];
    if (!permitidos.includes(novoStatus)) {
      return {
        permitido: false,
        motivo: 'A partir de Em expedição, o pedido pode avançar para Aguardando envio ou Pronto para retirar.'
      };
    }
  }

  if (statusAtual === 'aguardando_envio' || statusAtual === 'envio_pendente') {
    const permitidos = ['enviado', 'cancelado'];
    if (!permitidos.includes(novoStatus)) {
      return {
        permitido: false,
        motivo: 'A partir de Aguardando envio, o pedido pode avançar para Enviado ou Cancelado.'
      };
    }
  }

  if (statusAtual === 'enviado' || statusAtual === 'saiu_para_entrega') {
    const permitidos = ['entregue', 'aguardando_envio', 'cancelado'];
    if (!permitidos.includes(novoStatus)) {
      return {
        permitido: false,
        motivo: 'A partir de Enviado, o pedido pode avançar para Entregue ou retornar para Aguardando envio.'
      };
    }
  }

  if (statusAtual === 'pronto_para_retirar') {
    const permitidos = ['entregue', 'concluido', 'cancelado'];
    if (!permitidos.includes(novoStatus)) {
      return {
        permitido: false,
        motivo: 'A partir de Pronto para retirar, o pedido pode avançar para Entregue, Concluído ou Cancelado.'
      };
    }
  }

  if (statusAtual === 'entregue') {
    const permitidos = ['concluido', 'cancelado'];
    if (!permitidos.includes(novoStatus)) {
      return {
        permitido: false,
        motivo: 'A partir de Entregue, o pedido pode ser finalizado como Concluído.'
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
 * 2. status === 'aguardando_envio',
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
