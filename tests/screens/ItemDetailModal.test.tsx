import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { ItemDetailModal } from '../../src/screens/ItemDetailModal';
import { MediaItemDetail, fetchMediaItem } from '../../src/api/items';
import { ApiClient } from '../../src/api/client';
import { TVButton } from '../../src/components/tv/TVButton';
import { TVKeys } from '../../src/navigation/keys';

describe('ItemDetailModal', () => {
  const mockMovieWithResume: MediaItemDetail = {
    id: 'movie-1',
    title: 'Interstellar',
    overview: 'A team of explorers travel through a wormhole in space.',
    release_year: 2014,
    duration_ms: 10140000, // 169 minutes
    resume_position_ms: 3600000, // 60 minutes
    media_type: 'movie',
    resolution: '4K',
    poster_url: '/images/interstellar-poster.jpg',
    backdrop_url: '/images/interstellar-backdrop.jpg',
  };

  const mockMovieWithoutResume: MediaItemDetail = {
    id: 'movie-2',
    title: 'Inception',
    overview: 'A thief who steals corporate secrets through the use of dream-sharing technology.',
    release_year: 2010,
    duration_ms: 8880000, // 148 minutes
    resume_position_ms: 0,
    media_type: 'movie',
    resolution: '1080p',
    poster_url: '/images/inception-poster.jpg',
    backdrop_url: '/images/inception-backdrop.jpg',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders movie details with Resume button when resume_position_ms > 0', () => {
    const onPlay = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <ItemDetailModal
          isOpen={true}
          item={mockMovieWithResume}
          serverUrl="http://localhost:8492"
          onPlay={onPlay}
          onClose={onClose}
        />
      </FocusProvider>
    );

    // Title & overview
    expect(screen.getByText('Interstellar')).toBeInTheDocument();
    expect(
      screen.getByText('A team of explorers travel through a wormhole in space.')
    ).toBeInTheDocument();

    // Metadata
    expect(screen.getByText('2014')).toBeInTheDocument();
    expect(screen.getByText(/169m/i)).toBeInTheDocument();
    expect(screen.getByText('4K')).toBeInTheDocument();

    // Images
    const images = screen.getAllByAltText('Interstellar');
    expect(images.length).toBe(2); // backdrop and poster
    const posterImg = images.find((img) => img.getAttribute('src')?.includes('poster'));
    expect(posterImg).toHaveAttribute(
      'src',
      'http://localhost:8492/images/interstellar-poster.jpg'
    );

    // Action buttons
    expect(screen.getByText(/Resume \(60m\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Play from Beginning/i)).toBeInTheDocument();
    expect(screen.getByText(/Back/i)).toBeInTheDocument();

    // Plain Play button should NOT be present when resume position exists
    expect(screen.queryByRole('button', { name: /^Play$/i })).not.toBeInTheDocument();
  });

  it('renders Play button when resume_position_ms is 0 or undefined', () => {
    const onPlay = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <FocusProvider>
        <ItemDetailModal
          isOpen={true}
          item={mockMovieWithoutResume}
          serverUrl="http://localhost:8492"
          onPlay={onPlay}
          onClose={onClose}
        />
      </FocusProvider>
    );

    expect(screen.getByText('Inception')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play/i })).toBeInTheDocument();
    expect(screen.queryByText(/Resume/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Play from Beginning/i)).not.toBeInTheDocument();

    // Re-render with resume_position_ms undefined
    const itemWithoutResumeField: MediaItemDetail = {
      ...mockMovieWithoutResume,
      resume_position_ms: undefined,
    };

    rerender(
      <FocusProvider>
        <ItemDetailModal
          isOpen={true}
          item={itemWithoutResumeField}
          serverUrl="http://localhost:8492"
          onPlay={onPlay}
          onClose={onClose}
        />
      </FocusProvider>
    );

    expect(screen.getByRole('button', { name: /Play/i })).toBeInTheDocument();
    expect(screen.queryByText(/Resume/i)).not.toBeInTheDocument();
  });

  it('calls onPlay with itemId and resume_position_ms when Resume button is clicked', () => {
    const onPlay = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <ItemDetailModal
          isOpen={true}
          item={mockMovieWithResume}
          serverUrl="http://localhost:8492"
          onPlay={onPlay}
          onClose={onClose}
        />
      </FocusProvider>
    );

    const resumeBtn = screen.getByText(/Resume/i);
    fireEvent.click(resumeBtn);

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith('movie-1', 3600000);
  });

  it('calls onPlay with itemId and 0 when Play from Beginning button is clicked', () => {
    const onPlay = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <ItemDetailModal
          isOpen={true}
          item={mockMovieWithResume}
          serverUrl="http://localhost:8492"
          onPlay={onPlay}
          onClose={onClose}
        />
      </FocusProvider>
    );

    const restartBtn = screen.getByText(/Play from Beginning/i);
    fireEvent.click(restartBtn);

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith('movie-1', 0);
  });

  it('calls onPlay with itemId and 0 when standard Play button is clicked', () => {
    const onPlay = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <ItemDetailModal
          isOpen={true}
          item={mockMovieWithoutResume}
          serverUrl="http://localhost:8492"
          onPlay={onPlay}
          onClose={onClose}
        />
      </FocusProvider>
    );

    const playBtn = screen.getByRole('button', { name: /Play/i });
    fireEvent.click(playBtn);

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith('movie-2', 0);
  });

  it('calls onClose when Back button is clicked', () => {
    const onPlay = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <ItemDetailModal
          isOpen={true}
          item={mockMovieWithResume}
          serverUrl="http://localhost:8492"
          onPlay={onPlay}
          onClose={onClose}
        />
      </FocusProvider>
    );

    const backBtn = screen.getByRole('button', { name: /Back/i });
    fireEvent.click(backBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when remote Back keys (Tizen, Web, Escape) are pressed', () => {
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <ItemDetailModal
          isOpen={true}
          item={mockMovieWithResume}
          serverUrl="http://localhost:8492"
          onPlay={vi.fn()}
          onClose={onClose}
        />
      </FocusProvider>
    );

    // Press Tizen Back key
    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Press Web Back key
    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_WEB });
    expect(onClose).toHaveBeenCalledTimes(2);

    // Press Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <FocusProvider>
        <ItemDetailModal
          isOpen={false}
          item={mockMovieWithResume}
          serverUrl="http://localhost:8492"
          onPlay={vi.fn()}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('returns null when item is null', () => {
    const { container } = render(
      <FocusProvider>
        <ItemDetailModal
          isOpen={true}
          item={null}
          serverUrl="http://localhost:8492"
          onPlay={vi.fn()}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders gracefully when optional fields are omitted', () => {
    const minimalItem: MediaItemDetail = {
      id: 'minimal-1',
      title: 'Minimal Movie',
      media_type: 'movie',
    };

    render(
      <FocusProvider>
        <ItemDetailModal
          isOpen={true}
          item={minimalItem}
          serverUrl="http://localhost:8492/"
          onPlay={vi.fn()}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.getByText('Minimal Movie')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
  });

  it('traps focus inside the modal and restores prior focus upon exit', () => {
    function HostComponent() {
      const { focusedId } = useFocusContext();
      const [isOpen, setIsOpen] = React.useState(false);

      return (
        <div>
          <div data-testid="focused-id">{focusedId}</div>
          <TVButton id="browse-card-1" groupId="browse-content" autoFocus>
            Browse Item 1
          </TVButton>
          <button data-testid="open-modal-btn" onClick={() => setIsOpen(true)}>
            Open
          </button>
          <ItemDetailModal
            isOpen={isOpen}
            item={mockMovieWithResume}
            serverUrl="http://localhost:8492"
            onPlay={vi.fn()}
            onClose={() => setIsOpen(false)}
          />
        </div>
      );
    }

    render(
      <FocusProvider>
        <HostComponent />
      </FocusProvider>
    );

    // Initial focus is on browse-card-1
    expect(screen.getByTestId('focused-id').textContent).toBe('browse-card-1');

    // Open modal
    act(() => {
      screen.getByTestId('open-modal-btn').click();
    });

    // Focus is trapped inside item-detail-modal
    expect(screen.getByTestId('focused-id').textContent).toBe('detail-resume-btn');

    // Arrow navigation within modal
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(screen.getByTestId('focused-id').textContent).toBe('detail-restart-btn');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(screen.getByTestId('focused-id').textContent).toBe('detail-close-btn');

    // Close modal via Back key
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    });

    // Previous focus restored cleanly to browse-card-1
    expect(screen.getByTestId('focused-id').textContent).toBe('browse-card-1');
  });

  describe('fetchMediaItem', () => {
    it('fetches media item from /api/v1/items/:id', async () => {
      const client = new ApiClient('http://localhost:8492');
      const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue(mockMovieWithResume);

      const result = await fetchMediaItem(client, 'movie-1');

      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/items/movie-1');
      expect(result).toEqual(mockMovieWithResume);
    });
  });
});
