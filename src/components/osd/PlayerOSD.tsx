import { PlayerState } from '../../player/driver';

export interface PlayerOSDProps {
  title: string;
  playerState: PlayerState;
  positionMs: number;
  durationMs: number;
  visible: boolean;
}

export function formatTime(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function PlayerOSD({
  title,
  playerState,
  positionMs,
  durationMs,
  visible,
}: PlayerOSDProps) {
  if (!visible) return null;

  const progressPercent =
    durationMs > 0 ? Math.min(100, Math.max(0, (positionMs / durationMs) * 100)) : 0;

  return (
    <div
      data-testid="player-osd"
      className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/60 p-12 flex flex-col justify-between pointer-events-none transition-opacity duration-300"
    >
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-white drop-shadow-md">{title}</h2>
        <div className="text-zinc-400 text-lg uppercase tracking-widest">{playerState}</div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="w-full h-3 bg-zinc-700/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-sky-400 transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-zinc-300 font-mono text-lg">
          <span>{formatTime(positionMs)}</span>
          <span>{formatTime(durationMs)}</span>
        </div>
      </div>
    </div>
  );
}
