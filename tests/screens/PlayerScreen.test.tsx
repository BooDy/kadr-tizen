import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import * as playbackApi from '../../src/api/playback';
import * as subtitlesApi from '../../src/api/subtitles';
import { TVKeys } from '../../src/navigation/keys';
import { PlayerDriver, PlayerState } from '../../src/player/driver';
import { ApiClient } from '../../src/api/client';
import { FocusProvider } from '../../src/navigation/FocusContext';

// Mock driver instance
let mockDriver: {
  init: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  seekTo: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  setSubtitleTrack: ReturnType<typeof vi.fn>;
  onTimeUpdate: ReturnType<typeof vi.fn>;
  onStateChange: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  timeCallback?: (posMs: number, durationMs: number) => void;
  stateCallback?: (state: PlayerState) => void;
  errorCallback?: (error: string) => void;
};

vi.mock('../../src/player/avplay-driver', () => ({
  createPlayerDriver: () => {
    mockDriver = {
      init: vi.fn().mockImplementation(async () => {}),
      play: vi.fn(),
      pause: vi.fn(),
      seekTo: vi.fn(),
      destroy: vi.fn(),
      setSubtitleTrack: vi.fn(),
      onTimeUpdate: vi.fn((cb) => {
        mockDriver.timeCallback = cb;
      }),
      onStateChange: vi.fn((cb) => {
        mockDriver.stateCallback = cb;
      }),
      onError: vi.fn((cb) => {
        mockDriver.errorCallback = cb;
      }),
    };
    return mockDriver as unknown as PlayerDriver;
  },
}));

