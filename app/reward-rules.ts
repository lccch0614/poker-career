import { bestScore, compareScore, type Card } from "./poker-engine";
import { potsWithBigBlindAnte } from "./tournament";

/** Settlement inputs are snapshots from the hand engine, never animation state. */
export type RewardHand = {
  finished: boolean; street: string; board: Card[]; runoutBoards?: Card[][];
  players: Array<{ hole: Card[]; folded: boolean; stack: number }>;
  startingStacks: number[]; settledBets: number[]; bb: number; bigBlindAntePaid?: number;
  showdownAwards?: Array<{ run: number; layer: number; winners: number[]; refund: boolean }>;
};

export function badBeatResult(hand: RewardHand): { run: number; layer: number; winner: number; board: Card[] } | null {
  if (!hand.finished || hand.street !== "showdown" || hand.players[0]?.folded || !hand.showdownAwards?.length) return null;
  const layers = potsWithBigBlindAnte(hand.settledBets, hand.players.map(p => p.folded), hand.bb, hand.bigBlindAntePaid ?? 0);
  const boards = hand.runoutBoards?.length ? hand.runoutBoards : [hand.board];
  for (const award of hand.showdownAwards) {
    const board = boards[award.run];
    const layer = layers[award.layer];
    if (!board || board.length !== 5 || !layer || award.refund || !layer.eligible.includes(0) || award.winners.includes(0)) continue;
    const heroScore = bestScore([...hand.players[0].hole, ...board]);
    if (heroScore[0] < 7) continue;
    const winner = award.winners.find(seat => seat !== 0 && layer.eligible.includes(seat) && !hand.players[seat]?.folded && compareScore(bestScore([...hand.players[seat].hole, ...board]), heroScore) > 0);
    if (winner !== undefined) return { run: award.run, layer: award.layer, winner, board };
  }
  return null;
}

export type BountyAward = { eliminated: number; recipients: Array<{ seat: number; cents: number }> };
export type BountyEvent = { id: string; eliminated: number; recipients: Array<{ id: number; cents: number }> };
/** Allocate each bust to winners of its highest contested contribution layer. */
export function bountyAwards(hand: RewardHand, bountyCents: number): BountyAward[] {
  if (!hand.finished || !Number.isSafeInteger(bountyCents) || bountyCents < 0 || !hand.showdownAwards?.length) return [];
  const layers = potsWithBigBlindAnte(hand.settledBets, hand.players.map(p => p.folded), hand.bb, hand.bigBlindAntePaid ?? 0);
  return hand.players.flatMap((player, eliminated) => {
    if (!(hand.startingStacks[eliminated] > 0 && player.stack <= 0)) return [];
    // An uncontested hand collapses all contested layers into one summary;
    // rebuilding the pot layers cannot be matched to those synthetic indices.
    const remaining = hand.players.map((seat, index) => !seat.folded ? index : -1).filter(index => index >= 0);
    if (remaining.length === 1 && remaining[0] !== eliminated && hand.showdownAwards!.some(award => !award.refund && award.winners.includes(remaining[0]))) {
      return [{ eliminated, recipients: [{ seat: remaining[0], cents: bountyCents }] }];
    }
    let layer = layers.length - 1;
    while (layer >= 0 && (!layers[layer].contributors.includes(eliminated) || !hand.showdownAwards!.some(a => a.layer === layer && !a.refund))) layer--;
    if (layer < 0) return [];
    const winners = [...new Set(hand.showdownAwards!.filter(a => a.layer === layer && !a.refund).flatMap(a => a.winners).filter(seat => seat !== eliminated))].sort((a,b) => a-b);
    if (!winners.length) return [];
    const share = Math.floor(bountyCents / winners.length), extra = bountyCents % winners.length;
    return [{ eliminated, recipients: winners.map((seat, index) => ({ seat, cents: share + (index < extra ? 1 : 0) })) }];
  });
}

/** Translate table seats into stable tournament player IDs before a table rebalances. */
export function bountyEvents(hand: RewardHand, sessionId: string, handId: string, playerIds: number[], bountyCents: number): BountyEvent[] {
  if (!sessionId || !handId || playerIds.length !== hand.players.length || new Set(playerIds).size !== playerIds.length || playerIds.some(id => !Number.isSafeInteger(id) || id < 0)) return [];
  return bountyAwards(hand, bountyCents).map(award => ({
    id: `${sessionId}:${handId}:${playerIds[award.eliminated]}`,
    eliminated: playerIds[award.eliminated],
    recipients: award.recipients.map(recipient => ({ id: playerIds[recipient.seat], cents: recipient.cents })),
  }));
}
