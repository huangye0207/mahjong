// 生成牌型核验样例：程序计算 + 输出 Markdown 供人工核验
import { scoreWin, scoreUnwon } from '../shared/src/scoring.ts';
import { settle } from '../shared/src/settlement.ts';
import { WAIT_NAMES } from '../shared/src/structure.ts';
import type { Tile } from '../shared/src/tiles.ts';
import { writeFileSync } from 'fs';

let nid = 1;
const T = (s: Tile['suit'], r: number, n = 1): Tile[] =>
  Array.from({ length: n }, () => ({ id: nid++, suit: s, rank: r }));
const names = (tiles: Tile[]) => tiles.map((t) => (t.suit === 'z' ? '东南西北中发白'[t.rank - 1] : t.suit === 'f' ? '春夏秋冬梅兰竹菊'[t.rank - 1] : `${t.rank}${'万条筒'['msp'.indexOf(t.suit)]}`)).join(' ');

const out: string[] = [];
function caseShow(title: string, tiles: Tile[], flowers: Tile[], winDesc: string, r: NonNullable<ReturnType<typeof scoreWin>>) {
  const line = `### ${title}\n\n牌：${names(tiles)}${flowers.length ? `　花：${names(flowers)}` : ''}（${winDesc}）\n\n- 基础胡头：${r.base}（${r.composition.melds.length ? '计分面子: ' + r.composition.melds.map((m) => `${m.kind}${names(m.tiles.slice(0, 1))}`).join('、') : '无计分面子'}，听口：${WAIT_NAMES[r.composition.wait]}）\n- 台数：${r.tai} → 倍率 ×${r.multiplier}\n- 最终胡头：min(300, ${r.base}×${r.multiplier} 取整) = **${r.final}**\n`;
  out.push(line);
  console.log(`\n=== ${title} ===\n${line}`);
}

// 1. 平胡荣胡
{
  const hand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 5, 3), ...T('z', 7, 2)];
  const win = hand.find((t) => t.suit === 'p' && t.rank === 5)!;
  caseShow('1. 平胡荣胡（南家，无台）', hand, [], '荣胡 5 筒', scoreWin({ closed14: hand, exposed: [], flowers: [], winTileId: win.id, method: 'rong', seat: 1 })!);
}
// 2. 平胡自摸
{
  const hand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 5, 3), ...T('z', 7, 2)];
  const win = hand.find((t) => t.suit === 'p' && t.rank === 5)!;
  caseShow('2. 平胡自摸（南家，无台）', hand, [], '自摸 5 筒', scoreWin({ closed14: hand, exposed: [], flowers: [], winTileId: win.id, method: 'zimo', seat: 1 })!);
}
// 3. 坎张荣胡
{
  const hand = [...T('m', 2), ...T('m', 3), ...T('m', 4), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 1), ...T('p', 2), ...T('p', 3), ...T('z', 7, 2)];
  const win = hand.find((t) => t.suit === 'm' && t.rank === 3)!;
  caseShow('3. 坎张荣胡（南家）', hand, [], '荣胡 3 万（坎张）', scoreWin({ closed14: hand, exposed: [], flowers: [], winTileId: win.id, method: 'rong', seat: 1 })!);
}
// 4. 边张荣胡
{
  const hand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 1), ...T('p', 2), ...T('p', 3), ...T('z', 2, 2)];
  const win = hand.find((t) => t.suit === 'm' && t.rank === 3)!;
  caseShow('4. 边张荣胡（南家）', hand, [], '荣胡 3 万（边张 123）', scoreWin({ closed14: hand, exposed: [], flowers: [], winTileId: win.id, method: 'rong', seat: 1 })!);
}
// 5. 对碰荣胡（特殊牌 9 万）
{
  const hand = [...T('m', 9, 3), ...T('s', 1), ...T('s', 2), ...T('s', 3), ...T('p', 4), ...T('p', 5), ...T('p', 6), ...T('m', 2), ...T('m', 3), ...T('m', 4), ...T('z', 6, 2)];
  const win = hand.find((t) => t.suit === 'm' && t.rank === 9)!;
  caseShow('5. 对碰荣胡·特殊（西家）', hand, [], '荣胡 9 万（对碰）', scoreWin({ closed14: hand, exposed: [], flowers: [], winTileId: win.id, method: 'rong', seat: 2 })!);
}
// 6. 自风碰 + 平胡（东家，东碰副露）
{
  const hand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 5, 3), ...T('z', 7, 2)];
  const win = hand.find((t) => t.suit === 'p' && t.rank === 5)!;
  caseShow('6. 自风碰 1 台（东家，副露东碰）', hand, [], '荣胡 5 筒', scoreWin({ closed14: hand, exposed: [{ kind: 'peng', tiles: T('z', 1, 3) }], flowers: [], winTileId: win.id, method: 'rong', seat: 0 })!);
}
// 7. 三元暗刻算台（南家暗刻中）
{
  const hand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('z', 5, 3), ...T('z', 2, 2)];
  const win = hand.find((t) => t.suit === 'z' && t.rank === 5)!;
  caseShow('7. 三元暗刻算台（南家）', hand, [], '荣胡 中（暗刻）', scoreWin({ closed14: hand, exposed: [], flowers: [], winTileId: win.id, method: 'rong', seat: 1 })!);
}
// 8. 自风暗杠算台（东家暗杠东）
{
  const hand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 5, 3), ...T('z', 7, 2)];
  const win = hand.find((t) => t.suit === 'p' && t.rank === 5)!;
  caseShow('8. 自风暗杠算台（东家）', hand, [], '荣胡 5 筒', scoreWin({ closed14: hand, exposed: [{ kind: 'angang', tiles: T('z', 1, 4) }], flowers: [], winTileId: win.id, method: 'rong', seat: 0 })!);
}
// 9. 自己的花两台（东家：春+梅）
{
  const hand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 5, 3), ...T('z', 7, 2)];
  const win = hand.find((t) => t.suit === 'p' && t.rank === 5)!;
  caseShow('9. 自己的花 2 台（东家：春+梅）', hand, [T('f', 1)[0], T('f', 5)[0]], '荣胡 5 筒', scoreWin({ closed14: hand, exposed: [], flowers: [T('f', 1)[0], T('f', 5)[0]], winTileId: win.id, method: 'rong', seat: 0 })!);
}
// 10. 春夏秋冬集齐（西家）
{
  const hand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 5, 3), ...T('z', 7, 2)];
  const win = hand.find((t) => t.suit === 'p' && t.rank === 5)!;
  const fl = [T('f', 1)[0], T('f', 2)[0], T('f', 3)[0], T('f', 4)[0]];
  caseShow('10. 春夏秋冬集齐+自己的花（西家，秋是自己的）', hand, fl, '荣胡 5 筒', scoreWin({ closed14: hand, exposed: [], flowers: fl, winTileId: win.id, method: 'rong', seat: 2 })!);
}
// 11. 清一色对对胡
{
  const hand = [...T('m', 1, 3), ...T('m', 2, 3), ...T('m', 3, 3), ...T('m', 7, 3), ...T('m', 9, 2)];
  const win = hand.find((t) => t.rank === 9)!;
  caseShow('11. 清一色 + 对对胡（北家自摸）', hand, [], '自摸 9 万', scoreWin({ closed14: hand, exposed: [], flowers: [], winTileId: win.id, method: 'zimo', seat: 3 })!);
}
// 12. 混一色带顺子（西家，荣胡 东）
{
  const hand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('m', 4), ...T('m', 5), ...T('m', 6), ...T('m', 7), ...T('m', 8), ...T('m', 9), ...T('z', 1, 3), ...T('z', 5, 2)];
  const win = hand.find((t) => t.suit === 'z' && t.rank === 1)!;
  caseShow('12. 混一色（西家）', hand, [], '荣胡 东', scoreWin({ closed14: hand, exposed: [], flowers: [], winTileId: win.id, method: 'rong', seat: 2 })!);
}

