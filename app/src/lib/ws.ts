import type { ClientMessage, ServerMessage } from '@shared/index';

const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) || 'ws://localhost:8080';

type Handler = (msg: ServerMessage) => void;

let ws: WebSocket | null = null;
const handlers = new Set<Handler>();

export function connect(onFirstOpen?: () => void): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve(ws);
      return;
    }
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      onFirstOpen?.();
      resolve(ws!);
    };
    ws.onerror = () => reject(new Error('无法连接到游戏服务器'));
    ws.onclose = () => {
      ws = null;
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as ServerMessage;
        handlers.forEach((h) => h(msg));
      } catch {
        // 忽略无法解析的消息
      }
    };
  });
}

export function onMessage(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function send(msg: ClientMessage) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
