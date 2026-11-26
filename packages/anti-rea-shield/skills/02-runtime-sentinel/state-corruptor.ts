import { createMulberry32 } from '../../src/core/crypto-prng';
import { RiskEvent, RiskSignalId } from '../../src/core/risk-engine';
import { ShieldConfig } from '../../src/core/shield.config';

export interface SecurityIncidentRecord {
  type: 'UNAUTHORIZED_DOMAIN' | 'AUTOMATION_DETECTED';
  signals: RiskSignalId[];
  score: number;
  hostname: string;
  mode: ShieldConfig['mode'];
  timestamp: number;
}

let corruptionScheduled = false;
let corruptionActive = false;
let lastSecurityIncident: SecurityIncidentRecord | null = null;

function recordSanitizedIncident(
  config: ShieldConfig,
  events: RiskEvent[],
  isUnauthorizedDomain: boolean
): void {
  const hostname =
    typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname.toLowerCase()
      : 'unknown';

  const score = Math.min(
    100,
    events.reduce((acc, ev) => acc + (ev.weight || 0), 0)
  );

  const record: SecurityIncidentRecord = {
    type: isUnauthorizedDomain ? 'UNAUTHORIZED_DOMAIN' : 'AUTOMATION_DETECTED',
    signals: events.map((ev) => ev.signal),
    score,
    hostname,
    mode: config.mode,
    timestamp: Date.now(),
  };

  lastSecurityIncident = record;

  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('hubi_shield_last_incident', JSON.stringify(record));
    }
  } catch {
    // Modo offline ou storage bloqueado: ignora silenciosamente
  }

  try {
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('anti-rea-shield:incident', { detail: record }));
    }
  } catch {
    // Ignora falha de despacho de evento em ambientes restritos
  }
}

function mountDomainLockOverlay(): void {
  if (typeof document === 'undefined' || !document.body) return;
  if (document.getElementById('anti-rea-domain-lock-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'anti-rea-domain-lock-overlay';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'background:rgba(2,6,23,0.96)',
    'backdrop-filter:blur(8px)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:24px',
    'pointer-events:auto',
    'font-family:system-ui,-apple-system,sans-serif',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'max-width:440px',
    'width:100%',
    'background:#0f172a',
    'border:1px solid #334155',
    'border-radius:16px',
    'padding:28px',
    'color:#f8fafc',
    'box-shadow:0 25px 50px -12px rgba(0,0,0,0.65)',
    'text-align:center',
  ].join(';');

  const title = document.createElement('h2');
  title.textContent = 'Ambiente Não Oficial Detectado';
  title.style.cssText = 'margin:0 0 12px;font-size:20px;font-weight:700;color:#f8fafc;';

  const desc = document.createElement('p');
  desc.textContent =
    'Por segurança, esta aplicação não pode operar neste domínio. Acesse o sistema exclusivamente pelo endereço oficial.';
  desc.style.cssText = 'margin:0 0 20px;font-size:14px;line-height:1.55;color:#cbd5e1;';

  const link = document.createElement('a');
  link.href = 'https://rubi.ia.br';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Acessar rubi.ia.br';
  link.style.cssText = [
    'display:inline-block',
    'padding:10px 20px',
    'border-radius:10px',
    'background:#10b981',
    'color:#022c22',
    'font-weight:700',
    'font-size:14px',
    'text-decoration:none',
  ].join(';');

  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(link);
  overlay.appendChild(card);

  document.body.appendChild(overlay);
  document.documentElement.style.overflow = 'hidden';
}

/**
 * Ativa defesa segura somente em modo 'production' quando houver domínio não autorizado
 * ou automação forte confirmada. Em domínios autorizados, jamais altera cálculos financeiros,
 * PDV autenticado, payloads PIX ou impressão térmica ESC/POS.
 */
export function scheduleSilentCorruption(
  config: ShieldConfig,
  reason: string,
  events: RiskEvent[] = []
): void {
  if (config.mode !== 'production') {
    if (config.mode === 'simulation' && config.enableConsoleSimulationLogs) {
      console.info(
        `[Anti-REA-Shield][SIMULATION] scheduleSilentCorruption chamado (${reason}) — nenhuma alteração aplicada na UI.`
      );
    }
    return;
  }

  const isUnauthorizedDomain = events.some((e) => e.signal === 'UNAUTHORIZED_DOMAIN');
  const isConfirmedAutomation = events.some(
    (e) => e.signal === 'WEBDRIVER_DETECTED' || e.signal === 'CDP_AUTOMATION_ARTIFACT'
  );

  if (!isUnauthorizedDomain && !isConfirmedAutomation) {
    return;
  }

  recordSanitizedIncident(config, events, isUnauthorizedDomain);

  // Em domínios autorizados, mantém operação 100% íntegra (sem corromper PDV, PIX ou ESC/POS)
  if (!isUnauthorizedDomain) {
    corruptionActive = true;
    return;
  }

  if (corruptionScheduled || corruptionActive) return;
  corruptionScheduled = true;

  const prng = createMulberry32(`${config.secretSeed}:${Date.now()}`);
  const delayMs = Math.floor(1500 + prng() * 1500);

  setTimeout(() => {
    corruptionActive = true;
    mountDomainLockOverlay();
  }, delayMs);
}

export function isSilentCorruptionActive(): boolean {
  return corruptionActive;
}

export function getLastSecurityIncident(): SecurityIncidentRecord | null {
  if (lastSecurityIncident) return lastSecurityIncident;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem('hubi_shield_last_incident');
      if (raw) {
        return JSON.parse(raw) as SecurityIncidentRecord;
      }
    }
  } catch {
    // Ignora falha de leitura em storage restrito
  }
  return null;
}
