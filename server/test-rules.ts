// 规则引擎单元测试：对照用户定义的 9 条规则逐条验证
import { buildDeck } from '../shared/src/tiles.ts';
import { enumerateCompositions, classifyWait } from '../shared/src/structure.ts';
import { meldHuTou, scoreWin, scoreUnwon, ceilTo10, isSpecialTile } from '../shared/src/scoring.ts';
import { settle } from '../shared/src/settlement.ts';
import { isExhaustiveDraw } from '../shared/src/flow.ts';
import type { Tile } from '../shared/src/tiles.ts';

let nid = 1;
const T = (s: Tile['suit'], r: number, n = 1): Tile[] =>
  Array.from({ length: n }, () => ({ id: nid++, suit: s, rank: r }));

let passed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`✓ ${label} = ${a}`);
  } else {
    console.error(`✗ ${label}: 期望 ${e}，实际 ${a}`);
    process.exitCode = 1;
  }
}

// ---- 牌堆 ----
eq(buildDeck(true).length, 144, '含花牌 144 张');
eq(buildDeck(false).length, 136, '不含花牌 136 张');

// ---- 特殊/普通判定 ----
eq(isSpecialTile(T('m', 1)[0]), true, '1万是特殊牌');
eq(isSpecialTile(T('m', 9)[0]), true, '9万是特殊牌');
eq(isSpecialTile(T('z', 5)[0]), true, '中是特殊牌');
eq(isSpecialTile(T('m', 5)[0]), false, '5万是普通牌');
eq(isSpecialTile(T('m', 2)[0]), false, '2万是普通牌');

// ---- 面子胡头（规则 3）----
eq(meldHuTou({ kind: 'peng', tiles: T('m', 5) }), 2, '普通碰 2 胡');
eq(meldHuTou({ kind: 'peng', tiles: T('m', 1) }), 4, '特殊碰 4 胡');
eq(meldHuTou({ kind: 'peng', tiles: T('z', 5) }), 4, '三元碰 4 胡');
eq(meldHuTou({ kind: 'anke', tiles: T('m', 5) }), 4, '普通暗刻 4 胡');
eq(meldHuTou({ kind: 'anke', tiles: T('s', 9) }), 8, '特殊暗刻 8 胡');
eq(meldHuTou({ kind: 'minggang', tiles: T('m', 5, 4) }), 8, '普通杠 8 胡');
eq(meldHuTou({ kind: 'minggang', tiles: T('p', 1, 4) }), 16, '特殊杠 16 胡');
eq(meldHuTou({ kind: 'angang', tiles: T('m', 5, 4) }), 16, '普通暗杠 16 胡');
eq(meldHuTou({ kind: 'angang', tiles: T('z', 1, 4) }), 32, '特殊暗杠 32 胡');
eq(ceilTo10(32), 40, '32 向上取整为 40');

// ---- 分解与听口 ----
const compHand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 1), ...T('p', 2), ...T('p', 3), ...T('z', 1, 2)];
eq(compHand.length, 14, '测试手牌 14 张');
const comps = enumerateCompositions(compHand);
eq(comps.length, 1, '分解方案数 = 1');
eq(classifyWait(comps[0], compHand[0]), 'normal', '顺子端张不算坎边');

