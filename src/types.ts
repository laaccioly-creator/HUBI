export type TipoDocumento = 'CPF' | 'CNPJ';
export type PerfilUsuario = 'owner' | 'admin' | 'gerente' | 'vendedor' | 'comum';
export type TipoUnidade = 'un' | 'kg' | 'l' | 'm';
export type TabelaPreco = 'varejo' | 'atacado' | 'autoatacado' | 'promocional';
export type TipoPagamento = 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'fiado' | 'outro';
export type TipoEntrega = 'retirada' | 'taxa_fixa' | 'bairro' | 'distancia_km';
export type OrigemVenda = 'pdv_mobile' | 'pdv_desktop' | 'catalogo_online';
export type StatusPedido = 'pendente' | 'confirmado' | 'em_producao' | 'em_expedicao' | 'entregue' | 'concluido' | 'cancelado';
export type TipoTransacao = 'ENTRADA' | 'SAIDA';
export type StatusTransacao = 'pendente' | 'pago' | 'atrasado' | 'cancelado';
export type FrequenciaRecorrencia = 'semanal' | 'mensal' | 'trimestral' | 'anual';
export type StatusCaixa = 'ABERTO' | 'FECHADO';

export interface Loja {
  id: string;
  nome_fantasia: string;
  razao_social?: string | null;
  tipo_documento?: TipoDocumento | null;
  numero_documento?: string | null;
  telefone?: string | null;
  whatsapp: string;
  email: string;
  instagram?: string | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_complemento?: string | null;
  endereco_bairro?: string | null;
  endereco_cidade?: string | null;
  endereco_estado?: string | null;
  endereco_cep?: string | null;
  sobre_loja?: string | null;
  url_logo?: string | null;
  url_banner?: string | null;
  cor_primaria: string;
  moeda: string;
  slug_catalogo: string;
  aceita_pedidos_online: boolean;
  resumo_whatsapp: boolean;
  instrucoes_pos_pedido?: string | null;
  valor_minimo_pedido: number;
  tipo_plano: string;
  desconto_padrao_atacado_percentual?: number | null;
  tipo_minimo_padrao_atacado?: 'quantidade' | 'valor' | 'hibrido' | null;
  qtd_minima_padrao_atacado?: number | null;
  qtd_minima_sku_padrao_atacado?: number | null;
  valor_minimo_padrao_atacado?: number | null;
  desconto_padrao_autoatacado_percentual?: number | null;
  tipo_minimo_padrao_autoatacado?: 'quantidade' | 'valor' | 'hibrido' | null;
  qtd_minima_padrao_autoatacado?: number | null;
  qtd_minima_sku_padrao_autoatacado?: number | null;
  valor_minimo_padrao_autoatacado?: number | null;
  criado_em?: string;
  atualizado_em?: string;
}

export interface RegrasPrecificacaoLoja {
  descontoAtacado: number;
  valorMinimoAtacado: number;
  qtdTotalMinimaAtacado: number;
  qtdMinimaSkuAtacado: number;

  descontoAutoatacado: number;
  valorMinimoAutoatacado: number;
  qtdTotalMinimaAutoatacado: number;
  qtdMinimaSkuAutoatacado: number;
}


export interface UnidadeMedida {
  id: string;
  loja_id: string;
  sigla: string;
  nome: string;
  permite_fracionado: boolean;
  padrao?: boolean;
  criado_em?: string;
}

export interface MetricasUsuario {
  hoje_vendas: number;
  hoje_faturamento: number;
  ontem_vendas: number;
  ontem_faturamento: number;
  semana_vendas: number;
  semana_faturamento: number;
  mes_vendas: number;
  mes_faturamento: number;
  dias30_vendas: number;
  dias30_faturamento: number;
  percentual_participacao_30d: number;
}

export interface UsuarioLoja {
  id: string;
  loja_id: string;
  usuario_auth_id?: string | null;
  nome_completo: string;
  email: string;
  whatsapp_atendimento?: string | null;
  perfil: PerfilUsuario;
  pode_uso_celular_pessoal?: boolean;
  pode_ver_transacoes_outros?: boolean;
  pode_dar_desconto?: boolean;
  pode_cadastrar_alterar_produtos?: boolean;
  pode_gerenciar_estoque?: boolean;
  pode_ativar_fiado?: boolean;
  pode_ver_preco_custo?: boolean;
  pode_exportar_relatorios?: boolean;
  pode_editar_vendas_passadas?: boolean;
  senha_hash?: string | null;
  ultimo_login?: string | null;
  ativo: boolean;
  criado_em?: string;

  // Campos calculados para estatísticas
  faturamento_30d?: number;
  vendas_count_30d?: number;
  percentual_participacao_30d?: number;
  metricas?: MetricasUsuario;
}

export interface Categoria {
  id: string;
  loja_id: string;
  nome: string;
  icone?: string | null;
  ordem_exibicao: number;
  ativo: boolean;
  criado_em?: string;
}

export interface Fornecedor {
  id: string;
  loja_id: string;
  nome: string;
  pessoa_contato?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  numero_documento?: string | null;
  observacoes?: string | null;
  criado_em?: string;
}

