// 引擎级确定性测试：注入牌序，验证 荣胡/自摸 → 结算 完整链路
import { GameEngine } from './src/game.ts';
import { buildDeck } from '../shared/src/index.ts';
import type { Tile } from '../shared/src/index.ts';

let passed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}: 期望 ${e}，实际 ${a}`);
    process.exitCode = 1;
  }
}

// 从完整牌堆中按 key 取牌，构建自定义牌序
function makeRiggedDeck(order: string[]): Tile[] {
  const pool = buildDeck(true);
  const deck: Tile[] = [];
  for (const key of order) {
    const i = pool.findIndex((t) => `${t.suit}${t.rank}` === key);
    if (i < 0) throw new Error(`牌不够: ${key}`);
    deck.push(pool.splice(i, 1)[0]);
  }
  // 剩余补到牌墙后面（避免真实牌局中抽出意外花牌干扰断言，全部置底即可）
  deck.push(...pool);
  return deck;
}

function fakePlayers(n: number) {
  const msgs: unknown[][] = Array.from({ length: n }, () => []);
  const players = Array.from({ length: n }, (_, seat) => ({
    id: `p${seat}`,
    name: `玩家${seat}`,
    seat,
    send: (m: unknown) => msgs[seat].push(m),
  }));
  return { players, msgs };
}

const last = <T>(arr: T[]) => arr[arr.length - 1] as T;

// ---------- 局 1：庄家（座位0）荣胡"白"（对碰） ----------
{
  // 座位0 起手：123456789万 + 东东 + 白白，第 14 张是 5 条（打出）
  // 座位1 起手：123456789条 + 白白 + 1筒2筒；墙头第一张 3 筒（摸后打白）
  const deck = makeRiggedDeck([
    'm1','m2','m3','m4','m5','m6','m7','m8','m9','z1','z1','z7','z7', // seat0 (13)
    's1','s2','s3','s4','s5','s6','s7','s8','s9','z7','z7','p1','p2', // seat1 (13)
    's5', // 庄家第 14 张
    'p3', // 牌墙第一张（座位1摸）
  ]);
  const { players, msgs } = fakePlayers(2);
  const eng = new GameEngine(players, 'TEST', { deck, dealer: 0 });
  const hand0 = (last(msgs[0].filter((m: any) => m.type === 'gameStarted')) as any).yourHand;
  const extra = hand0.find((t: Tile) => t.suit === 's' && t.rank === 5)!;
  eng.discard('p0', extra.id);

  // 座位1 对 5 条有吃牌权，先过牌
  const offer1 = last(msgs[1].filter((m: any) => m.type === 'claimOffer')) as any;
  if (offer1) {
    eq(offer1.options.includes('chi'), true, '局1: 座位1 可选择吃');
    eng.respond('p1', null);
  }

  // 座位1 应收到 yourTurn（摸到 3 筒），打出一张白
  const hand1 = (last(msgs[1].filter((m: any) => m.type === 'handUpdate')) as any).yourHand;
  const bai = hand1.find((t: Tile) => t.suit === 'z' && t.rank === 7)!;
  eng.discard('p1', bai.id);

  // 座位0 应收到 claimOffer（可胡）
  const offer = last(msgs[0].filter((m: any) => m.type === 'claimOffer')) as any;
  eq(offer.options.includes('hu'), true, '局1: 座位0 获得胡牌选择');

  eng.claim('p0', 'hu', offer.tile.id);
  const over = last(msgs[0].filter((m: any) => m.type === 'gameOver')) as any;
  eq(over.method, 'rong', '局1: 荣胡结束');
  eq(over.winnerSeat, 0, '局1: 座位0 获胜');
  // 算式：30 + 白碰(特殊)4 + 将对东东(自风)2 = 36；台：三元碰1 + 混一色2 = 3 台 ×8 = 288 → 290
  eq(over.standings[0].huTou, 290, '局1: 胡头 290');
  eq(over.standings[0].net, 29, '局1: 点炮者付 290/10=29');
  eq(over.standings[1].net, -29, '局1: 点炮者 -29');
  eq(over.nextDealer, 0, '局1: 连庄（胡者坐庄）');
}

// ---------- 局 2：座位1 自摸"东" ----------
{
  // 座位0（庄家）：123456789万东东白，第 14 张也是白（打出）
  // 座位1：123456789条东东55筒，摸墙头"东"自摸
  const deck = makeRiggedDeck([
    'm1','m2','m3','m4','m5','m6','m7','m8','m9','z1','z7','z7','z2', // seat0 (13)
    's1','s2','s3','s4','s5','s6','s7','s8','s9','z1','z1','p5','p5', // seat1 (13)
    'z7', // 庄家第 14 张（白，打出）
    'z1', // 牌墙第一张（座位1摸，东，第 4 张东）
  ]);
  const { players, msgs } = fakePlayers(2);
  const eng = new GameEngine(players, 'TEST', { deck, dealer: 0 });
  // 庄家打出多余的白
  const hand0 = (last(msgs[0].filter((m: any) => m.type === 'gameStarted')) as any).yourHand;
  const bai = hand0.find((t: Tile) => t.suit === 'z' && t.rank === 7)!;
  eng.discard('p0', bai.id);
  // 座位1 不应有选择权（无吃碰胡），直接摸牌
  const turn = last(msgs[1].filter((m: any) => m.type === 'yourTurn')) as any;
  eq(turn.canZimo, true, '局2: 座位1 摸到东可自摸');
  eq(turn.drawn.suit === 'z' && turn.drawn.rank === 1, true, '局2: 摸到东');
  eng.claim('p1', 'hu');
  const over = last(msgs[1].filter((m: any) => m.type === 'gameOver')) as any;
  eq(over.method, 'zimo', '局2: 自摸结束');
  eq(over.winnerSeat, 1, '局2: 座位1 获胜');
  // 算式：30 + 暗刻东(特殊)8 + 自摸2 = 40，无台 → 40
  eq(over.standings[1].huTou, 40, '局2: 胡头 40');
  eq(over.standings[1].net, 4, '局2: 庄家付 40/10=4');
  eq(over.standings[0].net, -4, '局2: 庄家 -4');
  eq(over.nextDealer, 1, '局2: 连庄（胡者坐庄）');
}

console.log(`\n共 ${passed} 项断言通过`);
process.exit(process.exitCode ?? 0);
