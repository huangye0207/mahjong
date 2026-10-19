import type { Tile } from './tiles.ts';

/** 一副成形的 14 张牌：若干面子 + 一对将 */
export interface Composition {
  melds: Tile[][]; // 每个面子 3 张（顺子或刻子）
  pair: [Tile, Tile];
}

const SUIT_ORDER: Record<string, number> = { m: 0, s: 1, p: 2, z: 3 };

function sortHand(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || a.rank - b.rank);
}

function sameTile(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/**
 * 枚举 14 张牌全部分解成「4 面子 + 1 将」的方案。
 * 同一手牌可能有多种分解（如 2223 万），全部返回，由计分阶段择优。
 */
export function enumerateCompositions(tiles: Tile[]): Composition[] {
  if ((tiles.length - 2) % 3 !== 0) return [];
  const out: Composition[] = [];
  rec(sortHand(tiles), [], null, out);
  return out;
}

function rec(
  rem: Tile[],
  melds: Tile[][],
  pair: [Tile, Tile] | null,
  out: Composition[]
): void {
  if (rem.length === 0) {
    if (pair) out.push({ melds: [...melds], pair });
    return;
  }
  const t = rem[0];

  // 作将（全局仅允许一对）
  if (!pair) {
    const j = rem.findIndex((x, i) => i > 0 && sameTile(x, t));
    if (j > 0) {
      const rest = rem.filter((_, i) => i !== 0 && i !== j);
      rec(rest, melds, [t, rem[j]], out);
    }
  }

  // 作刻子
  const sameIdx: number[] = [];
  for (let i = 1; i < rem.length && sameIdx.length < 2; i++) {
    if (sameTile(rem[i], t)) sameIdx.push(i);
  }
  if (sameIdx.length === 2) {
    const rest = rem.filter((_, i) => i !== 0 && i !== sameIdx[0] && i !== sameIdx[1]);
    rec(rest, [...melds, [t, rem[sameIdx[0]], rem[sameIdx[1]]]], pair, out);
  }

  // 作顺子（仅数牌，且 t 是顺子最小的一张）
  if (t.suit !== 'z') {
    const j1 = rem.findIndex((x, i) => i > 0 && x.suit === t.suit && x.rank === t.rank + 1);
    if (j1 > 0) {
      const j2 = rem.findIndex((x, i) => i > 0 && x.suit === t.suit && x.rank === t.rank + 2);
      if (j2 > 0) {
        const idx = new Set([0, j1, j2]);
        const rest = rem.filter((_, i) => !idx.has(i));
        rec(rest, [...melds, [t, rem[j1], rem[j2]]], pair, out);
      }
    }
  }
}

export type WaitType = 'normal' | 'duipeng' | 'kanzhang' | 'bianzhang';

export const WAIT_NAMES: Record<WaitType, string> = {
  normal: '平胡',
  duipeng: '对碰',
  kanzhang: '坎张',
  bianzhang: '边张',
};

/**
 * 判定听口类型：已知 14 张成形牌（含胡的那张）的一种分解，
 * 看胡牌张所在的那个面子是什么形态。
 * - 刻子（含对碰成刻）→ 对碰
 * - 顺子 123 胡 3、789 胡 7 → 边张
 * - 顺子中间（如 2_4 胡 3）→ 坎张
 */
export function classifyWait(composition: Composition, winTile: Tile): WaitType {
  for (const meld of composition.melds) {
    if (!meld.some((t) => t.id === winTile.id)) continue;
    if (meld.every((t) => t.suit === winTile.suit && t.rank === winTile.rank)) {
      return 'duipeng';
    }
    // 顺子
    const ranks = meld.map((t) => t.rank).sort((a, b) => a - b);
    const pos = ranks.indexOf(winTile.rank); // win 在顺子中的位置 0/1/2
    if ((ranks[0] === 1 && pos === 2) || (ranks[0] === 7 && pos === 0)) return 'bianzhang';
    if (pos === 1) return 'kanzhang';
    return 'normal';
  }
  return 'normal';
}
