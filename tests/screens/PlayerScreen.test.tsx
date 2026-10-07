import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import * as playbackApi from '../../src/api/playback';
import { TVKeys } from '../../src/navigation/keys';
import { PlayerDriver, PlayerState } from '../../src/player/driver';

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
      'http://localhost:8492/api/v1/streaming/item-123',
      15000
    );
    expect(getByText('Sample Movie')).toBeInTheDocument();
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
    });
    expect(mockDriver.seekTo).toHaveBeenCalledWith(15000);

    // Press Right (+10s)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.RIGHT }));
    });
    expect(mockDriver.seekTo).toHaveBeenCalledWith(25000); // 15000 + 10000
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
    });
    expect(mockDriver.seekTo).toHaveBeenCalledWith(0);
    expect(getByText('0:00')).toBeInTheDocument();

    // Press Right repeatedly past duration (20s) -> should clamp to 20000
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.RIGHT })); // to 10s
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.RIGHT })); // to 20s
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.RIGHT })); // clamped at 20s
    });
    expect(mockDriver.seekTo).toHaveBeenLastCalledWith(20000);
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
});
