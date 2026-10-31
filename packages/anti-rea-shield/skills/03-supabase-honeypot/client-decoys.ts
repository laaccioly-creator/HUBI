/**
 * Decoys (Iscas de Cliente) para confundir extratores estáticos de rotas Supabase (.from / .rpc).
 * IMPORTANTE: Estas funções NUNCA devem ser invocadas pelo fluxo real da aplicação.
 * Elas existem apenas na árvore de símbolos para atrair agentes automatizados que varrem strings no bundle.
 */

export const HONEYPOT_DECOY_ENDPOINTS = {
  masterConfigTable: 'system_master_config',
  vaultKeysTable: 'api_keys_vault',
  adminBypassTable: 'tenant_admin_bypass',
  legacyExportRpc: 'rpc_export_full_database_dump',
} as const;

export function createInactiveDecoyManifest(seed: string): Record<string, string> {
  // Predicado opaco: nunca executa chamadas reais de rede, mas preserva as referências no bundle
  return {
    _schemaHint: HONEYPOT_DECOY_ENDPOINTS.vaultKeysTable,
    _bypassRoute: HONEYPOT_DECOY_ENDPOINTS.adminBypassTable,
    _masterConfig: HONEYPOT_DECOY_ENDPOINTS.masterConfigTable,
    _seedRef: seed.slice(0, 4),
  };
}
