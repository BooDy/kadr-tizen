import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import { TVKeys } from '../../src/navigation/keys';
import { ApiClient } from '../../src/api/client';

vi.mock('../../src/player/driver', () => {
  return {
    createPlayerDriver: vi.fn(() => ({
      name: 'Tizen AVPlay',
      init: vi.fn().mockResolvedValue(undefined),
      play: vi.fn(),
      pause: vi.fn(),
      seekTo: vi.fn(),
      setSubtitleTrack: vi.fn(),
      destroy: vi.fn(),
      onTimeUpdate: vi.fn((cb) => cb(30000, 120000)),
      onStateChange: vi.fn((cb) => cb('playing')),
      onError: vi.fn(),
    })),
  };
});

vi.mock('../../src/player/avplay-driver', () => {
  return {
    createPlayerDriver: vi.fn(() => ({
      name: 'Tizen AVPlay',
      init: vi.fn().mockResolvedValue(undefined),
      play: vi.fn(),
      pause: vi.fn(),
      seekTo: vi.fn(),
      setSubtitleTrack: vi.fn(),
      destroy: vi.fn(),
      onTimeUpdate: vi.fn((cb) => cb(30000, 120000)),
      onStateChange: vi.fn((cb) => cb('playing')),
      onError: vi.fn(),
    })),
  };
});

describe('PlayerScreen Seeking & Fast Forward', () => {
  const apiClient = new ApiClient('http://127.0.0.1:8492');

  beforeEach(() => {
    vi.useFakeTimers();
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
});
