import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { PlayerDriver, PlayerState } from '../../src/player/driver';

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

vi.mock('../../src/api/items', () => ({
  fetchMediaItem: vi.fn().mockResolvedValue({
    id: 101,
    title: 'Sample Movie',
    media_type: 'movie',
  }),
}));

vi.mock('../../src/api/playback', () => ({
  reportPlaybackProgress: vi.fn().mockResolvedValue(undefined),
  startPlaybackSession: vi.fn().mockResolvedValue({ sessionId: 'session-123', resumePositionMs: 0 }),
  reportSessionProgress: vi.fn().mockResolvedValue(undefined),
  endPlaybackSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/api/subtitles', () => ({
  fetchSubtitles: vi.fn().mockResolvedValue([]),
  fetchItemSubtitles: vi.fn().mockResolvedValue([]),
  searchOnlineSubtitles: vi.fn().mockResolvedValue([]),
  downloadOnlineSubtitle: vi.fn().mockResolvedValue({ id: 'sub-1', track_id: 'sub-1' }),
}));

describe('PlayerScreen Error & HLS Button Scaling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('renders error action buttons with enlarged padding and spacing', async () => {
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

    const retryBtn = screen.getByRole('button', { name: /retry playback/i });
    const hlsBtn = screen.getByRole('button', { name: /play with transcoding/i });
    const html5Btn = screen.getByRole('button', { name: /try html5 video player/i });
    const exitBtn = screen.getByRole('button', { name: /exit to browse/i });

    expect(retryBtn.className).toContain('py-6');
    expect(retryBtn.className).toContain('px-10');
    expect(retryBtn.className).toContain('text-2xl');
    expect(retryBtn.className).toContain('rounded-2xl');
    expect(retryBtn.parentElement?.className).toContain('space-y-6');

    expect(hlsBtn.className).toContain('py-6');
    expect(hlsBtn.className).toContain('px-10');
    expect(hlsBtn.className).toContain('text-2xl');
    expect(hlsBtn.className).toContain('rounded-2xl');

    expect(html5Btn.className).toContain('py-6');
    expect(html5Btn.className).toContain('px-10');
    expect(html5Btn.className).toContain('text-2xl');
    expect(html5Btn.className).toContain('rounded-2xl');

    expect(exitBtn.className).toContain('py-6');
    expect(exitBtn.className).toContain('px-10');
    expect(exitBtn.className).toContain('text-2xl');
    expect(exitBtn.className).toContain('rounded-2xl');
  });
});
