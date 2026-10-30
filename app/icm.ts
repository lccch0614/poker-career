/** Independent Chip Model prize equity, exact subset enumeration for small fields. */
export function icmEquity(stacks: number[], payouts: number[], player: number): number {
  const live = stacks.map((stack, index) => ({ stack, index })).filter(item => item.stack > 0);
  const target = live.findIndex(item => item.index === player);
  if (target < 0 || live.length === 0 || live.length > 9) return 0;
  const total = live.reduce((sum, item) => sum + item.stack, 0);
  const cache = new Map<number, number>();
  function visit(mask: number, remaining: number, place: number): number {
    if (place >= live.length || remaining <= 0) return 0;
    const cached = cache.get(mask);
    if (cached !== undefined) return cached;
    let result = 0;
    live.forEach((item, i) => {
      if (mask & (1 << i)) return;
      const probability = item.stack / remaining;
      result += probability * (i === target ? (payouts[place] ?? 0) : visit(mask | (1 << i), remaining - item.stack, place + 1));
    });
    cache.set(mask, result);
    return result;
  }
  return visit(0, total, 0);
}

/** Required win equity for a simplified heads-up all-in, excluding future betting and ties. */
export function icmCallThreshold(fold: number[], win: number[], lose: number[], payouts: number[], player: number): number | null {
  const fieldSize = fold.filter(stack => stack > 0).length;
  if (fieldSize < 2 || fieldSize > 9) return null;
  const equity = (stacks: number[]) => stacks[player] > 0 ? icmEquity(stacks, payouts, player) : (payouts[fieldSize - 1] ?? 0);
  const foldValue = equity(fold), winValue = equity(win), loseValue = equity(lose);
  if (winValue <= loseValue + 1e-12) return null;
  return Math.max(0, Math.min(1, (foldValue - loseValue) / (winValue - loseValue)));
}
