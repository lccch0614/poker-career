const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => {
  let source = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('/app/page.tsx')) source += '\nexport { advanceMttField, advanceMttBackground, newHand, act };';
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { advanceMttField, advanceMttBackground, newHand, act } = require('../app/page.tsx');
const { MTT_ENTRIES, completeMttRound, mttRemaining, mttPrize, mttPayoutShares, isMttField, newMttField, restoreMttField, mttLevel } = require('../app/mtt-field.ts');
const { openTournament, newCareerWallet, settleTournament, restoreCareerWallet } = require('../app/career-bankroll.ts');

test('200-player field preserves chips, unique seats and every elimination rank', () => {
  let field = newMttField(100);
  const total = MTT_ENTRIES * 100;
  assert.equal(field.tables.length, 25);
  for (let round = 0; round < 300 && mttRemaining(field) > 1; round++) {
    field = { ...field, clock: { ...field.clock, elapsedMs: Math.floor(round / 8) * 180000, lastTickAt: Date.now() } };
    field = advanceMttField(field, 'turbo');
    assert.ok(Math.abs(field.stacks.reduce((sum, stack) => sum + stack, 0) - total) < 0.01);
    assert.equal(new Set(field.tables.flat()).size, mttRemaining(field));
    assert.ok(field.tables.every(table => table.length <= 8));
    assert.equal(field.finishes.length + mttRemaining(field), MTT_ENTRIES);
    assert.ok(isMttField(structuredClone(field)));
  }
  assert.equal(mttRemaining(field), 1);
  assert.equal(field.finishes.length, 199);
  assert.ok(new Set(field.finishes.map(entry => entry.place)).size <= 199);
});

test('thirty prizes, wallet ledger and restore pay a finish only once', () => {
  assert.equal(mttPayoutShares().length, 30);
  assert.ok(Math.abs(mttPayoutShares().reduce((sum, share) => sum + share, 0) - 100) < 1e-9);
  assert.ok(mttPrize(50, 1) > mttPrize(50, 2));
  assert.equal(mttPrize(50, 31), 0);
  let wallet = openTournament(newCareerWallet(), 'mtt-test', 50, 200);
  assert.ok(wallet);
  wallet = restoreCareerWallet(structuredClone(wallet));
  const result = settleTournament(wallet, 'mtt-test', 30);
  assert.ok(result.balance > wallet.balance);
  assert.equal(settleTournament(result, 'mtt-test', 30), null);
});

test('hero table uses the actual completed hand and transfers its stack to the next seating', () => {
  const field = newMttField(100);
  let hand = newHand(Array(8).fill(100), 0, 1, () => 0.5, Array(8).fill(2), 'mtt-hero', 0, 0.5, 1, 0, []);
  let safety = 0;
  while (!hand.finished && safety++ < 150) {
    const actor = hand.turn;
    hand = act(hand, actor, actor === 0 ? 'fold' : 'checkcall');
  }
  assert.ok(hand.finished);
  const next = advanceMttField(field, 'turbo', hand);
  assert.equal(next.stacks[0], hand.players[0].stack);
  assert.equal(next.tables[0][0], 0);
  assert.equal(next.handNo, 2);
  assert.ok(Math.abs(next.stacks.reduce((sum, stack) => sum + stack, 0) - 20000) < 0.01);
});

test('hero hand reconciles with independent background hands without changing their chips', () => {
  const start = newMttField(100, Date.now() - 8000);
  const background = advanceMttBackground(start, 'standard', Date.now());
  let hand = newHand(Array(8).fill(100), 0, 1, () => .4, Array(8).fill(2), 'hero-independent', 0, .5, 1, 0, []);
  while (!hand.finished) hand = act(hand, hand.turn, hand.turn === 0 ? 'fold' : 'checkcall');
  const merged = advanceMttField(background, 'standard', hand);
  assert.equal(merged.stacks[0], hand.players[0].stack);
  assert.equal(merged.stacks.reduce((sum, stack) => sum + stack, 0), 20000);
  assert.equal(merged.handNo, 2);
  assert.equal(new Set(merged.tables.flat()).size, mttRemaining(merged));
});

test('simultaneous bubble busts rank 30th and 31st by stack before the hand', () => {
  const base = newMttField(100);
  const stacks = base.stacks.map((_, id) => id < 31 ? 100 : 0);
  const field = { ...base, handNo: 42, stacks, tables: [Array.from({ length: 8 }, (_, i) => i), Array.from({ length: 8 }, (_, i) => i + 8), Array.from({ length: 8 }, (_, i) => i + 16), Array.from({ length: 7 }, (_, i) => i + 24)], finishes: Array.from({ length: 169 }, (_, i) => ({ id: i + 31, place: i + 32, handNo: 41 })) };
  const outcomes = field.tables.map(ids => ({ ids, stacks: ids.map(id => id === 1 || id === 2 ? 0 : id === 0 ? 300 : 100) }));
  const next = completeMttRound(field, outcomes);
  assert.equal(mttRemaining(next), 29);
  assert.equal(next.finishes.find(entry => entry.id === 1).place, 30);
  assert.equal(next.finishes.find(entry => entry.id === 2).place, 30);
  assert.ok(Math.abs(mttPrize(50, 30, next.finishes.map(entry => entry.place)) - mttPrize(50, 30) / 2) <= .011);
  assert.equal(mttPrize(50, 31), 0);
});

