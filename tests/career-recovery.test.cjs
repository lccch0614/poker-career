const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { newCareerWallet, openCash, closeCash, restoreCareerWallet } = require('../app/career-bankroll.ts');
let wallet = newCareerWallet();
for (let i = 0; i < 4; i++) { wallet = openCash(wallet, `split-${i}`, 1); wallet = closeCash(wallet, `split-${i}`, 100.004); }
assert.equal(restoreCareerWallet(structuredClone(wallet)).balance, wallet.balance);
assert.throws(() => restoreCareerWallet({ ...wallet, balance: wallet.balance + 5 }), /mismatch/);

// Restore between every financial step, as after an interrupted session.
const { rebuyCash, openTournament, settleTournament, openAof, buyAofLife, closeAof } = require('../app/career-bankroll.ts');
const restored = w => restoreCareerWallet(structuredClone(w));
let cash = openCash(newCareerWallet(), 'cash-reload', 1);
cash = rebuyCash(restored(cash), 'cash-reload');
cash = closeCash(restored(cash), 'cash-reload', 150);
assert.equal(restored(cash).balance, 2950);
assert.equal(closeCash(restored(cash), 'cash-reload', 150), null);
let tournament = openTournament(restored(cash), 'tourney-reload', 50, 8);
assert.equal(settleTournament(restored(tournament), 'tourney-reload', NaN), null);
tournament = settleTournament(restored(tournament), 'tourney-reload', 1);
assert.equal(settleTournament(restored(tournament), 'tourney-reload', 1), null);
assert.equal(openTournament(restored(tournament), 'invalid', 50, NaN), null);
let aof = openAof(restored(tournament), 'aof-reload', 1);
aof = buyAofLife(restored(aof), 'aof-reload');
aof = closeAof(restored(aof), 'aof-reload', 12);
assert.equal(closeAof(restored(aof), 'aof-reload', 12), null);
assert.deepEqual(restored(aof), aof);

// Changing the lobby selection cannot silently change the stake of an active
// AOF table; continuation after a bust derives it from the settled buy-in.
const { aofContinuationStake } = require('../app/career-bankroll.ts');
let higherStake = openAof(newCareerWallet(), 'stake-locked', 5);
assert.equal(aofContinuationStake(higherStake, 'stake-locked', 1), 5);
higherStake = closeAof(higherStake, 'stake-locked', 0);
assert.equal(aofContinuationStake(restored(higherStake), 'stake-locked', 1), 5);
assert.equal(aofContinuationStake(higherStake, 'legacy', 2), 2);

// Corrupt active stakes and missing paid rebuys cannot be restored.
const cashActive = openCash(newCareerWallet(), 'safe-cash', 1);
assert.throws(() => restoreCareerWallet({ ...cashActive, cash: { ...cashActive.cash, bb: -1 } }), /Cash session invalid/);
assert.throws(() => restoreCareerWallet({ ...cashActive, cash: { ...cashActive.cash, bb: 2 } }), /Cash session invalid/);
assert.throws(() => restoreCareerWallet({ ...cashActive, cash: { ...cashActive.cash, buyInsPaid: 2 } }), /Cash session invalid/);
const tournamentActive = openTournament(newCareerWallet(), 'safe-tournament', 50, 8);
assert.throws(() => restoreCareerWallet({ ...tournamentActive, tournament: { ...tournamentActive.tournament, entry: 250 } }), /Tournament session invalid/);
assert.throws(() => restoreCareerWallet({ ...tournamentActive, tournament: { ...tournamentActive.tournament, tableSize: 9 } }), /Tournament session invalid/);
const aofActive = openAof(newCareerWallet(), 'safe-aof', 1);
assert.throws(() => restoreCareerWallet({ ...aofActive, aof: { ...aofActive.aof, bb: -1 } }), /AOF session invalid/);
assert.throws(() => restoreCareerWallet({ ...aofActive, aof: { ...aofActive.aof, livesPaid: 2 } }), /AOF session invalid/);
assert.deepEqual(restored(cashActive), cashActive);
assert.deepEqual(restored(tournamentActive), tournamentActive);
assert.deepEqual(restored(aofActive), aofActive);
