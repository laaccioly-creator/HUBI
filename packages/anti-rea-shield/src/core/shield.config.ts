export type ShieldMode = 'development' | 'simulation' | 'production';

export interface ShieldConfig {
  mode: ShieldMode;
  secretSeed: string;
  allowedDomains: string[];
  riskThreshold: number;
  stochasticDelayMinMs: number;
  stochasticDelayMaxMs: number;
  enableConsoleSimulationLogs: boolean;
}

function readEnvVar(key: string, fallback: string): string {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
    if (metaEnv && typeof metaEnv[key] === 'string' && metaEnv[key]) {
      return metaEnv[key] as string;
    }
  } catch {
    // Ignora caso fora de contexto Vite
  }

  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key] as string;
    }
  } catch {
    // Ignora caso navegador puro
  }

  return fallback;
}

export function loadShieldConfig(overrides?: Partial<ShieldConfig>): ShieldConfig {
  const rawMode = readEnvVar('VITE_SHIELD_MODE', 'simulation').toLowerCase().trim();
  const mode: ShieldMode =
    rawMode === 'production' || rawMode === 'development' || rawMode === 'simulation'
      ? (rawMode as ShieldMode)
      : 'simulation';

  const secretSeed = readEnvVar('VITE_SHIELD_SECRET_SEED', 'hubi-polymorphic-seed-2026');
  const rawDomains = readEnvVar(
    'VITE_SHIELD_ALLOWED_DOMAINS',
    'localhost,127.0.0.1,hubi-studio.ai.studio,.run.app,.ai.studio,.vercel.app'
  );

  const allowedDomains = rawDomains
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  return {
    mode,
    secretSeed,
    allowedDomains,
    riskThreshold: 70,
    stochasticDelayMinMs: 8000,
    stochasticDelayMaxMs: 25000,
    enableConsoleSimulationLogs: mode !== 'production',
    ...overrides,
  };
}
