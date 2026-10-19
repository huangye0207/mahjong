// 麻将牌基础定义
// 万(m)=1-9, 条(s)=1-9, 筒(p)=1-9, 字(z)=1-7（东南西北中发白）, 花(f)=1-8（春夏秋冬梅兰竹菊）
export type Suit = 'm' | 's' | 'p' | 'z' | 'f';

export interface Tile {
  id: number; // 唯一 id，同一物理牌 id 不同
  suit: Suit;
  rank: number; // 数牌 1-9，字牌 1-7，花牌 1-8
}

export const SUIT_NAMES: Record<Suit, string> = {
  m: '万',
  s: '条',
  p: '筒',
  z: '字',
  f: '花',
};

export const HONOR_NAMES = ['东', '南', '西', '北', '中', '发', '白'];
export const FLOWER_NAMES = ['春', '夏', '秋', '冬', '梅', '兰', '竹', '菊'];

/** 座位 → 自己花牌的 rank（春/梅属东，夏/兰属南，秋/竹属西，冬/菊属北） */
export function ownFlowerRanks(seat: number): number[] {
  return [seat + 1, seat + 5];
}

export function tileKey(t: Tile): string {
  return `${t.suit}${t.rank}`;
}

export function tileLabel(t: Tile): string {
  if (t.suit === 'z') return HONOR_NAMES[t.rank - 1];
  if (t.suit === 'f') return FLOWER_NAMES[t.rank - 1];
  return `${t.rank}${SUIT_NAMES[t.suit]}`;
}

export function isHonor(t: Tile): boolean {
  return t.suit === 'z';
}

export function isFlower(t: Tile): boolean {
  return t.suit === 'f';
}

/** 生成 144 张牌（含 8 张花牌），includeFlowers=false 时为 136 张标准牌 */
export function buildDeck(includeFlowers = true): Tile[] {
  const deck: Tile[] = [];
  let id = 0;
  for (const suit of ['m', 's', 'p'] as Suit[]) {
    for (let rank = 1; rank <= 9; rank++) {
      for (let i = 0; i < 4; i++) deck.push({ id: id++, suit, rank });
    }
  }
  for (let rank = 1; rank <= 7; rank++) {
    for (let i = 0; i < 4; i++) deck.push({ id: id++, suit: 'z', rank });
  }
  if (includeFlowers) {
    for (let rank = 1; rank <= 8; rank++) {
      deck.push({ id: id++, suit: 'f', rank });
    }
  }
  return deck;
}

/** Fisher-Yates 洗牌，返回新数组 */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
