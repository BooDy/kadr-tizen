import { ApiClient } from './client';
import { getAuthenticatedImageUrl } from '../utils/imageUrl';

export interface StoryboardSheet {
  index: number;
  url: string;
  first_tile: number;
  tile_count: number;
}

export interface StoryboardManifest {
  interval_ms: number;
  tile_width: number;
  tile_height: number;
  columns: number;
  rows: number;
  total_tiles: number;
  sheets: StoryboardSheet[];
}

export type StoryboardFetchResult =
  | { status: 'ready'; manifest: StoryboardManifest }
  | { status: 'generating'; retryAfterMs: number }
  | { status: 'unavailable'; httpStatus?: number; reason?: string }
  | { status: 'aborted' };

export const DEFAULT_STORYBOARD_RETRY_MS = 5000;
export const DEFAULT_STORYBOARD_MAX_RETRIES = 12;
export const DEFAULT_FRAME_WIDTH = 320;
export const DEFAULT_FRAME_SNAP_SECONDS = 2;

const INELIGIBLE_MEDIA_TYPES = new Set([
  'live_channel',
  'music',
  'audiobook',
  'show',
  'season',
]);

export interface StoryboardEligibilityInput {
  mediaType?: string | null;
  durationSeconds?: number;
  durationMs?: number;
  isLive?: boolean;
}

/**
 * Determines whether an item is eligible for visual storyboard / single-frame previews.
 * Skips live channels, non-positive durations, and audio-only / container media types.
 */
export function isStoryboardEligibleMedia({
  mediaType,
  durationSeconds,
  durationMs,
  isLive,
}: StoryboardEligibilityInput): boolean {
  if (isLive) return false;

  if (typeof mediaType === 'string' && mediaType.trim().length > 0) {
    if (INELIGIBLE_MEDIA_TYPES.has(mediaType.trim().toLowerCase())) {
      return false;
    }
  }

  if (durationSeconds !== undefined) {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return false;
    }
  }

  if (durationMs !== undefined) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return false;
    }
  }

  if (durationSeconds === undefined && durationMs === undefined) {
    return false;
  }

  return true;
}

export function isValidStoryboardManifest(data: unknown): data is StoryboardManifest {
  if (!data || typeof data !== 'object') return false;
  const m = data as Partial<StoryboardManifest>;
  if (
    typeof m.interval_ms !== 'number' ||
    !Number.isFinite(m.interval_ms) ||
    m.interval_ms <= 0 ||
    typeof m.tile_width !== 'number' ||
    !Number.isFinite(m.tile_width) ||
    m.tile_width <= 0 ||
    typeof m.tile_height !== 'number' ||
    !Number.isFinite(m.tile_height) ||
    m.tile_height <= 0 ||
    typeof m.columns !== 'number' ||
    !Number.isFinite(m.columns) ||
    m.columns <= 0 ||
    typeof m.rows !== 'number' ||
    !Number.isFinite(m.rows) ||
    m.rows <= 0 ||
    typeof m.total_tiles !== 'number' ||
    !Number.isFinite(m.total_tiles) ||
    m.total_tiles <= 0 ||
    !Array.isArray(m.sheets) ||
    m.sheets.length === 0
  ) {
    return false;
  }

  return m.sheets.every(
    (sheet) =>
      Boolean(sheet) &&
      typeof sheet.index === 'number' &&
      sheet.index >= 0 &&
      typeof sheet.url === 'string' &&
      sheet.url.trim().length > 0 &&
      typeof sheet.first_tile === 'number' &&
      sheet.first_tile >= 0 &&
      typeof sheet.tile_count === 'number' &&
      sheet.tile_count > 0
  );
}

export interface FetchStoryboardOptions {
  signal?: AbortSignal;
  token?: string;
}

/**
 * Fetches `GET /api/v1/media/{item_id}/storyboard`.
 * Never rejects: converts 403/404/503, network failures, and unmocked test stubs cleanly
 * into discriminated union states so playback is never disrupted.
 */
