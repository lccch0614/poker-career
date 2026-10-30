const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => {
  let source = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('/app/page.tsx')) source += '\nexport { newHand, newAof, aofAct, aofDecision, aofPresentation, aofExposedEquity, aofBestFive, aofOuts, aofDuelLabel, aofNextHand, aofWhatIfBoard, aofHandKey, aofMatrixKey, aofCollectDeal, aofCollectResult, aofStartBossRun, aofRestartRun, AOF_BOSSES, AofTable };';
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { newHand, newAof, aofAct, aofDecision, aofPresentation, aofExposedEquity, aofBestFive, aofOuts, aofDuelLabel, aofNextHand, aofWhatIfBoard, aofHandKey, aofMatrixKey, aofCollectDeal, aofCollectResult, aofStartBossRun, aofRestartRun, AOF_BOSSES, AofTable } = require('../app/page.tsx');
const anteState = newAof();
assert.equal(anteState.game.ante,.25);
assert.deepEqual(anteState.game.players.map(player => player.totalBet),[.25,.75,1.25,.25]);
assert.equal(anteState.game.players.reduce((sum,player) => sum+player.stack+player.totalBet,0),32);
const standardState = newHand([100,100],0,1);
assert.equal(standardState.ante,0);
assert.equal(standardState.players.reduce((sum,player) => sum+player.totalBet,0),1.5);
for (const jam of [false, true]) {
  let state = newAof();
  let steps = 0;
  while (!state.game.finished && steps++ < 8) state = aofAct(state, state.game.turn, jam);
  assert.ok(state.game.finished);
  assert.equal(state.game.players.reduce((sum,p) => sum+p.stack,0),32);
  assert.equal(state.profits.length,1);
  assert.ok(state.stats.every(s => s.hands === 1));
  assert.ok(Math.abs(state.stats.reduce((sum,s) => sum+s.profit,0)) < 1e-8);
  assert.equal(state.game.board.length,jam ? 5 : 0);
  assert.deepEqual(state.lives,state.game.players.map(p => p.stack <= 0 ? 2 : 3));
  assert.equal(aofAct(state,0,true),state);
  assert.equal(aofPresentation(state).revealing,jam);
  if (jam) {
    const settled = JSON.stringify(state);
    for (let step=0;step<=5;step++) {
      const saved = JSON.parse(settled);
      saved.revealStep = step;
      const view = aofPresentation(saved);
      assert.equal(view.board.length,[0,0,3,4,5,5][step]);
      assert.equal(view.profits.length,step < 5 ? 0 : 1);
      assert.ok(view.stats.every(s => s.hands === (step < 5 ? 0 : 1)));
      if (step < 5) {
        assert.ok(view.players.every(p => p.stack === 0 && p.lastAction === 'ALL-IN'));
        assert.equal(view.pot,32);
        assert.ok(view.stats.every(s => s.profit === 0));
      }
      assert.equal(aofAct(saved,0,true),saved);
    }
    assert.equal(JSON.stringify(state),settled);
    const oldSave = { ...state }; delete oldSave.revealStep;
    assert.equal(aofPresentation(oldSave).revealing,false);
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const html = renderToStaticMarkup(React.createElement(AofTable,{state,onChange(){},onExit(){},saveStatus:'已儲存'}));
    assert.ok(!html.includes(state.game.message));
    assert.ok(!html.includes('收池 +'));
    assert.ok(!html.includes('勝出牌型'));
    assert.ok(html.includes('跳過動畫'));
  }
}
const endedRun = newAof();
endedRun.game.finished = true; endedRun.runFinished = true; endedRun.runNo = 3; endedRun.lives = [0,1,0,2];
const restarted = aofNextHand(endedRun);
assert.deepEqual(restarted.lives,[3,3,3,3]);
assert.equal(restarted.runNo,4);
assert.equal(restarted.game.players.reduce((sum,p) => sum+p.stack+p.totalBet,0),32);
assert.equal(restarted.game.ante,.25);
const carryState = newAof();
carryState.game.finished = true; carryState.runFinished = false; carryState.lives = [2,3,3,1];
[0,7.25,13.5,2.75].forEach((stack,index) => { carryState.game.players[index].stack = stack; carryState.game.players[index].totalBet = 0; });
const carried = aofNextHand(carryState);
assert.deepEqual(carried.game.startingStacks,[8,7.25,13.5,2.75]); // Busted seat spends one life; every other stack carries exactly.
assert.equal(carried.game.players.reduce((sum,p) => sum+p.stack+p.totalBet,0),31.5);
assert.equal(carried.game.players.reduce((sum,p) => sum+p.totalBet,0),2.5);
let unevenState = { ...newAof(), game: newHand([3.08,8,12,2.75],0,77,()=>.5,[0,0,0,0],'uneven-aof',.25), lives: [3,3,3,3] };
let unevenSteps = 0;
while (!unevenState.game.finished && unevenSteps++ < 8) unevenState = aofAct(unevenState,unevenState.game.turn,true);
assert.equal(unevenState.game.finished,true);
assert.equal(unevenState.game.board.length,5);
assert.ok(Math.abs(unevenState.game.players.reduce((sum,p) => sum+p.stack,0)-25.83)<1e-8);
assert.ok(Math.abs(unevenState.game.settledBets.reduce((sum,amount) => sum+amount,0)-25.83)<1e-8);
assert.ok(Math.abs(unevenState.game.settledBets[0]-3.08)<1e-8); // AOF uses the exact remaining stack, even when it is not a 0.5BB increment.
assert.ok(unevenState.game.potSummary.length >= 2); // Uneven all-ins create real side pots.
const foldBoardState = newAof();
const beforeDeck = JSON.stringify(foldBoardState.game.deck);
assert.equal(aofWhatIfBoard(foldBoardState.game).length,5);
assert.equal(JSON.stringify(foldBoardState.game.deck),beforeDeck);
let foldedHero = newAof();
while (!foldedHero.game.finished && foldedHero.game.turn !== 0) foldedHero = aofAct(foldedHero,foldedHero.game.turn,false);
foldedHero = aofAct(foldedHero,0,false);
while (!foldedHero.game.finished) foldedHero = aofAct(foldedHero,foldedHero.game.turn,false);
const heroAfterFold = foldedHero.game.players[0].stack;
const afterFoldNextHand = aofNextHand(foldedHero);
assert.ok(heroAfterFold < 8);
assert.equal(afterFoldNextHand.game.startingStacks[0],heroAfterFold); // Folding has a lasting ante/blind cost.
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const foldedHtml = renderToStaticMarkup(React.createElement(AofTable,{state:foldedHero,onChange(){},onExit(){},saveStatus:'已儲存'}));
assert.ok(foldedHtml.includes('娛樂揭牌'));
const revealHtml = renderToStaticMarkup(React.createElement(AofTable,{state:{...foldedHero,foldReveal:true},onChange(){},onExit(){},saveStatus:'已儲存'}));
assert.ok(revealHtml.includes('假設牌面'));
const state = newAof();
const original = aofDecision(state.game,0);
state.game.players[1].hole = [{rank:14,suit:'s'},{rank:14,suit:'h'}];
assert.deepEqual(aofDecision(state.game,0),original);
console.log('AOF: fold-through, four-way all-in, conservation, single settlement and hidden-card isolation passed');
const board = [10,11,12,13,14].map(rank => ({ rank,suit:'s' }));
const holes = [[{rank:2,suit:'h'},{rank:3,suit:'h'}],[{rank:4,suit:'d'},{rank:5,suit:'d'}]];
assert.deepEqual(aofExposedEquity(holes,board),[.5,.5]);
assert.deepEqual(aofBestFive([...holes[0],...board]),board);
const flop = aofExposedEquity(holes,board.slice(0,3));
assert.deepEqual(aofExposedEquity(holes,board.slice(0,3)),flop);
assert.ok(Math.abs(flop.reduce((sum,p)=>sum+p,0)-1)<1e-8);
console.log('AOF reveal: staged visibility, restored saves, no result spoilers, no duplicate settlement and split equities passed');
const cards = text => text.split(' ').map(s => ({rank: '23456789TJQKA'.indexOf(s[0])+2,suit:s[1]}));
assert.equal(aofDuelLabel([cards('8s 8d'),cards('Ah Kh')],[.51,.49],[]).title,'經典硬幣局');
const kings = [cards('Ks Kd'),cards('As Ad')];
const blankTurn = cards('2c 7d 9h Js');
let outs = aofOuts(kings,blankTurn);
assert.equal(outs[0].behind,true);
assert.deepEqual(outs[0].win.map(c=>c.rank),[13,13]);
assert.equal(outs[0].tie.length,0);
assert.equal(outs[1].behind,false);
outs = aofOuts([...kings,cards('Kh Qs')],blankTurn);
assert.equal(outs[0].win.length,1); // Exposed third-player blocker.
outs = aofOuts([cards('Qh Jh'),cards('As Ad')],cards('2h 7h 9c Ks'));
assert.equal(outs[0].win.length,12); // Nine hearts plus three non-heart tens; Th counted once.
assert.equal(outs[0].win.filter(c=>c.suit==='h').length,9);
assert.ok(outs[0].win.every(c=>c.suit==='h' || c.rank===10));
outs = aofOuts([cards('2c 3c'),cards('Ac Ad')],cards('As Kd Qc Jh'));
assert.equal(outs[0].win.length,0);
assert.equal(outs[0].tie.length,4);
assert.ok(outs[0].tie.every(c=>c.rank===10));
assert.deepEqual(aofOuts(kings,[]),[]);
assert.deepEqual(aofOuts(kings,[...blankTurn,...cards('4c')]),[]);
assert.equal(aofOuts([cards('Ks Kd'),cards('As Ad')],cards('2c 7d 9h'))[0].win.length,2);
console.log('Outs: two-outer, flush draw, split outs, exposed blockers and street boundaries passed');

