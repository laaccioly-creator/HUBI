import { z } from 'zod';
import {
  ClienteId,
  DomainError,
  LojaId,
  PedidoId,
  Result,
  TablesInsert,
  UsuarioId,
  err,
  ok,
  toClienteId,
  toLojaId,
  toPedidoId,
  toUsuarioId
} from '../../types/domain-contracts';

const uuidSchema = z
  .string()
  .trim()
  .uuid({ message: 'Identificador UUID inválido.' });

/**
 * Schema de fronteira para lançamento contábil na Caderneta de Mercadinho
 * (tanto compras a débito quanto quitações parciais/totais a crédito).
 */
export const cadernetaLancamentoSchema = z
  .object({
    loja_id: uuidSchema.transform((val): LojaId => toLojaId(val)),
    cliente_id: uuidSchema.transform((val): ClienteId => toClienteId(val)),
    pedido_id: uuidSchema
      .optional()
      .nullable()
      .transform((val): PedidoId | null => (val ? toPedidoId(val) : null)),
    usuario_id: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((val): UsuarioId | null => (val ? toUsuarioId(val) : null)),
    tipo_lancamento: z.enum(['debito', 'credito'], {
      message: 'O tipo de lançamento na caderneta deve ser "debito" ou "credito".'
    }),
    valor: z
      .number({ message: 'O valor do lançamento deve ser numérico.' })
      .positive({ message: 'O valor do lançamento na caderneta deve ser maior que zero.' }),
    limite_caderneta_cliente: z
      .number()
      .nonnegative({ message: 'O limite da caderneta não pode ser negativo.' }),
    saldo_devedor_atual: z
      .number()
      .nonnegative({ message: 'O saldo devedor atual não pode ser negativo.' }),
    permite_caderneta: z.boolean(),
    dia_vencimento_caderneta: z
      .number()
      .int()
      .min(1, { message: 'O dia de vencimento deve ser entre 1 e 31.' })
      .max(31, { message: 'O dia de vencimento deve ser entre 1 e 31.' })
      .default(10),
    descricao: z
      .string()
      .trim()
      .min(2, { message: 'Informe uma descrição válida para o lançamento na caderneta.' })
      .max(255),
    forma_pagamento_quitacao: z
      .enum(['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro'])
      .optional()
      .nullable()
  })
  .superRefine((dados, ctx) => {
    if (dados.tipo_lancamento === 'debito') {
      if (!dados.permite_caderneta) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['permite_caderneta'],
          message: 'Este cliente não possui permissão ativa para compras na Caderneta de Mercadinho.'
        });
      }

      const limiteDisponivel = Math.max(0, dados.limite_caderneta_cliente - dados.saldo_devedor_atual);
      if (dados.valor - limiteDisponivel > 0.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['valor'],
          message: `Valor (R$ ${dados.valor.toFixed(2)}) excede o limite disponível na caderneta (R$ ${limiteDisponivel.toFixed(2)}).`
        });
      }
    }

    if (dados.tipo_lancamento === 'credito' && !dados.forma_pagamento_quitacao) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['forma_pagamento_quitacao'],
        message: 'Para quitação (crédito) na caderneta, informe o meio de pagamento recebido.'
      });
    }
  });

export type CadernetaLancamentoInput = z.input<typeof cadernetaLancamentoSchema>;
export type CadernetaLancamentoValidado = z.output<typeof cadernetaLancamentoSchema>;

/**
 * Valida os dados de entrada de um lançamento de Caderneta e retorna um Result tipado
 * pronto para inserção segura na tabela `public.caderneta_lancamentos`.
 */
export function validarLancamentoCaderneta(
  input: unknown
): Result<
  {
    readonly validado: CadernetaLancamentoValidado;
    readonly dbPayload: TablesInsert<'caderneta_lancamentos'>;
  },
  DomainError
> {
  const parsed = cadernetaLancamentoSchema.safeParse(input);
  if (!parsed.success) {
    const primeiraIssue = parsed.error.issues[0];
    const ehErroLimite = primeiraIssue?.path.includes('valor') && primeiraIssue.message.includes('limite');
    return err({
      codigo: ehErroLimite ? 'LIMITE_CADERNETA_EXCEDIDO' : 'VALIDACAO_FRONTEIRA',
      mensagem: primeiraIssue?.message ?? 'Dados inválidos para lançamento na caderneta.',
      campo: primeiraIssue?.path.join('.')
    });
  }

  const d = parsed.data;
  const saldoPosterior =
    d.tipo_lancamento === 'debito'
      ? Number((d.saldo_devedor_atual + d.valor).toFixed(2))
      : Number(Math.max(0, d.saldo_devedor_atual - d.valor).toFixed(2));

  const dbPayload = {
    loja_id: d.loja_id,
    cliente_id: d.cliente_id,
    pedido_id: d.pedido_id,
    usuario_id: d.usuario_id,
    tipo_lancamento: d.tipo_lancamento,
    valor: d.valor,
    saldo_anterior: d.saldo_devedor_atual,
    saldo_posterior: saldoPosterior,
    descricao: d.descricao,
    forma_pagamento_quitacao: d.forma_pagamento_quitacao ?? null
  } satisfies TablesInsert<'caderneta_lancamentos'>;

  return ok({
    validado: d,
    dbPayload
  });
}
