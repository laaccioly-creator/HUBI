import type * as TsApi from 'typescript';

export interface SecurityFinding {
  ruleId: 'EXPOSED_VITE_SECRET' | 'DIRECT_CRITICAL_MUTATION' | 'PUBLIC_SELECT_STAR';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  filePath: string;
  line: number;
  snippet: string;
  recommendation: string;
  table?: string;
  operation?: string;
}

const ALLOWED_PUBLIC_ENV_VARS = new Set([
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SHIELD_MODE',
  'VITE_SHIELD_SECRET_SEED',
  'VITE_SHIELD_ALLOWED_DOMAINS',
  'VITE_APP_URL',
  'VITE_PUBLIC_APP_URL',
  'VITE_SUPABASE_FUNCTIONS_URL',
  'VITE_USE_LOCAL_FUNCTIONS',
]);

export const CRITICAL_TABLES = new Set([
  'pedidos',
  'clientes',
  'produtos',
  'variacoes_produto',
  'lojas',
  'pagamentos_pedido',
  'itens_pedido',
  'transacoes_financeiras',
  'usuarios_loja',
  'caderneta_lancamentos',
  'sessoes_caixa',
  'movimentacoes_caixa',
  'configuracoes_plataforma',
]);

const PUBLIC_ROUTE_OR_SERVICE_MARKERS = [
  'CatalogoPublico',
  'components/catalogo/',
  'ModalBuscaClienteCatalogo',
  'ModalCadernetaClienteCatalogo',
  'ModalEnderecoClienteCatalogo',
  'PedidoAndamentoPublico',
  'ReciboPublico',
  'ConfirmarAgendamentoPublico',
  'clienteCatalogoService',
];

function isPublicRouteOrServiceFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return PUBLIC_ROUTE_OR_SERVICE_MARKERS.some((marker) => normalized.includes(marker));
}

function getLineSnippet(lines: string[], lineNum: number): string {
  const raw = lines[lineNum - 1] ?? '';
  return raw.trim().slice(0, 140);
}

