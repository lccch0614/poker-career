const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { tournamentOpenPercent, shoveRangePercent, inTournamentRange, tournamentPreflopAction, equityVsShoveRange } = require('../app/tournament-strategy.ts');
assert.ok(tournamentOpenPercent('BTN', 30, 8) > tournamentOpenPercent('UTG', 30, 8));
assert.ok(shoveRangePercent('BTN', 8, 0, 8) > shoveRangePercent('BTN', 30, 0, 8));
assert.ok(shoveRangePercent('BTN', 10, 0, 8) > shoveRangePercent('BTN', 10, 1, 8));
assert.ok(inTournamentRange([{rank:14,suit:'s'},{rank:14,suit:'h'}], 8));
assert.ok(!inTournamentRange([{rank:2,suit:'s'},{rank:7,suit:'h'}], 8));
assert.equal(tournamentPreflopAction([{rank:14,suit:'s'},{rank:14,suit:'h'}], 'BTN', 8, 8, 0, 1, 0, 0, () => .4), 'jam');
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
const hole = [{rank:14,suit:'s'},{rank:11,suit:'h'}];
const wide = equityVsShoveRange(hole, [], 60, rng(55), 1500);
const tight = equityVsShoveRange(hole, [], 8, rng(55), 1500);
assert.ok(wide > tight + .08, `${wide} versus ${tight}`);
