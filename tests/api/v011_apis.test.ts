import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../src/api/client';
import { startPlaybackSession, reportSessionProgress, endPlaybackSession } from '../../src/api/playback';
import { fetchLibraryFolders } from '../../src/api/folders';
import { fetchItemSubtitles } from '../../src/api/subtitles';
import { unlockLibrary } from '../../src/api/libraries';
import { subscribeEvents } from '../../src/api/events';
import {
  EpisodeCard,
  MediaItemDetail,
  PlaybackSession,
  SubtitleTrack,
  FolderBreadcrumb,
  FolderDirectory,
  FolderImage,
  LibraryFolderResponse,
} from '../../src/types/kadr';

describe('Kadr v0.1.1-alpha API Clients & Data Contracts', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:8492');
    client.setToken('test-jwt');
    vi.restoreAllMocks();
  });

  describe('Type definitions', () => {
    it('allows constructing valid v0.1.1 models', () => {
      const episode: EpisodeCard = {
        id: 10,
        title: 'Pilot',
        subtitle: 'S01E01',
        season: 1,
        episode: 1,
        playback_progress: 0.5,
        badge: 'RESUME',
        poster_url: 'http://localhost:8492/ep1.jpg',
      };
      expect(episode.season).toBe(1);

      const session: PlaybackSession = {
        session_id: 's-1',
        media_item_id: 10,
        duration_seconds: 3600,
        resume_position_seconds: 1800,
      };
      expect(session.session_id).toBe('s-1');

      const subtitle: SubtitleTrack = {
        id: 1,
        media_item_id: 10,
        source: 'internal',
        language: 'en',
        title: 'English SDH',
        format: 'vtt',
        is_default: true,
        is_forced: false,
        stream_url: 'http://localhost:8492/sub.vtt',
      };
      expect(subtitle.format).toBe('vtt');

      const breadcrumb: FolderBreadcrumb = { name: 'Root', path: '' };
      const directory: FolderDirectory = { name: 'Season 1', path: 'Season 1', item_count: 10 };
      const image: FolderImage = { name: 'cover.jpg', path: 'cover.jpg', url: 'http://localhost:8492/cover.jpg', size_bytes: 1024 };

      const folderResponse: LibraryFolderResponse = {
        library_id: 'lib-1',
        library_name: 'TV Shows',
        current_path: '',
        breadcrumbs: [breadcrumb],
        directories: [directory],
        items: [],
        images: [image],
      };
      expect(folderResponse.directories[0].name).toBe('Season 1');

      const detail: MediaItemDetail = {
        id: 10,
        title: 'Show Title',
        media_type: 'show',
        episodes: [episode],
        library_id: 'lib-1',
        folder_path: '/TV/Show Title',
      };
      expect(detail.episodes?.[0].id).toBe(10);
      expect(detail.library_id).toBe('lib-1');
      expect(detail.folder_path).toBe('/TV/Show Title');
    });
  });

  describe('ApiClient Unlock Token Management', () => {
    it('manages library unlock tokens and headers in ApiClient', async () => {
      client.setLibraryUnlockToken('lib-1', 'unlock-token-123');
      expect(client.getLibraryUnlockToken('lib-1')).toBe('unlock-token-123');
      expect(client.getLibraryUnlockToken('lib-unknown')).toBeUndefined();

      // Verify single unlock token header injection
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      await client.fetch('/api/v1/test');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8492/api/v1/test',
        expect.objectContaining({
          headers: expect.any(Headers),
        })
      );
      const callHeaders = (global.fetch as any).mock.calls[0][1].headers as Headers;
      expect(callHeaders.get('X-Library-Unlock-Token')).toBe('unlock-token-123');
      expect(callHeaders.get('X-Kadr-Unlocked')).toBeNull();

      // Verify multiple unlock tokens header injection
      client.setLibraryUnlockToken('lib-2', 'unlock-token-456');
      await client.fetch('/api/v1/test2');
      const callHeaders2 = (global.fetch as any).mock.calls[1][1].headers as Headers;
      expect(callHeaders2.get('X-Library-Unlock-Token')).toBeNull();
      expect(callHeaders2.get('X-Kadr-Unlocked')).toBe('unlock-token-123,unlock-token-456');
    });
  });

  describe('Playback API', () => {
    it('starts, reports progress, and ends playback session', async () => {
      const fetchSpy = vi.spyOn(client, 'fetch').mockImplementation(async (path, init) => {
        if (path === '/api/v1/playback/sessions' && init?.method === 'POST') {
          expect(JSON.parse(init.body as string)).toEqual({ media_item_id: 101 });
          return {
            session_id: 'sess-42',
            media_item_id: 101,
            duration_seconds: 3600,
            resume_position_seconds: 120,
          };
        }
        if (path === '/api/v1/playback/sess-42/progress' && init?.method === 'POST') {
          expect(JSON.parse(init.body as string)).toEqual({ position_seconds: 130 });
          return { status: 'ok' };
        }
        if (path === '/api/v1/playback/sessions/sess-42' && init?.method === 'DELETE') {
          return undefined;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      const session = await startPlaybackSession(client, 101);
      expect(session.session_id).toBe('sess-42');
      expect(session.resume_position_seconds).toBe(120);

      await reportSessionProgress(client, 'sess-42', 130);
      await endPlaybackSession(client, 'sess-42');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('encodes special characters in sessionId for progress and end calls', async () => {
      const fetchSpy = vi.spyOn(client, 'fetch').mockImplementation(async (path) => {
        if (path === '/api/v1/playback/sess%2Fspecial%20id/progress') {
          return { status: 'ok' };
        }
        if (path === '/api/v1/playback/sessions/sess%2Fspecial%20id') {
          return undefined;
        }
        throw new Error(`Unexpected path: ${path}`);
      });

      await reportSessionProgress(client, 'sess/special id', 200);
      await endPlaybackSession(client, 'sess/special id');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Folders API', () => {
    it('fetches library root folders with breadcrumbs and items', async () => {
      const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue({
        library_id: 'lib-1',
        library_name: 'Movies',
        current_path: '',
        breadcrumbs: [{ name: 'Movies', path: '' }],
        directories: [{ name: 'Sci-Fi', path: 'Sci-Fi', item_count: 5 }],
        items: [],
        images: [],
      });

      const res = await fetchLibraryFolders(client, 'lib-1');
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/libraries/lib-1/folders');
      expect(res.library_id).toBe('lib-1');
      expect(res.directories.length).toBe(1);
    });

    it('fetches nested library folders with query path', async () => {
      const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue({
        library_id: 'lib-1',
        library_name: 'Movies',
        current_path: 'Sci-Fi/Dune',
        breadcrumbs: [
          { name: 'Movies', path: '' },
          { name: 'Sci-Fi', path: 'Sci-Fi' },
          { name: 'Dune', path: 'Sci-Fi/Dune' },
        ],
        directories: [],
        items: [{ id: 101, title: 'Dune: Part One' }],
        images: [{ name: 'poster.jpg', path: 'Sci-Fi/Dune/poster.jpg', url: '/img/1.jpg', size_bytes: 5000 }],
      });

      const res = await fetchLibraryFolders(client, 'lib-1', 'Sci-Fi/Dune');
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/libraries/lib-1/folders?path=Sci-Fi%2FDune');
      expect(res.current_path).toBe('Sci-Fi/Dune');
      expect(res.images.length).toBe(1);
    });
  });

  describe('Subtitles API', () => {
    it('fetches item subtitles', async () => {
      const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue([
        {
          id: 1,
          media_item_id: 101,
          source: 'sidecar',
          language: 'en',
          title: 'English',
          format: 'vtt',
          is_default: true,
          is_forced: false,
          stream_url: '/api/v1/subtitles/1/stream.vtt',
        },
      ]);

      const subs = await fetchItemSubtitles(client, 101);
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/items/101/subtitles');
      expect(subs.length).toBe(1);
      expect(subs[0].language).toBe('en');
    });
  });

  describe('Libraries API', () => {
    it('unlocks private library with PIN', async () => {
      const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue({
        library_id: 'lib-secret',
        token: 'jwt-unlock',
        unlock_token: 'jwt-unlock',
        expires_at: 1728400000,
      });

      const res = await unlockLibrary(client, 'lib-secret', '1234');
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/libraries/lib-secret/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234' }),
      });
      expect(res.unlock_token).toBe('jwt-unlock');
    });
  });

  describe('Events API', () => {
    it('subscribes to SSE events, receives messages, and unsubscribes', () => {
      const listeners: Record<string, ((ev: any) => void)[]> = {};
      const mockClose = vi.fn();

      class MockEventSource {
        url: string;
        onmessage: ((ev: any) => void) | null = null;
        onerror: ((ev: any) => void) | null = null;

        constructor(url: string) {
          this.url = url;
        }

        addEventListener(event: string, handler: (ev: any) => void) {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(handler);
        }

        removeEventListener(event: string, handler: (ev: any) => void) {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((h) => h !== handler);
          }
        }

        close() {
          mockClose();
        }
      }

      (global as any).EventSource = MockEventSource;

      const receivedEvents: Array<{ type: string; payload: any }> = [];
      const onEvent = (type: string, payload: any) => {
        receivedEvents.push({ type, payload });
      };
      const onError = vi.fn();

      const unsubscribe = subscribeEvents('http://localhost:8492', 'test-token', onEvent, onError);

      // Verify event listeners registered
      expect(listeners['layout:changed']).toBeDefined();
      expect(listeners['session:synced']).toBeDefined();
      expect(listeners['library:updated']).toBeDefined();

      // Trigger layout:changed
      listeners['layout:changed'][0]({ data: JSON.stringify({ screen_id: 'home' }) });
      expect(receivedEvents).toEqual([{ type: 'layout:changed', payload: { screen_id: 'home' } }]);

      // Trigger session:synced
      listeners['session:synced'][0]({ data: JSON.stringify({ session_id: 'sess-1', position: 50 }) });
      expect(receivedEvents.length).toBe(2);

      // Trigger library:updated
      listeners['library:updated'][0]({ data: JSON.stringify({ library_id: 'lib-1' }) });
      expect(receivedEvents.length).toBe(3);

      // Unsubscribe
      unsubscribe();
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });
});
