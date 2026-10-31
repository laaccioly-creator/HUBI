import { xorCipherTransform } from '../../src/core/crypto-prng';
import { ShieldConfig } from '../../src/core/shield.config';

export interface DomainValidationResult {
  authorized: boolean;
  currentHostname: string;
  derivedRuntimeKey: string;
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

  const isAllowed = config.allowedDomains.some((domain) => {
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
