// 冒烟测试：同进程启动服务器，2 个客户端建房、进房、开局
import './src/index.ts'; // 启动 WebSocket 服务器（监听 8080）
import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8080';
await new Promise((r) => setTimeout(r, 1000));

function client(name: string) {
  const ws = new WebSocket(WS_URL);
  const inbox: any[] = [];
  const waiters: [((m: any) => boolean), (m: any) => void][] = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    inbox.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      const [pred, resolve] = waiters[i];
      if (pred(msg)) {
        waiters.splice(i, 1);
        resolve(msg);
      }
    }
  });
  return {
    ws,
    send: (m: unknown) => ws.send(JSON.stringify(m)),
    wait: (pred: (m: any) => boolean, timeout = 3000) =>
      new Promise<any>((resolve, reject) => {
        const hit = inbox.find(pred);
        if (hit) return resolve(hit);
        waiters.push([pred, resolve]);
        setTimeout(() => reject(new Error(`${name} 等待超时`)), timeout);
      }),
  };
}

const a = client('A');
const b = client('B');
await a.wait((m) => m.type === 'connected');
await b.wait((m) => m.type === 'connected');
console.log('✓ 两个客户端已连接');

a.send({ type: 'createRoom', name: '小明' });
const room = await a.wait((m) => m.type === 'roomState');
console.log('✓ 房间已创建:', room.roomId);

b.send({ type: 'joinRoom', roomId: room.roomId, name: '小红' });
await a.wait((m) => m.type === 'roomState' && m.players.length === 2);
await b.wait((m) => m.type === 'roomState' && m.players.length === 2);
console.log('✓ 玩家 B 加入，房间人数: 2');

a.send({ type: 'startGame' });
const [ga, gb] = await Promise.all([
  a.wait((m) => m.type === 'gameStarted'),
  b.wait((m) => m.type === 'gameStarted'),
]);
console.log('✓ 开局，A 手牌数:', ga.yourHand.length, 'B 手牌数:', gb.yourHand.length);
console.log('✓ 庄家座位:', ga.dealer, '牌墙剩余:', ga.wallCount, 'A 花:', ga.yourFlowers.length, 'B 花:', gb.yourFlowers.length);
if (ga.yourHand.length < 13 || ga.yourHand.length > 14) throw new Error('手牌数异常: ' + ga.yourHand.length);
if (gb.yourHand.length < 13 || gb.yourHand.length > 14) throw new Error('手牌数异常: ' + gb.yourHand.length);
if (ga.wallCount <= 0) throw new Error('牌墙异常');
console.log('全部冒烟测试通过');
process.exit(0);
