import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiClient } from '../api/client';
import {
  DEFAULT_FRAME_SNAP_SECONDS,
  DEFAULT_FRAME_WIDTH,
  DEFAULT_STORYBOARD_MAX_RETRIES,
  DEFAULT_STORYBOARD_RETRY_MS,
  StoryboardManifest,
  fetchStoryboardManifest,
  getFrameFallbackUrl,
  getStoryboardSheetUrl,
  isStoryboardEligibleMedia,
} from '../api/storyboard';

export const STORYBOARD_PREFETCH_LOCAL_INDEX = 80;
export const DEFAULT_FRAME_DEBOUNCE_MS = 200;

export type StoryboardStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'unavailable';

export interface StoryboardTileCrop {
  sheetIndex: number;
  tileIndex: number;
  localIndex: number;
  col: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  sheetWidth: number;
  sheetHeight: number;
  sheetUrl: string;
  nextSheetUrl?: string;
}

export interface ResolveStoryboardTileParams {
  manifest: StoryboardManifest;
  targetSeconds: number;
  serverUrl: string;
  token?: string;
  unlockTokens?: string[];
}

/**
 * Computes the exact sprite sheet URL and 10x10 tile crop coordinates for `targetSeconds`.
 * Also computes `nextSheetUrl` when `localIndex >= 80` and `sheets[sheetIndex + 1]` exists.
 */
export function resolveStoryboardTile({
  manifest,
  targetSeconds,
  serverUrl,
  token,
  unlockTokens,
}: ResolveStoryboardTileParams): StoryboardTileCrop | null {
  if (
    !manifest ||
    manifest.columns <= 0 ||
    manifest.rows <= 0 ||
    manifest.total_tiles <= 0 ||
    manifest.interval_ms <= 0 ||
    manifest.tile_width <= 0 ||
    manifest.tile_height <= 0 ||
    !Array.isArray(manifest.sheets) ||
    manifest.sheets.length === 0
  ) {
    return null;
  }

  const tilesPerSheet = manifest.columns * manifest.rows;
  const safeSeconds = Number.isFinite(targetSeconds) ? Math.max(0, targetSeconds) : 0;
  const tileIndex = Math.min(
    manifest.total_tiles - 1,
    Math.floor((safeSeconds * 1000) / manifest.interval_ms)
  );
  const sheetIndex = Math.floor(tileIndex / tilesPerSheet);
  const sheet =
    manifest.sheets[sheetIndex] ?? manifest.sheets.find((s) => s.index === sheetIndex);
  if (!sheet) {
    return null;
  }

  const rawLocalIndex = tileIndex - sheet.first_tile;
  const maxLocalIndex = Math.max(0, Math.min(tilesPerSheet, sheet.tile_count || tilesPerSheet) - 1);
  const localIndex = Math.max(0, Math.min(maxLocalIndex, rawLocalIndex));

  const col = localIndex % manifest.columns;
  const row = Math.floor(localIndex / manifest.columns);
  const x = col * manifest.tile_width;
  const y = row * manifest.tile_height;
  const width = manifest.tile_width;
  const height = manifest.tile_height;
  const sheetWidth = manifest.columns * manifest.tile_width;
  const sheetHeight = manifest.rows * manifest.tile_height;

  const sheetUrl = getStoryboardSheetUrl({
    serverUrl,
    sheetUrl: sheet.url,
    token,
    unlockTokens,
  });

  if (!sheetUrl) {
    return null;
  }

  let nextSheetUrl: string | undefined;
  if (localIndex >= STORYBOARD_PREFETCH_LOCAL_INDEX) {
    const nextSheet =
      manifest.sheets[sheetIndex + 1] ??
      manifest.sheets.find((s) => s.index === sheetIndex + 1);
    if (nextSheet) {
      nextSheetUrl = getStoryboardSheetUrl({
        serverUrl,
        sheetUrl: nextSheet.url,
        token,
        unlockTokens,
      });
    }
  }

  return {
    sheetIndex,
    tileIndex,
    localIndex,
    col,
    row,
    x,
    y,
    width,
    height,
    sheetWidth,
    sheetHeight,
    sheetUrl,
    nextSheetUrl,
  };
}

