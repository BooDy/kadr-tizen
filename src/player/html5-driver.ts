import { PlayerDriver, PlayerState } from './driver';
import Hls from 'hls.js';

export class Html5PlayerDriver implements PlayerDriver {
  readonly name = 'HTML5 Video';
  readonly supportsSeamlessSwap = true;
  private video: HTMLVideoElement | null = null;
  private hls: Hls | null = null;
  private timeCallback?: (posMs: number, durationMs: number) => void;
  private stateCallback?: (state: PlayerState) => void;
  private errorCallback?: (error: string) => void;
  private hasUserSeeked = false;

  async init(container: HTMLElement, streamUrl: string, startMs: number): Promise<void> {
    this.hasUserSeeked = false;
    this.video = document.createElement('video');
    // Absolutely positioned so a replacement video can load on top of a still-playing one
    this.video.className = 'absolute inset-0 w-full h-full object-contain bg-black';
    this.video.preload = 'auto';

    // When another video is still playing in this container (seek swap), stay invisible until the
    // first frame is playing, so the old picture keeps showing instead of a black box.
    const overlapsPlayingVideo = container.querySelector('video') !== null;
    if (overlapsPlayingVideo) {
      this.video.style.opacity = '0';
    }

    const isHls = streamUrl.includes('.m3u8') || streamUrl.includes('/hls/');
    const targetStartSec = startMs > 0 ? startMs / 1000 : 0;
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        startPosition: targetStartSec,
        lowLatencyMode: false,
        enableWorker: true,
      });
      this.hls = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(this.video);
      let networkRetries = 0;
      hls.on(Hls.Events.FRAG_LOADED, () => {
        networkRetries = 0;
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Retry a few times, then report the real cause instead of spinning forever
              // (which only ever surfaced as a generic "buffering timeout").
              if (networkRetries < 3) {
                networkRetries++;
                setTimeout(() => {
                  try {
                    // Pass explicit position so hls.js never falls back to -1 (EVENT live edge)
                    const resumeSec =
                      this.video && this.video.currentTime > 0
                        ? this.video.currentTime
                        : targetStartSec;
                    hls.startLoad(resumeSec);
                  } catch {
                    // Ignored
                  }
                }, 500 * networkRetries);
              } else {
                const code = data.response?.code;
                this.errorCallback?.(
                  `HLS Network Error: ${data.details || 'request failed'}${
                    code ? ` (HTTP ${code})` : ''
                  }`
                );
                hls.destroy();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              this.errorCallback?.(`HLS Error: ${data.details || 'Fatal playback error'}`);
              hls.destroy();
              break;
          }
        }
      });
    } else {
      this.video.src = streamUrl;
      if (targetStartSec > 0) {
        this.video.currentTime = targetStartSec;
      }
      this.video.addEventListener(
        'loadedmetadata',
        () => {
          if (!this.video || this.hasUserSeeked) return;
          if (targetStartSec > 0 && Math.abs(this.video.currentTime - targetStartSec) > 1) {
            this.video.currentTime = targetStartSec;
          } else if (isHls && targetStartSec === 0 && this.video.currentTime > 3) {
            // Rewind native HLS playback if an un-ended EVENT playlist joined at the live edge
            this.video.currentTime = 0;
          }
        },
        { once: true }
      );
    }

    const emitTimeUpdate = () => {
      if (this.video && this.timeCallback) {
        const rawPos = this.video.currentTime;
        const rawDur = this.video.duration;
        const posMs = Number.isFinite(rawPos) && rawPos > 0 ? Math.round(rawPos * 1000) : 0;
        const durMs = Number.isFinite(rawDur) && rawDur > 0 ? Math.round(rawDur * 1000) : 0;
        this.timeCallback(posMs, durMs);
      }
    };

    this.video.addEventListener('timeupdate', emitTimeUpdate);
    this.video.addEventListener('loadedmetadata', emitTimeUpdate);
    this.video.addEventListener('durationchange', emitTimeUpdate);

    this.video.addEventListener('playing', () => {
      if (this.video && this.video.style.opacity === '0') {
        this.video.style.opacity = '1';
      }
      this.stateCallback?.('playing');
    });
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

  suspend(): void {
    this.pause();
  }

  restore(_resumeMs: number, autoPlay: boolean): boolean {
    if (!this.video || this.video.error) {
      return false;
    }
    if (autoPlay) {
      this.play();
    } else {
      this.pause();
    }
    return true;
  }

  seekTo(ms: number, onComplete?: () => void): void {
    this.hasUserSeeked = true;
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
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch {
        // Ignored
      }
      this.hls = null;
    }
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
