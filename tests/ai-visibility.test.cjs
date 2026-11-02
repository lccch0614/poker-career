const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => {
  let source = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('/app/page.tsx')) source += '\nexport { newHand, aiMove, mttAiMove, estimateEquity, aofDecision };';
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { newHand, aiMove, mttAiMove, estimateEquity, aofDecision } = require('../app/page.tsx');
const { newMttField } = require('../app/mtt-field.ts');
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
function decision(actionGame, actor) {
  const frame = actionGame.timeline.findLast(item => item.actor === actor);
  assert.ok(frame, 'an action was recorded');
  return { action: frame.action, bet: frame.players[actor].streetBet, stack: frame.players[actor].stack };
}
function samePublicInformation(game, actor) {
  const copy = structuredClone(game);
  // Permute opponents' private cards and reverse the unseen deck, leaving the actor's cards and board untouched.
  const others = copy.players.map((_, i) => i).filter(i => i !== actor);
  const hands = others.map(i => copy.players[i].hole);
  others.forEach((i, n) => { copy.players[i].hole = hands[(n + 1) % hands.length]; });
  copy.deck.reverse();
  return copy;
}
const actor = 1;
const field = newMttField(100, 0);
for (const street of ['preflop', 'flop', 'turn', 'river']) {
  let game = newHand([100, 100, 100, 100], 0, 7, rng(11), [0,0,0,0], 'visibility');
  if (street !== 'preflop') {
    const n = {flop:3, turn:4, river:5}[street];
    game = { ...game, street, board: game.deck.slice(-n), deck: game.deck.slice(0,-n),
      currentBet: 3, minRaise: 3, pending: [true,true,true,true],
      players: game.players.map(p => ({ ...p, streetBet: 0, totalBet: 3, stack: 97, lastAction: '' })) };
  }
  game = { ...game, turn: actor, mttSeatIds: [0,1,2,3] };
  const hidden = samePublicInformation(game, actor);
  assert.equal(estimateEquity(game, actor, 25, rng(91)), estimateEquity(hidden, actor, 25, rng(91)));
  assert.deepEqual(aofDecision(game, actor), aofDecision(hidden, actor));
  for (const difficulty of ['casual', 'hard', 'pro']) for (const seed of [9, 37, 83]) {
    const originalRandom = Math.random;
    try {
      Math.random = rng(seed); const cashAction = decision(aiMove(game, actor, difficulty), actor);
      Math.random = rng(seed); const hiddenCashAction = decision(aiMove(hidden, actor, difficulty), actor);
      assert.deepEqual(cashAction, hiddenCashAction, `${street} ${difficulty} cash`);
      const tournament = { ...game, tournamentFinishes: [] };
      const hiddenTournament = { ...hidden, tournamentFinishes: [] };
      Math.random = rng(seed); const sitAndGo = decision(aiMove(tournament, actor, difficulty), actor);
      Math.random = rng(seed); const hiddenSitAndGo = decision(aiMove(hiddenTournament, actor, difficulty), actor);
      assert.deepEqual(sitAndGo, hiddenSitAndGo, `${street} ${difficulty} single table`);
      const mtt = decision(mttAiMove(tournament, actor, field, rng(seed), difficulty), actor);
      const hiddenMtt = decision(mttAiMove(hiddenTournament, actor, field, rng(seed), difficulty), actor);
      assert.deepEqual(mtt, hiddenMtt, `${street} ${difficulty} multi-table`);
    } finally { Math.random = originalRandom; }
  }
}
