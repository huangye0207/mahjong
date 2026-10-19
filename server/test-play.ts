// 机器人对局测试：4 个机器人打多局，校验引擎能完整跑完且结算零和
import './src/index.ts'; // 启动 WebSocket 服务器（监听 8080）
import WebSocket from 'ws';
import type { ServerMessage } from '../shared/src/protocol.ts';

const WS_URL = 'ws://localhost:8080';
const GAMES = 8;
await new Promise((r) => setTimeout(r, 1000));

interface Bot {
  ws: WebSocket;
  send: (m: unknown) => void;
  seat: number;
  hand: { id: number }[];
  inbox: ServerMessage[];
  wait: (pred: (m: ServerMessage) => boolean, timeout?: number) => Promise<ServerMessage>;
}

function makeBot(name: string): Bot {
  const ws = new WebSocket(WS_URL);
  const inbox: ServerMessage[] = [];
  const waiters: [((m: ServerMessage) => boolean), (m: ServerMessage) => void][] = [];
  const bot = {} as Bot;
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString()) as ServerMessage;
    inbox.push(msg);
    if (msg.type === 'handUpdate' || msg.type === 'gameStarted') {
      if (msg.type === 'handUpdate') bot.hand = msg.yourHand;
      else bot.hand = msg.yourHand;
    }
    for (let i = waiters.length - 1; i >= 0; i--) {
      const [pred, resolve] = waiters[i];
      if (pred(msg)) {
        waiters.splice(i, 1);
        resolve(msg);
      }
    }
    handle(msg, bot);
  });
  bot.ws = ws;
  bot.inbox = inbox;
  bot.hand = [];
  bot.seat = -1;
  bot.send = (m) => ws.send(JSON.stringify(m));
  bot.wait = (pred, timeout = 60000) =>
    new Promise((resolve, reject) => {
      const hit = inbox.find(pred);
      if (hit) return resolve(hit);
      waiters.push([pred, resolve]);
      setTimeout(() => reject(new Error(`${name} 等待超时`)), timeout);
    });
  return bot;
}

const rnd = (n: number) => Math.floor(Math.random() * n);

function handle(msg: ServerMessage, bot: Bot) {
  if (msg.type === 'gameStarted') {
    bot.seat = msg.yourSeat;
    return;
  }
  if (msg.type === 'yourTurn' && msg.seat === bot.seat) {
    setTimeout(() => {
      if (msg.canZimo && Math.random() < 0.85) {
        bot.send({ type: 'claim', action: 'hu' });
        return;
      }
      const gangs = [...msg.anGangTiles, ...msg.jiaGangTiles];
      if (gangs.length > 0 && Math.random() < 0.4) {
        bot.send({ type: 'claim', action: 'gang', tileId: gangs[0].id });
        return;
      }
      const hand = bot.hand;
      if (hand.length === 0) return;
      const t = hand[rnd(hand.length)];
      bot.send({ type: 'discard', tileId: t.id });
    }, rnd(30));
    return;
  }
  if (msg.type === 'claimOffer') {
    setTimeout(() => {
      if (msg.options.includes('hu') && Math.random() < 0.9) {
        bot.send({ type: 'claim', action: 'hu', tileId: msg.tile.id });
      } else if (msg.options.includes('gang') && Math.random() < 0.5) {
        bot.send({ type: 'claim', action: 'gang', tileId: msg.tile.id });
      } else if (msg.options.includes('peng') && Math.random() < 0.5) {
        bot.send({ type: 'claim', action: 'peng', tileId: msg.tile.id });
      } else if (msg.options.includes('chi') && msg.chiChoices.length > 0 && Math.random() < 0.5) {
        const c = msg.chiChoices[rnd(msg.chiChoices.length)];
        bot.send({ type: 'claim', action: 'chi', tileId: msg.tile.id, chiTileIds: [c[0].id, c[1].id] });
      } else {
        bot.send({ type: 'pass' });
      }
    }, rnd(30));
    return;
  }
}

const bots = ['东bot', '南bot', '西bot', '北bot'].map(makeBot);
await Promise.all(bots.map((b) => b.wait((m) => m.type === 'connected')));
console.log('✓ 4 个机器人已连接');

bots[0].send({ type: 'createRoom', name: '东bot' });
const room = (await bots[0].wait((m) => m.type === 'roomState')) as Extract<ServerMessage, { type: 'roomState' }>;
for (let i = 1; i < 4; i++) {
  bots[i].send({ type: 'joinRoom', roomId: room.roomId, name: `${'东南西北'[i]}bot` });
  await bots[i].wait((m) => m.type === 'roomState' && m.players.length === i + 1);
}
console.log('✓ 房间已满 4 人:', room.roomId);

const stats = { zimo: 0, rong: 0, robbed: 0, exhaustive: 0 };
let fail = 0;

for (let g = 0; g < GAMES; g++) {
  for (const b of bots) b.inbox.length = 0;
  bots[0].send({ type: 'startGame' });
  const over = (await bots[0].wait(
    (m) => m.type === 'gameOver',
    90000
  )) as Extract<ServerMessage, { type: 'gameOver' }>;
  stats[over.method]++;
  const sum = over.standings.reduce((a, s) => a + s.net, 0);
  const w = over.winnerSeat !== null ? `座位${over.winnerSeat + 1} ${over.method}` : `流局(${over.method})`;
  console.log(`✓ 第 ${g + 1} 局: ${w}，庄家下一局=${over.nextDealer + 1}，净和=${sum}`);
  if (sum !== 0) {
    console.error('✗ 结算非零和!');
    fail++;
  }
  if (over.standings.length !== 4) {
    console.error('✗ 结算人数异常');
    fail++;
  }
  await new Promise((r) => setTimeout(r, 100));
}

console.log(`\n${GAMES} 局统计:`, stats, fail === 0 ? '全部零和 ✓' : `${fail} 局异常 ✗`);
console.log(fail === 0 ? '机器人对局测试通过' : '测试失败');
process.exit(fail === 0 ? 0 : 1);
