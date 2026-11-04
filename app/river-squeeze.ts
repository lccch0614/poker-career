// Normalized coordinates keep the same pip layout at every card size.
export type Pip = { x: number; y: number; inverted?: boolean };
export type PeelRect = { x: number; y: number; width: number; height: number };
export type PeelEdge = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export function cardPips(rank: number): Pip[] {
  const paired = (ys: number[]) => ys.flatMap(y => [{ x: .30, y, inverted: y > .5 }, { x: .70, y, inverted: y > .5 }]);
  switch (rank) {
    case 14: return [{ x: .5, y: .5 }];
    case 2: return [{ x:.5, y:.28 }, { x:.5, y:.72, inverted:true }];
    case 3: return [{ x:.5, y:.25 }, { x:.5, y:.5 }, { x:.5, y:.75, inverted:true }];
    case 4: return paired([.27,.73]);
    case 5: return [...paired([.27,.73]), { x:.5, y:.5 }];
    case 6: return paired([.23,.5,.77]);
    case 7: return [...paired([.23,.5,.77]), { x:.5, y:.365 }];
    case 8: return [...paired([.23,.5,.77]), { x:.5, y:.365 }, { x:.5, y:.635, inverted:true }];
    case 9: return [...paired([.20,.40,.60,.80]), { x:.5, y:.5 }];
    case 10: return [...paired([.20,.40,.60,.80]), { x:.5, y:.30 }, { x:.5, y:.70, inverted:true }];
    default: return [];
  }
}
export function peelEdge(x: number, y: number): PeelEdge {
  const horizontal = x < .25 ? 'left' : x > .75 ? 'right' : '';
  const vertical = y < .2 ? 'top' : y > .8 ? 'bottom' : '';
  if (horizontal && vertical) return `${vertical}-${horizontal}` as PeelEdge;
  if (horizontal) return horizontal;
  if (vertical) return vertical;
  return (['left','right','top','bottom'] as const).reduce((best, edge) => ({ left:x, right:1-x, top:y, bottom:1-y }[edge] < { left:x, right:1-x, top:y, bottom:1-y }[best] ? edge : best));
}
export function peelRect(edge: PeelEdge, dx: number, dy: number): PeelRect | null {
  const xDepth = Math.max(0, Math.min(1, edge.includes('left') ? dx : edge.includes('right') ? -dx : 0));
  const yDepth = Math.max(0, Math.min(1, edge.includes('top') ? dy : edge.includes('bottom') ? -dy : 0));
  const corner = edge.includes('-');
  if (corner) {
    const depth = Math.max(xDepth, yDepth);
    if (depth < .005) return null;
    return { x:edge.includes('right') ? 1-depth : 0, y:edge.includes('bottom') ? 1-depth : 0, width:depth, height:depth };
  }
  const depth = Math.max(xDepth, yDepth);
  if (depth < .005) return null;
  // A side pull avoids corner indices until the player deliberately reaches the corner.
  return edge === 'left' || edge === 'right'
    ? { x: edge === 'right' ? 1-depth : 0, y:.14, width:depth, height:.72 }
    : { x:.15, y:edge === 'bottom' ? 1-depth : 0, width:.70, height:depth };
}
