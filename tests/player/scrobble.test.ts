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
