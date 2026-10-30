import test from "node:test";
import assert from "node:assert/strict";
import { buyAofLife, careerStakeRisk, cashCannotRebuy, closeAof, closeCash, newCareerWallet, openAof, openCash, openTournament, rebuyCash, restoreCareerWallet, settleTournament } from "../app/career-bankroll";

test("stake warning separates upfront cost, optional exposure and reserve", () => {
  assert.deepEqual(careerStakeRisk("cash", 3000, 1), { initialCost: 100, maximumCost: 300, affordableEntries: 30, recommendedEntries: 30, level: "comfortable" });
  assert.deepEqual(careerStakeRisk("tournament", 3000, 250), { initialCost: 250, maximumCost: 250, affordableEntries: 12, recommendedEntries: 60, level: "caution" });
  assert.deepEqual(careerStakeRisk("aof", 15, 1), { initialCost: 8, maximumCost: 24, affordableEntries: 1, recommendedEntries: null, level: "caution" });
  assert.equal(careerStakeRisk("aof", 7, 1).level, "unaffordable");
});

test("legacy migration starts a new virtual wallet without converting old hands", () => {
  const wallet = restoreCareerWallet(undefined, true);
  assert.deepEqual(wallet, newCareerWallet());
  assert.throws(() => restoreCareerWallet(undefined), /missing/);
  assert.equal(restoreCareerWallet(structuredClone(wallet)).balance, 3000);
});

test("cash buy-in, two paid rebuys and one cash-out survive reload", () => {
  let wallet = openCash(newCareerWallet(), "cash-1", 2)!;
  assert.equal(wallet.balance, 2800);
  wallet = rebuyCash(wallet, "cash-1")!;
  wallet = rebuyCash(wallet, "cash-1")!;
  assert.equal(wallet.balance, 2400);
  assert.equal(rebuyCash(wallet, "cash-1"), null);
  wallet = restoreCareerWallet(structuredClone(wallet));
  wallet = closeCash(wallet, "cash-1", 130)!;
  assert.equal(wallet.balance, 2660);
  assert.equal(closeCash(wallet, "cash-1", 130), null);
  assert.deepEqual(wallet.transactions.map(tx => tx.amount), [-200,-200,-200,260]);
});

test("tournament prize comes from entries, handles bubble and tied rank once", () => {
  let wallet = openTournament(newCareerWallet(), "tour-1", 50, 8)!;
  assert.equal(wallet.balance, 2950);
  wallet = settleTournament(wallet, "tour-1", 3, [1,2,3,4,5,6,7,8])!;
  assert.equal(wallet.balance, 3030); // 8 × 50 × 20% = 80 C.
  assert.equal(settleTournament(wallet, "tour-1", 3), null);
  wallet = openTournament(wallet, "tour-2", 20, 8)!;
  wallet = settleTournament(wallet, "tour-2", 4)!;
  assert.equal(wallet.balance, 3010); // Bubble: no prize.
  wallet = openTournament(wallet, "tour-3", 50, 8)!;
  wallet = settleTournament(wallet, "tour-3", 3, [1,2,3,3,5,6,7,8])!;
  assert.equal(wallet.balance, 3000); // Third/fourth share 20% prize, 40 C each.
});

test("AOF pays each 8BB life only upon use and returns the remaining stack once", () => {
  let wallet = openAof(newCareerWallet(), "run-1", 5)!;
  assert.equal(wallet.balance, 2960);
  wallet = buyAofLife(wallet, "run-1")!;
  wallet = buyAofLife(wallet, "run-1")!;
  assert.equal(wallet.balance, 2880);
  assert.equal(buyAofLife(wallet, "run-1"), null);
  wallet = closeAof(wallet, "run-1", 20.5)!;
  assert.equal(wallet.balance, 2982.5);
  assert.equal(closeAof(wallet, "run-1", 20.5), null);
});

test("unaffordable buy-ins and tampered totals fail closed", () => {
  let wallet = newCareerWallet();
  wallet = openCash(wallet, "big-1", 10)!;
  wallet = openCash(closeCash(wallet, "big-1", 0)!, "big-2", 10)!;
  wallet = openCash(closeCash(wallet, "big-2", 0)!, "big-3", 10)!;
  assert.equal(wallet.balance, 0);
  assert.equal(openCash(wallet, "big-4", 1), null);
  assert.equal(openTournament(wallet, "tour", 20, 8), null);
  assert.equal(openAof(wallet, "run", 1), null);
  assert.throws(() => restoreCareerWallet({ ...wallet, balance: 3000 }), /mismatch/);
});

test("a busted cash seat stays out after insufficient funds close its escrow", () => {
  const lowFunds = { ...newCareerWallet(), balance: 100, transactions: [{ id: "adjustment", sessionId: "old", mode: "cash" as const, kind: "cash-out" as const, amount: -2900, at: 1 }] };
  const active = openCash(lowFunds, "cash-short", 1)!;
  assert.equal(active.balance, 0);
  assert.equal(cashCannotRebuy(active, "cash-short", 0, 0), true);
  const closed = closeCash(active, "cash-short", 0)!;
  assert.equal(cashCannotRebuy(closed, "cash-short", 0, 0), true);
});
