import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen, fireEvent, cleanup } from '@testing-library/react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import { ApiClient } from '../../src/api/client';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { savePlaybackSettings } from '../../src/player/playbackSettings';
import * as itemsApi from '../../src/api/items';
import * as subtitlesApi from '../../src/api/subtitles';
import * as audioApi from '../../src/api/audio';
import * as playbackApi from '../../src/api/playback';
import * as tizenLifecycle from '../../src/utils/tizenLifecycle';

function createMockAvplay() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let listener: Record<string, (...args: any[]) => void> = {};
  let state = 'NONE';

  return {
    open: vi.fn((_url: string) => {
      state = 'IDLE';
    }),
    close: vi.fn(() => {
      state = 'NONE';
    }),
    stop: vi.fn(() => {
      state = 'IDLE';
    }),
    play: vi.fn(() => {
      state = 'PLAYING';
    }),
    pause: vi.fn(() => {
      state = 'PAUSED';
    }),
    seekTo: vi.fn((_ms: number, onOk?: () => void) => {
      onOk?.();
    }),
    prepareAsync: vi.fn((onOk?: () => void) => {
      state = 'READY';
      onOk?.();
    }),
    getState: vi.fn(() => state),
    getDuration: vi.fn(() => 120000),
    getCurrentTime: vi.fn(() => 0),
    getCurrentStreamInfo: vi.fn(() => []),
    getTotalTrackInfo: vi.fn(() => []),
    setSelectTrack: vi.fn(),
    setDisplayRect: vi.fn(),
    setDisplayMethod: vi.fn(),
    setDisplayRotation: vi.fn(),
    setSilentSubtitle: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setListener: vi.fn((l: Record<string, (...args: any[]) => void>) => {
      listener = l;
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emitError: (err: any) => listener.onerror?.(err),
  };
}

describe('PlayerScreen Playback Settings Integration', () => {
  const serverUrl = 'http://127.0.0.1:8492';
  const token = 'test-token';
  const createFetchSpy = () => vi.spyOn(globalThis, 'fetch');
  let mockAvplay: ReturnType<typeof createMockAvplay>;
  let fetchSpy: ReturnType<typeof createFetchSpy>;
  let playSpy: ReturnType<typeof vi.spyOn>;

  async function flushMicrotasks(rounds = 8) {
    for (let i = 0; i < rounds; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    tizenLifecycle.resetScreenSaverStateForTests();
    mockAvplay = createMockAvplay();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webapis = { avplay: mockAvplay };

    playSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event('playing'));
        return Promise.resolve();
      });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

    vi.spyOn(itemsApi, 'fetchMediaItem').mockResolvedValue({
      id: 101,
      title: 'Settings Test Movie',
      media_type: 'movie',
    } as never);
    vi.spyOn(subtitlesApi, 'fetchItemSubtitles').mockResolvedValue([]);
    vi.spyOn(audioApi, 'fetchItemAudioTracks').mockResolvedValue([]);
    vi.spyOn(playbackApi, 'reportPlaybackProgress').mockResolvedValue(undefined);
    vi.spyOn(playbackApi, 'startPlaybackSession').mockResolvedValue({
      session_id: 'sess-settings',
      media_item_id: 101,
      duration_seconds: 120,
      resume_position_seconds: 0,
    });
    vi.spyOn(playbackApi, 'reportSessionProgress').mockResolvedValue(undefined);
    vi.spyOn(playbackApi, 'endPlaybackSession').mockResolvedValue(undefined);

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : String(input);
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
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    tizenLifecycle.resetScreenSaverStateForTests();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).webapis;
  });

  it('requests HLS master playlist with max_height=720 when 720p quality cap is saved', async () => {
    savePlaybackSettings({ hlsMaxHeight: 720, preferredPlayerEngine: 'auto' });
    const client = new ApiClient(serverUrl);
    client.setToken(token);

    render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={101}
          title="720p Movie"
          serverUrl={serverUrl}
          token={token}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushMicrotasks();

    const hlsUrls = fetchSpy.mock.calls
      .map(([u]) => String(u))
      .filter((u) => u.includes('/api/v1/media/101/hls/master.m3u8'));

    expect(hlsUrls.length).toBeGreaterThan(0);
    expect(hlsUrls[0]).toContain('max_height=720');
    expect(hlsUrls[0]).not.toContain('max_height=1080');
    expect(mockAvplay.open).toHaveBeenCalledWith(expect.stringContaining('max_height=720'));
  });

  it('omits max_height from the HLS master playlist URL when Original (hlsMaxHeight=0) is saved', async () => {
    savePlaybackSettings({ hlsMaxHeight: 0, preferredPlayerEngine: 'auto' });
    const client = new ApiClient(serverUrl);
    client.setToken(token);

    render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={102}
          title="Original Quality Movie"
          serverUrl={serverUrl}
          token={token}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushMicrotasks();

    const hlsUrls = fetchSpy.mock.calls
      .map(([u]) => String(u))
      .filter((u) => u.includes('/api/v1/media/102/hls/master.m3u8'));

    expect(hlsUrls.length).toBeGreaterThan(0);
    expect(hlsUrls[0]).not.toContain('max_height=');
    expect(mockAvplay.open).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/media\/102\/hls\/master\.m3u8/)
    );
    expect(mockAvplay.open.mock.calls[0][0]).not.toContain('max_height=');
  });

  it('initializes Html5PlayerDriver instead of TizenAvplayDriver when preferredPlayerEngine is html5 and preserves forceHtml5 across handleRetry()', async () => {
    savePlaybackSettings({ hlsMaxHeight: 1080, preferredPlayerEngine: 'html5' });
    const client = new ApiClient(serverUrl);
    client.setToken(token);

    const { container } = render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={103}
          title="Forced HTML5 Movie"
          serverUrl={serverUrl}
          token={token}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushMicrotasks();

    // Must use Html5PlayerDriver (<video>) rather than AVPlay even though window.webapis.avplay exists
    const initialVideo = container.querySelector('video');
    expect(initialVideo).not.toBeNull();
    expect(mockAvplay.open).not.toHaveBeenCalled();
    expect(playSpy).toHaveBeenCalled();

    // Simulate an HTML5 video playback error and verify Retry Playback preserves forceHtml5 === true
    act(() => {
      initialVideo?.dispatchEvent(new Event('error'));
    });

    expect(screen.getByText('Playback Error')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try html5 video player/i })).not.toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry playback/i });
    await act(async () => {
      fireEvent.click(retryBtn);
    });
    await flushMicrotasks();

    expect(mockAvplay.open).not.toHaveBeenCalled();
    expect(container.querySelector('video')).not.toBeNull();
    expect(screen.queryByText('Playback Error')).not.toBeInTheDocument();
  });

  it('keeps forceHtml5 across itemId transitions when html5 is preferred, and resets manual error fallback when auto is preferred', async () => {
    savePlaybackSettings({ hlsMaxHeight: 1080, preferredPlayerEngine: 'auto' });
    const client = new ApiClient(serverUrl);
    client.setToken(token);

    const { container, rerender } = render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={201}
          title="Auto Item 1"
          serverUrl={serverUrl}
          token={token}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushMicrotasks();
    expect(mockAvplay.open).toHaveBeenCalledTimes(1);
    expect(container.querySelector('video')).toBeNull();

    // Trigger AVPlay error and manually switch to HTML5 on error
    act(() => {
      mockAvplay.emitError('PLAYER_ERROR_NOT_SUPPORTED');
    });
    const switchHtml5Btn = screen.getByRole('button', { name: /try html5 video player/i });
    await act(async () => {
      fireEvent.click(switchHtml5Btn);
    });
    await flushMicrotasks();

    expect(container.querySelector('video')).not.toBeNull();
    expect(mockAvplay.open).toHaveBeenCalledTimes(1);

    // Advance to next item while preferredPlayerEngine is 'auto' -> resets manual forceHtml5 back to false
    rerender(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={202}
          title="Auto Item 2"
          serverUrl={serverUrl}
          token={token}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );
    await flushMicrotasks();

    expect(mockAvplay.open).toHaveBeenCalledTimes(2);
    expect(container.querySelector('video')).toBeNull();

    // Now switch setting to 'html5' and advance to item 203 -> Html5PlayerDriver stays active across itemId transitions
    savePlaybackSettings({ hlsMaxHeight: 720, preferredPlayerEngine: 'html5' });
    rerender(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={203}
          title="Forced HTML5 Item 3"
          serverUrl={serverUrl}
          token={token}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );
    await flushMicrotasks();

    expect(mockAvplay.open).toHaveBeenCalledTimes(2);
    expect(container.querySelector('video')).not.toBeNull();

    // And transitioning again to item 204 keeps Html5PlayerDriver active
    rerender(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={204}
          title="Forced HTML5 Item 4"
          serverUrl={serverUrl}
          token={token}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );
    await flushMicrotasks();

    expect(mockAvplay.open).toHaveBeenCalledTimes(2);
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('uses effectiveForceHtml5 in computeInitialPlaybackMode so audio-less MKV uses HLS instead of invalid HTML5 direct play', async () => {
    savePlaybackSettings({ hlsMaxHeight: 1080, preferredPlayerEngine: 'html5' });
    const client = new ApiClient(serverUrl);
    client.setToken(token);

    render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={301}
          title="Silent MKV"
          serverUrl={serverUrl}
          token={token}
          technical={{ video_codec: 'h264', audio_codec: '', container: 'mkv' }}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushMicrotasks();

    const hlsCalls = fetchSpy.mock.calls.filter(([u]) =>
      String(u).includes('/api/v1/media/301/hls/master.m3u8')
    );
    const directCalls = fetchSpy.mock.calls.filter(([u]) =>
      String(u).includes('/api/v1/stream/301')
    );
    expect(hlsCalls.length).toBeGreaterThan(0);
    expect(directCalls.length).toBe(0);
  });
});
