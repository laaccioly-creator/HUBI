// =============================================================================
// Tipagens do Módulo de Agendamento de Serviços Omnichannel do HUBI
// =============================================================================

import type { Produto, UsuarioLoja, Cliente } from '../types';

/**
 * Define onde o serviço pode ser prestado
 */
export type LocalPrestacaoServico = 'loja' | 'externo' | 'ambos';

/**
 * Modalidade efetiva de execução do agendamento específico
 */
export type ModalidadeLocalPrestacao = 'loja' | 'externo';

/**
 * Ciclo de vida operacional do agendamento
 */
export type StatusAgendamento =
  | 'agendado'
  | 'confirmado'
  | 'em_atendimento'
  | 'concluido'
  | 'cancelado'
  | 'nao_compareceu';

/**
 * Dia da semana no formato ISO/PostgreSQL (0 = Domingo a 6 = Sábado)
 */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DIA_SEMANA_NOMES: Record<DiaSemana, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado'
};

/**
 * Vínculo Serviço <-> Colaborador habilitado (public.servico_profissionais)
 */
export interface ServicoProfissional {
  id: string;
  loja_id: string;
  produto_id: string;
  usuario_id: string;
  duracao_customizada_minutos?: number | null;
  comissao_percentual?: number | null;
  ativo: boolean;
  criado_em?: string;

  // Relações opcionais após JOIN
  produto?: Produto;
  usuario?: UsuarioLoja;
}

/**
 * Grade de expediente de trabalho do colaborador por dia da semana (public.profissional_horarios)
 */
export interface ProfissionalHorario {
  id: string;
  loja_id: string;
  usuario_id: string;
  dia_semana: DiaSemana;
  ativo: boolean;
  hora_inicio: string; // Ex: '08:00'
  hora_fim: string; // Ex: '18:00'
  tem_intervalo: boolean;
  intervalo_inicio?: string | null; // Ex: '12:00'
  intervalo_fim?: string | null; // Ex: '13:00'
  criado_em?: string;
  atualizado_em?: string;

  // Relação opcional
  usuario?: UsuarioLoja;
}

/**
 * Registro de agendamento de serviço operacional (public.agendamentos_servicos)
 */
export interface AgendamentoServico {
  id: string;
  loja_id: string;
  pedido_id?: string | null;
  item_pedido_id?: string | null;
  produto_id: string;
  profissional_id: string;
  cliente_id?: string | null;
  cliente_nome: string;
  cliente_whatsapp: string;
  data_agendamento: string; // Formato 'YYYY-MM-DD'
  hora_inicio: string; // Formato 'HH:MM' ou 'HH:MM:SS'
  hora_fim: string; // Formato 'HH:MM' ou 'HH:MM:SS'
  duracao_minutos?: number;
  data_hora_inicio: string; // ISO 8601
  data_hora_fim: string; // ISO 8601
  modalidade_local: ModalidadeLocalPrestacao;
  cliente_endereco_id?: string | null;
  endereco_prestacao_snapshot?: string | null;
  status_agendamento: StatusAgendamento;
  token_confirmacao: string;
  lembrete_enviado: boolean;
  lembrete_enviado_em?: string | null;
  confirmado_pelo_cliente_em?: string | null;
  cancelado_em?: string | null;
  motivo_cancelamento?: string | null;
  qtd_remarcacoes: number;
  data_hora_anterior?: string | null;
  remarcado_em?: string | null;
  observacoes?: string | null;
  criado_por_usuario_id?: string | null;
  criado_em?: string;
  atualizado_em?: string;

  // Relações opcionais populadas em queries compostas
  produto?: Produto;
  profissional?: UsuarioLoja;
  cliente?: Cliente;
  pedido?: {
    id: string;
    numero_pedido: number;
    levar_produto_no_atendimento?: boolean;
  } | null;
  itens_fisicos_levar?: Array<{
    nome_produto: string;
    rotulo_variacao?: string | null;
    quantidade: number;
  }>;
}

