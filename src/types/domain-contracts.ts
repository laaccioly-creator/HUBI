/**
 * @file src/types/domain-contracts.ts
 * @description Contratos Estritos de Domínio, Branded Types, Discriminated Unions e Derivação de Schema Supabase
 * baseados nas diretrizes de Engenharia Defensiva (Total TypeScript - Matt Pocock).
 */

// ============================================================================
// 1. BRANDED TYPES (ISOLAMENTO MULTI-TENANT E ENTIDADES CRÍTICAS)
// ============================================================================

export type Brand<K, T> = K & { readonly __brand: T };

export type LojaId = Brand<string, 'LojaId'>;
export type UsuarioId = Brand<string, 'UsuarioId'>;
export type ClienteId = Brand<string, 'ClienteId'>;
export type PedidoId = Brand<string, 'PedidoId'>;
export type ProdutoId = Brand<string, 'ProdutoId'>;
export type FormaPagamentoId = Brand<string, 'FormaPagamentoId'>;
export type CartStorageKey = Brand<string, 'CartStorageKey'>;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidString(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

export function toLojaId(id: string): LojaId {
  const limpo = id.trim();
  if (!limpo) {
    throw new Error('Identificador de loja (LojaId) não pode ser vazio.');
  }
  return limpo as LojaId;
}

export function toUsuarioId(id: string | null | undefined): UsuarioId {
  const limpo = (id ?? '').trim();
  return (limpo || 'anon') as UsuarioId;
}

export function toClienteId(id: string): ClienteId {
  const limpo = id.trim();
  if (!limpo) {
    throw new Error('Identificador de cliente (ClienteId) não pode ser vazio.');
  }
  return limpo as ClienteId;
}

export function toPedidoId(id: string): PedidoId {
  const limpo = id.trim();
  if (!limpo) {
    throw new Error('Identificador de pedido (PedidoId) não pode ser vazio.');
  }
  return limpo as PedidoId;
}

export function toFormaPagamentoId(id: string): FormaPagamentoId {
  const limpo = id.trim();
  if (!limpo) {
    throw new Error('Identificador de forma de pagamento (FormaPagamentoId) não pode ser vazio.');
  }
  return limpo as FormaPagamentoId;
}

/**
 * Gera a chave de armazenamento local do carrinho garantindo isolamento por Tenant (Loja) e Operador (Usuário).
 */
export function createCartStorageKey(lojaId: LojaId, usuarioId: UsuarioId): CartStorageKey {
  return `hubi_cart_${lojaId}_${usuarioId}` as CartStorageKey;
}

// ============================================================================
// 2. RESULT PATTERN & EXHAUSTIVE MATCHING (FAIL FAST)
// ============================================================================

export interface DomainError {
  readonly codigo:
    | 'VALIDACAO_FRONTEIRA'
    | 'LIMITE_CADERNETA_EXCEDIDO'
    | 'LIMITE_FIADO_EXCEDIDO'
    | 'CLIENTE_OBRIGATORIO'
    | 'SOMA_PAGAMENTOS_DIVERGENTE'
    | 'TENANT_INVALIDO'
    | 'ERRO_PERSISTENCIA';
  readonly mensagem: string;
  readonly campo?: string;
}

export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

export function err<E = DomainError>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Garante em tempo de compilação que todos os casos de uma Discriminated Union foram tratados.
 */
export function assertNever(value: never): never {
  throw new Error(`Estado ou variante não tratada na união discriminada: ${JSON.stringify(value)}`);
}

// ============================================================================
// 3. DISCRIMINATED UNIONS PARA ESTADOS E REGRAS COMERCIAIS
// ============================================================================

/**
 * Modelagem em Discriminated Union para os Modos Comerciais de Atacado / Distribuidor.
 * Torna estruturalmente impossível ter "Valor Mínimo", "Qtd Global" e "Mínimo por SKU" conflitando ao mesmo tempo.
 */
export type RegraComercialAtacado =
  | {
      readonly modo: 'VALOR_MINIMO';
      readonly valorMinimo: number;
      readonly percentualDesconto: number;
    }
  | {
      readonly modo: 'QUANTIDADE_GLOBAL';
      readonly quantidadeMinima: number;
      readonly percentualDesconto: number;
    }
  | {
      readonly modo: 'POR_SKU';
      readonly percentualPadrao: number;
      readonly quantidadeMinimaPorSku?: number;
    };

export type ModoRegraComercial = RegraComercialAtacado['modo'];

/**
 * Estado assíncrono em União Discriminada (substitui múltiplos booleanos isLoading, isError, isSuccess).
 */
export type AsyncState<T, E = string> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: E };

