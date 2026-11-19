import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../src/api/client';
import { setBatchWatchState, setItemWatchState } from '../../src/api/playback';
import { applyWatchStateMutation } from '../../src/utils/playbackProgress';
import { MediaItemDetail } from '../../src/api/items';

describe('playback watch-state API & optimistic mutation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls PUT /api/v1/playback/states/{id} for single item watch state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ watch_state: 'completed' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('http://192.168.1.50:8492');
    client.setToken('jwt-1');

    await setItemWatchState(client, 42, true);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.50:8492/api/v1/playback/states/42',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ watched: true }),
      })
    );
  });

  it('calls PUT /api/v1/playback/states for batch season watch state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ updated: 3, watched: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('http://192.168.1.50:8492');
    client.setToken('jwt-1');

    const res = await setBatchWatchState(client, ['101', 102, 103], false);

    expect(res).toEqual({ updated: 3, watched: false });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.50:8492/api/v1/playback/states',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ item_ids: [101, 102, 103], watched: false }),
      })
    );
  });

  it('optimistically mutates movie and episode watch states cleanly via applyWatchStateMutation', () => {
    const movie: MediaItemDetail = {
      id: 99,
      title: 'Dune',
      resume_position_ms: 1800000,
      resume_position_seconds: 1800,
      card: {
        id: 99,
        title: 'Dune',
        media_type: 'movie',
        playback_progress: 0.35,
        badge: 'RESUME',
      },
    };

    const watchedMovie = applyWatchStateMutation(movie, new Set(['99']), true);
    expect(watchedMovie.resume_position_ms).toBe(0);
    expect(watchedMovie.resume_position_seconds).toBe(0);
    expect(watchedMovie.card?.playback_progress).toBe(1);
    expect(watchedMovie.card?.badge).toBeUndefined();

    const unwatchedMovie = applyWatchStateMutation(watchedMovie, new Set(['99']), false);
    expect(unwatchedMovie.resume_position_ms).toBe(0);
    expect(unwatchedMovie.card?.playback_progress).toBe(0);

    const show: MediaItemDetail = {
      id: 200,
      title: 'Severance',
      episodes: [
        { id: 201, title: 'Ep 1', season: 1, episode: 1, playback_progress: 0.4, badge: 'RESUME' },
        { id: 202, title: 'Ep 2', season: 1, episode: 2, playback_progress: 0, badge: '4K' },
      ],
    };

    const updatedShow = applyWatchStateMutation(show, new Set(['201', '202']), true);
    expect(updatedShow.episodes?.[0].playback_progress).toBe(1);
    expect(updatedShow.episodes?.[0].badge).toBeUndefined();
    expect(updatedShow.episodes?.[1].playback_progress).toBe(1);
    expect(updatedShow.episodes?.[1].badge).toBe('4K');
  });

  it('preserves object reference on empty targetIds or no-op mutations', () => {
    const movie: MediaItemDetail = {
      id: 50,
      title: 'Arrival',
      resume_position_ms: 0,
      resume_position_seconds: 0,
      card: {
        id: 50,
        title: 'Arrival',
        media_type: 'movie',
        playback_progress: 1,
        badge: '4K',
      },
      episodes: [
        { id: 51, title: 'Bonus', season: 1, episode: 1, playback_progress: 1, badge: 'NEW' },
      ],
    };

    expect(applyWatchStateMutation(movie, new Set(), true)).toBe(movie);
    expect(applyWatchStateMutation(movie, new Set(['999']), true)).toBe(movie);
    expect(applyWatchStateMutation(movie, new Set(['50', '51']), true)).toBe(movie);
  });

  it('creates card when mutating a movie without an existing card object and preserves non-RESUME card badges', () => {
    const bareMovie: MediaItemDetail = {
      id: '77',
      title: 'Blade Runner',
      media_type: 'movie',
      resume_position_ms: 5000,
      resume_position_seconds: 5,
    };

    const mutated = applyWatchStateMutation(bareMovie, new Set(['77']), true);
    expect(mutated.resume_position_ms).toBe(0);
    expect(mutated.resume_position_seconds).toBe(0);
    expect(mutated.card).toEqual({
      id: 77,
      title: 'Blade Runner',
      media_type: 'movie',
      playback_progress: 1,
    });

    const taggedMovie: MediaItemDetail = {
      id: 88,
      title: 'Heat',
      card: {
        id: 88,
        title: 'Heat',
        media_type: 'movie',
        playback_progress: 0.2,
        badge: 'NEW',
      },
    };
    const taggedMutated = applyWatchStateMutation(taggedMovie, new Set(['88']), true);
    expect(taggedMutated.card?.badge).toBe('NEW');
    expect(taggedMutated.card?.playback_progress).toBe(1);
  });
});
