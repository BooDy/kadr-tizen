import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import { ApiClient } from '../../src/api/client';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { TVKeys } from '../../src/navigation/keys';
import * as playbackApi from '../../src/api/playback';
import * as itemsApi from '../../src/api/items';
import * as subtitlesApi from '../../src/api/subtitles';
import * as audioApi from '../../src/api/audio';
import {
  AUDIO_PREFERENCE_STORAGE_KEY,
  loadAudioPreference,
} from '../../src/player/audioPreferences';
import type { AudioStreamInfo } from '../../src/types/kadr';

const DUAL_AUDIO_TRACKS: AudioStreamInfo[] = [
  {
    audio_index: 0,
    stream_index: 1,
    codec: 'aac',
    channels: 2,
    language: 'jpn',
    is_default: true,
    is_commentary: false,
  },
  {
    audio_index: 1,
    stream_index: 2,
    codec: 'eac3',
    channels: 6,
    language: 'eng',
    is_default: false,
    is_commentary: false,
  },
];

function createMockAvplay() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let listener: Record<string, (...args: any[]) => void> = {};
  let state = 'NONE';

  const mockAvplay = {
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
    getTotalTrackInfo: vi.fn(() => [
      { index: 1, type: 'AUDIO', extra_info: '{"language":"jpn"}' },
      { index: 2, type: 'AUDIO', extra_info: '{"language":"eng"}' },
    ]),
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
    emitTime: (ms: number) => listener.oncurrentplaytime?.(ms),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emitBufferingComplete: () => listener.onbufferingcomplete?.(),
  };

  return mockAvplay;
}