/**
 * Avalia de forma exaustiva se um carrinho/item atende à Regra Comercial de Atacado configurada.
 */
export function avaliarRegraComercialAtacado(
  regra: RegraComercialAtacado,
  contexto: {
    readonly valorTotalVarejo: number;
    readonly quantidadeTotalPecas: number;
    readonly menorQuantidadePorSku: number;
  }
): { readonly elegivel: boolean; readonly percentualAplicavel: number; readonly exigeTermometroGlobal: boolean } {
  switch (regra.modo) {
    case 'VALOR_MINIMO':
      return {
        elegivel: regra.valorMinimo > 0 && contexto.valorTotalVarejo >= regra.valorMinimo,
        percentualAplicavel: regra.percentualDesconto,
        exigeTermometroGlobal: true
      };
    case 'QUANTIDADE_GLOBAL':
      return {
        elegivel: regra.quantidadeMinima > 0 && contexto.quantidadeTotalPecas >= regra.quantidadeMinima,
        percentualAplicavel: regra.percentualDesconto,
        exigeTermometroGlobal: true
      };
    case 'POR_SKU': {
      const minSku = regra.quantidadeMinimaPorSku ?? 6;
      return {
        elegivel: minSku > 0 && contexto.menorQuantidadePorSku >= minSku,
        percentualAplicavel: regra.percentualPadrao,
        exigeTermometroGlobal: false
      };
    }
    default:
      return assertNever(regra);
  }
}

// ============================================================================
// 4. CONTRATOS ESTRITOS DO SUPABASE (DATABASE SCHEMA DERIVATION)
// ============================================================================

/**
 * Constraint real do PostgreSQL na tabela `public.formas_pagamento`:
 * CHECK (tipo IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'fiado', 'outro'))
 * Note que 'caderneta' NÃO é aceito diretamente na coluna `tipo` do banco!
 */
export type TipoFormaPagamentoDb =
  | 'dinheiro'
  | 'pix'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'fiado'
  | 'outro';

/**
 * Tipo utilizado na camada de UI/PDV (inclui a modalidade lógica 'caderneta').
 */
export type TipoPagamentoUI = TipoFormaPagamentoDb | 'caderneta';

export type StatusPedidoDb =
  | 'rascunho'
  | 'pendente'
  | 'confirmado'
  | 'em_separacao'
  | 'saiu_entrega'
  | 'concluido'
  | 'cancelado';

export type StatusPagamentoDb = 'aguardando_pesagem' | 'aguardando_pagamento' | 'pago' | 'parcial' | 'fiado' | 'cancelado';

export type TabelaPrecoDb = 'varejo' | 'atacado' | 'autoatacado' | 'promocional';

export type TipoLancamentoCadernetaDb = 'debito' | 'credito';

