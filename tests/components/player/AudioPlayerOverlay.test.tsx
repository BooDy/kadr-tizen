import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AudioPlayerOverlay,
  formatAudioDuration,
  type AudioPlayerOverlayProps,
  type AudioQueueEntry,
} from '../../../src/components/player/AudioPlayerOverlay';
import { AudioTrackModal } from '../../../src/components/player/AudioTrackModal';
import { FocusProvider, useFocusContext } from '../../../src/navigation/FocusContext';
import { TVKeys } from '../../../src/navigation/keys';
import type { AudioStreamInfo } from '../../../src/types/kadr';

function FocusDebug() {
  const { focusedId } = useFocusContext();
  return <span data-testid="debug-focused-id">{focusedId ?? ''}</span>;
}

const sampleQueue: AudioQueueEntry[] = [
  { id: 101, title: 'Opening Overture', subtitle: 'Disc 1', durationSeconds: 245 },
  { id: 102, title: 'Midnight Echoes', subtitle: 'Disc 1', durationSeconds: 312 },
  { id: 103, title: 'Closing Theme', subtitle: 'Disc 1', durationSeconds: 198 },
];

const sampleAudioTracks: AudioStreamInfo[] = [
  {
    audio_index: 0,
    stream_index: 1,
    codec: 'flac',
    channels: 2,
    language: 'eng',
    title: 'Stereo FLAC',
    is_default: true,
  },
  {
    audio_index: 1,
    stream_index: 2,
    codec: 'aac',
    channels: 6,
    language: 'eng',
    title: 'Surround Mix',
    is_default: false,
  },
];

