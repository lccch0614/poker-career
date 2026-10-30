import test from "node:test";
import assert from "node:assert/strict";
import { TOURNAMENT_HANDS_PER_LEVEL, handsUntilBlindUp, payoutShares, potsWithBigBlindAnte, prizeForPlace, recordTournamentFinishes, tournamentBigBlindAnte, tournamentBlinds, tournamentCanContinue, tournamentLevel, tournamentPhase, tournamentStandings } from "../app/tournament";

test("tournament blinds rise every eight hands", () => {
  assert.equal(TOURNAMENT_HANDS_PER_LEVEL, 8);
  assert.deepEqual(tournamentBlinds(1), { small: 0.5, big: 1 });
  assert.deepEqual(tournamentBlinds(8), { small: 0.5, big: 1 });
  assert.deepEqual(tournamentBlinds(9), { small: 1, big: 2 });
  assert.deepEqual(tournamentBlinds(17), { small: 1.5, big: 3 });
  assert.equal(tournamentLevel(9), 1);
});

test("blind countdown resets at the next level", () => {
  assert.equal(handsUntilBlindUp(1), 8);
  assert.equal(handsUntilBlindUp(8), 1);
  assert.equal(handsUntilBlindUp(9), 8);
});

test("zero-stack tournament players are eliminated without rebuy", () => {
  assert.equal(tournamentCanContinue([100, 42, 0, 0]), 2);
  assert.equal(tournamentCanContinue([100, 0, 0]), 1);
});

test("speed profiles change level length and retain the same blind ladder", () => {
  assert.deepEqual(tournamentBlinds(9, "standard"), { small: 0.5, big: 1 });
  assert.deepEqual(tournamentBlinds(13, "standard"), { small: 1, big: 2 });
  assert.deepEqual(tournamentBlinds(17, "deep"), { small: 1, big: 2 });
  assert.equal(handsUntilBlindUp(12, "standard"), 1);
  assert.equal(handsUntilBlindUp(17, "deep"), 16);
});

test("big blind ante begins at level three and counts as dead main-pot money", () => {
  assert.equal(tournamentBigBlindAnte(16), 0);
  assert.equal(tournamentBigBlindAnte(17), 3);
  assert.equal(tournamentBigBlindAnte(25, "standard"), 3);
  const pots = potsWithBigBlindAnte([6, 6, 12], [false, false, false], 2, 6);
  assert.equal(pots.length, 1);
  assert.equal(pots[0].amount, 24);
  assert.deepEqual(pots[0].eligible, [0, 1, 2]);
  const short = potsWithBigBlindAnte([1, 1, 4], [false, false, false], 2, 3);
  assert.equal(short[0].amount, 6);
  assert.deepEqual(short[0].eligible, [0, 1, 2]);
});

test("prize structure, bubble, simultaneous busts and final standings", () => {
  assert.deepEqual(payoutShares(3), [100]);
  assert.deepEqual(payoutShares(5), [65, 35]);
  assert.deepEqual(payoutShares(8), [50, 30, 20]);
  assert.equal(tournamentPhase(4, 8), "bubble");
  assert.equal(tournamentPhase(3, 8), "in-the-money");
  const finishes = recordTournamentFinishes([], [100, 20, 20, 80], [140, 0, 0, 80], 9);
  assert.deepEqual(finishes.map(entry => entry.place), [3, 3]);
  const standings = tournamentStandings([220, 0, 0, 0], [...finishes, { seat: 3, place: 2, handNo: 17 }]);
  assert.deepEqual(standings.map(entry => entry.seat), [0, 3, 1, 2]);
  assert.equal(prizeForPlace(3, 4, standings), 0);
  const threePaid = [{ place: 1 }, { place: 2 }, { place: 3 }, { place: 3 }];
  assert.equal(prizeForPlace(3, 8, threePaid), 10);
});
