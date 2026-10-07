import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { ImageViewerModal } from '../../src/screens/ImageViewerModal';
import { FolderImage } from '../../src/types/kadr';
import { TVKeys } from '../../src/navigation/keys';

describe('ImageViewerModal', () => {
  const mockImages: FolderImage[] = [
    {
      name: 'vacation_1.jpg',
      path: 'photos/vacation_1.jpg',
      url: '/images/vacation_1.jpg',
      size_bytes: 1048576, // 1.0 MB
    },
    {
      name: 'vacation_2.jpg',
      path: 'photos/vacation_2.jpg',
      url: '/images/vacation_2.jpg',
      size_bytes: 2097152, // 2.0 MB
    },
    {
      name: 'vacation_3.png',
      path: 'photos/vacation_3.png',
      url: 'https://cdn.example.com/photos/vacation_3.png',
      size_bytes: 512000, // 500 KB
    },
  ];

  const serverUrl = 'http://localhost:8492';

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders image, name, counter, file size, and controls HUD', () => {
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <ImageViewerModal
          images={mockImages}
          initialIndex={0}
          autoPlay={false}
          serverUrl={serverUrl}
          onClose={onClose}
        />
      </FocusProvider>
    );

    // Image name and counter
    expect(screen.getByText('vacation_1.jpg')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByText('1.0 MB')).toBeInTheDocument();

    // Image element with resolved URL
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'http://localhost:8492/images/vacation_1.jpg');
    expect(img).toHaveAttribute('alt', 'vacation_1.jpg');

    // Bottom HUD controls & status
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText(/◄ \/ ► Navigate/)).toBeInTheDocument();
  });

  it('auto-advances every 4 seconds in autoPlay mode with wraparound', () => {
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <ImageViewerModal
          images={mockImages}
          initialIndex={0}
          autoPlay={true}
          serverUrl={serverUrl}
          onClose={onClose}
        />
      </FocusProvider>
    );

    expect(screen.getByText('vacation_1.jpg')).toBeInTheDocument();
    expect(screen.getByText('Playing Slideshow (4s)')).toBeInTheDocument();

    // Advance 4 seconds -> image 2
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText('vacation_2.jpg')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    // Advance 4 seconds -> image 3
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText('vacation_3.png')).toBeInTheDocument();
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/photos/vacation_3.png'
    );

    // Advance 4 seconds -> wraps around to image 1
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText('vacation_1.jpg')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('navigates manually with Left and Right arrow keys with wraparound', () => {
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <ImageViewerModal
          images={mockImages}
          initialIndex={0}
          autoPlay={false}
          serverUrl={serverUrl}
          onClose={onClose}
        />
      </FocusProvider>
    );

    expect(screen.getByText('vacation_1.jpg')).toBeInTheDocument();

    // ArrowRight advances to index 1
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(screen.getByText('vacation_2.jpg')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    // ArrowRight advances to index 2
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(screen.getByText('vacation_3.png')).toBeInTheDocument();
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    // ArrowRight wraps to index 0
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(screen.getByText('vacation_1.jpg')).toBeInTheDocument();

    // ArrowLeft wraps backwards to index 2
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(screen.getByText('vacation_3.png')).toBeInTheDocument();

    // ArrowLeft goes back to index 1
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(screen.getByText('vacation_2.jpg')).toBeInTheDocument();
  });

  it('toggles slideshow play/pause on Enter and MediaPlayPause keys', () => {
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <ImageViewerModal
          images={mockImages}
          initialIndex={0}
          autoPlay={false}
          serverUrl={serverUrl}
          onClose={onClose}
        />
      </FocusProvider>
    );

    expect(screen.getByText('Paused')).toBeInTheDocument();

    // Press Enter to start slideshow
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(screen.getByText('Playing Slideshow (4s)')).toBeInTheDocument();

    // Advance 4s -> advances
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText('vacation_2.jpg')).toBeInTheDocument();

    // Press MediaPlayPause to pause
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'MediaPlayPause', keyCode: TVKeys.PLAY_PAUSE, bubbles: true })
      );
    });
    expect(screen.getByText('Paused')).toBeInTheDocument();

    // Advancing 8s while paused does NOT change image
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.getByText('vacation_2.jpg')).toBeInTheDocument();
  });

  it('resets the 4-second slideshow timer when manual navigation occurs', () => {
    render(
      <FocusProvider>
        <ImageViewerModal
          images={mockImages}
          initialIndex={0}
          autoPlay={true}
          serverUrl={serverUrl}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.getByText('vacation_1.jpg')).toBeInTheDocument();

    // Wait 3 seconds (1 second before auto-advance)
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('vacation_1.jpg')).toBeInTheDocument();

    // Manually navigate right to index 1
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(screen.getByText('vacation_2.jpg')).toBeInTheDocument();

    // If timer wasn't reset, after 1 more second (total 4s from start) it would advance to index 2
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // It should still be at index 2 because timer was reset!
    expect(screen.getByText('vacation_2.jpg')).toBeInTheDocument();

    // Advance another 3 seconds (total 4 seconds since manual navigation)
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('vacation_3.png')).toBeInTheDocument();
  });

  it('auto-hides HUD controls after 3 seconds of inactivity and reappears on keydown', () => {
    const { container } = render(
      <FocusProvider>
        <ImageViewerModal
          images={mockImages}
          initialIndex={0}
          autoPlay={false}
          serverUrl={serverUrl}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    const hudHeader = container.querySelector('[data-testid="hud-header"]');
    expect(hudHeader).not.toHaveClass('opacity-0');

    // Advance 3 seconds of inactivity
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(hudHeader).toHaveClass('opacity-0');

    // Press any key to bring HUD back
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(hudHeader).not.toHaveClass('opacity-0');
  });

  it('closes modal on Back and Escape keys', () => {
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <ImageViewerModal
          images={mockImages}
          initialIndex={0}
          autoPlay={false}
          serverUrl={serverUrl}
          onClose={onClose}
        />
      </FocusProvider>
    );

    // Escape key
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', keyCode: TVKeys.BACK_WEB, bubbles: true })
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Tizen Back key
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_TIZEN, bubbles: true })
      );
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    // Backspace key
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', keyCode: TVKeys.BACKSPACE, bubbles: true })
      );
    });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('pushes focus trap on mount and pops focus trap on unmount', () => {
    function Wrapper() {
      const [show, setShow] = useState(true);
      const { activeTrap } = useFocusContext();

      return (
        <div>
          <div data-testid="trap-value">{activeTrap ?? 'none'}</div>
          <button data-testid="toggle-btn" onClick={() => setShow(false)}>
            Close
          </button>
          {show && (
            <ImageViewerModal
              images={mockImages}
              initialIndex={0}
              serverUrl={serverUrl}
              onClose={vi.fn()}
            />
          )}
        </div>
      );
    }

    render(
      <FocusProvider>
        <Wrapper />
      </FocusProvider>
    );

    expect(screen.getByTestId('trap-value')).toHaveTextContent('image-viewer-modal');

    act(() => {
      fireEvent.click(screen.getByTestId('toggle-btn'));
    });

    expect(screen.getByTestId('trap-value')).toHaveTextContent('none');
  });

  it('handles empty images array gracefully without crashing', () => {
    const { container } = render(
      <FocusProvider>
        <ImageViewerModal
          images={[]}
          serverUrl={serverUrl}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('clamps out-of-bounds initialIndex within valid bounds', () => {
    render(
      <FocusProvider>
        <ImageViewerModal
          images={mockImages}
          initialIndex={999}
          serverUrl={serverUrl}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    // Clamped to last index (2) -> vacation_3.png
    expect(screen.getByText('vacation_3.png')).toBeInTheDocument();
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });

  it('handles single image without infinite loop or crash in autoPlay', () => {
    render(
      <FocusProvider>
        <ImageViewerModal
          images={[mockImages[0]]}
          autoPlay={true}
          serverUrl={serverUrl}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.getByText('vacation_1.jpg')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.getByText('vacation_1.jpg')).toBeInTheDocument();
  });
});
