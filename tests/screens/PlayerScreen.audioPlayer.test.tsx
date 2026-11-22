import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen, fireEvent, cleanup } from '@testing-library/react';
import { PlayerScreen, type PlaylistItem } from '../../src/screens/PlayerScreen';
import { ApiClient } from '../../src/api/client';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { TVKeys } from '../../src/navigation/keys';
import { AUDIOBOOK_SPEED_STORAGE_KEY } from '../../src/player/audioPreferences';
import * as itemsApi from '../../src/api/items';
import * as subtitlesApi from '../../src/api/subtitles';
import * as audioApi from '../../src/api/audio';
import * as playbackApi from '../../src/api/playback';
import * as tizenLifecycle from '../../src/utils/tizenLifecycle';

function createMockAvplay() {
  return {
    open: vi.fn(),
    close: vi.fn(),
    stop: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    prepareAsync: vi.fn(),
    getState: vi.fn(() => 'NONE'),
    getDuration: vi.fn(() => 0),
    getCurrentTime: vi.fn(() => 0),
    getCurrentStreamInfo: vi.fn(() => []),
    getTotalTrackInfo: vi.fn(() => []),
    setSelectTrack: vi.fn(),
    setDisplayRect: vi.fn(),
    setDisplayMethod: vi.fn(),
    setDisplayRotation: vi.fn(),
    setSilentSubtitle: vi.fn(),
    setListener: vi.fn(),
  };
}

