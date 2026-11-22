import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../src/api/client';
import {
  DEFAULT_TV_SEARCH_LIMIT,
  fetchSearchResults,
  getSavedSearchState,
  resetSavedSearchState,
  setSavedSearchState,
} from '../../src/api/search';

describe('search API client & saved session state', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetSavedSearchState();
  });

  it('short-circuits empty or whitespace queries without making a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('http://192.168.1.50:8492');

    const res = await fetchSearchResults(client, { q: '   ' });
    expect(res).toEqual({ query: '', total: 0, items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('encodes q, default limit=48, omits item_type for "all", and forwards item_type and AbortSignal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        query: 'dune',
        total: 1,
        items: [
          {
            id: 10,
            library_id: 'lib-1',
            library_name: 'Movies',
            item_type: 'movie',
            title: 'Dune',
            poster_url: '/api/v1/artwork/10/poster',
            duration_seconds: 9300,
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('http://192.168.1.50:8492');
    client.setToken('jwt-abc');
    const controller = new AbortController();

    const allRes = await fetchSearchResults(client, {
      q: '  dune  ',
      itemType: 'all',
      signal: controller.signal,
    });
    expect(allRes.total).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://192.168.1.50:8492/api/v1/search?q=dune&limit=${DEFAULT_TV_SEARCH_LIMIT}`,
      expect.objectContaining({ signal: controller.signal })
    );

    await fetchSearchResults(client, {
      q: 'severance',
      itemType: 'show',
      limit: 24,
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://192.168.1.50:8492/api/v1/search?q=severance&limit=24&item_type=show',
      expect.any(Object)
    );
  });

  it('persists and resets in-memory saved search state cleanly', () => {
    expect(getSavedSearchState()).toEqual({ query: '', filter: 'all' });
    setSavedSearchState({ query: 'matrix', filter: 'movie' });
    expect(getSavedSearchState()).toEqual({ query: 'matrix', filter: 'movie' });
    resetSavedSearchState();
    expect(getSavedSearchState()).toEqual({ query: '', filter: 'all' });
  });
});
