import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import * as playbackApi from '../../src/api/playback';
import * as subtitlesApi from '../../src/api/subtitles';
import { ApiClient } from '../../src/api/client';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { PlayerDriver } from '../../src/player/driver';
import { TVKeys } from '../../src/navigation/keys';
import {
  SUBTITLE_STORAGE_KEY,
  SUBTITLE_DELAY_STORAGE_KEY,
  SUBTITLE_PREFERENCE_STORAGE_KEY,
  loadSubtitlePreference,
} from '../../src/player/subtitleSettings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDriver: any;

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
      onError: vi.fn(),
    };
    return mockDriver as unknown as PlayerDriver;
  },
}));

const VTT = `WEBVTT

00:00:05.000 --> 00:00:08.000
Hello from the overlay

00:00:20.000 --> 00:00:22.000
Second line
`;

describe('PlayerScreen subtitle rendering', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(playbackApi, 'reportPlaybackProgress').mockResolvedValue(undefined);
    vi.spyOn(subtitlesApi, 'fetchItemSubtitles').mockResolvedValue([
      {
        id: 7,
        media_item_id: 1,
        source: 'external',
        language: 'eng',
        title: 'English',
        format: 'vtt',
        is_default: true,
        is_forced: false,
        stream_url: '/api/v1/subtitles/7/stream.vtt',
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderPlayer(client: ApiClient) {
    render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={1}
          title="Movie"
          serverUrl="http://localhost:8492"
          token="tok"
          onExit={vi.fn()}
        />
      </FocusProvider>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('downloads the selected track with auth and renders the cue for the current position', async () => {
    const client = new ApiClient('http://localhost:8492');
    const fetchTextSpy = vi.spyOn(client, 'fetchText').mockResolvedValue(VTT);

    await renderPlayer(client);

    expect(fetchTextSpy).toHaveBeenCalledWith('http://localhost:8492/api/v1/subtitles/7/stream.vtt');
    // The driver no longer owns subtitle rendering
    expect(mockDriver.setSubtitleTrack).not.toHaveBeenCalled();

    expect(screen.queryByTestId('subtitle-overlay')).not.toBeInTheDocument();

    act(() => {
      mockDriver.timeCallback(6000, 120000);
    });
    expect(screen.getByTestId('subtitle-overlay-text').textContent).toBe('Hello from the overlay');

    act(() => {
      mockDriver.timeCallback(10000, 120000);
    });
    expect(screen.queryByTestId('subtitle-overlay')).not.toBeInTheDocument();

    act(() => {
      mockDriver.timeCallback(21000, 120000);
    });
    expect(screen.getByTestId('subtitle-overlay-text').textContent).toBe('Second line');
  });

  it('applies persisted subtitle settings (font size, color, placement)', async () => {
    localStorage.setItem(
      SUBTITLE_STORAGE_KEY,
      JSON.stringify({ fontSize: 'xlarge', color: 'cyan', placement: 'top' })
    );
    const client = new ApiClient('http://localhost:8492');
    vi.spyOn(client, 'fetchText').mockResolvedValue(VTT);

    await renderPlayer(client);
    act(() => {
      mockDriver.timeCallback(6000, 120000);
    });

    const text = screen.getByTestId('subtitle-overlay-text');
    expect(text.style.fontSize).toBe('64px');
    expect(text.style.color).toBe('rgb(92, 225, 255)');
    expect(screen.getByTestId('subtitle-overlay').style.top).toBe('64px');
  });

  it('shifts subtitle timing by the saved per-track delay (positive = later, negative = earlier)', async () => {
    localStorage.setItem(SUBTITLE_DELAY_STORAGE_KEY, JSON.stringify({ '7': 2000 }));
    const client = new ApiClient('http://localhost:8492');
    vi.spyOn(client, 'fetchText').mockResolvedValue(VTT);

    await renderPlayer(client);

    // Cue is 5.0s -> 8.0s; with +2s delay it should show 7.0s -> 10.0s
    act(() => {
      mockDriver.timeCallback(6000, 120000);
    });
    expect(screen.queryByTestId('subtitle-overlay')).not.toBeInTheDocument();

    act(() => {
      mockDriver.timeCallback(7500, 120000);
    });
    expect(screen.getByTestId('subtitle-overlay-text').textContent).toBe('Hello from the overlay');

    act(() => {
      mockDriver.timeCallback(9500, 120000);
    });
    expect(screen.getByTestId('subtitle-overlay-text').textContent).toBe('Hello from the overlay');

    act(() => {
      mockDriver.timeCallback(10500, 120000);
    });
    expect(screen.queryByTestId('subtitle-overlay')).not.toBeInTheDocument();
  });

  it('supports a negative delay (subtitles appear earlier)', async () => {
    localStorage.setItem(SUBTITLE_DELAY_STORAGE_KEY, JSON.stringify({ '7': -3000 }));
    const client = new ApiClient('http://localhost:8492');
    vi.spyOn(client, 'fetchText').mockResolvedValue(VTT);

    await renderPlayer(client);

    // Cue 5.0s -> 8.0s, shifted -3s => 2.0s -> 5.0s
    act(() => {
      mockDriver.timeCallback(2500, 120000);
    });
    expect(screen.getByTestId('subtitle-overlay-text').textContent).toBe('Hello from the overlay');
    act(() => {
      mockDriver.timeCallback(5500, 120000);
    });
    expect(screen.queryByTestId('subtitle-overlay')).not.toBeInTheDocument();
  });

  it('closes only SubtitleModal on TV Back / Escape without calling onExit on PlayerScreen', async () => {
    const onExit = vi.fn();
    render(
      <FocusProvider>
        <PlayerScreen
          itemId={101}
          title="Episode 1"
          serverUrl="http://localhost:8492"
          token="test-token"
          onExit={onExit}
        />
      </FocusProvider>
    );

    await act(async () => {
      mockDriver.stateCallback?.('playing');
    });

    fireEvent.click(screen.getByTestId('subtitles-button'));
    expect(screen.getByRole('dialog', { name: 'Subtitles' })).toBeInTheDocument();

    // First Back press closes SubtitleModal ONLY; player remains mounted and onExit is NOT called
    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN, key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Subtitles' })).not.toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('remembers selected MKV embedded subtitle language across episode transitions and respects explicit Off selection', async () => {
    const client = new ApiClient('http://localhost:8492');

    const ep1Tracks = [
      {
        id: 11,
        media_item_id: 101,
        source: 'embedded' as const,
        language: 'eng',
        title: 'English',
        format: 'vtt' as const,
        is_default: true,
        is_forced: false,
        stream_url: '/api/v1/subtitles/11/stream.vtt',
      },
      {
        id: 12,
        media_item_id: 101,
        source: 'embedded' as const,
        language: 'ara',
        title: '',
        format: 'vtt' as const,
        is_default: false,
        is_forced: false,
        stream_url: '/api/v1/subtitles/12/stream.vtt',
      },
    ];

    const ep2Tracks = [
      {
        id: 21,
        media_item_id: 102,
        source: 'embedded' as const,
        language: 'eng',
        title: 'English',
        format: 'vtt' as const,
        is_default: true,
        is_forced: false,
        stream_url: '/api/v1/subtitles/21/stream.vtt',
      },
      {
        id: 22,
        media_item_id: 102,
        source: 'embedded' as const,
        language: 'ara',
        title: '',
        format: 'vtt' as const,
        is_default: false,
        is_forced: false,
        stream_url: '/api/v1/subtitles/22/stream.vtt',
      },
    ];

    const ep3Tracks = [
      {
        id: 31,
        media_item_id: 103,
        source: 'embedded' as const,
        language: 'eng',
        title: 'English',
        format: 'vtt' as const,
        is_default: true,
        is_forced: false,
        stream_url: '/api/v1/subtitles/31/stream.vtt',
      },
      {
        id: 32,
        media_item_id: 103,
        source: 'embedded' as const,
        language: 'ara',
        title: '',
        format: 'vtt' as const,
        is_default: false,
        is_forced: false,
        stream_url: '/api/v1/subtitles/32/stream.vtt',
      },
    ];

    vi.spyOn(subtitlesApi, 'fetchItemSubtitles').mockImplementation(async (_client, id) => {
      if (id === 101) return ep1Tracks as any;
      if (id === 102) return ep2Tracks as any;
      if (id === 103) return ep3Tracks as any;
      return [];
    });

    const VTT_ARA_EP1 = 'WEBVTT\n\n00:00:05.000 --> 00:00:08.000\nArabic Ep1 Cue\n';
    const VTT_ARA_EP2 = 'WEBVTT\n\n00:00:05.000 --> 00:00:08.000\nArabic Ep2 Cue\n';
    const VTT_ENG_EP1 = 'WEBVTT\n\n00:00:05.000 --> 00:00:08.000\nEnglish Ep1 Cue\n';
    const VTT_ENG_EP2 = 'WEBVTT\n\n00:00:05.000 --> 00:00:08.000\nEnglish Ep2 Cue\n';

    vi.spyOn(client, 'fetchText').mockImplementation(async (url: string) => {
      if (url.includes('/12/')) return VTT_ARA_EP1;
      if (url.includes('/22/')) return VTT_ARA_EP2;
      if (url.includes('/11/')) return VTT_ENG_EP1;
      if (url.includes('/21/')) return VTT_ENG_EP2;
      return VTT;
    });

    const { rerender } = render(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={101}
          title="Episode 1"
          serverUrl="http://localhost:8492"
          token="tok"
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Open SubtitleModal
    fireEvent.click(screen.getByTestId('subtitles-button'));
    expect(screen.getByRole('dialog', { name: 'Subtitles' })).toBeInTheDocument();

    // Click Arabic (ara)
    fireEvent.click(screen.getByText('Arabic (ara)'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadSubtitlePreference()).toEqual({
      mode: 'language',
      language: 'ara',
      preferForced: false,
    });
    expect(localStorage.getItem(SUBTITLE_PREFERENCE_STORAGE_KEY)).toBe(
      JSON.stringify({ mode: 'language', language: 'ara', preferForced: false })
    );

    act(() => {
      mockDriver.timeCallback(6000, 120000);
    });
    expect(screen.getByTestId('subtitle-overlay-text').textContent).toBe('Arabic Ep1 Cue');

    // Transition to Episode 2
    rerender(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={102}
          title="Episode 2"
          serverUrl="http://localhost:8492"
          token="tok"
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Episode 2 automatically selects id 22 (Arabic) instead of 21 (English default)
    act(() => {
      mockDriver.timeCallback(6000, 120000);
    });
    expect(screen.getByTestId('subtitle-overlay-text').textContent).toBe('Arabic Ep2 Cue');

    // Open SubtitleModal and select Off
    fireEvent.click(screen.getByTestId('subtitles-button'));
    fireEvent.click(screen.getByText('Off'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadSubtitlePreference()).toEqual({ mode: 'off' });
    expect(localStorage.getItem(SUBTITLE_PREFERENCE_STORAGE_KEY)).toBe(
      JSON.stringify({ mode: 'off' })
    );
    expect(screen.queryByTestId('subtitle-overlay')).not.toBeInTheDocument();

    // Transition to Episode 3
    rerender(
      <FocusProvider>
        <PlayerScreen
          client={client}
          itemId={103}
          title="Episode 3"
          serverUrl="http://localhost:8492"
          token="tok"
          onExit={vi.fn()}
        />
      </FocusProvider>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      mockDriver.timeCallback(6000, 120000);
    });
    expect(screen.queryByTestId('subtitle-overlay')).not.toBeInTheDocument();
  });
});
