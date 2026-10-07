import { PlayerDriver, PlayerState } from './driver';

export class Html5PlayerDriver implements PlayerDriver {
  private video: HTMLVideoElement | null = null;
  private timeCallback?: (posMs: number, durationMs: number) => void;
  private stateCallback?: (state: PlayerState) => void;
  private errorCallback?: (error: string) => void;

  async init(container: HTMLElement, streamUrl: string, startMs: number): Promise<void> {
    this.video = document.createElement('video');
    this.video.className = 'w-full h-full object-contain bg-black';
    this.video.src = streamUrl;
    this.video.preload = 'auto';

    this.video.addEventListener('timeupdate', () => {
      if (this.video && this.timeCallback) {
        this.timeCallback(Math.round(this.video.currentTime * 1000), Math.round(this.video.duration * 1000) || 0);
      }
    });

    this.video.addEventListener('playing', () => this.stateCallback?.('playing'));
    this.video.addEventListener('pause', () => this.stateCallback?.('paused'));
    this.video.addEventListener('waiting', () => this.stateCallback?.('buffering'));
    this.video.addEventListener('ended', () => this.stateCallback?.('ended'));
    this.video.addEventListener('error', () => this.errorCallback?.('HTML5 Video Error'));

    container.appendChild(this.video);

    if (startMs > 0) {
      this.video.currentTime = startMs / 1000;
    }

    try {
      const playPromise = this.video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        await playPromise.catch(() => {});
      }
    } catch {
      // Ignored
    }
  }

  play(): void {
    try {
      const playPromise = this.video?.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    } catch {
      // Ignored
    }
  }

  pause(): void {
    try {
      this.video?.pause();
    } catch {
      // Ignored
    }
  }

  seekTo(ms: number): void {
    if (this.video) {
      this.video.currentTime = Math.max(0, ms / 1000);
    }
  }

  setSubtitleTrack(_trackUrl: string | null): void {
    // Subtitle handling in HTML5
  }

  destroy(): void {
    if (this.video) {
      try {
        this.video.pause();
      } catch {
        // Ignored
      }
      this.video.src = '';
      this.video.remove();
      this.video = null;
    }
    this.timeCallback = undefined;
    this.stateCallback = undefined;
    this.errorCallback = undefined;
  }

  onTimeUpdate(callback: (posMs: number, durationMs: number) => void): void {
    this.timeCallback = callback;
  }

  onStateChange(callback: (state: PlayerState) => void): void {
    this.stateCallback = callback;
  }

  onError(callback: (error: string) => void): void {
    this.errorCallback = callback;
  }
}