function scanWithTypeScriptAst(
  sourceText: string,
  filePath: string,
  ts: typeof TsApi
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = sourceText.split(/\r?\n/);
  const isPublicFile = isPublicRouteOrServiceFile(filePath);
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );

  const seenKeys = new Set<string>();
  const pushFinding = (finding: SecurityFinding) => {
    const key = `${finding.ruleId}:${finding.line}:${finding.table || ''}:${finding.operation || ''}:${finding.snippet}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    findings.push(finding);
  };

  const isImportMetaEnv = (expr: TsApi.Expression): boolean => {
    const unwrapped = ts.isParenthesizedExpression(expr) ? expr.expression : expr;
    if (!ts.isPropertyAccessExpression(unwrapped)) return false;
    if (unwrapped.name.text !== 'env') return false;
    return ts.isMetaProperty(unwrapped.expression) && unwrapped.expression.keywordToken === ts.SyntaxKind.ImportKeyword;
  };

  const visit = (node: TsApi.Node): void => {
    // 1. Detectar import.meta.env.VITE_* ou import.meta.env?.VITE_* fora da allowlist
    if (ts.isPropertyAccessExpression(node) && isImportMetaEnv(node.expression)) {
      const varName = node.name.text;
      if (varName.startsWith('VITE_') && !ALLOWED_PUBLIC_ENV_VARS.has(varName)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        pushFinding({
          ruleId: 'EXPOSED_VITE_SECRET',
          severity: 'HIGH',
          filePath,
          line,
          snippet: getLineSnippet(lines, line),
          recommendation: `Mover ${varName} para Supabase Edge Function Secrets (Deno.env.get) para não vazar no bundle JS.`,
        });
      }
    } else if (ts.isElementAccessExpression(node) && isImportMetaEnv(node.expression)) {
      const arg = node.argumentExpression;
      if (ts.isStringLiteralLike(arg) && arg.text.startsWith('VITE_') && !ALLOWED_PUBLIC_ENV_VARS.has(arg.text)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        pushFinding({
          ruleId: 'EXPOSED_VITE_SECRET',
          severity: 'HIGH',
          filePath,
          line,
          snippet: getLineSnippet(lines, line),
          recommendation: `Mover ${arg.text} para Supabase Edge Function Secrets (Deno.env.get) para não vazar no bundle JS.`,
        });
      }
    }

    // 2 e 3. Detectar encadeamentos multilinha a partir de .from('tabela')
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'from' &&
      node.arguments.length >= 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const tableName = node.arguments[0].text;
      let current: TsApi.Node = node;

      while (current.parent) {
        let nextParent: TsApi.Node = current.parent;
        while (
          ts.isParenthesizedExpression(nextParent) ||
          ts.isAsExpression(nextParent) ||
          ts.isNonNullExpression(nextParent)
        ) {
          nextParent = nextParent.parent;
        }

        if (
          ts.isPropertyAccessExpression(nextParent) &&
          nextParent.parent &&
          ts.isCallExpression(nextParent.parent) &&
          nextParent.parent.expression === nextParent
        ) {
          const methodName = nextParent.name.text;
          const methodCall = nextParent.parent;
          const line =
            sourceFile.getLineAndCharacterOfPosition(nextParent.name.getStart(sourceFile)).line + 1;

          if (
            (methodName === 'insert' ||
              methodName === 'update' ||
              methodName === 'delete' ||
              methodName === 'upsert') &&
            CRITICAL_TABLES.has(tableName)
          ) {
            pushFinding({
              ruleId: 'DIRECT_CRITICAL_MUTATION',
              severity: 'MEDIUM',
              filePath,
              line,
              table: tableName,
              operation: methodName,
              snippet: `.from('${tableName}').${methodName}(...) — ${getLineSnippet(lines, line)}`,
              recommendation: `Encapsular a mutação '${methodName}' em '${tableName}' via RPC PL/pgSQL SECURITY DEFINER com validação multi-tenant.`,
            });
          }

          if (methodName === 'select' && isPublicFile) {
            const selectArg = methodCall.arguments[0];
            if (selectArg && ts.isStringLiteralLike(selectArg) && selectArg.text.includes('*')) {
              pushFinding({
                ruleId: 'PUBLIC_SELECT_STAR',
                severity: 'HIGH',
                filePath,
                line,
                table: tableName,
                operation: 'select',
                snippet: `.from('${tableName}').select('${selectArg.text.slice(0, 60)}')`,
                recommendation: `Substituir .select('*') em rota pública na tabela '${tableName}' por colunas explícitas ou RPC segura (sem PII/preco_custo).`,
              });
            }
          }

          current = methodCall;
          continue;
        }

        break;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
}

function scanWithMultilineFallback(sourceText: string, filePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = sourceText.split(/\r?\n/);
  const isPublicFile = isPublicRouteOrServiceFile(filePath);

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1;
    const envMatches = lineText.match(/import\.meta\.env\??\.(VITE_[A-Z0-9_]+)/g);
    if (envMatches) {
      for (const match of envMatches) {
        const varName = match.replace(/import\.meta\.env\??\./, '');
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
  });

  const fromRegex = /\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = fromRegex.exec(sourceText)) !== null) {
    const tableName = match[1];
    const startIdx = match.index;
    const lookahead = sourceText.slice(startIdx, startIdx + 450);
    const nextFrom = lookahead.indexOf('.from(', 6);
    const chunk = nextFrom > 0 ? lookahead.slice(0, nextFrom) : lookahead;
    const lineNum = sourceText.slice(0, startIdx).split(/\r?\n/).length;

    const mutMatch = chunk.match(/\.(insert|update|delete|upsert)\s*\(/);
    if (mutMatch && CRITICAL_TABLES.has(tableName)) {
      const op = mutMatch[1];
      findings.push({
        ruleId: 'DIRECT_CRITICAL_MUTATION',
        severity: 'MEDIUM',
        filePath,
        line: lineNum,
        table: tableName,
        operation: op,
        snippet: `.from('${tableName}').${op}(...)`,
        recommendation: `Encapsular a mutação '${op}' em '${tableName}' via RPC PL/pgSQL SECURITY DEFINER com validação multi-tenant.`,
      });
    }

    if (isPublicFile) {
      const selMatch = chunk.match(/\.select\(\s*['"`]([^'"`]*\*[^'"`]*)['"`]/);
      if (selMatch) {
        findings.push({
          ruleId: 'PUBLIC_SELECT_STAR',
          severity: 'HIGH',
          filePath,
          line: lineNum,
          table: tableName,
          operation: 'select',
          snippet: `.from('${tableName}').select('${selMatch[1].slice(0, 60)}')`,
          recommendation: `Substituir .select('*') em rota pública na tabela '${tableName}' por colunas explícitas ou RPC segura (sem PII/preco_custo).`,
        });
      }
    }
  }

  return findings;
}

/**
 * Analisa o código-fonte de um arquivo TypeScript/React em busca de padrões que violam Zero-Trust.
 * Quando `tsModule` é fornecido (CLI/Node), utiliza a TypeScript Compiler API para parsing AST completo.
 */
export function scanSourceCodeForZeroTrustViolations(
  sourceText: string,
  filePath: string,
  tsModule?: typeof TsApi
): SecurityFinding[] {
  if (tsModule) {
    return scanWithTypeScriptAst(sourceText, filePath, tsModule);
  }
  return scanWithMultilineFallback(sourceText, filePath);
}