test('hand-for-hand busts at different tables share rank and prize', () => {
  const base = newMttField(100);
  const stacks = base.stacks.map((_, id) => id < 31 ? 100 : 0);
  const field = { ...base, stacks, tables: [Array.from({ length: 8 }, (_, i) => i), Array.from({ length: 8 }, (_, i) => i + 8), Array.from({ length: 8 }, (_, i) => i + 16), Array.from({ length: 7 }, (_, i) => i + 24)], finishes: Array.from({ length: 169 }, (_, i) => ({ id: i + 31, place: i + 32, handNo: 40 })) };
  const outcomes = field.tables.map(ids => ({ ids, stacks: ids.map(id => id === 1 || id === 10 ? 0 : id === 0 || id === 8 ? 200 : 100) }));
  const next = completeMttRound(field, outcomes);
  assert.equal(next.finishes.find(entry => entry.id === 1).place, 30);
  assert.equal(next.finishes.find(entry => entry.id === 10).place, 30);
  assert.equal(mttPrize(50, 30, next.finishes.map(entry => entry.place)), mttPrize(50, 30, [30, 30]));
});

test('background tables progress by time while hero seats and current hand stay fixed', () => {
  const field = newMttField(100, 1000);
  const next = advanceMttBackground(field, 'turbo', 9000);
  assert.equal(next.handNo, 1);
  assert.deepEqual(next.stacks.slice(0, 8), Array(8).fill(100));
  assert.deepEqual(next.tables[0], field.tables[0]);
  assert.ok(next.stacks.slice(8).some((stack, index) => stack !== field.stacks[index + 8]));
  assert.equal(next.clock.elapsedMs, 8000);
  assert.ok(next.tableHands.slice(1).some(hands => hands === 1));
  const restored = restoreMttField(structuredClone(next), 500000);
  assert.equal(restored.clock.elapsedMs, 8000); // Closed site pauses, no free blind jumps.
  assert.equal(restored.clock.nextBackgroundAt, 508000);
  assert.equal(mttLevel(restored, 'turbo', 500000), 0);
  const another = advanceMttBackground(next, 'turbo', 17000);
  assert.ok(another.tableHands.slice(5, 9).some(hands => hands === 1));
  assert.deepEqual(another.stacks.slice(0, 8), Array(8).fill(100));
});

test('background highlights contain actual dealt cards, actions and payouts', () => {
  const field = newMttField(100, 1000);
  field.clock.elapsedMs = 11 * 180000;
  const next = advanceMttBackground(field, 'turbo', 9000);
  assert.ok(next.highlights.length > 0);
  const hand = next.highlights[0];
  assert.equal(hand.ids.length, hand.holes.length);
  assert.ok(hand.holes.every(hole => hole.length === 2));
  assert.equal(hand.board.length, 5);
  assert.ok(hand.actions.length > 0);
  assert.ok(hand.potSummary.length > 0);
  assert.ok(hand.busts.length > 0);
  assert.ok(isMttField(structuredClone(next)));
});

test('version 34 field restores without erasing stacks or adding offline blind levels', () => {
  const old = newMttField(150, 1000);
  delete old.clock; delete old.tableHands; delete old.buttons; delete old.moved; delete old.highlights;
  const restored = restoreMttField(old, 200000);
  assert.equal(restored.stacks.reduce((sum, stack) => sum + stack, 0), 30000);
  assert.equal(restored.clock.elapsedMs, 0);
  assert.equal(restored.buttons[0], 0);
  assert.ok(isMttField(restored));
});

test('table break balances seats and preserves hero button and move counts', () => {
  const field = newMttField(100);
  const outcomes = field.tables.map(ids => ({ ids, stacks: ids.map((id, seat) => seat === 7 ? 0 : seat === 0 ? 200 : 100) }));
  const next = completeMttRound(field, outcomes);
  assert.equal(mttRemaining(next), 175);
  assert.equal(next.tables.length, Math.ceil(175 / 8));
  assert.equal(next.tables[0][0], 0);
  assert.equal(next.buttons[0], 1);
  assert.ok(Math.max(...next.tables.map(table => table.length)) - Math.min(...next.tables.map(table => table.length)) <= 1);
  assert.ok(next.moved.some(count => count > 0));
  assert.ok(isMttField(structuredClone(next)));
});

test('tied bubble prize enters career once at the split amount', () => {
  const wallet = openTournament(newCareerWallet(), 'mtt-tie', 50, 200);
  const paid = settleTournament(wallet, 'mtt-tie', 30, [30, 30]);
  assert.ok(Math.abs(paid.balance - wallet.balance - mttPrize(50, 30, [30, 30])) < 0.001);
  assert.equal(settleTournament(paid, 'mtt-tie', 30, [30, 30]), null);
});
