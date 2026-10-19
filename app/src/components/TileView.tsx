import type { Tile } from '@shared/index';
import { tileLabel } from '@shared/index';
import { cn } from '@/lib/utils';

const SUIT_COLORS: Record<string, string> = {
  m: 'text-red-600',
  s: 'text-emerald-700',
  p: 'text-blue-700',
  z: 'text-neutral-800',
  f: 'text-rose-700',
};

export function TileView({ tile, size = 'md', className }: { tile: Tile; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dims = {
    sm: 'w-7 h-9 text-xs',
    md: 'w-9 h-12 text-base',
    lg: 'w-11 h-14 text-lg',
  }[size];

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-md border border-neutral-300 bg-gradient-to-b from-white to-neutral-100 shadow-sm select-none',
        dims,
        SUIT_COLORS[tile.suit],
        className
      )}
    >
      <span className="font-bold leading-none">{tileLabel(tile)}</span>
    </div>
  );
}

export function sortTiles(tiles: Tile[]): Tile[] {
  const order = { m: 0, s: 1, p: 2, z: 3, f: 4 } as const;
  return [...tiles].sort((a, b) => order[a.suit] - order[b.suit] || a.rank - b.rank);
}
