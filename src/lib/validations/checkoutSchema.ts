import { z } from 'zod';
import {
  ClienteId,
  DomainError,
  LojaId,
  MAPA_TIPO_PAGAMENTO_UI_PARA_DB,
  RegraComercialAtacado,
  Result,
  TipoFormaPagamentoDb,
  TipoPagamentoUI,
  err,
  ok,
  toClienteId,
  toLojaId
} from '../../types/domain-contracts';

const uuidSchema = z
  .string()
  .trim()
  .uuid({ message: 'Identificador UUID inválido.' });

/**
 * Schema Zod para a Discriminated Union de Regras Comerciais de Atacado/Distribuidor.
 */
export const regraComercialAtacadoSchema: z.ZodType<RegraComercialAtacado> = z.discriminatedUnion('modo', [
  z.object({
    modo: z.literal('VALOR_MINIMO'),
    valorMinimo: z.number().positive({ message: 'O valor mínimo do pedido deve ser maior que zero.' }),
    percentualDesconto: z.number().min(0).max(100)
  }),
  z.object({
    modo: z.literal('QUANTIDADE_GLOBAL'),
    quantidadeMinima: z.number().int().positive({ message: 'A quantidade global mínima de peças deve ser maior que zero.' }),
    percentualDesconto: z.number().min(0).max(100)
  }),
  z.object({
    modo: z.literal('POR_SKU'),
    percentualPadrao: z.number().min(0).max(100),
    quantidadeMinimaPorSku: z.number().int().positive().optional()
  })
]);

export const tipoPagamentoUiSchema = z.enum([
  'dinheiro',
  'pix',
  'cartao_credito',
  'cartao_debito',
  'fiado',
  'outro',
  'caderneta'
]);

/**
 * Schema de uma linha individual na divisão de meios de pagamento (split payment).
 */
export const linhaPagamentoCheckoutSchema = z.object({
  id: z.string().trim().min(1),
  forma_pagamento_id: z.string().trim().optional().nullable(),
  forma_tipo: tipoPagamentoUiSchema,
  forma_nome: z.string().trim().min(1),
  valor: z
    .number({ message: 'O valor da linha de pagamento deve ser numérico.' })
    .positive({ message: 'Cada meio de pagamento alocado deve possuir valor maior que zero.' }),
  valor_entregue: z.number().nonnegative().optional().nullable(),
  parcelas: z.number().int().min(1).max(24).default(1)
});

/**
 * Schema de fronteira para fechamento de venda/pedido com múltiplos meios de pagamento (Split Payment).
 * Previne vendas órfãs, valores divergentes e compras a prazo (Fiado / Caderneta) sem cliente ou sem limite.
 */
