import type { Tile } from './tiles.ts';

/**
 * 34 种牌型的计数索引：
 * 0-8 万 m1-m9, 9-17 条 s1-s9, 18-26 筒 p1-p9, 27-33 字 z1-z7
 */
export function toCounts(tiles: Tile[]): number[] {
  const counts = new Array<number>(34).fill(0);
  for (const t of tiles) {
    counts[indexOf(t)]++;
  }
  return counts;
}

export function indexOf(t: Tile): number {
  if (t.suit === 'm') return t.rank - 1;
  if (t.suit === 's') return 9 + t.rank - 1;
  if (t.suit === 'p') return 18 + t.rank - 1;
  return 27 + t.rank - 1;
}

/**
 * 基础胡牌判定：4 副面子 + 1 对将。
 * 这里判定的是"手牌 + 副露整体是否已成形"，副露按已完成的面子处理。
 * @param closedTiles 手牌（不含副露）
 * @param meldCount 副露（吃/碰/明杠）的数量
 */
export function canHu(closedTiles: Tile[], meldCount = 0): boolean {
  const counts = toCounts(closedTiles);
  const total = closedTiles.length + meldCount * 3;
  if ((total - 2) % 3 !== 0) return false;

  // 先确定将牌（对子）
  for (let i = 0; i < 34; i++) {
    if (counts[i] >= 2) {
      const rest = [...counts];
      rest[i] -= 2;
      if (canFormSets(rest, 4 - meldCount)) return true;
    }
  }
  return false;
}

/** 七对判定（很多玩法需要，这里先作为可选） */
export function canHuSevenPairs(tiles: Tile[]): boolean {
  if (tiles.length !== 14) return false;
  const counts = toCounts(tiles);
  let pairs = 0;
  for (const c of counts) {
    if (c % 2 !== 0) return false;
    pairs += c / 2;
  }
  return pairs === 7;
}

function canFormSets(counts: number[], setCount: number): boolean {
  // 找到第一张还有剩余的牌
  let first = -1;
  for (let i = 0; i < 34; i++) {
    if (counts[i] > 0) {
      first = i;
      break;
    }
  }
  if (first === -1) return setCount === 0;

  // 情况一：作为刻子（三张相同）
  if (counts[first] >= 3) {
    counts[first] -= 3;
    if (canFormSets(counts, setCount - 1)) {
      counts[first] += 3;
      return true;
    }
    counts[first] += 3;
  }

  // 情况二：作为顺子（三张连续数牌；字牌不能成顺）
  if (first < 27 && first % 9 <= 6 && counts[first + 1] > 0 && counts[first + 2] > 0) {
    counts[first]--;
    counts[first + 1]--;
    counts[first + 2]--;
    if (canFormSets(counts, setCount - 1)) {
      counts[first]++;
      counts[first + 1]++;
      counts[first + 2]++;
      return true;
    }
    counts[first]++;
    counts[first + 1]++;
    counts[first + 2]++;
  }

  return false;
}

/** 摸一张后是否可胡（工具函数） */
export function canHuAfterDraw(closedTiles: Tile[], meldCount = 0): boolean {
  return canHu(closedTiles, meldCount);
}
