export const TOURNAMENT_HANDS_PER_LEVEL = 8;
export type TournamentSpeed = "turbo" | "standard" | "deep";
export type TournamentFinish = { seat: number; place: number; handNo: number };
export const TOURNAMENT_SPEEDS = {
  turbo: { label: "Turbo", startingStack: 100, handsPerLevel: 8 },
  standard: { label: "Standard", startingStack: 150, handsPerLevel: 12 },
  deep: { label: "Deep", startingStack: 200, handsPerLevel: 16 },
} as const;

export const TOURNAMENT_BLINDS = [
  { small: 0.5, big: 1 }, { small: 1, big: 2 }, { small: 1.5, big: 3 },
  { small: 2, big: 4 }, { small: 3, big: 6 }, { small: 4, big: 8 },
  { small: 6, big: 12 }, { small: 8, big: 16 }, { small: 12, big: 24 },
  { small: 16, big: 32 }, { small: 24, big: 48 }, { small: 32, big: 64 },
  { small: 48, big: 96 }, { small: 64, big: 128 }, { small: 96, big: 192 },
  { small: 128, big: 256 }, { small: 192, big: 384 }, { small: 256, big: 512 },
  { small: 384, big: 768 }, { small: 512, big: 1024 }, { small: 768, big: 1536 },
  { small: 1024, big: 2048 }, { small: 1536, big: 3072 }, { small: 2048, big: 4096 },
  { small: 3072, big: 6144 }, { small: 4096, big: 8192 },
] as const;

export function tournamentLevel(handNo: number, speed: TournamentSpeed = "turbo") {
  return Math.min(TOURNAMENT_BLINDS.length - 1, Math.floor(Math.max(0, handNo - 1) / TOURNAMENT_SPEEDS[speed].handsPerLevel));
}

export function tournamentBlinds(handNo: number, speed: TournamentSpeed = "turbo") {
  return TOURNAMENT_BLINDS[tournamentLevel(handNo, speed)];
}

export function handsUntilBlindUp(handNo: number, speed: TournamentSpeed = "turbo") {
  const interval = TOURNAMENT_SPEEDS[speed].handsPerLevel;
  return interval - ((Math.max(1, handNo) - 1) % interval);
}

export function tournamentBigBlindAnte(handNo: number, speed: TournamentSpeed = "turbo") {
  return tournamentLevel(handNo, speed) >= 2 ? tournamentBlinds(handNo, speed).big : 0;
}

export function tournamentCanContinue(stacks: number[]) {
  return stacks.filter(stack => stack > 0).length;
}

export function payoutShares(tableSize: number): number[] {
  if (tableSize <= 3) return [100];
  if (tableSize <= 5) return [65, 35];
  return [50, 30, 20];
}

export function tournamentPhase(remaining: number, tableSize: number) {
  const paid = tableSize === 200 ? 30 : payoutShares(tableSize).length;
  if (remaining <= 1) return "complete";
  if (remaining === paid + 1) return "bubble";
  if (remaining <= paid) return "in-the-money";
  return "early";
}

export function recordTournamentFinishes(existing: TournamentFinish[], startingStacks: number[], endingStacks: number[], handNo: number): TournamentFinish[] {
  const previous = new Set(existing.map(entry => entry.seat));
  const eliminated = startingStacks.map((stack, seat) => ({ stack, seat }))
    .filter(entry => entry.stack > 0 && endingStacks[entry.seat] <= 0 && !previous.has(entry.seat))
    .sort((a, b) => b.stack - a.stack || a.seat - b.seat);
  const survivors = tournamentCanContinue(endingStacks);
  return [...existing, ...eliminated.map(entry => ({
    seat: entry.seat,
    place: survivors + 1 + eliminated.filter(other => other.stack > entry.stack).length,
    handNo,
  }))];
}

export function tournamentStandings(stacks: number[], finishes: TournamentFinish[]) {
  const active = stacks.map((stack, seat) => ({ seat, stack })).filter(entry => entry.stack > 0)
    .sort((a, b) => b.stack - a.stack || a.seat - b.seat)
    .map((entry, index) => ({ seat: entry.seat, place: index + 1, stack: entry.stack }));
  return [...active, ...finishes.map(entry => ({ seat: entry.seat, place: entry.place, stack: 0 }))]
    .sort((a, b) => a.place - b.place || a.seat - b.seat);
}

export function prizeForPlace(place: number, tableSize: number, standings: Array<{ place: number }>) {
  const shares = payoutShares(tableSize);
  const tied = standings.filter(entry => entry.place === place).length || 1;
  return Array.from({ length: tied }, (_, offset) => shares[place - 1 + offset] ?? 0)
    .reduce((sum, value) => sum + value, 0) / tied;
}
import { buildSidePots } from "./poker-engine";


export function potsWithBigBlindAnte(contributions: number[], folded: boolean[], bigBlindSeat: number, paidAnte: number) {
  const betting = contributions.map((amount, seat) => amount - (seat === bigBlindSeat ? paidAnte : 0));
  const layers = buildSidePots(betting, folded);
  if (layers.length && paidAnte > 0) layers[0] = { ...layers[0], amount: layers[0].amount + paidAnte };
  return layers;
}