describe('PlayerScreen multi-audio discovery, switching & preference persistence', () => {
  let mockAvplay: ReturnType<typeof createMockAvplay>;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    mockAvplay = createMockAvplay();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webapis = { avplay: mockAvplay };

    vi.spyOn(playbackApi, 'reportPlaybackProgress').mockResolvedValue(undefined);
    vi.spyOn(playbackApi, 'startPlaybackSession').mockResolvedValue({
      session_id: 'sess-audio-test',
      media_item_id: 101,
      duration_seconds: 120,
      resume_position_seconds: 0,
    });
    vi.spyOn(itemsApi, 'fetchMediaItem').mockResolvedValue({
      id: 101,
      title: 'Test Title',
      media_type: 'movie',
    });
    vi.spyOn(subtitlesApi, 'fetchItemSubtitles').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).webapis;
  });

  async function flushAsync() {
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  it('hides audio-button for single-audio items, shows it for dual-audio, supports OSD D-pad navigation, and closes AudioTrackModal on BACK_TIZEN without exiting', async () => {
    vi.spyOn(audioApi, 'fetchItemAudioTracks').mockResolvedValueOnce([DUAL_AUDIO_TRACKS[0]]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '#EXTM3U\n',
    } as unknown as Response);

    const client = new ApiClient('http://localhost:8492');
    const onExit = vi.fn();

    const { rerender } = render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={100}
          title="Single Audio Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={onExit}
        />
      </FocusProvider>
    );

    await flushAsync();
    expect(screen.queryByTestId('audio-button')).not.toBeInTheDocument();

    // Switch to dual-audio item
    vi.spyOn(audioApi, 'fetchItemAudioTracks').mockResolvedValueOnce(DUAL_AUDIO_TRACKS);
    rerender(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={101}
          title="Dual Audio Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={onExit}
        />
      </FocusProvider>
    );

    await flushAsync();

    const audioBtn = screen.getByTestId('audio-button');
    const subBtn = screen.getByTestId('subtitles-button');
    const progressBar = screen.getByTestId('player-progress-bar');

    expect(audioBtn).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('data-focused', 'true');

    // ArrowDown from progress bar focuses 'audio' (before 'subtitles')
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.DOWN, key: 'ArrowDown' });
    });
    expect(progressBar).toHaveAttribute('data-focused', 'false');
    expect(audioBtn.className).toContain('tv-focus-ring');
    expect(subBtn.className).not.toContain('tv-focus-ring');

    // ArrowRight moves focus from 'audio' to 'subtitles', ArrowLeft returns to 'audio'
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT, key: 'ArrowRight' });
    });
    expect(subBtn.className).toContain('tv-focus-ring');
    expect(audioBtn.className).not.toContain('tv-focus-ring');

    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.LEFT, key: 'ArrowLeft' });
    });
    expect(audioBtn.className).toContain('tv-focus-ring');

    // Enter opens AudioTrackModal
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.ENTER, key: 'Enter' });
    });
    expect(screen.getByTestId('audio-track-modal')).toBeInTheDocument();
    expect(screen.getByText('Japanese')).toBeInTheDocument();
    expect(screen.getByText('2.0 AAC')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('5.1 EAC3')).toBeInTheDocument();

    // OSD auto-hide stays paused while AudioTrackModal is open
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId('audio-track-modal')).toBeInTheDocument();
    expect(screen.getByTestId('player-osd')).toBeInTheDocument();

    // BACK_TIZEN closes AudioTrackModal ONLY without calling onExit
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    });
    expect(screen.queryByTestId('audio-track-modal')).not.toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('switches audio track in-place via avplay.setSelectTrack without restarting Direct Play MP4 and persists language preference', async () => {
    const directPlayTracks: AudioStreamInfo[] = [
      {
        audio_index: 0,
        stream_index: 1,
        codec: 'aac',
        channels: 2,
        language: 'jpn',
        is_default: true,
        is_commentary: false,
      },
      {
        audio_index: 1,
        stream_index: 2,
        codec: 'ac3',
        channels: 6,
        language: 'eng',
        is_default: false,
        is_commentary: false,
      },
    ];
    vi.spyOn(audioApi, 'fetchItemAudioTracks').mockResolvedValue(directPlayTracks);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.includes('/hls/master.m3u8')) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: 'PLAYBACK_DIRECT_ONLY' }),
        } as unknown as Response;
      }
      return { ok: true, status: 206, json: async () => ({}) } as unknown as Response;
    });

    const client = new ApiClient('http://localhost:8492');
    render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={101}
          title="Direct Play MP4"
          serverUrl="http://localhost:8492"
          token="test-token"
          technical={{ video_codec: 'h264', audio_codec: 'aac', container: 'mp4' }}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushAsync();

    expect(mockAvplay.open).toHaveBeenCalledTimes(1);
    expect(mockAvplay.open).toHaveBeenCalledWith(
      'http://localhost:8492/api/v1/stream/101?token=test-token'
    );
    mockAvplay.open.mockClear();
    mockAvplay.stop.mockClear();
    mockAvplay.close.mockClear();

    // Open AudioTrackModal and select Track 1 (English AC3)
    fireEvent.click(screen.getByTestId('audio-button'));
    expect(screen.getByTestId('audio-track-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('audio-track-btn-1'));

    await flushAsync();

    expect(mockAvplay.setSelectTrack).toHaveBeenCalledWith('AUDIO', 2);
    expect(mockAvplay.open).not.toHaveBeenCalled();
    expect(mockAvplay.stop).not.toHaveBeenCalled();
    expect(mockAvplay.close).not.toHaveBeenCalled();
    expect(screen.queryByTestId('audio-track-modal')).not.toBeInTheDocument();
    expect(loadAudioPreference()).toEqual({
      mode: 'language',
      language: 'eng',
      preferCommentary: false,
    });
    expect(localStorage.getItem(AUDIO_PREFERENCE_STORAGE_KEY)).toContain('"eng"');
  });

  it('automatically falls back from Direct Play to HLS with audio_track & start_time when secondary track codec (dts) is unsupported', async () => {
    const mixedTracks: AudioStreamInfo[] = [
      {
        audio_index: 0,
        stream_index: 1,
        codec: 'aac',
        channels: 2,
        language: 'jpn',
        is_default: true,
        is_commentary: false,
      },
      {
        audio_index: 1,
        stream_index: 2,
        codec: 'dts',
        channels: 6,
        language: 'eng',
        is_default: false,
        is_commentary: false,
      },
    ];
    vi.spyOn(audioApi, 'fetchItemAudioTracks').mockResolvedValue(mixedTracks);

    let hlsAllowed = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.includes('/hls/master.m3u8')) {
        if (!hlsAllowed) {
          return {
            ok: false,
            status: 409,
            json: async () => ({ error: 'PLAYBACK_DIRECT_ONLY' }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          text: async () =>
            '#EXTM3U\n/api/v1/media/101/hls/sessions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/index.m3u8\n',
        } as unknown as Response;
      }
      return { ok: true, status: 206, json: async () => ({}) } as unknown as Response;
    });

    const client = new ApiClient('http://localhost:8492');
    render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={101}
          title="Direct to HLS Fallback"
          serverUrl="http://localhost:8492"
          token="test-token"
          technical={{ video_codec: 'h264', audio_codec: 'aac', container: 'mp4' }}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushAsync();
    expect(mockAvplay.open).toHaveBeenLastCalledWith(
      'http://localhost:8492/api/v1/stream/101?token=test-token'
    );

    // Advance playback position to 32s
    act(() => {
      mockAvplay.emitTime(32000);
    });

    // Enable HLS responses for the upcoming fallback switch
    hlsAllowed = true;
    mockAvplay.open.mockClear();
    mockAvplay.setSelectTrack.mockClear();

    fireEvent.click(screen.getByTestId('audio-button'));
    fireEvent.click(screen.getByTestId('audio-track-btn-1'));

    await flushAsync();

    expect(mockAvplay.setSelectTrack).not.toHaveBeenCalled();
    expect(mockAvplay.open).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/media/101/hls/master.m3u8?')
    );
    const openedHlsUrl = mockAvplay.open.mock.calls[0][0] as string;
    expect(openedHlsUrl).toContain('audio_track=1');
    expect(openedHlsUrl).toContain('start_time=32.000');
  });

  it('automatically falls back from HTML5 Direct Play to HLS when HTMLVideoElement lacks video.audioTracks', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).webapis;
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

    try {
      const aacTracks: AudioStreamInfo[] = [
        {
          audio_index: 0,
          stream_index: 1,
          codec: 'aac',
          channels: 2,
          language: 'jpn',
          is_default: true,
          is_commentary: false,
        },
        {
          audio_index: 1,
          stream_index: 2,
          codec: 'aac',
          channels: 2,
          language: 'eng',
          is_default: false,
          is_commentary: false,
        },
      ];
      vi.spyOn(audioApi, 'fetchItemAudioTracks').mockResolvedValue(aacTracks);

      let hlsAllowed = false;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : String(input);
        if (url.includes('/hls/master.m3u8')) {
          if (!hlsAllowed) {
            return {
              ok: false,
              status: 409,
              json: async () => ({ error: 'PLAYBACK_DIRECT_ONLY' }),
            } as unknown as Response;
          }
          return {
            ok: true,
            status: 200,
            text: async () => '#EXTM3U\n',
          } as unknown as Response;
        }
        return { ok: true, status: 206, json: async () => ({}) } as unknown as Response;
      });

      const client = new ApiClient('http://localhost:8492');
      const { container, unmount } = render(
        <FocusProvider>
          <PlayerScreen
            client={client}
            itemId={102}
            title="HTML5 Audio Fallback"
            serverUrl="http://localhost:8492"
            token="test-token"
            technical={{ video_codec: 'h264', audio_codec: 'aac', container: 'mp4' }}
            onExit={vi.fn()}
          />
        </FocusProvider>
      );

      await flushAsync();
      const videoEl = container.querySelector('video') as HTMLVideoElement;
      expect(videoEl).toBeTruthy();
      expect(videoEl.src).toContain('/api/v1/stream/102');

      // Simulate HTML5 playback position at 20s
      Object.defineProperty(videoEl, 'currentTime', { value: 20, writable: true, configurable: true });
      Object.defineProperty(videoEl, 'duration', { value: 120, writable: true, configurable: true });
      act(() => {
        videoEl.dispatchEvent(new Event('timeupdate'));
      });

      hlsAllowed = true;
      fetchSpy.mockClear();

      fireEvent.click(screen.getByTestId('audio-button'));
      fireEvent.click(screen.getByTestId('audio-track-btn-1'));

      await flushAsync();

      const hlsCall = fetchSpy.mock.calls.find(([u]) => String(u).includes('/hls/master.m3u8'));
      expect(hlsCall).toBeDefined();
      expect(String(hlsCall![0])).toContain('audio_track=1');
      expect(String(hlsCall![0])).toContain('start_time=20.000');

      unmount();
    } finally {
      playSpy.mockRestore();
      pauseSpy.mockRestore();
    }
  });

  it('restarts HLS session mid-stream at 45s with audio_track=1 and deletes the old HLS session cleanly', async () => {
    vi.spyOn(audioApi, 'fetchItemAudioTracks').mockResolvedValue(DUAL_AUDIO_TRACKS);

    const session1 = '11111111-1111-1111-1111-111111111111';
    const session2 = '22222222-2222-2222-2222-222222222222';
    let masterCount = 0;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.includes('/hls/master.m3u8')) {
        masterCount += 1;
        const sid = masterCount === 1 ? session1 : session2;
        return {
          ok: true,
          status: 200,
          text: async () =>
            `#EXTM3U\n/api/v1/media/101/hls/sessions/${sid}/index.m3u8\n`,
        } as unknown as Response;
      }
      return { ok: true, status: 204, text: async () => '' } as unknown as Response;
    });

    const client = new ApiClient('http://localhost:8492');
    render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={101}
          title="HLS Dual Audio"
          serverUrl="http://localhost:8492"
          token="test-token"
          technical={{ video_codec: 'h264', audio_codec: 'dts', container: 'mkv' }}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushAsync();
    expect(mockAvplay.open).toHaveBeenCalledTimes(1);

    // First normal playtime clears TizenAvplayDriver's awaitingHlsStartSync, then advance to 45s
    act(() => {
      mockAvplay.emitTime(1000);
      mockAvplay.emitTime(45000);
    });

    mockAvplay.open.mockClear();

    fireEvent.click(screen.getByTestId('audio-button'));
    fireEvent.click(screen.getByTestId('audio-track-btn-1'));

    await flushAsync();

    // Old HLS session must be deleted cleanly
    expect(fetchSpy).toHaveBeenCalledWith(
      `http://localhost:8492/api/v1/media/101/hls/sessions/${session1}`,
      expect.objectContaining({ method: 'DELETE' })
    );

    // New HLS session opened with audio_track=1 and start_time=45.000
    expect(mockAvplay.open).toHaveBeenCalledTimes(1);
    const nextUrl = mockAvplay.open.mock.calls[0][0] as string;
    expect(nextUrl).toContain('/api/v1/media/101/hls/master.m3u8');
    expect(nextUrl).toContain('audio_track=1');
    expect(nextUrl).toContain('start_time=45.000');
  });

  it('auto-selects preferred Japanese main dialogue (Track 2, skipping Track 1 commentary) across episodes', async () => {
    localStorage.setItem(
      AUDIO_PREFERENCE_STORAGE_KEY,
      JSON.stringify({ mode: 'language', language: 'jpn', preferCommentary: false })
    );

    const episodeTracks: AudioStreamInfo[] = [
      {
        audio_index: 0,
        stream_index: 1,
        codec: 'aac',
        channels: 2,
        language: 'eng',
        title: 'English Default',
        is_default: true,
        is_commentary: false,
      },
      {
        audio_index: 1,
        stream_index: 2,
        codec: 'aac',
        channels: 2,
        language: 'jpn',
        title: 'Japanese Commentary',
        is_default: false,
        is_commentary: true,
      },
      {
        audio_index: 2,
        stream_index: 3,
        codec: 'eac3',
        channels: 6,
        language: 'jpn',
        title: 'Japanese Main',
        is_default: false,
        is_commentary: false,
      },
    ];
    vi.spyOn(audioApi, 'fetchItemAudioTracks').mockResolvedValue(episodeTracks);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '#EXTM3U\n',
    } as unknown as Response);

    const client = new ApiClient('http://localhost:8492');
    const { rerender } = render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={201}
          title="Episode 1"
          serverUrl="http://localhost:8492"
          token="test-token"
          technical={{ video_codec: 'h264', audio_codec: 'eac3', container: 'mkv' }}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushAsync();

    // Episode 1 must open HLS with audio_track=2 (Japanese main dialogue, skipping commentary Track 1)
    let openedUrls = mockAvplay.open.mock.calls.map((c) => c[0] as string);
    expect(openedUrls.some((u) => u.includes('audio_track=2'))).toBe(true);

    // Transition to Episode 2 -> preference memory auto-selects Track 2 again on the next episode
    mockAvplay.open.mockClear();
    rerender(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={202}
          title="Episode 2"
          serverUrl="http://localhost:8492"
          token="test-token"
          technical={{ video_codec: 'h264', audio_codec: 'eac3', container: 'mkv' }}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushAsync();

    openedUrls = mockAvplay.open.mock.calls.map((c) => c[0] as string);
    expect(openedUrls.some((u) => u.includes('/media/202/hls/master.m3u8') && u.includes('audio_track=2'))).toBe(true);

    // OSD audio button displays JPN badge and AudioTrackModal marks Track 2 active
    const audioBtn = screen.getByTestId('audio-button');
    expect(audioBtn).toHaveTextContent('JPN');

    fireEvent.click(audioBtn);
    const track2Btn = screen.getByTestId('audio-track-btn-2');
    expect(track2Btn).toHaveTextContent('Active');
    expect(screen.getByTestId('audio-track-btn-1')).not.toHaveTextContent('Active');
  });

  it('falls back silently to detail.technical.audio_tracks when fetchItemAudioTracks rejects without console warnings', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      vi.spyOn(audioApi, 'fetchItemAudioTracks').mockRejectedValue(new Error('404 Not Found'));
      vi.spyOn(itemsApi, 'fetchMediaItem').mockResolvedValue({
        id: 301,
        title: 'Detail Fallback Movie',
        technical: {
          video_codec: 'h264',
          audio_codec: 'aac',
          container: 'mkv',
          audio_tracks: DUAL_AUDIO_TRACKS,
        },
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '#EXTM3U\n',
      } as unknown as Response);

      const client = new ApiClient('http://localhost:8492');
      render(
        <FocusProvider>
          <PlayerScreen
            client={client}
            itemId={301}
            title="Detail Fallback Movie"
            serverUrl="http://localhost:8492"
            token="test-token"
            onExit={vi.fn()}
          />
        </FocusProvider>
      );

      await flushAsync();

      expect(screen.getByTestId('audio-button')).toBeInTheDocument();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it('guards background HLS reloads when fetchItemAudioTracks resolves while document.hidden is true and applies on foreground return', async () => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });

    try {
      localStorage.setItem(
        AUDIO_PREFERENCE_STORAGE_KEY,
        JSON.stringify({ mode: 'language', language: 'eng', preferCommentary: false })
      );

      let resolveAudioTracks!: (tracks: AudioStreamInfo[]) => void;
      vi.spyOn(audioApi, 'fetchItemAudioTracks').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAudioTracks = resolve;
          })
      );
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '#EXTM3U\n',
      } as unknown as Response);

      const client = new ApiClient('http://localhost:8492');
      render(
        <FocusProvider>
          <PlayerScreen
            client={client}
            itemId={401}
            title="Hidden Audio Sync"
            serverUrl="http://localhost:8492"
            token="test-token"
            technical={{ video_codec: 'h264', audio_codec: 'dts', container: 'mkv' }}
            onExit={vi.fn()}
          />
        </FocusProvider>
      );

      await flushAsync();
      expect(mockAvplay.open).toHaveBeenCalledTimes(1);

      // Background via Smart Hub before audio tracks resolve
      act(() => {
        hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      mockAvplay.open.mockClear();

      // Resolve audio tracks while hidden -> must NOT trigger background HLS reload
      await act(async () => {
        resolveAudioTracks(DUAL_AUDIO_TRACKS);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockAvplay.open).not.toHaveBeenCalled();

      // Foreground return -> reloads HLS with preferred audio_track=1
      await act(async () => {
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await flushAsync();

      expect(mockAvplay.open).toHaveBeenCalledWith(expect.stringContaining('audio_track=1'));
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (document as any).hidden;
    }
  });

  it('stays on Direct Play and calls avplay.setSelectTrack when fetchItemAudioTracks resolves mid-prepareAsync', async () => {
    localStorage.setItem(
      AUDIO_PREFERENCE_STORAGE_KEY,
      JSON.stringify({ mode: 'language', language: 'eng', preferCommentary: false })
    );

    let triggerPrepareOk: (() => void) | undefined;
    mockAvplay.prepareAsync = vi.fn((onOk?: () => void) => {
      triggerPrepareOk = onOk;
    });

    const directPlayTracks: AudioStreamInfo[] = [
      {
        audio_index: 0,
        stream_index: 1,
        codec: 'aac',
        channels: 2,
        language: 'jpn',
        is_default: true,
        is_commentary: false,
      },
      {
        audio_index: 1,
        stream_index: 2,
        codec: 'ac3',
        channels: 6,
        language: 'eng',
        is_default: false,
        is_commentary: false,
      },
    ];

    let resolveAudioTracks!: (tracks: AudioStreamInfo[]) => void;
    vi.spyOn(audioApi, 'fetchItemAudioTracks').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAudioTracks = resolve;
        })
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.includes('/hls/master.m3u8')) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: 'PLAYBACK_DIRECT_ONLY' }),
        } as unknown as Response;
      }
      return { ok: true, status: 206, json: async () => ({}) } as unknown as Response;
    });

    const client = new ApiClient('http://localhost:8492');
    render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={501}
          title="Async Prepare Direct Play"
          serverUrl="http://localhost:8492"
          token="test-token"
          technical={{ video_codec: 'h264', audio_codec: 'aac', container: 'mp4' }}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushAsync();

    // Direct stream opened and prepareAsync is still in flight
    expect(mockAvplay.open).toHaveBeenCalledWith(
      'http://localhost:8492/api/v1/stream/501?token=test-token'
    );
    expect(triggerPrepareOk).toBeDefined();
    fetchSpy.mockClear();
    mockAvplay.open.mockClear();

    // Audio tracks resolve while prepareAsync has NOT completed yet
    await act(async () => {
      resolveAudioTracks(directPlayTracks);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Must NOT fall back to HLS while prepareAsync is in flight
    expect(
      fetchSpy.mock.calls.some(([u]) => String(u).includes('/hls/master.m3u8'))
    ).toBe(false);
    expect(mockAvplay.open).not.toHaveBeenCalled();

    // Now prepareAsync completes -> applies Track 1 (stream_index 2) and stays on Direct Play
    act(() => {
      triggerPrepareOk?.();
    });
    await flushAsync();

    expect(mockAvplay.setSelectTrack).toHaveBeenCalledWith('AUDIO', 2);
    expect(
      fetchSpy.mock.calls.some(([u]) => String(u).includes('/hls/master.m3u8'))
    ).toBe(false);
    expect(mockAvplay.open).not.toHaveBeenCalled();
  });

  it('reloads Html5PlayerDriver HLS stream with audio_track=1 on foreground return when tracks resolved while hidden', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).webapis;
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

    let hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });

    try {
      localStorage.setItem(
        AUDIO_PREFERENCE_STORAGE_KEY,
        JSON.stringify({ mode: 'language', language: 'eng', preferCommentary: false })
      );

      let resolveAudioTracks!: (tracks: AudioStreamInfo[]) => void;
      vi.spyOn(audioApi, 'fetchItemAudioTracks').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAudioTracks = resolve;
          })
      );
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '#EXTM3U\n',
      } as unknown as Response);

      const client = new ApiClient('http://localhost:8492');
      const { unmount } = render(
        <FocusProvider>
          <PlayerScreen
            client={client}
            itemId={601}
            title="HTML5 Hidden HLS Sync"
            serverUrl="http://localhost:8492"
            token="test-token"
            technical={{ video_codec: 'h264', audio_codec: 'dts', container: 'mkv' }}
            onExit={vi.fn()}
          />
        </FocusProvider>
      );

      await flushAsync();
      expect(
        fetchSpy.mock.calls.some(([u]) => String(u).includes('/hls/master.m3u8'))
      ).toBe(true);

      act(() => {
        hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      fetchSpy.mockClear();

      // Resolve audio tracks while hidden on Html5PlayerDriver HLS
      await act(async () => {
        resolveAudioTracks(DUAL_AUDIO_TRACKS);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(
        fetchSpy.mock.calls.some(([u]) => String(u).includes('/hls/master.m3u8'))
      ).toBe(false);

      // Foreground return -> even though Html5PlayerDriver.restore() returns true for HLS,
      // PlayerScreen must reload HLS with audio_track=1
      await act(async () => {
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await flushAsync();

      const hlsReloadCall = fetchSpy.mock.calls.find(([u]) =>
        String(u).includes('/hls/master.m3u8')
      );
      expect(hlsReloadCall).toBeDefined();
      expect(String(hlsReloadCall![0])).toContain('audio_track=1');

      unmount();
    } finally {
      playSpy.mockRestore();
      pauseSpy.mockRestore();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (document as any).hidden;
    }
  });

  it('does not trigger auto-advance onNext when pressing Enter inside AudioTrackModal or SubtitleModal during final 1.5s countdown', async () => {
    const directPlayTracks: AudioStreamInfo[] = [
      {
        audio_index: 0,
        stream_index: 1,
        codec: 'aac',
        channels: 2,
        language: 'jpn',
        is_default: true,
        is_commentary: false,
      },
      {
        audio_index: 1,
        stream_index: 2,
        codec: 'ac3',
        channels: 6,
        language: 'eng',
        is_default: false,
        is_commentary: false,
      },
    ];
    vi.spyOn(audioApi, 'fetchItemAudioTracks').mockResolvedValue(directPlayTracks);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.includes('/hls/master.m3u8')) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: 'PLAYBACK_DIRECT_ONLY' }),
        } as unknown as Response;
      }
      return { ok: true, status: 206, json: async () => ({}) } as unknown as Response;
    });

    const onNext = vi.fn();
    const client = new ApiClient('http://localhost:8492');
    const { unmount } = render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={611}
          title="Episode 1"
          serverUrl="http://localhost:8492"
          token="test-token"
          technical={{
            video_codec: 'h264',
            audio_codec: 'aac',
            container: 'mp4',
            duration_seconds: 120,
          }}
          playlist={[
            { id: 611, title: 'Episode 1' },
            { id: 612, title: 'Episode 2' },
          ]}
          currentIndex={0}
          onNext={onNext}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushAsync();

    // Enter final 1.5s window so autoAdvanceCountdown activates
    act(() => {
      mockAvplay.emitTime(119000);
    });
    expect(screen.getByTestId('auto-advance-overlay')).toBeInTheDocument();

    // Open AudioTrackModal while countdown is active, move focus to Track 1, and press Enter
    fireEvent.click(screen.getByTestId('audio-button'));
    expect(screen.getByTestId('audio-track-modal')).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.DOWN, key: 'ArrowDown' });
    });
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.ENTER, key: 'Enter' });
    });
    await flushAsync();

    expect(onNext).not.toHaveBeenCalled();
    expect(mockAvplay.setSelectTrack).toHaveBeenCalledWith('AUDIO', 2);
    expect(screen.queryByTestId('audio-track-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('auto-advance-overlay')).toBeInTheDocument();

    // Also open SubtitleModal while countdown is active and press Enter
    fireEvent.click(screen.getByTestId('subtitles-button'));
    expect(screen.getByTestId('subtitles-popup')).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.ENTER, key: 'Enter' });
    });
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.queryByTestId('subtitles-popup')).not.toBeInTheDocument();

    // Also guard non-defaultPrevented Enter when a modal is open (without FocusProvider)
    unmount();
    const onNextNoFocus = vi.fn();
    render(
      <PlayerScreen
        client={client}
        itemId={613}
        title="Episode 3"
        serverUrl="http://localhost:8492"
        token="test-token"
        technical={{
          video_codec: 'h264',
          audio_codec: 'aac',
          container: 'mp4',
          duration_seconds: 120,
        }}
        playlist={[
          { id: 613, title: 'Episode 3' },
          { id: 614, title: 'Episode 4' },
        ]}
        currentIndex={0}
        onNext={onNextNoFocus}
        onExit={vi.fn()}
      />
    );
    await flushAsync();
    act(() => {
      mockAvplay.emitTime(119000);
    });
    expect(screen.getByTestId('auto-advance-overlay')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('audio-button'));
    expect(screen.getByTestId('audio-track-modal')).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.ENTER, key: 'Enter' });
    });
    expect(onNextNoFocus).not.toHaveBeenCalled();

    // Closing the modal and pressing Enter on the countdown advances normally
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    });
    expect(screen.queryByTestId('audio-track-modal')).not.toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.ENTER, key: 'Enter' });
    });
    expect(onNextNoFocus).toHaveBeenCalledTimes(1);
  });

  it('defers Direct Play audio sync when async Html5PlayerDriver startup completes while document.hidden is true and applies on foreground return', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).webapis;

    let resolvePlay!: () => void;
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePlay = resolve;
        })
    );
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

    let hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });

    try {
      localStorage.setItem(
        AUDIO_PREFERENCE_STORAGE_KEY,
        JSON.stringify({ mode: 'language', language: 'eng', preferCommentary: false })
      );

      const aacTracks: AudioStreamInfo[] = [
        {
          audio_index: 0,
          stream_index: 1,
          codec: 'aac',
          channels: 2,
          language: 'jpn',
          is_default: true,
          is_commentary: false,
        },
        {
          audio_index: 1,
          stream_index: 2,
          codec: 'aac',
          channels: 2,
          language: 'eng',
          is_default: false,
          is_commentary: false,
        },
      ];
      let resolveAudioTracks!: (tracks: AudioStreamInfo[]) => void;
      vi.spyOn(audioApi, 'fetchItemAudioTracks').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAudioTracks = resolve;
          })
      );

      let hlsAllowed = false;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : String(input);
        if (url.includes('/hls/master.m3u8')) {
          if (!hlsAllowed) {
            return {
              ok: false,
              status: 429,
              json: async () => ({ error: 'Too many transcodes' }),
            } as unknown as Response;
          }
          return {
            ok: true,
            status: 200,
            text: async () => '#EXTM3U\n',
          } as unknown as Response;
        }
        return { ok: true, status: 206, json: async () => ({}) } as unknown as Response;
      });

      const client = new ApiClient('http://localhost:8492');
      const { container, unmount } = render(
        <FocusProvider>
          <PlayerScreen
            client={client}
            itemId={700}
            title="Async HTML5 Hidden Startup"
            serverUrl="http://localhost:8492"
            token="test-token"
            technical={{ video_codec: 'h264', audio_codec: 'aac', container: 'mp4' }}
            onExit={vi.fn()}
          />
        </FocusProvider>
      );

      await flushAsync();
      const videoEl = container.querySelector('video') as HTMLVideoElement;
      expect(videoEl).toBeTruthy();
      expect(videoEl.src).toContain('/api/v1/stream/700');

      // Audio tracks resolve while Html5PlayerDriver.init() is still awaiting play()
      await act(async () => {
        resolveAudioTracks(aacTracks);
        await Promise.resolve();
        await Promise.resolve();
      });

      // Tab becomes hidden before initPromise resolves
      act(() => {
        hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      fetchSpy.mockClear();

      // Now Html5PlayerDriver initPromise resolves while document.hidden is true
      await act(async () => {
        resolvePlay();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      // Must NOT spawn a background HLS probe while hidden
      expect(
        fetchSpy.mock.calls.some(([u]) => String(u).includes('/hls/master.m3u8'))
      ).toBe(false);

      // Foreground return applies the deferred audio sync via HLS reload
      hlsAllowed = true;
      await act(async () => {
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await flushAsync();

      const hlsReloadCall = fetchSpy.mock.calls.find(([u]) =>
        String(u).includes('/hls/master.m3u8')
      );
      expect(hlsReloadCall).toBeDefined();
      expect(String(hlsReloadCall![0])).toContain('audio_track=1');

      unmount();
    } finally {
      playSpy.mockRestore();
      pauseSpy.mockRestore();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (document as any).hidden;
    }
  });

  it('stays playing on Direct Play Track 0 instead of crashing into error screen after 503 or 409 Direct Play fallback with saved secondary audio preference', async () => {
    localStorage.setItem(
      AUDIO_PREFERENCE_STORAGE_KEY,
      JSON.stringify({ mode: 'language', language: 'eng', preferCommentary: false })
    );

    const dtsSecondaryTracks: AudioStreamInfo[] = [
      {
        audio_index: 0,
        stream_index: 1,
        codec: 'aac',
        channels: 2,
        language: 'jpn',
        is_default: true,
        is_commentary: false,
      },
      {
        audio_index: 1,
        stream_index: 2,
        codec: 'dts',
        channels: 6,
        language: 'eng',
        is_default: false,
        is_commentary: false,
      },
    ];
    vi.spyOn(audioApi, 'fetchItemAudioTracks').mockResolvedValue(dtsSecondaryTracks);

    let hlsProbeCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.includes('/hls/master.m3u8')) {
        hlsProbeCount += 1;
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: 'Transcoding is disabled' }),
        } as unknown as Response;
      }
      return { ok: true, status: 206, json: async () => ({}) } as unknown as Response;
    });

    const client = new ApiClient('http://localhost:8492');
    const { unmount } = render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={701}
          title="503 Direct Play With Saved Secondary Audio"
          serverUrl="http://localhost:8492"
          token="test-token"
          technical={{ video_codec: 'h264', audio_codec: 'aac', container: 'mp4' }}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushAsync();

    // Must fall back to Direct Play Track 0 cleanly without bouncing back to HLS or crashing
    expect(hlsProbeCount).toBe(1);
    expect(mockAvplay.open).toHaveBeenCalledTimes(1);
    expect(mockAvplay.open).toHaveBeenCalledWith(
      'http://localhost:8492/api/v1/stream/701?token=test-token'
    );
    expect(screen.queryByText('Playback Error')).not.toBeInTheDocument();
    expect(screen.queryByText(/Transcoding failed/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('audio-button')).toHaveTextContent('JPN');

    fireEvent.click(screen.getByTestId('audio-button'));
    expect(screen.getByTestId('audio-track-btn-0')).toHaveTextContent('Active');
    expect(screen.getByTestId('audio-track-btn-1')).not.toHaveTextContent('Active');

    unmount();

    // Also verify 409 PLAYBACK_DIRECT_ONLY on Html5PlayerDriver (no video.audioTracks) stays on Direct Play Track 0
    // including across background/foreground visibility transitions, and resets on itemId change.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).webapis;
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

    let hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });

    try {
      const aacTracks: AudioStreamInfo[] = [
        {
          audio_index: 0,
          stream_index: 1,
          codec: 'aac',
          channels: 2,
          language: 'jpn',
          is_default: true,
          is_commentary: false,
        },
        {
          audio_index: 1,
          stream_index: 2,
          codec: 'aac',
          channels: 2,
          language: 'eng',
          is_default: false,
          is_commentary: false,
        },
      ];
      vi.spyOn(audioApi, 'fetchItemAudioTracks').mockResolvedValue(aacTracks);

      let allowHlsForNextItem = false;
      hlsProbeCount = 0;
      fetchSpy.mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : String(input);
        if (url.includes('/hls/master.m3u8')) {
          hlsProbeCount += 1;
          if (!allowHlsForNextItem) {
            return {
              ok: false,
              status: 409,
              json: async () => ({ error: 'PLAYBACK_DIRECT_ONLY' }),
            } as unknown as Response;
          }
          return {
            ok: true,
            status: 200,
            text: async () => '#EXTM3U\n',
          } as unknown as Response;
        }
        return { ok: true, status: 206, json: async () => ({}) } as unknown as Response;
      });

      const { container, rerender, unmount: unmountHtml5 } = render(
        <FocusProvider>
          <PlayerScreen
            client={client}
            itemId={702}
            title="409 HTML5 Direct Play With Saved Preference"
            serverUrl="http://localhost:8492"
            token="test-token"
            technical={{
              video_codec: 'h264',
              audio_codec: 'aac',
              container: 'mp4',
              audio_tracks: aacTracks,
            }}
            onExit={vi.fn()}
          />
        </FocusProvider>
      );

      await flushAsync();

      const videoEl = container.querySelector('video') as HTMLVideoElement;
      expect(videoEl).toBeTruthy();
      expect(videoEl.src).toContain('/api/v1/stream/702');
      expect(hlsProbeCount).toBe(1);
      expect(screen.queryByText('Playback Error')).not.toBeInTheDocument();
      expect(screen.getByTestId('audio-button')).toHaveTextContent('JPN');

      // Background + foreground cycle must keep Direct Play Track 0 without re-probing 409 HLS
      act(() => {
        hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await act(async () => {
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await flushAsync();

      expect(hlsProbeCount).toBe(1);
      expect(screen.queryByText('Playback Error')).not.toBeInTheDocument();

      // Changing itemId resets hlsUnavailableForItemRef so next item can use HLS with audio_track=1
      allowHlsForNextItem = true;
      fetchSpy.mockClear();
      rerender(
        <FocusProvider>
          <PlayerScreen
            client={client}
            itemId={703}
            title="Next Item With HLS Enabled"
            serverUrl="http://localhost:8492"
            token="test-token"
            technical={{
              video_codec: 'h264',
              audio_codec: 'dts',
              container: 'mkv',
              audio_tracks: dtsSecondaryTracks,
            }}
            onExit={vi.fn()}
          />
        </FocusProvider>
      );

      await flushAsync();

      const nextItemHlsCall = fetchSpy.mock.calls.find(([u]) =>
        String(u).includes('/media/703/hls/master.m3u8')
      );
      expect(nextItemHlsCall).toBeDefined();
      expect(String(nextItemHlsCall![0])).toContain('audio_track=1');

      unmountHtml5();
    } finally {
      playSpy.mockRestore();
      pauseSpy.mockRestore();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (document as any).hidden;
    }
  });
});