// 13. 非胡牌者胡头（带台数）
{
  const h1 = scoreUnwon([{ kind: 'peng', tiles: T('z', 5, 3) }], [], true, 1); // 南家三元碰
  const h2 = scoreUnwon([], [T('f', 3)[0], T('f', 7)[0]], true, 2); // 西家秋+竹
  const line = `### 13. 非胡牌者胡头（带台数）\n\n- 南家碰"中"：4 胡 × 2 台 = 8 → 取整 **${h1}**\n- 西家花"秋+竹"（都是自己的花）：8 胡 × 2 台 = 32 → **${h2}**\n`;
  out.push(line);
  console.log(line);
}

// 15. 将对为三元/自风 +2 胡（新规则）
{
  const handEast = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 5, 3), ...T('z', 1, 2)];
  const winE = handEast.find((t) => t.suit === 'p' && t.rank === 5)!;
  const rE = scoreWin({ closed14: handEast, exposed: [], flowers: [], winTileId: winE.id, method: 'rong', seat: 0 })!;
  const handSouth = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 5, 3), ...T('z', 5, 2)];
  const winS = handSouth.find((t) => t.suit === 'p' && t.rank === 5)!;
  const rS = scoreWin({ closed14: handSouth, exposed: [], flowers: [], winTileId: winS.id, method: 'rong', seat: 1 })!;
  const line = `### 15. 将对 2 胡（新规则）\n\n- 东家将对"东东"（自风）平胡荣胡：30 + 碰2 + 将对2 = **${rE.base}** → **${rE.final}**\n- 南家将对"中中"（三元）平胡荣胡：30 + 碰2 + 将对2 = **${rS.base}** → **${rS.final}**\n- 注意：将对只加 2 胡，不加台（台仍只看碰/杠/花/牌型）\n`;
  out.push(line);
  console.log(line);
}

// 14. 结算示例
{
  const r = settle(
    [
      { seat: 0, zhuang: true, huTou: 300 },
      { seat: 1, zhuang: false, huTou: 10 },
      { seat: 2, zhuang: false, huTou: 40 },
      { seat: 3, zhuang: false, huTou: 0 },
    ],
    0,
    null
  );
  const line = `### 14. 结算示例（庄家自摸 300，闲家胡头 10 / 40 / 0）\n\n- 三家各付 300/10 = 30 点给庄家\n- 闲家之间：10v40 差 30/20 向上取整 2 点；10v0 差 10/20 向上取整 1 点；40v0 差 40/20 = 2 点\n- 净结果：庄 **${r.net[0]}**，闲1 **${r.net[1]}**，闲2 **${r.net[2]}**，闲3 **${r.net[3]}**（合计 ${r.net.reduce((a, b) => a + b, 0)}）\n\n明细：\n${r.detail.map((d) => `- ${d}`).join('\n')}\n`;
  out.push(line);
  console.log(line);
}

const md = `# 牌型核验样例\n\n以下结果由计分引擎自动生成，供人工核验规则理解是否一致。\n\n${out.join('\n')}\n`;
writeFileSync(new URL('../牌型核验.md', import.meta.url), md);
console.log('\n已写入 牌型核验.md');
