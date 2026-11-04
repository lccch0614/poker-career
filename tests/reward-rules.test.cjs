const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { badBeatResult, bountyAwards } = require('../app/reward-rules.ts');
const c = (rank,suit) => ({rank,suit});
const hand = {
  finished:true, street:'showdown', bb:0, board:[c(9,'s'),c(9,'h'),c(9,'d'),c(8,'s'),c(7,'s')],
  players:[{hole:[c(9,'c'),c(2,'h')],folded:false,stack:0}, {hole:[c(10,'s'),c(11,'s')],folded:false,stack:20}],
  startingStacks:[10,10], settledBets:[10,10], showdownAwards:[{run:0,layer:0,winners:[1],refund:false}]
};
assert.equal(badBeatResult(hand)?.winner,1);
assert.equal(badBeatResult({...hand, players:hand.players.map((p,i) => i ? p : {...p,folded:true})}),null);
assert.equal(badBeatResult({...hand, showdownAwards:[{run:0,layer:0,winners:[0,1],refund:false}]}),null);
assert.equal(badBeatResult({...hand, players:hand.players.map((p,i) => i ? p : {...p,hole:[c(3,'c'),c(2,'h')]})}),null);
assert.deepEqual(bountyAwards(hand,201),[{eliminated:0,recipients:[{seat:1,cents:201}]}]);
const split = {...hand, players:[hand.players[0],hand.players[1],{...hand.players[1]}],startingStacks:[10,10,10],settledBets:[10,10,10],showdownAwards:[{run:0,layer:0,winners:[1,2],refund:false}]};
assert.deepEqual(bountyAwards(split,201)[0].recipients,[{seat:1,cents:101},{seat:2,cents:100}]);
const {newCareerWallet,openCash,creditReward,restoreCareerWallet} = require('../app/career-bankroll.ts');
let wallet = openCash(newCareerWallet(),'table-1',1);
wallet = creditReward(wallet,'cash','table-1','hand-7','bad-beat',100);
assert.equal(wallet.balance,3000);
assert.equal(creditReward(wallet,'cash','table-1','hand-7','bad-beat',100).balance,3000);
assert.equal(creditReward(wallet,'cash','other','hand-7','bad-beat',100),null);
assert.equal(restoreCareerWallet(JSON.parse(JSON.stringify(wallet))).balance,3000);
assert.equal(badBeatResult({...hand, runoutBoards:[hand.board,hand.board],showdownAwards:[{run:0,layer:0,winners:[0],refund:false},{run:1,layer:0,winners:[1],refund:false}]}).run,1);
const side = {...hand, players:[{...hand.players[0],stack:20},hand.players[1],{...hand.players[1],hole:[c(2,'c'),c(3,'c')],stack:0}],startingStacks:[20,20,10],settledBets:[20,20,10],showdownAwards:[{run:0,layer:0,winners:[0],refund:false},{run:0,layer:1,winners:[1],refund:false}]};
assert.equal(badBeatResult(side).layer,1);
// Uncontested settlement collapses layers; the sole surviving winner gets the bounty.
const foldedBust = {...side, street:'turn', players:side.players.map((p,i)=>({...p,folded:i!==1, stack:i===0?0:10})), startingStacks:[10,20,10], settledBets:[10,20,10], showdownAwards:[{run:0,layer:0,winners:[1],refund:false},{run:0,layer:1,winners:[1],refund:true}]};
assert.deepEqual(bountyAwards(foldedBust,201),[{eliminated:0,recipients:[{seat:1,cents:201}]}]);
const {openTournament} = require('../app/career-bankroll.ts');
const normalTournament = openTournament(newCareerWallet(),'normal',50,8);
assert.equal(normalTournament.tournament.bounty,undefined);
assert.equal(creditReward(normalTournament,'tournament','normal','hand-1-seat-1','bounty',5),null);
const bountyTournament = openTournament(newCareerWallet(),'bounty',50,8,true);
const restoredTournament = restoreCareerWallet(JSON.parse(JSON.stringify(bountyTournament)));
assert.equal(restoredTournament.tournament.bounty,true);
const bountyPaid = creditReward(restoredTournament,'tournament','bounty','hand-1-seat-1','bounty',5);
assert.equal(bountyPaid.balance,2955);
assert.equal(creditReward(bountyPaid,'tournament','bounty','hand-1-seat-1','bounty',5).balance,2955);
assert.throws(()=>restoreCareerWallet({...restoredTournament,tournament:{...restoredTournament.tournament,bounty:'yes'}}));
const {bountyEvents} = require('../app/reward-rules.ts');
assert.deepEqual(bountyEvents(split,'tour-1','table-4-hand-7',[42,0,199],201),[{id:'tour-1:table-4-hand-7:42',eliminated:42,recipients:[{id:0,cents:101},{id:199,cents:100}]}]);
assert.deepEqual(bountyEvents(split,'tour-1','table-4-hand-7',[42,42,199],201),[]);
assert.deepEqual(bountyEvents(split,'tour-1','table-4-hand-7',[42,0],201),[]);
// Two short stacks bust in different layers; each bounty follows its own last contested pot.
const multiBust = {
  ...hand, bb:0, startingStacks:[20,10,5,20], settledBets:[20,10,5,20],
  players:[{...hand.players[0],stack:45},{...hand.players[0],stack:0},{...hand.players[0],stack:0},{...hand.players[1],stack:10}],
  showdownAwards:[{run:0,layer:0,winners:[0],refund:false},{run:0,layer:1,winners:[3],refund:false},{run:0,layer:2,winners:[0],refund:false}]
};
assert.deepEqual(bountyAwards(multiBust,500),[
  {eliminated:1,recipients:[{seat:3,cents:500}]},
  {eliminated:2,recipients:[{seat:0,cents:500}]}
]);
const tournamentWithPrize = require('../app/career-bankroll.ts').settleTournament(bountyPaid,'bounty',1);
assert.equal(tournamentWithPrize.transactions.filter(tx=>tx.kind==='bounty').length,1);
assert.equal(tournamentWithPrize.transactions.filter(tx=>tx.kind==='prize').length,1);
assert.equal(restoreCareerWallet(JSON.parse(JSON.stringify(tournamentWithPrize))).balance,tournamentWithPrize.balance);
const {newMttField,isMttField,restoreMttField} = require('../app/mtt-field.ts');
const field = {...newMttField(1000,0),bounty:{sessionId:'tour-1',cents:201,events:bountyEvents(split,'tour-1','table-4-hand-7',[42,0,199],201)}};
assert.equal(isMttField(field),true);
assert.deepEqual(restoreMttField(JSON.parse(JSON.stringify(field)),100).bounty,field.bounty);
assert.equal(isMttField({...field,bounty:{...field.bounty,events:[null]}}),false);
assert.equal(isMttField({...field,bounty:{...field.bounty,events:[field.bounty.events[0],field.bounty.events[0]]}}),false);
assert.equal(isMttField({...field,bounty:{...field.bounty,cents:202}}),false);
assert.throws(() => restoreCareerWallet({...bountyTournament,tournament:{...bountyTournament.tournament,bounty:false}}));
assert.throws(() => restoreCareerWallet({...normalTournament,tournament:{...normalTournament.tournament,bounty:true}}));
assert.equal(restoreCareerWallet(normalTournament).tournament.bounty,undefined);
