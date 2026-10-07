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
    expect(mockDriver.seekTo).toHaveBeenCalledWith(35000);
  });

  it('prevents seeking below 0', () => {
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
      mockDriver.timeCallback?.(4000, 100000);
    });

    // Press Left with pos 4s -> should seek to 0, not -6s
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.LEFT }));
    });
    expect(mockDriver.seekTo).toHaveBeenCalledWith(0);
  });

  it('handles remote Back button to trigger onExit', () => {
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

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_TIZEN }));
    });
    expect(onExit).toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_WEB }));
    });
    expect(onExit).toHaveBeenCalledTimes(2);
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
});