const matrixKeys = new Set();
for (let row=0;row<13;row++) for (let column=0;column<13;column++) matrixKeys.add(aofMatrixKey(row,column));
assert.equal(matrixKeys.size,169);
assert.equal(aofMatrixKey(0,0),'AA');
assert.equal(aofMatrixKey(0,1),'AKs');
assert.equal(aofMatrixKey(1,0),'AKo');
assert.equal(aofHandKey(cards('Ah Kh')),'AKs');
assert.equal(aofHandKey(cards('Ac Kd')),'AKo');
assert.equal(aofHandKey(cards('7c 7d')),'77');
let collection = aofCollectDeal({},cards('Ah Kh'),12);
collection = aofCollectDeal(collection,cards('Ah Kh'),12);
assert.equal(collection.AKs.dealt,1); // Same hand cannot be counted twice.
collection = aofCollectResult(collection,cards('Ah Kh'),12,true);
collection = aofCollectResult(collection,cards('Ah Kh'),12,true);
assert.equal(collection.AKs.wins,1); // Settlement is idempotent.
const collectedState = newAof();
assert.equal(Object.keys(collectedState.collection).length,1);

const freshBoss = aofStartBossRun(newAof());
assert.equal(freshBoss.bossActive,true);
assert.equal(freshBoss.bossStage,0);
assert.deepEqual(freshBoss.lives,[3,3,3,3]);
assert.equal(freshBoss.game.players.reduce((sum,p) => sum+p.stack+p.totalBet,0),32);
const bossOwnCards = aofDecision(freshBoss.game,AOF_BOSSES[0].seat,AOF_BOSSES[0]);
const hiddenCopy = structuredClone(freshBoss.game);
hiddenCopy.players[2].hole = cards('As Ad');
assert.deepEqual(aofDecision(hiddenCopy,AOF_BOSSES[0].seat,AOF_BOSSES[0]),bossOwnCards);
let bossFinish = { ...freshBoss, lives: [1,0,0,0] }; // One remaining live seat makes the run-ending assertion deterministic even on a split pot.
let bossSteps = 0;
while (!bossFinish.game.finished && bossSteps++ < 8) bossFinish = aofAct(bossFinish,bossFinish.game.turn,true);
assert.equal(bossFinish.runFinished,true);
assert.ok(['win','loss'].includes(bossFinish.bossLastResult));
assert.equal(bossFinish.bossLastStage,0);

