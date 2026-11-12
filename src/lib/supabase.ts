import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || 'https://eylpiwynsbnmcacmwiqg.supabase.co';
export const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_SNuv08eSyBClEQWGF3Z3oQ_28nI--9P';

const obterBaseFunctionsUrl = (): string => {
  const customUrl = import.meta.env?.VITE_SUPABASE_FUNCTIONS_URL;
  if (customUrl && customUrl.trim()) {
    return customUrl.trim().replace(/\/+$/, '');
  }
  // Em DEV, permite apontar para o servidor local de Edge Functions (via proxy Vite sem CORS/Mixed Content)
  // ou diretamente para http://127.0.0.1:54321/functions/v1 quando VITE_USE_LOCAL_FUNCTIONS=true
  if (import.meta.env?.DEV && import.meta.env?.VITE_USE_LOCAL_FUNCTIONS === 'true') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/local-functions`;
    }
    return 'http://127.0.0.1:54321/functions/v1';
  }
  return `${supabaseUrl}/functions/v1`;
};

export const supabaseFunctionsBaseUrl = obterBaseFunctionsUrl();

const remoteFunctionsPrefix = `${supabaseUrl}/functions/v1`;
const usarRoteamentoFunctionsLocal =
  Boolean(import.meta.env?.DEV) &&
  supabaseFunctionsBaseUrl !== remoteFunctionsPrefix;

const fetchComRoteamentoLocal: typeof fetch = (input, init) => {
  if (usarRoteamentoFunctionsLocal) {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(remoteFunctionsPrefix)) {
      const novaUrl = urlStr.replace(remoteFunctionsPrefix, supabaseFunctionsBaseUrl);
      if (typeof input === 'string' || input instanceof URL) {
        return fetch(novaUrl, init);
      }
      return fetch(new Request(novaUrl, input), init);
    }
  }
  return fetch(input, init);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: usarRoteamentoFunctionsLocal ? { fetch: fetchComRoteamentoLocal } : undefined,
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