/**
 * Representação de faixa de horário ocupada retornada pela RPC pública
 */
export interface HorarioOcupado {
  hora_inicio: string; // 'HH:MM:SS'
  hora_fim: string; // 'HH:MM:SS'
}

/**
 * Slot disponível para seleção pelo cliente ou operador no calendário
 */
export interface SlotHorarioDisponivel {
  hora_inicio: string; // 'HH:MM'
  hora_fim: string; // 'HH:MM'
  disponivel: boolean;
  motivo_indisponibilidade?: string;
}

/**
 * Payload completo retornado pela RPC pública obter_agendamento_por_token_publico
 */
export interface AgendamentoPublicoDetalhes {
  id: string;
  loja_id: string;
  loja_nome: string;
  loja_whatsapp: string;
  loja_slug: string;
  pedido_id?: string | null;
  produto_id: string;
  produto_nome: string;
  duracao_minutos: number;
  preco_venda_varejo: number;
  profissional_id: string;
  profissional_nome: string;
  especialidade_cargo?: string | null;
  cliente_id?: string | null;
  cliente_nome: string;
  cliente_whatsapp: string;
  data_agendamento: string;
  hora_inicio: string;
  hora_fim: string;
  data_hora_inicio: string;
  data_hora_fim: string;
  modalidade_local: ModalidadeLocalPrestacao;
  endereco_prestacao_snapshot?: string | null;
  status_agendamento: StatusAgendamento;
  token_confirmacao: string;
  lembrete_enviado: boolean;
  confirmado_pelo_cliente_em?: string | null;
  cancelado_em?: string | null;
  motivo_cancelamento?: string | null;
  qtd_remarcacoes: number;
  limite_remarcacoes_cliente: number;
  antecedencia_minima_remarcacao_horas: number;
  data_hora_anterior?: string | null;
  remarcado_em?: string | null;
  observacoes?: string | null;
  criado_em: string;
}

/**
 * Ações permitidas para o cliente final via link público
 */
export type AcaoClienteAgendamento = 'confirmar' | 'cancelar' | 'remarcar';

/**
 * Parâmetros enviados para a RPC processar_acao_cliente_agendamento
 */
export interface ParametrosProcessarAcaoAgendamento {
  p_token: string;
  p_acao: AcaoClienteAgendamento;
  p_nova_data?: string | null; // 'YYYY-MM-DD'
  p_nova_hora_inicio?: string | null; // 'HH:MM'
  p_novo_profissional_id?: string | null;
  p_motivo?: string | null;
}

/**
 * Retorno da RPC processar_acao_cliente_agendamento
 */
export interface ResultadoAcaoAgendamento {
  sucesso: boolean;
  mensagem: string;
  codigo?: string;
  status?: StatusAgendamento;
  nova_data?: string;
  nova_hora_inicio?: string;
  nova_hora_fim?: string;
  qtd_remarcacoes?: number;
}

/**
 * Parâmetros de agenda configurados no nível da loja (tabela public.lojas)
 */
export interface ConfiguracaoAgendaLoja {
  wpp_auto_agendamento_criado: boolean;
  wpp_auto_lembrete_agendamento: boolean;
  antecedencia_lembrete_horas: number;
  limite_remarcacoes_cliente: number;
  antecedencia_minima_remarcacao_horas: number;
}

/**
 * Metadados de agendamento acoplados a um item do carrinho no PDV
 */
export interface ItemAgendamentoInfo {
  profissional_id: string;
  profissional_nome: string;
  data_agendamento: string; // 'YYYY-MM-DD'
  hora_inicio: string; // 'HH:MM'
  hora_fim: string; // 'HH:MM'
  modalidade_local: ModalidadeLocalPrestacao; // 'loja' | 'externo'
  cliente_id?: string | null;
  cliente_endereco_id?: string | null;
  endereco_prestacao_snapshot?: string | null;
  observacoes?: string | null;
}
