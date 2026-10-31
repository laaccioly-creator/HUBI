import { derivePolymorphicId } from '../../src/core/crypto-prng';

/**
 * Gera a assinatura determinística de um item canário para uma loja específica.
 */
export function generateCanarySkuToken(lojaId: string, secretSeed: string): string {
  return derivePolymorphicId(`canary_sku_${lojaId}`, secretSeed, 'CNRY-').toUpperCase();
}

/**
 * Filtra itens canário invisíveis da lista de produtos antes de exibir na UI legítima.
 * Um scraper que consome a API crua sem a semente não saberá qual item é canário.
 */
export function filterOutCanaryItems<T extends { codigo_barras?: string | null; sku?: string | null }>(
  items: T[],
  lojaId: string,
  secretSeed: string
): T[] {
  if (!lojaId || !items.length) return items;
  const canaryToken = generateCanarySkuToken(lojaId, secretSeed);
  return items.filter(
    (item) => item.sku !== canaryToken && item.codigo_barras !== canaryToken
  );
}