export async function fetchStoryboardManifest(
  client: ApiClient,
  itemId: number | string,
  options: FetchStoryboardOptions = {}
): Promise<StoryboardFetchResult> {
  if (!itemId || itemId === 'undefined' || itemId === 'null') {
    return { status: 'unavailable', reason: 'Invalid media item ID' };
  }
  if (options.signal?.aborted) {
    return { status: 'aborted' };
  }

  const requestInit: RequestInit = {};
  if (options.signal) {
    requestInit.signal = options.signal;
  }
  if (options.token) {
    requestInit.headers = { Authorization: `Bearer ${options.token}` };
  }

  try {
    const data = await client.fetch<unknown>(
      `/api/v1/media/${encodeURIComponent(String(itemId))}/storyboard`,
      requestInit
    );

    if (options.signal?.aborted) {
      return { status: 'aborted' };
    }

    if (
      data &&
      typeof data === 'object' &&
      (data as { status?: unknown }).status === 'generating'
    ) {
      const rawRetry = (data as { retry_after?: unknown }).retry_after;
      const retryAfterMs =
        typeof rawRetry === 'number' && Number.isFinite(rawRetry) && rawRetry > 0
          ? rawRetry * 1000
          : DEFAULT_STORYBOARD_RETRY_MS;
      return { status: 'generating', retryAfterMs };
    }

    if (isValidStoryboardManifest(data)) {
      return { status: 'ready', manifest: data };
    }

    return { status: 'unavailable', reason: 'Empty or invalid storyboard manifest' };
  } catch (err: unknown) {
    if (
      options.signal?.aborted ||
      (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError')
    ) {
      return { status: 'aborted' };
    }

    const message = err instanceof Error ? err.message : String(err);
    const statusMatch = message.match(/HTTP error (\d+)/i);
    const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : undefined;

    if (httpStatus === 202) {
      return { status: 'generating', retryAfterMs: DEFAULT_STORYBOARD_RETRY_MS };
    }

    return {
      status: 'unavailable',
      httpStatus,
      reason: message,
    };
  }
}

export interface StoryboardSheetUrlParams {
  serverUrl: string;
  sheetUrl: string;
  token?: string;
  unlockTokens?: string[];
}

/**
 * Appends `?token=...&unlocked=...` to a relative storyboard sheet URL (`/api/v1/media/{id}/storyboard/{idx}.jpg`).
 */
export function getStoryboardSheetUrl({
  serverUrl,
  sheetUrl,
  token,
  unlockTokens,
}: StoryboardSheetUrlParams): string | undefined {
  return getAuthenticatedImageUrl(serverUrl, sheetUrl, token, unlockTokens);
}

/**
 * Snaps a seek target timestamp (in seconds) to a discrete step (2s-5s) and clamps to `0..durationSeconds`.
 */
export function snapFrameTimestamp(
  targetSeconds: number,
  durationSeconds: number,
  stepSeconds: number = DEFAULT_FRAME_SNAP_SECONDS
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(targetSeconds)) {
    return 0;
  }
  const safeStep = Number.isFinite(stepSeconds) && stepSeconds > 0 ? stepSeconds : DEFAULT_FRAME_SNAP_SECONDS;
  const maxSeconds = Math.max(0, Math.floor(durationSeconds));
  const clamped = Math.max(0, Math.min(durationSeconds, targetSeconds));
  const snapped = Math.round(Math.round(clamped / safeStep) * safeStep);
  return Math.max(0, Math.min(maxSeconds, snapped));
}

/**
 * Clamps requested `/frame` width to `160..=640` and rounds down to an even pixel width.
 */
export function clampFrameWidth(width: number = DEFAULT_FRAME_WIDTH): number {
  const safe = Number.isFinite(width) ? Math.floor(width) : DEFAULT_FRAME_WIDTH;
  const clamped = Math.max(160, Math.min(640, safe));
  return clamped & ~1;
}

export interface FrameFallbackUrlParams {
  serverUrl: string;
  itemId: number | string;
  targetSeconds: number;
  durationSeconds: number;
  width?: number;
  stepSeconds?: number;
  token?: string;
  unlockTokens?: string[];
}

/**
 * Builds an authenticated single-frame fallback URL:
 * `/api/v1/media/{item_id}/frame?t=<snapped>&w=320&token=...&unlocked=...`
 */
export function getFrameFallbackUrl({
  serverUrl,
  itemId,
  targetSeconds,
  durationSeconds,
  width = DEFAULT_FRAME_WIDTH,
  stepSeconds = DEFAULT_FRAME_SNAP_SECONDS,
  token,
  unlockTokens,
}: FrameFallbackUrlParams): string | undefined {
  if (
    !itemId ||
    itemId === 'undefined' ||
    itemId === 'null' ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    !Number.isFinite(targetSeconds)
  ) {
    return undefined;
  }

  const snapped = snapFrameTimestamp(targetSeconds, durationSeconds, stepSeconds);
  const w = clampFrameWidth(width);
  const path = `/api/v1/media/${encodeURIComponent(String(itemId))}/frame?t=${snapped}&w=${w}`;
  return getAuthenticatedImageUrl(serverUrl, path, token, unlockTokens);
}
