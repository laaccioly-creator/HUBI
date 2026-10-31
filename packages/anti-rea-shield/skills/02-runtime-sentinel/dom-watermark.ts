import { hashSeedToUint32 } from '../../src/core/crypto-prng';

const ZERO_WIDTH_ZERO = '\u200B'; // Zero-Width Space
const ZERO_WIDTH_ONE = '\u200C';  // Zero-Width Non-Joiner
const ZERO_WIDTH_SEP = '\u200D';  // Zero-Width Joiner

/**
 * Gera uma marca d'água invisível (Zero-Width Unicode) a partir da semente do projeto.
 * Permite comprovar autoria criptográfica caso textos/DOM da interface sejam copiados.
 */
export function encodeZeroWidthWatermark(secretSeed: string): string {
  const num = hashSeedToUint32(secretSeed);
  const binary = num.toString(2).padStart(32, '0');
  const encodedBits = binary
    .split('')
    .map((bit) => (bit === '1' ? ZERO_WIDTH_ONE : ZERO_WIDTH_ZERO))
    .join('');
  return `${ZERO_WIDTH_SEP}${encodedBits}${ZERO_WIDTH_SEP}`;
}

/**
 * Decodifica e verifica se um texto copiado contém a assinatura invisível do sistema.
 */
export function verifyZeroWidthWatermark(text: string, secretSeed: string): boolean {
  const expected = encodeZeroWidthWatermark(secretSeed);
  return text.includes(expected);
}
