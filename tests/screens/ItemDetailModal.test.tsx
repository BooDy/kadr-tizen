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
    expect(screen.getByRole('button', { name: /^Play$/i })).toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: /^Play$/i })).toBeInTheDocument();
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

    const playBtn = screen.getByRole('button', { name: /^Play$/i });
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
    expect(screen.getByRole('button', { name: /^Play$/i })).toBeInTheDocument();
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
    expect(screen.getByTestId('focused-id').textContent).toBe('detail-add-playlist-btn');

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

    it('supports numeric item ID', async () => {
      const client = new ApiClient('http://localhost:8492');
      const numericItem = { ...mockMovieWithResume, id: 101 };
      const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue(numericItem);

      const result = await fetchMediaItem(client, 101);

      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/items/101');
      expect(result.id).toBe(101);
    });
  });

  it('supports numeric item ID and passes numeric id to onPlay', () => {
    const onPlay = vi.fn();
    const onClose = vi.fn();
    const numericItem: MediaItemDetail = {
      ...mockMovieWithoutResume,
      id: 42,
    };

    render(
      <FocusProvider>
        <ItemDetailModal
          isOpen={true}
          item={numericItem}
          serverUrl="http://localhost:8492"
          onPlay={onPlay}
          onClose={onClose}
        />
      </FocusProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /^Play$/i }));
    expect(onPlay).toHaveBeenCalledWith(42, 0);
  });

  describe('TV Show Multi-Season & Episode Carousel', () => {
    const mockShowDetail: MediaItemDetail = {
      id: 205,
      title: 'Severance',
      card: {
        id: 205,
        title: 'Severance',
        media_type: 'show',
      },
      overview: 'Mark leads a team of office workers whose memories have been surgically divided.',
      stream_url: '/api/v1/stream/205',
      library_id: 'lib-shows',
      folder_path: 'Severance',
      episodes: [
        {
          id: 206,
          title: 'Good News About Hell',
          subtitle: 'S01E01 - Severance',
          season: 1,
          episode: 1,
          playback_progress: 1.0,
        },
        {
          id: 207,
          title: 'Half Loop',
          subtitle: 'S01E02 - Severance',
          season: 1,
          episode: 2,
          playback_progress: 0.3,
          badge: 'RESUME',
        },
        {
          id: 301,
          title: 'Season 2 Premiere',
          subtitle: 'S02E01 - Severance',
          season: 2,
          episode: 1,
        },
      ],
    };

    it('renders season tabs and filters episode cards for TV shows', async () => {
      const onPlay = vi.fn();
      const onBrowseFolder = vi.fn();

      render(
        <FocusProvider>
          <ItemDetailModal
            item={mockShowDetail}
            serverUrl="http://localhost:8492"
            onClose={vi.fn()}
            onPlay={onPlay}
            onBrowseFolder={onBrowseFolder}
          />
        </FocusProvider>
      );

      expect(screen.getByText('Season 1')).toBeInTheDocument();
      expect(screen.getByText('Season 2')).toBeInTheDocument();
      expect(screen.getByText('Good News About Hell')).toBeInTheDocument();
      expect(screen.getByText('Half Loop')).toBeInTheDocument();
      expect(screen.queryByText('Season 2 Premiere')).not.toBeInTheDocument();

      // Browse Folder button
      const browseFolderBtn = screen.getByRole('button', { name: /browse folder/i });
      expect(browseFolderBtn).toBeInTheDocument();
      fireEvent.click(browseFolderBtn);
      expect(onBrowseFolder).toHaveBeenCalledWith('lib-shows', 'Severance');

      // Switch to Season 2
      fireEvent.click(screen.getByText('Season 2'));
      expect(screen.getByText('Season 2 Premiere')).toBeInTheDocument();
      expect(screen.queryByText('Good News About Hell')).not.toBeInTheDocument();
    });

    it('triggers 1-click episode playback with correct progress offset', () => {
      const onPlay = vi.fn();

      render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={mockShowDetail}
            serverUrl="http://localhost:8492"
            onClose={vi.fn()}
            onPlay={onPlay}
          />
        </FocusProvider>
      );

      // Half Loop has 0.3 playback progress -> Math.round(0.3 * 100) = 30
      const ep2Card = screen.getByText('Half Loop');
      fireEvent.click(ep2Card);
      expect(onPlay).toHaveBeenCalledWith(207, 30, 'Half Loop', undefined, expect.any(Array), 1);

      // Switch to Season 2 and click episode with no progress
      fireEvent.click(screen.getByText('Season 2'));
      const s2Ep1Card = screen.getByText('Season 2 Premiere');
      fireEvent.click(s2Ep1Card);
      expect(onPlay).toHaveBeenCalledWith(301, 0, 'Season 2 Premiere', undefined, expect.any(Array), 2);
    });

    it('renders primary Resume Next button targeting the first in-progress episode', () => {
      const onPlay = vi.fn();

      render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={mockShowDetail}
            serverUrl="http://localhost:8492"
            onClose={vi.fn()}
            onPlay={onPlay}
          />
        </FocusProvider>
      );

      const resumeBtn = screen.getByRole('button', { name: /Resume Next/i });
      expect(resumeBtn).toBeInTheDocument();
      fireEvent.click(resumeBtn);
      // Episode 207 is first unfinished/in-progress episode
      expect(onPlay).toHaveBeenCalledWith(207, 30, 'Half Loop', undefined, expect.any(Array), 1);
    });

    it('renders primary Play button when all episodes are unwatched', () => {
      const unwatchedShow: MediaItemDetail = {
        ...mockShowDetail,
        episodes: [
          {
            id: 206,
            title: 'Episode 1',
            season: 1,
            episode: 1,
            playback_progress: 0,
          },
          {
            id: 207,
            title: 'Episode 2',
            season: 1,
            episode: 2,
          },
        ],
      };
      const onPlay = vi.fn();

      render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={unwatchedShow}
            serverUrl="http://localhost:8492"
            onClose={vi.fn()}
            onPlay={onPlay}
          />
        </FocusProvider>
      );

      const playBtn = screen.getByRole('button', { name: /^Play$/i });
      expect(playBtn).toBeInTheDocument();
      fireEvent.click(playBtn);
      expect(onPlay).toHaveBeenCalledWith(206, 0, 'Episode 1', undefined, expect.any(Array), 0);
    });

    it('does not render Browse Folder button when library_id or folder_path is missing', () => {
      const showWithoutFolder: MediaItemDetail = {
        ...mockShowDetail,
        folder_path: undefined,
      };

      render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={showWithoutFolder}
            serverUrl="http://localhost:8492"
            onClose={vi.fn()}
            onPlay={vi.fn()}
          />
        </FocusProvider>
      );

      expect(screen.queryByRole('button', { name: /browse folder/i })).not.toBeInTheDocument();
    });

    it('formats episode subtitle with fallback when subtitle is not provided', () => {
      const showWithNoSubtitles: MediaItemDetail = {
        ...mockShowDetail,
        episodes: [
          {
            id: 501,
            title: 'Pilot',
            season: 3,
            episode: 4,
          },
        ],
      };

      render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={showWithNoSubtitles}
            serverUrl="http://localhost:8492"
            onClose={vi.fn()}
            onPlay={vi.fn()}
          />
        </FocusProvider>
      );

      expect(screen.getByText('S03E04')).toBeInTheDocument();
    });

    it('navigates smoothly via D-pad between Action buttons, Season tabs, and Episode cards', () => {
      function HostComponent() {
        const { focusedId } = useFocusContext();
        return (
          <div>
            <div data-testid="focused-id">{focusedId}</div>
            <ItemDetailModal
              isOpen={true}
              item={mockShowDetail}
              serverUrl="http://localhost:8492"
              onClose={vi.fn()}
              onPlay={vi.fn()}
              onBrowseFolder={vi.fn()}
            />
          </div>
        );
      }

      render(
        <FocusProvider>
          <HostComponent />
        </FocusProvider>
      );

      // Initial focus on detail-resume-btn
      expect(screen.getByTestId('focused-id').textContent).toBe('detail-resume-btn');

      // Move Down from Action button to Season tab
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowDown' });
      });
      expect(screen.getByTestId('focused-id').textContent).toBe('season-tab-1');

      // Move Right to Season 2 tab
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowRight' });
      });
      expect(screen.getByTestId('focused-id').textContent).toBe('season-tab-2');

      // Commit Season 2 switch
      act(() => {
        fireEvent.keyDown(window, { key: 'Enter' });
      });
      // Season 2 episodes now visible
      expect(screen.getByText('Season 2 Premiere')).toBeInTheDocument();

      // Move Down to Season 2 episode card
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowDown' });
      });
      expect(screen.getByTestId('focused-id').textContent).toBe('episode-card-301');

      // Move Up back to Season 2 tab
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowUp' });
      });
      expect(screen.getByTestId('focused-id').textContent).toBe('season-tab-2');

      // Move Up back to Action button
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowUp' });
      });
      expect(screen.getByTestId('focused-id').textContent).toBe('detail-resume-btn');
    });

    it('renders with Chromium 69 compatible margin spacing for poster, buttons, and seasons', () => {
      render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={{
              ...mockShowDetail,
              poster_url: '/images/severance-poster.jpg',
            }}
            serverUrl="http://localhost:8492"
            onPlay={vi.fn()}
            onClose={vi.fn()}
          />
        </FocusProvider>
      );

      // Poster has mr-10
      const posterImg = screen.getAllByAltText('Severance').find((img) => img.getAttribute('src')?.includes('poster'));
      expect(posterImg?.className).toContain('mr-10');

      // Action button has !py-4 and mr-4 spacing
      const resumeBtn = screen.getByRole('button', { name: /Resume Next/i });
      expect(resumeBtn.className).toContain('!py-4');
      expect(resumeBtn.className).toContain('mr-4');

      // Season tab has mr-3
      const seasonTab1 = screen.getByRole('button', { name: /Season 1/i });
      expect(seasonTab1.className).toContain('mr-3');
    });

    it('renders and plays correctly when item only has nested card attributes', () => {
      const onPlay = vi.fn();
      const rawItem: any = {
        card: {
          id: 99,
          title: 'Nested Card Movie',
          poster_url: '/poster.jpg',
          media_type: 'movie',
        },
        overview: 'Overview from payload',
      };

      render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={rawItem}
            serverUrl="http://localhost:8492"
            onPlay={onPlay}
            onClose={vi.fn()}
          />
        </FocusProvider>
      );

      expect(screen.getByText('Nested Card Movie')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^Play$/i }));
      expect(onPlay).toHaveBeenCalledWith(99, 0);
    });

    it('renders primary and secondary video action buttons with template padding and Chromium 69 mr-4 spacing', async () => {
      const { rerender } = render(
        <FocusProvider>
          <ItemDetailModal
            item={{ id: 10, title: 'Big Movie', type: 'movie', library_id: 1, path: '/movies/big.mkv' } as any}
            serverUrl="http://localhost:8492"
            onClose={vi.fn()}
            onPlay={vi.fn()}
          />
        </FocusProvider>
      );
      const playBtn = screen.getByRole('button', { name: /^play$/i });
      expect(playBtn.className).toContain('!py-4');
      expect(playBtn.className).toContain('!px-6');
      expect(playBtn.className).toContain('mr-4');
      expect(playBtn.style.padding).toBe('16px 24px');
      expect(playBtn.style.marginRight).toBe('16px');
      expect(playBtn.parentElement?.className).not.toContain('gap-');

      // Test with resume position and folder path
      rerender(
        <FocusProvider>
          <ItemDetailModal
            item={{
              id: 10,
              title: 'Big Movie',
              type: 'movie',
              library_id: 'lib-1',
              folder_path: '/movies',
              resume_position_ms: 120000,
            } as any}
            serverUrl="http://localhost:8492"
            onClose={vi.fn()}
            onPlay={vi.fn()}
            onBrowseFolder={vi.fn()}
          />
        </FocusProvider>
      );

      const resumeBtn = screen.getByRole('button', { name: /resume/i });
      const restartBtn = screen.getByRole('button', { name: /play from beginning/i });
      const browseBtn = screen.getByRole('button', { name: /browse folder/i });

      expect(resumeBtn.className).toContain('!py-4');
      expect(resumeBtn.className).toContain('!px-6');
      expect(resumeBtn.className).toContain('mr-4');
      expect(resumeBtn.style.padding).toBe('16px 24px');

      expect(restartBtn.className).toContain('!py-4');
      expect(restartBtn.className).toContain('!px-5');
      expect(restartBtn.className).toContain('mr-4');
      expect(restartBtn.style.padding).toBe('16px 22px');

      expect(browseBtn.className).toContain('!py-4');
      expect(browseBtn.className).toContain('!px-5');
      expect(browseBtn.className).toContain('mr-4');
      expect(browseBtn.style.padding).toBe('16px 22px');
    });

    it('renders template hero breadcrumb, technical format chips, 16:9 landscape episode cards with WATCHED/RESUME status, and remote legend footer', () => {
      render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={{
              ...mockShowDetail,
              release_year: 2024,
              genres: ['Historical Drama', 'Action'],
              technical: {
                resolution: '4K',
                video_codec: 'hevc',
                audio_codec: 'truehd',
                audio_channels: 6,
                container: 'mkv',
              },
            }}
            serverUrl="http://localhost:8492"
            onPlay={vi.fn()}
            onClose={vi.fn()}
            onBrowseFolder={vi.fn()}
          />
        </FocusProvider>
      );

      // Breadcrumb & technical chips
      expect(screen.getByTestId('detail-breadcrumb')).toHaveTextContent('TV Shows');
      expect(screen.getByTestId('detail-breadcrumb')).toHaveTextContent('Severance');
      expect(screen.getByText('HEVC')).toBeInTheDocument();
      expect(screen.getByText('4K')).toBeInTheDocument();
      expect(screen.getByText(/TRUEHD/i)).toBeInTheDocument();
      expect(screen.getByText('Historical Drama, Action')).toBeInTheDocument();

      // 16:9 episode cards with WATCHED and RESUME badges
      expect(screen.getByText('WATCHED')).toBeInTheDocument();
      expect(screen.getByText('RESUME')).toBeInTheDocument();
      const ep1Card = document.getElementById('episode-card-206');
      expect(ep1Card?.querySelector('.aspect-video')).not.toBeNull();

      // Remote legend footer & Channel Up/Down season switch
      expect(screen.getByTestId('detail-remote-footer')).toBeInTheDocument();
      act(() => {
        fireEvent.keyDown(window, { keyCode: TVKeys.CH_UP });
      });
      expect(screen.getByText('Season 2 Premiere')).toBeInTheDocument();
    });

    it('supports Add to Playlist for movies and TV shows (with selected season)', () => {
      const onAddToPlaylist = vi.fn();

      const { rerender } = render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={{ ...mockMovieWithoutResume, id: 42 }}
            serverUrl="http://localhost:8492"
            onPlay={vi.fn()}
            onClose={vi.fn()}
            onAddToPlaylist={onAddToPlaylist}
          />
        </FocusProvider>
      );

      const addMovieBtn = screen.getByRole('button', { name: /Add to Playlist/i });
      expect(addMovieBtn).toBeInTheDocument();
      fireEvent.click(addMovieBtn);
      expect(onAddToPlaylist).toHaveBeenCalledWith({
        kind: 'item',
        itemId: 42,
        title: 'Inception',
      });

      onAddToPlaylist.mockClear();

      rerender(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={mockShowDetail}
            serverUrl="http://localhost:8492"
            onPlay={vi.fn()}
            onClose={vi.fn()}
            onAddToPlaylist={onAddToPlaylist}
          />
        </FocusProvider>
      );

      // Switch to Season 2 first
      fireEvent.click(screen.getByText('Season 2'));
      fireEvent.click(screen.getByRole('button', { name: /Add to Playlist/i }));
      expect(onAddToPlaylist).toHaveBeenCalledWith({
        kind: 'show',
        showId: 205,
        title: 'Severance',
        seasons: [1, 2],
        defaultSeason: 2,
      });
    });

    it('hides Browse Folder for plugin:// paths and displays LIVE badge for live_channel or zero-duration items', () => {
      render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={{
              id: 777,
              title: 'News 24 Live',
              media_type: 'live_channel',
              duration_seconds: 0,
              library_id: 'lib-iptv',
              folder_path: 'plugin://iptv/news',
            }}
            serverUrl="http://localhost:8492"
            onPlay={vi.fn()}
            onClose={vi.fn()}
            onBrowseFolder={vi.fn()}
          />
        </FocusProvider>
      );

      expect(screen.queryByRole('button', { name: /browse folder/i })).not.toBeInTheDocument();
      expect(screen.getByTestId('detail-live-badge')).toHaveTextContent('LIVE');
      expect(screen.queryByText(/^0m$/i)).not.toBeInTheDocument();
    });

    it('renders Play (0ms) instead of Resume when movie playback_progress >= 0.9 (completed)', () => {
      const onPlay = vi.fn();
      render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={{
              ...mockMovieWithResume,
              resume_position_seconds: 5700,
              resume_position_ms: 5700000,
              duration_ms: 6000000,
              card: {
                id: 1,
                title: 'Interstellar',
                media_type: 'movie',
                playback_progress: 0.95,
              },
            }}
            serverUrl="http://localhost:8492"
            onPlay={onPlay}
            onClose={vi.fn()}
          />
        </FocusProvider>
      );

      expect(screen.queryByText(/Resume/i)).not.toBeInTheDocument();
      const playBtn = screen.getByRole('button', { name: /^Play$/i });
      fireEvent.click(playBtn);
      expect(onPlay).toHaveBeenCalledWith('movie-1', 0);
    });

    it('passes 0ms (not 100 sentinel) when clicking an already-watched episode (playback_progress >= 0.9)', () => {
      const onPlay = vi.fn();
      render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={mockShowDetail}
            serverUrl="http://localhost:8492"
            onPlay={onPlay}
            onClose={vi.fn()}
          />
        </FocusProvider>
      );

      // Episode 1 ("Good News About Hell") has playback_progress: 1.0 (watched)
      fireEvent.click(screen.getByText('Good News About Hell'));
      expect(onPlay).toHaveBeenCalledWith(
        206,
        0,
        'Good News About Hell',
        undefined,
        expect.any(Array),
        0
      );
    });

    it('preserves tiny non-zero episode progress (<0.5%) as sentinel 1 and restores initialSelectedSeason', () => {
      const onPlay = vi.fn();
      const showTinyProgress: MediaItemDetail = {
        ...mockShowDetail,
        episodes: [
          { id: 206, title: 'Ep 1', season: 1, episode: 1, playback_progress: 0.003 },
          { id: 301, title: 'S2 Ep 1', season: 2, episode: 1, playback_progress: 0 },
        ],
      };

      render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={showTinyProgress}
            serverUrl="http://localhost:8492"
            initialSelectedSeason={2}
            onClose={vi.fn()}
            onPlay={onPlay}
          />
        </FocusProvider>
      );

      // Season 2 episode is immediately visible because initialSelectedSeason={2}
      expect(screen.getByText('S2 Ep 1')).toBeInTheDocument();

      // Resume Next button still targets Ep 1 with sentinel >= 1 (never 0)
      fireEvent.click(screen.getByRole('button', { name: /Resume Next/i }));
      expect(onPlay).toHaveBeenCalledWith(206, 1, 'Ep 1', undefined, expect.any(Array), 0);
    });

    it('restores initialFocusedId when valid, falls back cleanly to default when invalid, and reports view state changes', () => {
      const onViewStateChange = vi.fn();
      const onPlay = vi.fn();

      function FocusTestWrapper({ item }: { item: MediaItemDetail }) {
        const { setFocusedId } = useFocusContext();
        return (
          <>
            <button
              data-testid="move-focus-btn"
              onClick={() => setFocusedId('detail-close-btn')}
            />
            <ItemDetailModal
              isOpen={true}
              item={item}
              serverUrl="http://localhost:8492"
              initialSelectedSeason={1}
              initialFocusedId="season-tab-1"
              onViewStateChange={onViewStateChange}
              onClose={vi.fn()}
              onPlay={onPlay}
            />
          </>
        );
      }

      const { rerender, unmount } = render(
        <FocusProvider>
          <FocusTestWrapper item={mockShowDetail} />
        </FocusProvider>
      );

      const season1Btn = screen.getByRole('button', { name: /Season 1/i });
      expect(document.activeElement).toBe(season1Btn);
      expect(onViewStateChange).toHaveBeenCalledWith({
        selectedSeason: 1,
        lastFocusedId: 'season-tab-1',
      });

      // User moves focus to another element (e.g. Back/close button via focus context)
      const backBtn = screen.getByRole('button', { name: /Back/i });
      fireEvent.click(screen.getByTestId('move-focus-btn'));
      expect(document.activeElement).toBe(backBtn);

      // Updating item props so primaryBtnId flips (all episodes watched -> detail-play-btn instead of detail-resume-btn)
      // must NOT yank focus back to initialFocusedId
      const allWatchedShowDetail: MediaItemDetail = {
        ...mockShowDetail,
        episodes: (mockShowDetail.episodes || []).map((ep) => ({
          ...ep,
          playback_progress: 1.0,
          badge: undefined,
        })),
      };

      rerender(
        <FocusProvider>
          <FocusTestWrapper item={allWatchedShowDetail} />
        </FocusProvider>
      );

      // Focus must remain on the active back button and NOT yank back to season-tab-1
      expect(document.activeElement).toBe(backBtn);

      unmount();

      // When invalid initialFocusedId is provided, it falls back cleanly to primary button and reports it
      const onViewStateChangeFallback = vi.fn();
      render(
        <FocusProvider>
          <ItemDetailModal
            isOpen={true}
            item={mockShowDetail}
            serverUrl="http://localhost:8492"
            initialFocusedId="non-existent-button-id"
            onViewStateChange={onViewStateChangeFallback}
            onClose={vi.fn()}
            onPlay={onPlay}
          />
        </FocusProvider>
      );

      expect(document.activeElement).toBe(screen.getByRole('button', { name: /Resume Next/i }));
      expect(onViewStateChangeFallback).toHaveBeenCalledWith({
        selectedSeason: 1,
        lastFocusedId: 'detail-resume-btn',
      });
    });
  });

  describe('Stacked FolderBrowserModal -> ItemDetailModal Back Navigation Restoration', () => {
    it('preserves folder-browser-modal trap, visible selection ring, and exact focusedId on Back without opening random background items on OK', () => {
      const onSelectRandomBrowseMovie = vi.fn();
      const onSelectFolderVideo = vi.fn();

      function StackedBrowseFolderDetailApp() {
        const { focusedId, activeTrap, pushTrap, popTrap } = useFocusContext();
        const [folderOpen, setFolderOpen] = React.useState(false);
        const [activeDetailItem, setActiveDetailItem] = React.useState<MediaItemDetail | null>(
          null
        );

        React.useEffect(() => {
          if (folderOpen) {
            pushTrap('folder-browser-modal');
            return () => {
              popTrap('folder-browser-modal');
            };
          }
        }, [folderOpen, pushTrap, popTrap]);

        return (
          <div>
            <div data-testid="debug-focused-id">{focusedId ?? ''}</div>
            <div data-testid="debug-active-trap">{activeTrap ?? ''}</div>

            {/* Background BrowseScreen card that used to get accidentally activated */}
            <TVButton
              id="browse-random-movie"
              groupId="browse-row-0"
              autoFocus
              onEnter={onSelectRandomBrowseMovie}
            >
              Random Browse Movie
            </TVButton>

            <button data-testid="open-folder-btn" onClick={() => setFolderOpen(true)}>
              Open Folder Browser
            </button>

            {/* Stacked FolderBrowserModal */}
            {folderOpen && (
              <div role="dialog" aria-label="Folder Browser">
                <TVButton id="folder-item-1" groupId="folder-browser-modal" order={1}>
                  Episode_01.mkv
                </TVButton>
                <TVButton
                  id="folder-item-2"
                  groupId="folder-browser-modal"
                  order={2}
                  onEnter={() => {
                    onSelectFolderVideo('folder-item-2');
                    setActiveDetailItem(mockMovieWithoutResume);
                  }}
                >
                  Inception_1080p.mkv
                </TVButton>
              </div>
            )}

            {/* Always-mounted ItemDetailModal (matches App/BrowseScreen mounting pattern) */}
            <ItemDetailModal
              isOpen={Boolean(activeDetailItem)}
              item={activeDetailItem}
              serverUrl="http://localhost:8492"
              onPlay={vi.fn()}
              onClose={() => setActiveDetailItem(null)}
            />
          </div>
        );
      }

      render(
        <FocusProvider>
          <StackedBrowseFolderDetailApp />
        </FocusProvider>
      );

      expect(screen.getByTestId('debug-focused-id').textContent).toBe('browse-random-movie');

      // 1. Open FolderBrowserModal and navigate right to folder-item-2
      act(() => {
        screen.getByTestId('open-folder-btn').click();
      });
      expect(screen.getByTestId('debug-active-trap').textContent).toBe('folder-browser-modal');
      expect(screen.getByTestId('debug-focused-id').textContent).toBe('folder-item-1');

      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
      });
      expect(screen.getByTestId('debug-focused-id').textContent).toBe('folder-item-2');
      expect(document.getElementById('folder-item-2')).toHaveClass('tv-focus-ring');

      // 2. Press OK (Enter) on folder-item-2 -> opens ItemDetailModal
      act(() => {
        fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
      });
      expect(onSelectFolderVideo).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('debug-active-trap').textContent).toBe('item-detail-modal');
      expect(screen.getByTestId('debug-focused-id').textContent).toBe('detail-play-btn');

      // 3. Press Samsung TV Return/Back key (10009) inside ItemDetailModal
      act(() => {
        fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
      });

      // MUST return to folder-browser-modal (NEVER wipe activeTrap to null!)
      // and MUST visibly highlight folder-item-2 with tv-focus-ring!
      expect(screen.getByTestId('debug-active-trap').textContent).toBe('folder-browser-modal');
      expect(screen.getByTestId('debug-focused-id').textContent).toBe('folder-item-2');
      expect(document.getElementById('folder-item-2')).toHaveClass('tv-focus-ring');

      // 4. Press OK (Enter) immediately -> MUST re-open folder-item-2, NEVER browse-random-movie!
      act(() => {
        fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
      });
      expect(onSelectFolderVideo).toHaveBeenCalledTimes(2);
      expect(onSelectRandomBrowseMovie).not.toHaveBeenCalled();
    });

    it('does not push item-detail-modal trap when isOpen is true but item is null', () => {
      function NullItemHost() {
        const { activeTrap, focusedId } = useFocusContext();
        return (
          <div>
            <div data-testid="trap">{activeTrap ?? ''}</div>
            <div data-testid="focus">{focusedId ?? ''}</div>
            <TVButton id="bg-card" groupId="browse" autoFocus>
              Card
            </TVButton>
            <ItemDetailModal
              isOpen={true}
              item={null}
              serverUrl="http://localhost:8492"
              onPlay={vi.fn()}
              onClose={vi.fn()}
            />
          </div>
        );
      }

      render(
        <FocusProvider>
          <NullItemHost />
        </FocusProvider>
      );

      expect(screen.getByTestId('trap').textContent).toBe('');
      expect(screen.getByTestId('focus').textContent).toBe('bg-card');
    });
  });
});



