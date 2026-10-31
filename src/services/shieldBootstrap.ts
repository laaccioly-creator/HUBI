import {
  initRuntimeSentinel,
  loadShieldConfig,
  createInactiveDecoyManifest,
  SentinelInstance,
} from '../../packages/anti-rea-shield/src';

let sentinelInstance: SentinelInstance | null = null;

/**
 * Ponto de acoplamento seguro do Anti-REA-Shield no bootstrap do HUBI.
 * Opera em modo 'simulation' por padrão (apenas diagnóstico passivo no console,
 * sem degradar ou bloquear a interface do usuário ou dispositivos móveis).
 */
export function inicializarAntiReaShield(): SentinelInstance | null {
  try {
    if (sentinelInstance) return sentinelInstance;

    const config = loadShieldConfig();

    // Preserva referências isca inativas no grafo do bundle para confundir scanners estáticos
    const decoyManifest = createInactiveDecoyManifest(config.secretSeed);
    if (!decoyManifest) {
      return null;
    }

    sentinelInstance = initRuntimeSentinel(config);
    return sentinelInstance;
  } catch {
    return null;
  }
}
