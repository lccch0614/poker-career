const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const values = new Map();
global.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
global.document = { baseURI: 'https://example.github.io/poker/' };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
const { pokerStateFetch } = require('../app/browser-storage.ts');

test('local save survives reload, accepts large history, and rejects stale tabs', async () => {
  const first = await (await pokerStateFetch('/api/poker-state')).json();
  assert.equal(first.state, null);
  const state = { version: 2, career: { balance: 3000 }, history: '牌'.repeat(40_000) };
  const put = revision => pokerStateFetch('/api/poker-state', { method: 'PUT', headers: { 'x-save-revision': String(revision) }, body: JSON.stringify(state) });
  const result = await put(0);
  assert.equal(result.status, 200);
  const { updatedAt } = await result.json();
  const restored = await (await pokerStateFetch('/api/poker-state')).json();
  assert.deepEqual(restored.state, state);
  assert.equal((await put(0)).status, 409);
  assert.equal((await put(updatedAt)).status, 200);
  global.document.baseURI = 'https://example.github.io/different-repo/';
  assert.equal((await (await pokerStateFetch('/api/poker-state')).json()).state, null);
});

test('failed quota write preserves the previous stored bankroll', async () => {
  global.document.baseURI = 'https://example.github.io/poker/';
  const before = await (await pokerStateFetch('/api/poker-state')).json();
  const setItem = window.localStorage.setItem;
  window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  const result = await pokerStateFetch('/api/poker-state', { method: 'PUT', headers: { 'x-save-revision': String(before.updatedAt) }, body: JSON.stringify({ version: 2, career: { balance: 1 } }) });
  assert.equal(result.status, 413);
  window.localStorage.setItem = setItem;
  assert.equal((await (await pokerStateFetch('/api/poker-state')).json()).state.career.balance, 3000);
});

test('raw recovery export preserves damaged primary and backup without overwriting', () => {
  const { readSaveBackup, storageKey } = require('../app/browser-storage.ts');
  const key = storageKey();
  values.set(key, '{bad json');
  values.set(`poker-local-save:local:${key}`, 'preserved backup');
  assert.deepEqual(readSaveBackup(), { primary: '{bad json', backup: 'preserved backup' });
  assert.equal(values.get(key), '{bad json');
});

test('quota fallback compresses and restores a complete save, preserving revision checks', async () => {
  global.document.baseURI = 'https://example.github.io/compression/';
  const { storageKey } = require('../app/browser-storage.ts');
  const setItem = window.localStorage.setItem;
  window.localStorage.setItem = (key, value) => { if (value.length > 2500) throw new Error('QuotaExceededError'); values.set(key, value); };
  try {
    const state = { version: 2, career: { balance: 3000 }, history: 'long poker history '.repeat(4000) };
    const result = await pokerStateFetch('', { method: 'PUT', headers: { 'x-save-revision': '0' }, body: JSON.stringify(state) });
    assert.equal(result.status, 200);
    assert.equal(JSON.parse(values.get(storageKey())).encoding, 'gzip-base64');
    const restored = await (await pokerStateFetch('')).json();
    assert.deepEqual(restored.state, state);
    assert.equal((await pokerStateFetch('', { method: 'PUT', headers: { 'x-save-revision': '0' }, body: JSON.stringify(state) })).status, 409);
  } finally { window.localStorage.setItem = setItem; }
});

test('portable backup restores state and retains both previous records', async () => {
  global.document.baseURI = 'https://example.github.io/import/';
  const { storageKey, decodeSaveBackup, importSaveState } = require('../app/browser-storage.ts');
  const key = storageKey();
  const oldState = { version: 2, career: { balance: 100 } };
  const newState = { version: 2, career: { balance: 200 } };
  const oldPrimary = JSON.stringify({ state: oldState, updatedAt: 3 });
  const oldBackup = JSON.stringify(oldState);
  values.set(key, oldPrimary);
  values.set(`poker-local-save:local:${key}`, oldBackup);
  assert.deepEqual(await decodeSaveBackup(JSON.stringify({ primary: JSON.stringify({ state: newState, updatedAt: 1 }) })), newState);
  await importSaveState(newState);
  assert.deepEqual((await (await pokerStateFetch('')).json()).state, newState);
  const preserved = JSON.parse(values.get(`poker-before-import:${key}`));
  assert.equal(preserved.primary, oldPrimary);
  assert.equal(preserved.backup, oldBackup);
  await assert.rejects(() => decodeSaveBackup('{bad'));
});

test('import refuses to replace the primary if the previous records cannot be preserved', async () => {
  global.document.baseURI = 'https://example.github.io/import-failure/';
  const { storageKey, importSaveState } = require('../app/browser-storage.ts');
  const key = storageKey();
  const previous = JSON.stringify({ state: { version: 2, career: { balance: 42 } }, updatedAt: 5 });
  values.set(key, previous);
  const setItem = window.localStorage.setItem;
  window.localStorage.setItem = () => { throw new Error('quota'); };
  try { await assert.rejects(() => importSaveState({ version: 2, career: { balance: 0 } })); }
  finally { window.localStorage.setItem = setItem; }
  assert.equal(values.get(key), previous);
});

test('backup decoder skips a structurally invalid copy and finds the valid primary', async () => {
  const { decodeSaveBackup } = require('../app/browser-storage.ts');
  const valid = { version: 2, career: { balance: 3000 } };
  const invalid = { version: 2, career: null };
  const data = JSON.stringify({ primary: JSON.stringify({ state: valid, updatedAt: 1 }), backup: JSON.stringify(invalid) });
  assert.deepEqual(await decodeSaveBackup(data, state => !!state.career), valid);
  await assert.rejects(() => decodeSaveBackup(data, () => false), /沒有可讀取/);
});

test('import rejects a save changed by another tab after confirmation', async () => {
  global.document.baseURI = 'https://example.github.io/import-conflict/';
  const { storageKey, readSaveBackup, importSaveState } = require('../app/browser-storage.ts');
  const key = storageKey();
  values.set(key, JSON.stringify({ state: { version: 2, career: { balance: 100 } }, updatedAt: 1 }));
  const expected = readSaveBackup();
  const updated = JSON.stringify({ state: { version: 2, career: { balance: 90 } }, updatedAt: 2 });
  values.set(key, updated);
  await assert.rejects(() => importSaveState({ version: 2, career: { balance: 500 } }, expected), /另一個分頁/);
  assert.equal(values.get(key), updated);
});
