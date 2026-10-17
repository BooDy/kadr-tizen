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

  it('renders bottom filmstrip thumbnail carousel displaying neighboring photos', () => {
    const images = [
      { name: 'photo-1.jpg', path: 'photo-1.jpg', url: '/img/1.jpg', size_bytes: 1000 },
      { name: 'photo-2.jpg', path: 'photo-2.jpg', url: '/img/2.jpg', size_bytes: 2000 },
      { name: 'photo-3.jpg', path: 'photo-3.jpg', url: '/img/3.jpg', size_bytes: 3000 },
    ];

    render(
      <FocusProvider>
        <ImageViewerModal
          images={images}
          initialIndex={1}
          serverUrl="http://localhost:8492"
          token="test-jwt"
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    const carousel = screen.getByTestId('filmstrip-carousel');
    expect(carousel).toBeInTheDocument();
    const thumbnails = screen.getAllByTestId(/^filmstrip-thumb-/);
    expect(thumbnails).toHaveLength(3);
    expect(screen.getByTestId('filmstrip-thumb-1')).toHaveClass('border-[#FF6B00]');
  });

  it('navigates into filmstrip on ArrowDown and scrolls thumbnails with live preview on ArrowRight/ArrowLeft', () => {
    const images = [
      { name: 'photo-1.jpg', path: 'photo-1.jpg', url: '/img/1.jpg', size_bytes: 1000 },
      { name: 'photo-2.jpg', path: 'photo-2.jpg', url: '/img/2.jpg', size_bytes: 2000 },
    ];

    render(
      <FocusProvider>
        <ImageViewerModal
          images={images}
          initialIndex={0}
          serverUrl="http://localhost:8492"
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    // Press ArrowDown to focus filmstrip
    fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    expect(screen.getByTestId('filmstrip-thumb-0')).toHaveFocus();

    // Press ArrowRight while in filmstrip to scrub to next photo
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    expect(screen.getByText('photo-2.jpg')).toBeInTheDocument();
    expect(screen.getByTestId('filmstrip-thumb-1')).toHaveClass('border-[#FF6B00]');

    // Press ArrowLeft to scrub back to first photo
    fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    expect(screen.getByText('photo-1.jpg')).toBeInTheDocument();
    expect(screen.getByTestId('filmstrip-thumb-0')).toHaveClass('border-[#FF6B00]');
  });

  it('exits filmstrip focus on ArrowUp, Enter, and Back/Escape without closing modal', () => {
    const onClose = vi.fn();
    const images = [
      { name: 'photo-1.jpg', path: 'photo-1.jpg', url: '/img/1.jpg', size_bytes: 1000 },
      { name: 'photo-2.jpg', path: 'photo-2.jpg', url: '/img/2.jpg', size_bytes: 2000 },
    ];

    render(
      <FocusProvider>
        <ImageViewerModal
          images={images}
          initialIndex={0}
          serverUrl="http://localhost:8492"
          onClose={onClose}
        />
      </FocusProvider>
    );

    // Focus filmstrip with ArrowDown
    fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    expect(screen.getByTestId('filmstrip-thumb-0')).toHaveFocus();

    // Press ArrowUp to exit filmstrip
    fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    expect(screen.getByTestId('filmstrip-thumb-0')).not.toHaveFocus();

    // Re-focus filmstrip
    fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    expect(screen.getByTestId('filmstrip-thumb-0')).toHaveFocus();

    // Press Enter to exit filmstrip
    fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    expect(screen.getByTestId('filmstrip-thumb-0')).not.toHaveFocus();
    // Verify modal is still open
    expect(onClose).not.toHaveBeenCalled();

    // Re-focus filmstrip
    fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    expect(screen.getByTestId('filmstrip-thumb-0')).toHaveFocus();

    // Press Escape to exit filmstrip without closing modal
    fireEvent.keyDown(window, { key: 'Escape', keyCode: TVKeys.BACK_WEB });
    expect(screen.getByTestId('filmstrip-thumb-0')).not.toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();

    // Press Escape again now that filmstrip is unfocused -> modal closes
    fireEvent.keyDown(window, { key: 'Escape', keyCode: TVKeys.BACK_WEB });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses authenticated image URLs with token and unlock tokens for main image and thumbnails', () => {
    const images = [
      { name: 'secret_1.jpg', path: 'secret_1.jpg', url: '/img/secret_1.jpg', size_bytes: 1000 },
    ];

    const mockClient = {
      getUnlockTokens: () => ['unlock-secret-token'],
    } as any;

    render(
      <FocusProvider>
        <ImageViewerModal
          images={images}
          initialIndex={0}
          serverUrl="http://localhost:8492"
          token="test-auth-token"
          client={mockClient}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    const mainImg = screen.getByRole('img');
    expect(mainImg).toHaveAttribute(
      'src',
      'http://localhost:8492/img/secret_1.jpg?token=test-auth-token&unlocked=unlock-secret-token'
    );

    const thumbImg = screen.getByTestId('filmstrip-thumb-0').querySelector('img');
    expect(thumbImg).toHaveAttribute(
      'src',
      'http://localhost:8492/img/secret_1.jpg?token=test-auth-token&unlocked=unlock-secret-token'
    );
  });

  it('does not auto-hide HUD controls or filmstrip after 3 seconds while filmstrip is focused, and resumes auto-hide on exit', () => {
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
    const filmstrip = container.querySelector('[data-testid="filmstrip-carousel"]');
    expect(hudHeader).not.toHaveClass('opacity-0');
    expect(filmstrip).not.toHaveClass('opacity-0');

    // Focus filmstrip using ArrowDown
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: TVKeys.DOWN, bubbles: true })
      );
    });

    // Advance 5 seconds while filmstrip is focused
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Controls and filmstrip must remain visible!
    expect(hudHeader).not.toHaveClass('opacity-0');
    expect(filmstrip).not.toHaveClass('opacity-0');

    // Exit filmstrip using ArrowUp
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', keyCode: TVKeys.UP, bubbles: true })
      );
    });

    // Still visible immediately
    expect(hudHeader).not.toHaveClass('opacity-0');

    // Advance 3 seconds of inactivity after exiting filmstrip
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Controls must now auto-hide!
    expect(hudHeader).toHaveClass('opacity-0');
    expect(filmstrip).toHaveClass('opacity-0');
  });

  it('renders fallback icon when main image fails to load, and resets error on navigation', () => {
    render(
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

    const mainImg = screen.getByRole('img');
    expect(mainImg).toBeInTheDocument();
    expect(screen.queryByTestId('viewer-image-fallback')).not.toBeInTheDocument();

    // Trigger image loading failure
    act(() => {
      fireEvent.error(mainImg);
    });

    expect(screen.getByTestId('viewer-image-fallback')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    // Navigate to next image
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: TVKeys.RIGHT, bubbles: true })
      );
    });

    // New image should display without error fallback
    expect(screen.queryByTestId('viewer-image-fallback')).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'http://localhost:8492/images/vacation_2.jpg'
    );
  });

  it('renders fallback icon when thumbnail image encounters an error', () => {
    render(
      <FocusProvider>
        <ImageViewerModal
          images={mockImages}
          initialIndex={0}
          serverUrl={serverUrl}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    const thumbBtn = screen.getByTestId('filmstrip-thumb-0');
    const thumbImg = thumbBtn.querySelector('img');
    expect(thumbImg).toBeInTheDocument();

    act(() => {
      fireEvent.error(thumbImg!);
    });

    expect(thumbBtn.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('filmstrip-fallback-icon')).toBeInTheDocument();
  });

  it('toggles slideshow play/pause on Space key in main view and exits filmstrip when focused', () => {
    render(
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

    expect(screen.getByText('Paused')).toBeInTheDocument();

    // Press Space key to play
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true })
      );
    });
    expect(screen.getByText('Playing Slideshow (4s)')).toBeInTheDocument();

    // Press Space key again to pause
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true })
      );
    });
    expect(screen.getByText('Paused')).toBeInTheDocument();

    // Focus filmstrip with ArrowDown
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: TVKeys.DOWN, bubbles: true })
      );
    });
    expect(screen.getByTestId('filmstrip-thumb-0')).toHaveFocus();

    // Press Space while filmstrip is focused -> exits filmstrip, does NOT toggle slideshow
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true })
      );
    });
    expect(screen.getByTestId('filmstrip-thumb-0')).not.toHaveFocus();
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });
});
