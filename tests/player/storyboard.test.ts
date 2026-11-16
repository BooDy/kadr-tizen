import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ApiClient } from '../../src/api/client';
import { StoryboardManifest } from '../../src/api/storyboard';
import * as storyboardApi from '../../src/api/storyboard';
import {
  PrefetchableImage,
  prefetchStoryboardSheet,
  resolveStoryboardTile,
  useStoryboard,
} from '../../src/player/storyboard';

const TWO_SHEET_MANIFEST: StoryboardManifest = {
  interval_ms: 10000,
  tile_width: 320,
  tile_height: 180,
  columns: 10,
  rows: 10,
  total_tiles: 135,
  sheets: [
    {
      index: 0,
      url: '/api/v1/media/101/storyboard/0.jpg',
      first_tile: 0,
      tile_count: 100,
    },
    {
      index: 1,
      url: '/api/v1/media/101/storyboard/1.jpg',
      first_tile: 100,
      tile_count: 35,
    },
  ],
};

describe('Storyboard Tile Math, Prefetch & useStoryboard Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('resolveStoryboardTile', () => {
    it('computes 10x10 crop coordinates and authenticated sheet URL across sheets and partial final sheet', () => {
      // t = 0s -> tile 0 (sheet 0, row 0, col 0)
      const first = resolveStoryboardTile({
        manifest: TWO_SHEET_MANIFEST,
        targetSeconds: 0,
        serverUrl: 'http://127.0.0.1:8492',
        token: 'tok-1',
        unlockTokens: ['u-1'],
      });
      expect(first).toEqual({
        sheetIndex: 0,
        tileIndex: 0,
        localIndex: 0,
        col: 0,
        row: 0,
        x: 0,
        y: 0,
        width: 320,
        height: 180,
        sheetWidth: 3200,
        sheetHeight: 1800,
        sheetUrl: 'http://127.0.0.1:8492/api/v1/media/101/storyboard/0.jpg?token=tok-1&unlocked=u-1',
        nextSheetUrl: undefined,
      });

      // t = 235s -> tileIndex = floor(235000 / 10000) = 23 -> sheet 0, row 2, col 3
      const mid = resolveStoryboardTile({
        manifest: TWO_SHEET_MANIFEST,
        targetSeconds: 235,
        serverUrl: 'http://127.0.0.1:8492',
        token: 'tok-1',
      });
      expect(mid).toMatchObject({
        sheetIndex: 0,
        tileIndex: 23,
        localIndex: 23,
        col: 3,
        row: 2,
        x: 3 * 320,
        y: 2 * 180,
        width: 320,
        height: 180,
        sheetWidth: 3200,
        sheetHeight: 1800,
      });

      // Partial final sheet (tile_count = 35): JPEG canvas is ALWAYS 10*tile_width x 10*tile_height (3200x1800)
      // t = 9999s (past EOF) -> clamps to total_tiles - 1 = 134 -> sheet 1, localIndex 34 (row 3, col 4)
      const end = resolveStoryboardTile({
        manifest: TWO_SHEET_MANIFEST,
        targetSeconds: 9999,
        serverUrl: 'http://127.0.0.1:8492',
        token: 'tok-1',
      });
      expect(end).toMatchObject({
        sheetIndex: 1,
        tileIndex: 134,
        localIndex: 34,
        col: 4,
        row: 3,
        x: 4 * 320,
        y: 3 * 180,
        sheetWidth: 3200,
        sheetHeight: 1800,
        sheetUrl: 'http://127.0.0.1:8492/api/v1/media/101/storyboard/1.jpg?token=tok-1',
        nextSheetUrl: undefined,
      });

      // Negative timestamp clamps cleanly to tile 0
      const neg = resolveStoryboardTile({
        manifest: TWO_SHEET_MANIFEST,
        targetSeconds: -42,
        serverUrl: 'http://127.0.0.1:8492',
        token: 'tok-1',
      });
      expect(neg?.tileIndex).toBe(0);
    });

    it('populates nextSheetUrl only when localIndex >= 80 and a subsequent sheet exists', () => {
      // localIndex = 79 (t = 790s) -> no prefetch yet
      const tile79 = resolveStoryboardTile({
        manifest: TWO_SHEET_MANIFEST,
        targetSeconds: 790,
        serverUrl: 'http://127.0.0.1:8492',
        token: 'tok-1',
        unlockTokens: ['vault-key'],
      });
      expect(tile79?.localIndex).toBe(79);
      expect(tile79?.nextSheetUrl).toBeUndefined();

      // localIndex = 80 (t = 800s) -> prefetches sheet 1 with auth + unlock params
      const tile80 = resolveStoryboardTile({
        manifest: TWO_SHEET_MANIFEST,
        targetSeconds: 800,
        serverUrl: 'http://127.0.0.1:8492',
        token: 'tok-1',
        unlockTokens: ['vault-key'],
      });
      expect(tile80?.localIndex).toBe(80);
      expect(tile80?.nextSheetUrl).toBe(
        'http://127.0.0.1:8492/api/v1/media/101/storyboard/1.jpg?token=tok-1&unlocked=vault-key'
      );
    });
  });

  describe('prefetchStoryboardSheet', () => {
    it('loads each sheet URL once per session cache', () => {
      const cache = new Set<string>();
      const created: PrefetchableImage[] = [];
      const factory = () => {
        const img: PrefetchableImage = { src: '', onerror: null };
        created.push(img);
        return img;
      };

      const url = 'http://127.0.0.1:8492/api/v1/media/101/storyboard/1.jpg?token=abc';
      expect(prefetchStoryboardSheet(url, cache, factory)).toBe(true);
      expect(created).toHaveLength(1);
      expect(created[0].src).toBe(url);

      // Duplicate call for same sheet is skipped
      expect(prefetchStoryboardSheet(url, cache, factory)).toBe(false);
      expect(created).toHaveLength(1);
    });
  });

  describe('useStoryboard hook', () => {
    it('skips storyboard requests for live_channel, music, audiobook, and durationMs <= 0', async () => {
      const client = new ApiClient('http://127.0.0.1:8492');
      const fetchSpy = vi.spyOn(storyboardApi, 'fetchStoryboardManifest');

      const { rerender } = renderHook(
        (props: { mediaType?: string; durationMs: number; isLive?: boolean }) =>
          useStoryboard({
            client,
            itemId: 101,
            serverUrl: 'http://127.0.0.1:8492',
            token: 'tok',
            durationMs: props.durationMs,
            mediaType: props.mediaType,
            isLive: props.isLive,
            isSeeking: true,
            previewTimeMs: 20000,
          }),
        { initialProps: { mediaType: 'live_channel', durationMs: 120000, isLive: true } }
      );

      rerender({ mediaType: 'music', durationMs: 180000, isLive: false });
      rerender({ mediaType: 'audiobook', durationMs: 3600000, isLive: false });
      rerender({ mediaType: 'movie', durationMs: 0, isLive: false });

      await act(async () => {
        await Promise.resolve();
      });

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('polls every 5s on 202 Accepted, serves debounced /frame fallback while generating, and switches seamlessly to sprite crop on 200 OK', async () => {
      const client = new ApiClient('http://127.0.0.1:8492');
      client.setLibraryUnlockToken('vault-1', 'unlock-xyz');

      const fetchSpy = vi
        .spyOn(storyboardApi, 'fetchStoryboardManifest')
        .mockResolvedValueOnce({ status: 'generating', retryAfterMs: 5000 })
        .mockResolvedValueOnce({ status: 'generating', retryAfterMs: 5000 })
        .mockResolvedValueOnce({ status: 'ready', manifest: TWO_SHEET_MANIFEST });

      const { result, rerender } = renderHook(
        (props: { isSeeking: boolean; previewTimeMs: number }) =>
          useStoryboard({
            client,
            itemId: 101,
            serverUrl: 'http://127.0.0.1:8492',
            token: 'jwt-tok',
            durationMs: 1350000,
            mediaType: 'movie',
            isSeeking: props.isSeeking,
            previewTimeMs: props.previewTimeMs,
          }),
        { initialProps: { isSeeking: false, previewTimeMs: 0 } }
      );

      // Initial manifest call -> 202 generating
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.status).toBe('generating');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Rapid D-pad scrubs while generating: 11s -> 21s -> 31.4s within <200ms
      rerender({ isSeeking: true, previewTimeMs: 11000 });
      act(() => {
        vi.advanceTimersByTime(80);
      });
      expect(result.current.frameUrl).toBeNull();

      rerender({ isSeeking: true, previewTimeMs: 21000 });
      act(() => {
        vi.advanceTimersByTime(80);
      });
      expect(result.current.frameUrl).toBeNull();

      rerender({ isSeeking: true, previewTimeMs: 31400 });
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // Only final settled scrub produces a snapped (32s) authenticated /frame URL
      expect(result.current.frameUrl).toBe(
        'http://127.0.0.1:8492/api/v1/media/101/frame?t=32&w=320&token=jwt-tok&unlocked=unlock-xyz'
      );
      expect(result.current.spriteCrop).toBeNull();

      // Advance to 1st poll at 5s -> still generating
      await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.current.status).toBe('generating');

      // Advance to 2nd poll at +5s -> 200 OK ready!
      await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
      });
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(result.current.status).toBe('ready');

      // Seamlessly switched from /frame fallback to sprite crop!
      expect(result.current.frameUrl).toBeNull();
      expect(result.current.spriteCrop).toMatchObject({
        sheetIndex: 0,
        tileIndex: 3,
        col: 3,
        row: 0,
        x: 960,
        y: 0,
        sheetUrl:
          'http://127.0.0.1:8492/api/v1/media/101/storyboard/0.jpg?token=jwt-tok&unlocked=unlock-xyz',
      });
    });

    it('caps 202 Accepted polling at 12 retries and aborts cleanly on unmount', async () => {
      const client = new ApiClient('http://127.0.0.1:8492');
      const fetchSpy = vi
        .spyOn(storyboardApi, 'fetchStoryboardManifest')
        .mockResolvedValue({ status: 'generating', retryAfterMs: 5000 });

      const { unmount } = renderHook(() =>
        useStoryboard({
          client,
          itemId: 101,
          serverUrl: 'http://127.0.0.1:8492',
          token: 'jwt-tok',
          durationMs: 600000,
          mediaType: 'movie',
          isSeeking: false,
          previewTimeMs: 0,
        })
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Run 15 intervals of 5s (75s total) -> must stop at 1 initial + 12 retries = 13 calls
      for (let i = 0; i < 15; i++) {
        await act(async () => {
          vi.advanceTimersByTime(5000);
          await Promise.resolve();
        });
      }

      expect(fetchSpy).toHaveBeenCalledTimes(13);
      unmount();
    });

    it('aborts in-flight / scheduled polling immediately on unmount or itemId change', async () => {
      const client = new ApiClient('http://127.0.0.1:8492');
      const signals: AbortSignal[] = [];

      const fetchSpy = vi
        .spyOn(storyboardApi, 'fetchStoryboardManifest')
        .mockImplementation(async (_c, _id, opts) => {
          if (opts?.signal) signals.push(opts.signal);
          return { status: 'generating', retryAfterMs: 5000 };
        });

      const { rerender, unmount } = renderHook(
        ({ itemId }: { itemId: number }) =>
          useStoryboard({
            client,
            itemId,
            serverUrl: 'http://127.0.0.1:8492',
            token: 'jwt-tok',
            durationMs: 600000,
            mediaType: 'movie',
            isSeeking: false,
            previewTimeMs: 0,
          }),
        { initialProps: { itemId: 101 } }
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(signals[0].aborted).toBe(false);

      // Switching itemId aborts item 101's controller and cancels its 5s timer
      rerender({ itemId: 202 });
      expect(signals[0].aborted).toBe(true);

      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Unmount aborts item 202 and prevents any further timer callbacks
      unmount();
      expect(signals[1].aborted).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(20000);
        await Promise.resolve();
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('disables visual previews for the session on 403 / 404 / 503 without polling', async () => {
      const client = new ApiClient('http://127.0.0.1:8492');
      const fetchSpy = vi
        .spyOn(storyboardApi, 'fetchStoryboardManifest')
        .mockResolvedValue({ status: 'unavailable', httpStatus: 503 });

      const { result } = renderHook(() =>
        useStoryboard({
          client,
          itemId: 101,
          serverUrl: 'http://127.0.0.1:8492',
          token: 'jwt-tok',
          durationMs: 600000,
          mediaType: 'movie',
          isSeeking: true,
          previewTimeMs: 30000,
        })
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('unavailable');
      expect(result.current.spriteCrop).toBeNull();
      expect(result.current.frameUrl).toBeNull();
    });
  });
});
