import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { WidgetRenderer } from '../../src/components/widgets/WidgetRenderer';
import { ScreenLayout } from '../../src/types/ast';

describe('WidgetRenderer', () => {
  it('renders HeroSpotlight and CardCarousel widgets from AST layout', () => {
    const mockLayout: ScreenLayout = {
      screen_id: 'home',
      title: 'Home',
      widgets: [
        {
          id: 'hero-1',
          type: 'hero_spotlight',
          title: 'Featured Movie',
          item_id: 'item-100',
          backdrop_url: '/artwork/100/backdrop',
          synopsis: 'An epic adventure awaits.',
          badges: ['4K', 'HDR'],
        },
        {
          id: 'carousel-continue',
          type: 'card_carousel',
          title: 'Continue Watching',
          items: [
            {
              id: 'card-1',
              item_id: 'item-101',
              title: 'Breaking Bad S01E01',
              poster_url: '/artwork/101/poster',
              progress_percent: 45,
              badge: 'RESUME',
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

    expect(screen.getByText('Featured Movie')).toBeInTheDocument();
    expect(screen.getByText('An epic adventure awaits.')).toBeInTheDocument();
    expect(screen.getByText('4K')).toBeInTheDocument();
    expect(screen.getByText('HDR')).toBeInTheDocument();
    expect(screen.getByText('Continue Watching')).toBeInTheDocument();
    expect(screen.getByText('Breaking Bad S01E01')).toBeInTheDocument();

    const img = screen.getByAltText('Featured Movie') as HTMLImageElement;
    expect(img.src).toBe('http://localhost:8492/artwork/100/backdrop');
  });

  it('renders CatalogGrid widget from AST layout', () => {
    const mockLayout: ScreenLayout = {
      screen_id: 'movies',
      title: 'Movies',
      widgets: [
        {
          id: 'grid-all-movies',
          type: 'catalog_grid',
          title: 'All Movies',
          items: [
            {
              id: 'movie-1',
              item_id: 'item-201',
              title: 'Inception',
              subtitle: '2010',
              poster_url: '/artwork/201/poster',
              badge: '4K',
            },
            {
              id: 'movie-2',
              item_id: 'item-202',
              title: 'Interstellar',
              subtitle: '2014',
              poster_url: 'https://cdn.example.com/interstellar.jpg',
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

    expect(screen.getByText('All Movies')).toBeInTheDocument();
    expect(screen.getByText('Inception')).toBeInTheDocument();
    expect(screen.getByText('2010')).toBeInTheDocument();
    expect(screen.getByText('Interstellar')).toBeInTheDocument();
    expect(screen.getByText('2014')).toBeInTheDocument();

    const inceptionImg = screen.getByAltText('Inception') as HTMLImageElement;
    expect(inceptionImg.src).toBe('http://localhost:8492/artwork/201/poster');

    const interstellarImg = screen.getByAltText('Interstellar') as HTMLImageElement;
    expect(interstellarImg.src).toBe('https://cdn.example.com/interstellar.jpg');
  });

  it('triggers onPlayItem and onSelectItem when Hero buttons are clicked', () => {
    const onPlay = vi.fn();
    const onDetails = vi.fn();

    const mockLayout: ScreenLayout = {
      screen_id: 'home',
      title: 'Home',
      widgets: [
        {
          id: 'hero-1',
          type: 'hero_spotlight',
          title: 'Dune Part Two',
          item_id: 'item-300',
          resume_position_ms: 125000,
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

    // Resume button when resume_position_ms > 0
    const resumeBtn = screen.getByText('Resume');
    expect(resumeBtn).toBeInTheDocument();
    fireEvent.click(resumeBtn);
    expect(onPlay).toHaveBeenCalledWith('item-300', 125000);

    const detailsBtn = screen.getByText('Details');
    fireEvent.click(detailsBtn);
    expect(onDetails).toHaveBeenCalledWith('item-300');
  });

  it('renders Play instead of Resume when resume_position_ms is 0 or undefined', () => {
    const onPlay = vi.fn();

    const mockLayout: ScreenLayout = {
      screen_id: 'home',
      title: 'Home',
      widgets: [
        {
          id: 'hero-2',
          type: 'hero_spotlight',
          title: 'The Dark Knight',
          item_id: 'item-301',
          resume_position_ms: 0,
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

    const playBtn = screen.getByText('Play');
    expect(playBtn).toBeInTheDocument();
    fireEvent.click(playBtn);
    expect(onPlay).toHaveBeenCalledWith('item-301', 0);
  });

  it('triggers onSelectItem when clicking carousel or grid item', () => {
    const onSelect = vi.fn();

    const mockLayout: ScreenLayout = {
      screen_id: 'home',
      title: 'Home',
      widgets: [
        {
          id: 'carousel-1',
          type: 'card_carousel',
          title: 'Trending',
          items: [
            {
              id: 'c-1',
              item_id: 'item-401',
              title: 'Severance',
            },
          ],
        },
        {
          id: 'grid-1',
          type: 'catalog_grid',
          title: 'Recommended',
          items: [
            {
              id: 'g-1',
              item_id: 'item-501',
              title: 'Succession',
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
    expect(onSelect).toHaveBeenCalledWith('item-401');

    fireEvent.click(screen.getByText('Succession'));
    expect(onSelect).toHaveBeenCalledWith('item-501');
  });

  it('gracefully handles empty widgets array', () => {
    const mockLayout: ScreenLayout = {
      screen_id: 'empty',
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
      screen_id: 'home',
      title: 'Home',
      widgets: [
        {
          id: 'unknown-1',
          type: 'unsupported_type' as unknown as 'hero_spotlight',
          title: 'Unsupported',
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

    expect(screen.queryByText('Unsupported')).not.toBeInTheDocument();
    expect(container).toBeInTheDocument();
  });
});