describe('PlayerScreen', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reportPlaybackSpy: any;

  beforeEach(() => {
    vi.useFakeTimers();
    reportPlaybackSpy = vi.spyOn(playbackApi, 'reportPlaybackProgress').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initializes driver with container and stream url on mount', () => {
    const onExit = vi.fn();
    const { getByText } = render(
      <PlayerScreen
        itemId="item-123"
        title="Sample Movie"
        serverUrl="http://localhost:8492"
        token="test-token"
        initialTimeMs={15000}
        onExit={onExit}
      />
    );

    expect(mockDriver.init).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'http://localhost:8492/api/v1/stream/item-123?token=test-token',
      15000
    );
    expect(getByText('Sample Movie')).toBeInTheDocument();
  });

  it('initializes driver with unlocked token query param when private library token exists on client', () => {
    const onExit = vi.fn();
    const client = new ApiClient('http://localhost:8492');
    client.setToken('test-token');
    client.setLibraryUnlockToken('vault-1', 'secret-unlock-xyz');

    render(
      <PlayerScreen
        client={client}
        itemId="item-456"
        title="Secret Video"
        serverUrl="http://localhost:8492"
        token="test-token"
        onExit={onExit}
      />
    );

    expect(mockDriver.init).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'http://localhost:8492/api/v1/stream/item-456?token=test-token&unlocked=secret-unlock-xyz',
      0
    );
  });

  it('handles driver onError callback by updating playerState to error', () => {
    const { getByText, getAllByText } = render(
      <PlayerScreen
        itemId="item-123"
        title="Sample Movie"
        serverUrl="http://localhost:8492"
        token="test-token"
        onExit={vi.fn()}
      />
    );

    act(() => {
      mockDriver.errorCallback?.('Connection timed out');
    });

    expect(getAllByText(/error/i).length).toBeGreaterThan(0);
    expect(getByText('Playback Error')).toBeInTheDocument();
    expect(getByText(/Connection timed out/)).toBeInTheDocument();
  });

  it('updates timecodes and progress bar when time updates', () => {
    const { getByText } = render(
      <PlayerScreen
        itemId="item-123"
        title="Sample Movie"
        serverUrl="http://localhost:8492"
        token="test-token"
        onExit={vi.fn()}
      />
    );

    act(() => {
      mockDriver.timeCallback?.(75000, 150000); // 1:15 / 2:30
    });

    expect(getByText('1:15')).toBeInTheDocument();
    expect(getByText('2:30')).toBeInTheDocument();
  });

  it('auto-hides OSD after 4 seconds when playing and reappears on keydown', () => {
    const { queryByText } = render(
      <PlayerScreen
        itemId="item-123"
        title="Sample Movie"
        serverUrl="http://localhost:8492"
        token="test-token"
        onExit={vi.fn()}
      />
    );

    // Initial state is buffering, OSD is shown
    expect(queryByText('Sample Movie')).toBeInTheDocument();

    // Transition to playing
    act(() => {
      mockDriver.stateCallback?.('playing');
    });

    // Advance 4 seconds
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    // OSD should be hidden
    expect(queryByText('Sample Movie')).not.toBeInTheDocument();

    // Press any key to reveal OSD
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.RIGHT }));
    });

    expect(queryByText('Sample Movie')).toBeInTheDocument();
  });

  it('does not auto-hide OSD when paused or buffering', () => {
    const { queryByText } = render(
      <PlayerScreen
        itemId="item-123"
        title="Sample Movie"
        serverUrl="http://localhost:8492"
        token="test-token"
        onExit={vi.fn()}
      />
    );

    act(() => {
      mockDriver.stateCallback?.('paused');
      vi.advanceTimersByTime(5000);
    });

    expect(queryByText('Sample Movie')).toBeInTheDocument();
  });

  it('handles remote controls for Enter and Play/Pause', () => {
    render(
      <PlayerScreen
        itemId="item-123"
        title="Sample Movie"
        serverUrl="http://localhost:8492"
        token="test-token"
        onExit={vi.fn()}
      />
    );

    // Set state to playing
    act(() => {
      mockDriver.stateCallback?.('playing');
    });

    // Press Enter to pause
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.ENTER }));
    });
    expect(mockDriver.pause).toHaveBeenCalled();

    // Set state to paused
    act(() => {
      mockDriver.stateCallback?.('paused');
    });

    // Press PLAY_PAUSE to resume play
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.PLAY_PAUSE }));
    });
    expect(mockDriver.play).toHaveBeenCalled();
  });

  it('handles remote controls for Left and Right seek', () => {
    render(
      <PlayerScreen
        itemId="item-123"
        title="Sample Movie"
        serverUrl="http://localhost:8492"
        token="test-token"
        onExit={vi.fn()}
      />
    );

    act(() => {
      mockDriver.timeCallback?.(25000, 100000);
    });

    // Press Left (-10s)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.LEFT }));
      vi.advanceTimersByTime(300);
    });
    expect(mockDriver.seekTo).toHaveBeenCalledWith(15000, expect.any(Function));

    // Press Right (+10s)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.RIGHT }));
      vi.advanceTimersByTime(300);
    });
    expect(mockDriver.seekTo).toHaveBeenCalledWith(25000, expect.any(Function)); // 15000 + 10000
  });

  it('prevents seeking below 0 and clamps seeking to durationMs', () => {
    const { getByText, getAllByText } = render(
      <PlayerScreen
        itemId="item-123"
        title="Sample Movie"
        serverUrl="http://localhost:8492"
        token="test-token"
        onExit={vi.fn()}
      />
    );

    act(() => {
      mockDriver.timeCallback?.(4000, 20000);
    });

    // Press Left with pos 4s -> should seek to 0, not -6s
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.LEFT }));
      vi.advanceTimersByTime(300);
    });
    expect(mockDriver.seekTo).toHaveBeenCalledWith(0, expect.any(Function));
    expect(getByText('0:00')).toBeInTheDocument();

    // Press Right repeatedly past duration (20s) -> should clamp to 20000
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.RIGHT })); // to 10s
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.RIGHT })); // to 20s
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.RIGHT })); // clamped at 20s
      vi.advanceTimersByTime(300);
    });
    expect(mockDriver.seekTo).toHaveBeenLastCalledWith(20000, expect.any(Function));
    expect(getAllByText('0:20')).toHaveLength(2);
  });

  it('handles remote Back button, calls preventDefault, and triggers onExit', () => {
    const onExit = vi.fn();
    render(
      <PlayerScreen
        itemId="item-123"
        title="Sample Movie"
        serverUrl="http://localhost:8492"
        token="test-token"
        onExit={onExit}
      />
    );

    const eventTizen = new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_TIZEN, cancelable: true });
    const preventDefaultSpy1 = vi.spyOn(eventTizen, 'preventDefault');
    act(() => {
      window.dispatchEvent(eventTizen);
    });
    expect(preventDefaultSpy1).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledTimes(1);

    const eventWeb = new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_WEB, cancelable: true });
    const preventDefaultSpy2 = vi.spyOn(eventWeb, 'preventDefault');
    act(() => {
      window.dispatchEvent(eventWeb);
    });
    expect(preventDefaultSpy2).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it('uses transparent backgrounds to avoid occluding hardware video plane', () => {
    const { container } = render(
      <PlayerScreen
        itemId="item-123"
        title="Sample Movie"
        serverUrl="http://localhost:8492"
        token="test-token"
        onExit={vi.fn()}
      />
    );

    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveClass('bg-transparent');
    expect(rootElement).not.toHaveClass('bg-black');
  });

  it('sends periodic scrobble heartbeat every 10 seconds', () => {
    render(
      <PlayerScreen
        itemId="item-123"
        title="Sample Movie"
        serverUrl="http://localhost:8492"
        token="test-token"
        onExit={vi.fn()}
      />
    );

    act(() => {
      mockDriver.timeCallback?.(20000, 100000);
    });

    // Advance 10 seconds
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(reportPlaybackSpy).toHaveBeenCalledWith(
      'http://localhost:8492',
      'test-token',
      'item-123',
      20000,
      false
    );

    // Advance another 10 seconds
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(reportPlaybackSpy).toHaveBeenCalledTimes(2);
  });

  it('sends final scrobble sync on unmount and destroys driver', () => {
    const { unmount } = render(
      <PlayerScreen
        itemId="item-123"
        title="Sample Movie"
        serverUrl="http://localhost:8492"
        token="test-token"
        onExit={vi.fn()}
      />
    );

    act(() => {
      mockDriver.timeCallback?.(50000, 100000);
    });

    reportPlaybackSpy.mockClear();

    unmount();

    expect(reportPlaybackSpy).toHaveBeenCalledWith(
      'http://localhost:8492',
      'test-token',
      'item-123',
      50000,
      true
    );
    expect(mockDriver.destroy).toHaveBeenCalled();
  });

  describe('Canonical Playback Session Manager Integration', () => {
    it('starts canonical session on mount with numeric itemId and seeks to resume position', async () => {
      const startSessionSpy = vi.spyOn(playbackApi, 'startPlaybackSession').mockResolvedValue({
        session_id: 'sess-abc',
        media_item_id: 101,
        duration_seconds: 3600,
        resume_position_seconds: 45,
      });

      render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={vi.fn()}
        />
      );

      // Flush microtasks
      await act(async () => {
        await Promise.resolve();
      });

      expect(startSessionSpy).toHaveBeenCalledWith(expect.anything(), 101);
      expect(mockDriver.seekTo).toHaveBeenCalledWith(45000);
    });

    it('does not seek to session resume position if manual initialTimeMs was forced', async () => {
      vi.spyOn(playbackApi, 'startPlaybackSession').mockResolvedValue({
        session_id: 'sess-abc',
        media_item_id: 101,
        duration_seconds: 3600,
        resume_position_seconds: 45,
      });

      render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          initialTimeMs={12000}
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      // driver.init is called with initialTimeMs (12000), but seekTo should NOT be called with 45000
      expect(mockDriver.seekTo).not.toHaveBeenCalledWith(45000);
    });

    it('sends 10-second heartbeats to reportSessionProgress during active session', async () => {
      vi.spyOn(playbackApi, 'startPlaybackSession').mockResolvedValue({
        session_id: 'sess-abc',
        media_item_id: 101,
        duration_seconds: 3600,
        resume_position_seconds: 0,
      });
      const progressSpy = vi.spyOn(playbackApi, 'reportSessionProgress').mockResolvedValue();

      render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        mockDriver.timeCallback?.(32000, 100000);
      });

      // Advance 10s
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(progressSpy).toHaveBeenCalledWith(expect.anything(), 'sess-abc', 32);
      // Fallback reportPlaybackProgress should not be called when session is active
      expect(reportPlaybackSpy).not.toHaveBeenCalled();
    });

    it('cleans up session via endPlaybackSession on unmount', async () => {
      vi.spyOn(playbackApi, 'startPlaybackSession').mockResolvedValue({
        session_id: 'sess-abc',
        media_item_id: 101,
        duration_seconds: 3600,
        resume_position_seconds: 0,
      });
      const endSpy = vi.spyOn(playbackApi, 'endPlaybackSession').mockResolvedValue();

      const { unmount } = render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      unmount();

      expect(endSpy).toHaveBeenCalledWith(expect.anything(), 'sess-abc');
      expect(mockDriver.destroy).toHaveBeenCalled();
    });

    it('cleans up session via endPlaybackSession on exit keydown', async () => {
      vi.spyOn(playbackApi, 'startPlaybackSession').mockResolvedValue({
        session_id: 'sess-abc',
        media_item_id: 101,
        duration_seconds: 3600,
        resume_position_seconds: 0,
      });
      const endSpy = vi.spyOn(playbackApi, 'endPlaybackSession').mockResolvedValue();
      const onExit = vi.fn();

      render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={onExit}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_TIZEN }));
      });

      expect(onExit).toHaveBeenCalledTimes(1);
      expect(endSpy).toHaveBeenCalledWith(expect.anything(), 'sess-abc');
    });

    it('reports final progress before ending playback session on exit keydown', async () => {
      vi.spyOn(playbackApi, 'startPlaybackSession').mockResolvedValue({
        session_id: 'sess-abc',
        media_item_id: 101,
        duration_seconds: 3600,
        resume_position_seconds: 0,
      });
      const progressSpy = vi.spyOn(playbackApi, 'reportSessionProgress').mockResolvedValue();
      const endSpy = vi.spyOn(playbackApi, 'endPlaybackSession').mockResolvedValue();
      const callOrder: string[] = [];
      progressSpy.mockImplementation(async () => {
        callOrder.push('progress');
      });
      endSpy.mockImplementation(async () => {
        callOrder.push('end');
      });

      render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        mockDriver.timeCallback?.(35000, 100000);
      });

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_TIZEN }));
      });

      expect(progressSpy).toHaveBeenCalledWith(expect.anything(), 'sess-abc', 35);
      expect(endSpy).toHaveBeenCalledWith(expect.anything(), 'sess-abc');
      expect(callOrder).toEqual(['progress', 'end']);
    });

    it('cancels in-flight session and avoids seek/updates if unmounted before start resolves', async () => {
      let resolveStart!: (value: any) => void;
      const startPromise = new Promise((resolve) => {
        resolveStart = resolve;
      });

      vi.spyOn(playbackApi, 'startPlaybackSession').mockReturnValue(startPromise as any);
      const endSpy = vi.spyOn(playbackApi, 'endPlaybackSession').mockResolvedValue();

      const { unmount } = render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={vi.fn()}
        />
      );

      // Unmount while start is in-flight
      unmount();

      // Now resolve startPlaybackSession
      await act(async () => {
        resolveStart({
          session_id: 'sess-late',
          media_item_id: 101,
          duration_seconds: 3600,
          resume_position_seconds: 50,
        });
        await Promise.resolve();
      });

      expect(mockDriver.seekTo).not.toHaveBeenCalled();
      expect(endSpy).toHaveBeenCalledWith(expect.anything(), 'sess-late');
    });

    it('falls back to reportPlaybackProgress if session fails to start', async () => {
      vi.spyOn(playbackApi, 'startPlaybackSession').mockRejectedValue(new Error('500 Server Error'));

      render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        mockDriver.timeCallback?.(25000, 100000);
      });

      // Advance 10s
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(reportPlaybackSpy).toHaveBeenCalledWith(
        'http://localhost:8492',
        'test-token',
        101,
        25000,
        false
      );
    });
  });

  describe('Subtitle Discovery & Track Selection', () => {
    const mockTracks = [
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
      {
        id: 2,
        media_item_id: 101,
        source: 'sidecar',
        language: 'fr',
        title: 'French',
        format: 'vtt',
        is_default: false,
        is_forced: false,
        stream_url: '/api/v1/subtitles/2/stream.vtt',
      },
    ];

    it('fetches item subtitles on mount with numeric itemId and sets default track', async () => {
      const fetchSubtitlesSpy = vi.spyOn(subtitlesApi, 'fetchItemSubtitles').mockResolvedValue(mockTracks);

      const { getByTestId, getByText } = render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(fetchSubtitlesSpy).toHaveBeenCalledWith(expect.anything(), 101);
      expect(mockDriver.setSubtitleTrack).toHaveBeenCalledWith(
        'http://localhost:8492/api/v1/subtitles/1/stream.vtt'
      );

      // Subtitles button appears when video is paused
      act(() => {
        mockDriver.stateCallback?.('paused');
      });

      expect(getByTestId('subtitles-button')).toBeInTheDocument();
      expect(getByText('Subtitles')).toBeInTheDocument();
    });

    it('allows selecting a different subtitle track from OSD and updates driver', async () => {
      vi.spyOn(subtitlesApi, 'fetchItemSubtitles').mockResolvedValue(mockTracks);

      const { getByTestId } = render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        mockDriver.stateCallback?.('paused');
      });

      // Open subtitles popup
      act(() => {
        getByTestId('subtitles-button').click();
      });

      // Select French (id: 2)
      act(() => {
        getByTestId('subtitle-option-2').click();
      });

      expect(mockDriver.setSubtitleTrack).toHaveBeenLastCalledWith(
        'http://localhost:8492/api/v1/subtitles/2/stream.vtt'
      );
    });

    it('allows turning subtitles Off from OSD and updates driver with null', async () => {
      vi.spyOn(subtitlesApi, 'fetchItemSubtitles').mockResolvedValue(mockTracks);

      const { getByTestId } = render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        mockDriver.stateCallback?.('paused');
      });

      act(() => {
        getByTestId('subtitles-button').click();
      });

      act(() => {
        getByTestId('subtitle-option-off').click();
      });

      expect(mockDriver.setSubtitleTrack).toHaveBeenLastCalledWith(null);
    });

    it('handles subtitle fetch rejection gracefully without breaking playback', async () => {
      vi.spyOn(subtitlesApi, 'fetchItemSubtitles').mockRejectedValue(new Error('404 Not Found'));

      const { queryByTestId, getByText } = render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        mockDriver.stateCallback?.('paused');
      });

      // Subtitle button remains available when paused so user can search OpenSubtitles online even if local fetch rejected
      expect(queryByTestId('subtitles-button')).toBeInTheDocument();
      expect(getByText('Sample Movie')).toBeInTheDocument();
    });

    it('pauses OSD auto-hide while subtitle popup is open and playing', async () => {
      vi.spyOn(subtitlesApi, 'fetchItemSubtitles').mockResolvedValue(mockTracks);

      const { getByTestId, queryByTestId } = render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Paused state to show subtitles button
      act(() => {
        mockDriver.stateCallback?.('paused');
      });

      // Open subtitles popup
      act(() => {
        getByTestId('subtitles-button').click();
      });
      expect(getByTestId('subtitles-popup')).toBeInTheDocument();

      // Resume playing
      act(() => {
        mockDriver.stateCallback?.('playing');
      });

      // Advance 5 seconds (past the 4s auto-hide limit)
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Popup and OSD should still be visible
      expect(getByTestId('subtitles-popup')).toBeInTheDocument();
      expect(queryByTestId('player-osd')).toBeInTheDocument();
    });

    it('does not toggle play/pause when Enter key is pressed while subtitle popup is open', async () => {
      vi.spyOn(subtitlesApi, 'fetchItemSubtitles').mockResolvedValue(mockTracks);

      render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        mockDriver.stateCallback?.('paused');
      });

      // Open popup
      act(() => {
        screen.getByTestId('subtitles-button').click();
      });

      mockDriver.pause.mockClear();
      mockDriver.play.mockClear();

      // Press Enter to select subtitle option
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.ENTER }));
      });

      // Should select subtitle, but NOT pause or play the video!
      expect(mockDriver.pause).not.toHaveBeenCalled();
      expect(mockDriver.play).not.toHaveBeenCalled();
    });

    it('downloads online subtitle via SubtitleModal and immediately activates it on player driver', async () => {
      vi.spyOn(subtitlesApi, 'fetchItemSubtitles').mockResolvedValue(mockTracks);

      const client = new ApiClient('http://localhost:8492');
      vi.spyOn(client, 'fetch').mockImplementation(async (path: string) => {
        if (path.includes('/search')) {
          return {
            configured: true,
            matches: [
              {
                file_id: 'os-300',
                language: 'ara',
                format: 'srt',
                title: 'Arabic.Subs.srt',
                download_count: 500,
                hearing_impaired: false,
              },
            ],
          } as any;
        }
        if (path.includes('/download')) {
          return {
            id: 99,
            media_item_id: 101,
            source: 'online',
            language: 'ara',
            title: 'Arabic.Subs.srt',
            format: 'srt',
            is_default: false,
            is_forced: false,
            stream_url: '/api/v1/subtitles/99/stream.vtt',
          } as any;
        }
        return {} as any;
      });

      render(
        <PlayerScreen
          itemId={101}
          title="Sample Movie"
          serverUrl="http://localhost:8492"
          token="test-token"
          client={client}
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        mockDriver.stateCallback?.('paused');
      });

      // Open subtitles modal
      act(() => {
        screen.getByTestId('subtitles-button').click();
      });

      // Switch to Search Online tab
      act(() => {
        screen.getByText('Search Online').click();
      });

      // Pick Arabic language
      act(() => {
        screen.getByTestId('lang-btn-ara').click();
      });

      // Wait for search result to appear
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('Arabic.Subs.srt')).toBeInTheDocument();

      // Click Download & Activate
      await act(async () => {
        screen.getByText('Download & Activate').click();
      });

      // Driver should immediately be updated with the newly downloaded track
      expect(mockDriver.setSubtitleTrack).toHaveBeenLastCalledWith(
        'http://localhost:8492/api/v1/subtitles/99/stream.vtt'
      );
    });

    it('displays error diagnostic modal and prevents driver init when itemId is undefined', async () => {
      render(
        <PlayerScreen
          itemId={undefined as any}
          title="Unknown Video"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(mockDriver.init).not.toHaveBeenCalled();
      expect(screen.getByText('Playback Error')).toBeInTheDocument();
      expect(screen.getByText(/Invalid or missing media item ID for playback stream/)).toBeInTheDocument();
    });

    it('supports TV remote D-Pad navigation between Retry Playback, Try HTML5 Video Player, and Exit to Browse on error screen', async () => {
      const onExit = vi.fn();
      render(
        <FocusProvider>
          <PlayerScreen
            itemId={101}
            title="Sample Movie"
            serverUrl="http://localhost:8492"
            token="test-token"
            onExit={onExit}
          />
        </FocusProvider>
      );

      // Trigger error from player driver
      act(() => {
        mockDriver.errorCallback?.('Hardware decoding error');
      });

      expect(screen.getByText('Playback Error')).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /Retry Playback/i });
      const hlsBtn = screen.getByRole('button', { name: /Play with Transcoding \(HLS\)/i });
      const html5Btn = screen.getByRole('button', { name: /Try HTML5 Video Player/i });
      const exitBtn = screen.getByRole('button', { name: /Exit to Browse/i });

      // Retry Playback is initially focused
      expect(retryBtn).toHaveClass('tv-focus-ring');

      // Navigate Right -> Play with Transcoding (HLS)
      act(() => {
        fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT, key: 'ArrowRight' });
      });
      expect(hlsBtn).toHaveClass('tv-focus-ring');

      // Navigate Right -> Try HTML5 Video Player
      act(() => {
        fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT, key: 'ArrowRight' });
      });
      expect(html5Btn).toHaveClass('tv-focus-ring');

      // Navigate Right -> Exit to Browse
      act(() => {
        fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT, key: 'ArrowRight' });
      });
      expect(exitBtn).toHaveClass('tv-focus-ring');

      // Navigate Left -> back to Try HTML5 Video Player
      act(() => {
        fireEvent.keyDown(window, { keyCode: TVKeys.LEFT, key: 'ArrowLeft' });
      });
      expect(html5Btn).toHaveClass('tv-focus-ring');

      // Navigate Right -> Exit to Browse and press Enter
      act(() => {
        fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT, key: 'ArrowRight' });
      });
      expect(exitBtn).toHaveClass('tv-focus-ring');

      act(() => {
        fireEvent.keyDown(window, { keyCode: TVKeys.ENTER, key: 'Enter' });
      });
      expect(onExit).toHaveBeenCalledTimes(1);
    });
  });
});


