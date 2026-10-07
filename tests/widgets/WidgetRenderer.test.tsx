import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { WidgetRenderer } from '../../src/components/widgets/WidgetRenderer';
import { ScreenLayout } from '../../src/types/ast';

describe('WidgetRenderer with Server AST', () => {
  it('renders hero_banner, carousel, and grid from server AST layout', () => {
    const mockLayout: ScreenLayout = {
      id: 'home',
      title: 'Home',
      widgets: [
        {
          type: 'hero_banner',
          id: 'home_spotlight',
          data: {
            id: 101,
            title: 'Interstellar',
            subtitle: 'Mankind was born on Earth. It was never meant to die here.',
            backdrop_url: '/api/v1/artwork/101/backdrop',
            media_type: 'movie',
            rating: 8.7,
            release_year: 2014,
            badge: '4K',
            playback_progress: 0.65,
          },
        },
        {
          type: 'carousel',
          id: 'continue_watching',
          title: 'Continue Watching',
          items: [
            {
              id: 201,
              title: 'Severance',
              subtitle: 'Good news about hell',
              poster_url: '/api/v1/artwork/201/poster',
              media_type: 'episode',
              season: 1,
              episode: 1,
              playback_progress: 0.45,
            },
          ],
        },
        {
          type: 'grid',
          id: 'all_movies',
          title: 'All Movies',
          columns: 6,
          total_count: 42,
          items: [
            {
              id: 301,
              title: 'The Dark Knight',
              media_type: 'movie',
              release_year: 2008,
            },
          ],
        },
      ],
    };

    render(
      <FocusProvider>
        <WidgetRenderer
          layout={mockLayout}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.getByText('Interstellar')).toBeInTheDocument();
    expect(screen.getByText('Mankind was born on Earth. It was never meant to die here.')).toBeInTheDocument();
    expect(screen.getByText('4K')).toBeInTheDocument();
    expect(screen.getByText('8.7')).toBeInTheDocument();
    expect(screen.getByText('2014')).toBeInTheDocument();
    expect(screen.getByText(/Resume/i)).toBeInTheDocument();
    expect(screen.getByText('Continue Watching')).toBeInTheDocument();
    expect(screen.getByText('Severance')).toBeInTheDocument();
    expect(screen.getByText('S01E01')).toBeInTheDocument();
    expect(screen.getByText('All Movies')).toBeInTheDocument();
    expect(screen.getByText('The Dark Knight')).toBeInTheDocument();
    expect(screen.getByText('2008')).toBeInTheDocument();
    expect(screen.getByText('1 of 42 items')).toBeInTheDocument();

    const backdropImg = screen.getByAltText('Interstellar') as HTMLImageElement;
    expect(backdropImg.src).toBe('http://localhost:8492/api/v1/artwork/101/backdrop');

    const posterImg = screen.getByAltText('Severance') as HTMLImageElement;
    expect(posterImg.src).toBe('http://localhost:8492/api/v1/artwork/201/poster');
  });

  it('triggers onPlayItem and onSelectItem when Hero buttons are clicked', () => {
    const onPlay = vi.fn();
    const onDetails = vi.fn();

    const mockLayout: ScreenLayout = {
      id: 'home',
      title: 'Home',
      widgets: [
        {
          type: 'hero_banner',
          id: 'hero-1',
          data: {
            id: 101,
            title: 'Dune Part Two',
            media_type: 'movie',
            playback_progress: 0.65,
          },
        },
      ],
    };

    render(
      <FocusProvider>
        <WidgetRenderer
          layout={mockLayout}
          serverUrl="http://localhost:8492"
          onSelectItem={onDetails}
          onPlayItem={onPlay}
        />
      </FocusProvider>
    );

    const resumeBtn = screen.getByText(/Resume/i);
    expect(resumeBtn).toBeInTheDocument();
    fireEvent.click(resumeBtn);
    expect(onPlay).toHaveBeenCalledWith(101, 65);

    const detailsBtn = screen.getByText(/Details/i);
    fireEvent.click(detailsBtn);
    expect(onDetails).toHaveBeenCalledWith(101);
  });

  it('renders Play instead of Resume when playback_progress is 0 or undefined', () => {
    const onPlay = vi.fn();

    const mockLayout: ScreenLayout = {
      id: 'home',
      title: 'Home',
      widgets: [
        {
          type: 'hero_banner',
          id: 'hero-2',
          data: {
            id: 102,
            title: 'The Dark Knight',
            media_type: 'movie',
            playback_progress: 0,
          },
        },
      ],
    };

    render(
      <FocusProvider>
        <WidgetRenderer
          layout={mockLayout}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={onPlay}
        />
      </FocusProvider>
    );

    const playBtn = screen.getByText(/Play/i);
    expect(playBtn).toBeInTheDocument();
    fireEvent.click(playBtn);
    expect(onPlay).toHaveBeenCalledWith(102, 0);
  });

  it('triggers onSelectItem when clicking carousel or grid item', () => {
    const onSelect = vi.fn();

    const mockLayout: ScreenLayout = {
      id: 'home',
      title: 'Home',
      widgets: [
        {
          type: 'carousel',
          id: 'carousel-1',
          title: 'Trending',
          items: [
            {
              id: 201,
              title: 'Severance',
              media_type: 'show',
            },
          ],
        },
        {
          type: 'grid',
          id: 'grid-1',
          title: 'Recommended',
          columns: 6,
          items: [
            {
              id: 301,
              title: 'Succession',
              media_type: 'show',
            },
          ],
        },
      ],
    };

    render(
      <FocusProvider>
        <WidgetRenderer
          layout={mockLayout}
          serverUrl="http://localhost:8492"
          onSelectItem={onSelect}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    fireEvent.click(screen.getByText('Severance'));
    expect(onSelect).toHaveBeenCalledWith(201);

    fireEvent.click(screen.getByText('Succession'));
    expect(onSelect).toHaveBeenCalledWith(301);
  });

  it('formats subtitle for episodes as SxxExx and movies as release_year or custom subtitle', () => {
    const mockLayout: ScreenLayout = {
      id: 'home',
      title: 'Home',
      widgets: [
        {
          type: 'carousel',
          id: 'c-test',
          title: 'Mixed Items',
          items: [
            {
              id: 1,
              title: 'Episode Item',
              media_type: 'episode',
              season: 2,
              episode: 5,
            },
            {
              id: 2,
              title: 'Movie Item With Year',
              media_type: 'movie',
              release_year: 2023,
            },
            {
              id: 3,
              title: 'Custom Subtitle Item',
              media_type: 'movie',
              subtitle: 'Custom Description',
            },
          ],
        },
      ],
    };

    render(
      <FocusProvider>
        <WidgetRenderer
          layout={mockLayout}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.getByText('S02E05')).toBeInTheDocument();
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('Custom Description')).toBeInTheDocument();
  });

  it('handles absolute and relative image urls', () => {
    const mockLayout: ScreenLayout = {
      id: 'home',
      title: 'Home',
      widgets: [
        {
          type: 'hero_banner',
          id: 'h-abs',
          data: {
            id: 1,
            title: 'Absolute Image Movie',
            media_type: 'movie',
            backdrop_url: 'https://images.example.com/backdrop.jpg',
          },
        },
        {
          type: 'carousel',
          id: 'c-abs',
          title: 'Absolute Carousel',
          items: [
            {
              id: 2,
              title: 'Absolute Poster',
              media_type: 'movie',
              poster_url: 'https://images.example.com/poster.jpg',
            },
          ],
        },
      ],
    };

    render(
      <FocusProvider>
        <WidgetRenderer
          layout={mockLayout}
          serverUrl="http://localhost:8492/"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    const backdrop = screen.getByAltText('Absolute Image Movie') as HTMLImageElement;
    expect(backdrop.src).toBe('https://images.example.com/backdrop.jpg');

    const poster = screen.getByAltText('Absolute Poster') as HTMLImageElement;
    expect(poster.src).toBe('https://images.example.com/poster.jpg');
  });

  it('gracefully handles empty widgets array', () => {
    const mockLayout: ScreenLayout = {
      id: 'empty',
      title: 'Empty Screen',
      widgets: [],
    };

    const { container } = render(
      <FocusProvider>
        <WidgetRenderer
          layout={mockLayout}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    expect(container).toBeInTheDocument();
  });

  it('gracefully ignores unknown widget types', () => {
    const mockLayout: ScreenLayout = {
      id: 'home',
      title: 'Home',
      widgets: [
        {
          id: 'unknown-1',
          type: 'unsupported_type' as unknown as 'hero_banner',
        } as unknown as ScreenLayout['widgets'][0],
      ],
    };

    const { container } = render(
      <FocusProvider>
        <WidgetRenderer
          layout={mockLayout}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    expect(container).toBeInTheDocument();
  });

  it('gracefully handles hero_banner without data and carousel/grid with empty items', () => {
    const mockLayout: ScreenLayout = {
      id: 'home',
      title: 'Home',
      widgets: [
        {
          type: 'hero_banner',
          id: 'empty-hero',
        },
        {
          type: 'carousel',
          id: 'empty-carousel',
          title: 'Empty Carousel',
          items: [],
        },
        {
          type: 'grid',
          id: 'empty-grid',
          title: 'Empty Grid',
          columns: 6,
          items: [],
        },
      ],
    };

    render(
      <FocusProvider>
        <WidgetRenderer
          layout={mockLayout}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.queryByText('Empty Carousel')).not.toBeInTheDocument();
    expect(screen.queryByText('Empty Grid')).not.toBeInTheDocument();
  });

  it('autofocuses first item of first widget when hero_banner is absent', () => {
    const mockLayout: ScreenLayout = {
      id: 'movies',
      title: 'Movies',
      widgets: [
        {
          type: 'carousel',
          id: 'popular_movies',
          title: 'Popular',
          items: [
            {
              id: 501,
              title: 'Movie One',
              media_type: 'movie',
            },
            {
              id: 502,
              title: 'Movie Two',
              media_type: 'movie',
            },
          ],
        },
      ],
    };

    render(
      <FocusProvider>
        <WidgetRenderer
          layout={mockLayout}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    const firstCard = document.getElementById('card-popular_movies-501');
    expect(firstCard).toHaveClass('tv-focus-ring');
  });

  it('autofocuses hero play button when hero_banner is present with data', () => {
    const mockLayout: ScreenLayout = {
      id: 'home',
      title: 'Home',
      widgets: [
        {
          type: 'hero_banner',
          id: 'hero_spotlight',
          data: {
            id: 601,
            title: 'Featured Spotlight',
            media_type: 'movie',
          },
        },
        {
          type: 'carousel',
          id: 'popular',
          title: 'Popular',
          items: [
            {
              id: 602,
              title: 'Carousel Item',
              media_type: 'movie',
            },
          ],
        },
      ],
    };

    render(
      <FocusProvider>
        <WidgetRenderer
          layout={mockLayout}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    const heroPlayBtn = document.getElementById('hero-play-hero_spotlight');
    expect(heroPlayBtn).toHaveClass('tv-focus-ring');

    const firstCard = document.getElementById('card-popular-602');
    expect(firstCard).not.toHaveClass('tv-focus-ring');
  });
});

