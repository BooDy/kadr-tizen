import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../src/api/client';
import {
  fetchPlaylists,
  createPlaylist,
  fetchPlaylistDetail,
  updatePlaylist,
  deletePlaylist,
  addPlaylistItems,
  removePlaylistItem,
  reorderPlaylistItems,
  shufflePlaylistItems,
  getPlaylistItemResumeMs,
  formatPlaylistDuration,
  PlaylistSummary,
  PlaylistDetail,
  PlaylistItemView,
} from '../../src/api/playlists';
import { subscribeEvents, PlaylistUpdatedPayload } from '../../src/api/events';

const sampleSummary: PlaylistSummary = {
  id: 'pl-uuid-1',
  name: 'Sci-Fi Marathon',
  description: 'Best sci-fi films',
  owner_user_id: 'user-1',
  owner_username: 'boody',
  is_public: true,
  is_editable: true,
  visible_item_count: 3,
  locked_item_count: 1,
  total_duration_seconds: 9540,
  cover_poster_urls: ['/api/v1/artwork/101/poster', '/api/v1/artwork/102/poster'],
  created_at: 1730000000,
  updated_at: 1730001200,
  contains_queried_item: true,
};

const sampleItems: PlaylistItemView[] = [
  {
    position: 0,
    added_at: 1730000100,
    duration_seconds: 5400,
    resume_position_seconds: 1200,
    card: {
      id: 101,
      title: 'Interstellar',
      media_type: 'movie',
      poster_url: '/api/v1/artwork/101/poster',
      playback_progress: 0.22,
    },
  },
  {
    position: 1,
    added_at: 1730000200,
    duration_seconds: 4140,
    card: {
      id: 102,
      title: 'Arrival',
      media_type: 'movie',
      poster_url: '/api/v1/artwork/102/poster',
      playback_progress: 1.0,
    },
  },
];

const sampleDetail: PlaylistDetail = {
  summary: sampleSummary,
  items: sampleItems,
};

