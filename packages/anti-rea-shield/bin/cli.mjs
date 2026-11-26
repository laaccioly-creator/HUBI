#!/usr/bin/env node
/**
 * CLI Oficial da Suíte Anti-REA-Shield
 * Uso:
 *   npx anti-rea-shield status
 *   npx anti-rea-shield audit
 *   npx anti-rea-shield init
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const command = (args[0] || 'status').toLowerCase();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');

function printBanner() {
  console.log('\n========================================================');
  console.log('🛡️  ANTI-REA-SHIELD v2.0 — Defesa Anti-Clone & Anti-REA');
  console.log('========================================================\n');
}

function runStatus() {
  printBanner();
  const skillsDir = path.join(packageRoot, 'skills');
  const sqlDir = path.join(packageRoot, 'sql');

  console.log('📦 Status dos Módulos Instalados:');
  if (fs.existsSync(skillsDir)) {
    const folders = fs.readdirSync(skillsDir);
    for (const folder of folders) {
      console.log(`  ✅ Skill ativa: ${folder}`);
    }
  } else {
    console.log('  ⚠️ Diretório de skills não localizado no caminho padrão.');
  }

  if (fs.existsSync(sqlDir)) {
    const sqlFiles = fs.readdirSync(sqlDir);
    console.log('\n🗄️ Scripts SQL de Blindagem Supabase:');
    for (const f of sqlFiles) {
      console.log(`  📜 ${f}`);
    }
  }
  console.log('\nModo padrão recomendado para produção: VITE_SHIELD_MODE=production\n');
}

async function loadAstScanner(ts) {
  const scannerTsPath = path.join(packageRoot, 'skills', '04-zero-trust-migrator', 'ast-scanner.ts');
  const scannerSource = fs.readFileSync(scannerTsPath, 'utf8');
  const transpiled = ts.transpileModule(scannerSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText, 'utf8').toString('base64')}`;
  return import(moduleUrl);
}

async function runAstAudit() {
  printBanner();
  const srcDir = path.resolve(process.cwd(), 'src');
  if (!fs.existsSync(srcDir)) {
    console.log('⚠️ Diretório src/ não encontrado.');
    return;
  }

  const tsMod = await import('typescript');
  const ts = tsMod.default ?? tsMod;
  const { scanSourceCodeForZeroTrustViolations } = await loadAstScanner(ts);

  console.log('🔍 Executando auditoria AST Zero-Trust em src/ (TypeScript Compiler API)...');
  const allFindings = [];
  let filesScanned = 0;

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        filesScanned++;
        const relPath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
        const content = fs.readFileSync(fullPath, 'utf8');
        const findings = scanSourceCodeForZeroTrustViolations(content, relPath, ts);
        allFindings.push(...findings);
      }
    }
  }

  walk(srcDir);

  const byRule = {
    EXPOSED_VITE_SECRET: [],
    PUBLIC_SELECT_STAR: [],
    DIRECT_CRITICAL_MUTATION: [],
  };
  const mutationsByTable = {};

  for (const f of allFindings) {
    if (byRule[f.ruleId]) byRule[f.ruleId].push(f);
    if (f.ruleId === 'DIRECT_CRITICAL_MUTATION' && f.table) {
      mutationsByTable[f.table] = (mutationsByTable[f.table] || 0) + 1;
    }
  }

  console.log(`\n📊 Resumo da Auditoria (${filesScanned} arquivos analisados):`);
  console.log(`  - EXPOSED_VITE_SECRET:      ${byRule.EXPOSED_VITE_SECRET.length}`);
  console.log(`  - PUBLIC_SELECT_STAR:       ${byRule.PUBLIC_SELECT_STAR.length}`);
  console.log(`  - DIRECT_CRITICAL_MUTATION: ${byRule.DIRECT_CRITICAL_MUTATION.length}`);

  if (Object.keys(mutationsByTable).length > 0) {
    console.log('\n🗄️ Mutações PostgREST Diretas por Tabela Crítica:');
    const sorted = Object.entries(mutationsByTable).sort((a, b) => b[1] - a[1]);
    for (const [tbl, count] of sorted) {
      console.log(`  - ${tbl}: ${count}`);
    }
  }

  if (byRule.EXPOSED_VITE_SECRET.length > 0) {
    console.log('\n🚨 [HIGH] Variáveis VITE_* sensíveis expostas:');
    for (const f of byRule.EXPOSED_VITE_SECRET) {
      console.log(`  - ${f.filePath}:${f.line} | ${f.snippet}`);
    }
  }

  if (byRule.PUBLIC_SELECT_STAR.length > 0) {
    console.log('\n⚠️ [HIGH] Consultas .select("*") em rotas/serviços públicos:');
    for (const f of byRule.PUBLIC_SELECT_STAR) {
      console.log(`  - ${f.filePath}:${f.line} | ${f.snippet}`);
    }
  }

  if (byRule.DIRECT_CRITICAL_MUTATION.length > 0) {
    console.log('\n📌 [MEDIUM] Mutações diretas em tabelas críticas:');
    for (const f of byRule.DIRECT_CRITICAL_MUTATION) {
      console.log(`  - ${f.filePath}:${f.line} | ${f.snippet}`);
    }
  }

  console.log(`\n✅ Auditoria concluída: ${filesScanned} arquivos | ${allFindings.length} achados totais.\n`);
}

if (command === 'audit') {
  await runAstAudit();
} else {
  runStatus();
}