export interface Database {
  public: {
    Tables: {
      formas_pagamento: {
        Row: {
          id: string;
          loja_id: string;
          nome: string;
          tipo: TipoFormaPagamentoDb;
          taxa_percentual: number;
          taxa_fixa: number;
          prazo_recebimento_dias: number;
          maximo_parcelas: number;
          ativo: boolean;
          exibir_catalogo: boolean;
          criado_em: string;
        };
        Insert: {
          id?: string;
          loja_id: string;
          nome: string;
          tipo: TipoFormaPagamentoDb;
          taxa_percentual?: number;
          taxa_fixa?: number;
          prazo_recebimento_dias?: number;
          maximo_parcelas?: number;
          ativo?: boolean;
          exibir_catalogo?: boolean;
          criado_em?: string;
        };
        Update: {
          id?: string;
          loja_id?: string;
          nome?: string;
          tipo?: TipoFormaPagamentoDb;
          taxa_percentual?: number;
          taxa_fixa?: number;
          prazo_recebimento_dias?: number;
          maximo_parcelas?: number;
          ativo?: boolean;
          exibir_catalogo?: boolean;
        };
      };
      pedidos: {
        Row: {
          id: string;
          loja_id: string;
          cliente_id: string | null;
          vendedor_id: string | null;
          numero_pedido: number;
          status: StatusPedidoDb;
          status_pagamento: StatusPagamentoDb;
          tabela_preco_aplicada: TabelaPrecoDb;
          subtotal: number;
          valor_desconto: number;
          desconto_percentual: number;
          valor_frete: number;
          valor_total: number;
          valor_pago: number;
          saldo_devedor: number;
          fiado_quitado: boolean;
          observacoes: string | null;
          data_venda: string;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          loja_id: string;
          cliente_id?: string | null;
          vendedor_id?: string | null;
          status?: StatusPedidoDb;
          status_pagamento?: StatusPagamentoDb;
          tabela_preco_aplicada?: TabelaPrecoDb;
          subtotal: number;
          valor_desconto?: number;
          desconto_percentual?: number;
          valor_frete?: number;
          valor_total: number;
          valor_pago?: number;
          saldo_devedor?: number;
          fiado_quitado?: boolean;
          observacoes?: string | null;
          data_venda?: string;
        };
        Update: Partial<Database['public']['Tables']['pedidos']['Insert']>;
      };
      pagamentos_pedido: {
        Row: {
          id: string;
          loja_id: string;
          pedido_id: string;
          forma_pagamento_id: string;
          valor: number;
          parcelas: number;
          valor_taxa: number;
          valor_liquido: number;
          data_pagamento: string | null;
          eh_pagamento_fiado: boolean;
          eh_pagamento_caderneta?: boolean;
        };
        Insert: {
          id?: string;
          loja_id: string;
          pedido_id: string;
          forma_pagamento_id: string;
          valor: number;
          parcelas?: number;
          valor_taxa?: number;
          valor_liquido: number;
          data_pagamento?: string | null;
          eh_pagamento_fiado?: boolean;
          eh_pagamento_caderneta?: boolean;
        };
        Update: Partial<Database['public']['Tables']['pagamentos_pedido']['Insert']>;
      };
      caderneta_lancamentos: {
        Row: {
          id: string;
          loja_id: string;
          cliente_id: string;
          pedido_id: string | null;
          usuario_id: string | null;
          tipo_lancamento: TipoLancamentoCadernetaDb;
          valor: number;
          saldo_anterior: number;
          saldo_posterior: number;
          descricao: string;
          forma_pagamento_quitacao: string | null;
          criado_em: string;
        };
        Insert: {
          id?: string;
          loja_id: string;
          cliente_id: string;
          pedido_id?: string | null;
          usuario_id?: string | null;
          tipo_lancamento: TipoLancamentoCadernetaDb;
          valor: number;
          saldo_anterior: number;
          saldo_posterior: number;
          descricao: string;
          forma_pagamento_quitacao?: string | null;
          criado_em?: string;
        };
        Update: Partial<Database['public']['Tables']['caderneta_lancamentos']['Insert']>;
      };
    };
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

/**
 * Mapa estático blindado com `as const satisfies` que converte qualquer modalidade de UI
 * para um tipo de banco de dados garantidamente aceito pela CHECK constraint de `formas_pagamento`.
 */
export const MAPA_TIPO_PAGAMENTO_UI_PARA_DB = {
  dinheiro: { tipoDb: 'dinheiro', nomePadrao: 'Dinheiro' },
  pix: { tipoDb: 'pix', nomePadrao: 'Pix' },
  cartao_credito: { tipoDb: 'cartao_credito', nomePadrao: 'Cartão de Crédito' },
  cartao_debito: { tipoDb: 'cartao_debito', nomePadrao: 'Cartão de Débito' },
  fiado: { tipoDb: 'fiado', nomePadrao: 'Fiado / A Prazo' },
  outro: { tipoDb: 'outro', nomePadrao: 'Outros' },
  caderneta: { tipoDb: 'outro', nomePadrao: 'Caderneta de Mercadinho' }
} as const satisfies Record<
  TipoPagamentoUI,
  { readonly tipoDb: TipoFormaPagamentoDb; readonly nomePadrao: string }
>;

/**
 * Constrói um payload de inserção para `public.formas_pagamento` 100% aderente ao schema do banco,
 * prevenindo erros HTTP 400 de violação de constraint para a Caderneta de Mercadinho.
 */
export function buildFormaPagamentoInsertPayload(
  lojaId: LojaId,
  tipoUi: TipoPagamentoUI
): TablesInsert<'formas_pagamento'> {
  const config = MAPA_TIPO_PAGAMENTO_UI_PARA_DB[tipoUi];
  return {
    loja_id: lojaId,
    nome: config.nomePadrao,
    tipo: config.tipoDb,
    ativo: true,
    taxa_percentual: 0,
    taxa_fixa: 0,
    maximo_parcelas: 1
  } satisfies TablesInsert<'formas_pagamento'>;
}
