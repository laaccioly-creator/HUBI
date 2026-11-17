import { z } from 'zod';
import { DomainError, Result, err, ok } from '../../types/domain-contracts';

/**
 * Schema de fronteira em runtime para os parâmetros comerciais públicos
 * retornados pela tabela singleton `public.configuracoes_plataforma`.
 */
export const systemBillingConfigRowSchema = z.object({
  dias_trial: z.coerce.number().int().min(1).max(90),
  valor_mensal_anual: z.coerce.number().positive(),
  valor_anual_total: z.coerce.number().positive().optional(),
  valor_plano_mensal_avulso: z.coerce.number().positive(),
  desconto_pix_percentual: z.coerce.number().min(0).max(100),
  aceita_cartao_debito: z.boolean(),
  max_parcelas_cartao: z.coerce.number().int().min(1).max(24),
  parcelas_sem_juros: z.coerce.number().int().min(1).max(24),
});

export interface SystemBillingValues {
  readonly valorMensalAnual: number;
  readonly valorTotalAnual: number;
  readonly valorMensalAvulso: number;
  readonly maxParcelas: number;
  readonly parcelasSemJuros: number;
  readonly descontoPix: number;
  readonly aceitaCartaoDebito: boolean;
  readonly diasTrial: number;
}

/**
 * Valida e normaliza a linha recebida do Supabase PostgREST, garantindo cálculo
 * determinístico de `valorTotalAnual = valorMensalAnual * 12`.
 */
export function validarConfiguracaoCobrancaPlataforma(
  raw: unknown
): Result<SystemBillingValues, DomainError> {
  const parsed = systemBillingConfigRowSchema.safeParse(raw);
  if (!parsed.success) {
    return err({
      codigo: 'VALIDACAO_FRONTEIRA',
      mensagem: 'Não foi possível validar os parâmetros comerciais dos planos.',
    });
  }

  const dados = parsed.data;
  const valorMensalAnual = Number(dados.valor_mensal_anual.toFixed(2));
  const valorTotalAnual = Number((valorMensalAnual * 12).toFixed(2));

  return ok({
    valorMensalAnual,
    valorTotalAnual,
    valorMensalAvulso: Number(dados.valor_plano_mensal_avulso.toFixed(2)),
    maxParcelas: dados.max_parcelas_cartao,
    parcelasSemJuros: dados.parcelas_sem_juros,
    descontoPix: Number(dados.desconto_pix_percentual.toFixed(2)),
    aceitaCartaoDebito: dados.aceita_cartao_debito,
    diasTrial: dados.dias_trial,
  });
}