const oldV21 = newAof();
delete oldV21.collection; delete oldV21.bossActive; delete oldV21.bossStage; delete oldV21.bossTrophies; delete oldV21.bossCycles; delete oldV21.game.ante;
assert.equal(aofPresentation(oldV21).revealing,false);
const newHtml = renderToStaticMarkup(React.createElement(AofTable,{state:oldV21,onChange(){},onExit(){},saveStatus:'已儲存'}));
assert.ok(!newHtml.includes('Card Squeeze'));
assert.ok(newHtml.includes('Boss Run'));
assert.ok(newHtml.includes('169 STARTING HANDS'));
assert.ok(newHtml.includes('返回標準模式'));
const progressState = { ...freshBoss, xp: 78, stats: freshBoss.stats.map((item,index) => ({ ...item, hands: 12, profit: index === 0 ? 4 : -4/3 })), bossStage: 1, bossTrophies: ['wall'], collection: { AKs: { dealt: 3, wins: 2, lastHand: 10, lastWinHand: 10 } } };
const resetState = aofRestartRun(progressState);
assert.deepEqual(resetState.lives,[3,3,3,3]);
assert.equal(resetState.runHands,0);
assert.equal(resetState.bossStage,1);
assert.equal(resetState.xp,78);
assert.deepEqual(resetState.stats,progressState.stats);
assert.deepEqual(resetState.bossTrophies,['wall']);
assert.ok(resetState.collection.AKs.dealt >= 3);
assert.ok(newHtml.includes('重新開始'));
assert.ok(newHtml.includes('每人0.25BB Ante'));
const dangerState = newAof();
dangerState.game.players[0].stack = 2.75;
const dangerHtml = renderToStaticMarkup(React.createElement(AofTable,{state:dangerState,onChange(){},onExit(){},saveStatus:'已儲存'}));
assert.ok(dangerHtml.includes('短碼危險'));
console.log('AOF expansion: 0.25BB ante, carried stacks, life rebuy, danger state, safe restart and v21 save compatibility passed');
