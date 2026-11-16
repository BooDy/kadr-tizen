import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { PlayerScreen } from '../../src/screens/PlayerScreen';
import * as playbackApi from '../../src/api/playback';
import * as subtitlesApi from '../../src/api/subtitles';
import { ApiClient } from '../../src/api/client';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { PlayerDriver } from '../../src/player/driver';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDriver: any;
vi.mock('../../src/player/avplay-driver', () => ({
  createPlayerDriver: () => {
    mockDriver = {
      init: vi.fn().mockImplementation(async () => {}),
      play: vi.fn(), pause: vi.fn(), seekTo: vi.fn(), destroy: vi.fn(), setSubtitleTrack: vi.fn(),
      onTimeUpdate: vi.fn((cb) => { mockDriver.timeCallback = cb; }),
      onStateChange: vi.fn((cb) => { mockDriver.stateCallback = cb; }),
      onError: vi.fn(),
    };
    return mockDriver as unknown as PlayerDriver;
  },
}));

const VTT = `WEBVTT

00:00:05.000 --> 00:00:08.000
Hello from the overlay
`;

describe('PlayerScreen subtitle delay end-to-end via modal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(playbackApi, 'reportPlaybackProgress').mockResolvedValue(undefined);
    vi.spyOn(subtitlesApi, 'fetchItemSubtitles').mockResolvedValue([
      { id: 7, media_item_id: 1, source: 'external', language: 'eng', title: 'English', format: 'vtt',
        is_default: true, is_forced: false, stream_url: '/api/v1/subtitles/7/stream.vtt' },
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it('changing the delay in the Timing tab shifts the visible subtitle', async () => {
    const client = new ApiClient('http://localhost:8492');
    vi.spyOn(client, 'fetchText').mockResolvedValue(VTT);
    render(
      <FocusProvider>
        <PlayerScreen client={client} itemId={1} title="Movie" serverUrl="http://localhost:8492" token="t" onExit={vi.fn()} />
      </FocusProvider>
    );
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    act(() => { mockDriver.stateCallback?.('paused'); });
    act(() => { mockDriver.timeCallback(6000, 120000); });
    expect(screen.getByTestId('subtitle-overlay-text').textContent).toBe('Hello from the overlay');

    act(() => { screen.getByTestId('subtitles-button').click(); });
    act(() => { screen.getByText('Timing').click(); });
    act(() => { screen.getByTestId('sub-delay-plus-5000').click(); });

    expect(screen.getByTestId('subtitle-delay-value').textContent).toBe('+5.0s');
    // The Timing tab reports the loaded file and the line shown right now
    expect(screen.getByTestId('subtitle-delay-status').textContent).toContain('1 lines loaded');
    expect(screen.getByTestId('subtitle-delay-status').textContent).toContain('(no line at this moment)');
    // Position 6.0s with +5s delay => cue now maps to 10s..13s, so nothing visible at 6s
    expect(screen.queryByTestId('subtitle-overlay')).not.toBeInTheDocument();

    act(() => { screen.getByTestId('sub-delay-minus-5000').click(); });
    act(() => { screen.getByTestId('sub-delay-minus-5000').click(); });
    expect(screen.getByTestId('subtitle-delay-value').textContent).toBe('-5.0s');
    // -5s => cue 0s..3s, not visible at 6s
    expect(screen.queryByTestId('subtitle-overlay')).not.toBeInTheDocument();
    act(() => { mockDriver.timeCallback(1000, 120000); });
    expect(screen.getByTestId('subtitle-overlay-text').textContent).toBe('Hello from the overlay');
    fireEvent.keyDown(window, { key: 'Escape' });
  });

  it('reports a problem in the Timing tab when the subtitle file cannot be downloaded', async () => {
    const client = new ApiClient('http://localhost:8492');
    vi.spyOn(client, 'fetchText').mockRejectedValue(new Error('HTTP error 401: Unauthorized'));
    render(
      <FocusProvider>
        <PlayerScreen client={client} itemId={1} title="Movie" serverUrl="http://localhost:8492" token="t" onExit={vi.fn()} />
      </FocusProvider>
    );
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    act(() => { mockDriver.stateCallback?.('paused'); });
    act(() => { screen.getByTestId('subtitles-button').click(); });
    act(() => { screen.getByText('Timing').click(); });
    expect(screen.getByTestId('subtitle-delay-status').textContent).toContain('401');
  });
});
