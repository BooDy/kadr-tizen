import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import { ApiClient } from '../../src/api/client';
import * as playbackApi from '../../src/api/playback';

import * as itemsApi from '../../src/api/items';
import * as subtitlesApi from '../../src/api/subtitles';

let mockDriver: {
  name: string;
  init: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  seekTo: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  setSubtitleTrack: ReturnType<typeof vi.fn>;
  onTimeUpdate: ReturnType<typeof vi.fn>;
  onStateChange: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
};

vi.mock('../../src/api/subtitles', () => ({
  fetchItemSubtitles: vi.fn(),
}));

vi.mock('../../src/api/items', () => ({
  fetchMediaItem: vi.fn(),
}));

vi.mock('../../src/player/driver', () => ({
  createPlayerDriver: vi.fn(() => {
    mockDriver = {
      name: 'Tizen AVPlay',
      init: vi.fn().mockImplementation(async () => {}),
      play: vi.fn(),
      pause: vi.fn(),
      seekTo: vi.fn(),
      destroy: vi.fn(),
      setSubtitleTrack: vi.fn(),
      onTimeUpdate: vi.fn(),
      onStateChange: vi.fn(),
      onError: vi.fn(),
    };
    return mockDriver;
  }),
}));

describe('PlayerScreen Pre-Flight Stream Check', () => {
  const apiClient = new ApiClient('http://127.0.0.1:8492');
  let fetchSpy: any;
  let streamProbeHandler: ((url: string, init?: RequestInit) => Promise<any> | any) | null = null;

  beforeEach(() => {
    vi.mocked(itemsApi.fetchMediaItem).mockResolvedValue({} as any);
    vi.mocked(subtitlesApi.fetchItemSubtitles).mockResolvedValue([]);
    vi.spyOn(playbackApi, 'reportPlaybackProgress').mockResolvedValue(undefined);
    streamProbeHandler = null;

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      if (url.includes('/api/v1/stream/')) {
        if (streamProbeHandler) {
          return streamProbeHandler(url, init);
        }
        return {
          ok: true,
          status: 206,
          headers: new Headers(),
          json: async () => ({}),
        } as unknown as Response;
      }

      // Default responses for metadata & subtitles
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({}),
      } as unknown as Response;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('probes streamUrl with Range: bytes=0-0 and abort signal', async () => {
    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="101"
        title="Dexter: New Blood"
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:8492/api/v1/stream/101?token=test-token',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Range: 'bytes=0-0' }),
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  it('intercepts HTTP 404 response, halts driver init, and displays Media File Missing error', async () => {
    streamProbeHandler = () => ({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => ({ error: 'Media file missing from disk' }),
    });

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="101"
        title="Dexter: New Blood"
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Media File Missing from Server Disk')).toBeInTheDocument();
    });

    expect(mockDriver.init).not.toHaveBeenCalled();
    expect(screen.getByText(/Media File Missing: Media file missing from disk \(HTTP 404\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/The media file for this item could not be found in storage. Please verify your library paths or rescan your library on the server./i)
    ).toBeInTheDocument();
  });

  it('handles 404 with missing or non-json body gracefully using default message', async () => {
    streamProbeHandler = () => ({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => {
        throw new Error('Not JSON');
      },
    });

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="102"
        title="Missing Movie"
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Media File Missing from Server Disk')).toBeInTheDocument();
    });

    expect(mockDriver.init).not.toHaveBeenCalled();
    expect(screen.getByText(/Media File Missing: Media file missing from disk \(HTTP 404\)/i)).toBeInTheDocument();
  });

  it('proceeds with driver init when probe returns 200 or 206 OK', async () => {
    streamProbeHandler = () => ({
      ok: true,
      status: 206,
      headers: new Headers(),
      json: async () => ({}),
    });

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="103"
        title="Valid Stream"
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockDriver.init).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        'http://127.0.0.1:8492/api/v1/stream/103?token=test-token',
        0
      );
    });

    expect(screen.queryByText('Media File Missing from Server Disk')).not.toBeInTheDocument();
  });

  it('proceeds with driver init when probe fails due to network error', async () => {
    streamProbeHandler = () => Promise.reject(new Error('Network error during probe'));

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="104"
        title="Stream with Probe Network Glitch"
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockDriver.init).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        'http://127.0.0.1:8492/api/v1/stream/104?token=test-token',
        0
      );
    });
  });

  it('aborts probe request when unmounted before probe completes', async () => {
    let capturedSignal: AbortSignal | null | undefined;
    streamProbeHandler = (_url, init) => {
      capturedSignal = init?.signal;
      return new Promise(() => {}); // never resolves
    };

    const { unmount } = render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="105"
        title="Unmounting Stream"
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(capturedSignal).toBeDefined();
    });
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
    expect(mockDriver.init).not.toHaveBeenCalled();
  });
});
