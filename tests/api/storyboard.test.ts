import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../src/api/client';
import {
  StoryboardManifest,
  clampFrameWidth,
  fetchStoryboardManifest,
  getFrameFallbackUrl,
  getStoryboardSheetUrl,
  isStoryboardEligibleMedia,
  isValidStoryboardManifest,
  snapFrameTimestamp,
} from '../../src/api/storyboard';

const SAMPLE_MANIFEST: StoryboardManifest = {
  interval_ms: 10000,
  tile_width: 320,
  tile_height: 180,
  columns: 10,
  rows: 10,
  total_tiles: 150,
  sheets: [
    {
      index: 0,
      url: '/api/v1/media/42/storyboard/0.jpg',
      first_tile: 0,
      tile_count: 100,
    },
    {
      index: 1,
      url: '/api/v1/media/42/storyboard/1.jpg',
      first_tile: 100,
      tile_count: 50,
    },
  ],
};

describe('Storyboard API & URL Builders', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isStoryboardEligibleMedia', () => {
    it('returns true for playable video items with positive duration', () => {
      expect(isStoryboardEligibleMedia({ mediaType: 'movie', durationSeconds: 5400 })).toBe(true);
      expect(isStoryboardEligibleMedia({ mediaType: 'episode', durationMs: 2400000 })).toBe(true);
      expect(isStoryboardEligibleMedia({ durationMs: 60000 })).toBe(true);
    });

    it('skips live_channel, music, audiobook, show, season, and non-positive durations', () => {
      expect(isStoryboardEligibleMedia({ mediaType: 'live_channel', durationSeconds: 3600 })).toBe(false);
      expect(isStoryboardEligibleMedia({ mediaType: 'music', durationSeconds: 210 })).toBe(false);
      expect(isStoryboardEligibleMedia({ mediaType: 'audiobook', durationSeconds: 7200 })).toBe(false);
      expect(isStoryboardEligibleMedia({ mediaType: 'show', durationSeconds: 3600 })).toBe(false);
      expect(isStoryboardEligibleMedia({ mediaType: 'season', durationSeconds: 3600 })).toBe(false);
      expect(isStoryboardEligibleMedia({ mediaType: 'movie', durationSeconds: 0 })).toBe(false);
      expect(isStoryboardEligibleMedia({ mediaType: 'movie', durationSeconds: -1 })).toBe(false);
      expect(isStoryboardEligibleMedia({ mediaType: 'movie', durationMs: 0 })).toBe(false);
      expect(isStoryboardEligibleMedia({ mediaType: 'movie', durationMs: Number.NaN })).toBe(false);
      expect(isStoryboardEligibleMedia({ mediaType: 'movie', durationMs: 60000, isLive: true })).toBe(false);
      expect(isStoryboardEligibleMedia({ mediaType: 'movie' })).toBe(false);
    });
  });

  describe('isValidStoryboardManifest', () => {
    it('validates well-formed StoryboardManifest payloads and rejects empty or malformed payloads', () => {
      expect(isValidStoryboardManifest(SAMPLE_MANIFEST)).toBe(true);
      expect(isValidStoryboardManifest(null)).toBe(false);
      expect(isValidStoryboardManifest({})).toBe(false);
      expect(isValidStoryboardManifest({ ...SAMPLE_MANIFEST, sheets: [] })).toBe(false);
      expect(isValidStoryboardManifest({ ...SAMPLE_MANIFEST, interval_ms: 0 })).toBe(false);
      expect(isValidStoryboardManifest({ ...SAMPLE_MANIFEST, tile_width: 0 })).toBe(false);
    });
  });

  describe('fetchStoryboardManifest', () => {
    it('returns ready manifest on 200 OK and forwards auth + private library unlock headers', async () => {
      const client = new ApiClient('http://192.168.1.50:8492');
      client.setToken('jwt-user-tok');
      client.setLibraryUnlockToken('lib-vault', 'unlock-abc');

      const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        const headers = init.headers as Headers;
        expect(headers.get('Authorization')).toBe('Bearer jwt-user-tok');
        expect(headers.get('X-Kadr-Unlocked')).toBe('unlock-abc');
        return {
          ok: true,
          status: 200,
          json: async () => SAMPLE_MANIFEST,
        };
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchStoryboardManifest(client, 42);
      expect(result).toEqual({
        status: 'ready',
        manifest: SAMPLE_MANIFEST,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://192.168.1.50:8492/api/v1/media/42/storyboard',
        expect.any(Object)
      );
    });

    it('attaches fallback options.token when client has no stored token', async () => {
      const client = new ApiClient('http://192.168.1.50:8492');

      const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        const headers = init.headers as Headers;
        expect(headers.get('Authorization')).toBe('Bearer prop-tok-999');
        return {
          ok: true,
          status: 200,
          json: async () => SAMPLE_MANIFEST,
        };
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchStoryboardManifest(client, 42, { token: 'prop-tok-999' });
      expect(result.status).toBe('ready');
    });

    it('returns generating with 5000ms retry interval on 202 Accepted {"status":"generating"}', async () => {
      const client = new ApiClient('http://192.168.1.50:8492');
      client.setToken('jwt-tok');

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers({ 'Retry-After': '5' }),
        json: async () => ({ status: 'generating' }),
      }) as unknown as typeof fetch;

      const result = await fetchStoryboardManifest(client, 42);
      expect(result).toEqual({
        status: 'generating',
        retryAfterMs: 5000,
      });
    });

    it('gracefully returns unavailable without throwing on 403, 404, 503, empty 200/204, or network errors', async () => {
      const client = new ApiClient('http://192.168.1.50:8492');

      for (const code of [403, 404, 503]) {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: code,
          statusText: 'Error',
        }) as unknown as typeof fetch;

        const res = await fetchStoryboardManifest(client, 42);
        expect(res).toEqual(
          expect.objectContaining({
            status: 'unavailable',
            httpStatus: code,
          })
        );
      }

      // Generic unmocked 200 {} stub
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      }) as unknown as typeof fetch;
      expect((await fetchStoryboardManifest(client, 42)).status).toBe('unavailable');

      // Network rejection
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
      expect((await fetchStoryboardManifest(client, 42)).status).toBe('unavailable');
    });

    it('returns aborted when AbortController aborts the request', async () => {
      const client = new ApiClient('http://192.168.1.50:8492');
      const controller = new AbortController();
      controller.abort();

      const res = await fetchStoryboardManifest(client, 42, { signal: controller.signal });
      expect(res).toEqual({ status: 'aborted' });
    });
  });

  describe('getStoryboardSheetUrl & getFrameFallbackUrl', () => {
    it('appends ?token= and &unlocked= to bare relative storyboard sheet URLs', () => {
      const url = getStoryboardSheetUrl({
        serverUrl: 'http://192.168.1.50:8492/',
        sheetUrl: '/api/v1/media/42/storyboard/0.jpg',
        token: 'jwt-secret',
        unlockTokens: ['pin-tok-1', 'pin-tok-2'],
      });

      expect(url).toBe(
        'http://192.168.1.50:8492/api/v1/media/42/storyboard/0.jpg?token=jwt-secret&unlocked=pin-tok-1%2Cpin-tok-2'
      );
    });

    it('snaps frame timestamps to discrete steps and clamps strictly within 0..durationSeconds', () => {
      expect(snapFrameTimestamp(-15, 120, 2)).toBe(0);
      expect(snapFrameTimestamp(0, 120, 2)).toBe(0);
      expect(snapFrameTimestamp(41.2, 120, 2)).toBe(42);
      expect(snapFrameTimestamp(40.4, 120, 2)).toBe(40);
      // Near end: rounding up (e.g. 103 -> 105 with step=5 when duration=103) must clamp to duration
      expect(snapFrameTimestamp(101, 101, 2)).toBe(101);
      expect(snapFrameTimestamp(500, 103, 5)).toBe(103);
      expect(snapFrameTimestamp(500, 101, 5)).toBe(100);
      expect(snapFrameTimestamp(10, 0, 2)).toBe(0);
    });

    it('clamps /frame width to 160..640 even pixels and builds authenticated fallback URL', () => {
      expect(clampFrameWidth(100)).toBe(160);
      expect(clampFrameWidth(321)).toBe(320);
      expect(clampFrameWidth(900)).toBe(640);

      const url = getFrameFallbackUrl({
        serverUrl: 'http://192.168.1.50:8492',
        itemId: 42,
        targetSeconds: 41.1,
        durationSeconds: 600,
        width: 320,
        stepSeconds: 2,
        token: 'jwt-secret',
        unlockTokens: ['vault-1'],
      });

      expect(url).toBe(
        'http://192.168.1.50:8492/api/v1/media/42/frame?t=42&w=320&token=jwt-secret&unlocked=vault-1'
      );

      // Returns undefined when duration <= 0 to avoid HTTP 400 from server
      expect(
        getFrameFallbackUrl({
          serverUrl: 'http://192.168.1.50:8492',
          itemId: 42,
          targetSeconds: 10,
          durationSeconds: 0,
          token: 'jwt-secret',
        })
      ).toBeUndefined();
    });
  });
});