export interface PrefetchableImage {
  src: string;
  onerror: ((ev?: unknown) => void) | null;
}

/**
 * Prefetches a sprite sheet binary into the browser's HTTP image cache once per session.
 */
export function prefetchStoryboardSheet(
  url: string | undefined,
  prefetchedSet: Set<string>,
  createImage?: () => PrefetchableImage | null
): boolean {
  if (!url || prefetchedSet.has(url)) {
    return false;
  }
  const img = createImage
    ? createImage()
    : typeof Image !== 'undefined'
    ? (new Image() as unknown as PrefetchableImage)
    : null;
  if (!img) {
    return false;
  }
  prefetchedSet.add(url);
  img.onerror = () => {
    // Ignore prefetch errors silently
  };
  img.src = url;
  return true;
}

export interface UseStoryboardOptions {
  client: ApiClient;
  itemId: number | string;
  serverUrl: string;
  token?: string;
  durationMs: number;
  mediaType?: string | null;
  isLive?: boolean;
  isSeeking: boolean;
  previewTimeMs: number;
  pollIntervalMs?: number;
  maxPollRetries?: number;
  frameDebounceMs?: number;
  frameSnapSeconds?: number;
}

export interface UseStoryboardResult {
  status: StoryboardStatus;
  manifest: StoryboardManifest | null;
  spriteCrop: StoryboardTileCrop | null;
  frameUrl: string | null;
}

interface InternalStoryboardState {
  itemKey: string;
  status: StoryboardStatus;
  manifest: StoryboardManifest | null;
}

