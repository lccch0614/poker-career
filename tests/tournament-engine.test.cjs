const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => {
  let source = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('/app/page.tsx')) source += '\nexport { newHand, act };';
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { newHand, act } = require('../app/page.tsx');

test('tournament big blind posts the live blind first, then the dead ante', () => {
  const game = newHand([10, 10, 10], 0, 17, () => 0.5, [2, 2, 2], 'ante-case', 0, 1.5, 3, 3, []);
  assert.equal(game.sb, 1);
  assert.equal(game.bb, 2);
  assert.equal(game.players[2].streetBet, 3);
  assert.equal(game.players[2].totalBet, 6);
  assert.equal(game.players[2].stack, 4);
  assert.equal(game.currentBet, 3);
  assert.equal(game.players.reduce((sum, player) => sum + player.stack + player.totalBet, 0), 30);
  const first = act(game, 0, 'fold');
  const ended = act(first, 1, 'fold');
  assert.equal(ended.finished, true);
  assert.equal(ended.players.reduce((sum, player) => sum + player.stack, 0), 30);
});

test('short big blind pays ante only from chips remaining after blind', () => {
  const game = newHand([2, 3.5], 0, 17, () => 0.5, [2, 2], 'short-ante', 0, 1.5, 3, 3, []);
  assert.equal(game.bigBlindAntePaid, 0.5);
  assert.equal(game.players[1].streetBet, 3);
  assert.equal(game.players[1].totalBet, 3.5);
  assert.equal(game.currentBet, 3);
  const ended = act(game, 0, 'checkcall');
  assert.equal(ended.finished, true);
  assert.equal(ended.board.length, 5);
  assert.ok(Math.abs(ended.players.reduce((sum, player) => sum + player.stack, 0) - 5.5) < 1e-8);
});