// 边张：123 胡 3
const bian = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 1), ...T('p', 2), ...T('p', 3), ...T('z', 2, 2)];
const bianComp = enumerateCompositions(bian)[0];
eq(classifyWait(bianComp, bian[2]), 'bianzhang', '123 胡 3 是边张');
// 坎张：234 胡 3
const kan = [...T('m', 2), ...T('m', 3), ...T('m', 4), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 1), ...T('p', 2), ...T('p', 3), ...T('z', 2, 2)];
const kanComp = enumerateCompositions(kan)[0];
eq(classifyWait(kanComp, kan[1]), 'kanzhang', '234 胡 3 是坎张');
// 对碰：555m 胡
const dp = [...T('m', 5, 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('z', 1, 3), ...T('z', 5, 2)];
eq(dp.length, 14, '对碰测试 14 张');
const dpComp = enumerateCompositions(dp)[0];
eq(classifyWait(dpComp, dp[0]), 'duipeng', '刻子成胡是对碰');

// ---- 整手计分 ----
// 平胡荣胡：123m 456s 789p + 555p + 77z，胡 5p，闲家
{
  const hand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 5, 3), ...T('z', 7, 2)];
  const winTile = hand.find((t) => t.suit === 'p' && t.rank === 5)!;
  const r = scoreWin({ closed14: hand, exposed: [], flowers: [], winTileId: winTile.id, method: 'rong', seat: 1 })!;
  eq(r.base, 34, '平胡荣胡：30底 + 碰2 + 将对白白2 = 34');
  eq(r.final, 40, '32 取整 → 40 胡');
}
// 自摸加 2
{
  const hand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 5, 3), ...T('z', 7, 2)];
  const winTile = hand.find((t) => t.suit === 'p' && t.rank === 5)!;
  const r = scoreWin({ closed14: hand, exposed: [], flowers: [], winTileId: winTile.id, method: 'zimo', seat: 1 })!;
  eq(r.base, 38, '自摸：30 + 自摸底4 + 自摸2 + 将对白白2 = 38');
}
// 坎张 +2
{
  const hand = [...T('m', 2), ...T('m', 3), ...T('m', 4), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 1), ...T('p', 2), ...T('p', 3), ...T('z', 7, 2)];
  const winTile = hand.find((t) => t.suit === 'm' && t.rank === 3)!;
  const r = scoreWin({ closed14: hand, exposed: [], flowers: [], winTileId: winTile.id, method: 'rong', seat: 1 })!;
  eq(r.base, 34, '坎张荣胡：30 + 坎张2 + 将对白白2 = 34');
}
// 对对胡 + 清一色 → 3 台封顶，300 封顶
{
  const hand = [...T('m', 1, 3), ...T('m', 2, 3), ...T('m', 3, 3), ...T('m', 7, 3), ...T('m', 9, 2)];
  const winTile = hand.find((t) => t.rank === 9)!;
  const r = scoreWin({ closed14: hand, exposed: [], flowers: [], winTileId: winTile.id, method: 'zimo', seat: 1 })!;
  eq(r.tai, 3, '清一色3台（封顶3）');
  eq(r.base, 52, '底30 + 8+4+4+4 暗刻 + 自摸2 = 52');
  eq(r.final, 300, '超过 300 封顶');
}
// 花牌胡头与非胡牌者（规则 3、5）
{
  eq(scoreUnwon([], [T('f', 1)[0], T('f', 5)[0]]), 8, '两张花 = 8 胡');
  const taiScore = scoreUnwon([], [T('f', 1)[0], T('f', 5)[0]], true, 0); // 春+梅都是东家花
  eq(taiScore, 40, '两张自己的花 = 2 台 → 8×4=32 → 取整 40');
}

// 暗刻也算台（已确认）：南家暗刻三元"中"，自摸成刻
{
  const hand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('z', 5, 3), ...T('z', 2, 2)];
  const winTile = hand.find((t) => t.suit === 'z' && t.rank === 5)!;
  const r = scoreWin({ closed14: hand, exposed: [], flowers: [], winTileId: winTile.id, method: 'zimo', seat: 1 })!;
  eq(r.base, 42, '暗刻中自摸：30 + 8 + 自摸2 + 将对南南2 = 42');
  eq(r.tai, 1, '三元暗刻算 1 台');
  eq(r.final, 90, '42×2=84 → 取整 90');
}
// 三元荣胡算碰（听牌对碰，荣胡算碰牌）：南家荣胡"中"
{
  const hand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('z', 5, 3), ...T('z', 2, 2)];
  const winTile = hand.find((t) => t.suit === 'z' && t.rank === 5)!;
  const r = scoreWin({ closed14: hand, exposed: [], flowers: [], winTileId: winTile.id, method: 'rong', seat: 1 })!;
  eq(r.base, 36, '荣胡中算碰：30 + 特殊碰4 + 将对南南2 = 36');
  eq(r.tai, 1, '三元碰算 1 台');
  eq(r.final, 80, '36×2=72 → 取整 80');
}
// 自风暗杠也算台：东家暗杠"东"
{
  const hand = [...T('m', 1), ...T('m', 2), ...T('m', 3), ...T('s', 4), ...T('s', 5), ...T('s', 6), ...T('p', 7), ...T('p', 8), ...T('p', 9), ...T('p', 5, 3), ...T('z', 7, 2)];
  const winTile = hand.find((t) => t.suit === 'p' && t.rank === 5)!;
  const r = scoreWin({
    closed14: hand,
    exposed: [{ kind: 'angang', tiles: T('z', 1, 4) }],
    flowers: [],
    winTileId: winTile.id,
    method: 'rong',
    seat: 0,
  })!;
  eq(r.base, 66, '暗杠东(特殊)：30 + 32 + 碰2 + 将对白白2 = 66');
  eq(r.tai, 1, '自风暗杠算 1 台');
  eq(r.final, 140, '66×2=132 → 取整 140');
}