export function useStoryboard({
  client,
  itemId,
  serverUrl,
  token,
  durationMs,
  mediaType,
  isLive = false,
  isSeeking,
  previewTimeMs,
  pollIntervalMs = DEFAULT_STORYBOARD_RETRY_MS,
  maxPollRetries = DEFAULT_STORYBOARD_MAX_RETRIES,
  frameDebounceMs = DEFAULT_FRAME_DEBOUNCE_MS,
  frameSnapSeconds = DEFAULT_FRAME_SNAP_SECONDS,
}: UseStoryboardOptions): UseStoryboardResult {
  const itemKey = String(itemId ?? '');
  const hasValidItemId = Boolean(itemId && itemKey !== 'undefined' && itemKey !== 'null');

  const isEligible = useMemo(
    () =>
      hasValidItemId &&
      isStoryboardEligibleMedia({
        mediaType,
        durationMs,
        isLive,
      }),
    [hasValidItemId, mediaType, durationMs > 0, isLive]
  );

  const [state, setState] = useState<InternalStoryboardState>(() => ({
    itemKey,
    status: isEligible ? 'loading' : 'idle',
    manifest: null,
  }));

  const [frameState, setFrameState] = useState<{ itemKey: string; url: string | null }>({
    itemKey,
    url: null,
  });

  const prefetchedSheetsRef = useRef<Set<string>>(new Set());
  const prevItemKeyRef = useRef<string>(itemKey);
  if (prevItemKeyRef.current !== itemKey) {
    prevItemKeyRef.current = itemKey;
    prefetchedSheetsRef.current.clear();
  }

  const ineligibleKnownRef = useRef(false);
  ineligibleKnownRef.current = Boolean(hasValidItemId && (isLive || Boolean(mediaType)));

  // Fetch storyboard manifest and handle 202 Accepted background polling
  useEffect(() => {
    if (!isEligible) {
      setState({
        itemKey,
        status: ineligibleKnownRef.current ? 'unavailable' : 'idle',
        manifest: null,
      });
      setFrameState({ itemKey, url: null });
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;

    setState({
      itemKey,
      status: 'loading',
      manifest: null,
    });
    setFrameState({ itemKey, url: null });

    const loadManifest = async () => {
      const result = await fetchStoryboardManifest(client, itemId, {
        signal: abortController.signal,
        token,
      });

      if (cancelled || abortController.signal.aborted || result.status === 'aborted') {
        return;
      }

      if (result.status === 'ready') {
        setState({
          itemKey,
          status: 'ready',
          manifest: result.manifest,
        });
        setFrameState({ itemKey, url: null });
        return;
      }

      if (result.status === 'generating') {
        setState({
          itemKey,
          status: 'generating',
          manifest: null,
        });
        if (retries < maxPollRetries) {
          retries += 1;
          const delay = result.retryAfterMs > 0 ? result.retryAfterMs : pollIntervalMs;
          pollTimer = setTimeout(() => {
            if (!cancelled && !abortController.signal.aborted) {
              void loadManifest();
            }
          }, delay);
        }
        return;
      }

      // 403 / 404 / 503 / invalid / network failure -> disable visual previews for session
      setState({
        itemKey,
        status: 'unavailable',
        manifest: null,
      });
      setFrameState({ itemKey, url: null });
    };

    void loadManifest();

    return () => {
      cancelled = true;
      abortController.abort();
      if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };
  }, [client, itemId, itemKey, token, isEligible, pollIntervalMs, maxPollRetries]);

  const effectiveStatus: StoryboardStatus = state.itemKey === itemKey ? state.status : 'idle';
  const effectiveManifest: StoryboardManifest | null =
    state.itemKey === itemKey ? state.manifest : null;

  const unlockTokensKey =
    typeof client.getUnlockTokens === 'function' ? client.getUnlockTokens().join(',') : '';
  const unlockTokens = useMemo(
    () => (unlockTokensKey ? unlockTokensKey.split(',') : []),
    [unlockTokensKey]
  );

  // Compute sprite sheet tile crop synchronously whenever storyboard is ready and user is seeking
  const spriteCrop = useMemo<StoryboardTileCrop | null>(() => {
    if (!isSeeking || effectiveStatus !== 'ready' || !effectiveManifest || durationMs <= 0) {
      return null;
    }
    return resolveStoryboardTile({
      manifest: effectiveManifest,
      targetSeconds: previewTimeMs / 1000,
      serverUrl,
      token,
      unlockTokens,
    });
  }, [isSeeking, effectiveStatus, effectiveManifest, previewTimeMs, durationMs, serverUrl, token, unlockTokens]);

  // Prefetch next sheet when localIndex >= 80
  useEffect(() => {
    if (spriteCrop?.nextSheetUrl) {
      prefetchStoryboardSheet(spriteCrop.nextSheetUrl, prefetchedSheetsRef.current);
    }
  }, [spriteCrop?.nextSheetUrl]);

  // Debounced /frame fallback while storyboard status is 202 generating
  useEffect(() => {
    if (!isSeeking || effectiveStatus !== 'generating' || durationMs <= 0 || !isEligible) {
      setFrameState((prev) =>
        prev.itemKey === itemKey && prev.url === null ? prev : { itemKey, url: null }
      );
      return;
    }

    const timer = setTimeout(() => {
      const url = getFrameFallbackUrl({
        serverUrl,
        itemId,
        targetSeconds: previewTimeMs / 1000,
        durationSeconds: durationMs / 1000,
        width: DEFAULT_FRAME_WIDTH,
        stepSeconds: frameSnapSeconds,
        token,
        unlockTokens,
      });
      setFrameState({ itemKey, url: url ?? null });
    }, frameDebounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [
    isSeeking,
    effectiveStatus,
    previewTimeMs,
    durationMs,
    isEligible,
    serverUrl,
    itemId,
    itemKey,
    token,
    unlockTokens,
    frameDebounceMs,
    frameSnapSeconds,
  ]);

  const effectiveFrameUrl =
    isSeeking &&
    effectiveStatus === 'generating' &&
    frameState.itemKey === itemKey
      ? frameState.url
      : null;

  return {
    status: effectiveStatus,
    manifest: effectiveManifest,
    spriteCrop,
    frameUrl: effectiveFrameUrl,
  };
}
