// 牌局流程常量与判定（规则 7：流局）
export const BASE_WALL_REMAINING = 18; // 无杠时流局剩余 18 张（9 跺）
export const GANG_EXTRA_TILES = 2; // 每有一个杠，流局剩余数 +1 跺（2 张）

/** 是否流局：牌墙剩余 <= 18 + 2×杠数 */
export function isExhaustiveDraw(wallCount: number, gangCount: number): boolean {
  return wallCount <= BASE_WALL_REMAINING + GANG_EXTRA_TILES * gangCount;
}
