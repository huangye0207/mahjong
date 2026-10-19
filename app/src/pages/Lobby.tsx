import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { connect, onMessage, send } from '@/lib/ws';
import type { ServerMessage } from '@shared/index';

export default function Lobby() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => localStorage.getItem('mj-name') || '');
  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState<Extract<ServerMessage, { type: 'roomState' }> | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    connect()
      .then(() => setConnected(true))
      .catch(() => setError('无法连接游戏服务器，请确认已运行 server（npm run dev）'));
    const off = onMessage((msg) => {
      if (msg.type === 'roomState') setRoom(msg);
      if (msg.type === 'gameStarted') {
        navigate('/game', { state: msg });
      }
      if (msg.type === 'error') setError(msg.message);
    });
    return off;
  }, [navigate]);

  const effectiveName = name.trim() || undefined;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">家乡麻将</CardTitle>
          <CardDescription>
            {connected ? '已连接服务器' : '正在连接服务器…'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="你的昵称"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              localStorage.setItem('mj-name', e.target.value);
            }}
          />

          {!room && (
            <>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={!connected}
                  onClick={() => {
                    setError('');
                    send({ type: 'createRoom', name: effectiveName });
                  }}
                >
                  创建房间
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="输入 6 位房间码"
                  value={roomId}
                  maxLength={6}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                />
                <Button
                  variant="secondary"
                  disabled={!connected || roomId.length !== 6}
                  onClick={() => {
                    setError('');
                    send({ type: 'joinRoom', roomId, name: effectiveName });
                  }}
                >
                  加入房间
                </Button>
              </div>
            </>
          )}

          {room && (
            <div className="space-y-3">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">房间码</div>
                <div className="text-3xl font-mono font-bold tracking-widest">{room.roomId}</div>
              </div>
              <div className="space-y-1">
                {room.players.map((p) => (
                  <div key={p.id} className="flex justify-between rounded bg-muted px-3 py-2 text-sm">
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">
                      {p.id === room.hostId ? '房主' : `座位 ${p.seat + 1}`}
                    </span>
                  </div>
                ))}
                {Array.from({ length: 4 - room.players.length }).map((_, i) => (
                  <div key={i} className="rounded border border-dashed px-3 py-2 text-sm text-muted-foreground">
                    等待玩家加入…（{room.players.length + i + 1}/4）
                  </div>
                ))}
              </div>
              {room.hostId && room.players.find((p) => p.id === room.hostId) && (
                <Button
                  className="w-full"
                  onClick={() => send({ type: 'startGame' })}
                >
                  开始游戏（{room.players.length} 人）
                </Button>
              )}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  send({ type: 'leaveRoom' });
                  setRoom(null);
                }}
              >
                离开房间
              </Button>
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
