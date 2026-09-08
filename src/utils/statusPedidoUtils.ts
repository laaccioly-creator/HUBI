import { StatusPedido, Loja } from '../types';

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
  cancelado: 'Cancelado'
};

/**
 * Verifica se um status de pedido está ativo nas configurações da loja.
 * - 'pendente', 'confirmado', 'concluido' e 'cancelado' são fixos e sempre ativos.
 * - 'em_producao', 'em_expedicao', 'saiu_para_entrega' e 'pronto_para_retirar'
 *   dependem das opções marcadas em Configurações > Pedidos e Vendas > Status de Pedido.
 */
export function isStatusPedidoAtivo(
  statusId: string,
  loja?: Loja | null
): boolean {
  if (['todos', 'pendente', 'confirmado', 'concluido', 'cancelado'].includes(statusId)) {
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

  abas.push({ id: 'cancelado', label: 'Cancelado' });

  return abas;
}

/**
 * Retorna as opções disponíveis para alterar o status de um pedido.
 * Respeita estritamente os status marcados como ativos nas configurações da loja.
 * Se o pedido já estiver em um status desativado, mantém esse status como opção visível
 * para não desconfigurar o seletor atual, mas impede a seleção de outros status inativos.
 */
export function obterOpcoesStatusAlteracao(
  loja?: Loja | null,
  statusAtual?: string,
  incluirConcluido: boolean = false
): { id: StatusPedido; label: string }[] {
  const opcoes: { id: StatusPedido; label: string }[] = [
    { id: 'pendente', label: 'Pendente' },
    { id: 'confirmado', label: 'Confirmado' }
  ];

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

  if (incluirConcluido) {
    opcoes.push({ id: 'concluido', label: 'Concluído' });
  }

  opcoes.push({ id: 'cancelado', label: 'Cancelado' });

  return opcoes;
}
