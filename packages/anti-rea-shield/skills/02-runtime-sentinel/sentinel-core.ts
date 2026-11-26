import { MultiSignalRiskEngine } from '../../src/core/risk-engine';
import { loadShieldConfig, ShieldConfig } from '../../src/core/shield.config';
import { verifyDomainLock } from './domain-lock';
import { scheduleSilentCorruption } from './state-corruptor';

export interface SentinelInstance {
  config: ShieldConfig;
  riskEngine: MultiSignalRiskEngine;
  runDiagnostics: () => number;
}

function isNativeFunction(fn: unknown): boolean {
  if (typeof fn !== 'function') return true;
  try {
    const str = Function.prototype.toString.call(fn);
    return str.includes('[native code]');
  } catch {
    return true;
  }
}

/**
 * Inicializa o Sentinela de Execução calibrado para zero falsos positivos em dispositivos móveis e PWAs.
 */
export function initRuntimeSentinel(customConfig?: Partial<ShieldConfig>): SentinelInstance {
  const config = loadShieldConfig(customConfig);

  const riskEngine = new MultiSignalRiskEngine(config, (score, events) => {
    const summary = events.map((e) => e.signal).join(',');
    scheduleSilentCorruption(config, `Score=${score} [${summary}]`, events);
  });

  const runDiagnostics = (): number => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return 0;
    }

    if (config.mode === 'development') {
      return 0;
    }

    // 1. Verificação de Domain Lock
    const domainCheck = verifyDomainLock(config);
    if (!domainCheck.authorized) {
      riskEngine.reportSignal(
        'UNAUTHORIZED_DOMAIN',
        100,
        `Hostname não autorizado: ${domainCheck.currentHostname}`
      );
    }

    // 2. Detecção de WebDriver / Automação explícita
    if (navigator.webdriver === true) {
      riskEngine.reportSignal(
        'WEBDRIVER_DETECTED',
        70,
        'Propriedade navigator.webdriver === true detectada'
      );
    }

    // 3. Detecção de artefatos CDP (Chrome DevTools Protocol / Playwright / Puppeteer)
    const winAny = window as unknown as Record<string, unknown>;
    const hasCdpArtifact = Object.keys(winAny).some(
      (k) =>
        k.startsWith('cdc_') ||
        k.startsWith('__playwright') ||
        k.startsWith('__puppeteer') ||
        k.startsWith('__selenium')
    );
    if (hasCdpArtifact) {
      riskEngine.reportSignal(
        'CDP_AUTOMATION_ARTIFACT',
        75,
        'Artefatos globais de instrumentação Playwright/Puppeteer/Selenium detectados'
      );
    }

    // 4. Verificação de WebGL Renderer típico de servidores Headless Linux (SwiftShader / llvmpipe)
    // Peso reduzido (20) para evitar falso positivo em celulares Android de entrada ou PCs sem GPU dedicada
    let gl: WebGLRenderingContext | null = null;
    try {
      const canvas = document.createElement('canvas');
      gl =
        (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
          if (renderer.includes('swiftshader') || renderer.includes('llvmpipe')) {
            riskEngine.reportSignal(
              'HEADLESS_WEBGL_RENDERER',
              20,
              `Renderer virtualizado detectado: ${renderer}`
            );
          }
        }
      }
    } catch {
      // Ignora caso WebGL indisponível no dispositivo
    } finally {
      try {
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        // Ignora caso contexto já tenha sido liberado
      }
    }

    // 5. Integridade de APIs Nativas (JSON.parse / JSON.stringify)
    // Peso reduzido (25) para evitar falso positivo em PCs com módulos bancários (Warsaw/Diebold) ou WebViews OEM
    if (!isNativeFunction(JSON.parse) || !isNativeFunction(JSON.stringify)) {
      riskEngine.reportSignal(
        'NATIVE_API_MONKEY_PATCHED',
        25,
        'Serializador nativo JSON sofreu monkey-patching'
      );
    }

    return riskEngine.getScore();
  };

  if (typeof window !== 'undefined' && config.mode !== 'development') {
    const winWithIdle = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof winWithIdle.requestIdleCallback === 'function') {
      winWithIdle.requestIdleCallback(() => {
        runDiagnostics();
      }, { timeout: 2000 });
    } else {
      window.setTimeout(() => {
        runDiagnostics();
      }, 1500);
    }
  }

  return {
    config,
    riskEngine,
    runDiagnostics,
  };
}
