import { PlayerDriver, PlayerState } from './driver';
import { Html5PlayerDriver } from './html5-driver';

export class TizenAvplayDriver implements PlayerDriver {
  private timeCallback?: (posMs: number, durationMs: number) => void;
  private stateCallback?: (state: PlayerState) => void;
  private errorCallback?: (error: string) => void;
  private isDestroyed = false;

  async init(_container: HTMLElement, streamUrl: string, startMs: number): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avplay = (window as any).webapis?.avplay;
    if (!avplay) {
      throw new Error('Tizen AVPlay API not available');
    }

    avplay.open(streamUrl);
    avplay.setDisplayRect(0, 0, 1920, 1080);

    avplay.setListener({
      onbufferingstart: () => this.stateCallback?.('buffering'),
      onbufferingcomplete: () => this.stateCallback?.('playing'),
      oncurrentplaytime: (ms: number) => {
        const duration = avplay.getDuration();
        this.timeCallback?.(ms, duration);
      },
      onerror: (err: any) => {
        console.error('[AVPlay] Hardware error:', err);
        this.stateCallback?.('error');
        this.errorCallback?.('AVPlay Hardware Error');
      },
      onstreamcompleted: () => this.stateCallback?.('ended'),
    });

    avplay.prepareAsync(
      () => {
        if (this.isDestroyed) return;
        if (startMs > 0) {
          try {
            avplay.seekTo(startMs);
          } catch (e) {
            console.warn('[AVPlay] seekTo on start failed:', e);
          }
        }
        try {
          avplay.play();
        } catch (e) {
          console.error('[AVPlay] play failed:', e);
        }
        this.stateCallback?.('playing');
      },
      (err: any) => {
        if (!this.isDestroyed) {
          console.error('[AVPlay] prepareAsync failed:', err);
          this.stateCallback?.('error');
          this.errorCallback?.('AVPlay Prepare Error');
        }
      }
    );
  }

  play(): void {
    if (this.isDestroyed) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webapis?.avplay?.play();
    this.stateCallback?.('playing');
  }

  pause(): void {
    if (this.isDestroyed) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webapis?.avplay?.pause();
    this.stateCallback?.('paused');
  }

  seekTo(ms: number): void {
    if (this.isDestroyed) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webapis?.avplay?.seekTo(ms);
  }

  setSubtitleTrack(_trackUrl: string | null): void {
    // Handled via AVPlay or WebVTT overlay
  }

  destroy(): void {
    this.isDestroyed = true;
    this.timeCallback = undefined;
    this.stateCallback = undefined;
    this.errorCallback = undefined;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const avplay = (window as any).webapis?.avplay;
      if (avplay) {
        avplay.stop();
        avplay.close();
      }
    } catch {
      // Ignored
    }
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

export function createPlayerDriver(): PlayerDriver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window !== 'undefined' && (window as any).webapis?.avplay) {
    return new TizenAvplayDriver();
  }
  return new Html5PlayerDriver();
}
