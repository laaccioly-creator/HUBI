import { z } from 'zod';

/**
 * Validação de quantidade para produto pesável/fracionado
 * Permite até 3 casas decimais (ex: 1.250 kg)
 */
export const quantidadeFracionadaSchema = z
  .number({ message: 'A quantidade deve ser um valor numérico.' })
  .positive({ message: 'A quantidade deve ser maior que zero.' })
  .refine(
    (val) => {
      // Checa se tem no máximo 3 casas decimais
      const str = val.toString();
      if (!str.includes('.')) return true;
      const dec = str.split('.')[1];
      return dec.length <= 3;
    },
    { message: 'A quantidade por peso/fracionada aceita no máximo 3 casas decimais (gramas).' }
  );

/**
 * Schema para decodificação de código de balança comercial (Padrão EAN-13 iniciando com 2)
 * Formato padrão: 2 CCCCC W/V WWWW D
 * Onde:
 * 2 = Prefixo balança
 * CCCCC = Código do produto na balança (4 a 5 dígitos)
 * WWWWW = Peso em gramas ou Valor em centavos
 * D = Dígito verificador
 */
export interface CodigoBalancaEan13Decodificado {
  codigoProduto: string;
  tipoDado: 'peso' | 'valor';
  pesoKg?: number;
  valorTotal?: number;
  valido: boolean;
}

export function decodificarEtiquetaBalancaEan13(
  codigoBarras: string,
  precoVendaKg?: number
): CodigoBalancaEan13Decodificado | null {
  const limpo = codigoBarras.replace(/\D/g, '');
  if (limpo.length !== 13 || !limpo.startsWith('2')) {
    return null;
  }

  // Padrão mais comum no varejo brasileiro:
  // Posição 0: '2'
  // Posições 1..5: Código interno do produto na balança (5 dígitos)
  // Posições 6..11: Peso (em gramas) OU Valor total (em centavos)
  // Posição 12: Dígito verificador
  const codigoProduto = limpo.slice(1, 6).replace(/^0+/, ''); // remove zeros à esquerda
  const payloadNumerico = parseInt(limpo.slice(6, 12), 10);

  if (isNaN(payloadNumerico)) {
    return null;
  }

  // Heurística de interpretação:
  // Se o lojista forneceu o precoVendaKg e o payload resultar em um peso coerente com o padrão de peso:
  // Trata como peso em KG (dividido por 1000)
  const pesoPossivelKg = Number((payloadNumerico / 1000).toFixed(3));

  return {
    codigoProduto,
    tipoDado: 'peso',
    pesoKg: pesoPossivelKg,
    valido: true
  };
}

/**
 * Schema de ajuste de pesagem na separação do pedido (Catálogo Online)
 */
export const ajustePesagemSeparacaoSchema = z.object({
  pedido_id: z.string().uuid(),
  item_pedido_id: z.string().min(1),
  loja_id: z.string().uuid(),
  peso_solicitado_kg: z.number().positive(),
  peso_real_kg: z.number().positive(),
  preco_unitario_kg: z.number().positive(),
  eh_caderneta: z.boolean().default(false)
});

export type AjustePesagemSeparacaoInput = z.infer<typeof ajustePesagemSeparacaoSchema>;
