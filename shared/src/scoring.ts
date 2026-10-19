import type { Tile } from './tiles.ts';
import { isHonor, isFlower, ownFlowerRanks } from './tiles.ts';
import { enumerateCompositions, classifyWait } from './structure.ts';
import type { WaitType } from './structure.ts';

/** 特殊牌 = 幺九牌（数牌 1/9）及字牌；其余（2-8 万条筒）为普通牌 */
export function isSpecialTile(t: Tile): boolean {
  return isHonor(t) || t.rank === 1 || t.rank === 9;
}

export type MeldKind = 'peng' | 'anke' | 'minggang' | 'angang';

export interface MeldScore {
  kind: MeldKind;
  tiles: Tile[]; // 碰/暗刻 3 张，杠 4 张
}

export type WinMethod = 'zimo' | 'rong';

export interface HandScore {
  melds: MeldScore[]; // 全部计分面子（含胡牌构成的那副），顺子不计分则不在其中
  pair: [Tile, Tile] | null;
  allTiles: Tile[]; // 全部牌（算清一色等用）：手牌 14 张 + 副露
  flowers: Tile[];
  method: WinMethod;
  wait: WaitType;
  seat: number; // 0 东 1 南 2 西 3 北
  shunCount: number; // 顺子面子总数（闭手+副露），用于对对胡判定
}

export interface ScoreResult {
  base: number; // 基础胡头（30 底 + 面子 + 花 + 自摸/坎边加成）
  tai: number; // 台数（上限 3）
  multiplier: number; // 2^tai
  final: number; // 最终胡头 = min(300, 向上取整到 10)
}

export function ceilTo10(n: number): number {
  return Math.ceil(n / 10) * 10;
}

/** 单副面子/杠的胡头 */
export function meldHuTou(m: MeldScore): number {
  const special = isSpecialTile(m.tiles[0]);
  switch (m.kind) {
    case 'peng':
      return special ? 4 : 2;
    case 'anke':
      return special ? 8 : 4;
    case 'minggang':
      return special ? 16 : 8;
    case 'angang':
      return special ? 32 : 16;
  }
}

/** 非胡牌者的胡头：碰/杠、花牌、手牌中的三元/自风对子（无 30 底） */
export function scoreUnwon(
  melds: MeldScore[],
  flowers: Tile[],
  withTai = false,
  seat = 0,
  closedTiles: Tile[] = []
): number {
  let base = melds.reduce((s, m) => s + meldHuTou(m), 0) + flowers.length * 4;
  // 手牌中的三元/自风对子（两张及以上），每种 +2
  const counts = new Map<string, { tile: Tile; n: number }>();
  for (const t of closedTiles) {
    if (t.suit !== 'z') continue;
    const k = `${t.suit}${t.rank}`;
    const e = counts.get(k) ?? { tile: t, n: 0 };
    e.n++;
    counts.set(k, e);
  }
  for (const { tile, n } of counts.values()) {
    if (n >= 2 && (tile.rank >= 5 || tile.rank === seat + 1)) base += 2;
  }
  if (!withTai) return base;
  const tai = Math.min(3, countTai(melds, flowers, seat));
  return ceilTo10(base * 2 ** tai);
}

function countTai(scoreMelds: MeldScore[], flowers: Tile[], seat: number): number {
  let tai = 0;
  const myFlowers = ownFlowerRanks(seat);
  for (const f of flowers) {
    if (myFlowers.includes(f.rank)) tai += 1; // 自己的花，每台 1
  }
  const ranks = new Set(flowers.map((f) => f.rank));
  if ([1, 2, 3, 4].every((r) => ranks.has(r))) tai += 1; // 春夏秋冬
  if ([5, 6, 7, 8].every((r) => ranks.has(r))) tai += 1; // 梅兰竹菊
  for (const m of scoreMelds) {
    const t = m.tiles[0];
    if (t.suit === 'z') {
      if (t.rank === seat + 1) tai += 1; // 自风（碰/杠/暗刻都算，已确认）
      if (t.rank >= 5) tai += 1; // 三元
    }
  }
  return tai;
}

/** 计算一整手胡牌的胡头与台数 */
export function evaluateHand(h: HandScore): ScoreResult {
  // 基础胡头
  let base = 30;
  base += h.melds.reduce((s, m) => s + meldHuTou(m), 0);
  base += h.flowers.length * 4;
  if (h.method === 'zimo') base += 2;
  if (h.wait === 'kanzhang' || h.wait === 'bianzhang') base += 2;
  // 将对为三元牌或自风牌：+2 胡（已确认）
  if (h.pair) {
    const t = h.pair[0];
    if (t.suit === 'z' && (t.rank >= 5 || t.rank === h.seat + 1)) base += 2;
  }

  // 台数
  let tai = countTai(h.melds, h.flowers, h.seat);
  const suits = new Set(h.allTiles.filter((t) => t.suit !== 'z').map((t) => t.suit));
  const hasHonor = h.allTiles.some((t) => t.suit === 'z');
  if (suits.size === 0 && h.allTiles.length > 0) {
    tai += 3; // 字一色
  } else if (suits.size === 1) {
    tai += hasHonor ? 2 : 3; // 混一色 / 清一色
  }
  if (h.shunCount === 0) tai += 2; // 对对胡
  tai = Math.min(3, tai);

  const final = Math.min(300, ceilTo10(base * 2 ** tai));
  return { base, tai, multiplier: 2 ** tai, final };
}

export interface WinScoreInput {
  closed14: Tile[]; // 含胡的那张的 14 张手牌
  exposed: MeldScore[]; // 已副露的碰/杠
  flowers: Tile[];
  winTileId: number;
  method: WinMethod;
  seat: number;
}

export interface WinScoreResult extends ScoreResult {
  composition: { melds: MeldScore[]; wait: WaitType };
}

/**
 * 完整的胡牌计分流程：枚举分解 → 每种分解判定听口 → 计分 → 取最优。
 * "听对碰荣胡算碰牌、自摸算暗刻"在此处理：含胡牌张的刻子按胡法定性。
 */
export function scoreWin(input: WinScoreInput): WinScoreResult | null {
  const comps = enumerateCompositions(input.closed14);
  if (comps.length === 0) return null;

  let best: WinScoreResult | null = null;
  for (const comp of comps) {
    const wait = classifyWait(comp, input.closed14.find((t) => t.id === input.winTileId)!);
    // 分解中的面子转计分面子
    const melds: MeldScore[] = [...input.exposed];
    let shunCount = 0; // 副露顺子（吃）数量，当前类型不支持，预留
    for (const meld of comp.melds) {
      const isKe = meld.every(
        (t) => t.suit === meld[0].suit && t.rank === meld[0].rank
      );
      if (!isKe) {
        shunCount += 1; // 顺子不计胡头
        continue;
      }
      const isWin = meld.some((t) => t.id === input.winTileId);
      const kind: MeldKind = isWin
        ? input.method === 'zimo'
          ? 'anke'
          : 'peng'
        : 'anke';
      melds.push({ kind, tiles: meld });
    }

    const hand: HandScore = {
      melds,
      pair: comp.pair,
      allTiles: [...input.closed14, ...input.exposed.flatMap((m) => m.tiles)],
      flowers: input.flowers,
      method: input.method,
      wait,
      seat: input.seat,
      shunCount,
    };
    const score = evaluateHand(hand);
    if (!best || score.final > best.final || (score.final === best.final && score.base > best.base)) {
      best = { ...score, composition: { melds, wait } };
    }
  }
  return best;
}

export { isFlower };
