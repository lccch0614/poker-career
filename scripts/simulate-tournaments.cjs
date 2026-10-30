const fs = require('node:fs');
const ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => {
  let source = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('/app/page.tsx')) source += '\nexport { simulateMttTable, seededRandom };';
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { simulateMttTable, seededRandom } = require('../app/page.tsx');
const { newMttField, completeMttRound, mttRemaining } = require('../app/mtt-field.ts');
const count = Number(process.argv[2] || 20);
let totalHands = 0, decisions = 0, preflopDecisions = 0, folds = 0, raises = 0, allins = 0, dealt = 0, vpip = 0, pfr = 0, threeBet = 0, threeBetOpportunities = 0;
const bubbleHands = [], finalHands = [], finishHands = [];
for (let n = 0; n < count; n++) {
  let field = newMttField(100, 0);
  const rng = seededRandom(1007 + n * 7919);
  const ids = Array.from({length: 200}, (_, i) => i);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  field = { ...field, tables: Array.from({length: 25}, (_, i) => ids.slice(i * 8, i * 8 + 8)) };
  let bubble = null, final = null, round = 0;
  while (mttRemaining(field) > 1 && round < 300) {
    round++;
    field = { ...field, clock: { ...field.clock, elapsedMs: Math.floor((round - 1) / 8) * 180000, lastTickAt: 0 } };
    const outcomes = field.tables.map((ids, table) => {
      if (ids.length < 2) return { ids, stacks: ids.map(id => field.stacks[id]) };
      const hand = simulateMttTable(field, table, 'turbo', 0, 'hard');
      totalHands++;
      hand.handTrackers.forEach((tracker, i) => {
        if (hand.startingStacks[i] <= 0) return;
        dealt++; vpip += Number(tracker.vpip); pfr += Number(tracker.pfr);
        threeBet += Number(tracker.threeBet); threeBetOpportunities += Number(tracker.threeBetOpportunity);
      });
      for (const frame of hand.timeline) {
        if (frame.actor === null) continue;
        decisions++;
        if (frame.street !== 'preflop') continue;
        preflopDecisions++;
        if (frame.action.includes('棄牌')) folds++;
        if (/加注|全押至/.test(frame.action)) raises++;
        if (frame.action.includes('全押')) allins++;
      }
      return { ids, stacks: hand.players.map(p => p.stack) };
    });
    field = completeMttRound(field, outcomes);
    if (bubble === null && mttRemaining(field) <= 30) bubble = round;
    if (final === null && mttRemaining(field) <= 8) final = round;
    if (Math.abs(field.stacks.reduce((a,b) => a + b, 0) - 20000) > .01) throw new Error(`chip conservation failed: run ${n+1}`);
  }
  if (mttRemaining(field) !== 1) throw new Error(`tournament ${n+1} did not finish`);
  bubbleHands.push(bubble); finalHands.push(final); finishHands.push(round);
  process.stderr.write(`completed ${n+1}/${count}\n`);
}
const average = values => +(values.reduce((a,b) => a+b,0) / values.length).toFixed(1);
console.log(JSON.stringify({ tournaments: count, players: count*200, tableHands: totalHands, playerHands: dealt, vpipPct: +(vpip/dealt*100).toFixed(1), pfrPct: +(pfr/dealt*100).toFixed(1), threeBetOpportunityPct: +(threeBet/threeBetOpportunities*100).toFixed(1), decisions, preflopDecisions, preflopFoldPct: +(folds/preflopDecisions*100).toFixed(1), preflopRaisePct: +(raises/preflopDecisions*100).toFixed(1), preflopAllInPct: +(allins/preflopDecisions*100).toFixed(1), averageRoundsToMoney: average(bubbleHands), averageRoundsToFinal8: average(finalHands), averageRoundsToWinner: average(finishHands), finishRange: [Math.min(...finishHands), Math.max(...finishHands)], note: 'Synchronized simulated rounds; 8 rounds per 3-minute blind level, not observed wall-clock duration.' }, null, 2));
