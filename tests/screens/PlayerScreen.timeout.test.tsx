import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import { ApiClient } from '../../src/api/client';

vi.mock('../../src/player/driver', () => {
  return {
    createPlayerDriver: vi.fn(() => ({
      name: 'Tizen AVPlay',
      init: vi.fn().mockImplementation(() => new Promise(() => {})), // hangs indefinitely
      play: vi.fn(),
      pause: vi.fn(),
      seekTo: vi.fn(),
      setSubtitleTrack: vi.fn(),
      destroy: vi.fn(),
      onTimeUpdate: vi.fn(),
      onStateChange: vi.fn(),
      onError: vi.fn(),
    })),
  };
});

describe('PlayerScreen 10s Fail-Fast Buffering Timeout', () => {
  const apiClient = new ApiClient('http://127.0.0.1:8492');

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('triggers error screen with QR code if stream does not play within 10 seconds', async () => {
    render(
      <PlayerScreen
        serverUrl="http://127.0.0.1:8492"
        token="test-token"
        itemId="555"
        apiClient={apiClient}
        onExit={vi.fn()}
      />
    );

    // Initial state is buffering/loading
    expect(screen.queryByTestId('error-qr-code')).not.toBeInTheDocument();

    // Advance timers by 10,000ms
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Should now display error screen with QR code
    expect(screen.getByText(/Buffering timeout after 10s/i)).toBeInTheDocument();
    expect(screen.getByTestId('error-qr-code')).toBeInTheDocument();
  });
});
