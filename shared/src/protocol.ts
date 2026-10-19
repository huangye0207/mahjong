import type { Tile } from './tiles.ts';
import type { Meld } from './moves.ts';

// ---------- 客户端 → 服务器 ----------
export type ClientMessage =
  | { type: 'createRoom'; name?: string }
  | { type: 'joinRoom'; roomId: string; name?: string }
  | { type: 'startGame' }
  | { type: 'leaveRoom' }
  | { type: 'discard'; tileId: number }
  | { type: 'claim'; action: 'hu' | 'peng' | 'gang' | 'chi'; tileId?: number; chiTileIds?: [number, number] }
  | { type: 'pass' };

// ---------- 服务器 → 客户端 ----------
export interface PlayerInfo {
  id: string;
  name: string;
  seat: number;
}

export type ClaimAction = 'hu' | 'peng' | 'gang' | 'chi';

export type ServerMessage =
  | { type: 'connected'; playerId: string }
  | { type: 'roomState'; roomId: string; hostId: string; started: boolean; players: PlayerInfo[] }
  | {
      type: 'gameStarted';
      roomId: string;
      dealer: number;
      yourSeat: number;
      yourHand: Tile[];
      yourFlowers: Tile[];
      flowerCounts: number[];
      melds: Meld[][];
      rivers: Tile[][];
      wallCount: number;
      players: PlayerInfo[];
    }
  | {
      type: 'yourTurn';
      seat: number;
      drawn: Tile | null;
      canZimo: boolean;
      anGangTiles: Tile[];
      jiaGangTiles: Tile[];
      wallCount: number;
    }
  | { type: 'playerDiscarded'; seat: number; tile: Tile; wallCount: number }
  | { type: 'claimOffer'; seat: number; tile: Tile; options: ClaimAction[]; chiChoices: [Tile, Tile][] }
  | { type: 'claimDone'; by: number; action: 'peng' | 'gang' | 'chi'; tile: Tile; melds: Meld[][]; wallCount: number }
  | { type: 'handUpdate'; yourHand: Tile[]; yourMelds: Meld[]; yourFlowers: Tile[]; flowerCounts: number[]; wallCount: number }
  | {
      type: 'gameOver';
      winnerSeat: number | null;
      method: 'zimo' | 'rong' | 'robbed' | 'exhaustive';
      standings: { seat: number; name: string; huTou: number; net: number }[];
      detail: string[];
      nextDealer: number;
    }
  | { type: 'error'; message: string };
