import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { BrowseScreen } from '../../src/screens/BrowseScreen';
import { ApiClient } from '../../src/api/client';
import * as screensApi from '../../src/api/screens';
import { ScreenLayout } from '../../src/types/ast';

describe('BrowseScreen', () => {
  let mockClient: ApiClient;

  const mockHomeLayout: ScreenLayout = {
    screen_id: 'home',
    title: 'Home',
    widgets: [
      {
        id: 'hero-home',
        type: 'hero_spotlight',
        title: 'Home Featured Movie',
        item_id: 'movie-1',
      },
      {
        id: 'carousel-home',
        type: 'card_carousel',
        title: 'Popular Right Now',
        items: [
          {
            id: 'item-1',
            item_id: 'show-1',
            title: 'Top TV Show',
          },
        ],
      },
    ],
  };

  const mockMoviesLayout: ScreenLayout = {
    screen_id: 'movies',
    title: 'Movies',
    widgets: [
      {
        id: 'grid-movies',
        type: 'catalog_grid',
        title: 'Feature Films',
        items: [
          {
            id: 'film-1',
            item_id: 'movie-10',
            title: 'Interstellar',
          },
        ],
      },
    ],
  };

  const mockShowsLayout: ScreenLayout = {
    screen_id: 'shows',
    title: 'Shows',
    widgets: [
      {
        id: 'grid-shows',
        type: 'catalog_grid',
        title: 'All TV Series',
        items: [
          {
            id: 'show-1',
            item_id: 'show-10',
            title: 'Better Call Saul',
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockClient = new ApiClient('http://localhost:8492');
  });

  it('fetches home screen layout on initial mount and renders widgets', async () => {
    const fetchSpy = vi
      .spyOn(screensApi, 'fetchScreenLayout')
      .mockResolvedValue(mockHomeLayout);

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
        />
      </FocusProvider>
    );

    // Initial loading indicator
    expect(screen.getByText(/Loading home.../i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
      expect(screen.getByText('Popular Right Now')).toBeInTheDocument();
      expect(screen.getByText('Top TV Show')).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledWith(mockClient, 'home');
  });

  it('supports initialTab prop to load movies directly', async () => {
    const fetchSpy = vi
      .spyOn(screensApi, 'fetchScreenLayout')
      .mockResolvedValue(mockMoviesLayout);

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          initialTab="movies"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.getByText(/Loading movies.../i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Feature Films')).toBeInTheDocument();
      expect(screen.getByText('Interstellar')).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledWith(mockClient, 'movies');
  });

  it('renders sidebar navigation items: Home, Movies, Shows, Profiles', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue(mockHomeLayout);

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.getByText('KADR')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Movies')).toBeInTheDocument();
    expect(screen.getByText('Shows')).toBeInTheDocument();
    expect(screen.getByText('Profiles')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
    });
  });

  it('switches tabs to Movies and Shows when sidebar buttons are activated', async () => {
    const fetchSpy = vi
      .spyOn(screensApi, 'fetchScreenLayout')
      .mockImplementation((_client, screenId) => {
        if (screenId === 'home') return Promise.resolve(mockHomeLayout);
        if (screenId === 'movies') return Promise.resolve(mockMoviesLayout);
        if (screenId === 'shows') return Promise.resolve(mockShowsLayout);
        return Promise.reject(new Error('Unknown screen'));
      });

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
    });

    // Click on Movies
    fireEvent.click(screen.getByText('Movies'));

    await waitFor(() => {
      expect(screen.getByText('Feature Films')).toBeInTheDocument();
      expect(screen.getByText('Interstellar')).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledWith(mockClient, 'movies');

    // Click on Shows
    fireEvent.click(screen.getByText('Shows'));

    await waitFor(() => {
      expect(screen.getByText('All TV Series')).toBeInTheDocument();
      expect(screen.getByText('Better Call Saul')).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledWith(mockClient, 'shows');
  });

  it('calls onSwitchProfile when Profiles button is clicked', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue(mockHomeLayout);
    const onSwitchProfile = vi.fn();

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={onSwitchProfile}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Profiles'));
    expect(onSwitchProfile).toHaveBeenCalledTimes(1);
  });

  it('displays error message when screen layout fetch fails', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockRejectedValue(
      new Error('Network error')
    );

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load screen layout.')).toBeInTheDocument();
    });
  });

  it('delegates onSelectItem and onPlayItem from widgets to parent callbacks', async () => {
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue(mockHomeLayout);
    const onSelectItem = vi.fn();
    const onPlayItem = vi.fn();

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={onSelectItem}
          onPlayItem={onPlayItem}
          onSwitchProfile={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
    });

    // Play button in Hero
    fireEvent.click(screen.getByText('Play'));
    expect(onPlayItem).toHaveBeenCalledWith('movie-1', undefined);

    // Click on TV card
    fireEvent.click(screen.getByText('Top TV Show'));
    expect(onSelectItem).toHaveBeenCalledWith('show-1');
  });

  it('cancels outdated fetch requests when switching tabs quickly', async () => {
    let resolveMovies: (value: ScreenLayout) => void;
    const moviesPromise = new Promise<ScreenLayout>((resolve) => {
      resolveMovies = resolve;
    });

    vi.spyOn(screensApi, 'fetchScreenLayout').mockImplementation((_client, screenId) => {
      if (screenId === 'home') return Promise.resolve(mockHomeLayout);
      if (screenId === 'movies') return moviesPromise;
      if (screenId === 'shows') return Promise.resolve(mockShowsLayout);
      return Promise.reject(new Error('Unknown'));
    });

    render(
      <FocusProvider>
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Home Featured Movie')).toBeInTheDocument();
    });

    // Switch to Movies (pending)
    fireEvent.click(screen.getByText('Movies'));

    // Switch immediately to Shows (resolves fast)
    fireEvent.click(screen.getByText('Shows'));

    await waitFor(() => {
      expect(screen.getByText('All TV Series')).toBeInTheDocument();
    });

    // Now resolve the stale Movies promise
    resolveMovies!(mockMoviesLayout);

    // Should stay on Shows, not be overwritten by Movies
    expect(screen.getByText('All TV Series')).toBeInTheDocument();
    expect(screen.queryByText('Feature Films')).not.toBeInTheDocument();
  });
});