describe('Playlists API Client & Helpers', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:8492');
    client.setToken('jwt-token-123');
    vi.restoreAllMocks();
  });

  describe('8 Server Playlists REST Endpoints', () => {
    it('1. GET /api/v1/playlists lists playlists with and without contains_item_id', async () => {
      const fetchSpy = vi
        .spyOn(client, 'fetch')
        .mockResolvedValue({ playlists: [sampleSummary] });

      const listAll = await fetchPlaylists(client);
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/playlists');
      expect(listAll).toEqual([sampleSummary]);

      fetchSpy.mockClear();
      const listContaining = await fetchPlaylists(client, 101);
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/playlists?contains_item_id=101');
      expect(listContaining[0].contains_queried_item).toBe(true);
    });

    it('2. POST /api/v1/playlists creates playlist with trimmed fields and optional atomic items seed', async () => {
      const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue(sampleDetail);

      const created = await createPlaylist(client, {
        name: '  Weekend Queue  ',
        description: '  Cozy picks  ',
        is_public: true,
        items: {
          folder: {
            library_id: 'lib-movies',
            path: 'Sci-Fi',
            recursive: true,
          },
        },
      });

      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Weekend Queue',
          description: 'Cozy picks',
          is_public: true,
          items: {
            folder: {
              library_id: 'lib-movies',
              path: 'Sci-Fi',
              recursive: true,
            },
          },
        }),
      });
      expect(created).toEqual(sampleDetail);
    });

    it('3. GET /api/v1/playlists/{id} fetches playlist detail with URL-encoded id', async () => {
      const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue(sampleDetail);

      const res = await fetchPlaylistDetail(client, 'pl/100');
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/playlists/pl%2F100');
      expect(res.items).toHaveLength(2);
    });

    it('4. PATCH /api/v1/playlists/{id} updates metadata and allows clearing description with ""', async () => {
      const updated = { ...sampleSummary, name: 'Renamed', description: undefined, is_public: false };
      const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue(updated);

      const res = await updatePlaylist(client, 'pl-uuid-1', {
        name: '  Renamed ',
        description: '',
        is_public: false,
      });

      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/playlists/pl-uuid-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Renamed',
          description: '',
          is_public: false,
        }),
      });
      expect(res.name).toBe('Renamed');
    });

    it('5. DELETE /api/v1/playlists/{id} sends DELETE and handles 204 empty response', async () => {
      const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue(undefined);

      await expect(deletePlaylist(client, 'pl-uuid-1')).resolves.toBeUndefined();
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/playlists/pl-uuid-1', {
        method: 'DELETE',
      });
    });

    it('6. POST /api/v1/playlists/{id}/items supports item_ids, show, and folder expansion', async () => {
      const responsePayload = {
        added_count: 8,
        skipped_duplicate_count: 2,
        summary: sampleSummary,
      };
      const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue(responsePayload);

      const res = await addPlaylistItems(client, 'pl-uuid-1', {
        show: { show_id: 205, season_number: 2 },
      });

      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/playlists/pl-uuid-1/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          show: { show_id: 205, season_number: 2 },
        }),
      });
      expect(res.added_count).toBe(8);
      expect(res.skipped_duplicate_count).toBe(2);
    });

    it('7. DELETE /api/v1/playlists/{id}/items/{media_item_id} removes item and returns updated summary', async () => {
      const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue({
        ...sampleSummary,
        visible_item_count: 2,
      });

      const summary = await removePlaylistItem(client, 'pl-uuid-1', 102);
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/playlists/pl-uuid-1/items/102', {
        method: 'DELETE',
      });
      expect(summary.visible_item_count).toBe(2);
    });

    it('8. PUT /api/v1/playlists/{id}/items/order sends exact visible item_ids permutation', async () => {
      const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue(sampleSummary);

      const summary = await reorderPlaylistItems(client, 'pl-uuid-1', [102, 101]);
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/playlists/pl-uuid-1/items/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: [102, 101] }),
      });
      expect(summary).toEqual(sampleSummary);
    });
  });

  describe('Queue Playback, Shuffle, & Duration Helpers', () => {
    it('shufflePlaylistItems returns a Fisher-Yates shuffled copy without mutating original array', () => {
      const original = [10, 20, 30, 40];
      const frozen = Object.freeze([...original]);
      // Deterministic random sequence -> always picks index 0 on each swap
      const shuffled = shufflePlaylistItems(frozen, () => 0);

      expect(frozen).toEqual([10, 20, 30, 40]);
      expect(shuffled).not.toBe(frozen);
      expect([...shuffled].sort((a, b) => a - b)).toEqual([10, 20, 30, 40]);
      expect(shuffled).toEqual([20, 30, 40, 10]);
    });

    it('getPlaylistItemResumeMs preserves resume_position_seconds > 0 and returns 0 for omitted/completed/live/zero-duration', () => {
      // In-progress item -> milliseconds
      expect(
        getPlaylistItemResumeMs({
          duration_seconds: 3600,
          resume_position_seconds: 125.4,
          card: { media_type: 'movie' },
        })
      ).toBe(125400);

      // Completed / omitted resume_position_seconds -> 0
      expect(
        getPlaylistItemResumeMs({
          duration_seconds: 3600,
          resume_position_seconds: undefined,
          card: { media_type: 'movie' },
        })
      ).toBe(0);

      // Live channel or duration_seconds <= 0 -> 0 even if resume_position_seconds is present
      expect(
        getPlaylistItemResumeMs({
          duration_seconds: 0,
          resume_position_seconds: 400,
          card: { media_type: 'movie' },
        })
      ).toBe(0);

      expect(
        getPlaylistItemResumeMs({
          duration_seconds: 3600,
          resume_position_seconds: 400,
          card: { media_type: 'live_channel' },
        })
      ).toBe(0);
    });

    it('formatPlaylistDuration formats seconds cleanly for 10-foot UI', () => {
      expect(formatPlaylistDuration(0)).toBe('0m');
      expect(formatPlaylistDuration(-15)).toBe('0m');
      expect(formatPlaylistDuration(45)).toBe('45s');
      expect(formatPlaylistDuration(2700)).toBe('45m');
      expect(formatPlaylistDuration(7200)).toBe('2h');
      expect(formatPlaylistDuration(9540)).toBe('2h 39m');
    });
  });

  describe('SSE playlist:updated event subscription', () => {
    it('subscribes to playlist:updated events and parses JSON payload', () => {
      const listeners = new Map<string, (ev: MessageEvent) => void>();
      const closeSpy = vi.fn();
      const removeSpy = vi.fn();

      class MockEventSource {
        url: string;
        onerror: ((err: unknown) => void) | null = null;
        constructor(url: string) {
          this.url = url;
        }
        addEventListener(name: string, handler: (ev: MessageEvent) => void) {
          listeners.set(name, handler);
        }
        removeEventListener = removeSpy;
        close = closeSpy;
      }

      vi.stubGlobal('EventSource', MockEventSource);

      const received: Array<{ type: string; payload: unknown }> = [];
      const unsubscribe = subscribeEvents('http://localhost:8492/', 'jwt-xyz', (type, payload) => {
        received.push({ type, payload });
      });

      expect(listeners.has('playlist:updated')).toBe(true);

      const updatePayload: PlaylistUpdatedPayload = {
        playlist_id: 'pl-uuid-1',
        user_id: 'user-1',
        action: 'items_changed',
        timestamp: 1730002000,
      };

      listeners.get('playlist:updated')?.({
        data: JSON.stringify(updatePayload),
      } as MessageEvent);

      expect(received).toEqual([
        {
          type: 'playlist:updated',
          payload: updatePayload,
        },
      ]);

      unsubscribe();
      expect(removeSpy).toHaveBeenCalledWith('playlist:updated', expect.any(Function));
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });
  });
});