export interface Produto {
  id: string;
  loja_id: string;
  categoria_id?: string | null;
  fornecedor_id?: string | null;
  nome: string;
  codigo_interno?: string | null;
  codigo_barras?: string | null;
  descricao?: string | null;
  fotos_urls: string[];
  tipo_unidade: TipoUnidade;
  preco_custo: number;
  preco_venda_varejo: number;
  preco_venda_atacado?: number | null;
  tipo_minimo_atacado?: 'quantidade' | 'valor' | null;
  qtd_minima_atacado: number;
  valor_minimo_atacado?: number | null;
  preco_venda_autoatacado?: number | null;
  tipo_minimo_autoatacado?: 'quantidade' | 'valor' | null;
  qtd_minima_autoatacado: number;
  valor_minimo_autoatacado?: number | null;
  preco_promocional?: number | null;
  promocao_ativa: boolean;
  quantidade_estoque: number;
  estoque_minimo_alerta: number;
  tem_variacoes: boolean;
  rotulo_variacao_1?: string | null;
  rotulo_variacao_2?: string | null;
  eh_combo: boolean;
  data_validade?: string | null;
  exibir_catalogo: boolean;
  destaque: boolean;
  ativo: boolean;
  criado_em?: string;
  atualizado_em?: string;
  variacoes?: VariacaoProduto[];
  categoria?: Categoria | null;
}

export interface VariacaoProduto {
  id: string;
  loja_id: string;
  produto_id: string;
  valor_variacao_1: string;
  valor_variacao_2?: string | null;
  sku?: string | null;
  codigo_barras?: string | null;
  preco_custo?: number | null;
  preco_venda_varejo: number;
  preco_venda_atacado?: number | null;
  preco_venda_autoatacado?: number | null;
  preco_promocional?: number | null;
  quantidade_estoque: number;
  estoque_minimo_alerta: number;
  ativo: boolean;
  criado_em?: string;
}

export interface ItemCombo {
  id: string;
  loja_id: string;
  produto_combo_id: string;
  produto_filho_id: string;
  variacao_filho_id?: string | null;
  quantidade: number;
  criado_em?: string;
}

export interface Cliente {
  id: string;
  loja_id: string;
  nome: string;
  telefone?: string | null;
  telefone_is_whatsapp?: boolean;
  telefone2?: string | null;
  telefone2_is_whatsapp?: boolean;
  whatsapp?: string | null;
  email?: string | null;
  numero_documento?: string | null;
  tabela_preco_padrao: TabelaPreco;
  endereco_cep?: string | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_complemento?: string | null;
  endereco_bairro?: string | null;
  endereco_cidade?: string | null;
  endereco_estado?: string | null;
  endereco_principal?: string | null;
  endereco_secundario?: string | null;
  saldo_devedor_fiado: number;
  limite_credito: number;
  permite_fiado: boolean;
  data_aniversario?: string | null;
  observacoes?: string | null;
  criado_em?: string;
}

export interface FormaPagamento {
  id: string;
  loja_id: string;
  nome: string;
  tipo: TipoPagamento;
  taxa_percentual: number;
  taxa_fixa: number;
  maximo_parcelas: number;
  ativo: boolean;
  exibir_catalogo: boolean;
  criado_em?: string;
}

export interface FormaEntrega {
  id: string;
  loja_id: string;
  nome: string;
  tipo: TipoEntrega;
  valor_taxa: number;
  valor_por_km: number;
  tempo_estimado?: string | null;
  ativo: boolean;
  criado_em?: string;
}

export interface Pedido {
  id: string;
  loja_id: string;
  numero_pedido: number;
  cliente_id?: string | null;
  vendedor_id?: string | null;
  origem: OrigemVenda;
  tabela_preco_aplicada: TabelaPreco;
  status: StatusPedido;
  subtotal: number;
  valor_desconto: number;
  valor_frete: number;
  valor_total: number;
  valor_pago: number;
  saldo_devedor: number;
  fiado_quitado: boolean;
  endereco_entrega?: string | null;
  observacoes?: string | null;
  data_venda: string;
  data_entrega_agendada?: string | null;
  motivo_cancelamento?: string | null;
  criado_em?: string;
  atualizado_em?: string;
  cliente?: Cliente | null;
  vendedor?: UsuarioLoja | null;
  itens?: ItemPedido[];
  pagamentos?: PagamentoPedido[];
}

export interface ItemPedido {
  id: string;
  loja_id: string;
  pedido_id: string;
  produto_id: string;
  variacao_id?: string | null;
  tabela_preco_utilizada: TabelaPreco;
  nome_produto: string;
  rotulo_variacao?: string | null;
  preco_custo_unitario: number;
  preco_venda_unitario: number;
  quantidade: number;
  subtotal: number;
  observacoes?: string | null;
  criado_em?: string;
}

export interface PagamentoPedido {
  id: string;
  loja_id: string;
  pedido_id: string;
  forma_pagamento_id: string;
  valor: number;
  parcelas: number;
  valor_taxa: number;
  valor_liquido: number;
  data_pagamento: string;
  eh_pagamento_fiado: boolean;
  criado_em?: string;
  forma_pagamento?: FormaPagamento | null;
}

export interface TransacaoFinanceira {
  id: string;
  loja_id: string;
  tipo: TipoTransacao;
  categoria: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_pagamento?: string | null;
  status: StatusTransacao;
  eh_recorrente: boolean;
  frequencia_recorrencia?: FrequenciaRecorrencia | null;
  dia_vencimento_recorrencia?: number | null;
  pedido_id?: string | null;
  fornecedor_id?: string | null;
  criado_em?: string;
  atualizado_em?: string;
  fornecedor?: Fornecedor | null;
}

export interface Caixa {
  id: string;
  loja_id: string;
  usuario_id: string;
  data_abertura: string;
  data_fechamento?: string | null;
  saldo_inicial: number;
  saldo_final_declarado?: number | null;
  saldo_final_calculado?: number | null;
  diferenca_quebra?: number | null;
  status: StatusCaixa;
  observacoes?: string | null;
  usuario?: UsuarioLoja | null;
}
