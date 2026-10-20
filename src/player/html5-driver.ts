import { PlayerDriver, PlayerState } from './driver';

export class Html5PlayerDriver implements PlayerDriver {
  readonly name = 'HTML5 Video';
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
    this.video.addEventListener('error', () => {
      const err = this.video?.error;
      let codeStr = 'Unknown';
      if (err) {
        switch (err.code) {
          case 1:
            codeStr = 'MEDIA_ERR_ABORTED (1)';
            break;
          case 2:
            codeStr = 'MEDIA_ERR_NETWORK (2)';
            break;
          case 3:
            codeStr = 'MEDIA_ERR_DECODE (3)';
            break;
          case 4:
            codeStr = 'MEDIA_ERR_SRC_NOT_SUPPORTED (4)';
            break;
          default:
            codeStr = `Code ${err.code}`;
            break;
        }
      }
      this.errorCallback?.(`HTML5 Video Error: ${codeStr}${err?.message ? ` - ${err.message}` : ''}`);
    });

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

  seekTo(ms: number, onComplete?: () => void): void {
    if (this.video) {
      this.video.currentTime = Math.max(0, ms / 1000);
      onComplete?.();
    }
  }

  setSubtitleTrack(trackUrl: string | null): void {
    if (!this.video) return;
    const existing = this.video.querySelectorAll('track');
    existing.forEach((t) => t.remove());

    if (trackUrl) {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.src = trackUrl;
      track.default = true;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((track as any).track) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (track as any).track.mode = 'showing';
        }
      } catch {
        // Ignored
      }
      track.addEventListener('load', () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((track as any).track) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (track as any).track.mode = 'showing';
          }
        } catch {
          // Ignored
        }
      });
      this.video.appendChild(track);
    }
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
