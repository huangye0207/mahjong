// 回合引擎：驱动摸打、吃碰杠胡、见逃、抢杠、连庄与流局
import {
  buildDeck,
  shuffle,
  isFlower,
  canPeng,
  canGang,
  canChi,
  canZimo,
  canHuRong,
  anGangCandidates,
  jiaGangCandidates,
  scoreWin,
  scoreUnwon,
  settle,
  isExhaustiveDraw,
} from '../../shared/src/index.ts';
import type { Tile } from '../../shared/src/index.ts';
import type { Meld } from '../../shared/src/moves.ts';
import type { ClaimAction } from '../../shared/src/protocol.ts';
import type { MeldScore } from '../../shared/src/scoring.ts';

export interface EnginePlayer {
  id: string;
  name: string;
  seat: number;
  send: (msg: unknown) => void;
}

interface Claim {
  action: ClaimAction;
  chiTiles?: [Tile, Tile];
}

const HAND_SIZE = 13;

export class GameEngine {
  private players: EnginePlayer[];
  private n: number;
  private dealer: number;
  private wall: Tile[];
  private hands: Tile[][];
  private flowers: Tile[][];
  private melds: Meld[][];
  private rivers: Tile[][];
  private turn: number;
  private phase: 'await-discard' | 'await-claims' | 'over' = 'await-discard';
  private pending: { seat: number; tile: Tile; robbed: boolean } | null = null;
  private offered = new Map<number, { options: ClaimAction[]; chiChoices: [Tile, Tile][] }>();
  private claims = new Map<number, Claim>();
  private responded = new Set<number>();
  private claimTimer: ReturnType<typeof setTimeout> | null = null;
  private passedHu: boolean[];
  private gangCount = 0;
  private lastDrawn: (Tile | null)[];
  private seatOf: Map<string, number>;
  private roomId: string;

  constructor(
    players: EnginePlayer[],
    roomId = '',
    opts: { deck?: Tile[]; dealer?: number } = {}
  ) {
    this.roomId = roomId;
    this.players = [...players].sort((a, b) => a.seat - b.seat);
    this.n = this.players.length;
    this.seatOf = new Map(this.players.map((p) => [p.id, p.seat]));
    this.dealer = opts.dealer ?? Math.floor(Math.random() * this.n);
    this.passedHu = new Array(this.n).fill(false);
    this.lastDrawn = new Array(this.n).fill(null);

    // 发牌 + 庄家 14 张 + 补花（opts.deck 仅供测试注入）
    const deck = opts.deck ?? shuffle(buildDeck(true));
    this.hands = this.players.map((_, i) => deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE));
    this.wall = deck.slice(this.n * HAND_SIZE);
    this.flowers = this.players.map(() => [] as Tile[]);
    this.melds = this.players.map(() => [] as Meld[]);
    this.rivers = this.players.map(() => [] as Tile[]);
    this.hands[this.dealer].push(this.wall.shift()!);
    for (let seat = 0; seat < this.n; seat++) this.replenishFlowers(seat);
    this.turn = this.dealer;

