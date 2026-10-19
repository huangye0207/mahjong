// 吃/碰/杠/胡 可行性判定（前后端共用）
import type { Tile } from './tiles.ts';
import { enumerateCompositions } from './structure.ts';

/** 副露的面子 */
export interface Meld {
  kind: 'chi' | 'peng' | 'minggang' | 'angang' | 'jiagang';
  tiles: Tile[];
}

function countSame(hand: Tile[], t: Tile): number {
  return hand.filter((x) => x.suit === t.suit && x.rank === t.rank).length;
}

/** 碰：手牌中有两张相同 */
export function canPeng(hand: Tile[], discard: Tile): boolean {
  return countSame(hand, discard) >= 2;
}

/** 明杠：手牌中有三张相同 */
export function canGang(hand: Tile[], discard: Tile): boolean {
  return countSame(hand, discard) >= 3;
}

/** 吃：返回所有能与 discard 组成顺子的手牌两张组合（仅数牌） */
export function canChi(hand: Tile[], discard: Tile): [Tile, Tile][] {
  if (discard.suit === 'z') return [];
  const r = discard.rank;
  const out: [Tile, Tile][] = [];
  const find = (rank: number) => hand.find((t) => t.suit === discard.suit && t.rank === rank);
  const c1 = find(r - 2);
  const c2 = find(r - 1);
  const c3 = find(r + 1);
  const c4 = find(r + 2);
  if (c1 && c2) out.push([c1, c2]);
  if (c2 && c3) out.push([c2, c3]);
  if (c3 && c4) out.push([c3, c4]);
  return out;
}

/** 自摸胡：14 张（含副露则更少）能成形 */
export function canZimo(closedTiles: Tile[]): boolean {
  return enumerateCompositions(closedTiles).length > 0;
}

/** 荣胡：13 张 + 别人的弃牌能成形 */
export function canHuRong(hand13: Tile[], discard: Tile): boolean {
  return enumerateCompositions([...hand13, discard]).length > 0;
}

/** 暗杠：手牌中有四张相同的牌，返回每种一张 */
export function anGangCandidates(hand: Tile[]): Tile[] {
  const groups = new Map<string, Tile[]>();
  for (const t of hand) {
    const k = `${t.suit}${t.rank}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  return [...groups.values()].filter((g) => g.length >= 4).map((g) => g[0]);
}

/** 加杠：手牌中有与已碰面子相同的牌，返回可加的牌 */
export function jiaGangCandidates(hand: Tile[], exposed: Meld[]): Tile[] {
  const out: Tile[] = [];
  for (const m of exposed) {
    if (m.kind !== 'peng') continue;
    const t = hand.find((h) => h.suit === m.tiles[0].suit && h.rank === m.tiles[0].rank);
    if (t) out.push(t);
  }
  return out;
}
