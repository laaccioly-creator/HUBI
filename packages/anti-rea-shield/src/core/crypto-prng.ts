/**
 * Gerador Pseudoaleatório Determinístico (Mulberry32 + FNV-1a Hash)
 * Alimentado por SHIELD_SECRET_SEED para produzir mutações polimórficas reproduzíveis por build.
 */

export function hashSeedToUint32(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createMulberry32(seedString: string): () => number {
  let state = hashSeedToUint32(seedString || 'hubi-default-seed');
  return function nextRandom(): number {
    let t = (state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Gera um identificador polimórfico curto determinístico baseado na semente e no nome original.
 */
export function derivePolymorphicId(originalName: string, seed: string, prefix = '_'): string {
  const combined = `${seed}::${originalName}`;
  const hash = hashSeedToUint32(combined).toString(36);
  return `${prefix}${hash.slice(0, 6)}`;
}

/**
 * Codifica/Decodifica string via XOR simétrico derivado de chave de domínio + semente.
 */
export function xorCipherTransform(input: string, key: string): string {
  if (!key) return input;
  const out: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const charCode = input.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    out.push(String.fromCharCode(charCode));
  }
  return out.join('');
}
