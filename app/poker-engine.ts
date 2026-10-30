export type Suit = "s" | "h" | "d" | "c";
export type Card = { rank: number; suit: Suit };

export function scoreFive(cards: Card[]): number[] {
  const ranks = cards.map(card => card.rank).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  ranks.forEach(rank => counts.set(rank, (counts.get(rank) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every(card => card.suit === cards[0].suit);
  const unique = [...new Set(ranks)];
  if (unique[0] === 14) unique.push(1);

  let straightHigh = 0;
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i] - unique[i + 4] === 4) {
      straightHigh = unique[i];
      break;
    }
  }

  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) {
    return [3, groups[0][0], ...groups.filter(group => group[1] === 1).map(group => group[0]).sort((a, b) => b - a)];
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = groups.filter(group => group[1] === 2).map(group => group[0]).sort((a, b) => b - a);
    return [2, ...pairs, groups.find(group => group[1] === 1)![0]];
  }
  if (groups[0][1] === 2) {
    return [1, groups[0][0], ...groups.filter(group => group[1] === 1).map(group => group[0]).sort((a, b) => b - a)];
  }
  return [0, ...ranks];
}

export function compareScore(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

export function bestScore(cards: Card[]): number[] {
  let best: number[] = [-1];
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const score = scoreFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (compareScore(score, best) > 0) best = score;
          }
  return best;
}

export function completeBoard(deck: Card[], board: Card[]) {
  const cardsNeeded = Math.max(0, 5 - board.length);
  if (cardsNeeded === 0) return { board, deck };
  return {
    board: [...board, ...deck.slice(-cardsNeeded)],
    deck: deck.slice(0, -cardsNeeded),
  };
}

export type SidePot = {
  amount: number;
  contributors: number[];
  eligible: number[];
};

export function buildSidePots(contributions: number[], folded: boolean[]): SidePot[] {
  const levels = [...new Set(contributions.filter(amount => amount > 0))].sort((a, b) => a - b);
  const pots: SidePot[] = [];
  let previous = 0;
  for (const level of levels) {
    const contributors = contributions.map((amount, index) => amount >= level ? index : -1).filter(index => index >= 0);
    const amount = (level - previous) * contributors.length;
    if (amount > 0) {
      pots.push({ amount, contributors, eligible: contributors.filter(index => !folded[index]) });
    }
    previous = level;
  }
  return pots;
}
