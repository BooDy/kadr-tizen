export type PlayerState = 'idle' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error';

export interface PlayerDriver {
  readonly name?: string;
  init(container: HTMLElement, streamUrl: string, startMs: number): Promise<void>;
  play(): void;
  pause(): void;
  seekTo(ms: number): void;
  destroy(): void;
  setSubtitleTrack(trackUrl: string | null): void;
  onTimeUpdate(callback: (posMs: number, durationMs: number) => void): void;
  onStateChange(callback: (state: PlayerState) => void): void;
  onError(callback: (error: string) => void): void;
}
