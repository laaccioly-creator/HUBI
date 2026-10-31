import { createMulberry32, derivePolymorphicId } from '../../src/core/crypto-prng';
import { ShieldMode } from '../../src/core/shield.config';

const SEMANTIC_MISDIRECTION_POOL = [
  'webglShaderMatrixCalc',
  'fontGlyphNormalizer',
  'audioBiquadFilterTick',
  'canvasBezierSubdivide',
  'vSyncFrameInterpolator',
  'srgbGammaCurveLookup',
  'indexedDbCursorPrefetch',
  'webrtcIceCandidateSort',
  'domResizeObserverFlush',
  'offscreenCanvasBlit',
  'telemetryBeaconQueue',
  'quaternionSlerpStep',
];

export interface PolymorphicObfuscatorOptions {
  mode: ShieldMode;
  secretSeed: string;
  stripConsoleInProd?: boolean;
}

/**
 * Gera um mapa de renomeação semântica enganosa alimentado pela semente do projeto.
 */
export function buildSemanticRenameMap(
  identifiers: string[],
  secretSeed: string
): Record<string, string> {
  const prng = createMulberry32(secretSeed);
  const map: Record<string, string> = {};

  for (const id of identifiers) {
    const poolIdx = Math.floor(prng() * SEMANTIC_MISDIRECTION_POOL.length);
    const baseName = SEMANTIC_MISDIRECTION_POOL[poolIdx];
    const suffix = derivePolymorphicId(id, secretSeed, '_');
    map[id] = `${baseName}${suffix}`;
  }

  return map;
}
