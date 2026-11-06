const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { careerProgress } = require("../app/career-progress.ts");
test("career levels unlock by participation and keep previously played stakes", () => {
  const wallet = { transactions: [] };
  assert.deepEqual(careerProgress(wallet).stakes("cash", [1, 2, 5, 10]), [true, false, false, false]);
  for (let i = 0; i < 3; i++) wallet.transactions.push({ kind: "entry", mode: "tournament", amount: -20 });
  assert.equal(careerProgress(wallet).tier, 2);
  assert.equal(careerProgress(wallet).bounty, false);
  wallet.transactions.push({ kind: "prize", mode: "tournament", amount: 10 });
  assert.equal(careerProgress(wallet).bounty, true);
  wallet.transactions.push({ kind: "buy-in", mode: "cash", amount: -1000 });
  assert.deepEqual(careerProgress(wallet).stakes("cash", [1, 2, 5, 10]), [true, true, false, true]);
});
test("AOF life rebuys do not count as separate runs", () => {
  const progress = careerProgress({ transactions: [
    { mode: "aof", kind: "life", id: "aof:x:life:1", amount: -8 },
    { mode: "aof", kind: "life", id: "aof:x:life:2", amount: -8 }
  ] });
  assert.equal(progress.aof, 1);
  assert.equal(progress.total, 1);
});
