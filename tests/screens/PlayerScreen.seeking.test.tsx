import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import { TVKeys } from '../../src/navigation/keys';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { ApiClient } from '../../src/api/client';
import * as playbackApi from '../../src/api/playback';
import * as itemsApi from '../../src/api/items';

let mockDriver: any = null;
let onTimeUpdateCb: ((pos: number, dur: number) => void) | null = null;
let onStateChangeCb: ((state: string) => void) | null = null;
let onSeekFailureCb: ((targetMs: number) => void) | null = null;

const createMockDriver = () => {
  mockDriver = {
    name: 'Tizen AVPlay',
    init: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    setSubtitleTrack: vi.fn(),
    destroy: vi.fn(),
    onTimeUpdate: vi.fn((cb) => {
      onTimeUpdateCb = cb;
      cb(30000, 120000);
    }),
    onStateChange: vi.fn((cb) => {
      onStateChangeCb = cb;
      cb('playing');
    }),
    onError: vi.fn(),
    onSeekFailure: vi.fn((cb) => {
      onSeekFailureCb = cb;
    }),
  };
  return mockDriver;
};

vi.mock('../../src/player/driver', () => ({
  createPlayerDriver: vi.fn(() => createMockDriver()),
}));

vi.mock('../../src/player/avplay-driver', () => ({
  createPlayerDriver: vi.fn(() => createMockDriver()),
}));

