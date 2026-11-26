import {
  initRuntimeSentinel,
  loadShieldConfig,
  createInactiveDecoyManifest,
  SentinelInstance,
} from '../../packages/anti-rea-shield/src';

let sentinelInstance: SentinelInstance | null = null;
let activeDecoyManifest: Record<string, string> | null = null;

/**
 * Ponto de acoplamento seguro do Anti-REA-Shield no bootstrap do HUBI.
 * Opera em modo 'production' por padrão (configurável via VITE_SHIELD_MODE),
 * com execução assíncrona pós-hidratação e bloqueio ativo restrito a domínios não autorizados.
 */
export function inicializarAntiReaShield(): SentinelInstance | null {
  try {
    if (sentinelInstance) return sentinelInstance;

    const config = loadShieldConfig();

    // Preserva referências isca inativas no grafo do bundle para confundir scanners estáticos
    activeDecoyManifest = createInactiveDecoyManifest(config.secretSeed);
    if (!activeDecoyManifest) {
      return null;
    }

    sentinelInstance = initRuntimeSentinel(config);
    return sentinelInstance;
  } catch {
    return null;
  }
}

export function obterInstanciaAntiReaShield(): SentinelInstance | null {
  return sentinelInstance;
}
