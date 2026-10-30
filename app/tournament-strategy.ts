import { bestScore, compareScore, type Card, type Suit } from './poker-engine';
import { preflopHandScore, type TablePosition } from './preflop-strategy';

// Heuristic ranges, expressed as a percentage of the 1,326 possible combinations.
// These are game design parameters, not solver charts.
const open: Record<TablePosition, number> = { UTG: 18, 'UTG+1': 20, MP: 23, HJ: 29, CO: 37, BTN: 50, SB: 46, BB: 30 };
const suits: Suit[] = ['s','h','d','c'];
const deck: Card[] = suits.flatMap(suit => Array.from({ length: 13 }, (_, i) => ({ rank: i + 2, suit })));
const key = (card: Card) => `${card.rank}${card.suit}`;
const combinations = deck.flatMap((first, i) => deck.slice(i + 1).map(second => ({ hole: [first, second], score: preflopHandScore([first, second]) }))).sort((a, b) => b.score - a.score || key(a.hole[0]).localeCompare(key(b.hole[0])) || key(a.hole[1]).localeCompare(key(b.hole[1])));

export function tournamentOpenPercent(position: TablePosition, depth: number, tableSize: number): number {
  const base = tableSize === 2 && position === 'SB' ? 68 : open[position];
  return Math.max(12, Math.min(80, base + (depth <= 8 ? 10 : depth <= 15 ? 4 : 0)));
}
export function shoveRangePercent(position: TablePosition, depth: number, raises: number, tableSize: number): number {
  if (raises >= 2) return depth <= 12 ? 13 : 7;
  if (raises === 1) return depth <= 10 ? 19 : depth <= 20 ? 12 : 7;
  return Math.max(8, Math.min(75, tournamentOpenPercent(position, depth, tableSize) - (depth > 20 ? 24 : depth > 12 ? 14 : depth > 8 ? 8 : 0)));
}
export function inTournamentRange(hole: Card[], percent: number): boolean {
  const cutoff = combinations[Math.max(0, Math.min(combinations.length - 1, Math.ceil(combinations.length * percent / 100) - 1))].score;
  return preflopHandScore(hole) >= cutoff;
}
export function tournamentPreflopAction(hole: Card[], position: TablePosition, depth: number, tableSize: number, raises: number, toCallBb: number, limpers: number, aggression: number, rng: () => number): 'fold' | 'checkcall' | 'raise' | 'jam' {
  const variation = Math.max(-7, Math.min(7, aggression * 50));
  if (raises === 0 && limpers === 0) {
    const percent = tournamentOpenPercent(position, depth, tableSize) + variation;
    if (depth <= 12 && inTournamentRange(hole, shoveRangePercent(position, depth, 0, tableSize) + variation)) return 'jam';
    if (inTournamentRange(hole, percent) && rng() < (depth <= 12 ? .65 : .95)) return 'raise';
    return toCallBb <= 0 ? 'checkcall' : 'fold';
  }
  const costPenalty = Math.max(0, toCallBb - 2.5) * 2;
  const defend = (position === 'BB' ? 38 : position === 'BTN' ? 30 : 22) + (depth <= 15 ? -4 : 0) - costPenalty + variation;
  const strong = Math.max(5, (raises > 1 ? 9 : 13) - costPenalty * .4 + variation * .4);
  if (depth <= 12 && inTournamentRange(hole, shoveRangePercent(position, depth, Math.max(1, raises), tableSize) + variation)) return 'jam';
  if (inTournamentRange(hole, strong) && rng() < .72) return 'raise';
  if (inTournamentRange(hole, defend) || toCallBb <= 0) return 'checkcall';
  return 'fold';
}

/** Monte Carlo equity vs a range, without reading the actual opponent cards or undealt deck. */
export function equityVsShoveRange(hole: Card[], board: Card[], percent: number, rng: () => number, trials = 240): number {
  const known = new Set([...hole, ...board].map(key));
  const cutoff = combinations[Math.max(0, Math.min(combinations.length - 1, Math.ceil(combinations.length * percent / 100) - 1))].score;
  const candidates = combinations.filter(c => c.score >= cutoff && c.hole.every(card => !known.has(key(card))));
  if (!candidates.length) return 0;
  let points = 0;
  for (let i = 0; i < trials; i++) {
    const opponent = candidates[Math.floor(rng() * candidates.length)].hole;
    const used = new Set([...known, ...opponent.map(key)]);
    const pool = deck.filter(card => !used.has(key(card)));
    const runout: Card[] = [];
    for (let j = 0; j < 5 - board.length; j++) { const index = Math.floor(rng() * pool.length); runout.push(pool.splice(index, 1)[0]); }
    const fullBoard = [...board, ...runout];
    const cmp = compareScore(bestScore([...hole, ...fullBoard]), bestScore([...opponent, ...fullBoard]));
    points += cmp > 0 ? 1 : cmp === 0 ? .5 : 0;
  }
  return points / trials;
}
