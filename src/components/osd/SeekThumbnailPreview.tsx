import { useState } from 'react';
import { StoryboardTileCrop } from '../../player/storyboard';

export const TV_OSD_TRACK_WIDTH_PX = 1824; // 1920px viewport minus 2 * 48px (p-12) horizontal padding
export const DEFAULT_PILL_WIDTH_PX = 140;
export const DEFAULT_FRAME_CARD_WIDTH_PX = 320;
export const DEFAULT_FRAME_CARD_HEIGHT_PX = 180;

export interface SeekThumbnailPreviewProps {
  positionMs: number;
  durationMs: number;
  progressPercent?: number;
  spriteCrop?: StoryboardTileCrop | null;
  frameUrl?: string | null;
  trackWidthPx?: number;
}

/**
 * Formats milliseconds into `MM:SS` (or `H:MM:SS` for >= 1h) for the trickplay timestamp badge.
 */
export function formatSeekTimestamp(ms: number): string {
  const totalSecs = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const mm = mins < 10 ? `0${mins}` : `${mins}`;
  const ss = secs < 10 ? `0${secs}` : `${secs}`;
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Clamps the horizontal anchor percentage so a centered floating card of width `cardWidthPx`
 * never clips at 0% or 100% edges on a 1920x1080 TV viewport (without relying on CSS `clamp()`,
 * which is unsupported in Chromium 69).
 */
export function clampPreviewPercent(
  progressPercent: number,
  cardWidthPx: number,
  trackWidthPx: number = TV_OSD_TRACK_WIDTH_PX
): number {
  const safePercent = Number.isFinite(progressPercent)
    ? Math.min(100, Math.max(0, progressPercent))
    : 0;
  const safeTrack =
    Number.isFinite(trackWidthPx) && trackWidthPx > 0 ? trackWidthPx : TV_OSD_TRACK_WIDTH_PX;
  const safeCardWidth = Number.isFinite(cardWidthPx) && cardWidthPx > 0 ? cardWidthPx : DEFAULT_PILL_WIDTH_PX;

  const minPercent = Math.min(50, (safeCardWidth / 2 / safeTrack) * 100);
  const maxPercent = Math.max(50, 100 - minPercent);

  return Math.min(maxPercent, Math.max(minPercent, safePercent));
}

export function SeekThumbnailPreview({
  positionMs,
  durationMs,
  progressPercent,
  spriteCrop,
  frameUrl,
  trackWidthPx = TV_OSD_TRACK_WIDTH_PX,
}: SeekThumbnailPreviewProps) {
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  const computedPercent =
    progressPercent !== undefined
      ? progressPercent
      : durationMs > 0 && Number.isFinite(durationMs)
      ? Math.min(100, Math.max(0, (Math.max(0, positionMs) / durationMs) * 100))
      : 0;

  const canShowSprite = Boolean(spriteCrop && spriteCrop.sheetUrl && !failedUrls[spriteCrop.sheetUrl]);
  const canShowFrame = Boolean(!canShowSprite && frameUrl && !failedUrls[frameUrl]);

  // Account for card padding + border (~16px) when clamping horizontally
  const activeCardWidthPx = canShowSprite && spriteCrop
    ? spriteCrop.width + 16
    : canShowFrame
    ? DEFAULT_FRAME_CARD_WIDTH_PX + 16
    : DEFAULT_PILL_WIDTH_PX;

  const clampedLeftPercent = clampPreviewPercent(computedPercent, activeCardWidthPx, trackWidthPx);
  const formattedTime = formatSeekTimestamp(positionMs);

  return (
    <div
      data-testid="seek-thumbnail-preview"
      data-mode={canShowSprite ? 'sprite' : canShowFrame ? 'frame' : 'pill'}
      className="absolute bottom-full mb-5 z-30 pointer-events-none select-none"
      style={{
        left: `${clampedLeftPercent}%`,
        transform: 'translateX(-50%)',
      }}
    >
      {canShowSprite && spriteCrop ? (
        <div className="bg-[#121318]/95 border-2 border-[#FFB800]/80 rounded-2xl p-1.5 shadow-2xl flex flex-col items-center">
          <div
            data-testid="seek-thumbnail-sprite"
            className="rounded-xl overflow-hidden bg-[#0d0e15] shrink-0"
            style={{
              width: `${spriteCrop.width}px`,
              height: `${spriteCrop.height}px`,
              backgroundImage: `url("${spriteCrop.sheetUrl}")`,
              backgroundPosition: `-${spriteCrop.x}px -${spriteCrop.y}px`,
              backgroundSize: `${spriteCrop.sheetWidth}px ${spriteCrop.sheetHeight}px`,
              backgroundRepeat: 'no-repeat',
            }}
          />
          <img
            data-testid="seek-thumbnail-sprite-probe"
            src={spriteCrop.sheetUrl}
            alt=""
            aria-hidden="true"
            className="hidden"
            onError={() =>
              setFailedUrls((prev) => ({
                ...prev,
                [spriteCrop.sheetUrl]: true,
              }))
            }
          />
          <div
            data-testid="seek-thumbnail-timestamp"
            className="mt-1.5 px-3 py-0.5 rounded-lg bg-[#2A0A0A]/90 text-[#FFB800] font-mono font-bold text-lg tracking-wider"
          >
            {formattedTime}
          </div>
        </div>
      ) : canShowFrame && frameUrl ? (
        <div className="bg-[#121318]/95 border-2 border-[#FFB800]/80 rounded-2xl p-1.5 shadow-2xl flex flex-col items-center">
          <div
            className="rounded-xl overflow-hidden bg-[#0d0e15] shrink-0"
            style={{
              width: `${DEFAULT_FRAME_CARD_WIDTH_PX}px`,
              height: `${DEFAULT_FRAME_CARD_HEIGHT_PX}px`,
            }}
          >
            <img
              data-testid="seek-thumbnail-frame"
              src={frameUrl}
              alt={`Preview at ${formattedTime}`}
              className="w-full h-full object-cover block"
              onError={() =>
                setFailedUrls((prev) => ({
                  ...prev,
                  [frameUrl]: true,
                }))
              }
            />
          </div>
          <div
            data-testid="seek-thumbnail-timestamp"
            className="mt-1.5 px-3 py-0.5 rounded-lg bg-[#2A0A0A]/90 text-[#FFB800] font-mono font-bold text-lg tracking-wider"
          >
            {formattedTime}
          </div>
        </div>
      ) : (
        <div
          data-testid="seek-thumbnail-pill"
          className="px-5 py-2 rounded-full bg-[#2A0A0A]/95 border-2 border-[#FFB800]/80 text-[#FFB800] font-mono font-bold text-xl tracking-wider shadow-2xl whitespace-nowrap"
        >
          {formattedTime}
        </div>
      )}
    </div>
  );
}
