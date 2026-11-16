import { PlayerDriver, PlayerState, VideoDisplayRect, VideoLayoutHints } from './driver';
import { Html5PlayerDriver } from './html5-driver';

export const TIZEN_VIEWPORT_WIDTH = 1920;
export const TIZEN_VIEWPORT_HEIGHT = 1080;

export type TizenDisplayRotation =
  | 'PLAYER_DISPLAY_ROTATION_NONE'
  | 'PLAYER_DISPLAY_ROTATION_90'
  | 'PLAYER_DISPLAY_ROTATION_180'
  | 'PLAYER_DISPLAY_ROTATION_270';

export interface ParsedAvplayStreamMetadata {
  width?: number;
  height?: number;
  rotation?: 0 | 90 | 180 | 270;
}

// Track hardware singleton rotation across driver instances so a rotated Direct Play
// video never leaves the native AVPlay plane rotated for the next unrotated video.
let lastHardwareRotation: TizenDisplayRotation = 'PLAYER_DISPLAY_ROTATION_NONE';

export function parseResolutionDimensions(
  resolution?: string | null
): { width: number; height: number } | null {
  if (!resolution || typeof resolution !== 'string') return null;
  const match = resolution.trim().match(/^(\d+)\s*[x×X]\s*(\d+)(?:p|\b)/i);
  if (!match) return null;
  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function normalizeRotationDegrees(raw: unknown): 0 | 90 | 180 | 270 | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return undefined;
    const norm = ((Math.round(raw) % 360) + 360) % 360;
    if (norm === 0 || norm === 90 || norm === 180 || norm === 270) {
      return norm;
    }
    return undefined;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim().toUpperCase();
    if (!trimmed) return undefined;
    if (trimmed.includes('NONE') || trimmed === 'NORMAL' || trimmed === 'HORIZONTAL') {
      return 0;
    }
    const numMatch = trimmed.match(/-?\d+/);
    if (!numMatch) return undefined;
    const parsed = parseInt(numMatch[0], 10);
    if (!Number.isFinite(parsed)) return undefined;
    const norm = ((parsed % 360) + 360) % 360;
    if (norm === 0 || norm === 90 || norm === 180 || norm === 270) {
      return norm;
    }
  }
  return undefined;
}

