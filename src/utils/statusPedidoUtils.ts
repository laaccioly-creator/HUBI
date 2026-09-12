import { StatusPedido, Loja } from '../types';
import { obterDataOperacaoYMD } from './dataOperacao';

export const ROTULOS_STATUS_PEDIDO: Record<string, string> = {
  todos: 'Todos os status',
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  em_separacao: 'Em separação',
  em_producao: 'Em produção',
  em_expedicao: 'Em expedição',
  saiu_para_entrega: 'Saiu para Entrega',
  pronto_para_retirar: 'Pronto para retirar',
  concluido: 'Concluído',
  vencido: 'Vencido',
  cancelado: 'Cancelado'
};

/**
 * Verifica se um status de pedido está ativo nas configurações da loja.
 * - 'pendente', 'confirmado', 'concluido', 'vencido' e 'cancelado' são fixos e sempre ativos.
 * - 'em_producao', 'em_expedicao', 'saiu_para_entrega' e 'pronto_para_retirar'
 *   dependem das opções marcadas em Configurações > Pedidos e Vendas > Status de Pedido.
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
    case 'em_producao':
      return configStatus?.em_producao ?? true;
    case 'em_expedicao':
      return configStatus?.em_expedicao ?? true;
    case 'saiu_para_entrega':
      return configStatus?.saiu_para_entrega ?? true;
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

  if (isStatusPedidoAtivo('saiu_para_entrega', loja)) {
    abas.push({ id: 'saiu_para_entrega', label: 'Saiu para Entrega' });
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

  if (isStatusPedidoAtivo('saiu_para_entrega', loja) || statusAtual === 'saiu_para_entrega') {
    opcoes.push({ id: 'saiu_para_entrega', label: 'Saiu para Entrega' });
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

  // Cancelamento é permitido a partir de qualquer status que não seja concluído
  if (novoStatus === 'cancelado') {
    if (statusAtual === 'concluido') {
      return { permitido: false, motivo: 'Pedidos já concluídos não podem ser cancelados diretamente por este seletor.' };
    }
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
 * Informa se o status do pedido permite edição estrutural do carrinho (itens e quantidades).
 * Apenas o status 'pendente' permite alteração estrutural de itens.
 */
export function podeEditarItensPedido(status?: string): boolean {
  return status === 'pendente';
}

/**
 * Informa se o status do pedido permite aplicar ou alterar descontos.
 * Permitido em 'pendente' e 'confirmado'.
 */
export function podeEditarDescontoPedido(status?: string): boolean {
  return status === 'pendente' || status === 'confirmado';
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
