const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => {
  let source = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('/app/page.tsx')) source += '\nexport { newHand, act, showdown, shouldPlayStandardCinematic, StandardShowdown };';
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { newHand, act, showdown, shouldPlayStandardCinematic, StandardShowdown } = require('../app/page.tsx');
for (const runs of [1, 2, 3]) {
  let game = { ...newHand([20, 20], 0, 1, () => .41), allowRunouts: true };
  game = act(game, game.turn, 'raise', 20);
  game = act(game, game.turn, 'checkcall');
  assert.equal(game.runoutPending, true);
  assert.equal(game.finished, false);
  const saved = JSON.parse(JSON.stringify(game));
  const result = showdown(saved, runs);
  assert.equal(result.runoutBoards.length, runs);
  assert.ok(result.runoutBoards.every(board => board.length === 5));
  assert.equal(new Set(result.runoutBoards.flat().map(card => card.rank + card.suit)).size, runs * 5);
  assert.ok(Math.abs(result.players.reduce((sum, p) => sum + p.stack, 0) - 40) < 1e-8);
  assert.equal(result.finished, true);
}
let game = newHand([10, 20, 30], 0, 2, () => .43);
game = { ...game, players: game.players.map((p, i) => ({ ...p, stack: 0, totalBet: [10, 20, 30][i], folded: false, allIn: true })), board: [], settledBets: [] };
for (const runs of [1, 2, 3]) {
  const result = showdown(game, runs);
  assert.ok(Math.abs(result.players.reduce((sum, p) => sum + p.stack, 0) - 60) < 1e-8);
  assert.ok(result.potSummary.some(line => line.includes('邊池')));
}

// The visual sequence only starts for an important, single-board heads-up all-in.
let pending = { ...newHand([20, 20], 0, 10, () => .41), allowRunouts: true };
pending = act(pending, pending.turn, 'raise', 20);
pending = act(pending, pending.turn, 'checkcall');
const once = showdown(pending, 1);
assert.equal(shouldPlayStandardCinematic(pending, once), true);
assert.equal(shouldPlayStandardCinematic(pending, showdown(pending, 2)), false);
assert.equal(shouldPlayStandardCinematic(pending, {...once, settledBets:[10,10]}), false);
assert.equal(shouldPlayStandardCinematic(pending, {...once, settledBets:[15,25]}), false);
assert.equal(shouldPlayStandardCinematic(once, once), false); // restored completed hands do not replay
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const html = renderToStaticMarkup(React.createElement(StandardShowdown, {presentation:{game:once,startBoard:pending.board},fast:false,onClose(){}}));
assert.ok(html.includes('重要底池攤牌'));
assert.ok(html.includes('跳過動畫'));
assert.ok(!html.includes('攤牌結果'));
assert.ok(!html.includes('收池 +'));
assert.equal(pending.board.length, 0);
assert.equal(once.board.length, 5);
