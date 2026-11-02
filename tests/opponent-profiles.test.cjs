const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { emptyHandTracker, recordOpponentProfile, restoreOpponentProfiles, restoreMttNotes, updateOpponentNote, statPercent } = require('../app/session-stats.ts');
const tracker = { ...emptyHandTracker(), vpip: true, pfr: true, threeBet: true, threeBetOpportunity: true, sawFlop: true };
let profile = recordOpponentProfile(undefined, 'cash-a-1', tracker, true, true);
assert.equal(profile.hands, 1);
assert.equal(profile.vpipHands, 1);
assert.equal(profile.showdownWins, 1);
assert.strictEqual(recordOpponentProfile(profile, 'cash-a-1', tracker, true, true), profile);
const resumed = restoreOpponentProfiles(JSON.parse(JSON.stringify({ 'ai:2': profile })));
profile = recordOpponentProfile(resumed['ai:2'], 'cash-b-1', emptyHandTracker(), false, false);
assert.equal(profile.hands, 2);
assert.equal(statPercent(profile.vpipHands, profile.hands), 50);
assert.equal(profile.showdownWins, 1);
assert.deepEqual(restoreOpponentProfiles(undefined), {});
assert.deepEqual(restoreOpponentProfiles({ 'ai:2': null, 'ai:999': profile }), {});
const corrupt = restoreOpponentProfiles({ 'ai:1': { hands: -7, vpipHands: Infinity, lastHandKey: 42 } });
assert.equal(corrupt['ai:1'].hands, 0);
assert.equal(corrupt['ai:1'].vpipHands, 0);
assert.equal(corrupt['ai:1'].lastHandKey, '');

// Notes persist through hands and portable JSON saves without counting an extra hand.
let noted = updateOpponentNote(undefined, '喜歡翻牌前加注');
assert.equal(noted.hands, 0);
noted = recordOpponentProfile(noted, 'cash-c-1', tracker, true, true);
assert.equal(noted.note, '喜歡翻牌前加注');
noted = restoreOpponentProfiles(JSON.parse(JSON.stringify({ 'ai:3': noted })))['ai:3'];
assert.equal(noted.note, '喜歡翻牌前加注');
assert.equal(updateOpponentNote(noted, 'x'.repeat(200)).note.length, 160);
assert.equal(updateOpponentNote(noted, '').note, '');
assert.equal(restoreOpponentProfiles({ 'ai:1': { note: 1 } })['ai:1'].note, '');

// Single-table tournament observations and notes remain separate from the same Cash seat.
const cash = updateOpponentNote(undefined, 'Cash 備註');
let sng = updateOpponentNote(undefined, '單桌賽備註');
sng = recordOpponentProfile(sng, 'sng-table-1', tracker, true, false);
const both = restoreOpponentProfiles(JSON.parse(JSON.stringify({ 'ai:1': cash, 'sng:1': sng })));
assert.equal(both['ai:1'].note, 'Cash 備註');
assert.equal(both['ai:1'].hands, 0);
assert.equal(both['sng:1'].note, '單桌賽備註');
assert.equal(both['sng:1'].hands, 1);
assert.equal(recordOpponentProfile(both['sng:1'], 'sng-table-1', tracker, true, false).hands, 1);
assert.equal(restoreOpponentProfiles({ 'sng:8': sng })['sng:8'], undefined);

// Tournament notes follow opponent IDs across seat changes and survive save/restore.
const mttNotes = restoreMttNotes(JSON.parse(JSON.stringify({ '1': '緊手', '123': '喜歡加注', '0': 'hero', '200': 'invalid', '7': 'x'.repeat(200), '8': 42 })));
assert.equal(mttNotes['123'], '喜歡加注');
assert.equal(mttNotes[String([0, 123, 1][1])], mttNotes[String([0, 1, 123][2])]);
assert.equal(mttNotes['7'].length, 160);
assert.equal(mttNotes['0'], undefined);
assert.equal(mttNotes['200'], undefined);
assert.equal(mttNotes['8'], undefined);
assert.deepEqual(restoreMttNotes(undefined), {});
