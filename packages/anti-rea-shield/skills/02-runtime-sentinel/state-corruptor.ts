import { createMulberry32 } from '../../src/core/crypto-prng';
import { ShieldConfig } from '../../src/core/shield.config';

let corruptionScheduled = false;
let corruptionActive = false;

/**
 * Agenda degradação silenciosa com atraso estocástico (8s a 25s) somente quando mode === 'production'.
 * Em modo 'simulation' ou 'development', nunca altera estados ou requisições.
 */
export function scheduleSilentCorruption(config: ShieldConfig, reason: string): void {
  if (config.mode !== 'production') {
    if (config.mode === 'simulation' && config.enableConsoleSimulationLogs) {
      console.info(
        `[Anti-REA-Shield][SIMULATION] scheduleSilentCorruption chamado (${reason}) — nenhuma alteração aplicada na UI.`
      );
    }
    return;
  }

  if (corruptionScheduled || corruptionActive) return;
  corruptionScheduled = true;

  const prng = createMulberry32(`${config.secretSeed}:${Date.now()}`);
  const range = Math.max(1000, config.stochasticDelayMaxMs - config.stochasticDelayMinMs);
  const delayMs = Math.floor(config.stochasticDelayMinMs + prng() * range);

  setTimeout(() => {
    corruptionActive = true;
  }, delayMs);
}

export function isSilentCorruptionActive(): boolean {
  return corruptionActive;
}