    // 发牌消息
    this.players.forEach((p, seat) => {
      p.send({
        type: 'gameStarted',
        roomId: this.roomId,
        dealer: this.dealer,
        yourSeat: seat,
        yourHand: this.hands[seat],
        yourFlowers: this.flowers[seat],
        flowerCounts: this.flowerCounts(),
        melds: this.melds,
        rivers: this.rivers,
        wallCount: this.wall.length,
        players: this.players.map((q) => ({ id: q.id, name: q.name, seat: q.seat })),
      });
    });
    this.promptDiscard(this.dealer, null);
  }

  // ---------- 工具 ----------
  private broadcast(msg: unknown, exceptSeat?: number) {
    for (const p of this.players) {
      if (p.seat !== exceptSeat) p.send(msg);
    }
  }
  private toSeat(seat: number) {
    return this.players[seat];
  }
  private flowerCounts(): number[] {
    return this.flowers.map((f) => f.length);
  }
  private removeTile(seat: number, tileId: number): Tile | null {
    const i = this.hands[seat].findIndex((t) => t.id === tileId);
    if (i < 0) return null;
    return this.hands[seat].splice(i, 1)[0];
  }
  private removeTilesById(seat: number, ids: number[]): Tile[] | null {
    const tiles: Tile[] = [];
    for (const id of ids) {
      const t = this.removeTile(seat, id);
      if (!t) {
        // 回滚
        this.hands[seat].push(...tiles);
        return null;
      }
      tiles.push(t);
    }
    return tiles;
  }
  /** 补花：手牌中的花移出，从牌墙尾补，循环直到没有花 */
  private replenishFlowers(seat: number) {
    let i = 0;
    while (i < this.hands[seat].length) {
      const t = this.hands[seat][i];
      if (isFlower(t)) {
        this.flowers[seat].push(t);
        this.hands[seat].splice(i, 1);
        const rep = this.wall.pop();
        if (rep) this.hands[seat].push(rep);
      } else {
        i++;
      }
    }
  }
  private sendHand(seat: number) {
    this.toSeat(seat).send({
      type: 'handUpdate',
      yourHand: this.hands[seat],
      yourMelds: this.melds[seat],
      yourFlowers: this.flowers[seat],
      flowerCounts: this.flowerCounts(),
      wallCount: this.wall.length,
    });
  }
  private promptDiscard(seat: number, drawn: Tile | null) {
    this.phase = 'await-discard';
    this.turn = seat;
    const hand = this.hands[seat];
    this.toSeat(seat).send({
      type: 'yourTurn',
      seat,
      drawn,
      canZimo: drawn ? canZimo(hand) : false,
      anGangTiles: anGangCandidates(hand),
      jiaGangTiles: jiaGangCandidates(hand, this.melds[seat]),
      wallCount: this.wall.length,
    });
  }

  // ---------- 出牌 ----------
  discard(playerId: string, tileId: number) {
    const seat = this.seatOf.get(playerId)!;
    if (this.phase !== 'await-discard' || this.turn !== seat) return;
    const tile = this.removeTile(seat, tileId);
    if (!tile) return;
    this.rivers[seat].push(tile);
    this.lastDrawn[seat] = null;
    this.broadcast({ type: 'playerDiscarded', seat, tile, wallCount: this.wall.length });
    this.sendHand(seat);
    this.offerClaims(seat, tile, false);
  }

  // ---------- 吃碰杠胡响应 ----------
  private offerClaims(discarder: number, tile: Tile, robbed: boolean) {
    this.offered.clear();
    this.claims.clear();
    this.responded.clear();
    for (let s = 0; s < this.n; s++) {
      if (s === discarder) continue;
      const hand = this.hands[s];
      const options: ClaimAction[] = [];
      let chiChoices: [Tile, Tile][] = [];
      if (!robbed) {
        if (!this.passedHu[s] && canHuRong(hand, tile)) options.push('hu');
        if (canGang(hand, tile)) options.push('gang');
        if (canPeng(hand, tile)) options.push('peng');
        if ((discarder + 1) % this.n === s) {
          chiChoices = canChi(hand, tile);
          if (chiChoices.length > 0) options.push('chi');
        }
      } else {
        // 抢杠：只能胡
        if (!this.passedHu[s] && canHuRong(hand, tile)) options.push('hu');
      }
      if (options.length > 0) {
        this.offered.set(s, { options, chiChoices });
        this.toSeat(s).send({ type: 'claimOffer', seat: discarder, tile, options, chiChoices });
      }
    }
    if (this.offered.size === 0) {
      if (robbed) {
        // 抢杠无人胡：加杠成立，继续出牌
        this.phase = 'await-discard';
        this.turn = discarder;
        this.promptDiscardTiles();
      } else {
        this.advance((discarder + 1) % this.n);
      }
      return;
    }
    this.phase = 'await-claims';
    this.pending = { seat: discarder, tile, robbed };
    this.claimTimer = setTimeout(() => this.claimTimeout(), 15000);
  }

  /** 加杠成立后提示出牌（补杠后） */
  private promptDiscardTiles() {
    this.toSeat(this.turn).send({
      type: 'yourTurn',
      seat: this.turn,
      drawn: this.lastDrawn[this.turn],
      canZimo: false,
      anGangTiles: [],
      jiaGangTiles: [],
      wallCount: this.wall.length,
    });
  }

  respond(playerId: string, action: ClaimAction | null, tileId?: number, chiTileIds?: [number, number]) {
    if (this.phase !== 'await-claims') return;
    const seat = this.seatOf.get(playerId)!;
    const offer = this.offered.get(seat);
    if (!offer || this.responded.has(seat)) return;
    if (action === null) {
      this.claims.delete(seat);
    } else {
      if (!offer.options.includes(action)) return;
      if (action === 'hu') {
        this.claims.set(seat, { action });
      } else if (action === 'chi') {
        const choice = offer.chiChoices.find(
          (c) => chiTileIds && c[0].id === chiTileIds[0] && c[1].id === chiTileIds[1]
        );
        if (!choice) return;
        this.claims.set(seat, { action, chiTiles: choice });
      } else {
        if (tileId !== this.pending!.tile.id) return;
        this.claims.set(seat, { action });
      }
    }
    this.responded.add(seat);
    if (this.responded.size >= this.offered.size) this.resolveClaims();
  }

  /** 超时：未响应的视为过 */
  private claimTimeout() {
    if (this.phase !== 'await-claims') return;
    this.resolveClaims();
  }

  private resolveClaims() {
    if (this.claimTimer) {
      clearTimeout(this.claimTimer);
      this.claimTimer = null;
    }
    const pending = this.pending!;
    // 优先级：胡 > 杠 > 碰 > 吃；同优先级按与出牌者距离近者优先
    const dist = (s: number) => (s - pending.seat + this.n) % this.n;
    for (const action of ['hu', 'gang', 'peng', 'chi'] as ClaimAction[]) {
      const takers = [...this.claims.entries()].filter(([, c]) => c.action === action);
      if (takers.length === 0) continue;
      takers.sort((a, b) => dist(a[0]) - dist(b[0]));
      const [seat, claim] = takers[0];
      if (action === 'hu') {
        if (claim.action === 'hu') this.winByRong(seat, pending.tile, pending.seat, pending.robbed);
        return;
      }
      this.applyMeldClaim(seat, claim, pending);
      return;
    }
    // 全部过
    if (pending.robbed) {
      this.phase = 'await-discard';
      this.turn = pending.seat;
      this.promptDiscardTiles();
    } else {
      this.advance((pending.seat + 1) % this.n);
    }
  }

  private applyMeldClaim(seat: number, claim: Claim, pending: { seat: number; tile: Tile; robbed: boolean }) {
    const tile = pending.tile;
    // 从出牌者河面移除这张牌
    const river = this.rivers[pending.seat];
    const ri = river.findIndex((t) => t.id === tile.id);
    if (ri >= 0) river.splice(ri, 1);

    if (claim.action === 'peng') {
      const pair = this.hands[seat].filter((t) => t.suit === tile.suit && t.rank === tile.rank).slice(0, 2);
      const removed = this.removeTilesById(seat, pair.map((t) => t.id));
      if (!removed) return;
      this.melds[seat].push({ kind: 'peng', tiles: [...removed, tile] });
    } else if (claim.action === 'gang') {
      const trio = this.hands[seat].filter((t) => t.suit === tile.suit && t.rank === tile.rank).slice(0, 3);
      const removed = this.removeTilesById(seat, trio.map((t) => t.id));
      if (!removed) return;
      this.melds[seat].push({ kind: 'minggang', tiles: [...removed, tile] });
      this.gangCount++;
      this.kongReplacement(seat);
    } else if (claim.action === 'chi' && claim.chiTiles) {
      const removed = this.removeTilesById(seat, claim.chiTiles.map((t) => t.id));
      if (!removed) return;
      this.melds[seat].push({ kind: 'chi', tiles: [...removed, tile] });
    }
    this.broadcast(
      { type: 'claimDone', by: seat, action: claim.action, tile, melds: this.melds, wallCount: this.wall.length },
      seat
    );
    this.toSeat(seat).send({
      type: 'claimDone',
      by: seat,
      action: claim.action as 'peng' | 'gang' | 'chi',
      tile,
      melds: this.melds,
      wallCount: this.wall.length,
    });
    this.sendHand(seat);
    // 杠后有补牌，允许杠上开花（canZimo 按整手判定）
    this.promptDiscard(seat, claim.action === 'gang' ? this.lastDrawn[seat] : null);
  }

  /** 杠后补牌：牌墙尾摸，遇到花继续补 */
  private kongReplacement(seat: number) {
    const rep = this.wall.pop();
    if (!rep) return;
    this.hands[seat].push(rep);
    this.replenishFlowers(seat);
    // 记录补到的最后一张非花牌（用于杠上开花判定与展示）
    this.lastDrawn[seat] = [...this.hands[seat]].reverse().find((t) => !isFlower(t)) ?? null;
  }

  /** 统一入口：自己回合内的胡/杠走 selfAction，否则按吃碰杠胡响应处理 */
  claim(playerId: string, action: ClaimAction, tileId?: number, chiTileIds?: [number, number]) {
    const seat = this.seatOf.get(playerId)!;
    if (
      this.phase === 'await-discard' &&
      this.turn === seat &&
      (action === 'hu' || action === 'gang')
    ) {
      this.selfAction(playerId, action, tileId);
    } else {
      this.respond(playerId, action, tileId, chiTileIds);
    }
  }

  // ---------- 自摸/杠（自己回合内） ----------
  selfAction(playerId: string, action: 'hu' | 'gang', tileId?: number) {
    const seat = this.seatOf.get(playerId)!;
    if (this.phase !== 'await-discard' || this.turn !== seat) return;
    if (action === 'hu') {
      if (!canZimo(this.hands[seat])) return;
      this.winByZimo(seat);
      return;
    }
    // gang：暗杠或加杠
    const tile = this.hands[seat].find((t) => t.id === tileId);
    if (!tile) return;
    const an = anGangCandidates(this.hands[seat]);
    const jia = jiaGangCandidates(this.hands[seat], this.melds[seat]);
    const isAn = an.some((t) => t.id === tileId);
    const isJia = jia.some((t) => t.id === tileId);
    if (!isAn && !isJia) return;

    if (isAn) {
      const four = this.hands[seat].filter((t) => t.suit === tile.suit && t.rank === tile.rank);
      const removed = this.removeTilesById(seat, four.map((t) => t.id));
      if (!removed) return;
      this.melds[seat].push({ kind: 'angang', tiles: removed });
      this.gangCount++;
      this.broadcast({ type: 'claimDone', by: seat, action: 'gang', tile, melds: this.melds, wallCount: this.wall.length }, seat);
      this.toSeat(seat).send({ type: 'claimDone', by: seat, action: 'gang', tile, melds: this.melds, wallCount: this.wall.length });
      this.kongReplacement(seat);
      this.sendHand(seat);
      // 暗杠不可抢，继续出牌
      this.promptDiscard(seat, this.lastDrawn[seat]);
    } else {
      // 加杠：可能被抢杠
      this.removeTile(seat, tileId);
      this.melds[seat].push({ kind: 'jiagang', tiles: [...this.melds[seat].find((m) => m.kind === 'peng' && m.tiles[0].suit === tile.suit && m.tiles[0].rank === tile.rank)!.tiles, tile] });
      this.gangCount++;
      this.kongReplacement(seat);
      this.sendHand(seat);
      this.broadcast({ type: 'claimDone', by: seat, action: 'gang', tile, melds: this.melds, wallCount: this.wall.length }, seat);
      this.toSeat(seat).send({ type: 'claimDone', by: seat, action: 'gang', tile, melds: this.melds, wallCount: this.wall.length });
      this.offerClaims(seat, tile, true);
    }
  }

  // ---------- 回合推进 ----------
  private advance(seat: number) {
    if (this.phase === 'over') return;
    if (isExhaustiveDraw(this.wall.length, this.gangCount)) {
      this.exhaust();
      return;
    }
    // 摸牌（墙头），遇花从墙尾补，补到仍是花则继续补
    let drawn: Tile | null = null;
    while (true) {
      let t = this.wall.shift();
      if (!t) {
        this.exhaust();
        return;
      }
      while (isFlower(t)) {
        this.flowers[seat].push(t);
        t = this.wall.pop()!;
        if (!t) {
          this.exhaust();
          return;
        }
      }
      drawn = t;
      break;
    }
    this.hands[seat].push(drawn!);
    this.lastDrawn[seat] = drawn;
    this.passedHu[seat] = false; // 见逃标记解除
    this.sendHand(seat);
    this.promptDiscard(seat, drawn);
  }

  // ---------- 终局 ----------
  private meldScores(seat: number): MeldScore[] {
    const out: MeldScore[] = [];
    for (const m of this.melds[seat]) {
      if (m.kind === 'chi') continue;
      const kind = m.kind === 'peng' ? 'peng' : m.kind === 'angang' ? 'angang' : 'minggang';
      out.push({ kind, tiles: m.tiles });
    }
    return out;
  }

  private endGame(winnerSeat: number | null, method: 'zimo' | 'rong' | 'robbed' | 'exhaustive', discarder?: number) {
    this.phase = 'over';
    const standings: { seat: number; zhuang: boolean; huTou: number }[] = [];
    let winnerHuTou = 0;
    for (let s = 0; s < this.n; s++) {
      let huTou: number;
      if (s === winnerSeat && winnerSeat !== null) {
        const winTile = method === 'zimo' ? this.lastDrawn[s] : this.pending?.tile ?? null;
        const res = winTile
          ? scoreWin({
              closed14: this.hands[s],
              exposed: this.meldScores(s),
              flowers: this.flowers[s],
              winTileId: winTile.id,
              method: method === 'zimo' ? 'zimo' : 'rong',
              seat: s,
            })
          : null;
        huTou = res ? res.final : 30;
        winnerHuTou = huTou;
      } else {
        huTou = scoreUnwon(this.meldScores(s), this.flowers[s], true, s, this.hands[s]);
      }
      void winnerHuTou;
      standings.push({ seat: s, zhuang: s === this.dealer, huTou });
    }
    const { net, detail } = settle(
      standings,
      winnerSeat,
      method === 'rong' || method === 'robbed' ? (discarder ?? null) : null
    );
    const nextDealer =
      winnerSeat !== null ? winnerSeat : (this.dealer + 1) % this.n; // 连庄：胡者坐庄；流局顺延
    this.broadcast({
      type: 'gameOver',
      winnerSeat,
      method,
      standings: standings.map((st) => ({
        seat: st.seat,
        name: this.toSeat(st.seat).name,
        huTou: st.huTou,
        net: net[st.seat],
      })),
      detail,
      nextDealer,
    });
  }

  private winByRong(seat: number, tile: Tile, discarder: number, robbed: boolean) {
    // 胡牌张加入手牌
    if (robbed) {
      // 抢杠：取消加杠，这张牌归胡牌者
      const meld = this.melds[discarder].find((m) => m.kind === 'jiagang');
      if (meld) {
        meld.kind = 'peng';
        meld.tiles = meld.tiles.slice(0, 3);
        this.gangCount--;
      }
      const rep = this.lastDrawn[discarder];
      if (rep) {
        // 退回补杠牌
        this.hands[discarder] = this.hands[discarder].filter((t) => t.id !== rep.id);
        this.wall.push(rep);
        this.lastDrawn[discarder] = null;
      }
    } else {
      const river = this.rivers[discarder];
      const ri = river.findIndex((t) => t.id === tile.id);
      if (ri >= 0) river.splice(ri, 1);
    }
    this.hands[seat].push(tile);
    this.endGame(seat, robbed ? 'robbed' : 'rong', discarder);
  }

  private winByZimo(seat: number) {
    this.endGame(seat, 'zimo');
  }

  private exhaust() {
    this.endGame(null, 'exhaustive');
  }

  /** 玩家断线：简单处理——轮到他出牌则自动出第一张，有选择权则视为过 */
  handleLeave(playerId: string) {
    if (this.phase === 'over') return;
    const seat = this.seatOf.get(playerId);
    if (seat === undefined) return;
    if (this.phase === 'await-discard' && this.turn === seat) {
      const t = this.hands[seat][0];
      if (t) this.discard(playerId, t.id);
    } else if (this.phase === 'await-claims' && this.offered.has(seat)) {
      this.respond(playerId, null);
    }
  }
}
