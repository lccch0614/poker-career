const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, filename);
const {cardPips, peelEdge, peelRect} = require('../app/river-squeeze.ts');
for (const rank of [2,3,4,5,6,7,8,9,10,14]) {
  const pips = cardPips(rank);
  assert.equal(pips.length, rank === 14 ? 1 : rank);
  assert.equal(new Set(pips.map(p => `${p.x},${p.y}`)).size, pips.length);
  assert.ok(pips.every(p => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1));
}
for (const rank of [11,12,13]) assert.deepEqual(cardPips(rank),[]);
assert.equal(peelEdge(.02,.5),'left');
assert.equal(peelEdge(.98,.5),'right');
assert.equal(peelEdge(.5,.01),'top');
assert.equal(peelEdge(.5,.99),'bottom');
for (const [x,y,edge,dx,dy] of [[.02,.02,'top-left',.1,.1],[.98,.02,'top-right',-.1,.1],[.02,.98,'bottom-left',.1,-.1],[.98,.98,'bottom-right',-.1,-.1]]) {
  assert.equal(peelEdge(x,y),edge);
  const r=peelRect(edge,dx,dy);
  assert.ok(r && r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0 && r.x+r.width <= 1 && r.y+r.height <= 1);
}
assert.equal(peelRect('left',-.2,0),null);
assert.deepEqual(peelRect('left',.2,0),{x:0,y:.14,width:.2,height:.72});
assert.deepEqual(peelRect('right',-.2,0),{x:.8,y:.14,width:.2,height:.72});
assert.deepEqual(peelRect('top',0,.2),{x:.15,y:0,width:.70,height:.2});
assert.deepEqual(peelRect('bottom',0,-.2),{x:.15,y:.8,width:.70,height:.2});
