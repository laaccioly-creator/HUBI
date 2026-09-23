export type TipoAtendimento = 'retirada' | 'entrega';
export type ProvedorFrete = 'uber' | 'melhor_envio' | 'retirada_loja' | 'frete_proprio';

export type TipoOperacaoEnvio = 
  | 'retirada' 
  | 'frota_propria' 
  | 'motoboy' 
  | 'app_entrega' 
  | 'correios' 
  | 'transportadora';

export interface DadosDespachoEnvio {
  tipo_operacao: TipoOperacaoEnvio;
  valor_frete: number;
  // Campos para frota_propria / motoboy
  nome_entregador?: string;
  contato_entregador?: string;
  // Campos para app_entrega (Uber / 99 / etc.)
  nome_app?: 'Uber' | '99' | 'Lalamove' | 'Outro' | string;
  pin_entrega?: string; // Código numérico de 4 dígitos
  link_rastreio?: string;
  // Campos para correios
  servico_correios?: 'PAC' | 'SEDEX';
  codigo_rastreio?: string;
  // Campos para transportadora
  nome_transportadora?: string;
}

export interface LojaShippingConfig {
  id: string;
  loja_id: string;
  origem_cep: string;
  origem_logradouro: string;
  origem_numero: string;
  origem_complemento?: string | null;
  origem_bairro: string;
  origem_cidade: string;
  origem_uf: string;
  origem_latitude?: number | null;
  origem_longitude?: number | null;
  uber_customer_id?: string | null;
  uber_client_id?: string | null;
  uber_client_secret?: string | null;
  uber_sandbox_mode: boolean;
  uber_ativo: boolean;
  melhor_envio_token?: string | null;
  melhor_envio_sandbox_mode: boolean;
  melhor_envio_ativo: boolean;
  permite_retirada_loja: boolean;
  retirada_balcao_ativa: boolean;
  retirada_loja_ativa?: boolean;
  frete_gratis_ativo: boolean;
  frete_gratis_valor_minimo: number;
  frete_proprio_ativo?: boolean;
  frete_proprio_tipo_cobranca?: 'fixo' | 'manual' | 'gratis';
  frete_proprio_valor_padrao?: number;
  embalagem_padrao_peso_kg?: number;
  embalagem_padrao_altura_cm?: number;
  embalagem_padrao_largura_cm?: number;
  embalagem_padrao_comprimento_cm?: number;
  criado_em?: string;
  atualizado_em?: string;
}

export interface ClienteEndereco {
  id: string;
  cliente_id: string;
  identificador?: string | null;
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  latitude?: number | null;
  longitude?: number | null;
  is_principal: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

export interface PedidoEntrega {
  id?: string;
  pedido_id: string;
  forma_entrega_id?: string | null;
  forma_entrega_nome?: string | null;
  tipo_entrega?: 'retirada' | 'proprio' | 'transportadora' | 'manual' | string | null;
  tipo_atendimento: TipoAtendimento;
  cliente_endereco_id?: string | null;
  destino_cep?: string | null;
  destino_logradouro?: string | null;
  destino_numero?: string | null;
  destino_complemento?: string | null;
  destino_bairro?: string | null;
  destino_cidade?: string | null;
  destino_uf?: string | null;
  destino_latitude?: number | null;
  destino_longitude?: number | null;
  provedor?: ProvedorFrete | null;
  transportadora_nome?: string | null;
  servico_codigo?: string | null;
  valor_frete: number;
  valor_original?: number | null;
  valor_subsidio?: number | null;
  is_frete_gratis?: boolean | null;
  prazo_estimado_texto?: string | null;
  codigo_rastreio?: string | null;
  link_rastreio?: string | null;
  link_etiqueta?: string | null;
  pin_entrega?: string | null;
  entregador_nome?: string | null;
  contato_entregador?: string | null;
  nome_app?: string | null;
  servico_correios?: 'PAC' | 'SEDEX' | string | null;
  nome_transportadora?: string | null;
  tipo_operacao?: TipoOperacaoEnvio | string | null;
  despachado_em?: string | null;
  despachado_por?: string | null;
  status_envio?: string;
  peso_kg?: number | null;
  largura_cm?: number | null;
  altura_cm?: number | null;
  comprimento_cm?: number | null;
  quantidade_volumes?: number | null;
  criado_em?: string;
  atualizado_em?: string;
}

export interface PacoteEnvioCotacao {
  quantidade_volumes: number;
  peso_kg: number;
  comprimento_cm: number;
  largura_cm: number;
  altura_cm: number;
}

export interface OpcaoFreteCotada {
  id: string;
  forma_entrega_id?: string | null;
  provedor: ProvedorFrete;
  transportadora_nome: string;
  servico_codigo: string;
  servico_nome: string;
  valor_frete: number;
  valor_original?: number;
  valor_subsidio?: number;
  is_frete_gratis?: boolean;
  is_upgrade_subsidio?: boolean;
  prazo_dias_min?: number;
  prazo_dias_max?: number;
  prazo_estimado_texto: string;
  icone_tipo: 'uber' | 'jadlog' | 'correios' | 'loja' | 'padrao';
  erro?: string | null;
  permite_edicao_valor?: boolean;
  tipo_cobranca?: 'fixo' | 'manual' | 'gratis';
}

export interface NovoEnderecoFormInput {
  identificador: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  latitude?: number | null;
  longitude?: number | null;
  is_principal: boolean;
}

export interface CotacaoItemProduto {
  nome: string;
  quantidade: number;
  preco_unitario: number;
  peso_kg?: number;
  largura_cm?: number;
  altura_cm?: number;
  comprimento_cm?: number;
}

export interface RequisicaoCotacaoOrquestrador {
  origem_cep: string;
  destino_cep: string;
  destino_logradouro?: string;
  destino_numero?: string;
  destino_bairro?: string;
  destino_cidade?: string;
  destino_uf?: string;
  subtotal: number;
  itens: CotacaoItemProduto[];
  config: LojaShippingConfig;
  pacote?: PacoteEnvioCotacao;
}

export interface ShippingSelectionResult {
  tipo_atendimento: TipoAtendimento;
  endereco_selecionado?: ClienteEndereco | null;
  opcao_frete?: OpcaoFreteCotada | null;
  opcao_selecionada?: OpcaoFreteCotada | null;
  pedido_entrega: Partial<PedidoEntrega>;
  valor_frete: number;
  pacote?: PacoteEnvioCotacao;
}

export interface FormaEntrega {
  id: string;
  loja_id: string;
  nome: string;
  tipo: TipoOperacaoEnvio | 'proprio' | 'taxa_fixa' | 'bairro' | 'distancia_km' | 'manual' | string;
  valor_taxa: number;
  valor_por_km?: number;
  tempo_estimado?: string | null;
  requer_codigo_rastreio?: boolean;
  requer_entregador?: boolean;
  requer_link_rastreio?: boolean;
  requer_pin?: boolean;
  padrao?: boolean;
  ativo: boolean;
  criado_em?: string;
  atualizado_em?: string;
}