function parsePositiveInt(raw: unknown): number | undefined {
  if (typeof raw === 'number') {
    const val = Math.round(raw);
    return Number.isFinite(val) && val > 0 ? val : undefined;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const parsed = parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

export function extractAvplayVideoMetadata(streamInfo: unknown): ParsedAvplayStreamMetadata {
  if (!Array.isArray(streamInfo)) return {};

  let bestRotation: 0 | 90 | 180 | 270 | undefined;

  for (const track of streamInfo) {
    if (!track || typeof track !== 'object') continue;
    const record = track as Record<string, unknown>;
    if (String(record.type ?? '').toUpperCase() !== 'VIDEO') continue;

    const lowerMap: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      if (k !== 'extra_info') {
        lowerMap[k.toLowerCase()] = v;
      }
    }

    const extraInfo = record.extra_info;
    if (typeof extraInfo === 'string' && extraInfo.trim().length > 0) {
      try {
        const parsed = JSON.parse(extraInfo);
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            lowerMap[k.toLowerCase()] = v;
          }
        }
      } catch {
        // Regex fallback for non-JSON extra_info strings on older firmwares
        const wMatch = extraInfo.match(/\bwidth["'=:\s]+(\d+)/i);
        const hMatch = extraInfo.match(/\bheight["'=:\s]+(\d+)/i);
        const rMatch = extraInfo.match(/\b(?:rotation|orientation|rotate)["'=:\s]+(-?\d+)/i);
        if (wMatch) lowerMap.width = wMatch[1];
        if (hMatch) lowerMap.height = hMatch[1];
        if (rMatch) lowerMap.rotation = rMatch[1];
      }
    } else if (extraInfo && typeof extraInfo === 'object') {
      for (const [k, v] of Object.entries(extraInfo as Record<string, unknown>)) {
        lowerMap[k.toLowerCase()] = v;
      }
    }

    const width =
      parsePositiveInt(lowerMap.width) ??
      parsePositiveInt(lowerMap.video_width) ??
      parsePositiveInt(lowerMap.display_width) ??
      parsePositiveInt(lowerMap.w);

    const height =
      parsePositiveInt(lowerMap.height) ??
      parsePositiveInt(lowerMap.video_height) ??
      parsePositiveInt(lowerMap.display_height) ??
      parsePositiveInt(lowerMap.h);

    const rotation =
      normalizeRotationDegrees(lowerMap.rotation) ??
      normalizeRotationDegrees(lowerMap.orientation) ??
      normalizeRotationDegrees(lowerMap.rotate) ??
      normalizeRotationDegrees(lowerMap.display_rotation) ??
      normalizeRotationDegrees(lowerMap.angle);

    if (rotation !== undefined && bestRotation === undefined) {
      bestRotation = rotation;
    }

    if (width && height) {
      return {
        width,
        height,
        rotation: rotation ?? bestRotation,
      };
    }
  }

  return bestRotation !== undefined ? { rotation: bestRotation } : {};
}

export function computeFittedDisplayRect(
  videoWidth?: number,
  videoHeight?: number,
  viewportWidth: number = TIZEN_VIEWPORT_WIDTH,
  viewportHeight: number = TIZEN_VIEWPORT_HEIGHT
): VideoDisplayRect {
  if (
    !videoWidth ||
    !videoHeight ||
    !Number.isFinite(videoWidth) ||
    !Number.isFinite(videoHeight) ||
    videoWidth <= 0 ||
    videoHeight <= 0
  ) {
    return { x: 0, y: 0, width: viewportWidth, height: viewportHeight };
  }

  const lhs = videoWidth * viewportHeight;
  const rhs = videoHeight * viewportWidth;

  if (lhs === rhs) {
    return { x: 0, y: 0, width: viewportWidth, height: viewportHeight };
  }

  if (lhs < rhs) {
    // Narrower / taller than 16:9 (e.g. 9:16 vertical, 4:3, 1:1) -> pillarbox
    const rawFittedWidth = (viewportHeight * videoWidth) / videoHeight;
    const fittedWidth = Math.max(
      2,
      Math.min(viewportWidth, Math.round(rawFittedWidth / 2) * 2)
    );
    const x = Math.round((viewportWidth - fittedWidth) / 2);
    return {
      x,
      y: 0,
      width: fittedWidth,
      height: viewportHeight,
    };
  }

  // Wider than 16:9 (e.g. 21:9 / 2.39:1 ultrawide) -> letterbox
  const rawFittedHeight = (viewportWidth * videoHeight) / videoWidth;
  const fittedHeight = Math.max(
    2,
    Math.min(viewportHeight, Math.round(rawFittedHeight / 2) * 2)
  );
  const y = Math.round((viewportHeight - fittedHeight) / 2);
  return {
    x: 0,
    y,
    width: viewportWidth,
    height: fittedHeight,
  };
}

function rotationDegreesToTizenEnum(deg: 0 | 90 | 180 | 270): TizenDisplayRotation {
  switch (deg) {
    case 90:
      return 'PLAYER_DISPLAY_ROTATION_90';
    case 180:
      return 'PLAYER_DISPLAY_ROTATION_180';
    case 270:
      return 'PLAYER_DISPLAY_ROTATION_270';
    default:
      return 'PLAYER_DISPLAY_ROTATION_NONE';
  }
}

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
  private seekFailCallback?: (targetMs: number) => void;
  private displayRectCallback?: (rect: VideoDisplayRect) => void;
  private mediaHints?: VideoLayoutHints;
  private currentIsHls = false;
  private isReady = false;
  private hasResolvedStreamRotation = false;
  private appliedRotation: TizenDisplayRotation = 'PLAYER_DISPLAY_ROTATION_NONE';
  private currentTimeMs = 0;
  private hasReceivedPlaytime = false;
  private isDestroyed = false;
  private isPreparing = false;
  private isSeeking = false;
  private seekSafetyTimer: ReturnType<typeof setTimeout> | null = null;
  private queuedSeek: { targetMs: number; onComplete?: () => void } | null = null;
  private awaitingHlsStartSync = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyLetterboxDisplayMode(avplay: any): void {
    try {
      avplay?.setDisplayMethod?.('PLAYER_DISPLAY_MODE_LETTER_BOX');
    } catch (e) {
      console.warn('[AVPlay] setDisplayMethod failed:', e);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyFullViewportDisplayRect(avplay: any): VideoDisplayRect {
    const fullRect: VideoDisplayRect = {
      x: 0,
      y: 0,
      width: TIZEN_VIEWPORT_WIDTH,
      height: TIZEN_VIEWPORT_HEIGHT,
    };
    try {
      avplay.setDisplayRect(fullRect.x, fullRect.y, fullRect.width, fullRect.height);
    } catch (e) {
      console.warn('[AVPlay] setDisplayRect failed:', e);
    }
    this.applyLetterboxDisplayMode(avplay);
    return fullRect;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyStreamAspectLayout(avplay: any): void {
    if (this.isDestroyed || !avplay) return;

    if (!this.currentIsHls) {
      let streamMeta: ParsedAvplayStreamMetadata = {};
      try {
        const rawInfo = avplay.getCurrentStreamInfo?.();
        streamMeta = extractAvplayVideoMetadata(rawInfo);
        if (streamMeta.rotation !== undefined || (streamMeta.width && streamMeta.height)) {
          this.hasResolvedStreamRotation = true;
        }
      } catch (e) {
        console.warn('[AVPlay] getCurrentStreamInfo failed:', e);
      }

      const rotation =
        streamMeta.rotation ?? normalizeRotationDegrees(this.mediaHints?.rotation) ?? 0;
      const rotationEnum = rotationDegreesToTizenEnum(rotation);

      if (rotationEnum !== 'PLAYER_DISPLAY_ROTATION_NONE') {
        try {
          avplay.setDisplayRotation?.(rotationEnum);
          lastHardwareRotation = rotationEnum;
          this.appliedRotation = rotationEnum;
        } catch (e) {
          console.warn('[AVPlay] setDisplayRotation failed:', e);
        }
      } else if (this.appliedRotation !== 'PLAYER_DISPLAY_ROTATION_NONE') {
        try {
          avplay.setDisplayRotation?.('PLAYER_DISPLAY_ROTATION_NONE');
          lastHardwareRotation = 'PLAYER_DISPLAY_ROTATION_NONE';
          this.appliedRotation = 'PLAYER_DISPLAY_ROTATION_NONE';
        } catch (e) {
          console.warn('[AVPlay] setDisplayRotation reset failed:', e);
        }
      }
    }

    // Always keep AVPlay bound to the full 1920x1080 hardware plane with
    // PLAYER_DISPLAY_MODE_LETTER_BOX so AVPlay's hardware scaler aspect-fits
    // 9:16 vertical, 4:3, 1:1, 21:9, and 16:9 videos natively without blanking
    // the video overlay plane on Samsung TU-series Tizen 5.5 firmwares.
    const fullRect = this.applyFullViewportDisplayRect(avplay);
    this.displayRectCallback?.(fullRect);
  }

  private clearSeekInFlight(): void {
    this.isSeeking = false;
    if (this.seekSafetyTimer !== null) {
      clearTimeout(this.seekSafetyTimer);
      this.seekSafetyTimer = null;
    }
  }

  private armSeekSafetyTimer(): void {
    if (this.seekSafetyTimer !== null) {
      clearTimeout(this.seekSafetyTimer);
    }
    this.seekSafetyTimer = setTimeout(() => {
      this.seekSafetyTimer = null;
      if (this.isSeeking && !this.isDestroyed) {
        this.isSeeking = false;
        this.flushQueuedSeek();
      }
    }, 5000);
  }

  private flushQueuedSeek(): void {
    if (this.isDestroyed || this.isPreparing || this.isSeeking || !this.queuedSeek) {
      return;
    }
    const next = this.queuedSeek;
    this.queuedSeek = null;
    this.executeSeek(next.targetMs, next.onComplete);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rewindHlsLiveEdge(avplay: any): void {
    if (this.isDestroyed || typeof avplay?.seekTo !== 'function') return;
    this.isSeeking = true;
    this.armSeekSafetyTimer();
    try {
      avplay.seekTo(
        0,
        () => {
          if (this.isDestroyed) return;
          this.clearSeekInFlight();
          this.currentTimeMs = 0;
          this.stateCallback?.('playing');
          this.flushQueuedSeek();
        },
        (err: any) => {
          if (this.isDestroyed) return;
          console.warn('[AVPlay] HLS live-edge rewind to 0ms failed:', err);
          this.clearSeekInFlight();
          this.stateCallback?.('playing');
          this.flushQueuedSeek();
        }
      );
    } catch (e) {
      console.warn('[AVPlay] HLS live-edge rewind exception:', e);
      this.clearSeekInFlight();
      this.stateCallback?.('playing');
      this.flushQueuedSeek();
    }
  }

  async init(
    _container: HTMLElement,
    streamUrl: string,
    startMs: number,
    hints?: VideoLayoutHints
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avplay = (window as any).webapis?.avplay;
    if (!avplay) {
      throw new Error('Tizen AVPlay API not available');
    }

    if (hints !== undefined) {
      this.mediaHints = hints;
    }

    this.isPreparing = false;
    this.isReady = false;
    this.hasResolvedStreamRotation = false;
    this.appliedRotation = 'PLAYER_DISPLAY_ROTATION_NONE';
    this.clearSeekInFlight();
    this.queuedSeek = null;
    this.hasReceivedPlaytime = false;
    this.awaitingHlsStartSync = false;

    const isHls = streamUrl.includes('.m3u8') || streamUrl.includes('/hls/');
    this.currentIsHls = isHls;
    const initialStartMs = startMs > 0 ? Math.floor(startMs) : 0;
    this.currentTimeMs = initialStartMs;

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

    if (lastHardwareRotation !== 'PLAYER_DISPLAY_ROTATION_NONE') {
      try {
        avplay.setDisplayRotation?.('PLAYER_DISPLAY_ROTATION_NONE');
      } catch (e) {
        console.warn('[AVPlay] setDisplayRotation reset after open failed:', e);
      }
      lastHardwareRotation = 'PLAYER_DISPLAY_ROTATION_NONE';
    }

    try {
      avplay.setDisplayRect(0, 0, TIZEN_VIEWPORT_WIDTH, TIZEN_VIEWPORT_HEIGHT);
    } catch (e) {
      console.warn('[AVPlay] setDisplayRect failed:', e);
    }
    this.applyLetterboxDisplayMode(avplay);

    // Subtitles are drawn by our own overlay (so appearance and timing can be adjusted).
    // Silence AVPlay's native subtitle renderer so it never shows a second, unadjustable copy.
    const silenceNativeSubtitles = () => {
      try {
        avplay.setSilentSubtitle?.(true);
      } catch (e) {
        console.warn('[AVPlay] setSilentSubtitle failed:', e);
      }
    };
    silenceNativeSubtitles();

    avplay.setListener({
      onbufferingstart: () => {
        if (!this.isDestroyed) {
          this.stateCallback?.('buffering');
        }
      },
      onbufferingcomplete: () => {
        if (this.isDestroyed) return;
        if (!this.currentIsHls && !this.hasResolvedStreamRotation) {
          try {
            const lateMeta = extractAvplayVideoMetadata(avplay.getCurrentStreamInfo?.());
            if (lateMeta.rotation) {
              this.applyStreamAspectLayout(avplay);
            } else if (lateMeta.rotation === 0 || (lateMeta.width && lateMeta.height)) {
              this.hasResolvedStreamRotation = true;
            }
          } catch {
            // Ignored
          }
        }
        if (this.awaitingHlsStartSync && !this.isSeeking) {
          try {
            const cur = typeof avplay.getCurrentTime === 'function' ? avplay.getCurrentTime() : 0;
            if (cur > 3000) {
              this.awaitingHlsStartSync = false;
              this.rewindHlsLiveEdge(avplay);
              return;
            }
          } catch {
            // Ignored
          }
        }
        this.stateCallback?.('playing');
      },
      oncurrentplaytime: (ms: number) => {
        if (this.isDestroyed || this.isSeeking) return;
        if (this.awaitingHlsStartSync) {
          this.awaitingHlsStartSync = false;
          if (ms > 3000) {
            // EVENT HLS playlist without #EXT-X-ENDLIST joined at live edge:
            // suppress bogus live-edge timestamp and rewind to segment 0 immediately.
            this.rewindHlsLiveEdge(avplay);
            return;
          }
        }
        this.currentTimeMs = ms;
        this.hasReceivedPlaytime = true;
        try {
          const rawDur = avplay.getDuration();
          const duration = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : 0;
          this.timeCallback?.(ms, duration);
        } catch {
          // Ignored
        }
      },
      onerror: (err: any) => {
        if (this.isDestroyed) return;
        console.error('[AVPlay] Hardware error:', err);
        const errStr = formatAvplayError(err, 'AVPlay Hardware Error');
        this.stateCallback?.('error');
        this.errorCallback?.(errStr);
      },
      onstreamcompleted: () => {
        if (!this.isDestroyed) {
          this.stateCallback?.('ended');
        }
      },
    });

    // Tizen AVPlay only accepts seekTo in READY, PLAYING, or PAUSED states (never IDLE/PREPARING).
    // Calling seekTo in READY state (inside prepareAsync success callback before play()) positions
    // both Direct Play streams and EVENT HLS playlists (including 0ms segment-0 start) cleanly.
    this.isPreparing = true;
    avplay.prepareAsync(
      () => {
        this.isPreparing = false;
        if (this.isDestroyed) return;
        this.isReady = true;
        silenceNativeSubtitles();
        this.applyStreamAspectLayout(avplay);

        const queued = this.queuedSeek;
        this.queuedSeek = null;

        const readySeekTarget: number | null = queued
          ? queued.targetMs
          : initialStartMs > 0
          ? initialStartMs
          : isHls
          ? 0
          : null;
        const readyOnComplete = queued?.onComplete;

        this.awaitingHlsStartSync = isHls && readySeekTarget === 0;

        const beginPlay = () => {
          if (this.isDestroyed) return;
          try {
            avplay.play();
          } catch (e) {
            console.error('[AVPlay] play failed:', e);
          }
          // Re-assert LETTER_BOX in PLAYING state for Samsung TU-series firmwares
          this.applyLetterboxDisplayMode(avplay);
          this.stateCallback?.('playing');
        };

        if (readySeekTarget !== null && typeof avplay.seekTo === 'function') {
          this.isSeeking = true;
          this.armSeekSafetyTimer();
          try {
            avplay.seekTo(
              readySeekTarget,
              () => {
                if (this.isDestroyed) return;
                this.clearSeekInFlight();
                this.currentTimeMs = readySeekTarget;
                readyOnComplete?.();
                beginPlay();
                this.flushQueuedSeek();
              },
              (err: any) => {
                if (this.isDestroyed) return;
                this.clearSeekInFlight();
                console.warn('[AVPlay] seekTo in READY state failed, retrying after play:', err);
                beginPlay();
                if (readySeekTarget > 0) {
                  this.executeSeek(readySeekTarget, readyOnComplete);
                } else {
                  readyOnComplete?.();
                  this.flushQueuedSeek();
                }
              }
            );
            return;
          } catch (e) {
            this.clearSeekInFlight();
            console.warn('[AVPlay] seekTo in READY exception, retrying after play:', e);
            beginPlay();
            if (readySeekTarget > 0) {
              this.executeSeek(readySeekTarget, readyOnComplete);
            } else {
              readyOnComplete?.();
              this.flushQueuedSeek();
            }
            return;
          }
        }

        beginPlay();
        this.flushQueuedSeek();
      },
      (err: any) => {
        this.isPreparing = false;
        this.queuedSeek = null;
        if (!this.isDestroyed) {
          console.error('[AVPlay] prepareAsync failed:', err);
          const errStr = formatAvplayError(err, 'AVPlay Prepare Error');
          this.stateCallback?.('error');
          this.errorCallback?.(errStr);
        }
      }
    );
  }

  setMediaHints(hints: VideoLayoutHints | undefined): void {
    this.mediaHints = hints;
    if (this.isDestroyed || !this.isReady || this.currentIsHls || this.hasResolvedStreamRotation) {
      return;
    }
    const hintRotation = normalizeRotationDegrees(hints?.rotation) ?? 0;
    if (hintRotation === 0 && this.appliedRotation === 'PLAYER_DISPLAY_ROTATION_NONE') {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avplay = (window as any).webapis?.avplay;
    if (avplay) {
      this.applyStreamAspectLayout(avplay);
    }
  }

  onDisplayRectChange(callback: (rect: VideoDisplayRect) => void): void {
    this.displayRectCallback = callback;
  }

  play(): void {
    if (this.isDestroyed) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avplay = (window as any).webapis?.avplay;
    avplay?.play();
    this.applyLetterboxDisplayMode(avplay);
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
    this.awaitingHlsStartSync = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avplay = (window as any).webapis?.avplay;
    if (!avplay || typeof avplay.seekTo !== 'function') {
      onComplete?.();
      return;
    }

    const targetMs = Math.max(0, Math.floor(ms));

    // Queue seek if prepareAsync is still running or another async seekTo is in flight,
    // preventing INVALID_STATE errors and bogus relative jumps on Tizen hardware.
    if (this.isPreparing || this.isSeeking) {
      this.queuedSeek?.onComplete?.();
      this.queuedSeek = { targetMs, onComplete };
      return;
    }

    this.executeSeek(targetMs, onComplete);
  }

  private executeSeek(targetMs: number, onComplete?: () => void): void {
    if (this.isDestroyed) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avplay = (window as any).webapis?.avplay;
    if (!avplay || typeof avplay.seekTo !== 'function') {
      onComplete?.();
      return;
    }

    this.isSeeking = true;
    this.armSeekSafetyTimer();

    const finishSeek = (succeeded: boolean) => {
      this.clearSeekInFlight();
      if (succeeded) {
        this.currentTimeMs = targetMs;
      } else {
        this.seekFailCallback?.(targetMs);
      }
      onComplete?.();
      this.flushQueuedSeek();
    };

    const tryRelativeJump = () => {
      try {
        const avplayCur =
          typeof avplay.getCurrentTime === 'function' ? avplay.getCurrentTime() : 0;
        const cur = this.hasReceivedPlaytime
          ? this.currentTimeMs
          : avplayCur > 0
          ? avplayCur
          : this.currentTimeMs;
        const diff = targetMs - cur;
        if (diff === 0) {
          finishSeek(true);
          return;
        }
        if (diff > 0 && typeof avplay.jumpForward === 'function') {
          avplay.jumpForward(
            diff,
            () => finishSeek(true),
            (jumpErr: any) => {
              console.warn('[AVPlay] jumpForward failed:', jumpErr);
              finishSeek(false);
            }
          );
          return;
        } else if (diff < 0 && typeof avplay.jumpBackward === 'function') {
          avplay.jumpBackward(
            Math.abs(diff),
            () => finishSeek(true),
            (jumpErr: any) => {
              console.warn('[AVPlay] jumpBackward failed:', jumpErr);
              finishSeek(false);
            }
          );
          return;
        }
      } catch {
        // Ignore
      }
      finishSeek(false);
    };

    try {
      avplay.seekTo(
        targetMs,
        () => finishSeek(true),
        (err: any) => {
          console.warn('[AVPlay] seekTo error, trying relative jump fallback:', err);
          tryRelativeJump();
        }
      );
    } catch (e: any) {
      console.error('[AVPlay] seekTo exception:', e);
      tryRelativeJump();
    }
  }

  setSubtitleTrack(_trackUrl: string | null): void {
    // Handled via AVPlay or WebVTT overlay
  }

  destroy(): void {
    this.isDestroyed = true;
    this.isPreparing = false;
    this.isReady = false;
    this.hasResolvedStreamRotation = false;
    this.clearSeekInFlight();
    this.queuedSeek = null;
    this.awaitingHlsStartSync = false;
    this.timeCallback = undefined;
    this.stateCallback = undefined;
    this.errorCallback = undefined;
    this.seekFailCallback = undefined;
    this.displayRectCallback = undefined;
    this.mediaHints = undefined;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const avplay = (window as any).webapis?.avplay;
      if (avplay) {
        if (this.appliedRotation !== 'PLAYER_DISPLAY_ROTATION_NONE') {
          try {
            avplay.setDisplayRotation?.('PLAYER_DISPLAY_ROTATION_NONE');
            lastHardwareRotation = 'PLAYER_DISPLAY_ROTATION_NONE';
          } catch {
            // Ignored
          }
          this.appliedRotation = 'PLAYER_DISPLAY_ROTATION_NONE';
        }
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

  onSeekFailure(callback: (targetMs: number) => void): void {
    this.seekFailCallback = callback;
  }
}

export function createPlayerDriver(forceHtml5 = false): PlayerDriver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!forceHtml5 && typeof window !== 'undefined' && (window as any).webapis?.avplay) {
    return new TizenAvplayDriver();
  }
  return new Html5PlayerDriver();
}