export const fechamentoVendaSchema = z
  .object({
    loja_id: uuidSchema.transform((val): LojaId => toLojaId(val)),
    cliente_id: uuidSchema
      .optional()
      .nullable()
      .transform((val): ClienteId | null => (val ? toClienteId(val) : null)),
    subtotal: z.number().nonnegative({ message: 'O subtotal não pode ser negativo.' }),
    valor_desconto: z.number().nonnegative().default(0),
    valor_frete: z.number().nonnegative().default(0),
    valor_total: z.number().positive({ message: 'O valor total da venda deve ser maior que zero.' }),
    linhas_pagamento: z
      .array(linhaPagamentoCheckoutSchema)
      .min(1, { message: 'Informe pelo menos uma forma de pagamento para finalizar o pedido.' }),
    cliente_credito: z
      .object({
        permite_fiado: z.boolean().default(false),
        limite_disponivel_fiado: z.number().nonnegative().default(0),
        permite_caderneta: z.boolean().default(false),
        limite_disponivel_caderneta: z.number().nonnegative().default(0)
      })
      .optional()
      .nullable()
  })
  .superRefine((dados, ctx) => {
    const somaLinhas = dados.linhas_pagamento.reduce((acc, l) => acc + l.valor, 0);
    const diferenca = Math.abs(somaLinhas - dados.valor_total);

    if (diferenca > 0.02) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['linhas_pagamento'],
        message: `A soma das formas de pagamento (R$ ${somaLinhas.toFixed(2)}) difere do total da venda (R$ ${dados.valor_total.toFixed(2)}).`
      });
    }

    const totalFiado = dados.linhas_pagamento
      .filter((l) => l.forma_tipo === 'fiado')
      .reduce((acc, l) => acc + l.valor, 0);

    const totalCaderneta = dados.linhas_pagamento
      .filter((l) => l.forma_tipo === 'caderneta')
      .reduce((acc, l) => acc + l.valor, 0);

    if ((totalFiado > 0 || totalCaderneta > 0) && !dados.cliente_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cliente_id'],
        message: 'É obrigatório selecionar um cliente cadastrado para vendas em Fiado ou Caderneta de Mercadinho.'
      });
    }

    if (totalFiado > 0 && dados.cliente_credito) {
      if (!dados.cliente_credito.permite_fiado) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['linhas_pagamento'],
          message: 'O cliente selecionado não possui permissão ativa para comprar no Fiado.'
        });
      } else if (totalFiado - dados.cliente_credito.limite_disponivel_fiado > 0.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['linhas_pagamento'],
          message: `Valor alocado em Fiado (R$ ${totalFiado.toFixed(2)}) excede o limite disponível do cliente (R$ ${dados.cliente_credito.limite_disponivel_fiado.toFixed(2)}).`
        });
      }
    }

    if (totalCaderneta > 0 && dados.cliente_credito) {
      if (!dados.cliente_credito.permite_caderneta) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['linhas_pagamento'],
          message: 'O cliente selecionado não possui permissão ativa para comprar na Caderneta de Mercadinho.'
        });
      } else if (totalCaderneta - dados.cliente_credito.limite_disponivel_caderneta > 0.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['linhas_pagamento'],
          message: `Valor alocado na Caderneta (R$ ${totalCaderneta.toFixed(2)}) excede o limite disponível do cliente (R$ ${dados.cliente_credito.limite_disponivel_caderneta.toFixed(2)}).`
        });
      }
    }
  });

export type FechamentoVendaInput = z.input<typeof fechamentoVendaSchema>;
export type FechamentoVendaValidado = z.output<typeof fechamentoVendaSchema>;

export interface LinhaPagamentoNormalizadaDb {
  readonly id: string;
  readonly forma_tipo_ui: TipoPagamentoUI;
  readonly forma_tipo_db: TipoFormaPagamentoDb;
  readonly forma_nome_padrao: string;
  readonly valor: number;
  readonly parcelas: number;
  readonly eh_fiado: boolean;
  readonly eh_caderneta: boolean;
}

/**
 * Valida o payload de fechamento de venda na fronteira e normaliza as linhas de pagamento
 * para os tipos aceitos pelo PostgreSQL (`TipoFormaPagamentoDb`).
 */
export function validarFechamentoVenda(
  input: unknown
): Result<
  {
    readonly venda: FechamentoVendaValidado;
    readonly linhasNormalizadas: readonly LinhaPagamentoNormalizadaDb[];
  },
  DomainError
> {
  const parsed = fechamentoVendaSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const msg = issue?.message ?? 'Dados de fechamento de venda inválidos.';
    const codigo: DomainError['codigo'] = msg.includes('Caderneta')
      ? 'LIMITE_CADERNETA_EXCEDIDO'
      : msg.includes('Fiado')
      ? 'LIMITE_FIADO_EXCEDIDO'
      : msg.includes('selecionar um cliente')
      ? 'CLIENTE_OBRIGATORIO'
      : msg.includes('soma das formas')
      ? 'SOMA_PAGAMENTOS_DIVERGENTE'
      : 'VALIDACAO_FRONTEIRA';

    return err({
      codigo,
      mensagem: msg,
      campo: issue?.path.join('.')
    });
  }

  const linhasNormalizadas: readonly LinhaPagamentoNormalizadaDb[] = parsed.data.linhas_pagamento.map((l) => {
    const mapeamento = MAPA_TIPO_PAGAMENTO_UI_PARA_DB[l.forma_tipo];
    return {
      id: l.id,
      forma_tipo_ui: l.forma_tipo,
      forma_tipo_db: mapeamento.tipoDb,
      forma_nome_padrao: l.forma_nome || mapeamento.nomePadrao,
      valor: l.valor,
      parcelas: l.parcelas,
      eh_fiado: l.forma_tipo === 'fiado',
      eh_caderneta: l.forma_tipo === 'caderneta'
    };
  });

  return ok({
    venda: parsed.data,
    linhasNormalizadas
  });
}
