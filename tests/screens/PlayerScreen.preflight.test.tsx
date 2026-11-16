import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
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
  setMediaHints: ReturnType<typeof vi.fn>;
  onTimeUpdate: ReturnType<typeof vi.fn>;
  onStateChange: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  onSeekFailure: ReturnType<typeof vi.fn>;
  errorCallback?: (err: string) => void;
  seekFailureCallback?: (targetMs: number) => void;
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
      setMediaHints: vi.fn(),
      onTimeUpdate: vi.fn(),
      onStateChange: vi.fn(),
      onError: vi.fn((cb: (err: string) => void) => {
        mockDriver.errorCallback = cb;
      }),
      onSeekFailure: vi.fn((cb: (targetMs: number) => void) => {
        mockDriver.seekFailureCallback = cb;
      }),
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
      if (url.includes('/api/v1/stream/') || url.includes('/hls/master.m3u8')) {
        if (streamProbeHandler) {
          return streamProbeHandler(url, init);
        }
        if (url.includes('/hls/master.m3u8')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            text: async () => '#EXTM3U\n',
            json: async () => ({}),
          } as unknown as Response;
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

  it('probes default HLS streamUrl first and falls back to Direct Stream with Range: bytes=0-0 and abort signal on 409', async () => {
    streamProbeHandler = (url) => {
      if (url.includes('/hls/master.m3u8')) {
        return {
          ok: false,
          status: 409,
          headers: new Headers(),
          json: async () => ({ error: 'PLAYBACK_DIRECT_ONLY' }),
        };
      }
      return {
        ok: true,
        status: 206,
        headers: new Headers(),
        json: async () => ({}),
      };
    };

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
        'http://127.0.0.1:8492/api/v1/media/101/hls/master.m3u8?video_codec=h264&audio_codec=aac&max_height=1080&token=test-token',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Range: 'bytes=0-0' }),
        })
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:8492/api/v1/stream/101?token=test-token',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Range: 'bytes=0-0' }),
          signal: expect.any(AbortSignal),
        })
      );
    });

    await waitFor(() => {
      expect(mockDriver.init).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        'http://127.0.0.1:8492/api/v1/stream/101?token=test-token',
        0
      );
    });
    expect(screen.queryByText('Playback Error')).not.toBeInTheDocument();
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

  it('proceeds with driver init on default HLS URL when probe returns 200 OK', async () => {
    streamProbeHandler = () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '#EXTM3U\n',
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
        'http://127.0.0.1:8492/api/v1/media/103/hls/master.m3u8?video_codec=h264&audio_codec=aac&max_height=1080&token=test-token',
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
        'http://127.0.0.1:8492/api/v1/media/104/hls/master.m3u8?video_codec=h264&audio_codec=aac&max_height=1080&token=test-token',
        0
      );
    });
  });

  it('aborts direct-stream probe request when unmounted before probe completes', async () => {
    let capturedSignal: AbortSignal | null | undefined;
    streamProbeHandler = (url, init) => {
      if (url.includes('/hls/master.m3u8')) {
        return {
          ok: false,
          status: 409,
          headers: new Headers(),
          json: async () => ({ error: 'PLAYBACK_DIRECT_ONLY' }),
        };
      }
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

  it('automatically falls back to Direct Stream when /hls/master.m3u8 returns 503 for a compatible MP4 item', async () => {
    streamProbeHandler = (url) => {
      if (url.includes('/hls/master.m3u8')) {
        return {
          ok: false,
          status: 503,
          headers: new Headers(),
          json: async () => ({ error: 'Transcoding is disabled' }),
        };
      }
      return {
        ok: true,
        status: 206,
        headers: new Headers(),
        json: async () => ({}),
      };
    };

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="106"
        title="Compatible MP4"
        technical={{ video_codec: 'h264', audio_codec: 'aac', container: 'mp4' }}
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockDriver.init).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        'http://127.0.0.1:8492/api/v1/stream/106?token=test-token',
        0
      );
    });
    expect(screen.queryByText('Playback Error')).not.toBeInTheDocument();
  });

  it('automatically falls back to Direct Stream when /hls/master.m3u8 fails with HTTP 500 Transcoding failed (#1346 regression)', async () => {
    streamProbeHandler = (url) => {
      if (url.includes('/hls/master.m3u8')) {
        return {
          ok: false,
          status: 500,
          headers: new Headers(),
          json: async () => ({
            error: "Transcoding failed: Process exited prematurely: Stream map '0:a:0' matches no streams",
          }),
        };
      }
      return {
        ok: true,
        status: 206,
        headers: new Headers(),
        json: async () => ({}),
      };
    };

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={1346}
        title="Vertical Home Video #1346"
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockDriver.init).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        'http://127.0.0.1:8492/api/v1/stream/1346?token=test-token',
        0
      );
    });
    expect(screen.queryByText('Playback Error')).not.toBeInTheDocument();
  });

  it('skips HLS and goes straight to Direct Stream when item metadata shows a compatible video with no audio stream', async () => {
    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={1292}
        title="Silent Vertical Clip"
        technical={{
          video_codec: 'h264',
          audio_codec: undefined,
          container: 'mp4',
          resolution: '720x1280',
        }}
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockDriver.init).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        'http://127.0.0.1:8492/api/v1/stream/1292?token=test-token',
        0
      );
    });

    const probedUrls = fetchSpy.mock.calls.map((c: any[]) => String(c[0]));
    expect(probedUrls.some((u: string) => u.includes('/hls/master.m3u8'))).toBe(false);
    expect(probedUrls).toContain('http://127.0.0.1:8492/api/v1/stream/1292?token=test-token');
  });

  it('never infinite-loops between HLS and Direct Stream when both fail, and deduplicates "Transcoding failed:" prefixes on unplayable codecs', async () => {
    let hlsHits = 0;
    let directHits = 0;
    streamProbeHandler = (url) => {
      if (url.includes('/hls/master.m3u8')) {
        hlsHits += 1;
        return {
          ok: false,
          status: 500,
          headers: new Headers(),
          json: async () => ({ error: 'Transcoding failed: Process exited prematurely' }),
        };
      }
      directHits += 1;
      return {
        ok: true,
        status: 206,
        headers: new Headers(),
        json: async () => ({}),
      };
    };

    const { unmount } = render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={1346}
        title="Both Fail Clip"
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockDriver.init).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        'http://127.0.0.1:8492/api/v1/stream/1346?token=test-token',
        0
      );
    });

    // Even if Direct Stream later fails or seek fails, it must NOT bounce back to broken HLS
    act(() => {
      mockDriver.seekFailureCallback?.(30000);
      mockDriver.errorCallback?.('PLAYER_ERROR_INVALID_OPERATION');
    });

    expect(hlsHits).toBe(1);
    expect(directHits).toBe(1);
    expect(screen.getByText('Playback Error')).toBeInTheDocument();
    unmount();

    // Unplayable DTS audio on HTTP 500 surfaces clean single-prefix "Transcoding failed: ..." error
    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={999}
        title="DTS Movie"
        technical={{ video_codec: 'hevc', audio_codec: 'dts', container: 'mkv' }}
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText('Transcoding failed: Process exited prematurely (HTTP 500)')
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/Transcoding failed:\s*Transcoding failed:/i)).not.toBeInTheDocument();
  });

  it('automatically falls back to Direct Stream once if master.m3u8 returns 200 OK but AVPlay errors before playback begins', async () => {
    const sessionUuid = '11111111-2222-3333-4444-555555555555';
    streamProbeHandler = (url) => {
      if (url.includes('/hls/master.m3u8')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            `#EXTM3U\n/api/v1/media/1348/hls/sessions/${sessionUuid}/index.m3u8\n`,
          json: async () => ({}),
        };
      }
      return {
        ok: true,
        status: 206,
        headers: new Headers(),
        json: async () => ({}),
      };
    };

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={1348}
        title="Broken Segment 0"
        technical={{ video_codec: 'h264', audio_codec: 'aac', container: 'mp4' }}
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockDriver.init).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        'http://127.0.0.1:8492/api/v1/media/1348/hls/master.m3u8?video_codec=h264&audio_codec=aac&max_height=1080&token=test-token',
        0
      );
    });

    act(() => {
      mockDriver.errorCallback?.('PLAYER_ERROR_CONNECTION_FAILED');
    });

    await waitFor(() => {
      expect(mockDriver.init).toHaveBeenLastCalledWith(
        expect.any(HTMLElement),
        'http://127.0.0.1:8492/api/v1/stream/1348?token=test-token',
        0
      );
    });
    expect(screen.queryByText('Playback Error')).not.toBeInTheDocument();
  });
});
