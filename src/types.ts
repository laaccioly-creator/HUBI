export type TipoDocumento = 'CPF' | 'CNPJ';
export type PerfilUsuario = 'owner' | 'admin' | 'gerente' | 'vendedor' | 'comum';
export type TipoUnidade = 'un' | 'kg' | 'l' | 'm';
export type TabelaPreco = 'varejo' | 'atacado' | 'autoatacado' | 'promocional';
export type TipoPagamento = 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'fiado' | 'outro';
export type TipoEntrega = 'retirada' | 'taxa_fixa' | 'bairro' | 'distancia_km';
export type OrigemVenda = 'pdv_mobile' | 'pdv_desktop' | 'catalogo_online';
export type StatusPedido =
  | 'pendente'
  | 'confirmado'
  | 'em_separacao'
  | 'em_producao'
  | 'em_expedicao'
  | 'saiu_para_entrega'
  | 'pronto_para_retirar'
  | 'concluido'
  | 'cancelado';
export type StatusPagamento = 'aguardando_pagamento' | 'pago' | 'parcialmente_pago';
export type TipoTransacao = 'ENTRADA' | 'SAIDA';
export type StatusTransacao = 'pendente' | 'pago' | 'atrasado' | 'cancelado';
export type FrequenciaRecorrencia = 'semanal' | 'mensal' | 'trimestral' | 'anual';
export type StatusCaixa = 'ABERTO' | 'FECHADO';

export type ModoExibicaoCatalogo = 'lista' | 'grade' | 'instaview';
export type ComportamentoSemEstoque = 'ocultar' | 'indisponivel' | 'exibir';

export interface StatusPedidoPersonalizado {
  id: string;
  nome: string;
  cor: string;
  ativo: boolean;
}

export interface ConfiguracaoGeralLoja {
  tela_inicial_padrao?: 'inicio' | 'pdv' | 'pedidos' | 'produtos' | 'clientes' | 'historico' | 'estatisticas';
  moeda?: string;
  casas_decimais?: boolean;
  controlar_estoque?: boolean;
  transacoes_canceladas?: 'riscadas' | 'ocultar';
  ordenar_produtos_pdv?: 'cadastro' | 'alfabetica';
}

export interface PagamentosDigitaisConfig {
  provedor_ativo?: 'mercado_pago' | 'pagseguro' | 'google_pay' | 'asaas' | 'stripe' | 'picpay' | 'todos';
  mercado_pago?: {
    ativo?: boolean;
    public_key?: string;
    access_token?: string;
    taxa_credito_percentual?: number;
    taxa_pix_percentual?: number;
    prazo_dias?: number;
    max_parcelas?: number;
    repasse_juros?: boolean;
    client_id?: string;
    client_secret?: string;
  };
  pagseguro?: {
    ativo?: boolean;
    email?: string;
    token?: string;
    public_key?: string;
    taxa_credito_percentual?: number;
    taxa_pix_percentual?: number;
    prazo_dias?: number;
  };
  google_pay?: {
    ativo?: boolean;
    merchant_id?: string;
    merchant_name?: string;
  };
  asaas?: {
    ativo?: boolean;
    api_key?: string;
    ambiente?: 'producao' | 'sandbox';
  };
  stripe?: {
    ativo?: boolean;
    publishable_key?: string;
    secret_key?: string;
  };
  picpay?: {
    ativo?: boolean;
    token?: string;
    seller_token?: string;
  };
}

export interface PrazosTaxasMaquininha {
  credito_ativo?: boolean;
  credito_dias?: number;
  credito_taxa_percentual?: number;
  debito_ativo?: boolean;
  debito_dias?: number;
  debito_taxa_percentual?: number;
}

export interface OpcoesPagamentoDetalhes {
  permitir_fiado?: boolean;
  pix_ativo?: boolean;
  pix_chave?: string;
  pix_orientacoes?: string;
  dinheiro_ativo?: boolean;
  dinheiro_orientacoes?: string;
  debito_ativo?: boolean;
  debito_orientacoes?: string;
  credito_ativo?: boolean;
  credito_orientacoes?: string;
  outros_ativo?: boolean;
  outros_orientacoes?: string;
}

export interface IntegracoesParceiros {
  facebook_pixel_id?: string;
  facebook_catalog_feed_ativo?: boolean;
  google_merchant_feed_ativo?: boolean;
  tiktok_pixel_id?: string;
  tiktok_catalog_feed_ativo?: boolean;
}

