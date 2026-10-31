import { derivePolymorphicId } from '../../src/core/crypto-prng';

/**
 * Remove atributos de teste/inspeção automatizada do HTML/DOM e embaralha identificadores de blocos.
 */
export function sanitizeDebugDomAttributes(rootElement?: HTMLElement | null): number {
  if (typeof document === 'undefined') return 0;
  const root = rootElement || document.documentElement;
  if (!root) return 0;

  const debugAttrs = ['data-testid', 'data-cy', 'data-test', 'data-qa', 'data-component'];
  let removedCount = 0;

  for (const attr of debugAttrs) {
    const elements = root.querySelectorAll(`[${attr}]`);
    elements.forEach((el) => {
      el.removeAttribute(attr);
      removedCount++;
    });
  }

  return removedCount;
}

/**
 * Gera um nome de classe polimórfico baseado na semente para dificultar extração automatizada de seletores fixos.
 */
export function getScrambledClassName(logicalClassName: string, secretSeed: string): string {
  return derivePolymorphicId(logicalClassName, secretSeed, 'hb_');
}