function createProps(overrides: Partial<AudioPlayerOverlayProps> = {}): AudioPlayerOverlayProps {
  return {
    mediaType: 'music',
    title: 'Midnight Echoes',
    subtitle: 'The Horizon Ensemble',
    overview: 'Recorded live in Reykjavik.',
    releaseYear: 2024,
    posterUrl: 'https://kadr.local/cover.jpg',
    streamModeLabel: 'DIRECT • FLAC',
    playerState: 'playing',
    positionMs: 65000,
    durationMs: 312000,
    playbackRate: 1,
    repeatMode: 'off',
    isAmbientDimmed: false,
    hasPrevious: true,
    hasNext: true,
    queue: sampleQueue,
    currentIndex: 1,
    onTogglePlayPause: vi.fn(),
    onSeekRelative: vi.fn(),
    onRestartTrack: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onSelectQueueIndex: vi.fn(),
    onCycleSpeed: vi.fn(),
    onCycleRepeat: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
}

function assertNoForbiddenCssClasses(container: HTMLElement) {
  const allElements = Array.from(container.querySelectorAll('*'));
  for (const el of allElements) {
    const cls = el.getAttribute('class') ?? '';
    expect(cls).not.toMatch(/\bgap-/);
    expect(cls).not.toMatch(/\bbackdrop-blur/);
  }
}

describe('formatAudioDuration', () => {
  it('formats durations under 1 hour as M:SS and invalid/negative values as 0:00', () => {
    expect(formatAudioDuration(0)).toBe('0:00');
    expect(formatAudioDuration(-12)).toBe('0:00');
    expect(formatAudioDuration(Number.NaN)).toBe('0:00');
    expect(formatAudioDuration(245)).toBe('4:05');
    expect(formatAudioDuration(3599)).toBe('59:59');
  });

  it('formats durations >= 1 hour as H:MM:SS', () => {
    expect(formatAudioDuration(3600)).toBe('1:00:00');
    expect(formatAudioDuration(3852)).toBe('1:04:12');
    expect(formatAudioDuration(8109)).toBe('2:15:09');
  });
});

describe('AudioPlayerOverlay', () => {
  it('renders zero gap-* or backdrop-blur classes across music, audiobook, and ambient dimmed modes', () => {
    const musicRender = render(<AudioPlayerOverlay {...createProps({ mediaType: 'music' })} />);
    assertNoForbiddenCssClasses(musicRender.container);
    musicRender.unmount();

    const bookRender = render(
      <AudioPlayerOverlay
        {...createProps({
          mediaType: 'audiobook',
          queue: undefined,
          currentIndex: undefined,
          playbackRate: 1.25,
          audioTracks: sampleAudioTracks,
          onOpenAudioModal: vi.fn(),
        })}
      />
    );
    assertNoForbiddenCssClasses(bookRender.container);
    bookRender.unmount();

    const dimmedRender = render(
      <AudioPlayerOverlay {...createProps({ isAmbientDimmed: true })} />
    );
    assertNoForbiddenCssClasses(dimmedRender.container);
  });

  it('displays elapsed, total, and remaining timestamps accurately including >= 1h durations', () => {
    render(
      <AudioPlayerOverlay
        {...createProps({
          mediaType: 'audiobook',
          positionMs: 309000, // 5:09
          durationMs: 8109000, // 2:15:09 -> remaining 2:10:00
        })}
      />
    );

    expect(screen.getByText('5:09')).toBeInTheDocument();
    expect(screen.getByText('2:15:09')).toBeInTheDocument();
    expect(screen.getByText('-2:10:00')).toBeInTheDocument();
  });

  it('renders cover art image and falls back cleanly to Music / BookOpen icons on missing URL or error', () => {
    const { rerender } = render(<AudioPlayerOverlay {...createProps()} />);
    const img = screen.getByRole('img', { name: 'Midnight Echoes' });
    expect(img).toHaveAttribute('src', 'https://kadr.local/cover.jpg');

    fireEvent.error(img);
    expect(screen.queryByRole('img', { name: 'Midnight Echoes' })).not.toBeInTheDocument();
    expect(screen.getByTestId('audio-cover-icon-music')).toBeInTheDocument();

    // Recovers when posterUrl updates to a new valid image
    rerender(
      <AudioPlayerOverlay
        {...createProps({
          mediaType: 'audiobook',
          title: 'Dune',
          posterUrl: 'https://kadr.local/dune.jpg',
        })}
      />
    );
    expect(screen.getByRole('img', { name: 'Dune' })).toBeInTheDocument();

    // Falls back to BookOpen icon when posterUrl is missing in audiobook mode
    rerender(
      <AudioPlayerOverlay
        {...createProps({
          mediaType: 'audiobook',
          title: 'Dune',
          posterUrl: undefined,
        })}
      />
    );
    expect(screen.getByTestId('audio-cover-icon-audiobook')).toBeInTheDocument();
  });

  it('renders Single-Item Details card when queue has <= 1 item and Live Queue when queue.length > 1', () => {
    const { rerender } = render(
      <AudioPlayerOverlay
        {...createProps({
          queue: [{ id: 1, title: 'Solo Track', durationSeconds: 200 }],
          currentIndex: 0,
        })}
      />
    );
    expect(screen.getByTestId('audio-details-card')).toBeInTheDocument();
    expect(screen.queryByTestId('audio-queue-column')).not.toBeInTheDocument();

    rerender(<AudioPlayerOverlay {...createProps({ queue: sampleQueue, currentIndex: 1 })} />);
    expect(screen.getByTestId('audio-queue-column')).toBeInTheDocument();
    expect(screen.getByText('Track 2 of 3')).toBeInTheDocument();
    expect(screen.getByTestId('audio-queue-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('audio-queue-item-1')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('audio-queue-item-2')).toBeInTheDocument();
  });

  describe.each(['standalone', 'with-focus-provider'] as const)(
    'D-pad navigation & controls (%s)',
    (mode) => {
      const renderOverlay = (overrides: Partial<AudioPlayerOverlayProps> = {}) => {
        const props = createProps(overrides);
        const ui =
          mode === 'with-focus-provider' ? (
            <FocusProvider>
              <FocusDebug />
              <AudioPlayerOverlay {...props} />
            </FocusProvider>
          ) : (
            <AudioPlayerOverlay {...props} />
          );
        return { props, ...render(ui) };
      };

      const assertFocused = (id: string) => {
        expect(document.activeElement?.id).toBe(id);
        expect(document.getElementById(id)).toHaveAttribute('data-focused', 'true');
        if (mode === 'with-focus-provider') {
          expect(screen.getByTestId('debug-focused-id')).toHaveTextContent(id);
        }
      };

      it('mounts with initial focus on audio-btn-play-pause and toggles play/pause on Enter', () => {
        const { props } = renderOverlay();
        assertFocused('audio-btn-play-pause');

        fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
        expect(props.onTogglePlayPause).toHaveBeenCalledTimes(1);
      });

      it('navigates between transport row and scrubber bar and seeks accurately for music vs audiobook', () => {
        const music = renderOverlay({ mediaType: 'music' });
        assertFocused('audio-btn-play-pause');

        fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
        assertFocused('audio-progress-bar');

        fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        expect(music.props.onSeekRelative).toHaveBeenNthCalledWith(1, -10000);
        expect(music.props.onSeekRelative).toHaveBeenNthCalledWith(2, 10000);
        expect(music.props.onSeekRelative).toHaveBeenNthCalledWith(3, 10000);
        // Must NOT escape to queue column on repeated ArrowRight
        assertFocused('audio-progress-bar');

        fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
        assertFocused('audio-btn-play-pause');
        music.unmount();

        const book = renderOverlay({ mediaType: 'audiobook', playbackRate: 1.25 });
        fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
        assertFocused('audio-progress-bar');
        fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        expect(book.props.onSeekRelative).toHaveBeenNthCalledWith(1, -15000);
        expect(book.props.onSeekRelative).toHaveBeenNthCalledWith(2, 30000);
        assertFocused('audio-progress-bar');
      });

      it('handles audio-btn-prev restart (>5s or !hasPrevious) vs previous (<=5s && hasPrevious)', () => {
        const overFive = renderOverlay({ positionMs: 5001, hasPrevious: true });
        fireEvent.click(screen.getByTestId('audio-btn-prev'));
        expect(overFive.props.onRestartTrack).toHaveBeenCalledTimes(1);
        expect(overFive.props.onPrevious).not.toHaveBeenCalled();
        overFive.unmount();

        const noPrev = renderOverlay({ positionMs: 2000, hasPrevious: false });
        fireEvent.click(screen.getByTestId('audio-btn-prev'));
        expect(noPrev.props.onRestartTrack).toHaveBeenCalledTimes(1);
        expect(noPrev.props.onPrevious).not.toHaveBeenCalled();
        noPrev.unmount();

        const atStartWithPrev = renderOverlay({ positionMs: 5000, hasPrevious: true });
        fireEvent.click(screen.getByTestId('audio-btn-prev'));
        expect(atStartWithPrev.props.onPrevious).toHaveBeenCalledTimes(1);
        expect(atStartWithPrev.props.onRestartTrack).not.toHaveBeenCalled();
      });

      it('renders audiobook speed button vs music repeat button and optional audio tracks button', () => {
        const book = renderOverlay({
          mediaType: 'audiobook',
          playbackRate: 1.25,
          audioTracks: sampleAudioTracks,
          onOpenAudioModal: vi.fn(),
        });
        expect(screen.getByTestId('audio-btn-speed')).toHaveTextContent('1.25x');
        expect(screen.queryByTestId('audio-btn-repeat')).not.toBeInTheDocument();
        expect(screen.getByTestId('audio-btn-tracks')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('audio-btn-speed'));
        expect(book.props.onCycleSpeed).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTestId('audio-btn-tracks'));
        expect(book.props.onOpenAudioModal).toHaveBeenCalledTimes(1);
        book.unmount();

        const music = renderOverlay({
          mediaType: 'music',
          repeatMode: 'all',
          audioTracks: [sampleAudioTracks[0]],
          onOpenAudioModal: vi.fn(),
        });
        expect(screen.getByTestId('audio-btn-repeat')).toHaveTextContent('Repeat: All');
        expect(screen.queryByTestId('audio-btn-speed')).not.toBeInTheDocument();
        expect(screen.queryByTestId('audio-btn-tracks')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('audio-btn-repeat'));
        expect(music.props.onCycleRepeat).toHaveBeenCalledTimes(1);
      });

      it('enters Live Up-Next Queue Column from rightmost transport control and returns cleanly', () => {
        const { props } = renderOverlay({
          mediaType: 'music',
          repeatMode: 'off',
          hasNext: true,
          currentIndex: 1,
        });

        // Play/Pause -> Forward -> Next -> Repeat
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        assertFocused('audio-btn-forward');
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        assertFocused('audio-btn-next');
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        assertFocused('audio-btn-repeat');

        // Enter queue column at currentIndex (1)
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        assertFocused('audio-queue-item-1');

        // Step down to item 2 and select with Enter
        fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
        assertFocused('audio-queue-item-2');
        fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
        expect(props.onSelectQueueIndex).toHaveBeenCalledWith(2);

        // Step up through queue
        fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
        assertFocused('audio-queue-item-1');
        fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
        assertFocused('audio-queue-item-0');

        // ArrowLeft returns to rightmost transport control (audio-btn-repeat)
        fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
        assertFocused('audio-btn-repeat');
      });

      it('skips disabled Next button during horizontal transport navigation and exits on Back', () => {
        const { props } = renderOverlay({
          mediaType: 'music',
          hasNext: false,
          repeatMode: 'off',
        });

        expect(screen.getByTestId('audio-btn-next')).toBeDisabled();

        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        assertFocused('audio-btn-forward');
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        assertFocused('audio-btn-repeat');

        fireEvent.keyDown(window, { key: 'Escape', keyCode: TVKeys.BACK_WEB });
        expect(props.onExit).toHaveBeenCalledTimes(1);
      });

      it('activates Back/Rewind/Forward/Next via Enter and clamps queue/row edges', () => {
        const { props } = renderOverlay({
          mediaType: 'audiobook',
          hasNext: false,
          repeatMode: 'all',
          queue: undefined,
          currentIndex: undefined,
        });

        // Next is enabled when repeatMode === 'all' even if hasNext === false
        expect(screen.getByTestId('audio-btn-next')).not.toBeDisabled();

        // Step right to Forward (+30s) -> Next -> Speed -> stay clamped (no queue)
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        assertFocused('audio-btn-forward');
        fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
        expect(props.onSeekRelative).toHaveBeenCalledWith(30000);

        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        assertFocused('audio-btn-next');
        fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
        expect(props.onNext).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        assertFocused('audio-btn-speed');
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        assertFocused('audio-btn-speed');

        // Step left all the way to Back (audio-btn-exit) and clamp at left edge
        fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT }); // next
        fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT }); // forward
        fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT }); // play-pause
        fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT }); // rewind
        fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
        expect(props.onSeekRelative).toHaveBeenCalledWith(-15000);

        fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT }); // prev
        fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT }); // exit
        assertFocused('audio-btn-exit');
        fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT }); // clamped
        assertFocused('audio-btn-exit');

        fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
        expect(props.onExit).toHaveBeenCalledTimes(1);
      });

      it('wraps Next to queue index 0 when !hasNext && repeatMode === "all" in multi-track queue', () => {
        const { props } = renderOverlay({
          mediaType: 'music',
          hasNext: false,
          repeatMode: 'all',
          currentIndex: 2,
        });

        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
        assertFocused('audio-btn-next');
        fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
        expect(props.onSelectQueueIndex).toHaveBeenCalledWith(0);
      });
    }
  );

  it('dims stage to 0.25 with ambient badge and ignores keys when isAmbientDimmed is true', () => {
    const props = createProps({ isAmbientDimmed: true });
    render(<AudioPlayerOverlay {...props} />);

    const stage = screen.getByTestId('audio-player-stage');
    expect(stage).toHaveAttribute('data-ambient-dimmed', 'true');
    expect(stage).toHaveStyle({ opacity: '0.25' });
    expect(screen.getByTestId('audio-ambient-badge')).toHaveTextContent(
      'Ambient Mode • Press any key to wake'
    );

    fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    fireEvent.keyDown(window, { key: 'Escape', keyCode: TVKeys.BACK_WEB });
    expect(props.onTogglePlayPause).not.toHaveBeenCalled();
    expect(props.onExit).not.toHaveBeenCalled();
  });

  it('ignores navigation keys while an aria-modal dialog is open above the overlay', () => {
    const props = createProps();
    render(
      <>
        <AudioPlayerOverlay {...props} />
        <div role="dialog" aria-modal="true" />
      </>
    );

    fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    fireEvent.keyDown(window, { key: 'Escape', keyCode: TVKeys.BACK_WEB });
    expect(props.onTogglePlayPause).not.toHaveBeenCalled();
    expect(props.onExit).not.toHaveBeenCalled();
  });

  it('restores overlay focus cleanly after AudioTrackModal opens and closes inside FocusProvider', () => {
    const onOpenAudioModal = vi.fn();
    const props = createProps({
      audioTracks: sampleAudioTracks,
      onOpenAudioModal,
    });

    const { rerender } = render(
      <FocusProvider>
        <FocusDebug />
        <AudioPlayerOverlay {...props} />
      </FocusProvider>
    );

    // Move focus to audio-btn-tracks
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT }); // forward
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT }); // next
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT }); // repeat
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT }); // tracks
    expect(screen.getByTestId('debug-focused-id')).toHaveTextContent('audio-btn-tracks');

    // Open AudioTrackModal above AudioPlayerOverlay
    rerender(
      <FocusProvider>
        <FocusDebug />
        <AudioPlayerOverlay {...props} />
        <AudioTrackModal
          isOpen={true}
          audioTracks={sampleAudioTracks}
          selectedAudioTrackIndex={0}
          onSelectAudioTrack={vi.fn()}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );
    expect(screen.getByTestId('debug-focused-id')).toHaveTextContent('audio-track-btn-0');

    // Close AudioTrackModal -> focus returns cleanly to audio-btn-tracks
    rerender(
      <FocusProvider>
        <FocusDebug />
        <AudioPlayerOverlay {...props} />
      </FocusProvider>
    );
    expect(screen.getByTestId('debug-focused-id')).toHaveTextContent('audio-btn-tracks');
    expect(document.activeElement?.id).toBe('audio-btn-tracks');
  });
});