export interface ConfiguracoesExtrasLoja {
  geral?: ConfiguracaoGeralLoja;
  preferencias_gerais?: {
    casas_decimais?: boolean;
    transacoes_canceladas?: 'riscadas' | 'ocultar';
  };
  catalogo?: {
    publicar_catalogo?: boolean;
    modo_exibicao?: ModoExibicaoCatalogo;
    produtos_sem_estoque?: ComportamentoSemEstoque;
    exibir_banner?: boolean;
    titulo_banner?: string;
  };
  taxas_venda?: {
    usar_taxa_pdv?: boolean;
    nome_taxa_pdv?: string;
    valor_taxa_pdv?: number;
    tipo_taxa_pdv?: 'percentual' | 'fixo';
    aplicar_taxa_pdv?: 'adicionar' | 'incluida';
    taxa_pdv_opcional?: boolean;
    usar_taxa_catalogo?: boolean;
    nome_taxa_catalogo?: string;
    valor_taxa_catalogo?: number;
    tipo_taxa_catalogo?: 'percentual' | 'fixo';
    aplicar_taxa_catalogo?: 'adicionar' | 'incluida';
    taxa_catalogo_somente_entrega?: boolean;
  };
  status_pedidos_ativos?: {
    em_producao?: boolean;
    em_expedicao?: boolean;
    saiu_para_entrega?: boolean;
    pronto_para_retirar?: boolean;
    status_personalizados?: StatusPedidoPersonalizado[];
  };
  recibo?: {
    adicionar_cliente?: boolean;
    exibir_codigo_produto?: boolean;
    cabecalho?: string;
    rodape?: string;
    tipo_impressao_padrao?: 'termica_80mm' | 'termica_58mm' | 'a4';
  };
  entrega_retirada?: {
    trabalho_com_entregas?: boolean;
    descricao_entregas?: string;
    trabalho_com_retirada?: boolean;
    descricao_retirada?: string;
  };
  controlar_estoque?: boolean;
  pagamentos?: OpcoesPagamentoDetalhes;
  pagamentos_digitais?: PagamentosDigitaisConfig;
  prazos_taxas_maquininhas?: PrazosTaxasMaquininha;
  integracoes_parceiros?: IntegracoesParceiros;
  cores_produtos?: { [produto_id: string]: string };
  cor_padrao_etiqueta_produtos?: string;
}

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
  configuracoes_extras?: ConfiguracoesExtrasLoja | null;
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
  endereco?: string | null;
  ativo?: boolean;
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
  cor_etiqueta?: string | null;
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
  saldo_credito?: number;
  permite_fiado: boolean;
  data_aniversario?: string | null;
  observacoes?: string | null;
  criado_em?: string;
}

export interface MovimentacaoSaldoCliente {
  id: string;
  loja_id: string;
  cliente_id: string;
  tipo: 'adicionar' | 'subtrair';
  valor: number;
  saldo_anterior: number;
  saldo_posterior: number;
  observacao?: string | null;
  usuario_id?: string | null;
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
  descricao?: string | null;
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
  status_pagamento?: StatusPagamento;
  subtotal: number;
  valor_desconto: number;
  desconto_percentual?: number | null;
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
  itens_pedido?: ItemPedido[];
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
  forma_pagamento?: string | null;
  origem_receita?: string | null;
  observacoes?: string | null;
  tipo_recorrencia?: 'gasto_fixo' | 'parcelas' | string | null;
  parcelas_total?: number | null;
  parcela_numero?: number | null;
  caixa_id?: string | null;
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
  turno?: string | null;
  numero_caixa?: string | number | null;
  total_vendas_dinheiro?: number | null;
  total_vendas_pix?: number | null;
  total_vendas_debito?: number | null;
  total_vendas_credito?: number | null;
  total_suprimentos?: number | null;
  total_sangrias?: number | null;
  total_despesas_caixa?: number | null;
  usuario?: UsuarioLoja | null;
}

export interface CaixaMovimentacao {
  id: string;
  caixa_id: string;
  loja_id: string;
  usuario_id?: string | null;
  tipo: 'abertura' | 'venda' | 'sangria' | 'suprimento' | 'despesa' | 'fechamento';
  forma_pagamento?: string | null;
  valor: number;
  descricao?: string | null;
  observacao?: string | null;
  criado_em?: string;
  usuario?: UsuarioLoja | null;
}
