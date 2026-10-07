import { PlayerDriver, PlayerState } from './driver';
import { Html5PlayerDriver } from './html5-driver';

export class TizenAvplayDriver implements PlayerDriver {
  private timeCallback?: (posMs: number, durationMs: number) => void;
  private stateCallback?: (state: PlayerState) => void;
  private errorCallback?: (error: string) => void;

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
      onerror: () => this.errorCallback?.('AVPlay Hardware Error'),
    });

    avplay.prepareAsync(() => {
      if (startMs > 0) {
        avplay.seekTo(startMs);
      }
      avplay.play();
      this.stateCallback?.('playing');
    });
  }

  play(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webapis?.avplay?.play();
    this.stateCallback?.('playing');
  }

  pause(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webapis?.avplay?.pause();
    this.stateCallback?.('paused');
  }

  seekTo(ms: number): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webapis?.avplay?.seekTo(ms);
  }

  setSubtitleTrack(_trackUrl: string | null): void {
    // Handled via AVPlay or WebVTT overlay
  }

  destroy(): void {
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
