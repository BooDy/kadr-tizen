import { PlayerDriver, PlayerState } from './driver';
import { Html5PlayerDriver } from './html5-driver';

function formatAvplayError(err: any, prefix: string): string {
  if (!err) return prefix;
  if (typeof err === 'string') return `${prefix}: ${err}`;
  if (typeof err === 'number') return `${prefix} (code: ${err})`;
  if (typeof err === 'object') {
    const parts: string[] = [];
    if (err.name) parts.push(`Name: ${err.name}`);
    if (err.message) parts.push(`Message: ${err.message}`);
    if (err.code !== undefined) parts.push(`Code: ${err.code}`);
    if (err.type !== undefined) parts.push(`Type: ${err.type}`);
    if (parts.length > 0) return `${prefix}: ${parts.join(', ')}`;
    try {
      return `${prefix}: ${JSON.stringify(err)}`;
    } catch {
      return prefix;
    }
  }
  return `${prefix}: ${String(err)}`;
}

export class TizenAvplayDriver implements PlayerDriver {
  readonly name = 'Tizen AVPlay';
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

    try {
      const currentState = avplay.getState?.();
      if (currentState && currentState !== 'NONE' && currentState !== 'IDLE') {
        avplay.stop?.();
        avplay.close?.();
      }
    } catch {
      // Ignored
    }

    try {
      avplay.open(streamUrl);
    } catch (e: any) {
      const errStr = formatAvplayError(e, 'AVPlay Open Failed');
      console.error('[AVPlay] open failed:', e);
      this.stateCallback?.('error');
      this.errorCallback?.(errStr);
      return;
    }

    try {
      avplay.setDisplayRect(0, 0, 1920, 1080);
    } catch (e) {
      console.warn('[AVPlay] setDisplayRect failed:', e);
    }

    avplay.setListener({
      onbufferingstart: () => this.stateCallback?.('buffering'),
      onbufferingcomplete: () => this.stateCallback?.('playing'),
      oncurrentplaytime: (ms: number) => {
        try {
          const duration = avplay.getDuration();
          this.timeCallback?.(ms, duration);
        } catch {
          // Ignored
        }
      },
      onerror: (err: any) => {
        console.error('[AVPlay] Hardware error:', err);
        const errStr = formatAvplayError(err, 'AVPlay Hardware Error');
        this.stateCallback?.('error');
        this.errorCallback?.(errStr);
      },
      onstreamcompleted: () => this.stateCallback?.('ended'),
    });

    const startPlayback = () => {
      avplay.prepareAsync(
        () => {
          if (this.isDestroyed) return;
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
            const errStr = formatAvplayError(err, 'AVPlay Prepare Error');
            this.stateCallback?.('error');
            this.errorCallback?.(errStr);
          }
        }
      );
    };

    if (startMs > 0) {
      try {
        avplay.seekTo(
          Math.max(0, Math.floor(startMs)),
          () => {
            if (!this.isDestroyed) startPlayback();
          },
          (err: any) => {
            console.warn('[AVPlay] seekTo in IDLE state failed, falling back to prepare:', err);
            if (!this.isDestroyed) startPlayback();
          }
        );
      } catch (e) {
        console.warn('[AVPlay] seekTo in IDLE exception:', e);
        startPlayback();
      }
    } else {
      startPlayback();
    }
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

  seekTo(ms: number, onComplete?: () => void): void {
    if (this.isDestroyed) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const avplay = (window as any).webapis?.avplay;
      if (avplay && typeof avplay.seekTo === 'function') {
        avplay.seekTo(
          Math.max(0, Math.floor(ms)),
          () => {
            onComplete?.();
          },
          (err: any) => {
            console.error('[AVPlay] seekTo error:', err);
            onComplete?.();
          }
        );
      } else {
        onComplete?.();
      }
    } catch (e) {
      console.error('[AVPlay] seekTo exception:', e);
      onComplete?.();
    }
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

export function createPlayerDriver(forceHtml5 = false): PlayerDriver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!forceHtml5 && typeof window !== 'undefined' && (window as any).webapis?.avplay) {
    return new TizenAvplayDriver();
  }
  return new Html5PlayerDriver();
}
