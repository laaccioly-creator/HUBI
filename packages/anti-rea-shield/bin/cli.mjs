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

const args = process.argv.slice(2);
const command = (args[0] || 'status').toLowerCase();

function printBanner() {
  console.log('\n========================================================');
  console.log('🛡️  ANTI-REA-SHIELD v2.0 — Defesa Anti-Clone & Anti-REA');
  console.log('========================================================\n');
}

function runStatus() {
  printBanner();
  const skillsDir = path.resolve(process.cwd(), 'packages/anti-rea-shield/skills');
  const sqlDir = path.resolve(process.cwd(), 'packages/anti-rea-shield/sql');

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
  console.log('\nModo padrão recomendado para homologação: VITE_SHIELD_MODE=simulation\n');
}

function runQuickAudit() {
  printBanner();
  const srcDir = path.resolve(process.cwd(), 'src');
  if (!fs.existsSync(srcDir)) {
    console.log('⚠️ Diretório src/ não encontrado.');
    return;
  }

  console.log('🔍 Executando varredura rápida Zero-Trust em src/ ...');
  let filesScanned = 0;
  let envWarnings = 0;

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        filesScanned++;
        const content = fs.readFileSync(fullPath, 'utf8');
        const matches = content.match(/import\.meta\.env\.VITE_[A-Z0-9_]+/g) || [];
        for (const m of matches) {
          if (
            !m.includes('SUPABASE_URL') &&
            !m.includes('SUPABASE_ANON_KEY') &&
            !m.includes('SHIELD_')
          ) {
            envWarnings++;
            console.log(`  [AVISO] Variável exposta no bundle cliente: ${m} (${ path.relative(process.cwd(), fullPath) })`);
          }
        }
      }
    }
  }

  walk(srcDir);
  console.log(`\n✅ Varredura concluída: ${filesScanned} arquivos analisados | ${envWarnings} pontos de atenção.`);
}

if (command === 'audit') {
  runQuickAudit();
} else {
  runStatus();
}
