export type PlayerState = 'idle' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error';

export interface VideoDisplayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoLayoutHints {
  resolution?: string;
  width?: number;
  height?: number;
  rotation?: number;
  initialAudioIndex?: number;
  initialAudioStreamIndex?: number;
}

export interface PlayerDriver {
  readonly name?: string;
  /**
   * True when a second instance can start loading while this one keeps playing, so a new stream
   * can be swapped in without a black gap (HTML5 video). Tizen AVPlay is a single native plane.
   */
  readonly supportsSeamlessSwap?: boolean;
  init(
    container: HTMLElement,
    streamUrl: string,
    startMs: number,
    hints?: VideoLayoutHints
  ): Promise<void>;
  play(): void;
  pause(): void;
  suspend?(): void;
  restore?(resumeMs: number, autoPlay: boolean): boolean;
  seekTo(ms: number, onComplete?: () => void): void;
  destroy(): void;
  setSubtitleTrack(trackUrl: string | null): void;
  selectAudioTrack?(audioIndex: number, streamIndex?: number): boolean;
  setPlaybackRate?(rate: number): boolean;
  setMediaHints?(hints: VideoLayoutHints | undefined): void;
  onDisplayRectChange?(callback: (rect: VideoDisplayRect) => void): void;
  onTimeUpdate(callback: (posMs: number, durationMs: number) => void): void;
  onStateChange(callback: (state: PlayerState) => void): void;
  onError(callback: (error: string) => void): void;
  onSeekFailure?(callback: (targetMs: number) => void): void;
}

export { createPlayerDriver } from './avplay-driver';
