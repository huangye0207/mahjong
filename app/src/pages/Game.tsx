import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { TileView, sortTiles } from '@/components/TileView';
import { connect, onMessage, send } from '@/lib/ws';
import { cn } from '@/lib/utils';
import type { Meld, ServerMessage, Tile } from '@shared/index';

type GameStartMsg = Extract<ServerMessage, { type: 'gameStarted' }>;
type YourTurnMsg = Extract<ServerMessage, { type: 'yourTurn' }>;
type OfferMsg = Extract<ServerMessage, { type: 'claimOffer' }>;
type OverMsg = Extract<ServerMessage, { type: 'gameOver' }>;

interface TableState {
  base: GameStartMsg | null;
  yourHand: Tile[];
  yourFlowers: Tile[];
  flowerCounts: number[];
  melds: Meld[][];
  rivers: Tile[][];
  wallCount: number;
  yourTurn: YourTurnMsg | null;
  offer: OfferMsg | null;
  over: OverMsg | null;
}

const MELD_NAMES: Record<Meld['kind'], string> = {
  chi: '吃',
  peng: '碰',
  minggang: '杠',
  angang: '暗杠',
  jiagang: '加杠',
};

export default function Game() {
  const navigate = useNavigate();
  const [st, setSt] = useState<TableState>({
    base: null,
    yourHand: [],
    yourFlowers: [],
    flowerCounts: [],
    melds: [],
    rivers: [],
    wallCount: 0,
    yourTurn: null,
    offer: null,
    over: null,
  });
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    connect().catch(() => {});
    const off = onMessage((msg) => {
      setSt((prev) => {
        switch (msg.type) {
          case 'gameStarted': {
            return {
              base: msg,
              yourHand: msg.yourHand,
              yourFlowers: msg.yourFlowers,
              flowerCounts: msg.flowerCounts,
              melds: msg.melds,
              rivers: msg.rivers.map((r) => [...r]),
              wallCount: msg.wallCount,
              yourTurn: null,
              offer: null,
              over: null,
            };
          }
          case 'yourTurn': {
            if (!prev.base || msg.seat !== prev.base.yourSeat) return { ...prev, wallCount: msg.wallCount };
            return { ...prev, yourTurn: msg, offer: null, wallCount: msg.wallCount };
          }
          case 'playerDiscarded': {
            const rivers = prev.rivers.map((r) => [...r]);
            rivers[msg.seat] = [...rivers[msg.seat], msg.tile];
            return { ...prev, rivers, wallCount: msg.wallCount };
          }
          case 'claimOffer':
            return { ...prev, offer: msg };
          case 'claimDone':
            return { ...prev, melds: msg.melds, offer: null, yourTurn: null, wallCount: msg.wallCount };
          case 'handUpdate':
            return {
              ...prev,
              yourHand: msg.yourHand,
              yourFlowers: msg.yourFlowers,
              melds: prev.melds.map((m, i) => (i === prev.base?.yourSeat ? msg.yourMelds : m)),
              flowerCounts: msg.flowerCounts,
              wallCount: msg.wallCount,
            };
          case 'gameOver':
            return { ...prev, over: msg, offer: null, yourTurn: null };
          default:
            return prev;
        }
      });
    });
    return off;
  }, []);

  const hand = useMemo(() => sortTiles(st.yourHand), [st.yourHand]);

  if (!st.base) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-emerald-950 text-white">
        <div>尚未加入对局</div>
        <Button variant="secondary" onClick={() => navigate('/')}>
          返回大厅
        </Button>
      </div>
    );
  }

  const { base } = st;
  const me = base.players.find((p) => p.seat === base.yourSeat);
  const others = base.players.filter((p) => p.seat !== base.yourSeat);
  const canDiscard = st.yourTurn !== null && !st.over;
  const drawnId = st.yourTurn?.drawn?.id;

  const doDiscard = () => {
    if (selected === null) return;
    send({ type: 'discard', tileId: selected });
    setSelected(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 text-white p-3">
      <div className="flex items-center justify-between text-sm">
        <Button variant="ghost" className="text-white" onClick={() => navigate('/')}>
          ← 离开
        </Button>
        <div className="text-emerald-200">
          房间 {base.roomId || '-'} ・ 牌墙 {st.wallCount} 张
          {st.over ? ' ・ 对局结束' : st.yourTurn ? ' ・ 轮到你' : ''}
        </div>
      </div>

      {/* 其他玩家 */}
      <div className="flex justify-center gap-6 mt-1 text-center">
        {others.map((p) => (
          <div key={p.id} className="text-xs">
            <div className={p.seat === base.dealer ? 'text-amber-300 font-bold' : ''}>
              {p.name}
              {p.seat === base.dealer && ' · 庄'}
            </div>
            <div className="text-emerald-300/70">
              花 {st.flowerCounts[p.seat] ?? 0} ・ 副露 {st.melds[p.seat]?.length ?? 0}
            </div>
            {/* 对手副露 */}
            <div className="flex justify-center gap-1 mt-1 flex-wrap max-w-40">
              {(st.melds[p.seat] ?? []).map((m, i) => (
                <div key={i} className="flex gap-0.5 items-center">
                  {m.tiles.slice(0, 3).map((t) => (
                    <TileView key={t.id} tile={t} size="sm" />
                  ))}
                </div>
              ))}
            </div>
            {/* 对手河面 */}
            <div className="flex justify-center gap-0.5 mt-1 flex-wrap max-w-40 opacity-80">
              {(st.rivers[p.seat] ?? []).slice(-12).map((t, i) => (
                <TileView key={`${t.id}-${i}`} tile={t} size="sm" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 中央：自己的河面 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-2 min-h-24">
        <div className="text-xs text-emerald-300/60">我的河面</div>
        <div className="flex gap-0.5 flex-wrap justify-center max-w-lg opacity-90">
          {(st.rivers[base.yourSeat] ?? []).map((t, i) => (
            <TileView key={`${t.id}-${i}`} tile={t} size="md" />
          ))}
        </div>
      </div>

      {/* 操作区 */}
      {(st.offer || st.yourTurn) && !st.over && (
        <div className="flex justify-center gap-2 mb-2 flex-wrap">
          {st.offer && (
            <>
              {st.offer.options.includes('hu') && (
                <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => send({ type: 'claim', action: 'hu', tileId: st.offer!.tile.id })}>
                  胡！
                </Button>
              )}
              {st.offer.options.includes('gang') && (
                <Button size="sm" onClick={() => send({ type: 'claim', action: 'gang', tileId: st.offer!.tile.id })}>
                  杠
                </Button>
              )}
              {st.offer.options.includes('peng') && (
                <Button size="sm" onClick={() => send({ type: 'claim', action: 'peng', tileId: st.offer!.tile.id })}>
                  碰
                </Button>
              )}
              {st.offer.options.includes('chi') &&
                st.offer.chiChoices.map((c, i) => (
                  <Button
                    key={i}
                    size="sm"
                    variant="secondary"
                    onClick={() => send({ type: 'claim', action: 'chi', tileId: st.offer!.tile.id, chiTileIds: [c[0].id, c[1].id] })}
                  >
                    吃 {c[0].rank}-{c[1].rank}
                  </Button>
                ))}
              <Button size="sm" variant="outline" className="text-white border-emerald-600" onClick={() => send({ type: 'pass' })}>
                过
              </Button>
            </>
          )}
          {st.yourTurn && (
            <>
              {st.yourTurn.canZimo && (
                <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => send({ type: 'claim', action: 'hu' })}>
                  自摸！
                </Button>
              )}
              {st.yourTurn.anGangTiles.map((t) => (
                <Button key={t.id} size="sm" onClick={() => send({ type: 'claim', action: 'gang', tileId: t.id })}>
                  暗杠 {t.suit === 'z' ? '字' : t.rank}
                </Button>
              ))}
              {st.yourTurn.jiaGangTiles.map((t) => (
                <Button key={t.id} size="sm" onClick={() => send({ type: 'claim', action: 'gang', tileId: t.id })}>
                  加杠 {t.suit === 'z' ? '字' : t.rank}
                </Button>
              ))}
              <Button size="sm" variant="outline" className="text-white border-emerald-600" disabled={selected === null} onClick={doDiscard}>
                出牌
              </Button>
            </>
          )}
        </div>
      )}

      {/* 自己的副露与花 */}
      <div className="flex justify-center items-end gap-4 mb-1">
        <div className="flex gap-1 flex-wrap">
          {st.melds[base.yourSeat]?.map((m, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="flex gap-0.5">
                {m.tiles.slice(0, 4).map((t) => (
                  <TileView key={t.id} tile={t} size="md" />
                ))}
              </div>
              <span className="text-[10px] text-emerald-300/70">{MELD_NAMES[m.kind]}</span>
            </div>
          ))}
        </div>
        {st.yourFlowers.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-emerald-300/70">花</span>
            {st.yourFlowers.map((t) => (
              <TileView key={t.id} tile={t} size="sm" />
            ))}
          </div>
        )}
      </div>

      {/* 自己的手牌 */}
      <div className="space-y-1">
        <div className="text-center text-xs text-emerald-200">
          {me?.name}
          {base.yourSeat === base.dealer && '（庄家）'} ・ {hand.length} 张
        </div>
        <div className="flex justify-center flex-wrap gap-1">
          {hand.map((t) => (
            <button
              key={t.id}
              onClick={() => canDiscard && setSelected(selected === t.id ? null : t.id)}
              className={cn('transition-transform', selected === t.id && '-translate-y-2 ring-2 ring-amber-400 rounded-md', !canDiscard && 'cursor-default')}
            >
              <TileView tile={t} size="lg" className={t.id === drawnId ? 'ring-2 ring-sky-400' : ''} />
            </button>
          ))}
        </div>
      </div>

      {/* 结算面板 */}
      {st.over && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white text-neutral-900 rounded-lg p-5 w-full max-w-md space-y-3">
            <div className="text-lg font-bold text-center">
              {st.over.winnerSeat === null
                ? '流局'
                : `${st.over.standings.find((s) => s.seat === st.over!.winnerSeat)?.name} ${
                    st.over.method === 'zimo' ? '自摸' : st.over.method === 'robbed' ? '抢杠胡' : '胡牌'
                  }`}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th>玩家</th>
                  <th>胡头</th>
                  <th>得失</th>
                </tr>
              </thead>
              <tbody>
                {st.over.standings.map((s) => (
                  <tr key={s.seat} className={cn('border-t', s.seat === st.over!.winnerSeat && 'font-bold text-red-600')}>
                    <td>
                      {s.name}
                      {s.seat === st.over!.nextDealer ? '（下局庄家）' : ''}
                    </td>
                    <td>{s.huTou}</td>
                    <td className={s.net >= 0 ? 'text-emerald-700' : 'text-red-600'}>{s.net >= 0 ? `+${s.net}` : s.net}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => send({ type: 'startGame' })}>
                再来一局
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => navigate('/')}>
                返回大厅
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
