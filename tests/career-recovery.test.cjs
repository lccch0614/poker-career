const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { newCareerWallet, openCash, closeCash, restoreCareerWallet } = require('../app/career-bankroll.ts');
let wallet = newCareerWallet();
for (let i = 0; i < 4; i++) { wallet = openCash(wallet, `split-${i}`, 1); wallet = closeCash(wallet, `split-${i}`, 100.004); }
assert.equal(restoreCareerWallet(structuredClone(wallet)).balance, wallet.balance);
assert.throws(() => restoreCareerWallet({ ...wallet, balance: wallet.balance + 5 }), /mismatch/);
