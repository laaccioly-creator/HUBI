import { xorCipherTransform } from '../../src/core/crypto-prng';
import { ShieldConfig } from '../../src/core/shield.config';

export interface DomainValidationResult {
  authorized: boolean;
  currentHostname: string;
  derivedRuntimeKey: string;
}

/**
 * Valida estritamente se o hostname é um IPv4 privado de LAN (192.168.x.x ou 10.x.x.x),
 * permitindo testes em dispositivos mobile via Vite `--host` sem abrir brecha para spoofing.
 */
function isPrivateLanIp(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    const num = Number(part);
    if (!Number.isInteger(num) || num < 0 || num > 255) return false;
    octets.push(num);
  }

  const [a, b] = octets;
  return (a === 192 && b === 168) || a === 10;
}

/**
 * Verifica se o hostname atual é autorizado e deriva uma chave criptográfica em runtime.
 */
export function verifyDomainLock(config: ShieldConfig): DomainValidationResult {
  if (typeof window === 'undefined' || !window.location) {
    return {
      authorized: true,
      currentHostname: 'server-ssr',
      derivedRuntimeKey: config.secretSeed,
    };
  }

  const hostname = (window.location.hostname || 'localhost').toLowerCase().trim();

  if (config.mode === 'development') {
    return {
      authorized: true,
      currentHostname: hostname,
      derivedRuntimeKey: xorCipherTransform(config.secretSeed, hostname),
    };
  }

  const isAllowed =
    isPrivateLanIp(hostname) ||
    config.allowedDomains.some((domain) => {
      if (domain.startsWith('.')) {
        return hostname.endsWith(domain) || hostname === domain.slice(1);
      }
      return hostname === domain || hostname.endsWith(`.${domain}`);
    });

  // Se o domínio não for autorizado, a chave derivada usa um salt inválido proposital
  const effectiveSalt = isAllowed ? config.secretSeed : `invalid_origin_${hostname}`;

  return {
    authorized: isAllowed,
    currentHostname: hostname,
    derivedRuntimeKey: xorCipherTransform(effectiveSalt, hostname),
  };
}
