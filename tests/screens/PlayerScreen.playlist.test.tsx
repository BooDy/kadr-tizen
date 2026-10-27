import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { PlayerScreen, PlaylistItem } from '../../src/screens/PlayerScreen';
import { TVKeys } from '../../src/navigation/keys';
import { PlayerDriver, PlayerState } from '../../src/player/driver';
import { ApiClient } from '../../src/api/client';
import { FocusProvider } from '../../src/navigation/FocusContext';

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

vi.mock('../../src/api/playback', () => ({
  reportPlaybackProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/api/subtitles', () => ({
  fetchItemSubtitles: vi.fn().mockResolvedValue([]),
  searchOnlineSubtitles: vi.fn().mockResolvedValue([]),
  downloadOnlineSubtitle: vi.fn().mockResolvedValue(null),
}));

describe('PlayerScreen Playlist & Auto-Advance', () => {
  const apiClient = new ApiClient('http://127.0.0.1:8492');
  const mockPlaylist: PlaylistItem[] = [
    { id: 'ep-1', title: 'Episode 1' },
    { id: 'ep-2', title: 'Episode 2' },
    { id: 'ep-3', title: 'Episode 3' },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  describe('OSD playlist navigation', () => {
    it('passes hasPrevious, hasNext, onPrevious, onNext to PlayerOSD and allows clicking next', async () => {
      const onNext = vi.fn();
      const onPrevious = vi.fn();

      render(
        <FocusProvider>
          <PlayerScreen
            serverUrl="http://127.0.0.1:8492"
            token="test-token"
            itemId="ep-1"
            title="Episode 1"
            playlist={mockPlaylist}
            currentIndex={0}
            onNext={onNext}
            onPrevious={onPrevious}
            onExit={vi.fn()}
            apiClient={apiClient}
          />
        </FocusProvider>
      );

      // In index 0: hasPrevious is false, hasNext is true
      const prevBtn = screen.getByTestId('player-osd-previous-btn');
      const nextBtn = screen.getByTestId('player-osd-next-btn');

      expect(prevBtn).toBeDisabled();
      expect(nextBtn).not.toBeDisabled();

      fireEvent.click(nextBtn);
      expect(onNext).toHaveBeenCalledTimes(1);
      expect(onPrevious).not.toHaveBeenCalled();
    });

    it('enables previous button and disables next button at last index', async () => {
      const onNext = vi.fn();
      const onPrevious = vi.fn();

      render(
        <FocusProvider>
          <PlayerScreen
            serverUrl="http://127.0.0.1:8492"
            token="test-token"
            itemId="ep-3"
            title="Episode 3"
            playlist={mockPlaylist}
            currentIndex={2}
            onNext={onNext}
            onPrevious={onPrevious}
            onExit={vi.fn()}
            apiClient={apiClient}
          />
        </FocusProvider>
      );

      const prevBtn = screen.getByTestId('player-osd-previous-btn');
      const nextBtn = screen.getByTestId('player-osd-next-btn');

      expect(prevBtn).not.toBeDisabled();
      expect(nextBtn).toBeDisabled();

      fireEvent.click(prevBtn);
      expect(onPrevious).toHaveBeenCalledTimes(1);
    });
  });

  describe('Remote media track keys', () => {
    it('handles TVKeys.MEDIA_TRACK_NEXT (10232) and ChannelUp (427) to invoke onNext when hasNext is true', async () => {
      const onNext = vi.fn();

      render(
        <FocusProvider>
          <PlayerScreen
            serverUrl="http://127.0.0.1:8492"
            token="test-token"
            itemId="ep-1"
            title="Episode 1"
            playlist={mockPlaylist}
            currentIndex={0}
            onNext={onNext}
            onExit={vi.fn()}
            apiClient={apiClient}
          />
        </FocusProvider>
      );

      // Press MEDIA_TRACK_NEXT
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.MEDIA_TRACK_NEXT });
      });
      expect(onNext).toHaveBeenCalledTimes(1);

      // Press CH_UP
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.CH_UP });
      });
      expect(onNext).toHaveBeenCalledTimes(2);

      // Press by key string 'MediaTrackNext'
      await act(async () => {
        fireEvent.keyDown(window, { key: 'MediaTrackNext' });
      });
      expect(onNext).toHaveBeenCalledTimes(3);
    });

    it('does not invoke onNext when hasNext is false', async () => {
      const onNext = vi.fn();

      render(
        <FocusProvider>
          <PlayerScreen
            serverUrl="http://127.0.0.1:8492"
            token="test-token"
            itemId="ep-3"
            title="Episode 3"
            playlist={mockPlaylist}
            currentIndex={2}
            onNext={onNext}
            onExit={vi.fn()}
            apiClient={apiClient}
          />
        </FocusProvider>
      );

      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.MEDIA_TRACK_NEXT });
      });
      expect(onNext).not.toHaveBeenCalled();
    });

    it('handles TVKeys.MEDIA_TRACK_PREVIOUS (10233) and ChannelDown (428) to invoke onPrevious when hasPrevious is true', async () => {
      const onPrevious = vi.fn();

      render(
        <FocusProvider>
          <PlayerScreen
            serverUrl="http://127.0.0.1:8492"
            token="test-token"
            itemId="ep-2"
            title="Episode 2"
            playlist={mockPlaylist}
            currentIndex={1}
            onPrevious={onPrevious}
            onExit={vi.fn()}
            apiClient={apiClient}
          />
        </FocusProvider>
      );

      // Press MEDIA_TRACK_PREVIOUS
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.MEDIA_TRACK_PREVIOUS });
      });
      expect(onPrevious).toHaveBeenCalledTimes(1);

      // Press CH_DOWN
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.CH_DOWN });
      });
      expect(onPrevious).toHaveBeenCalledTimes(2);

      // Press by key string 'MediaTrackPrevious'
      await act(async () => {
        fireEvent.keyDown(window, { key: 'MediaTrackPrevious' });
      });
      expect(onPrevious).toHaveBeenCalledTimes(3);
    });

    it('does not invoke onPrevious when hasPrevious is false', async () => {
      const onPrevious = vi.fn();

      render(
        <FocusProvider>
          <PlayerScreen
            serverUrl="http://127.0.0.1:8492"
            token="test-token"
            itemId="ep-1"
            title="Episode 1"
            playlist={mockPlaylist}
            currentIndex={0}
            onPrevious={onPrevious}
            onExit={vi.fn()}
            apiClient={apiClient}
          />
        </FocusProvider>
      );

      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.MEDIA_TRACK_PREVIOUS });
      });
      expect(onPrevious).not.toHaveBeenCalled();
    });
  });

  describe('Auto-advance overlay', () => {
    it('shows auto-advance overlay near duration end (<= 1500ms remaining), counts down, and fires onNext after 5s', async () => {
      const onNext = vi.fn();

      render(
        <FocusProvider>
          <PlayerScreen
            serverUrl="http://127.0.0.1:8492"
            token="test-token"
            itemId="ep-1"
            title="Episode 1"
            playlist={mockPlaylist}
            currentIndex={0}
            onNext={onNext}
            onExit={vi.fn()}
            apiClient={apiClient}
          />
        </FocusProvider>
      );

      // Simulate playback near end: 120,000ms duration, 118,600ms position (1400ms left <= 1500ms)
      act(() => {
        mockDriver.timeCallback?.(118600, 120000);
      });

      // Overlay should be visible with 5s countdown
      const overlay = screen.getByTestId('auto-advance-overlay');
      expect(overlay).toBeInTheDocument();
      expect(overlay).toHaveTextContent(/Next episode in 5s\.\.\./i);
      expect(onNext).not.toHaveBeenCalled();

      // Tick 1s -> 4s
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(overlay).toHaveTextContent(/Next episode in 4s\.\.\./i);
      expect(onNext).not.toHaveBeenCalled();

      // Tick remaining 4s (total 5s) -> fires onNext
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(onNext).toHaveBeenCalledTimes(1);
    });

    it('shows auto-advance overlay when playerState transitions to ended', async () => {
      const onNext = vi.fn();

      render(
        <FocusProvider>
          <PlayerScreen
            serverUrl="http://127.0.0.1:8492"
            token="test-token"
            itemId="ep-1"
            title="Episode 1"
            playlist={mockPlaylist}
            currentIndex={0}
            onNext={onNext}
            onExit={vi.fn()}
            apiClient={apiClient}
          />
        </FocusProvider>
      );

      act(() => {
        mockDriver.stateCallback?.('ended');
      });

      expect(screen.getByTestId('auto-advance-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('auto-advance-overlay')).toHaveTextContent(/Next episode in 5s\.\.\./i);

      // Advance 5 seconds
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(onNext).toHaveBeenCalledTimes(1);
    });

    it('does not show auto-advance overlay on last episode', async () => {
      const onNext = vi.fn();

      render(
        <FocusProvider>
          <PlayerScreen
            serverUrl="http://127.0.0.1:8492"
            token="test-token"
            itemId="ep-3"
            title="Episode 3"
            playlist={mockPlaylist}
            currentIndex={2}
            onNext={onNext}
            onExit={vi.fn()}
            apiClient={apiClient}
          />
        </FocusProvider>
      );

      act(() => {
        mockDriver.stateCallback?.('ended');
      });

      expect(screen.queryByTestId('auto-advance-overlay')).not.toBeInTheDocument();
      expect(onNext).not.toHaveBeenCalled();
    });

    it('triggers onNext immediately when Enter is pressed while auto-advance is active', async () => {
      const onNext = vi.fn();

      render(
        <FocusProvider>
          <PlayerScreen
            serverUrl="http://127.0.0.1:8492"
            token="test-token"
            itemId="ep-1"
            title="Episode 1"
            playlist={mockPlaylist}
            currentIndex={0}
            onNext={onNext}
            onExit={vi.fn()}
            apiClient={apiClient}
          />
        </FocusProvider>
      );

      act(() => {
        mockDriver.stateCallback?.('ended');
      });

      expect(screen.getByTestId('auto-advance-overlay')).toBeInTheDocument();

      // Press Enter
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.ENTER, key: 'Enter' });
      });

      expect(onNext).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('auto-advance-overlay')).not.toBeInTheDocument();
    });

    it('cancels auto-advance when Back / Escape is pressed and does not exit player', async () => {
      const onNext = vi.fn();
      const onExit = vi.fn();

      render(
        <FocusProvider>
          <PlayerScreen
            serverUrl="http://127.0.0.1:8492"
            token="test-token"
            itemId="ep-1"
            title="Episode 1"
            playlist={mockPlaylist}
            currentIndex={0}
            onNext={onNext}
            onExit={onExit}
            apiClient={apiClient}
          />
        </FocusProvider>
      );

      act(() => {
        mockDriver.stateCallback?.('ended');
      });

      expect(screen.getByTestId('auto-advance-overlay')).toBeInTheDocument();

      // Press Escape / Back
      await act(async () => {
        fireEvent.keyDown(window, { keyCode: TVKeys.BACK_WEB, key: 'Escape' });
      });

      // Auto-advance is dismissed, onExit is not called, onNext is not called
      expect(screen.queryByTestId('auto-advance-overlay')).not.toBeInTheDocument();
      expect(onExit).not.toHaveBeenCalled();
      expect(onNext).not.toHaveBeenCalled();

      // Advance timers 6 seconds - onNext still not called
      act(() => {
        vi.advanceTimersByTime(6000);
      });
      expect(onNext).not.toHaveBeenCalled();
    });
  });
});
