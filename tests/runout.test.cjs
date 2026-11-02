const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => {
  let source = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('/app/page.tsx')) source += '\nexport { newHand, act, mayRaise, showdown, shouldPlayStandardCinematic, StandardShowdown };';
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { newHand, act, mayRaise, showdown, shouldPlayStandardCinematic, StandardShowdown } = require('../app/page.tsx');
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

// The visual sequence starts for important single-board all-ins, including side pots.
let pending = { ...newHand([20, 20], 0, 10, () => .41), allowRunouts: true };
pending = act(pending, pending.turn, 'raise', 20);
pending = act(pending, pending.turn, 'checkcall');
const once = showdown(pending, 1);
assert.equal(shouldPlayStandardCinematic(pending, once), true);
assert.equal(shouldPlayStandardCinematic(pending, showdown(pending, 2)), false);
assert.equal(shouldPlayStandardCinematic(pending, {...once, settledBets:[10,10]}), false);
assert.equal(shouldPlayStandardCinematic(pending, {...once, settledBets:[15,25]}), true);
assert.equal(shouldPlayStandardCinematic(pending, {...once, showdownAwards:undefined}), false);
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

const multi = showdown(game, 1);
assert.equal(shouldPlayStandardCinematic(game, multi), true);
assert.equal(multi.showdownAwards.length, 3);
assert.deepEqual(multi.showdownAwards.map(a => a.amount), [30,20,10]);
assert.equal(multi.showdownAwards[2].refund, true);
assert.deepEqual(multi.showdownAwards[2].winners, [2]);
for (let i=0; i<multi.players.length; i++) {
  const paid = multi.showdownAwards.filter(a => a.winners.includes(i)).reduce((sum,a) => sum+a.share,0);
  assert.ok(Math.abs(multi.players[i].stack - paid) < 1e-8);
}
const multiHtml = renderToStaticMarkup(React.createElement(StandardShowdown,{presentation:{game:multi,startBoard:game.board},fast:false,onClose(){}}));
assert.ok(multiHtml.includes('切換自動揭牌'));
assert.ok(!multiHtml.includes('class="standard-pot-result"'));
assert.ok(!multiHtml.includes('退回未被跟注籌碼'));

// A short all-in makes earlier callers respond, but does not reopen their raise.
function bettingFixture(stacks, bet = 2, minRaise = 2) {
  const base = newHand(stacks, 0, 71, () => .37);
  return { ...base, street: 'flop', board: base.deck.slice(-3), currentBet: bet, minRaise,
    players: base.players.map((p, i) => ({ ...p, stack: stacks[i], streetBet: 0, totalBet: 0, allIn: false, folded: false })),
    pending: stacks.map(() => true), turn: 0, timeline: [], finished: false };
}
let short = bettingFixture([100, 3, 100, 100]);
short = act(short, 0, 'checkcall');
short = act(short, 1, 'raise', 3);
assert.equal(short.currentBet, 3);
assert.equal(short.minRaise, 2);
assert.equal(short.turn, 2);
assert.equal(mayRaise(short, 2), true); // Has not acted yet.
short = act(short, 2, 'checkcall');
short = act(short, 3, 'checkcall');
assert.equal(short.turn, 0);
assert.equal(mayRaise(short, 0), false);
const beforeIllegal = short.players[0].stack;
const afterIllegal = act(JSON.parse(JSON.stringify(short)), 0, 'raise', 20);
assert.equal(afterIllegal.players[0].stack, beforeIllegal - 1); // Safely calls, never raises.
assert.equal(afterIllegal.currentBet, 0); // Betting proceeds to the turn.
assert.equal(afterIllegal.street, 'turn');

// Two short all-ins can cumulatively reopen action for someone who faced both.
let cumulative = bettingFixture([100, 3, 4, 100]);
cumulative = act(cumulative, 0, 'checkcall');
cumulative = act(cumulative, 1, 'raise', 3);
cumulative = act(cumulative, 2, 'raise', 4);
cumulative = act(cumulative, 3, 'checkcall');
assert.equal(cumulative.turn, 0);
assert.equal(mayRaise(cumulative, 0), true);
cumulative = act(cumulative, 0, 'raise', 6);
assert.equal(cumulative.currentBet, 6);
assert.equal(cumulative.players[0].streetBet, 6);

// A player who checked may raise an incomplete opening all-in.
let checked = bettingFixture([100, .5, 100], 0, 1);
checked = act(checked, 0, 'checkcall');
checked = act(checked, 1, 'raise', .5);
checked = act(checked, 2, 'checkcall');
assert.equal(checked.turn, 0);
assert.equal(mayRaise(checked, 0), true);

// A short big blind remains an all-in contribution, not a smaller live blind.
for (const tournament of [undefined, []]) {
  let blind = newHand([20, 20, .4], 0, 80, () => .39, [0,0,0], 'short-blind', 0, .5, 1, 0, tournament);
  assert.equal(blind.bb, 2);
  assert.equal(blind.players[2].streetBet, .4);
  assert.equal(blind.players[2].allIn, true);
  assert.equal(blind.currentBet, 1);
  assert.equal(blind.turn, 0);
  assert.equal(blind.minRaise, 1);
  blind = act(blind, 0, 'checkcall');
  assert.equal(blind.players[0].streetBet, 1);
  assert.equal(blind.turn, 1);
  blind = act(blind, 1, 'checkcall');
  assert.equal(blind.street, 'flop');
  assert.ok(Math.abs(blind.players.reduce((total, player) => total + player.stack + player.totalBet, 0) - 40.4) < 1e-8);
  const result = showdown(blind);
  assert.ok(Math.abs(result.players.reduce((total, player) => total + player.stack, 0) - 40.4) < 1e-8);
  assert.equal(result.showdownAwards.length, 2);
  assert.ok(Math.abs(result.showdownAwards[0].amount - 1.2) < 1e-8);
  assert.ok(Math.abs(result.showdownAwards[1].amount - 1.2) < 1e-8);
}

// A returned unmatched wager is not a pot win, even when it exceeds the winner's award.
const card = (rank, suit) => ({ rank, suit });
let refundOnly = newHand([30, 10], 0, 91, () => .29);
refundOnly = { ...refundOnly, board: [card(2,'c'),card(3,'d'),card(4,'h'),card(8,'s'),card(9,'c')],
  players: refundOnly.players.map((p, i) => ({ ...p, stack: 0, totalBet: [30,10][i], streetBet: [30,10][i], allIn: true,
    hole: i === 0 ? [card(13,'s'),card(13,'h')] : [card(14,'s'),card(14,'h')] })) };
for (const runs of [1,2,3]) {
  const result = showdown(refundOnly, runs);
  assert.deepEqual(result.winners, [1]);
  assert.deepEqual(result.players.map(p => p.stack), [20,20]);
  assert.ok(result.potSummary.some(line => line.includes('退回未被跟注籌碼')));
  assert.match(result.message, /AI 1.*贏得 20BB/);
  assert.ok(!result.message.includes('另有分池'));
  assert.equal(result.showdownAwards.filter(award => award.refund).reduce((sum, award) => sum + award.amount, 0), 20);
}