describe('PlayerScreen Seeking & Fast Forward', () => {
  const apiClient = new ApiClient('http://127.0.0.1:8492');

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  it('handles TVKeys.FAST_FORWARD (417) with progressive skips and displays seek HUD', async () => {
    const onExit = vi.fn();
    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="101"
        apiClient={apiClient}
        onExit={onExit}
      />
    );

    // Initial position is 30,000ms (30s)
    // 1st press FF: +30s -> target 60s
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.FAST_FORWARD });
    });

    expect(screen.getByTestId('seek-hud-badge')).toBeInTheDocument();
    expect(screen.getByTestId('seek-hud-badge')).toHaveTextContent('+30s');

    // Fast-forward debounce: advance timers 350ms
    act(() => {
      vi.advanceTimersByTime(350);
    });

    // 2nd press FF within window: +60s -> target 120s
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.FAST_FORWARD });
    });
    expect(screen.getByTestId('seek-hud-badge')).toHaveTextContent('+60s');

    // 3rd press FF within window: +120s
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.FAST_FORWARD });
    });
    expect(screen.getByTestId('seek-hud-badge')).toHaveTextContent('+120s');

    // After 1500ms of inactivity, seek HUD hides
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.queryByTestId('seek-hud-badge')).not.toBeInTheDocument();
  });

  it('handles TVKeys.REWIND (412) with progressive backward skips', async () => {
    const onExit = vi.fn();
    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="101"
        apiClient={apiClient}
        onExit={onExit}
      />
    );

    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.REWIND });
    });

    expect(screen.getByTestId('seek-hud-badge')).toBeInTheDocument();
    expect(screen.getByTestId('seek-hud-badge')).toHaveTextContent('-30s');
  });

  it('updates positionMs and UI from driver.onTimeUpdate after 300ms debounce fires', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      if (url.includes('/hls/master.m3u8')) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: 'PLAYBACK_DIRECT_ONLY' }),
        } as unknown as Response;
      }
      return { ok: true, status: 206, headers: new Headers(), json: async () => ({}) } as unknown as Response;
    });

    const onExit = vi.fn();
    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="101"
        apiClient={apiClient}
        onExit={onExit}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Initial position is 30,000ms -> UI shows "0:30"
    expect(screen.getByText('0:30')).toBeInTheDocument();

    // Trigger seek via Right key (+10s) -> UI shows "0:40"
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByText('0:40')).toBeInTheDocument();

    // While debounce is pending, onTimeUpdate should be ignored
    act(() => {
      onTimeUpdateCb?.(32000, 120000);
    });
    expect(screen.getByText('0:40')).toBeInTheDocument();

    // Advance timers by 300ms to fire the debounce timer
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(mockDriver.seekTo).toHaveBeenCalledWith(40000, expect.any(Function));

    // Calling the onComplete callback clears the seek lock
    const onCompleteCb = mockDriver.seekTo.mock.calls[0][1];
    act(() => {
      onCompleteCb?.();
    });

    // Now onTimeUpdate calls properly update positionMs and the UI
    act(() => {
      onTimeUpdateCb?.(45000, 120000);
    });
    expect(screen.getByText('0:45')).toBeInTheDocument();
  });

  it('does not trigger seeking or display seek HUD badge when SubtitleModal is open', async () => {
    const onExit = vi.fn();
    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="101"
        apiClient={apiClient}
        onExit={onExit}
      />
    );

    // Pause player so subtitles button appears
    await act(async () => {
      onStateChangeCb?.('paused');
    });

    // Open SubtitleModal
    await act(async () => {
      fireEvent.click(screen.getByTestId('subtitles-button'));
    });

    // Subtitle modal is open
    expect(screen.getByRole('dialog', { name: 'Subtitles' })).toBeInTheDocument();

    mockDriver.seekTo.mockClear();

    // Press Left and Right keys
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.LEFT });
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
      fireEvent.keyDown(window, { keyCode: TVKeys.FAST_FORWARD });
      fireEvent.keyDown(window, { keyCode: TVKeys.REWIND });
    });

    // No seek HUD badge rendered
    expect(screen.queryByTestId('seek-hud-badge')).not.toBeInTheDocument();

    // Advance timers past debounce
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // seekTo was never invoked
    expect(mockDriver.seekTo).not.toHaveBeenCalled();
  });

  it('reloads HLS stream with start_time on seek and does not overwrite seek position with session resume_position_seconds', async () => {
    const startSessionSpy = vi.spyOn(playbackApi, 'startPlaybackSession').mockResolvedValue({
      session_id: 'sess-hls-1',
      media_item_id: 101,
      duration_seconds: 120,
      resume_position_seconds: 15,
    });

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={101}
        technical={{ video_codec: 'h264', audio_codec: 'dts', container: 'mkv' }}
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    // Flush initial session start (resumes HLS stream at 15,000ms)
    await act(async () => {
      await Promise.resolve();
    });

    // Driver time update 15s into the resumed stream -> effective position is 15,000 + 15,000 = 30,000ms (0:30)
    act(() => {
      onTimeUpdateCb?.(15000, 120000);
    });
    expect(screen.getByText('0:30')).toBeInTheDocument();

    // User presses Right (+10s) -> target is 40,000ms (0:40)
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
    });

    // Advance 300ms debounce timer
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    // Should have re-initialized the HLS driver with start_time=40.000
    expect(mockDriver.init).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.stringContaining('start_time=40.000'),
      0
    );

    // New HLS stream starts at relative 0ms -> effective position is 40,000ms (0:40)
    act(() => {
      onTimeUpdateCb?.(0, 120000);
    });

    // Session should NOT be recreated on HLS seek, and position should remain at 0:40 (not overwritten to 0:15)
    expect(startSessionSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('0:40')).toBeInTheDocument();
    expect(screen.getByTestId('seek-hud-badge')).toBeInTheDocument();

    // After 1500ms total, seek HUD badge must disappear even after HLS reload
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByTestId('seek-hud-badge')).not.toBeInTheDocument();
  });

  it('allows seeking backward to 0:00 in HLS stream even when initialTimeMs > 0', async () => {
    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={101}
        initialTimeMs={15000}
        technical={{ video_codec: 'h264', audio_codec: 'dts', container: 'mkv' }}
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    // Initial HLS stream started at 15s; onTimeUpdate reports relative pos 5000ms -> effectivePos 20,000ms
    act(() => {
      onTimeUpdateCb?.(5000, 120000);
    });
    expect(screen.getByText('0:20')).toBeInTheDocument();

    // Press REWIND (-30s) -> clamps to 0ms (0:00)
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.REWIND });
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Should reload HLS stream from 0 (no start_time=15.000)
    const lastInitUrl = mockDriver.init.mock.calls[mockDriver.init.mock.calls.length - 1][1];
    expect(lastInitUrl).toContain('/hls/master.m3u8');
    expect(lastInitUrl).not.toContain('start_time=');
  });

  it('automatically switches to HLS stream at targetMs if direct play driver reports onSeekFailure', async () => {
    let hlsCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      if (url.includes('/hls/master.m3u8')) {
        hlsCalls += 1;
        if (hlsCalls === 1) {
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
      return { ok: true, status: 206, headers: new Headers(), json: async () => ({}) } as unknown as Response;
    });

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={101}
        technical={{ video_codec: 'h264', audio_codec: 'aac', container: 'mp4' }}
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // After 409 on initial HLS probe, falls back to direct play stream
    expect(mockDriver.init).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.stringContaining('/api/v1/stream/101'),
      0
    );

    // Seek forward +10s from 30s -> 40s
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(mockDriver.seekTo).toHaveBeenCalledWith(40000, expect.any(Function));

    // Simulate direct play seek failure on hardware (e.g., MP4 with moov at end of file)
    await act(async () => {
      onSeekFailureCb?.(40000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Should reload with HLS at start_time=40.000
    const lastInitUrl = mockDriver.init.mock.calls[mockDriver.init.mock.calls.length - 1][1];
    expect(lastInitUrl).toContain('/api/v1/media/101/hls/master.m3u8');
    expect(lastInitUrl).toContain('start_time=40.000');
  });

  it('applies knownDurationMs immediately when fetchMediaItem resolves before driver reports duration', async () => {
    vi.spyOn(itemsApi, 'fetchMediaItem').mockResolvedValue({
      id: 101,
      title: 'Test Movie',
      media_type: 'movie',
      duration_seconds: 1800,
      technical: { video_codec: 'h264', audio_codec: 'aac', container: 'mp4' },
    });

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={101}
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    // Simulate driver initially reporting 0 duration (e.g. before metadata or HLS Infinity->0)
    act(() => {
      onTimeUpdateCb?.(0, 0);
    });

    await act(async () => {
      await Promise.resolve();
    });

    // Duration should immediately show 30:00 (1800s) from fetchMediaItem
    expect(screen.getByText('30:00')).toBeInTheDocument();
  });

  it('proactively terminates previous server HLS transcode session via DELETE when seeking to a new start_time', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      if (url.includes('/hls/master.m3u8')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            '#EXTM3U\n#EXTINF:4.000,\n/api/v1/media/101/hls/sessions/11111111-2222-3333-4444-555555555555/segment_0000.ts\n',
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 204,
        text: async () => '',
      } as unknown as Response;
    });

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={101}
        technical={{ video_codec: 'h264', audio_codec: 'dts', container: 'mkv' }}
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    // Flush probeStream fetch
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Seek forward +10s
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:8492/api/v1/media/101/hls/sessions/11111111-2222-3333-4444-555555555555',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('releases the server transcode session of an HLS probe that was superseded by a seek while in flight', async () => {
    const sessionA = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const sessionB = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee';
    let masterCalls = 0;
    let resolveFirst: ((res: Response) => void) | null = null;

    const playlist = (id: string) =>
      ({
        ok: true,
        status: 200,
        text: async () => `#EXTM3U\n#EXTINF:4.000,\n/api/v1/media/101/hls/sessions/${id}/segment_0000.ts\n`,
      }) as unknown as Response;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      if (url.includes('/hls/master.m3u8')) {
        masterCalls++;
        if (masterCalls === 1) {
          // First probe stays in flight (the server is still starting ffmpeg)
          return new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return playlist(sessionB);
      }
      return { ok: true, status: 204, text: async () => '' } as unknown as Response;
    });

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={101}
        technical={{ video_codec: 'h264', audio_codec: 'dts', container: 'mkv' }}
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(masterCalls).toBe(1);

    // Seek forward while the first probe is still pending -> effect re-runs, probe #2 starts
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(masterCalls).toBe(2);

    // The superseded probe finally answers: its orphaned session must be deleted
    await act(async () => {
      resolveFirst?.(playlist(sessionA));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `http://127.0.0.1:8492/api/v1/media/101/hls/sessions/${sessionA}`,
      expect.objectContaining({ method: 'DELETE' })
    );
    // ...but the current session is not touched
    expect(fetchSpy).not.toHaveBeenCalledWith(
      `http://127.0.0.1:8492/api/v1/media/101/hls/sessions/${sessionB}`,
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('shows the server reason instead of a generic buffering timeout when the HLS transcode request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      if (url.includes('/hls/master.m3u8')) {
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: async () => ({ error: 'Transcoding capacity exceeded' }),
        } as unknown as Response;
      }
      return { ok: true, status: 204, text: async () => '' } as unknown as Response;
    });

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={101}
        technical={{ video_codec: 'h264', audio_codec: 'dts', container: 'mkv' }}
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/Transcoding failed: Transcoding capacity exceeded \(HTTP 503\)/)).toBeInTheDocument();
  });

  it('keeps playing while skips accumulate and applies the seek only once, after the idle delay', async () => {
    const { createPlayerDriver } = await import('../../src/player/driver');
    vi.mocked(createPlayerDriver).mockClear();

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={101}
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });

    const initialDriver = mockDriver;
    expect(createPlayerDriver).toHaveBeenCalledTimes(1);

    // Three quick skips: +10s each, 400ms apart (each shorter than the idle delay)
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
      });
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
    }

    // Still scrubbing: the video was not touched and nothing was paused or reloaded yet
    expect(createPlayerDriver).toHaveBeenCalledTimes(1);
    expect(initialDriver.seekTo).not.toHaveBeenCalled();
    expect(initialDriver.pause).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // One single HLS seek reload to the final landing position (30s + 3 * 10s = 60s)
    expect(createPlayerDriver).toHaveBeenCalledTimes(2);
    expect(mockDriver.init).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.stringContaining('start_time=60.000'),
      0
    );
    expect(initialDriver.pause).not.toHaveBeenCalled();
  });

  it('applies a pending skip immediately when OK is pressed instead of toggling pause', async () => {
    const { createPlayerDriver } = await import('../../src/player/driver');
    vi.mocked(createPlayerDriver).mockClear();

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={101}
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });

    const initialDriver = mockDriver;
    expect(createPlayerDriver).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
    });
    expect(createPlayerDriver).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.ENTER });
    });

    expect(createPlayerDriver).toHaveBeenCalledTimes(2);
    expect(mockDriver.init).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.stringContaining('start_time=40.000'),
      0
    );
    expect(initialDriver.pause).not.toHaveBeenCalled();

    // With no skip pending OK toggles playback again
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.ENTER });
    });
    expect(mockDriver.pause).toHaveBeenCalledTimes(1);
  });

  it('keeps the old HLS stream playing after a seek until the new stream is ready (no black screen)', async () => {
    const drivers: any[] = [];
    const { createPlayerDriver } = await import('../../src/player/driver');
    vi.mocked(createPlayerDriver).mockImplementation((() => {
      const d: any = createMockDriver();
      d.name = 'HTML5 Video';
      d.supportsSeamlessSwap = true;
      d.onSeekFailure = vi.fn();
      d.stateCbs = [] as Array<(s: string) => void>;
      d.onStateChange = vi.fn((cb: (s: string) => void) => {
        d.stateCbs.push(cb);
        // Only the first stream is already playing; replacements are still loading
        if (drivers.length === 1) cb("playing");
      });
      d.onTimeUpdate = vi.fn();
      drivers.push(d);
      return d;
    }) as any);

    const sessions = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'];
    let call = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      if (url.includes('/hls/master.m3u8')) {
        const id = sessions[Math.min(call++, 1)];
        return {
          ok: true,
          status: 200,
          text: async () => `#EXTM3U\n#EXTINF:4.000,\n/api/v1/media/101/hls/sessions/${id}/segment_0000.ts\n`,
        } as unknown as Response;
      }
      return { ok: true, status: 204, text: async () => '' } as unknown as Response;
    });

    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId={101}
        technical={{ video_codec: 'h264', audio_codec: 'dts', container: 'mkv' }}
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(drivers.length).toBe(1);
    const oldDriver = drivers[0];

    // Seek forward: HLS restarts the stream with a new driver
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(drivers.length).toBe(2);

    // New stream is still loading: the old one must keep playing and its session must stay alive
    expect(oldDriver.destroy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(`/hls/sessions/${sessions[0]}`),
      expect.objectContaining({ method: 'DELETE' })
    );

    // New stream starts playing: only now is the old one torn down
    await act(async () => {
      drivers[1].stateCbs.forEach((cb: (s: string) => void) => cb('playing'));
    });
    expect(oldDriver.destroy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(`/hls/sessions/${sessions[0]}`),
      expect.objectContaining({ method: 'DELETE' })
    );

    // Restore the default mock driver for the remaining tests
    vi.mocked(createPlayerDriver).mockImplementation((() => createMockDriver()) as any);
  });

  it('allows navigating Up/Down between progress bar and control buttons (Prev/Next/Subtitles) when playing or paused without Left/Right seeking while on buttons', async () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();

    render(
      <FocusProvider>
        <PlayerScreen
          serverUrl="http://127.0.0.1:8492"
          token="test-token"
          itemId={101}
          title="Episode 2"
          playlist={[
            { id: 100, title: 'Episode 1' },
            { id: 101, title: 'Episode 2' },
            { id: 102, title: 'Episode 3' },
          ]}
          currentIndex={1}
          onPrevious={onPrevious}
          onNext={onNext}
          apiClient={apiClient}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    const progressBar = screen.getByTestId('player-progress-bar');
    const prevBtn = screen.getByTestId('player-osd-previous-btn');
    const nextBtn = screen.getByTestId('player-osd-next-btn');
    const subBtn = screen.getByTestId('subtitles-button');

    // Progress bar is focused initially and controls are displayed underneath
    expect(progressBar).toHaveAttribute('data-focused', 'true');
    expect(prevBtn).toBeInTheDocument();
    expect(nextBtn).toBeInTheDocument();
    expect(subBtn).toBeInTheDocument();

    // Pause video
    act(() => {
      onStateChangeCb?.('paused');
    });

    // While on progress bar, pressing Right seeks +10s (30s -> 40s) and stays on progress bar
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT, key: 'ArrowRight' });
      vi.advanceTimersByTime(1000);
    });
    expect(mockDriver.init).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.stringContaining('start_time=40.000'),
      0
    );
    // Re-hydrated HLS stream starts at relative 0ms -> effective position is 40s (40,000ms)
    act(() => {
      onTimeUpdateCb?.(0, 120000);
      onStateChangeCb?.('paused');
    });
    expect(progressBar).toHaveAttribute('data-focused', 'true');
    expect(prevBtn.className).not.toContain('tv-focus-ring');

    const driverBeforeButtons = mockDriver;
    mockDriver.seekTo.mockClear();

    // Press Down -> moves focus from progress bar to first enabled control button (Prev)
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.DOWN, key: 'ArrowDown' });
    });
    expect(progressBar).toHaveAttribute('data-focused', 'false');
    expect(prevBtn.className).toContain('tv-focus-ring');

    // Press Right -> moves focus from Prev to Next WITHOUT seeking
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT, key: 'ArrowRight' });
      vi.advanceTimersByTime(1000);
    });
    expect(nextBtn.className).toContain('tv-focus-ring');
    expect(prevBtn.className).not.toContain('tv-focus-ring');
    expect(mockDriver).toBe(driverBeforeButtons);
    expect(mockDriver.seekTo).not.toHaveBeenCalled();

    // Press Right -> moves focus from Next to Subtitles WITHOUT seeking
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT, key: 'ArrowRight' });
      vi.advanceTimersByTime(1000);
    });
    expect(subBtn.className).toContain('tv-focus-ring');
    expect(nextBtn.className).not.toContain('tv-focus-ring');
    expect(mockDriver).toBe(driverBeforeButtons);
    expect(mockDriver.seekTo).not.toHaveBeenCalled();

    // Press Left -> moves focus from Subtitles back to Next WITHOUT seeking
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.LEFT, key: 'ArrowLeft' });
      vi.advanceTimersByTime(1000);
    });
    expect(nextBtn.className).toContain('tv-focus-ring');
    expect(subBtn.className).not.toContain('tv-focus-ring');
    expect(mockDriver).toBe(driverBeforeButtons);
    expect(mockDriver.seekTo).not.toHaveBeenCalled();

    // Press Enter while on Next -> invokes onNext once and does not toggle play/pause
    mockDriver.play.mockClear();
    mockDriver.pause.mockClear();
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.ENTER, key: 'Enter' });
    });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(mockDriver.play).not.toHaveBeenCalled();
    expect(mockDriver.pause).not.toHaveBeenCalled();

    // Press Up -> moves focus back up to progress bar
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.UP, key: 'ArrowUp' });
    });
    expect(progressBar).toHaveAttribute('data-focused', 'true');
    expect(nextBtn.className).not.toContain('tv-focus-ring');

    // Now on progress bar, pressing Left seeks backward (-10s: 40s -> 30s)
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.LEFT, key: 'ArrowLeft' });
      vi.advanceTimersByTime(1000);
    });
    expect(mockDriver.init).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.stringContaining('start_time=30.000'),
      0
    );
  });

  describe('Seek Preview Thumbnails (Storyboard Sprites, /frame Fallback & Live Guard)', () => {
    it('renders authenticated sprite crop when seeking on 200 OK storyboard and prefetches next sheet at localIndex >= 80', async () => {
      const clientWithUnlock = new ApiClient('http://127.0.0.1:8492');
      clientWithUnlock.setToken('jwt-trickplay');
      clientWithUnlock.setLibraryUnlockToken('vault-1', 'unlock-pin-1');

      const prefetchedSrcs: string[] = [];
      const OriginalImage = globalThis.Image;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).Image = class MockImage {
        onerror: (() => void) | null = null;
        private _src = '';
        get src() {
          return this._src;
        }
        set src(val: string) {
          this._src = val;
          prefetchedSrcs.push(val);
        }
      };

      try {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
          if (url.includes('/storyboard')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                interval_ms: 5000,
                tile_width: 320,
                tile_height: 180,
                columns: 10,
                rows: 10,
                total_tiles: 150,
                sheets: [
                  { index: 0, url: '/api/v1/media/101/storyboard/0.jpg', first_tile: 0, tile_count: 100 },
                  { index: 1, url: '/api/v1/media/101/storyboard/1.jpg', first_tile: 100, tile_count: 50 },
                ],
              }),
            } as unknown as Response;
          }
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ id: 101, media_type: 'movie', duration_seconds: 750 }),
          } as unknown as Response;
        });

        render(
          <PlayerScreen
            serverUrl="http://127.0.0.1:8492"
            token="jwt-trickplay"
            itemId={101}
            apiClient={clientWithUnlock}
            onExit={vi.fn()}
          />
        );

        // Set duration to 750s and position to 395s (localIndex = 79 -> just below 80 threshold)
        act(() => {
          onTimeUpdateCb?.(395000, 750000);
        });

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        // Seek +10s -> target = 405s -> tileIndex = floor(405000 / 5000) = 81 (row 8, col 1, localIndex 81 >= 80!)
        await act(async () => {
          fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
        });

        const sprite = screen.getByTestId('seek-thumbnail-sprite');
        expect(sprite).toHaveStyle({
          width: '320px',
          height: '180px',
          backgroundImage:
            'url("http://127.0.0.1:8492/api/v1/media/101/storyboard/0.jpg?token=jwt-trickplay&unlocked=unlock-pin-1")',
          backgroundPosition: '-320px -1440px',
          backgroundSize: '3200px 1800px',
        });

        // Sheet 1 must have been prefetched with auth + unlock query params
        expect(prefetchedSrcs).toContain(
          'http://127.0.0.1:8492/api/v1/media/101/storyboard/1.jpg?token=jwt-trickplay&unlocked=unlock-pin-1'
        );
      } finally {
        globalThis.Image = OriginalImage;
      }
    });

    it('uses debounced /frame fallback while storyboard is 202 generating and switches to sprite cropping once 200 OK arrives', async () => {
      let storyboardCalls = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/storyboard')) {
          storyboardCalls += 1;
          if (storyboardCalls === 1) {
            return {
              ok: true,
              status: 202,
              headers: new Headers({ 'Retry-After': '5' }),
              json: async () => ({ status: 'generating' }),
            } as unknown as Response;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              interval_ms: 10000,
              tile_width: 320,
              tile_height: 180,
              columns: 10,
              rows: 10,
              total_tiles: 12,
              sheets: [
                { index: 0, url: '/api/v1/media/101/storyboard/0.jpg', first_tile: 0, tile_count: 12 },
              ],
            }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ id: 101, media_type: 'movie', duration_seconds: 120 }),
        } as unknown as Response;
      });

      render(
        <PlayerScreen
          serverUrl="http://127.0.0.1:8492"
          token="jwt-frame"
          itemId={101}
          apiClient={apiClient}
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(storyboardCalls).toBe(1);

      // Scrub +10s (30s -> 40s): initially shows timestamp pill before 200ms /frame debounce fires
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
      });
      expect(screen.getByTestId('seek-thumbnail-pill')).toHaveTextContent('00:40');
      expect(screen.queryByTestId('seek-thumbnail-frame')).not.toBeInTheDocument();

      // After 200ms debounce, /frame?t=40&w=320&token=jwt-frame renders
      act(() => {
        vi.advanceTimersByTime(220);
      });
      const frameImg = screen.getByTestId('seek-thumbnail-frame') as HTMLImageElement;
      expect(frameImg.src).toBe(
        'http://127.0.0.1:8492/api/v1/media/101/frame?t=40&w=320&token=jwt-frame'
      );

      // Advance 5s so background poll resolves 200 OK
      await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(storyboardCalls).toBe(2);

      // Next scrub immediately uses sprite crop instead of /frame
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
      });
      expect(screen.getByTestId('seek-thumbnail-sprite')).toBeInTheDocument();
      expect(screen.queryByTestId('seek-thumbnail-frame')).not.toBeInTheDocument();
    });

    it('falls back to timestamp pill on 404/503 storyboard and skips storyboard + disables seeking on live_channel', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/storyboard')) {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ id: 101, media_type: 'movie', duration_seconds: 120 }),
        } as unknown as Response;
      });

      const { unmount } = render(
        <PlayerScreen
          serverUrl="http://127.0.0.1:8492"
          token="jwt-tok"
          itemId={101}
          apiClient={apiClient}
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
      });
      expect(screen.getByTestId('seek-thumbnail-pill')).toHaveTextContent('00:40');
      unmount();

      // Now mount a live_channel item -> must skip /storyboard, render LIVE badge, and ignore seek keys
      fetchSpy.mockClear();
      mockDriver.seekTo.mockClear();

      render(
        <PlayerScreen
          serverUrl="http://127.0.0.1:8492"
          token="jwt-tok"
          itemId={999}
          mediaType="live_channel"
          isLive={true}
          apiClient={apiClient}
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByTestId('player-live-badge')).toHaveTextContent('LIVE');

      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
        fireEvent.keyDown(window, { keyCode: TVKeys.FAST_FORWARD });
        vi.advanceTimersByTime(1500);
      });

      expect(mockDriver.seekTo).not.toHaveBeenCalled();
      expect(screen.queryByTestId('seek-hud-badge')).not.toBeInTheDocument();
      const storyboardCallsForLive = fetchSpy.mock.calls.filter((c) =>
        String(c[0]).includes('/storyboard')
      );
      expect(storyboardCallsForLive).toHaveLength(0);
    });

    it('drops stale pre-seek onTimeUpdate when scrubbing forward then fine-tuning backward before seek completes', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : input?.url || String(input);
        if (url.includes('/hls/master.m3u8')) {
          return {
            ok: false,
            status: 409,
            json: async () => ({ error: 'PLAYBACK_DIRECT_ONLY' }),
          } as unknown as Response;
        }
        return { ok: true, status: 206, headers: new Headers(), json: async () => ({}) } as unknown as Response;
      });

      render(
        <PlayerScreen
          serverUrl="http://127.0.0.1:8492"
          token="jwt-tok"
          itemId={101}
          initialTimeMs={0}
          apiClient={apiClient}
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      // Stream starts at 30s (from createMockDriver)
      expect(screen.getByText('0:30')).toBeInTheDocument();

      // Scrub forward twice with FF (+30s, +60s -> 120s), wait wait: duration is 120s so +30s +30s:
      // Let's report 30s / 600s duration first so we can scrub to 110s then step back -10s to 100s
      act(() => {
        onTimeUpdateCb?.(30000, 600000);
      });

      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.FAST_FORWARD }); // +30s -> 60s
        fireEvent.keyDown(window, { keyCode: TVKeys.FAST_FORWARD }); // +60s -> 120s
        fireEvent.keyDown(window, { keyCode: TVKeys.LEFT }); // -10s -> 110s (1:50)
      });

      expect(screen.getByText('1:50')).toBeInTheDocument();

      // Commit the seek after debounce
      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(mockDriver.seekTo).toHaveBeenCalledWith(110000, expect.any(Function));

      // Before driver finishes seeking to 110s, a stale pre-seek update at 30.5s arrives:
      // even though the last key pressed was LEFT ('backward'), 30.5s must be dropped as stale!
      act(() => {
        onTimeUpdateCb?.(30500, 600000);
      });
      expect(screen.getByText('1:50')).toBeInTheDocument();

      // Subsequent Right press (+10s) must step from 1:50 -> 2:00 (120s), NOT from 0:30 -> 0:40!
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
      });
      expect(screen.getByText('2:00')).toBeInTheDocument();
    });

    it('overrides partial HLS EVENT playlist duration with authoritative item duration so seeks are not clamped', async () => {
      let resolveDetail!: (detail: itemsApi.MediaItemDetail) => void;
      vi.spyOn(itemsApi, 'fetchMediaItem').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveDetail = resolve;
          })
      );

      render(
        <PlayerScreen
          serverUrl="http://127.0.0.1:8492"
          token="jwt-tok"
          itemId={101}
          initialTimeMs={0}
          technical={{ container: 'mkv', video_codec: 'h264', audio_codec: 'dts' }}
          apiClient={apiClient}
          onExit={vi.fn()}
        />
      );

      // Simulate AVPlay initially reporting only 12s of remuxed HLS EVENT segments
      act(() => {
        onTimeUpdateCb?.(1000, 12000);
      });

      // Now fetchMediaItem resolves authoritative 1-hour duration (3600s)
      await act(async () => {
        resolveDetail({
          id: 101,
          title: 'MKV Movie',
          duration_seconds: 3600,
          technical: {
            container: 'mkv',
            video_codec: 'h264',
            audio_codec: 'dts',
            duration_seconds: 3600,
          },
        });
        await Promise.resolve();
      });

      // Seeking forward +30s must land at 0:31 (31000ms), NOT clamped to 12000ms
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.FAST_FORWARD });
      });
      expect(screen.getByText('0:31')).toBeInTheDocument();
    });
  });
});