// ---- 结算（规则 8、9）----
{
  // 自摸：胡家 300，三家各付 30
  const r = settle(
    [
      { seat: 0, zhuang: true, huTou: 300 },
      { seat: 1, zhuang: false, huTou: 100 },
      { seat: 2, zhuang: false, huTou: 40 },
      { seat: 3, zhuang: false, huTou: 40 },
    ],
    0,
    null,
    { rongPay: 'winner', losersWithTai: false }
  );
  eq(r.net[0], 90, '自摸收 30×3 = 90');
  // 闲家之间：100 vs 40 → 60/20=3；40 vs 40 → 0
  eq(r.net[1], -30 + 3 + 3, '闲1: -30 + 3 + 3');
  eq(r.net[2], -30 - 3, '闲2: -30 - 3');
  eq(r.net.reduce((a, b) => a + b, 0), 0, '总和为零');
}
{
  // 荣胡：闲家1 胡 300，点炮者闲2 付 30，其余各付 15
  const r = settle(
    [
      { seat: 0, zhuang: true, huTou: 40 },
      { seat: 1, zhuang: false, huTou: 300 },
      { seat: 2, zhuang: false, huTou: 100 },
      { seat: 3, zhuang: false, huTou: 40 },
    ],
    1,
    2,
    { rongPay: 'winner', losersWithTai: false }
  );
  eq(r.net[1], 30 + 15 + 15, '荣胡收 30 + 15×2 = 60');
  eq(r.net[2], -30 + 6 + 3, '点炮者: -30 炮 + 6/3 胡头差');
  // 非胡者：庄40 vs 闲2 100（庄闲差 60/10=6，庄付）；庄 vs 闲3 40 差0；闲2 vs 闲3 差60/20=3
  eq(r.net[0], -15 - 6, '庄: -15 连累 - 6 胡头差');
  eq(r.net[3], -15 - 3, '闲3: -15 连累 - 3 胡头差');
  eq(r.net.reduce((a, b) => a + b, 0), 0, '总和为零');
}

// ---- 流局判定（规则 7）----
eq(isExhaustiveDraw(18, 0), true, '剩 18 张（9 跺）流局');
eq(isExhaustiveDraw(20, 0), false, '剩 20 张无杠不流局');
eq(isExhaustiveDraw(20, 1), true, '剩 20 张有 1 杠流局');
eq(isExhaustiveDraw(24, 3), true, '剩 24 张有 3 杠流局');

// 带台数的非胡牌者结算（已确认）
{
  // 庄家自摸 300；闲1 三元碰 4胡×2台=8→10；闲2 自己花两张 8胡×2台=32→40；闲3 无花无杠 0
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
  eq(r.net[0], 90, '自摸收 30×3 = 90');
  // 闲家两两：10v40→30/20 向上取整 2；10v0→10/20 向上取整 1；40v0→2
  eq(r.net[1], -30 - 2 + 1, '闲1: -30 -2(付闲2) +1(收闲3)');
  eq(r.net[2], -30 + 2 + 2, '闲2: -30 +2(收闲1) +2(收闲3)');
  eq(r.net[3], -30 - 1 - 2, '闲3: -30 -1(付闲1) -2(付闲2)');
  eq(r.net.reduce((a, b) => a + b, 0), 0, '总和为零');
}

console.log(`\n共 ${passed} 项断言通过`);
process.exit(process.exitCode ?? 0);
