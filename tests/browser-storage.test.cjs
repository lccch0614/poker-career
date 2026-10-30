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
