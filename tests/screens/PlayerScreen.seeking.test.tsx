import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import { TVKeys } from '../../src/navigation/keys';
import { ApiClient } from '../../src/api/client';

let mockDriver: any = null;
let onTimeUpdateCb: ((pos: number, dur: number) => void) | null = null;
let onStateChangeCb: ((state: string) => void) | null = null;

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
      vi.advanceTimersByTime(300);
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
});
