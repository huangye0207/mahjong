// 点数结算（规则 8、9）
import type { MeldScore } from './scoring.ts';

export interface Standing {
  seat: number;
  zhuang: boolean;
  huTou: number; // 最终胡头（含台数倍数、300 封顶、整 10）
}

export interface SettleOptions {
  /** 点炮者付多少：'winner' = 胡牌者胡头/10（已确认）；'discarder' = 点炮者胡头/10 */
  rongPay?: 'winner' | 'discarder';
  /** 非胡牌者的胡头是否含台数乘倍（已确认：带台数） */
  losersWithTai?: boolean;
}

export const DEFAULT_SETTLE_OPTIONS: Required<SettleOptions> = {
  rongPay: 'winner',
  losersWithTai: true,
};

export interface SettleResult {
  /** net[i] = 座位 i 净得失点数 */
  net: number[];
  detail: string[];
}

function huTouToPoints(huTou: number): number {
  return Math.floor(huTou / 10);
}

/**
 * 结算一盘。
 * @param standings 四家胡头（胡牌者放 winnerSeat）
 * @param winnerSeat 胡牌者座位；null = 流局（只算非胡牌者之间）
 * @param discarderSeat 点炮者座位（荣胡时必填）
 */
export function settle(
  standings: Standing[],
  winnerSeat: number | null,
  discarderSeat: number | null,
  opts: SettleOptions = {}
): SettleResult {
  const { rongPay, losersWithTai } = { ...DEFAULT_SETTLE_OPTIONS, ...opts };
  void losersWithTai; // 胡头由调用方按是否带台数算好后传入 standings
  const n = standings.length;
  const net = new Array<number>(n).fill(0);
  const detail: string[] = [];
  const pay = (from: number, to: number, points: number, why: string) => {
    if (points <= 0 || from === to) return;
    net[from] -= points;
    net[to] += points;
    detail.push(`座位${from + 1} → 座位${to + 1}: ${points} 点（${why}）`);
  };

  const others = standings.filter((s) => s.seat !== winnerSeat);

  if (winnerSeat !== null) {
    const w = standings.find((s) => s.seat === winnerSeat)!;
    if (discarderSeat !== null) {
      // 荣胡：点炮者付（胡头/10），其他两家付一半（向上取整）
      const amount = huTouToPoints(rongPay === 'winner' ? w.huTou : standings[discarderSeat].huTou);
      pay(discarderSeat, winnerSeat, amount, '点炮');
      for (const s of others) {
        if (s.seat === discarderSeat) continue;
        pay(s.seat, winnerSeat, Math.ceil(amount / 2), '连累');
      }
    } else {
      // 自摸：三家各付胡头/10
      for (const s of others) {
        pay(s.seat, winnerSeat, huTouToPoints(w.huTou), '自摸');
      }
    }
  }

  // 非胡牌者之间（规则 9；若流局则四家两两结算）
  const pool = winnerSeat === null ? standings : others;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i];
      const b = pool[j];
      const diff = Math.abs(a.huTou - b.huTou);
      if (diff === 0) continue;
      const loser = a.huTou < b.huTou ? a : b;
      const winner = a.huTou < b.huTou ? b : a;
      const zhuangXian = a.zhuang !== b.zhuang;
      const points = zhuangXian ? Math.floor(diff / 10) : Math.ceil(diff / 20);
      pay(loser.seat, winner.seat, points, zhuangXian ? '庄闲胡头差/10' : '闲家胡头差/20');
    }
  }

  return { net, detail };
}

export type { MeldScore };
