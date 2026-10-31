import { ShieldConfig } from './shield.config';

export type RiskSignalId =
  | 'WEBDRIVER_DETECTED'
  | 'CDP_AUTOMATION_ARTIFACT'
  | 'HEADLESS_WEBGL_RENDERER'
  | 'NATIVE_API_MONKEY_PATCHED'
  | 'UNAUTHORIZED_DOMAIN'
  | 'RAPID_ROUTE_SCRAPING'
  | 'IFRAME_EMBED_UNAUTHORIZED';

export interface RiskEvent {
  signal: RiskSignalId;
  weight: number;
  detail: string;
  timestamp: number;
}

export class MultiSignalRiskEngine {
  private score = 0;
  private recordedSignals = new Set<RiskSignalId>();
  private history: RiskEvent[] = [];
  private config: ShieldConfig;
  private onThresholdReached?: (score: number, events: RiskEvent[]) => void;
  private triggered = false;

  constructor(
    config: ShieldConfig,
    onThresholdReached?: (score: number, events: RiskEvent[]) => void
  ) {
    this.config = config;
    this.onThresholdReached = onThresholdReached;
  }

  /**
   * Registra um sinal de risco evitando duplicidade e falsos positivos em dispositivos móveis/WebViews.
   */
  public reportSignal(signal: RiskSignalId, weight: number, detail: string): number {
    if (this.recordedSignals.has(signal)) {
      return this.score;
    }

    this.recordedSignals.add(signal);
    this.score = Math.min(100, this.score + weight);

    const event: RiskEvent = {
      signal,
      weight,
      detail,
      timestamp: Date.now(),
    };
    this.history.push(event);

    if (this.config.mode === 'simulation' && this.config.enableConsoleSimulationLogs) {
      console.info(
        `[Anti-REA-Shield][SIMULATION] Sinal=${signal} (+${weight}) | Score=${this.score}/${this.config.riskThreshold} | Detalhe: ${detail}`
      );
    }

    if (!this.triggered && this.score >= this.config.riskThreshold) {
      this.triggered = true;
      if (this.config.mode === 'simulation') {
        console.warn(
          `[Anti-REA-Shield][SIMULATION] Limiar atingido (${this.score} >= ${this.config.riskThreshold}). Em modo 'production', a degradação silenciosa estocástica seria iniciada.`
        );
      } else if (this.config.mode === 'production' && this.onThresholdReached) {
        this.onThresholdReached(this.score, [...this.history]);
      }
    }

    return this.score;
  }

  public getScore(): number {
    return this.score;
  }

  public getEvents(): RiskEvent[] {
    return [...this.history];
  }

  public reset(): void {
    this.score = 0;
    this.recordedSignals.clear();
    this.history = [];
    this.triggered = false;
  }
}
