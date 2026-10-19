import { WebSocketServer, WebSocket } from 'ws';
import { GameEngine } from './game.ts';
import type { ClientMessage, PlayerInfo } from '../../shared/src/protocol.ts';

const PORT = Number(process.env.PORT || 8080);

interface Room {
  id: string;
  players: Map<string, { ws: WebSocket; info: PlayerInfo }>; // key = playerId
  hostId: string;
  started: boolean;
  engine: GameEngine | null;
}

// ---------- 内存数据 ----------
const rooms = new Map<string, Room>();
let nextPlayerId = 1;

function genRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  do {
    id = '';
    for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(id));
  return id;
}

function send(ws: WebSocket, msg: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: unknown, exceptId?: string) {
  const data = JSON.stringify(msg);
  for (const [pid, p] of room.players) {
    if (pid !== exceptId && p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
  }
}

function roomState(room: Room) {
  return {
    type: 'roomState',
    roomId: room.id,
    hostId: room.hostId,
    started: room.started,
    players: [...room.players.values()].map((p) => p.info),
  };
}

function startGame(room: Room) {
  const players = [...room.players.values()]
    .map((p) => p.info)
    .sort((a, b) => a.seat - b.seat)
    .map((info) => ({
      id: info.id,
      name: info.name,
      seat: info.seat,
      send: (msg: unknown) => {
        const entry = [...room.players.values()].find((v) => v.info.id === info.id);
        if (entry) send(entry.ws, msg);
      },
    }));
  room.engine = new GameEngine(players, room.id);
  room.started = true;
}

// ---------- 连接处理 ----------
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  const playerId = `p${nextPlayerId++}`;
  let currentRoom: Room | null = null;

  send(ws, { type: 'connected', playerId });

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'createRoom': {
        const roomId = genRoomId();
        const room: Room = {
          id: roomId,
          players: new Map(),
          hostId: playerId,
          started: false,
          engine: null,
        };
        room.players.set(playerId, {
          ws,
          info: { id: playerId, name: msg.name || `玩家${playerId}`, seat: 0 },
        });
        rooms.set(roomId, room);
        currentRoom = room;
        send(ws, roomState(room));
        break;
      }

      case 'joinRoom': {
        const room = msg.roomId ? rooms.get(msg.roomId.toUpperCase()) : undefined;
        if (!room) {
          send(ws, { type: 'error', message: '房间不存在' });
          return;
        }
        if (room.players.size >= 4) {
          send(ws, { type: 'error', message: '房间已满' });
          return;
        }
        if (room.started) {
          send(ws, { type: 'error', message: '游戏已开始' });
          return;
        }
        const seat = [...room.players.values()].map((p) => p.info.seat).reduce((a, b) => Math.max(a, b), -1) + 1;
        room.players.set(playerId, {
          ws,
          info: { id: playerId, name: msg.name || `玩家${playerId}`, seat },
        });
        currentRoom = room;
        send(ws, roomState(room));
        broadcast(room, roomState(room), playerId);
        break;
      }

      case 'startGame': {
        const room = currentRoom;
        if (!room || room.hostId !== playerId) return;
        if (room.players.size < 2) {
          send(ws, { type: 'error', message: '至少需要 2 名玩家' });
          return;
        }
        startGame(room);
        break;
      }

      case 'discard': {
        currentRoom?.engine?.discard(playerId, msg.tileId);
        break;
      }

      case 'claim': {
        currentRoom?.engine?.claim(playerId, msg.action, msg.tileId, msg.chiTileIds);
        break;
      }

      case 'pass': {
        currentRoom?.engine?.respond(playerId, null);
        break;
      }

      case 'leaveRoom': {
        if (currentRoom) leaveRoom(currentRoom, playerId);
        currentRoom = null;
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom) leaveRoom(currentRoom, playerId);
  });
});

function leaveRoom(room: Room, playerId: string) {
  room.engine?.handleLeave(playerId);
  room.players.delete(playerId);
  if (room.players.size === 0) {
    rooms.delete(room.id);
    return;
  }
  if (room.hostId === playerId) {
    room.hostId = [...room.players.keys()][0];
  }
  let seat = 0;
  for (const p of room.players.values()) p.info.seat = seat++;
  broadcast(room, roomState(room));
}

console.log(`[mahjong-server] WebSocket 服务器已启动: ws://localhost:${PORT}`);
