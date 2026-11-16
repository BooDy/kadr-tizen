import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import { ApiClient } from '../../src/api/client';
import * as playbackApi from '../../src/api/playback';
import * as itemsApi from '../../src/api/items';
import * as subtitlesApi from '../../src/api/subtitles';
import { TVKeys } from '../../src/navigation/keys';
import { FocusProvider } from '../../src/navigation/FocusContext';

let mockDriver: {
  name: string;
  init: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  seekTo: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  setSubtitleTrack: ReturnType<typeof vi.fn>;
  onTimeUpdate: ReturnType<typeof vi.fn>;
  onStateChange: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  triggerError?: (err: string) => void;
};

vi.mock('../../src/api/subtitles', () => ({
  fetchItemSubtitles: vi.fn(),
}));

vi.mock('../../src/api/items', () => ({
  fetchMediaItem: vi.fn(),
}));

vi.mock('../../src/player/driver', () => ({
  createPlayerDriver: vi.fn(() => {
    mockDriver = {
      name: 'Tizen AVPlay',
      init: vi.fn().mockImplementation(async () => {}),
      play: vi.fn(),
      pause: vi.fn(),
      seekTo: vi.fn(),
      destroy: vi.fn(),
      setSubtitleTrack: vi.fn(),
      onTimeUpdate: vi.fn(),
      onStateChange: vi.fn(),
      onError: vi.fn((cb) => {
        mockDriver.triggerError = cb;
      }),
    };
    return mockDriver;
  }),
}));

describe('PlayerScreen Error Handling, Technical Details Modal & Log Relay', () => {
  const apiClient = new ApiClient('http://127.0.0.1:8492');
  let fetchSpy: any;
  let onExitMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onExitMock = vi.fn();
    vi.mocked(itemsApi.fetchMediaItem).mockResolvedValue({
      id: 101,
      title: 'Dexter: New Blood',
      technical: {
        video_codec: 'h264',
        audio_codec: 'aac',
        container: 'mp4',
      },
    } as any);
    vi.mocked(subtitlesApi.fetchItemSubtitles).mockResolvedValue([]);
    vi.spyOn(playbackApi, 'reportPlaybackProgress').mockResolvedValue(undefined);

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      if (url.includes('/api/v1/stream/') || url.includes('/hls/master.m3u8')) {
        return {
          ok: false,
          status: 404,
          headers: new Headers(),
          json: async () => ({ error: 'Media file missing from disk' }),
        } as unknown as Response;
      }
      if (url.includes(':9999/log')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({}),
      } as unknown as Response;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders "View Technical Details" button on error screen', async () => {
    render(
      <FocusProvider>
        <PlayerScreen
          serverUrl="http://127.0.0.1:8492"
          token="secret-token-123"
          itemId="101"
          title="Dexter: New Blood"
          apiClient={apiClient}
          onExit={onExitMock}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('player-error-details-btn')).toBeInTheDocument();
    });

    expect(screen.getByText(/View Technical Details/i)).toBeInTheDocument();
  });

  it('opens technical details modal showing redacted stream URL, codes, and metadata', async () => {
    render(
      <FocusProvider>
        <PlayerScreen
          serverUrl="http://127.0.0.1:8492"
          token="secret-token-123"
          itemId="101"
          title="Dexter: New Blood"
          apiClient={apiClient}
          onExit={onExitMock}
        />
      </FocusProvider>
    );

    const detailsBtn = await screen.findByTestId('player-error-details-btn');
    expect(screen.queryByTestId('player-error-details-modal')).not.toBeInTheDocument();

    fireEvent.click(detailsBtn);

    const modal = await screen.findByTestId('player-error-details-modal');
    expect(modal).toBeInTheDocument();

    // Verify metadata shown
    expect(modal).toHaveTextContent('101');
    expect(modal).toHaveTextContent('Dexter: New Blood');
    expect(modal).toHaveTextContent('404');
    expect(modal).toHaveTextContent('Media file missing from disk');
    expect(modal).toHaveTextContent('Tizen AVPlay');

    // Verify token is redacted in displayed stream URL
    expect(modal).toHaveTextContent('token=[REDACTED]');
    expect(modal).not.toHaveTextContent('secret-token-123');
  });

  it('closes technical details modal when Close button is clicked or Back key is pressed without exiting player', async () => {
    render(
      <FocusProvider>
        <PlayerScreen
          serverUrl="http://127.0.0.1:8492"
          token="secret-token-123"
          itemId="101"
          title="Dexter: New Blood"
          apiClient={apiClient}
          onExit={onExitMock}
        />
      </FocusProvider>
    );

    const detailsBtn = await screen.findByTestId('player-error-details-btn');
    fireEvent.click(detailsBtn);

    expect(await screen.findByTestId('player-error-details-modal')).toBeInTheDocument();

    // Press Escape/Back key while modal is open
    fireEvent.keyDown(window, {
      keyCode: TVKeys.BACK_TIZEN,
      key: 'Escape',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('player-error-details-modal')).not.toBeInTheDocument();
    });

    // onExit must NOT have been called because Back only closed the details modal
    expect(onExitMock).not.toHaveBeenCalled();

    // Clicking close button also works
    fireEvent.click(screen.getByTestId('player-error-details-btn'));
    expect(await screen.findByTestId('player-error-details-modal')).toBeInTheDocument();

    const closeBtn = screen.getByTestId('player-error-details-close-btn');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('player-error-details-modal')).not.toBeInTheDocument();
    });
  });

  it('automatically dispatches a non-blocking log relay POST to :9999/log on error', async () => {
    render(
      <FocusProvider>
        <PlayerScreen
          serverUrl="http://127.0.0.1:8492"
          token="secret-token-123"
          itemId="101"
          title="Dexter: New Blood"
          apiClient={apiClient}
          onExit={onExitMock}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('player-error-details-btn')).toBeInTheDocument();
    });

    await waitFor(() => {
      const logCall = fetchSpy.mock.calls.find((call: any[]) =>
        String(call[0]).includes(':9999/log')
      );
      expect(logCall).toBeDefined();
      expect(logCall[1]).toMatchObject({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const parsedBody = JSON.parse(logCall[1].body);
      expect(parsedBody.item_id).toBe('101');
      expect(parsedBody.app).toBe('kadr-tizen');
      expect(parsedBody.error).toContain('Media file missing from disk');
    });
  });

  it('handles remote log relay failure silently without crashing the error screen', async () => {
    fetchSpy.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      if (url.includes(':9999/log')) {
        throw new Error('Connection refused to :9999');
      }
      if (url.includes('/api/v1/stream/') || url.includes('/hls/master.m3u8')) {
        return {
          ok: false,
          status: 404,
          headers: new Headers(),
          json: async () => ({ error: 'Media file missing from disk' }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({}),
      } as unknown as Response;
    });

    render(
      <FocusProvider>
        <PlayerScreen
          serverUrl="http://127.0.0.1:8492"
          token="secret-token-123"
          itemId="101"
          title="Dexter: New Blood"
          apiClient={apiClient}
          onExit={onExitMock}
        />
      </FocusProvider>
    );

    // Should still render error UI cleanly despite logger failure
    await waitFor(() => {
      expect(screen.getByTestId('player-error-details-btn')).toBeInTheDocument();
    });
    expect(screen.getByText('Media File Missing from Server Disk')).toBeInTheDocument();
  });
});
