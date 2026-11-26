#!/usr/bin/env node
/**
 * Script Automatizado de Teste de Clone e Escudo (Anti-REA-Shield)
 * Valida:
 *   1. Domínios oficiais (rubi.ia.br, localhost, 192.168.1.50): score 0, authorized=true, sem bloqueio.
 *   2. Domínio clone não autorizado (clone-pirata.com.br): score 100 (UNAUTHORIZED_DOMAIN),
 *      registro de incidente em sessionStorage e montagem do overlay #anti-rea-domain-lock-overlay.
 *   3. Auditoria AST Zero-Trust via CLI: EXPOSED_VITE_SECRET === 0 e PUBLIC_SELECT_STAR === 0.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');

const SHIELD_FILES = [
  'src/core/crypto-prng.ts',
  'src/core/shield.config.ts',
  'src/core/risk-engine.ts',
  'skills/02-runtime-sentinel/domain-lock.ts',
  'skills/02-runtime-sentinel/state-corruptor.ts',
  'skills/02-runtime-sentinel/sentinel-core.ts',
];

function createDomMocks() {
  const storageMap = new Map();
  const elementsById = new Map();
  const dispatchedEvents = [];

  const makeElement = (tag) => {
    const children = [];
    const el = {
      tagName: tag.toUpperCase(),
      _id: '',
      attributes: {},
      style: { cssText: '', overflow: '' },
      textContent: '',
      href: '',
      rel: '',
      children,
      set id(val) {
        this._id = val;
        if (val) elementsById.set(val, this);
      },
      get id() {
        return this._id;
      },
      setAttribute(k, v) {
        this.attributes[k] = String(v);
      },
      appendChild(child) {
        children.push(child);
        if (child.id) elementsById.set(child.id, child);
        return child;
      },
      getContext() {
        return null;
      },
    };
    return el;
  };

  const body = makeElement('body');
  const documentElement = makeElement('html');

  const mockDocument = {
    body,
    documentElement,
    createElement: (tag) => makeElement(tag),
    getElementById: (id) => elementsById.get(id) || null,
  };

  const mockSessionStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear(),
  };

  class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  const mockWindow = {
    location: { hostname: 'rubi.ia.br' },
    sessionStorage: mockSessionStorage,
    setTimeout,
    requestIdleCallback: (cb) => {
      cb();
      return 1;
    },
    dispatchEvent: (ev) => {
      dispatchedEvents.push(ev);
      return true;
    },
  };

  return {
    mockWindow,
    mockDocument,
    mockNavigator: { webdriver: false, userAgent: 'Anti-REA-Test-Runner/2.0' },
    MockCustomEvent,
    dispatchedEvents,
    mockSessionStorage,
  };
}

async function compileShieldModules(ts, tempDir) {
  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');

  for (const relTsPath of SHIELD_FILES) {
    const srcPath = path.join(packageRoot, relTsPath);
    const source = fs.readFileSync(srcPath, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    });

    const jsWithExtensions = transpiled.outputText.replace(
      /(from\s+['"])(\.[^'"]+)(['"])/g,
      (_, p1, p2, p3) => `${p1}${p2.endsWith('.js') ? p2 : `${p2}.js`}${p3}`
    );

    const outPath = path.join(tempDir, relTsPath.replace(/\.ts$/, '.js'));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, jsWithExtensions, 'utf8');
  }
}

export async function runCloneVerification() {
  console.log('\n========================================================');
  console.log('🧪  ANTI-REA-SHIELD — Teste Automatizado de Clone & Escudo');
  console.log('========================================================\n');

  const tsMod = await import('typescript');
  const ts = tsMod.default ?? tsMod;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-rea-test-'));

  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevNavigator = globalThis.navigator;
  const prevCustomEvent = globalThis.CustomEvent;

  try {
    await compileShieldModules(ts, tempDir);

    const mocks = createDomMocks();
    Object.defineProperty(globalThis, 'window', { value: mocks.mockWindow, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: mocks.mockDocument, configurable: true });
    Object.defineProperty(globalThis, 'navigator', { value: mocks.mockNavigator, configurable: true });
    Object.defineProperty(globalThis, 'CustomEvent', { value: mocks.MockCustomEvent, configurable: true });

    const configMod = await import(pathToFileURL(path.join(tempDir, 'src/core/shield.config.js')).href);
    const domainMod = await import(pathToFileURL(path.join(tempDir, 'skills/02-runtime-sentinel/domain-lock.js')).href);
    const sentinelMod = await import(pathToFileURL(path.join(tempDir, 'skills/02-runtime-sentinel/sentinel-core.js')).href);
    const corruptorMod = await import(pathToFileURL(path.join(tempDir, 'skills/02-runtime-sentinel/state-corruptor.js')).href);

    const prodConfig = configMod.loadShieldConfig({ mode: 'production' });

    // Teste 1: Domínios oficiais e LAN privada
    for (const host of ['rubi.ia.br', 'localhost', '192.168.1.50']) {
      mocks.mockWindow.location.hostname = host;
      const check = domainMod.verifyDomainLock(prodConfig);
      assert.equal(check.authorized, true, `Domínio oficial deveria estar autorizado: ${host}`);

      const sentinel = sentinelMod.initRuntimeSentinel({ mode: 'production' });
      const score = sentinel.riskEngine.getScore();
      assert.equal(score, 0, `Score esperado 0 para ${host}, obtido ${score}`);
      assert.equal(corruptorMod.isSilentCorruptionActive(), false, `Bloqueio não pode ativar em ${host}`);
      assert.equal(
        mocks.mockDocument.getElementById('anti-rea-domain-lock-overlay'),
        null,
        `Overlay não pode existir em ${host}`
      );
      console.log(`  ✅ [OK] Domínio oficial liberado: ${host} (authorized=true, score=0)`);
    }

    // Teste 2: Domínio clone não autorizado
    mocks.mockWindow.location.hostname = 'clone-pirata.com.br';
    const cloneCheck = domainMod.verifyDomainLock(prodConfig);
    assert.equal(cloneCheck.authorized, false, 'clone-pirata.com.br deveria falhar no domain-lock');

    const cloneSentinel = sentinelMod.initRuntimeSentinel({ mode: 'production' });
    assert.equal(cloneSentinel.riskEngine.getScore(), 100, 'Score para UNAUTHORIZED_DOMAIN deve ser 100');
    assert.equal(
      cloneSentinel.riskEngine.hasSignal('UNAUTHORIZED_DOMAIN'),
      true,
      'Sinal UNAUTHORIZED_DOMAIN deve ser registrado'
    );

    // Aguarda o atraso estocástico configurado (1500ms-3000ms) para validar montagem real do overlay
    await new Promise((resolve) => setTimeout(resolve, 3200));

    assert.equal(corruptorMod.isSilentCorruptionActive(), true, 'Bloqueio ativo deve estar true para clone');
    const overlay = mocks.mockDocument.getElementById('anti-rea-domain-lock-overlay');
    assert.ok(overlay, 'Overlay #anti-rea-domain-lock-overlay deve estar montado no DOM');
    const incidentRaw = mocks.mockSessionStorage.getItem('hubi_shield_last_incident');
    assert.ok(incidentRaw, 'Incidente deve ser registrado no sessionStorage');
    const incident = JSON.parse(incidentRaw);
    assert.equal(incident.type, 'UNAUTHORIZED_DOMAIN');
    assert.equal(incident.score, 100);
    assert.equal(incident.hostname, 'clone-pirata.com.br');
    console.log('  ✅ [OK] Clone bloqueado: clone-pirata.com.br (score=100, UNAUTHORIZED_DOMAIN, overlay ativo)');

    // Teste 3: Re-execução da auditoria AST via CLI
    const cliPath = path.join(__dirname, 'cli.mjs');
    const auditOut = execFileSync(process.execPath, [cliPath, 'audit'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    const exposedMatch = auditOut.match(/EXPOSED_VITE_SECRET:\s+(\d+)/);
    const selectStarMatch = auditOut.match(/PUBLIC_SELECT_STAR:\s+(\d+)/);
    assert.ok(exposedMatch && selectStarMatch, 'Saída do cli.mjs audit deve conter métricas das regras');

    const exposedCount = Number(exposedMatch[1]);
    const selectStarCount = Number(selectStarMatch[1]);
    assert.equal(exposedCount, 0, `Esperado EXPOSED_VITE_SECRET=0, obtido ${exposedCount}`);
    assert.equal(selectStarCount, 0, `Esperado PUBLIC_SELECT_STAR=0 após Onda 3, obtido ${selectStarCount}`);
    console.log(`  ✅ [OK] Auditoria AST: EXPOSED_VITE_SECRET=${exposedCount}, PUBLIC_SELECT_STAR=${selectStarCount}`);

    console.log('\n🎉 Todos os testes de Blindagem Anti-REA-Shield passaram com sucesso!\n');
  } finally {
    if (prevWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, 'window', { value: prevWindow, configurable: true });
    if (prevDocument === undefined) delete globalThis.document;
    else Object.defineProperty(globalThis, 'document', { value: prevDocument, configurable: true });
    if (prevNavigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { value: prevNavigator, configurable: true });
    if (prevCustomEvent === undefined) delete globalThis.CustomEvent;
    else Object.defineProperty(globalThis, 'CustomEvent', { value: prevCustomEvent, configurable: true });

    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectExecution) {
  await runCloneVerification();
}
