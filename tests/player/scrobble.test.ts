import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportPlaybackProgress } from '../../src/api/playback';

describe('Playback Scrobble', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('posts playback progress to Kadr server with correct payload and headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch;

    await reportPlaybackProgress('http://localhost:8492/', 'token-123', 'item-1', 45000, false);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8492/api/v1/playback/progress',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-123',
        },
        body: JSON.stringify({ item_id: 'item-1', position_ms: 45000, is_paused: false }),
      })
    );
  });

  it('handles server URL with multiple trailing slashes', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch;

    await reportPlaybackProgress('http://localhost:8492///', 'token-123', 'item-2', 12000, true);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8492/api/v1/playback/progress',
      expect.anything()
    );
  });

  it('silently ignores network errors without throwing', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = mockFetch;

    await expect(
      reportPlaybackProgress('http://localhost:8492', 'token-123', 'item-1', 45000, false)
    ).resolves.toBeUndefined();
  });
});

import { ApiClient } from '../../src/api/client';
import { PlaybackSessionManager } from '../../src/player/session';
import {
  applyOptimisticProgress,
  PlaybackProgressSnapshot,
  toResumePercentageSentinel,
} from '../../src/utils/playbackProgress';
import { MediaItemDetail } from '../../src/types/kadr';

describe('PlaybackSessionManager.flushAndDestroy & applyOptimisticProgress', () => {
  it('awaits reportSessionProgress strictly before endPlaybackSession in flushAndDestroy', async () => {
    const callOrder: string[] = [];
    let resolveProgress!: () => void;
    const progressGate = new Promise<void>((res) => {
      resolveProgress = res;
    });

    const client = {
      fetch: vi.fn(async (path: string, init?: RequestInit) => {
        if (path === '/api/v1/playback/sessions' && init?.method === 'POST') {
          callOrder.push('start');
          return {
            session_id: 'sess-99',
            media_item_id: 201,
            duration_seconds: 1200,
            resume_position_seconds: 0,
          };
        }
        if (path === '/api/v1/playback/sess-99/progress') {
          callOrder.push('progress:start');
          await progressGate;
          callOrder.push('progress:done');
          return undefined;
        }
        if (path === '/api/v1/playback/sessions/sess-99' && init?.method === 'DELETE') {
          callOrder.push('delete');
          return undefined;
        }
        return undefined;
      }),
    } as unknown as ApiClient;

    const mgr = new PlaybackSessionManager(client);
    await mgr.start(201);

    const flushPromise = mgr.flushAndDestroy(1180);
    await Promise.resolve();
    expect(callOrder).toEqual(['start', 'progress:start']);

    resolveProgress();
    await flushPromise;
    expect(callOrder).toEqual(['start', 'progress:start', 'progress:done', 'delete']);

    // Subsequent destroy() is a safe no-op
    await mgr.destroy();
    expect(callOrder).toEqual(['start', 'progress:start', 'progress:done', 'delete']);
  });

  it('updates episode playback_progress, clears stale badge on >=90% completion, and computes resume sentinel safely', () => {
    expect(toResumePercentageSentinel(0)).toBe(0);
    expect(toResumePercentageSentinel(0.003)).toBe(1);
    expect(toResumePercentageSentinel(0.3)).toBe(30);
    expect(toResumePercentageSentinel(0.95)).toBe(0);

    const show: MediaItemDetail = {
      id: 10,
      title: 'Severance',
      media_type: 'show',
      episodes: [
        { id: 201, title: 'Ep 1', season: 1, episode: 1, playback_progress: 0, badge: 'NEXT UP' },
        { id: 202, title: 'Ep 2', season: 1, episode: 2, playback_progress: 0 },
      ],
    };

    const map = new Map<string, PlaybackProgressSnapshot>([
      ['201', { itemId: 201, positionMs: 2700000, durationMs: 2700000 }],
    ]);

    const updated = applyOptimisticProgress(show, map);
    expect(updated.episodes?.[0].playback_progress).toBe(1);
    expect(updated.episodes?.[0].badge).toBeUndefined();
    expect(updated.episodes?.[1].playback_progress).toBe(0);
  });
});

