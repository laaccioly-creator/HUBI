export interface SecurityFinding {
  ruleId: 'EXPOSED_VITE_SECRET' | 'DIRECT_CRITICAL_MUTATION' | 'PUBLIC_SELECT_STAR';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  filePath: string;
  line: number;
  snippet: string;
  recommendation: string;
}

const ALLOWED_PUBLIC_ENV_VARS = new Set([
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SHIELD_MODE',
  'VITE_SHIELD_SECRET_SEED',
  'VITE_SHIELD_ALLOWED_DOMAINS',
  'VITE_APP_URL',
]);

const CRITICAL_TABLES = [
  'vendas',
  'pagamentos_venda',
  'transacoes_caderneta',
  'caixas',
  'movimentacoes_caixa',
];

/**
 * Analisa o código-fonte de um arquivo TypeScript/React em busca de padrões que violam Zero-Trust.
 */
export function scanSourceCodeForZeroTrustViolations(
  sourceText: string,
  filePath: string
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = sourceText.split(/\r?\n/);

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1;

    // 1. Detectar variáveis VITE_* sensíveis expostas ao bundle
    const envMatches = lineText.match(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g);
    if (envMatches) {
      for (const match of envMatches) {
        const varName = match.replace('import.meta.env.', '');
        if (!ALLOWED_PUBLIC_ENV_VARS.has(varName)) {
          findings.push({
            ruleId: 'EXPOSED_VITE_SECRET',
            severity: 'HIGH',
            filePath,
            line: lineNum,
            snippet: lineText.trim(),
            recommendation: `Mover ${varName} para Supabase Edge Function Secrets (Deno.env.get) para não vazar no bundle JS.`,
          });
        }
      }
    }

    // 2. Detectar mutações diretas em tabelas financeiras críticas
    for (const table of CRITICAL_TABLES) {
      if (
        lineText.includes(`.from('${table}')`) &&
        (lineText.includes('.insert(') || lineText.includes('.update(') || lineText.includes('.delete('))
      ) {
        findings.push({
          ruleId: 'DIRECT_CRITICAL_MUTATION',
          severity: 'MEDIUM',
          filePath,
          line: lineNum,
          snippet: lineText.trim(),
          recommendation: `Considere encapsular a mutação da tabela '${table}' em uma RPC PL/pgSQL SECURITY DEFINER com validação atômica.`,
        });
      }
    }
  });

  return findings;
}
