import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AudioTrackModal } from '../../../src/components/player/AudioTrackModal';
import { FocusProvider, useFocusContext } from '../../../src/navigation/FocusContext';
import { TVKeys } from '../../../src/navigation/keys';
import type { AudioStreamInfo } from '../../../src/types/kadr';

function FocusDebug() {
  const { focusedId, activeTrap } = useFocusContext();
  return (
    <div>
      <span data-testid="debug-focused-id">{focusedId ?? ''}</span>
      <span data-testid="debug-active-trap">{activeTrap ?? ''}</span>
    </div>
  );
}

const mockAudioTracks: AudioStreamInfo[] = [
  {
    audio_index: 0,
    stream_index: 1,
    codec: 'aac',
    channels: 2,
    language: 'jpn',
    is_default: true,
    is_commentary: false,
  },
  {
    audio_index: 1,
    stream_index: 2,
    codec: 'eac3',
    channels: 6,
    language: 'eng',
    is_default: false,
    is_commentary: true,
  },
];

describe('AudioTrackModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <FocusProvider>
        <AudioTrackModal
          isOpen={false}
          audioTracks={mockAudioTracks}
          selectedAudioTrackIndex={1}
          onSelectAudioTrack={vi.fn()}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it('renders zero gap-* classes and no backdrop-blur-* classes', () => {
    const { container } = render(
      <FocusProvider>
        <AudioTrackModal
          isOpen={true}
          audioTracks={mockAudioTracks}
          selectedAudioTrackIndex={1}
          onSelectAudioTrack={vi.fn()}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    const allElements = Array.from(container.querySelectorAll('*'));
    for (const el of allElements) {
      const cls = el.className;
      if (typeof cls === 'string') {
        expect(cls).not.toMatch(/\bgap-/);
        expect(cls).not.toMatch(/\bbackdrop-blur/);
      }
    }
  });

  it('pushes FocusContext trap "audio-modal" and focuses the active track button on open', () => {
    render(
      <FocusProvider>
        <FocusDebug />
        <AudioTrackModal
          isOpen={true}
          audioTracks={mockAudioTracks}
          selectedAudioTrackIndex={1}
          onSelectAudioTrack={vi.fn()}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.getByTestId('debug-active-trap')).toHaveTextContent('audio-modal');
    expect(screen.getByTestId('debug-focused-id')).toHaveTextContent('audio-track-btn-1');
    expect(document.activeElement?.id).toBe('audio-track-btn-1');
  });

  it('displays formatted labels and badges for audio tracks and active track', () => {
    render(
      <FocusProvider>
        <AudioTrackModal
          isOpen={true}
          audioTracks={mockAudioTracks}
          selectedAudioTrackIndex={1}
          onSelectAudioTrack={vi.fn()}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.getByText('Japanese')).toBeInTheDocument();
    expect(screen.getByText('2.0 AAC')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('5.1 EAC3')).toBeInTheDocument();
    expect(screen.getByText('Commentary')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('navigates via ArrowUp / ArrowDown with wrap-around and selects track on Enter', () => {
    const onSelectAudioTrack = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <FocusDebug />
        <AudioTrackModal
          isOpen={true}
          audioTracks={mockAudioTracks}
          selectedAudioTrackIndex={1}
          onSelectAudioTrack={onSelectAudioTrack}
          onClose={onClose}
        />
      </FocusProvider>
    );

    // Initially focused on track 1 (index 1 in [btn-0, btn-1, close])
    expect(screen.getByTestId('debug-focused-id')).toHaveTextContent('audio-track-btn-1');

    // ArrowDown moves to close button
    fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    expect(screen.getByTestId('debug-focused-id')).toHaveTextContent('audio-modal-close-btn');

    // ArrowDown wraps around to track 0
    fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    expect(screen.getByTestId('debug-focused-id')).toHaveTextContent('audio-track-btn-0');

    // ArrowUp wraps back to close button, then ArrowDown returns to track 0
    fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    expect(screen.getByTestId('debug-focused-id')).toHaveTextContent('audio-modal-close-btn');
    fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    expect(screen.getByTestId('debug-focused-id')).toHaveTextContent('audio-track-btn-0');

    // Enter selects track 0 and closes modal
    fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    expect(onSelectAudioTrack).toHaveBeenCalledWith(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses on TVKeys.BACK_TIZEN (10009) with stopImmediatePropagation without invoking parent listeners', () => {
    const onClose = vi.fn();
    const parentListener = vi.fn();
    window.addEventListener('keydown', parentListener);

    try {
      render(
        <FocusProvider>
          <AudioTrackModal
            isOpen={true}
            audioTracks={mockAudioTracks}
            selectedAudioTrackIndex={1}
            onSelectAudioTrack={vi.fn()}
            onClose={onClose}
          />
        </FocusProvider>
      );

      fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(parentListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', parentListener);
    }
  });
});