describe('PlayerScreen Audio Mode, 60s Ambient Auto-Dim & Queue Completion', () => {
  let mockAvplay: ReturnType<typeof createMockAvplay>;
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  let screenSaverSpy: ReturnType<typeof vi.spyOn>;
  const serverUrl = 'http://127.0.0.1:8492';
  const token = 'test-token';

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    tizenLifecycle.resetScreenSaverStateForTests();
    mockAvplay = createMockAvplay();
    // Keep Samsung AVPlay present to verify audio mode bypasses AVPlay and uses Html5PlayerDriver
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webapis = { avplay: mockAvplay };

    playSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event('playing'));
        return Promise.resolve();
      });
    pauseSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event('pause'));
      });

    screenSaverSpy = vi.spyOn(tizenLifecycle, 'setTvScreenSaver');

    vi.spyOn(playbackApi, 'reportPlaybackProgress').mockResolvedValue(undefined);
    vi.spyOn(playbackApi, 'startPlaybackSession').mockResolvedValue({
      session_id: 'sess-audio-player',
      media_item_id: 201,
      duration_seconds: 5400,
      resume_position_seconds: 0,
    });
    vi.spyOn(playbackApi, 'reportSessionProgress').mockResolvedValue(undefined);
    vi.spyOn(playbackApi, 'endPlaybackSession').mockResolvedValue(undefined);
    vi.spyOn(subtitlesApi, 'fetchItemSubtitles').mockResolvedValue([]);
    vi.spyOn(audioApi, 'fetchItemAudioTracks').mockResolvedValue([]);

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

  async function flushMicrotasks(rounds = 8) {
    for (let i = 0; i < rounds; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  it('launches audiobook in Html5PlayerDriver + Direct Stream without HLS preflight, renders AudioPlayerOverlay, and persists playbackRate cycling', async () => {
    localStorage.setItem(AUDIOBOOK_SPEED_STORAGE_KEY, '1.25');
    const client = new ApiClient(serverUrl);
    client.setToken(token);
    client.setLibraryUnlockToken('lib-books', 'unlock-book-1');

    vi.spyOn(itemsApi, 'fetchMediaItem').mockResolvedValue({
      id: 201,
      title: 'Project Hail Mary',
      media_type: 'audiobook',
      poster_url: '/api/v1/artwork/201/poster',
      overview: 'A lone astronaut wakes up aboard the Hail Mary.',
      release_year: 2021,
      duration_seconds: 5400,
      technical: {
        audio_codec: 'aac',
        container: 'm4b',
        duration_seconds: 5400,
      },
      card: {
        id: 201,
        title: 'Project Hail Mary',
        subtitle: 'Andy Weir',
        media_type: 'audiobook',
      },
    });

    const { container, unmount } = render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={201}
          title="Project Hail Mary"
          mediaType="audiobook"
          technical={{ audio_codec: 'aac', container: 'm4b', duration_seconds: 5400 }}
          serverUrl={serverUrl}
          token={token}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushMicrotasks();

    // Never opens AVPlay or probes /hls/master.m3u8 for compatible .m4b Direct Play
    expect(mockAvplay.open).not.toHaveBeenCalled();
    const probedUrls = fetchSpy.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(probedUrls.some((u: string) => u.includes('/hls/master.m3u8'))).toBe(false);
    expect(probedUrls).toContain(
      'http://127.0.0.1:8492/api/v1/stream/201?token=test-token&unlocked=unlock-book-1'
    );

    // Renders AudioPlayerOverlay instead of video PlayerOSD
    expect(screen.getByTestId('audio-player-overlay')).toBeInTheDocument();
    expect(screen.queryByTestId('player-osd-title')).not.toBeInTheDocument();
    expect(screen.getByTestId('audio-title')).toHaveTextContent('Project Hail Mary');
    expect(screen.getByTestId('audio-subtitle')).toHaveTextContent('Andy Weir');
    expect(screen.getByText('AUDIOBOOK')).toBeInTheDocument();
    expect(screen.getAllByText('DIRECT • AAC').length).toBeGreaterThan(0);

    const coverImg = screen.getByTestId('audio-cover-image') as HTMLImageElement;
    expect(coverImg.getAttribute('src')).toBe(
      'http://127.0.0.1:8492/api/v1/artwork/201/poster?token=test-token&unlocked=unlock-book-1'
    );

    // Restores saved kadr_audiobook_speed_v1 onto HTMLMediaElement.playbackRate
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.playbackRate).toBe(1.25);
    expect(screen.getByTestId('audio-btn-speed')).toHaveTextContent('1.25x');

    // Cycling audio-btn-speed updates video.playbackRate and localStorage
    fireEvent.click(screen.getByTestId('audio-btn-speed'));
    expect(screen.getByTestId('audio-btn-speed')).toHaveTextContent('1.5x');
    expect(video.playbackRate).toBe(1.5);
    expect(localStorage.getItem(AUDIOBOOK_SPEED_STORAGE_KEY)).toBe('1.5');

    unmount();

    // Music item keeps 1x playbackRate and Direct Plays FLAC without HLS preflight
    const musicClient = new ApiClient(serverUrl);
    musicClient.setToken(token);
    vi.mocked(itemsApi.fetchMediaItem).mockResolvedValueOnce({
      id: 205,
      title: 'Time',
      media_type: 'music',
      technical: { audio_codec: 'flac', container: 'flac', duration_seconds: 413 },
    });
    fetchSpy.mockClear();

    const { container: musicContainer } = render(
      <FocusProvider>
        <PlayerScreen
          client={musicClient}
          itemId={205}
          title="Time"
          mediaType="music"
          technical={{ audio_codec: 'flac', container: 'flac', duration_seconds: 413 }}
          serverUrl={serverUrl}
          token={token}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushMicrotasks();
    const musicUrls = fetchSpy.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(musicUrls.some((u: string) => u.includes('/hls/master.m3u8'))).toBe(false);
    expect(musicUrls).toContain('http://127.0.0.1:8492/api/v1/stream/205?token=test-token');
    expect(screen.getByText('MUSIC')).toBeInTheDocument();
    expect(screen.getAllByText('DIRECT • FLAC').length).toBeGreaterThan(0);
    expect(screen.getByTestId('audio-btn-repeat')).toHaveTextContent('Repeat: Off');
    expect((musicContainer.querySelector('video') as HTMLVideoElement).playbackRate).toBe(1);
  });

  it('routes unsupported audio codec (wma) to audio-only HLS without max_height, and switches off AVPlay if mediaType arrives via fetchMediaItem', async () => {
    const client = new ApiClient(serverUrl);
    vi.spyOn(itemsApi, 'fetchMediaItem').mockResolvedValue({
      id: 202,
      title: 'Legacy WMA Track',
      media_type: 'music',
      technical: { audio_codec: 'wmav2', container: 'wma', duration_seconds: 210 },
    });

    const { unmount } = render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={202}
          title="Legacy WMA Track"
          mediaType="music"
          technical={{ audio_codec: 'wmav2', container: 'wma', duration_seconds: 210 }}
          serverUrl={serverUrl}
          token={token}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushMicrotasks();

    expect(mockAvplay.open).not.toHaveBeenCalled();
    const hlsUrl = fetchSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .find((u: string) => u.includes('/hls/master.m3u8'));
    expect(hlsUrl).toBeDefined();
    const parsed = new URL(hlsUrl!);
    expect(parsed.pathname).toBe('/api/v1/media/202/hls/master.m3u8');
    expect(parsed.searchParams.get('video_codec')).toBe('none');
    expect(parsed.searchParams.get('audio_codec')).toBe('aac');
    expect(parsed.searchParams.has('max_height')).toBe(false);
    expect(screen.getAllByText('HLS • AAC').length).toBeGreaterThan(0);

    unmount();

    // Late discovery: mediaType prop initially undefined, fetchMediaItem resolves audiobook (.m4b)
    fetchSpy.mockClear();
    mockAvplay.open.mockClear();
    vi.spyOn(itemsApi, 'fetchMediaItem').mockResolvedValueOnce({
      id: 203,
      title: 'Late Discovered Audiobook',
      media_type: 'audiobook',
      technical: { audio_codec: 'aac', container: 'm4b', duration_seconds: 3600 },
    });

    const { container: lateContainer } = render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={203}
          title="Late Discovered Audiobook"
          serverUrl={serverUrl}
          token={token}
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await flushMicrotasks();

    expect(screen.getByTestId('audio-player-overlay')).toBeInTheDocument();
    expect(lateContainer.querySelector('video')).not.toBeNull();
    expect(mockAvplay.stop).toHaveBeenCalled();
    expect(mockAvplay.close).toHaveBeenCalled();
    const lateUrls = fetchSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(lateUrls).toContain('http://127.0.0.1:8492/api/v1/stream/203?token=test-token');
  });

  it('advances immediately with 0s gap on track completion, loops on repeat=one, and wraps to index 0 on repeat=all', async () => {
    const client = new ApiClient(serverUrl);
    const playlist: PlaylistItem[] = [
      { id: 301, title: 'Track One', mediaType: 'music', durationSeconds: 180 },
      { id: 302, title: 'Track Two', mediaType: 'music', durationSeconds: 200 },
    ];
    vi.spyOn(itemsApi, 'fetchMediaItem').mockResolvedValue({
      id: 301,
      title: 'Track One',
      media_type: 'music',
      technical: { audio_codec: 'flac', container: 'flac', duration_seconds: 180 },
    });

    const onNext = vi.fn();
    const onSelectQueueIndex = vi.fn();
    const onEpisodeProgress = vi.fn();

    const { container, rerender } = render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={301}
          title="Track One"
          mediaType="music"
          technical={{ audio_codec: 'flac', container: 'flac', duration_seconds: 180 }}
          playlist={playlist}
          currentIndex={0}
          onNext={onNext}
          onSelectQueueIndex={onSelectQueueIndex}
          onEpisodeProgress={onEpisodeProgress}
          onExit={vi.fn()}
          serverUrl={serverUrl}
          token={token}
        />
      </FocusProvider>
    );

    await flushMicrotasks();
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).not.toBeNull();

    // Ended on Track 1 -> immediate onNext(), zero auto-advance-overlay countdown
    act(() => {
      video.dispatchEvent(new Event('ended'));
    });

    expect(screen.queryByTestId('auto-advance-overlay')).not.toBeInTheDocument();
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onEpisodeProgress).toHaveBeenCalledTimes(1);

    // Repeat One: cycle Repeat: Off -> All -> One, and resume playing before next ended event
    act(() => {
      video.dispatchEvent(new Event('playing'));
    });
    fireEvent.click(screen.getByTestId('audio-btn-repeat'));
    expect(screen.getByTestId('audio-btn-repeat')).toHaveTextContent('Repeat: All');
    fireEvent.click(screen.getByTestId('audio-btn-repeat'));
    expect(screen.getByTestId('audio-btn-repeat')).toHaveTextContent('Repeat: One');

    onNext.mockClear();
    playSpy.mockClear();
    video.currentTime = 145;

    act(() => {
      video.dispatchEvent(new Event('ended'));
    });

    expect(onNext).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(0);
    expect(playSpy).toHaveBeenCalled();

    // Repeat All on final track -> wraps to index 0 via onSelectQueueIndex(0)
    fireEvent.click(screen.getByTestId('audio-btn-repeat')); // One -> Off
    fireEvent.click(screen.getByTestId('audio-btn-repeat')); // Off -> All
    expect(screen.getByTestId('audio-btn-repeat')).toHaveTextContent('Repeat: All');

    vi.mocked(itemsApi.fetchMediaItem).mockResolvedValueOnce({
      id: 302,
      title: 'Track Two',
      media_type: 'music',
      technical: { audio_codec: 'flac', container: 'flac', duration_seconds: 200 },
    });

    rerender(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={302}
          title="Track Two"
          mediaType="music"
          technical={{ audio_codec: 'flac', container: 'flac', duration_seconds: 200 }}
          playlist={playlist}
          currentIndex={1}
          onNext={onNext}
          onSelectQueueIndex={onSelectQueueIndex}
          onEpisodeProgress={onEpisodeProgress}
          onExit={vi.fn()}
          serverUrl={serverUrl}
          token={token}
        />
      </FocusProvider>
    );

    await flushMicrotasks();
    const finalVideo = container.querySelector('video') as HTMLVideoElement;
    act(() => {
      finalVideo.dispatchEvent(new Event('ended'));
    });

    expect(onSelectQueueIndex).toHaveBeenCalledWith(0);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('dims into Ambient Mode after 60_000ms idle while keeping screensaver disabled, consumes wake keys without seeking/exiting, and executes PLAY_PAUSE while waking', async () => {
    const client = new ApiClient(serverUrl);
    vi.spyOn(itemsApi, 'fetchMediaItem').mockResolvedValue({
      id: 401,
      title: 'Dune Audiobook',
      media_type: 'audiobook',
      technical: { audio_codec: 'aac', container: 'm4b', duration_seconds: 7200 },
    });

    const onExit = vi.fn();

    const { container } = render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={401}
          title="Dune Audiobook"
          mediaType="audiobook"
          technical={{ audio_codec: 'aac', container: 'm4b', duration_seconds: 7200 }}
          serverUrl={serverUrl}
          token={token}
          onExit={onExit}
        />
      </FocusProvider>
    );

    await flushMicrotasks();

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).not.toBeNull();
    video.currentTime = 120;
    act(() => {
      video.dispatchEvent(new Event('timeupdate'));
    });

    expect(screenSaverSpy).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('audio-player-stage')).toHaveAttribute(
      'data-ambient-dimmed',
      'false'
    );

    // 59_999ms: still awake
    act(() => {
      vi.advanceTimersByTime(59_999);
    });
    expect(screen.getByTestId('audio-player-stage')).toHaveAttribute(
      'data-ambient-dimmed',
      'false'
    );
    expect(screen.queryByTestId('audio-ambient-badge')).not.toBeInTheDocument();

    // +1ms (60_000ms total): dims to ambient mode while keeping setTvScreenSaver(true)
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId('audio-player-stage')).toHaveAttribute(
      'data-ambient-dimmed',
      'true'
    );
    expect(screen.getByTestId('audio-ambient-badge')).toBeInTheDocument();
    expect(screenSaverSpy).toHaveBeenLastCalledWith(true);

    // ArrowRight while dimmed wakes without seeking
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('audio-player-stage')).toHaveAttribute(
      'data-ambient-dimmed',
      'false'
    );
    expect(screen.getByTestId('audio-time-elapsed')).toHaveTextContent('2:00');
    expect(onExit).not.toHaveBeenCalled();

    // Idle another 60_000ms -> dims again
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('audio-player-stage')).toHaveAttribute(
      'data-ambient-dimmed',
      'true'
    );

    // Back while dimmed wakes WITHOUT calling onExit
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape', keyCode: TVKeys.BACK_TIZEN });
    });
    expect(screen.getByTestId('audio-player-stage')).toHaveAttribute(
      'data-ambient-dimmed',
      'false'
    );
    expect(onExit).not.toHaveBeenCalled();

    // Idle 60_000ms -> dims a third time -> TVKeys.PLAY_PAUSE pauses AND wakes immediately
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('audio-player-stage')).toHaveAttribute(
      'data-ambient-dimmed',
      'true'
    );

    pauseSpy.mockClear();
    act(() => {
      fireEvent.keyDown(window, { key: 'MediaPlayPause', keyCode: TVKeys.PLAY_PAUSE });
    });
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('audio-player-stage')).toHaveAttribute(
      'data-ambient-dimmed',
      'false'
    );
    expect(screen.getByText('Paused')).toBeInTheDocument();

    // Pressing Back while awake flushes progress and calls onExit
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape', keyCode: TVKeys.BACK_TIZEN });
    });
    expect(onExit).toHaveBeenCalledTimes(1);
    const exitSnap = onExit.mock.calls[0][0];
    expect(exitSnap).toEqual(
      expect.objectContaining({
        itemId: 401,
        positionMs: 120000,
      })
    );
    await act(async () => {
      await exitSnap.flushPromise;
    });
    expect(playbackApi.reportSessionProgress).toHaveBeenCalledWith(
      client,
      'sess-audio-player',
      120
    );
    expect(playbackApi.endPlaybackSession).toHaveBeenCalledWith(client, 'sess-audio-player');
  });
});
